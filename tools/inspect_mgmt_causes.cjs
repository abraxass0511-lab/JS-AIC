const fs = require('fs');
const xml = fs.readFileSync('tools/dl_slide1.xml', 'utf8');

// Also let's check tools/template_extracted/ppt/slides/slide1.xml if exists
let tmplXml = '';
if (fs.existsSync('tools/template_extracted/ppt/slides/slide1.xml')) {
  tmplXml = fs.readFileSync('tools/template_extracted/ppt/slides/slide1.xml', 'utf8');
}

function analyze(raw, label) {
  console.log(`=== ANALYZING ${label} ===`);
  const sps = raw.split('<p:sp>');
  sps.forEach((sp, i) => {
    if (sp.includes('계획') || sp.includes('불안전') || sp.includes('Shape 10') || sp.includes('Shape 11') || sp.includes('Shape 12')) {
      const name = (sp.match(/name="([^"]+)"/) || [])[1];
      const prst = (sp.match(/prst="([^"]+)"/) || [])[1];
      const xfrm = (sp.match(/<a:off x="(\d+)" y="(\d+)"\/>\s*<a:ext cx="(\d+)" cy="(\d+)"\/>/) || []);
      const texts = [...sp.matchAll(/<a:t>([^<]+)<\/a:t>/g)].map(m => m[1]);
      console.log(`[${i}] name=${name} geom=${prst} off=(${xfrm[1]}, ${xfrm[2]}) ext=(${xfrm[3]}, ${xfrm[4]}) texts=${texts.join(' | ')}`);
    }
  });

  // Also check tables (<a:tbl>)
  const tbls = raw.split('<a:tbl>');
  console.log(`Tables count in ${label}: ${tbls.length - 1}`);
  tbls.slice(1).forEach((tbl, idx) => {
    if (tbl.includes('계획') || tbl.includes('불안전')) {
      console.log(`Table ${idx + 1} contains 계획/불안전!`);
    }
  });
}

analyze(xml, 'tools/dl_slide1.xml');
if (tmplXml) analyze(tmplXml, 'tools/template_extracted/ppt/slides/slide1.xml');
