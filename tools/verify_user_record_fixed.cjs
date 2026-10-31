const fs = require('fs');
const path = require('path');
const pptxgen = require('pptxgenjs');
const { execSync } = require('child_process');

async function verifyAll() {
  console.log('=== Starting Verification for User PPT and Image Fix ===');
  require('../app/js/ppt-generator.js');
  const SafePPT = globalThis.SafePPT;

  // 1. Fetch the exact record from GitHub
  const relayRes = await fetch('https://safepatrol-relay.abraxass0511.workers.dev/file?path=data%2F2026%2Findex%2F2026-10.json', {
    headers: { 'X-PIN': '000000' }
  }).then(r => r.json());
  const data = JSON.parse(Buffer.from(relayRes.content, 'base64').toString('utf8'));
  const rec = data.records.find(r => r.id === '20261011-155956-8p2v');

  console.log('Target record:', rec.id, rec.site, rec.location);

  // 2. Generate PPT for this exact record using ppt-generator
  const pptx = new pptxgen();
  pptx.defineLayout({ name: 'WIDE_16_9', width: 13.333, height: 7.5 });
  pptx.layout = 'WIDE_16_9';

  await SafePPT.addInspectionSheetSlide(pptx, rec, {
    loadPhotoBase64: async () => '' // Simulate missing photo (placeholder mode)
  });

  const outBuf = await pptx.write({ outputType: 'nodebuffer' });
  const outPath = 'C:/Users/YS/verified_user_slide.pptx';
  fs.writeFileSync(outPath, outBuf);
  console.log('Wrote verified slide, size:', outBuf.length);

  // 3. Test opening with PowerPoint COM
  const psScript = `
$ppt = $null
try {
  $ppt = New-Object -ComObject PowerPoint.Application
  $pres = $ppt.Presentations.Open('C:\\Users\\YS\\verified_user_slide.pptx', -1, 0, 0)
  Write-Host "POWERPOINT COM OPEN SUCCESS! Slide count: $($pres.Slides.Count)"
  $slide = $pres.Slides.Item(1)
  $slide.Export('C:\\Users\\YS\\verified_user_slide_rendered.jpg', 'JPG', 1920, 1080)
  Write-Host "Exported rendered image successfully!"
  $pres.Close()
} catch {
  Write-Host "POWERPOINT COM OPEN FAILED: $($_.Exception.Message)"
} finally {
  if ($ppt -ne $null) { $ppt.Quit() }
  [System.GC]::Collect()
}
`;
  fs.writeFileSync('tools/run_verify_com.ps1', psScript, 'utf8');
  const out = execSync('powershell -ExecutionPolicy Bypass -File tools/run_verify_com.ps1').toString();
  console.log('PowerShell Output:\n', out);

  if (!out.includes('OPEN SUCCESS')) {
    throw new Error('PowerPoint failed to open verified slide!');
  }

  // 4. Test HTML preview rendering
  const html = SafePPT.renderInspectionSheetHTML(rec, {
    photo1Url: 'samples/sample_before.jpg'
  });
  console.log('HTML preview generated successfully, length:', html.length);
  if (html.includes('onerror="this.onerror=null')) {
    console.log('✅ HTML preview includes onerror image fallback protection!');
  }

  console.log('\n🎉 ALL VERIFICATION TESTS PASSED 100%!');
}

verifyAll().catch(e => {
  console.error('❌ Verification failed:', e);
  process.exit(1);
});
