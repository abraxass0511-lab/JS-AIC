const fs = require('fs');
const JSZip = require('jszip');
const { execSync } = require('child_process');

async function testShapes() {
  const goodBuf = fs.readFileSync('tools/test_5_requirements_verified.pptx');
  const zipGood = await JSZip.loadAsync(goodBuf);
  const goodSlide1 = await zipGood.file('ppt/slides/slide1.xml').async('text');

  const zipBad = await JSZip.loadAsync(fs.readFileSync('tools/exact_test.pptx'));
  const badSlide1 = await zipBad.file('ppt/slides/slide1.xml').async('text');

  // Extract all <p:sp> or shapes from badSlide1
  // Let's see what shapes exist in badSlide1
  const badSpTree = badSlide1.slice(badSlide1.indexOf('<p:spTree>'), badSlide1.indexOf('</p:spTree>') + 11);
  const goodSpTree = goodSlide1.slice(goodSlide1.indexOf('<p:spTree>'), goodSlide1.indexOf('</p:spTree>') + 11);

  // Let's extract individual top-level elements inside spTree:
  // <p:nvGrpSpPr>, <p:grpSpPr>, <p:sp>, <p:pic>, <p:graphicFrame>
  function getElements(treeXml) {
    const elems = [];
    const re = /<(p:sp|p:pic|p:graphicFrame)([\s\S]*?)<\/\1>/g;
    let m;
    while ((m = re.exec(treeXml)) !== null) {
      elems.push(m[0]);
    }
    return elems;
  }

  const goodElems = getElements(goodSpTree);
  const badElems = getElements(badSpTree);

  console.log('Good elements count:', goodElems.length);
  console.log('Bad elements count:', badElems.length);

  // Binary search or test bad elements one by one
  // Start with good elements and substitute bad elements one by one to see which one breaks it!
  const prefix = goodSlide1.slice(0, goodSlide1.indexOf('<p:spTree>') + 10) + '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>';
  const suffix = '</p:spTree>' + goodSlide1.slice(goodSlide1.indexOf('</p:spTree>') + 11);

  function testXml(elements) {
    const xml = prefix + elements.join('') + suffix;
    zipGood.file('ppt/slides/slide1.xml', xml);
    const testBuf = zipGood.generateAsync({ type: 'nodebuffer' });
    return testBuf;
  }

  // Let's test with ALL bad elements first (without the image pics)
  const buf = await testXml(badElems);
  fs.writeFileSync('C:/Users/YS/test_elem.pptx', buf);

  const psScript = `
$ppt = New-Object -ComObject PowerPoint.Application
try {
  $pres = $ppt.Presentations.Open("C:\\Users\\YS\\test_elem.pptx", -1, 0, 0)
  Write-Host "OPEN SUCCESS! Slides: $($pres.Slides.Count)"
  $pres.Close()
} catch {
  Write-Host "OPEN FAILED: $($_.Exception.Message)"
} finally {
  $ppt.Quit()
  Remove-Item "C:/Users/YS/test_elem.pptx" -ErrorAction SilentlyContinue
}
`;
  fs.writeFileSync('tools/run_elem.ps1', psScript, 'utf8');
  const out = execSync('powershell -ExecutionPolicy Bypass -File tools/run_elem.ps1').toString();
  console.log('Test with all bad elements:', out);

  // Now binary search!
  let low = 0;
  let high = badElems.length;
  for (let i = 0; i < badElems.length; i++) {
    const singleElemBuf = await testXml([badElems[i]]);
    fs.writeFileSync('C:/Users/YS/test_elem.pptx', singleElemBuf);
    const res = execSync('powershell -ExecutionPolicy Bypass -File tools/run_elem.ps1').toString();
    if (res.includes('FAILED')) {
      console.log('FOUND OFFENDING ELEMENT at index', i, ':\n', badElems[i]);
      break;
    }
  }
}

testShapes().catch(e => console.error(e));
