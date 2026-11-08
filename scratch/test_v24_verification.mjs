import assert from 'assert';
import fs from 'fs';

console.log('=== Running SafePatrol v24 Comprehensive Verification Suite ===');

// 1. Verify Excel Builder & PPT Generator do not contain rawLoc reference errors
{
  const excelSrc = fs.readFileSync('app/js/excel-builder.js', 'utf8');
  assert(!excelSrc.includes('rawLoc'), 'excel-builder.js must not reference rawLoc');

  const modFunc = new Function('module', 'exports', `${excelSrc}; return SafeExcel;`);
  const SafeExcel = modFunc({}, {});

  // Test cleanLocation without crashing
  const loc1 = SafeExcel.cleanLocation('101동 외부', '101동 외부 비계 설치');
  assert.strictEqual(loc1, '101동 외부');

  const loc2 = SafeExcel.cleanLocation(undefined, '107동 3층 1코어 슬래브 타설');
  assert(loc2.includes('107동 3층 1코어'), `Must include 107동 3층 1코어: got "${loc2}"`);
  console.log('✓ Test 1: cleanLocation runs cleanly without rawLoc error');
}

// 2. Verify Banner Full Healing (No Truncation, No Ellipsis)
{
  const excelSrc = fs.readFileSync('app/js/excel-builder.js', 'utf8');
  const modFuncExcel = new Function('module', 'exports', `${excelSrc}; return SafeExcel;`);
  const SafeExcel = modFuncExcel({}, {});

  const r1 = {
    photoBanner: '절곡부위(ㄱ, ㄷ 형태) Gang Form ...',
    content: '절곡부위(ㄱ, ㄷ 형태) Gang Form 낙하방지용 선해체 방지커버 설치 불량 인양 시 간섭사항 미고려'
  };
  const b1 = SafeExcel.resolvePhotoBanner(r1);
  assert.strictEqual(b1, '절곡부위 Gang Form 선해체 방지커버 설치 불량', `r1 banner must be fully restored: got "${b1}"`);

  const r2 = {
    photoBanner: '브 느 밑둥잡이 일부 누락',
    content: '비계 워킹타워 하부 밑둥잡이 일부 누락 a 0 2{2.쓰.......시푸시'
  };
  const b2 = SafeExcel.resolvePhotoBanner(r2);
  assert.strictEqual(b2, '외부비계 밑둥잡이 일부 누락', `r2 banner must be healed: got "${b2}"`);

  const r3 = {
    photoBanner: '콘크리트 타설 중 계단참 AL Form 동바...',
    content: '콘크리트 타설 중 계단참 AL Form 동바리 1개소 해체 후 미복구'
  };
  const b3 = SafeExcel.resolvePhotoBanner(r3);
  assert.strictEqual(b3, '콘크리트 타설 중 계단참 AL Form 동바리 미복구', `r3 banner must be fully restored: got "${b3}"`);
  console.log('✓ Test 2: Photo Banners in Excel fully restored without truncation or ellipsis');
}

// 3. Verify Content Noise Stripping (a 0 2{2.쓰... removed)
{
  const excelSrc = fs.readFileSync('app/js/excel-builder.js', 'utf8');
  const modFuncExcel = new Function('module', 'exports', `${excelSrc}; return SafeExcel;`);
  const SafeExcel = modFuncExcel({}, {});

  const rawC = '비계 워킹타워 하부 밑둥잡이 일부 누락 a 0 2{2.쓰.......시푸시';
  const c = SafeExcel.cleanContent(rawC);
  assert.strictEqual(c, '비계 워킹타워 하부 밑둥잡이 일부 누락', `Noise must be stripped: got "${c}"`);
  console.log(`✓ Test 3: OCR Noise stripped cleanly: "${c}"`);
}

// 4. Verify 알폼 / AL Form Hierarchy (가시설 > 특수거푸집 > 알폼)
{
  const clsSrc = fs.readFileSync('app/js/classifier.js', 'utf8');
  const modFuncCls = new Function('module', 'exports', `${clsSrc}; return SafeClassifier;`);
  const SafeClassifier = modFuncCls({}, {});
  const tax = JSON.parse(fs.readFileSync('app/data/taxonomy.json', 'utf8'));
  const kw = JSON.parse(fs.readFileSync('app/data/keywords.json', 'utf8'));
  const cls = SafeClassifier.createClassifier(tax, kw);
  const res = cls.classify('콘크리트 타설 중 계단참 AL Form 동바리 1개소 해체 후 미복구');
  assert.strictEqual(res.result.기인물대, '가시설');
  assert.strictEqual(res.result.기인물중, '특수거푸집');
  assert.strictEqual(res.result.기인물소, '알폼');

  const excelSrc = fs.readFileSync('app/js/excel-builder.js', 'utf8');
  const modFuncExcel = new Function('module', 'exports', `${excelSrc}; return SafeExcel;`);
  const SafeExcel = modFuncExcel({}, {});
  const hier = SafeExcel.resolveAgentHierarchy({ content: '콘크리트 타설 중 계단참 AL Form 동바리 1개소 해체 후 미복구' });
  assert.strictEqual(hier.major, '가시설');
  assert.strictEqual(hier.mid, '특수거푸집');
  assert.strictEqual(hier.minor, '알폼');
  console.log(`✓ Test 4: AL Form / 알폼 correctly categorized as: ${hier.major} > ${hier.mid} > ${hier.minor}`);
}

// 5. Verify Countermeasure Textbox in PPT is Bold: False
{
  const pptSrc = fs.readFileSync('app/js/ppt-generator.js', 'utf8');
  assert(pptSrc.includes('bold: false, fontFace: FONT_MALGUN'), 'counterRuns addText must have bold: false');
  console.log('✓ Test 5: Countermeasure text in PPT verified bold: false');
}

// 6. Verify Minor Severity routes to Minor Layout (부적합장표(경부적합).pptx)
{
  const pptSrc = fs.readFileSync('app/js/ppt-generator.js', 'utf8');
  const isRiskMatch = pptSrc.match(/function isRiskAssessmentSheet[\s\S]*?\n  \}/);
  assert(isRiskMatch, 'isRiskAssessmentSheet must be present');

  const isRiskFunc = new Function('record', 'data', `${isRiskMatch[0]}; return isRiskAssessmentSheet(record, data);`);
  const rMinor = {
    severity: '경부적합',
    content: '구획된 바닥 안전통로에 거푸집 자재를 방치함'
  };
  const isMinor = isRiskFunc(rMinor, {});
  assert.strictEqual(isMinor, true, 'Minor record must route to Minor layout');
  console.log('✓ Test 6: Minor record routes to Minor (경부적합) layout');
}

console.log('=== All SafePatrol v24 Tests Passed Successfully! ===');
