const fs = require('fs');
const xml = fs.readFileSync('tools/raw_slide1.xml', 'utf8');

console.log('=== POINT 1 & 2: Table 17 (추락 / 떨어짐) ===');
const t17 = xml.match(/<p:graphicFrame>[\s\S]*?name="표 17"[\s\S]*?<\/p:graphicFrame>/)[0];
// Print all text and text properties in t17
const t17Paras = [...t17.matchAll(/<a:p>([\s\S]*?)<\/a:p>/g)];
t17Paras.forEach((p, i) => {
  const texts = [...p[1].matchAll(/<a:t>([^<]*)<\/a:t>/g)].map(t => t[1]).join('');
  const rPrs = [...p[1].matchAll(/<a:rPr([^>]*)>/g)].map(r => r[1]);
  console.log(`Para ${i+1}: text="${texts}", rPr=[${rPrs.join(', ')}]`);
});
// Check fill of t17
const t17TcPr = t17.match(/<a:tcPr([\s\S]*?)<\/a:tcPr>/)[1];
console.log('t17 tcPr:', t17TcPr);

console.log('\n=== POINT 3 & 4: Table 19 & 직사각형 28 ===');
const t19 = xml.match(/<p:graphicFrame>[\s\S]*?name="표 19"[\s\S]*?<\/p:graphicFrame>/)[0];
const rect28 = xml.match(/<p:sp>[\s\S]*?name="직사각형 28"[\s\S]*?<\/p:sp>/)[0];
console.log('Table 19 xfrm:');
const t19Off = t19.match(/<a:off\s+x="(\d+)"\s+y="(\d+)"/);
const t19Ext = t19.match(/<a:ext\s+cx="(\d+)"\s+cy="(\d+)"/);
console.log(`  x=${t19Off[1]/914400}", y=${t19Off[2]/914400}", cx=${t19Ext[1]/914400}", cy=${t19Ext[2]/914400}"`);

console.log('직사각형 28 xfrm:');
const r28Off = rect28.match(/<a:off\s+x="(\d+)"\s+y="(\d+)"/);
const r28Ext = rect28.match(/<a:ext\s+cx="(\d+)"\s+cy="(\d+)"/);
console.log(`  x=${r28Off[1]/914400}", y=${r28Off[2]/914400}", cx=${r28Ext[1]/914400}", cy=${r28Ext[2]/914400}"`);

const t19Cells = [...t19.matchAll(/<a:tc([\s\S]*?)<\/a:tc>/g)];
t19Cells.forEach((c, i) => {
  const texts = [...c[1].matchAll(/<a:t>([^<]*)<\/a:t>/g)].map(t => t[1]).join(' ');
  const solidFill = c[1].match(/<a:solidFill>([\s\S]*?)<\/a:solidFill>/);
  const noFill = c[1].includes('<a:noFill/>');
  console.log(`Table 19 Cell ${i+1}: text="${texts}", fill=${noFill ? 'noFill' : (solidFill ? solidFill[1] : 'none')}`);
});

console.log('\n=== POINT 5: "부적합 개요" text in Table 2 ===');
const t2 = xml.match(/<p:graphicFrame>[\s\S]*?name="표 2"[\s\S]*?<\/p:graphicFrame>/)[0];
const t2Row2 = t2.match(/<a:tr\s+h="(\d+)"([\s\S]*?)<\/a:tr>/g)[1];
const t2Row2Cell1 = t2Row2.match(/<a:tc([\s\S]*?)<\/a:tc>/)[1];
console.log('Row 2 Cell 1 text & formatting:');
const r2c1Paras = [...t2Row2Cell1.matchAll(/<a:p>([\s\S]*?)<\/a:p>/g)];
r2c1Paras.forEach((p, i) => {
  const text = [...p[1].matchAll(/<a:t>([^<]*)<\/a:t>/g)].map(t => t[1]).join('');
  const szMatch = p[1].match(/sz="(\d+)"/);
  const bMatch = p[1].match(/b="(\d+)"/);
  console.log(`  Para ${i+1}: text="${text}", sz=${szMatch ? szMatch[1] : 'def'}, b=${bMatch ? bMatch[1] : 'def'}`);
});

console.log('\n=== POINT 6: Y Coordinates of Table 2 rows vs Table 24 (발생원인) vs Table 26 (Hold Point) ===');
const t2Off = t2.match(/<a:off\s+x="(\d+)"\s+y="(\d+)"/);
const t2Trs = [...t2.matchAll(/<a:tr\s+h="(\d+)"/g)];
let curY = parseInt(t2Off[2]);
console.log(`Table 2 top y = ${curY/914400}"`);
t2Trs.forEach((tr, i) => {
  const h = parseInt(tr[1]);
  console.log(`  Row ${i+1}: y=${curY/914400}" to ${(curY+h)/914400}" (h=${h/914400}")`);
  curY += h;
});

const t24 = xml.match(/<p:graphicFrame>[\s\S]*?name="표 24"[\s\S]*?<\/p:graphicFrame>/)[0];
const t24Off = t24.match(/<a:off\s+x="(\d+)"\s+y="(\d+)"/);
console.log(`Table 24 (발생원인 헤더) y = ${t24Off[2]/914400}"`);

const t26 = xml.match(/<p:graphicFrame>[\s\S]*?name="표 26"[\s\S]*?<\/p:graphicFrame>/)[0];
const t26Off = t26.match(/<a:off\s+x="(\d+)"\s+y="(\d+)"/);
console.log(`Table 26 (Hold Point) y = ${t26Off[2]/914400}"`);
