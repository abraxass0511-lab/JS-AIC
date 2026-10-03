// 데이터 저장 계층
// - 데모 모드: 이 기기 브라우저(IndexedDB)에만 저장 → 설치 전 체험·테스트용
// - GitHub 모드: Cloudflare Worker를 거쳐 GitHub 비공개 저장소에 저장
import { openDB, idbGet, idbPut, idbDel, idbClear, utf8ToB64, b64ToUtf8, blobToB64, makeId, sleep } from './util.js';

export class AuthError extends Error { constructor() { super('PIN이 올바르지 않습니다'); } }
export class ConflictError extends Error { constructor() { super('동시에 수정되어 다시 시도합니다'); } }
export class NetworkError extends Error { constructor(m) { super(m || '인터넷 연결을 확인해 주세요'); } }

const DEMO_USERS = {
  '111111': { name: '점검자1', role: 'inspector' },
  '222222': { name: '점검자2', role: 'inspector' },
  '000000': { name: '관리자', role: 'admin' },
};

// ───────────── 데모 백엔드 (IndexedDB) ─────────────
class DemoBackend {
  constructor() {
    this.dbp = openDB('safepatrol-demo', 1, db => db.createObjectStore('files', { keyPath: 'path' }));
  }
  async auth(pin) { await sleep(150); const u = DEMO_USERS[pin]; if (!u) throw new AuthError(); return u; }
  async _get(path) { return idbGet(await this.dbp, 'files', path); }
  async readJSON(path) { const f = await this._get(path); return f ? { data: JSON.parse(f.text), sha: f.sha } : null; }
  async writeJSON(path, data, sha) {
    const f = await this._get(path);
    if ((f && f.sha !== sha) || (!f && sha)) throw new ConflictError();
    const nsha = Math.random().toString(36).slice(2);
    await idbPut(await this.dbp, 'files', { path, text: JSON.stringify(data), sha: nsha });
    return nsha;
  }
  async writeBlob(path, blob) { await idbPut(await this.dbp, 'files', { path, blob, sha: Math.random().toString(36).slice(2) }); }
  async readBlob(path) { const f = await this._get(path); if (!f) throw new Error('파일 없음: ' + path); return f.blob; }
  async remove(path) { await idbDel(await this.dbp, 'files', path); }
  async reset() { await idbClear(await this.dbp, 'files'); }
}

// ───────────── GitHub 백엔드 (Cloudflare Worker 경유) ─────────────
class WorkerBackend {
  constructor(url) { this.url = url.replace(/\/+$/, ''); this.pin = ''; }
  _u(path, extra = '') { return `${this.url}/file?path=${encodeURIComponent(path)}${extra}`; }
  async _fetch(url, opt = {}) {
    try {
      return await fetch(url, { ...opt, headers: { 'X-PIN': this.pin, ...(opt.headers || {}) } });
    } catch (e) { throw new NetworkError(); }
  }
  async auth(pin) {
    let r;
    try { r = await fetch(`${this.url}/auth`, { headers: { 'X-PIN': pin } }); } catch (e) { throw new NetworkError(); }
    if (r.status === 401) throw new AuthError();
    if (!r.ok) throw new Error(`서버 오류 (${r.status})`);
    this.pin = pin;
    return r.json();
  }
  async readJSON(path) {
    const r = await this._fetch(this._u(path));
    if (r.status === 404) return null;
    if (!r.ok) throw new Error(`읽기 실패 (${r.status})`);
    const j = await r.json();
    let text;
    if (j.content && j.encoding === 'base64') text = b64ToUtf8(j.content);
    else { const raw = await this._fetch(this._u(path, '&raw=1')); text = await raw.text(); } // 1MB 초과 파일
    return { data: JSON.parse(text), sha: j.sha };
  }
  async _put(path, content, sha, message) {
    const r = await this._fetch(this._u(path), {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, content, ...(sha ? { sha } : {}) }),
    });
    if (r.status === 409 || r.status === 422) throw new ConflictError();
    if (r.status === 403) throw new Error('권한이 없습니다');
    if (!r.ok) throw new Error(`저장 실패 (${r.status})`);
    const j = await r.json();
    return j.content && j.content.sha;
  }
  writeJSON(path, data, sha, message) { return this._put(path, utf8ToB64(JSON.stringify(data, null, 1)), sha, message || `update ${path}`); }
  async writeBlob(path, blob, message) { return this._put(path, await blobToB64(blob), null, message || `upload ${path}`); }
  async readBlob(path) {
    const r = await this._fetch(this._u(path, '&raw=1'));
    if (!r.ok) throw new Error(`사진 읽기 실패 (${r.status})`);
    return r.blob();
  }
  async remove(path, message) {
    const meta = await this._fetch(this._u(path));
    if (meta.status === 404) return;
    const { sha } = await meta.json();
    const r = await this._fetch(this._u(path), {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: message || `delete ${path}`, sha }),
    });
    if (!r.ok && r.status !== 404) throw new Error(`삭제 실패 (${r.status})`);
  }
}

// ───────────── 공통 Store ─────────────
const yearOf = bucket => bucket.slice(0, 4);
const mmOf = bucket => bucket.slice(5, 7);
const indexPath = bucket => `data/${yearOf(bucket)}/index/${bucket}.json`;
const recordPath = r => `data/${yearOf(r.bucket)}/records/${mmOf(r.bucket)}/${r.id}.json`;
const photoPath = (r, tag) => `data/${yearOf(r.bucket)}/photos/${mmOf(r.bucket)}/${r.id}_${tag}_${Date.now().toString(36)}.jpg`;

/** read-modify-write를 충돌 시 재시도 */
async function rmw(backend, path, mutate, fallback, message) {
  for (let i = 0; i < 4; i++) {
    const cur = await backend.readJSON(path);
    const data = mutate(cur ? cur.data : structuredClone(fallback));
    try { await backend.writeJSON(path, data, cur && cur.sha, message); return data; }
    catch (e) { if (!(e instanceof ConflictError) || i === 3) throw e; await sleep(400 + Math.random() * 600); }
  }
}

export const store = {
  mode: 'demo',
  backend: null,
  user: null,
  taxonomy: null,
  keywords: null,
  sites: [],
  custom: { customValues: {} },
  _monthCache: new Map(),
  _photoCache: new Map(),

  async init() {
    const cfg = window.SAFEPATROL_CONFIG || {};
    this.mode = cfg.workerUrl ? 'github' : 'demo';
    this.backend = this.mode === 'github' ? new WorkerBackend(cfg.workerUrl) : new DemoBackend();
    const [tax, kw] = await Promise.all([
      fetch('data/taxonomy.json').then(r => r.json()),
      fetch('data/keywords.json').then(r => r.json()),
    ]);
    this.taxonomy = tax; this.keywords = kw;

    const pin = localStorage.getItem('sp_pin');
    if (pin) {
      try { this.user = await this.backend.auth(pin); localStorage.setItem('sp_user', JSON.stringify(this.user)); }
      catch (e) {
        if (e instanceof AuthError) { localStorage.removeItem('sp_pin'); localStorage.removeItem('sp_user'); }
        else { this.user = JSON.parse(localStorage.getItem('sp_user') || 'null'); if (this.backend.pin !== undefined) this.backend.pin = pin; }
      }
    }
    if (this.user) await this.loadConfig().catch(() => {});
  },

  async login(pin) {
    this.user = await this.backend.auth(pin);
    localStorage.setItem('sp_pin', pin);
    localStorage.setItem('sp_user', JSON.stringify(this.user));
    await this.loadConfig();
    return this.user;
  },
  logout() {
    localStorage.removeItem('sp_pin'); localStorage.removeItem('sp_user');
    this.user = null; this._monthCache.clear();
  },
  get isAdmin() { return this.user && this.user.role === 'admin'; },

  // ── 설정 (현장, 직접입력 값) ──
  async loadConfig() {
    const [s, c] = await Promise.all([this.backend.readJSON('config/sites.json'), this.backend.readJSON('config/custom.json')]);
    this.sites = (s && s.data.sites) || [];
    this.custom = (c && c.data) || { customValues: {} };
    if (!this.custom.customValues) this.custom.customValues = {};
  },
  async saveSites(sites) {
    const d = await rmw(this.backend, 'config/sites.json', () => ({ sites }), { sites: [] }, `[SafePatrol] 현장 설정 변경 (${this.user.name})`);
    this.sites = d.sites;
  },
  /** 직접입력 값 저장: { field: [value, ...] } */
  async addCustomValues(map) {
    const entries = Object.entries(map).filter(([, v]) => v && v.length);
    if (!entries.length) return;
    const d = await rmw(this.backend, 'config/custom.json', cur => {
      cur.customValues = cur.customValues || {};
      entries.forEach(([f, vals]) => {
        const set = new Set(cur.customValues[f] || []);
        vals.forEach(v => set.add(v));
        cur.customValues[f] = [...set];
      });
      return cur;
    }, { customValues: {} }, `[SafePatrol] 직접입력 값 추가 (${this.user.name})`);
    this.custom = d;
  },

  // ── 기록 조회 ──
  async listMonth(bucket, force = false) {
    if (!force && this._monthCache.has(bucket)) return this._monthCache.get(bucket);
    const r = await this.backend.readJSON(indexPath(bucket));
    const list = (r && r.data.records) || [];
    this._monthCache.set(bucket, list);
    return list;
  },
  async listMonths(buckets, force = false) {
    const all = await Promise.all(buckets.map(b => this.listMonth(b, force)));
    return all.flat().sort((a, b) => (b.inspectedDate + b.createdAt).localeCompare(a.inspectedDate + a.createdAt));
  },
  async getRecord(bucket, id) {
    const list = await this.listMonth(bucket);
    return list.find(r => r.id === id) || null;
  },

  // ── 기록 저장 ──
  /**
   * @param rec   기록 데이터 (photos/fix.photo 제외한 필드)
   * @param media { photos: [{path}|{blob}], fixPhoto: {path}|{blob}|null }
   */
  async saveRecord(rec, media, onStep = () => {}) {
    const isNew = !rec.id;
    const now = new Date().toISOString();
    if (isNew) {
      rec.id = makeId(rec.inspectedDate);
      rec.bucket = rec.inspectedDate.slice(0, 7);
      rec.createdAt = now;
      rec.inspector = this.user.name;
    }
    rec.updatedAt = now;
    rec.updatedBy = this.user.name;
    const msg = `[SafePatrol] ${isNew ? '등록' : '수정'} ${rec.id} (${this.user.name})`;

    // 1) 사진 업로드
    const photos = [];
    const todo = (media.photos || []).filter(p => p.blob).length + (media.fixPhoto && media.fixPhoto.blob ? 1 : 0);
    let done = 0;
    for (const [i, p] of (media.photos || []).entries()) {
      if (p.blob) {
        onStep(`사진 업로드 중 (${++done}/${todo})`);
        const path = photoPath(rec, `p${i + 1}`);
        await this.backend.writeBlob(path, p.blob, msg);
        this._photoCache.set(path, URL.createObjectURL(p.blob));
        photos.push(path);
      } else if (p.path) photos.push(p.path);
    }
    rec.photos = photos;
    rec.fix = rec.fix || {};
    if (media.fixPhoto && media.fixPhoto.blob) {
      onStep(`조치사진 업로드 중 (${++done}/${todo})`);
      const path = photoPath(rec, 'fix');
      await this.backend.writeBlob(path, media.fixPhoto.blob, msg);
      this._photoCache.set(path, URL.createObjectURL(media.fixPhoto.blob));
      rec.fix.photo = path;
    } else rec.fix.photo = media.fixPhoto ? media.fixPhoto.path : null;
    rec.status = rec.fix.content ? '조치완료' : '미조치';

    // 2) 개별 기록 파일 (원본 보관)
    onStep('기록 저장 중');
    await rmw(this.backend, recordPath(rec), () => rec, {}, msg);

    // 3) 월별 목록 갱신
    onStep('목록 갱신 중');
    const d = await rmw(this.backend, indexPath(rec.bucket), cur => {
      cur.records = (cur.records || []).filter(r => r.id !== rec.id);
      cur.records.push(rec);
      return cur;
    }, { records: [] }, msg);
    this._monthCache.set(rec.bucket, d.records);
    return rec;
  },

  async deleteRecord(rec) {
    const msg = `[SafePatrol] 삭제 ${rec.id} (${this.user.name})`;
    const d = await rmw(this.backend, indexPath(rec.bucket), cur => {
      cur.records = (cur.records || []).filter(r => r.id !== rec.id); return cur;
    }, { records: [] }, msg);
    this._monthCache.set(rec.bucket, d.records);
    await this.backend.remove(recordPath(rec), msg).catch(() => {});
    for (const p of [...(rec.photos || []), rec.fix && rec.fix.photo].filter(Boolean)) await this.backend.remove(p, msg).catch(() => {});
  },

  // ── 사진 ──
  async photoBlob(path) { return this.backend.readBlob(path); },
  async photoURL(path) {
    if (!path) return '';
    if (this._photoCache.has(path)) return this._photoCache.get(path);
    const url = URL.createObjectURL(await this.backend.readBlob(path));
    this._photoCache.set(path, url);
    return url;
  },

  // ── 데모 전용 ──
  async resetDemo() { if (this.mode === 'demo') { await this.backend.reset(); this._monthCache.clear(); this.sites = []; this.custom = { customValues: {} }; } },
};
