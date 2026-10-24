import ExcelJS from 'exceljs';

const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile('SafePatrol_입력인자_분류표_최신.xlsx');

const s1 = wb.getWorksheet('1.전체_입력인자_상세분류표');
console.log('--- Sheet 1 Headers ---');
console.log(s1.getRow(1).values);
console.log(s1.getRow(2).values);

console.log('\n--- Sheet 1 Rows ---');
s1.eachRow((row, rowNumber) => {
  if (rowNumber <= 30) {
    console.log(`[R${rowNumber}]`, JSON.stringify(row.values.slice(1, 10)));
  }
});

const s3 = wb.getWorksheet('3.마스터코드북_및_선택값');
console.log('\n--- Sheet 3 ---');
s3.eachRow((row, rowNumber) => {
  if (rowNumber <= 30) {
    console.log(`[R${rowNumber}]`, JSON.stringify(row.values.slice(1, 8)));
  }
});
