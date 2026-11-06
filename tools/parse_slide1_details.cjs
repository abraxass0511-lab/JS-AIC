const fs = require('fs');

const xml = fs.readFileSync('tools/ppt_slides_slide1.xml', 'utf8');

// Let's parse tables or shapes
// Check for <a:tbl>
const hasTable = xml.includes('<a:tbl');
console.log('Has table (<a:tbl>):', hasTable);

// Let's parse shapes (<p:sp>) and graphics frames (<p:graphicFrame>)
// In PPTX:
// 1 inch = 914400 EMU
// 1 pt = 12700 EMU = 100 in font sz (sz="1400" means 14pt)

// Let's find all graphicFrame (often contains tables)
const graphicFrames = xml.match(/<p:graphicFrame[\s\S]*?<\/p:graphicFrame>/g) || [];
console.log(`Found ${graphicFrames.length} graphicFrames.`);

graphicFrames.forEach((gf, i) => {
  const xM = gf.match(/x="(\d+)"/);
  const yM = gf.match(/y="(\d+)"/);
  const cxM = gf.match(/cx="(\d+)"/);
  const cyM = gf.match(/cy="(\d+)"/);
  const x = xM ? (parseInt(xM[1]) / 914400).toFixed(3) : '?';
  const y = yM ? (parseInt(yM[1]) / 914400).toFixed(3) : '?';
  const w = cxM ? (parseInt(cxM[1]) / 914400).toFixed(3) : '?';
  const h = cyM ? (parseInt(cyM[1]) / 914400).toFixed(3) : '?';
  console.log(`\n--- GraphicFrame ${i+1} [x:${x}, y:${y}, w:${w}, h:${h}] ---`);
  
  // Check if it's a table
  if (gf.includes('<a:tbl>')) {
    console.log('  -> Contains a:tbl');
    // count rows
    const rows = gf.match(/<a:tr[\s\S]*?<\/a:tr>/g) || [];
    console.log(`  -> Row count: ${rows.length}`);
    rows.forEach((r, ri) => {
      const hMatch = r.match(/h="(\d+)"/);
      const rh = hMatch ? (parseInt(hMatch[1]) / 914400).toFixed(3) : '?';
      const cells = r.match(/<a:tc[\s\S]*?<\/a:tc>/g) || [];
      console.log(`     Row ${ri+1} (height: ${rh}"): ${cells.length} cells`);
      cells.forEach((c, ci) => {
        // extract text
        const texts = [];
        const rMatches = c.match(/<a:r>[\s\S]*?<\/a:r>/g) || [];
        rMatches.forEach(rm => {
          const t = rm.match(/<a:t>([\s\S]*?)<\/a:t>/);
          const sz = rm.match(/sz="(\d+)"/);
          const b = rm.match(/b="(\d+)"/);
          const font = rm.match(/typeface="([^"]+)"/);
          const color = rm.match(/<a:srgbClr val="([^"]+)"\/>/);
          if (t) {
            texts.push(`"${t[1]}" (sz:${sz ? parseInt(sz[1])/100 : 'def'}pt, b:${b?b[1]:'0'}, font:${font?font[1]:'def'}, col:${color?color[1]:'def'})`);
          }
        });
        // also plain text inside p if any
        if (texts.length === 0) {
          const plainT = c.match(/<a:t>([\s\S]*?)<\/a:t>/g) || [];
          plainT.forEach(pt => {
            const val = pt.replace(/<\/?a:t>/g, '');
            texts.push(`"${val}"`);
          });
        }
        if (texts.length > 0) {
          console.log(`       Cell ${ci+1}: ${texts.join(' + ')}`);
        } else {
          console.log(`       Cell ${ci+1}: (empty)`);
        }
      });
    });
  }
});

// Now let's parse shapes (<p:sp>)
const shapes = xml.match(/<p:sp>[\s\S]*?<\/p:sp>/g) || [];
console.log(`\nFound ${shapes.length} shapes.`);

shapes.forEach((sp, i) => {
  const nameM = sp.match(/name="([^"]+)"/);
  const xM = sp.match(/x="(\d+)"/);
  const yM = sp.match(/y="(\d+)"/);
  const cxM = sp.match(/cx="(\d+)"/);
  const cyM = sp.match(/cy="(\d+)"/);
  const x = xM ? (parseInt(xM[1]) / 914400).toFixed(3) : '?';
  const y = yM ? (parseInt(yM[1]) / 914400).toFixed(3) : '?';
  const w = cxM ? (parseInt(cxM[1]) / 914400).toFixed(3) : '?';
  const h = cyM ? (parseInt(cyM[1]) / 914400).toFixed(3) : '?';
  
  // Fill color
  const fillM = sp.match(/<a:solidFill>[\s\S]*?<a:srgbClr val="([^"]+)"\/>/);
  // Line color
  const lineM = sp.match(/<a:ln[\s\S]*?<a:srgbClr val="([^"]+)"\/>/);
  
  // Text runs
  const runs = [];
  const rMatches = sp.match(/<a:r>[\s\S]*?<\/a:r>/g) || [];
  rMatches.forEach(rm => {
    const t = rm.match(/<a:t>([\s\S]*?)<\/a:t>/);
    const sz = rm.match(/sz="(\d+)"/);
    const b = rm.match(/b="(\d+)"/);
    const font = rm.match(/typeface="([^"]+)"/);
    const color = rm.match(/<a:srgbClr val="([^"]+)"\/>/);
    if (t) {
      runs.push(`"${t[1]}" (sz:${sz ? parseInt(sz[1])/100 : 'def'}pt, b:${b?b[1]:'0'}, font:${font?font[1]:'def'}, col:${color?color[1]:'def'})`);
    }
  });

  if (runs.length > 0 || fillM || lineM) {
    console.log(`\nShape ${i+1} [${nameM ? nameM[1] : 'unnamed'}]: x:${x}, y:${y}, w:${w}, h:${h}`);
    if (fillM) console.log(`  Fill: #${fillM[1]}`);
    if (lineM) console.log(`  Line: #${lineM[1]}`);
    if (runs.length > 0) console.log(`  Text: ${runs.join(' + ')}`);
  }
});
