const fs = require('fs');
const xml = fs.readFileSync('tools/dl_slide1.xml', 'utf8');
const idx = xml.indexOf('Image 1');
console.log('Shapes after Image 1:');
const after = xml.slice(idx);
const shapes = after.match(/<p:sp>[\s\S]*?<\/p:sp>/g) || [];
shapes.forEach((s, i) => {
  const offM = s.match(/<a:off x="(\d+)" y="(\d+)"\/>/);
  const extM = s.match(/<a:ext cx="(\d+)" cy="(\d+)"\/>/);
  const textM = s.match(/<a:t>([^<]+)<\/a:t>/g);
  if (offM && extM) {
    const x = parseInt(offM[1], 10) / 914400;
    const y = parseInt(offM[2], 10) / 914400;
    const w = parseInt(extM[1], 10) / 914400;
    const h = parseInt(extM[2], 10) / 914400;
    console.log(i, `Shape at x=${x.toFixed(3)} y=${y.toFixed(3)} w=${w.toFixed(3)} h=${h.toFixed(3)}`, 'text:', textM ? textM.slice(0, 2) : 'none');
  }
});
