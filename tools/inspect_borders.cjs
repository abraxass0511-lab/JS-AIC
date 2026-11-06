const fs = require('fs');

const xml = fs.readFileSync('tools/ppt_slides_slide1.xml', 'utf8');

// Search for any line definitions <a:ln...> in the whole xml
const lnMatches = xml.match(/<a:ln[RLTB]?[^>]*>[\s\S]*?<\/a:ln[RLTB]?>/g) || [];
console.log('Total ln matches:', lnMatches.length);
lnMatches.slice(0, 20).forEach((ln, i) => {
  console.log(`ln #${i+1}:`, ln.replace(/\s+/g, ' '));
});

// Check tblPr
const tblPrs = xml.match(/<a:tblPr[\s\S]*?<\/a:tblPr>/g) || [];
console.log('\ntblPr count:', tblPrs.length);
tblPrs.forEach((pr, i) => {
  console.log(`tblPr #${i+1}:`, pr.replace(/\s+/g, ' '));
});
