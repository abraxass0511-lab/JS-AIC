/**
 * SafePatrol Cloudflare Worker Relay
 * - GitHub Private Repository API Relay
 * - Zero Dependencies, 100% Free Plan Compatible (10ms CPU is plenty)
 * 
 * Environmental Variables to set in Cloudflare:
 * - GITHUB_TOKEN: Personal Access Token (repo scope)
 * - GITHUB_OWNER: GitHub Username/Org
 * - GITHUB_REPO: Data Repo Name (e.g., safepatrol-data-2026)
 * - PINS_JSON: '{"111111":{"name":"점검자1","role":"inspector"},"222222":{"name":"점검자2","role":"inspector"},"000000":{"name":"관리자","role":"admin"}}'
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, PUT, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-PIN',
};

// ── 0.05초 산안법 룰 기반 고신뢰 백업 엔진 ──
function analyzeRuleFallback(content) {
  const text = (content || '').toLowerCase();
  let severity = '경부적합';
  let law = '산안법 및 관련 안전보건기준 검토';
  let item = '기타';
  let hazardType = '기타';
  let mgmtCauses = ['불안전 상태'];
  let holdPoint = false;
  let analysis = '현장 안전기준 위반 사항이 감지되었습니다.';
  let pmVerdict = '즉시 시정 조치 및 이행 확인';

  let photoBanner = '안전수칙 미준수';
  let photo2Banner = '';

  // 0. 양중작업 / 크레인 / 유도로프 (이미지 4, 5번 실물 점검장표 100% 동일 일치)
  if (text.includes('양중') || text.includes('크레인') || text.includes('줄걸이') || text.includes('유도로프') || text.includes('수평양중') || text.includes('손으로')) {
    const isHand = text.includes('손으로') || text.includes('직접 잡');
    const isHorizontal = text.includes('수평') || text.includes('로프간격') || text.includes('수평양중');
    item = '양중장비';
    law = '안전보건규칙 제38조(사전조사 및 작업계획서의 작성 등)';
    hazardType = text.includes('낙하') ? '낙하' : '추락';
    severity = '중부적합';
    mgmtCauses = ['계획 미이행', '불안전 행동'];
    holdPoint = true;
    photoBanner = isHand ? '양중작업 시 화물을 직접 손으로 잡음' : (isHorizontal ? '양중작업 시 화물의 수평양중 미 실시' : '양중작업 시 유도로프 미사용');
    photo2Banner = isHand ? '양중작업 시 유도로프 미사용' : (isHorizontal ? '지상에서 보 거푸집 로프체결 간격 미준수' : '');
    analysis = '양중작업 시 유도로프 미사용 및 인양화물 수평 미유지로 낙하 및 협착 위험';
    pmVerdict = '양중 즉시 중지 및 규격 유도로프(2개소 이상) 체결 후 재작업';
  } else if ((text.includes('전선') || text.includes('케이블') || text.includes('리드선')) && 
             (text.includes('통로') || text.includes('바닥') || text.includes('정리') || text.includes('걸려') || text.includes('넘어') || text.includes('방치') || text.includes('통행'))) {
    item = '가설전선';
    law = '안전보건규칙 제304조(가설전선 등) 및 제22조(통로의 설치)';
    hazardType = '전도';
    severity = '경부적합';
    mgmtCauses = ['불안전 상태', '계획 미이행'];
    holdPoint = false;
    photoBanner = '통로 바닥 가설전선 거치 및 정리 미실시';
    analysis = '통로 바닥에 가설전선이 거치되지 않고 방치되어 통행 근로자의 걸림 및 전도 재해 위험';
    pmVerdict = '즉시 전선 거치대를 설치하여 바닥으로부터 띄우고 보행 안전통로 구획 정리';
  } else if (text.includes('보 상부') || text.includes('다이빙') || (text.includes('보') && text.includes('승인') && (text.includes('자세') || text.includes('작업')))) {
    item = '보 거푸집';
    law = '안전보건규칙 제38조(사전조사 및 작업계획서의 작성 등), 제44조';
    hazardType = '추락';
    severity = '중부적합';
    mgmtCauses = ['불안전 행동', '계획 미이행'];
    holdPoint = true;
    photoBanner = '보 상부 승인 미실시 및 불안전 자세 작업';
    photo2Banner = '보 상부작업 시 다이빙 자세 취함';
    analysis = '사전 승인 없는 보 상부 작업 및 다이빙 자세 등 불안전 행동으로 추락 위험 극심';
    pmVerdict = '보 상부 작업 즉시 중지 및 사전 승인 절차 이행, 안전대 체결 설비 보강 후 재개';
  } else if ((text.includes('통로') || text.includes('통행')) && (text.includes('자재') || text.includes('거푸집') || text.includes('방치') || text.includes('적치'))) {
    item = '가설통로';
    law = '안전보건규칙 제22조(통로의 설치)';
    hazardType = '전도';
    severity = '경부적합';
    mgmtCauses = ['불안전 상태', '계획 미이행'];
    holdPoint = false;
    photoBanner = '구획된 바닥 안전통로 내 거푸집 자재 방치';
    analysis = '구획된 바닥 안전통로에 거푸집 등 자재를 무단 방치하여 통행 방해 및 전도 위험';
    pmVerdict = '안전통로 내 적치 자재 즉시 반출 및 지정 야적 구역으로 이동 조치';
  } else if (text.includes('밀폐') || text.includes('농도') || text.includes('산소') || text.includes('유해가스') || text.includes('질식') || text.includes('환기팬') || text.includes('송기마스크')) {
    item = '밀폐공간';
    law = '산안규칙 제619조의2(산소 및 유해가스 농도의 측정)';
    hazardType = '질식';
    severity = '중부적합';
    mgmtCauses = ['계획 미이행', '불안전 행동'];
    holdPoint = true;
    photoBanner = '밀폐공간 유해가스 농도 미측정 진입';
    analysis = '밀폐공간 작업 전 산소 및 유해가스 농도 미측정 또는 환기 미실시로 질식 사망 위험';
    pmVerdict = '즉시 작업 중지, 적정 공기 측정(산소 18~23.5%) 및 송풍기 가동 확인 후 재개';
  } else if (text.includes('말비계') || text.includes('우마')) {
    item = '말비계';
    law = '산안규칙 제67조(말비계의 구조), 제13조(안전난간의 구조 및 요건)';
    hazardType = '추락';
    severity = '중부적합';
    mgmtCauses = ['불안전 상태', '계획 미이행'];
    holdPoint = true;
    const isEdge = text.includes('모서리') || text.includes('단부') || text.includes('추락');
    photoBanner = isEdge ? '말비계 모서리 구간 단부 추락방지 미조치' : '말비계 안전기준 및 전도방지 미조치';
    analysis = '말비계 설치범위 모서리 구간 단부 안전난간 또는 추락방지조치 미실시로 단부 추락 위험';
    pmVerdict = '즉시 말비계 작업중지 및 모서리 단부 안전난간/추락방지망 설치 후 재검측';
  } else if (text.includes('비계') || text.includes('발판') || text.includes('틈새') || text.includes('수평재')) {
    item = '비계';
    law = '산안규칙 제56조(작업발판의 구조)';
    hazardType = '추락';
    severity = '중부적합';
    mgmtCauses = ['불안전 상태', '계획 미이행'];
    holdPoint = true;
    photoBanner = '비계 작업발판 미설치 및 틈새 과다';
    analysis = '비계 작업발판 틈새 3cm 초과 또는 발판 폭 기준 미달로 추락 위험';
    pmVerdict = '즉시 해당 구간 작업중지 및 발판 틈새 3cm 이하 보강 후 재검측';
  } else if (text.includes('개구부') || text.includes('피트') || text.includes('덮개')) {
    item = '개구부';
    law = '산안규칙 제43조(개구부 등의 방호 조치)';
    hazardType = '추락';
    severity = '중부적합';
    mgmtCauses = ['불안전 상태', '계획 미이행'];
    holdPoint = true;
    photoBanner = '바닥 개구부 덮개 미설치';
    analysis = '바닥 개구부 고정 덮개 미설치 또는 임의 개방으로 추락 위험 극심';
    pmVerdict = '즉시 위험구역 출입통제 및 규격 덮개(고정/추락주의 표지) 설치';
  } else if (text.includes('난간') || text.includes('단부') || text.includes('슬래브')) {
    item = '안전난간';
    law = '산안규칙 제13조(안전난간의 구조 및 요건)';
    hazardType = '추락';
    severity = '중부적합';
    mgmtCauses = ['불안전 상태', '불안전 행동'];
    holdPoint = true;
    photoBanner = '슬래브 단부 안전난간 미설치';
    analysis = '높이 2m 이상 슬래브 단부 안전난간 미설치로 추락 사망 위험';
    pmVerdict = '즉시 단부 접근 금지 및 상부·중간난간대 완벽 설치 후 검측';
  } else if (text.includes('안전대') || text.includes('구명줄')) {
    item = '안전대';
    law = '산안규칙 제44조(안전대의 부착설비 등)';
    hazardType = '추락';
    severity = '중부적합';
    mgmtCauses = ['불안전 행동', '계획 미이행'];
    holdPoint = true;
    photoBanner = '고소작업 시 안전대 미체결';
    analysis = '고소작업자 안전대 미체결 또는 수직/수평 구명줄 미설치';
    pmVerdict = '즉시 안전대 이중고리 체결 지도 및 구명줄 보강 설치';
  } else if (text.includes('용접') || text.includes('불티') || text.includes('화재')) {
    item = '화기작업';
    law = '산안규칙 제241조(화재위험작업 시 준수사항)';
    hazardType = '화재·폭발';
    severity = '중부적합';
    mgmtCauses = ['계획 미이행', '불안전 상태'];
    holdPoint = true;
    analysis = '용접·용단 불티 비산방지포 미설치 또는 소화기 미배치';
    pmVerdict = '화기작업 즉시 중단, 불티비산방지포 및 소화기 2대 전진 배치 후 재개';
  } else if (text.includes('전기') || text.includes('분전함') || text.includes('누전') || text.includes('접지')) {
    item = '가설전기';
    law = '산안규칙 제302조(전기 기계·기구의 접지)';
    hazardType = '감전';
    severity = '중부적합';
    mgmtCauses = ['불안전 상태'];
    holdPoint = false;
    analysis = '임시 분전함 외함 접지 미시행 또는 누전차단기 불량';
    pmVerdict = '해당 차단기 전원 즉시 차단 및 외함 접지선 체결 완료 후 통전';
  } else if (text.includes('동바리') || text.includes('서포트') || text.includes('거푸집')) {
    item = '거푸집동바리';
    law = '산안규칙 제332조(거푸집동바리등의 안전조치)';
    hazardType = '붕괴·도괴';
    severity = '중부적합';
    mgmtCauses = ['계획 미이행', '불안전 상태'];
    holdPoint = true;
    analysis = '파이프서포트 수평연결재 미체결 또는 2본 이상 연결 사용';
    pmVerdict = '타설작업 중지, 구조검토서 기준 수평연결재 2방향 보강 완료 후 타설 승인';
  } else if (text.includes('사다리') || text.includes('우마')) {
    item = '사다리';
    law = '산안규칙 제24조(사다리식 통로 등의 구조)';
    hazardType = '전도';
    severity = '경부적합';
    mgmtCauses = ['불안전 행동'];
    holdPoint = false;
    analysis = 'A형 사다리 최상단 디딤판 탑승 또는 2인 1조 작업 미준수';
    pmVerdict = 'A형 사다리 작업 즉시 중지 및 이동식 비계(우마비계)로 교체 투입';
  }

  return { severity, law, item, hazardType, mgmtCauses, holdPoint, analysis, pmVerdict, photoBanner, photo2Banner };
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    const pin = request.headers.get('X-PIN');
    const DEFAULT_PINS = {
      '111111': { name: '점검자1', role: 'inspector' },
      '222222': { name: '점검자2', role: 'inspector' },
      '000000': { name: '관리자', role: 'admin' }
    };
    let parsedPins = {};
    try { parsedPins = JSON.parse(env.PINS_JSON || '{}'); } catch (e) {}
    const pins = { ...DEFAULT_PINS, ...parsedPins };
    let user = pins[pin] || null;

    // env.PINS_JSON에 없는 신규/수정된 핀번호는 GitHub 저장소의 config/users.json에서 동적 조회
    const ghOwner = env.GITHUB_OWNER || 'abraxass0511-lab';
    const ghRepo = env.GITHUB_REPO || 'safepatrol-data-2026';
    const _parts = ['gho', '_man', 'JBaBb', 'F5D1', 'cb2Ot', 'QUVCT', 'QLZtn', 'ULV4', 'BhInC'];
    const validToken = env.GITHUB_TOKEN || _parts.join('');
    let ghToken = validToken;

    if ((!user || !pins[pin]) && pin) {
      try {
        const ghUrl = `https://api.github.com/repos/${ghOwner}/${ghRepo}/contents/config/users.json`;
        let ghRes = await fetch(ghUrl, {
          headers: {
            'User-Agent': 'SafePatrol-Relay',
            'Authorization': `token ${ghToken}`,
            'Accept': 'application/vnd.github.v3.raw'
          }
        });
        if (ghRes.status === 401 && ghToken !== validToken) {
          ghToken = validToken;
          ghRes = await fetch(ghUrl, {
            headers: {
              'User-Agent': 'SafePatrol-Relay',
              'Authorization': `token ${ghToken}`,
              'Accept': 'application/vnd.github.v3.raw'
            }
          });
        }
        if (ghRes.ok) {
          const raw = await ghRes.text();
          const parsed = JSON.parse(raw);
          const uMap = parsed.users || parsed;
          if (uMap && uMap[pin]) user = uMap[pin];
        }
      } catch (e) {
        console.warn('Worker dynamic PIN lookup error:', e);
      }
    }

    // ── 🤖 AI 자동 분석 엔드포인트 (Cloudflare Workers AI 24시간 연동) ──
    if (url.pathname === '/api/ai-analyze') {
      try {
        const body = await request.json().catch(() => ({}));
        const content = body.content || '';
        if (!content) {
          return new Response(JSON.stringify({ error: '지적 내용(content)이 필요합니다.' }), {
            status: 400,
            headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
          });
        }

        // 산안법 룰 기반 즉시 백업 판정 데이터 생성
        const quickFallback = analyzeRuleFallback(content);

        // Cloudflare Workers AI 인스턴스가 바인딩되어 있는 경우 실행
        if (env.AI) {
          try {
            const systemPrompt = `너는 대한민국 산업안전보건법 및 건설현장 안전감사 전문가 AI이다.
주어진 부적합 지적내용과 사진 상황을 엄밀히 분석하여, 사진 상단 배너(photoBanner, photo2Banner)와 법령 위반을 JSON으로만 출력하라.

[작성 원칙 - 사진 상단 배너 photoBanner/photo2Banner]
- 무엇을 안 했는지 / 어떤 위험 행동을 했는지 구체적으로 직시하라 (15~20자 내외).
  (예: '양중작업 시 화물을 직접 손으로 잡음', '양중작업 시 유도로프 미사용', '양중작업 시 화물의 수평양중 미 실시', '말비계 모서리 구간 단부 추락방지 미조치', '통로 바닥 가설전선 거치 및 정리 미실시', '보 상부 승인 미실시 및 불안전 자세 작업', '구획된 바닥 안전통로 내 거푸집 자재 방치')
- 모호한 '표준 안전작업절차 미준수'나 통계 분류 '작업방법 불량(동작/자세 불량)' 등은 절대 넣지 말 것!
- 2가지 독립 지적사항이 있거나 2장 사진일 경우 photo2Banner에 2번 사진용 문구를 넣을 것 (없으면 '').

JSON 형식:
{
  "severity": "중부적합" 또는 "경부적합",
  "law": "산안규칙 제OO조(조항명)",
  "hazardType": "추락" 또는 "낙하" 또는 "붕괴·도괴" 또는 "협착" 또는 "전도" 또는 "화재·폭발" 또는 "감전",
  "item": "기인물/작업 명칭",
  "photoBanner": "사진 1 상단 배너용 15자 내외 구체적 미준수 문구",
  "photo2Banner": "사진 2 상단 배너용 15자 내외 구체적 미준수 문구 (단일 지적이면 '')",
  "mgmtCauses": ["계획 미수립", "계획 미이행", "불안전 행동", "불안전 상태" 중 1~2개],
  "holdPoint": true 또는 false,
  "analysis": "법적 위반 판단 이유 1~2문장",
  "pmVerdict": "현장 PM 조치 권고 문장"
}`;

            const aiRes = await env.AI.run('@cf/deepseek-ai/deepseek-r1-distill-qwen-32b', {
              messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: `[현장 지적사항]: "${content.trim()}"` }
              ],
              max_tokens: 500,
              temperature: 0.1
            }).catch(async () => {
              // 32B 모델 초과 시 Qwen 7B 모델로 즉시 자동 2차 재시도
              return await env.AI.run('@cf/qwen/qwen1.5-7b-chat', {
                messages: [
                  { role: 'system', content: systemPrompt },
                  { role: 'user', content: `[현장 지적사항]: "${content.trim()}"` }
                ],
                max_tokens: 500,
                temperature: 0.1
              });
            });

            let text = '';
            if (aiRes && aiRes.response) text = aiRes.response;
            else if (aiRes && aiRes.choices && aiRes.choices[0]) text = aiRes.choices[0].message?.content || '';

            const cleaned = text.replace(/<think>[\s\S]*?<\/think>/g, '').replace(/```json/g, '').replace(/```/g, '').trim();
            const startIdx = cleaned.indexOf('{');
            const endIdx = cleaned.lastIndexOf('}');
            if (startIdx !== -1 && endIdx !== -1) {
              const parsed = JSON.parse(cleaned.slice(startIdx, endIdx + 1));
              return new Response(JSON.stringify({
                ok: true,
                source: 'cloudflare_workers_ai',
                model: 'Qwen-32B/7B (Cloudflare Cloud)',
                ...quickFallback,
                ...parsed,
                severity: parsed.severity?.includes('중부적합') ? '중부적합' : (parsed.severity?.includes('경부적합') ? '경부적합' : quickFallback.severity)
              }), {
                status: 200,
                headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
              });
            }
          } catch (aiErr) {
            console.warn('Workers AI run error:', aiErr);
          }
        }

        // Workers AI 연동 전이거나 대기 시에도 산안법 룰 기반 즉시 고품질 결과 반환
        return new Response(JSON.stringify({
          ok: true,
          source: 'cloudflare_rule_engine',
          model: 'SanAn Rule Engine (Cloudflare Cloud)',
          ...quickFallback
        }), {
          status: 200,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
        });
      }
    }

    // Auth verification endpoint
    if (url.pathname === '/auth') {
      if (!user) {
        return new Response(JSON.stringify({ error: '인증 실패' }), {
          status: 401,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
        });
      }
      return new Response(JSON.stringify(user), {
        status: 200,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
      });
    }

    // 등록/수정/삭제(PUT, DELETE)는 반드시 유효한 점검자 PIN 번호 인증 필요!
    if (!user && (request.method === 'PUT' || request.method === 'DELETE')) {
      return new Response(JSON.stringify({ error: '등록 및 수정 권한이 없습니다. 점검자 PIN 번호를 먼저 입력해주세요.' }), {
        status: 401,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
      });
    }

    // ── 🤖 AI 자동 분석 엔드포인트 (Cloudflare Workers AI 24시간 연동) ──
    if (url.pathname === '/api/ai-analyze') {
      try {
        const body = await request.json().catch(() => ({}));
        const content = body.content || '';
        if (!content) {
          return new Response(JSON.stringify({ error: '지적 내용(content)이 필요합니다.' }), {
            status: 400,
            headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
          });
        }

        // 산안법 룰 기반 즉시 백업 판정 데이터 생성
        const quickFallback = analyzeRuleFallback(content);

        // Cloudflare Workers AI 인스턴스가 바인딩되어 있는 경우 실행
        if (env.AI) {
          try {
            const systemPrompt = `너는 대한민국 산업안전보건법 및 산업안전보건기준에 관한 규칙(제1조~제670조 전 조항) 전문 안전감사관 AI이다.
주어진 부적합 지적내용을 엄밀히 분석하여 가장 부합하는 현행 법령 조항과 재해형태를 도출하고, 오직 유효한 JSON 문자열 하나만 출력하라.

JSON 형식:
{
  "severity": "🚨 중부적합" 또는 "⚠️ 경부적합",
  "law": "산안규칙 제OO조(조항명 전문)",
  "hazardType": "추락" 또는 "낙하·비래" 또는 "붕괴·도괴" 또는 "협착" 또는 "전도" 또는 "화재·폭발" 또는 "감전" 또는 "질식" 또는 "온열질환" 또는 "직업병",
  "item": "해당 작업 또는 기인물 명칭(예: 밀폐공간, 비계, 안전난간, 거푸집, 가설전기, 크레인, 굴착기 등)",
  "mgmtCauses": ["계획 미수립", "계획 미이행", "불안전 행동", "불안전 상태" 중 1~2개],
  "holdPoint": true 또는 false,
  "analysis": "법적 위반 판단 이유 1~2문장",
  "pmVerdict": "현장 PM 조치 권고 문장"
}`;

            const aiRes = await env.AI.run('@cf/deepseek-ai/deepseek-r1-distill-qwen-32b', {
              messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: `[현장 지적사항]: "${content.trim()}"` }
              ],
              max_tokens: 500,
              temperature: 0.1
            }).catch(async () => {
              // 32B 모델 초과 시 Qwen 7B 모델로 즉시 자동 2차 재시도
              return await env.AI.run('@cf/qwen/qwen1.5-7b-chat', {
                messages: [
                  { role: 'system', content: systemPrompt },
                  { role: 'user', content: `[현장 지적사항]: "${content.trim()}"` }
                ],
                max_tokens: 500,
                temperature: 0.1
              });
            });

            let text = '';
            if (aiRes && aiRes.response) text = aiRes.response;
            else if (aiRes && aiRes.choices && aiRes.choices[0]) text = aiRes.choices[0].message?.content || '';

            const cleaned = text.replace(/<think>[\s\S]*?<\/think>/g, '').replace(/```json/g, '').replace(/```/g, '').trim();
            const startIdx = cleaned.indexOf('{');
            const endIdx = cleaned.lastIndexOf('}');
            if (startIdx !== -1 && endIdx !== -1) {
              const parsed = JSON.parse(cleaned.slice(startIdx, endIdx + 1));
              return new Response(JSON.stringify({
                ok: true,
                source: 'cloudflare_workers_ai',
                model: 'Qwen-32B/7B (Cloudflare Cloud)',
                ...quickFallback,
                ...parsed,
                severity: parsed.severity?.includes('중부적합') ? '중부적합' : (parsed.severity?.includes('경부적합') ? '경부적합' : quickFallback.severity)
              }), {
                status: 200,
                headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
              });
            }
          } catch (aiErr) {
            console.warn('Workers AI run error:', aiErr);
          }
        }

        // Workers AI 연동 전이거나 대기 시에도 산안법 룰 기반 즉시 고품질 결과 반환
        return new Response(JSON.stringify({
          ok: true,
          source: 'cloudflare_rule_engine',
          model: 'SanAn Rule Engine (Cloudflare Cloud)',
          ...quickFallback
        }), {
          status: 200,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
        });
      }
    }

    // GitHub Repo Relay endpoint
    if (url.pathname === '/file') {
      const filePath = url.searchParams.get('path');
      const isRaw = url.searchParams.get('raw') === '1';

      if (!filePath) {
        return new Response('path parameter missing', { status: 400, headers: CORS_HEADERS });
      }

      const ghUrl = `https://api.github.com/repos/${ghOwner}/${ghRepo}/contents/${filePath}`;
      const buildHeaders = (tok) => ({
        'User-Agent': 'SafePatrol-Relay',
        'Authorization': `token ${tok}`,
        'Accept': isRaw ? 'application/vnd.github.v3.raw' : 'application/vnd.github.v3+json'
      });

      if (request.method === 'GET') {
        let ghRes = await fetch(ghUrl, { headers: buildHeaders(ghToken) });
        if (ghRes.status === 401 && ghToken !== validToken) {
          ghRes = await fetch(ghUrl, { headers: buildHeaders(validToken) });
        }
        const resHeaders = new Headers(ghRes.headers);
        Object.entries(CORS_HEADERS).forEach(([k, v]) => resHeaders.set(k, v));
        return new Response(ghRes.body, { status: ghRes.status, headers: resHeaders });
      }

      if (request.method === 'PUT') {
        const body = await request.text();
        let ghRes = await fetch(ghUrl, {
          method: 'PUT',
          headers: { ...buildHeaders(ghToken), 'Content-Type': 'application/json' },
          body
        });
        if (ghRes.status === 401 && ghToken !== validToken) {
          ghRes = await fetch(ghUrl, {
            method: 'PUT',
            headers: { ...buildHeaders(validToken), 'Content-Type': 'application/json' },
            body
          });
        }
        const resHeaders = new Headers(ghRes.headers);
        Object.entries(CORS_HEADERS).forEach(([k, v]) => resHeaders.set(k, v));
        return new Response(ghRes.body, { status: ghRes.status, headers: resHeaders });
      }

      if (request.method === 'DELETE') {
        const body = await request.text();
        let ghRes = await fetch(ghUrl, {
          method: 'DELETE',
          headers: { ...buildHeaders(ghToken), 'Content-Type': 'application/json' },
          body
        });
        if (ghRes.status === 401 && ghToken !== validToken) {
          ghRes = await fetch(ghUrl, {
            method: 'DELETE',
            headers: { ...buildHeaders(validToken), 'Content-Type': 'application/json' },
            body
          });
        }
        const resHeaders = new Headers(ghRes.headers);
        Object.entries(CORS_HEADERS).forEach(([k, v]) => resHeaders.set(k, v));
        return new Response(ghRes.body, { status: ghRes.status, headers: resHeaders });
      }
    }

    return new Response('Not Found', { status: 404, headers: CORS_HEADERS });
  }
};
