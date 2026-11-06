const fs = require('fs');
const jszip = require('jszip');

async function inspectShapes() {
  const zip = await jszip.loadAsync(fs.readFileSync('템플릿/부적합 장표.pptx'));
  const xml = await zip.file('ppt/slides/slide1.xml').async('text');
  
  const shapeRegex = /<(?:p:sp|p:pic)>([\s\S]*?)<\/(?:p:sp|p:pic)>/g;
  let match;
  while ((match = shapeRegex.exec(xml)) !== null) {
    const content = match[1];
    const nameMatch = content.match(/<p:cNvPr[^>]*name="([^"]+)"/);
    const name = nameMatch ? nameMatch[1] : 'unknown';
    const offMatch = content.match(/<a:off x="(\d+)" y="(\d+)"/);
    const extMatch = content.match(/<a:ext cx="(\d+)" cy="(\d+)"/);
    const textMatch = [...content.matchAll(/<a:t>([^<]+)<\/a:t>/g)].map(m => m[1]).join(' ');
    
    if (offMatch && extMatch) {
      const x = (parseInt(offMatch[1]) / 914400).toFixed(3);
      const y = (parseInt(offMatch[2]) / 914400).toFixed(3);
      const w = (parseInt(extMatch[1]) / 914400).toFixed(3);
      const h = (parseInt(extMatch[2]) / 914400).toFixed(3);
      console.log(`[${name}] x:${x}, y:${y}, w:${w}, h:${h} | text: ${textMatch.slice(0, 50)}`);
    }
  }
}
inspectShapes();
