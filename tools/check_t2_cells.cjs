const fs = require('fs');
const xml = fs.readFileSync('tools/template_extracted/ppt/slides/slide1.xml', 'utf8');
const t2 = xml.match(/<p:graphicFrame>[\s\S]*?name="표 2"[\s\S]*?<\/p:graphicFrame>/)[0];
const trs = [...t2.matchAll(/<a:tr\s+h="(\d+)"([\s\S]*?)<\/a:tr>/g)];
trs.forEach((t, i) => {
  console.log(`\n=== ROW ${i+1} (h=${(parseInt(t[1])/914400).toFixed(4)}") ===`);
  const cells = [...t[2].matchAll(/<a:tc([\s\S]*?)<\/a:tc>/g)];
  cells.forEach((c, ci) => {
    const text = [...c[1].matchAll(/<a:t>([^<]*)<\/a:t>/g)].map(x => x[1]).join(' ');
    const hMerge = c[1].includes('hMerge="1"');
    const vMerge = c[1].includes('vMerge="1"');
    const gridSpan = (c[1].match(/gridSpan="(\d+)"/) || [])[1] || '1';
    console.log(`  Cell ${ci+1} (gridSpan=${gridSpan}, hMerge=${hMerge}, vMerge=${vMerge}): text="${text}"`);
  });
});
