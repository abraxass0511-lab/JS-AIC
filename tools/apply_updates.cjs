const fs = require('fs');
const path = require('path');

const targetFile = path.resolve('app/js/ppt-generator.js');
let content = fs.readFileSync(targetFile, 'utf8');

// Normalize CRLF to LF for reliable matching
const hasCRLF = content.includes('\r\n');
content = content.replace(/\r\n/g, '\n');

// 1. Add calcSingleLineFontSize helper
const helperCode = `  const C_ACCENT_BLUE = '4472C4';   // 템플릿 표준 강조 블루 (#4472C4)

  /**
   * 단일 행 텍스트의 넘침/줄바꿈 방지 동적 글자크기 계산기
   * - 사용자 지시: "칸은 그대로 두고 길어져서 줄이 바뀌거나 잘리면 글자크기를 작게하든지 조정해"
   */
  function calcSingleLineFontSize(text, widthInch, baseSize = 14, minSize = 9) {
    if (!text) return baseSize;
    let units = 0;
    for (let i = 0; i < text.length; i++) {
      units += text.charCodeAt(i) > 127 ? 1.2 : 0.75;
    }
    const avail = widthInch - 0.12;
    let sz = baseSize;
    while (sz > minSize) {
      const est = units * (sz * 0.011);
      if (est <= avail) break;
      sz -= 0.5;
    }
    return sz;
  }`;

if (!content.includes('function calcSingleLineFontSize')) {
  content = content.replace("  const C_ACCENT_BLUE = '4472C4';   // 템플릿 표준 강조 블루 (#4472C4)", helperCode);
}

// 2. Replace lawTitle & lawBody rendering in addInspectionSheetSlide
const oldLawSection = `    const lawTitleFontSize = data.lawTitle.length > 34 ? 12 : (data.lawTitle.length > 25 ? 13 : 14);
    slide.addText(data.lawTitle, {
      x: 4.276, y: 0.163, w: 5.832, h: 0.350,
      fontFace: FONT_MALGUN, fontSize: lawTitleFontSize, bold: true, color: '000000',
      align: 'left', valign: 'middle', wrap: false, inset: 0.08
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
      align: 'left', valign: 'middle', inset: 0.08, lineSpacingMultiple: 1.18
    });`;

const newLawSection = `    const lawTitleFontSize = calcSingleLineFontSize(data.lawTitle, 5.832, 14, 9);
    slide.addText(data.lawTitle, {
      x: 4.276, y: 0.163, w: 5.832, h: 0.350,
      fontFace: FONT_MALGUN, fontSize: lawTitleFontSize, bold: true, color: '000000',
      align: 'left', valign: 'middle', wrap: false, inset: 0.06
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
    const lawBodyFontSize = data.lawBody.length > 80 ? 11 : (data.lawBody.length > 55 ? 12 : 13);
    slide.addText(data.lawBody, {
      x: 4.276, y: 0.513, w: 5.832, h: 0.564,
      fontFace: FONT_MALGUN, fontSize: lawBodyFontSize, color: '111111',
      align: 'left', valign: 'middle', inset: 0.06, lineSpacingMultiple: 1.16
    });`;

console.log('Replacing lawSection: found =', content.includes(oldLawSection));
content = content.replace(oldLawSection, newLawSection);

// 3. Replace 부적합 개요 Row 1 & Row 2
const oldOverview = `    // 부적합 개요 1행: 5개 독립 셀 (x = 1.210 ~ 13.140, w = 11.930, h = 0.406) - 단일 도형으로 깔끔한 inset 적용
    // 협력사 (x = 1.210, w = 2.450)
    slide.addText([
      { text: '협력사 : ', options: { bold: true, color: C_ACCENT_BLUE, fontFace: FONT_MALGUN, fontSize: 14 } },
      { text: data.subcontractor, options: { bold: true, color: '000000', fontFace: FONT_MALGUN, fontSize: 14 } }
    ], {
      x: 1.210, y: 1.125, w: 2.450, h: 0.406,
      fill: { color: 'FFFFFF' }, line: { color: C_BORDER, width: 1.0 },
      align: 'left', valign: 'middle', inset: 0.08
    });

    // 공종명 (x = 3.660, w = 2.450)
    slide.addText([
      { text: '공종명 : ', options: { bold: true, color: C_ACCENT_BLUE, fontFace: FONT_MALGUN, fontSize: 14 } },
      { text: data.workGroup, options: { bold: true, color: '000000', fontFace: FONT_MALGUN, fontSize: 14 } }
    ], {
      x: 3.660, y: 1.125, w: 2.450, h: 0.406,
      fill: { color: 'FFFFFF' }, line: { color: C_BORDER, width: 1.0 },
      align: 'left', valign: 'middle', inset: 0.08
    });

    // 작업장소 (x = 6.110, w = 2.300)
    slide.addText([
      { text: '작업장소 : ', options: { bold: true, color: C_ACCENT_BLUE, fontFace: FONT_MALGUN, fontSize: 14 } },
      { text: data.location, options: { bold: true, color: '000000', fontFace: FONT_MALGUN, fontSize: 14 } }
    ], {
      x: 6.110, y: 1.125, w: 2.300, h: 0.406,
      fill: { color: 'FFFFFF' }, line: { color: C_BORDER, width: 1.0 },
      align: 'left', valign: 'middle', inset: 0.08
    });

    // 점검자 (x = 8.410, w = 2.300)
    slide.addText([
      { text: '점검자 : ', options: { bold: true, color: C_ACCENT_BLUE, fontFace: FONT_MALGUN, fontSize: 14 } },
      { text: data.inspector, options: { bold: true, color: '000000', fontFace: FONT_MALGUN, fontSize: 14 } }
    ], {
      x: 8.410, y: 1.125, w: 2.300, h: 0.406,
      fill: { color: 'FFFFFF' }, line: { color: C_BORDER, width: 1.0 },
      align: 'left', valign: 'middle', inset: 0.08
    });

    // 점검차수 (x = 10.710, w = 2.430)
    slide.addText([
      { text: '점검차수 : ', options: { bold: true, color: C_ACCENT_BLUE, fontFace: FONT_MALGUN, fontSize: 14 } },
      { text: data.inspectRound, options: { bold: true, color: '000000', fontFace: FONT_MALGUN, fontSize: 14 } }
    ], {
      x: 10.710, y: 1.125, w: 2.430, h: 0.406,
      fill: { color: 'FFFFFF' }, line: { color: C_BORDER, width: 1.0 },
      align: 'left', valign: 'middle', inset: 0.08
    });

    // 부적합 개요 2행: 부적합 내용 전체 너비 사각형 (x = 1.210 ~ 13.140, w = 11.930, h = 0.405) - 단일 도형
    slide.addText([
      { text: '부적합 내용 : ', options: { bold: true, color: C_ACCENT_BLUE, fontFace: FONT_MALGUN, fontSize: 14 } },
      { text: data.mainContentParts.prefix, options: { bold: true, color: '000000', fontFace: FONT_MALGUN, fontSize: 14 } },
      { text: data.mainContentParts.highlight, options: { bold: true, color: C_RED, fontFace: FONT_MALGUN, fontSize: 14 } },
      { text: data.mainContentParts.suffix, options: { bold: true, color: C_TITLE_BLUE, fontFace: FONT_MALGUN, fontSize: 14 } }
    ], {
      x: 1.210, y: 1.531, w: 11.930, h: 0.405,
      fill: { color: 'FFFFFF' }, line: { color: C_BORDER, width: 1.0 },
      align: 'left', valign: 'middle', inset: 0.08, lineSpacingMultiple: 1.10
    });`;

const newOverview = `    // 부적합 개요 1행: 5개 독립 셀 (x = 1.210 ~ 13.140, w = 11.930, h = 0.406) - 단일 도형, wrap: false, 넘침 방지 동적 글자크기
    // 협력사 (x = 1.210, w = 2.450)
    const subSz = calcSingleLineFontSize(\`협력사 : \${data.subcontractor}\`, 2.450, 14, 9.5);
    slide.addText([
      { text: '협력사 : ', options: { bold: true, color: C_ACCENT_BLUE, fontFace: FONT_MALGUN, fontSize: subSz } },
      { text: data.subcontractor, options: { bold: true, color: '000000', fontFace: FONT_MALGUN, fontSize: subSz } }
    ], {
      x: 1.210, y: 1.125, w: 2.450, h: 0.406,
      fill: { color: 'FFFFFF' }, line: { color: C_BORDER, width: 1.0 },
      align: 'left', valign: 'middle', inset: 0.06, wrap: false
    });

    // 공종명 (x = 3.660, w = 2.450)
    const workSz = calcSingleLineFontSize(\`공종명 : \${data.workGroup}\`, 2.450, 14, 9.5);
    slide.addText([
      { text: '공종명 : ', options: { bold: true, color: C_ACCENT_BLUE, fontFace: FONT_MALGUN, fontSize: workSz } },
      { text: data.workGroup, options: { bold: true, color: '000000', fontFace: FONT_MALGUN, fontSize: workSz } }
    ], {
      x: 3.660, y: 1.125, w: 2.450, h: 0.406,
      fill: { color: 'FFFFFF' }, line: { color: C_BORDER, width: 1.0 },
      align: 'left', valign: 'middle', inset: 0.06, wrap: false
    });

    // 작업장소 (x = 6.110, w = 2.300) - 줄바꿈 원천 방지 및 동적 축소
    const locSz = calcSingleLineFontSize(\`작업장소 : \${data.location}\`, 2.300, 14, 9.5);
    slide.addText([
      { text: '작업장소 : ', options: { bold: true, color: C_ACCENT_BLUE, fontFace: FONT_MALGUN, fontSize: locSz } },
      { text: data.location, options: { bold: true, color: '000000', fontFace: FONT_MALGUN, fontSize: locSz } }
    ], {
      x: 6.110, y: 1.125, w: 2.300, h: 0.406,
      fill: { color: 'FFFFFF' }, line: { color: C_BORDER, width: 1.0 },
      align: 'left', valign: 'middle', inset: 0.06, wrap: false
    });

    // 점검자 (x = 8.410, w = 2.300)
    const insSz = calcSingleLineFontSize(\`점검자 : \${data.inspector}\`, 2.300, 14, 9.5);
    slide.addText([
      { text: '점검자 : ', options: { bold: true, color: C_ACCENT_BLUE, fontFace: FONT_MALGUN, fontSize: insSz } },
      { text: data.inspector, options: { bold: true, color: '000000', fontFace: FONT_MALGUN, fontSize: insSz } }
    ], {
      x: 8.410, y: 1.125, w: 2.300, h: 0.406,
      fill: { color: 'FFFFFF' }, line: { color: C_BORDER, width: 1.0 },
      align: 'left', valign: 'middle', inset: 0.06, wrap: false
    });

    // 점검차수 (x = 10.710, w = 2.430)
    const rSz = calcSingleLineFontSize(\`점검차수 : \${data.inspectRound}\`, 2.430, 14, 9.5);
    slide.addText([
      { text: '점검차수 : ', options: { bold: true, color: C_ACCENT_BLUE, fontFace: FONT_MALGUN, fontSize: rSz } },
      { text: data.inspectRound, options: { bold: true, color: '000000', fontFace: FONT_MALGUN, fontSize: rSz } }
    ], {
      x: 10.710, y: 1.125, w: 2.430, h: 0.406,
      fill: { color: 'FFFFFF' }, line: { color: C_BORDER, width: 1.0 },
      align: 'left', valign: 'middle', inset: 0.06, wrap: false
    });

    // 부적합 개요 2행: 부적합 내용 전체 너비 사각형 (x = 1.210 ~ 13.140, w = 11.930, h = 0.405) - 단일 도형, wrap: false
    const mainSz = calcSingleLineFontSize(\`부적합 내용 : \${data.mainContent}\`, 11.930, 14, 9.5);
    slide.addText([
      { text: '부적합 내용 : ', options: { bold: true, color: C_ACCENT_BLUE, fontFace: FONT_MALGUN, fontSize: mainSz } },
      { text: data.mainContentParts.prefix, options: { bold: true, color: '000000', fontFace: FONT_MALGUN, fontSize: mainSz } },
      { text: data.mainContentParts.highlight, options: { bold: true, color: C_RED, fontFace: FONT_MALGUN, fontSize: mainSz } },
      { text: data.mainContentParts.suffix, options: { bold: true, color: C_TITLE_BLUE, fontFace: FONT_MALGUN, fontSize: mainSz } }
    ], {
      x: 1.210, y: 1.531, w: 11.930, h: 0.405,
      fill: { color: 'FFFFFF' }, line: { color: C_BORDER, width: 1.0 },
      align: 'left', valign: 'middle', inset: 0.06, wrap: false
    });`;

console.log('Replacing overview: found =', content.includes(oldOverview));
content = content.replace(oldOverview, newOverview);

// 4. Update right column interviewOpinion & proposalContent & countermeasureContent
const oldRightCol = `    // 윗칸: [ 의견 : 시공관리자 및 근로자 ] (h = 1.843)
    slide.addText([
      { text: '[ 의견 : 시공관리자 및 근로자 ]\\n', options: { fontSize: 14, bold: true, color: '000000', fontFace: FONT_MALGUN } },
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
      { text: '[점검단 제안]\\n', options: { fontSize: 14, bold: true, color: '000000', fontFace: FONT_MALGUN } },
      { text: \`\${data.proposalType}\\n\`, options: { fontSize: 14, bold: true, color: C_ACCENT_BLUE, fontFace: FONT_MALGUN } },
      { text: data.proposalSub, options: { fontSize: 11, color: '595959', fontFace: FONT_MALGUN } }
    ], {
      x: 8.395, y: 4.493, w: 1.434, h: 1.074,
      align: 'center', valign: 'middle', lineSpacingMultiple: 1.15
    });
    slide.addText(data.proposalContent, {
      x: 9.829, y: 4.493, w: 3.277, h: 1.074,
      fontFace: FONT_MALGUN, fontSize: 13, color: '111111', margin: [6, 10, 4, 10], valign: 'top', lineSpacingMultiple: 1.20
    });`;

const newRightCol = `    // 윗칸: [ 의견 : 시공관리자 및 근로자 ] (h = 1.843)
    let intSz = 12.5;
    let intLineSpacing = 1.18;
    let intMargin = [5, 8, 3, 8];
    if (data.interviewOpinion.length > 130) {
      intSz = 10.5;
      intLineSpacing = 1.12;
      intMargin = [4, 6, 2, 6];
    } else if (data.interviewOpinion.length > 80) {
      intSz = 11.5;
      intLineSpacing = 1.15;
    }
    slide.addText([
      { text: '[ 의견 : 시공관리자 및 근로자 ]\\n', options: { fontSize: 14, bold: true, color: '000000', fontFace: FONT_MALGUN } },
      { text: data.interviewOpinion, options: { fontSize: intSz, color: '111111', fontFace: FONT_MALGUN } }
    ], {
      x: 8.395, y: 2.650, w: 4.711, h: 1.843,
      margin: intMargin, valign: 'top', lineSpacingMultiple: intLineSpacing
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
      { text: '[점검단 제안]\\n', options: { fontSize: 14, bold: true, color: '000000', fontFace: FONT_MALGUN } },
      { text: \`\${data.proposalType}\\n\`, options: { fontSize: 14, bold: true, color: C_ACCENT_BLUE, fontFace: FONT_MALGUN } },
      { text: data.proposalSub, options: { fontSize: 11, color: '595959', fontFace: FONT_MALGUN } }
    ], {
      x: 8.395, y: 4.493, w: 1.434, h: 1.074,
      align: 'center', valign: 'middle', lineSpacingMultiple: 1.15
    });

    // 점검단 제안 본문: 잘림 방지 동적 폰트 & 여백 조정
    let propSz = 12.5;
    let propLineSpacing = 1.18;
    let propMargin = [5, 8, 4, 8];
    if (data.proposalContent.length > 70) {
      propSz = 10;
      propLineSpacing = 1.10;
      propMargin = [4, 6, 2, 6];
    } else if (data.proposalContent.length > 45) {
      propSz = 11.5;
      propLineSpacing = 1.14;
      propMargin = [4, 8, 3, 8];
    }
    slide.addText(data.proposalContent, {
      x: 9.829, y: 4.493, w: 3.277, h: 1.074,
      fontFace: FONT_MALGUN, fontSize: propSz, color: '111111',
      margin: propMargin, valign: 'top', lineSpacingMultiple: propLineSpacing
    });`;

console.log('Replacing rightCol: found =', content.includes(oldRightCol));
content = content.replace(oldRightCol, newRightCol);

// 5. Update countermeasureContent
const oldCounter = `    // 개선대책 본문 (좌측 w = 3.204)
    if (data.countermeasureContent) {
      slide.addText(data.countermeasureContent, {
        x: 8.395, y: 6.102, w: 3.204, h: 1.134,
        fontFace: FONT_MALGUN, fontSize: 13, bold: true, color: '000000', margin: [6, 10, 4, 10], valign: 'top', lineSpacingMultiple: 1.22
      });
    }`;

const newCounter = `    // 개선대책 본문 (좌측 w = 3.204)
    if (data.countermeasureContent) {
      let counterSz = 12.5;
      let counterLineSpacing = 1.18;
      let counterMargin = [5, 8, 4, 8];
      if (data.countermeasureContent.length > 70) {
        counterSz = 10;
        counterLineSpacing = 1.10;
        counterMargin = [4, 6, 2, 6];
      } else if (data.countermeasureContent.length > 45) {
        counterSz = 11.5;
        counterLineSpacing = 1.14;
        counterMargin = [4, 8, 3, 8];
      }
      slide.addText(data.countermeasureContent, {
        x: 8.395, y: 6.102, w: 3.204, h: 1.134,
        fontFace: FONT_MALGUN, fontSize: counterSz, bold: true, color: '000000',
        margin: counterMargin, valign: 'top', lineSpacingMultiple: counterLineSpacing
      });
    }`;

console.log('Replacing counter: found =', content.includes(oldCounter));
content = content.replace(oldCounter, newCounter);

// 6. Remove Red Banner from Photo section in addInspectionSheetSlide
const oldPhotoSection = `    // 사진 1 상단 배너 (x = 0.120, y = 2.207, w = 5.750, h = 0.406)
    slide.addText(data.photo1Title, {
      x: 0.120, y: 2.207, w: 5.750, h: 0.406,
      fill: { color: 'EA7676' }, line: { color: 'EA7676', width: 1 },
      fontFace: FONT_MALGUN, fontSize: 12, bold: true, color: 'FFFFFF',
      align: 'center', valign: 'middle', wrap: false, inset: 0.04
    });

    // 사용자 지시: 특별한 언급이 없으면 사진만 넣어 굳이 줄걸이 책임자의 책임을 넣지 않고 사진이 바닥(y=7.236)까지 꽉 차도록 확장
    const showGuidelineBox = Boolean(data.hasGuideline && data.guidelineTitle);
    const photoBodyHeight = showGuidelineBox ? 3.500 : 4.586; // 2.650 ~ 7.236

    if (hasPhoto2) {
      // ════ 2개 사진 레이아웃 ════
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
      // ════ 사진 1개 전용 레이아웃: w = 8.218 시원한 전폭 확장! ════
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
    }`;

const newPhotoSection = `    // 사용자 지시:
    // "2. 빨간색 음영처리에 있는 글씨는 삭제해. 어차피 부적합내용과 똑같은 거니까. 사진 넣는 쪽에는 글씨없이 사진만 넣어"
    // -> 사진 상단 붉은색 배너(#EA7676) 및 중복 텍스트를 완전히 제거하고, 순수 사진만 깔끔하게 삽입
    const showGuidelineBox = Boolean(data.hasGuideline && data.guidelineTitle);
    const photoBodyHeight = showGuidelineBox ? 3.500 : 4.586; // 2.650 ~ 7.236

    if (hasPhoto2) {
      // ════ 2개 사진 레이아웃: 글씨 없이 순수 사진만 삽입 ════
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
          fill: { color: 'F8FAFC' }, line: { color: C_BORDER, width: 1.2 }
        });
        slide.addText('📸 사진 1', {
          x: 0.120, y: 2.650, w: 4.050, h: photoBodyHeight,
          fontFace: FONT_MALGUN, fontSize: 12, color: '64748B', align: 'center', valign: 'middle'
        });
      }

      // 사진 2 (우측, w = 4.108)
      if (photo2Base64) {
        slide.addImage({
          data: photo2Base64,
          x: 4.230, y: 2.650, w: 4.108, h: photoBodyHeight,
          sizing: { type: 'contain', w: 4.108, h: photoBodyHeight }
        });
      } else {
        slide.addShape(pptx.ShapeType.rect, {
          x: 4.230, y: 2.650, w: 4.108, h: photoBodyHeight,
          fill: { color: 'F8FAFC' }, line: { color: C_BORDER, width: 1.2 }
        });
        slide.addText('📸 사진 2', {
          x: 4.230, y: 2.650, w: 4.108, h: photoBodyHeight,
          fontFace: FONT_MALGUN, fontSize: 12, color: '64748B', align: 'center', valign: 'middle'
        });
      }
    } else {
      // ════ 사진 1개 전용 레이아웃: w = 8.218 시원한 전폭 확장, 글씨 없이 사진만 ════
      if (photo1Base64) {
        slide.addImage({
          data: photo1Base64,
          x: 0.120, y: 2.650, w: 8.218, h: photoBodyHeight,
          sizing: { type: 'contain', w: 8.218, h: photoBodyHeight }
        });
      } else {
        slide.addShape(pptx.ShapeType.rect, {
          x: 0.120, y: 2.650, w: 8.218, h: photoBodyHeight,
          fill: { color: 'F8FAFC' }, line: { color: C_BORDER, width: 1.2 }
        });
        slide.addText('📸 현장 사진', {
          x: 0.120, y: 2.650, w: 8.218, h: photoBodyHeight,
          fontFace: FONT_MALGUN, fontSize: 14, color: '64748B', align: 'center', valign: 'middle'
        });
      }
    }`;

console.log('Replacing photoSection: found =', content.includes(oldPhotoSection));
content = content.replace(oldPhotoSection, newPhotoSection);

// 7. Update renderInspectionSheetHTML for photo area and font scaling
const oldHtmlImages = `    const photo1Img = photo1Url 
      ? \`<img src="\${photo1Url}" style="width: 100%; height: \${photo1Height}; object-fit: contain; background: #ffffff; border: 1.2px solid #7ba0cd; border-top: none; border-radius: 0 0 2px 2px;" onerror="this.style.display='none'">\`
      : \`<div style="width: 100%; height: \${photo1Height}; background: #f8fafc; border: 1.2px solid #7ba0cd; border-top: none; border-radius: 0 0 2px 2px; display: flex; align-items: center; justify-content: center; color: #64748b; font-size: 0.95rem;">📸 사진 1</div>\`;

    const photo2Img = photo2Url
      ? \`<img src="\${photo2Url}" style="width: 100%; height: \${photo2Height}; object-fit: contain; background: #ffffff; border: 1.2px solid #7ba0cd; border-top: none; border-radius: 0 0 2px 2px;" onerror="this.style.display='none'">\`
      : \`<div style="width: 100%; height: \${photo2Height}; background: #f8fafc; border: 1.2px solid #7ba0cd; border-top: none; border-radius: 0 0 2px 2px; display: flex; align-items: center; justify-content: center; color: #64748b; font-size: 0.95rem;">📸 사진 2</div>\`;

    const photo1ImgSingle = photo1Url
      ? \`<img src="\${photo1Url}" style="width: 100%; height: \${photo1Height}; object-fit: contain; background: #ffffff; border: 1.2px solid #7ba0cd; border-top: none; border-radius: 0 0 2px 2px;" onerror="this.style.display='none'">\`
      : \`<div style="width: 100%; height: \${photo1Height}; background: #f8fafc; border: 1.2px solid #7ba0cd; border-top: none; border-radius: 0 0 2px 2px; display: flex; align-items: center; justify-content: center; color: #64748b; font-size: 1.05rem;">📸 현장 사진</div>\`;`;

const newHtmlImages = `    const photoHeight = showGuidelineBox ? '310px' : '415px';

    const photo1Img = photo1Url 
      ? \`<img src="\${photo1Url}" style="width: 100%; height: \${photoHeight}; object-fit: contain; background: #ffffff; border: 1.2px solid #7ba0cd; border-radius: 2px;" onerror="this.style.display='none'">\`
      : \`<div style="width: 100%; height: \${photoHeight}; background: #f8fafc; border: 1.2px solid #7ba0cd; border-radius: 2px; display: flex; align-items: center; justify-content: center; color: #64748b; font-size: 0.95rem;">📸 사진 1</div>\`;

    const photo2Img = photo2Url
      ? \`<img src="\${photo2Url}" style="width: 100%; height: \${photoHeight}; object-fit: contain; background: #ffffff; border: 1.2px solid #7ba0cd; border-radius: 2px;" onerror="this.style.display='none'">\`
      : \`<div style="width: 100%; height: \${photoHeight}; background: #f8fafc; border: 1.2px solid #7ba0cd; border-radius: 2px; display: flex; align-items: center; justify-content: center; color: #64748b; font-size: 0.95rem;">📸 사진 2</div>\`;

    const photo1ImgSingle = photo1Url
      ? \`<img src="\${photo1Url}" style="width: 100%; height: \${photoHeight}; object-fit: contain; background: #ffffff; border: 1.2px solid #7ba0cd; border-radius: 2px;" onerror="this.style.display='none'">\`
      : \`<div style="width: 100%; height: \${photoHeight}; background: #f8fafc; border: 1.2px solid #7ba0cd; border-radius: 2px; display: flex; align-items: center; justify-content: center; color: #64748b; font-size: 1.05rem;">📸 현장 사진</div>\`;`;

console.log('Replacing htmlImages: found =', content.includes(oldHtmlImages));
content = content.replace(oldHtmlImages, newHtmlImages);

// 8. Replace photo section in HTML preview
const oldHtmlPhotoSec = `        <!-- 3. 본문 2단 분할 (템플릿 황금비율: 좌측 사진 63.6% : 우측 36.4%) -->
        <div style="display: grid; grid-template-columns: 1.74fr 1fr; gap: 6px;">
          <!-- 좌측 컬럼 (사진 및 수칙: 너비 8.28인치 상당) -->
          <div style="display: flex; flex-direction: column; gap: 4px;">
            <!-- 상단 사진 영역: 2개 사진 vs 1개 사진 -->
            \${hasPhoto2 ? \`
            <div style="display: flex; gap: 4px;">
              <!-- 사진 1 컬럼 (상단 배너에 이어 사진) -->
              <div style="flex: 1; display: flex; flex-direction: column;">
                <div style="background: #ea7676; color: #ffffff; font-weight: 800; font-size: 0.88rem; text-align: center; padding: 0 6px; border-radius: 2px 2px 0 0; white-space: nowrap; overflow: hidden; height: 30px; box-sizing: border-box; display: flex; align-items: center; justify-content: center;">
                  \${data.photo1Title}
                </div>
                \${photo1Img}
              </div>
              <!-- 사진 2 컬럼 (상단에 Hold Point 위반 박스가 위치!) -->
              <div style="flex: 1; display: flex; flex-direction: column;">
                <div style="background: #ffffff; border: 1.2px solid #7ba0cd; border-radius: 2px 2px 0 0; text-align: center; height: 30px; box-sizing: border-box; display: flex; align-items: center; justify-content: center; font-size: 0.88rem; color: #333333; font-weight: 800; white-space: nowrap; padding: 0 4px;">
                  <span style="font-size: 16px; margin-right: 4px;">\${data.isHoldPoint ? '☑' : '☐'}</span> Hold Point 위반 (N/A)
                </div>
                <div style="background: #ea7676; color: #ffffff; font-weight: 800; font-size: 0.88rem; text-align: center; padding: 0 6px; white-space: nowrap; overflow: hidden; height: 30px; box-sizing: border-box; display: flex; align-items: center; justify-content: center; border-top: none;">
                  \${data.photo2Title}
                </div>
                \${photo2Img}
              </div>
            </div>
            \` : \`
            <!-- 사진 1개 전용 레이아웃: 8.2인치 시원한 전폭 확장 -->
            <div style="display: flex; flex-direction: column;">
              <div style="display: flex; gap: 4px; height: 30px;">
                <div style="flex: 1; background: #ea7676; color: #ffffff; font-weight: 800; font-size: 0.92rem; text-align: center; padding: 0 8px; border-radius: 2px 2px 0 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: flex; align-items: center; justify-content: center;">
                  \${data.photo1Title}
                </div>
                <div style="width: 210px; flex-shrink: 0; background: #ffffff; border: 1.2px solid #7ba0cd; border-radius: 2px 2px 0 0; text-align: center; display: flex; align-items: center; justify-content: center; font-size: 0.88rem; color: #333333; font-weight: 800; white-space: nowrap; padding: 0 4px;">
                  <span style="font-size: 16px; margin-right: 4px;">\${data.isHoldPoint ? '☑' : '☐'}</span> Hold Point 위반 (N/A)
                </div>
              </div>
              \${photo1ImgSingle}
            </div>
            \`}`;

const newHtmlPhotoSec = `        <!-- 3. 본문 2단 분할 (템플릿 황금비율: 좌측 사진 63.6% : 우측 36.4%) -->
        <div style="display: grid; grid-template-columns: 1.74fr 1fr; gap: 6px;">
          <!-- 좌측 컬럼 (사진 및 수칙: 너비 8.28인치 상당, 붉은 배너 삭제 & 글씨 없이 사진만 표시) -->
          <div style="display: flex; flex-direction: column; gap: 4px;">
            <!-- Hold Point 위반 박스 (우측 상단 정렬) -->
            <div style="display: flex; justify-content: flex-end; height: 30px;">
              <div style="width: 210px; background: #ffffff; border: 1.2px solid #7ba0cd; border-radius: 2px; text-align: center; display: flex; align-items: center; justify-content: center; font-size: 0.88rem; color: #333333; font-weight: 800; white-space: nowrap; padding: 0 4px;">
                <span style="font-size: 16px; margin-right: 4px;">\${data.isHoldPoint ? '☑' : '☐'}</span> Hold Point 위반 (N/A)
              </div>
            </div>

            <!-- 사진 영역: 글씨 없이 사진만 표시 -->
            \${hasPhoto2 ? \`
              <div style="display: flex; gap: 6px;">
                <div style="flex: 1;">\${photo1Img}</div>
                <div style="flex: 1;">\${photo2Img}</div>
              </div>
            \` : \`
              \${photo1ImgSingle}
            \`}`;

console.log('Replacing htmlPhotoSec: found =', content.includes(oldHtmlPhotoSec));
content = content.replace(oldHtmlPhotoSec, newHtmlPhotoSec);

// 9. Update proposalContent style in HTML preview
content = content.replace(
  '<div style="padding: 8px 12px; font-size: 0.88rem; font-weight: 500; color: #000000; line-height: 1.45; display: flex; align-items: center; word-break: keep-all;">\n                  ${data.proposalContent}\n                </div>',
  '<div style="padding: 8px 12px; font-size: ${data.proposalContent.length > 70 ? \'0.78rem\' : \'0.88rem\'}; font-weight: 500; color: #000000; line-height: 1.36; display: flex; align-items: center; word-break: keep-all;">\n                  ${data.proposalContent}\n                </div>'
);

// Restore CRLF if needed
if (hasCRLF) {
  content = content.replace(/\n/g, '\r\n');
}

fs.writeFileSync(targetFile, content, 'utf8');
console.log('Successfully updated app/js/ppt-generator.js!');
