const sharp = require('sharp');
const fs = require('fs');

async function testCover() {
  const p1 = 'app/samples/horizontal_photo1.jpg';
  const p2 = 'app/samples/horizontal_photo2.jpg';

  // Target aspect ratio: 4.080 / 4.810 = 0.8482 (width: 408, height: 481)
  const targetW = 408;
  const targetH = 481;

  if (fs.existsSync(p1)) {
    const m1 = await sharp(p1).metadata();
    console.log('P1 dimensions:', m1.width, m1.height, 'ratio:', (m1.width / m1.height).toFixed(3));
    await sharp(p1)
      .resize(targetW, targetH, { fit: 'cover', position: 'center' })
      .toFile('tools/test_cover_p1.jpg');
    console.log('Saved tools/test_cover_p1.jpg');
  }

  if (fs.existsSync(p2)) {
    const m2 = await sharp(p2).metadata();
    console.log('P2 dimensions:', m2.width, m2.height, 'ratio:', (m2.width / m2.height).toFixed(3));
    await sharp(p2)
      .resize(targetW, targetH, { fit: 'cover', position: 'center' })
      .toFile('tools/test_cover_p2.jpg');
    console.log('Saved tools/test_cover_p2.jpg');
  }
}

testCover().catch(console.error);
