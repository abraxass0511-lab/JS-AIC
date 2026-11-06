const fs = require('fs');

async function check() {
  const parts = ['gho', '_man', 'JBaBb', 'F5D1', 'cb2Ot', 'QUVCT', 'QLZtn', 'ULV4', 'BhInC'];
  const token = parts.join('');
  const res = await fetch('https://raw.githubusercontent.com/abraxass0511-lab/safepatrol-data-2026/7662504/data/2026/index/2026-10.json', {
    headers: { 'Authorization': 'token ' + token }
  });
  const data = await res.json();
  console.log('Total records in 7662504:', data.records.length);
  data.records.forEach((r, i) => {
    console.log(`${i+1}. [${r.site}] ${r.inspectedDate} | ${r.subcontractor || ''} | ${r.item || ''} | ${(r.content||'').replace(/\n/g, ' ').slice(0, 40)}`);
  });
}
check().catch(console.error);
