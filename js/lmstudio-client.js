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
        photoBanner: isHand ? '양중작업 시 화물을 직접 손으로 잡음' : (isHorizontal ? '양중작업 시 화물의 수평양중 미실시' : '양중작업 시 유도로프 미사용'),
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
    // 7. 가설전기 / 감전 / 분전함·전등 소켓 충전부 노출·접지 불량
    if (text.includes('전기') || text.includes('분전') || text.includes('접지') || text.includes('차단기') || text.includes('충전부') || text.includes('감전') || text.includes('전등') || text.includes('소켓') || text.includes('투광등') || text.includes('심선')) {
      const isLivePart = text.includes('충전부') || text.includes('노출');
      const isLight = text.includes('전등') || text.includes('소켓') || text.includes('심선') || text.includes('투광등');
      const isGroundBolt = text.includes('접지선') && (text.includes('고정') || text.includes('볼트') || text.includes('용량') || text.includes('미연결'));
      return {
        item: isLight ? '전등/전선' : '분전반',
        workGroup: '가설전기공사',
        workMethod: '설치조립작업',
        agentMajor: '전기·화기·설비',
        agentMid: '전기시설',
        agentMinor: isLight ? '가설전선/이동릴선' : (isGroundBolt ? '접지시설' : (isLivePart ? '분전함' : '누전차단기')),
        law: isLivePart
          ? '안전보건규칙 제301조(전기기계ㆍ기구 충전부 방호)'
          : (isGroundBolt || text.includes('접지') ? '안전보건규칙 제302조(전기 기계ㆍ기구의 접지)' : '안전보건규칙 제304조(누전차단기에 의한 감전방지)'),
        hazardType: '감전',
        type: '감전',
        severity: '중부적합',
        mgmtCauses: ['불안전 상태', '계획 미이행'],
        condition: '방호장치 결함 (덮개·난간 미설치 등)',
        action: '해당없음',
        rootCauseMgmt: '관리감독자 지정 및 역할 수행 미흡',
        rootCauseSystem: '안전시설물 설치/인계인수 프로세스 미흡',
        stakeholder: '협력사 관리감독자',
        holdPoint: false,
        photoBanner: isLight
          ? '전등 소켓 충전부 노출 및 절연 불량'
          : (isLivePart ? '분전함 차단기 충전부 노출' : (isGroundBolt ? '접지선 볼트 고정 불량 및 용량 부족' : '가설분전반 관리 및 접지 불량')),
        analysis: isLight
          ? '작업등·전등 소켓 충전부 노출 및 전선 절연 불량으로 감전 위험'
          : (isLivePart ? '가설컨테이너 분전함 내 차단기 충전부 방호커버 미설치로 감전 위험' : '임시 분전함 외함 접지 미시행 또는 접지선 체결 불량'),
        pmVerdict: '즉시 전원 차단 및 충전부 절연 방호·접지 보강 후 사용'
      };
    }
    // 7-B. 지게차 / 하역운반 / 유도원 근접 충돌
    if (text.includes('지게차') || text.includes('하역') || text.includes('유도원') || text.includes('신호수') || text.includes('충돌')) {
      const isWindow = /pl\s*창호|창호|유리/i.test(text);
      const isPc = /p\.?c\s*공사|피씨|프리캐스트|\bpc\b/i.test(text);
      return {
        item: '운반장비',
        workGroup: isWindow ? '창호공사(PL)' : (isPc ? 'PC공사' : '가설공사(건설장비)'),
        workMethod: '하역운반작업',
        agentMajor: '건설장비',
        agentMid: '운반장비',
        agentMinor: '지게차',
        law: '안전보건규칙 제172조(접촉의 방지), 제38조(사전조사 및 작업계획서의 작성 등)',
        hazardType: '충돌',
        type: '충돌',
        severity: '중부적합',
        mgmtCauses: ['계획 미이행', '불안전 행동'],
        condition: '해당없음',
        action: '위험장소 접근 (출입통제 구역 진입 등)',
        rootCauseMgmt: '작업계획서 미수립 또는 형식적 작성',
        rootCauseSystem: '표준작업절차서(SOP) 미배포 또는 현장 부적합',
        stakeholder: '협력사 근로자',
        holdPoint: true,
        photoBanner: '유도원·근로자 지게차 근접 작업',
        analysis: '지게차 자재 하역작업 중 유도원 및 근로자가 안전거리(5m) 미확보 상태로 장비에 근접하여 충돌 위험',
        pmVerdict: '지게차 유도원 안전거리 확보 기준 재교육 및 하역장소 통제 모니터링 강화'
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
     • '양중작업 시 화물의 수평양중 미실시'
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
      // 13. 치수 및 단위 정밀 정규화 (6007이하 -> 60cm 이하, 600ㅁ로 -> 60cm로)
      .replace(/6007\s*이하|600ㅁ\s*이하/g, '60cm 이하')
      .replace(/600[ㅁm7]\s*로/g, '60cm로')
      .replace(/600[ㅁm7]\b/g, '60cm')
      .replace(/(\d{2})0[0-97ㅁ口]{1,2}\s*(?=이하|이상|이내|간격|로|에|\b)/g, '$1cm ')
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

    // 2. 온전한 건물/동/층/코어/외부/E/V 패턴이 이미 포함되어 있으면 즉시 추출
    const mFull = s.match(/(?:\d{1,4}\s*동|상가동|주차장동|본동|복리시설동)?(?:\s*(?:지[상하]\s*\d+\s*층|\d+\s*층|\d+\s*코어|코어|PIT|피트|옥상|지붕|단부|계단실|EV홀|E\/V\s*최상부|복도|주차장|상가동|후면|전면|측면|외부|내부|동측|서측|남측|북측|외부비계|워킹타워|\d+구간|\w+구간|외벽|내벽|슬래브|바닥|천장))+/i);
    if (mFull && mFull[0] && mFull[0].trim().length >= 2) {
      const cand = mFull[0].replace(/\s+/g, ' ').trim();
      if (!/^[a-zA-Z\s,]+$/.test(cand) && /[가-힣]/.test(cand)) return cand;
    }

    // 3. E/V 보호 및 노이즈 제거
    s = s
      .replace(/E\/V|6\/『|6\//gi, '__EV__')
      .replace(/^(?:작업\s*장소|작[업엄]장소|장\s*소)\s*[:;：.]?\s*/i, '')
      .replace(/\[\s*ERE\b[^\]\n]*\]?/gi, '')
      .replace(/\b(?:EERE|ERE|EEE|ee|ere|MAK|261k|SEAT|CERNE|EEL|드로|리로)\b(?:\s*[:;=]?\s*[a-zA-Z0-9]+)*/gi, ' ')
      .replace(/(?:[점섬정겸]검\s*[자차]?|[점섬정겸]검차수|[집점]십[사차]수|\b차수\b|\b\d+\s*차\b)[\s\S]*$/i, '')
      .replace(/\s+\d{2,}(?:\s+\d+)*\s*$/g, '')
      .replace(/\b[a-zA-Z]\b/g, ' ')
      .replace(/[\[\]{}()_ㅣ¦!~—:;]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    s = s.replace(/__EV__/g, 'E/V');

    // 4. 1075 35 1코어 등 숫자 오인식 치유
    s = s.replace(/\b1?(10[1-9]|1[1-9]\d)[358등]\s+([1-9]|1\d|2\d|3\d)[358측증]\s*(?=\d+\s*코어|코어)/g, '$1동 $2층 ');
    s = s.replace(/(\d{1,4}\s*동)\s*(\d{1,2})\s+(?=\d+\s*코어)/g, '$1 $2층 ');
    s = s.replace(/\b(\d{1,2})[358측증]\b(?=\s*(?:\d+\s*코어|코어|PIT|피트))/g, '$1층');

    if (/^(?:1?(?:10[1-9]|1[1-9]\d)[385]?|\d{3,5})$/.test(s)) {
      const mMatch = s.match(/1?(10[1-9]|1[1-9]\d)[385]?/);
      if (mMatch && mMatch[1]) return `${mMatch[1]}동`;
    }
    s = s.replace(/\b1?(10[1-9]|1[1-9]\d)[385등]\b(?!\s*동)/g, '$1동');

    const mSecond = s.match(/(?:\d{1,4}\s*동|상가동|주차장동|본동|복리시설동)?(?:\s*(?:지[상하]\s*\d+\s*층|\d+\s*층|\d+\s*코어|코어|PIT|피트|옥상|지붕|단부|계단실|EV홀|E\/V\s*최상부|복도|주차장|상가동|후면|전면|측면|외부|내부|동측|서측|남측|북측|외부비계|워킹타워|\d+구간|\w+구간|외벽|내벽|슬래브|바닥|천장))+/i);
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
    return c.split('\n')[0].replace(/^[①②③④⑤⑥⑦⑧⑨⑩\d)\-•\s]+/, '').trim();
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
      .replace(/(?:\[?\s*(?:HAT|점검단)\s*제안\]?|시스템\s*개선|교육\/코칭)[\s\S]*$/gi, '')
      .replace(/oo\s*(?:Tle|기느으|기느|기|©)[\s\S]*?(?=-|[가-힣])/gi, '')
      .replace(/(?:EE\s*tee|ee\s*A\s*eA|바가\s*---|\btee\s*ee\b|ATER\s*TH|isdios|SHE\s*SEA|[—\-_]{3,})[\s\S]*$/gi, '')
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
      const isBulletStart = /^[-•*·▪]\s*|^\d+[\).]/s.test(l);
      let text = l.replace(/^[|\sㅣ¦_!\-•·~—*.©=]+/, '').replace(/^\d+[\).]\s*/, '').replace(/^[|\sㅣ¦_!\-•·~—*.©=]+/, '').replace(/[|\sㅣ¦_!~—\-*]+$/, '').trim();
      if (!text || text.length < 2) continue;
      if (/^\[?\s*(?:관리자|근로자|관계자|담당자|시공자|해당\s*근로자)?\s*의견\s*[:;：]/i.test(text)) continue;
      if (items.length === 0 || isBulletStart) {
        items.push(text);
      } else {
        items[items.length - 1] = norm?.joinWrappedKoreanLines
          ? norm.joinWrappedKoreanLines(items[items.length - 1], text)
          : `${items[items.length - 1]} ${text}`.replace(/\s+/g, ' ');
      }
    }
    if (items.length === 0) return '';
    return items.map(it => {
      const h = healSafetyKoreanLexicon(it);
      return `- ${norm?.normalizeKoreanSpacing ? norm.normalizeKoreanSpacing(h) : h}`;
    }).join('\n');
  }

  function cleanProposalText(txt) {
    if (!txt) return '';
    let s = healSafetyKoreanLexicon(String(txt))
      .replace(/\[?(?:점검단|HAT)\s*제안\]?/gi, '')
      .replace(/시스템\s*개선|교육\s*[\/·]\s*코칭|제재\s*[\/·]\s*징계|패널티|페널티|\((?:현장\s*)?모니터링\s*강화\)|\(이행강화안\s*수립\)|\(\s*(?:근로자|협력사|작업팀|해당\s*작업팀)\s*교육\s*\)|\(\s*해당\s*작업팀\s*대기\s*\)|\(관리감독자\s*경고\)/gi, '')
      .replace(/^(?:[-•*·▪\s]*)(?:De\s*T=?\s*©?|oo\s*Tle\s*©?|구시\s*으\s*기느으|oo\s*기느으|구시\s*으|기느으|-?\s*SHE\s*SEA)[\s\S]*?(?=\d|1차|-|[가-힣]{2})/gi, '')
      .replace(/De\s*T=?\s*©?|구시\s*으\s*기느으|oo\s*Tle\s*©?|oo\s*기느으|SHE\s*SEA/gi, '')
      .replace(/(?:EE\s*tee|ee\s*A\s*eA|바가\s*---|\btee\s*ee\b|ATER\s*TH|isdios|[—\-_]{3,})[\s\S]*$/gi, '')
      .replace(/[\s|ㅣ¦_!~—\-]*[블를클르|ㅣ¦_!~—\-]+$/g, '')
      .trim();

    // 인라인 명시적 불릿(-)만 줄바꿈 처리 (영문/괄호 시작 불릿 포함)
    s = (typeof window !== 'undefined' && window.SafeTextNormalizer?.splitInlineBullets)
      ? window.SafeTextNormalizer.splitInlineBullets(s)
      : s.replace(/(?:(?<=[.!?\]\)])\s*|(?<=[가-힣A-Za-z0-9])\s+)[-•*·▪]\s*(?=[가-힣A-Za-z0-9(\[])/g, '\n- ');

    const rawLines = s.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const items = [];
    for (const line of rawLines) {
      const isBulletStart = /^[-•*·▪]\s*|^\d+[\).]/s.test(line);
      let cl = line.replace(/^[|\sㅣ¦_!\-•·~—*.©=]+/, '').replace(/^\d+[\).]\s*/, '').replace(/^[|\sㅣ¦_!\-•·~—*.©=]+/, '').replace(/[|\sㅣ¦_!~—\-*]+$/, '').trim();
      if (!cl || cl.length < 2 || /^[블를클르]$/.test(cl)) continue;
      if (items.length === 0 || isBulletStart) {
        items.push(cl);
      } else {
        items[items.length - 1] = window.SafeTextNormalizer?.joinWrappedKoreanLines
          ? window.SafeTextNormalizer.joinWrappedKoreanLines(items[items.length - 1], cl)
          : `${items[items.length - 1]} ${cl}`.replace(/\s+/g, ' ');
      }
    }
    return items.map(it => {
      const h = healSafetyKoreanLexicon(it);
      return `- ${window.SafeTextNormalizer?.normalizeKoreanSpacing ? window.SafeTextNormalizer.normalizeKoreanSpacing(h) : h}`;
    }).join('\n');
  }

  function cleanActionPlan(txt) {
    if (!txt) return '';
    const rawStr = healSafetyKoreanLexicon(String(txt));
    if (rawStr.includes('보완/개선') && rawStr.includes('Process')) {
      return '- 비계 승인점검 후 보완/개선 필요사항 조치완료 후 최종승인 및 Tag 부착 Process 이행';
    }
    let cleanedStr = rawStr
      .replace(/\[?\s*PM\s*판정\s*결과\s*\]?/gi, '')
      .replace(/시스템\s*개선|교육\s*[\/·]\s*코칭|제재\s*[\/·]?\s*징계|패널티|페널티/gi, '')
      .replace(/\((?:현장\s*)?모니터링\s*강화\)|\(\s*모니터링\/점검강화\s*\)|\(이행강화안\s*수립\)|\(\s*(?:근로자|협력사)\s*교육\s*\)|\(관리감독자\s*경고\)|\(\s*해당\s*작업팀\s*대기\s*\)|\(\s*작업팀\s*교육\s*\)/g, '')
      .replace(/(?:EE\s*tee|ee\s*A\s*eA|바가\s*---|\btee\s*ee\b|ATER\s*TH|isdios|[—\-_]{3,})[\s\S]*$/gi, '');
    cleanedStr = (typeof window !== 'undefined' && window.SafeTextNormalizer?.splitInlineBullets)
      ? window.SafeTextNormalizer.splitInlineBullets(cleanedStr)
      : cleanedStr.replace(/(?:(?<=[.!?\]\)])\s*|(?<=[가-힣A-Za-z0-9])\s+)[-•*·▪]\s*(?=[가-힣A-Za-z0-9(\[])/g, '\n- ');
    cleanedStr = cleanedStr
      .replace(/,\s*-\s*/g, '\n- ')
      .trim();

    const rawLines = cleanedStr.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const items = [];

    for (const line of rawLines) {
      const hasExplicitBullet = /^[-•*·▪.]\s*|^\d+[\).]/s.test(line);
      let cl = line.replace(/^[|\sㅣ¦_!~—\-*•·.\s&]+/, '').replace(/^\d+[\).]\s*/, '').replace(/^[|\sㅣ¦_!~—\-*•·.\s&]+/, '').replace(/[|\sㅣ¦_!~—\-&]+$/, '').trim();
      if (!cl || cl.length < 2) continue;
      if (/(?:사각후크|그림\s*참조|상하\s*방향|900mm|보강\s*예|시스템\s*개선|교육\s*[\/·]\s*코칭|제재\s*[\/·]?\s*징계|해당\s*작업팀\s*대기|작업팀\s*교육)/i.test(cl) || /[&제테텍레]{3,}/.test(cl)) continue;

      if (cl.includes('비계 승인점검 후 보완/개선') || cl.includes('Process 이행')) {
        return '- 비계 승인점검 후 보완/개선 필요사항 조치완료 후 최종승인 및 Tag 부착 Process 이행';
      }

      if (items.length === 0 || hasExplicitBullet) {
        items.push(cl);
      } else {
        items[items.length - 1] = window.SafeTextNormalizer?.joinWrappedKoreanLines
          ? window.SafeTextNormalizer.joinWrappedKoreanLines(items[items.length - 1], cl)
          : `${items[items.length - 1]} ${cl}`.replace(/\s+/g, ' ');
      }
    }

    return items.map(it => {
      const h = healSafetyKoreanLexicon(it);
      return `- ${window.SafeTextNormalizer?.normalizeKoreanSpacing ? window.SafeTextNormalizer.normalizeKoreanSpacing(h) : h}`;
    }).join('\n');
  }
  function cleanContent(txt) {
    if (!txt) return '';
    let s = healSafetyKoreanLexicon(String(txt))
      .replace(/^부적합\s*(?:내용|사항)\s*[:;：]?\s*/, '')
      .replace(/^[|ㅣ¦_!~\-\s]+/, '')
      .replace(/(?:EE\s*tee|ee\s*A\s*eA|바가\s*---|\btee\s*ee\b|ATER\s*TH|isdios|eevee|[—\-_]{3,})[\s\S]*$/gi, '')
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
                const hasExplicitPm = Boolean(
                  fallbackRecord._hasExplicitPmVerdict ||
                  (Array.isArray(fallbackRecord.pmVerdictItems) && fallbackRecord.pmVerdictItems.length > 0)
                );
                const hasSheetPropType = Boolean(
                  fallbackRecord._hasExplicitPropType ||
                  (Array.isArray(fallbackRecord.proposalItems) && fallbackRecord.proposalItems.length > 0 && fallbackRecord.inspectorOpinionType)
                );
                if (!hasSheetPropType) {
                  fallbackRecord.inspectorOpinionType = incomingPm;
                }
                if (!hasExplicitPm) {
                  fallbackRecord.pmVerdict = incomingPm;
                  fallbackRecord.pmVerdictType = incomingPm;
                }
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
                    .replace(/^.*?(?:점검자|적검자|점겸자|정검자|서검자|섬검자)\s*[:：.;]?\s*/g, '')
                    .replace(/[^가-힣a-zA-Z0-9\s]/g, '')
                    .trim();
                  if (insCleaned.length >= 2 && !/^(?:점검자|적검자|점겸자|정검자|서검자|섬검자)$/i.test(insCleaned)) {
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
      interviewAuthor: (parsedMulti?.hasMulti && parsedMulti.authorsText) ? parsedMulti.authorsText : (fallbackRecord.interviewAuthor || '시공관리자 및 근로자'),
      interviewAuthorTitle: (parsedMulti?.hasMulti && parsedMulti.primaryTitle) ? parsedMulti.primaryTitle : (fallbackRecord.interviewAuthorTitle || `[관리자 의견 : ${fallbackRecord.interviewAuthor || '시공관리자 및 근로자'}]`),
      interviewOpinion: cleanedOpinion,
      interviewOpinions: (parsedMulti?.sections && parsedMulti.sections.length >= 2) ? parsedMulti.sections : (fallbackRecord.interviewOpinions || []),
      auditProposal: cleanProposalText(fallbackRecord.auditProposal),
      actionPlan: cleanActionPlan(fallbackRecord.actionPlan),
      countermeasure: cleanActionPlan(fallbackRecord.actionPlan || fallbackRecord.countermeasure),
      inspectorOpinionType: fallbackRecord.inspectorOpinionType || ((fallbackRecord._aiCleaned || cleanedContent) ? '시스템 개선' : ''),
      pmVerdict: fallbackRecord.pmVerdict || ((fallbackRecord._aiCleaned || cleanedContent) ? '시스템 개선' : ''),
      pmVerdictType: fallbackRecord.pmVerdictType || fallbackRecord.pmVerdict || ((fallbackRecord._aiCleaned || cleanedContent) ? '시스템 개선' : ''),
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
    const wm = String(rawMethod || '').trim();
    const wg = String(workGroup || '').trim();
    const contentText = String(content || '').trim();
    const strippedContent = contentText
      .replace(/흙막이\s*(?:상부|상단|하부|주변|근생|구간)\s*[:：]?/g, ' ')
      .trim();
    const hasElectrical = wg === '가설전기공사' || ELECTRICAL_SIGNAL_RE.test(`${wg} ${contentText}`);
    const hasGenuineDemolition = GENUINE_DEMOLITION_RE.test(contentText);
    const hasGenuineExcavation = GENUINE_EXCAVATION_RE.test(strippedContent);

    if (hasElectrical && !hasGenuineDemolition && !hasGenuineExcavation) {
      if (!wm || wm === '해체작업' || wm === '굴착작업') {
        return '설치조립작업';
      }
    }
    if (wm === '굴착작업' && !hasGenuineExcavation && /흙막이\s*(?:상부|상단|주변|근생)/.test(`${location || ''} ${contentText}`)) {
      return hasElectrical ? '설치조립작업' : '고소작업';
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

  function resolveLawWithTieredMemory(rec) {
    if (!rec || typeof rec !== 'object') return { spec: null, needAi: false, garbled: false, priorityTier: 'needs_ai_law' };
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
      return { spec, needAi: false, garbled: false, priorityTier: rec._lawSource };
    }

    // 2순위: 원본 공란/깨짐/모순 시 학습된 안전작업지침 조회
    if (mem && typeof mem.lookup === 'function') {
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
        return { spec: { ...spec, title: rec.rawLaw, body: rec.lawBody, needsAiLaw: false }, needAi: false, garbled: false, priorityTier: 'learned_guideline' };
      }
    }

    // 3순위: 하드코딩 조문을 지어내지 않고 모순된 값만 제거한 뒤 AI 판단 플래그 활성화
    if (spec.mismatchReason) {
      if (!spec.title) {
        if (rec.law && /(?:직?[계게개]차|지[계개제]차|제172조|유도자|제332조|거푸집동바리)/.test(rec.law)) {
          rec.law = '';
        }
        // 지침 코드([IZ12B-...])와 깨진 원문 힌트는 AI 복원용으로 보존 가능(단, 비지침 도메인 모순은 비움)
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
    return { spec, needAi, garbled, priorityTier: needAi ? 'needs_ai_law' : 'original_valid' };
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
    records.forEach((rec) => {
      if (!rec) return;
      resolveLawWithTieredMemory(rec);
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
      if (!isAiAuthored && (!preserveAiFields || !rec.workMethod)) {
        if ((!rec.workMethod || (rec.workMethod === '설치조립작업' && /하역운반작업|양중작업|굴착작업|해체작업/.test(r.workMethod || ''))) && r.workMethod) {
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
   * [v2.0 신규] 다건 묶음(Multi-Page Batch) 표준 분류 및 핀포인트 오타 패치 (최대 8~10페이지 당 1회 호출)
   * - PaddleOCR v5가 추출한 원문은 그대로 보존하면서, 건설안전 9x9 분류표 매핑과 typoPatches만 일괄 수신
   */
  async function classifyBatchRecords(records = []) {
    if (!Array.isArray(records) || records.length === 0) return records;
    const forceLocal = storage.getItem('sp_ai_provider') === 'local';
    if (forceLocal || Date.now() < _cfQuotaCooldownUntil || Date.now() < _cfTransientBackoffUntil) {
      return applyLocalTaxonomyToRecords(records);
    }

    const tierStates = records.map(rec => resolveLawWithTieredMemory(rec));
    const items = records.map((rec, idx) => {
      const ts = tierStates[idx] || {};
      return {
        pageIndex: rec.pageNumber || rec.slideNumber || (idx + 1),
        severityHint: rec.severity || '중부적합',
        needsAiLaw: Boolean(ts.needAi),
        hasGarbledLaw: Boolean(ts.garbled),
        guidelineCode: ts.spec?.code || '',
        lawPriorityTier: ts.priorityTier || 'needs_ai_law',
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
          banner: rec._rawCellTexts?.banner || rec.photoBanner || '',
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

    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 24000);
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
          _cfTransientBackoffUntil = Date.now() + 15 * 1000;
        }
        return applyLocalTaxonomyToRecords(records);
      }
      const data = await res.json();
      if (data?.quotaExceeded) {
        _cfQuotaCooldownUntil = Date.now() + 20 * 60 * 1000;
        return applyLocalTaxonomyToRecords(records);
      }
      if (String(data?.source || '').includes('rule')) {
        return applyLocalTaxonomyToRecords(records);
      }
      if (Array.isArray(data?.results)) {
        const mapByPage = new Map();
        for (const r of data.results) {
          if (r && r.pageIndex !== undefined) mapByPage.set(Number(r.pageIndex), r);
        }
        records.forEach((rec, idx) => {
          const pKey = Number(rec.pageNumber || rec.slideNumber || (idx + 1));
          const aiItem = mapByPage.get(pKey) || data.results[idx];
          if (!aiItem) return;
          const taxFields = [
            'workMethod', 'agentMajor', 'agentMid', 'agentMinor',
            'hazardType', 'condition', 'action',
            'rootCauseMgmt', 'rootCauseSystem', 'stakeholder'
          ];
          for (const f of taxFields) {
            if (aiItem[f]) rec[f] = aiItem[f];
          }
          // 장표 원문 공종명을 표준 분류표(작업분류표.jpg: PC공사, 거푸집동바리공사, 창호공사(PL), 가설전기공사 등) 기준으로 정규화
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
          // 1) AI 전수 교정(edits 또는 fixedFields: 띄어쓰기 + 스캔 오탈자 + [관련 기준] 제목/본문 교정) 우선 반영
          // 단, Selective Vision Rescue(_visionCleaned)로 픽셀 직독 완료된 레코드는 텍스트 재추론으로 덮어쓰지 않음
          const aiPatchObj = (aiItem.edits && typeof aiItem.edits === 'object')
            ? aiItem.edits
            : ((aiItem.fixedFields && typeof aiItem.fixedFields === 'object') ? aiItem.fixedFields : null);
          if (!rec._visionCleaned && aiPatchObj) {
            const ff = aiPatchObj;
            const applyFixedField = (key, rawVal, cleanerFn, syncKey, maxRatio = 1.85) => {
              if (typeof rawVal !== 'string') return;
              const v = rawVal.trim();
              const orig = String(rec[key] || '').trim();
              if (!v || /\uFFFD/.test(v) || isFieldKeyLiteral(v)) return;
              if (!orig && !['rawLaw', 'lawBody', 'law', 'photoBanner'].includes(key)) return;
              const vCompactLen = v.replace(/\s+/g, '').length;
              const oCompactLen = orig.replace(/\s+/g, '').length;
              const minRatio = key === 'rawLaw' ? 0.15 : (key === 'lawBody' ? 0.25 : 0.40);
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
            applyFixedField('location', ff.location, null);
            applyFixedField('content', ff.content, cleanContent);
            applyFixedField('interviewOpinion', ff.interview || ff.interviewOpinion, cleanOpinionText);
            syncParsedOpinionsOnRecord(rec);
            applyFixedField('auditProposal', ff.proposalText || ff.auditProposal, cleanProposalText);
            applyFixedField('actionPlan', ff.countermeasure || ff.actionPlan, cleanActionPlan, 'countermeasure');
            const recTierState = tierStates[idx] || {};
            if (recTierState.priorityTier !== 'original_valid') {
              applyFixedField('rawLaw', ff.rawLaw || ff.lawRaw || aiItem.rawLaw, null, null, 2.8);
              applyFixedField('lawBody', ff.lawBody, null, null, 3.0);
            } else if (ff.lawBody && String(ff.lawBody).length >= String(rec.lawBody || '').length * 0.7) {
              applyFixedField('lawBody', ff.lawBody, null, null, 3.0);
            }
          }
          const rawBannerOrigBeforePatch = String(rec._rawCellTexts?.banner || rec.photoBanner || '').trim();
          const hasTypoPatchForBanner = Boolean(
            aiItem.typoPatches &&
            typeof aiItem.typoPatches === 'object' &&
            Object.keys(aiItem.typoPatches).some(bad => bad && rawBannerOrigBeforePatch.includes(bad))
          );
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
          const rawBannerOrig = rawBannerOrigBeforePatch;
          const rawBannerFromSheet = normBannerFn(rawBannerOrig);
          const aiBanner = normBannerFn(String(aiItem.photoBanner || aiPatchObj?.photoBanner || aiPatchObj?.banner || '').trim());
          const hasUsefulSpaces = (s) => /\s/.test(s) || s.length < 10;
          const isTruncatedRawBanner = (s) => /\([^)]*$/.test(s) || /(?:상태로|않는|없는|하는|되는|있는)$/.test(String(s || '').trim());
          const isLocBanner = (s) => typeof window !== 'undefined' && window.SafeTextNormalizer?.isLocationOnlyBanner?.(s, rec.location);
          const isGenericAiBanner = (s) => /^(?:안전기준\s*미준수|현장\s*부적합\s*작업\s*전경|안전시설\s*불량)$/.test(String(s || '').trim());
          const canUseAiBanner = Boolean(
            aiBanner && !isLocBanner(aiBanner) && !isGenericAiBanner(aiBanner) && !/\uFFFD/.test(aiBanner) &&
            aiBanner !== (rec.content || '').trim() && !isTruncatedRawBanner(aiBanner) && aiBanner.length >= 4
          );
          if (rec._visionCleaned && rec.photoBanner && !isLocBanner(rec.photoBanner)) {
            rec.photoBanner = cleanBannerText(rec.photoBanner, rec.content, rec.location);
          } else if (canUseAiBanner) {
            // AI가 유효한 요약 배너를 생성한 경우 raw OCR 잔존 오타/절단보다 AI 판단 결과를 최우선 채택
            rec.photoBanner = cleanBannerText(aiBanner, rec.content, rec.location) || aiBanner;
          } else if (rawBannerFromSheet && !isLocBanner(rawBannerFromSheet) && hasUsefulSpaces(rawBannerFromSheet) && !isTruncatedRawBanner(rawBannerFromSheet)) {
            rec.photoBanner = cleanBannerText(rawBannerFromSheet, rec.content, rec.location);
          } else if (rawBannerFromSheet && !isLocBanner(rawBannerFromSheet)) {
            rec.photoBanner = cleanBannerText(rawBannerFromSheet, rec.content, rec.location);
          } else {
            rec.photoBanner = summarizeContentToBanner(rec.content);
          }
          const recTierForLaw = tierStates[idx] || {};
          if (recTierForLaw.priorityTier !== 'original_valid' || !rec.law) {
            if (aiItem.law && !/^(?:산업안전보건(?:기준에\s*관한\s*)?규칙|안전보건규칙)$/.test(String(aiItem.law).trim())) {
              rec.law = aiItem.law;
              if (!rec.rawLaw) rec.rawLaw = aiItem.law;
            }
          }
          const finalLawState = resolveLawWithTieredMemory(rec);
          if (!finalLawState.needAi && rec.rawLaw && rec.lawBody) {
            getGuidelineMemory()?.learnFromRecord?.(rec, 'ai_batch');
          }
          rec._aiCleaned = true;
        });
        return applyLocalTaxonomyToRecords(records, { preserveAiFields: true });
      }
    } catch (e) {
      _cfTransientBackoffUntil = Date.now() + 15 * 1000;
      console.warn('[SafePatrol] classifyBatchRecords fallback to local taxonomy:', e);
      return applyLocalTaxonomyToRecords(records);
    }
    return applyLocalTaxonomyToRecords(records);
  }

  /**
   * [v2.0 신규] 현장 직접 등록 모드(Guided Complete): 1줄 핵심 키워드로 부적합 개요·법규·인터뷰·대책 자동 완성
   */
  async function completeGuidedRecord({ memo = '', workGroup = '거푸집동바리공사', workMethod = '설치조립작업', severity = '중부적합' } = {}) {
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
        if (rec.interviewOpinion) rec.interviewOpinion = cleanOpinionText(norm.normalizeFieldText(rec.interviewOpinion, 'interview'));
        if (rec.auditProposal) rec.auditProposal = cleanProposalText(norm.normalizeFieldText(rec.auditProposal, 'proposalText'));
        if (rec.actionPlan) {
          rec.actionPlan = cleanActionPlan(norm.normalizeFieldText(rec.actionPlan, 'actionPlan'));
          rec.countermeasure = rec.actionPlan;
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
      const CHUNK_SIZE = 8;
      for (let start = 0; start < records.length; start += CHUNK_SIZE) {
        const chunk = records.slice(start, start + CHUNK_SIZE);
        if (typeof onProgress === 'function') {
          onProgress(`🤖 AI 최종 검증 중 (${Math.min(start + chunk.length, records.length)}/${records.length})...`);
        }
        const chunkLawStates = chunk.map(rec => resolveLawWithTieredMemory(rec));
        const items = chunk.map((rec, localIdx) => {
          const st = chunkLawStates[localIdx] || {};
          return {
            pageIndex: rec.pageNumber || rec.slideNumber || (start + localIdx + 1),
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
            needsAiLaw: Boolean(st.needAi),
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
          const timer = setTimeout(() => ctrl.abort(), 25000);
          const res = await fetch(`${CLOUDFLARE_AI_URL}/api/ai-analyze`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mode: 'verify_review', items }),
            signal: ctrl.signal
          });
          clearTimeout(timer);
          if (!res.ok) {
            if (res.status === 429) _cfQuotaCooldownUntil = Date.now() + 20 * 60 * 1000;
            else _cfTransientBackoffUntil = Date.now() + 15 * 1000;
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
              if (candBanner && typeof candBanner === 'string' && !/\uFFFD/.test(candBanner) && !isFieldKeyLiteral(candBanner)) {
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
                if (!preserveOrigTitle || healedBody.length >= String(rec.lawBody || '').length * 0.7) {
                  rec.lawBody = healedBody;
                }
              }
              if (typeof corr.content === 'string' && corr.content.trim() && !/\uFFFD/.test(corr.content)) rec.content = cleanContent(corr.content);
              if (typeof corr.location === 'string' && corr.location.trim() && !/\uFFFD/.test(corr.location)) rec.location = cleanLocation(corr.location, rec.content);
              if (typeof corr.interviewOpinion === 'string' && corr.interviewOpinion.trim()) {
                rec.interviewOpinion = cleanOpinionText(corr.interviewOpinion);
                syncParsedOpinionsOnRecord(rec);
              }
              if (typeof corr.auditProposal === 'string' && corr.auditProposal.trim()) rec.auditProposal = cleanProposalText(corr.auditProposal);
              if (typeof corr.actionPlan === 'string' && corr.actionPlan.trim()) {
                rec.actionPlan = cleanActionPlan(corr.actionPlan);
                rec.countermeasure = rec.actionPlan;
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

  return {
    checkConnection,
    quickRuleAnalysis,
    streamAnalyzeSafetyText,
    cleanOcrRecord,
    classifyBatchRecords,
    verifyRecordsBeforeSave,
    isQuotaCoolingDown,
    completeGuidedRecord,
    getEndpoint: () => currentEndpoint,
    setEndpoint: ep => { currentEndpoint = ep; storage.setItem('sp_lmstudio_endpoint', ep); },
    setModel: m => { currentModel = m; storage.setItem('sp_lmstudio_model', m); },
    getModel: () => currentModel,
    isConnected: () => isConnected
  };
});

