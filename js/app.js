import { $, $$, h, todayStr, monthStr, toast, debounce } from './util.js';
import { store } from './store.js';
import { processImageFile } from './image-processor.js';

let classifier = null;
let currentPhotos = []; // [{ blob, previewUrl, dateTaken }]
let selectedCauses = new Set();
let smartResult = null;
let pinInput = '';
let targetFixRecord = null;
let fixPhotoData = null;

// ── App Init ──
window.addEventListener('DOMContentLoaded', async () => {
  // 1. 이벤트 리스너를 가장 먼저 바인딩하여 모든 UI 상호작용 즉시 활성화
  bindEvents();

  // 초기 날짜 설정
  if ($('#txtInspectDate')) $('#txtInspectDate').value = todayStr();
  if ($('#selExportMonth')) $('#selExportMonth').value = monthStr();

  try {
    await store.init();
    await store.seedDemoIfEmpty();
    
    // 자동분류기 인스턴스 초기화
    if (window.SafeClassifier && store.taxonomy && store.keywords) {
      classifier = window.SafeClassifier.createClassifier(store.taxonomy, store.keywords);
    }

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
    if (store.taxonomy) populateDatalists();
    checkAuth();

  } catch (err) {
    console.error('App init error:', err);
    toast('초기화 알림: ' + err.message, 'warning');
    checkAuth();
  }
});

// ── PIN Authentication Flow ──
function checkAuth() {
  if (!store.user) {
    showPinModal();
  } else {
    $('#userBadge').style.display = 'flex';
    $('#userName').textContent = `${store.user.name} (${store.user.role === 'admin' ? '관리자' : '점검자'})`;
    hidePinModal();
    loadDraft();
  }
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

// ── Datalists & Taxonomy Rendering ──
function populateDatalists() {
  const tax = store.taxonomy;
  const custom = store.custom.customValues || {};
  const addOpts = (id, list, customKey) => {
    const el = document.getElementById(id);
    if (!el) return;
    const all = [...new Set([...(list || []), ...(custom[customKey] || [])])];
    el.innerHTML = all.map(v => `<option value="${v}">`).join('');
  };

  const allItems = tax.categories.list.flatMap(c => c.items);
  addOpts('listKinds', tax.categories.list.map(c => c.kind), 'kind');
  addOpts('listItems', allItems.map(i => i.name), 'item');
  addOpts('listAgents', [...new Set(allItems.flatMap(i => i.agents))], 'agent');
  addOpts('listWorkGroups', tax.workTypes.list.map(w => w.group), 'workGroup');
  addOpts('listWorkNames', tax.workTypes.list.flatMap(w => w.works), 'workName');
  addOpts('listTypes', tax.accidentTypes.list.map(t => t.name), 'type');
  addOpts('listConditions', tax.unsafeConditions.list, 'condition');
  addOpts('listActions', tax.unsafeActions.list, 'action');
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
      $$('.bottom-nav .nav-item').forEach(b => b.classList.remove('active'));
      $$('.view-section').forEach(v => v.classList.remove('active'));
      btn.classList.add('active');
      const viewId = btn.dataset.view;
      $('#' + viewId).classList.add('active');
      if (viewId === 'viewList') renderRecordList();
      if (viewId === 'viewEdu') populateEduOptions();
    });
  });

  // Logout/Change PIN
  $('#userBadge').addEventListener('click', () => {
    if (confirm('PIN 변경 또는 다른 사용자로 전환하시겠습니까?')) {
      store.logout();
      checkAuth();
    }
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
          updatePinDisplay();
        }
      }
    });
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
    toast('사진 압축 및 촬영정보 분석 중...', 'info', 1500);

    for (const f of files.slice(0, 3 - currentPhotos.length)) {
      const processed = await processImageFile(f);
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

  // Realtime Smart Auto-classifier on Content Input
  $('#txtContent').addEventListener('input', debounce((e) => {
    saveDraft();
    const txt = e.target.value.trim();
    if (!classifier || txt.length < 2) {
      $('#smartClassifyBox').classList.remove('active');
      return;
    }

    const res = classifier.classify(txt);
    if (res && res.matched) {
      smartResult = res.result;
      const x = res.result;
      $('#smartDesc').innerHTML = `<strong>${x.종류} › ${x.항목}</strong> (${x.유형})<br><small style="color:var(--gray-600);">${x.산업안전보건법}</small>`;
      $('#smartTags').innerHTML = `
        <span class="badge primary">기인물: ${x.기인물.join(', ') || '-'}</span>
        <span class="badge">상태: ${x.상태 || '-'}</span>
        <span class="badge">행동: ${x.행동 || '-'}</span>
        <span class="badge">원인: ${x.발생원인.join(', ') || '-'}</span>
      `;
      $('#smartClassifyBox').classList.add('active');
    } else {
      $('#smartClassifyBox').classList.remove('active');
    }
  }, 250));

  // Apply Smart Recommendation
  $('#btnApplySmart').addEventListener('click', () => {
    if (!smartResult) return;
    $('#txtKind').value = smartResult.종류 || '';
    $('#txtItem').value = smartResult.항목 || '';
    $('#txtAgent').value = (smartResult.기인물 && smartResult.기인물[0]) || '';
    $('#txtType').value = smartResult.유형 || '';
    $('#txtLaw').value = smartResult.산업안전보건법 || '';
    if (smartResult.상태) $('#txtCondition').value = smartResult.상태;
    if (smartResult.행동) $('#txtAction').value = smartResult.행동;

    // 발생원인 칩 동기화
    selectedCauses.clear();
    (smartResult.발생원인 || []).forEach(c => selectedCauses.add(c));
    updateCauseChips();

    $('#smartClassifyBox').classList.remove('active');
    toast('스마트 자동분류가 적용되었습니다.', 'success');
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

  // Submit Patrol Record
  $('#btnSubmitRecord').addEventListener('click', async () => {
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
      toast('부적합 사진을 1장 이상 등록해주세요.', 'danger');
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
    const record = {
      site,
      siteInfo: {
        progress: siteObj.progress || '',
        scale: siteObj.scale || '',
        amount: siteObj.amount || ''
      },
      content,
      location,
      workName,
      workGroup: $('#txtWorkGroup').value.trim(),
      kind: $('#txtKind').value.trim(),
      item: $('#txtItem').value.trim(),
      agent: $('#txtAgent').value.trim(),
      type: $('#txtType').value.trim(),
      condition: $('#txtCondition').value.trim(),
      action: $('#txtAction').value.trim(),
      workPlan: '해당없음',
      basis: {
        ra: '반영',
        cp: '해당없음',
        st: '해당없음',
        guide: '',
        law: $('#txtLaw').value.trim()
      },
      causes: [...selectedCauses],
      inspectedDate
    };

    const media = {
      photos: currentPhotos.map(p => ({ blob: p.blob }))
    };

    const btn = $('#btnSubmitRecord');
    btn.disabled = true;
    btn.textContent = '저장 중...';

    try {
      await store.saveRecord(record, media, msg => { btn.textContent = msg; });
      
      // 사용자 직접입력 단어들을 customValues에 누적 학습
      await store.addCustomValues({
        item: [record.item],
        agent: [record.agent],
        workName: [record.workName],
        workGroup: [record.workGroup]
      });

      toast('부적합 사항이 정상 등록되었습니다!', 'success');
      clearForm();
      clearDraft();
    } catch (err) {
      console.error(err);
      toast(`저장 실패: ${err.message}`, 'danger');
    } finally {
      btn.disabled = false;
      btn.textContent = '등록 저장하기';
    }
  });

  // Excel Download Action
  $('#btnDownloadExcel').addEventListener('click', async () => {
    const bucket = $('#selExportMonth').value;
    const filterSite = $('#selExportSite').value;
    if (!bucket) {
      toast('대상 월을 선택해주세요.', 'danger');
      return;
    }

    const btn = $('#btnDownloadExcel');
    btn.disabled = true;
    btn.textContent = '엑셀 생성 중...';

    try {
      let records = await store.listMonth(bucket);
      if (filterSite !== 'all') {
        records = records.filter(r => r.site === filterSite);
      }

      if (!records.length) {
        toast(`${bucket} 월에 등록된 부적합 데이터가 없습니다.`, 'danger');
        btn.disabled = false;
        btn.textContent = '📥 부적합사항대장.xlsx 다운로드';
        return;
      }

      const wb = await window.SafeExcel.build(window.ExcelJS, {
        records,
        taxonomy: store.taxonomy,
        customValues: store.custom.customValues,
        sites: store.sites,
        loadImage: async (path) => {
          const blob = await store.photoBlob(path);
          const buf = await blob.arrayBuffer();
          const base64 = btoa(new Uint8Array(buf).reduce((data, byte) => data + String.fromCharCode(byte), ''));
          return { base64, extension: 'jpeg' };
        }
      });

      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `부적합사항대장_${bucket}${filterSite !== 'all' ? '_' + filterSite : ''}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);

      toast('부적합사항대장 엑셀 파일이 다운로드되었습니다.', 'success');
    } catch (e) {
      console.error(e);
      toast(`엑셀 다운로드 오류: ${e.message}`, 'danger');
    } finally {
      btn.disabled = false;
      btn.textContent = '📥 부적합사항대장.xlsx 다운로드';
    }
  });

  // ── 1페이지 교육자료 생성 핸들러 ──
  $('#btnPreviewEdu').addEventListener('click', () => updateEduPreview());
  $('#btnDownloadEduImg').addEventListener('click', async () => {
    const el = document.getElementById('eduCardContainer');
    if (!el) {
      toast('먼저 교육자료 대상을 선택해주세요.', 'danger');
      return;
    }
    const btn = $('#btnDownloadEduImg');
    btn.disabled = true;
    btn.textContent = '이미지 생성 중...';
    try {
      await window.SafeOnePage.downloadAsImage(el, `안전교육_1페이지_${todayStr()}.png`);
      toast('1페이지 교육자료 이미지가 다운로드되었습니다.', 'success');
    } catch (e) {
      toast(`이미지 다운로드 실패: ${e.message}`, 'danger');
    } finally {
      btn.disabled = false;
      btn.textContent = '📸 1페이지 교육자료 이미지(PNG) 다운로드';
    }
  });

  // ── 회의용 PPT 자동 생성 핸들러 ──
  $('#btnDownloadPPT').addEventListener('click', async () => {
    const bucket = $('#selExportMonth').value;
    const filterSite = $('#selExportSite').value;
    const btn = $('#btnDownloadPPT');

    btn.disabled = true;
    btn.textContent = 'PPT 프레젠테이션 제작 중...';

    try {
      let records = await store.listMonth(bucket);
      if (filterSite !== 'all') {
        records = records.filter(r => r.site === filterSite);
      }
      if (!records.length) {
        toast('PPT를 생성할 점검 데이터가 없습니다.', 'danger');
        btn.disabled = false;
        btn.textContent = '📑 회의용 분석 PPT (.pptx) 다운로드';
        return;
      }

      await window.SafePPT.generatePresentation({
        records,
        siteName: filterSite === 'all' ? '전 현장 종합' : filterSite,
        month: bucket,
        inspector: (store.user && store.user.name) || '안전관리자',
        loadPhotoBase64: async (path) => {
          const blob = await store.photoBlob(path);
          const buf = await blob.arrayBuffer();
          const base64 = btoa(new Uint8Array(buf).reduce((data, byte) => data + String.fromCharCode(byte), ''));
          return `image/jpeg;base64,${base64}`;
        }
      });

      toast('회의용 PPT가 성공적으로 다운로드되었습니다.', 'success');
    } catch (e) {
      console.error(e);
      toast(`PPT 생성 실패: ${e.message}`, 'danger');
    } finally {
      btn.disabled = false;
      btn.textContent = '📑 회의용 분석 PPT (.pptx) 다운로드';
    }
  });

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
}

// ── 1페이지 교육자료 미리보기 갱신 ──
async function updateEduPreview() {
  const sel = $('#selEduRecord');
  const recordId = sel.value;
  if (!recordId) return;

  const curMonth = monthStr();
  const records = await store.listMonth(curMonth);
  const rec = records.find(r => r.id === recordId);
  if (!rec) return;

  // 관련 법령 핵심 수칙 찾기 (taxonomy.categories에서 item 검색)
  let rules = [];
  const allItems = store.taxonomy.categories.list.flatMap(c => c.items);
  const foundItem = allItems.find(it => it.name === rec.item);
  if (foundItem && foundItem.rules) {
    rules = foundItem.rules;
  }

  let beforeUrl = '';
  let afterUrl = '';
  if (rec.photos && rec.photos[0]) {
    beforeUrl = await store.photoURL(rec.photos[0]);
  }
  if (rec.fix && rec.fix.photo) {
    afterUrl = await store.photoURL(rec.fix.photo);
  }

  const html = window.SafeOnePage.renderTemplate({
    title: `${rec.item} 안전수칙 및 개선 사례`,
    site: rec.site,
    date: rec.inspectedDate,
    beforePhoto: beforeUrl,
    afterPhoto: afterUrl,
    itemName: `${rec.item} (${rec.agent || '부속자재'}) ${rec.content}`,
    law: (rec.basis && rec.basis.law) || (foundItem && foundItem.law) || '산업안전보건기준에 관한 규칙',
    rules,
    statsText: `최근 패트롤 점검 결과 '${rec.type}' 위험요인이 빈번히 지적되고 있습니다. 작업 전 철저한 점검을 당부드립니다.`,
    inspector: rec.inspector
  });

  $('#eduContainer').innerHTML = html;
}

async function populateEduOptions() {
  const sel = $('#selEduRecord');
  if (!sel) return;
  const curMonth = monthStr();
  const records = await store.listMonth(curMonth);
  
  if (!records.length) {
    sel.innerHTML = '<option value="">등록된 부적합 내역이 없습니다.</option>';
    $('#eduContainer').innerHTML = '';
    return;
  }

  sel.innerHTML = records.map(r => 
    `<option value="${r.id}">[${r.site}] ${r.content} (${r.status})</option>`
  ).join('');

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
    const item = h('div.preview-item',
      h('img', { src: p.previewUrl }),
      h('button.remove-btn', {
        onclick: (e) => {
          e.stopPropagation();
          currentPhotos.splice(idx, 1);
          renderPhotoPreviews();
          saveDraft();
        }
      }, '✕')
    );
    container.append(item);
  });
}

function clearForm() {
  currentPhotos = [];
  selectedCauses.clear();
  renderPhotoPreviews();
  updateCauseChips();
  $('#txtContent').value = '';
  $('#txtLocation').value = '';
  $('#txtWorkName').value = '';
  $('#txtKind').value = '';
  $('#txtItem').value = '';
  $('#txtAgent').value = '';
  $('#txtWorkGroup').value = '';
  $('#txtType').value = '';
  $('#txtLaw').value = '';
  $('#txtCondition').value = '';
  $('#txtAction').value = '';
  $('#smartClassifyBox').classList.remove('active');
}

// ── Local Draft (시간제한 없는 안전 임시저장) ──
function saveDraft() {
  const draft = {
    site: $('#txtSite').value,
    content: $('#txtContent').value,
    location: $('#txtLocation').value,
    workName: $('#txtWorkName').value,
    kind: $('#txtKind').value,
    item: $('#txtItem').value,
    agent: $('#txtAgent').value,
    workGroup: $('#txtWorkGroup').value,
    type: $('#txtType').value,
    law: $('#txtLaw').value,
    condition: $('#txtCondition').value,
    action: $('#txtAction').value,
    causes: [...selectedCauses],
    inspectedDate: $('#txtInspectDate').value
  };
  localStorage.setItem('sp_draft', JSON.stringify(draft));
  $('#saveStatus').textContent = '자동 임시저장 완료';
}

function loadDraft() {
  const raw = localStorage.getItem('sp_draft');
  if (!raw) return;
  try {
    const d = JSON.parse(raw);
    if (d.site) $('#txtSite').value = d.site;
    if (d.content) $('#txtContent').value = d.content;
    if (d.location) $('#txtLocation').value = d.location;
    if (d.workName) $('#txtWorkName').value = d.workName;
    if (d.kind) $('#txtKind').value = d.kind;
    if (d.item) $('#txtItem').value = d.item;
    if (d.agent) $('#txtAgent').value = d.agent;
    if (d.workGroup) $('#txtWorkGroup').value = d.workGroup;
    if (d.type) $('#txtType').value = d.type;
    if (d.law) $('#txtLaw').value = d.law;
    if (d.condition) $('#txtCondition').value = d.condition;
    if (d.action) $('#txtAction').value = d.action;
    if (d.causes) {
      selectedCauses = new Set(d.causes);
      updateCauseChips();
    }
  } catch (e) {}
}

function clearDraft() {
  localStorage.removeItem('sp_draft');
  $('#saveStatus').textContent = '';
}

// ── Record List View ──
async function renderRecordList() {
  const c = $('#recordListContainer');
  c.innerHTML = '<div style="text-align:center; padding:20px; color:var(--gray-400);">목록을 불러오는 중...</div>';
  
  const curMonth = monthStr();
  const records = await store.listMonth(curMonth);

  if (!records.length) {
    c.innerHTML = '<div style="text-align:center; padding:30px; color:var(--gray-400);">이번 달 등록된 내역이 없습니다.</div>';
    return;
  }

  c.innerHTML = '';
  for (const r of records) {
    const isFixed = r.status === '조치완료';
    const card = h('div.card', { style: { padding: '14px', borderLeft: `5px solid ${isFixed ? 'var(--success)' : 'var(--danger)'}` } },
      h('div', { style: { display: 'flex', justifyContent: 'space-between', marginBottom: '6px' } },
        h('strong', { style: { fontSize: '0.95rem' } }, `[${r.site}] ${r.location}`),
        h('span.badge', { class: isFixed ? 'success' : 'danger', style: { color: isFixed ? 'var(--success)' : 'var(--danger)' } }, isFixed ? '✅ 조치완료' : '⚠️ 미조치')
      ),
      h('div', { style: { fontSize: '0.92rem', marginBottom: '8px', color: 'var(--gray-900)' } }, r.content),
      h('div', { style: { fontSize: '0.8rem', color: 'var(--gray-600)', marginBottom: '8px' } },
        `${r.kind} › ${r.item} (${r.agent || '-'}) · ${r.inspectedDate} (${r.inspector})`
      ),
      !isFixed ? h('button.btn.btn-outline', {
        style: { fontSize: '0.82rem', padding: '6px 12px' },
        onclick: () => {
          targetFixRecord = r;
          fixPhotoData = null;
          $('#txtFixContent').value = '';
          $('#fixPhotoPreview').innerHTML = '';
          $('#fixModal').style.display = 'flex';
        }
      }, '🔧 조치내용/조치사진 등록') : h('div', { style: { fontSize: '0.82rem', color: 'var(--gray-800)', background: 'var(--gray-50)', padding: '6px 10px', borderRadius: '6px' } }, `조치결과: ${r.fix.content}`)
    );
    c.append(card);
  }
}
