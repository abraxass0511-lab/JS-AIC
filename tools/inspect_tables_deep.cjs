const fs = require('fs');

// Let's inspect the exact color and border values from raw_slide1.xml and raw_theme1.xml
const slideXml = fs.readFileSync('tools/template_extracted/ppt/slides/slide1.xml', 'utf8');

// 1. Let's inspect Table 1 (시설물/법규)
console.log('=== TABLE 1 (시설물/법규) ===');
printTableDetails(slideXml, '표 1');

// 2. Table 17 (추락 [중부적합])
console.log('\n=== TABLE 17 (추락 / 떨어짐) ===');
printTableDetails(slideXml, '표 17');

// 3. Table 19 (관련 기준)
console.log('\n=== TABLE 19 (관련 기준) ===');
printTableDetails(slideXml, '표 19');

// 4. Table 21 (체크박스 4개)
console.log('\n=== TABLE 21 (체크박스) ===');
printTableDetails(slideXml, '표 21');

// 5. Table 2 (부적합 개요 및 대형 컨테이너)
console.log('\n=== TABLE 2 (부적합 개요 및 대형 컨테이너) ===');
printTableDetails(slideXml, '표 2');

// 6. Table 24 (발생원인 헤더)
console.log('\n=== TABLE 24 (발생원인 헤더) ===');
printTableDetails(slideXml, '표 24');

// 7. Table 22 (발생원인 내용)
console.log('\n=== TABLE 22 (발생원인 내용) ===');
printTableDetails(slideXml, '표 22');

// 8. Table 25 (개선대책 헤더)
console.log('\n=== TABLE 25 (개선대책 헤더) ===');
printTableDetails(slideXml, '표 25');

// 9. Table 23 (개선대책 내용 + PM 판정결과)
console.log('\n=== TABLE 23 (개선대책 + PM 판정결과) ===');
printTableDetails(slideXml, '표 23');

// 10. Table 26 (Hold Point)
console.log('\n=== TABLE 26 (Hold Point) ===');
printTableDetails(slideXml, '표 26');

function printTableDetails(xml, tableName) {
  const re = new RegExp('<p:graphicFrame>[\\s\\S]*?name="' + tableName + '"[\\s\\S]*?<\\/p:graphicFrame>');
  const match = xml.match(re);
  if (!match) {
    console.log(`Table ${tableName} not found`);
    return;
  }
  const tXml = match[0];
  const off = tXml.match(/<a:off\s+x="(\d+)"\s+y="(\d+)"/);
  const ext = tXml.match(/<a:ext\s+cx="(\d+)"\s+cy="(\d+)"/);
  const x = (parseInt(off[1])/914400).toFixed(3);
  const y = (parseInt(off[2])/914400).toFixed(3);
  const w = (parseInt(ext[1])/914400).toFixed(3);
  const h = (parseInt(ext[2])/914400).toFixed(3);
  console.log(`Pos: x=${x}", y=${y}", w=${w}", h=${h}"`);

  // Fills in cells
  const cells = [...tXml.matchAll(/<a:tc[\s\S]*?<\/a:tc>/g)];
  cells.forEach((c, idx) => {
    const text = [...c[0].matchAll(/<a:t>([^<]*)<\/a:t>/g)].map(t => t[1]).join(' ');
    const solidFill = c[0].match(/<a:solidFill>([\s\S]*?)<\/a:solidFill>/);
    const noFill = c[0].includes('<a:noFill/>');
    let fillStr = noFill ? 'noFill' : (solidFill ? solidFill[1].replace(/\s+/g, ' ') : 'none');
    console.log(`  Cell ${idx + 1}: text="${text.trim()}", fill=${fillStr}`);
  });
}
