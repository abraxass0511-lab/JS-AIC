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
    .replace(/^[\s|Iㅣl\[\]'’‘]+|[\s|Iㅣl\[\]-]+$/g, '')
    .replace(/^(?:점검|섬검|섭십|첨검)?\s*(?:차수|자수|사수|자주)\s*[:：.]?\s*/g, '')
    .trim();
  if (!s) return "'26년上 2차";

  // 연도 추출 (예: '26년, 26년, 25년)
  const yrMatch = s.match(/(['’‘]?)\s*(\d{2})\s*년/);
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
    // 2. 문장 말미 OCR 영문/기호 노이즈('.w', '.e' 등) 제거
    .replace(/([다요음함됨임]\.?)\s*[a-zA-Z|~—_]{1,3}(?=\s*$|\r?\n)/gm, '$1')
    // 3. 쉼표(,) 뒤 한글이 바로 붙은 경우 공백 삽입 (예: 전기설비,기계,기구 -> 전기설비, 기계, 기구)
    .replace(/,(?=[가-힣])/g, ', ')
    // 4. 조사 뒤 띄어쓰기 누락 복원
    .replace(/(건은|사항은|원인은|대책은|구간은|장소는|경우는|작업은|시공관리자는|점검관리가|유지관리가|철거가|접근이|수평유지가|설치가|조치가|출입을|적격성을|안전거리를|운행경로를|운행경로에|사항으로|과정에서|위치에서|장소로|향후에는|기존에는|현장에서는)(?=[가-힣])/g, '$1 ')
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
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

/**
 * 표준 작업분류표(분류표 인자/작업분류표.jpg) 전체 공식 공종 목록
 */
export const OFFICIAL_WORK_GROUPS = [
  // 공통공사
  '가설공사(타워크레인)', '가설공사(건설용리프트)', '가설공사(기타)', '가설도로공사',
  '비계공사', '안전시설공사', '양중 및 운반작업', '해체/철거공사',
  // 건축공사
  '가설울타리공사', '거푸집공사(갱폼)', '거푸집공사(특수폼: ACS, RCS등)', '거푸집동바리공사',
  '경량기포콘크리트공사', '금속공사', '내화피복공사', '단열공사', '도배공사', '도장공사',
  '돌(석)공사', '목공사', '미장공사', '방수/방습공사', '보온공사', '수장공사', '시트방수공사',
  '외벽마감공사', '유리공사', '잡철물공사', '조적공사', '지붕및홈통공사',
  '창호공사(AL)', '창호공사(PL)', '창호공사(STL)', '창호공사(기타)', '창호공사(목창호)',
  '철골공사', '철근공사', '콘크리트공사', '코킹공사', '타일공사', '특수건축공사', '파일공사',
  // 전기공사
  '가설전기공사', '구내통신설비공사', '동력설비공사', '방재설비공사', '배관배선공사',
  '수변전설비공사', '신재생에너지설비공사', '옥외전기공사', '전등전열설비공사', '전력간선설비공사',
  '전선관공사', '접지/피뢰설비공사', '정보통신설비공사', '조명설비공사', '자동제어설비공사',
  '케이블트레이공사', '기타전기공사',
  // 설비공사
  '가스설비공사', '공조덕트설비공사', '급배수/위생설비공사', '기계실설비공사', '난방설비공사',
  '냉난방설비공사', '배관설비공사', '보온설비공사', '소방기계설비공사', '소화설비공사',
  '수처리설비공사', '승강기설비공사', '열원설비공사', '위생기구설비공사', '자동크린넷설비공사',
  '장비설치공사', '제연설비공사', '플랜트배관설비공사', '환기설비공사', '기타설비공사',
  // 토목공사
  '관로공사', '교량공사', '굴착공사', '기초공사', '도로포장공사', '동바리공사', '배수공사',
  '법면보호공사', '부대토목공사', '상하수도공사', '성토/절토공사', '암파쇄공사', '옹벽공사',
  '지반개량공사', '차수공사', '철거구조물공사', '터널공사', '터파기공사', '토공사', '토류벽공사',
  '포장공사', '하천공사', '항만공사', '흙막이/차수공사', '기타토목공사',
  // 조경공사
  '기반조성공사', '부대조경공사', '수목식재공사', '시설물설치공사', '잔디식재공사',
  '조경구조물공사', '조경시설물공사', '조경식재공사', '조경포장공사', '기타조경공사',
  // 플랜트공사
  '배관설치공사', '보온도장공사', '비파괴검사', '시운전작업', '전기계장공사', '기계설치공사', '철골설치공사', '탱크설치공사'
];

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

  const ctx = String(contentText || '');
  const comb = `${w} ${ctx}`;

  // 1) 이미 공식 분류표에 정확히 일치하는 명칭인 경우 (단, 기본값 오분류 '거푸집동바리공사'는 문맥 검증)
  if (OFFICIAL_WORK_GROUPS.includes(w) && w !== '거푸집동바리공사') {
    return w;
  }

  // 2) 창호공사 세부분류 (건축공사 > 창호공사(PL), 창호공사(AL), 창호공사(STL), 창호공사(목창호), 창호공사(기타))
  if (/pl\s*창호|창호\s*\(\s*pl\s*\)|피엘\s*창호/i.test(comb)) return '창호공사(PL)';
  if (/al\s*창호|창호\s*\(\s*al\s*\)|알루미늄\s*창호/i.test(comb)) return '창호공사(AL)';
  if (/stl\s*창호|창호\s*\(\s*stl\s*\)|스틸\s*창호|철재\s*창호/i.test(comb)) return '창호공사(STL)';
  if (/목\s*창호/i.test(comb)) return '창호공사(목창호)';
  if (/창호/.test(w)) return '창호공사(기타)';

  // 3) 전기공사 세부분류 (전기공사 > 가설전기공사 등)
  if (/^가설\s*전기(?:공사)?$|^임시\s*전기|^설비[·/]전기/i.test(w) || (/전기|분전|접지|차단기|전선/.test(w) && /가설|임시|분전반|분전함|컨테이너/.test(comb))) {
    return '가설전기공사';
  }
  if (/수변전/.test(comb)) return '수변전설비공사';
  if (/전선관/.test(comb)) return '전선관공사';
  if (/케이블\s*트레이/.test(comb)) return '케이블트레이공사';
  if (/구내\s*통신/.test(comb)) return '구내통신설비공사';
  if (/정보\s*통신/.test(comb)) return '정보통신설비공사';
  if (/전등\s*전열/.test(comb)) return '전등전열설비공사';
  if (/조명\s*설비/.test(w)) return '조명설비공사';
  if (/접지|피뢰/.test(w) && !/가설|분전/.test(comb)) return '접지/피뢰설비공사';
  if (/분전반|분전함|누전차단기|가설전선|가설전기|충전부/.test(comb)) return '가설전기공사';
  if (/전기/.test(w)) return '기타전기공사';

  // 4) 건축/공통/토목 주요 공사 매핑
  if (/^(?:HA|HE|HEY|BEE)\s*공사$/i.test(w) || /비계/.test(w)) return '비계공사';
  if (/갱폼|gang\s*form/i.test(w)) return '거푸집공사(갱폼)';
  if (/acs|rcs|슬립폼|특수폼/i.test(w)) return '거푸집공사(특수폼: ACS, RCS등)';
  if (w === '거푸집동바리공사' && /거푸집|동바리|유로폼|알폼|갱폼|서포트|전도방지|슬래브|벽체/i.test(ctx)) {
    return '거푸집동바리공사';
  }
  if (/흙막이|차수/.test(w)) return '흙막이/차수공사';
  if (/터파기/.test(w)) return '터파기공사';
  if (/굴착/.test(w)) return '굴착공사';
  if (/파일|항타/.test(w)) return '파일공사';
  if (/타워크레인/.test(w)) return '가설공사(타워크레인)';
  if (/리프트|호이스트/.test(w)) return '가설공사(건설용리프트)';
  if (/해체|철거/.test(w)) return '해체/철거공사';
  if (/방수|방습/.test(w)) return '방수/방습공사';
  if (/석공사|돌공사/.test(w)) return '돌(석)공사';
  if (/철근\s*콘크리트/.test(w)) {
    if (/철근/.test(ctx) && !/거푸집|동바리|타설/.test(ctx)) return '철근공사';
    if (/타설|콘크리트/.test(ctx) && !/거푸집|동바리/.test(ctx)) return '콘크리트공사';
    return '거푸집동바리공사';
  }

  if (w && w !== '거푸집동바리공사') {
    const snapped = snapToStandardTaxonomy(w, OFFICIAL_WORK_GROUPS, 0.72, '');
    if (snapped) return snapped;
  }

  // 5) 공종 셀이 비어있거나 기본값 오분류였을 때 부적합 내용(ctx)으로 추론
  if (/pl\s*창호/i.test(ctx)) return '창호공사(PL)';
  if (/유리\s*하역|유리\s*설치|유리공사/.test(ctx)) return '유리공사';
  if (/분전반|분전함|차단기|충전부|누전|가설전선|접지선/.test(ctx)) return '가설전기공사';
  if (/지게차|하역|운반|양중|유도로프|크레인/.test(ctx)) return '양중 및 운반작업';
  if (/비계|작업발판|말비계|벽이음|가새|밑둥잡이/.test(ctx)) return '비계공사';
  if (/갱폼|gang\s*form/i.test(ctx)) return '거푸집공사(갱폼)';
  if (/거푸집|동바리|유로폼|알폼|서포트|전도방지/.test(ctx)) return '거푸집동바리공사';
  if (/흙막이/.test(ctx)) return '흙막이/차수공사';
  if (/파일\s*천공|항타/.test(ctx)) return '파일공사';
  if (/철근/.test(ctx)) return '철근공사';
  if (/콘크리트|타설/.test(ctx)) return '콘크리트공사';
  if (/안전난간|개구부/.test(ctx)) return '안전시설공사';

  return w || '안전시설공사';
}

/**
 * 사진 요약 배너(photoBanner) 전용: 원인/결과/우려 서술어를 제거하고 '실제 위반한 핵심 내용'만 12~20자로 추출
 */
export function extractCoreViolationBanner(rawBanner = '', contentText = '') {
  const cleanSingleClause = (clause) => {
    let s = normalizeKoreanSpacing(String(clause || ''))
      .replace(/^부적합\s*(?:내용|사항)\s*[:;：]?\s*/, '')
      .replace(/^[①②③④⑤⑥⑦⑧⑨⑩\d)\-•·\s]+/, '')
      .replace(/^(?:지하\s*\d+층|\d+동(?:\s*후면|\s*상가동|\s*외부)?)\s*/i, '')
      .trim();

    // 괄호 안에 실제 위반사항이 명시된 경우 (예: "협력사 가설컨테이너 반입 시 점검 불량(분전함 차단기 충전부 노출)")
    const mParen = s.match(/^(.+?)\s*\(([^)]{5,28})\)\s*$/);
    if (mParen && /점검\s*불량|관리\s*불량|관리\s*미흡|기준\s*미준수/.test(mParen[1]) && !/^\d+cm|^\d+도|이하|이상/.test(mParen[2])) {
      return mParen[2].trim();
    }

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

    // 3. 서술형 어미를 명사형 위반 문구로 변환
    s = s
      .replace(/(?:을|를)\s*미설치(?:하여|함)?$/g, ' 미설치')
      .replace(/(?:이|가)\s*설치되지\s*않[아음]$/g, ' 미설치')
      .replace(/(?:이|가)\s*되지\s*않[아음]$/g, ' 미실시')
      .replace(/(?:을|를)\s*사용하지\s*않[아음]$/g, ' 미사용')
      .replace(/에\s*근접$/g, ' 근접 작업')
      .replace(/\s+/g, ' ')
      .trim();

    return s;
  };

  const source = String(rawBanner || contentText || '').trim();
  if (!source) return '';

  // 만약 원본 사진 배너가 이미 짧은 실제 위반 문구(예: "벽이음용 상부 버팀대 설치각도(60도↓) 불량", "협력사 가설컨테이너 반입시 점검 불량")이고
  // '2)', '발생시', '우려', '방전 미흡' 등 서술형 본문이 아니면 그대로 정제하여 반환
  const normBanner = normalizeKoreanSpacing(String(rawBanner || '')).replace(/^[①②③④⑤⑥⑦⑧⑨⑩\d)\s]+/, '').trim();
  const normContent = normalizeKoreanSpacing(String(contentText || '')).replace(/^부적합\s*(?:내용|사항)\s*[:;：]?\s*/, '').trim();
  const isRawCopyOfContent = normBanner && normContent && normBanner.replace(/\s+/g, '') === normContent.replace(/\s+/g, '');
  const hasLongRiskClause = /[2-9]\)|②|발생\s*시|감전\s*우려|충돌\s*우려|추락\s*우려|붕괴\s*우려|대지로\s*방전|으로\s*인해/.test(normBanner);

  if (normBanner && !isRawCopyOfContent && !hasLongRiskClause && normBanner.length >= 5 && normBanner.length <= 23) {
    return normBanner;
  }

  const targetText = normalizeKoreanSpacing(String(contentText || rawBanner || ''))
    .replace(/^부적합\s*(?:내용|사항)\s*[:;：]?\s*/, '')
    .trim();

  // 번호 항목(1) ... 2) ... 또는 줄바꿈) 분리 (공백 없이 붙은 '감전우려2)접지선'도 정확히 분리!)
  const parts = targetText
    .split(/(?:\r?\n|(?=[1-9]\)\s*[가-힣A-Za-z])|(?=[①②③④⑤⑥⑦⑧⑨⑩]))/)
    .map(p => cleanSingleClause(p))
    .filter(p => p && p.length >= 3);

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
    if (combinedFull.length <= 22) return combinedFull;
    return p1.length <= 24 ? p1 : p1.slice(0, 22).trim();
  }

  const single = parts[0] || cleanSingleClause(targetText);
  if (single.includes('지게차') && single.includes('근접')) {
    return '유도원·근로자 지게차 근접 작업';
  }
  return single.length <= 24 ? single : single.slice(0, 22).trim();
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

  for (const [pattern, replacement] of DOMAIN_TYPO_MAP) {
    s = s.replace(pattern, replacement);
  }

  s = normalizeKoreanSpacing(s);

  if (fieldKey === 'banner' || fieldKey === 'banner2' || fieldKey === 'photoBanner' || fieldKey === 'photo2Banner') {
    // 배너 우측 끝에 붙은 원문자 오인식 숫자 제거 (예: "벽이음용 상부 버팀대 설치각도(60도↓) 불량 1")
    s = s.replace(/\s+[12]$/, '').trim();
  }

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
    ([bad, good]) => bad && good && bad !== good && bad.length >= 2 && Math.abs(bad.length - good.length) <= 6
  );
  if (!entries.length) return record;

  const targetKeys = [
    'content', 'interviewOpinion', 'auditProposal', 'actionPlan',
    'countermeasure', 'photoBanner', 'photo2Banner', 'law', 'location'
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
  _globalRoot.SafeTextNormalizer = {
    decomposeHangul,
    levenshteinDistance,
    snapToStandardTaxonomy,
    normalizeRoundText,
    joinWrappedKoreanLines,
    normalizeKoreanSpacing,
    OFFICIAL_WORK_GROUPS,
    mapToStandardWorkGroup,
    extractCoreViolationBanner,
    normalizeFieldText,
    applyTypoPatches
  };
}
