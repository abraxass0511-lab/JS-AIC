const PptxGenJS = require('pptxgenjs');

async function testLayout() {
  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: 'WIDE_16_9', width: 13.333, height: 7.5 });
  pptx.layout = 'WIDE_16_9';
  const slide = pptx.addSlide();

  const FONT_MALGUN = 'Malgun Gothic';
  const C_BORDER = '000000';
  const C_ACC_BORDER = 'FFC000';
  const C_STD_CONTENT_BG = 'DEEBF7';
  const C_YELLOW_BG = 'FFD966';

  // 1) 떨어짐 / (추락, 사람) / [중부적합]
  // Test vertical centering:
  // If we set margin: [0, 0, 0, 4] or y = 0.170, or lineSpacingMultiple: 0.95
  slide.addText([
    { text: "떨어짐\n", options: { fontSize: 18, bold: true, color: '000000', fontFace: FONT_MALGUN } },
    { text: "(추락, 사람)\n", options: { fontSize: 11, bold: true, color: '333333', fontFace: FONT_MALGUN } },
    { text: "[중부적합]", options: { fontSize: 18, bold: true, color: '000000', fontFace: FONT_MALGUN } }
  ], {
    x: 1.967, y: 0.163, w: 1.568, h: 0.914,
    fill: { color: 'FFFFFF' }, line: { color: C_ACC_BORDER, width: 3.0 },
    align: 'center', valign: 'middle', lineSpacingMultiple: 0.95,
    margin: [0, 0, 0, 4] // Left, Right, Bottom, Top: 4pt top margin pushes it slightly down from top border!
  });

  // 2) 관련기준
  // Box
  slide.addShape(pptx.ShapeType.rect, {
    x: 4.276, y: 0.163, w: 5.832, h: 0.914,
    fill: { color: 'FFFFFF' }, line: { color: C_BORDER, width: 0.75 }
  });
  // Blue box at x = 4.380, w = 5.624
  slide.addShape(pptx.ShapeType.rect, {
    x: 4.380, y: 0.495, w: 5.624, h: 0.550,
    fill: { color: C_STD_CONTENT_BG }, line: { color: C_STD_CONTENT_BG, width: 0 }
  });
  // Law Title: MUST ALIGN with blue box (x = 4.380, w = 5.624)!
  slide.addText("산업안전보건기준에 관한 규칙 제56조(작업발판의 구조), 제13조(안전난간의 구조 및 요건)", {
    x: 4.380, y: 0.175, w: 5.624, h: 0.300,
    fontFace: FONT_MALGUN, fontSize: 11.5, bold: true, color: '000000',
    align: 'left', valign: 'middle', wrap: false, inset: 0.04
  });
  // Law Body: inside blue box (x = 4.380, w = 5.624)
  slide.addText("작업발판은 틈새가 없도록 전면 설치하고, 발판 단부에는 상부난간대 및 중간난간대를 견고히 설치하여 근로자 추락을 방지해야 한다.", {
    x: 4.380, y: 0.495, w: 5.624, h: 0.550,
    fontFace: FONT_MALGUN, fontSize: 11, color: '111111',
    align: 'left', valign: 'middle', inset: 0.06, lineSpacingMultiple: 1.15
  });

  // 3) 부적합 내용 bottom border at y = 1.937
  slide.addShape(pptx.ShapeType.line, {
    x: 0.120, y: 1.937, w: 13.020, h: 0,
    line: { color: C_BORDER, width: 0.75 }
  });

  // Hold point & 발생원인 slightly spaced (gap = 0.045", ~4px, y = 1.982)
  slide.addText([
    { text: '☑ ', options: { fontSize: 18, bold: true, color: '000000', fontFace: FONT_MALGUN } },
    { text: 'Hold Point 위반 (N/A)', options: { fontSize: 12, bold: true, color: '000000', fontFace: FONT_MALGUN } }
  ], {
    x: 5.975, y: 1.982, w: 2.363, h: 0.406,
    fill: { color: 'FFFFFF' }, line: { color: C_BORDER, width: 0.75 },
    align: 'center', valign: 'middle', wrap: false, inset: 0.04
  });

  slide.addText('발생원인 (인터뷰 결과)', {
    x: 8.395, y: 1.982, w: 4.711, h: 0.406,
    fill: { color: C_YELLOW_BG }, line: { color: C_BORDER, width: 0.75 },
    fontFace: FONT_MALGUN, fontSize: 14, bold: true, color: '000000', align: 'center', valign: 'middle'
  });

  await pptx.writeFile({ fileName: 'tools/test_3_refinements.pptx' });
  console.log('Saved tools/test_3_refinements.pptx');
}

testLayout().catch(console.error);
