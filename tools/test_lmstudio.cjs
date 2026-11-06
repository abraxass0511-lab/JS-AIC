const fs = require('fs');
const path = require('path');

globalThis.localStorage = {
  getItem: () => null,
  setItem: () => {}
};
globalThis.window = {
  SAFEPATROL_CONFIG: {}
};

const code = fs.readFileSync(path.join(__dirname, '../app/js/lmstudio-client.js'), 'utf8');
const runFn = new Function('window', 'globalThis', 'module', 'exports', 'localStorage', code);
const mockModule = { exports: {} };
runFn(globalThis.window, globalThis, mockModule, mockModule.exports, globalThis.localStorage);
const AI = mockModule.exports;

console.log('=== SafeLocalAI quickRuleAnalysis Tests ===');

const cases = [
  '통로 바닥에 전선이 정리되지 않아 통행자가 걸려 넘어질 위험',
  '1. 보 상부작업을 승인받지 않고 작업 2. 보 상부작업 시 작업자세 불안전(다이빙 자세)',
  '구획된 바닥 안전통로에 거푸집 자재를 방치함',
  '양중화물 유도로프 미사용 (직접 손으로 양중화물을 잡고 작업함)',
  '말비계 설치범위가 모서리 구간에 있어서 단부 추락이 위험이 있음'
];

cases.forEach((txt, idx) => {
  const res = AI.quickRuleAnalysis(txt);
  console.log(`\n[케이스 ${idx + 1}] "${txt}"`);
  console.log(`  - photoBanner : ${res?.photoBanner}`);
  console.log(`  - photo2Banner: ${res?.photo2Banner || '(없음)'}`);
  console.log(`  - law         : ${res?.law}`);
  console.log(`  - severity    : ${res?.severity}`);
});
