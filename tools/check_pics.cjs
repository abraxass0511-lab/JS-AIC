const fs = require('fs');
const jszip = require('jszip');

async function checkPicsInTemplate() {
  const zip = await jszip.loadAsync(fs.readFileSync('템플릿/부적합 장표.pptx'));
  const xml = await zip.file('ppt/slides/slide1.xml').async('text');
  
  // check all pic or images
  const pics = xml.match(/<p:pic[\s\S]*?<\/p:pic>/g) || [];
  console.log(`Found ${pics.length} pictures in slide1.`);
  pics.forEach((p, i) => {
    const xM = p.match(/x="(\d+)"/);
    const yM = p.match(/y="(\d+)"/);
    const cxM = p.match(/cx="(\d+)"/);
    const cyM = p.match(/cy="(\d+)"/);
    const x = xM ? (parseInt(xM[1]) / 914400).toFixed(3) : '?';
    const y = yM ? (parseInt(yM[1]) / 914400).toFixed(3) : '?';
    const w = cxM ? (parseInt(cxM[1]) / 914400).toFixed(3) : '?';
    const h = cyM ? (parseInt(cyM[1]) / 914400).toFixed(3) : '?';
    console.log(`Pic ${i+1}: x:${x}, y:${y}, w:${w}, h:${h}`);
  });
}
checkPicsInTemplate();
