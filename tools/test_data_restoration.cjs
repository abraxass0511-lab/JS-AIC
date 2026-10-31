const fs = require('fs');
const path = require('path');

// Mock browser globals
globalThis.window = {
  SAFEPATROL_CONFIG: {
    workerUrl: 'https://safepatrol-relay.abraxass0511.workers.dev'
  }
};
const storeStorage = new Map();
globalThis.localStorage = {
  getItem: (k) => storeStorage.get(k) || null,
  setItem: (k, v) => storeStorage.set(k, String(v)),
  removeItem: (k) => storeStorage.delete(k),
  get length() { return storeStorage.size; },
  key: (i) => Array.from(storeStorage.keys())[i]
};

globalThis.indexedDB = {
  open: () => {
    const req = { onupgradeneeded: null, onsuccess: null, onerror: null, result: null };
    setTimeout(() => {
      const db = {
        transaction: () => {
          const t = {
            oncomplete: null,
            onerror: null,
            objectStore: () => {
              const makeReq = (res = null) => {
                const r = { onsuccess: null, onerror: null, result: res };
                setTimeout(() => {
                  if (r.onsuccess) r.onsuccess({ target: r });
                  if (t.oncomplete) t.oncomplete();
                }, 1);
                return r;
              };
              return {
                get: () => makeReq(null),
                put: () => makeReq(),
                delete: () => makeReq(),
                clear: () => makeReq(),
                getAllKeys: () => makeReq([])
              };
            }
          };
          return t;
        }
      };
      req.result = db;
      if (req.onsuccess) req.onsuccess({ target: req });
    }, 2);
    return req;
  }
};

const origFetch = globalThis.fetch;
globalThis.fetch = async (url, opt) => {
  if (typeof url === 'string' && url.startsWith('data/')) {
    const localPath = path.join(__dirname, '..', 'app', url);
    if (fs.existsSync(localPath)) {
      const content = fs.readFileSync(localPath, 'utf8');
      return new Response(content, { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
  }
  return origFetch(url, opt);
};

// Set login PIN as admin
globalThis.localStorage.setItem('sp_pin', '000000');

async function testRestore() {
  console.log('=== Test: Data Restoration & listAll verification ===');

  // Dynamically import store
  const storeModule = await import('../app/js/store.js?v=' + Date.now());
  const store = storeModule.store;

  await store.init();
  console.log('Store initialized. User:', store.user ? store.user.name : 'none');

  console.log('\n--- 1. Testing store.listAll() ---');
  const allRecs = await store.listAll(true);
  console.log('Total records returned by listAll():', allRecs.length);

  if (allRecs.length < 50) {
    throw new Error(`Expected at least 50 records, but got ${allRecs.length}`);
  }

  console.log('\n--- 2. Testing store.listMonth("2026-10") ---');
  const octRecs = await store.listMonth('2026-10', true);
  console.log('Total records in 2026-10:', octRecs.length);

  if (octRecs.length < 50) {
    throw new Error(`Expected at least 50 records in 2026-10, but got ${octRecs.length}`);
  }

  console.log('\n--- 3. Testing store.listPeriod("2026-10-01", "2026-11-01") ---');
  const periodRecs = await store.listPeriod('2026-10-01', '2026-11-01', true);
  console.log('Total records in period:', periodRecs.length);

  if (periodRecs.length < 50) {
    throw new Error(`Expected at least 50 records in period, but got ${periodRecs.length}`);
  }

  // Check unique sites
  const sites = Array.from(new Set(allRecs.map(r => r.site)));
  console.log('Restored Sites:', sites);

  // Check specific recent records
  const sampleContents = [
    '말비계 설치범위가 모서리 구간에서 그쳐',
    '보 상부작업을 승인받지 않고',
    '통로 바닥에 전선이 정리되지 않아',
    '수평이 맞지 않음'
  ];

  for (const snippet of sampleContents) {
    const found = allRecs.some(r => (r.content || '').includes(snippet));
    if (!found) {
      throw new Error(`Missing expected record with snippet: "${snippet}"`);
    }
    console.log(`Verified existence of: "${snippet}"`);
  }

  console.log('\n✅ ALL 50 RECORDS CONFIRMED ACTIVE AND HEALTHY!');
}

testRestore().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
