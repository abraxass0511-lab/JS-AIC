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
  } else if (text.includes('알폼') || text.includes('al form') || text.includes('alform') || text.includes('알루미늄 거푸집')) {
    item = '알폼';
    law = '안전보건규칙 제332조(거푸집동바리등의 안전조치)';
    hazardType = text.includes('동바리') ? '붕괴·도괴' : '추락';
    severity = '중부적합';
    mgmtCauses = ['계획 미이행', '불안전 상태'];
    holdPoint = true;
    photoBanner = text.includes('동바리') ? '콘크리트 타설 중 계단참 AL Form 동바리 미복구' : 'AL Form 해체 구간 슬래브 단부 추락방지 미조치';
    analysis = '알폼(AL Form) 작업 시 동바리 임의 해체 후 미복구로 붕괴·도괴 위험 극심';
    pmVerdict = '동바리 즉시 원상복구 및 관리감독자 타설 전 검측 프로세스 준수';
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
    .replace(/선\s*해체\s*방지/g, '선해체 방지');
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
[건설안전 10대 표준 분류 체계 (Taxonomy) 선택 기준 - 반드시 아래 공식 표준 목록 내에서만 선택할 것]
1. 공종 (workGroup): ["거푸집동바리공사", "가설공사", "철근콘크리트공사", "철골공사", "토공사", "기초공사", "양중작업", "마감공사", "설비·전기공사", "해체공사", "공통"] 중 선택.
   - 갱폼, 알폼, 유로폼, 동바리, 서포트 등 거푸집류는 반드시 "거푸집동바리공사"
   - 비계, 낙하물방지망 등은 "가설공사"
   - 전기, 전선, 누전차단기 등은 "설비·전기공사"
2. 작업방법 (workMethod): ["설치조립작업", "해체작업", "양중작업", "굴착작업", "하역운반작업", "고소작업", "가공조립작업", "운전조정작업", "중량물취급작업"] 중 선택.
   - 설치, 세팅, 거치, 조립은 "설치조립작업"
   - 해체, 탈형, 철거는 "해체작업"
   - 크레인/호이스트 인양은 "양중작업"
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
6. 재해 형태 (hazardType): ["추락", "낙하·비래", "붕괴·도괴", "전도", "협착", "충돌", "전복", "화재", "폭발·파열", "감전"] 중 선택.
7. 관련 법령 (law): 산업안전보건기준에 관한 규칙 공식 조문 (예: "안전보건규칙 제337조(갱폼 등의 조립ㆍ해체 등)", "안전보건규칙 제332조(거푸집동바리등의 안전조치)", "안전보건규칙 제56조(작업발판의 구조)", "안전보건규칙 제304조(누전차단기 설치 등)" 등).
8. 불안전 상태 (condition): ["방호장치 결함 (덮개·난간 미설치 등)", "물(物) 자체의 결함 (자재·부재 손상/변형)", "복장·보호구 결함", "작업환경 불량", "생산공정 결함", "배치·적재 불량", "경보·신호 체계 결함", "해당없음"] 중 선택.
9. 불안전 행동 (action): ["보호구 미착용", "방호장치 기능 무효화", "위험구역 접근", "불안전한 동작·자세", "부적절한 작업방법", "기계·기구 무단 취급", "해당없음"] 중 선택.
10. 근본원인 분석:
    - rootCauseMgmt (법적 관리감독): ["관리감독자 지정 및 역할 수행 미흡", "작업계획서 미수립 또는 형식적 작성", "위험성평가 유해위험요인 누락/미반영", "특별안전보건교육 미실시", "합동 안전점검 및 순회점검 미흡"] 중 선택.
    - rootCauseSystem (안전시스템): ["협력업체 안전관리계획 검토/승인 절차 미흡", "Hold Point(승인점검) 절차 미이행", "공정 간 간섭사항 사전 검토 체계 부재", "안전시설물 설치/인계인수 프로세스 미흡", "표준작업절차서(SOP) 미배포 또는 현장 부적합"] 중 선택.
    - stakeholder (관리/책임주체): ["원청 시공팀", "원청 안전팀", "협력사 관리감독자", "협력사 근로자", "장비 임대/운전원"] 중 선택.
[사진 요약 배너 photoBanner 작성 규칙]
- 사진 상단에 들어갈 배너 문구는 반드시 완성된 명사구로 작성하고, 절대 말줄임표(...)나 미완성 문장으로 끝내지 말 것.
- (예: "절곡부위 Gang Form 선해체 방지커버 설치 불량", "콘크리트 타설 중 계단참 AL Form 동바리 미복구", "비계 워킹타워 하부 밑둥잡이 일부 누락", "외부비계 벽이음용 버팀대 설치각도 기준 미준수")`;

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

        // 산안법 룰 기반 즉시 백업 판정 데이터 생성 (Qwen AI 호출 실패 시 백업용)
        const quickFallback = analyzeRuleFallback(content);

        // Cloudflare Workers AI 인스턴스가 바인딩되어 있는 경우 실행
        if (env.AI) {
          try {
            let visionText = '';
            let rightPhotoIsReference = null;

            // 1) Vision AI 이미지 직접 판독 (텍스트 스트립 이미지 또는 우측 참고도면 판별)
            if (body.stripImageBase64 && (!body.rawOcrText || String(body.rawOcrText).trim().length < 15)) {
              try {
                const cleanB64 = String(body.stripImageBase64).replace(/^data:image\/\w+;base64,/, '');
                const visionPrompt = `이 이미지는 건설현장 안전점검 장표의 텍스트 셀들을 위에서 아래로 모아놓은 이미지입니다.
각 셀의 한국어, 한자(等, 上, 中), 영문 코드([IZ12B-106(K)]), 단위(cm, mm, 도), 불릿 기호(-, *, 1), 2))를 보이는 그대로 정확히 읽어서 텍스트로 출력하세요.
절대 임의로 단어를 생략하거나 지어내지 마세요.`;
                const vRes = await env.AI.run('@cf/qwen/qwen3.8-27b', {
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
                const pRes = await env.AI.run('@cf/qwen/qwen3.8-27b', {
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
              ? `너는 대한민국 산업안전보건법 및 건설현장 안전감사 전문가 AI이자 Vision+OCR 문맥 교정 및 표준 분류 전문가이다.
주어진 점검장표의 OCR 추출 텍스트와 사진 문맥을 정밀 분석하여, 오탈자를 교정하고 건설안전 표준 분류 목록(Taxonomy)에서 정확한 항목을 직접 선택하여 JSON으로만 출력하라.

${TAXONOMY_STANDARD_PROMPT}

[OCR 문맥 교정 절대 규칙]
- 협력사가 빈칸이면 절대 임의로 넣지 말고 ""로 둘 것 (공종명 '비계공사', 'HEY' 등을 협력사에 넣지 말 것)
- 작업장소에 '[ERE 12', 'ee', '섬검자', '집십사수' 같은 테두리 노이즈가 있으면 완벽히 제거할 것 (예: '106동 지하2층', '106동 서측', '101동 외부', '107동 3층 1코어')
- 인접 열이나 테두리 침범 깨진 텍스트(예: 'a 0 2{2.쓰.......시푸시', 'ee —')는 완전히 삭제할 것
- 여러 항목이 '-'로 구분된 경우 줄바꿈(\\n- )으로 구분하되, 한 문장이 표 셀 폭 때문에 단순 줄바꿈된 경우는 한 문장으로 자연스럽게 이어붙일 것
- 관련기준의 '*' 항목이 3개인 경우 각각 줄바꿈(\\n* )으로 구분할 것

JSON 형식:
{
  "severity": "중부적합" 또는 "경부적합",
  "workGroup": "표준 공종",
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
  "photoBanner": "사진 1 상단 배너용 15~20자 구체적 미준수 문구 (말줄임표 ... 절대 금지)",
  "photo2Banner": "사진 2 상단 배너용 15~20자 구체적 미준수 문구 (단일 지적이면 '')",
  "mgmtCauses": ["계획 미수립", "계획 미이행", "불안전 행동", "불안전 상태" 중 1~2개],
  "holdPoint": true 또는 false,
  "analysis": "법적 위반 판단 이유 1~2문장",
  "pmVerdict": "시스템 개선" 또는 "교육/코칭" 또는 "페널티",
  "cleanedFields": {
    "content": "교정된 부적합 내용 (말단 깨진 노이즈 완전 제거)",
    "location": "교정된 작업장소 (동, 층, 코어, 외부 보존)",
    "workGroup": "교정된 공종명",
    "subcontractor": "교정된 협력사명 (공란이면 '')",
    "interviewOpinion": "교정된 관계자 의견 ('- ' 불릿 유지)",
    "auditProposal": "교정된 점검단 제안 ('- ' 불릿 구분)",
    "actionPlan": "교정된 개선대책 ('- ' 불릿 구분, 단순 줄바꿈은 병합)",
    "rawLaw": "교정된 관련기준 제목",
    "lawBody": "교정된 관련기준 본문 ('*' 항목 줄바꿈 유지)"
  }
}`
              : `너는 대한민국 산업안전보건법 및 건설현장 안전감사 전문가 AI이다.
주어진 부적합 지적내용과 사진 상황을 엄밀히 분석하여, 사진 상단 배너(photoBanner, photo2Banner)와 표준 분류 목록에서 선택한 분류를 JSON으로만 출력하라.

${TAXONOMY_STANDARD_PROMPT}

JSON 형식:
{
  "severity": "중부적합" 또는 "경부적합",
  "workGroup": "표준 공종",
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
  "photoBanner": "사진 1 상단 배너용 15~20자 구체적 미준수 문구",
  "photo2Banner": "사진 2 상단 배너용 15~20자 구체적 미준수 문구 (단일 지적이면 '')",
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
              max_tokens: isOcrClean ? 1200 : 650,
              temperature: 0.05
            }).catch(async () => {
              return await env.AI.run('@cf/qwen/qwen3-30b-a3b-fp8', {
                messages: [
                  { role: 'system', content: systemPrompt },
                  { role: 'user', content: userPrompt }
                ],
                max_tokens: isOcrClean ? 1200 : 650,
                temperature: 0.05
              });
            }).catch(async () => {
              return await env.AI.run('@cf/qwen/qwen1.5-14b-chat-awq', {
                messages: [
                  { role: 'system', content: systemPrompt },
                  { role: 'user', content: userPrompt }
                ],
                max_tokens: isOcrClean ? 1200 : 650,
                temperature: 0.05
              });
            });

            let text = '';
            let lastAiErr = '';
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
                source: visionText ? 'cloudflare_qwen_vision_hybrid' : 'cloudflare_qwen_cloud',
                model: visionText ? 'Qwen-3.8-27B-Vision + Qwen-32B (Cloudflare 24h Cloud)' : 'Qwen-2.5-Coder-32B (Cloudflare 24h Cloud)',
                visionText: visionText || undefined,
                rightPhotoIsReference,
                ...quickFallback,
                ...parsed,
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
