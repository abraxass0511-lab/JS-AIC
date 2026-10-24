import ExcelJS from 'exceljs';

const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile('C:/Users/YS/Desktop/부적합사항대장_전체누적 (11).xlsx');
const ws = wb.getWorksheet('분류기준');

console.log('--- Row 1 ---');
console.log(ws.getRow(1).values);
console.log('--- Row 2 ---');
console.log(ws.getRow(2).values);

console.log('\n--- First 30 rows ---');
ws.eachRow((r, i) => {
  if (i <= 40) {
    console.log(`[R${i}]`, JSON.stringify(r.values.slice(1, 15)));
  }
});
