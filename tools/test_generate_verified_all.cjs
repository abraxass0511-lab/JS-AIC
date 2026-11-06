const fs = require('fs');
const sharp = require('sharp');
const Tesseract = require('tesseract.js');
const { analyzeSheetLayout, findRedBanners, findPhotoBoxes } = require('../app/js/sheet-layout.js');
const SafePPT = require('../app/js/ppt-generator.js');
const SafeExcel = require('../app/js/excel-builder.js');

async function main() {
  console.log('=== End-to-end verification of PPT & Excel Generation ===');
  const records = [];

  for (let i = 0; i < 5; i++) {
    const file = `tools/landscape_p${i}.jpg`;
    const { data, info } = await sharp(file).raw().ensureAlpha().toBuffer({ resolveWithObject: true });
    const imgData = { data, width: info.width, height: info.height };
    const layout = analyzeSheetLayout(imgData);
    if (!layout || !layout.ok) continue;

    const banners = findRedBanners(imgData, layout.photoArea);
    const photoBoxes = findPhotoBoxes(imgData, layout.photoArea, banners);
    const realBoxes = photoBoxes.filter(b => !b.isReference);

    async function ocr(box) {
      if (!box || box.w < 5 || box.h < 5) return '';
      const crop = await sharp(file).extract({ left: box.x, top: box.y, width: box.w, height: box.h }).toBuffer();
      const ret = await Tesseract.recognize(crop, 'kor+eng');
      return ret.data.text.trim();
    }

    const [tMeta, tLaw, tContent, tInterview, tPropType, tPropText, tCm, tPm, tBanner] = await Promise.all([
      ocr(layout.metaRow),
      ocr(layout.lawCell),
      ocr(layout.contentRow),
      ocr(layout.interview),
      ocr(layout.proposalType),
      ocr(layout.proposalText),
      ocr(layout.countermeasure),
      ocr(layout.pmCell),
      banners.length > 0 ? ocr(banners[0]) : Promise.resolve('')
    ]);

    // Import helper cleaners from pptx-importer-v2
    const {
      cleanSubcontractor, cleanLocation, cleanWorkGroup, parseLawCell,
      cleanOpinionText, cleanProposalText, cleanActionPlan, cleanContent
    } = await import('../app/js/pptx-importer-v2.js');

    const mSub = tMeta.match(/협력사\s*[:;：]?\s*([^\n|]*?)(?=\s*(?:공종명|공종|작업장소|점검자|점검차수|$))/i);
    const subcontractor = cleanSubcontractor(mSub ? mSub[1] : '');

    const content = cleanContent(tContent);

    const mWork = tMeta.match(/공종명?\s*[:;：]?\s*([\s\S]*?)(?=\s*(?:작업장소|장소|점검자|점검차수|부적합|$))/i);
    const workGroup = cleanWorkGroup(mWork ? mWork[1] : '', content);

    const mLoc = tMeta.match(/작업장소\s*[:;：]?\s*([^\n|]*?)(?=\s*(?:점검자|점검차수|부적합|$))/i);
    const location = cleanLocation(mLoc ? mLoc[1] : '');

    const lawParsed = parseLawCell(tLaw);

    const mAuthor = tInterview.match(/\[\s*(?:관리자\s*의견|의견)\s*[:：]\s*([^\]]+)\]/i);
    const interviewAuthor = mAuthor ? mAuthor[1].replace(/의견\s*$/, '').trim() : '시공관리자 및 근로자';
    const interviewAuthorTitle = `[관리자 의견 : ${interviewAuthor}]`;
    const interviewOpinion = cleanOpinionText(tInterview.replace(/\[\s*(?:관리자\s*의견|의견)[^\]]*\]/gi, ''));

    const proposalItems = [];
    const fullPropType = `${tPropType} ${tPropText}`;
    if (/시스템\s*개선/i.test(fullPropType)) proposalItems.push({ type: '시스템 개선', sub: '(현장모니터링 강화)' });
    if (/교육\/코칭/i.test(fullPropType)) proposalItems.push({ type: '교육/코칭', sub: '(근로자 교육)' });
    if (/패널티|페널티/i.test(fullPropType)) proposalItems.push({ type: '페널티', sub: '(관리감독자 경고)' });
    const inspectorOpinionType = proposalItems.map(p => p.type).join(', ') || '시스템 개선';
    const auditProposal = cleanProposalText(tPropText);

    const actionPlan = cleanActionPlan(tCm);

    const pmItems = [];
    if (/시스템\s*개선/i.test(tPm)) pmItems.push({ type: '시스템 개선', sub: '(모니터링 강화)' });
    if (/교육\/코칭/i.test(tPm)) pmItems.push({ type: '교육/코칭', sub: '(근로자 교육)' });
    if (/패널티|페널티/i.test(tPm)) pmItems.push({ type: '페널티', sub: '(관리감독자 경고)' });
    const pmVerdictType = pmItems.map(p => p.type).join(', ') || inspectorOpinionType;

    // Crop real photos (base64)
    const photoBase64s = [];
    for (const b of realBoxes) {
      const cropBuf = await sharp(file).extract({ left: b.x, top: b.y, width: b.w, height: b.h }).jpeg().toBuffer();
      photoBase64s.push('data:image/jpeg;base64,' + cropBuf.toString('base64'));
    }

    const rec = {
      slideNumber: i + 1,
      pageNumber: i + 1,
      severity: '중부적합',
      type: '붕괴',
      workGroup,
      subcontractor,
      location,
      content,
      photoBanner: tBanner || '부적합 현장 확인',
      mgmtCauses: ['계획 미이행', '불안전 상태'],
      interviewAuthor,
      interviewAuthorTitle,
      interviewOpinion,
      proposalItems,
      inspectorOpinionType,
      auditProposal,
      actionPlan,
      countermeasure: actionPlan,
      pmVerdictItems: pmItems,
      pmVerdictType,
      pmVerdict: pmVerdictType,
      law: '산업안전보건기준에 관한 규칙 제332조',
      rawLaw: lawParsed.title,
      lawBody: lawParsed.body,
      photos: photoBase64s,
      photo1: photoBase64s[0] || null,
      photo2: photoBase64s[1] || null
    };

    records.push(rec);
  }

  console.log(`Parsed ${records.length} records successfully.`);

  globalThis.PptxGenJS = (await import('pptxgenjs')).default;
  globalThis.ExcelJS = require('exceljs');
  await import('../app/js/ppt-generator.js');
  await import('../app/js/excel-builder.js');
  const SafePPT = globalThis.SafePPT;
  const SafeExcel = globalThis.SafeExcel;

  // 1. Generate PPT
  const pptRes = await SafePPT.generateInspectionSheetPPT({
    records,
    download: false,
    title: 'SafePatrol 현장 패트롤 점검장표 (정밀 개선 검증)',
    loadPhotoBase64: async (r, idx) => r.photos[idx] || null
  });
  if (pptRes && pptRes.blob) {
    const arrayBuffer = await pptRes.blob.arrayBuffer();
    fs.writeFileSync('tools/verified_all_10_requests.pptx', Buffer.from(arrayBuffer));
    console.log('Saved tools/verified_all_10_requests.pptx');
  }

  // 2. Generate Excel
  const wb = await SafeExcel.build(globalThis.ExcelJS, {
    records,
    siteName: '현장',
    inspectDate: '2026-10-24'
  });
  await wb.xlsx.writeFile('tools/verified_all_10_requests.xlsx');
  console.log('Saved tools/verified_all_10_requests.xlsx');

  // Verify all 10 user requirements
  console.log('\n========================================');
  console.log('VERIFICATION SUMMARY OF 10 USER REQUESTS:');
  records.forEach((r, idx) => {
    console.log(`\n[Record ${idx + 1}]`);
    console.log(`- 1. Subcontractor: "${r.subcontractor}" (Must NOT be '원영건업(주)' if blank)`);
    console.log(`- 2. Location: "${r.location}" (No '[ERE', 'MAK', etc.)`);
    console.log(`- 3. Law Title: "${r.rawLaw}" (No '5: 형 거푸집공 업적')`);
    console.log(`- 4. Proposal Items: "${r.inspectorOpinionType}"`);
    console.log(`- 5. Action Plan:\n${r.actionPlan}`);
    console.log(`- 7. Interview Opinion: "${r.interviewOpinion}" (No trailing '블')`);
    console.log(`- 8. Audit Proposal: "${r.auditProposal}" (No leading '| -')`);
    console.log(`- 9. Work Group: "${r.workGroup}" (No 'HA 공사', no '_ |')`);
    console.log(`- 10. Real Photos Count: ${r.photos.length}`);
  });
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
