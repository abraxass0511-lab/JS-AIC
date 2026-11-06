const fs = require('fs');

const xml = fs.readFileSync('tools/raw_slide1.xml', 'utf8');

// Parse slide size
const sldSz = xml.match(/<p:sldSz\s+cx="(\d+)"\s+cy="(\d+)"/);
const slideW = sldSz ? parseInt(sldSz[1]) / 914400 : 13.333;
const slideH = sldSz ? parseInt(sldSz[2]) / 914400 : 7.5;
console.log(`Slide dimensions: ${slideW.toFixed(3)}" x ${slideH.toFixed(3)}"`);

// Find all shapes (sp) and graphicFrames (graphicFrame)
// Let's extract graphicFrames first
const gfRegex = /<p:graphicFrame>([\s\S]*?)<\/p:graphicFrame>/g;
let gfMatch;
let gfIndex = 0;

console.log('\n================ GRAPHIC FRAMES (TABLES) ================');
while ((gfMatch = gfRegex.exec(xml)) !== null) {
  gfIndex++;
  const gfXml = gfMatch[1];
  const nameMatch = gfXml.match(/<p:cNvPr[^>]*name="([^"]*)"/);
  const name = nameMatch ? nameMatch[1] : `GF_${gfIndex}`;
  
  const offMatch = gfXml.match(/<a:off\s+x="(\d+)"\s+y="(\d+)"/);
  const extMatch = gfXml.match(/<a:ext\s+cx="(\d+)"\s+cy="(\d+)"/);
  
  const x = offMatch ? (parseInt(offMatch[1]) / 914400).toFixed(3) : 0;
  const y = offMatch ? (parseInt(offMatch[2]) / 914400).toFixed(3) : 0;
  const cx = extMatch ? (parseInt(extMatch[1]) / 914400).toFixed(3) : 0;
  const cy = extMatch ? (parseInt(extMatch[2]) / 914400).toFixed(3) : 0;

  console.log(`\n[Table/GF #${gfIndex}] Name: "${name}" Pos: (x=${x}", y=${y}", w=${cx}", h=${cy}")`);

  // Extract columns
  const colMatches = [...gfXml.matchAll(/<a:gridCol\s+w="(\d+)"/g)];
  const colWidths = colMatches.map(m => (parseInt(m[1]) / 914400).toFixed(3));
  console.log(`  Columns (${colWidths.length}): [${colWidths.join('", ')}"]`);

  // Extract rows
  const rowMatches = [...gfXml.matchAll(/<a:tr\s+h="(\d+)"([\s\S]*?)<\/a:tr>/g)];
  console.log(`  Rows (${rowMatches.length}):`);
  rowMatches.forEach((rm, rIdx) => {
    const rowH = (parseInt(rm[1]) / 914400).toFixed(3);
    const rowContent = rm[2];
    const cellMatches = [...rowContent.matchAll(/<a:tc([\s\S]*?)<\/a:tc>/g)];
    console.log(`    Row ${rIdx + 1} (h=${rowH}"): ${cellMatches.length} cells`);
    
    cellMatches.forEach((cm, cIdx) => {
      const cellXml = cm[1];
      // text
      const texts = [...cellXml.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map(t => t[1]).join(' ');
      
      // fill
      let fill = 'none';
      if (cellXml.includes('<a:noFill/>')) fill = 'noFill';
      else {
        const srgb = cellXml.match(/<a:srgbClr\s+val="([A-Fa-f0-9]+)"/);
        const scheme = cellXml.match(/<a:schemeClr\s+val="([^"]+)"/);
        if (srgb) fill = `#${srgb[1]}`;
        else if (scheme) fill = `scheme:${scheme[1]}`;
      }
      
      // borders
      const borders = [];
      const borderTypes = ['lnL', 'lnR', 'lnT', 'lnB'];
      borderTypes.forEach(bt => {
        const bMatch = cellXml.match(new RegExp(`<a:${bt}([^>]*)>([\\s\\S]*?)<\\/a:${bt}>`));
        if (bMatch) {
          const wMatch = bMatch[1].match(/w="(\d+)"/);
          const wPt = wMatch ? (parseInt(wMatch[1]) / 12700).toFixed(2) + 'pt' : 'default';
          const bClrSrgb = bMatch[2].match(/<a:srgbClr\s+val="([A-Fa-f0-9]+)"/);
          const bClrScheme = bMatch[2].match(/<a:schemeClr\s+val="([^"]+)"/);
          const bClr = bClrSrgb ? `#${bClrSrgb[1]}` : (bClrScheme ? `scheme:${bClrScheme[1]}` : 'clr');
          borders.push(`${bt}:${wPt}:${bClr}`);
        } else if (cellXml.includes(`<a:${bt}/>`)) {
          borders.push(`${bt}:none`);
        }
      });

      console.log(`      Cell (${rIdx+1}, ${cIdx+1}): text="${texts.trim()}" | fill=${fill} | borders=[${borders.join(', ')}]`);
    });
  });
}

// Find all shapes (sp)
console.log('\n================ SHAPES ================');
const spRegex = /<p:sp>([\s\S]*?)<\/p:sp>/g;
let spMatch;
let spIndex = 0;
while ((spMatch = spRegex.exec(xml)) !== null) {
  spIndex++;
  const spXml = spMatch[1];
  const nameMatch = spXml.match(/<p:cNvPr[^>]*name="([^"]*)"/);
  const name = nameMatch ? nameMatch[1] : `SP_${spIndex}`;
  
  const offMatch = spXml.match(/<a:off\s+x="(\d+)"\s+y="(\d+)"/);
  const extMatch = spXml.match(/<a:ext\s+cx="(\d+)"\s+cy="(\d+)"/);
  
  const x = offMatch ? (parseInt(offMatch[1]) / 914400).toFixed(3) : 0;
  const y = offMatch ? (parseInt(offMatch[2]) / 914400).toFixed(3) : 0;
  const cx = extMatch ? (parseInt(extMatch[1]) / 914400).toFixed(3) : 0;
  const cy = extMatch ? (parseInt(extMatch[2]) / 914400).toFixed(3) : 0;

  const texts = [...spXml.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map(t => t[1]).join(' ');
  
  // Fill & Line
  let fill = 'none';
  const srgb = spXml.match(/<a:srgbClr\s+val="([A-Fa-f0-9]+)"/);
  const scheme = spXml.match(/<a:schemeClr\s+val="([^"]+)"/);
  if (srgb) fill = `#${srgb[1]}`;
  else if (scheme) fill = `scheme:${scheme[1]}`;

  console.log(`[Shape #${spIndex}] "${name}" Pos: (x=${x}", y=${y}", w=${cx}", h=${cy}") text="${texts.trim()}" fill=${fill}`);
}
