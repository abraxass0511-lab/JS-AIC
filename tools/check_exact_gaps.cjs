const fs = require("fs");
const path = require("path");

const xmlPath = path.join(__dirname, "template_extracted", "ppt", "slides", "slide1.xml");
const xml = fs.readFileSync(xmlPath, "utf8");

function getPos(name) {
  const m = xml.match(new RegExp(`name="${name}"[\\s\\S]*?<a:off\\s+x="(\\d+)"\\s+y="(\\d+)"\\/>\\s*<a:ext\\s+cx="(\\d+)"\\s+cy="(\\d+)"\\/>`));
  if (!m) return null;
  const x = (+m[1]/914400);
  const y = (+m[2]/914400);
  const w = (+m[3]/914400);
  const h = (+m[4]/914400);
  return { name, x: x.toFixed(4), y: y.toFixed(4), w: w.toFixed(4), h: h.toFixed(4), bottom: (y + h).toFixed(4) };
}

const t24 = getPos("표 24");
const t22 = getPos("표 22");
const t25 = getPos("표 25");
const t23 = getPos("표 23");

console.log("표 24 (발생원인 헤더):", t24);
console.log("표 22 (발생원인 본문 & 점검단 제안):", t22);
console.log("표 25 (개선대책 헤더):", t25);
console.log("표 23 (개선대책 본문 & PM 판정결과):", t23);

console.log("\n--- GAP ANALYSIS ---");
console.log("Gap between 표 24 bottom and 표 22 top:", (+t22.y - +t24.bottom).toFixed(4), "inches");
console.log("Gap between 표 22 bottom and 표 25 top:", (+t25.y - +t22.bottom).toFixed(4), "inches");
console.log("Gap between 표 25 bottom and 표 23 top:", (+t23.y - +t25.bottom).toFixed(4), "inches");
