function fitFontSize(text, availWidthInch, baseSize = 14, minSize = 9.5) {
  if (!text) return baseSize;
  let units = 0;
  const str = String(text);
  for (let i = 0; i < str.length; i++) {
    units += str.charCodeAt(i) > 127 ? 1.0 : 0.58;
  }
  const avail = Math.max(0.4, availWidthInch - 0.16);
  // In Malgun Gothic Bold: 1 unit at 14pt takes ~0.19 inch in PPTX
  const neededAtBase = units * (baseSize / 14) * 0.19;
  if (neededAtBase <= avail) return baseSize;
  const computed = (avail / (units * 0.19)) * 14;
  return Math.max(minSize, Math.floor(computed * 2) / 2);
}

console.log('작업장소 : 105동 지하2층 (2.30in):', fitFontSize('작업장소 : 105동 지하2층', 2.30, 14, 9.5));
console.log('공종명 : 조적 (2.45in):', fitFontSize('공종명 : 조적', 2.45, 14, 9.5));
console.log('협력사 : 원영건업(주) (2.45in):', fitFontSize('협력사 : 원영건업(주)', 2.45, 14, 9.5));
console.log('협력사 : 주식회사 원영건업개발 (2.45in):', fitFontSize('협력사 : 주식회사 원영건업개발', 2.45, 14, 9.5));
console.log('관련기준 긴제목 (5.83in):', fitFontSize('산업안전보건기준에 관한 규칙 제56조(작업발판의 구조), 제13조(안전난간의 구조 및 요건)', 5.832, 14, 9.5));
