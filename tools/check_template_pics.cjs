const fs = require('fs');

['tools/dl_slide1.xml', 'tools/raw_slide1.xml'].forEach(file => {
  if (!fs.existsSync(file)) return;
  const xml = fs.readFileSync(file, 'utf8');
  const pics = xml.split('<p:pic>');
  console.log(`Number of pics in ${file}:`, pics.length - 1);
  pics.slice(1).forEach((p, i) => {
    const xfrm = p.match(/<a:off x="(\d+)" y="(\d+)"\/>\s*<a:ext cx="(\d+)" cy="(\d+)"\/>/);
    if (xfrm) {
      const x = (xfrm[1] / 914400).toFixed(3);
      const y = (xfrm[2] / 914400).toFixed(3);
      const w = (xfrm[3] / 914400).toFixed(3);
      const h = (xfrm[4] / 914400).toFixed(3);
      console.log(`Pic ${i + 1}: x=${x}, y=${y}, w=${w}, h=${h}`);
    }
  });
});
