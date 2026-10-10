/**
 * SafePatrol 부적합사항대장 엑셀 생성기 (브라우저 / Node 공용)
 *   SafeExcel.build(ExcelJS, { records, taxonomy, customValues, sites, loadImage }) → Workbook
 *   - loadImage(path) → Promise<{ base64: string, extension: 'jpeg'|'png' } | null>
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SafeExcel = factory();
})(typeof self !== 'undefined' ? self : this, function () {

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
    ['부적합 분류', '유형', 10, 'types', r => r.type],
    ['부적합 분류', '기인물', 12, 'agents', r => r.agent],
    ['부적합 분류', '공종', 12, 'workGroups', r => r.workGroup],
    ['부적합 분류', '항목', 13, 'items', r => r.item],
    ['부적합 분류', '종류', 11, 'kinds', r => r.kind],
    ['관련근거', '산업안전보건법', 22, 'laws', r => r.law || (r.basis && r.basis.law) || ''],
    ['불안전 상황', '상태', 16, 'conditions', r => r.condition],
    ['불안전 상황', '행동', 16, 'actions', r => r.action],
    ['관리적 원인', '원인구분', 16, null, r => Array.isArray(r.mgmtCauses) ? r.mgmtCauses.join(', ') : (r.mgmtCauses || '')],
    ['관리적 원인', 'Hold Point', 10, null, r => r.holdPoint ? '위반' : '정상'],
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

  const PHOTO_COL = 2, FIX_PHOTO_COL = 31;
  const YELLOW = 'FFFFFF00';
  const GROUP_FILL = {
    '조치사항': 'FFC6EFCE',
    '관리정보(자동)': 'FFD9E1F2',
    '현장/컨설팅': 'FFE0E7FF',
    '관리적 원인': 'FFFEF3C7',
    '발생원인 (인터뷰)': 'FFFDE047',
    '개선대책 (협의)': 'FFBBF7D0'
  };
  const thin = { style: 'thin', color: { argb: 'FF7F7F7F' } };
  const border = { top: thin, left: thin, bottom: thin, right: thin };
  const LEFT_COLS = ['내용', '조치내용', '시공자/근로자 의견', '점검단 제안', 'PM 판정결과', '산업안전보건법', '상태', '행동'];

  const uniq = a => [...new Set(a.filter(Boolean))];

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
        conditions: add('condition', tax.unsafeConditions.list),
        actions: add('action', tax.unsafeActions.list),
        workGroups: add('workGroup', tax.workTypes.list.map(w => w.group)),
        works: add('workName', tax.workTypes.list.flatMap(w => w.works)),
        kinds: add('kind', tax.categories.list.map(c => c.kind)),
        items: add('item', allItems.map(i => i.name)),
        agents: add('agent', allItems.flatMap(i => i.agents)),
        laws: add('law', allItems.map(i => i.law)),
        workPlan: tax.workPlanOptions,
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
    kinds: '종류', items: '항목', agents: '기인물', laws: '관련 조문', workPlan: '작업계획', basis3: '반영여부',
    structure: '구조검토', mark: '발생원인 표시', sites: '현장명',
  };

  async function build(ExcelJS, opts) {
    const { records = [], taxonomy: tax, customValues, sites, loadImage, emptyRows = 30 } = opts;
    const { lists, allItems } = buildLists(tax, customValues, sites);
    const wb = new ExcelJS.Workbook();
    wb.creator = 'SafePatrol';
    wb.created = new Date();

    // ═════════ Sheet 1. 부적합사항대장 ═════════
    const ws = wb.addWorksheet('부적합사항대장', {
      views: [{ state: 'frozen', xSplit: 3, ySplit: 2 }],
      pageSetup: { paperSize: 8, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: '1:2' },
    });
    COLS.forEach((c, i) => { ws.getColumn(i + 1).width = c[2]; });
    const r1 = ws.getRow(1), r2 = ws.getRow(2);
    r1.height = 20; r2.height = 30;
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

    // ═════════ Sheet 2. 분류기준 ═════════
    const wl = wb.addWorksheet('분류기준');
    const listRange = {};
    Object.keys(lists).forEach((k, i) => {
      const col = i + 1;
      const letter = wl.getColumn(col).letter;
      const vals = lists[k];
      wl.getColumn(col).width = Math.max(12, Math.min(34, Math.max(4, ...vals.map(s => String(s).length)) * 1.6));
      const h = wl.getCell(1, col);
      h.value = LIST_TITLES[k];
      h.font = { bold: true, size: 10 };
      h.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: YELLOW } };
      h.border = border;
      vals.forEach((val, j) => { const c = wl.getCell(j + 2, col); c.value = val; c.border = border; c.font = { size: 9 }; });
      listRange[k] = `분류기준!$${letter}$2:$${letter}$${vals.length + 31}`;
    });
    wl.views = [{ state: 'frozen', ySplit: 1 }];
    COLS.forEach((c, i) => {
      if (!c[3]) return;
      const letter = ws.getColumn(i + 1).letter;
      ws.dataValidations.add(`${letter}3:${letter}${total + 2}`, {
        type: 'list', allowBlank: true, formulae: [listRange[c[3]]],
        showErrorMessage: false, showInputMessage: true, promptTitle: c[1], prompt: '목록에서 선택하거나 직접 입력하세요',
      });
    });

    // ═════════ Sheet 3. 항목별 법령·수칙 ═════════
    const wr = wb.addWorksheet('항목별 법령·수칙');
    wr.columns = [
      { header: '종류', key: 'kind', width: 13 }, { header: '항목', key: 'name', width: 18 },
      { header: '대표 유형', key: 'type', width: 12 }, { header: '관련 조문', key: 'law', width: 30 },
      { header: '주요 기인물', key: 'agents', width: 40 }, { header: '핵심 안전수칙 (1페이지 교육자료에 사용)', key: 'rules', width: 70 },
    ];
    allItems.forEach(it => wr.addRow({
      kind: it.kind, name: it.name, type: it.defaultType, law: it.law,
      agents: it.agents.join(', '), rules: it.rules.map((r, i) => `${i + 1}. ${r}`).join('\n'),
    }));
    wr.eachRow((row, idx) => row.eachCell(cell => {
      cell.border = border; cell.alignment = { vertical: 'middle', wrapText: true }; cell.font = { size: 9, bold: idx === 1 };
      if (idx === 1) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: YELLOW } };
    }));
    wr.views = [{ state: 'frozen', ySplit: 1 }];

    // ═════════ Sheet 4. 작성요령 ═════════
    const wg = wb.addWorksheet('작성요령');
    wg.getColumn(1).width = 16; wg.getColumn(2).width = 18; wg.getColumn(3).width = 80;
    const guide = [
      ['구분', '항목', '작성 방법'],
      ['부적합 사항', '사진', '이미 촬영한 사진을 앱에서 등록 (자동 압축, 촬영일시 자동 인식)'],
      ['', '내용', '부적합 내용을 구체적으로 (무엇이 / 어떻게) — 입력하면 자동분류 추천'],
      ['', '장소/위치', '동·층·구역'],
      ['', '작업명', '분류기준 [작업명] 선택 또는 직접입력'],
      ['불안전 상황', '상태 / 행동', '안전보건공단 재해원인 분류(불안전한 상태·행동) 선택 또는 직접입력'],
      ['부적합 분류', '유형', '산업재해 발생형태 분류 (떨어짐=추락, 무너짐=붕괴, 끼임=협착 등)'],
      ['', '기인물 / 항목 / 종류', '항목을 고르면 종류·유형·관련 조문이 자동 입력되고 기인물 목록이 좁혀짐'],
      ['', '공종', '작업명을 고르면 자동 입력 (수정 가능)'],
      ['작업계획', '작업계획', '작업계획서 수립 여부'],
      ['관련근거', '위험성평가 등', '반영 / 미반영 / 해당없음'],
      ['', '산업안전보건법', '항목 선택 시 관련 조문 자동 추천 (산업안전보건기준에 관한 규칙)'],
      ['발생원인', '인적·물적·기술적·시스템적', '해당 원인에 ● 표시 (복수 선택 가능)'],
      ['현장정보', '현장명 등', '앱의 현장 설정값이 자동 입력 (등록 당시 값)'],
      ['조치사항', '조치내용 / 조치사진', '조치 완료 후 앱에서 입력. 비어 있으면 미조치로 집계'],
      ['관리정보(자동)', '점검일자 / 점검자', '사진 촬영일시(또는 등록일)와 로그인 점검자가 자동 기록'],
      ['', '', ''],
      ['출처', '', (tax.sources || []).map(s => `• ${s.name}`).join('\n')],
      ['참고', '', '드롭다운 칸은 목록에 없는 값도 직접 입력할 수 있습니다. 조문 번호는 현행 법령 기준으로 확인 후 사용하세요.'],
    ];
    guide.forEach((g, i) => {
      const row = wg.addRow(g);
      row.eachCell({ includeEmpty: true }, cell => {
        cell.border = border; cell.alignment = { vertical: 'middle', wrapText: true }; cell.font = { size: 10, bold: i === 0 };
        if (i === 0) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: YELLOW } };
      });
    });

    return wb;
  }

  return { build, COLS };
});
