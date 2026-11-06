const PptxGenJS = require('pptxgenjs');
const JSZip = require('jszip');

async function testMargin() {
  const pptx = new PptxGenJS();
  const slide = pptx.addSlide();

  // Test 1: margin as points or inches
  slide.addText('Test Margin 6', { x: 1, y: 1, w: 3, h: 0.5, margin: 0.1 });
  slide.addText('Test Margin Array', { x: 1, y: 2, w: 3, h: 0.5, margin: [0.05, 0.1, 0.05, 0.1] });
  slide.addText('Test Inset', { x: 1, y: 3, w: 3, h: 0.5, inset: 0.1 });

  const buf = await pptx.write({ outputType: 'nodebuffer' });
  const zip = await JSZip.loadAsync(buf);
  const xml = await zip.file('ppt/slides/slide1.xml').async('text');
  
  const bodies = xml.match(/<a:bodyPr[^>]*>/g) || [];
  console.log('bodyPr tags:');
  bodies.forEach((b, i) => console.log(i + ': ' + b));
}

testMargin();
