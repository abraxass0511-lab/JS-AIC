const fs = require('fs');
const path = require('path');

// Global mock for browser objects
globalThis.window = {};

// Load ppt-generator.js
const code = fs.readFileSync(path.join(__dirname, '../app/js/ppt-generator.js'), 'utf8');
const runFn = new Function('window', 'globalThis', 'module', 'exports', code);
const mockModule = { exports: {} };
runFn(globalThis.window, globalThis, mockModule, mockModule.exports);

const SafePPT = mockModule.exports.normalizeJangpyoData ? mockModule.exports : (globalThis.SafePPT || globalThis.window.SafePPT);

console.log('=== SafePPT Direct Defect Banner Tests ===');

const testCases = [
  {
    name: '이미지 1: 통로 바닥 전선 방치 (이전 버그: 표준 안전작업절차... ❌)',
    record: {
      content: '통로 바닥에 전선이 정리되지 않아 통행자가 걸려 넘어질 위험',
      action: '해당없음'
    },
    forbidden: ['표준 안전작업절차 및 안전수칙 미준수', '작업방법 불량'],
    expectedBanner: '통로 바닥 가설전선 거치 및 정리 미실시'
  },
  {
    name: '이미지 2: 보 상부 미승인 및 다이빙 자세 (이전 버그: 작업방법 불량... ❌)',
    record: {
      content: '1. 보 상부작업을 승인받지 않고 작업 2. 보 상부작업 시 작업자세 불안전(다이빙 자세)',
      action: '작업방법 불량(동작/자세 불량)'
    },
    forbidden: ['작업방법 불량(동작/자세 불량)', '작업방법 불량', '표준 안전작업절차'],
    expectedBanner: '보 상부 승인 미실시 및 불안전 자세 작업',
    expectedPhoto2: '다이빙 자세'
  },
  {
    name: '이미지 3: 안전통로 내 거푸집 방치',
    record: {
      content: '구획된 바닥 안전통로에 거푸집 자재를 방치함',
      action: '불안전 상태'
    },
    forbidden: ['불안전 상태', '표준 안전작업절차'],
    expectedBanner: '구획된 바닥 안전통로 내 거푸집 자재 방치'
  },
  {
    name: '이미지 4: 양중 손으로 직접 잡음 + 유도로프 미사용 (듀얼 배너 실물 점검장표)',
    record: {
      content: '양중화물 유도로프 미사용 (직접 손으로 양중화물을 잡고 작업함)',
      action: '불안전 행동'
    },
    forbidden: ['불안전 행동', '표준 안전작업절차'],
    expectedBanner: '양중작업 시 화물을 직접 손으로 잡음',
    expectedPhoto2: '양중작업 시 유도로프 미사용'
  },
  {
    name: '이미지 5: 보 거푸집 수평양중 미실시 (실물 점검장표)',
    record: {
      content: '보 거푸집 양중작업 시 양중화물의 수평이 맞지 않음 ↔ 지상에서 보 거푸집 양중로프 체결 시 로프간격을 맞추지 않음'
    },
    forbidden: ['표준 안전작업절차', '작업방법 불량'],
    expectedBanner: '양중작업 시 화물의 수평양중 미 실시'
  },
  {
    name: '말비계 모서리 단부 추락방지 미조치 (개구부 덮개 오작동 방지 검증)',
    record: {
      content: '말비계 설치범위가 모서리 구간에 있어서 단부 추락이 위험이 있음'
    },
    forbidden: ['바닥 개구부 덮개', '개구부', '표준 안전작업절차'],
    expectedBanner: '말비계 모서리 구간 단부 추락방지 미조치'
  }
];

let allPassed = true;

testCases.forEach((tc, idx) => {
  const norm = SafePPT.normalizeJangpyoData(tc.record);
  console.log(`\n[테스트 ${idx + 1}] ${tc.name}`);
  console.log(`  - 도출된 photoBanner : "${norm.photoBanner}"`);
  console.log(`  - 도출된 photo2Banner: "${norm.photo2Banner}"`);

  let passed = true;

  tc.forbidden.forEach(bad => {
    if (norm.photoBanner.includes(bad)) {
      console.error(`  ❌ 실패: 금지된 모호한 문구("${bad}")가 포함됨!`);
      passed = false;
      allPassed = false;
    }
  });

  if (tc.expectedBanner && !norm.photoBanner.includes(tc.expectedBanner)) {
    console.error(`  ❌ 실패: 기대 문구("${tc.expectedBanner}") 불일치!`);
    passed = false;
    allPassed = false;
  }

  if (tc.expectedPhoto2 && !norm.photo2Banner.includes(tc.expectedPhoto2)) {
    console.error(`  ❌ 실패: 기대 2번 사진 문구("${tc.expectedPhoto2}") 불일치!`);
    passed = false;
    allPassed = false;
  }

  if (passed) {
    console.log(`  ✅ 통과: 구체적 부적합/미준수 행동이 정확히 반영됨.`);
  }
});

console.log('\n=======================================');
if (allPassed) {
  console.log('🎉 모든 테스트케이스가 100% 성공적으로 통과했습니다!');
} else {
  console.error('⚠️ 일부 테스트케이스가 실패했습니다.');
  process.exit(1);
}
