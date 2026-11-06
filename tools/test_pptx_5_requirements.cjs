const fs = require('fs');
const path = require('path');
const pptxgen = require('pptxgenjs');

// Test ppt-generator.js in ESM environment
const code = fs.readFileSync(path.join(__dirname, '../app/js/ppt-generator.js'), 'utf8');
const fn = new Function('module', 'exports', code);
const m = { exports: {} };
fn(m, m.exports);
const SafePPT = m.exports;

async function testPptx() {
  const pptx = new pptxgen();
  pptx.defineLayout({ name: 'WIDE_16_9', width: 13.333, height: 7.5 });
  pptx.layout = 'WIDE_16_9';

  const sampleRecord = {
    id: 'REC-TEST-PPT-001',
    site: '강남 A 현장',
    location: '108동 지상 15층',
    subcontractor: '원영건업(주)',
    workGroup: '거푸집동바리공사',
    type: '떨어짐(추락, 사람)',
    severity: '중부적합',
    content: '양중작업 시 유도로프 미사용 및 화물을 직접 손으로 잡고 유도함',
    law: '산업안전보건기준에 관한 규칙 제56조(작업발판의 구조), 제13조(안전난간의 구조 및 요건)',
    causes: ['불안전 상태', '계획 미수립'],
    mgmtCauses: ['계획 미수립'],
    photos: ['samples/horizontal_photo1.jpg', 'samples/horizontal_photo2.jpg'],
    holdPoint: false,
    inspectRound: "'26년 下 3차",
    inspector: '김안전'
  };

  await SafePPT.addInspectionSheetSlide(pptx, sampleRecord, {
    loadPhotoBase64: async (photoPath) => {
      const fullPath = path.join(__dirname, '../app', photoPath);
      if (fs.existsSync(fullPath)) {
        const buf = fs.readFileSync(fullPath);
        return 'image/jpeg;base64,' + buf.toString('base64');
      }
      return null;
    }
  });

  const outPath = path.join(__dirname, 'output_5_requirements_test.pptx');
  await pptx.writeFile({ fileName: outPath });
  console.log('PPTX created successfully at:', outPath, 'Size:', fs.statSync(outPath).size);
}

testPptx().catch(err => {
  console.error('PPTX generation error:', err);
  process.exit(1);
});
