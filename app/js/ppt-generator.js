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

  function _getNorm() {
    return (typeof globalThis !== 'undefined' && globalThis.SafeTextNormalizer)
      || (typeof window !== 'undefined' && window.SafeTextNormalizer)
      || null;
  }

  function _normSpacing(s) {
    const norm = _getNorm();
    return norm && typeof norm.normalizeKoreanSpacing === 'function'
      ? norm.normalizeKoreanSpacing(s)
      : String(s || '');
  }

  function _joinWrapped(prev, next) {
    const norm = _getNorm();
    if (norm && typeof norm.joinWrappedKoreanLines === 'function') {
      return norm.joinWrappedKoreanLines(prev, next);
    }
    const p = String(prev || '').trim();
    const n = String(next || '').trim();
    if (!p) return n;
    if (!n) return p;
    if (/^(?:으로|로|에서|에게|에는|도록|하여|하고|하며|했던|하였음|했음|하겠음|정되어|리하겠음)/.test(n)) {
      return `${p}${n}`;
    }
    return `${p} ${n}`.replace(/\s+/g, ' ');
  }

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

  function cleanWorkGroup(raw, content = '') {
    const norm = _getNorm();
    if (norm && typeof norm.mapToStandardWorkGroup === 'function') {
      return norm.mapToStandardWorkGroup(raw, content);
    }

    let cleaned = raw
      ? String(raw)
        .replace(/^(?:HEY|HA|HE|공종명?)\s*[:;：]?\s*/i, '')
        .replace(/[_|ㅣ¦!\[\]~—\-\r\n]+/g, ' ')
        .replace(/[^가-힣a-zA-Z0-9·()/\s]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
      : '';
    if (cleaned === '양중 및 운반작업' || cleaned === '양중작업' || cleaned === '공통') cleaned = '';

    const comb = `${cleaned} ${content}`;
    if (/^(?:HA|HE|HEY|BEE)\s*공사$/i.test(cleaned) || comb.includes('비계')) return '비계공사';
    if (/pl\s*창호|창호\s*\(\s*pl\s*\)|피엘\s*창호|창호.*유리/i.test(comb)) return '창호공사(PL)';
    if (/al\s*창호|창호\s*\(\s*al\s*\)/i.test(comb)) return '창호공사(AL)';
    if (/stl\s*창호|창호\s*\(\s*stl\s*\)/i.test(comb)) return '창호공사(STL)';
    if (/^가설\s*전기(?:공사)?$|^임시\s*전기|^설비[·/]전기|분전함|분전반|차단기|충전부|누전|가설전선|접지선/i.test(comb)) return '가설전기공사';
    if (/^p\.?c\s*(?:공사|작업)?$|^피씨\s*공사$|프리캐스트/i.test(cleaned)) return 'PC공사';
    const hasElecOrWinCtx = /창호|pl\s*창호|분전반|분전함|차단기|충전부|누전|가설전선|접지선|전등|소켓|심선/.test(content);
    const hasFormCtx = /형틀|거푸집|동바리|유로폼|알폼|갱폼|서포트/.test(content);
    if (cleaned === '거푸집동바리공사' && (hasFormCtx || !hasElecOrWinCtx)) return '거푸집동바리공사';
    if (cleaned && cleaned.length >= 2 && cleaned !== '거푸집동바리공사') return cleaned;
    if (/창호/.test(comb)) return '창호공사(기타)';
    if (/p\.?c\s*공사|피씨\s*공사|프리캐스트|pc\s*(?:기둥|보|슬래브|부재)/i.test(comb)) return 'PC공사';
    if (hasFormCtx) return '거푸집동바리공사';
    if (/지게차|하역|운반|양중|크레인/.test(comb)) return '가설공사(건설장비)';
    if (comb.includes('철근')) return '철근공사';
    if (comb.includes('토공') || comb.includes('흙막이')) return '흙막이/차수공사';

    return cleaned || '건축공사(기타)';
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
      .replace(/HEL\s*설치\s*불량/g, '버팀대 설치 불량');
  }

  function cleanLocation(raw, content = '', workGroup = '') {
    let s = String(raw || '').trim();
    if (!s && content) {
      const mDong = String(content).match(/(\d{1,4}\s*동[^\n,.()]{0,30}|지하\s*\d+\s*층[^\n,.()]{0,20}|상가동[^\n,.()]{0,20})/);
      if (mDong) s = mDong[1];
    }
    if (!s) return '';

    s = s
      .replace(/^작업장소\s*[:;：.]?\s*/i, '')
      .replace(/\[\s*ERE\b[^\n]*$/i, '')
      .replace(/\b(?:EERE|ERE|EEE|EEL|CERNE|SEAT|MAK|261k|ee|ere|드로|리로)\b(?:\s*[:;=]?\s*[a-zA-Z0-9]+)*/gi, ' ')
      .replace(/(?:점검자?|점검차수|점검\s*[a-zA-Z0-9]?|차수|부적합)[\s\S]*$/i, '')
      .replace(/\b[a-zA-Z]\b/g, ' ')
      .replace(/[\[\]{}()_ㅣ¦!~—:;]+/g, ' ')
      .replace(/\s+(?:리|로|드|트|르|점|검)\s*$/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    // 1075 35 1코어 복원 (동=5, 층=5 오인식 정밀 복원)
    s = s.replace(/\b1?(10[1-9]|1[1-9]\d)[358등]\s+([1-9]|1\d|2d|3\d)[358측증]\s*(?=\d+\s*코어|코어)/g, '$1동 $2층 ');
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

    // 107동 3층 1코어, 101동 외부 등 온전한 건물/동/층/코어/구간 명칭 보존
    const mFull = s.match(/(?:\d{1,4}\s*동|상가동|주차장동|본동|복리시설동)?(?:\s*(?:지[상하]\s*\d+\s*층|\d+\s*층|\d+\s*코어|코어|PIT|피트|옥상|지붕|단부|계단실|EV홀|복도|주차장|상가동|후면|전면|측면|외부|동측|서측|남측|북측|외부비계|워킹타워|\d+구간|\w+구간|외벽|내벽|슬래브|바닥|천장|[0-9가-힣]+))+/i);
    if (mFull && mFull[0] && mFull[0].trim().length >= 2) {
      const candidate = mFull[0].replace(/\s+/g, ' ').trim();
      if (!/^[a-zA-Z\s,]+$/.test(candidate)) return candidate;
    }

    return s;
  }

  function cleanSubcontractor(raw) {
    if (!raw) return '';
    const cleaned = String(raw)
      .replace(/^(?:협력사|공종명?)\s*[:;：]?\s*/i, '')
      .replace(/[^가-힣a-zA-Z0-9()주\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!cleaned || cleaned.length < 2) return '';
    if (/(?:공사|비계|거푸집|동바리|철근|콘크리트|양중|토공|작업|점검|장소|차수|비어|없음|미정|해당없음|원영건업|HEY|HA\b|HE\b|BEE)/i.test(cleaned)) {
      return '';
    }
    return cleaned;
  }

  function _escHtmlText(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /**
   * [발생원인 (인터뷰 결과)] 다중 의견([근로자 의견 : ...], [관리자 의견 : ...]) 및 단일 의견 레이아웃 계산
   */
  function resolveInterviewOpinionLayout(data) {
    let sections = Array.isArray(data && data.interviewSections) ? data.interviewSections : [];
    if (sections.length < 2 && data && data.interviewOpinion) {
      const norm = _getNorm();
      if (norm && typeof norm.parseInterviewOpinions === 'function') {
        const parsed = norm.parseInterviewOpinions(data.interviewOpinion);
        if (parsed && Array.isArray(parsed.sections) && parsed.sections.length >= 2) {
          sections = parsed.sections;
        }
      }
    }
    const validSections = sections.filter(s => s && (s.title || s.text || (Array.isArray(s.items) && s.items.length > 0)));
    if (validSections.length >= 2) {
      const normalized = validSections.map(s => ({
        title: String(s.title || '[의견]').trim(),
        bodyText: String(s.text || (Array.isArray(s.items) ? s.items.map(x => `- ${String(x || '').trim()}`).join('\n') : '')).trim()
      }));
      const combinedBodies = normalized.map(s => s.bodyText).filter(Boolean).join('\n');
      const totalChars = normalized.reduce((acc, s) => acc + s.title.length + s.bodyText.length, 0);
      const lineSpacing = totalChars > 130 ? 1.04 : 1.08;
      // 4.9213 x 1.3773 박스 내부에서 각 헤더 높이(~0.23in)를 제외한 본문 가용 높이 계산
      const availBodyHeight = Math.max(0.55, 1.28 - (normalized.length * 0.23));
      const fontSize = calcFitMultilineFontSize(
        combinedBodies,
        4.9213 - (8.5 / 72),
        availBodyHeight,
        10.5,
        8.0,
        lineSpacing,
        [4, 8, 3, 6]
      );
      const headerFontSize = Math.min(12.0, Math.max(9.5, fontSize + 1.5));
      return {
        isMulti: true,
        sections: normalized,
        fontSize,
        headerFontSize,
        lineSpacing,
        margin: [4, 8, 3, 6]
      };
    }

    const singleBody = (data && data.interviewOpinion) || '';
    const lineSpacing = singleBody.length > 110 ? 1.08 : 1.14;
    const fontSize = calcFitMultilineFontSize(singleBody, 4.9213 - (8.5 / 72), 1.02, 12, 9.5, lineSpacing, [6, 8, 4, 6]);
    return {
      isMulti: false,
      sections: [{
        title: (data && data.interviewAuthorTitle) || '[의견 : 시공관리자 및 근로자]',
        bodyText: singleBody
      }],
      fontSize,
      headerFontSize: 14,
      lineSpacing,
      margin: [5, 8, 4, 6]
    };
  }

  function buildInterviewOpinionTextRuns(data) {
    const plan = resolveInterviewOpinionLayout(data);
    if (!plan.isMulti) {
      const single = plan.sections[0];
      const intBodyRuns = buildHangingBulletRuns(single.bodyText, plan.fontSize, '111111', FONT_MALGUN, 8.5);
      return {
        plan,
        runs: [
          {
            text: single.title,
            options: {
              fontSize: 14,
              bold: true,
              color: C_SUBHEADER_TEXT,
              fontFace: FONT_MALGUN,
              bullet: false,
              breakLine: intBodyRuns.length > 0,
              paraSpaceAfter: 5
            }
          },
          ...intBodyRuns
        ]
      };
    }

    const runs = [];
    plan.sections.forEach((sec, idx) => {
      const isLast = idx === plan.sections.length - 1;
      const bodyRuns = buildHangingBulletRuns(sec.bodyText, plan.fontSize, '111111', FONT_MALGUN, 8.5);
      runs.push({
        text: sec.title,
        options: {
          fontSize: plan.headerFontSize,
          bold: true,
          color: C_SUBHEADER_TEXT,
          fontFace: FONT_MALGUN,
          bullet: false,
          breakLine: bodyRuns.length > 0 || !isLast,
          paraSpaceBefore: idx > 0 ? 3 : 0,
          paraSpaceAfter: 1
        }
      });
      if (bodyRuns.length > 0) {
        bodyRuns.forEach((run, rIdx) => {
          const isLastRunOfSection = rIdx === bodyRuns.length - 1;
          if (!isLast && isLastRunOfSection) {
            runs.push({
              ...run,
              options: { ...(run.options || {}), breakLine: true }
            });
          } else {
            runs.push(run);
          }
        });
      }
    });
    return { plan, runs };
  }

  function _splitBulletLinesShared(rawText) {
    const src = String(rawText || '').replace(/\r\n/g, '\n').trim();
    if (!src) return [];
    const out = [];
    src.split('\n').forEach((line) => {
      const cleaned = line.trim();
      if (!cleaned) return;
      const parts = cleaned.split(/\s+(?=-\s+|[•▪]\s*)/).map((s) => s.trim()).filter(Boolean);
      parts.forEach((p) => out.push(p));
    });
    return out;
  }

  function renderInterviewOpinionBoxHTML(data, ptFn, tplEngine) {
    const fitSingle = (tplEngine && tplEngine.fitSingleLineByAbbr) || ((s) => String(s || '').trim());
    const fitMulti = (tplEngine && tplEngine.fitMultilineByAbbr) || ((lines) => (Array.isArray(lines) ? lines : _splitBulletLinesShared(lines)));

    let sections = [];
    if (Array.isArray(data && data.interviewSections) && data.interviewSections.length) {
      sections = data.interviewSections.map((sec) => ({
        title: sec.title || '',
        lines: (Array.isArray(sec.items) && sec.items.length)
          ? sec.items
          : ((Array.isArray(sec.lines) && sec.lines.length) ? sec.lines : _splitBulletLinesShared(sec.text || sec.body || ''))
      }));
    } else {
      const rawIv = String((data && data.interviewOpinion) || '').replace(/\r\n/g, '\n').trim();
      const headerRe = /\[[^\]]*의견[^\]]*\]/g;
      const matches = [...rawIv.matchAll(headerRe)];
      if (matches.length >= 1) {
        matches.forEach((m, idx) => {
          const start = m.index + m[0].length;
          const end = idx + 1 < matches.length ? matches[idx + 1].index : rawIv.length;
          sections.push({
            title: m[0].trim(),
            lines: _splitBulletLinesShared(rawIv.slice(start, end))
          });
        });
      } else {
        sections = [{
          title: (data && data.interviewAuthorTitle) || '[의견 : 시공관리자 및 안전관리자]',
          lines: _splitBulletLinesShared(rawIv)
        }];
      }
    }

    const ivHeaderCount = sections.filter((s) => s.title).length;
    const ivAvailBodyH = Math.max(0.45, 1.48 - ivHeaderCount * 0.34);
    const ivPerSecH = ivAvailBodyH / Math.max(1, sections.length);
    const gap9pt = ptFn(9);

    return sections.map((sec, idx) => {
      const isLastSec = idx === sections.length - 1;
      const titleStr = sec.title ? fitSingle(sec.title, 4.75, 14) : '';
      const bodyLines = fitMulti(sec.lines || [], 4.75, ivPerSecH, 12, 1.0, 9);
      const titleHtml = titleStr
        ? `          <div style="font-size: ${ptFn(14)}; font-weight: 800; color: #000000; line-height: 1.08; margin: 0 0 ${gap9pt} 0;">${_escHtmlText(titleStr)}</div>\n`
        : '';
      const bodyHtml = bodyLines.length
        ? `          <div style="font-size: ${ptFn(12)}; font-weight: 400; line-height: 1.08; color: #000000; word-break: keep-all; margin: 0 0 ${isLastSec ? '0' : gap9pt} 0;">${renderHangingLinesHTML(bodyLines.join('\n'), gap9pt)}</div>`
        : '';
      return titleHtml + bodyHtml;
    }).join('\n');
  }

  function cleanContent(raw) {
    if (!raw) return '';
    let rawStr = String(raw || '');
    rawStr = rawStr.replace(/\s+[a-z]\s*\d+\s*\{[\s\S]*$/i, '');
    rawStr = rawStr.replace(/\s+[a-z0-9]\s+[0-9]+[a-z0-9{}.…\s]*$/gi, '');
    rawStr = rawStr.replace(/\.{3,}[가-힣a-zA-Z0-9\s.]*$/g, '');
    rawStr = rawStr.replace(/a\s*0\s*2\s*\{[\s\S]*$/gi, '');
    let s = healSafetyKoreanLexicon(rawStr)
      .replace(/^부적합\s*(?:내용|사항)\s*[:;：]?\s*/, '')
      .replace(/^[|ㅣ¦_!~\-\s]+/, '')
      .replace(/(?:EE\s*tee|ee\s*A\s*eA|바가\s*---|\btee\s*ee\b|ATER\s*TH|isdios|eevee|[—\-_]{3,})[\s\S]*$/gi, '')
      .replace(/6\/\\\s*코어/gi, 'E/V 코어')
      .replace(/6\/\s*코어/gi, 'E/V 코어')
      .replace(/6\/\\/g, 'E/V')
      .replace(/4%\s*11일/g, '4월 11일')
      .replace(/\(55(?:00|60|em|cm)?[^)]*\)/gi, '(55cm)')
      .replace(/5560\s*[ㅁm7]+|5500\b|55em\b/gi, '55cm')
      .replace(/30000\s*이하|3000\)?\s*이하|3060\s*이하/g, '30cm 이하')
      .replace(/HEL\s*설치\s*불량/g, '버팀대 설치 불량')
      .replace(/HE\s*위치가/g, '버팀대 위치가')
      .replace(/충렬선상\s*미실지\s*중/g, '동일선상 미설치 등')
      .replace(/미설치\s*[52등중]\)?/g, '미설치 등)')
      .replace(/(?:—|->|-)\s*4월\s*11일/g, '→ 4월 11일')
      .replace(/\s+(?=→\s*4월\s*11일)/g, '\n')
      .replace(/(?:^|[^\n])\s*(?=[2-9]\)\s*[가-힣A-Za-z])/g, m => (m && m[0] && m[0] !== '\n' && !/\s/.test(m[0]) ? `${m[0]}\n` : '\n'));

    const lines = s.split(/\r?\n/)
      .map(l => _normSpacing(l.replace(/^[|ㅣ¦_!~\-\s]+/, '').replace(/[|ㅣ¦_!~\-\s:。ㅎ]+$/, '').trim()))
      .filter(l => {
        if (l.length < 3) return false;
        if (/^[—\-_\s]+ee\b/i.test(l)) return false;
        if (/^1\s*벽이음\s*설치\s*위치와/.test(l) || /충렬선상|미실지/.test(l)) return false;
        const kor = (l.match(/[가-힣]/g) || []).length;
        const eng = (l.match(/[a-zA-Z]/g) || []).length;
        if (kor === 0 && eng > 4) return false;
        if (eng > kor * 2 && eng >= 6) return false;
        return true;
      });
    return lines.join('\n');
  }

  function cleanOpinionText(raw, options = {}) {
    if (!raw) return '';
    // 수기 직접 입력된 인터뷰 의견은 원문 그대로 보존 (자름/임의 '-' 부착/문장 변형 전면 금지)
    if (options && options.preserveVerbatim) {
      return String(raw).replace(/\r\n/g, '\n').trim();
    }
    const preCleaned = healSafetyKoreanLexicon(String(raw))
      .replace(/\[?\s*(?:HAT|점검단)\s*제안\]?[\s\S]*$/gi, '')
      .replace(/oo\s*(?:Tle|기느으|기느|기|©)[\s\S]*?(?=-|[가-힣])/gi, '')
      .replace(/(?:EE\s*tee|ee\s*A\s*eA|바가\s*---|\btee\s*ee\b|ATER\s*TH|isdios|SHE\s*SEA|[—\-_]{3,})[\s\S]*$/gi, '')
      .replace(/^[^\n]*?(?:절경\s*열수\s*갤|BT\s*ROSH|Deen\s*lp)[^\n]*?=\s*-\s*/i, '- ')
      .replace(/^[^\n]*?=\s*-\s*/, '- ')
      .replace(/\[\s*(?:HAA|HAT|점검단)[\s\S]*?\]/gi, '')
      .replace(/[\s|ㅣ¦_!~—\-]*[블를클|ㅣ¦_!~—\-]+$/g, '')
      .replace(/\[=\]\s*oa/gi, '')
      .trim();

    const norm = _getNorm();
    if (norm && typeof norm.parseInterviewOpinions === 'function') {
      const parsed = norm.parseInterviewOpinions(preCleaned);
      if (parsed && (parsed.hasMulti || (options.preserveHeaders && parsed.sections.length > 0))) {
        return parsed.hasMulti
          ? parsed.formatted
          : parsed.sections.map(sec => (sec.text ? `${sec.title}\n${sec.text}` : sec.title)).join('\n');
      }
      if (parsed && parsed.sections && parsed.sections.length === 1 && parsed.sections[0].text) {
        return parsed.sections[0].text;
      }
    }

    let s = preCleaned
      .replace(/\[\s*(?:[가-힣a-zA-Z\s]{0,15}?의견|의견|면담|인터뷰)[^\]]*\]/gi, '')
      .replace(/^\s*[-•·▪]?\s*(?:관리자|근로자|작업자|담당자|관계자)\s*의견\s*[:：][^\n]*\n?/gim, '')
      .trim();

    s = typeof window !== 'undefined' && window.SafeTextNormalizer?.splitInlineBullets
      ? window.SafeTextNormalizer.splitInlineBullets(s)
      : s.replace(/(?:(?<=[.!?\]\)])\s*|(?<=[가-힣A-Za-z0-9])\s+)[-•*·▪]\s*(?=[가-힣A-Za-z0-9(\[])/g, '\n- ');

    const rawLines = s.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const items = [];
    for (let l of rawLines) {
      if (/^[-•*·▪\s]*\[?\s*(?:관리자|근로자|관계자|담당자|시공자|해당\s*근로자)?\s*의견\s*[:;：]/i.test(l)) continue;
      const hasDash = /^[-•*·▪]\s*/.test(l);
      const isBulletStart = hasDash || /^\d+[\).]\s*/.test(l);
      let text = l.replace(/^[|\sㅣ¦_!\-•·~—*.©=]+/, '').replace(/^\d+[\).]\s*/, '').replace(/^[|\sㅣ¦_!\-•·~—*.©=]+/, '').replace(/[|\sㅣ¦_!~—\-*]+$/, '').trim();
      if (!text || text.length < 2) continue;
      if (items.length === 0 || isBulletStart) {
        items.push({ text, hasDash });
      } else {
        items[items.length - 1].text = _joinWrapped(items[items.length - 1].text, text);
      }
    }
    if (items.length === 0) return '';
    // 원본/PDF 스캔에 '-'가 있을 때만 '- ' 유지, 없으면 임의 '-' 부착 금지 (Point #5)
    return items.map(it => `${it.hasDash ? '- ' : ''}${_normSpacing(healSafetyKoreanLexicon(it.text))}`).join('\n');
  }

  function cleanProposalText(raw) {
    if (!raw) return '';
    let s = healSafetyKoreanLexicon(String(raw))
      .replace(/\[?(?:점검단|HAT)\s*제안\]?/gi, '')
      .replace(/시스템\s*개선|교육\s*[\/·]\s*코칭|제재\s*[\/·]\s*징계|패널티|페널티|\((?:현장\s*)?모니터링\s*강화\)|\(이행강화안\s*수립\)|\(\s*(?:근로자|협력사|작업팀|해당\s*작업팀)\s*교육\s*\)|\(\s*해당\s*작업팀\s*대기\s*\)|\(관리감독자\s*경고\)/gi, '')
      .replace(/^(?:[-•*·▪\s]*)(?:De\s*T=?\s*©?|oo\s*Tle\s*©?|구시\s*으\s*기느으|oo\s*기느으|구시\s*으|기느으|-?\s*SHE\s*SEA)[\s\S]*?(?=\d|1차|-|[가-힣]{2})/gi, '')
      .replace(/De\s*T=?\s*©?|구시\s*으\s*기느으|oo\s*Tle\s*©?|oo\s*기느으|SHE\s*SEA/gi, '')
      .replace(/(?:EE\s*tee|ee\s*A\s*eA|바가\s*---|\btee\s*ee\b|ATER\s*TH|isdios|[—\-_]{3,})[\s\S]*$/gi, '')
      .replace(/[\s|ㅣ¦_!~—\-]*[블를클르|ㅣ¦_!~—\-]+$/g, '')
      .trim();

    // 원문에 불릿('-'/'•')이 포함된 경우에만 줄바꿈 분리
    s = typeof window !== 'undefined' && window.SafeTextNormalizer?.splitInlineBullets
      ? window.SafeTextNormalizer.splitInlineBullets(s)
      : s.replace(/(?:(?<=[.!?\]\)])\s*|(?<=[가-힣A-Za-z0-9])\s+)[-•*·▪]\s*(?=[가-힣A-Za-z0-9(\[])/g, '\n- ');

    const rawLines = s.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const items = [];
    for (const line of rawLines) {
      const hasDash = /^[-•*·▪]\s*/.test(line);
      const isBulletStart = hasDash || /^\d+[\).]\s*/.test(line);
      let cl = line.replace(/^[|\sㅣ¦_!\-•·~—*.©=]+/, '').replace(/^\d+[\).]\s*/, '').replace(/^[|\sㅣ¦_!\-•·~—*.©=]+/, '').replace(/[|\sㅣ¦_!~—\-*]+$/, '').trim();
      if (!cl || cl.length < 2 || /^[블를클르]$/.test(cl)) continue;
      if (items.length === 0 || isBulletStart) {
        items.push({ text: cl, hasDash });
      } else {
        items[items.length - 1].text = _joinWrapped(items[items.length - 1].text, cl);
      }
    }
    return items.map(it => `${it.hasDash ? '- ' : ''}${_normSpacing(healSafetyKoreanLexicon(it.text))}`).join('\n');
  }

  function cleanActionPlan(raw) {
    if (!raw) return '';
    const rawStr = healSafetyKoreanLexicon(String(raw));
    const origStartsWithDash = /^\s*[-•*·▪]\s*/.test(rawStr);
    if (rawStr.includes('보완/개선') && rawStr.includes('Process')) {
      return `${origStartsWithDash ? '- ' : ''}비계 승인점검 후 보완/개선 필요사항 조치완료 후 최종승인 및 Tag 부착 Process 이행`;
    }
    const cleanedStr = rawStr
      .replace(/\[?\s*PM\s*판정\s*결과\s*\]?/gi, '')
      .replace(/시스템\s*개선|교육\s*[\/·]\s*코칭|제재\s*[\/·]\s*징계|패널티|페널티/gi, '')
      .replace(/\((?:현장\s*)?모니터링\s*강화\)|\(이행강화안\s*수립\)|\(\s*(?:근로자|협력사|작업팀|해당\s*작업팀)\s*교육\s*\)|\(\s*해당\s*작업팀\s*대기\s*\)|\(관리감독자\s*경고\)/gi, '')
      .replace(/(?:EE\s*tee|ee\s*A\s*eA|바가\s*---|\btee\s*ee\b|ATER\s*TH|isdios|[—\-_]{3,})[\s\S]*$/gi, '')
      .replace(/위[험혐협형횸][성승송]?\s*평[가기ㅇ아어0-9]?/g, '위험성평가')
      .replace(/30000\s*이하|3000\)?\s*이하|3060\s*이하/g, '30cm 이하')
      .replace(/5560\s*[ㅁm7]+|5500\b|55em\b/gi, '55cm')
      .replace(/혐식적/g, '형식적')
      .replace(/(?:5045|5145|SNS)\s*[내U]\s*등록/gi, 'SNS내 등록')
      .replace(/5045내|5145내|SNSU|SNS\s*U\b/gi, 'SNS내')
      .replace(/시스템\s*구죽/g, '시스템 구축');
    const bulletSplitStr = typeof window !== 'undefined' && window.SafeTextNormalizer?.splitInlineBullets
      ? window.SafeTextNormalizer.splitInlineBullets(cleanedStr)
      : cleanedStr.replace(/(?:(?<=[.!?\]\)])\s*|(?<=[가-힣A-Za-z0-9])\s+)[-•*·▪]\s*(?=[가-힣A-Za-z0-9(\[])/g, '\n- ');
    const finalActionStr = bulletSplitStr
      .replace(/,\s*-\s*/g, '\n- ')
      .trim();

    const rawLines = finalActionStr.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const items = [];
    for (const line of rawLines) {
      const hasExplicitBullet = /^[-•*·▪]\s*/.test(line);
      let cl = line.replace(/^[|ㅣ¦_!~—\-*•·.\s&]+/, '').replace(/[|ㅣ¦_!~—\-&]+$/, '').trim();
      if (!cl || cl.length < 2) continue;
      if (/(?:사각후크|그림\s*참조|상하\s*방향|900mm|보강\s*예|시스템\s*개선|교육\s*[\/·]\s*코칭|제재\s*[\/·]\s*징계|&제레)/i.test(cl) || /[&제테텍레]{3,}/.test(cl)) continue;

      if (cl.includes('비계 승인점검 후 보완/개선') || cl.includes('Process 이행')) {
        return `${hasExplicitBullet || origStartsWithDash ? '- ' : ''}비계 승인점검 후 보완/개선 필요사항 조치완료 후 최종승인 및 Tag 부착 Process 이행`;
      }

      const isContinuation = /^(?:재수립\s*후|모니터링\s*강화|전수\s*점검|받침목\s*추가|\(또는\s*버림틀|낙하물\s*방지망\s*추가|이격거리\s*30cm|이격거리\s*표기|설치\s*완료|조치완료\s*후|방안\s*수립)/.test(cl);
      const isDistinctNewItem = hasExplicitBullet || (!isContinuation && (
        /^(?:벽체\s*거푸집|거푸집\s*전도\s*예방|벽이음용\s*상부|비계\s*잭베이스\s*구간|비계와\s*구조물|시스템\s*비계\s*설치계획서|비계\s*승인점검|비계\s*설치\s*작업\s*시|작업\s*전\s*풍속|갱폼|동바리|인양팀|당사|본사|유관부서|1차적으로|2차적으로|형식적인)/.test(cl) ||
        (items.length > 0 && /(?:필요|수립|실시|적용|조치|완료|확인|구축|반영)[.!?]?$/.test(items[items.length - 1].text))
      ));

      if (items.length === 0 || isDistinctNewItem) {
        items.push({ text: cl, hasDash: hasExplicitBullet });
      } else {
        items[items.length - 1].text = _joinWrapped(items[items.length - 1].text, cl);
      }
    }
    return items.map(it => `${it.hasDash ? '- ' : ''}${_normSpacing(healSafetyKoreanLexicon(it.text))}`).join('\n');
  }

  /**
   * 관련 기준 정제 (하드코딩 키워드 매핑 전면 제거 — 원본·학습된 지침·AI 결과만 존중)
   */
  function simplifyLawTitle(law, text = '') {
    const s = String(law || '').replace(/직[계게개]차|지[계개제]차/g, '지게차').trim();
    if (!s) return '';
    const norm = _getNorm();
    if (norm && typeof norm.normalizeSafetyLawSpec === 'function') {
      const spec = norm.normalizeSafetyLawSpec({ rawLaw: s, contextText: text });
      return spec.title || '';
    }
    const articles = [...s.matchAll(/제\s*(\d+)\s*조/g)].map(m => `제${m[1]}조`);
    if (articles.length > 0 && /^(?:산업)?안전보건(?:기준에\s*관한\s*)?규칙/.test(s)) {
      return `안전보건규칙 ${[...new Set(articles)].join(', ')}`;
    }
    return s;
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

  function cleanBannerText(rawBanner, content) {
    const norm = _getNorm();
    const stripSecondItem = (txt = '') => (norm && typeof norm.stripBannerSecondItemTail === 'function')
      ? norm.stripBannerSecondItemTail(txt)
      : String(txt || '')
          .replace(/(?:^|\r?\n|\s+|(?<=[가-힣A-Za-z.)\]]))\s*(?<![0-9(])[2-9]\)\s*[\s\S]*$/g, '')
          .replace(/(?:\r?\n|\s+)\s*[2-9]\.\s+(?=[가-힣A-Za-z\[])[\s\S]*$/g, '')
          .replace(/(?<=.{4})\s*[②③④⑤⑥⑦⑧⑨⑩][\s\S]*$/g, '')
          .replace(/^[①②③④⑤⑥⑦⑧⑨⑩]\s+/, '')
          .replace(/^1\)\s*/, '')
          .trim();
    const stripCircled = (str) => (norm && typeof norm.stripCircledNumbers === 'function')
      ? norm.stripCircledNumbers(stripSecondItem(str))
      : stripSecondItem(str).replace(/[\u2460-\u2487\u2776-\u277F]/g, ' ').replace(/\s+/g, ' ').trim();
    let s = stripCircled(_normSpacing(String(rawBanner || '').replace(/\s+/g, ' ').trim()));
    if (/벽의음|6055|버팀대|설치각도/.test(s) && /버팀대/.test(content || '')) {
      return '벽이음용 상부 버팀대 설치각도(60도↓) 불량';
    }
    if (norm && typeof norm.extractCoreViolationBanner === 'function') {
      const condensed = stripCircled(norm.extractCoreViolationBanner(s, content));
      if (condensed && condensed.length >= 4 && !isGenericTaxonomyLabel(condensed)) {
        return condensed;
      }
    }

    s = s
      .replace(/^[①②③④⑤⑥⑦⑧⑨⑩123458\s()\[\].\-_]+(?=[가-힣A-Za-z])/, '')
      .replace(/^[①②③④⑤⑥⑦⑧⑨⑩]\s*/, '')
      .replace(/벽의음/g, '벽이음')
      .replace(/상부0버팀대8/g, '상부 버팀대 ')
      .replace(/\(6055\)\s*\(?불량\)?/g, '(60도↓) 불량')
      .replace(/[^\w가-힣ㄱ-ㅎㅏ-ㅣ↓↑\s/()\-.,]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    // 결과/우려 꼬리 제거 및 복수 항목('1)...2)...') 핵심 위반사항만 추출
    const cAll = stripSecondItem(_normSpacing(healSafetyKoreanLexicon(String(content || s).replace(/^부적합\s*(?:내용|사항)\s*[:;：]?\s*/, '').trim())));
    if (/접지선/.test(cAll) && /고정\s*불량|용량\s*부족/.test(cAll)) return '접지선 볼트 고정 불량 및 용량 부족';
    if (/지게차/.test(cAll) && /근접/.test(cAll)) return '유도원·근로자 지게차 근접 작업';
    if (/충전부/.test(cAll) && /노출/.test(cAll)) return '분전함 차단기 충전부 노출';

    s = stripSecondItem(s);
    if (/[2-9]\)|발생\s*시|충돌\s*우려|감전\s*우려|대지로\s*방전/.test(s)) {
      s = stripSecondItem(s.split(/(?=[2-9]\)\s*[가-힣A-Za-z])/)[0])
        .replace(/(?:으로|로)\s*(?:인해|인한)?\s*(?:누설전류|감전|추락|붕괴|충돌|협착|대지로)[\s\S]*$/g, '')
        .replace(/\s*(?:충돌|추락|감전)\s*우려[\s\S]*$/g, '')
        .trim();
    }

    // 말줄임표(...) 절단 복원
    if ((s.endsWith('...') || s.endsWith('…') || s.endsWith('..') || /\.\.\.$/.test(s) || s.length < 5) && content) {
      if (/Gang\s*Form|갱폼|선해체/i.test(cAll)) return '절곡부위 Gang Form 선해체 방지커버 설치 불량';
      if (/동바리|AL\s*Form|알폼/i.test(cAll) && /해체|미복구/.test(cAll)) return '콘크리트 타설 중 계단참 AL Form 동바리 미복구';
      if (/밑둥잡이|워킹타워/i.test(cAll)) return '비계 워킹타워 하부 밑둥잡이 일부 누락';
      if (/버팀대|설치각도/.test(cAll)) return '외부비계 벽이음용 버팀대 설치각도 기준 미준수';
    }

    s = s.replace(/\.{2,}/g, '').replace(/[.·\s]+$/, '').trim();
    if (/Gang\s*Form|갱폼|선해체/i.test(s) && (s.includes('절곡부위') || s.includes('간섭')) && !s.includes('설치 불량') && !s.includes('설치불량')) return '절곡부위 Gang Form 선해체 방지커버 설치 불량';
    if (/AL\s*Form|알폼|동바리/i.test(s) && /계단참/.test(s) && !s.includes('미복구')) return '콘크리트 타설 중 계단참 AL Form 동바리 미복구';

    const hasDigitHangulGlue = /\d[가-힣]|[가-힣]\d[가-힣]/.test(s.replace(/\d+(?:도|단|층|동|차|호|개소|cm|mm)/gi, ''));
    const hangulCount = (s.match(/[가-힣]/g) || []).length;
    const isTechnicalForm = /Gang\s*Form|AL\s*Form|갱폼/i.test(s);
    if (!hasDigitHangulGlue && (hangulCount >= 4 || isTechnicalForm) && s.length >= 5 && (isTechnicalForm || hangulCount / s.length >= 0.4)) {
      return s.replace(/^[①②③④⑤⑥⑦⑧⑨⑩]\s*/, '');
    }
    return '';
  }

  /**
   * 줄바꿈 시 불릿(-, *, 1), 2), 9), 10), →) 기준 내어쓰기(Hanging Indent) HTML 렌더링 헬퍼
   * - paraGapCss: 원본 R1 단락 뒤 간격 (발생원인 9pt, 점검단제안 3pt, 개선대책 6pt, 관련기준 0)
   */
  function renderHangingLinesHTML(text, paraGapCss = '0') {
    if (!text) return '';
    const lines = String(text).split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    return lines.map((line, idx) => {
      const mb = idx < lines.length - 1 ? paraGapCss : '0';
      const m = line.match(/^([-*•·▪]\s+|\d{1,2}[\.)]\s+|→\s*)(.+)$/);
      if (m) {
        return `<div style="display:flex;align-items:flex-start;margin:0 0 ${mb} 0;"><span style="flex:0 0 auto;white-space:pre;">${_escHtmlText(m[1])}</span><span style="flex:1 1 auto;min-width:0;word-break:keep-all;overflow-wrap:break-word;">${_escHtmlText(m[2])}</span></div>`;
      }
      return `<div style="margin:0 0 ${mb} 0;word-break:keep-all;overflow-wrap:break-word;">${_escHtmlText(line)}</div>`;
    }).join('');
  }

  /**
   * 사진 1 상단 직접 행동 적색 음영 배너 문구 자동 도출 (사용자 지시: 이미지 4, 5번 기반 구체적 미준수 행동 직시)
   */
  function extractDirectAction(r) {
    const rawPhotoBanner = (
      /분전(?:함|반).*차단기.*충전부/.test(String(r.photoBanner || '').trim()) &&
      /전등|소켓|조명|심선/.test(r.content || '') &&
      !/분전함|분전반|차단기/.test(r.content || '')
    ) ? '' : (r.photoBanner || '');
    const norm = _getNorm();
    if (norm && typeof norm.resolveUnifiedPhotoBanner === 'function') {
      const unified = norm.resolveUnifiedPhotoBanner({ ...r, photoBanner: rawPhotoBanner });
      if (unified && !isGenericTaxonomyLabel(unified)) return unified;
    }
    if (rawPhotoBanner && String(rawPhotoBanner).trim()) {
      const cleanedBanner = cleanBannerText(rawPhotoBanner, r.content);
      if (cleanedBanner && !isGenericTaxonomyLabel(cleanedBanner)) return cleanedBanner;
    }
    const text = `${r.content || ''} ${r.action || ''} ${r.condition || ''} ${r.item || ''} ${r.workMethod || ''} ${r.workName || ''}`;

    if (norm && typeof norm.extractCoreViolationBanner === 'function' && r.content && String(r.content).trim().length >= 5) {
      const core = norm.extractCoreViolationBanner(rawPhotoBanner, r.content, r.location);
      if (core && core.length >= 4 && !isGenericTaxonomyLabel(core) && !/미확인|전경/.test(core)) {
        return core;
      }
    }

    // 0-A. 지게차 근접 작업 / 접지선 / 충전부 노출 등 핵심 위반사항 우선 정밀 요약
    if (/접지선/.test(text) && (/고정\s*불량|용량\s*부족/.test(text) || /볼트/.test(text))) {
      return '접지선 볼트 고정 불량 및 용량 부족';
    }
    if (/지게차/.test(text) && /근접/.test(text)) {
      return '유도원·근로자 지게차 근접 작업';
    }
    if (/충전부/.test(text) && /노출/.test(text)) {
      if (/전등|소켓|조명|심선|단자부/.test(text) && !/분전함|분전반|차단기/.test(text)) {
        return '전등 소켓 충전부 노출 및 절연 불량';
      }
      return '분전함 차단기 충전부 노출';
    }

    // 0. Gang Form / 갱폼 및 선해체 방지커버
    if (/Gang\s*Form|선해체|갱폼/i.test(text)) {
      return 'Gang Form 낙하방지용 선해체방지커버 설치 불량';
    }
    // 1. 양중작업 시 손으로 화물 직접 잡음 (이미지 4번 실물 점검장표 100% 일치)
    if (text.includes('손으로') || text.includes('직접 잡') || (text.includes('유도로프') && (text.includes('손') || text.includes('당기')))) {
      return '양중작업 시 화물을 직접 손으로 잡음';
    }
    // 2. 양중작업 시 수평양중 미실시 (이미지 5번 실물 점검장표 100% 일치)
    if (text.includes('수평') || text.includes('로프간격') || text.includes('수평양중')) {
      return '양중작업 시 화물의 수평양중 미실시';
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
      let c = r.content.replace(/^부적합\s*(?:내용|사항)\s*[:;：]?\s*/, '').trim();
      c = c.replace(/^(?:지하\s*\d+층|\d+동(?:\s*후면|\s*상가동)?)\s*/i, '');
      c = c.replace(/^\d+\)\s*/, '');
      const firstLine = c.split('\n')[0].trim();
      if (firstLine.includes('전도방지 파이프 미사용')) return '대형 벽체 조립 설치 시 전도방지 파이프 미사용';
      if (firstLine.includes('버팀대')) return '외부비계 벽이음용 버팀대 설치각도 기준 미준수';
      if (firstLine.includes('이격거리')) return '외부비계와 구조물 벽체 간 이격거리 과다';
      if (firstLine.includes('가새')) return '비계 설치구간 가새 설치 누락';
      if (firstLine.includes('주변 통제')) return '비계 설치 작업 시 주변 통제 미실시';
      if (firstLine.length >= 6 && !isGenericTaxonomyLabel(firstLine)) return firstLine;
    }

    // 최종 대체: 지적사항 또는 기인물/공종 기반 구체적 행동 표현
    if (r.content && r.content.trim().length >= 6) {
      const trimmed = r.content.trim().replace(/^부적합\s*(?:내용|사항)\s*[:;：]?\s*/, '');
      return trimmed;
    }
    const targetItem = (r.item && r.item !== '기타') ? r.item : (r.workMethod || r.workGroup || '현장 작업');
    return `${targetItem} 안전조치 기준 미준수`;
  }

  /**
   * 사진 2 상단 직접 행동 배너 문구 도출 (이미지 4번처럼 2개 사진에 독립된 위반사항이 있는 경우 지원)
   */
  function extractDirectAction2(r, firstBanner = '') {
    const norm = _getNorm();
    const stripCircled = (str) => (norm && typeof norm.stripCircledNumbers === 'function')
      ? norm.stripCircledNumbers(str)
      : String(str || '').replace(/[\u2460-\u2487\u2776-\u277F]/g, ' ').replace(/\s+/g, ' ').trim();
    if (r.photo2Banner && String(r.photo2Banner).trim()) {
      const b2 = stripCircled(String(r.photo2Banner).trim());
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
      const ch = text[i];
      if (ch === ' ') units += 0.34;
      else if (/[:.,/()\[\]\-]/.test(ch)) units += 0.36;
      else if (text.charCodeAt(i) > 127) units += 1.02;
      else units += 0.60;
    }
    const avail = Math.max(0.2, widthInch - 0.14);
    let sz = baseSize;
    while (sz > minSize) {
      const est = units * (sz / 72);
      if (est <= avail) break;
      sz -= 0.5;
    }
    return sz;
  }

  /**
   * [v42] 문자열 폭 가중치 계산 (맑은 고딕 기준)
   */
  function measureTextWidthUnits(text) {
    if (!text) return 0;
    let units = 0;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (ch === ' ') units += 0.34;
      else if (/[:.,/()\[\]\-]/.test(ch)) units += 0.36;
      else if (text.charCodeAt(i) > 127) units += 1.05;
      else units += 0.60;
    }
    return units;
  }

  /**
   * [v42] 부적합 내용 박스(w=11.05in, h=0.6925in) 가로 페어 패킹 및 클리핑 방지 폰트 자동 산출
   * - 3개 이상 번호 항목('1)... 2)... 3)... 4)...')은 원본 장표처럼 가로 2열(1+2, 3+4)로 배치해 공간 최적화
   * - 줄바꿈 발생 시에도 박스 높이를 넘기지 않도록 폰트 크기 및 줄 간격을 자동 축소(최소 8.0pt)
   */
  function fitMainContentForBox(rawMainContent, boxWidthIn = 11.05, boxHeightIn = 0.6925) {
    const rawLines = String(rawMainContent || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (rawLines.length === 0) {
      return { lines: [], fontSize: 14, lineSpacingMultiple: 1.15, packed: false };
    }

    const availWIn = Math.max(2.0, boxWidthIn - 0.14);
    const estimateWrappedLines = (lines, sz) => {
      const charWIn = sz / 72;
      let total = 0;
      for (const l of lines) {
        const wIn = measureTextWidthUnits(l) * charWIn;
        total += Math.max(1, Math.ceil(wIn / availWIn));
      }
      return total;
    };

    let candidateLines = rawLines;
    let packed = false;
    if (rawLines.length >= 3) {
      const paired = [];
      for (let i = 0; i < rawLines.length; i += 2) {
        paired.push(i + 1 < rawLines.length ? `${rawLines[i]}  ${rawLines[i + 1]}` : rawLines[i]);
      }
      const longestPairedUnits = paired.reduce((mx, l) => Math.max(mx, measureTextWidthUnits(l)), 0);
      if (longestPairedUnits * (10.5 / 72) <= availWIn * 1.02) {
        candidateLines = paired;
        packed = true;
      }
    }

    const vertMarginPt = candidateLines.length >= 3 ? 6 : 9;
    const usableHPt = Math.max(20, boxHeightIn * 72 - vertMarginPt);
    const baseLineMult = candidateLines.length >= 3 ? 1.08 : 1.15;
    let sz = candidateLines.length === 1 ? 14 : (packed ? 12 : 13);
    while (sz > 8.0) {
      const wrapped = estimateWrappedLines(candidateLines, sz);
      const effMult = Math.max(1.18, baseLineMult * 1.06);
      const estHPt = wrapped * sz * effMult;
      if (estHPt <= usableHPt) {
        if (candidateLines.length <= 2 && wrapped <= 2) break;
        if (wrapped <= 4) break;
      }
      sz -= 0.5;
    }

    return {
      lines: candidateLines,
      fontSize: sz,
      lineSpacingMultiple: sz <= 10.0 ? 1.06 : baseLineMult,
      packed
    };
  }

  /**
   * '-' / '•' 불릿 줄을 PowerPoint 네이티브 내어쓰기(hanging indent) 문단 런으로 변환
   * - 첫 줄과 2, 3번째 줄의 시작 위치를 정확히 일치시켜 들여쓰기/돌출 깨짐 방지
   */
  function buildHangingBulletRuns(text, fontSize, color = '111111', fontFace = FONT_MALGUN, indentPt = 8.5) {
    const lines = String(text || '')
      .split(/\r?\n/)
      .map(l => l.trim())
      .filter(Boolean);
    if (!lines.length) return [];
    const actualIndent = indentPt === 8.5 ? Math.max(8.5, Math.round(fontSize * 0.78 * 10) / 10) : indentPt;
    return lines.map((line, idx) => {
      const m = line.match(/^[-•·∙]\s*(.+)$/);
      const isLast = idx === lines.length - 1;
      if (m) {
        return {
          text: m[1].trim(),
          options: {
            fontFace,
            fontSize,
            color,
            bullet: { characterCode: '002D', indent: actualIndent },
            breakLine: !isLast
          }
        };
      }
      return {
        text: line,
        options: {
          fontFace,
          fontSize,
          color,
          bullet: false,
          breakLine: !isLast
        }
      };
    });
  }

  /**
   * 여러 줄 텍스트 박스 실측 기반 글자크기 계산기
   * - 기본값(baseSize, 12pt)을 유지하고, 칸(너비×높이)에 실제로 다 들어가지 않을 때만 0.5pt씩 축소
   * - 글자수 기준 일괄 축소(예: 70자 초과 시 10pt)로 인해 충분히 들어가는데도 작아지는 문제 방지
   */
  function calcFitMultilineFontSize(text, widthInch, heightInch, baseSize = 12, minSize = 7.5, lineSpacing = 1.12, marginPt = [3, 6, 3, 6]) {
    const str = String(text || '').trim();
    if (!str) return baseSize;
    const [mTop, mRight, mBottom, mLeft] = marginPt;
    const availW = Math.max(10, widthInch * 72 - mLeft - mRight);
    const availH = Math.max(10, heightInch * 72 - mTop - mBottom);
    const paragraphs = str.split(/\r?\n/);
    let sz = baseSize;
    while (sz >= minSize) {
      let lines = 0;
      for (const p of paragraphs) {
        let w = 0;
        for (let i = 0; i < p.length; i++) {
          const code = p.charCodeAt(i);
          if (code === 32) w += sz * 0.30;
          else if (code > 127) w += sz * 0.95;
          else w += sz * 0.54;
        }
        // 한국어 맑은고딕 단어 단위 줄바꿈 여유분 7% 반영
        lines += Math.max(1, Math.ceil((w * 1.07) / availW));
      }
      // 한국어 맑은고딕 폰트의 실제 행간(1.24배) 반영
      const neededH = lines * sz * 1.24 * lineSpacing;
      if (neededH <= availH) return sz;
      sz -= 0.5;
    }
    return minSize;
  }

  /**
   * 기존 등록 레코드의 중부적합 / 경부적합 판별 (severity 미지정 과거 데이터 자동 분류 포함)
   */
  function inferRecordSeverity(r) {
    if (!r) return '경부적합';
    if (r.severity === '중부적합') return '중부적합';
    if (r.severity === '경부적합') return '경부적합';
    if (r.holdPoint === true) return '중부적합';
    const text = `${r.content || ''} ${r.item || ''} ${r.agent || ''} ${r.workName || ''} ${r.type || ''}`;
    if (
      text.includes('소화기') ||
      text.includes('누전차단기') ||
      text.includes('조도') ||
      text.includes('전등') ||
      text.includes('통로') ||
      text.includes('위험표지') ||
      (text.includes('방치') && !text.includes('추락') && !text.includes('안전대') && !text.includes('난간'))
    ) {
      return '경부적합';
    }
    if (
      text.includes('추락') ||
      text.includes('양중') ||
      text.includes('안전대') ||
      text.includes('생명줄') ||
      text.includes('안전벨트') ||
      text.includes('선해체') ||
      text.includes('선헤체') ||
      text.includes('동바리') ||
      text.includes('펌프카') ||
      text.includes('말비계') ||
      text.includes('비계') ||
      text.includes('안전난간') ||
      text.includes('낙하물방지') ||
      text.includes('밀폐') ||
      text.includes('지게차') ||
      text.includes('붕괴') ||
      text.includes('도괴')
    ) {
      return '중부적합';
    }
    return r.status !== '조치완료' ? '중부적합' : '경부적합';
  }

  /**
   * 레코드로부터 점검장표용 세부 데이터 정규화 및 추론 (템플릿 1, 2 정밀 일치)
   */
  function normalizeJangpyoData(r, rulesFromTaxonomy = [], options = {}) {
    const severity = inferRecordSeverity(r);
    const isMajor = severity === '중부적합';
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

    const holdPointCode = (r.holdPointCode || '').trim();
    const isHoldPoint = Boolean(holdPointCode && r.holdPoint);

    const rawContent = cleanContent(r.content || '');
    const text = `${rawContent} ${r.item || ''} ${r.agent || ''} ${r.workMethod || ''} ${r.workName || ''}`;
    const domainCtx = `${text} ${r.workGroup || ''} ${r.type || ''} ${r.hazardType || ''}`;
    const hasForkliftWork = /직?[계게개]차|지[계개제]차|하역|유도원|운행경로/.test(text);
    const isCraneLift = /(?:크레인|타워크레인|양중물|달기구|줄걸이|이형자재\s*양중|유도로프|형틀자재\s*양중|자재\s*양중)/.test(`${text} ${r.lawBody || ''}`);
    const hasFormworkAssemblyDefect = /(?:동바리\s*(?:조립|침하|변형|2본|이중|구조검토|설치|미복구|해체)|거푸집\s*(?:조립|해체|탈형|측압|전도))/.test(`${text} ${r.lawBody || ''}`);
    const isElectricalDefect = /(?:가설전기|전기\s*작업|전기설비|분전반|분전함|접지선?|누전차단기|차단기|충전부|전등|소켓|투광등|심선|감전)/i.test(`${domainCtx} ${r.lawBody || ''}`) && !hasForkliftWork;
    const isNonForkliftConflict = !isElectricalDefect && !hasForkliftWork && /(?:생명줄|안전대\s*부착|안전대|추락|비계|거푸집|동바리)/i.test(`${domainCtx} ${r.lawBody || ''}`);

    // 관련 법령 및 수칙 내용 (3단계 우선순위: 1순위 원본 등록 데이터 -> 2순위 학습된 SafeGuidelineMemory -> 3순위 AI 판단, 하드코딩 법령/본문 생성 전면 제거)
    let rawLawTitle = String(r.rawLaw || r.law || (r.basis && r.basis.law) || '').trim();
    let lawBody = String(r.lawBody || '').trim();
    if (!lawBody && rawLawTitle.includes('\n')) {
      const rlLines = rawLawTitle.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      rawLawTitle = rlLines[0] || '';
      lawBody = rlLines.slice(1).join('\n').trim();
    }
    let lawTitle = rawLawTitle;
    if (/^[0-9I=;:\s]+/.test(lawTitle) && (/of\s*xi/i.test(lawTitle) || /업적/i.test(lawTitle) || lawTitle.length < 15)) {
      if (lawBody && /(?:작업\s*절차|작업\s*지침|안전\s*지침|조립\s*기준|일반\s*사항|보건\s*규칙)/.test(lawBody)) {
        const bodyLines = lawBody.split(/\r?\n/);
        lawTitle = bodyLines[0].trim();
        lawBody = bodyLines.slice(1).join('\n').trim();
      }
    }
    const _lawNorm = _getNorm();
    if (_lawNorm && typeof _lawNorm.normalizeSafetyLawSpec === 'function') {
      const resolvedSpec = _lawNorm.normalizeSafetyLawSpec({
        rawLaw: lawTitle,
        lawBody,
        law: r.law || '',
        contextText: `${text} ${r.workGroup || ''} ${r.type || ''}`,
        workGroup: r.workGroup || '',
        type: r.type || ''
      });
      lawTitle = resolvedSpec.title || '';
      lawBody = resolvedSpec.body !== undefined ? resolvedSpec.body : lawBody;
    } else if (!lawTitle && r.law) {
      lawTitle = simplifyLawTitle(r.law, `${text} ${lawBody}`);
    }
    lawTitle = _normSpacing(lawTitle);

    if (lawBody) {
      const preCleanedLawBody = String(lawBody || '')
        .replace(/^\.?28\s*작업발판\s*일반사항/gm, '7.2.8 작업발판 일반사항')
        .replace(/6\.3\.2\s*(?:자업|작업)\s*중\s*점검[^\n]*?(?=1\)|2\)|\n|$)/g, '6.3.2 작업 중 점검\n')
        .replace(/6\.3\.1\s*(?:자업|작업)\s*전\s*점검\s*(?=\d+\))/g, '6.3.1 작업 전 점검\n')
        .replace(/^(?:7\.1|1|\.1)\s*비계\s*조립기준\s*(?=\d|$)/gm, '7.1 비계 조립기준\n')
        .replace(/7\.1\s*비계\s*조립기준\s*(?=\d+\))/g, '7.1 비계 조립기준\n')
        .replace(/7\.2\.8\s*작업발판\s*일반사항\s*(?=\d+\))/g, '7.2.8 작업발판 일반사항\n')
        .replace(/(?:^|\n)\s*9[)|ㅣ]?\s*(?=벽이음의\s*설치위치는)/g, '\n9) ')
        .replace(/\s*10[)|ㅣ]\s*(?=비계\s*설치\s*계획)/g, '\n10) ')
        .replace(/FEE\s*Joint/gi, '유로폼 Joint')
        .replace(/전용철물을사용해/g, '전용철물을 사용해')
        .replace(/30000\s*이하|3000\)?\s*이하|3060\s*이하/g, '30cm 이하')
        .replace(/5560\s*[ㅁm7]+|5500\b|55em\b/gi, '55cm')
        .replace(/\.([a-zA-Z]{1,2})\s*$/gm, '.')
        .replace(/([다요음함됨임]\.?)\s*[a-zA-Z|~—_]{1,3}(?=\s*$|\r?\n)/gm, '$1')
        .replace(/(?:=\s*)?(?:\b[a-zA-Z]{1,3}\s+){2,}[a-zA-Z]{1,4}\s*$/gm, '')
        .replace(/[=—\-_\s]+ee[\s\S]*$/gi, '')
        .replace(/\s*\*\s+/g, '\n- ')
        .replace(/\n{2,}/g, '\n')
        .trim();

      const lawBodyLines = [];
      for (const rawLine of preCleanedLawBody.split(/\r?\n/)) {
        const cl = rawLine.replace(/\.([a-zA-Z]{1,2})\s*$/, '.').trim();
        if (!cl) continue;
        const prev = lawBodyLines.length > 0 ? lawBodyLines[lawBodyLines.length - 1] : '';
        const prevIsHeading = Boolean(prev) && !/^\d+\)/.test(prev) && (
          (/^\d+\.\d+/.test(prev) && !/[①-⑩]/.test(prev) && prev.length <= 32) ||
          (prev.length <= 24 && /(?:기준|사항|점검|절차|유도자|분전반)$/.test(prev))
        );
        const prevEndsSentence = /(?:다|함|됨|음|요|임)[.!?]$/.test(prev);
        if (lawBodyLines.length > 0 && !/^(?:\*|\d+\)|\d+\.\d+|[①-⑩•\-·▪])/.test(cl) && !prevIsHeading && !prevEndsSentence) {
          lawBodyLines[lawBodyLines.length - 1] = _joinWrapped(prev, cl);
        } else {
          lawBodyLines.push(cl);
        }
      }
      lawBody = lawBodyLines.map(l => _normSpacing(l)).join('\n').trim();
      if (_lawNorm && typeof _lawNorm.normalizeSafetyLawBody === 'function') {
        lawBody = _lawNorm.normalizeSafetyLawBody(lawBody);
      } else {
        lawBody = lawBody
          .replace(/직[계게개]차|지[계개제]차/g, '지게차')
          .replace(/([가-힣]+하기)\.\s*(?:\r?\n\s*)?(?=(?:위한|위하여|위해|위함|전에|전\b|때문))/g, '$1 ')
          .replace(/([①②③④⑤⑥⑦⑧⑨⑩])\s*\r?\n\s*(?=[가-힣A-Za-z0-9(])/g, '$1 ')
          .replace(/([.!?])\s*([②③④⑤⑥⑦⑧⑨⑩])\s*/g, '$1\n$2 ')
          .replace(/(되어야|하여야|있어야|없어야|않아야)\s*(하며|하고)(?=[,\s]|$)/g, '$1 $2')
          .replace(/이상\s*유무(를|의|와|에|도|는|가|만|등)?/g, '이상 유무$1')
          .trim();
      }
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
        photo1Title = '양중작업 시 화물의 수평양중 미실시';
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

    // 발생원인 의견 (인터뷰 결과: 사용자 입력 원문 100% 보존 + 복수 '[근로자 의견]/[관리자 의견]' 블록 모두 보존, 임의 더미 텍스트 주입 금지)
    const rawInterview = r.interviewOpinion || r.workerOpinion || '';
    const isManualEntry = Boolean(r._manualEntry);
    const normOp = _getNorm();
    let interviewOpinion = rawInterview;
    let interviewSections = Array.isArray(r.interviewOpinions) && r.interviewOpinions.length >= 2
      ? r.interviewOpinions
      : [];
    if (normOp && typeof normOp.parseInterviewOpinions === 'function' && rawInterview) {
      const parsedMulti = normOp.parseInterviewOpinions(rawInterview);
      if (parsedMulti && parsedMulti.sections && parsedMulti.sections.length >= 2) {
        interviewSections = parsedMulti.sections;
      }
    }
    if (isManualEntry) {
      interviewOpinion = String(rawInterview || '').replace(/\r\n/g, '\n').trim();
    } else if (interviewOpinion) {
      interviewOpinion = cleanOpinionText(interviewOpinion, { preserveHeaders: interviewSections.length >= 2 });
    }
    if (!isManualEntry && interviewSections.length >= 2 && normOp && typeof normOp.parseInterviewOpinions === 'function') {
      const reParsed = normOp.parseInterviewOpinions(interviewOpinion);
      if (reParsed && reParsed.sections && reParsed.sections.length >= 2) {
        interviewSections = reParsed.sections;
      }
    }

    // 점검단 제안 분류 (복수 선택 지원 - 입력/추출된 분류가 있을 때만 표시, 임의 '시스템 개선' 주입 금지)
    let proposalItems = Array.isArray(r.proposalItems) && r.proposalItems.length > 0 ? r.proposalItems : [];
    if (proposalItems.length === 0) {
      const rawProp = (r.inspectorOpinionType || r.auditType || '').trim();
      if (/시스템\s*개선|시스템개선/i.test(rawProp)) {
        proposalItems.push({ type: '시스템 개선', sub: r.inspectorOpinionSub || '(현장모니터링 강화)' });
      }
      if (/교육\s*[\/·]\s*코칭|(?:근로자|협력사|작업팀|해당\s*작업팀)\s*교육|코칭/i.test(rawProp)) {
        proposalItems.push({ type: '교육/코칭', sub: r.inspectorOpinionSub || '(근로자 교육)' });
      }
      if (/패널티|페널티/i.test(rawProp)) {
        proposalItems.push({ type: '페널티', sub: r.inspectorOpinionSub || '(관리감독자 경고)' });
      }
      if (/제재\s*[\/·]?\s*징계|해당\s*작업팀\s*대기|작업\s*중지|작업\s*대기/i.test(rawProp)) {
        proposalItems.push({ type: '제재/징계', sub: r.inspectorOpinionSub || '(해당작업팀대기)' });
      }
    }
    const proposalType = proposalItems.length > 0 ? proposalItems[0].type : '';
    const proposalSub = proposalItems.length > 0 ? (proposalItems[0].sub || '') : '';

    // 점검단 제안 본문: 등록된 auditProposal 원문 그대로 사용 (미입력 시 공란, 더미 텍스트 주입 절대 금지)
    let proposalContent = (r.auditProposal || r.inspectorOpinion || '').trim();
    if (proposalContent && !isManualEntry) {
      proposalContent = cleanProposalText(proposalContent);
    }

    // 개선대책 본문 & PM 판정결과
    let countermeasureContent = '';
    const rawPm = (r.pmVerdict || '').trim();
    const rawFix = (r.fix && r.fix.content ? r.fix.content : '').trim();
    const rawPlan = (r.actionPlan || r.countermeasure || '').trim();

    if (rawPlan) {
      countermeasureContent = rawPlan;
    } else if (rawFix) {
      countermeasureContent = rawFix;
    } else if (Array.isArray(r.countermeasures) && r.countermeasures.length) {
      countermeasureContent = r.countermeasures.join('\n');
    } else if (rawPm && rawPm.length > 12) {
      countermeasureContent = rawPm;
    }
    if (countermeasureContent && !isManualEntry) {
      countermeasureContent = cleanActionPlan(countermeasureContent);
    }

    // PM 판정결과 분류 (Point #6: PDF/사용자 입력에 실제 명시된 경우에만 표시, 없으면 완전 공란 — '시스템 개선' 강제 주입 금지!)
    const rawPmType = String(r.pmVerdictType || r.pmVerdict || '').trim();
    const isLegacyAutoPollutedPm = Boolean(
      r._hasExplicitPmVerdict === false ||
      (
        !r._hasExplicitPmVerdict &&
        !(Array.isArray(r.pmVerdictItems) && r.pmVerdictItems.length) &&
        !String(r.pmVerdictSub || '').trim() &&
        !rawPlan &&
        !rawFix &&
        rawPmType &&
        (rawPmType === String(r.inspectorOpinionType || '').trim() || rawPmType === '시스템 개선')
      )
    );
    let pmVerdictItems = (!isLegacyAutoPollutedPm && Array.isArray(r.pmVerdictItems) && r.pmVerdictItems.length > 0)
      ? r.pmVerdictItems
      : [];
    if (!isLegacyAutoPollutedPm && pmVerdictItems.length === 0 && rawPmType) {
      const parenMatch = rawPmType.match(/(\([^)]+\))/);
      const rawPmSub = String(r.pmVerdictSub || (parenMatch ? parenMatch[1] : '') || '').trim();
      const pmScan = `${rawPmType} ${rawPmSub}`.trim();
      if (/제재\s*[\/·]?\s*징계|해당\s*작업팀\s*대기|작업\s*중지|작업\s*대기/i.test(pmScan)) {
        pmVerdictItems.push({ type: '제재/징계', sub: rawPmSub || '(해당작업팀대기)' });
      }
      if (/시스템\s*개선|시스템개선/i.test(pmScan)) {
        pmVerdictItems.push({ type: '시스템 개선', sub: rawPmSub || '(계획 재수립)' });
      }
      if (/교육\s*[\/·]\s*코칭|(?:근로자|협력사|작업팀|해당\s*작업팀)\s*교육|코칭/i.test(pmScan)) {
        pmVerdictItems.push({ type: '교육/코칭', sub: rawPmSub || '(근로자 교육)' });
      }
      if (/패널티|페널티/i.test(pmScan)) {
        pmVerdictItems.push({ type: '페널티', sub: rawPmSub || '(관리감독자 경고)' });
      }
    }
    let pmVerdictType = pmVerdictItems.length > 0 ? pmVerdictItems[0].type : '';
    let pmVerdictSub = pmVerdictItems.length > 0 ? (pmVerdictItems[0].sub || '') : '';

    // 등록된 장표에 이미 개선대책/PM판정결과가 기입되어 있는 경우 그대로 표시, 없는 경우에만 공란 처리
    const hasRegisteredPostAction = Boolean(countermeasureContent || pmVerdictItems.length > 0);
    const isPostActionFilled = Boolean((options && options.includePostActions) || hasRegisteredPostAction);
    if (!isPostActionFilled) {
      countermeasureContent = '';
      pmVerdictType = '';
      pmVerdictSub = '';
      pmVerdictItems = [];
    }

    const _roundNorm = _getNorm();
    const rawInspectRound = r.inspectRound || (r.round ? `${r.round}차` : "'26년下 3차");
    let inspectRound = (_roundNorm && typeof _roundNorm.normalizeRoundText === 'function')
      ? _roundNorm.normalizeRoundText(rawInspectRound)
      : rawInspectRound;
    // 점검자명 정제: OCR 라벨 오인식('적검자', '점검자', 1글자 잔여 노이즈 '로') 배제 및 등록된 로그인/시트 점검자 사용
    const sanitizeInspectorName = (val) => {
      const s = String(val || '')
        .replace(/^.*?(?:점\s*검\s*자|적\s*검\s*자|점\s*겸\s*자|정\s*검\s*자|서\s*검\s*자|섬\s*검\s*자)\s*[:：.;]?\s*/g, '')
        .replace(/[^가-힣a-zA-Z0-9\s]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
      if (!s || /^(?:점검자|적검자|점겸자|정검자|서검자|섬검자)$/i.test(s) || s.length <= 1) return '';
      return s;
    };
    let inspectorName = sanitizeInspectorName(r.inspectUser) || sanitizeInspectorName(r.inspector) || sanitizeInspectorName(r.user) || '';

    // 사진 상단 직접 행동 문구 (사용자 지시: 이미지 4, 5번 기반 구체적 미준수 행동 직시)
    const photoBanner = extractDirectAction(r);
    const photo2Banner = extractDirectAction2(r, photoBanner);
    const greenBanner = r.greenBanner || '';
    const interviewAuthorTitle = (interviewSections.length > 0 && interviewSections[0].title)
      ? interviewSections[0].title
      : (r.interviewAuthorTitle || (r.interviewAuthor ? `[관리자 의견 : ${r.interviewAuthor}]` : '[의견 : 시공관리자 및 근로자]'));
    const cleanedWorkGroup = cleanWorkGroup(r.workGroup || '', rawContent);

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
      photoLayoutRatio: r.photoLayoutRatio || 'auto',
      interviewAuthor: r.interviewAuthor || '시공관리자 및 근로자',
      interviewAuthorTitle,
      interviewOpinion,
      interviewSections,
      proposalType,
      proposalSub,
      proposalItems,
      proposalContent,
      countermeasureContent,
      pmVerdictType,
      pmVerdictSub,
      pmVerdictItems,
      subcontractor: cleanSubcontractor(r.subcontractor),
      workGroup: cleanedWorkGroup,
      location: cleanLocation(r.location, rawContent, cleanedWorkGroup),
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
    const lawTitleFontSize = calcSingleLineFontSize(data.lawTitle, 5.48, 16, 8.5);
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
    const lawBodyFontSize = calcFitMultilineFontSize(data.lawBody, 5.5644, 0.6495, 14, 6.5, 1.03, [1, 4, 1, 4]);
    slide.addText(data.lawBody, {
      x: 4.8865, y: 0.4800, w: 5.5644, h: 0.6495,
      fontFace: FONT_MALGUN, fontSize: lawBodyFontSize, color: '111111',
      align: 'left', valign: 'middle', margin: [1, 4, 1, 4], lineSpacingMultiple: 1.03
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
        align: 'left', valign: 'middle', margin: [2, 5, 2, 5], wrap: false
      });
    });

    // 부적합 개요 2행: 부적합 내용 (Cell(4,2): x = 0.9375, y = 1.6213, w = 12.2938, h = 0.6925)
    const mainFit = fitMainContentForBox(data.mainContent, 11.05, 0.6925);
    const mainLines = mainFit.lines;

    slide.addShape(pptx.ShapeType.rect, {
      x: 0.9375, y: 1.6213, w: 12.2938, h: 0.6925,
      fill: { color: 'FFFFFF' }, line: { color: C_BORDER, width: 0.5 }
    });
    if (mainLines.length <= 1) {
      const singleMainText = mainLines[0] || '';
      const mainSz = calcSingleLineFontSize(`부적합 내용 : ${singleMainText}`, 12.2938, 14, 10.5);
      const needsWrap = measureTextWidthUnits(`부적합 내용 : ${singleMainText}`) * (mainSz / 72) > 12.10;
      slide.addText([
        { text: '부적합 내용 ', options: { bold: true, color: C_ACCENT_BLUE, fontFace: FONT_MALGUN, fontSize: mainSz } },
        { text: ': ', options: { bold: true, color: '000000', fontFace: FONT_MALGUN, fontSize: mainSz } },
        ...(singleMainText ? [{ text: singleMainText, options: { bold: true, color: '000000', fontFace: FONT_MALGUN, fontSize: mainSz } }] : [])
      ], {
        x: 0.9375, y: 1.6213, w: 12.2938, h: 0.6925,
        align: 'left', valign: needsWrap ? 'top' : 'middle', margin: needsWrap ? [4, 6, 3, 6] : [2, 6, 2, 6], wrap: true
      });
    } else {
      const mainSz = mainFit.fontSize;
      const topPad = mainLines.length >= 3 || mainSz <= 10 ? 3 : 5;
      const botPad = mainLines.length >= 3 || mainSz <= 10 ? 2 : 3;
      const labelSz = Math.min(12.5, Math.max(10.5, mainSz));
      slide.addText([
        { text: '부적합 내용 ', options: { bold: true, color: C_ACCENT_BLUE, fontFace: FONT_MALGUN, fontSize: labelSz } },
        { text: ': ', options: { bold: true, color: '000000', fontFace: FONT_MALGUN, fontSize: labelSz } }
      ], {
        x: 0.9375, y: 1.6213, w: 1.2500, h: 0.6925,
        align: 'left', valign: 'top', margin: [topPad, 0, botPad, 6], lineSpacingMultiple: mainFit.lineSpacingMultiple, wrap: false
      });
      slide.addText(mainLines.join('\n'), {
        x: 2.1300, y: 1.6213, w: 11.0950, h: 0.6925,
        fontFace: FONT_MALGUN, fontSize: mainSz, bold: true, color: '000000',
        align: 'left', valign: 'top', margin: [topPad, 6, botPad, 0], lineSpacingMultiple: mainFit.lineSpacingMultiple, wrap: true
      });
    }

    // ── 3. 하단 통합 컨테이너 (Cell(5,1): x = 0.1070, y = 2.3138, w = 13.1243, h = 5.0632, bottom = 7.3770) ──
    slide.addShape(pptx.ShapeType.rect, {
      x: 0.1070, y: 2.3138, w: 13.1243, h: 5.0632,
      fill: { color: 'FFFFFF' }, line: { color: C_BORDER, width: 0.5 }
    });

    // 사진 로드
    let photo1Base64 = null;
    let photo2Base64 = null;
    if (loadPhotoBase64) {
      try { photo1Base64 = await loadPhotoBase64((record.photos && record.photos[0]) || '', record, 0); } catch (e) { }
      try { photo2Base64 = await loadPhotoBase64((record.photos && record.photos[1]) || '', record, 1); } catch (e) { }
    }
    const hasPhoto2 = Boolean(photo2Base64);

    // ── [좌측 컬럼] 적색 음영 배너 & 현장 사진 (x = 0.3121, w = 5.4580) ──
    // 적색 배너 (SHAPE #12: x = 0.3121, y = 2.8121, w = 5.4580, h = 0.3702, fill #C00000 @ alpha 60% = #D96666)
    const bannerWidth = 5.4580;
    const bannerFontSize = calcSingleLineFontSize(data.photoBanner, bannerWidth, 14, 9.5);
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
        align: 'center', valign: 'middle', wrap: false, inset: 0.02, shrinkText: true
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
          sizing: { type: 'contain', w: eachW, h: photoBodyHeight }
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
          sizing: { type: 'contain', w: eachW, h: photoBodyHeight }
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
          sizing: { type: 'contain', w: bannerWidth, h: photoBodyHeight }
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
    // 1) Hold Point 위반 표 (TABLE #3: x = 5.9202, y = 2.3772, w = 2.2594, h = 0.4039, 상/하/좌/우 4면 0.5pt 테두리 완비)
    slide.addShape(pptx.ShapeType.rect, {
      x: 5.9202, y: 2.3772, w: 2.2594, h: 0.4039,
      fill: { color: 'FFFFFF' }, line: { color: C_BORDER, width: 0.5 }
    });
    // 내부 체크박스 (Cell(2,2): x = 5.9748, y = 2.4207, w = 0.3150, h = 0.3168)
    slide.addText(data.isHoldPoint ? '✔' : '', {
      x: 5.9748, y: 2.4207, w: 0.3150, h: 0.3168,
      fill: { color: 'FFFFFF' }, line: { color: C_BORDER, width: 0.5 },
      fontFace: FONT_MALGUN, fontSize: 15, bold: true, color: '000000',
      align: 'center', valign: 'middle', margin: 0
    });
    // Hold Point 위반 텍스트 (Cell(2,3): x = 6.2898, y = 2.4207, w = 1.8897, h = 0.3168, 11pt Bold)
    const holdPointLabel = data.holdPointCode ? ` Hold Point 위반 (${data.holdPointCode})` : ' Hold Point 위반';
    slide.addText(holdPointLabel, {
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

    // 2) [의견 : ] 박스 (SHAPE #2: x = 8.2448, y = 2.8227, w = 4.9213, h = 1.3773)
    const { plan: intPlan, runs: intRuns } = buildInterviewOpinionTextRuns(data);
    slide.addText(intRuns, {
      x: 8.2448, y: 2.8227, w: 4.9213, h: 1.3773,
      fill: { color: 'FFFFFF' }, line: { color: C_BORDER, width: 0.5 },
      margin: intPlan.margin, valign: 'top', lineSpacingMultiple: intPlan.lineSpacing
    });

    // 3) [점검단 제안] 좌측 상단 셀 (SHAPE #5: x = 8.2448, y = 4.2000, w = 1.5342, h = 0.3100)
    slide.addText('[점검단 제안]', {
      x: 8.2448, y: 4.2000, w: 1.5342, h: 0.3100,
      fill: { color: 'FFFFFF' }, line: { color: C_BORDER, width: 0.5 },
      fontFace: FONT_MALGUN, fontSize: 13.5, bold: true, color: C_SUBHEADER_TEXT,
      align: 'center', valign: 'middle'
    });

    // 4) [점검단 제안] 좌측 하단 셀 (SHAPE #6: x = 8.2448, y = 4.5100, w = 1.5342, h = 0.9350 - 높이 확대로 2개 분류도 끊김 없이 여유 있게 표시)
    const propRuns = [];
    const isMultiProp = Boolean(data.proposalItems && data.proposalItems.length > 1);
    (data.proposalItems || [{ type: data.proposalType, sub: data.proposalSub }]).forEach((it, idx) => {
      if (idx > 0) propRuns.push({ text: '\n', options: { fontSize: 3 } });
      propRuns.push({
        text: `${it.type}\n`,
        options: { fontSize: isMultiProp ? 10.5 : 14, bold: true, color: C_ACCENT_BLUE, fontFace: FONT_MALGUN }
      });
      if (it.sub) {
        propRuns.push({
          text: it.sub,
          options: { fontSize: isMultiProp ? 8.5 : 11, bold: true, color: '000000', fontFace: FONT_MALGUN }
        });
      }
    });
    slide.addText(propRuns, {
      x: 8.2448, y: 4.5100, w: 1.5342, h: 0.9350,
      fill: { color: 'FFFFFF' }, line: { color: C_BORDER, width: 0.5 },
      align: 'center', valign: 'middle', lineSpacingMultiple: isMultiProp ? 1.04 : 1.10, margin: [2, 2, 2, 2]
    });

    // 5) [점검단 제안] 우측 본문 셀 (SHAPE #4: x = 9.7790, y = 4.2000, w = 3.3871, h = 1.2450 - 높이 확대 및 자동 폰트 맞춤)
    const propMargin = [4, 6, 4, 6];
    const propLineSpacing = (data.proposalContent || '').length > 65 ? 1.08 : 1.14;
    const propSz = calcFitMultilineFontSize(data.proposalContent || '', 3.3871 - (8.5 / 72), 1.2450, 12, 8.5, propLineSpacing, propMargin);
    const proposalBodyRuns = buildHangingBulletRuns(data.proposalContent, propSz, '111111', FONT_MALGUN, 8.5);
    slide.addText(proposalBodyRuns.length ? proposalBodyRuns : '', {
      x: 9.7790, y: 4.2000, w: 3.3871, h: 1.2450,
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
    // 사용자 표준 기본값 12pt 유지 (장문 극단 초과 시에만 최소 9.5pt까지 점진 조절) + PowerPoint 네이티브 내어쓰기 적용
    const counterMargin = [4, 6, 2, 6];
    const counterLineSpacing = 1.10;
    const counterSz = calcFitMultilineFontSize(data.countermeasureContent || '', 3.3858 - (8.5 / 72), 1.3959, 12, 9.5, counterLineSpacing, counterMargin);
    const counterRuns = buildHangingBulletRuns(data.countermeasureContent, counterSz, '000000', FONT_MALGUN, 8.5);
    slide.addText(counterRuns.length ? counterRuns : '', {
      x: 8.2448, y: 5.9064, w: 3.3858, h: 1.3959,
      fill: { color: 'FFFFFF' }, line: { color: C_BORDER, width: 0.5 },
      margin: counterMargin, valign: 'top', lineSpacingMultiple: counterLineSpacing,
      bold: false, fontFace: FONT_MALGUN
    });

    // 8) [PM 판정결과] 우측 상단 셀 (SHAPE #9: x = 11.6307, y = 5.9064, w = 1.5354, h = 0.3329)
    slide.addText('[PM 판정결과]', {
      x: 11.6307, y: 5.9064, w: 1.5354, h: 0.3329,
      fill: { color: 'FFFFFF' }, line: { color: C_BORDER, width: 0.5 },
      fontFace: FONT_MALGUN, fontSize: 14, bold: true, color: C_SUBHEADER_TEXT,
      align: 'center', valign: 'middle'
    });

    // 9) [PM 판정결과] 우측 하단 셀 (SHAPE #10: x = 11.6307, y = 6.2394, w = 1.5354, h = 1.0630)
    const pmRuns = [];
    (data.pmVerdictItems || (data.pmVerdictType ? [{ type: data.pmVerdictType, sub: data.pmVerdictSub }] : [])).forEach((it, idx) => {
      if (idx > 0) pmRuns.push({ text: '\n', options: { fontSize: 4 } });
      pmRuns.push({
        text: `${it.type}\n`,
        options: { fontSize: (data.pmVerdictItems && data.pmVerdictItems.length > 1) ? 11 : 14, bold: true, color: C_ACCENT_BLUE, fontFace: FONT_MALGUN }
      });
      if (it.sub) {
        pmRuns.push({
          text: it.sub,
          options: { fontSize: (data.pmVerdictItems && data.pmVerdictItems.length > 1) ? 9 : 11, bold: true, color: '000000', fontFace: FONT_MALGUN }
        });
      }
    });
    slide.addText(pmRuns.length ? pmRuns : '', {
      x: 11.6307, y: 6.2394, w: 1.5354, h: 1.0630,
      fill: { color: 'FFFFFF' }, line: { color: C_BORDER, width: 0.5 },
      align: 'center', valign: 'middle', lineSpacingMultiple: 1.10, margin: [4, 4, 4, 4]
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
      align: 'left', valign: 'middle', margin: [4, 8, 4, 8], lineSpacingMultiple: 1.20
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
      try { photo1Base64 = await loadPhotoBase64((record.photos && record.photos[0]) || '', record, 0); } catch (e) { }
      try { photo2Base64 = await loadPhotoBase64((record.photos && record.photos[1]) || '', record, 1); } catch (e) { }
    }

    const hasPhoto1 = Boolean(photo1Base64);
    const hasPhoto2 = Boolean(photo2Base64);
    // 우측 사진이 실제 위험성평가표(문서/도면/표)인지 판별 (현장 부적합 사진이면 절대 [위험성평가표]에 넣지 않음)
    const isPhoto2RiskDoc = Boolean(
      record.rightPhotoIsReference === true ||
      record.photo2IsRiskDoc === true ||
      /위험성\s*평가표|평가표|문서|서식|도면|작업절차서|매뉴얼/i.test(record.photo2Banner || record.photo2Type || '')
    );

    // 1) 좌측 적색 음영 배너 (SHAPE #3 [TextBox 11]: x = 0.8685, y = 2.8276, w = 5.4580, h = 0.3702, fill #C00000 @ alpha 60% = #D96666)
    const leftBannerW = 5.4580;
    const leftBannerSz = calcSingleLineFontSize(data.photoBanner, leftBannerW, 14, 9.5);
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

    // 좌측 부적합 사례 사진 배치:
    // - 사진이 2장이고 둘 다 부적합 현장 사진인 경우: 좌측 부적합 사례 영역 내에 2장을 나란히 분할 배치
    // - 우측 사진이 실제 위험성평가표 문서이거나 사진이 1장인 경우: 좌측 부적합 사례 영역 전체(5.4580)에 1번 사진 배치
    if (hasPhoto2 && !isPhoto2RiskDoc) {
      const halfW = 2.6800;
      if (photo1Base64) {
        slide.addImage({
          data: photo1Base64,
          x: 0.8685, y: 3.2500, w: halfW, h: 3.9500,
          sizing: { type: 'contain', w: halfW, h: 3.9500 }
        });
      }
      slide.addImage({
        data: photo2Base64,
        x: 3.6465, y: 3.2500, w: halfW, h: 3.9500,
        sizing: { type: 'contain', w: halfW, h: 3.9500 }
      });
    } else if (photo1Base64) {
      slide.addImage({
        data: photo1Base64,
        x: 0.8685, y: 3.2500, w: leftBannerW, h: 3.9500,
        sizing: { type: 'contain', w: leftBannerW, h: 3.9500 }
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

    // 우측 영역: 실제 위험성평가표 문서일 때만 배치 (현장 부적합 사진은 절대 위험성평가표에 배치하지 않고 원본 서식처럼 공란 유지)
    if (hasPhoto2 && isPhoto2RiskDoc && photo2Base64) {
      slide.addImage({
        data: photo2Base64,
        x: 7.8740, y: 3.2500, w: rightBannerW, h: 3.9500,
        sizing: { type: 'contain', w: rightBannerW, h: 3.9500 }
      });
    }
  }

  function isRiskAssessmentSheet(record, data) {
    if (!record) return false;
    // 경부적합(Minor) 또는 위험성평가 서식인 경우 템플릿/부적합장표(경부적합).pptx 서식 100% 적용
    if (record.severity === '경부적합' || record.sheetType === '위험성평가' || record.isRiskAssessment === true) {
      return true;
    }
    const txt = `${record.sheetCategory || ''} ${record.category || ''} ${data.rawLaw || ''} ${record.content || ''}`;
    return /위험성\s*평가\s*확인|유해\s*위험요인\s*파악/i.test(txt);
  }

  /**
   * PptxGenJS 단일 슬라이드에 점검장표 레이아웃 추가 (시설물/법규 표준서식 / 위험성평가 서식 정밀 분기)
   */
  async function addInspectionSheetSlide(pptx, record, options = {}) {
    const { rulesFromTaxonomy = [] } = options;
    const data = normalizeJangpyoData(record, rulesFromTaxonomy, options);
    if (isRiskAssessmentSheet(record, data)) {
      return addMinorInspectionSheetSlide(pptx, record, data, options);
    }
    return addMajorInspectionSheetSlide(pptx, record, data, options);
  }

  /**
   * 점검장표 PPT (.pptx) 프레젠테이션 생성 및 다운로드
   * - 원칙: 신규 R1 양식(sheet_major_r1.pptx / sheet_minor_r1.pptx)을 네이티브 OOXML로 그대로 패치 생성
   */
  async function generateInspectionSheetPPT(options = {}) {
    const { records = [], loadPhotoBase64, download = true, filename, rulesFromTaxonomy = [], templateLoader } = options;
    const list = Array.isArray(records) ? records : [records];
    if (!list.length) {
      throw new Error('점검장표를 생성할 부적합 데이터가 선택되지 않았습니다.');
    }

    const tplEngine = resolveTemplateEngine();
    if (tplEngine && typeof tplEngine.buildInspectionSheetPptxBlob === 'function') {
      return await tplEngine.buildInspectionSheetPptxBlob({
        records: list,
        normalizeRecord: (r) => normalizeJangpyoData(r, rulesFromTaxonomy, options),
        isRiskAssessmentSheet,
        loadPhotoBase64,
        download,
        filename,
        templateLoader,
      });
    }

    const PptxClass = (typeof window !== 'undefined' && window.PptxGenJS) || (typeof PptxGenJS !== 'undefined' ? PptxGenJS : null);
    if (!PptxClass) {
      throw new Error('PPT 생성 엔진(SafePPTTemplateEngine/PptxGenJS)이 로드되지 않았습니다.');
    }

    const pptx = new PptxClass();
    pptx.defineLayout({ name: 'WIDE_16_9', width: 13.333, height: 7.5 });
    pptx.layout = 'WIDE_16_9';

    for (const rec of list) {
      await addInspectionSheetSlide(pptx, rec, { loadPhotoBase64, rulesFromTaxonomy });
    }

    let defaultName = `점검장표_${list[0].site || '현장'}_${list.length > 1 ? `${list.length}건_` : ''}${new Date().toISOString().slice(0, 10)}.pptx`;
    const finalFilename = filename || defaultName;

    const pptxBlob = await pptx.write({ outputType: 'blob' });
    const mimeBlob = new Blob([pptxBlob], {
      type: 'application/octet-stream'
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
        a.target = '';
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
          try {
            if (a.parentNode) a.parentNode.removeChild(a);
            URL.revokeObjectURL(url);
          } catch (e) { }
        }, 120000);
      }
    }

    return { blob: mimeBlob, filename: finalFilename };
  }

  /**
   * [중부적합] 브라우저 실시간 16:9 슬라이드 프리뷰 HTML 렌더링 (템플릿/부적합장표(중부적합)_R1.pptx 100% 정밀 연동)
   * - 모든 글자크기·단락간격·줄임·사진 면적비례 배치를 SafePPTTemplateEngine(PPTX 생성기)과 동일 함수로 100% 일치
   */
  function renderMajorInspectionSheetHTML(record, data, options = {}) {
    const { photo1Url = '', photo2Url = '', photo1Dims = null, photo2Dims = null } = options;
    const tplEngine = resolveTemplateEngine();
    const fitSingle = (tplEngine && tplEngine.fitSingleLineByAbbr) || ((s) => String(s || '').trim());
    const fitMulti = (tplEngine && tplEngine.fitMultilineByAbbr) || ((lines) => (Array.isArray(lines) ? lines : _splitBulletLinesShared(lines)));
    const computeTwoPhotos = (tplEngine && tplEngine.computeProportionalTwoPhotoBoxes) || ((box, _d1, _d2, gap = 0.0976) => {
      const wEach = Number(((box.w - gap) / 2).toFixed(4));
      return {
        leftBox: { x: box.x, y: box.y, w: wEach, h: box.h },
        rightBox: { x: Number((box.x + wEach + gap).toFixed(4)), y: box.y, w: wEach, h: box.h }
      };
    });

    const pctX = (x) => `${((x / 13.3333) * 100).toFixed(4)}%`;
    const pctY = (y) => `${((y / 7.5000) * 100).toFixed(4)}%`;
    const pctW = (w) => `${((w / 13.3333) * 100).toFixed(4)}%`;
    const pctH = (h) => `${((h / 7.5000) * 100).toFixed(4)}%`;
    const pt = (n) => `${(n * 0.104167).toFixed(4)}cqw`;
    const glowTextShadow = '0 0 4px rgba(0,0,0,0.85), -0.5px -0.5px 1.5px rgba(0,0,0,0.85), 0.5px 0.5px 1.5px rgba(0,0,0,0.85)';

    // 원본 R1 100% 고정 글자크기 (초과 시 글자크기 축소 금지, 내용 자연 축약)
    const typeMainText = fitSingle(String(data.typeMain || data.type || '안전').trim(), 1.48, 20);
    const lawTitleText = fitSingle(String(data.lawTitle || ''), 5.50, 16);
    const lawBodyLines = fitMulti(_splitBulletLinesShared(data.lawBody || ''), 5.42, 0.64, 11, 1.0, 0);

    const metaCols = [
      { label: '협력사 : ', prefix: '협력사 : ', val: fitSingle(String(data.subcontractor || ''), 2.30, 14, '협력사 : '), x: 0.9375, w: 2.3333 },
      { label: '공종명 : ', prefix: '공종명 : ', val: fitSingle(String(data.workGroup || ''), 2.94, 14, '공종명 : '), x: 3.2708, w: 2.9688 },
      { label: '작업장소 : ', prefix: '작업장소 : ', val: fitSingle(String(data.location || ''), 3.10, 14, '작업장소 : '), x: 6.2396, w: 3.1215 },
      { label: '점검자 : ', prefix: '점검자 : ', val: fitSingle(String(data.inspector || ''), 1.78, 14, '점검자 : '), x: 9.3611, w: 1.8055 },
      { label: '점검차수 : ', prefix: '점검차수 : ', val: fitSingle(String(data.inspectRound || ''), 2.04, 14, '점검차수 : '), x: 11.1666, w: 2.0647 }
    ];

    // 부적합 내용: 원본 14pt Bold 100% 고정, 1건이어도 '1. ' 번호 부여 및 상단 정렬 (초과 시 내용 축약)
    const rawMainLines = String(data.mainContent || '').replace(/\r\n/g, '\n').split('\n')
      .flatMap(l => l.trim().split(/\s+(?=(?:[2-9]\d?[\.)]\s+|[②③④⑤⑥⑦⑧⑨⑩]\s*|-\s+))/))
      .map(l => l.trim()).filter(Boolean);
    const hasNumPrefix = rawMainLines.some(l => /^(?:\d+[\.)]|[①-⑩])/.test(l));
    const numberedMainLines = (rawMainLines.length >= 1 && !hasNumPrefix)
      ? rawMainLines.map((l, i) => `${i + 1}. ${l.replace(/^[-•▪]\s*/, '')}`)
      : rawMainLines;
    const mainLines = fitMulti(numberedMainLines, 10.65, 0.62, 14, 1.10, 0);
    const packedMainContent = mainLines.join('\n');

    const propLines = fitMulti(_splitBulletLinesShared(data.proposalContent || ''), 3.24, 0.94, 12, 1.0, 3);
    const cmLines = fitMulti(_splitBulletLinesShared(data.countermeasureContent || ''), 3.24, 1.28, 11, 1.0, 6);

    const hasPhoto1 = Boolean(photo1Url);
    const hasPhoto2 = Boolean(photo2Url);
    const bannerWidth = 5.4580;
    const bannerText = fitSingle(String(data.photoBanner || ''), 5.35, 16);

    // 좌측 사진 영역 (PPTX fullPhotoBox와 동일 좌표: x=0.3064in ~ 8.1796in, w=7.8732in, h=4.4589in)
    const fullPhotoBox = { x: 0.3064, y: 2.8434, w: 7.8732, h: 4.4589 };
    const effectiveRatio = options.photoLayoutRatio || data.photoLayoutRatio || 'auto';
    const twoPhotoBoxes = (hasPhoto1 && hasPhoto2)
      ? computeTwoPhotos(fullPhotoBox, photo1Dims, photo2Dims, 0.0976, effectiveRatio)
      : null;
    const fullPhotoCssRect = `left:${pctX(fullPhotoBox.x)};top:${pctY(fullPhotoBox.y)};width:${pctW(fullPhotoBox.w)};height:${pctH(fullPhotoBox.h)};`;
    const onImg2ErrorRecoverFull = `this.onerror=null;var p2=this.parentElement;if(p2)p2.style.display='none';var root=this.closest('#jangpyoSlidePreview');var p1=root&&root.querySelector('[data-sheet-photo=\\'1\\']');if(p1){p1.style.left='${pctX(fullPhotoBox.x)}';p1.style.top='${pctY(fullPhotoBox.y)}';p1.style.width='${pctW(fullPhotoBox.w)}';p1.style.height='${pctH(fullPhotoBox.h)}';}`;
    const onImg1ErrorRecoverFull = `this.onerror=null;var p1=this.parentElement;if(p1)p1.style.display='none';var root=this.closest('#jangpyoSlidePreview');var p2=root&&root.querySelector('[data-sheet-photo=\\'2\\']');if(p2){p2.style.left='${pctX(fullPhotoBox.x)}';p2.style.top='${pctY(fullPhotoBox.y)}';p2.style.width='${pctW(fullPhotoBox.w)}';p2.style.height='${pctH(fullPhotoBox.h)}';}`;

    const ensureVerdictList = (items, singleType, singleSub) => {
      const list = Array.isArray(items) && items.length
        ? items
        : (singleType ? [{ type: singleType, sub: singleSub }] : []);
      return list.map(it => {
        const t = String((it && it.type) || '').trim();
        if (!t) return null;
        let s = String((it && it.sub) || '').trim();
        if (!s) {
          if (/교육|코칭/.test(t)) s = '(근로자 교육)';
          else if (/제재|징계/.test(t)) s = '(해당작업팀대기)';
          else if (/페널티|패널티/.test(t)) s = '(관리감독자 경고)';
          else s = '(계획 재수립)';
        }
        return { type: t, sub: s.startsWith('(') ? s : `(${s})` };
      }).filter(Boolean);
    };
    const propDisplayItems = ensureVerdictList(data.proposalItems, data.proposalType, data.proposalSub);
    const pmDisplayItems = ensureVerdictList(data.pmVerdictItems, data.pmVerdictType, data.pmVerdictSub);

    const factorItems = [
      { boxX: 10.7738, labelX: 11.0573, y: 0.2453, checked: data.isUnplanned, label: '계획 미수립' },
      { boxX: 12.0022, labelX: 12.2857, y: 0.2453, checked: data.isUnexecuted, label: '계획 미이행' },
      { boxX: 10.7738, labelX: 11.0573, y: 0.7680, checked: data.isAction, label: '불안전 행동' },
      { boxX: 12.0022, labelX: 12.2857, y: 0.7680, checked: data.isCondition, label: '불안전 상태' }
    ];

    return `
      <div id="jangpyoSlidePreview" data-severity="중부적합" data-template="R1" style="
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

        <!-- 2. 사고유형 & 등급 (원본 R1: 둘 다 20pt Bold 고정, 순수 흰색 + 3px 황색 #ffc000 테두리) -->
        <div style="position: absolute; left: ${pctX(2.1666)}; top: ${pctY(0.1216)}; width: ${pctW(1.5186)}; height: ${pctH(1.0535)}; background: #ffffff; border: 3px solid #ffc000; display: flex; flex-direction: column; align-items: center; justify-content: center; box-sizing: border-box;">
          <div style="font-size: ${pt(20)}; font-weight: 800; color: #000000; line-height: 1.08; text-align: center;">${_escHtmlText(typeMainText)}</div>
          <div style="font-size: ${pt(20)}; font-weight: 800; color: #000000; line-height: 1.08; text-align: center; margin-top: 0.04cqw;">[${_escHtmlText(data.severity)}]</div>
        </div>

        <!-- 3. 관련기준 라벨 (20pt bold) -->
        <div style="position: absolute; left: ${pctX(3.7778)}; top: ${pctY(0.1216)}; width: ${pctW(1.0407)}; height: ${pctH(1.0535)}; background: #ffffff; border: 1px solid #000000; display: flex; align-items: center; justify-content: center; font-size: ${pt(20)}; font-weight: 800; color: #000000; text-align: center; line-height: 1.15; box-sizing: border-box;">
          관련<br>기준
        </div>

        <!-- 4. 관련기준 내용 외곽 사각형 -->
        <div style="position: absolute; left: ${pctX(4.8185)}; top: ${pctY(0.1216)}; width: ${pctW(5.6949)}; height: ${pctH(1.0535)}; background: #ffffff; border: 1px solid #000000; box-sizing: border-box;"></div>

        <!-- 4-1. 관련기준 제목 (원본 R1: 16pt Bold 고정, 초과 시 축약) -->
        <div style="position: absolute; left: ${pctX(4.8840)}; top: ${pctY(0.1450)}; width: ${pctW(5.5640)}; height: ${pctH(0.3100)}; display: flex; align-items: center; font-size: ${pt(16)}; font-weight: 800; color: #000000; white-space: nowrap; overflow: hidden; box-sizing: border-box;">
          ${_escHtmlText(lawTitleText)}
        </div>

        <!-- 4-2. 관련기준 본문 (원본 R1 TextBox 1: 11pt 일반체 고정, 단락간격 0, 초과 시 축약) -->
        <div style="position: absolute; left: ${pctX(4.8840)}; top: ${pctY(0.4580)}; width: ${pctW(5.5640)}; height: ${pctH(0.6560)}; background: rgba(217, 226, 243, 0.72); padding: 0.22cqw 0.45cqw; box-sizing: border-box; display: flex; align-items: flex-start; overflow: hidden;">
          <div style="width: 100%; font-size: ${pt(11)}; font-weight: 400; color: #000000; line-height: 1.08; word-break: keep-all;">${renderHangingLinesHTML(lawBodyLines.join('\n'), '0')}</div>
        </div>

        <!-- 5. 4대 발생요인 (R1 표 36: 정사각형 체크박스 4개 + 가로 구분선) -->
        <div style="position: absolute; left: ${pctX(10.6557)}; top: ${pctY(0.1257)}; width: ${pctW(2.5748)}; height: ${pctH(1.0455)}; background: #ffffff; border: 1px solid #000000; box-sizing: border-box;"></div>
        <div style="position: absolute; left: ${pctX(10.6557)}; top: ${pctY(0.6484)}; width: ${pctW(2.5748)}; height: 0; border-top: 1px solid #000000;"></div>
        ${factorItems.map(item => `
          <div style="position: absolute; left: ${pctX(item.boxX)}; top: ${pctY(item.y)}; width: ${pctW(0.2835)}; height: ${pctH(0.2835)}; background: #ffffff; border: 1px solid #000000; display: flex; align-items: center; justify-content: center; font-size: ${pt(14)}; font-weight: 900; color: #000000; box-sizing: border-box;">
            ${item.checked ? '✔' : ''}
          </div>
          <div style="position: absolute; left: ${pctX(item.labelX)}; top: ${pctY(item.y)}; width: ${pctW(0.9449)}; height: ${pctH(0.2835)}; display: flex; align-items: center; padding-left: 0.25cqw; font-size: ${pt(10)}; font-weight: 800; color: #000000; white-space: nowrap; box-sizing: border-box;">
            ${item.label}
          </div>
        `).join('')}

        <!-- 6. 부적합 개요 섹션 -->
        <div style="position: absolute; left: ${pctX(0.1070)}; top: ${pctY(1.2444)}; width: ${pctW(0.8305)}; height: ${pctH(1.0694)}; background: #ffd966; border: 1px solid #000000; display: flex; align-items: center; justify-content: center; font-size: ${pt(18)}; font-weight: 800; color: #000000; text-align: center; line-height: 1.15; box-sizing: border-box;">
          부적합<br>개&nbsp;&nbsp;&nbsp;요
        </div>

        <!-- 6-2. 메타 정보 5개 독립 셀 (원본 R1: 모두 14pt Bold 고정, 초과 시 내용 축약) -->
        ${metaCols.map((col, idx) => {
      const lblName = col.label.replace(/\s*:\s*$/, '').trim();
      return `
            <div style="position: absolute; left: ${pctX(col.x)}; top: ${pctY(1.2444)}; width: ${pctW(col.w)}; height: ${pctH(0.3769)}; background: #ffffff; border: 1px solid #000000; display: flex; align-items: center; padding: 0 0.30cqw; box-sizing: border-box; white-space: nowrap; overflow: hidden; line-height: 1;">
              <strong style="color: #0000ff; font-size: ${pt(14)}; flex-shrink: 0;">${idx === 0 ? `${lblName}&nbsp;:&nbsp;` : lblName}</strong>
              <span style="font-weight: 800; color: #000000; font-size: ${pt(14)}; overflow: hidden;">${idx === 0 ? _escHtmlText(col.val) : `&nbsp;:&nbsp;${_escHtmlText(col.val)}`}</span>
            </div>
          `;
    }).join('')}

        <!-- 6-3. 부적합 내용 셀 (원본 R1: 14pt Bold 고정, 1건이어도 '1.' 상단 정렬) -->
        <div style="position: absolute; left: ${pctX(0.9375)}; top: ${pctY(1.6213)}; width: ${pctW(12.2938)}; height: ${pctH(0.6925)}; background: #ffffff; border: 1px solid #000000; display: flex; align-items: flex-start; padding: ${mainLines.length >= 3 ? '0.28cqw 0.45cqw 0.14cqw' : '0.52cqw 0.45cqw 0.16cqw'}; box-sizing: border-box; overflow: hidden;">
          <div style="flex-shrink: 0; white-space: nowrap; font-size: ${pt(14)}; line-height: 1.12;">
            <strong style="color: #0000ff;">부적합 내용</strong><strong style="color: #000000;">&nbsp;:&nbsp;</strong>
          </div>
          <div style="flex: 1; min-width: 0; font-weight: 800; color: #000000; font-size: ${pt(14)}; line-height: 1.12; word-break: keep-all;">
            ${renderHangingLinesHTML(packedMainContent, '0')}
          </div>
        </div>

        <!-- 7. 하단 통합 본문 컨테이너 (R1 표 47 R4: x = 0.107, y = 2.314, w = 13.124, h = 5.063) -->
        <div style="position: absolute; left: ${pctX(0.1070)}; top: ${pctY(2.3138)}; width: ${pctW(13.1243)}; height: ${pctH(5.0632)}; background: #ffffff; border: 1px solid #000000; box-sizing: border-box;"></div>

        <!-- 7-1. [좌측 상단] 적색 음영 배너 (원본 R1 TextBox 29: 16pt Bold 고정, 정중앙) -->
        <div style="position: absolute; left: ${pctX(0.3064)}; top: ${pctY(2.4114)}; width: ${pctW(bannerWidth)}; height: ${pctH(0.3702)}; background: rgba(192, 0, 0, 0.6); display: flex; align-items: center; justify-content: center; box-sizing: border-box; white-space: nowrap; padding: 0 0.4cqw;">
          <span style="font-size: ${pt(16)}; font-weight: 800; color: #f2f2f2; line-height: 1; text-shadow: ${glowTextShadow};">${_escHtmlText(bannerText)}</span>
        </div>

        <!-- 7-2. [중앙 상단] Hold Point 위반 박스 (R1 표 32: 원본 Calibri/+mn-ea 11pt Bold) -->
        <div style="position: absolute; left: ${pctX(5.9202)}; top: ${pctY(2.3772)}; width: ${pctW(2.2594)}; height: ${pctH(0.4039)}; background: #ffffff; border: 1px solid #000000; box-sizing: border-box;"></div>
        <div style="position: absolute; left: ${pctX(5.9748)}; top: ${pctY(2.4207)}; width: ${pctW(0.3150)}; height: ${pctH(0.3168)}; background: #ffffff; border: 1px solid #000000; display: flex; align-items: center; justify-content: center; font-size: ${pt(15)}; font-weight: 900; color: #000000; box-sizing: border-box;">
          ${data.isHoldPoint ? '✔' : ''}
        </div>
        <div style="position: absolute; left: ${pctX(6.2898)}; top: ${pctY(2.4207)}; width: ${pctW(1.8897)}; height: ${pctH(0.3168)}; display: flex; align-items: center; padding-left: 0.25cqw; font-family: 'Calibri', 'Malgun Gothic', '맑은 고딕', sans-serif; letter-spacing: -0.02em; font-size: ${pt(11)}; font-weight: 700; color: #000000; white-space: nowrap; box-sizing: border-box;">
          ${data.isHoldPoint ? (data.holdPointCode ? `Hold Point 위반 (${_escHtmlText(data.holdPointCode)})` : 'Hold Point 위반') : 'Hold Point 위반 (N/A)'}
        </div>

        <!-- 7-3. [좌측 전체] 현장 사진 영역 (PPTX와 100% 동일 좌표 · 2장 시 추출 면적 비례 배치 · 2번 로드 실패 시 1번 전체 확장) -->
        ${(hasPhoto1 && hasPhoto2 && twoPhotoBoxes) ? `
          <div data-sheet-photo="1" style="position: absolute; left: ${pctX(twoPhotoBoxes.leftBox.x)}; top: ${pctY(twoPhotoBoxes.leftBox.y)}; width: ${pctW(twoPhotoBoxes.leftBox.w)}; height: ${pctH(twoPhotoBoxes.leftBox.h)}; box-sizing: border-box; overflow: hidden; background: #ffffff;">
            <img src="${photo1Url}" onerror="${onImg1ErrorRecoverFull}" style="width: 100%; height: 100%; object-fit: cover; display: block;">
          </div>
          <div data-sheet-photo="2" style="position: absolute; left: ${pctX(twoPhotoBoxes.rightBox.x)}; top: ${pctY(twoPhotoBoxes.rightBox.y)}; width: ${pctW(twoPhotoBoxes.rightBox.w)}; height: ${pctH(twoPhotoBoxes.rightBox.h)}; box-sizing: border-box; overflow: hidden; background: #ffffff;">
            <img src="${photo2Url}" onerror="${onImg2ErrorRecoverFull}" style="width: 100%; height: 100%; object-fit: cover; display: block;">
          </div>
        ` : `
          <div data-sheet-photo="1" style="position: absolute; ${fullPhotoCssRect} box-sizing: border-box; overflow: hidden; background: #ffffff;">
            ${(photo1Url || photo2Url)
              ? `<img src="${photo1Url || photo2Url}" onerror="this.onerror=null; this.style.display='none';" style="width: 100%; height: 100%; object-fit: cover; display: block;">`
              : `<div style="width: 100%; height: 100%; background: #f8fafc; border: 1px dashed #cbd5e1; display: flex; align-items: center; justify-content: center; color: #64748b; font-size: ${pt(14)};">📸 현장 사진</div>`}
          </div>
        `}

        <!-- 7-4. [우측 컬럼] 발생원인 & 개선대책 (R1 그룹 41 정확 좌표: x = 8.245, w = 4.921) -->
        <div style="position: absolute; left: ${pctX(8.2448)}; top: ${pctY(2.3803)}; width: ${pctW(4.9213)}; height: ${pctH(0.4039)}; background: #ffd966; border: 1px solid #000000; display: flex; align-items: center; justify-content: center; font-size: ${pt(18)}; font-weight: 800; color: #000000; box-sizing: border-box;">
          발생원인 (인터뷰 결과)
        </div>

        <!-- [의견 : ] 박스 (원본 R1 TextBox 45: 제목 14pt Bold / 본문 12pt Regular, 단락 뒤 9pt, 임의 '-' 금지) -->
        <div style="position: absolute; left: ${pctX(8.2448)}; top: ${pctY(2.8227)}; width: ${pctW(4.9213)}; height: ${pctH(1.5748)}; background: #ffffff; border: 1px solid #000000; padding: 0.45cqw 0.6cqw; box-sizing: border-box; overflow: hidden;">
${renderInterviewOpinionBoxHTML(data, pt, tplEngine)}
        </div>

        <!-- [점검단 제안] 헤더 셀 (R1 TextBox 53: x = 8.245, y = 4.398, w = 1.534, h = 0.354) -->
        <div style="position: absolute; left: ${pctX(8.2448)}; top: ${pctY(4.3979)}; width: ${pctW(1.5342)}; height: ${pctH(0.3543)}; background: #ffffff; border: 1px solid #000000; display: flex; align-items: center; justify-content: center; font-size: ${pt(14)}; font-weight: 800; color: #181717; box-sizing: border-box;">
          [점검단 제안]
        </div>

        <!-- [점검단 제안] 분류 셀 (원본 R1 TextBox 54: 14pt Bold / 11pt Regular 고정, 단락 뒤 3pt) -->
        <div style="position: absolute; left: ${pctX(8.2448)}; top: ${pctY(4.7522)}; width: ${pctW(1.5342)}; height: ${pctH(0.6790)}; background: #ffffff; border: 1px solid #000000; display: flex; flex-direction: column; align-items: center; justify-content: center; box-sizing: border-box; padding: 2px; overflow: hidden;">
          ${propDisplayItems.map(it => `
            <div style="font-size: ${pt(14)}; font-weight: 800; color: #0000ff; line-height: 1.08; margin-bottom: ${pt(3)};">${_escHtmlText(it.type)}</div>
            <div style="font-size: ${pt(11)}; font-weight: 400; color: #000000; line-height: 1.08;">${_escHtmlText(it.sub)}</div>
          `).join('')}
        </div>

        <!-- [점검단 제안] 본문 셀 (원본 R1 TextBox 52: 12pt Regular 고정, 단락 뒤 3pt, 임의 '-' 금지) -->
        <div style="position: absolute; left: ${pctX(9.7790)}; top: ${pctY(4.3979)}; width: ${pctW(3.3871)}; height: ${pctH(1.0333)}; background: #ffffff; border: 1px solid #000000; padding: 0.40cqw 0.55cqw; box-sizing: border-box; overflow: hidden;">
          <div style="font-size: ${pt(12)}; font-weight: 400; line-height: 1.08; color: #000000; word-break: keep-all;">${renderHangingLinesHTML(propLines.join('\n'), pt(3))}</div>
        </div>

        <!-- 개선대책 (현장 협의 결과) 헤더 (R1 TextBox 26: x = 8.245, y = 5.495, w = 4.921, h = 0.404, 18pt bold) -->
        <div style="position: absolute; left: ${pctX(8.2448)}; top: ${pctY(5.4951)}; width: ${pctW(4.9213)}; height: ${pctH(0.4039)}; background: #ffd966; border: 1px solid #000000; display: flex; align-items: center; justify-content: center; font-size: ${pt(18)}; font-weight: 800; color: #000000; box-sizing: border-box;">
          개선대책 (현장 협의 결과)
        </div>

        <!-- 개선대책 본문 셀 (원본 R1 TextBox 38: 11pt Regular 고정, 단락 뒤 6pt, 임의 '-' 금지) -->
        <div style="position: absolute; left: ${pctX(8.2448)}; top: ${pctY(5.9064)}; width: ${pctW(3.3858)}; height: ${pctH(1.3959)}; background: #ffffff; border: 1px solid #000000; padding: 0.45cqw 0.42cqw; box-sizing: border-box; overflow: hidden;">
          <div style="font-size: ${pt(11)}; font-weight: 400; line-height: 1.08; color: #000000; word-break: keep-all;">${renderHangingLinesHTML(cmLines.join('\n'), pt(6))}</div>
        </div>

        <!-- [PM 판정결과] 헤더 셀 (R1 TextBox 27: x = 11.631, y = 5.906, w = 1.535, h = 0.333) -->
        <div style="position: absolute; left: ${pctX(11.6307)}; top: ${pctY(5.9064)}; width: ${pctW(1.5354)}; height: ${pctH(0.3329)}; background: #ffffff; border: 1px solid #000000; display: flex; align-items: center; justify-content: center; font-size: ${pt(14)}; font-weight: 800; color: #181717; box-sizing: border-box;">
          [PM 판정결과]
        </div>

        <!-- [PM 판정결과] 값 셀 (원본 R1 TextBox 28: 14pt Bold / 11pt Regular 고정 · 미입력 시 완전 공란) -->
        <div style="position: absolute; left: ${pctX(11.6307)}; top: ${pctY(6.2394)}; width: ${pctW(1.5354)}; height: ${pctH(1.0630)}; background: #ffffff; border: 1px solid #000000; display: flex; flex-direction: column; align-items: center; justify-content: center; box-sizing: border-box; padding: 2px;">
          ${pmDisplayItems.map(it => `
            <div style="font-size: ${pt(14)}; font-weight: 800; color: #0000ff; line-height: 1.08; margin-bottom: ${pt(3)};">${_escHtmlText(it.type)}</div>
            <div style="font-size: ${pt(11)}; font-weight: 400; color: #000000; line-height: 1.08;">${_escHtmlText(it.sub)}</div>
          `).join('')}
        </div>
      </div>
    `;
  }

  /**
   * [경부적합] 브라우저 실시간 16:9 슬라이드 프리뷰 HTML 렌더링 (템플릿/부적합장표(경부적합)_R1.pptx 100% 정밀 일치)
   * - 모든 글자크기 원본 R1 고정 (17pt / 14pt / 16pt) — 초과 시 글자크기 축소 금지, 내용 자연 축약 (Point #10)
   */
  function renderMinorInspectionSheetHTML(record, data, options = {}) {
    const { photo1Url = '', photo2Url = '', photo1Dims = null, photo2Dims = null } = options;
    const tplEngine = resolveTemplateEngine();
    const fitSingle = (tplEngine && tplEngine.fitSingleLineByAbbr) || ((s) => String(s || '').trim());
    const fitMulti = (tplEngine && tplEngine.fitMultilineByAbbr) || ((lines) => (Array.isArray(lines) ? lines : _splitBulletLinesShared(lines)));
    const computeTwoPhotos = (tplEngine && tplEngine.computeProportionalTwoPhotoBoxes) || ((box, _d1, _d2, gap = 0.0884) => {
      const wEach = Number(((box.w - gap) / 2).toFixed(4));
      return {
        leftBox: { x: box.x, y: box.y, w: wEach, h: box.h },
        rightBox: { x: Number((box.x + wEach + gap).toFixed(4)), y: box.y, w: wEach, h: box.h }
      };
    });

    const pctX = (x) => `${((x / 13.3333) * 100).toFixed(4)}%`;
    const pctY = (y) => `${((y / 7.5000) * 100).toFixed(4)}%`;
    const pctW = (w) => `${((w / 13.3333) * 100).toFixed(4)}%`;
    const pctH = (h) => `${((h / 7.5000) * 100).toFixed(4)}%`;
    const pt = (n) => `${(n * 0.104167).toFixed(4)}cqw`;
    const glowTextShadow = '0 0 4px rgba(0,0,0,0.85), -0.6px -0.6px 1.6px rgba(0,0,0,0.9), 0.6px 0.6px 1.6px rgba(0,0,0,0.9), -0.6px 0.6px 1.6px rgba(0,0,0,0.9), 0.6px -0.6px 1.6px rgba(0,0,0,0.9)';

    const cleanSub = fitSingle((data.subcontractor || '').replace(/[\r\n\t]+/g, ' ').trim(), 6.50, 17, '■ 위험요소 안전대책 이행 확인 [협력사: ]');
    const minorContentLines = fitMulti(_splitBulletLinesShared(data.mainContent || data.content || ''), 11.40, 0.72, 14, 1.0, 6)
      .map(ln => (/^[-•▪]\s+/.test(ln) ? ln : `- ${ln.replace(/^[-•▪]\s*/, '')}`));
    const leftBannerW = 5.4580;
    const leftBannerText = fitSingle(String(data.photoBanner || ''), 5.35, 16);
    const rightBannerW = 4.4082;
    const hasPhoto1 = Boolean(photo1Url);
    const hasPhoto2 = Boolean(photo2Url);
    const isPhoto2RiskDoc = Boolean(
      record.rightPhotoIsReference === true ||
      record.photo2IsRiskDoc === true ||
      /위험성\s*평가표|평가표|문서|서식|도면|작업절차서|매뉴얼/i.test(record.photo2Banner || record.photo2Type || '')
    );

    const minorFullBox = { x: 0.8685, y: 3.2207, w: leftBannerW, h: 4.0409 };
    const effectiveMinorRatio = options.photoLayoutRatio || data.photoLayoutRatio || 'auto';
    const minorTwoBoxes = (hasPhoto1 && hasPhoto2 && !isPhoto2RiskDoc)
      ? computeTwoPhotos(minorFullBox, photo1Dims, photo2Dims, 0.0884, effectiveMinorRatio)
      : null;
    const onMinorImg2Err = `this.onerror=null;var p2=this.parentElement;if(p2)p2.style.display='none';var root=this.closest('#jangpyoSlidePreview');var p1=root&&root.querySelector('[data-sheet-photo=\\'1\\']');if(p1){p1.style.left='${pctX(minorFullBox.x)}';p1.style.top='${pctY(minorFullBox.y)}';p1.style.width='${pctW(minorFullBox.w)}';p1.style.height='${pctH(minorFullBox.h)}';}`;
    const onMinorImg1Err = `this.onerror=null;var p1=this.parentElement;if(p1)p1.style.display='none';var root=this.closest('#jangpyoSlidePreview');var p2=root&&root.querySelector('[data-sheet-photo=\\'2\\']');if(p2){p2.style.left='${pctX(minorFullBox.x)}';p2.style.top='${pctY(minorFullBox.y)}';p2.style.width='${pctW(minorFullBox.w)}';p2.style.height='${pctH(minorFullBox.h)}';}`;

    return `
      <div id="jangpyoSlidePreview" data-severity="경부적합" data-template="R1" style="
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
        <!-- 1. 최상단 행: 위험성평가 (R1 표 47: x = 0.247, y = 0.100, w = 2.431, h = 0.833, #bdd7ee, 24pt bold) -->
        <div style="position: absolute; left: ${pctX(0.247)}; top: ${pctY(0.100)}; width: ${pctW(2.431)}; height: ${pctH(0.833)}; background: #bdd7ee; border: 1px solid #000000; display: flex; align-items: center; justify-content: center; font-size: ${pt(24)}; font-weight: 800; color: #000000; box-sizing: border-box;">
          위험성평가
        </div>

        <!-- 2. 최상단 행 우측 타이틀 (R1: x = 2.678, y = 0.100, w = 10.414, h = 0.833, 18pt bold) -->
        <div style="position: absolute; left: ${pctX(2.678)}; top: ${pctY(0.100)}; width: ${pctW(10.414)}; height: ${pctH(0.833)}; display: flex; align-items: center; padding-left: 0.7cqw; font-size: ${pt(18)}; font-weight: 800; color: #000000; white-space: nowrap; box-sizing: border-box;">
          위험성평가 확인 - [전사 안전보건경영규칙] 유해·위험요인 파악 및 위험성 관리
        </div>

        <!-- 3. 부적합 사항 라벨 (R1: x = 0.247, y = 1.000, w = 0.819, h = 1.181, #ffd966, 18pt bold) -->
        <div style="position: absolute; left: ${pctX(0.247)}; top: ${pctY(1.000)}; width: ${pctW(0.819)}; height: ${pctH(1.181)}; background: #ffd966; border: 1px solid #000000; display: flex; align-items: center; justify-content: center; font-size: ${pt(18)}; font-weight: 800; color: #000000; text-align: center; line-height: 1.15; box-sizing: border-box;">
          부적합<br>사&nbsp;&nbsp;&nbsp;항
        </div>

        <!-- 4. 부적합 사항 본문 (원본 R1: 17pt Bold 헤더 / 14pt Bold 본문 고정, 단락 뒤 6pt, 초과 시 내용 축약) -->
        <div style="position: absolute; left: ${pctX(1.066)}; top: ${pctY(1.000)}; width: ${pctW(12.026)}; height: ${pctH(1.181)}; background: #ffffff; border: 1px solid #000000; display: flex; flex-direction: column; justify-content: center; padding: 0 0.7cqw; box-sizing: border-box; overflow: hidden;">
          <div style="font-size: ${pt(17)}; font-weight: 800; color: #000000; line-height: 1.08; margin-bottom: ${pt(6)}; white-space: nowrap;">
            ■ 위험요소 안전대책 이행 확인 [<span style="color: #0000ff;">협력사: ${cleanSub ? _escHtmlText(cleanSub) : '&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;'}</span>]
          </div>
          <div style="font-size: ${pt(14)}; font-weight: 800; color: #000000; line-height: 1.08; padding-left: 1.3cqw; word-break: keep-all;">
            ${renderHangingLinesHTML(minorContentLines.length ? minorContentLines.join('\n') : '- ', pt(6))}
          </div>
        </div>

        <!-- 5. 부적합 사례 헤더 (R1: x = 0.247, y = 2.181, w = 12.845, h = 0.364, #ffd966, 16pt bold) -->
        <div style="position: absolute; left: ${pctX(0.247)}; top: ${pctY(2.181)}; width: ${pctW(12.845)}; height: ${pctH(0.364)}; background: #ffd966; border: 1px solid #000000; display: flex; align-items: center; justify-content: center; font-size: ${pt(16)}; font-weight: 800; color: #000000; box-sizing: border-box;">
          부적합 사례
        </div>

        <!-- 6. 하단 사례 컨테이너 (R1: x = 0.247, y = 2.545, w = 12.845, h = 4.853) -->
        <div style="position: absolute; left: ${pctX(0.247)}; top: ${pctY(2.545)}; width: ${pctW(12.845)}; height: ${pctH(4.853)}; background: #ffffff; border: 1px solid #000000; box-sizing: border-box;"></div>

        <!-- 6-1. 좌측 적색 음영 배너 (원본 R1: 16pt Bold 고정, 초과 시 내용 축약) -->
        <div style="position: absolute; left: ${pctX(0.8685)}; top: ${pctY(2.8276)}; width: ${pctW(leftBannerW)}; height: ${pctH(0.3702)}; background: rgba(192, 0, 0, 0.6); display: flex; align-items: center; justify-content: center; box-sizing: border-box; white-space: nowrap; padding: 0 0.4cqw;">
          <span style="font-size: ${pt(16)}; font-weight: 800; color: #f2f2f2; line-height: 1; text-shadow: ${glowTextShadow};">${_escHtmlText(leftBannerText)}</span>
        </div>

        <!-- 6-2. 좌측 부적합 사례 사진 (2장이면 면적 비례 배치, 1장이면 전체 배치, 2번 실패 시 1번 전체 확장) -->
        ${(hasPhoto1 && hasPhoto2 && !isPhoto2RiskDoc && minorTwoBoxes) ? `
          <div data-sheet-photo="1" style="position: absolute; left: ${pctX(minorTwoBoxes.leftBox.x)}; top: ${pctY(minorTwoBoxes.leftBox.y)}; width: ${pctW(minorTwoBoxes.leftBox.w)}; height: ${pctH(minorTwoBoxes.leftBox.h)}; box-sizing: border-box; overflow: hidden; background: #ffffff;">
            <img src="${photo1Url}" onerror="${onMinorImg1Err}" style="width: 100%; height: 100%; object-fit: cover; display: block;">
          </div>
          <div data-sheet-photo="2" style="position: absolute; left: ${pctX(minorTwoBoxes.rightBox.x)}; top: ${pctY(minorTwoBoxes.rightBox.y)}; width: ${pctW(minorTwoBoxes.rightBox.w)}; height: ${pctH(minorTwoBoxes.rightBox.h)}; box-sizing: border-box; overflow: hidden; background: #ffffff;">
            <img src="${photo2Url}" onerror="${onMinorImg2Err}" style="width: 100%; height: 100%; object-fit: cover; display: block;">
          </div>
        ` : `
          <div data-sheet-photo="1" style="position: absolute; left: ${pctX(minorFullBox.x)}; top: ${pctY(minorFullBox.y)}; width: ${pctW(minorFullBox.w)}; height: ${pctH(minorFullBox.h)}; box-sizing: border-box; overflow: hidden; background: #ffffff;">
            ${(photo1Url || (!isPhoto2RiskDoc && photo2Url))
              ? `<img src="${photo1Url || photo2Url}" onerror="this.onerror=null; this.style.display='none';" style="width: 100%; height: 100%; object-fit: cover; display: block;">`
              : `<div style="width: 100%; height: 100%; background: #f8fafc; border: 1px dashed #cbd5e1; display: flex; align-items: center; justify-content: center; color: #64748b; font-size: ${pt(14)};">📸 현장 사진</div>`}
          </div>
        `}

        <!-- 6-3. 우측 피치/오렌지 음영 배너 (SHAPE #2: x = 7.8740, y = 2.8276, w = 4.4082, h = 0.3702, #F8CBAD @ 60% = #fbe0ce) -->
        <div style="position: absolute; left: ${pctX(7.8740)}; top: ${pctY(2.8276)}; width: ${pctW(rightBannerW)}; height: ${pctH(0.3702)}; background: rgba(248, 203, 173, 0.6); display: flex; align-items: center; justify-content: center; box-sizing: border-box; white-space: nowrap;">
          <span style="font-size: ${pt(16)}; font-weight: 800; color: #f2f2f2; text-shadow: ${glowTextShadow};">[위험성평가표]</span>
        </div>

        <!-- 6-4. 우측 위험성평가표 영역 (실제 위험성평가표 문서일 때만 표시, 현장 부적합 사진은 절대 표시하지 않음) -->
        <div style="position: absolute; left: ${pctX(7.8740)}; top: ${pctY(3.2500)}; width: ${pctW(rightBannerW)}; height: ${pctH(3.9500)}; box-sizing: border-box; overflow: hidden; background: transparent; display: flex; align-items: center; justify-content: center;">
          ${(hasPhoto2 && isPhoto2RiskDoc && photo2Url) ? `<img src="${photo2Url}" onerror="this.onerror=null; this.style.display='none';" style="width: 100%; height: 100%; object-fit: contain; display: block;">` : ''}
        </div>
      </div>
    `;
  }

  /**
   * 브라우저 실시간 16:9 슬라이드 프리뷰 HTML 렌더링 (시설물/법규 표준서식 / 위험성평가 서식 정밀 분기)
   */
  function renderInspectionSheetHTML(record, options = {}) {
    const { rulesFromTaxonomy = [] } = options;
    const data = normalizeJangpyoData(record, rulesFromTaxonomy, options);
    if (isRiskAssessmentSheet(record, data)) {
      return renderMinorInspectionSheetHTML(record, data, options);
    }
    return renderMajorInspectionSheetHTML(record, data, options);
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

  function resolveTemplateEngine() {
    if (typeof window !== 'undefined' && window.SafePPTTemplateEngine) return window.SafePPTTemplateEngine;
    if (typeof globalThis !== 'undefined' && globalThis.SafePPTTemplateEngine) return globalThis.SafePPTTemplateEngine;
    if (typeof require === 'function') {
      try { return require('./ppt-template-engine.js'); } catch (_) { }
    }
    return null;
  }

  // ── [관리자용] 보고서 PPT 프레젠테이션 생성 (템플릿 OOXML 우선 + PptxGenJS 폴백) ──
  async function generatePresentation(options = {}) {
    const tplEngine = resolveTemplateEngine();
    if (tplEngine && tplEngine.buildManagerPptxBlob) {
      try {
        return await tplEngine.buildManagerPptxBlob(options);
      } catch (tplErr) {
        if (options.strictTemplate) throw tplErr;
        console.warn('관리자용 템플릿 기반 PPT 생성 실패, 기본 레이아웃으로 폴백:', tplErr);
      }
    }

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
        try { b64Before = await loadPhotoBase64(sample.photos[0]); } catch (e) { }
      }
      if (loadPhotoBase64 && sample.fix && sample.fix.photo) {
        try { b64After = await loadPhotoBase64(sample.fix.photo); } catch (e) { }
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
    const filename = `관리자용_부적합보고서_${safeMonthStr}_${siteName}.pptx`;
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
          } catch (e) { }
        }, 60000);
      }
    }
    return { blob: mimeBlob, filename };
  }

  // ── [근로자용] TBM Letter PPT 프레젠테이션 생성 ──
  async function generateWorkerPresentation(options = {}) {
    const tplEngine = resolveTemplateEngine();
    if (!tplEngine || !tplEngine.buildWorkerPptxBlob) {
      throw new Error('PPT 템플릿 생성 엔진(SafePPTTemplateEngine)이 로드되지 않았습니다.');
    }
    return await tplEngine.buildWorkerPptxBlob(options);
  }

  // ── [관리자용] 인터랙티브 상세 분석 HTML 보고서 생성 ──
  async function generateManagerDetailHtml(options = {}) {
    const htmlGen = (typeof window !== 'undefined' && window.SafeHtmlReport)
      || (typeof globalThis !== 'undefined' && globalThis.SafeHtmlReport);
    if (!htmlGen || !htmlGen.buildManagerDetailHtmlBlob) {
      throw new Error('HTML 상세 보고서 생성 엔진(SafeHtmlReport)이 로드되지 않았습니다.');
    }
    return await htmlGen.buildManagerDetailHtmlBlob(options);
  }

  return {
    generateInspectionSheetPPT,
    renderInspectionSheetHTML,
    normalizeJangpyoData,
    inferRecordSeverity,
    addInspectionSheetSlide,
    generatePresentation,
    generateWorkerPresentation,
    generateManagerDetailHtml,
    extractInsights
  };
});
