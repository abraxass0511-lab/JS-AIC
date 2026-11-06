// 공용 유틸리티
export const $ = (sel, el = document) => el.querySelector(sel);
export const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];

/** 간단한 엘리먼트 생성기: h('div.card#id', {onclick}, ...children) */
export function h(tag, attrs, ...children) {
  const [, name = 'div', rest = ''] = tag.match(/^([a-z0-9-]+)?(.*)$/i);
  const el = document.createElement(name);
  (rest.match(/[.#][^.#]+/g) || []).forEach(t => {
    if (t[0] === '.') el.classList.add(t.slice(1)); else el.id = t.slice(1);
  });
  if (attrs && (typeof attrs !== 'object' || attrs instanceof Node || Array.isArray(attrs))) { children.unshift(attrs); attrs = null; }
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (k === 'html') el.innerHTML = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k in el && typeof v !== 'string') el[k] = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
  }
  children.flat(Infinity).forEach(c => { if (c != null && c !== false) el.append(c instanceof Node ? c : document.createTextNode(String(c))); });
  return el;
}

export const debounce = (fn, ms = 300) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
export const sleep = ms => new Promise(r => setTimeout(r, ms));
export const pad = n => String(n).padStart(2, '0');

export function todayStr(d = new Date()) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
export function monthStr(d = new Date()) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; }
export function addMonths(bucket, n) {
  const [y, m] = bucket.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return monthStr(d);
}
export function monthsBetween(from, to) {
  const out = []; let cur = from;
  while (cur <= to && out.length < 120) { out.push(cur); cur = addMonths(cur, 1); }
  return out;
}
export function makeId(dateStr) {
  const d = new Date();
  const ds = (dateStr || todayStr()).replace(/-/g, '');
  return `${ds}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}-${Math.random().toString(36).slice(2, 6)}`;
}

// ── Base64 (UTF-8 안전) ──
export function bytesToB64(bytes) {
  let bin = '';
  const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
  return btoa(bin);
}
export function b64ToBytes(b64) {
  const bin = atob(b64.replace(/\s/g, ''));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
export const utf8ToB64 = s => bytesToB64(new TextEncoder().encode(s));
export const b64ToUtf8 = b => new TextDecoder().decode(b64ToBytes(b));
export async function blobToB64(blob) { return bytesToB64(new Uint8Array(await blob.arrayBuffer())); }

// ── 토스트 ──
export function toast(msg, type = 'info', ms = 2600) {
  let wrap = $('#toasts');
  if (!wrap) { wrap = h('div#toasts'); document.body.append(wrap); }
  const t = h(`div.toast.toast-${type}`, msg);
  wrap.append(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, ms);
}

// ── IndexedDB 최소 래퍼 ──
export function openDB(name, version, upgrade) {
  return new Promise((res, rej) => {
    const r = indexedDB.open(name, version);
    r.onupgradeneeded = () => upgrade(r.result);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
function tx(db, store, mode, fn) {
  return new Promise((res, rej) => {
    const t = db.transaction(store, mode);
    const req = fn(t.objectStore(store));
    t.oncomplete = () => res(req && req.result);
    t.onerror = () => rej(t.error);
  });
}
export const idbGet = (db, s, k) => tx(db, s, 'readonly', st => st.get(k));
export const idbPut = (db, s, v) => tx(db, s, 'readwrite', st => st.put(v));
export const idbDel = (db, s, k) => tx(db, s, 'readwrite', st => st.delete(k));
export const idbClear = (db, s) => tx(db, s, 'readwrite', st => st.clear());

export function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/**
 * 모바일(안드로이드/아이폰) 및 PC 공용 안전 파일 다운로더
 * - PC: 숨김 a 태그 클릭으로 즉시 다운로드
 * - 모바일: 파일 생성(비동기) 후 사용자 제스처가 만료되어 다운로드가 차단/손상되는 문제를 막기 위해
 *   '저장 시트'를 띄워 사용자가 직접 탭할 때 저장/공유를 실행
 * - 카카오톡·네이버 등 인앱 브라우저는 blob 다운로드를 지원하지 않으므로 외부 브라우저 열기 안내
 */
const MIME_BY_EXT = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  pdf: 'application/pdf'
};

function getEnv() {
  const ua = navigator.userAgent || '';
  const isIOS = /iPhone|iPad|iPod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isAndroid = /Android/i.test(ua);
  const isKakao = /KAKAOTALK/i.test(ua);
  const isInApp = isKakao || /NAVER\(inapp|Instagram|FBAN|FBAV|Line\/|DaumApps|everytimeApp|; wv\)/i.test(ua);
  return { isIOS, isAndroid, isMobile: isIOS || isAndroid, isKakao, isInApp };
}

function normalizeBlob(blob, filename) {
  const ext = (filename.split('.').pop() || '').toLowerCase();
  const mime = MIME_BY_EXT[ext];
  if (mime && blob.type !== mime) return new Blob([blob], { type: mime });
  return blob;
}

function anchorDownload(href, filename) {
  const a = document.createElement('a');
  a.style.display = 'none';
  a.href = href;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { try { a.remove(); } catch (e) {} }, 1000);
}

function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(blob);
  });
}

function showSaveSheet(blob, filename, env) {
  document.getElementById('dlSaveSheet')?.remove();
  const url = URL.createObjectURL(blob);
  const ext = (filename.split('.').pop() || '').toUpperCase();
  const sizeKB = Math.max(1, Math.round(blob.size / 1024));

  const overlay = document.createElement('div');
  overlay.id = 'dlSaveSheet';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(15,23,42,0.55);display:flex;align-items:flex-end;justify-content:center;';
  const sheet = document.createElement('div');
  sheet.style.cssText = 'width:100%;max-width:480px;background:#fff;border-radius:18px 18px 0 0;padding:20px 18px calc(18px + env(safe-area-inset-bottom));box-shadow:0 -8px 30px rgba(0,0,0,0.2);font-family:inherit;';
  overlay.appendChild(sheet);

  const btnCss = 'display:block;width:100%;padding:14px;margin-top:10px;border-radius:12px;font-size:1rem;font-weight:700;border:none;cursor:pointer;';
  const title = `<div style="font-size:1.05rem;font-weight:800;color:#1e293b;margin-bottom:4px;">📄 파일이 준비되었습니다</div>
    <div style="font-size:0.85rem;color:#64748b;word-break:break-all;margin-bottom:8px;">${filename} · ${ext} · ${sizeKB}KB</div>`;

  const close = () => {
    overlay.remove();
    setTimeout(() => { try { URL.revokeObjectURL(url); } catch (e) {} }, 60000);
  };
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

  if (env.isInApp) {
    sheet.innerHTML = title + `<div style="font-size:0.88rem;color:#b45309;background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:10px 12px;line-height:1.5;">
      현재 <b>앱 내부 브라우저</b>(카카오톡 등)에서는 파일 다운로드가 지원되지 않습니다.<br>
      <b>Chrome / 삼성인터넷 / Safari</b>에서 열어 다시 다운로드해 주세요.</div>`;
    const btnExt = document.createElement('button');
    btnExt.style.cssText = btnCss + 'background:#2d3a8c;color:#fff;';
    btnExt.textContent = '🌐 외부 브라우저로 열기';
    btnExt.onclick = () => {
      const pageUrl = location.href;
      if (env.isKakao) {
        location.href = 'kakaotalk://web/openExternal?url=' + encodeURIComponent(pageUrl);
      } else if (env.isAndroid) {
        location.href = `intent://${pageUrl.replace(/^https?:\/\//, '')}#Intent;scheme=https;package=com.android.chrome;end`;
      } else {
        navigator.clipboard?.writeText(pageUrl);
        alert('주소가 복사되었습니다. Safari에 붙여넣어 열어주세요.');
      }
    };
    sheet.appendChild(btnExt);
  } else {
    sheet.innerHTML = title;
    const btnSave = document.createElement('button');
    btnSave.style.cssText = btnCss + 'background:#2d3a8c;color:#fff;';
    btnSave.textContent = '💾 휴대폰에 저장';
    btnSave.onclick = async () => {
      try {
        if (env.isIOS) {
          // iOS Safari: blob 다운로드가 불안정하므로 공유 시트(파일에 저장) 우선
          const file = new File([blob], filename, { type: blob.type });
          if (navigator.canShare && navigator.canShare({ files: [file] })) {
            await navigator.share({ files: [file], title: filename });
            close();
            return;
          }
        }
        anchorDownload(url, filename);
        toastLite('다운로드를 시작했습니다. 알림창 또는 [내 파일 > 다운로드]에서 확인하세요.');
        close();
      } catch (e) {
        if (e && e.name === 'AbortError') return;
        // 최후 수단: data URL 다운로드
        try {
          anchorDownload(await blobToDataURL(blob), filename);
          close();
        } catch (e2) {
          alert('저장에 실패했습니다: ' + (e2.message || e2));
        }
      }
    };
    sheet.appendChild(btnSave);

    const file = new File([blob], filename, { type: blob.type });
    const extLower = ext.toLowerCase();
    // 안드로이드 크롬은 Web Share로 이미지·PDF·텍스트만 허용 (xlsx/pptx는 'Permission denied'로 거부됨)
    const ANDROID_SHAREABLE = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'pdf', 'txt', 'csv'];
    const shareAllowed = !env.isAndroid || ANDROID_SHAREABLE.includes(extLower);
    if (shareAllowed && navigator.canShare && navigator.canShare({ files: [file] })) {
      const btnShare = document.createElement('button');
      btnShare.style.cssText = btnCss + 'background:#fee500;color:#191919;';
      btnShare.textContent = '📤 공유하기 (카카오톡 · 드라이브 등)';
      btnShare.onclick = async () => {
        try {
          await navigator.share({ files: [file], title: filename });
          close();
        } catch (e) {
          if (e && e.name === 'AbortError') return;
          if (e && e.name === 'NotAllowedError') {
            anchorDownload(url, filename);
            alert('이 기기에서는 해당 파일 형식의 바로 공유가 지원되지 않아 휴대폰에 저장했습니다.\n카카오톡 채팅방 [+] → [파일]에서 다운로드 폴더의 파일을 첨부해 주세요.');
            close();
            return;
          }
          alert('공유에 실패했습니다: ' + e.message);
        }
      };
      sheet.appendChild(btnShare);
    } else if (env.isAndroid) {
      const guide = document.createElement('div');
      guide.style.cssText = 'margin-top:10px;font-size:0.83rem;color:#475569;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:10px 12px;line-height:1.55;';
      guide.innerHTML = `💬 <b>카카오톡으로 보내려면</b><br>① [휴대폰에 저장] → ② 카카오톡 채팅방 <b>[+] → [파일]</b> → ③ <b>다운로드</b> 폴더에서 <b>${ext}</b> 파일 선택<br><span style="color:#94a3b8;">※ 안드로이드 크롬은 ${ext} 파일의 바로 공유를 지원하지 않습니다.</span>`;
      sheet.appendChild(guide);
    }

    // 📧 이메일 발송 버튼 (메일 앱 열기 & 파일 첨부 안내)
    const btnEmail = document.createElement('button');
    btnEmail.style.cssText = btnCss + 'background:#0ea5e9;color:#fff;';
    btnEmail.textContent = '📧 이메일로 보내기';
    btnEmail.onclick = () => {
      anchorDownload(url, filename);
      const subject = `[SafePatrol] ${filename}`;
      const body = `안녕하세요,\n\nSafePatrol에서 생성된 [${filename}] 파일을 공유드립니다.\n\n※ 휴대폰 다운로드 폴더에 저장된 해당 파일을 본 메일에 첨부하여 발송해 주세요.`;
      setTimeout(() => {
        location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
      }, 500);
      close();
    };
    sheet.appendChild(btnEmail);
  }

  const btnClose = document.createElement('button');
  btnClose.style.cssText = btnCss + 'background:#f1f5f9;color:#475569;';
  btnClose.textContent = '닫기';
  btnClose.onclick = close;
  sheet.appendChild(btnClose);

  document.body.appendChild(overlay);
}

function toastLite(msg) {
  const box = document.getElementById('toasts');
  if (!box) return;
  const t = document.createElement('div');
  t.className = 'toast info';
  t.textContent = msg;
  box.appendChild(t);
  setTimeout(() => t.remove(), 4000);
}

export function downloadBlob(blob, filename) {
  const env = getEnv();
  const fixed = normalizeBlob(blob, filename);
  if (env.isMobile || env.isInApp) {
    showSaveSheet(fixed, filename, env);
    return;
  }
  const url = URL.createObjectURL(fixed);
  anchorDownload(url, filename);
  setTimeout(() => { try { URL.revokeObjectURL(url); } catch (e) {} }, 60000);
}

if (typeof window !== 'undefined') {
  window.SafeUtil = window.SafeUtil || {};
  window.SafeUtil.downloadBlob = downloadBlob;
}

/**
 * 엑셀/PPT 메일 발송용 2단계 시트
 *  ① [휴대폰에 저장] 탭 → 저장 (파일명에 시각을 붙여 '중복 파일 다시 다운로드?' 확인창으로 저장이 취소되는 문제 방지)
 *  ② 저장 확인 후 [메일 앱 열기] 탭 → 메일 작성창 (자동 이동하지 않아 크롬 다운로드 확인창이 가려지지 않음)
 */
export function saveAndEmail(blob, filename, subject, body) {
  const env = getEnv();
  const fixed = normalizeBlob(blob, filename);
  const url = URL.createObjectURL(fixed);
  const mailto = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

  // 고유 파일명: 이름_HHMMSS.ext
  const d = new Date();
  const stamp = [d.getHours(), d.getMinutes(), d.getSeconds()].map(n => String(n).padStart(2, '0')).join('');
  const dot = filename.lastIndexOf('.');
  const saveName = dot > 0 ? `${filename.slice(0, dot)}_${stamp}${filename.slice(dot)}` : `${filename}_${stamp}`;

  document.getElementById('dlSaveSheet')?.remove();
  const overlay = document.createElement('div');
  overlay.id = 'dlSaveSheet';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(15,23,42,0.55);display:flex;align-items:flex-end;justify-content:center;';
  const sheet = document.createElement('div');
  sheet.style.cssText = 'width:100%;max-width:480px;background:#fff;border-radius:18px 18px 0 0;padding:20px 18px calc(18px + env(safe-area-inset-bottom));box-shadow:0 -8px 30px rgba(0,0,0,0.2);font-family:inherit;';
  overlay.appendChild(sheet);
  const btnCss = 'display:block;width:100%;padding:14px;margin-top:10px;border-radius:12px;font-size:1rem;font-weight:700;border:none;cursor:pointer;';
  const ext = (filename.split('.').pop() || '').toUpperCase();
  const sizeKB = Math.max(1, Math.round(fixed.size / 1024));

  const close = () => {
    overlay.remove();
    setTimeout(() => { try { URL.revokeObjectURL(url); } catch (e) {} }, 120000);
  };
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

  const header = document.createElement('div');
  header.innerHTML = `<div style="font-size:1.05rem;font-weight:800;color:#1e293b;margin-bottom:4px;">📧 메일 발송 (2단계)</div>
    <div style="font-size:0.85rem;color:#64748b;word-break:break-all;margin-bottom:10px;">${saveName} · ${sizeKB}KB</div>
    <div style="font-size:0.84rem;color:#475569;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:10px 12px;line-height:1.6;">
      <b>①</b> [휴대폰에 저장]을 누르고, 화면 하단에 <b>다운로드 완료</b> 알림이 뜨는지 확인하세요.<br>
      <b>②</b> [메일 앱 열기] → 메일 앱의 <b>클립(📎) → 파일 → 다운로드</b>에서 위 파일을 첨부하세요.<br>
      <span style="color:#94a3b8;">※ 브라우저 보안 정책상 ${ext} 파일은 메일에 자동 첨부할 수 없습니다.</span>
    </div>`;
  sheet.appendChild(header);

  if (env.isInApp) {
    const warn = document.createElement('div');
    warn.style.cssText = 'margin-top:10px;font-size:0.84rem;color:#b45309;background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:10px 12px;';
    warn.innerHTML = '카카오톡 등 <b>앱 내부 브라우저</b>에서는 저장이 되지 않습니다. Chrome/삼성인터넷에서 열어주세요.';
    sheet.appendChild(warn);
  }

  const btnSave = document.createElement('button');
  btnSave.style.cssText = btnCss + 'background:#2d3a8c;color:#fff;';
  btnSave.textContent = '① 💾 휴대폰에 저장';

  const btnMail = document.createElement('button');
  btnMail.style.cssText = btnCss + 'background:#cbd5e1;color:#fff;';
  btnMail.textContent = '② 📧 메일 앱 열기';

  let saved = false;
  btnSave.onclick = async () => {
    try {
      anchorDownload(url, saveName); // 사용자 탭 안에서 실행해야 저장 허용
    } catch (e) {
      try { anchorDownload(await blobToDataURL(fixed), saveName); } catch (e2) { alert('저장 실패: ' + (e2.message || e2)); return; }
    }
    saved = true;
    btnSave.textContent = '✅ 저장 요청 완료 (다시 저장하려면 탭)';
    btnSave.style.background = '#16a34a';
    btnMail.style.background = '#0ea5e9';
    toastLite(`[${saveName}] 다운로드를 시작했습니다.`);
  };

  btnMail.onclick = () => {
    if (!saved && !confirm('아직 파일을 저장하지 않았습니다. 그래도 메일 앱을 여시겠습니까?')) return;
    close();
    location.href = mailto;
  };

  const btnClose = document.createElement('button');
  btnClose.style.cssText = btnCss + 'background:#f1f5f9;color:#475569;';
  btnClose.textContent = '닫기';
  btnClose.onclick = close;

  sheet.append(btnSave, btnMail, btnClose);
  document.body.appendChild(overlay);
}
