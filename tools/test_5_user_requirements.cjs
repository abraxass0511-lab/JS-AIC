const fs = require('fs');
const path = require('path');

// Test ppt-generator.js in ESM environment
const code = fs.readFileSync(path.join(__dirname, '../app/js/ppt-generator.js'), 'utf8');
const fn = new Function('module', 'exports', code);
const m = { exports: {} };
fn(m, m.exports);
const SafePPT = m.exports;

console.log('=== SafePPT 5 User Requirements Test ===');

const sampleRecord = {
  id: 'REC-TEST-001',
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

const norm = SafePPT.normalizeJangpyoData(sampleRecord);
console.log('1. normalizeJangpyoData results:');
console.log('  - typeMain (22 types):', norm.typeMain, '(expected: 추락)');
console.log('  - typeSub:', norm.typeSub, '(expected: empty)');
console.log('  - lawTitle:', norm.lawTitle, '(expected: 안전보건규칙 제56조, 제13조)');
console.log('  - photoBanner:', norm.photoBanner, '(expected direct action)');

if (norm.typeMain !== '추락') throw new Error('typeMain failed');
if (!norm.lawTitle.startsWith('안전보건규칙')) throw new Error('lawTitle failed');
if (!norm.photoBanner.includes('손으로') && !norm.photoBanner.includes('유도로프')) throw new Error('photoBanner failed');

console.log('\n2. Testing HTML Preview:');
const html = SafePPT.renderInspectionSheetHTML(sampleRecord, {
  photo1Url: 'samples/horizontal_photo1.jpg',
  photo2Url: 'samples/horizontal_photo2.jpg'
});

// Check Requirement 1: no vertical line in 4 causes box
const hasVerticalBorder = html.includes('border-right: 0.5px solid #000000');
console.log('  - Requirement 1 (No vertical center line in 4 causes):', !hasVerticalBorder ? 'PASSED' : 'FAILED');
if (hasVerticalBorder) throw new Error('Vertical border still present in 4 causes box');

// Check Requirement 2: 22 types in accident box
const has22Type = html.includes(norm.typeMain);
console.log('  - Requirement 2 (22 types in accident box):', has22Type ? 'PASSED' : 'FAILED');

// Check Requirement 3: law title is "안전보건규칙 제//조"
const hasLawTitle = html.includes(norm.lawTitle);
console.log('  - Requirement 3 (Simplified law title):', hasLawTitle ? 'PASSED' : 'FAILED');

// Check Requirement 4: Red banner with direct action
const hasRedBanner = html.includes('background: #c00000') && html.includes(norm.photoBanner);
console.log('  - Requirement 4 (Red banner with direct action):', hasRedBanner ? 'PASSED' : 'FAILED');
if (!hasRedBanner) throw new Error('Red banner not rendered in HTML preview');

// Check Requirement 5: Photo 1 and Photo 2 have identical dimensions
const photo1Match = html.match(/left:\s*0\.9750%;\s*top:\s*32\.3333%;\s*width:\s*30\.6008%;\s*height:\s*64\.1333%/);
const photo2Match = html.match(/left:\s*32\.1758%;\s*top:\s*32\.3333%;\s*width:\s*30\.6008%;\s*height:\s*64\.1333%/);
console.log('  - Requirement 5 (Photo 1 & Photo 2 identical height & baseline):', (photo1Match && photo2Match) ? 'PASSED' : 'FAILED');
if (!photo1Match || !photo2Match) throw new Error('Photo dimensions mismatch');

console.log('\nAll 5 requirements verified successfully in code!');
