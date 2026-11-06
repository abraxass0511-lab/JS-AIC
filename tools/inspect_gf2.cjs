const fs = require('fs');
const jszip = require('jszip');

async function inspectGf2() {
  const zip = await jszip.loadAsync(fs.readFileSync('템플릿/부적합 장표.pptx'));
  const xml = await zip.file('ppt/slides/slide1.xml').async('text');
  
  // Find graphicFrame 2
  const graphicFrames = xml.match(/<p:graphicFrame[\s\S]*?<\/p:graphicFrame>/g) || [];
  console.log('GF2 raw structure:');
  const gf2 = graphicFrames[1]; // index 1 is GraphicFrame 2
  
  // print column widths
  const gridCol = gf2.match(/<a:gridCol[\s\S]*?\/>/g) || [];
  gridCol.forEach((gc, i) => {
    const w = gc.match(/w="(\d+)"/);
    console.log(`Col ${i+1}: ${(parseInt(w[1]) / 914400).toFixed(3)}"`);
  });
  
  // print rows
  const rows = gf2.match(/<a:tr[\s\S]*?<\/a:tr>/g) || [];
  rows.forEach((r, i) => {
    const h = r.match(/h="(\d+)"/);
    console.log(`Row ${i+1} h: ${(parseInt(h[1]) / 914400).toFixed(3)}"`);
    // check merge (hMerge, vMerge)
    const tcs = r.match(/<a:tc[\s\S]*?<\/a:tc>/g) || [];
    tcs.forEach((tc, ci) => {
      const hm = tc.includes('hMerge="1"');
      const vm = tc.includes('vMerge="1"');
      const text = [...tc.matchAll(/<a:t>([^<]+)<\/a:t>/g)].map(m => m[1]).join(' ');
      console.log(`  Cell ${ci+1}: hMerge=${hm}, vMerge=${vm}, text="${text}"`);
    });
  });
}
inspectGf2();
