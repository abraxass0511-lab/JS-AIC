const PptxGenJS = require('pptxgenjs');
const JSZip = require('jszip');

async function testSingleShape() {
  const pptx = new PptxGenJS();
  const slide = pptx.addSlide();

  slide.addText([
    { text: '협력사 : ', options: { bold: true, color: '4472C4', fontSize: 14 } },
    { text: 'D사', options: { bold: true, color: '000000', fontSize: 14 } }
  ], {
    x: 1.210, y: 1.125, w: 2.45, h: 0.406,
    fill: { color: 'FFFFFF' },
    line: { color: '7BA0CD', width: 1.0 },
    align: 'left', valign: 'middle',
    inset: 0.08
  });

  const buf = await pptx.write({ outputType: 'nodebuffer' });
  const zip = await JSZip.loadAsync(buf);
  const xml = await zip.file('ppt/slides/slide1.xml').async('text');
  
  const sps = xml.match(/<p:sp>[\s\S]*?<\/p:sp>/g) || [];
  console.log('Shapes count:', sps.length);
  console.log('Shape XML:\n', sps[0]);
}

testSingleShape();
