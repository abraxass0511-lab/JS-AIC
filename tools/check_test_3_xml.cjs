const fs = require('fs');
const JSZip = require('jszip');

async function run() {
  const buf = fs.readFileSync('tools/test_3_refinements.pptx');
  const zip = await JSZip.loadAsync(buf);
  const xml = await zip.file('ppt/slides/slide1.xml').async('text');

  const sps = xml.match(/<p:sp>[\s\S]*?<\/p:sp>/g) || [];
  sps.forEach((sp, idx) => {
    const offM = sp.match(/<a:off\s+x="(\d+)"\s+y="(\d+)"\/>/);
    const extM = sp.match(/<a:ext\s+cx="(\d+)"\s+cy="(\d+)"\/>/);
    const tMatches = sp.match(/<a:t>([\s\S]*?)<\/a:t>/g) || [];
    const t = tMatches.map(m => m.replace(/<\/?a:t>/g, '')).join(' ');
    const lInsM = sp.match(/lIns="(\d+)"/);
    const rInsM = sp.match(/rIns="(\d+)"/);
    const tInsM = sp.match(/tIns="(\d+)"/);
    const bInsM = sp.match(/bIns="(\d+)"/);

    const x = offM ? (parseInt(offM[1])/914400).toFixed(4) : 0;
    const y = offM ? (parseInt(offM[2])/914400).toFixed(4) : 0;
    const w = extM ? (parseInt(extM[1])/914400).toFixed(4) : 0;
    const h = extM ? (parseInt(extM[2])/914400).toFixed(4) : 0;
    const lIns = lInsM ? (parseInt(lInsM[1])/914400).toFixed(4) : 0;
    const tIns = tInsM ? (parseInt(tInsM[1])/914400).toFixed(4) : 0;

    console.log(`[${idx}] "${t.slice(0, 25)}" pos: (${x}, ${y}, ${w}, ${h}), lIns: ${lIns}, tIns: ${tIns}`);
  });
}

run();
