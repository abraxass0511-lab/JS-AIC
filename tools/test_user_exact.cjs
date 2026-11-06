const fs = require('fs');
global.window = {};
global.Blob = class Blob {
  constructor(parts) {
    this.buffer = Buffer.concat(parts.map(p => Buffer.isBuffer(p) ? p : Buffer.from(p)));
  }
};
global.URL = { createObjectURL: () => '', revokeObjectURL: () => '' };
const PptxGenJS = require('pptxgenjs');
global.PptxGenJS = PptxGenJS;

require('../app/js/ppt-generator.js');
const SafePPT = globalThis.SafePPT;

async function testUserExactCase() {
  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: 'WIDE_16_9', width: 13.333, height: 7.5 });
  pptx.layout = 'WIDE_16_9';

  const userExactRecord = {
    type: '떨어짐(추락, 사람)',
    severity: '중부적합',
    isMajor: true,
    law: '산업안전보건기준에 관한 규칙 제56조(작업발판의 구조), 제13조(안전난간의 구조 및 요건)',
    lawBody: '작업발판은 틈새가 없도록 전면 설치하고, 발판 단부에는 상부난간대 및 중간난간대를 견고히 설치하여 근로자 추락을 방지해야 한다.',
    causes: ['계획 미수립', '불안전 상태'],
    mgmtCauses: ['계획 미수립', '불안전 상태'],
    subcontractor: 'D사',
    workGroup: '조적',
    location: '105동 지하2층',
    inspector: '점검이',
    inspectRound: '1차',
    content: '말비계 설치범위가 모서리 구간에서 그쳐, 단부 추락위험'
  };

  await SafePPT.addInspectionSheetSlide(pptx, userExactRecord);
  await pptx.writeFile({ fileName: 'tools/user_exact_case.pptx' });
  console.log('Saved tools/user_exact_case.pptx');
}

testUserExactCase().catch(console.error);
