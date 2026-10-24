import fs from 'fs';
import path from 'path';

const RELAY_BASE = 'https://safepatrol-relay.abraxass0511.workers.dev';
const PIN = '000000';

async function uploadFile(remotePath, localPath, message) {
  const fileUrl = `${RELAY_BASE}/file?path=${encodeURIComponent(remotePath)}`;
  const getRes = await fetch(fileUrl, { headers: { 'X-PIN': PIN } });
  let sha = null;
  if (getRes.ok) {
    const meta = await getRes.json();
    sha = meta.sha;
  }
  const content = fs.readFileSync(localPath, 'utf8');
  const b64 = Buffer.from(content).toString('base64');
  const body = { message, content, ...(sha ? { sha } : {}) };
  const putRes = await fetch(fileUrl, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'X-PIN': PIN },
    body: JSON.stringify(body)
  });
  console.log(`Uploaded ${remotePath}: [${putRes.status}]`);
}

async function main() {
  await uploadFile(
    'data/2026/index/2026-10.json',
    'app/data/2026/index/2026-10.json',
    'Synchronize 2026-10.json with 9x9 standard agent hierarchy'
  );

  const recDir = 'app/data/2026/records/10';
  const files = fs.readdirSync(recDir).filter(f => f.endsWith('.json'));
  for (const f of files) {
    await uploadFile(
      `data/2026/records/10/${f}`,
      path.join(recDir, f),
      `Synchronize record ${f} with 9x9 standard agent hierarchy`
    );
  }
}

main().catch(console.error);
