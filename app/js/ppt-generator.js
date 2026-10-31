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

  // 색상 팔레트 (점검장표 템플릿 원본 XML 100% 동일 일치 색상)
  const C_BORDER = '000000';         // 대형 테두리 및 표 내부 실선 100% 검은색 (#000000, 0.75pt)
  const C_HEADER_BG = 'BDD7EE';       // 시설물/법규 헤더 연청색 (#BDD7EE, Office accent5 40% mod 60% off)
  const C_STD_CONTENT_BG = 'DEEBF7';  // 관련기준 내용 연청색 음영 (#DEEBF7, Office accent5 20% mod 80% off)
  const C_YELLOW_BG = 'FFD966';       // 부적합개요/원인/대책 헤더 골드옐로우 (#FFD966, Office accent4 60% mod 40% off)
  const C_ACC_YELLOW_FILL = 'FFFFFF'; // 사고유형(떨어짐) 칸 음영 없음/순수 흰색 (#FFFFFF, 원본 XML noFill 100% 일치)
  const C_ACC_BORDER = 'FFC000';      // 사고유형(떨어짐) 칸 3pt 황색 테두리 (#FFC000)
  const C_TITLE_BLUE = '002060';      // 시설물/법규 및 강조 진한 딥네이비 (#002060)
  const C_RED = 'C00000';             // 중부적합 및 위험요인 선명한 적색 (#C00000)
  const C_ORANGE = 'ED7D31';          // 사고유형 및 이행 포인트 오렌지 (#ED7D31)
  const C_GRAY_TEXT = '595959';       // 보조 텍스트
  const C_DARK_TEXT = '000000';       // 본문 진한 검정 (#000000)
  const C_ACCENT_BLUE = '4472C4';     // 템플릿 표준 강조 블루 (#4472C4)

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

    // 사고유형 파싱 및 포맷팅 (예: "넘어짐(전도:사람)" -> main: "넘어짐", sub: "(전도 : 사람)")
    const rawType = String(type).trim();
    let typeMain = rawType;
    let typeSub = '';
    const typeMatch = rawType.match(/^([^(]+)\s*\(([^)]+)\)$/);
    if (typeMatch) {
      typeMain = typeMatch[1].trim();
      let inner = typeMatch[2].trim().replace(/\s*:\s*/g, ' : ');
      typeSub = `(${inner})`;
    }

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

    // 관련 법령 및 수칙 내용
    let lawTitle = r.law || (r.basis && r.basis.law) || '';
    let lawBody = '';

    const rawContent = r.content || '';
    const text = `${rawContent} ${r.item || ''} ${r.agent || ''} ${r.workMethod || ''} ${r.workName || ''}`;
    if (text.includes('양중') || text.includes('크레인') || text.includes('줄걸이') || text.includes('호이스트') || text.includes('유도로프') || text.includes('수평양중')) {
      lawTitle = lawTitle || '전사 안전보건지침[줄걸이작업] 7.1.1 일반사항';
      lawBody = '화물은 유도로프를 통해 유도하고 손으로 밀거나 당기는 행위를 금지하며 화물의 양중높이에 따라 적정한 길이를 가진 유도로프를 사용해야 한다.';
    } else if (text.includes('비계') || text.includes('난간') || text.includes('작업발판') || text.includes('안전난간') || text.includes('단부')) {
      lawTitle = lawTitle || '산업안전보건기준에 관한 규칙 제56조(작업발판의 구조), 제13조(안전난간의 구조 및 요건)';
      lawBody = '작업발판은 틈새가 없도록 전면 설치하고, 발판 단부에는 상부난간대 및 중간난간대를 견고히 설치하여 근로자 추락을 방지해야 한다.';
    } else if (text.includes('개구부') || text.includes('덮개')) {
      lawTitle = lawTitle || '산업안전보건기준에 관한 규칙 제59조(추락방지조치)';
      lawBody = '바닥 개구부에는 충분한 강도를 가진 덮개를 뒤집히거나 벗겨지지 않도록 고정 설치하고 "추락주의" 위험표지를 부착해야 한다.';
    } else if (text.includes('전기') || text.includes('조명') || text.includes('투광등') || text.includes('차단기') || text.includes('전선')) {
      lawTitle = lawTitle || '산업안전보건기준에 관한 규칙 제304조(누전차단기 등의 설치)';
      lawBody = '이동형 전열기구 및 투광등 연결 전선에는 감전방지용 누전차단기를 접속하고 전선 피복 손상 여부를 사전 점검해야 한다.';
    } else if (text.includes('사다리') || text.includes('말비계') || text.includes('우마')) {
      lawTitle = lawTitle || '산업안전보건기준에 관한 규칙 제24조(사다리식 통로 등의 구조)';
      lawBody = '이동식 사다리는 평탄한 바닥에 전도방지조치를 하고 최상부 발판 작업 금지 및 안전모·안전대를 필히 착용해야 한다.';
    } else {
      lawTitle = lawTitle || '산업안전보건기준에 관한 규칙 제38조(사전조사 및 작업계획서의 작성 등)';
      lawBody = '작업 시작 전 위험요인을 사전 조사하고 작업계획서를 작성하여 그 계획에 따라 안전하게 작업을 지휘·감독해야 한다.';
    }

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
      mainContentParts.prefix = parts[0].trim() + ' ↔ ';
      mainContentParts.highlight = parts[1].trim();
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
   * PptxGenJS 단일 슬라이드에 점검장표 레이아웃 추가 (템플릿/부적합 장표.pptx 100% 동일 일치)
   */
  async function addInspectionSheetSlide(pptx, record, options = {}) {
    const { loadPhotoBase64, rulesFromTaxonomy = [] } = options;
    const data = normalizeJangpyoData(record, rulesFromTaxonomy);

    const slide = pptx.addSlide();
    slide.background = { color: 'FFFFFF' };

    // ── 1. 최상단 행 (y = 0.163, h = 0.914, 전체 너비 13.02 in: x = 0.120 ~ 13.140) ──
    // 1) 시설물/법규 (x = 0.120, w = 1.791, h = 0.914)
    slide.addText('시설물/법규', {
      x: 0.120, y: 0.163, w: 1.791, h: 0.914,
      fill: { color: C_HEADER_BG }, line: { color: C_BORDER, width: 0.75 },
      fontFace: FONT_MALGUN, fontSize: 18, bold: true, color: '000000',
      align: 'center', valign: 'middle'
    });

    // 2) 사고유형 & 부적합등급 (x = 1.967, w = 1.568, h = 0.914, 순수 흰색 배경 + 3pt 황색 테두리)
    // 사용자 지시: "1. 떨어짐 칸 안에 음영처리는 없어. 원본 확인해", "2. 떨어짐 그 글씨의 글자크기는 18인데, 원본확인해"
    // 원본 템플릿(표 17): <a:noFill/>, 추락 [중부적합] sz="1800" (18pt)
    if (data.typeSub) {
      slide.addText([
        { text: `${data.typeMain}\n`, options: { fontSize: 18, bold: true, color: '000000', fontFace: FONT_MALGUN } },
        { text: `${data.typeSub}\n`, options: { fontSize: 11, bold: true, color: '333333', fontFace: FONT_MALGUN } },
        { text: `[${data.severity}]`, options: { fontSize: 18, bold: true, color: '000000', fontFace: FONT_MALGUN } }
      ], {
        x: 1.967, y: 0.163, w: 1.568, h: 0.914,
        fill: { color: 'FFFFFF' }, line: { color: C_ACC_BORDER, width: 3.0 },
        align: 'center', valign: 'middle', lineSpacingMultiple: 0.92, inset: 0.01
      });
    } else {
      slide.addText([
        { text: `${data.typeMain}\n`, options: { fontSize: 18, bold: true, color: '000000', fontFace: FONT_MALGUN } },
        { text: `[${data.severity}]`, options: { fontSize: 18, bold: true, color: '000000', fontFace: FONT_MALGUN } }
      ], {
        x: 1.967, y: 0.163, w: 1.568, h: 0.914,
        fill: { color: 'FFFFFF' }, line: { color: C_ACC_BORDER, width: 3.0 },
        align: 'center', valign: 'middle', lineSpacingMultiple: 1.15, inset: 0.02
      });
    }

    // 3) 관련기준 라벨 (x = 3.592, w = 0.684, h = 0.914, 순수 흰색 배경)
    slide.addText('관련\n기준', {
      x: 3.592, y: 0.163, w: 0.684, h: 0.914,
      fill: { color: 'FFFFFF' }, line: { color: C_BORDER, width: 0.75 },
      fontFace: FONT_MALGUN, fontSize: 14, bold: true, color: '000000',
      align: 'center', valign: 'middle', lineSpacingMultiple: 1.15
    });

    // 4) 관련기준 내용 (x = 4.276, w = 5.832, h = 0.914, 외곽 순수 흰색 배경)
    // 사용자 지시: "2. 원본에는 칸으로 구분되어 있지 않아. 확인해"
    // 원본 템플릿(표 19): 단일 셀로 구성되어 있으며 제목과 본문 사이에 가로 구분선이 전혀 없음!
    slide.addShape(pptx.ShapeType.rect, {
      x: 4.276, y: 0.163, w: 5.832, h: 0.914,
      fill: { color: 'FFFFFF' }, line: { color: C_BORDER, width: 0.75 }
    });
    // 기준 제목 (음영처리 전혀 없음, 순수 흰색, 구분선 없음)
    const lawTitleFontSize = calcSingleLineFontSize(data.lawTitle, 5.832, 13, 9);
    slide.addText(data.lawTitle, {
      x: 4.276, y: 0.163, w: 5.832, h: 0.317,
      fontFace: FONT_MALGUN, fontSize: lawTitleFontSize, bold: true, color: '000000',
      align: 'left', valign: 'middle', wrap: false, inset: 0.06
    });
    // 기준 본문 (칸 전체가 아니라 칸 내부 중앙에 연청색 #DEEBF7 음영 박스를 두고 그 안에 텍스트 표시)
    slide.addShape(pptx.ShapeType.rect, {
      x: 4.380, y: 0.495, w: 5.624, h: 0.550,
      fill: { color: C_STD_CONTENT_BG }, line: { color: C_STD_CONTENT_BG, width: 0 }
    });
    const lawBodyFontSize = data.lawBody.length > 80 ? 11 : (data.lawBody.length > 55 ? 11.5 : 12.5);
    slide.addText(data.lawBody, {
      x: 4.380, y: 0.495, w: 5.624, h: 0.550,
      fontFace: FONT_MALGUN, fontSize: lawBodyFontSize, color: '111111',
      align: 'left', valign: 'middle', inset: 0.06, lineSpacingMultiple: 1.15
    });

    // 5) 4대 발생요인 (x = 10.165, y = 0.163, w = 2.975, h = 0.914, 4분면 셀, 0.75pt 검은색 테두리)
    slide.addShape(pptx.ShapeType.rect, {
      x: 10.165, y: 0.163, w: 2.975, h: 0.914,
      fill: { color: 'FFFFFF' }, line: { color: C_BORDER, width: 0.75 }
    });
    slide.addShape(pptx.ShapeType.line, {
      x: 10.165, y: 0.620, w: 2.975, h: 0,
      line: { color: C_BORDER, width: 0.5 }
    });
    slide.addShape(pptx.ShapeType.line, {
      x: 11.652, y: 0.163, w: 0, h: 0.914,
      line: { color: C_BORDER, width: 0.5 }
    });
    slide.addText([
      { text: data.isUnplanned ? '☑ ' : '☐ ', options: { fontSize: 16, bold: true, color: '000000', fontFace: FONT_MALGUN } },
      { text: '계획 미수립', options: { fontSize: 14, bold: true, color: '000000', fontFace: FONT_MALGUN } }
    ], { x: 10.165, y: 0.163, w: 1.487, h: 0.457, align: 'center', valign: 'middle', wrap: false, margin: 0 });

    slide.addText([
      { text: data.isUnexecuted ? '☑ ' : '☐ ', options: { fontSize: 16, bold: true, color: '000000', fontFace: FONT_MALGUN } },
      { text: '계획 미이행', options: { fontSize: 14, bold: true, color: '000000', fontFace: FONT_MALGUN } }
    ], { x: 11.652, y: 0.163, w: 1.487, h: 0.457, align: 'center', valign: 'middle', wrap: false, margin: 0 });

    slide.addText([
      { text: data.isAction ? '☑ ' : '☐ ', options: { fontSize: 16, bold: true, color: '000000', fontFace: FONT_MALGUN } },
      { text: '불안전 행동', options: { fontSize: 14, bold: true, color: '000000', fontFace: FONT_MALGUN } }
    ], { x: 10.165, y: 0.620, w: 1.487, h: 0.457, align: 'center', valign: 'middle', wrap: false, margin: 0 });

    slide.addText([
      { text: data.isCondition ? '☑ ' : '☐ ', options: { fontSize: 16, bold: true, color: '000000', fontFace: FONT_MALGUN } },
      { text: '불안전 상태', options: { fontSize: 14, bold: true, color: '000000', fontFace: FONT_MALGUN } }
    ], { x: 11.652, y: 0.620, w: 1.487, h: 0.457, align: 'center', valign: 'middle', wrap: false, margin: 0 });

    // ── 2. 대형 통합 컨테이너 (x = 0.120, y = 1.125, w = 13.020, h = 6.168, 바닥 y = 7.293) ──
    slide.addShape(pptx.ShapeType.rect, {
      x: 0.120, y: 1.125, w: 13.020, h: 6.168,
      fill: { color: 'FFFFFF' }, line: { color: C_BORDER, width: 0.75 }
    });

    // '부적합 개요' 라벨 (x = 0.120, y = 1.125, w = 1.090, h = 0.812)
    // 사용자 지시: "5. 부적합 개요의 글자크기는 18이고, 부적합은 붙어 있어. 원본 확인해"
    // 원본 템플릿(표 2): Line 1: '부적합' (글자 붙어있음), Line 2: '개   요', 글자크기 18pt bold
    slide.addText([
      { text: '부적합\n', options: { fontSize: 18, bold: true, color: '000000', fontFace: FONT_MALGUN } },
      { text: '개   요', options: { fontSize: 18, bold: true, color: '000000', fontFace: FONT_MALGUN } }
    ], {
      x: 0.120, y: 1.125, w: 1.090, h: 0.812,
      fill: { color: C_YELLOW_BG }, line: { color: C_BORDER, width: 0.75 },
      align: 'center', valign: 'middle', lineSpacingMultiple: 1.15
    });

    // 부적합 개요 1행: 5개 독립 셀 (x = 1.210 ~ 13.140, 각 w = 2.386, h = 0.406)
    const metaCols = [
      { label: '협력사 : ', val: data.subcontractor, w: 2.386, x: 1.210 },
      { label: '공종명 : ', val: data.workGroup, w: 2.386, x: 3.596 },
      { label: '작업장소 : ', val: data.location, w: 2.386, x: 5.982 },
      { label: '점검자 : ', val: data.inspector, w: 2.386, x: 8.368 },
      { label: '점검차수 : ', val: data.inspectRound, w: 2.386, x: 10.754 }
    ];
    metaCols.forEach(col => {
      const sz = calcSingleLineFontSize(`${col.label}${col.val}`, col.w, 14, 9.5);
      slide.addText([
        { text: col.label, options: { bold: true, color: C_ACCENT_BLUE, fontFace: FONT_MALGUN, fontSize: sz } },
        { text: col.val, options: { bold: true, color: '000000', fontFace: FONT_MALGUN, fontSize: sz } }
      ], {
        x: col.x, y: 1.125, w: col.w, h: 0.406,
        fill: { color: 'FFFFFF' }, line: { color: C_BORDER, width: 0.75 },
        align: 'left', valign: 'middle', inset: 0.06, wrap: false
      });
    });

    // 부적합 개요 2행: 부적합 내용 전체 너비 사각형 (x = 1.210, y = 1.531, w = 11.930, h = 0.406)
    const mainSz = calcSingleLineFontSize(`부적합 내용 : ${data.mainContent}`, 11.930, 14, 9.5);
    slide.addText([
      { text: '부적합 내용 : ', options: { bold: true, color: C_ACCENT_BLUE, fontFace: FONT_MALGUN, fontSize: mainSz } },
      { text: data.mainContentParts.prefix, options: { bold: true, color: '000000', fontFace: FONT_MALGUN, fontSize: mainSz } },
      { text: data.mainContentParts.highlight, options: { bold: true, color: C_RED, fontFace: FONT_MALGUN, fontSize: mainSz } },
      { text: data.mainContentParts.suffix, options: { bold: true, color: C_TITLE_BLUE, fontFace: FONT_MALGUN, fontSize: mainSz } }
    ], {
      x: 1.210, y: 1.531, w: 11.930, h: 0.406,
      fill: { color: 'FFFFFF' }, line: { color: C_BORDER, width: 0.75 },
      align: 'left', valign: 'middle', inset: 0.06, wrap: false
    });

    // ── 3. 대형 컨테이너 내부 분할 (y = 1.937 ~ 7.293, 높이 5.356) ──
    // 사용자 지시: "6. 발생원인,hold point 위에 칸이 너무 많아. 원본 확인해"
    // 부적합 내용(y=1.531, h=0.406, 바닥 y=1.937) 바로 밑에 불필요한 중간 빈 칸 없이 단 1개의 가로선으로 직접 연결!
    slide.addShape(pptx.ShapeType.line, {
      x: 0.120, y: 1.937, w: 13.020, h: 0,
      line: { color: C_BORDER, width: 0.75 }
    });

    // 세로 분할선 (x = 8.395): 좌측 사진 영역(w = 8.275)과 우측 원인/대책 영역(w = 4.711)을 분할 (y = 2.060에서 시작하여 상단에 여백 확보)
    slide.addShape(pptx.ShapeType.line, {
      x: 8.395, y: 2.060, w: 0, h: 5.233,
      line: { color: C_BORDER, width: 0.75 }
    });

    // ── 좌측 사진 영역: Hold Point 위반 박스 (x = 5.975, y = 2.060, w = 2.363, h = 0.406) ──
    // 사용자 지시: "3. hold point, 발생원인 위쪽이 살짝 띄어져 있어 확인해."
    // y = 2.060 (부적합 내용 바닥 y = 1.937과 0.123인치 순수 흰색 여백)
    slide.addText([
      { text: data.isHoldPoint ? '☑ ' : '☐ ', options: { fontSize: 18, bold: true, color: '000000', fontFace: FONT_MALGUN } },
      { text: 'Hold Point 위반 (N/A)', options: { fontSize: 12, bold: true, color: '000000', fontFace: FONT_MALGUN } }
    ], {
      x: 5.975, y: 2.060, w: 2.363, h: 0.406,
      fill: { color: 'FFFFFF' }, line: { color: C_BORDER, width: 0.75 },
      align: 'center', valign: 'middle', wrap: false, inset: 0.04
    });

    // 사진 로드 및 삽입: 글씨/배너 없이 순수 사진만 삽입 (y = 2.503에서 시작)
    let photo1Base64 = null;
    let photo2Base64 = null;
    if (loadPhotoBase64) {
      try { photo1Base64 = await loadPhotoBase64((record.photos && record.photos[0]) || '', record, 0); } catch (e) {}
      try { photo2Base64 = await loadPhotoBase64((record.photos && record.photos[1]) || (record.fix && record.fix.photo) || '', record, 1); } catch (e) {}
    }
    const hasPhoto2 = Boolean(photo2Base64);

    const showGuidelineBox = Boolean(data.hasGuideline && data.guidelineTitle);
    const photoBodyHeight = showGuidelineBox ? 3.650 : 4.740;
    const photoStartY = 2.503;

    if (hasPhoto2) {
      // 2개 사진 배치
      if (photo1Base64) {
        slide.addImage({
          data: photo1Base64,
          x: 0.130, y: photoStartY, w: 4.080, h: photoBodyHeight,
          sizing: { type: 'contain', w: 4.080, h: photoBodyHeight }
        });
      }
      if (photo2Base64) {
        slide.addImage({
          data: photo2Base64,
          x: 4.290, y: photoStartY, w: 4.080, h: photoBodyHeight,
          sizing: { type: 'contain', w: 4.080, h: photoBodyHeight }
        });
      }
    } else {
      // 1개 사진 전폭 배치 (w = 8.240)
      if (photo1Base64) {
        slide.addImage({
          data: photo1Base64,
          x: 0.130, y: photoStartY, w: 8.240, h: photoBodyHeight,
          sizing: { type: 'contain', w: 8.240, h: photoBodyHeight }
        });
      }
    }

    if (showGuidelineBox) {
      slide.addShape(pptx.ShapeType.rect, {
        x: 0.120, y: 6.200, w: 8.275, h: 1.093,
        fill: { color: 'FFFFFF' }, line: { color: C_BORDER, width: 0.75 }
      });
      slide.addText([
        { text: `${data.guidelineTitle}\n`, options: { fontSize: 12, bold: true, color: '000000', fontFace: FONT_MALGUN } },
        { text: data.guidelineBody, options: { fontSize: 10.5, color: '222222', fontFace: FONT_MALGUN } }
      ], {
        x: 0.120, y: 6.200, w: 8.275, h: 1.093,
        margin: [4, 8, 4, 8], valign: 'top', lineSpacingMultiple: 1.15
      });
    }

    // ── 우측 컬럼: 발생원인 & 개선대책 (x = 8.395 ~ 13.106, w = 4.711) ──
    // 1) 발생원인 (인터뷰 결과) 헤더 (y = 2.060, h = 0.406, 바닥 y = 2.466)
    // 사용자 지시: "3. hold point, 발생원인 위쪽이 살짝 띄어져 있어 확인해." -> 상단 0.123인치 여백 반영
    slide.addText('발생원인 (인터뷰 결과)', {
      x: 8.395, y: 2.060, w: 4.711, h: 0.406,
      fill: { color: C_YELLOW_BG }, line: { color: C_BORDER, width: 0.75 },
      fontFace: FONT_MALGUN, fontSize: 14, bold: true, color: '000000', align: 'center', valign: 'middle'
    });

    // 2) 발생원인 본문 & 점검단 제안 (y = 2.503, h = 3.064, 바닥 y = 5.567)
    // 발생원인 헤더 바닥(2.466)과 본문(2.503) 사이 0.037인치 간격
    slide.addShape(pptx.ShapeType.rect, {
      x: 8.395, y: 2.503, w: 4.711, h: 3.064,
      fill: { color: 'FFFFFF' }, line: { color: C_BORDER, width: 0.75 }
    });
    // 윗칸: [ 의견 : 시공관리자 및 근로자 ] (h = 1.964, y = 2.503 ~ 4.467)
    // 사용자 지시: "4. 의견 글씨가 원본 대비 밑으로 내려온것 같아. 확인해 그리고 그다음 줄간격은 좀 더 있으니까 참고하고"
    // PptxGenJS 마진 순서: [Left, Right, Bottom, Top] -> [8, 8, 2, 2]로 상단 패딩을 최소화하여 위로 바짝 올림
    // [의견 : ...] 뒤에는 paraSpaceAfter: 8을 주어 다음 본문과의 줄간격을 띄움
    let intSz = 12.5;
    let intLineSpacing = 1.18;
    if (data.interviewOpinion.length > 130) {
      intSz = 10.5;
      intLineSpacing = 1.12;
    } else if (data.interviewOpinion.length > 80) {
      intSz = 11.5;
      intLineSpacing = 1.15;
    }
    slide.addText([
      {
        text: '[ 의견 : 시공관리자 및 근로자 ]',
        options: {
          fontSize: 14,
          bold: true,
          color: '000000',
          fontFace: FONT_MALGUN,
          breakLine: true,
          paraSpaceAfter: 8
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
      x: 8.395, y: 2.503, w: 4.711, h: 1.964,
      margin: [8, 8, 2, 2], valign: 'top', lineSpacingMultiple: intLineSpacing
    });
    // 가로 분리선: [의견]과 [점검단 제안] 사이 (y = 4.467)
    slide.addShape(pptx.ShapeType.line, {
      x: 8.395, y: 4.467, w: 4.711, h: 0,
      line: { color: C_BORDER, width: 0.75 }
    });

    // 점검단 제안 세로 분리선 (x = 9.829, h = 1.100, y = 4.467 ~ 5.567)
    slide.addShape(pptx.ShapeType.line, {
      x: 9.829, y: 4.467, w: 0, h: 1.100,
      line: { color: C_BORDER, width: 0.75 }
    });
    // 좌측 상하 셀 구분 가로 분리선 (y = 4.884, w = 1.434)
    slide.addShape(pptx.ShapeType.line, {
      x: 8.395, y: 4.884, w: 1.434, h: 0,
      line: { color: C_BORDER, width: 0.75 }
    });

    // 1) 좌측 상단 독립 셀: [점검단 제안] (h = 0.417, y = 4.467 ~ 4.884)
    slide.addText('[점검단 제안]', {
      x: 8.395, y: 4.467, w: 1.434, h: 0.417,
      fontFace: FONT_MALGUN, fontSize: 14, bold: true, color: '000000',
      align: 'center', valign: 'middle'
    });

    // 2) 좌측 하단 독립 셀: 시스템 개선 / (이행강화안 수립) (h = 0.683, y = 4.884 ~ 5.567)
    slide.addText([
      { text: `${data.proposalType}\n`, options: { fontSize: 14, bold: true, color: C_ACCENT_BLUE, fontFace: FONT_MALGUN } },
      { text: data.proposalSub, options: { fontSize: 11, color: '595959', fontFace: FONT_MALGUN } }
    ], {
      x: 8.395, y: 4.884, w: 1.434, h: 0.683,
      align: 'center', valign: 'middle', lineSpacingMultiple: 1.15
    });

    // 3) 우측 점검단 제안 본문 셀 (w = 3.277, h = 1.100, y = 4.467 ~ 5.567)
    let propSz = 12.5;
    let propLineSpacing = 1.18;
    let propMargin = [6, 10, 4, 10];
    if (data.proposalContent.length > 70) {
      propSz = 10;
      propLineSpacing = 1.10;
      propMargin = [4, 6, 2, 6];
    } else if (data.proposalContent.length > 45) {
      propSz = 11.5;
      propLineSpacing = 1.14;
      propMargin = [4, 8, 3, 8];
    }
    slide.addText(data.proposalContent, {
      x: 9.829, y: 4.467, w: 3.277, h: 1.100,
      fontFace: FONT_MALGUN, fontSize: propSz, color: '111111',
      margin: propMargin, valign: 'top', lineSpacingMultiple: propLineSpacing
    });

    // ── [GAP 1]: 발생원인 바닥(y = 5.567)과 개선대책 상단(y = 5.660) 사이 0.093인치 순수 흰색 간격 (원본 템플릿 100% 동일) ──

    // 3) 개선대책 (현장 협의 결과) 헤더 (y = 5.660, h = 0.406, 바닥 y = 6.066)
    // 원본 템플릿(표 25): y = 5.660, h = 0.406, 독립된 4면 테두리를 가진 별도 표!
    slide.addShape(pptx.ShapeType.rect, {
      x: 8.395, y: 5.660, w: 4.711, h: 0.406,
      fill: { color: C_YELLOW_BG }, line: { color: C_BORDER, width: 0.75 }
    });
    slide.addText('개선대책 (현장 협의 결과)', {
      x: 8.395, y: 5.660, w: 4.711, h: 0.406,
      fontFace: FONT_MALGUN, fontSize: 14, bold: true, color: '000000', align: 'center', valign: 'middle'
    });

    // ── [GAP 2]: 개선대책 바닥(y = 6.066)과 개선대책 본문 상단(y = 6.102) 사이 0.037인치 순수 흰색 간격 (원본 템플릿 100% 동일) ──

    // 4) 개선대책 본문 & PM 판정결과 (y = 6.102, h = 1.134, 바닥 y = 7.236)
    // 원본 템플릿(표 23): y = 6.102, h = 1.134, 독립된 4면 테두리를 가진 별도 표!
    slide.addShape(pptx.ShapeType.rect, {
      x: 8.395, y: 6.102, w: 4.711, h: 1.134,
      fill: { color: 'FFFFFF' }, line: { color: C_BORDER, width: 0.75 }
    });
    // 세로 구분선: 좌측 개선대책(w = 3.204)과 우측 PM 판정결과(w = 1.507)를 영구 분할
    slide.addShape(pptx.ShapeType.line, {
      x: 11.599, y: 6.102, w: 0, h: 1.134,
      line: { color: C_BORDER, width: 0.75 }
    });
    // 우측 [PM 판정결과] 헤더와 내용 서브박스 분할 가로선 (y = 6.479)
    slide.addShape(pptx.ShapeType.line, {
      x: 11.599, y: 6.479, w: 1.507, h: 0,
      line: { color: C_BORDER, width: 0.75 }
    });

    // 개선대책 본문 (좌측 w = 3.204)
    if (data.countermeasureContent) {
      let counterSz = 12.5;
      let counterLineSpacing = 1.18;
      let counterMargin = [6, 10, 4, 10];
      if (data.countermeasureContent.length > 70) {
        counterSz = 10;
        counterLineSpacing = 1.10;
        counterMargin = [4, 6, 2, 6];
      } else if (data.countermeasureContent.length > 45) {
        counterSz = 11.5;
        counterLineSpacing = 1.14;
        counterMargin = [4, 8, 3, 8];
      }
      slide.addText(data.countermeasureContent, {
        x: 8.395, y: 6.102, w: 3.204, h: 1.134,
        fontFace: FONT_MALGUN, fontSize: counterSz, bold: true, color: '000000',
        margin: counterMargin, valign: 'top', lineSpacingMultiple: counterLineSpacing
      });
    }

    // [PM 판정결과] 상단 헤더 셀 (h = 0.377, y = 6.102 ~ 6.479)
    slide.addText('[PM 판정결과]', {
      x: 11.599, y: 6.102, w: 1.507, h: 0.377,
      fontFace: FONT_MALGUN, fontSize: 13, bold: true, color: '000000',
      align: 'center', valign: 'middle'
    });

    // [PM 판정결과] 하단 서브박스 내용 (입력된 경우에만 텍스트 표시, 공란일 경우에도 구획선 유지, y = 6.479 ~ 7.236)
    if (data.pmVerdictType) {
      const pmSubRuns = [
        { text: `${data.pmVerdictType}\n`, options: { fontSize: 14, bold: true, color: C_ACCENT_BLUE, fontFace: FONT_MALGUN } }
      ];
      if (data.pmVerdictSub) {
        pmSubRuns.push({ text: data.pmVerdictSub, options: { fontSize: 11, color: '595959', fontFace: FONT_MALGUN } });
      }
      slide.addText(pmSubRuns, {
        x: 11.599, y: 6.479, w: 1.507, h: 0.756,
        align: 'center', valign: 'middle', lineSpacingMultiple: 1.15, margin: [4, 4, 4, 4]
      });
    }
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
   * 브라우저 실시간 16:9 슬라이드 프리뷰 HTML 렌더링 (템플릿/부적합 장표.pptx 100% 동일 일치)
   */
  function renderInspectionSheetHTML(record, options = {}) {
    const { photo1Url = '', photo2Url = '', rulesFromTaxonomy = [] } = options;
    const data = normalizeJangpyoData(record, rulesFromTaxonomy);

    const hasPhoto2 = Boolean(photo2Url);

    // 사용자 지시: 특별한 언급이 없으면 사진만 넣어 굳이 줄걸이 책임자의 책임을 넣지 않고 사진이 바닥까지 꽉 차도록 확장
    const showGuidelineBox = Boolean(data.hasGuideline && data.guidelineTitle);
    const photo1Height = showGuidelineBox ? '280px' : '385px';
    const photo2Height = showGuidelineBox ? '248px' : '350px';

    const photoHeight = showGuidelineBox ? '310px' : '415px';

    const photo1Img = photo1Url 
      ? `<img src="${photo1Url}" style="width: 100%; height: ${photoHeight}; object-fit: contain; background: #ffffff; border: 1.0px solid #000000; border-radius: 2px;" onerror="this.style.display='none'">`
      : `<div style="width: 100%; height: ${photoHeight}; background: #f8fafc; border: 1.0px solid #000000; border-radius: 2px; display: flex; align-items: center; justify-content: center; color: #64748b; font-size: 0.95rem;">📸 사진 1</div>`;

    const photo2Img = photo2Url
      ? `<img src="${photo2Url}" style="width: 100%; height: ${photoHeight}; object-fit: contain; background: #ffffff; border: 1.0px solid #000000; border-radius: 2px;" onerror="this.style.display='none'">`
      : `<div style="width: 100%; height: ${photoHeight}; background: #f8fafc; border: 1.0px solid #000000; border-radius: 2px; display: flex; align-items: center; justify-content: center; color: #64748b; font-size: 0.95rem;">📸 사진 2</div>`;

    const photo1ImgSingle = photo1Url
      ? `<img src="${photo1Url}" style="width: 100%; height: ${photoHeight}; object-fit: contain; background: #ffffff; border: 1.0px solid #000000; border-radius: 2px;" onerror="this.style.display='none'">`
      : `<div style="width: 100%; height: ${photoHeight}; background: #f8fafc; border: 1.0px solid #000000; border-radius: 2px; display: flex; align-items: center; justify-content: center; color: #64748b; font-size: 1.05rem;">📸 현장 사진</div>`;

    return `
      <div id="jangpyoSlidePreview" style="
        min-width: 960px;
        width: 100%;
        max-width: 1080px;
        margin: 0 auto;
        background: #ffffff;
        border: 1.5px solid #000000;
        border-radius: 2px;
        box-shadow: 0 4px 16px rgba(0,0,0,0.12);
        padding: 8px;
        font-family: 'Malgun Gothic', '맑은 고딕', sans-serif;
        color: #000000;
        box-sizing: border-box;
      ">
        <!-- 1. 최상단 헤더 행 (5개 블록, 0.75pt/1.0px 검은색 테두리) -->
        <div style="display: flex; align-items: stretch; border: 1.0px solid #000000; margin-bottom: 4px; height: 74px;">
          <!-- 1) 시설물/법규 (연청색 #bdd7ee, 18pt bold) -->
          <div style="width: 13.8%; flex-shrink: 0; background: #bdd7ee; border-right: 1.0px solid #000000; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 1.25rem; color: #000000; white-space: nowrap; padding: 0 4px;">
            시설물/법규
          </div>
          <!-- 2) 사고유형 & 등급 (사용자 지시: 음영 없음/순수 흰색 + 3px 황색 #ffc000 테두리, 원본처럼 글자색 검은색 #000000) -->
          <div style="width: 12.0%; flex-shrink: 0; background: #ffffff; border: 3px solid #ffc000; z-index: 2; position: relative; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 2px; box-sizing: border-box;">
            <div style="font-weight: 800; font-size: 1.25rem; color: #000000; text-align: center; line-height: 1.15; white-space: nowrap;">
              ${data.typeMain}
            </div>
            ${data.typeSub ? `<div style="font-weight: 700; font-size: 0.82rem; color: #333333; text-align: center; line-height: 1.1; margin-top: 1px; white-space: nowrap;">${data.typeSub}</div>` : ''}
            <div style="font-weight: 800; font-size: 1.25rem; color: #000000; margin-top: 1px; white-space: nowrap;">
              [${data.severity}]
            </div>
          </div>
          <!-- 3) 관련기준 라벨 (순수 흰색 배경) -->
          <div style="width: 5.3%; flex-shrink: 0; background: #ffffff; border-right: 1.0px solid #000000; border-left: 1.0px solid #000000; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 0.95rem; color: #000000; text-align: center; line-height: 1.2;">
            관련<br>기준
          </div>
          <!-- 4) 관련기준 내용 (사용자 지시: 2. 원본에는 칸으로 구분되어 있지 않아. 제목과 본문 사이에 가로 구분선 없음) -->
          <div style="flex: 1; min-width: 200px; background: #ffffff; border-right: 1.0px solid #000000; display: flex; flex-direction: column; box-sizing: border-box; overflow: hidden;">
            <div style="background: #ffffff; padding: 4px 10px 2px 10px; font-weight: 800; font-size: ${data.lawTitle.length > 34 ? '0.86rem' : (data.lawTitle.length > 25 ? '0.90rem' : '0.95rem')}; color: #000000; display: flex; align-items: center; height: 26px; min-height: 26px; flex-shrink: 0; box-sizing: border-box; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
              ${data.lawTitle}
            </div>
            <div style="padding: 2px 6px 4px 6px; background: #ffffff; flex: 1; display: flex; align-items: center; box-sizing: border-box;">
              <div style="background: #deebf7; padding: 4px 8px; border-radius: 2px; font-size: 0.88rem; color: #111111; line-height: 1.34; width: 100%; box-sizing: border-box; word-break: keep-all;">
                ${data.lawBody}
              </div>
            </div>
          </div>
          <!-- 5) 4대 발생요인 4개 분면 셀 (체크박스 16pt, 텍스트 14pt bold, 1.0px 검은색 실선) -->
          <div style="width: 22.9%; flex-shrink: 0; background: #ffffff; display: flex; flex-direction: column;">
            <div style="flex: 1; display: grid; grid-template-columns: 1fr 1fr; border-bottom: 1.0px solid #000000;">
              <div style="display: flex; align-items: center; justify-content: center; font-size: 0.95rem; font-weight: 800; color: #000000; border-right: 1.0px solid #000000; white-space: nowrap; padding: 0 4px;">
                <span style="font-size: 16px; font-weight: 900; margin-right: 4px;">${data.isUnplanned ? '☑' : '☐'}</span>
                계획 미수립
              </div>
              <div style="display: flex; align-items: center; justify-content: center; font-size: 0.95rem; font-weight: 800; color: #000000; white-space: nowrap; padding: 0 4px;">
                <span style="font-size: 16px; font-weight: 900; margin-right: 4px;">${data.isUnexecuted ? '☑' : '☐'}</span>
                계획 미이행
              </div>
            </div>
            <div style="flex: 1; display: grid; grid-template-columns: 1fr 1fr;">
              <div style="display: flex; align-items: center; justify-content: center; font-size: 0.95rem; font-weight: 800; color: #000000; border-right: 1.0px solid #000000; white-space: nowrap; padding: 0 4px;">
                <span style="font-size: 16px; font-weight: 900; margin-right: 4px;">${data.isAction ? '☑' : '☐'}</span>
                불안전 행동
              </div>
              <div style="display: flex; align-items: center; justify-content: center; font-size: 0.95rem; font-weight: 800; color: #000000; white-space: nowrap; padding: 0 4px;">
                <span style="font-size: 16px; font-weight: 900; margin-right: 4px;">${data.isCondition ? '☑' : '☐'}</span>
                불안전 상태
              </div>
            </div>
          </div>
        </div>

        <!-- 2. 부적합 개요 행 (모든 테두리 1.0px 검은색, 헤더 #ffd966, 사용자 지시: 중간 빈 칸 없이 본문과 1개의 선으로 맞닿음) -->
        <div style="display: grid; grid-template-columns: 85px 1fr; border: 1.0px solid #000000; border-bottom: none;">
          <!-- 좌측 노란 헤더 (글자크기 18pt bold, '부적합' 붙어있음) -->
          <div style="background: #ffd966; border-right: 1.0px solid #000000; display: flex; align-items: center; justify-content: center; font-weight: 900; font-size: 1.25rem; color: #000000; text-align: center; line-height: 1.25; padding: 4px;">
            부적합<br>개&nbsp;&nbsp;&nbsp;요
          </div>
          <!-- 우측 2행 표 구조 -->
          <div style="display: flex; flex-direction: column;">
            <!-- 1행: 5개 독립 네모칸 (14pt bold, 라벨 #4472c4) -->
            <div style="display: flex; border-bottom: 1.0px solid #000000; background: #ffffff;">
              <div style="flex: 1.05; border-right: 1.0px solid #000000; padding: 5px 8px; font-size: 0.95rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                <strong style="color: #4472c4;">협력사 :</strong> <span style="font-weight: 800; color: #000000;">${data.subcontractor}</span>
              </div>
              <div style="flex: 1.15; border-right: 1.0px solid #000000; padding: 5px 8px; font-size: 0.95rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                <strong style="color: #4472c4;">공종명 :</strong> <span style="font-weight: 800; color: #000000;">${data.workGroup}</span>
              </div>
              <div style="flex: 0.95; border-right: 1.0px solid #000000; padding: 5px 8px; font-size: 0.95rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                <strong style="color: #4472c4;">작업장소 :</strong> <span style="font-weight: 800; color: #000000;">${data.location}</span>
              </div>
              <div style="flex: 1.05; border-right: 1.0px solid #000000; padding: 5px 8px; font-size: 0.95rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                <strong style="color: #4472c4;">점검자 :</strong> <span style="font-weight: 800; color: #000000;">${data.inspector}</span>
              </div>
              <div style="flex: 1.05; padding: 5px 8px; font-size: 0.95rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                <strong style="color: #4472c4;">점검차수 :</strong> <span style="font-weight: 800; color: #000000;">${data.inspectRound}</span>
              </div>
            </div>
            <!-- 2행: 부적합 내용 전체 너비 (14pt bold) -->
            <div style="padding: 5px 10px; font-size: 0.96rem; background: #ffffff; line-height: 1.4;">
              <strong style="color: #4472c4;">부적합 내용 :</strong>
              <span style="font-weight: 800; color: #000000;"> ${data.mainContentParts.prefix}</span>
              ${data.mainContentParts.highlight ? `<span style="font-weight: 900; color: #c00000;">${data.mainContentParts.highlight}</span>` : ''}
              ${data.mainContentParts.suffix ? `<span style="font-weight: 800; color: #002060;">${data.mainContentParts.suffix}</span>` : ''}
            </div>
          </div>
        </div>

        <!-- 3. 대형 통합 본문 컨테이너 (사용자 지시: 큰 테두리는 검은색이고 사진, 발생원인, 개선대책이 한 네모안에 들어감) -->
        <div style="border: 1.0px solid #000000; display: grid; grid-template-columns: 1.74fr 1fr; background: #ffffff;">
          <!-- 좌측 컬럼: 사진 영역 및 Hold Point 위반 -->
          <div style="display: flex; flex-direction: column; border-right: 1.0px solid #000000; box-sizing: border-box;">
            <!-- Hold Point 위반 박스 (사용자 지시: 3. hold point, 발생원인 위쪽이 살짝 띄어져 있어 확인해 -> margin-top: 8px) -->
            <div style="display: flex; justify-content: flex-end; height: 38px; padding: 8px 4px 0 4px; box-sizing: border-box; align-items: center;">
              <div style="width: 210px; background: #ffffff; border: 1.0px solid #000000; border-radius: 2px; text-align: center; display: flex; align-items: center; justify-content: center; font-size: 0.88rem; color: #000000; font-weight: 800; white-space: nowrap; height: 26px;">
                <span style="font-size: 16px; margin-right: 4px;">${data.isHoldPoint ? '☑' : '☐'}</span> Hold Point 위반 (N/A)
              </div>
            </div>

            <!-- 사진 영역: 글씨 없이 사진만 표시 -->
            <div style="padding: 4px; flex: 1; display: flex; flex-direction: column;">
              ${hasPhoto2 ? `
                <div style="display: flex; gap: 4px; flex: 1;">
                  <div style="flex: 1;">${photo1Img}</div>
                  <div style="flex: 1;">${photo2Img}</div>
                </div>
              ` : `
                <div style="flex: 1;">${photo1ImgSingle}</div>
              `}
            </div>

            <!-- 사진 하단 규정 수칙 박스 (특별한 지정이 있는 경우에만 표시) -->
            ${showGuidelineBox ? `
              <div style="background: #ffffff; border-top: 1.0px solid #000000; padding: 8px 12px; font-size: 0.90rem; word-break: keep-all; line-height: 1.45;">
                <div style="color: #000000; font-weight: 800; font-size: 0.95rem; margin-bottom: 4px;">${data.guidelineTitle}</div>
                <div style="color: #222222; font-weight: 500; white-space: pre-line;">${data.guidelineBody}</div>
              </div>
            ` : ''}
          </div>

          <!-- 우측 컬럼: 발생원인 & 개선대책 & PM 판정결과 -->
          <div style="display: flex; flex-direction: column; padding: 8px 4px 4px 4px; box-sizing: border-box;">
            <!-- 1) 발생원인 (인터뷰 결과) 헤더 (사용자 지시: 위쪽이 살짝 띄어져 있음) -->
            <div style="background: #ffd966; border: 1.0px solid #000000; color: #000000; font-weight: 900; font-size: 0.98rem; text-align: center; height: 34px; box-sizing: border-box; display: flex; align-items: center; justify-content: center; margin-bottom: 4px;">
              발생원인 (인터뷰 결과)
            </div>
            <!-- 2) 발생원인 본문 & 점검단 제안 (하단 margin: 8px로 개선대책 위에 0.093인치 간격 띄움) -->
            <div style="border: 1.0px solid #000000; background: #ffffff; margin-bottom: 8px;">
              <!-- 발생원인 본문 (사용자 지시: 4. 의견 글씨가 원본 대비 밑으로 내려온것 같아 -> padding-top: 4px, margin-bottom: 8px) -->
              <div style="padding: 4px 12px 8px 12px; border-bottom: 1.0px solid #000000; word-break: keep-all;">
                <div style="font-weight: 800; font-size: 0.95rem; color: #000000; margin-bottom: 8px;">[ 의견 : 시공관리자 및 근로자 ]</div>
                <div style="font-size: 0.90rem; font-weight: 500; color: #111111; line-height: 1.45;">${data.interviewOpinion}</div>
              </div>
              <!-- 점검단 제안: 좌측 2행(상하 별도 독립 칸) + 우측 본문 통합 셀 -->
              <div style="display: grid; grid-template-columns: 120px 1fr; background: #ffffff;">
                <div style="display: flex; flex-direction: column; border-right: 1.0px solid #000000;">
                  <!-- 좌측 상단: [점검단 제안] 별도 독립 칸 -->
                  <div style="border-bottom: 1.0px solid #000000; font-size: 0.92rem; font-weight: 800; color: #000000; padding: 6px 4px; text-align: center; height: 32px; display: flex; align-items: center; justify-content: center;">
                    [점검단 제안]
                  </div>
                  <!-- 좌측 하단: 시스템 개선 별도 독립 칸 -->
                  <div style="flex: 1; padding: 6px 4px; text-align: center; display: flex; flex-direction: column; align-items: center; justify-content: center;">
                    <div style="font-size: 1.02rem; font-weight: 900; color: #4472c4; margin-bottom: 2px;">${data.proposalType}</div>
                    <div style="font-size: 0.76rem; font-weight: 600; color: #555555;">${data.proposalSub}</div>
                  </div>
                </div>
                <!-- 우측 본문 셀 (전체 높이 확장) -->
                <div style="padding: 8px 12px; font-size: ${data.proposalContent.length > 70 ? '0.78rem' : '0.88rem'}; font-weight: 500; color: #000000; line-height: 1.36; display: flex; align-items: flex-start; word-break: keep-all;">
                  ${data.proposalContent}
                </div>
              </div>
            </div>

            <!-- 3) 개선대책 (현장 협의 결과) 헤더 (사용자 지시: 위는 8px, 아래는 4px 띄어져 독립된 별도 표임) -->
            <div style="background: #ffd966; border: 1.0px solid #000000; color: #000000; font-weight: 900; font-size: 0.98rem; text-align: center; padding: 4px 6px; height: 34px; box-sizing: border-box; display: flex; align-items: center; justify-content: center; margin-bottom: 4px;">
              개선대책 (현장 협의 결과)
            </div>
            <!-- 4) 개선대책 본문 & PM 판정결과 (상단 margin 4px로 개선대책 아래 0.037인치 간격 띄움) -->
            <div style="border: 1.0px solid #000000; display: grid; grid-template-columns: 1fr 110px; background: #ffffff; flex: 1; min-height: 95px;">
              <!-- 개선대책 본문 좌측 칸 -->
              <div style="padding: 10px 12px; font-size: 0.90rem; font-weight: 700; color: #000000; border-right: 1.0px solid #000000; word-break: keep-all; line-height: 1.45; display: flex; flex-direction: column; justify-content: center; white-space: pre-line;">
                ${data.countermeasureContent || ''}
              </div>
              <!-- PM 판정결과 우측 구획 -->
              <div style="display: flex; flex-direction: column; background: #ffffff;">
                <div style="border-bottom: 1.0px solid #000000; font-size: 0.92rem; font-weight: 800; color: #000000; text-align: center; padding: 4px 2px; height: 30px; display: flex; align-items: center; justify-content: center;">
                  [PM 판정결과]
                </div>
                <div style="flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 4px 2px; text-align: center;">
                  ${data.pmVerdictType ? `
                    <div style="font-size: 1.02rem; font-weight: 900; color: #4472c4; margin: 2px 0 1px 0;">${data.pmVerdictType}</div>
                    <div style="font-size: 0.76rem; font-weight: 600; color: #555555;">${data.pmVerdictSub}</div>
                  ` : ''}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
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
