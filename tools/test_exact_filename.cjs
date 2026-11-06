const fs = require('fs');
const path = require('path');
const pptxgen = require('pptxgenjs');
const { execSync } = require('child_process');

async function testName() {
  const pptx = new pptxgen();
  pptx.defineLayout({ name: 'WIDE_16_9', width: 13.333, height: 7.5 });
  pptx.layout = 'WIDE_16_9';

  require('../app/js/ppt-generator.js');
  const SafePPT = globalThis.SafePPT;

  // Let's get the record
  const relayRes = await fetch('https://safepatrol-relay.abraxass0511.workers.dev/file?path=data%2F2026%2Findex%2F2026-10.json', {
    headers: { 'X-PIN': '000000' }
  }).then(r => r.json());
  const data = JSON.parse(Buffer.from(relayRes.content, 'base64').toString('utf8'));
  const rec = data.records.find(r => r.id === '20261011-155956-8p2v' || (r.site === '테스트2' && r.inspectedDate === '2026-10-11'));

  console.log('Record location:', JSON.stringify(rec.location));
  // In app.js:
  const safeLoc = (rec.location || '위치').replace(/[\/\\:*?"<>|]/g, '_');
  const filename = `점검장표_${rec.site || '현장'}_${safeLoc}_${rec.inspectedDate || '2026-10-11'}.pptx`;
  console.log('Target filename:', JSON.stringify(filename));

  // Add slide
  await SafePPT.addInspectionSheetSlide(pptx, rec, { loadPhotoBase64: async () => '' });

  const outPath = path.join(__dirname, filename);
  await pptx.writeFile({ fileName: outPath });
  console.log('Created file:', outPath);

  // Now test opening with PowerShell COM
  const psScript = `
$ppt = New-Object -ComObject PowerPoint.Application
try {
  $path = (Resolve-Path -LiteralPath '${outPath.replace(/'/g, "''")}').Path
  Write-Host "Resolved: $path"
  $pres = $ppt.Presentations.Open($path, -1, 0, 0)
  Write-Host "OPEN SUCCESS! Slides: $($pres.Slides.Count)"
  $pres.Close()
} catch {
  Write-Host "OPEN FAILED: $($_.Exception.Message)"
} finally {
  $ppt.Quit()
  [System.GC]::Collect()
}
`;
  fs.writeFileSync(path.join(__dirname, 'test_name_open.ps1'), psScript, 'utf8');
  const out = execSync('powershell -ExecutionPolicy Bypass -File tools/test_name_open.ps1').toString();
  console.log('PowerShell Output:', out);
}

testName().catch(e => console.error(e));
