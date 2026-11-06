const fs = require('fs');

const slide = fs.readFileSync('tools/template_extracted/ppt/slides/slide1.xml', 'utf8');

// Find all solidFill in slide1.xml
const fills = [...slide.matchAll(/<a:solidFill>([\s\S]*?)<\/a:solidFill>/g)];
console.log('Unique fills in slide1.xml:');
const fillSet = new Set();
fills.forEach(f => fillSet.add(f[1].replace(/\s+/g, ' ')));
fillSet.forEach(f => console.log(' -', f));

// Check lines / borders
const lines = [...slide.matchAll(/<a:ln[LRBT]?[\s\S]*?>([\s\S]*?)<\/a:ln[LRBT]?>/g)];
console.log('\nUnique line fills:');
const lineSet = new Set();
lines.forEach(l => {
  const sf = l[1].match(/<a:solidFill>([\s\S]*?)<\/a:solidFill>/);
  if (sf) lineSet.add(sf[1].replace(/\s+/g, ' '));
});
lineSet.forEach(l => console.log(' -', l));
