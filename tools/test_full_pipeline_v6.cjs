const fs = require('fs');
const sharp = require('sharp');
const Tesseract = require('tesseract.js');
const { analyzeSheetLayout, findRedBanners, findPhotoBoxes } = require('../app/js/sheet-layout.js');

function isRedBannerPixel(r, g, b) {
  return (r > 135 && g < 135 && b < 135 && (r - g) > 30 && (r - b) > 30);
}

function trimRedBannerFromBox(imgData, W, box) {
  let { x, y, w, h } = box;
  let y0 = y;
  let y1 = y + h - 1;

  // Trim from bottom up
  for (let cy = y1; cy >= y0 + Math.round(h * 0.4); cy--) {
    let redCount = 0;
    for (let cx = x; cx < x + w; cx += 2) {
      const idx = (cy * W + cx) * 4;
      if (isRedBannerPixel(imgData[idx], imgData[idx+1], imgData[idx+2])) redCount++;
    }
    const ratio = redCount / (w / 2);
    if (ratio > 0.22) {
      y1 = cy - 1;
    } else if (y1 < y + h - 10) {
      let isInside = false;
      for (let lookback = 1; lookback <= 8; lookback++) {
        let prevRed = 0;
        for (let cx = x; cx < x + w; cx += 2) {
          const idx = ((cy - lookback) * W + cx) * 4;
          if (isRedBannerPixel(imgData[idx], imgData[idx+1], imgData[idx+2])) prevRed++;
        }
        if (prevRed / (w / 2) > 0.22) { isInside = true; break; }
      }
      if (isInside) y1 = cy - 1;
      else break;
    }
  }

  // Trim from top down
  for (let cy = y0; cy <= y1 - Math.round(h * 0.4); cy++) {
    let redCount = 0;
    for (let cx = x; cx < x + w; cx += 2) {
      const idx = (cy * W + cx) * 4;
      if (isRedBannerPixel(imgData[idx], imgData[idx+1], imgData[idx+2])) redCount++;
    }
    const ratio = redCount / (w / 2);
    if (ratio > 0.22) {
      y0 = cy + 1;
    } else if (y0 > y + 5) {
      let isInside = false;
      for (let lookahead = 1; lookahead <= 8; lookahead++) {
        let nextRed = 0;
        for (let cx = x; cx < x + w; cx += 2) {
          const idx = ((cy + lookahead) * W + cx) * 4;
          if (isRedBannerPixel(imgData[idx], imgData[idx+1], imgData[idx+2])) nextRed++;
        }
        if (nextRed / (w / 2) > 0.22) { isInside = true; break; }
      }
      if (isInside) y0 = cy + 1;
      else break;
    }
  }

  return { x, y: y0, w, h: Math.max(10, y1 - y0 + 1) };
}

function cleanSubcontractor(mSubText) {
  if (!mSubText) return '';
  const cleaned = mSubText.replace(/[^가-힣a-zA-Z0-9()주\s]/g, '').trim();
  if (cleaned.length >= 2 && !/^(?:공종|작업|점검|비어|없음)/.test(cleaned)) {
    return cleaned;
  }
  return '';
}

function cleanLocation(rawLoc) {
  if (!rawLoc) return '';
  return String(rawLoc)
    .replace(/\b(?:ERE|EEE|ee|ere|MAK|261k|SEAT|CERNE|EEL)\b[\s\S]*$/i, '')
    .replace(/(?:점검자|점검차수|부적합)[\s\S]*$/i, '')
    .replace(/[\[\]{}()_ㅣ¦!~—\-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanWorkGroup(rawWork, contentText = '') {
  let w = String(rawWork || '')
    .replace(/^(?:HEY|HA|HE|공종명?)\s*[:;：]?\s*/i, '')
    .replace(/[_|ㅣ¦!\[\]~—\-\r\n]+/g, ' ')
    .replace(/[^가-힣a-zA-Z0-9·()/\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  const combined = `${w} ${contentText}`;
  if (combined.includes('비계') || /^(?:HA|HE|HEY|BEE)\s*공사$/i.test(w)) {
    return '비계공사';
  }
  if (combined.includes('거푸집') || combined.includes('동바리') || combined.includes('유로폼')) {
    return '거푸집동바리공사';
  }
  if (combined.includes('철근')) return '철근공사';
  if (combined.includes('콘크리트')) return '콘크리트공사';
  if (combined.includes('양중') || combined.includes('타워크레인') || combined.includes('크레인')) return '양중작업';
  if (combined.includes('토공') || combined.includes('흙막이')) return '토공사';

  return w.length >= 2 ? w : '비계공사';
}

function parseLawCell(tLaw, fallbackTitle = '산업안전보건기준에 관한 규칙') {
  const lines = tLaw.split(/\r?\n/)
    .map(l => l.replace(/^[|ㅣ¦!~—\-_=\[\]]+\s*/, '').replace(/[|ㅣ¦!~—\-_=\[\]]+$/, '').trim())
    .filter(Boolean);

  if (lines.length === 0) return { title: fallbackTitle, body: '' };

  let titleIdx = 0;
  if (lines.length > 1) {
    const l0 = lines[0];
    const isL0Noise = /^[0-9I=;:\s]+/.test(l0) && (/of\s*xi/i.test(l0) || /업적/i.test(l0) || l0.length < 15);
    const hasClearNextTitle = /(?:작업\s*절차|작업\s*지침|안전\s*지침|조립\s*기준|일반\s*사항|보건\s*규칙|안전보건규칙)/i.test(lines[1]);
    if (isL0Noise || (hasClearNextTitle && !/(?:작업\s*절차|작업\s*지침|안전\s*지침|조립\s*기준|일반\s*사항|보건\s*규칙)/i.test(l0))) {
      titleIdx = 1;
    }
  }

  const rawTitle = lines[titleIdx] || fallbackTitle;
  const title = rawTitle.replace(/^[0-9I=;:\s]+/, '').replace(/[|ㅣ¦!~—\-_=\[\]]+$/, '').trim();

  const bodyLines = lines.slice(titleIdx + 1).map(line => {
    return line
      .replace(/FEE\s*Joint/gi, '유로폼 Joint')
      .replace(/3060이하/g, '30cm 이하')
      .replace(/3000이하/g, '30cm 이하')
      .replace(/5500\b/g, '55cm')
      .replace(/55em\b/g, '55cm')
      .trim();
  }).filter(line => {
    if (/^[—\-_\s]+ee\b/i.test(line)) return false;
    return line.length >= 3;
  });

  return { title, body: bodyLines.join('\n') };
}

function cleanOpinionText(raw) {
  if (!raw) return '';
  let s = String(raw)
    .replace(/(?:\[?\s*(?:HAT|점검단)\s*제안\]?|시스템\s*개선|교육\/코칭)[\s\S]*$/gi, '')
    .replace(/^[\s|ㅣ¦_!\-•·~—]+/gm, '')
    .replace(/oo\s*(?:Tle|기느으|기느|기|©)[\s\S]*?(?=-)/gi, '')
    .replace(/(?:EE\s*tee|ee\s*A\s*eA|바가\s*---|\btee\s*ee\b|[—\-_]{3,})[\s\S]*$/gi, '')
    .replace(/3000이하/g, '30cm 이하')
    .replace(/5500\b/g, '55cm')
    .replace(/55em\b/g, '55cm')
    .replace(/\s+/g, ' ')
    .replace(/^[\s|ㅣ¦_!\-•·~—]+/, '')
    .replace(/[\s|ㅣ¦_!~—\-]*[블를클|ㅣ¦_!~—\-]+$/g, '')
    .replace(/\[=\]\s*oa/gi, '')
    .trim();
  if (/[가-힣]/.test(s) && /^[a-zA-Z0-9|.\s=\-_/!]+\s*-\s*(?=[가-힣])/.test(s)) {
    s = s.replace(/^[a-zA-Z0-9|.\s=\-_/!]+\s*-\s*(?=[가-힣])/, '');
  }
  return s.trim();
}

function cleanProposalText(raw) {
  if (!raw) return '';
  return String(raw)
    .replace(/\[?(?:점검단|HAT)\s*제안\]?/gi, '')
    .replace(/시스템\s*개선|교육\/코칭|패널티|페널티|\(모니터링\s*강화\)|\(이행강화안\s*수립\)|\(근로자\s*교육\)|\(관리감독자\s*경고\)/gi, '')
    .replace(/oo\s*(?:Tle|기느으|기느|기|©)[\s\S]*?(?=-)/gi, '')
    .replace(/(?:EE\s*tee|ee\s*A\s*eA|바가\s*---|\btee\s*ee\b|[—\-_]{3,})[\s\S]*$/gi, '')
    .split(/\r?\n/)
    .map(l => l.replace(/^[|\sㅣ¦_!\-•·~—]+/, '').replace(/[|\sㅣ¦_!~—\-]+$/, '').trim())
    .filter(Boolean)
    .map(l => l.startsWith('- ') ? l : `- ${l}`)
    .join('\n');
}

function cleanActionPlan(raw) {
  if (!raw) return '';
  const lines = String(raw)
    .replace(/\[?\s*PM\s*판정\s*결과\s*\]?/gi, '')
    .replace(/시스템\s*개선|교육\/코칭|패널티|페널티/gi, '')
    .replace(/\(모니터링\s*강화\)|\(이행강화안\s*수립\)|\(근로자\s*교육\)|\(관리감독자\s*경고\)/gi, '')
    .replace(/(?:EE\s*tee|ee\s*A\s*eA|바가\s*---|\btee\s*ee\b|[—\-_]{3,})[\s\S]*$/gi, '')
    .split(/\r?\n/)
    .map(l => l.replace(/^[|ㅣ¦_!~—\-*•·\s&]+/, '').replace(/[|ㅣ¦_!~—\-&]+$/, '').trim())
    .map(l => {
      if (l.includes('비계 승인점검 후 보완/개선') || l.includes('Process 이행')) {
        return '비계 승인점검 후 보완/개선 필요사항 Process 이행';
      }
      return l;
    })
    .filter(l => l.length >= 7 && !/(?:사각후크|그림\s*참조|상하\s*방향|900mm|보강\s*예|시스템\s*개선|교육\/코칭|&제레)/i.test(l))
    .map(l => l.startsWith('- ') ? l : `- ${l}`);
  return lines.join('\n');
}

function cleanContent(raw) {
  if (!raw) return '';
  return String(raw)
    .replace(/^부적합\s*(?:내용|사항)\s*[:;：]?\s*/, '')
    .replace(/^[|ㅣ¦_!~\-\s]+/, '')
    .replace(/(?:EE\s*tee|ee\s*A\s*eA|바가\s*---|\btee\s*ee\b|[—\-_]{3,})[\s\S]*$/gi, '')
    .replace(/6\/\\\s*코어/gi, 'E/V 코어')
    .replace(/6\/\\/g, 'E/V')
    .replace(/4%\s*11일/g, '4월 11일')
    .replace(/5500\b/g, '55cm')
    .replace(/55em\b/g, '55cm')
    .replace(/HEL\s*설치\s*불량/g, '버팀대 설치 불량')
    .replace(/HE\s*위치가/g, '버팀대 위치가')
    .split(/\r?\n/)
    .map(l => l.replace(/^[|ㅣ¦_!~\-\s]+/, '').replace(/[|ㅣ¦_!~\-\s]+$/, '').trim())
    .filter(l => l.length >= 3 && !/^[—\-_\s]+ee\b/i.test(l))
    .join('\n');
}

async function verifyAll() {
  console.log('Testing full extraction and cleaning on pages 0..4:');
  for (let i = 0; i < 5; i++) {
    const file = `tools/landscape_p${i}.jpg`;
    const { data, info } = await sharp(file).raw().ensureAlpha().toBuffer({ resolveWithObject: true });
    const imgData = { data, width: info.width, height: info.height };
    const layout = analyzeSheetLayout(imgData);
    if (!layout || !layout.ok) continue;

    const banners = findRedBanners(imgData, layout.photoArea);
    const photoBoxes = findPhotoBoxes(imgData, layout.photoArea, banners);
    const realBoxes = photoBoxes
      .filter(b => !b.isReference)
      .map(b => trimRedBannerFromBox(data, info.width, b));

    async function ocr(box) {
      if (!box || box.w < 5 || box.h < 5) return '';
      const crop = await sharp(file).extract({ left: box.x, top: box.y, width: box.w, height: box.h }).toBuffer();
      const ret = await Tesseract.recognize(crop, 'kor+eng');
      return ret.data.text.trim();
    }

    const [tMeta, tLaw, tContent, tInterview, tPropType, tPropText, tCm, tPm] = await Promise.all([
      ocr(layout.metaRow),
      ocr(layout.lawCell),
      ocr(layout.contentRow),
      ocr(layout.interview),
      ocr(layout.proposalType),
      ocr(layout.proposalText),
      ocr(layout.countermeasure),
      ocr(layout.pmCell)
    ]);

    const mSub = tMeta.match(/협력사\s*[:;：]?\s*([^\n|]*?)(?=\s*(?:공종명|공종|작업장소|점검자|점검차수|$))/i);
    const subcontractor = cleanSubcontractor(mSub ? mSub[1] : '');

    const mLoc = tMeta.match(/작업장소\s*[:;：]?\s*([^\n|]*?)(?=\s*(?:점검자|점검차수|부적합|$))/i);
    const location = cleanLocation(mLoc ? mLoc[1] : '');

    const content = cleanContent(tContent);

    const mWork = tMeta.match(/공종명?\s*[:;：]?\s*([\s\S]*?)(?=\s*(?:작업장소|장소|점검자|점검차수|부적합|$))/i);
    const workGroup = cleanWorkGroup(mWork ? mWork[1] : '', content);

    const lawParsed = parseLawCell(tLaw);

    const mAuthor = tInterview.match(/\[\s*(?:관리자\s*의견|의견)\s*[:：]\s*([^\]]+)\]/i);
    const interviewAuthor = mAuthor ? mAuthor[1].replace(/의견\s*$/, '').trim() : '시공관리자 및 근로자';
    const interviewAuthorTitle = `[관리자 의견 : ${interviewAuthor}]`;
    const interviewOpinion = cleanOpinionText(tInterview.replace(/\[\s*(?:관리자\s*의견|의견)[^\]]*\]/gi, ''));

    const proposalItems = [];
    const fullProp = `${tPropType} ${tPropText}`;
    if (/시스템\s*개선/i.test(fullProp)) proposalItems.push({ type: '시스템 개선', sub: '(현장모니터링 강화)' });
    if (/교육\/코칭/i.test(fullProp)) proposalItems.push({ type: '교육/코칭', sub: '(근로자 교육)' });
    if (/패널티|페널티/i.test(fullProp)) proposalItems.push({ type: '페널티', sub: '(관리감독자 경고)' });
    const inspectorOpinionType = proposalItems.map(p => p.type).join(', ') || '시스템 개선';
    const auditProposal = cleanProposalText(tPropText);

    const actionPlan = cleanActionPlan(tCm);

    const pmItems = [];
    if (/시스템\s*개선/i.test(tPm)) pmItems.push({ type: '시스템 개선', sub: '(모니터링 강화)' });
    if (/교육\/코칭/i.test(tPm)) pmItems.push({ type: '교육/코칭', sub: '(근로자 교육)' });
    if (/패널티|페널티/i.test(tPm)) pmItems.push({ type: '페널티', sub: '(관리감독자 경고)' });
    const pmVerdictType = pmItems.map(p => p.type).join(', ') || '시스템 개선';

    console.log(`\n========================================`);
    console.log(`PAGE ${i} RESULTS:`);
    console.log(`- Subcontractor: "${subcontractor}" (Must NOT be '원영건업(주)' if blank)`);
    console.log(`- Location: "${location}" (Must NOT contain '[ERE', 'MAK', etc.)`);
    console.log(`- WorkGroup: "${workGroup}" (Must NOT be 'HA 공사' or 'HEY: 비계' or have '_ |')`);
    console.log(`- Law Title: "${lawParsed.title}" (Must NOT be '5: 형 거푸집공 업적')`);
    console.log(`- Proposal Types: "${inspectorOpinionType}" (Must have 2 if both checked)`);
    console.log(`- Interview Author: "${interviewAuthorTitle}"`);
    console.log(`- Interview Opinion: "${interviewOpinion}" (Must NOT end with '블')`);
    console.log(`- Audit Proposal: "${auditProposal}" (Must NOT start with '| -')`);
    console.log(`- Action Plan:\n${actionPlan}`);
    console.log(`- PM Verdict: "${pmVerdictType}"`);
    console.log(`- Real Photo Boxes Count: ${realBoxes.length}`);
    realBoxes.forEach((b, bi) => {
      console.log(`  Photo ${bi+1}: x=${b.x}, y=${b.y}, w=${b.w}, h=${b.h}, bottomY=${b.y+b.h}`);
    });
  }
}

verifyAll();
