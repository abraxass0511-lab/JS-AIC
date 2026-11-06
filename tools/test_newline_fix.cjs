const fs = require('fs');
const path = require('path');
const pptxgen = require('pptxgenjs');
const { execSync } = require('child_process');

async function testFix() {
  require('../app/js/ppt-generator.js');
  const SafePPT = globalThis.SafePPT;

  const relayRes = await fetch('https://safepatrol-relay.abraxass0511.workers.dev/file?path=data%2F2026%2Findex%2F2026-10.json', {
    headers: { 'X-PIN': '000000' }
  }).then(r => r.json());
  const data = JSON.parse(Buffer.from(relayRes.content, 'base64').toString('utf8'));
  const rec = data.records.find(r => r.id === '20261011-155956-8p2v');

  // Let's test modifying rec.content with single-line
  const clonedRec = { ...rec, content: rec.content.replace(/\r?\n/g, '  ') };

  const pptx = new pptxgen();
  pptx.defineLayout({ name: 'WIDE_16_9', width: 13.333, height: 7.5 });
  pptx.layout = 'WIDE_16_9';

  await SafePPT.addInspectionSheetSlide(pptx, clonedRec, { loadPhotoBase64: async () => '' });

  const buf = await pptx.write({ outputType: 'nodebuffer' });
  fs.writeFileSync('C:/Users/YS/test_fixed_user_record.pptx', buf);
  console.log('Wrote test_fixed_user_record.pptx, size:', buf.length);

  const psScript = `
$ppt = New-Object -ComObject PowerPoint.Application
try {
  $pres = $ppt.Presentations.Open('C:\\Users\\YS\\test_fixed_user_record.pptx', -1, 0, 0)
  Write-Host "COM OPEN SUCCESS! Slide count: $($pres.Slides.Count)"
  $pres.Close()
} catch {
  Write-Host "COM OPEN FAILED: $($_.Exception.Message)"
} finally {
  $ppt.Quit()
  Remove-Item 'C:/Users/YS/test_fixed_user_record.pptx' -ErrorAction SilentlyContinue
}
`;
  fs.writeFileSync('tools/run_fixed_test.ps1', psScript, 'utf8');
  const out = execSync('powershell -ExecutionPolicy Bypass -File tools/run_fixed_test.ps1').toString();
  console.log('PowerShell Output:', out);
}

testFix().catch(e => console.error(e));
