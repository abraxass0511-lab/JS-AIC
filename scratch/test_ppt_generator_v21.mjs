import fs from 'fs';

// Verify ppt-generator.js syntax and exports
const pptContent = fs.readFileSync('app/js/ppt-generator.js', 'utf8');

console.log('=== TEST 1: Check Bold removal in 개선대책 ===');
const boldCheckInCounter = /options:\s*\{[\s\S]*?bold:\s*false[\s\S]*?counterRuns/.test(pptContent) ||
  /slide\.addText\(data\.countermeasureContent\s*\|\|\s*'',\s*\{[\s\S]*?bold:\s*false/.test(pptContent);
console.log('Bold in PptxGenJS countermeasure is false:', boldCheckInCounter);
if (!boldCheckInCounter) throw new Error('Bold is still true in countermeasure PPT text!');

const htmlBoldCheck = /font-weight:\s*400;[\s\S]*?renderHangingLinesHTML\(data\.countermeasureContent/.test(pptContent);
console.log('Font-weight in HTML preview countermeasure is 400:', htmlBoldCheck);
if (!htmlBoldCheck) throw new Error('Font-weight is not 400 in HTML countermeasure preview!');

console.log('=== TEST 2: Check ... truncation removal in banner ===');
const hasSubstringEllipsis = /firstLine\.substring\(\d+,\s*\d+\)\s*\+\s*'\.\.\.'/.test(pptContent);
console.log('Has substring ellipsis in ppt-generator.js:', hasSubstringEllipsis);
if (hasSubstringEllipsis) throw new Error('ppt-generator.js still has substring ellipsis truncation!');

console.log('=== TEST 3: Check Gang Form banner in extractDirectAction ===');
const hasGangFormBanner = /\/Gang\\s\*Form\|선해체\|갱폼\/i\.test\(text\)/.test(pptContent);
console.log('Has Gang Form banner check:', hasGangFormBanner);
if (!hasGangFormBanner) throw new Error('Gang Form banner check missing in extractDirectAction!');

console.log('=== TEST 4: Check isRiskAssessmentSheet routing ===');
const hasRiskSheetRouting = /function isRiskAssessmentSheet/.test(pptContent) &&
  /if \(isRiskAssessmentSheet\(record, data\)\)/.test(pptContent);
console.log('Has isRiskAssessmentSheet routing:', hasRiskSheetRouting);
if (!hasRiskSheetRouting) throw new Error('isRiskAssessmentSheet routing missing!');

console.log('=== TEST 5: Check photo2 in Minor slide does not contaminate [위험성평가표] ===');
const hasPhoto2RiskCheck = /const isPhoto2RiskDoc = Boolean/.test(pptContent) &&
  /if \(hasPhoto2 && !isPhoto2RiskDoc\)/.test(pptContent);
console.log('Has photo2 risk check avoiding [위험성평가표] contamination:', hasPhoto2RiskCheck);
if (!hasPhoto2RiskCheck) throw new Error('photo2 risk check missing!');

console.log('🎉 ALL 5 VALIDATIONS PASSED PERFECTLY!');
