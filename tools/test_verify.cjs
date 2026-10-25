const fs = require('fs');
global.window = {};
global.Blob = class Blob {};
global.URL = { createObjectURL: () => '', revokeObjectURL: () => '' };
const PptxGenJS = require('pptxgenjs');
global.PptxGenJS = PptxGenJS;

require('../app/js/ppt-generator.js');
const SafePPT = globalThis.SafePPT;

const sampleRecord2 = {
  id: 'test-horizontal-lift',
  type: '낙하',
  severity: '중부적합',
  isMajor: true,
  law: '전사 안전보건지침[줄걸이작업] 7.1.1 일반사항 - 화물은 유도로프를 통해 유도하고 손으로 밀거나 당기는 행위를 금지하며 화물의 양중높이에 따라 적정한 길이를 가진 유도로프를 사용해야 한다.',
  causes: ['불안전 행동', '계획 미이행'],
  subcontractor: '원영건업(주)',
  workGroup: '거푸집동바리공사',
  location: '108동',
  inspector: '신우석 프로',
  inspectRound: "'26년 下 3차",
  content: '보 거푸집 양중작업 시 양중화물의 수평이 맞지 않음 ↔ 지상에서 보 거푸집 양중로프 체결 시 로프간격을 맞추지 않음',
  interviewOpinion: '거푸집 제작장에서 양중로프를 걸 때 같은 간격으로 맞추지 못했다. 양중로프를 걸 수 있는 위치가 어느 정도 적당하다고 생각되는 곳에 로프를 걸었다.',
  proposalType: '시스템 개선',
  proposalSub: '(이행강화안 수립)',
  proposalContent: '양중작업 시 양중화물의 수평양중은 낙하사고를 방지하는 중요한 안전작업방법이다. 지상에서 양중로프를 체결할 때 화물의 여장간격이 동일하도록 작업팀 교육 및 이행강화 노력이 필요함. 또한 원인이 되는 자재 적재방법 고려 필요.',
  countermeasureContent: '- 신호수 대상으로 부적합사항 공유 후 양중 작업 기준 준수토록 교육실시\n- 동일사항 적발 시 신호수 자격 박탈',
  pmVerdictType: '교육/코칭',
  pmVerdictSub: '(협력사 교육)'
};

const normalized = SafePPT.normalizeJangpyoData(sampleRecord2);
console.log('Normalized photo1Title:', normalized.photo1Title);
console.log('Normalized photo2Title:', normalized.photo2Title);
console.log('Normalized hasGuideline:', normalized.hasGuideline);
console.log('Normalized pmVerdictType:', normalized.pmVerdictType);
console.log('Normalized pmVerdictSub:', normalized.pmVerdictSub);

const html = SafePPT.renderInspectionSheetHTML(sampleRecord2);
console.log('HTML length:', html.length);
console.log('HTML has guideline box:', html.includes('줄걸이 작업자의 책임'));
console.log('HTML photo1 height 346px:', html.includes('height: 346px'));

const pptx = new PptxGenJS();
pptx.defineLayout({ name: 'WIDE_16_9', width: 13.333, height: 7.5 });
pptx.layout = 'WIDE_16_9';

SafePPT.addInspectionSheetSlide(pptx, sampleRecord2).then(() => {
  return pptx.writeFile({ fileName: 'tools/test_out_horizontal.pptx' });
}).then(() => {
  console.log('Successfully generated test_out_horizontal.pptx');
}).catch(err => {
  console.error('PPT generation error:', err);
});
