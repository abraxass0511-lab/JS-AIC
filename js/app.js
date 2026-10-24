import { $, $$, h, todayStr, monthStr, toast, debounce, downloadBlob, saveAndEmail } from './util.js?v=20261004_10';
import { store } from './store.js?v=20261018_1';
import { processImageFile } from './image-processor.js?v=20261025_jangpyo_fix';
import { determineStandardStage, STANDARD_STAGES, PRODUCT_TYPES } from './progress-standardizer.js?v=20261010_1';
import { parsePPTX, parseImage, filterOnlyOccupationalSafetyLaw } from './pptx-importer-v2.js?v=20261025_law_filter';

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

// ── Datalists & Taxonomy Rendering ──
function populateDatalists() {
  const tax = store.taxonomy;
  const tax9 = store.taxonomy9x9;
  const custom = store.custom.customValues || {};
  const addOpts = (id, list, customKey) => {
    const el = document.getElementById(id);
    if (!el) return;
    const all = [...new Set([...(list || []), ...(custom[customKey] || [])])];
    el.innerHTML = all.map(v => `<option value="${v}">`).join('');
  };

  const allItems = (tax && tax.categories && tax.categories.list) ? tax.categories.list.flatMap(c => c.items) : [];
  addOpts('listKinds', tax.categories ? tax.categories.list.map(c => c.kind) : [], 'kind');
  addOpts('listItems', allItems.map(i => i.name), 'item');
  addOpts('listAgents', [...new Set(allItems.flatMap(i => i.agents || []))], 'agent');

  // 🎯 기인물 대/중/소 3단계 계층 Datalist 연동
  const agentTree = (tax9 && tax9.agentTree) || {
    '가시설': {
      '비계': ['시스템비계', '강관비계', '이동식틀비계', '달비계', '달대비계', '말비계', '각립비계'],
      '흙막이': ['수직재', '수평재', '모서리부', '토사부', '어스앵커', '스트럿'],
      '동바리': ['시스템동바리', '강관동바리', '잭서포트', '파이프서포트'],
      '거푸집': ['갱폼', '알폼', '유로폼', '합판거푸집', '기타'],
      '특수거푸집': ['ACS', 'RCS', '슬립폼', '테이블폼', '클라이밍폼'],
      '데크': ['데크플레이트', '트러스데크', '이지데크'],
      '철골': ['철골기둥', '철골보', '가새', '데크단부'],
      'PC': ['PC기둥', 'PC보', 'PC슬래브', 'PC접합부'],
      '안전시설': ['추락방지시설(안전난간)', '추락방지시설(수직방호망)', '추락방지시설(덮개)', '추락방지시설(안전대걸이시설)', '낙하방지시설(방호선반)', '낙하방지시설(낙하물방지망)']
    },
    '건설장비': {
      '양중장비': ['타워크레인', '이동식크레인', '카고크레인', '호이스트'],
      '탑승장비': ['고소작업차', '고소작업대', '곤돌라', '건설용리프트'],
      '운반장비': ['지게차', '덤프트럭', '트레일러', '레미콘트럭'],
      '차량계건설기계': ['펌프카'],
      '생산장비': ['펌프카', '배처플랜트'],
      '굴착장비': ['굴착기'],
      '천공장비': ['천공기', '항타기', '항발기'],
      '토공장비': ['로더', '불도저'],
      '해상장비': ['해상크레인', '바지선', '예인선']
    },
    '작업공도구': {
      '용접기': ['아크용접기', 'CO2용접기', 'TIG용접기', '인버터용접기'],
      '화기': ['가스토치', '산소절단기', '가스용기(LPG/산소/아세틸렌)', '열풍기'],
      '절단기구': ['고속절단기', '휴대용절단기', '원형톱(핸드쏘)', '세이버쏘(컷소)', '밴드쏘', '플라즈마절단기'],
      '회전기구': ['핸드그라인더', '휴대용전기드릴', '해머드릴', '코아드릴', '교반기(믹서기)', '임팩트렌치/소켓'],
      '압력기구': ['에어콤프레셔', '압력용기', '고압세척기', '에어리스(도장분출기)'],
      '타정기구': ['에어타카/가스타카', '화약총(타정총)', '리벳건'],
      '운반기구': ['손수레(일륜차)', '핸드파렛트(핸드자키)', '소형대차(구루마/롤테이너)'],
      '양중기구': ['체인블록', '레버블록(풀링)', '슬링벨트(섬유벨트)', '와이어로프/샤클', '양중함/달기로프'],
      '수공구': ['망치/함마', '몽키스패너/파이프렌치', '첼라/바이스플라이어', '쇠지레(빠루)/볼트클리퍼']
    },
    '작업발판': {
      '틀비계': ['틀비계발판', '가새재', '아웃트리거'],
      '말비계': ['말비계발판', '지주부재', '보조부재'],
      '달비계': ['작업대', '달기로프', '구명줄'],
      '달대비계': ['달대체인', '달대파이프', '작업발판'],
      '각립비계': ['디딤판', '힌지고정쇠', '미끄럼방지캡'],
      '이동식 사다리': ['사다리발판', '전도방지대', '상부걸림턱'],
      '낮은 발판': ['족장판', '우마발판'],
      '현장제작발판': ['목재발판', '강재발판'],
      '지붕발판': ['지붕작업발판', '채광창덮개']
    },
    'PPE': {
      '안전모': ['턱끈', '충격흡수라이너', '모체'],
      '보안경/면': ['보안경', '차광보안경', '용접면'],
      '귀덮개/마개': ['귀마개', '귀덮개'],
      '호흡기보호구': ['방진마스크', '방독마스크', '송기마스크'],
      '안전대': ['상체식하네스', '전체식하네스', '죔줄', '이중고리'],
      '추락방지대': ['로립/롤링클램프', '안전블록(와이어/웨빙)'],
      '안전장갑': ['방진장갑', '가죽용접장갑', '절연장갑'],
      '안전장화': ['절연안전장화', '내유안전장화'],
      '안전화': ['가죽안전화', '정전기안전화', '절연안전화']
    },
    '전기시설': {
      '수전시설': ['고압수전반', '변압기', '특고압인입선'],
      '분전반': ['가설분전함', '외함잠금장치', '내부차단기'],
      '냉난방기': ['전기온풍기', '에어컨', '열풍기'],
      '전선': ['이동전선(캡타이어)', '가설배선', '가공전선'],
      '전등시설': ['투광등', '작업등', 'LED바', '비상유도등'],
      '전열시설': ['열선(양생용)', '전열기구'],
      '전기기구': ['충전기', '콘센트/플러그', '작업릴선'],
      '접지시설': ['제3종접지', '기계외함접지', '접지극'],
      '누전차단기': ['고감도누전차단기(30mA)', '인입누전차단기']
    },
    '소방시설': {
      '비상대피시설': ['비상대피유도선', '피난사다리', '비상구'],
      '화재수신반': ['가설화재수신기', '발신기'],
      '화재감지시설': ['단독경보형감지기', '열감지기', '연기감지기'],
      '스프링쿨러': ['임시소방배관', '간이스프링클러'],
      '소화시설': ['분말소화기(ABC)', '소화수통', '마른모래(방화사)'],
      '불티비산방지': ['방염포', '불티비산방지포', '비산방지차폐막'],
      '충전시설': ['배터리보관함', '화재안전충전함'],
      '가설건물': ['가설사무실', '근로자휴게실', '자재창고'],
      '생활화재': ['난로', '취사도구', '담배꽁초수거함']
    },
    '작업장': {
      '비상통로': ['주출입통로', '계단실통로', '비상대피로'],
      '작업구획': ['출입통제라인', '안전펜스', '칼라콘'],
      '통제구역': ['양중반경하부', '타설구역', '밀폐공간출입구'],
      '가설통로': ['경사로', '비계다리', '안전통로'],
      '자재야적장': ['철근야적장', '파이프적치대', '거푸집야적장'],
      '위험물보관소': ['페인트저장소', '유류저장고', '가스용기보관소'],
      '폐기물보관소': ['건축폐기물적재함', '분리수거장'],
      '조도확보': ['지하작업장조명', '어두운통로조명'],
      '청결상태': ['바닥잔재물정리', '못뽑기', '물고임제거']
    }
  };

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
  const locationsList = (window.SafeExcel && window.SafeExcel.ACCIDENT_LOCATIONS) || [
    '건축물', '본구조물', '가설물', '기계·기구', '설비·장치',
    '적재물', '옥상·지붕', '계단·복도', '엘리베이터홀', '천장 내부',
    '탱크 내부', '실내 작업장', '지하실', '실외 작업장', '외부',
    '도로', '야적장', '수상', '수중', '공중'
  ];
  addOpts('listLocations', locationsList, 'location');

  const typesList = (window.SafeExcel && window.SafeExcel.ACCIDENT_TYPES) || [
    '떨어짐(추락, 사람)', '끼임(협착, 감김)', '무너짐(붕괴, 도괴)/깔림', '넘어짐(전도: 사람)',
    '미끄러짐/접질림', '쓰러짐, 뒤집힘(전도, 전복: 자재/장비 등)', '부딪힘(충돌)/맞음',
    '떨어짐(낙하/비래)/맞음', '감전', '화재/폭발', '질식/중독 등', '베임/찔림/절단',
    '위험물질 노출/흡입/접촉 등', '개인질환/근골격계', '폭력행위', '기타', '분류불능'
  ];
  addOpts('listTypes', typesList, 'type');

  const workMethods = (window.SafeExcel && window.SafeExcel.WORK_METHODS_9X9) || [
    '굴착작업', '하역운반작업', '양중작업', '설치조립작업', '해체작업', '중량물취급작업', '고소작업', '밀폐공간작업', '협소공간작업'
  ];
  const workGroups = (window.SafeExcel && window.SafeExcel.WORK_GROUPS) || [
    '가설공사', '토공사', '기초공사', '철근콘크리트공사', '철골공사', '양중공사', '마감공사', '설비·전기공사', '해체공사', '토목·조경·포장', '공통'
  ];
  addOpts('listWorkGroups', [...new Set([...workGroups, ...tax.workTypes.list.map(w => w.group)])], 'workGroup');
  addOpts('listWorkNames', workMethods, 'workMethod');
  addOpts('listConditions', (tax9 && tax9.unsafeConditionsList) || tax.unsafeConditions.list, 'condition');
  addOpts('listActions', (tax9 && tax9.unsafeActionsList) || tax.unsafeActions.list, 'action');

  // 9×9 점검인자 및 근본원인 datalist
  const m9Areas = (tax9 && tax9.matrix9x9 && tax9.matrix9x9.areas.map(a => a.name)) || [
    '가시설', '건설장비', '작업방법', '작업공도구', '작업발판', 'PPE', '전기시설', '소방시설', '작업장'
  ];
  const m9Targets = (tax9 && tax9.matrix9x9 && tax9.matrix9x9.areas.flatMap(a => a.items)) || [
    '비계', '흙막이', '동바리', '거푸집', '특수거푸집', '데크', '철골', 'PC', '안전시설',
    '양중장비', '탑승장비', '운반장비', '차량계건설기계', '생산장비', '굴착장비', '천공장비', '토공장비', '해상장비',
    '굴착작업', '하역운반작업', '양중작업', '설치조립작업', '해체작업', '중량물취급작업', '고소작업', '밀폐공간작업', '협소공간작업',
    '용접기', '화기', '절단기구', '회전기구', '압력기구', '타정기구', '운반기구', '양중기구', '수공구',
    '틀비계', '말비계', '달비계', '달대비계', '각립비계', '이동식 사다리', '낮은 발판', '현장제작발판', '지붕발판',
    '안전모', '보안경/면', '귀덮개/마개', '호흡기보호구', '안전대', '추락방지대', '안전장갑', '안전장화', '안전화',
    '수전시설', '분전반', '냉난방기', '전선', '전등시설', '전열시설', '전기기구', '접지시설', '누전차단기',
    '비상대피시설', '화재수신반', '화재감지시설', '스프링쿨러', '소화시설', '불티비산방지', '충전시설', '가설건물', '생활화재',
    '비상통로', '작업구획', '통제구역', '가설통로', '자재야적장', '위험물보관소', '폐기물보관소', '조도확보', '청결상태'
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
      if (viewId === 'viewList') renderRecordList();
      if (viewId === 'viewEdu') populateEduOptions();
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
  $('#btnSaveImportedRecords')?.addEventListener('click', handleSaveImportedRecords);
  $('#btnClearImported')?.addEventListener('click', () => {
    importedRecords = [];
    if ($('#importPreviewArea')) $('#importPreviewArea').style.display = 'none';
    if ($('#importCardsContainer')) $('#importCardsContainer').innerHTML = '';
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
    const progressVal = parseFloat($('#txtProgressRate')?.value || 35);
    const productTypeVal = $('#selProductType')?.value || '공동주택';
    const workGroupVal = $('#txtWorkGroup')?.value.trim() || '';
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
      workName,
      workMethod: workName,
      workGroup: workGroupVal,
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
      interviewOpinion: $('#txtInterviewOpinion')?.value.trim() || '',
      inspectorOpinionType: $('#selInspectorOpinionType')?.value || '시스템 개선',
      auditProposal: $('#txtAuditProposal')?.value.trim() || '',
      pmVerdict: $('#txtPmVerdict')?.value.trim() || '',
      workMethod: workName,
      workPlan: '해당없음',
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
    btn.textContent = '저장 중...';

    try {
      await store.saveRecord(record, media, msg => { btn.textContent = msg; });
      
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

      const wb = await window.SafeExcel.build(window.ExcelJS, {
        records,
        taxonomy: { ...store.taxonomy, _tax9: store.taxonomy9x9 },
        customValues: store.custom.customValues,
        sites: store.sites,
        loadImage: async (path) => {
          const blob = await store.photoBlob(path);
          if (!blob) return null;
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

  // ── 현장 패트롤 점검장표 PPT 자동 생성 및 다운로드 핸들러 ──
  $('#btnPreviewEdu')?.addEventListener('click', () => updateEduPreview());
  
  $('#btnDownloadJangpyoPpt')?.addEventListener('click', function () {
    downloadSingleJangpyoPPT(this);
  });
  $('#btnDownloadJangpyoPptBottom')?.addEventListener('click', function () {
    downloadSingleJangpyoPPT(this);
  });

  $('#btnDownloadAllJangpyoPpt')?.addEventListener('click', function () {
    downloadBatchJangpyoPPT(currentEduRecords, this, currentEduPeriodLabel || '전체');
  });

  $('#btnTableBatchJangpyo')?.addEventListener('click', function () {
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
  const checked = document.querySelectorAll('.chk-record-item:checked').length;
  const cntSpan = $('#selectedCount');
  const btnDel = $('#btnDeleteSelected');
  if (cntSpan) cntSpan.textContent = checked;
  if (btnDel) {
    btnDel.style.display = checked > 0 ? 'inline-block' : 'none';
  }
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

  // 3) 회의용 PPT 이메일 발송
  $('#btnEmailPPT')?.addEventListener('click', async () => {
    const filterSite = $('#selExportSite').value;
    const siteLabel = filterSite === 'all' ? '전체 현장 통합' : filterSite;
    let periodLabel = '전체 기간';
    let records = [];
    const btn = $('#btnEmailPPT');
    btn.disabled = true;
    btn.textContent = 'PPT 생성 중...';

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

      // 핸드폰에 저장하지 않고(download: false) 메모리에서 PPT 생성
      const { blob, filename } = await window.SafePPT.generatePresentation({
        records,
        siteName: filterSite === 'all' ? '전 현장 종합' : filterSite,
        month: periodLabel,
        inspector: (store.user && store.user.name) || '안전관리자',
        download: false,
        loadPhotoBase64: async (path) => {
          const b = await store.photoBlob(path);
          const buf = await b.arrayBuffer();
          const base64 = btoa(new Uint8Array(buf).reduce((data, byte) => data + String.fromCharCode(byte), ''));
          return `image/jpeg;base64,${base64}`;
        }
      });

      const total = records.length;
      const unfixed = records.filter(r => r.status !== '조치완료').length;

      const subject = `[SafePatrol] ${siteLabel} 안전회의용 패트롤 분석 PPT (${periodLabel})`;
      const body = `안녕하세요,\n\nSafePatrol 데이터 기반 [안전회의용 패트롤 부적합 분석 PPT] 자료를 공유드립니다.\n\n- 대상 현장: ${siteLabel}\n- 대상 기간: ${periodLabel}\n- 총 분석 건수: ${total}건 (미조치: ${unfixed}건)\n- 작성일자: ${todayStr()}\n\n※ 첨부된 PPT 프레젠테이션(.pptx) 파일을 확인해 주시기 바랍니다.`;

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
  });
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
            badge.title = '노트북 종료 상태: Cloudflare 24시간 클라우드 AI 연결됨 (클릭하여 설정)';
          }
          if ($('#lmStudioInlineStatus')) {
            $('#lmStudioInlineStatus').textContent = '🟢 Qwen 24시간 클라우드 AI 준비 완료 (노트북 꺼져도 동작)';
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

  // 초기 상태 확인 (1초 후 비동기 호출)
  setTimeout(refreshStatus, 800);

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

    // ── ✨ 로컬 Qwen AI 자동 분석 버튼 실행 (즉시 반영 + 스트리밍 보강) ──
  btnAnalyze?.addEventListener('click', async () => {
    const content = $('#txtContent')?.value.trim();
    if (!content) {
      toast('먼저 [부적합 내용]에 현장 지적사항을 입력하거나 음성으로 말씀하세요.', 'warning');
      $('#txtContent')?.focus();
      return;
    }

    const btnIcon = $('#lmStudioBtnIcon');
    const btnText = $('#lmStudioBtnText');

    // [0단계] 기존 스마트 AI 분류가 나와 있다면 먼저 자동 적용하여 완벽 동기화
    if (smartResult && !smartRecommendationApplied) {
      $('#btnApplySmart')?.click();
    }

    // [1단계] 0.05초 고속 규칙 매칭 (명확한 규칙이 있고, 스마트 AI가 아직 적용 안 된 경우만 보조)
    const instant = window.SafeLocalAI ? window.SafeLocalAI.quickRuleAnalysis(content) : null;
    if (instant && !smartRecommendationApplied) {
      if (instant.severity === '중부적합') $('#btnSeverityMajor')?.click();
      else $('#btnSeverityMinor')?.click();
      if (instant.law && $('#txtLaw')) $('#txtLaw').value = instant.law;
      if (instant.hazardType && $('#txtType')) $('#txtType').value = instant.hazardType;
      if (instant.item && $('#txtItem')) $('#txtItem').value = instant.item;
      if ($('#chkMgmtPlanNotMade')) $('#chkMgmtPlanNotMade').checked = instant.mgmtCauses.includes('계획 미수립');
      if ($('#chkMgmtPlanNotFollowed')) $('#chkMgmtPlanNotFollowed').checked = instant.mgmtCauses.includes('계획 미이행');
      if ($('#chkMgmtUnsafeAction')) $('#chkMgmtUnsafeAction').checked = instant.mgmtCauses.includes('불안전 행동');
      if ($('#chkMgmtUnsafeCondition')) $('#chkMgmtUnsafeCondition').checked = instant.mgmtCauses.includes('불안전 상태');
      if ($('#chkHoldPoint')) $('#chkHoldPoint').checked = !!instant.holdPoint;
      if (instant.pmVerdict && $('#txtPmVerdict')) $('#txtPmVerdict').value = instant.pmVerdict;

      // 1차 즉시 요약 카드 렌더링
      if (resultCard && resultBody) {
        resultBody.innerHTML = `
          <div style="margin-bottom: 4px; font-weight:700; color:#1e40af;">
            ⚡ 1차 즉시 판정 완료 (${instant.law})
          </div>
          <div style="font-size:0.78rem; color:#64748b; margin-bottom:4px;">
            Qwen AI가 산안법 세부 기준을 실시간 검증하고 있습니다...
          </div>
        `;
        resultCard.style.display = 'block';
      }
    }

    // [2단계] 로컬 Qwen AI 실시간 스트리밍 심층 분석
    btnAnalyze.disabled = true;
    if (btnIcon) btnIcon.textContent = '⏳';
    if (btnText) btnText.textContent = 'Qwen AI 추론 시작...';

    try {
      const extraContext = {
        workGroup: $('#txtWorkGroup')?.value || '',
        productType: $('#selProductType')?.value || '공동주택',
        progressRate: $('#txtProgressRate')?.value || 35
      };

      const res = await window.SafeLocalAI.streamAnalyzeSafetyText(content, extraContext, (prog) => {
        if (btnText) btnText.textContent = prog.message;
      });

      // 최종 정밀 결과로 보강 업데이트
      if (res.severity === '중부적합') $('#btnSeverityMajor')?.click();
      else $('#btnSeverityMinor')?.click();
      if (res.law && $('#txtLaw')) $('#txtLaw').value = res.law;
      if (res.hazardType && $('#txtType')) $('#txtType').value = res.hazardType;
      if (res.item && $('#txtItem')) $('#txtItem').value = res.item;
      if ($('#chkHoldPoint')) $('#chkHoldPoint').checked = !!res.holdPoint;
      if (res.pmVerdict && $('#txtPmVerdict')) $('#txtPmVerdict').value = res.pmVerdict;

      if (resultCard && resultBody) {
        resultBody.innerHTML = `
          <div style="margin-bottom: 5px;">
            <strong>등급 판정:</strong> <span style="font-weight: 700; color: ${res.severity === '중부적합' ? '#dc2626' : '#d97706'};">${res.severity === '중부적합' ? '🚨 중부적합 (즉시 작업중지 요건)' : '⚠️ 경부적합 (시정조치 권고)'}</span>
            ${res.holdPoint ? ' <span style="background:#fee2e2; color:#dc2626; padding:1px 5px; border-radius:3px; font-size:0.75rem; font-weight:700;">🚨 Hold Point 위반</span>' : ''}
          </div>
          <div style="margin-bottom: 5px;">
            <strong>위반 법령:</strong> <span style="color:#1e40af; font-weight:700;">${res.law}</span>
          </div>
          <div style="margin-bottom: 5px;">
            <strong>법적 판단:</strong> <span>${res.analysis}</span>
          </div>
          <div>
            <strong>조치 권고:</strong> <span style="color:#475569;">${res.pmVerdict}</span>
          </div>
        `;
        resultCard.style.display = 'block';
      }

      toast(`🎉 Qwen AI 분석 완료: [${res.severity}] 및 위반 법조항이 완벽히 반영되었습니다!`, 'success');
    } catch (err) {
      console.warn('AI 분석 처리:', err);
      // 오류나 Mixed Content 차단 시에도 1단계 즉시 룰 결과는 이미 적용되어 있으므로 안전하게 안내
      toast(`안내: 1차 룰 엔진 기준이 적용되었습니다. (${err.message})`, 'info');
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
    await store.deleteRecord(rec);
    toast('부적합 건이 삭제되었습니다.', 'info');
    renderRecordList();
  } catch (e) {
    toast(`삭제 실패: ${e.message}`, 'danger');
  }
}

// ── 1페이지 교육자료 미리보기 갱신 ──
// ── 사진 Base64 변환 헬퍼 (PptxGenJS 임베딩용 대용량 청크 안전 처리) ──
async function resolvePhotoBase64ForPPT(path) {
  if (!path) return '';
  if (path.startsWith('data:image')) return path;
  try {
    const blob = await store.photoBlob(path);
    if (!blob) return '';
    const buf = await blob.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let binary = '';
    const len = bytes.byteLength;
    for (let i = 0; i < len; i += 8192) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, Math.min(i + 8192, len)));
    }
    const base64 = btoa(binary);
    return `image/jpeg;base64,${base64}`;
  } catch (e) {
    console.warn('resolvePhotoBase64ForPPT error:', path, e);
    return '';
  }
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
    const safeLoc = (rec.location || '위치').replace(/[\/\\:*?"<>|]/g, '_');
    const filename = `점검장표_${rec.site || '현장'}_${safeLoc}_${rec.inspectedDate || todayStr()}.pptx`;
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
    const filename = `점검장표_일괄_${label ? label + '_' : ''}${list.length}건_${todayStr()}.pptx`;
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
  if (rec.photos && rec.photos[0]) {
    try { photo1Url = await store.photoURL(rec.photos[0]); } catch (e) {}
  }
  if (rec.photos && rec.photos[1]) {
    try { photo2Url = await store.photoURL(rec.photos[1]); } catch (e) {}
  } else if (rec.fix && rec.fix.photo) {
    try { photo2Url = await store.photoURL(rec.fix.photo); } catch (e) {}
  }

  if (window.SafePPT && window.SafePPT.renderInspectionSheetHTML) {
    const html = window.SafePPT.renderInspectionSheetHTML(rec, {
      photo1Url,
      photo2Url,
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
      periodLabel = curMonth;
    } else {
      const start = $('#txtEduStartDate')?.value || `${monthStr()}-01`;
      const end = $('#txtEduEndDate')?.value || todayStr();
      records = await store.listPeriod(start, end);
      periodLabel = `${start} ~ ${end}`;
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
    const isMajor = r.severity === '중부적합' || (!r.severity && r.status !== '조치완료');
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
  if ($('#txtAgentMajor')) $('#txtAgentMajor').value = '';
  if ($('#txtAgentMid')) $('#txtAgentMid').value = '';
  if ($('#txtAgentMinor')) $('#txtAgentMinor').value = '';
  if ($('#txtKind')) $('#txtKind').value = '';
  if ($('#txtItem')) $('#txtItem').value = '';
  if ($('#txtAgent')) $('#txtAgent').value = '';
  $('#txtWorkGroup').value = '';
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
  $('#smartClassifyBox').classList.remove('active');
}

// ── Local Draft (창이 켜있는 동안만 유지되는 세션 임시저장) ──
function saveDraft() {
  const draft = {
    site: $('#txtSite')?.value || '',
    content: $('#txtContent')?.value || '',
    location: $('#txtLocation')?.value || '',
    agentMajor: $('#txtAgentMajor')?.value || '',
    agentMid: $('#txtAgentMid')?.value || '',
    agentMinor: $('#txtAgentMinor')?.value || '',
    kind: $('#txtAgentMajor')?.value || $('#txtKind')?.value || '',
    item: $('#txtAgentMid')?.value || $('#txtItem')?.value || '',
    agent: $('#txtAgentMinor')?.value || $('#txtAgent')?.value || '',
    workGroup: $('#txtWorkGroup')?.value || '',
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
    if (d.site) $('#txtSite').value = d.site;
    if (d.content) {
      $('#txtContent').value = d.content;
      setTimeout(() => runSmartClassification(false), 120);
    }
    if (d.location) $('#txtLocation').value = d.location;
    if (d.workName) $('#txtWorkName').value = d.workName;
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
    if (tbody) tbody.innerHTML = `<tr><td colspan="36" style="padding:36px; color:var(--gray-600); font-weight:600;">${msg}</td></tr>`;
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
  if (tbody) tbody.innerHTML = '<tr><td colspan="36" style="padding:20px; color:var(--gray-400);">데이터를 불러오는 중...</td></tr>';
  
  if ($('#chkAllRecords')) $('#chkAllRecords').checked = false;
  updateSelectedCount();

  let records = [];
  try {
    if (listPeriodMode === 'all') {
      records = await store.listAll(true);
      if (!records || !records.length) {
        records = await store.listMonth('2026-10', true);
      }
    } else if (listPeriodMode === 'month') {
      const m = $('#selListMonth')?.value || monthStr();
      records = await store.listMonth(m, true);
      if ((!records || !records.length) && m !== '2026-10') {
        records = await store.listMonth('2026-10', true);
      }
    } else {
      const start = $('#txtListStartDate')?.value || `${monthStr()}-01`;
      const end = $('#txtListEndDate')?.value || todayStr();
      records = await store.listPeriod(start, end, true);
      if (!records || !records.length) {
        records = await store.listMonth('2026-10', true);
      }
    }
  } catch (e) {
    console.error('List query error, attempting fallback:', e);
    try {
      records = await store.listMonth('2026-10', true);
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
    if (tbody) tbody.innerHTML = `<tr><td colspan="36" style="padding:30px; color:var(--gray-500); font-weight:500;">${msg}</td></tr>`;
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

  const cardElements = [];
  const rowElements = [];

  for (const [idx, r] of filtered.entries()) {
    if (thisSeq !== listRenderSeq) return;

    const isFixed = r.status === '조치완료';
    const isMajor = r.severity === '중부적합' || (!r.severity && r.status !== '조치완료');
    const agent = resolveAgent(r);
    const accType = mapType(r.type);
    const opType = getOpType(r);

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
        h('div', { style: { fontSize: '0.92rem', marginBottom: '4px', color: 'var(--gray-900)', fontWeight: '500' } }, r.content),
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
            h('strong', { style: { fontSize: '0.95rem', minWidth: '0', wordBreak: 'keep-all' } }, `[${r.site}] ${r.location}`)
          ),
          h('span.badge', { class: isFixed ? 'success' : 'danger', style: { flexShrink: '0', whiteSpace: 'nowrap' } }, isFixed ? '✅ 조치완료' : '⚠️ 미조치')
        ),
        cardBody,
        (r.workGroup || r.workMethod || r.workName) ? h('div', { style: { fontSize: '0.76rem', color: '#0f766e', background: '#f0fdfa', padding: '4px 8px', borderRadius: '4px', marginBottom: '6px' } },
          `🔨 공종·작업방법: ${r.workGroup || '가설공사'} › ${r.workMethod || r.workName || '고소작업'}`
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
      tr.style.background = idx % 2 === 0 ? '#ffffff' : '#f8fafc';
      tr.innerHTML = `
        <td style="padding:6px 4px;"><input type="checkbox" class="chk-record-item" data-id="${r.id}"></td>
        <td style="padding:8px 4px; font-weight:600; color:var(--gray-700);">${idx + 1}</td>
        <td style="padding:4px;">${p1Thumb}</td>
        <td style="padding:4px;">${p2Thumb}</td>
        <td style="padding:6px; font-weight:700; color:${isMajor ? '#dc2626' : '#d97706'}; font-size:0.75rem;">${isMajor ? '🚨 중부적합' : '⚠️ 경부적합'}</td>
        <td style="padding:8px 10px; text-align:left; font-weight:500; color:var(--gray-900); min-width:220px;">${r.content || ''}</td>
        <td style="padding:8px 6px; color:var(--gray-700);">${r.subcontractor || '-'}</td>
        <td style="padding:8px 6px; color:var(--gray-700); font-weight:500;">${r.location || '-'}</td>
        <td style="padding:8px 6px; color:var(--gray-700);">${r.workGroup || '가설공사'}</td>
        <td style="padding:8px 6px; color:var(--gray-700);">${r.workMethod || r.workName || '고소작업'}</td>
        <td style="padding:8px 6px;"><span class="badge" style="font-size:0.74rem;">${accType}</span></td>
        <td style="padding:8px 6px; font-weight:600; color:var(--gray-800);">${agent.major}</td>
        <td style="padding:8px 6px; color:var(--gray-700);">${agent.mid}</td>
        <td style="padding:8px 6px; color:var(--gray-700); font-weight:500;">${agent.minor}</td>
        <td style="padding:8px 6px; color:var(--gray-600); font-size:0.75rem; text-align:left;">${r.law || (r.basis && r.basis.law) || '-'}</td>
        <td style="padding:8px 6px; color:var(--gray-700);">${r.condition || '-'}</td>
        <td style="padding:8px 6px; color:var(--gray-700);">${r.action || '-'}</td>
        <td style="padding:8px 6px; color:var(--gray-700);">${r.rootCauseMgmt || (r.basis && r.basis.근본원인_관리감독) || '-'}</td>
        <td style="padding:8px 6px; color:var(--gray-700);">${r.rootCauseSystem || (r.basis && r.basis.근본원인_안전시스템) || '-'}</td>
        <td style="padding:8px 4px; font-weight:700; color:${cause1 === '●' ? '#dc2626' : 'var(--gray-400)'};">${cause1}</td>
        <td style="padding:8px 4px; font-weight:700; color:${cause2 === '●' ? '#dc2626' : 'var(--gray-400)'};">${cause2}</td>
        <td style="padding:8px 4px; font-weight:700; color:${cause3 === '●' ? '#dc2626' : 'var(--gray-400)'};">${cause3}</td>
        <td style="padding:8px 4px; font-weight:700; color:${cause4 === '●' ? '#dc2626' : 'var(--gray-400)'};">${cause4}</td>
        <td style="padding:8px 6px; color:var(--gray-700); text-align:left;">${r.interviewOpinion || r.workerOpinion || '-'}</td>
        <td style="padding:8px 6px;"><span class="badge" style="font-size:0.72rem; background:#eff6ff; color:#1d4ed8; border:1px solid #bfdbfe;">${opType}</span></td>
        <td style="padding:8px 10px; color:var(--gray-700); text-align:left; min-width:150px;">${r.auditProposal || r.inspectorOpinion || '-'}</td>
        <td style="padding:8px 6px; font-weight:600; color:var(--gray-800);">${r.site || '-'}</td>
        <td style="padding:8px 6px; color:var(--gray-700);">${r.productType || '공동주택'}</td>
        <td style="padding:8px 4px; color:var(--gray-700);">${r.progressRate !== undefined && r.progressRate !== null ? (r.progressRate + '%') : '-'}</td>
        <td style="padding:8px 6px; color:var(--gray-700);">${r.stage || '지하 골조 단계'}</td>
        <td style="padding:8px 6px; white-space:nowrap;"><span class="badge ${isFixed ? 'success' : 'danger'}" style="font-size:0.75rem;">${isFixed ? '✅ 조치완료' : '⚠️ 미조치'}</span></td>
        <td style="padding:8px 10px; text-align:left; color:${isFixed ? 'var(--gray-800)' : 'var(--gray-400)'}; min-width:150px;">${(r.fix && r.fix.content) || '(미조치)'}</td>
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
      if (chkBox) chkBox.addEventListener('change', updateSelectedCount);

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

// ── PPTX / 장표 파일 임포트 처리 ──
async function handlePptxImportChange(e) {
  const files = Array.from(e.target.files || []);
  if (!files.length) return;

  toast(`${files.length}개 파일 분석 중...`, 'info', 2000);
  importedRecords = [];

  for (const f of files) {
    try {
      if (f.name.toLowerCase().endsWith('.pptx')) {
        const records = await parsePPTX(f);
        records.forEach(r => { r._sourceFile = f.name; });
        importedRecords.push(...records);
      } else if (f.type.startsWith('image/') || /\.(jpe?g|png|webp|bmp)$/i.test(f.name)) {
        const record = await parseImage(f);
        record._sourceFile = f.name;
        importedRecords.push(record);
      }
    } catch (err) {
      console.error('File parse error:', f.name, err);
      toast(`[${f.name}] 파싱 실패: ${err.message}`, 'danger');
    }
  }

  if (importedRecords.length > 0) {
    toast(`총 ${importedRecords.length}건의 부적합 장표 데이터를 추출했습니다!`, 'success');
    if ($('#importPreviewArea')) $('#importPreviewArea').style.display = 'block';
    if ($('#importCount')) $('#importCount').textContent = importedRecords.length;
    renderImportedCards();
  } else {
    toast('추출할 수 있는 부적합 슬라이드를 찾지 못했습니다.', 'warning');
  }
}

function renderImportedCards() {
  const container = $('#importCardsContainer');
  if (!container) return;
  container.innerHTML = '';

  importedRecords.forEach((rec, idx) => {
    const isMajor = rec.severity === '중부적합';
    const card = document.createElement('div');
    card.style.cssText = `
      background: white; border: 1px solid ${isMajor ? '#fca5a5' : '#fde68a'};
      border-left: 4px solid ${isMajor ? '#ef4444' : '#f59e0b'};
      border-radius: 8px; padding: 12px; display: flex; flex-direction: column; gap: 8px; font-size: 0.82rem;
    `;

    const p1 = (rec.photos && rec.photos[0]) || rec.photo1;
    const p2 = (rec.photos && rec.photos[1]) || rec.photo2;
    const thumbHtml = `
      <div style="display: flex; gap: 6px; flex-shrink: 0; align-items: center;">
        ${p1 ? `
          <div style="position: relative; display: inline-block;">
            <img src="${p1}" style="width: 68px; height: 68px; object-fit: cover; border-radius: 6px; border: 2px solid #3b82f6; display: block;" title="사진 1: 현장 부적합">
            <span style="position: absolute; bottom: 2px; left: 2px; background: rgba(30,58,138,0.88); color: white; font-size: 0.60rem; font-weight: 700; padding: 1px 4px; border-radius: 3px;">사진1</span>
          </div>
        ` : ''}
        ${p2 ? `
          <div style="position: relative; display: inline-block;">
            <img src="${p2}" style="width: 68px; height: 68px; object-fit: cover; border-radius: 6px; border: 2px solid #10b981; display: block;" title="사진 2: 세부 원인/위치">
            <span style="position: absolute; bottom: 2px; left: 2px; background: rgba(6,78,59,0.88); color: white; font-size: 0.60rem; font-weight: 700; padding: 1px 4px; border-radius: 3px;">사진2</span>
          </div>
        ` : ''}
        ${!p1 && !p2 ? `<div style="width: 68px; height: 68px; background: #f1f5f9; border-radius: 6px; display: flex; align-items: center; justify-content: center; color: #94a3b8; font-size: 0.72rem;">사진없음</div>` : ''}
      </div>
    `;

    card.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <div style="display: flex; align-items: center; gap: 6px;">
          <span style="background: ${isMajor ? '#fef2f2' : '#fffbeb'}; color: ${isMajor ? '#dc2626' : '#d97706'}; font-weight: 700; padding: 2px 6px; border-radius: 4px; border: 1px solid ${isMajor ? '#fca5a5' : '#fde68a'}; font-size: 0.72rem;">
            ${isMajor ? '🚨 중부적합' : '⚠️ 경부적합'}
          </span>
          <span style="font-weight: 700; color: var(--gray-800);">${rec.type || '추락'}</span>
          <span style="font-size: 0.72rem; color: var(--gray-500);">(${rec._sourceFile || '슬라이드 ' + (rec.slideNumber || idx + 1)})</span>
        </div>
        <button type="button" class="btn btn-outline btn-load-to-form" data-idx="${idx}" style="padding: 2px 8px; font-size: 0.72rem; border-color: var(--primary); color: var(--primary);">
          ✏️ 직접입력 폼에 채우기
        </button>
      </div>

      <div style="display: flex; gap: 10px;">
        ${thumbHtml}
        <div style="flex: 1; min-width: 0;">
          <div style="margin-bottom: 4px;">
            <label style="font-size: 0.72rem; color: #4338ca; font-weight: 700; display: block; margin-bottom: 2px;">📋 추출된 부적합 내용 (직접 수정 가능):</label>
            <textarea class="form-control txt-import-content" rows="2" style="font-size: 0.8rem; width: 100%; border: 1px solid #a5b4fc; border-radius: 4px; padding: 4px 6px; background: #f5f3ff; font-weight: 600; color: #1e1b4b; resize: vertical;">${rec.content || ''}</textarea>
          </div>
          ${rec.law && filterOnlyOccupationalSafetyLaw(rec.law) ? `
          <div style="font-size: 0.75rem; color: #1e40af; background: #eff6ff; padding: 2px 6px; border-radius: 4px; display: inline-block; margin-bottom: 4px;">
            📜 ${filterOnlyOccupationalSafetyLaw(rec.law)}
          </div>` : ''}
          <div style="color: var(--gray-600); font-size: 0.75rem;">
            협력사: ${rec.subcontractor || '-'} | 공종: ${rec.workGroup || '-'} | 장소: ${rec.location || '-'}
          </div>
        </div>
      </div>
    `;

    card.querySelector('.txt-import-content')?.addEventListener('input', (e) => {
      rec.content = e.target.value;
    });

    card.querySelector('.btn-load-to-form').addEventListener('click', () => {
      loadImportedRecordToManualForm(rec);
    });

    container.appendChild(card);
  });
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

  if ($('#txtContent')) $('#txtContent').value = rec.content || '';
  if ($('#txtLaw')) $('#txtLaw').value = filterOnlyOccupationalSafetyLaw(rec.law);
  if ($('#txtSubcontractor')) $('#txtSubcontractor').value = rec.subcontractor || '';
  if ($('#txtWorkGroup')) $('#txtWorkGroup').value = rec.workGroup || '';
  if ($('#txtWorkName')) $('#txtWorkName').value = rec.workMethod || rec.workName || '';
  if ($('#txtLocation')) $('#txtLocation').value = rec.location || '';
  const maj = rec.agentMajor || rec.kind || '';
  const mid = rec.agentMid || rec.item || '';
  const min = rec.agentMinor || rec.agent || '';
  if ($('#txtAgentMajor')) $('#txtAgentMajor').value = maj;
  if ($('#txtAgentMid')) $('#txtAgentMid').value = mid;
  if ($('#txtAgentMinor')) $('#txtAgentMinor').value = min;
  if ($('#txtKind')) $('#txtKind').value = maj;
  if ($('#txtItem')) $('#txtItem').value = mid;
  if ($('#txtAgent')) $('#txtAgent').value = min;
  if ($('#txtType')) $('#txtType').value = rec.type || '';
  if ($('#txtCondition')) $('#txtCondition').value = rec.condition || '';
  if ($('#txtAction')) $('#txtAction').value = rec.action || '';
  if ($('#txtInterviewOpinion')) $('#txtInterviewOpinion').value = rec.interviewOpinion || '';
  if ($('#selInspectorOpinionType')) $('#selInspectorOpinionType').value = rec.inspectorOpinionType || '시스템 개선';
  if ($('#txtAuditProposal')) $('#txtAuditProposal').value = rec.auditProposal || '';
  if ($('#txtPmVerdict')) $('#txtPmVerdict').value = rec.pmVerdict || '';
  if ($('#chkHoldPoint')) $('#chkHoldPoint').checked = !!rec.holdPoint;

  // 관리적 4대 발생원인 칩 동기화
  const causes = rec.mgmtCauses || [];
  if ($('#chkMgmtPlanNotMade')) $('#chkMgmtPlanNotMade').checked = causes.includes('계획 미수립');
  if ($('#chkMgmtPlanNotFollowed')) $('#chkMgmtPlanNotFollowed').checked = causes.includes('계획 미이행');
  if ($('#chkMgmtUnsafeAction')) $('#chkMgmtUnsafeAction').checked = causes.includes('불안전 행동');
  if ($('#chkMgmtUnsafeCondition')) $('#chkMgmtUnsafeCondition').checked = causes.includes('불안전 상태');
  selectedCauses.clear();
  causes.forEach(c => selectedCauses.add(c));
  updateCauseChips();

  // 9×9 점검인자 및 근본원인 (기존 데이터 또는 AI 즉시 추론)
  const m9 = (classifier && rec.content) ? classifier.classify(rec.content).result : null;
  if ($('#txtMatrixArea')) $('#txtMatrixArea').value = rec.matrixArea || (m9 && m9.점검영역9x9) || maj;
  if ($('#txtMatrixTarget')) $('#txtMatrixTarget').value = rec.matrixTarget || (m9 && m9.점검대상9x9) || mid;
  if ($('#txtMatrixSpec')) $('#txtMatrixSpec').value = rec.matrixSpec || (m9 && m9.가시설세부사양) || min;
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

  const productType = $('#selImportProductType')?.value || '공동주택';
  const progressRate = parseFloat($('#txtImportProgressRate')?.value || 35);
  const inspectedDate = $('#txtImportInspectDate')?.value || todayStr();
  const stage = determineStandardStage(progressRate, '', productType).name;

  const btn = $('#btnSaveImportedRecords');
  btn.disabled = true;
  btn.textContent = `저장 중 (0/${importedRecords.length})...`;

  try {
    // 현장 등록 확인
    let siteObj = store.sites.find(s => s.name === site);
    if (!siteObj) {
      siteObj = { name: site, progress: progressRate + '%', scale: '', amount: '' };
      store.sites.push(siteObj);
      await store.saveSites(store.sites);
      renderSites();
    }

    let savedCount = 0;
    for (const rec of importedRecords) {
      btn.textContent = `저장 중 (${++savedCount}/${importedRecords.length})...`;

      const m9 = (classifier && rec.content) ? classifier.classify(rec.content).result : null;
      const matrixArea = rec.matrixArea || (m9 && m9.점검영역9x9) || '';
      const matrixTarget = rec.matrixTarget || (m9 && m9.점검대상9x9) || '';
      const matrixSpec = rec.matrixSpec || (m9 && m9.가시설세부사양) || '';
      const rootCauseMgmt = rec.rootCauseMgmt || (m9 && m9.근본원인_관리감독) || '';
      const rootCauseSystem = rec.rootCauseSystem || (m9 && m9.근본원인_안전시스템) || '';
      const stakeholder = rec.stakeholder || (m9 && m9.관리책임주체) || '';

      const finalRecord = {
        site,
        productType,
        progressRate,
        stage,
        severity: rec.severity || '중부적합',
        subcontractor: rec.subcontractor || '',
        inspectRound: rec.inspectRound || '1차',
        siteInfo: {
          progress: progressRate + '%',
          scale: siteObj.scale || '',
          amount: siteObj.amount || ''
        },
        content: rec.content || '부적합 사항 지적',
        location: rec.location || '현장 작업구역',
        workName: rec.workName || '안전점검',
        workGroup: rec.workGroup || '가설공사',
        kind: rec.kind || '가시설',
        item: rec.item || '비계',
        agent: rec.agent || '수평재',
        type: rec.type || '추락',
        condition: (rec.mgmtCauses && rec.mgmtCauses[0]) || '방호장치 결함',
        action: '해당없음',
        matrixArea,
        matrixTarget,
        matrixSpec,
        rootCauseMgmt,
        rootCauseSystem,
        stakeholder,
        mgmtCauses: rec.mgmtCauses || ['불안전 상태'],
        holdPoint: !!rec.holdPoint,
        interviewOpinion: rec.interviewOpinion || '',
        auditProposal: rec.auditProposal || '',
        pmVerdict: rec.pmVerdict || '',
        workPlan: '해당없음',
        basis: {
          ra: '반영',
          cp: '해당없음',
          st: '해당없음',
          guide: '',
          law: filterOnlyOccupationalSafetyLaw(rec.law),
          점검영역9x9: matrixArea,
          점검대상9x9: matrixTarget,
          가시설세부사양: matrixSpec,
          근본원인_관리감독: rootCauseMgmt,
          근본원인_안전시스템: rootCauseSystem,
          관리책임주체: stakeholder
        },
        law: filterOnlyOccupationalSafetyLaw(rec.law),
        causes: ['물적', '관리적'],
        inspectedDate
      };

      // 사진 Blob 변환
      const mediaPhotos = [];
      for (const pUrl of (rec.photos || [])) {
        try {
          const res = await fetch(pUrl);
          const blob = await res.blob();
          mediaPhotos.push({ blob });
        } catch (e) {
          console.warn('Photo conversion error:', e);
        }
      }

      await store.saveRecord(finalRecord, { photos: mediaPhotos });
    }

    toast(`🎉 총 ${importedRecords.length}건의 부적합 대장이 성공적으로 저장되었습니다!`, 'success');
    importedRecords = [];
    if ($('#importPreviewArea')) $('#importPreviewArea').style.display = 'none';
    if ($('#filePptxImport')) $('#filePptxImport').value = '';

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
