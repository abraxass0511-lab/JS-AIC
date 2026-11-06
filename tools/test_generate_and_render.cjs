const fs = require('fs');
const { execSync } = require('child_process');
global.window = {};
global.Blob = class Blob {
  constructor(parts) {
    this.buffer = Buffer.concat(parts.map(p => Buffer.isBuffer(p) ? p : Buffer.from(p)));
  }
};
global.URL = { createObjectURL: () => '', revokeObjectURL: () => '' };
const PptxGenJS = require('pptxgenjs');
global.PptxGenJS = PptxGenJS;

// Colors
const C_HEADER_BG = 'DCE6F1';
const C_YELLOW_BG = 'FFE699';
const C_TITLE_BLUE = '002060';
const C_BORDER = '7BA0CD';
const C_ORANGE = 'ED7D31';
const C_RED = 'C00000';
const C_ACCENT_BLUE = '4472C4';
const FONT_MALGUN = '맑은 고딕';

function getSingleLineFontSize(text, widthInch, baseSize = 14, minSize = 9) {
  let units = 0;
  for (let i = 0; i < text.length; i++) {
    units += text.charCodeAt(i) > 127 ? 1.2 : 0.75;
  }
  const avail = widthInch - 0.12;
  let sz = baseSize;
  while (sz > minSize) {
    const est = units * (sz * 0.011);
    if (est <= avail) break;
    sz -= 0.5;
  }
  return sz;
}

async function generateTestSlide() {
  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: 'WIDE_16_9', width: 13.333, height: 7.5 });
  pptx.layout = 'WIDE_16_9';

  const slide = pptx.addSlide();
  slide.background = { color: 'FFFFFF' };

  const data = {
    typeMain: '떨어짐',
    typeSub: '(추락, 사람)',
    severity: '중부적합',
    isMajor: true,
    lawTitle: '산업안전보건기준에 관한 규칙 제56조(작업발판의 구조), 제13조(안전난간의 구조 및 요건)',
    lawBody: '작업발판은 틈새가 없도록 전면 설치하고, 발판 단부에는 상부난간대 및 중간난간대를 견고히 설치하여 근로자 추락을 방지해야 한다.',
    isUnplanned: true,
    isUnexecuted: false,
    isAction: false,
    isCondition: true,
    subcontractor: 'D사',
    workGroup: '조적',
    location: '105동 지하2층',
    inspector: '점검이',
    inspectRound: '1차',
    mainContent: '말비계 설치범위가 모서리 구간에서 그쳐, 단부 추락위험',
    interviewOpinion: '현장 작업진행 과정에서 안전작업수칙에 대한 관리감독 및 작업자 간 소통이 미흡하여 규정 절차가 누락됨.',
    proposalType: '시스템 개선',
    proposalSub: '(이행강화안 수립)',
    proposalContent: '설치조립작업 시 발생 가능한 사고를 방지하기 위해 작업팀 대상 안전작업 절차 교육을 의무화하고 현장 관리감독자의 일일 이행 모니터링을 대폭 강화할 필요가 있음.',
    countermeasureContent: '',
    pmVerdictType: '',
    pmVerdictSub: '',
    isHoldPoint: false
  };

  // 1. Top row
  // 1) 시설물/법규
  slide.addText('시설물/법규', {
    x: 0.120, y: 0.163, w: 1.791, h: 0.914,
    fill: { color: C_HEADER_BG }, line: { color: C_BORDER, width: 1.2 },
    fontFace: FONT_MALGUN, fontSize: 18, bold: true, color: C_TITLE_BLUE,
    align: 'center', valign: 'middle'
  });

  // 2) 사고유형 & 부적합등급
  slide.addText([
    { text: `${data.typeMain}\n`, options: { fontSize: 14, bold: true, color: '000000', fontFace: FONT_MALGUN } },
    { text: `${data.typeSub}\n`, options: { fontSize: 13, bold: true, color: '333333', fontFace: FONT_MALGUN } },
    { text: `[${data.severity}]`, options: { fontSize: 14, bold: true, color: data.isMajor ? C_RED : C_ORANGE, fontFace: FONT_MALGUN } }
  ], {
    x: 1.967, y: 0.163, w: 1.568, h: 0.914,
    fill: { color: 'FFFFFF' }, line: { color: C_ORANGE, width: 2.5 },
    align: 'center', valign: 'middle', lineSpacingMultiple: 0.92, inset: 0.02
  });

  // 3) 관련기준 라벨
  slide.addText('관련\n기준', {
    x: 3.592, y: 0.163, w: 0.684, h: 0.914,
    fill: { color: C_HEADER_BG }, line: { color: C_BORDER, width: 1.2 },
    fontFace: FONT_MALGUN, fontSize: 14, bold: true, color: C_TITLE_BLUE,
    align: 'center', valign: 'middle', lineSpacingMultiple: 1.15
  });

  // 4) 관련기준 내용
  slide.addShape(pptx.ShapeType.rect, {
    x: 4.276, y: 0.163, w: 5.832, h: 0.914,
    fill: { color: 'FFFFFF' }, line: { color: C_BORDER, width: 1.2 }
  });
  const lawTitleFontSize = getSingleLineFontSize(data.lawTitle, 5.832, 14, 9);
  slide.addText(data.lawTitle, {
    x: 4.276, y: 0.163, w: 5.832, h: 0.350,
    fontFace: FONT_MALGUN, fontSize: lawTitleFontSize, bold: true, color: '000000',
    align: 'left', valign: 'middle', wrap: false, inset: 0.06
  });
  slide.addShape(pptx.ShapeType.line, {
    x: 4.276, y: 0.513, w: 5.832, h: 0,
    line: { color: C_BORDER, width: 1.0 }
  });
  slide.addShape(pptx.ShapeType.rect, {
    x: 4.286, y: 0.523, w: 5.812, h: 0.544,
    fill: { color: 'F2F4F7' }, line: { color: 'F2F4F7', width: 0 }
  });
  const lawBodyFontSize = data.lawBody.length > 80 ? 11.5 : (data.lawBody.length > 55 ? 12.5 : 13);
  slide.addText(data.lawBody, {
    x: 4.276, y: 0.513, w: 5.832, h: 0.564,
    fontFace: FONT_MALGUN, fontSize: lawBodyFontSize, color: '111111',
    align: 'left', valign: 'middle', inset: 0.06, lineSpacingMultiple: 1.16
  });

  // 5) 4대 발생요인
  slide.addShape(pptx.ShapeType.rect, {
    x: 10.165, y: 0.163, w: 2.975, h: 0.914,
    fill: { color: 'FFFFFF' }, line: { color: C_BORDER, width: 1.2 }
  });
  slide.addShape(pptx.ShapeType.line, {
    x: 10.165, y: 0.620, w: 2.975, h: 0,
    line: { color: C_BORDER, width: 1.0 }
  });
  slide.addShape(pptx.ShapeType.line, {
    x: 11.652, y: 0.163, w: 0, h: 0.914,
    line: { color: C_BORDER, width: 1.0 }
  });
  slide.addText([
    { text: data.isUnplanned ? '☑ ' : '☐ ', options: { fontSize: 16, bold: true, color: '000000', fontFace: FONT_MALGUN } },
    { text: '계획 미수립', options: { fontSize: 14, bold: true, color: '000000', fontFace: FONT_MALGUN } }
  ], { x: 10.165, y: 0.163, w: 1.487, h: 0.457, align: 'center', valign: 'middle', wrap: false, margin: 0 });
  slide.addText([
    { text: data.isUnexecuted ? '☑ ' : '☐ ', options: { fontSize: 16, bold: true, color: '000000', fontFace: FONT_MALGUN } },
    { text: '계획 미이행', options: { fontSize: 14, bold: true, color: '000000', fontFace: FONT_MALGUN } }
  ], { x: 11.652, y: 0.163, w: 1.487, h: 0.457, align: 'center', valign: 'middle', wrap: false, margin: 0 });
  slide.addText([
    { text: data.isAction ? '☑ ' : '☐ ', options: { fontSize: 16, bold: true, color: '000000', fontFace: FONT_MALGUN } },
    { text: '불안전 행동', options: { fontSize: 14, bold: true, color: '000000', fontFace: FONT_MALGUN } }
  ], { x: 10.165, y: 0.620, w: 1.487, h: 0.457, align: 'center', valign: 'middle', wrap: false, margin: 0 });
  slide.addText([
    { text: data.isCondition ? '☑ ' : '☐ ', options: { fontSize: 16, bold: true, color: '000000', fontFace: FONT_MALGUN } },
    { text: '불안전 상태', options: { fontSize: 14, bold: true, color: '000000', fontFace: FONT_MALGUN } }
  ], { x: 11.652, y: 0.620, w: 1.487, h: 0.457, align: 'center', valign: 'middle', wrap: false, margin: 0 });

  // 2. 부적합 개요
  slide.addText([
    { text: '부 적 합\n', options: { fontSize: 14, bold: true, color: '000000', fontFace: FONT_MALGUN } },
    { text: '개    요', options: { fontSize: 14, bold: true, color: '000000', fontFace: FONT_MALGUN } }
  ], {
    x: 0.120, y: 1.125, w: 1.090, h: 0.811,
    fill: { color: C_YELLOW_BG }, line: { color: C_BORDER, width: 1.2 },
    align: 'center', valign: 'middle', lineSpacingMultiple: 1.15
  });

  // 5개 독립 셀
  // 협력사
  const subSz = getSingleLineFontSize(`협력사 : ${data.subcontractor}`, 2.450, 14, 9.5);
  slide.addText([
    { text: '협력사 : ', options: { bold: true, color: C_ACCENT_BLUE, fontFace: FONT_MALGUN, fontSize: subSz } },
    { text: data.subcontractor, options: { bold: true, color: '000000', fontFace: FONT_MALGUN, fontSize: subSz } }
  ], {
    x: 1.210, y: 1.125, w: 2.450, h: 0.406,
    fill: { color: 'FFFFFF' }, line: { color: C_BORDER, width: 1.0 },
    align: 'left', valign: 'middle', inset: 0.06, wrap: false
  });

  // 공종명
  const workSz = getSingleLineFontSize(`공종명 : ${data.workGroup}`, 2.450, 14, 9.5);
  slide.addText([
    { text: '공종명 : ', options: { bold: true, color: C_ACCENT_BLUE, fontFace: FONT_MALGUN, fontSize: workSz } },
    { text: data.workGroup, options: { bold: true, color: '000000', fontFace: FONT_MALGUN, fontSize: workSz } }
  ], {
    x: 3.660, y: 1.125, w: 2.450, h: 0.406,
    fill: { color: 'FFFFFF' }, line: { color: C_BORDER, width: 1.0 },
    align: 'left', valign: 'middle', inset: 0.06, wrap: false
  });

  // 작업장소
  const locSz = getSingleLineFontSize(`작업장소 : ${data.location}`, 2.300, 14, 9.5);
  slide.addText([
    { text: '작업장소 : ', options: { bold: true, color: C_ACCENT_BLUE, fontFace: FONT_MALGUN, fontSize: locSz } },
    { text: data.location, options: { bold: true, color: '000000', fontFace: FONT_MALGUN, fontSize: locSz } }
  ], {
    x: 6.110, y: 1.125, w: 2.300, h: 0.406,
    fill: { color: 'FFFFFF' }, line: { color: C_BORDER, width: 1.0 },
    align: 'left', valign: 'middle', inset: 0.06, wrap: false
  });

  // 점검자
  const insSz = getSingleLineFontSize(`점검자 : ${data.inspector}`, 2.300, 14, 9.5);
  slide.addText([
    { text: '점검자 : ', options: { bold: true, color: C_ACCENT_BLUE, fontFace: FONT_MALGUN, fontSize: insSz } },
    { text: data.inspector, options: { bold: true, color: '000000', fontFace: FONT_MALGUN, fontSize: insSz } }
  ], {
    x: 8.410, y: 1.125, w: 2.300, h: 0.406,
    fill: { color: 'FFFFFF' }, line: { color: C_BORDER, width: 1.0 },
    align: 'left', valign: 'middle', inset: 0.06, wrap: false
  });

  // 점검차수
  const rSz = getSingleLineFontSize(`점검차수 : ${data.inspectRound}`, 2.430, 14, 9.5);
  slide.addText([
    { text: '점검차수 : ', options: { bold: true, color: C_ACCENT_BLUE, fontFace: FONT_MALGUN, fontSize: rSz } },
    { text: data.inspectRound, options: { bold: true, color: '000000', fontFace: FONT_MALGUN, fontSize: rSz } }
  ], {
    x: 10.710, y: 1.125, w: 2.430, h: 0.406,
    fill: { color: 'FFFFFF' }, line: { color: C_BORDER, width: 1.0 },
    align: 'left', valign: 'middle', inset: 0.06, wrap: false
  });

  // 부적합 내용 (2행)
  const mainSz = getSingleLineFontSize(`부적합 내용 : ${data.mainContent}`, 11.930, 14, 9.5);
  slide.addText([
    { text: '부적합 내용 : ', options: { bold: true, color: C_ACCENT_BLUE, fontFace: FONT_MALGUN, fontSize: mainSz } },
    { text: data.mainContent, options: { bold: true, color: '000000', fontFace: FONT_MALGUN, fontSize: mainSz } }
  ], {
    x: 1.210, y: 1.531, w: 11.930, h: 0.405,
    fill: { color: 'FFFFFF' }, line: { color: C_BORDER, width: 1.0 },
    align: 'left', valign: 'middle', inset: 0.06, wrap: false
  });

  // 3. 본문 우측 컬럼
  slide.addText('발생원인 (인터뷰 결과)', {
    x: 8.395, y: 2.207, w: 4.711, h: 0.406,
    fill: { color: C_YELLOW_BG }, line: { color: C_BORDER, width: 1.2 },
    fontFace: FONT_MALGUN, fontSize: 14, bold: true, color: '000000', align: 'center', valign: 'middle'
  });

  slide.addShape(pptx.ShapeType.rect, {
    x: 8.395, y: 2.650, w: 4.711, h: 2.917,
    fill: { color: 'FFFFFF' }, line: { color: C_BORDER, width: 1.2 }
  });
  // [ 의견 : 시공관리자 및 근로자 ]
  const intSz = data.interviewOpinion.length > 130 ? 10.5 : (data.interviewOpinion.length > 80 ? 11.5 : 12.5);
  slide.addText([
    { text: '[ 의견 : 시공관리자 및 근로자 ]\n', options: { fontSize: 14, bold: true, color: '000000', fontFace: FONT_MALGUN } },
    { text: data.interviewOpinion, options: { fontSize: intSz, color: '111111', fontFace: FONT_MALGUN } }
  ], {
    x: 8.395, y: 2.650, w: 4.711, h: 1.843,
    margin: [6, 8, 4, 8], valign: 'top', lineSpacingMultiple: 1.18
  });
  slide.addShape(pptx.ShapeType.line, {
    x: 8.395, y: 4.493, w: 4.711, h: 0,
    line: { color: C_BORDER, width: 1.0 }
  });
  // 점검단 제안
  slide.addShape(pptx.ShapeType.line, {
    x: 9.829, y: 4.493, w: 0, h: 1.074,
    line: { color: C_BORDER, width: 1.0 }
  });
  slide.addText([
    { text: '[점검단 제안]\n', options: { fontSize: 14, bold: true, color: '000000', fontFace: FONT_MALGUN } },
    { text: `${data.proposalType}\n`, options: { fontSize: 14, bold: true, color: C_ACCENT_BLUE, fontFace: FONT_MALGUN } },
    { text: data.proposalSub, options: { fontSize: 11, color: '595959', fontFace: FONT_MALGUN } }
  ], {
    x: 8.395, y: 4.493, w: 1.434, h: 1.074,
    align: 'center', valign: 'middle', lineSpacingMultiple: 1.15
  });

  // 점검단 제안 본문: DYNAMIC SCALING FOR NO CLIPPING!
  let propSz = 12.5;
  let propLineSpacing = 1.18;
  let propMargin = [5, 8, 4, 8];
  if (data.proposalContent.length > 70) {
    propSz = 10;
    propLineSpacing = 1.10;
    propMargin = [4, 6, 2, 6];
  } else if (data.proposalContent.length > 45) {
    propSz = 11.5;
    propLineSpacing = 1.14;
    propMargin = [4, 8, 3, 8];
  }

  slide.addText(data.proposalContent, {
    x: 9.829, y: 4.493, w: 3.277, h: 1.074,
    fontFace: FONT_MALGUN, fontSize: propSz, color: '111111',
    margin: propMargin, valign: 'top', lineSpacingMultiple: propLineSpacing
  });

  // 개선대책 헤더
  slide.addText('개선대책 (현장 협의 결과)', {
    x: 8.395, y: 5.660, w: 4.711, h: 0.406,
    fill: { color: C_YELLOW_BG }, line: { color: C_BORDER, width: 1.2 },
    fontFace: FONT_MALGUN, fontSize: 14, bold: true, color: '000000', align: 'center', valign: 'middle'
  });
  slide.addShape(pptx.ShapeType.rect, {
    x: 8.395, y: 6.102, w: 4.711, h: 1.134,
    fill: { color: 'FFFFFF' }, line: { color: C_BORDER, width: 1.2 }
  });
  slide.addShape(pptx.ShapeType.line, {
    x: 11.599, y: 6.102, w: 0, h: 1.134,
    line: { color: C_BORDER, width: 1.0 }
  });
  slide.addText([
    { text: '[PM 판정결과]', options: { fontSize: 14, bold: true, color: '000000', fontFace: FONT_MALGUN } }
  ], {
    x: 11.599, y: 6.102, w: 1.507, h: 1.134,
    align: 'center', valign: 'top', lineSpacingMultiple: 1.15, margin: [8, 4, 8, 4]
  });

  // 4. 좌측 사진 영역 (NO RED BANNER, ONLY PHOTO!)
  // Hold Point 위반 박스 (x = 5.975, y = 2.207, w = 2.363, h = 0.406)
  slide.addText([
    { text: data.isHoldPoint ? '☑ ' : '☐ ', options: { fontSize: 18, bold: true, color: '000000', fontFace: FONT_MALGUN } },
    { text: 'Hold Point 위반 (N/A)', options: { fontSize: 12, bold: true, color: '333333', fontFace: FONT_MALGUN } }
  ], {
    x: 5.975, y: 2.207, w: 2.363, h: 0.406,
    fill: { color: 'FFFFFF' }, line: { color: C_BORDER, width: 1.2 },
    align: 'center', valign: 'middle', wrap: false, inset: 0.04
  });

  // PHOTO: pure photo with clean border! (NO red banner above it!)
  slide.addShape(pptx.ShapeType.rect, {
    x: 0.120, y: 2.650, w: 8.218, h: 4.586,
    fill: { color: 'F8FAFC' }, line: { color: C_BORDER, width: 1.2 }
  });
  slide.addText('📸 현장 사진', {
    x: 0.120, y: 2.650, w: 8.218, h: 4.586,
    fontFace: FONT_MALGUN, fontSize: 14, color: '64748B', align: 'center', valign: 'middle'
  });

  await pptx.writeFile({ fileName: 'tools/test_fixed_output.pptx' });
  console.log('Generated tools/test_fixed_output.pptx successfully!');
}

generateTestSlide().then(() => {
  // Export using PowerPoint COM
  const ps = `
    $ppt = New-Object -ComObject PowerPoint.Application
    $pres = $ppt.Presentations.Open((Resolve-Path "tools/test_fixed_output.pptx").Path, [Microsoft.Office.Core.MsoTriState]::msoTrue, [Microsoft.Office.Core.MsoTriState]::msoFalse, [Microsoft.Office.Core.MsoTriState]::msoFalse)
    $slide = $pres.Slides.Item(1)
    $outPath = (Resolve-Path "tools").Path + "\\test_fixed_rendered.jpg"
    $slide.Export($outPath, "JPG", 1920, 1080)
    $pres.Close()
    $ppt.Quit()
    Write-Host "Exported tools/test_fixed_rendered.jpg!"
  `;
  fs.writeFileSync('tools/run_export_fixed.ps1', ps);
  console.log(execSync('powershell -ExecutionPolicy Bypass -File tools/run_export_fixed.ps1').toString());
}).catch(console.error);
