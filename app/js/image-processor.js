/**
 * SafePatrol 이미지 압축 & EXIF 날짜 추출 & 장표 부적합 사진 자동 크롭기
 * - 갤러리/카메라 사진을 브라우저 캔버스로 리사이징 (긴변 1280px, WebP/JPEG 약 150KB)
 * - 장표 캡처본(문서 전체 이미지) 감지 시, 불필요한 표/헤더를 배제하고 '현장 부적합 사진 영역'만 정밀 크롭 추출
 * - exifr를 통해 원본 촬영일자(DateTimeOriginal) 추출
 */

/**
 * 장표 문서 여부 판별 (캔버스 픽셀 구조 분석)
 */
export function detectJangpyo(canvas, width, height) {
  const aspect = width / height;
  const isLandscapeSlide = aspect >= 1.25 && aspect <= 2.2;
  const isPortraitDoc = aspect >= 0.55 && aspect <= 0.85;

  if (!isLandscapeSlide && !isPortraitDoc) {
    return { isJangpyo: false };
  }

  try {
    const sampleW = isLandscapeSlide ? 64 : 36;
    const sampleH = isLandscapeSlide ? 36 : 64;
    const sCanvas = document.createElement('canvas');
    sCanvas.width = sampleW;
    sCanvas.height = sampleH;
    const sCtx = sCanvas.getContext('2d', { willReadFrequently: true });
    sCtx.drawImage(canvas, 0, 0, sampleW, sampleH);
    const imgData = sCtx.getImageData(0, 0, sampleW, sampleH).data;

    const getPixelLum = (x, y) => {
      const idx = (y * sampleW + x) * 4;
      return 0.299 * imgData[idx] + 0.587 * imgData[idx + 1] + 0.114 * imgData[idx + 2];
    };

    if (isLandscapeSlide) {
      // 1) 상단 헤더 표 영역 (Y: 0% ~ 27% -> y: 0 ~ 9)
      let headerBrightCount = 0;
      let headerTotal = 0;
      for (let y = 1; y < 9; y++) {
        for (let x = 2; x < sampleW - 2; x++) {
          headerTotal++;
          if (getPixelLum(x, y) > 195) headerBrightCount++;
        }
      }
      const headerBrightRatio = headerBrightCount / (headerTotal || 1);

      // 2) 우측 텍스트 표 영역 (X: 48% ~ 95%, Y: 30% ~ 90% -> x: 31~60, y: 11~32)
      let rightBrightCount = 0;
      let rightTotal = 0;
      for (let y = 11; y < 32; y++) {
        for (let x = 32; x < sampleW - 2; x++) {
          rightTotal++;
          if (getPixelLum(x, y) > 190) rightBrightCount++;
        }
      }
      const rightBrightRatio = rightBrightCount / (rightTotal || 1);

      // 3) 좌하단 현장 사진 영역 (X: 2% ~ 44%, Y: 30% ~ 95% -> x: 2~27, y: 11~33)
      let photoLums = [];
      for (let y = 11; y < 33; y += 2) {
        for (let x = 3; x < 27; x += 2) {
          photoLums.push(getPixelLum(x, y));
        }
      }
      const photoAvg = photoLums.reduce((a, b) => a + b, 0) / (photoLums.length || 1);
      const photoVariance = photoLums.reduce((a, b) => a + Math.pow(b - photoAvg, 2), 0) / (photoLums.length || 1);
      const photoStdDev = Math.sqrt(photoVariance);

      // 상단과 우측이 표 양식의 밝은 배경(>50%)이면서 좌하단이 실제 사진(명암 대비 존재)일 때 장표로 감지
      const isJangpyo = (headerBrightRatio > 0.50 && rightBrightRatio > 0.50) ||
                        (headerBrightRatio > 0.45 && photoStdDev > 20 && photoAvg < 220);

      return {
        isJangpyo,
        layout: 'landscape',
        bounds: {
          sxRatio: 0.008,
          syRatio: 0.288,
          swRatio: 0.435,
          shRatio: 0.697
        }
      };
    } else {
      return {
        isJangpyo: false,
        layout: 'portrait',
        bounds: {
          sxRatio: 0.05,
          syRatio: 0.31,
          swRatio: 0.45,
          shRatio: 0.38
        }
      };
    }
  } catch (e) {
    console.warn('Jangpyo layout check error:', e);
    return { isJangpyo: false };
  }
}

/**
 * 이미지 파일 처리 메인 함수
 * @param {File} file - 업로드된 이미지 파일
 * @param {number} maxDimension - 최대 긴변 길이
 * @param {number} quality - JPEG 압축 품질
 * @param {boolean} autoCropJangpyo - 장표 감지 시 현장 사진 영역 자동 크롭 여부 (기본: true)
 */
export async function processImageFile(file, maxDimension = 1280, quality = 0.82, autoCropJangpyo = true) {
  let dateTaken = null;

  // 1) EXIF 분석 시도
  if (window.exifr) {
    try {
      const exif = await window.exifr.parse(file, ['DateTimeOriginal', 'CreateDate']);
      const rawDate = exif && (exif.DateTimeOriginal || exif.CreateDate);
      if (rawDate instanceof Date && !isNaN(rawDate.getTime())) {
        const y = rawDate.getFullYear();
        const m = String(rawDate.getMonth() + 1).padStart(2, '0');
        const d = String(rawDate.getDate()).padStart(2, '0');
        dateTaken = `${y}-${m}-${d}`;
      }
    } catch (e) {
      console.warn('EXIF 파싱 실패 또는 미지원:', e);
    }
  }

  // 2) 이미지 리사이징 (Canvas)
  const bmp = await createImageBitmap(file);
  let { width, height } = bmp;

  if (width > maxDimension || height > maxDimension) {
    if (width > height) {
      height = Math.round((height * maxDimension) / width);
      width = maxDimension;
    } else {
      width = Math.round((width * maxDimension) / height);
      height = maxDimension;
    }
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bmp, 0, 0, width, height);

  // 전체 원본 압축 Blob
  const fullDocBlob = await new Promise(resolve => {
    canvas.toBlob(resolve, 'image/jpeg', quality);
  });
  const fullDocPreviewUrl = URL.createObjectURL(fullDocBlob);

  // 3) 장표(슬라이드 양식) 자동 감지 및 현장 사진 영역 크롭
  let finalBlob = fullDocBlob;
  let finalPreviewUrl = fullDocPreviewUrl;
  let isJangpyo = false;
  let isCropped = false;

  if (autoCropJangpyo) {
    const check = detectJangpyo(canvas, width, height);
    if (check.isJangpyo && check.bounds) {
      isJangpyo = true;
      const b = check.bounds;
      let sx = Math.round(width * b.sxRatio);
      let sy = Math.round(height * b.syRatio);
      let sw = Math.round(width * b.swRatio);
      let sh = Math.round(height * b.shRatio);

      // 경계 보호
      sx = Math.max(0, Math.min(sx, width - 10));
      sy = Math.max(0, Math.min(sy, height - 10));
      sw = Math.min(sw, width - sx);
      sh = Math.min(sh, height - sy);

      try {
        const cropCanvas = document.createElement('canvas');
        cropCanvas.width = sw;
        cropCanvas.height = sh;
        const cropCtx = cropCanvas.getContext('2d');
        cropCtx.drawImage(canvas, sx, sy, sw, sh, 0, 0, sw, sh);

        const cropBlob = await new Promise(resolve => {
          cropCanvas.toBlob(resolve, 'image/jpeg', quality);
        });

        finalBlob = cropBlob;
        finalPreviewUrl = URL.createObjectURL(cropBlob);
        isCropped = true;
      } catch (cropErr) {
        console.warn('Jangpyo crop failed, keeping full doc:', cropErr);
      }
    }
  }

  return {
    blob: finalBlob,
    dateTaken,
    previewUrl: finalPreviewUrl,
    width,
    height,
    isJangpyo,
    isCropped,
    fullDocBlob,
    fullDocPreviewUrl
  };
}
