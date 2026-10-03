/**
 * 부적합사항대장 샘플 엑셀 생성 스크립트
 * - config/taxonomy.json 의 표준 분류를 드롭다운(직접입력 허용)으로 연결
 * - 실행: node tools/make_sample_excel.js
 * - 결과: samples/부적합사항대장_샘플.xlsx
 */
const path = require('path');
const fs = require('fs');
const ExcelJS = require('exceljs');

const ROOT = path.join(__dirname, '..');
const tax = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'taxonomy.json'), 'utf8'));
const OUT = path.join(ROOT, 'samples', '부적합사항대장_샘플.xlsx');

// ───────────────────────── 열 정의 ─────────────────────────
// [그룹, 항목명, 너비, 분류기준 목록키]
const COLS = [
  ['No', 'No', 5],
  ['부적합 사항', '사진', 18],
  ['부적합 사항', '내용', 26],
  ['부적합 사항', '장소/위치', 12],
  ['부적합 사항', '작업명', 14, 'works'],
  ['불안전 상황', '상태', 16, 'conditions'],
  ['불안전 상황', '행동', 16, 'actions'],
  ['부적합 분류', '유형', 10, 'types'],
  ['부적합 분류', '기인물', 12, 'agents'],
  ['부적합 분류', '공종', 12, 'workGroups'],
  ['부적합 분류', '항목', 13, 'items'],
  ['부적합 분류', '종류', 11, 'kinds'],
  ['작업계획', '작업계획', 9, 'workPlan'],
  ['관련근거', '위험성평가', 9, 'basis3'],
  ['관련근거', '시공계획', 9, 'basis3'],
  ['관련근거', '구조검토', 9, 'structure'],
  ['관련근거', '관련작업지침', 14],
  ['관련근거', '산업안전보건법', 18, 'laws'],
  ['발생원인', '인적', 6, 'mark'],
  ['발생원인', '물적', 6, 'mark'],
  ['발생원인', '기술적', 6, 'mark'],
  ['발생원인', '시스템적', 7, 'mark'],
  ['현장정보', '현장명', 16, 'sites'],
  ['현장정보', '공정률', 8],
  ['현장정보', '공사규모', 16],
  ['현장정보', '공사금액', 10],
  ['조치사항', '조치내용', 24],
  ['조치사항', '조치사진', 18],
  ['관리정보(자동)', '점검일자', 11],
  ['관리정보(자동)', '점검자', 8],
];

// ───────────────────────── 색상 ─────────────────────────
const YELLOW = 'FFFFFF00';
const GROUP_FILL = { '조치사항': 'FFC6EFCE', '관리정보(자동)': 'FFD9E1F2' };
const thin = { style: 'thin', color: { argb: 'FF7F7F7F' } };
const border = { top: thin, left: thin, bottom: thin, right: thin };

// ───────────────────────── 샘플 현장 ─────────────────────────
const SITES = [
  { name: 'OO아파트 신축공사', progress: '45%', scale: '지하2층/지상25층 8개동', amount: '850억' },
  { name: 'OO물류센터 신축공사', progress: '62%', scale: '지상5층 연면적 6만㎡', amount: '620억' },
  { name: 'OO근린생활시설 신축공사', progress: '20%', scale: '지하1층/지상7층', amount: '95억' },
];

// ───────────────────────── 샘플 데이터 ─────────────────────────
const S = SITES;
const ROWS = [
  { photo: 'sample_before.jpg', content: '비계시설 작업발판 하부 수평재 미설치', loc: '아파트 106동 외부', work: '비계설치작업',
    cond: '안전방호장치의 결함 (미설치·해체·불량)', act: '불안전한 상태 방치', type: '떨어짐', agent: '수평재', group: '가설공사', item: '시스템비계', kind: '가시설',
    plan: '수립', ra: '반영', cp: '반영', st: '해당없음', guide: 'KOSHA GUIDE(시스템비계)', law: '안전보건규칙 제69조~제70조',
    cause: [1, 0, 0, 1], site: S[0], fix: '누락된 수평재 즉시 설치, 협력업체 비계반 재교육 실시', fixPhoto: 'sample_after.jpg', date: '2026-10-02', who: '신OO' },
  { content: '갱폼 인양 중 갱폼 작업발판 위 근로자 탑승', loc: '아파트 103동 18층', work: '갱폼인양작업',
    cond: '작업방법·공정의 결함', act: '위험장소 접근', type: '떨어짐', agent: '작업발판', group: '철근콘크리트공사', item: '갱폼', kind: '가시설',
    plan: '수립', ra: '반영', cp: '반영', st: '실시', guide: 'KOSHA GUIDE(갱폼)', law: '안전보건규칙 제337조',
    cause: [1, 0, 0, 1], site: S[0], fix: '인양 작업 중지 후 근로자 대피, 인양 절차 TBM 재교육', date: '2026-10-02', who: '신OO' },
  { content: '거푸집동바리 파이프서포트 3개 이어서 사용', loc: '근린시설 지하1층', work: '거푸집동바리 설치작업',
    cond: '물(物) 자체의 결함 (자재·부재 손상)', act: '기계·기구의 잘못 사용', type: '무너짐', agent: '동바리(파이프서포트)', group: '철근콘크리트공사', item: '거푸집동바리', kind: '가시설',
    plan: '수립', ra: '미반영', cp: '반영', st: '미실시', guide: '', law: '안전보건규칙 제332조의2',
    cause: [0, 1, 1, 0], site: S[2], fix: '', date: '2026-10-03', who: '김OO' },
  { content: '슬래브 개구부 덮개 미고정 및 표지 미부착', loc: '물류센터 3층 B구역', work: '자재 운반·정리작업',
    cond: '안전방호장치의 결함 (미설치·해체·불량)', act: '불안전한 상태 방치', type: '떨어짐', agent: '개구부 덮개', group: '공통', item: '개구부', kind: '작업장·통로',
    plan: '해당없음', ra: '반영', cp: '해당없음', st: '해당없음', guide: '', law: '안전보건규칙 제43조',
    cause: [1, 1, 0, 0], site: S[1], fix: '덮개 고정 및 개구부 주의 표지 부착', date: '2026-10-03', who: '김OO' },
  { content: '임시 분전반 문 개방, 충전부 노출', loc: '물류센터 1층 램프', work: '가설전기 설치작업',
    cond: '안전방호장치의 결함 (미설치·해체·불량)', act: '불안전한 상태 방치', type: '감전', agent: '분전반', group: '가설공사', item: '분전반·충전부', kind: '전기',
    plan: '해당없음', ra: '반영', cp: '해당없음', st: '해당없음', guide: '', law: '안전보건규칙 제301조',
    cause: [1, 0, 0, 1], site: S[1], fix: '', date: '2026-10-03', who: '신OO' },
];

// ───────────────────────── 분류기준 목록 만들기 ─────────────────────────
function uniq(a) { return [...new Set(a.filter(Boolean))]; }
const allItems = tax.categories.list.flatMap(c => c.items.map(i => ({ ...i, kind: c.kind })));
const LISTS = {
  types: tax.accidentTypes.list.map(t => t.name),
  conditions: tax.unsafeConditions.list,
  actions: tax.unsafeActions.list,
  workGroups: tax.workTypes.list.map(w => w.group),
  works: uniq(tax.workTypes.list.flatMap(w => w.works)),
  kinds: tax.categories.list.map(c => c.kind),
  items: allItems.map(i => i.name),
  agents: uniq(allItems.flatMap(i => i.agents)),
  laws: uniq(allItems.map(i => i.law)),
  workPlan: tax.workPlanOptions,
  basis3: ['반영', '미반영', '해당없음'],
  structure: ['실시', '미실시', '해당없음'],
  mark: ['●'],
  sites: SITES.map(s => s.name),
};
const LIST_TITLES = {
  types: '유형(발생형태)', conditions: '불안전한 상태', actions: '불안전한 행동', workGroups: '공종', works: '작업명',
  kinds: '종류', items: '항목', agents: '기인물', laws: '관련 조문', workPlan: '작업계획', basis3: '반영여부',
  structure: '구조검토', mark: '발생원인 표시', sites: '현장명',
};

(async () => {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'SafePatrol';
  wb.created = new Date();

  // ═════════════ Sheet 1. 부적합사항대장 ═════════════
  const ws = wb.addWorksheet('부적합사항대장', {
    views: [{ state: 'frozen', xSplit: 3, ySplit: 2 }],
    pageSetup: { paperSize: 8, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: '1:2' },
  });
  COLS.forEach((c, i) => { ws.getColumn(i + 1).width = c[2]; });

  // 헤더 2단
  const r1 = ws.getRow(1), r2 = ws.getRow(2);
  r1.height = 20; r2.height = 30;
  COLS.forEach((c, i) => {
    r1.getCell(i + 1).value = c[0];
    r2.getCell(i + 1).value = c[1];
  });
  // 그룹 병합
  let start = 0;
  for (let i = 1; i <= COLS.length; i++) {
    if (i === COLS.length || COLS[i][0] !== COLS[start][0]) {
      if (COLS[start][0] === COLS[start][1]) ws.mergeCells(1, start + 1, 2, start + 1); // No, 작업계획: 세로 병합
      else if (i - 1 > start) ws.mergeCells(1, start + 1, 1, i);
      start = i;
    }
  }
  [r1, r2].forEach(r => {
    for (let i = 1; i <= COLS.length; i++) {
      const cell = r.getCell(i);
      const g = COLS[i - 1][0];
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GROUP_FILL[g] || YELLOW } };
      cell.font = { name: '맑은 고딕', size: 9, bold: true };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.border = border;
    }
  });

  // 데이터 행
  const IMG_W = 124, IMG_H = 93; // 4:3
  const imgCache = {};
  const addImg = (file, col, rowIdx) => {
    if (!imgCache[file]) imgCache[file] = wb.addImage({ filename: path.join(ROOT, 'samples', 'photos', file), extension: 'jpeg' });
    ws.addImage(imgCache[file], { tl: { col: col - 1 + 0.06, row: rowIdx - 1 + 0.06 }, ext: { width: IMG_W, height: IMG_H }, editAs: 'oneCell' });
  };

  const DATA_ROWS = 200; // 서식이 적용된 빈 행 수
  for (let n = 0; n < DATA_ROWS; n++) {
    const rowIdx = n + 3;
    const row = ws.getRow(rowIdx);
    row.height = 76;
    const d = ROWS[n];
    if (d) {
      const v = [n + 1, d.photo ? '' : '(사진)', d.content, d.loc, d.work, d.cond, d.act, d.type, d.agent, d.group, d.item, d.kind,
        d.plan, d.ra, d.cp, d.st, d.guide, d.law, ...d.cause.map(x => (x ? '●' : '')),
        d.site.name, d.site.progress, d.site.scale, d.site.amount, d.fix || '(미조치)', d.fixPhoto ? '' : (d.fix ? '(사진)' : ''), d.date, d.who];
      v.forEach((val, i) => { row.getCell(i + 1).value = val; });
      if (d.photo) addImg(d.photo, 2, rowIdx);
      if (d.fixPhoto) addImg(d.fixPhoto, 28, rowIdx);
    }
    for (let i = 1; i <= COLS.length; i++) {
      const cell = row.getCell(i);
      cell.border = border;
      cell.font = { name: '맑은 고딕', size: 9, color: { argb: cell.value === '(미조치)' ? 'FFC00000' : (String(cell.value).startsWith('(사진') ? 'FFA6A6A6' : 'FF000000') } };
      const left = ['내용', '조치내용', '관련작업지침', '산업안전보건법', '상태', '행동'].includes(COLS[i - 1][1]);
      cell.alignment = { horizontal: left ? 'left' : 'center', vertical: 'middle', wrapText: true };
    }
  }

  // ═════════════ Sheet 2. 분류기준 (드롭다운 원본) ═════════════
  const wl = wb.addWorksheet('분류기준');
  const keys = Object.keys(LISTS);
  const listRange = {};
  keys.forEach((k, i) => {
    const col = i + 1;
    const letter = wl.getColumn(col).letter;
    wl.getColumn(col).width = Math.max(12, Math.min(34, Math.max(...LISTS[k].map(s => s.length)) * 1.6));
    const h = wl.getCell(1, col);
    h.value = LIST_TITLES[k];
    h.font = { bold: true, size: 10 };
    h.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: YELLOW } };
    h.border = border;
    LISTS[k].forEach((val, j) => { const c = wl.getCell(j + 2, col); c.value = val; c.border = border; c.font = { size: 9 }; });
    // 직접입력 값이 추가될 여유 행 30개 포함
    listRange[k] = `분류기준!$${letter}$2:$${letter}$${LISTS[k].length + 31}`;
  });
  wl.views = [{ state: 'frozen', ySplit: 1 }];

  // 드롭다운 연결 (직접입력 허용: showErrorMessage=false)
  COLS.forEach((c, i) => {
    const key = c[3];
    if (!key) return;
    const letter = ws.getColumn(i + 1).letter;
    ws.dataValidations.add(`${letter}3:${letter}${DATA_ROWS + 2}`, {
      type: 'list', allowBlank: true, formulae: [listRange[key]],
      showErrorMessage: false, showInputMessage: true,
      promptTitle: c[1], prompt: '목록에서 선택하거나 직접 입력하세요',
    });
  });

  // ═════════════ Sheet 3. 항목별 법령·핵심수칙 ═════════════
  const wr = wb.addWorksheet('항목별 법령·수칙');
  wr.columns = [
    { header: '종류', key: 'kind', width: 13 },
    { header: '항목', key: 'name', width: 18 },
    { header: '대표 유형', key: 'type', width: 12 },
    { header: '관련 조문', key: 'law', width: 30 },
    { header: '주요 기인물', key: 'agents', width: 40 },
    { header: '핵심 안전수칙 (1페이지 교육자료에 사용)', key: 'rules', width: 70 },
  ];
  allItems.forEach(it => wr.addRow({
    kind: it.kind, name: it.name, type: it.defaultType, law: it.law,
    agents: it.agents.join(', '), rules: it.rules.map((r, i) => `${i + 1}. ${r}`).join('\n'),
  }));
  wr.eachRow((row, idx) => row.eachCell(cell => {
    cell.border = border;
    cell.alignment = { vertical: 'middle', wrapText: true };
    cell.font = { size: 9, bold: idx === 1 };
    if (idx === 1) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: YELLOW } };
  }));
  wr.views = [{ state: 'frozen', ySplit: 1 }];

  // ═════════════ Sheet 4. 작성요령 ═════════════
  const wg = wb.addWorksheet('작성요령');
  wg.getColumn(1).width = 16; wg.getColumn(2).width = 18; wg.getColumn(3).width = 80;
  const guide = [
    ['구분', '항목', '작성 방법'],
    ['부적합 사항', '사진', '이미 촬영한 사진을 앱에서 등록 (자동 압축, 촬영일시 자동 인식)'],
    ['', '내용', '부적합 내용을 구체적으로 (무엇이 / 어떻게)'],
    ['', '장소/위치', '동·층·구역 (현장별 최근 입력값 추천)'],
    ['', '작업명', '분류기준 [작업명] 선택 또는 직접입력'],
    ['불안전 상황', '상태 / 행동', '안전보건공단 재해원인 분류(불안전한 상태·행동) 선택 또는 직접입력'],
    ['부적합 분류', '유형', '산업재해 발생형태 분류 (떨어짐=추락, 무너짐=붕괴, 끼임=협착 등)'],
    ['', '기인물 / 항목 / 종류', '종류 → 항목 → 기인물 순으로 좁혀서 선택 (앱에서는 자동 연동)'],
    ['', '공종', '작업명을 선택하면 앱이 자동 입력 (수정 가능)'],
    ['작업계획', '작업계획', '작업계획서 수립 여부'],
    ['관련근거', '위험성평가 등', '반영 / 미반영 / 해당없음'],
    ['', '산업안전보건법', '항목 선택 시 관련 조문 자동 추천 (산업안전보건기준에 관한 규칙)'],
    ['발생원인', '인적·물적·기술적·시스템적', '해당하는 원인에 ● 표시 (복수 선택 가능)'],
    ['현장정보', '현장명 등', '앱의 현장 설정값이 자동 입력'],
    ['조치사항', '조치내용 / 조치사진', '조치 완료 후 앱에서 입력. 비어 있으면 미조치로 집계'],
    ['관리정보(자동)', '점검일자 / 점검자', '사진 촬영일시(또는 등록일)와 로그인 점검자가 자동 기록'],
    ['', '', ''],
    ['출처', '', tax.sources.map(s => `• ${s.name}`).join('\n')],
    ['참고', '', '드롭다운 칸은 목록에 없는 값도 직접 입력할 수 있습니다. 조문 번호는 현행 법령 기준으로 확인 후 사용하세요.'],
  ];
  guide.forEach((g, i) => {
    const row = wg.addRow(g);
    row.eachCell({ includeEmpty: true }, cell => {
      cell.border = border; cell.alignment = { vertical: 'middle', wrapText: true };
      cell.font = { size: 10, bold: i === 0 };
      if (i === 0) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: YELLOW } };
    });
  });

  await wb.xlsx.writeFile(OUT);
  console.log('생성 완료:', OUT);
})();
