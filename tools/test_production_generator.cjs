require('../app/js/ppt-generator.js');
const SafePPT = globalThis.SafePPT;
const PptxGenJS = require('pptxgenjs');

async function run() {
  const sampleRecord = {
    severity: '중부적합',
    type: '떨어짐(추락, 사람)',
    mgmtCauses: ['계획 미수립', '불안전 상태'],
    subcontractor: 'D사',
    workGroup: '조적',
    location: '105동 지하2층',
    inspector: '점검이',
    inspectRound: '1차',
    content: '말비계 설치범위가 모서리 구간에서 그쳐, 단부 추락위험',
    interviewOpinion: '현장 시공 여건 상 위험장소 접근 사유로 기준이 미준수되었으며, 관리감독자의 사전 작업지휘가 미흡한 상태에서 작업이 진행됨.',
    auditProposal: '설치조립작업 시 발생 가능한 사고를 방지하기 위해 작업팀 대상 안전작업절차 교육을 의무화하고 현장 관리감독자의 일일 이행 모니터링을 대폭 강화할 필요가 있음.',
    photos: ['dummy']
  };

  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: 'WIDE_16_9', width: 13.333, height: 7.5 });
  pptx.layout = 'WIDE_16_9';

  const dummyBase64 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkWPjfDwAEeQHzk4P5EAAAAABJRU5ErkJggg==";

  await SafePPT.addInspectionSheetSlide(pptx, sampleRecord, {
    loadPhotoBase64: async () => dummyBase64
  });

  await pptx.writeFile({ fileName: 'tools/prod_generated_sheet.pptx' });
  console.log('Successfully generated tools/prod_generated_sheet.pptx');
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
