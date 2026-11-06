const fs = require('fs');

const xml = fs.readFileSync('tools/ppt_slides_slide1.xml', 'utf8');

// Inspect the shape(s)
const spMatches = xml.match(/<p:sp>[\s\S]*?<\/p:sp>/g) || [];
console.log(`=== SHAPES (${spMatches.length}) ===`);
spMatches.forEach((sp, i) => {
  const xM = sp.match(/x="(\d+)"/);
  const yM = sp.match(/y="(\d+)"/);
  const cxM = sp.match(/cx="(\d+)"/);
  const cyM = sp.match(/cy="(\d+)"/);
  const nameM = sp.match(/name="([^"]+)"/);
  console.log(`Shape #${i+1} [${nameM ? nameM[1] : ''}]: x=${(xM[1]/914400).toFixed(4)}", y=${(yM[1]/914400).toFixed(4)}", w=${(cxM[1]/914400).toFixed(4)}", h=${(cyM[1]/914400).toFixed(4)}"`);
  const prstM = sp.match(/prst="([^"]+)"/);
  if (prstM) console.log(`  Geometry: ${prstM[1]}`);
  const fillM = sp.match(/<a:solidFill>[\s\S]*?<a:srgbClr val="([^"]+)"\/>/);
  if (fillM) console.log(`  Fill: #${fillM[1]}`);
  const lnM = sp.match(/<a:ln\s+w="(\d+)"[\s\S]*?<a:srgbClr val="([^"]+)"\/>/);
  if (lnM) console.log(`  Line: w=${(lnM[1]/12700).toFixed(2)}pt, color=#${lnM[2]}`);
});

// Inspect graphicFrames
const gfMatches = xml.match(/<p:graphicFrame[\s\S]*?<\/p:graphicFrame>/g) || [];
console.log(`\n=== GRAPHIC FRAMES / TABLES (${gfMatches.length}) ===`);
gfMatches.forEach((gf, i) => {
  const xM = gf.match(/x="(\d+)"/);
  const yM = gf.match(/y="(\d+)"/);
  const cxM = gf.match(/cx="(\d+)"/);
  const cyM = gf.match(/cy="(\d+)"/);
  const nameM = gf.match(/name="([^"]+)"/);
  
  console.log(`\n----------------------------------------------------`);
  console.log(`Table #${i+1}: ${nameM ? nameM[1] : ''}`);
  console.log(`Bounds: x=${(xM[1]/914400).toFixed(4)}", y=${(yM[1]/914400).toFixed(4)}", w=${(cxM[1]/914400).toFixed(4)}", h=${(cyM[1]/914400).toFixed(4)}"`);
  
  // gridCol
  const colMatches = gf.match(/<a:gridCol\s+w="(\d+)"/g) || [];
  const colWidths = colMatches.map(c => {
    const w = parseInt(c.match(/w="(\d+)"/)[1]);
    return (w / 914400).toFixed(4);
  });
  console.log(`Columns (${colWidths.length}): ${colWidths.join('", ')}"`);
  
  // rows
  const rowMatches = gf.match(/<a:tr[\s\S]*?<\/a:tr>/g) || [];
  rowMatches.forEach((r, ri) => {
    const hM = r.match(/h="(\d+)"/);
    const rh = hM ? (parseInt(hM[1])/914400).toFixed(4) : '?';
    console.log(`  Row ${ri+1} (height: ${rh}"):`);
    
    const cellMatches = r.match(/<a:tc[\s\S]*?<\/a:tc>/g) || [];
    cellMatches.forEach((c, ci) => {
      const gSpan = c.match(/gridSpan="(\d+)"/);
      const rSpan = c.match(/rowSpan="(\d+)"/);
      const hMerge = c.match(/hMerge="(\d+)"/);
      const vMerge = c.match(/vMerge="(\d+)"/);
      
      const tcPr = c.match(/<a:tcPr[\s\S]*?<\/a:tcPr>/);
      let anchor = 'top';
      let fillCol = 'none';
      let borderInfo = [];
      let margins = '';
      if (tcPr) {
        const pr = tcPr[0];
        const aM = pr.match(/anchor="([^"]+)"/);
        if (aM) anchor = aM[1];
        const fM = pr.match(/<a:solidFill>[\s\S]*?<a:srgbClr val="([^"]+)"\/>/);
        if (fM) fillCol = '#' + fM[1];
        
        // borders
        ['lnL', 'lnR', 'lnT', 'lnB'].forEach(bSide => {
          const bM = pr.match(new RegExp(`<a:${bSide}\\s+w="(\\d+)"[\\s\\S]*?<a:srgbClr val="([^"]+)"\\/>`));
          if (bM) {
            borderInfo.push(`${bSide}:${(bM[1]/12700).toFixed(1)}pt #${bM[2]}`);
          }
        });
        
        const marL = pr.match(/marL="(\d+)"/);
        const marR = pr.match(/marR="(\d+)"/);
        const marT = pr.match(/marT="(\d+)"/);
        const marB = pr.match(/marB="(\d+)"/);
        if (marL || marT) {
          margins = `pad(L:${marL ? (marL[1]/12700).toFixed(1) : 0}pt, T:${marT ? (marT[1]/12700).toFixed(1) : 0}pt)`;
        }
      }
      
      const paras = c.match(/<a:p>[\s\S]*?<\/a:p>/g) || [];
      const paraTexts = paras.map(p => {
        const al = p.match(/algn="([^"]+)"/);
        const runs = [];
        const rMatches = p.match(/<a:r>[\s\S]*?<\/a:r>/g) || [];
        rMatches.forEach(rm => {
          const t = rm.match(/<a:t>([\s\S]*?)<\/a:t>/);
          const sz = rm.match(/sz="(\d+)"/);
          const b = rm.match(/b="(\d+)"/);
          const color = rm.match(/<a:srgbClr val="([^"]+)"\/>/);
          const font = rm.match(/typeface="([^"]+)"/);
          if (t) {
            runs.push(`[${t[1]}](sz:${sz?parseInt(sz[1])/100:'def'},b:${b?b[1]:0},col:${color?color[1]:'def'},font:${font?font[1]:'def'})`);
          }
        });
        return `(align:${al?al[1]:'l'}) ${runs.join('')}`;
      });
      
      console.log(`    Cell ${ci+1} [span:${gSpan?gSpan[1]:1}, hMerge:${hMerge?hMerge[1]:0}, vMerge:${vMerge?vMerge[1]:0}, fill:${fillCol}, anchor:${anchor}, ${margins}, borders:[${borderInfo.join(', ')}]]:`);
      if (paraTexts.length > 0) {
        console.log(`      ${paraTexts.join(' \\n ')}`);
      }
    });
  });
});
