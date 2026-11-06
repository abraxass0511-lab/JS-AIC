function getMetadataCellFontSize(label, val, cellWidthInch) {
  const full = `${label}${val}`;
  let units = 0;
  for (let i = 0; i < full.length; i++) {
    units += full.charCodeAt(i) > 127 ? 1.2 : 0.75;
  }
  const avail = cellWidthInch - 0.12;
  let sz = 14;
  while (sz > 9) {
    const est = units * (sz * 0.011);
    if (est <= avail) break;
    sz -= 0.5;
  }
  return sz;
}

console.log('작업장소 : 105동 지하2층 (w=2.30):', getMetadataCellFontSize('작업장소 : ', '105동 지하2층', 2.30));
console.log('협력사 : D사 (w=2.45):', getMetadataCellFontSize('협력사 : ', 'D사', 2.45));
console.log('공종명 : 조적 (w=2.45):', getMetadataCellFontSize('공종명 : ', '조적', 2.45));
console.log('점검자 : 점검이 (w=2.30):', getMetadataCellFontSize('점검자 : ', '점검이', 2.30));
console.log('점검차수 : 1차 (w=2.43):', getMetadataCellFontSize('점검차수 : ', '1차', 2.43));
console.log('작업장소 : 지하주차장 2블록 코어 (w=2.30):', getMetadataCellFontSize('작업장소 : ', '지하주차장 2블록 코어', 2.30));
