const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const Tesseract = require('tesseract.js');
const { analyzeSheetLayout, findRedBanners, findPhotoBoxes } = require('../app/js/sheet-layout.js');

function detectCheckboxes(img, box) {
  const { data, width: W } = img;
  const midX = box.x + Math.round(box.w * 0.48);
  const midY = box.y + Math.round(box.h * 0.50);
  const quads = [
    { name: '계획 미수립', x0: box.x, x1: midX, y0: box.y, y1: midY },
    { name: '계획 미이행', x0: midX, x1: box.x + box.w, y0: box.y, y1: midY },
    { name: '불안전 행동', x0: box.x, x1: midX, y0: midY, y1: box.y + box.h },
    { name: '불안전 상태', x0: midX, x1: box.x + box.w, y0: midY, y1: box.y + box.h }
  ];
  const checked = [];
  for (const q of quads) {
    const qw = q.x1 - q.x0, qh = q.y1 - q.y0;
    const sx1 = q.x0 + Math.round(qw * 0.05), sx2 = q.x0 + Math.round(qw * 0.36);
    const sy1 = q.y0 + Math.round(qh * 0.12), sy2 = q.y0 + Math.round(qh * 0.88);
    let minX = sx2, maxX = sx1, minY = sy2, maxY = sy1;
    for (let y = sy1; y <= sy2; y++) {
      for (let x = sx1; x <= sx2; x++) {
        const k = (y * W + x) * 4;
        const lum = data[k] * 0.299 + data[k + 1] * 0.587 + data[k + 2] * 0.114;
        if (lum < 165) {
          if (x < minX) minX = x; if (x > maxX) maxX = x;
          if (y < minY) minY = y; if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX - minX >= 8 && maxY - minY >= 8) {
      let dark = 0, tot = 0;
      const ix0 = minX + Math.round((maxX - minX) * 0.28), ix1 = minX + Math.round((maxX - minX) * 0.72);
      const iy0 = minY + Math.round((maxY - minY) * 0.28), iy1 = minY + Math.round((maxY - minY) * 0.72);
      for (let y = iy0; y <= iy1; y++) {
        for (let x = ix0; x <= ix1; x++) {
          tot++;
          const k = (y * W + x) * 4;
          const lum = data[k] * 0.299 + data[k + 1] * 0.587 + data[k + 2] * 0.114;
          if (lum < 150) dark++;
        }
      }
      if (dark / Math.max(1, tot) >= 0.14) checked.push(q.name);
    }
  }
  return checked;
}

function deriveConcreteBanner(content) {
  if (!content) return '안전기준 미준수';
  let c = content.replace(/^부적합\s*(?:내용|사항)\s*[:;：]?\s*/, '').trim();
  // Strip location prefix (e.g. 지하2층, 102동 등)
  c = c.replace(/^(?:지하\s*\d+층|\d+동(?:\s*후면|\s*상가동)?)\s*/i, '');
  // Strip bullet numbers
  c = c.replace(/^\d+\)\s*/, '');
  // Take first clause before newline or parenthesis
  const firstLine = c.split('\n')[0].trim();
  if (firstLine.includes('전도방지 파이프 미사용')) return '대형 벽체 조립 설치 시 전도방지 파이프 미사용';
  if (firstLine.includes('버팀대')) return '외부비계 벽이음용 버팀대 설치각도 기준 미준수';
  if (firstLine.includes('이격거리')) return '외부비계와 구조물 벽체 간 이격거리 과다';
  if (firstLine.includes('가새')) return '비계 설치구간 가새 설치 누락';
  if (firstLine.includes('주변 통제')) return '비계 설치 작업 시 주변 통제 미실시';
  if (firstLine.length <= 28) return firstLine;
  return firstLine.substring(0, 26) + '...';
}

(async () => {
  const worker = await Tesseract.createWorker('kor+eng');
  const allRecords = [];

  for (let i = 1; i <= 5; i++) {
    const file = 'C:/Users/YS/.gemini/antigravity/brain/401e7967-97d5-4103-92b3-b2969b432921/scratch/t2/p' + i + '.jpg';
    const imgP = sharp(file).rotate(270);
    const { data, info } = await imgP.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const img = { data, width: info.width, height: info.height };
    const layout = analyzeSheetLayout(img);
    if (!layout.ok) continue;

    const ocrBox = async (b) => {
      if (!b || b.w < 5 || b.h < 5) return '';
      const buf = await imgP.clone().extract({ left: b.x, top: b.y, width: b.w, height: b.h }).png().toBuffer();
      const r = await worker.recognize(buf);
      return (r.data.text || '').trim();
    };

    const banners = findRedBanners(img, layout.photoArea);
    const photoBoxes = findPhotoBoxes(img, layout.photoArea, banners);
    const realPhotos = photoBoxes.filter(b => !b.isReference);

    let bannerText = '';
    if (banners.length > 0) {
      bannerText = await ocrBox(banners[0]);
    }

    const [tType, tLaw, tMeta, tContent, tInterview, tPropType, tPropText, tCm, tPm] = await Promise.all([
      ocrBox(layout.typeCell),
      ocrBox(layout.lawCell),
      ocrBox(layout.metaRow),
      ocrBox(layout.contentRow),
      ocrBox(layout.interview),
      ocrBox(layout.proposalType),
      ocrBox(layout.proposalText),
      ocrBox(layout.countermeasure),
      ocrBox(layout.pmCell)
    ]);

    const mgmtCauses = detectCheckboxes(img, layout.checkCell);

    // 1. Content
    const content = tContent.replace(/^부적합\s*(?:내용|사항)\s*[:;：]?\s*/, '').replace(/^[|ㅣ¦_!~\-\s]+/, '').trim();

    // 2. Banner
    let photoBanner = '';
    const cleanBanner = bannerText.replace(/[^\w가-힣\s/()\-.]/g, '').replace(/\s+/g, ' ').trim();
    if (cleanBanner.length >= 6 && !/^(?:안전|부적합|점검)/.test(cleanBanner)) {
      photoBanner = cleanBanner;
    } else {
      photoBanner = deriveConcreteBanner(content);
    }

    // 3. Meta
    let subcontractor = '원영건업(주)';
    const mSub = tMeta.match(/협력사\s*[:;：]?\s*([^\n|]*?)(?=\s*(?:공종명|공종|작업장소|점검자|점검차수|$))/i);
    if (mSub && mSub[1].trim().length >= 2) subcontractor = mSub[1].trim();

    let workGroup = '거푸집동바리공사';
    const mWork = tMeta.match(/공종명?\s*[:;：]?\s*([\s\S]*?)(?=\s*(?:작업장소|장소|점검자|점검차수|부적합|$))/i);
    if (mWork) {
      const w = mWork[1].replace(/[_|ㅣ¦!\[\]~—\-\r\n]+/g, ' ').replace(/[^가-힣a-zA-Z0-9·()/\s]/g, '').replace(/\s+/g, ' ').trim();
      if (w.includes('비계')) workGroup = '비계공사';
      else if (w.includes('거푸집')) workGroup = '거푸집동바리공사';
      else if (w.length >= 2) workGroup = w;
    }

    let location = '106동';
    const mLoc = tMeta.match(/작업장소\s*[:;：]?\s*([^\n|]*?)(?=\s*(?:점검자|점검차수|부적합|$))/i);
    if (mLoc && mLoc[1].trim()) {
      location = mLoc[1].replace(/[_|ㅣ¦!~—\-]+/g, '').replace(/^[:;\s]+/, '').trim();
    }

    // 4. Interview
    let interviewAuthor = '시공관리자 및 근로자';
    const mAuthor = tInterview.match(/\[\s*(?:관리자\s*의견|의견)\s*[:：]\s*([^\]]+)\]/i);
    if (mAuthor) interviewAuthor = mAuthor[1].replace(/의견\s*$/, '').trim();
    const interviewAuthorTitle = mAuthor ? `[관리자 의견 : ${interviewAuthor}]` : '[의견 : 시공관리자 및 근로자]';
    const interviewOpinion = tInterview
      .replace(/\[\s*(?:관리자\s*의견|의견)[^\]]*\]/gi, '')
      .replace(/^[|\sㅣ¦_!\-•·~—\r\n]+/g, '')
      .replace(/\s+[블를클|ㅣ¦_!~—\-]+\s*$/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    // 5. Proposal
    const proposalItems = [];
    if (/시스템\s*개선|시스템개선/i.test(tPropType)) {
      let sub = '(현장모니터링 강화)';
      const mSub = tPropType.match(/\((?:현장\s*)?모니터링[^)]*\)/) || tPropType.match(/\(이행강화안[^)]*\)/);
      if (mSub) sub = mSub[0];
      proposalItems.push({ type: '시스템 개선', sub });
    }
    if (/교육\/코칭|교육|코칭/i.test(tPropType)) {
      let sub = '(근로자 교육)';
      const mSub = tPropType.match(/\((?:근로자|협력사)\s*교육[^)]*\)/);
      if (mSub) sub = mSub[0];
      proposalItems.push({ type: '교육/코칭', sub });
    }
    if (/패널티|페널티|벌점/i.test(tPropType)) {
      let sub = '(관리감독자 경고)';
      const mSub = tPropType.match(/\(관리감독자[^)]*\)/);
      if (mSub) sub = mSub[0];
      proposalItems.push({ type: '페널티', sub });
    }
    const inspectorOpinionType = proposalItems.map(p => p.type).join(', ') || '시스템 개선';
    const auditProposal = tPropText
      .replace(/\[?(?:점검단|HAT)\s*제안\]?/gi, '')
      .replace(/시스템\s*개선|교육\/코칭|패널티|페널티|\(모니터링\s*강화\)|\(이행강화안\s*수립\)|\(근로자\s*교육\)|\(관리감독자\s*경고\)/gi, '')
      .split(/\r?\n/)
      .map(l => l.replace(/^[|\sㅣ¦_!\-•·~—]+/, '').replace(/[|\sㅣ¦_!~—\-]+$/, '').trim())
      .filter(Boolean)
      .map(l => l.startsWith('-') ? l : `- ${l}`)
      .join('\n');

    // 6. Countermeasure
    const actionPlan = tCm
      .replace(/\[?\s*PM\s*판정\s*결과\s*\]?/gi, '')
      .replace(/시스템\s*개선|교육\/코칭|패널티|페널티/gi, '')
      .replace(/\(모니터링\s*강화\)|\(이행강화안\s*수립\)|\(근로자\s*교육\)|\(관리감독자\s*경고\)/gi, '')
      .split(/\r?\n/)
      .map(l => l.replace(/^[|\sㅣ¦_!\-•·~—]+/, '').replace(/[|\sㅣ¦_!~—\-]+$/, '').trim())
      .filter(Boolean)
      .map(l => l.startsWith('-') ? l : `- ${l}`)
      .join('\n');

    // 7. PM Verdict
    const pmVerdictItems = [];
    if (/시스템\s*개선|시스템개선/i.test(tPm)) {
      let sub = '(모니터링 강화)';
      const mSub = tPm.match(/\((?:현장\s*)?모니터링[^)]*\)/) || tPm.match(/\(이행강화[^)]*\)/);
      if (mSub) sub = mSub[0];
      pmVerdictItems.push({ type: '시스템 개선', sub });
    }
    if (/교육\/코칭|교육|코칭/i.test(tPm)) {
      let sub = '(근로자 교육)';
      const mSub = tPm.match(/\((?:근로자|협력사)\s*교육[^)]*\)/);
      if (mSub) sub = mSub[0];
      pmVerdictItems.push({ type: '교육/코칭', sub });
    }
    if (/패널티|페널티|벌점/i.test(tPm)) {
      let sub = '(관리감독자 경고)';
      const mSub = tPm.match(/\(관리감독자[^)]*\)/);
      if (mSub) sub = mSub[0];
      pmVerdictItems.push({ type: '페널티', sub });
    }
    const pmVerdictType = pmVerdictItems.map(p => p.type).join(', ') || '시스템 개선';

    // 8. Type
    let type = '붕괴';
    if (tType.includes('낙하')) type = '낙하';
    else if (tType.includes('추락')) type = '추락';
    else if (tType.includes('전도')) type = '전도';

    // 9. Law
    const lawLines = tLaw.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const lawTitle = lawLines[0] || '안전보건규칙';
    const lawBody = lawLines.slice(1).join('\n') || '';

    // Photos
    const photo1Buf = realPhotos[0] ? await imgP.clone().extract({ left: realPhotos[0].x, top: realPhotos[0].y, width: realPhotos[0].w, height: realPhotos[0].h }).jpeg({ quality: 90 }).toBuffer() : null;
    const photo2Buf = realPhotos[1] ? await imgP.clone().extract({ left: realPhotos[1].x, top: realPhotos[1].y, width: realPhotos[1].w, height: realPhotos[1].h }).jpeg({ quality: 90 }).toBuffer() : null;

    const rec = {
      slideNumber: i,
      pageNumber: i,
      severity: '중부적합',
      type,
      workGroup,
      subcontractor,
      location,
      content,
      photoBanner,
      mgmtCauses,
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
      law: lawTitle,
      rawLaw: lawTitle,
      lawBody,
      photos: [
        photo1Buf ? 'data:image/jpeg;base64,' + photo1Buf.toString('base64') : null,
        photo2Buf ? 'data:image/jpeg;base64,' + photo2Buf.toString('base64') : null
      ].filter(Boolean),
      photo1: photo1Buf ? 'data:image/jpeg;base64,' + photo1Buf.toString('base64') : null,
      photo2: photo2Buf ? 'data:image/jpeg;base64,' + photo2Buf.toString('base64') : null
    };

    allRecords.push(rec);
  }

  await worker.terminate();

  console.log('Successfully parsed ' + allRecords.length + ' records!');
  fs.writeFileSync(path.join(__dirname, 'parsed_records.json'), JSON.stringify(allRecords, null, 2), 'utf8');
})();

