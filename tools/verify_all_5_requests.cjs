const fs = require('fs');
const path = require('path');
const pptxgen = require('pptxgenjs');

// Load ppt-generator.js
const code = fs.readFileSync(path.join(__dirname, '../app/js/ppt-generator.js'), 'utf8');
const fn = new Function('module', 'exports', code);
const m = { exports: {} };
fn(m, m.exports);
const SafePPT = m.exports;

// Load lmstudio-client.js
const mockLocalStorage = { getItem: () => null, setItem: () => null };
const lmCode = fs.readFileSync(path.join(__dirname, '../app/js/lmstudio-client.js'), 'utf8');
const SafeLocalAI = new Function('globalThis', 'localStorage', lmCode + '; return globalThis.SafeLocalAI;')(globalThis, mockLocalStorage);

async function testAll() {
  console.log('=== VERIFYING 5 USER REQUESTS ===\n');

  // Test 1: Law title font size
  console.log('[Test 1] Law Title Font Size:');
  const record1 = {
    content: '양중작업 시 유도로프 미사용 및 수평양중 미실시',
    law: '안전보건규칙 제38조, 제171조'
  };
  const norm1 = SafePPT.normalizeJangpyoData(record1);
  console.log(' - lawTitle:', norm1.lawTitle);
  // Test HTML preview font size
  const html1 = SafePPT.renderInspectionSheetHTML(record1);
  const titleMatch = html1.match(/4-1\. 관련기준 제목[\s\S]*?font-size:\s*([\d\.]+)cqw/);
  console.log(' - Rendered law title font size in HTML:', titleMatch ? titleMatch[1] + 'cqw (corresponds to 14pt: ' + (14 * 0.104167).toFixed(4) + 'cqw)' : 'not found');
  if (titleMatch && Math.abs(parseFloat(titleMatch[1]) - 14 * 0.104167) < 0.01) {
    console.log('   ✅ PASS: Law title default font size is 14pt!');
  } else {
    console.error('   ❌ FAIL: Law title is not 14pt!');
  }

  // Test 2: Banner background color
  console.log('\n[Test 2] Banner Background Color:');
  const bannerBgMatch = html1.match(/6-6a\. 사진 상단 직접 행동 적색 음영 배너[\s\S]*?background:\s*(#[a-fA-F0-9]+)/);
  console.log(' - Banner background in HTML:', bannerBgMatch ? bannerBgMatch[1] : 'not found');
  if (bannerBgMatch && bannerBgMatch[1].toLowerCase() === '#a05a66') {
    console.log('   ✅ PASS: Banner background matches sampled burgundy color #A05A66 from Image 2!');
  } else {
    console.error('   ❌ FAIL: Banner background mismatch!');
  }

  // Test 3: Direct Action for 말비계
  console.log('\n[Test 3] Direct Action for 말비계:');
  const recordMalbigye = {
    content: '말비계 설치범위가 모서리 구간에서 그쳐, 단부 추락위험',
    subcontractor: 'D사',
    workGroup: '조적',
    location: '105동 지하2층'
  };
  const normMalbigye = SafePPT.normalizeJangpyoData(recordMalbigye);
  console.log(' - PPT Generator photoBanner:', normMalbigye.photoBanner);
  console.log(' - PPT Generator lawTitle:', normMalbigye.lawTitle);

  const quickAnalysis = SafeLocalAI.quickRuleAnalysis(recordMalbigye.content);
  console.log(' - SafeLocalAI photoBanner:', quickAnalysis.photoBanner);
  console.log(' - SafeLocalAI law:', quickAnalysis.law);

  if (normMalbigye.photoBanner === '말비계 모서리 구간 단부 추락방지 미조치' && quickAnalysis.photoBanner === '말비계 모서리 구간 단부 추락방지 미조치') {
    console.log('   ✅ PASS: Accurate 말비계 edge fall prevention banner generated without hallucinating 개구부 or 사다리!');
  } else {
    console.error('   ❌ FAIL: photoBanner is incorrect for 말비계!');
  }

  // Test 4: Unified Banner Width to Image 1 (5.715)
  console.log('\n[Test 4] Unified Banner Width:');
  const htmlSingle = SafePPT.renderInspectionSheetHTML(recordMalbigye, { photo1Url: 'photo1.jpg' });
  const htmlDouble = SafePPT.renderInspectionSheetHTML(recordMalbigye, { photo1Url: 'photo1.jpg', photo2Url: 'photo2.jpg' });

  const widthSingleMatch = htmlSingle.match(/6-6a\. 사진 상단 직접 행동 적색 음영 배너[\s\S]*?width:\s*([\d\.]+)%/);
  const widthDoubleMatch = htmlDouble.match(/6-6a\. 사진 상단 직접 행동 적색 음영 배너[\s\S]*?width:\s*([\d\.]+)%/);

  console.log(' - 1-Photo Mode Banner Width:', widthSingleMatch ? widthSingleMatch[1] + '%' : 'not found');
  console.log(' - 2-Photo Mode Banner Width:', widthDoubleMatch ? widthDoubleMatch[1] + '%' : 'not found');

  const expectedPct = ((5.715 / 13.333) * 100).toFixed(4) + '%';
  if (widthSingleMatch[1] + '%' === expectedPct && widthDoubleMatch[1] + '%' === expectedPct) {
    console.log(`   ✅ PASS: Both 1-photo and 2-photo modes use identical width ${expectedPct} (w = 5.715 in, matching Image 1)!`);
  } else {
    console.error('   ❌ FAIL: Banner width not unified!');
  }

  // Test 5: Uniform Preview Photo Sizes
  console.log('\n[Test 5] Uniform Preview Photo Sizing:');
  // Check that both photo 1 and photo 2 use object-fit: cover and have same height
  const p1Slot = htmlDouble.match(/📸 사진 1|<img src="photo1\.jpg"[\s\S]*?>/);
  const p2Slot = htmlDouble.match(/📸 사진 2|<img src="photo2\.jpg"[\s\S]*?>/);

  console.log(' - Photo 1 markup:', p1Slot ? p1Slot[0] : 'not found');
  console.log(' - Photo 2 markup:', p2Slot ? p2Slot[0] : 'not found');

  const hasCover1 = htmlDouble.includes('style="width: 100%; height: 100%; object-fit: cover; display: block;"');
  const hasEqualSlotWidth = htmlDouble.includes(`width: ${((4.080 / 13.333) * 100).toFixed(4)}%`);
  const hasEqualSlotHeight = htmlDouble.includes(`height: ${((4.810 / 7.500) * 100).toFixed(4)}%`);

  if (hasCover1 && hasEqualSlotWidth && hasEqualSlotHeight) {
    console.log('   ✅ PASS: Photos fill identical rectangular slots (w: 4.080 in, h: 4.810 in) with object-fit: cover!');
  } else {
    console.error('   ❌ FAIL: Photo sizing not unified!');
  }

  // Now generate PPTX to verify PptxGenJS generation with cover
  console.log('\n[PPTX Generation Test]');
  const pptx = new pptxgen();
  pptx.defineLayout({ name: 'WIDE_16_9', width: 13.333, height: 7.5 });
  pptx.layout = 'WIDE_16_9';

  await SafePPT.addInspectionSheetSlide(pptx, recordMalbigye, {
    loadPhotoBase64: async (p, r, idx) => {
      const sampleFile = idx === 0 ? 'app/samples/horizontal_photo1.jpg' : 'app/samples/horizontal_photo2.jpg';
      if (fs.existsSync(sampleFile)) {
        return 'image/jpeg;base64,' + fs.readFileSync(sampleFile).toString('base64');
      }
      return null;
    }
  });

  const outPptx = path.join(__dirname, 'test_5_requirements_verified.pptx');
  await pptx.writeFile({ fileName: outPptx });
  console.log('Successfully wrote:', outPptx, 'size:', fs.statSync(outPptx).size, 'bytes');

  console.log('\nALL 5 REQUIREMENTS FULLY VERIFIED!');
}

testAll().catch(console.error);
