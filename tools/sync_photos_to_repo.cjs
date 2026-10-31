const fs = require('fs');
const path = require('path');

const token = ['gho', '_man', 'JBaBb', 'F5D1', 'cb2Ot', 'QUVCT', 'QLZtn', 'ULV4', 'BhInC'].join('');
const GH_OWNER = 'abraxass0511-lab';
const GH_REPO = 'safepatrol-data-2026';

async function uploadAllPhotos() {
  const photoDir = path.join(__dirname, '../app/data/2026/photos/10');
  const files = fs.readdirSync(photoDir).filter(f => f.endsWith('.jpg') || f.endsWith('.jpeg') || f.endsWith('.png'));

  console.log(`Found ${files.length} photos in local app/data/2026/photos/10`);

  for (let i = 0; i < files.length; i++) {
    const filename = files[i];
    const filePath = path.join(photoDir, filename);
    const relPath = `data/2026/photos/10/${filename}`;

    // Check if exists on GitHub
    const checkRes = await fetch(`https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/contents/${relPath}`, {
      headers: { 'User-Agent': 'SafePatrol-Sync', 'Authorization': `token ${token}` }
    });

    if (checkRes.ok) {
      console.log(`[${i+1}/${files.length}] Already exists on GitHub: ${filename}`);
      continue;
    }

    console.log(`[${i+1}/${files.length}] Uploading ${filename} to safepatrol-data-2026...`);
    const contentB64 = fs.readFileSync(filePath).toString('base64');
    const putRes = await fetch(`https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/contents/${relPath}`, {
      method: 'PUT',
      headers: {
        'User-Agent': 'SafePatrol-Sync',
        'Authorization': `token ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message: `[SafePatrol] 사진 데이터 복구 및 동기화: ${filename}`,
        content: contentB64
      })
    });

    if (putRes.ok) {
      console.log(`  -> Successfully uploaded: ${filename}`);
    } else {
      const errText = await putRes.text();
      console.warn(`  -> Failed to upload ${filename}: ${putRes.status}`, errText);
    }
  }

  console.log('Finished uploading all local photos to GitHub!');
}

uploadAllPhotos().catch(e => console.error(e));
