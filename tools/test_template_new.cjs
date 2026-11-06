const fs = require('fs');
global.window = {};
global.Blob = class Blob {};
global.URL = { createObjectURL: () => '', revokeObjectURL: () => '' };
const PptxGenJS = require('pptxgenjs');
global.PptxGenJS = PptxGenJS;

const FONT_MALGUN = '맑은 고딕';
const C_BORDER = '7BA0CD';
const C_HEADER_BG = 'DCE6F1';
const C_TITLE_BLUE = '002060';
const C_YELLOW_BG = 'FFE699';
const C_RED = 'C00000';
const C_ORANGE = 'ED7D31';
const C_ACCENT_BLUE = '4472C4';

require('../app/js/ppt-generator.js');
const SafePPT = globalThis.SafePPT;

// Let's create an updated addInspectionSheetSlide implementation inside a test function
// and verify it against 템플릿/부적합 장표.pptx
async function addInspectionSheetSlideNew(pptx, record, options = {}) {
  const { loadPhotoBase64, rulesFromTaxonomy = [] } = options;
  const data = SafePPT.normalizeJangpyoData(record, rulesFromTaxonomy);

  const slide = pptx.addSlide();
  slide.background = { color: 'FFFFFF' };

  // ── 1. 최상단 행 (y = 0.163, h = 0.914, 전체 너비 13.02 in: x = 0.120 ~ 13.140) ──
  // 1) 시설물/법규 (x = 0.120, w = 1.791, h = 0.914)
  slide.addShape(pptx.ShapeType.rect, {
    x: 0.120, y: 0.163, w: 1.791, h: 0.914,
    fill: { color: C_HEADER_BG }, line: { color: C_BORDER, width: 1.2 }
  });
  slide.addText('시설물/법규', {
    x: 0.120, y: 0.163, w: 1.791, h: 0.914,
    fontFace: FONT_MALGUN, fontSize: 18, bold: true, color: C_TITLE_BLUE,
    align: 'center', valign: 'middle', margin: 0
  });

  // 3) 관련기준 라벨 (x = 3.592, w = 0.684, h = 0.914)
  slide.addShape(pptx.ShapeType.rect, {
    x: 3.592, y: 0.163, w: 0.684, h: 0.914,
    fill: { color: C_HEADER_BG }, line: { color: C_BORDER, width: 1.2 }
  });
  slide.addText('관련\n기준', {
    x: 3.592, y: 0.163, w: 0.684, h: 0.914,
    fontFace: FONT_MALGUN, fontSize: 14, bold: true, color: C_TITLE_BLUE,
    align: 'center', valign: 'middle', lineSpacingMultiple: 1.15
  });

  // 2) 사고유형 & 부적합등급 (x = 1.967, w = 1.568, h = 0.914, 4면 오렌지 2.5pt 테두리)
  slide.addShape(pptx.ShapeType.rect, {
    x: 1.967, y: 0.163, w: 1.568, h: 0.914,
    fill: { color: 'FFFFFF' }, line: { color: C_ORANGE, width: 2.5 }
  });
  if (data.typeSub) {
    slide.addText([
      { text: `${data.typeMain}\n`, options: { fontSize: 16, bold: true, color: '000000', fontFace: FONT_MALGUN } },
      { text: `${data.typeSub}\n`, options: { fontSize: 11, bold: true, color: '333333', fontFace: FONT_MALGUN } },
      { text: `[${data.severity}]`, options: { fontSize: 14, bold: true, color: data.isMajor ? C_RED : C_ORANGE, fontFace: FONT_MALGUN } }
    ], {
      x: 1.967, y: 0.163, w: 1.568, h: 0.914,
      align: 'center', valign: 'middle', lineSpacingMultiple: 1.05, margin: 0
    });
  } else {
    slide.addText([
      { text: `${data.typeMain}\n`, options: { fontSize: 18, bold: true, color: '000000', fontFace: FONT_MALGUN } },
      { text: `[${data.severity}]`, options: { fontSize: 15, bold: true, color: data.isMajor ? C_RED : C_ORANGE, fontFace: FONT_MALGUN } }
    ], {
      x: 1.967, y: 0.163, w: 1.568, h: 0.914,
      align: 'center', valign: 'middle', lineSpacingMultiple: 1.15, margin: 0
    });
  }

  // 4) 관련기준 내용 (x = 4.276, w = 5.832, h = 0.914, 2단 분할: 윗칸 14pt 볼드 제목 + 가로선 + 아랫칸 13pt 본문)
  slide.addShape(pptx.ShapeType.rect, {
    x: 4.276, y: 0.163, w: 5.832, h: 0.914,
    fill: { color: 'FFFFFF' }, line: { color: C_BORDER, width: 1.2 }
  });
  const lawTitleFontSize = data.lawTitle.length > 34 ? 12 : (data.lawTitle.length > 25 ? 13 : 14);
  slide.addText(data.lawTitle, {
    x: 4.276, y: 0.163, w: 5.832, h: 0.350,
    fontFace: FONT_MALGUN, fontSize: lawTitleFontSize, bold: true, color: '000000',
    align: 'left', valign: 'middle', wrap: false, margin: [0, 8, 0, 8]
  });
  // 가로 구분선 (y = 0.513)
  slide.addShape(pptx.ShapeType.line, {
    x: 4.276, y: 0.513, w: 5.832, h: 0,
    line: { color: C_BORDER, width: 1.0 }
  });
  // 아랫칸 연한 배경 박스
  slide.addShape(pptx.ShapeType.rect, {
    x: 4.286, y: 0.523, w: 5.812, h: 0.544,
    fill: { color: 'F2F4F7' }, line: { color: 'F2F4F7', width: 0 }
  });
  const lawBodyFontSize = data.lawBody.length > 80 ? 11.5 : (data.lawBody.length > 55 ? 12.5 : 13);
  slide.addText(data.lawBody, {
    x: 4.276, y: 0.513, w: 5.832, h: 0.564,
    fontFace: FONT_MALGUN, fontSize: lawBodyFontSize, color: '111111',
    align: 'left', valign: 'middle', margin: [2, 8, 2, 8], lineSpacingMultiple: 1.18
  });

  // 5) 4대 발생요인 (x = 10.165, y = 0.163, w = 2.975, h = 0.914, 4개 분면 셀, 체크박스 16pt, 텍스트 14pt bold)
  slide.addShape(pptx.ShapeType.rect, {
    x: 10.165, y: 0.163, w: 2.975, h: 0.914,
    fill: { color: 'FFFFFF' }, line: { color: C_BORDER, width: 1.2 }
  });
  // 가로 구분선 (y = 0.620)
  slide.addShape(pptx.ShapeType.line, {
    x: 10.165, y: 0.620, w: 2.975, h: 0,
    line: { color: C_BORDER, width: 1.0 }
  });
  // 세로 구분선 (x = 11.652)
  slide.addShape(pptx.ShapeType.line, {
    x: 11.652, y: 0.163, w: 0, h: 0.914,
    line: { color: C_BORDER, width: 1.0 }
  });
  // 4개 셀
  slide.addText([
    { text: data.isUnplanned ? '☑ ' : '☐ ', options: { fontSize: 16, bold: true, color: '000000', fontFace: FONT_MALGUN } },
    { text: '계획 미수립', options: { fontSize: 14, bold: true, color: '000000', fontFace: FONT_MALGUN } }
  ], { x: 10.165, y: 0.163, w: 1.487, h: 0.457, align: 'center', valign: 'middle', wrap: false, margin: 0 });

  slide.addText([
    { text: data.isUnexecuted ? '☑ ' : '☐ ', options: { fontSize: 16, bold: true, color: '000000', fontFace: FONT_MALGUN } },
    { text: '계획 미이행', options: { fontSize: 14, bold: true, color: '000000', fontFace: FONT_MALGUN } }
  ], { x: 11.652, y: 0.163, w: 1.487, h: 0.457, align: 'center', valign: 'middle', wrap: false, margin: 0 });

  slide.addText([
    { text: data.isAction ? '☑ ' : '☐ ', options: { fontSize: 16, bold: true, color: '000000', fontFace: FONT_MALGUN } },
    { text: '불안전 행동', options: { fontSize: 14, bold: true, color: '000000', fontFace: FONT_MALGUN } }
  ], { x: 10.165, y: 0.620, w: 1.487, h: 0.457, align: 'center', valign: 'middle', wrap: false, margin: 0 });

  slide.addText([
    { text: data.isCondition ? '☑ ' : '☐ ', options: { fontSize: 16, bold: true, color: '000000', fontFace: FONT_MALGUN } },
    { text: '불안전 상태', options: { fontSize: 14, bold: true, color: '000000', fontFace: FONT_MALGUN } }
  ], { x: 11.652, y: 0.620, w: 1.487, h: 0.457, align: 'center', valign: 'middle', wrap: false, margin: 0 });

  // ── 2. 부적합 개요 행 (y = 1.125, h = 0.811, x = 0.120 ~ 13.140, 총 너비 13.020) ──
  // '부적합 개요' 라벨 (x = 0.120, w = 1.090, h = 0.811)
  slide.addShape(pptx.ShapeType.rect, {
    x: 0.120, y: 1.125, w: 1.090, h: 0.811,
    fill: { color: C_YELLOW_BG }, line: { color: C_BORDER, width: 1.2 }
  });
  slide.addText([
    { text: '부 적 합\n', options: { fontSize: 14, bold: true, color: '000000', fontFace: FONT_MALGUN } },
    { text: '개    요', options: { fontSize: 14, bold: true, color: '000000', fontFace: FONT_MALGUN } }
  ], {
    x: 0.120, y: 1.125, w: 1.090, h: 0.811,
    align: 'center', valign: 'middle', lineSpacingMultiple: 1.15, margin: 0
  });

  // 부적합 개요 1행: 5개 독립 셀 (x = 1.210 ~ 13.140, w = 11.930, h = 0.406)
  // 협력사 (x = 1.210, w = 2.45)
  slide.addShape(pptx.ShapeType.rect, {
    x: 1.210, y: 1.125, w: 2.45, h: 0.406,
    fill: { color: 'FFFFFF' }, line: { color: C_BORDER, width: 1.0 }
  });
  slide.addText([
    { text: '협력사 : ', options: { bold: true, color: C_ACCENT_BLUE, fontFace: FONT_MALGUN, fontSize: 14 } },
    { text: data.subcontractor, options: { bold: true, color: '000000', fontFace: FONT_MALGUN, fontSize: 14 } }
  ], { x: 1.210, y: 1.125, w: 2.45, h: 0.406, align: 'left', valign: 'middle', margin: [0, 6, 0, 6] });

  // 공종명 (x = 3.660, w = 2.45)
  slide.addShape(pptx.ShapeType.rect, {
    x: 3.660, y: 1.125, w: 2.45, h: 0.406,
    fill: { color: 'FFFFFF' }, line: { color: C_BORDER, width: 1.0 }
  });
  slide.addText([
    { text: '공종명 : ', options: { bold: true, color: C_ACCENT_BLUE, fontFace: FONT_MALGUN, fontSize: 14 } },
    { text: data.workGroup, options: { bold: true, color: '000000', fontFace: FONT_MALGUN, fontSize: 14 } }
  ], { x: 3.660, y: 1.125, w: 2.45, h: 0.406, align: 'left', valign: 'middle', margin: [0, 6, 0, 6] });

  // 작업장소 (x = 6.110, w = 2.30)
  slide.addShape(pptx.ShapeType.rect, {
    x: 6.110, y: 1.125, w: 2.30, h: 0.406,
    fill: { color: 'FFFFFF' }, line: { color: C_BORDER, width: 1.0 }
  });
  slide.addText([
    { text: '작업장소 : ', options: { bold: true, color: C_ACCENT_BLUE, fontFace: FONT_MALGUN, fontSize: 14 } },
    { text: data.location, options: { bold: true, color: '000000', fontFace: FONT_MALGUN, fontSize: 14 } }
  ], { x: 6.110, y: 1.125, w: 2.30, h: 0.406, align: 'left', valign: 'middle', margin: [0, 6, 0, 6] });

  // 점검자 (x = 8.410, w = 2.30)
  slide.addShape(pptx.ShapeType.rect, {
    x: 8.410, y: 1.125, w: 2.30, h: 0.406,
    fill: { color: 'FFFFFF' }, line: { color: C_BORDER, width: 1.0 }
  });
  slide.addText([
    { text: '점검자 : ', options: { bold: true, color: C_ACCENT_BLUE, fontFace: FONT_MALGUN, fontSize: 14 } },
    { text: data.inspector, options: { bold: true, color: '000000', fontFace: FONT_MALGUN, fontSize: 14 } }
  ], { x: 8.410, y: 1.125, w: 2.30, h: 0.406, align: 'left', valign: 'middle', margin: [0, 6, 0, 6] });

  // 점검차수 (x = 10.710, w = 2.43)
  slide.addShape(pptx.ShapeType.rect, {
    x: 10.710, y: 1.125, w: 2.43, h: 0.406,
    fill: { color: 'FFFFFF' }, line: { color: C_BORDER, width: 1.0 }
  });
  slide.addText([
    { text: '점검차수 : ', options: { bold: true, color: C_ACCENT_BLUE, fontFace: FONT_MALGUN, fontSize: 14 } },
    { text: data.inspectRound, options: { bold: true, color: '000000', fontFace: FONT_MALGUN, fontSize: 14 } }
  ], { x: 10.710, y: 1.125, w: 2.43, h: 0.406, align: 'left', valign: 'middle', margin: [0, 6, 0, 6] });

  // 부적합 개요 2행: 부적합 내용 전체 너비 사각형 (x = 1.210 ~ 13.140, w = 11.930, h = 0.405)
  slide.addShape(pptx.ShapeType.rect, {
    x: 1.210, y: 1.531, w: 11.930, h: 0.405,
    fill: { color: 'FFFFFF' }, line: { color: C_BORDER, width: 1.0 }
  });
  slide.addText([
    { text: '부적합 내용 : ', options: { bold: true, color: C_ACCENT_BLUE, fontFace: FONT_MALGUN, fontSize: 14 } },
    { text: data.mainContentParts.prefix, options: { bold: true, color: '000000', fontFace: FONT_MALGUN, fontSize: 14 } },
    { text: data.mainContentParts.highlight, options: { bold: true, color: C_RED, fontFace: FONT_MALGUN, fontSize: 14 } },
    { text: data.mainContentParts.suffix, options: { bold: true, color: C_TITLE_BLUE, fontFace: FONT_MALGUN, fontSize: 14 } }
  ], {
    x: 1.210, y: 1.531, w: 11.930, h: 0.405,
    align: 'left', valign: 'middle', margin: [0, 8, 0, 8], lineSpacingMultiple: 1.10
  });

  // ── 3. 본문 구역 (y = 2.207 ~ 7.236, 총 높이 5.029") ──
  // 우측 컬럼: x = 8.395, w = 4.711
  // 좌측 사진: x = 0.120, w = 8.218

  // 1) 우측 컬럼 헤더 1: 발생원인 (인터뷰 결과) (y = 2.207, h = 0.406)
  slide.addShape(pptx.ShapeType.rect, {
    x: 8.395, y: 2.207, w: 4.711, h: 0.406,
    fill: { color: C_YELLOW_BG }, line: { color: C_BORDER, width: 1.2 }
  });
  slide.addText('발생원인 (인터뷰 결과)', {
    x: 8.395, y: 2.207, w: 4.711, h: 0.406,
    fontFace: FONT_MALGUN, fontSize: 14, bold: true, color: '000000', align: 'center', valign: 'middle'
  });

  // 2) 우측 컬럼: 발생원인 의견 & 점검단 제안 (y = 2.650, h = 2.917)
  slide.addShape(pptx.ShapeType.rect, {
    x: 8.395, y: 2.650, w: 4.711, h: 2.917,
    fill: { color: 'FFFFFF' }, line: { color: C_BORDER, width: 1.2 }
  });
  // 윗칸: [의견 : 시공관리자 및 근로자] (h = 1.843)
  slide.addText([
    { text: '[ 의견 : 시공관리자 및 근로자 ]\n', options: { fontSize: 14, bold: true, color: '000000', fontFace: FONT_MALGUN } },
    { text: data.interviewOpinion, options: { fontSize: 13, color: '111111', fontFace: FONT_MALGUN } }
  ], {
    x: 8.395, y: 2.650, w: 4.711, h: 1.843,
    margin: [6, 10, 4, 10], valign: 'top', lineSpacingMultiple: 1.20
  });
  // 가로 분리선 (y = 4.493)
  slide.addShape(pptx.ShapeType.line, {
    x: 8.395, y: 4.493, w: 4.711, h: 0,
    line: { color: C_BORDER, width: 1.0 }
  });
  // 아랫칸: 점검단 제안 (h = 1.074, 좌측 w = 1.434, 우측 w = 3.277)
  slide.addShape(pptx.ShapeType.line, {
    x: 9.829, y: 4.493, w: 0, h: 1.074,
    line: { color: C_BORDER, width: 1.0 }
  });
  slide.addText([
    { text: '[점검단 제안]\n', options: { fontSize: 14, bold: true, color: '000000', fontFace: FONT_MALGUN } },
    { text: `${data.proposalType}\n`, options: { fontSize: 14, bold: true, color: C_ACCENT_BLUE, fontFace: FONT_MALGUN } },
    { text: data.proposalSub, options: { fontSize: 11, color: '595959', fontFace: FONT_MALGUN } }
  ], {
    x: 8.395, y: 4.493, w: 1.434, h: 1.074,
    align: 'center', valign: 'middle', lineSpacingMultiple: 1.15
  });
  slide.addText(data.proposalContent, {
    x: 9.829, y: 4.493, w: 3.277, h: 1.074,
    fontFace: FONT_MALGUN, fontSize: 13, color: '111111', margin: [6, 10, 4, 10], valign: 'top', lineSpacingMultiple: 1.20
  });

  // 3) 우측 컬럼 헤더 2: 개선대책 (현장 협의 결과) (y = 5.660, h = 0.406)
  slide.addShape(pptx.ShapeType.rect, {
    x: 8.395, y: 5.660, w: 4.711, h: 0.406,
    fill: { color: C_YELLOW_BG }, line: { color: C_BORDER, width: 1.2 }
  });
  slide.addText('개선대책 (현장 협의 결과)', {
    x: 8.395, y: 5.660, w: 4.711, h: 0.406,
    fontFace: FONT_MALGUN, fontSize: 14, bold: true, color: '000000', align: 'center', valign: 'middle'
  });

  // 4) 우측 컬럼: 개선대책 본문 & PM 판정결과 (y = 6.102, h = 1.134)
  slide.addShape(pptx.ShapeType.rect, {
    x: 8.395, y: 6.102, w: 4.711, h: 1.134,
    fill: { color: 'FFFFFF' }, line: { color: C_BORDER, width: 1.2 }
  });
  slide.addShape(pptx.ShapeType.line, {
    x: 11.599, y: 6.102, w: 0, h: 1.134,
    line: { color: C_BORDER, width: 1.0 }
  });
  // 개선대책 본문 (좌측 w = 3.204)
  if (data.countermeasureContent) {
    slide.addText(data.countermeasureContent, {
      x: 8.395, y: 6.102, w: 3.204, h: 1.134,
      fontFace: FONT_MALGUN, fontSize: 13, bold: true, color: '000000', margin: [6, 10, 4, 10], valign: 'top', lineSpacingMultiple: 1.22
    });
  }
  // PM 판정결과 (우측 w = 1.507)
  const pmRuns = [
    { text: '[PM 판정결과]', options: { fontSize: 14, bold: true, color: '000000', fontFace: FONT_MALGUN } }
  ];
  if (data.pmVerdictType) {
    pmRuns.push({ text: `\n\n${data.pmVerdictType}\n`, options: { fontSize: 14, bold: true, color: C_ACCENT_BLUE, fontFace: FONT_MALGUN } });
    if (data.pmVerdictSub) {
      pmRuns.push({ text: data.pmVerdictSub, options: { fontSize: 11, color: '595959', fontFace: FONT_MALGUN } });
    }
  }
  slide.addText(pmRuns, {
    x: 11.599, y: 6.102, w: 1.507, h: 1.134,
    align: 'center', valign: data.pmVerdictType ? 'middle' : 'top', lineSpacingMultiple: 1.15, margin: [8, 4, 8, 4]
  });

  // ── 좌측 컬럼: 사진 영역 및 Hold Point (x = 0.120 ~ 8.338, w = 8.218) ──
  let photo1Base64 = null;
  let photo2Base64 = null;
  if (loadPhotoBase64) {
    try { photo1Base64 = await loadPhotoBase64((record.photos && record.photos[0]) || '', record, 0); } catch (e) {}
    try { photo2Base64 = await loadPhotoBase64((record.photos && record.photos[1]) || (record.fix && record.fix.photo) || '', record, 1); } catch (e) {}
  }
  const hasPhoto2 = Boolean(photo2Base64);

  // Hold Point 위반 박스 (x = 5.975, y = 2.207, w = 2.363, h = 0.406)
  slide.addShape(pptx.ShapeType.rect, {
    x: 5.975, y: 2.207, w: 2.363, h: 0.406,
    fill: { color: 'FFFFFF' }, line: { color: C_BORDER, width: 1.2 }
  });
  slide.addText([
    { text: data.isHoldPoint ? '☑ ' : '☐ ', options: { fontSize: 18, bold: true, color: '000000', fontFace: FONT_MALGUN } },
    { text: 'Hold Point 위반 (N/A)', options: { fontSize: 12, bold: true, color: '333333', fontFace: FONT_MALGUN } }
  ], {
    x: 5.975, y: 2.207, w: 2.363, h: 0.406,
    align: 'center', valign: 'middle', wrap: false, margin: 0
  });

  // 사진 1 상단 배너 (x = 0.120, y = 2.207, w = 5.750, h = 0.406)
  slide.addShape(pptx.ShapeType.rect, {
    x: 0.120, y: 2.207, w: 5.750, h: 0.406,
    fill: { color: 'EA7676' }, line: { color: 'EA7676', width: 1 }
  });
  slide.addText(data.photo1Title, {
    x: 0.120, y: 2.207, w: 5.750, h: 0.406,
    fontFace: FONT_MALGUN, fontSize: 12, bold: true, color: 'FFFFFF',
    align: 'center', valign: 'middle', wrap: false, margin: 0
  });

  const photoBodyHeight = 4.586; // 2.650 ~ 7.236

  if (hasPhoto2) {
    // 2개 사진 배치
    // 사진 1 (좌측, w = 4.050)
    if (photo1Base64) {
      slide.addImage({
        data: photo1Base64,
        x: 0.120, y: 2.650, w: 4.050, h: photoBodyHeight,
        sizing: { type: 'contain', w: 4.050, h: photoBodyHeight }
      });
    } else {
      slide.addShape(pptx.ShapeType.rect, {
        x: 0.120, y: 2.650, w: 4.050, h: photoBodyHeight,
        fill: { color: 'F1F5F9' }, line: { color: 'CBD5E1', width: 1 }
      });
      slide.addText('📸 사진 1', {
        x: 0.120, y: 2.650, w: 4.050, h: photoBodyHeight,
        fontFace: FONT_MALGUN, fontSize: 12, color: '64748B', align: 'center', valign: 'middle'
      });
    }

    // 사진 2 (우측, w = 4.108)
    // 상단 배너 (h = 0.380)
    slide.addShape(pptx.ShapeType.rect, {
      x: 4.230, y: 2.650, w: 4.108, h: 0.380,
      fill: { color: 'EA7676' }, line: { color: 'EA7676', width: 1 }
    });
    slide.addText(data.photo2Title, {
      x: 4.230, y: 2.650, w: 4.108, h: 0.380,
      fontFace: FONT_MALGUN, fontSize: 12, bold: true, color: 'FFFFFF',
      align: 'center', valign: 'middle', wrap: false, margin: 0
    });
    // 사진 2 이미지
    slide.addImage({
      data: photo2Base64,
      x: 4.230, y: 3.060, w: 4.108, h: photoBodyHeight - 0.410,
      sizing: { type: 'contain', w: 4.108, h: photoBodyHeight - 0.410 }
    });
  } else {
    // 1개 단일 사진 (w = 8.218 시원한 전폭 확장!)
    if (photo1Base64) {
      slide.addImage({
        data: photo1Base64,
        x: 0.120, y: 2.650, w: 8.218, h: photoBodyHeight,
        sizing: { type: 'contain', w: 8.218, h: photoBodyHeight }
      });
    } else {
      slide.addShape(pptx.ShapeType.rect, {
        x: 0.120, y: 2.650, w: 8.218, h: photoBodyHeight,
        fill: { color: 'F1F5F9' }, line: { color: 'CBD5E1', width: 1 }
      });
      slide.addText('📸 현장 사진', {
        x: 0.120, y: 2.650, w: 8.218, h: photoBodyHeight,
        fontFace: FONT_MALGUN, fontSize: 14, color: '64748B', align: 'center', valign: 'middle'
      });
    }
  }
}

async function run() {
  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: 'WIDE_16_9', width: 13.333, height: 7.5 });
  pptx.layout = 'WIDE_16_9';

  const userRecord1 = {
    id: 'test-template-match-2',
    type: '넘어짐(전도:사람)',
    severity: '경부적합',
    isMajor: false,
    law: '산업안전보건기준에 관한 규칙 제38조(사전조사 및 작업계획서의 작성 등)',
    causes: ['불안전 상태', '계획 미이행'],
    subcontractor: '원영건업(주)',
    workGroup: '철근콘크리트공사',
    location: '계단·복도',
    inspector: '신이삭',
    inspectRound: '3차',
    content: '구획된 바닥 안전통로에 거푸집 자재를 방치함',
    interviewOpinion: '통로 구획 표시는 되어 있었으나 후속 반입 자재 임시 적재 공간이 부족하여 부득이하게 통로 일부에 거푸집을 적재하게 되었음.',
    proposalType: '시스템 개선',
    proposalSub: '(모니터링강화)',
    proposalContent: '자재 적치 구획선을 재정비하고 통로 내 자재 방치 즉시 이동 조치 및 일일 순회 패트롤 시 통로 확보 여부를 중점 확인해야 함.',
    countermeasureContent: '안전통로 내 적치된 거푸집 즉시 외부 야적장으로 반출 완료 및 작업팀 전원 통로 확보 교육 실시.',
    pmVerdictType: '시스템 개선',
    pmVerdictSub: '(모니터링강화)'
  };

  const dummyPhoto1 = 'image/jpeg;base64,' + fs.readFileSync('app/samples/horizontal_photo2.jpg').toString('base64');

  await addInspectionSheetSlideNew(pptx, userRecord1, {
    loadPhotoBase64: async (p, r, idx) => idx === 0 ? dummyPhoto1 : ''
  });

  await pptx.writeFile({ fileName: 'tools/test_template_new_output.pptx' });
  console.log('Successfully written tools/test_template_new_output.pptx');
}

run().catch(console.error);
