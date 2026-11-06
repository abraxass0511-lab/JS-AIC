const fs = require('fs');

const xml = fs.readFileSync('tools/ppt_slides_slide1.xml', 'utf8');

// Print every text with its exact font, size, bold, color, and which table it belongs to
const tables = xml.match(/<a:tbl>[\s\S]*?<\/a:tbl>/g) || [];
tables.forEach((tbl, ti) => {
  console.log(`\n=================== Table ${ti+1} ===================`);
  const rows = tbl.match(/<a:tr[\s\S]*?<\/a:tr>/g) || [];
  rows.forEach((r, ri) => {
    const cells = r.match(/<a:tc[\s\S]*?<\/a:tc>/g) || [];
    cells.forEach((c, ci) => {
      const texts = [];
      const paras = c.match(/<a:p>[\s\S]*?<\/a:p>/g) || [];
      paras.forEach(p => {
        const runs = [];
        const rMatches = p.match(/<a:r>[\s\S]*?<\/a:r>/g) || [];
        rMatches.forEach(rm => {
          const t = rm.match(/<a:t>([\s\S]*?)<\/a:t>/);
          const sz = rm.match(/sz="(\d+)"/);
          const b = rm.match(/b="(\d+)"/);
          const color = rm.match(/<a:srgbClr val="([^"]+)"\/>/);
          const schemeClr = rm.match(/<a:schemeClr val="([^"]+)"\/>/);
          const typeface = rm.match(/typeface="([^"]+)"/);
          if (t) {
            runs.push({
              text: t[1],
              sz: sz ? parseInt(sz[1]) / 100 : 'def',
              b: b ? b[1] === '1' : false,
              color: color ? color[1] : (schemeClr ? schemeClr[1] : 'def'),
              font: typeface ? typeface[1] : 'def'
            });
          }
        });
        if (runs.length > 0) texts.push(runs);
      });
      if (texts.length > 0) {
        console.log(`  Row ${ri+1}, Cell ${ci+1}:`);
        texts.forEach(pRuns => {
          console.log('    ' + pRuns.map(r => `[${r.text}] (sz:${r.sz}pt, b:${r.b}, c:${r.color}, f:${r.font})`).join(' '));
        });
      }
    });
  });
});
