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

  /**
   * Qwen AI를 활용한 장표 OCR 텍스트 지능형 정제 및 필드 복원
   */
  async function cleanOcrRecord(rawOcrText, fallbackRecord) {
    if (!rawOcrText || rawOcrText.trim().length < 10) return fallbackRecord;

    const systemPrompt = `너는 건설현장 패트롤 안전점검 장표 OCR 텍스트 정제 전문가 AI이다.
주어진 OCR 원문 텍스트에서 안전점검 항목을 정확히 추출하여 오직 유효한 JSON 하나만 반환하라.
반드시 아래 JSON 키를 포함해야 한다:
{
  "subcontractor": "협력사명 (예: 원영건업(주))",
  "workGroup": "공종명 (예: 거푸집동바리공사)",
  "location": "작업장소 (예: 108동)",
  "inspectUser": "점검자 (예: 신우석 프로)",
  "inspectRound": "점검차수 (예: '26년 下 3차)",
  "content": "부적합 지적내용 전문",
  "severity": "중부적합 또는 경부적합",
  "type": "충돌/협착 또는 낙하 또는 추락 등",
  "law": "관련 기준 또는 법규",
  "mgmtCauses": ["계획 미이행", "불안전 행동" 등],
  "interviewOpinion": "시공관리자/근로자 의견",
  "auditProposal": "점검단 제안",
  "pmVerdict": "PM 판정결과"
}`;

    // 1. LM Studio 로컬 서버 연결 시도
    for (const ep of [currentEndpoint, ...DEFAULT_ENDPOINTS]) {
      try {
        const ctrl = new AbortController();
        const timeout = setTimeout(() => ctrl.abort(), 6000);
        const res = await fetch(`${ep}/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: currentModel,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: `[OCR 텍스트 원문]:\n${rawOcrText}` }
            ],
            temperature: 0.1,
            max_tokens: 800
          }),
          signal: ctrl.signal
        });
        clearTimeout(timeout);
        if (res.ok) {
          const data = await res.json();
          let text = data.choices?.[0]?.message?.content || data.choices?.[0]?.message?.reasoning_content || '';
          const parsed = extractJSON(text);
          if (parsed && (parsed.content || parsed.subcontractor)) {
            return { ...fallbackRecord, ...parsed };
          }
        }
      } catch (e) {}
    }

    return fallbackRecord;
  }

  return {
    checkConnection,
    quickRuleAnalysis,
    streamAnalyzeSafetyText,
    cleanOcrRecord,
    getEndpoint: () => currentEndpoint,
    setEndpoint: ep => { currentEndpoint = ep; localStorage.setItem('sp_lmstudio_endpoint', ep); },
    getModel: () => currentModel,
    setModel: m => { currentModel = m; localStorage.setItem('sp_lmstudio_model', m); },
    isConnected: () => isConnected
  };
});

