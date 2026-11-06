const fs = require('fs');
const xml = fs.readFileSync('tools/raw_slide1.xml', 'utf8');

const gfs = [...xml.matchAll(/<p:graphicFrame>([\s\S]*?)<\/p:graphicFrame>/g)];
gfs.forEach((g, idx) => {
  const name = (g[1].match(/<p:cNvPr[^>]*name="([^"]*)"/) || [])[1];
  const off = g[1].match(/<a:off\s+x="(\d+)"\s+y="(\d+)"/);
  const ext = g[1].match(/<a:ext\s+cx="(\d+)"\s+cy="(\d+)"/);
  const x = (parseInt(off[1])/914400).toFixed(3);
  const y = (parseInt(off[2])/914400).toFixed(3);
  const w = (parseInt(ext[1])/914400).toFixed(3);
  const h = (parseInt(ext[2])/914400).toFixed(3);
  console.log(`[GF #${idx+1}] "${name}": x=${x}", y=${y}", w=${w}", h=${h}"`);
});
