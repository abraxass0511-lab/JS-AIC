const fs = require('fs');
global.window = {};
global.Blob = class Blob {};
global.URL = { createObjectURL: () => '', revokeObjectURL: () => '' };
const PptxGenJS = require('pptxgenjs');
global.PptxGenJS = PptxGenJS;

const FONT_MALGUN = '맑은 고딕';
const C_BORDER = '7BA0CD';
const C_HEADER_BG = 'DCE6F1';
const C_TITLE_BLUE = '002060';
const C_YELLOW_BG = 'FFE699';
const C_RED = 'C00000';
const C_ORANGE = 'ED7D31';
const C_ACCENT_BLUE = '4472C4';

require('../app/js/ppt-generator.js');
const SafePPT = globalThis.SafePPT;

async function testMatch() {
  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: 'WIDE_16_9', width: 13.333, height: 7.5 });
  pptx.layout = 'WIDE_16_9';

  const userRecord1 = {
    id: 'test-template-match',
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
    content: '구획된 바닥 안전통로에 거푸집 자재를 방치함',
    interviewOpinion: '통로 구획 표시는 되어 있었으나 후속 반입 자재 임시 적재 공간이 부족하여 부득이하게 통로 일부에 거푸집을 적재하게 되었음.',
    proposalType: '시스템 개선',
    proposalSub: '(모니터링강화)',
    proposalContent: '자재 적치 구획선을 재정비하고 통로 내 자재 방치 즉시 이동 조치 및 일일 순회 패트롤 시 통로 확보 여부를 중점 확인해야 함.',
    countermeasureContent: '안전통로 내 적치된 거푸집 즉시 외부 야적장으로 반출 완료 및 작업팀 전원 통로 확보 교육 실시.',
    pmVerdictType: '시스템 개선',
    pmVerdictSub: '(모니터링강화)'
  };

  const dummyPhoto1 = 'image/jpeg;base64,' + fs.readFileSync('app/samples/horizontal_photo2.jpg').toString('base64');

  await SafePPT.addInspectionSheetSlide(pptx, userRecord1, {
    loadPhotoBase64: async (p, r, idx) => idx === 0 ? dummyPhoto1 : ''
  });

  await pptx.writeFile({ fileName: 'tools/test_template_output.pptx' });
  console.log('Successfully written tools/test_template_output.pptx');
}

testMatch().catch(console.error);
