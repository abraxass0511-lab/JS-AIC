const fs = require('fs');
const xml = fs.readFileSync('tools/template_extracted/ppt/slides/slide1.xml', 'utf8');
const t2 = xml.match(/<p:graphicFrame>[\s\S]*?name="표 2"[\s\S]*?<\/p:graphicFrame>/)[0];
const trs = [...t2.matchAll(/<a:tr\s+h="(\d+)"/g)];
trs.forEach((t, i) => {
  console.log('Row', i+1, 'EMU:', t[1], 'inches:', (parseInt(t[1])/914400).toFixed(4));
});
