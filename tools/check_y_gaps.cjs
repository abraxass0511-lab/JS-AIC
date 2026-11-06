const fs = require("fs");
const path = require("path");

const xml = fs.readFileSync(path.join(__dirname, "template_extracted", "ppt", "slides", "slide1.xml"), "utf8");

// Search all borders and lines between y = 1.8 and 2.3
console.log("=== CHECKING TABLE 2 ROWS ===");
const t2 = xml.match(/name="표 2"[\s\S]*?<a:tbl>[\s\S]*?<\/a:tbl>/)[0];
const trs = [...t2.matchAll(/<a:tr\s+h="(\d+)">([\s\S]*?)<\/a:tr>/g)];
let cy = 1.1246;
trs.forEach((tr, i) => {
  const h = +tr[1] / 914400;
  console.log(`TR ${i}: y=${cy.toFixed(4)}, h=${h.toFixed(4)}, bottom=${(cy + h).toFixed(4)}`);
  // check borders in this tr
  const bLns = [...tr[2].matchAll(/<a:lnB[^>]*>([\s\S]*?)<\/a:lnB>/g)];
  console.log(`  lnB count: ${bLns.length}, has solidFill: ${bLns.some(b => b[0].includes("solidFill"))}`);
  cy += h;
});

console.log("=== CHECKING TABLE 26 & 24 POS ===");
const t26 = xml.match(/name="표 26"[\s\S]*?<a:off\s+x="(\d+)"\s+y="(\d+)"\/>\s*<a:ext\s+cx="(\d+)"\s+cy="(\d+)"\/>/);
console.log("표 26:", +t26[2]/914400);
const t24 = xml.match(/name="표 24"[\s\S]*?<a:off\s+x="(\d+)"\s+y="(\d+)"\/>\s*<a:ext\s+cx="(\d+)"\s+cy="(\d+)"\/>/);
console.log("표 24:", +t24[2]/914400);

// Also check shapes: is there a shape between 1.9 and 2.3?
const sps = [...xml.matchAll(/<p:sp>[\s\S]*?<p:cNvPr[^>]*name="([^"]*)"[\s\S]*?<a:off\s+x="(\d+)"\s+y="(\d+)"\/>\s*<a:ext\s+cx="(\d+)"\s+cy="(\d+)"\/>[\s\S]*?<\/p:sp>/g)];
sps.forEach(s => {
  console.log(`Shape ${s[1]}: y=${(+s[3]/914400).toFixed(4)}, h=${(+s[5]/914400).toFixed(4)}`);
});
