const fs = require('fs');
global.window = {};
global.Blob = class Blob {};
global.URL = { createObjectURL: () => '', revokeObjectURL: () => '' };
const PptxGenJS = require('pptxgenjs');
global.PptxGenJS = PptxGenJS;

require('../app/js/ppt-generator.js');
const SafePPT = globalThis.SafePPT;

const p1B64 = 'image/jpeg;base64,' + fs.readFileSync('app/samples/horizontal_photo1.jpg').toString('base64');
const p2B64 = 'image/jpeg;base64,' + fs.readFileSync('app/samples/horizontal_photo2.jpg').toString('base64');

const sampleRecord = {
  id: 'test-horizontal-lift',
  type: '낙하',
  severity: '중부적합',
  isMajor: true,
  causes: ['불안전 행동', '계획 미이행'],
  subcontractor: '원영건업(주)',
  workGroup: '거푸집동바리공사',
  location: '108동',
  inspector: '관리자',
  inspectRound: "'26년 下 3차",
  content: '보 거푸집 양중작업 시 양중화물의 수평이 맞지 않음 ↔ 지상에서 보 거푸집 양중로프 체결 시 로프간격을 맞추지 않음'
};

const pptx = new PptxGenJS();
pptx.defineLayout({ name: 'WIDE_16_9', width: 13.333, height: 7.5 });
pptx.layout = 'WIDE_16_9';

SafePPT.addInspectionSheetSlide(pptx, sampleRecord, {
  loadPhotoBase64: async (path, rec, idx) => {
    return idx === 0 ? p1B64 : p2B64;
  }
}).then(() => {
  return pptx.writeFile({ fileName: 'tools/test_out_healed.pptx' });
}).then(() => {
  console.log('Successfully written tools/test_out_healed.pptx!');
  const jszip = require('jszip');
  return jszip.loadAsync(fs.readFileSync('tools/test_out_healed.pptx'));
}).then(async zip => {
  const f1 = await zip.file('ppt/media/image1.jpeg').async('nodebuffer');
  const f2 = await zip.file('ppt/media/image2.jpeg').async('nodebuffer');
  console.log('image1 size in pptx:', f1.length);
  console.log('image2 size in pptx:', f2.length);
  const sharp = require('sharp');
  const meta1 = await sharp(f1).metadata();
  const meta2 = await sharp(f2).metadata();
  console.log('Embedded image 1 dimensions:', meta1.width, 'x', meta1.height);
  console.log('Embedded image 2 dimensions:', meta2.width, 'x', meta2.height);
}).catch(console.error);
