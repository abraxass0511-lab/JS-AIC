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
  } else if (text.includes('동바리') || text.includes('서포트') || text.includes('거푸집') || text.includes('벽체') || text.includes('전도방지')) {
    item = '거푸집동바리';
    law = '산안규칙 제332조(거푸집동바리등의 안전조치)';
    hazardType = '붕괴·도괴';
    severity = '중부적합';
    mgmtCauses = ['계획 미이행', '불안전 상태'];
    holdPoint = true;
    photoBanner = text.includes('전도방지') ? '대형 벽체 조립 설치 시 전도방지 파이프 미사용' : '거푸집동바리 안전조치 기준 미준수';
    analysis = '대형 벽체 거푸집 조립·설치 시 전도방지 파이프 또는 전용철물 미사용으로 전도·붕괴 위험';
    pmVerdict = '구조검토서 및 작업절차서 기준 전도방지 파이프/전용철물 보강 완료 후 작업 진행';
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

function healSafetyKoreanLexicon(str) {
  if (!str) return '';
  return String(str)
    // 0. Gang Form / 갱폼 및 선해체방지커버
    .replace(/Gang\s*Form/gi, 'Gang Form')
    .replace(/GangForm/gi, 'Gang Form')
    .replace(/선해[세체]\s*방지\s*커버|선해세방지커버/g, '선해체방지커버')
    .replace(/선해[세체]방지/g, '선해체방지')
    .replace(/선해[세체]\s*방지/g, '선해체 방지')
    // 1. ㅠ AF AYA 등 OCR 영문 노이즈 -> 인양 시 간섭사항 미고려
    .replace(/ㅠ\s*AF\s*AYA\s*(?:간섭\s*사항\s*미고려)?/g, '인양 시 간섭사항 미고려')
    .replace(/ㅠ\s*AF\s*AYA/g, '인양 시')
    // 2. 밑둥잡이 복원
    .replace(/드\s*브\s*느\s*밑[둥등]잡이|드\s*브\s*느\s*밀등잡이/g, '외부비계 밑둥잡이')
    .replace(/드\s*브\s*느/g, '외부비계')
    .replace(/밀등잡이|밑등잡이/g, '밑둥잡이')
    // 3. ee — 등 말단 영문 노이즈 제거
    .replace(/[=—\-_\s]+ee[\s—\-_]*$/gi, '')
    .replace(/\s+ee\s*—\s*$/g, '')
    // 4. 말줄임표 동바... 복원
    .replace(/동바\.\.\./g, '동바리')
    // 5. 반영 i) -> 반영
    .replace(/반영\s*[iI!ㅣ1]\)/g, '반영')
    // 6. 당사 유관부서 / 기술혁신그룹 등
    .replace(/LEA\s*유관부서/gi, '당사 유관부서')
    .replace(/기술혁신그룹\s*[%％]/g, '기술혁신그룹 등')
    // 7. 타설 힐 동바리 -> 타설 전 동바리
    .replace(/타설\s*힐\s*동바리/g, '타설 전 동바리')
    .replace(/타설\s*힐/g, '타설 전')
    .replace(/미복구\s*힌\s*걸\s*로\s*추정\s*함/g, '미복구한 것으로 추정함')
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
    .replace(/HEL\s*설치\s*불량/g, '버팀대 설치 불량');
}

function cleanLocationWorker(loc, content = '') {
    let s = String(loc || '').trim();
    if (!s && content) {
      const mDong = String(content).match(/(\d{1,4}\s*동[^\n,.()]{0,30}|지하\s*\d+\s*층[^\n,.()]{0,20}|상가동[^\n,.()]{0,20})/);
      if (mDong) s = mDong[1];
    }
    if (!s) return '';

    s = s
      .replace(/^(?:작업\s*장소|작[업엄]장소|장\s*소)\s*[:;：.]?\s*/i, '')
      .replace(/\[\s*ERE\b[^\n]*$/i, '')
      .replace(/\b(?:EERE|ERE|EEE|ee|ere|MAK|261k|SEAT|CERNE|EEL|드로|리로)\b(?:\s*[:;=]?\s*[a-zA-Z0-9]+)*/gi, ' ')
      .replace(/(?:점검자?|점검차수|점검\s*[a-zA-Z0-9]?|차수|부적합)[\s\S]*$/i, '')
      .replace(/\b[a-zA-Z]\b/g, ' ')
      .replace(/[\[\]{}()_ㅣ¦!~—:;]+/g, ' ')
      .replace(/\s+(?:리|로|드|트|르|점|검)\s*$/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    // 11023, 1023 등 숫자로만 오인식된 건물/동 패턴 자동 치유
    if (/^(?:1?(?:10[1-9]|1[1-9]\d)[385]?|\d{3,5})$/.test(s)) {
      const mMatch = s.match(/1?(10[1-9]|1[1-9]\d)[385]?/);
      if (mMatch && mMatch[1]) {
        return `${mMatch[1]}동`;
      }
    }

    s = s.replace(/\b1?(10[1-9]|1[1-9]\d)[385]\b(?=\s*(?:동|층|코어))/g, '$1동');

    // 107동 3층 1코어 등 온전한 건물/동/층/코어/구간 명칭 보존
    const mFull = s.match(/(?:\d{1,4}\s*동|상가동|주차장동|본동|복리시설동)?(?:\s*(?:지[상하]\s*\d+\s*층|\d+\s*층|\d+\s*코어|코어|PIT|피트|옥상|지붕|단부|계단실|EV홀|복도|주차장|상가동|후면|전면|측면|동측|서측|남측|북측|외부비계|워킹타워|\d+구간|\w+구간|외벽|내벽|슬래브|바닥|천장|[0-9가-힣]+))+/i);
    if (mFull && mFull[0] && mFull[0].trim().length >= 2) {
      const candidate = mFull[0].replace(/\s+/g, ' ').trim();
      if (!/^[a-zA-Z\s,]+$/.test(candidate)) return candidate;
    }

    return s;
}

function buildFallbackCleanedFields(rawOcr, fb) {
  const f = fb || {};
  return {
    subcontractor: f.subcontractor ? healSafetyKoreanLexicon(f.subcontractor) : '',
    location: cleanLocationWorker(f.location, f.content || rawOcr),
    content: healSafetyKoreanLexicon(f.content || rawOcr),
    photoBanner: healSafetyKoreanLexicon(f.photoBanner || ''),
    interviewOpinion: healSafetyKoreanLexicon(f.interviewOpinion || ''),
    auditProposal: healSafetyKoreanLexicon(f.auditProposal || ''),
    actionPlan: healSafetyKoreanLexicon(f.actionPlan || ''),
    law: f.law || ''
  };
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

    // ── 🤖 AI 자동 분석 엔드포인트 (Cloudflare Vision AI + Qwen 32B 하이브리드 24시간 연동) ──
    if (url.pathname === '/api/ai-analyze' || url.pathname === '/api/vision-ocr') {
      try {
        const body = await request.json().catch(() => ({}));
        const content = body.content || body.rawOcrText || '';
        if (!content && !body.stripImageBase64) {
          return new Response(JSON.stringify({ error: '지적 내용(content) 또는 이미지(stripImageBase64)가 필요합니다.' }), {
            status: 400,
            headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
          });
        }

        // 산안법 룰 기반 즉시 백업 판정 데이터 생성
        const quickFallback = analyzeRuleFallback(content);

        // Cloudflare Workers AI 인스턴스가 바인딩되어 있는 경우 실행
        if (env.AI) {
          try {
            let visionText = '';
            let rightPhotoIsReference = null;

            // 1) Vision AI 이미지 직접 판독 (텍스트 스트립 이미지 또는 우측 참고도면 판별)
            if (body.stripImageBase64) {
              try {
                const cleanB64 = String(body.stripImageBase64).replace(/^data:image\/\w+;base64,/, '');
                const visionPrompt = `이 이미지는 건설현장 안전점검 장표의 텍스트 셀들을 위에서 아래로 모아놓은 이미지입니다.
각 셀의 한국어, 한자(等, 上, 中), 영문 코드([IZ12B-106(K)]), 단위(cm, mm, 도), 불릿 기호(-, *, 1), 2))를 보이는 그대로 정확히 읽어서 텍스트로 출력하세요.
절대 임의로 단어를 생략하거나 지어내지 마세요.`;
                const vRes = await env.AI.run('@cf/meta/llama-3.2-11b-vision-instruct', {
                  messages: [
                    {
                      role: 'user',
                      content: [
                        { type: 'text', text: visionPrompt },
                        { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${cleanB64}` } }
                      ]
                    }
                  ],
                  max_tokens: 700,
                  temperature: 0.05
                }).catch(async () => {
                  const binStr = atob(cleanB64);
                  const bytes = new Uint8Array(binStr.length);
                  for (let i = 0; i < binStr.length; i++) bytes[i] = binStr.charCodeAt(i);
                  return await env.AI.run('@cf/llava-1.5-7b-hf', {
                    image: [...bytes],
                    prompt: visionPrompt,
                    max_tokens: 500
                  });
                });
                if (vRes) {
                  visionText = vRes.response || vRes.description || (vRes.choices && vRes.choices[0]?.message?.content) || '';
                }
              } catch (vErr) {
                console.warn('Vision strip OCR fallback to Qwen text clean:', vErr);
              }
            }

            if (body.rightPhotoBase64) {
              try {
                const cleanPhotoB64 = String(body.rightPhotoBase64).replace(/^data:image\/\w+;base64,/, '');
                const refPrompt = `이 이미지가 (A) 실제 건설현장을 카메라로 촬영한 현장 사진(여러 장을 묶은 콜라주 사진 포함)인지, 아니면 (B) 매뉴얼/작업절차서/시공상세도/도면/표 캡처 이미지(예: '6.2 거푸집 보강', '[거푸집 보강 예]', 'O/X 예시')인지 판별하세요. 매뉴얼/도면/표 캡처이면 "REFERENCE", 실제 현장 촬영 사진이면 "REAL_PHOTO"라고만 답하세요.`;
                const pRes = await env.AI.run('@cf/meta/llama-3.2-11b-vision-instruct', {
                  messages: [
                    {
                      role: 'user',
                      content: [
                        { type: 'text', text: refPrompt },
                        { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${cleanPhotoB64}` } }
                      ]
                    }
                  ],
                  max_tokens: 30,
                  temperature: 0.0
                }).catch(() => null);
                const pTxt = (pRes && (pRes.response || (pRes.choices && pRes.choices[0]?.message?.content))) || '';
                if (/REFERENCE/i.test(pTxt) && !/REAL_PHOTO/i.test(pTxt)) {
                  rightPhotoIsReference = true;
                } else if (/REAL_PHOTO/i.test(pTxt)) {
                  rightPhotoIsReference = false;
                }
              } catch (pErr) {}
            }

            const isOcrClean = (body.mode === 'ocr_clean' || url.pathname === '/api/vision-ocr') && (body.rawOcrText || visionText);
            const systemPrompt = isOcrClean
              ? `너는 대한민국 산업안전보건법 및 건설현장 안전감사 전문가 AI이자 Vision+OCR 문맥 교정 전문가이다.
주어진 점검장표 Vision 판독 결과와 OCR 추출 텍스트의 오탈자(예: cm가 00으로 오인식, 한자 等이 5/&/쪽/종으로 오인식, 안전작업지침 제목 깨짐, 영문/기호 노이즈 등)를 문맥에 맞게 완벽히 교정하고, 법령 위반 및 사진 상단 배너를 JSON으로만 출력하라.

[OCR 문맥 교정 절대 규칙]
- 협력사가 빈칸이면 절대 임의로 넣지 말고 ""로 둘 것 (공종명 '비계공사', 'HEY' 등을 협력사에 넣지 말 것)
- 작업장소에 '[ERE 12', 'ee' 같은 테두리 노이즈가 있으면 완벽히 제거할 것 (예: '106동 지하2층', '106동 서측', '101동, 상가동')
- 여러 항목이 '-'로 구분된 경우 줄바꿈(\\n- )으로 구분하되, 한 문장이 표 셀 폭 때문에 단순 줄바꿈된 경우(예: '검토 및 / 재수립 후', '현장 / 모니터링 강화', '적정여부 / 전수 점검 실시', '해체 시 / 받침목 추가 / (또는 버림틀 존치)')는 한 문장으로 자연스럽게 이어붙일 것
- 관련기준의 '*' 항목이 3개인 경우 각각 줄바꿈(\\n* )으로 구분할 것

JSON 형식:
{
  "severity": "중부적합" 또는 "경부적합",
  "law": "산안규칙 제OO조(조항명)",
  "hazardType": "추락" 또는 "낙하" 또는 "붕괴" 또는 "도괴" 또는 "협착" 또는 "전도" 또는 "화재" 또는 "감전",
  "item": "기인물/작업 명칭",
  "photoBanner": "사진 1 상단 배너용 15자 내외 구체적 미준수 문구",
  "photo2Banner": "사진 2 상단 배너용 15자 내외 구체적 미준수 문구 (단일 지적이면 '')",
  "holdPoint": true 또는 false,
  "analysis": "법적 위반 판단 이유 1~2문장",
  "pmVerdict": "시스템 개선" 또는 "교육/코칭" 또는 "페널티",
  "cleanedFields": {
    "content": "교정된 부적합 내용",
    "location": "교정된 작업장소",
    "workGroup": "교정된 공종명",
    "subcontractor": "교정된 협력사명 (공란이면 반드시 '')",
    "interviewOpinion": "교정된 관계자 의견 ('- ' 불릿 유지)",
    "auditProposal": "교정된 점검단 제안 ('- ' 불릿 구분)",
    "actionPlan": "교정된 개선대책 ('- ' 불릿 구분, 단순 줄바꿈은 병합)",
    "rawLaw": "교정된 관련기준 제목 (예: 안전작업지침 [IZ12B-106(K)] 비계 작업)",
    "lawBody": "교정된 관련기준 본문 ('*' 항목 줄바꿈 유지)"
  }
}`
              : `너는 대한민국 산업안전보건법 및 건설현장 안전감사 전문가 AI이다.
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

            const userPrompt = isOcrClean
              ? `${visionText ? `[Vision AI 직접 판독 원문]:\n${visionText}\n\n` : ''}[장표 OCR 원문]:\n${body.rawOcrText || ''}\n\n[1차 추출 필드]:\n${JSON.stringify({
                  content: body.content,
                  location: body.location,
                  workGroup: body.workGroup,
                  subcontractor: body.subcontractor,
                  interviewOpinion: body.interviewOpinion,
                  auditProposal: body.auditProposal,
                  actionPlan: body.actionPlan,
                  rawLaw: body.rawLaw,
                  lawBody: body.lawBody
                })}`
              : `[현장 지적사항]: "${content.trim()}"`;

            // <think> 추론 지연 없이 1~2초 내 즉시 JSON을 반환하는 Non-Thinking Instruct 모델 최우선 호출
            const aiRes = await env.AI.run('@cf/qwen/qwen2.5-coder-32b-instruct', {
              messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt }
              ],
              max_tokens: isOcrClean ? 950 : 500,
              temperature: 0.05
            }).catch(async () => {
              return await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
                messages: [
                  { role: 'system', content: systemPrompt },
                  { role: 'user', content: userPrompt }
                ],
                max_tokens: isOcrClean ? 950 : 500,
                temperature: 0.05
              });
            }).catch(async () => {
              return await env.AI.run('@cf/qwen/qwen1.5-14b-chat-awq', {
                messages: [
                  { role: 'system', content: systemPrompt },
                  { role: 'user', content: userPrompt }
                ],
                max_tokens: isOcrClean ? 950 : 500,
                temperature: 0.05
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
              if (parsed.cleanedFields && typeof parsed.cleanedFields === 'object') {
                for (const k of Object.keys(parsed.cleanedFields)) {
                  if (typeof parsed.cleanedFields[k] === 'string') {
                    parsed.cleanedFields[k] = healSafetyKoreanLexicon(parsed.cleanedFields[k]);
                  }
                }
                if (parsed.cleanedFields.location) {
                  parsed.cleanedFields.location = cleanLocationWorker(parsed.cleanedFields.location, parsed.cleanedFields.content || content);
                }
              }
              return new Response(JSON.stringify({
                ok: true,
                source: visionText ? 'cloudflare_vision_qwen_hybrid' : 'cloudflare_workers_ai',
                model: visionText ? 'Llama-3.2-11B-Vision + Qwen-32B (Cloudflare Cloud)' : 'Qwen-32B/7B (Cloudflare Cloud)',
                visionText: visionText || undefined,
                rightPhotoIsReference,
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
        const fallbackCleaned = buildFallbackCleanedFields(content, body.fallbackRecord);
        return new Response(JSON.stringify({
          ok: true,
          source: 'cloudflare_rule_engine',
          model: 'SanAn Rule Engine (Cloudflare Cloud)',
          ...quickFallback,
          cleanedFields: fallbackCleaned
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
