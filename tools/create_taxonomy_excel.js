/**
 * SafePatrol 표준 입력인자 분류표 엑셀(.xlsx) 생성 스크립트
 * 산안법, 산안규칙, 건진법, 중대재해처벌법 및 KOSHA 가이드에 근거한 정밀 데이터 아키텍처
 */
import ExcelJS from 'exceljs';
import path from 'path';

async function generateTaxonomyExcel() {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'SafePatrol AI Lab';
  wb.created = new Date();

  // 폰트 및 스타일 정의
  const fontTitle = { name: '맑은 고딕', size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
  const fontHeader = { name: '맑은 고딕', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
  const fontGroup = { name: '맑은 고딕', size: 10, bold: true };
  const fontBody = { name: '맑은 고딕', size: 9 };
  const fontBold = { name: '맑은 고딕', size: 9, bold: true };

  const fillTitle = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } }; // Dark Navy
  const fillHeader = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF3B82F6' } }; // Blue 500
  const fillGroup1 = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E7FF' } }; // Indigo Light
  const fillGroup2 = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCFCE7' } }; // Green Light
  const fillGroup3 = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } }; // Red Light
  const fillGroup4 = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } }; // Yellow Light
  const fillGroup5 = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3E8FF' } }; // Purple Light

  const thinBorder = {
    top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    right: { style: 'thin', color: { argb: 'FFCBD5E1' } }
  };

  // ══════════════════════════════════════════════════════════════════
  // 시트 1: 입력인자 분류 체계표
  // ══════════════════════════════════════════════════════════════════
  const ws1 = wb.addWorksheet('입력인자_분류체계표', {
    views: [{ state: 'frozen', ySplit: 4 }]
  });

  ws1.columns = [
    { key: 'area', width: 22 },       // 5대 영역
    { key: 'no', width: 6 },          // No
    { key: 'name', width: 18 },       // 인자명
    { key: 'req', width: 10 },        // 필수여부
    { key: 'schema', width: 42 },     // 세부 항목 (Value Schema)
    { key: 'law', width: 36 },        // 관련 법령 및 기술적 근거
    { key: 'purpose', width: 45 }     // AI / 컨설팅 활용 목적
  ];

  // 타이틀 헤더
  ws1.mergeCells('A1:G1');
  const titleCell = ws1.getCell('A1');
  titleCell.value = 'SafePatrol 현장 부적합 입력인자 표준 분류체계도 (산안법·건진법 근거)';
  titleCell.font = fontTitle;
  titleCell.fill = fillTitle;
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  ws1.getRow(1).height = 40;

  // 부제목 / 설명
  ws1.mergeCells('A2:G2');
  const subCell = ws1.getCell('A2');
  subCell.value = '※ 비전 AI(Qwen-VL) 법률 위반 자동 지도학습 및 [상품·공정률 기반 사전 예방 컨설팅 AI] 연계 표준 스키마';
  subCell.font = { name: '맑은 고딕', size: 9, color: { argb: 'FF64748B' }, italic: true };
  subCell.alignment = { horizontal: 'center', vertical: 'middle' };
  ws1.getRow(2).height = 22;

  // 헤더 행
  const headers = ['5대 핵심 영역', 'No', '입력 인자명', '필수 여부', '세부 데이터 항목 (Value Schema)', '법령 및 기술적 근거', 'AI 및 사전 예방 컨설팅 활용 목적'];
  const r3 = ws1.getRow(3);
  r3.height = 28;
  headers.forEach((h, i) => {
    const c = r3.getCell(i + 1);
    c.value = h;
    c.font = fontHeader;
    c.fill = fillHeader;
    c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    c.border = thinBorder;
  });

  const DATA = [
    // 1. 프로젝트 맥락 인자
    {
      area: '1. 프로젝트 맥락 인자\n(Project Context)',
      no: '1',
      name: '현장명',
      req: '필수 (*)',
      schema: '사업장 고유 명칭 (텍스트, Datalist 연동)',
      law: '산업안전보건법 제10조 (산업재해 발생건수 등의 공표)',
      purpose: '현장별 부적합 누적 이력 관리 및 사업장 단위 위험도 평가'
    },
    {
      area: '1. 프로젝트 맥락 인자\n(Project Context)',
      no: '2',
      name: '상품 유형\n(시설물 용도)',
      req: '필수 (*)',
      schema: '• 공동주택 (아파트/주상복합)\n• 물류센터 / 공장 (철골구조)\n• 오피스 / 지식산업센터\n• 플랜트 / 산업설비\n• 토목 / 인프라 (교량/터널/도로)\n• 기타 건축 시설물',
      law: '건축법 시행령 별표1 (용도별 건축물의 종류)\n건설기술진흥법 제62조 (건설공사의 안전관리)',
      purpose: '[컨설팅 핵심 변수]\n건축물 구조 및 용도별 다발 위험 차별화 분석 (예: 아파트-골조 추락 vs 물류-철골 양중/화재)'
    },
    {
      area: '1. 프로젝트 맥락 인자\n(Project Context)',
      no: '3',
      name: '공정률 (%)',
      req: '필수 (*)',
      schema: '0.0% ~ 100.0% (숫자 입력, 정밀 진도율)',
      law: '국토교통부 건설공사 표준 시방서\n조달청 공정진도율 관리 기준 (S-Curve)',
      purpose: '[컨설팅 핵심 변수]\n시공 진도 구간별(토공/지하/골조/마감) 취약 부적합 패턴 매핑 및 사전 경고 도출'
    },
    {
      area: '1. 프로젝트 맥락 인자\n(Project Context)',
      no: '4',
      name: '점검일자',
      req: '필수 (*)',
      schema: 'YYYY-MM-DD (사진 EXIF 메타데이터 자동 추출)',
      law: '산업안전보건법 시행규칙 제37조 (순회점검 주기)\n건설기술진흥법 안전관리비 집행 기준',
      purpose: '계절별(동절기 콘크리트/해빙기 흙막이/혹서기 온열질환) 위험 요인 시계열 추적'
    },

    // 2. 작업 및 환경 인자
    {
      area: '2. 작업 및 환경 인자\n(Work & Environment)',
      no: '5',
      name: '협력사명',
      req: '선택 (권장)',
      schema: '하도급 전문건설업체명 (텍스트)',
      law: '산업안전보건법 제63조 (도급인의 안전조치 및 보건조치 의무)',
      purpose: '협력업체별 안전보건 수준 평가, 반복 지적 협력사 패널티 및 집중 계도'
    },
    {
      area: '2. 작업 및 환경 인자\n(Work & Environment)',
      no: '6',
      name: '공종명',
      req: '필수 (*)',
      schema: '가설공사, 철근콘크리트공사, 철골공사, 토공사, 조적·미장, 창호·유리, 방수·도장, 기계설비, 전기·통신, 해체공사 등',
      law: '건설산업기본법 시행령 별표1 (전문공사를 시공하는 업종)\nKOSHA 공종별 안전보건작업지침',
      purpose: '공종별 위험 요인 클러스터링 및 세부 공종 맞춤형 안전 대책 추천'
    },
    {
      area: '2. 작업 및 환경 인자\n(Work & Environment)',
      no: '7',
      name: '작업장소',
      req: '필수 (*)',
      schema: '상세 위치/구역 (예: 104동 5층 외부단부, 지하2층 집수정, 옥탑 타워크레인 반경)',
      law: '산업안전보건기준에 관한 규칙 제38조 (사전조사 및 작업계획서)',
      purpose: '고위험 장소(단부, 개구부, 밀폐구역, 양중구역) 공간 위험 매핑'
    },
    {
      area: '2. 작업 및 환경 인자\n(Work & Environment)',
      no: '8',
      name: '점검차수',
      req: '기본 (1차)',
      schema: '1차, 2차, 정기, 특별, 정밀점검 등',
      law: '안전보건공단 KOSHA-MS 패트롤 점검 운영 절차',
      purpose: '지적 사항의 재발 여부 추적 및 시정 지연 장기 미조치 건 식별'
    },

    // 3. 위험 식별 및 법규 인자
    {
      area: '3. 위험 식별 및 법규 인자\n(Hazard & Regulatory)',
      no: '9',
      name: '부적합 등급\n(Severity)',
      req: '필수 (*)',
      schema: '• 🚨 중부적합 (즉시 작업중지, 중대위험 직결)\n• ⚠️ 경부적합 (시정조치명령, 주의 및 개선권고)',
      law: '산업안전보건법 제51조 (감독상의 조치 - 작업중지권)\n중대재해처벌법 제4조 (안전보건관리체계의 구축)',
      purpose: '위험 우선순위(Risk Ranking) 평가 및 긴급 조치 대상 자동 선별'
    },
    {
      area: '3. 위험 식별 및 법규 인자\n(Hazard & Regulatory)',
      no: '10',
      name: '발생형태\n(재해유형)',
      req: '필수 (*)',
      schema: '추락(떨어짐), 낙하·비래(맞음), 붕괴·도괴(무너짐), 협착(끼임), 전도(넘어짐), 감전, 화재·폭발, 질식 등',
      law: '고용노동부 산업재해통계 업무처리규정 (재해발생형태 분류)',
      purpose: 'VLM 비전 AI의 1차 위험 상황 인지 및 재해 유형별 다발 통계 집계'
    },
    {
      area: '3. 위험 식별 및 법규 인자\n(Hazard & Regulatory)',
      no: '11',
      name: '기인물 / 가시설',
      req: '선택 (권장)',
      schema: '시스템비계, 강관비계, 작업발판, 개구부, 안전난간, 거푸집동바리, 타워크레인, 이동식사다리, 굴착기 등',
      law: 'KOSHA CODE G-105 (기인물 표준 분류 코드)',
      purpose: '비전 AI 객체 탐지(Object Detection) 매칭 및 가시설별 불량률 산출'
    },
    {
      area: '3. 위험 식별 및 법규 인자\n(Hazard & Regulatory)',
      no: '12',
      name: '산업안전보건법\n근거 조항',
      req: '필수 (*)',
      schema: '• 산안규칙 제13조 (안전난간의 구조 및 요건)\n• 산안규칙 제42조 (추락의 방지)\n• 산안규칙 제56조 (작업발판의 구조)\n• 산안규칙 제59조 (추락방지조치)\n• 산안규칙 제67조 (시스템비계의 구조)\n• 산안법 제38조 (안전조치) 등',
      law: '산업안전보건기준에 관한 규칙 (고용노동부령)\n산업안전보건법',
      purpose: '[VLM AI 핵심 정답]\n사진 투입 시 AI가 자동 판별하여 제시해야 하는 Ground Truth 목표 법조문'
    },
    {
      area: '3. 위험 식별 및 법규 인자\n(Hazard & Regulatory)',
      no: '13',
      name: '부적합 사진\n(Before Photo)',
      req: '필수 (*)',
      schema: '대표 1장 + 추가 2장 (디지털 원본 사진 파일)',
      law: '산업안전보건법 제164조 (서류의 보존 의무)',
      purpose: 'Qwen-VL 멀티모달 모델 파인튜닝용 원본 이미지 인코더 입력 데이터'
    },

    // 4. 원인 분석 인자
    {
      area: '4. 원인 분석 및 관리 인자\n(Root Cause Analysis)',
      no: '14',
      name: '관리적 원인\n(Management)',
      req: '선택 (복수선택)',
      schema: '• 계획 미수립 (사전 작업계획서 누락)\n• 계획 미이행 (승인 계획과 다르게 임의 시공)\n• 불안전 행동 (보호구 미착용, 안전수칙 미준수, 임의해체)\n• 불안전 상태 (방호시설 미설치, 자재 결함, 구조 취약)',
      law: '산업안전보건기준에 관한 규칙 제38조 (사전조사 및 작업계획서)\n하인리히 1:29:300 법칙 (불안전 행동과 상태)',
      purpose: '사고의 근본 원인 규명 및 현장 관리 체계(제도 vs 이행) 부실 진단'
    },
    {
      area: '4. 원인 분석 및 관리 인자\n(Root Cause Analysis)',
      no: '15',
      name: 'Hold Point 위반',
      req: '선택 (체크)',
      schema: '위반 (True) / 정상 (False) / N/A',
      law: '건설기술진흥법 제62조의2 (공사감독관 안전관리계획 이행 확인)\n(감독관 검측 승인 전 후속공정 임의 착수 금지점)',
      purpose: '공정 중단 수준의 중대 감리 절차 위반 모니터링'
    },
    {
      area: '4. 원인 분석 및 관리 인자\n(Root Cause Analysis)',
      no: '16',
      name: '발생원인 인터뷰\n및 제안',
      req: '선택',
      schema: '• 시공관리자 및 근로자 의견 (실제 현장 사유)\n• 점검단 제안 (기술적 사전 방지책)',
      law: '산업안전보건법 제36조 (위험성평가 시 근로자 참여 의무)\n중대재해처벌법 시행령 제4조제7호 (종사자 의견 청취)',
      purpose: '현장 인터뷰 자연어(NLP) 분석을 통한 반복 변명 패턴 및 실제 저해 요인 분석'
    },

    // 5. 시정 조치 및 판정 인자
    {
      area: '5. 시정 조치 및 판정 인자\n(Action & Audit)',
      no: '17',
      name: 'PM 판정 결과',
      req: '선택',
      schema: '• 시스템 개선 (모니터링 강화)\n• 즉시 시정 완료 및 재발방지 교육\n• 협력사 경고 조치',
      law: '산업안전보건법 제53조 (도급인의 시정조치 요구권)',
      purpose: '안전보건 총괄책임자(PM/소장)의 최종 조치 판정 및 이행 관리'
    },
    {
      area: '5. 시정 조치 및 판정 인자\n(Action & Audit)',
      no: '18',
      name: '조치 완료 데이터\n(After Data)',
      req: '조치 시 필수',
      schema: '• 조치 내용 (텍스트)\n• 조치 완료 사진 (After Photo)\n• 조치 상태 (조치완료 / 미조치)',
      law: '산업안전보건법 시행규칙 제37조 (점검 결과의 기록·보존)',
      purpose: 'Before/After 대조를 통한 위험 제거 검증 및 1페이지 안전교육카드 자동 생성'
    }
  ];

  let currentArea = '';
  let startRow = 4;

  DATA.forEach((d, idx) => {
    const rowIdx = startRow + idx;
    const row = ws1.getRow(rowIdx);
    row.height = d.schema.includes('\n') ? 54 : 32;

    row.getCell(1).value = d.area;
    row.getCell(2).value = d.no;
    row.getCell(3).value = d.name;
    row.getCell(4).value = d.req;
    row.getCell(5).value = d.schema;
    row.getCell(6).value = d.law;
    row.getCell(7).value = d.purpose;

    // 배경색 지정 (영역별)
    let fill = fillGroup1;
    if (d.no >= 5 && d.no <= 8) fill = fillGroup2;
    if (d.no >= 9 && d.no <= 13) fill = fillGroup3;
    if (d.no >= 14 && d.no <= 16) fill = fillGroup4;
    if (d.no >= 17) fill = fillGroup5;

    row.getCell(1).fill = fill;
    row.getCell(1).font = fontGroup;
    row.getCell(1).alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };

    row.getCell(2).font = fontBold;
    row.getCell(2).alignment = { horizontal: 'center', vertical: 'middle' };

    row.getCell(3).font = fontBold;
    row.getCell(3).alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };

    row.getCell(4).font = fontBold;
    row.getCell(4).alignment = { horizontal: 'center', vertical: 'middle' };
    if (d.req.includes('*')) {
      row.getCell(4).font = { name: '맑은 고딕', size: 9, bold: true, color: { argb: 'FFDC2626' } };
    }

    row.getCell(5).font = fontBody;
    row.getCell(5).alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };

    row.getCell(6).font = fontBody;
    row.getCell(6).alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };

    row.getCell(7).font = fontBody;
    row.getCell(7).alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };

    for (let c = 1; c <= 7; c++) {
      row.getCell(c).border = thinBorder;
    }
  });

  // 영역 셀 병합 (A4:A7, A8:A11, A12:A16, A17:A19, A20:A21)
  ws1.mergeCells('A4:A7');
  ws1.mergeCells('A8:A11');
  ws1.mergeCells('A12:A16');
  ws1.mergeCells('A17:A19');
  ws1.mergeCells('A20:A21');

  // ══════════════════════════════════════════════════════════════════
  // 시트 2: 법령 및 마스터 코드 레퍼런스
  // ══════════════════════════════════════════════════════════════════
  const ws2 = wb.addWorksheet('법령_및_마스터코드');
  ws2.columns = [
    { key: 'category', width: 20 },
    { key: 'code', width: 14 },
    { key: 'name', width: 34 },
    { key: 'desc', width: 45 }
  ];

  ws2.mergeCells('A1:D1');
  const t2 = ws2.getCell('A1');
  t2.value = '산업안전보건법령 및 SafePatrol 표준 마스터 코드표';
  t2.font = fontTitle;
  t2.fill = fillTitle;
  t2.alignment = { horizontal: 'center', vertical: 'middle' };
  ws2.getRow(1).height = 36;

  const r2_header = ws2.getRow(2);
  r2_header.height = 25;
  ['분류 구분', '코드', '항목명 / 법령 조항', '상세 설명 및 기준'].forEach((h, i) => {
    const c = r2_header.getCell(i + 1);
    c.value = h;
    c.font = fontHeader;
    c.fill = fillHeader;
    c.alignment = { horizontal: 'center', vertical: 'middle' };
    c.border = thinBorder;
  });

  const MASTER_CODES = [
    ['상품 유형', 'PROD_APT', '공동주택 (아파트/주상복합)', '철근콘크리트 라멘/벽식 구조, 고소 외벽 골조 추락 다발'],
    ['상품 유형', 'PROD_LOGIS', '물류센터 / 공장 (철골구조)', '대공간 철골 트러스 양중, 단부 데크플레이트, 용접 화재'],
    ['상품 유형', 'PROD_OFFICE', '오피스 / 지식산업센터', '도심지 깊은 흙막이 토공사, 커튼월 양중 작업'],
    ['상품 유형', 'PROD_PLANT', '플랜트 / 산업설비', '배관 밀폐공간 유해가스 질식, 비계/사다리 추락'],
    ['상품 유형', 'PROD_CIVIL', '토목 / 인프라 (교량/터널)', '터널 굴착 낙반, 가설 교량 거더 전도, 중장비 협착'],
    ['부적합 등급', 'SEV_MAJOR', '🚨 중부적합', '즉시 작업중지 요건, 안전난간/개구부 미조치 등 중대위험'],
    ['부적합 등급', 'SEV_MINOR', '⚠️ 경부적합', '작업 중 시정 가능 항목, 표지 미부착, 경미한 결함'],
    ['산안법령 조항', 'LAW_RULE_13', '산안규칙 제13조 (안전난간)', '상부난간대(90~120cm), 중간난간대, 발끝막이판(10cm 이상)'],
    ['산안법령 조항', 'LAW_RULE_42', '산안규칙 제42조 (추락의 방지)', '높이 2m 이상 추락 위험 장소 작업발판 또는 추락방호망 설치'],
    ['산안법령 조항', 'LAW_RULE_56', '산안규칙 제56조 (작업발판의 구조)', '비계 작업발판 폭 40cm 이상, 틈새 3cm 이하 설치 의무'],
    ['산안법령 조항', 'LAW_RULE_59', '산안규칙 제59조 (추락방지조치)', '개구부 덮개(충분한 강도, 고정 결속, 추락주의 표지)'],
    ['산안법령 조항', 'LAW_RULE_67', '산안규칙 제67조 (시스템비계)', '수직재·수평재·가새재 견고 체결, 벽이음(벽체 고정) 기준 준수'],
    ['산안법령 조항', 'LAW_ACT_38', '산안법 제38조 (안전조치)', '사업주의 기계·기구, 폭발·화재, 추락·붕괴 등에 대한 안전조치'],
    ['관리적 원인', 'CAUSE_NO_PLAN', '계획 미수립', '산안규칙 제38조에 따른 사전 작업계획서 작성 누락'],
    ['관리적 원인', 'CAUSE_DEV_PLAN', '계획 미이행', '승인된 작업계획서 및 시공상세도와 다르게 임의 시공'],
    ['관리적 원인', 'CAUSE_UNSAFE_ACT', '불안전 행동', '근로자 안전대 미체결, 안전모 턱끈 미착용, 임의 가설재 해체'],
    ['관리적 원인', 'CAUSE_UNSAFE_COND', '불안전 상태', '방호시설 미설치, 자재 결속 불량, 조명 불량, 통로 폐쇄']
  ];

  MASTER_CODES.forEach((m, idx) => {
    const row = ws2.getRow(3 + idx);
    row.height = 24;
    row.getCell(1).value = m[0];
    row.getCell(2).value = m[1];
    row.getCell(3).value = m[2];
    row.getCell(4).value = m[3];

    row.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
    row.getCell(2).alignment = { horizontal: 'center', vertical: 'middle' };
    row.getCell(3).alignment = { horizontal: 'left', vertical: 'middle' };
    row.getCell(4).alignment = { horizontal: 'left', vertical: 'middle' };

    row.getCell(1).font = fontBold;
    row.getCell(2).font = fontBody;
    row.getCell(3).font = fontBold;
    row.getCell(4).font = fontBody;

    for (let c = 1; c <= 4; c++) row.getCell(c).border = thinBorder;
  });

  const outPath = 'SafePatrol_입력인자_분류표.xlsx';
  await wb.xlsx.writeFile(outPath);
  console.log(`✅ 엑셀 파일 생성 완료: ${outPath}`);
}

generateTaxonomyExcel().catch(console.error);
