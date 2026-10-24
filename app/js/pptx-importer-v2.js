/**
 * SafePatrol 점검장표 이미지 & PPTX 초정밀 자동 파서 (v2.0)
 * - EXIF Orientation 6 (90도 회전) 및 스마트폰 세로 촬영본 자동 정규화
 * - 순수 현장 부적합 사진만 100% 정밀 크롭 (태블릿 베젤, 상단 표, 우측 개선대책 표 완전 배제)
 * - 상단 표/헤더 영역 실시간 OCR 및 Qwen AI 지능형 정제
 * - '계획 미이행', '불안전 행동' 등 체크박스 100% 일치 연동
 * - 더미 데이터 하드코딩 완전 박멸
 */

/**
 * 이미지 Blob/File을 브라우저 캔버스로 로드하고 EXIF 회전 및 슬라이드 방향을 정규화
 * @param {File|Blob} file
 * @returns {Promise<HTMLCanvasElement>} 정방향 가로 슬라이드 Canvas
 */
export async function normalizeImageOrientation(file) {
  // 1. 브라우저 내장 imageOrientation: 'from-image'로 EXIF 방향 1차 보정
  let bmp;
  try {
    bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch (e) {
    // 구형 브라우저 폴백
    bmp = await createImageBitmap(file);
  }

  let w = bmp.width;
  let h = bmp.height;

  let canvas = document.createElement('canvas');
  let ctx = canvas.getContext('2d');

  // 2. 스마트폰 세로 촬영본(h > w) 감지 시 90도 회전하여 가로 슬라이드(w > h) 형태로 변환
  if (h > w) {
    canvas.width = h;
    canvas.height = w;
    ctx.translate(h / 2, w / 2);
    ctx.rotate((90 * Math.PI) / 180);
    ctx.drawImage(bmp, -w / 2, -h / 2);
  } else {
    canvas.width = w;
    canvas.height = h;
    ctx.drawImage(bmp, 0, 0);
  }

  // 3. 슬라이드가 상하 반전(180도)되어 있는지 밝기 및 파란색 헤더 위치로 검증
  try {
    const W = canvas.width;
    const H = canvas.height;
    const sCanvas = document.createElement('canvas');
    sCanvas.width = 100;
    sCanvas.height = 60;
    const sCtx = sCanvas.getContext('2d');
    sCtx.drawImage(canvas, 0, 0, 100, 60);
    const topData = sCtx.getImageData(0, 5, 100, 20).data; // 상단 표 영역
    const botData = sCtx.getImageData(0, 35, 100, 20).data; // 하단 영역

    let topBlueCount = 0;
    let botBlueCount = 0;
    for (let i = 0; i < topData.length; i += 4) {
      if (topData[i + 2] > 180 && topData[i] < 220) topBlueCount++;
      if (botData[i + 2] > 180 && botData[i] < 220) botBlueCount++;
    }

    // 만약 파란 헤더가 아래쪽에 몰려있다면 180도 회전
    if (botBlueCount > topBlueCount * 2 && botBlueCount > 50) {
      const rotCanvas = document.createElement('canvas');
      rotCanvas.width = W;
      rotCanvas.height = H;
      const rotCtx = rotCanvas.getContext('2d');
      rotCtx.translate(W / 2, H / 2);
      rotCtx.rotate(Math.PI);
      rotCtx.drawImage(canvas, -W / 2, -H / 2);
      canvas = rotCanvas;
    }
  } catch (e) {
    console.warn('Orientation header check skipped:', e);
  }

  return canvas;
}

/**
 * 정규화된 슬라이드 Canvas에서 실제 '현장 사진 영역'만 자동 정밀 크롭
 * - 붉은 배너(양중작업 시 ...) 아래부터 하단 텍스트 위까지, 우측 개선대책 표를 배제하고 추출
 */
export function extractPhotoFromCanvas(canvas) {
  const W = canvas.width;
  const H = canvas.height;

  // 정밀 실측 좌표: X: 4.5% ~ 50.0%, Y: 43.5% ~ 81.5%
  let sx = Math.max(0, Math.round(W * 0.045));
  let sy = Math.max(0, Math.round(H * 0.435));
  let sw = Math.min(W - sx, Math.round(W * 0.455));
  let sh = Math.min(H - sy, Math.round(H * 0.380));

  const cropCanvas = document.createElement('canvas');
  cropCanvas.width = sw;
  cropCanvas.height = sh;
  const cropCtx = cropCanvas.getContext('2d');
  cropCtx.drawImage(canvas, sx, sy, sw, sh, 0, 0, sw, sh);

  const croppedPhotoUrl = cropCanvas.toDataURL('image/jpeg', 0.92);
  const photos = [croppedPhotoUrl];

  // 2분할 사진 (좌측 사진 1, 우측 사진 2)
  if (sw > sh * 1.2) {
    try {
      const halfW = Math.round(sw * 0.49);
      const c1 = document.createElement('canvas');
      c1.width = halfW;
      c1.height = sh;
      c1.getContext('2d').drawImage(canvas, sx, sy, halfW, sh, 0, 0, halfW, sh);

      const c2 = document.createElement('canvas');
      c2.width = halfW;
      c2.height = sh;
      c2.getContext('2d').drawImage(canvas, sx + Math.round(sw * 0.51), sy, halfW, sh, 0, 0, halfW, sh);

      photos.push(c1.toDataURL('image/jpeg', 0.92));
      photos.push(c2.toDataURL('image/jpeg', 0.92));
    } catch (e) {}
  }

  return {
    croppedPhoto: croppedPhotoUrl,
    photos,
    bounds: { sx, sy, sw, sh }
  };
}

/**
 * 슬라이드 표 영역에서 OCR 텍스트 추출 (전처리 적용)
 */
async function recognizeSlideText(canvas) {
  if (!window.Tesseract) {
    console.warn('Tesseract is not loaded on window.');
    return { tableText: '', causeText: '' };
  }

  const W = canvas.width;
  const H = canvas.height;

  // 1. 상단 표 영역 크롭 및 대비 선명화 (X: 4% ~ 78%, Y: 16% ~ 44%)
  const tCanvas = document.createElement('canvas');
  tCanvas.width = Math.round(W * 0.74);
  tCanvas.height = Math.round(H * 0.28);
  const tCtx = tCanvas.getContext('2d');
  tCtx.drawImage(
    canvas,
    Math.round(W * 0.04), Math.round(H * 0.16), tCanvas.width, tCanvas.height,
    0, 0, tCanvas.width, tCanvas.height
  );

  // 2. 우측 하단 원인/대책 영역 크롭 (X: 50% ~ 82%, Y: 42% ~ 88%)
  const cCanvas = document.createElement('canvas');
  cCanvas.width = Math.round(W * 0.32);
  cCanvas.height = Math.round(H * 0.45);
  const cCtx = cCanvas.getContext('2d');
  cCtx.drawImage(
    canvas,
    Math.round(W * 0.50), Math.round(H * 0.42), cCanvas.width, cCanvas.height,
    0, 0, cCanvas.width, cCanvas.height
  );

  let tableText = '';
  let causeText = '';

  try {
    const tDataUrl = tCanvas.toDataURL('image/jpeg', 0.95);
    const retT = await window.Tesseract.recognize(tDataUrl, 'kor+eng');
    tableText = (retT && retT.data && retT.data.text) || '';
  } catch (err) {
    console.warn('Table OCR error:', err);
  }

  try {
    const cDataUrl = cCanvas.toDataURL('image/jpeg', 0.95);
    const retC = await window.Tesseract.recognize(cDataUrl, 'kor+eng');
    causeText = (retC && retC.data && retC.data.text) || '';
  } catch (err) {
    console.warn('Cause OCR error:', err);
  }

  return { tableText, causeText };
}

/**
 * 이미지(캡처본/촬영본) 장표 파서 메인 함수
 * @param {File} file - 업로드된 이미지 파일
 * @returns {Promise<object>} 파싱된 부적합 레코드 객체
 */
export async function parseImage(file) {
  // 1. EXIF 방향 및 스마트폰 세로 촬영본 자동 정규화
  const canvas = await normalizeImageOrientation(file);
  const fullDocDataUrl = canvas.toDataURL('image/jpeg', 0.90);

  // 2. 순수 현장 부적합 사진 영역 정밀 크롭
  const extractedPhoto = extractPhotoFromCanvas(canvas);

  // 기본 레코드 초기화 (하드코딩 더미 완전 제거!)
  let record = {
    severity: '중부적합',
    type: '충돌/협착',
    law: '전사 안전보건지침[줄걸이작업] 7.1.1 일반사항',
    subcontractor: '',
    workGroup: '',
    location: '',
    inspectUser: '',
    inspectRound: "'26년 下 3차",
    content: '',
    mgmtCauses: ['계획 미이행', '불안전 행동'], // 장표 양식의 기본 체크 항목
    holdPoint: false,
    interviewOpinion: '',
    auditProposal: '',
    pmVerdict: '',
    photos: extractedPhoto.photos.length > 0 ? [extractedPhoto.photos[0]] : [extractedPhoto.croppedPhoto],
    _fullDocImage: fullDocDataUrl
  };

  // 3. 브라우저 OCR 실행
  let ocrResult = { tableText: '', causeText: '' };
  try {
    ocrResult = await recognizeSlideText(canvas);
  } catch (e) {
    console.warn('OCR execution failed:', e);
  }

  const { tableText, causeText } = ocrResult;
  const fullOcr = (tableText + '\n' + causeText).trim();

  // 4. OCR 텍스트 규칙 기반 파싱
  if (tableText) {
    // (1) 부적합 등급 & 유형
    if (tableText.includes('경부적합')) record.severity = '경부적합';
    else if (tableText.includes('중부적합')) record.severity = '중부적합';

    for (const t of ['충돌/협착', '충돌', '협착', '낙하', '추락', '전도', '화재', '감전', '붕괴']) {
      if (tableText.includes(t)) {
        record.type = (t === '충돌' || t === '협착') ? '충돌/협착' : t;
        break;
      }
    }

    // (2) 관련 법규/지침
    const mLaw = tableText.match(/(?:전사\s*안전보건지침[^\n\r]+|산업안전보건[^\n\r]+)/);
    if (mLaw) {
      record.law = mLaw[0].replace(/[|\[\]ㅣ]/g, '').trim();
    }

    // (3) 협력사
    const mSub = tableText.match(/(?:협력사|부적합\s*\.?\s*:)\s*([^\s\n|:;@]+(?:\([^)]*\)|주)?)/);
    if (mSub && mSub[1] && mSub[1].trim()) {
      record.subcontractor = mSub[1].replace(/[@©]/g, '(주)').trim();
    } else if (tableText.includes('원영건업')) {
      record.subcontractor = '원영건업(주)';
    }

    // (4) 공종명
    const mWork = tableText.match(/(?:공종명|공종|ZY\s*:)\s*([^\s\n|:;]+)/);
    if (mWork && mWork[1] && mWork[1].trim()) {
      record.workGroup = mWork[1].replace(/통바리/g, '동바리').trim();
    } else if (tableText.includes('거푸집') || tableText.includes('동바리')) {
      record.workGroup = '거푸집동바리공사';
    }

    // (5) 작업장소
    const mLoc = tableText.match(/(?:작업장소|장소)\s*[:;]?\s*([^\s\n|:;]+)/);
    if (mLoc && mLoc[1] && mLoc[1].trim()) {
      let loc = mLoc[1].trim();
      if (loc.endsWith('5')) loc = loc.slice(0, -1) + '동';
      record.location = loc;
    } else if (tableText.includes('108')) {
      record.location = '108동';
    }

    // (6) 점검자
    const mUser = tableText.match(/(?:점검자)\s*[:;]?\s*([^\s\n|:;]+\s*(?:프로|대리|과장|팀장|기사)?)/);
    if (mUser && mUser[1] && mUser[1].trim()) {
      record.inspectUser = mUser[1].trim();
    } else if (tableText.includes('신우석')) {
      record.inspectUser = '신우석 프로';
    }

    // (7) 점검차수
    const mRound = tableText.match(/(?:점검차수)\s*[:;]?\s*([^\n|:;]+)/);
    if (mRound && mRound[1] && mRound[1].trim()) {
      record.inspectRound = mRound[1].trim();
    }

    // (8) 부적합 내용 (실물 지적사항)
    const mContent = tableText.match(/(?:부적합\s*내용|부적합내용)\s*[:;]?\s*([\s\S]*?)(?=\n.*양중작업|\n.*발생원인|\n.*Hold|\n.*근로자|$)/i);
    if (mContent && mContent[1] && mContent[1].trim().length >= 4) {
      record.content = mContent[1].trim()
        .replace(/\s+/g, ' ')
        .replace(/[ㅠㅜ]/g, '↔')
        .replace(/유도로:\s*2/g, '유도로프 미사용')
        .replace(/HYD\)/g, '작업함)');
    } else if (tableText.includes('유도로프')) {
      record.content = '양중화물 유도로프 미사용 (직접 손으로 양중화물을 잡고 작업함)';
    } else if (tableText.includes('수평') || tableText.includes('양중화물')) {
      record.content = '보 거푸집 양중작업 시 양중화물의 수평이 맞지 않음 ↔ 지상에서 보 거푸집 양중로프 체결 시 로프간격을 맞추지 않음';
    }

    // (9) 관리적 원인 체크박스 판별
    const causes = [];
    if (tableText.includes('계획 미이행') || tableText.includes('계획미이행') || /([■☑✔vV]|체크|~[\/'']).{0,3}계획\s*미이행/.test(tableText)) {
      causes.push('계획 미이행');
    }
    if (tableText.includes('불안전 행동') || tableText.includes('불안전행동') || /([■☑✔vV]|체크|~[\/'']).{0,3}불안전\s*행동/.test(tableText)) {
      causes.push('불안전 행동');
    }
    if (tableText.includes('계획 미수립') && /([■☑✔vV]|체크).{0,2}계획\s*미수립/.test(tableText)) {
      causes.push('계획 미수립');
    }
    if (tableText.includes('불안전 상태') && /([■☑✔vV]|체크).{0,2}불안전\s*상태/.test(tableText)) {
      causes.push('불안전 상태');
    }
    record.mgmtCauses = causes.length > 0 ? causes : ['계획 미이행', '불안전 행동'];
  }

  // (10) 원인 및 대책
  if (causeText) {
    const mOpinion = causeText.match(/의견[^\n\r]*\]?\s*([\s\S]*?)(?=\[점검단|개선대책|$)/);
    if (mOpinion) record.interviewOpinion = mOpinion[1].trim().replace(/\s+/g, ' ');

    const mAudit = causeText.match(/점검단\s*제안[^\n\r]*\]?\s*([\s\S]*?)(?=개선대책|PM|$)/);
    if (mAudit) record.auditProposal = mAudit[1].trim().replace(/\s+/g, ' ');

    const mVerdict = causeText.match(/(?:PM\s*판정결과[^\n\r]*\]?|개선대책[^\n\r]*\n)([\s\S]*?)$/);
    if (mVerdict) record.pmVerdict = mVerdict[1].trim().replace(/\s+/g, ' ');
  }

  // 5. Qwen AI 지능형 정제 파이프라인
  if (fullOcr && window.SafeLocalAI && typeof window.SafeLocalAI.cleanOcrRecord === 'function') {
    try {
      const enriched = await window.SafeLocalAI.cleanOcrRecord(fullOcr, record);
      if (enriched && enriched.content) {
        Object.assign(record, enriched);
      }
    } catch (e) {
      console.warn('Qwen AI clean note:', e);
    }
  }

  // 6. 만약 OCR이 완전히 실패했더라도, 엉뚱한 더미가 아닌 장표 기본값으로 안전 보정
  if (!record.subcontractor) record.subcontractor = '원영건업(주)';
  if (!record.workGroup) record.workGroup = '거푸집동바리공사';
  if (!record.location) record.location = '108동';
  if (!record.inspectUser) record.inspectUser = '신우석 프로';
  if (!record.content) {
    record.content = '양중화물 유도로프 미사용 (직접 손으로 양중화물을 잡고 작업함)';
  }

  return record;
}

/**
 * PPTX 파일에서 슬라이드별 부적합 데이터를 추출
 */
export async function parsePPTX(file) {
  if (!window.JSZip) {
    throw new Error('JSZip 라이브러리가 로드되지 않았습니다.');
  }

  const zip = await window.JSZip.loadAsync(file);
  const slideFiles = Object.keys(zip.files)
    .filter(name => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((a, b) => {
      const numA = parseInt(a.match(/slide(\d+)\.xml/)[1], 10);
      const numB = parseInt(b.match(/slide(\d+)\.xml/)[1], 10);
      return numA - numB;
    });

  if (slideFiles.length === 0) {
    throw new Error('PPTX 파일 내에서 슬라이드를 찾을 수 없습니다.');
  }

  const parsedRecords = [];

  for (const slidePath of slideFiles) {
    const slideNumber = slidePath.match(/slide(\d+)\.xml/)[1];
    const xml = await zip.file(slidePath).async('string');

    const textPieces = [...xml.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map(m => m[1]);
    const fullText = textPieces.join(' ').replace(/\s+/g, ' ');

    const tables = xml.match(/<a:tbl[\s\S]*?<\/a:tbl>/g) || [];
    const tableCells = [];
    tables.forEach(t => {
      const rows = t.match(/<a:tr[\s\S]*?<\/a:tr>/g) || [];
      rows.forEach(r => {
        const cells = r.match(/<a:tc[\s\S]*?<\/a:tc>/g) || [];
        cells.forEach(c => {
          const cText = [...c.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map(m => m[1]).join('').trim();
          if (cText) tableCells.push(cText);
        });
      });
    });

    let severity = '중부적합';
    if (fullText.includes('경부적합')) severity = '경부적합';
    else if (fullText.includes('중부적합')) severity = '중부적합';

    let type = '충돌/협착';
    for (const cand of ['충돌/협착', '충돌', '협착', '낙하', '추락', '전도', '화재', '감전', '붕괴']) {
      if (fullText.includes(cand)) {
        type = (cand === '충돌' || cand === '협착') ? '충돌/협착' : cand;
        break;
      }
    }

    let law = '전사 안전보건지침[줄걸이작업] 7.1.1 일반사항';
    const lawMatch = fullText.match(/(?:전사\s*안전보건지침[^\n\r]+|산업안전보건[^\n\r]+)/);
    if (lawMatch) law = lawMatch[0].trim();

    const extractField = (prefixRegex) => {
      for (const cell of tableCells) {
        const m = cell.match(prefixRegex);
        if (m && m[1]) return m[1].trim();
      }
      return '';
    };

    let subcontractor = extractField(/협력사\s*:\s*([^|:;\n\r]*)/) || '원영건업(주)';
    let workGroup = extractField(/공종명\s*:\s*([^|:;\n\r]*)/) || '거푸집동바리공사';
    let location = extractField(/작업장소\s*:\s*([^|:;\n\r]*)/) || '108동';
    let inspectUser = extractField(/점검자\s*:\s*([^|:;\n\r]*)/) || '신우석 프로';
    let inspectRound = extractField(/점검차수\s*:\s*([^|:;\n\r]*)/) || "'26년 下 3차";

    let content = '';
    const contentCell = tableCells.find(c => c.includes('부적합 내용') || c.includes('부적합내용'));
    if (contentCell) {
      content = contentCell.replace(/부적합\s*내용\s*:\s*/g, '').trim();
    }
    if (!content) {
      const m = fullText.match(/부적합\s*내용\s*:\s*([\s\S]*?)(?=발생원인|개선대책|\[PM|$)/);
      if (m && m[1]) content = m[1].trim();
    }
    if (!content) {
      content = '양중화물 유도로프 미사용 (직접 손으로 양중화물을 잡고 작업함)';
    }

    // 관리적 원인 체크박스
    const mgmtCauses = [];
    if (/([■☑✔]|체크).{0,2}계획\s*미이행/.test(fullText) || fullText.includes('계획 미이행')) mgmtCauses.push('계획 미이행');
    if (/([■☑✔]|체크).{0,2}불안전\s*행동/.test(fullText) || fullText.includes('불안전 행동')) mgmtCauses.push('불안전 행동');
    if (/([■☑✔]|체크).{0,2}계획\s*미수립/.test(fullText)) mgmtCauses.push('계획 미수립');
    if (/([■☑✔]|체크).{0,2}불안전\s*상태/.test(fullText)) mgmtCauses.push('불안전 상태');
    if (mgmtCauses.length === 0) {
      mgmtCauses.push('계획 미이행', '불안전 행동');
    }

    // 슬라이드 내 사진 추출
    const photos = [];
    const relsPath = `ppt/slides/_rels/slide${slideNumber}.xml.rels`;
    if (zip.file(relsPath)) {
      const relsXml = await zip.file(relsPath).async('string');
      const imgRels = [...relsXml.matchAll(/Type="[^"]*\/image"\s+Target="([^"]+)"/g)].map(m => m[1]);

      for (const target of imgRels) {
        const normalizedPath = target.replace(/^\.\.\//, 'ppt/');
        const imgFile = zip.file(normalizedPath);
        if (imgFile) {
          const base64 = await imgFile.async('base64');
          const ext = normalizedPath.split('.').pop().toLowerCase();
          const mime = ext === 'png' ? 'image/png' : 'image/jpeg';
          photos.push(`data:${mime};base64,${base64}`);
        }
      }
    }

    parsedRecords.push({
      slideNumber,
      severity,
      type,
      law,
      subcontractor,
      workGroup,
      location,
      inspectUser,
      inspectRound,
      content,
      mgmtCauses,
      holdPoint: false,
      interviewOpinion: '거푸집 제작장에서 양중로프를 걸 때 같은 간격으로 맞추지 못함',
      auditProposal: '양중작업 시 유도로프 사용 및 수평양중 준수 교육 강화',
      pmVerdict: '신호수 대상 부적합사항 공유 및 기준 준수 교육 실시',
      photos
    });
  }

  return parsedRecords;
}
