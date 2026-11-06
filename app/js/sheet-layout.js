/**
 * sheet-layout.js
 * 부적합 점검장표(시설물/법규 양식) 셀 구조 자동 인식 모듈 (순수 함수: 브라우저 ImageData / Node raw RGBA 공용)
 *
 * - 우측 '발생원인' / '개선대책' 황색 헤더, 좌측 '부적합 개요' 황색 셀을 기준으로 각 셀 영역을 픽셀 단위로 찾는다.
 * - 각 셀을 개별 OCR 하도록 영역을 분리하여, 관계자 의견 / 점검단 제안 / 개선대책 / PM 판정결과가 서로 섞이지 않게 한다.
 * - 사진 영역에서 실제 현장 사진만 추출하고, 기준/참고 문서 캡처(흰 바탕 + 글씨, 예: '6.2 거푸집 보강 예')는 제외한다.
 */

function lumAt(d, k) {
  return 0.299 * d[k] + 0.587 * d[k + 1] + 0.114 * d[k + 2];
}

function isYellow(d, k) {
  const r = d[k], g = d[k + 1], b = d[k + 2];
  return r > 175 && g > 145 && b < 165 && (r - b) > 35 && (g - b) > 20;
}

function isRedBanner(d, k) {
  const r = d[k], g = d[k + 1], b = d[k + 2];
  return r > 150 && g < 120 && b < 120 && r - g > 70 && r - b > 60;
}

function isNonWhite(d, k) {
  const r = d[k], g = d[k + 1], b = d[k + 2];
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  return lumAt(d, k) < 215 || mx - mn > 40;
}

function bands(len, test, minLen) {
  const out = [];
  let s = -1;
  for (let i = 0; i < len; i++) {
    if (test(i)) {
      if (s < 0) s = i;
    } else if (s >= 0) {
      if (i - s >= minLen) out.push([s, i - 1]);
      s = -1;
    }
  }
  if (s >= 0 && len - s >= minLen) out.push([s, len - 1]);
  return out;
}

function rowDarkFrac(img, y, x0, x1) {
  const { data, width } = img;
  let c = 0;
  for (let x = x0; x <= x1; x++) if (lumAt(data, (y * width + x) * 4) < 120) c++;
  return c / Math.max(1, x1 - x0 + 1);
}

function colDarkFrac(img, x, y0, y1) {
  const { data, width } = img;
  let c = 0;
  for (let y = y0; y <= y1; y++) if (lumAt(data, (y * width + x) * 4) < 120) c++;
  return c / Math.max(1, y1 - y0 + 1);
}

/** 수평 구분선(y) 탐색: 범위 내 행 중 어두운 픽셀 비율이 threshold 이상인 행 묶음 */
function findHLines(img, y0, y1, x0, x1, threshold = 0.5) {
  const lines = [];
  let s = -1;
  for (let y = y0; y <= y1; y++) {
    if (rowDarkFrac(img, y, x0, x1) >= threshold) {
      if (s < 0) s = y;
    } else if (s >= 0) {
      lines.push([s, y - 1]);
      s = -1;
    }
  }
  if (s >= 0) lines.push([s, y1]);
  return lines;
}

function findVLine(img, x0, x1, y0, y1, threshold = 0.65) {
  let best = -1, bestV = 0;
  for (let x = x0; x <= x1; x++) {
    const v = colDarkFrac(img, x, y0, y1);
    if (v >= threshold && v > bestV) {
      bestV = v;
      best = x;
    }
  }
  return best;
}

function rect(x0, y0, x1, y1) {
  return { x: Math.round(x0), y: Math.round(y0), w: Math.max(1, Math.round(x1 - x0)), h: Math.max(1, Math.round(y1 - y0)) };
}

/**
 * 점검장표 셀 레이아웃 분석
 * @param {{data: Uint8ClampedArray|Buffer, width: number, height: number}} img RGBA
 */
export function analyzeSheetLayout(img) {
  const { data, width: W, height: H } = img;

  // 1) 우측 패널 황색 헤더 (발생원인 / 개선대책)
  const rx0 = Math.floor(W * 0.55), rx1 = Math.floor(W * 0.98);
  const yBands = bands(H, y => {
    let c = 0;
    for (let x = rx0; x < rx1; x += 2) if (isYellow(data, (y * W + x) * 4)) c++;
    return c > ((rx1 - rx0) / 2) * 0.22;
  }, Math.max(8, Math.round(H * 0.015)));
  if (yBands.length < 2) return { ok: false, reason: 'yellow-headers-not-found' };
  const band1 = yBands[0];
  const band2 = yBands[yBands.length - 1];

  // 패널 좌우 경계
  const midY = Math.round((band1[0] + band1[1]) / 2);
  let px1 = rx1, px2 = rx0;
  for (let x = Math.floor(W * 0.4); x < W; x++) {
    if (isYellow(data, (midY * W + x) * 4)) {
      if (x < px1) px1 = x;
      if (x > px2) px2 = x;
    }
  }
  const pw = px2 - px1;

  // 2) 좌측 '부적합 개요' 황색 셀 (가장 높은 띠)
  const lxEnd = Math.floor(W * 0.09);
  const lBands = bands(H, y => {
    let c = 0;
    for (let x = 0; x < lxEnd; x++) if (isYellow(data, (y * W + x) * 4)) c++;
    return c > W * 0.02;
  }, 10).filter(b => b[1] < band1[1]);
  if (!lBands.length) return { ok: false, reason: 'overview-cell-not-found' };
  const lb = lBands.reduce((a, b) => (b[1] - b[0] > a[1] - a[0] ? b : a));
  const ly0 = lb[0], ly1 = lb[1];
  const lmid = Math.round((ly0 + ly1) / 2);
  let lx0 = lxEnd, lx1 = 0;
  for (let x = 0; x < W * 0.15; x++) {
    if (isYellow(data, (lmid * W + x) * 4)) {
      if (x < lx0) lx0 = x;
      if (x > lx1) lx1 = x;
    }
  }
  const x0 = lx0, x1 = px2;
  const fw = x1 - x0;

  // 3) 상단 헤더 행 (재해유형/관련기준/발생요인) 상단 경계: '시설물/법규' 청회색 셀
  let hy0 = Math.max(0, ly0 - Math.round(H * 0.14));
  const blueBands = bands(ly0, y => {
    let c = 0;
    const xe = x0 + Math.round(fw * 0.12);
    for (let x = x0; x < xe; x++) {
      const k = (y * W + x) * 4;
      const r = data[k], g = data[k + 1], b = data[k + 2];
      if (b > r + 20 && b > 160 && r < 210 && g > r) c++;
    }
    return c > fw * 0.12 * 0.4;
  }, 10);
  if (blueBands.length) hy0 = blueBands[blueBands.length - 1][0];
  const hy1 = ly0 - 4;

  // 4) 개요: 메타행(협력사/공종명/작업장소/점검자/점검차수) vs 부적합 내용 행 구분선
  const metaX0 = lx1 + 4;
  let metaSplit = ly0 + Math.round((ly1 - ly0) * 0.36);
  const mLines = findHLines(img, ly0 + Math.round((ly1 - ly0) * 0.15), ly0 + Math.round((ly1 - ly0) * 0.65), metaX0, x1, 0.5);
  if (mLines.length) metaSplit = mLines[0][1];

  // 5) 우측 패널 내부: 관계자 의견 박스 / 점검단 제안 행
  const spanTop = band1[1] + 1, spanBot = band2[0] - 1;
  const span = spanBot - spanTop;
  const inner = findHLines(img, spanTop + Math.round(span * 0.2), spanBot - 6, px1 + 4, px2 - 4, 0.5);
  let propTop = spanTop + Math.round(span * 0.55);
  let propTopLine = null;
  if (inner.length) {
    propTopLine = inner[0];
    // 근접한 이중선은 하나로 병합
    let last = inner[0];
    for (const l of inner.slice(1)) {
      if (l[0] - last[1] < 18) last = l;
      else break;
    }
    propTop = last[1] + 1;
  }
  const interviewBottom = propTopLine ? propTopLine[0] - 1 : propTop - 1;
  // 점검단 제안 행 하단 = 개선대책 헤더 직전 구분선
  const propLinesBelow = findHLines(img, propTop + 10, spanBot, px1 + 4, px2 - 4, 0.5);
  const propBot = propLinesBelow.length ? propLinesBelow[0][0] - 1 : spanBot;
  let propSplit = findVLine(img, px1 + Math.round(pw * 0.15), px1 + Math.round(pw * 0.48), propTop + 6, propBot - 6, 0.65);
  if (propSplit < 0) propSplit = px1 + Math.round(pw * 0.31);

  // 6) 개선대책 본문 / PM 판정결과
  const cmTop = band2[1] + 1;
  const cmLines = findHLines(img, cmTop + Math.round(H * 0.05), Math.min(H - 1, cmTop + Math.round(H * 0.3)), px1 + 4, px2 - 4, 0.5);
  const cmBot = cmLines.length ? cmLines[0][0] - 1 : Math.min(H - 1, cmTop + Math.round(H * 0.17));
  let cmSplit = findVLine(img, px1 + Math.round(pw * 0.5), px1 + Math.round(pw * 0.9), cmTop + 6, cmBot - 6, 0.65);
  if (cmSplit < 0) cmSplit = px1 + Math.round(pw * 0.69);

  const pad = 5;
  return {
    ok: true,
    frame: rect(x0, hy0, x1, cmBot),
    typeCell: rect(x0 + fw * 0.152, hy0 + pad, x0 + fw * 0.29, hy1),
    lawCell: rect(x0 + fw * 0.365, hy0 + pad, x0 + fw * 0.797, hy1),
    checkCell: rect(x0 + fw * 0.805, hy0 + pad, x1, hy1),
    metaRow: rect(metaX0, ly0 + 2, x1 - pad, metaSplit),
    contentRow: rect(metaX0, metaSplit + 2, x1 - pad, ly1),
    photoArea: rect(x0 + 8, ly1 + 10, px1 - 8, cmBot - 6),
    interview: rect(px1 + pad, spanTop + pad, px2 - pad, interviewBottom),
    proposalType: rect(px1 + pad, propTop + pad, propSplit - pad, propBot),
    proposalText: rect(propSplit + pad, propTop + pad, px2 - pad, propBot),
    countermeasure: rect(px1 + pad, cmTop + pad, cmSplit - pad, cmBot),
    pmCell: rect(cmSplit + pad, cmTop + pad, px2 - pad, cmBot)
  };
}

/** 사진 영역 내 적색 음영 배너(사진 제목) 탐색 */
export function findRedBanners(img, area) {
  const { data, width: W } = img;
  const out = [];
  const rows = bands(area.h, dy => {
    const y = area.y + dy;
    let c = 0;
    for (let x = area.x; x < area.x + area.w; x += 2) if (isRedBanner(data, (y * W + x) * 4)) c++;
    return c > (area.w / 2) * 0.12;
  }, 14);
  for (const [a, b] of rows) {
    const h = b - a + 1;
    if (h > img.height * 0.07) continue;
    const ym = area.y + Math.round((a + b) / 2);
    // 같은 행 안에 배너가 여러 개일 수 있으므로 x 방향 구간 분리
    const xs = bands(area.w, dx => {
      let c = 0;
      for (let y = area.y + a; y <= area.y + b; y += 2) if (isRedBanner(data, (y * W + area.x + dx) * 4)) c++;
      return c > (h / 2) * 0.3;
    }, Math.round(area.w * 0.12));
    for (const [xa, xb] of xs) {
      // 배너 안 흰 글씨 사이 틈 보정
      out.push(rect(area.x + xa, area.y + a, area.x + xb, area.y + b));
    }
    void ym;
  }
  // 근접 배너 병합 (두 줄 배너)
  out.sort((p, q) => p.y - q.y || p.x - q.x);
  const merged = [];
  for (const r of out) {
    const m = merged.find(o => Math.abs(o.x - r.x) < 30 && r.y - (o.y + o.h) < 12 && r.y >= o.y);
    if (m) {
      const nx1 = Math.max(m.x + m.w, r.x + r.w), ny1 = Math.max(m.y + m.h, r.y + r.h);
      m.x = Math.min(m.x, r.x); m.y = Math.min(m.y, r.y); m.w = nx1 - m.x; m.h = ny1 - m.y;
    } else merged.push({ ...r });
  }
  return merged;
}

/**
 * 사진 영역에서 실제 현장 사진 박스 추출 (XY-cut, 순백 간격 기준 분할)
 * - 적색 배너는 마스킹하여 사진에서 제외
 * - 흰 바탕 + 글씨 위주의 기준/참고 문서 캡처는 isReference=true 로 표시
 */
export function findPhotoBoxes(img, area, banners = []) {
  const { data, width: W } = img;
  const inBanner = (x, y) => banners.some(b => x >= b.x - 3 && x <= b.x + b.w + 3 && y >= b.y - 3 && y <= b.y + b.h + 3);
  const mw = area.w, mh = area.h;
  const mask = new Uint8Array(mw * mh);
  for (let y = 0; y < mh; y++) {
    for (let x = 0; x < mw; x++) {
      const gx = area.x + x, gy = area.y + y;
      if (inBanner(gx, gy)) continue;
      if (isNonWhite(data, (gy * W + gx) * 4)) mask[y * mw + x] = 1;
    }
  }
  const boxes = [];
  const minSide = Math.round(Math.min(mw, mh) * 0.12);

  function cut(bx0, by0, bx1, by1, depth) {
    // 가장자리 공백 제거
    const rowCount = y => { let c = 0; for (let x = bx0; x <= bx1; x++) c += mask[y * mw + x]; return c; };
    const colCount = x => { let c = 0; for (let y = by0; y <= by1; y++) c += mask[y * mw + x]; return c; };
    const rowEmpty = y => rowCount(y) <= Math.max(2, (bx1 - bx0 + 1) * 0.004);
    const colEmpty = x => colCount(x) <= Math.max(2, (by1 - by0 + 1) * 0.004);
    while (by0 < by1 && rowEmpty(by0)) by0++;
    while (by1 > by0 && rowEmpty(by1)) by1--;
    while (bx0 < bx1 && colEmpty(bx0)) bx0++;
    while (bx1 > bx0 && colEmpty(bx1)) bx1--;
    if (bx1 - bx0 < minSide || by1 - by0 < minSide) return;
    if (depth > 8) { boxes.push([bx0, by0, bx1, by1]); return; }

    const tryAxis = (lo, hi, empty) => {
      const segs = [];
      let s = lo, gap = 0;
      for (let i = lo; i <= hi; i++) {
        if (empty(i)) gap++;
        else {
          if (gap >= 4 && i - gap > s) { segs.push([s, i - gap - 1]); s = i; }
          gap = 0;
        }
      }
      segs.push([s, hi]);
      return segs.length > 1 ? segs : null;
    };
    const ys = tryAxis(by0, by1, rowEmpty);
    if (ys) { ys.forEach(([a, b]) => cut(bx0, a, bx1, b, depth + 1)); return; }
    const xs = tryAxis(bx0, bx1, colEmpty);
    if (xs) { xs.forEach(([a, b]) => cut(a, by0, b, by1, depth + 1)); return; }
    boxes.push([bx0, by0, bx1, by1]);
  }
  cut(0, 0, mw - 1, mh - 1, 0);

  return boxes.map(([a, b, c, e]) => {
    const r = rect(area.x + a, area.y + b, area.x + c + 1, area.y + e + 1);
    // 박스 내부 백색 비율 / 어두운 글자 비율 → 기준 문서 캡처 판별
    let white = 0, tot = 0;
    for (let y = r.y; y < r.y + r.h; y += 2) {
      for (let x = r.x; x < r.x + r.w; x += 2) {
        tot++;
        const k = (y * W + x) * 4;
        if (!isNonWhite(data, k)) white++;
      }
    }
    const whiteRatio = white / Math.max(1, tot);
    return { ...r, whiteRatio, isReference: whiteRatio > 0.22 };
  }).sort((p, q) => (Math.abs(p.y - q.y) < 40 ? p.x - q.x : p.y - q.y));
}

/**
 * 상단 우측 4대 발생요인 체크박스 픽셀 정밀 측정 (계획 미수립, 계획 미이행, 불안전 행동, 불안전 상태)
 */
export function detectCheckboxesFromLayout(img, checkCell) {
  if (!checkCell) return ['계획 미이행', '불안전 상태'];
  const { data, width: W } = img;
  const box = checkCell;
  const midX = box.x + Math.round(box.w * 0.48);
  const midY = box.y + Math.round(box.h * 0.50);

  const quads = [
    { name: '계획 미수립', x0: box.x, x1: midX, y0: box.y, y1: midY },
    { name: '계획 미이행', x0: midX, x1: box.x + box.w, y0: box.y, y1: midY },
    { name: '불안전 행동', x0: box.x, x1: midX, y0: midY, y1: box.y + box.h },
    { name: '불안전 상태', x0: midX, x1: box.x + box.w, y0: midY, y1: box.y + box.h }
  ];

  const checked = [];
  for (const q of quads) {
    const qw = q.x1 - q.x0;
    const qh = q.y1 - q.y0;
    const sx1 = q.x0 + Math.round(qw * 0.05);
    const sx2 = q.x0 + Math.round(qw * 0.36);
    const sy1 = q.y0 + Math.round(qh * 0.12);
    const sy2 = q.y0 + Math.round(qh * 0.88);
    let minX = sx2, maxX = sx1, minY = sy2, maxY = sy1;
    for (let y = sy1; y <= sy2; y++) {
      for (let x = sx1; x <= sx2; x++) {
        const k = (y * W + x) * 4;
        const lum = data[k] * 0.299 + data[k + 1] * 0.587 + data[k + 2] * 0.114;
        if (lum < 165) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX - minX >= 8 && maxY - minY >= 8) {
      let dark = 0, tot = 0;
      const ix0 = minX + Math.round((maxX - minX) * 0.28);
      const ix1 = minX + Math.round((maxX - minX) * 0.72);
      const iy0 = minY + Math.round((maxY - minY) * 0.28);
      const iy1 = minY + Math.round((maxY - minY) * 0.72);
      for (let y = iy0; y <= iy1; y++) {
        for (let x = ix0; x <= ix1; x++) {
          tot++;
          const k = (y * W + x) * 4;
          const lum = data[k] * 0.299 + data[k + 1] * 0.587 + data[k + 2] * 0.114;
          if (lum < 150) dark++;
        }
      }
      if (dark / Math.max(1, tot) >= 0.14) {
        checked.push(q.name);
      }
    }
  }
  return checked.length > 0 ? checked : ['계획 미이행', '불안전 상태'];
}


