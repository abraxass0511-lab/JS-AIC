const fs = require('fs');
global.window = {};
global.Blob = class Blob {};
global.URL = { createObjectURL: () => '', revokeObjectURL: () => '' };
const PptxGenJS = require('pptxgenjs');
global.PptxGenJS = PptxGenJS;

require('../app/js/ppt-generator.js');
const SafePPT = globalThis.SafePPT;

// 1. 단일 사진 + 넘어짐(전도:사람) 레코드 (사용자 스크린샷과 100% 동일한 케이스)
const userRecord1 = {
  id: 'test-fall-over',
  type: '넘어짐(전도:사람)',
  severity: '경부적합',
  isMajor: false,
  law: '산업안전보건기준에 관한 규칙 제38조(사전조사 및 작업계획서의 작성 등)',
  causes: ['불안전 상태', '계획 미이행'],
  subcontractor: '원영건업(주)',
  workGroup: '철근콘크리트공사',
  location: '계단·복도',
  inspector: '신이삭',
  inspectRound: '3차',
  content: '구획된 바닥 안전통로에 거푸집 자재를 방치함'
};

const norm1 = SafePPT.normalizeJangpyoData(userRecord1);
console.log('--- Test 1: normalizeJangpyoData ---');
console.log('typeMain:', norm1.typeMain);
console.log('typeSub:', norm1.typeSub);
console.log('lawTitle:', norm1.lawTitle);
console.log('photo1Title:', norm1.photo1Title);

if (norm1.typeMain !== '넘어짐' || norm1.typeSub !== '(전도 : 사람)') {
  console.error('FAIL: typeMain or typeSub parsing failed!');
  process.exit(1);
}

// 2. HTML 미리보기 검증 (단일 사진)
const html1 = SafePPT.renderInspectionSheetHTML(userRecord1, {
  photo1Url: 'samples/test1.jpg',
  photo2Url: ''
});

console.log('\n--- Test 2: renderInspectionSheetHTML (1 photo) ---');
console.log('Has photo 2 placeholder:', html1.includes('사진 2'));
console.log('Has typeMain 넘어짐:', html1.includes('넘어짐'));
console.log('Has typeSub (전도 : 사람):', html1.includes('(전도 : 사람)'));
console.log('Has nowrap on lawTitle:', html1.includes('white-space: nowrap; overflow: hidden; text-overflow: ellipsis;'));

if (html1.includes('사진 2')) {
  console.error('FAIL: Photo 2 placeholder should NOT be present when photo2 is absent!');
  process.exit(1);
}

// 3. PPT 생성 검증 (단일 사진)
const pptx = new PptxGenJS();
pptx.defineLayout({ name: 'WIDE_16_9', width: 13.333, height: 7.5 });
pptx.layout = 'WIDE_16_9';

const dummyPhoto1 = 'image/jpeg;base64,' + fs.readFileSync('app/samples/horizontal_photo2.jpg').toString('base64');

SafePPT.addInspectionSheetSlide(pptx, userRecord1, {
  loadPhotoBase64: async (path, rec, idx) => {
    return idx === 0 ? dummyPhoto1 : '';
  }
}).then(() => {
  return pptx.writeFile({ fileName: 'tools/test_single_photo_output.pptx' });
}).then(async () => {
  console.log('\n--- Test 3: PPTX Generation Check ---');
  const jszip = require('jszip');
  const zip = await jszip.loadAsync(fs.readFileSync('tools/test_single_photo_output.pptx'));
  const xml = await zip.file('ppt/slides/slide1.xml').async('text');
  
  const hasPhoto2Dummy = xml.includes('사진 2');
  const hasPhoto1 = xml.includes('ppt/media/image-1-1.jpeg');
  const hasPhoto2Img = xml.includes('ppt/media/image-1-2.jpeg');
  const hasSubText = xml.includes('(전도 : 사람)');
  const hasMainText = xml.includes('넘어짐');
  
  console.log('PPT has dummy "사진 2":', hasPhoto2Dummy);
  console.log('PPT has photo 1 image:', hasPhoto1);
  console.log('PPT has photo 2 image:', hasPhoto2Img);
  console.log('PPT has "넘어짐":', hasMainText);
  console.log('PPT has "(전도 : 사람)":', hasSubText);

  if (hasPhoto2Dummy || hasPhoto2Img) {
    console.error('FAIL: PPT should NOT have photo 2 image or dummy text when photo2 is absent!');
    process.exit(1);
  }
  if (!hasSubText || !hasMainText) {
    console.error('FAIL: PPT missing typeMain or typeSub text!');
    process.exit(1);
  }

  console.log('\nALL 3 USER REQUIREMENTS VERIFIED SUCCESSFULLY!');
}).catch(err => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
