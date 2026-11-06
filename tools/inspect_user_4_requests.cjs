const fs = require("fs");
const path = require("path");

const xml = fs.readFileSync(path.join(__dirname, "template_extracted", "ppt", "slides", "slide1.xml"), "utf8");

console.log("=== 1. 중부적합 COLOR AND TEXT ===");
const idx = xml.indexOf("중부적합");
if (idx !== -1) {
  const pStart = xml.lastIndexOf("<a:p>", idx);
  const pEnd = xml.indexOf("</a:p>", idx) + 6;
  console.log(xml.substring(pStart, pEnd));
}


console.log("\n=== 2. 관련기준 TABLE STRUCTURE ===");
const t19M = xml.match(/<p:graphicFrame>[\s\S]*?<p:cNvPr[^>]*name="표 19"[\s\S]*?<\/p:graphicFrame>/);
if (t19M) {
  console.log(t19M[0]);
}


console.log("\n=== 3. HOLD POINT, 발생원인 vs 부적합 개요 ===");
// Check 표 2, 표 26, 표 24, 표 22
function getTablePos(name) {
  const m = xml.match(new RegExp(`<p:graphicFrame>[\\s\\S]*?<p:cNvPr[^>]*name="${name}"[\\s\\S]*?<a:off\\s+x="(\\d+)"\\s+y="(\\d+)"\\/>\\s*<a:ext\\s+cx="(\\d+)"\\s+cy="(\\d+)"\\/>`));
  if (!m) return null;
  const x = +m[1]/914400;
  const y = +m[2]/914400;
  const w = +m[3]/914400;
  const h = +m[4]/914400;
  return { name, x: x.toFixed(4), y: y.toFixed(4), w: w.toFixed(4), h: h.toFixed(4), bottom: (y+h).toFixed(4) };
}
console.log("표 2:", getTablePos("표 2"));
console.log("표 26 (Hold Point):", getTablePos("표 26"));
console.log("표 24 (발생원인 헤더):", getTablePos("표 24"));
console.log("표 22 (발생원인 본문):", getTablePos("표 22"));

console.log("\n=== 4. 의견 TEXT BOX IN 표 22 ===");
const t22M = xml.match(/<p:graphicFrame>[\s\S]*?<p:cNvPr[^>]*name="표 22"[\s\S]*?<\/p:graphicFrame>/);
if (t22M) {
  // find cells with 의견
  const opCell = t22M[0].match(/<a:tc[\s\S]*?의견[\s\S]*?<\/a:tc>/);
  if (opCell) {
    console.log("Cell XML snippet:\n", opCell[0].substring(0, 1500));
  }
}
