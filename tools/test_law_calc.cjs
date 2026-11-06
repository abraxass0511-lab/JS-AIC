function getLawTitleFontSize(title, widthInch = 5.832) {
  let units = 0;
  for (let i = 0; i < title.length; i++) {
    units += title.charCodeAt(i) > 127 ? 1.2 : 0.75;
  }
  const avail = widthInch - 0.12;
  let sz = 14;
  while (sz > 8.5) {
    const est = units * (sz * 0.010);
    if (est <= avail) break;
    sz -= 0.5;
  }
  return sz;
}

const title1 = '산업안전보건기준에 관한 규칙 제56조(작업발판의 구조), 제13조(안전난간의 구조 및 요건)';
const titleShort = '산업안전보건법 제38조 [000]';
console.log('Short title font size:', getLawTitleFontSize(titleShort));
console.log('User exact title font size:', getLawTitleFontSize(title1));
