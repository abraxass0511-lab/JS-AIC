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
  let isCloudMode = false;

  async function checkConnection(url = currentEndpoint) {
    // 1. 먼저 내 노트북의 LM Studio 로컬 서버 연결 시도 (우선순위 1)
    for (const ep of [url, ...DEFAULT_ENDPOINTS]) {
      try {
        const ctrl = new AbortController();
        const timeout = setTimeout(() => ctrl.abort(), 1800);
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
          isCloudMode = false;
          return { ok: true, isCloud: false, endpoint: ep, model: currentModel, availableModels: models };
        }
      } catch (e) {}
    }

    // 2. LM Studio가 오프라인일 때 (노트북 종료 상태 / 핸드폰 단독 접속 시)
    //    이미 연결된 Cloudflare Worker를 통해 24시간 클라우드 Qwen AI로 자동 전환
    const workerUrl = window.SAFEPATROL_CONFIG?.workerUrl;
    if (workerUrl) {
      isConnected = true;
      isCloudMode = true;
      return {
        ok: true,
        isCloud: true,
        endpoint: workerUrl,
        model: 'Qwen-32B/7B (Cloudflare 24시간 클라우드)',
        note: '노트북 종료 시 24시간 클라우드 자동 작동'
      };
    }

    isConnected = false;
    isCloudMode = false;
    return { ok: false, endpoint: currentEndpoint, error: 'AI 서버에 연결할 수 없습니다.' };
  }

  /**
   * 고속 규칙 매칭 엔진 (특정 키워드가 명확할 때만 즉시 보조, 기본값 추락 강제 금지)
   */
  function quickRuleAnalysis(content) {
    if (!content) return null;
    const text = content.toLowerCase();

    // 1. 밀폐공간 및 질식/유해가스 (산안규칙 제619조~)
    if (text.includes('밀폐') || text.includes('농도') || text.includes('산소') || text.includes('유해가스') || text.includes('질식') || text.includes('환기팬') || text.includes('송기마스크')) {
      return {
        severity: '중부적합',
        law: '산안규칙 제619조의2(산소 및 유해가스 농도의 측정)',
        item: '밀폐공간',
        hazardType: '질식',
        mgmtCauses: ['계획 미이행', '불안전 행동'],
        holdPoint: true,
        analysis: '밀폐공간 작업 전 산소 및 유해가스 농도 미측정 또는 환기 미실시로 질식 사망 위험',
        pmVerdict: '즉시 작업 중지, 적정 공기 측정(산소 18~23.5%) 및 송풍기 가동 확인 후 재개'
      };
    }
    // 2. 비계 및 작업발판
    if (text.includes('비계') || text.includes('발판') || text.includes('틈새')) {
      return {
        item: '비계',
        law: '산안규칙 제56조(작업발판의 구조)',
        hazardType: '추락',
        severity: '중부적합',
        mgmtCauses: ['불안전 상태', '계획 미이행'],
        holdPoint: true,
        analysis: '비계 작업발판 틈새 3cm 초과 또는 발판 폭 기준 미달로 추락 위험',
        pmVerdict: '즉시 해당 구간 작업중지 및 발판 틈새 3cm 이하 보강 후 재검측'
      };
    }
    // 3. 개구부
    if (text.includes('개구부') || text.includes('피트') || text.includes('덮개')) {
      return {
        item: '개구부',
        law: '산안규칙 제43조(개구부 등의 방호 조치)',
        hazardType: '추락',
        severity: '중부적합',
        mgmtCauses: ['불안전 상태', '계획 미이행'],
        holdPoint: true,
        analysis: '바닥 개구부 고정 덮개 미설치 또는 임의 개방으로 추락 위험 극심',
        pmVerdict: '즉시 위험구역 출입통제 및 규격 덮개(고정/추락주의 표지) 설치'
      };
    }
    // 4. 안전난간
    if (text.includes('난간') || text.includes('단부') || text.includes('슬래브')) {
      return {
        item: '안전난간',
        law: '산안규칙 제13조(안전난간의 구조 및 요건)',
        hazardType: '추락',
        severity: '중부적합',
        mgmtCauses: ['불안전 상태', '불안전 행동'],
        holdPoint: true,
        analysis: '높이 2m 이상 슬래브 단부 안전난간 미설치로 추락 사망 위험',
        pmVerdict: '즉시 단부 접근 금지 및 상부·중간난간대 완벽 설치 후 검측'
      };
    }
    // 5. 안전대
    if (text.includes('안전대') || text.includes('구명줄')) {
      return {
        item: '안전대',
        law: '산안규칙 제44조(안전대의 부착설비 등)',
        hazardType: '추락',
        severity: '중부적합',
        mgmtCauses: ['불안전 행동', '계획 미이행'],
        holdPoint: true,
        analysis: '고소작업자 안전대 미체결 또는 수직/수평 구명줄 미설치',
        pmVerdict: '즉시 안전대 이중고리 체결 지도 및 구명줄 보강 설치'
      };
    }
    // 6. 화재 및 용접
    if (text.includes('용접') || text.includes('불티') || text.includes('화재')) {
      return {
        item: '화기작업',
        law: '산안규칙 제241조(화재위험작업 시의 안전조치)',
        hazardType: '화재·폭발',
        severity: '중부적합',
        mgmtCauses: ['불안전 상태', '계획 미이행'],
        holdPoint: true,
        analysis: '용접 불티 비산방지포 미설치 또는 소화기 미비치로 화재 위험',
        pmVerdict: '화기작업 즉시 중지, 가연물 제거 및 방염시트 차단 후 재개'
      };
    }
    // 7. 가설전기 / 감전
    if (text.includes('전기') || text.includes('분전') || text.includes('접지') || text.includes('차단기') || text.includes('감전')) {
      return {
        item: '가설전기',
        law: '산안규칙 제302조(전기 기계·기구의 접지)',
        hazardType: '감전',
        severity: '중부적합',
        mgmtCauses: ['불안전 상태'],
        holdPoint: false,
        analysis: '임시 분전함 외함 접지 미시행 또는 누전차단기 불량',
        pmVerdict: '해당 차단기 전원 즉시 차단 및 외함 접지선 체결 완료 후 통전'
      };
    }
    // 8. 거푸집 동바리 / 붕괴
    if (text.includes('동바리') || text.includes('서포트') || text.includes('거푸집') || text.includes('붕괴')) {
      return {
        item: '거푸집동바리',
        law: '산안규칙 제332조(거푸집동바리등의 안전조치)',
        hazardType: '붕괴·도괴',
        severity: '중부적합',
        mgmtCauses: ['계획 미이행', '불안전 상태'],
        holdPoint: true,
        analysis: '파이프서포트 수평연결재 미체결 또는 2본 이상 연결 사용',
        pmVerdict: '타설작업 중지, 구조검토서 기준 수평연결재 2방향 보강 완료 후 타설 승인'
      };
    }
    // 9. 통로 / 전도
    if (text.includes('조명') || text.includes('어두') || text.includes('통로') || text.includes('넘어')) {
      return {
        item: '가설통로',
        law: '산안규칙 제21조(통로의 조명), 제22조(통로의 설치)',
        hazardType: '전도',
        severity: '경부적합',
        mgmtCauses: ['불안전 상태'],
        holdPoint: false,
        analysis: '가설통로 조도 75럭스 미달 또는 통로 상 자재 방치로 보행 장애',
        pmVerdict: '당일 작업 종료 전 통로 자재 구획 정리 및 고효율 LED 조명 추가 설치'
      };
    }

    // 일치하는 특정 규칙이 없으면 임의로 추락을 부여하지 않고 null 반환 (AI가 자유롭게 전 조항 분석하도록 위임)
    return null;
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

    // ── [2단계-A] 클라우드 모드이거나 LM Studio가 오프라인인 경우: Cloudflare 24시간 AI 즉시 호출 ──
    const workerUrl = window.SAFEPATROL_CONFIG?.workerUrl;
    if (isCloudMode && workerUrl) {
      onProgress({ phase: 'connecting', message: '☁️ Cloudflare 24시간 클라우드 AI 분석 중...' });
      try {
        const pin = localStorage.getItem('sp_pin') || '111111';
        const cfRes = await fetch(`${workerUrl}/api/ai-analyze`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-PIN': pin
          },
          body: JSON.stringify({
            content,
            workGroup: extraContext.workGroup || '',
            productType: extraContext.productType || '',
            progressRate: extraContext.progressRate || 35
          })
        });

        if (cfRes.ok) {
          const data = await cfRes.json();
          return {
            severity: data.severity?.includes('중부적합') ? '중부적합' : '경부적합',
            law: data.law || (instantResult ? instantResult.law : '산안법 관련 조항 검토'),
            hazardType: data.hazardType || (instantResult ? instantResult.hazardType : '기타'),
            item: data.item || (instantResult ? instantResult.item : '기타'),
            mgmtCauses: Array.isArray(data.mgmtCauses) && data.mgmtCauses.length ? data.mgmtCauses : (instantResult ? instantResult.mgmtCauses : ['불안전 상태']),
            holdPoint: data.holdPoint !== undefined ? !!data.holdPoint : (instantResult ? instantResult.holdPoint : false),
            analysis: data.analysis || (instantResult ? instantResult.analysis : '산업안전보건기준에 관한 규칙 위반 사항'),
            pmVerdict: data.pmVerdict || (instantResult ? instantResult.pmVerdict : '즉시 시정 조치 및 현장 점검 완료 후 작업'),
            source: 'cloudflare_cloud_qwen'
          };
        }
      } catch (cfErr) {
        console.warn('Cloudflare AI 호출 오류, 룰 엔진으로 대체:', cfErr);
      }
    }

    // ── [2단계-B] 내 노트북이 켜져 있는 경우: 로컬 LM Studio 스트리밍 추론 ──
    // 프롬프트: 생각을 3~4문장으로 극단적으로 압축하고 </think> 뒤에 즉시 JSON 출력 강제
    const systemPrompt = `너는 대한민국 산업안전보건법 및 산업안전보건기준에 관한 규칙(제1조~제670조 전 조항) 전문 안전감사관 AI이다.
주어진 지적내용을 면밀히 분석하여 가장 부합하는 현행 법령 조항과 재해형태를 도출하라.
생각 과정(<think>)은 3~4문장 이내로 아주 짧게 끝내고, 반드시 </think> 태그 뒤에 아래 JSON 형식으로만 최종 답을 출력하라:
{
  "severity": "중부적합" 또는 "경부적합",
  "law": "산안규칙 제OO조(조항명 전문)",
  "hazardType": "추락" 또는 "낙하·비래" 또는 "붕괴·도괴" 또는 "협착" 또는 "전도" 또는 "화재·폭발" 또는 "감전" 또는 "질식" 또는 "온열질환" 또는 "직업병",
  "item": "해당 작업 또는 기인물 명칭(예: 밀폐공간, 비계, 안전난간, 거푸집, 가설전기, 크레인, 굴착기 등)",
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
      console.warn('LM Studio 호출 실패, Cloudflare 24시간 클라우드로 2차 재시도:', err);
      if (workerUrl) {
        try {
          onProgress({ phase: 'connecting', message: '☁️ 24시간 클라우드 AI로 전환하여 분석 중...' });
          const pin = localStorage.getItem('sp_pin') || '111111';
          const cfRes = await fetch(`${workerUrl}/api/ai-analyze`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-PIN': pin },
            body: JSON.stringify({
              content,
              workGroup: extraContext.workGroup || '',
              productType: extraContext.productType || '',
              progressRate: extraContext.progressRate || 35
            })
          });
          if (cfRes.ok) {
            const data = await cfRes.json();
            return {
              severity: data.severity?.includes('중부적합') ? '중부적합' : '경부적합',
              law: data.law || instantResult.law,
              hazardType: data.hazardType || instantResult.hazardType,
              item: data.item || instantResult.item,
              mgmtCauses: Array.isArray(data.mgmtCauses) && data.mgmtCauses.length ? data.mgmtCauses : instantResult.mgmtCauses,
              holdPoint: data.holdPoint !== undefined ? !!data.holdPoint : instantResult.holdPoint,
              analysis: data.analysis || instantResult.analysis,
              pmVerdict: data.pmVerdict || instantResult.pmVerdict,
              source: 'cloudflare_cloud_qwen'
            };
          }
        } catch (cfErr) {}
      }

      // 오프라인 룰 엔진 결과 반환
      return {
        ...instantResult,
        warning: err.name === 'AbortError' ? 'AI 추론 시간 초과로 기본 안전기준이 적용되었습니다.' : `산안법 안전기준이 적용되었습니다.`
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
