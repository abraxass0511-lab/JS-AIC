const sharp = require('sharp');
const path = 'C:\\Users\\YS\\.gemini\\antigravity-ide\\brain\\c3ddbf24-c3a5-4c0c-ab10-80ecb437b472\\.user_uploaded\\media_1793476065268.png';

async function analyze() {
  const image = sharp(path);
  const metadata = await image.metadata();
  console.log('Image dimensions:', metadata.width, metadata.height);

  const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });
  // Find reddish pixels: R > 100, R > G + 30, R > B + 30
  const colorCounts = {};
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const idx = (y * info.width + x) * info.channels;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];

      // Red banner check: high R compared to G and B
      if (r > 120 && r > g + 40 && r > b + 40) {
        // Group by rounding to nearest 4
        const rR = Math.round(r / 4) * 4;
        const rG = Math.round(g / 4) * 4;
        const rB = Math.round(b / 4) * 4;
        const key = `${rR},${rG},${rB}`;
        colorCounts[key] = (colorCounts[key] || 0) + 1;
      }
    }
  }

  let sumR = 0, sumG = 0, sumB = 0, total = 0;
  for (let y = 15; y < 55; y++) {
    for (let x = 20; x < info.width - 20; x++) {
      const idx = (y * info.width + x) * info.channels;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      if (r > 120 && r > g + 30 && r > b + 30) {
        sumR += r;
        sumG += g;
        sumB += b;
        total++;
      }
    }
  }
  const avgR = Math.round(sumR / total);
  const avgG = Math.round(sumG / total);
  const avgB = Math.round(sumB / total);
  const hex = ((1 << 24) + (avgR << 16) + (avgG << 8) + avgB).toString(16).slice(1).toUpperCase();
  console.log(`Average banner RGB: (${avgR}, ${avgG}, ${avgB}) -> #${hex}`);
}

analyze().catch(console.error);
