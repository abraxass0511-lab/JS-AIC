const fs = require('fs');
const xml = fs.readFileSync('tools/raw_slide1.xml', 'utf8');

console.log('=== 1. Table 17 (사고유형 / 추락) ===');
printXmlMatch(/<p:graphicFrame>[\s\S]*?name="표 17"[\s\S]*?<\/p:graphicFrame>/);

console.log('\n=== 2. Table 19 (관련기준) & 직사각형 28 ===');
printXmlMatch(/<p:graphicFrame>[\s\S]*?name="표 19"[\s\S]*?<\/p:graphicFrame>/);
printXmlMatch(/<p:sp>[\s\S]*?name="직사각형 28"[\s\S]*?<\/p:sp>/);

console.log('\n=== 3. Table 2 (부적합 개요 헤더 및 행 구조) ===');
const t2 = xml.match(/<p:graphicFrame>[\s\S]*?name="표 2"[\s\S]*?<\/p:graphicFrame>/)[0];
// Print Row 2 and Row 3
console.log(t2);

console.log('\n=== 4. Table 10 / 표 26 (Hold Point) ===');
printXmlMatch(/<p:graphicFrame>[\s\S]*?name="표 26"[\s\S]*?<\/p:graphicFrame>/);

console.log('\n=== 5. Table 8 / 표 24 (발생원인 헤더) ===');
printXmlMatch(/<p:graphicFrame>[\s\S]*?name="표 24"[\s\S]*?<\/p:graphicFrame>/);

console.log('\n=== 6. Table 6 / 표 22 (발생원인 내용 - 점검단 제안 구조) ===');
printXmlMatch(/<p:graphicFrame>[\s\S]*?name="표 22"[\s\S]*?<\/p:graphicFrame>/);

function printXmlMatch(re) {
  const m = xml.match(re);
  if (m) console.log(m[0]);
}
