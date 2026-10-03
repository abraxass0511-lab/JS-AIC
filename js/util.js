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
