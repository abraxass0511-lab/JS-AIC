const fs = require('fs');
const path = require('path');
const PptxGenJS = require('pptxgenjs');

// Mock localStorage and browser globals for Node.js test
globalThis.localStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {}
};

const pptGenPath = path.join(__dirname, '..', 'app', 'js', 'ppt-generator.js');
const pptGenCode = fs.readFileSync(pptGenPath, 'utf8');

const mockModule = { exports: {} };
const fn = new Function('module', 'exports', 'PptxGenJS', pptGenCode);
fn(mockModule, mockModule.exports, PptxGenJS);
const SafePPT = mockModule.exports;

async function runTest() {
  console.log('=== Test: Single red banner + equal photo sizes for 2 photos ===');

  const rec = {
    content: '보 거푸집 양중작업 시 양중화물의 수평이 맞지 않음 ↔ 지상에서 보 거푸집 양중로프 체결 시 로프간격을 맞추지 않음',
    subcontractor: '원영건업(주)',
    workGroup: '거푸집동바리공사',
    location: '108동',
    inspector: '신우석 프로',
    inspectRound: "'26년 下 3차",
    severity: '중부적합',
    type: '낙하',
    mgmtCauses: ['계획 미이행', '불안전 행동'],
    holdPoint: true
  };

  // Test HTML preview with 2 photos
  const html = SafePPT.renderInspectionSheetHTML(rec, {
    photo1Url: 'photo1_dummy.jpg',
    photo2Url: 'photo2_dummy.jpg'
  });

  // Verify: Only 1 red banner exists
  const bannerMatches = html.match(/background:\s*#a05a66/g) || [];
  console.log(`[HTML Check] Red banner count (#a05a66): ${bannerMatches.length} (Expected: 1)`);
  if (bannerMatches.length !== 1) {
    throw new Error(`Expected exactly 1 red banner, but found ${bannerMatches.length}`);
  }

  // Verify: Banner width is 5.715 (42.8636%)
  const expectedWidthPct = ((5.715 / 13.333) * 100).toFixed(4); // 42.8636%
  if (!html.includes(`width: ${expectedWidthPct}%`)) {
    throw new Error(`Expected banner width ${expectedWidthPct}%, not found in HTML`);
  }
  console.log(`[HTML Check] Banner width ${expectedWidthPct}% verified!`);

  // Verify: Both photo containers have identical dimensions
  const photoWidthPct = ((4.080 / 13.333) * 100).toFixed(4); // 30.6008%
  const photoHeightPct = ((4.810 / 7.500) * 100).toFixed(4); // 64.1333%
  const photoContainers = html.match(new RegExp(`width:\\s*${photoWidthPct}%;\\s*height:\\s*${photoHeightPct}%`, 'g')) || [];
  console.log(`[HTML Check] Identical photo containers count: ${photoContainers.length} (Expected: 2)`);
  if (photoContainers.length !== 2) {
    throw new Error(`Expected exactly 2 identical photo containers (${photoWidthPct}% x ${photoHeightPct}%), but found ${photoContainers.length}`);
  }

  // Test PPTX generation
  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: 'WIDE_16_9', width: 13.333, height: 7.5 });
  pptx.layout = 'WIDE_16_9';

  // 1x1 transparent png dummy
  const dummyBase64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

  await SafePPT.addInspectionSheetSlide(pptx, rec, {
    loadPhotoBase64: async () => dummyBase64
  });

  const pptxFile = path.join(__dirname, 'test_single_banner_2_photos.pptx');
  await pptx.writeFile({ fileName: pptxFile });
  console.log(`[PPTX Check] Successfully generated ${pptxFile}!`);

  console.log('✅ ALL TESTS PASSED SUCCESSFULLY!');
}

runTest().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
