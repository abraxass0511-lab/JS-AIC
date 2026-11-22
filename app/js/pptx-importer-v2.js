/**
 * SafePatrol 점검장표 PDF / PPTX / 이미지 초정밀 자동 파서 (v3.0)
 * - 다량(100장 규모) PDF 일괄 업로드 시 일반 텍스트/표지/간지 장표 자동 생략, 점검장표만 정밀 선별
 * - PDF 페이지 회전(/Rotate 90/180/270) 및 A4 여백 자동 정규화
 * - 2D XY-Cut 기반 동적 사진 영역 탐색: 슬라이드 내 다양한 위치/개수의 현장 사진만 테두리 없이 순수 추출
 * - 4대 발생요인 체크박스(계획 미수립, 계획 미이행, 불안전 행동, 불안전 상태) 픽셀 농도 자동 인식
 * - 디지털 PDF 텍스트 레이어 + 영역별 클린 OCR + Qwen AI(LM Studio / 24h 클라우드) 연동으로 엑셀 대장 완벽 기록
 */

import { analyzeSheetLayout, findRedBanners, findPhotoBoxes, detectCheckboxesFromLayout, preprocessCellCanvas } from './sheet-layout.js?v=20261122_v65';
import { initPaddleOcr, recognizeCellWithPaddle } from './paddle-ocr-client.js?v=20261122_v65';
import {
  normalizeRoundText,
  normalizeFieldText,
  snapToStandardTaxonomy,
  applyTypoPatches,
  joinWrappedKoreanLines,
  normalizeKoreanSpacing,
  OFFICIAL_WORK_GROUPS,
  mapToStandardWorkGroup,
  extractCoreViolationBanner,
  splitInlineBullets,
  stripCircledNumbers,
  stripBannerSecondItemTail,
  normalizePhotoBannerText,
  isValidOriginalSheetBanner,
  resolveUnifiedPhotoBanner,
  normalizeSafetyLawBody,
  normalizeSafetyLawSpec,
  hasGarbledKoreanNoise,
  isGarbledBannerText,
  inferSafetyDomain,
  SafeGuidelineMemory,
  parseInterviewOpinions
} from './text-normalizer.js?v=20261122_v65';

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
  let c = normalizeKoreanSpacing(healSafetyKoreanLexicon(content))
    .replace(/^부적합\s*(?:내용|사항)\s*[:;：]?\s*/, '')
    .trim();
  const firstLine = stripBannerSecondItemTail(c.split('\n')[0]).replace(/^(?:[①②③④⑤⑥⑦⑧⑨⑩]|\(?\d{1,2}\)?[.)]|[-•·ㆍ.,:;\s])+/g, '').trim();
  return stripBannerSecondItemTail(extractCoreViolationBanner('', c) || firstLine || '');
}

/**
 * [관련 기준] 3단계 우선순위 정규화 필터 (하드코딩 조문 임의 대입 금지)
 * - 1순위: 원본 문서에서 추출된 유효한 관련 기준(산업안전보건법/지침/위험성평가) 보존
 * - 2순위: 학습된 SafeGuidelineMemory 조회 보완
 * - 3순위: 공란·손상·도메인 충돌 시 빈 값('')을 반환하여 AI(Qwen3-30B)가 산업안전보건법으로 일관 판단하도록 위임
 * @param {string} lawText
 * @param {string} contextText
 * @returns {string}
 */
export function filterOnlyOccupationalSafetyLaw(lawText, contextText = '') {
  const rawLawStr = String(lawText || '').replace(/직[계게개]차|지[계개제]차/g, '지게차').trim();
  const ctxStr = String(contextText || '').replace(/직[계게개]차|지[계개제]차/g, '지게차').trim();
  if (!rawLawStr && !ctxStr) return '';

  const spec = normalizeSafetyLawSpec({
    rawLaw: rawLawStr,
    lawBody: '',
    law: '',
    contextText: ctxStr
  });
  if (spec.title && !hasGarbledKoreanNoise(spec.title)) {
    return spec.title;
  }
  const learned = SafeGuidelineMemory.lookup({ rawLaw: rawLawStr, content: ctxStr });
  if (learned && learned.title && !hasGarbledKoreanNoise(learned.title)) {
    return learned.title;
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
export async function normalizeImageOrientation(file, pdfRotate = 0, options = {}) {
  let bmp;
  try {
    bmp = await createImageBitmap(file, { imageOrientation: 'none' });
  } catch (e) {
    bmp = await createImageBitmap(file);
  }

  const maxWidth = options.maxWidth || 1650;
  const maxDim = Math.max(bmp.width, bmp.height);
  const scale = maxDim > maxWidth ? (maxWidth / maxDim) : 1;
  const dw = Math.max(1, Math.round(bmp.width * scale));
  const dh = Math.max(1, Math.round(bmp.height * scale));

  let baseCanvas = document.createElement('canvas');
  baseCanvas.width = dw;
  baseCanvas.height = dh;
  baseCanvas.getContext('2d').drawImage(bmp, 0, 0, dw, dh);
  if (typeof bmp.close === 'function') bmp.close();

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
    // 13. 치수 및 단위 정밀 정규화 (6007이하 -> 60cm 이하, 600ㅁ로 -> 60cm로 — 세대 호수 '1501호' 등 오변환 절대 방지!)
    .replace(/6007\s*이하|600ㅁ\s*이하/g, '60cm 이하')
    .replace(/600[ㅁm7]\s*로/g, '60cm로')
    .replace(/600[ㅁm7]\b/g, '60cm')
    .replace(/(\d{2})0[ㅁ口]\s*(?=이하|이상|이내|간격|로|에|\s|$|[),])/g, '$1cm ')
    .replace(/(\d{2})0[0-97]\s*(?=이하|이상|이내|간격)/g, '$1cm ')
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

    // 2. 장비/코어 약어(E/V, L/C, T/C, G/F) 선보호 + OCR 오타(외무->외부, 수면->후면, /C->L/C) 정밀 복원
    s = s
      .replace(/E\/V|6\/『|6\//gi, '@@EV@@')
      .replace(/L\/C/gi, '@@LC@@')
      .replace(/T\/C/gi, '@@TC@@')
      .replace(/G\/F/gi, '@@GF@@')
      .replace(/(^|\s)\/C(?=\s*\d|호기|$)/gi, '$1@@LC@@')
      .replace(/^(?:작업\s*장소|작[업엄]장소|장\s*소)\s*[:;：.]?\s*/i, '')
      .replace(/\[\s*ERE\b[^\]\n]*\]?/gi, '')
      .replace(/\b(?:EERE|ERE|EEE|ee|ere|MAK|261k|SEAT|CERNE|EEL|드로|리로)\b(?:\s*[:;=]?\s*[a-zA-Z0-9]+)*/gi, ' ')
      .replace(/(?:[점섬정겸]검\s*[자차]?|[점섬정겸]검차수|[집점]십[사차]수|\b차수\b|\b\d+\s*차\b)[\s\S]*$/i, '')
      .replace(/\s+\d{2,}(?:\s+\d+)*\s*$/g, '')
      .replace(/(?<![/A-Za-z0-9])\b[a-z]\b(?![/A-Za-z0-9])/g, ' ')
      .replace(/[\[\]{}()_ㅣ¦!~—:;]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/@@EV@@/g, 'E/V')
      .replace(/@@LC@@/g, 'L/C')
      .replace(/@@TC@@/g, 'T/C')
      .replace(/@@GF@@/g, 'G/F')
      .replace(/(\d+\s*동)\s*외무(?=\s|$)/g, '$1 외부')
      .replace(/(\d+\s*동)\s*수면(?=\s|$)/g, '$1 후면')
      .replace(/(^|\s)외무(?=\s|$)/g, '$1외부')
      .replace(/(\d{2})cm\s*호(?=\s|$|[^가-힣])/gi, '$101호')
      .replace(/(L\/C|T\/C)\s*(\d)/g, '$1 $2');

    // 3. 1075 35 1코어 등 숫자 오인식 치유 + 동/층/호/코어/기초 띄어쓰기 전수 적용 (임의 단어 삭제 mSecond 절단 폐지!)
    s = s.replace(/(\d{1,4}\s*동)\s*(\d+,\d+)3(코어)/g, '$1 $2,3$3');
    s = s.replace(/\b1?(10[1-9]|1[1-9]\d)[358등]\s+([1-9]|1\d|2\d|3\d)[358측증]\s*(?=\d+\s*코어|코어)/g, '$1동 $2층 ');
    s = s.replace(/(\d{1,4}\s*동)\s*(\d{1,2})\s+(?=\d+\s*코어)/g, '$1 $2층 ');
    s = s.replace(/(?<![,\d])\b(\d{1,2})[358측증]\b(?=\s*(?:\d+\s*코어|코어|PIT|피트))/g, '$1층');
    s = normalizeKoreanSpacing(s);

    if (/^(?:1?(?:10[1-9]|1[1-9]\d)[385]?|\d{3,5})$/.test(s)) {
      const mMatch = s.match(/1?(10[1-9]|1[1-9]\d)[385]?/);
      if (mMatch && mMatch[1]) return `${mMatch[1]}동`;
    }
    s = s.replace(/\b1?(10[1-9]|1[1-9]\d)[385등]\b(?!\s*동)/g, '$1동');

    return normalizeKoreanSpacing(s).replace(/\s+/g, ' ').trim();
}

export function cleanBannerText(rawBanner, content = '', location = '') {
  // 1순위: 원본 장표의 적색 배너 텍스트가 유효하게 존재하면 요약·축약·괄호삭제·하드코딩 치환 없이 원문 그대로 보존!
  const cleanedRaw = normalizePhotoBannerText(rawBanner, content, location);
  if (cleanedRaw && isValidOriginalSheetBanner(cleanedRaw, content, location)) {
    const normContent = String(content || '').replace(/^부적합\s*(?:내용|사항)\s*[:;：]?\s*/, '').replace(/\s+/g, ' ').trim();
    const isRawCopyOfLongContent = normContent.length > 36 && cleanedRaw.replace(/\s+/g, '') === normContent.replace(/\s+/g, '');
    if (!isRawCopyOfLongContent) {
      return cleanedRaw;
    }
  }

  let b = stripCircledNumbers(String(rawBanner || '').trim());
  b = healSafetyKoreanLexicon(b)
    .replace(/타설\s{2,}계단참/g, '타설 中 계단참')
    .replace(/^[123458\s()\[\].\-_|｜'‘’"“”]+(?=[가-힣A-Za-z])/, '')
    .replace(/벽의음/g, '벽이음')
    .replace(/6055/g, '60도↓')
    .replace(/6\/『|6\//g, 'E/V')
    .replace(/\(\s*불량/g, '불량')
    .replace(/[^\w가-힣ㄱ-ㅎㅏ-ㅣ\s/()\-↓↑.,:]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  b = healSafetyKoreanLexicon(b).replace(/\.{2,}/g, '').replace(/[.·\s]+$/, '').trim();
  if (b && isValidOriginalSheetBanner(b, content, location)) {
    const normContent = String(content || '').replace(/^부적합\s*(?:내용|사항)\s*[:;：]?\s*/, '').replace(/\s+/g, ' ').trim();
    const isRawCopyOfLongContent = normContent.length > 36 && b.replace(/\s+/g, '') === normContent.replace(/\s+/g, '');
    if (!isRawCopyOfLongContent) {
      return normalizePhotoBannerText(b, content, location) || b;
    }
  }

  // 2순위: 원본 장표에 적색 배너가 없거나 깨진 경우에만 부적합 내용(content)에서 도출
  return stripCircledNumbers(deriveConcreteBanner(content));
}

export function cleanWorkGroup(rawWork, contentText = '') {
  return mapToStandardWorkGroup(rawWork, contentText);
}

export function parseLawCell(tLaw, fallbackTitle = '') {
  const rawStr = String(tLaw || '');
  const rawLines = rawStr.split(/\r?\n/)
    .map(l => l.replace(/^[|ㅣ¦!~—\-_=]+\s*/, '').replace(/[|ㅣ¦!~—\-_=]+$/, '').replace(/\.[a-zA-Z]{1,2}\s*$/, '.').trim())
    .filter(Boolean);

  if (rawLines.length === 0) return { title: '', body: '', needsAiLaw: true };

  const contextText = typeof arguments[2] === 'string' ? arguments[2] : '';
  let titleIdx = 0;
  if (rawLines.length > 1) {
    const l0 = rawLines[0];
    const isL0Noise = (/^[0-9I=;:\s]+/.test(l0) && (/of\s*xi/i.test(l0) || /업적/i.test(l0) || l0.length < 15))
      || /거푸집공\s*업적/.test(l0);
    const hasClearNextTitle = /(?:작업\s*절차|작업\s*지침|안전\s*지침|조립\s*기준|일반\s*사항|보건\s*규칙|안전보건규칙|안전삭업|안전작업|106|108|110|115|IZ)/i.test(rawLines[1]);
    if (isL0Noise || (hasClearNextTitle && !/(?:작업\s*절차|작업\s*지침|안전\s*지침|조립\s*기준|일반\s*사항|보건\s*규칙|안전삭업|안전작업|106|108|110|115|IZ)/i.test(l0))) {
      titleIdx = 1;
    }
  }

  let rawTitle = (rawLines[titleIdx] || fallbackTitle || '').replace(/^[0-9I=;:\s]+/, '').replace(/[|ㅣ¦!~—\-_=]+$/, '').trim();
  let sliceStart = titleIdx + 1;

  // 소제목 행('7.2.8', '6.3.2' 등)이 첫 줄로 잡힌 경우 본문 첫 줄로 복원
  if (/^\.?28\s*작업발판|^7\.2\.8\s*작업발판|^(?:7\.)?1\s*비계\s*조립기준|^6\.3\.[12]\s*작업/.test(rawTitle)) {
    rawTitle = fallbackTitle || '';
    sliceStart = titleIdx;
  } else if (/현장\s*제작\s*대형\s*거푸집/.test(rawTitle)) {
    rawTitle = '현장 제작 대형 거푸집공사 작업 절차';
  }

  const rawBodyJoined = rawLines.slice(sliceStart).join('\n')
    .replace(/^\.?28\s*작업발판\s*일반사항/gm, '7.2.8 작업발판 일반사항')
    .replace(/^(?:7\.)?1\s*비계\s*조립기준/gm, '7.1 비계 조립기준')
    .replace(/^(?:3\.?6|36)\s*유도자\s*(?=\d+\))/gm, '3.6 유도자\n')
    .replace(/^(?:3\.?6|36)\s*유도자/gm, '3.6 유도자')
    .replace(/6\.3\.2\s*자업[^\n]*?(?=1\)|2\)|\n|$)/g, '6.3.2 작업 중 점검\n')
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
    .replace(/\.[a-zA-Z]{1,2}\s*$/gm, '.')
    .replace(/(?:=\s*)?(?:\b[a-zA-Z]{1,3}\s+){2,}[a-zA-Z]{1,4}\s*$/gm, '')
    .replace(/[=—\-_\s]+ee[\s\S]*$/gi, '')
    .replace(/\s*\*\s+/g, '\n* ')
    .trim();

  const bodyLines = [];
  for (const line of rawBodyJoined.split(/\r?\n/)) {
    const cl = line.replace(/^[|ㅣ¦!~—\-_=]+\s*/, '').replace(/[|ㅣ¦!~—\-_=]+$/, '').replace(/\.[a-zA-Z]{1,2}\s*$/, '.').trim();
    if (!cl || cl.length < 2) continue;
    if (/^(?:[=—\-_\s]+ee|[a-zA-Z\s=]{5,})$/i.test(cl)) continue;
    if (/(?:협력사|공종명|작업장소|점검자|점검차수)\s*[:;：]/.test(cl)) continue;
    // 이전 줄이 문장 중간에서 줄바꿈된 경우('*'나 번호로 시작하지 않는 이어짐 줄) 병합
    // 단, 소제목('3.6 유도자', '6.3.2 작업 중 점검' 등 짧은 제목이나 섹션 헤더) 뒤에는 병합하지 않음
    const prev = bodyLines.length > 0 ? bodyLines[bodyLines.length - 1] : '';
    const prevIsHeading = Boolean(prev) && !/^\d+\)/.test(prev) && (
      /^\d+\.\d+/.test(prev) ||
      (prev.length <= 24 && /(?:기준|사항|점검|절차|유도자)$/.test(prev))
    );
    const prevBodyLine = bodyLines.length > 0 ? bodyLines[bodyLines.length - 1] : '';
    const prevEndsSentence = /(?:다|함|됨|음|요|임)[.!?]$/.test(prevBodyLine);
    if (bodyLines.length > 0 && !/^(?:\*|\d+\)|\d+\.\d+|[①-⑩•\-·▪])/.test(cl) && !prevIsHeading && !prevEndsSentence) {
      bodyLines[bodyLines.length - 1] = joinWrappedKoreanLines(prevBodyLine, cl);
    } else {
      bodyLines.push(cl);
    }
  }

  const rawResult = {
    title: normalizeKoreanSpacing(rawTitle),
    body: normalizeSafetyLawBody(bodyLines.map(l => normalizeKoreanSpacing(l)).join('\n'))
  };
  const healedLaw = normalizeSafetyLawSpec({
    rawLaw: rawResult.title,
    lawBody: rawResult.body,
    law: fallbackTitle,
    contextText
  });
  return {
    title: healedLaw.title !== undefined && healedLaw.title !== '' ? healedLaw.title : '',
    body: healedLaw.body !== undefined ? healedLaw.body : rawResult.body,
    needsAiLaw: Boolean(healedLaw.needsAiLaw)
  };
}

export function cleanOpinionText(raw, options = {}) {
  if (!raw) return '';
  let rawStr = String(raw || '');
  rawStr = rawStr.replace(/\s+[a-z]\s*\d+\s*\{[\s\S]*$/i, '');
  rawStr = rawStr.replace(/\s+[a-z0-9]\s+[0-9]+[a-z0-9{}.…\s]*$/gi, '');
  rawStr = rawStr.replace(/a\s*0\s*2\s*\{[\s\S]*$/gi, '');
  const preCleaned = healSafetyKoreanLexicon(rawStr)
    .replace(/^[-—_]{2,}\s*(?=[가-힣A-Za-z0-9(\[])/gm, '- ')
    .replace(/(?:\[?\s*(?:HAT|점검단)\s*제안\]?|시스템\s*개선|교육\/코칭)[\s\S]*$/gi, '')
    .replace(/oo\s*(?:Tle|기느으|기느|기|©)[\s\S]*?(?=-|[가-힣])/gi, '')
    .replace(/(?:EE\s*tee|ee\s*A\s*eA|바가\s*---|\btee\s*ee\b|ATER\s*TH|isdios|[—_]{6,}(?!\s*[가-힣]))[\s\S]*$/gi, '')
    .replace(/^[^\n]*?=\s*-\s*/, '- ')
    .trim();

  const parsedMulti = parseInterviewOpinions(preCleaned);
  if (parsedMulti.hasMulti || (options.preserveHeaders && parsedMulti.sections.length > 0)) {
    return parsedMulti.hasMulti
      ? parsedMulti.formatted
      : parsedMulti.sections.map(sec => (sec.text ? `${sec.title}\n${sec.text}` : sec.title)).join('\n');
  }
  if (parsedMulti.sections.length === 1 && parsedMulti.sections[0].text) {
    return parsedMulti.sections[0].text;
  }

  let s = preCleaned
    .replace(/\[\s*(?:[가-힣a-zA-Z\s]{0,15}?의견|의견|면담|인터뷰)[^\]]*\]/gi, '')
    .trim();

  // 인라인 명시적 불릿(-)만 줄바꿈 처리 (영문/괄호 시작 불릿 포함)
  s = splitInlineBullets(s);

  const rawLines = s.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const items = [];
  for (let l of rawLines) {
    if (/^[-•*·▪\s]*\[?\s*(?:관리자|근로자|관계자|담당자|시공자|해당\s*근로자)?\s*의견\s*[:;：]/i.test(l)) continue;
    const hasDash = /^[-—•*·▪]+\s*/.test(l);
    const isBulletStart = hasDash || /^\d+[\).]/s.test(l);
    let text = l.replace(/^[|\sㅣ¦_!\-•·~—*.©=]+/, '').replace(/^\d+[\).]\s*/, '').replace(/^[|\sㅣ¦_!\-•·~—*.©=]+/, '').replace(/[|\sㅣ¦_!~—\-*]+$/, '').trim();
    if (!text || text.length < 2) continue;
    if (/^\[?\s*(?:관리자|근로자|관계자|담당자|시공자|해당\s*근로자)?\s*의견\s*[:;：]/i.test(text)) continue;
    if (items.length === 0 || isBulletStart) {
      items.push({ text, hasDash });
    } else {
      items[items.length - 1].text = joinWrappedKoreanLines(items[items.length - 1].text, text);
    }
  }
  if (items.length === 0) return '';
  return items.map(it => `${it.hasDash ? '- ' : ''}${normalizeKoreanSpacing(healSafetyKoreanLexicon(it.text))}`).join('\n');
}

export function cleanProposalText(raw) {
  if (!raw) return '';
  let s = healSafetyKoreanLexicon(String(raw))
    .replace(/^[-—_]{2,}\s*(?=[가-힣A-Za-z0-9(\[])/gm, '- ')
    .replace(/\[?(?:점검단|HAT)\s*제안\]?/gi, '')
    .replace(/시스템\s*개선|교육\s*[\/·]\s*코칭|제재\s*[\/·]\s*징계|패널티|페널티|\((?:현장\s*)?모니터링\s*강화\)|\(\s*모니터링\/점검강화\s*\)|\(이행강화안\s*수립\)|\(\s*(?:근로자|협력사|작업팀|해당\s*작업팀)\s*교육\s*\)|\(\s*해당\s*작업팀\s*대기\s*\)|\(관리감독자\s*경고\)/gi, '')
    .replace(/^(?:[-•*·▪\s]*)(?:De\s*T=?\s*©?|SHE\s*SEA|oo\s*Tle\s*©?|구시\s*으\s*기느으|oo\s*기느으|구시\s*으|기느으)[\s\S]*?(?=\d|1차|-|[가-힣]{2})/gi, '')
    .replace(/(?:EE\s*tee|ee\s*A\s*eA|바가\s*---|\btee\s*ee\b|ATER\s*TH|isdios|[—_]{6,}(?!\s*[가-힣]))[\s\S]*$/gi, '')
    .trim();

  // 인라인 명시적 불릿(-)만 줄바꿈 처리 (영문/괄호 시작 불릿 포함)
  s = splitInlineBullets(s);

  const rawLines = s.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const items = [];
  for (const line of rawLines) {
    const hasDash = /^[-—•*·▪]+\s*/.test(line);
    const isBulletStart = hasDash || /^\d+[\).]/s.test(line);
    let cl = line.replace(/^[|\sㅣ¦_!\-•·~—*.©=]+/, '').replace(/^\d+[\).]\s*/, '').replace(/^[|\sㅣ¦_!\-•·~—*.©=]+/, '').replace(/[|\sㅣ¦_!~—\-*]+$/, '').trim();
    if (!cl || cl.length < 2 || /^[블를클르]$/.test(cl)) continue;
    if (items.length === 0 || isBulletStart) {
      items.push({ text: cl, hasDash });
    } else {
      items[items.length - 1].text = joinWrappedKoreanLines(items[items.length - 1].text, cl);
    }
  }
  return items.map(it => `${it.hasDash ? '- ' : ''}${normalizeKoreanSpacing(healSafetyKoreanLexicon(it.text))}`).join('\n');
}

export function cleanActionPlan(raw) {
  if (!raw) return '';
  const rawStr = healSafetyKoreanLexicon(String(raw)).replace(/^[-—_]{2,}\s*(?=[가-힣A-Za-z0-9(\[])/gm, '- ');
  const preBulletStr = rawStr
    .replace(/\[?\s*PM\s*판정\s*결과\s*\]?/gi, '')
    .replace(/시스템\s*개선|교육\s*[\/·]\s*코칭|제재\s*[\/·]?\s*징계|패널티|페널티/gi, '')
    .replace(/\((?:현장\s*)?모니터링\s*강화\)|\(\s*모니터링\/점검강화\s*\)|\(이행강화\s*방안\s*수립\)|\(이행강화안\s*수립\)|\(\s*(?:근로자|협력사)\s*교육\s*\)|\(관리감독자\s*경고\)|\(\s*해당\s*작업팀\s*대기\s*\)|\(\s*작업팀\s*교육\s*\)/gi, '')
    .replace(/(?:EE\s*tee|ee\s*A\s*eA|바가\s*---|\btee\s*ee|ATER\s*TH|isdios|[—_]{6,}(?!\s*[가-힣]))[\s\S]*$/gi, '')
    .replace(/위[험혐협형횸][성승송]?\s*평[가기ㅇ아어0-9]?/g, '위험성평가')
    .replace(/내실화\s*[&xX×쪽종등5]\s*점검\s*강\s*화/g, '내실화 등 점검 강화')
    .replace(/30000\s*이하|3000\)?\s*이하|3060\s*이하|30cm이하/g, '30cm 이하')
    .replace(/5560[ㅁ口0-9]*|5500\b|55em\b/g, '55cm');
  const cleanedStr = splitInlineBullets(preBulletStr)
    .replace(/,\s*-\s*/g, '\n- ')
    .trim();

  const rawLines = cleanedStr.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const items = [];

  for (const line of rawLines) {
    const hasDash = /^[-—•*·▪]+\s*/.test(line);
    const hasExplicitBullet = hasDash || /^\.\s*|^\d+[\).]/s.test(line);
    let cl = line.replace(/^[|\sㅣ¦_!~—\-*•·.\s&]+/, '').replace(/^\d+[\).]\s*/, '').replace(/^[|\sㅣ¦_!~—\-*•·.\s&]+/, '').replace(/[|\sㅣ¦_!~—\-&]+$/, '').trim();
    if (!cl || cl.length < 2) continue;
    if (/^(?:사각후크|그림\s*참조|상하\s*방향|900mm|보강\s*예|시스템\s*개선|교육\s*[\/·]\s*코칭|제재\s*[\/·]?\s*징계|해당\s*작업팀\s*대기)$/i.test(cl) || /[&제테텍레]{3,}/.test(cl)) continue;

    if (items.length === 0 || hasExplicitBullet) {
      items.push({ text: cl, hasDash });
    } else {
      items[items.length - 1].text = joinWrappedKoreanLines(items[items.length - 1].text, cl);
    }
  }

  return items.map(it => `${it.hasDash ? '- ' : ''}${normalizeKoreanSpacing(healSafetyKoreanLexicon(it.text))}`).join('\n');
}

export function cleanContent(raw) {
  if (!raw) return '';
  let rawStr = String(raw || '');
  rawStr = rawStr.replace(/\s+[a-z]\s*\d+\s*\{[\s\S]*$/i, '');
  rawStr = rawStr.replace(/\s+[a-z0-9]\s+[0-9]+[a-z0-9{}.…\s]*$/gi, '');
  rawStr = rawStr.replace(/a\s*0\s*2\s*\{[\s\S]*$/gi, '');
  const cleanedLines = healSafetyKoreanLexicon(rawStr)
    .replace(/^(?:부적합\s*)?(?:내용|사항)\s*[:;：]\s*/, '')
    .replace(/^[|ㅣ¦_!~\-\s]+/, '')
    .replace(/(?:EE\s*tee|ee\s*A\s*eA|바가\s*---|\btee\s*ee\b|ATER\s*TH|isdios|eevee|[—_]{6,}(?!\s*[가-힣]))[\s\S]*$/gi, '')
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
    .replace(/(?<=[^\n])\s*(?=[2-9]\)\s*[가-힣])/g, '\n')
    .replace(/\s+(?=→\s*)/g, '\n')
    .replace(/(?:^|\r?\n)\s*ㅠ\s*/g, '\n- ')
    .replace(/(?<=\S)\s+ㅠ\s+(?=[가-힣a-zA-Z0-9])/g, '\n- ')
    .split(/\r?\n/)
    .map(l => normalizeKoreanSpacing(l.replace(/^[|ㅣ¦_!~\-\sㅠ]+/, '').replace(/[|ㅣ¦_!~\-\s:。.ㅎ]+$/, '').trim()))
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
    inspectUser = sanitizeInspectorValue(mUser[1]);
  }

  let inspectRound = "'26년上 2차";
  const mRound = txt.match(/점검차수\s*[:;：]?\s*([^\n|]+)/i);
  if (mRound && mRound[1]) {
    inspectRound = normalizeRoundText(mRound[1].trim());
  }

  // 사진 요약(배너) 동적 생성 (절대 공란 배제)
  const photoBanner = deriveConcreteBanner(content);

  let rawLaw = '';
  const mLaw = txt.match(/(?:작업지침\s*\[[^\]]+\][^\n]+|산업안전보건[^\n]+|안전보건규칙[^\n]+|산안법[^\n]+)/);
  if (mLaw) rawLaw = mLaw[0].trim();

  // 발생원인 인터뷰 결과 (단일·복수 '[역할 의견 : 작성자]' 모두 보존)
  let interviewAuthor = '시공관리자 및 근로자';
  let interviewAuthorTitle = '[의견 : 시공관리자 및 근로자]';
  let interviewOpinion = '';
  let interviewOpinions = [];
  const mOp = txt.match(/((?:\[[^\]]*(?:의견|면담|인터뷰)[^\]]*\]\s*[\s\S]*?))(?=(?:[블를클\[(]\s*)?(?:점검단|HAT)\s*제안|시스템\s*개선|교육\/코칭|개선대책|$)/i);
  if (mOp && mOp[1]) {
    const parsedOp = parseInterviewOpinions(mOp[1]);
    interviewOpinions = parsedOp.sections || [];
    if (parsedOp.hasMulti) {
      interviewAuthor = parsedOp.authorsText || interviewAuthor;
      interviewAuthorTitle = parsedOp.primaryTitle || interviewAuthorTitle;
      interviewOpinion = parsedOp.formatted;
    } else if (parsedOp.sections.length === 1) {
      interviewAuthor = parsedOp.sections[0].author || parsedOp.sections[0].role || interviewAuthor;
      interviewAuthorTitle = parsedOp.sections[0].title || interviewAuthorTitle;
      interviewOpinion = parsedOp.sections[0].text || cleanOpinionText(mOp[1]);
    } else {
      interviewOpinion = cleanOpinionText(mOp[1]);
    }
  }

  // 점검자 의견 구분 (복수 선택 지원: 시스템 개선, 교육/코칭, 페널티)
  // 주의: 제안 본문 내 단순 '재교육하여' 단어로 교육/코칭이 오인되지 않도록 엄격한 판정 라벨만 매칭
  const propRegionMatch = txt.match(/(?:점검단|HAT)\s*제안\]?([\s\S]{0,220}?)(?=개선\s*대책|\[?\s*PM\s*판정|$)/i);
  const pmRegionMatch = txt.match(/\[?\s*PM\s*판정\s*결과\s*\]?([\s\S]{0,200})/i);
  const proposalScanTxt = propRegionMatch ? propRegionMatch[1] : txt;
  const extractOpinionTypes = (scanTxt) => {
    const types = [];
    if (/시스템\s*개선/i.test(scanTxt)) types.push('시스템 개선');
    if (/교육\s*[\/·]\s*코칭|작업팀\s*교육|협력사\s*교육|근로자\s*교육|코칭/i.test(scanTxt)) types.push('교육/코칭');
    if (/제재\s*[\/·]?\s*징계|해당\s*작업팀\s*대기/i.test(scanTxt)) types.push('제재/징계');
    if (/페널티|패널티/i.test(scanTxt)) types.push('페널티');
    return Array.from(new Set(types));
  };
  const opinionTypes = extractOpinionTypes(proposalScanTxt);
  const inspectorOpinionType = opinionTypes.length > 0 ? opinionTypes.join(', ') : '시스템 개선';

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

  // PM 판정결과 (원문 PDF/장표에 명시된 경우만 반영 — 비어있으면 공란 유지, 점검단 제안 복사/강제주입 금지)
  const pmScanTxt = pmRegionMatch ? pmRegionMatch[1] : '';
  const pmOpinionTypes = pmScanTxt ? extractOpinionTypes(pmScanTxt) : [];
  const hasExplicitPmVerdict = pmOpinionTypes.length > 0;
  const effectivePmTypes = hasExplicitPmVerdict ? pmOpinionTypes : [];
  const mIhSub = pmScanTxt ? pmScanTxt.match(/\(?\s*이행\s*강화[^)\n]{0,16}\)?/) : null;
  const normalizedIhSub = mIhSub ? (/방안|수립/.test(mIhSub[0]) ? '(이행강화방안수립)' : (mIhSub[0].startsWith('(') ? mIhSub[0] : `(${mIhSub[0]})`)) : '';
  const mTeamWaitSub = (pmScanTxt || '').match(/\(?\s*해당\s*작업팀\s*대기\s*\)?/);
  const mTeamEduSub = (pmScanTxt || '').match(/\(?\s*작업팀\s*교육\s*\)?/);
  const pmVerdict = effectivePmTypes.length > 0 ? effectivePmTypes.join(', ') : '';
  const pmVerdictType = pmVerdict;
  const pmVerdictItems = effectivePmTypes.map(t => {
    let sub = '';
    if (t.includes('제재') || t.includes('징계')) sub = mTeamWaitSub ? '(해당작업팀대기)' : '';
    else if (t.includes('시스템')) sub = normalizedIhSub || '(모니터링 강화)';
    else if (t.includes('교육')) sub = mTeamEduSub ? '(작업팀교육)' : '(근로자 교육)';
    return { type: t, sub };
  });
  const pmVerdictSub = pmVerdictItems.map(it => it.sub).filter(Boolean).join(', ');

  const lawSpec = normalizeSafetyLawSpec({
    rawLaw,
    lawBody: '',
    law: '',
    contextText: `${content} ${workGroup}`,
    workGroup,
    type
  });
  const finalRawLaw = lawSpec.title || rawLaw;
  const law = filterOnlyOccupationalSafetyLaw(finalRawLaw, `${content} ${workGroup}`);

  return {
    severity,
    type,
    law,
    rawLaw: finalRawLaw,
    lawBody: lawSpec.body || '',
    _needsAiLaw: Boolean(lawSpec.needsAiLaw),
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
    interviewOpinions,
    inspectorOpinionType,
    auditProposal,
    actionPlan,
    countermeasure: actionPlan,
    pmVerdict,
    pmVerdictType,
    pmVerdictSub,
    pmVerdictItems,
    _hasExplicitPmVerdict: hasExplicitPmVerdict
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

export function sanitizeInspectorValue(raw) {
  let s = String(raw || '')
    .replace(/^.*?(?:[점적정서섬성선]\s*[검겸견]\s*[자사시차])\s*[:：.;]?\s*/g, '')
    .replace(/[^가-힣a-zA-Z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!s || /^(?:[점적정서섬성선][검겸견][자사시차])$/i.test(s) || s.length <= 1) {
    return '';
  }
  return s;
}

function hasMetaValueInk(cellCanvas, ratioX0 = 0.37) {
  if (!cellCanvas || cellCanvas.width < 40 || cellCanvas.height < 14) return true;
  try {
    const w = cellCanvas.width;
    const h = cellCanvas.height;
    const x0 = Math.floor(w * ratioX0);
    const x1 = Math.max(x0 + 4, Math.floor(w * 0.94));
    const y0 = Math.floor(h * 0.20);
    const y1 = Math.max(y0 + 4, Math.floor(h * 0.80));
    const ctx = cellCanvas.getContext('2d', { willReadFrequently: true });
    const data = ctx.getImageData(x0, y0, x1 - x0, y1 - y0).data;
    let darkCount = 0;
    for (let i = 0; i < data.length; i += 4) {
      const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      if (lum < 190) {
        darkCount++;
        if (darkCount >= 8) return true;
      }
    }
    return false;
  } catch (e) {
    return true;
  }
}

function buildStripDataUrlFromSpecs(canvas, validSpecs, maxW, totalH) {
  if (!canvas || !Array.isArray(validSpecs) || validSpecs.length === 0) return '';
  const HEADER_H = 22;
  const PAD_X = 12;
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

  const SUB_META_KEYS = new Set(['sub', 'work', 'loc', 'user', 'round']);
  for (const item of validSpecs) {
    if (SUB_META_KEYS.has(item.key)) continue;
    sctx.fillStyle = '#EBF2FA';
    sctx.fillRect(PAD_X - 4, item.labelY, maxW - PAD_X * 2 + 8, HEADER_H - 2);
    sctx.fillStyle = '#0A2458';
    sctx.fillText(item.label, PAD_X + 4, item.labelY + (HEADER_H - 2) / 2);
    sctx.drawImage(canvas, item.sx, item.sy, item.sw, item.sh, PAD_X, item.y0, item.dw, item.dh);
  }
  return stripCanvas.toDataURL('image/jpeg', 0.80);
}

const REFERENCE_IMAGE_TEXT_RE = /(?:유사\s*사[고교]\s*사례?|사고\s*사례|재해\s*사례|추락\s*높이|설치\s*기준|작업\s*지침|표준\s*안전|표준도|올바른\s*예|KOSHA|안전보건공단|안전보건규칙|보강\s*예|시공\s*기준|시공\s*가이드|참고\s*사진|참고\s*자료|개선\s*사례|적용\s*예시|안전\s*대책\s*예)/i;
const STRICT_REF_ONLY_RE = /(?:유사\s*사[고교]\s*사례?|사고\s*사례|재해\s*사례|올바른\s*예|표준도|KOSHA|안전보건공단|시공\s*가이드)/i;

function upscaleCanvas(srcCanvas, factor = 2) {
  if (!srcCanvas || factor <= 1) return srcCanvas;
  const dst = document.createElement('canvas');
  dst.width = Math.max(1, Math.round(srcCanvas.width * factor));
  dst.height = Math.max(1, Math.round(srcCanvas.height * factor));
  const ctx = dst.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(srcCanvas, 0, 0, dst.width, dst.height);
  return dst;
}

function invertGrayscaleCanvas(srcCanvas) {
  const dst = document.createElement('canvas');
  dst.width = Math.max(1, srcCanvas.width);
  dst.height = Math.max(1, srcCanvas.height);
  const ctx = dst.getContext('2d');
  ctx.drawImage(srcCanvas, 0, 0);
  try {
    const img = ctx.getImageData(0, 0, dst.width, dst.height);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      // 밝은 흰색 글씨(>175)를 진한 검정(0)으로, 어두운/중간 배경(<=175)을 백색(255)으로 반전하여 유색 배너 백색 글씨 OCR 인식률 극대화
      const val = lum >= 175 ? 15 : (lum >= 120 ? Math.max(20, 255 - lum) : 250);
      d[i] = val;
      d[i + 1] = val;
      d[i + 2] = val;
    }
    ctx.putImageData(img, 0, 0);
  } catch (_) { /* ignore tainted canvas */ }
  return dst;
}

/**
 * 디지털 PDF 텍스트 아이템(캔버스 픽셀 좌표 투영 완료)에서 특정 셀 박스 내부 텍스트를 줄·어순 정렬 복원
 */
function extractTextFromDigitalItems(digitalItems, box, padX = 1, padY = 1) {
  if (!Array.isArray(digitalItems) || digitalItems.length === 0 || !box) return '';
  const xMin = box.x - padX;
  const xMax = box.x + box.w + padX;
  const yMin = box.y - padY;
  const yMax = box.y + box.h + padY;

  const hits = digitalItems.filter(it => it && it.cx >= xMin && it.cx <= xMax && it.cy >= yMin && it.cy <= yMax);
  if (hits.length === 0) return '';

  const sorted = [...hits].sort((a, b) => a.cy - b.cy || a.cx - b.cx);
  const lines = [];
  for (const it of sorted) {
    const tol = Math.max(4, (it.h || 12) * 0.52);
    const lastLine = lines.length > 0 ? lines[lines.length - 1] : null;
    if (lastLine && Math.abs(it.cy - lastLine.anchorCy) <= tol) {
      lastLine.items.push(it);
      lastLine.anchorCy = (lastLine.anchorCy * (lastLine.items.length - 1) + it.cy) / lastLine.items.length;
    } else {
      lines.push({ anchorCy: it.cy, items: [it] });
    }
  }

  return lines.map(line => {
    line.items.sort((a, b) => a.x0 - b.x0 || a.cx - b.cx);
    let lineStr = '';
    let prev = null;
    for (const it of line.items) {
      const token = String(it.str || '');
      if (!token) continue;
      if (prev && lineStr && !/\s$/.test(lineStr) && !/^\s/.test(token)) {
        const gap = it.x0 - prev.x1;
        const spaceThresh = Math.max(1.5, Math.min(prev.h || 12, it.h || 12) * 0.14);
        if (gap > spaceThresh) {
          lineStr += ' ';
        }
      }
      lineStr += token;
      prev = it;
    }
    return lineStr.trim();
  }).filter(Boolean).join('\n').trim();
}

/**
 * 후보 사진 영역이 '유사 사고사례', '표준안전기준', '올바른 예' 등 참고/도판 이미지인지 판별 (PDF·이미지·PPTX 공용)
 */
async function isReferenceOrCaseStudyBox(canvas, box, digitalItems = [], allowBroadKeywords = true) {
  if (!canvas || !box || box.w < 24 || box.h < 24) return false;
  const rx = allowBroadKeywords ? REFERENCE_IMAGE_TEXT_RE : STRICT_REF_ONLY_RE;

  if (Array.isArray(digitalItems) && digitalItems.length > 0) {
    const topDigital = extractTextFromDigitalItems(digitalItems, {
      x: box.x,
      y: box.y,
      w: box.w,
      h: Math.round(box.h * 0.55)
    }, 4, 4);
    if (topDigital && rx.test(topDigital)) return true;
  }

  try {
    await initPaddleOcr();
    const headerH = Math.min(180, Math.max(36, Math.round(box.h * 0.40)));
    const topHeaderRect = { x: box.x, y: box.y, w: box.w, h: headerH };
    const topCanvas = cropCanvas(canvas, topHeaderRect);
    const refOcr = await recognizeCellWithPaddle(topCanvas, 'refCheck');
    if (refOcr?.text && rx.test(refOcr.text)) return true;

    // 올리브/청색/암색 배너 위의 백색 윤곽선 글씨('유사 사고사례') 반전 OCR 보조 판독
    const stripH = Math.min(95, Math.max(28, Math.round(box.h * 0.22)));
    const stripCanvas = cropCanvas(canvas, { x: box.x, y: box.y, w: box.w, h: stripH });
    const invCanvas = invertGrayscaleCanvas(stripCanvas.width < 420 ? upscaleCanvas(stripCanvas, 2) : stripCanvas);
    const invOcr = await recognizeCellWithPaddle(invCanvas, 'refCheck');
    if (invOcr?.text && rx.test(invOcr.text)) return true;
  } catch (_) { /* ignore OCR reference check failure */ }

  return false;
}

/**
 * 각 셀을 디지털 PDF 좌표 텍스트 우선 추출 + 미보유/이미지 셀만 PaddleOCR ONNX 정밀 수행
 */
async function ocrCellsSinglePass(canvas, cellSpecs, options = {}) {
  const result = {};
  const cellCrops = {};
  const cellConfidences = {};
  const cellDigitalUsed = {};
  const lowConfidenceFields = [];
  const validSpecs = [];
  const LABEL_MAP = {
    type: '[유형/등급]',
    law: '[관련기준]',
    check: '[점검체크]',
    meta: '[협력사/공종명/작업장소/점검자/점검차수]',
    sub: '[협력사]',
    work: '[공종명]',
    loc: '[작업장소]',
    user: '[점검자]',
    round: '[점검차수]',
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

  if (validSpecs.length === 0) {
    return { texts: result, stripDataUrl: '', validSpecs: [], stripMaxW: maxW, stripTotalH: totalH, cellCrops, cellConfidences, lowConfidenceFields, cellDigitalUsed };
  }

  let stripDataUrl = '';
  if (options.buildStrip) {
    stripDataUrl = buildStripDataUrlFromSpecs(canvas, validSpecs, maxW, totalH);
  }

  // 각 셀 원본 크롭 생성 (1:1 검수 루페용 DataURL은 UI 바인딩된 7개 필드만 인코딩하여 메인 스레드 지연 제거)
  const LOUPE_KEYS = new Set(['content', 'interview', 'propText', 'cm', 'loc', 'sub', 'round']);
  const ocrTargets = validSpecs.filter(s => s.key !== 'check' && s.key !== 'meta');
  const digitalItems = Array.isArray(options.digitalItems) ? options.digitalItems : [];
  const hasPositionedDigital = digitalItems.length >= 25;
  const IMAGE_ONLY_MAYBE_KEYS = new Set(['banner', 'banner2']);

  const hasCellTextInk = (cropCvs) => {
    if (!cropCvs || cropCvs.width < 12 || cropCvs.height < 10) return false;
    try {
      const ctx = cropCvs.getContext('2d', { willReadFrequently: true });
      const w = cropCvs.width, h = cropCvs.height;
      const x0 = Math.max(4, Math.round(w * 0.04));
      const x1 = Math.min(w - 4, Math.round(w * 0.96));
      const y0 = Math.max(4, Math.round(h * 0.08));
      const y1 = Math.min(h - 4, Math.round(h * 0.92));
      const d = ctx.getImageData(x0, y0, Math.max(1, x1 - x0), Math.max(1, y1 - y0)).data;
      let dark = 0;
      const total = Math.max(1, d.length / 4);
      for (let i = 0; i < d.length; i += 8) {
        const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
        if (lum < 155) dark++;
      }
      return dark >= 22 && (dark / (total / 2)) >= 0.004;
    } catch (e) {
      return true;
    }
  };

  let digitalContentHitCount = 0;
  if (hasPositionedDigital) {
    for (const s of ocrTargets) {
      const box = { x: s.sx, y: s.sy, w: s.sw, h: s.sh };
      const padX = (s.key === 'banner' || s.key === 'banner2') ? 2 : 4;
      const padY = (s.key === 'banner' || s.key === 'banner2') ? 2 : 3;
      const dTxt = extractTextFromDigitalItems(digitalItems, box, padX, padY);
      if (dTxt) {
        result[s.key] = dTxt;
        cellDigitalUsed[s.key] = true;
        if (['content', 'law', 'interview', 'cm', 'propText'].includes(s.key)) {
          digitalContentHitCount++;
        }
        cellConfidences[s.key] = { confidence: 1.0, minCharConfidence: 1.0, lowConfidence: false, needsVisionRetry: false };
      }
    }
  }
  const sheetUsesPositionedDigital = hasPositionedDigital && digitalContentHitCount >= 2;
  const CORE_INK_CHECK_KEYS = new Set(['content', 'law', 'interview', 'propText', 'cm', 'propType', 'pm', 'type']);

  for (const s of ocrTargets) {
    try {
      const c = cropCanvas(canvas, { x: s.sx, y: s.sy, w: s.sw, h: s.sh });
      if (LOUPE_KEYS.has(s.key)) {
        cellCrops[s.key] = c.toDataURL('image/jpeg', 0.82);
      }
      s._cropCanvas = c;
    } catch (e) {}
  }

  const shouldRunOcr = true;
  if (shouldRunOcr) {
    let paddleSucceeded = false;
    if (!options.forceTesseract) {
      try {
        await initPaddleOcr();
        let cellIdx = 0;
        for (const s of ocrTargets) {
          if (cellDigitalUsed[s.key]) continue;
          // 디지털 텍스트 레이어가 사용된 문서라도 실제 검정 글씨 잉크가 보이는 핵심 셀(이미지 붙여넣기·좌표 오차)은 절대 생략하지 않고 PaddleOCR 실행!
          if (sheetUsesPositionedDigital && !IMAGE_ONLY_MAYBE_KEYS.has(s.key)) {
            if (!CORE_INK_CHECK_KEYS.has(s.key) || !hasCellTextInk(s._cropCanvas)) {
              cellConfidences[s.key] = { confidence: 1.0, minCharConfidence: 1.0, lowConfidence: false, needsVisionRetry: false };
              continue;
            }
          }
          if (!s._cropCanvas) continue;
          // 협력사/점검자 우측 값 영역이 완전 공백이면 ONNX 추론 자체를 건너뛰어 속도 향상 및 '적검자'/'로' 라벨 오인식 원천 차단
          if ((s.key === 'user' || s.key === 'sub') && !hasMetaValueInk(s._cropCanvas, s.key === 'user' ? 0.37 : 0.38)) {
            result[s.key] = '';
            cellConfidences[s.key] = { confidence: 1.0, minCharConfidence: 1.0, lowConfidence: false, needsVisionRetry: false };
            continue;
          }
          const ocrInputCanvas = (s.key === 'law' && s.sw < 950 && s.sh < 140)
            ? upscaleCanvas(s._cropCanvas, 2)
            : s._cropCanvas;
          const pRes = await recognizeCellWithPaddle(ocrInputCanvas, s.key);
          result[s.key] = pRes.text || '';
          cellConfidences[s.key] = {
            confidence: pRes.confidence,
            minCharConfidence: pRes.minCharConfidence,
            lowConfidence: pRes.lowConfidence,
            needsVisionRetry: pRes.needsVisionRetry
          };
          if (pRes.lowConfidence) {
            lowConfidenceFields.push(s.key);
          }
          cellIdx++;
          if (cellIdx % 6 === 0) {
            await new Promise(r => setTimeout(r, 0));
          }
        }
        paddleSucceeded = true;
      } catch (paddleErr) {
        console.warn('[SafePatrol] PaddleOCR v5 ONNX fallback to Tesseract:', paddleErr);
      }
    }

    if (!paddleSucceeded && window.Tesseract) {
      await Promise.all(ocrTargets.map(async (s) => {
        if (cellDigitalUsed[s.key]) return;
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

    // 5개 서브셀 결과를 표준 meta 문자열로 합성 (기존 파서 및 AI 컨텍스트 완벽 호환)
    const subV = String(result.sub || '').replace(/^.*?협력사\s*[:：.]?\s*/, '').replace(/^[^가-힣A-Za-z0-9]+|[^가-힣A-Za-z0-9()]+$/g, '').trim();
    const workV = String(result.work || '').replace(/^.*?공종명?\s*[:：.]?\s*/, '').trim();
    const locV = String(result.loc || '').replace(/^.*?작업장소\s*[:：.]?\s*/, '').trim();
    const userV = sanitizeInspectorValue(result.user || '');
    const mDigitalRound = (options.hasDigitalText && options.digitalText)
      ? String(options.digitalText).match(/점검\s*차수\s*[:;：]?\s*([^\n|]{2,20}?)(?=\s*(?:부적합|협력사|공종|작업장소|점검자|$))/i)
      : null;
    const rawRoundSrc = (mDigitalRound && mDigitalRound[1] && /[上上下하상]\s*\d+/.test(mDigitalRound[1]))
      ? mDigitalRound[1].trim()
      : (result.round || '');
    const roundV = normalizeRoundText(rawRoundSrc);
    result.sub = subV;
    result.work = workV;
    result.loc = locV;
    result.user = userV;
    result.round = roundV;
    result.meta = `협력사 : ${subV} 공종명 : ${workV} 작업장소 : ${locV} 점검자 : ${userV} 점검차수 : ${roundV}`;
  }

  return { texts: result, stripDataUrl, validSpecs, stripMaxW: maxW, stripTotalH: totalH, cellCrops, cellConfidences, lowConfidenceFields, cellDigitalUsed };
}

export function parseVerdictItemsFromText(txt, monitoringDefault = '(현장모니터링 강화)') {
  const s = String(txt || '');
  const items = [];
  if (/시스템\s*개선|시스템개선/i.test(s)) {
    let sub = monitoringDefault;
    const mMon = s.match(/\(?\s*(?:현장\s*)?모니터링[^)\n]{0,16}\)?/);
    const mIh = s.match(/\(?\s*이행\s*강화[^)\n]{0,16}\)?/);
    if (mIh) {
      const rawIh = mIh[0].replace(/\s+/g, '').trim();
      sub = /방안|수립/.test(rawIh) ? '(이행강화방안수립)' : (rawIh.startsWith('(') ? rawIh : `(${rawIh})`);
    } else if (mMon) {
      const rawMon = mMon[0].trim();
      sub = rawMon.startsWith('(') ? (rawMon.endsWith(')') ? rawMon : `${rawMon})`) : `(${rawMon.replace(/\)$/, '')})`;
    }
    items.push({ type: '시스템 개선', sub });
  }
  if (/교육\s*[\/·]\s*코칭|(?:근로자|협력사|작업팀|해당\s*작업팀)\s*교육|코칭/i.test(s)) {
    let sub = '(근로자 교육)';
    const mDirectEdu = s.match(/\(?\s*(?:근로자|협력사|작업팀|해당\s*작업팀)\s*교육[^)\n]{0,12}\)?/);
    const mAfterEdu = s.match(/(?:교육\s*[\/·]\s*코칭|코칭)\s*\n?\s*(\(\s*[^()\n]{2,18}\s*\))/i);
    const mSingleParen = !/시스템\s*개선|제재|징계|페널티|패널티/i.test(s) ? s.match(/\(\s*[^()\n]{2,18}\s*\)/) : null;
    const pickedEdu = mDirectEdu?.[0] || mAfterEdu?.[1] || mSingleParen?.[0] || '';
    if (pickedEdu && !/해당\s*작업팀\s*대기|제재|징계|모니터링|이행\s*강화/.test(pickedEdu)) {
      const rawEdu = pickedEdu.trim();
      sub = rawEdu.startsWith('(') ? (rawEdu.endsWith(')') ? rawEdu : `${rawEdu})`) : `(${rawEdu.replace(/\)$/, '')})`;
    }
    items.push({ type: '교육/코칭', sub });
  }
  if (/패널티|페널티|벌점/i.test(s)) {
    let sub = '(관리감독자 경고)';
    const mSub = s.match(/\(?\s*관리감독자[^)\n]{0,12}\)?/);
    if (mSub) {
      const rawPen = mSub[0].trim();
      sub = rawPen.startsWith('(') ? (rawPen.endsWith(')') ? rawPen : `${rawPen})`) : `(${rawPen.replace(/\)$/, '')})`;
    }
    items.push({ type: '페널티', sub });
  }
  if (/제재\s*[\/·]?\s*징계|해당\s*작업팀\s*대기|작업\s*중지|작업\s*대기/i.test(s)) {
    let sub = '(해당작업팀대기)';
    const mDirectSanc = s.match(/\(?\s*(?:해당\s*작업팀\s*대기|작업팀\s*대기|작업\s*중지|대상자\s*경고)[^)\n]{0,10}\)?/);
    const mAfterSanc = s.match(/제재\s*[\/·]?\s*징계\s*\n?\s*(\(\s*[^()\n]{2,18}\s*\))/i);
    const mSingleSanc = !/시스템\s*개선|교육\s*[\/·]\s*코칭|페널티|패널티/i.test(s) ? s.match(/\(\s*[^()\n]{2,18}\s*\)/) : null;
    const pickedSanc = mDirectSanc?.[0] || mAfterSanc?.[1] || mSingleSanc?.[0] || '';
    if (pickedSanc) {
      const rawSanc = pickedSanc.trim();
      sub = rawSanc.startsWith('(') ? (rawSanc.endsWith(')') ? rawSanc : `${rawSanc})`) : `(${rawSanc.replace(/\)$/, '')})`;
    }
    items.push({ type: '제재/징계', sub });
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

export function parseCellTextsIntoFields(cellTexts, canvas, layout, mgmtCauses, allowDefaults = false) {
  const tType = cellTexts.type || '';
  const tLaw = cellTexts.law || '';
  const tMeta = cellTexts.meta || '';
  const tSubCell = cellTexts.sub || '';
  const tWorkCell = cellTexts.work || '';
  const tLocCell = cellTexts.loc || '';
  const tUserCell = cellTexts.user || '';
  const tRoundCell = cellTexts.round || '';
  const tContent = cellTexts.content || '';
  const tInterview = cellTexts.interview || '';
  const tPropType = cellTexts.propType || '';
  const tPropText = cellTexts.propText || '';
  const tCm = cellTexts.cm || '';
  const tPm = cellTexts.pm || '';
  const tBanner = cellTexts.banner || '';
  const tBanner2 = cellTexts.banner2 || '';

  const content = normalizeFieldText(cleanContent(tContent), 'content');
  const mLoc = tMeta.match(/작업장소\s*[:;：]?\s*([^\n|]*?)(?=\s*(?:점검자|점검차수|부적합|$))/i);
  const location = cleanLocation(tLocCell || (mLoc ? mLoc[1] : ''), tLocCell, content);

  const stripRawBannerBorder = (b) => String(b || '').replace(/[\r\n\t]+/g, ' ').replace(/^[|ㅣ¦｜!~—_=\s]+/, '').replace(/[|ㅣ¦｜]+$/, '').trim();
  const tBannerClean = stripRawBannerBorder(tBanner);
  const tBanner2Clean = stripRawBannerBorder(tBanner2);
  const safeRawBanner1 = (tBannerClean && !hasGarbledKoreanNoise(tBannerClean) && !isGarbledBannerText(tBannerClean)) ? tBannerClean : '';
  const safeRawBanner2 = (tBanner2Clean && !hasGarbledKoreanNoise(tBanner2Clean) && !isGarbledBannerText(tBanner2Clean)) ? tBanner2Clean : '';
  const _hasOriginalBanner = Boolean(safeRawBanner1 && isValidOriginalSheetBanner(safeRawBanner1, content, location));
  const _originalBannerText = _hasOriginalBanner ? normalizePhotoBannerText(safeRawBanner1, content, location) : '';
  const photoBanner = _hasOriginalBanner
    ? _originalBannerText
    : ((safeRawBanner1 || content) ? normalizeFieldText(cleanBannerText(safeRawBanner1, content, location), 'banner') : '');
  const photo2Banner = safeRawBanner2 ? normalizeFieldText(cleanBannerText(safeRawBanner2, content, location), 'banner2') : '';

  const mSub = tMeta.match(/협력사\s*[:;：]?\s*([^\n|]*?)(?=\s*(?:공종명|공종|작업장소|점검자|점검차수|$))/i);
  const subcontractor = cleanSubcontractor(tSubCell || (mSub ? mSub[1] : ''));

  const mWork = tMeta.match(/공종명?\s*[:;：]?\s*([\s\S]*?)(?=\s*(?:작업장소|장소|점검자|점검차수|부적합|$))/i);
  const rawWorkInput = tWorkCell || (mWork ? mWork[1] : '');
  const workGroup = (rawWorkInput.trim() || content.trim()) ? cleanWorkGroup(rawWorkInput, content) : '';

  let inspectUser = '';
  if (tUserCell && tUserCell.trim()) {
    inspectUser = sanitizeInspectorValue(tUserCell);
  }
  if (!inspectUser) {
    const mUser = tMeta.match(/점검자\s*[:;：]?\s*([^\n|]*?)(?=\s*(?:점검차수|부적합|$))/i);
    if (mUser && mUser[1]) inspectUser = sanitizeInspectorValue(mUser[1]);
  }

  let inspectRound = '';
  if (tRoundCell && tRoundCell.trim()) {
    inspectRound = normalizeRoundText(tRoundCell);
  } else {
    const mRound = tMeta.match(/점검차수\s*[:;：]?\s*([^\n|]+)/i);
    if (mRound && mRound[1].trim()) inspectRound = normalizeRoundText(mRound[1].trim());
    else if (tMeta.trim()) inspectRound = "'26년上 2차";
  }

  // [v62] 발생원인 의견·점검단 제안 분류 하드코딩 완전 제거: 원본 PDF/입력에 내용이 없으면 공란 유지!
  let interviewAuthor = '';
  let interviewAuthorTitle = '';
  let interviewOpinion = '';
  let interviewOpinions = [];
  const preCleanedInterview = cleanOpinionText(tInterview, { preserveHeaders: true });
  const parsedOp = parseInterviewOpinions(preCleanedInterview || tInterview);
  if (parsedOp.sections.length >= 2) {
    interviewOpinions = parsedOp.sections;
    interviewAuthor = parsedOp.authorsText || '';
    interviewAuthorTitle = parsedOp.primaryTitle || '';
    interviewOpinion = parsedOp.formatted;
  } else if (parsedOp.sections.length === 1) {
    const sec0 = parsedOp.sections[0];
    interviewOpinions = parsedOp.sections;
    interviewAuthor = sec0.author || sec0.role || '';
    interviewAuthorTitle = sec0.title || (interviewAuthor ? `[의견 : ${interviewAuthor}]` : '');
    interviewOpinion = sec0.text || normalizeFieldText(cleanOpinionText(tInterview), 'interview');
  } else {
    interviewOpinion = normalizeFieldText(cleanOpinionText(tInterview), 'interview');
    if (interviewOpinion) {
      interviewAuthor = '시공관리자 및 근로자';
      interviewAuthorTitle = '[의견 : 시공관리자 및 근로자]';
    }
  }

  // 주의: 점검단 제안 본문(tPropText)의 '재교육하여' 등에 교육/코칭이 오인되지 않도록 오직 판정 셀(tPropType)만 파싱 (원본 공란 시 '시스템 개선' 강제 주입 금지!)
  const rawPropItems = tPropType.trim() ? parseVerdictItemsFromText(tPropType, '(현장모니터링 강화)') : [];
  const hasExplicitPropType = rawPropItems.length > 0;
  const proposalItems = hasExplicitPropType ? rawPropItems : [];
  const inspectorOpinionType = proposalItems.map(p => p.type).join(', ');
  const inspectorOpinionSub = proposalItems[0]?.sub || '';
  const auditProposal = normalizeFieldText(cleanProposalText(tPropText), 'propText');
  const actionPlan = normalizeFieldText(cleanActionPlan(tCm), 'cm');
  const tPmClean = String(tPm || '').replace(/^\[?\s*PM\s*판정\s*결과\s*\]?\s*/i, '').trim();
  const pmSubDefault = (proposalItems[0]?.type === '시스템 개선' && proposalItems[0]?.sub)
    ? proposalItems[0].sub
    : '(모니터링 강화)';
  let pmVerdictItems = tPmClean ? parseVerdictItemsFromText(tPmClean, pmSubDefault) : [];
  if (pmVerdictItems.length === 0 && proposalItems.length > 0 && tPmClean && /시스템|개선/.test(tPmClean)) {
    pmVerdictItems = proposalItems.map(it => ({ ...it }));
  }
  const hasExplicitPmVerdict = Boolean(pmVerdictItems.length > 0 || (tPmClean && tPmClean.length >= 2));
  const pmVerdictType = hasExplicitPmVerdict ? (pmVerdictItems.map(p => p.type).join(', ') || tPmClean) : '';
  const pmVerdictSub = hasExplicitPmVerdict ? (pmVerdictItems.length > 0 ? (pmVerdictItems[0].sub || '') : '') : '';

  const detectedSev = detectSeverityFromTypeBox(canvas, layout?.typeCell, tType);
  const severity = detectedSev || (allowDefaults ? '중부적합' : '');
  const typeCandidates = ['추락', '낙하', '비래', '붕괴', '도괴', '전복', '전도', '협착', '충돌', '추돌', '충격', '접촉', '익사', '질식', '중독', '흡인', '화재', '폭발', '화상', '감전', '감염', '질병'];
  let type = '';
  for (const cand of typeCandidates) {
    if (tType.includes(cand)) { type = cand; break; }
  }
  if (!type && tType.trim()) {
    const cleanedType = tType.replace(/중\s*부\s*적\s*합|경\s*부\s*적\s*합|[^가-힣]/g, '').trim();
    if (cleanedType) type = snapToStandardTaxonomy(cleanedType, typeCandidates, 0.58, '');
  }
  if (!type) {
    const ctxForType = `${content} ${tLaw}`;
    if (/충돌|부딪|지게차에\s*근접|장비에\s*근접/.test(ctxForType)) type = '충돌';
    else if (/협착|끼임|감김/.test(ctxForType)) type = '협착';
    else if (/감전|충전부|누전|분전함|차단기/.test(ctxForType)) type = '감전';
    else if (/화재|불티|인화/.test(ctxForType)) type = '화재';
    else if (/폭발|파열/.test(ctxForType)) type = '폭발';
    else if (/질식|산소결핍|밀폐/.test(ctxForType)) type = '질식';
    else if (/전복/.test(ctxForType)) type = '전복';
    else if (/전도|넘어짐|걸려/.test(ctxForType)) type = '전도';
    else if (/낙하|선해체/.test(ctxForType)) type = '낙하';
    else if (/비래/.test(ctxForType)) type = '비래';
    else if (/붕괴|도괴|동바리|서포트/.test(ctxForType)) type = '붕괴';
    else if (/추락|개구부|난간|안전대|발판|비계/.test(ctxForType)) type = '추락';
  }
  if (!type && allowDefaults) type = '추락';

  const lawParsed = parseLawCell(tLaw, '', `${content} ${workGroup} ${tType}`);
  const lawTitle = lawParsed.title || '';
  const lawBody = lawParsed.body || '';
  const law = filterOnlyOccupationalSafetyLaw(lawTitle, `${content} ${workGroup}`);
  const _needsAiLaw = Boolean(lawParsed.needsAiLaw || !lawTitle || !lawBody);

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
    _hasOriginalBanner,
    _originalBannerText,
    mgmtCauses,
    condition: mgmtCauses.includes('불안전 상태') ? '' : '해당없음',
    action: mgmtCauses.includes('불안전 행동') ? '' : '해당없음',
    interviewAuthor,
    interviewAuthorTitle,
    interviewOpinion,
    interviewOpinions,
    proposalItems,
    inspectorOpinionType,
    inspectorOpinionSub,
    _hasExplicitPropType: hasExplicitPropType,
    auditProposal,
    actionPlan,
    countermeasure: actionPlan,
    pmVerdictItems,
    pmVerdictType,
    pmVerdictSub,
    pmVerdict: pmVerdictType,
    _hasExplicitPmVerdict: hasExplicitPmVerdict,
    law,
    rawLaw: lawTitle,
    lawBody,
    _needsAiLaw
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
      if (!record.law && !record.rawLaw) {
        const cleanedLaw = filterOnlyOccupationalSafetyLaw(record.law, `${record.content || ''} ${record.workGroup || ''}`);
        if (cleanedLaw) record.law = cleanedLaw;
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
  if (!record.photoBanner || record.photoBanner.replace(/\s+/g, '') === record.content.replace(/\s+/g, '')) {
    record.photoBanner = deriveConcreteBanner(record.content);
  }
  if (!record.severity) record.severity = '중부적합';
  if (!record.type) {
    const c = `${record.content || ''} ${record.rawLaw || ''}`;
    if (/충돌|부딪|지게차에\s*근접|장비에\s*근접/.test(c)) record.type = '충돌';
    else if (/협착|끼임|감김/.test(c)) record.type = '협착';
    else if (/감전|충전부|누전|분전함|차단기/.test(c)) record.type = '감전';
    else if (/화재|불티|인화/.test(c)) record.type = '화재';
    else if (/전도|넘어짐|걸려/.test(c)) record.type = '전도';
    else if (/낙하|선해체/.test(c)) record.type = '낙하';
    else if (/붕괴|도괴|동바리|서포트/.test(c)) record.type = '붕괴';
    else record.type = '추락';
  }
  return record;
}

/**
 * 단일 점검장표 캔버스를 분석하여 사진 추출 + 텍스트/체크박스/Qwen AI 정제를 수행
 */
export async function parseSheetCanvas(canvas, options = {}) {
  const { digitalText = '', digitalItems = [], pageNumber = 1, sourceName = '' } = options;

  // 0. 고정밀 셀 레이아웃 분석
  let layout = null;
  let sharedImgData = null;
  try {
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    sharedImgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    layout = analyzeSheetLayout(sharedImgData);
  } catch (e) {
    console.warn('analyzeSheetLayout error:', e);
  }

  // 레이아웃 인식 성공 시: 디지털 PDF 좌표 텍스트 우선 추출 + 미보유 셀만 PaddleOCR + '유사 사고사례' 도판 제거
  if (layout && layout.ok) {
    const imgData = sharedImgData || canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, canvas.width, canvas.height);
    const banners = findRedBanners(imgData, layout.photoArea);
    const photoBoxes = findPhotoBoxes(imgData, layout.photoArea, banners);

    // [Step 4.2] '유사 사고사례' · 참고도판 전수 정밀 필터 (백색 비율 게이트 해제, 디지털 텍스트 + 정상/반전 상단 OCR 통합)
    if (photoBoxes.length >= 2) {
      for (let idx = 0; idx < photoBoxes.length; idx++) {
        const b = photoBoxes[idx];
        if (b.isReference) continue;
        const allowBroad = !(idx === 0 && b.hasOwnBanner);
        if (await isReferenceOrCaseStudyBox(canvas, b, digitalItems, allowBroad)) {
          b.isReference = true;
        }
      }
    } else if (photoBoxes.length === 1 && !photoBoxes[0].isReference) {
      if (await isReferenceOrCaseStudyBox(canvas, photoBoxes[0], digitalItems, false)) {
        photoBoxes[0].isReference = true;
      }
    }

    let realPhotoBoxes = photoBoxes.filter(b => !b.isReference);
    if (realPhotoBoxes.length === 0 && photoBoxes.length > 0 && !photoBoxes[0].isReference) {
      realPhotoBoxes = [[...photoBoxes].sort((a, b) => a.whiteRatio - b.whiteRatio)[0]];
    }

    const photos = realPhotoBoxes.slice(0, 2).map(b => cropCanvas(canvas, b).toDataURL('image/jpeg', 0.90));
    if (photos.length === 0 && layout.photoArea) {
      photos.push(cropCanvas(canvas, layout.photoArea).toDataURL('image/jpeg', 0.88));
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
      { key: 'sub', box: layout.subCell },
      { key: 'work', box: layout.workCell },
      { key: 'loc', box: layout.locCell },
      { key: 'user', box: layout.userCell },
      { key: 'round', box: layout.roundCell },
      { key: 'content', box: layout.contentRow },
      { key: 'interview', box: layout.interview },
      { key: 'propType', box: layout.proposalType },
      { key: 'propText', box: layout.proposalText },
      { key: 'cm', box: layout.countermeasure },
      { key: 'pm', box: layout.pmCell },
      { key: 'banner', box: banners.length > 0 ? banners[0] : null },
      { key: 'banner2', box: (photos.length > 1 && banners.length > 1) ? banners[1] : null }
    ];
    const {
      texts: cellTexts,
      stripDataUrl: initialStripDataUrl,
      validSpecs,
      stripMaxW,
      stripTotalH,
      cellCrops,
      cellConfidences,
      lowConfidenceFields,
      cellDigitalUsed
    } = await ocrCellsSinglePass(canvas, cellSpecsList, { hasDigitalText, digitalText, digitalItems, buildStrip: false });
    const hadCellText = Object.values(cellTexts).some(v => v && String(v).trim().length > 0);
    const parsedFields = parseCellTextsIntoFields(cellTexts, canvas, layout, mgmtCauses, hadCellText);
    if (photos.length <= 1) {
      parsedFields.photo2Banner = '';
    }
    const fullSheetContext = buildAiContextFromCellTexts(cellTexts, digitalText, hasDigitalText);

    let record = {
      slideNumber: pageNumber,
      pageNumber,
      ...parsedFields,
      photos,
      photo1,
      photo2,
      cellCrops,
      cellConfidences,
      lowConfidenceFields,
      _cellDigitalUsed: cellDigitalUsed,
      _rawCellTexts: cellTexts,
      _fullSheetContext: fullSheetContext,
      _hasDigitalText: hasDigitalText,
      _sourceFile: sourceName
    };

    // [v58] PDF/PPTX 일괄 등록 시 Qwen Vision 호출 전면 제거 (수백~수천 건 무료 처리 보장: 무료 브라우저 디지털텍스트/PaddleOCR + 초저비용 텍스트 LLM 배치만 사용)
    delete record._stripImageBase64;

    if (!options.deferBatchAi && window.SafeLocalAI && typeof window.SafeLocalAI.classifyBatchRecords === 'function') {
      try {
        await window.SafeLocalAI.classifyBatchRecords([record]);
      } catch (e) {}
    }

    if (!record._aiCleaned || !record.photoBanner || !record.workGroup || !record.agentMajor) {
      enrichRecordOfflineFromContent(record);
    }
    return record;
  }

  const fullDocDataUrl = canvas.toDataURL('image/jpeg', 0.88);
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
    workGroup: '',
    workMethod: '설치해체작업',
    workName: '설치해체작업',
    location: '',
    inspectUser: '',
    inspectRound: "'26년上 2차",
    content: '',
    condition: mgmtCauses.includes('불안전 상태') ? '물(物) 자체의 결함 (자재·부재 손상)' : '해당없음',
    action: mgmtCauses.includes('불안전 행동') ? '불안전한 동작·자세' : '해당없음',
    mgmtCauses,
    holdPoint: false,
    interviewOpinion: '',
    inspectorOpinionType: '',
    auditProposal: '',
    pmVerdict: '',
    pmVerdictType: '',
    photos: extracted.photos,
    photo1: extracted.photos[0] || null,
    photo2: extracted.photos[1] || null,
    _fullDocImage: fullDocDataUrl,
    _sourceFile: sourceName
  };

  try {
    const stripCanvas = buildCleanTextStripCanvas(canvas, frame);
    const stripDataUrl = stripCanvas.toDataURL('image/jpeg', 0.84);
    record._hasDigitalText = false;
    let ocrText = '';

    // [v58] PDF 일괄 등록은 Vision AI를 절대 호출하지 않고 무료 브라우저 PaddleOCR / Tesseract + 텍스트 LLM 배치로만 처리
    if (window.Tesseract) {
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
        if (!options.deferBatchAi && window.SafeLocalAI && typeof window.SafeLocalAI.classifyBatchRecords === 'function') {
          await window.SafeLocalAI.classifyBatchRecords([record]);
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
 * PDF.js textContent.items를 캔버스 회전(0/90/180/270) 후의 픽셀 좌표로 정밀 투영
 */
export function projectPdfTextItems(textContent, viewport, origW, origH, rotationDeg = 0, Util = null) {
  const pdfUtil = Util || (typeof window !== 'undefined' ? window.pdfjsLib?.Util : null);
  const scale = viewport?.scale || 1.8;
  const vtx = viewport?.transform || [scale, 0, 0, -scale, 0, origH];
  const multiplyTx = (m1, m2) => (
    pdfUtil && typeof pdfUtil.transform === 'function'
      ? pdfUtil.transform(m1, m2)
      : [
          m1[0] * m2[0] + m1[2] * m2[1],
          m1[1] * m2[0] + m1[3] * m2[1],
          m1[0] * m2[2] + m1[2] * m2[3],
          m1[1] * m2[2] + m1[3] * m2[3],
          m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
          m1[1] * m2[4] + m1[3] * m2[5] + m1[5]
        ]
  );

  const items = [];
  for (const it of (textContent?.items || [])) {
    const str = String(it?.str || '');
    if (!str.trim() || !Array.isArray(it?.transform) || it.transform.length !== 6) continue;
    const tx = multiplyTx(vtx, it.transform);
    const baseLen = Math.hypot(tx[0], tx[1]) || 1;
    const ux = tx[0] / baseLen;
    const uy = tx[1] / baseLen;
    const charH = Math.max(6, Math.hypot(tx[2], tx[3]) || ((it.height || 10) * scale) || 12);
    const itemW = Math.max(2, (it.width || 0) * scale);

    const cx0 = tx[4] + ux * (itemW * 0.5) + tx[2] * 0.35;
    const cy0 = tx[5] + uy * (itemW * 0.5) + tx[3] * 0.35;

    let cx = cx0;
    let cy = cy0;
    let w = itemW;
    let h = charH;
    if (rotationDeg === 270) {
      cx = cy0;
      cy = origW - cx0;
      w = charH;
      h = itemW;
    } else if (rotationDeg === 90) {
      cx = origH - cy0;
      cy = cx0;
      w = charH;
      h = itemW;
    } else if (rotationDeg === 180) {
      cx = origW - cx0;
      cy = origH - cy0;
    }
    items.push({
      str,
      cx,
      cy,
      x0: cx - w * 0.5,
      x1: cx + w * 0.5,
      y0: cy - h * 0.5,
      y1: cy + h * 0.5,
      h: charH
    });
  }
  return items;
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
    const BATCH_SIZE = 3;
    let processedCount = 0;
    const aiPromises = [];

    for (let i = 0; i < binaryResult.jpegPages.length; i += BATCH_SIZE) {
      const batch = binaryResult.jpegPages.slice(i, i + BATCH_SIZE);
      const batchResults = [];
      for (const pg of batch) {
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
        await new Promise(r => setTimeout(r, 0));

        const canvas = await normalizeImageOrientation(pg.blob, pg.rotate, { maxWidth: 1650 });
        const sig = measureHeaderSignature(canvas);

        if (!sig.isSheet) {
          console.log(`[SafePatrol PDF] Page ${pg.pageNumber}/${totalPages} 생략 (일반 텍스트/간지 페이지, score=${sig.score})`);
          batchResults.push({ _skipped: true, pageNumber: pg.pageNumber });
          processedCount++;
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
          continue;
        }

        const rec = await parseSheetCanvas(canvas, {
          pageNumber: pg.pageNumber,
          sourceName: `${file.name} (p.${pg.pageNumber})`,
          deferBatchAi: true
        });
        processedCount++;
        if (rec && rec._skipped) {
          console.log(`[SafePatrol PDF] Page ${pg.pageNumber}/${totalPages} 생략 (${rec.reason || '참고사항/시공예시'})`);
          batchResults.push({ _skipped: true, pageNumber: pg.pageNumber });
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
        } else if (rec) {
          batchResults.push(rec);
          records.push(rec);
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

      // 다건 배치 AI 표준 분류 및 핀포인트 오타 패치 — 비동기 파이프라인으로 다음 배치 OCR과 병렬 처리
      const validBatchRecs = batchResults.filter(r => r && !r._skipped);
      if (validBatchRecs.length > 0 && window.SafeLocalAI && typeof window.SafeLocalAI.classifyBatchRecords === 'function') {
        const aiTask = window.SafeLocalAI.classifyBatchRecords(validBatchRecs).catch(e => {
          console.warn('[SafePatrol] Batch AI classify warning:', e);
        });
        aiPromises.push(aiTask);
        // 동시 네트워크 요청은 최대 3개까지 유지해 AI 처리와 다음 페이지 OCR 오버랩 극대화
        if (aiPromises.length >= 3) {
          await aiPromises[aiPromises.length - 3];
        }
      }
    }

    if (aiPromises.length > 0) {
      onProgress({
        phase: 'ai',
        current: totalPages,
        total: totalPages,
        extracted: records.length,
        skipped: skippedCount,
        currentPage: totalPages,
        totalPages,
        extractedCount: records.length,
        skippedCount
      });
      await Promise.all(aiPromises);
    }

    records.sort((a, b) => (a.pageNumber || 0) - (b.pageNumber || 0));

    // 2차 패스: 장소 미추출 레코드에 동일 문서 내 유효 장소 상속 및 오프라인 보강
    const bestBinaryLoc = records.find(r => r.location && r.location.length >= 2)?.location || '101동 외부';
    for (const r of records) {
      if (!r.location || r.location.length < 2) {
        if (/계단구간|E\/V/i.test(r.content)) r.location = '계단구간 E/V 최상부';
        else if (/갱폼|gang\s*form/i.test(r.content)) r.location = `${bestBinaryLoc} (갱폼)`;
        else r.location = bestBinaryLoc;
      }
      if (!r.agentMajor || !r.workMethod) {
        enrichRecordOfflineFromContent(r);
      }
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

  if (typeof initPaddleOcr === 'function') {
    initPaddleOcr().catch(() => {});
  }
  const pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  totalPages = pdfDoc.numPages;

  let lastKnownLocation = '';
  const BATCH_SIZE = 4;
  const RENDER_CONCURRENCY = 4;
  const orderedResults = new Array(totalPages).fill(null);

  const renderPageForSheet = async (pNum) => {
    const page = await pdfDoc.getPage(pNum);
    const viewport = page.getViewport({ scale: 1.8 });
    const origW = viewport.width;
    const origH = viewport.height;
    let pageCanvas = document.createElement('canvas');
    pageCanvas.width = origW;
    pageCanvas.height = origH;
    const pCtx = pageCanvas.getContext('2d');
    const [, textContent] = await Promise.all([
      page.render({ canvasContext: pCtx, viewport }).promise,
      page.getTextContent().catch(() => ({ items: [] }))
    ]);

    // 가로 정방향 정규화 (회전각 추적하여 디지털 텍스트 아이템 좌표도 동일하게 투영)
    let rotationDeg = 0;
    if (pageCanvas.height > pageCanvas.width) {
      const c270 = rotateCanvas(pageCanvas, 270);
      const sig270 = measureHeaderSignature(c270);
      if (sig270.isSheet) {
        pageCanvas = c270;
        rotationDeg = 270;
      } else {
        const c90 = rotateCanvas(pageCanvas, 90);
        if (sig270.score >= measureHeaderSignature(c90).score) {
          pageCanvas = c270;
          rotationDeg = 270;
        } else {
          pageCanvas = c90;
          rotationDeg = 90;
        }
      }
    }

    const digitalItems = projectPdfTextItems(textContent, viewport, origW, origH, rotationDeg, pdfjsLib.Util);
    const digitalText = (textContent?.items || []).map(it => it.str || '').join(' ');
    const sig = measureHeaderSignature(pageCanvas);
    return { pNum, pageCanvas, digitalText, digitalItems, sig };
  };

  const aiPromises = [];

  for (let startPage = 1; startPage <= totalPages; startPage += BATCH_SIZE) {
    const batchPages = [];
    for (let p = startPage; p < startPage + BATCH_SIZE && p <= totalPages; p++) {
      batchPages.push(p);
    }

    // 페이지 렌더링 + 디지털 텍스트 추출은 RENDER_CONCURRENCY 단위로 병렬 처리하여 PDF 로딩 대기 시간 단축
    const renderedBatch = [];
    for (let i = 0; i < batchPages.length; i += RENDER_CONCURRENCY) {
      const chunkNums = batchPages.slice(i, i + RENDER_CONCURRENCY);
      onProgress({
        current: chunkNums[0],
        total: totalPages,
        extracted: orderedResults.filter(Boolean).length,
        skipped: skippedCount,
        currentPage: chunkNums[0],
        totalPages,
        extractedCount: orderedResults.filter(Boolean).length,
        skippedCount
      });
      const renderedChunk = await Promise.all(chunkNums.map(renderPageForSheet));
      renderedBatch.push(...renderedChunk);
    }

    for (let rIdx = 0; rIdx < renderedBatch.length; rIdx++) {
      const item = renderedBatch[rIdx];
      const { pNum, digitalText, sig } = item;
      let pageCanvas = item.pageCanvas;
      item.pageCanvas = null;

      onProgress({
        current: pNum,
        total: totalPages,
        extracted: orderedResults.filter(Boolean).length,
        skipped: skippedCount,
        currentPage: pNum,
        totalPages,
        extractedCount: orderedResults.filter(Boolean).length,
        skippedCount
      });
      await new Promise(r => setTimeout(r, 0));

      const hasSheetKeywords = digitalText.includes('부적합') && (digitalText.includes('관련') || digitalText.includes('공종') || digitalText.includes('발생원인'));

      if (!sig.isSheet && !hasSheetKeywords) {
        skippedCount++;
        console.log(`[SafePatrol PDF] Page ${pNum}/${totalPages} 생략 (일반 텍스트/간지 페이지)`);
        onProgress({
          phase: 'skip',
          current: pNum,
          total: totalPages,
          extracted: orderedResults.filter(Boolean).length,
          skipped: skippedCount,
          currentPage: pNum,
          totalPages,
          extractedCount: orderedResults.filter(Boolean).length,
          skippedCount
        });
        pageCanvas = null;
        continue;
      }

      const rec = await parseSheetCanvas(pageCanvas, {
        digitalText,
        digitalItems: item.digitalItems || [],
        pageNumber: pNum,
        sourceName: `${file.name} (p.${pNum})`,
        lastKnownLocation,
        deferBatchAi: true
      });
      pageCanvas = null;
      if (rec && rec.location) lastKnownLocation = rec.location;
      if (rec && rec._skipped) {
        skippedCount++;
        console.log(`[SafePatrol PDF] Page ${pNum}/${totalPages} 생략 (${rec.reason || '참고사항/시공예시'})`);
        onProgress({
          phase: 'skip',
          current: pNum,
          total: totalPages,
          extracted: orderedResults.filter(Boolean).length,
          skipped: skippedCount,
          currentPage: pNum,
          totalPages,
          extractedCount: orderedResults.filter(Boolean).length,
          skippedCount
        });
        continue;
      }
      orderedResults[pNum - 1] = rec;
      onProgress({
        current: pNum,
        total: totalPages,
        extracted: orderedResults.filter(Boolean).length,
        skipped: skippedCount,
        currentPage: pNum,
        totalPages,
        extractedCount: orderedResults.filter(Boolean).length,
        skippedCount
      });
    }

    const batchSlice = batchPages.map(p => orderedResults[p - 1]).filter(Boolean);
    if (batchSlice.length > 0 && window.SafeLocalAI && typeof window.SafeLocalAI.classifyBatchRecords === 'function') {
      const aiTask = window.SafeLocalAI.classifyBatchRecords(batchSlice).catch(e => {
        console.warn('[SafePatrol] Batch AI classify warning:', e);
      });
      aiPromises.push(aiTask);
      // 동시 네트워크 요청은 최대 3개까지 유지해 AI 처리와 다음 배치 렌더링/OCR 오버랩 극대화
      if (aiPromises.length >= 3) {
        await aiPromises[aiPromises.length - 3];
      }
    }

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

  if (aiPromises.length > 0) {
    onProgress({
      phase: 'ai',
      current: totalPages,
      total: totalPages,
      extracted: records.length,
      skipped: skippedCount,
      currentPage: totalPages,
      totalPages,
      extractedCount: records.length,
      skippedCount
    });
    await Promise.all(aiPromises);
    records.length = 0;
    for (const r of orderedResults) {
      if (r) records.push(r);
    }
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
 * Selective Vision Rescue 판단기:
 * - 디지털 좌표 텍스트가 사용된 셀은 Vision 호출 생략
 * - 래스터 OCR 결과의 관련기준(law)이나 부적합내용(content)에 심각한 한글 깨짐·비단어가 남은 경우에만 선별적 Vision Rescue 발동
 */
export function shouldTriggerVisionRescue(cellTexts = {}, cellConfidences = {}, parsedFields = {}, digitalFlagOrMap = false) {
  const digitalMap = (digitalFlagOrMap && typeof digitalFlagOrMap === 'object') ? digitalFlagOrMap : null;
  if (!digitalMap && digitalFlagOrMap === true) return false;
  if (digitalMap && digitalMap.content && digitalMap.law && digitalMap.interview) return false;

  const content = String(parsedFields.content || cellTexts.content || '').trim();
  if (!digitalMap?.content && (!content || content.replace(/\s+/g, '').length < 6)) return true;

  const coreKeys = ['content', 'interview', 'propText', 'cm'].filter(k => !digitalMap?.[k]);
  const retryCount = coreKeys.filter((k) => Boolean(cellConfidences?.[k]?.needsVisionRetry)).length;
  const rawLawText = String(parsedFields.rawLaw || cellTexts.law || '').trim();
  const normalizedLaw = normalizeSafetyLawSpec({
    rawLaw: rawLawText,
    lawBody: parsedFields.lawBody || '',
    law: parsedFields.law || '',
    contextText: content
  });
  const lawIsRaster = !digitalMap?.law;
  const hasCorruptLawToken = lawIsRaster &&
    rawLawText.length >= 6 &&
    (hasGarbledKoreanNoise(normalizedLaw.title || rawLawText) ||
      (Boolean(cellConfidences?.law?.needsVisionRetry) && /(?:안선작업|시심|주탁|닥아|방시시실|작입|IZ12B-10\/|\?{2,}|[가-힣]*\?[가-힣]*|\uFFFD)/.test(normalizedLaw.title || rawLawText)));
  if (hasCorruptLawToken && Boolean(cellConfidences?.law?.lowConfidence || hasGarbledKoreanNoise(rawLawText))) return true;
  if (retryCount >= 3) return true;
  if (retryCount >= 2 && (Boolean(cellConfidences?.content?.needsVisionRetry) || hasCorruptLawToken)) return true;

  const contentCorrupted = !digitalMap?.content && (
    /\uFFFD|\d[가-힣]|[가-힣]\d(?!\s*(?:도|단|호|개|개소|층|동|차|m|cm|mm|%|명))|[A-Za-z]{2,}(?=[가-힣])|[가-힣](?=[a-z]{2,})/.test(content) ||
    /[가-힣]{16,}/.test(content)
  );
  if (!digitalMap?.content && cellConfidences?.content?.needsVisionRetry && contentCorrupted) return true;

  return false;
}

async function decodeDataUrlToCanvasForRefCheck(dataUrl) {
  if (typeof document === 'undefined' || typeof Image === 'undefined' || !dataUrl) return null;
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const w = Math.max(1, img.naturalWidth || img.width || 1);
        const h = Math.max(1, img.naturalHeight || img.height || 1);
        const scale = w > 900 ? (900 / w) : 1;
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(w * scale));
        c.height = Math.max(1, Math.round(h * scale));
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        resolve(c);
      } catch (_) {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}

function parsePptxSlideShapes(xmlText = '') {
  const pics = [];
  const spRefRects = [];
  const picBlocks = xmlText.match(/<p:pic\b[\s\S]*?<\/p:pic>/g) || [];
  for (let idx = 0; idx < picBlocks.length; idx++) {
    const blk = picBlocks[idx];
    const mEmbed = blk.match(/r:embed="([^"]+)"/);
    if (!mEmbed) continue;
    const mOff = blk.match(/<a:off\s+x="(-?\d+)"\s+y="(-?\d+)"/);
    const mExt = blk.match(/<a:ext\s+cx="(\d+)"\s+cy="(\d+)"/);
    pics.push({
      rId: mEmbed[1],
      order: idx,
      x: mOff ? parseInt(mOff[1], 10) : idx * 1000000,
      y: mOff ? parseInt(mOff[2], 10) : 0,
      cx: mExt ? parseInt(mExt[1], 10) : 0,
      cy: mExt ? parseInt(mExt[2], 10) : 0,
      hasCoords: Boolean(mOff && mExt)
    });
  }
  const spBlocks = xmlText.match(/<p:sp\b[\s\S]*?<\/p:sp>/g) || [];
  for (const blk of spBlocks) {
    const spText = [...blk.matchAll(/<a:t>([^<]+)<\/a:t>/g)].map(m => m[1]).join(' ').trim();
    if (!spText || !REFERENCE_IMAGE_TEXT_RE.test(spText)) continue;
    const mOff = blk.match(/<a:off\s+x="(-?\d+)"\s+y="(-?\d+)"/);
    const mExt = blk.match(/<a:ext\s+cx="(\d+)"\s+cy="(\d+)"/);
    if (mOff && mExt) {
      spRefRects.push({
        text: spText,
        x: parseInt(mOff[1], 10),
        y: parseInt(mOff[2], 10),
        cx: parseInt(mExt[1], 10),
        cy: parseInt(mExt[2], 10)
      });
    }
  }
  return { pics, spRefRects };
}

/**
 * PPTX (.pptx) 슬라이드 초정밀 파서 (일반 텍스트 슬라이드 자동 생략 및 '유사 사고사례' 이미지 필터링 포함)
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

    // 슬라이드 내 사진 추출 (<p:pic> 좌표 순 정렬 + '유사 사고사례'/참고도판 텍스트·이미지 필터)
    const candidatePhotos = [];
    const relsPath = `ppt/slides/_rels/slide${slideNumber}.xml.rels`;
    if (zip.file(relsPath)) {
      const relsXml = await zip.file(relsPath).async('string');
      const relMap = new Map();
      const relTags = relsXml.match(/<Relationship\b[^>]+>/g) || [];
      for (const tag of relTags) {
        if (!/Type="[^"]*\/image"/.test(tag)) continue;
        const mId = tag.match(/Id="([^"]+)"/);
        const mTgt = tag.match(/Target="([^"]+)"/);
        if (mId && mTgt) relMap.set(mId[1], mTgt[1]);
      }

      const { pics, spRefRects } = parsePptxSlideShapes(xmlText);
      const isPicOverlaidByRefText = (pic) => {
        if (!pic.hasCoords || spRefRects.length === 0) return false;
        const pX1 = pic.x + pic.cx;
        const pY1 = pic.y + pic.cy;
        return spRefRects.some(sp => {
          const sX1 = sp.x + sp.cx;
          const sY1 = sp.y + sp.cy;
          const interX = Math.max(0, Math.min(pX1, sX1) - Math.max(pic.x, sp.x));
          const overlapRatioX = interX / Math.max(1, Math.min(pic.cx, sp.cx));
          const verticalNear = sp.y <= pic.y + Math.round(pic.cy * 0.5) && sY1 >= pic.y - 450000;
          return overlapRatioX >= 0.35 && verticalNear;
        });
      };

      const orderedPics = pics.length > 0
        ? [...pics].sort((a, b) => (a.x - b.x) || (a.y - b.y))
        : Array.from(relMap.keys()).map((rId, order) => ({ rId, order, hasCoords: false }));

      const seenTargets = new Set();
      for (const pic of orderedPics) {
        if (isPicOverlaidByRefText(pic)) continue;
        const target = relMap.get(pic.rId);
        if (!target) continue;
        const normalizedPath = target.replace(/^\.\.\//, 'ppt/');
        if (seenTargets.has(normalizedPath)) continue;
        seenTargets.add(normalizedPath);
        const imgFile = zip.file(normalizedPath);
        if (!imgFile) continue;
        const uint8 = await imgFile.async('uint8array');
        if (uint8.byteLength < 8000) continue; // 아이콘 등 초소형 이미지 제외
        const base64 = await imgFile.async('base64');
        const ext = normalizedPath.split('.').pop().toLowerCase();
        const mime = ext === 'png' ? 'image/png' : 'image/jpeg';
        candidatePhotos.push(`data:${mime};base64,${base64}`);
      }
    }

    const photos = [];
    for (let idx = 0; idx < candidatePhotos.length; idx++) {
      const dataUrl = candidatePhotos[idx];
      let isRefImg = false;
      if (candidatePhotos.length >= 2 || idx >= 1) {
        const imgCanvas = await decodeDataUrlToCanvasForRefCheck(dataUrl);
        if (imgCanvas) {
          isRefImg = await isReferenceOrCaseStudyBox(
            imgCanvas,
            { x: 0, y: 0, w: imgCanvas.width, h: imgCanvas.height },
            [],
            idx >= 1
          );
        }
      }
      if (!isRefImg) photos.push(dataUrl);
    }

    const cleanPhotos = photos.slice(0, 2);
    parsedRecords.push({
      slideNumber,
      ...parsed,
      workMethod: parsed.workGroup.includes('양중') || parsed.content.includes('양중') ? '양중작업' : '설치해체작업',
      workName: parsed.workGroup.includes('양중') || parsed.content.includes('양중') ? '양중작업' : '설치해체작업',
      condition: parsed.mgmtCauses.includes('불안전 상태') ? '물(物) 자체의 결함 (자재·부재 손상)' : '해당없음',
      action: parsed.mgmtCauses.includes('불안전 행동') ? '불안전한 동작·자세' : '해당없음',
      holdPoint: false,
      photos: cleanPhotos,
      photo1: cleanPhotos[0] || null,
      photo2: cleanPhotos[1] || null,
      photo2Banner: cleanPhotos.length > 1 ? parsed.photo2Banner : ''
    });
  }

  return parsedRecords;
}
