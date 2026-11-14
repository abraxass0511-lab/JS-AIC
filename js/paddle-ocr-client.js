/**
 * SafePatrol v2.0 — 브라우저 내장형 한국어 PaddleOCR (korean_PP-OCRv5_mobile_rec ONNX) 엔진
 * - 외부 파이썬 서버나 유료 API 없이 GitHub Pages 정적 웹에서 24시간 무료 동작
 * - IndexedDB에 ONNX 모델(13MB) 및 사전(11,945자) 영구 캐싱
 * - 단문 셀은 rec 직결, 다중 줄 셀은 수평 투영 줄 분할 후 rec 직결하여 페이지당 0.6~1.0초 고속 인식
 */

import { preprocessCellCanvas, splitCanvasIntoLineCanvases } from './sheet-layout.js?v=20261114_v35';
import { normalizeFieldText } from './text-normalizer.js?v=20261114_v35';

const MODEL_CACHE_DB = 'SafePatrolOCRModelCache_v5';
const MODEL_CACHE_STORE = 'assets';
const REC_MODEL_KEY = 'korean_PP-OCRv5_mobile_rec_v1';
const DICT_KEY = 'korean_dict_v5_v1';

const SINGLE_LINE_KEYS = new Set([
  'sub', 'work', 'loc', 'user', 'round',
  'type', 'propType', 'pm', 'banner', 'banner2'
]);

let _ortPromise = null;
let _sessionPromise = null;
let _charList = null;
let _inferQueue = Promise.resolve();

function runSessionExclusive(session, feeds) {
  const next = _inferQueue.then(() => session.run(feeds));
  _inferQueue = next.catch(() => {});
  return next;
}

/**
 * IndexedDB 캐시 읽기/쓰기 헬퍼
 */
function openModelCacheDB() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return resolve(null);
    const req = indexedDB.open(MODEL_CACHE_DB, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(MODEL_CACHE_STORE)) {
        db.createObjectStore(MODEL_CACHE_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
  });
}

async function getCachedAsset(key) {
  const db = await openModelCacheDB();
  if (!db) return null;
  return new Promise(resolve => {
    try {
      const tx = db.transaction(MODEL_CACHE_STORE, 'readonly');
      const req = tx.objectStore(MODEL_CACHE_STORE).get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    } catch (e) {
      resolve(null);
    }
  });
}

async function setCachedAsset(key, val) {
  const db = await openModelCacheDB();
  if (!db) return;
  return new Promise(resolve => {
    try {
      const tx = db.transaction(MODEL_CACHE_STORE, 'readwrite');
      tx.objectStore(MODEL_CACHE_STORE).put(val, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch (e) {
      resolve();
    }
  });
}

/**
 * onnxruntime-web 동적 로더
 */
async function ensureOrtLoaded() {
  if (typeof window !== 'undefined' && window.ort) return window.ort;
  if (_ortPromise) return _ortPromise;

  _ortPromise = new Promise((resolve, reject) => {
    if (typeof document === 'undefined') {
      return reject(new Error('Browser document environment required for onnxruntime-web'));
    }
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.20.1/dist/ort.min.js';
    script.async = true;
    script.onload = () => {
      if (window.ort) {
        window.ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.20.1/dist/';
        window.ort.env.wasm.numThreads = Math.min(4, (navigator && navigator.hardwareConcurrency) || 2);
        window.ort.env.wasm.simd = true;
        resolve(window.ort);
      } else {
        reject(new Error('window.ort not found after script load'));
      }
    };
    script.onerror = (err) => reject(err);
    document.head.appendChild(script);
  });
  return _ortPromise;
}

/**
 * 모델 및 한국어 사전 URL 해석 (GitHub Pages 서브경로 및 로컬 루트 모두 호환)
 */
function resolveModelAssetUrl(filename) {
  try {
    return new URL(`../models/${filename}`, import.meta.url).href;
  } catch (e) {
    return `./models/${filename}`;
  }
}

/**
 * korean_PP-OCRv5_mobile_rec ONNX 세션 및 사전 초기화 (최초 1회)
 */
export async function initPaddleOcr() {
  if (_sessionPromise) return _sessionPromise;

  _sessionPromise = (async () => {
    const ort = await ensureOrtLoaded();
    if (ort.env && ort.env.wasm) {
      ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.20.1/dist/';
      // GitHub Pages 등 COOP/COEP 미적용 환경에서는 numThreads=1로 고정하여 SharedArrayBuffer 오류 방지
      const isIsolated = typeof window !== 'undefined' && window.crossOriginIsolated;
      ort.env.wasm.numThreads = isIsolated ? Math.min(4, (navigator && navigator.hardwareConcurrency) || 2) : 1;
      ort.env.wasm.simd = true;
    }

    // 1. 한국어 사전 로드 (IndexedDB 우선)
    let dictText = await getCachedAsset(DICT_KEY);
    if (!dictText) {
      const dictUrl = resolveModelAssetUrl('korean_dict.txt');
      const res = await fetch(dictUrl);
      if (!res.ok) throw new Error(`Failed to fetch korean_dict.txt: ${res.status}`);
      dictText = await res.text();
      await setCachedAsset(DICT_KEY, dictText);
    }
    const rawLines = dictText.split(/\r?\n/);
    if (rawLines.length && rawLines[rawLines.length - 1] === '') {
      rawLines.pop();
    }
    // CTCLabelDecode: 0 = blank, 1..N = dict chars, N+1 = ' ' (space)
    _charList = ['blank', ...rawLines, ' '];

    // 2. ONNX 모델 바이너리 로드 (IndexedDB 우선)
    let modelBuffer = await getCachedAsset(REC_MODEL_KEY);
    if (!modelBuffer) {
      const modelUrl = resolveModelAssetUrl('korean_PP-OCRv5_mobile_rec.onnx');
      const res = await fetch(modelUrl);
      if (!res.ok) throw new Error(`Failed to fetch korean_PP-OCRv5_mobile_rec.onnx: ${res.status}`);
      modelBuffer = await res.arrayBuffer();
      await setCachedAsset(REC_MODEL_KEY, modelBuffer);
    }

    const session = await ort.InferenceSession.create(modelBuffer, {
      executionProviders: ['wasm'],
      graphOptimizationLevel: 'all'
    });

    return { ort, session, charList: _charList };
  })().catch(err => {
    _sessionPromise = null;
    throw err;
  });

  return _sessionPromise;
}

/**
 * 단일 줄(Single-Line) 캔버스를 높이 48px, 원본 종횡비 유지 + 좌우 8px 에지 패딩으로 정규화하여
 * korean_PP-OCRv5_mobile_rec ONNX 모델로 추론 및 CTC 디코딩 수행
 * @param {HTMLCanvasElement} lineCanvas
 * @returns {Promise<{ text: string, confidence: number, minCharConfidence: number }>}
 */
export async function recognizeSingleLineCanvas(lineCanvas) {
  if (!lineCanvas || lineCanvas.width < 4 || lineCanvas.height < 4) {
    return { text: '', confidence: 1.0, minCharConfidence: 1.0 };
  }

  const { ort, session, charList } = await initPaddleOcr();
  const h = lineCanvas.height;
  const w = lineCanvas.width;

  const targetH = 48;
  const scale = targetH / h;
  const targetW = Math.max(32, Math.round(w * scale));
  const padX = 8;
  const totalW = targetW + padX * 2;

  const normCanvas = document.createElement('canvas');
  normCanvas.width = totalW;
  normCanvas.height = targetH;
  const ctx = normCanvas.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  // 좌우 8px 에지 복제 효과(배경색 채움 후 중앙 그리기)
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, totalW, targetH);
  ctx.drawImage(lineCanvas, 0, 0, w, h, padX, 0, targetW, targetH);
  // 좌측/우측 1px 컬럼을 패딩 영역에 복제하여 적색 배너 등 유색 배경에서도 경계 아티팩트 방지
  ctx.drawImage(normCanvas, padX, 0, 1, targetH, 0, 0, padX, targetH);
  ctx.drawImage(normCanvas, padX + targetW - 1, 0, 1, targetH, padX + targetW, 0, padX, targetH);

  const { data } = ctx.getImageData(0, 0, totalW, targetH);
  const planeSize = targetH * totalW;
  const floatData = new Float32Array(3 * planeSize);

  // PaddleOCR 표준 정규화: BGR 채널 순서, (pixel / 255.0 - 0.5) / 0.5
  for (let i = 0; i < planeSize; i++) {
    const r = data[i * 4];
    const g = data[i * 4 + 1];
    const b = data[i * 4 + 2];
    floatData[i] = (b / 255.0 - 0.5) / 0.5;
    floatData[planeSize + i] = (g / 255.0 - 0.5) / 0.5;
    floatData[planeSize * 2 + i] = (r / 255.0 - 0.5) / 0.5;
  }

  const inputName = session.inputNames[0];
  const tensor = new ort.Tensor('float32', floatData, [1, 3, targetH, totalW]);
  const feeds = { [inputName]: tensor };
  // 다중 페이지(BATCH_SIZE = 6) Promise.all 병렬 호출 시 ORT WASM 'Session already started' 충돌 방지를 위한 직렬화 뮤텍스 큐
  const results = await runSessionExclusive(session, feeds);
  const outputTensor = results[session.outputNames[0]];
  const logits = outputTensor.data;
  const dims = outputTensor.dims; // [1, T, numClasses]
  const seqLen = dims[1];
  const numClasses = dims[2];

  let outChars = '';
  const charConfs = [];
  let prevIdx = -1;

  for (let t = 0; t < seqLen; t++) {
    const offset = t * numClasses;
    let maxIdx = 0;
    let maxVal = logits[offset];
    for (let c = 1; c < numClasses; c++) {
      const v = logits[offset + c];
      if (v > maxVal) {
        maxVal = v;
        maxIdx = c;
      }
    }
    if (maxIdx > 0 && maxIdx < charList.length && maxIdx !== prevIdx) {
      const ch = charList[maxIdx];
      outChars += ch;
      if (ch !== ' ') {
        charConfs.push(maxVal);
      }
    }
    prevIdx = maxIdx;
  }

  const text = outChars.trim();
  const confidence = charConfs.length
    ? charConfs.reduce((a, b) => a + b, 0) / charConfs.length
    : 1.0;
  const minCharConfidence = charConfs.length
    ? Math.min(...charConfs)
    : 1.0;

  return { text, confidence, minCharConfidence };
}

/**
 * 개별 셀 캔버스 전처리 + 줄 분할 + PaddleOCR 인식 통합 함수
 * @param {HTMLCanvasElement} rawCellCanvas
 * @param {string} cellKey - 'sub'|'work'|'loc'|'user'|'round'|'type'|'law'|'content'|'interview'|'propType'|'propText'|'cm'|'pm'|'banner'|'banner2'
 * @returns {Promise<{ text: string, rawText: string, confidence: number, minCharConfidence: number, needsVisionRetry: boolean, lowConfidence: boolean }>}
 */
export async function recognizeCellWithPaddle(rawCellCanvas, cellKey = '') {
  if (!rawCellCanvas || rawCellCanvas.width < 4 || rawCellCanvas.height < 4) {
    return { text: '', rawText: '', confidence: 1.0, minCharConfidence: 1.0, needsVisionRetry: false, lowConfidence: false };
  }

  const isBanner = cellKey === 'banner' || cellKey === 'banner2';
  const cleanCanvas = preprocessCellCanvas(rawCellCanvas, isBanner ? 0 : 2, 8, { cellKey, isBanner });

  const isSingleLine = SINGLE_LINE_KEYS.has(cellKey);
  const lineCanvases = splitCanvasIntoLineCanvases(cleanCanvas, { isBanner });

  const lineTexts = [];
  const lineConfs = [];
  let minCharConf = 1.0;

  for (const lc of lineCanvases) {
    const { text, confidence, minCharConfidence } = await recognizeSingleLineCanvas(lc);
    if (text) {
      lineTexts.push(text);
      lineConfs.push(confidence);
      if (minCharConfidence < minCharConf) minCharConf = minCharConfidence;
    }
  }

  const rawJoined = lineTexts.join(isSingleLine ? ' ' : '\n').trim();
  const normalized = normalizeFieldText(rawJoined, cellKey);
  const avgConf = lineConfs.length
    ? lineConfs.reduce((a, b) => a + b, 0) / lineConfs.length
    : 1.0;

  return {
    text: normalized,
    rawText: rawJoined,
    confidence: Number(avgConf.toFixed(4)),
    minCharConfidence: Number(minCharConf.toFixed(4)),
    needsVisionRetry: Boolean(normalized && (avgConf < 0.80 || minCharConf < 0.58)),
    lowConfidence: Boolean(normalized && (avgConf < 0.86 || minCharConf < 0.68))
  };
}

if (typeof window !== 'undefined') {
  window.SafePaddleOCR = {
    initPaddleOcr,
    recognizeSingleLineCanvas,
    recognizeCellWithPaddle
  };
}
