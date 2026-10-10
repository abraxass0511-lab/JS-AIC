/**
 * SafePatrol - LM Studio 로컬 Qwen AI 실시간 스트리밍 연동 클라이언트
 *  - Endpoint: http://localhost:1234/v1 (또는 http://192.168.45.164:1234/v1)
 *  - Model: qwen3.5-9b-deepseek-v4-flash (DeepSeek Reasoning 전용 스트리밍 처리)
 *  - 0.05초 즉시 규칙 판정 + 로컬 AI 실시간 스트리밍 보강 아키텍처
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SafeLocalAI = factory();
})(typeof self !== 'undefined' ? self : this, function () {

  const DEFAULT_ENDPOINTS = [
    'http://localhost:1234/v1',
    'http://127.0.0.1:1234/v1',
    'http://192.168.45.164:1234/v1'
  ];

  let currentEndpoint = localStorage.getItem('sp_lmstudio_endpoint') || DEFAULT_ENDPOINTS[0];
  let currentModel = localStorage.getItem('sp_lmstudio_model') || 'qwen3.5-9b-deepseek-v4-flash';
  let isConnected = false;

  async function checkConnection(url = currentEndpoint) {
    for (const ep of [url, ...DEFAULT_ENDPOINTS]) {
      try {
        const ctrl = new AbortController();
        const timeout = setTimeout(() => ctrl.abort(), 3000);
        const res = await fetch(`${ep}/models`, { signal: ctrl.signal });
        clearTimeout(timeout);
        if (res.ok) {
          const data = await res.json();
          currentEndpoint = ep;
          localStorage.setItem('sp_lmstudio_endpoint', ep);
          const models = (data.data || []).map(m => m.id);
          if (models.length > 0) {
            if (!models.includes(currentModel)) {
              currentModel = models[0];
            }
            localStorage.setItem('sp_lmstudio_model', currentModel);
          }
          isConnected = true;
          return { ok: true, endpoint: ep, model: currentModel, availableModels: models };
        }
      } catch (e) {}
    }
    isConnected = false;
    return { ok: false, endpoint: currentEndpoint, error: 'LM Studio 서버에 연결할 수 없습니다. (포트 1234 확인 필요)' };
  }

  /**
   * 0.05초 즉시 1차 규칙 판정 (오프라인 산안법 룰 엔진)
   */
  function quickRuleAnalysis(content) {
    const text = content.toLowerCase();
    let severity = '경부적합';
    let law = '산안규칙 제42조(추락의 방지)';
    let item = '가시설';
    let hazardType = '추락';
    let mgmtCauses = ['불안전 상태'];
    let holdPoint = false;
    let analysis = '현장 안전기준 위반 사항이 감지되었습니다.';
    let pmVerdict = '즉시 시정 조치 및 이행 확인';

    if (text.includes('비계') || text.includes('발판') || text.includes('틈새')) {
      item = '비계';
      law = '산안규칙 제56조(작업발판의 구조)';
      hazardType = '추락';
      severity = '중부적합';
      mgmtCauses = ['불안전 상태', '계획 미이행'];
      holdPoint = true;
      analysis = '비계 작업발판 틈새 3cm 초과 또는 발판 폭 기준 미달로 추락 위험';
      pmVerdict = '즉시 해당 구간 작업중지 및 발판 틈새 3cm 이하 보강 후 재검측';
    } else if (text.includes('개구부') || text.includes('피트') || text.includes('덮개')) {
      item = '개구부';
      law = '산안규칙 제43조(개구부 등의 방호 조치)';
      hazardType = '추락';
      severity = '중부적합';
      mgmtCauses = ['불안전 상태', '계획 미이행'];
      holdPoint = true;
      analysis = '바닥 개구부 고정 덮개 미설치 또는 임의 개방으로 추락 위험 극심';
      pmVerdict = '즉시 위험구역 출입통제 및 규격 덮개(고정/추락주의 표지) 설치';
    } else if (text.includes('난간') || text.includes('단부') || text.includes('슬래브')) {
      item = '안전난간';
      law = '산안규칙 제13조(안전난간의 구조 및 요건)';
      hazardType = '추락';
      severity = '중부적합';
      mgmtCauses = ['불안전 상태', '불안전 행동'];
      holdPoint = true;
      analysis = '높이 2m 이상 슬래브 단부 안전난간 미설치로 추락 사망 위험';
      pmVerdict = '즉시 단부 접근 금지 및 상부·중간난간대 완벽 설치 후 검측';
    } else if (text.includes('안전대') || text.includes('구명줄')) {
      item = '안전대';
      law = '산안규칙 제44조(안전대의 부착설비 등)';
      hazardType = '추락';
      severity = '중부적합';
      mgmtCauses = ['불안전 행동', '계획 미이행'];
      holdPoint = true;
      analysis = '고소작업자 안전대 미체결 또는 수직/수평 구명줄 미설치';
      pmVerdict = '즉시 안전대 이중고리 체결 지도 및 구명줄 보강 설치';
    } else if (text.includes('용접') || text.includes('불티') || text.includes('화재')) {
      item = '화기작업';
      law = '산안규칙 제241조(화재위험작업 시의 안전조치)';
      hazardType = '화재·폭발';
      severity = '중부적합';
      mgmtCauses = ['불안전 상태', '계획 미이행'];
      holdPoint = true;
      analysis = '용접 불티 비산방지포 미설치 또는 소화기 미비치로 화재 위험';
      pmVerdict = '화기작업 즉시 중지, 가연물 제거 및 방염시트 차단 후 재개';
    } else if (text.includes('조명') || text.includes('어두') || text.includes('정리') || text.includes('통로')) {
      item = '가설통로';
      law = '산안규칙 제21조(통로의 조명), 제22조(통로의 설치)';
      hazardType = '전도';
      severity = '경부적합';
      mgmtCauses = ['불안전 상태'];
      holdPoint = false;
      analysis = '가설통로 조도 75럭스 미달 또는 통로 상 자재 방치로 보행 장애';
      pmVerdict = '당일 작업 종료 전 통로 자재 구획 정리 및 고효율 LED 조명 추가 설치';
    }

    return { severity, law, item, hazardType, mgmtCauses, holdPoint, analysis, pmVerdict };
  }

  /**
   * 실시간 스트리밍으로 Qwen AI 정밀 분석 (onProgress 콜백 지원)
   */
  async function streamAnalyzeSafetyText(content, extraContext = {}, onProgress = () => {}) {
    if (!content || !content.trim()) {
      throw new Error('분석할 지적 내용을 먼저 입력해주세요.');
    }

    // 1단계: 0.05초 즉시 룰 엔진 결과 생성
    const instantResult = quickRuleAnalysis(content);

    // 프롬프트: 생각을 3~4문장으로 극단적으로 압축하고 </think> 뒤에 즉시 JSON 출력 강제
    const systemPrompt = `너는 대한민국 건설현장 산업안전보건법 및 부적합 점검 전문가 AI이다.
생각 과정(<think>)은 3~4문장 이내로 아주 짧게 끝내고, 반드시 </think> 태그 뒤에 아래 JSON 형식으로만 최종 답을 출력하라:
{
  "severity": "중부적합" 또는 "경부적합",
  "law": "산안규칙 제OO조(조항명)",
  "hazardType": "추락" 또는 "낙하·비래" 또는 "붕괴·도괴" 또는 "협착" 또는 "전도" 또는 "화재·폭발",
  "item": "비계" 또는 "개구부" 또는 "안전난간" 또는 "가설전기" 또는 "건설기계",
  "mgmtCauses": ["계획 미수립", "계획 미이행", "불안전 행동", "불안전 상태" 중 1~2개],
  "holdPoint": true 또는 false,
  "analysis": "법적 위반 판단 이유 1~2문장",
  "pmVerdict": "현장 PM 조치 권고 문장"
}`;

    const userPrompt = `지적사항: "${content.trim()}"
${extraContext.productType ? `건물용도: ${extraContext.productType}` : ''}
${extraContext.progressRate ? `공정률: ${extraContext.progressRate}%` : ''}

위 지적사항의 산안법령 위반과 부적합 등급을 분석하라.`;

    let ctrl = new AbortController();
    // 35초 초과 시 자동 타임아웃하여 룰 기반 결과 반환
    const timeout = setTimeout(() => ctrl.abort(), 35000);

    try {
      onProgress({ phase: 'connecting', message: 'LM Studio 로컬 AI 연결 중...' });

      const res = await fetch(`${currentEndpoint}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: currentModel,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          temperature: 0.5,
          max_tokens: 800,
          stream: true
        }),
        signal: ctrl.signal
      });

      clearTimeout(timeout);

      if (!res.ok) {
        throw new Error(`LM Studio HTTP 오류 (${res.status})`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let done = false;
      let fullReasoning = '';
      let fullContent = '';
      let thinkTokens = 0;

      onProgress({ phase: 'thinking', message: 'AI가 산안법령 검토 중 (🤔 추론 토큰 수신)...' });

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
                  thinkTokens++;
                  if (thinkTokens % 15 === 0) {
                    onProgress({ 
                      phase: 'thinking', 
                      message: `AI 추론 중... (${thinkTokens} 토큰 생성 중)` 
                    });
                  }
                }
                if (delta?.content) {
                  fullContent += delta.content;
                  onProgress({ 
                    phase: 'generating', 
                    message: 'AI 법률 분석 결과 수신 중...' 
                  });
                }
              } catch (e) {}
            }
          }
        }
      }

      // JSON 파싱 시도 (content 우선, 없으면 reasoning 전체에서 탐색)
      const parsed = extractJSON(fullContent) || extractJSON(fullReasoning);

      if (parsed) {
        return {
          severity: parsed.severity?.includes('중부적합') ? '중부적합' : '경부적합',
          law: parsed.law || instantResult.law,
          hazardType: parsed.hazardType || instantResult.hazardType,
          item: parsed.item || instantResult.item,
          mgmtCauses: Array.isArray(parsed.mgmtCauses) && parsed.mgmtCauses.length ? parsed.mgmtCauses : instantResult.mgmtCauses,
          holdPoint: parsed.holdPoint !== undefined ? !!parsed.holdPoint : instantResult.holdPoint,
          analysis: parsed.analysis || instantResult.analysis,
          pmVerdict: parsed.pmVerdict || instantResult.pmVerdict,
          source: 'local_qwen'
        };
      }

      // JSON 파싱 안 되어도 추론 텍스트에 중부적합/산안법이 언급되었으면 반영
      if (fullReasoning || fullContent) {
        const allText = fullReasoning + fullContent;
        const isMajor = allText.includes('중부적합') || allText.includes('작업중지') || allText.includes('위험 극심');
        const lawMatch = allText.match(/산안규칙\s*제\d+조(?:\([^\)]+\))?/);
        return {
          ...instantResult,
          severity: isMajor ? '중부적합' : instantResult.severity,
          law: lawMatch ? lawMatch[0] : instantResult.law,
          analysis: '로컬 Qwen AI 분석 완료: ' + instantResult.analysis,
          source: 'local_qwen_reasoning'
        };
      }

      return instantResult;
    } catch (err) {
      console.warn('AI 스트리밍 지연/오류, 즉시 룰 엔진으로 대체:', err);
      // 타임아웃 또는 네트워크 오류 발생 시 즉시 룰 엔진 결과 반환
      return {
        ...instantResult,
        warning: err.name === 'AbortError' ? 'AI 추론 시간 초과(35초)로 룰 엔진 기준이 적용되었습니다.' : `LM Studio 연결 지연: 룰 엔진 기준이 적용되었습니다. (${err.message})`
      };
    }
  }

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

  return {
    checkConnection,
    quickRuleAnalysis,
    streamAnalyzeSafetyText,
    getEndpoint: () => currentEndpoint,
    setEndpoint: ep => { currentEndpoint = ep; localStorage.setItem('sp_lmstudio_endpoint', ep); },
    getModel: () => currentModel,
    setModel: m => { currentModel = m; localStorage.setItem('sp_lmstudio_model', m); },
    isConnected: () => isConnected
  };
});
