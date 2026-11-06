const fs = require('fs');
const xml = fs.readFileSync('tools/raw_slide1.xml', 'utf8');

const t17Match = xml.match(/<p:graphicFrame>[\s\S]*?name="표 17"[\s\S]*?<\/p:graphicFrame>/);
if (t17Match) {
  console.log('--- TABLE 17 XML ---');
  console.log(t17Match[0]);
}

// Also check tableStyleId and check tableStyles.xml if present in pptx
