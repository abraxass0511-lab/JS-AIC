import fs from 'fs';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const tax = JSON.parse(fs.readFileSync('app/data/taxonomy.json', 'utf8'));
const kws = JSON.parse(fs.readFileSync('app/data/keywords.json', 'utf8'));
await import('../app/js/classifier.js');
const SafeClassifier = globalThis.SafeClassifier;

const classifier = SafeClassifier.createClassifier(tax, kws);

console.log('--- Test 1 (비계 발판 틈새) ---');
const r1 = classifier.classify('시스템비계 작업발판 틈새 5cm 벌어짐 및 안전난간대 미설치');
console.log(JSON.stringify(r1.result, null, 2));

console.log('\n--- Test 2 (밀폐공간 질식 위험) ---');
const r2 = classifier.classify('밀폐공간 정화조 내부 유해가스 농도 미측정 및 환기팬 미가동');
console.log(JSON.stringify(r2.result, null, 2));

console.log('\n--- Test 3 (임시분전함 접지) ---');
const r3 = classifier.classify('임시분전함 외함 접지 미시행 및 누전차단기 불량');
console.log(JSON.stringify(r3.result, null, 2));
