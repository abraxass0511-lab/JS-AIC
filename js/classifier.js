/**
 * SafePatrol 무료 자동분류기 (AI 미사용)
 * - 키워드 사전 매칭 + 과거 기록 유사도 검색
 * - 브라우저와 Node 양쪽에서 동작 (외부 서버·API 호출 없음)
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SafeClassifier = factory();
})(typeof self !== 'undefined' ? self : this, function () {

  const norm = s => String(s || '').toLowerCase().replace(/\s+/g, '');

  /** 괄호·구분자를 떼어 기인물의 핵심 단어를 만든다. 예) "동바리(파이프서포트)" → ["동바리","파이프서포트"] */
  const agentWords = a => a.split(/[()·,/]/).map(norm).filter(w => w.length >= 2);

  function createClassifier(taxonomy, keywords) {
    // 항목별 검색 인덱스 생성
    const items = [];
    taxonomy.categories.list.forEach(cat => cat.items.forEach(it => {
      const kws = new Set([norm(it.name), ...(keywords.items[it.name] || []).map(norm)]);
      items.push({ ...it, kind: cat.kind, kws: [...kws] });
    }));

    function bestOf(map, text) {
      let best = null, bestScore = 0;
      for (const [label, kws] of Object.entries(map)) {
        const score = kws.filter(k => text.includes(norm(k))).reduce((s, k) => s + k.length, 0);
        if (score > bestScore) { best = label; bestScore = score; }
      }
      return best;
    }

    /** 1) 키워드 사전 분류 */
    function classify(content) {
      const text = norm(content);
      if (!text) return null;

      const scored = items.map(it => {
        let score = 0;
        const hits = [];
        it.kws.forEach(k => { if (k && text.includes(k)) { score += k.length + (k === norm(it.name) ? 3 : 0); hits.push(k); } });
        // 기인물 매칭: 완전 일치(강) / 끝 3글자 일치(후보)
        const agents = [];
        it.agents.forEach(a => {
          const words = agentWords(a);
          if (words.some(w => text.includes(w))) { agents.push({ name: a, exact: true }); score += 2; }
          else if (words.some(w => w.length >= 3 && text.includes(w.slice(-3)))) agents.push({ name: a, exact: false });
        });
        return { item: it, score, hits, agents };
      }).filter(x => x.score > 0).sort((a, b) => b.score - a.score);

      if (!scored.length) return { matched: false, candidates: [] };

      const top = scored[0];
      const exactAgents = top.agents.filter(a => a.exact).map(a => a.name);
      const causes = Object.entries(keywords.causes)
        .filter(([, kws]) => kws.some(k => text.includes(norm(k)))).map(([c]) => c);

      return {
        matched: true,
        result: {
          종류: top.item.kind,
          항목: top.item.name,
          기인물: exactAgents.length ? exactAgents : top.agents.map(a => a.name),
          유형: top.item.defaultType,
          산업안전보건법: top.item.law,
          상태: bestOf(keywords.conditions, text),
          행동: bestOf(keywords.actions, text),
          발생원인: causes,
        },
        근거단어: top.hits,
        candidates: scored.slice(1, 3).map(s => `${s.item.kind} › ${s.item.name}`),
      };
    }

    /** 2) 과거 기록 유사도 검색 (글자 2개씩 묶어, 새 입력의 몇 %가 과거 기록과 겹치는지 비교) */
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

    return { classify, similar };
  }

  return { createClassifier };
});
