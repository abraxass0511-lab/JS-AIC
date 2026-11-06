const fs = require('fs');

function calcSingleLineFontSize(text, boxWidthInches, defaultPt = 14, minPt = 9) {
  if (!text) return defaultPt;
  let estimatedLength = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code >= 0xac00 && code <= 0xd7a3) estimatedLength += 1.0;
    else if (code >= 0x3130 && code <= 0x318f) estimatedLength += 0.9;
    else if (code === 32) estimatedLength += 0.35;
    else if (code >= 65 && code <= 90) estimatedLength += 0.7;
    else if (code >= 97 && code <= 122) estimatedLength += 0.55;
    else estimatedLength += 0.5;
  }
  const maxCharsAtDefault = (boxWidthInches * 72) / (defaultPt * 0.92);
  if (estimatedLength <= maxCharsAtDefault) return defaultPt;
  const scaledPt = defaultPt * (maxCharsAtDefault / estimatedLength);
  return Math.max(minPt, Math.round(scaledPt * 10) / 10);
}

function renderExactInspectionSheetHTML(record, options = {}) {
  const { photo1Url = '', photo2Url = '', rulesFromTaxonomy = [] } = options;

  // normalize data
  const data = {
    severity: record.severity || '중부적합',
    typeMain: '떨어짐',
    typeSub: '(추락, 사람)',
    lawTitle: '산업안전보건기준에 관한 규칙 제56조(작업발판의 구조), 제13조(안전난간의 구조 및 요건)',
    lawBody: '작업발판은 틈새가 없도록 전면 설치하고, 발판 단부에는 상부난간대 및 중간난간대를 견고히 설치하여 근로자 추락을 방지해야 한다.',
    isUnplanned: true,
    isUnexecuted: false,
    isAction: false,
    isCondition: true,
    subcontractor: record.subcontractor || 'D사',
    workGroup: record.workGroup || '조적',
    location: record.location || '105동 지하2층',
    inspector: record.inspector || '점검이',
    inspectRound: record.inspectRound || '1차',
    mainContent: record.content || '말비계 설치범위가 모서리 구간에서 그쳐, 단부 추락위험',
    isHoldPoint: false,
    interviewOpinion: record.interviewOpinion || '현장 시공 여건 상 위험장소 접근 사유로 기준이 미준수되었으며, 관리감독자의 사전 작업지휘가 미흡한 상태에서 작업이 진행됨.',
    proposalType: '시스템 개선',
    proposalSub: '(이행강화안 수립)',
    proposalContent: record.auditProposal || '설치조립작업 시 발생 가능한 사고를 방지하기 위해 작업팀 대상 안전작업절차 교육을 의무화하고 현장 관리감독자의 일일 이행 모니터링을 대폭 강화할 필요가 있음.',
    countermeasureContent: '말비계 작업 전 안전난간대 및 작업발판 설치 완료 상태를 일일 점검하고 전담 안전감시원 배치 의무화',
    pmVerdictType: '시스템 개선',
    pmVerdictSub: '(이행강화안 수립)'
  };

  const pctX = (x) => `${((x / 13.333) * 100).toFixed(4)}%`;
  const pctY = (y) => `${((y / 7.500) * 100).toFixed(4)}%`;
  const pctW = (w) => `${((w / 13.333) * 100).toFixed(4)}%`;
  const pctH = (h) => `${((h / 7.500) * 100).toFixed(4)}%`;
  const pt = (n) => `${(n * 0.104167).toFixed(4)}cqw`;

  const lawTitleFontSize = calcSingleLineFontSize(data.lawTitle, 5.624, 11, 8.5);
  const lawBodyFontSize = data.lawBody.length > 80 ? 11 : (data.lawBody.length > 55 ? 11.5 : 12.5);

  const metaCols = [
    { label: '협력사 : ', val: data.subcontractor, w: 2.386, x: 1.210 },
    { label: '공종명 : ', val: data.workGroup, w: 2.386, x: 3.596 },
    { label: '작업장소 : ', val: data.location, w: 2.386, x: 5.982 },
    { label: '점검자 : ', val: data.inspector, w: 2.386, x: 8.368 },
    { label: '점검차수 : ', val: data.inspectRound, w: 2.386, x: 10.754 }
  ];

  const mainSz = calcSingleLineFontSize(`부적합 내용 : ${data.mainContent}`, 11.930, 14, 9.5);

  let intSz = 12.5;
  let intLineSpacing = 1.28;
  if (data.interviewOpinion.length > 130) {
    intSz = 10.5;
    intLineSpacing = 1.15;
  } else if (data.interviewOpinion.length > 80) {
    intSz = 11.5;
    intLineSpacing = 1.20;
  }

  let propSz = 12.5;
  let propLineSpacing = 1.28;
  if (data.proposalContent.length > 70) {
    propSz = 10;
    propLineSpacing = 1.18;
  } else if (data.proposalContent.length > 45) {
    propSz = 11.5;
    propLineSpacing = 1.22;
  }

  let counterSz = 12.5;
  let counterLineSpacing = 1.28;
  if (data.countermeasureContent.length > 70) {
    counterSz = 10;
    counterLineSpacing = 1.18;
  } else if (data.countermeasureContent.length > 45) {
    counterSz = 11.5;
    counterLineSpacing = 1.22;
  }

  const hasPhoto2 = Boolean(photo2Url);
  const photoStartY = 2.425;
  const photoBodyHeight = 4.810;

  return `
    <div id="jangpyoSlidePreview" style="
      width: 100%;
      aspect-ratio: 16 / 9;
      position: relative;
      background: #ffffff;
      border: 1.5px solid #000000;
      box-sizing: border-box;
      overflow: hidden;
      container-type: inline-size;
      font-family: 'Malgun Gothic', '맑은 고딕', sans-serif;
      color: #000000;
      user-select: none;
    ">
      <!-- 1. 시설물/법규 -->
      <div style="position: absolute; left: ${pctX(0.120)}; top: ${pctY(0.163)}; width: ${pctW(1.791)}; height: ${pctH(0.914)}; background: #bdd7ee; border: 1px solid #000000; display: flex; align-items: center; justify-content: center; font-size: ${pt(18)}; font-weight: 800; color: #000000; box-sizing: border-box;">
        시설물/법규
      </div>

      <!-- 2. 사고유형 & 등급 (황색 테두리) -->
      <div style="position: absolute; left: ${pctX(1.967)}; top: ${pctY(0.163)}; width: ${pctW(1.568)}; height: ${pctH(0.914)}; background: #ffffff; border: 3px solid #ffc000; display: flex; flex-direction: column; align-items: center; justify-content: center; box-sizing: border-box; padding-top: 0.15cqw;">
        <div style="font-size: ${pt(18)}; font-weight: 800; color: #000000; line-height: 1.15; text-align: center;">${data.typeMain}</div>
        ${data.typeSub ? `<div style="font-size: ${pt(11)}; font-weight: 700; color: #333333; line-height: 1.1; text-align: center; margin-top: 0.05cqw;">${data.typeSub}</div>` : ''}
        <div style="font-size: ${pt(18)}; font-weight: 800; color: #000000; line-height: 1.15; text-align: center; margin-top: 0.05cqw;">[${data.severity}]</div>
      </div>

      <!-- 3. 관련기준 라벨 -->
      <div style="position: absolute; left: ${pctX(3.592)}; top: ${pctY(0.163)}; width: ${pctW(0.684)}; height: ${pctH(0.914)}; background: #ffffff; border: 1px solid #000000; display: flex; align-items: center; justify-content: center; font-size: ${pt(14)}; font-weight: 800; color: #000000; text-align: center; line-height: 1.18; box-sizing: border-box;">
        관련<br>기준
      </div>

      <!-- 4. 관련기준 내용 외곽 사각형 -->
      <div style="position: absolute; left: ${pctX(4.276)}; top: ${pctY(0.163)}; width: ${pctW(5.832)}; height: ${pctH(0.914)}; background: #ffffff; border: 1px solid #000000; box-sizing: border-box;"></div>

      <!-- 4-1. 관련기준 제목 (좌측선 x = 4.380 일치) -->
      <div style="position: absolute; left: ${pctX(4.380)}; top: ${pctY(0.175)}; width: ${pctW(5.624)}; height: ${pctH(0.300)}; display: flex; align-items: center; font-size: ${pt(lawTitleFontSize)}; font-weight: 800; color: #000000; white-space: nowrap; box-sizing: border-box;">
        ${data.lawTitle}
      </div>

      <!-- 4-2. 관련기준 본문 (파란색 음영 박스 x = 4.380) -->
      <div style="position: absolute; left: ${pctX(4.380)}; top: ${pctY(0.495)}; width: ${pctW(5.624)}; height: ${pctH(0.550)}; background: #deebf7; border-radius: 2px; padding: 0.2cqw 0.5cqw; box-sizing: border-box; display: flex; align-items: center;">
        <div style="font-size: ${pt(lawBodyFontSize)}; color: #111111; line-height: 1.25; word-break: keep-all;">
          ${data.lawBody}
        </div>
      </div>

      <!-- 5. 4대 발생요인 (4분면) -->
      <div style="position: absolute; left: ${pctX(10.165)}; top: ${pctY(0.163)}; width: ${pctW(2.975)}; height: ${pctH(0.914)}; background: #ffffff; border: 1px solid #000000; box-sizing: border-box; display: grid; grid-template-columns: 1fr 1fr; grid-template-rows: 1fr 1fr;">
        <div style="border-right: 0.5px solid #000000; border-bottom: 0.5px solid #000000; display: flex; align-items: center; justify-content: center; font-size: ${pt(14)}; font-weight: 800;">
          <span style="font-size: ${pt(16)}; margin-right: 0.25cqw;">${data.isUnplanned ? '☑' : '☐'}</span> 계획 미수립
        </div>
        <div style="border-bottom: 0.5px solid #000000; display: flex; align-items: center; justify-content: center; font-size: ${pt(14)}; font-weight: 800;">
          <span style="font-size: ${pt(16)}; margin-right: 0.25cqw;">${data.isUnexecuted ? '☑' : '☐'}</span> 계획 미이행
        </div>
        <div style="border-right: 0.5px solid #000000; display: flex; align-items: center; justify-content: center; font-size: ${pt(14)}; font-weight: 800;">
          <span style="font-size: ${pt(16)}; margin-right: 0.25cqw;">${data.isAction ? '☑' : '☐'}</span> 불안전 행동
        </div>
        <div style="display: flex; align-items: center; justify-content: center; font-size: ${pt(14)}; font-weight: 800;">
          <span style="font-size: ${pt(16)}; margin-right: 0.25cqw;">${data.isCondition ? '☑' : '☐'}</span> 불안전 상태
        </div>
      </div>

      <!-- 6. 대형 통합 본문 컨테이너 -->
      <div style="position: absolute; left: ${pctX(0.120)}; top: ${pctY(1.125)}; width: ${pctW(13.020)}; height: ${pctH(6.168)}; background: #ffffff; border: 1px solid #000000; box-sizing: border-box;"></div>

      <!-- 6-1. 부적합 개요 라벨 -->
      <div style="position: absolute; left: ${pctX(0.120)}; top: ${pctY(1.125)}; width: ${pctW(1.090)}; height: ${pctH(0.812)}; background: #ffd966; border: 1px solid #000000; display: flex; align-items: center; justify-content: center; font-size: ${pt(18)}; font-weight: 800; color: #000000; text-align: center; line-height: 1.15; box-sizing: border-box;">
        부적합<br>개&nbsp;&nbsp;&nbsp;요
      </div>

      <!-- 6-2. 메타 정보 5개 독립 셀 -->
      ${metaCols.map(col => {
        const sz = calcSingleLineFontSize(`${col.label}${col.val}`, col.w, 14, 9.5);
        return `
          <div style="position: absolute; left: ${pctX(col.x)}; top: ${pctY(1.125)}; width: ${pctW(col.w)}; height: ${pctH(0.406)}; background: #ffffff; border: 1px solid #000000; display: flex; align-items: center; padding: 0 0.4cqw; box-sizing: border-box; white-space: nowrap;">
            <strong style="color: #4472c4; font-size: ${pt(sz)}; margin-right: 0.2cqw;">${col.label}</strong>
            <span style="font-weight: 800; color: #000000; font-size: ${pt(sz)};">${col.val}</span>
          </div>
        `;
      }).join('')}

      <!-- 6-3. 부적합 내용 전체 너비 사각형 -->
      <div style="position: absolute; left: ${pctX(1.210)}; top: ${pctY(1.531)}; width: ${pctW(11.930)}; height: ${pctH(0.406)}; background: #ffffff; border: 1px solid #000000; display: flex; align-items: center; padding: 0 0.5cqw; box-sizing: border-box; white-space: nowrap;">
        <strong style="color: #4472c4; font-size: ${pt(mainSz)};">부적합 내용 :&nbsp;</strong>
        <span style="font-weight: 800; color: #000000; font-size: ${pt(mainSz)};">${data.mainContent}</span>
      </div>

      <!-- 6-4. 가로 분할선 (부적합 개요 아래) -->
      <div style="position: absolute; left: ${pctX(0.120)}; top: ${pctY(1.937)}; width: ${pctW(13.020)}; height: 0; border-top: 1px solid #000000;"></div>

      <!-- 6-5. 세로 분할선 (좌측 사진 vs 우측 원인/대책) -->
      <div style="position: absolute; left: ${pctX(8.395)}; top: ${pctY(1.982)}; width: 0; height: ${pctH(5.311)}; border-left: 1px solid #000000;"></div>

      <!-- 6-6. Hold Point 위반 박스 -->
      <div style="position: absolute; left: ${pctX(5.975)}; top: ${pctY(1.982)}; width: ${pctW(2.363)}; height: ${pctH(0.406)}; background: #ffffff; border: 1px solid #000000; display: flex; align-items: center; justify-content: center; box-sizing: border-box; white-space: nowrap;">
        <span style="font-size: ${pt(18)}; font-weight: 800; margin-right: 0.3cqw;">${data.isHoldPoint ? '☑' : '☐'}</span>
        <span style="font-size: ${pt(12)}; font-weight: 800;">Hold Point 위반 (N/A)</span>
      </div>

      <!-- 6-7. 사진 영역 -->
      ${hasPhoto2 ? `
        <div style="position: absolute; left: ${pctX(0.130)}; top: ${pctY(photoStartY)}; width: ${pctW(4.080)}; height: ${pctH(photoBodyHeight)}; box-sizing: border-box;">
          ${photo1Url ? `<img src="${photo1Url}" style="width: 100%; height: 100%; object-fit: contain; display: block;">` : `<div style="width: 100%; height: 100%; background: #f8fafc; border: 1px solid #000000; display: flex; align-items: center; justify-content: center; color: #64748b; font-size: ${pt(14)};">📸 사진 1</div>`}
        </div>
        <div style="position: absolute; left: ${pctX(4.290)}; top: ${pctY(photoStartY)}; width: ${pctW(4.080)}; height: ${pctH(photoBodyHeight)}; box-sizing: border-box;">
          ${photo2Url ? `<img src="${photo2Url}" style="width: 100%; height: 100%; object-fit: contain; display: block;">` : `<div style="width: 100%; height: 100%; background: #f8fafc; border: 1px solid #000000; display: flex; align-items: center; justify-content: center; color: #64748b; font-size: ${pt(14)};">📸 사진 2</div>`}
        </div>
      ` : `
        <div style="position: absolute; left: ${pctX(0.130)}; top: ${pctY(photoStartY)}; width: ${pctW(8.240)}; height: ${pctH(photoBodyHeight)}; box-sizing: border-box;">
          ${photo1Url ? `<img src="${photo1Url}" style="width: 100%; height: 100%; object-fit: contain; display: block;">` : `<div style="width: 100%; height: 100%; background: #f8fafc; border: 1px solid #000000; display: flex; align-items: center; justify-content: center; color: #64748b; font-size: ${pt(14)};">📸 현장 사진</div>`}
        </div>
      `}

      <!-- 6-8. 발생원인 (인터뷰 결과) 헤더 -->
      <div style="position: absolute; left: ${pctX(8.395)}; top: ${pctY(1.982)}; width: ${pctW(4.711)}; height: ${pctH(0.406)}; background: #ffd966; border: 1px solid #000000; display: flex; align-items: center; justify-content: center; font-size: ${pt(14)}; font-weight: 800; color: #000000; box-sizing: border-box;">
        발생원인 (인터뷰 결과)
      </div>

      <!-- 6-9. 발생원인 본문 & 점검단 제안 Box -->
      <div style="position: absolute; left: ${pctX(8.395)}; top: ${pctY(2.425)}; width: ${pctW(4.711)}; height: ${pctH(3.142)}; background: #ffffff; border: 1px solid #000000; box-sizing: border-box;">
        <!-- 의견 서브박스 -->
        <div style="position: absolute; left: 0; top: 0; width: 100%; height: ${((2.042 / 3.142) * 100).toFixed(4)}%; padding: 0.4cqw 0.7cqw; box-sizing: border-box;">
          <div style="font-size: ${pt(14)}; font-weight: 800; color: #000000; margin-bottom: 0.25cqw;">[ 의견 : 시공관리자 및 근로자 ]</div>
          <div style="font-size: ${pt(intSz)}; line-height: ${intLineSpacing}; color: #111111; word-break: keep-all;">${data.interviewOpinion}</div>
        </div>

        <!-- 가로선: 의견과 점검단 제안 사이 -->
        <div style="position: absolute; left: 0; top: ${((2.042 / 3.142) * 100).toFixed(4)}%; width: 100%; height: 0; border-top: 1px solid #000000;"></div>

        <!-- 점검단 제안 서브영역 -->
        <div style="position: absolute; left: 0; top: ${((2.042 / 3.142) * 100).toFixed(4)}%; width: 100%; height: ${((1.100 / 3.142) * 100).toFixed(4)}%;">
          <!-- 세로 구분선 -->
          <div style="position: absolute; left: ${((1.434 / 4.711) * 100).toFixed(4)}%; top: 0; width: 0; height: 100%; border-left: 1px solid #000000;"></div>

          <!-- 좌측 상단 [점검단 제안] -->
          <div style="position: absolute; left: 0; top: 0; width: ${((1.434 / 4.711) * 100).toFixed(4)}%; height: ${((0.417 / 1.100) * 100).toFixed(4)}%; border-bottom: 1px solid #000000; display: flex; align-items: center; justify-content: center; font-size: ${pt(14)}; font-weight: 800; box-sizing: border-box;">
            [점검단 제안]
          </div>

          <!-- 좌측 하단 시스템 개선 -->
          <div style="position: absolute; left: 0; top: ${((0.417 / 1.100) * 100).toFixed(4)}%; width: ${((1.434 / 4.711) * 100).toFixed(4)}%; height: ${((0.683 / 1.100) * 100).toFixed(4)}%; display: flex; flex-direction: column; align-items: center; justify-content: center; box-sizing: border-box;">
            <div style="font-size: ${pt(14)}; font-weight: 800; color: #4472c4;">${data.proposalType}</div>
            <div style="font-size: ${pt(11)}; color: #595959; margin-top: 0.1cqw;">${data.proposalSub}</div>
          </div>

          <!-- 우측 점검단 제안 본문 -->
          <div style="position: absolute; left: ${((1.434 / 4.711) * 100).toFixed(4)}%; top: 0; width: ${((3.277 / 4.711) * 100).toFixed(4)}%; height: 100%; padding: 0.3cqw 0.6cqw; box-sizing: border-box;">
            <div style="font-size: ${pt(propSz)}; line-height: ${propLineSpacing}; color: #111111; word-break: keep-all;">${data.proposalContent}</div>
          </div>
        </div>
      </div>

      <!-- 6-10. 개선대책 (현장 협의 결과) 헤더 -->
      <div style="position: absolute; left: ${pctX(8.395)}; top: ${pctY(5.660)}; width: ${pctW(4.711)}; height: ${pctH(0.406)}; background: #ffd966; border: 1px solid #000000; display: flex; align-items: center; justify-content: center; font-size: ${pt(14)}; font-weight: 800; color: #000000; box-sizing: border-box;">
        개선대책 (현장 협의 결과)
      </div>

      <!-- 6-11. 개선대책 본문 & PM 판정결과 Box -->
      <div style="position: absolute; left: ${pctX(8.395)}; top: ${pctY(6.102)}; width: ${pctW(4.711)}; height: ${pctH(1.134)}; background: #ffffff; border: 1px solid #000000; box-sizing: border-box;">
        <!-- 세로선: 개선대책 본문 vs PM 판정결과 -->
        <div style="position: absolute; left: ${((3.204 / 4.711) * 100).toFixed(4)}%; top: 0; width: 0; height: 100%; border-left: 1px solid #000000;"></div>

        <!-- 좌측 개선대책 본문 -->
        <div style="position: absolute; left: 0; top: 0; width: ${((3.204 / 4.711) * 100).toFixed(4)}%; height: 100%; padding: 0.4cqw 0.7cqw; box-sizing: border-box;">
          <div style="font-size: ${pt(counterSz)}; font-weight: 700; line-height: ${counterLineSpacing}; color: #000000; word-break: keep-all;">${data.countermeasureContent}</div>
        </div>

        <!-- 우측 상단 [PM 판정결과] -->
        <div style="position: absolute; left: ${((3.204 / 4.711) * 100).toFixed(4)}%; top: 0; width: ${((1.507 / 4.711) * 100).toFixed(4)}%; height: ${((0.377 / 1.134) * 100).toFixed(4)}%; border-bottom: 1px solid #000000; display: flex; align-items: center; justify-content: center; font-size: ${pt(13)}; font-weight: 800; box-sizing: border-box;">
          [PM 판정결과]
        </div>

        <!-- 우측 하단 PM 내용 -->
        <div style="position: absolute; left: ${((3.204 / 4.711) * 100).toFixed(4)}%; top: ${((0.377 / 1.134) * 100).toFixed(4)}%; width: ${((1.507 / 4.711) * 100).toFixed(4)}%; height: ${((0.756 / 1.134) * 100).toFixed(4)}%; display: flex; flex-direction: column; align-items: center; justify-content: center; box-sizing: border-box;">
          <div style="font-size: ${pt(14)}; font-weight: 800; color: #4472c4;">${data.pmVerdictType || ''}</div>
          <div style="font-size: ${pt(11)}; color: #595959; margin-top: 0.1cqw;">${data.pmVerdictSub || ''}</div>
        </div>
      </div>
    </div>
  `;
}

const photoData = 'data:image/jpeg;base64,' + fs.readFileSync('app/samples/horizontal_photo1.jpg').toString('base64');
const previewContent = renderExactInspectionSheetHTML({}, {
  photo1Url: photoData
});

const fullHtml = `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <title>정밀 16:9 슬라이드 프리뷰</title>
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
      max-width: 1080px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.4);
    }
  </style>
</head>
<body>
  <div class="wrapper">
    ${previewContent}
  </div>
</body>
</html>`;

fs.writeFileSync('tools/test_exact_html_preview.html', fullHtml, 'utf8');
console.log('Successfully written tools/test_exact_html_preview.html');
