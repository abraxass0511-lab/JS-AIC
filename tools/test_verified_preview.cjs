const fs = require('fs');
require('../app/js/ppt-generator.js');
const SafePPT = globalThis.SafePPT;

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
  photos: []
};

const photoData = 'data:image/jpeg;base64,' + fs.readFileSync('app/samples/horizontal_photo1.jpg').toString('base64');

const htmlContent = SafePPT.renderInspectionSheetHTML(sampleRecord, {
  photo1Url: photoData
});

const page = `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <title>실시간 미리보기 검증</title>
  <style>
    body {
      background: #1e293b;
      margin: 0;
      padding: 24px;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      box-sizing: border-box;
      font-family: 'Malgun Gothic', '맑은 고딕', sans-serif;
    }
    .wrapper {
      width: 100%;
      max-width: 1040px;
    }
  </style>
</head>
<body>
  <div class="wrapper">
    ${htmlContent}
  </div>
</body>
</html>`;

fs.writeFileSync('tools/verified_preview.html', page, 'utf8');
console.log('Successfully written tools/verified_preview.html');
