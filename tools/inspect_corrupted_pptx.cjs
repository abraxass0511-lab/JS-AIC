const fs = require('fs');
const path = require('path');
const pptxgen = require('pptxgenjs');
const JSZip = require('jszip');
const { execSync } = require('child_process');

async function checkPptx() {
  require('../app/js/ppt-generator.js');
  const SafePPT = globalThis.SafePPT;

  // Fetch record 20261011-155956-8p2v
  const relayRes = await fetch('https://safepatrol-relay.abraxass0511.workers.dev/file?path=data%2F2026%2Findex%2F2026-10.json', {
    headers: { 'X-PIN': '000000' }
  }).then(r => r.json());
  const data = JSON.parse(Buffer.from(relayRes.content, 'base64').toString('utf8'));
  const rec = data.records.find(r => r.id === '20261011-155956-8p2v');

  console.log('Record content:', rec.content);
  console.log('Record location:', JSON.stringify(rec.location));

  const pptx = new pptxgen();
  pptx.defineLayout({ name: 'WIDE_16_9', width: 13.333, height: 7.5 });
  pptx.layout = 'WIDE_16_9';

  await SafePPT.addInspectionSheetSlide(pptx, rec, { loadPhotoBase64: async () => '' });

  const buf = await pptx.write({ outputType: 'nodebuffer' });
  const outPath = path.join(__dirname, 'exact_test.pptx');
  fs.writeFileSync(outPath, buf);
  console.log('Wrote exact_test.pptx, size:', buf.length);

  const zip = await JSZip.loadAsync(buf);
  const entries = Object.keys(zip.files);
  console.log('Zip entries count:', entries.length);

  const slide1 = await zip.file('ppt/slides/slide1.xml').async('text');
  console.log('slide1.xml length:', slide1.length);
  fs.writeFileSync(path.join(__dirname, 'exact_slide1.xml'), slide1);

  // Now test with PowerPoint COM
  const psScript = `
$ppt = $null
try {
  $ppt = New-Object -ComObject PowerPoint.Application
  $p = (Resolve-Path "tools/exact_test.pptx").Path
  Write-Host "Opening: $p"
  $pres = $ppt.Presentations.Open($p, [Microsoft.Office.Core.MsoTriState]::msoTrue, [Microsoft.Office.Core.MsoTriState]::msoFalse, [Microsoft.Office.Core.MsoTriState]::msoFalse)
  Write-Host "OPEN SUCCESS! Slides: $($pres.Slides.Count)"
  $pres.Close()
} catch {
  Write-Host "OPEN FAILED: $($_.Exception.Message)"
} finally {
  if ($ppt -ne $null) { $ppt.Quit() }
  [System.GC]::Collect()
}
`;
  fs.writeFileSync(path.join(__dirname, 'run_exact.ps1'), psScript, 'utf8');
  const out = execSync('powershell -ExecutionPolicy Bypass -File tools/run_exact.ps1').toString();
  console.log('PowerShell Output:', out);
}

checkPptx().catch(e => console.error(e));
