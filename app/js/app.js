import { $, $$, h, todayStr, monthStr, toast, debounce, downloadBlob } from './util.js?v=20261004_2';
import { store } from './store.js?v=20261004_2';
import { processImageFile } from './image-processor.js?v=20261004_2';

let classifier = null;
let currentPhotos = []; // [{ blob, previewUrl, dateTaken }]
let selectedCauses = new Set();
let smartResult = null;
let smartRecommendationApplied = false;
let appliedSmartResult = null;
let pinInput = '';
let targetFixRecord = null;
let fixPhotoData = null;
let recordViewMode = 'card'; // 'card' or 'table'
let listPeriodMode = 'month'; // 'all', 'month', or 'range'
let exportPeriodMode = 'month'; // 'all', 'month', or 'range'
let eduPeriodMode = 'month'; // 'all', 'month', or 'range'
let currentLoadedRecords = [];
let currentEduRecords = [];
let currentEduPeriodLabel = '';

// ── App Init ──
window.addEventListener('DOMContentLoaded', async () => {
  // 1. 이벤트 리스너를 가장 먼저 바인딩하여 모든 UI 상호작용 즉시 활성화
  bindEvents();

  // 초기 날짜 및 기간 설정
  const today = todayStr();
  const curMonth = monthStr();
  const firstDay = `${curMonth}-01`;

  if ($('#txtInspectDate')) $('#txtInspectDate').value = today;
  if ($('#selListMonth')) $('#selListMonth').value = curMonth;
  if ($('#txtListStartDate')) $('#txtListStartDate').value = firstDay;
  if ($('#txtListEndDate')) $('#txtListEndDate').value = today;

  if ($('#selEduMonth')) $('#selEduMonth').value = curMonth;
  if ($('#txtEduStartDate')) $('#txtEduStartDate').value = firstDay;
  if ($('#txtEduEndDate')) $('#txtEduEndDate').value = today;

  if ($('#selExportMonth')) $('#selExportMonth').value = curMonth;
  if ($('#txtExportStartDate')) $('#txtExportStartDate').value = firstDay;
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
    if (store.taxonomy) populateDatalists();
    checkAuth();

  } catch (err) {
    console.error('App init error:', err);
    toast('초기화 알림: ' + err.message, 'warning');
    checkAuth();
  }
});

function reinitClassifier() {
  if (window.SafeClassifier && store.taxonomy && store.keywords) {
    classifier = window.SafeClassifier.createClassifier(store.taxonomy, store.keywords, store.rlWeights);
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
    reinitClassifier();
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
      const rlBadge = (res.rlBoost && res.rlBoost > 0)
        ? `<span class="badge" style="background:#fef08a; color:#854d0e; font-weight:700; margin-left:6px;">⚡ 강화학습 추천 (+${res.rlBoost})</span>`
        : '';
      $('#smartDesc').innerHTML = `<strong>${x.종류} › ${x.항목}</strong> (${x.유형})${rlBadge}<br><small style="color:var(--gray-600);">${x.산업안전보건법}</small>`;
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
    smartRecommendationApplied = true;
    appliedSmartResult = { ...smartResult };
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
    toast('스마트 자동분류가 적용되었습니다. 필요 시 수정하시면 AI가 학습합니다.', 'success');
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

  // ── 회의용 PPT 자동 생성 핸들러 (월별 또는 기간 직접지정 지원) ──
  $('#btnDownloadPPT').addEventListener('click', async () => {
    const filterSite = $('#selExportSite').value;
    const btn = $('#btnDownloadPPT');

    btn.disabled = true;
    btn.textContent = 'PPT 프레젠테이션 제작 중...';

    try {
      let records = [];
      let periodLabel = '';

      if (exportPeriodMode === 'all') {
        records = await store.listAll();
        periodLabel = '전체 누적 기간';
      } else if (exportPeriodMode === 'month') {
        const bucket = $('#selExportMonth').value;
        if (!bucket) {
          toast('대상 월을 선택해주세요.', 'danger');
          btn.disabled = false;
          btn.textContent = '📑 회의용 분석 PPT (.pptx) 다운로드';
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
          btn.textContent = '📑 회의용 분석 PPT (.pptx) 다운로드';
          return;
        }
        records = await store.listPeriod(start, end);
        periodLabel = `${start} ~ ${end}`;
      }

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
        month: periodLabel,
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
    $('#btnViewCard').classList.remove('btn-outline');
    $('#btnViewCard').classList.add('btn-primary');
    $('#btnViewTable').classList.remove('btn-primary');
    $('#btnViewTable').classList.add('btn-outline');
    renderRecordList();
  });

  $('#btnViewTable')?.addEventListener('click', () => {
    recordViewMode = 'table';
    $('#recordListContainer').style.display = 'none';
    $('#recordTableContainer').style.display = 'block';
    $('#btnViewTable').classList.remove('btn-outline');
    $('#btnViewTable').classList.add('btn-primary');
    $('#btnViewCard').classList.remove('btn-primary');
    $('#btnViewCard').classList.add('btn-outline');
    renderRecordList();
  });

  const refreshBtn = $('#btnRefreshList');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
      renderRecordList();
      toast('대장 목록을 새로고침했습니다.', 'info');
    });
  }

  // 선택 일괄 삭제 (대량 삭제)
  const btnDelSelected = $('#btnDeleteSelected');
  if (btnDelSelected) {
    btnDelSelected.addEventListener('click', async () => {
      const checkedBoxes = Array.from(document.querySelectorAll('.chk-record-item:checked'));
      if (!checkedBoxes.length) return;
      const count = checkedBoxes.length;
      if (!confirm(`선택한 ${count}건의 부적합 내역을 영구 삭제하시겠습니까?\n삭제된 데이터는 복구할 수 없습니다.`)) return;

      toast(`${count}건의 부적합 데이터 삭제 중...`, 'info');
      for (const chk of checkedBoxes) {
        const id = chk.dataset.id;
        const rec = currentLoadedRecords.find(x => x.id === id);
        if (rec) {
          try { await store.deleteRecord(rec); } catch (e) { console.error('Delete error:', e); }
        }
      }
      toast(`${count}건의 부적합 데이터가 삭제되었습니다.`, 'success');
      renderRecordList();
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
}

function updateSelectedCount() {
  const checked = document.querySelectorAll('.chk-record-item:checked').length;
  const cntSpan = $('#selectedCount');
  const btnDel = $('#btnDeleteSelected');
  if (cntSpan) cntSpan.textContent = checked;
  if (btnDel) {
    btnDel.style.display = checked > 0 ? 'inline-block' : 'none';
  }
}

async function deleteOneRecord(rec) {
  if (!confirm(`[${rec.site}]\n"${rec.content}"\n\n해당 부적합 건을 삭제하시겠습니까?`)) return;
  try {
    await store.deleteRecord(rec);
    toast('부적합 건이 삭제되었습니다.', 'info');
    renderRecordList();
  } catch (e) {
    toast(`삭제 실패: ${e.message}`, 'danger');
  }
}

// ── 1페이지 교육자료 미리보기 갱신 ──
async function updateEduPreview() {
  const sel = $('#selEduRecord');
  const recordId = sel?.value;
  if (!recordId) return;

  const rec = currentEduRecords.find(r => r.id === recordId) || currentLoadedRecords.find(r => r.id === recordId);
  if (!rec) return;

  // 관련 법령 핵심 수칙 찾기 (taxonomy.categories에서 item 검색)
  let rules = [];
  const allItems = (store.taxonomy && store.taxonomy.categories) 
    ? store.taxonomy.categories.list.flatMap(c => c.items)
    : [];
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

  // 선택된 기간 내의 해당 위험유형 통계 자동 계산
  const totalCount = currentEduRecords.length || 1;
  const sameTypeCount = currentEduRecords.filter(r => r.type === rec.type).length;
  const typePct = Math.round((sameTypeCount / totalCount) * 100);
  const statsText = `선택 기간(${currentEduPeriodLabel}) 총 ${totalCount}건 중 '${rec.type}' 위험요인이 ${sameTypeCount}건(${typePct}%)을 차지했습니다. 작업 전 철저한 예방 및 안전수칙 준수가 요구됩니다.`;

  const html = window.SafeOnePage.renderTemplate({
    title: `${rec.item} 안전수칙 및 개선 사례`,
    site: rec.site,
    date: rec.inspectedDate,
    period: currentEduPeriodLabel,
    beforePhoto: beforeUrl,
    afterPhoto: afterUrl,
    itemName: `${rec.item} (${rec.agent || '부속자재'}) ${rec.content}`,
    law: (rec.basis && rec.basis.law) || (foundItem && foundItem.law) || '산업안전보건기준에 관한 규칙',
    rules,
    statsText,
    inspector: rec.inspector
  });

  $('#eduContainer').innerHTML = html;
}

async function populateEduOptions() {
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
      periodLabel = curMonth;
    } else {
      const start = $('#txtEduStartDate')?.value || `${monthStr()}-01`;
      const end = $('#txtEduEndDate')?.value || todayStr();
      records = await store.listPeriod(start, end);
      periodLabel = `${start} ~ ${end}`;
    }
  } catch (e) {
    console.error('Edu list query error:', e);
    records = [];
  }

  currentEduRecords = records;
  currentEduPeriodLabel = periodLabel;
  
  if (!records.length) {
    sel.innerHTML = '<option value="">선택한 기간에 등록된 부적합 내역이 없습니다.</option>';
    $('#eduContainer').innerHTML = `
      <div style="text-align: center; padding: 30px; color: var(--gray-500); font-size: 0.9rem;">
        선택한 기간(<strong>${periodLabel}</strong>)에 등록된 부적합 데이터가 없습니다.<br>
        다른 기간을 선택하시거나 부적합 사항을 등록해주세요.
      </div>
    `;
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
  smartRecommendationApplied = false;
  appliedSmartResult = null;
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
  const tbody = $('#tblRecordsBody');
  if (c) c.innerHTML = '<div style="text-align:center; padding:20px; color:var(--gray-400);">목록을 불러오는 중...</div>';
  if (tbody) tbody.innerHTML = '<tr><td colspan="16" style="padding:20px; color:var(--gray-400);">데이터를 불러오는 중...</td></tr>';
  
  if ($('#chkAllRecords')) $('#chkAllRecords').checked = false;
  updateSelectedCount();

  let records = [];
  try {
    if (listPeriodMode === 'all') {
      records = await store.listAll();
    } else if (listPeriodMode === 'month') {
      const m = $('#selListMonth')?.value || monthStr();
      records = await store.listMonth(m);
    } else {
      const start = $('#txtListStartDate')?.value || `${monthStr()}-01`;
      const end = $('#txtListEndDate')?.value || todayStr();
      records = await store.listPeriod(start, end);
    }
  } catch (e) {
    console.error('List query error:', e);
    records = [];
  }

  currentLoadedRecords = records;

  if (!records.length) {
    let msg = '선택한 기간에 등록된 내역이 없습니다.';
    if (listPeriodMode === 'all') msg = '누적된 부적합 내역이 없습니다.';
    else if (listPeriodMode === 'month') msg = '해당 월에 등록된 내역이 없습니다.';
    if (c) c.innerHTML = `<div style="text-align:center; padding:30px; color:var(--gray-400);">${msg}</div>`;
    if (tbody) tbody.innerHTML = `<tr><td colspan="16" style="padding:30px; color:var(--gray-400);">${msg}</td></tr>`;
    return;
  }

  if (c) c.innerHTML = '';
  if (tbody) tbody.innerHTML = '';

  for (const [idx, r] of records.entries()) {
    const isFixed = r.status === '조치완료';

    // 사진 Object URL 비동기 변환 (IndexedDB Blob -> Object URL)
    let photoThumbUrl = '';
    if (r.photos && r.photos[0]) {
      try {
        photoThumbUrl = await store.photoURL(r.photos[0]);
      } catch (e) {
        console.warn('Failed to resolve photo URL:', r.photos[0], e);
      }
    }

    let fixPhotoThumbUrl = '';
    if (r.fix && r.fix.photo) {
      try {
        fixPhotoThumbUrl = await store.photoURL(r.fix.photo);
      } catch (e) {
        console.warn('Failed to resolve fix photo URL:', r.fix.photo, e);
      }
    }

    // 1) 모바일 카드형 뷰
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
        style: { fontSize: '0.82rem', padding: '6px 12px', color: 'var(--danger)', borderColor: '#fca5a5' },
        onclick: () => deleteOneRecord(r)
      }, '🗑️ 삭제'));

      const cardBody = h('div', { style: { display: 'flex', gap: '10px', alignItems: 'flex-start', marginBottom: '8px' } });
      if (photoThumbUrl) {
        cardBody.append(h('img', {
          src: photoThumbUrl,
          style: { width: '56px', height: '56px', objectFit: 'cover', borderRadius: '6px', border: '1px solid #cbd5e1', cursor: 'pointer', flexShrink: '0' },
          onclick: () => window.open(photoThumbUrl, '_blank'),
          title: '클릭하여 원본보기'
        }));
      }
      cardBody.append(h('div', { style: { flex: '1', minWidth: '0' } },
        h('div', { style: { fontSize: '0.92rem', marginBottom: '4px', color: 'var(--gray-900)', fontWeight: '500' } }, r.content),
        h('div', { style: { fontSize: '0.8rem', color: 'var(--gray-600)' } },
          `${r.kind} › ${r.item} (${r.agent || '-'}) · ${r.inspectedDate} (${r.inspector})`
        )
      ));

      const card = h('div.card', { style: { padding: '14px', borderLeft: `5px solid ${isFixed ? 'var(--success)' : 'var(--danger)'}` } },
        h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', marginBottom: '6px' } },
          h('strong', { style: { fontSize: '0.95rem', minWidth: '0', wordBreak: 'keep-all' } }, `[${r.site}] ${r.location}`),
          h('span.badge', { class: isFixed ? 'success' : 'danger', style: { flexShrink: '0', whiteSpace: 'nowrap' } }, isFixed ? '✅ 조치완료' : '⚠️ 미조치')
        ),
        cardBody,
        isFixed ? h('div', { style: { fontSize: '0.82rem', color: 'var(--gray-800)', background: 'var(--gray-50)', padding: '6px 10px', borderRadius: '6px', marginBottom: '6px' } }, `조치결과: ${r.fix.content}`) : '',
        btnGroup
      );
      c.append(card);
    }

    // 2) 엑셀 스프레드시트 테이블 뷰
    if (tbody) {
      let photoThumb = '<span style="color:var(--gray-400); font-size:0.75rem;">-</span>';
      if (photoThumbUrl) {
        photoThumb = `<img src="${photoThumbUrl}" style="width:42px; height:42px; object-fit:cover; border-radius:4px; border:1px solid #cbd5e1; cursor:pointer;" onclick="window.open('${photoThumbUrl}', '_blank')" title="클릭하여 원본보기">`;
      }
      const tr = document.createElement('tr');
      tr.style.borderBottom = '1px solid #e2e8f0';
      tr.style.background = idx % 2 === 0 ? '#ffffff' : '#f8fafc';
      tr.innerHTML = `
        <td style="padding:6px 4px;"><input type="checkbox" class="chk-record-item" data-id="${r.id}"></td>
        <td style="padding:8px 4px; font-weight:600; color:var(--gray-700);">${idx + 1}</td>
        <td style="padding:4px;">${photoThumb}</td>
        <td style="padding:8px; font-weight:500;">${r.site || '-'}</td>
        <td style="padding:8px; color:var(--gray-600);">${r.inspectedDate || '-'}</td>
        <td style="padding:8px 10px; text-align:left; font-weight:500; color:var(--gray-900);">${r.content}</td>
        <td style="padding:8px; color:var(--gray-700);">${r.location || '-'}</td>
        <td style="padding:8px; color:var(--gray-700);">${r.workName || '-'}</td>
        <td style="padding:8px;"><span class="badge" style="font-size:0.75rem;">${r.type || '-'}</span></td>
        <td style="padding:8px; color:var(--gray-700);">${r.agent || '-'}</td>
        <td style="padding:8px; color:var(--gray-600);">${r.condition || '-'}</td>
        <td style="padding:8px; color:var(--gray-600);">${(r.causes || []).join(', ') || '-'}</td>
        <td style="padding:8px; white-space:nowrap;"><span class="badge ${isFixed ? 'success' : 'danger'}" style="font-size:0.75rem;">${isFixed ? '✅ 조치완료' : '⚠️ 미조치'}</span></td>
        <td style="padding:8px 10px; text-align:left; color:${isFixed ? 'var(--gray-800)' : 'var(--gray-400)'};">
          <div style="display:flex; align-items:center; gap:6px;">
            ${fixPhotoThumbUrl ? `<img src="${fixPhotoThumbUrl}" style="width:32px; height:32px; object-fit:cover; border-radius:4px; border:1px solid #cbd5e1; cursor:pointer; flex-shrink:0;" onclick="window.open('${fixPhotoThumbUrl}', '_blank')" title="조치완료 사진">` : ''}
            <span>${(r.fix && r.fix.content) || '(미조치)'}</span>
          </div>
        </td>
        <td style="padding:8px; color:var(--gray-600);">${r.inspector || '-'}</td>
        <td style="padding:6px 4px;">
          <div style="display:flex; gap:3px; justify-content:center;">
            ${!isFixed ? `<button type="button" class="btn btn-outline btn-table-fix" style="padding:3px 6px; font-size:0.75rem;">조치</button>` : ''}
            <button type="button" class="btn btn-outline btn-table-del" style="padding:3px 6px; font-size:0.75rem; color:var(--danger); border-color:#fca5a5;" title="삭제">삭제</button>
          </div>
        </td>
      `;

      const chkBox = tr.querySelector('.chk-record-item');
      if (chkBox) {
        chkBox.addEventListener('change', updateSelectedCount);
      }

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
      if (delBtn) {
        delBtn.addEventListener('click', () => deleteOneRecord(r));
      }

      tbody.appendChild(tr);
    }
  }
}
