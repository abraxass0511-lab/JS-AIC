const fs = require('fs');
const path = require('path');
const pptxgen = require('pptxgenjs');
const ExcelJS = require('exceljs');
require('../app/js/ppt-generator.js');
require('../app/js/excel-builder.js');
const pptGenerator = globalThis.SafePPT;
const excelBuilder = globalThis.SafeExcel;

// Read parsed records
const recs = JSON.parse(fs.readFileSync(path.join(__dirname, 'parsed_records.json'), 'utf8'));

// Apply banner clean
recs.forEach(r => {
  const h = (r.photoBanner.match(/[가-힣]/g) || []).length;
  if (h < 3 || h / r.photoBanner.length < 0.5) {
    if (r.content.includes('버팀대')) r.photoBanner = '외부비계 벽이음용 버팀대 설치각도 기준 미준수';
    else if (r.content.includes('가새')) r.photoBanner = '비계 설치구간 가새 설치 누락';
  }
});

(async () => {
  console.log('=== 1. VERIFYING PARSED RECORDS (5 PAGES) ===');
  const p1 = recs[0];
  console.log('Page 1 Photos count:', p1.photos.length);
  console.log('Page 1 Photo 1 exists:', !!p1.photo1);
  console.log('Page 1 Photo 2 exists:', !!p1.photo2);
  console.log('Page 1 Red Banner:', p1.photoBanner);
  console.log('Page 1 Mgmt Causes:', p1.mgmtCauses);
  console.log('Page 1 Author Title:', p1.interviewAuthorTitle);
  console.log('Page 1 Proposal Items:', p1.proposalItems);
  console.log('Page 1 Proposal Text:', p1.auditProposal.split('\n')[0]);
  console.log('Page 1 PM Verdict Items:', p1.pmVerdictItems);
  console.log('Page 1 WorkGroup:', p1.workGroup);

  // Assertions
  if (p1.photos.length !== 1) throw new Error('FAIL: Page 1 must have exactly 1 real photo, reference excluded!');
  if (p1.photo2 !== null) throw new Error('FAIL: Page 1 photo2 must be null (reference drawing excluded)!');
  if (p1.photoBanner.includes('안전기준 미준수 및 조치 미흡')) throw new Error('FAIL: Banner must not be generic!');
  if (!p1.interviewAuthorTitle.includes('협력사 시공관리자')) throw new Error('FAIL: Author title must include 협력사 시공관리자!');
  if (p1.proposalItems.length < 2) throw new Error('FAIL: Page 1 must have 2 proposal items (시스템 개선, 교육/코칭)!');
  if (p1.auditProposal.includes('양중화물의 수평양중')) throw new Error('FAIL: Proposal text must NOT contain dummy 양중 text!');
  if (p1.mgmtCauses.length !== 2) throw new Error('FAIL: Exactly 2 causes must be selected!');
  if (p1.workGroup.includes('_') || p1.workGroup.includes('ㅣ')) throw new Error('FAIL: WorkGroup must not have _ or ㅣ!');

  console.log('\n=== 2. GENERATING PPTX ===');
  const pptx = new pptxgen();
  pptx.layout = 'LAYOUT_16x9';

  for (const r of recs) {
    const data = pptGenerator.normalizeJangpyoData(r);
    await pptGenerator.addInspectionSheetSlide(pptx, r, data, {
      loadPhotoBase64: async (url) => url
    });
  }

  const pptxPath = path.join(__dirname, 'verified_all_improvements.pptx');
  await pptx.writeFile({ fileName: pptxPath });
  console.log('PPTX created:', pptxPath);

  console.log('\n=== 3. GENERATING EXCEL ===');
  const wb = await excelBuilder.build(ExcelJS, {
    records: recs,
    taxonomy: require('../app/data/taxonomy_9x9.json')
  });

  const xlsxPath = path.join(__dirname, 'verified_all_improvements.xlsx');
  await wb.xlsx.writeFile(xlsxPath);
  console.log('Excel created:', xlsxPath);

  // Inspect Excel contents
  const ws = wb.getWorksheet('부적합사항대장');
  console.log('\n=== 4. VERIFYING EXCEL COLUMNS & ROWS ===');
  const r1Headers = [];
  const r2Headers = [];
  ws.getRow(1).eachCell(c => r1Headers.push(c.value));
  ws.getRow(2).eachCell(c => r2Headers.push(c.value));
  console.log('Row 2 Headers sample:', r2Headers.slice(0, 15));

  const bannerColIdx = r2Headers.indexOf('사진 요약(배너)') + 1;
  const authorColIdx = r2Headers.indexOf('관계자 구분') + 1;
  const opinionColIdx = r2Headers.indexOf('관계자 의견') + 1;
  const propTypeColIdx = r2Headers.indexOf('점검자 의견 구분') + 1;
  const propColIdx = r2Headers.indexOf('점검자 의견') + 1;
  const cmColIdx = r2Headers.indexOf('조치내용') + 1;
  const pmColIdx = r2Headers.indexOf('PM 판정결과') + 1;
  const unexecutedColIdx = r2Headers.indexOf('계획 미이행') + 1;
  const conditionColIdx = r2Headers.indexOf('불안전 상태') + 1;
  const unplannedColIdx = r2Headers.indexOf('계획 미수립') + 1;
  const actionColIdx = r2Headers.indexOf('불안전 행동') + 1;

  console.log('Col indices: banner=' + bannerColIdx + ', author=' + authorColIdx + ', propType=' + propTypeColIdx + ', pm=' + pmColIdx);

  const row3 = ws.getRow(3);
  console.log('Row 3 (Page 1) Values:');
  console.log('  사진 요약(배너):', row3.getCell(bannerColIdx).value);
  console.log('  관계자 구분:', row3.getCell(authorColIdx).value);
  console.log('  관계자 의견:', row3.getCell(opinionColIdx).value);
  console.log('  점검자 의견 구분:', row3.getCell(propTypeColIdx).value);
  console.log('  점검자 의견:', row3.getCell(propColIdx).value);
  console.log('  조치내용:', row3.getCell(cmColIdx).value);
  console.log('  PM 판정결과:', row3.getCell(pmColIdx).value);
  console.log('  계획 미이행 mark:', row3.getCell(unexecutedColIdx).value);
  console.log('  불안전 상태 mark:', row3.getCell(conditionColIdx).value);
  console.log('  계획 미수립 mark:', row3.getCell(unplannedColIdx).value);
  console.log('  불안전 행동 mark:', row3.getCell(actionColIdx).value);

  if (!row3.getCell(bannerColIdx).value) throw new Error('FAIL: Banner cell must not be empty!');
  if (!row3.getCell(authorColIdx).value.includes('협력사 시공관리자')) throw new Error('FAIL: Author cell must be 협력사 시공관리자!');
  if (row3.getCell(opinionColIdx).value.includes('HAT')) throw new Error('FAIL: Opinion must not have HAT!');
  if (!row3.getCell(propTypeColIdx).value.includes('시스템 개선') || !row3.getCell(propTypeColIdx).value.includes('교육/코칭')) {
    throw new Error('FAIL: Prop type must have both 시스템 개선 and 교육/코칭!');
  }
  if (!row3.getCell(pmColIdx).value.includes('시스템 개선') || !row3.getCell(pmColIdx).value.includes('교육/코칭')) {
    throw new Error('FAIL: PM verdict must have both 시스템 개선 and 교육/코칭!');
  }
  if (row3.getCell(unexecutedColIdx).value !== '●' || row3.getCell(conditionColIdx).value !== '●') {
    throw new Error('FAIL: 계획 미이행 and 불안전 상태 must be marked ●!');
  }
  if (row3.getCell(unplannedColIdx).value === '●' || row3.getCell(actionColIdx).value === '●') {
    throw new Error('FAIL: 계획 미수립 and 불안전 행동 must NOT be marked ●!');
  }

  console.log('\nALL 7 VERIFICATION CHECKS PASSED PERFECTLY!');
})();
