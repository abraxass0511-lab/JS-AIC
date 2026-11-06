const JSZip = require("jszip");
const fs = require("fs");

async function check() {
  const data = fs.readFileSync("tools/prod_generated_sheet.pptx");
  const zip = await JSZip.loadAsync(data);
  const xml = await zip.file("ppt/slides/slide1.xml").async("text");

  const runs = [...xml.matchAll(/<a:rPr([^>]*)>[\s\S]*?<a:t>([^<]*)<\/a:t>/g)];
  runs.filter(r => r[2].includes("떨어짐") || r[2].includes("추락") || r[2].includes("중부적합") || r[2].includes("부적합")).forEach(r => {
    const sz = r[1].match(/sz="(\d+)"/);
    console.log(`"${r[2]}": sz=${sz ? sz[1]/100 + "pt" : "default"}`);
  });
}

check().catch(console.error);
