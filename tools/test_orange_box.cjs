const PptxGenJS = require('pptxgenjs');
const JSZip = require('jszip');

async function testOrangeBox() {
  const pptx = new PptxGenJS();
  const slide = pptx.addSlide();

  // Test with lineSpacingMultiple: 0.95 and single shape
  slide.addText([
    { text: '떨어짐\n', options: { fontSize: 14, bold: true, color: '000000', fontFace: '맑은 고딕' } },
    { text: '(추락, 사람)\n', options: { fontSize: 13, bold: true, color: '333333', fontFace: '맑은 고딕' } },
    { text: '[중부적합]', options: { fontSize: 14, bold: true, color: 'C00000', fontFace: '맑은 고딕' } }
  ], {
    x: 1.967, y: 0.163, w: 1.568, h: 0.914,
    fill: { color: 'FFFFFF' },
    line: { color: 'ED7D31', width: 2.5 },
    align: 'center', valign: 'middle',
    lineSpacingMultiple: 0.95,
    inset: 0.02
  });

  const buf = await pptx.write({ outputType: 'nodebuffer' });
  const zip = await JSZip.loadAsync(buf);
  const xml = await zip.file('ppt/slides/slide1.xml').async('text');
  
  console.log('Orange box XML:\n', xml.match(/<p:sp>[\s\S]*?<\/p:sp>/)[0]);
}

testOrangeBox();
