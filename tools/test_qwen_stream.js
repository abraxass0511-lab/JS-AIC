async function testStream() {
  const prompt = '비계 작업발판 틈새 5cm 벌어짐. 위반 조항과 부적합 등급만 한국어로 1줄로 말해줘.';
  const res = await fetch('http://localhost:1234/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'qwen3.5-9b-deepseek-v4-flash',
      messages: [{ role: 'user', content: prompt }],
      stream: true,
      max_tokens: 300
    })
  });

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let done = false;
  let fullText = '';

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
            const content = delta?.content || delta?.reasoning_content || '';
            process.stdout.write(content);
            fullText += content;
          } catch (e) {}
        }
      }
    }
  }
  console.log('\n--- FINISHED ---');
}

testStream().catch(console.error);
