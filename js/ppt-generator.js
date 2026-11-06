/**
 * SafePatrol 현장 패트롤 점검장표 PPT 자동 생성기 & 시각적 프리뷰어
 * - 폰트: 100% 맑은 고딕 (Malgun Gothic) 표준 적용
 * - 16:9 와이드 표준 슬라이드 레이아웃 (부적합 개요, 현장 사진 1/2, 발생원인 인터뷰, 개선대책 및 PM 판정결과)
 * - 브라우저 기반 PptxGenJS 라이브러리를 통해 외부 서버 없이 클라이언트에서 즉시 .pptx 파일 직접 생성
 */
(function (root, factory) {
  const exported = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exported;
    Object.assign(module.exports, exported);
  }
  if (typeof exports !== 'undefined') {
    Object.assign(exports, exported);
  }
  if (root) root.SafePPT = exported;
})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : typeof self !== 'undefined' ? self : this), function () {

  const FONT_MALGUN = '맑은 고딕';

  // 색상 팔레트 (중부적합/경부적합 템플릿 원본 XML 100% 동일 일치 색상)
  const C_FRAME_BORDER = '8FAADC';    // 슬라이드 외곽 프레임 3.0pt 연청색 테두리 (#8FAADC, Office accent1 60% mod 40% off)
  const C_BORDER = '000000';          // 표 및 텍스트박스 실선 100% 검은색 (#000000, 0.5pt)
  const C_HEADER_BG = 'BDD7EE';       // 시설물/법규 및 위험성평가 헤더 연청색 (#BDD7EE)
  const C_STD_CONTENT_BG = 'DAE3F3';  // 관련기준 내용 연청색 음영 (#DAE3F3, Office accent1 20% mod 80% off)
  const C_YELLOW_BG = 'FFD966';       // 부적합개요/사항/사례/원인/대책 헤더 골드옐로우 (#FFD966)
  const C_ACC_YELLOW_FILL = 'FFFFFF'; // 사고유형 칸 음영 없음/순수 흰색 (#FFFFFF)
  const C_ACC_BORDER = 'FFC000';      // 사고유형 칸 3pt 황색 테두리 (#FFC000)
  const C_TITLE_BLUE = '002060';      // 보조 강조 네이비 (#002060)
  const C_RED = 'C00000';             // 중부적합 및 위험요인 선명한 적색 (#C00000)
  const C_PHOTO_BANNER_RAW = 'C00000';// 사진 상단 적색 배너 원본 색상 (#C00000, transparency 40% -> #D96666)
  const C_PHOTO_BANNER_BG = 'D96666'; // 사진 상단 적색 배너 흰색 배경 블렌딩 색상 (#D96666)
  const C_GREEN_BANNER_RAW = 'A9D18E';// Hold Point 하단 초록색 박스 원본 색상 (#A9D18E, transparency 40% -> #CBE3BB)
  const C_GREEN_BANNER_BG = 'CBE3BB'; // Hold Point 하단 초록색 박스 흰색 배경 블렌딩 색상 (#CBE3BB)
  const C_PEACH_BANNER_RAW = 'F8CBAD';// 경부적합 우측 [위험성평가표] 배너 원본 색상 (#F8CBAD, transparency 40% -> #FBE0CE)
  const C_PEACH_BANNER_BG = 'FBE0CE'; // 경부적합 우측 [위험성평가표] 배너 흰색 배경 블렌딩 색상 (#FBE0CE)
  const C_ORANGE = 'ED7D31';          // 사고유형 및 이행 포인트 오렌지 (#ED7D31)
  const C_GRAY_TEXT = '595959';       // 보조 텍스트
  const C_DARK_TEXT = '000000';       // 본문 진한 검정 (#000000)
  const C_SUBHEADER_TEXT = '181717';  // [의견], [점검단 제안], [PM 판정결과] 다크 차콜 (#181717)
  const C_ACCENT_BLUE = '0000FF';     // 신규 템플릿 표준 강조 순수 블루 (#0000FF)

  // 22대 재해발생 형태 표준 목록 (사용자 지정 이미지 2 일치)
  const STANDARD_22_ACCIDENT_TYPES = [
    '추락', '낙하', '비래', '붕괴', '도괴', '전복', '전도',
    '협착', '충돌', '추돌', '충격', '접촉', '익사', '질식',
    '중독', '흡인', '화재', '폭발', '화상', '감전', '감염', '질병'
  ];

  function mapTo22AccidentType(raw) {
    if (!raw) return '추락';
    const s = String(raw).trim();
    for (const t of STANDARD_22_ACCIDENT_TYPES) {
      if (s === t) return t;
    }
    for (const t of STANDARD_22_ACCIDENT_TYPES) {
      if (s.includes(t)) return t;
    }
    if (s.includes('떨어짐')) return '추락';
    if (s.includes('넘어짐')) return '전도';
    if (s.includes('끼임')) return '협착';
    if (s.includes('맞음')) return s.includes('비래') ? '비래' : '낙하';
    if (s.includes('부딪힘')) return '충돌';
    if (s.includes('깔림')) return '붕괴';
    if (s.includes('무너짐')) return '붕괴';
    if (s.includes('뒤집힘')) return '전복';
    return '추락';
  }

  /**
   * 관련 기준을 "안전보건규칙 제//조"로 간단하게 변환 (사용자 지시 3)
   */
  function simplifyLawTitle(law, text = '') {
    const s = String(law || '').trim();
    const articles = [...s.matchAll(/제\s*(\d+)\s*조/g)].map(m => `제${m[1]}조`);
    if (articles.length > 0) {
      const unique = [...new Set(articles)];
      return `안전보건규칙 ${unique.join(', ')}`;
    }
    if (s.startsWith('안전보건규칙')) return s;

    // 키워드 기반 기본 매핑
    const comb = `${s} ${text}`;
    if (comb.includes('양중') || comb.includes('줄걸이') || comb.includes('크레인') || comb.includes('호이스트') || comb.includes('수평양중')) {
      return '안전보건규칙 제38조, 제171조';
    }
    if (comb.includes('말비계') || comb.includes('우마')) {
      return '안전보건규칙 제67조, 제13조';
    }
    if (comb.includes('비계') || comb.includes('난간') || comb.includes('작업발판') || comb.includes('안전난간') || comb.includes('단부')) {
      return '안전보건규칙 제56조, 제13조';
    }
    if (comb.includes('개구부') || comb.includes('덮개')) {
      return '안전보건규칙 제59조';
    }
    if (comb.includes('전기') || comb.includes('누전') || comb.includes('차단기') || comb.includes('투광등')) {
      return '안전보건규칙 제304조';
    }
    if (comb.includes('사다리')) {
      return '안전보건규칙 제24조';
    }
    return '안전보건규칙 제38조';
  }

  /**
   * 통계 분류 카테고리 레이블 판별기 (이러한 레이블은 사진 상단 배너에 노출 금지)
   */
  function isGenericTaxonomyLabel(str) {
    if (!str) return true;
    const s = String(str).trim();
    const BAD_LABELS = [
      '작업방법 불량', '동작/자세 불량', '작업방법 불량(동작/자세 불량)',
      '보호구 착용 불량', '기계기구 취급 불량', '불안전한 행동', '불안전한 상태',
      '불안전 행동', '불안전 상태', '관리적', '물적', '인적', '계획 미수립', '계획 미이행',
      '해당없음', '해당 없음', '기타', '표준 안전작업절차 및 안전수칙 미준수', '안전수칙 미준수',
      '표준 안전작업절차', '현장 안전수칙'
    ];
    return BAD_LABELS.some(bad => s.includes(bad)) || s.length < 4;
  }

  /**
   * 사진 1 상단 직접 행동 적색 음영 배너 문구 자동 도출 (사용자 지시: 이미지 4, 5번 기반 구체적 미준수 행동 직시)
   */
  function extractDirectAction(r) {
    if (r.photoBanner && String(r.photoBanner).trim()) {
      const banner = String(r.photoBanner).trim();
      if (!isGenericTaxonomyLabel(banner)) return banner;
    }
    const text = `${r.content || ''} ${r.action || ''} ${r.condition || ''} ${r.item || ''} ${r.workMethod || ''} ${r.workName || ''}`;
    
    // 1. 양중작업 시 손으로 화물 직접 잡음 (이미지 4번 실물 점검장표 100% 일치)
    if (text.includes('손으로') || text.includes('직접 잡') || (text.includes('유도로프') && (text.includes('손') || text.includes('당기')))) {
      return '양중작업 시 화물을 직접 손으로 잡음';
    }
    // 2. 양중작업 시 수평양중 미실시 (이미지 5번 실물 점검장표 100% 일치)
    if (text.includes('수평') || text.includes('로프간격') || text.includes('수평양중')) {
      return '양중작업 시 화물의 수평양중 미 실시';
    }
    // 3. 양중작업 시 유도로프 미사용 (이미지 4번 2번 사진 배너)
    if (text.includes('유도로프')) {
      return '양중작업 시 유도로프 미사용';
    }
    // 4. 통로 바닥 가설전선 거치 및 정리 미실시 (이미지 1번 지적사항 정밀 일치)
    if ((text.includes('전선') || text.includes('케이블') || text.includes('리드선')) && 
        (text.includes('통로') || text.includes('바닥') || text.includes('정리') || text.includes('걸려') || text.includes('넘어') || text.includes('방치') || text.includes('통행'))) {
      return '통로 바닥 가설전선 거치 및 정리 미실시';
    }
    // 5. 보 상부작업 승인 미실시 및 불안전 자세 (이미지 2번 지적사항 정밀 일치)
    if (text.includes('보 상부') || text.includes('다이빙') || (text.includes('보') && text.includes('승인') && (text.includes('자세') || text.includes('작업')))) {
      return '보 상부 승인 미실시 및 불안전 자세 작업';
    }
    // 6. 구획된 바닥 안전통로 내 거푸집/자재 방치 (이미지 3번 지적사항 정밀 일치)
    if ((text.includes('통로') || text.includes('통행')) && (text.includes('자재') || text.includes('거푸집') || text.includes('방치') || text.includes('적치'))) {
      return '구획된 바닥 안전통로 내 거푸집 자재 방치';
    }
    // 7. 말비계 / 우마 (단부 추락, 모서리 등)
    if (text.includes('말비계') || text.includes('우마')) {
      if (text.includes('모서리') || text.includes('단부') || text.includes('추락')) {
        return '말비계 모서리 구간 단부 추락방지 미조치';
      }
      return '말비계 안전기준 및 전도방지 미조치';
    }
    // 8. 바닥 개구부 덮개 미설치
    if (text.includes('개구부') || text.includes('덮개') || text.includes('피트')) {
      return '바닥 개구부 덮개 미설치 및 고정 미흡';
    }
    // 9. 안전난간대 미설치
    if (text.includes('안전난간') || text.includes('난간') || (text.includes('단부') && text.includes('슬래브'))) {
      return '작업발판 단부 안전난간 미설치';
    }
    // 10. 안전대 미체결
    if (text.includes('안전대') && (text.includes('미체결') || text.includes('미착용') || text.includes('체결') || text.includes('구명줄'))) {
      return '고소작업 시 안전대 미체결';
    }
    // 11. 안전모 턱끈 미체결
    if (text.includes('안전모') || text.includes('턱끈')) {
      return '작업구간 내 안전모 턱끈 미체결';
    }
    // 12. 작업발판 전면 미설치 및 틈새
    if (text.includes('작업발판') || text.includes('발판') || text.includes('틈새')) {
      return '작업발판 전면 미설치 및 틈새 방치';
    }
    // 13. 사다리 작업
    if (text.includes('사다리')) {
      return '이동식 사다리 최상부 발판 작업';
    }
    // 14. 임시 분전함 외함 접지 및 누전차단기
    if (text.includes('누전') || text.includes('차단기') || text.includes('접지') || text.includes('분전함')) {
      return '임시 분전함 외함 접지 및 누전차단기 미설치';
    }
    // 15. 동바리 / 서포트
    if (text.includes('동바리') || text.includes('서포트') || text.includes('수평연결재')) {
      return '동바리 수평연결재 2방향 미체결';
    }
    // 16. 신호수 미배치
    if (text.includes('신호수')) {
      return '양중 및 중장비 작업 전담 신호수 미배치';
    }
    // 17. 작업계획서 미수립
    if (text.includes('작업계획서') || text.includes('계획 미수립')) {
      return '위험기계 작업 전 작업계획서 미수립';
    }

    // 18. 사용자가 입력한 구체적 불안전 행동이 일반 카테고리가 아니면 사용
    if (r.action && !isGenericTaxonomyLabel(r.action) && r.action.length <= 25) {
      return r.action.trim();
    }

    // 19. 지적사항(r.content) 직접 파싱 및 정제
    if (r.content && typeof r.content === 'string') {
      const raw = r.content.trim();
      if (raw.includes('1.') && raw.includes('2.')) {
        const p1 = raw.split('1.')[1].split('2.')[0].trim();
        if (p1.length >= 6 && p1.length <= 24) return p1;
      }
      if (raw.includes('↔')) {
        const p1 = raw.split('↔')[0].trim();
        if (p1.length >= 6 && p1.length <= 24) return p1;
      }
      if (raw.length <= 25 && !isGenericTaxonomyLabel(raw)) {
        return raw;
      }
    }

    // 최종 대체: 모호한 문구 절대 배제하고 기인물/공종 기반 구체적 표현 생성
    const targetItem = (r.item && r.item !== '기타') ? r.item : (r.workMethod || r.workGroup || '현장 작업');
    return `${targetItem} 안전기준 미준수 및 조치 미흡`;
  }

  /**
   * 사진 2 상단 직접 행동 배너 문구 도출 (이미지 4번처럼 2개 사진에 독립된 위반사항이 있는 경우 지원)
   */
  function extractDirectAction2(r, firstBanner = '') {
    if (r.photo2Banner && String(r.photo2Banner).trim()) {
      const b2 = String(r.photo2Banner).trim();
      if (!isGenericTaxonomyLabel(b2) && b2 !== firstBanner) return b2;
    }
    const text = `${r.content || ''} ${r.action || ''} ${r.condition || ''} ${r.item || ''} ${r.workMethod || ''} ${r.workName || ''}`;

    // 이미지 4번 정밀 일치: 1번이 손으로 잡음이면 2번은 유도로프 미사용
    if (text.includes('손으로') && (text.includes('유도로프') || firstBanner.includes('손으로'))) {
      return '양중작업 시 유도로프 미사용';
    }
    // 이미지 2번 정밀 일치: 1번이 보 상부 승인이면 2번은 다이빙 자세
    if (text.includes('보 상부') && (text.includes('다이빙') || text.includes('자세'))) {
      return '보 상부작업 시 다이빙 자세 취함';
    }
    // 지적사항에 2번 항목이 명시된 경우
    if (r.content && typeof r.content === 'string') {
      const raw = r.content.trim();
      if (raw.includes('2.')) {
        const p2 = raw.split('2.')[1].split('3.')[0].trim();
        if (p2.length >= 6 && p2.length <= 25) return p2;
        if (p2.length > 25) return p2.slice(0, 22).trim();
      }
      if (raw.includes('↔')) {
        const p2 = raw.split('↔')[1].trim();
        if (p2.length >= 6 && p2.length <= 25) return p2;
        if (p2.length > 25) return p2.slice(0, 22).trim();
      }
    }
    if (r.photo2Title && !isGenericTaxonomyLabel(r.photo2Title) && r.photo2Title !== firstBanner) {
      return r.photo2Title;
    }
    return '';
  }

  /**
   * 단일 행 텍스트의 넘침/줄바꿈 방지 동적 글자크기 계산기
   * - 사용자 지시: "칸은 그대로 두고 길어져서 줄이 바뀌거나 잘리면 글자크기를 작게하든지 조정해"
   */
  function calcSingleLineFontSize(text, widthInch, baseSize = 14, minSize = 9) {
    if (!text) return baseSize;
    let units = 0;
    for (let i = 0; i < text.length; i++) {
      units += text.charCodeAt(i) > 127 ? 1.2 : 0.75;
    }
    const avail = widthInch - 0.12;
    let sz = baseSize;
    while (sz > minSize) {
      const est = units * (sz * 0.011);
      if (est <= avail) break;
      sz -= 0.5;
    }
    return sz;
  }

  /**
   * 레코드로부터 점검장표용 세부 데이터 정규화 및 추론 (템플릿 1, 2 정밀 일치)
   */
  function normalizeJangpyoData(r, rulesFromTaxonomy = [], options = {}) {
    const isMajor = r.severity === '중부적합';
    const severity = isMajor ? '중부적합' : '경부적합';
    const type = r.type || '충돌/협착';

    // 사고유형 파싱 및 포맷팅 (사용자 지시 2: 22대 재해발생 형태 표준 목록 매핑)
    const rawType = String(type).trim();
    const typeMain = mapTo22AccidentType(rawType);
    const typeSub = '';

    // 4대 요인 판정: 사용자가 지정한 관리적/직접 원인 목록을 최우선 존중
    const mgmt = Array.isArray(r.mgmtCauses) ? r.mgmtCauses : [];
    const causes = Array.isArray(r.causes) ? r.causes : [];

    let isUnplanned = false;
    let isUnexecuted = false;
    let isAction = false;
    let isCondition = false;

    if (mgmt.length > 0) {
      isUnplanned = mgmt.includes('계획 미수립');
      isUnexecuted = mgmt.includes('계획 미이행');
      isAction = mgmt.includes('불안전 행동');
      isCondition = mgmt.includes('불안전 상태');
    } else {
      isUnplanned = causes.includes('계획 미수립');
      isUnexecuted = causes.includes('계획 미이행') || causes.includes('관리적');
      isAction = causes.includes('불안전 행동') || causes.includes('인적') || (r.action && r.action !== '-' && r.action !== '해당없음' && r.action !== '해당 없음');
      isCondition = causes.includes('불안전 상태') || causes.includes('물적') || (r.condition && r.condition !== '-' && r.condition !== '해당없음' && r.condition !== '해당 없음');
      if (!isUnplanned && !isUnexecuted && !isAction && !isCondition) {
        isUnexecuted = true;
      }
    }

    const isHoldPoint = r.holdPoint || (typeof r.content === 'string' && r.content.includes('Hold'));

    // 관련 법령 및 수칙 내용 (사용자 지시 3: "관련 기준을 '안전보건규칙 제//조'로 간단하게 변경")
    let rawLawTitle = r.law || (r.basis && r.basis.law) || '';
    let lawBody = '';

    const rawContent = (r.content || '').replace(/\r?\n+/g, '  ').trim();
    const text = `${rawContent} ${r.item || ''} ${r.agent || ''} ${r.workMethod || ''} ${r.workName || ''}`;
    if (text.includes('양중') || text.includes('크레인') || text.includes('줄걸이') || text.includes('호이스트') || text.includes('유도로프') || text.includes('수평양중')) {
      rawLawTitle = rawLawTitle || '안전보건규칙 제38조, 제171조';
      lawBody = '화물은 유도로프를 통해 유도하고 손으로 밀거나 당기는 행위를 금지하며 화물의 양중높이에 따라 적정한 길이를 가진 유도로프를 사용해야 한다.';
    } else if (text.includes('말비계') || text.includes('우마')) {
      rawLawTitle = rawLawTitle || '안전보건규칙 제67조, 제13조';
      lawBody = '말비계는 평탄하고 견고한 바닥에 전도방지조치를 하고, 단부 및 모서리 구간에는 안전난간대 등 추락방지조치를 설치해야 한다.';
    } else if (text.includes('비계') || text.includes('난간') || text.includes('작업발판') || text.includes('안전난간') || text.includes('단부')) {
      rawLawTitle = rawLawTitle || '안전보건규칙 제56조, 제13조';
      lawBody = '작업발판은 틈새가 없도록 전면 설치하고, 발판 단부에는 상부난간대 및 중간난간대를 견고히 설치하여 근로자 추락을 방지해야 한다.';
    } else if (text.includes('개구부') || text.includes('덮개')) {
      rawLawTitle = rawLawTitle || '안전보건규칙 제59조';
      lawBody = '바닥 개구부에는 충분한 강도를 가진 덮개를 뒤집히거나 벗겨지지 않도록 고정 설치하고 "추락주의" 위험표지를 부착해야 한다.';
    } else if (text.includes('전기') || text.includes('조명') || text.includes('투광등') || text.includes('차단기') || text.includes('전선')) {
      rawLawTitle = rawLawTitle || '안전보건규칙 제304조';
      lawBody = '이동형 전열기구 및 투광등 연결 전선에는 감전방지용 누전차단기를 접속하고 전선 피복 손상 여부를 사전 점검해야 한다.';
    } else if (text.includes('사다리')) {
      rawLawTitle = rawLawTitle || '안전보건규칙 제24조';
      lawBody = '이동식 사다리는 평탄한 바닥에 전도방지조치를 하고 최상부 발판 작업 금지 및 안전모·안전대를 필히 착용해야 한다.';
    } else {
      rawLawTitle = rawLawTitle || '안전보건규칙 제38조';
      lawBody = '작업 시작 전 위험요인을 사전 조사하고 작업계획서를 작성하여 그 계획에 따라 안전하게 작업을 지휘·감독해야 한다.';
    }
    const lawTitle = simplifyLawTitle(rawLawTitle, text);

    // 사용자 지시: "특별한 언급이 없으면 원본사진처럼 사진만 넣어 굳이 줄걸이 책임자의 책임을 넣을 필요 없어"
    const hasGuideline = Boolean(r.hasGuideline || (options && options.showGuideline));
    let guidelineTitle = r.guidelineTitle || '';
    let guidelineBody = r.guidelineBody || '';
    if (hasGuideline && !guidelineTitle) {
      if (text.includes('양중') || text.includes('크레인') || text.includes('줄걸이') || text.includes('유도로프')) {
        guidelineTitle = '줄걸이 작업자의 책임';
        guidelineBody = '1) 양중 시작 전 양중물로부터 5m 이상 안전거리를 확보해야 하고 양중물 하부에서 대기를 금지하며\n   양중물이 지면으로부터 1.5m 이내에 위치하였을 경우, 접근해야 한다.';
      } else if (text.includes('비계') || text.includes('난간') || text.includes('발판') || text.includes('추락')) {
        guidelineTitle = '고소작업자의 안전 책임';
        guidelineBody = '1) 고소작업 시 안전대 걸이시설 체결 및 안전모 턱끈을 철저히 결속해야 하며,\n   작업발판 임의 해체 또는 안전난간 훼손을 금지하고 이상 발견 시 즉시 작업을 중지해야 한다.';
      } else {
        guidelineTitle = '표준 안전작업 기준 준수 책임';
        guidelineBody = '1) 작업 시작 전 TBM 위험요인을 숙지하고 보호구를 100% 착용해야 하며,\n   관리감독자의 지휘 하에 승인된 작업계획서 절차에 따라 안전하게 작업해야 한다.';
      }
    }

    // 부적합 내용 (원본 양식의 붉은색 강조 단어 분리)
    let mainContent = rawContent;
    let mainContentParts = { prefix: rawContent, highlight: '', suffix: '' };
    if (mainContent.includes('↔')) {
      const parts = mainContent.split('↔');
      mainContentParts.prefix = (parts[0] || '').trim() + ' ↔ ';
      mainContentParts.highlight = (parts[1] || '').trim();
      mainContentParts.suffix = '';
    } else if (mainContent.includes('유도로프 미사용')) {
      const idx = mainContent.indexOf('유도로프 미사용');
      mainContentParts.prefix = mainContent.slice(0, idx);
      mainContentParts.highlight = '유도로프 미사용';
      mainContentParts.suffix = mainContent.slice(idx + '유도로프 미사용'.length);
    }

    // 사진 상단 타이틀 (실물 사진과 100% 동일한 부적합 타이틀)
    let photo1Title = r.photo1Title || '';
    let photo2Title = r.photo2Title || '';
    if (!photo1Title) {
      if (text.includes('수평') || text.includes('로프간격') || text.includes('수평양중')) {
        photo1Title = '양중작업 시 화물의 수평양중 미 실시';
      } else if (text.includes('손으로') || (text.includes('유도로프') && text.includes('미사용'))) {
        photo1Title = '양중작업 시 화물을 직접 손으로 잡음';
      } else {
        photo1Title = mainContentParts.prefix ? mainContentParts.prefix.replace('↔', '').trim() : (mainContent || '현장 부적합 작업 전경');
      }
    }
    if (!photo2Title) {
      if (text.includes('수평') || text.includes('로프간격')) {
        photo2Title = '지상에서 보 거푸집 로프체결 간격 미준수';
      } else if (text.includes('유도로프') || text.includes('손으로')) {
        photo2Title = '양중작업 시 유도로프 미사용';
      } else {
        photo2Title = r.action || '위험요인 세부 현황';
      }
    }
    const photoBannerTitle = mainContent || '부적합 현장 확인';

    // 발생원인 의견 (인터뷰 결과)
    let interviewOpinion = r.interviewOpinion || r.workerOpinion || '';
    if (!interviewOpinion) {
      if (text.includes('수평') || text.includes('로프간격')) {
        interviewOpinion = '거푸집 제작장에서 양중로프를 걸 때 같은 간격으로 맞추지 못했다. 양중로프를 걸 수 있는 위치가 어느 정도 적당하다고 생각되는 곳에 로프를 걸었다.';
      } else if (text.includes('양중') || text.includes('유도로프')) {
        interviewOpinion = '양중작업 시 유도로프의 사용기준은 1줄을 설치하는 대로 유도로프를 설치하였으나, 화물을 다루기 어려워 손으로 직접 잡고 당기었다.';
      } else {
        interviewOpinion = r.action 
          ? `현장 시공 여건 상 ${r.action} 사유로 기준이 미준수되었으며, 관리감독자의 사전 작업지휘가 미흡한 상태에서 작업이 진행됨.`
          : '현장 작업진행 과정에서 안전작업수칙에 대한 관리감독 및 작업자 간 소통이 미흡하여 규정 절차가 누락됨.';
      }
    }

    // 점검단 제안
    let proposalType = '시스템 개선';
    let proposalSub = '(이행강화안 수립)';
    const rawProp = (r.inspectorOpinionType || '').trim();
    if (rawProp.includes('교육')) {
      proposalType = '교육/코칭';
      proposalSub = '(협력사 교육)';
    } else if (rawProp.includes('페널티')) {
      proposalType = '페널티';
      proposalSub = '(패널티 부과)';
    } else {
      proposalType = '시스템 개선';
      proposalSub = '(이행강화안 수립)';
    }

    let proposalContent = r.auditProposal || r.inspectorOpinion || '';
    if (!proposalContent || (text.includes('수평') || text.includes('로프간격'))) {
      if (text.includes('수평') || text.includes('로프간격')) {
        proposalContent = '양중작업 시 양중화물의 수평양중은 낙하사고를 방지하는 중요한 안전작업방법이다. 지상에서 양중로프를 체결할 때 화물의 여장간격이 동일하도록 작업팀 교육 및 이행강화 노력이 필요함. 또한 원인이 되는 자재 적재방법 고려 필요.';
      } else if (text.includes('양중') || text.includes('유도로프')) {
        proposalContent = '양중작업 시 유도로프를 설치, 사용하여 화물을 직접 잡지 않도록 작업팀 교육 및 관리자의 강한 요구가 필요하다. 또한 유도로프는 화물의 양쪽으로 2줄을 설치하는 것이 필요함.';
      } else {
        proposalContent = '설치조립작업 시 발생 가능한 사고를 방지하기 위해 작업팀 대상 안전작업절차 교육을 의무화하고 현장 관리감독자의 일일 이행 모니터링을 대폭 강화할 필요가 있음.';
      }
    }

    // 개선대책 본문 & PM 판정결과
    let countermeasureContent = '';
    let pmVerdictType = (r.pmVerdictType || '').trim();
    let pmVerdictSub = '';

    const SHORT_VERDICTS = ['시스템 개선', '시스템개선', '교육/코칭', '교육', '코칭', '페널티', '시정명령', '현장시정', '즉시시정', '조치완료'];

    const rawPm = (r.pmVerdict || '').trim();
    const rawFix = (r.fix && r.fix.content ? r.fix.content : '').trim();
    const rawPlan = (r.actionPlan || r.countermeasure || '').trim();

    if (rawPlan) {
      countermeasureContent = rawPlan;
    } else if (rawFix) {
      countermeasureContent = rawFix;
    } else if (Array.isArray(r.countermeasures) && r.countermeasures.length) {
      countermeasureContent = r.countermeasures.join('\n');
    } else if (rawPm && !SHORT_VERDICTS.includes(rawPm) && rawPm.length > 12) {
      countermeasureContent = rawPm;
    }

    if (!countermeasureContent) {
      if (text.includes('수평') || text.includes('로프간격')) {
        countermeasureContent = '- 신호수 대상으로 부적합사항 공유 후 양중 작업 기준 준수토록 교육실시\n- 동일사항 적발 시 신호수 자격 박탈';
      } else if (text.includes('양중') || text.includes('유도로프')) {
        countermeasureContent = '자재 양중 작업 시 화물을 직접 잡지 않도록 작업팀 교육 실시, 유도로프 추가 설치 등에 대한 기준 검토/수립';
      } else {
        countermeasureContent = '부적합 사항에 대해 작업팀 교육 및 표준 안전작업절차를 보완하고 일일 점검을 강화하여 재발 방지 조치함.';
      }
    } else if (countermeasureContent.includes('신호수 대상으로 부적합사항 공유') && !countermeasureContent.includes('신호수 자격 박탈')) {
      countermeasureContent = '- 신호수 대상으로 부적합사항 공유 후 양중 작업 기준 준수토록 교육실시\n- 동일사항 적발 시 신호수 자격 박탈';
    }

    // PM 판정결과 판별:
    // 사용자 지시: "교육/코칭이고" -> 기본 표준 및 권장값은 '교육/코칭 (협력사 교육)'
    if (!pmVerdictType) {
      if (rawPm && SHORT_VERDICTS.includes(rawPm)) {
        pmVerdictType = rawPm;
      } else if (rawPm.includes('교육') || rawPm.includes('코칭') || countermeasureContent.includes('교육') || countermeasureContent.includes('신호수')) {
        pmVerdictType = '교육/코칭';
      } else if (rawPm.includes('시스템')) {
        pmVerdictType = '시스템 개선';
      } else if (rawPm.includes('페널티')) {
        pmVerdictType = '페널티';
      } else {
        // 원본 점검장표 표준: 교육/코칭
        pmVerdictType = '교육/코칭';
      }
    }

    // 사용자 지시: 개선대책, PM 판정결과는 추후 기입되는 공간이므로 기본 점검장표에서는 공란으로 유지
    const isPostActionFilled = Boolean(options && options.includePostActions);
    if (!isPostActionFilled) {
      countermeasureContent = '';
      pmVerdictType = '';
      pmVerdictSub = '';
    }

    let inspectRound = r.inspectRound || (r.round ? `${r.round}차` : "'26년 下 3차");
    // 사용자 지침: 전반적인 내용과 점검자 등은 모두 엑셀 로그 기반으로 작성
    let inspectorName = r.inspector || r.inspectUser || r.user || '관리자';

    // 사진 상단 직접 행동 문구 (사용자 지시: 이미지 4, 5번 기반 구체적 미준수 행동 직시)
    const photoBanner = extractDirectAction(r);
    const photo2Banner = extractDirectAction2(r, photoBanner);
    const holdPointCode = r.holdPointCode || '21-3';
    const greenBanner = r.greenBanner || '';

    return {
      severity,
      isMajor,
      type: rawType,
      typeMain,
      typeSub,
      isUnplanned,
      isUnexecuted,
      isAction,
      isCondition,
      isHoldPoint,
      holdPointCode,
      greenBanner,
      lawTitle,
      lawBody,
      hasGuideline,
      guidelineTitle,
      guidelineBody,
      mainContent,
      mainContentParts,
      photo1Title,
      photo2Title,
      photoBannerTitle,
      photoBanner,
      photo2Banner,
      interviewOpinion,
      proposalType,
      proposalSub,
      proposalContent,
      countermeasureContent,
      pmVerdictType,
      pmVerdictSub,
      subcontractor: r.subcontractor || '원영건업(주)',
      workGroup: r.workGroup || r.workMethod || r.workName || '거푸집동바리공사',
      location: r.location || '108동',
      inspector: inspectorName,
      inspectRound,
      content: rawContent,
      action: r.action || '',
      site: r.site || '현장',
      inspectedDate: r.inspectedDate || '2026-10-24'
    };
  }

  /**
   * [중부적합] PptxGenJS 슬라이드 레이아웃 생성 (템플릿/부적합장표(중부적합).pptx 100% 정밀 일치)
   */
  async function addMajorInspectionSheetSlide(pptx, record, data, options = {}) {
    const { loadPhotoBase64 } = options;
    const slide = pptx.addSlide();
    slide.background = { color: 'FFFFFF' };

    // ── 0. 슬라이드 외곽 프레임 (SHAPE #1: x=0, y=0, w=13.333, h=7.500, 3.0pt #8FAADC) ──
    slide.addShape(pptx.ShapeType.rect, {
      x: 0.015, y: 0.015, w: 13.303, h: 7.470,
      line: { color: C_FRAME_BORDER, width: 3.0 }
    });

    // ── 1. 최상단 행 (y = 0.1216, h = 1.0535, bottom = 1.1751) ──
    // 1) 시설물/법규 (Cell(1,1): x = 0.1070, w = 1.9763, h = 1.0535, 24pt Bold #000000, fill #BDD7EE)
    slide.addText('시설물/법규', {
      x: 0.1070, y: 0.1216, w: 1.9763, h: 1.0535,
      fill: { color: C_HEADER_BG }, line: { color: C_BORDER, width: 0.5 },
      fontFace: FONT_MALGUN, fontSize: 24, bold: true, color: '000000',
      align: 'center', valign: 'middle', margin: 0, wrap: false
    });

    // 2) 사고유형 & 부적합등급 (Cell(1,4): x = 2.1666, w = 1.5186, h = 1.0535, 20pt Bold #000000, 3.0pt #FFC000)
    const accRuns = data.typeSub
      ? [
          { text: `${data.typeMain}\n`, options: { fontSize: 20, bold: true, color: '000000', fontFace: FONT_MALGUN } },
          { text: `${data.typeSub}\n`, options: { fontSize: 11, bold: true, color: '333333', fontFace: FONT_MALGUN } },
          { text: `[${data.severity}]`, options: { fontSize: 20, bold: true, color: '000000', fontFace: FONT_MALGUN } }
        ]
      : [
          { text: `${data.typeMain}\n`, options: { fontSize: 20, bold: true, color: '000000', fontFace: FONT_MALGUN } },
          { text: `[${data.severity}]`, options: { fontSize: 20, bold: true, color: '000000', fontFace: FONT_MALGUN } }
        ];
    slide.addText(accRuns, {
      x: 2.1666, y: 0.1216, w: 1.5186, h: 1.0535,
      fill: { color: 'FFFFFF' }, line: { color: C_ACC_BORDER, width: 3.0 },
      align: 'center', valign: 'middle', lineSpacingMultiple: 1.05,
      margin: 0
    });

    // 3) 관련기준 라벨 (Cell(1,7): x = 3.7778, w = 1.0407, h = 1.0535, 20pt Bold #000000)
    slide.addText('관련\n기준', {
      x: 3.7778, y: 0.1216, w: 1.0407, h: 1.0535,
      fill: { color: 'FFFFFF' }, line: { color: C_BORDER, width: 0.5 },
      fontFace: FONT_MALGUN, fontSize: 20, bold: true, color: '000000',
      align: 'center', valign: 'middle', lineSpacingMultiple: 1.05, margin: 0
    });

    // 4) 관련기준 내용 (Cell(1,8): x = 4.8185, w = 5.6949, h = 1.0535)
    slide.addShape(pptx.ShapeType.rect, {
      x: 4.8185, y: 0.1216, w: 5.6949, h: 1.0535,
      fill: { color: 'FFFFFF' }, line: { color: C_BORDER, width: 0.5 }
    });
    // 기준 제목 (16pt Bold #000000, 길면 자동 축소)
    const lawTitleFontSize = calcSingleLineFontSize(data.lawTitle, 5.5644, 16, 9.5);
    slide.addText(data.lawTitle, {
      x: 4.8865, y: 0.1450, w: 5.5644, h: 0.3150,
      fontFace: FONT_MALGUN, fontSize: lawTitleFontSize, bold: true, color: '000000',
      align: 'left', valign: 'middle', wrap: false, inset: 0.04
    });
    // 기준 본문 음영 박스 (SHAPE #7: x = 4.8865, y = 0.4800, w = 5.5644, h = 0.6495, fill #DAE3F3)
    slide.addShape(pptx.ShapeType.rect, {
      x: 4.8865, y: 0.4800, w: 5.5644, h: 0.6495,
      fill: { color: C_STD_CONTENT_BG }, line: { color: C_STD_CONTENT_BG, width: 0 }
    });
    const lawBodyFontSize = data.lawBody.length > 80 ? 11 : (data.lawBody.length > 55 ? 11.5 : 12.5);
    slide.addText(data.lawBody, {
      x: 4.8865, y: 0.4800, w: 5.5644, h: 0.6495,
      fontFace: FONT_MALGUN, fontSize: lawBodyFontSize, color: '111111',
      align: 'left', valign: 'middle', inset: 0.06, lineSpacingMultiple: 1.15
    });

    // 5) 4대 발생요인 (TABLE #2: x = 10.6557, y = 0.1257, w = 2.5748, h = 1.0455)
    slide.addShape(pptx.ShapeType.rect, {
      x: 10.6557, y: 0.1257, w: 2.5748, h: 1.0455,
      fill: { color: 'FFFFFF' }, line: { color: C_BORDER, width: 0.5 }
    });
    slide.addShape(pptx.ShapeType.line, {
      x: 10.6557, y: 0.6484, w: 2.5748, h: 0,
      line: { color: C_BORDER, width: 0.5 }
    });
    const factorItems = [
      { boxX: 10.7738, labelX: 11.0573, y: 0.2453, checked: data.isUnplanned, label: '계획 미수립' },
      { boxX: 12.0022, labelX: 12.2857, y: 0.2453, checked: data.isUnexecuted, label: '계획 미이행' },
      { boxX: 10.7738, labelX: 11.0573, y: 0.7680, checked: data.isAction, label: '불안전 행동' },
      { boxX: 12.0022, labelX: 12.2857, y: 0.7680, checked: data.isCondition, label: '불안전 상태' }
    ];
    factorItems.forEach(item => {
      slide.addText(item.checked ? '✔' : '', {
        x: item.boxX, y: item.y, w: 0.2835, h: 0.2835,
        fill: { color: 'FFFFFF' }, line: { color: C_BORDER, width: 0.5 },
        fontFace: FONT_MALGUN, fontSize: 13, bold: true, color: '000000',
        align: 'center', valign: 'middle', margin: 0
      });
      slide.addText(` ${item.label}`, {
        x: item.labelX, y: item.y, w: 0.9449, h: 0.2835,
        fontFace: FONT_MALGUN, fontSize: 10, bold: true, color: '000000',
        align: 'left', valign: 'middle', wrap: false, margin: 0
      });
    });

    // ── 2. 부적합 개요 섹션 (y = 1.2444, h = 1.0694, bottom = 2.3138) ──
    // '부적합 개요' 라벨 (Cell(3,1): x = 0.1070, y = 1.2444, w = 0.8305, h = 1.0694, fill #FFD966, 18pt Bold)
    slide.addText([
      { text: '부적합\n', options: { fontSize: 18, bold: true, color: '000000', fontFace: FONT_MALGUN } },
      { text: '개   요', options: { fontSize: 18, bold: true, color: '000000', fontFace: FONT_MALGUN } }
    ], {
      x: 0.1070, y: 1.2444, w: 0.8305, h: 1.0694,
      fill: { color: C_YELLOW_BG }, line: { color: C_BORDER, width: 0.5 },
      align: 'center', valign: 'middle', lineSpacingMultiple: 1.15, margin: 0
    });

    // 부적합 개요 1행: 5개 메타 셀 (y = 1.2444, h = 0.3769, 라벨 #0000FF, 값 #000000)
    const metaCols = [
      { label: '협력사 : ', val: (data.subcontractor || '').replace(/[\r\n\t]+/g, ' ').trim(), x: 0.9375, w: 2.3333 },
      { label: '공종명 : ', val: (data.workGroup || '').replace(/[\r\n\t]+/g, ' ').trim(), x: 3.2708, w: 2.9688 },
      { label: '작업장소 : ', val: (data.location || '').replace(/[\r\n\t]+/g, ' ').trim(), x: 6.2396, w: 3.1215 },
      { label: '점검자 : ', val: (data.inspector || '').replace(/[\r\n\t]+/g, ' ').trim(), x: 9.3611, w: 1.8055 },
      { label: '점검차수 : ', val: (data.inspectRound || '').replace(/[\r\n\t]+/g, ' ').trim(), x: 11.1666, w: 2.0647 }
    ];
    metaCols.forEach(col => {
      const sz = calcSingleLineFontSize(`${col.label}${col.val}`, col.w, 14, 9.5);
      const runs = [
        { text: col.label, options: { bold: true, color: C_ACCENT_BLUE, fontFace: FONT_MALGUN, fontSize: sz } },
        col.val ? { text: col.val, options: { bold: true, color: '000000', fontFace: FONT_MALGUN, fontSize: sz } } : null
      ].filter(Boolean);
      slide.addText(runs, {
        x: col.x, y: 1.2444, w: col.w, h: 0.3769,
        fill: { color: 'FFFFFF' }, line: { color: C_BORDER, width: 0.5 },
        align: 'left', valign: 'middle', inset: 0.06, wrap: false
      });
    });

    // 부적합 개요 2행: 부적합 내용 (Cell(4,2): x = 0.9375, y = 1.6213, w = 12.2938, h = 0.6925)
    const cleanMainContent = (data.mainContent || '').replace(/[\r\n\t]+/g, '  ').trim();
    const mainSz = calcSingleLineFontSize(`부적합 내용 : ${cleanMainContent}`, 12.2938, 14, 9.5);
    const mainContentRuns = [
      { text: '부적합 내용 ', options: { bold: true, color: C_ACCENT_BLUE, fontFace: FONT_MALGUN, fontSize: mainSz } },
      { text: ': ', options: { bold: true, color: '000000', fontFace: FONT_MALGUN, fontSize: mainSz } },
      data.mainContentParts && data.mainContentParts.prefix ? { text: data.mainContentParts.prefix.replace(/[\r\n\t]+/g, ' '), options: { bold: true, color: '000000', fontFace: FONT_MALGUN, fontSize: mainSz } } : null,
      data.mainContentParts && data.mainContentParts.highlight ? { text: data.mainContentParts.highlight.replace(/[\r\n\t]+/g, ' '), options: { bold: true, color: C_RED, fontFace: FONT_MALGUN, fontSize: mainSz } } : null,
      data.mainContentParts && data.mainContentParts.suffix ? { text: data.mainContentParts.suffix.replace(/[\r\n\t]+/g, ' '), options: { bold: true, color: C_TITLE_BLUE, fontFace: FONT_MALGUN, fontSize: mainSz } } : null
    ].filter(Boolean);

    slide.addText(mainContentRuns, {
      x: 0.9375, y: 1.6213, w: 12.2938, h: 0.6925,
      fill: { color: 'FFFFFF' }, line: { color: C_BORDER, width: 0.5 },
      align: 'left', valign: 'top', margin: [4, 6, 4, 6], wrap: true
    });

    // ── 3. 하단 통합 컨테이너 (Cell(5,1): x = 0.1070, y = 2.3138, w = 13.1243, h = 5.0632, bottom = 7.3770) ──
    slide.addShape(pptx.ShapeType.rect, {
      x: 0.1070, y: 2.3138, w: 13.1243, h: 5.0632,
      fill: { color: 'FFFFFF' }, line: { color: C_BORDER, width: 0.5 }
    });

    // 사진 로드
    let photo1Base64 = null;
    let photo2Base64 = null;
    if (loadPhotoBase64) {
      try { photo1Base64 = await loadPhotoBase64((record.photos && record.photos[0]) || '', record, 0); } catch (e) {}
      try { photo2Base64 = await loadPhotoBase64((record.photos && record.photos[1]) || (record.fix && record.fix.photo) || '', record, 1); } catch (e) {}
    }
    const hasPhoto2 = Boolean(photo2Base64);

    // ── [좌측 컬럼] 적색 음영 배너 & 현장 사진 (x = 0.3121, w = 5.4580) ──
    // 적색 배너 (SHAPE #12: x = 0.3121, y = 2.8121, w = 5.4580, h = 0.3702, fill #C00000 @ alpha 60% = #D96666)
    const bannerWidth = 5.4580;
    const bannerFontSize = calcSingleLineFontSize(data.photoBanner, bannerWidth, 16, 9.5);
    slide.addShape(pptx.ShapeType.rect, {
      x: 0.3121, y: 2.8121, w: bannerWidth, h: 0.3702,
      fill: { color: C_PHOTO_BANNER_RAW, transparency: 40 },
      line: { color: C_PHOTO_BANNER_RAW, transparency: 100, width: 0 }
    });
    if (data.photoBanner) {
      slide.addText([
        {
          text: data.photoBanner,
          options: {
            fontFace: FONT_MALGUN,
            fontSize: bannerFontSize,
            bold: true,
            color: 'F2F2F2',
            glow: { size: 8, opacity: 0.8, color: '000000' }
          }
        }
      ], {
        x: 0.3121, y: 2.8121, w: bannerWidth, h: 0.3702,
        align: 'center', valign: 'middle', wrap: false, inset: 0.04
      });
    }

    // 현장 사진 배치 (Hold Point 영역 x = 5.9202 침범 없이 x = 0.3121 ~ 5.7701 내부에 배치)
    const showGuidelineBox = Boolean(data.hasGuideline && data.guidelineTitle);
    const photoStartY = 3.2400;
    const photoBodyHeight = showGuidelineBox ? 2.9200 : 4.0400;

    if (hasPhoto2) {
      const eachW = 2.6900;
      if (photo1Base64) {
        slide.addImage({
          data: photo1Base64,
          x: 0.3121, y: photoStartY, w: eachW, h: photoBodyHeight,
          sizing: { type: 'cover', w: eachW, h: photoBodyHeight }
        });
      } else {
        slide.addShape(pptx.ShapeType.rect, {
          x: 0.3121, y: photoStartY, w: eachW, h: photoBodyHeight,
          fill: { color: 'F8FAFC' }, line: { color: C_BORDER, width: 0.5 }
        });
        slide.addText('📷 현장 사진 1', {
          x: 0.3121, y: photoStartY, w: eachW, h: photoBodyHeight,
          fontSize: 13, color: '64748B', fontFace: FONT_MALGUN, align: 'center', valign: 'middle'
        });
      }
      if (photo2Base64) {
        slide.addImage({
          data: photo2Base64,
          x: 3.0801, y: photoStartY, w: eachW, h: photoBodyHeight,
          sizing: { type: 'cover', w: eachW, h: photoBodyHeight }
        });
      } else {
        slide.addShape(pptx.ShapeType.rect, {
          x: 3.0801, y: photoStartY, w: eachW, h: photoBodyHeight,
          fill: { color: 'F8FAFC' }, line: { color: C_BORDER, width: 0.5 }
        });
        slide.addText('📷 현장 사진 2', {
          x: 3.0801, y: photoStartY, w: eachW, h: photoBodyHeight,
          fontSize: 13, color: '64748B', fontFace: FONT_MALGUN, align: 'center', valign: 'middle'
        });
      }
    } else {
      if (photo1Base64) {
        slide.addImage({
          data: photo1Base64,
          x: 0.3121, y: photoStartY, w: bannerWidth, h: photoBodyHeight,
          sizing: { type: 'cover', w: bannerWidth, h: photoBodyHeight }
        });
      } else {
        slide.addShape(pptx.ShapeType.rect, {
          x: 0.3121, y: photoStartY, w: bannerWidth, h: photoBodyHeight,
          fill: { color: 'F8FAFC' }, line: { color: C_BORDER, width: 0.5 }
        });
        slide.addText('📷 현장 사진 (첨부 이미지 없음)', {
          x: 0.3121, y: photoStartY, w: bannerWidth, h: photoBodyHeight,
          fontSize: 14, color: '64748B', fontFace: FONT_MALGUN, align: 'center', valign: 'middle'
        });
      }
    }

    if (showGuidelineBox) {
      slide.addShape(pptx.ShapeType.rect, {
        x: 0.3121, y: 6.2000, w: bannerWidth, h: 1.0800,
        fill: { color: 'FFFFFF' }, line: { color: C_BORDER, width: 0.5 }
      });
      slide.addText([
        { text: `${data.guidelineTitle}\n`, options: { fontSize: 12, bold: true, color: '000000', fontFace: FONT_MALGUN } },
        { text: data.guidelineBody, options: { fontSize: 10.5, color: '222222', fontFace: FONT_MALGUN } }
      ], {
        x: 0.3121, y: 6.2000, w: bannerWidth, h: 1.0800,
        margin: [4, 8, 4, 8], valign: 'top', lineSpacingMultiple: 1.15
      });
    }

    // ── [중앙 컬럼] Hold Point 위반 박스 + 하단 그림 공간 확보 + 초록색 음영 박스 (x = 5.9202, w = 2.2594) ──
    // 1) Hold Point 위반 표 (TABLE #3: x = 5.9202, y = 2.3772, w = 2.2594, h = 0.4039, 상단/좌측/우측 0.5pt 테두리)
    slide.addShape(pptx.ShapeType.line, {
      x: 5.9202, y: 2.3772, w: 2.2594, h: 0,
      line: { color: C_BORDER, width: 0.5 }
    });
    slide.addShape(pptx.ShapeType.line, {
      x: 5.9202, y: 2.3772, w: 0, h: 0.4039,
      line: { color: C_BORDER, width: 0.5 }
    });
    slide.addShape(pptx.ShapeType.line, {
      x: 8.1796, y: 2.3772, w: 0, h: 0.4039,
      line: { color: C_BORDER, width: 0.5 }
    });
    // 내부 체크박스 (Cell(2,2): x = 5.9748, y = 2.4207, w = 0.3150, h = 0.3168)
    slide.addText(data.isHoldPoint ? '✔' : '', {
      x: 5.9748, y: 2.4207, w: 0.3150, h: 0.3168,
      fill: { color: 'FFFFFF' }, line: { color: C_BORDER, width: 0.5 },
      fontFace: FONT_MALGUN, fontSize: 15, bold: true, color: '000000',
      align: 'center', valign: 'middle', margin: 0
    });
    // Hold Point 위반 텍스트 (Cell(2,3): x = 6.2898, y = 2.4207, w = 1.8897, h = 0.3168, 11pt Bold)
    slide.addText(` Hold Point 위반 (${data.holdPointCode})`, {
      x: 6.2898, y: 2.4207, w: 1.8897, h: 0.3168,
      fontFace: FONT_MALGUN, fontSize: 11, bold: true, color: '000000',
      align: 'left', valign: 'middle', wrap: false, margin: 0
    });

    // 2) Hold Point 하단 그림 영역 공간 확보 (Pic #1: x = 5.9202, y = 2.7584, w = 2.2712, h = 2.7348)
    // 추후 지게차, 밀폐공간 등 Hold Point 자료 이미지를 주입할 수 있도록 전용 공간 확보
    if (record.holdPointImage) {
      slide.addImage({
        data: record.holdPointImage,
        x: 5.9202, y: 2.7584, w: 2.2712, h: 2.7348,
        sizing: { type: 'contain', w: 2.2712, h: 2.7348 }
      });
    }

    // 3) 초록색 음영 박스 (SHAPE #13: x = 5.9320, y = 5.5054, w = 2.2594, h = 0.3702, fill #A9D18E @ alpha 60% = #CBE3BB)
    slide.addShape(pptx.ShapeType.rect, {
      x: 5.9320, y: 5.5054, w: 2.2594, h: 0.3702,
      fill: { color: C_GREEN_BANNER_RAW, transparency: 40 },
      line: { color: C_GREEN_BANNER_RAW, transparency: 100, width: 0 }
    });
    if (data.greenBanner) {
      slide.addText([
        {
          text: data.greenBanner,
          options: {
            fontFace: FONT_MALGUN,
            fontSize: 16,
            bold: true,
            color: 'F2F2F2',
            glow: { size: 8, opacity: 0.8, color: '000000' }
          }
        }
      ], {
        x: 5.9320, y: 5.5054, w: 2.2594, h: 0.3702,
        align: 'center', valign: 'middle', wrap: false, inset: 0.04
      });
    }

    // ── [우측 컬럼] 발생원인 & 개선대책 (x = 8.2448, w = 4.9213) ──
    // 1) 발생원인 (인터뷰 결과) 헤더 (SHAPE #3: x = 8.2448, y = 2.3803, w = 4.9213, h = 0.4039, 18pt Bold)
    slide.addText('발생원인 (인터뷰 결과)', {
      x: 8.2448, y: 2.3803, w: 4.9213, h: 0.4039,
      fill: { color: C_YELLOW_BG }, line: { color: C_BORDER, width: 0.5 },
      fontFace: FONT_MALGUN, fontSize: 18, bold: true, color: '000000',
      align: 'center', valign: 'middle'
    });

    // 2) [의견 : ] 박스 (SHAPE #2: x = 8.2448, y = 2.8227, w = 4.9213, h = 1.5748)
    let intSz = 12;
    let intLineSpacing = 1.15;
    if (data.interviewOpinion.length > 130) {
      intSz = 10;
      intLineSpacing = 1.10;
    } else if (data.interviewOpinion.length > 80) {
      intSz = 11;
      intLineSpacing = 1.12;
    }
    slide.addText([
      {
        text: '[의견 : 시공관리자 및 근로자]',
        options: {
          fontSize: 14,
          bold: true,
          color: C_SUBHEADER_TEXT,
          fontFace: FONT_MALGUN,
          breakLine: true,
          paraSpaceAfter: 6
        }
      },
      {
        text: data.interviewOpinion,
        options: {
          fontSize: intSz,
          color: '111111',
          fontFace: FONT_MALGUN
        }
      }
    ], {
      x: 8.2448, y: 2.8227, w: 4.9213, h: 1.5748,
      fill: { color: 'FFFFFF' }, line: { color: C_BORDER, width: 0.5 },
      margin: [6, 8, 4, 4], valign: 'top', lineSpacingMultiple: intLineSpacing
    });

    // 3) [점검단 제안] 좌측 상단 셀 (SHAPE #5: x = 8.2448, y = 4.3979, w = 1.5342, h = 0.3543)
    slide.addText('[점검단 제안]', {
      x: 8.2448, y: 4.3979, w: 1.5342, h: 0.3543,
      fill: { color: 'FFFFFF' }, line: { color: C_BORDER, width: 0.5 },
      fontFace: FONT_MALGUN, fontSize: 14, bold: true, color: C_SUBHEADER_TEXT,
      align: 'center', valign: 'middle'
    });

    // 4) [점검단 제안] 좌측 하단 셀 (SHAPE #6: x = 8.2448, y = 4.7522, w = 1.5342, h = 0.6790)
    slide.addText([
      { text: `${data.proposalType}\n`, options: { fontSize: 14, bold: true, color: C_ACCENT_BLUE, fontFace: FONT_MALGUN } },
      { text: data.proposalSub, options: { fontSize: 11, bold: true, color: '000000', fontFace: FONT_MALGUN } }
    ], {
      x: 8.2448, y: 4.7522, w: 1.5342, h: 0.6790,
      fill: { color: 'FFFFFF' }, line: { color: C_BORDER, width: 0.5 },
      align: 'center', valign: 'middle', lineSpacingMultiple: 1.15
    });

    // 5) [점검단 제안] 우측 본문 셀 (SHAPE #4: x = 9.7790, y = 4.3979, w = 3.3871, h = 1.0333)
    let propSz = 12;
    let propLineSpacing = 1.15;
    let propMargin = [6, 8, 4, 6];
    if (data.proposalContent.length > 70) {
      propSz = 10;
      propLineSpacing = 1.08;
      propMargin = [4, 6, 2, 4];
    } else if (data.proposalContent.length > 45) {
      propSz = 11;
      propLineSpacing = 1.12;
      propMargin = [4, 6, 3, 5];
    }
    slide.addText(data.proposalContent, {
      x: 9.7790, y: 4.3979, w: 3.3871, h: 1.0333,
      fill: { color: 'FFFFFF' }, line: { color: C_BORDER, width: 0.5 },
      fontFace: FONT_MALGUN, fontSize: propSz, color: '111111',
      margin: propMargin, valign: 'top', lineSpacingMultiple: propLineSpacing
    });

    // 6) 개선대책 (현장 협의 결과) 헤더 (SHAPE #8: x = 8.2448, y = 5.4951, w = 4.9213, h = 0.4039, 18pt Bold)
    slide.addText('개선대책 (현장 협의 결과)', {
      x: 8.2448, y: 5.4951, w: 4.9213, h: 0.4039,
      fill: { color: C_YELLOW_BG }, line: { color: C_BORDER, width: 0.5 },
      fontFace: FONT_MALGUN, fontSize: 18, bold: true, color: '000000',
      align: 'center', valign: 'middle'
    });

    // 7) 개선대책 좌측 본문 셀 (SHAPE #11: x = 8.2448, y = 5.9064, w = 3.3858, h = 1.3959)
    let counterSz = 12;
    let counterLineSpacing = 1.15;
    let counterMargin = [6, 8, 4, 6];
    if (data.countermeasureContent.length > 70) {
      counterSz = 10;
      counterLineSpacing = 1.08;
      counterMargin = [4, 6, 2, 4];
    } else if (data.countermeasureContent.length > 45) {
      counterSz = 11;
      counterLineSpacing = 1.12;
      counterMargin = [4, 6, 3, 5];
    }
    slide.addText(data.countermeasureContent || '', {
      x: 8.2448, y: 5.9064, w: 3.3858, h: 1.3959,
      fill: { color: 'FFFFFF' }, line: { color: C_BORDER, width: 0.5 },
      fontFace: FONT_MALGUN, fontSize: counterSz, bold: true, color: '000000',
      margin: counterMargin, valign: 'top', lineSpacingMultiple: counterLineSpacing
    });

    // 8) [PM 판정결과] 우측 상단 셀 (SHAPE #9: x = 11.6307, y = 5.9064, w = 1.5354, h = 0.3329)
    slide.addText('[PM 판정결과]', {
      x: 11.6307, y: 5.9064, w: 1.5354, h: 0.3329,
      fill: { color: 'FFFFFF' }, line: { color: C_BORDER, width: 0.5 },
      fontFace: FONT_MALGUN, fontSize: 14, bold: true, color: C_SUBHEADER_TEXT,
      align: 'center', valign: 'middle'
    });

    // 9) [PM 판정결과] 우측 하단 셀 (SHAPE #10: x = 11.6307, y = 6.2394, w = 1.5354, h = 1.0630)
    const pmRuns = data.pmVerdictType
      ? [
          { text: `${data.pmVerdictType}\n`, options: { fontSize: 14, bold: true, color: C_ACCENT_BLUE, fontFace: FONT_MALGUN } },
          data.pmVerdictSub ? { text: data.pmVerdictSub, options: { fontSize: 11, bold: true, color: '000000', fontFace: FONT_MALGUN } } : null
        ].filter(Boolean)
      : '';
    slide.addText(pmRuns, {
      x: 11.6307, y: 6.2394, w: 1.5354, h: 1.0630,
      fill: { color: 'FFFFFF' }, line: { color: C_BORDER, width: 0.5 },
      align: 'center', valign: 'middle', lineSpacingMultiple: 1.15, margin: [4, 4, 4, 4]
    });
  }

  /**
   * [경부적합] PptxGenJS 슬라이드 레이아웃 생성 (템플릿/부적합장표(경부적합).pptx 100% 정밀 일치)
   */
  async function addMinorInspectionSheetSlide(pptx, record, data, options = {}) {
    const { loadPhotoBase64 } = options;
    const slide = pptx.addSlide();
    slide.background = { color: 'FFFFFF' };

    // ── 0. 슬라이드 외곽 프레임 (SHAPE #1: x=0, y=0, w=13.333, h=7.500, 3.0pt #8FAADC) ──
    slide.addShape(pptx.ShapeType.rect, {
      x: 0.015, y: 0.015, w: 13.303, h: 7.470,
      line: { color: C_FRAME_BORDER, width: 3.0 }
    });

    // ── 1. 최상단 행 (y = 0.1003, h = 0.8331, bottom = 0.9334) ──
    // 1) 위험성평가 박스 (Cell(1,1): x = 0.1031, y = 0.1003, w = 2.4836, h = 0.8331, fill #BDD7EE, 24pt Bold)
    slide.addText('위험성평가', {
      x: 0.1031, y: 0.1003, w: 2.4836, h: 0.8331,
      fill: { color: C_HEADER_BG }, line: { color: C_BORDER, width: 0.5 },
      fontFace: FONT_MALGUN, fontSize: 24, bold: true, color: '000000',
      align: 'center', valign: 'middle', margin: 0, wrap: false
    });

    // 2) 우측 타이틀 텍스트 (Cell(1,3): x = 2.5867, y = 0.1003, w = 10.6401, h = 0.8331, 18pt Bold, 테두리 없음)
    slide.addText('위험성평가 확인 - [전사 안전보건경영규칙] 유해·위험요인 파악 및 위험성 관리', {
      x: 2.5867, y: 0.1003, w: 10.6401, h: 0.8331,
      fontFace: FONT_MALGUN, fontSize: 18, bold: true, color: '000000',
      align: 'left', valign: 'middle', inset: 0.10, wrap: false
    });

    // ── 2. 부적합 사항 행 (y = 1.0000, h = 1.1806, bottom = 2.1806) ──
    // 1) '부적합 사항' 라벨 (Cell(3,1): x = 0.1031, y = 1.0000, w = 0.8364, h = 1.1806, fill #FFD966, 18pt Bold)
    slide.addText([
      { text: '부적합\n', options: { fontSize: 18, bold: true, color: '000000', fontFace: FONT_MALGUN } },
      { text: '사   항', options: { fontSize: 18, bold: true, color: '000000', fontFace: FONT_MALGUN } }
    ], {
      x: 0.1031, y: 1.0000, w: 0.8364, h: 1.1806,
      fill: { color: C_YELLOW_BG }, line: { color: C_BORDER, width: 0.5 },
      align: 'center', valign: 'middle', lineSpacingMultiple: 1.15, margin: 0
    });

    // 2) 부적합 사항 본문 (Cell(3,2): x = 0.9395, y = 1.0000, w = 12.2873, h = 1.1806, 17pt Bold)
    const cleanSub = (data.subcontractor || '').replace(/[\r\n\t]+/g, ' ').trim();
    const cleanMain = (data.mainContent || '').replace(/[\r\n\t]+/g, '  ').trim();
    const contentFontSize = calcSingleLineFontSize(`    - ${cleanMain}`, 12.10, 17, 11);
    slide.addText([
      { text: '■ 위험요소 안전대책 이행 확인 [', options: { fontSize: 17, bold: true, color: '000000', fontFace: FONT_MALGUN } },
      { text: `협력사: ${cleanSub}`, options: { fontSize: 17, bold: true, color: C_ACCENT_BLUE, fontFace: FONT_MALGUN } },
      { text: ']\n', options: { fontSize: 17, bold: true, color: '000000', fontFace: FONT_MALGUN } },
      { text: `    - ${cleanMain}`, options: { fontSize: contentFontSize, bold: true, color: '000000', fontFace: FONT_MALGUN } }
    ], {
      x: 0.9395, y: 1.0000, w: 12.2873, h: 1.1806,
      fill: { color: 'FFFFFF' }, line: { color: C_BORDER, width: 0.5 },
      align: 'left', valign: 'middle', inset: 0.10, lineSpacingMultiple: 1.20
    });

    // ── 3. 부적합 사례 헤더 행 (Cell(4,1): x = 0.1031, y = 2.1806, w = 13.1237, h = 0.3639, fill #FFD966, 16pt Bold) ──
    slide.addText('부적합 사례', {
      x: 0.1031, y: 2.1806, w: 13.1237, h: 0.3639,
      fill: { color: C_YELLOW_BG }, line: { color: C_BORDER, width: 0.5 },
      fontFace: FONT_MALGUN, fontSize: 16, bold: true, color: '000000',
      align: 'center', valign: 'middle'
    });

    // ── 4. 하단 사례 컨테이너 (Cell(5,1): x = 0.1031, y = 2.5445, w = 13.1237, h = 4.8528, bottom = 7.3973) ──
    slide.addShape(pptx.ShapeType.rect, {
      x: 0.1031, y: 2.5445, w: 13.1237, h: 4.8528,
      fill: { color: 'FFFFFF' }, line: { color: C_BORDER, width: 0.5 }
    });

    // 사진 로드
    let photo1Base64 = null;
    let photo2Base64 = null;
    if (loadPhotoBase64) {
      try { photo1Base64 = await loadPhotoBase64((record.photos && record.photos[0]) || '', record, 0); } catch (e) {}
      try { photo2Base64 = await loadPhotoBase64((record.photos && record.photos[1]) || (record.fix && record.fix.photo) || '', record, 1); } catch (e) {}
    }

    // 1) 좌측 적색 음영 배너 (SHAPE #3 [TextBox 11]: x = 0.8685, y = 2.8276, w = 5.4580, h = 0.3702, fill #C00000 @ alpha 60% = #D96666)
    const leftBannerW = 5.4580;
    const leftBannerSz = calcSingleLineFontSize(data.photoBanner, leftBannerW, 16, 9.5);
    slide.addShape(pptx.ShapeType.rect, {
      x: 0.8685, y: 2.8276, w: leftBannerW, h: 0.3702,
      fill: { color: C_PHOTO_BANNER_RAW, transparency: 40 },
      line: { color: C_PHOTO_BANNER_RAW, transparency: 100, width: 0 }
    });
    if (data.photoBanner) {
      slide.addText([
        {
          text: data.photoBanner,
          options: {
            fontFace: FONT_MALGUN,
            fontSize: leftBannerSz,
            bold: true,
            color: 'F2F2F2',
            glow: { size: 8, opacity: 0.8, color: '000000' }
          }
        }
      ], {
        x: 0.8685, y: 2.8276, w: leftBannerW, h: 0.3702,
        align: 'center', valign: 'middle', wrap: false, inset: 0.04
      });
    }

    // 좌측 현장 사진 (x = 0.8685, y = 3.2500, w = 5.4580, h = 3.9500)
    if (photo1Base64) {
      slide.addImage({
        data: photo1Base64,
        x: 0.8685, y: 3.2500, w: leftBannerW, h: 3.9500,
        sizing: { type: 'cover', w: leftBannerW, h: 3.9500 }
      });
    } else {
      slide.addShape(pptx.ShapeType.rect, {
        x: 0.8685, y: 3.2500, w: leftBannerW, h: 3.9500,
        fill: { color: 'F8FAFC' }, line: { color: C_BORDER, width: 0.5 }
      });
      slide.addText('📷 현장 사진 (첨부 이미지 없음)', {
        x: 0.8685, y: 3.2500, w: leftBannerW, h: 3.9500,
        fontSize: 14, color: '64748B', fontFace: FONT_MALGUN, align: 'center', valign: 'middle'
      });
    }

    // 2) 우측 피치/오렌지 음영 배너 (SHAPE #2 [TextBox 16]: x = 7.8740, y = 2.8276, w = 4.4082, h = 0.3702, fill #F8CBAD @ alpha 60% = #FBE0CE)
    const rightBannerW = 4.4082;
    slide.addShape(pptx.ShapeType.rect, {
      x: 7.8740, y: 2.8276, w: rightBannerW, h: 0.3702,
      fill: { color: C_PEACH_BANNER_RAW, transparency: 40 },
      line: { color: C_PEACH_BANNER_RAW, transparency: 100, width: 0 }
    });
    slide.addText([
      {
        text: '[위험성평가표]',
        options: {
          fontFace: FONT_MALGUN,
          fontSize: 16,
          bold: true,
          color: 'F2F2F2',
          glow: { size: 8, opacity: 0.8, color: '000000' }
        }
      }
    ], {
      x: 7.8740, y: 2.8276, w: rightBannerW, h: 0.3702,
      align: 'center', valign: 'middle', wrap: false, inset: 0.04
    });

    // 우측 위험성평가표 이미지 (첨부된 2번째 이미지가 있는 경우 배치, 없으면 양식 원본처럼 공란 확보)
    if (photo2Base64) {
      slide.addImage({
        data: photo2Base64,
        x: 7.8740, y: 3.2500, w: rightBannerW, h: 3.9500,
        sizing: { type: 'contain', w: rightBannerW, h: 3.9500 }
      });
    }
  }

  /**
   * PptxGenJS 단일 슬라이드에 점검장표 레이아웃 추가 (중부적합 / 경부적합 자동 분기)
   */
  async function addInspectionSheetSlide(pptx, record, options = {}) {
    const { rulesFromTaxonomy = [] } = options;
    const data = normalizeJangpyoData(record, rulesFromTaxonomy, options);
    if (data.isMajor) {
      return addMajorInspectionSheetSlide(pptx, record, data, options);
    }
    return addMinorInspectionSheetSlide(pptx, record, data, options);
  }

  /**
   * 점검장표 PPT (.pptx) 프레젠테이션 생성 및 다운로드
   */
  async function generateInspectionSheetPPT(options = {}) {
    const PptxClass = (typeof window !== 'undefined' && window.PptxGenJS) || (typeof PptxGenJS !== 'undefined' ? PptxGenJS : null);
    if (!PptxClass) {
      throw new Error('PptxGenJS 라이브러리가 로드되지 않았습니다.');
    }

    const { records = [], loadPhotoBase64, download = true, filename } = options;
    const list = Array.isArray(records) ? records : [records];
    if (!list.length) {
      throw new Error('점검장표를 생성할 부적합 데이터가 선택되지 않았습니다.');
    }

    const pptx = new PptxClass();
    pptx.defineLayout({ name: 'WIDE_16_9', width: 13.333, height: 7.5 });
    pptx.layout = 'WIDE_16_9';

    for (const rec of list) {
      await addInspectionSheetSlide(pptx, rec, { loadPhotoBase64 });
    }

    let defaultName = `점검장표_${list[0].site || '현장'}_${list.length > 1 ? `${list.length}건_` : ''}${new Date().toISOString().slice(0, 10)}.pptx`;
    const finalFilename = filename || defaultName;

    const pptxBlob = await pptx.write({ outputType: 'blob' });
    const mimeBlob = new Blob([pptxBlob], {
      type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    });

    if (download !== false) {
      if (window.SafeUtil && window.SafeUtil.downloadBlob) {
        window.SafeUtil.downloadBlob(mimeBlob, finalFilename);
      } else {
        const url = URL.createObjectURL(mimeBlob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = finalFilename;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
          try {
            if (a.parentNode) a.parentNode.removeChild(a);
            URL.revokeObjectURL(url);
          } catch (e) {}
        }, 60000);
      }
    }

    return { blob: mimeBlob, filename: finalFilename };
  }

  /**
   * [중부적합] 브라우저 실시간 16:9 슬라이드 프리뷰 HTML 렌더링 (템플릿/부적합장표(중부적합).pptx 100% 정밀 일치)
   */
  function renderMajorInspectionSheetHTML(record, data, options = {}) {
    const { photo1Url = '', photo2Url = '' } = options;

    const pctX = (x) => `${((x / 13.3333) * 100).toFixed(4)}%`;
    const pctY = (y) => `${((y / 7.5000) * 100).toFixed(4)}%`;
    const pctW = (w) => `${((w / 13.3333) * 100).toFixed(4)}%`;
    const pctH = (h) => `${((h / 7.5000) * 100).toFixed(4)}%`;
    const pt = (n) => `${(n * 0.104167).toFixed(4)}cqw`;
    const glowTextShadow = '0 0 4px rgba(0,0,0,0.85), -0.5px -0.5px 1.5px rgba(0,0,0,0.85), 0.5px 0.5px 1.5px rgba(0,0,0,0.85)';

    const lawTitleFontSize = calcSingleLineFontSize(data.lawTitle, 5.5644, 16, 9.5);
    const lawBodyFontSize = data.lawBody.length > 80 ? 11 : (data.lawBody.length > 55 ? 11.5 : 12.5);

    const metaCols = [
      { label: '협력사 : ', val: data.subcontractor, x: 0.9375, w: 2.3333 },
      { label: '공종명 : ', val: data.workGroup, x: 3.2708, w: 2.9688 },
      { label: '작업장소 : ', val: data.location, x: 6.2396, w: 3.1215 },
      { label: '점검자 : ', val: data.inspector, x: 9.3611, w: 1.8055 },
      { label: '점검차수 : ', val: data.inspectRound, x: 11.1666, w: 2.0647 }
    ];

    const mainSz = calcSingleLineFontSize(`부적합 내용 : ${data.mainContent}`, 12.2938, 14, 9.5);

    let intSz = 12;
    let intLineSpacing = 1.25;
    if (data.interviewOpinion.length > 130) {
      intSz = 10;
      intLineSpacing = 1.15;
    } else if (data.interviewOpinion.length > 80) {
      intSz = 11;
      intLineSpacing = 1.20;
    }

    let propSz = 12;
    let propLineSpacing = 1.25;
    if (data.proposalContent.length > 70) {
      propSz = 10;
      propLineSpacing = 1.15;
    } else if (data.proposalContent.length > 45) {
      propSz = 11;
      propLineSpacing = 1.20;
    }

    let counterSz = 12;
    let counterLineSpacing = 1.25;
    if (data.countermeasureContent.length > 70) {
      counterSz = 10;
      counterLineSpacing = 1.15;
    } else if (data.countermeasureContent.length > 45) {
      counterSz = 11;
      counterLineSpacing = 1.20;
    }

    const hasPhoto2 = Boolean(photo2Url);
    const showGuidelineBox = Boolean(data.hasGuideline && data.guidelineTitle);
    const photoStartY = 3.2400;
    const photoBodyHeight = showGuidelineBox ? 2.9200 : 4.0400;
    const bannerWidth = 5.4580;
    const bannerFontSize = calcSingleLineFontSize(data.photoBanner, bannerWidth, 16, 9.5);

    const factorItems = [
      { boxX: 10.7738, labelX: 11.0573, y: 0.2453, checked: data.isUnplanned, label: '계획 미수립' },
      { boxX: 12.0022, labelX: 12.2857, y: 0.2453, checked: data.isUnexecuted, label: '계획 미이행' },
      { boxX: 10.7738, labelX: 11.0573, y: 0.7680, checked: data.isAction, label: '불안전 행동' },
      { boxX: 12.0022, labelX: 12.2857, y: 0.7680, checked: data.isCondition, label: '불안전 상태' }
    ];

    return `
      <div id="jangpyoSlidePreview" data-severity="중부적합" style="
        width: 100%;
        aspect-ratio: 16 / 9;
        position: relative;
        background: #ffffff;
        border: 3px solid #8faadc;
        border-radius: 2px;
        box-shadow: 0 4px 20px rgba(0,0,0,0.18);
        box-sizing: border-box;
        overflow: hidden;
        container-type: inline-size;
        font-family: 'Malgun Gothic', '맑은 고딕', sans-serif;
        color: #000000;
        user-select: none;
      ">
        <!-- 1. 시설물/법규 (연청색 #bdd7ee, 24pt bold) -->
        <div style="position: absolute; left: ${pctX(0.1070)}; top: ${pctY(0.1216)}; width: ${pctW(1.9763)}; height: ${pctH(1.0535)}; background: #bdd7ee; border: 1px solid #000000; display: flex; align-items: center; justify-content: center; font-size: ${pt(24)}; font-weight: 800; color: #000000; box-sizing: border-box;">
          시설물/법규
        </div>

        <!-- 2. 사고유형 & 등급 (20pt bold, 순수 흰색 + 3px 황색 #ffc000 테두리) -->
        <div style="position: absolute; left: ${pctX(2.1666)}; top: ${pctY(0.1216)}; width: ${pctW(1.5186)}; height: ${pctH(1.0535)}; background: #ffffff; border: 3px solid #ffc000; display: flex; flex-direction: column; align-items: center; justify-content: center; box-sizing: border-box;">
          <div style="font-size: ${pt(20)}; font-weight: 800; color: #000000; line-height: 1.15; text-align: center;">${data.typeMain}</div>
          ${data.typeSub ? `<div style="font-size: ${pt(11)}; font-weight: 700; color: #333333; line-height: 1.1; text-align: center; margin-top: 0.05cqw;">${data.typeSub}</div>` : ''}
          <div style="font-size: ${pt(20)}; font-weight: 800; color: #000000; line-height: 1.15; text-align: center; margin-top: 0.05cqw;">[${data.severity}]</div>
        </div>

        <!-- 3. 관련기준 라벨 (20pt bold) -->
        <div style="position: absolute; left: ${pctX(3.7778)}; top: ${pctY(0.1216)}; width: ${pctW(1.0407)}; height: ${pctH(1.0535)}; background: #ffffff; border: 1px solid #000000; display: flex; align-items: center; justify-content: center; font-size: ${pt(20)}; font-weight: 800; color: #000000; text-align: center; line-height: 1.15; box-sizing: border-box;">
          관련<br>기준
        </div>

        <!-- 4. 관련기준 내용 외곽 사각형 -->
        <div style="position: absolute; left: ${pctX(4.8185)}; top: ${pctY(0.1216)}; width: ${pctW(5.6949)}; height: ${pctH(1.0535)}; background: #ffffff; border: 1px solid #000000; box-sizing: border-box;"></div>

        <!-- 4-1. 관련기준 제목 (16pt bold, 길면 자동 축소) -->
        <div style="position: absolute; left: ${pctX(4.8865)}; top: ${pctY(0.1450)}; width: ${pctW(5.5644)}; height: ${pctH(0.3150)}; display: flex; align-items: center; font-size: ${pt(lawTitleFontSize)}; font-weight: 800; color: #000000; white-space: nowrap; box-sizing: border-box;">
          ${data.lawTitle}
        </div>

        <!-- 4-2. 관련기준 본문 (연청색 #dae3f3 음영 박스) -->
        <div style="position: absolute; left: ${pctX(4.8865)}; top: ${pctY(0.4800)}; width: ${pctW(5.5644)}; height: ${pctH(0.6495)}; background: #dae3f3; padding: 0.2cqw 0.5cqw; box-sizing: border-box; display: flex; align-items: center;">
          <div style="font-size: ${pt(lawBodyFontSize)}; color: #111111; line-height: 1.25; word-break: keep-all;">
            ${data.lawBody}
          </div>
        </div>

        <!-- 5. 4대 발생요인 (TABLE #2: 정사각형 체크박스 4개 + 가로 구분선) -->
        <div style="position: absolute; left: ${pctX(10.6557)}; top: ${pctY(0.1257)}; width: ${pctW(2.5748)}; height: ${pctH(1.0455)}; background: #ffffff; border: 1px solid #000000; box-sizing: border-box;"></div>
        <div style="position: absolute; left: ${pctX(10.6557)}; top: ${pctY(0.6484)}; width: ${pctW(2.5748)}; height: 0; border-top: 1px solid #000000;"></div>
        ${factorItems.map(item => `
          <div style="position: absolute; left: ${pctX(item.boxX)}; top: ${pctY(item.y)}; width: ${pctW(0.2835)}; height: ${pctH(0.2835)}; background: #ffffff; border: 1px solid #000000; display: flex; align-items: center; justify-content: center; font-size: ${pt(13)}; font-weight: 900; color: #000000; box-sizing: border-box;">
            ${item.checked ? '✔' : ''}
          </div>
          <div style="position: absolute; left: ${pctX(item.labelX)}; top: ${pctY(item.y)}; width: ${pctW(0.9449)}; height: ${pctH(0.2835)}; display: flex; align-items: center; padding-left: 0.25cqw; font-size: ${pt(10)}; font-weight: 800; color: #000000; white-space: nowrap; box-sizing: border-box;">
            ${item.label}
          </div>
        `).join('')}

        <!-- 6. 부적합 개요 섹션 -->
        <!-- 6-1. 부적합 개요 라벨 (#ffd966, 18pt bold) -->
        <div style="position: absolute; left: ${pctX(0.1070)}; top: ${pctY(1.2444)}; width: ${pctW(0.8305)}; height: ${pctH(1.0694)}; background: #ffd966; border: 1px solid #000000; display: flex; align-items: center; justify-content: center; font-size: ${pt(18)}; font-weight: 800; color: #000000; text-align: center; line-height: 1.15; box-sizing: border-box;">
          부적합<br>개&nbsp;&nbsp;&nbsp;요
        </div>

        <!-- 6-2. 메타 정보 5개 독립 셀 (14pt bold, 라벨 #0000ff) -->
        ${metaCols.map(col => {
          const sz = calcSingleLineFontSize(`${col.label}${col.val}`, col.w, 14, 9.5);
          return `
            <div style="position: absolute; left: ${pctX(col.x)}; top: ${pctY(1.2444)}; width: ${pctW(col.w)}; height: ${pctH(0.3769)}; background: #ffffff; border: 1px solid #000000; display: flex; align-items: center; padding: 0 0.4cqw; box-sizing: border-box; white-space: nowrap;">
              <strong style="color: #0000ff; font-size: ${pt(sz)}; margin-right: 0.2cqw;">${col.label}</strong>
              <span style="font-weight: 800; color: #000000; font-size: ${pt(sz)};">${col.val}</span>
            </div>
          `;
        }).join('')}

        <!-- 6-3. 부적합 내용 셀 (x = 0.9375, y = 1.6213, w = 12.2938, h = 0.6925) -->
        <div style="position: absolute; left: ${pctX(0.9375)}; top: ${pctY(1.6213)}; width: ${pctW(12.2938)}; height: ${pctH(0.6925)}; background: #ffffff; border: 1px solid #000000; display: flex; align-items: flex-start; padding: 0.35cqw 0.5cqw; box-sizing: border-box; white-space: nowrap;">
          <strong style="color: #0000ff; font-size: ${pt(mainSz)};">부적합 내용</strong>
          <strong style="color: #000000; font-size: ${pt(mainSz)};">&nbsp;:&nbsp;</strong>
          <span style="font-weight: 800; color: #000000; font-size: ${pt(mainSz)};">${data.mainContentParts.prefix}</span>
          ${data.mainContentParts.highlight ? `<span style="font-weight: 900; color: #c00000; font-size: ${pt(mainSz)};">${data.mainContentParts.highlight}</span>` : ''}
          ${data.mainContentParts.suffix ? `<span style="font-weight: 800; color: #002060; font-size: ${pt(mainSz)};">${data.mainContentParts.suffix}</span>` : ''}
        </div>

        <!-- 7. 하단 통합 본문 컨테이너 (x = 0.1070, y = 2.3138, w = 13.1243, h = 5.0632) -->
        <div style="position: absolute; left: ${pctX(0.1070)}; top: ${pctY(2.3138)}; width: ${pctW(13.1243)}; height: ${pctH(5.0632)}; background: #ffffff; border: 1px solid #000000; box-sizing: border-box;"></div>

        <!-- 7-1. [좌측 컬럼] 적색 음영 배너 (#C00000 @ 60% = #d96666, x = 0.3121, y = 2.8121, w = 5.4580, h = 0.3702) -->
        <div style="position: absolute; left: ${pctX(0.3121)}; top: ${pctY(2.8121)}; width: ${pctW(bannerWidth)}; height: ${pctH(0.3702)}; background: rgba(192, 0, 0, 0.6); display: flex; align-items: center; justify-content: center; box-sizing: border-box; white-space: nowrap; padding: 0 0.4cqw;">
          <span style="font-size: ${pt(bannerFontSize)}; font-weight: 800; color: #f2f2f2; text-shadow: ${glowTextShadow};">${data.photoBanner}</span>
        </div>

        <!-- 7-2. [좌측 컬럼] 현장 사진 영역 (Hold Point 공간 침범 없이 x = 0.3121 ~ 5.7701 고정) -->
        ${hasPhoto2 ? `
          <div style="position: absolute; left: ${pctX(0.3121)}; top: ${pctY(photoStartY)}; width: ${pctW(2.6900)}; height: ${pctH(photoBodyHeight)}; box-sizing: border-box; overflow: hidden; background: #ffffff;">
            ${photo1Url ? `<img src="${photo1Url}" onerror="this.onerror=null; this.src='samples/sample_before.jpg';" style="width: 100%; height: 100%; object-fit: cover; display: block;">` : `<div style="width: 100%; height: 100%; background: #f8fafc; border: 1px solid #000000; display: flex; align-items: center; justify-content: center; color: #64748b; font-size: ${pt(13)};">📸 사진 1</div>`}
          </div>
          <div style="position: absolute; left: ${pctX(3.0801)}; top: ${pctY(photoStartY)}; width: ${pctW(2.6900)}; height: ${pctH(photoBodyHeight)}; box-sizing: border-box; overflow: hidden; background: #ffffff;">
            ${photo2Url ? `<img src="${photo2Url}" onerror="this.onerror=null; this.src='samples/sample_after.jpg';" style="width: 100%; height: 100%; object-fit: cover; display: block;">` : `<div style="width: 100%; height: 100%; background: #f8fafc; border: 1px solid #000000; display: flex; align-items: center; justify-content: center; color: #64748b; font-size: ${pt(13)};">📸 사진 2</div>`}
          </div>
        ` : `
          <div style="position: absolute; left: ${pctX(0.3121)}; top: ${pctY(photoStartY)}; width: ${pctW(bannerWidth)}; height: ${pctH(photoBodyHeight)}; box-sizing: border-box; overflow: hidden; background: #ffffff;">
            ${photo1Url ? `<img src="${photo1Url}" onerror="this.onerror=null; this.src='samples/sample_before.jpg';" style="width: 100%; height: 100%; object-fit: cover; display: block;">` : `<div style="width: 100%; height: 100%; background: #f8fafc; border: 1px solid #000000; display: flex; align-items: center; justify-content: center; color: #64748b; font-size: ${pt(14)};">📸 현장 사진</div>`}
          </div>
        `}

        ${showGuidelineBox ? `
          <div style="position: absolute; left: ${pctX(0.3121)}; top: ${pctY(6.2000)}; width: ${pctW(bannerWidth)}; height: ${pctH(1.0800)}; background: #ffffff; border: 1px solid #000000; padding: 0.3cqw 0.6cqw; box-sizing: border-box;">
            <div style="font-size: ${pt(12)}; font-weight: 800; color: #000000; margin-bottom: 0.15cqw;">${data.guidelineTitle}</div>
            <div style="font-size: ${pt(10.5)}; color: #222222; white-space: pre-line; line-height: 1.3;">${data.guidelineBody}</div>
          </div>
        ` : ''}

        <!-- 7-3. [중앙 컬럼] Hold Point 위반 박스 + 그림 예약 공간 + 초록색 음영 박스 -->
        <div style="position: absolute; left: ${pctX(5.9202)}; top: ${pctY(2.3772)}; width: ${pctW(2.2594)}; height: ${pctH(0.4039)}; background: #ffffff; border-top: 1px solid #000000; border-left: 1px solid #000000; border-right: 1px solid #000000; box-sizing: border-box;"></div>
        <div style="position: absolute; left: ${pctX(5.9748)}; top: ${pctY(2.4207)}; width: ${pctW(0.3150)}; height: ${pctH(0.3168)}; background: #ffffff; border: 1px solid #000000; display: flex; align-items: center; justify-content: center; font-size: ${pt(15)}; font-weight: 900; color: #000000; box-sizing: border-box;">
          ${data.isHoldPoint ? '✔' : ''}
        </div>
        <div style="position: absolute; left: ${pctX(6.2898)}; top: ${pctY(2.4207)}; width: ${pctW(1.8897)}; height: ${pctH(0.3168)}; display: flex; align-items: center; padding-left: 0.3cqw; font-size: ${pt(11)}; font-weight: 800; color: #000000; white-space: nowrap; box-sizing: border-box;">
          Hold Point 위반 (${data.holdPointCode})
        </div>

        <!-- Hold Point 그림 영역 공간 확보 (x = 5.9202, y = 2.7584, w = 2.2712, h = 2.7348) -->
        <div style="position: absolute; left: ${pctX(5.9202)}; top: ${pctY(2.7584)}; width: ${pctW(2.2712)}; height: ${pctH(2.7348)}; box-sizing: border-box; overflow: hidden;">
          ${record.holdPointImage ? `<img src="${record.holdPointImage}" style="width: 100%; height: 100%; object-fit: contain; display: block;">` : ''}
        </div>

        <!-- 초록색 음영 박스 (SHAPE #13: x = 5.9320, y = 5.5054, w = 2.2594, h = 0.3702, #A9D18E @ 60% = #cbe3bb) -->
        <div style="position: absolute; left: ${pctX(5.9320)}; top: ${pctY(5.5054)}; width: ${pctW(2.2594)}; height: ${pctH(0.3702)}; background: rgba(169, 209, 142, 0.6); display: flex; align-items: center; justify-content: center; box-sizing: border-box; white-space: nowrap;">
          ${data.greenBanner ? `<span style="font-size: ${pt(16)}; font-weight: 800; color: #f2f2f2; text-shadow: ${glowTextShadow};">${data.greenBanner}</span>` : ''}
        </div>

        <!-- 7-4. [우측 컬럼] 발생원인 & 개선대책 (x = 8.2448, w = 4.9213) -->
        <!-- 발생원인 (인터뷰 결과) 헤더 (18pt bold) -->
        <div style="position: absolute; left: ${pctX(8.2448)}; top: ${pctY(2.3803)}; width: ${pctW(4.9213)}; height: ${pctH(0.4039)}; background: #ffd966; border: 1px solid #000000; display: flex; align-items: center; justify-content: center; font-size: ${pt(18)}; font-weight: 800; color: #000000; box-sizing: border-box;">
          발생원인 (인터뷰 결과)
        </div>

        <!-- [의견 : ] 박스 (SHAPE #2: x = 8.2448, y = 2.8227, w = 4.9213, h = 1.5748) -->
        <div style="position: absolute; left: ${pctX(8.2448)}; top: ${pctY(2.8227)}; width: ${pctW(4.9213)}; height: ${pctH(1.5748)}; background: #ffffff; border: 1px solid #000000; padding: 0.35cqw 0.6cqw; box-sizing: border-box; overflow: hidden;">
          <div style="font-size: ${pt(14)}; font-weight: 800; color: #181717; margin-bottom: 0.25cqw;">[의견 : 시공관리자 및 근로자]</div>
          <div style="font-size: ${pt(intSz)}; line-height: ${intLineSpacing}; color: #111111; word-break: keep-all;">${data.interviewOpinion}</div>
        </div>

        <!-- [점검단 제안] 헤더 셀 (SHAPE #5: x = 8.2448, y = 4.3979, w = 1.5342, h = 0.3543) -->
        <div style="position: absolute; left: ${pctX(8.2448)}; top: ${pctY(4.3979)}; width: ${pctW(1.5342)}; height: ${pctH(0.3543)}; background: #ffffff; border: 1px solid #000000; display: flex; align-items: center; justify-content: center; font-size: ${pt(14)}; font-weight: 800; color: #181717; box-sizing: border-box;">
          [점검단 제안]
        </div>

        <!-- [점검단 제안] 분류 셀 (SHAPE #6: x = 8.2448, y = 4.7522, w = 1.5342, h = 0.6790) -->
        <div style="position: absolute; left: ${pctX(8.2448)}; top: ${pctY(4.7522)}; width: ${pctW(1.5342)}; height: ${pctH(0.6790)}; background: #ffffff; border: 1px solid #000000; display: flex; flex-direction: column; align-items: center; justify-content: center; box-sizing: border-box;">
          <div style="font-size: ${pt(14)}; font-weight: 800; color: #0000ff;">${data.proposalType}</div>
          <div style="font-size: ${pt(11)}; font-weight: 800; color: #000000; margin-top: 0.1cqw;">${data.proposalSub}</div>
        </div>

        <!-- [점검단 제안] 본문 셀 (SHAPE #4: x = 9.7790, y = 4.3979, w = 3.3871, h = 1.0333) -->
        <div style="position: absolute; left: ${pctX(9.7790)}; top: ${pctY(4.3979)}; width: ${pctW(3.3871)}; height: ${pctH(1.0333)}; background: #ffffff; border: 1px solid #000000; padding: 0.3cqw 0.55cqw; box-sizing: border-box; overflow: hidden;">
          <div style="font-size: ${pt(propSz)}; line-height: ${propLineSpacing}; color: #111111; word-break: keep-all;">${data.proposalContent}</div>
        </div>

        <!-- 개선대책 (현장 협의 결과) 헤더 (SHAPE #8: x = 8.2448, y = 5.4951, w = 4.9213, h = 0.4039, 18pt bold) -->
        <div style="position: absolute; left: ${pctX(8.2448)}; top: ${pctY(5.4951)}; width: ${pctW(4.9213)}; height: ${pctH(0.4039)}; background: #ffd966; border: 1px solid #000000; display: flex; align-items: center; justify-content: center; font-size: ${pt(18)}; font-weight: 800; color: #000000; box-sizing: border-box;">
          개선대책 (현장 협의 결과)
        </div>

        <!-- 개선대책 본문 셀 (SHAPE #11: x = 8.2448, y = 5.9064, w = 3.3858, h = 1.3959) -->
        <div style="position: absolute; left: ${pctX(8.2448)}; top: ${pctY(5.9064)}; width: ${pctW(3.3858)}; height: ${pctH(1.3959)}; background: #ffffff; border: 1px solid #000000; padding: 0.35cqw 0.6cqw; box-sizing: border-box; overflow: hidden;">
          <div style="font-size: ${pt(counterSz)}; font-weight: 700; line-height: ${counterLineSpacing}; color: #000000; word-break: keep-all;">${data.countermeasureContent || ''}</div>
        </div>

        <!-- [PM 판정결과] 헤더 셀 (SHAPE #9: x = 11.6307, y = 5.9064, w = 1.5354, h = 0.3329) -->
        <div style="position: absolute; left: ${pctX(11.6307)}; top: ${pctY(5.9064)}; width: ${pctW(1.5354)}; height: ${pctH(0.3329)}; background: #ffffff; border: 1px solid #000000; display: flex; align-items: center; justify-content: center; font-size: ${pt(14)}; font-weight: 800; color: #181717; box-sizing: border-box;">
          [PM 판정결과]
        </div>

        <!-- [PM 판정결과] 값 셀 (SHAPE #10: x = 11.6307, y = 6.2394, w = 1.5354, h = 1.0630) -->
        <div style="position: absolute; left: ${pctX(11.6307)}; top: ${pctY(6.2394)}; width: ${pctW(1.5354)}; height: ${pctH(1.0630)}; background: #ffffff; border: 1px solid #000000; display: flex; flex-direction: column; align-items: center; justify-content: center; box-sizing: border-box;">
          <div style="font-size: ${pt(14)}; font-weight: 800; color: #0000ff;">${data.pmVerdictType || ''}</div>
          <div style="font-size: ${pt(11)}; font-weight: 800; color: #000000; margin-top: 0.1cqw;">${data.pmVerdictSub || ''}</div>
        </div>
      </div>
    `;
  }

  /**
   * [경부적합] 브라우저 실시간 16:9 슬라이드 프리뷰 HTML 렌더링 (템플릿/부적합장표(경부적합).pptx 100% 정밀 일치)
   */
  function renderMinorInspectionSheetHTML(record, data, options = {}) {
    const { photo1Url = '', photo2Url = '' } = options;

    const pctX = (x) => `${((x / 13.3333) * 100).toFixed(4)}%`;
    const pctY = (y) => `${((y / 7.5000) * 100).toFixed(4)}%`;
    const pctW = (w) => `${((w / 13.3333) * 100).toFixed(4)}%`;
    const pctH = (h) => `${((h / 7.5000) * 100).toFixed(4)}%`;
    const pt = (n) => `${(n * 0.104167).toFixed(4)}cqw`;
    const glowTextShadow = '0 0 4px rgba(0,0,0,0.85), -0.6px -0.6px 1.6px rgba(0,0,0,0.9), 0.6px 0.6px 1.6px rgba(0,0,0,0.9), -0.6px 0.6px 1.6px rgba(0,0,0,0.9), 0.6px -0.6px 1.6px rgba(0,0,0,0.9)';

    const cleanSub = (data.subcontractor || '').replace(/[\r\n\t]+/g, ' ').trim();
    const cleanMain = (data.mainContent || '').replace(/[\r\n\t]+/g, '  ').trim();
    const contentFontSize = calcSingleLineFontSize(`    - ${cleanMain}`, 12.10, 17, 11);
    const leftBannerW = 5.4580;
    const leftBannerSz = calcSingleLineFontSize(data.photoBanner, leftBannerW, 16, 9.5);
    const rightBannerW = 4.4082;

    return `
      <div id="jangpyoSlidePreview" data-severity="경부적합" style="
        width: 100%;
        aspect-ratio: 16 / 9;
        position: relative;
        background: #ffffff;
        border: 3px solid #8faadc;
        border-radius: 2px;
        box-shadow: 0 4px 20px rgba(0,0,0,0.18);
        box-sizing: border-box;
        overflow: hidden;
        container-type: inline-size;
        font-family: 'Malgun Gothic', '맑은 고딕', sans-serif;
        color: #000000;
        user-select: none;
      ">
        <!-- 1. 최상단 행: 위험성평가 (x = 0.1031, y = 0.1003, w = 2.4836, h = 0.8331, #bdd7ee, 24pt bold) -->
        <div style="position: absolute; left: ${pctX(0.1031)}; top: ${pctY(0.1003)}; width: ${pctW(2.4836)}; height: ${pctH(0.8331)}; background: #bdd7ee; border: 1px solid #000000; display: flex; align-items: center; justify-content: center; font-size: ${pt(24)}; font-weight: 800; color: #000000; box-sizing: border-box;">
          위험성평가
        </div>

        <!-- 2. 최상단 행 우측 타이틀 (x = 2.5867, y = 0.1003, w = 10.6401, h = 0.8331, 18pt bold, 테두리 없음) -->
        <div style="position: absolute; left: ${pctX(2.5867)}; top: ${pctY(0.1003)}; width: ${pctW(10.6401)}; height: ${pctH(0.8331)}; display: flex; align-items: center; padding-left: 0.7cqw; font-size: ${pt(18)}; font-weight: 800; color: #000000; white-space: nowrap; box-sizing: border-box;">
          위험성평가 확인 - [전사 안전보건경영규칙] 유해·위험요인 파악 및 위험성 관리
        </div>

        <!-- 3. 부적합 사항 라벨 (x = 0.1031, y = 1.0000, w = 0.8364, h = 1.1806, #ffd966, 18pt bold) -->
        <div style="position: absolute; left: ${pctX(0.1031)}; top: ${pctY(1.0000)}; width: ${pctW(0.8364)}; height: ${pctH(1.1806)}; background: #ffd966; border: 1px solid #000000; display: flex; align-items: center; justify-content: center; font-size: ${pt(18)}; font-weight: 800; color: #000000; text-align: center; line-height: 1.15; box-sizing: border-box;">
          부적합<br>사&nbsp;&nbsp;&nbsp;항
        </div>

        <!-- 4. 부적합 사항 본문 (x = 0.9395, y = 1.0000, w = 12.2873, h = 1.1806, 17pt bold) -->
        <div style="position: absolute; left: ${pctX(0.9395)}; top: ${pctY(1.0000)}; width: ${pctW(12.2873)}; height: ${pctH(1.1806)}; background: #ffffff; border: 1px solid #000000; display: flex; flex-direction: column; justify-content: center; padding: 0 0.7cqw; box-sizing: border-box;">
          <div style="font-size: ${pt(17)}; font-weight: 800; color: #000000; line-height: 1.35; white-space: nowrap;">
            ■ 위험요소 안전대책 이행 확인 [<span style="color: #0000ff;">협력사: ${cleanSub}</span>]
          </div>
          <div style="font-size: ${pt(contentFontSize)}; font-weight: 800; color: #000000; line-height: 1.35; padding-left: 1.5cqw; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
            - ${cleanMain}
          </div>
        </div>

        <!-- 5. 부적합 사례 헤더 (x = 0.1031, y = 2.1806, w = 13.1237, h = 0.3639, #ffd966, 16pt bold) -->
        <div style="position: absolute; left: ${pctX(0.1031)}; top: ${pctY(2.1806)}; width: ${pctW(13.1237)}; height: ${pctH(0.3639)}; background: #ffd966; border: 1px solid #000000; display: flex; align-items: center; justify-content: center; font-size: ${pt(16)}; font-weight: 800; color: #000000; box-sizing: border-box;">
          부적합 사례
        </div>

        <!-- 6. 하단 사례 컨테이너 (x = 0.1031, y = 2.5445, w = 13.1237, h = 4.8528) -->
        <div style="position: absolute; left: ${pctX(0.1031)}; top: ${pctY(2.5445)}; width: ${pctW(13.1237)}; height: ${pctH(4.8528)}; background: #ffffff; border: 1px solid #000000; box-sizing: border-box;"></div>

        <!-- 6-1. 좌측 적색 음영 배너 (SHAPE #3: x = 0.8685, y = 2.8276, w = 5.4580, h = 0.3702, #C00000 @ 60% = #d96666) -->
        <div style="position: absolute; left: ${pctX(0.8685)}; top: ${pctY(2.8276)}; width: ${pctW(leftBannerW)}; height: ${pctH(0.3702)}; background: rgba(192, 0, 0, 0.6); display: flex; align-items: center; justify-content: center; box-sizing: border-box; white-space: nowrap; padding: 0 0.4cqw;">
          <span style="font-size: ${pt(leftBannerSz)}; font-weight: 800; color: #f2f2f2; text-shadow: ${glowTextShadow};">${data.photoBanner}</span>
        </div>

        <!-- 6-2. 좌측 현장 사진 (x = 0.8685, y = 3.2500, w = 5.4580, h = 3.9500) -->
        <div style="position: absolute; left: ${pctX(0.8685)}; top: ${pctY(3.2500)}; width: ${pctW(leftBannerW)}; height: ${pctH(3.9500)}; box-sizing: border-box; overflow: hidden; background: #ffffff;">
          ${photo1Url ? `<img src="${photo1Url}" onerror="this.onerror=null; this.src='samples/sample_before.jpg';" style="width: 100%; height: 100%; object-fit: cover; display: block;">` : `<div style="width: 100%; height: 100%; background: #f8fafc; border: 1px solid #000000; display: flex; align-items: center; justify-content: center; color: #64748b; font-size: ${pt(14)};">📸 현장 사진</div>`}
        </div>

        <!-- 6-3. 우측 피치/오렌지 음영 배너 (SHAPE #2: x = 7.8740, y = 2.8276, w = 4.4082, h = 0.3702, #F8CBAD @ 60% = #fbe0ce) -->
        <div style="position: absolute; left: ${pctX(7.8740)}; top: ${pctY(2.8276)}; width: ${pctW(rightBannerW)}; height: ${pctH(0.3702)}; background: rgba(248, 203, 173, 0.6); display: flex; align-items: center; justify-content: center; box-sizing: border-box; white-space: nowrap;">
          <span style="font-size: ${pt(16)}; font-weight: 800; color: #f2f2f2; text-shadow: ${glowTextShadow};">[위험성평가표]</span>
        </div>

        <!-- 6-4. 우측 위험성평가표 영역 (x = 7.8740, y = 3.2500, w = 4.4082, h = 3.9500) -->
        <div style="position: absolute; left: ${pctX(7.8740)}; top: ${pctY(3.2500)}; width: ${pctW(rightBannerW)}; height: ${pctH(3.9500)}; box-sizing: border-box; overflow: hidden; background: transparent;">
          ${photo2Url ? `<img src="${photo2Url}" onerror="this.onerror=null; this.style.display='none';" style="width: 100%; height: 100%; object-fit: contain; display: block;">` : ''}
        </div>
      </div>
    `;
  }

  /**
   * 브라우저 실시간 16:9 슬라이드 프리뷰 HTML 렌더링 (중부적합 / 경부적합 자동 분기)
   */
  function renderInspectionSheetHTML(record, options = {}) {
    const { rulesFromTaxonomy = [] } = options;
    const data = normalizeJangpyoData(record, rulesFromTaxonomy, options);
    if (data.isMajor) {
      return renderMajorInspectionSheetHTML(record, data, options);
    }
    return renderMinorInspectionSheetHTML(record, data, options);
  }

  // ── 통계 기반 시사점 자동 도출 ──
  function extractInsights(records) {
    const total = records.length;
    if (!total) return ['분석할 부적합 점검 데이터가 충분하지 않습니다.'];

    const typeCount = {};
    records.forEach(r => {
      const t = r.type || '기타';
      typeCount[t] = (typeCount[t] || 0) + 1;
    });

    const sortedTypes = Object.entries(typeCount).sort((a, b) => b[1] - a[1]);
    const topType = sortedTypes[0] || ['기타', 0];
    const topPct = total ? Math.round((topType[1] / total) * 100) : 0;

    const unfixed = records.filter(r => r.status !== '조치완료').length;
    const insights = [];

    insights.push(`[최다 위험요인 집중 관리] 전체 지적 ${total}건 중 '${topType[0]}' 유형이 ${topType[1]}건(${topPct}%)으로 가장 높게 나타났습니다. 해당 공종 및 설비에 대한 특별 TBM과 일일 패트롤을 집중 실시해야 합니다.`);

    if (unfixed > 0) {
      const unfixPct = Math.round((unfixed / total) * 100);
      insights.push(`[미조치 항목 긴급 개선] 전체 부적합 중 ${unfixed}건(${unfixPct}%)이 아직 미조치 상태입니다. 후속 공정 투입 전 협력사 안전관리자와 합동으로 시정 조치를 완료하고 재발 방지 대책을 수립해야 합니다.`);
    } else {
      insights.push(`[조치 완료 우수] 지적된 모든 부적합 항목(${total}건)의 현장 시정 조치가 100% 완료되었습니다. 개선된 상태가 지속 유지되도록 정기 확인이 필요합니다.`);
    }

    let causeSys = 0;
    records.forEach(r => {
      if ((r.causes || []).includes('시스템적') || (r.mgmtCauses || []).includes('계획 미수립')) causeSys++;
    });
    if (causeSys > total * 0.25) {
      insights.push(`[작업계획 및 관리체계 보완] 계획 미수립 또는 시스템적 원인 비율이 25%를 상회함. 협력업체 사전 작업계획서 작성 및 위험성평가 이행 점검을 대폭 강화해야 합니다.`);
    }

    return insights;
  }

  // ── 회의용 PPT 프레젠테이션 파일 생성 (100% 맑은 고딕 서식) ──
  async function generatePresentation(options = {}) {
    const PptxClass = (typeof window !== 'undefined' && window.PptxGenJS) || (typeof PptxGenJS !== 'undefined' ? PptxGenJS : null);
    if (!PptxClass) {
      throw new Error('PptxGenJS 라이브러리가 로드되지 않았습니다.');
    }

    const { records = [], siteName = '전체 현장', month = '2026-10', inspector = '안전관리자', loadPhotoBase64, download = true } = options;
    const pptx = new PptxClass();
    pptx.defineLayout({ name: 'WIDE_16_9', width: 13.333, height: 7.5 });
    pptx.layout = 'WIDE_16_9';

    const C_NAVY = '1E3A8A';
    const C_BLUE = '2563EB';
    const C_GREEN = '16A34A';
    const C_RED = 'DC2626';
    const C_BG_LIGHT = 'F8FAFC';

    // ── 슬라이드 1: 표지 ──
    const s1 = pptx.addSlide();
    s1.background = { color: C_NAVY };
    s1.addText('현장 패트롤 안전점검 및 부적합 분석', {
      x: 1.0, y: 2.2, w: 11.3, h: 1.2, fontSize: 34, bold: true, color: 'FFFFFF', fontFace: FONT_MALGUN
    });
    s1.addText('데이터 기반 위험요인 분석 및 개선 대책 회의', {
      x: 1.0, y: 3.4, w: 11.3, h: 0.8, fontSize: 20, color: '93C5FD', fontFace: FONT_MALGUN
    });
    s1.addText(`현장명: ${siteName} | 대상기간: ${month} | 작성자: ${inspector}`, {
      x: 1.0, y: 6.0, w: 11.3, h: 0.6, fontSize: 14, color: 'CBD5E1', fontFace: FONT_MALGUN
    });

    // ── 슬라이드 2: 패트롤 점검 총괄 현황 ──
    const s2 = pptx.addSlide();
    s2.addText(`1. 패트롤 안전점검 총괄 현황 (${month})`, { x: 1.0, y: 0.8, w: 11.3, h: 0.6, fontSize: 24, bold: true, color: C_NAVY, fontFace: FONT_MALGUN });

    const total = records.length;
    const unfixed = records.filter(r => r.status !== '조치완료').length;
    const fixed = total - unfixed;
    const fixRate = total ? Math.round((fixed / total) * 100) : 0;

    s2.addText(`총 지적 건수\n\n${total} 건`, {
      x: 1.0, y: 1.8, w: 3.5, h: 4.5, fontSize: 24, bold: true, color: C_BLUE, fontFace: FONT_MALGUN,
      fill: { color: C_BG_LIGHT }, align: 'center', lineSpacing: 28,
      border: { pt: 1, color: 'E2E8F0' }
    });
    s2.addText(`개선 조치 완료\n\n${fixed} 건`, {
      x: 4.9, y: 1.8, w: 3.5, h: 4.5, fontSize: 24, bold: true, color: C_GREEN, fontFace: FONT_MALGUN,
      fill: { color: C_BG_LIGHT }, align: 'center', lineSpacing: 28,
      border: { pt: 1, color: 'E2E8F0' }
    });
    s2.addText(`미조치 (진행중)\n\n${unfixed} 건\n(조치율 ${fixRate}%)`, {
      x: 8.8, y: 1.8, w: 3.5, h: 4.5, fontSize: 24, bold: true, color: unfixed ? C_RED : C_GREEN, fontFace: FONT_MALGUN,
      fill: { color: C_BG_LIGHT }, align: 'center', lineSpacing: 28,
      border: { pt: 1, color: 'E2E8F0' }
    });

    // ── 슬라이드 3: 유형별/원인별 통계 분석 ──
    const s3 = pptx.addSlide();
    s3.addText(`2. 부적합 유형 및 발생원인 분포 (${month})`, { x: 1.0, y: 0.8, w: 11.3, h: 0.6, fontSize: 24, bold: true, color: C_NAVY, fontFace: FONT_MALGUN });

    const typeCount = {};
    records.forEach(r => { typeCount[r.type || '기타'] = (typeCount[r.type || '기타'] || 0) + 1; });
    const chartData = [
      {
        name: '부적합 건수',
        labels: Object.keys(typeCount),
        values: Object.values(typeCount)
      }
    ];

    if (Object.keys(typeCount).length) {
      s3.addChart(pptx.ChartType.bar, chartData, {
        x: 1.0, y: 1.8, w: 6.2, h: 4.8,
        chartColors: [C_BLUE],
        showValue: true
      });
    }

    let cHuman = 0, cMat = 0, cPlan1 = 0, cPlan2 = 0;
    records.forEach(r => {
      const causes = r.causes || [];
      const mgmt = r.mgmtCauses || [];
      if (causes.includes('인적') || causes.includes('불안전 행동') || mgmt.includes('불안전 행동')) cHuman++;
      if (causes.includes('물적') || causes.includes('불안전 상태') || mgmt.includes('불안전 상태')) cMat++;
      if (causes.includes('계획 미수립') || mgmt.includes('계획 미수립')) cPlan1++;
      if (causes.includes('계획 미이행') || mgmt.includes('계획 미이행')) cPlan2++;
    });

    const causeRows = [
      [{ text: '4대 발생요인 구분', options: { bold: true, fill: { color: 'CBD5E1' }, fontFace: FONT_MALGUN } }, { text: '지적 건수', options: { bold: true, fill: { color: 'CBD5E1' }, fontFace: FONT_MALGUN } }],
      [{ text: '계획 미수립 (사전조사/계획서 미흡)', options: { fontFace: FONT_MALGUN } }, { text: `${cPlan1} 건`, options: { fontFace: FONT_MALGUN } }],
      [{ text: '계획 미이행 (기준절차 미준수)', options: { fontFace: FONT_MALGUN } }, { text: `${cPlan2} 건`, options: { fontFace: FONT_MALGUN } }],
      [{ text: '불안전 행동 (근로자 부주의/보호구)', options: { fontFace: FONT_MALGUN } }, { text: `${cHuman} 건`, options: { fontFace: FONT_MALGUN } }],
      [{ text: '불안전 상태 (방호시설/설비 결함)', options: { fontFace: FONT_MALGUN } }, { text: `${cMat} 건`, options: { fontFace: FONT_MALGUN } }]
    ];

    s3.addTable(causeRows, {
      x: 7.6, y: 2.2, w: 4.7,
      fontSize: 12, rowH: 0.65, border: { pt: 1, color: 'E2E8F0' }, align: 'center'
    });

    // ── 슬라이드 4: 주요 지적 및 조치 사례 (사진 포함) ──
    const s4 = pptx.addSlide();
    s4.addText(`3. 현장 주요 지적 및 조치 사례 (${month})`, { x: 1.0, y: 0.8, w: 11.3, h: 0.5, fontSize: 24, bold: true, color: C_NAVY, fontFace: FONT_MALGUN });

    const sample = records[0];
    if (sample) {
      s4.addText(`사례: [${sample.site || '현장'}] ${sample.content || ''} (${sample.location || '-'})`, {
        x: 1.0, y: 1.4, w: 11.3, h: 0.4, fontSize: 16, bold: true, color: C_BLUE, fontFace: FONT_MALGUN
      });

      let b64Before = null, b64After = null;
      if (loadPhotoBase64 && sample.photos && sample.photos[0]) {
        try { b64Before = await loadPhotoBase64(sample.photos[0]); } catch (e) {}
      }
      if (loadPhotoBase64 && sample.fix && sample.fix.photo) {
        try { b64After = await loadPhotoBase64(sample.fix.photo); } catch (e) {}
      }

      if (b64Before) {
        s4.addImage({ data: b64Before, x: 1.2, y: 2.1, w: 5.0, h: 3.8 });
        s4.addText('❌ 부적합 지적 상태', { x: 1.2, y: 6.1, w: 5.0, h: 0.4, fontSize: 14, bold: true, color: C_RED, align: 'center', fontFace: FONT_MALGUN });
      } else {
        s4.addText('부적합 사진', { x: 1.2, y: 2.1, w: 5.0, h: 3.8, fill: { color: 'E2E8F0' }, align: 'center', fontFace: FONT_MALGUN });
      }

      if (b64After) {
        s4.addImage({ data: b64After, x: 7.1, y: 2.1, w: 5.0, h: 3.8 });
        s4.addText('✅ 조치 완료 상태', { x: 7.1, y: 6.1, w: 5.0, h: 0.4, fontSize: 14, bold: true, color: C_GREEN, align: 'center', fontFace: FONT_MALGUN });
      } else {
        s4.addText(sample.fix && sample.fix.content ? `조치내용:\n${sample.fix.content}` : '미조치 상태', {
          x: 7.1, y: 2.1, w: 5.0, h: 3.8, fill: { color: 'E2E8F0' }, align: 'center', fontSize: 15, fontFace: FONT_MALGUN
        });
      }
    }

    // ── 슬라이드 5: 데이터 기반 핵심 시사점 및 대책 ──
    const s5 = pptx.addSlide();
    s5.addText(`4. 데이터 기반 종합 시사점 및 대책 (${month})`, { x: 1.0, y: 0.8, w: 11.3, h: 0.6, fontSize: 24, bold: true, color: C_NAVY, fontFace: FONT_MALGUN });

    const insights = extractInsights(records);
    const insightLines = insights.map((msg, i) => `${i + 1}. ${msg}`).join('\n\n');

    s5.addText(insightLines, {
      x: 1.0, y: 1.8, w: 11.3, h: 4.8,
      fontSize: 15, color: '1E293B', lineSpacing: 26, fontFace: FONT_MALGUN,
      fill: { color: C_BG_LIGHT }, margin: 24, border: { pt: 1, color: 'E2E8F0' }
    });

    const safeMonthStr = (month || '전체기간').replace(/[\s~:\/\\]+/g, '_');
    const filename = `안전회의_패트롤부적합분석_${safeMonthStr}_${siteName}.pptx`;
    const pptxBlob = await pptx.write({ outputType: 'blob' });
    const mimeBlob = new Blob([pptxBlob], { 
      type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' 
    });

    if (download !== false) {
      if (typeof window !== 'undefined' && window.SafeUtil && window.SafeUtil.downloadBlob) {
        window.SafeUtil.downloadBlob(mimeBlob, filename);
      } else if (typeof document !== 'undefined') {
        const url = URL.createObjectURL(mimeBlob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
          try {
            if (a.parentNode) a.parentNode.removeChild(a);
            URL.revokeObjectURL(url);
          } catch (e) {}
        }, 60000);
      }
    }
    return { blob: mimeBlob, filename };
  }

  return {
    generateInspectionSheetPPT,
    renderInspectionSheetHTML,
    normalizeJangpyoData,
    addInspectionSheetSlide,
    generatePresentation,
    extractInsights
  };
});
