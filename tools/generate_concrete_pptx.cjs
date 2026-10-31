const fs = require('fs');
const path = require('path');
const pptxgen = require('pptxgenjs');

globalThis.window = {};

const code = fs.readFileSync(path.join(__dirname, '../app/js/ppt-generator.js'), 'utf8');
const runFn = new Function('window', 'globalThis', 'module', 'exports', code);
const mockModule = { exports: {} };
runFn(globalThis.window, globalThis, mockModule, mockModule.exports);

const SafePPT = mockModule.exports.addInspectionSheetSlide ? mockModule.exports : (globalThis.SafePPT || globalThis.window.SafePPT);

async function main() {
  const pptx = new pptxgen();
  pptx.layout = 'LAYOUT_16x9';

  // 1. 슬라이드 1: 이미지 4번 실물 점검장표 (양중 손잡음 + 유도로프 미사용)
  const rec4 = {
    severity: '중부적합',
    type: '충돌/협착',
    subcontractor: '원영건업(주)',
    workGroup: '거푸집동바리공사',
    location: '108동',
    inspector: '신우석 프로',
    inspectRound: "'26년 下 3차',",
    content: '양중화물 유도로프 미사용 (직접 손으로 양중화물을 잡고 작업함)',
    hasGuideline: true,
    guidelineTitle: '줄걸이 작업자의 책임',
    guidelineBody: '1) 양중 시작 전 양중물로부터 5m 이상 안전거리를 확보해야 하고 양중물 하부에서 대기를 금지하며\n   양중물이 지면으로부터 1.5m 이내에 위치하였을 경우, 접근해야 한다.',
    interviewOpinion: '양중작업 시 유도로프의 사용기준은 1줄을 설치하는 대로 유도로프를 설치하였으나, 화물을 다루기 어려워 손으로 직접 잡고 당기었다.',
    proposalContent: '양중작업 시 유도로프를 설치, 사용하여 화물을 직접 잡지 않도록 작업팀 교육 및 관리자의 강한 요구가 필요하다. 또한 유도로프는 화물의 양쪽으로 2줄을 설치하는 것이 필요함.',
    countermeasureContent: '자재 양중 작업 시 화물을 직접 잡지 않도록 작업팀 교육 실시, 유도로프 추가 설치 등에 대한 기준 검토/수립'
  };

  // 1x1 투명 픽셀 샘플 이미지
  const samplePhoto = 'image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkWPjfDwAEeQHzjXz70wAAAABJRU5ErkJggg==';

  await SafePPT.addInspectionSheetSlide(pptx, rec4, {
    loadPhotoBase64: async () => samplePhoto,
    includePostActions: true
  });

  // 2. 슬라이드 2: 이미지 1번 (통로 바닥 가설전선 거치 및 정리 미실시)
  const rec1 = {
    severity: '경부적합',
    type: '전도',
    subcontractor: '원영건업(주)',
    workGroup: '골조공사',
    location: '지하1층',
    inspector: '김안전 프로',
    inspectRound: "'26년 下 3차",
    content: '통로 바닥에 전선이 정리되지 않아 통행자가 걸려 넘어질 위험'
  };

  await SafePPT.addInspectionSheetSlide(pptx, rec1, {
    loadPhotoBase64: async () => samplePhoto
  });

  const outPptx = path.join(__dirname, 'concrete_defect_test.pptx');
  await pptx.writeFile({ fileName: outPptx });
  console.log('Successfully generated:', outPptx);
}

main().catch(err => {
  console.error('Error generating PPTX:', err);
  process.exit(1);
});
