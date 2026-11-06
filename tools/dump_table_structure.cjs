const fs = require("fs");
const path = require("path");

const xml = fs.readFileSync(path.join(__dirname, "template_extracted", "ppt", "slides", "slide1.xml"), "utf8");

function inspectTable(tableName) {
  const m = xml.match(new RegExp(`<p:graphicFrame>[\\s\\S]*?<p:cNvPr[^>]*name="${tableName}"[\\s\\S]*?<\\/p:graphicFrame>`));
  if (!m) return console.log(tableName, "not found");
  const block = m[0];
  const offM = block.match(/<a:off\s+x="(\d+)"\s+y="(\d+)"\/>/);
  const extM = block.match(/<a:ext\s+cx="(\d+)"\s+cy="(\d+)"\/>/);
  console.log(`\n=== ${tableName} ===`);
  console.log(`x: ${(offM[1]/914400).toFixed(4)}, y: ${(offM[2]/914400).toFixed(4)}, w: ${(extM[1]/914400).toFixed(4)}, h: ${(extM[2]/914400).toFixed(4)}`);
  
  const cols = [...block.matchAll(/<a:gridCol\s+w="(\d+)"/g)].map(m => (+m[1]/914400).toFixed(4));
  console.log("Cols:", cols);
  
  const rows = [...block.matchAll(/<a:tr\s+h="(\d+)"/g)].map(m => (+m[1]/914400).toFixed(4));
  console.log("Rows:", rows);
}

inspectTable("표 2");
inspectTable("표 17");
inspectTable("표 19");
inspectTable("표 26");
inspectTable("표 24");
inspectTable("표 22");
inspectTable("표 25");
inspectTable("표 23");

