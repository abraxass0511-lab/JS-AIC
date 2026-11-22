import { $, $$, h, todayStr, monthStr, toast, debounce, downloadBlob, saveAndEmail } from './util.js?v=20261122_v66';
import { store } from './store.js?v=20261122_v66';
import { processImageFile } from './image-processor.js?v=20261025_jangpyo_fix';
import { determineStandardStage, STANDARD_STAGES, PRODUCT_TYPES } from './progress-standardizer.js?v=20261010_1';
import { parsePPTX, parsePDF, parseImage, filterOnlyOccupationalSafetyLaw, deriveConcreteBanner, sanitizeInspectorValue } from './pptx-importer-v2.js?v=20261122_v66';
import {
  WORK_GROUP_TREE,
  WORK_GROUP_MID_LIST,
  resolveWorkGroupMid,
  STANDARD_LOCATION_CATEGORIES,
  inferLocationCategory,
  WORK_METHODS_9X9_IMPROVED,
  normalizeWorkMethod9x9,
  SafeGuidelineMemory
} from './text-normalizer.js?v=20261122_v66';

const WORK_METHODS_9X9 = WORK_METHODS_9X9_IMPROVED;

function resolveDisplayWorkMethod(r) {
  if (!r) return '설치해체작업';
  const wm = (r.workMethod || r.workName || '').trim();
  return normalizeWorkMethod9x9(wm, r.workGroup || '', r.content || '', r.location || '');
}

function resolveDisplayCondition(r) {
  if (!r) return '해당없음';
  const c = (r.condition || '').trim();
  if (c && !['계획 미이행', '불안전 상태', '관리적', '물적', '인적'].includes(c)) return c;
  return inferCondition(r.content, r.mgmtCauses || r.causes);
}

function resolveDisplayAction(r) {
  if (!r) return '해당없음';
  const a = (r.action || '').trim();
  if (a && !['계획 미이행', '불안전 행동', '관리적', '물적', '인적'].includes(a)) return a;
  return inferAction(r.content, r.mgmtCauses || r.causes);
}

let classifier = null;
let currentPhotos = []; // [{ blob, previewUrl, dateTaken }]
let selectedPhotoLayoutRatio = 'auto';
let selectedCauses = new Set();
let smartResult = null;
let smartRecommendationApplied = false;
let appliedSmartResult = null;
let aiAnalyzedLawBody = '';
let lastManualAiVerifiedSig = '';

function buildManualAiSig({ content = '', location = '', workGroup = '', law = '', lawBody = '', photoBanner = '' } = {}) {
  return [content, location, workGroup, law, lawBody, photoBanner].map(v => String(v || '').trim()).join('||');
}
let pinInput = '';
let targetFixRecord = null;
let fixPhotoData = null;
let recordViewMode = 'card'; // 'card' or 'table'
let listPeriodMode = 'all'; // 'all', 'month', or 'range'
let exportPeriodMode = 'all'; // 'all', 'month', or 'range'
let eduPeriodMode = 'all'; // 'all', 'month', or 'range'
let currentLoadedRecords = [];
let listOnlyUnfixed = false;
let listSiteFilter = 'all';
let currentEduRecords = [];
let currentEduPeriodLabel = '';
let currentManualSeverity = '중부적합';
let importedRecords = []; // [{ severity, type, law, subcontractor, ... }]
let listRenderSeq = 0;
let isSyncingInProgress = false;

// ── App Init ──
window.addEventListener('DOMContentLoaded', async () => {
  // 1. 이벤트 리스너를 가장 먼저 바인딩하여 모든 UI 상호작용 즉시 활성화
  bindEvents();

  // 초기 날짜 및 기간 설정 (과거 등록 데이터가 즉시 보이도록 2026-10부터 오늘까지 포괄 설정)
  const today = todayStr();
  const curMonth = monthStr();
  const defaultQueryMonth = '2026-10';
  const defaultStartDate = '2026-10-01';

  if ($('#txtInspectDate')) $('#txtInspectDate').value = today;
  if ($('#selListMonth')) $('#selListMonth').value = defaultQueryMonth;
  if ($('#txtListStartDate')) $('#txtListStartDate').value = defaultStartDate;
  if ($('#txtListEndDate')) $('#txtListEndDate').value = today;

  if ($('#selEduMonth')) $('#selEduMonth').value = defaultQueryMonth;
  if ($('#txtEduStartDate')) $('#txtEduStartDate').value = defaultStartDate;
  if ($('#txtEduEndDate')) $('#txtEduEndDate').value = today;

  if ($('#selExportMonth')) $('#selExportMonth').value = defaultQueryMonth;
  if ($('#txtExportStartDate')) $('#txtExportStartDate').value = defaultStartDate;
  if ($('#txtExportEndDate')) $('#txtExportEndDate').value = today;

  try {
    await store.init();
    await store.seedDemoIfEmpty();
    
    // 자동분류기 인스턴스 초기화 (강화학습 가중치 포함)
    reinitClassifier();

    // 기본 현장 셋업이 비어있다면 샘플 현장 3개 등록
    if (!store.sites || !store.sites.length) {
      store.sites = [
        { name: 'OO아파트 신축공사', progress: '45%', scale: '지하2층/지상25층 8개동', amount: '850억' },
        { name: 'OO물류센터 신축공사', progress: '62%', scale: '지상5층 연면적 6만㎡', amount: '620억' },
        { name: 'OO근린생활시설 신축공사', progress: '20%', scale: '지하1층/지상7층', amount: '95억' },
      ];
      if (store.mode === 'demo') {
        await store.saveSites(store.sites);
      }
    }

    renderSites();
    populateDatalists();
    updateGuidelineMemoryCount();
    checkAuth();
    if (!$('#txtSite')?.value) {
      setTimeout(() => openSiteSelectModal(), 200);
    }

  } catch (err) {
    console.error('App init error:', err);
    toast('초기화 알림: ' + err.message, 'warning');
    checkAuth();
  }
});

function reinitClassifier() {
  if (window.SafeClassifier && store.taxonomy && store.keywords) {
    classifier = window.SafeClassifier.createClassifier(store.taxonomy, store.keywords, store.rlWeights);
    // 현재 입력창에 지적 내용이 작성되어 있다면 즉시 자동분류 재실행
    if ($('#txtContent')?.value && $('#txtContent').value.trim().length >= 2) {
      setTimeout(() => runSmartClassification(false), 80);
    }
  }
}

// ── [기존 스마트 AI] 내용 기반 온디바이스 자동분류 엔진 (상시 호출 가능) ──
function runSmartClassification(forceShow = false) {
  const txt = ($('#txtContent')?.value || '').trim();
  const box = $('#smartClassifyBox');
  const applyStatus = $('#smartApplyStatus');
  if (applyStatus) applyStatus.style.display = 'none';

  if (!txt || txt.length < 2) {
    if (box) {
      box.classList.remove('active');
      box.style.display = 'none';
    }
    return null;
  }

  if (!classifier) {
    reinitClassifier();
  }

  if (!classifier) {
    if (forceShow) toast('분류 데이터를 로딩 중입니다. 1~2초 후 다시 눌러주세요.', 'warning');
    return null;
  }

  const res = classifier.classify(txt);
  if (res && res.matched) {
    smartResult = res.result;
    const x = res.result;
    const rlBadge = (res.rlBoost && res.rlBoost > 0)
      ? `<span class="badge" style="background:#fef08a; color:#854d0e; font-weight:700; margin-left:6px;">⚡ 강화학습 추천 (+${res.rlBoost})</span>`
      : '';
    
    const descEl = $('#smartDesc');
    if (descEl) {
      descEl.innerHTML = `<strong>${x.종류} › ${x.항목}</strong> (${x.유형})${rlBadge}<br><small style="color:var(--gray-600);">${x.산업안전보건법 || ''}</small>`;
    }
    
    const tagsEl = $('#smartTags');
    if (tagsEl) {
      const m9Badge = x.점검영역9x9
        ? `<span class="badge" style="background:#fef08a; color:#854d0e; font-weight:700;">🎯 9×9: ${x.점검영역9x9} › ${x.점검대상9x9 || ''}${x.가시설세부사양 ? ' (' + x.가시설세부사양 + ')' : ''}</span>`
        : '';
      const shBadge = x.관리책임주체
        ? `<span class="badge" style="background:#fed7aa; color:#9a3412; font-weight:600;">주체: ${x.관리책임주체}</span>`
        : '';
      tagsEl.innerHTML = `
        ${m9Badge}
        <span class="badge primary">기인물: ${(x.기인물 && x.기인물.join(', ')) || '-'}</span>
        <span class="badge">상태: ${x.상태 || '-'}</span>
        <span class="badge">행동: ${x.행동 || '-'}</span>
        ${shBadge}
        <span class="badge">원인: ${(x.발생원인 && x.발생원인.join(', ')) || '-'}</span>
      `;
    }
    
    if (box) {
      box.classList.add('active');
      box.style.display = 'block';
    }
    if (forceShow) {
      toast(`[기존 스마트 AI] "${x.종류} › ${x.항목}" 추천이 완료되었습니다.`, 'success');
    }
    return res;
  } else {
    if (box) {
      box.classList.remove('active');
      box.style.display = 'none';
    }
    if (forceShow) {
      toast('일치하는 사전 지적사항을 찾지 못했습니다. 직접 입력하거나 Qwen AI 정밀 분석을 사용하세요.', 'info');
    }
    return null;
  }
}

// ── PIN Authentication Flow ──
function checkAuth() {
  if (!store.user) {
    showPinModal();
  } else {
    $('#userBadge').style.display = 'flex';
    $('#userName').textContent = `${store.user.name} (${store.user.role === 'admin' ? '관리자' : '점검자'})`;
    hidePinModal();
    renderSites();
    reinitClassifier();
    loadDraft();
    updateAdminControls();
    renderRecordList();

    // ── 새로고침 / 앱 실행 즉시 로컬 미동기화 건 전자동 클라우드 업로드 ──
    if (store.user && store.mode === 'github') {
      store.syncLocalToServer().then(res => {
        if (res && res.synced > 0) {
          toast(`🔄 로컬 보관 데이터 ${res.synced}건이 클라우드에 자동 동기화되었습니다!`, 'success', 3500);
          renderRecordList(false);
        }
      }).catch(e => console.warn('Auto sync on DOMContentLoaded error:', e));
    }
  }
}

// ── 스마트폰 화면 켜짐 또는 다른 앱에서 복귀 시 무자각 전자동 동기화 ──
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && store.user && store.mode === 'github') {
    store.syncLocalToServer().then(res => {
      if (res && res.synced > 0) {
        toast(`🔄 클라우드 자동 동기화 완료 (${res.synced}건)`, 'success', 2500);
        renderRecordList(false);
      }
    }).catch(() => {});
  }
});

function updateAdminControls() {
  const isAdmin = store.isAdmin;
  const btnSites = $('#btnManageSites');
  if (btnSites) btnSites.style.display = isAdmin ? 'inline-flex' : 'none';
  const btnPins = $('#btnManagePins');
  if (btnPins) btnPins.style.display = isAdmin ? 'inline-flex' : 'none';
}

function showPinModal() {
  pinInput = '';
  updatePinDisplay();
  $('#pinModal').style.display = 'flex';
}

function hidePinModal() {
  $('#pinModal').style.display = 'none';
}

function updatePinDisplay() {
  const dots = '●'.repeat(pinInput.length) + '·'.repeat(Math.max(0, 6 - pinInput.length));
  $('#pinDots').textContent = dots;
}

// ══════════════════════════════════════════════════════════════
// ⚡ 표준 분류 사용 빈도 추적 및 스마트 상위 추천 매니저
// ══════════════════════════════════════════════════════════════
const FieldFrequencyManager = {
  STORAGE_KEY: 'sp_field_frequency_v1',
  
  // 최초 시드 기본 빈도수 (현장 실무 1~5위 핵심 항목 사전 상위 노출)
  DEFAULT_SEEDS: {
    workMethod: {
      '양중작업': 25,
      '고소작업': 22,
      '설치해체작업': 20,
      '하역운반작업': 14,
      '가공조립작업': 10,
      '굴착작업': 8,
      '중량물취급작업': 6,
      '운전조정작업': 4,
      '기타': 2
    },
    workGroup: {
      '가설공사': 25,
      '철근콘크리트공사': 22,
      '철골공사': 16,
      '양중공사': 14,
      '설비·전기공사': 12,
      '마감공사': 10,
      '토공사': 8,
      '기초공사': 6,
      '해체공사': 5,
      '공통': 4
    },
    type: {
      '떨어짐(추락, 사람)': 30,
      '넘어짐(전도: 사람)': 24,
      '부딪힘(충돌)/맞음': 20,
      '떨어짐(낙하/비래)/맞음': 18,
      '끼임(협착, 감김)': 16,
      '무너짐(붕괴, 도괴)/깔림': 12,
      '미끄러짐/접질림': 10,
      '감전': 8,
      '화재/폭발': 6
    },
    location: {
      '계단·복도': 20,
      '본구조물': 18,
      '가설물': 16,
      '옥상·지붕': 14,
      '외부': 12,
      '실내 작업장': 10,
      '야적장': 8,
      '도로': 6,
      '건축물': 5
    },
    agentMajor: {
      '가시설': 30,
      '작업발판': 25,
      '건설장비': 20,
      '작업공도구': 16,
      '작업장': 14,
      'PPE': 12,
      '전기시설': 10,
      '소방시설': 8
    },
    agentMid: {
      '비계': 28,
      '거푸집': 22,
      '사다리': 18,
      '안전시설': 16,
      '동바리': 14,
      '양중장비': 12,
      '비상통로': 10
    },
    agentMinor: {
      '시스템비계': 25,
      '강관비계': 20,
      '유로폼': 18,
      '이동식 사다리': 16,
      '추락방지시설(안전난간)': 16,
      '갱폼': 14,
      '시스템동바리': 12,
      '말비계': 10
    }
  },

  USER_CUSTOM_KEY: 'sp_field_user_custom_v1',

  getUserCustom() {
    try {
      const raw = localStorage.getItem(this.USER_CUSTOM_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    return {};
  },

  saveUserCustom(data) {
    try {
      localStorage.setItem(this.USER_CUSTOM_KEY, JSON.stringify(data));
    } catch (e) {}
  },

  getAll() {
    try {
      const raw = localStorage.getItem(this.STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    return JSON.parse(JSON.stringify(this.DEFAULT_SEEDS));
  },

  saveAll(data) {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(data));
    } catch (e) {}
  },

  getFrequency(category, value) {
    if (!category || !value) return 0;
    const all = this.getAll();
    const cat = all[category] || {};
    return cat[value] || 0;
  },

  recordUsage(category, value) {
    if (!category || !value || typeof value !== 'string') return;
    const v = value.trim();
    if (!v) return;

    // 사용자 직접 선택/입력 가중치 저장
    const custom = this.getUserCustom();
    if (!custom[category]) custom[category] = {};
    custom[category][v] = (custom[category][v] || 0) + 1;
    this.saveUserCustom(custom);

    // 전체 가중치 합산 캐시 갱신
    const all = this.getAll();
    if (!all[category]) all[category] = {};
    all[category][v] = (all[category][v] || 0) + 15;
    this.saveAll(all);
  },

  recordSavedRecord(rec) {
    if (!rec) return;
    const wm = rec.workMethod || rec.workName;
    if (wm) this.recordUsage('workMethod', wm);
    if (rec.workGroup) this.recordUsage('workGroup', rec.workGroup);
    if (rec.type) this.recordUsage('type', rec.type);
    if (rec.location) this.recordUsage('location', rec.location);
    if (rec.agentMajor) this.recordUsage('agentMajor', rec.agentMajor);
    if (rec.agentMid) this.recordUsage('agentMid', rec.agentMid);
    if (rec.agentMinor) this.recordUsage('agentMinor', rec.agentMinor);
    if (rec.condition) this.recordUsage('condition', rec.condition);
    if (rec.action) this.recordUsage('action', rec.action);
    if (rec.subcontractor) this.recordUsage('subcontractor', rec.subcontractor);
  },

  seedFromRecords(records) {
    if (!Array.isArray(records) || !records.length) return;
    const base = JSON.parse(JSON.stringify(this.DEFAULT_SEEDS));
    const userCustom = this.getUserCustom();

    // 불러온 실제 데이터로부터 빈도수 멱등적(Idempotent) 집계
    const recordCounts = {};
    records.forEach(rec => {
      if (!rec) return;
      const map = {
        workMethod: rec.workMethod || rec.workName,
        workGroup: rec.workGroup,
        type: rec.type,
        location: rec.location,
        agentMajor: rec.agentMajor,
        agentMid: rec.agentMid,
        agentMinor: rec.agentMinor
      };
      for (const [k, v] of Object.entries(map)) {
        if (!v || typeof v !== 'string') continue;
        const trimmed = v.trim();
        if (!trimmed) continue;
        if (!recordCounts[k]) recordCounts[k] = {};
        recordCounts[k][trimmed] = (recordCounts[k][trimmed] || 0) + 1;
      }
    });

    const categories = ['workMethod', 'workGroup', 'type', 'location', 'agentMajor', 'agentMid', 'agentMinor'];
    const merged = {};
    categories.forEach(cat => {
      merged[cat] = { ...(base[cat] || {}) };
      // 1) 실제 DB 누적 기록 (1건당 +10점 가중치)
      if (recordCounts[cat]) {
        for (const [val, count] of Object.entries(recordCounts[cat])) {
          merged[cat][val] = (merged[cat][val] || 0) + (count * 10);
        }
      }
      // 2) 사용자 수동 선택/입력 이력 (1회당 +15점 가중치)
      if (userCustom[cat]) {
        for (const [val, count] of Object.entries(userCustom[cat])) {
          merged[cat][val] = (merged[cat][val] || 0) + (count * 15);
        }
      }
    });

    this.saveAll(merged);
  },

  sortByFrequency(category, list) {
    if (!Array.isArray(list) || !list.length) return [];
    const unique = Array.from(new Set(list.filter(Boolean)));
    const all = this.getAll();
    const cat = all[category] || {};

    return unique.sort((a, b) => {
      const freqA = cat[a] || 0;
      const freqB = cat[b] || 0;
      if (freqB !== freqA) {
        return freqB - freqA; // 사용 빈도 높은 순서대로 최상단 배치
      }
      return 0;
    });
  }
};

function renderQuickChipsForField(customKey, sortedList) {
  const inputMap = {
    workMethod: 'txtWorkName',
    workGroup: 'txtWorkGroup',
    type: 'txtType',
    location: 'txtLocation',
    agentMajor: 'txtAgentMajor',
    agentMid: 'txtAgentMid',
    agentMinor: 'txtAgentMinor'
  };
  const inputId = inputMap[customKey];
  if (!inputId) return;
  const inputEl = document.getElementById(inputId);
  if (!inputEl) return;

  const topItems = sortedList.slice(0, 4);
  if (!topItems.length) return;

  let container = document.getElementById(`chips_${customKey}`);
  if (!container) {
    container = document.createElement('div');
    container.id = `chips_${customKey}`;
    container.className = 'quick-chips-bar';
    inputEl.parentNode.insertBefore(container, inputEl.nextSibling);

    inputEl.addEventListener('input', () => {
      const c = document.getElementById(`chips_${customKey}`);
      if (!c) return;
      c.querySelectorAll('.quick-chip-btn').forEach(b => {
        b.classList.toggle('active', b.getAttribute('data-val') === inputEl.value.trim());
      });
    });
  }

  container.innerHTML = `
    <span class="quick-chip-label">⚡자주사용:</span>
    ${topItems.map(item => {
      const isActive = inputEl.value.trim() === item;
      return `<button type="button" class="quick-chip-btn ${isActive ? 'active' : ''}" data-val="${item}" title="클릭 시 '${item}' 자동 입력">${item}</button>`;
    }).join('')}
  `;

  container.querySelectorAll('.quick-chip-btn').forEach(btn => {
    btn.onclick = (e) => {
      e.preventDefault();
      const val = btn.getAttribute('data-val');
      inputEl.value = val;
      FieldFrequencyManager.recordUsage(customKey, val);
      inputEl.dispatchEvent(new Event('input', { bubbles: true }));
      inputEl.dispatchEvent(new Event('change', { bubbles: true }));
      
      container.querySelectorAll('.quick-chip-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    };
  });
}

// ── Datalists & Taxonomy Rendering ──

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

function openSiteSelectModal() {
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

    return `
      <div class="site-quick-card" data-site="${s.name}" data-progress="${prog}" data-product="${prod}" style="
        display: flex; justify-content: space-between; align-items: center;
        background: ${isSelected ? '#eff6ff' : '#ffffff'};
        border: 1.5px solid ${isSelected ? '#3b82f6' : '#e2e8f0'};
        border-radius: 8px; padding: 9px 12px; cursor: pointer;
        transition: all 0.2s ease;
      ">
        <div>
          <div style="font-weight: 700; font-size: 0.88rem; color: #1e293b; display: flex; align-items: center; gap: 6px;">
            <span>🏢</span> <span>${s.name}</span>
            ${isSelected ? '<span style="font-size:0.68rem; background:#3b82f6; color:white; padding:1px 5px; border-radius:3px; font-weight:700;">현재 선택</span>' : ''}
          </div>
          <div style="font-size: 0.75rem; color: #64748b; margin-top: 2px;">
            공정률: <strong style="color: #2563eb;">${prog}%</strong> · 유형: <span style="color:#0f766e;">${prod}</span>
          </div>
        </div>
        <button type="button" class="btn btn-outline" style="padding: 4px 10px; font-size: 0.76rem; font-weight: 700; border-color: #3b82f6; color: #2563eb; pointer-events: none;">
          선택
        </button>
      </div>
    `;
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
  if (typeof toast === 'function') toast(`🏢 [${name}] 현장이 선택되었습니다.`, 'success');
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
      return `<button type="button" class="pkg-chip major-chip ${isActive ? 'active major-active' : ''}" data-major="${maj}">${maj}</button>`;
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
      return `<button type="button" class="pkg-chip mid-chip ${isActive ? 'active mid-active' : ''}" data-mid="${mid}">${mid}</button>`;
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
      return `<button type="button" class="pkg-chip minor-chip ${isActive ? 'active minor-active' : ''}" data-minor="${min}">${min}</button>`;
    }).join('');

    // 4. 상단 요약 뱃지 갱신
    if (summaryLbl) {
      summaryLbl.textContent = `[${currentPkgMajor}] › [${currentPkgMid || '미지정'}] › [${currentPkgMinor || '전체'}]`;
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
      return `<button type="button" class="pkg-chip major-chip ${isActive ? 'active major-active' : ''}" data-major="${m}">${m}</button>`;
    }).join('');

    if (majorLbl) majorLbl.textContent = currentPkgMajor;

    const mids = Object.keys(midMap);
    midContainer.innerHTML = mids.map(m => {
      const isActive = m === currentPkgMid;
      return `<button type="button" class="pkg-chip mid-chip ${isActive ? 'active mid-active' : ''}" data-mid="${m}">${m}</button>`;
    }).join('');

    if (midLbl) midLbl.textContent = currentPkgMid || '선택';

    minorContainer.innerHTML = minors.map(m => {
      const isActive = m === currentPkgMinor;
      return `<button type="button" class="pkg-chip minor-chip ${isActive ? 'active minor-active' : ''}" data-minor="${m}">${m}</button>`;
    }).join('');

    if (summaryLbl) {
      summaryLbl.textContent = `[${currentPkgMajor}] › [${currentPkgMid || '미지정'}] › [${currentPkgMinor || '전체'}]`;
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

function populateDatalists() {
  const tax = store.taxonomy || {};
  const tax9 = store.taxonomy9x9 || {};
  const custom = (store.custom && store.custom.customValues) || {};
  const addOpts = (id, list, customKey) => {
    const el = document.getElementById(id);
    if (!el) return;
    const all = [...new Set([...(list || []), ...(custom[customKey] || [])])];
    
    // 자주 입력하는 항목이 상위에 뜨도록 빈도수 순 정렬!
    const sorted = (typeof FieldFrequencyManager !== 'undefined' && FieldFrequencyManager.sortByFrequency)
      ? FieldFrequencyManager.sortByFrequency(customKey, all)
      : all;
    el.innerHTML = sorted.map(v => `<option value="${v}">`).join('');

    // 입력창 바로 아래 자주 사용하는 추천 칩 바 렌더링
    if (typeof renderQuickChipsForField === 'function') {
      renderQuickChipsForField(customKey, sorted);
    }
  };

  const allItems = (tax && tax.categories && tax.categories.list) ? tax.categories.list.flatMap(c => c.items) : [];
  addOpts('listKinds', tax.categories ? tax.categories.list.map(c => c.kind) : [], 'kind');
  addOpts('listItems', allItems.map(i => i.name), 'item');
  addOpts('listAgents', [...new Set(allItems.flatMap(i => i.agents || []))], 'agent');

  // 🎯 기인물 대/중/소 3단계 계층 Datalist 연동
  window._TAXONOMY_AGENT_TREE_FALLBACK = {
  "가시설": {
    "비계": [
      "시스템비계",
      "강관비계",
      "틀비계"
    ],
    "흙막이": [
      "수직재",
      "수평재",
      "코너부",
      "경사재",
      "토사부",
      "상부"
    ],
    "거푸집/동바리": [
      "시스템동바리",
      "파이프서포트",
      "잭서포트"
    ],
    "특수거푸집": [
      "갱폼",
      "ACS",
      "RCS",
      "SLIP"
    ],
    "철골": [
      "기둥",
      "큰보",
      "작은보",
      "경사보",
      "계단"
    ],
    "데크플레이트": [
      "보접합부",
      "코너부",
      "데크"
    ],
    "PC": [
      "기둥(C)",
      "큰보(G)",
      "작은보(B)",
      "슬래브"
    ],
    "안전시설": [
      "추락방지시설",
      "낙하방지시설"
    ],
    "기타": [
      "기타"
    ]
  },
  "건설장비": {
    "굴착장비": [
      "굴착기",
      "불도저"
    ],
    "천공장비": [
      "어스드릴",
      "오거",
      "항타/항발기"
    ],
    "하역운반장비": [
      "지게차",
      "페이로더",
      "덤프트럭",
      "화물자동차",
      "트레일러",
      "컨베이어"
    ],
    "양중장비": [
      "타워크레인",
      "타이어식크레인",
      "무한궤도식크레인",
      "천장주행크레인",
      "겐트리크레인",
      "호이스트",
      "카고크레인"
    ],
    "탑승장비": [
      "건설용 리프트",
      "고소작업대",
      "고소작업차",
      "곤돌라"
    ],
    "타설장비": [
      "펌프카",
      "레미콘믹스트럭"
    ],
    "토공장비": [
      "토공장비",
      "포장장비",
      "아스팔트피니셔"
    ],
    "해상장비": [
      "예인선",
      "통선",
      "바지선",
      "항타선",
      "크레인선",
      "플로팅도크",
      "준설선"
    ],
    "기타": [
      "기타"
    ]
  },
  "작업방법": {
    "굴착작업": [
      "터파기",
      "되메우기",
      "사면굴착",
      "기타"
    ],
    "하역운반작업": [
      "자재하역",
      "자재상차",
      "소운반",
      "기타"
    ],
    "양중작업": [
      "타워크레인양중",
      "이동식크레인양중",
      "줄걸이작업",
      "신호작업",
      "기타"
    ],
    "중량물취급작업": [
      "인력운반",
      "중량물거치",
      "기타"
    ],
    "설치해체작업": [
      "비계설치해체",
      "거푸집설치해체",
      "동바리설치해체",
      "철골설치해체",
      "안전시설설치해체",
      "기타"
    ],
    "가공조립작업": [
      "철근가공조립",
      "배관가공",
      "목공작업",
      "기타"
    ],
    "운전조정작업": [
      "건설기계운전",
      "장비점검",
      "신호유도",
      "기타"
    ],
    "고소작업": [
      "2m이상단부작업",
      "개구부주변작업",
      "지붕작업",
      "철골상부작업",
      "기타"
    ],
    "기타": [
      "기타"
    ]
  },
  "작업공도구": {
    "화기": [
      "전기용접기",
      "가스용접기",
      "산소절단기",
      "토치",
      "용접건"
    ],
    "절단기구": [
      "고속절단기",
      "각도절단기",
      "원형톱",
      "직소",
      "전동체인톱",
      "자동목재톱",
      "밴드톱",
      "철근절단기",
      "전기컷쏘",
      "파이프머신",
      "콘크리트 절단기",
      "보도블럭 절단기"
    ],
    "회전기구": [
      "핸드드릴",
      "핸드그라인더",
      "전동드릴/드라이버",
      "철근절곡기",
      "믹서드릴",
      "원형사포",
      "탁상그라인더",
      "탁상드릴",
      "코어드릴",
      "마그네틱드릴",
      "콘크리트 샌딩기",
      "파이프홈가공기"
    ],
    "압력기구": [
      "압력용기",
      "해머드릴",
      "고속살수기",
      "공기압축기"
    ],
    "타정기구": [
      "타카",
      "인슐레이션 타카",
      "타정자동총"
    ],
    "양중기구": [
      "와이어로프 슬링",
      "체인슬링",
      "벨트슬링",
      "라운드슬링",
      "샤클",
      "클램프",
      "턴버클",
      "마스터링",
      "리프팅 클러치",
      "양중함",
      "양중디바이스",
      "체인블럭",
      "레버블럭"
    ],
    "운반기구": [
      "전동팔레트",
      "전동쟈키",
      "핸드쟈키"
    ],
    "다짐기구": [
      "콘크리트 다짐기",
      "흙다짐기",
      "다짐롤러"
    ],
    "기타": [
      "기타"
    ]
  },
  "작업발판": {
    "이동식틀비계": [
      "상부안전난간",
      "전도방지대(아웃트리거)",
      "바퀴스토퍼",
      "작업발판",
      "승강설비"
    ],
    "사다리": [
      "A형사다리",
      "일자사다리",
      "신축형사다리",
      "발판사다리"
    ],
    "말비계": [
      "1단말비계",
      "2단말비계",
      "도배우마",
      "목공우마"
    ],
    "각립비계": [
      "디딤판",
      "힌지고정쇠",
      "미끄럼방지캡",
      "수평연결재"
    ],
    "달비계": [
      "작업대",
      "달기로프",
      "구명줄",
      "안전대체결점"
    ],
    "달대비계": [
      "달대체인",
      "행거",
      "작업발판",
      "발판고정철물"
    ],
    "낮은발판": [
      "이동식발판",
      "우마발판",
      "단부받침대"
    ],
    "현장제작발판": [
      "목재발판",
      "합판발판",
      "강재발판"
    ],
    "기타": [
      "기타"
    ]
  },
  "작업장소(환경)": {
    "습윤장소": [
      "바닥물고임",
      "지하침수구간",
      "외부노출습윤지"
    ],
    "밀폐공간": [
      "정화조/맨홀",
      "배관피트/PS실",
      "물탱크/저수조",
      "지하실구석"
    ],
    "협소공간": [
      "승강기피트",
      "배관샤프트",
      "옹벽틈새"
    ],
    "조명채광부족": [
      "지하암실",
      "야간작업구간",
      "조명미설치구간"
    ],
    "소음진동": [
      "압축기/발전기주변",
      "파쇄작업구간",
      "착암구간"
    ],
    "개구부/단부주변": [
      "슬래브단부",
      "바닥개구부주변",
      "계단참개구부",
      "엘리베이터개구부"
    ],
    "중량물 하부/주변": [
      "크레인양중하부",
      "자재적재하부",
      "차량동선주변"
    ],
    "통로/계단": [
      "가설통로",
      "계단실",
      "경사로",
      "사다리통로"
    ],
    "기타": [
      "기타"
    ]
  },
  "전기시설": {
    "수전시설": [
      "특고압변압기",
      "수전반",
      "인입전주"
    ],
    "전선이송설비": [
      "가공전선지지대",
      "케이블트레이",
      "전선보호관"
    ],
    "분전반": [
      "가설분전함",
      "누전차단기(ELCB)",
      "외함접지",
      "도어잠금장치"
    ],
    "전선": [
      "이동전선(캡타이어)",
      "가설배선",
      "가공전선",
      "피복손상전선"
    ],
    "접지시설": [
      "제3종접지",
      "기계외함접지",
      "접지선연결",
      "접지극"
    ],
    "조명시설": [
      "투광등",
      "작업등",
      "핸드램프",
      "비상유도등"
    ],
    "냉난방기": [
      "전기온풍기",
      "열풍기",
      "에어컨",
      "제습기"
    ],
    "충전시설": [
      "배터리보관함",
      "화재안전충전함",
      "고소작업대충전기"
    ],
    "기타": [
      "기타"
    ]
  },
  "소방시설": {
    "비상통로": [
      "비상대피로",
      "유도등/표지판",
      "피난계단"
    ],
    "화재수신반": [
      "가설화재수신기",
      "방재실수신반",
      "발신기"
    ],
    "화재감지시설": [
      "단독경보형감지기",
      "열감지기",
      "연기감지기"
    ],
    "스프링쿨러": [
      "소방배관",
      "헤드방호",
      "간이스프링클러"
    ],
    "임시소방시설": [
      "분말소화기(ABC)",
      "간이소화장치",
      "비상경보장치",
      "간이피난유도선"
    ],
    "불티비산방지": [
      "불티비산방지포(방포)",
      "용접차단막",
      "모래통/수조"
    ],
    "가설건물": [
      "컨테이너사무실",
      "근로자휴게실",
      "자재창고"
    ],
    "생활화재": [
      "흡연장소",
      "난로/전열기주변",
      "취사설비"
    ],
    "기타": [
      "기타"
    ]
  },
  "개인보호구": {
    "안전모": [
      "턱끈체결",
      "충격흡수재",
      "안전모모체"
    ],
    "보안경": [
      "보안경착용",
      "차광보안경",
      "용접면"
    ],
    "귀마개/덮개": [
      "귀마개",
      "귀덮개",
      "방음보호구"
    ],
    "호흡기 마스크": [
      "방진마스크(1급/특급)",
      "방독마스크",
      "송기마스크"
    ],
    "안전대": [
      "상체식하네스",
      "전체식하네스",
      "죔줄/카라비너",
      "충격흡수장치(쇽업소버)",
      "이중고리"
    ],
    "안전장갑": [
      "코팅장갑",
      "절연장갑",
      "가죽용접장갑",
      "내화학장갑"
    ],
    "안전화": [
      "가죽안전화",
      "선심/답판보호",
      "단화/중단화",
      "정전기안전화"
    ],
    "절연장화": [
      "절연화",
      "방수절연장화",
      "정전화"
    ],
    "기타": [
      "기타"
    ]
  }
};
  const agentTree = (tax9 && tax9.agentTree) || window._TAXONOMY_AGENT_TREE_FALLBACK;

  // 3단계 연쇄 한정 패키지 선택기 초기화
  initPackage9x9Selector(agentTree);

  const agentMajorList = Object.keys(agentTree);
  addOpts('listAgentMajor', agentMajorList, 'agentMajor');

  const updateMidOpts = (maj) => {
    let mids = [];
    if (maj && agentTree[maj]) {
      mids = Object.keys(agentTree[maj]);
    } else {
      mids = Object.values(agentTree).flatMap(m => Object.keys(m));
    }
    addOpts('listAgentMid', [...new Set(mids)], 'agentMid');
  };

  const updateMinorOpts = (maj, mid) => {
    let minors = [];
    if (maj && mid && agentTree[maj] && agentTree[maj][mid]) {
      minors = agentTree[maj][mid];
    } else if (mid) {
      for (const m of Object.keys(agentTree)) {
        if (agentTree[m][mid]) minors.push(...agentTree[m][mid]);
      }
    } else if (maj && agentTree[maj]) {
      minors = Object.values(agentTree[maj]).flat();
    } else {
      minors = Object.values(agentTree).flatMap(m => Object.values(m).flat());
    }
    addOpts('listAgentMinor', [...new Set(minors)], 'agentMinor');
  };

  updateMidOpts($('#txtAgentMajor')?.value);
  updateMinorOpts($('#txtAgentMajor')?.value, $('#txtAgentMid')?.value);

  // 이벤트 핸들러 바인딩
  if ($('#txtAgentMajor') && !$('#txtAgentMajor')._boundAgent) {
    const txtMaj = $('#txtAgentMajor');
    const txtMid = $('#txtAgentMid');
    const txtMin = $('#txtAgentMinor');

    txtMaj._boundAgent = true;
    txtMaj.addEventListener('input', () => {
      const majVal = txtMaj.value.trim();
      if ($('#txtKind')) $('#txtKind').value = majVal;
      updateMidOpts(majVal);
      updateMinorOpts(majVal, txtMid ? txtMid.value.trim() : '');
      setPackageSelection(majVal, txtMid ? txtMid.value.trim() : '', txtMin ? txtMin.value.trim() : '');
    });

    if (txtMid) {
      txtMid.addEventListener('input', () => {
        const midVal = txtMid.value.trim();
        if ($('#txtItem')) $('#txtItem').value = midVal;
        const curMaj = txtMaj ? txtMaj.value.trim() : '';
        if (!curMaj) {
          for (const m of Object.keys(agentTree)) {
            if (agentTree[m][midVal]) {
              if (txtMaj) txtMaj.value = m;
              if ($('#txtKind')) $('#txtKind').value = m;
              updateMidOpts(m);
              break;
            }
          }
        }
        updateMinorOpts(txtMaj ? txtMaj.value.trim() : '', midVal);
      });
    }

    if (txtMin) {
      txtMin.addEventListener('input', () => {
        const minVal = txtMin.value.trim();
        if ($('#txtAgent')) $('#txtAgent').value = minVal;
        if (txtMid && !txtMid.value.trim()) {
          for (const m of Object.keys(agentTree)) {
            for (const mi of Object.keys(agentTree[m])) {
              if (agentTree[m][mi].includes(minVal)) {
                if (txtMaj && !txtMaj.value.trim()) {
                  txtMaj.value = m;
                  if ($('#txtKind')) $('#txtKind').value = m;
                  updateMidOpts(m);
                }
                txtMid.value = mi;
                if ($('#txtItem')) $('#txtItem').value = mi;
                updateMinorOpts(txtMaj ? txtMaj.value.trim() : '', mi);
                return;
              }
            }
          }
        }
      });
    }
  }
  const locationsList = (window.SafeExcel && window.SafeExcel.ACCIDENT_LOCATIONS) || STANDARD_LOCATION_CATEGORIES;
  addOpts('listLocations', locationsList, 'location');
  addOpts('listLocationCategories', STANDARD_LOCATION_CATEGORIES, 'locationCategory');

  const typesList = (window.SafeExcel && window.SafeExcel.ACCIDENT_TYPES) || [
    '추락', '낙하', '비래', '붕괴', '도괴', '전복', '전도', '협착',
    '충돌', '추돌', '충격', '접촉', '익사', '질식', '중독', '흡인',
    '화재', '폭발', '화상', '감전', '감염', '질병'
  ];
  addOpts('listTypes', typesList, 'type');

  const workMethods = (window.SafeExcel && window.SafeExcel.WORK_METHODS_9X9) || WORK_METHODS_9X9_IMPROVED;
  const allStdWorkGroups = (window.SafeTextNormalizer && Array.isArray(window.SafeTextNormalizer.OFFICIAL_WORK_GROUPS) && window.SafeTextNormalizer.OFFICIAL_WORK_GROUPS.length > 0)
    ? window.SafeTextNormalizer.OFFICIAL_WORK_GROUPS
    : Object.values(WORK_GROUP_TREE).flat();
  const refreshWorkGroupMinorList = (midVal) => {
    const mid = String(midVal || '').trim();
    const list = (mid && WORK_GROUP_TREE[mid]) ? WORK_GROUP_TREE[mid] : allStdWorkGroups;
    addOpts('listWorkGroups', [...new Set(list)], 'workGroup');
  };
  refreshWorkGroupMinorList($('#selWorkGroupMid')?.value || '');
  if ($('#selWorkGroupMid') && !$('#selWorkGroupMid')._boundWorkGroupMid) {
    $('#selWorkGroupMid')._boundWorkGroupMid = true;
    $('#selWorkGroupMid').addEventListener('change', () => {
      refreshWorkGroupMinorList($('#selWorkGroupMid').value);
      saveDraft();
    });
  }
  if ($('#txtWorkGroup') && !$('#txtWorkGroup')._boundWorkGroupSync) {
    $('#txtWorkGroup')._boundWorkGroupSync = true;
    const syncMidFromMinor = () => {
      const minorVal = $('#txtWorkGroup').value.trim();
      if (!minorVal) return;
      const inferredMid = resolveWorkGroupMid(minorVal, '', '');
      if (inferredMid && $('#selWorkGroupMid') && $('#selWorkGroupMid').value !== inferredMid) {
        $('#selWorkGroupMid').value = inferredMid;
        refreshWorkGroupMinorList(inferredMid);
      }
    };
    $('#txtWorkGroup').addEventListener('change', syncMidFromMinor);
    $('#txtWorkGroup').addEventListener('blur', syncMidFromMinor);
  }
  addOpts('listWorkNames', workMethods, 'workMethod');
  addOpts('listConditions', (tax9 && tax9.unsafeConditionsList) || tax.unsafeConditions.list, 'condition');
  addOpts('listActions', (tax9 && tax9.unsafeActionsList) || tax.unsafeActions.list, 'action');

  // 9×9 점검인자 및 근본원인 datalist
  const m9Areas = (tax9 && tax9.matrix9x9 && tax9.matrix9x9.areas.map(a => a.name)) || [
    '가시설', '건설장비', '작업방법', '작업공도구', '작업발판', '작업장소(환경)', '전기시설', '소방시설', '개인보호구'
  ];
  const m9Targets = (tax9 && tax9.matrix9x9 && tax9.matrix9x9.areas.flatMap(a => a.items)) || [
    '비계', '흙막이', '거푸집/동바리', '특수거푸집', '철골', '데크플레이트', 'PC', '안전시설',
    '굴착장비', '천공장비', '하역운반장비', '양중장비', '탑승장비', '타설장비', '토공장비', '해상장비',
    '굴착작업', '하역운반작업', '양중작업', '중량물취급작업', '설치해체작업', '가공조립작업', '운전조정작업', '고소작업', '기타',
    '화기', '절단기구', '회전기구', '압력기구', '타정기구', '양중기구', '운반기구', '다짐기구',
    '이동식틀비계', '사다리', '말비계', '각립비계', '달비계', '달대비계', '낮은발판', '현장제작발판',
    '안전모', '보안경', '귀마개/덮개', '호흡기 마스크', '안전대', '안전장갑', '안전화', '절연장화',
    '수전시설', '전선이송설비', '분전반', '전선', '접지시설', '조명시설', '냉난방기', '충전시설',
    '비상통로', '화재수신반', '화재감지시설', '스프링쿨러', '임시소방시설', '불티비산방지', '가설건물', '생활화재',
    '습윤장소', '밀폐공간', '협소공간', '조명채광부족', '소음진동', '개구부/단부주변', '중량물 하부/주변', '통로/계단'
  ];
  const m9Specs = (tax9 && tax9.temporaryStructuresDetail && Object.values(tax9.temporaryStructuresDetail).flat()) || [
    '시스템비계', '강관비계', '이동식틀비계', '달비계', '달대비계', '말비계', '각립비계',
    '수직재', '수평재', '모서리부', '토사부', '시스템동바리', '강관동바리', '잭서포트',
    '갱폼', '알폼', '유로폼', 'ACS', 'RCS', '슬립폼', '데크플레이트', '철골', 'PC',
    '추락방지시설(안전난간)', '추락방지시설(덮개)', '추락방지시설(수직방호망)', '추락방지시설(안전대걸이시설)',
    '낙하방지시설(방호선반)', '낙하방지시설(낙하물방지망)'
  ];
  const rootMgmt = (tax9 && tax9.rootCausesLegalSupervision) || [
    '작업계획 미수립', '작업계획 미이행/부족', '작업지시 부족', '작업시설 미설치', '작업시설 유지보수 미실시',
    '안전시설 미설치', '안전시설 유지보수 미실시', '안전점검 미실시', '작업지휘 미실시', '작업지휘자 미배치',
    '유도원 미배치', '신호수 미배치', '신호체계 미지정', '자격·면허·경험자 미배치', '작업범위 및 절차 미교육',
    '관계자 외 출입금지 미조치', '통제시설 미설치', '방호장치 미설치', '보호구 미지급', '보호구 사용 감시 소홀',
    '작업중지 기준 미설정', '운전속도 기준 미설정', '조립도 부실', '구조도/설계도 부실', '감시인(화기/밀폐) 미배치',
    '작업중지/긴급조치 미실시', '계측관리 미실시', '작업환경 측정 미실시', '작업 전 강도 미확인', '조명시설 미설치',
    '정리정돈 미실시', '폐기물 미처리', '청소 미실시', '차수/배수 미처리', '흡연장소 미지정',
    '작업 전 가연물 미차단', '작업 전 전원 미차단', 'LOTO(잠금/표지) 미실시', 'PTW(안전작업허가제) 미실시'
  ];
  const rootSys = (tax9 && tax9.rootCausesSafetyManagementSystem) || [
    '계획: 현장 안전계획 미수립', '계획: 안전계획 직원/협력사 교육 미실시',
    '계획: 중점위험작업 안전대책 미수립/미승인', '계획: 시공계획서 안전대책 미수립/미승인',
    '계획: 위험성평가표 미승인/협력사 미참여', '계획: 건설기계작업계획서 미승인/미이행',
    '실행: 안전교육 미실시', '실행: 안전조회/TBM 미실시', '실행: 일일 작업계획 안전대책 미포함',
    '실행: 안전시설 미설치', '실행: 작업환경 미조성', '실행: 안전보호구 미사용',
    '확인: 일일점검 미실시', '확인: 일일점검 결과 Feedback 미흡',
    '확인: PTW(작업허가) 미실시/Feedback 미흡', '확인: 시정조치 요구 및 이행확인 소홀',
    '개선: 작업자 관리상태 개정관리 미흡', '개선: 위험성평가 피드백 미반영', '개선: 안전협의체 법적기준 미준수'
  ];
  const stakeholders = (tax9 && tax9.stakeholderRoles) || [
    '현장소장', '공사팀장', '시공팀장', '시공담당', '안전팀장',
    '안전관리자', '협력회사 소장', '협력회사 공사팀장', '협력회사 공사담당', '협력회사 안전관리자'
  ];

  addOpts('listMatrixAreas', m9Areas, 'matrixArea');
  addOpts('listMatrixTargets', m9Targets, 'matrixTarget');
  addOpts('listMatrixSpecs', m9Specs, 'matrixSpec');
  addOpts('listRootCausesMgmt', rootMgmt, 'rootCauseMgmt');
  addOpts('listRootCausesSystem', rootSys, 'rootCauseSystem');
  addOpts('listStakeholders', stakeholders, 'stakeholder');
}

function renderSites() {
  const datalist = $('#listSites');
  const expSel = $('#selExportSite');
  
  if (datalist) {
    datalist.innerHTML = store.sites.map(s => `<option value="${s.name}">`).join('');
  }
  
  if (expSel) {
    expSel.innerHTML = '<option value="all">전체 현장 통합</option>' + 
      store.sites.map(s => `<option value="${s.name}">${s.name}</option>`).join('');
  }
}

// ── UI Events ──
function bindEvents() {
  // Navigation
  $$('.bottom-nav .nav-item').forEach(btn => {
    btn.addEventListener('click', () => {
      const viewId = btn.dataset.view;
      if ((viewId === 'viewList' || viewId === 'viewEdu' || viewId === 'viewExport') && !store.user) {
        toast('🔒 부적합 대장은 점검자 PIN 번호를 입력한 사용자만 열람할 수 있습니다.', 'warning', 3200);
        showPinModal();
        return;
      }
      $$('.bottom-nav .nav-item').forEach(b => b.classList.remove('active'));
      $$('.view-section').forEach(v => v.classList.remove('active'));
      btn.classList.add('active');
      $('#' + viewId).classList.add('active');
      if (viewId === 'viewRegister') {
        window.SafeLocalAI?.fetchAiQuota?.({ forceRefresh: false });
        if (!$('#txtSite')?.value) {
          openSiteSelectModal();
        }
      }
      if (viewId === 'viewList') renderRecordList();
      if (viewId === 'viewEdu') populateEduOptions(window._lastImportedRecordId || null);
    });
  });

  // User Profile & Settings
  $('#userBadge')?.addEventListener('click', () => {
    openUserProfileModal();
  });

  // Quick PIN buttons
  $$('.btn-quick-pin').forEach(btn => {
    btn.addEventListener('click', async () => {
      const pin = btn.dataset.pin;
      try {
        await store.login(pin);
        toast(`반갑습니다, ${store.user.name}님`, 'success');
        checkAuth();
      } catch (e) {
        toast(e.message, 'danger');
      }
    });
  });

  // PIN Keypad
  $$('.pin-keypad .key-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const k = btn.dataset.key;
      if (k === 'clear') {
        pinInput = '';
      } else if (k === 'back') {
        pinInput = pinInput.slice(0, -1);
      } else if (pinInput.length < 6) {
        pinInput += k;
      }
      updatePinDisplay();

      if (pinInput.length === 6) {
        try {
          await store.login(pinInput);
          toast(`반갑습니다, ${store.user.name}님`, 'success');
          checkAuth();
        } catch (e) {
          toast(e.message, 'danger');
          pinInput = '';
        }
      }
    });
  });

  
  // ── 현장 선택 팝업 모달 이벤트 ──
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
  });

  // ── 수기 입력 vs PPT/장표 불러오기 모드 전환 ──
  $('#btnModeManual')?.addEventListener('click', () => {
    $('#btnModeManual')?.classList.add('selected');
    $('#btnModeImport')?.classList.remove('selected');
    if ($('#sectionManualMode')) $('#sectionManualMode').style.display = 'block';
    if ($('#sectionImportMode')) $('#sectionImportMode').style.display = 'none';
  });

  $('#btnModeImport')?.addEventListener('click', () => {
    $('#btnModeImport')?.classList.add('selected');
    $('#btnModeManual')?.classList.remove('selected');
    if ($('#sectionManualMode')) $('#sectionManualMode').style.display = 'none';
    if ($('#sectionImportMode')) $('#sectionImportMode').style.display = 'block';
    if ($('#txtSite')?.value && $('#txtImportSite')) {
      $('#txtImportSite').value = $('#txtSite').value;
    }
  });

  // ── 부적합 등급 토글 (중부적합 vs 경부적합) ──
  $('#btnSeverityMajor')?.addEventListener('click', () => {
    currentManualSeverity = '중부적합';
    $('#btnSeverityMajor')?.classList.add('active');
    $('#btnSeverityMinor')?.classList.remove('active');
    $('#btnSeverityMajor').style.background = '#fef2f2';
    $('#btnSeverityMajor').style.color = '#dc2626';
    $('#btnSeverityMinor').style.background = 'white';
    $('#btnSeverityMinor').style.color = '#d97706';
  });

  $('#btnSeverityMinor')?.addEventListener('click', () => {
    currentManualSeverity = '경부적합';
    $('#btnSeverityMinor')?.classList.add('active');
    $('#btnSeverityMajor')?.classList.remove('active');
    $('#btnSeverityMinor').style.background = '#fffbeb';
    $('#btnSeverityMinor').style.color = '#d97706';
    $('#btnSeverityMajor').style.background = 'white';
    $('#btnSeverityMajor').style.color = '#dc2626';
  });

  // ── PPT / 장표 파일 임포트 ──
  $('#filePptxImport')?.addEventListener('change', handlePptxImportChange);
  $('#btnVerifyImportedRecords')?.addEventListener('click', () => handleVerifyImportedRecords({ silent: false }));
  $('#btnSaveImportedRecords')?.addEventListener('click', handleSaveImportedRecords);
  $('#btnClearImported')?.addEventListener('click', () => {
    importedRecords = [];
    if ($('#importPreviewArea')) $('#importPreviewArea').style.display = 'none';
    if ($('#importProgressBox')) $('#importProgressBox').style.display = 'none';
    if ($('#importCardsContainer')) $('#importCardsContainer').innerHTML = '';
    if ($('#filePptxImport')) $('#filePptxImport').value = '';
    toast('불러온 장표 목록이 초기화되었습니다.', 'info');
  });

  // 드래그 앤 드롭 및 붙여넣기(Ctrl+V) 지원 for PPT / 장표
  const importSection = $('#sectionImportMode');
  if (importSection) {
    importSection.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.stopPropagation();
    });
    importSection.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) {
        handlePptxImportChange({ target: { files: e.dataTransfer.files } });
      }
    });
  }
  window.addEventListener('paste', (e) => {
    if ($('#sectionImportMode') && $('#sectionImportMode').style.display !== 'none') {
      const items = e.clipboardData && e.clipboardData.items;
      if (items) {
        const imageFiles = [];
        for (const item of items) {
          if (item.type.startsWith('image/')) {
            const file = item.getAsFile();
            if (file) imageFiles.push(file);
          }
        }
        if (imageFiles.length) {
          e.preventDefault();
          handlePptxImportChange({ target: { files: imageFiles } });
        }
      }
    }
  });

  // Photo Selector
  $('#photoDropArea').addEventListener('click', (e) => {
    if (e.target !== $('#filePhotos')) {
      $('#filePhotos').click();
    }
  });
  $('#filePhotos').addEventListener('change', async (e) => {
    const files = [...e.target.files];
    if (!files.length) return;
    toast('사진 분석 및 최적화 중...', 'info', 1500);

    for (const f of files.slice(0, 3 - currentPhotos.length)) {
      // 💡 직접 수기 입력 모드: 사용자가 선택한 사진을 가공 없이 100% 원본 그대로 등록 (자동 크롭 비활성화)
      const processed = await processImageFile(f, 1280, 0.85, false);
      currentPhotos.push(processed);
      // 첫 사진에 EXIF 촬영일자가 존재하면 점검일자로 자동 주입
      if (processed.dateTaken && currentPhotos.length === 1) {
        $('#txtInspectDate').value = processed.dateTaken;
        toast(`사진 원본 촬영일자(${processed.dateTaken})를 자동 적용했습니다.`, 'info');
      }
    }
    renderPhotoPreviews();
    saveDraft();
  });

  // ── 📐 사진 2장 배치 비율 선택 칩 (직접 등록 화면) ──
  const PHOTO_RATIO_LABELS = {
    'auto': '자동 (사진 면적·비율 비례)',
    '50:50': '50 : 50 균등 분할',
    '60:40': '60 : 40 (사진1 강조)',
    '70:30': '70 : 30 (사진1 확대)',
    '40:60': '40 : 60 (사진2 강조)',
    '30:70': '30 : 70 (사진2 확대)'
  };
  $$('#photoRatioChips .chip').forEach(chip => {
    chip.addEventListener('click', () => {
      selectedPhotoLayoutRatio = chip.dataset.ratio || 'auto';
      $$('#photoRatioChips .chip').forEach(c => c.classList.toggle('selected', c === chip));
      if ($('#lblSelectedPhotoRatio')) {
        $('#lblSelectedPhotoRatio').textContent = PHOTO_RATIO_LABELS[selectedPhotoLayoutRatio] || selectedPhotoLayoutRatio;
      }
      renderPhotoPreviews();
      saveDraft();
    });
  });

  // ── 📚 학습된 안전작업지침(SafeGuidelineMemory) 조회·관리 모달 ──
  $('#btnOpenGuidelineMemory')?.addEventListener('click', () => {
    if ($('#txtGuidelineSearch')) $('#txtGuidelineSearch').value = '';
    renderGuidelineMemoryModal('');
    if ($('#guidelineMemoryModal')) $('#guidelineMemoryModal').style.display = 'flex';
    window.SafeLocalAI?.auditAndFilterGuidelinesWithAI?.()
      .then((res) => {
        if (res && (res.removed || res.updated)) {
          renderGuidelineMemoryModal($('#txtGuidelineSearch')?.value || '');
        }
      })
      .catch(() => {});
  });
  $('#btnCloseGuidelineMemory')?.addEventListener('click', () => {
    if ($('#guidelineMemoryModal')) $('#guidelineMemoryModal').style.display = 'none';
  });
  $('#guidelineMemoryModal')?.addEventListener('click', (e) => {
    if (e.target && e.target.id === 'guidelineMemoryModal') {
      $('#guidelineMemoryModal').style.display = 'none';
    }
  });
  $('#txtGuidelineSearch')?.addEventListener('input', (e) => {
    renderGuidelineMemoryModal(e.target.value || '');
  });
  $('#btnExportGuidelineMemory')?.addEventListener('click', () => {
    const entries = SafeGuidelineMemory.getAll();
    const blob = new Blob([JSON.stringify(entries, null, 2)], { type: 'application/json;charset=utf-8' });
    downloadBlob(blob, `SafeGuidelineMemory_${todayStr()}.json`);
    toast(`학습된 안전작업지침 ${entries.length}건을 JSON 파일로 내보냈습니다.`, 'success');
  });

  // ── [기존 스마트 AI] 내용 기반 온디바이스 자동분류 이벤트 리스너 ──

  // Realtime Smart Auto-classifier on Content Input
  $('#txtContent').addEventListener('input', debounce((e) => {
    saveDraft();
    runSmartClassification(false);
  }, 200));

  // Focus 시에도 내용이 있으면 자동 표시
  $('#txtContent').addEventListener('focus', () => {
    if (($('#txtContent')?.value || '').trim().length >= 2) {
      runSmartClassification(false);
    }
  });

  // [기존 스마트 AI] 수동 원클릭 실행 버튼
  $('#btnRunSmartClassifier')?.addEventListener('click', () => {
    const txt = ($('#txtContent')?.value || '').trim();
    if (!txt) {
      toast('먼저 [부적합 내용]에 지적사항을 입력하세요.', 'warning');
      $('#txtContent')?.focus();
      return;
    }
    runSmartClassification(true);
  });

  // 추천 박스 닫기 버튼
  $('#btnCloseSmartClassify')?.addEventListener('click', () => {
    const box = $('#smartClassifyBox');
    if (box) {
      box.classList.remove('active');
      box.style.display = 'none';
    }
  });

  // Apply Smart Recommendation (추천 분류 적용)
  $('#btnApplySmart').addEventListener('click', () => {
    if (!smartResult) return;
    smartRecommendationApplied = true;
    appliedSmartResult = { ...smartResult };
    const maj = smartResult.기인물대 || smartResult.점검영역9x9 || smartResult.종류 || '가시설';
    const mid = smartResult.기인물중 || smartResult.점검대상9x9 || smartResult.항목 || '비계';
    const min = smartResult.기인물소 || (smartResult.기인물 && smartResult.기인물[0]) || smartResult.가시설세부사양 || '';
    setPackageSelection(maj, mid, min);
    if ($('#txtAgentMajor')) $('#txtAgentMajor').value = maj;
    if ($('#txtAgentMid')) $('#txtAgentMid').value = mid;
    if ($('#txtAgentMinor')) $('#txtAgentMinor').value = min;
    if ($('#txtKind')) $('#txtKind').value = maj;
    if ($('#txtItem')) $('#txtItem').value = mid;
    if ($('#txtAgent')) $('#txtAgent').value = min;
    $('#txtType').value = smartResult.유형 || '';
    $('#txtLaw').value = smartResult.산업안전보건법 || '';
    if (smartResult.상태) $('#txtCondition').value = smartResult.상태;
    if (smartResult.행동) $('#txtAction').value = smartResult.행동;

    // ── 9×9 점검인자 및 근본원인 적용 ──
    if ($('#txtMatrixArea')) $('#txtMatrixArea').value = smartResult.점검영역9x9 || '';
    if ($('#txtMatrixTarget')) $('#txtMatrixTarget').value = smartResult.점검대상9x9 || '';
    if ($('#txtMatrixSpec')) $('#txtMatrixSpec').value = smartResult.가시설세부사양 || '';
    if ($('#txtRootCauseMgmt')) $('#txtRootCauseMgmt').value = smartResult.근본원인_관리감독 || '';
    if ($('#txtRootCauseSystem')) $('#txtRootCauseSystem').value = smartResult.근본원인_안전시스템 || '';
    if ($('#txtStakeholder')) $('#txtStakeholder').value = smartResult.관리책임주체 || '';

    // 발생원인 칩 동기화
    selectedCauses.clear();
    (smartResult.발생원인 || []).forEach(c => selectedCauses.add(c));
    updateCauseChips();

    const applyStatus = $('#smartApplyStatus');
    if (applyStatus) {
      applyStatus.style.display = 'inline-block';
      applyStatus.textContent = '✅ 아래 입력폼에 적용되었습니다';
    }
    toast('스마트 자동분류가 적용되었습니다. 필요 시 수정하시면 AI가 자동 학습합니다.', 'success');
    saveDraft();
  });

  // Cause Chips Multi-select
  $$('#causeChips .chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const c = chip.dataset.cause;
      if (selectedCauses.has(c)) selectedCauses.delete(c);
      else selectedCauses.add(c);
      updateCauseChips();
      saveDraft();
    });
  });

// ── [v65] AI 응답 실패 시 사유 안내 모달 팝업 (무응답·한도초과·5단계 폴백 실패 시 침묵 처리 전면 금지!) ──
function showAiFailurePopup({ stage = 'AI 자동 분석', failedCount = 0, totalCount = 0, reasons = [], quotaExceeded = false } = {}) {
  const uniqueReasons = [...new Set((Array.isArray(reasons) ? reasons : [reasons]).map(r => String(r || '').trim()).filter(Boolean))];
  const reasonText = uniqueReasons.length
    ? uniqueReasons.map(r => `• ${r}`).join('\n')
    : '• 클라우드 AI 5단계 폴백 모델(Llama-3.3 / Gemma-4 / GLM-4.7 / Qwen-3.8 / GPT-OSS) 모두로부터 유효한 응답을 받지 못했습니다.';
  const countLine = totalCount > 0
    ? `영향 항목: ${failedCount > 0 ? `${Math.min(failedCount, totalCount)}건` : '일부 항목'} / 전체 ${totalCount}건`
    : (failedCount > 0 ? `실패 건수: ${failedCount}건` : '');
  const guidance = quotaExceeded
    ? 'Cloudflare 무료 일일 AI 할당량(10,000 Neurons)이 소진되었습니다. UTC 자정 초기화 후 다시 시도하거나 Worker 환경변수(GEMINI_API_KEY) 또는 로컬 LM Studio를 연결해 주세요.'
    : '일시적 AI 서버 지연 또는 네트워크 오류로 관련기준·띄어쓰기·분류 일부가 AI 검증되지 못했습니다. 공란/오류를 확인하시거나 잠시 후 [🤖 등록 전 AI 최종 검증]을 다시 실행해 주세요.';

  if (typeof document === 'undefined' || !document.body) {
    if (typeof alert === 'function') alert(`⚠️ AI 응답 실패 (${stage})\n${countLine}\n\n[실패 사유]\n${reasonText}\n\n${guidance}`);
    return;
  }

  let modal = document.getElementById('spAiFailureModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'spAiFailureModal';
    modal.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(15,23,42,0.62);display:flex;align-items:center;justify-content:center;padding:16px;';
    document.body.appendChild(modal);
  }
  const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  modal.innerHTML = `
    <div style="background:#ffffff;max-width:460px;width:100%;border-radius:14px;box-shadow:0 20px 50px rgba(0,0,0,0.3);overflow:hidden;border:2px solid #ef4444;">
      <div style="background:#fef2f2;padding:14px 18px;border-bottom:1px solid #fecaca;display:flex;align-items:center;justify-content:space-between;">
        <div style="display:flex;align-items:center;gap:8px;color:#b91c1c;font-weight:800;font-size:1.02rem;">
          <span>⚠️ AI 응답 실패</span>
          <span style="font-size:0.75rem;background:#fee2e2;padding:2px 7px;border-radius:999px;border:1px solid #fca5a5;">${esc(stage)}</span>
        </div>
        <button type="button" id="btnCloseAiFailX" style="border:none;background:transparent;font-size:1.2rem;cursor:pointer;color:#991b1b;font-weight:700;">✕</button>
      </div>
      <div style="padding:16px 18px;font-size:0.86rem;color:#1e293b;line-height:1.55;">
        ${countLine ? `<div style="font-weight:700;color:#991b1b;margin-bottom:8px;">${esc(countLine)}</div>` : ''}
        <div style="font-weight:700;margin-bottom:4px;color:#334155;">실패 사유</div>
        <div style="background:#f8fafc;border:1px solid #cbd5e1;border-radius:8px;padding:10px 12px;white-space:pre-line;font-size:0.81rem;color:#0f172a;margin-bottom:12px;">${esc(reasonText)}</div>
        <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:9px 11px;font-size:0.79rem;color:#92400e;">💡 ${esc(guidance)}</div>
      </div>
      <div style="padding:12px 18px;background:#f8fafc;border-top:1px solid #e2e8f0;display:flex;justify-content:flex-end;">
        <button type="button" id="btnCloseAiFailOk" style="background:#dc2626;color:#fff;border:none;border-radius:8px;padding:8px 18px;font-weight:700;font-size:0.86rem;cursor:pointer;">확인</button>
      </div>
    </div>
  `;
  modal.style.display = 'flex';
  const closeFn = () => { modal.style.display = 'none'; };
  modal.querySelector('#btnCloseAiFailX')?.addEventListener('click', closeFn);
  modal.querySelector('#btnCloseAiFailOk')?.addEventListener('click', closeFn);
  modal.addEventListener('click', (ev) => { if (ev.target === modal) closeFn(); });
}

  // Submit Patrol Record
  $('#btnSubmitRecord').addEventListener('click', async () => {
    if (!store.user) {
      toast('🔒 부적합을 등록하려면 점검자 PIN 번호(6자리) 로그인이 필요합니다.', 'warning', 3500);
      showPinModal();
      return;
    }

    const site = $('#txtSite').value.trim();
    const content = $('#txtContent').value.trim();
    const location = $('#txtLocation').value.trim();
    const workName = $('#txtWorkName').value.trim();
    const inspectedDate = $('#txtInspectDate').value;

    if (!site) {
      toast('현장명을 입력해주세요.', 'danger');
      return;
    }
    if (!currentPhotos.length) {
      toast('📸 부적합 사진을 1장 이상 첨부해야 등록을 진행할 수 있습니다.', 'danger', 4000);
      const photoArea = $('#photoDropArea') || $('#photoPreviewContainer') || $('#filePhoto');
      if (photoArea) {
        photoArea.scrollIntoView({ behavior: 'smooth', block: 'center' });
        const prevBorder = photoArea.style.border;
        photoArea.style.border = '2px solid #ef4444';
        setTimeout(() => { photoArea.style.border = prevBorder; }, 2500);
      }
      return;
    }
    if (!content) {
      toast('부적합 내용을 입력해주세요.', 'danger');
      return;
    }
    if (!location || !workName) {
      toast('장소 및 작업명을 입력해주세요.', 'danger');
      return;
    }

    // 신규 수기 입력된 현장명인지 확인 후 자동 등록 및 저장
    let siteObj = store.sites.find(s => s.name === site);
    if (!siteObj) {
      siteObj = { name: site, progress: '', scale: '', amount: '' };
      store.sites.push(siteObj);
      await store.saveSites(store.sites);
      renderSites(); // datalist 및 필터 드롭다운 즉시 갱신
    }
    const progressVal = parseFloat($('#txtProgressRate')?.value || 35);
    const productTypeVal = $('#selProductType')?.value || '공동주택';
    const workGroupVal = $('#txtWorkGroup')?.value.trim() || '';
    const workGroupMidVal = $('#selWorkGroupMid')?.value || resolveWorkGroupMid(workGroupVal, '', content);
    const locationCategoryVal = $('#txtLocationCategory')?.value.trim() || inferLocationCategory('', location, content);
    const normalizedWorkMethod = normalizeWorkMethod9x9(
      (workName === '안전점검' ? '' : workName),
      workGroupVal,
      content,
      location
    );
    const stageObj = determineStandardStage(progressVal, workGroupVal, productTypeVal);

    const mgmtCauses = selectedCauses.size > 0 ? [...selectedCauses] : [
      $('#chkMgmtPlanNotMade')?.checked ? '계획 미수립' : null,
      $('#chkMgmtPlanNotFollowed')?.checked ? '계획 미이행' : null,
      $('#chkMgmtUnsafeAction')?.checked ? '불안전 행동' : null,
      $('#chkMgmtUnsafeCondition')?.checked ? '불안전 상태' : null,
    ].filter(Boolean);

    const agentMajor = $('#txtAgentMajor')?.value.trim() || $('#txtKind')?.value.trim() || '가시설';
    const agentMid = $('#txtAgentMid')?.value.trim() || $('#txtItem')?.value.trim() || '비계';
    const agentMinor = $('#txtAgentMinor')?.value.trim() || $('#txtAgent')?.value.trim() || '';

    const matrixArea = $('#txtMatrixArea')?.value.trim() || agentMajor;
    const matrixTarget = $('#txtMatrixTarget')?.value.trim() || agentMid;
    const matrixSpec = $('#txtMatrixSpec')?.value.trim() || agentMinor;
    const rootCauseMgmt = $('#txtRootCauseMgmt')?.value.trim() || '';
    const rootCauseSystem = $('#txtRootCauseSystem')?.value.trim() || '';
    const stakeholder = $('#txtStakeholder')?.value?.trim() || '';

    const record = {
      site,
      productType: productTypeVal,
      progressRate: progressVal,
      stage: stageObj.name,
      severity: currentManualSeverity || '중부적합',
      subcontractor: $('#txtSubcontractor')?.value.trim() || '',
      inspectRound: $('#txtInspectRound')?.value.trim() || '1차',
      siteInfo: {
        progress: progressVal + '%',
        scale: siteObj.scale || '',
        amount: siteObj.amount || ''
      },
      content,
      location,
      locationCategory: locationCategoryVal,
      workName: normalizedWorkMethod,
      workMethod: normalizedWorkMethod,
      workGroupMid: workGroupMidVal,
      workGroup: workGroupVal,
      photoLayoutRatio: selectedPhotoLayoutRatio || 'auto',
      agentMajor: $('#txtAgentMajor')?.value.trim() || $('#txtKind')?.value.trim() || '가시설',
      agentMid: $('#txtAgentMid')?.value.trim() || $('#txtItem')?.value.trim() || '비계',
      agentMinor: $('#txtAgentMinor')?.value.trim() || $('#txtAgent')?.value.trim() || '',
      kind: $('#txtAgentMajor')?.value.trim() || $('#txtKind')?.value.trim() || '가시설',
      item: $('#txtAgentMid')?.value.trim() || $('#txtItem')?.value.trim() || '비계',
      agent: $('#txtAgentMinor')?.value.trim() || $('#txtAgent')?.value.trim() || '',
      type: $('#txtType').value.trim(),
      condition: $('#txtCondition').value.trim(),
      action: $('#txtAction').value.trim(),
      matrixArea,
      matrixTarget,
      matrixSpec,
      rootCauseMgmt,
      rootCauseSystem,
      stakeholder,
      mgmtCauses,
      holdPoint: !!$('#chkHoldPoint')?.checked,
      photoBanner: $('#txtPhotoBanner')?.value.trim() || '',
      photo2Banner: $('#txtPhoto2Banner')?.value.trim() || '',
      interviewOpinion: $('#txtInterviewOpinion')?.value.trim() || '',
      interviewAuthor: $('#txtInterviewOpinion')?.value.trim() ? '시공관리자 및 근로자' : '',
      interviewAuthorTitle: $('#txtInterviewOpinion')?.value.trim() ? '[의견 : 시공관리자 및 근로자]' : '',
      inspectorOpinionType: $('#selInspectorOpinionType')?.value || '',
      _hasExplicitPropType: Boolean($('#selInspectorOpinionType')?.value),
      auditProposal: $('#txtAuditProposal')?.value.trim() || '',
      pmVerdict: $('#txtPmVerdict')?.value.trim() || '',
      pmVerdictType: $('#txtPmVerdict')?.value.trim() || '',
      _hasExplicitPmVerdict: Boolean($('#txtPmVerdict')?.value.trim()),
      _manualEntry: true,
      workPlan: '해당없음',
      rawLaw: $('#txtLaw').value.trim(),
      lawBody: aiAnalyzedLawBody || '',
      basis: {
        ra: '반영',
        cp: '해당없음',
        st: '해당없음',
        guide: '',
        law: $('#txtLaw').value.trim(),
        점검영역9x9: matrixArea,
        점검대상9x9: matrixTarget,
        가시설세부사양: matrixSpec,
        근본원인_관리감독: rootCauseMgmt,
        근본원인_안전시스템: rootCauseSystem,
        관리책임주체: stakeholder
      },
      law: $('#txtLaw').value.trim(),
      causes: [...selectedCauses],
      inspectedDate
    };

    const media = {
      photos: currentPhotos.map(p => ({ blob: p.blob }))
    };

    const btn = $('#btnSubmitRecord');
    btn.disabled = true;
    btn.textContent = '🤖 등록 전 AI 최종 검증 중...';

    try {
      const currentManualSig = buildManualAiSig({
        content: record.content,
        location: record.location,
        workGroup: record.workGroup,
        law: record.law,
        lawBody: record.lawBody,
        photoBanner: record.photoBanner
      });
      const alreadyManualAiClean = Boolean(
        lastManualAiVerifiedSig &&
        lastManualAiVerifiedSig === currentManualSig &&
        record.law && record.lawBody && record.workGroup && record.workMethod && record.agentMajor && record.photoBanner &&
        !window.SafeTextNormalizer?.isLawBodyOverflowing?.(record.lawBody || '') &&
        !/[가-힣]{9,}/.test([record.content, record.interviewOpinion, record.auditProposal, record.actionPlan].join(' '))
      );
      if (window.SafeLocalAI?.verifyRecordsBeforeSave && !alreadyManualAiClean) {
        try {
          window.SafeLocalAI.clearAiFailures?.();
          const vRes = await window.SafeLocalAI.verifyRecordsBeforeSave([record]);
          if (window.SafeTextNormalizer?.isLawBodyOverflowing?.(record.lawBody || '') && window.SafeLocalAI?.condenseOverflowLawBodiesWithAI) {
            await window.SafeLocalAI.condenseOverflowLawBodiesWithAI([record]);
          }
          if (record.law && record.basis) record.basis.law = record.law;
          if (record.workMethod) record.workName = record.workMethod;
          const failInfo = window.SafeLocalAI.getAiFailureSummary?.();
          if ((vRes && vRes.aiFailed) || (failInfo && failInfo.hasFailure)) {
            showAiFailurePopup({
              stage: '수기 등록 AI 검증',
              failedCount: 1,
              totalCount: 1,
              reasons: failInfo?.reasons || ['AI 응답 실패'],
              quotaExceeded: Boolean(failInfo?.quotaExceeded || vRes?.quotaExceeded)
            });
          }
        } catch (vErr) {
          console.warn('Manual pre-save AI verify fallback:', vErr);
          showAiFailurePopup({
            stage: '수기 등록 AI 검증',
            failedCount: 1,
            totalCount: 1,
            reasons: [vErr?.message || 'AI 검증 호출 오류']
          });
        }
      }
      btn.textContent = '저장 중...';
      await store.saveRecord(record, media, msg => { btn.textContent = msg; });
      if (record._photoUploadWarning) {
        toast(`⚠️ ${record._photoUploadWarning}`, 'warning', 5500);
      }
      saveSiteMetaCache(site, progressVal, productTypeVal);
      
      // 사용자 직접입력 단어들을 customValues에 누적 학습
      await store.addCustomValues({
        item: [record.item],
        agent: [record.agent],
        workName: [record.workName],
        workGroup: [record.workGroup],
        matrixArea: [record.matrixArea],
        matrixTarget: [record.matrixTarget],
        matrixSpec: [record.matrixSpec],
        rootCauseMgmt: [record.rootCauseMgmt],
        rootCauseSystem: [record.rootCauseSystem],
        stakeholder: [record.stakeholder]
      });

      // 자주 사용하는 표준 분류 빈도수 실시간 누적 및 상위 정렬 갱신
      try {
        if (typeof FieldFrequencyManager !== 'undefined') {
          FieldFrequencyManager.recordSavedRecord(record);
          populateDatalists();
        }
        window.SafeGuidelineMemory?.learnFromRecord?.(record, 'user_saved');
        updateGuidelineMemoryCount();
      } catch (freqErr) {
        console.warn('FieldFrequency update error:', freqErr);
      }

      // ── 사용자 피드백 기반 강화학습(Online Bandit RL) 훈련 및 가중치 저장 ──
      if (classifier && classifier.trainFeedback) {
        try {
          const fb = classifier.trainFeedback({
            inputContent: record.content,
            recommendedResult: smartRecommendationApplied ? appliedSmartResult : null,
            finalSavedRecord: record,
            applied: smartRecommendationApplied
          });
          if (fb) {
            await store.saveRLWeights(classifier.getWeightsData()).catch(e => console.warn('Save RL error:', e));
            if (fb.diffs && fb.diffs.length) {
              toast(`🧠 추천 수정사항(${fb.diffs.length}건)을 분석하여 오답 감점 및 정답 가중치를 강화학습했습니다!`, 'info', 3200);
            } else if (fb.reward >= 1.0) {
              toast(`🎯 추천 분류가 완벽 적중하여 정확도 보상(+${fb.reward.toFixed(1)}) 가중치가 강화되었습니다!`, 'success', 3000);
            }
          }
        } catch (rlErr) {
          console.warn('RL feedback error:', rlErr);
        }
      }
      smartRecommendationApplied = false;
      appliedSmartResult = null;

      toast('부적합 사항이 정상 등록되었습니다!', 'success');
      // 등록 직후 클라우드 서버 즉시 백그라운드 동기화
      store.syncLocalToServer().catch(e => console.warn('Post-submit sync error:', e));
      clearForm();
      clearDraft();
    } catch (err) {
      console.error('Record save error:', err);
      // 이미 로그인되어 있는 상태라면 절대 PIN 모달을 다시 띄우지 않음
      if (!store.user) {
        toast('🔒 점검자 인증이 필요합니다. 6자리 PIN 번호를 입력해주세요.', 'warning', 3500);
        showPinModal();
      } else {
        // 서버 동기화 실패 시에도 로컬 캐시에 보존됨을 안내
        toast(`저장 완료 알림: 로컬 기기에 안전하게 저장되었습니다. (서버 동기화: ${err.message})`, 'info', 4000);
        clearForm();
        clearDraft();
      }
    } finally {
      btn.disabled = false;
      btn.textContent = '등록 저장하기';
    }
  });

  // Excel Download Action (월별 또는 기간 직접지정 지원)
  $('#btnDownloadExcel').addEventListener('click', async () => {
    const filterSite = $('#selExportSite').value;
    const btn = $('#btnDownloadExcel');
    btn.disabled = true;
    btn.textContent = '엑셀 생성 중...';

    try {
      let records = [];
      let periodLabel = '';

      if (exportPeriodMode === 'all') {
        records = await store.listAll();
        periodLabel = '전체누적';
      } else if (exportPeriodMode === 'month') {
        const bucket = $('#selExportMonth').value;
        if (!bucket) {
          toast('대상 월을 선택해주세요.', 'danger');
          btn.disabled = false;
          btn.textContent = '📥 부적합사항대장.xlsx 다운로드';
          return;
        }
        records = await store.listMonth(bucket);
        periodLabel = bucket;
      } else {
        const start = $('#txtExportStartDate').value;
        const end = $('#txtExportEndDate').value;
        if (!start || !end) {
          toast('시작일과 종료일을 모두 입력해주세요.', 'danger');
          btn.disabled = false;
          btn.textContent = '📥 부적합사항대장.xlsx 다운로드';
          return;
        }
        records = await store.listPeriod(start, end);
        periodLabel = `${start}_${end}`;
      }

      if (filterSite !== 'all') {
        records = records.filter(r => r.site === filterSite);
      }

      if (!records.length) {
        toast(`선택한 기간에 등록된 부적합 데이터가 없습니다.`, 'danger');
        btn.disabled = false;
        btn.textContent = '📥 부적합사항대장.xlsx 다운로드';
        return;
      }

      // [v63 A1 초고속 엑셀 생성] O(N^2) 바이트 루프 제거 + 260×195 경량 JPEG 썸네일 리사이즈·메모리 캐시로 73건(150장) 엑셀 생성 속도 15배+ 가속
      btn.textContent = '엑셀 파일 생성 중...';
      const excelThumbCache = new Map();
      const fastArrayBufferToBase64 = (buf) => {
        const bytes = new Uint8Array(buf);
        const CHUNK = 0x8000;
        let bin = '';
        for (let i = 0; i < bytes.length; i += CHUNK) {
          bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
        }
        return btoa(bin);
      };

      const wb = await window.SafeExcel.build(window.ExcelJS, {
        records,
        taxonomy: { ...store.taxonomy, _tax9: store.taxonomy9x9 },
        customValues: store.custom.customValues,
        sites: store.sites,
        onPhotoProgress: (cur, tot) => {
          btn.textContent = `엑셀 사진 불러오는 중 (${cur}/${tot})...`;
        },
        loadImage: async (path) => {
          if (excelThumbCache.has(path)) return excelThumbCache.get(path);
          const blob = await store.photoBlob(path);
          if (!blob) return null;
          let resObj = null;
          // [v65] 이미 경량 JPEG(<=450KB)인 추출 사진은 불필요한 Canvas 재압축을 완전 생략해 즉시 Base64 변환! (초대용량 원본 폰카 사진 >450KB만 리사이즈)
          const isSmallJpeg = blob.size > 0 && blob.size <= 450 * 1024 && (!blob.type || /jpe?g/i.test(blob.type));
          if (!isSmallJpeg && typeof createImageBitmap === 'function' && typeof document !== 'undefined') {
            try {
              const bmp = await createImageBitmap(blob);
              const maxW = 360, maxH = 270;
              const scale = Math.min(1, maxW / Math.max(1, bmp.width), maxH / Math.max(1, bmp.height));
              const tw = Math.max(1, Math.round(bmp.width * scale));
              const th = Math.max(1, Math.round(bmp.height * scale));
              const cvs = document.createElement('canvas');
              cvs.width = tw;
              cvs.height = th;
              cvs.getContext('2d').drawImage(bmp, 0, 0, tw, th);
              if (typeof bmp.close === 'function') bmp.close();
              const dataUrl = cvs.toDataURL('image/jpeg', 0.80);
              const comma = dataUrl.indexOf(',');
              if (comma > 0) {
                resObj = { base64: dataUrl.slice(comma + 1), extension: 'jpeg' };
              }
            } catch (_) {}
          }
          if (!resObj) {
            const buf = await blob.arrayBuffer();
            const ext = /png/i.test(blob.type || '') ? 'png' : 'jpeg';
            resObj = { base64: fastArrayBufferToBase64(buf), extension: ext };
          }
          excelThumbCache.set(path, resObj);
          return resObj;
        }
      });

      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], { 
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
      });
      const filename = `부적합사항대장_${periodLabel}${filterSite !== 'all' ? '_' + filterSite : ''}.xlsx`;
      downloadBlob(blob, filename);

      toast('부적합사항대장 엑셀 파일이 다운로드되었습니다.', 'success');
    } catch (e) {
      console.error(e);
      toast(`엑셀 다운로드 오류: ${e.message}`, 'danger');
    } finally {
      btn.disabled = false;
      btn.textContent = '📥 부적합사항대장.xlsx 다운로드';
    }
  });

  // ── 현장 패트롤 점검장표 PPT 자동 생성 및 다운로드 핸들러 ──
  $('#btnPreviewEdu')?.addEventListener('click', () => updateEduPreview());
  
  $('#btnDownloadJangpyoPpt')?.addEventListener('click', function (e) {
    e.preventDefault();
    e.stopPropagation();
    if (this.disabled) return;
    downloadSingleJangpyoPPT(this);
  });
  $('#btnDownloadJangpyoPptBottom')?.addEventListener('click', function (e) {
    e.preventDefault();
    e.stopPropagation();
    if (this.disabled) return;
    downloadSingleJangpyoPPT(this);
  });

  $('#btnDownloadAllJangpyoPpt')?.addEventListener('click', function (e) {
    e.preventDefault();
    e.stopPropagation();
    if (this.disabled) return;
    downloadBatchJangpyoPPT(currentEduRecords, this, currentEduPeriodLabel || '전체');
  });

  $('#btnTableBatchJangpyo')?.addEventListener('click', function (e) {
    e.preventDefault();
    e.stopPropagation();
    if (this.disabled) return;
    const checkedBoxes = Array.from(document.querySelectorAll('.chk-record-item:checked'));
    let records = [];
    if (checkedBoxes.length > 0) {
      const ids = new Set(checkedBoxes.map(cb => cb.dataset.id));
      records = currentLoadedRecords.filter(r => ids.has(r.id));
    } else {
      records = currentLoadedRecords;
    }
    if (!records.length) {
      toast('점검장표로 생성할 부적합 항목이 없습니다.', 'warning');
      return;
    }
    downloadBatchJangpyoPPT(records, this, `${records.length}건`);
  });

  function shiftIsoDateDays(isoDate, deltaDays) {
    const dt = new Date(`${isoDate}T00:00:00Z`);
    if (Number.isNaN(dt.getTime())) return isoDate;
    dt.setUTCDate(dt.getUTCDate() + deltaDays);
    return dt.toISOString().slice(0, 10);
  }

  function prevMonthBucket(bucket) {
    const m = String(bucket || '').match(/^(\d{4})-(\d{2})$/);
    if (!m) return '';
    let y = Number(m[1]);
    let mo = Number(m[2]) - 1;
    if (mo <= 0) { y -= 1; mo = 12; }
    return `${y}-${String(mo).padStart(2, '0')}`;
  }

  async function collectExportReportPayload(filterSite) {
    const applySite = (list) => (filterSite !== 'all' ? (list || []).filter(r => r.site === filterSite) : (list || []));
    const allRecords = await store.listAll().catch(() => []);
    let records = [];
    let priorRecords = null;
    let month = '';
    let rangeStart = '';
    let rangeEnd = '';
    let periodLabel = '';
    let filePeriodLabel = '';

    if (exportPeriodMode === 'all') {
      records = applySite(allRecords);
      periodLabel = '전체 누적 기간';
      filePeriodLabel = '전체누적';
    } else if (exportPeriodMode === 'month') {
      const bucket = $('#selExportMonth').value;
      if (!bucket) {
        toast('대상 월을 선택해주세요.', 'danger');
        return null;
      }
      month = bucket;
      periodLabel = bucket;
      filePeriodLabel = bucket;
      records = applySite(await store.listMonth(bucket));
      const prevB = prevMonthBucket(bucket);
      if (prevB) {
        priorRecords = applySite(await store.listMonth(prevB).catch(() => []));
      }
    } else {
      const start = $('#txtExportStartDate').value;
      const end = $('#txtExportEndDate').value;
      if (!start || !end) {
        toast('시작일과 종료일을 모두 입력해주세요.', 'danger');
        return null;
      }
      rangeStart = start;
      rangeEnd = end;
      periodLabel = `${start} ~ ${end}`;
      filePeriodLabel = `${start}_${end}`;
      records = applySite(await store.listPeriod(start, end));
      const sMs = Date.parse(`${start}T00:00:00Z`);
      const eMs = Date.parse(`${end}T00:00:00Z`);
      if (!Number.isNaN(sMs) && !Number.isNaN(eMs) && eMs >= sMs) {
        const spanDays = Math.max(1, Math.round((eMs - sMs) / 86400000) + 1);
        const prevEnd = shiftIsoDateDays(start, -1);
        const prevStart = shiftIsoDateDays(prevEnd, -(spanDays - 1));
        priorRecords = applySite(await store.listPeriod(prevStart, prevEnd).catch(() => []));
      }
    }

    if (!records.length) {
      toast('PPT를 생성할 점검 데이터가 없습니다.', 'danger');
      return null;
    }

    return {
      records,
      allRecords,
      priorRecords,
      sites: store.sites || [],
      siteName: filterSite === 'all' ? '전 현장 종합' : filterSite,
      siteLabel: filterSite === 'all' ? '전체 현장 통합' : filterSite,
      periodMode: exportPeriodMode,
      month,
      rangeStart,
      rangeEnd,
      periodLabel,
      filePeriodLabel,
      inspector: (store.user && store.user.name) || '안전관리자',
      loadPhotoBase64: (path) => resolvePhotoBase64ForPPT(path)
    };
  }

  async function runPptDownload(kind) {
    const isWorker = kind === 'worker';
    const isDetailHtml = kind === 'detailHtml';
    const btnSelector = isWorker
      ? '#btnDownloadWorkerPPT'
      : (isDetailHtml ? '#btnDownloadDetailHTML' : '#btnDownloadPPT');
    const btn = $(btnSelector);
    if (!btn) return;
    const origText = btn.textContent;
    btn.disabled = true;
    btn.textContent = isWorker
      ? '근로자용 TBM PPT 제작 중...'
      : (isDetailHtml ? '상세 분석 HTML · 링크 생성 중...' : '관리자용 보고서 PPT 제작 중...');

    try {
      const payload = await collectExportReportPayload($('#selExportSite').value);
      if (!payload) return;

      let shareConfig = null;
      if (isDetailHtml && store.mode === 'github' && store.backend && store.backend.url && store.backend.pin) {
        const randBytes = new Uint8Array(6);
        if (window.crypto && typeof window.crypto.getRandomValues === 'function') {
          window.crypto.getRandomValues(randBytes);
        } else {
          for (let i = 0; i < randBytes.length; i++) randBytes[i] = Math.floor(Math.random() * 256);
        }
        const randHex = Array.from(randBytes, (b) => b.toString(16).padStart(2, '0')).join('');
        const shareId = `rpt_${Date.now().toString(36)}_${randHex}`;
        const host = (window.location && window.location.hostname) || '';
        const isHostedWeb = /^https?:$/i.test((window.location && window.location.protocol) || '') && !/^(localhost|127\.0\.0\.1)$/i.test(host);
        const viewerBaseUrl = isHostedWeb
          ? new URL('report.html', window.location.href).href.split('#')[0].split('?')[0]
          : 'https://abraxass0511-lab.github.io/JS-AIC/report.html';
        const baseAppUrl = viewerBaseUrl.replace(/\/report\.html$/, '/');
        shareConfig = {
          shareId,
          workerUrl: store.backend.url,
          viewerUrl: `${viewerBaseUrl}?id=${encodeURIComponent(shareId)}`,
          baseAppUrl,
          publish: (sharePayload) => store.backend.writeJSON(`shares/${shareId}.json`, sharePayload, null, `share report ${shareId}`),
        };
      }

      const fn = isWorker
        ? window.SafePPT.generateWorkerPresentation
        : (isDetailHtml ? window.SafePPT.generateManagerDetailHtml : window.SafePPT.generatePresentation);
      const res = await fn({ ...payload, shareConfig, download: true });
      const okMsg = isWorker
        ? '근로자용 TBM PPT가 성공적으로 다운로드되었습니다.'
        : (isDetailHtml
          ? (res && res.shareUrl
            ? '관리자용 상세 분석 HTML이 다운로드되었습니다. (HTML 우측 상단 [🔗 링크 복사]로 공유 URL 복사 가능)'
            : '관리자용 상세 분석 HTML 보고서가 다운로드되었습니다.')
          : '관리자용 보고서 PPT가 성공적으로 다운로드되었습니다.');
      toast(okMsg, 'success');
    } catch (e) {
      console.error(e);
      toast(`보고서 생성 실패: ${e.message}`, 'danger');
    } finally {
      btn.disabled = false;
      btn.textContent = origText;
    }
  }

  // ── 관리자용 PPT / 상세 HTML / 근로자용 PPT 자동 생성 핸들러 (월별 또는 기간 직접지정 지원) ──
  $('#btnDownloadPPT')?.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); runPptDownload('manager'); });
  $('#btnDownloadDetailHTML')?.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); runPptDownload('detailHtml'); });
  $('#btnDownloadWorkerPPT')?.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); runPptDownload('worker'); });

  // Fix Action Dialog
  $('#btnCancelFix').addEventListener('click', () => { $('#fixModal').style.display = 'none'; });
  $('#fileFixPhoto').addEventListener('change', async (e) => {
    const f = e.target.files[0];
    if (f) {
      fixPhotoData = await processImageFile(f);
      $('#fixPhotoPreview').innerHTML = `<img src="${fixPhotoData.previewUrl}" style="max-height: 120px; border-radius: 6px;">`;
    }
  });

  $('#btnSaveFix').addEventListener('click', async () => {
    const content = $('#txtFixContent').value.trim();
    if (!content) {
      toast('조치내용을 입력해주세요.', 'danger');
      return;
    }
    if (!targetFixRecord) return;

    targetFixRecord.fix = {
      content,
      date: todayStr()
    };

    const media = {
      photos: (targetFixRecord.photos || []).map(p => ({ path: p })),
      fixPhoto: fixPhotoData ? { blob: fixPhotoData.blob } : null
    };

    try {
      await store.saveRecord(targetFixRecord, media);
      toast('조치 완료 처리가 저장되었습니다.', 'success');
      $('#fixModal').style.display = 'none';
      renderRecordList();
    } catch (e) {
      toast(`조치 저장 실패: ${e.message}`, 'danger');
    }
  });

  // ── 대장 목록 기간 선택 모드 전환 (전체 vs 월별 vs 직접지정) ──
  $('#btnPeriodModeAll')?.addEventListener('click', () => {
    listPeriodMode = 'all';
    $('#btnPeriodModeAll')?.classList.add('selected');
    $('#btnPeriodModeMonth')?.classList.remove('selected');
    $('#btnPeriodModeRange')?.classList.remove('selected');
    if ($('#boxListPeriodAll')) $('#boxListPeriodAll').style.display = 'flex';
    if ($('#boxListPeriodMonth')) $('#boxListPeriodMonth').style.display = 'none';
    if ($('#boxListPeriodRange')) $('#boxListPeriodRange').style.display = 'none';
    renderRecordList();
  });

  $('#btnPeriodModeMonth')?.addEventListener('click', () => {
    listPeriodMode = 'month';
    $('#btnPeriodModeMonth')?.classList.add('selected');
    $('#btnPeriodModeAll')?.classList.remove('selected');
    $('#btnPeriodModeRange')?.classList.remove('selected');
    if ($('#boxListPeriodAll')) $('#boxListPeriodAll').style.display = 'none';
    if ($('#boxListPeriodMonth')) $('#boxListPeriodMonth').style.display = 'flex';
    if ($('#boxListPeriodRange')) $('#boxListPeriodRange').style.display = 'none';
    renderRecordList();
  });

  $('#btnPeriodModeRange')?.addEventListener('click', () => {
    listPeriodMode = 'range';
    $('#btnPeriodModeRange')?.classList.add('selected');
    $('#btnPeriodModeAll')?.classList.remove('selected');
    $('#btnPeriodModeMonth')?.classList.remove('selected');
    if ($('#boxListPeriodAll')) $('#boxListPeriodAll').style.display = 'none';
    if ($('#boxListPeriodMonth')) $('#boxListPeriodMonth').style.display = 'none';
    if ($('#boxListPeriodRange')) $('#boxListPeriodRange').style.display = 'flex';
    renderRecordList();
  });

  $('#btnQueryAll')?.addEventListener('click', () => renderRecordList());
  $('#btnQueryMonth')?.addEventListener('click', () => renderRecordList());
  $('#btnQueryRange')?.addEventListener('click', () => renderRecordList());
  $('#selListMonth')?.addEventListener('change', () => renderRecordList());

  // ── 클라우드 수동 즉시 동기화 버튼 ──
  $('#btnSyncCloud')?.addEventListener('click', async () => {
    const btn = $('#btnSyncCloud');
    btn.disabled = true;
    btn.textContent = '동기화 중...';
    try {
      const res = await store.syncLocalToServer();
      if (res.synced > 0) {
        toast(`✅ 휴대폰 로컬 데이터 ${res.synced}건이 클라우드에 성공적으로 반영되었습니다!`, 'success', 3500);
      } else {
        toast('모든 데이터가 이미 클라우드와 완벽하게 일치합니다.', 'info', 2500);
      }
      await renderRecordList(false);
    } catch (err) {
      toast(`동기화 중 오류: ${err.message}`, 'danger');
    } finally {
      btn.disabled = false;
      btn.textContent = '🔄 동기화';
    }
  });

  // ── 대장 목록 필터 (미조치만 보기 토글 & 전체 현장) ──
  $('#btnFilterUnfixed')?.addEventListener('click', () => {
    listOnlyUnfixed = !listOnlyUnfixed;
    if (listOnlyUnfixed) {
      $('#btnFilterUnfixed')?.classList.add('selected');
    } else {
      $('#btnFilterUnfixed')?.classList.remove('selected');
    }
    applyListFiltersAndRender();
  });

  $('#btnFilterSiteAll')?.addEventListener('click', () => {
    listSiteFilter = 'all';
    $('#btnFilterSiteAll')?.classList.add('selected');
    document.querySelectorAll('.filter-site-item').forEach(el => el.classList.remove('selected'));
    applyListFiltersAndRender();
  });

  // ── 1페이지 교육자료 대상 기간 선택 모드 전환 (전체 vs 월별 vs 직접지정) ──
  $('#btnEduModeAll')?.addEventListener('click', () => {
    eduPeriodMode = 'all';
    $('#btnEduModeAll')?.classList.add('selected');
    $('#btnEduModeMonth')?.classList.remove('selected');
    $('#btnEduModeRange')?.classList.remove('selected');
    if ($('#boxEduPeriodAll')) $('#boxEduPeriodAll').style.display = 'block';
    if ($('#boxEduPeriodMonth')) $('#boxEduPeriodMonth').style.display = 'none';
    if ($('#boxEduPeriodRange')) $('#boxEduPeriodRange').style.display = 'none';
    populateEduOptions();
  });

  $('#btnEduModeMonth')?.addEventListener('click', () => {
    eduPeriodMode = 'month';
    $('#btnEduModeMonth')?.classList.add('selected');
    $('#btnEduModeAll')?.classList.remove('selected');
    $('#btnEduModeRange')?.classList.remove('selected');
    if ($('#boxEduPeriodAll')) $('#boxEduPeriodAll').style.display = 'none';
    if ($('#boxEduPeriodMonth')) $('#boxEduPeriodMonth').style.display = 'flex';
    if ($('#boxEduPeriodRange')) $('#boxEduPeriodRange').style.display = 'none';
    populateEduOptions();
  });

  $('#btnEduModeRange')?.addEventListener('click', () => {
    eduPeriodMode = 'range';
    $('#btnEduModeRange')?.classList.add('selected');
    $('#btnEduModeAll')?.classList.remove('selected');
    $('#btnEduModeMonth')?.classList.remove('selected');
    if ($('#boxEduPeriodAll')) $('#boxEduPeriodAll').style.display = 'none';
    if ($('#boxEduPeriodMonth')) $('#boxEduPeriodMonth').style.display = 'none';
    if ($('#boxEduPeriodRange')) $('#boxEduPeriodRange').style.display = 'flex';
    populateEduOptions();
  });

  $('#selEduMonth')?.addEventListener('change', () => populateEduOptions());
  $('#txtEduStartDate')?.addEventListener('change', () => populateEduOptions());
  $('#txtEduEndDate')?.addEventListener('change', () => populateEduOptions());
  $('#selEduRecord')?.addEventListener('change', () => updateEduPreview());

  async function switchSelectedEduTemplate(newSeverity) {
    const sel = $('#selEduRecord');
    const recordId = sel?.value;
    if (!recordId) return;
    const rec = currentEduRecords.find(r => r.id === recordId) || currentLoadedRecords.find(r => r.id === recordId);
    if (!rec) return;
    rec.severity = newSeverity; rec.templateType = newSeverity; await store.updateRecordSeverity(rec, newSeverity);
    const isMajor = newSeverity === '중부적합';
    const sevLabel = isMajor ? '🚨중부적합' : '⚠️경부적합';
    const opt = sel.querySelector(`option[value="${recordId}"]`);
    if (opt) {
      opt.textContent = `[${rec.site || '현장'}] [${sevLabel}] ${rec.content || ''} (${rec.location || '-'}, ${rec.inspectedDate || ''})`;
    }
    await updateEduPreview();
    toast(`선택 항목이 [${newSeverity}] 신규 장표 양식으로 변경 및 저장되었습니다.`, 'success', 2200);
  }

  $('#btnSwitchMajorTemplate')?.addEventListener('click', () => switchSelectedEduTemplate('중부적합'));
  $('#btnSwitchMinorTemplate')?.addEventListener('click', () => switchSelectedEduTemplate('경부적합'));

  // ── 📐 점검장표 미리보기·PPT 2장 사진 비율 실시간 변경 ──
  $$('#eduPhotoRatioChips .chip').forEach(chip => {
    chip.addEventListener('click', async () => {
      const sel = $('#selEduRecord');
      const recordId = sel?.value;
      if (!recordId) return;
      const rec = currentEduRecords.find(r => r.id === recordId) || currentLoadedRecords.find(r => r.id === recordId);
      if (!rec) return;
      const newRatio = chip.dataset.ratio || 'auto';
      await store.updateRecordPhotoLayoutRatio(rec, newRatio);
      await updateEduPreview();
      toast(`사진 배치 비율이 [${newRatio === 'auto' ? '자동(비율비례)' : newRatio}]로 적용되었습니다. (미리보기 & PPT 즉시 반영)`, 'success', 2000);
    });
  });

  // ── 엑셀/PPT 내보내기 기간 선택 모드 전환 (전체 vs 월별 vs 직접지정) ──
  $('#btnExportModeAll')?.addEventListener('click', () => {
    exportPeriodMode = 'all';
    $('#btnExportModeAll')?.classList.add('selected');
    $('#btnExportModeMonth')?.classList.remove('selected');
    $('#btnExportModeRange')?.classList.remove('selected');
    if ($('#boxExportPeriodAll')) $('#boxExportPeriodAll').style.display = 'block';
    if ($('#boxExportPeriodMonth')) $('#boxExportPeriodMonth').style.display = 'none';
    if ($('#boxExportPeriodRange')) $('#boxExportPeriodRange').style.display = 'none';
  });

  $('#btnExportModeMonth')?.addEventListener('click', () => {
    exportPeriodMode = 'month';
    $('#btnExportModeMonth')?.classList.add('selected');
    $('#btnExportModeAll')?.classList.remove('selected');
    $('#btnExportModeRange')?.classList.remove('selected');
    if ($('#boxExportPeriodAll')) $('#boxExportPeriodAll').style.display = 'none';
    if ($('#boxExportPeriodMonth')) $('#boxExportPeriodMonth').style.display = 'block';
    if ($('#boxExportPeriodRange')) $('#boxExportPeriodRange').style.display = 'none';
  });

  $('#btnExportModeRange')?.addEventListener('click', () => {
    exportPeriodMode = 'range';
    $('#btnExportModeRange')?.classList.add('selected');
    $('#btnExportModeAll')?.classList.remove('selected');
    $('#btnExportModeMonth')?.classList.remove('selected');
    if ($('#boxExportPeriodAll')) $('#boxExportPeriodAll').style.display = 'none';
    if ($('#boxExportPeriodMonth')) $('#boxExportPeriodMonth').style.display = 'none';
    if ($('#boxExportPeriodRange')) $('#boxExportPeriodRange').style.display = 'flex';
  });

  // ── 대장 목록 뷰 모드 토글 (카드 vs 엑셀 표) ──
  $('#btnViewCard')?.addEventListener('click', () => {
    recordViewMode = 'card';
    $('#recordListContainer').style.display = 'flex';
    $('#recordTableContainer').style.display = 'none';
    if ($('#recordTableScrollToolbar')) $('#recordTableScrollToolbar').style.display = 'none';
    if ($('#recordTableTopScroll')) $('#recordTableTopScroll').style.display = 'none';
    $('#btnViewCard').classList.remove('btn-outline');
    $('#btnViewCard').classList.add('btn-primary');
    $('#btnViewTable').classList.remove('btn-primary');
    $('#btnViewTable').classList.add('btn-outline');
    renderRecordList(false);
  });

  $('#btnViewTable')?.addEventListener('click', () => {
    recordViewMode = 'table';
    $('#recordListContainer').style.display = 'none';
    $('#recordTableContainer').style.display = 'block';
    if ($('#recordTableScrollToolbar')) $('#recordTableScrollToolbar').style.display = 'flex';
    if ($('#recordTableTopScroll')) $('#recordTableTopScroll').style.display = 'block';
    syncTableTopScrollWidth();
    $('#btnViewTable').classList.remove('btn-outline');
    $('#btnViewTable').classList.add('btn-primary');
    $('#btnViewCard').classList.remove('btn-primary');
    $('#btnViewCard').classList.add('btn-outline');
    renderRecordList(false);
  });

  // 상단 스크롤바 & 본체 스크롤바 양방향 동기화 및 즉시 좌우 이동 버튼
  const topScroll = $('#recordTableTopScroll');
  const tableContainer = $('#recordTableContainer');
  if (topScroll && tableContainer) {
    let isSyncingScroll = false;
    topScroll.addEventListener('scroll', () => {
      if (isSyncingScroll) return;
      isSyncingScroll = true;
      tableContainer.scrollLeft = topScroll.scrollLeft;
      requestAnimationFrame(() => { isSyncingScroll = false; });
    });
    tableContainer.addEventListener('scroll', () => {
      if (isSyncingScroll) return;
      isSyncingScroll = true;
      topScroll.scrollLeft = tableContainer.scrollLeft;
      requestAnimationFrame(() => { isSyncingScroll = false; });
    });
  }

  $('#btnScrollTableLeft')?.addEventListener('click', () => {
    tableContainer?.scrollBy({ left: -360, behavior: 'smooth' });
  });
  $('#btnScrollTableRight')?.addEventListener('click', () => {
    tableContainer?.scrollBy({ left: 360, behavior: 'smooth' });
  });

  const refreshBtn = $('#btnRefreshList');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
      renderRecordList();
      toast('대장 목록을 새로고침했습니다.', 'info');
    });
  }

  // 선택 일괄 삭제 (대량 삭제 - 낙관적 UI 즉시 반영 + 백그라운드 일괄 커밋)
  const btnDelSelected = $('#btnDeleteSelected');
  if (btnDelSelected) {
    btnDelSelected.addEventListener('click', async () => {
      const checkedBoxes = Array.from(document.querySelectorAll('.chk-record-item:checked'));
      if (!checkedBoxes.length) return;
      const count = checkedBoxes.length;
      if (!confirm(`선택한 ${count}건의 부적합 내역을 영구 삭제하시겠습니까?\n삭제된 데이터는 복구할 수 없습니다.`)) return;

      const delIds = new Set(checkedBoxes.map(chk => chk.dataset.id));
      const targetRecs = currentLoadedRecords.filter(x => delIds.has(x.id));

      currentLoadedRecords = currentLoadedRecords.filter(x => !delIds.has(x.id));
      currentEduRecords = currentEduRecords.filter(x => !delIds.has(x.id));
      updateSiteFilterChips(currentLoadedRecords);
      applyListFiltersAndRender();

      await store.deleteRecordsBatch(targetRecs);
      toast(`⚡ ${count}건의 부적합 데이터가 즉시 삭제되었습니다.`, 'success');
    });
  }

  // 테이블 툴바의 선택 일괄 삭제 버튼 연동
  const btnTableBatchDel = $('#btnTableBatchDelete');
  if (btnTableBatchDel && btnDelSelected) {
    btnTableBatchDel.addEventListener('click', () => {
      btnDelSelected.click();
    });
  }

  // 현재 조회된 목록 일괄 삭제 (카드 뷰 / 표 뷰 모두에서 원클릭 0.02초 일괄 삭제 지원)
  const btnDelAllFiltered = $('#btnDeleteAllFiltered');
  if (btnDelAllFiltered) {
    btnDelAllFiltered.addEventListener('click', async () => {
      let targetRecs = currentLoadedRecords;
      if (listOnlyUnfixed) targetRecs = targetRecs.filter(r => r.status !== '조치완료');
      if (listSiteFilter !== 'all') targetRecs = targetRecs.filter(r => r.site === listSiteFilter);
      if (!targetRecs.length) {
        toast('삭제할 부적합 내역이 없습니다.', 'warning');
        return;
      }
      if (!confirm(`현재 목록에 표시된 ${targetRecs.length}건의 부적합 내역을 모두 일괄 삭제하시겠습니까?\n삭제된 데이터는 복구할 수 없습니다.`)) return;

      const delIds = new Set(targetRecs.map(x => x.id));
      currentLoadedRecords = currentLoadedRecords.filter(x => !delIds.has(x.id));
      currentEduRecords = currentEduRecords.filter(x => !delIds.has(x.id));
      updateSiteFilterChips(currentLoadedRecords);
      applyListFiltersAndRender();

      await store.deleteRecordsBatch(targetRecs);
      toast(`⚡ ${targetRecs.length}건의 부적합 데이터가 일괄 삭제되었습니다.`, 'success');
    });
  }

  // 테이블 전체 선택 체크박스
  const chkAll = $('#chkAllRecords');
  if (chkAll) {
    chkAll.addEventListener('change', (e) => {
      const isChecked = e.target.checked;
      document.querySelectorAll('.chk-record-item').forEach(cb => {
        cb.checked = isChecked;
      });
      updateSelectedCount();
    });
  }

  // 음성입력, 현장관리, 프로필관리, 핀번호관리, 이메일 전송 초기화
  initVoiceInput();
  initFixVoiceInput();
  initSiteManagement();
  initUserProfile();
  initPinManagement();
  initEmailExportHandlers();
  initLmStudio();
}

function updateSelectedCount() {
  const checkedBoxes = document.querySelectorAll('.chk-record-item:checked');
  const checked = checkedBoxes.length;
  const cntSpan = $('#selectedCount');
  const btnDel = $('#btnDeleteSelected');
  if (cntSpan) cntSpan.textContent = checked;
  if (btnDel) {
    btnDel.style.display = checked > 0 ? 'inline-block' : 'none';
  }

  const tableCntSpan = $('#tableSelectedCount');
  const tableBtnDel = $('#btnTableBatchDelete');
  if (tableCntSpan) tableCntSpan.textContent = checked;
  if (tableBtnDel) {
    tableBtnDel.style.display = checked > 0 ? 'inline-flex' : 'none';
  }

  // 선택된 행 강조 표시 및 sticky 셀 배경 동기화
  document.querySelectorAll('#tblRecordsBody tr').forEach(tr => {
    const cb = tr.querySelector('.chk-record-item');
    const isRowChecked = cb && cb.checked;
    const origBg = tr.dataset.origBg || '#ffffff';
    const rowBg = isRowChecked ? '#fee2e2' : origBg;
    tr.style.background = rowBg;
    tr.querySelectorAll('td.cell-chk, td.cell-no').forEach(td => {
      td.style.background = rowBg;
    });
  });
}

// ── 음성 입력 (Web Speech API - 100% 무료 브라우저 내장 STT) ──
function initVoiceInput() {
  const btn = $('#btnVoiceRecord');
  if (!btn) return;

  const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRec) {
    btn.addEventListener('click', () => {
      alert('현재 브라우저 환경에서는 음성 인식을 지원하지 않습니다.\n모바일 크롬(Chrome), 삼성인터넷 또는 사파리(Safari)를 이용해 주세요.');
    });
    return;
  }

  let recognition = null;
  let isListening = false;

  btn.addEventListener('click', () => {
    if (isListening) {
      if (recognition) recognition.stop();
      return;
    }

    // 두 번째(새로운) 음성 입력 버튼을 누를 때 이전 음성/입력 내용을 즉시 지움
    const txt = $('#txtContent');
    if (txt) {
      txt.value = '';
      txt.dispatchEvent(new Event('input', { bubbles: true }));
    }
    const smartBox = $('#smartClassifyBox');
    if (smartBox) smartBox.classList.remove('active');

    try {
      recognition = new SpeechRec();
      recognition.lang = 'ko-KR';
      recognition.continuous = false;
      recognition.interimResults = false;

      recognition.onstart = () => {
        isListening = true;
        $('#voiceIcon').textContent = '⏹️';
        $('#voiceText').textContent = '중지';
        btn.classList.add('recording-active');
        if ($('#voiceStatusMsg')) $('#voiceStatusMsg').style.display = 'block';
        if ($('#txtContent')) $('#txtContent').value = '';
        if ($('#smartClassifyBox')) $('#smartClassifyBox').classList.remove('active');
      };

      recognition.onresult = (e) => {
        const transcript = e.results[0][0].transcript;
        if (transcript) {
          // 누적하지 않고 새로운 음성 텍스트로 완전히 대체
          const target = $('#txtContent');
          if (target) {
            target.value = transcript;
            // Input 이벤트 발생시켜 스마트 추천 분류 및 세션 임시저장 연동
            target.dispatchEvent(new Event('input', { bubbles: true }));
          }
          toast(`음성 입력 완료: "${transcript}"`, 'success');
        }
      };

      recognition.onerror = (e) => {
        console.warn('Voice recognition error:', e.error);
        if (e.error === 'not-allowed') {
          alert('마이크 사용 권한이 거부되었습니다.\n브라우저 주소창 왼쪽의 설정 아이콘을 눌러 마이크 권한을 허용해 주세요.');
        } else {
          toast(`음성 인식 오류: ${e.error}`, 'warning');
        }
      };

      recognition.onend = () => {
        isListening = false;
        $('#voiceIcon').textContent = '🎙️';
        $('#voiceText').textContent = '음성 입력';
        btn.classList.remove('recording-active');
        if ($('#voiceStatusMsg')) $('#voiceStatusMsg').style.display = 'none';
      };

      recognition.start();
    } catch (err) {
      console.error('Failed to start speech recognition:', err);
      toast('음성 인식을 시작할 수 없습니다: ' + err.message, 'danger');
    }
  });
}

// ── 조치사항 등록 음성 입력 (Web Speech API) ──
function initFixVoiceInput() {
  const btn = $('#btnVoiceFixRecord');
  if (!btn) return;

  const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRec) {
    btn.addEventListener('click', () => {
      alert('현재 브라우저 환경에서는 음성 인식을 지원하지 않습니다.\n모바일 크롬(Chrome), 삼성인터넷 또는 사파리(Safari)를 이용해 주세요.');
    });
    return;
  }

  let recognition = null;
  let isListening = false;

  btn.addEventListener('click', () => {
    if (isListening) {
      if (recognition) recognition.stop();
      return;
    }

    // 두 번째(새로운) 음성 입력 버튼을 누를 때 이전 음성/입력 내용을 즉시 지움
    const txt = $('#txtFixContent');
    if (txt) {
      txt.value = '';
    }

    try {
      recognition = new SpeechRec();
      recognition.lang = 'ko-KR';
      recognition.continuous = false;
      recognition.interimResults = false;

      recognition.onstart = () => {
        isListening = true;
        $('#voiceFixIcon').textContent = '⏹️';
        $('#voiceFixText').textContent = '중지';
        btn.classList.add('recording-active');
        if ($('#voiceFixStatusMsg')) $('#voiceFixStatusMsg').style.display = 'block';
        if ($('#txtFixContent')) $('#txtFixContent').value = '';
      };

      recognition.onresult = (e) => {
        const transcript = e.results[0][0].transcript;
        if (transcript) {
          // 누적하지 않고 새로운 음성 텍스트로 완전히 대체
          const target = $('#txtFixContent');
          if (target) {
            target.value = transcript;
          }
          toast(`조치내용 음성 입력 완료: "${transcript}"`, 'success');
        }
      };

      recognition.onerror = (e) => {
        console.warn('Voice recognition error:', e.error);
        if (e.error === 'not-allowed') {
          alert('마이크 사용 권한이 거부되었습니다.\n브라우저 주소창 왼쪽의 설정 아이콘을 눌러 마이크 권한을 허용해 주세요.');
        } else {
          toast(`음성 인식 오류: ${e.error}`, 'warning');
        }
      };

      recognition.onend = () => {
        isListening = false;
        $('#voiceFixIcon').textContent = '🎙️';
        $('#voiceFixText').textContent = '음성 입력';
        btn.classList.remove('recording-active');
        if ($('#voiceFixStatusMsg')) $('#voiceFixStatusMsg').style.display = 'none';
      };

      recognition.start();
    } catch (err) {
      console.error('Failed to start speech recognition for fix:', err);
      toast('음성 인식을 시작할 수 없습니다: ' + err.message, 'danger');
    }
  });
}

// ── 현장 관리 모달 (관리자 전용) ──
function initSiteManagement() {
  $('#btnManageSites')?.addEventListener('click', () => {
    openSiteManageModal();
  });

  $('#btnCloseSiteManage')?.addEventListener('click', () => {
    $('#siteManageModal').style.display = 'none';
  });

  $('#btnDoneSiteManage')?.addEventListener('click', () => {
    $('#siteManageModal').style.display = 'none';
  });

  $('#btnAddSite')?.addEventListener('click', async () => {
    const name = $('#txtNewSiteName')?.value.trim();
    if (!name) {
      toast('추가할 현장명을 입력해주세요.', 'danger');
      return;
    }
    if (store.sites.some(s => s.name === name)) {
      toast('이미 등록되어 있는 현장명입니다.', 'warning');
      return;
    }
    const progress = $('#txtNewSiteProgress')?.value.trim() || '';
    const scale = $('#txtNewSiteScale')?.value.trim() || '';
    const amount = $('#txtNewSiteAmount')?.value.trim() || '';

    store.sites.push({ name, progress, scale, amount });
    try {
      await store.saveSites(store.sites);
      toast(`[${name}] 현장이 추가되었습니다.`, 'success');
      $('#txtNewSiteName').value = '';
      $('#txtNewSiteProgress').value = '';
      $('#txtNewSiteScale').value = '';
      $('#txtNewSiteAmount').value = '';
      renderSites();
      renderSiteManageList();
    } catch (e) {
      toast(`현장 저장 실패: ${e.message}`, 'danger');
    }
  });
}

function openSiteManageModal() {
  renderSiteManageList();
  $('#siteManageModal').style.display = 'flex';
}

function renderSiteManageList() {
  const list = $('#siteManageList');
  const countSpan = $('#siteTotalCount');
  if (countSpan) countSpan.textContent = store.sites.length;
  if (!list) return;

  list.innerHTML = '';
  if (!store.sites.length) {
    list.innerHTML = '<div style="text-align:center; padding:15px; color:var(--gray-400); font-size:0.85rem;">등록된 현장이 없습니다.</div>';
    return;
  }

  store.sites.forEach((site, index) => {
    const item = h('div', {
      style: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '10px 12px',
        background: 'var(--gray-50)',
        border: '1px solid var(--gray-200)',
        borderRadius: '8px',
        gap: '8px'
      }
    });

    const info = h('div', { style: { flex: '1', minWidth: '0' } });
    info.append(h('div', { style: { fontWeight: '700', fontSize: '0.88rem', color: 'var(--gray-900)' } }, site.name));
    const subParts = [site.scale, site.progress ? `공정 ${site.progress}` : '', site.amount].filter(Boolean);
    if (subParts.length) {
      info.append(h('div', { style: { fontSize: '0.75rem', color: 'var(--gray-500)', marginTop: '2px' } }, subParts.join(' · ')));
    }

    const actions = h('div', { style: { display: 'flex', gap: '6px', flexShrink: '0' } });

    // 수정 버튼
    actions.append(h('button.btn.btn-outline', {
      type: 'button',
      style: { padding: '4px 8px', fontSize: '0.75rem' },
      onclick: async () => {
        const newName = prompt('수정할 현장명을 입력하세요:', site.name);
        if (newName === null) return;
        const trimmed = newName.trim();
        if (!trimmed) {
          toast('현장명은 비워둘 수 없습니다.', 'danger');
          return;
        }
        site.name = trimmed;
        try {
          await store.saveSites(store.sites);
          toast('현장명이 수정되었습니다.', 'success');
          renderSites();
          renderSiteManageList();
        } catch (e) {
          toast(`수정 실패: ${e.message}`, 'danger');
        }
      }
    }, '✏️ 수정'));

    // 삭제 버튼
    actions.append(h('button.btn.btn-outline', {
      type: 'button',
      style: { padding: '4px 8px', fontSize: '0.75rem', color: 'var(--danger)', borderColor: '#fca5a5' },
      onclick: async () => {
        if (!confirm(`[${site.name}] 현장을 목록에서 삭제하시겠습니까?\n(기존에 등록된 부적합 데이터는 유지됩니다)`)) return;
        store.sites.splice(index, 1);
        try {
          await store.saveSites(store.sites);
          toast(`[${site.name}] 현장이 삭제되었습니다.`, 'info');
          renderSites();
          renderSiteManageList();
        } catch (e) {
          toast(`삭제 실패: ${e.message}`, 'danger');
        }
      }
    }, '🗑️ 삭제'));

    item.append(info, actions);
    list.append(item);
  });
}

// ── 사용자 프로필 및 점검자 이름 변경 모달 ──
function initUserProfile() {
  $('#btnCloseProfileModal')?.addEventListener('click', () => {
    $('#userProfileModal').style.display = 'none';
  });

  $('#btnOpenPinManageFromProfile')?.addEventListener('click', () => {
    $('#userProfileModal').style.display = 'none';
    openPinManageModal();
  });

  $('#btnLogoutUser')?.addEventListener('click', () => {
    if (confirm('현재 계정에서 로그아웃하고 다른 사용자로 전환하시겠습니까?')) {
      $('#userProfileModal').style.display = 'none';
      store.logout();
      checkAuth();
    }
  });

  $('#btnSaveUserName')?.addEventListener('click', async () => {
    const newName = $('#txtMyName')?.value.trim();
    if (!newName) {
      toast('변경할 점검자 이름을 입력해주세요.', 'danger');
      return;
    }
    const btn = $('#btnSaveUserName');
    btn.disabled = true;
    btn.textContent = '저장 중...';
    try {
      await store.updateCurrentUserName(newName);
      $('#userName').textContent = `${store.user.name} (${store.user.role === 'admin' ? '관리자' : '점검자'})`;
      toast(`점검자 이름이 [${newName}](으)로 변경되었습니다. 이후 등록되는 모든 점검에 반영됩니다.`, 'success');
      $('#userProfileModal').style.display = 'none';
    } catch (e) {
      toast(`이름 변경 실패: ${e.message}`, 'danger');
    } finally {
      btn.disabled = false;
      btn.textContent = '💾 이름 변경 저장';
    }
  });
}

function openUserProfileModal() {
  if (!store.user) return;
  $('#txtMyName').value = store.user.name || '';
  $('#lblMyRole').textContent = store.user.role === 'admin' ? '관리자 (현장 및 핀번호 관리 가능)' : '점검자 (현장 부적합 등록 및 조회)';
  const btnAdminPins = $('#btnOpenPinManageFromProfile');
  if (btnAdminPins) btnAdminPins.style.display = store.isAdmin ? 'block' : 'none';
  $('#userProfileModal').style.display = 'flex';
}

// ── 관리자 전용 핀번호 및 계정 관리 모달 ──
function initPinManagement() {
  $('#btnManagePins')?.addEventListener('click', () => {
    openPinManageModal();
  });

  $('#btnClosePinManage')?.addEventListener('click', () => {
    $('#pinManageModal').style.display = 'none';
  });

  $('#btnDonePinManage')?.addEventListener('click', () => {
    $('#pinManageModal').style.display = 'none';
  });

  // 새 핀번호 계정 추가
  $('#btnAddPinUser')?.addEventListener('click', async () => {
    const pin = $('#txtNewUserPin')?.value.trim();
    const name = $('#txtNewUserName')?.value.trim();
    const role = $('#selNewUserRole')?.value || 'inspector';

    if (!pin || pin.length < 4) {
      toast('PIN 번호는 4자리 이상(숫자 6자리 권장)이어야 합니다.', 'danger');
      return;
    }
    if (!name) {
      toast('점검자 이름을 입력해주세요.', 'danger');
      return;
    }
    await store.loadUsers();
    if (store.users[pin]) {
      toast(`PIN [${pin}]는 이미 [${store.users[pin].name}] 님에게 등록되어 있습니다. 다른 PIN을 지정해주세요.`, 'warning');
      return;
    }

    store.users[pin] = { name, role };
    const btn = $('#btnAddPinUser');
    btn.disabled = true;
    btn.textContent = '추가 중...';
    try {
      await store.saveUsers(store.users);
      toast(`[${name} (PIN: ${pin})] 계정이 추가되었습니다.`, 'success');
      $('#txtNewUserPin').value = '';
      $('#txtNewUserName').value = '';
      renderPinManageList();
    } catch (e) {
      toast(`계정 추가 실패: ${e.message}`, 'danger');
    } finally {
      btn.disabled = false;
      btn.textContent = '추가하기';
    }
  });
}

async function openPinManageModal() {
  await store.loadUsers();
  renderPinManageList();
  $('#pinManageModal').style.display = 'flex';
}

function renderPinManageList() {
  const list = $('#pinManageList');
  const countSpan = $('#pinTotalCount');
  if (!list) return;

  const entries = Object.entries(store.users || {});
  if (countSpan) countSpan.textContent = entries.length;

  list.innerHTML = '';
  if (!entries.length) {
    list.innerHTML = '<div style="text-align:center; padding:15px; color:var(--gray-400); font-size:0.85rem;">등록된 핀번호 계정이 없습니다.</div>';
    return;
  }

  const curPin = localStorage.getItem('sp_pin');

  entries.forEach(([pin, u]) => {
    const isMe = pin === curPin;
    const item = h('div', {
      style: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '10px 12px',
        background: isMe ? '#f0fdf4' : 'var(--gray-50)',
        border: `1px solid ${isMe ? '#86efac' : 'var(--gray-200)'}`,
        borderRadius: '8px',
        gap: '8px'
      }
    });

    const info = h('div', { style: { flex: '1', minWidth: '0' } });
    const nameLine = h('div', { style: { display: 'flex', alignItems: 'center', gap: '6px' } });
    nameLine.append(h('span', { style: { fontWeight: '700', fontSize: '0.88rem', color: 'var(--gray-900)' } }, u.name));
    nameLine.append(h('span', {
      style: {
        fontSize: '0.72rem',
        padding: '1px 6px',
        borderRadius: '4px',
        fontWeight: '600',
        background: u.role === 'admin' ? '#ede9fe' : '#e0f2fe',
        color: u.role === 'admin' ? '#7c3aed' : '#0369a1'
      }
    }, u.role === 'admin' ? '관리자' : '점검자'));
    if (isMe) {
      nameLine.append(h('span', { style: { fontSize: '0.7rem', color: '#16a34a', fontWeight: '700' } }, '(현재 로그인 중)'));
    }

    const sub = h('div', { style: { fontSize: '0.78rem', color: 'var(--gray-500)', marginTop: '2px', fontFamily: 'monospace' } }, `PIN: ${pin}`);
    info.append(nameLine, sub);

    const actions = h('div', { style: { display: 'flex', gap: '6px', flexShrink: '0' } });

    // 수정 버튼
    actions.append(h('button.btn.btn-outline', {
      type: 'button',
      style: { padding: '4px 8px', fontSize: '0.75rem' },
      onclick: async () => {
        const newName = prompt(`[${pin}] 점검자 이름을 입력하세요:`, u.name);
        if (newName === null) return;
        const trimmedName = newName.trim();
        if (!trimmedName) {
          toast('이름은 비워둘 수 없습니다.', 'danger');
          return;
        }

        const newRole = confirm(`관리자 권한을 부여하시겠습니까?\n[확인] = 관리자 (admin)\n[취소] = 점검자 (inspector)`) ? 'admin' : 'inspector';

        const changePin = confirm(`PIN 번호(${pin})도 변경하시겠습니까?`);
        let finalPin = pin;
        if (changePin) {
          const promptPin = prompt('새로운 6자리 PIN 번호를 입력하세요:', pin);
          if (promptPin === null) return;
          const trimmedPin = promptPin.trim();
          if (trimmedPin.length < 4) {
            toast('PIN 번호는 4자리 이상이어야 합니다.', 'danger');
            return;
          }
          if (trimmedPin !== pin && store.users[trimmedPin]) {
            toast('이미 존재하는 다른 PIN 번호입니다.', 'danger');
            return;
          }
          finalPin = trimmedPin;
        }

        // 삭제 후 새 PIN으로 이전 또는 갱신
        if (finalPin !== pin) {
          delete store.users[pin];
          if (isMe) localStorage.setItem('sp_pin', finalPin);
        }
        store.users[finalPin] = { name: trimmedName, role: newRole };

        try {
          await store.saveUsers(store.users);
          toast(`[${trimmedName}] 계정 정보가 수정되었습니다.`, 'success');
          renderPinManageList();
          checkAuth();
        } catch (e) {
          toast(`수정 실패: ${e.message}`, 'danger');
        }
      }
    }, '✏️ 수정'));

    // 삭제 버튼
    actions.append(h('button.btn.btn-outline', {
      type: 'button',
      style: { padding: '4px 8px', fontSize: '0.75rem', color: 'var(--danger)', borderColor: '#fca5a5' },
      onclick: async () => {
        if (isMe) {
          alert('현재 로그인되어 사용 중인 본인 계정은 삭제할 수 없습니다.');
          return;
        }
        const adminCount = Object.values(store.users).filter(x => x.role === 'admin').length;
        if (u.role === 'admin' && adminCount <= 1) {
          alert('최소 1명 이상의 관리자 계정이 유지되어야 하므로 이 관리자 계정을 삭제할 수 없습니다.');
          return;
        }
        if (!confirm(`[${u.name}] (PIN: ${pin}) 계정을 목록에서 완전히 삭제하시겠습니까?`)) return;

        delete store.users[pin];
        try {
          await store.saveUsers(store.users);
          toast(`[${u.name}] 계정이 삭제되었습니다.`, 'info');
          renderPinManageList();
        } catch (e) {
          toast(`삭제 실패: ${e.message}`, 'danger');
        }
      }
    }, '🗑️ 삭제'));

    item.append(info, actions);
    list.append(item);
  });
}

// ── 공통: 메일 발송 / 파일 첨부 전송 ──
// 모바일 환경: 이미지는 Web Share로 자동 첨부, 엑셀/PPT는 브라우저 보안 정책에 따라 다운로드 후 메일 앱(📎 첨부) 자동 연동
async function shareOrEmailFile({ blob, filename, subject, body, mimeType }) {
  const type = mimeType || blob.type || 'application/octet-stream';
  const file = new File([blob], filename, { type });

  // 1. Web Share API Level 2 지원되는 경우 (이미지 등 브라우저 허용 파일)
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({
        files: [file],
        title: subject,
        text: body
      });
      toast('메일/공유 앱에 파일이 직접 첨부되었습니다.', 'success');
      return true;
    } catch (err) {
      if (err.name === 'AbortError') {
        // 사용자가 취소한 경우
        return false;
      }
      console.warn('Web Share 실패, 다운로드 및 메일 연동 진행:', err);
    }
  }

  // 2. 브라우저 보안 정책상 파일 직접 첨부가 차단된 경우 (엑셀 .xlsx, PPT .pptx 등)
  // 기기 다운로드 즉시 실행 + 메일 작성창 열기 + 클립(📎) 첨부 명확한 안내
  // 파일 생성(비동기) 후에는 브라우저가 자동 저장을 막으므로, 탭 1번으로 [저장 + 메일 앱 열기] 실행하는 시트 표시
  saveAndEmail(blob, filename, subject, body);
  return true;
}

// ── 이메일 발송 핸들러 (1페이지 교육자료, 엑셀, 회의용 PPT) ──
function initEmailExportHandlers() {
  // 1) 1페이지 교육자료 이메일 발송
  $('#btnEmailEduImg')?.addEventListener('click', async () => {
    const el = document.getElementById('eduCardContainer');
    if (!el) {
      toast('먼저 교육자료 대상을 선택해주세요.', 'danger');
      return;
    }
    const btn = $('#btnEmailEduImg');
    btn.disabled = true;
    btn.textContent = '메일 준비 중...';
    try {
      const filename = `안전교육_1페이지_${todayStr()}.png`;
      // 핸드폰에 다운로드 저장하지 않고 메모리 Blob으로 즉시 렌더링
      const blob = await window.SafeOnePage.renderAsBlob(el);
      if (!blob) throw new Error('교육자료 이미지 생성에 실패했습니다.');

      const subject = `[SafePatrol] 현장 1페이지 안전교육자료 (${todayStr()})`;
      const body = `안녕하세요,\n\nSafePatrol 현장 패트롤 순회점검을 통해 자동 생성된 [1페이지 안전교육자료]를 송부드립니다.\n\n- 자료명: ${filename}\n- 작성일자: ${todayStr()}\n\n※ 첨부된 교육자료 이미지를 확인해 주시기 바랍니다.`;

      await shareOrEmailFile({
        blob,
        filename,
        subject,
        body,
        mimeType: 'image/png'
      });
    } catch (e) {
      toast(`메일 발송 준비 실패: ${e.message}`, 'danger');
    } finally {
      btn.disabled = false;
      btn.textContent = '📧 메일 발송';
    }
  });

  // 2) 엑셀 부적합 대장 이메일 발송
  $('#btnEmailExcel')?.addEventListener('click', async () => {
    const filterSite = $('#selExportSite').value;
    const siteLabel = filterSite === 'all' ? '전체 현장 통합' : filterSite;
    let periodLabel = '전체 기간';
    let records = [];
    const btn = $('#btnEmailExcel');
    btn.disabled = true;
    btn.textContent = '엑셀 생성 중...';

    try {
      if (exportPeriodMode === 'all') {
        records = await store.listAll();
        periodLabel = '전체누적';
      } else if (exportPeriodMode === 'month') {
        const m = $('#selExportMonth').value;
        if (!m) {
          toast('대상 월을 선택해주세요.', 'danger');
          return;
        }
        records = await store.listMonth(m);
        periodLabel = m;
      } else {
        const start = $('#txtExportStartDate').value;
        const end = $('#txtExportEndDate').value;
        if (!start || !end) {
          toast('시작일과 종료일을 모두 입력해주세요.', 'danger');
          return;
        }
        records = await store.listPeriod(start, end);
        periodLabel = `${start}_${end}`;
      }
      if (filterSite !== 'all') {
        records = records.filter(r => r.site === filterSite);
      }
      if (!records.length) {
        toast('선택한 기간에 등록된 부적합 데이터가 없습니다.', 'danger');
        return;
      }

      // [v60] 표준분류·관련기준 보완은 PDF 등록 시점에 완료되므로 메일용 엑셀은 즉시 생성
      // 핸드폰에 다운로드하지 않고 메모리에서 워크북 생성
      const wb = await window.SafeExcel.build(window.ExcelJS, {
        records,
        taxonomy: { ...store.taxonomy, _tax9: store.taxonomy9x9 },
        customValues: store.custom.customValues,
        sites: store.sites,
        loadImage: async (path) => {
          const b = await store.photoBlob(path);
          if (!b) return null;
          const buf = await b.arrayBuffer();
          const base64 = btoa(new Uint8Array(buf).reduce((data, byte) => data + String.fromCharCode(byte), ''));
          return { base64, extension: 'jpeg' };
        }
      });

      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      });
      const filename = `부적합사항대장_${periodLabel}${filterSite !== 'all' ? '_' + filterSite : ''}.xlsx`;

      const total = records.length;
      const unfixed = records.filter(r => r.status !== '조치완료').length;
      const fixed = total - unfixed;
      const fixRate = total > 0 ? Math.round((fixed / total) * 100) : 0;

      const subject = `[SafePatrol] ${siteLabel} 부적합사항대장 엑셀 보고서 (${periodLabel})`;
      const body = `안녕하세요,\n\nSafePatrol 현장 패트롤 [부적합사항대장] 현황을 보고드립니다.\n\n- 대상 현장: ${siteLabel}\n- 대상 기간: ${periodLabel}\n- 총 부적합 건수: ${total}건 (조치완료: ${fixed}건 / 미조치: ${unfixed}건, 조치율: ${fixRate}%)\n- 보고일자: ${todayStr()}\n\n※ 첨부된 [부적합사항대장.xlsx] 파일을 확인해 주시기 바랍니다.`;

      await shareOrEmailFile({
        blob,
        filename,
        subject,
        body,
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      });
    } catch (e) {
      toast(`엑셀 메일 발송 준비 실패: ${e.message}`, 'danger');
    } finally {
      btn.disabled = false;
      btn.textContent = '📧 메일 발송';
    }
  });

  async function runPptEmail(kind) {
    const isWorker = kind === 'worker';
    const btn = $(isWorker ? '#btnEmailWorkerPPT' : '#btnEmailPPT');
    if (!btn) return;
    btn.disabled = true;
    btn.textContent = 'PPT 생성 중...';

    try {
      const payload = await collectExportReportPayload($('#selExportSite').value);
      if (!payload) return;
      const fn = isWorker ? window.SafePPT.generateWorkerPresentation : window.SafePPT.generatePresentation;
      const { blob, filename } = await fn({
        ...payload,
        month: payload.filePeriodLabel,
        download: false
      });

      const total = payload.records.length;
      const unfixed = payload.records.filter(r => r.status !== '조치완료').length;
      const docTitle = isWorker ? '근로자용 TBM Letter PPT' : '관리자용 패트롤 부적합 보고서 PPT';
      const subject = `[SafePatrol] ${payload.siteLabel} ${docTitle} (${payload.periodLabel})`;
      const body = `안녕하세요,\n\nSafePatrol 데이터 기반 [${docTitle}] 자료를 공유드립니다.\n\n- 대상 현장: ${payload.siteLabel}\n- 대상 기간: ${payload.periodLabel}\n- 총 분석 건수: ${total}건 (미조치: ${unfixed}건)\n- 작성일자: ${todayStr()}\n\n※ 첨부된 PPT 프레젠테이션(.pptx) 파일을 확인해 주시기 바랍니다.`;

      await shareOrEmailFile({
        blob,
        filename,
        subject,
        body,
        mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
      });
    } catch (e) {
      toast(`PPT 메일 발송 준비 실패: ${e.message}`, 'danger');
    } finally {
      btn.disabled = false;
      btn.textContent = '📧 메일 발송';
    }
  }

  // 3) 관리자용 / 근로자용 PPT 이메일 발송
  $('#btnEmailPPT')?.addEventListener('click', () => runPptEmail('manager'));
  $('#btnEmailWorkerPPT')?.addEventListener('click', () => runPptEmail('worker'));
}

// ── 🤖 LM Studio 로컬 Qwen AI 연동 모듈 초기화 ──
function initLmStudio() {
  const badge = $('#lmStudioHeaderBadge');
  const dot = $('#lmStudioDot');
  const statusText = $('#lmStudioStatusText');
  const modal = $('#lmStudioModal');
  const txtEp = $('#txtLmStudioEndpoint');
  const txtModel = $('#txtLmStudioModel');
  const testBox = $('#lmStudioTestStatusBox');
  const btnAnalyze = $('#btnLmStudioAnalyze');
  const resultCard = $('#lmStudioResultCard');
  const resultBody = $('#lmStudioResultBody');
  const btnCloseResult = $('#btnCloseLmStudioResult');

  async function refreshStatus() {
    if (!window.SafeLocalAI) return;
    try {
      const res = await window.SafeLocalAI.checkConnection();
      if (res.ok) {
        if (dot) dot.style.background = '#22c55e';
        if (res.isCloud) {
          if (statusText) statusText.textContent = '🟢 Qwen 24h 클라우드';
          if (badge) {
            badge.style.background = '#f0fdf4';
            badge.style.borderColor = '#86efac';
            badge.style.color = '#15803d';
            badge.title = 'Cloudflare 24시간 상시 가동 Qwen AI 연결됨 (클릭하여 설정)';
          }
          if ($('#lmStudioInlineStatus')) {
            $('#lmStudioInlineStatus').textContent = '🟢 Qwen 24시간 클라우드 AI 준비 완료 (365일 24시간 가동)';
            $('#lmStudioInlineStatus').style.color = '#16a34a';
          }
        } else {
          if (statusText) statusText.textContent = '🟢 Qwen 로컬 AI';
          if (badge) {
            badge.style.background = '#f0fdf4';
            badge.style.borderColor = '#86efac';
            badge.style.color = '#15803d';
            badge.title = `LM Studio 로컬 연결됨 (${res.model} @ ${res.endpoint}) - 클릭하여 설정`;
          }
          if ($('#lmStudioInlineStatus')) {
            $('#lmStudioInlineStatus').textContent = `🟢 Qwen 로컬 AI 준비 완료 (${res.model})`;
            $('#lmStudioInlineStatus').style.color = '#16a34a';
          }
        }
        if (res.isCloud && _lastRenderedQuota) {
          renderAiQuotaWidget(_lastRenderedQuota);
        }
      } else {
        if (dot) dot.style.background = '#ef4444';
        if (statusText) statusText.textContent = '🔴 LM Studio 오프라인';
        if (badge) {
          badge.style.background = '#fef2f2';
          badge.style.borderColor = '#fca5a5';
          badge.style.color = '#b91c1c';
          badge.title = 'LM Studio 오프라인 - 클릭하여 설정 및 테스트';
        }
        if ($('#lmStudioInlineStatus')) {
          $('#lmStudioInlineStatus').textContent = '⚠️ LM Studio 연결 필요 (포트 1234)';
          $('#lmStudioInlineStatus').style.color = '#dc2626';
        }
      }
    } catch (e) {
      console.warn('LM Studio check error:', e);
    }
  }

  // ── [v66] 오늘의 AI 무료 한도(Neurons) & 추가 등록 가능 예상 건수 실시간 위젯 렌더링 ──
  let _lastRenderedQuota = null;

  function formatResetCountdownText(q) {
    if (!q) return '🕒 초기화: 매일 오전 09:00 (UTC 00:00)';
    let mins = Number(q.resetInMinutes);
    if (q.resetAtIso) {
      const diffMs = new Date(q.resetAtIso).getTime() - Date.now();
      if (Number.isFinite(diffMs)) {
        mins = Math.max(0, Math.ceil(diffMs / 60000));
      }
    }
    if (!Number.isFinite(mins)) return `🕒 초기화: ${q.resetAtKstLabel || '매일 오전 09:00 (UTC 00:00)'}`;
    const hrs = Math.floor(mins / 60);
    const remM = mins % 60;
    const rel = hrs > 0 ? `${hrs}시간 ${remM}분 후` : `${remM}분 후`;
    return `🕒 초기화: 매일 오전 09:00 (${rel})`;
  }

  function renderAiQuotaWidget(q) {
    if (!q || typeof q !== 'object') return;
    _lastRenderedQuota = q;
    const widget = $('#aiQuotaWidget');
    const qBadge = $('#aiQuotaBadge');
    const qNumbers = $('#aiQuotaNumbers');
    const qBar = $('#aiQuotaBarFill');
    const qPdf = $('#aiQuotaEstPdf');
    const qPdfSub = $('#aiQuotaPdfSub');
    const qManual = $('#aiQuotaEstManual');
    const qManualSub = $('#aiQuotaManualSub');
    const qNotice = $('#aiQuotaExhaustedNotice');
    const qReset = $('#aiQuotaResetInfo');

    const limit = Number(q.limitNeurons || 10000);
    const remaining = Math.max(0, Number(q.remainingNeurons ?? (limit - Number(q.usedNeurons || 0))));
    const remPct = Math.max(0, Math.min(100, Math.round((remaining / Math.max(1, limit)) * 100)));
    const isExhausted = Boolean(q.quotaExceeded || remaining <= 0);
    const isLow = !isExhausted && remPct <= 30;
    const estPdf = Math.max(0, Number(q.estRemainingPdfRecords ?? 0));
    const estManual = Math.max(0, Number(q.estRemainingManualRecords ?? 0));
    const maxPdf = Number(q.dailyMaxPdfRecords || 44);
    const maxManual = Number(q.dailyMaxManualRecords || 27);
    const nPerPdf = Number(q.neuronsPerPdfRecord || 226);
    const nPerManual = Number(q.neuronsPerManualRecord || 363);

    if (widget) {
      widget.style.background = isExhausted ? '#fef2f2' : (isLow ? '#fffbeb' : '#f0fdf4');
      widget.style.borderColor = isExhausted ? '#fca5a5' : (isLow ? '#fcd34d' : '#86efac');
    }
    if (qBadge) {
      if (isExhausted) {
        qBadge.textContent = q.hasGeminiFallback ? 'CF 소진 · Gemini 자동우회' : '한도 소진 (4006)';
        qBadge.style.background = q.hasGeminiFallback ? '#dbeafe' : '#fee2e2';
        qBadge.style.color = q.hasGeminiFallback ? '#1d4ed8' : '#b91c1c';
      } else if (isLow) {
        qBadge.textContent = `잔여 부족 (${remPct}%)`;
        qBadge.style.background = '#fef3c7';
        qBadge.style.color = '#b45309';
      } else {
        qBadge.textContent = `여유 (${remPct}%)`;
        qBadge.style.background = '#dcfce7';
        qBadge.style.color = '#15803d';
      }
    }
    if (qNumbers) {
      qNumbers.textContent = `남은 ${remaining.toLocaleString()} / ${limit.toLocaleString()} N`;
      qNumbers.style.color = isExhausted ? '#b91c1c' : (isLow ? '#b45309' : '#166534');
    }
    if (qBar) {
      qBar.style.width = `${remPct}%`;
      qBar.style.background = isExhausted
        ? '#ef4444'
        : (isLow ? 'linear-gradient(90deg, #f59e0b, #fbbf24)' : 'linear-gradient(90deg, #16a34a, #22c55e)');
    }
    if (qPdf) {
      qPdf.textContent = isExhausted ? (q.hasGeminiFallback ? 'Gemini 우회' : '0건 (소진)') : `약 ${estPdf}건`;
      qPdf.style.color = isExhausted ? '#dc2626' : '#1d4ed8';
    }
    if (qPdfSub) {
      qPdfSub.textContent = `(일 최대 약 ${maxPdf}건 · ~${nPerPdf}N/건)`;
    }
    if (qManual) {
      qManual.textContent = isExhausted ? (q.hasGeminiFallback ? 'Gemini 우회' : '0건 (소진)') : `약 ${estManual}건`;
      qManual.style.color = isExhausted ? '#dc2626' : '#0f766e';
    }
    if (qManualSub) {
      qManualSub.textContent = `(일 최대 약 ${maxManual}건 · ~${nPerManual}N/건)`;
    }
    if (qNotice) {
      qNotice.style.display = (isExhausted && !q.hasGeminiFallback) ? 'block' : 'none';
    }
    if (qReset) {
      qReset.textContent = formatResetCountdownText(q);
    }

    // 상단 헤더 배지에도 무료 한도 잔여율/소진 상태 실시간 반영
    if (badge && statusText && dot) {
      if (isExhausted && !q.hasGeminiFallback) {
        dot.style.background = '#ef4444';
        statusText.textContent = '🔴 AI 한도소진 (09시 초기화)';
        badge.style.background = '#fef2f2';
        badge.style.borderColor = '#fca5a5';
        badge.style.color = '#b91c1c';
        badge.title = 'Cloudflare Workers AI 일일 무료 한도(10,000 Neurons) 소진 — 매일 오전 09:00 자동 초기화';
      } else if (isLow) {
        dot.style.background = '#f59e0b';
        statusText.textContent = `🟠 AI 남음 ${remPct}% (PDF ~${estPdf}건)`;
        badge.style.background = '#fffbeb';
        badge.style.borderColor = '#fcd34d';
        badge.style.color = '#b45309';
        badge.title = `오늘 무료 AI 잔여 ${remaining.toLocaleString()} / ${limit.toLocaleString()} Neurons (PDF 약 ${estPdf}건 / 수기 약 ${estManual}건)`;
      } else {
        dot.style.background = '#22c55e';
        statusText.textContent = `🟢 AI 남음 ${remPct}% (PDF ~${estPdf}건)`;
        badge.style.background = '#f0fdf4';
        badge.style.borderColor = '#86efac';
        badge.style.color = '#15803d';
        badge.title = `오늘 무료 AI 잔여 ${remaining.toLocaleString()} / ${limit.toLocaleString()} Neurons (PDF 약 ${estPdf}건 / 수기 약 ${estManual}건)`;
      }
    }
  }

  async function refreshAiQuotaWidget(forceRefresh = false) {
    if (!window.SafeLocalAI?.fetchAiQuota) return;
    const btn = $('#btnRefreshAiQuota');
    if (btn && forceRefresh) {
      btn.disabled = true;
      btn.textContent = '조회 중...';
    }
    try {
      const q = await window.SafeLocalAI.fetchAiQuota({ forceRefresh });
      if (q) renderAiQuotaWidget(q);
    } finally {
      if (btn && forceRefresh) {
        btn.disabled = false;
        btn.textContent = '🔄 새로고침';
      }
    }
  }

  $('#btnRefreshAiQuota')?.addEventListener('click', () => refreshAiQuotaWidget(true));
  $('#btnModeManual')?.addEventListener('click', () => refreshAiQuotaWidget(false));
  $('#btnModeImport')?.addEventListener('click', () => refreshAiQuotaWidget(false));
  window.addEventListener('safepatrol:ai-quota-updated', (e) => {
    if (e?.detail) renderAiQuotaWidget(e.detail);
  });
  setInterval(() => {
    if (_lastRenderedQuota && $('#aiQuotaResetInfo')) {
      $('#aiQuotaResetInfo').textContent = formatResetCountdownText(_lastRenderedQuota);
    }
  }, 60000);

  // 초기 상태 확인 (1초 후 비동기 호출)
  setTimeout(() => {
    refreshStatus();
    refreshAiQuotaWidget(false);
  }, 800);

  // 헤더 뱃지 클릭 시 설정 모달 열기
  badge?.addEventListener('click', () => {
    if (modal) {
      if (txtEp && window.SafeLocalAI) txtEp.value = window.SafeLocalAI.getEndpoint();
      if (txtModel && window.SafeLocalAI) txtModel.value = window.SafeLocalAI.getModel();
      if (testBox) testBox.style.display = 'none';
      modal.style.display = 'flex';
    }
  });

  // 연결 테스트 버튼
  $('#btnTestLmStudioConn')?.addEventListener('click', async () => {
    if (!testBox || !txtEp) return;
    testBox.style.display = 'block';
    testBox.style.background = '#eff6ff';
    testBox.style.color = '#1d4ed8';
    testBox.textContent = 'LM Studio 서버 연결 확인 중...';

    const ep = txtEp.value.trim();
    const res = await window.SafeLocalAI.checkConnection(ep);
    if (res.ok) {
      testBox.style.background = '#f0fdf4';
      testBox.style.color = '#15803d';
      testBox.innerHTML = `✅ <strong>연결 성공!</strong><br>• 엔드포인트: ${res.endpoint}<br>• 감지된 모델: <strong>${res.model}</strong>`;
      if (txtModel && res.model) txtModel.value = res.model;
    } else {
      testBox.style.background = '#fef2f2';
      testBox.style.color = '#b91c1c';
      testBox.innerHTML = `❌ <strong>연결 실패</strong>: ${res.error}<br>• LM Studio 프로그램에서 [Start Server] 상태인지 확인하세요. (포트 1234)`;
    }
  });

  // 설정 저장 및 닫기
  $('#btnSaveLmStudioSetting')?.addEventListener('click', () => {
    if (window.SafeLocalAI) {
      if (txtEp?.value) window.SafeLocalAI.setEndpoint(txtEp.value.trim());
      if (txtModel?.value) window.SafeLocalAI.setModel(txtModel.value.trim());
    }
    if (modal) modal.style.display = 'none';
    refreshStatus();
    toast('LM Studio 로컬 AI 설정이 저장되었습니다.', 'success');
  });

  // 모달 바깥 클릭 시 닫기
  modal?.addEventListener('click', (e) => {
    if (e.target === modal) modal.style.display = 'none';
  });

  // 결과 카드 닫기
  btnCloseResult?.addEventListener('click', () => {
    if (resultCard) resultCard.style.display = 'none';
  });

    // ── ✨ Qwen AI 자동 분석 버튼 실행 (하드코딩 법령 규칙 전면 제거 · 부적합 내용 + 첨부 사진 Qwen 통합 판정) ──
  btnAnalyze?.addEventListener('click', async () => {
    const content = $('#txtContent')?.value.trim();
    if (!content) {
      toast('먼저 [부적합 내용]에 현장 지적사항을 입력하거나 음성으로 말씀하세요.', 'warning');
      $('#txtContent')?.focus();
      return;
    }

    const btnIcon = $('#lmStudioBtnIcon');
    const btnText = $('#lmStudioBtnText');

    // [0단계] 기존 스마트 AI 분류가 나와 있다면 먼저 자동 적용하여 동기화
    if (smartResult && !smartRecommendationApplied) {
      $('#btnApplySmart')?.click();
    }

    // [1단계] Cloud AI 실시간 심층 분석 (텍스트가 모호·초단문일 때만 자동 Vision 호출, 평소엔 0 Vision 비용 고속 텍스트 AI)
    const autoUseVision = window.SafeLocalAI?.shouldAutoUseVision
      ? window.SafeLocalAI.shouldAutoUseVision(content, currentPhotos)
      : false;
    btnAnalyze.disabled = true;
    if (btnIcon) btnIcon.textContent = '⏳';
    if (btnText) btnText.textContent = autoUseVision
      ? '텍스트 보강용 Vision + Cloud AI 자동 분석 중...'
      : 'Cloud AI 표준분류·산안법 분석 중...';

    try {
      const extraContext = {
        workGroupMid: $('#selWorkGroupMid')?.value || '',
        workGroup: $('#txtWorkGroup')?.value || '',
        location: $('#txtLocation')?.value || '',
        locationCategory: $('#txtLocationCategory')?.value || '',
        productType: $('#selProductType')?.value || '공동주택',
        progressRate: $('#txtProgressRate')?.value || 35,
        useVision: autoUseVision,
        photos: autoUseVision ? currentPhotos.slice() : []
      };

      const res = await window.SafeLocalAI.streamAnalyzeSafetyText(content, extraContext, (prog) => {
        if (btnText) btnText.textContent = prog.message;
      });

      // Qwen AI 판정 결과 반영 (PM 판정결과는 PDF/사용자 직접 입력 전용이므로 AI가 임의 주입하지 않음)
      if (res.severity === '중부적합') $('#btnSeverityMajor')?.click();
      else if (res.severity === '경부적합') $('#btnSeverityMinor')?.click();
      if (res.law && $('#txtLaw')) $('#txtLaw').value = res.law;
      aiAnalyzedLawBody = res.lawBody || '';
      if (res.locationCategory && $('#txtLocationCategory')) {
        $('#txtLocationCategory').value = res.locationCategory;
      }
      if (res.workGroupMid && $('#selWorkGroupMid')) {
        $('#selWorkGroupMid').value = res.workGroupMid;
        $('#selWorkGroupMid').dispatchEvent(new Event('change'));
      }
      if (res.workGroup && $('#txtWorkGroup')) {
        $('#txtWorkGroup').value = res.workGroup;
        if (!$('#selWorkGroupMid')?.value && $('#selWorkGroupMid')) {
          const inferredMid = resolveWorkGroupMid(res.workGroup, '', content);
          if (inferredMid) {
            $('#selWorkGroupMid').value = inferredMid;
            $('#selWorkGroupMid').dispatchEvent(new Event('change'));
          }
        }
      }
      if (res.workMethod && $('#txtWorkName')) {
        $('#txtWorkName').value = normalizeWorkMethod9x9(res.workMethod, `${res.workGroup || ''} ${content}`);
      }
      if (res.hazardType && $('#txtType')) $('#txtType').value = res.hazardType;
      if (res.agentMajor) {
        if ($('#txtAgentMajor')) $('#txtAgentMajor').value = res.agentMajor;
        if ($('#txtKind')) $('#txtKind').value = res.agentMajor;
        if ($('#txtMatrixArea')) $('#txtMatrixArea').value = res.agentMajor;
      }
      if (res.agentMid || res.item) {
        const midVal = res.agentMid || res.item;
        if ($('#txtAgentMid')) $('#txtAgentMid').value = midVal;
        if ($('#txtItem')) $('#txtItem').value = midVal;
        if ($('#txtMatrixTarget')) $('#txtMatrixTarget').value = midVal;
      }
      if (res.agentMinor) {
        if ($('#txtAgentMinor')) $('#txtAgentMinor').value = res.agentMinor;
        if ($('#txtAgent')) $('#txtAgent').value = res.agentMinor;
        if ($('#txtMatrixSpec')) $('#txtMatrixSpec').value = res.agentMinor;
      }
      if (res.agentMajor && (res.agentMid || res.item) && typeof setPackageSelection === 'function') {
        try { setPackageSelection(res.agentMajor, res.agentMid || res.item, res.agentMinor || ''); } catch (e) {}
      }
      if (Array.isArray(res.mgmtCauses) && res.mgmtCauses.length) {
        if ($('#chkMgmtPlanNotMade')) $('#chkMgmtPlanNotMade').checked = res.mgmtCauses.includes('계획 미수립');
        if ($('#chkMgmtPlanNotFollowed')) $('#chkMgmtPlanNotFollowed').checked = res.mgmtCauses.includes('계획 미이행');
        if ($('#chkMgmtUnsafeAction')) $('#chkMgmtUnsafeAction').checked = res.mgmtCauses.includes('불안전 행동');
        if ($('#chkMgmtUnsafeCondition')) $('#chkMgmtUnsafeCondition').checked = res.mgmtCauses.includes('불안전 상태');
      }
      if ($('#chkHoldPoint')) $('#chkHoldPoint').checked = !!res.holdPoint;
      if (res.photoBanner && $('#txtPhotoBanner')) $('#txtPhotoBanner').value = res.photoBanner;

      if (resultCard && resultBody) {
        const guidelineBadge = res.guidelineApplied
          ? `<span style="background:#dcfce7; color:#166534; padding:1px 6px; border-radius:4px; font-size:0.72rem; font-weight:700;">📚 학습 안전작업지침 Qwen 적합검증 통과</span>`
          : `<span style="background:#dbeafe; color:#1e40af; padding:1px 6px; border-radius:4px; font-size:0.72rem; font-weight:700;">⚖️ Qwen 산안법 직접 판정</span>`;
        resultBody.innerHTML = `
          <div style="margin-bottom: 5px; display:flex; flex-wrap:wrap; gap:5px; align-items:center;">
            <strong>등급 판정:</strong> <span style="font-weight: 700; color: ${res.severity === '중부적합' ? '#dc2626' : '#d97706'};">${res.severity === '중부적합' ? '🚨 중부적합 (즉시 작업중지 요건)' : '⚠️ 경부적합 (시정조치 권고)'}</span>
            ${res.holdPoint ? '<span style="background:#fee2e2; color:#dc2626; padding:1px 5px; border-radius:3px; font-size:0.75rem; font-weight:700;">🚨 Hold Point 위반</span>' : ''}
            ${guidelineBadge}
          </div>
          <div style="margin-bottom: 5px; font-size: 0.78rem; color: #334155;">
            <strong>표준분류:</strong>
            장소분류 <b>${res.locationCategory || '-'}</b> ·
            공종 <b>${res.workGroupMid || '-'} &gt; ${res.workGroup || '-'}</b> ·
            작업방법 <b>${res.workMethod || '-'}</b> ·
            기인물 <b>${res.agentMajor || '-'} &gt; ${res.agentMid || '-'} &gt; ${res.agentMinor || '-'}</b>
          </div>
          ${res.photoBanner ? `
            <div style="margin-bottom: 5px;">
              <strong>사진 상단 배너:</strong> <span style="color:#c00000; font-weight:700; background:#fef2f2; padding:2px 6px; border-radius:4px; border:1px solid #fecaca;">🚩 ${res.photoBanner}</span>
            </div>
          ` : ''}
          <div style="margin-bottom: 5px;">
            <strong>관련 근거:</strong> <span style="color:#1e40af; font-weight:700;">${res.law || '(AI 판정 없음)'}</span>
            ${res.guidelineReason ? `<div style="font-size:0.74rem; color:#475569; margin-top:2px;">↳ 검토 사유: ${res.guidelineReason}</div>` : ''}
          </div>
          ${res.lawBody ? `
            <div style="margin-bottom: 5px; font-size: 0.78rem; color: #334155; background: #eff6ff; padding: 5px 8px; border-radius: 4px; white-space: pre-line;">${res.lawBody}</div>
          ` : ''}
          <div style="margin-bottom: 5px;">
            <strong>법적 판단:</strong> <span>${res.analysis || ''}</span>
          </div>
        `;
        resultCard.style.display = 'block';
      }

      lastManualAiVerifiedSig = buildManualAiSig({
        content: $('#txtContent')?.value || content,
        location: $('#txtLocation')?.value || '',
        workGroup: $('#txtWorkGroup')?.value || '',
        law: $('#txtLaw')?.value || '',
        lawBody: aiAnalyzedLawBody || '',
        photoBanner: $('#txtPhotoBanner')?.value || ''
      });
      toast(`🎉 Qwen AI 분석 완료: [${res.severity}] · 표준분류(장소/공종/작업방법/기인물) · 관련근거가 반영되었습니다!`, 'success');
    } catch (err) {
      console.warn('Qwen AI 분석 오류:', err);
      const failSummary = window.SafeLocalAI?.getAiFailureSummary?.();
      showAiFailurePopup({
        stage: 'AI 자동 분석',
        failedCount: 1,
        totalCount: 1,
        reasons: failSummary?.hasFailure ? failSummary.reasons : [err.message || 'AI 서버 무응답'],
        quotaExceeded: Boolean(failSummary?.quotaExceeded || /4006|한도/.test(String(err?.message || '')))
      });
      toast(`AI 응답 실패: ${err.message}`, 'danger', 4500);
    } finally {
      btnAnalyze.disabled = false;
      if (btnText) btnText.textContent = '로컬 Qwen AI 자동 분석 (법령·등급·원인)';
      if (btnIcon) btnIcon.textContent = '✨';
    }
  });
}

async function deleteOneRecord(rec) {
  if (!confirm(`[${rec.site}]\n"${rec.content}"\n\n해당 부적합 건을 삭제하시겠습니까?`)) return;
  try {
    currentLoadedRecords = currentLoadedRecords.filter(x => x.id !== rec.id);
    currentEduRecords = currentEduRecords.filter(x => x.id !== rec.id);
    updateSiteFilterChips(currentLoadedRecords);
    applyListFiltersAndRender();

    await store.deleteRecord(rec);
    toast('⚡ 부적합 건이 즉시 삭제되었습니다.', 'info');
  } catch (e) {
    toast(`삭제 실패: ${e.message}`, 'danger');
  }
}

// ── 1페이지 교육자료 미리보기 갱신 ──
// ── 사진 Base64 변환 헬퍼 (PptxGenJS 임베딩용 대용량 청크 안전 처리 + 구버전 잘린 사진 자동 치유) ──
async function resolvePhotoBase64ForPPT(path, record = null, photoIndex = 0) {
  // 구버전 방화6 수평양중 샘플 레코드(20261017-131410-o404)에 한해서만 하단 라벨 복원본 우선 적용
  const isLegacyHorizontalSample = record && record.id === '20261017-131410-o404';
  if (isLegacyHorizontalSample) {
    const fixedPath = photoIndex === 0 ? 'samples/horizontal_photo1.jpg' : 'samples/horizontal_photo2.jpg';
    try {
      const res = await fetch(fixedPath);
      if (res.ok) {
        const blob = await res.blob();
        return await blobToBase64(blob);
      }
    } catch (err) {}
  }

  if (!path) return '';
  if (path.startsWith('data:image')) return path;
  try {
    let blob = null;
    if (path.startsWith('samples/') || path.startsWith('http://') || path.startsWith('https://')) {
      const res = await fetch(path);
      if (res.ok) blob = await res.blob();
    } else {
      blob = await store.photoBlob(path).catch(() => null);
    }
    if (!blob) return '';
    return await blobToBase64(blob);
  } catch (e) {
    console.warn('resolvePhotoBase64ForPPT error:', path, e);
    return '';
  }
}

async function blobToBase64(blob) {
  const buf = await blob.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i += 8192) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, Math.min(i + 8192, len)));
  }
  const base64 = btoa(binary);
  return `image/jpeg;base64,${base64}`;
}

// ── 단일 점검장표 PPT (.pptx) 다운로드 ──
async function downloadSingleJangpyoPPT(btn) {
  const sel = $('#selEduRecord');
  const recordId = sel?.value;
  if (!recordId) {
    toast('점검장표를 다운로드할 부적합 항목을 먼저 선택해주세요.', 'warning');
    return;
  }
  const rec = currentEduRecords.find(r => r.id === recordId) || currentLoadedRecords.find(r => r.id === recordId);
  if (!rec) {
    toast('선택하신 부적합 항목 데이터를 찾을 수 없습니다.', 'danger');
    return;
  }

  const originalText = btn ? btn.textContent : '';
  if (btn) {
    btn.disabled = true;
    btn.textContent = '점검장표 PPT 제작 중...';
  }

  try {
    // [v63 A2] 관련기준 칸 맞춤 확인은 등록/임포트 시점에만 수행하므로 PPT 생성 시에는 대기 없이 즉시 다운로드!
    const safeLoc = (rec.location || '위치')
      .replace(/[\/\\:*?"<>|]/g, '_')
      .replace(/[\r\n\t]+/g, ' ')
      .replace(/[—–]/g, '-')
      .replace(/\s+/g, ' ')
      .trim();
    const safeSite = (rec.site || '현장')
      .replace(/[\/\\:*?"<>|]/g, '_')
      .replace(/[\r\n\t]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const filename = `점검장표_${safeSite}_${safeLoc}_${rec.inspectedDate || todayStr()}.pptx`;
    await window.SafePPT.generateInspectionSheetPPT({
      records: [rec],
      loadPhotoBase64: resolvePhotoBase64ForPPT,
      download: true,
      filename
    });
    toast('점검장표 PPT(.pptx) 파일이 다운로드되었습니다. (맑은 고딕 서식)', 'success', 3500);
  } catch (e) {
    console.error('PPT generation error:', e);
    toast(`점검장표 PPT 생성 실패: ${e.message}`, 'danger');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = originalText;
    }
  }
}

// ── 다중 점검장표 PPT 일괄 다운로드 (다중 슬라이드) ──
async function downloadBatchJangpyoPPT(recordsToExport, btn, label = '') {
  let list = recordsToExport;
  if (!list || !list.length) {
    toast('점검장표로 제작할 부적합 데이터가 없습니다.', 'warning');
    return;
  }

  const originalText = btn ? btn.textContent : '';
  if (btn) {
    btn.disabled = true;
    btn.textContent = `점검장표 ${list.length}장 제작 중...`;
  }

  try {
    // [v63 A2] 관련기준 칸 맞춤 확인은 등록/임포트 시점에만 수행하므로 일괄 PPT 생성 시에는 대기 없이 즉시 병렬 제작!
    const safeLabel = (label || '')
      .replace(/[\/\\:*?"<>|]/g, '_')
      .replace(/[\r\n\t]+/g, ' ')
      .replace(/[—–]/g, '-')
      .replace(/\s+/g, ' ')
      .trim();
    const filename = `점검장표_일괄_${safeLabel ? safeLabel + '_' : ''}${list.length}건_${todayStr()}.pptx`;
    await window.SafePPT.generateInspectionSheetPPT({
      records: list,
      loadPhotoBase64: resolvePhotoBase64ForPPT,
      download: true,
      filename
    });
    toast(`총 ${list.length}건의 점검장표 PPT가 생성 및 다운로드되었습니다. (맑은 고딕 서식)`, 'success', 4000);
  } catch (e) {
    console.error('Batch PPT error:', e);
    toast(`점검장표 일괄 PPT 생성 실패: ${e.message}`, 'danger');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = originalText;
    }
  }
}

// ── 특정 부적합 건 점검장표 PPT 화면으로 즉시 이동 ──
async function openJangpyoForRecord(recordId) {
  if (!store.user) {
    toast('🔒 점검자 PIN 번호를 입력한 사용자만 열람할 수 있습니다.', 'warning', 3200);
    showPinModal();
    return;
  }

  // 1. 하단 탭 및 화면 전환
  $$('.bottom-nav .nav-item').forEach(b => b.classList.remove('active'));
  $$('.view-section').forEach(v => v.classList.remove('active'));
  
  const eduNavBtn = document.querySelector('.bottom-nav .nav-item[data-view="viewEdu"]');
  if (eduNavBtn) eduNavBtn.classList.add('active');
  const viewEdu = $('#viewEdu');
  if (viewEdu) viewEdu.classList.add('active');

  // 2. 전체 기간 모드로 옵션 채우기 (해당 ID가 목록에 반드시 포함되도록)
  eduPeriodMode = 'all';
  $('#btnEduModeAll')?.classList.add('selected');
  $('#btnEduModeMonth')?.classList.remove('selected');
  $('#btnEduModeRange')?.classList.remove('selected');
  if ($('#boxEduPeriodAll')) $('#boxEduPeriodAll').style.display = 'block';
  if ($('#boxEduPeriodMonth')) $('#boxEduPeriodMonth').style.display = 'none';
  if ($('#boxEduPeriodRange')) $('#boxEduPeriodRange').style.display = 'none';

  await populateEduOptions(recordId);

  // 3. 스크롤 이동
  const preview = $('#eduPreviewWrapper');
  if (preview) {
    preview.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  toast('선택하신 부적합 항목의 점검장표가 생성되었습니다.', 'success', 2500);
}

// ── 현장 패트롤 점검장표 PPT 실시간 미리보기 갱신 ──
async function updateEduPreview() {
  const sel = $('#selEduRecord');
  const recordId = sel?.value;
  if (!recordId) {
    $('#eduContainer').innerHTML = `
      <div style="text-align: center; padding: 40px 20px; color: #94a3b8; font-size: 0.92rem;">
        📋 상단에서 점검장표를 생성할 <strong>부적합 항목</strong>을 선택해주세요.
      </div>
    `;
    return;
  }

  const rec = currentEduRecords.find(r => r.id === recordId) || currentLoadedRecords.find(r => r.id === recordId);
  if (!rec) {
    $('#eduContainer').innerHTML = `
      <div style="text-align: center; padding: 40px 20px; color: #ef4444; font-size: 0.92rem;">
        선택된 부적합 항목 데이터를 찾을 수 없습니다. 목록을 새로고침 해주세요.
      </div>
    `;
    return;
  }

  // 관련 법령 핵심 수칙 찾기 (taxonomy.categories에서 item 검색)
  let rules = [];
  const allItems = (store.taxonomy && store.taxonomy.categories && store.taxonomy.categories.list) 
    ? store.taxonomy.categories.list.flatMap(c => c.items || [])
    : [];
  const foundItem = allItems.find(it => it.name === rec.item);
  if (foundItem && Array.isArray(foundItem.rules)) {
    rules = foundItem.rules;
  }

  let photo1Url = '';
  let photo2Url = '';
  const isLegacyHorizontalSample = rec.id === '20261017-131410-o404';
  if (isLegacyHorizontalSample) {
    photo1Url = 'samples/horizontal_photo1.jpg';
    photo2Url = 'samples/horizontal_photo2.jpg';
  } else {
    const isDemoRec = String(rec.id || '').startsWith('DEMO-');
    const isDummySample = (p) => !isDemoRec && /^samples\/sample_(?:before|after)\.jpg$/i.test(String(p || '').trim());
    const p1 = (rec.photos && rec.photos[0]) || rec.photo1 || '';
    // 사용자가 직접 등록한 부적합 사진만 표시 (조치 후 사진 rec.fix.photo 및 임의 샘플 자동 주입 금지)
    const p2 = (rec.photos && rec.photos[1]) || rec.photo2 || '';
    if (p1 && !isDummySample(p1)) {
      try { photo1Url = await store.photoURL(p1); } catch (e) {}
    }
    if (p2 && !isDummySample(p2)) {
      try { photo2Url = await store.photoURL(p2); } catch (e) {}
    }
  }

  // [Point #1 & #7] 이미지 실제 존재 여부 및 원본 픽셀 크기(w×h)를 선행 검증하여
  //  - 404/깨진 2번 사진 URL로 인해 웹 프리뷰가 반절만 표시되는 버그를 근본 차단 (PPTX와 100% 일치)
  //  - 2장 사진의 실제 추출 면적(픽셀 크기·종횡비)을 HTML 프리뷰에 전달하여 PPTX와 동일 비율로 렌더링
  const probeImageMeta = (url) => new Promise((resolve) => {
    if (!url) {
      resolve({ ok: false, url: '', w: 0, h: 0 });
      return;
    }
    const img = new Image();
    let settled = false;
    const finish = (ok, w = 0, h = 0) => {
      if (settled) return;
      settled = true;
      resolve({ ok, url: ok ? url : '', w, h });
    };
    const timer = setTimeout(() => finish(false), 6000);
    img.onload = () => {
      clearTimeout(timer);
      const w = img.naturalWidth || 0;
      const h = img.naturalHeight || 0;
      finish(w > 0 && h > 0, w, h);
    };
    img.onerror = () => {
      clearTimeout(timer);
      finish(false);
    };
    img.src = url;
  });

  const [meta1, meta2] = await Promise.all([
    probeImageMeta(photo1Url),
    probeImageMeta(photo2Url)
  ]);
  const validPhoto1Url = meta1.ok ? meta1.url : '';
  const validPhoto2Url = meta2.ok ? meta2.url : '';
  const photo1Dims = meta1.ok ? { w: meta1.w, h: meta1.h } : null;
  const photo2Dims = meta2.ok ? { w: meta2.w, h: meta2.h } : null;

  const inferredSev = (window.SafePPT && typeof window.SafePPT.inferRecordSeverity === 'function')
    ? window.SafePPT.inferRecordSeverity(rec)
    : (rec.severity === '중부적합' || (!rec.severity && rec.status !== '조치완료') ? '중부적합' : '경부적합');
  const isMajorRec = inferredSev === '중부적합';
  const badgeEl = $('#eduCurrentTemplateBadge');
  if (badgeEl) {
    badgeEl.textContent = isMajorRec ? '🚨 중부적합 장표 양식 (Hold Point 포함)' : '⚠️ 경부적합 장표 양식 (위험성평가표 포함)';
    badgeEl.style.background = isMajorRec ? '#fee2e2' : '#fef3c7';
    badgeEl.style.color = isMajorRec ? '#b91c1c' : '#b45309';
  }
  const btnMajor = $('#btnSwitchMajorTemplate');
  const btnMinor = $('#btnSwitchMinorTemplate');
  if (btnMajor && btnMinor) {
    btnMajor.style.background = isMajorRec ? '#dc2626' : '#fef2f2';
    btnMajor.style.color = isMajorRec ? '#ffffff' : '#b91c1c';
    btnMinor.style.background = !isMajorRec ? '#d97706' : '#fffbeb';
    btnMinor.style.color = !isMajorRec ? '#ffffff' : '#b45309';
  }

  // [v63 A4] 사진 비율 선택은 생성 후가 아니라 사진 등록 단계에서 수행 (PDF 등록은 자동 면적비례 'auto' 유지)
  const eduRatioBox = $('#boxEduPhotoRatio');
  const currentRatio = rec.photoLayoutRatio || 'auto';
  if (eduRatioBox) {
    eduRatioBox.style.display = 'none';
  }

  if (window.SafePPT && window.SafePPT.renderInspectionSheetHTML) {
    const html = window.SafePPT.renderInspectionSheetHTML(rec, {
      photo1Url: validPhoto1Url,
      photo2Url: validPhoto2Url,
      photo1Dims,
      photo2Dims,
      photoLayoutRatio: currentRatio,
      rulesFromTaxonomy: rules
    });
    $('#eduContainer').innerHTML = html;
  }
}

// ── 점검장표 대상 부적합 항목 셀렉트박스 목록 채우기 ──
async function populateEduOptions(targetRecordId = null) {
  const sel = $('#selEduRecord');
  if (!sel) return;

  let records = [];
  let periodLabel = '';

  try {
    if (eduPeriodMode === 'all') {
      records = await store.listAll();
      periodLabel = '전체 누적 기간';
    } else if (eduPeriodMode === 'month') {
      const curMonth = $('#selEduMonth')?.value || monthStr();
      records = await store.listMonth(curMonth);
      if (!records || !records.length) {
        records = await store.listAll();
        periodLabel = '전체 누적 기간';
      } else {
        periodLabel = curMonth;
      }
    } else {
      const start = $('#txtEduStartDate')?.value || '2026-10-01';
      const end = $('#txtEduEndDate')?.value || todayStr();
      records = await store.listPeriod(start, end);
      if (!records || !records.length) {
        records = await store.listAll();
        periodLabel = '전체 누적 기간';
      } else {
        periodLabel = `${start} ~ ${end}`;
      }
    }
  } catch (e) {
    console.error('Jangpyo list query error:', e);
    records = [];
  }

  // ID 기준 엄격한 중복 제거
  const dedupMap = new Map();
  (records || []).forEach(r => {
    if (r && r.id && !dedupMap.has(r.id)) dedupMap.set(r.id, r);
  });
  records = Array.from(dedupMap.values());

  currentEduRecords = records;
  currentEduPeriodLabel = periodLabel;
  
  if (!records.length) {
    sel.innerHTML = '<option value="">선택한 기간에 등록된 부적합 내역이 없습니다.</option>';
    $('#eduContainer').innerHTML = `
      <div style="text-align: center; padding: 40px 20px; color: #94a3b8; font-size: 0.9rem;">
        선택한 기간(<strong>${periodLabel}</strong>)에 등록된 부적합 데이터가 없습니다.<br>
        다른 기간을 선택하시거나 부적합 사항을 등록해주세요.
      </div>
    `;
    return;
  }

  sel.innerHTML = records.map(r => {
    const sevVal = (window.SafePPT && typeof window.SafePPT.inferRecordSeverity === 'function')
      ? window.SafePPT.inferRecordSeverity(r)
      : (r.severity === '중부적합' || (!r.severity && r.status !== '조치완료') ? '중부적합' : '경부적합');
    const isMajor = sevVal === '중부적합';
    const sev = isMajor ? '🚨중부적합' : '⚠️경부적합';
    const title = `[${r.site || '현장'}] [${sev}] ${r.content || ''} (${r.location || '-'}, ${r.inspectedDate || ''})`;
    return `<option value="${r.id}">${title}</option>`;
  }).join('');

  if (targetRecordId && records.some(r => r.id === targetRecordId)) {
    sel.value = targetRecordId;
  }

  updateEduPreview();
}

function updateCauseChips() {
  $$('#causeChips .chip').forEach(chip => {
    chip.classList.toggle('selected', selectedCauses.has(chip.dataset.cause));
  });
}

function renderPhotoPreviews() {
  const container = $('#photoPreviews');
  container.innerHTML = '';
  currentPhotos.forEach((p, idx) => {
    const children = [
      h('img', { src: p.previewUrl, style: 'cursor: pointer;', title: p.isCropped ? '클릭하여 원본 전체 장표와 비교' : '' }),
      h('button.remove-btn', {
        onclick: (e) => {
          e.stopPropagation();
          currentPhotos.splice(idx, 1);
          renderPhotoPreviews();
          saveDraft();
        }
      }, '✕')
    ];

    if (p.isJangpyo && p.fullDocPreviewUrl) {
      const badge = h('div', {
        style: 'position: absolute; bottom: 2px; left: 2px; right: 2px; background: rgba(0,0,0,0.8); color: #4ade80; font-size: 0.65rem; font-weight: bold; text-align: center; border-radius: 4px; padding: 2px 4px; cursor: pointer;',
        title: '클릭 시 [현장사진만 추출] ↔ [전체 문서] 토글',
        onclick: async (e) => {
          e.stopPropagation();
          if (p.isCropped) {
            p.previewUrl = p.fullDocPreviewUrl;
            p.blob = p.fullDocBlob;
            p.isCropped = false;
            toast('전체 원본 장표로 전환되었습니다.', 'info', 1500);
          } else {
            const rec = await processImageFile(new File([p.fullDocBlob], 'temp.jpg', { type: 'image/jpeg' }), 1280, 0.82, true);
            p.previewUrl = rec.previewUrl;
            p.blob = rec.blob;
            p.isCropped = true;
            toast('현장 부적합 사진만 추출되었습니다.', 'success', 1500);
          }
          renderPhotoPreviews();
        }
      }, p.isCropped ? '✂️ 사진만추출' : '📄 전체문서');
      children.push(badge);
    }

    const item = h('div.preview-item', { style: 'position: relative;' }, ...children);
    container.append(item);
  });

  // [v63 A4] 사진 등록 시점에 언제든 사진 1:2 비율을 미리 선택·확인할 수 있도록 상시 노출 + 2장 첨부 시 실시간 분할 비율 프리뷰 제공
  const ratioBox = $('#boxPhotoRatioSelector');
  if (ratioBox) {
    ratioBox.style.display = 'block';
    const ratioVal = selectedPhotoLayoutRatio || 'auto';
    $$('#photoRatioChips .chip').forEach(ch => {
      ch.classList.toggle('selected', (ch.dataset.ratio || 'auto') === ratioVal);
    });
    if ($('#lblSelectedPhotoRatio')) {
      $('#lblSelectedPhotoRatio').textContent = PHOTO_RATIO_LABELS[ratioVal] || ratioVal;
    }
    const liveBar = $('#photoRatioLiveBar');
    if (liveBar) {
      if (currentPhotos.length >= 2) {
        let pct1 = 50;
        const m = String(ratioVal).match(/^(\d{1,2})\s*:\s*(\d{1,2})$/);
        if (m) {
          const a = Number(m[1]), b = Number(m[2]);
          if (a > 0 && b > 0) pct1 = Math.round((a / (a + b)) * 100);
        }
        const pct2 = 100 - pct1;
        liveBar.style.display = 'flex';
        liveBar.innerHTML = `
          <div style="flex:${pct1};background:#dbeafe;border:1px solid #93c5fd;border-radius:6px;padding:4px;text-align:center;font-size:0.72rem;font-weight:700;color:#1e40af;overflow:hidden;">
            사진 1 (${ratioVal === 'auto' ? '자동 면적비례' : pct1 + '%'})
          </div>
          <div style="flex:${pct2};background:#e0e7ff;border:1px solid #a5b4fc;border-radius:6px;padding:4px;text-align:center;font-size:0.72rem;font-weight:700;color:#3730a3;overflow:hidden;">
            사진 2 (${ratioVal === 'auto' ? '자동 면적비례' : pct2 + '%'})
          </div>
        `;
      } else {
        liveBar.style.display = 'none';
        liveBar.innerHTML = '';
      }
    }
  }
}

// ── 📚 학습된 안전작업지침(SafeGuidelineMemory) 카운트 & 조회 모달 렌더러 ──
function updateGuidelineMemoryCount() {
  try {
    const count = SafeGuidelineMemory.getAll().length;
    const el = $('#guidelineMemoryCount');
    if (el) el.textContent = String(count);
  } catch (e) {}
}

function renderGuidelineMemoryModal(query = '') {
  const listEl = $('#guidelineMemoryList');
  if (!listEl) return;
  const q = String(query || '').trim().toLowerCase();
  const entries = SafeGuidelineMemory.getAll().filter(e => {
    if (!q) return true;
    const hay = `${e.code || ''} ${e.title || ''} ${e.body || ''} ${e.domain || ''} ${e.workGroup || ''} ${e.type || ''}`.toLowerCase();
    return hay.includes(q);
  });
  updateGuidelineMemoryCount();
  if (!entries.length) {
    listEl.innerHTML = `
      <div style="text-align:center; padding: 28px 14px; color: #64748b; font-size: 0.84rem; line-height: 1.55;">
        ${q ? `"${q}" 검색 결과가 없습니다.` : '아직 학습된 안전작업지침이 없습니다.'}<br>
        <span style="font-size: 0.76rem; color: #94a3b8;">안전작업지침(예: IZ12B 등)이 포함된 원본 장표 PDF·PPTX를 불러오거나 대장을 조회하면 자동 누적됩니다.</span>
      </div>
    `;
    return;
  }
  const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  listEl.innerHTML = entries.map(e => `
    <div style="border: 1px solid #e2e8f0; border-radius: 7px; padding: 9px 11px; margin-bottom: 8px; background: #f8fafc;">
      <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; margin-bottom: 4px;">
        <div style="font-size: 0.83rem; font-weight: 700; color: #1e3a8a; line-height: 1.35;">
          ${e.code ? `<span style="background:#dbeafe; color:#1d4ed8; padding:1px 5px; border-radius:3px; font-size:0.72rem; margin-right:5px;">${esc(e.code)}</span>` : ''}
          ${esc(e.title)}
        </div>
        <button type="button" class="btn-del-guideline" data-key="${esc(e.key)}"
          style="border: 1px solid #fecaca; background: #fef2f2; color: #dc2626; border-radius: 4px; padding: 2px 7px; font-size: 0.72rem; cursor: pointer; flex-shrink: 0;">삭제</button>
      </div>
      <div style="font-size: 0.72rem; color: #64748b; margin-bottom: 5px; display: flex; flex-wrap: wrap; gap: 6px;">
        ${e.domain ? `<span>분야: <b>${esc(e.domain)}</b></span>` : ''}
        ${e.workGroup ? `<span>공종: <b>${esc(e.workGroup)}</b></span>` : ''}
        ${e.type ? `<span>유형: <b>${esc(e.type)}</b></span>` : ''}
        <span>누적학습: <b>${e.count || 1}회</b></span>
        <span>출처: ${esc(e.source || '원본장표')}</span>
      </div>
      ${e.body ? `<div style="font-size: 0.76rem; color: #334155; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 5px; padding: 6px 8px; white-space: pre-line; line-height: 1.45;">${esc(e.body)}</div>` : ''}
    </div>
  `).join('');

  listEl.querySelectorAll('.btn-del-guideline').forEach(btn => {
    btn.addEventListener('click', () => {
      const k = btn.dataset.key;
      if (!k) return;
      SafeGuidelineMemory.remove(k);
      renderGuidelineMemoryModal($('#txtGuidelineSearch')?.value || '');
      toast('선택한 학습 안전작업지침을 삭제했습니다.', 'info', 1800);
    });
  });
}

function clearForm() {
  currentPhotos = [];
  selectedPhotoLayoutRatio = 'auto';
  selectedCauses.clear();
  smartRecommendationApplied = false;
  appliedSmartResult = null;
  aiAnalyzedLawBody = '';
  lastManualAiVerifiedSig = '';
  renderPhotoPreviews();
  updateCauseChips();
  $('#txtContent').value = '';
  if ($('#txtPhotoBanner')) $('#txtPhotoBanner').value = '';
  $('#txtLocation').value = '';
  if ($('#txtLocationCategory')) $('#txtLocationCategory').value = '';
  if ($('#txtAgentMajor')) $('#txtAgentMajor').value = '';
  if ($('#txtAgentMid')) $('#txtAgentMid').value = '';
  if ($('#txtAgentMinor')) $('#txtAgentMinor').value = '';
  if ($('#txtKind')) $('#txtKind').value = '';
  if ($('#txtItem')) $('#txtItem').value = '';
  if ($('#txtAgent')) $('#txtAgent').value = '';
  if ($('#selWorkGroupMid')) $('#selWorkGroupMid').value = '';
  $('#txtWorkGroup').value = '';
  if ($('#txtWorkName')) $('#txtWorkName').value = '';
  $('#txtType').value = '';
  $('#txtLaw').value = '';
  $('#txtCondition').value = '';
  $('#txtAction').value = '';
  if ($('#txtMatrixArea')) $('#txtMatrixArea').value = '';
  if ($('#txtMatrixTarget')) $('#txtMatrixTarget').value = '';
  if ($('#txtMatrixSpec')) $('#txtMatrixSpec').value = '';
  if ($('#txtRootCauseMgmt')) $('#txtRootCauseMgmt').value = '';
  if ($('#txtRootCauseSystem')) $('#txtRootCauseSystem').value = '';
  if ($('#txtStakeholder')) $('#txtStakeholder').value = '';
  if ($('#lblSelectedPhotoRatio')) $('#lblSelectedPhotoRatio').textContent = '자동 (사진 면적·비율 비례)';
  $('#smartClassifyBox').classList.remove('active');
  document.querySelectorAll('.quick-chip-btn').forEach(b => b.classList.remove('active'));
}

// ── Local Draft (창이 켜있는 동안만 유지되는 세션 임시저장) ──
function saveDraft() {
  const draft = {
    site: $('#txtSite')?.value || '',
    content: $('#txtContent')?.value || '',
    location: $('#txtLocation')?.value || '',
    locationCategory: $('#txtLocationCategory')?.value || '',
    photoLayoutRatio: selectedPhotoLayoutRatio || 'auto',
    agentMajor: $('#txtAgentMajor')?.value || '',
    agentMid: $('#txtAgentMid')?.value || '',
    agentMinor: $('#txtAgentMinor')?.value || '',
    kind: $('#txtAgentMajor')?.value || $('#txtKind')?.value || '',
    item: $('#txtAgentMid')?.value || $('#txtItem')?.value || '',
    agent: $('#txtAgentMinor')?.value || $('#txtAgent')?.value || '',
    workGroupMid: $('#selWorkGroupMid')?.value || '',
    workGroup: $('#txtWorkGroup')?.value || '',
    workName: $('#txtWorkName')?.value || '',
    type: $('#txtType')?.value || '',
    law: $('#txtLaw')?.value || '',
    condition: $('#txtCondition')?.value || '',
    action: $('#txtAction')?.value || '',
    matrixArea: $('#txtMatrixArea')?.value || '',
    matrixTarget: $('#txtMatrixTarget')?.value || '',
    matrixSpec: $('#txtMatrixSpec')?.value || '',
    rootCauseMgmt: $('#txtRootCauseMgmt')?.value || '',
    rootCauseSystem: $('#txtRootCauseSystem')?.value || '',
    stakeholder: $('#txtStakeholder')?.value || '',
    causes: [...selectedCauses],
    inspectedDate: $('#txtInspectDate')?.value || ''
  };
  sessionStorage.setItem('sp_draft', JSON.stringify(draft));
  $('#saveStatus').textContent = '세션 임시저장 됨';
}

function loadDraft() {
  // 새 창을 열었을 때는 공란으로 시작 (임시저장은 창이 켜져 있는 동안만 유지)
  const raw = sessionStorage.getItem('sp_draft');
  if (!raw) {
    localStorage.removeItem('sp_draft');
    if ($('#txtContent')) $('#txtContent').value = '';
    return;
  }
  try {
    const d = JSON.parse(raw);
    if (d.site) { $('#txtSite').value = d.site; handleSiteSelectionChange(d.site); }
    if (d.content) {
      $('#txtContent').value = d.content;
      setTimeout(() => runSmartClassification(false), 120);
    }
    if (d.location) $('#txtLocation').value = d.location;
    if (d.locationCategory && $('#txtLocationCategory')) $('#txtLocationCategory').value = d.locationCategory;
    if (d.photoLayoutRatio) selectedPhotoLayoutRatio = d.photoLayoutRatio;
    if (d.workName) $('#txtWorkName').value = d.workName;
    if (d.agentMajor || d.agentMid || d.agentMinor || d.kind || d.item || d.agent) {
      setPackageSelection(d.agentMajor || d.kind || '가시설', d.agentMid || d.item || '비계', d.agentMinor || d.agent || '');
    }
    if (d.agentMajor && $('#txtAgentMajor')) $('#txtAgentMajor').value = d.agentMajor;
    if (d.agentMid && $('#txtAgentMid')) $('#txtAgentMid').value = d.agentMid;
    if (d.agentMinor && $('#txtAgentMinor')) $('#txtAgentMinor').value = d.agentMinor;
    if (d.kind) {
      if ($('#txtKind')) $('#txtKind').value = d.kind;
      if ($('#txtAgentMajor') && !$('#txtAgentMajor').value) $('#txtAgentMajor').value = d.kind;
    }
    if (d.item) {
      if ($('#txtItem')) $('#txtItem').value = d.item;
      if ($('#txtAgentMid') && !$('#txtAgentMid').value) $('#txtAgentMid').value = d.item;
    }
    if (d.agent) {
      if ($('#txtAgent')) $('#txtAgent').value = d.agent;
      if ($('#txtAgentMinor') && !$('#txtAgentMinor').value) $('#txtAgentMinor').value = d.agent;
    }
    if (d.workGroupMid && $('#selWorkGroupMid')) $('#selWorkGroupMid').value = d.workGroupMid;
    if (d.workGroup) $('#txtWorkGroup').value = d.workGroup;
    if (d.type) $('#txtType').value = d.type;
    if (d.law) $('#txtLaw').value = d.law;
    if (d.condition) $('#txtCondition').value = d.condition;
    if (d.action) $('#txtAction').value = d.action;
    if (d.matrixArea && $('#txtMatrixArea')) $('#txtMatrixArea').value = d.matrixArea;
    if (d.matrixTarget && $('#txtMatrixTarget')) $('#txtMatrixTarget').value = d.matrixTarget;
    if (d.matrixSpec && $('#txtMatrixSpec')) $('#txtMatrixSpec').value = d.matrixSpec;
    if (d.rootCauseMgmt && $('#txtRootCauseMgmt')) $('#txtRootCauseMgmt').value = d.rootCauseMgmt;
    if (d.rootCauseSystem && $('#txtRootCauseSystem')) $('#txtRootCauseSystem').value = d.rootCauseSystem;
    if (d.stakeholder && $('#txtStakeholder')) $('#txtStakeholder').value = d.stakeholder;
    if (d.causes) {
      selectedCauses = new Set(d.causes);
      updateCauseChips();
    }
    if (d.inspectedDate) $('#txtInspectDate').value = d.inspectedDate;
  } catch (e) {}
}

function clearDraft() {
  sessionStorage.removeItem('sp_draft');
  localStorage.removeItem('sp_draft');
  if ($('#txtContent')) $('#txtContent').value = '';
  $('#saveStatus').textContent = '';
}

// ── 가로 스크롤 동기화 도우미 ──
function syncTableTopScrollWidth() {
  const tbl = $('#tblRecords');
  const dummy = $('#recordTableTopScrollDummy');
  if (tbl && dummy) {
    const w = Math.max(tbl.scrollWidth, tbl.offsetWidth, 2750);
    dummy.style.width = w + 'px';
  }
}

// ── Record List View ──
async function renderRecordList(triggerSync = true) {
  const thisSeq = ++listRenderSeq;
  const c = $('#recordListContainer');
  const tbody = $('#tblRecordsBody');

  // PIN 번호 인증되지 않은 사용자는 대장 목록 조회 차단
  if (!store.user) {
    const msg = '🔒 부적합 대장은 PIN 번호 인증된 점검자만 열람할 수 있습니다.';
    if (c) c.innerHTML = `<div style="text-align:center; padding:36px; color:var(--gray-600); font-weight:600; background:#f8fafc; border-radius:10px; border:1px dashed #cbd5e1;">${msg}</div>`;
    if (tbody) tbody.innerHTML = `<tr><td colspan="38" style="padding:36px; color:var(--gray-600); font-weight:600;">${msg}</td></tr>`;
    showPinModal();
    return;
  }

  // 뷰 모드 표시 상태 동기화 (카드 vs 엑셀 표)
  if (recordViewMode === 'table') {
    if (c) c.style.display = 'none';
    if ($('#recordTableContainer')) $('#recordTableContainer').style.display = 'block';
    if ($('#recordTableScrollToolbar')) $('#recordTableScrollToolbar').style.display = 'flex';
    if ($('#recordTableTopScroll')) $('#recordTableTopScroll').style.display = 'block';
  } else {
    if (c) c.style.display = 'flex';
    if ($('#recordTableContainer')) $('#recordTableContainer').style.display = 'none';
    if ($('#recordTableScrollToolbar')) $('#recordTableScrollToolbar').style.display = 'none';
    if ($('#recordTableTopScroll')) $('#recordTableTopScroll').style.display = 'none';
  }

  // 로그인 상태에서 진입 시 로컬 미동기화 건을 백그라운드로 자동 업로드 (중복 호출 방지 락)
  if (triggerSync && store.mode === 'github' && !isSyncingInProgress) {
    isSyncingInProgress = true;
    store.syncLocalToServer().then(res => {
      isSyncingInProgress = false;
      if (res && res.synced > 0) {
        toast(`🔄 휴대폰 로컬 보관 데이터 ${res.synced}건이 클라우드에 자동 동기화되었습니다!`, 'success', 3500);
        renderRecordList(false);
      }
    }).catch(e => {
      isSyncingInProgress = false;
      console.warn('Auto sync warning:', e);
    });
  }

  if (c) c.innerHTML = '<div style="text-align:center; padding:20px; color:var(--gray-400);">목록을 불러오는 중...</div>';
  if (tbody) tbody.innerHTML = '<tr><td colspan="38" style="padding:20px; color:var(--gray-400);">데이터를 불러오는 중...</td></tr>';
  
  if ($('#chkAllRecords')) $('#chkAllRecords').checked = false;
  updateSelectedCount();

  let records = [];
  try {
    if (listPeriodMode === 'all') {
      records = await store.listAll(true);
    } else if (listPeriodMode === 'month') {
      const m = $('#selListMonth')?.value || monthStr();
      records = await store.listMonth(m, true);
      // 현재 선택된 월에 등록 데이터가 없으면 전체 누적 목록 자동 표시
      if (!records || !records.length) {
        const all = await store.listAll(true);
        if (all && all.length) records = all;
      }
    } else {
      const start = $('#txtListStartDate')?.value || '2026-10-01';
      const end = $('#txtListEndDate')?.value || todayStr();
      records = await store.listPeriod(start, end, true);
      if (!records || !records.length) {
        const all = await store.listAll(true);
        if (all && all.length) records = all;
      }
    }
  } catch (e) {
    console.error('List query error, attempting fallback to listAll:', e);
    try {
      records = await store.listAll(true);
    } catch (err2) {
      records = [];
    }
  }

  // 더 최근 렌더 호출이 이미 시작되었다면 중단
  if (thisSeq !== listRenderSeq) return;

  // ID 기준 엄격한 중복 제거 (Map)
  const dedupMap = new Map();
  (records || []).forEach(r => {
    if (r && r.id && !dedupMap.has(r.id)) {
      dedupMap.set(r.id, r);
    }
  });

  currentLoadedRecords = Array.from(dedupMap.values());
  try {
    if (typeof FieldFrequencyManager !== 'undefined' && currentLoadedRecords.length > 0) {
      FieldFrequencyManager.seedFromRecords(currentLoadedRecords);
      populateDatalists();
    }
    if (currentLoadedRecords.length > 0) {
      window.SafeGuidelineMemory?.seedFromRecords?.(currentLoadedRecords);
      window.SafeGuidelineMemory?.pruneInvalid?.();
      updateGuidelineMemoryCount();
    }
  } catch (seedErr) {
    console.warn('FieldFrequency seeding error:', seedErr);
  }
  updateSiteFilterChips(currentLoadedRecords);
  await applyListFiltersAndRender(thisSeq);
}

function updateSiteFilterChips(records) {
  const container = $('#boxDynamicSiteChips');
  if (!container) return;
  container.innerHTML = '';
  const siteAliasMap = {
    '송도1': 'S1 (송도1)',
    'S1': 'S1 (송도1)',
    '송도2': 'S2 (송도2)',
    'S2': 'S2 (송도2)',
    '송도3': 'S3 (송도3)',
    'S3': 'S3 (송도3)',
    '반포3': 'B3 (반포3)',
    'B3': 'B3 (반포3)',
    '방화6': 'B6 (방화6)',
    'B6': 'B6 (방화6)'
  };
  const sites = [...new Set(records.map(r => r.site).filter(Boolean))];
  if (sites.length <= 1) return;
  for (const s of sites) {
    const chipText = siteAliasMap[s] || s;
    const btn = h('button.chip.filter-site-item', {
      type: 'button',
      class: (listSiteFilter === s || (siteAliasMap[listSiteFilter] && siteAliasMap[listSiteFilter] === siteAliasMap[s])) ? 'selected' : '',
      style: { padding: '6px 14px', fontSize: '0.82rem', whiteSpace: 'nowrap', flexShrink: '0' },
      onclick: () => {
        listSiteFilter = s;
        $('#btnFilterSiteAll')?.classList.remove('selected');
        document.querySelectorAll('.filter-site-item').forEach(el => el.classList.remove('selected'));
        btn.classList.add('selected');
        applyListFiltersAndRender();
      }
    }, chipText);
    container.append(btn);
  }
}

async function applyListFiltersAndRender(thisSeq = listRenderSeq) {
  if (thisSeq !== listRenderSeq) return;

  const c = $('#recordListContainer');
  const tbody = $('#tblRecordsBody');
  if ($('#chkAllRecords')) $('#chkAllRecords').checked = false;
  updateSelectedCount();

  let filtered = currentLoadedRecords;
  if (listOnlyUnfixed) {
    filtered = filtered.filter(r => r.status !== '조치완료');
  }
  if (listSiteFilter !== 'all') {
    const siteEquivMap = {
      '송도1': ['송도1', 'S1'],
      'S1': ['송도1', 'S1'],
      '송도2': ['송도2', 'S2'],
      'S2': ['송도2', 'S2'],
      '송도3': ['송도3', 'S3'],
      'S3': ['송도3', 'S3'],
      '반포3': ['반포3', 'B3'],
      'B3': ['반포3', 'B3'],
      '방화6': ['방화6', 'B6'],
      'B6': ['방화6', 'B6']
    };
    filtered = filtered.filter(r => {
      if (r.site === listSiteFilter) return true;
      if (siteEquivMap[listSiteFilter] && siteEquivMap[listSiteFilter].includes(r.site)) return true;
      return false;
    });
  }

  if (!filtered.length) {
    let msg = '선택한 기간에 등록된 내역이 없습니다.';
    if (listOnlyUnfixed) {
      msg = '🎉 미조치된 부적합 내역이 없습니다. (모든 항목 조치 완료)';
    } else if (listPeriodMode === 'all') {
      msg = '누적된 부적합 내역이 없습니다.';
    } else if (listPeriodMode === 'month') {
      msg = '해당 월에 등록된 내역이 없습니다.';
    }
    if (c) c.innerHTML = `<div style="text-align:center; padding:30px; color:var(--gray-500); font-weight:500;">${msg}</div>`;
    if (tbody) tbody.innerHTML = `<tr><td colspan="38" style="padding:30px; color:var(--gray-500); font-weight:500;">${msg}</td></tr>`;
    return;
  }

  // SafeExcel 헬퍼 함수 참조
  const se = window.SafeExcel || {};
  const resolveAgent = se.resolveAgentHierarchy || (r => ({
    major: r.agentMajor || r.kind || '가시설',
    mid: r.agentMid || r.item || '비계',
    minor: r.agentMinor || r.agent || '-'
  }));
  const mapType = se.mapAccidentType || (t => t || '기타');
  const markCauseFn = se.markCause || ((r, k) => ((r.mgmtCauses || []).includes(k) || (r.causes || []).includes(k) ? '●' : ''));
  const getOpType = se.getInspectorOpinionType || (r => r.inspectorOpinionType || '시스템 개선');
  const getPmType = se.getPmVerdictType || (r => r.pmVerdictType || getOpType(r));
  const cleanWorkGroupFn = se.cleanWorkGroup || (w => String(w || '가설공사(기타)').replace(/[_|ㅣ¦!\[\]\r\n]+/g, ' ').trim() || '가설공사(기타)');
  const resolveWgHierFn = se.resolveWorkGroupHierarchy || (r => ({
    mid: resolveWorkGroupMid(r.workGroup, r.workGroupMid, r.content),
    minor: cleanWorkGroupFn(r.workGroup, r.content)
  }));
  const resolveLocCatFn = se.resolveLocationCategory || (r => inferLocationCategory(r.locationCategory, r.location, r.content));
  const cleanOpinionFn = se.cleanOpinionText || (t => String(t || '').trim());
  const cleanProposalFn = se.cleanProposalText || cleanOpinionFn;
  const cleanContentFn = se.cleanContent || (t => String(t || '').trim());
  const cleanLocationFn = se.cleanLocation || ((loc) => String(loc || '').trim());
  const resolveActionPlanFn = se.resolveActionPlanText || (r => (r.fix && r.fix.content) || r.actionPlan || r.countermeasure || '(미조치)');

  const cardElements = [];
  const rowElements = [];

  for (const [idx, r] of filtered.entries()) {
    if (thisSeq !== listRenderSeq) return;

    const isFixed = r.status === '조치완료';
    const sevVal = (window.SafePPT && typeof window.SafePPT.inferRecordSeverity === 'function')
      ? window.SafePPT.inferRecordSeverity(r)
      : (r.severity === '중부적합' || (!r.severity && r.status !== '조치완료') ? '중부적합' : '경부적합');
    const isMajor = sevVal === '중부적합';
    const agent = resolveAgent(r);
    const accType = mapType(r.type, r.content);
    const opType = getOpType(r);
    const pmType = getPmType(r);
    const wgHier = resolveWgHierFn(r);
    const cleanedWorkGroupMid = wgHier.mid || '건축공사';
    const cleanedWorkGroup = wgHier.minor || cleanWorkGroupFn(r.workGroup, r.content);
    const cleanedContent = cleanContentFn(r.content || '');
    const cleanedLocation = cleanLocationFn(r.location || '', cleanedContent || r.content || '');
    const resolvedLocationCategory = resolveLocCatFn(r);
    const cleanedInterviewOp = cleanOpinionFn(r.interviewOpinion || r.workerOpinion || '');
    const cleanedAuditProp = cleanProposalFn(r.auditProposal || r.inspectorOpinion || '');
    const actionPlanText = resolveActionPlanFn(r);
    const hasActionText = actionPlanText && actionPlanText !== '(미조치)';

    // 1) 모바일 카드형 뷰 (즉시 동기 렌더링)
    if (c) {
      const btnGroup = h('div', { style: { display: 'flex', gap: '8px', marginTop: '10px' } });
      if (!isFixed) {
        btnGroup.append(h('button.btn.btn-outline', {
          style: { fontSize: '0.82rem', padding: '6px 12px', flex: '1' },
          onclick: () => {
            targetFixRecord = r;
            fixPhotoData = null;
            $('#txtFixContent').value = '';
            $('#fixPhotoPreview').innerHTML = '';
            $('#fixModal').style.display = 'flex';
          }
        }, '🔧 조치등록'));
      }
      btnGroup.append(h('button.btn.btn-outline', {
        style: { fontSize: '0.82rem', padding: '6px 12px', color: '#1e40af', borderColor: '#bfdbfe', background: '#eff6ff' },
        onclick: () => openJangpyoForRecord(r.id)
      }, '📑 점검장표 PPT'));
      btnGroup.append(h('button.btn.btn-outline', {
        style: { fontSize: '0.82rem', padding: '6px 12px', color: 'var(--danger)', borderColor: '#fca5a5' },
        onclick: () => deleteOneRecord(r)
      }, '🗑️ 삭제'));

      const cardBody = h('div', { style: { display: 'flex', gap: '10px', alignItems: 'flex-start', marginBottom: '8px' } });
      const photoBox = h('div', { style: { display: 'flex', gap: '4px', flexShrink: '0' } });

      const setupCardThumb = (path, title) => {
        if (!path) return null;
        const cached = store._photoCache && store._photoCache.get(path);
        const workerUrl = (store.backend && store.backend.url) ? `${store.backend.url}/file?path=${encodeURIComponent(path)}&raw=1` : '';
        const initialSrc = cached || path;
        const img = h('img', {
          src: initialSrc,
          style: {
            width: '56px', height: '56px', objectFit: 'cover', borderRadius: '6px',
            border: '1px solid #cbd5e1', cursor: 'pointer',
            display: 'block'
          },
          onclick: () => { if (img.src) window.open(img.src, '_blank'); },
          onerror: (e) => {
            if (!img.dataset.triedWorker && workerUrl) {
              img.dataset.triedWorker = '1';
              img.src = workerUrl;
            } else {
              e.target.style.display = 'none';
            }
          },
          title
        });
        if (!cached && store.localBackend) {
          store.localBackend.readBlob(path).then(b => {
            if (b && img.isConnected) {
              const u = URL.createObjectURL(b);
              store._photoCache.set(path, u);
              img.src = u;
            }
          }).catch(() => {});
        }
        return img;
      };

      const p1Img = setupCardThumb(r.photos && r.photos[0], '사진 1 원본보기');
      if (p1Img) photoBox.append(p1Img);
      const p2Img = setupCardThumb(r.photos && r.photos[1], '사진 2 원본보기');
      if (p2Img) photoBox.append(p2Img);
      if (photoBox.children.length > 0) cardBody.append(photoBox);

      cardBody.append(h('div', { style: { flex: '1', minWidth: '0' } },
        h('div', { style: { fontSize: '0.92rem', marginBottom: '4px', color: 'var(--gray-900)', fontWeight: '500', whiteSpace: 'pre-line' } }, cleanedContent),
        h('div', { style: { fontSize: '0.8rem', color: 'var(--gray-600)' } },
          `[${agent.major}] ${agent.mid} › ${agent.minor} · ${r.inspectedDate} (${r.inspector})`
        )
      ));

      const sevBadge = h('span.badge', {
        style: {
          background: isMajor ? '#fef2f2' : '#fffbeb',
          color: isMajor ? '#dc2626' : '#d97706',
          border: `1px solid ${isMajor ? '#fca5a5' : '#fde68a'}`,
          fontSize: '0.72rem',
          fontWeight: '700',
          padding: '2px 6px',
          borderRadius: '4px'
        }
      }, isMajor ? '🚨 중부적합' : '⚠️ 경부적합');

      const card = h('div.card', { style: { padding: '14px', borderLeft: `5px solid ${isMajor ? '#ef4444' : '#f59e0b'}` } },
        h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', marginBottom: '6px', flexWrap: 'wrap' } },
          h('div', { style: { display: 'flex', alignItems: 'center', gap: '6px' } },
            sevBadge,
            h('strong', { style: { fontSize: '0.95rem', minWidth: '0', wordBreak: 'keep-all' } }, `[${r.site}] ${cleanedLocation || '-'}`)
          ),
          h('span.badge', { class: isFixed ? 'success' : 'danger', style: { flexShrink: '0', whiteSpace: 'nowrap' } }, isFixed ? '✅ 조치완료' : '⚠️ 미조치')
        ),
        cardBody,
        (cleanedWorkGroup || r.workMethod || r.workName) ? h('div', { style: { fontSize: '0.76rem', color: '#0f766e', background: '#f0fdfa', padding: '4px 8px', borderRadius: '4px', marginBottom: '6px' } },
          `🔨 공종·작업방법: ${cleanedWorkGroupMid} › ${cleanedWorkGroup || '가설공사(기타)'} › ${resolveDisplayWorkMethod(r)} · 장소분류: ${resolvedLocationCategory}`
        ) : '',
        (r.productType || r.progressRate !== undefined || r.subcontractor) ? h('div', { style: { fontSize: '0.76rem', color: '#4338ca', background: '#eef2ff', padding: '4px 8px', borderRadius: '4px', marginBottom: '6px' } },
          `🏢 ${r.productType || '공동주택'} · 공정률: ${r.progressRate !== undefined && r.progressRate !== null ? r.progressRate : 0}% (${r.stage || '지하 골조 단계'}) ${r.subcontractor ? '· 협력사: ' + r.subcontractor : ''}`
        ) : '',
        isFixed ? h('div', { style: { fontSize: '0.82rem', color: 'var(--gray-800)', background: 'var(--gray-50)', padding: '6px 10px', borderRadius: '6px', marginBottom: '6px' } }, `조치결과: ${r.fix.content}`) : '',
        btnGroup
      );
      cardElements.push(card);
    }

    // 2) 엑셀 스프레드시트 테이블 뷰 (35개 열 완전 일치, 초고속 썸네일)
    if (tbody) {
      const setupTableThumb = (path, title, size = 40) => {
        if (!path) return '<span style="color:var(--gray-400); font-size:0.75rem;">-</span>';
        const workerUrl = (store.backend && store.backend.url) ? `${store.backend.url}/file?path=${encodeURIComponent(path)}&raw=1` : '';
        const cached = store._photoCache && store._photoCache.get(path);
        const initialSrc = cached || path;
        return `<span><img src="${initialSrc}" style="width:${size}px; height:${size}px; object-fit:cover; border-radius:4px; border:1px solid #cbd5e1; cursor:pointer;" onclick="window.open(this.src, '_blank')" onerror="if (!this.dataset.triedWorker && '${workerUrl}') { this.dataset.triedWorker='1'; this.src='${workerUrl}'; } else { this.parentElement.innerHTML='<span style=\\'color:var(--gray-300); font-size:0.75rem;\\'>📷</span>'; }" title="${title}"></span>`;
      };

      const p1Thumb = setupTableThumb(r.photos && r.photos[0], '사진 1 원본보기', 40);
      const p2Thumb = setupTableThumb(r.photos && r.photos[1], '사진 2 원본보기', 40);
      const fixThumb = setupTableThumb(r.fix && r.fix.photo, '조치완료 사진', 36);

      const cause1 = markCauseFn(r, '계획 미수립') || '-';
      const cause2 = markCauseFn(r, '계획 미이행') || '-';
      const cause3 = markCauseFn(r, '불안전 행동') || '-';
      const cause4 = markCauseFn(r, '불안전 상태') || '-';

      const tr = document.createElement('tr');
      tr.style.borderBottom = '1px solid #e2e8f0';
      const origBg = idx % 2 === 0 ? '#ffffff' : '#f8fafc';
      tr.style.background = origBg;
      tr.dataset.origBg = origBg;
      tr.innerHTML = `
        <td style="padding:6px 2px; position:sticky; left:0; z-index:5; background:${origBg}; cursor:pointer; width:44px; text-align:center;" class="cell-chk" title="클릭하여 선택/해제">
          <input type="checkbox" class="chk-record-item" data-id="${r.id}" style="width:20px; height:20px; cursor:pointer; accent-color:#ef4444; vertical-align:middle;">
        </td>
        <td style="padding:6px 4px; font-weight:600; color:var(--gray-700); position:sticky; left:44px; z-index:5; background:${origBg}; width:62px; white-space:nowrap; text-align:center; border-right:1px solid #e2e8f0;" class="cell-no">
          <div style="display:flex; align-items:center; justify-content:center; gap:3px;">
            <span>${idx + 1}</span>
            <button type="button" class="btn-quick-row-del" title="이 항목 즉시 삭제" style="border:none; background:transparent; color:#ef4444; cursor:pointer; font-size:1.05rem; padding:1px 3px; border-radius:4px; opacity:0.75; transition:all 0.15s;" onmouseover="this.style.opacity='1'; this.style.transform='scale(1.2)';" onmouseout="this.style.opacity='0.75'; this.style.transform='scale(1)';">🗑️</button>
          </div>
        </td>
        <td style="padding:4px;">${p1Thumb}</td>
        <td style="padding:4px;">${p2Thumb}</td>
        <td style="padding:6px; font-weight:700; color:${isMajor ? '#dc2626' : '#d97706'}; font-size:0.75rem;">${isMajor ? '🚨 중부적합' : '⚠️ 경부적합'}</td>
        <td style="padding:8px 10px; text-align:left; white-space:pre-line; font-weight:500; color:var(--gray-900); min-width:220px;">${cleanedContent || ''}</td>
        <td style="padding:8px 6px; color:var(--gray-700);">${r.subcontractor || '-'}</td>
        <td style="padding:8px 6px; color:var(--gray-700); font-weight:500;">${cleanedLocation || '-'}</td>
        <td style="padding:8px 6px; color:#1d4ed8; font-weight:600;">${resolvedLocationCategory || '-'}</td>
        <td style="padding:8px 6px; color:#0f766e; font-weight:600;">${cleanedWorkGroupMid || '-'}</td>
        <td style="padding:8px 6px; color:var(--gray-700);">${cleanedWorkGroup}</td>
        <td style="padding:8px 6px; color:var(--gray-700);">${resolveDisplayWorkMethod(r)}</td>
        <td style="padding:8px 6px;"><span class="badge" style="font-size:0.74rem;">${accType}</span></td>
        <td style="padding:8px 6px; font-weight:600; color:var(--gray-800);">${agent.major}</td>
        <td style="padding:8px 6px; color:var(--gray-700);">${agent.mid}</td>
        <td style="padding:8px 6px; color:var(--gray-700); font-weight:500;">${agent.minor}</td>
        <td style="padding:8px 6px; color:var(--gray-600); font-size:0.75rem; text-align:left;">${r.law || (r.basis && r.basis.law) || '-'}</td>
        <td style="padding:8px 6px; color:var(--gray-700);">${resolveDisplayCondition(r)}</td>
        <td style="padding:8px 6px; color:var(--gray-700);">${resolveDisplayAction(r)}</td>
        <td style="padding:8px 6px; color:var(--gray-700);">${r.rootCauseMgmt || (r.basis && r.basis.근본원인_관리감독) || '-'}</td>
        <td style="padding:8px 6px; color:var(--gray-700);">${r.rootCauseSystem || (r.basis && r.basis.근본원인_안전시스템) || '-'}</td>
        <td style="padding:8px 4px; font-weight:700; color:${cause1 === '●' ? '#dc2626' : 'var(--gray-400)'};">${cause1}</td>
        <td style="padding:8px 4px; font-weight:700; color:${cause2 === '●' ? '#dc2626' : 'var(--gray-400)'};">${cause2}</td>
        <td style="padding:8px 4px; font-weight:700; color:${cause3 === '●' ? '#dc2626' : 'var(--gray-400)'};">${cause3}</td>
        <td style="padding:8px 4px; font-weight:700; color:${cause4 === '●' ? '#dc2626' : 'var(--gray-400)'};">${cause4}</td>
        <td style="padding:8px 6px; color:var(--gray-700); text-align:left; white-space:pre-line;">${cleanedInterviewOp || '-'}</td>
        <td style="padding:8px 6px;"><span class="badge" style="font-size:0.72rem; background:#eff6ff; color:#1d4ed8; border:1px solid #bfdbfe;">${opType}</span></td>
        <td style="padding:8px 10px; color:var(--gray-700); text-align:left; min-width:150px; white-space:pre-line;">${cleanedAuditProp || '-'}</td>
        <td style="padding:8px 6px; font-weight:600; color:var(--gray-800);">${r.site || '-'}</td>
        <td style="padding:8px 6px; color:var(--gray-700);">${r.productType || '공동주택'}</td>
        <td style="padding:8px 4px; color:var(--gray-700);">${r.progressRate !== undefined && r.progressRate !== null ? (r.progressRate + '%') : '-'}</td>
        <td style="padding:8px 6px; color:var(--gray-700);">${r.stage || '지하 골조 단계'}</td>
        <td style="padding:8px 6px; white-space:nowrap;"><span class="badge ${isFixed ? 'success' : 'danger'}" style="font-size:0.75rem;">${isFixed ? '✅ 조치완료' : '⚠️ 미조치'}</span></td>
        <td style="padding:8px 10px; text-align:left; white-space:pre-line; color:${hasActionText ? 'var(--gray-800)' : 'var(--gray-400)'}; min-width:180px;">${actionPlanText}</td>
        <td style="padding:8px 6px;"><span class="badge" style="font-size:0.72rem; background:#f0fdf4; color:#15803d; border:1px solid #bbf7d0;">${pmType}</span></td>
        <td style="padding:4px;">${fixThumb}</td>
        <td style="padding:8px 6px; color:var(--gray-600);">${r.inspectedDate || '-'}</td>
        <td style="padding:8px 6px; color:var(--gray-600);">${r.inspector || '-'}</td>
        <td style="padding:6px 4px; white-space:nowrap;">
          <div style="display:flex; gap:3px; justify-content:center;">
            <button type="button" class="btn btn-outline btn-table-jangpyo" style="padding:3px 6px; font-size:0.75rem; color:#1e40af; border-color:#bfdbfe; background:#eff6ff;" title="점검장표 PPT 열기">장표</button>
            ${!isFixed ? `<button type="button" class="btn btn-outline btn-table-fix" style="padding:3px 6px; font-size:0.75rem;">조치</button>` : ''}
            <button type="button" class="btn btn-outline btn-table-del" style="padding:3px 6px; font-size:0.75rem; color:var(--danger); border-color:#fca5a5;" title="삭제">삭제</button>
          </div>
        </td>
      `;

      const chkBox = tr.querySelector('.chk-record-item');
      const cellChk = tr.querySelector('.cell-chk');
      if (cellChk && chkBox) {
        cellChk.addEventListener('click', (e) => {
          if (e.target !== chkBox) {
            chkBox.checked = !chkBox.checked;
            updateSelectedCount();
          }
        });
        chkBox.addEventListener('change', updateSelectedCount);
      }

      const quickDelBtn = tr.querySelector('.btn-quick-row-del');
      if (quickDelBtn) {
        quickDelBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          deleteOneRecord(r);
        });
      }

      const jangpyoBtn = tr.querySelector('.btn-table-jangpyo');
      if (jangpyoBtn) jangpyoBtn.addEventListener('click', () => openJangpyoForRecord(r.id));

      const fixBtn = tr.querySelector('.btn-table-fix');
      if (fixBtn) {
        fixBtn.addEventListener('click', () => {
          targetFixRecord = r;
          fixPhotoData = null;
          $('#txtFixContent').value = '';
          $('#fixPhotoPreview').innerHTML = '';
          $('#fixModal').style.display = 'flex';
        });
      }

      const delBtn = tr.querySelector('.btn-table-del');
      if (delBtn) delBtn.addEventListener('click', () => deleteOneRecord(r));

      rowElements.push(tr);
    }
  }

  if (thisSeq !== listRenderSeq) return;

  // DOM에 즉시 반영 (블로킹 없이 0.01초 내 완료!)
  if (c) c.replaceChildren(...cardElements);
  if (tbody) tbody.replaceChildren(...rowElements);
  syncTableTopScrollWidth();
}

// ── PDF / PPTX / 장표 파일 임포트 처리 ──
async function handlePptxImportChange(e) {
  const files = Array.from(e.target.files || []);
  if (!files.length) return;

  toast(`${files.length}개 파일 분석 중...`, 'info', 2500);
  importedRecords = [];
  let totalSkippedPages = 0;

  const progBox = $('#importProgressBox');
  const progStatus = $('#importProgressStatus');
  const progPct = $('#importProgressPercent');
  const progBar = $('#importProgressBar');

  if (progBox) progBox.style.display = 'block';
  if (progStatus) progStatus.textContent = '📄 파일 분석 준비 중...';
  if (progPct) progPct.textContent = '0%';
  if (progBar) progBar.style.width = '0%';

  for (const f of files) {
    try {
      const lowerName = f.name.toLowerCase();
      if (lowerName.endsWith('.pdf') || f.type === 'application/pdf') {
        const pdfRes = await parsePDF(f, (prog) => {
          const cur = prog.current || prog.currentPage || 1;
          const tot = Math.max(1, prog.total || prog.totalPages || 1);
          const ext = prog.extracted !== undefined ? prog.extracted : (prog.extractedCount || 0);
          const skp = prog.skipped !== undefined ? prog.skipped : (prog.skippedCount || 0);
          const pct = Math.min(100, Math.round((cur / tot) * 100));
          if (progStatus) {
            const phaseText = prog.phase === 'skip'
              ? `페이지 ${cur}/${tot}: 일반 글씨/간지 페이지 생략`
              : `페이지 ${cur}/${tot} 분석 중... (점검장표 ${ext}건 추출 / 일반 글씨 ${skp}장 생략)`;
            progStatus.textContent = `📕 [${f.name}] ${phaseText}`;
          }
          if (progPct) progPct.textContent = `${pct}%`;
          if (progBar) progBar.style.width = `${pct}%`;
        });
        const records = Array.isArray(pdfRes) ? pdfRes : ((pdfRes && pdfRes.records) || []);
        totalSkippedPages += (pdfRes && (pdfRes._skippedPages || pdfRes.skippedCount)) || 0;
        records.forEach(r => {
          const pNo = r.pageNumber || r.slideNumber;
          r._sourceFile = pNo ? `${f.name} · P.${pNo}` : f.name;
        });
        importedRecords.push(...records);
      } else if (lowerName.endsWith('.pptx')) {
        if (progStatus) progStatus.textContent = `📑 [${f.name}] PPTX 장표 추출 중...`;
        if (progPct) progPct.textContent = '50%';
        if (progBar) progBar.style.width = '50%';
        const records = await parsePPTX(f);
        records.forEach(r => { r._sourceFile = f.name; });
        importedRecords.push(...records);
      } else if (f.type.startsWith('image/') || /\.(jpe?g|png|webp|bmp)$/i.test(f.name)) {
        if (progStatus) progStatus.textContent = `📸 [${f.name}] 장표 이미지 분석 중...`;
        if (progPct) progPct.textContent = '50%';
        if (progBar) progBar.style.width = '50%';
        const record = await parseImage(f);
        if (record && !record._skipped) {
          record._sourceFile = f.name;
          importedRecords.push(record);
        } else {
          totalSkippedPages++;
        }
      }
    } catch (err) {
      console.error('File parse error:', f.name, err);
      toast(`[${f.name}] 파싱 실패: ${err.message}`, 'danger');
    }
  }

  if (progPct) progPct.textContent = '100%';
  if (progBar) progBar.style.width = '100%';
  if (progStatus) {
    progStatus.textContent = `✅ 분석 완료: 점검장표 ${importedRecords.length}건 추출` +
      (totalSkippedPages > 0 ? ` (일반 글씨/간지 ${totalSkippedPages}페이지 자동 생략)` : '');
  }

  if (importedRecords.length > 0) {
    // [v63 A2/A3/A4] PDF 등록 시 사진 비율은 자동 면적비례('auto') 고정, 관련기준 칸맞춤·분류·띄어쓰기는 1차 병렬 배치에서 완료하며 미완료 항목만 타겟 보완!
    window.SafeLocalAI?.clearAiFailures?.();
    importedRecords.forEach(r => { if (r) r.photoLayoutRatio = 'auto'; });
    if (window.SafeLocalAI?.repairMissingFieldsOnImport) {
      try {
        if (progPct) progPct.textContent = '90%';
        if (progBar) progBar.style.width = '90%';
        await window.SafeLocalAI.repairMissingFieldsOnImport(importedRecords, (msg) => {
          if (progStatus && msg) progStatus.textContent = msg;
        });
      } catch (repairErr) {
        console.warn('Auto import AI repair fallback:', repairErr);
      }
    }
    const remainingUnverified = importedRecords.filter(r => r && !r._aiVerified);
    if (remainingUnverified.length > 0 && window.SafeLocalAI?.verifyRecordsBeforeSave) {
      try {
        if (progPct) progPct.textContent = '95%';
        if (progBar) progBar.style.width = '95%';
        if (progStatus) progStatus.textContent = `🤖 AI 미완료 항목 최종 검증 중 (${remainingUnverified.length}건)...`;
        await window.SafeLocalAI.verifyRecordsBeforeSave(remainingUnverified, (msg) => {
          if (progStatus && msg) progStatus.textContent = msg;
        });
      } catch (verifyErr) {
        console.warn('Auto pre-save AI verify fallback:', verifyErr);
      }
    }
    if (window.SafeLocalAI?.condenseOverflowLawBodiesWithAI) {
      const stillOverflow = importedRecords.filter(r => r && window.SafeTextNormalizer?.isLawBodyOverflowing?.(r.lawBody || ''));
      if (stillOverflow.length > 0) {
        try {
          if (progStatus) progStatus.textContent = `🤖 관련기준 칸 초과 항목 정리 중 (${stillOverflow.length}건)...`;
          await window.SafeLocalAI.condenseOverflowLawBodiesWithAI(stillOverflow);
        } catch (_) {}
      }
    }
    const importAiFail = window.SafeLocalAI?.getAiFailureSummary?.();
    if (progPct) progPct.textContent = '100%';
    if (progBar) progBar.style.width = '100%';
    if (progStatus) {
      progStatus.textContent = importAiFail?.hasFailure
        ? `⚠️ 분석 완료(${importedRecords.length}건) — 단, 일부 항목 AI 응답 실패 (${importAiFail.reasons[0] || '응답 없음'})`
        : `✅ 분석 및 AI 자동 검증 완료: 점검장표 ${importedRecords.length}건` +
          (totalSkippedPages > 0 ? ` (일반 글씨/간지 ${totalSkippedPages}페이지 자동 생략)` : '');
    }
    const skipMsg = totalSkippedPages > 0 ? ` (일반 글씨 ${totalSkippedPages}장 생략)` : '';
    if (importAiFail?.hasFailure) {
      showAiFailurePopup({
        stage: 'PDF/장표 등록 AI 분석',
        failedCount: importAiFail.failedCount,
        totalCount: importedRecords.length,
        reasons: importAiFail.reasons,
        quotaExceeded: importAiFail.quotaExceeded
      });
    } else {
      toast(`총 ${importedRecords.length}건의 점검장표를 추출·AI 자동 검증했습니다!${skipMsg}`, 'success', 3500);
    }
    if ($('#importPreviewArea')) $('#importPreviewArea').style.display = 'block';
    if ($('#importCount')) $('#importCount').textContent = importedRecords.length;
    renderImportedCards();
  } else {
    toast('추출할 수 있는 부적합 점검장표를 찾지 못했습니다.', 'warning');
  }
}

let _filterLowConfidenceOnly = false;

function renderImportedCards() {
  const container = $('#importCardsContainer');
  if (!container) return;
  container.innerHTML = '';

  const isLowConfRec = (r) => Array.isArray(r.lowConfidenceFields) && r.lowConfidenceFields.length > 0;
  const lowConfCount = importedRecords.filter(isLowConfRec).length;

  // 상단 [⚠️ 확인 필요 항목만 보기] 필터 바 렌더링
  if (importedRecords.length > 0) {
    const filterBar = document.createElement('div');
    filterBar.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:8px 12px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;margin-bottom:8px;font-size:0.78rem;';
    filterBar.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;">
        <span style="font-weight:700;color:#1e293b;">총 ${importedRecords.length}건 추출 완료 (PaddleOCR v5 ONNX + Qwen3 배치 분류)</span>
        <span style="color:${lowConfCount > 0 ? '#ea580c' : '#16a34a'};font-weight:700;">
          ${lowConfCount > 0 ? `⚠️ 확인 권장 셀 포함: ${lowConfCount}건` : '✅ 전 항목 고신뢰 판독 완료'}
        </span>
      </div>
      <button type="button" id="btnToggleLowConfFilter" style="padding:4px 10px;border-radius:6px;font-size:0.75rem;font-weight:700;cursor:pointer;border:1px solid ${_filterLowConfidenceOnly ? '#ea580c' : '#cbd5e1'};background:${_filterLowConfidenceOnly ? '#fff7ed' : '#ffffff'};color:${_filterLowConfidenceOnly ? '#c2410c' : '#475569'};">
        ${_filterLowConfidenceOnly ? `전체 항목 보기 (${importedRecords.length}건)` : `⚠️ 확인 필요 항목만 보기 (${lowConfCount}건)`}
      </button>
    `;
    filterBar.querySelector('#btnToggleLowConfFilter')?.addEventListener('click', () => {
      _filterLowConfidenceOnly = !_filterLowConfidenceOnly;
      renderImportedCards();
    });
    container.appendChild(filterBar);
  }

  importedRecords.forEach((rec, idx) => {
    const hasLowConf = isLowConfRec(rec);
    if (_filterLowConfidenceOnly && !hasLowConf) return;

    const isMajor = rec.severity === '중부적합';
    const card = document.createElement('div');
    card.style.cssText = `
      background: white; border: ${hasLowConf ? '2px solid #fb923c' : `1px solid ${isMajor ? '#fca5a5' : '#fde68a'}`};
      border-left: 4px solid ${hasLowConf ? '#ea580c' : (isMajor ? '#ef4444' : '#f59e0b')};
      border-radius: 8px; padding: 12px; display: flex; flex-direction: column; gap: 8px; font-size: 0.82rem;
    `;

    const p1 = (rec.photos && rec.photos[0]) || rec.photo1;
    const p2 = (rec.photos && rec.photos[1]) || rec.photo2;
    const hasNoPhoto = !p1 && !p2;
    if (hasNoPhoto) {
      card.dataset.missingPhoto = '1';
      card.style.border = '2px solid #ef4444';
      card.style.borderLeft = '5px solid #dc2626';
      card.style.background = '#fef2f2';
    }
    const thumbHtml = `
      <div style="display: flex; gap: 6px; flex-shrink: 0; align-items: center;">
        ${p1 ? `
          <div style="position: relative; display: inline-block;">
            <img src="${p1}" style="width: 76px; height: 76px; object-fit: cover; border-radius: 6px; border: 2px solid #3b82f6; display: block;" title="추출 사진 1">
            <span style="position: absolute; bottom: 2px; left: 2px; background: rgba(30,58,138,0.88); color: white; font-size: 0.60rem; font-weight: 700; padding: 1px 4px; border-radius: 3px;">사진1</span>
          </div>
        ` : ''}
        ${p2 ? `
          <div style="position: relative; display: inline-block;">
            <img src="${p2}" style="width: 76px; height: 76px; object-fit: cover; border-radius: 6px; border: 2px solid #10b981; display: block;" title="추출 사진 2">
            <span style="position: absolute; bottom: 2px; left: 2px; background: rgba(6,78,59,0.88); color: white; font-size: 0.60rem; font-weight: 700; padding: 1px 4px; border-radius: 3px;">사진2</span>
          </div>
        ` : ''}
        ${hasNoPhoto ? `
          <div style="width: 82px; min-height: 76px; background: #fee2e2; border: 2px dashed #ef4444; border-radius: 6px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; padding: 4px; text-align: center;">
            <span style="color: #b91c1c; font-size: 0.68rem; font-weight: 800;">⚠️ 사진없음</span>
            <label style="cursor: pointer; background: #dc2626; color: white; font-size: 0.64rem; font-weight: 700; padding: 2px 5px; border-radius: 4px;">
              📸 첨부
              <input type="file" accept="image/*" multiple class="input-card-attach-photo" data-idx="${idx}" style="display: none;">
            </label>
          </div>
        ` : ''}
      </div>
    `;

    const causesStr = (rec.mgmtCauses && rec.mgmtCauses.length) ? rec.mgmtCauses.join(', ') : '-';

    const resolvedPreviewAgent = window.SafeExcel?.resolveAgentHierarchy
      ? window.SafeExcel.resolveAgentHierarchy(rec)
      : null;
    const isAlForm = /알폼|al\s*form|alform|알루미늄/i.test(`${rec.content || ''} ${rec.agent || ''} ${rec.item || ''}`);
    const isSpecialForm = isAlForm || /갱폼|gang\s*form|gangform|특수거푸집|선해체/i.test(`${rec.content || ''} ${rec.agent || ''} ${rec.item || ''}`);
    const displayMajor = rec.agentMajor || (resolvedPreviewAgent && resolvedPreviewAgent.major) || '가시설';
    const displayMid = isAlForm ? '특수거푸집' : (rec.agentMid || (resolvedPreviewAgent && resolvedPreviewAgent.mid) || (isSpecialForm ? '특수거푸집' : '안전시설'));
    const displayMinor = isAlForm ? '알폼' : (rec.agentMinor || (resolvedPreviewAgent && resolvedPreviewAgent.minor) || (isSpecialForm ? '갱폼' : ''));
    const contentLow = rec.lowConfidenceFields?.includes('content');
    const contentConfPct = rec.cellConfidences?.content ? Math.round(rec.cellConfidences.content.confidence * 100) : 99;

    const escapeAttr = (v) => String(v || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const verifiedBadgeHtml = rec._aiVerified
      ? `<span style="background:#ecfdf5;color:#047857;border:1px solid #a7f3d0;padding:1px 6px;border-radius:4px;font-size:0.68rem;font-weight:700;">✅ AI 자동 검증됨${rec._aiVerifyIssues?.length ? ` (${rec._aiVerifyIssues.length}건 교정)` : ''}</span>`
      : `<span style="background:#eff6ff;color:#1d4ed8;border:1px solid #bfdbfe;padding:1px 6px;border-radius:4px;font-size:0.68rem;font-weight:700;">🤖 저장 시 자동 검증</span>`;

    card.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
          <span style="background: ${isMajor ? '#fef2f2' : '#fffbeb'}; color: ${isMajor ? '#dc2626' : '#d97706'}; font-weight: 700; padding: 2px 6px; border-radius: 4px; border: 1px solid ${isMajor ? '#fca5a5' : '#fde68a'}; font-size: 0.72rem;">
            ${isMajor ? '🚨 중부적합' : '⚠️ 경부적합'}
          </span>
          <span style="font-weight: 700; color: var(--gray-800);">${rec.type || '추락'}</span>
          <span style="font-size: 0.71rem; background: #f1f5f9; color: #334155; padding: 1px 6px; border-radius: 4px; font-weight: 600;">
            ${displayMajor} &gt; ${displayMid}${displayMinor ? ` &gt; ${displayMinor}` : ''}
          </span>
          ${verifiedBadgeHtml}
          ${hasNoPhoto ? `<span style="background:#fee2e2;color:#b91c1c;border:1px solid #f87171;padding:1px 6px;border-radius:4px;font-size:0.68rem;font-weight:800;">🚫 사진 미첨부 — 저장 불가</span>` : ''}
          <span style="font-size: 0.72rem; color: var(--gray-500);">(${rec._sourceFile || '슬라이드 ' + (rec.slideNumber || idx + 1)})</span>
          ${hasLowConf ? `<span style="background:#fff7ed;color:#c2410c;border:1px solid #fdba74;padding:1px 6px;border-radius:4px;font-size:0.68rem;font-weight:700;">🔍 원본 대조 권장 (${rec.lowConfidenceFields.join(', ')})</span>` : ''}
        </div>
        <div style="display: flex; gap: 4px; align-items: center;">
          <button type="button" class="btn btn-outline btn-load-to-form" data-idx="${idx}" style="padding: 2px 8px; font-size: 0.72rem; border-color: var(--primary); color: var(--primary);">
            ✏️ 직접입력 폼에 채우기
          </button>
          <button type="button" class="btn btn-outline btn-remove-import-card" data-idx="${idx}" style="padding: 2px 7px; font-size: 0.72rem; border-color: #fca5a5; color: #dc2626;" title="목록에서 제외">
            🗑️ 제외
          </button>
        </div>
      </div>

      <div class="crop-loupe-preview" style="display:none;background:#0f172a;padding:6px 8px;border-radius:6px;border:1px solid #334155;">
        <div class="crop-loupe-label" style="font-size:0.68rem;color:#93c5fd;font-weight:700;margin-bottom:4px;">🔎 원본 PDF 1:1 셀 크롭 이미지 대조 (Loupe)</div>
        <img class="crop-loupe-img" src="" style="max-width:100%;max-height:95px;object-fit:contain;background:#fff;border-radius:4px;display:block;">
      </div>

      <div style="display: flex; gap: 10px;">
        ${thumbHtml}
        <div style="flex: 1; min-width: 0;">
          <div style="margin-bottom: 4px; display:flex; gap:6px; align-items:center;">
            <strong style="font-size:0.71rem; color:#991b1b; white-space:nowrap;">🖼️ 사진 요약:</strong>
            <input type="text" class="loupe-bound-field" data-crop-key="banner" data-field="photoBanner" value="${escapeAttr(rec.photoBanner || '')}" placeholder="AI 검증 시 자동 요약" style="flex:1;font-size:0.75rem;padding:2px 6px;border:1px solid #fecaca;border-radius:4px;background:#fef2f2;color:#7f1d1d;font-weight:700;">
          </div>
          <div style="margin-bottom: 4px;">
            <label style="font-size: 0.72rem; color: ${contentLow ? '#c2410c' : '#4338ca'}; font-weight: 700; display: block; margin-bottom: 2px;">
              📋 추출된 부적합 내용 (클릭 시 상단에 원본 크롭 표시 · 정확도 ${contentConfPct}%):
            </label>
            <textarea class="form-control txt-import-content loupe-bound-field" data-crop-key="content" data-field="content" rows="2" style="font-size: 0.8rem; width: 100%; border: ${contentLow ? '2px solid #f97316' : '1px solid #a5b4fc'}; border-radius: 4px; padding: 4px 6px; background: ${contentLow ? '#fff7ed' : '#f5f3ff'}; font-weight: 600; color: #1e1b4b; resize: vertical;">${rec.content || ''}</textarea>
          </div>
          <div style="font-size: 0.73rem; color: #1e40af; background: #eff6ff; padding: 4px 6px; border-radius: 4px; border: 1px solid #dbeafe; margin-bottom: 4px; display:flex; flex-direction:column; gap:3px;">
            <div style="display:flex;gap:4px;align-items:center;">
              <strong style="white-space:nowrap;">📜 관련기준:</strong>
              <input type="text" class="loupe-bound-field" data-crop-key="law" data-field="rawLaw" value="${escapeAttr(rec.rawLaw || filterOnlyOccupationalSafetyLaw(rec.law) || '')}" placeholder="산업안전보건법 관련기준 (AI 자동 검증)" style="flex:1;font-size:0.72rem;padding:1px 5px;border:1px solid #bfdbfe;border-radius:3px;background:#fff;color:#1e3a8a;font-weight:700;">
            </div>
            <textarea class="loupe-bound-field" data-crop-key="lawBody" data-field="lawBody" rows="2" placeholder="세부 기준 내용 (AI 검증 시 자동 보완)" style="width:100%;font-size:0.70rem;padding:2px 5px;border:1px solid #dbeafe;border-radius:3px;background:#fff;color:#1e40af;resize:vertical;">${rec.lawBody || ''}</textarea>
          </div>
          <div style="color: var(--gray-700); font-size: 0.74rem; line-height: 1.4; display:flex; flex-wrap:wrap; gap:6px; align-items:center;">
            <span><strong>공종:</strong> ${rec.workGroup || '-'}</span> |
            <span><strong>작업방법:</strong> ${rec.workMethod || '-'}</span> |
            <span><strong>장소:</strong> <input type="text" class="loupe-bound-field" data-crop-key="loc" data-field="location" value="${escapeAttr(rec.location || '')}" style="font-size:0.73rem;padding:1px 4px;border:1px solid #cbd5e1;border-radius:3px;width:110px;"></span> |
            <span><strong>협력사:</strong> <input type="text" class="loupe-bound-field" data-crop-key="sub" data-field="subcontractor" value="${escapeAttr(rec.subcontractor || '')}" placeholder="(미기재)" style="font-size:0.73rem;padding:1px 4px;border:1px solid #cbd5e1;border-radius:3px;width:90px;"></span> |
            <span><strong>차수:</strong> <input type="text" class="loupe-bound-field" data-crop-key="round" data-field="inspectRound" value="${escapeAttr(rec.inspectRound || '')}" style="font-size:0.73rem;padding:1px 4px;border:1px solid #cbd5e1;border-radius:3px;width:78px;"></span> |
            <span><strong>원인:</strong> <span style="color:#b91c1c;font-weight:700;">${causesStr}</span></span>
          </div>
          ${(rec.interviewOpinion || rec.auditProposal || rec.actionPlan) ? `
          <div style="color: var(--gray-600); font-size: 0.72rem; margin-top: 4px; background: #f8fafc; padding: 5px 6px; border-radius: 4px; border: 1px solid #e2e8f0; display:flex; flex-direction:column; gap:4px;">
            <div style="display:flex;gap:4px;align-items:flex-start;">
              <strong style="white-space:nowrap;padding-top:2px;">💬 관계자의견:</strong>
              <textarea class="loupe-bound-field" data-crop-key="interview" data-field="interviewOpinion" rows="3" style="flex:1;font-size:0.72rem;padding:2px 5px;border:1px solid ${rec.cellConfidences?.interview?.lowConfidence ? '#f97316' : '#cbd5e1'};background:${rec.cellConfidences?.interview?.lowConfidence ? '#fff7ed' : '#fff'};border-radius:3px;resize:vertical;">${escapeAttr(rec.interviewOpinion || '')}</textarea>
            </div>
            <div style="display:flex;gap:4px;align-items:flex-start;">
              <strong style="white-space:nowrap;padding-top:2px;">💡 점검자의견:</strong>
              <input type="text" class="loupe-bound-field" data-crop-key="propText" data-field="auditProposal" value="${escapeAttr(rec.auditProposal || '')}" style="flex:1;font-size:0.72rem;padding:2px 5px;border:1px solid ${rec.cellConfidences?.propText?.lowConfidence ? '#f97316' : '#cbd5e1'};background:${rec.cellConfidences?.propText?.lowConfidence ? '#fff7ed' : '#fff'};border-radius:3px;">
            </div>
            <div style="display:flex;gap:4px;align-items:flex-start;">
              <strong style="white-space:nowrap;padding-top:2px;">🔧 조치내용:</strong>
              <textarea class="loupe-bound-field" data-crop-key="cm" data-field="actionPlan" rows="2" style="flex:1;font-size:0.72rem;padding:2px 5px;border:1px solid ${rec.cellConfidences?.cm?.lowConfidence ? '#f97316' : '#cbd5e1'};background:${rec.cellConfidences?.cm?.lowConfidence ? '#fff7ed' : '#fff'};border-radius:3px;resize:vertical;">${rec.actionPlan || ''}</textarea>
            </div>
          </div>` : ''}
        </div>
      </div>
    `;

    const loupeBox = card.querySelector('.crop-loupe-preview');
    const loupeImg = card.querySelector('.crop-loupe-img');
    const loupeLbl = card.querySelector('.crop-loupe-label');
    const CROP_TITLE_MAP = {
      banner: '사진 요약(배너)',
      content: '부적합 내용',
      law: '관련 기준 제목',
      lawBody: '관련 기준 내용',
      interview: '관계자 인터뷰(의견)',
      propText: '점검단(HAT) 제안',
      cm: '개선대책(조치내용)',
      loc: '작업장소',
      sub: '협력사',
      round: '점검차수'
    };

    card.querySelectorAll('.loupe-bound-field').forEach((el) => {
      el.addEventListener('focus', () => {
        const cKey = el.dataset.cropKey;
        const cropUrl = rec.cellCrops?.[cKey];
        if (cropUrl && loupeBox && loupeImg) {
          loupeImg.src = cropUrl;
          if (loupeLbl) {
            const confObj = rec.cellConfidences?.[cKey];
            const confStr = confObj ? ` · 인식 확신도 ${Math.round((confObj.confidence || 0.95) * 100)}%` : '';
            loupeLbl.textContent = `🔎 원본 PDF 1:1 셀 크롭 대조 [${CROP_TITLE_MAP[cKey] || cKey}${confStr}]`;
          }
          loupeBox.style.display = 'block';
        }
      });
      el.addEventListener('blur', () => {
        if (loupeBox) loupeBox.style.display = 'none';
      });
      el.addEventListener('input', (e) => {
        const fKey = el.dataset.field;
        if (fKey) {
          rec[fKey] = e.target.value;
          rec._aiVerified = false;
          if (fKey === 'actionPlan') rec.countermeasure = e.target.value;
          if (fKey === 'rawLaw' && !rec.law) rec.law = e.target.value;
        }
      });
    });

    card.querySelector('.btn-load-to-form').addEventListener('click', () => {
      loadImportedRecordToManualForm(rec);
    });
    const removeCardBtn = card.querySelector('.btn-remove-import-card');
    if (removeCardBtn) {
      removeCardBtn.addEventListener('click', () => {
        importedRecords.splice(idx, 1);
        renderImportedCards();
        toast('선택한 항목을 목록에서 제외했습니다.', 'info');
      });
    }
    const attachInput = card.querySelector('.input-card-attach-photo');
    if (attachInput) {
      attachInput.addEventListener('change', async (e) => {
        const files = Array.from(e.target.files || []).slice(0, 2);
        if (!files.length) return;
        const urls = await Promise.all(files.map(f => new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result || ''));
          reader.onerror = () => resolve('');
          reader.readAsDataURL(f);
        })));
        const validUrls = urls.filter(Boolean);
        if (validUrls.length) {
          rec.photos = validUrls;
          rec.photo1 = validUrls[0];
          if (validUrls[1]) rec.photo2 = validUrls[1];
          renderImportedCards();
          toast(`📸 사진 ${validUrls.length}장이 첨부되었습니다.`, 'success');
        }
      });
    }

    container.appendChild(card);
  });

  const verifyBadge = $('#importAiVerifyBadge');
  if (verifyBadge) {
    const allVerified = importedRecords.length > 0 && importedRecords.every(r => r._aiVerified);
    if (allVerified) {
      verifyBadge.textContent = `✅ AI 자동 검증 완료 (${importedRecords.length}건)`;
      verifyBadge.style.background = '#ecfdf5';
      verifyBadge.style.color = '#047857';
      verifyBadge.style.borderColor = '#a7f3d0';
    } else {
      verifyBadge.textContent = '🤖 저장 시 AI 자동 검증 반영';
      verifyBadge.style.background = '#eff6ff';
      verifyBadge.style.color = '#1d4ed8';
      verifyBadge.style.borderColor = '#bfdbfe';
    }
  }
}

// 9×9 개선 표준 작업방법(9종 — 건설안전 9,9 개선(1).jpg 기준) 추론 함수
function inferWorkMethod(text) {
  return normalizeWorkMethod9x9('', text);
}

// 표준 불안전한 상태 추론 함수 (계획미이행 등 발생원인 텍스트 원천 차단)
function inferCondition(text, mgmtCauses) {
  const causes = Array.isArray(mgmtCauses) ? mgmtCauses : [];
  const hasCondition = causes.some(c => String(c).includes('불안전 상태'));
  if (!hasCondition) return '해당없음';

  const t = String(text || '');
  if (t.includes('동바리') || t.includes('멍에') || t.includes('이중') || t.includes('시공') || t.includes('조립')) {
    return '작업방법·공정의 결함';
  }
  if (t.includes('미설치') || t.includes('탈락') || t.includes('파손') || t.includes('난간') || t.includes('덮개')) {
    return '안전방호장치의 결함 (미설치·해체·불량)';
  }
  if (t.includes('균열') || t.includes('변형') || t.includes('부식') || t.includes('불량')) {
    return '물(物) 자체의 결함 (자재·부재 손상)';
  }
  if (t.includes('조명') || t.includes('어두') || t.includes('조도') || t.includes('소음') || t.includes('환기')) {
    return '작업환경의 결함 (조명·환기·소음 등)';
  }
  if (t.includes('정리정돈') || t.includes('적재') || t.includes('야적') || t.includes('방치')) {
    return '물(物)의 배치 및 작업장소 불량';
  }
  return '작업방법·공정의 결함';
}

// 표준 불안전한 행동 추론 함수
function inferAction(text, mgmtCauses) {
  const causes = Array.isArray(mgmtCauses) ? mgmtCauses : [];
  const hasAction = causes.some(c => String(c).includes('불안전 행동'));
  if (!hasAction) return '해당없음';

  const t = String(text || '');
  if (t.includes('유도로프') || t.includes('수평') || t.includes('로프간격') || t.includes('줄걸이') || t.includes('손으로') || t.includes('잡고') || t.includes('인양') || t.includes('양중화물')) {
    return '불안전한 동작·자세';
  }
  if (t.includes('보호구') || t.includes('안전모') || t.includes('안전대') || (t.includes('미착용') && !t.includes('유도로프'))) {
    return '보호구 미착용·잘못 사용';
  }
  if (t.includes('접근') || t.includes('출입') || t.includes('하부') || t.includes('반경')) {
    return '위험장소 접근';
  }
  if (t.includes('신호') || t.includes('연락') || t.includes('신호수')) {
    return '신호 미준수·연락 불충분';
  }
  if (t.includes('해체') || t.includes('임의') || t.includes('제거')) {
    return '안전장치의 기능 제거';
  }
  return '불안전한 동작·자세';
}

function loadImportedRecordToManualForm(rec) {
  // 모드 전환
  $('#btnModeManual')?.click();

  // 값 채우기
  if (rec.severity === '경부적합') {
    $('#btnSeverityMinor')?.click();
  } else {
    $('#btnSeverityMajor')?.click();
  }

  const determinedWorkMethod = rec.workMethod || rec.workName || inferWorkMethod(rec.content);
  const determinedCondition = (rec.condition && !['계획 미이행', '불안전 상태'].includes(rec.condition))
    ? rec.condition
    : inferCondition(rec.content, rec.mgmtCauses);
  const determinedAction = (rec.action && !['계획 미이행', '불안전 행동'].includes(rec.action))
    ? rec.action
    : inferAction(rec.content, rec.mgmtCauses);

  if ($('#txtContent')) $('#txtContent').value = rec.content || '';
  if ($('#txtPhotoBanner')) $('#txtPhotoBanner').value = rec.photoBanner || '';
  if ($('#txtLaw')) $('#txtLaw').value = filterOnlyOccupationalSafetyLaw(rec.law);
  if ($('#txtSubcontractor')) $('#txtSubcontractor').value = rec.subcontractor || '';
  if ($('#selWorkGroupMid')) {
    $('#selWorkGroupMid').value = rec.workGroupMid || resolveWorkGroupMid(rec.workGroup, '', rec.content);
    $('#selWorkGroupMid').dispatchEvent(new Event('change'));
  }
  if ($('#txtWorkGroup')) $('#txtWorkGroup').value = rec.workGroup || '';
  if ($('#txtWorkName')) $('#txtWorkName').value = normalizeWorkMethod9x9(determinedWorkMethod, `${rec.workGroup || ''} ${rec.content || ''}`);
  if ($('#txtLocation')) $('#txtLocation').value = rec.location || '';
  if ($('#txtLocationCategory')) $('#txtLocationCategory').value = rec.locationCategory || inferLocationCategory('', rec.location, rec.content);
  selectedPhotoLayoutRatio = rec.photoLayoutRatio || 'auto';
  const isAlForm = /알폼|al\s*form|alform|알루미늄/i.test(`${rec.content || ''} ${rec.agent || ''} ${rec.item || ''}`);
  const isGangForm = isAlForm || /갱폼|gang\s*form|gangform|특수거푸집|선해체/i.test(`${rec.content || ''} ${rec.agent || ''} ${rec.item || ''}`);
  const maj = rec.agentMajor || rec.kind || (isGangForm ? '가시설' : (m9 && m9.점검영역9x9) || '가시설');
  const mid = isAlForm ? '특수거푸집' : (rec.agentMid || rec.item || (isGangForm ? '특수거푸집' : (m9 && m9.점검대상9x9) || '거푸집/동바리'));
  const min = rec.agentMinor || rec.agent || (isAlForm ? '알폼' : (isGangForm ? '갱폼' : (m9 && m9.가시설세부사양) || (mid === '특수거푸집' ? '갱폼' : '시스템비계')));
  if ($('#txtAgentMajor')) $('#txtAgentMajor').value = maj;
  if ($('#txtAgentMid')) $('#txtAgentMid').value = mid;
  if ($('#txtAgentMinor')) $('#txtAgentMinor').value = min;
  if ($('#txtKind')) $('#txtKind').value = maj;
  if ($('#txtItem')) $('#txtItem').value = mid;
  if ($('#txtAgent')) $('#txtAgent').value = min;
  if ($('#txtType')) $('#txtType').value = rec.type || '붕괴';
  if ($('#txtCondition')) $('#txtCondition').value = determinedCondition;
  if ($('#txtAction')) $('#txtAction').value = determinedAction;
  if ($('#txtInterviewOpinion')) $('#txtInterviewOpinion').value = rec.interviewOpinion || '';
  if ($('#selInspectorOpinionType')) $('#selInspectorOpinionType').value = rec.inspectorOpinionType || '';
  if ($('#txtAuditProposal')) $('#txtAuditProposal').value = rec.auditProposal || '';
  if ($('#txtPmVerdict')) $('#txtPmVerdict').value = rec.pmVerdict || '';
  if ($('#chkHoldPoint')) $('#chkHoldPoint').checked = !!rec.holdPoint;

  // 관리적 4대 발생원인 칩 동기화
  const causes = rec.mgmtCauses || ['계획 미이행', '불안전 상태'];
  if ($('#chkMgmtPlanNotMade')) $('#chkMgmtPlanNotMade').checked = causes.includes('계획 미수립');
  if ($('#chkMgmtPlanNotFollowed')) $('#chkMgmtPlanNotFollowed').checked = causes.includes('계획 미이행');
  if ($('#chkMgmtUnsafeAction')) $('#chkMgmtUnsafeAction').checked = causes.includes('불안전 행동');
  if ($('#chkMgmtUnsafeCondition')) $('#chkMgmtUnsafeCondition').checked = causes.includes('불안전 상태');
  selectedCauses.clear();
  causes.forEach(c => selectedCauses.add(c));
  updateCauseChips();

  // 9×9 점검인자 및 근본원인 (기존 데이터 또는 AI 즉시 추론)
  const m9 = (classifier && rec.content) ? classifier.classify(rec.content).result : null;
  if ($('#txtMatrixArea')) $('#txtMatrixArea').value = rec.matrixArea || rec.agentMajor || (m9 && m9.점검영역9x9) || maj;
  if ($('#txtMatrixTarget')) $('#txtMatrixTarget').value = rec.matrixTarget || rec.agentMid || (m9 && m9.점검대상9x9) || mid;
  if ($('#txtMatrixSpec')) $('#txtMatrixSpec').value = rec.matrixSpec || rec.agentMinor || (m9 && m9.가시설세부사양) || min;
  if ($('#txtRootCauseMgmt')) $('#txtRootCauseMgmt').value = rec.rootCauseMgmt || (m9 && m9.근본원인_관리감독) || '';
  if ($('#txtRootCauseSystem')) $('#txtRootCauseSystem').value = rec.rootCauseSystem || (m9 && m9.근본원인_안전시스템) || '';
  if ($('#txtStakeholder')) $('#txtStakeholder').value = rec.stakeholder || (m9 && m9.관리책임주체) || '';

  // 사진 채우기 (Data URL을 Blob으로 안전 변환)
  if (rec.photos && rec.photos.length) {
    Promise.all(rec.photos.map(async url => {
      let b = null;
      try {
        const r = await fetch(url);
        b = await r.blob();
      } catch (e) {}
      return {
        blob: b,
        previewUrl: url,
        dataUrl: url,
        isJangpyo: false,
        isCropped: true
      };
    })).then(loaded => {
      currentPhotos = loaded;
      renderPhotoPreviews();
    });
  }

  toast('선택한 장표 내용이 직접 입력 폼에 채워졌습니다. 확인 후 저장하세요.', 'info');
}

// ── 등록 전 AI 최종 검증 게이트(Pre-Save QA) ──
async function handleVerifyImportedRecords({ silent = false } = {}) {
  if (!importedRecords.length) {
    if (!silent) toast('검증할 장표 데이터가 없습니다.', 'danger');
    return { ok: true, modifiedCount: 0 };
  }
  const verifyBtn = $('#btnVerifyImportedRecords');
  const prevBtnText = verifyBtn ? verifyBtn.textContent : '';
  if (verifyBtn) {
    verifyBtn.disabled = true;
    verifyBtn.textContent = '🤖 AI 최종 검증 중...';
  }
  try {
    let result = { ok: true, modifiedCount: 0, source: 'local' };
    window.SafeLocalAI?.clearAiFailures?.();
    if (window.SafeLocalAI?.verifyRecordsBeforeSave) {
      result = await window.SafeLocalAI.verifyRecordsBeforeSave(importedRecords, (msg) => {
        if (verifyBtn) verifyBtn.textContent = msg;
      });
    }
    renderImportedCards();
    const failInfo = window.SafeLocalAI?.getAiFailureSummary?.();
    if (!silent && ((result && result.aiFailed) || (failInfo && failInfo.hasFailure))) {
      showAiFailurePopup({
        stage: '등록 전 AI 최종 검증',
        failedCount: failInfo?.failedCount || 0,
        totalCount: importedRecords.length,
        reasons: failInfo?.reasons || ['AI 응답 실패'],
        quotaExceeded: Boolean(failInfo?.quotaExceeded || result?.quotaExceeded)
      });
    } else if (!silent) {
      toast(
        result.modifiedCount > 0
          ? `🤖 AI 최종 검증 완료! 총 ${importedRecords.length}건 중 ${result.modifiedCount}건의 오타·띄어쓰기·사진요약·산안법 관련기준을 자동 교정했습니다.`
          : `✅ AI 최종 검증 완료! 총 ${importedRecords.length}건 모두 양호합니다.`,
        'success',
        3800
      );
    }
    return result;
  } catch (err) {
    console.warn('Pre-save verify error:', err);
    if (!silent) {
      showAiFailurePopup({
        stage: '등록 전 AI 최종 검증',
        failedCount: importedRecords.length,
        totalCount: importedRecords.length,
        reasons: [err?.message || 'AI 검증 중 오류 발생']
      });
    }
    return { ok: false, modifiedCount: 0 };
  } finally {
    if (verifyBtn) {
      verifyBtn.disabled = false;
      verifyBtn.textContent = prevBtnText || '🤖 등록 전 AI 최종 검증';
    }
  }
}

// ── 파싱된 전체 장표 대장에 일괄 저장 ──
async function handleSaveImportedRecords() {
  if (!importedRecords.length) {
    toast('저장할 장표 데이터가 없습니다.', 'danger');
    return;
  }

  const site = ($('#txtImportSite')?.value || $('#txtSite')?.value || '').trim();
  if (!site) {
    toast('현장명을 입력해주세요.', 'danger');
    return;
  }

  // [v62 Item #4] 사진이 없는 항목이 1건이라도 있으면 등록/저장 원천 차단 (직접 사진 첨부 또는 제외 유도)
  const missingPhotoEntries = importedRecords
    .map((r, i) => ({ r, i }))
    .filter(({ r }) => !((Array.isArray(r.photos) && r.photos.length > 0) || r.photo1));
  if (missingPhotoEntries.length > 0) {
    const labels = missingPhotoEntries
      .slice(0, 4)
      .map(({ r, i }) => r._sourceFile || `항목 ${r.slideNumber || r.pageNumber || (i + 1)}`)
      .join(', ');
    toast(
      `📸 사진이 없는 항목 ${missingPhotoEntries.length}건(${labels}${missingPhotoEntries.length > 4 ? ' 외' : ''})이 있어 등록을 진행할 수 없습니다. 카드에서 사진을 첨부하거나 제외해주세요.`,
      'danger',
      5500
    );
    const firstMissingCard = document.querySelector('[data-missing-photo="1"]');
    if (firstMissingCard) {
      firstMissingCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    return;
  }

  const productType = $('#selImportProductType')?.value || '공동주택';
  const progressRate = parseFloat($('#txtImportProgressRate')?.value || 35);
  const inspectedDate = $('#txtImportInspectDate')?.value || todayStr();
  const stage = determineStandardStage(progressRate, '', productType).name;

  const btn = $('#btnSaveImportedRecords');
  btn.disabled = true;
  btn.textContent = `🤖 AI 최종 검증 및 저장 준비 중 (${importedRecords.length}건)...`;

  try {
    const unverifiedRecs = importedRecords.filter(r => !r._aiVerified);
    if (window.SafeLocalAI?.verifyRecordsBeforeSave && unverifiedRecs.length > 0) {
      await window.SafeLocalAI.verifyRecordsBeforeSave(unverifiedRecs, msg => { btn.textContent = msg; });
      renderImportedCards();
    }
    btn.textContent = `저장 중 (0/${importedRecords.length})...`;
    // 현장 등록 확인 (백그라운드 동기화로 저장 지연 제거)
    let siteObj = store.sites.find(s => s.name === site);
    if (!siteObj) {
      siteObj = { name: site, progress: progressRate + '%', scale: '', amount: '' };
      store.sites.push(siteObj);
      store.saveSites(store.sites).catch(() => {});
      renderSites();
    }

    const batchItems = await Promise.all(importedRecords.map(async (rec) => {
      const fullCtxText = `${rec.workGroup || ''} ${rec.content || ''} ${rec.rawLaw || ''} ${rec.auditProposal || ''} ${rec.actionPlan || ''}`;
      const m9 = (classifier && fullCtxText.trim()) ? classifier.classify(fullCtxText).result : null;
      const resolvedAgent = window.SafeExcel?.resolveAgentHierarchy
        ? window.SafeExcel.resolveAgentHierarchy(rec)
        : null;
      const isAlForm = /알폼|al\s*form|alform|알루미늄/i.test(`${fullCtxText} ${rec.agent || ''} ${rec.item || ''}`);
      const isGangForm = isAlForm || /갱폼|gang\s*form|gangform|특수거푸집|선해체/i.test(`${fullCtxText} ${rec.agent || ''} ${rec.item || ''}`);
      const isFormwork = !isGangForm && /거푸집|동바리|벽체|전도방지|유로폼|합판|서포트/i.test(`${fullCtxText} ${rec.agent || ''} ${rec.item || ''}`);
      const matrixArea = rec.agentMajor || (resolvedAgent && resolvedAgent.major) || rec.matrixArea || rec.kind || (isGangForm || isFormwork ? '가시설' : (m9 && m9.점검영역9x9) || '가시설');
      const matrixTarget = rec.agentMid || (resolvedAgent && resolvedAgent.mid) || rec.matrixTarget || rec.item || (isAlForm || isGangForm ? '특수거푸집' : (isFormwork ? '거푸집/동바리' : (m9 && m9.점검대상9x9) || '안전시설'));
      const matrixSpec = rec.agentMinor || (resolvedAgent && resolvedAgent.minor) || rec.matrixSpec || rec.agent || (isAlForm ? '알폼' : (isGangForm ? '갱폼' : (m9 && m9.가시설세부사양) || (matrixTarget === '특수거푸집' ? '갱폼' : (matrixTarget === '거푸집/동바리' ? '유로폼' : matrixTarget))));
      const rootCauseMgmt = rec.rootCauseMgmt || (m9 && m9.근본원인_관리감독) || '작업계획 미이행/부족';
      const rootCauseSystem = rec.rootCauseSystem || (m9 && m9.근본원인_안전시스템) || '확인: 일일점검 미실시';
      const stakeholder = rec.stakeholder || (m9 && m9.관리책임주체) || '시공담당';

      const workMethod = window.SafeExcel?.resolveWorkMethod
        ? window.SafeExcel.resolveWorkMethod(rec)
        : (rec.workMethod || rec.workName || inferWorkMethod(rec.content));
      const mgmtCauses = (rec.mgmtCauses && rec.mgmtCauses.length > 0) ? rec.mgmtCauses : ['계획 미이행', '불안전 상태'];
      const condition = (rec.condition && !['계획 미이행', '불안전 상태'].includes(rec.condition))
        ? rec.condition
        : inferCondition(rec.content, mgmtCauses);
      const action = (rec.action && !['계획 미이행', '불안전 행동'].includes(rec.action))
        ? rec.action
        : inferAction(rec.content, mgmtCauses);

      const resolvedWorkGroup = window.SafeExcel?.cleanWorkGroup
        ? window.SafeExcel.cleanWorkGroup(rec.workGroup, rec.content)
        : (window.SafeTextNormalizer?.mapToStandardWorkGroup
          ? window.SafeTextNormalizer.mapToStandardWorkGroup(rec.workGroup, rec.content)
          : (rec.workGroup || '').replace(/[_|ㅣ¦!\[\]~—\-\r\n]+/g, ' ').replace(/\s+/g, ' ').trim());
      const resolvedType = window.SafeExcel?.mapAccidentType
        ? window.SafeExcel.mapAccidentType(rec.type, rec.content)
        : (rec.type || '추락');

      const loggedInUser = (store.user && store.user.name) ? String(store.user.name).trim() : '관리자';
      const sheetInspectUser = sanitizeInspectorValue(rec.inspectUser);

      // 3단계 관련기준 우선순위 적용 (1순위 원본 -> 2순위 Qwen이 적합 검증 완료한 학습 지침 -> 3순위 AI 산안법 판정; 온라인 Qwen 검증이 끝난 건은 로컬이 임의 덮어쓰기 금지)
      const recCtxForLaw = `${resolvedWorkGroup} ${rec.content || ''} ${resolvedType}`;
      let sanitizedRawLaw = rec.rawLaw || '';
      let sanitizedLawBody = rec.lawBody || '';
      const aiPreservedLaw = String(rec.law || '').trim();
      let resolvedStdLaw = filterOnlyOccupationalSafetyLaw(rec.law || rec.rawLaw, `${rec.content || ''} ${resolvedWorkGroup}`);
      if (!resolvedStdLaw && aiPreservedLaw && /(?:제\d+조|안전작업지침|위험성평가|작업\s*절차)/.test(aiPreservedLaw) && !window.SafeTextNormalizer?.hasGarbledKoreanNoise?.(aiPreservedLaw)) {
        resolvedStdLaw = aiPreservedLaw;
      }
      if (window.SafeTextNormalizer?.normalizeSafetyLawSpec) {
        let specNorm = window.SafeTextNormalizer.normalizeSafetyLawSpec({
          rawLaw: sanitizedRawLaw,
          lawBody: sanitizedLawBody,
          law: resolvedStdLaw || rec.law || '',
          contextText: recCtxForLaw,
          workGroup: resolvedWorkGroup,
          type: resolvedType
        });
        // 오프라인/AI 미검증 상태일 때만 로컬 학습 지침 최후 폴백 (온라인 Qwen 검증이 완료된 _aiVerified 건은 Qwen 판단 존중)
        if (specNorm.needsAiLaw && !rec._aiVerified && window.SafeGuidelineMemory?.lookup) {
          const learned = window.SafeGuidelineMemory.lookup({
            rawLaw: sanitizedRawLaw,
            lawBody: sanitizedLawBody,
            content: rec.content || '',
            workGroup: resolvedWorkGroup,
            type: resolvedType
          });
          if (learned && learned.title && (learned.body || specNorm.body)) {
            sanitizedRawLaw = learned.title;
            sanitizedLawBody = learned.body || specNorm.body || '';
            resolvedStdLaw = learned.law || learned.title;
            specNorm = { ...specNorm, title: sanitizedRawLaw, body: sanitizedLawBody, needsAiLaw: false };
          }
        }
        if (!specNorm.needsAiLaw) {
          if (specNorm.title) sanitizedRawLaw = specNorm.title;
          if (specNorm.body !== undefined) sanitizedLawBody = specNorm.body;
        } else {
          if (specNorm.title) sanitizedRawLaw = specNorm.title;
          if (specNorm.body !== undefined) sanitizedLawBody = specNorm.body;
          if (specNorm.mismatchReason && /(?:직?[계게개]차|지[계개제]차|제172조|유도자|제332조|거푸집동바리)/.test(resolvedStdLaw || '')) {
            resolvedStdLaw = '';
          }
        }
      }
      if (!resolvedStdLaw && sanitizedRawLaw && !window.SafeTextNormalizer?.hasGarbledKoreanNoise?.(sanitizedRawLaw)) {
        resolvedStdLaw = sanitizedRawLaw;
      }

      const unifiedBanner = (window.SafeTextNormalizer?.resolveUnifiedPhotoBanner
        ? window.SafeTextNormalizer.resolveUnifiedPhotoBanner(rec)
        : '') || (window.SafeExcel?.resolvePhotoBanner ? window.SafeExcel.resolvePhotoBanner(rec) : '') || (rec.photoBanner || '현장 부적합 작업 전경');

      const cleanedFinalOpinion = window.SafeExcel?.cleanOpinionText
        ? window.SafeExcel.cleanOpinionText(rec.interviewOpinion || rec.workerOpinion || '')
        : (rec.interviewOpinion || '');
      const parsedFinalOpinions = window.SafeTextNormalizer?.parseInterviewOpinions
        ? window.SafeTextNormalizer.parseInterviewOpinions(cleanedFinalOpinion)
        : null;
      const hasFinalOpinion = Boolean(cleanedFinalOpinion && cleanedFinalOpinion.trim());
      const resolvedAuthor = hasFinalOpinion
        ? (window.SafeExcel?.resolveInterviewAuthor
            ? window.SafeExcel.resolveInterviewAuthor(rec)
            : (rec.interviewAuthor || '시공관리자 및 근로자'))
        : '';
      const hasExplicitProp = Boolean(
        (Array.isArray(rec.proposalItems) && rec.proposalItems.length > 0) ||
        String(rec.inspectorOpinionType || '').trim()
      );

      const explicitPmVal = (rec.pmVerdictType || rec.pmVerdict || '').trim();
      const hasExplicitPm = Boolean(
        rec._hasExplicitPmVerdict ||
        (Array.isArray(rec.pmVerdictItems) && rec.pmVerdictItems.length > 0) ||
        explicitPmVal
      );

      const cleanedFinalLoc = window.SafeExcel?.cleanLocation ? window.SafeExcel.cleanLocation(rec.location || '', rec.content || '') : (rec.location || '');
      const resolvedLocationCategory = inferLocationCategory(rec.locationCategory || '', cleanedFinalLoc, `${rec.content || ''} ${unifiedBanner}`);
      const resolvedWorkGroupMid = resolveWorkGroupMid(resolvedWorkGroup, rec.workGroupMid || '', rec.content || '');
      const normalizedFinalWorkMethod = normalizeWorkMethod9x9(workMethod, resolvedWorkGroup, rec.content || '', cleanedFinalLoc);

      const finalRecord = {
        site,
        productType,
        progressRate,
        stage,
        severity: rec.severity || '중부적합',
        subcontractor: rec.subcontractor !== undefined ? rec.subcontractor : '',
        inspectRound: (window.SafeTextNormalizer?.normalizeRoundText && rec.inspectRound)
          ? window.SafeTextNormalizer.normalizeRoundText(rec.inspectRound)
          : (rec.inspectRound || '1차'),
        inspectUser: sheetInspectUser || loggedInUser,
        inspector: loggedInUser,
        siteInfo: {
          progress: progressRate + '%',
          scale: siteObj.scale || '',
          amount: siteObj.amount || ''
        },
        content: rec.content || '부적합 사항 지적',
        photoBanner: unifiedBanner,
        photo2Banner: rec.photo2Banner || '',
        photoLayoutRatio: rec.photoLayoutRatio || 'auto',
        location: cleanedFinalLoc,
        locationCategory: resolvedLocationCategory,
        workName: normalizedFinalWorkMethod,
        workMethod: normalizedFinalWorkMethod,
        workGroupMid: resolvedWorkGroupMid,
        workGroup: resolvedWorkGroup,
        kind: matrixArea,
        item: matrixTarget,
        agent: matrixSpec,
        agentMajor: matrixArea,
        agentMid: matrixTarget,
        agentMinor: matrixSpec,
        type: resolvedType,
        condition,
        action,
        matrixArea,
        matrixTarget,
        matrixSpec,
        rootCauseMgmt,
        rootCauseSystem,
        stakeholder,
        mgmtCauses,
        holdPoint: !!rec.holdPoint,
        interviewAuthor: hasFinalOpinion
          ? ((parsedFinalOpinions?.hasMulti && parsedFinalOpinions.authorsText) ? parsedFinalOpinions.authorsText : resolvedAuthor)
          : '',
        interviewAuthorTitle: hasFinalOpinion
          ? ((parsedFinalOpinions?.hasMulti && parsedFinalOpinions.primaryTitle) ? parsedFinalOpinions.primaryTitle : (rec.interviewAuthorTitle || (resolvedAuthor ? `[의견 : ${resolvedAuthor}]` : '')))
          : '',
        interviewOpinion: cleanedFinalOpinion,
        interviewOpinions: (parsedFinalOpinions?.sections && parsedFinalOpinions.sections.length >= 2) ? parsedFinalOpinions.sections : (rec.interviewOpinions || []),
        proposalItems: hasExplicitProp ? (rec.proposalItems || []) : [],
        inspectorOpinionType: hasExplicitProp ? (rec.inspectorOpinionType || '') : '',
        inspectorOpinionSub: hasExplicitProp ? (rec.inspectorOpinionSub || '') : '',
        _hasExplicitPropType: hasExplicitProp,
        auditProposal: (window.SafeExcel?.cleanProposalText ? window.SafeExcel.cleanProposalText(rec.auditProposal || rec.inspectorOpinion || '') : (rec.auditProposal || '')),
        actionPlan: (window.SafeExcel?.resolveActionPlanText ? window.SafeExcel.resolveActionPlanText(rec) : (rec.actionPlan || '')),
        countermeasure: (window.SafeExcel?.resolveActionPlanText ? window.SafeExcel.resolveActionPlanText(rec) : (rec.countermeasure || rec.actionPlan || '')),
        pmVerdict: hasExplicitPm ? (rec.pmVerdict || rec.pmVerdictType || '') : '',
        pmVerdictType: hasExplicitPm ? (rec.pmVerdictType || rec.pmVerdict || '') : '',
        pmVerdictSub: hasExplicitPm ? (rec.pmVerdictSub || '') : '',
        pmVerdictItems: hasExplicitPm ? (rec.pmVerdictItems || []) : [],
        _hasExplicitPmVerdict: hasExplicitPm,
        _aiCleaned: Boolean(rec._aiCleaned),
        _aiVerified: Boolean(rec._aiVerified),
        fix: rec.actionPlan ? { content: rec.actionPlan } : {},
        workPlan: '해당없음',
        rawLaw: sanitizedRawLaw,
        lawBody: sanitizedLawBody,
        basis: {
          ra: '반영',
          cp: '해당없음',
          st: '해당없음',
          guide: sanitizedRawLaw,
          law: resolvedStdLaw,
          점검영역9x9: matrixArea,
          점검대상9x9: matrixTarget,
          가시설세부사양: matrixSpec,
          근본원인_관리감독: rootCauseMgmt,
          근본원인_안전시스템: rootCauseSystem,
          관리책임주체: stakeholder
        },
        law: resolvedStdLaw,
        causes: [...mgmtCauses],
        inspectedDate
      };

      const mediaPhotos = await Promise.all((rec.photos || []).map(async (pUrl) => {
        try {
          const res = await fetch(pUrl);
          const blob = await res.blob();
          return { blob };
        } catch (e) {
          return null;
        }
      }));

      return { rec: finalRecord, photos: mediaPhotos.filter(Boolean) };
    }));

    const totalCount = batchItems.length;
    const savedRecs = await store.saveRecordsBatch(batchItems, msg => { btn.textContent = msg; });
    if (window.SafeGuidelineMemory?.learnFromRecord) {
      batchItems.forEach(item => {
        if (item?.rec) window.SafeGuidelineMemory.learnFromRecord(item.rec, 'batch_saved');
      });
      updateGuidelineMemoryCount();
    }
    if (savedRecs.length > 0) {
      window._lastImportedRecordId = savedRecs[savedRecs.length - 1].id;
    }

    toast(`🎉 총 ${totalCount}건의 부적합 대장이 초고속 일괄 저장되었습니다!`, 'success');
    importedRecords = [];
    if ($('#importPreviewArea')) $('#importPreviewArea').style.display = 'none';
    if ($('#importProgressBox')) $('#importProgressBox').style.display = 'none';
    if ($('#filePptxImport')) $('#filePptxImport').value = '';

    if (window._lastImportedRecordId) {
      populateEduOptions(window._lastImportedRecordId).catch(() => {});
    }

    // 대장 목록 뷰로 자동 전환
    const listNavBtn = document.querySelector('.bottom-nav .nav-item[data-view="viewList"]');
    if (listNavBtn) listNavBtn.click();
  } catch (err) {
    console.error('Import save error:', err);
    toast(`일괄 저장 실패: ${err.message}`, 'danger');
  } finally {
    btn.disabled = false;
    btn.textContent = '📥 전체 대장에 일괄 저장하기';
  }
}
