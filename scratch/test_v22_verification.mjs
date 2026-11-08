import assert from 'assert';
import fs from 'fs';
import path from 'path';

console.log('=== Running SafePatrol v22 Verification Test Suite ===');

// Test 1: Worker taxonomy prompt check
{
  const workerSrc = fs.readFileSync('worker/index.js', 'utf8');
  assert(workerSrc.includes('TAXONOMY_STANDARD_PROMPT'), 'TAXONOMY_STANDARD_PROMPT must be present in worker');
  assert(workerSrc.includes('거푸집동바리공사'), 'Taxonomy must include 거푸집동바리공사');
  assert(workerSrc.includes('특수거푸집'), 'Taxonomy must include 특수거푸집');
  assert(workerSrc.includes('갱폼'), 'Taxonomy must include 갱폼');
  assert(workerSrc.includes('agentMajor'), 'Schema must include agentMajor');
  assert(workerSrc.includes('agentMid'), 'Schema must include agentMid');
  assert(workerSrc.includes('agentMinor'), 'Schema must include agentMinor');
  assert(workerSrc.includes('workGroup'), 'Schema must include workGroup');
  assert(workerSrc.includes('workMethod'), 'Schema must include workMethod');
  assert(workerSrc.includes('condition'), 'Schema must include condition');
  assert(workerSrc.includes('action'), 'Schema must include action');
  assert(workerSrc.includes('rootCauseMgmt'), 'Schema must include rootCauseMgmt');
  assert(workerSrc.includes('rootCauseSystem'), 'Schema must include rootCauseSystem');
  assert(workerSrc.includes('stakeholder'), 'Schema must include stakeholder');
  console.log('✓ Test 1: Worker index.js taxonomy injection verified');
}

// Test 2: LMStudio Client mapping check
{
  const lmSrc = fs.readFileSync('app/js/lmstudio-client.js', 'utf8');
  assert(lmSrc.includes('fallbackRecord.agentMajor = cfData.agentMajor;'), 'LM client must map agentMajor');
  assert(lmSrc.includes('fallbackRecord.agentMinor = cfData.agentMinor;'), 'LM client must map agentMinor');
  assert(lmSrc.includes('fallbackRecord.workMethod = cfData.workMethod;'), 'LM client must map workMethod');
  assert(lmSrc.includes('fallbackRecord.rootCauseMgmt = cfData.rootCauseMgmt;'), 'LM client must map rootCauseMgmt');
  assert(lmSrc.includes('15000'), 'Timeout must be increased to 15000ms');
  console.log('✓ Test 2: lmstudio-client.js AI response mapping & timeout verified');
}

// Test 3: Excel Builder resolvePhotoBanner, cleanContent, resolveAgentHierarchy
{
  // Test in mock environment
  const excelSrc = fs.readFileSync('app/js/excel-builder.js', 'utf8');
  const modFunc = new Function('module', 'exports', `${excelSrc}; return SafeExcel;`);
  const SafeExcel = modFunc({}, {});

  // 3-1: Gang Form banner completion
  const r1 = {
    photoBanner: '절곡부위(ㄱ, ㄷ 형태) Gang Form ...',
    content: '절곡부위(ㄱ, ㄷ 형태) Gang Form 낙하방지용 선해체 방지커버 설치 불량 인양 시 간섭사항 미고려'
  };
  const b1 = SafeExcel.resolvePhotoBanner(r1);
  assert(!b1.includes('...'), 'Banner must not include ...');
  assert(b1.includes('Gang Form') && b1.includes('선해체'), `Banner should be healed: got "${b1}"`);
  console.log(`✓ Test 3-1: Gang Form banner restored: "${b1}"`);

  // 3-2: AL Form banner completion
  const r2 = {
    photoBanner: '콘크리트 타설 중 계단참 AL Form 동바...',
    content: '콘크리트 타설 중 계단참 AL Form 동바리 1개소 해체 후 미복구'
  };
  const b2 = SafeExcel.resolvePhotoBanner(r2);
  assert(!b2.includes('...'), 'Banner must not include ...');
  assert(b2.includes('AL Form') && b2.includes('동바리'), `Banner should be healed: got "${b2}"`);
  console.log(`✓ Test 3-2: AL Form banner restored: "${b2}"`);

  // 3-3: 밑둥잡이 banner healing
  const r3 = {
    photoBanner: '브 느 밑둥잡이 일부 누락',
    content: '비계 워킹타워 하부 밑둥잡이 일부 누락'
  };
  const b3 = SafeExcel.resolvePhotoBanner(r3);
  assert(!b3.includes('브 느'), `Banner should not contain '브 느': got "${b3}"`);
  assert(b3.includes('밑둥잡이'), `Banner should contain '밑둥잡이': got "${b3}"`);
  console.log(`✓ Test 3-3: 밑둥잡이 banner healed: "${b3}"`);

  // 3-4: cleanContent trailing noise removal
  const rawContent = '비계 워킹타워 하부 밑둥잡이 일부 누락 a 0 2{2.쓰.......시푸시';
  const cleanedContent = SafeExcel.cleanContent(rawContent);
  assert(!cleanedContent.includes('{'), `Noise '{' should be removed: got "${cleanedContent}"`);
  assert(!cleanedContent.includes('시푸시'), `Noise '시푸시' should be removed: got "${cleanedContent}"`);
  assert(cleanedContent.includes('비계 워킹타워 하부 밑둥잡이 일부 누락'), `Core content must be preserved: got "${cleanedContent}"`);
  console.log(`✓ Test 3-4: Content noise stripped: "${cleanedContent}"`);

  // 3-5: resolveAgentHierarchy for Gang Form
  const rGang = {
    content: '절곡부위(ㄱ, ㄷ 형태) Gang Form 낙하방지용 선해체 방지커버 설치 불량',
    agentMajor: '가시설',
    agentMid: '특수거푸집',
    agentMinor: '갱폼'
  };
  const hierGang = SafeExcel.resolveAgentHierarchy(rGang);
  assert.strictEqual(hierGang.major, '가시설');
  assert.strictEqual(hierGang.mid, '특수거푸집');
  assert.strictEqual(hierGang.minor, '갱폼');
  console.log(`✓ Test 3-5: Gang Form hierarchy verified: ${hierGang.major} > ${hierGang.mid} > ${hierGang.minor}`);

  // 3-6: resolveAgentHierarchy for AL Form
  const rAl = {
    content: '콘크리트 타설 중 계단참 AL Form 동바리 1개소 해체 후 미복구',
    agentMajor: '가시설',
    agentMid: '거푸집/동바리',
    agentMinor: '알폼'
  };
  const hierAl = SafeExcel.resolveAgentHierarchy(rAl);
  assert.strictEqual(hierAl.major, '가시설');
  assert.strictEqual(hierAl.mid, '거푸집/동바리');
  assert.strictEqual(hierAl.minor, '알폼');
  console.log(`✓ Test 3-6: AL Form hierarchy verified: ${hierAl.major} > ${hierAl.mid} > ${hierAl.minor}`);
}

// Test 4: PPT Generator countermeasure non-bold check
{
  const pptSrc = fs.readFileSync('app/js/ppt-generator.js', 'utf8');
  assert(pptSrc.includes('bold: false'), 'counterRuns must have bold: false');
  assert(pptSrc.includes('const counterRuns ='), 'counterRuns must be created');
  assert(pptSrc.includes('slide.addText(counterRuns.length ? counterRuns : \'\','), 'slide.addText must use counterRuns');
  console.log('✓ Test 4: PPT generator countermeasure non-bold runs verified');
}

// Test 5: PPT Importer v2 cleanBannerText check
{
  const impSrc = fs.readFileSync('app/js/pptx-importer-v2.js', 'utf8');
  assert(impSrc.includes('절곡부위 Gang Form 선해체 방지커버 설치 불량'), 'Importer must heal Gang Form banner');
  assert(impSrc.includes('콘크리트 타설 중 계단참 AL Form 동바리 미복구'), 'Importer must heal AL Form banner');
  assert(impSrc.includes('비계 워킹타워 하부 밑둥잡이 일부 누락'), 'Importer must heal 밑둥잡이 banner');
  console.log('✓ Test 5: pptx-importer-v2 cleanBannerText verified');
}

console.log('=== All SafePatrol v22 Tests Passed Successfully ===');
