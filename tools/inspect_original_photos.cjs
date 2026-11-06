const fs = require('fs');
const JSZip = require('jszip');

async function inspectOriginal() {
  const buf = fs.readFileSync('템플릿/부적합 장표.pptx');
  const zip = await JSZip.loadAsync(buf);
  const slide1 = await zip.file('ppt/slides/slide1.xml').async('text');
  
  const pics = slide1.match(/<p:pic>[\s\S]*?<\/p:pic>/g) || [];
  console.log('Original template pic count:', pics.length);
  for (let i = 0; i < pics.length; i++) {
    const spPrMatch = pics[i].match(/<p:spPr>[\s\S]*?<\/p:spPr>/);
    if (!spPrMatch) continue;
    const spPr = spPrMatch[0];
    const xMatch = spPr.match(/x="(\d+)"/);
    const yMatch = spPr.match(/y="(\d+)"/);
    const cxMatch = spPr.match(/cx="(\d+)"/);
    const cyMatch = spPr.match(/cy="(\d+)"/);
    if (xMatch && yMatch && cxMatch && cyMatch) {
      console.log('Pic', i+1, 'x:', (xMatch[1]/914400).toFixed(3), 'y:', (yMatch[1]/914400).toFixed(3), 'w:', (cxMatch[1]/914400).toFixed(3), 'h:', (cyMatch[1]/914400).toFixed(3));
    }
  }
}

inspectOriginal().catch(console.error);
