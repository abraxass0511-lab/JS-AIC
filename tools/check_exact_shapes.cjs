const fs = require('fs');
const JSZip = require('jszip');

async function check() {
  const buf = fs.readFileSync('tools/user_exact_case.pptx');
  const zip = await JSZip.loadAsync(buf);
  const xml = await zip.file('ppt/slides/slide1.xml').async('text');

  const sps = xml.match(/<p:sp>[\s\S]*?<\/p:sp>/g) || [];
  console.log('Total shapes:', sps.length);

  sps.forEach((sp, i) => {
    const xM = sp.match(/x="(\d+)"/);
    const yM = sp.match(/y="(\d+)"/);
    const cxM = sp.match(/cx="(\d+)"/);
    const cyM = sp.match(/cy="(\d+)"/);
    const tMatches = sp.match(/<a:t>([\s\S]*?)<\/a:t>/g) || [];
    const texts = tMatches.map(tm => tm.replace(/<\/?a:t>/g, ''));
    if (texts.length > 0) {
      const runs = [];
      const rM = sp.match(/<a:r>[\s\S]*?<\/a:r>/g) || [];
      rM.forEach(r => {
        const t = r.match(/<a:t>([\s\S]*?)<\/a:t>/);
        const sz = r.match(/sz="(\d+)"/);
        const b = r.match(/b="(\d+)"/);
        const clr = r.match(/<a:srgbClr val="([^"]+)"\/>/);
        if (t) {
          runs.push(`[${t[1]}](sz:${sz?parseInt(sz[1])/100:'def'},b:${b?b[1]:0},c:${clr?clr[1]:'def'})`);
        }
      });
      const x = xM ? (parseInt(xM[1])/914400).toFixed(3) : 0;
      const y = yM ? (parseInt(yM[1])/914400).toFixed(3) : 0;
      const w = cxM ? (parseInt(cxM[1])/914400).toFixed(3) : 0;
      const h = cyM ? (parseInt(cyM[1])/914400).toFixed(3) : 0;
      console.log(`Shape #${i+1} at (${x}, ${y}, ${w}, ${h}): ${runs.join(' ')}`);
    }
  });
}

check();
