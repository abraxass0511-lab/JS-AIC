const fs = require('fs');
const jszip = require('jszip');

async function forensicInspect() {
  const buf = fs.readFileSync('템플릿/부적합 장표.pptx');
  const zip = await jszip.loadAsync(buf);
  
  // 1. Read slide1.xml
  const slide1Xml = await zip.file('ppt/slides/slide1.xml').async('text');
  fs.writeFileSync('tools/raw_slide1.xml', slide1Xml, 'utf8');

  // Also check if there's theme or colors
  let themeXml = '';
  if (zip.file('ppt/theme/theme1.xml')) {
    themeXml = await zip.file('ppt/theme/theme1.xml').async('text');
    fs.writeFileSync('tools/raw_theme1.xml', themeXml, 'utf8');
  }

  console.log('Slide 1 XML saved to tools/raw_slide1.xml');
  console.log('Slide 1 length:', slide1Xml.length);

  // Let's parse all shapes, tables, and frames
  // Check graphicFrames (tables)
  const gfRegex = /<p:graphicFrame[\s\S]*?<\/p:graphicFrame>/g;
  let gfMatch;
  let gfIndex = 0;
  while ((gfMatch = gfRegex.exec(slide1Xml)) !== null) {
    gfIndex++;
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

    console.log(`\n======================================================`);
    console.log(`GraphicFrame ${gfIndex}: [${name}] x:${x}", y:${y}", w:${w}", h:${h}"`);

    // Check table
    if (gf.includes('<a:tbl>')) {
      // Table properties
      const tblPr = gf.match(/<a:tblPr[\s\S]*?<\/a:tblPr>/);
      console.log('  Table Properties:', tblPr ? tblPr[0] : 'none');

      // Grid columns
      const gridCols = [...gf.matchAll(/<a:gridCol[^>]*w="(\d+)"/g)].map(m => (parseInt(m[1]) / 914400).toFixed(3));
      console.log('  Columns (' + gridCols.length + '):', gridCols.map((c, i) => `Col${i+1}:${c}"`).join(', '));

      // Rows
      const rows = gf.match(/<a:tr[\s\S]*?<\/a:tr>/g) || [];
      console.log(`  Row count: ${rows.length}`);
      rows.forEach((r, ri) => {
        const hMatch = r.match(/h="(\d+)"/);
        const rh = hMatch ? (parseInt(hMatch[1]) / 914400).toFixed(3) : '?';
        const cells = r.match(/<a:tc[\s\S]*?<\/a:tc>/g) || [];
        console.log(`  -- Row ${ri+1} (h: ${rh}"): ${cells.length} cells --`);
        cells.forEach((c, ci) => {
          const hm = c.includes('hMerge="1"');
          const vm = c.includes('vMerge="1"');
          // Fill color
          const solidFill = c.match(/<a:solidFill>([\s\S]*?)<\/a:solidFill>/);
          let fillCol = 'none';
          if (solidFill) {
            const srgb = solidFill[1].match(/<a:srgbClr val="([^"]+)"\/>/);
            const scheme = solidFill[1].match(/<a:schemeClr val="([^"]+)"\/>/);
            fillCol = srgb ? `#${srgb[1]}` : (scheme ? `scheme:${scheme[1]}` : solidFill[1]);
          }

          // Borders
          const borders = [];
          ['lnL', 'lnR', 'lnT', 'lnB'].forEach(bName => {
            const bMatch = c.match(new RegExp(`<a:${bName}[\\s\\S]*?<\\/a:${bName}>`));
            if (bMatch) {
              const bw = bMatch[0].match(/w="(\d+)"/);
              const bClr = bMatch[0].match(/<a:srgbClr val="([^"]+)"\/>/) || bMatch[0].match(/<a:schemeClr val="([^"]+)"\/>/);
              const widthPt = bw ? (parseInt(bw[1]) / 12700).toFixed(1) : '?';
              borders.push(`${bName}:${widthPt}pt(${bClr ? bClr[1] : 'def'})`);
            }
          });

          // Text runs
          const runs = [...c.matchAll(/<a:r>([\s\S]*?)<\/a:r>/g)].map(rm => {
            const t = rm[1].match(/<a:t>([\s\S]*?)<\/a:t>/);
            const sz = rm[1].match(/sz="(\d+)"/);
            const b = rm[1].match(/b="(\d+)"/);
            const clr = rm[1].match(/<a:srgbClr val="([^"]+)"\/>/) || rm[1].match(/<a:schemeClr val="([^"]+)"\/>/);
            return `"${t ? t[1] : ''}"(sz:${sz ? parseInt(sz[1])/100 : 'def'},b:${b?b[1]:'0'},col:${clr?clr[1]:'def'})`;
          }).join(' + ');

          console.log(`     Cell ${ci+1}: hM:${hm}, vM:${vm}, fill:${fillCol}, borders:[${borders.join(', ')}], text: ${runs}`);
        });
      });
    }
  }

  // Check standalone shapes (<p:sp>)
  const spRegex = /<p:sp[\s\S]*?<\/p:sp>/g;
  let spMatch;
  let spIndex = 0;
  while ((spMatch = spRegex.exec(slide1Xml)) !== null) {
    spIndex++;
    const sp = spMatch[0];
    const nameMatch = sp.match(/<p:cNvPr[^>]*name="([^"]+)"/);
    const name = nameMatch ? nameMatch[1] : 'unnamed';
    const xM = sp.match(/x="(\d+)"/);
    const yM = sp.match(/y="(\d+)"/);
    const cxM = sp.match(/cx="(\d+)"/);
    const cyM = sp.match(/cy="(\d+)"/);
    const x = xM ? (parseInt(xM[1]) / 914400).toFixed(3) : '?';
    const y = yM ? (parseInt(yM[1]) / 914400).toFixed(3) : '?';
    const w = cxM ? (parseInt(cxM[1]) / 914400).toFixed(3) : '?';
    const h = cyM ? (parseInt(cyM[1]) / 914400).toFixed(3) : '?';

    // Fill
    const solidFill = sp.match(/<a:solidFill>([\s\S]*?)<\/a:solidFill>/);
    let fillCol = 'none';
    if (solidFill) {
      const srgb = solidFill[1].match(/<a:srgbClr val="([^"]+)"\/>/);
      const scheme = solidFill[1].match(/<a:schemeClr val="([^"]+)"\/>/);
      fillCol = srgb ? `#${srgb[1]}` : (scheme ? `scheme:${scheme[1]}` : solidFill[1]);
    }
    // Line
    const ln = sp.match(/<a:ln[\s\S]*?<\/a:ln>/);
    let lineInfo = 'none';
    if (ln) {
      const bw = ln[0].match(/w="(\d+)"/);
      const bClr = ln[0].match(/<a:srgbClr val="([^"]+)"\/>/) || ln[0].match(/<a:schemeClr val="([^"]+)"\/>/);
      lineInfo = `${bw ? (parseInt(bw[1])/12700).toFixed(1)+'pt' : '?'} (${bClr ? bClr[1] : 'def'})`;
    }

    const text = [...sp.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)].map(m => m[1]).join(' ');
    console.log(`\nShape ${spIndex}: [${name}] x:${x}", y:${y}", w:${w}", h:${h}" | fill:${fillCol} | line:${lineInfo} | text:"${text}"`);
  }
}

forensicInspect().catch(console.error);
