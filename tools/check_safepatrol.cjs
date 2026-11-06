const fs = require('fs');
const ExcelJS = require('exceljs');

async function test() {
  const wb = new ExcelJS.Workbook();
  const file = fs.readdirSync('.').find(f => f.includes('최신.xlsx'));
  console.log('Loading file:', file);
  await wb.xlsx.readFile(file);
  for (const ws of wb.worksheets) {
    console.log(`=== Sheet: ${ws.name} ===`);
    for (let r = 1; r <= 3; r++) {
      console.log(`Row ${r}:`, ws.getRow(r).values.filter(Boolean).slice(0, 20));
    }
  }
}
test();
