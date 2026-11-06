const sharp = require('sharp');
const imgPath = 'C:/Users/YS/.gemini/antigravity-ide/brain/c3ddbf24-c3a5-4c0c-ab10-80ecb437b472/.user_uploaded/media_1793476065268.png';

sharp(imgPath)
  .raw()
  .toBuffer({ resolveWithObject: true })
  .then(({ data, info }) => {
    console.log('Image 2 info:', info);
    const colors = {};
    let totalR = 0, totalG = 0, totalB = 0, totalCount = 0;
    for (let y = 0; y < info.height; y++) {
      for (let x = 0; x < info.width; x++) {
        const idx = (y * info.width + x) * info.channels;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];
        // Look at the reddish banner
        if (r > 100 && r > g + 30 && r > b + 30) {
          const hex = ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase();
          colors[hex] = (colors[hex] || 0) + 1;
          totalR += r;
          totalG += g;
          totalB += b;
          totalCount++;
        }
      }
    }
    const sorted = Object.entries(colors).sort((a,b) => b[1] - a[1]);
    console.log('Top 15 reddish colors in Image 2:');
    sorted.slice(0, 15).forEach(([hex, count]) => {
      console.log(hex, count);
    });

    if (totalCount > 0) {
      const avgR = Math.round(totalR / totalCount);
      const avgG = Math.round(totalG / totalCount);
      const avgB = Math.round(totalB / totalCount);
      const avgHex = ((1 << 24) + (avgR << 16) + (avgG << 8) + avgB).toString(16).slice(1).toUpperCase();
      console.log('Average Red Banner Color:', avgHex, 'RGB(' + avgR + ', ' + avgG + ', ' + avgB + ')');
    }
  });
