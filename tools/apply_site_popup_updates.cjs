const fs = require('fs');
const path = require('path');

const appJsPath = path.join(__dirname, '..', 'app', 'js', 'app.js');
let code = fs.readFileSync(appJsPath, 'utf8');

// 1. Replace handleSiteSelectionChange and add modal functions
const oldFuncPattern = /function handleSiteSelectionChange\(siteName\) \{[\s\S]*?\n\}/;

const newSiteModalCode = `function openSiteSelectModal() {
  const modal = document.getElementById('modalSiteSelect');
  if (!modal) return;

  renderSiteQuickList();

  const curSite = ($('#txtSite')?.value || '').trim();
  const modalInput = document.getElementById('modalInputSite');
  if (modalInput) modalInput.value = curSite;

  if (curSite) {
    updateModalSiteMeta(curSite);
  } else if (typeof store !== 'undefined' && store && store.sites && store.sites.length) {
    const first = store.sites[0];
    if (modalInput) modalInput.value = first.name;
    updateModalSiteMeta(first.name);
  }

  modal.style.display = 'flex';
}

function closeSiteSelectModal() {
  const modal = document.getElementById('modalSiteSelect');
  if (modal) modal.style.display = 'none';
}

function updateModalSiteMeta(siteName) {
  const name = (siteName || '').trim();
  const txtProg = document.getElementById('modalTxtProgressRate');
  const selProd = document.getElementById('modalSelProductType');
  if (!name) return;

  const cache = getSiteMetaCache();
  let meta = cache[name];

  if (!meta && typeof store !== 'undefined' && store && store.sites) {
    const found = store.sites.find(s => s.name === name);
    if (found && found.progress) {
      meta = {
        progressRate: parseFloat(found.progress) || 35,
        productType: found.productType || '공동주택'
      };
    }
  }

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
  }
}

function renderSiteQuickList() {
  const container = document.getElementById('siteQuickList');
  if (!container) return;

  const sites = (typeof store !== 'undefined' && store && store.sites && store.sites.length) ? store.sites : [
    { name: 'OO아파트 신축공사', progress: '45%', productType: '공동주택' },
    { name: 'OO물류센터 신축공사', progress: '62%', productType: '물류센터/공장' },
    { name: 'OO근린생활시설 신축공사', progress: '20%', productType: '오피스/지식산업센터' }
  ];

  const cache = getSiteMetaCache();
  const currentSite = ($('#txtSite')?.value || '').trim();

  container.innerHTML = sites.map(s => {
    const meta = cache[s.name] || {};
    const prog = meta.progressRate !== undefined ? meta.progressRate : (parseFloat(s.progress) || 35);
    const prod = meta.productType || s.productType || '공동주택';
    const isSelected = s.name === currentSite;

    return \`
      <div class="site-quick-card" data-site="\${s.name}" data-progress="\${prog}" data-product="\${prod}" style="
        display: flex; justify-content: space-between; align-items: center;
        background: \${isSelected ? '#eff6ff' : '#ffffff'};
        border: 1.5px solid \${isSelected ? '#3b82f6' : '#e2e8f0'};
        border-radius: 8px; padding: 9px 12px; cursor: pointer;
        transition: all 0.2s ease;
      ">
        <div>
          <div style="font-weight: 700; font-size: 0.88rem; color: #1e293b; display: flex; align-items: center; gap: 6px;">
            <span>🏢</span> <span>\${s.name}</span>
            \${isSelected ? '<span style="font-size:0.68rem; background:#3b82f6; color:white; padding:1px 5px; border-radius:3px; font-weight:700;">현재 선택</span>' : ''}
          </div>
          <div style="font-size: 0.75rem; color: #64748b; margin-top: 2px;">
            공정률: <strong style="color: #2563eb;">\${prog}%</strong> · 유형: <span style="color:#0f766e;">\${prod}</span>
          </div>
        </div>
        <button type="button" class="btn btn-outline" style="padding: 4px 10px; font-size: 0.76rem; font-weight: 700; border-color: #3b82f6; color: #2563eb; pointer-events: none;">
          선택
        </button>
      </div>
    \`;
  }).join('');

  container.querySelectorAll('.site-quick-card').forEach(card => {
    card.addEventListener('click', () => {
      const site = card.dataset.site;
      const prog = card.dataset.progress;
      const prod = card.dataset.product;
      const inputSite = document.getElementById('modalInputSite');
      if (inputSite) inputSite.value = site;
      const txtProg = document.getElementById('modalTxtProgressRate');
      const selProd = document.getElementById('modalSelProductType');
      if (txtProg) txtProg.value = prog;
      if (selProd) selProd.value = prod;

      container.querySelectorAll('.site-quick-card').forEach(c => {
        c.style.background = '#ffffff';
        c.style.borderColor = '#e2e8f0';
      });
      card.style.background = '#eff6ff';
      card.style.borderColor = '#3b82f6';
    });

    card.addEventListener('dblclick', () => {
      selectSiteAndStart(card.dataset.site, card.dataset.progress, card.dataset.product);
    });
  });
}

function selectSiteAndStart(siteName, progressRate, productType) {
  const name = (siteName || '').trim();
  if (!name) {
    if (typeof toast === 'function') toast('현장명을 선택하거나 입력해주세요.', 'warning');
    return;
  }

  const prog = (progressRate !== undefined && progressRate !== null && progressRate !== '') ? Number(progressRate) : 35;
  const prod = productType || '공동주택';

  saveSiteMetaCache(name, prog, prod);

  if ($('#txtSite')) $('#txtSite').value = name;
  if ($('#txtProgressRate')) $('#txtProgressRate').value = prog;
  if ($('#selProductType')) $('#selProductType').value = prod;
  if ($('#txtImportSite')) $('#txtImportSite').value = name;

  const nameDisp = document.getElementById('activeSiteNameDisplay');
  const progDisp = document.getElementById('activeSiteProgressDisplay');
  const prodDisp = document.getElementById('activeSiteProductDisplay');
  const badgeDisp = document.getElementById('activeSiteBadgeStatus');

  if (nameDisp) nameDisp.textContent = name;
  if (progDisp) progDisp.textContent = prog + '%';
  if (prodDisp) prodDisp.textContent = prod;
  if (badgeDisp) badgeDisp.style.display = 'inline-block';

  closeSiteSelectModal();
  if (typeof saveDraft === 'function') saveDraft();
  if (typeof toast === 'function') toast(\`🏢 [\${name}] 현장이 선택되었습니다.\`, 'success');
}

function handleSiteSelectionChange(siteName) {
  const name = (siteName || '').trim();
  if (!name) return;
  const cache = getSiteMetaCache();
  let meta = cache[name];

  if (!meta && typeof store !== 'undefined' && store && store.sites) {
    const found = store.sites.find(s => s.name === name);
    if (found && found.progress) {
      meta = {
        progressRate: parseFloat(found.progress) || 35,
        productType: found.productType || '공동주택'
      };
    }
  }

  if (!meta && typeof store !== 'undefined' && store && store.records && store.records.length) {
    const rec = [...store.records].reverse().find(r => r.site === name && (r.progressRate !== undefined || r.productType));
    if (rec) {
      meta = {
        progressRate: rec.progressRate !== undefined ? Number(rec.progressRate) : 35,
        productType: rec.productType || '공동주택'
      };
    }
  }

  const prog = meta?.progressRate !== undefined ? meta.progressRate : ($('#txtProgressRate')?.value || 35);
  const prod = meta?.productType || ($('#selProductType')?.value || '공동주택');

  if ($('#txtSite')) $('#txtSite').value = name;
  if ($('#txtProgressRate')) $('#txtProgressRate').value = prog;
  if ($('#selProductType')) $('#selProductType').value = prod;

  const nameDisp = document.getElementById('activeSiteNameDisplay');
  const progDisp = document.getElementById('activeSiteProgressDisplay');
  const prodDisp = document.getElementById('activeSiteProductDisplay');
  const badgeDisp = document.getElementById('activeSiteBadgeStatus');

  if (nameDisp) nameDisp.textContent = name;
  if (progDisp) progDisp.textContent = prog + '%';
  if (prodDisp) prodDisp.textContent = prod;
  if (badgeDisp) badgeDisp.style.display = 'inline-block';
}`;

code = code.replace(oldFuncPattern, newSiteModalCode);

// 2. In bindEvents(), replace the old txtSite listeners with modal buttons
const oldSiteListeners = `  // ── 현장명 선택 시 이전 입력값(공정률·상품유형) 자동 적용 ──
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
  });`;

const newSiteListeners = `  // ── 현장 선택 팝업 모달 이벤트 ──
  $('#btnChangeActiveSite')?.addEventListener('click', () => {
    openSiteSelectModal();
  });
  $('#btnCloseSiteSelectModal')?.addEventListener('click', () => {
    closeSiteSelectModal();
  });
  $('#btnCancelSiteSelect')?.addEventListener('click', () => {
    closeSiteSelectModal();
  });
  $('#btnConfirmSiteSelect')?.addEventListener('click', () => {
    const site = $('#modalInputSite')?.value;
    const prog = $('#modalTxtProgressRate')?.value;
    const prod = $('#modalSelProductType')?.value;
    selectSiteAndStart(site, prog, prod);
  });
  $('#modalInputSite')?.addEventListener('input', (e) => {
    updateModalSiteMeta(e.target.value);
  });
  $('#modalInputSite')?.addEventListener('change', (e) => {
    updateModalSiteMeta(e.target.value);
  });
  $('#modalSiteSelect')?.addEventListener('click', (e) => {
    if (e.target === $('#modalSiteSelect')) closeSiteSelectModal();
  });`;

code = code.replace(oldSiteListeners, newSiteListeners);

// 3. In bottom-nav click listener, open modal if viewRegister and no site selected
code = code.replace(
  "if (viewId === 'viewList') renderRecordList();",
  `if (viewId === 'viewRegister' && !$('#txtSite')?.value) {
        openSiteSelectModal();
      }
      if (viewId === 'viewList') renderRecordList();`
);

// 4. In DOMContentLoaded, open modal if no site selected
code = code.replace(
  "checkAuth();\n\n  } catch (err) {",
  `checkAuth();
    if (!$('#txtSite')?.value) {
      setTimeout(() => openSiteSelectModal(), 200);
    }

  } catch (err) {`
);

fs.writeFileSync(appJsPath, code, 'utf8');
console.log('Successfully updated app.js with site modal logic!');
