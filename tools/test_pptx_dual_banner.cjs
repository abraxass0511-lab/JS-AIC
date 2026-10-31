const fs = require('fs');
const path = require('path');

globalThis.window = {};

const code = fs.readFileSync(path.join(__dirname, '../app/js/ppt-generator.js'), 'utf8');
const runFn = new Function('window', 'globalThis', 'module', 'exports', code);
const mockModule = { exports: {} };
runFn(globalThis.window, globalThis, mockModule, mockModule.exports);

const SafePPT = mockModule.exports.renderInspectionSheetHTML ? mockModule.exports : (globalThis.SafePPT || globalThis.window.SafePPT);

// Test rendering Image 4 (Dual banner)
const record4 = {
  severity: '중부적합',
  type: '충돌/협착',
  subcontractor: '원영건업(주)',
  workGroup: '거푸집동바리공사',
  location: '108동',
  inspector: '신우석 프로',
  inspectRound: "'26년 下 3차",
  content: '양중화물 유도로프 미사용 (직접 손으로 양중화물을 잡고 작업함)',
  hasGuideline: true,
  guidelineTitle: '줄걸이 작업자의 책임',
  guidelineBody: '1) 양중 시작 전 양중물로부터 5m 이상 안전거리를 확보해야 하고 양중물 하부에서 대기를 금지하며\n   양중물이 지면으로부터 1.5m 이내에 위치하였을 경우, 접근해야 한다.'
};

const html4 = SafePPT.renderInspectionSheetHTML(record4, {
  photo1Url: 'samples/lifting_hand.jpg',
  photo2Url: 'samples/lifting_rope.jpg'
});

console.log('Image 4 HTML length:', html4.length);
console.log('Includes photo 1 banner "양중작업 시 화물을 직접 손으로 잡음":', html4.includes('양중작업 시 화물을 직접 손으로 잡음'));
console.log('Includes photo 2 banner "양중작업 시 유도로프 미사용":', html4.includes('양중작업 시 유도로프 미사용'));
console.log('Includes Hold Point:', html4.includes('Hold Point 위반'));

// Test rendering Image 1 (Wire on floor)
const record1 = {
  severity: '경부적합',
  type: '전도',
  subcontractor: '원영건업(주)',
  workGroup: '골조공사',
  location: '지하1층',
  content: '통로 바닥에 전선이 정리되지 않아 통행자가 걸려 넘어질 위험'
};

const html1 = SafePPT.renderInspectionSheetHTML(record1, {});
console.log('\nImage 1 HTML length:', html1.length);
console.log('Includes "통로 바닥 가설전선 거치 및 정리 미실시":', html1.includes('통로 바닥 가설전선 거치 및 정리 미실시'));
console.log('Contains forbidden "표준 안전작업절차":', html1.includes('표준 안전작업절차 및 안전수칙 미준수'));
