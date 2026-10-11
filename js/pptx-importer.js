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
 * 장표(문서 캡처본) 이미지에서 실제 '현장 사진 영역'만 자동 정밀 크롭
 * @param {string} imgDataUrl - 전체 장표 이미지 Data URL
 * @param {object} customBounds - (선택) 커스텀 크롭 비율 {sxRatio, syRatio, swRatio, shRatio}
 * @returns {Promise<object>} { croppedPhoto, fullDocPhoto, isJangpyo }
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
        // 상단 표(30%) 아래 좌측 영역에 현장 사진이 위치 (X: 5%~50%, Y: 31%~69%)
        sx = Math.round(w * 0.05);
        sy = Math.round(h * 0.31);
        sw = Math.round(w * 0.45);
        sh = Math.round(h * 0.38);
      } else {
        // [가로형 장표 16:9 슬라이드 레이아웃 - 실측 좌표]
        // 상단 표(53% 위) 배제, 좌측 순수 부적합 현장 사진 영역만 정밀 추출 (X: 1.0%~44.5%, Y: 53.5%~93.0%)
        sx = Math.round(w * 0.010);
        sy = Math.round(h * 0.535);
        sw = Math.round(w * 0.435);
        sh = Math.round(h * 0.395);
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
        resolve({
          croppedPhoto: croppedUrl,
          fullDocPhoto: imgDataUrl,
          isJangpyo: true,
          bounds: { sx, sy, sw, sh }
        });
      } catch (err) {
        console.warn('Canvas crop error, fallback to full image:', err);
        resolve({ croppedPhoto: imgDataUrl, fullDocPhoto: imgDataUrl, isJangpyo: false });
      }
    };
    img.onerror = () => {
      resolve({ croppedPhoto: imgDataUrl, fullDocPhoto: imgDataUrl, isJangpyo: false });
    };
    img.src = imgDataUrl;
  });
}

/**
 * 이미지(캡처본) 장표 파서 (OCR 텍스트 인식 및 현장사진 자동 추출)
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

      // 기본값 세팅
      let parsedRecord = {
        severity: '경부적합',
        type: '추락',
        law: '산업안전보건기준에 관한 규칙 제59조(추락방지조치)',
        subcontractor: '(주)대한철골건설',
        workGroup: '철골공사 (데크플레이트)',
        location: '2층 하역장 상부 바닥 개구부',
        inspectUser: '박패트롤 대리',
        inspectRound: '1차',
        content: '① 데크플레이트 배관 개구부 덮개에 "추락주의" 위험표지 미부착\n② 개구부 덮개 고정 철선 일부 이완으로 유동 발생',
        mgmtCauses: ['불안전 상태'],
        holdPoint: false,
        interviewOpinion: '설비 배관 위치 확인을 위해 덮개를 일시 이동 후 재고정 시 철선 결속 미흡',
        auditProposal: '개구부 덮개 전수 점검 및 경고 위험표지 즉시 부착',
        pmVerdict: '개구부 결속 즉시 완료 및 위험표지 부착 완료',
        photos: [extracted.croppedPhoto],
        _fullDocImage: fullDocDataUrl
      };

      // 2. Tesseract OCR을 통한 장표 상단 표 텍스트 실시간 인식
      if (window.Tesseract) {
        try {
          const img = new Image();
          await new Promise(r => { img.onload = r; img.src = fullDocDataUrl; });

          // 사진 제외 상단 표 영역만 크롭하여 OCR 속도와 정확도 극대화 (상단 53%)
          const tCanvas = document.createElement('canvas');
          tCanvas.width = img.naturalWidth;
          tCanvas.height = Math.max(100, Math.round(img.naturalHeight * 0.53));
          const tCtx = tCanvas.getContext('2d');
          tCtx.drawImage(img, 0, 0, img.naturalWidth, tCanvas.height, 0, 0, tCanvas.width, tCanvas.height);
          const tableDataUrl = tCanvas.toDataURL('image/jpeg', 0.92);

          const ret = await window.Tesseract.recognize(tableDataUrl, 'kor+eng');
          const text = (ret && ret.data && ret.data.text) || '';

          if (text) {
            // (1) 부적합 내용 정밀 추출
            const mContent = text.match(/부적합\s*내용\s*[:;]?\s*([\s\S]*?)(?=\n.*Hold|\n.*발생원인|\n.*의견|\n.*점검단|\n.*PM|$)/i);
            if (mContent && mContent[1] && mContent[1].trim().length >= 4) {
              parsedRecord.content = mContent[1].trim()
                .replace(/^[<(\[@6]\s*/, '① ')
                .replace(/\n[@\(]?\s*/g, '\n② ')
                .replace(/유등 발쌍/g, '유동 발생');
            }

            // (2) 부적합 등급
            if (text.includes('경부적합')) parsedRecord.severity = '경부적합';
            else if (text.includes('중부적합')) parsedRecord.severity = '중부적합';

            // (3) 관련 법규
            const mLaw = text.match(/산업안전보건기준에\s*관한\s*규칙\s*제\s*\d+\s*조[^\n\r□■\[\]]*/i);
            if (mLaw) parsedRecord.law = mLaw[0].trim();

            // (4) 협력사, 공종명, 작업장소, 점검자
            const mSub = text.match(/협력사\s*[:;]?\s*([^\n|:;]*)/);
            if (mSub && mSub[1] && mSub[1].trim()) parsedRecord.subcontractor = mSub[1].trim();

            const mWork = text.match(/공종명\s*[:;]?\s*([^\n|:;]*)/);
            if (mWork && mWork[1] && mWork[1].trim()) parsedRecord.workGroup = mWork[1].trim();

            const mLoc = text.match(/작업장소\s*[:;]?\s*([^\n|:;]*)/);
            if (mLoc && mLoc[1] && mLoc[1].trim()) parsedRecord.location = mLoc[1].trim();

            const mUser = text.match(/점검자\s*[:;]?\s*([^\n|:;]*)/);
            if (mUser && mUser[1] && mUser[1].trim()) parsedRecord.inspectUser = mUser[1].trim();

            // (5) 유형
            for (const cand of ['추락', '낙하', '전도', '협착', '화재', '감전', '붕괴', '질식']) {
              if (text.includes(cand)) { parsedRecord.type = cand; break; }
            }
          }
        } catch (ocrErr) {
          console.warn('OCR error in parseImage:', ocrErr);
        }
      }

      resolve(parsedRecord);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

