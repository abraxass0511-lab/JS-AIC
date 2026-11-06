const fs = require("fs");
const path = require("path");

const xmlPath = path.join(__dirname, "template_extracted", "ppt", "slides", "slide1.xml");
const xml = fs.readFileSync(xmlPath, "utf8");

console.log("=== SLIDE 1 SHAPES (<p:sp>) ===");
const spMatches = [...xml.matchAll(/<p:sp>([\s\S]*?)<\/p:sp>/g)];
spMatches.forEach((m, i) => {
  const nameMatch = m[1].match(/name="([^"]+)"/);
  const name = nameMatch ? nameMatch[1] : `sp_${i}`;
  const xfrmMatch = m[1].match(/<a:off\s+x="(\d+)"\s+y="(\d+)"\/>\s*<a:ext\s+cx="(\d+)"\s+cy="(\d+)"\/>/);
  const pos = xfrmMatch ? `x=${(+xfrmMatch[1]/914400).toFixed(3)}", y=${(+xfrmMatch[2]/914400).toFixed(3)}", w=${(+xfrmMatch[3]/914400).toFixed(3)}", h=${(+xfrmMatch[4]/914400).toFixed(3)}"` : "no pos";
  const texts = [...m[1].matchAll(/<a:t>([^<]*)<\/a:t>/g)].map(t => t[1]);
  const fillMatch = m[1].match(/<a:solidFill>([\s\S]*?)<\/a:solidFill>/);
  const fill = fillMatch ? fillMatch[1].replace(/\s+/g, " ") : "no solidFill";
  console.log(`[Shape #${i+1}] "${name}": ${pos} | fill: ${fill} | text: "${texts.join(" / ")}"`);
});

console.log("\n=== TABLE 2 R0C0 EXACT XML ===");
const t2Match = xml.match(/name="표 2"[\s\S]*?<\/p:graphicFrame>/);
if (t2Match) {
  const r0c0Match = t2Match[0].match(/<a:tr[\s\S]*?<a:tc[\s\S]*?<\/a:tc>/);
  console.log(r0c0Match ? r0c0Match[0] : "none");
}
for (let i = 0; i < 6; i++) {
  const m = gfMatches[i];
  const nameMatch = m[1].match(/name="([^"]+)"/);
  const name = nameMatch ? nameMatch[1] : `gf_${i}`;
  const xfrmMatch = m[1].match(/<a:off\s+x="(\d+)"\s+y="(\d+)"\/>\s*<a:ext\s+cx="(\d+)"\s+cy="(\d+)"\/>/);
  const pos = xfrmMatch ? `x=${(+xfrmMatch[1]/914400).toFixed(3)}", y=${(+xfrmMatch[2]/914400).toFixed(3)}", w=${(+xfrmMatch[3]/914400).toFixed(3)}", h=${(+xfrmMatch[4]/914400).toFixed(3)}"` : "no pos";
  
  const colMatches = [...m[1].matchAll(/<a:gridCol\s+w="(\d+)"\/>/g)];
  const cols = colMatches.map(c => (+c[1]/914400).toFixed(3) + '"').join(", ");

  const trMatches = [...m[1].matchAll(/<a:tr\s+h="(\d+)">([\s\S]*?)<\/a:tr>/g)];
  console.log(`\n======================================================`);
  console.log(`[Table #${i+1}] "${name}": ${pos}`);
  console.log(`  Cols (${colMatches.length}): [${cols}]`);
  console.log(`  Rows (${trMatches.length}):`);
  trMatches.forEach((tr, rIdx) => {
    const rowH = (+tr[1]/914400).toFixed(3);
    const tcMatches = [...tr[2].matchAll(/<a:tc([\s\S]*?)<\/a:tc>/g)];
    tcMatches.forEach((tc, cIdx) => {
      const tcXml = tc[0];
      const texts = [...tcXml.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map(t => t[1]).join("");
      const fillMatch = tcXml.match(/<a:tcPr[\s\S]*?<\/a:tcPr>/);
      const fillStr = fillMatch ? fillMatch[0].replace(/\s+/g, " ") : "";
      const runs = [...tcXml.matchAll(/<a:rPr([^>]*)>[\s\S]*?<a:t>([^<]*)<\/a:t>/g)].map(r => {
        const sz = r[1].match(/sz="(\d+)"/);
        const b = r[1].match(/b="1"/);
        const col = r[1].match(/val="([A-Fa-f0-9]{6})"/);
        return `"${r[2]}" (${sz ? +sz[1]/100 + "pt" : "default"}${b ? " bold" : ""}${col ? " #" + col[1] : ""})`;
      }).join(", ");
      console.log(`    r${rIdx}c${cIdx} (h=${rowH}"): text="${texts}" runs=[${runs}]`);
      console.log(`      tcPr: ${fillStr.slice(0, 200)}`);
    });
  });
}
