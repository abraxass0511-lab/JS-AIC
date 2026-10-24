/**
 * SafePatrol 현장 패트롤 점검장표 PPT 자동 생성기 & 시각적 프리뷰어
 * - 폰트: 100% 맑은 고딕 (Malgun Gothic) 표준 적용
 * - 16:9 와이드 표준 슬라이드 레이아웃 (부적합 개요, 현장 사진 1/2, 발생원인 인터뷰, 개선대책 및 PM 판정결과)
 * - 브라우저 기반 PptxGenJS 라이브러리를 통해 외부 서버 없이 클라이언트에서 즉시 .pptx 파일 직접 생성
 */
(function (root, factory) {
  const exported = factory();
  if (typeof module === 'object' && module && module.exports) module.exports = exported;
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

  /**
   * 레코드로부터 점검장표용 세부 데이터 정규화 및 추론 (템플릿 1, 2 정밀 일치)
   */
  function normalizeJangpyoData(r, rulesFromTaxonomy = []) {
    const isMajor = r.severity === '중부적합';
    const severity = isMajor ? '중부적합' : '경부적합';
    const type = r.type || '넘어짐(전도 : 사람)';

    // 4대 요인 판정
    const mgmt = r.mgmtCauses || [];
    const causes = r.causes || [];
    const isUnplanned = mgmt.includes('계획 미수립') || causes.includes('계획 미수립');
    const isUnexecuted = mgmt.includes('계획 미이행') || causes.includes('계획 미이행') || (!isUnplanned && !mgmt.length && !causes.length);
    const isAction = mgmt.includes('불안전 행동') || causes.includes('불안전 행동') || causes.includes('인적') || (r.action && r.action !== '-' && r.action !== '해당없음');
    const isCondition = mgmt.includes('불안전 상태') || causes.includes('불안전 상태') || causes.includes('물적') || (r.condition && r.condition !== '-' && r.condition !== '해당없음') || true;
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

    // 근로자 이행 포인트 (3개)
    let rules = Array.isArray(rulesFromTaxonomy) && rulesFromTaxonomy.length ? rulesFromTaxonomy : [];
    if (!rules.length && r.basis && Array.isArray(r.basis.rules) && r.basis.rules.length) {
      rules = r.basis.rules;
    }
    if (!rules.length) {
      if (text.includes('양중') || text.includes('크레인') || text.includes('줄걸이') || text.includes('유도로프')) {
        rules = [
          '장비 및 양중화물 주변 반경 내 절대 접근 금지',
          '화물 양중 시 2개소 이상 유도로프 체결 및 수평양중 준수',
          '양중 작업 전 와이어로프/슬링벨트 손상 여부 및 샤클 결속 확인'
        ];
      } else if (text.includes('비계') || text.includes('난간') || text.includes('추락')) {
        rules = [
          '고소작업 시 안전대 부착설비 체결 및 안전모 턱끈 결속 철저',
          '작업발판 임의 해체 및 난간대 훼손 절대 금지 (발견 즉시 보고)',
          '작업 전 안전발판 고정 상태 및 틈새 발생 유무 확인'
        ];
      } else {
        rules = [
          '작업 시작 전 안전보호구 100% 착용 및 TBM 위험요인 숙지',
          '관리감독자 지휘 하에 승인된 표준 안전작업절차 준수',
          '불안전 상태 또는 위험요인 발견 시 즉시 작업중지 및 관리자 보고'
        ];
      }
    }

    // 부적합 내용 및 빨간색 지적 요인 분리
    let mainContent = rawContent;
    let redHighlight = '';
    if (mainContent.includes('↔')) {
      const parts = mainContent.split('↔');
      mainContent = parts[0].trim();
      redHighlight = parts[1].replace(/지적\s*요인\s*[:：]?/, '').trim();
    } else if (r.action && r.action !== '-' && r.action !== '해당없음' && !mainContent.includes(r.action)) {
      redHighlight = r.action;
    }

    // 사진 상단 적색 배너 타이틀 (템플릿 1, 2에서는 부적합 내용 자체가 배너 타이틀로 큼직하게 들어감)
    const photoBannerTitle = mainContent || r.action || '구획된 바닥 안전통로에 거푸집 자재를 방치함';

    // 발생원인 의견
    const interviewOpinion = r.interviewOpinion || r.workerOpinion || (
      r.action 
        ? `현장 시공 여건 상 ${r.action} 사유로 기준이 미준수되었으며, 관리감독자의 사전 작업지휘가 미흡한 상태에서 작업이 진행됨.`
        : '현장 작업진행 과정에서 안전작업수칙에 대한 관리감독 및 작업자 간 소통이 미흡하여 규정 절차가 누락됨.'
    );

    // 점검단 제안
    const proposalType = r.inspectorOpinionType || '시스템 개선';
    let proposalSub = '(이행강화안 수립)';
    if (proposalType === '교육/코칭') proposalSub = '(협력사 교육)';
    else if (proposalType === '페널티') proposalSub = '(패널티 부과)';

    const proposalContent = r.auditProposal || r.inspectorOpinion || (
      '설치조립작업 시 발생 가능한 사고를 방지하기 위해 작업팀 대상 안전작업절차 교육을 의무화하고 현장 관리감독자의 일일 이행 모니터링을 대폭 강화할 필요가 있음.'
    );

    // 개선대책
    let countermeasures = [];
    if (r.countermeasures && Array.isArray(r.countermeasures) && r.countermeasures.length) {
      countermeasures = r.countermeasures;
    } else if (r.fix && r.fix.content) {
      countermeasures.push(`근로자 및 관리감독자 대상으로 부적합 사항 공유 후 표준 안전작업 기준 준수토록 특별 교육 실시`);
      countermeasures.push(`동일 지적사항 재발 시 안전 페널티 부과 및 공정 안전점검 승인 후 작업 재개 조치`);
    } else {
      countermeasures.push(`근로자 및 관리감독자 대상으로 부적합 사항 공유 후 표준 안전작업 기준 준수토록 특별 교육 실시`);
      countermeasures.push(`동일 지적사항 재발 시 안전 페널티 부과 및 공정 안전점검 승인 후 작업 재개 조치`);
    }

    // PM 판정결과
    const pmVerdict = r.pmVerdict || proposalType || '시스템 개선';
    let pmVerdictSub = '(이행강화안 수립)';
    if (pmVerdict === '교육/코칭') pmVerdictSub = '(협력사 교육)';
    else if (pmVerdict === '페널티') pmVerdictSub = '(시정명령/벌점)';

    // 점검차수 표기 (템플릿 1: 3차)
    let inspectRound = r.inspectRound || (r.round ? `${r.round}차` : '3차');

    return {
      severity,
      isMajor,
      type,
      isUnplanned,
      isUnexecuted,
      isAction,
      isCondition,
      isHoldPoint,
      lawTitle,
      lawBody,
      rules,
      mainContent,
      redHighlight,
      interviewOpinion,
      proposalType,
      proposalSub,
      proposalContent,
      countermeasures,
      pmVerdict,
      pmVerdictSub,
      photoBannerTitle,
      subcontractor: r.subcontractor || '(주)협력업체',
      workGroup: r.workGroup || r.workMethod || r.workName || '철근콘크리트공사',
      location: r.location || '계단·복도',
      inspector: r.inspector || '신이삭',
      inspectRound,
      content: rawContent,
      action: r.action || '',
      site: r.site || '현장',
      inspectedDate: r.inspectedDate || '2026-10-24'
    };
  }

  /**
   * PptxGenJS 단일 슬라이드에 점검장표 레이아웃 추가 (맑은 고딕 서식, 템플릿 1·2 실물 100% 일치)
   */
  async function addInspectionSheetSlide(pptx, record, options = {}) {
    const { loadPhotoBase64, rulesFromTaxonomy = [] } = options;
    const data = normalizeJangpyoData(record, rulesFromTaxonomy);

    const slide = pptx.addSlide();
    slide.background = { color: 'FFFFFF' };

    // ── 1. 최상단 행 (y = 0.40, h = 1.05) ──
    // Box 1: 시설물/법규 (대형 볼드 딥네이비 타이틀)
    slide.addShape(pptx.ShapeType.rect, {
      x: 0.5, y: 0.40, w: 1.6, h: 1.05,
      fill: { color: C_HEADER_BG }, line: { color: C_BORDER, width: 1.5 }
    });
    slide.addText('시설물/법규', {
      x: 0.5, y: 0.40, w: 1.6, h: 1.05,
      fontFace: FONT_MALGUN, fontSize: 20, bold: true, color: C_TITLE_BLUE,
      align: 'center', valign: 'middle'
    });

    // Box 2: 사고유형 & 부적합등급 (오렌지 테두리)
    slide.addShape(pptx.ShapeType.rect, {
      x: 2.1, y: 0.40, w: 1.4, h: 1.05,
      fill: { color: 'FFFFFF' }, line: { color: C_ORANGE, width: 2 }
    });
    slide.addText([
      { text: `${data.type}\n`, options: { fontSize: 15.5, bold: true, color: '000000', fontFace: FONT_MALGUN } },
      { text: `[${data.severity}]`, options: { fontSize: 13.5, bold: true, color: data.isMajor ? C_RED : C_ORANGE, fontFace: FONT_MALGUN } }
    ], {
      x: 2.1, y: 0.40, w: 1.4, h: 1.05,
      align: 'center', valign: 'middle', lineSpacingMultiple: 1.2
    });

    // Box 3: 관련기준 라벨
    slide.addShape(pptx.ShapeType.rect, {
      x: 3.5, y: 0.40, w: 0.75, h: 1.05,
      fill: { color: C_HEADER_BG }, line: { color: C_BORDER, width: 1.5 }
    });
    slide.addText('관련\n기준', {
      x: 3.5, y: 0.40, w: 0.75, h: 1.05,
      fontFace: FONT_MALGUN, fontSize: 13.5, bold: true, color: C_TITLE_BLUE,
      align: 'center', valign: 'middle', lineSpacingMultiple: 1.2
    });

    // Box 4: 관련기준 내용 (법령 조문 및 안전수칙)
    slide.addShape(pptx.ShapeType.rect, {
      x: 4.25, y: 0.40, w: 5.283, h: 1.05,
      fill: { color: 'FFFFFF' }, line: { color: C_BORDER, width: 1.5 }
    });
    slide.addText([
      { text: `${data.lawTitle}\n`, options: { fontSize: 11, bold: true, color: '000000', fontFace: FONT_MALGUN } },
      { text: data.lawBody, options: { fontSize: 9.8, color: '333333', fontFace: FONT_MALGUN } }
    ], {
      x: 4.25, y: 0.40, w: 5.283, h: 1.05,
      margin: [4, 8, 4, 8], valign: 'middle', lineSpacingMultiple: 1.35
    });

    // Box 5: 4대 발생요인 체크박스 (2x2)
    slide.addShape(pptx.ShapeType.rect, {
      x: 9.533, y: 0.40, w: 3.3, h: 1.05,
      fill: { color: 'FFFFFF' }, line: { color: C_BORDER, width: 1.5 }
    });
    slide.addText([
      { text: `${data.isUnplanned ? '☑' : '☐'} 계획 미수립       ${data.isUnexecuted ? '☑' : '☐'} 계획 미이행\n`, options: { fontSize: 11, fontFace: FONT_MALGUN, color: '000000' } },
      { text: `${data.isAction ? '☑' : '☐'} 불안전 행동       ${data.isCondition ? '☑' : '☐'} 불안전 상태`, options: { fontSize: 11, fontFace: FONT_MALGUN, color: '000000' } }
    ], {
      x: 9.533, y: 0.40, w: 3.3, h: 1.05,
      align: 'center', valign: 'middle', lineSpacingMultiple: 1.4
    });

    // ── 2. 부적합 개요 행 (y = 1.50, h = 0.90) ──
    slide.addShape(pptx.ShapeType.rect, {
      x: 0.5, y: 1.50, w: 0.75, h: 0.9,
      fill: { color: C_YELLOW_BG }, line: { color: C_BORDER, width: 1.5 }
    });
    slide.addText('부적합\n개  요', {
      x: 0.5, y: 1.50, w: 0.75, h: 0.9,
      fontFace: FONT_MALGUN, fontSize: 13, bold: true, color: C_YELLOW_DARK,
      align: 'center', valign: 'middle', lineSpacingMultiple: 1.2
    });

    slide.addShape(pptx.ShapeType.rect, {
      x: 1.25, y: 1.50, w: 11.583, h: 0.9,
      fill: { color: 'FFFFFF' }, line: { color: C_BORDER, width: 1.5 }
    });

    const overviewTextItems = [
      { text: '협력사 : ', options: { fontFace: FONT_MALGUN, fontSize: 10.5, bold: true, color: C_TITLE_BLUE } },
      { text: `${data.subcontractor}   |   `, options: { fontFace: FONT_MALGUN, fontSize: 10.5, color: '000000' } },
      { text: '공종명 : ', options: { fontFace: FONT_MALGUN, fontSize: 10.5, bold: true, color: C_TITLE_BLUE } },
      { text: `${data.workGroup}   |   `, options: { fontFace: FONT_MALGUN, fontSize: 10.5, color: '000000' } },
      { text: '작업장소 : ', options: { fontFace: FONT_MALGUN, fontSize: 10.5, bold: true, color: C_TITLE_BLUE } },
      { text: `${data.location}   |   `, options: { fontFace: FONT_MALGUN, fontSize: 10.5, color: '000000' } },
      { text: '점검자 : ', options: { fontFace: FONT_MALGUN, fontSize: 10.5, bold: true, color: C_TITLE_BLUE } },
      { text: `${data.inspector}   |   `, options: { fontFace: FONT_MALGUN, fontSize: 10.5, color: '000000' } },
      { text: '점검차수 : ', options: { fontFace: FONT_MALGUN, fontSize: 10.5, bold: true, color: C_TITLE_BLUE } },
      { text: `${data.inspectRound}\n`, options: { fontFace: FONT_MALGUN, fontSize: 10.5, color: '000000' } },
      { text: '부적합 내용 : ', options: { fontFace: FONT_MALGUN, fontSize: 11, bold: true, color: C_TITLE_BLUE } },
      { text: data.mainContent, options: { fontFace: FONT_MALGUN, fontSize: 11, bold: true, color: '000000' } }
    ];
    if (data.redHighlight) {
      overviewTextItems.push({
        text: `  ↔ 지적 요인: ${data.redHighlight}`,
        options: { fontFace: FONT_MALGUN, fontSize: 11, bold: true, color: C_RED }
      });
    }

    slide.addText(overviewTextItems, {
      x: 1.25, y: 1.50, w: 11.583, h: 0.9,
      margin: [6, 10, 6, 10], valign: 'middle', lineSpacingMultiple: 1.35
    });

    // ── 3. 좌측 사진 및 근로자 이행 포인트 (x = 0.5, w = 6.6) ──
    // 적색 헤더 배너 (부적합 타이틀)
    slide.addShape(pptx.ShapeType.rect, {
      x: 0.5, y: 2.45, w: 6.6, h: 0.35,
      fill: { color: 'EA7676' }, line: { color: 'EA7676', width: 1 }
    });
    slide.addText(data.photoBannerTitle, {
      x: 0.5, y: 2.45, w: 6.6, h: 0.35,
      fontFace: FONT_MALGUN, fontSize: 12.5, bold: true, color: 'FFFFFF',
      align: 'center', valign: 'middle'
    });

    // 사진 로드 시도 (Base64)
    let photo1Base64 = null;
    let photo2Base64 = null;
    if (loadPhotoBase64) {
      if (record.photos && record.photos[0]) {
        try { photo1Base64 = await loadPhotoBase64(record.photos[0]); } catch (e) {}
      }
      if (record.photos && record.photos[1]) {
        try { photo2Base64 = await loadPhotoBase64(record.photos[1]); } catch (e) {}
      } else if (record.fix && record.fix.photo) {
        try { photo2Base64 = await loadPhotoBase64(record.fix.photo); } catch (e) {}
      }
    }

    const photoHeight = 3.30;
    if (photo1Base64 && photo2Base64) {
      slide.addImage({ data: photo1Base64, x: 0.5, y: 2.80, w: 3.25, h: photoHeight });
      slide.addImage({ data: photo2Base64, x: 3.85, y: 2.80, w: 3.25, h: photoHeight });
    } else if (photo1Base64) {
      slide.addImage({ data: photo1Base64, x: 0.5, y: 2.80, w: 6.6, h: photoHeight });
    } else {
      slide.addShape(pptx.ShapeType.rect, {
        x: 0.5, y: 2.80, w: 6.6, h: photoHeight,
        fill: { color: 'F1F5F9' }, line: { color: 'CBD5E1', width: 1 }
      });
      slide.addText('📸 현장 부적합 사진이 등록되지 않았습니다.', {
        x: 0.5, y: 2.80, w: 6.6, h: photoHeight,
        fontFace: FONT_MALGUN, fontSize: 13, color: '64748B', align: 'center', valign: 'middle'
      });
    }

    // 근로자 이행 포인트 박스
    slide.addShape(pptx.ShapeType.rect, {
      x: 0.5, y: 6.15, w: 6.6, h: 1.05,
      fill: { color: 'FFFFFF' }, line: { color: 'E2E8F0', width: 1 }
    });
    const rulesText = data.rules.map((r, i) => `${['①', '②', '③', '④', '⑤'][i] || '•'} ${r}`).join('\n');
    slide.addText([
      { text: '[근로자 이행 포인트]\n', options: { fontSize: 10.8, bold: true, color: C_ORANGE, fontFace: FONT_MALGUN } },
      { text: rulesText, options: { fontSize: 9.8, color: '222222', fontFace: FONT_MALGUN } }
    ], {
      x: 0.5, y: 6.15, w: 6.6, h: 1.05,
      margin: [4, 8, 4, 8], valign: 'middle', lineSpacingMultiple: 1.45
    });

    // ── 4. 우측 발생원인 및 개선대책 (x = 7.25, w = 5.583) ──
    slide.addShape(pptx.ShapeType.rect, {
      x: 7.25, y: 2.45, w: 5.583, h: 0.35,
      fill: { color: 'FFFFFF' }, line: { color: C_BORDER, width: 1 }
    });
    slide.addText(data.isHoldPoint ? '☑ Hold Point 위반' : '☐ Hold Point 위반 (N/A)', {
      x: 7.25, y: 2.45, w: 5.583, h: 0.35,
      fontFace: FONT_MALGUN, fontSize: 10.5, color: C_GRAY_TEXT, align: 'center', valign: 'middle'
    });

    // 발생원인 (인터뷰 결과)
    slide.addShape(pptx.ShapeType.rect, {
      x: 7.25, y: 2.85, w: 5.583, h: 0.35,
      fill: { color: C_YELLOW_BG }, line: { color: C_BORDER, width: 1 }
    });
    slide.addText('발생원인 (인터뷰 결과)', {
      x: 7.25, y: 2.85, w: 5.583, h: 0.35,
      fontFace: FONT_MALGUN, fontSize: 12.5, bold: true, color: C_YELLOW_DARK, align: 'center', valign: 'middle'
    });

    slide.addShape(pptx.ShapeType.rect, {
      x: 7.25, y: 3.20, w: 5.583, h: 0.85,
      fill: { color: 'FFFFFF' }, line: { color: C_BORDER, width: 1 }
    });
    slide.addText([
      { text: '[의견 : 안전관리자 및 시공관리자]\n', options: { fontSize: 10.5, bold: true, color: '000000', fontFace: FONT_MALGUN } },
      { text: data.interviewOpinion, options: { fontSize: 9.8, color: '222222', fontFace: FONT_MALGUN } }
    ], {
      x: 7.25, y: 3.20, w: 5.583, h: 0.85,
      margin: [4, 8, 4, 8], valign: 'middle', lineSpacingMultiple: 1.4
    });

    slide.addShape(pptx.ShapeType.rect, {
      x: 7.25, y: 4.05, w: 1.55, h: 0.95,
      fill: { color: 'F8FAFC' }, line: { color: C_BORDER, width: 1 }
    });
    slide.addText([
      { text: '[점검단 제안]\n', options: { fontSize: 10, bold: true, color: '000000', fontFace: FONT_MALGUN } },
      { text: `${data.proposalType}\n`, options: { fontSize: 15.5, bold: true, color: C_TITLE_BLUE, fontFace: FONT_MALGUN } },
      { text: data.proposalSub, options: { fontSize: 9, color: '595959', fontFace: FONT_MALGUN } }
    ], {
      x: 7.25, y: 4.05, w: 1.55, h: 0.95,
      align: 'center', valign: 'middle', lineSpacingMultiple: 1.2
    });

    slide.addShape(pptx.ShapeType.rect, {
      x: 8.80, y: 4.05, w: 4.033, h: 0.95,
      fill: { color: 'FFFFFF' }, line: { color: C_BORDER, width: 1 }
    });
    slide.addText(data.proposalContent, {
      x: 8.80, y: 4.05, w: 4.033, h: 0.95,
      fontFace: FONT_MALGUN, fontSize: 10, color: '000000', margin: [6, 10, 6, 10], valign: 'middle', lineSpacingMultiple: 1.35
    });

    // 개선대책 (현장 협의 결과)
    slide.addShape(pptx.ShapeType.rect, {
      x: 7.25, y: 5.05, w: 5.583, h: 0.35,
      fill: { color: C_YELLOW_BG }, line: { color: C_BORDER, width: 1 }
    });
    slide.addText('개선대책 (현장 협의 결과)', {
      x: 7.25, y: 5.05, w: 5.583, h: 0.35,
      fontFace: FONT_MALGUN, fontSize: 12.5, bold: true, color: C_YELLOW_DARK, align: 'center', valign: 'middle'
    });

    slide.addShape(pptx.ShapeType.rect, {
      x: 7.25, y: 5.40, w: 4.033, h: 1.80,
      fill: { color: 'FFFFFF' }, line: { color: C_BORDER, width: 1 }
    });
    const cmText = data.countermeasures.map(cm => `- ${cm}`).join('\n');
    slide.addText(cmText, {
      x: 7.25, y: 5.40, w: 4.033, h: 1.80,
      fontFace: FONT_MALGUN, fontSize: 10.2, color: '000000', margin: [8, 10, 8, 10], valign: 'middle', lineSpacingMultiple: 1.55
    });

    slide.addShape(pptx.ShapeType.rect, {
      x: 11.283, y: 5.40, w: 1.55, h: 1.80,
      fill: { color: 'F8FAFC' }, line: { color: C_BORDER, width: 1 }
    });
    slide.addText([
      { text: '[PM 판정결과]\n\n', options: { fontSize: 10, bold: true, color: '000000', fontFace: FONT_MALGUN } },
      { text: `${data.pmVerdict}\n`, options: { fontSize: 15.5, bold: true, color: C_TITLE_BLUE, fontFace: FONT_MALGUN } },
      { text: data.pmVerdictSub, options: { fontSize: 9, color: '595959', fontFace: FONT_MALGUN } }
    ], {
      x: 11.283, y: 5.40, w: 1.55, h: 1.80,
      align: 'center', valign: 'middle', lineSpacingMultiple: 1.2
    });
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
   * 브라우저 실시간 16:9 슬라이드 프리뷰 HTML 렌더링 (맑은 고딕 스타일, 템플릿 1·2 실물 100% 일치)
   */
  function renderInspectionSheetHTML(record, options = {}) {
    const { photo1Url = '', photo2Url = '', rulesFromTaxonomy = [] } = options;
    const data = normalizeJangpyoData(record, rulesFromTaxonomy);

    const rulesHtml = data.rules.map((r, i) => `
      <div style="margin-bottom: 3px; line-height: 1.45;">
        <span style="color: #ed7d31; font-weight: 700;">${['①', '②', '③', '④', '⑤'][i] || '•'}</span>
        <span style="color: #111111;">${r}</span>
      </div>
    `).join('');

    const countermeasuresHtml = data.countermeasures.map(cm => `
      <div style="margin-bottom: 6px; line-height: 1.55; color: #000000;">- ${cm}</div>
    `).join('');

    let photosHtml = '';
    if (photo1Url && photo2Url) {
      photosHtml = `
        <div style="display: flex; gap: 6px; width: 100%; height: 275px;">
          <img src="${photo1Url}" style="flex: 1; height: 100%; object-fit: cover; border-radius: 2px; border: 1px solid #7ba0cd;" onerror="this.style.display='none'">
          <img src="${photo2Url}" style="flex: 1; height: 100%; object-fit: cover; border-radius: 2px; border: 1px solid #7ba0cd;" onerror="this.style.display='none'">
        </div>
      `;
    } else if (photo1Url) {
      photosHtml = `
        <div style="width: 100%; height: 275px; display: flex; justify-content: center;">
          <img src="${photo1Url}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 2px; border: 1px solid #7ba0cd;" onerror="this.style.display='none'">
        </div>
      `;
    } else {
      photosHtml = `
        <div style="width: 100%; height: 275px; background: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 2px; display: flex; align-items: center; justify-content: center; color: #64748b; font-size: 0.95rem; font-weight: 600;">
          📸 현장 부적합 사진이 등록되지 않았습니다.
        </div>
      `;
    }

    return `
      <div id="jangpyoSlidePreview" style="
        min-width: 880px;
        width: 100%;
        max-width: 1020px;
        margin: 0 auto;
        background: #ffffff;
        border: 2px solid #5b9bd5;
        border-radius: 6px;
        box-shadow: 0 4px 16px rgba(0,0,0,0.12);
        padding: 14px;
        font-family: 'Malgun Gothic', '맑은 고딕', sans-serif;
        color: #000000;
        box-sizing: border-box;
      ">
        <!-- 1. 최상단 헤더 행 (5개 블록 - flex 레이아웃으로 견고하게 유지) -->
        <div style="display: flex; align-items: stretch; border: 1.5px solid #7ba0cd; margin-bottom: 6px; min-height: 74px;">
          <!-- 1) 시설물/법규 -->
          <div style="width: 140px; flex-shrink: 0; background: #dce6f1; border-right: 1.5px solid #7ba0cd; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 1.30rem; color: #002060; padding: 6px; letter-spacing: -0.5px;">
            시설물/법규
          </div>
          <!-- 2) 사고유형 & 등급 -->
          <div style="width: 135px; flex-shrink: 0; background: #ffffff; border-right: 1.5px solid #7ba0cd; border: 2px solid #ed7d31; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 4px; box-sizing: border-box;">
            <div style="font-weight: 800; font-size: 1.05rem; color: #000000; text-align: center;">${data.type}</div>
            <div style="font-weight: 800; font-size: 0.92rem; color: ${data.isMajor ? '#c00000' : '#ed7d31'};">[${data.severity}]</div>
          </div>
          <!-- 3) 관련기준 라벨 -->
          <div style="width: 65px; flex-shrink: 0; background: #dce6f1; border-right: 1.5px solid #7ba0cd; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 0.95rem; color: #002060; text-align: center; padding: 4px; line-height: 1.25;">
            관련<br>기준
          </div>
          <!-- 4) 관련기준 내용 (남는 공간 전체 100% 차지) -->
          <div style="flex: 1; min-width: 250px; background: #ffffff; border-right: 1.5px solid #7ba0cd; padding: 6px 12px; display: flex; flex-direction: column; justify-content: center; word-break: keep-all;">
            <div style="font-weight: 700; font-size: 0.86rem; color: #000000; margin-bottom: 3px;">${data.lawTitle}</div>
            <div style="font-size: 0.78rem; color: #333333; line-height: 1.4;">${data.lawBody}</div>
          </div>
          <!-- 5) 4대 발생요인 체크박스 -->
          <div style="width: 215px; flex-shrink: 0; background: #ffffff; padding: 6px 10px; display: flex; flex-direction: column; justify-content: center; font-size: 0.84rem; font-weight: 600; color: #000000; line-height: 1.55; white-space: nowrap;">
            <div>${data.isUnplanned ? '☑' : '☐'} 계획 미수립 &nbsp;&nbsp; ${data.isUnexecuted ? '☑' : '☐'} 계획 미이행</div>
            <div>${data.isAction ? '☑' : '☐'} 불안전 행동 &nbsp;&nbsp; ${data.isCondition ? '☑' : '☐'} 불안전 상태</div>
          </div>
        </div>

        <!-- 2. 부적합 개요 행 -->
        <div style="display: grid; grid-template-columns: 70px 1fr; border: 1.5px solid #7ba0cd; margin-bottom: 8px;">
          <div style="background: #ffe699; border-right: 1.5px solid #7ba0cd; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 0.95rem; color: #593e00; text-align: center; line-height: 1.25; padding: 6px;">
            부적합<br>개&nbsp;&nbsp;요
          </div>
          <div style="background: #ffffff; padding: 6px 12px; font-size: 0.86rem; display: flex; flex-direction: column; justify-content: center; gap: 4px; word-break: keep-all;">
            <div style="display: flex; gap: 12px; flex-wrap: wrap; color: #000000;">
              <span><strong style="color: #002060;">협력사 :</strong> ${data.subcontractor}</span>
              <span style="color: #7ba0cd;">|</span>
              <span><strong style="color: #002060;">공종명 :</strong> ${data.workGroup}</span>
              <span style="color: #7ba0cd;">|</span>
              <span><strong style="color: #002060;">작업장소 :</strong> ${data.location}</span>
              <span style="color: #7ba0cd;">|</span>
              <span><strong style="color: #002060;">점검자 :</strong> ${data.inspector}</span>
              <span style="color: #7ba0cd;">|</span>
              <span><strong style="color: #002060;">점검차수 :</strong> ${data.inspectRound}</span>
            </div>
            <div>
              <strong style="color: #002060; font-size: 0.88rem;">부적합 내용 :</strong>
              <span style="font-weight: 700; color: #000000; font-size: 0.88rem;"> ${data.mainContent}</span>
              ${data.redHighlight ? `<span style="color: #c00000; font-weight: 800; font-size: 0.88rem;"> &nbsp;↔ 지적 요인: ${data.redHighlight}</span>` : ''}
            </div>
          </div>
        </div>

        <!-- 3. 본문 2단 분할 (좌측: 사진/안전수칙 vs 우측: 발생원인/개선대책) -->
        <div style="display: grid; grid-template-columns: 1.15fr 1fr; gap: 10px;">
          <!-- 좌측 컬럼 -->
          <div style="display: flex; flex-direction: column; gap: 6px;">
            <!-- 적색 배너 타이틀 -->
            <div style="background: #ea7676; color: #ffffff; font-weight: 700; font-size: 0.95rem; text-align: center; padding: 6px 10px; border-radius: 2px; word-break: keep-all;">
              ${data.photoBannerTitle}
            </div>

            <!-- 현장 사진 영역 (275px로 꽉 차게 밀착) -->
            ${photosHtml}

            <!-- 근로자 이행 포인트 박스 -->
            <div style="background: #ffffff; border: 1.5px solid #e2e8f0; border-radius: 3px; padding: 8px 12px; font-size: 0.82rem; word-break: keep-all;">
              <div style="color: #ed7d31; font-weight: 800; font-size: 0.88rem; margin-bottom: 5px;">[근로자 이행 포인트]</div>
              ${rulesHtml}
            </div>
          </div>

          <!-- 우측 컬럼 -->
          <div style="display: flex; flex-direction: column; gap: 6px;">
            <!-- Hold point -->
            <div style="background: #ffffff; border: 1.5px solid #7ba0cd; border-radius: 2px; text-align: center; padding: 5px; font-size: 0.86rem; color: #595959; font-weight: 600;">
              ${data.isHoldPoint ? '☑ Hold Point 위반' : '☐ Hold Point 위반 (N/A)'}
            </div>

            <!-- 발생원인 (인터뷰 결과) -->
            <div style="border: 1.5px solid #7ba0cd; border-radius: 2px; overflow: hidden;">
              <div style="background: #ffe699; color: #593e00; font-weight: 800; font-size: 0.95rem; text-align: center; padding: 5px;">
                발생원인 (인터뷰 결과)
              </div>
              <div style="padding: 8px 10px; background: #ffffff; border-bottom: 1.5px solid #7ba0cd; word-break: keep-all;">
                <div style="font-weight: 700; font-size: 0.86rem; color: #000000; margin-bottom: 4px;">[의견 : 안전관리자 및 시공관리자]</div>
                <div style="font-size: 0.82rem; color: #222222; line-height: 1.45;">${data.interviewOpinion}</div>
              </div>
              <div style="display: grid; grid-template-columns: 110px 1fr; background: #ffffff;">
                <div style="background: #f8fafc; border-right: 1.5px solid #7ba0cd; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 8px 4px; text-align: center;">
                  <div style="font-size: 0.82rem; font-weight: 700; color: #000000;">[점검단 제안]</div>
                  <div style="font-size: 1.20rem; font-weight: 800; color: #002060; margin: 3px 0 1px 0;">${data.proposalType}</div>
                  <div style="font-size: 0.74rem; color: #595959;">${data.proposalSub}</div>
                </div>
                <div style="padding: 8px 10px; font-size: 0.82rem; color: #000000; line-height: 1.45; display: flex; align-items: center; word-break: keep-all;">
                  ${data.proposalContent}
                </div>
              </div>
            </div>

            <!-- 개선대책 (현장 협의 결과) -->
            <div style="border: 1.5px solid #7ba0cd; border-radius: 2px; overflow: hidden;">
              <div style="background: #ffe699; color: #593e00; font-weight: 800; font-size: 0.95rem; text-align: center; padding: 5px;">
                개선대책 (현장 협의 결과)
              </div>
              <div style="display: grid; grid-template-columns: 1fr 110px; background: #ffffff;">
                <div style="padding: 10px 12px; font-size: 0.84rem; color: #000000; border-right: 1.5px solid #7ba0cd; word-break: keep-all;">
                  ${countermeasuresHtml}
                </div>
                <div style="background: #f8fafc; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 8px 4px; text-align: center;">
                  <div style="font-size: 0.82rem; font-weight: 700; color: #000000;">[PM 판정결과]</div>
                  <div style="font-size: 1.20rem; font-weight: 800; color: #002060; margin: 3px 0 1px 0;">${data.pmVerdict}</div>
                  <div style="font-size: 0.74rem; color: #595959;">${data.pmVerdictSub}</div>
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
