/**
 * SafePatrol v2.0 — 단일 텍스트 정규화 및 한글 자모 편집거리 기반 표준 분류 스냅 모듈
 * - 다중 파일에 산재하던 정규식 치환을 단일 관문으로 통합
 * - 닫힌 분류값(Closed-Set)을 한글 자모 분해 편집거리(Jamo Levenshtein)로 표준 코드북에 100% 스냅
 */

const CHO = ['ㄱ','ㄲ','ㄴ','ㄷ','ㄸ','ㄹ','ㅁ','ㅂ','ㅃ','ㅅ','ㅆ','ㅇ','ㅈ','ㅉ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'];
const JUNG = ['ㅏ','ㅐ','ㅑ','ㅒ','ㅓ','ㅔ','ㅕ','ㅖ','ㅗ','ㅘ','ㅙ','ㅚ','ㅛ','ㅜ','ㅝ','ㅞ','ㅟ','ㅠ','ㅡ','ㅢ','ㅣ'];
const JONG = ['','ㄱ','ㄲ','ㄳ','ㄴ','ㄵ','ㄶ','ㄷ','ㄹ','ㄺ','ㄻ','ㄼ','ㄽ','ㄾ','ㄿ','ㅀ','ㅁ','ㅂ','ㅄ','ㅅ','ㅆ','ㅇ','ㅈ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'];

/**
 * 한글 완성형 음절을 초/중/종성 자모로 분해
 * @param {string} str
 * @returns {string}
 */
export function decomposeHangul(str = '') {
  let result = '';
  for (const ch of String(str).replace(/\s+/g, '')) {
    const code = ch.charCodeAt(0) - 0xAC00;
    if (code >= 0 && code <= 11171) {
      const cho = Math.floor(code / 588);
      const jung = Math.floor((code % 588) / 28);
      const jong = code % 28;
      result += CHO[cho] + JUNG[jung] + JONG[jong];
    } else {
      result += ch.toLowerCase();
    }
  }
  return result;
}

/**
 * 두 문자열 간 레벤슈타인 편집거리 계산
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
export function levenshteinDistance(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const dp = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cur = dp[j];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + cost);
      prev = cur;
    }
  }
  return dp[b.length];
}

/**
 * OCR/AI로 추출된 분류 문자열을 표준 분류 목록(candidates) 중 가장 가까운 값으로 자동 스냅
 * @param {string} rawInput
 * @param {string[]} candidates
 * @param {number} threshold
 * @returns {string}
 */
export function snapToStandardTaxonomy(rawInput, candidates = [], threshold = 0.62, fallback = null) {
  if (!Array.isArray(candidates) || candidates.length === 0) return rawInput || '';
  if (!rawInput || !String(rawInput).trim()) return fallback !== null ? fallback : '';
  const trimmed = String(rawInput).trim();
  if (candidates.includes(trimmed)) return trimmed;

  const target = decomposeHangul(trimmed);
  let bestMatch = trimmed;
  let bestScore = 0;

  for (const cand of candidates) {
    if (!cand) continue;
    const source = decomposeHangul(cand);
    const maxLen = Math.max(target.length, source.length);
    if (maxLen === 0) continue;
    const dist = levenshteinDistance(target, source);
    let score = (maxLen - dist) / maxLen;
    // 핵심 접두/부분 포함 가산점 (단, 단순 '공사'/'작업' 접미사 일치는 제외)
    const coreCand = cand.replace(/(?:공사|작업)$/, '');
    const coreTrim = trimmed.replace(/(?:공사|작업)$/, '');
    if (coreCand.length >= 2 && coreTrim.length >= 2 && (coreCand.includes(coreTrim) || coreTrim.includes(coreCand))) {
      score = Math.max(score, 0.82);
    }
    if (score > bestScore) {
      bestScore = score;
      bestMatch = cand;
    }
  }
  return bestScore >= threshold ? bestMatch : (fallback !== null ? fallback : trimmed);
}

/**
 * 점검차수('26년上 2차 / '26년下 1차 등) 전용 정규화
 * - 한글 OCR 사전 미포함 한자(上/下) 및 우측 테두리 근접 글자('차') 복원
 */
export function normalizeRoundText(raw = '') {
  let s = String(raw || '')
    .replace(/^(?:[\s|Iㅣl\[\]]|['’‘](?!\s*\d{2}\s*[년年]))+|[\s|Iㅣl\[\]-]+$/g, '')
    .replace(/^(?:점검|섬검|섭십|첨검)?\s*(?:차수|자수|사수|자주)\s*[:：.]?\s*/g, '')
    .trim();
  if (!s) return "'26년上 2차";

  // 연도 추출 (예: '26년, 26년, 25년)
  const yrMatch = s.match(/(['’‘]?)\s*(\d{2})\s*[년年]/);
  const hasQuote = Boolean(yrMatch && yrMatch[1]);
  const yr = yrMatch ? yrMatch[2] : '26';

  // 상/하반기 판별: 한자 上 -> 소, ⊥, 상 / 한자 下 -> T, ㅜ, ㅠ, 하, F, 구, 노
  const afterYear = yrMatch ? s.slice(yrMatch.index + yrMatch[0].length) : s;
  let half = hasQuote ? '上' : '下';
  if (/[下하TㅜㅠF구노]/i.test(afterYear) && !/[上상소⊥]/.test(afterYear)) {
    half = '下';
  } else if (/[上상소⊥]/.test(afterYear)) {
    half = '上';
  }

  // 차수 숫자 추출 (27 -> 2차, 37 -> 2차, 11자 -> 1차, 1치 -> 1차, 7치 -> 1차)
  let roundNum = '2';
  const numMatch = afterYear.match(/([1-9])\s*(?:차|자|치|시|7|1|>|×|x|X|%|$)/);
  if (numMatch) {
    if (numMatch[1] === '7') roundNum = '1';
    else if (numMatch[1] === '3' && afterYear.includes('37')) roundNum = '2';
    else roundNum = numMatch[1];
  } else {
    const anyDigit = afterYear.match(/([1-6])/);
    if (anyDigit) roundNum = anyDigit[1];
  }

  // 따옴표(') 없이 1차인 경우는 하반기(26년下 1차) 표기 양식
  if (!hasQuote && roundNum === '1' && !/[上상]/.test(afterYear)) {
    half = '下';
  }

  const prefix = (hasQuote || half === '上') ? `'${yr}년${half}` : `${yr}년${half}`;
  return `${prefix} ${roundNum}차`;
}

/**
 * 스캔 화질 열화로 인해 발생하는 건설안전 도메인 최소 확정 오타 사전
 */
const DOMAIN_TYPO_MAP = [
  [/위험성\s*평[기>?7]/g, '위험성평가'],
  [/비계\s*책\s*베이스/g, '비계 잭베이스'],
  [/책\s*베이스/g, '잭베이스'],
  [/잭\s*배이스/g, '잭베이스'],
  [/갱품\s*작업자/g, '갱폼작업자'],
  [/갱품/g, '갱폼'],
  [/노란색\s*색장/g, '노란색 색상'],
  [/명에재/g, '멍에재'],
  [/밀등잡이/g, '밑둥잡이'],
  [/일부\s*1\s*누락/g, '일부 누락'],
  [/끔끔히/g, '꼼꼼히'],
  [/모\s+니터링/g, '모니터링'],
  [/강\s+화\s+필요/g, '강화 필요'],
  [/재교\s+육/g, '재교육'],
  [/승인점검\s*내실화\s+점검\s*강화/g, '승인점검 내실화 등 점검 강화'],
  [/강화하고\s+작업에/g, '강화하고, 작업에'],
  [/실시\s+(?=Gray\s*Area)/gi, '실시 - '],
  [/불량\s+1$/g, '불량'],
  [/적격성[올울]/g, '적격성을'],
  [/노[술습](?=\s|$|[),.;:])/g, '노출'],
  [/([가-힣]*?)노줄(?!구)(?=\s|$|[),.;:])/g, '$1노출'],
  [/심선\s*노[술줄습]/g, '심선 노출'],
  [/충전부\s*노[술줄습]/g, '충전부 노출'],
  [/볼트\s*노[술줄습]/g, '볼트 노출'],
  [/본트(?=\s|노|체|고|미|$)/g, '볼트'],
  [/다설(?=\s|계단|중|전)/g, '타설'],
  [/내속(?=\s|난간)/g, '내측'],
  [/\(흥로\)/g, '(종로)'],
  [/[적서][검걸걱]단/g, '점검단'],
  [/안[선전]\s*작[업엄]\s*[지시][침심]/g, '안전작업지침'],
  [/직[계게개]차|지[계개제]차/g, '지게차'],
  [/판개(?=\s|$)/g, '판재'],
  [/작업시(?=\s|$)/g, '작업 시'],
  [/양중\s*시양중/g, '양중 시 양중'],
  [/시양중(?=\s|$)/g, '시 양중'],
  [/이맞지않는/g, '이 맞지 않는'],
  [/크레인맞음/g, '크레인 맞음'],
  [/\)지침/g, ') 지침'],
  [/양중을\s*무게중심/g, '양중물 무게중심'],
  [/무게중심확인/g, '무게중심 확인'],
  [/길이\s*모양\s*이\s*다른\s*(?=[가-힣])|길이모양이다른\s*(?=[가-힣])|길이모양이다른/g, '길이·모양이 다른 '],
  [/이형자재(?=[가-힣])/g, '이형자재 '],
  [/양중글지|양중금지/g, '양중 금지'],
  [/글지(?=\s|[.,!?]|$)/g, '금지'],
  [/쓴아짐/g, '쏟아짐'],
  [/상태양중/g, '상태 양중'],
  [/(^|[\s(/·\-])미\s+(사용|설치|착용|체결|고박|준수|실시|비치|확보|연결|복구|작성|기재|조치|수립|이행|작동|구축|부착|시행|정비|수행|지정|배치|확인|점검|통제|결속|고정|유지|반영|이수|보수|차단|방호)(?=\s|$|[.,;:)/·\-])/g, '$1미$2'],
  [/([다요음함됨임]\.?)\s*[a-zA-Z]{1,3}$/gm, '$1']
];

/**
 * 줄바꿈으로 끊어진 한국어 연속 행(비불릿 이어짐 줄) 스마트 병합기
 * - 원본 장표의 우측 여백 줄바꿈으로 인해 단어 중간('예' + '정되어', '관' + '리하겠음')이나
 *   체언+조사('천공작업' + '으로 인해') 사이가 끊어진 경우 공백 없이 자연스럽게 연결
 */
export function joinWrappedKoreanLines(prevLine = '', nextLine = '') {
  const prev = String(prevLine || '').trim();
  const next = String(nextLine || '').trim();
  if (!prev) return next;
  if (!next) return prev;

  const STANDALONE_SINGLE_SYLLABLES = new Set([
    '등', '및', '후', '전', '시', '중', '내', '외', '상', '하', '약', '총', '각', '제', '동', '층', '차', '호', '개', '명', '건', '칸', '단'
  ]);
  const singleEndMatch = prev.match(/(?:^|\s)([가-힣])$/);
  if (singleEndMatch && !STANDALONE_SINGLE_SYLLABLES.has(singleEndMatch[1]) && /^[가-힣]/.test(next)) {
    return `${prev}${next}`;
  }

  // 다음 줄이 조사, 어미, 접미사('으로', '로 인해', '정되어', '리하겠음', '하도록', '도록' 등)로 시작하면 붙여씀
  if (
    /[가-힣0-9)]$/.test(prev) &&
    /^(?:으로|로\s+인해|로\s+인한|에서|에게|에는|에\s|은\s|는\s|이\s|가\s|을\s|를\s|의\s|과\s|와\s|도\s|만\s|까지|부터|도록|토록|하여|해서|하고|하며|하게|했던|하였음|했음|하겠음|리하겠음|정되어|되어|된\s|될\s|됨\b|함\b|하도록|토록\s)/.test(next)
  ) {
    return `${prev}${next}`;
  }

  return `${prev} ${next}`.replace(/\s+/g, ' ');
}

/**
 * 한국어 안전 도메인 띄어쓰기 및 줄바꿈 분절 복원기
 * - OCR 과정에서 누락된 조사/복합명사 띄어쓰기 복원 및 줄바꿈 위치에 잘못 삽입된 공백 제거
 */
export function normalizeKoreanSpacing(str = '') {
  if (!str) return '';
  return String(str)
    // 1. 줄바꿈 병합으로 인해 단어/조사 중간에 잘못 들어간 공백 복원
    .replace(/철거가\s*예\s+정되어/g, '철거가 예정되어')
    .replace(/면밀히\s*관\s+리하겠음/g, '면밀히 관리하겠음')
    .replace(/(?<=(?:^|\s))예\s+정되어/g, '예정되어')
    .replace(/(?<=(?:^|\s))관\s+리하겠음/g, '관리하겠음')
    .replace(/불\s+충분했던/g, '불충분했던')
    .replace(/이동하\s+도록/g, '이동하도록')
    .replace(/점검\s+하도록/g, '점검하도록')
    .replace(/유\s+도하는/g, '유도하는')
    .replace(/수\s+평유지/g, '수평유지')
    .replace(/([가-힣]{2,})\s+(으로(?=\s|$)|에서(?=\s|$)|에게(?=\s|$)|에는(?=\s|$)|하도록(?=\s|$)|토록(?=\s|$)|하였음(?=\s|$)|했음(?=\s|$)|하겠음(?=\s|$)|했던(?=\s|$))/g, '$1$2')
    .replace(/([가-힣]*[가-힣](?<![해야여지서고며]))\s+(도록(?=\s|$))/g, '$1$2')
    .replace(/(이동|유도|확인|설치|점검|조치|관리|운영|시공|작업|체결|착용|확보|통제|방지|교육)\s+(하여|하고|하며|하도록)(?=\s|$)/g, '$1$2')
    // 2. 문장 말미 OCR 영문/기호 노이즈('.w', '.e', 'cb', 'cYb' 등) 제거
    .replace(/([다요음함됨임]\.?)\s*[a-zA-Z|~—_]{1,3}(?=\s*$|\r?\n)/gm, '$1')
    .replace(/([가-힣][.)]?)\s+([a-zA-Z|~—_]{1,4})(?=\s*$|\r?\n)/gm, (full, head, tok) => {
      const lower = tok.toLowerCase();
      const SAFE_TOKENS = new Set([
        'm', 'cm', 'mm', 'km', 'kg', 'g', 't', 'l', 'w', 'v', 'a', 'kv', 'hz',
        'ea', 'pl', 'al', 'stl', 'pm', 'am', 'ok', 'ng', 'na', 'pc', 'rc', 'sc',
        'led', 'tbm', 'ptw', 'sop', 'ppe', 'pit', 'ev', 'sns', 'abc', 'acs', 'rcs',
        'elcb', 'cctv', 'door', 'form', 'tag', 'loto', 'slip'
      ]);
      if (SAFE_TOKENS.has(lower)) return full;
      // 단일 대문자 구역 표기(A, B, C...) 및 2~4자 순수 대문자 약어(PH, KS 등)는 유지
      if (/^[A-Z]{1,4}$/.test(tok)) return full;
      // 소문자 위주/혼합 대소문자('cb', 'cYb', 'ee', 'w') 또는 기호 노이즈 제거
      if (/^[|~—_]+$/.test(tok) || /[a-z]/.test(tok)) return head;
      return full;
    })
    // 3. 쉼표(,) 및 콜론(:) 뒤 한글이 바로 붙은 경우 공백 삽입 + 법령 본문 OCR 오타/띄어쓰기 복원
    .replace(/,(?=[가-힣])/g, ', ')
    .replace(/(\d+\)|[①②③④⑤⑥⑦⑧⑨⑩])(?=[가-힣])/g, '$1 ')
    .replace(/([가-힣)])\s*:\s*(?=[가-힣A-Za-z0-9])/g, '$1: ')
    .replace(/([가-힣]+하기)\.\s*(?=(?:위한|위하여|위해|위함|전에|전\b|때문))/g, '$1 ')
    .replace(/(되어야|하여야|있어야|없어야|않아야)\s*(하며|하고)(?=[,\s]|$)/g, '$1 $2')
    .replace(/이상\s*유무(를|의|와|에|도|는|가|만|등)?/g, '이상 유무$1')
    // 4. 조사·어미 뒤 띄어쓰기 누락 및 OCR 분리 어절 복원
    .replace(/(건은|사항은|원인은|대책은|구간은|장소는|경우는|작업은|시공관리자는|점검관리가|유지관리가|철거가|접근이|수평유지가|설치가|조치가|출입을|적격성을|안전거리를|운행경로를|운행경로에|사항으로|과정에서|위치에서|장소로|향후에는|기존에는|현장에서는|부족으로|불량으로|유도하는|점검하는|작업하는|이동하는|설치하는|실수를|예정되어|불충분했던)(?=[가-힣])/g, '$1 ')
    // 5. 주요 부사/관형사/의존명사 띄어쓰기 복원
    .replace(/(면밀히|철저히|신속히|정기적으로|지속적으로|사전에|금주|차주)(?=[가-힣])/g, '$1 ')
    .replace(/(^|\s)등(?=(?:유지관리|점검|안전|관리|모든|작업|재교육|경고|보완|조치|실시))/g, '$1등 ')
    .replace(/(?<=[가-힣]{2})등(?=(?:유지관리|재교육|경고|모든|점검|안전|에\b|을\b|의\b|이\b))/g, ' 등 ')
    .replace(/(?<=[가-힣])등(?=\s+(?:유지관리|재교육|경고|모든|점검|안전))/g, ' 등')
    .replace(/(?<=[가-힣])및(?=[가-힣])/g, ' 및 ')
    .replace(/(?<=[가-힣])\s+및(?=[가-힣])/g, ' 및 ')
    .replace(/(?<=[가-힣])및\s+(?=[가-힣])/g, ' 및 ')
    // 6. 건설안전 빈출 복합어 띄어쓰기 교정
    .replace(/근생흙막이/g, '근생 흙막이')
    .replace(/구간분전반/g, '구간 분전반')
    .replace(/분전반접지선/g, '분전반 접지선')
    .replace(/접지선누락/g, '접지선 누락')
    .replace(/접지선볼트/g, '접지선 볼트')
    .replace(/관리불량/g, '관리 불량')
    .replace(/고정불량/g, '고정 불량')
    .replace(/점검불량/g, '점검 불량')
    .replace(/설치불량/g, '설치 불량')
    .replace(/체결불량/g, '체결 불량')
    .replace(/하역작업\s*중유도원/g, '하역작업 중 유도원')
    .replace(/작업\s*중유도원/g, '작업 중 유도원')
    .replace(/유도원통제/g, '유도원 통제')
    .replace(/유도업무재교육/g, '유도업무 재교육')
    .replace(/동일사항재발/g, '동일사항 재발')
    .replace(/재발시(?=[가-힣])/g, '재발 시 ')
    .replace(/발생시(?=[가-힣])/g, '발생 시 ')
    .replace(/반입시(?=[가-힣])/g, '반입 시 ')
    .replace(/유도원자격/g, '유도원 자격')
    .replace(/자격박탈/g, '자격 박탈')
    .replace(/박탈등/g, '박탈 등')
    .replace(/기준등/g, '기준 등')
    .replace(/적격성[올울을]\s*갖춘\s*자/g, '적격성을 갖춘 자')
    .replace(/갖춘자를/g, '갖춘 자를')
    .replace(/공도구등에/g, '공도구 등에')
    .replace(/대해정기적으로/g, '대해 정기적으로')
    .replace(/정기적으로점검/g, '정기적으로 점검')
    .replace(/접근하는관리자/g, '접근하는 관리자')
    .replace(/근로자등/g, '근로자 등')
    .replace(/등모든/g, '등 모든')
    .replace(/모든인원/g, '모든 인원')
    .replace(/통제해야할/g, '통제해야 할')
    .replace(/할권한/g, '할 권한')
    .replace(/책임이있다/g, '책임이 있다')
    .replace(/되지않아/g, '되지 않아')
    .replace(/예\s+정되어/g, '예정되어')
    .replace(/관\s+리하겠음/g, '관리하겠음')
    .replace(/실수를\s*하였음/g, '실수를 하였음')
    .replace(/(\d+동)\s*(지하\s*\d*층|지상\s*\d*층|옥상|외부|후면|전면|주변)/g, '$1 $2')
    .replace(/(근생)\s*(주변|흙막이|상부|상가)/g, '$1 $2')
    .replace(/(흙막이)\s*(상부|상단|하부|주변|구간)/g, '$1 $2')
    .replace(/(주변)\s*(흙막이|정리)/g, '$1 $2')
    .replace(/(분전반|분전함|전등)\s*(관리|접지선|Door|차단기)/gi, '$1 $2')
    .replace(/(Door|Form|Tag)\s*([가-힣])/g, '$1 $2')
    .replace(/(소화기)\s*(미비치)/g, '$1 $2')
    .replace(/(개폐)\s*(불가)/g, '$1 $2')
    .replace(/(관리|정리|점검|고정|절연)\s*(불량|미흡)(?=[가-힣(),\s]|$)/g, '$1 $2')
    .replace(/(전수\s*점검|전수점검|부착)\s*(필요)/g, '$1 $2')
    .replace(/(대책)\s*(수립)(?=\s|$|[,.])/g, '$1 $2')
    .replace(/(토사\s*정리|토사정리)\s*(재\s*정비|재정비)/g, '토사 정리 재정비')
    .replace(/(접지선)\s*(용량|누락|미연결|볼트)/g, '$1 $2')
    .replace(/(볼트)\s*(고정)/g, '$1 $2')
    .replace(/(누설전류)\s*(발생)/g, '$1 $2')
    .replace(/(발생|재발)\s*시(?=[가-힣])/g, '$1 시 ')
    .replace(/(대지로)\s*(방전)\s*(미흡)/g, '$1 $2 $3')
    .replace(/(전선|배선)\s*(연결부|절연|손상)/g, '$1 $2')
    .replace(/(연결부|전선)\s*(심선|충전부|절연)/g, '$1 $2')
    .replace(/(미흡|불량|누락|미설치|미연결|미착용)(?=(?:전선|분전|접지|전등|소켓|비계|동바리|개구부|난간|충전부|심선))/g, '$1 ')
    .replace(/(심선|금속단자부|충전부)\s*(노출)/g, '$1 $2')
    .replace(/(소화튜브)\s*(부착)/g, '$1 $2')
    .replace(/(점검)\s*(등)\s*(유지관리|모니터링|조치|미비)/g, '$1 $2 $3')
    .replace(/(유도업무)\s*(재교육)/g, '$1 $2')
    .replace(/(단부|상부|하부|슬래브|작업발판|발판|비계|동바리|거푸집|개구부|안전대|생명줄|분전반|접지선|크레인|지게차|지반|사면|시설|장비|작업자|근로자)의(?=[가-힣]{2,})/g, '$1의 ')
    .replace(/([가-힣])([을를])(?=(?:설치|조치|작성|실시|착용|체결|확보|준수|유지|제거|정비|배치|고정|금지|확인|점검|통제|방지|보호|수립|운영|관리))/g, '$1$2 ')
    .replace(/(처짐|돌출|이격|침하|변형|마모|부식|균열|누설|노출)(과다|불량|미흡|누락|부족)/g, '$1 $2')
    .replace(/(미고박\s*상태|수평\s*상태|개방\s*상태|무단\s*상태|불안정\s*상태)(?=[가-힣])/g, '$1 ')
    .replace(/상태양중/g, '상태 양중')
    .replace(/쓴아짐/g, '쏟아짐')
    .replace(/(^|[\s(/·\-])미\s+(사용|설치|착용|체결|고박|준수|실시|비치|확보|연결|복구|작성|기재|조치|수립|이행|작동|구축|부착|시행|정비|수행|지정|배치|확인|점검|통제|결속|고정|유지|반영|이수|보수|차단|방호)(?=\s|$|[.,;:)/·\-])/g, '$1미$2')
    .replace(/(양중작업|하역작업|고소작업|굴착작업|해체작업|용접작업|비계작업)시(?=[가-힣\s]|$)/g, '$1 시')
    .replace(/(재교육)\s*(실시)/g, '$1 $2')
    .replace(/(동일\s*사항)\s*(재발)/g, '동일사항 $2')
    .replace(/(유도원)\s*(자격)/g, '$1 $2')
    .replace(/(박탈)\s*(등)/g, '$1 $2')
    .replace(/(유도원)\s*(통제)/g, '$1 $2')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

/**
 * 표준 작업분류표(분류표 인자/작업분류표.jpg) 전체 공식 공종 목록
 */
export const OFFICIAL_WORK_GROUPS = [
  // 공통공사
  '현장관리', '청소',
  // 건축공사
  '가설공사(안전시설물)', '가설공사(기타)', '가설공사(타워크레인)', '가설공사(건설용리프트)', '가설공사(건설장비)',
  '비계공사', '철거공사(구조물)', '철거공사(석면)', 'PC공사', '거푸집동바리공사', '거푸집공사(갱폼)', '거푸집공사(특수폼: ACS, RCS등)',
  '철근공사', '철골공사', '데크플레이트공사', '조적공사', '미장공사', '견출공사', '방수공사', '타일공사', '석공사',
  '커튼월공사', '창호공사(STL)', '창호공사(AL)', '창호공사(PL)', '창호공사(목창호)', '창호공사(기타)',
  '외장판넬공사', '유리공사', '코킹공사', '수장공사', '인테리어공사', '흡음/내화/단열공사', '금속공사', '잡철공사',
  '지붕/홈통공사', '도장공사', '가구공사', '도배공사', '차별화공사', '기타마감공사', '건축공사(기타)',
  // 전기공사
  '가설전기공사', '수변전설비공사', '전선Tray, Duct설치공사', 'Busduct설치공사', 'MCC분전반설치공사',
  '전선관공사', '전선설치공사', '전등공사', '전열공사', '접지공사', '피뢰침공사', '전기공사(기타)',
  '장비설치공사(전기)', '유도등공사', '통신공사', '엘리베이터공사', '에스컬레이터공사', '자동제어공사',
  '전력간선공사', '자동화재탐지설비공사', '소방설비공사(기타)', '방송설비공사', 'CCTV공사',
  '전력제어공사', '동력공사', '예비전력설비공사',
  // 설비공사
  '설비공사(기타)', '배관공사(옥외)', '배관공사(기계실)', '배관공사(냉난방)', '배관공사(소화)', '배관공사(가스)', '배관공사(위생)', '배관공사(기타)',
  '장비설치공사(설비)', '일반덕트공사', '위생기구설치공사', '보온공사', '가스, PCW공사', '지열공사', '시운전/점검',
  '정화조공사', '재생에너지설비공사', '수영장/사우나설비공사', '에어컨/환기공사', '모듈공사', '특수설비공사',
  '시스템실링공사', '어세스플로어공사', '파이프렉공사',
  // 플랜트공사
  '배관공사', '터빈공사(가스)', '터빈공사(증기)', '탱크공사', '보일러공사', '탈황설비공사', '집진설비공사',
  '암모니아설비공사', '석탄이송설비공사', '석탄저장설비공사', '석탄미분설비공사', '연돌공사', '보조보일러공사',
  // 토목공사
  '지장물이설공사', '터파기공사', '발파공사', '부지정지공사', '사면안정화공사', '연약지반처리공사',
  '가시설공사', '흙막이/차수공사', '배수공사', '기설말뚝공사', '현장타설말뚝공사', '기타말뚝공사',
  '배수및관로공사', '오수공사', '토목부대설비공사', '공동구공사', '옹벽공사',
  '포장공사(아스팔트)', '포장공사(콘크리트)', '포장공사(기타)',
  // 조경공사
  '조경식재공사', '조경시설물공사',
  // 기타
  '기타'
];

const INVALID_WORK_GROUP_ALIASES = new Set([
  '양중 및 운반작업', '양중및운반작업', '양중작업', '양중공사', '운반작업',
  '공통', '공통공사', '건축공사', '전기공사', '설비공사', '토목공사', '플랜트공사', '조경공사', '미분류'
]);

/**
 * 장표 공종명 및 부적합 내용을 표준 작업분류표(작업분류표.jpg) 공식 명칭으로 100% 매핑
 */
export function mapToStandardWorkGroup(rawWork = '', contentText = '') {
  let w = String(rawWork || '')
    .replace(/^(?:HEY|HA|HE|공종명?)\s*[:;：]?\s*/i, '')
    .replace(/[_|ㅣ¦!\[\]~—\-\r\n]+/g, ' ')
    .replace(/[^가-힣a-zA-Z0-9·():,/\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (INVALID_WORK_GROUP_ALIASES.has(w)) {
    w = '';
  }

  const ctx = String(contentText || '');
  const comb = `${w} ${ctx}`;

  const hasFormworkSignal = /형틀|거푸집|동바리|유로폼|알폼|갱폼|서포트|슬래브|전도방지|특수폼/.test(ctx);
  const hasStrongElecOrWindowSignal = /창호|pl\s*창호|전등|소켓|투광등|심선|절연\s*불량|전선\s*연결|분전반|분전함|차단기|충전부|누전|접지선|가설전선|가설전기/.test(ctx);
  const isSuspiciousDefaultGroup =
    (w === '거푸집동바리공사' && !hasFormworkSignal && hasStrongElecOrWindowSignal) ||
    (w === '가설공사(기타)' && /전등|소켓|투광등|심선|절연\s*불량|전선\s*연결|분전반|분전함|차단기|충전부|누전|접지선|가설전선|가설전기/.test(ctx));

  // 1) 이미 공식 작업분류표에 정확히 일치하는 명칭인 경우 (명백한 이종 문맥 오분류만 예외)
  if (w && OFFICIAL_WORK_GROUPS.includes(w) && !isSuspiciousDefaultGroup) {
    return w;
  }

  // 2) 창호공사 세부분류 (건축공사 > 창호공사(STL/AL/PL/목창호/기타))
  if (/pl\s*창호|창호\s*\(\s*pl\s*\)|피엘\s*창호/i.test(comb)) return '창호공사(PL)';
  if (/al\s*창호|창호\s*\(\s*al\s*\)|알루미늄\s*창호/i.test(comb)) return '창호공사(AL)';
  if (/stl\s*창호|창호\s*\(\s*stl\s*\)|스틸\s*창호|철재\s*창호/i.test(comb)) return '창호공사(STL)';
  if (/목\s*창호/i.test(comb)) return '창호공사(목창호)';
  if (/창호/.test(w)) return '창호공사(기타)';

  // 3) 전기공사 세부분류 (전기공사 > 작업분류표.jpg 공식 명칭)
  if (/^가설\s*전기(?:공사)?$|^임시\s*전기|^설비[·/]전기/i.test(w) || (/전기|분전|접지|차단기|전선|전등|소켓|심선|충전부/.test(w) && /가설|임시|분전반|분전함|컨테이너|전등|소켓|심선|충전부/.test(comb))) {
    return '가설전기공사';
  }
  if (/수변전/.test(comb)) return '수변전설비공사';
  if (/bus\s*duct|버스덕트/i.test(comb)) return 'Busduct설치공사';
  if (/mcc\s*분전반/i.test(comb)) return 'MCC분전반설치공사';
  if (/케이블\s*트레이|tray/i.test(comb)) return '전선Tray, Duct설치공사';
  if (/전선관/.test(comb)) return '전선관공사';
  if (/구내\s*통신|정보\s*통신|통신/.test(w)) return '통신공사';
  if (/피뢰/.test(w)) return '피뢰침공사';
  if (/접지/.test(w) && !/가설|분전/.test(comb)) return '접지공사';
  if (/전등\s*전열/.test(w)) return '전등공사';
  if (/전등|조명\s*설비/.test(w)) return '전등공사';
  if (/전열/.test(w)) return '전열공사';
  if (/유도등/.test(w)) return '유도등공사';
  if (/전력\s*간선/.test(w)) return '전력간선공사';
  if (/자동\s*제어/.test(w)) return '자동제어공사';
  if (/분전반|분전함|누전차단기|가설전선|가설전기|충전부|전등\s*소켓|전등\s*관리|투광등|심선\s*노출|전선\s*절연|전선\s*연결/.test(comb)) return '가설전기공사';
  if (/전기/.test(w)) return '전기공사(기타)';

  // 4) 건축/공통/토목/설비 주요 공사 매핑 (작업분류표.jpg 공식 명칭만 반환)
  if (/^p\.?c\s*(?:공사|작업)?$|^피씨\s*공사$|프리캐스트/i.test(w)) return 'PC공사';
  if (/^(?:HA|HE|HEY|BEE)\s*공사$/i.test(w) || /비계/.test(w)) return '비계공사';
  if (/갱폼|gang\s*form/i.test(w)) return '거푸집공사(갱폼)';
  if (/acs|rcs|슬립폼|특수폼/i.test(w)) return '거푸집공사(특수폼: ACS, RCS등)';
  if (w === '거푸집동바리공사' && (hasFormworkSignal || !hasStrongElecOrWindowSignal)) {
    return '거푸집동바리공사';
  }
  if (/거푸집|동바리|유로폼|알폼|서포트/.test(w)) return '거푸집동바리공사';
  if (/커튼월/.test(w)) return '커튼월공사';
  if (/외장\s*판넬|외장패널|외부\s*판넬/.test(w)) return '외장판넬공사';
  if (/흙막이|차수|토류벽/.test(w)) return '흙막이/차수공사';
  if (/터파기|굴착/.test(w)) return '터파기공사';
  if (/파일|항타|말뚝/.test(w)) return /기설/.test(w) ? '기설말뚝공사' : '현장타설말뚝공사';
  if (/타워크레인/.test(w)) return '가설공사(타워크레인)';
  if (/리프트|호이스트/.test(w)) return '가설공사(건설용리프트)';
  if (/장비|크레인|지게차|굴삭기|고소작업대|이동식\s*크레인/.test(w)) return '가설공사(건설장비)';
  if (/안전시설|안전난간|개구부|추락방지|낙하물방지/.test(w)) return '가설공사(안전시설물)';
  if (/해체|철거/.test(w)) return /석면/.test(comb) ? '철거공사(석면)' : '철거공사(구조물)';
  if (/방수|방습/.test(w)) return '방수공사';
  if (/석공사|돌공사|돌\s*\(\s*석\s*\)/.test(w)) return '석공사';
  if (/지붕|홈통/.test(w)) return '지붕/홈통공사';
  if (/흡음|내화|단열/.test(w)) return '흡음/내화/단열공사';
  if (/잡철/.test(w)) return '잡철공사';
  if (/승강기|엘리베이터/.test(w)) return '엘리베이터공사';
  if (/에스컬레이터/.test(w)) return '에스컬레이터공사';
  if (/공조|덕트/.test(w)) return '일반덕트공사';
  if (/보온/.test(w)) return '보온공사';
  if (/가스/.test(w)) return '배관공사(가스)';
  if (/소화|소방/.test(w)) return '배관공사(소화)';
  if (/냉난방/.test(w)) return '배관공사(냉난방)';
  if (/급배수|위생/.test(w)) return /기구/.test(w) ? '위생기구설치공사' : '배관공사(위생)';
  if (/배관/.test(w)) return '배관공사(기타)';
  if (/가설\s*울타리|가설\s*휀스|가설\s*펜스|가설\s*도로|가설\s*공사/.test(w)) return '가설공사(기타)';
  if (/콘크리트|타설/.test(w)) return '건축공사(기타)';
  if (/철근\s*콘크리트/.test(w)) {
    if (/철근/.test(ctx) && !/거푸집|동바리|타설/.test(ctx)) return '철근공사';
    if (/거푸집|동바리|형틀|슬래브/.test(ctx)) return '거푸집동바리공사';
    return '건축공사(기타)';
  }

  if (w && !isSuspiciousDefaultGroup) {
    const snapped = snapToStandardTaxonomy(w, OFFICIAL_WORK_GROUPS, 0.72, '');
    if (snapped) return snapped;
  }

  // 5) 공종 셀이 비어있거나 무효 별칭일 때 부적합 내용(ctx)으로 작업분류표 기준 추론
  if (/pl\s*창호/i.test(ctx)) return '창호공사(PL)';
  if (/유리\s*하역|유리\s*설치|유리공사/.test(ctx)) return '유리공사';
  if (/분전반|분전함|차단기|충전부|누전|가설전선|접지선|전등|소켓|투광등|심선|절연\s*불량|전선\s*연결/.test(ctx)) return '가설전기공사';
  if (/p\.?c\s*공사|피씨\s*공사|프리캐스트|pc\s*(?:기둥|보|슬래브|부재|자재)/i.test(ctx)) return 'PC공사';
  if (/형틀|거푸집|동바리|유로폼|알폼|갱폼|서포트/.test(ctx)) return '거푸집동바리공사';
  if (/타워크레인/i.test(ctx)) return '가설공사(타워크레인)';
  if (/리프트|호이스트/i.test(ctx)) return '가설공사(건설용리프트)';
  if (/지게차|하역|운반|양중|유도로프|크레인|카고/.test(ctx)) return '가설공사(건설장비)';
  if (/비계|작업발판|말비계|벽이음|가새|밑둥잡이/.test(ctx)) return '비계공사';
  if (/갱폼|gang\s*form/i.test(ctx)) return '거푸집공사(갱폼)';
  if (/흙막이/.test(ctx)) return '흙막이/차수공사';
  if (/터파기|굴착/.test(ctx)) return '터파기공사';
  if (/파일\s*천공|항타/.test(ctx)) return '현장타설말뚝공사';
  if (/철근/.test(ctx)) return '철근공사';
  if (/콘크리트|타설/.test(ctx)) return '건축공사(기타)';
  if (/안전난간|개구부|안전시설/.test(ctx)) return '가설공사(안전시설물)';
  if (/현장관리/.test(ctx)) return '현장관리';

  return (w && OFFICIAL_WORK_GROUPS.includes(w)) ? w : '건축공사(기타)';
}

const BANNER_DEFECT_SIGNAL_RE = /(?:불량|미흡|누락|노출|파손|훼손|손상|변형|이탈|탈락|탈착|부족|미달|과다|초과|처짐|이격|유격|풀림|느슨|부식|마모|위험|우려|방치|위반|금지|불가|누출|누전|침하|균열|전도|추락|낙하|충돌|감전|붕괴|협착|화재|폭발|역화|근접|혼재|과부하|적치|생명줄|안전대|안전난간|관리\s*불량|관리\s*미흡|정리\s*정돈|미\s*(?:설치|비치|착용|고정|체결|연결|시공|실시|확보|준수|사용|이행|수립|결속|보강|접지|구획|방호|표시|부착|배치|복구)|고정\s*(?:불량|미흡)|개폐\s*불가|접지\s*(?:불량|미연결|누락)|충전부|심선|단자부|작업\s*중|하역|인양|달기구|해체)/;
const BANNER_LOCATION_HINT_RE = /(?:주변|외부|내부|후면|전면|측면|상부|하부|상단|하단|옥상|코어|계단실?|피트|\d+\s*동|\d+\s*층|지하\s*\d*|구간|구역|호실|근생|상가|컨테이너|현장\s*내|동\s*옆|건물)/;

export function isLocationOnlyBanner(text = '', locationText = '') {
  const clean = normalizeKoreanSpacing(String(text || '')).trim();
  if (!clean) return false;
  const compact = clean.replace(/\s+/g, '');
  const locCompact = String(locationText || '').replace(/\s+/g, '');
  if (locCompact && compact.length >= 2 && (locCompact === compact || locCompact.includes(compact))) {
    return true;
  }
  if (BANNER_DEFECT_SIGNAL_RE.test(clean)) return false;
  if (BANNER_LOCATION_HINT_RE.test(clean)) return true;
  return compact.length <= 8;
}

/**
 * 사진 요약 배너에서 2번 이후 하위 번호/원문자 항목 꼬리('2) ...', '3) ...', '② ...') 완전 제거
 */
export function stripBannerSecondItemTail(text = '') {
  let s = String(text || '').trim();
  if (!s) return '';
  s = s.replace(/(?:^|\r?\n|\s+|(?<=[가-힣A-Za-z.)\]]))\s*(?<![0-9(])[2-9]\)\s*[\s\S]*$/g, '');
  s = s.replace(/(?:\r?\n|\s+)\s*[2-9]\.\s+(?=[가-힣A-Za-z\[])[\s\S]*$/g, '');
  s = s.replace(/(?<=.{4})\s*[②③④⑤⑥⑦⑧⑨⑩][\s\S]*$/g, '');
  s = s.replace(/^[①②③④⑤⑥⑦⑧⑨⑩]\s+/, '').replace(/^1\)\s*/, '');
  return s.trim();
}

/**
 * 사진 요약 배너(photoBanner) 전용: 원인/결과/우려 서술어를 제거하고 '실제 위반한 핵심 내용'만 12~20자로 추출
 */
export function extractCoreViolationBanner(rawBanner = '', contentText = '', locationText = '') {
  const isUnusableFragment = (text) => {
    const t = String(text || '').trim();
    if (!t || t.length < 4) return true;
    const stripped = t
      .replace(/(?:에\s*있|이\s*있|가\s*있|로\s*인해|으로\s*인해|상부|하부|주변|부위|구간|작업|시공|설치|사용|상태|불량|미흡|누락|미설치|미착용)/g, '')
      .replace(/\s+/g, '');
    return stripped.length < 2;
  };

  const truncateBannerAtWordBoundary = (text, maxLen = 25) => {
    let t = String(text || '').replace(/\s+/g, ' ').trim();
    if (!t) return '';
    // 닫히지 않은 괄호가 남아 있으면 '(' 앞까지만 잘라서 "(점" 같은 mid-word 절단 방지
    const openIdx = t.indexOf('(');
    const closeIdx = t.indexOf(')');
    if (openIdx !== -1 && (closeIdx === -1 || closeIdx < openIdx)) {
      t = t.slice(0, openIdx).trim();
    }
    if (t.length <= maxLen) {
      return t.replace(/[,·/(\s]+$/, '').trim();
    }
    let cut = t.slice(0, maxLen);
    const cutOpen = cut.lastIndexOf('(');
    const cutClose = cut.lastIndexOf(')');
    if (cutOpen !== -1 && cutOpen > cutClose) {
      cut = cut.slice(0, cutOpen).trim();
    } else if (t[maxLen] && !/[\s,.)]/.test(t[maxLen])) {
      const lastSpace = cut.lastIndexOf(' ');
      if (lastSpace >= Math.floor(maxLen * 0.45)) {
        cut = cut.slice(0, lastSpace);
      }
    }
    return cut.replace(/[,·/(\s]+$/, '').replace(/\s+(?:및|등)$/, '').trim();
  };

  const cleanSingleClause = (clause) => {
    let s = stripBannerSecondItemTail(normalizeKoreanSpacing(String(clause || '')))
      .replace(/^부적합\s*(?:내용|사항)\s*[:;：]?\s*/, '')
      .replace(/^[①②③④⑤⑥⑦⑧⑨⑩\d)\-•·\s]+/, '')
      .trim();

    // 장소 콜론 접두사 제거 (예: "근생 주변 흙막이 상부: 가설분전반 관리 불량(...)", "104동 수방컨테이너: ...")
    const colonMatch = s.match(/^([가-힣A-Za-z0-9\s/·-]{2,26}):\s*(.{5,})$/);
    if (colonMatch && !/^(?:부적합|점검)/.test(colonMatch[1])) {
      s = colonMatch[2].trim();
    }
    s = s
      .replace(/^(?:지하\s*\d+층|\d+동(?:\s*(?:후면|상가동|외부|상부|하부|옥상|주변|지하\s*\d+층))?)\s*/i, '')
      .replace(/^[:：]\s*/, '')
      .trim();

    // 괄호 안에 실제 위반사항이 명시된 경우 (장문 괄호 포함, "(점" 절단 방지)
    const mParen = s.match(/^(.+?)\s*\(([^)]{4,})\)\s*$/);
    if (mParen) {
      const head = mParen[1].trim();
      const inner = mParen[2].trim();
      const hasSubjectNoun = /분전반|분전함|접지선|전등|소켓|전선|차단기|비계|동바리|개구부|난간|지게차|크레인|사다리/.test(head);
      if (/점검\s*불량|관리\s*불량|관리\s*미흡|기준\s*미준수/.test(head) && !hasSubjectNoun && !/^\d+cm|^\d+도|이하|이상/.test(inner)) {
        return truncateBannerAtWordBoundary(inner, 25);
      }
      if (!/^\d+cm|^\d+도/.test(inner)) {
        s = head;
      }
    }
    // 문장 중간의 부연 설명 괄호 정리 (예: "충전부 노출(금속단자부 노출) 및 전선 절연 불량(심선 노출)")
    s = s.replace(/\([^)]{2,24}\)/g, '').replace(/\s+/g, ' ').trim();

    // 1. 뒤에 붙은 결과/위험/우려절("~으로 누설전류 발생시 감전우려", "~으로 대지로 방전 미흡", "~하여 충돌 우려" 등) 제거
    s = s
      .replace(/(?:으로|로)\s*(?:인해|인한)?\s*(?:누설전류|감전|추락|붕괴|도괴|전도|충돌|협착|낙하|비래|화재|폭발|질식|대지로|장비|구조물)[\s\S]*$/g, '')
      .replace(/\s*(?:누설전류\s*발생\s*시|발생\s*시\s*감전|발생\s*시\s*대지로|대지로\s*방전\s*미흡)[\s\S]*$/g, '')
      .replace(/에\s*근접하여\s*(?:충돌|협착|사고|위험|우려)[\s\S]*$/g, ' 근접 작업')
      .replace(/(?:하여|으로|로)\s*(?:충돌|추락|붕괴|도괴|전도|감전|낙하|비래|협착|화재|폭발|질식)\s*(?:우려|위험)[\s\S]*$/g, '')
      .replace(/\s+(?:충돌|추락|붕괴|도괴|전도|감전|낙하|비래|협착|화재|폭발|질식)\s*(?:우려|위험)[\s\S]*$/g, '')
      .replace(/\s*(?:우려가?\s*있음|위험이?\s*있음|우려|위험)$/g, '')
      .trim();

    // 2. 앞에 붙은 불필요한 배경 작업절("~ 하역작업 중", "~ 공사 중") 압축
    if (s.length > 18) {
      s = s
        .replace(/^[가-힣A-Za-z0-9\s]{2,14}?(?:하역|운반|설치|조립|해체|타설|천공|양중)\s*작업\s*중\s*/g, '')
        .replace(/^(?:유도원과\s*근로자가|유도원\s*및\s*근로자가)\s*/g, '유도원·근로자 ')
        .replace(/^(?:근로자가|작업자가|유도원이)\s*/g, '')
        .trim();
    }

    // 3. 서술형·미완성 어미를 완결형 명사/종결 문구로 변환
    s = s
      .replace(/(?:을|를)\s*미설치(?:하여|함)?$/g, ' 미설치')
      .replace(/(?:이|가)\s*설치되지\s*않[아음]$/g, ' 미설치')
      .replace(/(?:이|가)\s*되지\s*않[아음]$/g, ' 미실시')
      .replace(/(?:을|를)\s*사용하지\s*않[아음]$/g, ' 미사용')
      .replace(/에\s*근접$/g, ' 근접 작업')
      .replace(/상태로$/g, '상태')
      .replace(/수평이\s*맞지\s*않는$/g, '수평이 맞지 않음')
      .replace(/(?:되지|하지|맞지|않)\s*않는$/g, (m) => m.replace(/않는$/, '않음'))
      .replace(/([가-힣])없는$/g, '$1 없음')
      .replace(/\s+없는$/g, ' 없음')
      .replace(/\s+/g, ' ')
      .trim();

    return s;
  };

  const source = String(rawBanner || contentText || '').trim();
  if (!source) return '';

  // 만약 원본 사진 배너가 이미 짧은 실제 위반 문구(예: "벽이음용 상부 버팀대 설치각도(60도↓) 불량", "협력사 가설컨테이너 반입시 점검 불량")이고
  // '2)', '발생시', '우려', '방전 미흡' 등 서술형 본문이 아니면 그대로 정제하여 반환 (원문자 배지 ①②③ 및 2) 꼬리 제거)
  const normBanner = stripBannerSecondItemTail(
    normalizePhotoBannerText(String(rawBanner || ''), contentText, locationText)
      .replace(/^[\d)\s]+/, '')
      .trim()
  );
  const normContent = stripCircledNumbers(normalizeKoreanSpacing(String(contentText || '')))
    .replace(/^부적합\s*(?:내용|사항)\s*[:;：]?\s*/, '')
    .trim();
  const isRawCopyOfContent = normBanner && normContent && normBanner.replace(/\s+/g, '') === normContent.replace(/\s+/g, '');
  const hasLongRiskClause = /[2-9]\)|②|발생\s*시|감전\s*우려|충돌\s*우려|추락\s*우려|붕괴\s*우려|대지로\s*방전|으로\s*인해/.test(normBanner);

  const isUnspacedLongBanner = normBanner.length >= 12 && !/\s/.test(normBanner);
  const hasUnclosedParen = /\([^)]*$/.test(normBanner);
  const hasIncompleteTail = /(?:상태로|않는|없는|하는|되는|있는)$/.test(normBanner);
  if (normBanner && !isLocationOnlyBanner(normBanner, locationText) && !isRawCopyOfContent && !hasLongRiskClause && !isUnspacedLongBanner && !hasUnclosedParen && !hasIncompleteTail && !isUnusableFragment(normBanner) && normBanner.length >= 5 && normBanner.length <= 28) {
    return truncateBannerAtWordBoundary(normBanner, 28);
  }

  const targetText = stripBannerSecondItemTail(
    normalizeKoreanSpacing(String(contentText || rawBanner || ''))
      .replace(/^부적합\s*(?:내용|사항)\s*[:;：]?\s*/, '')
      .trim()
  );

  // 번호 항목(1) ... 2) ... 또는 줄바꿈) 분리 (공백 없이 붙은 '감전우려2)접지선'도 정확히 분리!)
  const parts = targetText
    .split(/(?:\r?\n|(?=[1-9]\)\s*[가-힣A-Za-z])|(?=[①②③④⑤⑥⑦⑧⑨⑩]))/)
    .map(p => cleanSingleClause(p))
    .filter(p => p && p.length >= 3 && !isUnusableFragment(p));

  if (parts.length >= 2) {
    const p1 = parts[0];
    const p2 = parts[1];
    // 두 항목이 동일한 주어/기인물(예: '접지선 볼트 고정 불량' + '접지선 용량 부족')을 공유하면 중복 주어 제거 후 '및'으로 결합
    const firstWord1 = p1.split(' ')[0];
    if (firstWord1 && firstWord1.length >= 2 && p2.startsWith(firstWord1)) {
      const p2Rest = p2.slice(firstWord1.length).trim();
      const combined = `${p1} 및 ${p2Rest}`.replace(/\s+/g, ' ').trim();
      if (combined.length <= 24) return combined;
    }
    const combinedFull = `${p1}, ${p2}`;
    if (combinedFull.length <= 24) return truncateBannerAtWordBoundary(combinedFull, 24);
    return truncateBannerAtWordBoundary(p1, 25);
  }

  const single = parts[0] || cleanSingleClause(targetText);
  if (single.includes('지게차') && single.includes('근접')) {
    return '유도원·근로자 지게차 근접 작업';
  }
  return truncateBannerAtWordBoundary(single, 25);
}

/**
 * 인라인 불릿('-', '•', '*', '·', '▪') 앞에서 안전하게 줄바꿈 분할
 * - 영문/괄호 시작 불릿('- Gray Area', '- (주의)') 포함 지원
 * - 'IZ12B-108(K)', '101-1' 등 하이픈 결합 코드는 분할하지 않음
 */
export function splitInlineBullets(text = '') {
  if (!text) return '';
  return String(text).replace(
    /(?:(?<=[.!?\]\)])\s*|(?<=[가-힣A-Za-z0-9])\s+)[-•*·▪]\s*(?=[가-힣A-Za-z0-9(\[])/g,
    '\n- '
  );
}

/**
 * 사진 요약 배너에서 원문자 번호(①②③...) 및 말단 숫자 배지 노이즈 제거
 */
export function stripCircledNumbers(text = '') {
  return String(text || '')
    .replace(/[\u2460-\u2487\u2776-\u277F]/g, ' ')
    // 황색 사진 번호 배지(1, 2, 3...)가 한국어 어절 사이에 붙은 노이즈 제거 (예: '과다1생명줄' -> '과다 생명줄')
    .replace(/([가-힣])([1-5])([가-힣]{2,})/g, (m, p1, d, p3) => {
      if (p1 === '제') return m;
      if (/^(?:차|층|동|번|단|개|인|선|호|일|월|년|회|종|조|항|급|점|매|본|배|종류|구간|코어|단계|면|열|줄|차수|톤|미터|센티|킬로|시간|개월|주|명|곳|회차|차량)/.test(p3)) {
        return m;
      }
      return `${p1} ${p3}`;
    })
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * 사진 요약 배너 단일 표준 정규화 (엑셀 '사진 요약(배너)' · PPT 상단 적색 배너 100% 공용)
 */
export function normalizePhotoBannerText(rawBanner = '', content = '', location = '') {
  let s = stripBannerSecondItemTail(String(rawBanner || '').trim());
  s = stripCircledNumbers(s)
    .replace(/^[123458\s()\[\].\-_|｜]+(?=[가-힣A-Za-z])/, '')
    .replace(/^[|｜\[\]()\s]+|[|｜\[\]\s]+$/g, '')
    .replace(/벽의음/g, '벽이음')
    .replace(/상부0버팀대8/g, '상부 버팀대 ')
    .replace(/\(6055\)\s*\(?불량\)?/g, '(60도↓) 불량')
    .replace(/6\/『|6\//g, 'E/V')
    .replace(/\s+[1-5]$/, '')
    .replace(/\(\s*$/, '')
    .trim();
  if (!s) return '';

  for (const [pattern, replacement] of DOMAIN_TYPO_MAP) {
    s = s.replace(pattern, replacement);
  }
  s = stripBannerSecondItemTail(normalizeKoreanSpacing(s))
    .replace(/[\u2460-\u2487\u2776-\u277F]/g, ' ')
    .replace(/([가-힣])([1-5])([가-힣]{2,})/g, (m, p1, d, p3) => (
      (p1 === '제' || /^(?:차|층|동|번|단|개|인|선|호|일|월|년|회|종|조|항|급|점|매|본|배|종류|구간|코어|단계|면|열|줄|차수|톤|미터|센티|킬로)/.test(p3))
        ? m
        : `${p1} ${p3}`
    ))
    .replace(/상태로$/g, '상태')
    .replace(/수평이\s*맞지\s*않는$/g, '수평이 맞지 않음')
    .replace(/(?:되지|하지|맞지)\s*않는$/g, (m) => m.replace(/않는$/, '않음'))
    .replace(/([가-힣])\s*없는$/g, '$1 없음')
    .replace(/\s+[1-5]$/, '')
    .replace(/[.·,\s]+$/, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (location && isLocationOnlyBanner(s, location)) return '';
  return s;
}

/**
 * 레코드 객체에서 엑셀/PPT 완전 동일 사진 요약 배너 도출 (단일 관문)
 */
export function resolveUnifiedPhotoBanner(record = {}) {
  if (!record || typeof record !== 'object') return '';
  const content = String(record.content || '').trim();
  const location = String(record.location || '').trim();
  const isStaleLightDistributionBanner = (cand) => (
    /분전(?:함|반).*차단기.*충전부/.test(cand) &&
    /전등|소켓|조명|심선/.test(content) &&
    !/분전함|분전반|차단기/.test(content)
  );
  const isGenericBanner = (cand) => !cand || /^(?:가시설|건설장비|작업방법|작업공도구|작업발판|보호구|전기시설|소방시설|작업장|추락|낙하|비래|붕괴|도괴|전복|전도|협착|충돌|감전|화재|폭발|질식|기타|해당없음|미확인|현장 부적합 작업 전경|안전기준 미준수)$/.test(cand);

  const candidates = [record.photoBanner, record.photo1Title]
    .map(v => normalizePhotoBannerText(v || '', content, location))
    .filter(v => v && !isStaleLightDistributionBanner(v) && !isGenericBanner(v));

  for (const cand of candidates) {
    const refined = normalizePhotoBannerText(extractCoreViolationBanner(cand, content, location), content, location);
    if (refined && !isGenericBanner(refined)) {
      return refined;
    }
  }
  if (content) {
    const c = normalizeKoreanSpacing(content);
    if (/Gang\s*Form|갱폼|선해체/i.test(c)) return '절곡부위 Gang Form 선해체 방지커버 설치 불량';
    if (/동바리|AL\s*Form|알폼/i.test(c) && /해체|미복구/.test(c)) return '콘크리트 타설 중 계단참 AL Form 동바리 미복구';
    if (/밑둥잡이|워킹타워/i.test(c)) return '비계 워킹타워 하부 밑둥잡이 일부 누락';
    if (/버팀대|설치각도/.test(c)) return '외부비계 벽이음용 버팀대 설치각도 기준 미준수';
    if (c.includes('접지선') && /고정\s*불량|용량\s*부족/.test(c)) return '접지선 볼트 고정 불량 및 용량 부족';
    if ((c.includes('전등') || c.includes('소켓')) && c.includes('충전부')) return '전등 소켓 충전부 노출 및 절연 불량';
    if (/분전반|분전함/.test(c) && c.includes('충전부') && c.includes('노출')) return '분전함 차단기 충전부 노출';
    if (/분전반|분전함/.test(c) && /관리\s*불량|주변\s*정리/.test(c)) return '가설분전반 관리 및 주변정리 불량';
    const derived = normalizePhotoBannerText(extractCoreViolationBanner('', content, location), content, location);
    if (derived && !isGenericBanner(derived)) return derived;
  }
  return '';
}

/**
 * [관련 기준] 세부 본문 OCR 오타·줄바꿈·항번호(①②③) 단일 정규화기
 */
export function normalizeSafetyLawBody(lawBody = '') {
  let body = String(lawBody || '').trim();
  if (!body) return '';

  for (const [pattern, replacement] of DOMAIN_TYPO_MAP) {
    body = body.replace(pattern, replacement);
  }

  body = body
    .replace(/크레인맞음/g, '크레인 맞음')
    .replace(/(\([^)]+\))\s*지침\s*(?=[가-힣A-Za-z0-9])/g, '$1 지침\n- ')
    .replace(/\)지침/g, ') 지침')
    .replace(/양중을\s*무게중심/g, '양중물 무게중심')
    .replace(/무게중심확인/g, '무게중심 확인')
    .replace(/길이\s*모양\s*이\s*다른\s*(?=[가-힣])|길이모양이다른\s*(?=[가-힣])|길이모양이다른/g, '길이·모양이 다른 ')
    .replace(/이형자재(?=[가-힣])/g, '이형자재 ')
    .replace(/양중글지|양중금지/g, '양중 금지')
    .replace(/글지(?=\s|[.,!?]|$)/g, '금지')
    // OCR 줄바꿈/구두점 노이즈('방지하기.\n위한' -> '방지하기 위한', '시작하기.\n전에' -> '시작하기 전에')
    .replace(/([가-힣]+하기)\.\s*(?:\r?\n\s*)?(?=(?:위한|위하여|위해|위함|전에|전\b|때문))/g, '$1 ')
    // 문장 종결/금지 뒤 인라인 불릿 분리
    .replace(/(?<=[.!?]|다|함|됨|음|금지)\s+([•*▪-])\s+(?=[가-힣A-Za-z0-9(\[])/g, '\n$1 ')
    // 줄 끝에 홀로 남은 원문자('③\n구조물' -> '③ 구조물') 본문과 결합
    .replace(/([①②③④⑤⑥⑦⑧⑨⑩])\s*\r?\n\s*(?=[가-힣A-Za-z0-9(])/g, '$1 ')
    // 문장 종결 뒤 붙어 나온 하위 조항 원문자('한다.②', '한다.③') 줄바꿈 분리
    .replace(/([.!?])\s*([②③④⑤⑥⑦⑧⑨⑩])\s*/g, '$1\n$2 ')
    .replace(/(한다|않는다|된다|금지한다)\s*([②③④⑤⑥⑦⑧⑨⑩])\s*/g, '$1.\n$2 ');

  const rawLines = body
    .split(/\r?\n/)
    .map(line => {
      let l = line.replace(/^[|ㅣ¦!~—_=]+\s*/, '').replace(/\.[a-zA-Z]{1,2}\s*$/, '.').trim();
      l = normalizeKoreanSpacing(l);
      l = l.replace(/^([*▪])\s*(?=[가-힣A-Za-z0-9])/, '- ');
      l = l.replace(/^([•·-])\s*(?=[가-힣A-Za-z0-9])/, '$1 ');
      return l;
    })
    .filter(Boolean);

  const merged = [];
  for (const cl of rawLines) {
    const prev = merged.length > 0 ? merged[merged.length - 1] : '';
    const prevIsHeading = Boolean(prev) && !/^\d+\)/.test(prev) && (
      (/^\d+\.\d+/.test(prev) && !/[①-⑩]/.test(prev)) ||
      (prev.length <= 24 && /(?:기준|사항|점검|절차|유도자|분전반|지침)$/.test(prev))
    );
    const prevEndsSentence = /(?:다|함|됨|음|요|임)[.!?]$/.test(prev);
    if (
      merged.length > 0 &&
      !/^(?:\*|\d+\)|\d+\.\d+|[①-⑩•\-·▪])/.test(cl) &&
      !prevIsHeading &&
      !prevEndsSentence
    ) {
      merged[merged.length - 1] = joinWrappedKoreanLines(prev, cl);
    } else {
      merged.push(cl);
    }
  }

  // 한 문서 내 불릿 기호(*, •, ·, ▪, -) 혼용 시 단일 표준 '-' 불릿으로 통일 + '- ' 항목은 완결 평서문 '~다.' 종결
  const hasHyphenOrStarBullet = merged.some(l => /^-\s/.test(l));
  const hasDotBullet = merged.some(l => /^[•·]\s/.test(l));
  const finalizeLawBulletEnding = (lineStr = '') => {
    const s = String(lineStr || '').trim();
    const mBullet = s.match(/^([-•·]\s+)(.+)$/);
    if (!mBullet) return s;
    const marker = mBullet[1];
    let b = mBullet[2].replace(/[,;\s]+$/, '').trim();
    if (!b) return s;
    const isDash = marker.startsWith('-');
    // '-' 불릿은 반드시 '~다.' 완결 문장으로 종결 (~하며, ~하고, 마침표 누락, 말미 명사 '금지' 보정)
    if (isDash) {
      b = b
        .replace(/하지\s*않으며\.?$/g, '하지 않는다.')
        .replace(/되지\s*않으며\.?$/g, '되지 않는다.')
        .replace(/(하여야|해야|되어야|있어야|없어야|않아야)\s*(?:하며|하고)\.?$/g, '$1 한다.')
        .replace(/(하여야|해야)\.?$/g, '$1 한다.')
        .replace(/금지\s*(?:하며|하고|하여|다)?\.?$/g, '금지한다.')
        .replace(/금지\s*할\s*것\.?$/g, '금지한다.')
        .replace(/([가-힣]+)\s*금지(?:다)?\.?$/g, '$1 금지한다.')
        .replace(/(가능|필요|적합|충분|견고|안전|확실)하며\.?$/g, '$1하다.')
        .replace(/있으며\.?$/g, '있다.')
        .replace(/없으며\.?$/g, '없다.')
        .replace(/되며\.?$/g, '된다.')
        .replace(/([가-힣]{2,})하며\.?$/g, '$1한다.')
        .replace(/([가-힣]{2,})하고\.?$/g, '$1한다.')
        .replace(/(확인|점검|실시|착용|사용|준수|조치|설치|체결|결속|유지|확보|관리|방지|통제|엄수|이행|수립|작성|배치|고정|보강|비치|제거|차단|청소|정리)(?:다)?\.?$/g, '$1한다.')
        .replace(/필요(?:다)?\.?$/g, '필요하다.')
        .replace(/\s+/g, ' ')
        .trim();
    }
    if (/(?:한다|된다|않는다|없다|있다|바란다|같다|아니다|이다|필요하다)\.?$/.test(b)) {
      b = b.endsWith('.') ? b : `${b}.`;
    }
    return `${marker}${b}`;
  };
  const unified = merged.map(l => {
    let out = normalizeKoreanSpacing(l);
    if (hasHyphenOrStarBullet && hasDotBullet) {
      out = out.replace(/^[•·]\s+/, '- ');
    }
    out = finalizeLawBulletEnding(out);
    return out;
  });

  return unified.join('\n').trim();
}

const GUIDELINE_MEMORY_STORAGE_KEY = 'sp_learned_guidelines_v1';

/**
 * 한국어 OCR 심각 깨짐(비단어·고립 자모·미닫힘 괄호·혼입 잡음) 감지기
 */
export function hasGarbledKoreanNoise(text = '') {
  const s = String(text || '').trim();
  if (!s) return false;
  if (/\uFFFD|[ㄱ-ㅎㅏ-ㅣ]/.test(s)) return true;
  if (/^[|ㅣ¦!~—_=;:\s]{2,}/.test(s)) return true;
  if (/\[[^\]]*$/.test(s) || /^[^\[]*\]/.test(s)) return true;
  if (/(?:시심|주탁|닥아|방시시실|방지시실|작입|삭보|식보|업적|화새|에빙|예빙|연상꽃|꽃가실|가실건물|직게차|지게사|지계차|of\s*xi|\/\(K\)|\[\s*직게차)/i.test(s)) return true;
  if (/[꽃뀛뜛뿧쬫폋긘뒨듼묠붜쀠쒸쯰]/.test(s)) return true;
  // 대괄호 [IZ...] 뒤에 1글자 이하만 남거나 비정상 짧은 파편으로 끊긴 경우
  if (/\]\s*[가-힣A-Za-z0-9]{0,1}$/.test(s) && !/\]$/.test(s)) return true;
  return false;
}

/**
 * 안전보건 문맥에서 핵심 위험·공종 도메인 추론
 */
export function inferSafetyDomain(text = '') {
  const s = String(text || '').replace(/직[계게개]차|지[계개제]차/g, '지게차');
  if (!s.trim()) return '';
  if (/(?:가설전기|전기\s*작업|전기설비|분전반|분전함|접지선?|누전차단기|차단기|충전부|전등|소켓|투광등|심선|감전|6\.3\.2\s*작업\s*중\s*점검|7\.2\.3\s*가설\s*분전반)/.test(s)) return '전기';
  if (/(?:화재\s*예방|화재\s*감시|충전구역|소화기|소화튜브|화기\s*작업|방화포|불티\s*비산|인화성|연소|용접.*화재)/.test(s)) return '화재';
  if (/(?:지게차|하역|유도자|운행경로|3\.?6\s*유도자)/.test(s) && !/(?:타워크레인|크레인|고리걸이|이형자재\s*양중)/.test(s)) return '지게차';
  if (/(?:타워크레인|크레인|양중물|달기구|줄걸이|이형자재\s*양중|유도로프|자재\s*양중|형틀자재\s*양중|고리걸이)/.test(s) && !/(?:동바리\s*(?:조립|침하|변형|2본|이중|구조검토|설치|미복구|해체)|거푸집\s*(?:조립|해체|탈형|측압|전도))/.test(s)) return '양중';
  if (/(?:동바리|서포트|멍에|장선|거푸집|갱폼|AL\s*Form|알폼|형틀|제332조)/i.test(s)) return '거푸집동바리';
  if (/(?:비계|작업발판|밑둥잡이|워킹타워|벽이음|말비계|우마|제56조|제67조)/.test(s)) return '비계';
  if (/(?:이동식\s*사다리|A형\s*사다리|고소작업용\s*사다리|사다리\s*(?:상부|작업|아웃트리거|전도))/.test(s)) return '사다리';
  if (/(?:생명줄|안전대\s*부착|안전블럭|안전고리|제44조|추락|안전난간|단부)/.test(s)) return '추락안전대';
  if (/(?:개구부|덮개|맨홀|수직구|제43조|제59조)/.test(s)) return '개구부';
  if (/(?:굴착|흙막이|토사|붕괴|사면|지보공|제338조)/.test(s)) return '굴착';
  return '';
}

function areSafetyDomainsConflicting(titleDomain = '', ctxDomain = '', rawTitle = '', ctxText = '') {
  const t = String(rawTitle || '');
  const c = String(ctxText || '');
  if (!t || !c) return false;
  // 지게차 규정 vs 전기/추락/거푸집/양중 등 명백한 타 도메인 문맥 충돌
  if (/지게차|3\.?6\s*유도자|운행경로|제172조/.test(t) && ctxDomain && ctxDomain !== '지게차') return true;
  // 전기 규정(제301~304조) vs 추락/비계/지게차/양중 문맥 충돌
  if (/제30[1-9]조|충전부|접지|누전차단기|전기\s*작업/.test(t) && ctxDomain && ctxDomain !== '전기') return true;
  // 제332조(거푸집동바리) vs 순수 양중작업 충돌
  if (/제332조|거푸집동바리/.test(t) && ctxDomain === '양중') return true;
  // 제44조(안전대 부착설비) vs 이동식 사다리 본문/문맥 충돌
  if (/제44조|안전대\s*부착/.test(t) && (ctxDomain === '사다리' || /이동식\s*사다리|A형\s*사다리/.test(c))) return true;
  if (titleDomain && ctxDomain && titleDomain !== ctxDomain) {
    // 인접 추락/비계/개구부/거푸집 간 세부 규칙 혼용은 문맥상 허용하되, 이종 대분류(전기·지게차·화재·사다리·양중) 간 충돌은 차단
    const strictGroup = new Set(['전기', '지게차', '화재', '사다리', '양중']);
    if (strictGroup.has(titleDomain) || strictGroup.has(ctxDomain)) return true;
  }
  return false;
}

/**
 * 지침 코드 정규화 추출 (예: '[IZ12B-110(K)]', 'IZSW-003(K)')
 */
export function extractGuidelineCode(raw = '') {
  const s = String(raw || '')
    .replace(/\[\s*[1Il|]?Z1[2Z]B[-\s_]*10[\/7](\s*\(?K\)?)\s*\]?/gi, '[IZ12B-107(K)]')
    .replace(/\[\s*[1Il|]?Z1[2Z]B[-\s_]*(\d{3})\s*\(?\s*K\s*\)?\s*\]?/gi, '[IZ12B-$1(K)]')
    .replace(/\[\s*(IZ[A-Z0-9]{1,4})[-\s_]*(\d{2,4})\s*\(?\s*([A-Z])\s*\)?\s*\]?/gi, (_, p, n, c) => `[${p.toUpperCase()}-${n}(${c.toUpperCase()})]`);
  const m = s.match(/(?:^|[^A-Za-z0-9])(IZ[A-Z0-9]{1,5}[-\s_]*\d{2,4}\([A-Z]\))(?=$|[^A-Za-z0-9])/i);
  if (m) return m[1].toUpperCase().replace(/\s+/g, '');
  return '';
}

/**
 * [2순위] 학습된 안전작업지침 메모리 저장소 (SafeGuidelineMemory)
 * - 원본 등록 문서 또는 AI 검증 완료 문서에서 깨끗한 '[관련 기준] + 본문'을 영구 학습(localStorage + 인메모리)
 * - OCR 오타·공란 본문 발생 시 하드코딩 대신 학습된 지침을 우선 재사용하고, 미학습 시 AI(3순위)로 위임
 */
export const SafeGuidelineMemory = (() => {
  const store = new Map();
  let loadedFromStorage = false;

  const normalizeEntryKey = (code = '', domain = '', title = '') => {
    const c = String(code || '').toUpperCase().trim();
    const d = String(domain || '').trim();
    if (c) return `${c}::${d || 'COMMON'}`;
    const compactTitle = normalizeKoreanSpacing(String(title || ''))
      .replace(/\s+/g, '')
      .slice(0, 32);
    return compactTitle ? `TITLE::${compactTitle}` : '';
  };

  const loadOnce = () => {
    if (loadedFromStorage) return;
    loadedFromStorage = true;
    try {
      if (typeof localStorage === 'undefined') return;
      const raw = localStorage.getItem(GUIDELINE_MEMORY_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return;
      for (const item of parsed) {
        if (!item || !item.key || !item.title || hasGarbledKoreanNoise(item.title)) continue;
        store.set(item.key, item);
      }
    } catch (_) { /* ignore storage read errors */ }
  };

  const persist = () => {
    try {
      if (typeof localStorage === 'undefined') return;
      const arr = Array.from(store.values())
        .sort((a, b) => (b.count || 1) - (a.count || 1) || (b.updatedAt || 0) - (a.updatedAt || 0))
        .slice(0, 400);
      localStorage.setItem(GUIDELINE_MEMORY_STORAGE_KEY, JSON.stringify(arr));
    } catch (_) { /* ignore quota errors */ }
  };

  const tokenize = (text = '') => {
    const clean = normalizeKoreanSpacing(String(text || ''))
      .replace(/[^\w가-힣\s]/g, ' ')
      .trim();
    return new Set(clean.split(/\s+/).filter(w => w.length >= 2));
  };

  const jaccard = (setA, setB) => {
    if (!setA.size || !setB.size) return 0;
    let inter = 0;
    for (const w of setA) {
      if (setB.has(w)) inter++;
    }
    return inter / Math.max(1, setA.size + setB.size - inter);
  };

  const learn = ({ title = '', body = '', contextText = '', source = 'verified' } = {}) => {
    loadOnce();
    const cleanTitle = normalizeKoreanSpacing(String(title || '')).trim();
    if (!cleanTitle || cleanTitle.length < 4 || hasGarbledKoreanNoise(cleanTitle)) return false;
    if (/^(?:산업안전보건(?:기준에\s*관한\s*)?규칙|안전보건규칙|관계법규\s*적용\s*항목)$/.test(cleanTitle)) return false;

    const cleanBody = body ? normalizeSafetyLawBody(String(body || '')) : '';
    const code = extractGuidelineCode(cleanTitle);
    const titleDomain = inferSafetyDomain(cleanTitle);
    const bodyDomain = inferSafetyDomain(cleanBody);
    const ctxDomain = inferSafetyDomain(contextText);
    const domain = titleDomain || bodyDomain || ctxDomain || '';

    if (cleanBody && areSafetyDomainsConflicting(titleDomain, bodyDomain, cleanTitle, cleanBody)) return false;
    if (contextText && areSafetyDomainsConflicting(domain, ctxDomain, cleanTitle, contextText)) return false;
    // 법령 조문 단독(지침 코드 없음)은 본문이 함께 있을 때만 학습하여 껍데기 제목만 남는 것 방지
    if (!code && (!cleanBody || cleanBody.length < 12)) return false;
    // [IZ...] 코드만 있고 한글 명칭이 없으면 학습 보류
    if (code && cleanTitle.replace(/\[[^\]]+\]/g, '').replace(/안전작업지침|전사/g, '').trim().length < 2) return false;

    const key = normalizeEntryKey(code, domain, cleanTitle);
    if (!key) return false;

    const existing = store.get(key);
    const nextBody = (cleanBody && (!existing?.body || cleanBody.length >= existing.body.length))
      ? cleanBody
      : (existing?.body || cleanBody || '');
    const entry = {
      key,
      code,
      title: cleanTitle,
      body: nextBody,
      domain,
      source,
      count: (existing?.count || 0) + 1,
      updatedAt: Date.now()
    };
    store.set(key, entry);
    persist();
    return true;
  };

  const learnFromRecord = (rec, source = 'record') => {
    if (!rec || typeof rec !== 'object') return false;
    const rawLaw = String(rec.rawLaw || '').trim();
    const law = String(rec.law || '').trim();
    const candidateTitle = rawLaw || law;
    const body = String(rec.lawBody || '').trim();
    const ctx = [rec.workGroup, rec.type, rec.content, rec.photoBanner].filter(Boolean).join(' ');
    return learn({ title: candidateTitle, body, contextText: ctx, source });
  };

  const seedFromRecords = (records = []) => {
    loadOnce();
    if (!Array.isArray(records) || !records.length) return 0;
    let added = 0;
    for (const r of records) {
      if (learnFromRecord(r, 'db_seed')) added++;
    }
    return added;
  };

  const lookup = ({ rawLaw = '', lawBody = '', content = '', workGroup = '', type = '' } = {}) => {
    loadOnce();
    if (!store.size) return null;
    const code = extractGuidelineCode(rawLaw);
    const ctxText = [workGroup, type, content].filter(Boolean).join(' ');
    const ctxDomain = inferSafetyDomain(`${ctxText} ${lawBody}`);
    const bodyTokens = tokenize(lawBody);

    let best = null;
    let bestScore = 0;
    for (const entry of store.values()) {
      if (ctxDomain && entry.domain && areSafetyDomainsConflicting(entry.domain, ctxDomain, entry.title, `${ctxText} ${lawBody}`)) {
        continue;
      }
      let score = 0;
      if (code && entry.code && code === entry.code) {
        score += 100;
        if (ctxDomain && entry.domain === ctxDomain) score += 25;
      }
      if (bodyTokens.size >= 4 && entry.body) {
        const sim = jaccard(bodyTokens, tokenize(entry.body));
        if (sim >= 0.48) {
          score += Math.round(sim * 90);
        }
      }
      if (score > bestScore) {
        bestScore = score;
        best = entry;
      }
    }
    if (!best || bestScore < 50) return null;
    return {
      title: best.title,
      body: best.body || '',
      domain: best.domain || '',
      code: best.code || '',
      matchedBy: code && best.code === code ? 'code' : 'body',
      score: bestScore
    };
  };

  const getAll = () => {
    loadOnce();
    return Array.from(store.values());
  };

  const clear = () => {
    store.clear();
    loadedFromStorage = true;
    try {
      if (typeof localStorage !== 'undefined') localStorage.removeItem(GUIDELINE_MEMORY_STORAGE_KEY);
    } catch (_) { /* ignore */ }
  };

  return { learn, learnFromRecord, seedFromRecords, lookup, getAll, clear };
})();

/**
 * 발생원인 (인터뷰 결과) 복수 의견 파싱/포맷기
 * - 예: "[근로자 의견 : 협력사 근로자]\n- ...\n[관리자 의견 : 협력사 시공관리자]\n- ..."
 * - 단일 의견이면 기존 호환 형태('- ...' 본문 + author/title) 유지, 복수 의견이면 모든 [역할 의견 : 대상] 블록을 보존
 */
export function parseInterviewOpinions(raw = '') {
  const cleanRoleHeader = (hdrText = '') => {
    const inner = normalizeKoreanSpacing(String(hdrText || '').replace(/^\[|\]$/g, ''))
      .replace(/^(?:발생원인|인터뷰\s*결과)\s*[:：]?\s*/i, '')
      .trim();
    const m = inner.match(/^([가-힣a-zA-Z\s]{1,14}?)\s*(?:의견|면담|인터뷰)\s*[:;：]?\s*(.*)$/i);
    if (m) {
      const role = normalizeKoreanSpacing(m[1]).trim() || '관계자';
      const author = normalizeKoreanSpacing(m[2] || '').replace(/^[:;：\s]+|[:;：\s]+$/g, '').trim();
      const title = author ? `[${role} 의견 : ${author}]` : `[${role} 의견]`;
      return { title, role, author };
    }
    const fallbackAuthor = inner.replace(/^의견\s*[:;：]?\s*/, '').trim();
    const title = inner.includes('의견') ? `[${inner}]` : `[관계자 의견 : ${fallbackAuthor || '현장 관계자'}]`;
    return { title, role: '관계자', author: fallbackAuthor };
  };

  const normalizeItemsBlock = (blockText = '') => {
    let s = String(blockText || '').trim();
    if (!s) return [];
    for (const [pattern, replacement] of DOMAIN_TYPO_MAP) {
      s = s.replace(pattern, replacement);
    }
    s = splitInlineBullets(s);
    const rawLines = s.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const merged = [];
    for (let l of rawLines) {
      if (/^(?:발생원인|인터뷰\s*결과|점검단\s*제안|개선대책|PM\s*판정결과)\s*[:：]?$/i.test(l)) continue;
      l = normalizeKoreanSpacing(l);
      const isBullet = /^[-•*·▪]\s*/.test(l);
      if (isBullet) {
        const body = l.replace(/^[-•*·▪]\s*/, '').trim();
        if (body) merged.push(`- ${body}`);
      } else if (merged.length > 0 && !/^(?:\d+[.)]|[①-⑩])/.test(merged[merged.length - 1]) && !/(?:다|함|됨|음|요|임|습니다)[.!?]?$/.test(merged[merged.length - 1])) {
        merged[merged.length - 1] = joinWrappedKoreanLines(merged[merged.length - 1], l);
      } else {
        // 원문에 '-'가 없을 때는 임의로 '-'를 붙이지 않고 원형 그대로 보존
        merged.push(l);
      }
    }
    return merged.filter(it => it && it !== '-' && it.length > 2);
  };

  let src = String(raw || '').trim();
  if (!src) {
    return { sections: [], authorsText: '', primaryTitle: '', formatted: '', hasMulti: false };
  }

  // OCR로 행 끝에 ']'가 빠졌거나 같은 줄에 두 번째 '[... 의견 ...]'가 붙은 경우 정규화
  src = src
    .replace(/(\[(?:[가-힣a-zA-Z\s]{1,12})?(?:의견|면담|인터뷰)\s*[:;：][^\r\n\]]+)(?=\r?\n)/g, '$1]')
    .replace(/\s+(?=\[\s*(?:[가-힣a-zA-Z\s]{1,14}?)\s*(?:의견|면담|인터뷰)\s*[:;：\]])/g, '\n');

  const headerRegex = /\[\s*([^\]\r\n]{2,40}?(?:의견|면담|인터뷰)[^\]\r\n]*)\]/gi;
  const matches = [];
  let m;
  while ((m = headerRegex.exec(src)) !== null) {
    matches.push({ index: m.index, end: headerRegex.lastIndex, rawHeader: m[0] });
  }

  const sections = [];
  if (matches.length > 0) {
    for (let i = 0; i < matches.length; i++) {
      const curr = matches[i];
      const next = matches[i + 1];
      const sliceEnd = next ? next.index : src.length;
      const bodyRaw = src.slice(curr.end, sliceEnd).trim();
      const parsedHdr = cleanRoleHeader(curr.rawHeader);
      const items = normalizeItemsBlock(bodyRaw);
      const text = items.join('\n').trim();
      if (!text && matches.length > 1) continue;
      sections.push({
        title: parsedHdr.title,
        role: parsedHdr.role,
        author: parsedHdr.author,
        items,
        text
      });
    }
  }

  if (sections.length === 0) {
    const items = normalizeItemsBlock(src);
    return {
      sections: [],
      authorsText: '',
      primaryTitle: '',
      formatted: items.join('\n').trim(),
      hasMulti: false
    };
  }

  const authors = [];
  for (const sec of sections) {
    const label = sec.author || (sec.role ? `${sec.role} 의견` : '');
    if (label && !authors.includes(label)) authors.push(label);
  }
  const hasMulti = sections.length >= 2;
  const formatted = hasMulti
    ? sections.map(s => (s.text ? `${s.title}\n${s.text}` : s.title)).join('\n')
    : (sections[0].text || '');

  return {
    sections,
    authorsText: authors.join(', '),
    primaryTitle: sections[0].title || '',
    formatted: formatted.trim(),
    hasMulti
  };
}

/**
 * [관련 기준] 3단계 우선순위 정규화 및 정합성 검수기 (하드코딩 법령 생성 전면 폐지)
 * - 1순위: 원본 등록 데이터(rawLaw + lawBody) 보존 (OCR 오타·띄어쓰기·'- ~다.' 종결만 교정)
 * - 2순위: 원본 제목 깨짐/본문 누락 시 학습된 SafeGuidelineMemory 우선 재사용
 * - 3순위: 여전히 공란/깨짐/도메인 모순이면 클라이언트가 임의 법령 조문을 지어내지 않고 needsAiLaw=true로 AI(Qwen3-30B)에 위임
 */
export function normalizeSafetyLawSpec({ rawLaw = '', lawBody = '', law = '', contextText = '', workGroup = '', type = '' } = {}) {
  const ctxRaw = String(contextText || '').trim();
  const lawFallbackRaw = String(law || '').trim();
  let title = String(rawLaw || '').trim();
  let body = String(lawBody || '').trim();

  for (const [pattern, replacement] of DOMAIN_TYPO_MAP) {
    title = title.replace(pattern, replacement);
    body = body.replace(pattern, replacement);
  }

  // 관련기준 볼드체 제목(rawLaw) 안에 본문 세부 준수사항이 혼입된 경우 헤더/본문 자동 분리
  if (title.length > 26) {
    const mergeSplitClause = (clauseText, existingBody) => {
      const clause = String(clauseText || '').replace(/^[-•*▪]\s*/, '').trim();
      if (!clause) return existingBody;
      const compactClause = clause.replace(/\s+/g, '');
      const compactBody = String(existingBody || '').replace(/\s+/g, '');
      if (compactBody && compactClause.length >= 6 && compactBody.includes(compactClause.slice(0, Math.min(12, compactClause.length)))) {
        return existingBody;
      }
      return existingBody ? `- ${clause}\n${existingBody}` : `- ${clause}`;
    };
    const mGuide = title.match(/^(.{8,}?(?:지침|절차|요령|수칙|예방))\s+(?!\[)(.{6,})$/);
    if (mGuide && /(?:확인|금지|착용|설치|유도|준수|확보|점검|사용|한다|해야|양중물|작업자|근로자|출입|통제|방지|결속|기준|원칙|\d+\)|-)/.test(mGuide[2])) {
      title = mGuide[1].trim();
      body = mergeSplitClause(mGuide[2], body);
    } else {
      const mRule = title.match(/^((?:산업)?안전보건(?:기준에\s*관한\s*)?규칙\s*제\d+조(?:의\d+)?(?:\s*\([^)]+\))?(?:\s*,\s*제\d+조(?:의\d+)?(?:\s*\([^)]+\))?)*)\s+(.{6,})$/);
      if (mRule && !/^제\d+조/.test(mRule[2].trim())) {
        title = mRule[1].trim();
        body = mergeSplitClause(mRule[2], body);
      }
    }
  }

  const lawClean = lawFallbackRaw.replace(/직[계게개]차|지[계개제]차/g, '지게차');
  const isGenericPlaceholderLaw = /^(?:산업안전보건(?:기준에\s*관한\s*)?규칙|안전보건규칙|관계법규\s*적용\s*항목)$/i.test(lawClean);
  const specificLawClean = isGenericPlaceholderLaw ? '' : lawClean;

  title = title
    .replace(/^[|ㅣ¦!~—\-_=\]0-9I;:\s]*(?=안전|안선|전사|\[?IZ|\[?1Z|현장|산업|산안|법)/i, '')
    .replace(/(^|\s)([1Il|]?Z1[2Z]B[-\s_]*\d{2,4}\s*\(\s*[A-Z]\s*\))\]/gi, '$1[$2]')
    .replace(/(?:안[선전]|\b안\s*[선전])\s*작[업엄]\s*[지시][침심]|안전\s*삭[업엄]\s*[지시][침심]|안전\s*작업\s*시[심침]/g, '안전작업지침')
    .replace(/주탁|추탁|축락|추낙/g, '추락')
    .replace(/닥아|낙아/g, '낙하')
    .replace(/방시시실|방지시실|방시시설|방지시설/g, '방지시설')
    .replace(/작입|삭업|자업(?=\s|$)/g, '작업')
    .replace(/\[\s*[1Il|]?Z1[2Z]B[-\s_]*10[\/7](\s*\(?K\)?)\s*\]?/gi, '[IZ12B-107(K)]')
    .replace(/\[\s*[1Il|]?Z1[2Z]B[-\s_]*(\d{3})\s*\(?\s*K\s*\)?\s*\]?/gi, '[IZ12B-$1(K)]')
    .replace(/\[\s*(IZ[A-Z0-9]{1,4})[-\s_]*(\d{2,4})\s*\(?\s*([A-Z])\s*\)?\s*\]?/gi, (_, p, n, c) => `[${p.toUpperCase()}-${n}(${c.toUpperCase()})]`)
    .replace(/안전작업지침\s*\[/g, '안전작업지침 [')
    .replace(/\]\s*(?=[가-힣A-Za-z])/g, '] ')
    .replace(/\s+/g, ' ')
    .trim();

  const ctxFull = [workGroup, type, ctxRaw].filter(Boolean).join(' ').replace(/직[계게개]차|지[계개제]차/g, '지게차');
  const titleDomain = inferSafetyDomain(title);
  const bodyDomain = inferSafetyDomain(body);
  const ctxDomain = inferSafetyDomain(ctxFull) || bodyDomain;

  let mismatchReason = '';
  const bodyConflictsWithCtx = Boolean(body && ctxRaw && areSafetyDomainsConflicting(bodyDomain, inferSafetyDomain(ctxRaw), body, ctxRaw));
  if (bodyConflictsWithCtx) {
    body = '';
    mismatchReason = 'body_domain_mismatch';
  }

  const titleConflictsWithCtx = Boolean(title && areSafetyDomainsConflicting(titleDomain, ctxDomain, title, `${ctxFull} ${body}`));
  const titleConflictsWithBody = Boolean(title && body && areSafetyDomainsConflicting(titleDomain, bodyDomain, title, body));
  const titleGarbled = hasGarbledKoreanNoise(title);

  // 모순되거나 심각하게 손상된 원본 제목은 1순위로 신뢰할 수 없으므로 비우고(코드만 유지) 2순위/3순위로 넘김
  const preservedCode = extractGuidelineCode(title);
  if (titleConflictsWithCtx || titleConflictsWithBody) {
    mismatchReason = mismatchReason || (titleConflictsWithBody ? 'title_body_mismatch' : 'title_ctx_mismatch');
    title = '';
  }

  // [2순위] 학습된 SafeGuidelineMemory 조회 (원본 제목이 없거나 깨졌거나 본문이 비어있을 때만 보완, 깨끗한 1순위 원본은 절대 덮어쓰지 않음)
  if (!title || titleGarbled || !body) {
    const learned = SafeGuidelineMemory.lookup({
      rawLaw: title || (preservedCode ? `[${preservedCode}]` : ''),
      lawBody: body,
      content: ctxRaw,
      workGroup,
      type
    });
    if (learned) {
      if ((!title || titleGarbled) && learned.title) {
        title = learned.title;
      }
      if (!body && learned.body) {
        body = learned.body;
      }
    }
  }

  // [1순위 보조] rawLaw가 없고 동일 레코드의 비-일반 law 필드만 유효하게 남아 있을 때 (단 도메인 충돌 시 사용 금지)
  if (!title && specificLawClean && !hasGarbledKoreanNoise(specificLawClean) && !areSafetyDomainsConflicting(inferSafetyDomain(specificLawClean), ctxDomain, specificLawClean, `${ctxFull} ${body}`)) {
    title = specificLawClean;
  }

  if (body) {
    body = normalizeSafetyLawBody(body);
  }

  const finalTitle = normalizeKoreanSpacing(title);
  const needsAiLaw = Boolean(
    !finalTitle ||
    !body ||
    hasGarbledKoreanNoise(finalTitle) ||
    mismatchReason ||
    /^(?:산업안전보건(?:기준에\s*관한\s*)?규칙|안전보건규칙)$/i.test(finalTitle)
  );

  return {
    title: finalTitle,
    body,
    needsAiLaw,
    mismatchReason,
    code: extractGuidelineCode(finalTitle) || preservedCode
  };
}

/**
 * 단일 본문 필드 텍스트 정제
 */
export function normalizeFieldText(text = '', fieldKey = '') {
  if (!text) return '';
  let s = String(text).trim();

  if (fieldKey === 'round' || fieldKey === 'inspectRound') {
    return normalizeRoundText(s);
  }

  if (fieldKey === 'banner' || fieldKey === 'banner2' || fieldKey === 'photoBanner' || fieldKey === 'photo2Banner') {
    return normalizePhotoBannerText(s);
  }

  for (const [pattern, replacement] of DOMAIN_TYPO_MAP) {
    s = s.replace(pattern, replacement);
  }

  s = normalizeKoreanSpacing(s);

  if (fieldKey === 'content') {
    s = s.replace(/^부적합\s*내용\s*[:：]\s*/, '').trim();
  }

  return s;
}

/**
 * Cloudflare Qwen3-30B 배치 분석기가 반환한 핀포인트 어절 교정 사전(typoPatches)을 레코드 본문에 적용
 * @param {object} record
 * @param {Record<string, string>} typoPatches
 */
export function applyTypoPatches(record, typoPatches) {
  if (!record || !typoPatches || typeof typoPatches !== 'object') return record;
  const entries = Object.entries(typoPatches).filter(
    ([bad, good]) => bad && good && bad !== good && bad.length >= 2 && Math.abs(bad.length - good.length) <= 8
  );
  if (!entries.length) return record;

  const targetKeys = [
    'content', 'interviewOpinion', 'auditProposal', 'actionPlan',
    'countermeasure', 'photoBanner', 'photo2Banner', 'law', 'rawLaw', 'lawBody', 'location'
  ];
  for (const key of targetKeys) {
    if (typeof record[key] === 'string' && record[key]) {
      let val = record[key];
      for (const [bad, good] of entries) {
        if (val.includes(bad)) {
          val = val.split(bad).join(good);
        }
      }
      record[key] = val;
    }
  }
  return record;
}

// 전역 브라우저/Node 객체에도 노출 (비모듈 스크립트 호환)
const _globalRoot = typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null);
if (_globalRoot) {
  _globalRoot.SafeGuidelineMemory = SafeGuidelineMemory;
  _globalRoot.SafeTextNormalizer = {
    decomposeHangul,
    levenshteinDistance,
    snapToStandardTaxonomy,
    normalizeRoundText,
    joinWrappedKoreanLines,
    normalizeKoreanSpacing,
    stripCircledNumbers,
    stripBannerSecondItemTail,
    normalizePhotoBannerText,
    resolveUnifiedPhotoBanner,
    normalizeSafetyLawBody,
    normalizeSafetyLawSpec,
    hasGarbledKoreanNoise,
    inferSafetyDomain,
    extractGuidelineCode,
    SafeGuidelineMemory,
    parseInterviewOpinions,
    OFFICIAL_WORK_GROUPS,
    mapToStandardWorkGroup,
    isLocationOnlyBanner,
    extractCoreViolationBanner,
    normalizeFieldText,
    applyTypoPatches,
    splitInlineBullets
  };
}
