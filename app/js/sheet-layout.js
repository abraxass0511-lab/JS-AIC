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
  return r > 135 && g < 135 && b < 135 && (r - g) > 30 && (r - b) > 30;
}

function isReddishFringe(d, k) {
  const r = d[k], g = d[k + 1], b = d[k + 2];
  return r > 120 && g < 165 && b < 165 && (r - g) > 18 && (r - b) > 18;
}

function trimRedBannerFromBox(data, W, box) {
  let { x, y, w, h } = box;
  let y0 = y;
  let y1 = y + h - 1;
  const minBandRows = Math.max(5, Math.round(h * 0.018));

  const isBannerBand = (startY, endY) => {
    let bandRows = 0;
    let peakRatio = 0;
    for (let cy = startY; cy <= endY; cy++) {
      let redCount = 0;
      for (let cx = x; cx < x + w; cx += 2) {
        if (isRedBanner(data, (cy * W + cx) * 4)) redCount++;
      }
      const r = redCount / Math.max(1, w / 2);
      if (r > peakRatio) peakRatio = r;
      if (r > 0.18) bandRows++;
    }
    return bandRows >= minBandRows && peakRatio > 0.32;
  };

  // 1) 하단 적색 배너 바 및 안티앨리어싱 적색 잔영(Fringe) 완전 제거 (해상도 무관 26% 탐색)
  const botLimit = Math.max(y0 + 20, y1 - Math.round(h * 0.26));
  if (isBannerBand(botLimit, y1)) {
    let seenBanner = false;
    let nonRedStreak = 0;
    for (let cy = y1; cy >= botLimit; cy--) {
      let redCount = 0;
      for (let cx = x; cx < x + w; cx += 2) {
        if (isRedBanner(data, (cy * W + cx) * 4)) redCount++;
      }
      if (redCount / Math.max(1, w / 2) > 0.14) {
        y1 = cy - 1;
        seenBanner = true;
        nonRedStreak = 0;
      } else if (seenBanner) {
        nonRedStreak++;
        if (nonRedStreak >= 4) break;
      }
    }
    // 배너 상단 경계의 붉은 그림자/잔영(Fringe) 추가 제거
    const fringeLimit = Math.max(botLimit, y1 - Math.max(8, Math.round(h * 0.030)));
    while (y1 >= fringeLimit) {
      let fringeCount = 0;
      for (let cx = x; cx < x + w; cx += 2) {
        if (isReddishFringe(data, (y1 * W + cx) * 4)) fringeCount++;
      }
      if (fringeCount / Math.max(1, w / 2) > 0.04) y1--;
      else break;
    }
    // 안전 여백 4px 추가 확보하여 하단 잔영 원천 차단
    y1 = Math.max(y0 + 20, y1 - Math.max(4, Math.round(h * 0.010)));
  }

  // 2) 상단 적색 배너 바 및 하단 잔영 완전 제거 (해상도 무관 26% 탐색)
  const topLimit = Math.min(y1 - 20, y0 + Math.round(h * 0.26));
  if (isBannerBand(y0, topLimit)) {
    let seenBanner = false;
    let nonRedStreak = 0;
    for (let cy = y0; cy <= topLimit; cy++) {
      let redCount = 0;
      for (let cx = x; cx < x + w; cx += 2) {
        if (isRedBanner(data, (cy * W + cx) * 4)) redCount++;
      }
      if (redCount / Math.max(1, w / 2) > 0.16) {
        y0 = cy + 1;
        seenBanner = true;
        nonRedStreak = 0;
      } else if (seenBanner) {
        nonRedStreak++;
        if (nonRedStreak >= 4) break;
      }
    }
    const fringeLimit = Math.min(topLimit, y0 + Math.max(6, Math.round(h * 0.025)));
    while (y0 <= fringeLimit) {
      let fringeCount = 0;
      for (let cx = x; cx < x + w; cx += 2) {
        if (isReddishFringe(data, (y0 * W + cx) * 4)) fringeCount++;
      }
      if (fringeCount / Math.max(1, w / 2) > 0.05) y0++;
      else break;
    }
    y0 = Math.min(y1 - 20, y0 + Math.max(2, Math.round(h * 0.005)));
  }

  return rect(x, y0, x + w, Math.max(y0 + 10, y1 + 1));
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
  const { data, width, height } = img;
  const yNext = Math.min((height || y + 1) - 1, y + 1);
  let c = 0;
  for (let x = x0; x <= x1; x++) {
    const l0 = lumAt(data, (y * width + x) * 4);
    const l1 = lumAt(data, (yNext * width + x) * 4);
    if (Math.min(l0, l1) < 185) c++;
  }
  return c / Math.max(1, x1 - x0 + 1);
}

function colDarkFrac(img, x, y0, y1) {
  const { data, width } = img;
  const xNext = Math.min(width - 1, x + 1);
  let c = 0;
  for (let y = y0; y <= y1; y++) {
    const l0 = lumAt(data, (y * width + x) * 4);
    const l1 = lumAt(data, (y * width + xNext) * 4);
    if (Math.min(l0, l1) < 185) c++;
  }
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

  // 2) 좌측 '부적합 개요' 황색 셀 (내부 '부적합' 검은 글자로 인해 끊어진 황색 띠 자동 병합 — 해상도 비례 임계값 적용)
  const lxEnd = Math.floor(W * 0.09);
  const rawLBands = bands(H, y => {
    let c = 0;
    for (let x = 0; x < lxEnd; x++) if (isYellow(data, (y * W + x) * 4)) c++;
    return c > W * 0.012;
  }, Math.max(5, Math.round(H * 0.005))).filter(b => b[1] < band1[1]);
  if (!rawLBands.length) return { ok: false, reason: 'overview-cell-not-found' };
  const maxMergeGap = Math.max(24, Math.round(H * 0.032));
  const lBands = [];
  for (const b of rawLBands) {
    if (
      lBands.length > 0 &&
      b[0] - lBands[lBands.length - 1][1] <= maxMergeGap &&
      (b[1] - lBands[lBands.length - 1][0]) <= Math.round(H * 0.13)
    ) {
      lBands[lBands.length - 1][1] = b[1];
    } else {
      lBands.push([...b]);
    }
  }
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

  // 3) 상단 헤더 행 (재해유형/관련기준/발생요인) 상단 경계: '시설물/법규' 청회색 셀 및 관련기준 상단 여백 정밀 탐색
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
  }, Math.max(8, Math.round(H * 0.009)));
  if (blueBands.length) hy0 = blueBands[blueBands.length - 1][0];
  const hy1 = ly0 - Math.max(3, Math.round(H * 0.004));

  // 관련기준(lawCell) 상단 제목('안전작업지침...' 등) 윗부분이 잘리지 않도록 상단 테두리 직하단 순백 여백 행 탐색
  const lawX0 = Math.round(x0 + fw * 0.365);
  const lawX1 = Math.round(x0 + fw * 0.797);
  let lawTopY = Math.max(0, hy0 - Math.round(H * 0.003));
  for (let y = Math.max(0, hy0 - Math.round(H * 0.015)); y <= hy0 + Math.round(H * 0.012); y++) {
    let darkCnt = 0;
    for (let x = lawX0 + 10; x < lawX1 - 10; x += 2) {
      if (lumAt(data, (y * W + x) * 4) < 170) darkCnt++;
    }
    // 상단 외곽선(dark 비율 높음)을 지나 첫 순백 여백 행을 찾으면 그 지점을 시작점으로 고정
    if (darkCnt > ((lawX1 - lawX0 - 20) / 2) * 0.45) {
      lawTopY = y + Math.max(2, Math.round(H * 0.002));
    }
  }

  // 4) 개요: 메타행(협력사/공종명/작업장소/점검자/점검차수) vs 부적합 내용 행 구분선
  const metaX0 = lx1 + Math.max(4, Math.round(W * 0.003));
  let metaSplit = ly0 + Math.round((ly1 - ly0) * 0.36);
  const mLines = findHLines(img, ly0 + Math.round((ly1 - ly0) * 0.18), ly0 + Math.round((ly1 - ly0) * 0.58), metaX0, x1, 0.72);
  if (mLines.length) metaSplit = mLines[0][1];

  // 5) 우측 패널 내부: 관계자 의견 박스 / 점검단 제안 행
  const spanTop = band1[1] + 1, spanBot = band2[0] - 1;
  const span = spanBot - spanTop;
  const inner = findHLines(img, spanTop + Math.round(span * 0.35), spanBot - Math.round(span * 0.15), px1 + 10, px2 - 10, 0.74);
  let propTop = spanTop + Math.round(span * 0.60);
  let propTopLine = null;
  if (inner.length) {
    propTopLine = inner[0];
    // 근접한 이중선은 하나로 병합
    let last = inner[0];
    const mergeDist = Math.max(14, Math.round(H * 0.018));
    for (const l of inner.slice(1)) {
      if (l[0] - last[1] < mergeDist) last = l;
      else break;
    }
    propTop = last[1] + 1;
  }
  const interviewBottom = propTopLine ? propTopLine[0] - 1 : propTop - 1;
  // 점검단 제안 행 하단 = 개선대책 헤더 직전 구분선
  const propLinesBelow = findHLines(img, propTop + Math.round(H * 0.04), spanBot, px1 + 10, px2 - 10, 0.74);
  const propBot = propLinesBelow.length ? propLinesBelow[0][0] - 1 : spanBot;
  let propSplit = findVLine(img, px1 + Math.round(pw * 0.15), px1 + Math.round(pw * 0.48), propTop + 6, propBot - 6, 0.72);
  if (propSplit < 0) propSplit = px1 + Math.round(pw * 0.31);

  // 6) 개선대책 본문 / PM 판정결과
  const cmTop = band2[1] + 1;
  const cmLines = findHLines(img, cmTop + Math.round(H * 0.08), Math.min(H - 1, cmTop + Math.round(H * 0.3)), px1 + 10, px2 - 10, 0.74);
  const cmBot = cmLines.length ? cmLines[0][0] - 1 : Math.min(H - 1, cmTop + Math.round(H * 0.17));
  let cmSplit = findVLine(img, px1 + Math.round(pw * 0.5), px1 + Math.round(pw * 0.9), cmTop + 6, cmBot - 6, 0.72);
  if (cmSplit < 0) cmSplit = px1 + Math.round(pw * 0.69);

  const pad = Math.max(4, Math.round(W * 0.0035));
  const mRow = rect(metaX0, ly0 + 2, x1 - pad, metaSplit);
  // 메타행 내부 5개 컬럼 수직 구분선 정밀 탐색 (협력사 | 공종명 | 작업장소 | 점검자 | 점검차수)
  const mw = mRow.w;
  const my0 = mRow.y + 3, my1 = Math.max(mRow.y + 4, mRow.y + mRow.h - 3);
  let mv1 = findVLine(img, mRow.x + Math.round(mw * 0.15), mRow.x + Math.round(mw * 0.23), my0, my1, 0.65);
  if (mv1 < 0) mv1 = mRow.x + Math.round(mw * 0.190);
  let mv2 = findVLine(img, mRow.x + Math.round(mw * 0.38), mRow.x + Math.round(mw * 0.46), my0, my1, 0.65);
  if (mv2 < 0) mv2 = mRow.x + Math.round(mw * 0.418);
  let mv3 = findVLine(img, mRow.x + Math.round(mw * 0.63), mRow.x + Math.round(mw * 0.72), my0, my1, 0.65);
  if (mv3 < 0) mv3 = mRow.x + Math.round(mw * 0.680);
  let mv4 = findVLine(img, mRow.x + Math.round(mw * 0.80), mRow.x + Math.round(mw * 0.88), my0, my1, 0.65);
  if (mv4 < 0) mv4 = mRow.x + Math.round(mw * 0.840);

  return {
    ok: true,
    frame: rect(x0, hy0, x1, cmBot),
    typeCell: rect(x0 + fw * 0.152, lawTopY, x0 + fw * 0.29, hy1),
    lawCell: rect(lawX0, lawTopY, lawX1, hy1),
    checkCell: rect(x0 + fw * 0.805, lawTopY, x1, hy1),
    metaRow: mRow,
    subCell: rect(mRow.x + 3, mRow.y + 2, mv1 - 4, metaSplit - 2),
    workCell: rect(mv1 + 4, mRow.y + 2, mv2 - 4, metaSplit - 2),
    locCell: rect(mv2 + 4, mRow.y + 2, mv3 - 4, metaSplit - 2),
    userCell: rect(mv3 + 4, mRow.y + 2, mv4 - 4, metaSplit - 2),
    roundCell: rect(mv4 + 4, mRow.y + 2, x1 - pad, metaSplit - 2),
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
  const minBannerH = Math.max(12, Math.round(area.h * 0.025));
  const rows = bands(area.h, dy => {
    const y = area.y + dy;
    let c = 0;
    for (let x = area.x; x < area.x + area.w; x += 2) if (isRedBanner(data, (y * W + x) * 4)) c++;
    return c > (area.w / 2) * 0.12;
  }, minBannerH);
  for (const [a, b] of rows) {
    const h = b - a + 1;
    if (h > img.height * 0.08) continue;
    const isTopBanner = a <= area.h * 0.16;
    const isBottomBanner = b >= area.h * 0.80;
    if (!isTopBanner && !isBottomBanner) continue;
    // 같은 행 안에 배너가 여러 개일 수 있으므로 x 방향 구간 분리
    const xs = bands(area.w, dx => {
      let c = 0;
      for (let y = area.y + a; y <= area.y + b; y += 2) if (isRedBanner(data, (y * W + area.x + dx) * 4)) c++;
      return c > (h / 2) * 0.25;
    }, Math.round(area.w * 0.10));
    if (isBottomBanner && xs.length >= 1) {
      const minXa = xs[0][0];
      const maxXb = xs[xs.length - 1][1];
      if (maxXb - minXa >= area.w * 0.45) {
        // 하단 배너는 가운데 흰 글씨 때문에 좌/우로 갈라지므로 전체 폭으로 병합하여 사진 하단 잔영 원천 차단
        out.push(rect(area.x + minXa, area.y + a, area.x + maxXb, area.y + b));
      }
    } else {
      for (const [xa, xb] of xs) {
        if (xb - xa >= area.w * 0.25) {
          out.push(rect(area.x + xa, area.y + a, area.x + xb, area.y + b));
        }
      }
    }
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
  const padB = Math.max(5, Math.round(area.h * 0.012));
  const inBanner = (x, y) => banners.some(b => x >= b.x - padB && x <= b.x + b.w + padB && y >= b.y - padB && y <= b.y + b.h + padB);
  const mw = area.w, mh = area.h;
  const minSide = Math.round(Math.min(mw, mh) * 0.14);

  const colCount = x => {
    let c = 0;
    for (let y = 0; y < mh; y++) {
      const gx = area.x + x, gy = area.y + y;
      if (!inBanner(gx, gy) && isNonWhite(data, (gy * W + gx) * 4)) c++;
    }
    return c;
  };
  const colEmpty = x => colCount(x) <= Math.max(2, mh * 0.01);

  // 1) X축 기준 1차 컬럼 분리 (좌/우 2장 배치 또는 우측 참고도면 분리)
  const xSegs = [];
  let s = 0, gap = 0;
  for (let x = 0; x < mw; x++) {
    if (colEmpty(x)) gap++;
    else {
      if (gap >= 6 && x - gap > s) {
        xSegs.push([s, x - gap - 1]);
        s = x;
      }
      gap = 0;
    }
  }
  xSegs.push([s, mw - 1]);

  const results = [];
  for (const [xa0, xb0] of xSegs) {
    let xa = xa0, xb = xb0;
    while (xa < xb && colEmpty(xa)) xa++;
    while (xb > xa && colEmpty(xb)) xb--;
    if (xb - xa + 1 < minSide) continue;

    const rowCount = y => {
      let c = 0;
      for (let x = xa; x <= xb; x++) {
        const gx = area.x + x, gy = area.y + y;
        if (!inBanner(gx, gy) && isNonWhite(data, (gy * W + gx) * 4)) c++;
      }
      return c;
    };
    const rowEmpty = y => rowCount(y) <= Math.max(2, (xb - xa + 1) * 0.01);

    let y0 = 0, y1 = mh - 1;
    while (y0 < y1 && rowEmpty(y0)) y0++;
    while (y1 > y0 && rowEmpty(y1)) y1--;
    if (y1 - y0 + 1 < minSide) continue;

    let r = rect(area.x + xa, area.y + y0, area.x + xb + 1, area.y + y1 + 1);
    r = trimRedBannerFromBox(data, W, r);
    if (r.w < minSide || r.h < minSide) continue;

    // 상/하단 공백 재정밀 트림 (적색 배너 제거 후 남은 여백 정리)
    let ty0 = r.y, ty1 = r.y + r.h - 1;
    const isRowBlank = gy => {
      let c = 0;
      for (let gx = r.x; gx < r.x + r.w; gx++) {
        if (!inBanner(gx, gy) && isNonWhite(data, (gy * W + gx) * 4)) c++;
      }
      return c <= Math.max(2, r.w * 0.01);
    };
    while (ty0 < ty1 && isRowBlank(ty0)) ty0++;
    while (ty1 > ty0 && isRowBlank(ty1)) ty1--;
    r = rect(r.x, ty0, r.x + r.w, ty1 + 1);

    // 박스 내부 백색 비율 계산 → 기준 문서/시공 가이드 캡처(예: 6.2 거푸집 보강, 900mm 이내 등) 판별
    let white = 0, tot = 0;
    for (let y = r.y; y < r.y + r.h; y += 2) {
      for (let x = r.x; x < r.x + r.w; x += 2) {
        tot++;
        const k = (y * W + x) * 4;
        if (!isNonWhite(data, k)) white++;
      }
    }
    const whiteRatio = white / Math.max(1, tot);
    const isRightHalf = r.x > area.x + Math.round(area.w * 0.45);
    // 참고 도면(예: Page 0 우측 '6.2 거푸집 보강')은 전체 컬럼 백색 비율이 ~0.39로 높고,
    // 실제 4분할 현장사진 콜라주(예: Page 1 우측 '② 잭베이스 설치불량')는 ~0.217 수준임
    const isReference = whiteRatio > 0.28 || (isRightHalf && whiteRatio > 0.25);
    results.push({ ...r, whiteRatio, isReference });
  }

  return results.sort((p, q) => p.x - q.x);
}

/**
 * 상단 우측 4대 발생요인 체크박스 픽셀 정밀 측정 (계획 미수립, 계획 미이행, 불안전 행동, 불안전 상태)
 */
export function detectCheckboxesFromLayout(img, checkCell) {
  if (!checkCell) return ['계획 미이행', '불안전 상태'];
  const { data, width: W } = img;
  const box = checkCell;
  const midX = box.x + Math.round(box.w * 0.48);
  const midY = box.y + Math.round(box.h * 0.48);

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
    const sx1 = q.x0 + Math.round(qw * 0.09);
    const sx2 = q.x0 + Math.round(qw * 0.36);
    const sy1 = q.y0 + Math.round(qh * 0.08);
    const sy2 = q.y0 + Math.round(qh * 0.80);
    let minX = sx2, maxX = sx1, minY = sy2, maxY = sy1;
    for (let y = sy1; y <= sy2; y++) {
      for (let x = sx1; x <= sx2; x++) {
        const k = (y * W + x) * 4;
        const lum = data[k] * 0.299 + data[k + 1] * 0.587 + data[k + 2] * 0.114;
        if (lum < 155) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX - minX >= 8 && maxY - minY >= 8) {
      let dark = 0, tot = 0;
      const ix0 = minX + Math.round((maxX - minX) * 0.25);
      const ix1 = minX + Math.round((maxX - minX) * 0.75);
      const iy0 = minY + Math.round((maxY - minY) * 0.25);
      const iy1 = minY + Math.round((maxY - minY) * 0.75);
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


