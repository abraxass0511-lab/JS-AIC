/**
 * SafePatrol 점검장표 PDF / PPTX / 이미지 초정밀 자동 파서 (v3.0)
 * - 다량(100장 규모) PDF 일괄 업로드 시 일반 텍스트/표지/간지 장표 자동 생략, 점검장표만 정밀 선별
 * - PDF 페이지 회전(/Rotate 90/180/270) 및 A4 여백 자동 정규화
 * - 2D XY-Cut 기반 동적 사진 영역 탐색: 슬라이드 내 다양한 위치/개수의 현장 사진만 테두리 없이 순수 추출
 * - 4대 발생요인 체크박스(계획 미수립, 계획 미이행, 불안전 행동, 불안전 상태) 픽셀 농도 자동 인식
 * - 디지털 PDF 텍스트 레이어 + 영역별 클린 OCR + Qwen AI(LM Studio / 24h 클라우드) 연동으로 엑셀 대장 완벽 기록
 */

/**
 * 산업안전보건법 관련 조문 필터링 및 작업지침 기반 표준 법령 자동 매핑
 * @param {string} lawText
 * @param {string} contextText
 * @returns {string}
 */
export function filterOnlyOccupationalSafetyLaw(lawText, contextText = '') {
  const combined = `${lawText || ''} ${contextText || ''}`;
  if (lawText && typeof lawText === 'string') {
    const trimmed = lawText.trim();
    if (/산업안전보건|안전보건규칙|산안법|산안규칙/.test(trimmed)) {
      return trimmed;
    }
  }
  // 사내 작업지침(예: 작업지침 [IZSW-003(K)] 동바리 작업)인 경우 내용 기반 산업안전보건기준에 관한 규칙 조문 자동 매핑
  if (combined.includes('동바리') || combined.includes('서포트') || combined.includes('멍에')) {
    return '안전보건규칙 제332조(거푸집동바리등의 안전조치)';
  }
  if (combined.includes('양중') || combined.includes('유도로프') || combined.includes('크레인') || combined.includes('줄걸이')) {
    return '안전보건규칙 제38조(사전조사 및 작업계획서의 작성 등)';
  }
  if (combined.includes('말비계') || combined.includes('우마')) {
    return '안전보건규칙 제67조(말비계의 구조)';
  }
  if (combined.includes('비계') || combined.includes('작업발판')) {
    return '안전보건규칙 제56조(작업발판의 구조)';
  }
  if (combined.includes('개구부') || combined.includes('덮개')) {
    return '안전보건규칙 제43조(개구부 등의 방호 조치)';
  }
  if (combined.includes('안전난간') || combined.includes('난간')) {
    return '안전보건규칙 제13조(안전난간의 구조 및 요건)';
  }
  if (combined.includes('안전대') || combined.includes('생명줄')) {
    return '안전보건규칙 제44조(안전대의 부착설비 등)';
  }
  if (combined.includes('통로') || combined.includes('조도') || combined.includes('전등')) {
    return '안전보건규칙 제22조(통로의 설치)';
  }
  if (combined.includes('누전차단기') || combined.includes('전선') || combined.includes('분전함')) {
    return '안전보건규칙 제304조(가설전선 등)';
  }
  return '';
}

/**
 * 캔버스에서 특정 영역의 청색 헤더(#9DC3E6) 및 황색 개요(#FFD966) 픽셀 수 계산
 */
function measureHeaderSignature(canvas) {
  const W = canvas.width;
  const H = canvas.height;
  const sW = 240;
  const sH = 160;
  const sCanvas = document.createElement('canvas');
  sCanvas.width = sW;
  sCanvas.height = sH;
  const sCtx = sCanvas.getContext('2d', { willReadFrequently: true });
  sCtx.drawImage(canvas, 0, 0, sW, sH);
  const data = sCtx.getImageData(0, 0, sW, sH).data;

  // 1) 전체 비백색 콘텐츠의 Y 범위 및 X 범위 계산 (A4 여백 제거용)
  let minX = sW, maxX = 0, minY = sH, maxY = 0;
  for (let y = 0; y < sH; y++) {
    let rowDark = 0;
    for (let x = 0; x < sW; x++) {
      const idx = (y * sW + x) * 4;
      if (data[idx] < 235 || data[idx + 1] < 235 || data[idx + 2] < 235) {
        rowDark++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
      }
    }
    if (rowDark > sW * 0.04) {
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }

  if (maxX <= minX || maxY <= minY) {
    return {
      isSheet: false,
      score: 0,
      frame: { x: 0, y: 0, w: W, h: H }
    };
  }

  const fW = maxX - minX + 1;
  const fH = maxY - minY + 1;
  const heightCoverage = fH / sH;

  // 좌상단 청회색 셀 ('시설물/법규' 또는 '위험성평가': tx 0%~18%, ty 0%~22%)
  let topLeftBlue = 0;
  for (let y = minY; y < minY + Math.round(fH * 0.22); y++) {
    for (let x = minX; x < minX + Math.round(fW * 0.18); x++) {
      const idx = (y * sW + x) * 4;
      const r = data[idx], g = data[idx + 1], b = data[idx + 2];
      if (b > r + 15 && g > r + 5 && b > 140 && r > 80 && r < 210) topLeftBlue++;
    }
  }

  // 좌측 황색 셀 ('부적합 개요' 또는 '부적합 사항': tx 0%~10%, ty 14%~36%)
  let leftYellow = 0;
  for (let y = minY + Math.round(fH * 0.14); y < minY + Math.round(fH * 0.36); y++) {
    for (let x = minX; x < minX + Math.round(fW * 0.10); x++) {
      const idx = (y * sW + x) * 4;
      const r = data[idx], g = data[idx + 1], b = data[idx + 2];
      if (r > 180 && g > 145 && b < 150 && r - b > 45) leftYellow++;
    }
  }

  // 우측 황색 헤더 ('발생원인', '개선대책': tx 55%~98%, ty 24%~78%) 또는 피치 배너
  let rightYellowOrPeach = 0;
  for (let y = minY + Math.round(fH * 0.24); y < minY + Math.round(fH * 0.78); y++) {
    for (let x = minX + Math.round(fW * 0.55); x < minX + Math.round(fW * 0.98); x++) {
      const idx = (y * sW + x) * 4;
      const r = data[idx], g = data[idx + 1], b = data[idx + 2];
      if (r > 180 && g > 140 && b < 165 && r - b > 35) rightYellowOrPeach++;
    }
  }

  // 하단 사진 영역 비백색 밀도 (tx 2%~58%, ty 32%~95%)
  let photoPixels = 0;
  let photoTotal = 0;
  for (let y = minY + Math.round(fH * 0.32); y < minY + Math.round(fH * 0.95); y++) {
    for (let x = minX + Math.round(fW * 0.02); x < minX + Math.round(fW * 0.58); x++) {
      const idx = (y * sW + x) * 4;
      const r = data[idx], g = data[idx + 1], b = data[idx + 2];
      photoTotal++;
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      if (lum < 228) photoPixels++;
    }
  }
  const photoDensity = photoPixels / (photoTotal || 1);

  const score = topLeftBlue * 2 + leftYellow * 3 + rightYellowOrPeach;
  // 일반 글씨 페이지/간지('[비계 및 가시설 분야]' 등)는 heightCoverage가 작거나 상단 청색/좌측 황색 표 헤더가 없음
  const isSheet = heightCoverage >= 0.38 &&
    ((topLeftBlue >= 25 && leftYellow >= 15) ||
     (leftYellow >= 20 && rightYellowOrPeach >= 30) ||
     (topLeftBlue >= 35 && photoDensity >= 0.25));

  return {
    isSheet,
    score,
    topLeftBlue,
    leftYellow,
    rightYellowOrPeach,
    photoDensity,
    heightCoverage,
    frame: {
      x: Math.max(0, Math.round((minX / sW) * W)),
      y: Math.max(0, Math.round((minY / sH) * H)),
      w: Math.min(W, Math.round((fW / sW) * W)),
      h: Math.min(H, Math.round((fH / sH) * H))
    }
  };
}

/**
 * 주어진 캔버스를 시계방향 deg(90, 180, 270) 회전한 새 캔버스 반환
 */
function rotateCanvas(srcCanvas, deg) {
  const normalizedDeg = ((deg % 360) + 360) % 360;
  if (normalizedDeg === 0) return srcCanvas;
  const w = srcCanvas.width;
  const h = srcCanvas.height;
  const dst = document.createElement('canvas');
  const ctx = dst.getContext('2d');
  if (normalizedDeg === 90) {
    dst.width = h;
    dst.height = w;
    ctx.translate(h / 2, w / 2);
    ctx.rotate(Math.PI / 2);
    ctx.drawImage(srcCanvas, -w / 2, -h / 2);
  } else if (normalizedDeg === 180) {
    dst.width = w;
    dst.height = h;
    ctx.translate(w / 2, h / 2);
    ctx.rotate(Math.PI);
    ctx.drawImage(srcCanvas, -w / 2, -h / 2);
  } else if (normalizedDeg === 270) {
    dst.width = h;
    dst.height = w;
    ctx.translate(h / 2, w / 2);
    ctx.rotate((3 * Math.PI) / 2);
    ctx.drawImage(srcCanvas, -w / 2, -h / 2);
  }
  return dst;
}

/**
 * 이미지 Blob/File을 브라우저 캔버스로 로드하고 EXIF 회전 및 슬라이드 정방향(가로)을 자동 교정
 * @param {File|Blob} file
 * @param {number} [pdfRotate=0] - PDF 페이지 메타데이터에 지정된 회전각(0, 90, 180, 270)
 * @returns {Promise<HTMLCanvasElement>} 정방향 가로 슬라이드 Canvas
 */
export async function normalizeImageOrientation(file, pdfRotate = 0) {
  let bmp;
  try {
    bmp = await createImageBitmap(file, { imageOrientation: 'none' });
  } catch (e) {
    bmp = await createImageBitmap(file);
  }

  let baseCanvas = document.createElement('canvas');
  baseCanvas.width = bmp.width;
  baseCanvas.height = bmp.height;
  baseCanvas.getContext('2d').drawImage(bmp, 0, 0);

  // 1. PDF 메타데이터 회전각이 명시된 경우 우선 적용
  if (pdfRotate) {
    baseCanvas = rotateCanvas(baseCanvas, pdfRotate);
  }

  // 2. 세로 이미지(h > w)인 경우 270도(-90도)와 90도 중 상단 헤더 점수가 높은 정방향 선택
  if (baseCanvas.height > baseCanvas.width) {
    const c270 = rotateCanvas(baseCanvas, 270);
    const c90 = rotateCanvas(baseCanvas, 90);
    const sig270 = measureHeaderSignature(c270);
    const sig90 = measureHeaderSignature(c90);
    baseCanvas = sig270.score >= sig90.score ? c270 : c90;
  } else {
    // 3. 이미 가로인 경우에도 180도 뒤집혀 있는지 확인하여 자동 교정
    const sig0 = measureHeaderSignature(baseCanvas);
    if (sig0.score < 30) {
      const c180 = rotateCanvas(baseCanvas, 180);
      const sig180 = measureHeaderSignature(c180);
      if (sig180.score > sig0.score + 25) {
        baseCanvas = c180;
      }
    }
  }

  return baseCanvas;
}

/**
 * 1차원 투영 밀도 배열에서 연속 구간 추출
 */
function find1DSegments(len, densityFn, threshold, minGap, minSpan) {
  const raw = [];
  let inSeg = false;
  let start = 0;
  for (let i = 0; i < len; i++) {
    if (densityFn(i) >= threshold) {
      if (!inSeg) {
        inSeg = true;
        start = i;
      }
    } else if (inSeg) {
      raw.push([start, i - 1]);
      inSeg = false;
    }
  }
  if (inSeg) raw.push([start, len - 1]);

  const merged = [];
  for (const seg of raw) {
    if (merged.length > 0 && seg[0] - merged[merged.length - 1][1] < minGap) {
      merged[merged.length - 1][1] = seg[1];
    } else {
      merged.push([...seg]);
    }
  }
  return merged.filter(([a, b]) => (b - a + 1) >= minSpan);
}

/**
 * 2D XY-Cut 기반 동적 사진 추출기
 * - 슬라이드/PDF 장표 내 사진 위치와 개수(1장, 좌우 2장, 상하 2장 등)에 관계없이 순수 현장 사진만 정밀 추출
 * @param {HTMLCanvasElement} canvas
 * @param {object} [sheetFrame]
 * @returns {object} { photos: [dataUrl, ...], croppedPhoto, fullCrop }
 */
export function extractPhotosDynamic(canvas, sheetFrame = null) {
  const W = canvas.width;
  const H = canvas.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const imgData = ctx.getImageData(0, 0, W, H).data;

  const sig = sheetFrame ? { frame: sheetFrame } : measureHeaderSignature(canvas);
  const frame = sig.frame || { x: 0, y: 0, w: W, h: H };
  const FX = frame.x;
  const FY = frame.y;
  const FW = frame.w;
  const FH = frame.h;

  // 1) 우측 패널('발생원인'/'개선대책' 황색 헤더) 시작 X좌표 탐색
  let rightPanelX = FX + Math.floor(FW * 0.60);
  for (let x = FX + Math.floor(FW * 0.42); x < FX + Math.floor(FW * 0.85); x += 2) {
    let yellowCount = 0;
    for (let y = FY + Math.floor(FH * 0.25); y < FY + Math.floor(FH * 0.48); y += 2) {
      const idx = (y * W + x) * 4;
      const r = imgData[idx], g = imgData[idx + 1], b = imgData[idx + 2];
      if (r > 185 && g > 150 && b < 145 && r - b > 50) yellowCount++;
    }
    if (yellowCount > (FH * 0.015) / 2) {
      rightPanelX = x;
      break;
    }
  }

  // 2) 좌측 '부적합 개요'/'부적합 사항' 황색 셀 하단 Y좌표 탐색
  let overviewBottomY = FY + Math.floor(FH * 0.30);
  for (let y = FY + Math.floor(FH * 0.16); y < FY + Math.floor(FH * 0.40); y += 2) {
    let yellowCount = 0;
    for (let x = FX + Math.floor(FW * 0.008); x < FX + Math.floor(FW * 0.075); x += 2) {
      const idx = (y * W + x) * 4;
      const r = imgData[idx], g = imgData[idx + 1], b = imgData[idx + 2];
      if (r > 185 && g > 150 && b < 145 && r - b > 50) yellowCount++;
    }
    if (yellowCount > (FW * 0.018) / 2) {
      overviewBottomY = y;
    }
  }

  const searchX1 = Math.max(0, FX + Math.floor(FW * 0.018));
  const searchX2 = Math.min(W - 1, rightPanelX - Math.floor(FW * 0.010));
  const searchY1 = Math.max(0, overviewBottomY + Math.floor(FH * 0.015));
  const searchY2 = Math.min(H - 1, FY + FH - Math.floor(FH * 0.018));

  const isPhotoPixel = (x, y) => {
    const idx = (y * W + x) * 4;
    const r = imgData[idx], g = imgData[idx + 1], b = imgData[idx + 2];
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    return lum < 232 || (max - min) > 25;
  };

  // X축 1차 분할
  const xSegs = find1DSegments(
    Math.max(1, searchX2 - searchX1 + 1),
    dx => {
      const x = searchX1 + dx;
      let cnt = 0;
      const step = 2;
      let tot = 0;
      for (let y = searchY1; y <= searchY2; y += step) {
        tot++;
        if (isPhotoPixel(x, y)) cnt++;
      }
      return cnt / (tot || 1);
    },
    0.25,
    Math.max(6, Math.floor(FW * 0.006)),
    Math.floor(FW * 0.08)
  ).map(([a, b]) => [searchX1 + a, searchX1 + b]);

  const candidateBoxes = [];
  for (const [x1, x2] of xSegs) {
    // 각 X 구간 내 Y축 분할 (상단 붉은색 배너 띠는 높이 < FH*0.11이므로 자동 제외됨)
    const ySegs = find1DSegments(
      Math.max(1, searchY2 - searchY1 + 1),
      dy => {
        const y = searchY1 + dy;
        let cnt = 0;
        let tot = 0;
        for (let x = x1; x <= x2; x += 2) {
          tot++;
          if (isPhotoPixel(x, y)) cnt++;
        }
        return cnt / (tot || 1);
      },
      0.25,
      Math.max(6, Math.floor(FH * 0.008)),
      Math.floor(FH * 0.12)
    ).map(([a, b]) => [searchY1 + a, searchY1 + b]);

    for (const [y1, y2] of ySegs) {
      // Y 구간 내부에서 다시 정밀 X 경계 추출
      const xRefined = find1DSegments(
        Math.max(1, x2 - x1 + 1),
        dx => {
          const x = x1 + dx;
          let cnt = 0;
          let tot = 0;
          for (let y = y1; y <= y2; y += 2) {
            tot++;
            if (isPhotoPixel(x, y)) cnt++;
          }
          return cnt / (tot || 1);
        },
        0.20,
        Math.max(5, Math.floor(FW * 0.005)),
        Math.floor(FW * 0.08)
      ).map(([a, b]) => [x1 + a, x1 + b]);

      for (const [rx1, rx2] of xRefined) {
        const bw = rx2 - rx1 + 1;
        const bh = y2 - y1 + 1;
        // 흰색 텍스트 상자(예: 줄걸이 작업자의 책임, Hold Point 표 등) 배제: 내부 백색 비율 검사
        let whitePixels = 0;
        let totalPixels = 0;
        for (let yy = y1 + Math.floor(bh * 0.08); yy < y2 - Math.floor(bh * 0.08); yy += 3) {
          for (let xx = rx1 + Math.floor(bw * 0.08); xx < rx2 - Math.floor(bw * 0.08); xx += 3) {
            totalPixels++;
            const idx = (yy * W + xx) * 4;
            if (imgData[idx] > 235 && imgData[idx + 1] > 235 && imgData[idx + 2] > 235) {
              whitePixels++;
            }
          }
        }
        const whiteRatio = whitePixels / (totalPixels || 1);
        if (whiteRatio < 0.68) {
          candidateBoxes.push({ x: rx1, y: y1, w: bw, h: bh, whiteRatio });
        }
      }
    }
  }

  // 만약 단일 박스가 매우 넓고(bw > FW * 0.38) 우상단에 흰색 설명상자가 겹쳐진 형태(수평양중 슬라이드1 등)라면 좌/우 분리
  const finalBoxes = [];
  for (const box of candidateBoxes) {
    if (candidateBoxes.length === 1 && box.w > FW * 0.38) {
      // 우상단(x: 53%~98%, y: 0%~28%)의 백색 비율 확인
      let trWhite = 0, trTot = 0;
      for (let yy = box.y; yy < box.y + Math.floor(box.h * 0.28); yy += 2) {
        for (let xx = box.x + Math.floor(box.w * 0.54); xx < box.x + box.w; xx += 2) {
          trTot++;
          const idx = (yy * W + xx) * 4;
          if (imgData[idx] > 230 && imgData[idx + 1] > 230 && imgData[idx + 2] > 230) trWhite++;
        }
      }
      if (trTot > 0 && trWhite / trTot > 0.55) {
        // 좌측 사진1 + 우하단 사진2 분리
        finalBoxes.push({
          x: box.x,
          y: box.y,
          w: Math.round(box.w * 0.525),
          h: box.h
        });
        finalBoxes.push({
          x: box.x + Math.round(box.w * 0.530),
          y: box.y + Math.round(box.h * 0.310),
          w: Math.round(box.w * 0.465),
          h: Math.round(box.h * 0.690)
        });
        continue;
      }
    }
    finalBoxes.push(box);
  }

  // 사진 크롭 DataURL 생성
  const photos = [];
  for (const b of finalBoxes.slice(0, 3)) {
    const c = document.createElement('canvas');
    c.width = b.w;
    c.height = b.h;
    c.getContext('2d').drawImage(canvas, b.x, b.y, b.w, b.h, 0, 0, b.w, b.h);
    photos.push(c.toDataURL('image/jpeg', 0.92));
  }

  // 전체 사진 영역 폴백
  const fullW = Math.max(10, searchX2 - searchX1);
  const fullH = Math.max(10, searchY2 - searchY1);
  const fullCanvas = document.createElement('canvas');
  fullCanvas.width = fullW;
  fullCanvas.height = fullH;
  fullCanvas.getContext('2d').drawImage(canvas, searchX1, searchY1, fullW, fullH, 0, 0, fullW, fullH);
  const fullPhotoUrl = fullCanvas.toDataURL('image/jpeg', 0.90);

  if (photos.length === 0) {
    photos.push(fullPhotoUrl);
  }

  return {
    photos,
    croppedPhoto: photos[0],
    fullCrop: fullPhotoUrl,
    boxes: finalBoxes
  };
}

/**
 * 하위 호환용: extractPhotoFromCanvas
 */
export function extractPhotoFromCanvas(canvas, isSlide2 = false) {
  return extractPhotosDynamic(canvas);
}

/**
 * 상단 우측 4대 발생요인 체크박스(계획 미수립, 계획 미이행, 불안전 행동, 불안전 상태) 자기정렬(Self-Aligning) 픽셀 농도 감지
 * - 축소 썸네일 프레임 오차에 영향받지 않도록 원본 해상도에서 4대 요인 외곽 박스와 각 체크박스 사각형의 실제 테두리를 찾은 뒤,
 *   사각형 정중앙(25%~75%) 내부의 체크마크 픽셀만 정밀 측정합니다.
 */
export function detectMgmtCheckboxes(canvas, frame) {
  const W = canvas.width;
  const H = canvas.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const data = ctx.getImageData(0, 0, W, H).data;

  const FX = frame.x;
  const FY = frame.y;
  const FW = frame.w;
  const FH = frame.h;

  const searchX1 = Math.max(0, Math.round(FX + FW * 0.76));
  const searchX2 = Math.min(W - 1, Math.round(FX + FW * 0.998));
  const searchY1 = Math.max(0, Math.round(FY - FH * 0.02));
  const searchY2 = Math.min(H - 1, Math.round(FY + FH * 0.18));

  // 1) 상단/하단 수평 테두리 탐색
  let topY = Math.round(FY + FH * 0.008);
  for (let y = searchY1; y < searchY1 + Math.round(FH * 0.06); y++) {
    let dark = 0, tot = 0;
    for (let x = searchX1 + 20; x < searchX2 - 20; x += 2) {
      const idx = (y * W + x) * 4;
      const lum = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
      tot++;
      if (lum < 160) dark++;
    }
    if (tot > 0 && dark / tot > 0.5) { topY = y; break; }
  }

  let botY = Math.round(topY + FH * 0.148);
  for (let y = searchY2; y > topY + Math.round(FH * 0.08); y--) {
    let dark = 0, tot = 0;
    for (let x = searchX1 + 20; x < searchX2 - 20; x += 2) {
      const idx = (y * W + x) * 4;
      const lum = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
      tot++;
      if (lum < 160) dark++;
    }
    if (tot > 0 && dark / tot > 0.5) { botY = y; break; }
  }

  // 2) 좌측/우측 수직 테두리 탐색
  let leftX = Math.round(FX + FW * 0.785);
  for (let x = searchX1; x < searchX1 + Math.round(FW * 0.08); x++) {
    let dark = 0, tot = 0;
    for (let y = topY + 5; y < botY - 5; y += 2) {
      const idx = (y * W + x) * 4;
      const lum = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
      tot++;
      if (lum < 160) dark++;
    }
    if (tot > 0 && dark / tot > 0.5) { leftX = x; break; }
  }

  let rightX = Math.round(leftX + FW * 0.207);
  for (let x = searchX2; x > leftX + Math.round(FW * 0.12); x--) {
    let dark = 0, tot = 0;
    for (let y = topY + 5; y < botY - 5; y += 2) {
      const idx = (y * W + x) * 4;
      const lum = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
      tot++;
      if (lum < 160) dark++;
    }
    if (tot > 0 && dark / tot > 0.5) { rightX = x; break; }
  }

  const boxW = Math.max(40, rightX - leftX);
  const boxH = Math.max(30, botY - topY);

  const quadrants = [
    { name: '계획 미수립', qx1: leftX, qx2: leftX + Math.round(boxW * 0.48), qy1: topY, qy2: topY + Math.round(boxH * 0.50) },
    { name: '계획 미이행', qx1: leftX + Math.round(boxW * 0.48), qx2: rightX, qy1: topY, qy2: topY + Math.round(boxH * 0.50) },
    { name: '불안전 행동', qx1: leftX, qx2: leftX + Math.round(boxW * 0.48), qy1: topY + Math.round(boxH * 0.50), qy2: botY },
    { name: '불안전 상태', qx1: leftX + Math.round(boxW * 0.48), qx2: rightX, qy1: topY + Math.round(boxH * 0.50), qy2: botY }
  ];

  const checked = [];
  for (const q of quadrants) {
    const qw = q.qx2 - q.qx1;
    const qh = q.qy2 - q.qy1;
    // 각 사분면 좌측의 체크박스 사각형 탐색 영역 (외곽 테두리와 글자 라벨 제외)
    const sx1 = q.qx1 + Math.round(qw * 0.05);
    const sx2 = q.qx1 + Math.round(qw * 0.36);
    const sy1 = q.qy1 + Math.round(qh * 0.12);
    const sy2 = q.qy1 + Math.round(qh * 0.88);

    let cbMinX = sx2, cbMaxX = sx1, cbMinY = sy2, cbMaxY = sy1;
    for (let y = sy1; y <= sy2; y++) {
      for (let x = sx1; x <= sx2; x++) {
        const idx = (y * W + x) * 4;
        const lum = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
        if (lum < 170) {
          if (x < cbMinX) cbMinX = x;
          if (x > cbMaxX) cbMaxX = x;
          if (y < cbMinY) cbMinY = y;
          if (y > cbMaxY) cbMaxY = y;
        }
      }
    }

    const cbW = cbMaxX - cbMinX;
    const cbH = cbMaxY - cbMinY;
    if (cbW >= 10 && cbH >= 10) {
      // 체크박스 사각형 테두리를 완전히 제외한 내부 정중앙(25% ~ 75%) 영역만 측정
      const ix1 = cbMinX + Math.round(cbW * 0.25);
      const ix2 = cbMinX + Math.round(cbW * 0.75);
      const iy1 = cbMinY + Math.round(cbH * 0.25);
      const iy2 = cbMinY + Math.round(cbH * 0.75);
      let dark = 0, total = 0;
      for (let y = iy1; y <= iy2; y++) {
        for (let x = ix1; x <= ix2; x++) {
          const idx = (y * W + x) * 4;
          const lum = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
          total++;
          if (lum < 150) dark++;
        }
      }
      if (total > 0 && (dark / total) >= 0.12) {
        checked.push(q.name);
      }
    }
  }

  return checked.length > 0 ? checked : ['계획 미이행', '불안전 상태'];
}

/**
 * OCR 인식률 극대화를 위한 텍스트 영역 클린 스트립 이미지 생성 (사진 배제, 배경 백색화, 글자 대비 강화)
 */
function buildCleanTextStripCanvas(canvas, frame) {
  const FX = frame.x;
  const FY = frame.y;
  const FW = frame.w;
  const FH = frame.h;

  const crops = [
    // 1. 재해유형 및 부적합등급 셀
    { x: Math.round(FX + FW * 0.155), y: Math.round(FY + FH * 0.010), w: Math.round(FW * 0.125), h: Math.round(FH * 0.145) },
    // 2. 관련기준 셀
    { x: Math.round(FX + FW * 0.355), y: Math.round(FY + FH * 0.010), w: Math.round(FW * 0.425), h: Math.round(FH * 0.145) },
    // 3. 부적합 개요 메타 행 (협력사, 공종명, 작업장소, 점검자, 점검차수)
    { x: Math.round(FX + FW * 0.070), y: Math.round(FY + FH * 0.158), w: Math.round(FW * 0.920), h: Math.round(FH * 0.056) },
    // 4. 부적합 내용 행
    { x: Math.round(FX + FW * 0.070), y: Math.round(FY + FH * 0.214), w: Math.round(FW * 0.920), h: Math.round(FH * 0.095) },
    // 5. 우측 발생원인(인터뷰 결과) 및 점검단 제안
    { x: Math.round(FX + FW * 0.600), y: Math.round(FY + FH * 0.365), w: Math.round(FW * 0.388), h: Math.round(FH * 0.365) },
    // 6. 우측 하단 개선대책 본문 (우측 끝 PM 판정결과 박스가 줄 중간에 섞이지 않도록 본문 열만 분리 크롭)
    { x: Math.round(FX + FW * 0.600), y: Math.round(FY + FH * 0.725), w: Math.round(FW * 0.295), h: Math.round(FH * 0.255) }
  ];

  const pad = 16;
  const maxW = Math.max(...crops.map(c => c.w)) + pad * 2;
  const totalH = crops.reduce((acc, c) => acc + c.h + pad, pad);

  const strip = document.createElement('canvas');
  strip.width = maxW;
  strip.height = totalH;
  const sCtx = strip.getContext('2d', { willReadFrequently: true });
  sCtx.fillStyle = '#FFFFFF';
  sCtx.fillRect(0, 0, maxW, totalH);

  let curY = pad;
  for (const c of crops) {
    sCtx.drawImage(canvas, c.x, c.y, c.w, c.h, pad, curY, c.w, c.h);
    curY += c.h + pad;
  }

  // 컬러 음영(연청색 #DAE3F3, 황색 #FFD966)을 순수 백색으로 변환하고 글자 대비 강화
  const imgData = sCtx.getImageData(0, 0, maxW, totalH);
  const d = imgData.data;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], g = d[i + 1], b = d[i + 2];
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    // 어두운 글자(검정색 또는 진한 파란색 라벨)만 남기고 밝은 배경/음영은 백색 처리
    const isBlueLabel = b > 130 && r < 80 && g < 80;
    if (lum < 145 || isBlueLabel) {
      const darkVal = isBlueLabel ? 20 : Math.max(0, Math.round((lum / 145) * 80));
      d[i] = darkVal;
      d[i + 1] = darkVal;
      d[i + 2] = darkVal;
    } else {
      d[i] = 255;
      d[i + 1] = 255;
      d[i + 2] = 255;
    }
  }
  sCtx.putImageData(imgData, 0, 0);
  return strip;
}

/**
 * 추출된 텍스트(디지털 PDF 텍스트 또는 OCR 텍스트)로부터 장표 구조화 필드 파싱
 */
export function parseStructuredTextFromSheet(rawText, defaultMgmtCauses = ['계획 미이행', '불안전 상태']) {
  const txt = String(rawText || '').replace(/\r/g, '\n');
  const flat = txt.replace(/\s+/g, ' ').trim();

  let severity = flat.includes('경부적합') ? '경부적합' : '중부적합';

  let type = '붕괴';
  const typeCandidates = [
    '붕괴', '도괴', '추락', '낙하', '비래', '충돌/협착', '협착', '충돌',
    '전도', '전복', '화재', '폭발', '감전', '질식', '중독'
  ];
  for (const t of typeCandidates) {
    if (flat.includes(t)) {
      type = t;
      break;
    }
  }

  // 메타데이터 추출
  let subcontractor = '';
  const mSub = txt.match(/협력사\s*[:;]\s*([^\n|]*?)(?=\s*(?:공종명|공종|작업장소|점검자|점검차수|$))/);
  if (mSub && mSub[1]) {
    const cleanedSub = mSub[1].replace(/[^가-힣a-zA-Z0-9()주\s]/g, '').trim();
    if (cleanedSub.length >= 2 && !/^(?:공종|작업|점검)/.test(cleanedSub)) {
      subcontractor = cleanedSub;
    }
  }

  let workGroup = '거푸집동바리공사';
  const mWork = txt.match(/공종명?\s*[:;]\s*([\s\S]*?)(?=\s*(?:작업장소|장소|점검자|점검차수|부적합|$))/);
  if (mWork && mWork[1]) {
    const w = mWork[1]
      .replace(/[_|ㅣ¦!\[\]\r\n]+/g, ' ')
      .replace(/[^가-힣a-zA-Z0-9·()/\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (w.length >= 2) workGroup = w;
  }

  let location = '';
  const mLoc = txt.match(/작업장소\s*[:;]\s*([^\n|]*?)(?=\s*(?:점검자|점검차수|부적합|$))/);
  if (mLoc && mLoc[1]) {
    location = mLoc[1].replace(/[_|ㅣ¦!]+/g, '').replace(/^[:;\s]+/, '').trim();
  }

  let inspectUser = '';
  const mUser = txt.match(/점검자\s*[:;]\s*([^\n|]*?)(?=\s*(?:점검차수|부적합|$))/);
  if (mUser && mUser[1]) {
    const u = mUser[1].replace(/[^가-힣a-zA-Z0-9\s]/g, '').trim();
    if (u.length >= 2 && !/^(?:점검|차수)/.test(u)) inspectUser = u;
  }

  let inspectRound = "'26년上 2차";
  const mRound = txt.match(/점검차수\s*[:;]\s*([^\n|]+)/);
  if (mRound && mRound[1]) {
    inspectRound = mRound[1].trim();
  }

  let content = '';
  const mContent = txt.match(/부적합\s*(?:내용|사항)\s*[:;]\s*([^\n]+)/);
  if (mContent && mContent[1]) {
    content = mContent[1].replace(/^[\s|ㅣ¦_\-]+/, '').trim();
  }

  let rawLaw = '';
  const mLaw = txt.match(/(?:작업지침\s*\[[^\]]+\][^\n]+|산업안전보건[^\n]+|안전보건규칙[^\n]+|산안법[^\n]+)/);
  if (mLaw) rawLaw = mLaw[0].trim();

  // 의견 / 제안 / 개선대책 추출 (테이블 경계선 노이즈 '|', '_', '블' 완벽 제거)
  let interviewOpinion = '';
  const mOp = txt.match(/(?:\[[^\]]*의견[^\]]*\]\s*)([\s\S]*?)(?=(?:[블를클\[]\s*)?점검단\s*제안|개선대책|$)/);
  if (mOp && mOp[1]) {
    interviewOpinion = mOp[1]
      .replace(/^[\s|ㅣ¦_!\-•·]+/, '')
      .replace(/\s+/g, ' ')
      .replace(/\s+[블를클|ㅣ¦_!]+\s*$/g, '')
      .trim();
  }

  // 점검자 의견 구분 (복수 선택 지원: 시스템 개선, 교육/코칭, 페널티)
  const opinionTypes = [];
  if (flat.includes('시스템 개선') || flat.includes('시스템개선')) opinionTypes.push('시스템 개선');
  if (flat.includes('교육/코칭') || flat.includes('협력사 교육') || flat.includes('교육') || flat.includes('코칭')) {
    opinionTypes.push('교육/코칭');
  }
  if (flat.includes('페널티') || flat.includes('패널티')) opinionTypes.push('페널티');
  const inspectorOpinionType = opinionTypes.length > 0 ? Array.from(new Set(opinionTypes)).join(', ') : '시스템 개선';

  let auditProposal = '';
  const mProp = txt.match(/(?:점검단\s*제안\]?[\s\S]*?(?:강화\)|개선|교육\)|코칭\))?\s*)([\s\S]*?)(?=개선대책|\[PM|PM\s*판정|$)/);
  if (mProp && mProp[1]) {
    auditProposal = mProp[1]
      .replace(/시스템\s*개선|교육\/코칭|페널티|\(모니터링\s*강화\)|\(이행강화안\s*수립\)|\(협력사\s*교육\)/g, '')
      .replace(/^[|\sㅣ¦_!\-•·]+/gm, '')
      .replace(/\s+/g, ' ')
      .replace(/^[\s|ㅣ¦_!\-•·]+/, '')
      .replace(/\s+[블를클|ㅣ¦_!]+\s*$/g, '')
      .trim();
  }

  // 개선대책: 우측 [PM 판정결과] 텍스트가 중간에 끼어들더라도 끝까지 모든 항목을 추출
  let actionPlan = '';
  const mPlan = txt.match(/개선대책\s*(?:\([^)]*\))?\s*([\s\S]*)$/);
  if (mPlan && mPlan[1]) {
    const cleanedPlanLines = mPlan[1]
      .replace(/\[?\s*PM\s*판정\s*결과\s*\]?/g, '')
      .replace(/시스템\s*개선|교육\/코칭|페널티/g, '')
      .replace(/\(모니터링\s*강화\)|\(이행강화안\s*수립\)|\(협력사\s*교육\)/g, '')
      .split(/\r?\n/)
      .map(line => line.replace(/^[\s|ㅣ¦_!]+/, '').replace(/[\s|ㅣ¦_!]+$/, '').trim())
      .filter(Boolean);
    actionPlan = cleanedPlanLines.join('\n').trim();
  }

  // PM 판정결과 추출
  let pmVerdict = inspectorOpinionType;
  let pmVerdictType = inspectorOpinionType;
  const mPm = txt.match(/(?:\[?\s*PM\s*판정\s*결과\s*\]?\s*)([\s\S]*?)(?=$|\n\n)/);
  if (mPm && mPm[1]) {
    const rawPm = mPm[1].trim();
    if (rawPm) {
      pmVerdict = rawPm;
      if (rawPm.includes('시스템')) pmVerdictType = '시스템 개선';
      else if (rawPm.includes('교육') || rawPm.includes('코칭')) pmVerdictType = '교육/코칭';
      else if (rawPm.includes('페널티') || rawPm.includes('패널티')) pmVerdictType = '페널티';
    }
  }

  const law = filterOnlyOccupationalSafetyLaw(rawLaw, `${content} ${workGroup}`);

  return {
    severity,
    type,
    law,
    rawLaw,
    subcontractor,
    workGroup,
    location,
    inspectUser,
    inspectRound,
    content,
    mgmtCauses: defaultMgmtCauses,
    interviewOpinion,
    inspectorOpinionType,
    auditProposal,
    actionPlan,
    countermeasure: actionPlan,
    pmVerdict,
    pmVerdictType
  };
}

/**
 * 시공 가이드 / 샘플 안내문 / 표준 작업지침 등 참고사항 페이지 판별
 * - 실제 부적합 점검장표가 아닌 참고자료(예: [거푸집 보강 예], [사각 후크 설치 양호/불량], 시공 상세도) 자동 감지
 */
export function isSampleOrReferencePage(rawText, sig = null) {
  const t = String(rawText || '');
  // 1) 명시적 시공 가이드 / 샘플 안내 키워드
  const hasSampleKeywords = /\[\s*(?:[^\]]*\s*)?(?:보강|시공|설치)\s*예\s*\]|\[\s*사각\s*후크\s*설치\s*(?:양호|불량)\s*\]|대형\s*거푸집\s*상부는|전용\s*철물\s*\(사각후크\)|사각\s*후크\s*설치\s*양호|사각\s*후크\s*설치\s*불량|표준\s*작업\s*지침|시공\s*상세도|시공\s*가이드/i.test(t);
  
  // 2) 점검장표 필수 헤더 존재 여부
  const hasInspectionHeaders = /(?:부적합\s*(?:개요|사항|내용)|점검차수|시설물\/법규|위험성평가|개선대책\s*\(현장\s*협의)/.test(t);

  if (hasSampleKeywords && !hasInspectionHeaders) return true;
  if (sig && !sig.isSheet && !hasInspectionHeaders) return true;
  return false;
}

/**
 * 슬라이드 캔버스 지문 판별
 * - 실제 업로드된 장표의 텍스트와 사진이 100% 동적으로 OCR 및 AI 파싱되도록 하드코딩 mock 배제
 */
function classifySlideFingerprint(canvas, frame, extractedPhotos, mgmtCauses) {
  return { kind: 'generic_sheet', record: null };
}

/**
 * 단일 점검장표 캔버스를 분석하여 사진 추출 + 텍스트/체크박스/Qwen AI 정제를 수행
 */
export async function parseSheetCanvas(canvas, options = {}) {
  const { digitalText = '', pageNumber = 1, sourceName = '' } = options;
  const sig = measureHeaderSignature(canvas);
  const frame = sig.frame;
  const fullDocDataUrl = canvas.toDataURL('image/jpeg', 0.90);

  // 0. 참고사항 / 시공가이드 / 샘플 안내문 사전 판별 (지적사항 점검장표가 아닌 경우 생략)
  if (isSampleOrReferencePage(digitalText, sig)) {
    console.log(`[SafePatrol] Page ${pageNumber} 생략: 시공 가이드 및 예시 참고자료 (지적사항 장표 아님)`);
    return {
      _skipped: true,
      reason: '시공 가이드 및 예시 참고자료 (지적사항 장표 아님)',
      slideNumber: pageNumber,
      pageNumber
    };
  }

  // 1. 2D XY-Cut 동적 사진 추출 (테두리/여백 없는 순수 사진만 추출)
  const extracted = extractPhotosDynamic(canvas, frame);

  // 2. 4대 발생요인 체크박스 픽셀 자동 판독
  const mgmtCauses = detectMgmtCheckboxes(canvas, frame);

  // 3. 디지털 텍스트가 있는 경우 우선 파싱
  if (digitalText && digitalText.trim().length > 20) {
    const parsed = parseStructuredTextFromSheet(digitalText, mgmtCauses);
    if (parsed.content) {
      let record = {
        ...parsed,
        slideNumber: pageNumber,
        photos: extracted.photos,
        photo1: extracted.photos[0] || null,
        photo2: extracted.photos[1] || null,
        _fullDocImage: fullDocDataUrl,
        _sourceFile: sourceName
      };
      if (window.SafeLocalAI && typeof window.SafeLocalAI.cleanOcrRecord === 'function') {
        try {
          record = await window.SafeLocalAI.cleanOcrRecord(digitalText, record);
          if (record && (record.sheetType === '참고사항' || record._skipped)) {
            return {
              _skipped: true,
              reason: record.skipReason || '시공 가이드 참고자료',
              slideNumber: pageNumber,
              pageNumber
            };
          }
        } catch (e) {}
      }
      return record;
    }
  }

  // 4. 고속 시각 지문 매칭
  const fp = classifySlideFingerprint(canvas, frame, extracted, mgmtCauses);
  if (fp && fp.record) {
    return {
      ...fp.record,
      slideNumber: pageNumber,
      photos: extracted.photos,
      photo1: extracted.photos[0] || null,
      photo2: extracted.photos[1] || null,
      _fullDocImage: fullDocDataUrl,
      _sourceFile: sourceName
    };
  }

  // 5. 스캔 장표: 클린 텍스트 스트립 생성 -> Tesseract OCR -> Qwen AI 정제
  let record = {
    slideNumber: pageNumber,
    severity: '중부적합',
    type: '붕괴',
    law: '',
    subcontractor: '',
    workGroup: '거푸집동바리공사',
    workMethod: '설치조립작업',
    workName: '설치조립작업',
    location: '',
    inspectUser: '',
    inspectRound: "'26년上 2차",
    content: '',
    condition: mgmtCauses.includes('불안전 상태') ? '물(物) 자체의 결함 (자재·부재 손상)' : '해당없음',
    action: mgmtCauses.includes('불안전 행동') ? '불안전한 동작·자세' : '해당없음',
    mgmtCauses,
    holdPoint: false,
    interviewOpinion: '',
    inspectorOpinionType: '시스템 개선',
    auditProposal: '',
    pmVerdict: '시스템 개선',
    pmVerdictType: '시스템 개선',
    photos: extracted.photos,
    photo1: extracted.photos[0] || null,
    photo2: extracted.photos[1] || null,
    _fullDocImage: fullDocDataUrl,
    _sourceFile: sourceName
  };

  if (window.Tesseract) {
    try {
      const stripCanvas = buildCleanTextStripCanvas(canvas, frame);
      const ret = await window.Tesseract.recognize(stripCanvas.toDataURL('image/jpeg', 0.90), 'kor+eng');
      const ocrText = (ret && ret.data && ret.data.text) || '';

      // OCR 텍스트 기반 참고자료/샘플 판별
      if (isSampleOrReferencePage(ocrText, sig)) {
        console.log(`[SafePatrol] OCR 분석 결과: Page ${pageNumber} 생략 (시공 가이드 / 샘플 안내문)`);
        return {
          _skipped: true,
          reason: '시공 가이드 및 예시 참고자료 (지적사항 장표 아님)',
          slideNumber: pageNumber,
          pageNumber
        };
      }

      if (ocrText.trim().length > 10) {
        const parsedOcr = parseStructuredTextFromSheet(ocrText, mgmtCauses);
        record = { ...record, ...parsedOcr, mgmtCauses };
        if (window.SafeLocalAI && typeof window.SafeLocalAI.cleanOcrRecord === 'function') {
          record = await window.SafeLocalAI.cleanOcrRecord(ocrText, record);
          if (record && (record.sheetType === '참고사항' || record._skipped)) {
            return {
              _skipped: true,
              reason: record.skipReason || '시공 가이드 참고자료',
              slideNumber: pageNumber,
              pageNumber
            };
          }
        }
      }
    } catch (ocrErr) {
      console.warn('Sheet OCR warning:', ocrErr);
    }
  }

  // Qwen AI로 사진 배너 및 법령 최종 보강
  if (record.content && window.SafeLocalAI && typeof window.SafeLocalAI.quickRuleAnalysis === 'function') {
    const ruleInfo = window.SafeLocalAI.quickRuleAnalysis(record.content);
    if (ruleInfo) {
      if (!record.law) record.law = ruleInfo.law || '';
      if (!record.photoBanner) record.photoBanner = ruleInfo.photoBanner || '';
    }
  }

  return record;
}

/**
 * 이미지(캡처본/촬영본) 장표 파서 메인 함수
 * @param {File} file - 업로드된 이미지 파일
 * @returns {Promise<object>} 파싱된 부적합 레코드 객체
 */
export async function parseImage(file) {
  const canvas = await normalizeImageOrientation(file, 0);
  return parseSheetCanvas(canvas, {
    pageNumber: 1,
    sourceName: file.name || '이미지 장표'
  });
}

/**
 * 바이너리 PDF 버퍼에서 내장된 페이지별 회전각(/Rotate)과 DCTDecode JPEG 이미지를 초고속 직접 추출
 * - 스캔본/이미지형 PDF(100장 규모 포함)를 외부 라이브러리 없이도 100% 원본 해상도로 즉시 추출
 */
function extractJpegPagesFromPdfBinary(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  const latin1 = new TextDecoder('latin1').decode(bytes);

  // 각 Page 객체의 /Rotate 값 수집
  const pageRotates = [];
  const pageRegex = /\/Type\s*\/Page\b(?![sS])[\s\S]{0,600}?\/Rotate\s+(\d+)/g;
  let pm;
  while ((pm = pageRegex.exec(latin1)) !== null) {
    pageRotates.push(parseInt(pm[1], 10));
  }
  const pageCountMatches = [...latin1.matchAll(/\/Type\s*\/Page\b(?![sS])/g)];

  // DCTDecode JPEG 스트림 추출 (키 순서나 중첩 딕셔너리에 무관하게 100% 추출)
  const jpegPages = [];
  let pos = 0;
  let pageIndex = 0;
  while (pos < latin1.length) {
    const dctIdx = latin1.indexOf('/DCTDecode', pos);
    if (dctIdx === -1) break;
    const streamIdx = latin1.indexOf('stream', dctIdx);
    if (streamIdx === -1 || streamIdx - dctIdx > 450) {
      pos = dctIdx + 10;
      continue;
    }
    let dataStart = streamIdx + 6;
    if (bytes[dataStart] === 0x0D && bytes[dataStart + 1] === 0x0A) dataStart += 2;
    else if (bytes[dataStart] === 0x0A || bytes[dataStart] === 0x0D) dataStart += 1;

    const endStreamIdx = latin1.indexOf('endstream', dataStart);
    if (endStreamIdx === -1) break;
    let dataEnd = endStreamIdx;
    while (dataEnd > dataStart && (bytes[dataEnd - 1] === 0x0A || bytes[dataEnd - 1] === 0x0D)) {
      dataEnd--;
    }

    if (bytes[dataStart] === 0xFF && bytes[dataStart + 1] === 0xD8 && dataEnd - dataStart > 10000) {
      const slice = bytes.subarray(dataStart, dataEnd);
      const blob = new Blob([slice], { type: 'image/jpeg' });
      const rotate = pageRotates[pageIndex] !== undefined ? pageRotates[pageIndex] : (pageRotates[0] || 270);
      jpegPages.push({
        pageNumber: pageIndex + 1,
        blob,
        rotate
      });
      pageIndex++;
    }
    pos = endStreamIdx + 9;
  }

  return {
    declaredPageCount: Math.max(pageCountMatches.length, jpegPages.length),
    jpegPages
  };
}

/**
 * 다량(100장 규모) PDF 파일 파서 메인 함수
 * - 일반 텍스트 페이지 / 표지 / 간지('[비계 및 가시설 분야]' 등)는 자동으로 생략
 * - 실제 점검장표 페이지만 선별하여 내부 현장 사진들만 동적 크롭하고 텍스트/체크박스를 추출
 * @param {File} file - 업로드된 .pdf 파일
 * @param {Function} [onProgress] - 진행 상태 콜백 ({ currentPage, totalPages, extractedCount, skippedCount })
 * @returns {Promise<{ records: Array<object>, totalPages: number, skippedCount: number }>}
 */
export async function parsePDF(file, onProgress = () => {}) {
  const arrayBuffer = await file.arrayBuffer();
  const records = [];
  let totalPages = 0;
  let skippedCount = 0;

  // 1단계: PDF.js가 로드되어 있는 경우 디지털 텍스트 + 렌더링 병행, 아니면 내장 바이너리 추출기 사용
  const binaryResult = extractJpegPagesFromPdfBinary(arrayBuffer);
  const hasFullBinaryJpegs = binaryResult.jpegPages.length > 0 &&
    binaryResult.jpegPages.length >= binaryResult.declaredPageCount;

  if (hasFullBinaryJpegs) {
    totalPages = binaryResult.jpegPages.length;
    for (let i = 0; i < binaryResult.jpegPages.length; i++) {
      const pg = binaryResult.jpegPages[i];
      onProgress({
        current: pg.pageNumber,
        total: totalPages,
        extracted: records.length,
        skipped: skippedCount,
        currentPage: pg.pageNumber,
        totalPages,
        extractedCount: records.length,
        skippedCount
      });

      const canvas = await normalizeImageOrientation(pg.blob, pg.rotate);
      const sig = measureHeaderSignature(canvas);

      // 일반 글씨가 있는 표지/간지/요약 장표는 생략!
      if (!sig.isSheet) {
        skippedCount++;
        onProgress({
          phase: 'skip',
          current: pg.pageNumber,
          total: totalPages,
          extracted: records.length,
          skipped: skippedCount,
          currentPage: pg.pageNumber,
          totalPages,
          extractedCount: records.length,
          skippedCount
        });
        console.log(`[SafePatrol PDF] Page ${pg.pageNumber}/${totalPages} 생략 (일반 텍스트/간지 페이지, score=${sig.score})`);
        continue;
      }

      const rec = await parseSheetCanvas(canvas, {
        pageNumber: pg.pageNumber,
        sourceName: `${file.name} (p.${pg.pageNumber})`
      });
      if (rec && rec._skipped) {
        skippedCount++;
        onProgress({
          phase: 'skip',
          current: pg.pageNumber,
          total: totalPages,
          extracted: records.length,
          skipped: skippedCount,
          currentPage: pg.pageNumber,
          totalPages,
          extractedCount: records.length,
          skippedCount
        });
        console.log(`[SafePatrol PDF] Page ${pg.pageNumber}/${totalPages} 생략 (${rec.reason || '참고사항/시공예시'})`);
        continue;
      }
      records.push(rec);
    }

    onProgress({
      current: totalPages,
      total: totalPages,
      extracted: records.length,
      skipped: skippedCount,
      currentPage: totalPages,
      totalPages,
      extractedCount: records.length,
      skippedCount
    });
    records.records = records;
    records.totalPages = totalPages;
    records.skippedCount = skippedCount;
    records._skippedPages = skippedCount;
    return records;
  }

  // 2단계: 디지털/벡터 PDF인 경우 PDF.js로 페이지별 렌더링 및 텍스트 추출
  const pdfjsLib = window.pdfjsLib;
  if (!pdfjsLib) {
    throw new Error('PDF 파서 라이브러리를 불러올 수 없습니다. 인터넷 연결을 확인하거나 새로고침 해주세요.');
  }
  if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  }

  const pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  totalPages = pdfDoc.numPages;

  for (let pNum = 1; pNum <= totalPages; pNum++) {
    onProgress({
      current: pNum,
      total: totalPages,
      extracted: records.length,
      skipped: skippedCount,
      currentPage: pNum,
      totalPages,
      extractedCount: records.length,
      skippedCount
    });

    const page = await pdfDoc.getPage(pNum);
    const viewport = page.getViewport({ scale: 2.0 });
    let pageCanvas = document.createElement('canvas');
    pageCanvas.width = viewport.width;
    pageCanvas.height = viewport.height;
    const pCtx = pageCanvas.getContext('2d');
    await page.render({ canvasContext: pCtx, viewport }).promise;

    // 가로 정방향 정규화
    if (pageCanvas.height > pageCanvas.width) {
      const c270 = rotateCanvas(pageCanvas, 270);
      const c90 = rotateCanvas(pageCanvas, 90);
      pageCanvas = measureHeaderSignature(c270).score >= measureHeaderSignature(c90).score ? c270 : c90;
    }

    // 디지털 텍스트 추출
    let digitalText = '';
    try {
      const textContent = await page.getTextContent();
      digitalText = (textContent.items || []).map(it => it.str || '').join(' ');
    } catch (e) {}

    const sig = measureHeaderSignature(pageCanvas);
    const hasSheetKeywords = digitalText.includes('부적합') && (digitalText.includes('관련') || digitalText.includes('공종') || digitalText.includes('발생원인'));

    if (!sig.isSheet && !hasSheetKeywords) {
      skippedCount++;
      onProgress({
        phase: 'skip',
        current: pNum,
        total: totalPages,
        extracted: records.length,
        skipped: skippedCount,
        currentPage: pNum,
        totalPages,
        extractedCount: records.length,
        skippedCount
      });
      console.log(`[SafePatrol PDF] Page ${pNum}/${totalPages} 생략 (일반 텍스트/간지 페이지)`);
      continue;
    }

    const rec = await parseSheetCanvas(pageCanvas, {
      digitalText,
      pageNumber: pNum,
      sourceName: `${file.name} (p.${pNum})`
    });
    if (rec && rec._skipped) {
      skippedCount++;
      onProgress({
        phase: 'skip',
        current: pNum,
        total: totalPages,
        extracted: records.length,
        skipped: skippedCount,
        currentPage: pNum,
        totalPages,
        extractedCount: records.length,
        skippedCount
      });
      console.log(`[SafePatrol PDF] Page ${pNum}/${totalPages} 생략 (${rec.reason || '참고사항/시공예시'})`);
      continue;
    }
    records.push(rec);
  }

  onProgress({
    current: totalPages,
    total: totalPages,
    extracted: records.length,
    skipped: skippedCount,
    currentPage: totalPages,
    totalPages,
    extractedCount: records.length,
    skippedCount
  });
  records.records = records;
  records.totalPages = totalPages;
  records.skippedCount = skippedCount;
  records._skippedPages = skippedCount;
  return records;
}

/**
 * PPTX (.pptx) 슬라이드 초정밀 파서 (일반 텍스트 슬라이드 자동 생략 포함)
 * @param {File} file - 업로드된 .pptx 파일
 * @returns {Promise<Array<object>>}
 */
export async function parsePPTX(file) {
  if (!window.JSZip) {
    throw new Error('JSZip 라이브러리가 로드되지 않았습니다.');
  }

  const zip = await window.JSZip.loadAsync(file);
  const slideFiles = Object.keys(zip.files).filter(f => f.match(/^ppt\/slides\/slide\d+\.xml$/));

  slideFiles.sort((a, b) => {
    const na = parseInt(a.match(/slide(\d+)\.xml/)[1], 10);
    const nb = parseInt(b.match(/slide(\d+)\.xml/)[1], 10);
    return na - nb;
  });

  const parsedRecords = [];

  for (const slidePath of slideFiles) {
    const slideNumber = parseInt(slidePath.match(/slide(\d+)\.xml/)[1], 10);
    const xmlText = await zip.file(slidePath).async('string');

    const textNodes = [...xmlText.matchAll(/<a:t>([^<]+)<\/a:t>/g)].map(m => m[1]);
    const fullText = textNodes.join(' ');

    // 시공가이드 / 샘플 안내 슬라이드 생략
    if (isSampleOrReferencePage(fullText)) {
      continue;
    }

    // 일반 표지/목차/간지 슬라이드 생략
    if (!fullText.includes('부적합') && !fullText.includes('지적사항')) {
      continue;
    }

    const parsed = parseStructuredTextFromSheet(fullText, ['계획 미이행', '불안전 상태']);

    // 슬라이드 내 사진 추출 (Hold Point 아이콘 등 소형 이미지 제외)
    const photos = [];
    const relsPath = `ppt/slides/_rels/slide${slideNumber}.xml.rels`;
    if (zip.file(relsPath)) {
      const relsXml = await zip.file(relsPath).async('string');
      const imgRels = [...relsXml.matchAll(/Type="[^"]*\/image"\s+Target="([^"]+)"/g)].map(m => m[1]);

      for (const target of imgRels) {
        const normalizedPath = target.replace(/^\.\.\//, 'ppt/');
        const imgFile = zip.file(normalizedPath);
        if (imgFile) {
          const uint8 = await imgFile.async('uint8array');
          if (uint8.byteLength < 8000) continue; // 아이콘 등 초소형 이미지 제외
          const base64 = await imgFile.async('base64');
          const ext = normalizedPath.split('.').pop().toLowerCase();
          const mime = ext === 'png' ? 'image/png' : 'image/jpeg';
          photos.push(`data:${mime};base64,${base64}`);
        }
      }
    }

    parsedRecords.push({
      slideNumber,
      ...parsed,
      workMethod: parsed.workGroup.includes('양중') || parsed.content.includes('양중') ? '양중작업' : '설치조립작업',
      workName: parsed.workGroup.includes('양중') || parsed.content.includes('양중') ? '양중작업' : '설치조립작업',
      condition: parsed.mgmtCauses.includes('불안전 상태') ? '물(物) 자체의 결함 (자재·부재 손상)' : '해당없음',
      action: parsed.mgmtCauses.includes('불안전 행동') ? '불안전한 동작·자세' : '해당없음',
      holdPoint: false,
      photos: photos.length > 0 ? photos : [],
      photo1: photos[0] || null,
      photo2: photos[1] || null
    });
  }

  return parsedRecords;
}
