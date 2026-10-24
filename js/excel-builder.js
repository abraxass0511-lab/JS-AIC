/**
 * SafePatrol 부적합사항대장 엑셀 생성기 (브라우저 / Node 공용)
 *   SafeExcel.build(ExcelJS, { records, taxonomy, customValues, sites, loadImage }) → Workbook
 *   - 2026 개정 안전점검표 규격 반영 (사고장소 20종, 발생형태대분류 17종, 9×9 공종·작업방법, 4대 관리원인 통계, 관계자·점검자 의견 및 3대 분류, 2매 사진 지원)
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SafeExcel = factory();
})(typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : this), function () {

  // ── 1. 첨부 사진 기반 표준 마스터 데이터 ──

  // [첨부 1] 사고장소 (20개 항목)
  const ACCIDENT_LOCATIONS = [
    '건축물', '본구조물', '가설물', '기계·기구', '설비·장치',
    '적재물', '옥상·지붕', '계단·복도', '엘리베이터홀', '천장 내부',
    '탱크 내부', '실내 작업장', '지하실', '실외 작업장', '외부',
    '도로', '야적장', '수상', '수중', '공중'
  ];

  // [첨부 2] 발생형태대분류 - 유형 (17개 항목)
  const ACCIDENT_TYPES = [
    '떨어짐(추락, 사람)',
    '끼임(협착, 감김)',
    '무너짐(붕괴, 도괴)/깔림',
    '넘어짐(전도: 사람)',
    '미끄러짐/접질림',
    '쓰러짐, 뒤집힘(전도, 전복: 자재/장비 등)',
    '부딪힘(충돌)/맞음',
    '떨어짐(낙하/비래)/맞음',
    '감전',
    '화재/폭발',
    '질식/중독 등',
    '베임/찔림/절단',
    '위험물질 노출/흡입/접촉 등',
    '개인질환/근골격계',
    '폭력행위',
    '기타',
    '분류불능'
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

  // 유형 표준 매핑 함수 (과거 단문형 데이터 호환)
  function mapAccidentType(raw) {
    if (!raw) return '';
    const s = String(raw).trim();
    if (ACCIDENT_TYPES.includes(s)) return s;
    if (s.includes('추락') || s.includes('떨어짐(사람)') || s === '떨어짐') return '떨어짐(추락, 사람)';
    if (s.includes('낙하') || s.includes('비래') || s.includes('맞음')) return '떨어짐(낙하/비래)/맞음';
    if (s.includes('협착') || s.includes('끼임') || s.includes('감김')) return '끼임(협착, 감김)';
    if (s.includes('붕괴') || s.includes('도괴') || s.includes('무너짐') || s.includes('깔림')) return '무너짐(붕괴, 도괴)/깔림';
    if (s.includes('전복') || s.includes('뒤집힘') || s.includes('쓰러짐')) return '쓰러짐, 뒤집힘(전도, 전복: 자재/장비 등)';
    if (s.includes('전도') || s.includes('넘어짐')) return '넘어짐(전도: 사람)';
    if (s.includes('미끄러짐') || s.includes('접질림')) return '미끄러짐/접질림';
    if (s.includes('충돌') || s.includes('부딪힘')) return '부딪힘(충돌)/맞음';
    if (s.includes('감전')) return '감전';
    if (s.includes('화재') || s.includes('폭발')) return '화재/폭발';
    if (s.includes('질식') || s.includes('중독') || s.includes('가스')) return '질식/중독 등';
    if (s.includes('베임') || s.includes('찔림') || s.includes('절단')) return '베임/찔림/절단';
    if (s.includes('위험물질') || s.includes('흡입') || s.includes('노출') || s.includes('접촉')) return '위험물질 노출/흡입/접촉 등';
    if (s.includes('질환') || s.includes('근골격계')) return '개인질환/근골격계';
    if (s.includes('폭력')) return '폭력행위';
    return s || '기타';
  }

  // 관리적 4대 발생원인 판별 함수 (● 마크)
  function markCause(r, causeName) {
    const mgmt = r.mgmtCauses || [];
    if (Array.isArray(mgmt)) {
      if (mgmt.some(c => String(c).includes(causeName))) return '●';
    } else if (typeof mgmt === 'string' && mgmt.includes(causeName)) {
      return '●';
    }
    if (Array.isArray(r.causes)) {
      if (causeName === '불안전 행동' && r.causes.includes('인적')) return '●';
      if (causeName === '불안전 상태' && r.causes.includes('물적')) return '●';
      if (r.causes.some(c => String(c).includes(causeName))) return '●';
    }
    if (causeName === '불안전 상태' && r.condition && r.condition !== '해당없음' && r.condition !== '-') return '●';
    if (causeName === '불안전 행동' && r.action && r.action !== '해당없음' && r.action !== '-') return '●';
    if (r.rootCauseMgmt && r.rootCauseMgmt.includes(causeName)) return '●';
    if (r.rootCauseSystem && r.rootCauseSystem.includes(causeName)) return '●';
    return '';
  }

  // 점검자 의견 분류 자동 판정
  function getInspectorOpinionType(r) {
    if (r.inspectorOpinionType && INSPECTOR_OPINION_TYPES.includes(r.inspectorOpinionType)) {
      return r.inspectorOpinionType;
    }
    if (r.auditType && INSPECTOR_OPINION_TYPES.includes(r.auditType)) {
      return r.auditType;
    }
    const text = (r.auditProposal || r.pmVerdict || '') + ' ' + (r.content || '');
    if (text.includes('벌점') || text.includes('페널티') || text.includes('과태료') || text.includes('고발')) {
      return '페널티';
    }
    if (text.includes('교육') || text.includes('코칭') || text.includes('TBM') || text.includes('지도')) {
      return '교육/코칭';
    }
    return '시스템 개선';
  }

  // 기인물 9×9 대-중-소 정규화 및 오류 방지 판정
  function resolveAgentHierarchy(r) {
    let major = r.agentMajor || '';
    let mid = r.agentMid || '';
    let minor = r.agentMinor || r.agent || '';

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

    // 2) 중분류가 '거푸집동바리'로 묶인 경우 -> 9×9 단독 중분류 '동바리' 또는 '거푸집'으로 정규화
    if (mid === '거푸집동바리') {
      mid = (minor.includes('동바리') || minor.includes('서포트')) ? '동바리' : '거푸집';
    }

    // 3) 비계 하위에 거푸집이 들어간 경우 (예: 비계 > 거푸집) -> '거푸집' 중분류로 교정
    if (mid === '비계' && (minor.includes('거푸집') || minor.includes('폼'))) {
      mid = '거푸집';
    }

    // 이미 유효한 대/중이 정해져 있다면 즉시 반환
    if (major && mid && validMajors.includes(major)) {
      return { major, mid, minor: minor || mid };
    }

    // 미지정 레거시 레코드인 경우 키워드로 자동 추론
    const text = `${r.content || ''} ${r.item || ''} ${r.agent || ''} ${r.workName || ''}`;
    if (text.includes('전등') || text.includes('투광등') || text.includes('조도') || text.includes('조명')) {
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
      mid = '동바리';
      minor = minor || '파이프서포트';
    } else if (text.includes('거푸집') || text.includes('갱폼') || text.includes('알폼') || text.includes('유로폼')) {
      major = '가시설';
      mid = '거푸집';
      minor = minor || (text.includes('갱폼') ? '갱폼' : '유로폼');
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
    
    // [부적합 사항] 사진 1 & 사진 2 신규 2열 구성
    ['부적합 사항', '사진 1', 18, null, () => ''],
    ['부적합 사항', '사진 2', 18, null, () => ''],
    ['부적합 사항', '부적합 등급', 12, 'severities', r => r.severity || '중부적합'],
    ['부적합 사항', '내용', 28, null, r => r.content || ''],
    ['부적합 사항', '협력사', 14, null, r => r.subcontractor || ''],
    ['부적합 사항', '장소/위치', 14, 'locations', r => r.location || ''],

    // [공종·작업방법] 하나로 묶고 9×9 반영 ("작업명" -> "작업방법")
    ['공종·작업방법', '공종', 15, 'workGroups', r => r.workGroup || '가설공사'],
    ['공종·작업방법', '작업방법', 16, 'workMethods', r => r.workMethod || r.workName || '고소작업'],

    // [부적합 분류] 유형과 기인물(대, 중, 소)
    ['부적합 분류', '유형', 20, 'types', r => mapAccidentType(r.type)],
    ['부적합 분류', '기인물(대)', 14, 'agentsMajor', r => resolveAgentHierarchy(r).major],
    ['부적합 분류', '기인물(중)', 14, 'agentsMid', r => resolveAgentHierarchy(r).mid],
    ['부적합 분류', '기인물(소)', 18, 'agentsMinor', r => resolveAgentHierarchy(r).minor],

    // [관련근거]
    ['관련근거', '산업안전보건법', 24, 'laws', r => r.law || (r.basis && r.basis.law) || ''],

    // [불안전 상황]
    ['불안전 상황', '상태', 18, 'conditions', r => r.condition || ''],
    ['불안전 상황', '행동', 18, 'actions', r => r.action || ''],

    // [근본원인 분석] (원인구분, Hold point, 관리/책임주체 열 삭제 완료)
    ['근본원인 분석', '법적 관리감독', 18, 'rootCausesMgmt', r => r.rootCauseMgmt || (r.basis && r.basis.근본원인_관리감독) || ''],
    ['근본원인 분석', '안전시스템', 20, 'rootCausesSystem', r => r.rootCauseSystem || (r.basis && r.basis.근본원인_안전시스템) || ''],

    // [발생원인] 4대 요인 통계 마크 열 (계획 미수립, 계획 미이행, 불안전 행동, 불안전 상태)
    ['발생원인', '계획 미수립', 8, 'mark', r => markCause(r, '계획 미수립')],
    ['발생원인', '계획 미이행', 8, 'mark', r => markCause(r, '계획 미이행')],
    ['발생원인', '불안전 행동', 8, 'mark', r => markCause(r, '불안전 행동')],
    ['발생원인', '불안전 상태', 8, 'mark', r => markCause(r, '불안전 상태')],

    // [관계자·점검자 의견] 시공자/관리자 의견 -> 관계자 의견, 점검단 제안 -> 점검자 의견, 3대 분류 추가
    ['관계자·점검자 의견', '관계자 의견', 20, null, r => r.interviewOpinion || r.workerOpinion || ''],
    ['관계자·점검자 의견', '점검자 의견 구분', 14, 'inspectorOpinionTypes', r => getInspectorOpinionType(r)],
    ['관계자·점검자 의견', '점검자 의견', 24, null, r => r.auditProposal || r.inspectorOpinion || ''],

    // [현장/컨설팅]
    ['현장/컨설팅', '현장명', 16, 'sites', r => r.site || ''],
    ['현장/컨설팅', '상품유형', 12, 'productTypes', r => r.productType || '공동주택'],
    ['현장/컨설팅', '공정률(%)', 8, null, r => r.progressRate !== undefined && r.progressRate !== null ? (r.progressRate + '%') : (r.siteInfo && r.siteInfo.progress ? r.siteInfo.progress + '%' : '')],
    ['현장/컨설팅', '표준공정단계', 16, 'stages', r => r.stage || '지상 골조 단계'],

    // [조치사항]
    ['조치사항', '조치내용', 24, null, r => (r.fix && r.fix.content) || '(미조치)'],
    ['조치사항', '조치사진', 18, null, () => ''],

    // [관리정보(자동)]
    ['관리정보(자동)', '점검일자', 11, null, r => r.inspectedDate || ''],
    ['관리정보(자동)', '점검자', 8, null, r => r.inspector || ''],
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

  // 9×9 마스터 데이터 기본값
  const DEFAULT_9X9_AREAS = ['가시설', '건설장비', '작업방법', '작업공도구', '작업발판', 'PPE', '전기시설', '소방시설', '작업장'];
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
      '비계': ['시스템비계', '강관비계', '이동식틀비계', '달비계', '달대비계', '말비계', '각립비계'],
      '흙막이': ['수직재', '수평재', '모서리부', '토사부', '어스앵커', '스트럿'],
      '동바리': ['시스템동바리', '강관동바리', '잭서포트', '파이프서포트'],
      '거푸집': ['갱폼', '알폼', '유로폼', '합판거푸집', '기타'],
      '특수거푸집': ['ACS', 'RCS', '슬립폼', '테이블폼', '클라이밍폼'],
      '데크': ['데크플레이트', '트러스데크', '이지데크'],
      '철골': ['철골기둥', '철골보', '가새', '데크단부'],
      'PC': ['PC기둥', 'PC보', 'PC슬래브', 'PC접합부'],
      '안전시설': ['추락방지시설(안전난간)', '추락방지시설(수직방호망)', '추락방지시설(덮개)', '추락방지시설(안전대걸이시설)', '낙하방지시설(방호선반)', '낙하방지시설(낙하물방지망)']
    },
    '건설장비': {
      '양중장비': ['타워크레인', '이동식크레인', '카고크레인', '호이스트'],
      '탑승장비': ['고소작업차', '고소작업대', '곤돌라', '건설용리프트'],
      '운반장비': ['지게차', '덤프트럭', '트레일러', '레미콘트럭'],
      '차량계건설기계': ['펌프카'],
      '생산장비': ['펌프카', '배처플랜트'],
      '굴착장비': ['굴착기'],
      '천공장비': ['천공기', '항타기', '항발기'],
      '토공장비': ['로더', '불도저'],
      '해상장비': ['해상크레인', '바지선', '예인선']
    },
    '작업공도구': {
      '용접기': ['아크용접기', 'CO2용접기', 'TIG용접기', '인버터용접기'],
      '화기': ['가스토치', '산소절단기', '가스용기(LPG/산소/아세틸렌)', '열풍기'],
      '절단기구': ['고속절단기', '휴대용절단기', '원형톱(핸드쏘)', '세이버쏘(컷소)', '밴드쏘', '플라즈마절단기'],
      '회전기구': ['핸드그라인더', '휴대용전기드릴', '해머드릴', '코아드릴', '교반기(믹서기)', '임팩트렌치/소켓'],
      '압력기구': ['에어콤프레셔', '압력용기', '고압세척기', '에어리스(도장분출기)'],
      '타정기구': ['에어타카/가스타카', '화약총(타정총)', '리벳건'],
      '운반기구': ['손수레(일륜차)', '핸드파렛트(핸드자키)', '소형대차(구루마/롤테이너)'],
      '양중기구': ['체인블록', '레버블록(풀링)', '슬링벨트(섬유벨트)', '와이어로프/샤클', '양중함/달기로프'],
      '수공구': ['망치/함마', '몽키스패너/파이프렌치', '첼라/바이스플라이어', '쇠지레(빠루)/볼트클리퍼']
    },
    '작업발판': {
      '틀비계': ['틀비계발판', '가새재', '아웃트리거'],
      '말비계': ['말비계발판', '지주부재', '보조부재'],
      '달비계': ['작업대', '달기로프', '구명줄'],
      '달대비계': ['달대체인', '달대파이프', '작업발판'],
      '각립비계': ['디딤판', '힌지고정쇠', '미끄럼방지캡'],
      '이동식 사다리': ['사다리발판', '전도방지대', '상부걸림턱'],
      '낮은 발판': ['족장판', '우마발판'],
      '현장제작발판': ['목재발판', '강재발판'],
      '지붕발판': ['지붕작업발판', '채광창덮개']
    },
    'PPE': {
      '안전모': ['턱끈', '충격흡수라이너', '모체'],
      '보안경/면': ['보안경', '차광보안경', '용접면'],
      '귀덮개/마개': ['귀마개', '귀덮개'],
      '호흡기보호구': ['방진마스크', '방독마스크', '송기마스크'],
      '안전대': ['상체식하네스', '전체식하네스', '죔줄', '이중고리'],
      '추락방지대': ['로립/롤링클램프', '안전블록(와이어/웨빙)'],
      '안전장갑': ['방진장갑', '가죽용접장갑', '절연장갑'],
      '안전장화': ['절연안전장화', '내유안전장화'],
      '안전화': ['가죽안전화', '정전기안전화', '절연안전화']
    },
    '전기시설': {
      '수전시설': ['고압수전반', '변압기', '특고압인입선'],
      '분전반': ['가설분전함', '외함잠금장치', '내부차단기'],
      '냉난방기': ['전기온풍기', '에어컨', '열풍기'],
      '전선': ['이동전선(캡타이어)', '가설배선', '가공전선'],
      '전등시설': ['투광등', '작업등', 'LED바', '비상유도등'],
      '전열시설': ['열선(양생용)', '전열기구'],
      '전기기구': ['충전기', '콘센트/플러그', '작업릴선'],
      '접지시설': ['제3종접지', '기계외함접지', '접지극'],
      '누전차단기': ['고감도누전차단기(30mA)', '인입누전차단기']
    },
    '소방시설': {
      '비상대피시설': ['비상대피유도선', '피난사다리', '비상구'],
      '화재수신반': ['가설화재수신기', '발신기'],
      '화재감지시설': ['단독경보형감지기', '열감지기', '연기감지기'],
      '스프링쿨러': ['임시소방배관', '간이스프링클러'],
      '소화시설': ['분말소화기(ABC)', '소화수통', '마른모래(방화사)'],
      '불티비산방지': ['방염포', '불티비산방지포', '비산방지차폐막'],
      '충전시설': ['배터리보관함', '화재안전충전함'],
      '가설건물': ['가설사무실', '근로자휴게실', '자재창고'],
      '생활화재': ['난로', '취사도구', '담배꽁초수거함']
    },
    '작업장': {
      '비상통로': ['주출입통로', '계단실통로', '비상대피로'],
      '작업구획': ['출입통제라인', '안전펜스', '칼라콘'],
      '통제구역': ['양중반경하부', '타설구역', '밀폐공간출입구'],
      '가설통로': ['경사로', '비계다리', '안전통로'],
      '자재야적장': ['철근야적장', '파이프적치대', '거푸집야적장'],
      '위험물보관소': ['페인트저장소', '유류저장고', '가스용기보관소'],
      '폐기물보관소': ['건축폐기물적재함', '분리수거장'],
      '조도확보': ['지하작업장조명', '어두운통로조명'],
      '청결상태': ['바닥잔재물정리', '못뽑기', '물고임제거']
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
      ['비계', '양중장비', '굴착작업', '용접기', '틀비계', '안전모', '수전시설', '비상대피시설', '비상통로'],
      ['흙막이', '탑승장비', '하역운반작업', '화기', '말비계', '보안경/면', '분전반', '화재수신반', '작업구획'],
      ['동바리', '운반장비', '양중작업', '절단기구', '달비계', '귀덮개/마개', '냉난방기', '화재감지시설', '통제구역'],
      ['거푸집', '차량계건설기계', '설치조립작업', '회전기구', '달대비계', '호흡기보호구', '전선', '스프링쿨러', '가설통로'],
      ['특수거푸집', '생산장비', '해체작업', '압력기구', '각립비계', '안전대', '전등시설', '소화시설', '자재야적장'],
      ['데크', '굴착장비', '중량물취급작업', '타정기구', '이동식 사다리', '추락방지대', '전열시설', '불티비산방지', '위험물보관소'],
      ['철골', '천공장비', '고소작업', '운반기구', '낮은 발판', '안전장갑', '전기기구', '충전시설', '폐기물보관소'],
      ['PC', '토공장비', '밀폐공간작업', '양중기구', '현장제작발판', '안전장화', '접지시설', '가설건물', '조도확보'],
      ['안전시설', '해상장비', '협소공간작업', '수공구', '지붕발판', '안전화', '누전차단기', '생활화재', '청결상태']
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
      ['비계', '시스템비계', '강관비계', '', '', ''],
      ['흙막이', '수직재', '수평재', '모서리부', '토사부', ''],
      ['동바리', '시스템동바리', '강관동바리', '잭서포트', '', ''],
      ['거푸집', '갱폼', '알폼', '유로폼', '기타', ''],
      ['특수거푸집', 'ACS', 'RCS', '슬립폼', '', ''],
      ['데크', '데크', '', '', '', ''],
      ['철골', '철골', '', '', '', ''],
      ['PC', 'PC', '', '', '', ''],
      ['안전시설', '추락방지시설(안전난간)', '추락방지시설(수직방호망)', '추락방지시설(덮개)', '추락방지시설(안전대걸이)', '낙하방지(방호선반/망)']
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
    getInspectorOpinionType
  };
});
