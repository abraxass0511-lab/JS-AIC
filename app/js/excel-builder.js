/**
 * SafePatrol 부적합사항대장 엑셀 생성기 (브라우저 / Node 공용)
 *   SafeExcel.build(ExcelJS, { records, taxonomy, customValues, sites, loadImage }) → Workbook
 *   - 건설안전 9×9단, 가시설 심층 분류, 8대 공종, 근본원인 및 관리주체 완벽 반영
 *   - loadImage(path) → Promise<{ base64: string, extension: 'jpeg'|'png' } | null>
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SafeExcel = factory();
})(typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : this), function () {

  // [그룹, 항목명, 너비, 드롭다운 목록키, 값 추출 함수]
  const COLS = [
    ['No', 'No', 5, null, (r, i) => i + 1],
    ['부적합 사항', '사진', 18, null, () => ''],
    ['부적합 분류', '부적합 등급', 14, 'severities', r => r.severity || '중부적합'],
    ['부적합 사항', '내용', 26, null, r => r.content],
    ['부적합 사항', '협력사', 14, null, r => r.subcontractor || ''],
    ['부적합 사항', '점검차수', 8, null, r => r.inspectRound || '1차'],
    ['부적합 사항', '장소/위치', 12, null, r => r.location],
    ['부적합 사항', '작업명', 14, 'works', r => r.workName],
    ['부적합 분류', '공종', 14, 'workGroups', r => r.workGroup],
    ['부적합 분류', '유형', 10, 'types', r => r.type],
    ['부적합 분류', '기인물', 12, 'agents', r => r.agent],
    
    // ── [신규 추가] 9×9 점검인자 ──
    ['9×9 점검인자', '점검영역', 12, 'matrixAreas', r => r.matrixArea || (r.basis && r.basis.점검영역9x9) || ''],
    ['9×9 점검인자', '점검대상', 14, 'matrixTargets', r => r.matrixTarget || (r.basis && r.basis.점검대상9x9) || ''],
    ['9×9 점검인자', '가시설상세', 14, 'matrixSpecs', r => r.matrixSpec || (r.basis && r.basis.가시설세부사양) || ''],

    ['부적합 분류', '항목', 13, 'items', r => r.item],
    ['부적합 분류', '종류', 11, 'kinds', r => r.kind],
    ['관련근거', '산업안전보건법', 22, 'laws', r => r.law || (r.basis && r.basis.law) || ''],
    ['불안전 상황', '상태', 18, 'conditions', r => r.condition],
    ['불안전 상황', '행동', 18, 'actions', r => r.action],
    ['관리적 원인', '원인구분', 16, null, r => Array.isArray(r.mgmtCauses) ? r.mgmtCauses.join(', ') : (r.mgmtCauses || '')],
    ['관리적 원인', 'Hold Point', 10, null, r => r.holdPoint ? '위반' : '정상'],

    // ── [신규 추가] 근본원인 분석 ──
    ['근본원인 분석', '법적 관리감독', 18, 'rootCausesMgmt', r => r.rootCauseMgmt || (r.basis && r.basis.근본원인_관리감독) || ''],
    ['근본원인 분석', '안전시스템', 20, 'rootCausesSystem', r => r.rootCauseSystem || (r.basis && r.basis.근본원인_안전시스템) || ''],
    ['근본원인 분석', '관리/책임주체', 14, 'stakeholders', r => r.stakeholder || (r.basis && r.basis.관리책임주체) || ''],

    ['발생원인 (인터뷰)', '시공자/근로자 의견', 20, null, r => r.interviewOpinion || ''],
    ['발생원인 (인터뷰)', '점검단 제안', 18, null, r => r.auditProposal || ''],
    ['개선대책 (협의)', 'PM 판정결과', 18, null, r => r.pmVerdict || ''],
    ['발생원인(통계)', '인적', 5, 'mark', r => mark(r, '인적')],
    ['발생원인(통계)', '물적', 5, 'mark', r => mark(r, '물적')],
    ['발생원인(통계)', '기술적', 5, 'mark', r => mark(r, '기술적')],
    ['발생원인(통계)', '시스템적', 6, 'mark', r => mark(r, '시스템적')],
    ['현장/컨설팅', '현장명', 16, 'sites', r => r.site],
    ['현장/컨설팅', '상품유형', 12, 'productTypes', r => r.productType || '공동주택'],
    ['현장/컨설팅', '공정률(%)', 8, null, r => r.progressRate !== undefined && r.progressRate !== null ? (r.progressRate + '%') : (r.siteInfo && r.siteInfo.progress ? r.siteInfo.progress + '%' : '')],
    ['현장/컨설팅', '표준공정단계', 15, 'stages', r => r.stage || '지상 골조 단계'],
    ['조치사항', '조치내용', 24, null, r => (r.fix && r.fix.content) || '(미조치)'],
    ['조치사항', '조치사진', 18, null, () => ''],
    ['관리정보(자동)', '점검일자', 11, null, r => r.inspectedDate],
    ['관리정보(자동)', '점검자', 8, null, r => r.inspector],
  ];

  function mark(r, c) { return (r.causes || []).includes(c) ? '●' : ''; }

  const PHOTO_COL = 2;
  const FIX_PHOTO_COL = COLS.findIndex(c => c[1] === '조치사진') + 1;
  const YELLOW = 'FFFFFF00';
  const GROUP_FILL = {
    '조치사항': 'FFC6EFCE',
    '관리정보(자동)': 'FFD9E1F2',
    '현장/컨설팅': 'FFE0E7FF',
    '관리적 원인': 'FFFEF3C7',
    '9×9 점검인자': 'FFFEF08A',
    '근본원인 분석': 'FFFED7AA',
    '발생원인 (인터뷰)': 'FFFDE047',
    '개선대책 (협의)': 'FFBBF7D0'
  };
  const thin = { style: 'thin', color: { argb: 'FF7F7F7F' } };
  const border = { top: thin, left: thin, bottom: thin, right: thin };
  const LEFT_COLS = ['내용', '조치내용', '시공자/근로자 의견', '점검단 제안', 'PM 판정결과', '산업안전보건법', '상태', '행동', '법적 관리감독', '안전시스템'];

  const uniq = a => [...new Set(a.filter(Boolean))];

  // 9×9 마스터 데이터 기본값
  const DEFAULT_9X9_AREAS = ['가시설', '건설장비', '작업방법', '작업공도구', '작업발판', 'PPE', '전기시설', '소방시설', '작업장'];
  const DEFAULT_9X9_TARGETS = [
    '비계', '흙막이', '동바리', '거푸집', '특수거푸집', '데크', '철골', 'PC', '안전시설',
    '양중장비', '탑승장비', '운반장비', '차량계건설기계', '생산장비', '굴착장비', '천공장비', '토공장비', '해상장비',
    '굴착작업', '하역운반작업', '양중작업', '설치조립작업', '해체작업', '중량물취급작업', '고소작업', '밀폐공간작업', '협소공간작업',
    '용접기', '화기', '절단기구', '회전기구', '압력기구', '타정기구', '운반기구', '양중기구', '수공구',
    '틀비계', '말비계', '달비계', '달대비계', '각립비계', '이동식 사다리', '낮은 발판', '현장제작발판', '지붕발판',
    '안전모', '보안경/면', '귀덮개/마개', '호흡기보호구', '안전대', '추락방지대', '안전장갑', '안전장화', '안전화',
    '수전시설', '분전반', '냉난방기', '전선', '전등시설', '전열시설', '전기기구', '접지시설', '누전차단기',
    '비상대피시설', '화재수신반', '화재감지시설', '스프링쿨러', '소화시설', '불티비산방지', '충전시설', '가설건물', '생활화재',
    '비상통로', '작업구획', '통제구역', '가설통로', '자재야적장', '위험물보관소', '폐기물보관소', '조도확보', '청결상태'
  ];
  const DEFAULT_9X9_SPECS = [
    '시스템비계', '강관비계', '이동식틀비계', '달비계', '달대비계', '말비계', '각립비계',
    '수직재', '수평재', '모서리부', '토사부', '시스템동바리', '강관동바리', '잭서포트',
    '갱폼', '알폼', '유로폼', 'ACS', 'RCS', '슬립폼', '데크플레이트', '철골', 'PC',
    '추락방지시설(안전난간)', '추락방지시설(덮개)', '추락방지시설(수직방호망)', '추락방지시설(안전대걸이시설)',
    '낙하방지시설(방호선반)', '낙하방지시설(낙하물방지망)'
  ];
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
  const DEFAULT_STAKEHOLDERS = [
    '현장소장', '공사팀장', '시공팀장', '시공담당', '안전팀장',
    '안전관리자', '협력회사 소장', '협력회사 공사팀장', '협력회사 공사담당', '협력회사 안전관리자'
  ];

  function buildLists(tax, custom, sites) {
    custom = custom || {};
    const allItems = tax.categories.list.flatMap(c => c.items.map(i => ({ ...i, kind: c.kind })));
    const add = (key, base) => uniq([...base, ...(custom[key] || [])]);
    return {
      lists: {
        severities: ['중부적합', '경부적합'],
        productTypes: ['공동주택', '오피스/지식산업센터', '물류센터/공장', '플랜트/산업설비', '토목/인프라', '기타'],
        stages: ['착공 및 토공사 단계', '지하 골조 공사 단계', '지상 골조 및 외부 가설 단계', '마감 및 기계전기 설비 단계', '준공 및 부대토목 단계'],
        types: add('type', tax.accidentTypes.list.map(t => t.name)),
        conditions: add('condition', (tax.unsafeConditions && tax.unsafeConditions.list) || []),
        actions: add('action', (tax.unsafeActions && tax.unsafeActions.list) || []),
        workGroups: add('workGroup', (tax.workTypes && tax.workTypes.list.map(w => w.group)) || []),
        works: add('workName', (tax.workTypes && tax.workTypes.list.flatMap(w => w.works)) || []),
        kinds: add('kind', tax.categories.list.map(c => c.kind)),
        items: add('item', allItems.map(i => i.name)),
        agents: add('agent', allItems.flatMap(i => i.agents)),
        laws: add('law', allItems.map(i => i.law)),
        matrixAreas: DEFAULT_9X9_AREAS,
        matrixTargets: DEFAULT_9X9_TARGETS,
        matrixSpecs: DEFAULT_9X9_SPECS,
        rootCausesMgmt: DEFAULT_ROOT_MGMT,
        rootCausesSystem: DEFAULT_ROOT_SYSTEM,
        stakeholders: DEFAULT_STAKEHOLDERS,
        workPlan: tax.workPlanOptions || ['수립', '미수립', '해당없음'],
        basis3: ['반영', '미반영', '해당없음'],
        structure: ['실시', '미실시', '해당없음'],
        mark: ['●'],
        sites: uniq((sites || []).map(s => s.name)),
      },
      allItems,
    };
  }

  const LIST_TITLES = {
    severities: '부적합 등급', productTypes: '상품유형', stages: '표준공정단계',
    types: '유형(발생형태)', conditions: '불안전한 상태', actions: '불안전한 행동', workGroups: '공종', works: '작업명',
    kinds: '종류', items: '항목', agents: '기인물', laws: '관련 조문',
    matrixAreas: '9×9 점검영역', matrixTargets: '9×9 점검대상', matrixSpecs: '가시설 세부사양',
    rootCausesMgmt: '근본원인(관리감독)', rootCausesSystem: '근본원인(시스템)', stakeholders: '관리/책임주체',
    workPlan: '작업계획', basis3: '반영여부', structure: '구조검토', mark: '발생원인 표시', sites: '현장명',
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
        if (!img) return false;
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
        const p = (rec.photos || [])[0];
        if (p && !(await placeImage(p, PHOTO_COL, rowIdx))) row.getCell(PHOTO_COL).value = '(사진)';
        const fp = rec.fix && rec.fix.photo;
        if (fp && !(await placeImage(fp, FIX_PHOTO_COL, rowIdx))) row.getCell(FIX_PHOTO_COL).value = '(사진)';
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
        else if (v.startsWith('(사진')) { fontColor = 'FFA6A6A6'; }
        cell.font = { name: '맑은 고딕', size: 9, bold: isBold, color: { argb: fontColor } };
        if (COLS[i - 1][1].includes('등급')) {
          if (v.includes('중부적합')) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } };
          else if (v.includes('경부적합')) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } };
        }
        cell.alignment = { horizontal: LEFT_COLS.includes(COLS[i - 1][1]) ? 'left' : 'center', vertical: 'middle', wrapText: true };
      }
    }

    // ═════════ Sheet 2. [신규] 건설안전점검 9X9단 ═════════
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
    title9.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFDE047' } }; // Light Yellow
    title9.alignment = { horizontal: 'center', vertical: 'middle' };
    ws9.getRow(1).height = 28;

    const r2_9 = ws9.getRow(2);
    r2_9.height = 24;
    DEFAULT_9X9_AREAS.forEach((a, i) => {
      const c = r2_9.getCell(i + 1);
      c.value = a;
      c.font = { name: '맑은 고딕', size: 10, bold: true, color: { argb: 'FF000000' } };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFACC15' } }; // Darker Yellow
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
    subTitle.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFECDD3' } }; // Light Pink
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
      wl.getColumn(col).width = Math.max(12, Math.min(34, Math.max(4, ...vals.map(s => String(s).length)) * 1.6));
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
    const wr = wb.addWorksheet('항목별 법령·수칙');
    wr.columns = [
      { header: '종류', key: 'kind', width: 13 }, { header: '항목', key: 'name', width: 18 },
      { header: '대표 유형', key: 'type', width: 12 }, { header: '관련 조문', key: 'law', width: 30 },
      { header: '주요 기인물', key: 'agents', width: 40 }, { header: '핵심 안전수칙', key: 'rules', width: 70 },
    ];
    allItems.forEach(it => wr.addRow({
      kind: it.kind, name: it.name, type: it.defaultType, law: it.law,
      agents: it.agents.join(', '), rules: (it.rules || []).map((r, i) => `${i + 1}. ${r}`).join('\n'),
    }));
    wr.eachRow((row, idx) => row.eachCell(cell => {
      cell.border = border; cell.alignment = { vertical: 'middle', wrapText: true }; cell.font = { size: 9, bold: idx === 1 };
      if (idx === 1) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: YELLOW } };
    }));
    wr.views = [{ state: 'frozen', ySplit: 1 }];

    return wb;
  }

  return { build, COLS };
});
