const fs = require('fs');
const JSZip = require('jszip');

async function compare() {
  const bufOrig = fs.readFileSync('템플릿/부적합 장표.pptx');
  const zipOrig = await JSZip.loadAsync(bufOrig);
  const xmlOrig = await zipOrig.file('ppt/slides/slide1.xml').async('text');

  const bufGen = fs.readFileSync('tools/test_template_output.pptx');
  const zipGen = await JSZip.loadAsync(bufGen);
  const xmlGen = await zipGen.file('ppt/slides/slide1.xml').async('text');

  console.log('=== TEMPLATE (ORIGINAL) SLIDE 1 ===');
  const origGF = xmlOrig.match(/<p:graphicFrame[\s\S]*?<\/p:graphicFrame>/g) || [];
  origGF.forEach((gf, i) => {
    const xM = gf.match(/x="(\d+)"/);
    const yM = gf.match(/y="(\d+)"/);
    const cxM = gf.match(/cx="(\d+)"/);
    const cyM = gf.match(/cy="(\d+)"/);
    const nameM = gf.match(/name="([^"]+)"/);
    console.log(`[Orig #${i+1} ${nameM?nameM[1]:''}] x:${(xM[1]/914400).toFixed(3)}, y:${(yM[1]/914400).toFixed(3)}, w:${(cxM[1]/914400).toFixed(3)}, h:${(cyM[1]/914400).toFixed(3)}`);
  });

  console.log('\n=== APP GENERATED SLIDE 1 (ppt-generator.js) ===');
  const genSp = xmlGen.match(/<p:sp>[\s\S]*?<\/p:sp>/g) || [];
  console.log('Generated Shapes count:', genSp.length);
  genSp.forEach((sp, i) => {
    const xM = sp.match(/x="(\d+)"/);
    const yM = sp.match(/y="(\d+)"/);
    const cxM = sp.match(/cx="(\d+)"/);
    const cyM = sp.match(/cy="(\d+)"/);
    const tM = sp.match(/<a:t>([\s\S]*?)<\/a:t>/);
    const szM = sp.match(/sz="(\d+)"/);
    const bM = sp.match(/b="(\d+)"/);
    if (xM && tM) {
      console.log(`[Gen #${i+1}] x:${(xM[1]/914400).toFixed(3)}, y:${(yM[1]/914400).toFixed(3)}, w:${(cxM[1]/914400).toFixed(3)}, h:${(cyM[1]/914400).toFixed(3)} | sz:${szM?szM[1]/100:'def'}pt, b:${bM?bM[1]:0} | "${tM?tM[1]:''}"`);
    }
  });
}

compare().catch(console.error);
