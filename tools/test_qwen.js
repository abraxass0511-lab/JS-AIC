
async function testQwen() {
  const prompt = `너는 대한민국 산업안전보건법 및 건설현장 안전 전문가이다.
지적사항을 읽고 법적 위반사항을 분석하여 오직 유효한 JSON 형식으로만 답하라.

JSON 형식:
{
  "severity": "🚨 중부적합" 또는 "⚠️ 경부적합",
  "law": "정확한 산안규칙 또는 산안법 조항 번호 및 조항명",
  "type": "추락" 또는 "낙하" 또는 "붕괴" 또는 "협착" 또는 "전도" 또는 "화재",
  "mgmtCauses": ["계획 미수립", "계획 미이행", "불안전 행동", "불안전 상태" 중 해당하는 것],
  "holdPoint": true 또는 false,
  "analysis": "핵심 법적 판단 사유 1~2문장",
  "actionRecommendation": "현장 조치 권고사항 1문장"
}`;

  const userQuery = '104동 5층 외부 시스템비계 작업발판 틈새가 5cm 벌어져 있어 발빠짐 위험이 있음.';

  const res = await fetch('http://localhost:1234/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'qwen3.5-9b-deepseek-v4-flash',
      messages: [
        { role: 'system', content: prompt },
        { role: 'user', content: userQuery }
      ],
      temperature: 0.1,
      max_tokens: 800
    })
  });

  const data = await res.json();
  console.log('Result:', data.choices[0].message);
}

testQwen().catch(console.error);
