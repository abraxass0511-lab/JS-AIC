/**
 * SafePatrol 온디바이스 강화학습(Online Bandit RL) & 건설안전 9×9단 자동분류기
 * - 키워드 사전 매칭 + 사용자 피드백(수정량) 기반 보상/패널티 가중치 자가학습
 * - 건설안전 9×9단(81개 매트릭스), 가시설 심층 분류, 8대 공종(80종), 부적합상태/행동, 근본원인 원스톱 자동 추론
 * - 브라우저와 Node 양쪽에서 동작 (외부 유료 API 호출 0원, 100% 무료)
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SafeClassifier = factory();
})(typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : this), function () {

  const norm = s => String(s || '').toLowerCase().replace(/[\s\-_,./\\()[\]]+/g, '');

  /** 텍스트에서 2글자 이상의 의미 있는 토큰(단어/어절) 분리 */
  function tokenize(text) {
    if (!text) return [];
    const rawTokens = String(text)
      .toLowerCase()
      .split(/[\s,./\\()[\]._\-+~!?@#$%^&*`|:;]+/g)
      .map(t => t.trim())
      .filter(t => t.length >= 2);

    const tokens = new Set(rawTokens);
    // 2글자 이상 복합어 형태소 분리 (예: "작업발판" -> "작업", "발판", "작업발판")
    rawTokens.forEach(t => {
      if (t.length >= 4) {
        for (let i = 0; i <= t.length - 2; i++) {
          tokens.add(t.slice(i, i + 2));
        }
      }
    });
    return Array.from(tokens);
  }

  /** 괄호·구분자를 떼어 기인물의 핵심 단어를 만든다. 예) "동바리(파이프서포트)" → ["동바리","파이프서포트"] */
  const agentWords = a => a.split(/[()·,/]/).map(norm).filter(w => w.length >= 2);

  // ── 9×9단 및 가시설 세부사양 매핑 사전 ──
  const MATRIX_9X9 = [
    {
      area: '가시설',
      items: [
        { name: '비계', kws: ['비계', '아시바', '비계기둥', '수직재', '수평재', '가새'], specs: { '시스템비계': ['시스템', '시스템비계'], '강관비계': ['강관', '파이프비계', '단관'], '이동식틀비계': ['이동식', '틀비계', 'bt', 'b/t'], '달비계': ['달비계', '와이어'], '달대비계': ['달대'], '말비계': ['말비계', '우마'], '각립비계': ['각립'] } },
        { name: '흙막이', kws: ['흙막이', '토류판', 'cip', 'scw', '어스앵커', '스트럿', '띠장', '버팀대', '토사', '비탈면'], specs: { '수직재': ['수직재', 'h파일', 'h-pile'], '수평재': ['수평재', '띠장', '웨일'], '모서리부': ['모서리', '코너'], '토사부': ['토사', '배면'] } },
        { name: '동바리', kws: ['동바리', '서포트', 'support', '파이프서포트', '잭서포트', '시스템동바리'], specs: { '시스템동바리': ['시스템동바리', '시스템'], '강관동바리': ['강관동바리', '파이프서포트'], '잭서포트': ['잭서포트', 'jack'] } },
        { name: '거푸집', kws: ['거푸집', '폼', 'form', '유로폼', '갱폼', '알폼'], specs: { '갱폼': ['갱폼', 'gang'], '알폼': ['알폼', 'al-form', '알루미늄폼'], '유로폼': ['유로폼', 'euro'] } },
        { name: '특수거푸집', kws: ['특수거푸집', 'acs', 'rcs', '슬립폼', '테이블폼', '클라이밍'], specs: { 'ACS': ['acs'], 'RCS': ['rcs'], '슬립폼': ['슬립폼'] } },
        { name: '데크', kws: ['데크', '데크플레이트', '트러스데크', '이지데크'], specs: { '데크플레이트': ['데크플레이트', 'deck'] } },
        { name: '철골', kws: ['철골', 'h빔', 'h-beam', '트러스', '철골보', '철골기둥'], specs: { '철골': ['철골', 'h빔'] } },
        { name: 'PC', kws: ['pc', '프리캐스트', 'pc부재', '더블티'], specs: { 'PC': ['pc', '프리캐스트'] } },
        { name: '안전시설', kws: ['난간', '안전난간', '방호망', '덮개', '방호선반', '낙하물방지망', '안전대걸이'], specs: { '추락방지시설(안전난간)': ['안전난간', '난간대'], '추락방지시설(덮개)': ['덮개', '개구부덮개'], '추락방지시설(수직방호망)': ['수직방호망'], '추락방지시설(안전대걸이시설)': ['안전대걸이', '구명줄'], '낙하방지시설(방호선반)': ['방호선반'], '낙하방지시설(낙하물방지망)': ['낙하물방지망', '방망'] } }
      ]
    },
    {
      area: '건설장비',
      items: [
        { name: '양중장비', kws: ['타워크레인', '크레인', '이동식크레인', '카고크레인', '호이스트', '윈치'] },
        { name: '탑승장비', kws: ['고소작업대', '고소작업차', '스카이', '렌탈', '곤돌라', '리프트', '건설용리프트'] },
        { name: '운반장비', kws: ['지게차', '덤프', '덤프트럭', '트레일러', '레미콘', '화물차'] },
        { name: '차량계건설기계', kws: ['불도저', '로더', '그레이더', '롤러', '다짐기'] },
        { name: '생산장비', kws: ['배쳐플랜트', '크러셔', '쇄석기', '발전기'] },
        { name: '굴착장비', kws: ['굴착기', '포크레인', '백호', '미니굴착기'] },
        { name: '천공장비', kws: ['항타기', '항발기', '천공기', '어스드릴', '어스오거', '보링기'] },
        { name: '토공장비', kws: ['스크레이퍼', '로더', '토공기계'] },
        { name: '해상장비', kws: ['바지선', '예인선', '준설선'] }
      ]
    },
    {
      area: '작업발판',
      items: [
        { name: '이동식 사다리', kws: ['사다리', 'a형사다리', '일자사다리'] },
        { name: '말비계', kws: ['말비계', '우마', '도배우마', '목공우마'] },
        { name: '틀비계', kws: ['틀비계', '이동식비계', 'bt비계'] },
        { name: '달비계', kws: ['달비계', '로프', '줄작업'] },
        { name: '달대비계', kws: ['달대비계', '달대'] },
        { name: '각립비계', kws: ['각립비계'] },
        { name: '낮은 발판', kws: ['낮은발판', '발판대'] },
        { name: '현장제작발판', kws: ['현장제작발판', '임의발판', '목재발판'] },
        { name: '지붕발판', kws: ['지붕발판', '슬레이트발판'] }
      ]
    },
    {
      area: 'PPE',
      items: [
        { name: '안전모', kws: ['안전모', '하이바', '턱끈'] },
        { name: '안전대', kws: ['안전대', '그네식안전대', '안전고리', '죔줄', '이중고리'] },
        { name: '추락방지대', kws: ['추락방지대', '로프클램프', '코브라'] },
        { name: '안전화', kws: ['안전화'] },
        { name: '보안경/면', kws: ['보안경', '용접면', '보안면'] },
        { name: '귀덮개/마개', kws: ['귀마개', '귀덮개', '소음'] },
        { name: '호흡기보호구', kws: ['방진마스크', '방독마스크', '송기마스크', '마스크'] },
        { name: '안전장갑', kws: ['안전장갑', '절연장갑'] },
        { name: '안전장화', kws: ['안전장화', '절연장화'] }
      ]
    },
    {
      area: '전기시설',
      items: [
        { name: '분전반', kws: ['분전반', '임시분전함', '배전반', '외함'] },
        { name: '누전차단기', kws: ['누전차단기', '차단기', 'elcb'] },
        { name: '접지시설', kws: ['접지', '접지선', '접지극'] },
        { name: '전선', kws: ['전선', '케이블', '릴선', '인입선', '피복'] },
        { name: '전등시설', kws: ['투광등', '조명', '전등', '작업등'] },
        { name: '수전시설', kws: ['변압기', '특고압', '수전반'] },
        { name: '냉난방기', kws: ['열풍기', '선풍기', '에어컨'] },
        { name: '전열시설', kws: ['히터', '전열기'] },
        { name: '전기기구', kws: ['콘센트', '플러그', '멀티탭'] }
      ]
    },
    {
      area: '소방시설',
      items: [
        { name: '소화시설', kws: ['소화기', '소화전', '간이소화장치'] },
        { name: '불티비산방지', kws: ['불티비산방지포', '방포', '불티', '용접포'] },
        { name: '비상대피시설', kws: ['비상구', '유도등', '피난통로'] },
        { name: '화재감지시설', kws: ['감지기', '화재경보기'] },
        { name: '화재수신반', kws: ['수신반', '방재실'] },
        { name: '스프링쿨러', kws: ['스프링클러', '헤드'] },
        { name: '충전시설', kws: ['배터리충전', '충전소'] },
        { name: '가설건물', kws: ['컨테이너', '현장사무실', '가설숙소'] },
        { name: '생활화재', kws: ['담배', '흡연', '난로'] }
      ]
    },
    {
      area: '작업장',
      items: [
        { name: '가설통로', kws: ['가설통로', '보행통로', '계단탑', '경사로'] },
        { name: '비상통로', kws: ['비상통로', '대피로'] },
        { name: '작업구획', kws: ['구획', '안전띠', '라바콘'] },
        { name: '통제구역', kws: ['통제구역', '출입금지'] },
        { name: '자재야적장', kws: ['야적장', '자재적치', '적치장'] },
        { name: '위험물보관소', kws: ['유류저장소', '가스저장소', '위험물저장소'] },
        { name: '폐기물보관소', kws: ['폐기물', '쓰레기장'] },
        { name: '조도확보', kws: ['조도', '어두움', '암실'] },
        { name: '청결상태', kws: ['정리정돈', '청소', '바닥청결'] }
      ]
    },
    {
      area: '작업공도구',
      items: [
        { name: '용접기', kws: ['용접기', '아크용접기', '알곤용접기', '홀더'] },
        { name: '화기', kws: ['산소절단기', '토치', '가스절단기'] },
        { name: '절단기구', kws: ['고속절단기', '핸드그라인더', '컷소', '원형톱'] },
        { name: '회전기구', kws: ['드릴', '교반기', '해머드릴'] },
        { name: '압력기구', kws: ['콤프레셔', '에어타카', '고압세척기'] },
        { name: '타정기구', kws: ['타정총', '화약총'] },
        { name: '운반기구', kws: ['핸드파렛트', '손수레', '대차'] },
        { name: '양중기구', kws: ['샤클', '슬링벨트', '와이어로프', '체인블록'] },
        { name: '수공구', kws: ['망치', '렌치', '스패너', '칼'] }
      ]
    },
    {
      area: '작업방법',
      items: [
        { name: '고소작업', kws: ['고소작업', '높은곳', '2m이상'] },
        { name: '양중작업', kws: ['인양', '양중', '인양작업'] },
        { name: '설치조립작업', kws: ['조립', '설치작업'] },
        { name: '해체작업', kws: ['해체', '철거작업'] },
        { name: '굴착작업', kws: ['터파기', '굴착작업'] },
        { name: '하역운반작업', kws: ['하역', '상차', '하차'] },
        { name: '중량물취급작업', kws: ['중량물', '들기작업'] },
        { name: '밀폐공간작업', kws: ['밀폐공간', '맨홀', '정화조', '탱크내부', '환기'] },
        { name: '협소공간작업', kws: ['협소', '피트', 'ps실'] }
      ]
    }
  ];

  function inferMatrix9x9(text) {
    const t = norm(text);
    let best = { area: '가시설', item: '비계', spec: '시스템비계', score: 0 };

    for (const group of MATRIX_9X9) {
      for (const it of group.items) {
        let itScore = 0;
        if (t.includes(norm(it.name))) itScore += 10;
        for (const kw of it.kws) {
          if (t.includes(norm(kw))) itScore += kw.length * 2;
        }

        if (itScore > best.score) {
          let specName = '';
          if (it.specs) {
            for (const [sName, sKws] of Object.entries(it.specs)) {
              if (sKws.some(sk => t.includes(norm(sk)))) {
                specName = sName;
                itScore += 5;
                break;
              }
            }
            if (!specName) specName = Object.keys(it.specs)[0];
          }
          best = { area: group.area, item: it.name, spec: specName, score: itScore };
        }
      }
    }

    return best;
  }

  function inferRootCauseAndStakeholder(text, matrixInfo, type) {
    const t = norm(text);
    let mgmt = '작업계획 미이행/부족';
    let system = '확인: 일일점검 미실시';
    let stakeholder = '시공담당';

    if (t.includes('난간') || t.includes('개구부') || t.includes('덮개') || t.includes('발판') || t.includes('추락방지')) {
      mgmt = '안전시설 미설치';
      system = '실행: 안전시설 미설치';
      stakeholder = '시공담당';
    } else if (t.includes('안전대') || t.includes('안전모') || t.includes('턱끈') || t.includes('보호구') || t.includes('미착용')) {
      mgmt = '보호구 사용 감시 소홀';
      system = '실행: 안전보호구 미사용';
      stakeholder = '협력회사 소장';
    } else if (t.includes('신호수') || t.includes('유도원') || t.includes('양중') || t.includes('크레인') || t.includes('신호')) {
      mgmt = '신호수 미배치';
      system = '계획: 건설기계작업계획서 미승인/미이행';
      stakeholder = '공사팀장';
    } else if (t.includes('용접') || t.includes('불티') || t.includes('화재') || t.includes('소화기')) {
      mgmt = '작업 전 가연물 미차단';
      system = '실행: 작업환경 미조성';
      stakeholder = '협력회사 안전관리자';
    } else if (t.includes('밀폐') || t.includes('산소') || t.includes('가스') || t.includes('질식')) {
      mgmt = '작업환경 측정 미실시';
      system = '계획: 중점위험작업 안전대책 미수립/미승인';
      stakeholder = '안전관리자';
    } else if (t.includes('전기') || t.includes('분전함') || t.includes('접지') || t.includes('차단기')) {
      mgmt = '작업 전 전원 미차단';
      system = '확인: 일일점검 미실시';
      stakeholder = '시공담당';
    } else if (t.includes('동바리') || t.includes('거푸집') || t.includes('붕괴') || t.includes('서포트')) {
      mgmt = '조립도 부실';
      system = '계획: 시공계획서 안전대책 미수립/미승인';
      stakeholder = '공사팀장';
    }

    return { mgmt, system, stakeholder };
  }

  function createClassifier(taxonomy, keywords, initialWeights = null) {
    // 강화학습 가중치 테이블 초기화
    const weights = initialWeights || {
      itemWeights: {},       // token -> { [itemName]: weight }
      typeWeights: {},       // token -> { [typeName]: weight }
      conditionWeights: {},  // token -> { [conditionName]: weight }
      actionWeights: {},     // token -> { [actionName]: weight }
      stats: { totalFeedbacks: 0, totalRewards: 0, positiveCount: 0, penaltyCount: 0 }
    };

    if (!weights.itemWeights) weights.itemWeights = {};
    if (!weights.typeWeights) weights.typeWeights = {};
    if (!weights.conditionWeights) weights.conditionWeights = {};
    if (!weights.actionWeights) weights.actionWeights = {};
    if (!weights.stats) weights.stats = { totalFeedbacks: 0, totalRewards: 0, positiveCount: 0, penaltyCount: 0 };

    // 항목별 검색 인덱스 생성
    const items = [];
    taxonomy.categories.list.forEach(cat => cat.items.forEach(it => {
      const kws = new Set([norm(it.name), ...(keywords.items[it.name] || []).map(norm)]);
      items.push({ ...it, kind: cat.kind, kws: [...kws] });
    }));

    function getItemWeight(token, itemName) {
      if (!token || !itemName) return 1.0;
      const t = norm(token);
      return (weights.itemWeights[t] && weights.itemWeights[t][itemName]) || 1.0;
    }

    function getSubWeight(categoryTable, token, label) {
      if (!categoryTable || !token || !label) return 1.0;
      const t = norm(token);
      return (categoryTable[t] && categoryTable[t][label]) || 1.0;
    }

    function bestOf(map, text, categoryTable = null) {
      let best = null, bestScore = 0;
      const tokens = tokenize(text);
      for (const [label, kws] of Object.entries(map)) {
        let score = kws.filter(k => text.includes(norm(k))).reduce((s, k) => s + k.length, 0);
        // 강화학습 가중치 가산
        if (categoryTable && tokens.length) {
          tokens.forEach(t => {
            const w = getSubWeight(categoryTable, t, label);
            if (w !== 1.0) score += (w - 1.0) * 2;
          });
        }
        if (score > bestScore) { best = label; bestScore = score; }
      }
      return best;
    }

    /** 1) 키워드 사전 + 강화학습 가중치 자동분류 (9×9단 인과관계 트리 통합) */
    function classify(content) {
      const text = norm(content);
      if (!text) return null;
      const tokens = tokenize(content);

      const scored = items.map(it => {
        let baseScore = 0;
        const hits = [];
        let rlBoost = 0;

        // 기본 키워드 매칭
        it.kws.forEach(k => {
          if (k && text.includes(k)) {
            const w = Math.max(0.7, getItemWeight(k, it.name));
            baseScore += (k.length + (k === norm(it.name) ? 3 : 0)) * w;
            hits.push(k);
          }
        });

        let score = baseScore;

        // 텍스트 토큰에 축적된 강화학습 가중치 보너스
        tokens.forEach(t => {
          const w = getItemWeight(t, it.name);
          if (w !== 1.0) {
            const boost = (w - 1.0) * 2.0;
            score += boost;
            rlBoost += boost;
          }
        });

        if (hits.length > 0 && score < baseScore * 0.7) {
          score = Math.max(baseScore * 0.7, 2.0);
        }

        const agents = [];
        it.agents.forEach(a => {
          const words = agentWords(a);
          if (words.some(w => text.includes(w))) { agents.push({ name: a, exact: true }); score += 2; }
          else if (words.some(w => w.length >= 3 && text.includes(w.slice(-3)))) agents.push({ name: a, exact: false });
        });

        return { item: it, score, hits, agents, rlBoost };
      }).filter(x => x.score > 0).sort((a, b) => b.score - a.score);

      if (!scored.length) return { matched: false, candidates: [] };

      const top = scored[0];
      const exactAgents = top.agents.filter(a => a.exact).map(a => a.name);
      const causes = Object.entries(keywords.causes)
        .filter(([, kws]) => kws.some(k => text.includes(norm(k)))).map(([c]) => c);

      let bestType = top.item.defaultType;
      let maxTypeBoost = 1.0;
      tokens.forEach(t => {
        const typeMap = weights.typeWeights[norm(t)] || {};
        for (const [typ, w] of Object.entries(typeMap)) {
          if (w > maxTypeBoost) {
            bestType = typ;
            maxTypeBoost = w;
          }
        }
      });

      // ── 9×9단, 가시설 세부사양, 근본원인 및 관리주체 추론 ──
      const m9 = inferMatrix9x9(content);
      const rootAnalysis = inferRootCauseAndStakeholder(content, m9, bestType);

      return {
        matched: true,
        result: {
          종류: top.item.kind,
          항목: top.item.name,
          기인물: exactAgents.length ? exactAgents : top.agents.map(a => a.name),
          기인물대: m9.area || top.item.kind || '가시설',
          기인물중: m9.item || top.item.name || '비계',
          기인물소: m9.spec || (exactAgents.length ? exactAgents[0] : (top.agents[0] ? top.agents[0].name : '')),
          유형: bestType,
          산업안전보건법: top.item.law,
          상태: bestOf(keywords.conditions, text, weights.conditionWeights),
          행동: bestOf(keywords.actions, text, weights.actionWeights),
          발생원인: causes,
          // 9×9단 확장 인자
          점검영역9x9: m9.area,
          점검대상9x9: m9.item,
          가시설세부사양: m9.spec,
          근본원인_관리감독: rootAnalysis.mgmt,
          근본원인_안전시스템: rootAnalysis.system,
          관리책임주체: rootAnalysis.stakeholder
        },
        근거단어: top.hits,
        candidates: scored.slice(1, 3).map(s => `${s.item.kind} › ${s.item.name}`),
        rlBoost: Math.round(top.rlBoost * 10) / 10
      };
    }

    /** 2) 피드백 기반 강화학습(Online RL / Contextual Bandit Update) */
    function trainFeedback({ inputContent, recommendedResult, finalSavedRecord, applied }) {
      if (!finalSavedRecord || !inputContent) return null;
      const tokens = tokenize(inputContent);
      if (!tokens.length) return null;

      const alpha = 0.35;
      let netReward = 0;
      const diffs = [];

      function updateW(table, token, label, delta) {
        if (!table || !token || !label) return;
        const t = norm(token);
        if (!table[t]) table[t] = {};
        const cur = table[t][label] !== undefined ? table[t][label] : 1.0;
        const next = Math.max(0.1, Math.min(5.0, cur + delta));
        table[t][label] = Math.round(next * 100) / 100;
      }

      if (applied && recommendedResult) {
        const itemMatch = recommendedResult.항목 === finalSavedRecord.item;
        const typeMatch = recommendedResult.유형 === finalSavedRecord.type;
        const condMatch = recommendedResult.상태 === finalSavedRecord.condition;
        const actMatch = recommendedResult.행동 === finalSavedRecord.action;

        if (itemMatch) {
          netReward += 1.0;
          tokens.forEach(t => updateW(weights.itemWeights, t, finalSavedRecord.item, alpha * 1.0));
        } else {
          netReward -= 0.8;
          diffs.push(`항목: [추천] ${recommendedResult.항목} ➔ [수정] ${finalSavedRecord.item}`);
          tokens.forEach(t => updateW(weights.itemWeights, t, recommendedResult.항목, -alpha * 0.8));
          tokens.forEach(t => updateW(weights.itemWeights, t, finalSavedRecord.item, alpha * 1.2));
        }

        if (typeMatch) {
          netReward += 0.4;
          tokens.forEach(t => updateW(weights.typeWeights, t, finalSavedRecord.type, alpha * 0.5));
        } else if (finalSavedRecord.type) {
          netReward -= 0.3;
          diffs.push(`유형: [추천] ${recommendedResult.유형} ➔ [수정] ${finalSavedRecord.type}`);
          tokens.forEach(t => updateW(weights.typeWeights, t, recommendedResult.유형, -alpha * 0.4));
          tokens.forEach(t => updateW(weights.typeWeights, t, finalSavedRecord.type, alpha * 0.6));
        }

        if (condMatch && finalSavedRecord.condition) {
          netReward += 0.3;
          tokens.forEach(t => updateW(weights.conditionWeights, t, finalSavedRecord.condition, alpha * 0.4));
        } else if (finalSavedRecord.condition) {
          tokens.forEach(t => updateW(weights.conditionWeights, t, finalSavedRecord.condition, alpha * 0.5));
        }

        if (actMatch && finalSavedRecord.action) {
          netReward += 0.3;
          tokens.forEach(t => updateW(weights.actionWeights, t, finalSavedRecord.action, alpha * 0.4));
        } else if (finalSavedRecord.action) {
          tokens.forEach(t => updateW(weights.actionWeights, t, finalSavedRecord.action, alpha * 0.5));
        }

      } else {
        netReward += 0.8;
        tokens.forEach(t => {
          if (finalSavedRecord.item) updateW(weights.itemWeights, t, finalSavedRecord.item, alpha * 0.9);
          if (finalSavedRecord.type) updateW(weights.typeWeights, t, finalSavedRecord.type, alpha * 0.5);
          if (finalSavedRecord.condition) updateW(weights.conditionWeights, t, finalSavedRecord.condition, alpha * 0.4);
          if (finalSavedRecord.action) updateW(weights.actionWeights, t, finalSavedRecord.action, alpha * 0.4);
        });
      }

      weights.stats.totalFeedbacks += 1;
      weights.stats.totalRewards += Math.round(netReward * 100) / 100;
      if (netReward >= 0.8) weights.stats.positiveCount += 1;
      else if (netReward < 0) weights.stats.penaltyCount += 1;

      return {
        reward: Math.round(netReward * 100) / 100,
        diffs,
        tokenCount: tokens.length,
        stats: { ...weights.stats }
      };
    }

    const bigrams = s => { const t = norm(s).replace(/[0-9]/g, ''); const set = new Set(); for (let i = 0; i < t.length - 1; i++) set.add(t.slice(i, i + 2)); return set; };
    function similar(content, history, threshold = 0.3) {
      const a = bigrams(content);
      if (!a.size) return [];
      return history.map(h => {
        const b = bigrams(h.content);
        const inter = [...a].filter(x => b.has(x)).length;
        return { record: h, sim: inter / a.size };
      }).filter(x => x.sim >= threshold).sort((x, y) => y.sim - x.sim).slice(0, 3);
    }

    function getWeightsData() {
      return weights;
    }

    return { classify, trainFeedback, similar, getWeightsData, inferMatrix9x9, inferRootCauseAndStakeholder };
  }

  return { createClassifier, tokenize, MATRIX_9X9, inferMatrix9x9, inferRootCauseAndStakeholder };
});
