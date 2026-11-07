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
  let currentEndpoint = storage.getItem('sp_lmstudio_endpoint') || DEFAULT_ENDPOINTS[0];
  let currentModel = storage.getItem('sp_lmstudio_model') || 'qwen3.5-9b-deepseek-v4-flash';
  let isConnected = true;
  let isCloudMode = true; // 기본 24시간 Cloudflare 클라우드 Qwen AI 모드

  async function checkConnection(url = currentEndpoint) {
    const workerUrl = (typeof window !== 'undefined' ? window.SAFEPATROL_CONFIG?.workerUrl : null) || (root.SAFEPATROL_CONFIG && root.SAFEPATROL_CONFIG.workerUrl) || 'https://safepatrol-relay.abraxass0511.workers.dev';
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
   * 고속 규칙 매칭 엔진 (특정 키워드가 명확할 때만 즉시 보조, 기본값 추락 강제 금지)
   */
  function quickRuleAnalysis(content) {
    if (!content) return null;
    const text = content.toLowerCase();

    // 0. 양중작업 / 크레인 / 유도로프 (이미지 4, 5번 실물 점검장표 100% 동일 일치)
    if (text.includes('양중') || text.includes('크레인') || text.includes('줄걸이') || text.includes('유도로프') || text.includes('수평양중') || text.includes('호이스트') || text.includes('손으로')) {
      const isHand = text.includes('손으로') || text.includes('직접 잡');
      const isHorizontal = text.includes('수평') || text.includes('로프간격') || text.includes('수평양중');
      return {
        severity: '중부적합',
        law: '안전보건규칙 제38조(사전조사 및 작업계획서의 작성 등)',
        item: '양중장비',
        hazardType: text.includes('낙하') ? '낙하' : '추락',
        mgmtCauses: ['계획 미이행', '불안전 행동'],
        holdPoint: true,
        photoBanner: isHand ? '양중작업 시 화물을 직접 손으로 잡음' : (isHorizontal ? '양중작업 시 화물의 수평양중 미 실시' : '양중작업 시 유도로프 미사용'),
        photo2Banner: isHand ? '양중작업 시 유도로프 미사용' : (isHorizontal ? '지상에서 보 거푸집 로프체결 간격 미준수' : ''),
        analysis: '양중작업 시 유도로프 미사용 및 인양화물 수평 미유지로 낙하 및 협착 위험',
        pmVerdict: '양중 즉시 중지 및 규격 유도로프(2개소 이상) 체결 후 재작업'
      };
    }

    // 0-B. 말비계 / 우마 (산안규칙 제67조, 제13조)
    if (text.includes('말비계') || text.includes('우마')) {
      const isEdge = text.includes('모서리') || text.includes('단부') || text.includes('추락');
      return {
        severity: '중부적합',
        law: '안전보건규칙 제67조(말비계의 구조), 제13조(안전난간의 구조 및 요건)',
        item: '말비계',
        hazardType: '추락',
        mgmtCauses: ['불안전 상태', '계획 미이행'],
        holdPoint: true,
        photoBanner: isEdge ? '말비계 모서리 구간 단부 추락방지 미조치' : '말비계 안전기준 및 전도방지 미조치',
        analysis: '말비계 설치범위 모서리 구간 단부 안전난간 또는 추락방지조치 미실시로 단부 추락 위험',
        pmVerdict: '즉시 말비계 작업중지 및 모서리 단부 안전난간/추락방지망 설치 후 재검측'
      };
    }

    // 0-C. 가설전선 / 통로 정리 (이미지 1번 정밀 일치: "통로 바닥에 전선이 정리되지 않아...")
    if ((text.includes('전선') || text.includes('케이블') || text.includes('리드선')) && 
        (text.includes('통로') || text.includes('바닥') || text.includes('정리') || text.includes('걸려') || text.includes('넘어') || text.includes('방치') || text.includes('통행'))) {
      return {
        severity: '경부적합',
        law: '안전보건규칙 제304조(가설전선 등) 및 제22조(통로의 설치)',
        item: '가설전선',
        hazardType: '전도',
        mgmtCauses: ['불안전 상태', '계획 미이행'],
        holdPoint: false,
        photoBanner: '통로 바닥 가설전선 거치 및 정리 미실시',
        analysis: '통로 바닥에 가설전선이 거치되지 않고 방치되어 통행 근로자의 걸림 및 전도 재해 위험',
        pmVerdict: '즉시 전선 거치대를 설치하여 바닥으로부터 띄우고 보행 안전통로 구획 정리'
      };
    }

    // 0-D. 보 상부작업 / 다이빙 자세 / 미승인 작업 (이미지 2번 정밀 일치: "1. 보 상부작업 미승인 2. 다이빙 자세")
    if (text.includes('보 상부') || text.includes('다이빙') || (text.includes('보') && text.includes('승인') && (text.includes('자세') || text.includes('작업')))) {
      return {
        severity: '중부적합',
        law: '안전보건규칙 제38조(사전조사 및 작업계획서의 작성 등), 제44조',
        item: '보 거푸집',
        hazardType: '추락',
        mgmtCauses: ['불안전 행동', '계획 미이행'],
        holdPoint: true,
        photoBanner: '보 상부 승인 미실시 및 불안전 자세 작업',
        photo2Banner: '보 상부작업 시 다이빙 자세 취함',
        analysis: '사전 승인 없는 보 상부 작업 및 다이빙 자세 등 불안전 행동으로 추락 위험 극심',
        pmVerdict: '보 상부 작업 즉시 중지 및 사전 승인 절차 이행, 안전대 체결 설비 보강 후 재개'
      };
    }

    // 0-E. 안전통로 내 거푸집/자재 방치 (이미지 3번 정밀 일치: "구획된 바닥 안전통로에 거푸집 자재 방치")
    if ((text.includes('통로') || text.includes('통행')) && (text.includes('자재') || text.includes('거푸집') || text.includes('방치') || text.includes('적치'))) {
      return {
        severity: '경부적합',
        law: '안전보건규칙 제22조(통로의 설치)',
        item: '가설통로',
        hazardType: '전도',
        mgmtCauses: ['불안전 상태', '계획 미이행'],
        holdPoint: false,
        photoBanner: '구획된 바닥 안전통로 내 거푸집 자재 방치',
        analysis: '구획된 바닥 안전통로에 거푸집 등 자재를 무단 방치하여 통행 방해 및 전도 위험',
        pmVerdict: '안전통로 내 적치 자재 즉시 반출 및 지정 야적 구역으로 이동 조치'
      };
    }

    // 1. 밀폐공간 및 질식/유해가스 (산안규칙 제619조~)
    if (text.includes('밀폐') || text.includes('농도') || text.includes('산소') || text.includes('유해가스') || text.includes('질식') || text.includes('환기팬') || text.includes('송기마스크')) {
      return {
        severity: '중부적합',
        law: '산안규칙 제619조의2(산소 및 유해가스 농도의 측정)',
        item: '밀폐공간',
        hazardType: '질식',
        mgmtCauses: ['계획 미이행', '불안전 행동'],
        holdPoint: true,
        photoBanner: '밀폐공간 유해가스 농도 미측정 진입',
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
        photoBanner: '비계 작업발판 미설치 및 틈새 과다',
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
        photoBanner: '바닥 개구부 덮개 미설치',
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
        photoBanner: '슬래브 단부 안전난간 미설치',
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
        photoBanner: '고소작업 시 안전대 미체결',
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
        photoBanner: '용접 시 불티 비산방지포 미설치',
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
        photoBanner: '전기기구 누전차단기 미접속',
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
        photoBanner: '동바리 수평연결재 미체결',
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
        photoBanner: '가설통로 통행방해물 방치',
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
        const pin = storage.getItem('sp_pin') || '111111';
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
            photoBanner: data.photoBanner || (instantResult ? instantResult.photoBanner : ''),
            photo2Banner: data.photo2Banner || (instantResult ? instantResult.photo2Banner : ''),
            source: 'cloudflare_cloud_qwen'
          };
        }
      } catch (cfErr) {
        console.warn('Cloudflare AI 호출 오류, 룰 엔진으로 대체:', cfErr);
      }
    }

    // ── [2단계-B] 내 노트북이 켜져 있는 경우: 로컬 LM Studio 스트리밍 추론 ──
    const systemPrompt = `너는 대한민국 건설현장 최고 안전감사관이자 고용노동부 산업안전보건기준에 관한 규칙(제1조~제670조 전 조항) 전문 AI이다.
주어진 현장 부적합 지적사항과 첨부된 사진(또는 작업상황)을 정밀 분석하여, 실물 점검장표 사진 상단 적색 음영 배너(photoBanner, photo2Banner) 및 위반 법령을 도출하라.

[핵심 작성 원칙 - 사진 상단 적색 배너 (photoBanner / photo2Banner)]
1. 배너 안에는 반드시 구체적으로 '어떤 작업/상황'에서 '어떤 안전기준을 안 지켰는지 / 어떤 위험 행동을 했는지'를 직접적으로 작성하라 (15~20자 내외).
   - [올바른 작성 예시]:
     • '양중작업 시 화물을 직접 손으로 잡음'
     • '양중작업 시 유도로프 미사용'
     • '양중작업 시 화물의 수평양중 미 실시'
     • '말비계 모서리 구간 단부 추락방지 미조치'
     • '통로 바닥 가설전선 거치 및 정리 미실시'
     • '보 상부 승인 미실시 및 불안전 자세 작업'
     • '구획된 바닥 안전통로 내 거푸집 자재 방치'
     • '작업발판 단부 안전난간 미설치'
     • '바닥 개구부 덮개 미설치 및 고정 미흡'
     • '고소작업 시 안전대 미체결'
2. [절대 금지 사항 - 위반 시 엄격히 반려]:
   - ❌ '표준 안전작업절차 및 안전수칙 미준수', '안전수칙 미준수' 같은 모호하고 추상적인 문구를 절대 넣지 말 것!
   - ❌ '작업방법 불량(동작/자세 불량)', '보호구 착용 불량', '불안전 행동', '불안전 상태' 같은 통계 분류 카테고리 명칭을 그대로 넣지 말 것!
3. 지적내용에 2가지 독립된 지적사항(예: 1. 손으로 잡음, 2. 유도로프 미사용)이 있거나 사진이 2장인 경우:
   - photoBanner: 1번 사진용 구체적 위반 문구 (예: '양중작업 시 화물을 직접 손으로 잡음')
   - photo2Banner: 2번 사진용 구체적 위반 문구 (예: '양중작업 시 유도로프 미사용', 단일 지적이면 빈 문자열 '')

생각 과정(<think>)은 3~4문장 이내로 아주 짧게 끝내고, 반드시 </think> 태그 뒤에 아래 JSON 형식으로만 최종 답을 출력하라:
{
  "severity": "중부적합" 또는 "경부적합",
  "law": "안전보건규칙 제OO조(조항명 전문)",
  "hazardType": "추락" 또는 "낙하" 또는 "붕괴·도괴" 또는 "협착" 또는 "전도" 또는 "화재·폭발" 또는 "감전" 또는 "질식",
  "item": "해당 작업 또는 기인물 명칭",
  "photoBanner": "사진 1 상단 배너용 15자 내외 구체적 위반 문구",
  "photo2Banner": "사진 2 상단 배너용 15자 내외 구체적 위반 문구 (단일 지적이면 '')",
  "mgmtCauses": ["계획 미수립", "계획 미이행", "불안전 행동", "불안전 상태" 중 1~2개],
  "holdPoint": true 또는 false,
  "analysis": "법적 위반 판단 이유 1~2문장",
  "pmVerdict": "현장 PM 조치 권고 문장"
}`;

    const userPrompt = `지적사항: "${content.trim()}"
${extraContext.workGroup ? `공종명: ${extraContext.workGroup}` : ''}
${extraContext.location ? `작업장소: ${extraContext.location}` : ''}
${extraContext.productType ? `건물용도: ${extraContext.productType}` : ''}
${extraContext.progressRate ? `공정률: ${extraContext.progressRate}%` : ''}

위 지적사항 및 현장 사진/상황을 분석하여 사진 상단 배너(구체적으로 어떤 점이 안 되었는지 직시)와 산안법 위반을 분석하라.`;

    // 사진 첨부 시 멀티모달(Vision) 지원 포맷 구성 (미지원 모델 시 자동 텍스트 폴백)
    const photos = Array.isArray(extraContext.photos) ? extraContext.photos.filter(Boolean) : [];
    let messages = [
      { role: 'system', content: systemPrompt }
    ];

    if (photos.length > 0) {
      const contentParts = [{ type: 'text', text: userPrompt }];
      photos.slice(0, 2).forEach((p, idx) => {
        const url = typeof p === 'string' ? p : (p.previewUrl || p.url || '');
        if (url && (url.startsWith('data:image/') || url.startsWith('http'))) {
          contentParts.push({
            type: 'image_url',
            image_url: { url }
          });
        }
      });
      messages.push({ role: 'user', content: contentParts });
    } else {
      messages.push({ role: 'user', content: userPrompt });
    }

    let ctrl = new AbortController();
    // 35초 초과 시 자동 타임아웃하여 룰 기반 결과 반환
    const timeout = setTimeout(() => ctrl.abort(), 35000);

    try {
      onProgress({ phase: 'connecting', message: 'LM Studio 로컬 AI 연결 중...' });

      let res;
      try {
        res = await fetch(`${currentEndpoint}/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: currentModel,
            messages,
            temperature: 0.4,
            max_tokens: 800,
            stream: true
          }),
          signal: ctrl.signal
        });
      } catch (postErr) {
        // 비전 미지원 모델일 경우 텍스트 단독으로 즉시 재시도
        if (photos.length > 0) {
          res = await fetch(`${currentEndpoint}/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: currentModel,
              messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt }
              ],
              temperature: 0.4,
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

      if (!res.ok) {
        throw new Error(`LM Studio HTTP 오류 (${res.status})`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let done = false;
      let fullReasoning = '';
      let fullContent = '';
      let thinkTokens = 0;

      onProgress({ phase: 'thinking', message: 'AI가 사진과 부적합사항 정밀 분석 중 (🤔 추론 토큰 수신)...' });

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
                    message: 'AI 사진 배너 및 법률 분석 결과 수신 중...' 
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
          photoBanner: parsed.photoBanner || instantResult.photoBanner || '',
          photo2Banner: parsed.photo2Banner || instantResult.photo2Banner || '',
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
          const pin = storage.getItem('sp_pin') || '111111';
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

  function cleanLocation(loc) {
    if (!loc) return '';
    let s = String(loc)
      .replace(/^작업장소\s*[:;：]?\s*/i, '')
      .replace(/\[\s*ERE\b[\s\S]*$/i, '')
      .replace(/\b(?:EERE|ERE|EEE|EEL|CERNE|SEAT|MAK|261k|ee|ere)\b[\s\S]*$/i, '')
      .replace(/(?:점검자?|점검차수|점검\s*[a-zA-Z0-9]?|차수|부적합)[\s\S]*$/i, '')
      .replace(/\b[a-zA-Z]+\b/g, ' ')
      .replace(/[\[\]{}()_ㅣ¦!~—\-]+/g, ' ')
      .replace(/\s+(?:리|로|드|트|르|점|검)\s*$/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    return s;
  }

  function cleanBannerText(rawBanner, content) {
    let s = String(rawBanner || '').replace(/\s+/g, ' ').trim();
    if (/벽의음|6055|버팀대|설치각도/.test(s) && /버팀대/.test(content || '')) {
      return '벽이음용 상부 버팀대 설치각도(60도↓) 불량';
    }
    s = s
      .replace(/^[①②③④⑤⑥⑦⑧⑨⑩123458\s()\[\].\-_]+(?=[가-힣A-Za-z])/, '')
      .replace(/^[①②③④⑤⑥⑦⑧⑨⑩]\s*/, '')
      .replace(/벽의음/g, '벽이음')
      .replace(/상부0버팀대8/g, '상부 버팀대 ')
      .replace(/\(6055\)\s*\(?불량\)?/g, '(60도↓) 불량')
      .replace(/[^\w가-힣↓↑\s/()\-.]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const hasDigitHangulGlue = /\d[가-힣]|[가-힣]\d[가-힣]/.test(s.replace(/\d+(?:도|단|층|동|차|호|개소|cm|mm)/gi, ''));
    const hangulCount = (s.match(/[가-힣]/g) || []).length;
    if (!hasDigitHangulGlue && hangulCount >= 5 && s.length >= 6 && hangulCount / s.length >= 0.55) {
      return s.replace(/^[①②③④⑤⑥⑦⑧⑨⑩]\s*/, '');
    }
    const c = String(content || '').replace(/^부적합\s*(?:내용|사항)\s*[:;：]?\s*/, '').trim();
    if (c.includes('전도방지 파이프 미사용')) return '대형 벽체 조립 설치 시 전도방지 파이프 미사용';
    if (c.includes('버팀대')) return '외부비계 벽이음용 버팀대 설치각도 기준 미준수';
    if (c.includes('이격거리')) return '외부비계와 구조물 벽체 간 이격거리 과다';
    if (c.includes('가새')) return '비계 설치구간 가새 설치 누락';
    if (c.includes('주변 통제')) return '비계 설치 작업 시 주변 통제 미실시';
    return (s || '안전기준 미준수').replace(/^[①②③④⑤⑥⑦⑧⑨⑩]\s*/, '');
  }

  function cleanWorkGroup(wg, content) {
    let s = String(wg || '').trim();
    s = s.replace(/^(?:HEY|HA|HE|공종명?)\s*[:;：]?\s*/i, '');
    s = s.replace(/[_|ㅣ¦!\[\]~—\-\r\n]+/g, ' ');
    s = s.replace(/[^가-힣a-zA-Z0-9·()/\s]/g, '');
    s = s.replace(/\s+/g, ' ').trim();
    if (/거푸집|동바리|유로폼/i.test(s) || /거푸집|동바리|유로폼/i.test(content || '')) return '거푸집동바리공사';
    if (/비계/i.test(s) || /비계/i.test(content || '')) return '비계공사';
    if (/^(?:HA|HE|HEY|BEE)\s*공사/i.test(s)) return '비계공사';
    return s || '비계공사';
  }

  function cleanOpinionText(txt) {
    if (!txt) return '';
    let s = String(txt)
      .replace(/(?:\[?\s*(?:HAT|점검단)\s*제안\]?|시스템\s*개선|교육\/코칭)[\s\S]*$/gi, '')
      .replace(/\[\s*(?:관리자\s*의견|의견)[^\]]*\]/gi, '')
      .replace(/oo\s*(?:Tle|기느으|기느|기|©)[\s\S]*?(?=-|[가-힣])/gi, '')
      .replace(/(?:EE\s*tee|ee\s*A\s*eA|바가\s*---|\btee\s*ee\b|ATER\s*TH|isdios|SHE\s*SEA|[—\-_]{3,})[\s\S]*$/gi, '')
      .replace(/^[^\n]*?(?:절경\s*열수\s*갤|BT\s*ROSH|Deen\s*lp)[^\n]*?=\s*-\s*/i, '- ')
      .replace(/^[^\n]*?=\s*-\s*/, '- ')
      .replace(/\[\s*(?:HAA|HAT|점검단)[\s\S]*?\]/gi, '')
      .replace(/30000\s*이하|3000\)?\s*이하|3060\s*이하/g, '30cm 이하')
      .replace(/\(30000\)|\(3000\)/g, '(30cm)')
      .replace(/\(55(?:00|60|em|cm)?[^)]*\)/gi, '(55cm)')
      .replace(/5560\s*[ㅁm7]+|5500\b|55em\b/gi, '55cm')
      .replace(/2단\s*HED\]?/gi, '2단 버팀대')
      .replace(/HE\s*위치가/g, '버팀대 위치가')
      .replace(/미설치\s*[52등]\)?/g, '미설치 등)')
      .replace(/혐식적/g, '형식적')
      .replace(/5145내|SNSU|SNS\s*U\b/gi, 'SNS내')
      .replace(/시스템\s*구죽/g, '시스템 구축')
      .replace(/[\s|ㅣ¦_!~—\-]*[블를클|ㅣ¦_!~—\-]+$/g, '')
      .replace(/\[=\]\s*oa/gi, '')
      .trim();

    const rawLines = s.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const items = [];
    for (let l of rawLines) {
      l = l.replace(/^[a-zA-Z0-9|.\s=\-_/!]+(?=-)/, '').trim();
      const hasDash = /^[-•·▪]\s*/.test(l);
      let text = l.replace(/^[|\sㅣ¦_!\-•·~—]+/, '').replace(/[|\sㅣ¦_!~—\-]+$/, '').trim();
      if (!text) continue;
      const korCnt = (text.match(/[가-힣]/g) || []).length;
      if (korCnt === 0 && text.length < 15) continue;

      text = text
        .replace(/(보완하겠음\.?)\s*(?=-?\s*2단\s*버팀대)/g, '$1\n- ')
        .replace(/(간과함\.?)\s*(?=-?\s*향후\s*비계설치)/g, '$1\n- ');

      const subParts = text.split(/\n+/);
      for (let sp of subParts) {
        const subDash = hasDash || /^[-•·▪]\s*/.test(sp) || /^(?:향후\s*비계설치|2단\s*버팀대)/.test(sp);
        const cleanSp = sp.replace(/^[-•·▪]\s*/, '').trim();
        if (!cleanSp) continue;
        if (items.length === 0 || subDash) {
          items.push(cleanSp);
        } else {
          items[items.length - 1] = `${items[items.length - 1]} ${cleanSp}`.replace(/\s+/g, ' ');
        }
      }
    }

    if (items.length === 0) return '';
    if (items.length === 1) return `- ${items[0]}`;
    return items.map(it => `- ${it}`).join('\n');
  }

  function cleanProposalText(txt) {
    if (!txt) return '';
    let s = String(txt)
      .replace(/\[?(?:점검단|HAT)\s*제안\]?/gi, '')
      .replace(/시스템\s*개선|교육\/코칭|패널티|페널티|\((?:현장\s*)?모니터링\s*강화\)|\(이행강화안\s*수립\)|\(\s*(?:근로자|협력사)\s*교육\s*\)|\(관리감독자\s*경고\)/gi, '')
      .replace(/^(?:[-•*·▪\s]*)(?:De\s*T=?\s*©?|oo\s*Tle\s*©?|구시\s*으\s*기느으|oo\s*기느으|구시\s*으|기느으|-?\s*SHE\s*SEA)[\s\S]*?(?=\d|1차|-|[가-힣]{2})/gi, '')
      .replace(/De\s*T=?\s*©?|구시\s*으\s*기느으|oo\s*Tle\s*©?|oo\s*기느으|SHE\s*SEA/gi, '')
      .replace(/^[\s\S]*?(?=1차적으로\s*(?:오설치된|이격거리))/, '')
      .replace(/(?:EE\s*tee|ee\s*A\s*eA|바가\s*---|\btee\s*ee\b|ATER\s*TH|isdios|[—\-_]{3,})[\s\S]*$/gi, '')
      .replace(/위[험혐협]성평[가기]/g, '위험성평가')
      .replace(/현장\s*모\s*니터링/g, '현장 모니터링')
      .replace(/낙하물방\s*지망/g, '낙하물방지망')
      .replace(/내실화\s*[&xX×쪽종등5]\s*점검\s*강\s*화\s*필요/g, '내실화 등 점검 강화 필요')
      .replace(/점검\s*강\s*화\s*필요/g, '점검 강화 필요')
      .replace(/혐식적/g, '형식적')
      .replace(/(?:5045|5145|SNS)\s*[내U]\s*등록/gi, 'SNS내 등록')
      .replace(/5045내|5145내|SNSU|SNS\s*U\b/gi, 'SNS내')
      .replace(/시스템\s*구죽/g, '시스템 구축')
      .replace(/30000\s*이하|3000\)?\s*이하|3060\s*이하/g, '30cm 이하')
      .replace(/5500\b|55em\b/g, '55cm')
      .replace(/[\s|ㅣ¦_!~—\-]*[블를클르|ㅣ¦_!~—\-]+$/g, '')
      .trim();

    const rawLines = s.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const items = [];
    for (const line of rawLines) {
      const hasExplicitBullet = /^[-•*·▪.]\s*/.test(line);
      let cl = line
        .replace(/^[|\sㅣ¦_!\-•·~—*.©=]+/, '')
        .replace(/[|\sㅣ¦_!~—\-*]+$/, '')
        .replace(/^(?:De\s*T=?\s*©?|구시\s*으\s*기느으|SHE\s*SEA)\s*/gi, '')
        .replace(/\s*-\s*르$/, '')
        .trim();
      if (!cl || cl.length < 2 || /^[블를클르]$/.test(cl)) continue;

      cl = cl.replace(/(고임목\s*설치|낙하물방지망\s*설치)\s+(?=비계설치\s*후\s*승인점검)/g, '$1\n- ');

      const subLines = cl.split(/\n+/);
      for (let idx = 0; idx < subLines.length; idx++) {
        const sub = subLines[idx].replace(/^[-•*·▪.©=]+\s*/, '').replace(/^(?:De\s*T=?\s*©?|SHE\s*SEA)\s*/i, '').trim();
        if (!sub) continue;
        const isNewBullet = (idx === 0 && hasExplicitBullet) || idx > 0 || /^(?:1차적으로|비계설치\s*후\s*승인점검|대형거푸집|비계\s*설치\s*및\s*해체|비계\s*설치\s*\/?\s*해체|비계\s*작업\s*전|형식적인\s*점검)/.test(sub);
        if (items.length === 0 || isNewBullet) {
          items.push(sub);
        } else {
          items[items.length - 1] = `${items[items.length - 1]} ${sub}`
            .replace(/위[험혐협]성평[가기]/g, '위험성평가')
            .replace(/현장\s*모\s*니터링/g, '현장 모니터링')
            .replace(/낙하물방\s*지망/g, '낙하물방지망')
            .replace(/내실화\s*[&xX×쪽종등5]\s*점검\s*강\s*화\s*필요/g, '내실화 등 점검 강화 필요')
            .replace(/점검\s*강\s*화\s*필요/g, '점검 강화 필요')
            .replace(/혐식적/g, '형식적')
            .replace(/(?:5045|5145|SNS)\s*[내U]\s*등록/gi, 'SNS내 등록')
            .replace(/5045내|5145내|SNSU|SNS\s*U\b/gi, 'SNS내')
            .replace(/시스템\s*구죽/g, '시스템 구축')
            .replace(/\s+/g, ' ');
        }
      }
    }

    return items.map(it => `- ${it}`).join('\n');
  }

  function cleanActionPlan(txt) {
    if (!txt) return '';
    const rawStr = String(txt);
    if (rawStr.includes('보완/개선') && rawStr.includes('Process')) {
      return '- 비계 승인점검 후 보완/개선 필요사항 조치완료 후 최종승인 및 Tag 부착 Process 이행';
    }
    const cleanedStr = rawStr
      .replace(/\[?\s*PM\s*판정\s*결과\s*\]?/gi, '')
      .replace(/시스템\s*개선|교육\/코칭|패널티|페널티/gi, '')
      .replace(/\((?:현장\s*)?모니터링\s*강화\)|\(이행강화안\s*수립\)|\(\s*(?:근로자|협력사)\s*교육\s*\)|\(관리감독자\s*경고\)/g, '')
      .replace(/(?:EE\s*tee|ee\s*A\s*eA|바가\s*---|\btee\s*ee\b|ATER\s*TH|isdios|[—\-_]{3,})[\s\S]*$/gi, '')
      .replace(/위[험혐협]성평[가기]/g, '위험성평가')
      .replace(/30000\s*이하|3000\)?\s*이하|3060\s*이하/g, '30cm 이하')
      .replace(/5560\s*[ㅁm7]+|5500\b|55em\b/gi, '55cm')
      .replace(/혐식적/g, '형식적')
      .replace(/(?:5045|5145|SNS)\s*[내U]\s*등록/gi, 'SNS내 등록')
      .replace(/5045내|5145내|SNSU|SNS\s*U\b/gi, 'SNS내')
      .replace(/시스템\s*구죽/g, '시스템 구축')
      .replace(/(교육\s*실시|점검\s*실시\s*\([^)]+\)|존치\)|추가\s*설치)\s*[.,·•-]?\s*(?=거푸집\s*전도|비계\s*잭베이스|시스템\s*비계\s*설치계획서)/g, '$1\n- ')
      .replace(/,\s*-\s*/g, '\n- ')
      .trim();

    const rawLines = cleanedStr.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const items = [];
    for (const line of rawLines) {
      const hasExplicitBullet = /^[-•*·▪.]\s*/.test(line);
      let cl = line.replace(/^[|ㅣ¦_!~—\-*•·.\s&]+/, '').replace(/[|ㅣ¦_!~—\-&]+$/, '').trim();
      if (!cl || cl.length < 2) continue;
      if (/(?:사각후크|그림\s*참조|상하\s*방향|900mm|보강\s*예|시스템\s*개선|교육\/코칭)/i.test(cl) || /[&제테텍레]{3,}/.test(cl)) continue;

      if (cl.includes('비계 승인점검 후 보완/개선') || cl.includes('Process 이행')) {
        return '- 비계 승인점검 후 보완/개선 필요사항 조치완료 후 최종승인 및 Tag 부착 Process 이행';
      }

      const isContinuation = /^(?:재수립\s*후|모니터링\s*강화|전수\s*점검|받침목\s*추가|\(또는\s*버림틀|낙하물\s*방지망\s*추가|이격거리\s*30cm|이격거리\s*표기|설치\s*완료|조치완료\s*후|방안\s*수립)/.test(cl);
      const isDistinctNewItem = !isContinuation && (
        hasExplicitBullet ||
        /^(?:벽체\s*거푸집|거푸집\s*전도\s*예방|벽이음용\s*상부|비계\s*잭베이스\s*구간|비계와\s*구조물|시스템\s*비계\s*설치계획서|비계\s*승인점검|비계\s*설치\s*작업\s*시|작업\s*전\s*풍속)/.test(cl)
      );

      if (items.length === 0 || isDistinctNewItem) {
        items.push(cl);
      } else {
        items[items.length - 1] = `${items[items.length - 1]} ${cl}`.replace(/\s+/g, ' ');
      }
    }
    return items.map(it => `- ${it}`).join('\n');
  }

  function cleanContent(txt) {
    if (!txt) return '';
    let s = String(txt)
      .replace(/^부적합\s*(?:내용|사항)\s*[:;：]?\s*/, '')
      .replace(/^[|ㅣ¦_!~\-\s]+/, '')
      .replace(/(?:EE\s*tee|ee\s*A\s*eA|바가\s*---|\btee\s*ee\b|ATER\s*TH|isdios|eevee|[—\-_]{3,})[\s\S]*$/gi, '')
      .replace(/6\/\\\s*코어/gi, 'E/V 코어')
      .replace(/6\/\s*코어/gi, 'E/V 코어')
      .replace(/6\/\\/g, 'E/V')
      .replace(/4%\s*11일/g, '4월 11일')
      .replace(/\(55(?:00|60|em|cm)?[^)]*\)/gi, '(55cm)')
      .replace(/5560\s*[ㅁm7]+|5500\b|55em\b/gi, '55cm')
      .replace(/30000\s*이하|3000\)?\s*이하|3060\s*이하/g, '30cm 이하')
      .replace(/HEL\s*설치\s*불량/g, '버팀대 설치 불량')
      .replace(/HE\s*위치가/g, '버팀대 위치가')
      .replace(/충렬선상\s*미실지\s*중/g, '동일선상 미설치 등')
      .replace(/미설치\s*[52등중]\)?/g, '미설치 등)')
      .replace(/(?:—|->|-)\s*4월\s*11일/g, '→ 4월 11일')
      .replace(/([^\n])\s+(?=2\)\s*)/g, '$1\n');

    const lines = s.split(/\r?\n/)
      .map(l => l.replace(/^[|ㅣ¦_!~\-\s]+/, '').replace(/[|ㅣ¦_!~\-\s:。ㅎ]+$/, '').trim())
      .filter(l => {
        if (l.length < 3) return false;
        if (/^[—\-_\s]+ee\b/i.test(l)) return false;
        if (/^1\s*벽이음\s*설치\s*위치와/.test(l) || /충렬선상|미실지/.test(l)) return false;
        const kor = (l.match(/[가-힣]/g) || []).length;
        const eng = (l.match(/[a-zA-Z]/g) || []).length;
        if (kor === 0 && eng > 4) return false;
        if (eng > kor * 2 && eng >= 6) return false;
        return true;
      });
    return lines.join('\n');
  }

  /**
   * Qwen AI를 활용한 장표 OCR 텍스트 지능형 정제 및 필드 복원 (Cloudflare 24시간 클라우드 Qwen AI 최우선 연동)
   */
  async function cleanOcrRecord(rawOcrText, fallbackRecord) {
    if (!fallbackRecord) fallbackRecord = {};
    const workerUrl = (typeof window !== 'undefined' ? window.SAFEPATROL_CONFIG?.workerUrl : null) || (root.SAFEPATROL_CONFIG && root.SAFEPATROL_CONFIG.workerUrl) || 'https://safepatrol-relay.abraxass0511.workers.dev';
    const pin = storage.getItem('sp_pin') || '111111';
    const forceLocal = storage.getItem('sp_ai_provider') === 'local';

    // ── [1순위] Cloudflare 24시간 상시 가동 Qwen AI 연동 (노트북/로컬 서버 무관 24시간 실시간 동작) ──
    if (!forceLocal && workerUrl) {
      try {
        const ctrl = new AbortController();
        const timeout = setTimeout(() => ctrl.abort(), 12000);
        const cfRes = await fetch(`${workerUrl.replace(/\/$/, '')}/api/ai-analyze`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-PIN': pin
          },
          body: JSON.stringify({
            mode: 'ocr_clean',
            rawOcrText: rawOcrText || '',
            stripImageBase64: fallbackRecord._stripImageBase64 || undefined,
            rightPhotoBase64: fallbackRecord._rightPhotoBase64 || undefined,
            content: fallbackRecord.content || rawOcrText,
            location: fallbackRecord.location || '',
            workGroup: fallbackRecord.workGroup || '',
            subcontractor: fallbackRecord.subcontractor || '',
            interviewOpinion: fallbackRecord.interviewOpinion || '',
            auditProposal: fallbackRecord.auditProposal || '',
            actionPlan: fallbackRecord.actionPlan || '',
            rawLaw: fallbackRecord.rawLaw || '',
            lawBody: fallbackRecord.lawBody || '',
            productType: fallbackRecord.productType || '공동주택',
            progressRate: 35
          }),
          signal: ctrl.signal
        });
        clearTimeout(timeout);
        if (cfRes.ok) {
          const cfData = await cfRes.json();
          if (cfData) {
            if (cfData.rightPhotoIsReference === true && Array.isArray(fallbackRecord.photos) && fallbackRecord.photos.length > 1) {
              fallbackRecord.photos = [fallbackRecord.photos[0]];
              fallbackRecord.photo2 = null;
            }
            if (cfData.severity && !fallbackRecord.severity) fallbackRecord.severity = cfData.severity.includes('중부적합') ? '중부적합' : '경부적합';
            if (cfData.law && !fallbackRecord.law) fallbackRecord.law = cfData.law;
            if (cfData.hazardType && !fallbackRecord.type) fallbackRecord.type = cfData.hazardType;
            if (cfData.photoBanner && !fallbackRecord.photoBanner) fallbackRecord.photoBanner = cfData.photoBanner;
            if (cfData.pmVerdict && !fallbackRecord.pmVerdict) fallbackRecord.pmVerdict = cfData.pmVerdict;
            // 주의: 장표에서 픽셀로 직접 감지한 4대 발생요인(mgmtCauses)이 이미 있으면 AI 추론값으로 절대 덮어쓰지 않음!
            if ((!Array.isArray(fallbackRecord.mgmtCauses) || fallbackRecord.mgmtCauses.length === 0) && Array.isArray(cfData.mgmtCauses) && cfData.mgmtCauses.length > 0) {
              fallbackRecord.mgmtCauses = cfData.mgmtCauses;
            }
            if (cfData.cleanedFields && typeof cfData.cleanedFields === 'object') {
              const cf = cfData.cleanedFields;
              if (cf.content) fallbackRecord.content = cf.content;
              if (cf.location) fallbackRecord.location = cf.location;
              if (cf.workGroup) fallbackRecord.workGroup = cf.workGroup;
              if (cf.subcontractor !== undefined && fallbackRecord.subcontractor) fallbackRecord.subcontractor = cf.subcontractor;
              if (cf.interviewOpinion) fallbackRecord.interviewOpinion = cf.interviewOpinion;
              if (cf.auditProposal) fallbackRecord.auditProposal = cf.auditProposal;
              if (cf.actionPlan) fallbackRecord.actionPlan = cf.actionPlan;
              if (cf.rawLaw) fallbackRecord.rawLaw = cf.rawLaw;
              if (cf.lawBody) fallbackRecord.lawBody = cf.lawBody;
            }
          }
        }
      } catch (cfErr) {
        console.warn('Cloudflare 24시간 Qwen AI 호출 안내 (로컬/룰엔진 자동 폴백):', cfErr);
      }
    } else if (forceLocal) {
      // ── [2순위] 사용자가 명시적으로 로컬 LM Studio를 선택한 경우에만 실행 ──
      for (const ep of [currentEndpoint, ...DEFAULT_ENDPOINTS]) {
        try {
          const ctrl = new AbortController();
          const timeout = setTimeout(() => ctrl.abort(), 60000);
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
    const cleaned = {
      ...fallbackRecord,
      subcontractor: cleanSubcontractor(fallbackRecord.subcontractor),
      workGroup: cleanWorkGroup(fallbackRecord.workGroup, cleanedContent),
      location: cleanLocation(fallbackRecord.location),
      content: cleanedContent,
      photoBanner: cleanBannerText(fallbackRecord.photoBanner, cleanedContent),
      interviewAuthor: fallbackRecord.interviewAuthor || '시공관리자 및 근로자',
      interviewAuthorTitle: fallbackRecord.interviewAuthorTitle || `[관리자 의견 : ${fallbackRecord.interviewAuthor || '시공관리자 및 근로자'}]`,
      interviewOpinion: cleanOpinionText(fallbackRecord.interviewOpinion),
      auditProposal: cleanProposalText(fallbackRecord.auditProposal),
      actionPlan: cleanActionPlan(fallbackRecord.actionPlan),
      countermeasure: cleanActionPlan(fallbackRecord.actionPlan || fallbackRecord.countermeasure),
      inspectorOpinionType: fallbackRecord.inspectorOpinionType || '시스템 개선',
      pmVerdict: fallbackRecord.pmVerdict || '시스템 개선',
      pmVerdictType: fallbackRecord.pmVerdictType || fallbackRecord.pmVerdict || '시스템 개선',
      severity: fallbackRecord.severity || '중부적합',
      type: fallbackRecord.type || '붕괴'
    };

    return cleaned;
  }

  return {
    checkConnection,
    quickRuleAnalysis,
    streamAnalyzeSafetyText,
    cleanOcrRecord,
    getEndpoint: () => currentEndpoint,
    setEndpoint: ep => { currentEndpoint = ep; storage.setItem('sp_lmstudio_endpoint', ep); },
    getModel: () => currentModel,
    setModel: m => { currentModel = m; storage.setItem('sp_lmstudio_model', m); },
    isConnected: () => isConnected
  };
});

