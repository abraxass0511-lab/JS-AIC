import ExcelJS from 'exceljs';
import fs from 'fs';
import path from 'path';

const files = fs.readdirSync('.').filter(f => f.endsWith('.xlsx'));
console.log('XLSX files in root:', files);

for (const f of files) {
  console.log('\n========================================');
  console.log('FILE:', f);
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.readFile(f);
    wb.eachSheet((ws) => {
      console.log(`  [Sheet] ${ws.name} (rows: ${ws.rowCount}, cols: ${ws.columnCount})`);
    });
  } catch (err) {
    console.error('Error reading', f, err.message);
  }
}
