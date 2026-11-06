const fs = require('fs');

const xml = fs.readFileSync('tools/ppt_slides_slide1.xml', 'utf8');

// Let's parse each graphicFrame and shape in detail
const JSZip = require('jszip');

async function dumpAll() {
  // Let's print out the exact XML for each graphicFrame so we know:
  // - gridCol widths
  // - row heights
  // - cell borders, fills, margins, alignments
  // - text runs, fonts, font sizes, bold, colors
  const gfMatches = xml.match(/<p:graphicFrame[\s\S]*?<\/p:graphicFrame>/g) || [];
  
  gfMatches.forEach((gf, i) => {
    const xM = gf.match(/x="(\d+)"/);
    const yM = gf.match(/y="(\d+)"/);
    const cxM = gf.match(/cx="(\d+)"/);
    const cyM = gf.match(/cy="(\d+)"/);
    const nameM = gf.match(/name="([^"]+)"/);
    
    console.log(`\n======================================================`);
    console.log(`FRAME #${i+1}: ${nameM ? nameM[1] : ''}`);
    console.log(`Pos: x=${(xM[1]/914400).toFixed(4)}", y=${(yM[1]/914400).toFixed(4)}", w=${(cxM[1]/914400).toFixed(4)}", h=${(cyM[1]/914400).toFixed(4)}"`);
    
    // gridCol
    const cols = gf.match(/<a:gridCol\s+w="(\d+)"\/>/g) || [];
    const colWidths = cols.map(c => (parseInt(c.match(/w="(\d+)"/)[1])/914400).toFixed(4));
    console.log(`Cols (${cols.length}): ${colWidths.join('", ')}"`);
    
    // rows
    const rows = gf.match(/<a:tr[\s\S]*?<\/a:tr>/g) || [];
    rows.forEach((r, ri) => {
      const hM = r.match(/h="(\d+)"/);
      const rh = hM ? (parseInt(hM[1])/914400).toFixed(4) : '?';
      console.log(`  Row ${ri+1} (h=${rh}"):`);
      
      const cells = r.match(/<a:tc[\s\S]*?<\/a:tc>/g) || [];
      cells.forEach((c, ci) => {
        const gridSpanM = c.match(/gridSpan="(\d+)"/);
        const rowSpanM = c.match(/rowSpan="(\d+)"/);
        const hMergeM = c.match(/hMerge="(\d+)"/);
        const vMergeM = c.match(/vMerge="(\d+)"/);
        const fillM = c.match(/<a:solidFill>[\s\S]*?<a:srgbClr val="([^"]+)"\/>/);
        
        // Borders
        const lnL = c.match(/<a:lnL[\s\S]*?<\/a:lnL>/);
        const lnR = c.match(/<a:lnR[\s\S]*?<\/a:lnR>/);
        const lnT = c.match(/<a:lnT[\s\S]*?<\/a:lnT>/);
        const lnB = c.match(/<a:lnB[\s\S]*?<\/a:lnB>/);
        
        // Text
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
              runs.push(`[${t[1]}](sz:${sz?parseInt(sz[1])/100:'def'},b:${b?b[1]:0},c:${color?color[1]:'def'},f:${font?font[1]:'def'})`);
            }
          });
          return `(align:${al?al[1]:'left'}) ${runs.join('')}`;
        });
        
        console.log(`    Cell ${ci+1} (span:${gridSpanM?gridSpanM[1]:1}, hMerge:${hMergeM?hMergeM[1]:0}, vMerge:${vMergeM?vMergeM[1]:0}, fill:${fillM?'#'+fillM[1]:'none'}): ${paraTexts.join(' \\n ')}`);
      });
    });
  });
}

dumpAll();
