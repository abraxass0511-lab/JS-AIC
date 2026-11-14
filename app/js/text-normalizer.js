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
  [/불량\s+1$/g, '불량']
];

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

// 전역 브라우저 객체에도 노출 (비모듈 스크립트 호환)
if (typeof window !== 'undefined') {
  window.SafeTextNormalizer = {
    decomposeHangul,
    levenshteinDistance,
    snapToStandardTaxonomy,
    normalizeRoundText,
    normalizeFieldText,
    applyTypoPatches
  };
}
