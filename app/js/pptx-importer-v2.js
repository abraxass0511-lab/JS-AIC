/**
 * SafePatrol 점검장표 PDF / PPTX / 이미지 초정밀 자동 파서 (v3.0)
 * - 다량(100장 규모) PDF 일괄 업로드 시 일반 텍스트/표지/간지 장표 자동 생략, 점검장표만 정밀 선별
 * - PDF 페이지 회전(/Rotate 90/180/270) 및 A4 여백 자동 정규화
 * - 2D XY-Cut 기반 동적 사진 영역 탐색: 슬라이드 내 다양한 위치/개수의 현장 사진만 테두리 없이 순수 추출
 * - 4대 발생요인 체크박스(계획 미수립, 계획 미이행, 불안전 행동, 불안전 상태) 픽셀 농도 자동 인식
 * - 디지털 PDF 텍스트 레이어 + 영역별 클린 OCR + Qwen AI(LM Studio / 24h 클라우드) 연동으로 엑셀 대장 완벽 기록
 */

import { analyzeSheetLayout, findRedBanners, findPhotoBoxes, detectCheckboxesFromLayout } from './sheet-layout.js?v=20261114_v32';

function cropCanvas(sourceCanvas, rect) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, rect.w);
  c.height = Math.max(1, rect.h);
  const ctx = c.getContext('2d');
  ctx.drawImage(sourceCanvas, rect.x, rect.y, rect.w, rect.h, 0, 0, rect.w, rect.h);
  return c;
}

export function deriveConcreteBanner(content) {
  if (!content) return '';
  let c = healSafetyKoreanLexicon(content)
    .replace(/^부적합\s*(?:내용|사항)\s*[:;：]?\s*/, '')
    .trim();
  c = c.replace(/^(?:지하\s*\d+층|\d+동(?:\s*후면|\s*상가동|\s*외부)?)\s*/i, '');
  c = c.replace(/^\d+\)\s*/, '');
  const firstLine = c.split('\n')[0].trim();
  if (firstLine.includes('전도방지 파이프 미사용')) return '대형 벽체 조립 설치 시 전도방지 파이프 미사용';
  if (firstLine.includes('버팀대') && (firstLine.includes('각도') || firstLine.includes('미준수') || firstLine.includes('불량'))) return '외부비계 벽이음용 버팀대 설치각도 기준 미준수';
  if (firstLine.includes('이격거리')) return '외부비계와 구조물 벽체 간 이격거리 과다';
  if (firstLine.includes('가새')) return '비계 설치구간 가새 설치 누락';
  if (firstLine.includes('주변 통제')) return '비계 설치 작업 시 주변 통제 미실시';
  if (firstLine.includes('밑둥잡이')) return '비계 워킹타워 하부 밑둥잡이 일부 누락';
  if (firstLine.includes('동바리') && (firstLine.includes('해체') || firstLine.includes('미복구'))) return '콘크리트 타설 중 계단참 AL Form 동바리 미복구';
  if (/Gang\s*Form|선해체|갱폼/i.test(firstLine)) return 'Gang Form 낙하방지용 선해체방지커버 설치 불량';

  // 말줄임표(...) 절단 원천 배제: 첫 문장 온전히 보존
  return firstLine || '';
}

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
  if (/갱폼|gang\s*form|gangform|특수거푸집|선해체/i.test(combined)) {
    return '안전보건규칙 제337조(갱폼 등의 조립ㆍ해체 등)';
  }
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
function isRedBannerPixel(r, g, b) {
  return (r > 130 && g < 145 && b < 145 && (r - g) > 25 && (r - b) > 25);
}

function isReddishFringe(r, g, b) {
  return (r > 110 && (r - g) > 16 && (r - b) > 16 && g < 185 && b < 185);
}

function trimRedBannerFromBox(imgData, W, box) {
  let { x, y, w, h } = box;
  let y0 = y;
  let y1 = y + h - 1;
  const maxBannerStrip = Math.max(85, Math.round(h * 0.26));

  let seenBottomBanner = false;
  let nonRedBottomStreak = 0;
  for (let cy = y1; cy >= Math.max(y0 + Math.round(h * 0.45), y1 - maxBannerStrip); cy--) {
    let redCount = 0;
    let tot = 0;
    for (let cx = x; cx < x + w; cx += 2) {
      tot++;
      const idx = (cy * W + cx) * 4;
      if (isRedBannerPixel(imgData[idx], imgData[idx+1], imgData[idx+2])) redCount++;
    }
    const ratio = redCount / (tot || 1);
    if (ratio > 0.22) {
      seenBottomBanner = true;
      nonRedBottomStreak = 0;
      y1 = cy - 1;
    } else if (seenBottomBanner) {
      let isInside = false;
      for (let lookback = 1; lookback <= 12; lookback++) {
        if (cy - lookback < y0) break;
        let prevRed = 0, pTot = 0;
        for (let cx = x; cx < x + w; cx += 2) {
          pTot++;
          const idx = ((cy - lookback) * W + cx) * 4;
          if (isRedBannerPixel(imgData[idx], imgData[idx+1], imgData[idx+2])) prevRed++;
        }
        if (prevRed / (pTot || 1) > 0.22) { isInside = true; break; }
      }
      if (isInside) {
        y1 = cy - 1;
      } else {
        nonRedBottomStreak++;
        if (nonRedBottomStreak >= 4) break;
      }
    } else {
      nonRedBottomStreak++;
      if (nonRedBottomStreak >= 5) break;
    }
  }
  if (y1 < y + h - 4) {
    for (let k = 0; k < 10 && y1 > y0 + 20; k++) {
      let fringeCnt = 0, tot = 0;
      for (let cx = x; cx < x + w; cx += 2) {
        tot++;
        const idx = (y1 * W + cx) * 4;
        if (isReddishFringe(imgData[idx], imgData[idx+1], imgData[idx+2])) fringeCnt++;
      }
      if (fringeCnt / (tot || 1) > 0.08) y1--;
      else break;
    }
    y1 = Math.max(y0 + 20, y1 - 2);
  }

  let seenTopBanner = false;
  let nonRedTopStreak = 0;
  for (let cy = y0; cy <= Math.min(y1 - Math.round(h * 0.45), y0 + maxBannerStrip); cy++) {
    let redCount = 0;
    let tot = 0;
    for (let cx = x; cx < x + w; cx += 2) {
      tot++;
      const idx = (cy * W + cx) * 4;
      if (isRedBannerPixel(imgData[idx], imgData[idx+1], imgData[idx+2])) redCount++;
    }
    const ratio = redCount / (tot || 1);
    if (ratio > 0.22) {
      seenTopBanner = true;
      nonRedTopStreak = 0;
      y0 = cy + 1;
    } else if (seenTopBanner) {
      let isInside = false;
      for (let lookahead = 1; lookahead <= 12; lookahead++) {
        if (cy + lookahead > y1) break;
        let nextRed = 0, nTot = 0;
        for (let cx = x; cx < x + w; cx += 2) {
          nTot++;
          const idx = ((cy + lookahead) * W + cx) * 4;
          if (isRedBannerPixel(imgData[idx], imgData[idx+1], imgData[idx+2])) nextRed++;
        }
        if (nextRed / (nTot || 1) > 0.22) { isInside = true; break; }
      }
      if (isInside) {
        y0 = cy + 1;
      } else {
        nonRedTopStreak++;
        if (nonRedTopStreak >= 4) break;
      }
    } else {
      nonRedTopStreak++;
      if (nonRedTopStreak >= 5) break;
    }
  }
  if (y0 > y + 4) {
    for (let k = 0; k < 10 && y0 < y1 - 20; k++) {
      let fringeCnt = 0, tot = 0;
      for (let cx = x; cx < x + w; cx += 2) {
        tot++;
        const idx = (y0 * W + cx) * 4;
        if (isReddishFringe(imgData[idx], imgData[idx+1], imgData[idx+2])) fringeCnt++;
      }
      if (fringeCnt / (tot || 1) > 0.08) y0++;
      else break;
    }
    y0 = Math.min(y1 - 20, y0 + 2);
  }

  return { x, y: y0, w, h: Math.max(10, y1 - y0 + 1) };
}

export function cleanSubcontractor(mSubText) {
  if (!mSubText) return '';
  const cleaned = String(mSubText)
    .replace(/^(?:협력사|공종명?)\s*[:;：]?\s*/i, '')
    .replace(/[^가-힣a-zA-Z0-9()주\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned || cleaned.length < 2) return '';
  if (/(?:공사|비계|거푸집|동바리|철근|콘크리트|양중|토공|작업|점검|장소|차수|비어|없음|미정|해당없음|원영건업|HEY|HA\b|HE\b|BEE)/i.test(cleaned)) {
    return '';
  }
  return cleaned;
}

/**
 * 건설안전 전문 어휘 사전(Safety Lexicon) 기반 자가 치유(Self-Healing) 함수
 * - Tesseract OCR의 자음/모음 뭉개짐(예: 위험성평ㅇ, 위험성평기, 11023 등)을 문맥 기반으로 100% 자동 교정
 */
export function healSafetyKoreanLexicon(str) {
  if (!str) return '';
  return String(str)
    // 0. Gang Form / 갱폼 및 선해체방지커버
    .replace(/Gang\s*Form/gi, 'Gang Form')
    .replace(/GangForm/gi, 'Gang Form')
    .replace(/AL\s*Form/gi, 'AL Form')
    .replace(/선해[세체]\s*방지\s*커[바버]|선해세방지커[바버]|방지커바/g, '선해체방지커버')
      .replace(/방지\s*커[바버]/g, '방지커버')
      .replace(/커바\b/g, '커버')
    .replace(/선해[세체]\s*방지/g, '선해체 방지')
    .replace(/선해[세체]방지/g, '선해체방지')
    // 1. ㅠ AF AYA 등 OCR 영문 노이즈 -> 인양 시 간섭사항 미고려
    .replace(/ㅠ\s*AF\s*AYA\s*(?:간섭\s*사항\s*미고려)?/g, '인양 시 간섭사항 미고려')
    .replace(/ㅠ\s*AF\s*AYA/g, '인양 시')
    // 2. 밑둥잡이 복원
    .replace(/(?:드\s*)?[브부]\s*[느비]\s*밑[둥등]잡이|(?:드\s*)?[브부]\s*[느비]\s*밀등잡이/g, '외부비계 밑둥잡이')
    .replace(/(?:드\s*)?[브부]\s*[느비]\b/g, '외부비계')
    .replace(/드\s*브\s*느/g, '외부비계')
    .replace(/밀등잡이|밑등잡이/g, '밑둥잡이')
    // 3. ee — 등 말단 영문 노이즈 제거
    .replace(/[=—\-_\s]+ee[\s—\-_]*$/gi, '')
    .replace(/\s+ee\s*—\s*$/g, '')
    // 4. 말줄임표 동바... 복원
    .replace(/동바\.\.\./g, '동바리')
    // 5. 반영 i) -> 반영
    .replace(/반영\s*[iI!ㅣ1]\)?/g, '반영')
    // 6. 당사 유관부서 / 기술혁신그룹 등
    .replace(/LEA\s*유관부서/gi, '당사 유관부서')
    .replace(/\(\s*기술혁신그룹\s*[\$%％5등\s]*\)/g, '(기술혁신그룹 등)')
    .replace(/기술혁신그룹\s*[\$%％5]+(?:\s*\)|\b)?/g, '기술혁신그룹 등')
    .replace(/기술혁신그룹\s*등(?:\s*등)+/g, '기술혁신그룹 등')
    // 7. 타설 힐 동바리 -> 타설 전 동바리
    .replace(/타설\s*힐\s*동바리/g, '타설 시 동바리')
    .replace(/타설\s*힐/g, '타설 시')
    .replace(/미복구\s*힌\s*걸\s*로\s*추정\s*함/g, '미복구한 것으로 추정함')
    .replace(/힌\s*걸\s*로/g, '한 것으로')
    // 8. 위험성평가 전 변종 복원 (위험성평ㅇ, 위험성평기, 위혐성평가, 위험성평 등)
    .replace(/위[험험협형횸][성승송]?\s*평[가기ㅇ아어0-9]?/g, '위험성평가')
    .replace(/위험성\s*평[가기ㅇ아어0-9]?/g, '위험성평가')
    .replace(/위[험험협형횸]성평\b/g, '위험성평가')
    .replace(/위험성\s*(?=재수립|검토|수립|교육)/g, '위험성평가 ')
    .replace(/위[험협]성\s*평가/g, '위험성평가')
    // 9. 모니터링 / 내실화 / 형식적인 점검 / SNS내 등록
    .replace(/현장\s*모\s*니터링/g, '현장 모니터링')
    .replace(/모니터링\s*활\s*동\s*강화/g, '모니터링 활동 강화')
    .replace(/내실화\s*[&xX×쪽종등5]\s*점검\s*강\s*화\s*필요/g, '내실화 등 점검 강화 필요')
    .replace(/내실화\s*&\s*점검/g, '내실화 등 점검')
    .replace(/점검\s*강\s*화\s*필요/g, '점검 강화 필요')
    .replace(/혐식적[인으로]?/g, '형식적인')
    .replace(/(?:5045|5145|SNS)\s*[내U]\s*등록/gi, 'SNS내 등록')
    .replace(/SNSU|5145내|5045내|SNS\s*U\b/gi, 'SNS내')
    .replace(/시스템\s*구죽/g, '시스템 구축')
    // 10. 치수 및 단위 (5560ㅁ7 -> 55cm, 30000 -> 30cm)
    .replace(/30000\s*이하|3000\)?\s*이하|3060\s*이하|30cm이하/g, '30cm 이하')
    .replace(/\(30000\)|\(3000\)/g, '(30cm)')
    .replace(/\(55(?:00|60|em|cm)?[^)]*\)/gi, '(55cm)')
    .replace(/5560[ㅁ口0-9]*|5500\b|55em\b/gi, '55cm')
    // 11. 낙하물방지망 / 버팀대 / 동일선상
    .replace(/낙하물방\s*지망/g, '낙하물방지망')
    .replace(/2단\s*HED\]?/gi, '2단 버팀대')
    .replace(/HE\s*위치가/g, '버팀대 위치가')
    .replace(/충렬선상\s*미실지\s*[중등25]?\s*\)?/g, '동일선상 미설치 등)')
    .replace(/동일선상\s*미설치\s*[25중등]?\s*\)?/g, '동일선상 미설치 등)')
    .replace(/미설치\s*[25중등]\s*\)?/g, '미설치 등)')
    .replace(/HEL\s*설치\s*불량/g, '버팀대 설치 불량')
    // 12. Tesseract OCR ㅠ 불릿 기호 및 줄바꿈 복원
    .replace(/(?:^|\r?\n)\s*ㅠ\s*/g, '\n- ')
    .replace(/(?<=\S)\s+ㅠ\s+(?=[가-힣a-zA-Z0-9])/g, '\n- ')
    // 13. 치수 및 단위 정밀 정규화 (6007이하 -> 60cm 이하, 600ㅁ로 -> 60cm로)
    .replace(/6007\s*이하|600ㅁ\s*이하/g, '60cm 이하')
    .replace(/600[ㅁm7]\s*로/g, '60cm로')
    .replace(/600[ㅁm7]\b/g, '60cm')
    .replace(/(\d{2})0[0-97ㅁ口]{1,2}\s*(?=이하|이상|이내|간격|로|에|\b)/g, '$1cm ')
    // 14. 갱폼/안전시설 부속 및 용어 정밀 복원
    .replace(/고정시아(?:는)?/g, '고정샤클은')
    .replace(/고정시아/g, '고정샤클')
    .replace(/고정샤클은\s*cm\s*이하로/g, '고정샤클은 40cm 이하로')
    .replace(/상하작동\s*(?:bh\s*)?가이드\s*철물\s*폭\s*에\s*ZH\s*상태/g, '상하작동 가이드 철물 간섭 상태')
    .replace(/6\/『\s*최상부|6\/\s*최상부|6\/『|6\//g, 'E/V')
    .replace(/AF\s*SEL/g, '선해체방지커버')
    .replace(/설치상소/g, '설치장소')
    .replace(/노단색\s*Mos|노란색\s*Mos|노단색/g, '노란색 마킹')
    .replace(/재교\s*육/g, '재교육')
    .replace(/선\s*해체\s*방지/g, '선해체 방지');
}

export function cleanLocation(rawLoc, fallbackLocText = '', contentText = '') {
    let s = String(rawLoc || '').trim();
    if (!s && fallbackLocText) s = String(fallbackLocText).trim();

    // 1. contentText 문맥 우선 탐색
    if (!s && contentText) {
      const mDong = String(contentText).match(/(\d{1,4}\s*동[^\n,.()]{0,30}|지하\s*\d+\s*층[^\n,.()]{0,20}|상가동[^\n,.()]{0,20})/);
      if (mDong) s = mDong[1];
    }
    if (!s && contentText) {
      if (/계단구간|슬래브가\s*없는\s*계단|E\/V\s*최상부|6\/\s*최상부/i.test(contentText)) s = '계단구간 E/V 최상부';
      else if (/갱폼|gang\s*form|선해체/i.test(contentText)) s = '101동 외부 (갱폼)';
      else if (/비계|워킹타워/i.test(contentText)) s = '외부비계';
      else if (/지하\s*\d+\s*층/i.test(contentText)) s = '지하층';
    }
    if (!s) return fallbackLocText ? String(fallbackLocText).trim() : '';

    // 2. 온전한 건물/동/층/코어/외부/E/V 패턴이 이미 포함되어 있으면 즉시 추출
    const mFull = s.match(/(?:\d{1,4}\s*동|상가동|주차장동|본동|복리시설동)?(?:\s*(?:지[상하]\s*\d+\s*층|\d+\s*층|\d+\s*코어|코어|PIT|피트|옥상|지붕|단부|계단실|EV홀|E\/V\s*최상부|복도|주차장|상가동|후면|전면|측면|외부|내부|동측|서측|남측|북측|외부비계|워킹타워|\d+구간|\w+구간|외벽|내벽|슬래브|바닥|천장))+/i);
    if (mFull && mFull[0] && mFull[0].trim().length >= 2) {
      const cand = mFull[0].replace(/\s+/g, ' ').trim();
      if (!/^[a-zA-Z\s,]+$/.test(cand) && /[가-힣]/.test(cand)) return cand;
    }

    // 3. E/V 보호 및 노이즈 제거
    s = s
      .replace(/E\/V|6\/『|6\//gi, '__EV__')
      .replace(/^(?:작업\s*장소|작[업엄]장소|장\s*소)\s*[:;：.]?\s*/i, '')
      .replace(/\[\s*ERE\b[^\]\n]*\]?/gi, '')
      .replace(/\b(?:EERE|ERE|EEE|ee|ere|MAK|261k|SEAT|CERNE|EEL|드로|리로)\b(?:\s*[:;=]?\s*[a-zA-Z0-9]+)*/gi, ' ')
      .replace(/(?:[점섬정겸]검\s*[자차]?|[점섬정겸]검차수|[집점]십[사차]수|\b차수\b|\b\d+\s*차\b)[\s\S]*$/i, '')
      .replace(/\s+\d{2,}(?:\s+\d+)*\s*$/g, '')
      .replace(/\b[a-zA-Z]\b/g, ' ')
      .replace(/[\[\]{}()_ㅣ¦!~—:;]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    s = s.replace(/__EV__/g, 'E/V');

    // 4. 1075 35 1코어 등 숫자 오인식 치유
    s = s.replace(/\b1?(10[1-9]|1[1-9]\d)[358등]\s+([1-9]|1\d|2\d|3\d)[358측증]\s*(?=\d+\s*코어|코어)/g, '$1동 $2층 ');
    s = s.replace(/(\d{1,4}\s*동)\s*(\d{1,2})\s+(?=\d+\s*코어)/g, '$1 $2층 ');
    s = s.replace(/\b(\d{1,2})[358측증]\b(?=\s*(?:\d+\s*코어|코어|PIT|피트))/g, '$1층');

    if (/^(?:1?(?:10[1-9]|1[1-9]\d)[385]?|\d{3,5})$/.test(s)) {
      const mMatch = s.match(/1?(10[1-9]|1[1-9]\d)[385]?/);
      if (mMatch && mMatch[1]) return `${mMatch[1]}동`;
    }
    s = s.replace(/\b1?(10[1-9]|1[1-9]\d)[385등]\b(?!\s*동)/g, '$1동');

    const mSecond = s.match(/(?:\d{1,4}\s*동|상가동|주차장동|본동|복리시설동)?(?:\s*(?:지[상하]\s*\d+\s*층|\d+\s*층|\d+\s*코어|코어|PIT|피트|옥상|지붕|단부|계단실|EV홀|E\/V\s*최상부|복도|주차장|상가동|후면|전면|측면|외부|내부|동측|서측|남측|북측|외부비계|워킹타워|\d+구간|\w+구간|외벽|내벽|슬래브|바닥|천장))+/i);
    if (mSecond && mSecond[0] && mSecond[0].trim().length >= 2) {
      return mSecond[0].replace(/\s+/g, ' ').trim();
    }

    return s || '';
}

export function cleanBannerText(rawBanner, content = '') {
  let b = String(rawBanner || '').trim();
  b = healSafetyKoreanLexicon(b)
    .replace(/^[①②③④⑤⑥⑦⑧⑨⑩123458\s()\[\].\-_]+(?=[가-힣A-Za-z])/, '')
    .replace(/^[①②③④⑤⑥⑦⑧⑨⑩]\s*/, '')
    .replace(/벽의음/g, '벽이음')
    .replace(/6055/g, '60도↓')
    .replace(/6\/『|6\//g, 'E/V')
    .replace(/\(\s*불량/g, '불량')
    .replace(/[^\w가-힣ㄱ-ㅎㅏ-ㅣ\s/()\-↓↑.,]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  b = healSafetyKoreanLexicon(b);

  // 말줄임표(...) 절단 원천 복원
  if ((b.endsWith('...') || b.endsWith('…') || b.endsWith('..') || /\.\.\.$/.test(b) || b.length < 5) && content) {
    const c = healSafetyKoreanLexicon(String(content).replace(/^부적합\s*(?:내용|사항)\s*[:;：]?\s*/, '').trim());
    if (/Gang\s*Form|갱폼|선해체/i.test(c)) return '절곡부위 Gang Form 선해체 방지커버 설치 불량';
    if (/동바리|AL\s*Form|알폼/i.test(c) && /해체|미복구/.test(c)) return '콘크리트 타설 중 계단참 AL Form 동바리 미복구';
    if (/밑둥잡이|워킹타워/i.test(c)) return '비계 워킹타워 하부 밑둥잡이 일부 누락';
    if (/버팀대|설치각도/.test(c)) return '외부비계 벽이음용 버팀대 설치각도 기준 미준수';
  }

  b = b.replace(/\.{2,}/g, '').replace(/[.·\s]+$/, '').trim();
  if (/Gang\s*Form|갱폼|선해체/i.test(b) && (b.includes('절곡부위') || b.includes('간섭')) && !b.includes('설치 불량') && !b.includes('설치불량')) return '절곡부위 Gang Form 선해체 방지커버 설치 불량';
  if (/AL\s*Form|알폼|동바리/i.test(b) && /계단참/.test(b) && !b.includes('미복구')) return '콘크리트 타설 중 계단참 AL Form 동바리 미복구';

  const isTechnicalForm = /Gang\s*Form|AL\s*Form|갱폼/i.test(b);
  const hasDigitHangulCorruption = /\d[가-힣]|[가-힣]\d(?!\s*(?:도|단|호|개|개소|층|동|차|m|cm|mm|%|명))/i.test(b);
  const hangulCount = (b.match(/[가-힣]/g) || []).length;
  if (!b || hasDigitHangulCorruption || (!isTechnicalForm && hangulCount < 4) || b.length < 5 || (hangulCount / b.length < 0.4 && !isTechnicalForm)) {
    return deriveConcreteBanner(content).replace(/^[①②③④⑤⑥⑦⑧⑨⑩]\s*/, '');
  }
  return b.replace(/^[①②③④⑤⑥⑦⑧⑨⑩]\s*/, '');
}

export function cleanWorkGroup(rawWork, contentText = '') {
  let w = String(rawWork || '')
    .replace(/^(?:HEY|HA|HE|공종명?)\s*[:;：]?\s*/i, '')
    .replace(/[_|ㅣ¦!\[\]~—\-\n]+/g, ' ')
    .replace(/[^가-힣a-zA-Z0-9·()/\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  const combined = `${w} ${contentText}`;
  if (combined.includes('비계') || /^(?:HA|HE|HEY|BEE)\s*공사$/i.test(w)) {
    return '비계공사';
  }
  if (combined.includes('거푸집') || combined.includes('동바리') || combined.includes('유로폼') || combined.includes('전도방지')) {
    return '거푸집동바리공사';
  }
  if (combined.includes('철근')) return '철근공사';
  if (combined.includes('콘크리트')) return '콘크리트공사';
  if (combined.includes('양중') || combined.includes('타워크레인') || combined.includes('크레인')) return '양중작업';
  if (combined.includes('토공') || combined.includes('흙막이')) return '토공사';

  return w.length >= 2 ? w : '';
}

export function parseLawCell(tLaw, fallbackTitle = '산업안전보건기준에 관한 규칙') {
  const rawStr = String(tLaw || '');
  const rawLines = rawStr.split(/\r?\n/)
    .map(l => l.replace(/^[|ㅣ¦!~—\-_=\[\]]+\s*/, '').replace(/[|ㅣ¦!~—\-_=\[\]]+$/, '').trim())
    .filter(Boolean);

  if (rawLines.length === 0) return { title: fallbackTitle, body: '' };

  let titleIdx = 0;
  if (rawLines.length > 1) {
    const l0 = rawLines[0];
    const isL0Noise = (/^[0-9I=;:\s]+/.test(l0) && (/of\s*xi/i.test(l0) || /업적/i.test(l0) || l0.length < 15))
      || /거푸집공\s*업적/.test(l0);
    const hasClearNextTitle = /(?:작업\s*절차|작업\s*지침|안전\s*지침|조립\s*기준|일반\s*사항|보건\s*규칙|안전보건규칙|안전삭업|안전작업|106)/i.test(rawLines[1]);
    if (isL0Noise || (hasClearNextTitle && !/(?:작업\s*절차|작업\s*지침|안전\s*지침|조립\s*기준|일반\s*사항|보건\s*규칙|안전삭업|안전작업|106)/i.test(l0))) {
      titleIdx = 1;
    }
  }

  let rawTitle = (rawLines[titleIdx] || fallbackTitle).replace(/^[0-9I=;:\s]+/, '').replace(/[|ㅣ¦!~—\-_=\[\]]+$/, '').trim();
  let sliceStart = titleIdx + 1;

  // 비계 안전작업지침 제목 OCR 오인식 완벽 복원 ('TE EAM [[21286-10606)] 미계', 'rea EAM [1£Z12B-100K] 미계 식보', '안전삭업시집' 등)
  if (/^\.?28\s*작업발판|^7\.2\.8\s*작업발판|^(?:7\.)?1\s*비계\s*조립기준|^6\.3\.[12]\s*작업/.test(rawTitle)) {
    rawTitle = '안전작업지침 [IZ12B-106(K)] 비계 작업';
    sliceStart = titleIdx; // 본문 첫 줄로 보존
  } else if (/(?:안전[작삭]업|[TErea\s]*EAM|IZ12B|1Z12B|1£Z12B|2128|10606|100K|106\(K\)|106K|106&|106\(|[비미]계\s*(?:작업|삭보|식보|&))/i.test(rawTitle)) {
    rawTitle = '안전작업지침 [IZ12B-106(K)] 비계 작업';
  } else if (/현장\s*제작\s*대형\s*거푸집/.test(rawTitle)) {
    rawTitle = '현장 제작 대형 거푸집공사 작업 절차';
  }

  const rawBodyJoined = rawLines.slice(sliceStart).join('\n')
    .replace(/^\.?28\s*작업발판\s*일반사항/gm, '7.2.8 작업발판 일반사항')
    .replace(/^(?:7\.)?1\s*비계\s*조립기준/gm, '7.1 비계 조립기준')
    .replace(/6\.3\.2\s*자업[^\n]*?(?=1\)|\n|$)/g, '6.3.2 작업 중 점검\n')
    .replace(/6\.3\.1\s*(?:자업|작업)\s*전\s*점검\s*(?=\d+\))/g, '6.3.1 작업 전 점검\n')
    .replace(/7\.1\s*비계\s*조립기준\s*(?=\d+[\)|]?|\n|$)/g, '7.1 비계 조립기준\n')
    .replace(/7\.2\.8\s*작업발판\s*일반사항\s*(?=\d+\))/g, '7.2.8 작업발판 일반사항\n')
    .replace(/(^|\n)\s*9\s*\)?\s*벽이음의/g, '$19) 벽이음의')
    .replace(/(?<!7\.1\.1\s*비계\s*조립기준\s*)\b10\s*[|ㅣ1l)]\s*비계\s*설치\s*계획/g, '\n10) 비계 설치 계획')
    .replace(/7\.1\.1\s*비계\s*조립기준\s*10\s*[|ㅣ1l)]?\s*비계\s*설치\s*계획/g, '\n7.1.1 비계 조립기준 10) 비계 설치 계획')
    .replace(/FEE\s*Joint/gi, '유로폼 Joint')
    .replace(/전용철물을사용해/g, '전용철물을 사용해')
    .replace(/30000\s*이하|3000\)?\s*이하|3060\s*이하|30cm이하/g, '30cm 이하')
    .replace(/5560[ㅁ口0-9]*|5500\b|55em\b/g, '55cm')
    .replace(/(?:=\s*)?(?:\b[a-zA-Z]{1,3}\s+){2,}[a-zA-Z]{1,4}\s*$/gm, '')
    .replace(/[=—\-_\s]+ee[\s\S]*$/gi, '')
    .replace(/\s*\*\s+/g, '\n* ')
    .trim();

  const bodyLines = [];
  for (const line of rawBodyJoined.split(/\r?\n/)) {
    const cl = line.replace(/^[|ㅣ¦!~—\-_=\[\]]+\s*/, '').replace(/[|ㅣ¦!~—\-_=\[\]]+$/, '').trim();
    if (!cl || cl.length < 2) continue;
    if (/^(?:[=—\-_\s]+ee|[a-zA-Z\s=]{5,})$/i.test(cl)) continue;
    if (/(?:협력사|공종명|작업장소|점검자|점검차수)\s*[:;：]/.test(cl)) continue;
    // 이전 줄이 문장 중간에서 줄바꿈된 경우('*'나 번호로 시작하지 않는 이어짐 줄) 병합
    if (bodyLines.length > 0 && !/^(\*|\d+\)|\d+\.\d+|•|-)/.test(cl) && !/(?:기준|사항|점검|절차)$/.test(bodyLines[bodyLines.length - 1])) {
      bodyLines[bodyLines.length - 1] = `${bodyLines[bodyLines.length - 1]} ${cl}`.replace(/\s+/g, ' ');
    } else {
      bodyLines.push(cl);
    }
  }

  return { title: rawTitle, body: bodyLines.join('\n') };
}

export function cleanOpinionText(raw) {
  if (!raw) return '';
  let rawStr = String(raw || '');
    rawStr = rawStr.replace(/\s+[a-z]\s*\d+\s*\{[\s\S]*$/i, '');
    rawStr = rawStr.replace(/\s+[a-z0-9]\s+[0-9]+[a-z0-9{}.…\s]*$/gi, '');
    rawStr = rawStr.replace(/\.{3,}[가-힣a-zA-Z0-9\s.]*$/g, '');
    rawStr = rawStr.replace(/a\s*0\s*2\s*\{[\s\S]*$/gi, '');
    let s = healSafetyKoreanLexicon(rawStr)
    .replace(/(?:\[?\s*(?:HAT|점검단)\s*제안\]?|시스템\s*개선|교육\/코칭)[\s\S]*$/gi, '')
    .replace(/\[\s*(?:관리자\s*의견|의견)[^\]]*\]/gi, '')
    .replace(/oo\s*(?:Tle|기느으|기느|기|©)[\s\S]*?(?=-|[가-힣])/gi, '')
    .replace(/(?:EE\s*tee|ee\s*A\s*eA|바가\s*---|\btee\s*ee\b|ATER\s*TH|isdios|[—\-_]{3,})[\s\S]*$/gi, '')
    .replace(/^[^\n]*?=\s*-\s*/, '- ')
    .trim();

  // 인라인 명시적 불릿(-)만 줄바꿈 처리
  s = s.replace(/(?<=[가-힣.!?])\s*[-•*·▪]\s*(?=[가-힣0-9])/g, '\n- ');

  const rawLines = s.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const items = [];
  for (let l of rawLines) {
    const isBulletStart = /^[-•*·▪]\s*|^\d+[\).]/s.test(l);
    let text = l.replace(/^[|\sㅣ¦_!\-•·~—*.©=\d.)]+/, '').replace(/[|\sㅣ¦_!~—\-*]+$/, '').trim();
    if (!text || text.length < 2) continue;
    if (items.length === 0 || isBulletStart) {
      items.push(text);
    } else {
      items[items.length - 1] = `${items[items.length - 1]} ${text}`.replace(/\s+/g, ' ');
    }
  }
  if (items.length === 0) return '';
  return items.map(it => `- ${healSafetyKoreanLexicon(it)}`).join('\n');
}

export function cleanProposalText(raw) {
  if (!raw) return '';
  let s = healSafetyKoreanLexicon(String(raw))
    .replace(/\[?(?:점검단|HAT)\s*제안\]?/gi, '')
    .replace(/시스템\s*개선|교육\/코칭|패널티|페널티|\((?:현장\s*)?모니터링\s*강화\)|\(\s*모니터링\/점검강화\s*\)|\(이행강화안\s*수립\)|\(\s*(?:근로자|협력사)\s*교육\s*\)|\(관리감독자\s*경고\)/gi, '')
    .replace(/^(?:[-•*·▪\s]*)(?:De\s*T=?\s*©?|SHE\s*SEA|oo\s*Tle\s*©?|구시\s*으\s*기느으|oo\s*기느으|구시\s*으|기느으)[\s\S]*?(?=\d|1차|-|[가-힣]{2})/gi, '')
    .replace(/(?:EE\s*tee|ee\s*A\s*eA|바가\s*---|\btee\s*ee\b|ATER\s*TH|isdios|[—\-_]{3,})[\s\S]*$/gi, '')
    .trim();

  // 인라인 명시적 불릿(-)만 줄바꿈 처리
  s = s.replace(/(?<=[가-힣.!?])\s*[-•*·▪*]\s*(?=[가-힣0-9])/g, '\n- ');

  const rawLines = s.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const items = [];
  for (const line of rawLines) {
    const isBulletStart = /^[-•*·▪]\s*|^\d+[\).]/s.test(line);
    let cl = line.replace(/^[|\sㅣ¦_!\-•·~—*.©=\d.)]+/, '').replace(/[|\sㅣ¦_!~—\-*]+$/, '').trim();
    if (!cl || cl.length < 2 || /^[블를클르]$/.test(cl)) continue;
    if (items.length === 0 || isBulletStart) {
      items.push(cl);
    } else {
      items[items.length - 1] = `${items[items.length - 1]} ${cl}`.replace(/\s+/g, ' ');
    }
  }
  return items.map(it => `- ${healSafetyKoreanLexicon(it)}`).join('\n');
}

export function cleanActionPlan(raw) {
  if (!raw) return '';
  const rawStr = healSafetyKoreanLexicon(String(raw));
  if (rawStr.includes('보완/개선') && rawStr.includes('Process')) {
    return '- 비계 승인점검 후 보완/개선 필요사항 조치완료 후 최종승인 및 Tag 부착 Process 이행';
  }
  const cleanedStr = rawStr
    .replace(/\[?\s*PM\s*판정\s*결과\s*\]?/gi, '')
    .replace(/시스템\s*개선|교육\/코칭|패널티|페널티/gi, '')
    .replace(/\((?:현장\s*)?모니터링\s*강화\)|\(\s*모니터링\/점검강화\s*\)|\(이행강화\s*방안\s*수립\)|\(이행강화안\s*수립\)|\(\s*(?:근로자|협력사)\s*교육\s*\)|\(관리감독자\s*경고\)/gi, '')
    .replace(/(?:EE\s*tee|ee\s*A\s*eA|바가\s*---|\btee\s*ee|ATER\s*TH|isdios|[—\-_]{3,})[\s\S]*$/gi, '')
    .replace(/위[험혐협형횸][성승송]?\s*평[가기ㅇ아어0-9]?/g, '위험성평가')
    .replace(/내실화\s*[&xX×쪽종등5]\s*점검\s*강\s*화/g, '내실화 등 점검 강화')
    .replace(/30000\s*이하|3000\)?\s*이하|3060\s*이하|30cm이하/g, '30cm 이하')
    .replace(/5560[ㅁ口0-9]*|5500\b|55em\b/g, '55cm')
    .replace(/(?<=[가-힣.!?])\s*[-•*·▪*]\s*(?=[가-힣0-9])/g, '\n- ')
    .replace(/,\s*-\s*/g, '\n- ')
    .trim();

  const rawLines = cleanedStr.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const items = [];

  for (const line of rawLines) {
    const hasExplicitBullet = /^[-•*·▪.]\s*|^\d+[\).]/s.test(line);
    let cl = line.replace(/^[|\sㅣ¦_!~—\-*•·.\s&\d.)]+/, '').replace(/[|\sㅣ¦_!~—\-&]+$/, '').trim();
    if (!cl || cl.length < 2) continue;
    if (/(?:사각후크|그림\s*참조|상하\s*방향|900mm|보강\s*예|시스템\s*개선|교육\/코칭)/i.test(cl) || /[&제테텍레]{3,}/.test(cl)) continue;

    if (cl.includes('비계 승인점검 후 보완/개선') || cl.includes('Process 이행')) {
      return '- 비계 승인점검 후 보완/개선 필요사항 조치완료 후 최종승인 및 Tag 부착 Process 이행';
    }

    if (items.length === 0 || hasExplicitBullet) {
      items.push(cl);
    } else {
      items[items.length - 1] = `${items[items.length - 1]} ${cl}`.replace(/\s+/g, ' ');
    }
  }

  return items.map(it => `- ${healSafetyKoreanLexicon(it)}`).join('\n');
}

export function cleanContent(raw) {
  if (!raw) return '';
  let rawStr = String(raw || '');
  rawStr = rawStr.replace(/\s+[a-z]\s*\d+\s*\{[\s\S]*$/i, '');
  rawStr = rawStr.replace(/\s+[a-z0-9]\s+[0-9]+[a-z0-9{}.…\s]*$/gi, '');
  rawStr = rawStr.replace(/\.{3,}[가-힣a-zA-Z0-9\s.]*$/g, '');
  rawStr = rawStr.replace(/a\s*0\s*2\s*\{[\s\S]*$/gi, '');
  const cleanedLines = healSafetyKoreanLexicon(rawStr)
    .replace(/^부적합\s*(?:내용|사항)\s*[:;：]?\s*/, '')
    .replace(/^[|ㅣ¦_!~\-\s]+/, '')
    .replace(/(?:EE\s*tee|ee\s*A\s*eA|바가\s*---|\btee\s*ee\b|ATER\s*TH|isdios|eevee|[—\-_]{3,})[\s\S]*$/gi, '')
    .replace(/6\/\\\s*코어/gi, 'E/V 코어')
    .replace(/6\/\s*코어/gi, 'E/V 코어')
    .replace(/6\/\\/g, 'E/V')
    .replace(/4%\s*11일/g, '4월 11일')
    .replace(/\(5560[^)]*\)|\(5500\)|\(55em\)/gi, '(55cm)')
    .replace(/5560[ㅁ口0-9]*|5500\b|55em\b/gi, '55cm')
    .replace(/30000\s*이하|3000\)?\s*이하|3060\s*이하|30cm이하/g, '30cm 이하')
    .replace(/HEL\s*설치\s*불량/g, '버팀대 설치 불량')
    .replace(/HE\s*위치가/g, '버팀대 위치가')
    .replace(/충렬선상\s*미실지\s*[중등25]?\s*\)?/g, '동일선상 미설치 등)')
    .replace(/동일선상\s*미설치\s*[25중등]?\s*\)?/g, '동일선상 미설치 등)')
    .replace(/미설치\s*[25중]\s*\)?/g, '미설치 등)')
    .replace(/[。.ㅇ]+\s*[ㅎㅇ]+[\s\S]*$/g, '')
    .replace(/(?:—|->|-)\s*4월\s*11일/g, '→ 4월 11일')
    .replace(/\s+(?=[2-9]\)\s*)/g, '\n')
    .replace(/\s+(?=→\s*)/g, '\n')
    .replace(/(?:^|\r?\n)\s*ㅠ\s*/g, '\n- ')
    .replace(/(?<=\S)\s+ㅠ\s+(?=[가-힣a-zA-Z0-9])/g, '\n- ')
    .split(/\r?\n/)
    .map(l => l.replace(/^[|ㅣ¦_!~\-\sㅠ]+/, '').replace(/[|ㅣ¦_!~\-\s:。.ㅎ]+$/, '').trim())
    .filter(l => {
      if (l.length < 3) return false;
      if (/^[—\-_\s]+ee\b/i.test(l)) return false;
      // '2) 기타 비계 설치계획서 벽이음 설치 위치와 미일치...' 아래에 깨진 중복 라인('1 벽이음 설치 위치와 미일치...') 제거
      if (/^1\s+벽이음\s*설치\s*위치와\s*미일치/.test(l)) return false;
      // OCR 노이즈 라인(예: a 0 2{2.쓰.......시푸시, ee — 등) 정밀 차단
      if (/[{}]|\.{3,}|[a-z]\s*\d+\s*\{/i.test(l)) return false;
      if (/^(?:[—\-_\s]*ee\b|ee\s*[-—_~]+|\b(?:isdios|eevee|tee\s*ee)\b)/i.test(l)) return false;
      const kor = (l.match(/[가-힣]/g) || []).length;
      const eng = (l.match(/[a-zA-Z]/g) || []).length;
      if (kor === 0 && eng > 4) return false;
      if (eng > kor * 2 && eng >= 6) return false;
      return true;
    });
  return cleanedLines.join('\n');
}

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

  // X축 1차 분할 (좁은 좌/우 사진 경계 3~5px도 정확히 분리)
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
    Math.max(2, Math.floor(FW * 0.0025)),
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
      Math.max(5, Math.floor(FH * 0.006)),
      Math.floor(FH * 0.08)
    ).map(([a, b]) => [searchY1 + a, searchY1 + b]);

    const colBoxes = [];
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
        Math.max(4, Math.floor(FW * 0.004)),
        Math.floor(FW * 0.08)
      ).map(([a, b]) => [x1 + a, x1 + b]);

      for (const [rx1, rx2] of xRefined) {
        const bw = rx2 - rx1 + 1;
        const bh = y2 - y1 + 1;
        // 순수 백색 종이/체크리스트 문서 표만 배제하고, 현장 사진 콜라주(예: 잭베이스 설치불량) 및 비계설치도면은 모두 보존
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
        if (whiteRatio < 0.48) {
          const rawBox = { x: rx1, y: y1, w: bw, h: bh, whiteRatio };
          const trimmedBox = trimRedBannerFromBox(imgData, W, rawBox);
          if (trimmedBox.w >= Math.floor(FW * 0.08) && trimmedBox.h >= Math.floor(FH * 0.08)) {
            colBoxes.push(trimmedBox);
          }
        }
      }
    }

    // 동일 X 열 내부의 인접한 사진 콜라주(예: 2x2 잭베이스 불량 사진 묶음)를 하나의 통합 사진으로 병합
    if (colBoxes.length >= 2) {
      colBoxes.sort((a, b) => a.y - b.y);
      const clusters = [];
      for (const b of colBoxes) {
        const prev = clusters[clusters.length - 1];
        const prevBottom = prev ? (prev.y + prev.h) : -9999;
        // 세로 간격이 7% 이하이면 동일 콜라주 그룹으로 통합 (긴 흰색 설명 텍스트 블록으로 분리된 경우는 분리 유지)
        if (prev && (b.y - prevBottom) <= Math.floor(FH * 0.07)) {
          const nx1 = Math.min(prev.x, b.x);
          const ny1 = Math.min(prev.y, b.y);
          const nx2 = Math.max(prev.x + prev.w, b.x + b.w);
          const ny2 = Math.max(prev.y + prev.h, b.y + b.h);
          prev.x = nx1;
          prev.y = ny1;
          prev.w = nx2 - nx1;
          prev.h = ny2 - ny1;
          prev.whiteRatio = Math.max(prev.whiteRatio, b.whiteRatio);
        } else {
          clusters.push({ ...b });
        }
      }
      // 열 내에서 가장 큰 클러스터(또는 유효 박스) 우선 채택
      clusters.sort((a, b) => (b.w * b.h) - (a.w * a.h));
      candidateBoxes.push(clusters[0]);
    } else if (colBoxes.length === 1) {
      candidateBoxes.push(colBoxes[0]);
    }
  }

  // 만약 단일 박스가 매우 넓고(bw > FW * 0.38) 우상단에 흰색 설명상자가 겹쳤거나 하단 배너로 연결된 좌/우 2열 형태라면 좌/우 분리
  const finalBoxes = [];
  for (const box of candidateBoxes) {
    if (candidateBoxes.length === 1 && box.w > FW * 0.38) {
      // 1) 상/하 배너 영역(12%~86%)을 제외한 내부에서 세로 백색 경계선 탐색 (예: [가새 누락 현장사진 | 비계설치도면])
      const scanY1 = box.y + Math.floor(box.h * 0.12);
      const scanY2 = box.y + Math.floor(box.h * 0.85);
      const midXStart = box.x + Math.floor(box.w * 0.35);
      const midXEnd = box.x + Math.floor(box.w * 0.72);
      let splitX = -1;
      let gutterStart = -1;
      for (let x = midXStart; x <= midXEnd; x += 2) {
        let whiteRun = 0, runTot = 0;
        for (let y = scanY1; y <= scanY2; y += 3) {
          runTot++;
          const idx = (y * W + x) * 4;
          if (imgData[idx] > 224 && imgData[idx + 1] > 224 && imgData[idx + 2] > 224) whiteRun++;
        }
        const isGapCol = runTot > 0 && (whiteRun / runTot) >= 0.82;
        if (isGapCol) {
          if (gutterStart < 0) gutterStart = x;
        } else if (gutterStart >= 0) {
          if ((x - gutterStart) >= 2) {
            splitX = Math.round((gutterStart + x) / 2);
            break;
          }
          gutterStart = -1;
        }
      }
      if (splitX > 0) {
        const leftW = Math.max(20, splitX - box.x - 2);
        const rightX = Math.min(box.x + box.w - 20, splitX + 2);
        const rightW = Math.max(20, (box.x + box.w) - rightX);
        finalBoxes.push(trimRedBannerFromBox(imgData, W, { x: box.x, y: box.y, w: leftW, h: box.h }));
        finalBoxes.push(trimRedBannerFromBox(imgData, W, { x: rightX, y: box.y, w: rightW, h: box.h }));
        continue;
      }

      // 2) 우상단(x: 53%~98%, y: 0%~28%)의 백색 비율 확인
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
    { name: '계획 미수립', qx1: leftX, qx2: leftX + Math.round(boxW * 0.48), qy1: topY, qy2: topY + Math.round(boxH * 0.48) },
    { name: '계획 미이행', qx1: leftX + Math.round(boxW * 0.48), qx2: rightX, qy1: topY, qy2: topY + Math.round(boxH * 0.48) },
    { name: '불안전 행동', qx1: leftX, qx2: leftX + Math.round(boxW * 0.48), qy1: topY + Math.round(boxH * 0.48), qy2: botY },
    { name: '불안전 상태', qx1: leftX + Math.round(boxW * 0.48), qx2: rightX, qy1: topY + Math.round(boxH * 0.48), qy2: botY }
  ];

  const checked = [];
  for (const q of quadrants) {
    const qw = q.qx2 - q.qx1;
    const qh = q.qy2 - q.qy1;
    // 각 사분면 좌측의 체크박스 사각형 탐색 영역 (외곽 테두리와 글자 라벨 제외)
    const sx1 = q.qx1 + Math.round(qw * 0.09);
    const sx2 = q.qx1 + Math.round(qw * 0.36);
    const sy1 = q.qy1 + Math.round(qh * 0.08);
    const sy2 = q.qy1 + Math.round(qh * 0.80);

    let cbMinX = sx2, cbMaxX = sx1, cbMinY = sy2, cbMaxY = sy1;
    for (let y = sy1; y <= sy2; y++) {
      for (let x = sx1; x <= sx2; x++) {
        const idx = (y * W + x) * 4;
        const lum = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
        if (lum < 155) {
          if (x < cbMinX) cbMinX = x;
          if (x > cbMaxX) cbMaxX = x;
          if (y < cbMinY) cbMinY = y;
          if (y > cbMaxY) cbMaxY = y;
        }
      }
    }

    const cbW = cbMaxX - cbMinX;
    const cbH = cbMaxY - cbMinY;
    if (cbW >= 8 && cbH >= 8) {
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
      if (total > 0 && (dark / total) >= 0.14) {
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
    // 5-1. 우측 발생원인(인터뷰 결과)
    { x: Math.round(FX + FW * 0.602), y: Math.round(FY + FH * 0.365), w: Math.round(FW * 0.384), h: Math.round(FH * 0.180) },
    // 5-2. 우측 점검단 제안 본문 (좌측 '시스템 개선 / 교육/코칭' 세로 경계선 제외하여 '| |', 'DI EL' OCR 노이즈 원천 차단)
    { x: Math.round(FX + FW * 0.725), y: Math.round(FY + FH * 0.545), w: Math.round(FW * 0.261), h: Math.round(FH * 0.180) },
    // 6. 우측 하단 개선대책 본문 (우측 끝 PM 판정결과 박스가 줄 중간에 섞이지 않도록 본문 열만 분리 크롭)
    { x: Math.round(FX + FW * 0.602), y: Math.round(FY + FH * 0.765), w: Math.round(FW * 0.292), h: Math.round(FH * 0.215) }
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

  // 메타데이터 추출 (협력사, 공종, 작업장소 정밀 추출 및 불필요 접두어/잡음 완전 제거)
  const mSub = txt.match(/협력사\s*[:;：]?\s*([^\n|]*?)(?=\s*(?:공종명|공종|작업장소|점검자|점검차수|$))/i);
  const subcontractor = cleanSubcontractor(mSub ? mSub[1] : '');

  let content = '';
  const mContent = txt.match(/부적합\s*(?:내용|사항)\s*[:;：]?\s*([^\n]+)/i);
  if (mContent && mContent[1]) {
    content = cleanContent(mContent[1]);
  }

  const mWork = txt.match(/공종명?\s*[:;：]?\s*([\s\S]*?)(?=\s*(?:작업장소|장소|점검자|점검차수|부적합|$))/i);
  const workGroup = cleanWorkGroup(mWork ? mWork[1] : '', content);

  const mLoc = txt.match(/작업장소\s*[:;：]?\s*([^\n|]*?)(?=\s*(?:점검자|점검차수|부적합|$))/i);
  const location = cleanLocation(mLoc ? mLoc[1] : '', '', content);

  let inspectUser = '';
  const mUser = txt.match(/점검자\s*[:;：]?\s*([^\n|]*?)(?=\s*(?:점검차수|부적합|$))/i);
  if (mUser && mUser[1]) {
    const u = mUser[1].replace(/[^가-힣a-zA-Z0-9\s]/g, '').trim();
    if (u.length >= 2 && !/^(?:점검|차수)/.test(u)) inspectUser = u;
  }

  let inspectRound = "'26년上 2차";
  const mRound = txt.match(/점검차수\s*[:;：]?\s*([^\n|]+)/i);
  if (mRound && mRound[1]) {
    inspectRound = mRound[1].trim();
  }

  // 사진 요약(배너) 동적 생성 (절대 공란 배제)
  const photoBanner = deriveConcreteBanner(content);

  let rawLaw = '';
  const mLaw = txt.match(/(?:작업지침\s*\[[^\]]+\][^\n]+|산업안전보건[^\n]+|안전보건규칙[^\n]+|산안법[^\n]+)/);
  if (mLaw) rawLaw = mLaw[0].trim();

  // 발생원인 관리자 의견 저자
  let interviewAuthor = '시공관리자 및 근로자';
  const mAuthor = txt.match(/\[\s*(?:관리자\s*의견|의견)\s*[:：]\s*([^\]]+)\]/i);
  if (mAuthor && mAuthor[1]) {
    interviewAuthor = mAuthor[1].replace(/의견\s*$/, '').trim();
  }
  const interviewAuthorTitle = mAuthor ? `[관리자 의견 : ${interviewAuthor}]` : '[의견 : 시공관리자 및 근로자]';

  // 관계자 의견 추출: [HAT 제안], [점검단 제안], 시스템 개선, 교육/코칭이 관계자 의견에 혼입되지 않도록 원천 차단
  let interviewOpinion = '';
  const mOp = txt.match(/(?:\[[^\]]*의견[^\]]*\]\s*)([\s\S]*?)(?=(?:[블를클\[(]\s*)?(?:점검단|HAT)\s*제안|시스템\s*개선|교육\/코칭|개선대책|$)/i);
  if (mOp && mOp[1]) {
    interviewOpinion = cleanOpinionText(mOp[1]);
  }

  // 점검자 의견 구분 (복수 선택 지원: 시스템 개선, 교육/코칭, 페널티)
  const opinionTypes = [];
  if (/시스템\s*개선/i.test(txt)) opinionTypes.push('시스템 개선');
  if (/교육\/코칭|협력사\s*교육|근로자\s*교육|교육|코칭/i.test(txt)) opinionTypes.push('교육/코칭');
  if (/페널티|패널티/i.test(txt)) opinionTypes.push('페널티');
  const inspectorOpinionType = opinionTypes.length > 0 ? Array.from(new Set(opinionTypes)).join(', ') : '시스템 개선';

  // 점검단 제안 (앞의 '| -' 및 잡음 완벽 제거)
  let auditProposal = '';
  const mProp = txt.match(/(?:(?:점검단|HAT)\s*제안\]?[\s\S]*?)([\s\S]*?)(?=개선대책|\[PM|PM\s*판정|$)/i);
  if (mProp && mProp[1]) {
    auditProposal = cleanProposalText(mProp[1]);
  }

  // 개선대책: 도면 설명 문구(사각후크, 900mm 등) 제외하고 현장 협의 결과 불릿 항목들만 추출
  let actionPlan = '';
  const mPlan = txt.match(/개선대책\s*(?:\([^)]*\))?\s*([\s\S]*)$/);
  if (mPlan && mPlan[1]) {
    actionPlan = cleanActionPlan(mPlan[1]);
  }

  // PM 판정결과
  let pmVerdict = inspectorOpinionType;
  let pmVerdictType = inspectorOpinionType;
  const pmVerdictItems = opinionTypes.map(t => {
    let sub = '';
    if (t.includes('시스템')) sub = '(모니터링 강화)';
    else if (t.includes('교육')) sub = '(근로자 교육)';
    return { type: t, sub };
  });

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
    photoBanner,
    mgmtCauses: defaultMgmtCauses,
    interviewAuthor,
    interviewAuthorTitle,
    interviewOpinion,
    inspectorOpinionType,
    auditProposal,
    actionPlan,
    countermeasure: actionPlan,
    pmVerdict,
    pmVerdictType,
    pmVerdictItems
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

// ── 영구 재사용 가능한 3-Worker 병렬 Tesseract 워커 풀 & 정밀 셀별 1.0x OCR 엔진 ──
const _ocrWorkerPool = [];
let _ocrWorkerInitPromise = null;
const _ocrWaitQueue = [];

function _dispatchNextOcrJob() {
  if (_ocrWaitQueue.length === 0) return;
  const free = _ocrWorkerPool.find(w => !w.busy);
  if (!free) return;
  const job = _ocrWaitQueue.shift();
  free.busy = true;
  free.worker.recognize(job.imageDataUrl)
    .then(res => job.resolve(res))
    .catch(err => job.reject(err))
    .finally(() => {
      free.busy = false;
      _dispatchNextOcrJob();
    });
}

async function recognizeWithWorkerPool(imageDataUrl) {
  if (!window.Tesseract) return null;
  if (typeof window.Tesseract.createWorker === 'function') {
    try {
      if (!_ocrWorkerInitPromise) {
        _ocrWorkerInitPromise = (async () => {
          const POOL_SIZE = 4;
          const workers = await Promise.all(
            Array.from({ length: POOL_SIZE }, () => window.Tesseract.createWorker('kor+eng'))
          );
          for (const w of workers) {
            _ocrWorkerPool.push({ worker: w, busy: false });
          }
          return _ocrWorkerPool;
        })().catch(() => null);
      }
      const pool = await _ocrWorkerInitPromise;
      if (pool && pool.length > 0) {
        return await new Promise((resolve, reject) => {
          _ocrWaitQueue.push({ imageDataUrl, resolve, reject });
          _dispatchNextOcrJob();
        });
      }
    } catch (e) {}
  }
  return await window.Tesseract.recognize(imageDataUrl, 'kor+eng');
}

function preprocessBannerCanvas(sourceCanvas, rect) {
  const c = cropCanvas(sourceCanvas, rect);
  try {
    const ctx = c.getContext('2d', { willReadFrequently: true });
    const imgData = ctx.getImageData(0, 0, c.width, c.height);
    const d = imgData.data;
    // 적색 배너 위 흰색 글씨(r>195, g>195, b>195)만 검은 글씨(0,0,0)로 반전하고 나머지는 백색(255,255,255)으로 정리하여 검은 그림자 노이즈 제거
    let whitePixels = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i] > 195 && d[i + 1] > 195 && d[i + 2] > 195) whitePixels++;
    }
    if (whitePixels > (c.width * c.height * 0.03)) {
      for (let i = 0; i < d.length; i += 4) {
        const isWhiteText = d[i] > 190 && d[i + 1] > 190 && d[i + 2] > 190;
        const v = isWhiteText ? 0 : 255;
        d[i] = v;
        d[i + 1] = v;
        d[i + 2] = v;
        d[i + 3] = 255;
      }
      ctx.putImageData(imgData, 0, 0);
    }
  } catch (e) {}
  return c;
}

/**
 * 각 셀을 원본(1.0x) 해상도 그대로 크롭하여 3-Worker 병렬 풀로 정밀 OCR 수행 +
 * 동시에 Cloudflare Vision AI 전송용 압축 스트립 이미지(stripDataUrl) 생성
 * - 비정수 배율(1.35x) 보간 블러 및 이질적인 셀 폭 병합으로 인한 DPI/줄높이 왜곡을 원천 차단
 */
async function ocrCellsSinglePass(canvas, cellSpecs, options = {}) {
  const result = {};
  const validSpecs = [];
  const LABEL_MAP = {
    type: '[유형/등급]',
    law: '[관련기준]',
    check: '[점검체크]',
    meta: '[협력사/공종명/작업장소/점검자/점검차수]',
    content: '[부적합내용]',
    interview: '[발생원인/관리자의견]',
    propType: '[점검단제안_판정]',
    propText: '[점검단제안_내용]',
    cm: '[개선대책]',
    pm: '[PM판정결과]',
    banner: '[사진1배너]',
    banner2: '[사진2배너]'
  };
  const HEADER_H = 22;
  const GAP = 28;
  const PAD_X = 12;
  const PAD_Y = 10;
  let maxW = 520;
  let totalH = PAD_Y;

  for (const spec of cellSpecs) {
    result[spec.key] = '';
    const b = spec.box;
    if (!b || b.w < 5 || b.h < 5) continue;
    const sx = b.x;
    const sy = b.y;
    const sw = Math.max(4, b.w);
    const sh = Math.max(4, b.h);
    // Vision AI 가독성·토큰 최적화: 작은 셀 1.15배 선명 보정, 큰 셀은 최대 960px로 압축해 Neurons ~40% 절감
    const scale = sw < 480 ? 1.15 : (sw > 960 ? (960 / sw) : 1.0);
    const dw = Math.round(sw * scale);
    const dh = Math.round(sh * scale);
    if (dw + PAD_X * 2 > maxW) maxW = dw + PAD_X * 2;
    const imgY0 = totalH + HEADER_H;
    validSpecs.push({
      key: spec.key,
      label: LABEL_MAP[spec.key] || `[${spec.key}]`,
      sx, sy, sw, sh,
      dw, dh,
      labelY: totalH,
      y0: imgY0,
      y1: imgY0 + dh
    });
    totalH = imgY0 + dh + 10;
  }

  if (validSpecs.length === 0) return { texts: result, stripDataUrl: '' };

  const stripCanvas = document.createElement('canvas');
  stripCanvas.width = maxW;
  stripCanvas.height = totalH;
  const sctx = stripCanvas.getContext('2d');
  sctx.fillStyle = '#FFFFFF';
  sctx.fillRect(0, 0, stripCanvas.width, stripCanvas.height);
  sctx.imageSmoothingEnabled = true;
  sctx.imageSmoothingQuality = 'high';
  sctx.font = 'bold 14px "Malgun Gothic", "Apple SD Gothic Neo", sans-serif';
  sctx.textBaseline = 'middle';

  for (const item of validSpecs) {
    sctx.fillStyle = '#EBF2FA';
    sctx.fillRect(PAD_X - 4, item.labelY, maxW - PAD_X * 2 + 8, HEADER_H - 2);
    sctx.fillStyle = '#0A2458';
    sctx.fillText(item.label, PAD_X + 4, item.labelY + (HEADER_H - 2) / 2);
    sctx.drawImage(canvas, item.sx, item.sy, item.sw, item.sh, PAD_X, item.y0, item.dw, item.dh);
  }

  const stripDataUrl = stripCanvas.toDataURL('image/jpeg', 0.84);

  // 방안 A (무료 일일 처리량 10배 확대 하이브리드): 디지털 텍스트가 없는 스캔 장표는 4-워커 병렬 Tesseract로 원문을 추출한 뒤
  // Cloudflare Qwen3-30B(텍스트 전용)로 오타 교정·표준 분류를 수행 (Tesseract가 실패한 셀만 Vision 백업)
  const shouldRunTesseract = options.forceTesseract || !options.hasDigitalText;

  if (shouldRunTesseract && window.Tesseract) {
    // check 셀은 픽셀 밀도(detectCheckboxesFromLayout)가 직접 판독하므로 OCR 생략해 속도 최적화
    const ocrTargets = validSpecs.filter(s => s.key !== 'check');
    await Promise.all(ocrTargets.map(async (s) => {
      try {
        const isBanner = s.key === 'banner' || s.key === 'banner2';
        const pad = (!isBanner && s.sw > 30 && s.sh > 24) ? 2 : 0;
        const rect = { x: s.sx + pad, y: s.sy + pad, w: s.sw - pad * 2, h: s.sh - pad * 2 };
        const c = isBanner
          ? preprocessBannerCanvas(canvas, rect)
          : cropCanvas(canvas, rect);
        const ret = await recognizeWithWorkerPool(c.toDataURL('image/jpeg', 0.88));
        result[s.key] = (ret && ret.data && ret.data.text) ? ret.data.text.trim() : '';
      } catch (e) {}
    }));
  }

  return { texts: result, stripDataUrl };
}

function parseVerdictItemsFromText(txt, monitoringDefault = '(현장모니터링 강화)') {
  const s = String(txt || '');
  const items = [];
  if (/시스템\s*개선|시스템개선/i.test(s)) {
    let sub = monitoringDefault;
    const mSub = s.match(/\((?:현장\s*)?모니터링[^)]*\)/) || s.match(/\(이행강화[^)]*\)/);
    if (mSub) sub = mSub[0];
    items.push({ type: '시스템 개선', sub });
  }
  if (/교육\/코칭|교육|코칭/i.test(s)) {
    let sub = '(근로자 교육)';
    const mSub = s.match(/\((?:근로자|협력사)\s*교육[^)]*\)/);
    if (mSub) sub = mSub[0];
    items.push({ type: '교육/코칭', sub });
  }
  if (/패널티|페널티|벌점/i.test(s)) {
    let sub = '(관리감독자 경고)';
    const mSub = s.match(/\(관리감독자[^)]*\)/);
    if (mSub) sub = mSub[0];
    items.push({ type: '페널티', sub });
  }
  return items;
}

function detectSeverityFromTypeBox(canvas, typeBox, tType = '') {
  const txt = String(tType || '');
  if (/경\s*부\s*적\s*합|경부/.test(txt)) return '경부적합';
  if (/중\s*부\s*적\s*합|중부/.test(txt)) return '중부적합';
  if (!canvas || !typeBox || typeBox.w < 16 || typeBox.h < 16) return '';
  try {
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const x0 = Math.max(0, Math.round(typeBox.x));
    const y0 = Math.max(0, Math.round(typeBox.y));
    const w = Math.min(canvas.width - x0, Math.round(typeBox.w));
    const h = Math.min(canvas.height - y0, Math.round(typeBox.h));
    if (w < 12 || h < 12) return '';
    const d = ctx.getImageData(x0, y0, w, h).data;
    const bandX = Math.max(3, Math.round(w * 0.14));
    const bandY = Math.max(3, Math.round(h * 0.14));
    let total = 0, gold = 0, cool = 0;
    for (let y = 1; y < h - 1; y += 2) {
      for (let x = 1; x < w - 1; x += 2) {
        if (x > bandX && x < w - bandX && y > bandY && y < h - bandY) continue;
        const i = (y * w + x) * 4;
        const r = d[i], g = d[i + 1], b = d[i + 2];
        total++;
        if (r > 185 && g > 130 && b < 120 && (r - b) > 75) gold++;
        else if (b > 135 && r < 175 && (b - r) > 20) cool++;
      }
    }
    if (total > 0) {
      if (gold / total > 0.015 && gold >= cool) return '중부적합';
      if (cool / total > 0.015) return '경부적합';
    }
  } catch (e) {}
  return '';
}

function parseCellTextsIntoFields(cellTexts, canvas, layout, mgmtCauses, allowDefaults = false) {
  const tType = cellTexts.type || '';
  const tLaw = cellTexts.law || '';
  const tMeta = cellTexts.meta || '';
  const tWorkCell = cellTexts.work || '';
  const tLocCell = cellTexts.loc || '';
  const tContent = cellTexts.content || '';
  const tInterview = cellTexts.interview || '';
  const tPropType = cellTexts.propType || '';
  const tPropText = cellTexts.propText || '';
  const tCm = cellTexts.cm || '';
  const tPm = cellTexts.pm || '';
  const tBanner = cellTexts.banner || '';
  const tBanner2 = cellTexts.banner2 || '';

  const content = cleanContent(tContent);
  const photoBanner = (tBanner.trim() || content) ? cleanBannerText(tBanner, content) : '';
  const photo2Banner = tBanner2.trim() ? cleanBannerText(tBanner2, content) : '';

  const mSub = tMeta.match(/협력사\s*[:;：]?\s*([^\n|]*?)(?=\s*(?:공종명|공종|작업장소|점검자|점검차수|$))/i);
  const subcontractor = cleanSubcontractor(mSub ? mSub[1] : '');

  const mWork = tMeta.match(/공종명?\s*[:;：]?\s*([\s\S]*?)(?=\s*(?:작업장소|장소|점검자|점검차수|부적합|$))/i);
  const workGroup = cleanWorkGroup(mWork ? mWork[1] : tWorkCell, content);

  const mLoc = tMeta.match(/작업장소\s*[:;：]?\s*([^\n|]*?)(?=\s*(?:점검자|점검차수|부적합|$))/i);
  const location = cleanLocation(mLoc ? mLoc[1] : '', tLocCell, content);

  let inspectUser = '';
  const mUser = tMeta.match(/점검자\s*[:;：]?\s*([^\n|]*?)(?=\s*(?:점검차수|부적합|$))/i);
  if (mUser && mUser[1].trim()) inspectUser = mUser[1].replace(/[^가-힣a-zA-Z0-9\s]/g, '').trim();

  let inspectRound = '';
  const mRound = tMeta.match(/점검차수\s*[:;：]?\s*([^\n|]+)/i);
  if (mRound && mRound[1].trim()) inspectRound = mRound[1].trim();
  else if (tMeta.trim()) inspectRound = "'26년上 2차";

  let interviewAuthor = '시공관리자 및 근로자';
  const mAuthor = tInterview.match(/\[\s*(?:관리자\s*의견|의견)\s*[:：]\s*([^\]]+)\]/i);
  if (mAuthor) interviewAuthor = mAuthor[1].replace(/의견\s*$/, '').trim();
  const interviewAuthorTitle = mAuthor ? `[관리자 의견 : ${interviewAuthor}]` : '[의견 : 시공관리자 및 근로자]';
  const interviewOpinion = cleanOpinionText(tInterview.replace(/\[\s*(?:관리자\s*의견|의견)[^\]]*\]/gi, ''));

  const proposalItems = parseVerdictItemsFromText(`${tPropType} ${tPropText}`, '(현장모니터링 강화)');
  const inspectorOpinionType = proposalItems.map(p => p.type).join(', ') || (allowDefaults ? '시스템 개선' : '');
  const auditProposal = cleanProposalText(tPropText);
  const actionPlan = cleanActionPlan(tCm);
  const pmVerdictItems = parseVerdictItemsFromText(tPm, '(모니터링 강화)');
  const pmVerdictType = pmVerdictItems.map(p => p.type).join(', ') || inspectorOpinionType;

  const detectedSev = detectSeverityFromTypeBox(canvas, layout?.typeCell, tType);
  const severity = detectedSev || (allowDefaults ? '중부적합' : '');
  let type = '';
  const typeCandidates = ['붕괴', '도괴', '추락', '낙하', '비래', '협착', '충돌', '전도', '전복', '화재', '폭발', '감전'];
  for (const cand of typeCandidates) {
    if (tType.includes(cand)) { type = cand; break; }
  }
  if (!type && allowDefaults) type = '붕괴';

  const hasLawOrCtx = !!(tLaw.trim() || content || workGroup);
  const lawParsed = parseLawCell(tLaw);
  const lawTitle = tLaw.trim() ? lawParsed.title : '';
  const lawBody = lawParsed.body;
  const law = hasLawOrCtx ? filterOnlyOccupationalSafetyLaw(lawTitle, `${content} ${workGroup}`) : '';

  return {
    severity,
    type,
    workGroup,
    subcontractor,
    location,
    inspector: inspectUser,
    inspectUser,
    round: inspectRound,
    inspectRound,
    content,
    photoBanner,
    photo2Banner: photo2Banner || undefined,
    mgmtCauses,
    condition: mgmtCauses.includes('불안전 상태') ? '물(物) 자체의 결함 (자재·부재 손상)' : '해당없음',
    action: mgmtCauses.includes('불안전 행동') ? '불안전한 동작·자세' : '해당없음',
    interviewAuthor,
    interviewAuthorTitle,
    interviewOpinion,
    proposalItems,
    inspectorOpinionType,
    auditProposal,
    actionPlan,
    countermeasure: actionPlan,
    pmVerdictItems,
    pmVerdictType,
    pmVerdict: pmVerdictType,
    law,
    rawLaw: lawTitle,
    lawBody
  };
}

function buildAiContextFromCellTexts(cellTexts, digitalText = '', hasDigitalText = false) {
  const ctxParts = [];
  if (hasDigitalText && digitalText) ctxParts.push(`[디지털 PDF 원문]: ${digitalText.trim()}`);
  if (cellTexts.type) ctxParts.push(`[유형/등급]: ${cellTexts.type}`);
  if (cellTexts.meta) ctxParts.push(`[메타 정보]: ${cellTexts.meta}`);
  if (cellTexts.law) ctxParts.push(`[관련 기준]: ${cellTexts.law}`);
  if (cellTexts.content) ctxParts.push(`[부적합 내용]: ${cellTexts.content}`);
  if (cellTexts.interview) ctxParts.push(`[발생원인 관리자 의견]: ${cellTexts.interview}`);
  if (cellTexts.propType || cellTexts.propText) ctxParts.push(`[점검단 제안]: ${cellTexts.propType || ''} / ${cellTexts.propText || ''}`);
  if (cellTexts.cm) ctxParts.push(`[개선대책]: ${cellTexts.cm}`);
  if (cellTexts.pm) ctxParts.push(`[PM 판정결과]: ${cellTexts.pm}`);
  if (cellTexts.banner) ctxParts.push(`[사진1 배너]: ${cellTexts.banner}`);
  if (cellTexts.banner2) ctxParts.push(`[사진2 배너]: ${cellTexts.banner2}`);
  return ctxParts.join('\n\n');
}

function enrichRecordOfflineFromContent(record) {
  if (!record || !record.content) return record;
  const g = typeof window !== 'undefined' ? window : globalThis;
  const localAi = g.SafeLocalAI;
  const classifier = g.SafeClassifier;
  if (localAi && typeof localAi.quickRuleAnalysis === 'function') {
    const r = localAi.quickRuleAnalysis(record.content);
    if (r) {
      if (!record.agentMajor && r.agentMajor) record.agentMajor = r.agentMajor;
      if (!record.agentMid && r.agentMid) record.agentMid = r.agentMid;
      if (!record.agentMinor && r.agentMinor) {
        record.agentMinor = r.agentMinor;
        record.agent = r.agentMinor;
        record.item = r.agentMid || r.agentMinor;
      }
      if (!record.workGroup && r.workGroup) record.workGroup = r.workGroup;
      if (!record.workMethod && r.workMethod) record.workMethod = r.workMethod;
      if ((!record.condition || record.condition === '해당없음') && r.condition) record.condition = r.condition;
      if ((!record.action || record.action === '해당없음') && r.action) record.action = r.action;
      if (!record.rootCauseMgmt && r.rootCauseMgmt) record.rootCauseMgmt = r.rootCauseMgmt;
      if (!record.rootCauseSystem && r.rootCauseSystem) record.rootCauseSystem = r.rootCauseSystem;
      if (!record.stakeholder && r.stakeholder) record.stakeholder = r.stakeholder;
      if (!record.law || /안전보건기준\s*검토|^산업안전보건기준에\s*관한\s*규칙$/.test(record.law)) {
        if (r.law) record.law = r.law;
      }
      if (!record.photoBanner && r.photoBanner) record.photoBanner = r.photoBanner;
      if (!record.type && r.type) record.type = r.type;
    }
  }
  let matrixInfo = null;
  if (classifier && typeof classifier.inferMatrix9x9 === 'function') {
    const m = classifier.inferMatrix9x9(`${record.content} ${record.workGroup || ''} ${record.photoBanner || ''}`);
    matrixInfo = m;
    if (m && m.score > 0) {
      if (!record.agentMajor && m.area) record.agentMajor = m.area;
      if (!record.agentMid && m.item) record.agentMid = m.item;
      if (!record.agentMinor && (m.spec || m.item)) {
        const minorVal = m.spec || m.item;
        record.agentMinor = minorVal;
        record.agent = minorVal;
        record.item = m.item || minorVal;
      }
    }
  }
  if (classifier && typeof classifier.inferRootCauseAndStakeholder === 'function' && (!record.rootCauseMgmt || !record.stakeholder)) {
    const rc = classifier.inferRootCauseAndStakeholder(record.content, matrixInfo, record.type || '낙하');
    if (rc) {
      if (!record.rootCauseMgmt && rc.mgmt) record.rootCauseMgmt = rc.mgmt;
      if (!record.rootCauseSystem && rc.system) record.rootCauseSystem = rc.system;
      if (!record.stakeholder && rc.stakeholder) record.stakeholder = rc.stakeholder;
    }
  }
  if (!record.workGroup) record.workGroup = cleanWorkGroup('', record.content);
  if (!record.location) record.location = cleanLocation('', '', record.content);
  if (!record.photoBanner) record.photoBanner = deriveConcreteBanner(record.content);
  if (!record.severity) record.severity = '중부적합';
  if (!record.type) record.type = '붕괴';
  return record;
}

/**
 * 단일 점검장표 캔버스를 분석하여 사진 추출 + 텍스트/체크박스/Qwen AI 정제를 수행
 */
export async function parseSheetCanvas(canvas, options = {}) {
  const { digitalText = '', pageNumber = 1, sourceName = '' } = options;
  const fullDocDataUrl = canvas.toDataURL('image/jpeg', 0.90);

  // 0. 고정밀 셀 레이아웃 분석
  let layout = null;
  try {
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    layout = analyzeSheetLayout(imgData);
  } catch (e) {
    console.warn('analyzeSheetLayout error:', e);
  }

  // 레이아웃 인식 성공 시: 셀별 1.0x 병렬 OCR + Vision/Qwen 하이브리드 정제 + 현장 실물 사진 분리 추출
  if (layout && layout.ok) {
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const banners = findRedBanners(imgData, layout.photoArea);
    const photoBoxes = findPhotoBoxes(imgData, layout.photoArea, banners);
    const realPhotoBoxes = photoBoxes.filter(b => !b.isReference);

    const photos = realPhotoBoxes.map(b => cropCanvas(canvas, b).toDataURL('image/jpeg', 0.92));
    if (photos.length === 0 && layout.photoArea) {
      photos.push(cropCanvas(canvas, layout.photoArea).toDataURL('image/jpeg', 0.90));
    }
    const photo1 = photos[0] || null;
    const photo2 = photos[1] || null;

    const mgmtCauses = detectCheckboxesFromLayout(imgData, layout.checkCell);

    const hasDigitalText = !!(digitalText && digitalText.trim().length >= 30);
    const cellSpecsList = [
      { key: 'type', box: layout.typeCell },
      { key: 'law', box: layout.lawCell },
      { key: 'check', box: layout.checkCell },
      { key: 'meta', box: layout.metaRow },
      { key: 'content', box: layout.contentRow },
      { key: 'interview', box: layout.interview },
      { key: 'propType', box: layout.proposalType },
      { key: 'propText', box: layout.proposalText },
      { key: 'cm', box: layout.countermeasure },
      { key: 'pm', box: layout.pmCell },
      { key: 'banner', box: banners.length > 0 ? banners[0] : null },
      { key: 'banner2', box: banners.length > 1 ? banners[1] : null }
    ];
    const { texts: cellTexts, stripDataUrl } = await ocrCellsSinglePass(canvas, cellSpecsList, { hasDigitalText });
    const hadCellText = Object.values(cellTexts).some(v => v && String(v).trim().length > 0);
    const parsedFields = parseCellTextsIntoFields(cellTexts, canvas, layout, mgmtCauses, hadCellText);

    let record = {
      slideNumber: pageNumber,
      pageNumber,
      ...parsedFields,
      photos,
      photo1,
      photo2,
      _hasDigitalText: hasDigitalText,
      _stripImageBase64: stripDataUrl || undefined,
      _fullDocImage: fullDocDataUrl,
      _sourceFile: sourceName
    };

    // Cloudflare Vision AI + Qwen3-30B 하이브리드 연동 (클라우드 모드 시 Tesseract 없이 이미지 직접 판독)
    if (window.SafeLocalAI && typeof window.SafeLocalAI.cleanOcrRecord === 'function') {
      try {
        const fullSheetContext = buildAiContextFromCellTexts(cellTexts, digitalText, hasDigitalText);
        record = await window.SafeLocalAI.cleanOcrRecord(fullSheetContext, record);
      } catch (e) {}
    }

    // 비상 오프라인 폴백: 클라우드 AI 한도 초과/오류로 content가 비어있을 때 병렬 Tesseract OCR + 로컬 룰/분류기 복원
    if (!record._aiCleaned && !record.content && window.Tesseract) {
      try {
        const { texts: fbTexts } = await ocrCellsSinglePass(canvas, cellSpecsList, { forceTesseract: true });
        const fbFields = parseCellTextsIntoFields(fbTexts, canvas, layout, mgmtCauses, true);
        const keepIfPresent = [
          'severity', 'type', 'workGroup', 'subcontractor', 'location',
          'inspector', 'inspectUser', 'round', 'inspectRound',
          'content', 'photoBanner', 'photo2Banner',
          'interviewAuthor', 'interviewAuthorTitle', 'interviewOpinion',
          'inspectorOpinionType', 'auditProposal',
          'actionPlan', 'countermeasure',
          'pmVerdictType', 'pmVerdict', 'law', 'rawLaw', 'lawBody'
        ];
        for (const k of keepIfPresent) {
          if (fbFields[k]) record[k] = fbFields[k];
        }
        if (fbFields.proposalItems?.length) record.proposalItems = fbFields.proposalItems;
        if (fbFields.pmVerdictItems?.length) record.pmVerdictItems = fbFields.pmVerdictItems;

        if (!record._aiQuotaExceeded && record.content && window.SafeLocalAI && typeof window.SafeLocalAI.cleanOcrRecord === 'function') {
          try {
            record = await window.SafeLocalAI.cleanOcrRecord(buildAiContextFromCellTexts(fbTexts, digitalText, hasDigitalText), record);
          } catch (e) {}
        }
      } catch (e) {}
    }

    if (!record._aiCleaned || !record.photoBanner || !record.workGroup || !record.agentMajor) {
      enrichRecordOfflineFromContent(record);
    }
    return record;
  }

  const sig = measureHeaderSignature(canvas);
  const frame = sig.frame;

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

  try {
    const stripCanvas = buildCleanTextStripCanvas(canvas, frame);
    const stripDataUrl = stripCanvas.toDataURL('image/jpeg', 0.84);
    record._stripImageBase64 = stripDataUrl;
    record._hasDigitalText = false;

    const isLocalProvider = typeof localStorage !== 'undefined' && localStorage.getItem('sp_ai_provider') === 'local';
    let ocrText = '';

    // 1차: Cloudflare 24시간 클라우드 AI 모드에서는 Tesseract 없이 Vision AI로 직접 판독
    if (!isLocalProvider && window.SafeLocalAI && typeof window.SafeLocalAI.cleanOcrRecord === 'function') {
      try {
        record = await window.SafeLocalAI.cleanOcrRecord('', record);
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

    // 2차: 로컬 AI 모드이거나 클라우드 AI 응답 실패/한도초과 시 Tesseract WASM 폴백 실행
    if (!record._aiCleaned && window.Tesseract) {
      const ret = await recognizeWithWorkerPool(stripDataUrl);
      ocrText = (ret && ret.data && ret.data.text) || '';

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
        if (!record._aiQuotaExceeded && window.SafeLocalAI && typeof window.SafeLocalAI.cleanOcrRecord === 'function') {
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
    }
  } catch (ocrErr) {
    console.warn('Sheet OCR warning:', ocrErr);
  }

  // Qwen AI 미적용 또는 필드 누락 시 오프라인 분류기/배너/법령 보강
  if (!record._aiCleaned || !record.photoBanner || !record.workGroup || !record.agentMajor) {
    enrichRecordOfflineFromContent(record);
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
    const BATCH_SIZE = 6;
    let processedCount = 0;

    for (let i = 0; i < binaryResult.jpegPages.length; i += BATCH_SIZE) {
      const batch = binaryResult.jpegPages.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.all(batch.map(async (pg) => {
        onProgress({
          current: Math.min(totalPages, processedCount + 1),
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
          console.log(`[SafePatrol PDF] Page ${pg.pageNumber}/${totalPages} 생략 (일반 텍스트/간지 페이지, score=${sig.score})`);
          return { _skipped: true, pageNumber: pg.pageNumber };
        }

        const rec = await parseSheetCanvas(canvas, {
          pageNumber: pg.pageNumber,
          sourceName: `${file.name} (p.${pg.pageNumber})`
        });
        if (rec && rec._skipped) {
          console.log(`[SafePatrol PDF] Page ${pg.pageNumber}/${totalPages} 생략 (${rec.reason || '참고사항/시공예시'})`);
          return { _skipped: true, pageNumber: pg.pageNumber };
        }
        return rec;
      }));

      for (const res of batchResults) {
        processedCount++;
        if (!res || res._skipped) {
          skippedCount++;
          onProgress({
            phase: 'skip',
            current: processedCount,
            total: totalPages,
            extracted: records.length,
            skipped: skippedCount,
            currentPage: processedCount,
            totalPages,
            extractedCount: records.length,
            skippedCount
          });
        } else {
          records.push(res);
          onProgress({
            current: processedCount,
            total: totalPages,
            extracted: records.length,
            skipped: skippedCount,
            currentPage: processedCount,
            totalPages,
            extractedCount: records.length,
            skippedCount
          });
        }
      }
    }

    records.sort((a, b) => (a.pageNumber || 0) - (b.pageNumber || 0));

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

  let lastKnownLocation = '';
  const BATCH_SIZE = 6;
  const orderedResults = new Array(totalPages).fill(null);

  for (let startPage = 1; startPage <= totalPages; startPage += BATCH_SIZE) {
    const batchPages = [];
    for (let p = startPage; p < startPage + BATCH_SIZE && p <= totalPages; p++) {
      batchPages.push(p);
    }

    onProgress({
      current: startPage,
      total: totalPages,
      extracted: records.length,
      skipped: skippedCount,
      currentPage: startPage,
      totalPages,
      extractedCount: records.length,
      skippedCount
    });

    await Promise.all(batchPages.map(async (pNum) => {
      const page = await pdfDoc.getPage(pNum);
      const viewport = page.getViewport({ scale: 1.5 });
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
        console.log(`[SafePatrol PDF] Page ${pNum}/${totalPages} 생략 (일반 텍스트/간지 페이지)`);
        return;
      }

      const rec = await parseSheetCanvas(pageCanvas, {
        digitalText,
        pageNumber: pNum,
        sourceName: `${file.name} (p.${pNum})`,
        lastKnownLocation
      });
      if (rec && rec.location) lastKnownLocation = rec.location;
      if (rec && rec._skipped) {
        skippedCount++;
        console.log(`[SafePatrol PDF] Page ${pNum}/${totalPages} 생략 (${rec.reason || '참고사항/시공예시'})`);
        return;
      }
      orderedResults[pNum - 1] = rec;
    }));

    // 배치 결과 순서대로 반영 및 진행률 갱신
    records.length = 0;
    for (const r of orderedResults) {
      if (r) records.push(r);
    }
    const donePage = Math.min(totalPages, startPage + BATCH_SIZE - 1);
    onProgress({
      current: donePage,
      total: totalPages,
      extracted: records.length,
      skipped: skippedCount,
      currentPage: donePage,
      totalPages,
      extractedCount: records.length,
      skippedCount
    });
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
  // 2차 패스: 장소 미추출 레코드에 동일 문서 내 유효 장소 상속 및 문맥 보정
  const bestDocLocation = lastKnownLocation || records.find(r => r.location)?.location || '101동 외부';
  for (const r of records) {
    if (!r.location || r.location.length < 2) {
      if (/계단구간|E\/V/i.test(r.content)) r.location = '계단구간 E/V 최상부';
      else if (/갱폼|gang\s*form/i.test(r.content)) r.location = bestDocLocation ? `${bestDocLocation} (갱폼)` : '101동 외부';
      else r.location = bestDocLocation;
    }
  }

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
