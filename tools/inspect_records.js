import fs from 'fs';

const data = JSON.parse(fs.readFileSync('app/data/2026/index/2026-10.json', 'utf8'));
const deleted = new Set(data.deletedIds || []);
const recs = data.records.filter(r => !deleted.has(r.id));
console.log('Total active records:', recs.length);
recs.forEach((r, i) => {
  console.log(`[${i+1}] ID: ${r.id}`);
  console.log(`     Site: ${r.site}`);
  console.log(`     Content: ${r.content}`);
  console.log(`     Location: ${r.location}`);
  console.log(`     WorkGroup: ${r.workGroup}`);
  console.log(`     WorkName: ${r.workName}`);
  console.log(`     WorkMethod: ${r.workMethod}`);
  console.log(`     Type: ${r.type}`);
  console.log(`     Agent: ${r.agent}`);
  console.log('--------------------------------------------------');
});
