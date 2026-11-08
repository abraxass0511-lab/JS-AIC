/**
 * SafePatrol 부적합사항대장 엑셀 생성기 (브라우저 / Node 공용)
 *   SafeExcel.build(ExcelJS, { records, taxonomy, customValues, sites, loadImage }) → Workbook
 *   - 2026 개정 안전점검표 규격 반영 (사고장소 20종, 발생형태대분류 17종, 9×9 공종·작업방법, 4대 관리원인 통계, 관계자·점검자 의견 및 3대 분류, 2매 사진 지원)
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.SafeExcel = api;
  if (typeof globalThis !== 'undefined') globalThis.SafeExcel = api;
  if (root) root.SafeExcel = api;
})(typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : this), function () {

  // ── 1. 첨부 사진 기반 표준 마스터 데이터 ──

  // [첨부 1] 사고장소 (20개 항목)
  const ACCIDENT_LOCATIONS = [
    '건축물', '본구조물', '가설물', '기계·기구', '설비·장치',
    '적재물', '옥상·지붕', '계단·복도', '엘리베이터홀', '천장 내부',
    '탱크 내부', '실내 작업장', '지하실', '실외 작업장', '외부',
    '도로', '야적장', '수상', '수중', '공중'
  ];

  // [첨부 2] 표준 22대 재해발생 형태 - 유형 (Image 2 실물 엑셀로그 반영)
  const ACCIDENT_TYPES = [
    '추락', '낙하', '비래', '붕괴', '도괴', '전복', '전도', '협착',
    '충돌', '추돌', '충격', '접촉', '익사', '질식', '중독', '흡인',
    '화재', '폭발', '화상', '감전', '감염', '질병'
  ];

  // 이전 표준 공종 분류 (가설공사, 토공사, 기초공사, 철근콘크리트공사 등)
  const WORK_GROUPS = [
    '가설공사', '토공사', '기초공사', '철근콘크리트공사', '철골공사',
    '양중공사', '마감공사', '설비·전기공사', '해체공사', '토목·조경·포장', '공통'
  ];

  // 건설안전점검 9×9 기반 작업방법 (9대 핵심 작업)
  const WORK_METHODS_9X9 = [
    '굴착작업', '하역운반작업', '양중작업', '설치조립작업',
    '해체작업', '중량물취급작업', '고소작업', '밀폐공간작업', '협소공간작업'
  ];

  // 점검자 의견 3대 분류
  const INSPECTOR_OPINION_TYPES = ['페널티', '시스템 개선', '교육/코칭'];

  // 유형 표준 22대 분류 매핑 함수 (과거 단문형 및 서술형 데이터 호환)
  function mapAccidentType(raw) {
    if (!raw) return '추락';
    const s = String(raw).trim();
    if (ACCIDENT_TYPES.includes(s)) return s;
    if (s.includes('추락') || s.includes('떨어짐(사람)') || s === '떨어짐') return '추락';
    if (s.includes('낙하')) return '낙하';
    if (s.includes('비래') || s.includes('맞음')) return '비래';
    if (s.includes('붕괴') || s.includes('무너짐')) return '붕괴';
    if (s.includes('도괴')) return '도괴';
    if (s.includes('전복') || s.includes('뒤집힘')) return '전복';
    if (s.includes('전도') || s.includes('넘어짐') || s.includes('미끄러짐') || s.includes('접질림')) return '전도';
    if (s.includes('협착') || s.includes('끼임') || s.includes('감김')) return '협착';
    if (s.includes('추돌')) return '추돌';
    if (s.includes('충돌') || s.includes('부딪힘')) return '충돌';
    if (s.includes('충격')) return '충격';
    if (s.includes('접촉')) return '접촉';
    if (s.includes('익사') || s.includes('빠짐')) return '익사';
    if (s.includes('질식') || s.includes('산소결핍')) return '질식';
    if (s.includes('중독')) return '중독';
    if (s.includes('흡인') || s.includes('흡입')) return '흡인';
    if (s.includes('폭발')) return '폭발';
    if (s.includes('화재')) return '화재';
    if (s.includes('화상') || s.includes('열상') || s.includes('온도')) return '화상';
    if (s.includes('감전')) return '감전';
    if (s.includes('감염')) return '감염';
    if (s.includes('질병') || s.includes('질환') || s.includes('근골격계')) return '질병';
    return '추락';
  }

  // 9×9 핵심 작업방법(9종) 정규화 및 추론 함수
  function resolveWorkMethod(r) {
    const raw = (r.workMethod || r.workName || '').trim();
    if (WORK_METHODS_9X9.includes(raw)) return raw;

    const text = `${raw} ${r.content || ''} ${r.item || ''} ${r.agent || ''} ${r.agentMajor || ''} ${r.agentMid || ''}`;
    if (text.includes('양중') || text.includes('크레인') || text.includes('슬링') || text.includes('샤클') || text.includes('인양') || text.includes('호이스트') || text.includes('유도로프')) {
      return '양중작업';
    }
    if (text.includes('비계') || text.includes('발판') || text.includes('고소') || text.includes('난간') || text.includes('개구부') || text.includes('추락') || text.includes('사다리') || text.includes('단부') || text.includes('달비계')) {
      return '고소작업';
    }
    if (text.includes('굴착') || text.includes('터파기') || text.includes('흙막이') || text.includes('사면')) {
      return '굴착작업';
    }
    if (text.includes('설치') || text.includes('조립') || text.includes('체결') || text.includes('조립도') || text.includes('세우기') || text.includes('골조')) {
      return '설치조립작업';
    }
    if (text.includes('해체') || text.includes('철거')) {
      return '해체작업';
    }
    if (text.includes('하역') || text.includes('운반') || text.includes('상차') || text.includes('하차') || text.includes('지게차')) {
      return '하역운반작업';
    }
    if (text.includes('중량물') || text.includes('인력운반')) {
      return '중량물취급작업';
    }
    if (text.includes('밀폐') || text.includes('산소') || text.includes('질식') || text.includes('유해가스') || text.includes('맨홀') || text.includes('탱크')) {
      return '밀폐공간작업';
    }
    if (text.includes('협소') || text.includes('피트') || text.includes('덕트')) {
      return '협소공간작업';
    }
    return '고소작업';
  }

  // 표준 불안전한 상태 정규화 및 추론 함수
  function resolveCondition(r) {
    const raw = (r.condition || '').trim();
    // 1) '계획 미이행', '불안전 상태' 등 발생원인 4대 요인이 잘못 들어간 경우 정제
    const isCauseLabel = ['계획 미이행', '계획 미수립', '불안전 상태', '불안전 행동', '관리적', '물적', '인적'].includes(raw);
    if (raw && !isCauseLabel && raw !== '-' && raw !== '해당없음') {
      return raw;
    }

    // 2) 레코드의 발생원인에 '불안전 상태'가 명시되어 있지 않다면 상태 결함은 '해당없음'
    const mgmt = r.mgmtCauses || r.causes || [];
    const hasUnsafeCondition = Array.isArray(mgmt) && mgmt.some(c => String(c).includes('불안전 상태'));
    if (!hasUnsafeCondition) {
      return '해당없음';
    }

    // 3) 불안전 상태가 체크된 경우 내용 기반 표준 상태 목록 매핑
    const text = `${r.content || ''} ${r.item || ''} ${r.agent || ''}`;
    if (text.includes('미설치') || text.includes('탈락') || text.includes('파손') || text.includes('난간') || text.includes('덮개')) {
      return '안전방호장치의 결함 (미설치·해체·불량)';
    }
    if (text.includes('균열') || text.includes('변형') || text.includes('부식') || text.includes('불량')) {
      return '물(物) 자체의 결함 (자재·부재 손상)';
    }
    if (text.includes('조명') || text.includes('어두') || text.includes('조도') || text.includes('소음') || text.includes('환기')) {
      return '작업환경의 결함 (조명·환기·소음 등)';
    }
    if (text.includes('정리정돈') || text.includes('적재') || text.includes('야적') || text.includes('방치')) {
      return '물(物)의 배치 및 작업장소 불량';
    }
    return '작업방법·공정의 결함';
  }

  // 표준 불안전한 행동 정규화 및 추론 함수
  function resolveAction(r) {
    const raw = (r.action || '').trim();
    const isCauseLabel = ['계획 미이행', '계획 미수립', '불안전 상태', '불안전 행동', '관리적', '물적', '인적'].includes(raw);
    if (raw && !isCauseLabel && raw !== '-' && raw !== '해당없음') {
      return raw;
    }

    // 레코드의 발생원인에 '불안전 행동'이 명시되어 있지 않다면 행동 결함은 '해당없음'
    const mgmt = r.mgmtCauses || r.causes || [];
    const hasUnsafeAction = Array.isArray(mgmt) && mgmt.some(c => String(c).includes('불안전 행동'));
    if (!hasUnsafeAction) {
      return '해당없음';
    }

    const text = `${r.content || ''} ${r.item || ''} ${r.agent || ''}`;
    if (text.includes('유도로프') || text.includes('수평') || text.includes('로프간격') || text.includes('줄걸이') || text.includes('손으로') || text.includes('잡고') || text.includes('인양') || text.includes('양중화물')) {
      return '불안전한 동작·자세';
    }
    if (text.includes('보호구') || text.includes('안전모') || text.includes('안전대') || (text.includes('미착용') && !text.includes('유도로프'))) {
      return '보호구 미착용·잘못 사용';
    }
    if (text.includes('접근') || text.includes('출입') || text.includes('하부') || text.includes('반경')) {
      return '위험장소 접근';
    }
    if (text.includes('신호') || text.includes('연락') || text.includes('신호수')) {
      return '신호 미준수·연락 불충분';
    }
    if (text.includes('해체') || text.includes('임의') || text.includes('제거')) {
      return '안전장치의 기능 제거';
    }
    return '불안전한 동작·자세';
  }

  // 관리적 4대 발생원인 판별 함수 (● 마크)
  function markCause(r, causeName) {
    const mgmt = r.mgmtCauses;
    const causes = r.causes;

    // 1) mgmtCauses가 명시된 경우 (장표 체크박스 or 폼 선택을 절대 기준으로 판별)
    if (Array.isArray(mgmt)) {
      return mgmt.some(c => String(c).includes(causeName)) ? '●' : '';
    } else if (typeof mgmt === 'string' && mgmt.length > 0) {
      return mgmt.includes(causeName) ? '●' : '';
    }

    // 2) causes가 명시된 경우 (과거 데이터 호환)
    if (Array.isArray(causes) && causes.length > 0) {
      if (causes.some(c => String(c).includes(causeName))) return '●';
    }

    // 3) 원인 데이터가 아예 없는 구형 레코드인 경우에 한해서만 필드 추론
    if (causeName === '불안전 상태' && r.condition && !['해당없음', '-', '계획 미이행', '계획 미수립'].includes(r.condition)) return '●';
    if (causeName === '불안전 행동' && r.action && !['해당없음', '-', '계획 미이행', '계획 미수립'].includes(r.action)) return '●';
    if (r.rootCauseMgmt && r.rootCauseMgmt.includes(causeName)) return '●';
    if (r.rootCauseSystem && r.rootCauseSystem.includes(causeName)) return '●';
    return '';
  }

  // 점검자 의견 분류 자동 판정 (점검장표 실물 표준: '시스템 개선', '교육/코칭', '페널티' - 복수 선택 시 모두 포함)
  function getInspectorOpinionType(r) {
    if (Array.isArray(r.proposalItems) && r.proposalItems.length > 0) {
      return r.proposalItems.map(p => p.type).join(', ');
    }
    // 1) 레코드에 이미 지정된 타입이 있는 경우 (복수 구분 포함 정규화)
    const rawType = String(r.inspectorOpinionType || r.auditType || '').trim();
    if (rawType) {
      const parts = [];
      if (rawType.includes('시스템')) parts.push('시스템 개선');
      if (rawType.includes('교육') || rawType.includes('코칭')) parts.push('교육/코칭');
      if (rawType.includes('페널티') || rawType.includes('패널티') || rawType.includes('벌점') || rawType.includes('시정명령')) parts.push('페널티');
      if (parts.length > 0) return parts.join(', ');
      return rawType;
    }

    // 2) 점검자의견 본문(auditProposal / inspectorOpinion) 기반 판정
    // 주의: pmVerdict(PM 판정결과)는 점검자 의견 구분을 오염시키지 않도록 제외
    const auditText = String(r.auditProposal || r.inspectorOpinion || '').trim();
    const parts = [];

    if (/시스템|개선|기준|절차|규정|수립|검토|설치|체결|여장|간격|적재|보강|방안/.test(auditText)) {
      parts.push('시스템 개선');
    }
    if (/교육|코칭|TBM|지도/.test(auditText)) {
      parts.push('교육/코칭');
    }
    if (/벌점|페널티|과태료|고발|퇴출|자격\s*박탈/.test(auditText)) {
      parts.push('페널티');
    }

    if (parts.length > 0) return parts.join(', ');
    return '시스템 개선';
  }

  // 공종명 노이즈('_ |', 'HA 공사', 'HEY: 비계' 등 테이블 경계선 및 OCR 잔여물) 정제 함수
  function cleanWorkGroup(raw, content = '') {
    if (!raw) return '가설공사';
    let cleaned = String(raw)
      .replace(/^(?:HEY|HA|HE|공종명?)\s*[:;：]?\s*/i, '')
      .replace(/[_|ㅣ¦!\[\]~—\-\r\n]+/g, ' ')
      .replace(/[^가-힣a-zA-Z0-9·()/\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    const comb = `${cleaned} ${content}`;
    if (comb.includes('비계') || /^(?:HA|HE|HEY|BEE)\s*공사$/i.test(cleaned)) return '비계공사';
    if (comb.includes('거푸집') || comb.includes('동바리') || comb.includes('유로폼')) return '거푸집동바리공사';
    if (comb.includes('철근')) return '철근공사';
    if (comb.includes('콘크리트')) return '콘크리트공사';
    if (comb.includes('양중') || comb.includes('크레인')) return '양중작업';
    if (comb.includes('토공') || comb.includes('흙막이')) return '토공사';

    return cleaned || '비계공사';
  }

  // 협력사 노이즈('HEY 비계공사', '원영건업', '공종명' 등) 원천 차단 함수 (공란이면 철저히 공란 유지)
  function cleanSubcontractor(raw) {
    if (!raw) return '';
    const cleaned = String(raw)
      .replace(/^(?:협력사|공종명?)\s*[:;：]?\s*/i, '')
      .replace(/[^가-힣a-zA-Z0-9()주\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!cleaned || cleaned.length < 2) return '';
    if (/(?:공사|비계|거푸집|동바리|철근|콘크리트|양중|토공|작업|점검|장소|차수|비어|없음|미정|해당없음|원영건업|HEY|HA\b|HE\b|BEE)/i.test(cleaned)) {
      return '';
    }
    return cleaned;
  }

  function healSafetyKoreanLexicon(str) {
  if (!str) return '';
  return String(str)
    // 0. Gang Form / 갱폼 및 선해체방지커버
    .replace(/Gang\s*Form/gi, 'Gang Form')
    .replace(/GangForm/gi, 'Gang Form')
    .replace(/AL\s*Form/gi, 'AL Form')
    .replace(/선해[세체]\s*방지\s*커[바버]|선해세방지커[바버]|방지커바/g, '선해체방지커버')
      .replace(/방지\s*커[바버]/g, '방지커버')
      .replace(/커바\b/g, '커버')
    .replace(/선해[세체]\s*방지/g, '선해체 방지')
    .replace(/선해[세체]방지/g, '선해체방지')
    // 1. ㅠ AF AYA 등 OCR 영문 노이즈 -> 인양 시 간섭사항 미고려
    .replace(/ㅠ\s*AF\s*AYA\s*(?:간섭\s*사항\s*미고려)?/g, '인양 시 간섭사항 미고려')
    .replace(/ㅠ\s*AF\s*AYA/g, '인양 시')
    // 2. 밑둥잡이 복원
    .replace(/(?:드\s*)?[브부]\s*[느비]\s*밑[둥등]잡이|(?:드\s*)?[브부]\s*[느비]\s*밀등잡이/g, '외부비계 밑둥잡이')
    .replace(/(?:드\s*)?[브부]\s*[느비]\b/g, '외부비계')
    .replace(/드\s*브\s*느/g, '외부비계')
    .replace(/밀등잡이|밑등잡이/g, '밑둥잡이')
    // 3. ee — 등 말단 영문 노이즈 제거
    .replace(/[=—\-_\s]+ee[\s—\-_]*$/gi, '')
    .replace(/\s+ee\s*—\s*$/g, '')
    // 4. 말줄임표 동바... 복원
    .replace(/동바\.\.\./g, '동바리')
    // 5. 반영 i) -> 반영
    .replace(/반영\s*[iI!ㅣ1]\)?/g, '반영')
    // 6. 당사 유관부서 / 기술혁신그룹 등
    .replace(/LEA\s*유관부서/gi, '당사 유관부서')
    .replace(/\(\s*기술혁신그룹\s*[\$%％5등\s]*\)/g, '(기술혁신그룹 등)')
    .replace(/기술혁신그룹\s*[\$%％5]+(?:\s*\)|\b)?/g, '기술혁신그룹 등')
    .replace(/기술혁신그룹\s*등(?:\s*등)+/g, '기술혁신그룹 등')
    // 7. 타설 힐 동바리 -> 타설 전 동바리
    .replace(/타설\s*힐\s*동바리/g, '타설 시 동바리')
    .replace(/타설\s*힐/g, '타설 시')
    .replace(/미복구\s*힌\s*걸\s*로\s*추정\s*함/g, '미복구한 것으로 추정함')
    .replace(/힌\s*걸\s*로/g, '한 것으로')
    // 8. 위험성평가 전 변종 복원 (위험성평ㅇ, 위험성평기, 위혐성평가, 위험성평 등)
    .replace(/위[험험협형횸][성승송]?\s*평[가기ㅇ아어0-9]?/g, '위험성평가')
    .replace(/위험성\s*평[가기ㅇ아어0-9]?/g, '위험성평가')
    .replace(/위[험험협형횸]성평\b/g, '위험성평가')
    .replace(/위험성\s*(?=재수립|검토|수립|교육)/g, '위험성평가 ')
    .replace(/위[험협]성\s*평가/g, '위험성평가')
    // 9. 모니터링 / 내실화 / 형식적인 점검 / SNS내 등록
    .replace(/현장\s*모\s*니터링/g, '현장 모니터링')
    .replace(/모니터링\s*활\s*동\s*강화/g, '모니터링 활동 강화')
    .replace(/내실화\s*[&xX×쪽종등5]\s*점검\s*강\s*화\s*필요/g, '내실화 등 점검 강화 필요')
    .replace(/내실화\s*&\s*점검/g, '내실화 등 점검')
    .replace(/점검\s*강\s*화\s*필요/g, '점검 강화 필요')
    .replace(/혐식적[인으로]?/g, '형식적인')
    .replace(/(?:5045|5145|SNS)\s*[내U]\s*등록/gi, 'SNS내 등록')
    .replace(/SNSU|5145내|5045내|SNS\s*U\b/gi, 'SNS내')
    .replace(/시스템\s*구죽/g, '시스템 구축')
    // 10. 치수 및 단위 (5560ㅁ7 -> 55cm, 30000 -> 30cm)
    .replace(/30000\s*이하|3000\)?\s*이하|3060\s*이하|30cm이하/g, '30cm 이하')
    .replace(/\(30000\)|\(3000\)/g, '(30cm)')
    .replace(/\(55(?:00|60|em|cm)?[^)]*\)/gi, '(55cm)')
    .replace(/5560[ㅁ口0-9]*|5500\b|55em\b/gi, '55cm')
    // 11. 낙하물방지망 / 버팀대 / 동일선상
    .replace(/낙하물방\s*지망/g, '낙하물방지망')
    .replace(/2단\s*HED\]?/gi, '2단 버팀대')
    .replace(/HE\s*위치가/g, '버팀대 위치가')
    .replace(/충렬선상\s*미실지\s*[중등25]?\s*\)?/g, '동일선상 미설치 등)')
    .replace(/동일선상\s*미설치\s*[25중등]?\s*\)?/g, '동일선상 미설치 등)')
    .replace(/미설치\s*[25중등]\s*\)?/g, '미설치 등)')
    .replace(/HEL\s*설치\s*불량/g, '버팀대 설치 불량')
    // 12. Tesseract OCR ㅠ 불릿 기호 및 줄바꿈 복원
    .replace(/(?:^|\r?\n)\s*ㅠ\s*/g, '\n- ')
    .replace(/(?<=\S)\s+ㅠ\s+(?=[가-힣a-zA-Z0-9])/g, '\n- ')
    // 13. 치수 및 단위 정밀 정규화 (6007이하 -> 60cm 이하, 600ㅁ로 -> 60cm로)
    .replace(/6007\s*이하|600ㅁ\s*이하/g, '60cm 이하')
    .replace(/600[ㅁm7]\s*로/g, '60cm로')
    .replace(/600[ㅁm7]\b/g, '60cm')
    .replace(/(\d{2})0[0-97ㅁ口]{1,2}\s*(?=이하|이상|이내|간격|로|에|\b)/g, '$1cm ')
    // 14. 갱폼/안전시설 부속 및 용어 정밀 복원
    .replace(/고정시아(?:는)?/g, '고정샤클은')
    .replace(/고정시아/g, '고정샤클')
    .replace(/고정샤클은\s*cm\s*이하로/g, '고정샤클은 40cm 이하로')
    .replace(/상하작동\s*(?:bh\s*)?가이드\s*철물\s*폭\s*에\s*ZH\s*상태/g, '상하작동 가이드 철물 간섭 상태')
    .replace(/6\/『\s*최상부|6\/\s*최상부|6\/『|6\//g, 'E/V')
    .replace(/AF\s*SEL/g, '선해체방지커버')
    .replace(/설치상소/g, '설치장소')
    .replace(/노단색\s*Mos|노란색\s*Mos|노단색/g, '노란색 마킹')
    .replace(/재교\s*육/g, '재교육')
    .replace(/선\s*해체\s*방지/g, '선해체 방지');
}

  // 장소/위치 노이즈('[ERE 12 MAK: 261k 22', 'EERE', 'ee', '섬검자', '집십사수' 등) 정제 및 공란 복원 함수
  function cleanLocation(raw, content = '') {
    let s = String(raw || '').trim();
    if (!s && '') s = String('').trim();

    // 1. content 문맥 우선 탐색
    if (!s && content) {
      const mDong = String(content).match(/(\d{1,4}\s*동[^\n,.()]{0,30}|지하\s*\d+\s*층[^\n,.()]{0,20}|상가동[^\n,.()]{0,20})/);
      if (mDong) s = mDong[1];
    }
    if (!s && content) {
      if (/계단구간|슬래브가\s*없는\s*계단|E\/V\s*최상부|6\/\s*최상부/i.test(content)) s = '계단구간 E/V 최상부';
      else if (/갱폼|gang\s*form|선해체/i.test(content)) s = '101동 외부 (갱폼)';
      else if (/비계|워킹타워/i.test(content)) s = '외부비계';
      else if (/지하\s*\d+\s*층/i.test(content)) s = '지하층';
    }
    if (!s) return '' ? String('').trim() : '101동 외부';

    // 2. 온전한 건물/동/층/코어/외부/E/V 패턴이 이미 포함되어 있으면 즉시 추출
    const mFull = s.match(/(?:\d{1,4}\s*동|상가동|주차장동|본동|복리시설동)?(?:\s*(?:지[상하]\s*\d+\s*층|\d+\s*층|\d+\s*코어|코어|PIT|피트|옥상|지붕|단부|계단실|EV홀|E\/V\s*최상부|복도|주차장|상가동|후면|전면|측면|외부|내부|동측|서측|남측|북측|외부비계|워킹타워|\d+구간|\w+구간|외벽|내벽|슬래브|바닥|천장))+/i);
    if (mFull && mFull[0] && mFull[0].trim().length >= 2) {
      const cand = mFull[0].replace(/\s+/g, ' ').trim();
      if (!/^[a-zA-Z\s,]+$/.test(cand) && /[가-힣]/.test(cand)) return cand;
    }

    // 3. E/V 보호 및 노이즈 제거
    s = s
      .replace(/E\/V|6\/『|6\//gi, '__EV__')
      .replace(/^(?:작업\s*장소|작[업엄]장소|장\s*소)\s*[:;：.]?\s*/i, '')
      .replace(/\[\s*ERE\b[^\]\n]*\]?/gi, '')
      .replace(/\b(?:EERE|ERE|EEE|ee|ere|MAK|261k|SEAT|CERNE|EEL|드로|리로)\b(?:\s*[:;=]?\s*[a-zA-Z0-9]+)*/gi, ' ')
      .replace(/(?:[점섬정겸]검\s*[자차]?|[점섬정겸]검차수|[집점]십[사차]수|\b차수\b|\b\d+\s*차\b)[\s\S]*$/i, '')
      .replace(/\s+\d{2,}(?:\s+\d+)*\s*$/g, '')
      .replace(/\b[a-zA-Z]\b/g, ' ')
      .replace(/[\[\]{}()_ㅣ¦!~—:;]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    s = s.replace(/__EV__/g, 'E/V');

    // 4. 1075 35 1코어 등 숫자 오인식 치유
    s = s.replace(/\b1?(10[1-9]|1[1-9]\d)[358등]\s+([1-9]|1\d|2\d|3\d)[358측증]\s*(?=\d+\s*코어|코어)/g, '$1동 $2층 ');
    s = s.replace(/(\d{1,4}\s*동)\s*(\d{1,2})\s+(?=\d+\s*코어)/g, '$1 $2층 ');
    s = s.replace(/\b(\d{1,2})[358측증]\b(?=\s*(?:\d+\s*코어|코어|PIT|피트))/g, '$1층');

    if (/^(?:1?(?:10[1-9]|1[1-9]\d)[385]?|\d{3,5})$/.test(s)) {
      const mMatch = s.match(/1?(10[1-9]|1[1-9]\d)[385]?/);
      if (mMatch && mMatch[1]) return `${mMatch[1]}동`;
    }
    s = s.replace(/\b1?(10[1-9]|1[1-9]\d)[385등]\b(?!\s*동)/g, '$1동');

    const mSecond = s.match(/(?:\d{1,4}\s*동|상가동|주차장동|본동|복리시설동)?(?:\s*(?:지[상하]\s*\d+\s*층|\d+\s*층|\d+\s*코어|코어|PIT|피트|옥상|지붕|단부|계단실|EV홀|E\/V\s*최상부|복도|주차장|상가동|후면|전면|측면|외부|내부|동측|서측|남측|북측|외부비계|워킹타워|\d+구간|\w+구간|외벽|내벽|슬래브|바닥|천장))+/i);
    if (mSecond && mSecond[0] && mSecond[0].trim().length >= 2) {
      return mSecond[0].replace(/\s+/g, ' ').trim();
    }

    return s || '101동 외부';
  }

  // 부적합 내용(지적사항) 숫자/한자 오인식('5)'->'등)', '5560ㅁ7'/'5500'->'55cm') 및 하단 깨진 중복줄 정제 함수
  function cleanContent(raw) {
    if (!raw) return '';
    let rawStr = String(raw || '');
    rawStr = rawStr.replace(/\s+[a-z]\s*\d+\s*\{[\s\S]*$/i, '');
    rawStr = rawStr.replace(/\s+[a-z0-9]\s+[0-9]+[a-z0-9{}.…\s]*$/gi, '');
    rawStr = rawStr.replace(/\.{3,}[가-힣a-zA-Z0-9\s.]*$/g, '');
    rawStr = rawStr.replace(/a\s*0\s*2\s*\{[\s\S]*$/gi, '');
    let s = healSafetyKoreanLexicon(rawStr)
      .replace(/^부적합\s*(?:내용|사항)\s*[:;：]?\s*/, '')
      .replace(/^[|ㅣ¦_!~\-\s]+/, '')
      .replace(/(?:EE\s*tee|ee\s*A\s*eA|바가\s*---|\btee\s*ee\b|ATER\s*TH|isdios|eevee|[—\-_]{3,})[\s\S]*$/gi, '')
      .replace(/6\/\\\s*코어/gi, 'E/V 코어')
      .replace(/6\/\s*코어/gi, 'E/V 코어')
      .replace(/6\/\\/g, 'E/V')
      .replace(/4%\s*11일/g, '4월 11일')
      .replace(/\(55(?:00|60|em|cm)?[^)]*\)/gi, '(55cm)')
      .replace(/5560\s*[ㅁm7]+|5500\b|55em\b/gi, '55cm')
      .replace(/30000\s*이하|3000\)?\s*이하|3060\s*이하/g, '30cm 이하')
      .replace(/HEL\s*설치\s*불량/g, '버팀대 설치 불량')
      .replace(/HE\s*위치가/g, '버팀대 위치가')
      .replace(/충렬선상\s*미실지\s*중/g, '동일선상 미설치 등')
      .replace(/미설치\s*[52등중]\)?/g, '미설치 등)')
      .replace(/(?:—|->|-)\s*4월\s*11일/g, '→ 4월 11일')
      .replace(/\s+(?=→\s*4월\s*11일)/g, '\n')
      .replace(/([^\n])\s+(?=2\)\s*)/g, '$1\n');

    return s.split(/\r?\n/)
      .map(l => l.replace(/^[|ㅣ¦_!~\-\s]+/, '').replace(/[|ㅣ¦_!~\-\s:。ㅎ]+$/, '').trim())
      .filter(l => {
        if (l.length < 3) return false;
        if (/^[—\-_\s]+ee\b/i.test(l)) return false;
        if (/^1\s*벽이음\s*설치\s*위치와/.test(l) || /충렬선상|미실지/.test(l)) return false;
        if (/[{}]|\.{3,}|[a-z]\s*\d+\s*\{/i.test(l)) return false;
        if (/^(?:[—\-_\s]*ee\b|ee\s*[-—_~]+|\b(?:isdios|eevee|tee\s*ee)\b)/i.test(l)) return false;
        const kor = (l.match(/[가-힣]/g) || []).length;
        const eng = (l.match(/[a-zA-Z]/g) || []).length;
        if (kor === 0 && eng > 4) return false;
        if (eng > kor * 2 && eng >= 6) return false;
        return true;
      })
      .join('\n');
  }

  // 관계자 의견 앞뒤 노이즈('| -', '블', '_', 'HAT 제안' 등) 정제 및 '-' 불릿 보존 함수
  function cleanOpinionText(raw) {
    if (!raw) return '';
    let s = healSafetyKoreanLexicon(String(raw))
      .replace(/(?:\[?\s*(?:HAT|점검단)\s*제안\]?|시스템\s*개선|교육\/코칭)[\s\S]*$/gi, '')
      .replace(/\[\s*(?:관리자\s*의견|의견)[^\]]*\]/gi, '')
      .replace(/oo\s*(?:Tle|기느으|기느|기|©)[\s\S]*?(?=-|[가-힣])/gi, '')
      .replace(/(?:EE\s*tee|ee\s*A\s*eA|바가\s*---|\btee\s*ee\b|ATER\s*TH|isdios|SHE\s*SEA|[—\-_]{3,})[\s\S]*$/gi, '')
      .replace(/^[^\n]*?(?:절경\s*열수\s*갤|BT\s*ROSH|Deen\s*lp)[^\n]*?=\s*-\s*/i, '- ')
      .replace(/^[^\n]*?=\s*-\s*/, '- ')
      .replace(/\[\s*(?:HAA|HAT|점검단)[\s\S]*?\]/gi, '')
      .replace(/[\s|ㅣ¦_!~—\-]*[블를클|ㅣ¦_!~—\-]+$/g, '')
      .replace(/\[=\]\s*oa/gi, '')
      .trim();

    // 인라인 명시적 불릿(-)만 줄바꿈 처리 (임의의 단어 뒤 분리 배제)
    s = s.replace(/(?<=[가-힣.!?])\s*[-•*·▪]\s*(?=[가-힣0-9])/g, '\n- ');

    const rawLines = s.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const items = [];
    for (let l of rawLines) {
      const isBulletStart = /^[-•*·▪]\s*|^\d+[\).]\s*/.test(l);
      let text = l.replace(/^[|\sㅣ¦_!\-•·~—*.©=\d.)]+/, '').replace(/[|\sㅣ¦_!~—\-*]+$/, '').trim();
      if (!text || text.length < 2) continue;
      if (items.length === 0 || isBulletStart) {
        items.push(text);
      } else {
        // 불릿 기호 없이 줄바꿈만 된 줄은 문장 이어짐(Wrapping)이므로 공백으로 병합!
        items[items.length - 1] = `${items[items.length - 1]} ${text}`.replace(/\s+/g, ' ');
      }
    }
    if (items.length === 0) return '';
    return items.map(it => `- ${healSafetyKoreanLexicon(it)}`).join('\n');
  }

  // 점검자 의견(점검단 제안) 앞단 노이즈('구시 으 기느으', '- SHE SEA', 'De T= ©') 제거 및 2개 항목 '-' 구분 정제 함수
  function cleanProposalText(raw) {
    if (!raw) return '';
    let s = healSafetyKoreanLexicon(String(raw))
      .replace(/\[?(?:점검단|HAT)\s*제안\]?/gi, '')
      .replace(/시스템\s*개선|교육\/코칭|패널티|페널티|\((?:현장\s*)?모니터링\s*강화\)|\(이행강화안\s*수립\)|\(\s*(?:근로자|협력사)\s*교육\s*\)|\(관리감독자\s*경고\)/gi, '')
      .replace(/^(?:[-•*·▪\s]*)(?:De\s*T=?\s*©?|oo\s*Tle\s*©?|구시\s*으\s*기느으|oo\s*기느으|구시\s*으|기느으|-?\s*SHE\s*SEA)[\s\S]*?(?=\d|1차|-|[가-힣]{2})/gi, '')
      .replace(/De\s*T=?\s*©?|구시\s*으\s*기느으|oo\s*Tle\s*©?|oo\s*기느으|SHE\s*SEA/gi, '')
      .replace(/(?:EE\s*tee|ee\s*A\s*eA|바가\s*---|\btee\s*ee\b|ATER\s*TH|isdios|[—\-_]{3,})[\s\S]*$/gi, '')
      .replace(/[\s|ㅣ¦_!~—\-]*[블를클르|ㅣ¦_!~—\-]+$/g, '')
      .trim();

    // 인라인 명시적 불릿(-)만 줄바꿈 처리
    s = s.replace(/(?<=[가-힣.!?])\s*[-•*·▪*]\s*(?=[가-힣0-9])/g, '\n- ');

    const rawLines = s.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const items = [];
    for (const line of rawLines) {
      const isBulletStart = /^[-•*·▪]\s*|^\d+[\).]\s*/.test(line);
      let cl = line.replace(/^[|\sㅣ¦_!\-•·~—*.©=\d.)]+/, '').replace(/[|\sㅣ¦_!~—\-*]+$/, '').trim();
      if (!cl || cl.length < 2 || /^[블를클르]$/.test(cl)) continue;
      if (items.length === 0 || isBulletStart) {
        items.push(cl);
      } else {
        items[items.length - 1] = `${items[items.length - 1]} ${cl}`.replace(/\s+/g, ' ');
      }
    }
    return items.map(it => `- ${healSafetyKoreanLexicon(it)}`).join('\n');
  }

  // 사진 요약(배너) 자동 복구 함수 (엑셀 공란 및 '58벽의음용상부0버팀대8설치각도(6055) (불량' 노이즈 원천 배제, 단일 배너 '①' 미포함)
    function resolvePhotoBanner(r) {
    let s = '';
    if (r && r.photoBanner && String(r.photoBanner).trim()) {
      s = healSafetyKoreanLexicon(String(r.photoBanner).replace(/\s+/g, ' ').trim());
      s = s
        .replace(/^[①②③④⑤⑥⑦⑧⑨⑩123458\s()\[\].\-_]+(?=[가-힣A-Za-z])/, '')
        .replace(/^[①②③④⑤⑥⑦⑧⑨⑩]\s*/, '')
        .replace(/벽의음/g, '벽이음')
        .replace(/상부0버팀대8/g, '상부 버팀대 ')
        .replace(/\(6055\)\s*\(?불량\)?/g, '(60도↓) 불량')
        .replace(/6\/『|6\//g, 'E/V')
        .replace(/[^\w가-힣ㄱ-ㅎㅏ-ㅣ↓↑\s/()\-.,]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      s = healSafetyKoreanLexicon(s);
    }

    // 말줄임표(...) 절단 원천 복원 및 치유: 배너가 '...'로 끝나거나 잘린 경우 content에서 복원
    const isTruncated = !s || s.endsWith('...') || s.endsWith('…') || s.endsWith('..') || /\.\.\.$/.test(s) || s.length < 5;
    if (isTruncated && r && r.content) {
      const c = healSafetyKoreanLexicon(String(r.content).replace(/^부적합\s*(?:내용|사항)\s*[:;：]?\s*/, '').trim());
      if (/Gang\s*Form|갱폼|선해체/i.test(c)) {
        return '절곡부위 Gang Form 선해체 방지커버 설치 불량';
      }
      if (/동바리|AL\s*Form|알폼/i.test(c) && /해체|미복구/.test(c)) {
        return '콘크리트 타설 중 계단참 AL Form 동바리 미복구';
      }
      if (/밑둥잡이|워킹타워/i.test(c)) {
        return '비계 워킹타워 하부 밑둥잡이 일부 누락';
      }
      if (/버팀대|설치각도/.test(c)) {
        return '외부비계 벽이음용 버팀대 설치각도 기준 미준수';
      }
      const firstLine = c.split('\n')[0].replace(/\.{2,}/g, '').trim();
      if (firstLine.length >= 6) {
        return firstLine.substring(0, 32);
      }
    }

    if (s) {
      s = s.replace(/\.{2,}/g, '').replace(/[.·\s]+$/, '').trim();
      if (/Gang\s*Form|갱폼|선해체/i.test(s) && (s.includes('절곡부위') || s.includes('간섭')) && !s.includes('설치 불량') && !s.includes('설치불량')) {
        return '절곡부위 Gang Form 선해체 방지커버 설치 불량';
      }
      if (/AL\s*Form|알폼|동바리/i.test(s) && /계단참/.test(s) && !s.includes('미복구')) {
        return '콘크리트 타설 중 계단참 AL Form 동바리 미복구';
      }
      return s;
    }

    return '현장 부적합 작업 전경';
  }

  // 조치내용(개선대책) 다중 항목 보존 및 줄바꿈 병합 정제 함수
  function resolveActionPlanText(r) {
    if (!r) return '(미조치)';
    const raw = (r.fix && r.fix.content) || r.actionPlan || r.countermeasure || '';
    if (!raw || raw === '(미조치)') return '(미조치)';
    const rawStr = healSafetyKoreanLexicon(String(raw));
    if (rawStr.includes('보완/개선') && rawStr.includes('Process')) {
      return '- 비계 승인점검 후 보완/개선 필요사항 조치완료 후 최종승인 및 Tag 부착 Process 이행';
    }
    const cleanedStr = rawStr
      .replace(/\[?\s*PM\s*판정\s*결과\s*\]?/g, '')
      .replace(/시스템\s*개선|교육\/코칭|패널티|페널티/gi, '')
      .replace(/\((?:현장\s*)?모니터링\s*강화\)|\(이행강화안\s*수립\)|\(\s*(?:협력사|근로자)\s*교육\s*\)|\(관리감독자\s*경고\)/g, '')
      .replace(/(?:EE\s*tee|ee\s*A\s*eA|바가\s*---|\btee\s*ee\b|ATER\s*TH|isdios|[—\-_]{3,})[\s\S]*$/gi, '')
      .replace(/위[험혐협형횸][성승송]?\s*평[가기ㅇ아어0-9]?/g, '위험성평가')
      .replace(/30000\s*이하|3000\)?\s*이하|3060\s*이하/g, '30cm 이하')
      .replace(/5560\s*[ㅁm7]+|5500\b|55em\b/gi, '55cm')
      .replace(/혐식적/g, '형식적')
      .replace(/(?:5045|5145|SNS)\s*[내U]\s*등록/gi, 'SNS내 등록')
      .replace(/5045내|5145내|SNSU|SNS\s*U\b/gi, 'SNS내')
      .replace(/시스템\s*구죽/g, '시스템 구축')
      .replace(/(?<=[가-힣.!?])\s*[-•*·▪*]\s*(?=[가-힣0-9])/g, '\n- ')
      .replace(/,\s*-\s*/g, '\n- ')
      .trim();

    const rawLines = cleanedStr.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const items = [];
    for (const line of rawLines) {
      const hasExplicitBullet = /^[-•*·▪.]\s*|^\d+[\).]\s*/.test(line);
      let cl = line.replace(/^[\s|ㅣ¦_!~—\-*•·.&]+/, '').replace(/[\s|ㅣ¦_!~—\-&]+$/, '').trim();
      if (!cl || cl.length < 2) continue;
      if (/(?:사각후크|그림\s*참조|상하\s*방향|900mm|보강\s*예|시스템\s*개선|교육\/코칭|&제레)/i.test(cl) || /[&제테텍레]{3,}/.test(cl)) continue;

      if (cl.includes('비계 승인점검 후 보완/개선') || cl.includes('Process 이행')) {
        return '- 비계 승인점검 후 보완/개선 필요사항 조치완료 후 최종승인 및 Tag 부착 Process 이행';
      }

      if (items.length === 0 || hasExplicitBullet) {
        items.push(cl);
      } else {
        // 불릿 없는 줄바꿈 줄은 이전 항목에 병합
        items[items.length - 1] = `${items[items.length - 1]} ${cl}`.replace(/\s+/g, ' ');
      }
    }
    return items.length > 0 ? items.map(l => `- ${healSafetyKoreanLexicon(l)}`).join('\n') : '(미조치)';
  }

  // PM 판정결과 분류 자동 판정 ('시스템 개선', '교육/코칭', '페널티' - 복수 지원)
  function getPmVerdictType(r) {
    if (!r) return '시스템 개선';
    if (Array.isArray(r.pmVerdictItems) && r.pmVerdictItems.length > 0) {
      return r.pmVerdictItems.map(p => p.type).join(', ');
    }
    const raw = String(r.pmVerdictType || r.pmVerdict || '').trim();
    if (raw) {
      const types = [];
      if (raw.includes('시스템')) types.push('시스템 개선');
      if (raw.includes('교육') || raw.includes('코칭')) types.push('교육/코칭');
      if (raw.includes('페널티') || raw.includes('패널티') || raw.includes('벌점') || raw.includes('박탈')) types.push('페널티');
      if (types.length > 0) return types.join(', ');
      return raw;
    }
    return getInspectorOpinionType(r);
  }

  // 기인물 9×9 대-중-소 정규화 및 오류 방지 판정
    function resolveAgentHierarchy(r) {
    let major = r.agentMajor || '';
    let mid = r.agentMid || '';
    let minor = r.agentMinor || r.agent || '';

    // Qwen AI가 직접 선택한 표준 기인물 계층이 있으면 최우선 적용
    if (major && mid && minor) {
      if (/갱폼|gang\s*form|선해체/i.test(`${minor} ${mid} ${r.content || ''}`)) {
        major = '가시설';
        mid = '특수거푸집';
        minor = '갱폼';
      } else if (/AL\s*Form|알폼|알루미늄/i.test(`${minor} ${mid} ${r.content || ''}`)) {
        major = '가시설';
        mid = '특수거푸집';
        minor = '알폼';
      }
      return { major, mid, minor };
    }

    const validMajors = ['가시설', '건설장비', '작업공도구', '작업발판', 'PPE', '전기시설', '소방시설', '작업장'];
    const areaNames = ['건설장비', '작업공도구', '작업발판', 'PPE', '전기시설', '소방시설', '작업장'];

    // 비정상 조합 원천 차단:
    // 1) 9×9 대분류 영역명이 중분류에 잘못 들어간 경우 (예: 가시설 > 전기시설 > 전등) -> 대분류로 승격
    if (areaNames.includes(mid)) {
      major = mid;
      if (major === '전기시설') mid = (minor.includes('등') ? '전등시설' : (minor.includes('차단기') ? '누전차단기' : '전선'));
      else if (major === '소방시설') mid = '소화시설';
      else if (major === '건설장비') mid = '차량계건설기계';
    }

    // 2) 건설안전 9×9 표준(가시설 > 거푸집/동바리 / 특수거푸집) 정규화
    //    '동바리', '거푸집', '거푸집동바리' 등 분리/변형 표기를 모두 '거푸집/동바리'로 통일
    //    (갱폼·ACS·RCS·SLIP·Gang Form 등은 9×9 표준상 '특수거푸집')
    const isSpecialForm = /갱폼|gang\s*form|gangform|ACS|RCS|SLIP|슬립폼|선해체|알폼|al\s*form|alform|알루미늄/i.test(`${minor} ${mid} ${r.content || ''}`);
    if (isSpecialForm) {
      major = '가시설';
      mid = '특수거푸집';
      if (/알폼|al\s*form|alform|알루미늄/i.test(`${minor} ${r.content || ''}`)) {
        minor = '알폼';
      } else {
        minor = (minor && !/거푸집|동바리|파이프서포트|비계/.test(minor)) ? minor : '갱폼';
      }
    } else if (['동바리', '거푸집', '거푸집동바리', '거푸집 동바리'].includes(mid)) {
      mid = '거푸집/동바리';
    }

    // 3) 비계 하위에 거푸집이 들어간 경우 (예: 비계 > 거푸집) -> 교정
    if (mid === '비계' && (minor.includes('거푸집') || minor.includes('폼') || /gang|알폼/i.test(minor))) {
      mid = isSpecialForm ? '특수거푸집' : '거푸집/동바리';
      if (isSpecialForm) minor = /알폼|al\s*form|alform|알루미늄/i.test(`${minor} ${r.content || ''}`) ? '알폼' : '갱폼';
    }

    // 이미 유효한 대/중이 정해져 있다면 즉시 반환
    if (major && mid && validMajors.includes(major)) {
      if (mid === '특수거푸집' && (!minor || /파이프서포트|시스템비계/.test(minor))) {
        minor = /알폼|al\s*form|alform|알루미늄/i.test(`${r.content || ''}`) ? '알폼' : '갱폼';
      }
      return { major, mid, minor: minor || mid };
    }

    // 미지정 레거시 레코드인 경우 키워드로 자동 추론
    const text = `${r.content || ''} ${r.item || ''} ${r.agent || ''} ${r.workName || ''}`;
    if (/갱폼|gang\s*form|gangform|특수거푸집|선해체|알폼|al\s*form|alform|알루미늄/i.test(text)) {
      major = '가시설';
      mid = '특수거푸집';
      minor = /알폼|al\s*form|alform|알루미늄/i.test(text) ? '알폼' : '갱폼';
    } else if (text.includes('전등') || text.includes('투광등') || text.includes('조도') || text.includes('조명')) {
      major = '전기시설';
      mid = '전등시설';
      minor = minor || '투광등';
    } else if (text.includes('누전차단기') || text.includes('멀티작업선') || text.includes('접지')) {
      major = '전기시설';
      if (text.includes('누전차단기')) mid = '누전차단기';
      else if (text.includes('접지')) mid = '접지시설';
      else mid = '전선';
      minor = minor || (text.includes('누전차단기') ? '누전차단기' : '가설전선/이동릴선');
    } else if (text.includes('소화기') || text.includes('화재')) {
      major = '소방시설';
      mid = '소화시설';
      minor = minor || '분말소화기';
    } else if (text.includes('펌프카') || text.includes('크레인') || text.includes('지게차') || text.includes('굴착기')) {
      major = '건설장비';
      if (text.includes('펌프카')) { mid = '생산장비'; minor = '펌프카'; }
      else if (text.includes('크레인')) { mid = '양중장비'; minor = minor || '타워크레인'; }
      else if (text.includes('굴착기')) { mid = '굴착장비'; minor = '굴착기'; }
      else if (text.includes('지게차')) { mid = '운반장비'; minor = '지게차'; }
    } else if (text.includes('말비계') || text.includes('사다리') || text.includes('우마')) {
      major = '작업발판';
      mid = text.includes('사다리') ? '이동식 사다리' : '말비계';
      minor = minor || mid;
    } else if (text.includes('안전대') && (text.includes('미착용') || text.includes('보호구') || text.includes('체결'))) {
      if (text.includes('부착설비') || text.includes('생명줄') || text.includes('걸이')) {
        major = '가시설';
        mid = '안전시설';
        minor = '안전대걸이시설';
      } else {
        major = 'PPE';
        mid = '안전대';
        minor = minor || '안전대';
      }
    } else if (text.includes('동바리') || text.includes('서포트')) {
      major = '가시설';
      mid = '거푸집/동바리';
      minor = minor || (text.includes('시스템') ? '시스템동바리' : '파이프서포트');
    } else if (text.includes('거푸집') || text.includes('알폼') || text.includes('유로폼')) {
      major = '가시설';
      mid = '거푸집/동바리';
      minor = minor || (text.includes('알폼') ? '알폼' : '유로폼');
    } else if (text.includes('난간') || text.includes('개구부') || text.includes('방호선반') || text.includes('방망') || text.includes('낙하물방지')) {
      major = '가시설';
      mid = '안전시설';
      if (text.includes('난간')) minor = minor || '안전난간';
      else if (text.includes('덮개') || text.includes('개구부')) minor = minor || '덮개';
      else minor = minor || '낙하방지시설';
    }

    major = major || r.kind || '가시설';
    mid = mid || r.item || '비계';
    minor = minor || r.agent || '시스템비계';

    return { major, mid, minor };
  }

  // ── 2. 개정 대장 열 정의 (총 31개 열) ──
  // [그룹, 항목명, 너비, 드롭다운 목록키, 값 추출 함수]
  const COLS = [
    ['No', 'No', 5, null, (r, i) => i + 1],
    
    // [부적합 사항] 사진 1 & 사진 2 및 사진 요약(배너)
    ['부적합 사항', '사진 1', 18, null, () => ''],
    ['부적합 사항', '사진 2', 18, null, () => ''],
    ['부적합 사항', '사진 요약(배너)', 22, null, r => resolvePhotoBanner(r)],
    ['부적합 사항', '부적합 등급', 12, 'severities', r => r.severity || '중부적합'],
    ['부적합 사항', '내용', 28, null, r => cleanContent(r.content || '')],
    ['부적합 사항', '협력사', 14, null, r => cleanSubcontractor(r.subcontractor)],
    ['부적합 사항', '장소/위치', 14, 'locations', r => cleanLocation(r.location, r.content)],

    // [공종·작업방법] 하나로 묶고 9×9 반영 ("작업명" -> "작업방법")
    ['공종·작업방법', '공종', 15, 'workGroups', r => cleanWorkGroup(r.workGroup, r.content)],
    ['공종·작업방법', '작업방법', 16, 'workMethods', r => resolveWorkMethod(r)],

    // [부적합 분류] 유형과 기인물(대, 중, 소)
    ['부적합 분류', '유형', 12, 'types', r => mapAccidentType(r.type)],
    // [재해 형태 22대 유형 통계 마크 열 (Image 2 실물 엑셀로그 일치)]
    ...ACCIDENT_TYPES.map(type => ['재해유형', type, 6, 'mark', r => mapAccidentType(r.type) === type ? '●' : '']),
    ['부적합 분류', '기인물(대)', 14, 'agentsMajor', r => resolveAgentHierarchy(r).major],
    ['부적합 분류', '기인물(중)', 14, 'agentsMid', r => resolveAgentHierarchy(r).mid],
    ['부적합 분류', '기인물(소)', 18, 'agentsMinor', r => resolveAgentHierarchy(r).minor],

    // [관련근거]
    ['관련근거', '산업안전보건법', 24, 'laws', r => r.law || (r.basis && r.basis.law) || ''],

    // [불안전 상황]
    ['불안전 상황', '상태', 18, 'conditions', r => resolveCondition(r)],
    ['불안전 상황', '행동', 18, 'actions', r => resolveAction(r)],

    // [근본원인 분석] (원인구분, Hold point, 관리/책임주체 열 삭제 완료)
    ['근본원인 분석', '법적 관리감독', 18, 'rootCausesMgmt', r => r.rootCauseMgmt || (r.basis && r.basis.근본원인_관리감독) || ''],
    ['근본원인 분석', '안전시스템', 20, 'rootCausesSystem', r => r.rootCauseSystem || (r.basis && r.basis.근본원인_안전시스템) || ''],

    // [발생원인] 4대 요인 통계 마크 열 (계획 미수립, 계획 미이행, 불안전 행동, 불안전 상태)
    ['발생원인', '계획 미수립', 8, 'mark', r => markCause(r, '계획 미수립')],
    ['발생원인', '계획 미이행', 8, 'mark', r => markCause(r, '계획 미이행')],
    ['발생원인', '불안전 행동', 8, 'mark', r => markCause(r, '불안전 행동')],
    ['발생원인', '불안전 상태', 8, 'mark', r => markCause(r, '불안전 상태')],

    // [관계자·점검자 의견] 관계자 구분(작성자), 관계자 의견, 점검자 의견 구분, 점검자 의견
    ['관계자·점검자 의견', '관계자 구분', 14, null, r => r.interviewAuthor || '시공관리자 및 근로자'],
    ['관계자·점검자 의견', '관계자 의견', 20, null, r => cleanOpinionText(r.interviewOpinion || r.workerOpinion || '')],
    ['관계자·점검자 의견', '점검자 의견 구분', 14, 'inspectorOpinionTypes', r => getInspectorOpinionType(r)],
    ['관계자·점검자 의견', '점검자 의견', 24, null, r => cleanProposalText(r.auditProposal || r.inspectorOpinion || '')],

    // [현장/컨설팅]
    ['현장/컨설팅', '현장명', 16, 'sites', r => r.site || ''],
    ['현장/컨설팅', '상품유형', 12, 'productTypes', r => r.productType || '공동주택'],
    ['현장/컨설팅', '공정률(%)', 8, null, r => r.progressRate !== undefined && r.progressRate !== null ? (r.progressRate + '%') : (r.siteInfo && r.siteInfo.progress ? r.siteInfo.progress + '%' : '')],
    ['현장/컨설팅', '표준공정단계', 16, 'stages', r => r.stage || '지상 골조 단계'],

    // [조치사항] (개선대책 및 PM 판정결과 포함)
    ['조치사항', '조치내용', 28, null, r => resolveActionPlanText(r)],
    ['조치사항', 'PM 판정결과', 14, 'inspectorOpinionTypes', r => getPmVerdictType(r)],
    ['조치사항', '조치사진', 18, null, () => ''],

    // [관리정보(자동)]
    ['관리정보(자동)', '점검일자', 11, null, r => r.inspectedDate || ''],
    ['관리정보(자동)', '점검자', 8, null, r => r.inspector || r.inspectUser || ''],
  ];

  const PHOTO1_COL = COLS.findIndex(c => c[1] === '사진 1') + 1;
  const PHOTO2_COL = COLS.findIndex(c => c[1] === '사진 2') + 1;
  const FIX_PHOTO_COL = COLS.findIndex(c => c[1] === '조치사진') + 1;

  const YELLOW = 'FFFFFF00';
  const GROUP_FILL = {
    '조치사항': 'FFC6EFCE',
    '관리정보(자동)': 'FFD9E1F2',
    '현장/컨설팅': 'FFE0E7FF',
    '공종·작업방법': 'FFFEF08A',
    '부적합 분류': 'FFFED7AA',
    '근본원인 분석': 'FFFEE2E2',
    '발생원인': 'FFFBCFE8',
    '관계자·점검자 의견': 'FFDDD6FE',
    '관련근거': 'FFE2E8F0',
    '불안전 상황': 'FFFFF3C4'
  };
  const thin = { style: 'thin', color: { argb: 'FF7F7F7F' } };
  const border = { top: thin, left: thin, bottom: thin, right: thin };
  const LEFT_COLS = ['내용', '조치내용', '관계자 의견', '점검자 의견', '산업안전보건법', '상태', '행동', '법적 관리감독', '안전시스템'];

  const uniq = a => [...new Set(a.filter(Boolean))];

  // 9×9 마스터 데이터 기본값 (현장 최신 표준)
  const DEFAULT_9X9_AREAS = ['가시설', '건설장비', '작업방법', '작업공도구', '작업발판', '작업장소(환경)', '전기시설', '소방시설', '개인보호구'];
  const DEFAULT_ROOT_MGMT = [
    '작업계획 미수립', '작업계획 미이행/부족', '작업지시 부족', '작업시설 미설치', '작업시설 유지보수 미실시',
    '안전시설 미설치', '안전시설 유지보수 미실시', '안전점검 미실시', '작업지휘 미실시', '작업지휘자 미배치',
    '유도원 미배치', '신호수 미배치', '신호체계 미지정', '자격·면허·경험자 미배치', '작업범위 및 절차 미교육',
    '관계자 외 출입금지 미조치', '통제시설 미설치', '방호장치 미설치', '보호구 미지급', '보호구 사용 감시 소홀',
    '작업중지 기준 미설정', '운전속도 기준 미설정', '조립도 부실', '구조도/설계도 부실', '감시인(화기/밀폐) 미배치',
    '작업중지/긴급조치 미실시', '계측관리 미실시', '작업환경 측정 미실시', '작업 전 강도 미확인', '조명시설 미설치',
    '정리정돈 미실시', '폐기물 미처리', '청소 미실시', '차수/배수 미처리', '흡연장소 미지정',
    '작업 전 가연물 미차단', '작업 전 전원 미차단', 'LOTO(잠금/표지) 미실시', 'PTW(안전작업허가제) 미실시'
  ];
  const DEFAULT_ROOT_SYSTEM = [
    '계획: 현장 안전계획 미수립', '계획: 안전계획 직원/협력사 교육 미실시',
    '계획: 중점위험작업 안전대책 미수립/미승인', '계획: 시공계획서 안전대책 미수립/미승인',
    '계획: 위험성평가표 미승인/협력사 미참여', '계획: 건설기계작업계획서 미승인/미이행',
    '실행: 안전교육 미실시', '실행: 안전조회/TBM 미실시', '실행: 일일 작업계획 안전대책 미포함',
    '실행: 안전시설 미설치', '실행: 작업환경 미조성', '실행: 안전보호구 미사용',
    '확인: 일일점검 미실시', '확인: 일일점검 결과 Feedback 미흡',
    '확인: PTW(작업허가) 미실시/Feedback 미흡', '확인: 시정조치 요구 및 이행확인 소홀',
    '개선: 작업자 관리상태 개정관리 미흡', '개선: 위험성평가 피드백 미반영', '개선: 안전협의체 법적기준 미준수'
  ];

  const DEFAULT_AGENT_TREE = {
    '가시설': {
      '비계': ['시스템비계', '강관비계', '틀비계'],
      '흙막이': ['수직재', '수평재', '코너부', '경사재', '토사부', '상부'],
      '동바리': ['시스템동바리', '파이프서포트', '잭서포트', '강관동바리'],
      '거푸집': ['유로폼', '알폼', '합판거푸집', '보거푸집'],
      '거푸집/동바리': ['시스템동바리', '파이프서포트', '잭서포트'],
      '특수거푸집': ['갱폼', 'ACS', 'RCS', 'SLIP'],
      '철골': ['기둥', '큰보', '작은보', '경사보', '계단'],
      '데크플레이트': ['보접합부', '코너부', '데크'],
      'PC': ['기둥(C)', '큰보(G)', '작은보(B)', '슬래브'],
      '안전시설': ['추락방지시설', '낙하방지시설'],
      '기타': ['기타']
    },
    '건설장비': {
      '굴착장비': ['굴착기', '불도저'],
      '천공장비': ['어스드릴', '오거', '항타/항발기'],
      '하역운반장비': ['지게차', '페이로더', '덤프트럭', '화물자동차', '트레일러', '컨베이어'],
      '양중장비': ['타워크레인', '타이어식크레인', '무한궤도식크레인', '천장주행크레인', '겐트리크레인', '호이스트', '카고크레인'],
      '탑승장비': ['건설용 리프트', '고소작업대', '고소작업차', '곤돌라'],
      '타설장비': ['펌프카', '레미콘믹스트럭'],
      '토공장비': ['토공장비', '포장장비', '아스팔트피니셔'],
      '해상장비': ['예인선', '통선', '바지선', '항타선', '크레인선', '플로팅도크', '준설선'],
      '기타': ['기타']
    },
    '작업방법': {
      '굴착작업': ['터파기', '되메우기', '사면굴착', '기타'],
      '하역운반작업': ['자재하역', '자재상차', '소운반', '기타'],
      '양중작업': ['타워크레인양중', '이동식크레인양중', '줄걸이작업', '신호작업', '기타'],
      '중량물취급작업': ['인력운반', '중량물거치', '기타'],
      '설치해체작업': ['비계설치해체', '거푸집설치해체', '동바리설치해체', '철골설치해체', '안전시설설치해체', '기타'],
      '가공조립작업': ['철근가공조립', '배관가공', '목공작업', '기타'],
      '운전조정작업': ['건설기계운전', '장비점검', '신호유도', '기타'],
      '고소작업': ['2m이상단부작업', '개구부주변작업', '지붕작업', '철골상부작업', '기타'],
      '기타': ['기타']
    },
    '작업공도구': {
      '화기': ['전기용접기', '가스용접기', '산소절단기', '토치', '용접건'],
      '절단기구': ['고속절단기', '각도절단기', '원형톱', '직소', '전동체인톱', '자동목재톱', '밴드톱', '철근절단기', '전기컷쏘', '파이프머신', '콘크리트 절단기', '보도블럭 절단기'],
      '회전기구': ['핸드드릴', '핸드그라인더', '전동드릴/드라이버', '철근절곡기', '믹서드릴', '원형사포', '탁상그라인더', '탁상드릴', '코어드릴', '마그네틱드릴', '콘크리트 샌딩기', '파이프홀가공기'],
      '압력기구': ['압력용기', '해머드릴', '고속살수기', '공기압축기'],
      '타정기구': ['타카', '인슬레이션 타카', '타징자동총'],
      '양중기구': ['와이어로프 슬링', '체인슬링', '벨트슬링', '라운드슬링', '샤클', '클램프', '턴버클', '마스터링', '리프팅 클러치', '양중함', '양중디바이스', '체인블럭', '레버블럭'],
      '운반기구': ['손동력카트', '전동샤키', '핸드자키'],
      '다짐기구': ['콘크리트 다짐기', '흙다짐기', '다짐롤러'],
      '기타': ['기타']
    },
    '작업발판': {
      '이동식틀비계': ['상부안전난간', '전도방지대(아웃트리거)', '바퀴스토퍼', '작업발판', '승강설비'],
      '사다리': ['A형사다리', '일자사다리', '신축형사다리', '발판사다리'],
      '말비계': ['1단말비계', '2단말비계', '도배우마', '목공우마'],
      '각립비계': ['디딤판', '힌지고정쇠', '미끄럼방지캡', '수평연결재'],
      '달비계': ['작업대', '달기로프', '구명줄', '안전대체결점'],
      '달대비계': ['달대체인', '행거', '작업발판', '발판고정철물'],
      '낮은발판': ['이동식발판', '우마발판', '단부받침대'],
      '현장제작발판': ['목재발판', '합판발판', '강재발판'],
      '기타': ['기타']
    },
    '작업장소(환경)': {
      '습윤장소': ['바닥물고임', '지하침수구간', '외부노출습윤지'],
      '밀폐공간': ['정화조/맨홀', '배관피트/PS실', '물탱크/저수조', '지하실구석'],
      '협소공간': ['승강기피트', '배관샤프트', '옹벽틈새'],
      '조명채광부족': ['지하암실', '야간작업구간', '조명미설치구간'],
      '소음진동': ['압축기/발전기주변', '파쇄작업구간', '착암구간'],
      '개구부/단부주변': ['슬래브단부', '바닥개구부주변', '계단참개구부', '엘리베이터개구부'],
      '중량물 하부/주변': ['크레인양중하부', '자재적재하부', '차량동선주변'],
      '통로/계단': ['가설통로', '계단실', '경사로', '사다리통로'],
      '기타': ['기타']
    },
    '전기시설': {
      '수전시설': ['특고압변압기', '수전반', '인입전주'],
      '전선이송설비': ['가공전선지지대', '케이블트레이', '전선보호관'],
      '분전반': ['가설분전함', '누전차단기(ELCB)', '외함접지', '도어잠금장치'],
      '전선': ['이동전선(캡타이어)', '가설배선', '가공전선', '피복손상전선'],
      '접지시설': ['제3종접지', '기계외함접지', '접지선연결', '접지극'],
      '조명시설': ['투광등', '작업등', '핸드램프', '비상유도등'],
      '냉난방기': ['전기온풍기', '열풍기', '에어컨', '제습기'],
      '충전시설': ['배터리보관함', '화재안전충전함', '고소작업대충전기'],
      '기타': ['기타']
    },
    '소방시설': {
      '비상통로': ['비상대피로', '유도등/표지판', '피난계단'],
      '화재수신반': ['가설화재수신기', '방재실수신반', '발신기'],
      '화재감지시설': ['단독경보형감지기', '열감지기', '연기감지기'],
      '스프링쿨러': ['소방배관', '헤드방호', '간이스프링클러'],
      '임시소방시설': ['분말소화기(ABC)', '간이소화장치', '비상경보장치', '간이피난유도선'],
      '불티비산방지': ['불티비산방지포(방포)', '용접차단막', '모래통/수조'],
      '가설건물': ['컨테이너사무실', '근로자휴게실', '자재창고'],
      '생활화재': ['흡연장소', '난로/전열기주변', '취사설비'],
      '기타': ['기타']
    },
    '개인보호구': {
      '안전모': ['턱끈체결', '충격흡수재', '안전모모체'],
      '보안경': ['보안경착용', '차광보안경', '용접면'],
      '귀마개/덮개': ['귀마개', '귀덮개', '방음보호구'],
      '호흡기 마스크': ['방진마스크(1급/특급)', '방독마스크', '송기마스크'],
      '안전대': ['상체식하네스', '전체식하네스', '죔줄/카라비너', '충격흡수장치(쇽업소버)', '이중고리'],
      '안전장갑': ['코팅장갑', '절연장갑', '가죽용접장갑', '내화학장갑'],
      '안전화': ['가죽안전화', '선심/답판보호', '단화/중단화', '정전기안전화'],
      '절연장화': ['절연화', '방수절연장화', '정전화'],
      '기타': ['기타']
    }
  };

  function buildLists(tax, custom, sites) {
    custom = custom || {};
    const allItems = (tax && tax.categories && tax.categories.list) ? tax.categories.list.flatMap(c => c.items.map(i => ({ ...i, kind: c.kind }))) : [];
    const add = (key, base) => uniq([...base, ...(custom[key] || [])]);
    const agentTree = (tax && tax._tax9 && tax._tax9.agentTree) || DEFAULT_AGENT_TREE;

    const majorList = Object.keys(agentTree);
    const midList = uniq(Object.values(agentTree).flatMap(m => Object.keys(m)));
    const minorList = uniq([
      ...Object.values(agentTree).flatMap(m => Object.values(m).flat()),
      ...(custom.agentMinor || []),
      ...(custom.agent || [])
    ]);

    return {
      lists: {
        severities: ['중부적합', '경부적합'],
        productTypes: ['공동주택', '오피스/지식산업센터', '물류센터/공장', '플랜트/산업설비', '토목/인프라', '기타'],
        stages: ['착공 및 토공사 단계', '지하 골조 공사 단계', '지상 골조 및 외부 가설 단계', '마감 및 기계전기 설비 단계', '준공 및 부대토목 단계'],
        locations: ACCIDENT_LOCATIONS,
        types: ACCIDENT_TYPES,
        agentsMajor: add('agentMajor', majorList),
        agentsMid: add('agentMid', midList),
        agentsMinor: add('agentMinor', minorList),
        conditions: add('condition', (tax && tax.unsafeConditions && tax.unsafeConditions.list) || []),
        actions: add('action', (tax && tax.unsafeActions && tax.unsafeActions.list) || []),
        workGroups: uniq([...WORK_GROUPS, ...(custom.workGroup || [])]),
        workMethods: uniq([...WORK_METHODS_9X9, ...(custom.workMethod || []), ...(custom.workName || [])]),
        agents: add('agent', allItems.flatMap(i => i.agents || [])),
        laws: add('law', allItems.map(i => i.law)),
        rootCausesMgmt: DEFAULT_ROOT_MGMT,
        rootCausesSystem: DEFAULT_ROOT_SYSTEM,
        inspectorOpinionTypes: INSPECTOR_OPINION_TYPES,
        mark: ['●'],
        sites: uniq((sites || []).map(s => s.name)),
      },
      allItems,
    };
  }

  const LIST_TITLES = {
    severities: '부적합 등급',
    productTypes: '상품유형',
    stages: '표준공정단계',
    locations: '사고장소',
    workGroups: '공종',
    workMethods: '작업방법',
    types: '유형(발생형태)',
    agentsMajor: '기인물(대)',
    agentsMid: '기인물(중)',
    agentsMinor: '기인물(소)',
    conditions: '불안전한 상태',
    actions: '불안전한 행동',
    agents: '기인물',
    laws: '관련 조문',
    rootCausesMgmt: '근본원인(관리감독)',
    rootCausesSystem: '근본원인(시스템)',
    inspectorOpinionTypes: '점검자 의견 구분',
    mark: '발생원인 표시',
    sites: '현장명',
  };

  async function build(ExcelJS, opts) {
    const { records = [], taxonomy: tax, customValues, sites, loadImage, emptyRows = 30 } = opts;
    const { lists, allItems } = buildLists(tax, customValues, sites);
    const wb = new ExcelJS.Workbook();
    wb.creator = 'SafePatrol AI Lab';
    wb.created = new Date();

    // ═════════ Sheet 1. 부적합사항대장 ═════════
    const ws = wb.addWorksheet('부적합사항대장', {
      views: [{ state: 'frozen', xSplit: 3, ySplit: 2 }],
      pageSetup: { paperSize: 8, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: '1:2' },
    });
    COLS.forEach((c, i) => { ws.getColumn(i + 1).width = c[2]; });
    const r1 = ws.getRow(1), r2 = ws.getRow(2);
    r1.height = 22; r2.height = 30;
    COLS.forEach((c, i) => { r1.getCell(i + 1).value = c[0]; r2.getCell(i + 1).value = c[1]; });
    let start = 0;
    for (let i = 1; i <= COLS.length; i++) {
      if (i === COLS.length || COLS[i][0] !== COLS[start][0]) {
        if (COLS[start][0] === COLS[start][1]) ws.mergeCells(1, start + 1, 2, start + 1);
        else if (i - 1 > start) ws.mergeCells(1, start + 1, 1, i);
        start = i;
      }
    }
    [r1, r2].forEach(r => {
      for (let i = 1; i <= COLS.length; i++) {
        const cell = r.getCell(i);
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GROUP_FILL[COLS[i - 1][0]] || YELLOW } };
        cell.font = { name: '맑은 고딕', size: 9, bold: true };
        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        cell.border = border;
      }
    });

    const IMG_W = 124, IMG_H = 93;
    const placeImage = async (path, col, rowIdx) => {
      if (!path || !loadImage) return false;
      try {
        const img = await loadImage(path);
        if (!img || !img.base64) return false;
        const id = wb.addImage({ base64: img.base64, extension: img.extension || 'jpeg' });
        ws.addImage(id, { tl: { col: col - 1 + 0.06, row: rowIdx - 1 + 0.06 }, ext: { width: IMG_W, height: IMG_H }, editAs: 'oneCell' });
        return true;
      } catch (e) { return false; }
    };

    const total = records.length + emptyRows;
    for (let n = 0; n < total; n++) {
      const rowIdx = n + 3;
      const row = ws.getRow(rowIdx);
      row.height = 76;
      const rec = records[n];
      if (rec) {
        COLS.forEach((c, i) => { const v = c[4](rec, n); row.getCell(i + 1).value = v == null ? '' : v; });
        
        // [사진 1 & 사진 2 2개 배치]
        const p1 = (rec.photos || [])[0];
        if (p1 && !(await placeImage(p1, PHOTO1_COL, rowIdx))) row.getCell(PHOTO1_COL).value = '(사진1)';
        const p2 = (rec.photos || [])[1];
        if (p2 && !(await placeImage(p2, PHOTO2_COL, rowIdx))) row.getCell(PHOTO2_COL).value = '(사진2)';

        // [조치사진 배치]
        const fp = rec.fix && rec.fix.photo;
        if (fp && !(await placeImage(fp, FIX_PHOTO_COL, rowIdx))) row.getCell(FIX_PHOTO_COL).value = '(조치사진)';

        if (opts.onProgress) opts.onProgress(n + 1, records.length);
      }
      for (let i = 1; i <= COLS.length; i++) {
        const cell = row.getCell(i);
        cell.border = border;
        const v = String(cell.value == null ? '' : cell.value);
        let fontColor = 'FF000000';
        let isBold = false;
        if (v === '(미조치)' || v.includes('중부적합')) { fontColor = 'FFDC2626'; isBold = true; }
        else if (v.includes('경부적합')) { fontColor = 'FFD97706'; isBold = true; }
        else if (v.startsWith('(사진') || v.startsWith('(조치사진')) { fontColor = 'FFA6A6A6'; }
        cell.font = { name: '맑은 고딕', size: 9, bold: isBold, color: { argb: fontColor } };
        if (COLS[i - 1][1].includes('등급')) {
          if (v.includes('중부적합')) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } };
          else if (v.includes('경부적합')) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } };
        }
        cell.alignment = { horizontal: LEFT_COLS.includes(COLS[i - 1][1]) ? 'left' : 'center', vertical: 'middle', wrapText: true };
      }
    }

    // ═════════ Sheet 2. 건설안전점검 9X9단 ═════════
    const ws9 = wb.addWorksheet('건설안전 9×9단', {
      views: [{ state: 'frozen', ySplit: 2 }]
    });
    ws9.columns = [
      { key: 'c1', width: 14 }, { key: 'c2', width: 16 }, { key: 'c3', width: 16 },
      { key: 'c4', width: 14 }, { key: 'c5', width: 16 }, { key: 'c6', width: 14 },
      { key: 'c7', width: 14 }, { key: 'c8', width: 14 }, { key: 'c9', width: 14 }
    ];

    ws9.mergeCells('A1:I1');
    const title9 = ws9.getCell('A1');
    title9.value = '건설안전점검 9×9단 (81개 핵심 점검 매트릭스)';
    title9.font = { name: '맑은 고딕', size: 12, bold: true, color: { argb: 'FF1E293B' } };
    title9.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFDE047' } };
    title9.alignment = { horizontal: 'center', vertical: 'middle' };
    ws9.getRow(1).height = 28;

    const r2_9 = ws9.getRow(2);
    r2_9.height = 24;
    DEFAULT_9X9_AREAS.forEach((a, i) => {
      const c = r2_9.getCell(i + 1);
      c.value = a;
      c.font = { name: '맑은 고딕', size: 10, bold: true, color: { argb: 'FF000000' } };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFACC15' } };
      c.alignment = { horizontal: 'center', vertical: 'middle' };
      c.border = border;
    });

    const MATRIX_DATA_9X9 = [
      ['비계', '굴착장비', '굴착작업', '화기', '이동식틀비계', '습윤장소', '수전시설', '비상통로', '안전모'],
      ['흙막이', '천공장비', '하역운반작업', '절단기구', '사다리', '밀폐공간', '전선이송설비', '화재수신반', '보안경'],
      ['거푸집/동바리', '하역운반장비', '양중작업', '회전기구', '말비계', '협소공간', '분전반', '화재감지시설', '귀마개/덮개'],
      ['특수거푸집', '양중장비', '중량물취급작업', '압력기구', '각립비계', '조명채광부족', '전선', '스프링쿨러', '호흡기 마스크'],
      ['철골', '탑승장비', '설치해체작업', '타정기구', '달비계', '소음진동', '접지시설', '임시소방시설', '안전대'],
      ['PC', '타설장비', '가공조립작업', '양중기구', '달대비계', '개구부/단부주변', '조명시설', '불티비산방지', '안전장갑'],
      ['데크플레이트', '토공장비', '운전조정작업', '운반기구', '낮은발판', '중량물 하부/주변', '냉난방기', '가설건물', '안전화'],
      ['안전시설', '해상장비', '고소작업', '다짐기구', '현장제작발판', '통로/계단', '충전시설', '생활화재', '절연장화'],
      ['기타', '기타', '기타', '기타', '기타', '기타', '기타', '기타', '기타']
    ];

    MATRIX_DATA_9X9.forEach((rowVals, rIdx) => {
      const row = ws9.getRow(3 + rIdx);
      row.height = 22;
      rowVals.forEach((val, cIdx) => {
        const c = row.getCell(cIdx + 1);
        c.value = val;
        c.font = { name: '맑은 고딕', size: 9 };
        c.alignment = { horizontal: 'center', vertical: 'middle' };
        c.border = border;
      });
    });

    // ── 가시설 심층 분류 테이블 ──
    const startRow2 = 13;
    ws9.mergeCells(`A${startRow2}:I${startRow2}`);
    const subTitle = ws9.getCell(`A${startRow2}`);
    subTitle.value = '가시설 심층 세부 분류체계';
    subTitle.font = { name: '맑은 고딕', size: 11, bold: true, color: { argb: 'FF991B1B' } };
    subTitle.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFECDD3' } };
    subTitle.alignment = { horizontal: 'center', vertical: 'middle' };
    ws9.getRow(startRow2).height = 26;

    const TEMP_DETAIL_ROWS = [
      ['가시설 대상', '세부 사양 1', '세부 사양 2', '세부 사양 3', '세부 사양 4', '기타 사양'],
      ['비계', '시스템비계', '강관비계', '틀비계', '', ''],
      ['흙막이', '수직재', '수평재', '코너부', '경사재', '토사부/상부'],
      ['거푸집/동바리', '시스템동바리', '파이프서포트', '잭서포트', '', ''],
      ['특수거푸집', '갱폼', 'ACS', 'RCS', 'SLIP', ''],
      ['철골', '기둥', '큰보', '작은보', '경사보', '계단'],
      ['데크플레이트', '보접합부', '코너부', '데크', '', ''],
      ['PC', '기둥(C)', '큰보(G)', '작은보(B)', '슬래브', ''],
      ['안전시설', '추락방지시설', '낙하방지시설', '', '', '']
    ];

    TEMP_DETAIL_ROWS.forEach((rVals, idx) => {
      const row = ws9.getRow(startRow2 + 1 + idx);
      row.height = 22;
      rVals.forEach((v, cIdx) => {
        const c = row.getCell(cIdx + 1);
        c.value = v;
        c.font = { name: '맑은 고딕', size: 9, bold: idx === 0 || cIdx === 0 };
        c.alignment = { horizontal: 'center', vertical: 'middle' };
        c.border = border;
        if (idx === 0) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFDE047' } };
        else if (cIdx === 0) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
      });
    });

    // ═════════ Sheet 3. 분류기준 (드롭다운 소스) ═════════
    const wl = wb.addWorksheet('분류기준');
    const listRange = {};
    Object.keys(lists).forEach((k, i) => {
      const col = i + 1;
      const letter = wl.getColumn(col).letter;
      const vals = lists[k];
      wl.getColumn(col).width = Math.max(12, Math.min(36, Math.max(4, ...vals.map(s => String(s).length)) * 1.6));
      const h = wl.getCell(1, col);
      h.value = LIST_TITLES[k] || k;
      h.font = { bold: true, size: 10 };
      h.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: YELLOW } };
      h.border = border;
      vals.forEach((val, j) => { const c = wl.getCell(j + 2, col); c.value = val; c.border = border; c.font = { size: 9 }; });
      listRange[k] = `분류기준!$${letter}$2:$${letter}$${vals.length + 31}`;
    });
    wl.views = [{ state: 'frozen', ySplit: 1 }];

    COLS.forEach((c, i) => {
      if (!c[3] || !listRange[c[3]]) return;
      const letter = ws.getColumn(i + 1).letter;
      ws.dataValidations.add(`${letter}3:${letter}${total + 2}`, {
        type: 'list', allowBlank: true, formulae: [listRange[c[3]]],
        showErrorMessage: false, showInputMessage: true, promptTitle: c[1], prompt: '목록에서 선택하거나 직접 입력하세요',
      });
    });

    // ═════════ Sheet 4. 항목별 법령·수칙 ═════════
    if (allItems && allItems.length > 0) {
      const wr = wb.addWorksheet('항목별 법령·수칙');
      wr.columns = [
        { header: '종류', key: 'kind', width: 13 }, { header: '항목', key: 'name', width: 18 },
        { header: '대표 유형', key: 'type', width: 18 }, { header: '관련 조문', key: 'law', width: 30 },
        { header: '주요 기인물', key: 'agents', width: 40 }, { header: '핵심 안전수칙', key: 'rules', width: 70 },
      ];
      allItems.forEach(it => wr.addRow({
        kind: it.kind, name: it.name, type: it.defaultType, law: it.law,
        agents: (it.agents || []).join(', '), rules: (it.rules || []).map((r, i) => `${i + 1}. ${r}`).join('\n'),
      }));
      wr.eachRow((row, idx) => row.eachCell(cell => {
        cell.border = border; cell.alignment = { vertical: 'middle', wrapText: true }; cell.font = { size: 9, bold: idx === 1 };
        if (idx === 1) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: YELLOW } };
      }));
      wr.views = [{ state: 'frozen', ySplit: 1 }];
    }

    return wb;
  }

  return {
    build,
    COLS,
    ACCIDENT_LOCATIONS,
    ACCIDENT_TYPES,
    WORK_METHODS_9X9,
    WORK_GROUPS,
    WORK_GROUPS_9X9: WORK_GROUPS,
    INSPECTOR_OPINION_TYPES,
    resolveAgentHierarchy,
    mapAccidentType,
    markCause,
    getInspectorOpinionType,
    cleanWorkGroup,
    cleanOpinionText,
    cleanProposalText,
    cleanContent,
    cleanLocation,
    healSafetyKoreanLexicon,
    resolveActionPlanText,
    resolvePhotoBanner,
    getPmVerdictType
  };
});
