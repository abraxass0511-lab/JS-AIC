/**
 * SafePatrol - LM Studio 로컬 Qwen AI 연동 클라이언트
 *  - Endpoint: http://localhost:1234/v1 (또는 http://192.168.45.164:1234/v1)
 *  - Model: qwen3.5-9b-deepseek-v4-flash (자동 탐색 지원)
 *  - 산업안전보건법 및 부적합 등급(중부적합/경부적합) 자동 판정
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

  // 법령 및 위험도 사전 지식 (Few-shot 프롬프트 가이드)
  const SAFETY_RULES_GUIDE = `
[산업안전보건법령 핵심 판단 기준]
1. 추락 위험 (높이 2m 이상 개구부, 단부, 비계):
 - 바닥 개구부 덮개 미설치/미고정: 산안규칙 제43조(개구부 등의 방호 조치) 위반 -> 🚨 중부적합 (즉시 작업중지 요건)
 - 슬래브 단부 안전난간 미설치: 산안규칙 제13조(안전난간), 제42조(추락의 방지) 위반 -> 🚨 중부적합
 - 고소작업자 안전대 미체결: 산안규칙 제44조(안전대의 부착설비 등) 위반 -> 🚨 중부적합
 - 비계 작업발판 틈새 3cm 초과 또는 폭 40cm 미만: 산안규칙 제56조(작업발판의 구조) 위반 -> 🚨 중부적합
 - 시스템비계 가새재 누락, 받침철물 고정 불량: 산안규칙 제59조(시스템비계의 구조) 위반 -> 🚨 중부적합
 - 이동식비계 아웃트리거 미설치, 바퀴 스토퍼 미고정: 산안규칙 제68조(이동식비계의 구조) 위반 -> 🚨 중부적합
 - 말비계 미끄럼방지 마모, 벌림방지 미비: 산안규칙 제67조(말비계의 구조) 위반 -> ⚠️ 경부적합
2. 낙하 및 건설기계/양중:
 - 타워크레인 훅 해지장치 파손, 신호수 미배치: 산안규칙 제132조, 제38조 위반 -> 🚨 중부적합 (Hold Point 위반)
 - 굴착기 주용도 외 사용(인양 작업): 산안규칙 제196조 위반 -> 🚨 중부적합
3. 화재 및 전기:
 - 용접 불티 비산방지포 미설치, 가연물 방치: 산안규칙 제241조 위반 -> 🚨 중부적합
 - 이동형 전선 피복 손상, 누전차단기 미접속: 산안규칙 제311조, 제313조 위반 -> ⚠️ 경부적합 또는 🚨 중부적합
4. 통로 및 조명:
 - 가설통로 자재 방치, 조도 75럭스 미달: 산안규칙 제21조, 제22조 위반 -> ⚠️ 경부적합
`;

  async function checkConnection(url = currentEndpoint) {
    for (const ep of [url, ...DEFAULT_ENDPOINTS]) {
      try {
        const ctrl = new AbortController();
        const timeout = setTimeout(() => ctrl.abort(), 2500);
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
    return { ok: false, endpoint: currentEndpoint, error: 'LM Studio 서버에 연결할 수 없습니다. (포트 1234 실행 여부 확인 필요)' };
  }

  /**
   * 현장 지적 내용 텍스트를 Qwen에 분석 요청
   */
  async function analyzeSafetyText(content, extraContext = {}) {
    if (!content || !content.trim()) {
      throw new Error('분석할 지적 내용을 먼저 입력해주세요.');
    }

    const systemPrompt = `너는 대한민국 건설현장 산업안전보건법 및 부적합 점검 최고 전문가 AI이다.
주어진 현장 지적 내용을 분석하여 법적 위반사항과 부적합 등급을 엄격하고 정확하게 판정하라.
반드시 아래 JSON 형식으로만 최종 답변을 출력하라. 생각 과정(Thinking)은 간결히 하고 마지막에 반드시 완전한 JSON만 반환하라.

${SAFETY_RULES_GUIDE}

[출력 JSON 스키마]:
{
  "severity": "중부적합 또는 경부적합",
  "law": "정확한 산안규칙 또는 산안법 조항 번호 및 조항명",
  "hazardType": "추락 또는 낙하·비래 또는 붕괴·도괴 또는 협착 또는 전도 또는 화재·폭발 또는 감전",
  "item": "비계 또는 개구부 또는 안전난간 또는 가설전기 또는 건설기계 또는 거푸집동바리",
  "mgmtCauses": ["계획 미수립", "계획 미이행", "불안전 행동", "불안전 상태" 중 1~2개],
  "holdPoint": true 또는 false,
  "analysis": "구체적인 법적 위반 판단 이유 1~2문장",
  "pmVerdict": "현장 PM/소장 조치 권고 문장 (예: 즉시 작업중지 및 안전난간 원복 후 재검측)"
}`;

    const userPrompt = `[현장 지적 사항]:
${content.trim()}
${extraContext.workGroup ? `\n[공종]: ${extraContext.workGroup}` : ''}
${extraContext.productType ? `\n[시설물 용도]: ${extraContext.productType}` : ''}
${extraContext.progressRate ? `\n[공정률]: ${extraContext.progressRate}%` : ''}

위 지적사항의 산업안전보건법령 위반 여부와 부적합 등급(중부적합/경부적합)을 JSON으로 분석해줘.`;

    const res = await fetch(`${currentEndpoint}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: currentModel,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.1,
        max_tokens: 1200
      })
    });

    if (!res.ok) {
      throw new Error(`LM Studio API 응답 오류 (${res.status}): 모델이 로드되어 있는지 확인하세요.`);
    }

    const data = await res.json();
    const msg = data.choices && data.choices[0] && data.choices[0].message;
    if (!msg) throw new Error('AI 모델로부터 응답을 받지 못했습니다.');

    // content 또는 reasoning_content에서 JSON 추출
    const rawText = msg.content || msg.reasoning_content || '';
    const parsed = extractJSON(rawText);

    if (!parsed) {
      // JSON 파싱 실패 시 기본 안전 매핑 생성
      return fallbackTextAnalysis(rawText, content);
    }

    return {
      severity: parsed.severity?.includes('중부적합') ? '중부적합' : '경부적합',
      law: parsed.law || '산업안전보건기준에 관한 규칙',
      hazardType: parsed.hazardType || '추락',
      item: parsed.item || '가시설',
      mgmtCauses: Array.isArray(parsed.mgmtCauses) ? parsed.mgmtCauses : ['불안전 상태'],
      holdPoint: !!parsed.holdPoint,
      analysis: parsed.analysis || '산안법 위반 사항 확인됨',
      pmVerdict: parsed.pmVerdict || '즉시 시정 조치 및 이행 확인',
      rawAiText: rawText
    };
  }

  function extractJSON(text) {
    if (!text) return null;
    try {
      // 1) ```json ... ``` 블록 탐색
      const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[1]);
      }
      // 2) 가장 바깥쪽 { ... } 탐색
      const firstBrace = text.indexOf('{');
      const lastBrace = text.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        return JSON.parse(text.slice(firstBrace, lastBrace + 1));
      }
    } catch (e) {
      console.warn('Failed to parse AI JSON:', e, text);
    }
    return null;
  }

  function fallbackTextAnalysis(rawText, content) {
    const isMajor = /중부적합|작업중지|심각|사망|추락|붕괴|미설치|개구부/.test(rawText + content);
    return {
      severity: isMajor ? '중부적합' : '경부적합',
      law: rawText.includes('제') ? (rawText.match(/산안규칙\s*제\d+조[^\n,]*/) || ['산업안전보건기준에 관한 규칙 제42조'])[0] : '산안규칙 제42조(추락의 방지)',
      hazardType: '추락',
      item: '안전시설',
      mgmtCauses: ['불안전 상태', '계획 미이행'],
      holdPoint: isMajor,
      analysis: rawText.slice(0, 100) || '현장 안전기준 위반 판정',
      pmVerdict: isMajor ? '🚨 즉시 부분 작업중지 및 안전시설 보강 후 검측' : '당일 시정 조치명령',
      rawAiText: rawText
    };
  }

  return {
    checkConnection,
    analyzeSafetyText,
    getEndpoint: () => currentEndpoint,
    setEndpoint: ep => { currentEndpoint = ep; localStorage.setItem('sp_lmstudio_endpoint', ep); },
    getModel: () => currentModel,
    setModel: m => { currentModel = m; localStorage.setItem('sp_lmstudio_model', m); },
    isConnected: () => isConnected
  };
});
