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
  let law = '산안규칙 제42조(추락의 방지)';
  let item = '가시설';
  let hazardType = '추락';
  let mgmtCauses = ['불안전 상태'];
  let holdPoint = false;
  let analysis = '현장 안전기준 위반 사항이 감지되었습니다.';
  let pmVerdict = '즉시 시정 조치 및 이행 확인';

  if (text.includes('비계') || text.includes('발판') || text.includes('틈새') || text.includes('수평재')) {
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

  return { severity, law, item, hazardType, mgmtCauses, holdPoint, analysis, pmVerdict };
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    const pin = request.headers.get('X-PIN');
    const pins = JSON.parse(env.PINS_JSON || '{}');
    let user = pins[pin];

    // env.PINS_JSON에 없는 신규/수정된 핀번호는 GitHub 저장소의 config/users.json에서 동적 조회
    if (!user && pin && env.GITHUB_OWNER && env.GITHUB_REPO && env.GITHUB_TOKEN) {
      try {
        const ghUrl = `https://api.github.com/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/contents/config/users.json`;
        const ghRes = await fetch(ghUrl, {
          headers: {
            'User-Agent': 'SafePatrol-Relay',
            'Authorization': `token ${env.GITHUB_TOKEN}`,
            'Accept': 'application/vnd.github.v3.raw'
          }
        });
        if (ghRes.ok) {
          const raw = await ghRes.text();
          const parsed = JSON.parse(raw);
          const uMap = parsed.users || parsed;
          if (uMap && uMap[pin]) {
            user = uMap[pin];
          }
        }
      } catch (e) {
        console.warn('Worker dynamic PIN lookup error:', e);
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

    if (!user) {
      return new Response(JSON.stringify({ error: '인증이 필요합니다' }), {
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
            const systemPrompt = `너는 대한민국 산업안전보건법 및 건설현장 안전감사 전문가 AI이다.
주어진 부적합 지적내용을 엄밀히 분석하여 오직 유효한 JSON 문자열 하나만 출력하라.

JSON 형식:
{
  "severity": "🚨 중부적합" 또는 "⚠️ 경부적합",
  "law": "산안규칙 제OO조(조항명)",
  "hazardType": "추락" 또는 "낙하·비래" 또는 "붕괴·도괴" 또는 "협착" 또는 "전도" 또는 "화재·폭발" 또는 "감전",
  "item": "비계" 또는 "안전대" 또는 "개구부" 또는 "안전난간" 또는 "가설전기" 또는 "건설기계",
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

      const ghUrl = `https://api.github.com/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/contents/${filePath}`;
      const ghHeaders = {
        'User-Agent': 'SafePatrol-Relay',
        'Authorization': `token ${env.GITHUB_TOKEN}`,
        'Accept': isRaw ? 'application/vnd.github.v3.raw' : 'application/vnd.github.v3+json'
      };

      if (request.method === 'GET') {
        const ghRes = await fetch(ghUrl, { headers: ghHeaders });
        const resHeaders = new Headers(ghRes.headers);
        Object.entries(CORS_HEADERS).forEach(([k, v]) => resHeaders.set(k, v));
        return new Response(ghRes.body, { status: ghRes.status, headers: resHeaders });
      }

      if (request.method === 'PUT') {
        const body = await request.text();
        const ghRes = await fetch(ghUrl, {
          method: 'PUT',
          headers: { ...ghHeaders, 'Content-Type': 'application/json' },
          body
        });
        const resHeaders = new Headers(ghRes.headers);
        Object.entries(CORS_HEADERS).forEach(([k, v]) => resHeaders.set(k, v));
        return new Response(ghRes.body, { status: ghRes.status, headers: resHeaders });
      }

      if (request.method === 'DELETE') {
        const body = await request.text();
        const ghRes = await fetch(ghUrl, {
          method: 'DELETE',
          headers: { ...ghHeaders, 'Content-Type': 'application/json' },
          body
        });
        const resHeaders = new Headers(ghRes.headers);
        Object.entries(CORS_HEADERS).forEach(([k, v]) => resHeaders.set(k, v));
        return new Response(ghRes.body, { status: ghRes.status, headers: resHeaders });
      }
    }

    return new Response('Not Found', { status: 404, headers: CORS_HEADERS });
  }
};
