const fs = require('fs');
const JSZip = require('jszip');
const { execSync } = require('child_process');

async function findCorruption() {
  const goodBuf = fs.readFileSync('tools/test_5_requirements_verified.pptx');
  const badBuf = fs.readFileSync('tools/exact_test.pptx');

  const zipGood = await JSZip.loadAsync(goodBuf);
  const zipBad = await JSZip.loadAsync(badBuf);

  // Test 1: Replace slide1.xml in good with bad slide1.xml
  const badSlide1 = await zipBad.file('ppt/slides/slide1.xml').async('text');
  zipGood.file('ppt/slides/slide1.xml', badSlide1);

  const testBuf = await zipGood.generateAsync({ type: 'nodebuffer' });
  fs.writeFileSync('C:/Users/YS/test_slide1_swap.pptx', testBuf);

  const psScript = `
$ppt = New-Object -ComObject PowerPoint.Application
try {
  $pres = $ppt.Presentations.Open("C:\\Users\\YS\\test_slide1_swap.pptx", -1, 0, 0)
  Write-Host "SWAP TEST OPEN SUCCESS! Slides: $($pres.Slides.Count)"
  $pres.Close()
} catch {
  Write-Host "SWAP TEST FAILED: $($_.Exception.Message)"
} finally {
  $ppt.Quit()
  Remove-Item "C:/Users/YS/test_slide1_swap.pptx" -ErrorAction SilentlyContinue
}
`;
  fs.writeFileSync('tools/run_swap_test.ps1', psScript, 'utf8');
  const out = execSync('powershell -ExecutionPolicy Bypass -File tools/run_swap_test.ps1').toString();
  console.log('Result with bad slide1.xml in good zip:', out);
}

findCorruption().catch(e => console.error(e));
