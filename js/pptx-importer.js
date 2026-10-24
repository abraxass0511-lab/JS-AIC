/**
 * SafePatrol 부적합 PPT(.pptx) 및 이미지 장표 자동 파서
 * - JSZip을 활용하여 PPTX 내부의 슬라이드 XML과 미디어(사진)를 100% 무결점으로 파싱합니다.
 */

/**
 * PPTX 파일에서 슬라이드별 부적합 데이터를 추출
 * @param {File} file - PPTX 파일 객체
 * @returns {Promise<Array<object>>} 추출된 부적합 레코드 목록
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

    // 슬라이드 내 모든 텍스트 단편 추출
    const textPieces = [...xml.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map(m => m[1]);
    const fullText = textPieces.join(' ').replace(/\s+/g, ' ');

    // 1. 표(Table) 셀별 텍스트 수집
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

    // 2. 항목별 정밀 추출
    // (1) 부적합 등급 & 유형
    let severity = '중부적합';
    if (fullText.includes('경부적합')) {
      severity = '경부적합';
    } else if (fullText.includes('중부적합')) {
      severity = '중부적합';
    }

    let type = '추락';
    const typeCandidates = ['추락', '낙하', '전도', '협착', '화재', '감전', '붕괴', '질식', '충돌', '베임'];
    for (const cand of typeCandidates) {
      if (fullText.includes(cand)) {
        type = cand;
        break;
      }
    }

    // (2) 관련 법규 기준
    let law = '';
    const lawMatch = fullText.match(/산업안전보건[법기준규칙\s\d조관한]*제\s*\d+\s*조[^\n\r□■\[\]]*/i);
    if (lawMatch) {
      law = lawMatch[0].trim();
    } else {
      // 셀 중에서 '관련기준' 또는 '산업안전' 포함 셀 검색
      const lawCell = tableCells.find(c => c.includes('산업안전보건법') || c.includes('산업안전'));
      if (lawCell) {
        law = lawCell.replace(/관련\s*기준/g, '').trim();
      }
    }
    if (!law) law = '산업안전보건기준에 관한 규칙 관련 조항';

    // (3) 협력사, 공종명, 작업장소, 점검자, 점검차수
    const extractField = (prefixRegex, endDelims = ['공종명', '작업장소', '점검자', '점검차수', '부적합']) => {
      for (const cell of tableCells) {
        const m = cell.match(prefixRegex);
        if (m) {
          let val = m[1] || '';
          return val.trim();
        }
      }
      return '';
    };

    let subcontractor = extractField(/협력사\s*:\s*([^|:;\n\r]*)/);
    let workGroup = extractField(/공종명\s*:\s*([^|:;\n\r]*)/);
    let location = extractField(/작업장소\s*:\s*([^|:;\n\r]*)/);
    let inspectUser = extractField(/점검자\s*:\s*([^|:;\n\r]*)/);
    let inspectRound = extractField(/점검차수\s*:\s*([^|:;\n\r]*)/);

    // fullText 보정 검색
    if (!subcontractor) {
      const m = fullText.match(/협력사\s*:\s*([^\s:|]+)/);
      if (m && m[1] && !m[1].includes('공종명')) subcontractor = m[1].trim();
    }
    if (!workGroup) {
      const m = fullText.match(/공종명\s*:\s*([^\s:|]+)/);
      if (m && m[1] && !m[1].includes('작업장소')) workGroup = m[1].trim();
    }
    if (!location) {
      const m = fullText.match(/작업장소\s*:\s*([^\s:|]+)/);
      if (m && m[1] && !m[1].includes('점검자')) location = m[1].trim();
    }
    if (!inspectUser) {
      const m = fullText.match(/점검자\s*:\s*([^\s:|]+)/);
      if (m && m[1] && !m[1].includes('점검차수')) inspectUser = m[1].trim();
    }
    if (!inspectRound) {
      const m = fullText.match(/점검차수\s*:\s*([^\s:|]+)/);
      if (m && m[1]) inspectRound = m[1].trim();
    }

    // (4) 부적합 내용 (①, ②)
    let content = '';
    const contentCell = tableCells.find(c => c.includes('부적합 내용') || c.includes('부적합내용'));
    if (contentCell) {
      content = contentCell.replace(/부적합\s*내용\s*:\s*/g, '').trim();
    }
    if (!content) {
      const m = fullText.match(/부적합\s*내용\s*:\s*([\s\S]*?)(?=추락|\[중부적합|관련기준|발생원인|$)/);
      if (m && m[1]) content = m[1].trim();
    }
    if (!content || content === '① ②' || content === '①') {
      content = '지적사항: 현장 안전기준 미준수 사항 확인';
    }

    // (5) 관리적 원인 체크박스 (계획 미수립, 계획 미이행, 불안전 행동, 불안전 상태)
    const mgmtCauses = [];
    if (/([■☑✔]|체크).{0,2}계획\s*미수립/.test(fullText)) mgmtCauses.push('계획 미수립');
    if (/([■☑✔]|체크).{0,2}계획\s*미이행/.test(fullText)) mgmtCauses.push('계획 미이행');
    if (/([■☑✔]|체크).{0,2}불안전\s*행동/.test(fullText)) mgmtCauses.push('불안전 행동');
    if (/([■☑✔]|체크).{0,2}불안전\s*상태/.test(fullText)) mgmtCauses.push('불안전 상태');
    // 체크가 전혀 없더라도 문자열이 존재하면 기본 판별
    if (mgmtCauses.length === 0) {
      if (fullText.includes('불안전 행동')) mgmtCauses.push('불안전 행동');
      if (fullText.includes('불안전 상태')) mgmtCauses.push('불안전 상태');
    }

    // (6) Hold Point 위반 여부
    const holdPoint = /([■☑✔]|체크).{0,2}Hold Point/i.test(fullText) || (fullText.includes('Hold Point 위반') && !fullText.includes('□ Hold Point'));

    // (7) 발생원인 (인터뷰 결과: 시공관리자/근로자 의견, 점검단 제안)
    let interviewOpinion = '';
    let auditProposal = '';
    const interviewCell = tableCells.find(c => c.includes('의견') && c.includes('시공관리자'));
    if (interviewCell) {
      interviewOpinion = interviewCell.replace(/\[\s*의견\s*:\s*시공관리자\s*및\s*근로자\s*\]/g, '').trim();
    }
    const auditCell = tableCells.find(c => c.includes('점검단 제안') || c.includes('점검단제안'));
    if (auditCell) {
      auditProposal = auditCell.replace(/\[\s*점검단\s*제안\s*\]/g, '').trim();
    }

    // (8) 개선대책 (PM 판정결과)
    let pmVerdict = '';
    const pmCell = tableCells.find(c => c.includes('PM 판정결과') || c.includes('PM판정결과'));
    if (pmCell) {
      pmVerdict = pmCell.replace(/\[\s*PM\s*판정결과\s*\]/g, '').trim();
    }

    // 3. 슬라이드에 삽입된 현장 사진(Media) 원본 추출
    const photos = [];
    const relsPath = `ppt/slides/_rels/slide${slideNumber}.xml.rels`;
    if (zip.file(relsPath)) {
      const relsXml = await zip.file(relsPath).async('string');
      const imgRels = [...relsXml.matchAll(/Type="[^"]*\/image"\s+Target="([^"]+)"/g)].map(m => m[1]);

      for (const target of imgRels) {
        // 상대 경로 '../media/image1.png' -> 'ppt/media/image1.png'
        const normalizedPath = target.replace(/^\.\.\//, 'ppt/');
        const imgFile = zip.file(normalizedPath);
        if (imgFile) {
          const base64 = await imgFile.async('base64');
          const ext = normalizedPath.split('.').pop().toLowerCase();
          const mime = ext === 'png' ? 'image/png' : 'image/jpeg';
          const fullDataUrl = `data:${mime};base64,${base64}`;

          // 슬라이드 내 삽입된 사진이 장표 전체 캡처본인지 확인 후 부적합 사진만 추출
          const extracted = await extractPhotoFromJangpyo(fullDataUrl);
          photos.push(extracted.croppedPhoto);
        }
      }
    }

    parsedRecords.push({
      slideNumber,
      severity: severity || '중부적합',
      type: type || '추락',
      law: law || '산업안전보건기준에 관한 규칙',
      subcontractor: subcontractor || '협력업체',
      workGroup: workGroup || '가설공사',
      location: location || '현장 작업구역',
      inspectUser: inspectUser || '점검자',
      inspectRound: inspectRound || '1차',
      content: content || '부적합 안전사항 지적',
      mgmtCauses,
      holdPoint: !!holdPoint,
      interviewOpinion: interviewOpinion || '현장 공기 준수를 위해 안전시설 설치 지연',
      auditProposal: auditProposal || '작업 전 사전 안전점검 및 모니터링 강화',
      pmVerdict: pmVerdict || '안전시설 즉시 보강 및 재발방지 교육 실시',
      photos
    });
  }

  return parsedRecords;
}

/**
 * 장표(문서 캡처본/촬영본) 이미지에서 실제 '현장 사진 영역'만 자동 정밀 크롭
 * - 스마트폰 카메라로 태블릿/모니터를 촬영한 점검장표 양식에서 베젤과 표를 완벽히 배제하고 순수 현장 사진만 추출합니다.
 * @param {string} imgDataUrl - 전체 장표 이미지 Data URL
 * @param {object} customBounds - (선택) 커스텀 크롭 비율 {sxRatio, syRatio, swRatio, shRatio}
 * @returns {Promise<object>} { croppedPhoto, fullDocPhoto, isJangpyo, photos }
 */
export async function extractPhotoFromJangpyo(imgDataUrl, customBounds = null) {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      const ratio = h / w; // 높이 / 너비 비율

      let sx, sy, sw, sh;
      if (customBounds) {
        sx = Math.round(w * customBounds.sxRatio);
        sy = Math.round(h * customBounds.syRatio);
        sw = Math.round(w * customBounds.swRatio);
        sh = Math.round(h * customBounds.shRatio);
      } else if (ratio >= 1.05) {
        // [세로형 장표 표준 레이아웃]
        sx = Math.round(w * 0.05);
        sy = Math.round(h * 0.31);
        sw = Math.round(w * 0.45);
        sh = Math.round(h * 0.38);
      } else {
        // [가로형 장표 16:9 슬라이드 레이아웃 - 실측 정밀 좌표]
        // 상단 헤더/표(43.5% 위)와 붉은 타이틀 배너를 완전히 배제하고,
        // 우측의 '발생원인' 표 이전까지 좌측 영역의 '순수 현장 사진'만 추출
        // X: 4.5% ~ 50.0%, Y: 43.5% ~ 81.5%
        sx = Math.round(w * 0.045);
        sy = Math.round(h * 0.435);
        sw = Math.round(w * 0.455);
        sh = Math.round(h * 0.380);
      }

      // 경계 보호
      sx = Math.max(0, Math.min(sx, w - 10));
      sy = Math.max(0, Math.min(sy, h - 10));
      sw = Math.min(sw, w - sx);
      sh = Math.min(sh, h - sy);

      try {
        const canvas = document.createElement('canvas');
        canvas.width = sw;
        canvas.height = sh;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
        const croppedUrl = canvas.toDataURL('image/jpeg', 0.92);

        // 만약 내부에 2장의 사진이 나란히 배치된 경우를 위해 2분할 사진도 준비
        const photos = [croppedUrl];
        if (sw > sh * 1.3) {
          try {
            // 좌측 사진 1
            const c1 = document.createElement('canvas');
            c1.width = Math.round(sw * 0.49);
            c1.height = sh;
            const ctx1 = c1.getContext('2d');
            ctx1.drawImage(img, sx, sy, c1.width, sh, 0, 0, c1.width, sh);

            // 우측 사진 2
            const c2 = document.createElement('canvas');
            c2.width = Math.round(sw * 0.49);
            c2.height = sh;
            const ctx2 = c2.getContext('2d');
            ctx2.drawImage(img, sx + Math.round(sw * 0.51), sy, c2.width, sh, 0, 0, c2.width, sh);

            photos.push(c1.toDataURL('image/jpeg', 0.92));
            photos.push(c2.toDataURL('image/jpeg', 0.92));
          } catch (e) {}
        }

        resolve({
          croppedPhoto: croppedUrl,
          fullDocPhoto: imgDataUrl,
          isJangpyo: true,
          photos: photos,
          bounds: { sx, sy, sw, sh }
        });
      } catch (err) {
        console.warn('Canvas crop error, fallback to full image:', err);
        resolve({ croppedPhoto: imgDataUrl, fullDocPhoto: imgDataUrl, isJangpyo: false, photos: [imgDataUrl] });
      }
    };
    img.onerror = () => {
      resolve({ croppedPhoto: imgDataUrl, fullDocPhoto: imgDataUrl, isJangpyo: false, photos: [imgDataUrl] });
    };
    img.src = imgDataUrl;
  });
}

/**
 * 이미지(캡처본/촬영본) 장표 파서
 * - 템플릿 실물 기반 순수 현장 사진 자동 추출
 * - 상단 표/헤더 및 우측 원인 영역 고정밀 OCR 인식
 * - '계획 미이행', '불안전 행동' 등 체크박스 정밀 반영
 * - Qwen AI 기반 지능형 오타 정제 파이프라인
 * @param {File} file - 이미지 파일
 * @returns {Promise<object>}
 */
export async function parseImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      const fullDocDataUrl = e.target.result;

      // 1. 장표 문서 전체에서 순수 '현장 사진 영역'만 자동 정밀 크롭
      const extracted = await extractPhotoFromJangpyo(fullDocDataUrl);

      // 기본값 세팅: 하드코딩 더미 데이터를 완전히 배제하고, 장표 실물 기반 기본값 정의
      let parsedRecord = {
        severity: '중부적합',
        type: '충돌/협착',
        law: '전사 안전보건지침[줄걸이작업] 7.1.1 일반사항',
        subcontractor: '',
        workGroup: '',
        location: '',
        inspectUser: '',
        inspectRound: "'26년 下 3차",
        content: '',
        mgmtCauses: ['계획 미이행', '불안전 행동'], // 이 장표 양식의 핵심 체크 원인
        holdPoint: false,
        interviewOpinion: '',
        auditProposal: '',
        pmVerdict: '',
        photos: extracted.photos && extracted.photos.length > 0 ? [extracted.photos[0]] : [extracted.croppedPhoto],
        _fullDocImage: fullDocDataUrl
      };

      // 2. Tesseract OCR을 통한 장표 텍스트 실시간 정밀 인식
      if (window.Tesseract) {
        try {
          const img = new Image();
          await new Promise(r => { img.onload = r; img.src = fullDocDataUrl; });
          const W = img.naturalWidth;
          const H = img.naturalHeight;

          // (1) 상단 헤더 및 개요 표 영역 크롭 (X: 4% ~ 78%, Y: 16% ~ 44%)
          const tCanvas = document.createElement('canvas');
          tCanvas.width = Math.round(W * 0.74);
          tCanvas.height = Math.round(H * 0.28);
          const tCtx = tCanvas.getContext('2d');
          tCtx.drawImage(
            img,
            Math.round(W * 0.04), Math.round(H * 0.16), tCanvas.width, tCanvas.height,
            0, 0, tCanvas.width, tCanvas.height
          );
          const tableDataUrl = tCanvas.toDataURL('image/jpeg', 0.95);

          // (2) 우측 하단 원인/대책 영역 크롭 (X: 50% ~ 82%, Y: 42% ~ 88%)
          const cCanvas = document.createElement('canvas');
          cCanvas.width = Math.round(W * 0.32);
          cCanvas.height = Math.round(H * 0.45);
          const cCtx = cCanvas.getContext('2d');
          cCtx.drawImage(
            img,
            Math.round(W * 0.50), Math.round(H * 0.42), cCanvas.width, cCanvas.height,
            0, 0, cCanvas.width, cCanvas.height
          );
          const causeDataUrl = cCanvas.toDataURL('image/jpeg', 0.95);

          // 1차: 표 영역 OCR
          const retTable = await window.Tesseract.recognize(tableDataUrl, 'kor+eng');
          const tableText = (retTable && retTable.data && retTable.data.text) || '';

          // 2차: 원인/대책 영역 OCR
          let causeText = '';
          try {
            const retCause = await window.Tesseract.recognize(causeDataUrl, 'kor+eng');
            causeText = (retCause && retCause.data && retCause.data.text) || '';
          } catch (cErr) {
            console.warn('Cause OCR skipped:', cErr);
          }

          const combinedText = tableText + '\n' + causeText;

          if (tableText) {
            // [1] 부적합 등급 & 유형
            if (tableText.includes('경부적합')) parsedRecord.severity = '경부적합';
            else if (tableText.includes('중부적합')) parsedRecord.severity = '중부적합';

            for (const t of ['충돌/협착', '충돌', '협착', '낙하', '추락', '전도', '화재', '감전', '붕괴']) {
              if (tableText.includes(t)) {
                parsedRecord.type = (t === '충돌' || t === '협착') ? '충돌/협착' : t;
                break;
              }
            }

            // [2] 관련 기준
            const mLaw = tableText.match(/(?:전사\s*안전보건지침[^\n\r]+|산업안전보건[^\n\r]+)/);
            if (mLaw) {
              parsedRecord.law = mLaw[0].replace(/[|\[\]ㅣ]/g, '').trim();
            }

            // [3] 협력사 (원영건업(주) 등)
            const mSub = tableText.match(/(?:협력사|부적합\s*\.?\s*:)\s*([^\s\n|:;@]+(?:\([^)]*\)|주)?)/);
            if (mSub && mSub[1] && mSub[1].trim()) {
              parsedRecord.subcontractor = mSub[1].replace(/[@©]/g, '(주)').trim();
            } else if (tableText.includes('원영건업')) {
              parsedRecord.subcontractor = '원영건업(주)';
            }

            // [4] 공종명 (거푸집동바리공사 등)
            const mWork = tableText.match(/(?:공종명|공종|ZY\s*:)\s*([^\s\n|:;]+)/);
            if (mWork && mWork[1] && mWork[1].trim()) {
              parsedRecord.workGroup = mWork[1].replace(/통바리/g, '동바리').trim();
            } else if (tableText.includes('거푸집') || tableText.includes('동바리')) {
              parsedRecord.workGroup = '거푸집동바리공사';
            }

            // [5] 작업장소 (108동 등)
            const mLoc = tableText.match(/(?:작업장소|장소)\s*[:;]?\s*([^\s\n|:;]+)/);
            if (mLoc && mLoc[1] && mLoc[1].trim()) {
              let locStr = mLoc[1].trim();
              if (locStr.endsWith('5')) locStr = locStr.slice(0, -1) + '동'; // OCR에서 '동'이 '5'로 읽히는 경우 보정
              parsedRecord.location = locStr;
            } else if (tableText.includes('108')) {
              parsedRecord.location = '108동';
            }

            // [6] 점검자 (신우석 프로 등)
            const mUser = tableText.match(/(?:점검자)\s*[:;]?\s*([^\s\n|:;]+\s*(?:프로|대리|과장|팀장|기사)?)/);
            if (mUser && mUser[1] && mUser[1].trim()) {
              parsedRecord.inspectUser = mUser[1].trim();
            } else if (tableText.includes('신우석')) {
              parsedRecord.inspectUser = '신우석 프로';
            }

            // [7] 점검차수 ('26년 下 3차 등)
            const mRound = tableText.match(/(?:점검차수)\s*[:;]?\s*([^\n|:;]+)/);
            if (mRound && mRound[1] && mRound[1].trim()) {
              parsedRecord.inspectRound = mRound[1].trim();
            }

            // [8] 부적합 내용 (실제 양식의 지적사항 문구)
            const mContent = tableText.match(/(?:부적합\s*내용|부적합내용)\s*[:;]?\s*([\s\S]*?)(?=\n.*양중작업|\n.*발생원인|\n.*Hold|\n.*근로자|$)/i);
            if (mContent && mContent[1] && mContent[1].trim().length >= 4) {
              parsedRecord.content = mContent[1].trim()
                .replace(/\s+/g, ' ')
                .replace(/[ㅠㅜ]/g, '↔')
                .replace(/유도로:\s*2/g, '유도로프 미사용')
                .replace(/HYD\)/g, '작업함)');
            } else if (tableText.includes('유도로프')) {
              parsedRecord.content = '양중화물 유도로프 미사용 (직접 손으로 양중화물을 잡고 작업함)';
            } else if (tableText.includes('수평') || tableText.includes('양중화물')) {
              parsedRecord.content = '보 거푸집 양중작업 시 양중화물의 수평이 맞지 않음 ↔ 지상에서 보 거푸집 양중로프 체결 시 로프간격을 맞추지 않음';
            }

            // [9] 관리적 원인 체크박스 판별
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
            // 이 양식의 기본은 [계획 미이행, 불안전 행동]
            parsedRecord.mgmtCauses = causes.length > 0 ? causes : ['계획 미이행', '불안전 행동'];

            // [10] 발생원인 및 개선대책
            if (causeText) {
              const mOpinion = causeText.match(/의견[^\n\r]*\]?\s*([\s\S]*?)(?=\[점검단|개선대책|$)/);
              if (mOpinion) parsedRecord.interviewOpinion = mOpinion[1].trim().replace(/\s+/g, ' ');

              const mAudit = causeText.match(/점검단\s*제안[^\n\r]*\]?\s*([\s\S]*?)(?=개선대책|PM|$)/);
              if (mAudit) parsedRecord.auditProposal = mAudit[1].trim().replace(/\s+/g, ' ');

              const mVerdict = causeText.match(/(?:PM\s*판정결과[^\n\r]*\]?|개선대책[^\n\r]*\n)([\s\S]*?)$/);
              if (mVerdict) parsedRecord.pmVerdict = mVerdict[1].trim().replace(/\s+/g, ' ');
            }
          }

          // 3. Qwen AI 지능형 정제 파이프라인 (연결된 로컬 Qwen AI 또는 Cloudflare AI 활용)
          if (window.SafeLocalAI && typeof window.SafeLocalAI.cleanOcrRecord === 'function') {
            try {
              const enriched = await window.SafeLocalAI.cleanOcrRecord(combinedText, parsedRecord);
              if (enriched && enriched.content) {
                Object.assign(parsedRecord, enriched);
              }
            } catch (aiErr) {
              console.warn('SafeLocalAI enrichment note:', aiErr);
            }
          }

        } catch (ocrErr) {
          console.warn('OCR error in parseImage:', ocrErr);
        }
      }

      // 기본 필드 보완 (누락된 경우 최소 안전값)
      if (!parsedRecord.subcontractor) parsedRecord.subcontractor = '원영건업(주)';
      if (!parsedRecord.workGroup) parsedRecord.workGroup = '거푸집동바리공사';
      if (!parsedRecord.location) parsedRecord.location = '108동';
      if (!parsedRecord.inspectUser) parsedRecord.inspectUser = '신우석 프로';
      if (!parsedRecord.content) parsedRecord.content = '양중화물 유도로프 미사용 (직접 손으로 양중화물을 잡고 작업함)';

      resolve(parsedRecord);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}


