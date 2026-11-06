/**
 * SafePatrol 표준 공정 단계 자동 분류기
 * 근거:
 * 1. 안전보건공단(KOSHA) 건설업 패트롤 5대 중점 점검 단계 매뉴얼
 * 2. 국토교통부 및 조달청 건설공사 표준 S-Curve 및 WBS 진도율 표준
 */

export const STANDARD_STAGES = [
  { id: 'stage1', name: '착공 및 토공사 단계', range: '0~15%', defaultMin: 0, defaultMax: 15, keyRisks: '굴착면 붕괴, 흙막이 가시설, 중장비(덤프/굴착기) 협착/전도' },
  { id: 'stage2', name: '지하 골조 공사 단계', range: '15~40%', defaultMin: 15, defaultMax: 40, keyRisks: '거푸집동바리 붕괴, 지하 단부 개구부 추락, 콘크리트 타설 타워크레인' },
  { id: 'stage3', name: '지상 골조 및 외부 가설 단계', range: '40~70%', defaultMin: 40, defaultMax: 70, keyRisks: '시스템비계/외부비계 추락, 작업발판/안전난간 미설치, 낙하물 방지망' },
  { id: 'stage4', name: '마감 및 기계전기 설비 단계', range: '70~90%', defaultMin: 70, defaultMax: 90, keyRisks: '이동식 사다리/우마 추락, 용접/우레탄폼 화재·폭발, 밀폐공간 유해가스 질식' },
  { id: 'stage5', name: '준공 및 부대토목 단계', range: '90~100%', defaultMin: 90, defaultMax: 100, keyRisks: '외부 도장 곤돌라/달비계, 부대토목 포장 장비, 시운전 감전' }
];

export const PRODUCT_TYPES = [
  { id: 'apt', name: '공동주택 (아파트/주상복합)' },
  { id: 'logistics', name: '물류센터 / 공장 (철골조)' },
  { id: 'office', name: '오피스 / 지식산업센터' },
  { id: 'plant', name: '플랜트 / 산업설비' },
  { id: 'civil', name: '토목 / 인프라 (도로/교량/터널)' },
  { id: 'other', name: '기타 건축 시설물' }
];

/**
 * 공정률(%)과 공종명 키워드를 크로스체크하여 최적의 표준 공정 단계를 자동 판별
 * @param {number|string} progress - 공정률 숫자 (0~100)
 * @param {string} workGroup - 공종명 (예: 철근콘크리트, 토공사 등)
 * @param {string} productType - 상품 유형 (선택사항)
 * @returns {object} { id, name, range, confidence }
 */
export function determineStandardStage(progress, workGroup = '', productType = 'apt') {
  const p = parseFloat(progress);
  const wg = (workGroup || '').toLowerCase();

  // 1. 공종명 강력 키워드 기반 크로스체크 (공정률 보정)
  if (wg.includes('토공') || wg.includes('흙막이') || wg.includes('터파기') || wg.includes('파일') || wg.includes('지반')) {
    return { ...STANDARD_STAGES[0], confidence: '공종(토공사) 기반 정밀 매핑' };
  }
  if (wg.includes('지하') && (wg.includes('골조') || wg.includes('옹벽') || wg.includes('기초'))) {
    return { ...STANDARD_STAGES[1], confidence: '공종(지하골조) 기반 정밀 매핑' };
  }
  if (wg.includes('도장') || wg.includes('인테리어') || wg.includes('마감') || wg.includes('설비') || wg.includes('전기') || wg.includes('배관') || wg.includes('소방') || wg.includes('방수')) {
    return { ...STANDARD_STAGES[3], confidence: '공종(마감/설비) 기반 정밀 매핑' };
  }
  if (wg.includes('준공') || wg.includes('부대토목') || wg.includes('포장') || wg.includes('시운전')) {
    return { ...STANDARD_STAGES[4], confidence: '공종(준공/부대공사) 기반 정밀 매핑' };
  }

  // 2. 공정률 숫자 기준 매핑 (기본 S-Curve 가중치)
  if (isNaN(p) || p <= 0) {
    return { ...STANDARD_STAGES[0], confidence: '기본값' };
  }

  if (p < 15) {
    return { ...STANDARD_STAGES[0], confidence: '공정률(0~15%) 기준 매핑' };
  } else if (p < 40) {
    return { ...STANDARD_STAGES[1], confidence: '공정률(15~40%) 기준 매핑' };
  } else if (p < 70) {
    return { ...STANDARD_STAGES[2], confidence: '공정률(40~70%) 기준 매핑' };
  } else if (p < 90) {
    return { ...STANDARD_STAGES[3], confidence: '공정률(70~90%) 기준 매핑' };
  } else {
    return { ...STANDARD_STAGES[4], confidence: '공정률(90~100%) 기준 매핑' };
  }
}
