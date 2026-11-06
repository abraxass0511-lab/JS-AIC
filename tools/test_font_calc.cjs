const fs = require('fs');
global.window = {};
global.Blob = class Blob {
  constructor(parts) {
    this.buffer = Buffer.concat(parts.map(p => Buffer.isBuffer(p) ? p : Buffer.from(p)));
  }
};
global.URL = { createObjectURL: () => '', revokeObjectURL: () => '' };
const PptxGenJS = require('pptxgenjs');
global.PptxGenJS = PptxGenJS;

function calcSingleLineFontSize(text, availWidthInch, baseSize = 14, minSize = 9) {
  if (!text) return baseSize;
  let charUnits = 0;
  for (let i = 0; i < text.length; i++) {
    charUnits += text.charCodeAt(i) > 127 ? 1.0 : 0.55;
  }
  let size = baseSize;
  while (size > minSize) {
    // 1 Korean unit at size pt is approx (size * 0.0108) inches
    const estimatedWidth = charUnits * (size * 0.0108) + 0.12;
    if (estimatedWidth <= availWidthInch) break;
    size -= 0.5;
  }
  return Math.max(minSize, size);
}

// Test cases
console.log('작업장소 (w=2.30):', calcSingleLineFontSize('작업장소 : 105동 지하2층', 2.30));
console.log('공종명 (w=2.45):', calcSingleLineFontSize('공종명 : 조적', 2.45));
console.log('협력사 (w=2.45):', calcSingleLineFontSize('협력사 : D사', 2.45));
console.log('점검자 (w=2.30):', calcSingleLineFontSize('점검자 : 점검이', 2.30));
console.log('점검차수 (w=2.43):', calcSingleLineFontSize('점검차수 : 1차', 2.43));
console.log('긴 작업장소 (w=2.30):', calcSingleLineFontSize('작업장소 : 105동 지하2층 전기실 입구', 2.30));
console.log('관련기준 (w=5.83):', calcSingleLineFontSize('산업안전보건기준에 관한 규칙 제56조(작업발판의 구조), 제13조(안전난간의 구조 및 요건)', 5.83));
