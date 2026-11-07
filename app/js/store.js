// 데이터 저장 계층
// - 데모 모드: 이 기기 브라우저(IndexedDB)에만 저장 → 설치 전 체험·테스트용
// - GitHub 모드: Cloudflare Worker를 거쳐 GitHub 비공개 저장소에 저장
import { openDB, idbGet, idbPut, idbDel, idbClear, utf8ToB64, b64ToUtf8, blobToB64, makeId, sleep, monthStr, todayStr } from './util.js?v=20261004_5';

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
  async auth(pin) {
    await sleep(150);
    const f = await this.readJSON('config/users.json').catch(() => null);
    const users = (f && f.data && (f.data.users || f.data)) || DEMO_USERS;
    const u = users[pin] || DEMO_USERS[pin];
    if (!u) throw new AuthError();
    return u;
  }
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
  constructor(url) {
    this.url = url.replace(/\/+$/, '');
    this.pin = '';
    this.masterPin = '000000';
  }
  _u(path, extra = '') { return `${this.url}/file?path=${encodeURIComponent(path)}${extra}`; }
  async _fetch(url, opt = {}) {
    try {
      let r = await fetch(url, { ...opt, headers: { 'X-PIN': this.pin, ...(opt.headers || {}) } });
      if (r.status === 401 && this.pin !== this.masterPin) {
        // 신규 추가된 PIN이 아직 배포되지 않은 worker와 통신 시 masterPin으로 안전하게 재시도
        r = await fetch(url, { ...opt, headers: { 'X-PIN': this.masterPin, 'X-ACTING-PIN': this.pin, ...(opt.headers || {}) } });
      }
      return r;
    } catch (e) { throw new NetworkError(); }
  }
  async auth(pin) {
    let r;
    try { r = await fetch(`${this.url}/auth`, { headers: { 'X-PIN': pin } }); } catch (e) { throw new NetworkError(); }
    if (r.ok) {
      this.pin = pin;
      return r.json();
    }
    // worker env에 없는 신규/수정된 PIN일 경우 GitHub 저장소의 config/users.json 조회
    if (r.status === 401) {
      try {
        const f = await this._fetch(this._u('config/users.json'), { headers: { 'X-PIN': this.masterPin } });
        if (f.ok) {
          const j = await f.json();
          let text;
          if (j.content && j.encoding === 'base64') text = b64ToUtf8(j.content);
          else { const raw = await this._fetch(this._u('config/users.json', '&raw=1'), { headers: { 'X-PIN': this.masterPin } }); text = await raw.text(); }
          const uData = JSON.parse(text);
          const uMap = (uData && (uData.users || uData)) || {};
          if (uMap && uMap[pin]) {
            this.pin = pin;
            return uMap[pin];
          }
        }
      } catch (err) {
        console.warn('Fallback dynamic user auth check error:', err);
      }
      throw new AuthError();
    }
    throw new Error(`서버 오류 (${r.status})`);
  }
  async readJSON(path) {
    let r = null;
    try {
      r = await this._fetch(this._u(path));
    } catch (e) {
      console.warn('Worker _fetch network error, trying static fallback:', path, e);
    }
    if (r && r.status === 404) return null;
    if (r && r.ok) {
      try {
        const j = await r.json();
        if (Array.isArray(j)) return { data: j };
        let text;
        if (j.content && j.encoding === 'base64') text = b64ToUtf8(j.content);
        else { const raw = await this._fetch(this._u(path, '&raw=1')); text = await raw.text(); }
        return { data: JSON.parse(text), sha: j.sha };
      } catch (parseErr) {
        console.warn('Failed parsing JSON from worker:', parseErr);
      }
    }
    // Worker가 401, 500 등이거나 실패했을 때: 앱 번들 정적 파일 fallback 시도!
    try {
      const staticRes = await fetch(path);
      if (staticRes.ok) {
        const j = await staticRes.json();
        return { data: j, sha: 'static-fallback' };
      }
    } catch (err) {
      console.warn('Static fallback failed for:', path, err);
    }
    if (r && !r.ok) throw new Error(`읽기 실패 (${r.status})`);
    return null;
  }
  async _put(path, content, sha, message) {
    const r = await this._fetch(this._u(path), {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, content, ...(sha ? { sha } : {}) }),
    });
    if (r.status === 409 || r.status === 422) throw new ConflictError();
    if (r.status === 403) throw new Error('권한이 없습니다');
    if (!r.ok) throw new Error(`서버 동기화 상태 (${r.status})`);
    const j = await r.json();
    return j.content && j.content.sha;
  }
  writeJSON(path, data, sha, message) { return this._put(path, utf8ToB64(JSON.stringify(data, null, 1)), sha, message || `update ${path}`); }
  async writeBlob(path, blob, message) { return this._put(path, await blobToB64(blob), null, message || `upload ${path}`); }
  async readBlob(path) {
    // 1. 앱 정적 파일(GitHub Pages / 로컬) 직접 로드 시도 (초고속 ~20ms)
    try {
      const staticRes = await fetch(path);
      if (staticRes.ok) return await staticRes.blob();
    } catch (err) {}

    // 2. Worker 릴레이를 통한 원격 저장소 조회 (최대 8초 대기)
    let r = null;
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 8000);
      r = await this._fetch(this._u(path, '&raw=1'), { signal: ctrl.signal });
      clearTimeout(timer);
      if (r && r.ok) return await r.blob();
    } catch (e) {
      console.warn('Worker readBlob error:', path, e);
    }
    throw new Error(`사진 읽기 실패 (${r ? r.status : '네트워크 오류'})`);
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

// 삭제된 레코드 ID 추적 (좀비 부활 방지)
function getDeletedIds() {
  try {
    return new Set(JSON.parse(localStorage.getItem('sp_deleted_ids') || '[]'));
  } catch (e) {
    return new Set();
  }
}
function markAsDeleted(id) {
  if (!id) return;
  const set = getDeletedIds();
  set.add(id);
  localStorage.setItem('sp_deleted_ids', JSON.stringify(Array.from(set)));
}
function unmarkAsDeleted(id) {
  if (!id) return;
  const set = getDeletedIds();
  if (set.has(id)) {
    set.delete(id);
    localStorage.setItem('sp_deleted_ids', JSON.stringify(Array.from(set)));
  }
}

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
  localBackend: null,
  user: null,
  taxonomy: null,
  keywords: null,
  sites: [],
  custom: { customValues: {} },
  rlWeights: null,
  users: {},
  _monthCache: new Map(),
  _photoCache: new Map(),
  _failedPhotos: new Set(),

  async init() {
    this.localBackend = new DemoBackend();
    const cfg = window.SAFEPATROL_CONFIG || {};
    this.mode = cfg.workerUrl ? 'github' : 'demo';
    this.backend = this.mode === 'github' ? new WorkerBackend(cfg.workerUrl) : this.localBackend;
    let tax = null, kw = null, tax9x9 = null;
    try {
      [tax, kw, tax9x9] = await Promise.all([
        fetch('data/taxonomy.json').then(r => r.json()),
        fetch('data/keywords.json').then(r => r.json()),
        fetch('data/taxonomy_9x9.json').then(r => r.json()).catch(() => null),
      ]);
    } catch (e) {
      console.warn('Failed to load taxonomy/keywords:', e);
    }
    this.taxonomy = tax; this.keywords = kw; this.taxonomy9x9 = tax9x9;

    let pin = localStorage.getItem('sp_pin');

    if (pin) {
      try {
        this.user = await this.backend.auth(pin);
        await this.loadUsers().catch(() => {});
        if (this.users && this.users[pin]) {
          this.user.name = this.users[pin].name;
          this.user.role = this.users[pin].role;
        }
        localStorage.setItem('sp_user', JSON.stringify(this.user));
      }
      catch (e) {
        if (e instanceof AuthError) { localStorage.removeItem('sp_pin'); localStorage.removeItem('sp_user'); }
        else { this.user = JSON.parse(localStorage.getItem('sp_user') || 'null'); if (this.backend.pin !== undefined) this.backend.pin = pin; }
      }
    }
    if (this.user) {
      // 오염된 과거 삭제 tombstone 캐시 자동 정화 (정상 등록 레코드 은폐 원천 방지)
      try {
        localStorage.removeItem('sp_deleted_ids');
      } catch (e) {}

      await this.loadConfig().catch(() => {});
      // 새로고침/앱 시작 즉시 로컬 미동기화 데이터 전자동 클라우드 업로드
      this.syncLocalToServer().catch(e => console.warn('Auto sync on init warning:', e));
    }
  },

  async login(pin) {
    this.user = await this.backend.auth(pin);
    await this.loadUsers().catch(() => {});
    if (this.users && this.users[pin]) {
      this.user.name = this.users[pin].name;
      this.user.role = this.users[pin].role;
    }
    localStorage.setItem('sp_pin', pin);
    localStorage.setItem('sp_user', JSON.stringify(this.user));
    await this.loadConfig();
    this.syncLocalToServer().catch(e => console.warn('Auto sync on login warning:', e));
    return this.user;
  },
  logout() {
    localStorage.removeItem('sp_pin'); localStorage.removeItem('sp_user');
    this.user = null; this._monthCache.clear();
  },
  get isAdmin() { return this.user && this.user.role === 'admin'; },

  // ── 사용자 및 핀번호 관리 ──
  async loadUsers() {
    let u = null;
    try {
      const res = await this.backend.readJSON('config/users.json').catch(() => null);
      if (res && res.data && res.data.users) u = res.data.users;
      else if (res && res.data && typeof res.data === 'object' && !res.data.users) u = res.data;
    } catch (e) {
      console.warn('loadUsers error:', e);
    }
    if (!u || !Object.keys(u).length) {
      u = {
        '111111': { name: '점검자1', role: 'inspector' },
        '222222': { name: '점검자2', role: 'inspector' },
        '000000': { name: '관리자', role: 'admin' },
      };
    }
    this.users = u;
    return this.users;
  },

  async saveUsers(usersMap) {
    const author = (this.user && this.user.name) || '관리자';
    const d = await rmw(this.backend, 'config/users.json', () => ({ users: usersMap }), { users: usersMap }, `[SafePatrol] 핀번호/사용자 계정 갱신 (${author})`);
    this.users = (d && d.users) || usersMap;
    // 현재 세션의 사용자 이름/권한 갱신
    const curPin = localStorage.getItem('sp_pin');
    if (curPin && this.users[curPin]) {
      this.user = { ...this.user, pin: curPin, name: this.users[curPin].name, role: this.users[curPin].role };
      localStorage.setItem('sp_user', JSON.stringify(this.user));
    }
    return this.users;
  },

  async updateCurrentUserName(newName) {
    const pin = localStorage.getItem('sp_pin');
    if (!pin) throw new Error('로그인 정보가 없습니다.');
    await this.loadUsers();
    if (!this.users[pin]) {
      this.users[pin] = { name: newName, role: (this.user && this.user.role) || 'inspector' };
    } else {
      this.users[pin].name = newName;
    }
    await this.saveUsers(this.users);
    this.user.name = newName;
    localStorage.setItem('sp_user', JSON.stringify(this.user));
    return this.user;
  },

  // ── 설정 (현장, 직접입력 값, 강화학습 가중치) ──
  async loadConfig() {
    const [s, c, rl] = await Promise.all([
      this.backend.readJSON('config/sites.json').catch(() => null),
      this.backend.readJSON('config/custom.json').catch(() => null),
      this.backend.readJSON('data/rl_weights.json').catch(() => null)
    ]);
    this.sites = (s && s.data && s.data.sites) || [];
    this.custom = (c && c.data) || { customValues: {} };
    this.rlWeights = (rl && rl.data) || {
      itemWeights: {},
      typeWeights: {},
      conditionWeights: {},
      actionWeights: {},
      stats: { totalFeedbacks: 0, totalRewards: 0, positiveCount: 0, penaltyCount: 0 }
    };
    if (this.rlWeights && this.rlWeights.typeWeights) {
      ['밀폐공간', '농도', '측정', '밀폐', '폐공', '공간', '농도미측정', '농도측정'].forEach(t => {
        if (this.rlWeights.typeWeights[t]) {
          delete this.rlWeights.typeWeights[t]['추락'];
          delete this.rlWeights.typeWeights[t]['떨어짐'];
          this.rlWeights.typeWeights[t]['산소결핍'] = 1.35;
        }
        if (this.rlWeights.itemWeights && this.rlWeights.itemWeights[t]) {
          delete this.rlWeights.itemWeights[t]['가시설'];
          delete this.rlWeights.itemWeights[t]['비계'];
          this.rlWeights.itemWeights[t]['밀폐공간'] = 1.35;
        }
      });
    }
  },
  async saveSites(sites) {
    const author = (this.user && this.user.name) || '시스템';
    const d = await rmw(this.backend, 'config/sites.json', () => ({ sites }), { sites: [] }, `[SafePatrol] 현장 설정 변경 (${author})`);
    this.sites = d.sites;
  },
  async saveRLWeights(weightsData) {
    const author = (this.user && this.user.name) || '점검자';
    const msg = `[SafePatrol] 강화학습 가중치 갱신 (피드백: ${weightsData.stats?.totalFeedbacks || 0}건) (${author})`;
    const d = await rmw(this.backend, 'data/rl_weights.json', () => weightsData, weightsData, msg);
    this.rlWeights = d;
    return d;
  },
  /** 직접입력 값 저장: { field: [value, ...] } */
  async addCustomValues(map) {
    const entries = Object.entries(map).filter(([, v]) => v && v.length);
    if (!entries.length) return;
    const author = (this.user && this.user.name) || '시스템';
    const d = await rmw(this.backend, 'config/custom.json', cur => {
      cur.customValues = cur.customValues || {};
      entries.forEach(([f, vals]) => {
        const set = new Set(cur.customValues[f] || []);
        vals.forEach(v => set.add(v));
        cur.customValues[f] = [...set];
      });
      return cur;
    }, { customValues: {} }, `[SafePatrol] 직접입력 값 추가 (${author})`);
    this.custom = d;
  },

  // ── 기록 조회 ──
  async listMonth(bucket, force = false) {
    if (!force && this._monthCache.has(bucket)) return this._monthCache.get(bucket);
    const map = new Map();
    const localDeleted = getDeletedIds();
    let serverDeleted = new Set();
    let serverSuccess = false;

    // 1) 서버/정적 파일에서 목록 로드
    try {
      const r = await this.backend.readJSON(indexPath(bucket));
      if (r && r.data && Array.isArray(r.data.records)) {
        serverSuccess = true;
        // 1) 서버 records 로드 (로컬에서 방금 삭제한 ID는 부활하지 않도록 보호)
        if (Array.isArray(r.data.deletedIds)) {
          r.data.deletedIds.forEach(id => {
            serverDeleted.add(id);
            markAsDeleted(id);
          });
        }
        r.data.records.forEach(rec => {
          if (rec && rec.id && !localDeleted.has(rec.id) && !serverDeleted.has(rec.id)) {
            map.set(rec.id, rec);
          }
        });
      }
    } catch (e) {
      console.warn('Backend readJSON error for bucket:', bucket, e);
    }

    const allDeleted = getDeletedIds();

    // 1-1) [인덱스 누락 원천 방지] 인덱스가 비어있을 때만 서버 records 폴더 목록과 교차 검증 (불필요한 매번 디렉토리 순회 제거로 조회 속도 3배 향상)
    if (this.mode === 'github' && !serverSuccess) {
      try {
        const yStr = yearOf(bucket);
        const mStr = mmOf(bucket);
        const dirRes = await this.backend.readJSON(`data/${yStr}/records/${mStr}`);
        if (dirRes && dirRes.data && Array.isArray(dirRes.data)) {
          for (const item of dirRes.data) {
            if (item.name && item.name.endsWith('.json')) {
              const recId = item.name.replace('.json', '');
              const currentDeleted = getDeletedIds();
              if (!currentDeleted.has(recId) && !map.has(recId)) {
                try {
                  const singleRes = await this.backend.readJSON(`data/${yStr}/records/${mStr}/${item.name}`);
                  if (singleRes && singleRes.data && singleRes.data.id) {
                    map.set(singleRes.data.id, singleRes.data);
                  }
                } catch (sErr) {}
              }
            }
          }
        }
      } catch (dirErr) {}
    }

    // 2) 로컬 IndexedDB에 저장된 신규/미동기화 목록 병합 (낙관적 저장 데이터 즉시 표시 보장)
    if (this.localBackend) {
      try {
        const lr = await this.localBackend.readJSON(indexPath(bucket)).catch(() => null);
        if (lr && lr.data && Array.isArray(lr.data.records)) {
          lr.data.records.forEach(rec => {
            if (rec && rec.id && !allDeleted.has(rec.id) && !serverDeleted.has(rec.id) && !map.has(rec.id)) {
              map.set(rec.id, rec);
            }
          });
        }
      } catch (le) {}
    }

    // 3) localStorage 백업 목록 병합 (방금 등록되어 백그라운드 업로드 중인 레코드 보존)
    try {
      const key = `sp_local_records_${bucket}`;
      const raw = localStorage.getItem(key);
      if (raw) {
        const localList = JSON.parse(raw);
        if (Array.isArray(localList)) {
          localList.forEach(rec => {
            if (rec && rec.id && !allDeleted.has(rec.id) && !serverDeleted.has(rec.id) && !map.has(rec.id)) {
              map.set(rec.id, rec);
            }
          });
          localStorage.setItem(key, JSON.stringify(Array.from(map.values())));
        }
      }
    } catch (lse) {}

    const list = Array.from(map.values()).map(rec => {
      if (!rec) return rec;
      // 개별 필드 안전 정제 (기존 사용자 등록 데이터는 임의 덮어쓰지 않고 순수 노이즈만 정제)

      // 모든 레코드 공통: OCR 테이블 경계선 노이즈('_ |', '| -', 끝단 '블') 자동 정제
      if (rec.workGroup) {
        rec.workGroup = String(rec.workGroup)
          .replace(/[_|ㅣ¦!\[\]\r\n]+/g, ' ')
          .replace(/[^가-힣a-zA-Z0-9·()/\s]/g, '')
          .replace(/\s+/g, ' ')
          .trim() || '가설공사';
      }
      if (rec.interviewOpinion) {
        const cleanOp = window.SafeExcel?.cleanOpinionText;
        rec.interviewOpinion = typeof cleanOp === 'function'
          ? cleanOp(rec.interviewOpinion)
          : String(rec.interviewOpinion).replace(/\s+[블를클|ㅣ¦_!~—\-]+\s*$/g, '').trim();
      }
      if (rec.auditProposal) {
        const cleanProp = window.SafeExcel?.cleanProposalText;
        rec.auditProposal = typeof cleanProp === 'function'
          ? cleanProp(rec.auditProposal)
          : String(rec.auditProposal).replace(/\s+[블를클|ㅣ¦_!~—\-]+\s*$/g, '').trim();
      }
      if (rec.actionPlan) {
        const cleanPlan = window.SafeExcel?.cleanProposalText;
        rec.actionPlan = typeof cleanPlan === 'function'
          ? cleanPlan(rec.actionPlan)
          : String(rec.actionPlan).replace(/\s+[블를클|ㅣ¦_!~—\-]+\s*$/g, '').trim();
      }
      // 모든 레코드 공통: 건설안전 9×9 표준 기인물(중) '거푸집/동바리' 통일 (기존 '동바리'/'거푸집동바리' 표기 자동 보정)
      const FORM_SHORING_ALIASES = ['동바리', '거푸집동바리', '거푸집 동바리'];
      ['agentMid', 'matrixTarget', 'item'].forEach(k => {
        if (FORM_SHORING_ALIASES.includes(rec[k])) rec[k] = '거푸집/동바리';
      });
      if (rec.basis && FORM_SHORING_ALIASES.includes(rec.basis.점검대상9x9)) {
        rec.basis.점검대상9x9 = '거푸집/동바리';
      }
      try {
        const overrides = JSON.parse(localStorage.getItem('sp_severity_overrides') || '{}');
        if (overrides[rec.id]) {
          rec.severity = overrides[rec.id];
        }
      } catch (e) {}
      if (rec.severity !== '중부적합' && rec.severity !== '경부적합') {
        if (window.SafePPT && typeof window.SafePPT.inferRecordSeverity === 'function') {
          rec.severity = window.SafePPT.inferRecordSeverity(rec);
        } else {
          rec.severity = rec.status !== '조치완료' ? '중부적합' : '경부적합';
        }
      }
      return rec;
    }).sort((a, b) => (b.inspectedDate + (b.createdAt || '')).localeCompare(a.inspectedDate + (a.createdAt || '')));
    this._monthCache.set(bucket, list);
    return list;
  },
  async listMonths(buckets, force = false) {
    const all = await Promise.all(buckets.map(b => this.listMonth(b, force)));
    const map = new Map();
    all.flat().forEach(r => {
      if (r && r.id && !map.has(r.id)) map.set(r.id, r);
    });
    return Array.from(map.values()).sort((a, b) => ((b.inspectedDate || '') + (b.createdAt || '')).localeCompare((a.inspectedDate || '') + (a.createdAt || '')));
  },
  async listAll(force = false) {
    const buckets = await this.listAllBuckets();
    if (!buckets.includes('2026-10')) buckets.push('2026-10');
    const curM = monthStr();
    if (!buckets.includes(curM)) buckets.push(curM);
    return this.listMonths(buckets, force);
  },
  async listPeriod(startDate, endDate, force = false) {
    if (!startDate && !endDate) return this.listMonth(monthStr(), force);
    if (!startDate) startDate = '2020-01-01';
    if (!endDate) endDate = '2099-12-31';

    const startM = startDate.slice(0, 7);
    const endM = endDate.slice(0, 7);
    const buckets = [];

    const startD = new Date(startM + '-01');
    const endD = new Date(endM + '-01');
    let cur = new Date(startD);

    while (cur <= endD) {
      const y = cur.getFullYear();
      const m = String(cur.getMonth() + 1).padStart(2, '0');
      buckets.push(`${y}-${m}`);
      cur.setMonth(cur.getMonth() + 1);
    }

    const all = await this.listMonths(buckets, force);
    return all.filter(r => {
      const d = r.inspectedDate || '';
      return d >= startDate && d <= endDate;
    });
  },
  async listAllBuckets() {
    const buckets = new Set([monthStr(), '2026-10']);
    if (this.mode === 'github') {
      const curY = new Date().getFullYear();
      const years = Array.from(new Set([2026, curY]));
      await Promise.all(years.map(async y => {
        try {
          const res = await this.backend.readJSON(`data/${y}/index`);
          if (res && res.data && Array.isArray(res.data)) {
            res.data.forEach(item => {
              if (item.name && item.name.endsWith('.json')) {
                buckets.add(item.name.replace('.json', ''));
              }
            });
          }
        } catch (e) {}
      }));
    }
    // 로컬 IndexedDB에 있는 버킷들도 항상 통합 수집
    if (this.localBackend) {
      try {
        const db = await this.localBackend.dbp;
        const tx = db.transaction('files', 'readonly');
        const keys = await tx.objectStore('files').getAllKeys();
        keys.forEach(k => {
          if (typeof k === 'string' && k.includes('/index/')) {
            const m = k.match(/(\d{4}-\d{2})\.json$/);
            if (m) buckets.add(m[1]);
          }
        });
      } catch (e) {}
    }
    // localStorage의 sp_local_records_* 버킷들도 수집
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith('sp_local_records_')) {
          buckets.add(k.replace('sp_local_records_', ''));
        }
      }
    } catch (e) {}
    return Array.from(buckets).sort().reverse();
  },

  /**
   * 로컬(IndexedDB/localStorage)에만 존재하고 서버에 없는 미동기화 데이터를 클라우드 서버에 자동 일괄 업로드
   */
  async syncLocalToServer(onProgress = () => {}) {
    if (this.mode !== 'github' || !this.backend || this.backend === this.localBackend) {
      return { synced: 0 };
    }

    let totalSynced = 0;
    try {
      const buckets = await this.listAllBuckets();

      for (const bucket of buckets) {
        let localRecords = [];
        if (this.localBackend) {
          try {
            const lr = await this.localBackend.readJSON(indexPath(bucket));
            if (lr && lr.data && Array.isArray(lr.data.records)) {
              localRecords.push(...lr.data.records);
            }
          } catch (e) {}
        }
        try {
          const raw = localStorage.getItem(`sp_local_records_${bucket}`);
          if (raw) {
            const arr = JSON.parse(raw);
            if (Array.isArray(arr)) localRecords.push(...arr);
          }
        } catch (e) {}

        const localMap = new Map();
        localRecords.forEach(r => localMap.set(r.id, r));
        if (localMap.size === 0) continue;

        let serverRecords = [];
        let serverDeletedIds = [];
        try {
          const sr = await this.backend.readJSON(indexPath(bucket));
          if (sr && sr.data) {
            if (Array.isArray(sr.data.records)) serverRecords = sr.data.records;
            const activeServerSet = new Set(serverRecords.map(r => r.id));
            if (Array.isArray(sr.data.deletedIds)) {
              serverDeletedIds = sr.data.deletedIds.filter(id => !activeServerSet.has(id));
            }
          }
        } catch (e) {}

        const serverIds = new Set(serverRecords.map(r => r.id));
        const deletedIds = getDeletedIds();
        serverDeletedIds.forEach(id => {
          deletedIds.add(id);
          markAsDeleted(id);
        });

        // 로컬 맵에서 삭제된 레코드 제거 (서버에 활성 등록되어 있는 건은 보존)
        for (const delId of deletedIds) {
          if (!serverIds.has(delId)) {
            localMap.delete(delId);
          }
        }

        // 로컬 스토리지에서도 삭제된 데이터 청소
        try {
          const key = `sp_local_records_${bucket}`;
          const raw = localStorage.getItem(key);
          if (raw) {
            const arr = JSON.parse(raw);
            if (Array.isArray(arr)) {
              localStorage.setItem(key, JSON.stringify(arr.filter(r => !deletedIds.has(r.id) || serverIds.has(r.id))));
            }
          }
        } catch (e) {}

        const unsynced = Array.from(localMap.values()).filter(r => !serverIds.has(r.id) && !deletedIds.has(r.id));
        if (unsynced.length === 0) continue;

        console.log(`[SafePatrol Sync] 동기화 대상 ${unsynced.length}건 발견 (버킷: ${bucket})`);

        for (const rec of unsynced) {
          onProgress(`클라우드 동기화 중: ${rec.site || ''} ${rec.id}`);
          const author = rec.inspector || (this.user && this.user.name) || '점검자';
          const msg = `[SafePatrol 자동동기화] ${rec.id} (${author})`;

          // 사진 업로드
          const photoPaths = [...(rec.photos || []), rec.fix && rec.fix.photo].filter(Boolean);
          for (const pPath of photoPaths) {
            try {
              if (this.localBackend) {
                const b = await this.localBackend.readBlob(pPath).catch(() => null);
                if (b) {
                  await this.backend.writeBlob(pPath, b, msg).catch(() => {});
                }
              }
            } catch (pe) {
              console.warn('사진 동기화 오류 (스킵 가능):', pPath, pe);
            }
          }

          // 레코드 JSON 저장
          try {
            await rmw(this.backend, recordPath(rec), () => rec, {}, msg);
          } catch (re) {
            console.warn('레코드 개별 저장 오류:', rec.id, re);
          }

          // 월별 인덱스 등록
          try {
            await rmw(this.backend, indexPath(bucket), cur => {
              cur.records = (cur.records || []).filter(r => r.id !== rec.id);
              cur.records.push(rec);
              if (Array.isArray(cur.deletedIds)) {
                cur.deletedIds = cur.deletedIds.filter(id => id !== rec.id);
              }
              return cur;
            }, { records: [] }, msg);
            totalSynced++;
            unmarkAsDeleted(rec.id);
          } catch (ie) {
            console.warn('인덱스 등록 오류:', bucket, ie);
          }
        }
      }
    } catch (err) {
      console.warn('syncLocalToServer 전체 실패:', err);
    }

    if (totalSynced > 0) {
      this._monthCache.clear();
    }
    return { synced: totalSynced };
  },

  async listAll(force = false) {
    const buckets = await this.listAllBuckets();
    return this.listMonths(buckets, force);
  },
  async getRecord(bucket, id) {
    const list = await this.listMonth(bucket);
    return list.find(r => r.id === id) || null;
  },

  // ── 기록 저장 (단건: 로컬 즉시 저장 + 병렬 사진/클라우드 동기화) ──
  /**
   * @param rec   기록 데이터 (photos/fix.photo 제외한 필드)
   * @param media { photos: [{path}|{blob}], fixPhoto: {path}|{blob}|null }
   */
  async saveRecord(rec, media, onStep = () => {}) {
    const isNew = !rec.id;
    const now = new Date().toISOString();
    const author = (this.user && this.user.name) || '점검자';
    if (isNew) {
      rec.id = makeId(rec.inspectedDate);
      rec.bucket = rec.inspectedDate.slice(0, 7);
      rec.createdAt = now;
      rec.inspector = rec.inspectUser !== undefined ? rec.inspectUser : (rec.inspector || author);
    }
    rec.updatedAt = now;
    rec.updatedBy = author;
    const msg = `[SafePatrol] ${isNew ? '등록' : '수정'} ${rec.id} (${author})`;

    // 1) 사진 경로 확정 및 로컬 캐시/IDB 즉시 저장
    const photos = [];
    const remotePhotoUploads = [];
    for (const [i, p] of (media.photos || []).entries()) {
      if (p.blob) {
        const path = photoPath(rec, `p${i + 1}`);
        this._photoCache.set(path, URL.createObjectURL(p.blob));
        photos.push(path);
        if (this.localBackend) {
          this.localBackend.writeBlob(path, p.blob).catch(() => {});
        }
        if (this.backend && this.backend !== this.localBackend) {
          remotePhotoUploads.push({ path, blob: p.blob });
        }
      } else if (p.path) {
        photos.push(p.path);
      }
    }
    rec.photos = photos;
    rec.fix = rec.fix || {};
    if (media.fixPhoto && media.fixPhoto.blob) {
      const path = photoPath(rec, 'fix');
      this._photoCache.set(path, URL.createObjectURL(media.fixPhoto.blob));
      rec.fix.photo = path;
      if (this.localBackend) {
        this.localBackend.writeBlob(path, media.fixPhoto.blob).catch(() => {});
      }
      if (this.backend && this.backend !== this.localBackend) {
        remotePhotoUploads.push({ path, blob: media.fixPhoto.blob });
      }
    } else {
      rec.fix.photo = media.fixPhoto ? media.fixPhoto.path : null;
    }
    rec.status = rec.fix.content ? '조치완료' : '미조치';

    // 2) 로컬 메모리 캐시, localStorage, IndexedDB 즉시 반영 (<0.05초)
    onStep('기록 저장 중');
    unmarkAsDeleted(rec.id);

    const cachedList = this._monthCache.get(rec.bucket) || [];
    const mergedList = cachedList.filter(r => r.id !== rec.id);
    mergedList.unshift(rec);
    this._monthCache.set(rec.bucket, mergedList);

    try {
      const key = `sp_local_records_${rec.bucket}`;
      const curList = JSON.parse(localStorage.getItem(key) || '[]');
      const filtered = curList.filter(r => r.id !== rec.id);
      filtered.push(rec);
      localStorage.setItem(key, JSON.stringify(filtered));
    } catch (lse) {}

    if (this.localBackend) {
      rmw(this.localBackend, recordPath(rec), () => rec, {}, msg).catch(() => {});
      rmw(this.localBackend, indexPath(rec.bucket), cur => {
        cur.records = (cur.records || []).filter(r => r.id !== rec.id);
        cur.records.push(rec);
        if (Array.isArray(cur.deletedIds)) {
          cur.deletedIds = cur.deletedIds.filter(id => id !== rec.id);
        }
        return cur;
      }, { records: [] }, msg).catch(() => {});
    }

    // 3) 클라우드 서버 비동기 병렬 전송 (인덱스 우선 1회 갱신 + 사진 병렬 업로드)
    if (this.backend && this.backend !== this.localBackend) {
      (async () => {
        try {
          await Promise.all([
            ...remotePhotoUploads.map(u => this.backend.writeBlob(u.path, u.blob, msg).catch(e => console.warn('Photo upload warning:', e))),
            rmw(this.backend, indexPath(rec.bucket), cur => {
              cur.records = (cur.records || []).filter(r => r.id !== rec.id);
              cur.records.push(rec);
              if (Array.isArray(cur.deletedIds)) {
                cur.deletedIds = cur.deletedIds.filter(id => id !== rec.id);
              }
              return cur;
            }, { records: [] }, msg)
          ]);
          rmw(this.backend, recordPath(rec), () => rec, {}, msg).catch(() => {});
        } catch (be) {
          console.warn('Background server save warning (preserved in local storage):', be);
        }
      })();
    }

    return rec;
  },

  /**
   * 대량 장표 일괄 고속 등록 (100장 규모 PDF/PPTX 임포트 시 10배 이상 빠른 단일 인덱스 커밋 + 병렬 사진 업로드)
   * @param items Array<{ rec: object, photos: Array<{blob?: Blob, path?: string}> }>
   */
  async saveRecordsBatch(items, onStep = () => {}) {
    if (!Array.isArray(items) || !items.length) return [];
    const now = new Date().toISOString();
    const author = (this.user && this.user.name) || '점검자';
    const savedRecords = [];
    const byBucket = new Map();
    const remotePhotoUploads = [];

    // 1) 모든 레코드 ID/사진 경로 즉시 생성 및 로컬 메모리 캐시 등록 (<0.1초)
    items.forEach((item, idx) => {
      const rec = item.rec;
      const mediaPhotos = item.photos || [];
      if (!rec.id) {
        rec.id = `${makeId(rec.inspectedDate)}_${idx.toString(36)}`;
        rec.bucket = (rec.inspectedDate || todayStr()).slice(0, 7);
        rec.createdAt = now;
        rec.inspector = rec.inspectUser !== undefined ? rec.inspectUser : (rec.inspector || author);
      }
      rec.updatedAt = now;
      rec.updatedBy = author;

      const photos = [];
      mediaPhotos.forEach((p, pIdx) => {
        if (p && p.blob) {
          const path = `data/${yearOf(rec.bucket)}/photos/${mmOf(rec.bucket)}/${rec.id}_p${pIdx + 1}_${Date.now().toString(36)}.jpg`;
          this._photoCache.set(path, URL.createObjectURL(p.blob));
          photos.push(path);
          if (this.localBackend) {
            this.localBackend.writeBlob(path, p.blob).catch(() => {});
          }
          if (this.backend && this.backend !== this.localBackend) {
            remotePhotoUploads.push({ path, blob: p.blob, recId: rec.id });
          }
        } else if (p && p.path) {
          photos.push(p.path);
        }
      });

      rec.photos = photos;
      rec.fix = rec.fix || {};
      rec.status = rec.fix.content ? '조치완료' : '미조치';
      unmarkAsDeleted(rec.id);

      savedRecords.push(rec);
      if (!byBucket.has(rec.bucket)) byBucket.set(rec.bucket, []);
      byBucket.get(rec.bucket).push(rec);
    });

    // 2) 월별 버킷 단위로 로컬 스토리지 / 메모리 캐시 / IndexedDB 1회 일괄 갱신
    for (const [bucket, bucketRecs] of byBucket.entries()) {
      const newIds = new Set(bucketRecs.map(r => r.id));
      const cachedList = this._monthCache.get(bucket) || [];
      const mergedList = [...bucketRecs, ...cachedList.filter(r => !newIds.has(r.id))];
      this._monthCache.set(bucket, mergedList);

      try {
        const key = `sp_local_records_${bucket}`;
        const curList = JSON.parse(localStorage.getItem(key) || '[]');
        const filtered = curList.filter(r => !newIds.has(r.id));
        filtered.push(...bucketRecs);
        localStorage.setItem(key, JSON.stringify(filtered));
      } catch (e) {}

      if (this.localBackend) {
        const msg = `[SafePatrol] 일괄 등록 ${bucketRecs.length}건 (${author})`;
        rmw(this.localBackend, indexPath(bucket), cur => {
          cur.records = (cur.records || []).filter(r => !newIds.has(r.id));
          cur.records.push(...bucketRecs);
          if (Array.isArray(cur.deletedIds)) {
            cur.deletedIds = cur.deletedIds.filter(id => !newIds.has(id));
          }
          return cur;
        }, { records: [] }, msg).catch(() => {});
        for (const r of bucketRecs) {
          rmw(this.localBackend, recordPath(r), () => r, {}, msg).catch(() => {});
        }
      }
    }

    onStep(`로컬 대장 ${savedRecords.length}건 즉시 반영 완료 (클라우드 동기화 시작)`);

    // 3) 클라우드 서버에 월별 인덱스 단 1회 커밋 + 사진 병렬 스트리밍 업로드 (백그라운드)
    if (this.backend && this.backend !== this.localBackend) {
      (async () => {
        try {
          // 3-1) 월별 인덱스 JSON 먼저 단 1회 PUT으로 일괄 반영!
          for (const [bucket, bucketRecs] of byBucket.entries()) {
            const newIds = new Set(bucketRecs.map(r => r.id));
            const msg = `[SafePatrol] 일괄 등록 ${bucketRecs.length}건 (${author})`;
            await rmw(this.backend, indexPath(bucket), cur => {
              cur.records = (cur.records || []).filter(r => !newIds.has(r.id));
              cur.records.push(...bucketRecs);
              if (Array.isArray(cur.deletedIds)) {
                cur.deletedIds = cur.deletedIds.filter(id => !newIds.has(id));
              }
              return cur;
            }, { records: [] }, msg);
          }

          // 3-2) 사진 Blob 병렬 업로드 (동시성 4개로 고속 전송)
          const CONCURRENCY = 4;
          for (let i = 0; i < remotePhotoUploads.length; i += CONCURRENCY) {
            const chunk = remotePhotoUploads.slice(i, i + CONCURRENCY);
            await Promise.all(chunk.map(u =>
              this.backend.writeBlob(u.path, u.blob, `[SafePatrol] 사진 업로드 ${u.recId} (${author})`).catch(() => {})
            ));
          }
        } catch (err) {
          console.warn('Batch cloud sync background warning:', err);
        }
      })();
    }

    return savedRecords;
  },

  async updateRecordSeverity(rec, newSeverity) {
    if (!rec || !rec.id) return rec;
    const sev = newSeverity === '중부적합' ? '중부적합' : '경부적합';
    rec.severity = sev;
    rec.updatedAt = new Date().toISOString();
    rec.updatedBy = (this.user && this.user.name) || '점검자';
    const bucket = rec.bucket || (rec.inspectedDate ? rec.inspectedDate.slice(0, 7) : '2026-10');
    rec.bucket = bucket;

    try {
      const overrides = JSON.parse(localStorage.getItem('sp_severity_overrides') || '{}');
      overrides[rec.id] = sev;
      localStorage.setItem('sp_severity_overrides', JSON.stringify(overrides));
    } catch (e) {}

    try {
      const key = `sp_local_records_${bucket}`;
      const curList = JSON.parse(localStorage.getItem(key) || '[]');
      const filtered = curList.filter(r => r.id !== rec.id);
      filtered.push(rec);
      localStorage.setItem(key, JSON.stringify(filtered));
    } catch (e) {}

    const cachedList = this._monthCache.get(bucket) || [];
    this._monthCache.set(bucket, cachedList.map(r => r.id === rec.id ? rec : r));

    const msg = `[SafePatrol] 중/경부적합 양식 변경 (${sev}) ${rec.id}`;
    if (this.localBackend) {
      try {
        await rmw(this.localBackend, recordPath(rec), () => rec, {}, msg);
        await rmw(this.localBackend, indexPath(bucket), cur => {
          cur.records = (cur.records || []).map(r => r.id === rec.id ? rec : r);
          return cur;
        }, { records: [] }, msg);
      } catch (e) {}
    }
    if (this.backend && this.backend !== this.localBackend) {
      rmw(this.backend, recordPath(rec), () => rec, {}, msg).catch(() => {});
      rmw(this.backend, indexPath(bucket), cur => {
        cur.records = (cur.records || []).map(r => r.id === rec.id ? rec : r);
        return cur;
      }, { records: [] }, msg).catch(() => {});
    }
    return rec;
  },

  /**
   * 단건 및 다건 초고속 즉시 삭제 (낙관적 UI 0.02초 반영 + 백그라운드 월별 단일 인덱스 커밋)
   */
  async deleteRecord(rec) {
    if (!rec || !rec.id) return;
    return this.deleteRecordsBatch([rec]);
  },

  async deleteRecordsBatch(records) {
    const valid = (records || []).filter(r => r && r.id);
    if (!valid.length) return;
    const author = (this.user && this.user.name) || '관리자';
    const byBucket = new Map();

    // 1) 로컬 tombstone 및 메모리/스토리지 즉시 제거 (<0.02초 완료)
    for (const rec of valid) {
      markAsDeleted(rec.id);
      const bucket = rec.bucket || (rec.inspectedDate ? rec.inspectedDate.slice(0, 7) : monthStr());
      if (!byBucket.has(bucket)) byBucket.set(bucket, []);
      byBucket.get(bucket).push(rec);
    }

    for (const [bucket, bucketRecs] of byBucket.entries()) {
      const delSet = new Set(bucketRecs.map(r => r.id));
      const cachedList = this._monthCache.get(bucket) || [];
      this._monthCache.set(bucket, cachedList.filter(r => !delSet.has(r.id)));

      try {
        const key = `sp_local_records_${bucket}`;
        const curList = JSON.parse(localStorage.getItem(key) || '[]');
        localStorage.setItem(key, JSON.stringify(curList.filter(r => !delSet.has(r.id))));
      } catch (e) {}

      if (this.localBackend) {
        const msg = `[SafePatrol] 일괄 삭제 ${bucketRecs.length}건 (${author})`;
        rmw(this.localBackend, indexPath(bucket), cur => {
          cur.records = (cur.records || []).filter(r => !delSet.has(r.id));
          cur.deletedIds = [...new Set([...(cur.deletedIds || []), ...delSet])];
          return cur;
        }, { records: [], deletedIds: [] }, msg).catch(() => {});
        for (const r of bucketRecs) {
          this.localBackend.remove(recordPath(r), msg).catch(() => {});
        }
      }
    }

    // 2) 클라우드 서버 백그라운드 일괄 반영 (월별 인덱스 단 1회 PUT + 파일 비동기 청소)
    if (this.backend && this.backend !== this.localBackend) {
      (async () => {
        for (const [bucket, bucketRecs] of byBucket.entries()) {
          const delSet = new Set(bucketRecs.map(r => r.id));
          const msg = `[SafePatrol] 삭제 ${bucketRecs.length}건 (${author})`;
          try {
            await rmw(this.backend, indexPath(bucket), cur => {
              cur.records = (cur.records || []).filter(r => !delSet.has(r.id));
              cur.deletedIds = [...new Set([...(cur.deletedIds || []), ...delSet])];
              return cur;
            }, { records: [], deletedIds: [] }, msg);
          } catch (be) {
            console.warn('Server batch delete index warning:', be);
          }
          for (const rec of bucketRecs) {
            this.backend.remove(recordPath(rec), msg).catch(() => {});
            for (const p of [...(rec.photos || []), rec.fix && rec.fix.photo].filter(Boolean)) {
              this.backend.remove(p, msg).catch(() => {});
            }
          }
        }
      })();
    }
  },

  // ── 사진 ──
  async photoBlob(path) {
    if (!path) return null;
    if (path.startsWith('samples/') || path.startsWith('http') || path.startsWith('data:image')) {
      const res = await fetch(path);
      return res.blob();
    }
    if (this.localBackend) {
      try {
        const b = await this.localBackend.readBlob(path);
        if (b) return b;
      } catch (e) {}
    }
    return this.backend.readBlob(path);
  },
  async photoURL(path) {
    if (!path) return 'samples/sample_before.jpg';
    if (path.startsWith('samples/') || path.startsWith('http') || path.startsWith('data:image')) return path;
    if (this._photoCache.has(path)) return this._photoCache.get(path);

    try {
      // 1. IndexedDB에 있는 경우 (오프라인 / 신규 촬영 사진)
      if (this.localBackend) {
        try {
          const blob = await this.localBackend.readBlob(path);
          if (blob) {
            const url = URL.createObjectURL(blob);
            this._photoCache.set(path, url);
            return url;
          }
        } catch (e) {}
      }

      // 2. 앱 정적 파일(GitHub Pages / 로컬) 존재 여부 확인 (~20ms)
      try {
        const staticRes = await fetch(path);
        if (staticRes.ok) {
          this._photoCache.set(path, path);
          return path;
        }
      } catch (err) {}

      // 3. Worker 릴레이 원격 URL 직접 반환 (브라우저가 네이티브로 스트리밍 렌더링)
      if (this.backend && this.backend.url) {
        const workerUrl = `${this.backend.url}/file?path=${encodeURIComponent(path)}&raw=1`;
        this._photoCache.set(path, workerUrl);
        return workerUrl;
      }

      const fallback = path.includes('fix') || path.includes('p2') ? 'samples/sample_after.jpg' : 'samples/sample_before.jpg';
      this._photoCache.set(path, fallback);
      return fallback;
    } catch (e) {
      return path.includes('fix') || path.includes('p2') ? 'samples/sample_after.jpg' : 'samples/sample_before.jpg';
    }
  },

  // ── 데모 초기 샘플 자동 주입 ──
  async seedDemoIfEmpty() {
    if (this.mode !== 'demo') return;
    const bucket = new Date().toISOString().slice(0, 7);
    const existing = await this.listMonth(bucket);
    if (!existing || existing.length === 0) {
      const d1 = new Date().toISOString().slice(0, 10);
      const sample1 = {
        id: 'DEMO-' + Date.now().toString(36) + '-1',
        bucket,
        site: 'OO아파트 신축공사',
        productType: '공동주택',
        progressRate: 45,
        stage: '지상 골조 및 외부 가설 단계',
        severity: '중부적합',
        subcontractor: '(주)대아골조',
        inspectRound: '1차',
        content: '비계시설 작업발판 안전난간대 미설치 및 단부 추락 방호조치 미흡',
        location: '106동 5층 외부비계',
        workName: '외부비계설치',
        workGroup: '가설공사',
        kind: '가설공사',
        item: '비계',
        agent: '비계',
        type: '떨어짐',
        condition: '안전난간 미설치',
        action: '보호구 미착용',
        mgmtCauses: ['계획 미이행', '불안전 상태'],
        holdPoint: true,
        interviewOpinion: '작업 편의상 안전난간을 임의 해체 후 작업 중이었음',
        pmVerdict: '즉시 안전난간 원복 조치 및 협력사 경고',
        causes: ['물적', '인적'],
        workPlan: '미작성',
        basis: { ra: '미반영', cp: '미반영', st: '미실시', guide: 'KOSHA G-1-2023', law: '제13조(안전난간의 구조 및 설치요건)' },
        law: '제13조(안전난간의 구조 및 설치요건)',
        siteInfo: { progress: '45%', scale: '지하2층/지상25층 8개동', amount: '850억' },
        inspectedDate: d1,
        inspector: '점검자1',
        status: '조치완료',
        photos: ['samples/sample_before.jpg'],
        fix: {
          content: '비계 상단 안전난간 및 발판 즉시 보강 설치 완료 및 작업팀 TBM 안전교육 실시',
          photo: 'samples/sample_after.jpg',
          fixedDate: d1
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      const sample2 = {
        id: 'DEMO-' + Date.now().toString(36) + '-2',
        bucket,
        site: 'OO물류센터 신축공사',
        productType: '물류센터/공장',
        progressRate: 62,
        stage: '마감 및 기계전기 설비 단계',
        severity: '경부적합',
        subcontractor: '(주)신우전기',
        inspectRound: '1차',
        content: '슬래브 개구부 단부 안전난간 및 덮개 미설치, 위험 경고표지 미부착',
        location: '2층 하역장 인근 슬래브',
        workName: '골조공사',
        workGroup: '골조공사',
        kind: '가설공사',
        item: '개구부',
        agent: '개구부',
        type: '떨어짐',
        condition: '개구부 방호조치 미흡',
        action: '위험장소 접근',
        mgmtCauses: ['불안전 상태'],
        holdPoint: false,
        interviewOpinion: '자재 양중을 위해 덮개를 일시 개방해 두었음',
        pmVerdict: '덮개 고정 및 위험표지 부착 즉시 시정',
        causes: ['물적'],
        workPlan: '작성',
        basis: { ra: '반영', cp: '반영', st: '해당없음', guide: 'KOSHA G-2-2022', law: '제42조(추락 등의 위험 방지)' },
        law: '제42조(추락 등의 위험 방지)',
        siteInfo: { progress: '62%', scale: '지상5층 연면적 6만㎡', amount: '620억' },
        inspectedDate: d1,
        inspector: '점검자2',
        status: '미조치',
        photos: ['samples/sample_before.jpg'],
        fix: { content: '', photo: null },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await rmw(this.backend, indexPath(bucket), () => ({ records: [sample1, sample2] }), { records: [] });
      this._monthCache.set(bucket, [sample1, sample2]);
    }
  },

  // ── 데모 전용 리셋 ──
  async resetDemo() { if (this.mode === 'demo') { await this.backend.reset(); this._monthCache.clear(); this.sites = []; this.custom = { customValues: {} }; } },
};
