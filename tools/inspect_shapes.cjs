const fs = require('fs');
const xml = fs.readFileSync('tools/ppt_slides_slide1.xml', 'utf8');

const spMatches = xml.match(/<p:sp>[\s\S]*?<\/p:sp>/g) || [];
console.log('Shapes count:', spMatches.length);
spMatches.forEach((sp, i) => {
  console.log(`\nShape ${i+1}:`);
  const nameM = sp.match(/name="([^"]+)"/);
  console.log('Name:', nameM ? nameM[1] : '');
  const xM = sp.match(/x="(\d+)"/);
  const yM = sp.match(/y="(\d+)"/);
  const cxM = sp.match(/cx="(\d+)"/);
  const cyM = sp.match(/cy="(\d+)"/);
  if (xM) {
    console.log(`Bounds: x=${xM[1]/914400}, y=${yM[1]/914400}, w=${cxM[1]/914400}, h=${cyM[1]/914400}`);
  }
  const prstM = sp.match(/prst="([^"]+)"/);
  console.log('Prst:', prstM ? prstM[1] : 'none');
  const lnM = sp.match(/<a:ln[^>]*>[\s\S]*?<\/a:ln>/);
  if (lnM) console.log('Line:', lnM[0]);
  const fillM = sp.match(/<a:solidFill>[\s\S]*?<\/a:solidFill>/);
  if (fillM) console.log('Fill:', fillM[0]);
  const textM = sp.match(/<a:t>([\s\S]*?)<\/a:t>/g);
  if (textM) console.log('Text:', textM.join(' '));
});
