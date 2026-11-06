const fs = require('fs');
const JSZip = require('jszip');

async function main() {
  const buf = fs.readFileSync('템플릿/부적합 장표.pptx');
  const zip = await JSZip.loadAsync(buf);
  const xml = await zip.file('ppt/slides/slide1.xml').async('text');
  const sizes = {};
  const rMatches = xml.match(/<a:r>[\s\S]*?<\/a:r>/g) || [];
  rMatches.forEach(rm => {
    const t = rm.match(/<a:t>([\s\S]*?)<\/a:t>/);
    const sz = rm.match(/sz="(\d+)"/);
    const size = sz ? parseInt(sz[1])/100 : 'def(18)';
    if (t) {
      if (!sizes[size]) sizes[size] = [];
      sizes[size].push(t[1]);
    }
  });
  console.log('ALL SIZES IN 템플릿/부적합 장표.pptx:');
  for (const s of Object.keys(sizes)) {
    console.log(s + 'pt (' + sizes[s].length + ' runs): ' + JSON.stringify(sizes[s].slice(0, 8)));
  }
}
main();
