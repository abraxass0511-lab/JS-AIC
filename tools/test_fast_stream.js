async function testHybrid() {
  const t0 = Date.now();
  console.log('Sending streaming request to LM Studio...');
  
  const prompt = `너는 대한민국 건설현장 산업안전보건법 및 부적합 점검 전문가 AI이다.
지적사항: "104동 5층 외부 시스템비계 작업발판 틈새가 5cm 벌어져 있어 발빠짐 위험이 있음."

생각(<think>)은 3문장 이내로 아주 짧게 끝내고, 반드시 </think> 태그 뒤에 아래 JSON 형식으로만 최종 답을 출력하라:
{
  "severity": "중부적합",
  "law": "산안규칙 제56조(작업발판의 구조)",
  "hazardType": "추락",
  "item": "비계",
  "mgmtCauses": ["불안전 상태"],
  "holdPoint": true,
  "analysis": "비계 작업발판 틈새 3cm 초과로 추락 위험 극심",
  "pmVerdict": "즉시 작업중지 및 틈새 3cm 이하 보강 후 재검측"
}`;

  const res = await fetch('http://localhost:1234/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'qwen3.5-9b-deepseek-v4-flash',
      messages: [
        { role: 'user', content: prompt }
      ],
      temperature: 0.6,
      max_tokens: 1000,
      stream: true
    })
  });

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let done = false;
  let fullReasoning = '';
  let fullContent = '';
  let tokenCount = 0;

  while (!done) {
    const { value, done: isDone } = await reader.read();
    done = isDone;
    if (value) {
      const chunk = decoder.decode(value);
      const lines = chunk.split('\n');
      for (const line of lines) {
        if (line.startsWith('data: ') && line !== 'data: [DONE]') {
          try {
            const json = JSON.parse(line.slice(6));
            const delta = json.choices[0]?.delta;
            if (delta?.reasoning_content) {
              fullReasoning += delta.reasoning_content;
              tokenCount++;
              if (tokenCount % 10 === 0) process.stdout.write('🤔');
            }
            if (delta?.content) {
              fullContent += delta.content;
              process.stdout.write(delta.content);
            }
          } catch (e) {}
        }
      }
    }
  }

  console.log('\n\n[Total Time]:', (Date.now() - t0) + 'ms');
  console.log('[Reasoning Length]:', fullReasoning.length);
  console.log('[Content]:', fullContent);
}

testHybrid().catch(console.error);
