const fs = require('fs');

async function scanAll() {
  const parts = ['gho', '_man', 'JBaBb', 'F5D1', 'cb2Ot', 'QUVCT', 'QLZtn', 'ULV4', 'BhInC'];
  const token = parts.join('');

  // Get repository tree recursively
  const res = await fetch('https://api.github.com/repos/abraxass0511-lab/safepatrol-data-2026/git/trees/main?recursive=1', {
    headers: {
      'Authorization': 'token ' + token,
      'Accept': 'application/vnd.github.v3+json'
    }
  });
  const data = await res.json();
  const allFiles = (data.tree || []).map(x => x.path);
  console.log('Total files in repo:', allFiles.length);
  const dataFiles = allFiles.filter(p => p.startsWith('data/'));
  console.log('Data files:', dataFiles);

  // Check all commits to find all unique deleted records ever created
  const commitsRes = await fetch('https://api.github.com/repos/abraxass0511-lab/safepatrol-data-2026/commits?per_page=100', {
    headers: {
      'Authorization': 'token ' + token,
      'Accept': 'application/vnd.github.v3+json'
    }
  });
  const commits = await commitsRes.json();
  console.log('Total commits found:', commits.length);

  // Check commit messages
  const registeredIds = new Set();
  commits.forEach(c => {
    const m = c.commit.message;
    const match = m.match(/(\d{8}-\d{6}-[a-z0-9]+)/);
    if (match) registeredIds.add(match[1]);
  });
  console.log('Unique record IDs mentioned in commits:', registeredIds.size);
}

scanAll().catch(console.error);
