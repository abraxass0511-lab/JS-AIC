const fs = require("fs");
const path = require("path");

const xml = fs.readFileSync(path.join(__dirname, "template_extracted", "ppt", "slides", "slide1.xml"), "utf8");

const regex = /<p:sp>[\s\S]*?<p:cNvPr[^>]*name="([^"]*)"[\s\S]*?<a:off\s+x="(\d+)"\s+y="(\d+)"\/>\s*<a:ext\s+cx="(\d+)"\s+cy="(\d+)"\/>[\s\S]*?<\/p:sp>/g;
let m;
console.log("=== SHAPES ===");
while ((m = regex.exec(xml)) !== null) {
  console.log(`${m[1]}: x=${(+m[2]/914400).toFixed(4)}, y=${(+m[3]/914400).toFixed(4)}, w=${(+m[4]/914400).toFixed(4)}, h=${(+m[5]/914400).toFixed(4)}, bottom=${((+m[2]+ +m[4])/914400).toFixed(4)}`);
}

function dumpTable(name) {
  const m = xml.match(new RegExp(`<p:graphicFrame>[\\s\\S]*?<p:cNvPr[^>]*name="${name}"[\\s\\S]*?<\\/p:graphicFrame>`));
  if (!m) return console.log(name, "not found");
  const texts = [];
  const tRegex = /<a:t>([^<]*)<\/a:t>/g;
  let tm;
  while ((tm = tRegex.exec(m[0])) !== null) {
    texts.push(tm[1]);
  }
  console.log(`=== ${name} ===\n`, texts.join(" | "));
}
dumpTable("표 2");
dumpTable("표 26");
dumpTable("표 24");
dumpTable("표 22");
dumpTable("표 25");
dumpTable("표 23");

