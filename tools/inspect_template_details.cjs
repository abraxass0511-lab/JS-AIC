const fs = require('fs');
const JSZip = require('jszip');

async function main() {
  const buf = fs.readFileSync('템플릿/부적합 장표.pptx');
  const zip = await JSZip.loadAsync(buf);
  
  console.log('--- Presentation XML ---');
  if (zip.file('ppt/presentation.xml')) {
    const presXml = await zip.file('ppt/presentation.xml').async('text');
    // find slide size: sldSz cx="..." cy="..."
    const m = presXml.match(/<p:sldSz\s+([^>]+)\/>/);
    if (m) console.log('Slide Size:', m[1]);
  }

  const slides = Object.keys(zip.files).filter(k => k.match(/^ppt\/slides\/slide\d+\.xml$/));
  console.log('Slides found:', slides);

  for (const s of slides) {
    console.log(`\n================= ${s} =================`);
    const xml = await zip.file(s).async('text');
    fs.writeFileSync(`tools/${s.replace(/\//g, '_')}`, xml);
    console.log(`Saved tools/${s.replace(/\//g, '_')}`);
  }
}

main().catch(console.error);
