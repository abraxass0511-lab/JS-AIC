/* eslint-disable no-useless-escape */
(function (root, factory) {
  let engine = null;
  if (typeof module === 'object' && module.exports) {
    try {
      engine = require('./ppt-template-engine.js');
    } catch (_) {
      engine = null;
    }
    module.exports = factory(root, engine);
  } else {
    root.SafeHtmlReport = factory(root, root.SafePPTTemplateEngine);
  }
})(typeof globalThis !== 'undefined' ? globalThis : window, function (root, nodeEngine) {
  'use strict';

  function resolveEngine(options) {
    const eng = (options && options.engine) || (root && root.SafePPTTemplateEngine) || nodeEngine;
    if (!eng || typeof eng.computeReportStats !== 'function') {
      throw new Error('SafePPTTemplateEngine이 로드되지 않았습니다.');
    }
    return eng;
  }

  function safeJsonForScript(data) {
    return JSON.stringify(data)
      .replace(/</g, '\\u003c')
      .replace(/>/g, '\\u003e')
      .replace(/&/g, '\\u0026')
      .replace(/\u2028/g, '\\u2028')
      .replace(/\u2029/g, '\\u2029')
      .replace(/-->/g, '--\\u003e');
  }

  function escapeHtmlText(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  async function collectPhotosForRecords(records, loadPhotoBase64) {
    const photoMap = {};
    const recordPhotoKeys = records.map((r) => {
      const candidates = [];
      if (Array.isArray(r.photos)) {
        r.photos.forEach((p) => { if (p) candidates.push(p); });
      }
      if (r.photoPath && !candidates.includes(r.photoPath)) candidates.push(r.photoPath);
      if (r.photo1 && !candidates.includes(r.photo1)) candidates.push(r.photo1);
      if (r.photo2 && !candidates.includes(r.photo2)) candidates.push(r.photo2);
      return candidates;
    });

    if (typeof loadPhotoBase64 !== 'function') {
      recordPhotoKeys.forEach((list) => {
        list.forEach((p) => {
          if (typeof p === 'string' && p.startsWith('data:image')) {
            photoMap[p] = p;
          }
        });
      });
      return { photoMap, recordPhotoKeys };
    }

    const uniquePaths = [];
    const seen = new Set();
    recordPhotoKeys.forEach((list) => {
      list.forEach((p) => {
        if (typeof p === 'string' && p.trim() && !seen.has(p)) {
          seen.add(p);
          uniquePaths.push(p);
        }
      });
    });

    const CONCURRENCY = 6;
    for (let i = 0; i < uniquePaths.length; i += CONCURRENCY) {
      const chunk = uniquePaths.slice(i, i + CONCURRENCY);
      await Promise.all(chunk.map(async (p) => {
        if (p.startsWith('data:image')) {
          photoMap[p] = p;
          return;
        }
        try {
          const b64 = await loadPhotoBase64(p);
          if (b64 && typeof b64 === 'string') {
            photoMap[p] = b64.startsWith('data:') ? b64 : `data:image/jpeg;base64,${b64}`;
          }
        } catch (_) {
          // 사진 로드 실패 시 해당 항목만 제외하고 계속 진행
        }
      }));
    }

    return { photoMap, recordPhotoKeys };
  }

  function normalizeRecordsForHtml(records, engine, recordPhotoKeys, photoMap, defaultSite, defaultInspector) {
    const internal = engine._internal || {};
    const normalizeHazardType = internal.normalizeHazardType || ((t) => String(t || '기타').trim() || '기타');
    const normalizeSeverity = internal.normalizeSeverity || ((r) => (r && r.severity) || '경');
    const getAgentLevels = internal.getAgentLevels || ((r) => ({
      major: (r && (r.agentMajor || r.kind)) || '가시설',
      mid: (r && (r.agentMid || r.item)) || '일반시설',
      minor: (r && (r.agentMinor || r.agent || r.location)) || '현장요인',
    }));
    const isUnsafeCondition = internal.isUnsafeCondition || ((r) => Boolean(r && r.condition));
    const isUnsafeAction = internal.isUnsafeAction || ((r) => Boolean(r && r.action));
    const isMeaningfulValue = internal.isMeaningfulValue || ((v) => Boolean(v && String(v).trim() && !/해당\s*없음|^-$/.test(String(v).trim())));
    const getRecordDateStr = internal.getRecordDateStr || ((r) => String((r && (r.inspectedDate || r.createdAt)) || '').slice(0, 10));
    const classifyPDCA = internal.classifyPDCA || (() => ['DO']);

    return records.map((r, i) => {
      const lv = getAgentLevels(r);
      const sv = normalizeSeverity(r);
      const locParts = [r.location, r.locationDetail].filter((x) => isMeaningfulValue(x)).map((x) => String(x).trim());
      const workGroup = isMeaningfulValue(r.workGroup) ? String(r.workGroup).trim() : '일반공종';
      const workNameRaw = isMeaningfulValue(r.workName) ? r.workName : (isMeaningfulValue(r.workMethod) ? r.workMethod : '');
      const workName = isMeaningfulValue(workNameRaw) ? String(workNameRaw).trim() : workGroup;
      const sub = isMeaningfulValue(r.subcontractor) ? String(r.subcontractor).trim() : '';
      const validPhotos = (recordPhotoKeys[i] || []).filter((k) => Boolean(photoMap[k]));

      return {
        idx: i + 1,
        id: r.id || `REC-${i + 1}`,
        date: getRecordDateStr(r) || '-',
        site: r.site || defaultSite || '-',
        subcontractor: sub,
        round: r.inspectRound || '',
        inspector: isMeaningfulValue(r.inspector) ? String(r.inspector).trim() : (defaultInspector || '안전관리자'),
        stage: r.stage || '',
        progressRate: r.progressRate != null ? `${r.progressRate}%` : ((r.siteInfo && r.siteInfo.progress) || ''),
        severity: sv,
        severityLabel: r.severity || `${sv}부적합`,
        status: r.status === '조치완료' ? '조치완료' : '미조치',
        holdPoint: Boolean(r.holdPoint),
        type: normalizeHazardType(r.type),
        rawType: r.type || normalizeHazardType(r.type),
        agentMajor: lv.major || '가시설',
        agentMid: lv.mid || '일반시설',
        agentMinor: lv.minor || '현장요인',
        workGroup,
        workName,
        location: locParts.length ? [...new Set(locParts)].join(' · ') : '위치 미지정',
        content: String(r.content || '').trim() || '(내용 미기재)',
        photoBanner: String(r.photoBanner || '').trim(),
        law: String(r.law || (r.basis && r.basis.law) || '').trim(),
        condition: isMeaningfulValue(r.condition) ? String(r.condition).trim() : '',
        action: isMeaningfulValue(r.action) ? String(r.action).trim() : '',
        hasCond: isUnsafeCondition(r),
        hasAct: isUnsafeAction(r),
        pdca: classifyPDCA(r),
        workPlan: isMeaningfulValue(r.workPlan) ? String(r.workPlan).trim() : '',
        rootCauseMgmt: String(r.rootCauseMgmt || (r.basis && r.basis.근본원인_관리감독) || '').trim(),
        rootCauseSystem: String(r.rootCauseSystem || (r.basis && r.basis.근본원인_안전시스템) || '').trim(),
        stakeholder: String(r.stakeholder || (r.basis && r.basis.관리책임주체) || '').trim(),
        interviewOpinion: String(r.interviewOpinion || '').trim(),
        auditProposal: String(r.auditProposal || '').trim(),
        pmVerdict: String(r.pmVerdict || '').trim(),
        inspectorOpinionType: String(r.inspectorOpinionType || '').trim(),
        mgmtCauses: Array.isArray(r.mgmtCauses) ? r.mgmtCauses.filter(isMeaningfulValue) : [],
        causes: Array.isArray(r.causes) ? r.causes.filter(isMeaningfulValue) : [],
        photoKeys: validPhotos,
      };
    });
  }

  function renderHtmlDocument(payload) {
    const titleEsc = escapeHtmlText(`${payload.meta.siteLabel} · ${payload.meta.periodLabel} 관리자용 상세 분석 보고서`);
    const generatedAtEsc = escapeHtmlText(payload.meta.generatedAt);
    const payloadJson = safeJsonForScript(payload);

    return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${titleEsc}</title>
  <style>
    :root {
      --navy: #0f294a;
      --blue: #1d4ed8;
      --blue-soft: #eff6ff;
      --red: #dc2626;
      --red-soft: #fef2f2;
      --amber: #d97706;
      --amber-soft: #fffbeb;
      --green: #059669;
      --green-soft: #ecfdf5;
      --slate-50: #f8fafc;
      --slate-100: #f1f5f9;
      --slate-200: #e2e8f0;
      --slate-400: #94a3b8;
      --slate-600: #475569;
      --slate-800: #1e293b;
      --shadow: 0 2px 10px rgba(15, 41, 74, 0.08);
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: 'Malgun Gothic', 'Pretendard', 'Apple SD Gothic Neo', sans-serif;
      background: #f1f5f9;
      color: var(--slate-800);
      line-height: 1.48;
      font-size: 14px;
    }
    .wrap { max-width: 1440px; margin: 0 auto; padding: 20px 24px 48px; }
    .hero {
      background: linear-gradient(135deg, #0f294a 0%, #1e40af 100%);
      color: #fff;
      border-radius: 14px;
      padding: 20px 26px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 14px;
      box-shadow: 0 8px 24px rgba(15, 41, 74, 0.18);
      margin-bottom: 18px;
    }
    .hero h1 { margin: 0 0 6px; font-size: 1.45rem; letter-spacing: -0.02em; }
    .hero-meta { font-size: 0.86rem; color: #dbeafe; display: flex; flex-wrap: wrap; gap: 14px; }
    .btn {
      border: 1px solid var(--slate-200);
      background: #fff;
      color: var(--slate-800);
      padding: 8px 14px;
      border-radius: 8px;
      font-weight: 600;
      font-size: 0.85rem;
      cursor: pointer;
      transition: all 0.15s ease;
    }
    .btn:hover { background: var(--slate-100); border-color: #cbd5e1; }
    .btn-primary { background: var(--blue); border-color: var(--blue); color: #fff; }
    .btn-primary:hover { background: #1e40af; }
    .btn-ghost { background: rgba(255,255,255,0.14); border-color: rgba(255,255,255,0.28); color: #fff; }
    .btn-ghost:hover { background: rgba(255,255,255,0.24); }
    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
      gap: 12px;
      margin-bottom: 18px;
    }
    .kpi-card {
      background: #fff;
      border: 2px solid transparent;
      border-radius: 12px;
      padding: 15px 18px;
      box-shadow: var(--shadow);
      cursor: pointer;
      transition: all 0.15s ease;
      text-align: left;
    }
    .kpi-card:hover { transform: translateY(-2px); border-color: #bfdbfe; }
    .kpi-card.active { border-color: var(--blue); background: #f0f7ff; }
    .kpi-label { font-size: 0.8rem; font-weight: 700; color: var(--slate-600); margin-bottom: 4px; }
    .kpi-val { font-size: 1.65rem; font-weight: 800; color: var(--navy); }
    .kpi-sub { font-size: 0.78rem; color: var(--slate-600); margin-top: 3px; }
    .kpi-card.danger .kpi-val { color: var(--red); }
    .kpi-card.warn .kpi-val { color: var(--amber); }
    .kpi-card.ok .kpi-val { color: var(--green); }
    .panel {
      background: #fff;
      border-radius: 14px;
      box-shadow: var(--shadow);
      padding: 18px 20px;
      margin-bottom: 18px;
    }
    .tabs {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      border-bottom: 2px solid var(--slate-100);
      padding-bottom: 12px;
      margin-bottom: 16px;
    }
    .tab-btn {
      padding: 9px 16px;
      border-radius: 9px;
      border: 1px solid var(--slate-200);
      background: var(--slate-50);
      color: var(--slate-600);
      font-weight: 700;
      font-size: 0.88rem;
      cursor: pointer;
    }
    .tab-btn.active {
      background: var(--navy);
      color: #fff;
      border-color: var(--navy);
    }
    .drill-grid-2 { display: grid; grid-template-columns: 1.15fr 1fr; gap: 16px; }
    .drill-grid-3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }
    @media (max-width: 980px) {
      .drill-grid-2, .drill-grid-3 { grid-template-columns: 1fr; }
    }
    .subbox {
      border: 1px solid var(--slate-200);
      border-radius: 10px;
      padding: 14px;
      background: var(--slate-50);
    }
    .subbox h3 {
      margin: 0 0 10px;
      font-size: 0.94rem;
      color: var(--navy);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .bar-item {
      background: #fff;
      border: 1px solid var(--slate-200);
      border-radius: 8px;
      padding: 9px 11px;
      margin-bottom: 7px;
      cursor: pointer;
      transition: all 0.12s ease;
    }
    .bar-item:hover { border-color: var(--blue); background: var(--blue-soft); }
    .bar-item.selected { border-color: var(--blue); background: #dbeafe; box-shadow: 0 0 0 2px rgba(29, 78, 216, 0.15); }
    .bar-top { display: flex; justify-content: space-between; align-items: center; gap: 8px; font-weight: 700; font-size: 0.86rem; }
    .bar-track { height: 7px; background: var(--slate-100); border-radius: 999px; overflow: hidden; margin-top: 6px; }
    .bar-fill { height: 100%; background: var(--blue); border-radius: 999px; }
    .chip-wrap { display: flex; flex-wrap: wrap; gap: 6px; }
    .pill-btn {
      border: 1px solid var(--slate-200);
      background: #fff;
      color: var(--slate-800);
      border-radius: 999px;
      padding: 5px 11px;
      font-size: 0.8rem;
      font-weight: 600;
      cursor: pointer;
    }
    .pill-btn:hover { border-color: var(--blue); color: var(--blue); }
    .pill-btn.selected { background: var(--blue); border-color: var(--blue); color: #fff; }
    .badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 999px;
      font-size: 0.74rem;
      font-weight: 700;
      white-space: nowrap;
    }
    .b-crit { background: #fee2e2; color: #b91c1c; }
    .b-mid { background: #fef3c7; color: #b45309; }
    .b-low { background: #e0f2fe; color: #0369a1; }
    .b-done { background: #d1fae5; color: #065f46; }
    .b-open { background: #ffe4e6; color: #be123c; }
    .b-hold { background: #ede9fe; color: #6d28d9; }
    .toolbar {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      align-items: center;
      margin-bottom: 12px;
    }
    .toolbar input, .toolbar select {
      border: 1px solid var(--slate-200);
      border-radius: 8px;
      padding: 8px 12px;
      font-size: 0.88rem;
      font-family: inherit;
    }
    .toolbar input { flex: 1; min-width: 240px; }
    .active-chips { display: flex; flex-wrap: wrap; gap: 7px; margin-bottom: 12px; align-items: center; }
    .active-chip {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: #dbeafe;
      color: #1e3a8a;
      border: 1px solid #93c5fd;
      padding: 4px 10px;
      border-radius: 999px;
      font-size: 0.8rem;
      font-weight: 700;
      cursor: pointer;
    }
    .table-wrap { overflow-x: auto; border: 1px solid var(--slate-200); border-radius: 10px; }
    table { width: 100%; border-collapse: collapse; min-width: 1000px; font-size: 0.84rem; }
    th {
      background: var(--navy);
      color: #fff;
      text-align: left;
      padding: 10px 10px;
      font-weight: 700;
      white-space: nowrap;
    }
    td {
      padding: 10px 10px;
      border-bottom: 1px solid var(--slate-100);
      vertical-align: top;
    }
    tbody tr { cursor: pointer; transition: background 0.1s ease; }
    tbody tr:hover { background: #f0f7ff; }
    .col-content { max-width: 340px; line-height: 1.42; }
    .muted { color: var(--slate-600); font-size: 0.78rem; }
    .modal-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(15, 23, 42, 0.62);
      display: none;
      align-items: center;
      justify-content: center;
      padding: 20px;
      z-index: 999;
    }
    .modal-backdrop.open { display: flex; }
    .modal {
      background: #fff;
      width: min(980px, 100%);
      max-height: 90vh;
      overflow-y: auto;
      border-radius: 16px;
      box-shadow: 0 20px 50px rgba(0, 0, 0, 0.35);
    }
    .modal-head {
      position: sticky;
      top: 0;
      background: var(--navy);
      color: #fff;
      padding: 15px 22px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
      z-index: 2;
    }
    .modal-body { padding: 20px 24px 26px; }
    .detail-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 10px;
      margin-bottom: 16px;
    }
    .detail-kv {
      background: var(--slate-50);
      border: 1px solid var(--slate-200);
      border-radius: 9px;
      padding: 10px 12px;
    }
    .detail-k { font-size: 0.75rem; font-weight: 700; color: var(--slate-600); margin-bottom: 3px; }
    .detail-v { font-size: 0.9rem; font-weight: 700; color: var(--slate-800); word-break: break-word; }
    .detail-sec {
      border: 1px solid var(--slate-200);
      border-radius: 10px;
      padding: 14px 16px;
      margin-bottom: 12px;
      background: #fff;
    }
    .detail-sec h4 { margin: 0 0 7px; font-size: 0.92rem; color: var(--navy); }
    .detail-sec p { margin: 0; white-space: pre-wrap; word-break: break-word; font-size: 0.9rem; }
    .photo-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 12px; margin-top: 8px; }
    .photo-grid img { width: 100%; max-height: 360px; object-fit: contain; border-radius: 8px; border: 1px solid var(--slate-200); background: #0f172a; }
    .empty-msg { text-align: center; padding: 32px 16px; color: var(--slate-600); }
    @media print {
      .no-print { display: none !important; }
      body { background: #fff; }
      .panel, .kpi-card { box-shadow: none; border: 1px solid #cbd5e1; }
    }
  </style>
</head>
<body>
  <div class="wrap">
    <header class="hero">
      <div>
        <h1 id="reportTitle">관리자용 안전점검 상세 분석 보고서</h1>
        <div class="hero-meta">
          <span>현장: <strong id="metaSite">-</strong></span>
          <span>대상기간: <strong id="metaPeriod">-</strong></span>
          <span>점검책임: <strong id="metaInspector">-</strong></span>
          <span>생성일시: <strong>${generatedAtEsc}</strong></span>
        </div>
      </div>
      <div class="no-print" style="display:flex; gap:8px;">
        <button type="button" class="btn btn-ghost" onclick="window.print()">🖨️ 인쇄 / PDF 저장</button>
      </div>
    </header>

    <section class="kpi-grid" id="kpiGrid"></section>

    <section class="panel">
      <div class="tabs no-print" id="drillTabs">
        <button type="button" class="tab-btn active" data-tab="hazard">① 위험유형별 드릴다운</button>
        <button type="button" class="tab-btn" data-tab="agent">② 기인물 3단계(대→중→소)</button>
        <button type="button" class="tab-btn" data-tab="work">③ 공종·세부작업별 분석</button>
        <button type="button" class="tab-btn" data-tab="loc">④ 작업장소·협력사별</button>
        <button type="button" class="tab-btn" data-tab="cause">⑤ 불안전 상태/행동·PDCA</button>
      </div>
      <div id="drillBody"></div>
    </section>

    <section class="panel">
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; margin-bottom:10px;">
        <h2 style="margin:0; font-size:1.08rem; color:var(--navy);">📋 부적합 상세 목록 (<span id="filteredCount">0</span>건 / 전체 <span id="totalCount">0</span>건)</h2>
        <span class="muted">행을 클릭하면 관련기준·인터뷰·개선대책·현장사진 전체 내용을 볼 수 있습니다.</span>
      </div>
      <div class="toolbar no-print">
        <input type="text" id="searchInput" placeholder="내용, 기인물, 공종, 작업장소, 관련기준, 인터뷰 내용 검색..." />
        <select id="severitySelect">
          <option value="">전체 등급</option>
          <option value="HIGH">고위험 (중대+중)</option>
          <option value="중대">중대부적합</option>
          <option value="중">중부적합</option>
          <option value="경">경부적합</option>
          <option value="공지">공지</option>
        </select>
        <select id="statusSelect">
          <option value="">조치상태 전체</option>
          <option value="미조치">미조치</option>
          <option value="조치완료">조치완료</option>
        </select>
        <button type="button" class="btn" id="btnResetFilters">전체 필터 초기화</button>
      </div>
      <div class="active-chips" id="activeChips"></div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>No</th>
              <th>점검일</th>
              <th>현장 / 협력사</th>
              <th>유형</th>
              <th>등급</th>
              <th>기인물 (대 &gt; 중 &gt; 소)</th>
              <th>공종 / 세부작업</th>
              <th>작업장소</th>
              <th>부적합 내용</th>
              <th>상태</th>
              <th>사진</th>
            </tr>
          </thead>
          <tbody id="recordsTbody"></tbody>
        </table>
      </div>
    </section>
  </div>

  <div class="modal-backdrop" id="detailModal">
    <div class="modal" role="dialog" aria-modal="true">
      <div class="modal-head">
        <div id="modalTitle" style="font-weight:800; font-size:1.05rem;">부적합 상세 정보</div>
        <div style="display:flex; gap:8px; align-items:center;">
          <button type="button" class="btn btn-ghost" id="btnModalPrev">← 이전</button>
          <button type="button" class="btn btn-ghost" id="btnModalNext">다음 →</button>
          <button type="button" class="btn btn-ghost" id="btnModalClose">✕ 닫기</button>
        </div>
      </div>
      <div class="modal-body" id="modalBody"></div>
    </div>
  </div>

  <script>
    const REPORT_DATA = ${payloadJson};

    const state = {
      tab: 'hazard',
      search: '',
      severity: '',
      status: '',
      holdOnly: false,
      type: '',
      agentMajor: '',
      agentMid: '',
      agentMinor: '',
      workGroup: '',
      workName: '',
      location: '',
      subcontractor: '',
      pdca: '',
      causeType: '',
      causeTag: '',
      filtered: [],
      modalPos: -1,
    };

    function esc(s) {
      return String(s == null ? '' : s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    }

    function countBy(arr, keyFn) {
      const m = new Map();
      arr.forEach((item) => {
        const k = keyFn(item);
        if (!k) return;
        const cur = m.get(k) || { name: k, count: 0, high: 0, open: 0, fixed: 0 };
        cur.count++;
        if (item.severity === '중대' || item.severity === '중') cur.high++;
        if (item.status === '조치완료') cur.fixed++;
        else cur.open++;
        m.set(k, cur);
      });
      return Array.from(m.values()).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'ko'));
    }

    function getFilteredRecords(ignoreKeys = []) {
      const ignore = new Set(ignoreKeys);
      const q = state.search.trim().toLowerCase();
      return REPORT_DATA.records.filter((r) => {
        if (!ignore.has('severity') && state.severity) {
          if (state.severity === 'HIGH') {
            if (r.severity !== '중대' && r.severity !== '중') return false;
          } else if (r.severity !== state.severity) {
            return false;
          }
        }
        if (!ignore.has('status') && state.status && r.status !== state.status) return false;
        if (!ignore.has('holdOnly') && state.holdOnly && !r.holdPoint) return false;
        if (!ignore.has('type') && state.type && r.type !== state.type) return false;
        if (!ignore.has('agentMajor') && state.agentMajor && r.agentMajor !== state.agentMajor) return false;
        if (!ignore.has('agentMid') && state.agentMid && r.agentMid !== state.agentMid) return false;
        if (!ignore.has('agentMinor') && state.agentMinor && r.agentMinor !== state.agentMinor) return false;
        if (!ignore.has('workGroup') && state.workGroup && r.workGroup !== state.workGroup) return false;
        if (!ignore.has('workName') && state.workName && r.workName !== state.workName) return false;
        if (!ignore.has('location') && state.location && r.location !== state.location) return false;
        if (!ignore.has('subcontractor') && state.subcontractor) {
          const subLabel = r.subcontractor || '(협력사 미기재)';
          if (subLabel !== state.subcontractor) return false;
        }
        if (!ignore.has('pdca') && state.pdca && (!Array.isArray(r.pdca) || !r.pdca.includes(state.pdca))) return false;
        if (!ignore.has('causeType') && state.causeType === 'COND' && !r.hasCond) return false;
        if (!ignore.has('causeType') && state.causeType === 'ACT' && !r.hasAct) return false;
        if (!ignore.has('causeTag') && state.causeTag) {
          const hasTag = r.condition === state.causeTag || r.action === state.causeTag;
          if (!hasTag) return false;
        }
        if (!ignore.has('search') && q) {
          const hay = [
            r.site, r.subcontractor, r.type, r.agentMajor, r.agentMid, r.agentMinor,
            r.workGroup, r.workName, r.location, r.content, r.law, r.condition,
            r.action, r.interviewOpinion, r.auditProposal, r.pmVerdict,
            r.rootCauseMgmt, r.rootCauseSystem
          ].join(' ').toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      });
    }

    function sevBadge(sv, label) {
      const cls = sv === '중대' ? 'b-crit' : (sv === '중' ? 'b-mid' : 'b-low');
      return '<span class="badge ' + cls + '">' + esc(label || sv) + '</span>';
    }

    function renderKpis() {
      const m = REPORT_DATA.meta;
      const cards = [
        { key: 'ALL', label: '전체 지적건수', val: m.total + '건', sub: '클릭 시 전체 필터 초기화', cls: '', active: !state.severity && !state.status && !state.holdOnly },
        { key: 'HIGH', label: '고위험 (중대 + 중)', val: m.highRisk + '건', sub: '중대 ' + m.sevCrit + ' · 중부적합 ' + m.sevMid, cls: 'danger', active: state.severity === 'HIGH' },
        { key: 'OPEN', label: '미조치 지적건수', val: m.unfixed + '건', sub: '조치완료 ' + m.fixed + '건', cls: 'warn', active: state.status === '미조치' },
        { key: 'HOLD', label: 'Hold Point 위반', val: m.holdCount + '건', sub: '즉시 작업중지·확인 대상', cls: 'danger', active: state.holdOnly },
        { key: 'DONE', label: '조치완료율', val: m.fixRate + '%', sub: '경부적합 ' + m.sevLow + '건 포함', cls: 'ok', active: state.status === '조치완료' },
      ];
      document.getElementById('kpiGrid').innerHTML = cards.map((c) =>
        '<button type="button" class="kpi-card ' + c.cls + (c.active ? ' active' : '') + '" data-kpi="' + c.key + '">' +
        '<div class="kpi-label">' + esc(c.label) + '</div>' +
        '<div class="kpi-val">' + esc(c.val) + '</div>' +
        '<div class="kpi-sub">' + esc(c.sub) + '</div>' +
        '</button>'
      ).join('');
      document.querySelectorAll('[data-kpi]').forEach((el) => {
        el.addEventListener('click', () => {
          const k = el.getAttribute('data-kpi');
          if (k === 'ALL') { resetAllFilters(); return; }
          if (k === 'HIGH') state.severity = state.severity === 'HIGH' ? '' : 'HIGH';
          if (k === 'OPEN') state.status = state.status === '미조치' ? '' : '미조치';
          if (k === 'DONE') state.status = state.status === '조치완료' ? '' : '조치완료';
          if (k === 'HOLD') state.holdOnly = !state.holdOnly;
          syncInputsAndRender();
        });
      });
    }

    function renderBarList(items, maxVal, activeVal, attrName, showHigh) {
      if (!items.length) return '<div class="empty-msg">해당 항목이 없습니다.</div>';
      const denom = Math.max(1, maxVal || items[0].count);
      return items.map((it) => {
        const w = Math.max(4, Math.round((it.count / denom) * 100));
        const rate = Math.round((it.fixed / Math.max(1, it.count)) * 100);
        const sel = activeVal === it.name ? ' selected' : '';
        return '<div class="bar-item' + sel + '" data-' + attrName + '="' + esc(it.name) + '">' +
          '<div class="bar-top"><span>' + esc(it.name) + '</span><span>' + it.count + '건' +
          (showHigh && it.high ? ' <small style="color:#dc2626">(고위험 ' + it.high + ')</small>' : '') +
          ' <small class="muted">· 조치 ' + rate + '%</small></span></div>' +
          '<div class="bar-track"><div class="bar-fill" style="width:' + w + '%"></div></div>' +
          '</div>';
      }).join('');
    }

    function renderDrillDown() {
      const box = document.getElementById('drillBody');
      const all = REPORT_DATA.records;

      if (state.tab === 'hazard') {
        const hazards = countBy(all, (r) => r.type);
        const targetType = state.type || (hazards[0] && hazards[0].name) || '';
        const scoped = targetType ? all.filter((r) => r.type === targetType) : all;
        const agents = countBy(scoped, (r) => r.agentMinor);
        const works = countBy(scoped, (r) => r.workGroup + ' / ' + r.workName);
        const locs = countBy(scoped, (r) => r.location);

        box.innerHTML =
          '<div class="drill-grid-2">' +
            '<div class="subbox"><h3><span>위험유형 분포 (클릭하여 상세 드릴다운)</span><span class="muted">전체 ' + all.length + '건</span></h3>' +
              renderBarList(hazards, all.length, state.type, 'haz', true) +
            '</div>' +
            '<div class="subbox"><h3><span>[' + esc(targetType || '전체') + '] 세부 기인물·작업·장소 (' + scoped.length + '건)</span>' +
              (state.type ? '<button type="button" class="pill-btn" id="btnClearHaz">유형 선택 해제</button>' : '') +
            '</h3>' +
              '<div style="margin-bottom:12px;"><div class="muted" style="font-weight:700;margin-bottom:6px;">▸ 주요 기인물 (소분류) — 클릭 시 기인물 필터</div>' +
              '<div class="chip-wrap">' + agents.slice(0, 12).map((a) =>
                '<button type="button" class="pill-btn' + (state.agentMinor === a.name ? ' selected' : '') + '" data-haz-minor="' + esc(a.name) + '">' + esc(a.name) + ' (' + a.count + ')</button>'
              ).join('') + '</div></div>' +
              '<div style="margin-bottom:12px;"><div class="muted" style="font-weight:700;margin-bottom:6px;">▸ 연관 공종·세부작업 — 클릭 시 작업 필터</div>' +
              '<div class="chip-wrap">' + works.slice(0, 10).map((w) =>
                '<button type="button" class="pill-btn' + (state.workName === w.name.split(' / ')[1] ? ' selected' : '') + '" data-haz-work="' + esc(w.name) + '">' + esc(w.name) + ' (' + w.count + ')</button>'
              ).join('') + '</div></div>' +
              '<div><div class="muted" style="font-weight:700;margin-bottom:6px;">▸ 다발 작업장소 — 클릭 시 장소 필터</div>' +
              '<div class="chip-wrap">' + locs.slice(0, 10).map((l) =>
                '<button type="button" class="pill-btn' + (state.location === l.name ? ' selected' : '') + '" data-haz-loc="' + esc(l.name) + '">' + esc(l.name) + ' (' + l.count + ')</button>'
              ).join('') + '</div></div>' +
            '</div>' +
          '</div>';

        box.querySelectorAll('[data-haz]').forEach((el) => {
          el.addEventListener('click', () => {
            const v = el.getAttribute('data-haz');
            state.type = state.type === v ? '' : v;
            syncInputsAndRender();
          });
        });
        document.getElementById('btnClearHaz')?.addEventListener('click', () => { state.type = ''; syncInputsAndRender(); });
        box.querySelectorAll('[data-haz-minor]').forEach((el) => {
          el.addEventListener('click', () => {
            if (!state.type && targetType) state.type = targetType;
            const v = el.getAttribute('data-haz-minor');
            state.agentMinor = state.agentMinor === v ? '' : v;
            syncInputsAndRender();
          });
        });
        box.querySelectorAll('[data-haz-work]').forEach((el) => {
          el.addEventListener('click', () => {
            if (!state.type && targetType) state.type = targetType;
            const parts = el.getAttribute('data-haz-work').split(' / ');
            state.workGroup = parts[0] || '';
            state.workName = state.workName === parts[1] ? '' : (parts[1] || '');
            syncInputsAndRender();
          });
        });
        box.querySelectorAll('[data-haz-loc]').forEach((el) => {
          el.addEventListener('click', () => {
            if (!state.type && targetType) state.type = targetType;
            const v = el.getAttribute('data-haz-loc');
            state.location = state.location === v ? '' : v;
            syncInputsAndRender();
          });
        });
        return;
      }

      if (state.tab === 'agent') {
        const majors = countBy(all, (r) => r.agentMajor);
        const selMaj = state.agentMajor || (majors[0] && majors[0].name) || '';
        const mids = countBy(all.filter((r) => !selMaj || r.agentMajor === selMaj), (r) => r.agentMid);
        const selMid = state.agentMid || (mids[0] && mids[0].name) || '';
        const minors = countBy(all.filter((r) => (!selMaj || r.agentMajor === selMaj) && (!selMid || r.agentMid === selMid)), (r) => r.agentMinor);

        box.innerHTML =
          '<div class="drill-grid-3">' +
            '<div class="subbox"><h3><span>1단계: 기인물 대분류</span><span class="muted">' + majors.length + '종</span></h3>' +
              renderBarList(majors, all.length, state.agentMajor, 'amaj', true) + '</div>' +
            '<div class="subbox"><h3><span>2단계: 중분류 (' + esc(selMaj || '전체') + ')</span><span class="muted">' + mids.length + '종</span></h3>' +
              renderBarList(mids, Math.max(1, mids[0] && mids[0].count), state.agentMid, 'amid', true) + '</div>' +
            '<div class="subbox"><h3><span>3단계: 세부 기인물 (' + esc(selMid || '전체') + ')</span><span class="muted">' + minors.length + '종</span></h3>' +
              renderBarList(minors, Math.max(1, minors[0] && minors[0].count), state.agentMinor, 'amin', true) + '</div>' +
          '</div>';

        box.querySelectorAll('[data-amaj]').forEach((el) => {
          el.addEventListener('click', () => {
            const v = el.getAttribute('data-amaj');
            state.agentMajor = state.agentMajor === v ? '' : v;
            state.agentMid = '';
            state.agentMinor = '';
            syncInputsAndRender();
          });
        });
        box.querySelectorAll('[data-amid]').forEach((el) => {
          el.addEventListener('click', () => {
            if (!state.agentMajor && selMaj) state.agentMajor = selMaj;
            const v = el.getAttribute('data-amid');
            state.agentMid = state.agentMid === v ? '' : v;
            state.agentMinor = '';
            syncInputsAndRender();
          });
        });
        box.querySelectorAll('[data-amin]').forEach((el) => {
          el.addEventListener('click', () => {
            if (!state.agentMajor && selMaj) state.agentMajor = selMaj;
            if (!state.agentMid && selMid) state.agentMid = selMid;
            const v = el.getAttribute('data-amin');
            state.agentMinor = state.agentMinor === v ? '' : v;
            syncInputsAndRender();
          });
        });
        return;
      }

      if (state.tab === 'work') {
        const groups = countBy(all, (r) => r.workGroup);
        const selGrp = state.workGroup || (groups[0] && groups[0].name) || '';
        const scoped = selGrp ? all.filter((r) => r.workGroup === selGrp) : all;
        const works = countBy(scoped, (r) => r.workName);

        box.innerHTML =
          '<div class="drill-grid-2">' +
            '<div class="subbox"><h3><span>공종별 발생현황 (작업분류표 기준)</span><span class="muted">' + groups.length + '개 공종</span></h3>' +
              renderBarList(groups, all.length, state.workGroup, 'wg', true) + '</div>' +
            '<div class="subbox"><h3><span>[' + esc(selGrp || '전체') + '] 세부 작업별 내역</span><span class="muted">' + scoped.length + '건</span></h3>' +
              renderBarList(works, Math.max(1, works[0] && works[0].count), state.workName, 'wn', true) + '</div>' +
          '</div>';

        box.querySelectorAll('[data-wg]').forEach((el) => {
          el.addEventListener('click', () => {
            const v = el.getAttribute('data-wg');
            state.workGroup = state.workGroup === v ? '' : v;
            state.workName = '';
            syncInputsAndRender();
          });
        });
        box.querySelectorAll('[data-wn]').forEach((el) => {
          el.addEventListener('click', () => {
            if (!state.workGroup && selGrp) state.workGroup = selGrp;
            const v = el.getAttribute('data-wn');
            state.workName = state.workName === v ? '' : v;
            syncInputsAndRender();
          });
        });
        return;
      }

      if (state.tab === 'loc') {
        const locs = countBy(all, (r) => r.location);
        const subs = countBy(all, (r) => r.subcontractor || '(협력사 미기재)');
        box.innerHTML =
          '<div class="drill-grid-2">' +
            '<div class="subbox"><h3><span>작업장소별 발생 순위</span><span class="muted">' + locs.length + '개소</span></h3>' +
              renderBarList(locs.slice(0, 14), all.length, state.location, 'loc', true) + '</div>' +
            '<div class="subbox"><h3><span>협력사별 지적 및 조치현황</span><span class="muted">' + subs.length + '개사</span></h3>' +
              renderBarList(subs.slice(0, 14), all.length, state.subcontractor, 'sub', true) + '</div>' +
          '</div>';
        box.querySelectorAll('[data-loc]').forEach((el) => {
          el.addEventListener('click', () => {
            const v = el.getAttribute('data-loc');
            state.location = state.location === v ? '' : v;
            syncInputsAndRender();
          });
        });
        box.querySelectorAll('[data-sub]').forEach((el) => {
          el.addEventListener('click', () => {
            const v = el.getAttribute('data-sub');
            state.subcontractor = state.subcontractor === v ? '' : v;
            syncInputsAndRender();
          });
        });
        return;
      }

      // tab === 'cause'
      const condItems = countBy(all.filter((r) => r.condition), (r) => r.condition);
      const actItems = countBy(all.filter((r) => r.action), (r) => r.action);
      const pdcaItems = ['PLAN', 'DO', 'CHECK', 'ACTION'].map((ph) => {
        const recs = all.filter((r) => r.pdca.includes(ph));
        return {
          name: ph,
          count: recs.length,
          high: recs.filter((r) => r.severity === '중대' || r.severity === '중').length,
          fixed: recs.filter((r) => r.status === '조치완료').length,
        };
      });
      const condCnt = all.filter((r) => r.hasCond).length;
      const actCnt = all.filter((r) => r.hasAct).length;

      box.innerHTML =
        '<div class="drill-grid-3">' +
          '<div class="subbox"><h3><span>불안전 상태 (' + condCnt + '건)</span>' +
            '<button type="button" class="pill-btn' + (state.causeType === 'COND' ? ' selected' : '') + '" id="btnFilterCond">상태 전체보기</button></h3>' +
            renderBarList(condItems.slice(0, 10), Math.max(1, condCnt), state.causeTag, 'ctag', true) + '</div>' +
          '<div class="subbox"><h3><span>불안전 행동 (' + actCnt + '건)</span>' +
            '<button type="button" class="pill-btn' + (state.causeType === 'ACT' ? ' selected' : '') + '" id="btnFilterAct">행동 전체보기</button></h3>' +
            renderBarList(actItems.slice(0, 10), Math.max(1, actCnt), state.causeTag, 'ctag', true) + '</div>' +
          '<div class="subbox"><h3><span>PDCA 단계별 결함 분포</span><span class="muted">중복 포함</span></h3>' +
            renderBarList(pdcaItems, all.length, state.pdca, 'pdca', true) + '</div>' +
        '</div>';

      document.getElementById('btnFilterCond')?.addEventListener('click', () => {
        state.causeType = state.causeType === 'COND' ? '' : 'COND';
        syncInputsAndRender();
      });
      document.getElementById('btnFilterAct')?.addEventListener('click', () => {
        state.causeType = state.causeType === 'ACT' ? '' : 'ACT';
        syncInputsAndRender();
      });
      box.querySelectorAll('[data-ctag]').forEach((el) => {
        el.addEventListener('click', () => {
          const v = el.getAttribute('data-ctag');
          state.causeTag = state.causeTag === v ? '' : v;
          syncInputsAndRender();
        });
      });
      box.querySelectorAll('[data-pdca]').forEach((el) => {
        el.addEventListener('click', () => {
          const v = el.getAttribute('data-pdca');
          state.pdca = state.pdca === v ? '' : v;
          syncInputsAndRender();
        });
      });
    }

    function renderActiveChips() {
      const defs = [
        ['severity', '등급', state.severity === 'HIGH' ? '고위험(중대+중)' : state.severity],
        ['status', '상태', state.status],
        ['holdOnly', 'Hold Point', state.holdOnly ? '위반만' : ''],
        ['type', '위험유형', state.type],
        ['agentMajor', '기인물(대)', state.agentMajor],
        ['agentMid', '기인물(중)', state.agentMid],
        ['agentMinor', '기인물(소)', state.agentMinor],
        ['workGroup', '공종', state.workGroup],
        ['workName', '작업명', state.workName],
        ['location', '장소', state.location],
        ['subcontractor', '협력사', state.subcontractor],
        ['pdca', 'PDCA', state.pdca],
        ['causeType', '원인구분', state.causeType === 'COND' ? '불안전 상태' : (state.causeType === 'ACT' ? '불안전 행동' : '')],
        ['causeTag', '세부원인', state.causeTag],
        ['search', '검색어', state.search.trim()],
      ].filter((x) => Boolean(x[2]));

      const container = document.getElementById('activeChips');
      if (!defs.length) {
        container.innerHTML = '<span class="muted">적용된 세부 필터 없음 (전체 데이터 표시 중)</span>';
        return;
      }
      container.innerHTML = defs.map(([k, lbl, val]) =>
        '<button type="button" class="active-chip" data-clear="' + k + '">' + esc(lbl) + ': ' + esc(val) + ' ✕</button>'
      ).join('');
      container.querySelectorAll('[data-clear]').forEach((el) => {
        el.addEventListener('click', () => {
          const k = el.getAttribute('data-clear');
          if (k === 'holdOnly') state.holdOnly = false;
          else state[k] = '';
          syncInputsAndRender();
        });
      });
    }

    function renderTable() {
      state.filtered = getFilteredRecords();
      document.getElementById('totalCount').textContent = String(REPORT_DATA.records.length);
      document.getElementById('filteredCount').textContent = String(state.filtered.length);
      const tbody = document.getElementById('recordsTbody');

      if (!state.filtered.length) {
        tbody.innerHTML = '<tr><td colspan="11" class="empty-msg">조건에 일치하는 부적합 항목이 없습니다.</td></tr>';
        return;
      }

      tbody.innerHTML = state.filtered.map((r, pos) =>
        '<tr data-pos="' + pos + '">' +
          '<td><strong>' + r.idx + '</strong></td>' +
          '<td style="white-space:nowrap;">' + esc(r.date) + '</td>' +
          '<td><div>' + esc(r.site) + '</div><div class="muted">' + esc(r.subcontractor || '-') + '</div></td>' +
          '<td><strong>' + esc(r.type) + '</strong></td>' +
          '<td>' + sevBadge(r.severity, r.severityLabel) + (r.holdPoint ? '<div><span class="badge b-hold" style="margin-top:3px;">Hold Point</span></div>' : '') + '</td>' +
          '<td><div style="font-weight:700;">' + esc(r.agentMinor) + '</div><div class="muted">' + esc(r.agentMajor + ' > ' + r.agentMid) + '</div></td>' +
          '<td><div>' + esc(r.workGroup) + '</div><div class="muted">' + esc(r.workName) + '</div></td>' +
          '<td>' + esc(r.location) + '</td>' +
          '<td class="col-content">' + esc(r.content) + '</td>' +
          '<td><span class="badge ' + (r.status === '조치완료' ? 'b-done' : 'b-open') + '">' + esc(r.status) + '</span></td>' +
          '<td style="white-space:nowrap;">' + (r.photoKeys.length ? '📷 ' + r.photoKeys.length + '장' : '-') + '</td>' +
        '</tr>'
      ).join('');

      tbody.querySelectorAll('tr[data-pos]').forEach((tr) => {
        tr.addEventListener('click', () => {
          openModal(Number(tr.getAttribute('data-pos')));
        });
      });
    }

    function openModal(pos) {
      if (pos < 0 || pos >= state.filtered.length) return;
      state.modalPos = pos;
      const r = state.filtered[pos];
      document.getElementById('modalTitle').innerHTML =
        '#' + r.idx + ' [' + esc(r.type) + '] ' + sevBadge(r.severity, r.severityLabel) +
        ' <span class="badge ' + (r.status === '조치완료' ? 'b-done' : 'b-open') + '">' + esc(r.status) + '</span>';

      const photosHtml = r.photoKeys.length
        ? '<div class="photo-grid">' + r.photoKeys.map((k) => {
            const src = REPORT_DATA.photos[k] || '';
            return src ? '<img src="' + src + '" alt="현장사진" />' : '';
          }).join('') + '</div>'
        : '<p class="muted">첨부된 현장사진이 없습니다.</p>';

      const causeLines = [
        r.condition ? '• 불안전 상태: ' + r.condition : '',
        r.action ? '• 불안전 행동: ' + r.action : '',
        r.rootCauseMgmt ? '• 관리감독 원인: ' + r.rootCauseMgmt : '',
        r.rootCauseSystem ? '• 안전시스템 원인: ' + r.rootCauseSystem : '',
        r.stakeholder ? '• 책임 주체: ' + r.stakeholder : '',
        r.interviewOpinion ? '• 현장 인터뷰(근로자·관리자):\\n' + r.interviewOpinion : '',
      ].filter(Boolean).join('\\n');

      const actionLines = [
        r.auditProposal ? '• 점검단 제안 / 개선대책:\\n' + r.auditProposal : '',
        r.pmVerdict ? '• PM 판정결과: ' + r.pmVerdict : '',
        r.inspectorOpinionType ? '• 개선유형: ' + r.inspectorOpinionType : '',
      ].filter(Boolean).join('\\n');

      document.getElementById('modalBody').innerHTML =
        '<div class="detail-grid">' +
          '<div class="detail-kv"><div class="detail-k">현장 / 협력사</div><div class="detail-v">' + esc(r.site) + (r.subcontractor ? ' · ' + esc(r.subcontractor) : '') + '</div></div>' +
          '<div class="detail-kv"><div class="detail-k">점검일 / 차수 / 점검자</div><div class="detail-v">' + esc(r.date) + (r.round ? ' · ' + esc(r.round) : '') + ' · ' + esc(r.inspector) + '</div></div>' +
          '<div class="detail-kv"><div class="detail-k">기인물 (대 &gt; 중 &gt; 소)</div><div class="detail-v">' + esc(r.agentMajor + ' > ' + r.agentMid + ' > ' + r.agentMinor) + '</div></div>' +
          '<div class="detail-kv"><div class="detail-k">공종 / 세부작업 / 장소</div><div class="detail-v">' + esc(r.workGroup + ' / ' + r.workName + ' / ' + r.location) + '</div></div>' +
          '<div class="detail-kv"><div class="detail-k">PDCA 단계 / Hold Point</div><div class="detail-v">' + esc(r.pdca.join(', ')) + (r.holdPoint ? ' · Hold Point 위반' : '') + '</div></div>' +
          '<div class="detail-kv"><div class="detail-k">공정단계 / 공정률</div><div class="detail-v">' + esc(r.stage || '-') + (r.progressRate ? ' (' + esc(r.progressRate) + ')' : '') + '</div></div>' +
        '</div>' +
        '<div class="detail-sec"><h4>📌 부적합 내용' + (r.photoBanner ? ' (' + esc(r.photoBanner) + ')' : '') + '</h4><p>' + esc(r.content) + '</p></div>' +
        '<div class="detail-sec"><h4>⚖️ 관련기준 / 산업안전보건법</h4><p>' + esc(r.law || '기재된 관련기준이 없습니다.') + '</p></div>' +
        '<div class="detail-sec"><h4>🔍 발생원인 및 현장 인터뷰</h4><p>' + esc(causeLines || '기재된 원인·인터뷰 정보가 없습니다.') + '</p></div>' +
        '<div class="detail-sec"><h4>🛡️ 개선대책 및 PM 판정</h4><p>' + esc(actionLines || '기재된 개선대책 정보가 없습니다.') + '</p></div>' +
        '<div class="detail-sec"><h4>📷 현장 실사 사진</h4>' + photosHtml + '</div>';

      document.getElementById('detailModal').classList.add('open');
      document.getElementById('btnModalPrev').disabled = pos <= 0;
      document.getElementById('btnModalNext').disabled = pos >= state.filtered.length - 1;
    }

    function resetAllFilters() {
      state.search = '';
      state.severity = '';
      state.status = '';
      state.holdOnly = false;
      state.type = '';
      state.agentMajor = '';
      state.agentMid = '';
      state.agentMinor = '';
      state.workGroup = '';
      state.workName = '';
      state.location = '';
      state.subcontractor = '';
      state.pdca = '';
      state.causeType = '';
      state.causeTag = '';
      syncInputsAndRender();
    }

    function syncInputsAndRender() {
      document.getElementById('searchInput').value = state.search;
      document.getElementById('severitySelect').value = state.severity;
      document.getElementById('statusSelect').value = state.status;
      document.querySelectorAll('#drillTabs .tab-btn').forEach((btn) => {
        btn.classList.toggle('active', btn.getAttribute('data-tab') === state.tab);
      });
      renderKpis();
      renderDrillDown();
      renderActiveChips();
      renderTable();
    }

    document.getElementById('reportTitle').textContent = REPORT_DATA.meta.title;
    document.getElementById('metaSite').textContent = REPORT_DATA.meta.siteLabel;
    document.getElementById('metaPeriod').textContent = REPORT_DATA.meta.periodLabel;
    document.getElementById('metaInspector').textContent = REPORT_DATA.meta.inspector;

    document.querySelectorAll('#drillTabs .tab-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.tab = btn.getAttribute('data-tab');
        syncInputsAndRender();
      });
    });
    document.getElementById('searchInput').addEventListener('input', (e) => {
      state.search = e.target.value;
      syncInputsAndRender();
    });
    document.getElementById('severitySelect').addEventListener('change', (e) => {
      state.severity = e.target.value;
      syncInputsAndRender();
    });
    document.getElementById('statusSelect').addEventListener('change', (e) => {
      state.status = e.target.value;
      syncInputsAndRender();
    });
    document.getElementById('btnResetFilters').addEventListener('click', resetAllFilters);
    document.getElementById('btnModalClose').addEventListener('click', () => {
      document.getElementById('detailModal').classList.remove('open');
    });
    document.getElementById('detailModal').addEventListener('click', (e) => {
      if (e.target.id === 'detailModal') document.getElementById('detailModal').classList.remove('open');
    });
    document.getElementById('btnModalPrev').addEventListener('click', () => {
      if (state.modalPos > 0) openModal(state.modalPos - 1);
    });
    document.getElementById('btnModalNext').addEventListener('click', () => {
      if (state.modalPos < state.filtered.length - 1) openModal(state.modalPos + 1);
    });
    document.addEventListener('keydown', (e) => {
      const modalOpen = document.getElementById('detailModal').classList.contains('open');
      if (!modalOpen) return;
      if (e.key === 'Escape') document.getElementById('detailModal').classList.remove('open');
      if (e.key === 'ArrowLeft' && state.modalPos > 0) openModal(state.modalPos - 1);
      if (e.key === 'ArrowRight' && state.modalPos < state.filtered.length - 1) openModal(state.modalPos + 1);
    });

    syncInputsAndRender();
  </script>
</body>
</html>`;
  }

  async function buildManagerDetailHtmlBlob(options = {}) {
    const engine = resolveEngine(options);
    const stats = engine.computeReportStats(options);
    const siteLabel = options.siteLabel || stats.siteName || '전체 현장';
    const { photoMap, recordPhotoKeys } = await collectPhotosForRecords(stats.records, options.loadPhotoBase64);
    const items = normalizeRecordsForHtml(
      stats.records,
      engine,
      recordPhotoKeys,
      photoMap,
      stats.siteName,
      stats.inspector
    );

    const now = new Date();
    const pad2 = (n) => String(n).padStart(2, '0');
    const generatedAt = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())} ${pad2(now.getHours())}:${pad2(now.getMinutes())}`;

    const payload = {
      meta: {
        title: `${siteLabel} · ${stats.coverTitle} (상세 분석 대시보드)`,
        siteLabel,
        periodLabel: stats.periodInfo.label || stats.periodSuffix || `${stats.targetYear}년 전체`,
        inspector: stats.inspector || '안전관리자',
        generatedAt,
        total: stats.total,
        sevCrit: stats.sev.중대 || 0,
        sevMid: stats.sev.중 || 0,
        sevLow: stats.sev.경 || 0,
        highRisk: stats.hiRiskCount || ((stats.sev.중대 || 0) + (stats.sev.중 || 0)),
        fixed: stats.fixed || 0,
        unfixed: stats.unfixed || 0,
        fixRate: stats.fixRate || 0,
        holdCount: stats.holdCount || 0,
      },
      records: items,
      photos: photoMap,
    };

    const html = renderHtmlDocument(payload);
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const safePeriod = (stats.periodInfo.label || stats.month || stats.periodSuffix || '전체').replace(/[\s~:/\\']+/g, '_');
    const safeSite = siteLabel.replace(/[\s~:/\\]+/g, '_');
    const filename = `관리자용_상세분석_${safePeriod}_${safeSite}.html`;

    if (typeof engine.triggerDownloadIfRequested === 'function') {
      engine.triggerDownloadIfRequested(blob, filename, options.download);
    }
    return { blob, html, filename, stats };
  }

  return {
    buildManagerDetailHtmlBlob,
    _internal: {
      collectPhotosForRecords,
      normalizeRecordsForHtml,
      renderHtmlDocument,
      safeJsonForScript,
    },
  };
});
