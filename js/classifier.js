/**
 * SafePatrol 온디바이스 강화학습(Online Bandit RL) 자동분류기
 * - 키워드 사전 매칭 + 사용자 피드백(수정량) 기반 보상/패널티 가중치 자가학습
 * - 브라우저와 Node 양쪽에서 동작 (외부 유료 API 호출 0원, 100% 무료)
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SafeClassifier = factory();
})(typeof self !== 'undefined' ? self : this, function () {

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

    /** 1) 키워드 사전 + 강화학습 가중치 자동분류 */
    function classify(content) {
      const text = norm(content);
      if (!text) return null;
      const tokens = tokenize(content);

      const scored = items.map(it => {
        let score = 0;
        const hits = [];
        let rlBoost = 0;

        // 기본 키워드 매칭
        it.kws.forEach(k => {
          if (k && text.includes(k)) {
            const w = getItemWeight(k, it.name);
            score += (k.length + (k === norm(it.name) ? 3 : 0)) * w;
            hits.push(k);
          }
        });

        // 텍스트 토큰에 축적된 강화학습 가중치 보너스 (현장 은어/신규 어휘 학습 효과)
        tokens.forEach(t => {
          const w = getItemWeight(t, it.name);
          if (w !== 1.0) {
            const boost = (w - 1.0) * 3.5;
            score += boost;
            rlBoost += boost;
          }
        });

        // 기인물 매칭: 완전 일치(강) / 끝 3글자 일치(후보)
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

      // 유형 선정: 강화학습 가중치가 축적되었으면 학습된 유형 우선, 없으면 항목 기본값
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

      return {
        matched: true,
        result: {
          종류: top.item.kind,
          항목: top.item.name,
          기인물: exactAgents.length ? exactAgents : top.agents.map(a => a.name),
          유형: bestType,
          산업안전보건법: top.item.law,
          상태: bestOf(keywords.conditions, text, weights.conditionWeights),
          행동: bestOf(keywords.actions, text, weights.actionWeights),
          발생원인: causes,
        },
        근거단어: top.hits,
        candidates: scored.slice(1, 3).map(s => `${s.item.kind} › ${s.item.name}`),
        rlBoost: Math.round(top.rlBoost * 10) / 10
      };
    }

    /**
     * 2) 피드백 기반 강화학습(Online RL / Contextual Bandit Update)
     * - 사용자가 추천 적용 후 그대로 저장하면 -> 보상(Reward +)
     * - 추천된 항목을 다른 것으로 수정하면 -> 오답 감점(Penalty -) 및 실제 선택한 정답 가중치 상향(+)
     */
    function trainFeedback({ inputContent, recommendedResult, finalSavedRecord, applied }) {
      if (!finalSavedRecord || !inputContent) return null;
      const tokens = tokenize(inputContent);
      if (!tokens.length) return null;

      const alpha = 0.35; // 학습률 (Learning Rate)
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
        // [케이스 1]: 추천을 적용한 뒤 최종 저장한 경우 (수정량 기반 보상/패널티)
        const itemMatch = recommendedResult.항목 === finalSavedRecord.item;
        const typeMatch = recommendedResult.유형 === finalSavedRecord.type;
        const condMatch = recommendedResult.상태 === finalSavedRecord.condition;
        const actMatch = recommendedResult.행동 === finalSavedRecord.action;

        // 1) 항목(Item) 보상 / 패널티
        if (itemMatch) {
          netReward += 1.0;
          tokens.forEach(t => updateW(weights.itemWeights, t, finalSavedRecord.item, alpha * 1.0));
        } else {
          netReward -= 0.8;
          diffs.push(`항목: [추천] ${recommendedResult.항목} ➔ [수정] ${finalSavedRecord.item}`);
          // 오답 추천 항목 감점
          tokens.forEach(t => updateW(weights.itemWeights, t, recommendedResult.항목, -alpha * 0.8));
          // 사용자가 직접 고친 정답 항목 가점
          tokens.forEach(t => updateW(weights.itemWeights, t, finalSavedRecord.item, alpha * 1.2));
        }

        // 2) 유형(Type) 보상 / 패널티
        if (typeMatch) {
          netReward += 0.4;
          tokens.forEach(t => updateW(weights.typeWeights, t, finalSavedRecord.type, alpha * 0.5));
        } else if (finalSavedRecord.type) {
          netReward -= 0.3;
          diffs.push(`유형: [추천] ${recommendedResult.유형} ➔ [수정] ${finalSavedRecord.type}`);
          tokens.forEach(t => updateW(weights.typeWeights, t, recommendedResult.유형, -alpha * 0.4));
          tokens.forEach(t => updateW(weights.typeWeights, t, finalSavedRecord.type, alpha * 0.6));
        }

        // 3) 상태(Condition) 보상 / 패널티
        if (condMatch && finalSavedRecord.condition) {
          netReward += 0.3;
          tokens.forEach(t => updateW(weights.conditionWeights, t, finalSavedRecord.condition, alpha * 0.4));
        } else if (finalSavedRecord.condition) {
          tokens.forEach(t => updateW(weights.conditionWeights, t, finalSavedRecord.condition, alpha * 0.5));
        }

        // 4) 행동(Action) 보상 / 패널티
        if (actMatch && finalSavedRecord.action) {
          netReward += 0.3;
          tokens.forEach(t => updateW(weights.actionWeights, t, finalSavedRecord.action, alpha * 0.4));
        } else if (finalSavedRecord.action) {
          tokens.forEach(t => updateW(weights.actionWeights, t, finalSavedRecord.action, alpha * 0.5));
        }

      } else {
        // [케이스 2]: 추천을 적용하지 않고 직접 입력/선택하여 저장한 경우 (신규 패턴 개척 학습)
        netReward += 0.8;
        tokens.forEach(t => {
          if (finalSavedRecord.item) updateW(weights.itemWeights, t, finalSavedRecord.item, alpha * 0.9);
          if (finalSavedRecord.type) updateW(weights.typeWeights, t, finalSavedRecord.type, alpha * 0.5);
          if (finalSavedRecord.condition) updateW(weights.conditionWeights, t, finalSavedRecord.condition, alpha * 0.4);
          if (finalSavedRecord.action) updateW(weights.actionWeights, t, finalSavedRecord.action, alpha * 0.4);
        });
      }

      // 통계 누적
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

    /** 3) 과거 기록 유사도 검색 */
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

    return { classify, trainFeedback, similar, getWeightsData };
  }

  return { createClassifier, tokenize };
});
