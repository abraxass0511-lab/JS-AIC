const fs = require('fs');
const path = require('path');
const pptxgen = require('pptxgenjs');

// Mock browser globals for ppt-generator.js
globalThis.window = {
  PptxGenJS: pptxgen
};
globalThis.PptxGenJS = pptxgen;

async function testUserRecord() {
  // 1. Fetch the exact record from GitHub
  const relayRes = await fetch('https://safepatrol-relay.abraxass0511.workers.dev/file?path=data%2F2026%2Findex%2F2026-10.json', {
    headers: { 'X-PIN': '000000' }
  }).then(r => r.json());

  const data = JSON.parse(Buffer.from(relayRes.content, 'base64').toString('utf8'));
  const rec = data.records.find(r => r.id === '20261011-155956-8p2v' || (r.site === '테스트2' && r.inspectedDate === '2026-10-11'));

  console.log('Testing record:', rec.id, rec.site, rec.location, rec.photos);

  // Load ppt-generator module
  require('../app/js/ppt-generator.js');
  const SafePPT = globalThis.SafePPT;

  // Let's test what loadPhotoBase64 produces
  const loadPhoto = async (photoPath) => {
    console.log('Loading photo path:', photoPath);
    if (!photoPath) return '';
    try {
      const res = await fetch('https://safepatrol-relay.abraxass0511.workers.dev/file?path=' + encodeURIComponent(photoPath) + '&raw=1');
      console.log('Photo fetch status:', res.status);
      if (!res.ok) return '';
      const buf = await res.arrayBuffer();
      const b64 = Buffer.from(buf).toString('base64');
      return 'image/jpeg;base64,' + b64;
    } catch (e) {
      console.warn('Photo error:', e);
      return '';
    }
  };

  const pptx = new pptxgen();
  pptx.defineLayout({ name: 'WIDE_16_9', width: 13.333, height: 7.5 });
  pptx.layout = 'WIDE_16_9';

  await SafePPT.addInspectionSheetSlide(pptx, rec, { loadPhotoBase64: loadPhoto });

  const outPath = path.join(__dirname, 'test_user_record_corrupt.pptx');
  await pptx.writeFile({ fileName: outPath });
  console.log('Saved pptx to:', outPath);

  // Test opening with PowerPoint COM via powershell
  const { execSync } = require('child_process');
  const psScript = `
    $ppt = New-Object -ComObject PowerPoint.Application
    try {
      $pres = $ppt.Presentations.Open('${outPath.replace(/\\/g, '\\\\')}', 1, 0, 0)
      Write-Host "COM OPEN SUCCESS! Slide count: " $pres.Slides.Count
      $pres.Close()
    } catch {
      Write-Host "COM OPEN FAILED: " $_.Exception.Message
    } finally {
      $ppt.Quit()
      [System.GC]::Collect()
    }
  `;
  fs.writeFileSync(path.join(__dirname, 'run_test_open.ps1'), psScript, 'utf8');
  const out = execSync('powershell -ExecutionPolicy Bypass -File tools/run_test_open.ps1').toString();
  console.log('PowerShell Output:', out);
}

testUserRecord().catch(e => console.error('Error:', e));
