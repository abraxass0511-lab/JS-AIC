// tools/test_frequency.cjs
const assert = require('assert');

// Mock localStorage
const storage = {};
global.localStorage = {
  getItem: (k) => storage[k] || null,
  setItem: (k, v) => { storage[k] = String(v); },
  removeItem: (k) => { delete storage[k]; },
  clear: () => { Object.keys(storage).forEach(k => delete storage[k]); }
};

// Extract FieldFrequencyManager logic from app/js/app.js
const fs = require('fs');
const appJs = fs.readFileSync('app/js/app.js', 'utf8');

// Evaluate FieldFrequencyManager in isolation
const startIdx = appJs.indexOf('const FieldFrequencyManager = {');
const endIdx = appJs.indexOf('function renderQuickChipsForField');
assert(startIdx !== -1 && endIdx !== -1, 'FieldFrequencyManager code block must exist');

const code = appJs.substring(startIdx, endIdx);
eval(code.replace('const FieldFrequencyManager = {', 'global.FieldFrequencyManager = {'));

console.log('--- 1. Testing Default Frequency Sorting ---');
const workMethods = [
  '굴착작업', '하역운반작업', '양중작업', '설치조립작업', '해체작업', '중량물취급작업', '고소작업', '밀폐공간작업', '협소공간작업'
];

let sortedWM = FieldFrequencyManager.sortByFrequency('workMethod', workMethods);
console.log('Default Sorted workMethods:', sortedWM);
assert.strictEqual(sortedWM[0], '양중작업', '양중작업 should be 1st by default');
assert.strictEqual(sortedWM[1], '고소작업', '고소작업 should be 2nd by default');
assert.strictEqual(sortedWM[2], '설치조립작업', '설치조립작업 should be 3rd by default');

console.log('--- 2. Testing Seeding from Loaded Records ---');
const dummyRecords = [
  { workMethod: '굴착작업', workGroup: '토공사', type: '무너짐(붕괴, 도괴)/깔림', location: '외부' },
  { workMethod: '굴착작업', workGroup: '토공사', type: '무너짐(붕괴, 도괴)/깔림', location: '외부' },
  { workMethod: '굴착작업', workGroup: '토공사', type: '무너짐(붕괴, 도괴)/깔림', location: '외부' },
  { workMethod: '굴착작업', workGroup: '토공사', type: '무너짐(붕괴, 도괴)/깔림', location: '외부' },
  { workMethod: '굴착작업', workGroup: '토공사', type: '무너짐(붕괴, 도괴)/깔림', location: '외부' }
];

FieldFrequencyManager.seedFromRecords(dummyRecords);
sortedWM = FieldFrequencyManager.sortByFrequency('workMethod', workMethods);
console.log('After seeding 5 굴착작업 records:', sortedWM);
assert.strictEqual(sortedWM[0], '굴착작업', '굴착작업 should jump to 1st after 5 records');

console.log('--- 3. Testing User Manual Record / Click Usage ---');
// User clicks 협소공간작업 5 times
for (let i = 0; i < 5; i++) {
  FieldFrequencyManager.recordUsage('workMethod', '협소공간작업');
}
sortedWM = FieldFrequencyManager.sortByFrequency('workMethod', workMethods);
console.log('After user repeatedly selecting 협소공간작업:', sortedWM);
assert.strictEqual(sortedWM[0], '협소공간작업', '협소공간작업 should jump to 1st after user selections');

console.log('--- 4. Testing Idempotency of seedFromRecords ---');
FieldFrequencyManager.seedFromRecords(dummyRecords);
const sortedWMAgain = FieldFrequencyManager.sortByFrequency('workMethod', workMethods);
assert.deepStrictEqual(sortedWM, sortedWMAgain, 'seedFromRecords must be idempotent');

console.log('--- 5. Testing Other Categories (workGroup, type, location, agentMajor) ---');
const workGroups = ['토공사', '가설공사', '철근콘크리트공사', '마감공사', '설비·전기공사'];
const sortedWG = FieldFrequencyManager.sortByFrequency('workGroup', workGroups);
console.log('Sorted workGroups:', sortedWG);
assert.strictEqual(sortedWG[0], '토공사', '토공사 seeded from 5 records should be 1st');

const types = ['기타', '떨어짐(추락, 사람)', '미끄러짐/접질림', '감전'];
const sortedTypes = FieldFrequencyManager.sortByFrequency('type', types);
console.log('Sorted types:', sortedTypes);
assert.strictEqual(sortedTypes[0], '떨어짐(추락, 사람)', '떨어짐 should be 1st by frequency');

const agentMajors = ['기타시설', '가시설', '작업발판', 'PPE'];
const sortedAgents = FieldFrequencyManager.sortByFrequency('agentMajor', agentMajors);
console.log('Sorted agentMajor:', sortedAgents);
assert.strictEqual(sortedAgents[0], '가시설', '가시설 should be 1st by frequency');

console.log('✅ ALL CATEGORY TESTS PASSED SUCCESSFULLY!');
