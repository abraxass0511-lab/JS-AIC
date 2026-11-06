const fs = require('fs');
const jszip = require('jszip');

async function inspectGf1and2() {
  const buf = fs.readFileSync('템플릿/부적합 장표.pptx');
  const zip = await jszip.loadAsync(buf);
  const slide1Xml = await zip.file('ppt/slides/slide1.xml').async('text');

  const gfRegex = /<p:graphicFrame[\s\S]*?<\/p:graphicFrame>/g;
  let gfMatch;
  let gfIndex = 0;
  while ((gfMatch = gfRegex.exec(slide1Xml)) !== null) {
    gfIndex++;
    if (gfIndex > 2) break;
    const gf = gfMatch[0];
    const nameMatch = gf.match(/<p:cNvPr[^>]*name="([^"]+)"/);
    const name = nameMatch ? nameMatch[1] : 'unnamed';
    const xM = gf.match(/x="(\d+)"/);
    const yM = gf.match(/y="(\d+)"/);
    const cxM = gf.match(/cx="(\d+)"/);
    const cyM = gf.match(/cy="(\d+)"/);
    const x = xM ? (parseInt(xM[1]) / 914400).toFixed(3) : '?';
    const y = yM ? (parseInt(yM[1]) / 914400).toFixed(3) : '?';
    const w = cxM ? (parseInt(cxM[1]) / 914400).toFixed(3) : '?';
    const h = cyM ? (parseInt(cyM[1]) / 914400).toFixed(3) : '?';

    console.log(`\nGraphicFrame ${gfIndex}: [${name}] x:${x}", y:${y}", w:${w}", h:${h}"`);
    const rows = gf.match(/<a:tr[\s\S]*?<\/a:tr>/g) || [];
    rows.forEach((r, ri) => {
      const hMatch = r.match(/h="(\d+)"/);
      const rh = hMatch ? (parseInt(hMatch[1]) / 914400).toFixed(3) : '?';
      console.log(`  Row ${ri+1} (h: ${rh}")`);
      const cells = r.match(/<a:tc[\s\S]*?<\/a:tc>/g) || [];
      cells.forEach((c, ci) => {
        const hm = c.includes('hMerge="1"');
        const vm = c.includes('vMerge="1"');
        const solidFill = c.match(/<a:solidFill>([\s\S]*?)<\/a:solidFill>/);
        let fillCol = 'none';
        if (solidFill) {
          fillCol = solidFill[1].replace(/\s+/g, ' ');
        }
        const borders = [];
        ['lnL', 'lnR', 'lnT', 'lnB'].forEach(bName => {
          const bMatch = c.match(new RegExp(`<a:${bName}[\\s\\S]*?<\\/a:${bName}>`));
          if (bMatch) {
            borders.push(bMatch[0].replace(/\s+/g, ' '));
          }
        });
        const texts = [...c.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)].map(m => m[1]).join(' ');
        console.log(`    Cell ${ci+1}: hM:${hm}, vM:${vm}, fill:${fillCol}, text:"${texts}"`);
        if (borders.length) {
          console.log(`      Borders: ${borders.join(' | ')}`);
        }
      });
    });
  }
}
inspectGf1and2();
