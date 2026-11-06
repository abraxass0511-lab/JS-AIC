const fs = require("fs");
const path = require("path");

const xml = fs.readFileSync(path.join(__dirname, "template_extracted", "ppt", "slides", "slide1.xml"), "utf8");

function getPos(name) {
  const m = xml.match(new RegExp(`name="${name}"[\\s\\S]*?<a:off\\s+x="(\\d+)"\\s+y="(\\d+)"\\/>\\s*<a:ext\\s+cx="(\\d+)"\\s+cy="(\\d+)"\\/>`));
  if (!m) return null;
  const x = (+m[1]/914400);
  const y = (+m[2]/914400);
  const w = (+m[3]/914400);
  const h = (+m[4]/914400);
  return { name, x: x.toFixed(4), y: y.toFixed(4), w: w.toFixed(4), h: h.toFixed(4), bottom: (y + h).toFixed(4) };
}

// In 표 2, what is the height of row 0 (부적합 개요 header) and row 1 (부적합 내용)?
const t2 = xml.match(/name="표 2"[\s\S]*?<a:tbl>[\s\S]*?<\/a:tbl>/)[0];
const rows = [...t2.matchAll(/<a:tr\s+h="(\d+)">([\s\S]*?)<\/a:tr>/g)];
const t2Pos = getPos("표 2");
console.log("표 2 top y:", t2Pos.y);
let currentY = +t2Pos.y;
rows.forEach((r, idx) => {
  const h = +r[1]/914400;
  console.log(`표 2 row ${idx}: h=${h.toFixed(4)}, startY=${currentY.toFixed(4)}, endY=${(currentY + h).toFixed(4)}`);
  currentY += h;
});

const t26 = getPos("표 26");
console.log("\n표 26 (Hold Point 위반):", t26);

const t24 = getPos("표 24");
console.log("표 24 (발생원인 헤더):", t24);

console.log("\n--- GAP ANALYSIS ---");
console.log("Gap between row 1 endY and 표 26 top:", (+t26.y - 1.9366).toFixed(4), "inches");
