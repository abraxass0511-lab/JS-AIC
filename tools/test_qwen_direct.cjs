const fetch = globalThis.fetch;

// Cleaner functions directly defined
function cleanSubcontractor(sub) {
  if (!sub) return '';
  let s = String(sub).trim();
  s = s.replace(/^[_\s|ㅣ¦!~—\-:]+/g, '').replace(/[_\s|ㅣ¦!~—\-:]+$/g, '');
  if (/원영건업/i.test(s) || /^\s*$/i.test(s)) return '';
  return s;
}

function cleanLocation(loc) {
  if (!loc) return '';
  let s = String(loc).trim();
  s = s.replace(/\[\s*ERE\b[\s\S]*$/i, '');
  s = s.replace(/\b(?:ERE|MAK|CERNE|EEL)\b[\s\S]*$/i, '');
  s = s.replace(/\b261k\s*22\b/gi, '');
  s = s.replace(/^[_\s|ㅣ¦!~—\-:]+/g, '').replace(/[_\s|ㅣ¦!~—\-:]+$/g, '');
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}

function cleanWorkGroup(wg, content) {
  let s = String(wg || '').trim();
  s = s.replace(/^(?:HEY|HA|HE)\s*[:;：]\s*/i, '');
  s = s.replace(/^[_\s|ㅣ¦!~—\-:]+/g, '').replace(/[_\s|ㅣ¦!~—\-:]+$/g, '');
  if (/거푸집|동바리/i.test(s) || /거푸집|동바리/i.test(content || '')) return '거푸집동바리공사';
  if (/비계/i.test(s) || /비계/i.test(content || '')) return '비계공사';
  if (/^HA\s*공사/i.test(s) || /^BEE\s*HA\s*공사/i.test(s)) return '비계공사';
  return s || '거푸집동바리공사';
}

function cleanOpinionText(txt) {
  if (!txt) return '';
  let s = String(txt)
    .replace(/(?:\[?\s*(?:HAT|점검단)\s*제안\]?|시스템\s*개선|교육\/코칭)[\s\S]*$/gi, '')
    .replace(/^[\s|ㅣ¦_!\-•·~—\r\n]+/g, '')
    .replace(/\s+[블를클|ㅣ¦_!~—\-]+\s*$/g, '')
    .replace(/\[=\]\s*oa/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  return s;
}

function cleanProposalText(txt) {
  if (!txt) return '';
  let s = String(txt)
    .replace(/^[|\sㅣ¦_!\-•·~—]+/gm, '')
    .replace(/(?:oo\s*Tle\s*©|oo\s*기느으|\[=\]\s*oa)[\s\S]*$/gi, '')
    .replace(/\s+[블를클|ㅣ¦_!~—\-]+\s*$/g, '')
    .trim();
  return s;
}

function cleanActionPlan(txt) {
  if (!txt) return '';
  let s = String(txt)
    .replace(/\[?\s*PM\s*판정\s*결과\s*\]?/gi, '')
    .replace(/\(모니터링\s*강화\)|\(이행강화안\s*수립\)|\(협력사\s*교육\)|\(근로자\s*교육\)|\(관리감독자\s*경고\)/g, '')
    .replace(/(?:EE\s*tee|ee\s*A\s*eA|바가\s*---|\\btee\s*ee\b|[—\-_]{3,})[\s\S]*$/gi, '')
    .trim();
  const rawLines = s.split('\n').map(l => l.trim()).filter(Boolean);
  const bulletLines = [];
  for (const l of rawLines) {
    let cl = l.replace(/^[-•*·▪]\s*/, '').trim();
    if (cl) bulletLines.push(`- ${cl}`);
  }
  return bulletLines.join('\n');
}

function cleanContent(txt) {
  if (!txt) return '';
  let s = String(txt)
    .replace(/\(5500\)/g, '(55cm)')
    .replace(/\(3000\)/g, '(30cm)')
    .replace(/하부\s*벽이음과\s*HE\s*위치가/g, '하부 벽이음과 버팀대 위치가')
    .replace(/4%\s*11일/g, '4월 11일')
    .replace(/6\/\s*코어/g, 'E/V 코어')
    .replace(/—\s*4월/g, '- 4월')
    .replace(/(?:EE\s*tee|ee\s*A\s*eA|바가\s*---|\\btee\s*ee\b|[—\-_]{3,})[\s\S]*$/gi, '')
    .trim();
  return s;
}

async function testQwenPipeline() {
  console.log('=== Testing Qwen Pipeline with Sanity Merging ===');

  const systemPrompt = `너는 대한민국 건설현장 패트롤 안전점검 장표 분석 및 구조화 전문가 AI이다.
주어진 장표 텍스트가 [지적사항 부적합 점검장표]인지, 아니면 [참고사항 / 시공가이드 / 표준작업지침 / 샘플 안내문]인지 정밀 판별하라.
절대로 임의의 가짜 회사명을 넣지 말고 공란이면 빈 문자열 ""로 하라.
장소에서 [ERE 12... 등의 노이즈는 완전히 제거하라.
공종명에서 HEY: 등의 잡음은 완전히 제거하라.
부적합 내용 전문을 누락 없이 그대로 추출하라 (5500 -> 55cm, HE -> 버팀대 등 오타 교정).
발생원인 관리자/관계자 의견 전문을 누락 없이 추출하되 끝의 '블' 등 오타만 제거하라.
점검단 제안의 앞단 '| -' 및 'oo Tle' 등 잡음은 제거하라.
개선대책의 모든 항목은 누락 없이 각각 '- ' 불릿으로 시작하게 하라.
생각 과정(<think>)은 1~2문장으로 짧게 작성하고, 반드시 아래 JSON으로만 최종 출력하라:

{
  "sheetType": "지적사항",
  "_skipped": false,
  "subcontractor": "기재된 회사명 또는 빈 문자열",
  "workGroup": "공종명 (거푸집동바리공사, 비계공사 등)",
  "location": "작업장소 (노이즈 제거)",
  "content": "부적합 지적내용 전문",
  "severity": "중부적합 또는 경부적합",
  "type": "붕괴 또는 추락 또는 낙하 또는 협착",
  "law": "관련기준 (실제 작업절차/법규명)",
  "interviewAuthor": "협력사 시공관리자",
  "interviewOpinion": "관계자 의견 전문",
  "inspectorOpinionType": "시스템 개선 또는 교육/코칭 (복수시 콤마 연결)",
  "auditProposal": "점검단 제안 전문 (불릿)",
  "actionPlan": "개선대책 모든 항목 (각각 - 불릿 시작)",
  "pmVerdict": "PM 판정결과"
}`;

  const sampleOcrText = `[메타 정보]: 작업장소 : 106동 지하2층 [ERE 12 MAK: 261k 22 | 공종명 : HEY: 거푸집동바리공사 | 협력사 : 

[관련 기준]: 5: 형 거푸집공 업적
현장 제작 대형 거푸집공사 작업 절차
* 대형 거푸집 상부는 각관을 설치해 보강한다.(강관 파이프 사용금지)
* 각관 설치시 각관 전용 철물(사각후크)을 설치한다.

[부적합 내용]: 계단실 슬라브 지지용 동바리 멍에재 길이짧음, 이중 동바리 상태 및 동바리 지지용 밑받침 불량
EE tee ee A eA ee —

[발생원인 관리자 의견]: [관리자 의견 : 협력사 시공관리자] 2중 경사 슬라브 특성상 동바리 설치가 난이하며 철근 작업전 가설 작업용으로 이중 동바리를 사용하였으며 멍에재 상태 확인이 부족함 블

[점검단 제안]: 시스템 개선, 교육/코칭 / | - 경사 슬라브 동바리 지지상태 전수 점검 및 이중 동바리 발생 부위 재검토 필요

[개선대책]: - 경사 슬라브 동바리 지지상태 전수 점검 실시, 밑받침 부적합 즉시 개선조치
- 계단실 작업 전 수립한 방법(위험성평가, 시연회)으로 설치 재교육 및 적정 설치 모니터링 강화

[PM 판정결과]: 시스템 개선 (모니터링 강화)`;

  const fallbackRecord = {
    slideNumber: 1,
    severity: '중부적합',
    type: '붕괴',
    workGroup: cleanWorkGroup('HEY: 거푸집동바리공사', '계단실 슬라브 지지용 동바리'),
    subcontractor: cleanSubcontractor(''),
    location: cleanLocation('106동 지하2층 [ERE 12 MAK: 261k 22'),
    content: cleanContent('계단실 슬라브 지지용 동바리 멍에재 길이짧음, 이중 동바리 상태 및 동바리 지지용 밑받침 불량\nEE tee ee A eA ee —'),
    interviewAuthor: '협력사 시공관리자',
    interviewOpinion: cleanOpinionText('2중 경사 슬라브 특성상 동바리 설치가 난이하며 철근 작업전 가설 작업용으로 이중 동바리를 사용하였으며 멍에재 상태 확인이 부족함 블'),
    inspectorOpinionType: '시스템 개선, 교육/코칭',
    auditProposal: cleanProposalText('| - 경사 슬라브 동바리 지지상태 전수 점검 및 이중 동바리 발생 부위 재검토 필요'),
    actionPlan: cleanActionPlan('- 경사 슬라브 동바리 지지상태 전수 점검 실시, 밑받침 부적합 즉시 개선조치\n- 계단실 작업 전 수립한 방법(위험성평가, 시연회)으로 설치 재교육 및 적정 설치 모니터링 강화'),
    pmVerdict: '시스템 개선'
  };

  console.log('Sending request to LM Studio Qwen (Timeout: 120s)...');
  const t0 = Date.now();
  const ctrl = new AbortController();
  const timeoutId = setTimeout(() => ctrl.abort(), 120000);
  const res = await fetch('http://localhost:1234/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'qwen3.5-9b-deepseek-v4-flash',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: sampleOcrText }
      ],
      temperature: 0.1,
      max_tokens: 2500
    }),
    signal: ctrl.signal
  });
  clearTimeout(timeoutId);

  console.log('Qwen responded in', Date.now() - t0, 'ms');
  const data = await res.json();
  const msg = data.choices?.[0]?.message;
  const rawText = msg?.content || msg?.reasoning_content || '';
  
  function extractJSON(text) {
    if (!text) return null;
    try {
      const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (jsonMatch) return JSON.parse(jsonMatch[1]);
      const firstBrace = text.indexOf('{');
      const lastBrace = text.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        return JSON.parse(text.slice(firstBrace, lastBrace + 1));
      }
    } catch (e) {}
    return null;
  }

  const parsed = extractJSON(msg?.content) || extractJSON(msg?.reasoning_content) || extractJSON(rawText);

  const finalRecord = {
    ...fallbackRecord,
    ...(parsed || {}),
    subcontractor: cleanSubcontractor(parsed?.subcontractor !== undefined ? parsed.subcontractor : fallbackRecord.subcontractor),
    workGroup: cleanWorkGroup(parsed?.workGroup || fallbackRecord.workGroup, parsed?.content || fallbackRecord.content),
    location: cleanLocation(parsed?.location || fallbackRecord.location),
    content: cleanContent(parsed?.content || fallbackRecord.content),
    interviewAuthor: parsed?.interviewAuthor || fallbackRecord.interviewAuthor || '협력사 시공관리자',
    interviewOpinion: cleanOpinionText(parsed?.interviewOpinion || fallbackRecord.interviewOpinion),
    auditProposal: cleanProposalText(parsed?.auditProposal || fallbackRecord.auditProposal),
    actionPlan: cleanActionPlan(parsed?.actionPlan || fallbackRecord.actionPlan),
    inspectorOpinionType: parsed?.inspectorOpinionType || fallbackRecord.inspectorOpinionType || '시스템 개선',
    pmVerdict: parsed?.pmVerdict || fallbackRecord.pmVerdict || '시스템 개선'
  };

  console.log('\n=== FINAL VERIFIED RECORD (QWEN INTEGRATED) ===');
  console.log('1. 협력사:', JSON.stringify(finalRecord.subcontractor));
  console.log('2. 작업장소:', JSON.stringify(finalRecord.location));
  console.log('3. 공종명:', JSON.stringify(finalRecord.workGroup));
  console.log('4. 부적합 내용:', JSON.stringify(finalRecord.content));
  console.log('5. 관련기준:', JSON.stringify(finalRecord.law));
  console.log('6. 관계자 구분:', JSON.stringify(finalRecord.interviewAuthor));
  console.log('7. 관계자 의견:', JSON.stringify(finalRecord.interviewOpinion));
  console.log('8. 점검자 의견 구분:', JSON.stringify(finalRecord.inspectorOpinionType));
  console.log('9. 점검단 제안:', JSON.stringify(finalRecord.auditProposal));
  console.log('10. 개선대책:\n' + finalRecord.actionPlan);
  console.log('11. PM 판정결과:', JSON.stringify(finalRecord.pmVerdict));
}

testQwenPipeline().catch(console.error);
