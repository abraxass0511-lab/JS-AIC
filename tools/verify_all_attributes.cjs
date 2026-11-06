const fs = require('fs');
const JSZip = require('jszip');

async function auditSlide(filename) {
  const buf = fs.readFileSync(filename);
  const zip = await JSZip.loadAsync(buf);
  const xml = await zip.file('ppt/slides/slide1.xml').async('text');

  console.log(`\n======================================================`);
  console.log(`AUDIT OF: ${filename}`);
  console.log(`======================================================`);

  // 1. Tables (if any)
  const tblMatches = xml.match(/<a:tbl>[\s\S]*?<\/a:tbl>/g) || [];
  console.log(`Total Tables: ${tblMatches.length}`);

  // 2. Shapes
  const spMatches = xml.match(/<p:sp>[\s\S]*?<\/p:sp>/g) || [];
  console.log(`Total Shapes: ${spMatches.length}`);

  // Let's extract all text nodes with their attributes, bounds, colors, fills, borders
  const elements = [];

  // Parse GraphicFrames / Tables
  const gfMatches = xml.match(/<p:graphicFrame[\s\S]*?<\/p:graphicFrame>/g) || [];
  gfMatches.forEach((gf, gfi) => {
    const xM = gf.match(/x="(\d+)"/);
    const yM = gf.match(/y="(\d+)"/);
    const cxM = gf.match(/cx="(\d+)"/);
    const cyM = gf.match(/cy="(\d+)"/);
    const nameM = gf.match(/name="([^"]+)"/);
    const gx = xM ? (parseInt(xM[1])/914400).toFixed(3) : 0;
    const gy = yM ? (parseInt(yM[1])/914400).toFixed(3) : 0;
    const gw = cxM ? (parseInt(cxM[1])/914400).toFixed(3) : 0;
    const gh = cyM ? (parseInt(cyM[1])/914400).toFixed(3) : 0;

    const rows = gf.match(/<a:tr[\s\S]*?<\/a:tr>/g) || [];
    rows.forEach((r, ri) => {
      const cells = r.match(/<a:tc[\s\S]*?<\/a:tc>/g) || [];
      cells.forEach((c, ci) => {
        // extract text
        const paras = c.match(/<a:p>[\s\S]*?<\/a:p>/g) || [];
        paras.forEach(p => {
          const runs = p.match(/<a:r>[\s\S]*?<\/a:r>/g) || [];
          runs.forEach(rm => {
            const t = rm.match(/<a:t>([\s\S]*?)<\/a:t>/);
            const sz = rm.match(/sz="(\d+)"/);
            const b = rm.match(/b="(\d+)"/);
            const font = rm.match(/typeface="([^"]+)"/);
            const color = rm.match(/<a:srgbClr val="([^"]+)"\/>/);
            const schemeClr = rm.match(/<a:schemeClr val="([^"]+)"\/>/);
            if (t) {
              elements.push({
                source: `Table ${nameM?nameM[1]:gfi+1} R${ri+1}C${ci+1}`,
                text: t[1].trim(),
                x: gx, y: gy, w: gw, h: gh,
                sz: sz ? parseInt(sz[1])/100 : 18,
                b: b ? b[1] === '1' : false,
                font: font ? font[1] : '맑은 고딕',
                color: color ? color[1] : (schemeClr ? schemeClr[1] : 'default')
              });
            }
          });
        });
      });
    });
  });

  // Parse Shapes
  spMatches.forEach((sp, spi) => {
    const xM = sp.match(/x="(\d+)"/);
    const yM = sp.match(/y="(\d+)"/);
    const cxM = sp.match(/cx="(\d+)"/);
    const cyM = sp.match(/cy="(\d+)"/);
    const nameM = sp.match(/name="([^"]+)"/);
    const sx = xM ? (parseInt(xM[1])/914400).toFixed(3) : 0;
    const sy = yM ? (parseInt(yM[1])/914400).toFixed(3) : 0;
    const sw = cxM ? (parseInt(cxM[1])/914400).toFixed(3) : 0;
    const sh = cyM ? (parseInt(cyM[1])/914400).toFixed(3) : 0;

    const fillM = sp.match(/<a:solidFill>[\s\S]*?<a:srgbClr val="([^"]+)"\/>/);
    const lnM = sp.match(/<a:ln[\s\S]*?<a:srgbClr val="([^"]+)"\/>/);

    const paras = sp.match(/<a:p>[\s\S]*?<\/a:p>/g) || [];
    paras.forEach(p => {
      const runs = p.match(/<a:r>[\s\S]*?<\/a:r>/g) || [];
      runs.forEach(rm => {
        const t = rm.match(/<a:t>([\s\S]*?)<\/a:t>/);
        const sz = rm.match(/sz="(\d+)"/);
        const b = rm.match(/b="(\d+)"/);
        const font = rm.match(/typeface="([^"]+)"/);
        const color = rm.match(/<a:srgbClr val="([^"]+)"\/>/);
        const schemeClr = rm.match(/<a:schemeClr val="([^"]+)"\/>/);
        if (t && t[1].trim()) {
          elements.push({
            source: `Shape ${nameM?nameM[1]:spi+1}`,
            text: t[1].trim(),
            x: sx, y: sy, w: sw, h: sh,
            sz: sz ? parseInt(sz[1])/100 : 18,
            b: b ? b[1] === '1' : false,
            font: font ? font[1] : '맑은 고딕',
            color: color ? color[1] : (schemeClr ? schemeClr[1] : 'default'),
            fill: fillM ? fillM[1] : 'none',
            line: lnM ? lnM[1] : 'none'
          });
        }
      });
    });
  });

  console.log(`Extracted ${elements.length} text runs.`);
  return elements;
}

async function run() {
  const orig = await auditSlide('템플릿/부적합 장표.pptx');
  const gen = await auditSlide('tools/test_template_output.pptx');

  console.log('\n======================================================');
  console.log('SIDE-BY-SIDE VERIFICATION OF EVERY SECTION');
  console.log('======================================================');

  // Let's compare key sections:
  // 1. 시설물/법규
  console.log('\n[1. 시설물/법규]');
  const orig1 = orig.find(e => e.text.includes('시설물') || e.text.includes('법규'));
  const gen1 = gen.find(e => e.text.includes('시설물/법규'));
  console.log('  TEMPLATE :', orig1 ? `Pos(${orig1.x}, ${orig1.y}, ${orig1.w}, ${orig1.h}) sz:${orig1.sz}pt, font:${orig1.font}, color:${orig1.color}` : 'Not found');
  console.log('  GENERATED:', gen1 ? `Pos(${gen1.x}, ${gen1.y}, ${gen1.w}, ${gen1.h}) sz:${gen1.sz}pt, font:${gen1.font}, color:${gen1.color}` : 'Not found');

  // 2. 사고유형 및 등급
  console.log('\n[2. 사고유형 및 등급]');
  const orig2 = orig.filter(e => e.text.includes('추락') || e.text.includes('중부적합'));
  const gen2 = gen.filter(e => e.text.includes('넘어짐') || e.text.includes('경부적합') || e.text.includes('전도'));
  console.log('  TEMPLATE :', orig2.map(e => `[${e.text}] Pos(${e.x}, ${e.y}, ${e.w}, ${e.h}) sz:${e.sz}pt, color:${e.color}`).join(' | '));
  console.log('  GENERATED:', gen2.map(e => `[${e.text}] Pos(${e.x}, ${e.y}, ${e.w}, ${e.h}) sz:${e.sz}pt, color:${e.color}`).join(' | '));

  // 3. 관련기준
  console.log('\n[3. 관련기준 라벨 & 내용]');
  const orig3 = orig.filter(e => e.text.includes('관련') || e.text.includes('기준') || e.text.includes('산업안전보건법'));
  const gen3 = gen.filter(e => e.text.includes('관련') || e.text.includes('기준') || e.text.includes('산업안전보건기준'));
  console.log('  TEMPLATE :', orig3.map(e => `[${e.text}] Pos(${e.x}, ${e.y}, ${e.w}, ${e.h}) sz:${e.sz}pt`).join(' | '));
  console.log('  GENERATED:', gen3.map(e => `[${e.text.slice(0, 20)}...] Pos(${e.x}, ${e.y}, ${e.w}, ${e.h}) sz:${e.sz}pt`).join(' | '));

  // 4. 4대 발생요인
  console.log('\n[4. 4대 발생요인]');
  const orig4 = orig.filter(e => e.text.includes('미수립') || e.text.includes('미이행') || e.text.includes('행동') || e.text.includes('상태'));
  const gen4 = gen.filter(e => e.text.includes('미수립') || e.text.includes('미이행') || e.text.includes('행동') || e.text.includes('상태'));
  console.log('  TEMPLATE :', orig4.map(e => `[${e.text}] sz:${e.sz}pt, b:${e.b}`).join(' | '));
  console.log('  GENERATED:', gen4.map(e => `[${e.text}] sz:${e.sz}pt, b:${e.b}`).join(' | '));

  // 5. 부적합 개요
  console.log('\n[5. 부적합 개요 라벨 & 5개 항목 & 내용]');
  const orig5 = orig.filter(e => e.text.includes('개') || e.text.includes('협력사') || e.text.includes('공종명') || e.text.includes('점검자') || e.text.includes('내용'));
  const gen5 = gen.filter(e => e.text.includes('개') || e.text.includes('협력사') || e.text.includes('공종명') || e.text.includes('점검자') || e.text.includes('내용'));
  console.log('  TEMPLATE :', orig5.map(e => `[${e.text}] sz:${e.sz}pt`).join(' | '));
  console.log('  GENERATED:', gen5.map(e => `[${e.text}] sz:${e.sz}pt`).join(' | '));

  // 6. Hold Point
  console.log('\n[6. Hold Point 위반]');
  const orig6 = orig.filter(e => e.text.includes('Hold Point'));
  const gen6 = gen.filter(e => e.text.includes('Hold Point'));
  console.log('  TEMPLATE :', orig6.map(e => `[${e.text}] Pos(${e.x}, ${e.y}, ${e.w}, ${e.h}) sz:${e.sz}pt, b:${e.b}`).join(' | '));
  console.log('  GENERATED:', gen6.map(e => `[${e.text}] Pos(${e.x}, ${e.y}, ${e.w}, ${e.h}) sz:${e.sz}pt, b:${e.b}`).join(' | '));

  // 7. 발생원인 & 개선대책 & PM 판정
  console.log('\n[7. 발생원인 & 개선대책 & PM 판정]');
  const orig7 = orig.filter(e => e.text.includes('인터뷰') || e.text.includes('협의') || e.text.includes('PM'));
  const gen7 = gen.filter(e => e.text.includes('인터뷰') || e.text.includes('협의') || e.text.includes('PM'));
  console.log('  TEMPLATE :', orig7.map(e => `[${e.text}] Pos(${e.x}, ${e.y}, ${e.w}, ${e.h}) sz:${e.sz}pt`).join(' | '));
  console.log('  GENERATED:', gen7.map(e => `[${e.text}] Pos(${e.x}, ${e.y}, ${e.w}, ${e.h}) sz:${e.sz}pt`).join(' | '));
}

run().catch(console.error);
