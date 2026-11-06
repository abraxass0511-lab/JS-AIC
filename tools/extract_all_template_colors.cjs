const fs = require('fs');

const xml = fs.readFileSync('tools/ppt_slides_slide1.xml', 'utf8');

// Print every graphicFrame with its background color, border color, text color, font, size
const gfMatches = xml.match(/<p:graphicFrame[\s\S]*?<\/p:graphicFrame>/g) || [];

gfMatches.forEach((gf, i) => {
  const nameM = gf.match(/name="([^"]+)"/);
  console.log(`\n======================================================`);
  console.log(`FRAME #${i+1}: ${nameM ? nameM[1] : ''}`);
  
  const cells = gf.match(/<a:tc[\s\S]*?<\/a:tc>/g) || [];
  cells.forEach((c, ci) => {
    const tcPr = c.match(/<a:tcPr[\s\S]*?<\/a:tcPr>/);
    let fill = 'none';
    let borders = [];
    if (tcPr) {
      const pr = tcPr[0];
      const fillM = pr.match(/<a:solidFill>([\s\S]*?)<\/a:solidFill>/);
      if (fillM) fill = fillM[1].replace(/\s+/g, ' ');
      
      const bMatches = pr.match(/<a:ln[RLTB][\s\S]*?<\/a:ln[RLTB]>/g) || [];
      bMatches.forEach(b => {
        borders.push(b.replace(/\s+/g, ' ').slice(0, 80));
      });
    }
    
    const runs = [];
    const rMatches = c.match(/<a:r>[\s\S]*?<\/a:r>/g) || [];
    rMatches.forEach(r => {
      const t = r.match(/<a:t>([\s\S]*?)<\/a:t>/);
      const sz = r.match(/sz="(\d+)"/);
      const b = r.match(/b="(\d+)"/);
      const clr = r.match(/<a:solidFill>([\s\S]*?)<\/a:solidFill>/);
      if (t) {
        runs.push(`[${t[1]}] sz:${sz?sz[1]/100:'def'}pt, b:${b?b[1]:0}, clr:${clr?clr[1].replace(/\s+/g, ' '):'def'}`);
      }
    });
    
    console.log(` Cell ${ci+1}:`);
    console.log(`   Fill: ${fill}`);
    console.log(`   Borders: ${borders.slice(0, 2).join(' | ')}`);
    console.log(`   Text: ${runs.join(' + ')}`);
  });
});
