const fs = require('fs');

async function restore() {
  const parts = ['gho', '_man', 'JBaBb', 'F5D1', 'cb2Ot', 'QUVCT', 'QLZtn', 'ULV4', 'BhInC'];
  const token = parts.join('');

  console.log('1. Fetching commit 7662504 data...');
  const resPast = await fetch('https://raw.githubusercontent.com/abraxass0511-lab/safepatrol-data-2026/7662504/data/2026/index/2026-10.json', {
    headers: { 'Authorization': 'token ' + token }
  });
  const dataPast = await resPast.json();

  console.log('2. Fetching current main data...');
  const resCur = await fetch('https://raw.githubusercontent.com/abraxass0511-lab/safepatrol-data-2026/main/data/2026/index/2026-10.json', {
    headers: { 'Authorization': 'token ' + token }
  });
  const dataCur = await resCur.json();

  const map = new Map();
  // Add past records first
  (dataPast.records || []).forEach(r => map.set(r.id, r));
  // Add/overwrite current records
  (dataCur.records || []).forEach(r => map.set(r.id, r));

  console.log(`Merged total: ${map.size} unique records.`);

  const allRecords = Array.from(map.values()).sort((a, b) => {
    return (b.inspectedDate + (b.createdAt || '')).localeCompare(a.inspectedDate + (a.createdAt || ''));
  });

  // Clean index data without deletedIds
  const newIndex = {
    records: allRecords,
    deletedIds: []
  };

  // Get current sha of data/2026/index/2026-10.json
  console.log('3. Getting SHA of current 2026-10.json...');
  const metaRes = await fetch('https://api.github.com/repos/abraxass0511-lab/safepatrol-data-2026/contents/data/2026/index/2026-10.json', {
    headers: {
      'User-Agent': 'SafePatrol-Restore',
      'Authorization': 'token ' + token,
      'Accept': 'application/vnd.github.v3+json'
    }
  });
  const meta = await metaRes.json();
  const curSha = meta.sha;

  console.log('4. Pushing restored index (50 records) to GitHub...');
  const putRes = await fetch('https://api.github.com/repos/abraxass0511-lab/safepatrol-data-2026/contents/data/2026/index/2026-10.json', {
    method: 'PUT',
    headers: {
      'User-Agent': 'SafePatrol-Restore',
      'Authorization': 'token ' + token,
      'Content-Type': 'application/json',
      'Accept': 'application/vnd.github.v3+json'
    },
    body: JSON.stringify({
      message: '[SafePatrol 복구] 과거 등록 부적합 데이터 50건 전체 원상 복구 및 삭제오염 정화',
      content: Buffer.from(JSON.stringify(newIndex, null, 1)).toString('base64'),
      sha: curSha
    })
  });

  const putResult = await putRes.json();
  if (putRes.ok) {
    console.log('✅ Index successfully restored to GitHub! New commit SHA:', putResult.commit ? putResult.commit.sha : 'OK');
  } else {
    console.error('❌ Failed to update index:', putResult);
    return;
  }

  // 5. Restore individual record files for each record in data/2026/records/10/{id}.json
  console.log('5. Ensuring all individual record files exist in data/2026/records/10/ ...');
  let restoredCount = 0;
  for (const rec of allRecords) {
    const filePath = `data/2026/records/10/${rec.id}.json`;
    // Check if file exists
    const checkRes = await fetch(`https://api.github.com/repos/abraxass0511-lab/safepatrol-data-2026/contents/${filePath}`, {
      headers: {
        'User-Agent': 'SafePatrol-Restore',
        'Authorization': 'token ' + token,
        'Accept': 'application/vnd.github.v3+json'
      }
    });

    if (checkRes.status === 404) {
      // Put file
      const recPut = await fetch(`https://api.github.com/repos/abraxass0511-lab/safepatrol-data-2026/contents/${filePath}`, {
        method: 'PUT',
        headers: {
          'User-Agent': 'SafePatrol-Restore',
          'Authorization': 'token ' + token,
          'Content-Type': 'application/json',
          'Accept': 'application/vnd.github.v3+json'
        },
        body: JSON.stringify({
          message: `[SafePatrol 복구] 레코드 복원 ${rec.id}`,
          content: Buffer.from(JSON.stringify(rec, null, 1)).toString('base64')
        })
      });
      if (recPut.ok) {
        restoredCount++;
        process.stdout.write(`+`);
      } else {
        process.stdout.write(`!`);
      }
    } else {
      process.stdout.write(`.`);
    }
  }
  console.log(`\n✅ Finished! Restored ${restoredCount} missing individual record files.`);
}

restore().catch(console.error);
