/**
 * SafePatrol 현장 패트롤 점검장표 PPT 자동 생성기 & 시각적 프리뷰어
 * - 폰트: 100% 맑은 고딕 (Malgun Gothic) 표준 적용
 * - 16:9 와이드 표준 슬라이드 레이아웃 (부적합 개요, 현장 사진 1/2, 발생원인 인터뷰, 개선대책 및 PM 판정결과)
 * - 브라우저 기반 PptxGenJS 라이브러리를 통해 외부 서버 없이 클라이언트에서 즉시 .pptx 파일 직접 생성
 */
(function (root, factory) {
  const exported = factory();
  if (typeof exports === 'object' && typeof module !== 'undefined') {
    module.exports = exported;
  }
  if (root) root.SafePPT = exported;
})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : typeof self !== 'undefined' ? self : this), function () {

  const FONT_MALGUN = '맑은 고딕';

  // 색상 팔레트 (점검장표 템플릿 실물 일치 색상)
  const C_BORDER = '7BA0CD';       // 테두리 블루그레이 (#7BA0CD)
  const C_HEADER_BG = 'DCE6F1';     // 헤더 연청색 (#DCE6F1)
  const C_TITLE_BLUE = '002060';    // 시설물/법규 및 강조 진한 딥네이비 (#002060)
  const C_YELLOW_BG = 'FFE699';     // 부적합개요/원인/대책 헤더 골드옐로우 (#FFE699)
  const C_YELLOW_DARK = '593E00';   // 옐로우 헤더 진갈색 텍스트 (#593E00)
  const C_RED = 'C00000';           // 중부적합 및 위험요인/지적요인 선명한 적색 (#C00000)
  const C_ORANGE = 'ED7D31';        // 사고유형 테두리 및 이행 포인트 오렌지 (#ED7D31)
  const C_GRAY_TEXT = '595959';     // 보조 텍스트
  const C_DARK_TEXT = '000000';     // 본문 진한 검정 (#000000)
  const C_ACCENT_BLUE = '4472C4';   // 템플릿 표준 강조 블루 (#4472C4)

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
      fill: { color: C_HEADER_BG }, line: { color: C_BORDER, width: 1.2 },
      fontFace: FONT_MALGUN, fontSize: 18, bold: true, color: C_TITLE_BLUE,
      align: 'center', valign: 'middle'
    });

    // 2) 사고유형 & 부적합등급 (x = 1.967, w = 1.568, h = 0.914, 4면 오렌지 2.5pt 테두리)
    if (data.typeSub) {
      slide.addText([
        { text: `${data.typeMain}\n`, options: { fontSize: 14, bold: true, color: '000000', fontFace: FONT_MALGUN } },
        { text: `${data.typeSub}\n`, options: { fontSize: 13, bold: true, color: '333333', fontFace: FONT_MALGUN } },
        { text: `[${data.severity}]`, options: { fontSize: 14, bold: true, color: data.isMajor ? C_RED : C_ORANGE, fontFace: FONT_MALGUN } }
      ], {
        x: 1.967, y: 0.163, w: 1.568, h: 0.914,
        fill: { color: 'FFFFFF' }, line: { color: C_ORANGE, width: 2.5 },
        align: 'center', valign: 'middle', lineSpacingMultiple: 0.92, inset: 0.02
      });
    } else {
      slide.addText([
        { text: `${data.typeMain}\n`, options: { fontSize: 18, bold: true, color: '000000', fontFace: FONT_MALGUN } },
        { text: `[${data.severity}]`, options: { fontSize: 15, bold: true, color: data.isMajor ? C_RED : C_ORANGE, fontFace: FONT_MALGUN } }
      ], {
        x: 1.967, y: 0.163, w: 1.568, h: 0.914,
        fill: { color: 'FFFFFF' }, line: { color: C_ORANGE, width: 2.5 },
        align: 'center', valign: 'middle', lineSpacingMultiple: 1.15, inset: 0.02
      });
    }

    // 3) 관련기준 라벨 (x = 3.592, w = 0.684, h = 0.914)
    slide.addText('관련\n기준', {
      x: 3.592, y: 0.163, w: 0.684, h: 0.914,
      fill: { color: C_HEADER_BG }, line: { color: C_BORDER, width: 1.2 },
      fontFace: FONT_MALGUN, fontSize: 14, bold: true, color: C_TITLE_BLUE,
      align: 'center', valign: 'middle', lineSpacingMultiple: 1.15
    });

    // 4) 관련기준 내용 (x = 4.276, w = 5.832, h = 0.914, 2단 분할: 윗칸 14pt 볼드 제목 + 가로선 + 아랫칸 13pt 본문)
    slide.addShape(pptx.ShapeType.rect, {
      x: 4.276, y: 0.163, w: 5.832, h: 0.914,
      fill: { color: 'FFFFFF' }, line: { color: C_BORDER, width: 1.2 }
    });
    const lawTitleFontSize = data.lawTitle.length > 34 ? 12 : (data.lawTitle.length > 25 ? 13 : 14);
    slide.addText(data.lawTitle, {
      x: 4.276, y: 0.163, w: 5.832, h: 0.350,
      fontFace: FONT_MALGUN, fontSize: lawTitleFontSize, bold: true, color: '000000',
      align: 'left', valign: 'middle', wrap: false, inset: 0.08
    });
    // 가로 구분선 (y = 0.513)
    slide.addShape(pptx.ShapeType.line, {
      x: 4.276, y: 0.513, w: 5.832, h: 0,
      line: { color: C_BORDER, width: 1.0 }
    });
    // 아랫칸 연한 배경 박스
    slide.addShape(pptx.ShapeType.rect, {
      x: 4.286, y: 0.523, w: 5.812, h: 0.544,
      fill: { color: 'F2F4F7' }, line: { color: 'F2F4F7', width: 0 }
    });
    const lawBodyFontSize = data.lawBody.length > 80 ? 11.5 : (data.lawBody.length > 55 ? 12.5 : 13);
    slide.addText(data.lawBody, {
      x: 4.276, y: 0.513, w: 5.832, h: 0.564,
      fontFace: FONT_MALGUN, fontSize: lawBodyFontSize, color: '111111',
      align: 'left', valign: 'middle', inset: 0.08, lineSpacingMultiple: 1.18
    });

    // 5) 4대 발생요인 (x = 10.165, y = 0.163, w = 2.975, h = 0.914, 4개 분면 셀, 체크박스 16pt, 텍스트 14pt bold)
    slide.addShape(pptx.ShapeType.rect, {
      x: 10.165, y: 0.163, w: 2.975, h: 0.914,
      fill: { color: 'FFFFFF' }, line: { color: C_BORDER, width: 1.2 }
    });
    // 가로 구분선 (y = 0.620)
    slide.addShape(pptx.ShapeType.line, {
      x: 10.165, y: 0.620, w: 2.975, h: 0,
      line: { color: C_BORDER, width: 1.0 }
    });
    // 세로 구분선 (x = 11.652)
    slide.addShape(pptx.ShapeType.line, {
      x: 11.652, y: 0.163, w: 0, h: 0.914,
      line: { color: C_BORDER, width: 1.0 }
    });
    // 4개 셀 (체크박스 16pt bold, 텍스트 14pt bold)
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

    // ── 2. 부적합 개요 행 (y = 1.125, h = 0.811, x = 0.120 ~ 13.140, 총 너비 13.020) ──
    // '부적합 개요' 라벨 (x = 0.120, w = 1.090, h = 0.811)
    slide.addText([
      { text: '부 적 합\n', options: { fontSize: 14, bold: true, color: '000000', fontFace: FONT_MALGUN } },
      { text: '개    요', options: { fontSize: 14, bold: true, color: '000000', fontFace: FONT_MALGUN } }
    ], {
      x: 0.120, y: 1.125, w: 1.090, h: 0.811,
      fill: { color: C_YELLOW_BG }, line: { color: C_BORDER, width: 1.2 },
      align: 'center', valign: 'middle', lineSpacingMultiple: 1.15
    });

    // 부적합 개요 1행: 5개 독립 셀 (x = 1.210 ~ 13.140, w = 11.930, h = 0.406) - 단일 도형으로 깔끔한 inset 적용
    // 협력사 (x = 1.210, w = 2.450)
    slide.addText([
      { text: '협력사 : ', options: { bold: true, color: C_ACCENT_BLUE, fontFace: FONT_MALGUN, fontSize: 14 } },
      { text: data.subcontractor, options: { bold: true, color: '000000', fontFace: FONT_MALGUN, fontSize: 14 } }
    ], {
      x: 1.210, y: 1.125, w: 2.450, h: 0.406,
      fill: { color: 'FFFFFF' }, line: { color: C_BORDER, width: 1.0 },
      align: 'left', valign: 'middle', inset: 0.08
    });

    // 공종명 (x = 3.660, w = 2.450)
    slide.addText([
      { text: '공종명 : ', options: { bold: true, color: C_ACCENT_BLUE, fontFace: FONT_MALGUN, fontSize: 14 } },
      { text: data.workGroup, options: { bold: true, color: '000000', fontFace: FONT_MALGUN, fontSize: 14 } }
    ], {
      x: 3.660, y: 1.125, w: 2.450, h: 0.406,
      fill: { color: 'FFFFFF' }, line: { color: C_BORDER, width: 1.0 },
      align: 'left', valign: 'middle', inset: 0.08
    });

    // 작업장소 (x = 6.110, w = 2.300)
    slide.addText([
      { text: '작업장소 : ', options: { bold: true, color: C_ACCENT_BLUE, fontFace: FONT_MALGUN, fontSize: 14 } },
      { text: data.location, options: { bold: true, color: '000000', fontFace: FONT_MALGUN, fontSize: 14 } }
    ], {
      x: 6.110, y: 1.125, w: 2.300, h: 0.406,
      fill: { color: 'FFFFFF' }, line: { color: C_BORDER, width: 1.0 },
      align: 'left', valign: 'middle', inset: 0.08
    });

    // 점검자 (x = 8.410, w = 2.300)
    slide.addText([
      { text: '점검자 : ', options: { bold: true, color: C_ACCENT_BLUE, fontFace: FONT_MALGUN, fontSize: 14 } },
      { text: data.inspector, options: { bold: true, color: '000000', fontFace: FONT_MALGUN, fontSize: 14 } }
    ], {
      x: 8.410, y: 1.125, w: 2.300, h: 0.406,
      fill: { color: 'FFFFFF' }, line: { color: C_BORDER, width: 1.0 },
      align: 'left', valign: 'middle', inset: 0.08
    });

    // 점검차수 (x = 10.710, w = 2.430)
    slide.addText([
      { text: '점검차수 : ', options: { bold: true, color: C_ACCENT_BLUE, fontFace: FONT_MALGUN, fontSize: 14 } },
      { text: data.inspectRound, options: { bold: true, color: '000000', fontFace: FONT_MALGUN, fontSize: 14 } }
    ], {
      x: 10.710, y: 1.125, w: 2.430, h: 0.406,
      fill: { color: 'FFFFFF' }, line: { color: C_BORDER, width: 1.0 },
      align: 'left', valign: 'middle', inset: 0.08
    });

    // 부적합 개요 2행: 부적합 내용 전체 너비 사각형 (x = 1.210 ~ 13.140, w = 11.930, h = 0.405) - 단일 도형
    slide.addText([
      { text: '부적합 내용 : ', options: { bold: true, color: C_ACCENT_BLUE, fontFace: FONT_MALGUN, fontSize: 14 } },
      { text: data.mainContentParts.prefix, options: { bold: true, color: '000000', fontFace: FONT_MALGUN, fontSize: 14 } },
      { text: data.mainContentParts.highlight, options: { bold: true, color: C_RED, fontFace: FONT_MALGUN, fontSize: 14 } },
      { text: data.mainContentParts.suffix, options: { bold: true, color: C_TITLE_BLUE, fontFace: FONT_MALGUN, fontSize: 14 } }
    ], {
      x: 1.210, y: 1.531, w: 11.930, h: 0.405,
      fill: { color: 'FFFFFF' }, line: { color: C_BORDER, width: 1.0 },
      align: 'left', valign: 'middle', inset: 0.08, lineSpacingMultiple: 1.10
    });

    // ── 3. 본문 구역 (y = 2.207 ~ 7.236, 총 높이 5.029") ──
    // 우측 컬럼: x = 8.395, w = 4.711 (템플릿 기준 8.395" ~ 13.106")
    // 좌측 사진: x = 0.120, w = 8.218 (템플릿 기준 0.120" ~ 8.338")

    // 1) 우측 컬럼 헤더 1: 발생원인 (인터뷰 결과) (y = 2.207, h = 0.406)
    slide.addText('발생원인 (인터뷰 결과)', {
      x: 8.395, y: 2.207, w: 4.711, h: 0.406,
      fill: { color: C_YELLOW_BG }, line: { color: C_BORDER, width: 1.2 },
      fontFace: FONT_MALGUN, fontSize: 14, bold: true, color: '000000', align: 'center', valign: 'middle'
    });

    // 2) 우측 컬럼: 발생원인 의견 & 점검단 제안 (y = 2.650, h = 2.917)
    slide.addShape(pptx.ShapeType.rect, {
      x: 8.395, y: 2.650, w: 4.711, h: 2.917,
      fill: { color: 'FFFFFF' }, line: { color: C_BORDER, width: 1.2 }
    });
    // 윗칸: [ 의견 : 시공관리자 및 근로자 ] (h = 1.843)
    slide.addText([
      { text: '[ 의견 : 시공관리자 및 근로자 ]\n', options: { fontSize: 14, bold: true, color: '000000', fontFace: FONT_MALGUN } },
      { text: data.interviewOpinion, options: { fontSize: 13, color: '111111', fontFace: FONT_MALGUN } }
    ], {
      x: 8.395, y: 2.650, w: 4.711, h: 1.843,
      margin: [6, 10, 4, 10], valign: 'top', lineSpacingMultiple: 1.20
    });
    // 가로 분리선 (y = 4.493)
    slide.addShape(pptx.ShapeType.line, {
      x: 8.395, y: 4.493, w: 4.711, h: 0,
      line: { color: C_BORDER, width: 1.0 }
    });
    // 아랫칸: 점검단 제안 (h = 1.074, 좌측 w = 1.434, 우측 w = 3.277)
    slide.addShape(pptx.ShapeType.line, {
      x: 9.829, y: 4.493, w: 0, h: 1.074,
      line: { color: C_BORDER, width: 1.0 }
    });
    slide.addText([
      { text: '[점검단 제안]\n', options: { fontSize: 14, bold: true, color: '000000', fontFace: FONT_MALGUN } },
      { text: `${data.proposalType}\n`, options: { fontSize: 14, bold: true, color: C_ACCENT_BLUE, fontFace: FONT_MALGUN } },
      { text: data.proposalSub, options: { fontSize: 11, color: '595959', fontFace: FONT_MALGUN } }
    ], {
      x: 8.395, y: 4.493, w: 1.434, h: 1.074,
      align: 'center', valign: 'middle', lineSpacingMultiple: 1.15
    });
    slide.addText(data.proposalContent, {
      x: 9.829, y: 4.493, w: 3.277, h: 1.074,
      fontFace: FONT_MALGUN, fontSize: 13, color: '111111', margin: [6, 10, 4, 10], valign: 'top', lineSpacingMultiple: 1.20
    });

    // 3) 우측 컬럼 헤더 2: 개선대책 (현장 협의 결과) (y = 5.660, h = 0.406)
    slide.addText('개선대책 (현장 협의 결과)', {
      x: 8.395, y: 5.660, w: 4.711, h: 0.406,
      fill: { color: C_YELLOW_BG }, line: { color: C_BORDER, width: 1.2 },
      fontFace: FONT_MALGUN, fontSize: 14, bold: true, color: '000000', align: 'center', valign: 'middle'
    });

    // 4) 우측 컬럼: 개선대책 본문 & PM 판정결과 (y = 6.102, h = 1.134)
    slide.addShape(pptx.ShapeType.rect, {
      x: 8.395, y: 6.102, w: 4.711, h: 1.134,
      fill: { color: 'FFFFFF' }, line: { color: C_BORDER, width: 1.2 }
    });
    slide.addShape(pptx.ShapeType.line, {
      x: 11.599, y: 6.102, w: 0, h: 1.134,
      line: { color: C_BORDER, width: 1.0 }
    });
    // 개선대책 본문 (좌측 w = 3.204)
    if (data.countermeasureContent) {
      slide.addText(data.countermeasureContent, {
        x: 8.395, y: 6.102, w: 3.204, h: 1.134,
        fontFace: FONT_MALGUN, fontSize: 13, bold: true, color: '000000', margin: [6, 10, 4, 10], valign: 'top', lineSpacingMultiple: 1.22
      });
    }
    // PM 판정결과 (우측 w = 1.507)
    const pmRuns = [
      { text: '[PM 판정결과]', options: { fontSize: 14, bold: true, color: '000000', fontFace: FONT_MALGUN } }
    ];
    if (data.pmVerdictType) {
      pmRuns.push({ text: `\n\n${data.pmVerdictType}\n`, options: { fontSize: 14, bold: true, color: C_ACCENT_BLUE, fontFace: FONT_MALGUN } });
      if (data.pmVerdictSub) {
        pmRuns.push({ text: data.pmVerdictSub, options: { fontSize: 11, color: '595959', fontFace: FONT_MALGUN } });
      }
    }
    slide.addText(pmRuns, {
      x: 11.599, y: 6.102, w: 1.507, h: 1.134,
      align: 'center', valign: data.pmVerdictType ? 'middle' : 'top', lineSpacingMultiple: 1.15, margin: [8, 4, 8, 4]
    });

    // ── 좌측 컬럼: 사진 영역 및 Hold Point (x = 0.120 ~ 8.338, w = 8.218) ──
    let photo1Base64 = null;
    let photo2Base64 = null;
    if (loadPhotoBase64) {
      try { photo1Base64 = await loadPhotoBase64((record.photos && record.photos[0]) || '', record, 0); } catch (e) {}
      try { photo2Base64 = await loadPhotoBase64((record.photos && record.photos[1]) || (record.fix && record.fix.photo) || '', record, 1); } catch (e) {}
    }
    const hasPhoto2 = Boolean(photo2Base64);

    // Hold Point 위반 박스 (x = 5.975, y = 2.207, w = 2.363, h = 0.406)
    slide.addText([
      { text: data.isHoldPoint ? '☑ ' : '☐ ', options: { fontSize: 18, bold: true, color: '000000', fontFace: FONT_MALGUN } },
      { text: 'Hold Point 위반 (N/A)', options: { fontSize: 12, bold: true, color: '333333', fontFace: FONT_MALGUN } }
    ], {
      x: 5.975, y: 2.207, w: 2.363, h: 0.406,
      fill: { color: 'FFFFFF' }, line: { color: C_BORDER, width: 1.2 },
      align: 'center', valign: 'middle', wrap: false, inset: 0.04
    });

    // 사진 1 상단 배너 (x = 0.120, y = 2.207, w = 5.750, h = 0.406)
    slide.addText(data.photo1Title, {
      x: 0.120, y: 2.207, w: 5.750, h: 0.406,
      fill: { color: 'EA7676' }, line: { color: 'EA7676', width: 1 },
      fontFace: FONT_MALGUN, fontSize: 12, bold: true, color: 'FFFFFF',
      align: 'center', valign: 'middle', wrap: false, inset: 0.04
    });

    // 사용자 지시: 특별한 언급이 없으면 사진만 넣어 굳이 줄걸이 책임자의 책임을 넣지 않고 사진이 바닥(y=7.236)까지 꽉 차도록 확장
    const showGuidelineBox = Boolean(data.hasGuideline && data.guidelineTitle);
    const photoBodyHeight = showGuidelineBox ? 3.500 : 4.586; // 2.650 ~ 7.236

    if (hasPhoto2) {
      // ════ 2개 사진 레이아웃 ════
      // 사진 1 (좌측, w = 4.050)
      if (photo1Base64) {
        slide.addImage({
          data: photo1Base64,
          x: 0.120, y: 2.650, w: 4.050, h: photoBodyHeight,
          sizing: { type: 'contain', w: 4.050, h: photoBodyHeight }
        });
      } else {
        slide.addShape(pptx.ShapeType.rect, {
          x: 0.120, y: 2.650, w: 4.050, h: photoBodyHeight,
          fill: { color: 'F1F5F9' }, line: { color: 'CBD5E1', width: 1 }
        });
        slide.addText('📸 사진 1', {
          x: 0.120, y: 2.650, w: 4.050, h: photoBodyHeight,
          fontFace: FONT_MALGUN, fontSize: 12, color: '64748B', align: 'center', valign: 'middle'
        });
      }

      // 사진 2 (우측, w = 4.108)
      // 상단 배너 (h = 0.380)
      slide.addShape(pptx.ShapeType.rect, {
        x: 4.230, y: 2.650, w: 4.108, h: 0.380,
        fill: { color: 'EA7676' }, line: { color: 'EA7676', width: 1 }
      });
      slide.addText(data.photo2Title, {
        x: 4.230, y: 2.650, w: 4.108, h: 0.380,
        fontFace: FONT_MALGUN, fontSize: 12, bold: true, color: 'FFFFFF',
        align: 'center', valign: 'middle', wrap: false, margin: 0
      });
      // 사진 2 이미지
      slide.addImage({
        data: photo2Base64,
        x: 4.230, y: 3.060, w: 4.108, h: photoBodyHeight - 0.410,
        sizing: { type: 'contain', w: 4.108, h: photoBodyHeight - 0.410 }
      });
    } else {
      // ════ 사진 1개 전용 레이아웃: w = 8.218 시원한 전폭 확장! ════
      if (photo1Base64) {
        slide.addImage({
          data: photo1Base64,
          x: 0.120, y: 2.650, w: 8.218, h: photoBodyHeight,
          sizing: { type: 'contain', w: 8.218, h: photoBodyHeight }
        });
      } else {
        slide.addShape(pptx.ShapeType.rect, {
          x: 0.120, y: 2.650, w: 8.218, h: photoBodyHeight,
          fill: { color: 'F1F5F9' }, line: { color: 'CBD5E1', width: 1 }
        });
        slide.addText('📸 현장 사진', {
          x: 0.120, y: 2.650, w: 8.218, h: photoBodyHeight,
          fontFace: FONT_MALGUN, fontSize: 14, color: '64748B', align: 'center', valign: 'middle'
        });
      }
    }

    // D. 좌측 하단 규정 수칙 박스 (특별한 언급/지정이 있는 경우에만 표시)
    if (showGuidelineBox) {
      slide.addShape(pptx.ShapeType.rect, {
        x: 0.120, y: 6.200, w: 8.218, h: 1.036,
        fill: { color: 'FFFFFF' }, line: { color: C_BORDER, width: 1.2 }
      });
      slide.addText([
        { text: `${data.guidelineTitle}\n`, options: { fontSize: 12, bold: true, color: '000000', fontFace: FONT_MALGUN } },
        { text: data.guidelineBody, options: { fontSize: 10.5, color: '222222', fontFace: FONT_MALGUN } }
      ], {
        x: 0.120, y: 6.200, w: 8.218, h: 1.036,
        margin: [4, 8, 4, 8], valign: 'top', lineSpacingMultiple: 1.15
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

    const photo1Img = photo1Url 
      ? `<img src="${photo1Url}" style="width: 100%; height: ${photo1Height}; object-fit: contain; background: #ffffff; border: 1.2px solid #7ba0cd; border-top: none; border-radius: 0 0 2px 2px;" onerror="this.style.display='none'">`
      : `<div style="width: 100%; height: ${photo1Height}; background: #f8fafc; border: 1.2px solid #7ba0cd; border-top: none; border-radius: 0 0 2px 2px; display: flex; align-items: center; justify-content: center; color: #64748b; font-size: 0.95rem;">📸 사진 1</div>`;

    const photo2Img = photo2Url
      ? `<img src="${photo2Url}" style="width: 100%; height: ${photo2Height}; object-fit: contain; background: #ffffff; border: 1.2px solid #7ba0cd; border-top: none; border-radius: 0 0 2px 2px;" onerror="this.style.display='none'">`
      : `<div style="width: 100%; height: ${photo2Height}; background: #f8fafc; border: 1.2px solid #7ba0cd; border-top: none; border-radius: 0 0 2px 2px; display: flex; align-items: center; justify-content: center; color: #64748b; font-size: 0.95rem;">📸 사진 2</div>`;

    const photo1ImgSingle = photo1Url
      ? `<img src="${photo1Url}" style="width: 100%; height: ${photo1Height}; object-fit: contain; background: #ffffff; border: 1.2px solid #7ba0cd; border-top: none; border-radius: 0 0 2px 2px;" onerror="this.style.display='none'">`
      : `<div style="width: 100%; height: ${photo1Height}; background: #f8fafc; border: 1.2px solid #7ba0cd; border-top: none; border-radius: 0 0 2px 2px; display: flex; align-items: center; justify-content: center; color: #64748b; font-size: 1.05rem;">📸 현장 사진</div>`;

    return `
      <div id="jangpyoSlidePreview" style="
        min-width: 960px;
        width: 100%;
        max-width: 1080px;
        margin: 0 auto;
        background: #ffffff;
        border: 2px solid #5b9bd5;
        border-radius: 4px;
        box-shadow: 0 4px 16px rgba(0,0,0,0.12);
        padding: 8px;
        font-family: 'Malgun Gothic', '맑은 고딕', sans-serif;
        color: #000000;
        box-sizing: border-box;
      ">
        <!-- 1. 최상단 헤더 행 (5개 블록, 높이 74px로 템플릿 0.914in 비율과 100% 일치) -->
        <div style="display: flex; align-items: stretch; border: 1.2px solid #7ba0cd; margin-bottom: 4px; height: 74px;">
          <!-- 1) 시설물/법규 (한 줄로 표시, 18pt = 1.25rem) -->
          <div style="width: 13.8%; flex-shrink: 0; background: #dce6f1; border-right: 1.2px solid #7ba0cd; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 1.25rem; color: #002060; white-space: nowrap; padding: 0 4px;">
            시설물/법규
          </div>
          <!-- 2) 사고유형 & 등급 (오렌지 테두리 4면 완전 노출: 2.5px solid 적용) -->
          <div style="width: 12.0%; flex-shrink: 0; background: #ffffff; border: 2.5px solid #ed7d31; z-index: 2; position: relative; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 2px; box-sizing: border-box;">
            <div style="font-weight: 800; font-size: ${data.typeSub ? '1.05rem' : '1.18rem'}; color: #000000; text-align: center; line-height: 1.15; white-space: nowrap;">
              ${data.typeMain}
            </div>
            ${data.typeSub ? `<div style="font-weight: 700; font-size: 0.82rem; color: #333333; text-align: center; line-height: 1.1; margin-top: 1px; white-space: nowrap;">${data.typeSub}</div>` : ''}
            <div style="font-weight: 800; font-size: 0.95rem; color: ${data.isMajor ? '#c00000' : '#ed7d31'}; margin-top: 2px; white-space: nowrap;">
              [${data.severity}]
            </div>
          </div>
          <!-- 3) 관련기준 라벨 (14pt = 0.95rem) -->
          <div style="width: 5.3%; flex-shrink: 0; background: #dce6f1; border-right: 1.2px solid #7ba0cd; border-left: 1.2px solid #7ba0cd; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 0.95rem; color: #002060; text-align: center; line-height: 1.2;">
            관련<br>기준
          </div>
          <!-- 4) 관련기준 내용 (2단 분할: 윗칸 14pt 굵은 제목 + 가로선 + 아랫칸 13pt 본문 연청색 박스) -->
          <div style="flex: 1; min-width: 200px; background: #ffffff; border-right: 1.2px solid #7ba0cd; display: flex; flex-direction: column; box-sizing: border-box; overflow: hidden;">
            <div style="border-bottom: 1.0px solid #7ba0cd; padding: 0 10px; font-weight: 800; font-size: ${data.lawTitle.length > 34 ? '0.86rem' : (data.lawTitle.length > 25 ? '0.90rem' : '0.95rem')}; color: #000000; display: flex; align-items: center; height: 28px; min-height: 28px; flex-shrink: 0; box-sizing: border-box; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
              ${data.lawTitle}
            </div>
            <div style="padding: 3px 10px; font-size: 0.88rem; color: #111111; line-height: 1.34; background: #f2f4f7; display: flex; align-items: center; flex: 1; box-sizing: border-box; word-break: keep-all; overflow: hidden;">
              ${data.lawBody}
            </div>
          </div>
          <!-- 5) 4대 발생요인 4개 분면 셀 (체크박스 16pt, 텍스트 14pt bold = 0.95rem) -->
          <div style="width: 22.9%; flex-shrink: 0; background: #ffffff; display: flex; flex-direction: column;">
            <div style="flex: 1; display: grid; grid-template-columns: 1fr 1fr; border-bottom: 1.0px solid #7ba0cd;">
              <div style="display: flex; align-items: center; justify-content: center; font-size: 0.95rem; font-weight: 800; color: #000000; border-right: 1.0px solid #7ba0cd; white-space: nowrap; padding: 0 4px;">
                <span style="font-size: 16px; font-weight: 900; margin-right: 4px;">${data.isUnplanned ? '☑' : '☐'}</span>
                계획 미수립
              </div>
              <div style="display: flex; align-items: center; justify-content: center; font-size: 0.95rem; font-weight: 800; color: #000000; white-space: nowrap; padding: 0 4px;">
                <span style="font-size: 16px; font-weight: 900; margin-right: 4px;">${data.isUnexecuted ? '☑' : '☐'}</span>
                계획 미이행
              </div>
            </div>
            <div style="flex: 1; display: grid; grid-template-columns: 1fr 1fr;">
              <div style="display: flex; align-items: center; justify-content: center; font-size: 0.95rem; font-weight: 800; color: #000000; border-right: 1.0px solid #7ba0cd; white-space: nowrap; padding: 0 4px;">
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

        <!-- 2. 부적합 개요 행 (모든 텍스트 14pt = 0.95rem bold 일괄 적용) -->
        <div style="display: grid; grid-template-columns: 85px 1fr; border: 1.2px solid #7ba0cd; margin-bottom: 4px;">
          <!-- 좌측 노란 헤더 -->
          <div style="background: #ffe699; border-right: 1.2px solid #7ba0cd; display: flex; align-items: center; justify-content: center; font-weight: 900; font-size: 0.98rem; color: #000000; text-align: center; line-height: 1.25; padding: 4px;">
            부 적 합<br>개&nbsp;&nbsp;&nbsp;&nbsp;요
          </div>
          <!-- 우측 2행 표 구조 -->
          <div style="display: flex; flex-direction: column;">
            <!-- 1행: 5개 독립 네모칸 (14pt bold, 라벨 #4472c4) -->
            <div style="display: flex; border-bottom: 1.0px solid #7ba0cd; background: #ffffff;">
              <div style="flex: 1.05; border-right: 1.0px solid #7ba0cd; padding: 5px 8px; font-size: 0.95rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                <strong style="color: #4472c4;">협력사 :</strong> <span style="font-weight: 800; color: #000000;">${data.subcontractor}</span>
              </div>
              <div style="flex: 1.15; border-right: 1.0px solid #7ba0cd; padding: 5px 8px; font-size: 0.95rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                <strong style="color: #4472c4;">공종명 :</strong> <span style="font-weight: 800; color: #000000;">${data.workGroup}</span>
              </div>
              <div style="flex: 0.95; border-right: 1.0px solid #7ba0cd; padding: 5px 8px; font-size: 0.95rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                <strong style="color: #4472c4;">작업장소 :</strong> <span style="font-weight: 800; color: #000000;">${data.location}</span>
              </div>
              <div style="flex: 1.05; border-right: 1.0px solid #7ba0cd; padding: 5px 8px; font-size: 0.95rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
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

        <!-- 3. 본문 2단 분할 (템플릿 황금비율: 좌측 사진 63.6% : 우측 36.4%) -->
        <div style="display: grid; grid-template-columns: 1.74fr 1fr; gap: 6px;">
          <!-- 좌측 컬럼 (사진 및 수칙: 너비 8.28인치 상당) -->
          <div style="display: flex; flex-direction: column; gap: 4px;">
            <!-- 상단 사진 영역: 2개 사진 vs 1개 사진 -->
            ${hasPhoto2 ? `
            <div style="display: flex; gap: 4px;">
              <!-- 사진 1 컬럼 (상단 배너에 이어 사진) -->
              <div style="flex: 1; display: flex; flex-direction: column;">
                <div style="background: #ea7676; color: #ffffff; font-weight: 800; font-size: 0.88rem; text-align: center; padding: 0 6px; border-radius: 2px 2px 0 0; white-space: nowrap; overflow: hidden; height: 30px; box-sizing: border-box; display: flex; align-items: center; justify-content: center;">
                  ${data.photo1Title}
                </div>
                ${photo1Img}
              </div>
              <!-- 사진 2 컬럼 (상단에 Hold Point 위반 박스가 위치!) -->
              <div style="flex: 1; display: flex; flex-direction: column;">
                <div style="background: #ffffff; border: 1.2px solid #7ba0cd; border-radius: 2px 2px 0 0; text-align: center; height: 30px; box-sizing: border-box; display: flex; align-items: center; justify-content: center; font-size: 0.88rem; color: #333333; font-weight: 800; white-space: nowrap; padding: 0 4px;">
                  <span style="font-size: 16px; margin-right: 4px;">${data.isHoldPoint ? '☑' : '☐'}</span> Hold Point 위반 (N/A)
                </div>
                <div style="background: #ea7676; color: #ffffff; font-weight: 800; font-size: 0.88rem; text-align: center; padding: 0 6px; white-space: nowrap; overflow: hidden; height: 30px; box-sizing: border-box; display: flex; align-items: center; justify-content: center; border-top: none;">
                  ${data.photo2Title}
                </div>
                ${photo2Img}
              </div>
            </div>
            ` : `
            <!-- 사진 1개 전용 레이아웃: 8.2인치 시원한 전폭 확장 -->
            <div style="display: flex; flex-direction: column;">
              <div style="display: flex; gap: 4px; height: 30px;">
                <div style="flex: 1; background: #ea7676; color: #ffffff; font-weight: 800; font-size: 0.92rem; text-align: center; padding: 0 8px; border-radius: 2px 2px 0 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: flex; align-items: center; justify-content: center;">
                  ${data.photo1Title}
                </div>
                <div style="width: 210px; flex-shrink: 0; background: #ffffff; border: 1.2px solid #7ba0cd; border-radius: 2px 2px 0 0; text-align: center; display: flex; align-items: center; justify-content: center; font-size: 0.88rem; color: #333333; font-weight: 800; white-space: nowrap; padding: 0 4px;">
                  <span style="font-size: 16px; margin-right: 4px;">${data.isHoldPoint ? '☑' : '☐'}</span> Hold Point 위반 (N/A)
                </div>
              </div>
              ${photo1ImgSingle}
            </div>
            `}

            <!-- 사진 하단 규정 수칙 박스 (특별한 지정이 있는 경우에만 표시) -->
            ${showGuidelineBox ? `
              <div style="background: #ffffff; border: 1.2px solid #7ba0cd; border-radius: 2px; padding: 8px 12px; font-size: 0.90rem; word-break: keep-all; line-height: 1.45;">
                <div style="color: #000000; font-weight: 800; font-size: 0.95rem; margin-bottom: 4px;">${data.guidelineTitle}</div>
                <div style="color: #222222; font-weight: 500; white-space: pre-line;">${data.guidelineBody}</div>
              </div>
            ` : ''}
          </div>

          <!-- 우측 컬럼 (발생원인 및 개선대책 - 템플릿 표준 14pt 적용) -->
          <div style="display: flex; flex-direction: column; gap: 4px;">
            <!-- 발생원인 (인터뷰 결과) -->
            <div style="border: 1.2px solid #7ba0cd; border-radius: 2px; overflow: hidden;">
              <div style="background: #ffe699; color: #000000; font-weight: 900; font-size: 0.98rem; text-align: center; padding: 4px 6px; height: 30px; box-sizing: border-box; display: flex; align-items: center; justify-content: center;">
                발생원인 (인터뷰 결과)
              </div>
              <div style="padding: 8px 12px; background: #ffffff; border-bottom: 1.0px solid #7ba0cd; word-break: keep-all;">
                <div style="font-weight: 800; font-size: 0.95rem; color: #000000; margin-bottom: 4px;">[ 의견 : 시공관리자 및 근로자 ]</div>
                <div style="font-size: 0.90rem; font-weight: 500; color: #111111; line-height: 1.45;">${data.interviewOpinion}</div>
              </div>
              <div style="display: grid; grid-template-columns: 110px 1fr; background: #ffffff;">
                <div style="background: #ffffff; border-right: 1.0px solid #7ba0cd; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 8px 4px; text-align: center;">
                  <div style="font-size: 0.92rem; font-weight: 800; color: #000000;">[점검단 제안]</div>
                  <div style="font-size: 1.05rem; font-weight: 900; color: #4472c4; margin: 2px 0 1px 0;">${data.proposalType}</div>
                  <div style="font-size: 0.76rem; font-weight: 600; color: #555555;">${data.proposalSub}</div>
                </div>
                <div style="padding: 8px 12px; font-size: 0.88rem; font-weight: 500; color: #000000; line-height: 1.45; display: flex; align-items: center; word-break: keep-all;">
                  ${data.proposalContent}
                </div>
              </div>
            </div>

            <!-- 개선대책 (현장 협의 결과) -->
            <div style="border: 1.2px solid #7ba0cd; border-radius: 2px; overflow: hidden;">
              <div style="background: #ffe699; color: #000000; font-weight: 900; font-size: 0.98rem; text-align: center; padding: 4px 6px; height: 30px; box-sizing: border-box; display: flex; align-items: center; justify-content: center;">
                개선대책 (현장 협의 결과)
              </div>
              <div style="display: grid; grid-template-columns: 1fr 110px; background: #ffffff; min-height: 85px;">
                <!-- 개선대책 본문 (추후 기입 공간이므로 기본 공란 또는 내용) -->
                <div style="padding: 10px 12px; font-size: 0.90rem; font-weight: 700; color: #000000; border-right: 1.0px solid #7ba0cd; word-break: keep-all; line-height: 1.45; display: flex; flex-direction: column; justify-content: center; white-space: pre-line;">
                  ${data.countermeasureContent || ''}
                </div>
                <!-- PM 판정결과 -->
                <div style="background: #ffffff; display: flex; flex-direction: column; align-items: center; justify-content: ${data.pmVerdictType ? 'center' : 'flex-start'}; padding: 8px 4px; text-align: center;">
                  <div style="font-size: 0.92rem; font-weight: 800; color: #000000;">[PM 판정결과]</div>
                  ${data.pmVerdictType ? `
                    <div style="font-size: 1.05rem; font-weight: 900; color: #4472c4; margin: 2px 0 1px 0;">${data.pmVerdictType}</div>
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
