/**
 * SafePatrol 이미지 압축 & EXIF 날짜 추출기
 * - 갤러리/카메라 사진을 브라우저 캔버스로 리사이징 (긴변 1280px, WebP/JPEG 약 150KB)
 * - exifr를 통해 원본 촬영일자(DateTimeOriginal) 추출
 */
export async function processImageFile(file, maxDimension = 1280, quality = 0.82) {
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

  const blob = await new Promise(resolve => {
    canvas.toBlob(resolve, 'image/jpeg', quality);
  });

  return {
    blob,
    dateTaken,
    previewUrl: URL.createObjectURL(blob),
    width,
    height
  };
}
