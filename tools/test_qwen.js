async function testFewShot() {
  const t0 = Date.now();
  const res = await fetch('http://localhost:1234/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'qwen3.5-9b-deepseek-v4-flash',
      messages: [
        { role: 'system', content: '너는 산업안전보건법 전문가이다. 생각 과정 없이 즉시 유효한 JSON만 출력하라.' },
        { role: 'user', content: '비계 발판 틈새 5cm' },
        { role: 'assistant', content: '{"severity":"🚨 중부적합","law":"산안규칙 제56조(작업발판의 구조)","hazardType":"추락","item":"비계","mgmtCauses":["불안전 상태"],"holdPoint":true,"pmVerdict":"작업중지 및 발판 틈새 3cm 이하 보강"}' },
        { role: 'user', content: '슬래브 개구부 덮개 미설치 추락 위험' }
      ],
      temperature: 0.1,
      max_tokens: 300
    })
  });

  const data = await res.json();
  console.log('Time:', (Date.now() - t0) + 'ms');
  console.log('Msg:', data.choices[0].message);
}

testFewShot().catch(console.error);
