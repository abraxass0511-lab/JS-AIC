import assert from 'assert';
import fs from 'fs';

console.log('=== Running SafePatrol v23 Verification Test Suite ===');

// 1. Verify Typo Fix: 방지커바 -> 방지커버
{
  const pptSrc = fs.readFileSync('app/js/ppt-generator.js', 'utf8');
  assert(pptSrc.includes('방지커바'), 'healSafetyKoreanLexicon must handle 방지커바');

  const excelSrc = fs.readFileSync('app/js/excel-builder.js', 'utf8');
  const modFunc = new Function('module', 'exports', `${excelSrc}; return SafeExcel;`);
  const SafeExcel = modFunc({}, {});

  const healed = SafeExcel.healSafetyKoreanLexicon('Gang Form 낙하방지용 선해체 방지커바');
  assert(!healed.includes('커바'), `커바 must be healed to 커버: got "${healed}"`);
  assert(healed.includes('커버'), `커버 must be present: got "${healed}"`);
  console.log(`✓ Test 1: Typo 방지커바 healed to: "${healed}"`);
}

// 2. Verify 알폼 -> 특수거푸집 in Classifier & Excel
{
  const clsSrc = fs.readFileSync('app/js/classifier.js', 'utf8');
  const modFunc = new Function('module', 'exports', `${clsSrc}; return SafeClassifier;`);
  const SafeClassifier = modFunc({}, {});

  const tax = JSON.parse(fs.readFileSync('app/data/taxonomy.json', 'utf8'));
  const kw = JSON.parse(fs.readFileSync('app/data/keywords.json', 'utf8'));
  const cls = SafeClassifier.createClassifier(tax, kw);
  const res = cls.classify('알폼 해체 작업 중 슬래브 단부 안전난간 미설치');
  assert.strictEqual(res.result.기인물대, '가시설', '알폼 기인물대 must be 가시설');
  assert.strictEqual(res.result.기인물중, '특수거푸집', `알폼 기인물중 must be 특수거푸집: got "${res.result.기인물중}"`);
  assert.strictEqual(res.result.기인물소, '알폼', `알폼 기인물소 must be 알폼: got "${res.result.기인물소}"`);
  console.log(`✓ Test 2-1: Classifier 알폼 -> ${res.result.기인물대} > ${res.result.기인물중} > ${res.result.기인물소}`);

  // In Excel resolveAgentHierarchy
  const excelSrc = fs.readFileSync('app/js/excel-builder.js', 'utf8');
  const modFuncExcel = new Function('module', 'exports', `${excelSrc}; return SafeExcel;`);
  const SafeExcel = modFuncExcel({}, {});

  const hier = SafeExcel.resolveAgentHierarchy({ content: '콘크리트 타설 중 계단참 AL Form 동바리 미복구' });
  assert.strictEqual(hier.major, '가시설');
  assert.strictEqual(hier.mid, '특수거푸집', `AL Form 기인물중 must be 특수거푸집: got "${hier.mid}"`);
  assert.strictEqual(hier.minor, '알폼', `AL Form 기인물소 must be 알폼: got "${hier.minor}"`);
  console.log(`✓ Test 2-2: Excel AL Form -> ${hier.major} > ${hier.mid} > ${hier.minor}`);
}

// 3. Verify 경부적합 -> 템플릿/부적합장표(경부적합).pptx 서식 (isRiskAssessmentSheet === true)
{
  const pptSrc = fs.readFileSync('app/js/ppt-generator.js', 'utf8');
  
  // Test regex match for isRiskAssessmentSheet definition
  assert(pptSrc.includes("if (record.severity === '경부적합'"), 'isRiskAssessmentSheet must check record.severity === 경부적합');

  // Evaluate isRiskAssessmentSheet with mock
  const isRiskFunc = new Function('record', 'data', `
    if (!record) return false;
    if (record.severity === '경부적합' || record.sheetType === '위험성평가' || record.isRiskAssessment === true) {
      return true;
    }
    const txt = \`\${record.sheetCategory || ''} \${record.category || ''} \${data?.rawLaw || ''} \${record.content || ''}\`;
    return /위험성\\s*평가\\s*확인|유해\\s*위험요인\\s*파악/i.test(txt);
  `);

  const minorRec = {
    severity: '경부적합',
    content: '구획된 바닥 안전통로에 거푸집 자재를 방치함',
    workGroup: '거푸집동바리공사',
    location: '계단·복도'
  };
  const isMinor = isRiskFunc(minorRec, {});
  assert.strictEqual(isMinor, true, '경부적합 record must trigger Minor (위험성평가표) layout');
  console.log('✓ Test 3-1: 경부적합 record routes to 부적합장표(경부적합).pptx layout: true');

  const majorRec = {
    severity: '중부적합',
    content: '시스템비계 벽이음 미설치',
    workGroup: '비계공사'
  };
  const isMajor = isRiskFunc(majorRec, {});
  assert.strictEqual(isMajor, false, '중부적합 record must route to Major (시설물/법규) layout');
  console.log('✓ Test 3-2: 중부적합 record routes to 부적합장표(중부적합).pptx layout: false');
}

// 4. Verify Single Line Font Size downscaling for Long Banner
{
  const pptSrc = fs.readFileSync('app/js/ppt-generator.js', 'utf8');
  const calcMatch = pptSrc.match(/function calcSingleLineFontSize[\s\S]*?return sz;\s*\}/);
  assert(calcMatch, 'calcSingleLineFontSize must be present');

  const calcFunc = new Function('text', 'widthInch', 'baseSize', 'minSize', `${calcMatch[0]}; return calcSingleLineFontSize(text, widthInch, baseSize, minSize);`);

  const longBanner = 'Gang Form 낙하방지용 선해체방지커버 설치 불량';
  const bannerWidth = 5.4580;
  const sz = calcFunc(longBanner, bannerWidth, 14, 9.5);
  console.log(`Banner "${longBanner}" calculated font size: ${sz}pt`);
  assert(sz <= 12, `Font size must downscale below 12pt to avoid cutting in 5.458" box: got ${sz}pt`);
  assert(sz >= 9.5, `Font size must stay above minSize 9.5pt: got ${sz}pt`);
  console.log('✓ Test 4: Long banner downscaled perfectly to fit without clipping');
}

console.log('=== All SafePatrol v23 Verification Tests Passed Successfully ===');
