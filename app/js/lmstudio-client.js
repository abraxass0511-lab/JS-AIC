/**
 * SafePatrol - LM Studio 로컬 Qwen AI 실시간 스트리밍 연동 클라이언트
 *  - Endpoint: http://localhost:1234/v1 (또는 http://192.168.45.164:1234/v1)
 *  - Model: qwen3.5-9b-deepseek-v4-flash (DeepSeek Reasoning 전용 스트리밍 처리)
 *  - 0.05초 즉시 규칙 판정 + 로컬 AI 실시간 스트리밍 보강 아키텍처
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else (root || globalThis).SafeLocalAI = factory();
})(typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : this), function () {

  const DEFAULT_ENDPOINTS = [
    'http://localhost:1234/v1',
    'http://127.0.0.1:1234/v1',
    'http://localhost:11434/v1',
    'http://127.0.0.1:11434/v1',
    'http://192.168.45.164:1234/v1'
  ];

  const storage = typeof localStorage !== 'undefined' ? localStorage : { getItem: () => null, setItem: () => {} };
  const CLOUDFLARE_AI_URL = (typeof window !== 'undefined' ? window.SAFEPATROL_CONFIG?.workerUrl : null) ||
    (typeof globalThis !== 'undefined' ? globalThis.SAFEPATROL_CONFIG?.workerUrl : null) ||
    'https://safepatrol-relay.abraxass0511.workers.dev';
  let currentEndpoint = storage.getItem('sp_lmstudio_endpoint') || DEFAULT_ENDPOINTS[0];
  let currentModel = storage.getItem('sp_lmstudio_model') || 'qwen3.5-9b-deepseek-v4-flash';
  let isConnected = true;
  let isCloudMode = true; // 기본 24시간 Cloudflare 클라우드 Qwen AI 모드

  async function checkConnection(url = currentEndpoint) {
    const workerUrl = (typeof window !== 'undefined' ? window.SAFEPATROL_CONFIG?.workerUrl : null) || (typeof globalThis !== 'undefined' ? globalThis.SAFEPATROL_CONFIG?.workerUrl : null) || 'https://safepatrol-relay.abraxass0511.workers.dev';
    const forceLocal = storage.getItem('sp_ai_provider') === 'local';

    // 1. Cloudflare 24시간 상시 가동 Qwen AI (최우선 연결 - 노트북/서버 오프라인 상관없이 24시간 작동)
    if (!forceLocal && workerUrl) {
      isConnected = true;
      isCloudMode = true;
      return {
        ok: true,
        isCloud: true,
        endpoint: workerUrl,
        model: 'Qwen-32B/7B (Cloudflare 24시간 클라우드)',
        note: 'Cloudflare 글로벌 엣지 24시간 상시 가동 Qwen AI'
      };
    }

    // 2. 사용자가 로컬 AI를 선택했거나 명시적 엔드포인트를 지정한 경우 LM Studio 로컬 서버 연결 시도
    for (const ep of [url, ...DEFAULT_ENDPOINTS]) {
      try {
        const ctrl = new AbortController();
        const timeout = setTimeout(() => ctrl.abort(), 3000);
        const res = await fetch(`${ep}/models`, { signal: ctrl.signal });
        clearTimeout(timeout);
        if (res.ok) {
          const data = await res.json();
          currentEndpoint = ep;
          storage.setItem('sp_lmstudio_endpoint', ep);
          const models = (data.data || []).map(m => m.id);
          if (models.length > 0) {
            const preferred = models.find(m => m === 'qwen3.5-9b-deepseek-v4-flash') ||
                              models.find(m => /qwen/i.test(m)) ||
                              models[0];
            currentModel = preferred;
            storage.setItem('sp_lmstudio_model', currentModel);
          }
          isConnected = true;
          isCloudMode = false;
          return { ok: true, isCloud: false, endpoint: ep, model: currentModel, availableModels: models };
        }
      } catch (e) {}
    }

    if (workerUrl) {
      isConnected = true;
      isCloudMode = true;
      return {
        ok: true,
        isCloud: true,
        endpoint: workerUrl,
        model: 'Qwen-32B/7B (Cloudflare 24시간 클라우드)',
        note: 'Cloudflare 글로벌 엣지 24시간 상시 가동 Qwen AI'
      };
    }

    isConnected = false;
    isCloudMode = false;
    return { ok: false, endpoint: currentEndpoint, error: 'AI 서버에 연결할 수 없습니다.' };
  }

  /**
   * 사진 URL/Blob → Qwen Vision 전송용 압축 JPEG DataURL 변환 헬퍼 (Point #8)
   */
  async function resolvePhotoForVision(photoInput) {
    if (!photoInput) return '';
    try {
      const rawUrl = typeof photoInput === 'string'
        ? photoInput
        : (photoInput.dataUrl || photoInput.previewUrl || photoInput.url || '');
      let blob = (photoInput && typeof photoInput === 'object' && photoInput.blob instanceof Blob) ? photoInput.blob : null;
      if (!blob && rawUrl && (rawUrl.startsWith('blob:') || rawUrl.startsWith('data:image/'))) {
        if (rawUrl.startsWith('data:image/') && rawUrl.length < 320000) return rawUrl;
        const r = await fetch(rawUrl);
        if (r.ok) blob = await r.blob();
      }
      if (!blob) return rawUrl.startsWith('data:image/') ? rawUrl : '';
      if (typeof document !== 'undefined' && typeof createImageBitmap === 'function') {
        const bmp = await createImageBitmap(blob);
        const maxSide = 768;
        const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(bmp.width * scale));
        c.height = Math.max(1, Math.round(bmp.height * scale));
        c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
        bmp.close?.();
        return c.toDataURL('image/jpeg', 0.78);
      }
      return await new Promise((resolve) => {
        const fr = new FileReader();
        fr.onload = () => resolve(String(fr.result || ''));
        fr.onerror = () => resolve('');
        fr.readAsDataURL(blob);
      });
    } catch (_) {
      return '';
    }
  }

  /**
   * 오프라인 비상 백업 (하드코딩 산안법 조문·PM 판정결과 자동 주입 전면 폐지 — Qwen AI가 직접 판단)
   */
  function quickRuleAnalysis(content) {
    if (!content) return null;
    // 관련근거(산안법) 및 PM 판정결과는 절대 하드코딩하지 않고 Qwen AI가 부적합 내용+사진을 분석해 직접 도출
    return null;
  }

  /**
   * [v58] 텍스트만으로 분류·판단하기 어려운 경우에만 자동으로 첨부 사진 Vision AI 활성화
   * - 체크박스 수동 조작 제거: 부적합 내용이 명확하면 Vision 미사용(0 Vision Neuron), 모호·초단문이면 자동 Vision 실행
   */
  function shouldAutoUseVision(content = '', photos = []) {
    const validPhotos = Array.isArray(photos) ? photos.filter(Boolean) : [];
    if (!validPhotos.length) return false;
    const t = String(content || '').replace(/[\r\n\s]+/g, ' ').trim();
    if (!t || t.length < 14) return true;
    // '불안전 행동', '불안전 상태', '안전미준수', '사진 참조', '현장 불량'처럼 대상·상황이 빠진 모호한 문구
    if (/^(?:\d+[\.)]?\s*)?(?:불안전\s*(?:행동|상태)|계획\s*미(?:수립|이행)|안전\s*(?:미준수|불량|수칙\s*위반)|작업\s*불량|관리\s*(?:미흡|불량)|사진\s*(?:참조|확인)|현장\s*불량|점검\s*불량|기타)$/.test(t)) {
      return true;
    }
    // 구체적 시설/장비/공도구/작업 대상 단어가 전혀 없으면 사진 판독이 필요함
    const hasConcreteSubject = /비계|발판|난간|개구부|덮개|동바리|거푸집|유로폼|알폼|갱폼|서포트|철근|철골|데크|PC|크레인|타워크레인|양중|줄걸이|슬링|샤클|지게차|굴착기|펌프카|고소작업대|리프트|곤돌라|사다리|말비계|분전반|분전함|전선|접지|차단기|충전부|전등|소켓|용접|화기|소화기|불티|그라인더|절단기|타카|안전대|안전모|생명줄|안전고리|흙막이|터파기|굴착|보\s*설치|슬래브|단부|계단|야적|적재/i.test(t);
    if (!hasConcreteSubject && t.length < 28) return true;
    return false;
  }

  /**
   * 실시간 AI 정밀 분석 (부적합 내용 + [필요 시 자동 Vision] + 학습된 안전작업지침 적합성 검증 + 표준분류 4종 통합 판정)
   */
  async function streamAnalyzeSafetyText(content, extraContext = {}, onProgress = () => {}) {
    if (!content || !content.trim()) {
      throw new Error('분석할 지적 내용을 먼저 입력해주세요.');
    }

    const photos = Array.isArray(extraContext.photos) ? extraContext.photos.filter(Boolean) : [];
    const useVision = typeof extraContext.useVision === 'boolean'
      ? extraContext.useVision
      : shouldAutoUseVision(content, photos);
    let imageBase64 = '';
    if (useVision && photos.length > 0) {
      imageBase64 = await resolvePhotoForVision(photos[0]);
    }

    // [Point #6] 학습된 안전작업지침(SafeGuidelineMemory) 후보를 AI에게 전달하여 부적합내용+사진과의 적합성을 직접 판정받음
    const mem = getGuidelineMemory();
    const learnedGuidelines = (mem && typeof mem.findCandidates === 'function')
      ? mem.findCandidates({
          content,
          workGroup: extraContext.workGroup || '',
          type: extraContext.type || '',
          limit: 3
        }).map(c => ({ code: c.code, title: c.title, body: c.body, domain: c.domain }))
      : [];

    // ── [1단계-A] 클라우드 모드: Cloudflare 24시간 LLM (+ 모호 시 자동 Vision) 통합 분석 ──
    const workerUrl = (typeof window !== 'undefined' ? window.SAFEPATROL_CONFIG?.workerUrl : null) || CLOUDFLARE_AI_URL;
    if (isCloudMode && workerUrl) {
      onProgress({ phase: 'connecting', message: imageBase64 ? '☁️ 텍스트가 모호하여 Vision + Cloud AI가 사진·산안법·학습지침을 자동 판독 중...' : '☁️ Cloud AI가 부적합 내용·산안법·표준분류를 분석 중...' });
      try {
        const pin = storage.getItem('sp_pin') || '111111';
        const cfRes = await fetch(`${workerUrl}/api/ai-analyze`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-PIN': pin
          },
          body: JSON.stringify({
            mode: 'manual_analyze',
            content,
            imageBase64: imageBase64 || undefined,
            useVision: Boolean(imageBase64),
            workGroup: extraContext.workGroup || '',
            location: extraContext.location || '',
            productType: extraContext.productType || '',
            progressRate: extraContext.progressRate || 35,
            learnedGuidelines: learnedGuidelines.length ? learnedGuidelines : undefined
          })
        });

        if (cfRes.ok) {
          const data = await cfRes.json();
          const isRealAi = Boolean(data.source && !String(data.source).includes('rule_engine'));
          const lawTitle = isRealAi ? String(data.law || '').trim() : '';
          const norm = getNormHelper();
          let lawBody = isRealAi ? String(data.lawBody || data.cleanedFields?.lawBody || '').trim() : '';
          if (lawBody && norm && typeof norm.stripGuidelinePrefixes === 'function') {
            lawBody = norm.stripGuidelinePrefixes(lawBody);
          }
          const resolvedWg = data.workGroup ? cleanWorkGroup(data.workGroup, content) : '';
          const resolvedWgMid = (norm && norm.resolveWorkGroupMid)
            ? norm.resolveWorkGroupMid(resolvedWg, data.workGroupMid || '', content)
            : (data.workGroupMid || '');
          const resolvedLocCat = (norm && norm.inferLocationCategory)
            ? norm.inferLocationCategory(data.locationCategory || '', extraContext.location || '', content)
            : (data.locationCategory || '');
          const resolvedWm = sanitizeWorkMethod(data.workMethod || '', resolvedWg, content, extraContext.location || '');
          return {
            severity: data.severity?.includes('중부적합') ? '중부적합' : '경부적합',
            law: lawTitle,
            lawBody,
            usedVision: Boolean(imageBase64),
            model: data.model || '',
            guidelineApplied: Boolean(data.guidelineApplied),
            guidelineReason: String(data.guidelineReason || '').trim(),
            hazardType: data.hazardType || data.type || '',
            locationCategory: resolvedLocCat,
            workGroupMid: resolvedWgMid,
            workGroup: resolvedWg,
            workMethod: resolvedWm,
            agentMajor: data.agentMajor || '',
            agentMid: data.agentMid || '',
            agentMinor: data.agentMinor || '',
            condition: data.condition || '',
            action: data.action || '',
            rootCauseMgmt: data.rootCauseMgmt || '',
            rootCauseSystem: data.rootCauseSystem || '',
            item: data.item || data.agentMid || '',
            mgmtCauses: Array.isArray(data.mgmtCauses) && data.mgmtCauses.length ? data.mgmtCauses : [],
            holdPoint: Boolean(data.holdPoint),
            analysis: data.analysis || (lawBody ? lawBody : 'Qwen AI 산업안전보건기준에 관한 규칙 분석 완료'),
            pmVerdict: '',
            photoBanner: data.photoBanner || '',
            photo2Banner: data.photo2Banner || '',
            source: data.source || 'cloudflare_cloud_qwen'
          };
        }
      } catch (cfErr) {
        console.warn('Cloudflare AI 호출 오류, 로컬 LM Studio 시도:', cfErr);
      }
    }

    // ── [1단계-B] 로컬 LM Studio 스트리밍 추론 (사진 Vision + 부적합 내용 + 학습지침 적합성 통합 분석) ──
    const guidelineBlock = learnedGuidelines.length
      ? `\n[학습된 안전작업지침 후보 목록 (부적합 내용·사진과 100% 적합한 경우에만 채택, 조금이라도 맞지 않으면 반드시 기각하고 산안규칙 조문을 직접 작성)]\n${JSON.stringify(learnedGuidelines)}\n`
      : '';
    const systemPrompt = `너는 대한민국 건설현장 최고 안전감사관이자 고용노동부 산업안전보건기준에 관한 규칙(제1조~제670조 전 조항) 및 건설안전 9×9 표준분류 전문 AI이다.
주어진 현장 부적합 지적사항과 첨부된 사진을 정밀 분석하여 아래를 도출하라:
1. 관련 근거(law, lawBody): 학습된 안전작업지침 후보가 있으면 부적합 내용·사진과 정확히 부합하는지 검토해 적합 시 해당 지침을 채택(guidelineApplied: true)하고, 적합하지 않거나 후보가 없으면 '산업안전보건기준에 관한 규칙 제OO조(조항명)'과 핵심 기준 1~2문장(guidelineApplied: false)을 직접 도출하라.
2. 장소 분류(locationCategory): ["건축물","본구조물","가설물","기계·기구","설비·장치","적재물","옥상·지붕","계단·복도","엘리베이터홀","천장 내부","탱크 내부","실내 작업장","지하실","실외 작업장","외부","도로","야적장","수상","수중","공중"] 중 1개 선택.
3. 공종(중)(workGroupMid): ["공통공사","건축공사","전기공사","설비공사","플랜트공사","토목공사","조경공사","기타"] 중 1개, 공종(소)(workGroup): 작업분류표 공식 세부공종 1개.
4. 작업방법(workMethod): ["굴착작업","하역운반작업","양중작업","중량물취급작업","설치해체작업","가공조립작업","운전조정작업","고소작업","기타"] 중 1개.
5. 기인물 대/중/소(agentMajor/agentMid/agentMinor): 건설안전 9×9 개선(1)(2) 기준(가시설, 건설장비, 작업공도구, 작업발판, 작업장소(환경), 전기시설, 소방시설, 개인보호구)으로 선택 (예: 건설장비 > 굴착장비 > 굴착기, 건설장비 > 하역운반장비 > 지게차).
6. photoBanner: 구체적 위반 사실 12~22자 명사구.
${guidelineBlock}
반드시 아래 JSON 형식으로만 답을 출력하라:
{
  "severity": "중부적합" 또는 "경부적합",
  "law": "적합한 학습 지침 제목 또는 산업안전보건기준에 관한 규칙 제OO조(조항명)",
  "lawBody": "핵심 안전기준 1~2문장 ('~다.' 종결)",
  "guidelineApplied": true 또는 false,
  "guidelineReason": "학습 지침 채택/기각 판단 이유 한 줄",
  "locationCategory": "장소 분류 20종 중 1개",
  "workGroupMid": "공종(중) 8종 중 1개",
  "workGroup": "공종(소) 공식 명칭",
  "workMethod": "작업방법 9종 중 1개",
  "agentMajor": "기인물 대분류",
  "agentMid": "기인물 중분류",
  "agentMinor": "기인물 소분류",
  "hazardType": "추락/낙하/비래/붕괴/도괴/전복/전도/협착/충돌/화재/폭발/감전/질식 등",
  "item": "기인물 중분류 또는 명칭",
  "photoBanner": "사진 1 상단 배너용 12~22자 구체적 위반 문구",
  "photo2Banner": "사진 2 상단 배너용 문구 (단일 지적이면 '')",
  "mgmtCauses": ["계획 미수립", "계획 미이행", "불안전 행동", "불안전 상태" 중 1~2개],
  "holdPoint": true 또는 false,
  "analysis": "법적 위반 판단 이유 1~2문장"
}`;

    const userPrompt = `지적사항: "${content.trim()}"
${extraContext.workGroup ? `공종명: ${extraContext.workGroup}` : ''}
${extraContext.location ? `작업장소: ${extraContext.location}` : ''}
${extraContext.productType ? `건물용도: ${extraContext.productType}` : ''}
${extraContext.progressRate ? `공정률: ${extraContext.progressRate}%` : ''}

위 지적사항과 첨부 사진을 종합 분석하여 표준분류(장소분류·공종중/소·작업방법·기인물대/중/소), 학습지침 적합 여부 및 정확한 관련근거(law, lawBody)를 JSON으로 도출하라.`;

    let messages = [
      { role: 'system', content: systemPrompt }
    ];

    if (imageBase64) {
      messages.push({
        role: 'user',
        content: [
          { type: 'text', text: userPrompt },
          { type: 'image_url', image_url: { url: imageBase64 } }
        ]
      });
    } else {
      messages.push({ role: 'user', content: userPrompt });
    }

    let ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), 35000);

    try {
      onProgress({ phase: 'connecting', message: 'LM Studio 로컬 Qwen AI 연결 중...' });

      let res;
      try {
        res = await fetch(`${currentEndpoint}/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: currentModel,
            messages,
            temperature: 0.2,
            max_tokens: 800,
            stream: true
          }),
          signal: ctrl.signal
        });
      } catch (postErr) {
        if (imageBase64) {
          res = await fetch(`${currentEndpoint}/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: currentModel,
              messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt }
              ],
              temperature: 0.2,
              max_tokens: 800,
              stream: true
            }),
            signal: ctrl.signal
          });
        } else {
          throw postErr;
        }
      }

      clearTimeout(timeout);
      if (!res.ok) throw new Error(`LM Studio HTTP 오류 (${res.status})`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let done = false;
      let fullReasoning = '';
      let fullContent = '';
      let thinkTokens = 0;

      onProgress({ phase: 'thinking', message: 'Qwen AI가 사진과 산안법 정밀 분석 중...' });

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
                    onProgress({ phase: 'thinking', message: `Qwen AI 추론 중... (${thinkTokens} 토큰)` });
                  }
                }
                if (delta?.content) {
                  fullContent += delta.content;
                  onProgress({ phase: 'generating', message: 'Qwen AI 산안법 및 사진 분석 결과 수신 중...' });
                }
              } catch (e) {}
            }
          }
        }
      }

      const parsed = extractJSON(fullContent) || extractJSON(fullReasoning);
      if (parsed) {
        return {
          severity: parsed.severity?.includes('중부적합') ? '중부적합' : '경부적합',
          law: parsed.law || '',
          lawBody: parsed.lawBody || '',
          hazardType: parsed.hazardType || '',
          item: parsed.item || '',
          mgmtCauses: Array.isArray(parsed.mgmtCauses) && parsed.mgmtCauses.length ? parsed.mgmtCauses : [],
          holdPoint: Boolean(parsed.holdPoint),
          analysis: parsed.analysis || '',
          pmVerdict: '',
          photoBanner: parsed.photoBanner || '',
          photo2Banner: parsed.photo2Banner || '',
          source: 'local_qwen'
        };
      }

      if (fullReasoning || fullContent) {
        const allText = fullReasoning + fullContent;
        const isMajor = allText.includes('중부적합') || allText.includes('작업중지');
        const lawMatch = allText.match(/(?:산업)?안전보건(?:기준에\s*관한\s*)?규칙\s*제\d+조(?:의\d+)?(?:\([^\)]+\))?/);
        return {
          severity: isMajor ? '중부적합' : '경부적합',
          law: lawMatch ? lawMatch[0] : '',
          lawBody: '',
          hazardType: '',
          item: '',
          mgmtCauses: [],
          holdPoint: false,
          analysis: '로컬 Qwen AI 분석 완료',
          pmVerdict: '',
          photoBanner: '',
          photo2Banner: '',
          source: 'local_qwen_reasoning'
        };
      }

      throw new Error('Qwen AI 응답을 파싱할 수 없습니다.');
    } catch (err) {
      console.warn('로컬 Qwen AI 호출 실패, Cloudflare 클라우드 재시도:', err);
      if (workerUrl) {
        try {
          onProgress({ phase: 'connecting', message: '☁️ Cloudflare Qwen AI로 전환하여 분석 중...' });
          const pin = storage.getItem('sp_pin') || '111111';
          const cfRes = await fetch(`${workerUrl}/api/ai-analyze`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-PIN': pin },
            body: JSON.stringify({
              mode: 'manual_analyze',
              content,
              imageBase64: imageBase64 || undefined,
              workGroup: extraContext.workGroup || '',
              location: extraContext.location || '',
              productType: extraContext.productType || '',
              progressRate: extraContext.progressRate || 35
            })
          });
          if (cfRes.ok) {
            const data = await cfRes.json();
            const isRealAi = Boolean(data.source && !String(data.source).includes('rule_engine'));
            return {
              severity: data.severity?.includes('중부적합') ? '중부적합' : '경부적합',
              law: isRealAi ? String(data.law || '').trim() : '',
              lawBody: isRealAi ? String(data.lawBody || data.cleanedFields?.lawBody || '').trim() : '',
              hazardType: data.hazardType || data.type || '',
              item: data.item || '',
              mgmtCauses: Array.isArray(data.mgmtCauses) ? data.mgmtCauses : [],
              holdPoint: Boolean(data.holdPoint),
              analysis: data.analysis || '',
              pmVerdict: '',
              photoBanner: data.photoBanner || '',
              photo2Banner: data.photo2Banner || '',
              source: data.source || 'cloudflare_cloud_qwen'
            };
          }
        } catch (cfErr) {}
      }
      throw new Error('Qwen AI 서버에 연결할 수 없습니다. 네트워크 또는 LM Studio 연결을 확인해주세요.');
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

  // ── 정밀 OCR 텍스트 정제 및 노이즈 제거 헬퍼 함수군 ──
  function cleanSubcontractor(sub) {
    if (!sub) return '';
    const cleaned = String(sub)
      .replace(/^(?:협력사|공종명?)\s*[:;：]?\s*/i, '')
      .replace(/[^가-힣a-zA-Z0-9()주\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!cleaned || cleaned.length < 2) return '';
    if (/(?:공사|비계|거푸집|동바리|철근|콘크리트|양중|토공|작업|점검|장소|차수|비어|없음|미정|해당없음|원영건업|HEY|HA\b|HE\b|BEE)/i.test(cleaned)) {
      return '';
    }
    return cleaned;
  }

  function healSafetyKoreanLexicon(str) {
    if (!str) return '';
    return String(str)
      // 0. Gang Form / 갱폼 및 선해체방지커버
      .replace(/Gang\s*Form/gi, 'Gang Form')
      .replace(/GangForm/gi, 'Gang Form')
      .replace(/AL\s*Form/gi, 'AL Form')
      .replace(/선해[세체]\s*방지\s*커버|선해세방지커버/g, '선해체방지커버')
      .replace(/선해[세체]방지/g, '선해체방지')
      .replace(/선해[세체]\s*방지/g, '선해체 방지')
      // 1. ㅠ AF AYA 등 OCR 영문 노이즈 -> 인양 시 간섭사항 미고려
      .replace(/ㅠ\s*AF\s*AYA\s*(?:간섭\s*사항\s*미고려)?/g, '인양 시 간섭사항 미고려')
      .replace(/ㅠ\s*AF\s*AYA/g, '인양 시')
      // 2. 밑둥잡이 복원
      .replace(/(?:드\s*)?[브부]\s*[느비]\s*밑[둥등]잡이|(?:드\s*)?[브부]\s*[느비]\s*밀등잡이/g, '외부비계 밑둥잡이')
      .replace(/(?:드\s*)?[브부]\s*[느비]\b/g, '외부비계')
      .replace(/드\s*브\s*느/g, '외부비계')
      .replace(/밀등잡이|밑등잡이/g, '밑둥잡이')
      // 3. ee — 등 말단 영문 노이즈 제거
      .replace(/[=—\-_\s]+ee[\s—\-_]*$/gi, '')
      .replace(/\s+ee\s*—\s*$/g, '')
      // 4. 말줄임표 동바... 복원
      .replace(/동바\.\.\./g, '동바리')
      // 5. 반영 i) -> 반영
      .replace(/반영\s*[iI!ㅣ1]\)?/g, '반영')
      // 6. 당사 유관부서 / 기술혁신그룹 등
      .replace(/LEA\s*유관부서/gi, '당사 유관부서')
      .replace(/\(\s*기술혁신그룹\s*[\$%％5등\s]*\)/g, '(기술혁신그룹 등)')
      .replace(/기술혁신그룹\s*[\$%％5]+(?:\s*\)|\b)?/g, '기술혁신그룹 등')
      .replace(/기술혁신그룹\s*등(?:\s*등)+/g, '기술혁신그룹 등')
      // 7. 타설 힐 동바리 -> 타설 전 동바리
      .replace(/타설\s*힐\s*동바리/g, '타설 시 동바리')
      .replace(/타설\s*힐/g, '타설 시')
      .replace(/미복구\s*힌\s*걸\s*로\s*추정\s*함/g, '미복구한 것으로 추정함')
      .replace(/힌\s*걸\s*로/g, '한 것으로')
      // 8. 위험성평가 전 변종 복원 (위험성평ㅇ, 위험성평기, 위혐성평가, 위험성평 등)
      .replace(/위[험험협형횸][성승송]?\s*평[가기ㅇ아어0-9]?/g, '위험성평가')
      .replace(/위험성\s*평[가기ㅇ아어0-9]?/g, '위험성평가')
      .replace(/위[험험협형횸]성평\b/g, '위험성평가')
      .replace(/위험성\s*(?=재수립|검토|수립|교육)/g, '위험성평가 ')
      .replace(/위[험협]성\s*평가/g, '위험성평가')
      // 9. 모니터링 / 내실화 / 형식적인 점검 / SNS내 등록
      .replace(/현장\s*모\s*니터링/g, '현장 모니터링')
      .replace(/모니터링\s*활\s*동\s*강화/g, '모니터링 활동 강화')
      .replace(/내실화\s*[&xX×쪽종등5]\s*점검\s*강\s*화\s*필요/g, '내실화 등 점검 강화 필요')
      .replace(/내실화\s*&\s*점검/g, '내실화 등 점검')
      .replace(/점검\s*강\s*화\s*필요/g, '점검 강화 필요')
      .replace(/혐식적[인으로]?/g, '형식적인')
      .replace(/(?:5045|5145|SNS)\s*[내U]\s*등록/gi, 'SNS내 등록')
      .replace(/SNSU|5145내|5045내|SNS\s*U\b/gi, 'SNS내')
      .replace(/시스템\s*구죽/g, '시스템 구축')
      // 10. 치수 및 단위 (5560ㅁ7 -> 55cm, 30000 -> 30cm)
      .replace(/30000\s*이하|3000\)?\s*이하|3060\s*이하|30cm이하/g, '30cm 이하')
      .replace(/\(30000\)|\(3000\)/g, '(30cm)')
      .replace(/\(55(?:00|60|em|cm)?[^)]*\)/gi, '(55cm)')
      .replace(/5560[ㅁ口0-9]*|5500\b|55em\b/gi, '55cm')
      // 11. 낙하물방지망 / 버팀대 / 동일선상
      .replace(/낙하물방\s*지망/g, '낙하물방지망')
      .replace(/2단\s*HED\]?/gi, '2단 버팀대')
      .replace(/HE\s*위치가/g, '버팀대 위치가')
      .replace(/충렬선상\s*미실지\s*[중등25]?\s*\)?/g, '동일선상 미설치 등)')
      .replace(/동일선상\s*미설치\s*[25중등]?\s*\)?/g, '동일선상 미설치 등)')
      .replace(/미설치\s*[25중등]\s*\)?/g, '미설치 등)')
      .replace(/HEL\s*설치\s*불량/g, '버팀대 설치 불량')
      // 12. Tesseract OCR ㅠ 불릿 기호 및 줄바꿈 복원
      .replace(/(?:^|\r?\n)\s*ㅠ\s*/g, '\n- ')
      .replace(/(?<=\S)\s+ㅠ\s+(?=[가-힣a-zA-Z0-9])/g, '\n- ')
      // 13. 치수 및 단위 정밀 정규화 (6007이하 -> 60cm 이하, 600ㅁ로 -> 60cm로; 단 1501호 등 4자리 호수 보호!)
      .replace(/6007\s*이하|600ㅁ\s*이하/g, '60cm 이하')
      .replace(/600[ㅁm7]\s*로/g, '60cm로')
      .replace(/600[ㅁm7]\b/g, '60cm')
      .replace(/(?<!\d)(\d{2})0[ㅁ口]\s*(?=이하|이상|이내|간격|로|에|\s|$)/g, '$1cm ')
      .replace(/(?<!\d)([3-9]0)07\s*(?=이하|이상|이내|간격)/g, '$1cm ')
      .replace(/(\d{2})cm\s*호(?=\s|$|[^가-힣])/gi, '$101호')
      // 14. 갱폼/안전시설 부속 및 용어 정밀 복원
      .replace(/고정시아(?:는)?/g, '고정샤클은')
      .replace(/고정시아/g, '고정샤클')
      .replace(/고정샤클은\s*cm\s*이하로/g, '고정샤클은 40cm 이하로')
      .replace(/상하작동\s*(?:bh\s*)?가이드\s*철물\s*폭\s*에\s*ZH\s*상태/g, '상하작동 가이드 철물 간섭 상태')
      .replace(/6\/『\s*최상부|6\/\s*최상부|6\/『|6\//g, 'E/V')
      .replace(/AF\s*SEL/g, '선해체방지커버')
      .replace(/설치상소/g, '설치장소')
      .replace(/노단색\s*Mos|노란색\s*Mos|노단색/g, '노란색 마킹')
      .replace(/재교\s*육/g, '재교육')
      .replace(/선\s*해체\s*방지/g, '선해체 방지')
      .replace(/쓴아짐/g, '쏟아짐')
      .replace(/상태양중/g, '상태 양중')
      .replace(/(^|[\s(/·\-])미\s+(사용|설치|착용|체결|고박|준수|실시|비치|확보|연결|복구|작성|기재|조치|수립|이행|작동|구축|부착|시행|정비|수행|지정|배치|확인|점검|통제|결속|고정|유지|반영|이수|보수|차단|방호)(?=\s|$|[.,;:)/·\-])/g, '$1미$2');
  }

  function cleanLocation(rawLoc, contentText = '') {
    let s = String(rawLoc || '').trim();
    if (!s && '') s = String('').trim();

    // 1. contentText 문맥 우선 탐색
    if (!s && contentText) {
      const mDong = String(contentText).match(/(\d{1,4}\s*동[^\n,.()]{0,30}|지하\s*\d+\s*층[^\n,.()]{0,20}|상가동[^\n,.()]{0,20})/);
      if (mDong) s = mDong[1];
    }
    if (!s && contentText) {
      if (/계단구간|슬래브가\s*없는\s*계단|E\/V\s*최상부|6\/\s*최상부/i.test(contentText)) s = '계단구간 E/V 최상부';
      else if (/갱폼|gang\s*form|선해체/i.test(contentText)) s = '101동 외부 (갱폼)';
      else if (/비계|워킹타워/i.test(contentText)) s = '외부비계';
      else if (/지하\s*\d+\s*층/i.test(contentText)) s = '지하층';
    }
    if (!s) return '';

    // 2. 약어(E/V, L/C, T/C, G/F) 보호 및 OCR 오타(외무->외부, 수면->후면, /C->L/C, 15cm 호->1501호) 정밀 복원
    s = s
      .replace(/E\/V|6\/『|6\//gi, '@@EV@@')
      .replace(/\bL\s*\/\s*C\b/gi, '@@LC@@')
      .replace(/\bT\s*\/\s*C\b/gi, '@@TC@@')
      .replace(/\bG\s*\/\s*F\b/gi, '@@GF@@')
      .replace(/(?:^|\s)\/\s*C(?=\s*\d|\s*호기|\b)/gi, ' @@LC@@')
      .replace(/(\d{2})cm\s*호(?=\s|$|[^가-힣])/gi, '$101호')
      .replace(/(?<=동\s*)외무(?=\s|$|\(|\/)/g, '외부')
      .replace(/(?<=동\s*)수면(?=\s|$|\(|\/)/g, '후면')
      .replace(/^(?:작업\s*장소|작[업엄]장소|장\s*소)\s*[:;：.]?\s*/i, '')
      .replace(/\[\s*ERE\b[^\]\n]*\]?/gi, '')
      .replace(/\b(?:EERE|ERE|EEE|ee|ere|MAK|261k|SEAT|CERNE|EEL|드로|리로)\b(?:\s*[:;=]?\s*[a-zA-Z0-9]+)*/gi, ' ')
      .replace(/(?:[점섬정겸]검\s*[자차]?|[점섬정겸]검차수|[집점]십[사차]수|\b차수\b|\b\d+\s*차\b)[\s\S]*$/i, '')
      .replace(/\b[a-z]\b/g, ' ')
      .replace(/[\[\]{}()_ㅣ¦!~—:;]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/@@EV@@/g, 'E/V')
      .replace(/@@LC@@/g, 'L/C')
      .replace(/@@TC@@/g, 'T/C')
      .replace(/@@GF@@/g, 'G/F')
      .replace(/(L\/C|T\/C)\s*(\d)/g, '$1 $2');

    // 3. 1075 35 1코어 등 숫자 오인식 치유
    s = s.replace(/\b1?(10[1-9]|1[1-9]\d)[358등]\s+([1-9]|1\d|2\d|3\d)[358측증]\s*(?=\d+\s*코어|코어)/g, '$1동 $2층 ');
    s = s.replace(/(\d{1,4}\s*동)\s*(\d{1,2})\s+(?=\d+\s*코어)/g, '$1 $2층 ');
    s = s.replace(/\b(\d{1,2})[358측증]\b(?=\s*(?:\d+\s*코어|코어|PIT|피트))/g, '$1층');

    if (/^(?:1?(?:10[1-9]|1[1-9]\d)[385]?|\d{3,5})$/.test(s)) {
      const mMatch = s.match(/1?(10[1-9]|1[1-9]\d)[385]?/);
      if (mMatch && mMatch[1]) return `${mMatch[1]}동`;
    }
    s = s.replace(/\b1?(10[1-9]|1[1-9]\d)[385등]\b(?!\s*동)/g, '$1동');

    if (/(?:L\/C|T\/C|E\/V|G\/F|\d+\s*호기|\d{3,4}\s*호)/.test(s)) {
      return s.replace(/\s+/g, ' ').trim();
    }

    const mSecond = s.match(/(?:\d{1,4}\s*동|상가동|주차장동|본동|복리시설동)?(?:\s*(?:지[상하]\s*\d+\s*층|\d+\s*층|\d+\s*코어|코어|PIT|피트|옥상|지붕|단부|계단실|EV홀|E\/V\s*최상부|E\/V|L\/C|T\/C|G\/F|\d+(?:,\d+)*\s*호기|\d{2,4}\s*호|복도|주차장|상가동|후면|전면|측면|외부|내부|동측|서측|남측|북측|외부비계|워킹타워|\d+구간|\w+구간|외벽|내벽|슬래브|바닥|천장))+/i);
    if (mSecond && mSecond[0] && mSecond[0].trim().length >= 2) {
      return mSecond[0].replace(/\s+/g, ' ').trim();
    }

    return s || '';
  }

  function summarizeContentToBanner(content) {
    if (typeof window !== 'undefined' && window.SafeTextNormalizer?.extractCoreViolationBanner) {
      return window.SafeTextNormalizer.extractCoreViolationBanner('', content);
    }
    const c = healSafetyKoreanLexicon(String(content || '').replace(/^부적합\s*(?:내용|사항)\s*[:;：]?\s*/, '').trim());
    if (!c) return '';
    if (c.includes('지게차') && c.includes('근접')) return '유도원·근로자 지게차 근접 작업';
    if (c.includes('접지선') && /고정\s*불량/.test(c) && /용량\s*부족/.test(c)) return '접지선 볼트 고정 불량 및 용량 부족';
    if (c.includes('충전부') && c.includes('노출')) return '분전함 차단기 충전부 노출';
    return c.split('\n')[0].replace(/^(?:[①②③④⑤⑥⑦⑧⑨⑩]|\(?\d{1,2}\)?[.)]|[-•·ㆍ.,:;\s])+/g, '').trim();
  }

  function cleanBannerText(rawBanner, content, location = '') {
    if (typeof window !== 'undefined' && window.SafeTextNormalizer?.resolveUnifiedPhotoBanner) {
      const unified = window.SafeTextNormalizer.resolveUnifiedPhotoBanner({
        photoBanner: rawBanner,
        content,
        location
      });
      if (unified) return unified;
    }
    if (typeof window !== 'undefined' && window.SafeTextNormalizer?.extractCoreViolationBanner) {
      let b = String(rawBanner || '').replace(/[\u2460-\u2487\u2776-\u277F]/g, ' ').trim();
      b = healSafetyKoreanLexicon(b)
        .replace(/^[123458\s()\[\].\-_]+(?=[가-힣A-Za-z])/, '')
        .replace(/벽의음/g, '벽이음')
        .replace(/6055/g, '60도↓')
        .replace(/6\/『|6\//g, 'E/V')
        .replace(/\(\s*불량/g, '불량')
        .replace(/[^\w가-힣ㄱ-ㅎㅏ-ㅣ\s/()\-↓↑.,]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      const isLocOnly = typeof window !== 'undefined' && window.SafeTextNormalizer?.isLocationOnlyBanner?.(b, location);
      const isTechnicalForm = /Gang\s*Form|AL\s*Form|갱폼/i.test(b);
      const hasDigitHangulCorruption = /\d[가-힣]|[가-힣]\d(?!\s*(?:도|단|호|개|개소|층|동|차|m|cm|mm|%|명))/i.test(b);
      const hangulCount = (b.match(/[가-힣]/g) || []).length;
      const normContent = String(content || '').replace(/^부적합\s*(?:내용|사항)\s*[:;：]?\s*/, '').replace(/\s+/g, ' ').trim();
      if (!b || isLocOnly || b.replace(/\s+/g, '') === normContent.replace(/\s+/g, '') || hasDigitHangulCorruption || (!isTechnicalForm && hangulCount < 4) || b.length < 5 || (hangulCount / b.length < 0.4 && !isTechnicalForm)) {
        return window.SafeTextNormalizer.extractCoreViolationBanner('', content, location);
      }
      return window.SafeTextNormalizer.extractCoreViolationBanner(b, content, location);
    }
    return summarizeContentToBanner(content || rawBanner);
  }

  function cleanWorkGroup(wg, content) {
    if (typeof window !== 'undefined' && window.SafeTextNormalizer?.mapToStandardWorkGroup) {
      return window.SafeTextNormalizer.mapToStandardWorkGroup(wg, content) || '건축공사(기타)';
    }
    let s = String(wg || '').trim();
    s = s.replace(/^(?:HEY|HA|HE|공종명?)\s*[:;：]?\s*/i, '');
    s = s.replace(/[_|ㅣ¦!\[\]~—\-\r\n]+/g, ' ');
    s = s.replace(/[^가-힣a-zA-Z0-9·()\/\s]/g, '');
    s = s.replace(/\s+/g, ' ').trim();
    if (s === '양중 및 운반작업' || s === '양중작업' || s === '공통') s = '';
    if (/^(?:HA|HE|HEY|BEE)\s*공사/i.test(s)) return '비계공사';
    if (/pl\s*창호|플라스틱\s*창호/i.test(s)) return '창호공사(PL)';
    if (/^가설\s*전기(?:\s*공사)?$/i.test(s)) return '가설전기공사';
    if (/^p\.?c\s*(?:공사|작업)?$|^피씨\s*공사$|프리캐스트/i.test(s)) return 'PC공사';
    const ctx = String(content || '');
    const hasElecOrWinCtx = /창호|pl\s*창호|분전반|분전함|차단기|충전부|누전|가설전선|접지선|전등|소켓|심선/.test(ctx);
    const hasFormCtx = /형틀|거푸집|동바리|유로폼|알폼|갱폼|서포트/.test(ctx);
    const isSuspiciousDefault =
      (s === '거푸집동바리공사' && !hasFormCtx && hasElecOrWinCtx) ||
      (s === '가설공사(기타)' && /전등|소켓|투광등|심선|절연\s*불량|전선\s*연결|분전반|분전함|차단기|충전부|누전|접지선|가설전선|가설전기/.test(ctx));
    if (s && s.length >= 2 && !isSuspiciousDefault) {
      return s;
    }
    if (s === '거푸집동바리공사' && (hasFormCtx || !hasElecOrWinCtx)) {
      return '거푸집동바리공사';
    }
    if (/pl\s*창호/i.test(ctx)) return '창호공사(PL)';
    if (/분전함|분전반|차단기|충전부|누전|가설전선|접지선|전등|소켓|투광등|심선|절연\s*불량|전선\s*연결|전기/i.test(ctx)) return '가설전기공사';
    if (/p\.?c\s*공사|피씨\s*공사|프리캐스트|pc\s*(?:기둥|보|슬래브|부재)/i.test(ctx)) return 'PC공사';
    if (/거푸집|동바리|유로폼|알폼|갱폼|서포트|전도방지|형틀/i.test(ctx)) return '거푸집동바리공사';
    if (/비계|작업발판|안전난간|개구부/i.test(ctx)) return '비계공사';
    if (/지게차|하역|운반|양중|타워크레인|크레인|인양|유도로프/i.test(ctx)) return '가설공사(건설장비)';
    return s || '건축공사(기타)';
  }

  function cleanOpinionText(txt) {
    if (!txt) return '';
    let s = healSafetyKoreanLexicon(String(txt))
      .replace(/^[-—_]{2,}\s*(?=[가-힣A-Za-z0-9(\[])/gm, '- ')
      .replace(/\[\s*(?:HAT|점검단)\s*제안\s*\][\s\S]*$/gi, '')
      .replace(/oo\s*(?:Tle|기느으|기느|기|©)[\s\S]*?(?=-|[가-힣])/gi, '')
      .replace(/(?:EE\s*tee|ee\s*A\s*eA|바가\s*---|\btee\s*ee\b|ATER\s*TH|isdios|SHE\s*SEA|[—_]{6,}(?!\s*[가-힣]))[\s\S]*$/gi, '')
      .replace(/^[^\n]*?(?:절경\s*열수\s*갤|BT\s*ROSH|Deen\s*lp)[^\n]*?=\s*-\s*/i, '- ')
      .replace(/^[^\n]*?=\s*-\s*/, '- ')
      .replace(/\[\s*(?:HAA|HAT|점검단)[\s\S]*?\]/gi, '')
      .replace(/[\s|ㅣ¦_!~—\-]*[블를클|ㅣ¦_!~—\-]+$/g, '')
      .replace(/\[=\]\s*oa/gi, '')
      .trim();

    const norm = (typeof window !== 'undefined' && window.SafeTextNormalizer) ? window.SafeTextNormalizer : null;
    if (norm && typeof norm.parseInterviewOpinions === 'function') {
      const parsed = norm.parseInterviewOpinions(s);
      if (parsed && Array.isArray(parsed.sections)) {
        if (parsed.sections.length >= 2 && parsed.formatted) {
          return parsed.formatted;
        }
        if (parsed.sections.length === 1 && parsed.sections[0].text) {
          return parsed.sections[0].text;
        }
      }
    }

    s = s.replace(/\[\s*(?:[가-힣a-zA-Z\s]{0,15}?의견|의견|면담|인터뷰)[^\]]*\]/gi, '');

    // 인라인 명시적 불릿(-)만 줄바꿈 처리 (영문/괄호 시작 불릿 포함)
    s = (norm && norm.splitInlineBullets)
      ? norm.splitInlineBullets(s)
      : s.replace(/(?:(?<=[.!?\]\)])\s*|(?<=[가-힣A-Za-z0-9])\s+)[-•*·▪]\s*(?=[가-힣A-Za-z0-9(\[])/g, '\n- ');

    const rawLines = s.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const items = [];
    for (let l of rawLines) {
      if (/^[-•*·▪\s]*\[?\s*(?:관리자|근로자|관계자|담당자|시공자|해당\s*근로자)?\s*의견\s*[:;：]/i.test(l)) continue;
      const hasDash = /^[-•*·▪]\s*/.test(l);
      const isBulletStart = hasDash || /^\d+[\).]/s.test(l);
      let text = l.replace(/^[|\sㅣ¦_!\-•·~—*.©=]+/, '').replace(/^\d+[\).]\s*/, '').replace(/^[|\sㅣ¦_!\-•·~—*.©=]+/, '').replace(/[|\sㅣ¦_!~—\-*]+$/, '').trim();
      if (!text || text.length < 2) continue;
      if (/^\[?\s*(?:관리자|근로자|관계자|담당자|시공자|해당\s*근로자)?\s*의견\s*[:;：]/i.test(text)) continue;
      if (items.length === 0 || isBulletStart) {
        items.push({ text, hasDash });
      } else {
        items[items.length - 1].text = norm?.joinWrappedKoreanLines
          ? norm.joinWrappedKoreanLines(items[items.length - 1].text, text)
          : `${items[items.length - 1].text} ${text}`.replace(/\s+/g, ' ');
      }
    }
    if (items.length === 0) return '';
    return items.map(it => {
      const h = healSafetyKoreanLexicon(it.text);
      const body = norm?.normalizeKoreanSpacing ? norm.normalizeKoreanSpacing(h) : h;
      return it.hasDash ? `- ${body}` : body;
    }).join('\n');
  }

  function cleanProposalText(txt) {
    if (!txt) return '';
    let s = healSafetyKoreanLexicon(String(txt))
      .replace(/^[-—_]{2,}\s*(?=[가-힣A-Za-z0-9(\[])/gm, '- ')
      .replace(/\[?(?:점검단|HAT)\s*제안\]?/gi, '')
      .replace(/시스템\s*개선|교육\s*[\/·]\s*코칭|제재\s*[\/·]\s*징계|패널티|페널티|\((?:현장\s*)?모니터링\s*강화\)|\(이행강화안\s*수립\)|\(\s*(?:근로자|협력사|작업팀|해당\s*작업팀)\s*교육\s*\)|\(\s*해당\s*작업팀\s*대기\s*\)|\(관리감독자\s*경고\)/gi, '')
      .replace(/^(?:[-•*·▪\s]*)(?:De\s*T=?\s*©?|oo\s*Tle\s*©?|구시\s*으\s*기느으|oo\s*기느으|구시\s*으|기느으|-?\s*SHE\s*SEA)[\s\S]*?(?=\d|1차|-|[가-힣]{2})/gi, '')
      .replace(/De\s*T=?\s*©?|구시\s*으\s*기느으|oo\s*Tle\s*©?|oo\s*기느으|SHE\s*SEA/gi, '')
      .replace(/(?:EE\s*tee|ee\s*A\s*eA|바가\s*---|\btee\s*ee\b|ATER\s*TH|isdios|[—_]{6,}(?!\s*[가-힣]))[\s\S]*$/gi, '')
      .replace(/[\s|ㅣ¦_!~—\-]*[블를클르|ㅣ¦_!~—\-]+$/g, '')
      .trim();

    // 인라인 명시적 불릿(-)만 줄바꿈 처리 (영문/괄호 시작 불릿 포함)
    s = (typeof window !== 'undefined' && window.SafeTextNormalizer?.splitInlineBullets)
      ? window.SafeTextNormalizer.splitInlineBullets(s)
      : s.replace(/(?:(?<=[.!?\]\)])\s*|(?<=[가-힣A-Za-z0-9])\s+)[-•*·▪]\s*(?=[가-힣A-Za-z0-9(\[])/g, '\n- ');

    const rawLines = s.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const items = [];
    for (const line of rawLines) {
      const hasDash = /^[-•*·▪]\s*/.test(line);
      const isBulletStart = hasDash || /^\d+[\).]/s.test(line);
      let cl = line.replace(/^[|\sㅣ¦_!\-•·~—*.©=]+/, '').replace(/^\d+[\).]\s*/, '').replace(/^[|\sㅣ¦_!\-•·~—*.©=]+/, '').replace(/[|\sㅣ¦_!~—\-*]+$/, '').trim();
      if (!cl || cl.length < 2 || /^[블를클르]$/.test(cl)) continue;
      if (items.length === 0 || isBulletStart) {
        items.push({ text: cl, hasDash });
      } else {
        items[items.length - 1].text = window.SafeTextNormalizer?.joinWrappedKoreanLines
          ? window.SafeTextNormalizer.joinWrappedKoreanLines(items[items.length - 1].text, cl)
          : `${items[items.length - 1].text} ${cl}`.replace(/\s+/g, ' ');
      }
    }
    return items.map(it => {
      const h = healSafetyKoreanLexicon(it.text);
      const body = window.SafeTextNormalizer?.normalizeKoreanSpacing ? window.SafeTextNormalizer.normalizeKoreanSpacing(h) : h;
      return it.hasDash ? `- ${body}` : body;
    }).join('\n');
  }

  function cleanActionPlan(txt) {
    if (!txt) return '';
    const rawStr = healSafetyKoreanLexicon(String(txt));
    if (rawStr.includes('보완/개선') && rawStr.includes('Process')) {
      return `${/^[-•▪]\s*/.test(rawStr.trim()) ? '- ' : ''}비계 승인점검 후 보완/개선 필요사항 조치완료 후 최종승인 및 Tag 부착 Process 이행`;
    }
    let cleanedStr = rawStr
      .replace(/^[-—_]{2,}\s*(?=[가-힣A-Za-z0-9(\[])/gm, '- ')
      .replace(/\[?\s*PM\s*판정\s*결과\s*\]?/gi, '')
      .replace(/시스템\s*개선|교육\s*[\/·]\s*코칭|제재\s*[\/·]?\s*징계|패널티|페널티/gi, '')
      .replace(/\((?:현장\s*)?모니터링\s*강화\)|\(\s*모니터링\/점검강화\s*\)|\(이행강화안\s*수립\)|\(\s*(?:근로자|협력사)\s*교육\s*\)|\(관리감독자\s*경고\)|\(\s*해당\s*작업팀\s*대기\s*\)|\(\s*작업팀\s*교육\s*\)/g, '')
      .replace(/(?:EE\s*tee|ee\s*A\s*eA|바가\s*---|\btee\s*ee\b|ATER\s*TH|isdios|[—_]{6,}(?!\s*[가-힣]))[\s\S]*$/gi, '');
    cleanedStr = (typeof window !== 'undefined' && window.SafeTextNormalizer?.splitInlineBullets)
      ? window.SafeTextNormalizer.splitInlineBullets(cleanedStr)
      : cleanedStr.replace(/(?:(?<=[.!?\]\)])\s*|(?<=[가-힣A-Za-z0-9])\s+)[-•*·▪]\s*(?=[가-힣A-Za-z0-9(\[])/g, '\n- ');
    cleanedStr = cleanedStr
      .replace(/,\s*-\s*/g, '\n- ')
      .trim();

    const rawLines = cleanedStr.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const items = [];

    for (const line of rawLines) {
      const hasDash = /^[-•*·▪]\s*/.test(line);
      const hasExplicitBullet = hasDash || /^\.\s*|^\d+[\).]/s.test(line);
      let cl = line.replace(/^[|\sㅣ¦_!~—\-*•·.\s&]+/, '').replace(/^\d+[\).]\s*/, '').replace(/^[|\sㅣ¦_!~—\-*•·.\s&]+/, '').replace(/[|\sㅣ¦_!~—\-&]+$/, '').trim();
      if (!cl || cl.length < 2) continue;
      if (/(?:사각후크|그림\s*참조|상하\s*방향|900mm|보강\s*예|시스템\s*개선|교육\s*[\/·]\s*코칭|제재\s*[\/·]?\s*징계|해당\s*작업팀\s*대기|작업팀\s*교육)/i.test(cl) || /[&제테텍레]{3,}/.test(cl)) continue;

      if (cl.includes('비계 승인점검 후 보완/개선') || cl.includes('Process 이행')) {
        return `${hasDash ? '- ' : ''}비계 승인점검 후 보완/개선 필요사항 조치완료 후 최종승인 및 Tag 부착 Process 이행`;
      }

      if (items.length === 0 || hasExplicitBullet) {
        items.push({ text: cl, hasDash });
      } else {
        items[items.length - 1].text = window.SafeTextNormalizer?.joinWrappedKoreanLines
          ? window.SafeTextNormalizer.joinWrappedKoreanLines(items[items.length - 1].text, cl)
          : `${items[items.length - 1].text} ${cl}`.replace(/\s+/g, ' ');
      }
    }

    return items.map(it => {
      const h = healSafetyKoreanLexicon(it.text);
      const body = window.SafeTextNormalizer?.normalizeKoreanSpacing ? window.SafeTextNormalizer.normalizeKoreanSpacing(h) : h;
      return it.hasDash ? `- ${body}` : body;
    }).join('\n');
  }
  function cleanContent(txt) {
    if (!txt) return '';
    let s = healSafetyKoreanLexicon(String(txt))
      .replace(/^부적합\s*(?:내용|사항)\s*[:;：]?\s*/, '')
      .replace(/^[|ㅣ¦_!~\-\s]+/, '')
      .replace(/(?:EE\s*tee|ee\s*A\s*eA|바가\s*---|\btee\s*ee\b|ATER\s*TH|isdios|eevee|[—_]{6,}(?!\s*[가-힣]))[\s\S]*$/gi, '')
      .replace(/6\/\\\s*코어/gi, 'E/V 코어')
      .replace(/6\/\s*코어/gi, 'E/V 코어')
      .replace(/6\/\\/g, 'E/V')
      .replace(/4%\s*11일/g, '4월 11일')
      .replace(/미설치\s*[52등중]\)?/g, '미설치 등)')
      .replace(/(?:—|->|-)\s*4월\s*11일/g, '→ 4월 11일')
      .replace(/(?<=[^\n])\s*(?=[2-9]\)\s*[가-힣])/g, '\n')
      .replace(/^[|ㅣ¦_!~\-\s]+/, '')
      .trim();

    const lines = s.split(/\r?\n/)
      .map(l => {
        const trimmed = l.replace(/^[|ㅣ¦_!~\-\s]+/, '').replace(/[|ㅣ¦_!~\-\s:。ㅎ]+$/, '').trim();
        return window.SafeTextNormalizer?.normalizeKoreanSpacing ? window.SafeTextNormalizer.normalizeKoreanSpacing(trimmed) : trimmed;
      })
      .filter(l => {
        if (l.length < 3) return false;
        if (/^[—\-_\s]+ee\b/i.test(l)) return false;
        if (/^1\s*벽이음\s*설치\s*위치와/.test(l) || /충렬선상|미실지/.test(l)) return false;
        const kor = (l.match(/[가-힣]/g) || []).length;
        const eng = (l.match(/[a-zA-Z]/g) || []).length;
        if (/[{}]|\.{3,}|[a-z]\s*\d+\s*\{/i.test(l)) return false;
        if (/^(?:[—\-_\s]*ee\b|ee\s*[-—_~]+|\b(?:isdios|eevee|tee\s*ee)\b)/i.test(l)) return false;
        if (kor === 0 && eng > 4) return false;
        if (eng > kor * 2 && eng >= 6) return false;
        return true;
      });
    return healSafetyKoreanLexicon(lines.join('\n'));
  }

  /**
   * Qwen AI를 활용한 장표 OCR 텍스트 지능형 정제 및 필드 복원 (Cloudflare 24시간 클라우드 Qwen AI 최우선 연동)
   */
  let _cfQuotaCooldownUntil = 0;
  let _cfTransientBackoffUntil = 0;

  function isQuotaCoolingDown() {
    return Date.now() < _cfQuotaCooldownUntil || Date.now() < _cfTransientBackoffUntil;
  }

  function isFieldKeyLiteral(val) {
    return /^-?\s*(?:location|content|interview|interviewOpinion|proposalText|auditProposal|countermeasure|actionPlan|rawLaw|lawBody)$/i.test(String(val || '').trim());
  }

  async function cleanOcrRecord(rawOcrText, fallbackRecord, options = {}) {
    if (!fallbackRecord) fallbackRecord = {};
    const workerUrl = (typeof window !== 'undefined' ? window.SAFEPATROL_CONFIG?.workerUrl : null) || (typeof globalThis !== 'undefined' ? globalThis.SAFEPATROL_CONFIG?.workerUrl : null) || 'https://safepatrol-relay.abraxass0511.workers.dev';
    const pin = storage.getItem('sp_pin') || '111111';
    const forceLocal = storage.getItem('sp_ai_provider') === 'local';

    if (!forceLocal && workerUrl && Date.now() < _cfQuotaCooldownUntil) {
      fallbackRecord._aiQuotaExceeded = true;
    }

    const preLawState = resolveLawWithTieredMemory(fallbackRecord);

    // ── [1순위] Cloudflare 24시간 상시 가동 하이브리드 연동 (Selective Vision Rescue 지원) ──
    if (!forceLocal && workerUrl && !isQuotaCoolingDown()) {
      try {
        const rawLen = rawOcrText ? String(rawOcrText).trim().length : 0;
        const contentLen = fallbackRecord.content ? String(fallbackRecord.content).trim().length : 0;
        const hasSufficientOcr = (rawLen >= 40 || contentLen >= 10);
        const wantVision = Boolean(options.forceVision || !hasSufficientOcr) && !!fallbackRecord._stripImageBase64;
        const ctrl = new AbortController();
        const timeout = setTimeout(() => ctrl.abort(), wantVision ? 45000 : 14000);
        const cfRes = await fetch(`${workerUrl.replace(/\/$/, '')}/api/ai-analyze`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-PIN': pin
          },
          body: JSON.stringify({
            mode: 'ocr_clean',
            forceVision: wantVision,
            rawOcrText: rawOcrText || '',
            stripImageBase64: wantVision ? fallbackRecord._stripImageBase64 : undefined,
            content: fallbackRecord.content || rawOcrText,
            location: fallbackRecord.location || '',
            workGroup: fallbackRecord.workGroup || '',
            subcontractor: fallbackRecord.subcontractor || '',
            interviewOpinion: fallbackRecord.interviewOpinion || '',
            auditProposal: fallbackRecord.auditProposal || '',
            actionPlan: fallbackRecord.actionPlan || '',
            rawLaw: fallbackRecord.rawLaw || '',
            lawBody: fallbackRecord.lawBody || '',
            law: fallbackRecord.law || '',
            needsAiLaw: preLawState.needAi,
            hasGarbledLaw: preLawState.garbled,
            guidelineCode: preLawState.spec?.code || '',
            lawPriorityTier: preLawState.priorityTier,
            productType: fallbackRecord.productType || '공동주택',
            progressRate: 35
          }),
          signal: ctrl.signal
        });
        clearTimeout(timeout);
        if (cfRes.ok) {
          const cfData = await cfRes.json();
          if (cfData) {
            if (cfData.quotaExceeded) {
              _cfQuotaCooldownUntil = Date.now() + 20 * 60 * 1000;
            }
            if (Array.isArray(cfData.aiErrors) && cfData.aiErrors.length > 0) fallbackRecord._aiErrors = cfData.aiErrors;
            const cfContent = cfData.cleanedFields && typeof cfData.cleanedFields.content === 'string'
              ? cfData.cleanedFields.content.trim()
              : '';
            const isRealAiSource = !!(cfData.source && !String(cfData.source).includes('rule') && !cfData.quotaExceeded);
            const hasCallerText = String(rawOcrText || fallbackRecord.content || '').trim().length >= 4;
            const hasRealAiResult = !cfData.needsClientOcr && isRealAiSource && (cfContent.length >= 4 || (hasCallerText && !!cfData.agentMajor));
            if (hasRealAiResult) {
              fallbackRecord._aiCleaned = true;
              if (wantVision) fallbackRecord._visionCleaned = true;
              if (cfData.agentMajor) fallbackRecord.agentMajor = cfData.agentMajor;
              if (cfData.agentMid) fallbackRecord.agentMid = cfData.agentMid;
              if (cfData.agentMinor) {
                fallbackRecord.agentMinor = cfData.agentMinor;
                fallbackRecord.agent = cfData.agentMinor;
                fallbackRecord.item = cfData.agentMid || cfData.agentMinor;
              }
              if (cfData.workGroup) fallbackRecord.workGroup = cfData.workGroup;
              if (cfData.workMethod) fallbackRecord.workMethod = cfData.workMethod;
              if (cfData.condition) fallbackRecord.condition = cfData.condition;
              if (cfData.action) fallbackRecord.action = cfData.action;
              if (cfData.rootCauseMgmt) fallbackRecord.rootCauseMgmt = cfData.rootCauseMgmt;
              if (cfData.rootCauseSystem) fallbackRecord.rootCauseSystem = cfData.rootCauseSystem;
              if (cfData.stakeholder) fallbackRecord.stakeholder = cfData.stakeholder;
              if (cfData.severity && /중부적합|경부적합/.test(cfData.severity) && (!fallbackRecord.severity || !fallbackRecord._hasDigitalText)) {
                fallbackRecord.severity = cfData.severity.includes('중부적합') ? '중부적합' : '경부적합';
              }
              if (cfData.law && (!fallbackRecord.law || /안전보건기준\s*검토/.test(fallbackRecord.law))) {
                fallbackRecord.law = cfData.law;
              }
              if ((cfData.type || cfData.hazardType) && (!fallbackRecord.type || !fallbackRecord._hasDigitalText)) {
                fallbackRecord.type = cfData.type || String(cfData.hazardType).split('·')[0];
              }
              if (cfData.photo2Banner) {
                fallbackRecord.photo2Banner = cfData.photo2Banner;
                if (!fallbackRecord.photo2Title) fallbackRecord.photo2Title = cfData.photo2Banner;
              }
              if (cfData.pmVerdict) {
                const incomingPm = String(cfData.pmVerdict).trim();
                const hasSheetPropType = Boolean(
                  fallbackRecord._hasExplicitPropType ||
                  (Array.isArray(fallbackRecord.proposalItems) && fallbackRecord.proposalItems.length > 0 && fallbackRecord.inspectorOpinionType)
                );
                if (!hasSheetPropType && /^(?:시스템\s*개선|교육\s*\/\s*코칭|페널티|제재\s*\/\s*징계)/.test(incomingPm)) {
                  fallbackRecord.inspectorOpinionType = incomingPm;
                }
                // 주의: 원본 PDF에 [PM판정결과]가 명시되지 않았으면 AI 추론값을 PM 판정결과로 강제 주입하지 않음!
              }
              // 주의: 장표에서 픽셀로 직접 감지한 4대 발생요인(mgmtCauses)이 이미 있으면 AI 추론값으로 절대 덮어쓰지 않음!
              if ((!Array.isArray(fallbackRecord.mgmtCauses) || fallbackRecord.mgmtCauses.length === 0) && Array.isArray(cfData.mgmtCauses) && cfData.mgmtCauses.length > 0) {
                fallbackRecord.mgmtCauses = cfData.mgmtCauses;
              }
              if (cfData.cleanedFields && typeof cfData.cleanedFields === 'object') {
                const cf = cfData.cleanedFields;
                const normField = (val, fk) => {
                  const healed = healSafetyKoreanLexicon(String(val || '').trim());
                  return (typeof window !== 'undefined' && window.SafeTextNormalizer?.normalizeFieldText)
                    ? window.SafeTextNormalizer.normalizeFieldText(healed, fk)
                    : healed;
                };
                if (cf.content && !isFieldKeyLiteral(cf.content)) {
                  const c = cleanContent(normField(cf.content, 'content')) || cf.content;
                  if (c && !isFieldKeyLiteral(c)) fallbackRecord.content = c;
                }
                if (cf.location && !isFieldKeyLiteral(cf.location)) {
                  const loc = normField(cf.location, 'location');
                  if (loc && !isFieldKeyLiteral(loc)) fallbackRecord.location = loc;
                }
                if (cf.workGroup) fallbackRecord.workGroup = cleanWorkGroup(cf.workGroup, fallbackRecord.content) || cf.workGroup;
                if (cf.subcontractor !== undefined) fallbackRecord.subcontractor = cf.subcontractor;
                if (cf.inspector !== undefined && cf.inspector) {
                  const insCleaned = String(cf.inspector)
                    .replace(/^.*?(?:[점적정서섬성선]\s*[검겸견]\s*[자사시차])\s*[:：.;]?\s*/g, '')
                    .replace(/[^가-힣a-zA-Z0-9\s]/g, '')
                    .trim();
                  if (insCleaned.length >= 2 && !/^(?:[점적정서섬성선][검겸견][자사시차])$/i.test(insCleaned)) {
                    fallbackRecord.inspector = insCleaned;
                    fallbackRecord.inspectUser = insCleaned;
                  }
                }
                if (cf.round) {
                  const normR = typeof window !== 'undefined' && window.SafeTextNormalizer?.normalizeRoundText
                    ? window.SafeTextNormalizer.normalizeRoundText(cf.round)
                    : cf.round;
                  fallbackRecord.round = normR;
                  fallbackRecord.inspectRound = normR;
                }
                if (cf.interviewOpinion && !isFieldKeyLiteral(cf.interviewOpinion)) {
                  const op = cleanOpinionText(normField(cf.interviewOpinion, 'interview')) || cf.interviewOpinion;
                  if (op && !isFieldKeyLiteral(op)) fallbackRecord.interviewOpinion = op;
                  syncParsedOpinionsOnRecord(fallbackRecord);
                }
                if (cf.auditProposal && !isFieldKeyLiteral(cf.auditProposal)) {
                  const prop = cleanProposalText(normField(cf.auditProposal, 'auditProposal')) || cf.auditProposal;
                  if (prop && !isFieldKeyLiteral(prop)) fallbackRecord.auditProposal = prop;
                }
                if (cf.actionPlan && !isFieldKeyLiteral(cf.actionPlan)) {
                  const cleanedPlan = cleanActionPlan(normField(cf.actionPlan, 'actionPlan')) || cf.actionPlan;
                  if (cleanedPlan && !isFieldKeyLiteral(cleanedPlan)) {
                    fallbackRecord.actionPlan = cleanedPlan;
                    fallbackRecord.countermeasure = cleanedPlan;
                  }
                }
                if (preLawState.priorityTier !== 'original_valid') {
                  if (cf.law && !isFieldKeyLiteral(cf.law)) {
                    fallbackRecord.law = cf.law;
                    if (!fallbackRecord.rawLaw) fallbackRecord.rawLaw = cf.law;
                  }
                  if (cf.rawLaw && !isFieldKeyLiteral(cf.rawLaw)) {
                    const rawLawStr = String(cf.rawLaw).trim();
                    if (!cf.lawBody && rawLawStr.includes('\n')) {
                      const rlLines = rawLawStr.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
                      if (/^\d+\.\d+|^\d+\)|^[•\-*]/.test(rlLines[0] || '') && cf.law) {
                        fallbackRecord.rawLaw = cf.law;
                        fallbackRecord.lawBody = rawLawStr;
                      } else {
                        fallbackRecord.rawLaw = rlLines[0] || fallbackRecord.rawLaw;
                        fallbackRecord.lawBody = rlLines.slice(1).join('\n').trim();
                      }
                    } else {
                      fallbackRecord.rawLaw = rawLawStr;
                    }
                  }
                  if (cf.lawBody && !isFieldKeyLiteral(cf.lawBody)) fallbackRecord.lawBody = cf.lawBody;
                  if (!cf.rawLaw && !cf.lawBody && cfData.visionText) {
                    const lawSecMatch = String(cfData.visionText).match(/\[관련기준\]\s*([\s\S]*?)(?=\n\[[가-힣A-Za-z0-9_/]+\]|$)/);
                    if (lawSecMatch && lawSecMatch[1] && lawSecMatch[1].trim().length >= 12) {
                      fallbackRecord.rawLaw = lawSecMatch[1].trim();
                    }
                  }
                } else {
                  if (cf.lawBody && !isFieldKeyLiteral(cf.lawBody) && String(cf.lawBody).length >= String(fallbackRecord.lawBody || '').length * 0.7) {
                    fallbackRecord.lawBody = cf.lawBody;
                  }
                }
                const resolvedAfterOcr = resolveLawWithTieredMemory(fallbackRecord);
                if (!resolvedAfterOcr.needAi && fallbackRecord.rawLaw && fallbackRecord.lawBody) {
                  getGuidelineMemory()?.learnFromRecord?.(fallbackRecord, 'ai_ocr_clean');
                }
              }
              if (cfData.photoBanner && (!fallbackRecord.photoBanner || fallbackRecord.photoBanner === '안전기준 미준수' || !fallbackRecord._hasDigitalText || wantVision)) {
                fallbackRecord.photoBanner = cleanBannerText(cfData.photoBanner, fallbackRecord.content, fallbackRecord.location);
              } else if (fallbackRecord.photoBanner) {
                fallbackRecord.photoBanner = cleanBannerText(fallbackRecord.photoBanner, fallbackRecord.content, fallbackRecord.location);
              }
              delete fallbackRecord._stripImageBase64;
              delete fallbackRecord._rightPhotoBase64;
              delete fallbackRecord._hasDigitalText;
            }
          }
        }
      } catch (cfErr) {
        console.warn('Cloudflare 24시간 Qwen AI 호출 안내 (로컬 룰엔진 즉시 동작):', cfErr);
      }
    }

    // ── [2순위] 사용자가 설정에서 '로컬 AI(LM Studio)'를 명시적으로 선택한 경우에만 2초 타임아웃으로 실행 ──
    if (forceLocal && !fallbackRecord._aiCleaned) {
      for (const ep of [currentEndpoint, ...DEFAULT_ENDPOINTS]) {
        try {
          const ctrl = new AbortController();
          const timeout = setTimeout(() => ctrl.abort(), 2000);
          const res = await fetch(`${ep}/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: currentModel,
              messages: [
                { role: 'system', content: '너는 대한민국 건설안전 감사 전문가 AI이다. JSON으로만 답하라.' },
                { role: 'user', content: `[OCR 텍스트 원문]:\n${rawOcrText}` }
              ],
              temperature: 0.1,
              max_tokens: 1800
            }),
            signal: ctrl.signal
          });
          clearTimeout(timeout);
          if (res.ok) {
            const data = await res.json();
            const msg = data.choices?.[0]?.message;
            const text = msg?.content || msg?.reasoning_content || '';
            const parsed = extractJSON(msg?.content) || extractJSON(msg?.reasoning_content) || extractJSON(text);
            if (parsed) {
              if (parsed.sheetType === '참고사항' || parsed._skipped) {
                return { ...fallbackRecord, _skipped: true, skipReason: parsed.skipReason || '시공 가이드 참고사항' };
              }
              Object.assign(fallbackRecord, parsed);
              break;
            }
          }
        } catch (e) {}
      }
    }

    delete fallbackRecord._stripImageBase64;
    delete fallbackRecord._rightPhotoBase64;

    // ── [3순위] 10가지 요구사항 전수 무결성 정제 필터 적용 ──
    const cleanedContent = cleanContent(fallbackRecord.content);
    const cleanedOpinion = cleanOpinionText(fallbackRecord.interviewOpinion);
    const parsedMulti = getNormHelper()?.parseInterviewOpinions?.(cleanedOpinion);
    const cleaned = {
      ...fallbackRecord,
      subcontractor: cleanSubcontractor(fallbackRecord.subcontractor),
      workGroup: cleanWorkGroup(fallbackRecord.workGroup, cleanedContent),
      location: cleanLocation(fallbackRecord.location, cleanedContent),
      content: cleanedContent,
      photoBanner: cleanBannerText(fallbackRecord.photoBanner, cleanedContent),
      interviewAuthor: cleanedOpinion
        ? ((parsedMulti?.hasMulti && parsedMulti.authorsText) ? parsedMulti.authorsText : (fallbackRecord.interviewAuthor || '시공관리자 및 근로자'))
        : '',
      interviewAuthorTitle: cleanedOpinion
        ? ((parsedMulti?.hasMulti && parsedMulti.primaryTitle) ? parsedMulti.primaryTitle : (fallbackRecord.interviewAuthorTitle || `[의견 : ${fallbackRecord.interviewAuthor || '시공관리자 및 근로자'}]`))
        : '',
      interviewOpinion: cleanedOpinion,
      interviewOpinions: (parsedMulti?.sections && parsedMulti.sections.length >= 2) ? parsedMulti.sections : (fallbackRecord.interviewOpinions || []),
      auditProposal: cleanProposalText(fallbackRecord.auditProposal),
      actionPlan: cleanActionPlan(fallbackRecord.actionPlan),
      countermeasure: cleanActionPlan(fallbackRecord.actionPlan || fallbackRecord.countermeasure),
      inspectorOpinionType: fallbackRecord.inspectorOpinionType || '',
      pmVerdict: fallbackRecord.pmVerdict || '',
      pmVerdictType: fallbackRecord.pmVerdictType || fallbackRecord.pmVerdict || '',
      severity: fallbackRecord.severity || ((fallbackRecord._aiCleaned || cleanedContent) ? '중부적합' : ''),
      type: fallbackRecord.type || ((fallbackRecord._aiCleaned || cleanedContent) ? '붕괴' : '')
    };

    const finalOcrLawState = resolveLawWithTieredMemory(cleaned);
    if (!finalOcrLawState.needAi && cleaned.rawLaw && cleaned.lawBody) {
      getGuidelineMemory()?.learnFromRecord?.(cleaned, 'ai_ocr_clean');
    }

    return cleaned;
  }

  const ELECTRICAL_SIGNAL_RE = /가설전기|분전반|분전함|누전차단기|차단기|접지선|가설전선|전등|소켓|투광등|충전부|심선|절연\s*불량|누설전류/;
  const GENUINE_DEMOLITION_RE = /석면\s*해체|구조물\s*해체|비계\s*해체|동바리\s*해체|슬래브\s*철거|벽체\s*철거|철거\s*작업|해체\s*작업/;
  const GENUINE_EXCAVATION_RE = /굴착\s*작업|터파기|토류판|어스앙카|집수정\s*굴착|사면\s*붕괴|굴착면|법면/;

  function sanitizeWorkMethod(rawMethod, workGroup, content, location) {
    const norm = getNormHelper();
    if (norm && typeof norm.normalizeWorkMethod9x9 === 'function') {
      return norm.normalizeWorkMethod9x9(rawMethod, workGroup, content, location);
    }
    const wm = String(rawMethod || '').trim();
    const wg = String(workGroup || '').trim();
    const contentText = String(content || '').trim();
    const strippedContent = contentText
      .replace(/흙막이\s*(?:상부|상단|하부|주변|근생|구간)\s*[:：]?/g, ' ')
      .trim();
    const hasElectrical = wg === '가설전기공사' || ELECTRICAL_SIGNAL_RE.test(`${wg} ${contentText}`);
    const hasGenuineDemolition = GENUINE_DEMOLITION_RE.test(contentText);
    const hasGenuineExcavation = GENUINE_EXCAVATION_RE.test(strippedContent);

    if (wm === '설치조립작업' || wm === '해체작업') return '설치해체작업';
    if (wm === '밀폐공간작업' || wm === '협소공간작업') return '기타';
    if (hasElectrical && !hasGenuineDemolition && !hasGenuineExcavation) {
      if (!wm || wm === '굴착작업') return '설치해체작업';
    }
    if (wm === '굴착작업' && !hasGenuineExcavation && /흙막이\s*(?:상부|상단|주변|근생)/.test(`${location || ''} ${contentText}`)) {
      return hasElectrical ? '설치해체작업' : '고소작업';
    }
    return wm;
  }

  function getNormHelper() {
    if (typeof window !== 'undefined' && window.SafeTextNormalizer) return window.SafeTextNormalizer;
    if (typeof globalThis !== 'undefined' && globalThis.SafeTextNormalizer) return globalThis.SafeTextNormalizer;
    return null;
  }

  function getGuidelineMemory() {
    if (typeof window !== 'undefined' && window.SafeGuidelineMemory) return window.SafeGuidelineMemory;
    if (typeof globalThis !== 'undefined' && globalThis.SafeGuidelineMemory) return globalThis.SafeGuidelineMemory;
    return null;
  }

  function resolveLawWithTieredMemory(rec, options = {}) {
    if (!rec || typeof rec !== 'object') return { spec: null, needAi: false, garbled: false, priorityTier: 'needs_ai_law', learnedCandidates: [] };
    const allowUnverifiedLearned = Boolean(options.allowUnverifiedLearned);
    const norm = getNormHelper();
    const mem = getGuidelineMemory();
    const ctxText = `${rec.workGroup || ''} ${rec.content || ''} ${rec.type || ''} ${rec.hazardType || ''}`;
    const rawLawForCheck = rec.rawLaw || '';
    const lawBodyForCheck = rec.lawBody || '';
    const garbledTitle = Boolean(norm && typeof norm.hasGarbledKoreanNoise === 'function' && norm.hasGarbledKoreanNoise(rawLawForCheck));
    const garbledBody = Boolean(norm && typeof norm.hasGarbledKoreanNoise === 'function' && norm.hasGarbledKoreanNoise(lawBodyForCheck));
    const garbled = garbledTitle || garbledBody;
    const spec = norm && typeof norm.normalizeSafetyLawSpec === 'function'
      ? norm.normalizeSafetyLawSpec({
          rawLaw: rawLawForCheck,
          lawBody: lawBodyForCheck,
          law: rec.law || '',
          contextText: ctxText,
          workGroup: rec.workGroup || '',
          type: rec.type || rec.hazardType || ''
        })
      : { title: rawLawForCheck, body: lawBodyForCheck, needsAiLaw: !rawLawForCheck || !lawBodyForCheck, code: '' };

    // 1순위: 원본이 깨짐·도메인 모순 없이 완전하면 그대로 유지 + 지침 저장소 학습
    if (!spec.needsAiLaw && !garbled && spec.title && spec.body) {
      rec.rawLaw = spec.title;
      rec.lawBody = spec.body;
      if (!rec.law) rec.law = spec.title;
      rec._needsAiLaw = false;
      rec._hasGarbledLaw = false;
      rec._lawSource = rec._lawSource || 'original_valid';
      mem?.learnFromRecord?.(rec, rec._lawSource);
      return { spec, needAi: false, garbled: false, priorityTier: rec._lawSource, learnedCandidates: [] };
    }

    // 2순위: 학습된 안전작업지침 후보 수집 — 온라인에서는 반드시 Qwen AI가 부적합내용+사진 적합성을 확인 후 채택 (Point #6)
    const learnedCandidates = (mem && typeof mem.findCandidates === 'function')
      ? mem.findCandidates({
          rawLaw: rawLawForCheck || spec.title || '',
          lawBody: lawBodyForCheck || spec.body || '',
          content: rec.content || '',
          workGroup: rec.workGroup || '',
          type: rec.type || rec.hazardType || '',
          limit: 3
        }).map(c => ({ code: c.code, title: c.title, body: c.body, domain: c.domain }))
      : [];

    if (allowUnverifiedLearned && mem && typeof mem.lookup === 'function') {
      const learned = mem.lookup({
        rawLaw: rawLawForCheck || spec.title || '',
        lawBody: lawBodyForCheck || spec.body || '',
        content: rec.content || '',
        workGroup: rec.workGroup || '',
        type: rec.type || rec.hazardType || ''
      });
      if (learned && learned.title && (learned.body || spec.body)) {
        rec.rawLaw = learned.title;
        if (!rec.law || spec.mismatchReason || garbledTitle) rec.law = learned.law || learned.title;
        if (!rec.lawBody || garbledBody || spec.mismatchReason) rec.lawBody = learned.body || spec.body || '';
        rec._needsAiLaw = false;
        rec._hasGarbledLaw = false;
        rec._lawSource = 'learned_guideline';
        return { spec: { ...spec, title: rec.rawLaw, body: rec.lawBody, needsAiLaw: false }, needAi: false, garbled: false, priorityTier: 'learned_guideline', learnedCandidates };
      }
    }

    // 3순위: 하드코딩 조문을 지어내지 않고 모순된 값만 제거한 뒤 Qwen AI(학습지침 적합성 검증 포함)로 위임
    if (spec.mismatchReason) {
      if (!spec.title) {
        if (rec.law && /(?:직?[계게개]차|지[계개제]차|제172조|유도자|제332조|거푸집동바리)/.test(rec.law)) {
          rec.law = '';
        }
        if (!(spec.code && garbledTitle)) {
          rec.rawLaw = '';
        }
      } else {
        rec.rawLaw = spec.title;
      }
      if (!spec.body && rec.lawBody && /유도자|직?[계게개]차|지[계개제]차|운행경로/.test(rec.lawBody)) {
        rec.lawBody = '';
      }
    } else {
      if (spec.title && !garbledTitle) rec.rawLaw = spec.title;
      if (typeof rec.lawBody === 'string' && spec.body && !garbledBody) rec.lawBody = spec.body;
    }

    const needAi = Boolean(spec.needsAiLaw || garbled || !rec.law || !rec.rawLaw || !rec.lawBody);
    rec._needsAiLaw = needAi;
    rec._hasGarbledLaw = garbled;
    const priorityTier = needAi
      ? (learnedCandidates.length > 0 ? 'verify_learned_guideline' : 'needs_ai_law')
      : 'original_valid';
    return { spec, needAi, garbled, priorityTier, learnedCandidates };
  }

  function syncParsedOpinionsOnRecord(rec) {
    const norm = getNormHelper();
    if (!rec || !rec.interviewOpinion || !norm || typeof norm.parseInterviewOpinions !== 'function') return;
    const parsed = norm.parseInterviewOpinions(rec.interviewOpinion);
    if (parsed && Array.isArray(parsed.sections) && parsed.sections.length >= 2) {
      rec.interviewOpinions = parsed.sections;
      rec.interviewOpinion = parsed.formatted || rec.interviewOpinion;
      if (parsed.authorsText) rec.interviewAuthor = parsed.authorsText;
      if (parsed.primaryTitle) rec.interviewAuthorTitle = parsed.primaryTitle;
    }
  }

  function sanitizeDomainMismatchedLaw(rec) {
    if (!rec || typeof rec !== 'object') return rec;
    resolveLawWithTieredMemory(rec);
    return rec;
  }

  function applyLocalTaxonomyToRecords(records = [], options = {}) {
    if (!Array.isArray(records)) return records;
    const preserveAiFields = Boolean(options.preserveAiFields);
    const norm = getNormHelper();
    records.forEach((rec) => {
      if (!rec) return;
      resolveLawWithTieredMemory(rec, { allowUnverifiedLearned: !preserveAiFields });
      syncParsedOpinionsOnRecord(rec);
      const isAiAuthored = preserveAiFields && Boolean(rec._aiCleaned || rec._aiVerified);
      const fullCtx = `${rec.workGroup || ''} ${rec.content || ''} ${rec.rawLaw || ''}`;
      const r = quickRuleAnalysis(fullCtx) || {};
      const rawWorkFromSheet = String(rec._rawCellTexts?.work || '').replace(/^.*?공종명?\s*[:：.]?\s*/, '').trim();
      if (rawWorkFromSheet && rawWorkFromSheet.length >= 2) {
        rec.workGroup = cleanWorkGroup(rawWorkFromSheet, rec.content);
      } else if (!rec.workGroup) {
        rec.workGroup = cleanWorkGroup(r.workGroup || '', rec.content);
      } else {
        rec.workGroup = cleanWorkGroup(rec.workGroup, rec.content);
      }
      if (norm && typeof norm.resolveWorkGroupMid === 'function') {
        rec.workGroupMid = norm.resolveWorkGroupMid(rec.workGroup, rec.workGroupMid || '', rec.content || '');
      }
      if (norm && typeof norm.inferLocationCategory === 'function' && (!rec.locationCategory || !isAiAuthored)) {
        rec.locationCategory = norm.inferLocationCategory(rec.locationCategory || '', rec.location || '', `${rec.content || ''} ${rec.photoBanner || ''}`);
      }
      if (!isAiAuthored && (!preserveAiFields || !rec.workMethod)) {
        if ((!rec.workMethod || ((rec.workMethod === '설치해체작업' || rec.workMethod === '설치조립작업') && /하역운반작업|양중작업|굴착작업|중량물취급작업|가공조립작업|운전조정작업|고소작업/.test(r.workMethod || ''))) && r.workMethod) {
          rec.workMethod = r.workMethod;
        }
      }
      rec.workMethod = sanitizeWorkMethod(rec.workMethod, rec.workGroup, rec.content, rec.location) || r.workMethod || rec.workMethod;
      if (rec.workMethod) rec.workName = rec.workMethod;
      if (!isAiAuthored && r.agentMajor && (!rec.agentMajor || (rec.agentMid === '거푸집/동바리' && !/거푸집|동바리|유로폼|서포트/.test(fullCtx)))) {
        rec.agentMajor = r.agentMajor;
        rec.agentMid = r.agentMid;
        rec.agentMinor = r.agentMinor;
        rec.kind = r.agentMajor;
        rec.item = r.agentMid;
        rec.agent = r.agentMinor;
        rec.matrixArea = r.agentMajor;
        rec.matrixTarget = r.agentMid;
        rec.matrixSpec = r.agentMinor;
      }
      if (!isAiAuthored && (!rec.type || (rec.type === '붕괴' && !/붕괴|도괴/.test(fullCtx))) && r.type) {
        rec.type = r.type;
      }
      if (
        /분전(?:함|반).*차단기.*충전부/.test(String(rec.photoBanner || '').trim()) &&
        /전등|소켓|조명|심선/.test(rec.content || '') &&
        !/분전함|분전반|차단기/.test(rec.content || '')
      ) {
        rec.photoBanner = '';
      }
      if (!isAiAuthored && (!preserveAiFields || !rec.photoBanner)) {
        const rawBannerFromSheet = String(rec._rawCellTexts?.banner || '').trim();
        const isStaleRawBanner = /분전(?:함|반).*차단기.*충전부/.test(rawBannerFromSheet) &&
          /전등|소켓|조명|심선/.test(rec.content || '') &&
          !/분전함|분전반|차단기/.test(rec.content || '');
        rec.photoBanner = cleanBannerText((isStaleRawBanner ? '' : rawBannerFromSheet) || rec.photoBanner, rec.content, rec.location) || r.photoBanner || '';
      } else if (rec.photoBanner) {
        rec.photoBanner = cleanBannerText(rec.photoBanner, rec.content, rec.location) || rec.photoBanner;
      }
      if (!rec.condition || rec.condition === '해당없음') rec.condition = r.condition || rec.condition;
      if (!rec.action || rec.action === '해당없음') rec.action = r.action || rec.action;
      if (!rec.rootCauseMgmt && r.rootCauseMgmt) rec.rootCauseMgmt = r.rootCauseMgmt;
      if (!rec.rootCauseSystem && r.rootCauseSystem) rec.rootCauseSystem = r.rootCauseSystem;
      if (!rec.stakeholder && r.stakeholder) rec.stakeholder = r.stakeholder;
      // AI 검증 예정(preserveAiFields)이 아닌 오프라인 폴백에서도 안전작업지침 학습 여부를 먼저 확인하고, 없을 때만 최소 보조
      if (!preserveAiFields && !rec.law && !rec._needsAiLaw && r.law) rec.law = r.law;
      rec._aiCleaned = true;
    });
    return records;
  }

  /**
   * [v60] 다건 묶음(Multi-Page Batch) 표준 분류·관련기준·띄어쓰기·오타 일괄 AI 교정 (4건 단위 분할 + 자동 재시도)
   * - 요청당 최대 4건으로 분할하고 45초 타임아웃으로 안정화하여 누락 분류·공란 법령·띄어쓰기/오타 미교정 원천 차단
   */
  async function classifyBatchRecords(records = []) {
    if (!Array.isArray(records) || records.length === 0) return records;
    const forceLocal = storage.getItem('sp_ai_provider') === 'local';
    if (forceLocal || Date.now() < _cfQuotaCooldownUntil || Date.now() < _cfTransientBackoffUntil) {
      return applyLocalTaxonomyToRecords(records);
    }

    const normHelperForBatch = getNormHelper();
    let consecutiveFailures = 0;

    const runSingleBatchChunk = async (chunkRecords) => {
      if (!chunkRecords.length) return false;
      const tierStates = chunkRecords.map(rec => resolveLawWithTieredMemory(rec, { allowUnverifiedLearned: false }));
      const items = chunkRecords.map((rec, idx) => {
        const ts = tierStates[idx] || {};
        const rawSheetBanner = rec._rawCellTexts?.banner || rec._originalBannerText || '';
        const hasOriginalBanner = Boolean(
          rec._hasOriginalBanner ||
          (rawSheetBanner && normHelperForBatch?.isValidOriginalSheetBanner?.(rawSheetBanner, rec.content, rec.location))
        );
        return {
          pageIndex: rec.pageNumber || rec.slideNumber || (idx + 1),
          severityHint: rec.severity || '중부적합',
          hasOriginalBanner,
          needsAiLaw: Boolean(ts.needAi || !String(rec.law || rec.rawLaw || '').trim() || !String(rec.lawBody || '').trim()),
          needsCondenseLawBody: Boolean(normHelperForBatch?.isLawBodyOverflowing?.(rec.lawBody || '')),
          hasGarbledLaw: Boolean(ts.garbled),
          guidelineCode: ts.spec?.code || '',
          lawPriorityTier: ts.priorityTier || 'needs_ai_law',
          learnedGuidelines: (ts.needAi && Array.isArray(ts.learnedCandidates) && ts.learnedCandidates.length > 0)
            ? ts.learnedCandidates
            : undefined,
          lockedCheckboxes: {
            planMissing: Array.isArray(rec.mgmtCauses) && rec.mgmtCauses.includes('계획 미수립'),
            planNotFollowed: Array.isArray(rec.mgmtCauses) && rec.mgmtCauses.includes('계획 미이행'),
            unsafeAct: Array.isArray(rec.mgmtCauses) && rec.mgmtCauses.includes('불안전 행동'),
            unsafeCond: Array.isArray(rec.mgmtCauses) && rec.mgmtCauses.includes('불안전 상태')
          },
          cells: {
            subcontractor: rec.subcontractor || '',
            workTypeRaw: rec.workGroup || '',
            location: rec.location || '',
            content: rec.content || '',
            banner: rawSheetBanner || rec.photoBanner || '',
            lawRaw: rec.rawLaw || rec.law || '',
            lawBody: rec.lawBody || '',
            pmVerdict: rec.pmVerdictType || rec.pmVerdict || '',
            interview: rec.interviewOpinion || '',
            proposalText: rec.auditProposal || '',
            countermeasure: rec.actionPlan || rec.countermeasure || '',
            lowConfidenceFields: Array.isArray(rec.lowConfidenceFields) ? rec.lowConfidenceFields : []
          }
        };
      });

      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 60000);
      try {
        const res = await fetch(`${CLOUDFLARE_AI_URL}/api/ai-analyze`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode: 'batch_classify', items }),
          signal: ctrl.signal
        });
        clearTimeout(timer);
        if (!res.ok) {
          if (res.status === 429) {
            _cfQuotaCooldownUntil = Date.now() + 20 * 60 * 1000;
          } else {
            consecutiveFailures++;
            if (consecutiveFailures >= 2) _cfTransientBackoffUntil = Date.now() + 10 * 1000;
          }
          return false;
        }
        const data = await res.json();
        if (data?.quotaExceeded) {
          _cfQuotaCooldownUntil = Date.now() + 20 * 60 * 1000;
          return false;
        }
        if (String(data?.source || '').includes('rule') || !Array.isArray(data?.results)) {
          consecutiveFailures++;
          return false;
        }
        consecutiveFailures = 0;

        const mapByPage = new Map();
        for (const r of data.results) {
          if (r && r.pageIndex !== undefined) mapByPage.set(Number(r.pageIndex), r);
        }
        chunkRecords.forEach((rec, idx) => {
          const pKey = Number(rec.pageNumber || rec.slideNumber || (idx + 1));
          const aiItem = mapByPage.get(pKey) || data.results[idx];
          if (!aiItem) return;
          const taxFields = [
            'locationCategory', 'workGroupMid', 'workMethod',
            'agentMajor', 'agentMid', 'agentMinor',
            'hazardType', 'condition', 'action',
            'rootCauseMgmt', 'rootCauseSystem', 'stakeholder'
          ];
          for (const f of taxFields) {
            if (aiItem[f]) rec[f] = aiItem[f];
          }
          // 장표 원문 공종명을 표준 분류표(작업분류표.jpg: 공종(중) + 공종(소)) 기준으로 정규화
          const rawWorkFromSheet = String(rec._rawCellTexts?.work || '').replace(/^.*?공종명?\s*[:：.]?\s*/, '').trim();
          if (rawWorkFromSheet && rawWorkFromSheet.length >= 2) {
            rec.workGroup = cleanWorkGroup(rawWorkFromSheet, rec.content);
          } else if (rec.workGroup && (!aiItem.workGroup || rec.workGroup === 'PC공사' || rec.workGroup === '거푸집동바리공사')) {
            rec.workGroup = cleanWorkGroup(rec.workGroup, rec.content);
          } else if (aiItem.workGroup) {
            rec.workGroup = cleanWorkGroup(aiItem.workGroup, rec.content);
          } else {
            rec.workGroup = cleanWorkGroup(rec.workGroup, rec.content);
          }
          const normH = getNormHelper();
          if (normH && typeof normH.resolveWorkGroupMid === 'function') {
            rec.workGroupMid = normH.resolveWorkGroupMid(rec.workGroup, aiItem.workGroupMid || rec.workGroupMid || '', rec.content || '');
          }
          if (normH && typeof normH.inferLocationCategory === 'function') {
            rec.locationCategory = normH.inferLocationCategory(aiItem.locationCategory || rec.locationCategory || '', rec.location || '', `${rec.content || ''} ${rec.photoBanner || ''}`);
          }
          if (aiItem.guidelineApplied) {
            rec._lawSource = 'learned_guideline_qwen_verified';
          }
          // 1) AI 전수 교정(edits 또는 fixedFields: 띄어쓰기 + 스캔 오탈자 + [관련 기준] 제목/본문 교정) 우선 반영
          const aiPatchObj = (aiItem.edits && typeof aiItem.edits === 'object')
            ? aiItem.edits
            : ((aiItem.fixedFields && typeof aiItem.fixedFields === 'object') ? aiItem.fixedFields : null);
          if (!rec._visionCleaned && aiPatchObj) {
            const ff = aiPatchObj;
            const applyFixedField = (key, rawVal, cleanerFn, syncKey, maxRatio = 2.2) => {
              if (typeof rawVal !== 'string') return;
              const v = rawVal.trim();
              const orig = String(rec[key] || '').trim();
              if (!v || /\uFFFD/.test(v) || isFieldKeyLiteral(v)) return;
              if (!orig && !['rawLaw', 'lawBody', 'law', 'photoBanner'].includes(key)) return;
              const vCompactLen = v.replace(/\s+/g, '').length;
              const oCompactLen = orig.replace(/\s+/g, '').length;
              const minRatio = key === 'rawLaw' ? 0.15 : (key === 'lawBody' ? 0.25 : 0.35);
              if (oCompactLen > 0 && (vCompactLen < oCompactLen * minRatio || vCompactLen > oCompactLen * maxRatio)) return;
              const normFn = (typeof window !== 'undefined' && window.SafeTextNormalizer?.normalizeFieldText)
                ? (s) => window.SafeTextNormalizer.normalizeFieldText(s, key === 'interviewOpinion' ? 'interview' : key)
                : (s) => s;
              const normalized = normFn(healSafetyKoreanLexicon(v));
              const cleaned = cleanerFn ? cleanerFn(normalized) : normalized;
              if (cleaned && cleaned.length >= 2 && !/\uFFFD/.test(cleaned) && !isFieldKeyLiteral(cleaned)) {
                rec[key] = cleaned;
                if (syncKey) rec[syncKey] = cleaned;
              }
            };
            applyFixedField('location', ff.location, (v) => cleanLocation(v, rec.content));
            applyFixedField('content', ff.content, cleanContent);
            applyFixedField('interviewOpinion', ff.interview || ff.interviewOpinion, cleanOpinionText);
            syncParsedOpinionsOnRecord(rec);
            applyFixedField('auditProposal', ff.proposalText || ff.auditProposal, cleanProposalText);
            applyFixedField('actionPlan', ff.countermeasure || ff.actionPlan, cleanActionPlan, 'countermeasure');
            const recTierState = tierStates[idx] || {};
            const shouldCondenseBody = Boolean(normH?.isLawBodyOverflowing?.(rec.lawBody || ''));
            if (recTierState.priorityTier !== 'original_valid') {
              applyFixedField('rawLaw', ff.rawLaw || ff.lawRaw || aiItem.rawLaw, null, null, 2.8);
              applyFixedField('lawBody', ff.lawBody || aiItem.lawBody, null, null, 3.0);
            } else if (shouldCondenseBody && (ff.lawBody || aiItem.lawBody)) {
              applyFixedField('lawBody', ff.lawBody || aiItem.lawBody, null, null, 3.0);
            } else if (ff.lawBody && String(ff.lawBody).length >= String(rec.lawBody || '').length * 0.7) {
              applyFixedField('lawBody', ff.lawBody, null, null, 3.0);
            }
          }
          const rawBannerOrigBeforePatch = String(rec._rawCellTexts?.banner || rec.photoBanner || '').trim();
          if (!rec._visionCleaned && aiItem.typoPatches && window.SafeTextNormalizer?.applyTypoPatches) {
            window.SafeTextNormalizer.applyTypoPatches(rec, aiItem.typoPatches);
          }

          rec.workMethod = sanitizeWorkMethod(rec.workMethod || aiItem.workMethod, rec.workGroup, rec.content, rec.location);
          if (rec.workMethod) rec.workName = rec.workMethod;
          if (aiItem.agentMajor) { rec.kind = aiItem.agentMajor; rec.matrixArea = aiItem.agentMajor; rec.agentMajor = aiItem.agentMajor; }
          if (aiItem.agentMid) { rec.item = aiItem.agentMid; rec.matrixTarget = aiItem.agentMid; rec.agentMid = aiItem.agentMid; }
          if (aiItem.agentMinor) { rec.agent = aiItem.agentMinor; rec.matrixSpec = aiItem.agentMinor; rec.agentMinor = aiItem.agentMinor; }
          if (aiItem.hazardType && (!rec.type || (rec.type === '붕괴' && !/붕괴|도괴/.test(`${rec._rawCellTexts?.type || ''} ${rec.content || ''}`)))) {
            rec.type = String(aiItem.hazardType).split('·')[0];
          }
          const normBannerFn = (typeof window !== 'undefined' && window.SafeTextNormalizer?.normalizeFieldText)
            ? (s) => window.SafeTextNormalizer.normalizeFieldText(s, 'banner')
            : (s) => String(s || '').replace(/[\u2460-\u2487\u2776-\u277F]/g, '').trim();
          const rawBannerOrig = String(rec._rawCellTexts?.banner || rec._originalBannerText || rawBannerOrigBeforePatch || '').trim();
          const rawBannerFromSheet = normBannerFn(rawBannerOrig);
          const aiBanner = normBannerFn(String(aiItem.photoBanner || aiPatchObj?.photoBanner || aiPatchObj?.banner || '').trim());
          const hasUsefulSpaces = (s) => /\s/.test(s) || s.length < 10;
          const isTruncatedRawBanner = (s) => /\([^)]*$/.test(s) || /^[^(]*\)/.test(s) || /(?:상태로|않는|없는|하는|되는|있는)$/.test(String(s || '').trim());
          const isLocBanner = (s) => typeof window !== 'undefined' && window.SafeTextNormalizer?.isLocationOnlyBanner?.(s, rec.location);
          const isGenericAiBanner = (s) => /^(?:안전기준\s*미준수|현장\s*부적합\s*작업\s*전경|안전시설\s*불량)$/.test(String(s || '').trim());
          const hasValidOriginalSheetBanner = Boolean(
            rawBannerFromSheet &&
            !isLocBanner(rawBannerFromSheet) &&
            !isTruncatedRawBanner(rawBannerFromSheet) &&
            (normH?.isValidOriginalSheetBanner
              ? normH.isValidOriginalSheetBanner(rawBannerFromSheet, rec.content, rec.location)
              : (hasUsefulSpaces(rawBannerFromSheet) && rawBannerFromSheet.length >= 4 && rawBannerFromSheet.length <= 45))
          );
          const canUseAiBanner = Boolean(
            aiBanner && !isLocBanner(aiBanner) && !isGenericAiBanner(aiBanner) && !/\uFFFD/.test(aiBanner) &&
            aiBanner !== (rec.content || '').trim() && !isTruncatedRawBanner(aiBanner) && aiBanner.length >= 4
          );
          if (hasValidOriginalSheetBanner) {
            // [1순위] 원본 PDF/PPTX 장표에 적색 배너가 존재하고 정상 판독된 경우: AI 요약으로 덮어쓰지 않고 원본 배너 그대로 보존!
            rec.photoBanner = rawBannerFromSheet;
            rec._hasOriginalBanner = true;
            rec._originalBannerText = rawBannerFromSheet;
          } else if (rec._visionCleaned && rec.photoBanner && !isLocBanner(rec.photoBanner)) {
            rec.photoBanner = cleanBannerText(rec.photoBanner, rec.content, rec.location);
          } else if (canUseAiBanner) {
            // [2순위] 원본 장표에 적색 배너 박스가 없거나 OCR이 깨진 경우에만 AI가 부적합 내용에서 도출한 배너 적용
            rec.photoBanner = cleanBannerText(aiBanner, rec.content, rec.location) || aiBanner;
          } else if (rawBannerFromSheet && !isLocBanner(rawBannerFromSheet)) {
            rec.photoBanner = cleanBannerText(rawBannerFromSheet, rec.content, rec.location);
          } else {
            rec.photoBanner = summarizeContentToBanner(rec.content);
          }
          const recTierForLaw = tierStates[idx] || {};
          if (typeof aiItem.guidelineApplied === 'boolean') {
            rec.guidelineApplied = aiItem.guidelineApplied;
          }
          if (recTierForLaw.priorityTier !== 'original_valid' || !rec.law || !rec.rawLaw || !rec.lawBody || normH?.isLawBodyOverflowing?.(rec.lawBody || '')) {
            if (aiItem.law && !/^(?:산업안전보건(?:기준에\s*관한\s*)?규칙|안전보건규칙)$/.test(String(aiItem.law).trim())) {
              if (recTierForLaw.priorityTier !== 'original_valid' || !rec.law) {
                rec.law = aiItem.law;
                if (!rec.rawLaw || recTierForLaw.priorityTier !== 'original_valid') rec.rawLaw = aiItem.law;
                if (rec.basis) rec.basis.law = aiItem.law;
              }
            }
            if (aiItem.lawBody && (!rec.lawBody || recTierForLaw.priorityTier !== 'original_valid' || normH?.isLawBodyOverflowing?.(rec.lawBody || ''))) {
              rec.lawBody = (recTierForLaw.priorityTier === 'original_valid')
                ? String(aiItem.lawBody).trim()
                : ((normH && typeof normH.stripGuidelinePrefixes === 'function')
                    ? normH.stripGuidelinePrefixes(aiItem.lawBody)
                    : String(aiItem.lawBody).trim());
            }
          }
          // 깨진 OCR 배너가 잔존해 있으면 최종 제거 후 content 기반 요약으로 대체
          const normChk = getNormHelper();
          if (rec.photoBanner && normChk && (normChk.hasGarbledKoreanNoise?.(rec.photoBanner) || normChk.isGarbledBannerText?.(rec.photoBanner))) {
            rec.photoBanner = summarizeContentToBanner(rec.content);
          }
          const finalLawState = resolveLawWithTieredMemory(rec);
          if (!finalLawState.needAi && rec.rawLaw && rec.lawBody) {
            getGuidelineMemory()?.learnFromRecord?.(rec, 'ai_batch');
          }
          rec._aiCleaned = true;
          rec._aiBatchSuccess = true;
        });
        return true;
      } catch (e) {
        clearTimeout(timer);
        consecutiveFailures++;
        if (consecutiveFailures >= 2) _cfTransientBackoffUntil = Date.now() + 10 * 1000;
        console.warn('[SafePatrol] classifyBatchRecords chunk warning:', e);
        return false;
      }
    };

    const MAX_PER_REQ = 2;
    let anySuccess = false;
    for (let i = 0; i < records.length; i += MAX_PER_REQ) {
      if (Date.now() < _cfQuotaCooldownUntil) break;
      const ok = await runSingleBatchChunk(records.slice(i, i + MAX_PER_REQ));
      if (ok) anySuccess = true;
    }

    // [v62] 자동 재시도: 1차 배치 실패 또는 관련기준 제목(law)/본문(lawBody) 중 하나라도 공란인 건은 1~2건 단위로 1회 재요청
    if (Date.now() >= _cfQuotaCooldownUntil) {
      const retryTargets = records.filter(r =>
        r && String(r.content || '').trim() &&
        (!r._aiBatchSuccess || !String(r.law || r.rawLaw || '').trim() || !String(r.lawBody || '').trim())
      );
      if (retryTargets.length > 0) {
        _cfTransientBackoffUntil = 0;
        for (let i = 0; i < retryTargets.length; i += 2) {
          if (Date.now() < _cfQuotaCooldownUntil) break;
          const ok = await runSingleBatchChunk(retryTargets.slice(i, i + 2));
          if (ok) anySuccess = true;
        }
      }
    }

    return applyLocalTaxonomyToRecords(records, { preserveAiFields: anySuccess });
  }

  /**
   * [v2.0 신규] 현장 직접 등록 모드(Guided Complete): 1줄 핵심 키워드로 부적합 개요·법규·인터뷰·대책 자동 완성
   */
  async function completeGuidedRecord({ memo = '', workGroup = '거푸집동바리공사', workMethod = '설치해체작업', severity = '중부적합' } = {}) {
    try {
      const res = await fetch(`${CLOUDFLARE_AI_URL}/api/ai-analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'guided_complete', memo, workGroup, workMethod, severity })
      });
      if (res.ok) {
        return await res.json();
      }
    } catch (e) {}
    return quickRuleAnalysis(`${workGroup} ${workMethod} ${memo}`);
  }

  /**
   * [v3.0 신규] 등록 전 AI 최종 검증 게이트(Pre-Save QA)
   * - 오탈자, 띄어쓰기, 사진 요약 완결성, 대한민국 산업안전보건법 관련기준, 분류 일치 여부를 등록 직전 AI로 전수 검증·교정
   */
  async function verifyRecordsBeforeSave(records = [], onProgress = null) {
    if (!Array.isArray(records) || records.length === 0) {
      return { ok: true, records: [], modifiedCount: 0, source: 'empty', quotaExceeded: false };
    }
    const norm = typeof window !== 'undefined' ? window.SafeTextNormalizer : null;
    const applySurfacePolish = (rec) => {
      if (!rec || typeof rec !== 'object') return false;
      const beforeSnap = JSON.stringify([
        rec.photoBanner, rec.content, rec.location, rec.inspectRound, rec.law, rec.rawLaw,
        rec.lawBody, rec.interviewOpinion, rec.auditProposal, rec.actionPlan
      ]);
      rec.workGroup = cleanWorkGroup(rec.workGroup || '', rec.content || '') || rec.workGroup || '';
      rec.workMethod = sanitizeWorkMethod(rec.workMethod || rec.workName, rec.workGroup, rec.content, rec.location) || rec.workMethod || '';
      if (rec.workMethod) rec.workName = rec.workMethod;
      if (rec.inspectRound && norm?.normalizeRoundText) {
        rec.inspectRound = norm.normalizeRoundText(rec.inspectRound);
      }
      if (norm?.normalizeFieldText) {
        if (rec.content) rec.content = norm.normalizeFieldText(rec.content, 'content');
        if (rec.location) rec.location = cleanLocation(norm.normalizeFieldText(rec.location, 'location'), rec.content) || rec.location;
        // 사용자가 직접 입력한 레코드(_manualEntry)의 인터뷰 의견·점검단 제안·개선대책은 입력 원문을 100% 그대로 보존
        if (!rec._manualEntry) {
          if (rec.interviewOpinion) rec.interviewOpinion = cleanOpinionText(norm.normalizeFieldText(rec.interviewOpinion, 'interview'));
          if (rec.auditProposal) rec.auditProposal = cleanProposalText(norm.normalizeFieldText(rec.auditProposal, 'proposalText'));
          if (rec.actionPlan) {
            rec.actionPlan = cleanActionPlan(norm.normalizeFieldText(rec.actionPlan, 'actionPlan'));
            rec.countermeasure = rec.actionPlan;
          }
        }
      }
      if (rec.photoBanner) {
        rec.photoBanner = cleanBannerText(rec.photoBanner, rec.content, rec.location) || rec.photoBanner;
      }
      syncParsedOpinionsOnRecord(rec);
      const lawRes = resolveLawWithTieredMemory(rec);
      if (!lawRes.needAi && rec.rawLaw && rec.lawBody) {
        getGuidelineMemory()?.learnFromRecord?.(rec, rec._aiVerifySource || 'verified');
      }
      const afterSnap = JSON.stringify([
        rec.photoBanner, rec.content, rec.location, rec.inspectRound, rec.law, rec.rawLaw,
        rec.lawBody, rec.interviewOpinion, rec.auditProposal, rec.actionPlan
      ]);
      return beforeSnap !== afterSnap;
    };

    const forceLocal = storage.getItem('sp_ai_provider') === 'local';
    let usedAi = false;
    let quotaExceeded = false;
    let modifiedCount = 0;

    if (!forceLocal && Date.now() >= _cfQuotaCooldownUntil && Date.now() >= _cfTransientBackoffUntil) {
      const CHUNK_SIZE = 2;
      for (let start = 0; start < records.length; start += CHUNK_SIZE) {
        const chunk = records.slice(start, start + CHUNK_SIZE);
        if (typeof onProgress === 'function') {
          onProgress(`🤖 AI 최종 검증·오타/띄어쓰기 교정 중 (${Math.min(start + chunk.length, records.length)}/${records.length})...`);
        }
        const chunkLawStates = chunk.map(rec => resolveLawWithTieredMemory(rec));
        const items = chunk.map((rec, localIdx) => {
          const st = chunkLawStates[localIdx] || {};
          const rawSheetBanner = rec._rawCellTexts?.banner || rec._originalBannerText || '';
          const hasOriginalBanner = Boolean(
            rec._hasOriginalBanner ||
            (rawSheetBanner && norm?.isValidOriginalSheetBanner?.(rawSheetBanner, rec.content, rec.location))
          );
          return {
            pageIndex: rec.pageNumber || rec.slideNumber || (start + localIdx + 1),
            hasOriginalBanner,
            workGroup: rec.workGroup || '',
            workMethod: rec.workMethod || rec.workName || '',
            type: rec.type || '',
            photoBanner: rec.photoBanner || '',
            content: rec.content || '',
            location: rec.location || '',
            subcontractor: rec.subcontractor || '',
            inspectRound: rec.inspectRound || '',
            law: rec.law || '',
            rawLaw: rec.rawLaw || '',
            lawBody: rec.lawBody || '',
            needsAiLaw: Boolean(st.needAi || !String(rec.law || rec.rawLaw || '').trim() || !String(rec.lawBody || '').trim()),
            needsCondenseLawBody: Boolean(norm?.isLawBodyOverflowing?.(rec.lawBody || '')),
            hasGarbledLaw: Boolean(st.garbled),
            guidelineCode: st.spec?.code || '',
            lawPriorityTier: st.priorityTier || 'needs_ai_law',
            interviewOpinion: rec.interviewOpinion || '',
            auditProposal: rec.auditProposal || '',
            actionPlan: rec.actionPlan || rec.countermeasure || '',
            pmVerdict: rec.pmVerdictType || rec.pmVerdict || ''
          };
        });

        try {
          const ctrl = new AbortController();
          const timer = setTimeout(() => ctrl.abort(), 60000);
          const res = await fetch(`${CLOUDFLARE_AI_URL}/api/ai-analyze`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mode: 'verify_review', items }),
            signal: ctrl.signal
          });
          clearTimeout(timer);
          if (!res.ok) {
            if (res.status === 429) _cfQuotaCooldownUntil = Date.now() + 20 * 60 * 1000;
            else _cfTransientBackoffUntil = Date.now() + 10 * 1000;
            break;
          }
          const data = await res.json();
          if (data?.quotaExceeded) {
            quotaExceeded = true;
            _cfQuotaCooldownUntil = Date.now() + 20 * 60 * 1000;
            break;
          }
          if (Array.isArray(data?.results)) {
            if (data.source === 'qwen3_30b_verify') usedAi = true;
            chunk.forEach((rec, localIdx) => {
              const targetPage = rec.pageNumber || rec.slideNumber || (start + localIdx + 1);
              const aiRes = data.results.find(r => Number(r?.pageIndex) === Number(targetPage)) || data.results[localIdx];
              if (!aiRes || typeof aiRes !== 'object') return;
              const beforeStr = JSON.stringify([
                rec.workGroup, rec.workMethod, rec.type, rec.photoBanner,
                rec.content, rec.location, rec.inspectRound, rec.law, rec.rawLaw, rec.lawBody,
                rec.interviewOpinion, rec.auditProposal, rec.actionPlan
              ]);
              const corr = (aiRes.corrections && typeof aiRes.corrections === 'object') ? aiRes.corrections : {};
              const candLocCat = corr.locationCategory || aiRes.locationCategory;
              if (candLocCat && typeof candLocCat === 'string') rec.locationCategory = candLocCat.trim();
              const candWgMid = corr.workGroupMid || aiRes.workGroupMid;
              if (candWgMid && typeof candWgMid === 'string') rec.workGroupMid = candWgMid.trim();
              const candAgMaj = corr.agentMajor || aiRes.agentMajor;
              if (candAgMaj && typeof candAgMaj === 'string') { rec.agentMajor = candAgMaj.trim(); rec.kind = rec.agentMajor; rec.matrixArea = rec.agentMajor; }
              const candAgMid = corr.agentMid || aiRes.agentMid;
              if (candAgMid && typeof candAgMid === 'string') { rec.agentMid = candAgMid.trim(); rec.item = rec.agentMid; rec.matrixTarget = rec.agentMid; }
              const candAgMin = corr.agentMinor || aiRes.agentMinor;
              if (candAgMin && typeof candAgMin === 'string') { rec.agentMinor = candAgMin.trim(); rec.agent = rec.agentMinor; rec.matrixSpec = rec.agentMinor; }
              const candWorkGroup = corr.workGroup || aiRes.workGroup;
              if (candWorkGroup && typeof candWorkGroup === 'string') {
                const mappedWg = cleanWorkGroup(candWorkGroup, rec.content);
                if (mappedWg) rec.workGroup = mappedWg;
              }
              const candWorkMethod = corr.workMethod || aiRes.workMethod;
              if (candWorkMethod && typeof candWorkMethod === 'string') {
                const sanWm = sanitizeWorkMethod(candWorkMethod, rec.workGroup, rec.content, rec.location);
                if (sanWm) { rec.workMethod = sanWm; rec.workName = sanWm; }
              }
              const candType = corr.hazardType || corr.type || aiRes.hazardType;
              if (candType && typeof candType === 'string' && !/\uFFFD/.test(candType)) {
                rec.type = candType.split('·')[0].trim();
              }
              const candBanner = corr.photoBanner || aiRes.photoBanner;
              const rawSheetB = String(rec._rawCellTexts?.banner || rec._originalBannerText || '').trim();
              const hasOrigBanner = Boolean(
                rec._hasOriginalBanner ||
                (rawSheetB && norm?.isValidOriginalSheetBanner?.(rawSheetB, rec.content, rec.location)) ||
                (rec.photoBanner && norm?.isValidOriginalSheetBanner?.(rec.photoBanner, rec.content, rec.location))
              );
              if (!hasOrigBanner && candBanner && typeof candBanner === 'string' && !/\uFFFD/.test(candBanner) && !isFieldKeyLiteral(candBanner)) {
                const normalizedBanner = cleanBannerText(candBanner, rec.content, rec.location) || candBanner;
                if (normalizedBanner.length >= 4 && (!norm?.isLocationOnlyBanner?.(normalizedBanner, rec.location))) {
                  rec.photoBanner = normalizedBanner;
                }
              }
              const recLawState = chunkLawStates[localIdx] || {};
              const preserveOrigTitle = recLawState.priorityTier === 'original_valid' && /지침|IZ12B/i.test(rec.rawLaw || '');
              const candLaw = corr.law || aiRes.law;
              if (candLaw && typeof candLaw === 'string' && !/\uFFFD/.test(candLaw) && !/^(?:산업안전보건(?:기준에\s*관한\s*)?규칙|안전보건규칙)$/.test(candLaw.trim())) {
                if (!preserveOrigTitle || !rec.law) {
                  rec.law = healSafetyKoreanLexicon(candLaw.trim());
                  if (rec.basis) rec.basis.law = rec.law;
                }
              }
              const candRawLaw = corr.rawLaw || aiRes.rawLaw;
              if (candRawLaw && typeof candRawLaw === 'string' && !/\uFFFD/.test(candRawLaw) && !isFieldKeyLiteral(candRawLaw)) {
                const cleanedCandTitle = healSafetyKoreanLexicon(candRawLaw.trim());
                if (!preserveOrigTitle || /지침|IZ12B/i.test(cleanedCandTitle)) {
                  rec.rawLaw = cleanedCandTitle;
                }
              }
              if (recLawState.needAi && rec.law && !rec.rawLaw) {
                rec.rawLaw = rec.law;
              } else if (recLawState.needAi && rec.rawLaw && !rec.law) {
                rec.law = rec.rawLaw;
              }
              const candLawBody = corr.lawBody || aiRes.lawBody;
              if (candLawBody && typeof candLawBody === 'string' && !/\uFFFD/.test(candLawBody) && !isFieldKeyLiteral(candLawBody)) {
                const healedBody = norm?.normalizeSafetyLawBody ? norm.normalizeSafetyLawBody(candLawBody) : healSafetyKoreanLexicon(candLawBody.trim());
                const wasOverflowing = Boolean(norm?.isLawBodyOverflowing?.(rec.lawBody || ''));
                if (!preserveOrigTitle || wasOverflowing || healedBody.length >= String(rec.lawBody || '').length * 0.7) {
                  rec.lawBody = healedBody;
                }
              }
              if (typeof corr.content === 'string' && corr.content.trim() && !/\uFFFD/.test(corr.content)) rec.content = cleanContent(corr.content);
              if (typeof corr.location === 'string' && corr.location.trim() && !/\uFFFD/.test(corr.location)) rec.location = cleanLocation(corr.location, rec.content);
              if (!rec._manualEntry) {
                if (typeof corr.interviewOpinion === 'string' && corr.interviewOpinion.trim()) {
                  rec.interviewOpinion = cleanOpinionText(corr.interviewOpinion);
                  syncParsedOpinionsOnRecord(rec);
                }
                if (typeof corr.auditProposal === 'string' && corr.auditProposal.trim()) rec.auditProposal = cleanProposalText(corr.auditProposal);
                if (typeof corr.actionPlan === 'string' && corr.actionPlan.trim()) {
                  rec.actionPlan = cleanActionPlan(corr.actionPlan);
                  rec.countermeasure = rec.actionPlan;
                }
              }
              if (typeof corr.subcontractor === 'string' && !/\uFFFD/.test(corr.subcontractor)) rec.subcontractor = corr.subcontractor.trim();
              if (typeof corr.inspectRound === 'string' && corr.inspectRound.trim()) {
                rec.inspectRound = norm?.normalizeRoundText ? norm.normalizeRoundText(corr.inspectRound.trim()) : corr.inspectRound.trim();
              }

              applySurfacePolish(rec);
              rec._aiVerified = true;
              rec._aiVerifySource = data.source || 'qwen3_30b_verify';
              rec._aiVerifyIssues = Array.isArray(aiRes.issues) ? aiRes.issues : [];
              if (!rec._needsAiLaw && rec.rawLaw && rec.lawBody) {
                getGuidelineMemory()?.learnFromRecord?.(rec, 'ai_verified');
              }
              const afterStr = JSON.stringify([
                rec.workGroup, rec.workMethod, rec.type, rec.photoBanner,
                rec.content, rec.location, rec.inspectRound, rec.law, rec.rawLaw, rec.lawBody,
                rec.interviewOpinion, rec.auditProposal, rec.actionPlan
              ]);
              if (beforeStr !== afterStr) modifiedCount++;
            });
          }
        } catch (err) {
          _cfTransientBackoffUntil = Date.now() + 15 * 1000;
          console.warn('[SafePatrol] verifyRecordsBeforeSave fallback:', err);
          break;
        }
      }
    }

    records.forEach((rec) => {
      if (!rec._aiVerified) {
        if (applySurfacePolish(rec)) modifiedCount++;
        rec._aiVerified = true;
        rec._aiVerifySource = 'local_normalizer';
      }
    });

    return {
      ok: true,
      records,
      modifiedCount,
      source: usedAi ? 'qwen3_30b_verify' : 'local_normalizer',
      quotaExceeded
    };
  }

  /**
   * [v60] PDF·PPTX·이미지 등록(Import) 시 누락·오분류 표준분류 / 공란 관련기준 / 깨진 배너 / 미교정 OCR 자동 보완
   * - 엑셀 다운로드 시가 아닌 PDF 등록 단계에서 즉시 AI로 전수 완결!
   */
  async function repairMissingFieldsOnImport(records = [], onProgress = () => {}) {
    if (!Array.isArray(records) || !records.length) return { enrichedCount: 0, records };
    const norm = getNormHelper();
    const validLocs = new Set((norm && norm.STANDARD_LOCATION_CATEGORIES) || []);
    const validWgMids = new Set((norm && norm.WORK_GROUP_MID_LIST) || []);
    const validMethods = new Set((norm && norm.WORK_METHODS_9X9_IMPROVED) || []);
    const isNeedsEnrich = (r) => {
      if (!r || !String(r.content || '').trim()) return false;
      const locCat = String(r.locationCategory || '').trim();
      const wgMid = String(r.workGroupMid || '').trim();
      const wg = String(r.workGroup || '').trim();
      const wm = String(r.workMethod || r.workName || '').trim();
      const law = String(r.law || r.rawLaw || (r.basis && r.basis.law) || '').trim();
      const lawBody = String(r.lawBody || '').trim();
      const banner = String(r.photoBanner || '').trim();
      const agMaj = String(r.agentMajor || r.kind || '').trim();
      const agMid = String(r.agentMid || r.item || '').trim();
      const isWallTieArt56Mix = /제56조|작업발판의\s*구조/.test(law) && /(?:벽이음|벽버팀|가새|밑둥잡이)/.test(`${r.content || ''} ${lawBody}`) && !/작업발판/.test(r.content || '');
      const hasPastTenseBody = /(?:이루어지지\s*않았다|확보되지\s*않았다|설치되지\s*않았다)/.test(lawBody);
      const isOverflowBody = Boolean(norm?.isLawBodyOverflowing?.(lawBody));
      const isBadLaw = !law || !lawBody || /^(?:산업안전보건(?:기준에\s*관한\s*)?규칙|안전보건규칙)$/.test(law) ||
        Boolean(norm?.hasGarbledKoreanNoise?.(law)) ||
        (/고소작업대/.test(r.content || '') && /제56조|작업발판/.test(law)) ||
        isWallTieArt56Mix ||
        hasPastTenseBody ||
        isOverflowBody;
      const isBadBanner = !banner || /^\./.test(banner) || /\r|\n/.test(banner) ||
        Boolean(norm?.hasGarbledKoreanNoise?.(banner)) ||
        Boolean(norm?.isGarbledBannerText?.(banner));
      const isBadAgent = !agMaj || !agMid || agMaj === '작업장·통로' || agMaj === 'PPE' || agMaj === '작업장' ||
        (/고소작업대/.test(r.content || '') && agMid !== '탑승장비');
      return (
        !r._aiBatchSuccess ||
        !locCat || (validLocs.size > 0 && !validLocs.has(locCat)) ||
        !wgMid || (validWgMids.size > 0 && !validWgMids.has(wgMid)) ||
        !wg ||
        !wm || (validMethods.size > 0 && !validMethods.has(wm)) ||
        isBadAgent ||
        isBadLaw ||
        isBadBanner
      );
    };

    const targets = records.filter(isNeedsEnrich);
    if (!targets.length) return { enrichedCount: 0, records };

    let enrichedCount = 0;
    const CHUNK = 2;
    for (let i = 0; i < targets.length; i += CHUNK) {
      const chunk = targets.slice(i, i + CHUNK);
      onProgress(`🤖 PDF 등록 시 AI 누락 분류·관련기준·띄어쓰기 보완 중... (${Math.min(i + chunk.length, targets.length)}/${targets.length}건)`);
      chunk.forEach((rec) => {
        const isWallTieMix = /제56조|작업발판의\s*구조/.test(`${rec.law || ''} ${rec.rawLaw || ''}`) &&
          /(?:벽이음|벽버팀|가새|밑둥잡이)/.test(`${rec.content || ''} ${rec.lawBody || ''}`) &&
          !/작업발판/.test(rec.content || '');
        if ((/고소작업대/.test(rec.content || '') && /제56조|작업발판/.test(`${rec.law || ''} ${rec.rawLaw || ''}`)) || isWallTieMix) {
          rec.law = '';
          rec.rawLaw = '';
          rec.lawBody = '';
        }
        if (/(?:이루어지지\s*않았다|확보되지\s*않았다|설치되지\s*않았다)/.test(rec.lawBody || '')) {
          rec.lawBody = '';
        }
        if (rec.photoBanner && (/^\./.test(rec.photoBanner) || norm?.hasGarbledKoreanNoise?.(rec.photoBanner) || norm?.isGarbledBannerText?.(rec.photoBanner))) {
          rec.photoBanner = '';
        }
      });
      try {
        await classifyBatchRecords(chunk);
        chunk.forEach((rec) => {
          if (rec.law && rec.basis) rec.basis.law = rec.law;
          if (rec.workMethod) rec.workName = rec.workMethod;
          if (rec.agentMajor) { rec.kind = rec.agentMajor; rec.matrixArea = rec.agentMajor; }
          if (rec.agentMid) { rec.item = rec.agentMid; rec.matrixTarget = rec.agentMid; }
          if (rec.agentMinor) { rec.agent = rec.agentMinor; rec.matrixSpec = rec.agentMinor; }
        });
        enrichedCount += chunk.length;
      } catch (e) {
        console.warn('[SafePatrol] repairMissingFieldsOnImport chunk fallback:', e);
        break;
      }
    }
    return { enrichedCount, records };
  }

  // 하위 호환 별칭 (실제 호출은 PDF/장표 등록 시점에만 수행)
  const enrichMissingRecordsForExcel = repairMissingFieldsOnImport;

  /**
   * [v59] 학습된 안전작업지침 저장소(SafeGuidelineMemory) AI 자동 품질 검수 및 부적합·오타·불완전 지침 자동 필터링
   * - 사용자 수동 삭제 불필요: 로컬 품질 게이트(pruneInvalid) + 클라우드 AI(filter_guidelines)가 맞지 않는 지침을 자동 영구 제거
   */
  let _guidelineAuditInFlight = null;
  async function auditAndFilterGuidelinesWithAI(options = {}) {
    const mem = getGuidelineMemory();
    if (!mem || typeof mem.getAll !== 'function') return { ok: true, removed: 0, updated: 0 };
    const localRemoved = typeof mem.pruneInvalid === 'function' ? mem.pruneInvalid() : 0;
    const allEntries = mem.getAll();
    const unverified = allEntries.filter(e => e && e.key && (!e.aiVerified || options.forceAll));
    if (!unverified.length) {
      return { ok: true, removed: localRemoved, updated: 0 };
    }
    const forceLocal = storage.getItem('sp_ai_provider') === 'local';
    if (forceLocal || Date.now() < _cfQuotaCooldownUntil || Date.now() < _cfTransientBackoffUntil) {
      return { ok: true, removed: localRemoved, updated: 0 };
    }
    if (_guidelineAuditInFlight) return _guidelineAuditInFlight;

    _guidelineAuditInFlight = (async () => {
      let totalRemoved = localRemoved;
      let totalUpdated = 0;
      const CHUNK = 12;
      for (let i = 0; i < unverified.length; i += CHUNK) {
        const chunk = unverified.slice(i, i + CHUNK).map(e => ({
          key: e.key,
          code: e.code || '',
          title: e.title || '',
          body: e.body || '',
          domain: e.domain || ''
        }));
        try {
          const ctrl = new AbortController();
          const timer = setTimeout(() => ctrl.abort(), 18000);
          const res = await fetch(`${CLOUDFLARE_AI_URL}/api/ai-analyze`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mode: 'filter_guidelines', guidelines: chunk }),
            signal: ctrl.signal
          });
          clearTimeout(timer);
          if (!res.ok) break;
          const data = await res.json();
          if (data?.quotaExceeded) {
            _cfQuotaCooldownUntil = Date.now() + 20 * 60 * 1000;
            break;
          }
          if (Array.isArray(data?.results) && typeof mem.applyAiAuditResults === 'function') {
            const applied = mem.applyAiAuditResults(data.results);
            totalRemoved += (applied.removed || 0);
            totalUpdated += (applied.updated || 0);
          }
        } catch (err) {
          console.warn('[SafePatrol] auditAndFilterGuidelinesWithAI error:', err);
          break;
        }
      }
      return { ok: true, removed: totalRemoved, updated: totalUpdated };
    })().finally(() => {
      _guidelineAuditInFlight = null;
    });

    return _guidelineAuditInFlight;
  }

  /**
   * [v62] 관련기준 본문이 11pt 3줄 박스를 초과하거나 제목/본문이 누락된 레코드를 PPT 생성 직전 AI로 자연 축약·보완
   */
  async function condenseOverflowLawBodiesWithAI(records = []) {
    if (!Array.isArray(records) || !records.length) return records;
    const forceLocal = storage.getItem('sp_ai_provider') === 'local';
    if (forceLocal || isQuotaCoolingDown()) return records;
    const norm = getNormHelper();
    const targets = records.filter(r => {
      if (!r || typeof r !== 'object') return false;
      const body = String(r.lawBody || '').trim();
      const title = String(r.rawLaw || r.law || '').trim();
      const overflowing = Boolean(body && norm?.isLawBodyOverflowing?.(body));
      const missingTitleWithBody = Boolean(!title && body);
      return overflowing || missingTitleWithBody;
    });
    if (!targets.length) return records;

    const CHUNK = 4;
    for (let i = 0; i < targets.length; i += CHUNK) {
      const chunk = targets.slice(i, i + CHUNK);
      const items = chunk.map((r, idx) => ({
        id: String(r.id || `rec_${i + idx}`),
        lawTitle: String(r.rawLaw || r.law || '').trim(),
        lawBody: String(r.lawBody || '').trim(),
        content: String(r.content || '').trim()
      }));
      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 30000);
        const res = await fetch(`${CLOUDFLARE_AI_URL}/api/ai-analyze`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode: 'condense_law', items }),
          signal: ctrl.signal
        });
        clearTimeout(timer);
        if (!res.ok) continue;
        const data = await res.json();
        if (data?.ok && Array.isArray(data.results)) {
          chunk.forEach((rec, idx) => {
            const key = String(rec.id || `rec_${i + idx}`);
            const hit = data.results.find(x => String(x?.id) === key) || data.results[idx];
            if (!hit) return;
            if (hit.lawBody && hit.lawBody.length >= 12) {
              rec.lawBody = norm?.normalizeSafetyLawBody ? norm.normalizeSafetyLawBody(hit.lawBody) : hit.lawBody;
            }
            if (hit.lawTitle && !String(rec.rawLaw || rec.law || '').trim()) {
              rec.rawLaw = hit.lawTitle;
              rec.law = hit.lawTitle;
            }
          });
        }
      } catch (_) {}
    }
    return records;
  }

  return {
    checkConnection,
    quickRuleAnalysis,
    shouldAutoUseVision,
    streamAnalyzeSafetyText,
    cleanOcrRecord,
    classifyBatchRecords,
    verifyRecordsBeforeSave,
    repairMissingFieldsOnImport,
    enrichMissingRecordsForExcel,
    condenseOverflowLawBodiesWithAI,
    auditAndFilterGuidelinesWithAI,
    isQuotaCoolingDown,
    completeGuidedRecord,
    getEndpoint: () => currentEndpoint,
    setEndpoint: ep => { currentEndpoint = ep; storage.setItem('sp_lmstudio_endpoint', ep); },
    setModel: m => { currentModel = m; storage.setItem('sp_lmstudio_model', m); },
    getModel: () => currentModel,
    isConnected: () => isConnected
  };
});

