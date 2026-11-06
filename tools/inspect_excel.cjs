const fs = require('fs');
const ExcelJS = require('exceljs');

const files = fs.readdirSync('.').filter(f => f.endsWith('.xlsx'));
console.log('Files in root:', files);

async function check() {
  for (const f of files) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(f);
    console.log('File:', f, 'Sheets:', wb.worksheets.map(w => w.name));
    for (const ws of wb.worksheets) {
      for (let r = 1; r <= Math.min(ws.rowCount, 15); r++) {
        const row = ws.getRow(r).values;
        if (Array.isArray(row) && row.some(cell => String(cell).includes('추락') || String(cell).includes('비래') || String(cell).includes('익사'))) {
          console.log(`  [${ws.name}] Row ${r}:`, row.filter(Boolean).slice(0, 25));
        }
      }
    }
  }
}
check();
