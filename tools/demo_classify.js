// 무료 자동분류 시연: node tools/demo_classify.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const { createClassifier } = require(path.join(ROOT, 'src', 'classifier.js'));
const tax = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'taxonomy.json'), 'utf8'));
const kw = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'keywords.json'), 'utf8'));
const clf = createClassifier(tax, kw);

const inputs = [
  '안전난간대 미설치',
  '개구부 덮개 미고정',
  '분전반 문 개방 충전부 노출',
  '고소작업 중 안전대 미체결',
  '이동식비계 바퀴 고정 안됨',
  '파이프서포트 3개 이어서 사용',
  '와이어로프 소선 단선',
  '용접작업 중 소화기 없음',
  '백호 작업반경 내 근로자 접근',
  '3층 계단실 정리 필요',
];

const out = [];
const log = s => { out.push(s); };
log('━━━━━━━━ ① 키워드 사전 자동분류 ━━━━━━━━');
inputs.forEach(t => {
  const r = clf.classify(t);
  log(`\n▶ 입력: "${t}"`);
  if (!r.matched) { log('   (추천 없음 → 직접 선택)'); return; }
  const x = r.result;
  log(`   종류/항목 : ${x.종류} › ${x.항목}`);
  log(`   기인물    : ${x.기인물.join(' / ') || '-'}`);
  log(`   유형      : ${x.유형}`);
  log(`   산안법    : ${x.산업안전보건법}`);
  log(`   상태      : ${x.상태 || '-'}`);
  log(`   행동      : ${x.행동 || '-'}`);
  log(`   발생원인  : ${x.발생원인.join(', ') || '-'}`);
  log(`   근거단어  : ${r.근거단어.join(', ')}`);
  if (r.candidates.length) log(`   다른 후보 : ${r.candidates.join(' | ')}`);
});

log('\n━━━━━━━━ ② 과거 기록 유사도 검색 ━━━━━━━━');
const history = [
  { content: '비계시설 작업발판 하부 수평재 미설치', 작업명: '비계설치작업', 공종: '가설공사', 장소: '아파트 106동 외부', 항목: '시스템비계' },
  { content: '슬래브 개구부 덮개 미고정 및 표지 미부착', 작업명: '자재 운반·정리작업', 공종: '공통', 장소: '물류센터 3층', 항목: '개구부' },
];
['106동 비계 수평재 누락', '개구부 덮개 고정 안됨'].forEach(t => {
  log(`\n▶ 입력: "${t}"`);
  clf.similar(t, history).forEach(s => log(`   유사 ${(s.sim * 100).toFixed(0)}% ← "${s.record.content}" → 작업명 ${s.record.작업명} · 공종 ${s.record.공종} · 장소 ${s.record.장소}`));
});

log('\n━━━━━━━━ ③ 학습: 사람이 고친 결과를 다음에 활용 ━━━━━━━━');
const t1 = '3층 계단실 정리 필요';
log(`\n▶ 처음 입력: "${t1}" → 사전 추천: ${clf.classify(t1).matched ? '있음' : '없음'}`);
log('   점검자가 직접 [종류] 작업장·통로 › [항목] 정리정돈 선택 후 저장 → 과거 기록에 쌓임');
history.push({ content: t1, 작업명: '자재 운반·정리작업', 공종: '공통', 장소: '3층 계단실', 항목: '정리정돈' });
const t2 = '5층 계단실 자재 정리 안됨';
log(`\n▶ 다음에 입력: "${t2}"`);
clf.similar(t2, history).forEach(s => log(`   유사 ${(s.sim * 100).toFixed(0)}% ← "${s.record.content}" → 항목 ${s.record.항목} · 작업명 ${s.record.작업명} · 공종 ${s.record.공종}`));

const file = path.join(ROOT, 'samples', 'demo_classify_result.txt');
fs.writeFileSync(file, out.join('\n'), 'utf8');
console.log('saved', file);
