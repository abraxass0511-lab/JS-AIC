const fs = require('fs');
const path = require('path');

const appJsPath = path.join(__dirname, '..', 'app', 'js', 'app.js');
let code = fs.readFileSync(appJsPath, 'utf8');

// 1. Check if site meta cache functions already exist
if (!code.includes('SITE_META_CACHE_KEY')) {
  const siteCacheCode = `
// ── 현장별 공정률/상품유형 캐시 (재진입 시 자동 적용) ──
const SITE_META_CACHE_KEY = 'sp_site_meta_cache';

function getSiteMetaCache() {
  try {
    const raw = localStorage.getItem(SITE_META_CACHE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    return {};
  }
}

function saveSiteMetaCache(siteName, progressRate, productType) {
  if (!siteName || !siteName.trim()) return;
  try {
    const cache = getSiteMetaCache();
    cache[siteName.trim()] = {
      progressRate: progressRate !== undefined && progressRate !== null && progressRate !== '' ? Number(progressRate) : 35,
      productType: productType || '공동주택',
      updatedAt: new Date().toISOString()
    };
    localStorage.setItem(SITE_META_CACHE_KEY, JSON.stringify(cache));
  } catch (e) {
    console.warn('saveSiteMetaCache error:', e);
  }
}

function handleSiteSelectionChange(siteName) {
  const name = (siteName || '').trim();
  const badge = document.getElementById('siteAppliedBadge');
  const lblProg = document.getElementById('lblPrevProgress');
  const lblProd = document.getElementById('lblPrevProduct');
  const txtProg = document.getElementById('txtProgressRate');
  const selProd = document.getElementById('selProductType');

  if (!name) {
    if (badge) badge.style.display = 'none';
    return;
  }

  // 1. 로컬 캐시 조회
  const cache = getSiteMetaCache();
  let meta = cache[name];

  // 2. 캐시에 없으면 기존 store.sites 조회
  if (!meta && typeof store !== 'undefined' && store && store.sites) {
    const found = store.sites.find(s => s.name === name);
    if (found && found.progress) {
      meta = {
        progressRate: parseFloat(found.progress) || 35,
        productType: found.productType || '공동주택'
      };
    }
  }

  // 3. 기존 records 에서 해당 현장의 최근 등록값 조회 (캐시 백필)
  if (!meta && typeof store !== 'undefined' && store && store.records && store.records.length) {
    const rec = [...store.records].reverse().find(r => r.site === name && (r.progressRate !== undefined || r.productType));
    if (rec) {
      meta = {
        progressRate: rec.progressRate !== undefined ? Number(rec.progressRate) : 35,
        productType: rec.productType || '공동주택'
      };
    }
  }

  if (meta) {
    if (txtProg && meta.progressRate !== undefined) txtProg.value = meta.progressRate;
    if (selProd && meta.productType) selProd.value = meta.productType;
    if (lblProg) lblProg.textContent = meta.progressRate ?? 35;
    if (lblProd) lblProd.textContent = meta.productType ?? '공동주택';
    if (badge) {
      badge.style.display = 'block';
    }
  } else {
    if (badge) badge.style.display = 'none';
  }
}

// ── 9×9단 패키지 연쇄 한정 선택기 (대분류 → 중분류 → 소분류) ──
let currentPkgMajor = '가시설';
let currentPkgMid = '비계';
let currentPkgMinor = '시스템비계';

function initPackage9x9Selector(agentTree) {
  const tree = agentTree || (typeof store !== 'undefined' && store && store.taxonomy9x9 && store.taxonomy9x9.agentTree);
  if (!tree) return;

  const majorContainer = document.getElementById('pkgMajorChips');
  const midContainer = document.getElementById('pkgMidChips');
  const minorContainer = document.getElementById('pkgMinorChips');
  const summaryLbl = document.getElementById('lblSelectedPackage');
  const majorLbl = document.getElementById('lblPkgMajorName');
  const midLbl = document.getElementById('lblPkgMidName');
  const btnReset = document.getElementById('btnResetPackage');

  if (!majorContainer || !midContainer || !minorContainer) return;

  function renderChips() {
    const majors = Object.keys(tree);
    if (!majors.includes(currentPkgMajor)) {
      currentPkgMajor = majors[0] || '가시설';
    }

    // 1. 대분류 칩 렌더링
    majorContainer.innerHTML = majors.map(maj => {
      const isActive = maj === currentPkgMajor;
      return \`<button type="button" class="pkg-chip major-chip \${isActive ? 'active major-active' : ''}" data-major="\${maj}">\${maj}</button>\`;
    }).join('');

    if (majorLbl) majorLbl.textContent = currentPkgMajor;

    // 2. 중분류 칩 렌더링 (대분류 선택에 따라 한정)
    const midMap = tree[currentPkgMajor] || {};
    const mids = Object.keys(midMap);
    if (!mids.includes(currentPkgMid)) {
      currentPkgMid = mids[0] || '';
    }

    midContainer.innerHTML = mids.map(mid => {
      const isActive = mid === currentPkgMid;
      return \`<button type="button" class="pkg-chip mid-chip \${isActive ? 'active mid-active' : ''}" data-mid="\${mid}">\${mid}</button>\`;
    }).join('');

    if (midLbl) midLbl.textContent = currentPkgMid || '선택';

    // 3. 소분류 칩 렌더링 (중분류 선택에 따라 한정)
    const minors = (midMap && currentPkgMid && midMap[currentPkgMid]) ? midMap[currentPkgMid] : [];
    if (minors.length > 0 && !minors.includes(currentPkgMinor)) {
      currentPkgMinor = minors[0];
    } else if (minors.length === 0) {
      currentPkgMinor = '';
    }

    minorContainer.innerHTML = minors.map(min => {
      const isActive = min === currentPkgMinor;
      return \`<button type="button" class="pkg-chip minor-chip \${isActive ? 'active minor-active' : ''}" data-minor="\${min}">\${min}</button>\`;
    }).join('');

    // 4. 상단 요약 뱃지 갱신
    if (summaryLbl) {
      summaryLbl.textContent = \`[\${currentPkgMajor}] › [\${currentPkgMid || '미지정'}] › [\${currentPkgMinor || '전체'}]\`;
    }

    // 5. 텍스트 입력창 및 hidden 필드 동기화
    syncPackageInputs();
  }

  function syncPackageInputs() {
    if (document.getElementById('txtAgentMajor')) document.getElementById('txtAgentMajor').value = currentPkgMajor;
    if (document.getElementById('txtAgentMid')) document.getElementById('txtAgentMid').value = currentPkgMid;
    if (document.getElementById('txtAgentMinor')) document.getElementById('txtAgentMinor').value = currentPkgMinor;

    if (document.getElementById('txtKind')) document.getElementById('txtKind').value = currentPkgMajor;
    if (document.getElementById('txtItem')) document.getElementById('txtItem').value = currentPkgMid;
    if (document.getElementById('txtAgent')) document.getElementById('txtAgent').value = currentPkgMinor;

    if (document.getElementById('txtMatrixArea')) document.getElementById('txtMatrixArea').value = currentPkgMajor;
    if (document.getElementById('txtMatrixTarget')) document.getElementById('txtMatrixTarget').value = currentPkgMid;
    if (document.getElementById('txtMatrixSpec')) document.getElementById('txtMatrixSpec').value = currentPkgMinor;
  }

  // 대분류 클릭 시 연쇄 한정 필터링
  majorContainer.onclick = (e) => {
    const btn = e.target.closest('.major-chip');
    if (!btn) return;
    const maj = btn.dataset.major;
    if (maj) {
      currentPkgMajor = maj;
      const midMap = tree[maj] || {};
      const mids = Object.keys(midMap);
      currentPkgMid = mids[0] || '';
      const minors = (currentPkgMid && midMap[currentPkgMid]) ? midMap[currentPkgMid] : [];
      currentPkgMinor = minors[0] || '';
      renderChips();
      if (typeof saveDraft === 'function') saveDraft();
    }
  };

  // 중분류 클릭 시 소분류 한정 필터링
  midContainer.onclick = (e) => {
    const btn = e.target.closest('.mid-chip');
    if (!btn) return;
    const mid = btn.dataset.mid;
    if (mid) {
      currentPkgMid = mid;
      const midMap = tree[currentPkgMajor] || {};
      const minors = midMap[mid] || [];
      currentPkgMinor = minors[0] || '';
      renderChips();
      if (typeof saveDraft === 'function') saveDraft();
    }
  };

  // 소분류 클릭
  minorContainer.onclick = (e) => {
    const btn = e.target.closest('.minor-chip');
    if (!btn) return;
    const min = btn.dataset.minor;
    if (min) {
      currentPkgMinor = min;
      renderChips();
      if (typeof saveDraft === 'function') saveDraft();
    }
  };

  // 초기화 버튼
  if (btnReset && !btnReset._boundReset) {
    btnReset._boundReset = true;
    btnReset.addEventListener('click', () => {
      setPackageSelection('가시설', '비계', '시스템비계');
    });
  }

  renderChips();
}

function setPackageSelection(maj, mid, min) {
  const tree = (typeof store !== 'undefined' && store && store.taxonomy9x9 && store.taxonomy9x9.agentTree) || window._TAXONOMY_AGENT_TREE_FALLBACK;
  if (!tree) return;

  if (maj && tree[maj]) {
    currentPkgMajor = maj;
  }
  const midMap = tree[currentPkgMajor] || {};
  if (mid && midMap[mid]) {
    currentPkgMid = mid;
  } else if (!midMap[currentPkgMid]) {
    currentPkgMid = Object.keys(midMap)[0] || '';
  }

  const minors = (currentPkgMid && midMap[currentPkgMid]) ? midMap[currentPkgMid] : [];
  if (min && minors.includes(min)) {
    currentPkgMinor = min;
  } else if (minors.length > 0) {
    currentPkgMinor = minors[0];
  } else {
    currentPkgMinor = min || '';
  }

  const majorContainer = document.getElementById('pkgMajorChips');
  const midContainer = document.getElementById('pkgMidChips');
  const minorContainer = document.getElementById('pkgMinorChips');
  const summaryLbl = document.getElementById('lblSelectedPackage');
  const majorLbl = document.getElementById('lblPkgMajorName');
  const midLbl = document.getElementById('lblPkgMidName');

  if (majorContainer && midContainer && minorContainer) {
    const majors = Object.keys(tree);
    majorContainer.innerHTML = majors.map(m => {
      const isActive = m === currentPkgMajor;
      return \`<button type="button" class="pkg-chip major-chip \${isActive ? 'active major-active' : ''}" data-major="\${m}">\${m}</button>\`;
    }).join('');

    if (majorLbl) majorLbl.textContent = currentPkgMajor;

    const mids = Object.keys(midMap);
    midContainer.innerHTML = mids.map(m => {
      const isActive = m === currentPkgMid;
      return \`<button type="button" class="pkg-chip mid-chip \${isActive ? 'active mid-active' : ''}" data-mid="\${m}">\${m}</button>\`;
    }).join('');

    if (midLbl) midLbl.textContent = currentPkgMid || '선택';

    minorContainer.innerHTML = minors.map(m => {
      const isActive = m === currentPkgMinor;
      return \`<button type="button" class="pkg-chip minor-chip \${isActive ? 'active minor-active' : ''}" data-minor="\${m}">\${m}</button>\`;
    }).join('');

    if (summaryLbl) {
      summaryLbl.textContent = \`[\${currentPkgMajor}] › [\${currentPkgMid || '미지정'}] › [\${currentPkgMinor || '전체'}]\`;
    }
  }

  // 텍스트 인풋 동기화
  if (document.getElementById('txtAgentMajor')) document.getElementById('txtAgentMajor').value = currentPkgMajor;
  if (document.getElementById('txtAgentMid')) document.getElementById('txtAgentMid').value = currentPkgMid;
  if (document.getElementById('txtAgentMinor')) document.getElementById('txtAgentMinor').value = currentPkgMinor;

  if (document.getElementById('txtKind')) document.getElementById('txtKind').value = currentPkgMajor;
  if (document.getElementById('txtItem')) document.getElementById('txtItem').value = currentPkgMid;
  if (document.getElementById('txtAgent')) document.getElementById('txtAgent').value = currentPkgMinor;

  if (document.getElementById('txtMatrixArea')) document.getElementById('txtMatrixArea').value = currentPkgMajor;
  if (document.getElementById('txtMatrixTarget')) document.getElementById('txtMatrixTarget').value = currentPkgMid;
  if (document.getElementById('txtMatrixSpec')) document.getElementById('txtMatrixSpec').value = currentPkgMinor;
}
`;

  // Insert before populateDatalists
  code = code.replace('function populateDatalists() {', siteCacheCode + '\nfunction populateDatalists() {');
}

// 2. Replace the agentTree fallback inside populateDatalists() with full 9x9 data and call initPackage9x9Selector
const taxJson = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'app', 'data', 'taxonomy_9x9.json'), 'utf8'));
const agentTreeJsonStr = JSON.stringify(taxJson.agentTree, null, 2);

const oldAgentTreePattern = /\/\/ 🎯 기인물 대\/중\/소 3단계 계층 Datalist 연동[\s\S]*?const agentMajorList = Object\.keys\(agentTree\);/;
if (oldAgentTreePattern.test(code)) {
  const replacement = `// 🎯 기인물 대/중/소 3단계 계층 Datalist 연동
  window._TAXONOMY_AGENT_TREE_FALLBACK = ${agentTreeJsonStr};
  const agentTree = (tax9 && tax9.agentTree) || window._TAXONOMY_AGENT_TREE_FALLBACK;

  // 3단계 연쇄 한정 패키지 선택기 초기화
  initPackage9x9Selector(agentTree);

  const agentMajorList = Object.keys(agentTree);`;
  code = code.replace(oldAgentTreePattern, replacement);
}

// 3. Update input listeners on txtMaj, txtMid, txtMin in populateDatalists to call setPackageSelection
code = code.replace(
  "txtMaj.addEventListener('input', () => {\n      const majVal = txtMaj.value.trim();\n      if ($('#txtKind')) $('#txtKind').value = majVal;\n      updateMidOpts(majVal);\n      updateMinorOpts(majVal, txtMid ? txtMid.value.trim() : '');\n    });",
  `txtMaj.addEventListener('input', () => {
      const majVal = txtMaj.value.trim();
      if ($('#txtKind')) $('#txtKind').value = majVal;
      updateMidOpts(majVal);
      updateMinorOpts(majVal, txtMid ? txtMid.value.trim() : '');
      setPackageSelection(majVal, txtMid ? txtMid.value.trim() : '', txtMin ? txtMin.value.trim() : '');
    });`
);

// 4. In bindEvents(), bind site selection change and toggle site meta
if (!code.includes("handleSiteSelectionChange(e.target.value)")) {
  const siteEvents = `
  // ── 현장명 선택 시 이전 입력값(공정률·상품유형) 자동 적용 ──
  $('#txtSite')?.addEventListener('input', (e) => {
    handleSiteSelectionChange(e.target.value);
    saveDraft();
  });
  $('#txtSite')?.addEventListener('change', (e) => {
    handleSiteSelectionChange(e.target.value);
    saveDraft();
  });

  // ⚙️ 공정률/상품 수정 접이식 토글 버튼
  $('#btnToggleSiteMeta')?.addEventListener('click', () => {
    const box = $('#boxSiteMeta');
    if (box) {
      box.style.display = (box.style.display === 'none' || !box.style.display) ? 'grid' : 'none';
    }
  });

  // 공정률 및 상품유형 수정 시 캐시 즉시 업데이트
  $('#txtProgressRate')?.addEventListener('input', () => {
    saveSiteMetaCache($('#txtSite')?.value, $('#txtProgressRate')?.value, $('#selProductType')?.value);
    saveDraft();
  });
  $('#selProductType')?.addEventListener('change', () => {
    saveSiteMetaCache($('#txtSite')?.value, $('#txtProgressRate')?.value, $('#selProductType')?.value);
    saveDraft();
  });
`;
  code = code.replace("// ── 수기 입력 vs PPT/장표 불러오기 모드 전환 ──", siteEvents + "\n  // ── 수기 입력 vs PPT/장표 불러오기 모드 전환 ──");
}

// 5. In btnApplySmart, call setPackageSelection
if (!code.includes("setPackageSelection(maj, mid, min);")) {
  code = code.replace(
    "const min = smartResult.기인물소 || (smartResult.기인물 && smartResult.기인물[0]) || smartResult.가시설세부사양 || '';",
    `const min = smartResult.기인물소 || (smartResult.기인물 && smartResult.기인물[0]) || smartResult.가시설세부사양 || '';\n    setPackageSelection(maj, mid, min);`
  );
}

// 6. In clearForm(), call setPackageSelection('가시설', '비계', '시스템비계')
if (!code.includes("setPackageSelection('가시설', '비계', '시스템비계');")) {
  code = code.replace(
    "$('#txtLocation').value = '';",
    "$('#txtLocation').value = '';\n  setPackageSelection('가시설', '비계', '시스템비계');"
  );
}

// 7. In loadDraft(), call setPackageSelection and handleSiteSelectionChange
if (!code.includes("handleSiteSelectionChange(d.site);")) {
  code = code.replace(
    "if (d.site) $('#txtSite').value = d.site;",
    "if (d.site) { $('#txtSite').value = d.site; handleSiteSelectionChange(d.site); }"
  );
  code = code.replace(
    "if (d.agentMajor && $('#txtAgentMajor')) $('#txtAgentMajor').value = d.agentMajor;",
    `if (d.agentMajor || d.agentMid || d.agentMinor || d.kind || d.item || d.agent) {
      setPackageSelection(d.agentMajor || d.kind || '가시설', d.agentMid || d.item || '비계', d.agentMinor || d.agent || '');
    }
    if (d.agentMajor && $('#txtAgentMajor')) $('#txtAgentMajor').value = d.agentMajor;`
  );
}

// 8. In btnSubmitRecord, save site meta cache
if (!code.includes("saveSiteMetaCache(site, progressVal, productTypeVal);")) {
  code = code.replace(
    "await store.saveRecord(record, media, msg => { btn.textContent = msg; });",
    `await store.saveRecord(record, media, msg => { btn.textContent = msg; });
      saveSiteMetaCache(site, progressVal, productTypeVal);`
  );
}

fs.writeFileSync(appJsPath, code, 'utf8');
console.log('Successfully updated app.js!');
