const PptxGenJS = require('pptxgenjs');
const fs = require('fs');

async function testGenerate() {
  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: 'WIDE_16_9', width: 13.333, height: 7.5 });
  pptx.layout = 'WIDE_16_9';

  const FONT_MALGUN = '맑은 고딕';
  const C_BORDER = '000000';       // 테두리 100% 검은색 (#000000)
  const C_HEADER_BLUE = 'BDD7EE';   // 시설물/법규 헤더 연청색 (#BDD7EE)
  const C_STD_CONTENT_BG = 'DEEBF7'; // 관련기준 내용 연청색 음영 (#DEEBF7)
  const C_YELLOW_BG = 'FFD966';     // 부적합개요/원인/대책 헤더 옐로우 (#FFD966)
  const C_ACC_YELLOW_FILL = 'FFF2CC'; // 사고유형(떨어짐) 칸 연한 노란색 음영 (#FFF2CC)
  const C_ACC_BORDER = 'FFC000';    // 사고유형(떨어짐) 칸 3pt 황색 테두리 (#FFC000)
  const C_RED = 'C00000';           // 중부적합 및 강조 붉은색 (#C00000)
  const C_ACCENT_BLUE = '4472C4';   // 레이블 블루 (#4472C4)

  const slide = pptx.addSlide();
  slide.background = { color: 'FFFFFF' };

  // 1) 시설물/법규 (x = 0.120, w = 1.791, h = 0.914)
  slide.addText('시설물/법규', {
    x: 0.120, y: 0.163, w: 1.791, h: 0.914,
    fill: { color: C_HEADER_BLUE }, line: { color: C_BORDER, width: 0.75 },
    fontFace: FONT_MALGUN, fontSize: 18, bold: true, color: '000000',
    align: 'center', valign: 'middle'
  });

  // 2) 사고유형 & 부적합등급 (x = 1.967, w = 1.568, h = 0.914)
  slide.addText([
    { text: '떨어짐\n', options: { fontSize: 14, bold: true, color: '000000', fontFace: FONT_MALGUN } },
    { text: '(추락, 사람)\n', options: { fontSize: 12, bold: true, color: '333333', fontFace: FONT_MALGUN } },
    { text: '[중부적합]', options: { fontSize: 14, bold: true, color: C_RED, fontFace: FONT_MALGUN } }
  ], {
    x: 1.967, y: 0.163, w: 1.568, h: 0.914,
    fill: { color: C_ACC_YELLOW_FILL }, line: { color: C_ACC_BORDER, width: 3.0 },
    align: 'center', valign: 'middle', lineSpacingMultiple: 0.92, inset: 0.02
  });

  // 3) 관련기준 라벨 (x = 3.592, w = 0.684, h = 0.914) - 흰색 배경
  slide.addText('관련\n기준', {
    x: 3.592, y: 0.163, w: 0.684, h: 0.914,
    fill: { color: 'FFFFFF' }, line: { color: C_BORDER, width: 0.75 },
    fontFace: FONT_MALGUN, fontSize: 14, bold: true, color: '000000',
    align: 'center', valign: 'middle', lineSpacingMultiple: 1.15
  });

  // 4) 관련기준 내용 (x = 4.276, w = 5.832, h = 0.914) - 연청색 음영
  slide.addShape(pptx.ShapeType.rect, {
    x: 4.276, y: 0.163, w: 5.832, h: 0.914,
    fill: { color: C_STD_CONTENT_BG }, line: { color: C_BORDER, width: 0.75 }
  });
  slide.addShape(pptx.ShapeType.line, {
    x: 4.276, y: 0.480, w: 5.832, h: 0,
    line: { color: C_BORDER, width: 0.5 }
  });
  slide.addText('산업안전보건기준에 관한 규칙 제56조(작업발판의 구조), 제13조(안전난간의 구조 및 요건)', {
    x: 4.276, y: 0.163, w: 5.832, h: 0.317,
    fontFace: FONT_MALGUN, fontSize: 12, bold: true, color: '000000',
    align: 'left', valign: 'middle', wrap: false, inset: 0.06
  });
  slide.addText('작업발판은 틈새가 없도록 전면 설치하고, 발판 단부에는 상부난간대 및 중간난간대를 견고히 설치하여 근로자 추락을 방지해야 한다.', {
    x: 4.276, y: 0.480, w: 5.832, h: 0.597,
    fontFace: FONT_MALGUN, fontSize: 11.5, color: '111111',
    align: 'left', valign: 'middle', inset: 0.06, lineSpacingMultiple: 1.15
  });

  // 5) 4대 발생요인 (x = 10.165, y = 0.163, w = 2.975, h = 0.914)
  slide.addShape(pptx.ShapeType.rect, {
    x: 10.165, y: 0.163, w: 2.975, h: 0.914,
    fill: { color: 'FFFFFF' }, line: { color: C_BORDER, width: 0.75 }
  });
  slide.addShape(pptx.ShapeType.line, {
    x: 10.165, y: 0.620, w: 2.975, h: 0,
    line: { color: C_BORDER, width: 0.5 }
  });
  slide.addShape(pptx.ShapeType.line, {
    x: 11.652, y: 0.163, w: 0, h: 0.914,
    line: { color: C_BORDER, width: 0.5 }
  });
  slide.addText([
    { text: '☑ ', options: { fontSize: 16, bold: true, color: '000000', fontFace: FONT_MALGUN } },
    { text: '계획 미수립', options: { fontSize: 14, bold: true, color: '000000', fontFace: FONT_MALGUN } }
  ], { x: 10.165, y: 0.163, w: 1.487, h: 0.457, align: 'center', valign: 'middle', wrap: false, margin: 0 });

  slide.addText([
    { text: '☐ ', options: { fontSize: 16, bold: true, color: '000000', fontFace: FONT_MALGUN } },
    { text: '계획 미이행', options: { fontSize: 14, bold: true, color: '000000', fontFace: FONT_MALGUN } }
  ], { x: 11.652, y: 0.163, w: 1.487, h: 0.457, align: 'center', valign: 'middle', wrap: false, margin: 0 });

  slide.addText([
    { text: '☐ ', options: { fontSize: 16, bold: true, color: '000000', fontFace: FONT_MALGUN } },
    { text: '불안전 행동', options: { fontSize: 14, bold: true, color: '000000', fontFace: FONT_MALGUN } }
  ], { x: 10.165, y: 0.620, w: 1.487, h: 0.457, align: 'center', valign: 'middle', wrap: false, margin: 0 });

  slide.addText([
    { text: '☑ ', options: { fontSize: 16, bold: true, color: '000000', fontFace: FONT_MALGUN } },
    { text: '불안전 상태', options: { fontSize: 14, bold: true, color: '000000', fontFace: FONT_MALGUN } }
  ], { x: 11.652, y: 0.620, w: 1.487, h: 0.457, align: 'center', valign: 'middle', wrap: false, margin: 0 });

  // ── 2. 대형 컨테이너 (x = 0.120, y = 1.125, w = 13.020, h = 6.168, 바닥 y = 7.293) ──
  slide.addShape(pptx.ShapeType.rect, {
    x: 0.120, y: 1.125, w: 13.020, h: 6.168,
    fill: { color: 'FFFFFF' }, line: { color: C_BORDER, width: 0.75 }
  });

  // 부적합 개요 라벨 (x = 0.120, y = 1.125, w = 1.090, h = 0.812)
  slide.addText([
    { text: '부 적 합\n', options: { fontSize: 14, bold: true, color: '000000', fontFace: FONT_MALGUN } },
    { text: '개    요', options: { fontSize: 14, bold: true, color: '000000', fontFace: FONT_MALGUN } }
  ], {
    x: 0.120, y: 1.125, w: 1.090, h: 0.812,
    fill: { color: C_YELLOW_BG }, line: { color: C_BORDER, width: 0.75 },
    align: 'center', valign: 'middle', lineSpacingMultiple: 1.15
  });

  // 부적합 개요 1행: 5개 셀
  const metaCols = [
    { label: '협력사 : ', val: 'D사', w: 2.386, x: 1.210 },
    { label: '공종명 : ', val: '조적', w: 2.386, x: 3.596 },
    { label: '작업장소 : ', val: '105동 지하2층', w: 2.386, x: 5.982 },
    { label: '점검자 : ', val: '점검이', w: 2.386, x: 8.368 },
    { label: '점검차수 : ', val: '1차', w: 2.386, x: 10.754 }
  ];
  metaCols.forEach(col => {
    slide.addText([
      { text: col.label, options: { bold: true, color: C_ACCENT_BLUE, fontFace: FONT_MALGUN, fontSize: 14 } },
      { text: col.val, options: { bold: true, color: '000000', fontFace: FONT_MALGUN, fontSize: 14 } }
    ], {
      x: col.x, y: 1.125, w: col.w, h: 0.406,
      fill: { color: 'FFFFFF' }, line: { color: C_BORDER, width: 0.75 },
      align: 'left', valign: 'middle', inset: 0.06, wrap: false
    });
  });

  // 부적합 개요 2행: 부적합 내용 전체 너비 사각형
  slide.addText([
    { text: '부적합 내용 : ', options: { bold: true, color: C_ACCENT_BLUE, fontFace: FONT_MALGUN, fontSize: 14 } },
    { text: '말비계 설치범위가 모서리 구간에서 그쳐, 단부 추락위험', options: { bold: true, color: '000000', fontFace: FONT_MALGUN, fontSize: 14 } }
  ], {
    x: 1.210, y: 1.531, w: 11.930, h: 0.406,
    fill: { color: 'FFFFFF' }, line: { color: C_BORDER, width: 0.75 },
    align: 'left', valign: 'middle', inset: 0.06, wrap: false
  });

  // ── 3. 대형 컨테이너 내부 분할 (y = 1.937 ~ 7.293) ──
  // 가로 분리선
  slide.addShape(pptx.ShapeType.line, {
    x: 0.120, y: 1.937, w: 13.020, h: 0,
    line: { color: C_BORDER, width: 0.75 }
  });

  // 세로 분리선 (x = 8.395)
  slide.addShape(pptx.ShapeType.line, {
    x: 8.395, y: 1.937, w: 0, h: 5.356,
    line: { color: C_BORDER, width: 0.75 }
  });

  // 사진 삽입: 글씨/배너 없이 사진만 (w = 8.240, h = 5.060, y = 2.217)
  const testImg = 'C:/Users/YS/.gemini/antigravity-ide/brain/c3ddbf24-c3a5-4c0c-ab10-80ecb437b472/.tempmediaStorage/media_1793402027517.jpg';
  if (fs.existsSync(testImg)) {
    slide.addImage({
      path: testImg,
      x: 0.130, y: 2.217, w: 8.240, h: 5.060,
      sizing: { type: 'contain', w: 8.240, h: 5.060 }
    });
  }

  // Hold Point 위반 박스 (x = 5.975, y = 2.207, w = 2.363, h = 0.406) - 사진 위에 깔끔하게 위치
  slide.addText([
    { text: '☐ ', options: { fontSize: 18, bold: true, color: '000000', fontFace: FONT_MALGUN } },
    { text: 'Hold Point 위반 (N/A)', options: { fontSize: 12, bold: true, color: '000000', fontFace: FONT_MALGUN } }
  ], {
    x: 5.975, y: 2.207, w: 2.363, h: 0.406,
    fill: { color: 'FFFFFF' }, line: { color: C_BORDER, width: 0.75 },
    align: 'center', valign: 'middle', wrap: false, inset: 0.04
  });

  // ── 우측 컬럼: 발생원인 (x = 8.395 ~ 13.106, w = 4.711) ──
  // 1) 발생원인 (인터뷰 결과) 헤더
  slide.addText('발생원인 (인터뷰 결과)', {
    x: 8.395, y: 2.207, w: 4.711, h: 0.406,
    fill: { color: C_YELLOW_BG }, line: { color: C_BORDER, width: 0.75 },
    fontFace: FONT_MALGUN, fontSize: 14, bold: true, color: '000000', align: 'center', valign: 'middle'
  });

  // 2) 발생원인 본문 (y = 2.613, h = 3.047)
  slide.addShape(pptx.ShapeType.rect, {
    x: 8.395, y: 2.613, w: 4.711, h: 3.047,
    fill: { color: 'FFFFFF' }, line: { color: C_BORDER, width: 0.75 }
  });
  slide.addText([
    { text: '[ 의견 : 시공관리자 및 근로자 ]\n', options: { fontSize: 14, bold: true, color: '000000', fontFace: FONT_MALGUN } },
    { text: '현장 시공 여건 상 위험장소 접근 사유로 기준이 미준수되었으며, 관리감독자의 사전 작업지휘가 미흡한 상태에서 작업이 진행됨.', options: { fontSize: 12.5, color: '111111', fontFace: FONT_MALGUN } }
  ], {
    x: 8.395, y: 2.613, w: 4.711, h: 1.947,
    margin: [6, 10, 4, 10], valign: 'top', lineSpacingMultiple: 1.18
  });
  slide.addShape(pptx.ShapeType.line, {
    x: 8.395, y: 4.560, w: 4.711, h: 0,
    line: { color: C_BORDER, width: 0.75 }
  });
  slide.addShape(pptx.ShapeType.line, {
    x: 9.829, y: 4.560, w: 0, h: 1.100,
    line: { color: C_BORDER, width: 0.75 }
  });
  slide.addText([
    { text: '[점검단 제안]\n', options: { fontSize: 14, bold: true, color: '000000', fontFace: FONT_MALGUN } },
    { text: '시스템 개선\n', options: { fontSize: 14, bold: true, color: C_ACCENT_BLUE, fontFace: FONT_MALGUN } },
    { text: '(이행강화안 수립)', options: { fontSize: 11, color: '595959', fontFace: FONT_MALGUN } }
  ], {
    x: 8.395, y: 4.560, w: 1.434, h: 1.100,
    align: 'center', valign: 'middle', lineSpacingMultiple: 1.15
  });
  slide.addText('설치조립작업 시 발생 가능한 사고를 방지하기 위해 작업팀 대상 안전작업절차 교육을 의무화하고 현장 관리감독자의 일일 이행 모니터링을 대폭 강화할 필요가 있음.', {
    x: 9.829, y: 4.560, w: 3.277, h: 1.100,
    fontFace: FONT_MALGUN, fontSize: 12, color: '111111',
    margin: [6, 10, 4, 10], valign: 'top', lineSpacingMultiple: 1.18
  });

  // ── 우측 컬럼: 개선대책 및 PM 판정결과 ──
  // 3) 개선대책 (현장 협의 결과) 헤더
  slide.addText('개선대책 (현장 협의 결과)', {
    x: 8.395, y: 5.660, w: 4.711, h: 0.406,
    fill: { color: C_YELLOW_BG }, line: { color: C_BORDER, width: 0.75 },
    fontFace: FONT_MALGUN, fontSize: 14, bold: true, color: '000000', align: 'center', valign: 'middle'
  });

  // 4) 개선대책 본문 & PM 판정결과 구획
  slide.addShape(pptx.ShapeType.rect, {
    x: 8.395, y: 6.066, w: 4.711, h: 1.227,
    fill: { color: 'FFFFFF' }, line: { color: C_BORDER, width: 0.75 }
  });
  slide.addShape(pptx.ShapeType.line, {
    x: 11.599, y: 6.066, w: 0, h: 1.227,
    line: { color: C_BORDER, width: 0.75 }
  });
  slide.addShape(pptx.ShapeType.line, {
    x: 11.599, y: 6.443, w: 1.507, h: 0,
    line: { color: C_BORDER, width: 0.75 }
  });

  // [PM 판정결과] 헤더
  slide.addText('[PM 판정결과]', {
    x: 11.599, y: 6.066, w: 1.507, h: 0.377,
    fontFace: FONT_MALGUN, fontSize: 13, bold: true, color: '000000',
    align: 'center', valign: 'middle'
  });

  await pptx.writeFile({ fileName: 'tools/test_template_replica_photo.pptx' });
  console.log('Saved tools/test_template_replica_photo.pptx');
}

testGenerate().catch(err => {
  console.error(err);
  process.exit(1);
});
