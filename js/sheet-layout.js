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
  // 노란색: 빨강/초록이 높고, 파랑이 확연히 낮음 (밝은 파스텔 노랑 #FFF2CC, #FFE599, 골드 #FFD966 모두 포용)
  return r > 160 && g > 135 && (r - b) > 22 && (g - b) > 15 && b < 218;
}

function isRedBanner(d, k) {
  const r = d[k], g = d[k + 1], b = d[k + 2];
  return r > 135 && g < 152 && b < 152 && (r - g) > 30 && (r - b) > 30;
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

  // 패널 좌우 경계: 사진 내부의 우발적 황색 픽셀(안전모/스티커 등)에 끌리지 않도록 band1·band2 공통 연속 황색 바만 채택
  const panelRows = [];
  for (let y = band1[0]; y <= band1[1]; y++) panelRows.push(y);
  for (let y = band2[0]; y <= band2[1]; y++) panelRows.push(y);
  const xScan0 = Math.floor(W * 0.40);
  const maxXGap = Math.max(18, Math.round(W * 0.015));
  const colYellowReq = Math.max(4, panelRows.length * 0.35);
  const colYellow = new Uint8Array(W);
  const ySegs = [];
  let segS = -1, segLast = -1;
  for (let x = xScan0; x < W; x++) {
    let yCnt = 0;
    for (let i = 0; i < panelRows.length; i++) {
      if (isYellow(data, (panelRows[i] * W + x) * 4)) yCnt++;
    }
    if (yCnt >= colYellowReq) {
      colYellow[x] = 1;
      if (segS < 0) segS = x;
      segLast = x;
    } else if (segS >= 0 && x - segLast > maxXGap) {
      ySegs.push([segS, segLast]);
      segS = -1;
    }
  }
  if (segS >= 0) ySegs.push([segS, segLast]);
  const panelSegs = ySegs.filter(([a, b]) => (b - a) >= W * 0.18 && b >= W * 0.65);
  let px1 = rx1, px2 = rx0;
  if (panelSegs.length > 0) {
    panelSegs.sort((a, b) => (b[1] - b[0]) - (a[1] - a[0]));
    px1 = panelSegs[0][0];
    px2 = panelSegs[0][1];
    // 앞쪽 고립 노이즈(1~4px) + 공백(4px+) 제거해 사진 우측 끝이 잘리지 않도록 보정
    while (px1 + 8 < px2) {
      let runEnd = px1;
      while (runEnd <= px2 && colYellow[runEnd]) runEnd++;
      if (runEnd - px1 >= 5) break;
      let gapEnd = runEnd;
      while (gapEnd <= px2 && !colYellow[gapEnd]) gapEnd++;
      if (gapEnd - runEnd >= 4) { px1 = gapEnd; } else break;
    }
  } else {
    const midY = Math.round((band1[0] + band1[1]) / 2);
    for (let x = rx0; x < W; x++) {
      if (isYellow(data, (midY * W + x) * 4)) {
        if (x < px1) px1 = x;
        if (x > px2) px2 = x;
      }
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
  const mRow = rect(metaX0, ly0 + 2, x1 - 2, metaSplit);
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
    subCell: rect(mRow.x + 2, mRow.y + 2, mv1 - 3, metaSplit - 2),
    workCell: rect(mv1 + 3, mRow.y + 2, mv2 - 3, metaSplit - 2),
    locCell: rect(mv2 + 3, mRow.y + 2, mv3 - 3, metaSplit - 2),
    userCell: rect(mv3 + 3, mRow.y + 2, mv4 - 3, metaSplit - 2),
    roundCell: rect(mv4 + 3, mRow.y + 2, x1 - 2, metaSplit - 2),
    contentRow: rect(metaX0, metaSplit + 2, x1 - pad, Math.max(metaSplit + 10, ly1 - 4)),
    photoArea: rect(x0 + 8, ly1 + 10, px1 - 8, cmBot - 6),
    interview: rect(px1 + pad, spanTop + 3, px2 - pad, Math.max(spanTop + 12, interviewBottom - 3)),
    proposalType: rect(px1 + pad, propTop + 2, propSplit - pad, Math.max(propTop + 10, propBot - 3)),
    proposalText: rect(propSplit + pad, propTop + 2, px2 - pad, Math.max(propTop + 10, propBot - 3)),
    countermeasure: rect(px1 + pad, cmTop + 3, cmSplit - pad, Math.max(cmTop + 10, cmBot - 3)),
    pmCell: rect(cmSplit + pad, cmTop + 3, px2 - pad, Math.max(cmTop + 10, cmBot - 3))
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
    if (h > img.height * 0.165) continue;
    const isTopBanner = a <= area.h * 0.20;
    const isBottomBanner = b >= area.h * 0.78;
    if (!isTopBanner && !isBottomBanner) continue;
    // 같은 행 안에 배너가 여러 개일 수 있으므로 x 방향 구간 분리 (좌/우 줄 수가 달라도 모두 검출되도록 0.18 적용)
    const xs = bands(area.w, dx => {
      let c = 0;
      for (let y = area.y + a; y <= area.y + b; y += 2) if (isRedBanner(data, (y * W + area.x + dx) * 4)) c++;
      return c > Math.max(2, (h / 2) * 0.18);
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
        if (xb - xa >= area.w * 0.22) {
          // 각 좌/우 배너별 실제 상하 적색 행 범위(ya..yb) 정밀 피팅 (1줄 배너와 2줄 배너가 나란히 있을 때 높이 개별 맞춤)
          let ya = a, yb = b;
          const segW = xb - xa + 1;
          const rowHasRed = dy => {
            let rc = 0;
            const gy = area.y + dy;
            for (let gx = area.x + xa; gx <= area.x + xb; gx += 2) {
              if (isRedBanner(data, (gy * W + gx) * 4)) rc++;
            }
            return rc > (segW / 2) * 0.15;
          };
          while (ya < yb && !rowHasRed(ya)) ya++;
          while (yb > ya && !rowHasRed(yb)) yb--;
          out.push(rect(area.x + xa, area.y + ya, area.x + xb, area.y + yb));
        }
      }
    }
  }
  // 근접 배너 병합 (두 줄 배너) 및 좌->우(① -> ②) 정렬
  out.sort((p, q) => (Math.abs(p.y - q.y) < area.h * 0.15 ? (p.x - q.x) : (p.y - q.y)));
  const merged = [];
  for (const r of out) {
    const m = merged.find(o => Math.abs(o.x - r.x) < 30 && r.y - (o.y + o.h) < 12 && r.y >= o.y);
    if (m) {
      const nx1 = Math.max(m.x + m.w, r.x + r.w), ny1 = Math.max(m.y + m.h, r.y + r.h);
      m.x = Math.min(m.x, r.x); m.y = Math.min(m.y, r.y); m.w = nx1 - m.x; m.h = ny1 - m.y;
    } else merged.push({ ...r });
  }
  merged.sort((p, q) => (Math.abs(p.y - q.y) < area.h * 0.15 ? (p.x - q.x) : (p.y - q.y)));
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

  // 1) X축 기준 1차 컬럼 분리 (해상도 스케일 팩터 sf 반영)
  const sf = Math.max(1, W / 1440);
  const minGapPx = Math.max(2, Math.round(2 * sf));
  const xSegs = [];
  let s = 0, gap = 0;
  for (let x = 0; x < mw; x++) {
    if (colEmpty(x)) gap++;
    else {
      if (gap >= minGapPx && x - gap > s) {
        xSegs.push([s, x - gap - 1]);
        s = x;
      }
      gap = 0;
    }
  }
  xSegs.push([s, mw - 1]);

  // 2차 수직 거터 분할: 상단 체크리스트/하단 배너로 인해 전체 열 기준 colEmpty()가 실패한 좁은 사진 간 틈새 분할
  const refinedSegs = [];
  for (const [x0, x1] of xSegs) {
    const segW = x1 - x0 + 1;
    if (segW > mw * 0.58) {
      const yProbeStart = area.y + Math.round(area.h * 0.20);
      const yProbeEnd = area.y + Math.round(area.h * 0.85);
      const xScanStart = x0 + Math.round(segW * 0.28);
      const xScanEnd = x0 + Math.round(segW * 0.78);
      let runStart = -1;
      let bestGutter = null;
      for (let rx = xScanStart; rx <= xScanEnd; rx++) {
        const ix = area.x + rx;
        let whiteCnt = 0, totalCnt = 0;
        for (let iy = yProbeStart; iy < yProbeEnd; iy++) {
          const k = (iy * W + ix) * 4;
          totalCnt++;
          if (data[k] > 230 && data[k + 1] > 230 && data[k + 2] > 230) whiteCnt++;
        }
        const ratio = whiteCnt / Math.max(1, totalCnt);
        if (ratio >= 0.88) {
          if (runStart < 0) runStart = rx;
        } else {
          if (runStart >= 0 && rx - runStart >= minGapPx) {
            const center = Math.floor((runStart + rx - 1) / 2);
            if (!bestGutter || (rx - runStart) > bestGutter.width) {
              bestGutter = { leftEnd: runStart - 1, rightStart: rx, width: rx - runStart, center };
            }
          }
          runStart = -1;
        }
      }
      if (runStart >= 0 && xScanEnd + 1 - runStart >= minGapPx) {
        const center = Math.floor((runStart + xScanEnd) / 2);
        if (!bestGutter || (xScanEnd + 1 - runStart) > bestGutter.width) {
          bestGutter = { leftEnd: runStart - 1, rightStart: xScanEnd + 1, width: xScanEnd + 1 - runStart, center };
        }
      }
      if (bestGutter && bestGutter.leftEnd - x0 >= mw * 0.22 && x1 - bestGutter.rightStart >= mw * 0.20) {
        refinedSegs.push([x0, bestGutter.leftEnd], [bestGutter.rightStart, x1]);
        continue;
      }
    }
    refinedSegs.push([x0, x1]);
  }

  // 유효 폭(minSide) 이상 세그먼트만 필터링 후, 3개 이상으로 쪼개진 다분할 콜라주는 좌/우 최대 2개 박스로 병합 (3번째 사진 유실 원천 방지)
  let validXSegs = refinedSegs.filter(([xa0, xb0]) => {
    let xa = xa0, xb = xb0;
    while (xa < xb && colEmpty(xa)) xa++;
    while (xb > xa && colEmpty(xb)) xb--;
    return (xb - xa + 1) >= minSide;
  });

  if (validXSegs.length > 2) {
    const topBanners = banners.filter(b => (b.y - area.y) <= area.h * 0.18).sort((a, b) => a.x - b.x);
    if (topBanners.length >= 2) {
      const splitX = Math.round(((topBanners[0].x + topBanners[0].w) + topBanners[1].x) / 2) - area.x;
      const leftGroup = validXSegs.filter(([xa, xb]) => (xa + xb) / 2 <= splitX);
      const rightGroup = validXSegs.filter(([xa, xb]) => (xa + xb) / 2 > splitX);
      if (leftGroup.length && rightGroup.length) {
        validXSegs = [
          [leftGroup[0][0], leftGroup[leftGroup.length - 1][1]],
          [rightGroup[0][0], rightGroup[rightGroup.length - 1][1]]
        ];
      }
    }
    while (validXSegs.length > 2) {
      // 중앙(0.55 * mw)에서 가장 먼 경계부터 인접 병합하여 좌/우 2개 박스로 압축
      let bestIdx = 0;
      let maxDist = -1;
      for (let i = 0; i < validXSegs.length - 1; i++) {
        const boundary = (validXSegs[i][1] + validXSegs[i + 1][0]) / 2;
        const dist = Math.abs(boundary - mw * 0.56);
        if (dist > maxDist) {
          maxDist = dist;
          bestIdx = i;
        }
      }
      validXSegs.splice(bestIdx, 2, [validXSegs[bestIdx][0], validXSegs[bestIdx + 1][1]]);
    }
  }
  xSegs.length = 0;
  xSegs.push(...validXSegs);

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

    // 우측 상단 '[ ] Hold Point 위반 (N/A)' 분리형 소형 박스 제거:
    // 상단 9.5% 이내의 얇은 박스 아래에 순백 수평 여백이 존재하면 실제 사진 시작점까지 ty0 하향
    const holdPointLimitY = area.y + Math.round(area.h * 0.22);
    if (ty0 - area.y <= area.h * 0.06 && ty1 > holdPointLimitY) {
      let blankRun = 0;
      let firstBlankY = -1;
      let gapEndY = -1;
      for (let gy = ty0 + Math.round(area.h * 0.02); gy <= Math.min(ty1 - minSide, holdPointLimitY); gy++) {
        if (isRowBlank(gy)) {
          if (blankRun === 0) firstBlankY = gy;
          blankRun++;
          if (blankRun >= Math.max(4, Math.round(4 * sf))) {
            gapEndY = gy;
          }
        } else if (gapEndY > 0) {
          break;
        } else {
          blankRun = 0;
        }
      }
      if (gapEndY > 0 && firstBlankY > 0 && (firstBlankY - ty0) <= area.h * 0.095) {
        ty0 = gapEndY + 1;
        while (ty0 < ty1 && isRowBlank(ty0)) ty0++;
      }
    }

    r = rect(r.x, ty0, r.x + r.w, ty1 + 1);

    // 박스 내부 순백 종이 비율 + 문서 줄무늬 비율 동시 측정
    // - 중요: 상/하단에 고유 적색 지적 배너('① ...', '② 협력사 가설컨테이너 반입시 점검 불량' 등)가 붙어 있는 사진은
    //   100% 실제 지적사항 사진이므로(참조 가이드 문서에는 적색 번호 배너가 붙지 않음) 절대 참조 이미지로 제외하지 않음!
    // - 또한 흰색 플라스틱 누전차단기/타공 분전반 철판(lum 190~235)이 종이 문서로 오판되지 않도록 순백 종이 기준(lum > 240, 채도 < 15) 적용
    const hasOwnBanner = banners.some(b => {
      const overlapX = Math.max(0, Math.min(r.x + r.w, b.x + b.w) - Math.max(r.x, b.x));
      return overlapX >= r.w * 0.28 && b.w <= area.w * 0.72;
    });

    let white = 0, tot = 0;
    for (let y = r.y; y < r.y + r.h; y += 2) {
      for (let x = r.x; x < r.x + r.w; x += 2) {
        tot++;
        const k = (y * W + x) * 4;
        const rv = data[k], gv = data[k + 1], bv = data[k + 2];
        const mx = Math.max(rv, gv, bv), mn = Math.min(rv, gv, bv);
        const lum = 0.299 * rv + 0.587 * gv + 0.114 * bv;
        if (lum > 238 && (mx - mn) < 16) white++;
      }
    }
    const whiteRatio = white / Math.max(1, tot);

    const tx0 = r.x + Math.round(r.w * 0.04);
    const tx1 = r.x + Math.round(r.w * 0.96);
    let whiteRows = 0;
    for (let y = r.y; y < r.y + r.h; y++) {
      let bright = 0, colorSat = 0, rowTot = 0;
      for (let x = tx0; x < tx1; x += 2) {
        const k = (y * W + x) * 4;
        const rv = data[k], gv = data[k + 1], bv = data[k + 2];
        const mx = Math.max(rv, gv, bv), mn = Math.min(rv, gv, bv);
        const lum = 0.299 * rv + 0.587 * gv + 0.114 * bv;
        rowTot++;
        if (lum > 240 && mx - mn < 15) bright++;
        if (mx - mn > 35) colorSat++;
      }
      if (rowTot > 0 && (bright / rowTot) >= 0.76 && (colorSat / rowTot) < 0.06) {
        whiteRows++;
      }
    }
    const whiteRowFrac = whiteRows / Math.max(1, r.h);
    const isReference = !hasOwnBanner && (whiteRatio > 0.54 || (whiteRowFrac >= 0.11 && whiteRatio > 0.29));
    results.push({ ...r, whiteRatio, whiteRowFrac, hasOwnBanner, isReference });
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

/**
 * 셀 캔버스 내의 개인정보 가림 박스(어두운 단색 직사각형 블롭) 및 잔여 테두리선을 백색으로 제거
 * - 적색 배너(isBanner)는 어두운 적색 배경 위 흰 글씨이므로 마스킹 소거를 건너뛰고 여백만 보존
 * @param {HTMLCanvasElement} rawCanvas - 원본 크롭된 셀 캔버스
 * @param {number} shavePx - 테두리 절삭 픽셀 (기본 2px)
 * @param {number} padPx - 외곽 백색 여백 픽셀 (기본 8px)
 * @param {object} [options] - { cellKey?: string, isBanner?: boolean }
 * @returns {HTMLCanvasElement} 전처리 완료된 클린 캔버스
 */
export function preprocessCellCanvas(rawCanvas, shavePx = 2, padPx = 8, options = {}) {
  const cellKey = options.cellKey || '';
  const isBanner = options.isBanner || cellKey === 'banner' || cellKey === 'banner2';
  const effectiveShave = isBanner ? 0 : shavePx;

  const sw = Math.max(1, rawCanvas.width - effectiveShave * 2);
  const sh = Math.max(1, rawCanvas.height - effectiveShave * 2);

  const out = document.createElement('canvas');
  out.width = sw + padPx * 2;
  out.height = sh + padPx * 2;
  const ctx = out.getContext('2d', { willReadFrequently: true });

  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.drawImage(rawCanvas, effectiveShave, effectiveShave, sw, sh, padPx, padPx, sw, sh);

  if (isBanner) return out;

  const imgData = ctx.getImageData(padPx, padPx, sw, sh);
  const data = imgData.data;

  // 1) 상/하단 가장자리 잔여 수평 표 테두리선(밀도 70% 이상 행) 백색 제거
  for (let y = 0; y < sh; y++) {
    if (y > 5 && y < sh - 6) continue;
    let darkRow = 0;
    for (let x = 0; x < sw; x++) {
      const idx = (y * sw + x) * 4;
      const lum = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
      if (lum < 190) darkRow++;
    }
    if (darkRow / Math.max(1, sw) >= 0.70) {
      for (let x = 0; x < sw; x++) {
        const idx = (y * sw + x) * 4;
        data[idx] = 255; data[idx + 1] = 255; data[idx + 2] = 255;
      }
    }
  }

  // 2) 개인정보 가림 박스(고밀도 암색/회색 직사각형 영역) 탐지 후 백색 마스킹
  const checkMasking = !cellKey || ['sub', 'user', 'meta', 'interview'].includes(cellKey);
  const WIN_W = 22, WIN_H = 12;
  if (checkMasking && sw >= WIN_W && sh >= WIN_H) {
    const darkMap = new Uint8Array(sw * sh);
    for (let i = 0; i < sw * sh; i++) {
      const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      if (lum < 155) darkMap[i] = 1;
    }

    for (let y = 0; y <= sh - WIN_H; y += 3) {
      for (let x = 0; x <= sw - WIN_W; x += 3) {
        let darkCount = 0;
        for (let dy = 0; dy < WIN_H; dy++) {
          const rowOffset = (y + dy) * sw + x;
          for (let dx = 0; dx < WIN_W; dx++) {
            darkCount += darkMap[rowOffset + dx];
          }
        }
        if (darkCount / (WIN_W * WIN_H) >= 0.78) {
          for (let dy = Math.max(0, y - 2); dy < Math.min(sh, y + WIN_H + 2); dy++) {
            for (let dx = Math.max(0, x - 2); dx < Math.min(sw, x + WIN_W + 2); dx++) {
              const idx = (dy * sw + dx) * 4;
              data[idx] = 255; data[idx + 1] = 255; data[idx + 2] = 255;
            }
          }
        }
      }
    }
  }

  ctx.putImageData(imgData, padPx, padPx);
  return out;
}

/**
 * 다중 줄(Multi-Line) 셀 캔버스를 수평 투영 프로파일(Horizontal Projection Profile)로 줄 단위 캔버스 배열로 분할
 * @param {HTMLCanvasElement} cellCanvas
 * @param {object} [options] - { isBanner?: boolean }
 * @returns {HTMLCanvasElement[]}
 */
export function splitCanvasIntoLineCanvases(cellCanvas, options = {}) {
  if (!cellCanvas) return [];
  if (options.isBanner || cellCanvas.height < 34) return [cellCanvas];

  const w = cellCanvas.width;
  const h = cellCanvas.height;
  const ctx = cellCanvas.getContext('2d', { willReadFrequently: true });
  const { data } = ctx.getImageData(0, 0, w, h);

  const xStart = Math.min(4, Math.floor(w * 0.02));
  const xEnd = Math.max(xStart + 1, w - xStart);
  const spanW = xEnd - xStart;

  const rowDensity = new Float32Array(h);
  for (let y = 0; y < h; y++) {
    let dark = 0;
    for (let x = xStart; x < xEnd; x++) {
      const k = (y * w + x) * 4;
      const lum = 0.299 * data[k] + 0.587 * data[k + 1] + 0.114 * data[k + 2];
      if (lum < 195) dark++;
    }
    const d = dark / spanW;
    // 가로 표 구분선(밀도 72% 초과)은 0으로 억제
    rowDensity[y] = d > 0.72 ? 0 : d;
  }

  const rawBands = [];
  let inBand = false;
  let startY = 0;
  for (let y = 0; y < h; y++) {
    if (rowDensity[y] > 0.012 && !inBand) {
      inBand = true;
      startY = y;
    } else if (rowDensity[y] <= 0.012 && inBand) {
      inBand = false;
      if (y - startY >= 8) rawBands.push([startY, y - 1]);
    }
  }
  if (inBand && h - startY >= 8) rawBands.push([startY, h - 1]);

  const merged = [];
  for (const b of rawBands) {
    if (merged.length && b[0] - merged[merged.length - 1][1] <= 3) {
      merged[merged.length - 1][1] = b[1];
    } else {
      merged.push(b);
    }
  }

  if (!merged.length) return [cellCanvas];

  const finalSlices = [];
  for (const [y0, y1] of merged) {
    const bh = y1 - y0 + 1;
    if (bh >= 44) {
      const midStart = y0 + Math.floor(bh * 0.30);
      const midEnd = y0 + Math.floor(bh * 0.70);
      let minVal = 1;
      let minY = midStart;
      for (let y = midStart; y <= midEnd; y++) {
        if (rowDensity[y] < minVal) {
          minVal = rowDensity[y];
          minY = y;
        }
      }
      if (minVal < 0.045) {
        finalSlices.push([Math.max(0, y0 - 3), Math.min(h - 1, minY + 2)]);
        finalSlices.push([Math.max(0, minY - 1), Math.min(h - 1, y1 + 4)]);
        continue;
      }
    }
    finalSlices.push([Math.max(0, y0 - 4), Math.min(h - 1, y1 + 4)]);
  }

  return finalSlices.map(([sy0, sy1]) => {
    const sh = Math.max(1, sy1 - sy0 + 1);
    const lc = document.createElement('canvas');
    lc.width = w;
    lc.height = sh;
    lc.getContext('2d').drawImage(cellCanvas, 0, sy0, w, sh, 0, 0, w, sh);
    return lc;
  });
}



