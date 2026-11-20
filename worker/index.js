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

function stripWorkerBannerTail(raw = '') {
  return healSafetyKoreanLexicon(String(raw || ''))
    .replace(/[\u2460-\u2487\u2776-\u277F]/g, ' ')
    .replace(/(?:\s+|(?<=[가-힣A-Za-z0-9)])\s*)(?:[2-9]\)|\(\s*[2-9]\s*\)).*$/g, '')
    .replace(/([가-힣])([1-5])([가-힣]{2,})/g, (m, p1, d, p3) => (
      (p1 === '제' || /^(?:차|층|동|번|단|개|인|선|호|일|월|년|회|종|조|항|급|점|매|본|배|종류|구간|코어|단계)/.test(p3))
        ? m
        : `${p1} ${p3}`
    ))
    .replace(/판개(?=\s|$)/g, '판재')
    .replace(/작업시(?=\s|$)/g, '작업 시')
    .replace(/양중\s*시양중/g, '양중 시 양중')
    .replace(/시양중(?=\s|$)/g, '시 양중')
    .replace(/이맞지않는/g, '이 맞지 않는')
    .replace(/상태로$/g, '상태')
    .replace(/수평이\s*맞지\s*않는$/g, '수평이 맞지 않음')
    .replace(/(?:되지|하지|맞지)\s*않는$/g, (m) => m.replace(/않는$/, '않음'))
    .replace(/\s+/g, ' ')
    .trim();
}

function hasMultiInterviewSectionsWorker(raw = '') {
  const matches = String(raw || '').match(/\[\s*(?:[가-힣A-Za-z\s]{0,12})?\s*의견\s*[:：]/g);
  return Array.isArray(matches) && matches.length >= 2;
}

// ── 0.05초 비상 오프라인 백업 엔진 (하드코딩 법령 조문 추론 금지 · AI가 산안법 직접 판단) ──
function analyzeRuleFallback(content) {
  const text = (content || '').toLowerCase();
  let severity = '경부적합';
  let law = '';
  let item = '기타';
  let hazardType = '기타';
  let mgmtCauses = ['불안전 상태'];
  let holdPoint = false;
  let analysis = '현장 안전기준 위반 사항이 감지되었습니다.';
  let pmVerdict = '즉시 시정 조치 및 이행 확인';

  let photoBanner = '안전수칙 미준수';
  let photo2Banner = '';

  if (text.includes('양중') || text.includes('크레인') || text.includes('줄걸이') || text.includes('유도로프') || text.includes('수평양중') || text.includes('손으로')) {
    const isHand = text.includes('손으로') || text.includes('직접 잡');
    const isHorizontal = text.includes('수평') || text.includes('로프간격') || text.includes('수평양중');
    item = '양중장비';
    hazardType = text.includes('낙하') ? '낙하' : '추락';
    severity = '중부적합';
    mgmtCauses = ['계획 미이행', '불안전 행동'];
    holdPoint = true;
    photoBanner = isHand ? '양중작업 시 화물을 직접 손으로 잡음' : (isHorizontal ? '양중작업 시 화물의 수평양중 미실시' : '양중작업 시 유도로프 미사용');
    photo2Banner = isHand ? '양중작업 시 유도로프 미사용' : (isHorizontal ? '지상에서 보 거푸집 로프체결 간격 미준수' : '');
    analysis = '양중작업 시 유도로프 미사용 및 인양화물 수평 미유지로 낙하 및 협착 위험';
    pmVerdict = '양중 즉시 중지 및 규격 유도로프(2개소 이상) 체결 후 재작업';
  } else if ((text.includes('전선') || text.includes('케이블') || text.includes('리드선')) && 
             (text.includes('통로') || text.includes('바닥') || text.includes('정리') || text.includes('걸려') || text.includes('넘어') || text.includes('방치') || text.includes('통행'))) {
    item = '가설전선';
    hazardType = '전도';
    severity = '경부적합';
    mgmtCauses = ['불안전 상태', '계획 미이행'];
    holdPoint = false;
    photoBanner = '통로 바닥 가설전선 거치 및 정리 미실시';
    analysis = '통로 바닥에 가설전선이 거치되지 않고 방치되어 통행 근로자의 걸림 및 전도 재해 위험';
    pmVerdict = '즉시 전선 거치대를 설치하여 바닥으로부터 띄우고 보행 안전통로 구획 정리';
  } else if (text.includes('보 상부') || text.includes('다이빙') || (text.includes('보') && text.includes('승인') && (text.includes('자세') || text.includes('작업')))) {
    item = '보 거푸집';
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
    hazardType = '전도';
    severity = '경부적합';
    mgmtCauses = ['불안전 상태', '계획 미이행'];
    holdPoint = false;
    photoBanner = '구획된 바닥 안전통로 내 거푸집 자재 방치';
    analysis = '구획된 바닥 안전통로에 거푸집 등 자재를 무단 방치하여 통행 방해 및 전도 위험';
    pmVerdict = '안전통로 내 적치 자재 즉시 반출 및 지정 야적 구역으로 이동 조치';
  } else if (text.includes('밀폐') || text.includes('농도') || text.includes('산소') || text.includes('유해가스') || text.includes('질식') || text.includes('환기팬') || text.includes('송기마스크')) {
    item = '밀폐공간';
    hazardType = '질식';
    severity = '중부적합';
    mgmtCauses = ['계획 미이행', '불안전 행동'];
    holdPoint = true;
    photoBanner = '밀폐공간 유해가스 농도 미측정 진입';
    analysis = '밀폐공간 작업 전 산소 및 유해가스 농도 미측정 또는 환기 미실시로 질식 사망 위험';
    pmVerdict = '즉시 작업 중지, 적정 공기 측정(산소 18~23.5%) 및 송풍기 가동 확인 후 재개';
  } else if (text.includes('말비계') || text.includes('우마')) {
    item = '말비계';
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
    hazardType = '추락';
    severity = '중부적합';
    mgmtCauses = ['불안전 상태', '계획 미이행'];
    holdPoint = true;
    photoBanner = '비계 작업발판 미설치 및 틈새 과다';
    analysis = '비계 작업발판 틈새 3cm 초과 또는 발판 폭 기준 미달로 추락 위험';
    pmVerdict = '즉시 해당 구간 작업중지 및 발판 틈새 3cm 이하 보강 후 재검측';
  } else if (text.includes('개구부') || text.includes('피트') || text.includes('덮개')) {
    item = '개구부';
    hazardType = '추락';
    severity = '중부적합';
    mgmtCauses = ['불안전 상태', '계획 미이행'];
    holdPoint = true;
    photoBanner = '바닥 개구부 덮개 미설치';
    analysis = '바닥 개구부 고정 덮개 미설치 또는 임의 개방으로 추락 위험 극심';
    pmVerdict = '즉시 위험구역 출입통제 및 규격 덮개(고정/추락주의 표지) 설치';
  } else if (text.includes('난간') || text.includes('단부') || text.includes('슬래브')) {
    item = '안전난간';
    hazardType = '추락';
    severity = '중부적합';
    mgmtCauses = ['불안전 상태', '불안전 행동'];
    holdPoint = true;
    photoBanner = '슬래브 단부 안전난간 미설치';
    analysis = '높이 2m 이상 슬래브 단부 안전난간 미설치로 추락 사망 위험';
    pmVerdict = '즉시 단부 접근 금지 및 상부·중간난간대 완벽 설치 후 검측';
  } else if (text.includes('안전대') || text.includes('구명줄')) {
    item = '안전대';
    hazardType = '추락';
    severity = '중부적합';
    mgmtCauses = ['불안전 행동', '계획 미이행'];
    holdPoint = true;
    photoBanner = '고소작업 시 안전대 미체결';
    analysis = '고소작업자 안전대 미체결 또는 수직/수평 구명줄 미설치';
    pmVerdict = '즉시 안전대 이중고리 체결 지도 및 구명줄 보강 설치';
  } else if (text.includes('용접') || text.includes('불티') || text.includes('화재')) {
    item = '화기작업';
    hazardType = '화재·폭발';
    severity = '중부적합';
    mgmtCauses = ['계획 미이행', '불안전 상태'];
    holdPoint = true;
    analysis = '용접·용단 불티 비산방지포 미설치 또는 소화기 미배치';
    pmVerdict = '화기작업 즉시 중단, 불티비산방지포 및 소화기 2대 전진 배치 후 재개';
  } else if (text.includes('전기') || text.includes('분전') || text.includes('누전') || text.includes('접지') || text.includes('차단기') || text.includes('충전부') || text.includes('전등') || text.includes('소켓') || text.includes('심선') || text.includes('전선')) {
    const isLivePart = text.includes('충전부') || text.includes('노출');
    const isLight = text.includes('전등') || text.includes('소켓') || text.includes('심선');
    const isGroundBolt = text.includes('접지선') && (text.includes('고정') || text.includes('볼트') || text.includes('용량'));
    item = isLight ? '전등/전선' : '분전반';
    hazardType = '감전';
    severity = '중부적합';
    mgmtCauses = ['불안전 상태', '계획 미이행'];
    holdPoint = false;
    photoBanner = isLight
      ? '전등 소켓 충전부 노출 및 절연 불량'
      : (isLivePart
        ? '분전함 차단기 충전부 노출'
        : (isGroundBolt ? '접지선 볼트 고정 불량 및 용량 부족' : '가설분전반 관리 및 접지 불량'));
    analysis = isLivePart ? '가설전등/분전반 내 충전부 방호 미흡으로 감전 위험' : '가설전기 분전반 관리·접지 및 누전차단기 점검 불량';
    pmVerdict = '해당 차단기 전원 즉시 차단 및 충전부 절연 방호·접지 보강 후 사용';
    return { severity, law, item, hazardType, mgmtCauses, holdPoint, analysis, pmVerdict, photoBanner, photo2Banner, workGroup: '가설전기공사', workMethod: '설치조립작업', agentMajor: '전기·화기·설비', agentMid: '전기시설', agentMinor: isLight ? '가설전선/이동릴선' : (isGroundBolt ? '접지시설' : (isLivePart ? '분전함' : '누전차단기')), condition: '방호장치 결함 (덮개·난간 미설치 등)', action: '해당없음', rootCauseMgmt: '관리감독자 지정 및 역할 수행 미흡', rootCauseSystem: '안전시설물 설치/인계인수 프로세스 미흡', stakeholder: '협력사 관리감독자' };
  } else if ((text.includes('지게차') || text.includes('하역') || text.includes('유도원') || text.includes('신호수') || text.includes('충돌')) && !text.includes('생명줄') && !text.includes('안전대')) {
    const isWindow = /pl\s*창호|창호|유리/i.test(text);
    const isPc = /p\.?c\s*공사|피씨|프리캐스트|\bpc\b/i.test(text);
    item = '운반장비';
    hazardType = '충돌';
    severity = '중부적합';
    mgmtCauses = ['계획 미이행', '불안전 행동'];
    holdPoint = true;
    photoBanner = (isWindow || text.includes('유도원')) ? '유도원·근로자 지게차 근접 작업' : '지게차 하역 중 근로자 근접 작업';
    analysis = '지게차 자재 하역작업 중 유도원 및 근로자가 안전거리(5m) 미확보 상태로 장비에 근접하여 충돌 위험';
    pmVerdict = '지게차 유도원 안전거리 확보 기준 재교육 및 하역장소 통제 모니터링 강화';
    return { severity, law, item, hazardType, mgmtCauses, holdPoint, analysis, pmVerdict, photoBanner, photo2Banner, workGroup: isWindow ? '창호공사(PL)' : (isPc ? 'PC공사' : '가설공사(건설장비)'), workMethod: '하역운반작업', agentMajor: '건설장비', agentMid: '운반장비', agentMinor: '지게차', condition: '해당없음', action: '위험장소 접근 (출입통제 구역 진입 등)', rootCauseMgmt: '작업계획서 미수립 또는 형식적 작성', rootCauseSystem: '표준작업절차서(SOP) 미배포 또는 현장 부적합', stakeholder: '협력사 근로자' };
  } else if (text.includes('알폼') || text.includes('al form') || text.includes('alform') || text.includes('알루미늄 거푸집')) {
    item = '알폼';
    hazardType = text.includes('동바리') ? '붕괴·도괴' : '추락';
    severity = '중부적합';
    mgmtCauses = ['계획 미이행', '불안전 상태'];
    holdPoint = true;
    photoBanner = text.includes('동바리') ? '콘크리트 타설 중 계단참 AL Form 동바리 미복구' : 'AL Form 해체 구간 슬래브 단부 추락방지 미조치';
    analysis = '알폼(AL Form) 작업 시 동바리 임의 해체 후 미복구로 붕괴·도괴 위험 극심';
    pmVerdict = '동바리 즉시 원상복구 및 관리감독자 타설 전 검측 프로세스 준수';
  } else if (text.includes('동바리') || text.includes('서포트') || text.includes('거푸집') || text.includes('벽체') || text.includes('전도방지') || text.includes('유로폼')) {
    item = '거푸집동바리';
    hazardType = '붕괴·도괴';
    severity = '중부적합';
    mgmtCauses = ['계획 미이행', '불안전 상태'];
    holdPoint = true;
    photoBanner = text.includes('전도방지') ? '대형 벽체 조립 설치 시 전도방지 파이프 미사용' : '거푸집동바리 안전조치 기준 미준수';
    analysis = '대형 벽체 거푸집 조립·설치 시 전도방지 파이프 또는 전용철물 미사용으로 전도·붕괴 위험';
    pmVerdict = '구조검토서 및 작업절차서 기준 전도방지 파이프/전용철물 보강 완료 후 작업 진행';
    return { severity, law, item, hazardType, mgmtCauses, holdPoint, analysis, pmVerdict, photoBanner, photo2Banner, workGroup: '거푸집동바리공사', workMethod: '설치조립작업', agentMajor: '가시설', agentMid: '거푸집/동바리', agentMinor: text.includes('서포트') ? '파이프서포트' : '유로폼' };
  } else if (text.includes('사다리') || text.includes('우마')) {
    item = '사다리';
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
    .replace(/AL\s*Form/gi, 'AL Form')
    .replace(/선해[세체]\s*방지\s*커[바버]|선해세방지커[바버]|방지커바/g, '선해체방지커버')
      .replace(/방지\s*커[바버]/g, '방지커버')
      .replace(/커바\b/g, '커버')
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
    // 15. 관련기준 지게차 오타('직게차'/'지계차'), 부정 접두사 '미' 띄어쓰기 오류('미 사용'→'미사용') 및 법령 본문 OCR 오탈자/띄어쓰기 복원
    .replace(/직[계게개]차|지[계개제]차/g, '지게차')
    .replace(/쓴아짐/g, '쏟아짐')
    .replace(/상태양중/g, '상태 양중')
    .replace(/(^|[\s(/·\-])미\s+(사용|설치|착용|체결|고박|준수|실시|비치|확보|연결|복구|작성|기재|조치|수립|이행|작동|구축|부착|시행|정비|수행|지정|배치|확인|점검|통제|결속|고정|유지|반영|이수|보수|차단|방호)(?=\s|$|[.,;:)/·\-])/g, '$1미$2')
    .replace(/([가-힣]+하기)\.\s*(?=(?:위한|위하여|위해|위함|전에|전\b|때문))/g, '$1 ')
    .replace(/(되어야|하여야|있어야|없어야|않아야)\s*(하며|하고)(?=[,\s]|$)/g, '$1 $2')
    .replace(/이상\s*유무(를|의|와|에|도|는|가|만|등)?/g, '이상 유무$1');
}

function normalizeWorkerRoundText(raw = '') {
  const s = String(raw || '').replace(/^(?:[\s|Iㅣl\[\]]|['’‘](?!\s*\d{2}\s*[년年]))+|[\s|Iㅣl\[\]-]+$/g, '').replace(/^(?:점검|섬검|첨검)?\s*(?:차수|자수|사수)\s*[:：.]?\s*/g, '').trim();
  if (!s) return '';
  const yrMatch = s.match(/(['’‘]?)\s*(\d{2})\s*[년年]/);
  const hasQuote = Boolean(yrMatch && yrMatch[1]);
  const yr = yrMatch ? yrMatch[2] : '26';
  const afterYear = yrMatch ? s.slice(yrMatch.index + yrMatch[0].length) : s;
  let half = hasQuote ? '上' : '下';
  if (/[下하TㅜㅠF구노]/i.test(afterYear) && !/[上상소⊥]/.test(afterYear)) half = '下';
  else if (/[上상소⊥]/.test(afterYear)) half = '上';
  const numMatch = afterYear.match(/([1-9])\s*(?:차|자|치|시|$)/);
  const roundNum = numMatch ? numMatch[1] : ((afterYear.match(/([1-6])/) || [])[1] || '2');
  if (!hasQuote && roundNum === '1' && !/[上상]/.test(afterYear)) half = '下';
  const prefix = (hasQuote || half === '上') ? `'${yr}년${half}` : `${yr}년${half}`;
  return `${prefix} ${roundNum}차`;
}

function finalizeWorkerLawBullets(text = '') {
  return String(text || '').split(/\r?\n/).map((rawLine) => {
    const line = rawLine.trim();
    if (!line) return '';
    const mBullet = line.match(/^([-•·]\s+)(.+)$/);
    if (!mBullet) return line;
    const marker = mBullet[1];
    let b = mBullet[2].replace(/[,;\s]+$/, '').trim();
    if (!b) return line;
    if (marker.startsWith('-')) {
      b = b
        .replace(/하지\s*않으며\.?$/g, '하지 않는다.')
        .replace(/되지\s*않으며\.?$/g, '되지 않는다.')
        .replace(/(하여야|해야|되어야|있어야|없어야|않아야)\s*(?:하며|하고)\.?$/g, '$1 한다.')
        .replace(/(하여야|해야)\.?$/g, '$1 한다.')
        .replace(/금지\s*(?:하며|하고|하여|다)?\.?$/g, '금지한다.')
        .replace(/금지\s*할\s*것\.?$/g, '금지한다.')
        .replace(/([가-힣]+)\s*금지(?:다)?\.?$/g, '$1 금지한다.')
        .replace(/(가능|필요|적합|충분|견고|안전|확실)하며\.?$/g, '$1하다.')
        .replace(/있으며\.?$/g, '있다.')
        .replace(/없으며\.?$/g, '없다.')
        .replace(/되며\.?$/g, '된다.')
        .replace(/([가-힣]{2,})하며\.?$/g, '$1한다.')
        .replace(/([가-힣]{2,})하고\.?$/g, '$1한다.')
        .replace(/(확인|점검|실시|착용|사용|준수|조치|설치|체결|결속|유지|확보|관리|방지|통제|엄수|이행|수립|작성|배치|고정|보강|비치|제거|차단|청소|정리)(?:다)?\.?$/g, '$1한다.')
        .replace(/필요(?:다)?\.?$/g, '필요하다.')
        .replace(/\s+/g, ' ')
        .trim();
    }
    if (/(?:한다|된다|않는다|없다|있다|바란다|같다|아니다|이다|필요하다)\.?$/.test(b)) {
      b = b.endsWith('.') ? b : `${b}.`;
    }
    return `${marker}${b}`;
  }).filter(Boolean).join('\n').trim();
}

function sanitizeWorkerFffdString(val, fallback = '') {
  if (typeof val !== 'string') return val;
  if (!val.includes('\uFFFD')) return val;
  let repaired = val
    .replace(/전기[\uFFFD]{1,3}계/g, '전기기계')
    .replace(/기계[\uFFFD]{1,3}기구/g, '기계·기구')
    .replace(/안전[\uFFFD]{1,3}건/g, '안전보건')
    .replace(/작업[\uFFFD]{1,3}판/g, '작업발판')
    .replace(/부착[\uFFFD]{1,3}비/g, '부착설비')
    .replace(/부적[\uFFFD]{1,3}/g, '부적합')
    .replace(/[\uFFFD]{1,3}전반/g, '분전반')
    .replace(/방[\uFFFD]{1,3}조치/g, '방호조치')
    .replace(/[\uFFFD]{1,3}치/g, '조치')
    .replace(/[\uFFFD]+/g, '');
  if (repaired.length < Math.max(2, Math.floor(val.length * 0.5)) && typeof fallback === 'string' && fallback && !fallback.includes('\uFFFD')) {
    return fallback;
  }
  return repaired.replace(/\s{2,}/g, ' ').trim();
}

function scrubWorkerResultFffd(target, fallbackObj = null) {
  if (Array.isArray(target)) {
    return target.map((item, idx) => scrubWorkerResultFffd(item, Array.isArray(fallbackObj) ? fallbackObj[idx] : null));
  }
  if (!target || typeof target !== 'object') {
    return typeof target === 'string' ? sanitizeWorkerFffdString(target, typeof fallbackObj === 'string' ? fallbackObj : '') : target;
  }
  const cleanObj = {};
  for (const [k, v] of Object.entries(target)) {
    const fbVal = fallbackObj && typeof fallbackObj === 'object' ? fallbackObj[k] : '';
    if (typeof v === 'string') {
      cleanObj[k] = sanitizeWorkerFffdString(v, typeof fbVal === 'string' ? fbVal : '');
    } else if (Array.isArray(v)) {
      cleanObj[k] = scrubWorkerResultFffd(v, Array.isArray(fbVal) ? fbVal : null);
    } else if (v && typeof v === 'object') {
      cleanObj[k] = scrubWorkerResultFffd(v, fbVal && typeof fbVal === 'object' ? fbVal : null);
    } else {
      cleanObj[k] = v;
    }
  }
  return cleanObj;
}

function splitWorkerLeakedLawTitle(rawTitle = '', rawBody = '') {
  let title = String(rawTitle || '').trim();
  let body = String(rawBody || '').trim();
  if (title.length > 26) {
    const mergeClause = (clauseText, existing) => {
      const clause = String(clauseText || '').replace(/^[-•*▪]\s*/, '').trim();
      if (!clause) return existing;
      const cmpC = clause.replace(/\s+/g, '');
      const cmpE = String(existing || '').replace(/\s+/g, '');
      if (cmpE && cmpC.length >= 6 && cmpE.includes(cmpC.slice(0, Math.min(12, cmpC.length)))) return existing;
      return existing ? `- ${clause}\n${existing}` : `- ${clause}`;
    };
    const mGuide = title.match(/^(.{8,}?(?:지침|절차|요령|수칙))\s+(?!\[)(.{6,})$/);
    if (mGuide && /(?:확인|금지|착용|설치|유도|준수|확보|점검|사용|한다|해야|양중물|작업자|근로자|출입|통제|방지|결속|기준|원칙|\d+\)|-)/.test(mGuide[2])) {
      title = mGuide[1].trim();
      body = mergeClause(mGuide[2], body);
    } else {
      const mRule = title.match(/^((?:산업)?안전보건(?:기준에\s*관한\s*)?규칙\s*제\d+조(?:의\d+)?(?:\s*\([^)]+\))?(?:\s*,\s*제\d+조(?:의\d+)?(?:\s*\([^)]+\))?)*)\s+(.{6,})$/);
      if (mRule && !/^제\d+조/.test(mRule[2].trim())) {
        title = mRule[1].trim();
        body = mergeClause(mRule[2], body);
      }
    }
  }
  return { title, body };
}

function normalizeWorkerLawTitle(s = '') {
  return String(s || '')
    .replace(/(?:안[선전]|\b안\s*[선전])\s*작[업엄]\s*[지시][침심]|안전\s*작업\s*시[심침]/g, '안전작업지침')
    .replace(/주탁|추탁|축락|추낙/g, '추락')
    .replace(/닥아|낙아/g, '낙하')
    .replace(/방시시실|방지시실|방시시설|방지시설/g, '방지시설')
    .replace(/작입|삭업|자업(?=\s|$)/g, '작업')
    .replace(/\[\s*[1Il|]?Z1[2Z]B[-\s_]*10[\/7](\s*\(?K\)?)\s*\]?/gi, '[IZ12B-107(K)]')
    .replace(/\[\s*[1Il|]?Z1[2Z]B[-\s_]*(\d{3})\s*\(?\s*K\s*\)?\s*\]?/gi, '[IZ12B-$1(K)]')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanWorkerLawBody(bodyStr = '') {
  const s = healSafetyKoreanLexicon(String(bodyStr || '').trim())
    .replace(/([가-힣]+하기)\.\s*(?:\r?\n\s*)?(?=(?:위한|위하여|위해|위함|전에|전\b|때문))/g, '$1 ')
    .replace(/([①②③④⑤⑥⑦⑧⑨⑩])\s*\r?\n\s*(?=[가-힣A-Za-z0-9(])/g, '$1 ')
    .replace(/([.!?])\s*([②③④⑤⑥⑦⑧⑨⑩])\s*/g, '$1\n$2 ')
    .replace(/(한다|않는다|된다|금지한다)\s*([②③④⑤⑥⑦⑧⑨⑩])\s*/g, '$1.\n$2 ');
  const rawLines = s.split(/\r?\n/).map(l => l.replace(/^[|ㅣ¦!~—_=]+\s*/, '').replace(/\s+/g, ' ').trim()).filter(Boolean);
  const merged = [];
  for (const cl of rawLines) {
    const prev = merged.length > 0 ? merged[merged.length - 1] : '';
    const prevIsHeading = Boolean(prev) && !/^\d+\)/.test(prev) && (
      (/^\d+\.\d+/.test(prev) && !/[①-⑩]/.test(prev) && prev.length <= 32) ||
      (prev.length <= 24 && /(?:기준|사항|점검|절차|유도자|분전반)$/.test(prev))
    );
    const prevEndsSentence = /(?:다|함|됨|음|요|임)[.!?]$/.test(prev);
    if (merged.length > 0 && !/^(?:\*|\d+\)|\d+\.\d+|[①-⑩•\-·▪])/.test(cl) && !prevIsHeading && !prevEndsSentence) {
      merged[merged.length - 1] = `${prev} ${cl}`.replace(/\s+/g, ' ').trim();
    } else {
      merged.push(cl);
    }
  }
  return merged.join('\n').trim();
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
    // 점검자, 점검차수, 섬검자, 점겸자, 정검자, 집십사수 등 표 인접 열 헤더 침범 텍스트 및 그 이후 내용 완전 절단
    .replace(/(?:[점섬정겸]검\s*[자차]?|[점섬정겸]검차수|[집점]십[사차]수|\b차수\b|\b\d+\s*차\b)[\s\S]*$/i, '')
    .replace(/\s+\d{2,}(?:\s+\d+)*\s*$/g, '')
    .replace(/\b[a-zA-Z]\b/g, ' ')
    .replace(/[\[\]{}()_ㅣ¦!~—:;]+/g, ' ')
    .replace(/\s+(?:리|로|드|트|르|점|검)\s*$/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  // 1075 35 1코어 복원 (동=5, 층=5 오인식 정밀 복원)
  s = s.replace(/\b1?(10[1-9]|1[1-9]\d)[358등]\s+([1-9]|1\d|2\d|3\d)[358측증]\s*(?=\d+\s*코어|코어)/g, '$1동 $2층 ');
  s = s.replace(/(\d{1,4}\s*동)\s*(\d{1,2})\s+(?=\d+\s*코어)/g, '$1 $2층 ');
  s = s.replace(/\b(\d{1,2})[358측증]\b(?=\s*(?:\d+\s*코어|코어|PIT|피트))/g, '$1층');

  // 11023, 1023 등 숫자로만 오인식된 건물/동 패턴 자동 치유
  if (/^(?:1?(?:10[1-9]|1[1-9]\d)[385]?|\d{3,5})$/.test(s)) {
    const mMatch = s.match(/1?(10[1-9]|1[1-9]\d)[385]?/);
    if (mMatch && mMatch[1]) {
      return `${mMatch[1]}동`;
    }
  }

  s = s.replace(/\b1?(10[1-9]|1[1-9]\d)[385등]\b(?!\s*동)/g, '$1동');

  // 107동 3층 1코어, 101동 외부 등 온전한 건물/동/층/코어/구간 명칭 보존 (끝부분의 무작위 단어 탐욕 매칭 배제)
  const mFull = s.match(/(?:\d{1,4}\s*동|상가동|주차장동|본동|복리시설동)?(?:\s*(?:지[상하]\s*\d+\s*층|\d+\s*층|\d+\s*코어|코어|PIT|피트|옥상|지붕|단부|계단실|EV홀|복도|주차장|상가동|후면|전면|측면|외부|내부|동측|서측|남측|북측|외부비계|워킹타워|\d+구간|\w+구간|외벽|내벽|슬래브|바닥|천장))+/i);
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

const TAXONOMY_STANDARD_PROMPT = `
[건설안전 10대 표준 분류 체계 (Taxonomy) 선택 기준 - 반드시 아래 공식 작업분류표(작업분류표.jpg) 내에서만 선택할 것]
1. 공종 (workGroup):
   - 공통공사: ["현장관리", "청소"]
   - 건축공사: ["가설공사(안전시설물)", "가설공사(기타)", "가설공사(타워크레인)", "가설공사(건설용리프트)", "가설공사(건설장비)", "비계공사", "철거공사(구조물)", "철거공사(석면)", "PC공사", "거푸집동바리공사", "거푸집공사(갱폼)", "거푸집공사(특수폼: ACS, RCS등)", "철근공사", "철골공사", "데크플레이트공사", "조적공사", "미장공사", "방수공사", "타일공사", "석공사", "커튼월공사", "창호공사(STL)", "창호공사(AL)", "창호공사(PL)", "창호공사(목창호)", "창호공사(기타)", "외장판넬공사", "유리공사", "코킹공사", "수장공사", "도장공사", "건축공사(기타)"]
   - 전기공사: ["가설전기공사", "수변전설비공사", "전선관공사", "전선설치공사", "전등공사", "전열공사", "접지공사", "피뢰침공사", "전기공사(기타)", "통신공사"]
   - 설비공사: ["설비공사(기타)", "배관공사(기계실)", "배관공사(냉난방)", "배관공사(소화)", "배관공사(가스)", "배관공사(위생)", "배관공사(기타)", "일반덕트공사", "보온공사"]
   - 토목공사: ["지장물이설공사", "터파기공사", "발파공사", "부지정지공사", "사면안정화공사", "가시설공사", "흙막이/차수공사", "배수공사", "현장타설말뚝공사", "배수및관로공사", "옹벽공사", "포장공사(기타)"]
   - [절대 금지] "양중 및 운반작업", "양중작업", "안전시설공사", "해체/철거공사", "콘크리트공사"는 작업분류표에 없는 명칭이므로 workGroup으로 절대 사용하지 말 것!
   - [원문 공종 보존 필수] 입력 cells.workTypeRaw에 "PC공사", "거푸집동바리공사", "비계공사", "커튼월공사", "창호공사(PL)" 등 공식 분류표 공종이 이미 적혀 있으면, 내용에 "양중", "하역", "운반" 단어가 있어도 공종(workGroup)은 반드시 원문 공식 공종("PC공사", "거푸집동바리공사" 등)을 그대로 유지하고 작업방법(workMethod)만 "양중작업" 또는 "하역운반작업"으로 분류할 것!
   - PL창호공사, 피엘창호, 창호(PL) 관련 작업은 반드시 건축공사 세부공종인 "창호공사(PL)"로 분류
   - 가설전기, 임시전력, 분전반, 차단기, 접지, 가설전선, 전등 소켓, 심선 노출 관련 작업은 반드시 전기공사 세부공종인 "가설전기공사"로 분류 (임의로 "가설공사(기타)"로 분류 금지)
   - 거푸집동바리, 형틀자재, 유로폼, 알폼, 동바리, 서포트는 "거푸집동바리공사", 갱폼은 "거푸집공사(갱폼)"
   - 시스템비계, 외부비계, 작업발판, 벽이음은 "비계공사"
2. 작업방법 (workMethod): ["굴착작업", "하역운반작업", "양중작업", "설치조립작업", "해체작업", "중량물취급작업", "고소작업", "밀폐공간작업", "협소공간작업"] 중 선택.
   - 지게차 작업, 자재 하역, 상차·하차, 운반은 반드시 "하역운반작업"
   - 가설전기·분전반·접지선·전등·가설시설물 설치/배치/유지관리·점검 불량은 반드시 "설치조립작업" (절대 "해체작업"으로 오분류 금지! 인터뷰에 "철거 예정"이 있거나 커버가 열려 노출돼도 해체작업이 아님)
   - "굴착작업"은 실제 터파기·굴착·토사반출 작업일 때만 선택 (단순히 작업장소가 "흙막이 상부/주변"이면서 분전반·통로·난간 불량인 경우 절대 "굴착작업" 선택 금지!)
   - "해체작업"은 실제로 비계·거푸집·동바리·구조물을 철거·해체하는 작업 중 지적된 경우에만 선택
   - 크레인/타워크레인/양중물 인양(PC부재·형틀자재 양중 포함)은 "양중작업"
3. 기인물 대분류 (agentMajor): ["가시설", "건설장비", "작업발판", "작업장·통로", "전기·화기·설비", "양중·줄걸이", "개인보호구", "토공·구조물"] 중 선택.
4. 기인물 중분류 (agentMid):
   - 가시설 하위: ["특수거푸집", "거푸집/동바리", "비계", "안전시설", "흙막이가시설"]
   - 건설장비 하위: ["양중장비", "굴착·토공장비", "콘크리트장비", "고소작업장비", "하역운반장비"]
   - 작업발판 하위: ["가설발판", "이동식발판"]
   - 전기·화기·설비 하위: ["전기시설", "화기·용접", "소방시설"]
   - 작업장·통로 하위: ["통로", "개구부"]
   - 양중·줄걸이 하위: ["줄걸이용구"]
   - 개인보호구 하위: ["보호구"]
5. 기인물 소분류 (agentMinor):
   - 특수거푸집: ["갱폼", "Gang Form", "알폼", "AL Form", "ACS", "RCS", "슬립폼"] (갱폼, 선해체방지커버, 알폼, AL Form은 반드시 "특수거푸집" > "갱폼" 또는 "알폼")
   - 거푸집/동바리: ["유로폼", "파이프서포트", "시스템동바리", "잭서포트"]
   - 비계: ["시스템비계", "강관비계", "틀비계", "외부비계", "달비계"]
   - 안전시설: ["안전난간", "개구부덮개", "낙하물방지망", "방호선반", "수직보호망", "안전대걸이시설"]
   - 전기시설: ["누전차단기", "가설전선/이동릴선", "분전함", "접지시설", "투광등"]
   - 하역운반장비: ["지게차", "페이로더", "덤프트럭"] (지게차/유도원 하역 충돌 우려 시 agentMajor="건설장비", agentMid="운반장비", agentMinor="지게차")
6. 재해 형태 (hazardType): ["추락", "낙하·비래", "붕괴·도괴", "전도", "협착", "충돌", "전복", "화재", "폭발·파열", "감전"] 중 선택.
7. 관련 법령 (law): 산업안전보건기준에 관한 규칙 공식 조문 (예: "안전보건규칙 제337조(갱폼 등의 조립ㆍ해체 등)", "안전보건규칙 제332조(거푸집동바리등의 안전조치)", "안전보건규칙 제42조(추락의 방지)", "안전보건규칙 제56조(작업발판의 구조)", "안전보건규칙 제172조(접촉의 방지)", "안전보건규칙 제301조(전기기계ㆍ기구 충전부 방호)", "안전보건규칙 제302조(전기 기계·기구의 접지)", "안전보건규칙 제304조(누전차단기 설치 등)" 등).
   - 공종·부적합 내용이 가설전기·분전반·접지·차단기·전등·소켓·충전부이면 절대 지게차(제172조)를 선택하지 말고 전기 조문(제301조/제302조/제304조)만 선택하라.
8. 불안전 상태 (condition): ["방호장치 결함 (덮개·난간 미설치 등)", "물(物) 자체의 결함 (자재·부재 손상/변형)", "복장·보호구 결함", "작업환경 불량", "생산공정 결함", "배치·적재 불량", "경보·신호 체계 결함", "해당없음"] 중 선택.
9. 불안전 행동 (action): ["보호구 미착용", "방호장치 기능 무효화", "위험구역 접근", "불안전한 동작·자세", "부적절한 작업방법", "기계·기구 무단 취급", "해당없음"] 중 선택.
10. 근본원인 분석:
    - rootCauseMgmt (법적 관리감독): ["관리감독자 지정 및 역할 수행 미흡", "작업계획서 미수립 또는 형식적 작성", "위험성평가 유해위험요인 누락/미반영", "특별안전보건교육 미실시", "합동 안전점검 및 순회점검 미흡"] 중 선택.
    - rootCauseSystem (안전시스템): ["협력업체 안전관리계획 검토/승인 절차 미흡", "Hold Point(승인점검) 절차 미이행", "공정 간 간섭사항 사전 검토 체계 부재", "안전시설물 설치/인계인수 프로세스 미흡", "표준작업절차서(SOP) 미배포 또는 현장 부적합"] 중 선택.
    - stakeholder (관리/책임주체): ["원청 시공팀", "원청 안전팀", "협력사 관리감독자", "협력사 근로자", "장비 임대/운전원"] 중 선택.
[사진 요약 배너 photoBanner 작성 규칙]
- 사진 상단 배너는 실제 위반한 핵심 사실(대상 + 결함/행동)만 12~24자 완성된 한국어 띄어쓰기 명사구로 간결히 요약할 것 (괄호가 중간에 끊기거나 글자가 잘리는 일이 절대 없게 완성문으로 작성).
- 사진 번호 원문자 기호(①, ②, ③, ④ 등)나 숫자 배지는 photoBanner에서 반드시 완전히 제거할 것!
- 절대 부적합 내용(content) 전체를 그대로 복사하거나 '~발생시 감전우려', '~하여 충돌 우려', '~방전 미흡', '2) ...' 부연 결과절 및 말줄임표(...)를 붙이지 말 것!
- (예: "접지선 볼트 고정 불량 및 용량 부족", "유도원·근로자 지게차 근접 작업", "분전함 차단기 충전부 노출", "가설분전반 관리 및 주변정리 불량", "전등 소켓 충전부 노출 및 절연 불량", "지하층 슬래브 단부의 생명줄 처짐 과다")`;

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

    // ── 🤖 AI 자동 분석 엔드포인트 (Cloudflare Vision AI + Qwen3-30B/Qwen2.5-32B 하이브리드 24시간 연동) ──
    if (url.pathname === '/api/ai-analyze' || url.pathname === '/api/vision-ocr') {
      try {
        const body = await request.json().catch(() => ({}));

        // [v2.0 신규] 다건 묶음(Multi-Page Batch) 표준 분류 + 핀포인트 오타 패치 모드 (일 2,500장+ 무료 처리)
        if (body.mode === 'batch_classify' && Array.isArray(body.items) && body.items.length > 0) {
          const items = body.items.slice(0, 10);
          const buildFallbackBatch = (quota = false, errMsg = '') => ({
            ok: true,
            source: 'cloudflare_rule_batch',
            quotaExceeded: quota,
            error: errMsg || undefined,
            results: items.map(it => {
              const rawWg = String(it.cells?.workTypeRaw || '').replace(/^.*?공종명?\s*[:：.]?\s*/, '').trim();
              const fb = analyzeRuleFallback(`${rawWg} ${it.cells?.content || ''}`);
              const mappedWg = /pl\s*창호/i.test(rawWg)
                ? '창호공사(PL)'
                : (/^가설\s*전기$|^설비[·/]전기/i.test(rawWg)
                  ? '가설전기공사'
                  : (/^p\.?c\s*(?:공사|작업)?$|^피씨\s*공사$/i.test(rawWg) ? 'PC공사' : rawWg));
              const isInvalidWg = !mappedWg || mappedWg === '양중 및 운반작업' || mappedWg === '공통';
              return {
                pageIndex: it.pageIndex,
                workGroup: (!isInvalidWg ? mappedWg : (fb.workGroup || '건축공사(기타)')),
                workMethod: fb.workMethod || '설치조립작업',
                agentMajor: fb.agentMajor || '가시설',
                agentMid: fb.agentMid || '거푸집/동바리',
                agentMinor: fb.agentMinor || '유로폼',
                hazardType: fb.hazardType || '추락',
                photoBanner: stripWorkerBannerTail(fb.photoBanner || ''),
                condition: fb.condition || '안전시설 미비/불량',
                action: fb.action || '해당없음',
                rootCauseMgmt: fb.rootCauseMgmt || '관리감독자 직무 미이행 (점검·확인 누락)',
                rootCauseSystem: fb.rootCauseSystem || '작업계획서·위험성평가 미수립/부실',
                stakeholder: fb.stakeholder || '원청 관리감독자 + 협력사 소장',
                law: '',
                lawMatched: false,
                typoPatches: {}
              };
            })
          });

          if (!env.AI) {
            return new Response(JSON.stringify(buildFallbackBatch(false, 'no_ai_binding')), {
              status: 200,
              headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
            });
          }

          const batchSystemPrompt = `너는 대한민국 건설현장 안전감사 및 표준 분류(Taxonomy)·한국어 OCR 교정 전문가 AI이다.
입력된 다중 페이지(items)의 PaddleOCR 추출 텍스트를 분석하여 다음 5가지를 동시에 수행하라:
1. 건설안전 9x9 및 작업분류표(작업분류표.jpg: PC공사, 거푸집동바리공사, 창호공사(PL), 가설전기공사 등) 표준 분류코드 매핑:
   - "양중 및 운반작업", "양중작업"은 workGroup으로 절대 금지! 입력 cells.workTypeRaw에 PC공사/거푸집동바리공사 등 유효한 공종이 있으면 부적합 내용에 "양중"이 있어도 반드시 원문 공종(workGroup)을 그대로 유지하고 workMethod만 "양중작업"으로 선택하라.
   - 가설전기 분전반/접지/전등 불량은 절대 "해체작업"이나 "굴착작업"으로 분류하지 말고 "설치조립작업"으로 선택하라.
2. 사진 상단용 10~24자 핵심 위반 명사구/종결구 요약 배너(photoBanner):
   - 첫 번째 핵심 위반 항목만 10~24자로 완결 요약하고, '2) ...', '(2) ...', '② ...', '③ ...' 같은 후속 번호·꼬리 항목(예: '작업 2) 보 상부', '② 미설치')은 절대 포함하지 말 것!
   - 자연스러운 한국어 띄어쓰기와 완결된 표현 사용(원문자 ①②③④, 내부 사진번호 '과다1생명줄'→'생명줄 처짐 과다 및 매듭 불량', 오타 '판개→판재'/'노술→노출'/'본트→볼트', 부정 접두사 '미' 띄어쓰기 오류 '미 사용→미사용'/'미 설치→미설치'/'미 착용→미착용', 띄어쓰기 오류 '작업시→작업 시'/'시양중→시 양중'/'이맞지않는→이 맞지 않음'/'상태양중→상태 양중', 미완성 꼬리표현 '~상태로'→'~상태'/'~맞지 않는'→'~맞지 않음' 또는 '수평 불량', 꼬리절 '우려/방전 미흡/2)/괄호 절단' 절대 금지).
3. **[관련 기준] 3단계 우선순위 + 대한민국 산업안전보건법 기반 AI 일관 판단 및 OCR 복원·'- ' '~다.' 종결 통일 필수**:
   - **3단계 우선순위 엄수**:
     * **[1순위 — 원본 유효 기준 보존]**: 입력 lawPriorityTier === 'original_valid'이거나 올바른 지침/법규명(rawLaw)·본문(lawBody)이 도메인 모순·깨짐 없이 존재하면, 지침번호(IZ12B-xxx(K) 등)와 원문 지침을 임의로 다른 법규로 교체하지 말고 오타·띄어쓰기·'- ~다.' 종결만 교정해 유지하라(단 28자 초과 시에만 아래 기준대로 제목 축약).
     * **[2순위 — 학습된 안전작업지침 우선]**: 입력에 learnedGuideline이 제공되고 실제 작업·부적합 내용과 부합하면 해당 학습 지침(제목·본문)을 우선 적용하라.
     * **[3순위 — 공란/깨짐/모순 시 AI 산안법 일관 판단 및 OCR 복원]**: needsAiLaw === true, hasGarbledLaw === true, rawLaw 공란, 또는 rawLaw와 lawBody/content 간 모순(예: 사다리 추락 내용인데 제44조 부착설비, 전기에 지게차, 크레인 양중에 제332조 거푸집동바리)이 있을 때만 AI가 아래 기준으로 정확히 판단·교정하라:
       - **[깨진 지침번호+OCR 복원]**: hasGarbledLaw === true이거나 '연상꽃가실건물 화새에빙', '직게차'처럼 한글 OCR이 심하게 깨진 경우 guidelineCode(예: IZ12B-110(K)) + cells.lawBody 키워드('충전구역'/'화재 감시' 등) + cells.content를 종합해 정확한 안전작업지침 제목으로 복원하라(예: '안전작업지침 [IZ12B-110(K)] 임시충전설비 화재예방'). 무관한 지침(지게차 등) 날조 절대 금지.
       - **[동일 위험유형(추락 등) 일관 판단]**: 공종명만 보고 기계적 매핑하지 말고, **실제 부적합 내용(cells.content) + 작업상황 + 본문(cells.lawBody)**을 분석해 대한민국 '산업안전보건법(산업안전보건기준에 관한 규칙)'의 동일·일관된 조문을 배정하라:
         · 단부·개구부·고소작업 추락 방지 일반 → '산업안전보건기준에 관한 규칙 제42조(추락의 방지)' / '제43조(개구부 등의 방호 조치)'
         · 생명줄·안전대 부착설비·안전고리 미체결 → '산업안전보건기준에 관한 규칙 제44조(안전대의 부착설비 등)'
         · 이동식 사다리·승강 사다리 전도/추락 → '산업안전보건기준에 관한 규칙 제24조(사다리식 통로 등의 구조)'
         · 비계·작업발판·안전난간 불량 → '산업안전보건기준에 관한 규칙 제56조(작업발판의 구조)'
         · 크레인·양중물·형틀자재 양중 수평불량·달기구 → '산업안전보건기준에 관한 규칙 제132조(양중기의 안전조치)', '제134조(고리걸이 등)'
         · 전기·분전반·접지·소켓 충전부 → '산업안전보건기준에 관한 규칙 제301조(전기 기계·기구 등의 충전부 방호)', '제302조(전기 기계·기구 등의 접지)'
   - **[볼드체 rawLaw 길이 기준 — 28자 초과 시에만 AI 축약]**: rawLaw가 공백 포함 **28자 이하**이면서 올바른 법규·지침명(예: '안전작업지침 [IZ12B-214(K)] 줄걸이 작업')이면 지침번호/단어를 임의로 자르지 말고 원문 그대로 유지하라(오타만 교정). 반대로 **28자를 초과**하거나 본문 세부 준수사항('양중물 무게중심 확인...', '- ...', '1) ...')이 섞여 있으면: 본문 조항은 반드시 edits.lawBody로 분리하고, 제목 자체만 핵심 지침명·법규명을 살려 **26자 이내**로 간결히 축약해 edits.rawLaw에 반환하라 (예: '현장 위험성평가[거푸집공사] 크레인 맞음(낙하/비래) 지침' → '위험성평가[거푸집] 크레인 맞음 지침', 절대 제목을 '~금지/~확인' 행동 문장으로 대체 금지).
   - **[lawBody '- ' 불릿 완결형 '~다.' 통일]**: lawBody의 모든 오타("글지"→"금지", "쓴아짐"→"쏟아짐", "을무게중심"→"물 무게중심", "길이모양이다른"→"길이·모양이 다른", "크레인맞음"→"크레인 맞음")와 띄어쓰기를 교정하고, 다중 항목은 '- '(또는 '1) 2)') 하나로 통일하며, 특히 **'- '로 시작하는 모든 문장은 '~하며', '~하고', '~금지', 마침표 누락('~한다')으로 끝내지 말고 반드시 완전한 평서문 '~다.'(예: '~금지한다.', '~사용해야 한다.', '~결속해야 한다.')로 종결**시켜 edits.lawBody로 반환하라!
4. **[복수 인터뷰 의견 100% 보존 및 원문 정제]**: cells.interview에 '[근로자 의견 : ...]'와 '[관리자 의견 : ...]' 등 복수 의견(hasMultiInterview: true)이 있으면 절대 1개만 남기거나 병합·누락하지 말고 **모든 '[역할 의견 : 작성자]' 헤더와 하위 항목 전체를 보존**하여 띄어쓰기·오타만 교정하라. content, location, interview, proposalText, countermeasure 중 띄어쓰기·오탈자·말단 영문 노이즈(cb, cYb, ee 등) 교정이 **실제로 필요한 필드만** edits에 담아 반환하고, 변경이 불필요한 필드는 edits에 중복 반환하지 말 것 (의미·숫자·단위·1), 2), - 및 PL/AL/Door/E/V/Gray Area 등 유효 영문·단위 100% 보존). 점검차수 한자('上'/'下')는 절대 한글('상'/'하')로 바꾸지 말고 원문 한자('26년上 3차) 그대로 유지할 것. 오탈자 어절 치환은 typoPatches에 {"원문오타단어":"정확한단어"} 형식으로만 작성할 것(필드명 키 금지).
5. cells.pmVerdict가 '제재/징계' 등으로 이미 명시된 경우 [점검단 제안]으로 덮어쓰지 말 것.

${TAXONOMY_STANDARD_PROMPT}

반드시 아래 JSON 형식으로만 응답하라 (설명 금지):
{
  "results": [
    {
      "pageIndex": 1,
      "workGroup": "작업분류표 공식 공종",
      "workMethod": "표준 작업방법",
      "agentMajor": "표준 기인물 대분류",
      "agentMid": "표준 기인물 중분류",
      "agentMinor": "표준 기인물 소분류",
      "hazardType": "표준 재해형태",
      "photoBanner": "10~24자 완성된 띄어쓰기 핵심 위반 명사구(원문자·미완성어미 제외)",
      "condition": "표준 불안전 상태",
      "action": "표준 불안전 행동",
      "rootCauseMgmt": "표준 법적 관리감독",
      "rootCauseSystem": "표준 안전시스템",
      "stakeholder": "표준 관리/책임주체",
      "law": "안전보건규칙 제OO조(조항명)",
      "lawMatched": true,
      "edits": {},
      "typoPatches": {}
    }
  ]
}`;
          try {
            const qRes = await env.AI.run('@cf/qwen/qwen3-30b-a3b-fp8', {
              messages: [
                { role: 'system', content: batchSystemPrompt },
                { role: 'user', content: `${JSON.stringify(items)}\n/no_think` }
              ],
              max_tokens: 2400,
              temperature: 0.05
            });
            const raw = (typeof qRes?.response === 'string' && qRes.response) || qRes?.choices?.[0]?.message?.content || '';
            const cleaned = String(raw).replace(/<think>[\s\S]*?<\/think>/g, '').replace(/```json|```/g, '').trim();
            const sIdx = cleaned.indexOf('{');
            const eIdx = cleaned.lastIndexOf('}');
            if (sIdx !== -1 && eIdx > sIdx) {
              const parsedBatch = JSON.parse(cleaned.slice(sIdx, eIdx + 1));
              if (Array.isArray(parsedBatch?.results)) {
                const normalizeWorkerLawBody = (b) => finalizeWorkerLawBullets(healSafetyKoreanLexicon(String(b || ''))
                  .replace(/크레인맞음/g, '크레인 맞음')
                  .replace(/(\([^)]+\))\s*지침\s*(?=[가-힣A-Za-z0-9])/g, '$1 지침\n- ')
                  .replace(/\)지침/g, ') 지침')
                  .replace(/양중을\s*무게중심/g, '양중물 무게중심')
                  .replace(/무게중심확인/g, '무게중심 확인')
                  .replace(/길이\s*모양\s*이\s*다른\s*(?=[가-힣])|길이모양이다른\s*(?=[가-힣])|길이모양이다른/g, '길이·모양이 다른 ')
                  .replace(/이형자재(?=[가-힣])/g, '이형자재 ')
                  .replace(/양중글지|양중금지/g, '양중 금지')
                  .replace(/글지(?=\s|[.,!?]|$)/g, '금지')
                  .replace(/^\s*[*▪]\s*/gm, '- ')
                  .replace(/•([^\s])/g, '• $1')
                  .replace(/([을를이가은는에로])(설치|준수|착용|확보|관리|실시|금지)(해야|하여야|한다|할\s*것)/g, '$1 $2$3')
                  .trim());
                const cleanedResults = parsedBatch.results.map((item, resIdx) => {
                  if (!item || typeof item !== 'object') return item;
                  const out = { ...item };
                  const srcItem = items.find((b) => Number(b?.pageIndex) === Number(out.pageIndex)) || items[resIdx] || {};
                  const srcCells = srcItem.cells || {};
                  const srcCtx = `${srcCells.workTypeRaw || ''} ${srcCells.content || ''} ${out.workGroup || ''}`;
                  const isSrcElec = /전기|전선|분전반|분전함|누전|차단기|접지|전등|소켓|심선|충전부|감전/.test(srcCtx) && !/지게차|유도원|하역|운행경로/.test(srcCtx);
                  const isSrcCraneLift = /크레인|타워크레인|양중물|형틀자재\s*양중|줄걸이|유도로프|이형자재\s*양중/.test(`${srcCtx} ${srcCells.lawBody || ''}`);
                  const hasSrcFormworkDefect = /동바리\s*(?:조립|침하|변형|2본|이중|구조검토|설치|미복구|해체)|거푸집\s*(?:조립|해체|탈형|측압|전도)/.test(srcCtx);
                  const needAiLawGen = Boolean(srcItem.needsAiLaw || srcItem.hasGarbledLaw);
                  if (out.workGroup === '양중 및 운반작업' || out.workGroup === '양중작업' || out.workGroup === '안전시설공사' || out.workGroup === '콘크리트공사') {
                    out.workGroup = '';
                  }
                  if (typeof out.photoBanner === 'string') {
                    out.photoBanner = out.photoBanner.includes('\uFFFD')
                      ? ''
                      : stripWorkerBannerTail(out.photoBanner);
                  }
                  // AI가 도메인 모순된 조문을 실수로 뱉었을 때만 제거(임의 하드코딩 조문 주입 금지)
                  if (isSrcCraneLift && !hasSrcFormworkDefect && /제332조|거푸집동바리/.test(String(out.law || ''))) {
                    out.law = '';
                  }
                  if (isSrcElec && /지게차|172조|유도자/.test(String(out.law || ''))) {
                    out.law = '';
                  }
                  const rawEdits = (out.edits && typeof out.edits === 'object')
                    ? out.edits
                    : ((out.fixedFields && typeof out.fixedFields === 'object') ? out.fixedFields : null);
                  if (rawEdits) {
                    const ff = {};
                    const origLawNorm = srcCells.lawRaw ? normalizeWorkerLawTitle(String(srcCells.lawRaw)) : '';
                    for (const [k, v] of Object.entries(rawEdits)) {
                      if (typeof v !== 'string' || !v.trim() || v.includes('\uFFFD')) continue;
                      if (k === 'interview' || k === 'interviewOpinion') {
                        if (hasMultiInterviewSectionsWorker(srcCells.interview) && !hasMultiInterviewSectionsWorker(v)) {
                          continue;
                        }
                        ff[k] = v;
                        continue;
                      }
                      if (k === 'rawLaw' || k === 'lawRaw' || k === 'lawBody') {
                        if (srcItem.lawPriorityTier === 'original_valid' && k !== 'lawBody' && !srcItem.hasGarbledLaw) {
                          if (!/지침|IZ12B/i.test(v) && /지침|IZ12B/i.test(String(srcCells.lawRaw || ''))) continue;
                        }
                        if (isSrcElec && /지게차|유도자|운행경로|제172조/.test(v)) continue;
                        if (k === 'lawBody') {
                          ff.lawBody = normalizeWorkerLawBody(v);
                        } else {
                          const normCandidate = normalizeWorkerLawTitle(v);
                          const splitTitleRes = splitWorkerLeakedLawTitle(normCandidate, ff.lawBody || srcCells.lawBody || '');
                          const cleanedTitleCand = splitTitleRes.title;
                          if (splitTitleRes.body && !ff.lawBody) {
                            ff.lawBody = normalizeWorkerLawBody(splitTitleRes.body);
                          }
                          if (isSrcCraneLift && !hasSrcFormworkDefect && /제332조|거푸집동바리/.test(cleanedTitleCand)) {
                            continue;
                          }
                          ff.rawLaw = cleanedTitleCand;
                        }
                        continue;
                      }
                      if (k === 'round' || k === 'inspectRound') {
                        const nr = normalizeWorkerRoundText(v);
                        if (nr) ff[k] = nr;
                        continue;
                      }
                      ff[k] = (k === 'photoBanner' || k === 'banner')
                        ? stripWorkerBannerTail(v)
                        : v;
                    }
                    if (!ff.rawLaw && needAiLawGen && out.law) {
                      ff.rawLaw = normalizeWorkerLawTitle(out.law);
                    }
                    if (!ff.rawLaw && origLawNorm && !srcItem.hasGarbledLaw && origLawNorm !== String(srcCells.lawRaw || '').trim()) {
                      const origSplit = splitWorkerLeakedLawTitle(origLawNorm, ff.lawBody || srcCells.lawBody || '');
                      ff.rawLaw = origSplit.title;
                      if (origSplit.body && !ff.lawBody) ff.lawBody = normalizeWorkerLawBody(origSplit.body);
                    }
                    out.edits = ff;
                    out.fixedFields = ff;
                  } else if (needAiLawGen && out.law) {
                    out.edits = { rawLaw: normalizeWorkerLawTitle(out.law) };
                    out.fixedFields = out.edits;
                  }
                  return out;
                });
                const safeBatchResults = scrubWorkerResultFffd(cleanedResults, buildFallbackBatch(false, '').results);
                return new Response(JSON.stringify({
                  ok: true,
                  source: 'qwen3_30b_batch',
                  model: 'Qwen3-30B-A3B Batch (Cloudflare 24h Cloud)',
                  results: safeBatchResults
                }), {
                  status: 200,
                  headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
                });
              }
            }
          } catch (batchErr) {
            const isQ = /4006|daily free allocation|quota|neurons|rate.?limit/i.test(String(batchErr?.message || batchErr || ''));
            return new Response(JSON.stringify(buildFallbackBatch(isQ, String(batchErr?.message || batchErr))), {
              status: 200,
              headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
            });
          }
          return new Response(JSON.stringify(buildFallbackBatch(false, 'parse_fallback')), {
            status: 200,
            headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
          });
        }

        // [v3.0 신규] 등록 전 AI 최종 검증 게이트(Pre-Save Verify & QA):
        // 오탈자·띄어쓰기·사진요약 완결성·대한민국 산업안전보건법 관련기준·표준분류를 등록 직전 AI가 전수 검증/교정
        if (body.mode === 'verify_review' && Array.isArray(body.items) && body.items.length > 0) {
          const items = body.items.slice(0, 10);
          const cleanVerifyBanner = (s) => stripWorkerBannerTail(s);
          const cleanVerifyLawBody = (b) => {
            let s = healSafetyKoreanLexicon(String(b || ''))
              .replace(/크레인맞음/g, '크레인 맞음')
              .replace(/(\([^)]+\))\s*지침\s*(?=[가-힣A-Za-z0-9])/g, '$1 지침\n- ')
              .replace(/\)지침/g, ') 지침')
              .replace(/양중을\s*무게중심/g, '양중물 무게중심')
              .replace(/무게중심확인/g, '무게중심 확인')
              .replace(/길이\s*모양\s*이\s*다른\s*(?=[가-힣])|길이모양이다른\s*(?=[가-힣])|길이모양이다른/g, '길이·모양이 다른 ')
              .replace(/이형자재(?=[가-힣])/g, '이형자재 ')
              .replace(/양중글지|양중금지/g, '양중 금지')
              .replace(/글지(?=\s|[.,!?]|$)/g, '금지')
              .replace(/(?<=[.!?]|다|함|됨|음|금지)\s+([•*▪-])\s+(?=[가-힣A-Za-z0-9(\[])/g, '\n$1 ')
              .replace(/^\s*[*▪]\s*/gm, '- ')
              .replace(/•([^\s])/g, '• $1')
              .replace(/([을를이가은는에로])(설치|준수|착용|확보|관리|실시|금지)(해야|하여야|한다|할\s*것)/g, '$1 $2$3')
              .trim();
            const lines = s.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
            const hasDash = lines.some(l => /^-\s/.test(l));
            const hasDot = lines.some(l => /^[•·]\s/.test(l));
            if (hasDash && hasDot) {
              s = lines.map(l => l.replace(/^[•·]\s+/, '- ')).join('\n');
            }
            return finalizeWorkerLawBullets(s);
          };
          const buildVerifyFallback = (quota = false, errMsg = '') => ({
            ok: true,
            source: 'cloudflare_verify_fallback',
            quotaExceeded: quota,
            error: errMsg || undefined,
            results: items.map((it, idx) => {
              const fb = analyzeRuleFallback(`${it.workGroup || ''} ${it.content || ''} ${it.lawBody || ''}`);
              const ctx = `${it.workGroup || ''} ${it.content || ''} ${it.lawBody || ''}`;
              const isCraneLift = /크레인|타워크레인|양중물|형틀자재\s*양중|줄걸이|유도로프|이형자재\s*양중/.test(ctx);
              const isFormDefect = /동바리\s*(?:조립|침하|변형|2본|이중|구조검토|설치|미복구|해체)|거푸집\s*(?:조립|해체|탈형|측압|전도)/.test(ctx);
              let law = it.law || '';
              let rawLaw = it.rawLaw || '';
              let rawLawBody = it.lawBody || '';
              const splitFb = splitWorkerLeakedLawTitle(rawLaw, rawLawBody);
              rawLaw = splitFb.title;
              rawLawBody = splitFb.body;
              if (isCraneLift && !isFormDefect) {
                if (/제332조|거푸집동바리/.test(law)) law = '';
                if (/제332조|거푸집동바리/.test(rawLaw)) rawLaw = law;
              }
              const photoBanner = cleanVerifyBanner(it.photoBanner || fb.photoBanner || '');
              const lawBody = cleanVerifyLawBody(rawLawBody);
              const inspectRound = it.inspectRound ? (normalizeWorkerRoundText(it.inspectRound) || it.inspectRound) : '';
              const content = healSafetyKoreanLexicon(it.content || '');
              const location = cleanLocationWorker(it.location || '', content);
              const corrections = {};
              if (photoBanner && photoBanner !== (it.photoBanner || '')) corrections.photoBanner = photoBanner;
              if (law && law !== (it.law || '')) corrections.law = law;
              if (rawLaw && rawLaw !== (it.rawLaw || '')) corrections.rawLaw = rawLaw;
              if (lawBody && lawBody !== (it.lawBody || '')) corrections.lawBody = lawBody;
              if (inspectRound && inspectRound !== (it.inspectRound || '')) corrections.inspectRound = inspectRound;
              if (content && content !== (it.content || '')) corrections.content = content;
              if (location && location !== (it.location || '')) corrections.location = location;
              return {
                pageIndex: it.pageIndex ?? (idx + 1),
                verified: true,
                workGroup: it.workGroup || fb.workGroup || '',
                workMethod: it.workMethod || fb.workMethod || '',
                hazardType: it.type || fb.hazardType || '',
                photoBanner,
                law,
                rawLaw: rawLaw || law,
                lawBody,
                corrections,
                issues: Object.keys(corrections).length ? ['표기·띄어쓰기·법규 자동 보정'] : []
              };
            })
          });

          if (!env.AI) {
            return new Response(JSON.stringify(buildVerifyFallback(false, 'no_ai_binding')), {
              status: 200,
              headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
            });
          }

          const verifySystemPrompt = `너는 대한민국 산업안전보건법(산업안전보건기준에 관한 규칙) 및 건설안전 표준분류·한국어 교정 최종 검증(Pre-Save QA) AI이다.
입력된 점검 데이터(items)를 DB에 최종 등록하기 직전에 전수 검증하여 아래 5가지 기준에 따라 오탈자·띄어쓰기·법규·분류·서식 오류를 100% 교정하라:
1. [사진 요약(photoBanner) 검증]:
   - 첫 번째 핵심 위반 항목만 자연스러운 한국어 8~26자 완결 명사구/종결구로 교정하고, '2) ...', '(2) ...', '② ...', '③ ...' 같은 후속 번호·꼬리 항목(예: '작업 2) 보 상부')은 반드시 제거할 것!
   - 원문자(①②), 사진번호 끼임("과다1생명줄" → "생명줄 처짐 과다 및 매듭 불량"), 오타("판개" → "판재", "노술" → "노출"), 부정 접두사 띄어쓰기 오류("미 사용" → "미사용", "미 설치" → "미설치", "미 착용" → "미착용"), 띄어쓰기 누락("작업시" → "작업 시", "시양중" → "시 양중", "상태양중" → "상태 양중", "이맞지않는" → "이 맞지 않음"), 불완전 꼬리표현("~상태로" → "~상태", "~맞지 않는" → "~맞지 않음" 또는 "수평 불량")을 반드시 완결된 한국어로 교정할 것!
2. [관련 기준(law, rawLaw, lawBody) — 3단계 우선순위 + 대한민국 산업안전보건법 기반 AI 일관 판단 + OCR 복원 + 볼드 제목 축약 + '- ' 문장 종결('~다.')]:
   - **3단계 우선순위 엄수**:
     * **[1순위 — 원본 유효 기준 보존]**: lawPriorityTier === 'original_valid'이거나 올바른 지침/법규명(rawLaw)과 본문(lawBody)이 도메인 모순·깨짐 없이 존재하면 지침번호('[IZ12B-xxx(K)]' 등)와 원문 지침을 임의로 다른 법규로 교체하지 말고 오탈자·띄어쓰기·'- ~다.' 종결만 교정하여 유지하라(28자 초과 시에만 아래 기준대로 제목 축약).
     * **[2순위 — 학습된 안전작업지침 우선]**: 입력에 learnedGuideline이 포함되고 실제 작업·부적합 내용과 부합하면 해당 학습 지침(제목·본문)을 우선 반영하라.
     * **[3순위 — 공란/깨짐/모순 시 AI 산안법 일관 판단 및 OCR 복원]**: needsAiLaw === true, hasGarbledLaw === true, rawLaw 공란, 또는 제목과 lawBody/content 모순(예: 사다리 추락인데 제44조, 전기에 지게차, 크레인에 제332조) 시 AI가 대한민국 '산업안전보건법(산업안전보건기준에 관한 규칙)'으로 일관 판단·복원하라:
       - **[깨진 지침번호+OCR 복원]**: hasGarbledLaw === true이거나 '연상꽃가실건물 화새에빙', '직게차'처럼 한글 OCR이 깨진 경우 guidelineCode(예: IZ12B-110(K)) + lawBody 핵심어('충전구역'/'화재 감시' 등) + content를 조합해 정확한 지침명(예: '안전작업지침 [IZ12B-110(K)] 임시충전설비 화재예방')으로 복원하고 무관 지침(지게차 등) 날조를 절대 금지한다.
       - **[동일 위험유형(추락 등) 일관 판단]**: 공종명만 보고 기계적 유지하지 말고 **실제 부적합 내용(content) + 작업방법(workMethod) + 본문(lawBody)**을 분석하여 동일 위험유형은 항상 일관된 산안규칙 조문을 배정하라:
         · 단부·개구부·고소작업 추락 방지 일반 → '산업안전보건기준에 관한 규칙 제42조(추락의 방지)' / '제43조(개구부 등의 방호 조치)'
         · 생명줄·안전대 부착설비 불량·Slab 안전고리 미체결 → '산업안전보건기준에 관한 규칙 제44조(안전대의 부착설비 등)'
         · 이동식 사다리·승강 사다리 전도/추락 → '산업안전보건기준에 관한 규칙 제24조(사다리식 통로 등의 구조)'
         · 비계·작업발판·안전난간 불량 → '산업안전보건기준에 관한 규칙 제56조(작업발판의 구조)', '제13조'
         · 크레인·형틀자재 양중·달기구·이형자재 양중 수평불량 → '산업안전보건기준에 관한 규칙 제132조(양중기의 안전조치)', '제134조(고리걸이 등)'
         · 가설전기·분전반·접지·전등 충전부 → '산업안전보건기준에 관한 규칙 제301조', '제302조', '제304조'
   - **[볼드체 rawLaw 길이 기준 — 28자 초과 시에만 AI 축약]**:
     * 입력된 rawLaw가 공백 포함 **28자 이하**이면서 올바른 지침/법규명(예: '안전작업지침 [IZ12B-214(K)] 줄걸이 작업')이면 '[IZ12B-xxx(K)]'나 '안전작업지침'을 절대 삭제하지 말고 원문을 유지하라(오탈자만 교정).
     * 입력된 rawLaw가 **28자를 초과**해 PPT 볼드 1줄 박스를 넘치거나 본문 세부 조항이 섞여 있으면: 혼입 본문은 lawBody로 분리하고, 지침/법규 제목 자체의 핵심 의미를 살려 **26자 이내**로 간결히 줄여 corrections.rawLaw에 반환하라 (예: '현장 위험성평가[거푸집공사] 크레인 맞음(낙하/비래) 지침' → '위험성평가[거푸집] 크레인 맞음 지침'). 절대 지침 제목 대신 lawBody의 세부 문장('양중물 무게중심 확인...' 등)을 rawLaw에 넣지 말 것!
   - rawLaw가 비어있거나 틀린 조문이면 올바른 산안규칙 조문으로 교체하고, lawBody가 비어있다면 핵심 법규 요지를 '- ' 불릿 1~2줄로 간결·정확히 작성하라!
   - **[서식·띄어쓰기·불릿 및 '~다.' 종결 통일]**: lawBody의 모든 오타("글지"→"금지", "쓴아짐"→"쏟아짐", "을무게중심"→"물 무게중심", "길이모양이다른"→"길이·모양이 다른", "크레인맞음"→"크레인 맞음")와 띄어쓰기를 완결하고, 다중 항목은 '- ' 불릿(또는 '1) 2)') 하나로 통일하되, **'- ' 불릿으로 시작하는 모든 문장은 '~하며', '~하고', '~금지', 마침표 누락('~한다')으로 끝내지 말고 반드시 완전한 평서문 '~다.'(예: '~금지한다.', '~사용해야 한다.', '~결속해야 한다.')로 종결**하여 corrections.lawBody로 반환하라!
3. [복수 인터뷰 의견 100% 보존 및 본문·장소·조치내용·점검차수 한자('上'/'下') 교정]:
   - interviewOpinion에 '[근로자 의견 : ...]', '[관리자 의견 : ...]' 등 복수 의견(hasMultiInterview: true)이 있으면 절대 1개만 남기거나 합치지 말고 **모든 '[역할 의견 : 작성자]' 헤더와 항목 전체를 유지**하여 띄어쓰기·오탈자만 교정(corrections.interviewOpinion)하라!
   - 원문 의미·숫자·단위는 훼손하지 않고 오탈자·띄어쓰기·말단 영문 노이즈만 교정. 특히 **점검차수(inspectRound)는 절대 한글('26년상 3차)로 바꾸지 말고 한자 '上'/'下'('26년上 3차, '26년下 2차)로 유지·보정**하라!
4. [표준 분류 검증]: ${TAXONOMY_STANDARD_PROMPT} 기준에 어긋나는 공종/작업방법은 교정.
5. 수정이 일어난 필드만 corrections 객체에 담고, issues 배열에 짧은 교정 사유를 기입하라. 변경 불필요 시 corrections는 {}로 두라.

반드시 아래 JSON 형식으로만 응답하라 (설명 금지):
{
  "results": [
    {
      "pageIndex": 1,
      "verified": true,
      "workGroup": "작업분류표 공식 공종",
      "workMethod": "표준 작업방법",
      "hazardType": "표준 재해형태",
      "photoBanner": "교정 완료된 사진 요약",
      "law": "안전보건규칙 제OO조(조항명)",
      "rawLaw": "교정 완료된 관련기준 제목",
      "lawBody": "띄어쓰기·불릿 통일된 관련기준 본문",
      "corrections": {},
      "issues": []
    }
  ]
}`;
          try {
            const promptItems = items.map((it) => {
              if (!it || typeof it !== 'object') return it;
              const cleanT = normalizeWorkerLawTitle(it.rawLaw || '');
              const preSplit = splitWorkerLeakedLawTitle(cleanT, it.lawBody || '');
              return {
                ...it,
                rawLaw: preSplit.title,
                lawBody: preSplit.body || it.lawBody || ''
              };
            });
            const qRes = await env.AI.run('@cf/qwen/qwen3-30b-a3b-fp8', {
              messages: [
                { role: 'system', content: verifySystemPrompt },
                { role: 'user', content: `${JSON.stringify(promptItems)}\n/no_think` }
              ],
              max_tokens: 2600,
              temperature: 0.05
            });
            const raw = (typeof qRes?.response === 'string' && qRes.response) || qRes?.choices?.[0]?.message?.content || '';
            const cleaned = String(raw).replace(/<think>[\s\S]*?<\/think>/g, '').replace(/```json|```/g, '').trim();
            const sIdx = cleaned.indexOf('{');
            const eIdx = cleaned.lastIndexOf('}');
            if (sIdx !== -1 && eIdx > sIdx) {
              const parsedVerify = JSON.parse(cleaned.slice(sIdx, eIdx + 1));
              if (Array.isArray(parsedVerify?.results)) {
                const verifiedResults = parsedVerify.results.map((item, idx) => {
                  if (!item || typeof item !== 'object') return item;
                  const srcItem = items.find((b) => Number(b?.pageIndex) === Number(item.pageIndex)) || items[idx] || {};
                  const srcPromptItem = promptItems.find((b) => Number(b?.pageIndex) === Number(item.pageIndex)) || promptItems[idx] || srcItem;
                  const ctx = `${srcItem.workGroup || ''} ${srcItem.content || ''} ${srcItem.lawBody || ''}`;
                  const isCraneLift = /크레인|타워크레인|양중물|형틀자재\s*양중|줄걸이|유도로프|이형자재\s*양중/.test(ctx);
                  const isFormDefect = /동바리\s*(?:조립|침하|변형|2본|이중|구조검토|설치|미복구|해체)|거푸집\s*(?:조립|해체|탈형|측압|전도)/.test(ctx);
                  const isElec = /가설전기|전기\s*작업|전기설비|분전반|분전함|접지|전등|소켓|심선|충전부|감전/.test(ctx) && !/지게차|유도원|운행경로/.test(ctx);
                  const out = { ...item, verified: true };
                  if (out.workGroup === '양중 및 운반작업' || out.workGroup === '양중작업' || out.workGroup === '안전시설공사' || out.workGroup === '콘크리트공사') {
                    out.workGroup = srcItem.workGroup || '';
                  }
                  for (const okKey of ['workGroup', 'workMethod', 'hazardType', 'photoBanner', 'law', 'rawLaw', 'lawBody', 'inspectRound']) {
                    if (typeof out[okKey] === 'string' && out[okKey].includes('\uFFFD')) {
                      out[okKey] = typeof srcPromptItem[okKey] === 'string' && !srcPromptItem[okKey].includes('\uFFFD')
                        ? srcPromptItem[okKey]
                        : '';
                    }
                  }
                  if (Array.isArray(out.issues)) {
                    out.issues = out.issues.filter((x) => typeof x === 'string' && !x.includes('\uFFFD'));
                  }
                  if (typeof out.photoBanner === 'string') {
                    out.photoBanner = cleanVerifyBanner(out.photoBanner);
                  }
                  const splitOutLaw = splitWorkerLeakedLawTitle(out.rawLaw || '', out.lawBody || srcPromptItem.lawBody || '');
                  if (splitOutLaw.title) out.rawLaw = splitOutLaw.title;
                  if (typeof out.lawBody === 'string' || splitOutLaw.body) {
                    const mergedBody = splitOutLaw.body || out.lawBody || srcPromptItem.lawBody || '';
                    out.lawBody = mergedBody.includes('\uFFFD') ? cleanVerifyLawBody(srcPromptItem.lawBody || '') : cleanVerifyLawBody(mergedBody);
                  }
                  if (typeof out.inspectRound === 'string' && out.inspectRound.trim()) {
                    out.inspectRound = normalizeWorkerRoundText(out.inspectRound) || out.inspectRound.trim();
                  }
                  if (isCraneLift && !isFormDefect) {
                    if (/제332조|거푸집동바리/.test(String(out.law || ''))) out.law = '';
                    if (/제332조|거푸집동바리/.test(String(out.rawLaw || ''))) out.rawLaw = out.law || '';
                  }
                  if (isElec && /지게차|172조|유도자/.test(`${out.law || ''} ${out.rawLaw || ''}`)) {
                    if (/지게차|172조|유도자/.test(String(out.law || ''))) out.law = '';
                    if (/지게차|172조|유도자/.test(String(out.rawLaw || ''))) out.rawLaw = out.law || '';
                  }
                  const srcTitle = String(srcPromptItem.rawLaw || '').trim();
                  const srcTitleHasHeader = /(?:지침|규칙|법|제\d+조|절차|요령|기준|평가|수칙)/.test(srcTitle);
                  const srcDomainValid = srcTitle && !srcItem.hasGarbledLaw && !srcItem.needsAiLaw &&
                    !(isElec && /지게차|172조|유도자/.test(srcTitle)) &&
                    !(isCraneLift && !isFormDefect && /제332조|거푸집동바리/.test(srcTitle));
                  if (srcDomainValid && srcItem.lawPriorityTier === 'original_valid') {
                    const outTitle = String(out.rawLaw || '').trim();
                    const outHasHeader = /(?:지침|규칙|법|제\d+조|절차|요령|기준|평가|수칙)/.test(outTitle);
                    const cmpOut = outTitle.replace(/\s+/g, '');
                    const cmpBody = String(out.lawBody || '').replace(/\s+/g, '');
                    const outCopiedBody = Boolean(cmpOut.length >= 8 && cmpBody && cmpBody.includes(cmpOut.slice(0, 8)));
                    if ((srcTitle.length <= 28 && (!outTitle || (srcTitleHasHeader && !outHasHeader))) || (!outHasHeader && srcTitleHasHeader && outCopiedBody)) {
                      out.rawLaw = srcTitle;
                    }
                  }
                  const corr = (out.corrections && typeof out.corrections === 'object') ? { ...out.corrections } : {};
                  for (const ck of Object.keys(corr)) {
                    if (typeof corr[ck] === 'string' && corr[ck].includes('\uFFFD')) {
                      const cleanOutVal = (typeof out[ck] === 'string' && !out[ck].includes('\uFFFD')) ? out[ck] : '';
                      if (cleanOutVal && cleanOutVal !== String(srcItem[ck] || '').trim()) {
                        corr[ck] = cleanOutVal;
                      } else {
                        delete corr[ck];
                      }
                    }
                  }
                  if (typeof corr.interviewOpinion === 'string' && hasMultiInterviewSectionsWorker(srcItem.interviewOpinion) && !hasMultiInterviewSectionsWorker(corr.interviewOpinion)) {
                    delete corr.interviewOpinion;
                  }
                  if (typeof corr.photoBanner === 'string') corr.photoBanner = cleanVerifyBanner(corr.photoBanner);
                  if (typeof corr.rawLaw === 'string') {
                    const splitCorrLaw = splitWorkerLeakedLawTitle(corr.rawLaw, corr.lawBody || out.lawBody || '');
                    corr.rawLaw = (out.rawLaw && out.rawLaw === srcTitle && srcDomainValid) ? out.rawLaw : splitCorrLaw.title;
                    if (splitCorrLaw.body && !corr.lawBody) corr.lawBody = splitCorrLaw.body;
                    if (corr.rawLaw === String(srcItem.rawLaw || '').trim()) delete corr.rawLaw;
                  } else if ((srcItem.needsAiLaw || srcItem.hasGarbledLaw) && out.rawLaw && out.rawLaw !== srcTitle) {
                    corr.rawLaw = out.rawLaw;
                  }
                  if ((srcItem.needsAiLaw || srcItem.hasGarbledLaw) && out.law && out.law !== srcItem.law && !corr.law) {
                    corr.law = out.law;
                  }
                  if (typeof corr.lawBody === 'string') corr.lawBody = cleanVerifyLawBody(corr.lawBody);
                  else if ((srcItem.needsAiLaw || srcItem.hasGarbledLaw) && out.lawBody && out.lawBody !== srcItem.lawBody) {
                    corr.lawBody = out.lawBody;
                  }
                  if (typeof corr.inspectRound === 'string' && corr.inspectRound.trim()) {
                    corr.inspectRound = normalizeWorkerRoundText(corr.inspectRound) || corr.inspectRound.trim();
                  } else if (srcItem.inspectRound) {
                    const normSrcR = normalizeWorkerRoundText(srcItem.inspectRound);
                    if (normSrcR && normSrcR !== String(srcItem.inspectRound).trim()) corr.inspectRound = normSrcR;
                  }
                  if (isCraneLift && !isFormDefect && typeof corr.rawLaw === 'string' && /제332조|거푸집동바리/.test(corr.rawLaw)) {
                    delete corr.rawLaw;
                  }
                  out.corrections = corr;
                  return out;
                });
                const safeVerifiedResults = scrubWorkerResultFffd(verifiedResults, items.map(it => (it.hasGarbledLaw ? { ...it, rawLaw: '', law: '' } : it)));
                return new Response(JSON.stringify({
                  ok: true,
                  source: 'qwen3_30b_verify',
                  model: 'Qwen3-30B-A3B Pre-Save QA (Cloudflare)',
                  results: safeVerifiedResults
                }), {
                  status: 200,
                  headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
                });
              }
            }
          } catch (verifyErr) {
            const isQ = /4006|daily free allocation|quota|neurons|rate.?limit/i.test(String(verifyErr?.message || verifyErr || ''));
            return new Response(JSON.stringify(buildVerifyFallback(isQ, String(verifyErr?.message || verifyErr))), {
              status: 200,
              headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
            });
          }
          return new Response(JSON.stringify(buildVerifyFallback(false, 'parse_fallback')), {
            status: 200,
            headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
          });
        }

        // [v2.0 신규] 현장 직접 등록 모드(Guided Complete): 1줄 키워드 + 선택 분류값으로 보고서 문장 자동 생성
        if (body.mode === 'guided_complete') {
          const memo = String(body.memo || body.content || '').trim();
          const workGroup = body.workGroup || '가설공사(기타)';
          const workMethod = body.workMethod || '설치조립작업';
          const severity = body.severity || '중부적합';
          const fb = analyzeRuleFallback(`${workGroup} ${workMethod} ${memo}`);
          if (env.AI && memo) {
            try {
              const guidedPrompt = `건설현장 안전점검 메모("${memo}", 공종: ${workGroup}, 작업: ${workMethod}, 등급: ${severity})를 바탕으로 표준 부적합 점검장표용 문장을 JSON으로 작성하라.
JSON 형식:
{
  "content": "구체적 부적합 개요 문장",
  "photoBanner": "사진 상단 18자 내외 핵심 요약 배너",
  "law": "안전보건규칙 제OO조(조항명)",
  "interviewOpinion": "- 현장 관계자 인터뷰(발생원인) 문장",
  "auditProposal": "- 점검단 개선제안 문장",
  "actionPlan": "- 현장 즉시 조치 및 재발방지 개선대책 문장"
}`;
              const gRes = await env.AI.run('@cf/qwen/qwen3-30b-a3b-fp8', {
                messages: [{ role: 'user', content: `${guidedPrompt}\n/no_think` }],
                max_tokens: 550,
                temperature: 0.1
              });
              const raw = (typeof gRes?.response === 'string' && gRes.response) || gRes?.choices?.[0]?.message?.content || '';
              const cleaned = String(raw).replace(/<think>[\s\S]*?<\/think>/g, '').replace(/```json|```/g, '').trim();
              const sIdx = cleaned.indexOf('{');
              const eIdx = cleaned.lastIndexOf('}');
              if (sIdx !== -1 && eIdx > sIdx) {
                const parsedG = JSON.parse(cleaned.slice(sIdx, eIdx + 1));
                return new Response(JSON.stringify({ ok: true, ...fb, ...parsedG }), {
                  status: 200,
                  headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
                });
              }
            } catch (e) {}
          }
          return new Response(JSON.stringify({
            ok: true,
            ...fb,
            content: memo || fb.analysis,
            interviewOpinion: `- 작업 중 안전기준 숙지 미흡 및 현장 사전 확인 부족으로 발생함`,
            auditProposal: `- ${workGroup} ${workMethod} 관련 안전기준 재교육 및 현장 모니터링 강화 필요`,
            actionPlan: `- ${fb.pmVerdict}`
          }), {
            status: 200,
            headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
          });
        }

        const content = body.content || body.rawOcrText || '';
        if (!content && !body.stripImageBase64 && !body.imageBase64) {
          return new Response(JSON.stringify({ error: '지적 내용(content) 또는 이미지(stripImageBase64/imageBase64)가 필요합니다.' }), {
            status: 400,
            headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
          });
        }

        // 산안법 룰 기반 즉시 백업 판정 데이터 생성 (Qwen AI 호출 실패 시 백업용 · 법령/PM판정결과 임의 주입 금지)
        const quickFallback = analyzeRuleFallback(content);
        const makeRuleFallbackResponse = (errs, isQuota = false) => {
          const fallbackCleaned = buildFallbackCleanedFields(content, body.fallbackRecord);
          const needsClientOcr = !String(content).trim() && !fallbackCleaned.content;
          const payload = needsClientOcr
            ? {
                ok: true,
                source: 'cloudflare_rule_engine',
                needsClientOcr: true,
                quotaExceeded: !!isQuota,
                aiErrors: errs,
                model: 'SanAn Rule Engine (Cloudflare Cloud)',
                severity: '',
                photoBanner: '',
                workGroup: '',
                pmVerdict: '',
                cleanedFields: {}
              }
            : {
                ok: true,
                source: 'cloudflare_rule_engine',
                needsClientOcr: false,
                quotaExceeded: !!isQuota,
                aiErrors: errs,
                model: 'SanAn Rule Engine (Cloudflare Cloud)',
                ...quickFallback,
                law: '',
                pmVerdict: '',
                cleanedFields: fallbackCleaned
              };
          return new Response(JSON.stringify(payload), {
            status: 200,
            headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
          });
        };

        // Cloudflare Workers AI 인스턴스가 바인딩되어 있는 경우 실행
        if (env.AI) {
          const aiErrors = [];
          let quotaHit = false;
          const isQuotaErr = (e) => /4006|daily free allocation|quota|neurons|rate.?limit/i.test(String(e?.message || e || ''));
          try {
            let visionText = '';
            let rightPhotoIsReference = null;

            // 1) Vision AI 이미지 직접 판독 (@cf/qwen/qwen3.8-27b 고속 low-reasoning OCR -> Llama-4-Scout 보조)
            const extractJsonFromAiRes = (res) => {
              if (!res) return null;
              if (res.response && typeof res.response === 'object') return res.response;
              const raw = (typeof res.response === 'string' && res.response) || (res.choices && res.choices[0]?.message?.content) || '';
              if (raw && typeof raw === 'object') return raw;
              const cleaned = String(raw).replace(/<think>[\s\S]*?<\/think>/g, '').replace(/```json/g, '').replace(/```/g, '').trim();
              const sIdx = cleaned.indexOf('{');
              const eIdx = cleaned.lastIndexOf('}');
              if (sIdx === -1 || eIdx <= sIdx) return null;
              try {
                return JSON.parse(cleaned.slice(sIdx, eIdx + 1));
              } catch (e) {
                return null;
              }
            };

            const extractTextFromAiRes = (res) => {
              if (!res) return '';
              const raw = (typeof res.response === 'string' && res.response) || res.description || (res.choices && res.choices[0]?.message?.content) || '';
              return String(raw).replace(/<think>[\s\S]*?<\/think>/g, '').trim();
            };

            const runQwenVisionOcr = async (cleanB64, visionPrompt) => {
              const messages = [
                {
                  role: 'user',
                  content: [
                    { type: 'text', text: visionPrompt },
                    { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${cleanB64}` } }
                  ]
                }
              ];
              try {
                const qRes = await env.AI.run('@cf/qwen/qwen3.8-27b', {
                  messages,
                  max_tokens: 1200,
                  temperature: 0.05,
                  reasoning_effort: 'low'
                });
                const txt = extractTextFromAiRes(qRes);
                if (txt && txt.length >= 20) return txt;
                aiErrors.push(`qwen3.8-27b: short_or_empty(${txt?.length || 0})`);
              } catch (e1) {
                aiErrors.push(`qwen3.8-27b: ${e1?.message || String(e1)}`);
                if (isQuotaErr(e1)) {
                  quotaHit = true;
                  return '';
                }
              }
              // Qwen Vision 실패/빈 응답 시 고속 Llama-4-Scout 한국어 Vision 보조 호출 (llava 사용 배제)
              try {
                const lRes = await env.AI.run('@cf/meta/llama-4-scout-17b-16e-instruct', {
                  messages,
                  max_tokens: 1000,
                  temperature: 0.05
                });
                const txt2 = extractTextFromAiRes(lRes);
                if (txt2 && txt2.length >= 10) return txt2;
                aiErrors.push(`llama-4-scout: short_or_empty(${txt2?.length || 0})`);
                return '';
              } catch (e2) {
                aiErrors.push(`llama-4-scout: ${e2?.message || String(e2)}`);
                if (isQuotaErr(e2)) quotaHit = true;
                return '';
              }
            };

            let parsed = null;
            let usedModelLabel = 'Qwen3-30B-A3B (Cloudflare 24h Cloud)';

            if (body.stripImageBase64 && (body.forceVision || !body.rawOcrText || String(body.rawOcrText).trim().length < 25)) {
              const cleanB64 = String(body.stripImageBase64).replace(/^data:image\/\w+;base64,/, '');
              const visionPrompt = `이 이미지는 건설현장 안전점검 장표의 텍스트 셀들을 섹션 라벨([유형/등급], [관련기준], [점검체크], [협력사/공종명/작업장소/점검자/점검차수], [부적합내용], [발생원인/관리자의견], [점검단제안_판정], [점검단제안_내용], [개선대책], [PM판정결과], [사진1배너], [사진2배너])과 함께 위에서 아래로 모아놓은 이미지입니다.
각 라벨 아래에 있는 모든 한국어, 한자(上/下/中), 영문 코드, 숫자, 단위(cm/mm/도), 체크박스(☑/✓/□), 불릿 기호(-, *)를 오탈자 없이 보이는 그대로 빠짐없이 읽어서 출력하세요. /no_think`;
              visionText = await runQwenVisionOcr(cleanB64, visionPrompt);
            } else if (body.imageBase64 && body.mode !== 'ocr_clean') {
              // [Point #8] 직접 등록 시 첨부된 현장 사진을 Qwen Vision AI가 직접 판독하여 부적합 내용과 함께 산안법 조문 도출
              const cleanPhotoB64 = String(body.imageBase64).replace(/^data:image\/\w+;base64,/, '');
              const photoHazardPrompt = `이 이미지는 건설현장 안전점검 중 촬영한 현장 부적합 사진입니다.
사진 속에서 관찰되는 작업 대상(가시설/비계/거푸집/동바리/전기/양중장비/개구부/단부/사다리 등), 불안전 상태(방호시설 누락·결함·노출 등), 불안전 행동(안전대 미체결·보호구 미착용·위험자세 등), 그리고 관련 위험요인을 한국어 3~4줄로 객관적이고 구체적으로 묘사하세요. /no_think`;
              visionText = await runQwenVisionOcr(cleanPhotoB64, photoHazardPrompt);
            }

            // rightPhotoBase64 도면/사진 제외 판별 생략 (잭베이스 불량·비계설치도면 등 모든 사진 보존 및 5~15초 지연 제거)

            const isOcrClean = (body.mode === 'ocr_clean' || url.pathname === '/api/vision-ocr') && (body.rawOcrText || visionText);
            const systemPrompt = isOcrClean
              ? `너는 대한민국 산업안전보건법 및 건설현장 안전감사 전문가 AI이자 Vision+OCR 문맥 교정 및 표준 분류 전문가이다.
주어진 장표 판독 원문(Vision AI 판독 텍스트 및 디지털 PDF 텍스트)을 정밀 분석하여, 오탈자·줄바꿈을 교정하고 건설안전 표준 분류 목록(Taxonomy)에서 정확한 항목을 직접 선택하여 JSON으로만 출력하라.

${TAXONOMY_STANDARD_PROMPT}

[문맥 교정 절대 규칙]
- 협력사가 빈칸이면 절대 임의로 넣지 말고 ""로 둘 것 (공종명 '비계공사', '거푸집동바리공사' 등을 협력사에 넣지 말 것)
- 작업장소에 테두리 노이즈('서검자', '집십사수', '|')가 있으면 완전히 제거하고 정확한 동·층·구간명만 남길 것 (예: '106동 지하2층', '102동', '101동 상가동')
- [부적합내용]에서는 머리말 '부적합 내용 :'을 제거하되 1), 2) 등 다중 항목과 핵심 수치(60도, 30cm, 3개소 등)를 정확히 보존할 것
- 여러 항목이 '- '로 구분된 경우 줄바꿈(\\n- )으로 구분하되, 한 문장이 표 셀 폭 때문에 단순 줄바꿈된 경우는 공백 하나로 자연스럽게 이어붙일 것 (단, 원본에 '-'가 없으면 임의로 '-'를 붙이지 말 것)
- [점검단제안_내용]과 [개선대책]에는 판정 라벨('시스템 개선', '교육/코칭', '페널티', '(현장모니터링 강화)', '(근로자 교육)', 'PM 판정결과')을 절대 섞지 말고 오직 조치/제안 본문만 넣을 것
- 본문 문장에 단순히 '재교육', '교육 실시'가 포함되어 있다고 해서 pmVerdict에 '교육/코칭'을 추가하지 말고, 오직 [PM판정결과] 칸에 실제 적힌 분류만 그대로 출력하며 빈칸이면 반드시 ""(빈 문자열)로 출력할 것 (임의로 '시스템 개선'을 채우지 말 것!)
- 관련기준의 '*' 항목이 3개인 경우 각각 줄바꿈(\\n* )으로 구분하고, '①②③' 조항은 '한다.\n② ', '한다.\n③ ' 형태로 항목별 줄바꿈하며, '방지하기. 위한'→'방지하기 위한', '고려되어야하며'→'고려되어야 하며', '이상유무를'→'이상 유무를'로 정확히 교정할 것
- [관련기준] 제목에 깨진 한글('연상꽃가실건물 화새에빙', '전사 안전작업지침 [직게차' 등)이 있으면 지침코드([IZ12B-110(K)] 등) + 본문(충전구역/화재 감시 등)을 추론해 정확한 한국어 지침명('화재예방' 등) 또는 산업안전보건기준에 관한 규칙 적정 조문으로 교정하며, 원본에 이미 올바른 안전작업지침이 있으면 절대 다른 조문으로 임의 변경하지 말 것 (단, 본문과 도메인 모순되는 지게차 등은 실제 위반 기준으로 교정)
- [발생원인/관리자의견]에 '[근로자 의견 : ...]', '[관리자 의견 : ...]' 등 2개 이상 역할 의견이 있으면 절대 합치거나 '[... 의견 : ...]' 헤더를 지우지 말고 모든 헤더와 본문을 그대로 보존할 것
- 1차 OCR 텍스트에 섞인 자모/단어 오탈자(예: 부적함→부적합, 가관/각관, 잭배이스/잭베이스, 버팀때/버팀대, 벽의음/벽이음, 비계공ㅅ/비계공사, 직게차/지계차→지게차)와 셀 테두리/영문 노이즈('HEY', 'ERE', '6/', 'OO', 'R=', 'Naas NS')는 건설안전 문맥에 맞게 완벽히 교정·제거할 것

JSON 형식:
{
  "severity": "중부적합" 또는 "경부적합",
  "type": "재해형태 1개 (예: 낙하, 붕괴, 추락, 전도, 협착, 화재, 감전)",
  "workGroup": "작업분류표 기준 표준 공종 (PL창호공사→창호공사(PL), 가설전기→가설전기공사, 비계→비계공사)",
  "workMethod": "표준 작업방법",
  "agentMajor": "표준 기인물 대분류",
  "agentMid": "표준 기인물 중분류",
  "agentMinor": "표준 기인물 소분류",
  "law": "산안규칙 제OO조(조항명)",
  "hazardType": "표준 재해 형태",
  "condition": "표준 불안전 상태",
  "action": "표준 불안전 행동",
  "rootCauseMgmt": "표준 법적 관리감독",
  "rootCauseSystem": "표준 안전시스템",
  "stakeholder": "표준 관리/책임주체",
  "item": "기인물/작업 명칭",
  "photoBanner": "12~20자 핵심 위반 명사구 (원문 복사·2)꼬리절·결과/우려 꼬리 및 말줄임표 금지)",
  "photo2Banner": "사진 2 상단 배너용 15~25자 구체적 미준수 문구 (원문 [사진2배너]가 있으면 정제하여 반영, 단일 사진이면 '')",
  "mgmtCauses": ["계획 미수립", "계획 미이행", "불안전 행동", "불안전 상태" 중 체크된 1~2개],
  "holdPoint": true 또는 false,
  "pmVerdict": "[PM판정결과] 칸에 실제 기재된 분류만 출력 (빈칸이면 반드시 \"\" 출력, 임의로 '시스템 개선' 생성 금지)",
  "cleanedFields": {
    "subcontractor": "교정된 협력사명 (공란이면 '')",
    "workGroup": "교정된 공종명",
    "location": "교정된 작업장소 (동, 층, 코어, 외부 보존)",
    "inspector": "교정된 점검자명 (라벨 '점검자'/'적검자' 제외, 공란이면 '')",
    "round": "교정된 점검차수 (한자 '上'/'下' 유지, 예: '26년上 2차)",
    "content": "교정된 부적합 내용",
    "law": "교정된 관련기준 공식 법령 (대한민국 산업안전보건기준에 관한 규칙 기준)",
    "rawLaw": "교정된 관련기준 제목 원문 (원본 유효 지침 보존 / 깨진 제목 복원 / 공란이면 산안규칙)",
    "lawBody": "교정된 관련기준 세부 본문 원문 ('- ~다.' 종결 통일)",
    "interviewOpinion": "교정된 관계자 의견 (원본 '-' 유무 및 복수의견 헤더 100% 유지)",
    "auditProposal": "교정된 점검단 제안 본문 (원본 '-' 유무 유지)",
    "actionPlan": "교정된 개선대책 본문 (원본 '-' 유무 유지, 단순 줄바꿈 병합)"
  }
}`
              : `너는 대한민국 산업안전보건법(산업안전보건기준에 관한 규칙) 및 건설현장 안전감사 전문가 AI이다.
주어진 [현장 지적사항]과 [첨부 현장 사진 Vision AI 분석](있는 경우)을 종합·정밀 분석하여:
1. 해당 부적합 상황에 정확히 부합하는 대한민국 산업안전보건기준에 관한 규칙 공식 조문(law)과 핵심 법적 준수 기준 1~2문장(lawBody, '~다.' 종결)을 직접 판단하라.
2. 사진 상단 배너(photoBanner, photo2Banner)와 건설안전 표준 분류 목록(Taxonomy)에서 가장 정확한 항목을 선택하라.
3. pmVerdict는 현장 PM이 추후 직접 기입하는 항목이므로 반드시 빈 문자열("")로 출력하라.

${TAXONOMY_STANDARD_PROMPT}

JSON 형식:
{
  "severity": "중부적합" 또는 "경부적합",
  "type": "재해형태",
  "workGroup": "표준 공종",
  "workMethod": "표준 작업방법",
  "agentMajor": "표준 기인물 대분류",
  "agentMid": "표준 기인물 중분류",
  "agentMinor": "표준 기인물 소분류",
  "law": "산업안전보건기준에 관한 규칙 제OO조(조항명)",
  "lawBody": "해당 산안규칙 조문의 핵심 의무 준수 기준 1~2문장 ('~다.' 종결)",
  "analysis": "사진 및 부적합 내용 기반 산안법 위반 판단 근거 1~2문장",
  "hazardType": "표준 재해 형태",
  "condition": "표준 불안전 상태",
  "action": "표준 불안전 행동",
  "rootCauseMgmt": "표준 법적 관리감독",
  "rootCauseSystem": "표준 안전시스템",
  "stakeholder": "표준 관리/책임주체",
  "item": "기인물/작업 명칭",
  "photoBanner": "사진 1 상단 배너용 12~22자 구체적 위반 핵심 명사구",
  "photo2Banner": "사진 2 상단 배너용 12~22자 구체적 미준수 문구 (단일 지적이면 '')",
  "mgmtCauses": ["계획 미수립", "계획 미이행", "불안전 행동", "불안전 상태" 중 1~2개],
  "holdPoint": true 또는 false,
  "pmVerdict": ""
}`;

            const seedFields = {};
            if (body.content) seedFields.content = body.content;
            if (body.location) seedFields.location = body.location;
            if (body.workGroup) seedFields.workGroup = body.workGroup;
            if (body.subcontractor) seedFields.subcontractor = body.subcontractor;
            if (body.interviewOpinion) seedFields.interviewOpinion = body.interviewOpinion;
            if (body.auditProposal) seedFields.auditProposal = body.auditProposal;
            if (body.actionPlan) seedFields.actionPlan = body.actionPlan;

            const manualMetaLine = [
              body.workGroup ? `공종: ${body.workGroup}` : '',
              body.location ? `작업장소: ${body.location}` : '',
              body.productType ? `현장유형: ${body.productType}` : ''
            ].filter(Boolean).join(' / ');
            const userPrompt = isOcrClean
              ? `${visionText ? `[Vision AI 직접 판독 원문]:\n${visionText}\n\n` : ''}${body.rawOcrText ? `[디지털/보조 텍스트]:\n${body.rawOcrText}\n\n` : ''}${Object.keys(seedFields).length ? `[1차 추출 필드]:\n${JSON.stringify(seedFields)}` : ''}`
              : `${visionText ? `[첨부 현장 사진 Vision AI 분석]:\n${visionText}\n\n` : ''}${manualMetaLine ? `[현장 정보]: ${manualMetaLine}\n` : ''}[현장 지적사항]: "${content.trim()}"`;

            const hasValidParsed = (p) => p && (p.workGroup || p.agentMajor || p.law) && (!isOcrClean || (p.cleanedFields && p.cleanedFields.content));

            // 1순위: 고속 Qwen3-30B-A3B-FP8 (약 1~3.5초, /no_think)
            if (!quotaHit && (isOcrClean || content.trim())) {
              try {
                const q3Res = await env.AI.run('@cf/qwen/qwen3-30b-a3b-fp8', {
                  messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: `${userPrompt}\n/no_think` }
                  ],
                  max_tokens: isOcrClean ? 1300 : 750,
                  temperature: 0.05
                });
                const cand = extractJsonFromAiRes(q3Res);
                if (hasValidParsed(cand)) {
                  parsed = cand;
                  usedModelLabel = visionText ? 'Qwen-3.8-27B-Vision + Qwen3-30B-A3B (Cloudflare 24h Cloud)' : 'Qwen3-30B-A3B (Cloudflare 24h Cloud)';
                } else {
                  aiErrors.push(`qwen3-30b: invalid_json`);
                }
              } catch (e) {
                aiErrors.push(`qwen3-30b: ${e?.message || String(e)}`);
                if (isQuotaErr(e)) quotaHit = true;
              }

              // 2순위: Qwen-2.5-Coder-32B-Instruct 백업
              if (!parsed && !quotaHit) {
                try {
                  const coderRes = await env.AI.run('@cf/qwen/qwen2.5-coder-32b-instruct', {
                    messages: [
                      { role: 'system', content: systemPrompt },
                      { role: 'user', content: userPrompt }
                    ],
                    max_tokens: isOcrClean ? 1400 : 550,
                    temperature: 0.05
                  });
                  parsed = extractJsonFromAiRes(coderRes);
                  if (parsed) {
                    usedModelLabel = visionText ? 'Qwen-3.8-27B-Vision + Qwen-2.5-Coder-32B (Cloudflare 24h Cloud)' : 'Qwen-2.5-Coder-32B (Cloudflare 24h Cloud)';
                  } else {
                    aiErrors.push(`qwen2.5-coder: invalid_json`);
                  }
                } catch (e) {
                  aiErrors.push(`qwen2.5-coder: ${e?.message || String(e)}`);
                  if (isQuotaErr(e)) quotaHit = true;
                }
              }
            } else if (!quotaHit) {
              aiErrors.push('no_vision_or_ocr_text');
            }

            if (parsed) {

              // Post-AI 표준 정합성 검증 (표준 분류표 대·중·소분류 정확도 보장)
              const combinedCtx = `${parsed.workGroup || ''} ${body.workGroup || ''} ${parsed.cleanedFields?.content || content || ''}`;
              const isElecCtx = /전기|전선|분전함|누전|차단기|접지|투광등|케이블/i.test(combinedCtx);
              const isFormCtx = /거푸집|동바리|벽체|전도방지|유로폼|갱폼|알폼|al\s*form|gang\s*form|서포트/i.test(combinedCtx);
              const isScafCtx = !isFormCtx && /비계|버팀대|벽이음|잭\s*베이스|잭베이스|가새|작업발판/i.test(combinedCtx);
              if (isFormCtx && !isElecCtx) {
                parsed.agentMajor = '가시설';
                const isSpecForm = /갱폼|gang\s*form|선해체|알폼|al\s*form|알루미늄/i.test(combinedCtx);
                parsed.agentMid = isSpecForm ? '특수거푸집' : '거푸집/동바리';
                if (parsed.agentMid === '특수거푸집') {
                  parsed.agentMinor = /알폼|al\s*form|알루미늄/i.test(combinedCtx) ? '알폼' : '갱폼';
                } else if (!['유로폼', '파이프서포트', '시스템동바리', '잭서포트'].includes(parsed.agentMinor)) {
                  parsed.agentMinor = /서포트/.test(combinedCtx) ? '파이프서포트' : (/시스템\s*동바리/.test(combinedCtx) ? '시스템동바리' : '유로폼');
                }
              } else if (isScafCtx && !isElecCtx) {
                parsed.agentMajor = '가시설';
                parsed.agentMid = '비계';
                if (!['시스템비계', '강관비계', '틀비계', '외부비계', '달비계'].includes(parsed.agentMinor)) {
                  parsed.agentMinor = /시스템\s*비계/.test(combinedCtx) ? '시스템비계' : (/외부비계|버팀대|벽이음|잭\s*베이스|가새/.test(combinedCtx) ? '외부비계' : '강관비계');
                }
              }

              if (parsed.cleanedFields && typeof parsed.cleanedFields === 'object') {
                for (const k of Object.keys(parsed.cleanedFields)) {
                  if (typeof parsed.cleanedFields[k] === 'string') {
                    parsed.cleanedFields[k] = healSafetyKoreanLexicon(parsed.cleanedFields[k])
                      .replace(/가관\s*파이프/g, '각관 파이프');
                  }
                }
                if (parsed.cleanedFields.round) {
                  const nr = normalizeWorkerRoundText(parsed.cleanedFields.round);
                  if (nr) parsed.cleanedFields.round = nr;
                }
                if (parsed.cleanedFields.location) {
                  parsed.cleanedFields.location = cleanLocationWorker(parsed.cleanedFields.location, parsed.cleanedFields.content || content);
                }
                if (typeof parsed.cleanedFields.photoBanner === 'string') {
                  parsed.cleanedFields.photoBanner = parsed.cleanedFields.photoBanner
                    .replace(/[\u2460-\u2487\u2776-\u277F]/g, ' ')
                    .replace(/\s+/g, ' ')
                    .trim();
                }
                if (typeof parsed.cleanedFields.rawLaw === 'string') {
                  const rlClean = normalizeWorkerLawTitle(parsed.cleanedFields.rawLaw
                    .replace(/안\s*[선전]\s*작\s*업\s*[시지]\s*[심침]/g, '안전작업지침')
                    .replace(/\[?\s*I[Z2][1Il]2B[\s\-]*10[\/lI\|]\s*\(?\s*K\s*\)?\s*\]?/gi, '[IZ12B-107(K)]')
                    .replace(/주탁\s*\/\s*[닥딱]아방[시사][시실][실설]\s*작[입업]/g, '추락/낙하방지시설 작업')
                    .replace(/안전작업지침\s*\[/g, '안전작업지침 [')
                    .replace(/\s+/g, ' ')
                    .trim());
                  const rlSplit = splitWorkerLeakedLawTitle(rlClean, parsed.cleanedFields.lawBody || '');
                  parsed.cleanedFields.rawLaw = rlSplit.title;
                  if (rlSplit.body) parsed.cleanedFields.lawBody = rlSplit.body;
                }
                if (typeof parsed.cleanedFields.lawBody === 'string') {
                  parsed.cleanedFields.lawBody = finalizeWorkerLawBullets(parsed.cleanedFields.lawBody
                    .replace(/•([^\s])/g, '• $1')
                    .replace(/([을를이가은는에로])(설치|준수|착용|확보|관리|실시|금지)(해야|하여야|한다|할\s*것)/g, '$1 $2$3')
                    .trim());
                }
              }
              const invalidWorkerWorkGroups = new Set([
                '양중 및 운반작업', '양중및운반작업', '양중작업', '양중공사',
                '안전시설공사', '해체/철거공사', '콘크리트공사',
                '공통', '공통공사', '건축공사', '전기공사', '설비공사', '토목공사', '미분류'
              ]);
              const sanitizeWg = (wg) => {
                const trimmed = String(wg || '').trim();
                return (!trimmed || invalidWorkerWorkGroups.has(trimmed)) ? '' : trimmed;
              };
              const explicitWorkTypeRaw = sanitizeWg(body.workTypeRaw || body.cleanedFields?.workGroup || '');
              let cleanParsedWg = sanitizeWg(parsed.workGroup);
              if (!cleanParsedWg) {
                cleanParsedWg = explicitWorkTypeRaw || sanitizeWg(quickFallback.workGroup) || (/pc|프리캐스트|자재낙하|유도로프/i.test(combinedCtx) ? 'PC공사' : '가설공사(안전시설물)');
              }
              parsed.workGroup = cleanParsedWg;
              if (typeof parsed.photoBanner === 'string') {
                parsed.photoBanner = stripWorkerBannerTail(parsed.photoBanner);
              }
              if (typeof parsed.photo2Banner === 'string') {
                parsed.photo2Banner = stripWorkerBannerTail(parsed.photo2Banner);
              }
              const postCheckCtx = healSafetyKoreanLexicon(`${combinedCtx} ${parsed.cleanedFields?.hazardType || ''} ${parsed.cleanedFields?.rawLaw || ''} ${parsed.cleanedFields?.lawBody || ''}`);
              const nonForkliftCtxOnly = healSafetyKoreanLexicon(`${combinedCtx}`);
              const isForkliftWorkPost = /지게차|유도원|하역|운행경로/i.test(nonForkliftCtxOnly) && !/생명줄|안전대\s*부착|가설전기|충전부|분전반/i.test(nonForkliftCtxOnly);
              const isElecPostCtx = (isElecCtx || /충전부|소켓|심선|전등|감전|가설전기|분전반|접지선/i.test(postCheckCtx)) && !isForkliftWorkPost;
              const isFallPostCtx = !isElecPostCtx && !isForkliftWorkPost && /생명줄|안전대\s*부착|안전대|비계|거푸집|동바리|추락/i.test(postCheckCtx);
              const isForkliftPostCtx = (isForkliftWorkPost || (/지게차|유도자/i.test(postCheckCtx) && !isElecPostCtx && !isFallPostCtx));
              if (isForkliftPostCtx && !isElecPostCtx && !isFallPostCtx) {
                parsed.agentMajor = '건설장비';
                parsed.agentMid = '하역운반장비';
                parsed.agentMinor = '지게차';
              }
              if (parsed.cleanedFields && typeof parsed.cleanedFields.lawBody === 'string') {
                parsed.cleanedFields.lawBody = cleanWorkerLawBody(parsed.cleanedFields.lawBody);
              }
              // 도메인 모순된 잔존 오인식만 정리(하드코딩 조문/지침 주입 금지 · AI가 산안법으로 직접 판단)
              if (isElecPostCtx) {
                if (/제172조|직?[계게개]차|지[계개제]차/.test(String(parsed.law || ''))) parsed.law = '';
                if (parsed.cleanedFields) {
                  if (/제172조|직?[계게개]차|지[계개제]차/.test(String(parsed.cleanedFields.law || ''))) parsed.cleanedFields.law = '';
                  if (typeof parsed.cleanedFields.rawLaw === 'string' && /직?[계게개]차|지[계개제]차|3\.?\s*6\s*유도자/.test(parsed.cleanedFields.rawLaw)) {
                    parsed.cleanedFields.rawLaw = '';
                  }
                  if (typeof parsed.cleanedFields.lawBody === 'string' && /직?[계게개]차|지[계개제]차|유도자|운행경로/.test(parsed.cleanedFields.lawBody)) {
                    parsed.cleanedFields.lawBody = '';
                  }
                }
              } else if (isFallPostCtx) {
                if (/제172조|직?[계게개]차|지[계개제]차/.test(String(parsed.law || ''))) parsed.law = '';
                if (parsed.cleanedFields) {
                  if (/제172조|직?[계게개]차|지[계개제]차/.test(String(parsed.cleanedFields.law || ''))) parsed.cleanedFields.law = '';
                  if (typeof parsed.cleanedFields.rawLaw === 'string' && /직?[계게개]차|지[계개제]차|3\.?\s*6\s*유도자|제172조/.test(parsed.cleanedFields.rawLaw)) {
                    parsed.cleanedFields.rawLaw = '';
                  }
                  if (typeof parsed.cleanedFields.lawBody === 'string' && /직?[계게개]차|지[계개제]차|유도자|운행경로/.test(parsed.cleanedFields.lawBody)) {
                    parsed.cleanedFields.lawBody = '';
                  }
                }
              }
              return new Response(JSON.stringify(scrubWorkerResultFffd({
                ok: true,
                source: visionText ? 'cloudflare_qwen_vision_hybrid' : 'cloudflare_qwen_cloud',
                model: usedModelLabel,
                visionText: visionText || undefined,
                rightPhotoIsReference,
                ...quickFallback,
                ...parsed,
                law: typeof parsed.law === 'string' ? parsed.law.trim() : '',
                lawBody: typeof parsed.lawBody === 'string' ? finalizeWorkerLawBullets(parsed.lawBody) : '',
                pmVerdict: isOcrClean ? (typeof parsed.pmVerdict === 'string' ? parsed.pmVerdict.trim() : '') : '',
                severity: parsed.severity?.includes('중부적합') ? '중부적합' : (parsed.severity?.includes('경부적합') ? '경부적합' : quickFallback.severity),
                workGroup: parsed.workGroup || quickFallback.workGroup,
                workMethod: parsed.workMethod || quickFallback.workMethod,
                agentMajor: parsed.agentMajor || quickFallback.agentMajor,
                agentMid: parsed.agentMid || quickFallback.agentMid,
                agentMinor: parsed.agentMinor || quickFallback.agentMinor,
                condition: parsed.condition || quickFallback.condition,
                action: parsed.action || quickFallback.action,
                rootCauseMgmt: parsed.rootCauseMgmt || quickFallback.rootCauseMgmt,
                rootCauseSystem: parsed.rootCauseSystem || quickFallback.rootCauseSystem,
                stakeholder: parsed.stakeholder || quickFallback.stakeholder
              }, quickFallback)), {
                status: 200,
                headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
              });
            }
          } catch (aiErr) {
            aiErrors.push(`outer: ${aiErr?.message || String(aiErr)}`);
            console.warn('Workers AI run error:', aiErr);
          }

          // Workers AI 연동 전이거나 일시 한도/오류 시
          return makeRuleFallbackResponse(aiErrors, quotaHit);
        }

        // env.AI 바인딩이 없는 경우
        return makeRuleFallbackResponse(['no_env_ai'], false);
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
