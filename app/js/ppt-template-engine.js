/**
 * SafePatrol PPTX 템플릿 기반 OOXML 보고서 생성 엔진
 * - 관리자용 보고서: app/templates/manager_report.pptx (8장 16:9 와이드)
 * - 근로자용 TBM 레터: app/templates/worker_tbm.pptx (1장 16:9 포스터)
 * - 선택한 기간(전체/월별/기간 직접지정) 및 현장 필터 데이터를 템플릿 원본 디자인을 100% 보존하여 동적 반영
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.SafePPTTemplateEngine = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const HAZARD_TYPES = ['추락', '낙하', '붕괴', '충돌', '협착', '전도', '화재', '감전'];
  const COLORS = {
    NAVY: '002060',
    BLUE: '4472C4',
    ORANGE: 'ED7D31',
    GRAY: 'A5A5A5',
    GOLD: 'FFC000',
    SKY: '5B9BD5',
    GREEN: '70AD47',
    RED: 'C00000',
    BRIGHT_RED: 'FF0000',
    DARK_TEXT: '1E293B',
    MUTED_TEXT: '475569',
    BORDER: 'CBD5E1',
    CARD_BG: 'F8FAFC',
  };

  // ── XML & 문자열 유틸리티 ──────────────────────────────────────────────
  function escapeXml(val) {
    return String(val == null ? '' : val)
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  function decodeXml(str) {
    return String(str || '')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&amp;/g, '&');
  }

  const NA_VALUES = new Set(['', '-', '--', '없음', '해당없음', '해당 없음', '미지정', '미입력', '선택', 'none', 'n/a', 'na', 'null', 'undefined']);

  function isMeaningfulValue(v) {
    if (v === null || v === undefined) return false;
    const s = String(v).replace(/\s+/g, ' ').trim();
    if (!s) return false;
    return !NA_VALUES.has(s.toLowerCase());
  }

  function cleanSafetyText(text) {
    let s = String(text || '').replace(/\r?\n+/g, ' ').replace(/\s+/g, ' ').trim();
    if (!s) return '';
    for (let pass = 0; pass < 5; pass++) {
      s = s
        .replace(/^\[(?:[^\[\]]*|\[[^\]]*\])*\]+\s*/g, '')
        .replace(/^[\[\]]+\s*/g, '')
        .replace(/^\d{1,2}\)\s*/, '')
        .replace(/^[①-⑮]\s*/, '')
        .replace(/^[-·•–—:]+\s*/, '')
        .trim();
    }
    s = s.replace(/[\[\]]+/g, '').replace(/\s*\.{2,}\s*$/g, '').replace(/\s*…+\s*$/g, '').replace(/\s+/g, ' ').trim();
    return s;
  }

  function toCompletePhrase(text, maxLen) {
    let s = cleanSafetyText(text);
    if (!s) return '';
    if (!maxLen || s.length <= maxLen) return s;

    // 1. 괄호 부연설명을 제거해 핵심만 유지
    const noParen = s.replace(/\([^)]{1,24}\)/g, '').replace(/\s+/g, ' ').trim();
    if (noParen && noParen.length <= maxLen && noParen.length >= Math.min(4, maxLen)) return noParen;
    if (noParen && noParen.length < s.length && noParen.length >= 4) s = noParen;

    // 2. 공백·구분자 축약 및 상용 건설용어 간결화 (복합 `/` 명사는 `·`로 연결 유지)
    s = s.replace(/([가-힣A-Za-z0-9])\/([가-힣A-Za-z0-9])/g, '$1·$2');
    const compactMap = [
      [/거푸집\s*동바리\s*공사/g, '거푸집동바리'],
      [/가설\s*전기\s*공사/g, '가설전기'],
      [/철근\s*콘크리트\s*공사/g, '철근콘크리트'],
      [/위험성\s*평가/g, '위험성평가'],
      [/안전\s*작업\s*지침/g, '작업지침'],
      [/구조\s*검토서/g, '구조검토서'],
      [/\s*,\s*/g, ','],
      [/\s*\/\s*/g, '·'],
      [/\s*·\s*/g, '·'],
    ];
    for (const [re, rep] of compactMap) {
      s = s.replace(re, rep);
      if (s.length <= maxLen) return s.trim();
    }

    // 3. 절 단위 분리 (첫 절이 6자 이상일 때만 절 경계 우선 채택)
    const clauses = s.split(/(?:[,;]|\s+및\s+|\s+후\s+|\s*-\s*)/).filter(Boolean);
    if (clauses.length > 1 && clauses[0].trim().length >= 6) {
      let acc = '';
      for (const c of clauses) {
        const cleanC = c.trim();
        if (!cleanC) continue;
        const next = acc ? `${acc}·${cleanC}` : cleanC;
        if (next.length <= maxLen) {
          acc = next;
        } else if (!acc) {
          break;
        } else {
          return acc.replace(/[,/;·\-:\s]+$/g, '').trim();
        }
      }
      if (acc && acc.length <= maxLen) return acc.replace(/[,/;·\-:\s]+$/g, '').trim();
    }

    // 4. 어절 단위로 최대 길이 내 완결 어구 구성
    const words = s.split(/\s+/).filter(Boolean);
    let built = '';
    for (const w of words) {
      const next = built ? `${built} ${w}` : w;
      if (next.length <= maxLen) {
        built = next;
      } else {
        break;
      }
    }
    if (built && built.length >= Math.min(4, maxLen)) {
      built = built
        .replace(/\s+(?:을|를|이|가|은|는|의|에|로|과|와|및|등|시|중|후|위해|위한|대한|따른|있는|없는|하는)$/u, '')
        .replace(/[,/;·\-:\s]+$/g, '')
        .trim();
      if (built) return built;
    }

    // 5. 공백 없는 복합 `·` 어구만 마지막 수단으로 `·` 단위 분리
    const midParts = s.split('·').filter(Boolean);
    if (midParts.length > 1) {
      let mAcc = '';
      for (const p of midParts) {
        const next = mAcc ? `${mAcc}·${p}` : p;
        if (next.length <= maxLen) mAcc = next;
        else break;
      }
      if (mAcc) return mAcc.trim();
    }

    return s.slice(0, maxLen).replace(/[,/;·\-:\s]+$/g, '').trim();
  }

  function truncateText(text, maxLen) {
    return toCompletePhrase(text, maxLen);
  }

  function toShortCompanyName(subcontractor) {
    if (!isMeaningfulValue(subcontractor)) return '';
    let s = String(subcontractor).replace(/\s+/g, ' ').trim();
    s = s.replace(/^(?:\(주\)|㈜|주식회사|\(유\))\s*/g, '').replace(/\s*(?:\(주\)|㈜|주식회사|\(유\))$/g, '').trim();
    return toCompletePhrase(s, 7);
  }

  function compactTableLayout(slideXml, tableId, opts = {}) {
    const marT = opts.marT !== undefined ? opts.marT : 7000;
    const marB = opts.marB !== undefined ? opts.marB : 7000;
    const marL = opts.marL !== undefined ? opts.marL : 12000;
    const marR = opts.marR !== undefined ? opts.marR : 12000;
    const minRowIdx = opts.minRowIdx !== undefined ? opts.minRowIdx : 0;
    const rowHeight = opts.rowHeight || null;
    return replaceElementBlockById(slideXml, tableId, (tblBlk) => {
      let rowCounter = 0;
      return tblBlk.replace(/<a:tr\b([^>]*)>([\s\S]*?)<\/a:tr>/g, (trFull, trAttrs, trInner) => {
        const curIdx = rowCounter++;
        let newAttrs = trAttrs;
        if (rowHeight && curIdx >= minRowIdx) {
          newAttrs = /\bh="\d+"/.test(newAttrs)
            ? newAttrs.replace(/\bh="\d+"/, `h="${rowHeight}"`)
            : `${newAttrs} h="${rowHeight}"`;
        }
        const newInner = trInner.replace(/<a:tcPr([^>]*?)(\/?)>/g, (_m, attrs, slash) => {
          const cleaned = String(attrs || '').replace(/\s+mar[LRTB]="[^"]*"/g, '');
          return `<a:tcPr${cleaned} marL="${marL}" marR="${marR}" marT="${marT}" marB="${marB}"${slash}>`;
        });
        return `<a:tr${newAttrs}>${newInner}</a:tr>`;
      });
    });
  }

  function fmtNum(n) {
    const num = Number(n) || 0;
    return num.toLocaleString('ko-KR');
  }

  function pct(part, total) {
    if (!total) return 0;
    return Math.round((part / total) * 100);
  }

  function pct1(part, total) {
    if (!total) return '0.0';
    return ((part / total) * 100).toFixed(1);
  }

  // ── OOXML 도형 블록 탐색/치환 (p:grpSp 중첩 안전 처리) ───────────────
  function findElementBlockById(xml, shapeId) {
    const idRe = new RegExp(`<p:cNvPr\\b[^>]*\\bid="${shapeId}"(?:\\s|/|>)`);
    const m = idRe.exec(xml);
    if (!m) return null;

    let start = -1;
    let tagName = '';
    const candidates = ['p:sp', 'p:grpSp', 'p:graphicFrame', 'p:pic'];
    for (const tag of candidates) {
      let searchPos = m.index;
      while (searchPos >= 0) {
        const pos = xml.lastIndexOf(`<${tag}`, searchPos);
        if (pos < 0) break;
        const ch = xml[pos + tag.length + 1];
        if (ch === ' ' || ch === '>') {
          if (pos > start) {
            start = pos;
            tagName = tag;
          }
          break;
        }
        searchPos = pos - 1;
      }
    }
    if (start < 0) return null;

    const closeTag = `</${tagName}>`;
    let pos = start;
    let depth = 0;
    while (pos < xml.length) {
      const nextOpen = xml.indexOf(`<${tagName}`, pos);
      const nextClose = xml.indexOf(closeTag, pos);
      if (nextOpen >= 0 && (nextOpen < nextClose || nextClose < 0)) {
        const ch = xml[nextOpen + tagName.length + 1];
        if (ch === ' ' || ch === '>') {
          const gt = xml.indexOf('>', nextOpen);
          if (gt > nextOpen && xml[gt - 1] !== '/') depth++;
        }
        pos = nextOpen + tagName.length + 1;
      } else if (nextClose >= 0) {
        depth--;
        pos = nextClose + closeTag.length;
        if (depth <= 0) {
          return { start, end: pos, tagName, block: xml.slice(start, pos) };
        }
      } else {
        break;
      }
    }
    return null;
  }

  function replaceElementBlockById(xml, shapeId, transformFn) {
    const found = findElementBlockById(xml, shapeId);
    if (!found) return xml;
    const updated = transformFn(found.block);
    return xml.slice(0, found.start) + updated + xml.slice(found.end);
  }

  function removeElementBlockById(xml, shapeId) {
    return replaceElementBlockById(xml, shapeId, () => '');
  }

  function buildRunXml(run, defStyle = {}) {
    const text = run && typeof run === 'object' ? (run.text ?? '') : String(run ?? '');
    const sz = (run && run.sz) || defStyle.sz || 1400;
    const bold = run && run.bold !== undefined ? run.bold : defStyle.bold;
    const color = (run && run.color) || defStyle.color || COLORS.NAVY;
    const bAttr = bold ? ' b="1"' : (bold === false ? ' b="0"' : '');
    const kernVal = (run && run.kern !== undefined) ? run.kern : defStyle.kern;
    const spcVal = (run && run.spc !== undefined) ? run.spc : defStyle.spc;
    const kernAttr = kernVal !== undefined ? ` kern="${kernVal}"` : '';
    const spcAttr = spcVal !== undefined ? ` spc="${spcVal}"` : '';
    const font = (run && run.font) || defStyle.font || '맑은 고딕';
    const latin = (run && run.latin) || defStyle.latin || font;
    const ea = (run && run.ea) || defStyle.ea || font;
    const cs = (run && run.cs) || defStyle.cs || '';
    const csXml = cs ? `<a:cs typeface="${escapeXml(cs)}"/>` : '';
    // !glow일 때도 반드시 <a:effectLst/>를 명시해 템플릿 <a:lstStyle>의 glow/그림자 상속을 차단
    const effectXml = (run && run.glow) || defStyle.glow
      ? '<a:effectLst><a:glow rad="101600"><a:srgbClr val="000000"><a:alpha val="80000"/></a:srgbClr></a:glow></a:effectLst>'
      : '<a:effectLst/>';
    return `<a:r><a:rPr lang="ko-KR" altLang="en-US" sz="${sz}"${bAttr}${kernAttr}${spcAttr} dirty="0"><a:solidFill><a:srgbClr val="${color}"/></a:solidFill>${effectXml}<a:latin typeface="${escapeXml(latin)}"/><a:ea typeface="${escapeXml(ea)}"/>${csXml}</a:rPr><a:t xml:space="preserve">${escapeXml(text)}</a:t></a:r>`;
  }

  function buildParagraphsXml(paragraphs, defStyle = {}) {
    const list = Array.isArray(paragraphs) ? paragraphs : [paragraphs];
    return list.map((p) => {
      const cfg = (p && typeof p === 'object' && !Array.isArray(p)) ? p : { text: p };
      const algn = cfg.algn !== undefined ? cfg.algn : (defStyle.algn || '');
      const spcBef = cfg.spcBef !== undefined ? cfg.spcBef : (defStyle.spcBef ?? 0);
      const spcAft = cfg.spcAft !== undefined ? cfg.spcAft : (defStyle.spcAft ?? 200);
      const lnSpc = cfg.lnSpc || defStyle.lnSpc || 105000;
      const marL = cfg.marL !== undefined ? cfg.marL : defStyle.marL;
      const indent = cfg.indent !== undefined ? cfg.indent : defStyle.indent;
      const buNone = cfg.buNone !== undefined ? cfg.buNone : (defStyle.buNone || marL !== undefined || indent !== undefined);
      const runs = Array.isArray(cfg.runs) ? cfg.runs : [{ text: cfg.text ?? '', ...cfg }];
      const pPrParts = [];
      if (marL !== undefined) pPrParts.push(`marL="${Math.round(marL)}"`);
      if (indent !== undefined) pPrParts.push(`indent="${Math.round(indent)}"`);
      if (algn) pPrParts.push(`algn="${algn}"`);
      pPrParts.push('eaLnBrk="1"', 'latinLnBrk="1"');
      const pPrInner = `<a:lnSpc><a:spcPct val="${lnSpc}"/></a:lnSpc>` +
        (spcBef > 0 ? `<a:spcBef><a:spcPts val="${spcBef}"/></a:spcBef>` : '') +
        (spcAft > 0 ? `<a:spcAft><a:spcPts val="${spcAft}"/></a:spcAft>` : '') +
        (buNone ? '<a:buNone/>' : '');
      const runsXml = runs.map((r) => buildRunXml(r, defStyle)).join('');
      const endSz = (runs[0] && runs[0].sz) || defStyle.sz || 1400;
      return `<a:p><a:pPr ${pPrParts.join(' ')}>${pPrInner}</a:pPr>${runsXml}<a:endParaRPr lang="ko-KR" altLang="en-US" sz="${endSz}" dirty="0"/></a:p>`;
    }).join('');
  }

  function setShapeParagraphs(slideXml, shapeId, paragraphs, defStyle = {}) {
    return replaceElementBlockById(slideXml, shapeId, (block) => {
      const txOpen = block.indexOf('<p:txBody>');
      const txClose = block.lastIndexOf('</p:txBody>');
      if (txOpen < 0 || txClose < 0) return block;
      const inner = block.slice(txOpen + '<p:txBody>'.length, txClose);
      const firstP = inner.search(/<a:p(?:\s|>)/);
      let header = firstP >= 0 ? inner.slice(0, firstP) : inner;
      if (defStyle.lIns !== undefined || defStyle.tIns !== undefined || defStyle.rIns !== undefined || defStyle.bIns !== undefined || defStyle.anchor !== undefined) {
        header = header.replace(/<a:bodyPr([^>]*?)(\/?)>/, (_m, attrs, slash) => {
          let a = attrs;
          for (const k of ['lIns', 'tIns', 'rIns', 'bIns']) {
            if (defStyle[k] !== undefined) {
              const re = new RegExp(`\\b${k}="\\d+"`);
              a = re.test(a) ? a.replace(re, `${k}="${defStyle[k]}"`) : `${a} ${k}="${defStyle[k]}"`;
            }
          }
          if (defStyle.anchor !== undefined) {
            const re = /\banchor="[a-zA-Z]+"/;
            a = re.test(a) ? a.replace(re, `anchor="${defStyle.anchor}"`) : `${a} anchor="${defStyle.anchor}"`;
          }
          return `<a:bodyPr${a}${slash}>`;
        });
      }
      if (defStyle.noAutofit) {
        header = header.replace(/<a:spAutoFit\s*\/>|<a:normAutofit[^>]*\/>/g, '<a:noAutofit/>');
      }
      if (defStyle.clearLstStyle) {
        header = header.replace(/<a:lstStyle>[\s\S]*?<\/a:lstStyle>/, '<a:lstStyle/>');
      }
      const pXml = buildParagraphsXml(paragraphs, defStyle);
      return block.slice(0, txOpen) + `<p:txBody>${header}${pXml}</p:txBody>` + block.slice(txClose + '</p:txBody>'.length);
    });
  }

  function updateShapeTextKeepAttrs(slideXml, shapeId, runs, defStyle = {}) {
    return setShapeParagraphs(slideXml, shapeId, [{ runs, algn: defStyle.algn, spcAft: 0 }], defStyle);
  }

  function createTextBoxXml(id, name, box, paragraphs, defStyle = {}, styleOpts = {}) {
    const fillXml = styleOpts.fill
      ? `<a:solidFill><a:srgbClr val="${styleOpts.fill}"/></a:solidFill>`
      : '<a:noFill/>';
    const lnXml = styleOpts.border
      ? `<a:ln w="${styleOpts.borderWidth || 12700}"><a:solidFill><a:srgbClr val="${styleOpts.border}"/></a:solidFill></a:ln>`
      : '<a:ln><a:noFill/></a:ln>';
    const prst = styleOpts.round ? 'roundRect' : 'rect';
    const avLst = styleOpts.round ? '<a:gd name="adj" fmla="val 4000"/>' : '';
    const anchor = defStyle.anchor || 't';
    const lIns = defStyle.lIns ?? 91440;
    const tIns = defStyle.tIns ?? 68580;
    const rIns = defStyle.rIns ?? 91440;
    const bIns = defStyle.bIns ?? 68580;
    const pXml = buildParagraphsXml(paragraphs, defStyle);
    return (
      `<p:sp>` +
        `<p:nvSpPr><p:cNvPr id="${id}" name="${escapeXml(name)}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr>` +
        `<p:spPr>` +
          `<a:xfrm><a:off x="${Math.round(box.x)}" y="${Math.round(box.y)}"/><a:ext cx="${Math.round(box.w)}" cy="${Math.round(box.h)}"/></a:xfrm>` +
          `<a:prstGeom prst="${prst}"><a:avLst>${avLst}</a:avLst></a:prstGeom>` +
          `${fillXml}${lnXml}` +
        `</p:spPr>` +
        `<p:txBody>` +
          `<a:bodyPr wrap="square" lIns="${lIns}" tIns="${tIns}" rIns="${rIns}" bIns="${bIns}" rtlCol="0" anchor="${anchor}"><a:normAutofit/></a:bodyPr>` +
          `<a:lstStyle/>` +
          `${pXml}` +
        `</p:txBody>` +
      `</p:sp>`
    );
  }

  function insertIntoSpTree(slideXml, elementsXml) {
    if (!elementsXml) return slideXml;
    const idx = slideXml.lastIndexOf('</p:spTree>');
    if (idx < 0) return slideXml;
    return slideXml.slice(0, idx) + elementsXml + slideXml.slice(idx);
  }

  function getNextShapeId(slideXml) {
    let maxId = 100;
    for (const m of slideXml.matchAll(/\bid="(\d+)"/g)) {
      const n = Number(m[1]);
      if (n > maxId) maxId = n;
    }
    return maxId + 1;
  }

  function getNextRelId(relsXml) {
    let maxNum = 10;
    for (const m of relsXml.matchAll(/\bId="rId(\d+)"/g)) {
      const n = Number(m[1]);
      if (n > maxNum) maxNum = n;
    }
    return maxNum + 1;
  }

  // ── 테이블 XML 업데이터 (<a:tcPr> 및 셀 기본 스타일 보존) ──────────────
  function parseCellStyleDefaults(tcXml) {
    const rPr = tcXml.match(/<a:rPr([^>]*)>([\s\S]*?)<\/a:rPr>|<a:endParaRPr([^>]*)>([\s\S]*?)<\/a:endParaRPr>/);
    const attrs = (rPr && (rPr[1] || rPr[3])) || '';
    const inner = (rPr && (rPr[2] || rPr[4])) || '';
    const szMatch = attrs.match(/\bsz="(\d+)"/);
    const bMatch = attrs.match(/\bb="([01])"/);
    const clrMatch = inner.match(/<a:srgbClr val="([0-9A-Fa-f]{6})"/);
    const algnMatch = tcXml.match(/<a:pPr[^>]*\balgn="([a-z]+)"/);
    return {
      sz: szMatch ? Number(szMatch[1]) : 1100,
      bold: bMatch ? bMatch[1] === '1' : false,
      color: clrMatch ? clrMatch[1] : COLORS.NAVY,
      algn: algnMatch ? algnMatch[1] : 'ctr',
    };
  }

  function updateCellXml(tcXml, valSpec) {
    const spec = (valSpec && typeof valSpec === 'object' && !Array.isArray(valSpec)) ? valSpec : { text: valSpec };
    // 병합 더미 셀(hMerge/vMerge): clearMerged 지정 시 잔여 텍스트만 비우고 병합 속성 유지
    if (/\b(?:hMerge|vMerge)="1"/.test(tcXml.slice(0, tcXml.indexOf('>')))) {
      if (spec.clearMerged) {
        const txOpen = tcXml.indexOf('<a:txBody>');
        const txClose = tcXml.lastIndexOf('</a:txBody>');
        if (txOpen >= 0 && txClose >= 0) {
          const inner = tcXml.slice(txOpen + '<a:txBody>'.length, txClose);
          const firstP = inner.search(/<a:p(?:\s|>)/);
          const header = firstP >= 0 ? inner.slice(0, firstP) : '<a:bodyPr/><a:lstStyle/>';
          return tcXml.slice(0, txOpen) + `<a:txBody>${header}<a:p><a:endParaRPr lang="ko-KR" dirty="0"/></a:p></a:txBody>` + tcXml.slice(txClose + '</a:txBody>'.length);
        }
      }
      return tcXml;
    }
    const defs = parseCellStyleDefaults(tcXml);
    let paras;
    if (Array.isArray(spec.paragraphs)) {
      paras = spec.paragraphs;
    } else {
      const textStr = spec.text == null ? '' : String(spec.text);
      const lines = textStr.split('\n');
      paras = lines.map((line) => ({
        text: line,
        sz: spec.sz || defs.sz,
        bold: spec.bold !== undefined ? spec.bold : defs.bold,
        color: spec.color || defs.color,
        algn: spec.algn || defs.algn,
        latin: spec.latin,
        ea: spec.ea,
        cs: spec.cs,
        spc: spec.spc,
        kern: spec.kern,
        spcAft: 0,
        lnSpc: spec.lnSpc || 95000,
      }));
    }

    const txOpen = tcXml.indexOf('<a:txBody>');
    const txClose = tcXml.lastIndexOf('</a:txBody>');
    if (txOpen < 0 || txClose < 0) return tcXml;
    const inner = tcXml.slice(txOpen + '<a:txBody>'.length, txClose);
    const firstP = inner.search(/<a:p(?:\s|>)/);
    const header = firstP >= 0 ? inner.slice(0, firstP) : '<a:bodyPr/><a:lstStyle/>';
    const pXml = buildParagraphsXml(paras, defs);
    let nextTc = tcXml.slice(0, txOpen) + `<a:txBody>${header}${pXml}</a:txBody>` + tcXml.slice(txClose + '</a:txBody>'.length);
    if (spec.anchor !== undefined || spec.marL !== undefined || spec.marR !== undefined || spec.marT !== undefined || spec.marB !== undefined) {
      nextTc = nextTc.replace(/<a:tcPr([^>]*?)(\/?)>/, (_m, attrs, slash) => {
        let a = String(attrs || '');
        if (spec.anchor !== undefined) {
          a = /\banchor="[^"]*"/.test(a) ? a.replace(/\banchor="[^"]*"/, `anchor="${spec.anchor}"`) : `${a} anchor="${spec.anchor}"`;
        }
        for (const k of ['marL', 'marR', 'marT', 'marB']) {
          if (spec[k] !== undefined) {
            const re = new RegExp(`\\b${k}="[^"]*"`);
            a = re.test(a) ? a.replace(re, `${k}="${Math.round(spec[k])}"`) : `${a} ${k}="${Math.round(spec[k])}"`;
          }
        }
        return `<a:tcPr${a}${slash}>`;
      });
    }
    return nextTc;
  }

  function updateTableById(slideXml, tableId, updatesByRow) {
    return replaceElementBlockById(slideXml, tableId, (block) => {
      let rowIdx = -1;
      return block.replace(/<a:tr\b[\s\S]*?<\/a:tr>/g, (trXml) => {
        rowIdx++;
        const rowSpec = updatesByRow[rowIdx];
        if (!rowSpec) return trXml;
        let colIdx = -1;
        return trXml.replace(/<a:tc\b[\s\S]*?<\/a:tc>/g, (tcXml) => {
          colIdx++;
          if (!(colIdx in rowSpec)) return tcXml;
          return updateCellXml(tcXml, rowSpec[colIdx]);
        });
      });
    });
  }

  // ── 차트 및 임베딩 워크시트 업데이터 ─────────────────────────────────
  function buildNumCacheXml(values, fmtCode = 'General') {
    const pts = values.map((v, i) => `<c:pt idx="${i}"><c:v>${Number(v) || 0}</c:v></c:pt>`).join('');
    return `<c:numCache><c:formatCode>${escapeXml(fmtCode)}</c:formatCode><c:ptCount val="${values.length}"/>${pts}</c:numCache>`;
  }

  function buildStrCacheXml(labels) {
    const pts = labels.map((l, i) => `<c:pt idx="${i}"><c:v>${escapeXml(l)}</c:v></c:pt>`).join('');
    return `<c:strCache><c:ptCount val="${labels.length}"/>${pts}</c:strCache>`;
  }

  function updateSeriesXml(serXml, { name, labels, values, catRange, valRange }) {
    let out = serXml;
    if (name !== undefined) {
      const txCache = buildStrCacheXml([name]);
      out = out.replace(/(<c:tx>[\s\S]*?)<c:strCache>[\s\S]*?<\/c:strCache>/, (_, p) => `${p}${txCache}`);
    }
    if (labels) {
      if (catRange) out = out.replace(/(<c:cat>[\s\S]*?<c:f>)[\s\S]*?(<\/c:f>)/, (_, p, s) => `${p}${catRange}${s}`);
      const catCache = buildStrCacheXml(labels);
      out = out.replace(/(<c:cat>[\s\S]*?)<c:strCache>[\s\S]*?<\/c:strCache>/, (_, p) => `${p}${catCache}`);
    }
    if (values) {
      if (valRange) out = out.replace(/(<c:val>[\s\S]*?<c:f>)[\s\S]*?(<\/c:f>)/, (_, p, s) => `${p}${valRange}${s}`);
      const valCache = buildNumCacheXml(values);
      out = out.replace(/(<c:val>[\s\S]*?)<c:numCache>[\s\S]*?<\/c:numCache>/, (_, p) => `${p}${valCache}`);
    }
    return out;
  }

  function updateComboChartXml(chartXml, monthlyData) {
    const labels = monthlyData.labels; // ['1월', ..., '12월']
    const s1 = monthlyData.monthlyTotal; // 당월 발생
    const s2 = monthlyData.monthlyFixed; // 조치 완료
    const s3 = monthlyData.monthlyCumul; // 연간 누적
    const seriesSpecs = [
      { name: '월별 발생', labels, values: s1 },
      { name: '조치 완료', labels, values: s2 },
      { name: '연간 누적', labels, values: s3 },
    ];
    let idx = 0;
    return chartXml.replace(/<c:ser>[\s\S]*?<\/c:ser>/g, (serXml) => {
      const spec = seriesSpecs[idx++];
      return spec ? updateSeriesXml(serXml, spec) : serXml;
    });
  }

  function updateHorizontalBarChartXml(chartXml, items) {
    const clean = (items && items.length ? items : [{ label: '해당없음', count: 0 }]).slice(0, 3);
    const labels = clean.map((x) => x.label);
    const values = clean.map((x) => Number(x.count) || 0);
    const lastRow = clean.length + 1;
    let first = true;
    return chartXml.replace(/<c:ser>[\s\S]*?<\/c:ser>/g, (serXml) => {
      if (!first) return serXml;
      first = false;
      return updateSeriesXml(serXml, {
        name: '발생건수',
        labels,
        values,
        catRange: `Sheet1!$A$2:$A$${lastRow}`,
        valRange: `Sheet1!$B$2:$B$${lastRow}`,
      });
    });
  }

  function updateTreemapChartExXml(chartExXml, typeName, leaves) {
    const clean = (leaves && leaves.length ? leaves : [{ mid: typeName, minor: '데이터 없음', count: 1 }]).slice(0, 12);
    const n = clean.length;
    const lastRow = n + 1;
    const lvl0 = clean.map((item, idx) => `<cx:pt idx="${idx}">${escapeXml(item.minor)}</cx:pt>`).join('');
    const lvl1 = clean.map((item, idx) => `<cx:pt idx="${idx}">${escapeXml(item.mid)}</cx:pt>`).join('');
    const lvl2 = clean.map((_, idx) => `<cx:pt idx="${idx}">${escapeXml(typeName)}</cx:pt>`).join('');
    const numPts = clean.map((item, idx) => `<cx:pt idx="${idx}">${Math.max(1, Number(item.count) || 1)}</cx:pt>`).join('');

    const strDimXml = `<cx:strDim type="cat"><cx:f>Sheet1!$A$2:$C$${lastRow}</cx:f>` +
      `<cx:lvl ptCount="${n}">${lvl0}</cx:lvl>` +
      `<cx:lvl ptCount="${n}">${lvl1}</cx:lvl>` +
      `<cx:lvl ptCount="${n}">${lvl2}</cx:lvl></cx:strDim>`;
    const numDimXml = `<cx:numDim type="size"><cx:f>Sheet1!$D$2:$D$${lastRow}</cx:f>` +
      `<cx:lvl ptCount="${n}" formatCode="G/표준">${numPts}</cx:lvl></cx:numDim>`;

    const out = chartExXml
      .replace(/<cx:strDim\b[\s\S]*?<\/cx:strDim>/, () => strDimXml)
      .replace(/<cx:numDim\b[\s\S]*?<\/cx:numDim>/, () => numDimXml)
      .replace(/(<cx:txData>[\s\S]*?<cx:v>)[\s\S]*?(<\/cx:v>)/, (_, p, s) => `${p}건수${s}`);
    return out;
  }

  async function updateEmbeddedWorkbook(zip, ExcelJS, xlsxPath, rows2d) {
    const fileEntry = zip.file(xlsxPath);
    if (!fileEntry || !ExcelJS) return;
    const raw = await fileEntry.async('arraybuffer');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(raw);
    const ws = wb.worksheets[0] || wb.addWorksheet('Sheet1');
    const prevCount = ws.rowCount || 0;
    for (let r = 1; r <= Math.max(prevCount, rows2d.length); r++) {
      const row = ws.getRow(r);
      const src = rows2d[r - 1];
      const maxC = Math.max(row.cellCount || 0, src ? src.length : 0);
      for (let c = 1; c <= maxC; c++) {
        row.getCell(c).value = (src && c - 1 < src.length) ? src[c - 1] : null;
      }
      row.commit();
    }
    const outBuf = await wb.xlsx.writeBuffer();
    zip.file(xlsxPath, outBuf);
  }

  // ── Treemap Fallback PNG 렌더러 (브라우저 Canvas + 무헤드 안전 폴백) ───
  function renderTreemapPngBase64(typeName, leaves, baseHex = '#4472C4') {
    if (typeof document === 'undefined' || !document.createElement) return null;
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 520;
      canvas.height = 380;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;

      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const clean = (leaves && leaves.length ? leaves : [{ mid: typeName, minor: '데이터 없음', count: 1 }]).slice(0, 8);
      const palette = [
        '#1D4ED8', '#2563EB', '#3B82F6', '#60A5FA',
        '#D97706', '#0D9488', '#4F46E5', '#64748B',
      ];
      if (baseHex && /^#[0-9a-f]{6}$/i.test(baseHex)) palette[0] = baseHex;

      // 간단한 2행 스트립 분할 트리맵 배치
      const pad = 6;
      const w = canvas.width - pad * 2;
      const h = canvas.height - pad * 2;
      const total = clean.reduce((s, x) => s + Math.max(1, Number(x.count) || 1), 0);

      let rects = [];
      let y = pad;
      let remH = h;
      let idx = 0;
      while (idx < clean.length) {
        const take = Math.min(3, clean.length - idx);
        const slice = clean.slice(idx, idx + take);
        const sliceSum = slice.reduce((s, x) => s + Math.max(1, Number(x.count) || 1), 0);
        const remSum = clean.slice(idx).reduce((s, x) => s + Math.max(1, Number(x.count) || 1), 0);
        const rowH = (idx + take >= clean.length) ? remH : Math.max(70, Math.round((sliceSum / Math.max(1, remSum)) * remH));
        let x = pad;
        slice.forEach((item, sIdx) => {
          const val = Math.max(1, Number(item.count) || 1);
          const rw = (sIdx === slice.length - 1) ? (pad + w - x) : Math.max(60, Math.round((val / Math.max(1, sliceSum)) * w));
          rects.push({ x, y, w: rw, h: rowH, item, colorIdx: rects.length });
          x += rw;
        });
        y += rowH;
        remH -= rowH;
        idx += take;
      }

      rects.forEach((rc) => {
        const bg = palette[rc.colorIdx % palette.length];
        ctx.fillStyle = bg;
        ctx.fillRect(rc.x + 1.5, rc.y + 1.5, Math.max(1, rc.w - 3), Math.max(1, rc.h - 3));
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 2;
        ctx.strokeRect(rc.x + 1.5, rc.y + 1.5, Math.max(1, rc.w - 3), Math.max(1, rc.h - 3));

        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 16px "Malgun Gothic", sans-serif';
        ctx.textBaseline = 'top';
        const label = rc.item.minor || rc.item.mid || '';
        const valTxt = `${rc.item.count || 0}건`;
        if (rc.w >= 72 && rc.h >= 46) {
          ctx.fillText(truncateText(label, Math.floor((rc.w - 14) / 14)), rc.x + 8, rc.y + 8);
          ctx.font = '13px "Malgun Gothic", sans-serif';
          ctx.fillText(valTxt, rc.x + 8, rc.y + 30);
        }
      });

      const dataUrl = canvas.toDataURL('image/png');
      const b64 = dataUrl.split(',')[1];
      return b64 || null;
    } catch (_) {
      return null;
    }
  }

  // ── Base64 이미지 정규화 & 슬라이드 사진 임베딩 ───────────────────────
  function stripBase64Header(rawStr) {
    if (!rawStr) return null;
    const s = String(rawStr).trim();
    const m = s.match(/^(?:data:)?image\/(png|jpe?g|webp);base64,([\s\S]+)$/i);
    if (m) {
      const ext = m[1].toLowerCase() === 'png' ? 'png' : 'jpeg';
      return { ext, base64: m[2].replace(/\s+/g, '') };
    }
    if (/^[A-Za-z0-9+/=]{32,}$/.test(s)) {
      return { ext: 'jpeg', base64: s };
    }
    return null;
  }

  function ensureContentTypeDefault(ctXml, ext, mime) {
    if (new RegExp(`<Default[^>]*Extension="${ext}"`, 'i').test(ctXml)) return ctXml;
    return ctXml.replace('</Types>', `<Default Extension="${ext}" ContentType="${mime}"/></Types>`);
  }

  function appendSlidePic(slideXml, relsXml, zip, ctXml, mediaName, parsedPhoto, box, picTitle) {
    if (!parsedPhoto || !parsedPhoto.base64) {
      return { slideXml, relsXml, ctXml };
    }
    const ext = parsedPhoto.ext === 'png' ? 'png' : 'jpeg';
    const mediaPath = `ppt/media/${mediaName}.${ext}`;
    // [v63 A1] 이미 압축된 JPEG/PNG 바이너리는 STORE(무압축 저장)로 즉시 패키징하여 다중 슬라이드 PPTX 생성 시간을 20초 -> 1초로 단축
    zip.file(mediaPath, parsedPhoto.base64, { base64: true, compression: 'STORE' });

    const rIdNum = getNextRelId(relsXml);
    const rId = `rId${rIdNum}`;
    const newRel = `<Relationship Id="${rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/${mediaName}.${ext}"/>`;
    const nextRelsXml = relsXml.replace('</Relationships>', `${newRel}</Relationships>`);

    let nextCtXml = ensureContentTypeDefault(ctXml, 'jpeg', 'image/jpeg');
    nextCtXml = ensureContentTypeDefault(nextCtXml, 'png', 'image/png');

    const spId = getNextShapeId(slideXml);
    const picXml =
      `<p:pic>` +
        `<p:nvPicPr><p:cNvPr id="${spId}" name="${escapeXml(picTitle || mediaName)}"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr>` +
        `<p:blipFill><a:blip r:embed="${rId}"/><a:stretch><a:fillRect/></a:stretch></p:blipFill>` +
        `<p:spPr><a:xfrm><a:off x="${Math.round(box.x)}" y="${Math.round(box.y)}"/><a:ext cx="${Math.round(box.w)}" cy="${Math.round(box.h)}"/></a:xfrm>` +
        `<a:prstGeom prst="roundRect"><a:avLst><a:gd name="adj" fmla="val 3000"/></a:avLst></a:prstGeom>` +
        `<a:ln w="9525"><a:solidFill><a:srgbClr val="CBD5E1"/></a:solidFill></a:ln></p:spPr>` +
      `</p:pic>`;

    const nextSlideXml = insertIntoSpTree(slideXml, picXml);
    return { slideXml: nextSlideXml, relsXml: nextRelsXml, ctXml: nextCtXml };
  }

  // ── 레코드 필드 정규화 및 기간 통계 집계 ──────────────────────────────
  function getRecordDateStr(rec) {
    const raw = (rec && (rec.inspectedDate || rec.createdAt || rec.updatedAt || '')) || '';
    const m = String(raw).match(/(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    const b = String((rec && rec.bucket) || '').match(/(\d{4})-(\d{2})/);
    return b ? `${b[1]}-${b[2]}-01` : '';
  }

  function normalizeSeverity(rec) {
    const s = String((rec && rec.severity) || '').trim();
    if (/중대|심각|critical/i.test(s)) return '중대';
    if (/공지|안내|notice/i.test(s)) return '공지';
    if (/중부적합|^중$/i.test(s)) return '중';
    if (/경부적합|^경$/i.test(s)) return '경';
    if (typeof root !== 'undefined' && root.SafePPT && root.SafePPT.inferRecordSeverity) {
      const inf = root.SafePPT.inferRecordSeverity(rec);
      if (/중/.test(inf)) return '중';
    }
    return '경';
  }

  function normalizeHazardType(rawType) {
    const t = String(rawType || '').trim();
    if (!t) return '추락';
    if (/추락|떨어짐|개구부|비계/.test(t)) return '추락';
    if (/낙하|비래|맞음/.test(t)) return '낙하';
    if (/붕괴|도괴|무너짐/.test(t)) return '붕괴';
    if (/충돌|부딪힘|교통/.test(t)) return '충돌';
    if (/협착|끼임/.test(t)) return '협착';
    if (/전도|넘어짐|깔림|뒤집힘|전복/.test(t)) return '전도';
    if (/화재|폭발|파열|용접/.test(t)) return '화재';
    if (/감전|누전|분전|전기/.test(t)) return '감전';
    return '기타';
  }

  function getAgentLevels(rec) {
    const major = (rec && (rec.agentMajor || rec.kind)) || '가시설';
    const mid = (rec && (rec.agentMid || rec.item)) || major || '일반시설';
    const minor = (rec && (rec.agentMinor || rec.agent || rec.location || rec.workName)) || mid || '현장요인';
    return { major: String(major).trim(), mid: String(mid).trim(), minor: String(minor).trim() };
  }

  function isUnsafeCondition(rec) {
    if (rec && isMeaningfulValue(rec.condition)) return true;
    const mc = ((rec && rec.mgmtCauses) || []).filter(isMeaningfulValue);
    const cs = ((rec && rec.causes) || []).filter(isMeaningfulValue);
    return mc.some((x) => /불안전\s*상태/.test(x)) || cs.some((x) => /물적|불안전\s*상태/.test(x));
  }

  function isUnsafeAction(rec) {
    if (rec && isMeaningfulValue(rec.action)) return true;
    const mc = ((rec && rec.mgmtCauses) || []).filter(isMeaningfulValue);
    const cs = ((rec && rec.causes) || []).filter(isMeaningfulValue);
    return mc.some((x) => /불안전\s*행동/.test(x)) || cs.some((x) => /인적|불안전\s*행동/.test(x));
  }

  function classifyPDCA(rec) {
    const tags = [];
    const mc = ((rec && rec.mgmtCauses) || []).join(' ');
    const sys = String((rec && rec.rootCauseSystem) || '');
    const mgmt = String((rec && rec.rootCauseMgmt) || '');
    const workPlan = String((rec && rec.workPlan) || '');
    const ra = String((rec && rec.basis && rec.basis.ra) || '');
    const combined = `${mc} ${sys} ${mgmt} ${workPlan} ${ra}`;

    if (/계획\s*미수립|미반영|사전/.test(combined) || /미수립/.test(workPlan)) tags.push('PLAN');
    if (/계획\s*미이행|불안전\s*상태|불안전\s*행동/.test(combined) || isMeaningfulValue(rec.condition) || isMeaningfulValue(rec.action)) tags.push('DO');
    if (/점검|확인|형식적|모니터링/.test(combined) || rec.holdPoint) tags.push('CHECK');
    if ((rec && rec.auditProposal) || (rec && rec.pmVerdict) || (rec && rec.status === '조치완료')) tags.push('ACTION');
    if (!tags.length) tags.push('DO');
    return tags;
  }

  function incMap(map, key, by = 1) {
    const k = String(key || '미상').trim() || '미상';
    map[k] = (map[k] || 0) + by;
  }

  function topEntries(map, limit = 5) {
    return Object.entries(map || {})
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([name, count]) => ({ name, count }));
  }

  function inferTargetYear(records, periodInfo) {
    const str = `${periodInfo.month || ''} ${periodInfo.rangeStart || ''} ${periodInfo.rangeEnd || ''}`;
    const m = str.match(/(20\d{2})/);
    if (m) return Number(m[1]);
    for (const r of records || []) {
      const ds = getRecordDateStr(r);
      if (ds) return Number(ds.slice(0, 4));
    }
    return new Date().getFullYear();
  }

  function formatCoverTitle(periodInfo, targetYear) {
    const yy = String(targetYear).slice(-2);
    if (periodInfo.mode === 'month' && periodInfo.month) {
      const mm = Number(periodInfo.month.split('-')[1] || 0);
      return `'${yy}. ${mm}월 부적합 보고서`;
    }
    if (periodInfo.mode === 'range' && periodInfo.rangeStart && periodInfo.rangeEnd) {
      const s = periodInfo.rangeStart.replace(/^20/, '').replace(/-/g, '.');
      const e = periodInfo.rangeEnd.replace(/^20/, '').replace(/-/g, '.');
      return `'${s}~${e} 부적합 보고서`;
    }
    return `'${yy}년 누적 부적합 보고서`;
  }

  function formatPeriodSuffix(periodInfo, targetYear) {
    const yy = String(targetYear).slice(-2);
    if (periodInfo.mode === 'month' && periodInfo.month) {
      const mm = Number(periodInfo.month.split('-')[1] || 0);
      return `'${yy}년 ${mm}월`;
    }
    if (periodInfo.mode === 'range' && periodInfo.rangeStart && periodInfo.rangeEnd) {
      return `${periodInfo.rangeStart} ~ ${periodInfo.rangeEnd}`;
    }
    return `'${yy}년 전체`;
  }

  function computeReportStats(options = {}) {
    const records = Array.isArray(options.records) ? options.records : [];
    const allRecords = Array.isArray(options.allRecords) && options.allRecords.length ? options.allRecords : records;
    const priorRecords = Array.isArray(options.priorRecords) ? options.priorRecords : null;
    const sitesMeta = Array.isArray(options.sites) ? options.sites : [];
    const siteName = options.siteName || '전체 현장';
    const inspector = (options.inspector && String(options.inspector).trim()) || '안전관리자';
    const periodInfo = {
      mode: options.periodMode || (options.month ? 'month' : 'all'),
      month: options.month || '',
      rangeStart: options.rangeStart || '',
      rangeEnd: options.rangeEnd || '',
      label: options.periodLabel || '',
    };

    const targetYear = inferTargetYear(records.length ? records : allRecords, periodInfo);
    const total = records.length;

    // 1. 등급/조치 집계
    const sev = { 계: total, 중대: 0, 중: 0, 경: 0, 공지: 0 };
    let fixed = 0;
    let holdCount = 0;
    const workGroupSet = new Set();
    const companyMap = {};

    records.forEach((r) => {
      const sv = normalizeSeverity(r);
      sev[sv] = (sev[sv] || 0) + 1;
      if (r.status === '조치완료') fixed++;
      if (r.holdPoint) holdCount++;
      if (r.workGroup) workGroupSet.add(r.workGroup);

      // 회사명(협력사) 집계 — 협력사가 공란이면 공란('') 유지 (공종 강제 대체 금지)
      const rawSub = isMeaningfulValue(r.subcontractor) ? String(r.subcontractor).replace(/\s+/g, ' ').trim() : '';
      const shortSub = toShortCompanyName(rawSub);
      const compKey = (siteName !== '전체 현장') ? shortSub : `${r.site || ''}\u0001${shortSub}`;
      if (!companyMap[compKey]) {
        const siteCfg = sitesMeta.find((s) => s.name === (r.site || ''));
        companyMap[compKey] = {
          name: shortSub,
          site: r.site || '',
          progress: toCompletePhrase((r.siteInfo && r.siteInfo.progress) || (r.progressRate ? `${r.progressRate}%` : (siteCfg && siteCfg.progress) || '-'), 8) || '-',
          amount: toCompletePhrase((r.siteInfo && r.siteInfo.amount) || (siteCfg && siteCfg.amount) || '-', 7) || '-',
          계: 0, 중대: 0, 중: 0, 경: 0, fixed: 0,
        };
      }
      companyMap[compKey].계++;
      if (sv === '중대' || sv === '중' || sv === '경') companyMap[compKey][sv]++;
      if (r.status === '조치완료') companyMap[compKey].fixed++;
    });

    const unfixed = total - fixed;
    const fixRate = pct(fixed, total);
    const companyRows = Object.values(companyMap).sort((a, b) => b.계 - a.계);

    // 2. 월별 1~12월 집계 (연간 맥락: allRecords 중 siteFilter 대상 연도)
    const yearScopedAll = allRecords.filter((r) => {
      const siteOk = siteName === '전체 현장' || r.site === siteName;
      const ds = getRecordDateStr(r);
      return siteOk && (!ds || Number(ds.slice(0, 4)) === targetYear);
    });
    const monthlyTotal = new Array(12).fill(0);
    const monthlyFixed = new Array(12).fill(0);
    (yearScopedAll.length ? yearScopedAll : records).forEach((r) => {
      const ds = getRecordDateStr(r);
      if (!ds) return;
      const mIdx = Number(ds.slice(5, 7)) - 1;
      if (mIdx >= 0 && mIdx < 12) {
        monthlyTotal[mIdx]++;
        if (r.status === '조치완료') monthlyFixed[mIdx]++;
      }
    });
    const monthlyCumul = [];
    let running = 0;
    for (let i = 0; i < 12; i++) {
      running += monthlyTotal[i];
      monthlyCumul.push(running);
    }

    const activeMonths = monthlyTotal.map((v, i) => ({ m: i + 1, v })).filter((x) => x.v > 0);
    const maxM = activeMonths.length ? activeMonths.reduce((a, b) => (b.v > a.v ? b : a)) : { m: 10, v: 0 };
    const minM = activeMonths.length ? activeMonths.reduce((a, b) => (b.v < a.v ? b : a)) : { m: 1, v: 0 };

    // 전기 대비 증감 계산
    let deltaText = '이전 비교기간 데이터 없음';
    let priorDelta = 0;
    let hasPriorDelta = false;
    if (priorRecords !== null && (periodInfo.mode === 'month' || periodInfo.mode === 'range')) {
      const pCount = priorRecords.length;
      priorDelta = total - pCount;
      hasPriorDelta = true;
      const rate = pCount > 0 ? Math.round(((total - pCount) / pCount) * 100) : (total > 0 ? 100 : 0);
      const sign = priorDelta > 0 ? '+' : '';
      deltaText = `${sign}${priorDelta}건 (${sign}${rate}%, 전기 ${pCount}건 → 당기 ${total}건)`;
    } else if (activeMonths.length >= 2) {
      const cur = activeMonths[activeMonths.length - 1];
      const prev = activeMonths[activeMonths.length - 2];
      priorDelta = cur.v - prev.v;
      hasPriorDelta = true;
      const sign = priorDelta > 0 ? '+' : '';
      deltaText = `${prev.m}월(${prev.v}건) → ${cur.m}월(${cur.v}건), ${sign}${priorDelta}건`;
    }

    // 3. 8대 위험유형 및 유형별 기인물 (Treemap + Worker Top 3)
    const hazardStats = {};
    HAZARD_TYPES.forEach((h) => {
      hazardStats[h] = { name: h, 계: 0, 중대: 0, 중: 0, 경: 0, 공지: 0, leafMap: {}, minorMap: {}, tradeMap: {}, records: [] };
    });
    hazardStats['기타'] = { name: '기타', 계: 0, 중대: 0, 중: 0, 경: 0, 공지: 0, leafMap: {}, minorMap: {}, tradeMap: {}, records: [] };

    records.forEach((r) => {
      const h = normalizeHazardType(r.type);
      const bucket = hazardStats[h] || hazardStats['기타'];
      const sv = normalizeSeverity(r);
      bucket.계++;
      bucket[sv] = (bucket[sv] || 0) + 1;
      const { mid, minor } = getAgentLevels(r);
      const leafKey = `${mid}\u0001${minor}`;
      bucket.leafMap[leafKey] = (bucket.leafMap[leafKey] || 0) + 1;
      incMap(bucket.minorMap, minor);
      incMap(bucket.tradeMap, r.workGroup || r.workName || '일반작업');
      bucket.records.push(r);
    });

    const rankedHazards = Object.values(hazardStats)
      .filter((x) => x.name !== '기타')
      .sort((a, b) => b.계 - a.계);
    const nonZeroRanked = rankedHazards.filter((x) => x.계 > 0);
    const top4Hazards = rankedHazards.slice(0, 4).map((h) => {
      const leaves = Object.entries(h.leafMap)
        .map(([k, count]) => {
          const [mid, minor] = k.split('\u0001');
          return { mid, minor, count };
        })
        .sort((a, b) => b.count - a.count);
      const topAgents = topEntries(h.minorMap, 3);
      const topTrades = topEntries(h.tradeMap, 2);
      return { ...h, pct: pct(h.계, total), leaves, topAgents, topTrades };
    });

    // 4. 불안전 상태 vs 불안전 행동 (Slide 4) - '해당없음' 등 무의미 값 제외
    const condMap = {};
    const actMap = {};
    const condSamples = [];
    const actSamples = [];
    let condCount = 0;
    let actCount = 0;
    const multiSites = new Set(records.map((r) => r.site).filter(Boolean)).size > 1;
    records.forEach((r) => {
      const hasC = isUnsafeCondition(r);
      const hasA = isUnsafeAction(r);
      if (hasC) {
        condCount++;
        const condLabel = isMeaningfulValue(r.condition)
          ? toCompletePhrase(r.condition, 16)
          : '안전방호장치·시설 결함';
        if (isMeaningfulValue(condLabel)) incMap(condMap, condLabel);
        if (condSamples.length < 4 && isMeaningfulValue(r.content)) {
          const core = toCompletePhrase(r.content, 24);
          if (core && !condSamples.some((x) => x.startsWith(core))) {
            condSamples.push(multiSites && r.site ? `${core} (${toCompletePhrase(r.site, 6)})` : core);
          }
        }
      }
      if (hasA) {
        actCount++;
        const actLabel = isMeaningfulValue(r.action)
          ? toCompletePhrase(r.action, 16)
          : '안전수칙·보호구 미준수';
        if (isMeaningfulValue(actLabel)) incMap(actMap, actLabel);
        const rawSample = isMeaningfulValue(r.interviewOpinion) ? r.interviewOpinion : r.content;
        if (actSamples.length < 4 && isMeaningfulValue(rawSample)) {
          const core = toCompletePhrase(rawSample, 24);
          if (core && !actSamples.some((x) => x.startsWith(core))) {
            actSamples.push(multiSites && r.site ? `${core} (${toCompletePhrase(r.site, 6)})` : core);
          }
        }
      }
    });

    // 5. PDCA 프로세스 분석 (Slide 5) - '해당없음' 및 이중 하이픈 제외
    const pdca = { PLAN: [], DO: [], CHECK: [], ACTION: [] };
    const pdcaReasonMap = { PLAN: {}, DO: {}, CHECK: {}, ACTION: {} };
    records.forEach((r) => {
      const phases = classifyPDCA(r);
      phases.forEach((ph) => {
        pdca[ph].push(r);
        if (ph === 'PLAN') {
          incMap(pdcaReasonMap.PLAN, r.workPlan === '미수립' ? '작업계획서 미수립' : (r.basis && r.basis.ra === '미반영' ? '위험성평가 미반영' : '사전계획 검토 미흡'));
        }
        if (ph === 'DO') {
          const doReason = isMeaningfulValue(r.condition)
            ? toCompletePhrase(r.condition, 15)
            : (isMeaningfulValue(r.action) ? toCompletePhrase(r.action, 15) : '현장 안전조치 미이행');
          if (isMeaningfulValue(doReason)) incMap(pdcaReasonMap.DO, doReason);
        }
        if (ph === 'CHECK') {
          const chkReason = r.holdPoint
            ? 'Hold Point 위반'
            : (isMeaningfulValue(r.rootCauseMgmt) ? toCompletePhrase(r.rootCauseMgmt, 15) : '현장 점검·확인 미흡');
          if (isMeaningfulValue(chkReason)) incMap(pdcaReasonMap.CHECK, chkReason);
        }
        if (ph === 'ACTION') {
          const actRaw = isMeaningfulValue(r.auditProposal) ? r.auditProposal : (isMeaningfulValue(r.pmVerdict) ? r.pmVerdict : '');
          const actReason = actRaw
            ? toCompletePhrase(actRaw, 15)
            : (r.status === '조치완료' ? '개선조치 완료' : '후속조치 보완 필요');
          if (isMeaningfulValue(actReason)) incMap(pdcaReasonMap.ACTION, actReason);
        }
      });
    });

    // 6. 사고와의 상관관계 및 테마 / 3E / 근로자 TBM 포인트
    const hiRiskCount = sev.중대 + sev.중;
    const themeRows = [];
    top4Hazards.forEach((haz) => {
      const topRecs = haz.records
        .slice()
        .sort((a, b) => (normalizeSeverity(b) === '중대' ? 2 : normalizeSeverity(b) === '중' ? 1 : 0) -
          (normalizeSeverity(a) === '중대' ? 2 : normalizeSeverity(a) === '중' ? 1 : 0));
      for (let i = 0; i < 3; i++) {
        const r = topRecs[i];
        if (r) {
          const { minor } = getAgentLevels(r);
          const rawWork = isMeaningfulValue(r.workName) ? r.workName : (isMeaningfulValue(r.workMethod) ? r.workMethod : r.content);
          const teamRaw = isMeaningfulValue(r.subcontractor) ? r.subcontractor : (isMeaningfulValue(r.inspector) ? r.inspector : (r.site || '-'));
          themeRows.push({
            type: haz.name,
            agent: toCompletePhrase(minor, 10) || '-',
            workName: toCompletePhrase(rawWork, 20) || '-',
            trade: toCompletePhrase(r.workGroup || '-', 10) || '-',
            location: toCompletePhrase(r.locationDetail || r.location || '-', 10) || '-',
            team: toCompletePhrase(teamRaw, 10) || '-',
            note: `${normalizeSeverity(r)}·${r.status === '조치완료' ? '완료' : '미조치'}`,
          });
        } else {
          themeRows.push({ type: haz.name, agent: '-', workName: '-', trade: '-', location: '-', team: '-', note: '-' });
        }
      }
    });

    const namedCompanyCount = companyRows.filter((c) => Boolean(c.name)).length;

    return {
      total,
      sev,
      fixed,
      unfixed,
      fixRate,
      holdCount,
      siteName,
      inspector,
      periodInfo,
      targetYear,
      coverTitle: formatCoverTitle(periodInfo, targetYear),
      periodSuffix: formatPeriodSuffix(periodInfo, targetYear),
      workGroupCount: workGroupSet.size,
      companyCount: namedCompanyCount,
      namedCompanyCount,
      companyRows,
      monthlyLabels: ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월'],
      monthlyTotal,
      monthlyFixed,
      monthlyCumul,
      yearTotal: monthlyCumul[11] || total,
      maxM,
      minM,
      deltaText,
      priorDelta,
      hasPriorDelta,
      hazardStats,
      rankedHazards,
      nonZeroRanked,
      top4Hazards,
      top3Hazards: top4Hazards.slice(0, 3),
      condCount,
      actCount,
      condList: topEntries(condMap, 6),
      actList: topEntries(actMap, 6),
      condSamples,
      actSamples,
      pdca,
      pdcaReasonMap,
      hiRiskCount,
      themeRows,
      records,
    };
  }

  // ── 3E 감소대책 (Slide 8) 동적 매핑 생성기 ─────────────────────────────
  function build3ERows(stats) {
    const recs = stats.records || [];
    const usedCore = new Set();
    const pick = (pred, fallbackTitle, useProposal) => {
      const matched = recs.filter(pred);
      if (!matched.length) {
        return {
          content: fallbackTitle,
          target: toCompletePhrase(stats.siteName, 11) || '-',
          owner: '안전·시공팀',
          schedule: toCompletePhrase(stats.periodSuffix, 8) || '상시',
          note: '상시',
        };
      }
      // 행마다 중복되지 않는 대표 건/대책을 우선 선택
      let coreTitle = '';
      for (const r of matched) {
        const src = useProposal
          ? (isMeaningfulValue(r.auditProposal) ? r.auditProposal : fallbackTitle)
          : (isMeaningfulValue(r.content) ? r.content : fallbackTitle);
        const cand = toCompletePhrase(src, 17);
        if (cand && !usedCore.has(cand)) {
          coreTitle = cand;
          usedCore.add(cand);
          break;
        }
      }
      if (!coreTitle) coreTitle = fallbackTitle;

      const first = matched[0];
      const trades = [...new Set(matched.map((r) => r.workGroup || r.workName).filter(isMeaningfulValue))];
      const teams = [...new Set(matched.map((r) => (isMeaningfulValue(r.subcontractor) ? r.subcontractor : r.site)).filter(isMeaningfulValue))];
      return {
        content: `${coreTitle} (${matched.length}건)`,
        target: toCompletePhrase(trades[0] || first.workName || stats.siteName, 11) || '-',
        owner: toCompletePhrase(teams[0] || '안전·시공팀', 7) || '안전·시공팀',
        schedule: matched.some((r) => r.status !== '조치완료') ? '즉시/당주' : '완료점검',
        note: `${matched.length}건`,
      };
    };

    return {
      2: pick((r) => /작업방법|고소|양중|해체/.test(`${r.workMethod} ${r.workName} ${r.content}`), '고위험 작업공법 사전검토', false),
      3: pick((r) => /계획|동시|간섭|동바리|근접/.test(`${r.workMethod} ${r.content}`), '상·하부 동시작업 간섭 조정', false),
      4: pick((r) => /비계|발판|통로|개구부|가시설/.test(`${r.kind} ${r.item} ${r.content}`), '가시설·통로 작업발판 보수', false),
      5: pick((r) => /난간|생명줄|방호|소화|접지|추락/.test(`${r.item} ${r.agent} ${r.content}`), '추락방지망·안전난간 설치', false),
      6: pick((r) => Boolean(r.holdPoint) || /점검|형식/.test(`${r.rootCauseMgmt} ${r.content}`), '일일 패트롤·Hold Point 확인', false),
      7: pick((r) => /중대|중부적합/.test(r.severity || '') || /제재|징계|코칭/.test(r.auditProposal || ''), '중부적합 즉시 시정지시 시행', true),
      8: pick((r) => /기준|법|지침|수립/.test(`${r.auditProposal} ${r.pmVerdict}`), '작업표준·허가기준 재정비', true),
      9: pick((r) => /교육|미착용|불안전\s*행동/.test(`${r.auditProposal} ${r.action} ${r.mgmtCauses}`), 'TBM 연계 핵심안전수칙 교육', true),
      10: pick((r) => (r.basis && r.basis.ra === '미반영') || /위험성/.test(`${r.auditProposal} ${r.rootCauseSystem}`), '공종별 위험성평가 변경·보완', true),
      11: pick((r) => r.status === '조치완료', '우수 협력사·근로자 포상 추천', true),
      12: pick((r) => r.status !== '조치완료', `미조치(${stats.unfixed}건) 조기종결 관리`, false),
    };
  }

  // ── 근로자용 PPT 안전Point / 사례 / 위험성평가 생성기 ───────────────────
  function buildConcreteSafetyPoint(haz, idx, allRecs) {
    const num = ['①', '②', '③'][idx];
    const hName = haz.name || '안전';
    const hRecs = (haz.records && haz.records.length ? haz.records : allRecs).slice(0, 15);
    const ctx = hRecs.map((r) => `${r.content || ''} ${r.auditProposal || ''} ${r.workName || ''} ${r.agentMinor || ''}`).join(' ');

    if (hName === '추락') {
      if (/개구부|덮개/.test(ctx)) {
        return {
          title: `${num} [추락] 개구부 덮개·안전벨트 체결`,
          bullets: [
            '개구부 덮개 고정 및 추락위험 표지 유지',
            '안전벨트(안전대) 생명줄 2지점 이상 결속',
            '작업구간 안전난간·발끝막이판 임의해체 금지',
          ],
        };
      }
      if (/사다리|말비계|A형/.test(ctx)) {
        return {
          title: `${num} [추락] 안전벨트·2인1조 작업`,
          bullets: [
            '고소작업 시 안전벨트 고리 선체결 철저',
            '사다리 최상단 작업 금지 및 2인1조 준수',
            '작업발판 고정핀·비계 흔들림 사전 점검',
          ],
        };
      }
      return {
        title: `${num} [추락] 안전벨트·안전난간 체결`,
        bullets: [
          '안전벨트(안전대) 생명줄 상부 2지점 결속',
          '안전난간·작업발판 고정 및 임의해체 금지',
          /버팀대|벽이음/.test(ctx) ? '벽이음·2단 버팀대 설치각도 및 체결 점검' : '비계·거푸집 연결핀 및 개구부 덮개 확인',
        ],
      };
    }

    if (hName === '낙하') {
      return {
        title: `${num} [낙하] 2줄 걸이·하부 출입통제`,
        bullets: [
          '자재 인양 시 2줄 걸이 및 샤클 풀림방지',
          '인양구간 하부 출입금지 및 유도자 배치',
          /전도방지|고박|유도로프/.test(ctx) ? '전도방지 파이프·유도로프 설치 철저' : '상부 작업공구 낙하방지끈·방지망 확인',
        ],
      };
    }

    if (hName === '붕괴') {
      return {
        title: `${num} [붕괴] 동바리·지지대 체결 철저`,
        bullets: [
          '동바리 수직·수평연결재 및 가새 체결 준수',
          /합벽|앵커|앙카/.test(ctx) ? '합벽지지대 앵커 볼트 체결상태 전수점검' : '거푸집 버팀대·깔목 수직도 사전 확인',
          /멍에|편심|슬라브|침하/.test(ctx) ? '멍에재 길이·지지점 편심 시공 즉시 시정' : '타설 전 동바리 하부 침하·변형 여부 점검',
        ],
      };
    }

    if (hName === '충돌') {
      return {
        title: `${num} [충돌] 신호수 배치·반경 통제`,
        bullets: [
          '장비 작업반경 내 근로자 접근금지 철저',
          '신호수 전담 배치 및 후진경보 작동확인',
          '보행자 안전통로와 장비 이동동선 완전분리',
        ],
      };
    }

    if (hName === '협착') {
      return {
        title: `${num} [협착] 방호덮개·전원 LOTO 차단`,
        bullets: [
          '회전체·끼임부위 방호덮개 설치상태 확인',
          '설비 점검·정비 전 전원 차단 및 잠금표지',
          '자재 인양·거치 시 손끼임 주의 및 수신호',
        ],
      };
    }

    if (hName === '전도') {
      return {
        title: `${num} [전도] 아웃트리거·통로정리`,
        bullets: [
          '고소작업대 아웃트리거 완전전개·지반확인',
          '작업통로 자재·전선 정리로 걸림넘어짐 예방',
          '자재 적재 높이 제한 및 전도방지 고박 철저',
        ],
      };
    }

    if (hName === '감전') {
      return {
        title: `${num} [감전] 접지선·누전차단기 점검`,
        bullets: [
          '분전반 접지선 체결 및 누전차단기 작동확인',
          '가설 분전반 외함 도어 시건 및 방수 유지',
          '피복 손상 전선·불량 콘센트 즉시 교체 사용',
        ],
      };
    }

    if (hName === '화재') {
      return {
        title: `${num} [화재] 불티비산방지·소화기 비치`,
        bullets: [
          '용접·절단 작업 시 불티비산방지포 설치',
          '화기작업 반경 5m 내 소화기 근접 배치',
          '주변 가연물 격리 및 작업 종료 후 잔불점검',
        ],
      };
    }

    return {
      title: `${num} [${hName}] 핵심 안전수칙 준수`,
      bullets: [
        '작업 전 안전보호구(안전모·안전대) 착용',
        '방호장치·작업발판 등 안전시설 사전 점검',
        '이상 징후 발견 시 즉시 작업중지 및 보고',
      ],
    };
  }

  function buildWorkerTbmContent(stats) {
    const recs = stats.records || [];
    const top3 = stats.top3Hazards || [];

    const safetyPoints = top3.map((haz, idx) => buildConcreteSafetyPoint(haz, idx, recs));
    while (safetyPoints.length < 3) {
      const idx = safetyPoints.length;
      safetyPoints.push({
        title: `${['①', '②', '③'][idx]} 현장 필수 안전수칙 준수`,
        bullets: [
          '고소작업 시 안전벨트·안전고리 체결 철저',
          '안전난간·개구부 덮개 및 안전시설 점검',
          '위험 발견 시 즉시 작업중지 후 관리자 보고',
        ],
      });
    }

    // 대표 사례 선별 — 상위 유형·서로 다른 지적내용 우선으로 다양하게 선정
    const rankedAll = recs.slice().sort((a, b) => {
      const sevScore = (r) => (normalizeSeverity(r) === '중대' ? 10 : normalizeSeverity(r) === '중' ? 6 : 2);
      const photoScore = (r) => (r.photos && r.photos.length ? 5 : 0);
      return (sevScore(b) + photoScore(b)) - (sevScore(a) + photoScore(a));
    });
    const rankedCases = [];
    const seenTypes = new Set();
    const seenContents = new Set();
    for (const r of rankedAll) {
      const h = normalizeHazardType(r.type);
      const cKey = toCompletePhrase(r.content || '', 16);
      if (!seenTypes.has(h) && !seenContents.has(cKey)) {
        rankedCases.push(r);
        seenTypes.add(h);
        seenContents.add(cKey);
        if (rankedCases.length >= 3) break;
      }
    }
    if (rankedCases.length < 3) {
      for (const r of rankedAll) {
        if (!rankedCases.includes(r)) {
          rankedCases.push(r);
          if (rankedCases.length >= 3) break;
        }
      }
    }

    const cases = [0, 1].map((i) => {
      const r = rankedCases[i];
      if (!r) {
        return {
          title: `${i === 0 ? '①' : '②'} 해당 기간 등록 사례 없음`,
          detail: '• 작업 전 위험요인 사전점검 실시',
          measure: '• 이상 발견 시 관리감독자 즉시 보고',
          photoPath: null,
        };
      }
      const hName = normalizeHazardType(r.type);
      const loc = toCompletePhrase(r.locationDetail || r.location || r.workName || r.site || '현장', 11) || '현장';
      const detailTxt = toCompletePhrase(r.content || r.workName || '안전기준 미준수', 23) || '안전기준 미준수';
      const rawMeasure = (r.fix && isMeaningfulValue(r.fix.content))
        ? r.fix.content
        : (isMeaningfulValue(r.auditProposal) ? r.auditProposal : '안전시설 보완 및 교육');
      const measureTxt = toCompletePhrase(rawMeasure, 23) || '안전시설 즉시 보완';
      return {
        title: `${i === 0 ? '①' : '②'} [${hName}] ${loc}`,
        detail: `• 지적: ${detailTxt}`,
        measure: `• 대책: ${measureTxt}`,
        photoPath: (r.photos && r.photos[0]) || (r.fix && r.fix.photo) || null,
      };
    });

    // 근로자 위험성 평가 표 3행
    const riskRows = [0, 1, 2].map((i) => {
      const r = rankedCases[i];
      if (!r) return ['금일 고위험 작업', '추락·낙하·충돌 위험요인', '보호구 착용 및 작업전 점검'];
      const hName = normalizeHazardType(r.type);
      const { minor } = getAgentLevels(r);
      const wName = toCompletePhrase(r.workName || r.workGroup || '현장작업', 9) || '현장작업';
      const wLoc = toCompletePhrase(r.location || minor, 9) || '현장';
      const work = `${wName}\n(${wLoc})`;
      const risk = `[${hName}] ${toCompletePhrase(r.content || minor, 28) || '안전위험 요인'}`;
      const rawMeas = isMeaningfulValue(r.auditProposal)
        ? r.auditProposal
        : ((r.fix && isMeaningfulValue(r.fix.content)) ? r.fix.content : '안전시설 보완 및 수칙 준수');
      const measure = toCompletePhrase(rawMeas, 28) || '안전시설 보완 및 수칙 준수';
      return [work, risk, measure];
    });

    return { safetyPoints, cases, riskRows };
  }

  // ── 템플릿 바이너리 로더 (브라우저 fetch / Node injected loader 지원) ──
  async function loadTemplateBytes(filename, customLoader) {
    if (typeof customLoader === 'function') {
      return await customLoader(filename);
    }
    if (typeof fetch === 'function') {
      const res = await fetch(`templates/${filename}?v=20261121_v56`);
      if (!res.ok) throw new Error(`템플릿 로드 실패 (${filename}: HTTP ${res.status})`);
      return await res.arrayBuffer();
    }
    throw new Error(`템플릿 로더가 없습니다: ${filename}`);
  }

  function sanitizeSheetFilename(filename) {
    const raw = String(filename || '점검장표.pptx').trim();
    const dot = raw.lastIndexOf('.');
    const ext = dot > 0 ? raw.slice(dot).replace(/[^a-zA-Z0-9.]/g, '') : '.pptx';
    const base = (dot > 0 ? raw.slice(0, dot) : raw)
      .replace(/[\/\\:*?"<>|%#&?;=\r\n\t]+/g, '_')
      .replace(/\s+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 65) || '점검장표';
    return `${base}${ext}`;
  }

  function triggerDownloadIfRequested(blob, filename, download) {
    if (download === false) return;
    const safeName = sanitizeSheetFilename(filename);
    if (typeof window !== 'undefined' && window.SafeUtil && window.SafeUtil.downloadBlob) {
      window.SafeUtil.downloadBlob(blob, safeName);
      return;
    }
    if (typeof document !== 'undefined') {
      const dlBlob = new Blob([blob], { type: 'application/octet-stream' });
      const url = URL.createObjectURL(dlBlob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = safeName;
      a.target = '';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        try {
          if (a.parentNode) a.parentNode.removeChild(a);
          URL.revokeObjectURL(url);
        } catch (_) { }
      }, 120000);
    }
  }

  // ── [1] 관리자용 PPTX 생성 (manager_report.pptx) ───────────────────────
  async function buildManagerPptxBlob(options = {}) {
    const JSZipLib = options.JSZip || (typeof window !== 'undefined' && window.JSZip) || (typeof JSZip !== 'undefined' ? JSZip : null);
    const ExcelJSLib = options.ExcelJS || (typeof window !== 'undefined' && window.ExcelJS) || (typeof ExcelJS !== 'undefined' ? ExcelJS : null);
    if (!JSZipLib) throw new Error('JSZip 라이브러리가 로드되지 않았습니다.');

    const rawTemplate = await loadTemplateBytes('manager_report.pptx', options.templateLoader);
    const zip = await JSZipLib.loadAsync(rawTemplate);
    const stats = computeReportStats(options);

    const todayStr = (() => {
      const d = new Date();
      const yy = String(d.getFullYear()).slice(-2);
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      return `${yy}. ${mm}. ${dd}.`;
    })();
    const siteLabel = stats.siteName === '전체 현장' ? '전 현장 종합' : stats.siteName;

    // ── Slide 1: 표지 ──
    let s1 = await zip.file('ppt/slides/slide1.xml').async('string');
    const titleSz = stats.coverTitle.length > 16 ? 3600 : 5400;
    s1 = updateShapeTextKeepAttrs(s1, 2, [{ text: stats.coverTitle, sz: titleSz, bold: true, color: COLORS.NAVY }], { algn: 'ctr' });
    s1 = updateShapeTextKeepAttrs(s1, 3, [{ text: `${siteLabel}, 부적합 발생 경향 / 원인 분석`, sz: 2000, bold: false, color: COLORS.NAVY }], { algn: 'ctr' });
    s1 = updateShapeTextKeepAttrs(s1, 8, [{ text: todayStr, sz: 3200, bold: false, color: COLORS.NAVY }], { algn: 'ctr' });
    s1 = updateShapeTextKeepAttrs(s1, 7, [{ text: `${siteLabel} (안전팀)`, sz: 3200, bold: true, color: COLORS.NAVY }], { algn: 'ctr' });
    s1 = updateShapeTextKeepAttrs(s1, 9, [{ text: `작성자 : ${stats.inspector}`, sz: 1350, bold: false, color: COLORS.NAVY }], { algn: 'ctr' });
    s1 = replaceElementBlockById(s1, 9, (blk) =>
      blk.replace(/<a:off x="\d+" y="\d+"\/>/, '<a:off x="9820000" y="168461"/>')
         .replace(/<a:ext cx="\d+" cy="\d+"\/>/, '<a:ext cx="2200000" cy="337175"/>')
    );
    zip.file('ppt/slides/slide1.xml', s1);

    // ── Slide 2: 1. 부적합 발생현황 ──
    let s2 = await zip.file('ppt/slides/slide2.xml').async('string');
    s2 = updateShapeTextKeepAttrs(s2, 20, [
      { text: `${stats.periodSuffix}, 총 `, sz: 2400, bold: true, color: COLORS.NAVY },
      { text: `${fmtNum(stats.total)}건`, sz: 2400, bold: true, color: COLORS.RED },
      { text: '의 부적합 발생', sz: 2400, bold: true, color: COLORS.NAVY },
    ], { algn: 'l' });

    const { 경, 중, 중대, 공지 } = stats.sev;
    const tDen = Math.max(1, stats.total);
    const companyLabel = stats.namedCompanyCount > 0 ? `(${stats.namedCompanyCount}개 협력사)` : '';
    s2 = setShapeParagraphs(s2, 2, [
      {
        runs: [
          { text: `- ${stats.workGroupCount || 1}개 공종${companyLabel}에서 `, sz: 1400, color: COLORS.DARK_TEXT },
          { text: `총 ${fmtNum(stats.total)}건`, sz: 1400, bold: true, color: COLORS.BRIGHT_RED },
          { text: ' 발생', sz: 1400, color: COLORS.DARK_TEXT },
        ],
        spcAft: 300,
      },
      { text: `- 부적합 등급 분포 : 경 ${fmtNum(경)} · 중 ${fmtNum(중)} · 중대 ${fmtNum(중대)} · 공지 ${fmtNum(공지)}`, sz: 1400, spcAft: 200, color: COLORS.DARK_TEXT },
      { text: `  (비율: ${pct(경, tDen)}% : ${pct(중, tDen)}% : ${pct(중대, tDen)}% : ${pct(공지, tDen)}%)`, sz: 1300, bold: true, color: COLORS.NAVY, spcAft: 100 },
    ], { algn: 'l' });

    s2 = updateShapeTextKeepAttrs(s2, 30, [
      { text: `조치 ${fmtNum(stats.fixed)}건 / 미조치 ${fmtNum(stats.unfixed)}건 (조치율 ${stats.fixRate}%)`, sz: 1300, bold: true, color: COLORS.NAVY },
    ], { algn: 'ctr' });

    // 피라미드(그룹 18: 바닥 id=7 -> id=13 -> id=15 -> 꼭대기 id=16)
    s2 = updateShapeTextKeepAttrs(s2, 7, [{ text: `${fmtNum(경)}`, sz: 1600, bold: true, color: 'FFFFFF' }], { algn: 'ctr' });
    s2 = updateShapeTextKeepAttrs(s2, 13, [{ text: `${fmtNum(중)}`, sz: 1500, bold: true, color: 'FFFFFF' }], { algn: 'ctr' });
    s2 = updateShapeTextKeepAttrs(s2, 15, [{ text: `${fmtNum(중대)}`, sz: 1400, bold: true, color: 'FFFFFF' }], { algn: 'ctr' });
    s2 = updateShapeTextKeepAttrs(s2, 16, [{ text: `${fmtNum(공지)}`, sz: 1300, bold: true, color: 'FFFFFF' }], { algn: 'ctr' });

    // 표 20 (회사/현장별 발생현황: R2..R9 = 8행, R10 = 합) — 시인성 확보(10pt) + 카드 내 수납
    const tbl20Updates = {};
    for (let r = 2; r <= 9; r++) {
      const row = stats.companyRows[r - 2];
      tbl20Updates[r] = row
        ? {
            0: { text: row.name, sz: 1000 },
            1: { text: row.progress || '-', sz: 1000 },
            2: { text: fmtNum(row.계), sz: 1020, bold: true },
            3: { text: fmtNum(row.중대), sz: 1000 },
            4: { text: fmtNum(row.중), sz: 1000 },
            5: { text: fmtNum(row.경), sz: 1000 },
            6: { text: row.amount || '-', sz: 950 },
            7: { text: `${pct(row.fixed, row.계)}%`, sz: 950 },
          }
        : { 0: '', 1: '', 2: '', 3: '', 4: '', 5: '', 6: '', 7: '' };
    }
    tbl20Updates[10] = {
      2: { text: fmtNum(stats.total), sz: 1050, bold: true, color: COLORS.NAVY },
      3: { text: fmtNum(중대), sz: 1050, bold: true },
      4: { text: fmtNum(중), sz: 1050, bold: true },
      5: { text: fmtNum(경), sz: 1050, bold: true },
      6: { text: '-', sz: 950 },
      7: { text: `${stats.fixRate}%`, sz: 1000, bold: true },
    };
    s2 = updateTableById(s2, 21, tbl20Updates);
    s2 = compactTableLayout(s2, 21, { marT: 4500, marB: 4500, marL: 6000, marR: 6000, minRowIdx: 2, rowHeight: 225000 });

    // 월별 현황 요약 TextBox 27 (id=28) 및 callout (id=31)
    s2 = setShapeParagraphs(s2, 28, [
      {
        runs: [
          { text: `- 월간 발생현황 : ${stats.maxM.m}월 `, sz: 1400, color: COLORS.DARK_TEXT },
          { text: `${fmtNum(stats.maxM.v)}건`, sz: 1400, bold: true, color: COLORS.BRIGHT_RED },
          { text: ` 최다, ${stats.minM.m}월 `, sz: 1400, color: COLORS.DARK_TEXT },
          { text: `${fmtNum(stats.minM.v)}건`, sz: 1400, bold: true, color: COLORS.BLUE },
          { text: ' 최소 발생', sz: 1400, color: COLORS.DARK_TEXT },
        ],
        spcAft: 300,
      },
      { text: `- 연간/기간 현황 : ${stats.targetYear}년 누적 ${fmtNum(stats.yearTotal)}건 (선택기간 ${fmtNum(stats.total)}건)`, sz: 1400, spcAft: 200, color: COLORS.DARK_TEXT },
      { text: `  · 기간 증감 추이 : ${stats.deltaText}`, sz: 1350, bold: true, color: COLORS.NAVY, spcAft: 100 },
    ], { algn: 'l' });

    s2 = updateShapeTextKeepAttrs(s2, 31, [
      { text: `최다발생 ${stats.maxM.m}월(${stats.maxM.v}건) · 선택기간 조치율 ${stats.fixRate}% (Hold ${stats.holdCount}건)`, sz: 1350, bold: true, color: COLORS.NAVY },
    ], { algn: 'ctr' });

    // 표 23 (월 1~12, 년 누적)
    const tbl23Updates = { 1: {}, 2: {} };
    for (let i = 0; i < 12; i++) {
      tbl23Updates[1][i + 1] = { text: fmtNum(stats.monthlyTotal[i]), sz: 1050 };
      tbl23Updates[2][i + 1] = { text: fmtNum(stats.monthlyCumul[i]), sz: 1050 };
    }
    tbl23Updates[1][13] = { text: fmtNum(stats.total), sz: 1050, bold: true };
    tbl23Updates[2][13] = { text: fmtNum(stats.yearTotal), sz: 1050, bold: true };
    s2 = updateTableById(s2, 24, tbl23Updates);
    s2 = compactTableLayout(s2, 24, { marT: 4500, marB: 4500, marL: 4500, marR: 4500 });
    zip.file('ppt/slides/slide2.xml', s2);

    // 차트 1 XML + 임베딩 Excel 업데이트
    let mgrChart1 = await zip.file('ppt/charts/chart1.xml').async('string');
    mgrChart1 = updateComboChartXml(mgrChart1, {
      labels: stats.monthlyLabels,
      monthlyTotal: stats.monthlyTotal,
      monthlyFixed: stats.monthlyFixed,
      monthlyCumul: stats.monthlyCumul,
    });
    zip.file('ppt/charts/chart1.xml', mgrChart1);
    const mgrSheetRows = [[' ', '월별 발생', '조치 완료', '연간 누적']];
    for (let i = 0; i < 12; i++) {
      mgrSheetRows.push([`${i + 1}월`, stats.monthlyTotal[i], stats.monthlyFixed[i], stats.monthlyCumul[i]]);
    }
    await updateEmbeddedWorkbook(zip, ExcelJSLib, 'ppt/embeddings/Microsoft_Excel_Worksheet.xlsx', mgrSheetRows);

    // ── Slide 3: 2. 부적합 경향분석 ──
    let s3 = await zip.file('ppt/slides/slide3.xml').async('string');
    const t4 = stats.top4Hazards;
    const top4Head = t4.map((h) => `${h.name} ${fmtNum(h.계)}건(${h.pct}%)`).join(', ');
    s3 = updateShapeTextKeepAttrs(s3, 20, [
      { text: `${top4Head} 순으로 발생`, sz: 2100, bold: true, color: COLORS.NAVY },
    ], { algn: 'l' });

    const top4Sum = t4.reduce((s, x) => s + x.계, 0);
    const top1 = t4[0] || { name: '-', 계: 0, pct: 0, topAgents: [], topTrades: [] };
    const top2 = t4[1] || { name: '-', 계: 0, pct: 0 };
    const lowNonZero = stats.nonZeroRanked[stats.nonZeroRanked.length - 1];
    // id=7 TextBox 6은 id=27(y=2564752) 위쪽 영역만 사용해 절대 겹치지 않도록 2줄 고정
    s3 = setShapeParagraphs(s3, 7, [
      { text: `- 발생유형 TOP 4 : ${t4.map((x) => x.name).join('·')} (전체 ${pct(top4Sum, tDen)}%)`, sz: 1350, bold: true, color: COLORS.NAVY, spcAft: 140 },
      { text: `- 최다: ${top1.name} ${fmtNum(top1.계)}건(${top1.pct}%) / 최소: ${lowNonZero ? `${lowNonZero.name} ${lowNonZero.계}건` : '없음'}`, sz: 1350, color: COLORS.DARK_TEXT, spcAft: 0 },
    ], { algn: 'l', tIns: 45000, bIns: 45000 });

    const top1AgStr = (top1.topAgents || []).filter((a) => isMeaningfulValue(a.name)).slice(0, 2).map((a) => `${toCompletePhrase(a.name, 7)}(${a.count})`).join(', ') || '-';
    const top1TrStr = (top1.topTrades || []).filter((t) => isMeaningfulValue(t.name)).slice(0, 1).map((t) => toCompletePhrase(t.name, 8)).join(', ') || '-';
    s3 = updateShapeTextKeepAttrs(s3, 27, [
      { text: `핵심 기인물(${top1.name}): ${top1AgStr} | 공종: ${top1TrStr}`, sz: 1200, bold: true, color: COLORS.NAVY },
    ], { algn: 'ctr' });
    s3 = updateShapeTextKeepAttrs(s3, 29, [
      { text: `TOP 2(${top1.name}·${top2.name}) 비중: ${pct(top1.계 + top2.계, tDen)}% (${top1.계 + top2.계}/${stats.total}건)`, sz: 1200, bold: true, color: COLORS.NAVY },
    ], { algn: 'ctr' });

    // 표 2 (유형 8행 + 합) — 100.0% 1줄 유지 및 시인성 확대
    const tbl2Updates = {};
    HAZARD_TYPES.forEach((hName, i) => {
      const h = stats.hazardStats[hName] || { 계: 0, 중대: 0, 중: 0, 경: 0 };
      const rIdx = i + 2;
      tbl2Updates[rIdx] = {
        0: { text: hName, sz: 1050, bold: h.계 > 0 },
        2: { text: fmtNum(h.계), sz: 1050, bold: h.계 > 0 },
        3: { text: fmtNum(h.중대), sz: 1000 },
        4: { text: fmtNum(h.중), sz: 1000 },
        5: { text: fmtNum(h.경), sz: 1000 },
        6: { text: `${pct1(h.계, stats.total)}%`, sz: 980 },
        7: { text: h.계 === top1.계 && h.계 > 0 ? '최다' : '', sz: 1000, color: COLORS.RED, bold: true },
      };
    });
    const etcCnt = (stats.hazardStats['기타'] && stats.hazardStats['기타'].계) || 0;
    tbl2Updates[10] = {
      2: { text: fmtNum(stats.total), sz: 1050, bold: true, color: COLORS.NAVY },
      3: { text: fmtNum(중대), sz: 1050, bold: true },
      4: { text: fmtNum(중), sz: 1050, bold: true },
      5: { text: fmtNum(경), sz: 1050, bold: true },
      6: { text: '100%', sz: 1000, bold: true },
      7: { text: etcCnt > 0 ? `기타 ${etcCnt}` : '-', sz: 980 },
    };
    s3 = updateTableById(s3, 3, tbl2Updates);
    s3 = compactTableLayout(s3, 3, { marT: 4500, marB: 4500, marL: 6000, marR: 6000, minRowIdx: 2, rowHeight: 220000 });

    // 4대 유형 Treemap 매핑 — 타이틀 1줄 고정 및 시인성 확대
    const treemapSlots = [
      { titleId: 18, chartEx: 'ppt/charts/chartEx1.xml', sheet: 'ppt/embeddings/Microsoft_Excel_Worksheet1.xlsx', img: 'ppt/media/image1.png', color: '#1D4ED8' },
      { titleId: 19, chartEx: 'ppt/charts/chartEx2.xml', sheet: 'ppt/embeddings/Microsoft_Excel_Worksheet2.xlsx', img: 'ppt/media/image2.png', color: '#D97706' },
      { titleId: 25, chartEx: 'ppt/charts/chartEx3.xml', sheet: 'ppt/embeddings/Microsoft_Excel_Worksheet3.xlsx', img: 'ppt/media/image3.png', color: '#059669' },
      { titleId: 24, chartEx: 'ppt/charts/chartEx4.xml', sheet: 'ppt/embeddings/Microsoft_Excel_Worksheet4.xlsx', img: 'ppt/media/image4.png', color: '#4F46E5' },
    ];
    for (let i = 0; i < treemapSlots.length; i++) {
      const slot = treemapSlots[i];
      const haz = t4[i] || { name: HAZARD_TYPES[i], leaves: [], topAgents: [] };
      const agLine = (haz.topAgents || []).filter((a) => isMeaningfulValue(a.name)).slice(0, 2).map((a) => toCompletePhrase(a.name, 7)).join(' · ') || '기인물 없음';
      s3 = updateShapeTextKeepAttrs(s3, slot.titleId, [
        { text: ` ${haz.name} : ${agLine}`, sz: 1150, bold: true, color: COLORS.NAVY },
      ], { algn: 'l' });

      const cexXml = await zip.file(slot.chartEx).async('string');
      zip.file(slot.chartEx, updateTreemapChartExXml(cexXml, haz.name, haz.leaves));

      const leafRows = [[null, null, null, '건수']];
      const cleanLeaves = (haz.leaves && haz.leaves.length ? haz.leaves : [{ mid: haz.name, minor: '데이터 없음', count: 1 }]).slice(0, 12);
      cleanLeaves.forEach((lf) => leafRows.push([haz.name, lf.mid, lf.minor, Math.max(1, Number(lf.count) || 1)]));
      await updateEmbeddedWorkbook(zip, ExcelJSLib, slot.sheet, leafRows);

      const pngB64 = renderTreemapPngBase64(haz.name, haz.leaves, slot.color);
      if (pngB64) zip.file(slot.img, pngB64, { base64: true });
    }
    zip.file('ppt/slides/slide3.xml', s3);

    // ── Slide 4: 3. 부적합 원인분석 (불안전 상태 vs 불안전 행동) ──
    let s4 = await zip.file('ppt/slides/slide4.xml').async('string');
    const dominoSum = Math.max(1, stats.condCount + stats.actCount);
    s4 = updateShapeTextKeepAttrs(s4, 8, [
      { text: '사고발생 도미노 중, 불안전 상태 ', sz: 2200, bold: true, color: COLORS.NAVY },
      { text: `${fmtNum(stats.condCount)}건(${pct(stats.condCount, dominoSum)}%)`, sz: 2200, bold: true, color: COLORS.RED },
      { text: ', 불안전 행동 ', sz: 2200, bold: true, color: COLORS.NAVY },
      { text: `${fmtNum(stats.actCount)}건(${pct(stats.actCount, dominoSum)}%)`, sz: 2200, bold: true, color: COLORS.BLUE },
    ], { algn: 'l' });

    const s4IdStart = getNextShapeId(s4);
    const makeDominoParas = (title, items, samples, actionTips, accentColor) => {
      const ps = [{ text: title, sz: 1550, bold: true, color: accentColor, spcAft: 260 }];
      const cleanItems = (items || []).filter((it) => isMeaningfulValue(it.name)).slice(0, 4);
      if (cleanItems.length) {
        cleanItems.forEach((it, idx) => {
          ps.push({
            runs: [
              { text: `${idx + 1}. ${toCompletePhrase(it.name, 16)} : `, sz: 1350, bold: true, color: COLORS.NAVY },
              { text: `${fmtNum(it.count)}건 (${pct(it.count, tDen)}%)`, sz: 1350, bold: true, color: accentColor },
            ],
            spcAft: 220,
          });
        });
      } else {
        ps.push({ text: '• 해당 기간 세부 항목 없음', sz: 1300, color: COLORS.MUTED_TEXT, spcAft: 220 });
      }
      ps.push({ text: '── 대표 현장 사례 ──', sz: 1300, bold: true, color: COLORS.MUTED_TEXT, spcAft: 160 });
      (samples.length ? samples : ['등록된 대표 지적사례 없음']).slice(0, 4).forEach((sm) => {
        ps.push({ text: `· ${toCompletePhrase(sm, 26)}`, sz: 1250, color: COLORS.DARK_TEXT, spcAft: 150 });
      });
      ps.push({ text: '── 핵심 개선 대책 ──', sz: 1300, bold: true, color: accentColor, spcAft: 150 });
      actionTips.forEach((tip) => {
        ps.push({ text: `• ${tip}`, sz: 1250, bold: true, color: COLORS.NAVY, spcAft: 140 });
      });
      return ps;
    };

    const s4CondTips = [
      '가시설·방호장치 설치 완료 후 작업 허가(PTW) 승인 철저',
      '작업 전 일상점검으로 불안전 시설 즉시 보완 후 작업착수',
    ];
    const s4ActTips = [
      '작업 시작 전 10분 TBM으로 핵심 안전수칙·보호구 착용 교육',
      '고위험 공종 관리감독자 상주 및 불안전 행동 즉시 시정',
    ];

    const s4Left = createTextBoxXml(
      s4IdStart, '불안전상태_내역',
      { x: 400000, y: 2050000, w: 5470000, h: 4450000 },
      makeDominoParas(`물적·시설 요인 (총 ${fmtNum(stats.condCount)}건, ${pct(stats.condCount, dominoSum)}%)`, stats.condList, stats.condSamples, s4CondTips, COLORS.RED),
      { algn: 'l', lIns: 110000, rIns: 110000, tIns: 100000, lnSpc: 112000 },
      { fill: 'FFFFFF', border: 'BFDBFE', round: true }
    );
    const s4Right = createTextBoxXml(
      s4IdStart + 1, '불안전행동_내역',
      { x: 6260000, y: 2050000, w: 5470000, h: 4450000 },
      makeDominoParas(`인적·행동 요인 (총 ${fmtNum(stats.actCount)}건, ${pct(stats.actCount, dominoSum)}%)`, stats.actList, stats.actSamples, s4ActTips, COLORS.BLUE),
      { algn: 'l', lIns: 110000, rIns: 110000, tIns: 100000, lnSpc: 112000 },
      { fill: 'FFFFFF', border: 'BFDBFE', round: true }
    );
    s4 = insertIntoSpTree(s4, s4Left + s4Right);
    zip.file('ppt/slides/slide4.xml', s4);

    // ── Slide 5: 3. 부적합 원인분석 (안전관리 Process PDCA) ──
    let s5 = await zip.file('ppt/slides/slide5.xml').async('string');
    const pN = stats.pdca.PLAN.length;
    const dN = stats.pdca.DO.length;
    const cN = stats.pdca.CHECK.length;
    const aN = stats.pdca.ACTION.length;
    const pdcaDen = Math.max(1, pN + dN + cN + aN);
    s5 = updateShapeTextKeepAttrs(s5, 8, [
      {
        text: `안전관리 Process 중, Plan ${pN}건(${pct(pN, pdcaDen)}%), Do ${dN}건(${pct(dN, pdcaDen)}%), Check ${cN}건(${pct(cN, pdcaDen)}%), Action ${aN}건(${pct(aN, pdcaDen)}%) 발생`,
        sz: 1850, bold: true, color: COLORS.NAVY,
      },
    ], { algn: 'l' });

    const pdcaActionMap = {
      PLAN: ['고위험 작업계획서 사전 승인 강화', '공종별 위험성평가 변경 즉시 반영'],
      DO: ['TBM 연계 안전시설 선설치 확인', '표준 작업방법·보호구 착용 이행'],
      CHECK: ['관리감독자 Hold Point 실효성 점검', '형식적 체크리스트 배제·현장 확인'],
      ACTION: ['지적사항 48시간 이내 완결 추적', '우수·미흡 협력사 인센티브/코칭'],
    };

    const buildPdcaParas = (phaseKey, label) => {
      const list = stats.pdca[phaseKey] || [];
      const topR = topEntries(stats.pdcaReasonMap[phaseKey] || {}, 4).filter((r) => isMeaningfulValue(r.name));
      const ps = [
        {
          runs: [
            { text: `${label} `, sz: 1450, bold: true, color: COLORS.NAVY },
            { text: `${fmtNum(list.length)}건 (${pct(list.length, pdcaDen)}%)`, sz: 1450, bold: true, color: COLORS.RED },
          ],
          spcAft: 240,
        },
      ];
      if (topR.length) {
        topR.forEach((r) => {
          ps.push({ text: `- ${toCompletePhrase(r.name, 16)} (${r.count}건)`, sz: 1200, bold: true, color: COLORS.DARK_TEXT, spcAft: 160 });
        });
      } else {
        ps.push({ text: '- 해당 단계 특이사항 없음', sz: 1200, color: COLORS.MUTED_TEXT, spcAft: 160 });
      }
      const seenSamples = new Set();
      const cleanSamples = [];
      for (const rec of list) {
        if (!isMeaningfulValue(rec && rec.content)) continue;
        const txt = toCompletePhrase(rec.content, 20);
        if (txt && !seenSamples.has(txt)) {
          seenSamples.add(txt);
          cleanSamples.push(txt);
          if (cleanSamples.length >= 4) break;
        }
      }
      if (cleanSamples.length) {
        ps.push({ text: '── 주요 지적 사례 ──', sz: 1180, bold: true, color: COLORS.MUTED_TEXT, spcAft: 130 });
        cleanSamples.forEach((txt) => {
          ps.push({ text: `· ${txt}`, sz: 1120, color: COLORS.DARK_TEXT, spcAft: 130 });
        });
      }
      ps.push({ text: '── 단계별 개선방향 ──', sz: 1180, bold: true, color: COLORS.BLUE, spcAft: 120 });
      (pdcaActionMap[phaseKey] || []).forEach((act) => {
        ps.push({ text: `• ${act}`, sz: 1120, bold: true, color: COLORS.NAVY, spcAft: 120 });
      });
      return ps;
    };

    const pdcaCardStyle = { algn: 'l', lIns: 75000, rIns: 75000, tIns: 85000, lnSpc: 112000 };
    // PLAN 기존 id=24를 카드 크기에 맞게 확장하고 DO/CHECK/ACTION 카드 삽입
    s5 = setShapeParagraphs(s5, 24, buildPdcaParas('PLAN', '계획단계'), pdcaCardStyle);
    s5 = replaceElementBlockById(s5, 24, (blk) =>
      blk.replace(/<a:off x="\d+" y="\d+"\/>/, '<a:off x="340000" y="2070000"/>')
         .replace(/<a:ext cx="\d+" cy="\d+"\/>/, '<a:ext cx="2670000" cy="4420000"/>')
         .replace('<a:noFill/>', '<a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:ln w="12700"><a:solidFill><a:srgbClr val="DBEAFE"/></a:solidFill></a:ln>')
    );
    const s5IdStart = getNextShapeId(s5);
    const pdcaBoxes = [
      createTextBoxXml(s5IdStart, 'DO_내용', { x: 3250000, y: 2070000, w: 2670000, h: 4420000 }, buildPdcaParas('DO', '실행단계'), pdcaCardStyle, { fill: 'FFFFFF', border: 'DBEAFE', round: true }),
      createTextBoxXml(s5IdStart + 1, 'CHECK_내용', { x: 6160000, y: 2070000, w: 2670000, h: 4420000 }, buildPdcaParas('CHECK', '확인단계'), pdcaCardStyle, { fill: 'FFFFFF', border: 'DBEAFE', round: true }),
      createTextBoxXml(s5IdStart + 2, 'ACTION_내용', { x: 9070000, y: 2070000, w: 2670000, h: 4420000 }, buildPdcaParas('ACTION', '조치단계'), pdcaCardStyle, { fill: 'FFFFFF', border: 'DBEAFE', round: true }),
    ].join('');
    s5 = insertIntoSpTree(s5, pdcaBoxes);
    zip.file('ppt/slides/slide5.xml', s5);

    // ── Slide 6: 4. 사고와 상관관계 (시인성 확대 및 공란 최소화 밸런스 배치) ──
    let s6 = await zip.file('ppt/slides/slide6.xml').async('string');
    const hiPct = pct(stats.hiRiskCount, tDen);
    s6 = updateShapeTextKeepAttrs(s6, 20, [
      { text: `중대·중부적합(${fmtNum(stats.hiRiskCount)}건, ${hiPct}%) 및 ${top1.name}·${top2.name} 중심의 선제적 중대재해 예방관리 필요`, sz: 2100, bold: true, color: COLORS.NAVY },
    ], { algn: 'l' });

    const top3Haz = t4[2] || { name: '-', pct: 0 };
    const tradeCountMap = {};
    const locCountMap = {};
    stats.records.forEach((r) => {
      if (isMeaningfulValue(r.workGroup || r.workName)) incMap(tradeCountMap, toCompletePhrase(r.workGroup || r.workName, 10));
      if (isMeaningfulValue(r.locationDetail || r.location)) incMap(locCountMap, toCompletePhrase(r.locationDetail || r.location, 10));
    });
    const topTradesAll = topEntries(tradeCountMap, 2).map((x) => `${x.name}(${x.count}건)`).join(', ') || '공종 전반';
    const topLocsAll = topEntries(locCountMap, 2).map((x) => `${x.name}(${x.count}건)`).join(', ') || '현장 전 구간';
    const weakPdca = [
      { k: 'Plan(계획)', v: pN },
      { k: 'Do(실행)', v: dN },
      { k: 'Check(확인)', v: cN },
      { k: 'Action(조치)', v: aN },
    ].sort((a, b) => b.v - a.v)[0];
    const leadAgentName = (top1.topAgents && top1.topAgents[0] && toCompletePhrase(top1.topAgents[0].name, 8)) || '핵심 기인물';

    const s6IdStart = getNextShapeId(s6);
    const accidentParas = [
      { text: '하인리히 법칙(1:29:300) 기반 잠재사고 위험도', sz: 1550, bold: true, color: COLORS.NAVY, spcAft: 240 },
      { text: `• 고위험 부적합(중대+중): ${fmtNum(stats.hiRiskCount)}건 (${hiPct}%)`, sz: 1400, bold: true, color: COLORS.RED, spcAft: 200 },
      { text: `• 원인 비중: 불안전 상태 ${fmtNum(stats.condCount)}건(${pct(stats.condCount, dominoSum)}%) · 행동 ${fmtNum(stats.actCount)}건(${pct(stats.actCount, dominoSum)}%)`, sz: 1300, color: COLORS.DARK_TEXT, spcAft: 190 },
      { text: `• 1순위 위험: ${top1.name} (${top1.pct}%) — 주요 기인물 ${toCompletePhrase(top1AgStr, 18)}`, sz: 1300, color: COLORS.DARK_TEXT, spcAft: 190 },
      { text: `• 2·3순위 위험: ${top2.name}(${top2.pct}%), ${top3Haz.name}(${top3Haz.pct}%) — 연쇄 재해 전이 주의`, sz: 1300, color: COLORS.DARK_TEXT, spcAft: 240 },
      { text: '── 다빈도 공종·구간 연계 위험 ──', sz: 1350, bold: true, color: COLORS.MUTED_TEXT, spcAft: 160 },
      { text: `· 집중 공종: ${topTradesAll} 작업 전 PTW·안전고리 결속 필수`, sz: 1280, color: COLORS.DARK_TEXT, spcAft: 160 },
      { text: `· 다발 장소: ${topLocsAll} 중심 합동 패트롤 강화`, sz: 1280, color: COLORS.DARK_TEXT, spcAft: 160 },
      { text: `· Hold Point 위반 ${fmtNum(stats.holdCount)}건 발생 → 즉시 작업중지 후 보완`, sz: 1280, bold: true, color: COLORS.NAVY, spcAft: 120 },
    ];
    const nonconfParas = [
      { text: '선택기간 부적합 발생·조치 상관지표', sz: 1550, bold: true, color: COLORS.NAVY, spcAft: 240 },
      { text: `• 기간 총 발생: ${fmtNum(stats.total)}건 (조치 ${fmtNum(stats.fixed)}건 / 미조치 ${fmtNum(stats.unfixed)}건)`, sz: 1400, bold: true, color: COLORS.BLUE, spcAft: 200 },
      { text: `• 조치 이행률: ${stats.fixRate}% (${stats.fixRate >= 80 ? '양호 수준 유지' : '조기 종결 집중 독려 필요'})`, sz: 1300, bold: true, color: stats.fixRate >= 80 ? COLORS.GREEN : COLORS.RED, spcAft: 190 },
      { text: `• PDCA 취약단계: ${weakPdca.k} ${fmtNum(weakPdca.v)}건 최다 (${pN}/${dN}/${cN}/${aN}건)`, sz: 1300, color: COLORS.DARK_TEXT, spcAft: 190 },
      { text: `• 연간 추이: 최다 ${stats.maxM.m}월(${fmtNum(stats.maxM.v)}건) / 최소 ${stats.minM.m}월(${fmtNum(stats.minM.v)}건)`, sz: 1300, color: COLORS.DARK_TEXT, spcAft: 240 },
      { text: '── 경영·현장 피드백 제언 ──', sz: 1350, bold: true, color: COLORS.MUTED_TEXT, spcAft: 160 },
      { text: `· 전기 대비 변화: ${stats.deltaText}`, sz: 1280, color: COLORS.DARK_TEXT, spcAft: 160 },
      { text: `· 대표 기인물(${leadAgentName}) 작업 개시 전 10분 TBM 필수 전파`, sz: 1280, color: COLORS.DARK_TEXT, spcAft: 160 },
      { text: `· 미조치 ${fmtNum(stats.unfixed)}건 48시간 이내 해소 시 동종 재해예방 효과 극대화`, sz: 1280, bold: true, color: COLORS.NAVY, spcAft: 120 },
    ];
    s6 = insertIntoSpTree(
      s6,
      createTextBoxXml(s6IdStart, '사고_상관관계_카드', { x: 400000, y: 2050000, w: 5470000, h: 4450000 }, accidentParas, { algn: 'l', lIns: 110000, rIns: 110000, tIns: 100000, lnSpc: 114000 }, { fill: 'FFFFFF', border: 'BFDBFE', round: true }) +
      createTextBoxXml(s6IdStart + 1, '부적합_상관관계_카드', { x: 6260000, y: 2050000, w: 5470000, h: 4450000 }, nonconfParas, { algn: 'l', lIns: 110000, rIns: 110000, tIns: 100000, lnSpc: 114000 }, { fill: 'FFFFFF', border: 'BFDBFE', round: true })
    );
    zip.file('ppt/slides/slide6.xml', s6);

    // ── Slide 7: 5. 안전관리 의사결정 (안전점검 테마선정, 표 16) ──
    let s7 = await zip.file('ppt/slides/slide7.xml').async('string');
    const tbl16Updates = {};
    stats.themeRows.forEach((tr, idx) => {
      const rIdx = idx + 2; // R2..R13
      const rowUpdate = {
        1: { text: toCompletePhrase(tr.agent, 9) || '-', sz: 1020 },
        2: { text: toCompletePhrase(tr.workName, 18) || '-', sz: 1000, algn: 'l' },
        3: { text: toCompletePhrase(tr.trade, 9) || '-', sz: 1000 },
        4: { text: toCompletePhrase(tr.location, 9) || '-', sz: 1000 },
        5: { text: toCompletePhrase(tr.team, 9) || '-', sz: 1000 },
        6: { text: tr.note, sz: 950 },
      };
      if (idx % 3 === 0) {
        const spaced = tr.type.length === 2 ? `${tr.type[0]} ${tr.type[1]}` : tr.type;
        rowUpdate[0] = { text: spaced, sz: 1350, bold: true, color: COLORS.NAVY };
      }
      tbl16Updates[rIdx] = rowUpdate;
    });
    s7 = updateTableById(s7, 17, tbl16Updates);
    s7 = compactTableLayout(s7, 17, { marT: 4500, marB: 4500, marL: 6500, marR: 6500, minRowIdx: 2, rowHeight: 320000 });
    zip.file('ppt/slides/slide7.xml', s7);

    // ── Slide 8: 5. 안전관리 의사결정 (부적합 발생 감소대책 3E, 표 7) ──
    let s8 = await zip.file('ppt/slides/slide8.xml').async('string');
    const eRows = build3ERows(stats);
    const tbl7Updates = {};
    for (let r = 2; r <= 12; r++) {
      const item = eRows[r];
      if (!item) continue;
      tbl7Updates[r] = {
        2: { text: item.content, sz: 1050, algn: 'l' },
        3: { text: item.target, sz: 1020 },
        4: { text: item.owner, sz: 1020 },
        5: { text: item.schedule, sz: 1020 },
        6: { text: item.note, sz: 1020 },
      };
    }
    s8 = updateTableById(s8, 8, tbl7Updates);
    s8 = compactTableLayout(s8, 8, { marT: 5000, marB: 5000, marL: 7000, marR: 7000, minRowIdx: 2, rowHeight: 340000 });
    zip.file('ppt/slides/slide8.xml', s8);

    const outBuf = await zip.generateAsync({
      type: 'blob',
      compression: 'DEFLATE',
      compressionOptions: { level: 1 }
    });
    const mimeBlob = new Blob([outBuf], {
      type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    });
    const safePeriod = (stats.periodInfo.label || stats.month || stats.periodSuffix || '전체').replace(/[\s~:/\\']+/g, '_');
    const safeSite = siteLabel.replace(/[\s~:/\\]+/g, '_');
    const filename = `관리자용_부적합보고서_${safePeriod}_${safeSite}.pptx`;
    triggerDownloadIfRequested(mimeBlob, filename, options.download);
    return { blob: mimeBlob, filename, stats };
  }

  // ── [2] 근로자용 PPTX 생성 (worker_tbm.pptx - Today's TBM Letter) ──────
  async function buildWorkerPptxBlob(options = {}) {
    const JSZipLib = options.JSZip || (typeof window !== 'undefined' && window.JSZip) || (typeof JSZip !== 'undefined' ? JSZip : null);
    const ExcelJSLib = options.ExcelJS || (typeof window !== 'undefined' && window.ExcelJS) || (typeof ExcelJS !== 'undefined' ? ExcelJS : null);
    if (!JSZipLib) throw new Error('JSZip 라이브러리가 로드되지 않았습니다.');

    const rawTemplate = await loadTemplateBytes('worker_tbm.pptx', options.templateLoader);
    const zip = await JSZipLib.loadAsync(rawTemplate);
    const stats = computeReportStats(options);
    const wContent = buildWorkerTbmContent(stats);
    const siteLabel = stats.siteName === '전체 현장' ? '전 현장' : stats.siteName;

    let s1 = await zip.file('ppt/slides/slide1.xml').async('string');
    let rels1 = await zip.file('ppt/slides/_rels/slide1.xml.rels').async('string');
    let ctXml = await zip.file('[Content_Types].xml').async('string');

    // 제목 + 기간 배지
    s1 = updateShapeTextKeepAttrs(s1, 6, [
      { text: 'Today’s TBM Letter ', sz: 2200, bold: true, color: COLORS.NAVY },
      { text: `(${stats.periodSuffix} · ${siteLabel})`, sz: 1150, bold: true, color: COLORS.BLUE },
    ], { algn: 'l' });

    // 발생 건수 및 전기 대비 증감 배지 (id=31)
    let badgeText = `총 ${fmtNum(stats.total)}건 발생(미조치 ${fmtNum(stats.unfixed)}건)`;
    if (stats.hasPriorDelta) {
      const dir = stats.priorDelta > 0 ? '증가' : (stats.priorDelta < 0 ? '감소' : '동일');
      badgeText = stats.priorDelta === 0
        ? `총 ${fmtNum(stats.total)}건 발생(전기 동일)`
        : `총 ${fmtNum(stats.total)}건 발생(${fmtNum(Math.abs(stats.priorDelta))}건 ${dir})`;
    }
    s1 = updateShapeTextKeepAttrs(s1, 31, [
      { text: badgeText, sz: 1200, bold: true, color: 'FFFFFF' },
    ], { algn: 'ctr' });

    // Top 3 유형 배지 (id=50, 51, 52), 가로 막대차트 1~3, 요약카드 (id=17, 18, 22)
    const pillIds = [50, 51, 52];
    const summaryIds = [17, 18, 22];
    const chartMeta = [
      { chart: 'ppt/charts/chart1.xml', sheet: 'ppt/embeddings/Microsoft_Excel_Worksheet.xlsx' },
      { chart: 'ppt/charts/chart2.xml', sheet: 'ppt/embeddings/Microsoft_Excel_Worksheet1.xlsx' },
      { chart: 'ppt/charts/chart3.xml', sheet: 'ppt/embeddings/Microsoft_Excel_Worksheet2.xlsx' },
    ];
    for (let i = 0; i < 3; i++) {
      const haz = stats.top3Hazards[i] || { name: HAZARD_TYPES[i], 계: 0, pct: 0, topAgents: [], topTrades: [] };
      s1 = updateShapeTextKeepAttrs(s1, pillIds[i], [{ text: haz.name, sz: 1200, bold: true, color: COLORS.NAVY }], { algn: 'ctr' });

      const cleanAgents = (haz.topAgents || []).filter((a) => isMeaningfulValue(a.name));
      const agents = cleanAgents.length
        ? cleanAgents.map((a) => ({ label: toCompletePhrase(a.name, 7), count: a.count }))
        : [{ label: '주요요인 없음', count: 0 }];

      const chXml = await zip.file(chartMeta[i].chart).async('string');
      zip.file(chartMeta[i].chart, updateHorizontalBarChartXml(chXml, agents));
      const wsRows = [[' ', '발생건수'], ...agents.map((a) => [a.label, a.count])];
      await updateEmbeddedWorkbook(zip, ExcelJSLib, chartMeta[i].sheet, wsRows);

      const repAgents = cleanAgents.slice(0, 2).map((a) => toCompletePhrase(a.name, 7)).join(', ') || '주요요인 없음';
      s1 = updateShapeTextKeepAttrs(s1, summaryIds[i], [
        { text: `${['①', '②', '③'][i]} `, sz: 1350, bold: true, color: COLORS.BRIGHT_RED },
        { text: `[${haz.name}] `, sz: 1300, bold: true, color: COLORS.NAVY },
        { text: `${fmtNum(haz.계)}건(${haz.pct}%) · 기인물: ${repAgents}`, sz: 1200, color: COLORS.DARK_TEXT },
      ], { algn: 'l' });
    }

    // 반드시 지켜야 할 안전Point 3개 (id=28, 38, 39) — 구체적 안전행동 수칙 + 시인성 확대
    const ptIds = [28, 38, 39];
    wContent.safetyPoints.forEach((pt, i) => {
      const paras = [
        { text: pt.title, sz: 1200, bold: true, color: COLORS.NAVY, spcAft: 110 },
        ...pt.bullets.map((b) => ({ text: `• ${b}`, sz: 1050, color: COLORS.DARK_TEXT, spcAft: 85 })),
      ];
      s1 = setShapeParagraphs(s1, ptIds[i], paras, {
        algn: 'l',
        lIns: 50000,
        rIns: 50000,
        tIns: 45000,
        bIns: 40000,
        lnSpc: 112000,
      });
    });

    // 사고/아차사고 사례 2개 (id=42, id=48) + 실사 사진 임베딩
    const caseIds = [42, 48];
    const photoBoxes = [
      { x: 6320000, y: 1770000, w: 2600000, h: 1250000 },
      { x: 9245000, y: 1770000, w: 2600000, h: 1250000 },
    ];
    for (let i = 0; i < 2; i++) {
      const c = wContent.cases[i];
      s1 = setShapeParagraphs(s1, caseIds[i], [
        { text: c.title, sz: 1200, bold: true, color: COLORS.RED, spcAft: 45 },
        { text: c.detail, sz: 1050, bold: true, color: COLORS.NAVY, spcAft: 40 },
        { text: c.measure, sz: 1020, color: COLORS.DARK_TEXT, spcAft: 30 },
      ], {
        algn: 'l',
        lIns: 55000,
        rIns: 55000,
        tIns: 40000,
        bIns: 30000,
        lnSpc: 108000,
      });

      if (c.photoPath && options.loadPhotoBase64) {
        try {
          const rawB64 = await options.loadPhotoBase64(c.photoPath);
          const parsed = stripBase64Header(rawB64);
          if (parsed) {
            const res = appendSlidePic(s1, rels1, zip, ctXml, `tbm_case_${i + 1}`, parsed, photoBoxes[i], `사례사진_${i + 1}`);
            s1 = res.slideXml;
            rels1 = res.relsXml;
            ctXml = res.ctXml;
          }
        } catch (_) { }
      }
    }

    // 근로자 위험성 평가 표 76 (id=77, R1..R3) — 시인성 확대
    const tbl76Updates = {};
    wContent.riskRows.forEach((cols, idx) => {
      tbl76Updates[idx + 1] = {
        0: { text: cols[0], sz: 1080, bold: true, color: COLORS.NAVY },
        1: { text: cols[1], sz: 1050, algn: 'l' },
        2: { text: cols[2], sz: 1050, algn: 'l' },
      };
    });
    s1 = updateTableById(s1, 77, tbl76Updates);
    s1 = compactTableLayout(s1, 77, { marT: 7000, marB: 7000, marL: 8000, marR: 8000 });

    zip.file('ppt/slides/slide1.xml', s1);
    zip.file('ppt/slides/_rels/slide1.xml.rels', rels1);
    zip.file('[Content_Types].xml', ctXml);

    const outBuf = await zip.generateAsync({
      type: 'blob',
      compression: 'DEFLATE',
      compressionOptions: { level: 1 }
    });
    const mimeBlob = new Blob([outBuf], {
      type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    });
    const safePeriod = (stats.periodInfo.label || stats.month || stats.periodSuffix || '전체').replace(/[\s~:/\\']+/g, '_');
    const safeSite = siteLabel.replace(/[\s~:/\\]+/g, '_');
    const filename = `근로자용_TBM레터_${safePeriod}_${safeSite}.pptx`;
    triggerDownloadIfRequested(mimeBlob, filename, options.download);
    return { blob: mimeBlob, filename, stats };
  }

  // ── [3] 부적합장표 R1 네이티브 OOXML 생성 (sheet_major_r1.pptx / sheet_minor_r1.pptx) ──
  function decodeBase64ToBytes(b64, maxBytes = 131072) {
    const clean = String(b64 || '').replace(/\s+/g, '');
    const sliceLen = Math.min(clean.length, Math.ceil(maxBytes / 3) * 4);
    const sub = clean.slice(0, sliceLen);
    if (typeof Buffer !== 'undefined') {
      return Uint8Array.from(Buffer.from(sub, 'base64'));
    }
    if (typeof atob === 'function') {
      const bin = atob(sub);
      const out = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
      return out;
    }
    return null;
  }

  function getImageDimensionsFromBase64(ext, base64) {
    try {
      const bytes = decodeBase64ToBytes(base64, 131072);
      if (!bytes || bytes.length < 24) return null;
      // PNG: 89 50 4E 47 ... IHDR width@16, height@20
      if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) {
        const w = (bytes[16] << 24) | (bytes[17] << 16) | (bytes[18] << 8) | bytes[19];
        const h = (bytes[20] << 24) | (bytes[21] << 16) | (bytes[22] << 8) | bytes[23];
        if (w > 0 && h > 0) return { w: w >>> 0, h: h >>> 0 };
      }
      // JPEG: FF D8 ... SOF0..SOF15
      if (bytes[0] === 0xFF && bytes[1] === 0xD8) {
        let i = 2;
        while (i + 9 < bytes.length) {
          if (bytes[i] !== 0xFF) { i++; continue; }
          while (i < bytes.length && bytes[i] === 0xFF) i++;
          if (i >= bytes.length) break;
          const marker = bytes[i++];
          if (marker === 0xD9 || marker === 0xDA) break;
          if (marker === 0x01 || (marker >= 0xD0 && marker <= 0xD7)) continue;
          if (i + 2 > bytes.length) break;
          const segLen = (bytes[i] << 8) | bytes[i + 1];
          const isSof = (marker >= 0xC0 && marker <= 0xC3)
            || (marker >= 0xC5 && marker <= 0xC7)
            || (marker >= 0xC9 && marker <= 0xCB)
            || (marker >= 0xCD && marker <= 0xCF);
          if (isSof && i + 7 < bytes.length) {
            const h = (bytes[i + 3] << 8) | bytes[i + 4];
            const w = (bytes[i + 5] << 8) | bytes[i + 6];
            if (w > 0 && h > 0) return { w, h };
          }
          if (segLen < 2) break;
          i += segLen;
        }
      }
    } catch (_) { }
    return null;
  }

  function fitBoxContain(box, dims) {
    if (!dims || !dims.w || !dims.h) return box;
    const imgRatio = dims.w / dims.h;
    const boxRatio = box.w / box.h;
    let w = box.w;
    let h = box.h;
    if (imgRatio > boxRatio) {
      h = Math.round(box.w / imgRatio);
    } else {
      w = Math.round(box.h * imgRatio);
    }
    const x = Math.round(box.x + (box.w - w) / 2);
    const y = Math.round(box.y + (box.h - h) / 2);
    return { x, y, w, h };
  }

  function estimateVisualWidthUnits(text) {
    let units = 0;
    for (const ch of String(text || '')) {
      if (/[가-힣ㄱ-ㅎㅏ-ㅣ\u3000-\u9FFF]/.test(ch)) units += 1.05;
      else if (ch === ' ') units += 0.32;
      else units += 0.55;
    }
    return units;
  }

  function calcFitFontSz(text, widthIn, maxSz, minSz) {
    const units = estimateVisualWidthUnits(text);
    if (!units) return maxSz;
    const maxPt = maxSz / 100;
    const minPt = minSz / 100;
    const availPt = Math.max(20, widthIn * 72 - 5);
    const neededPt = availPt / units;
    if (neededPt >= maxPt) return maxSz;
    const pt = Math.max(minPt, Math.min(maxPt, neededPt));
    return Math.round(pt * 2) * 50; // 0.5pt 단위 반올림
  }

  /**
   * [원본 글자크기 100% 고정] 1줄 셀/제목이 지정 폭(widthIn)을 초과할 때만 어절 단위로 자연 축약 (말줄임표 '...' 금지, 글자크기 축소 금지)
   */
  function fitSingleLineByAbbr(text, widthIn, fontPt, prefixText = '') {
    let s = String(text || '').replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (!s) return '';
    const availPt = Math.max(24, widthIn * 72 - 5);
    const prefixPt = estimateVisualWidthUnits(prefixText) * fontPt;
    const budgetPt = Math.max(fontPt * 2, availPt - prefixPt);
    if (estimateVisualWidthUnits(s) * fontPt <= budgetPt) return s;

    // 1차: 불필요한 괄호/법인 표기/장황한 접두어 간소화
    let compact = s
      .replace(/산업안전보건기준에\s*관한\s*규칙/g, '안전보건규칙')
      .replace(/^(?:\(주\)|㈜|주식회사|\(유\))\s*/g, '')
      .replace(/\s*(?:\(주\)|㈜|주식회사|\(유\))$/g, '')
      .replace(/20(\d{2})년\s*상반기\s*/g, '$1년上')
      .replace(/20(\d{2})년\s*하반기\s*/g, '$1년下')
      .replace(/\s+/g, ' ')
      .trim();
    if (estimateVisualWidthUnits(compact) * fontPt <= budgetPt) return compact;

    // 2차: 어절 단위 완결 축약 (toCompletePhrase 활용, '...' 절대 미사용)
    let lo = 2;
    let hi = compact.length;
    let best = compact.slice(0, Math.max(2, Math.floor(budgetPt / fontPt)));
    while (lo <= hi) {
      const mid = Math.floor((lo + hi) / 2);
      const cand = toCompletePhrase(compact, mid);
      if (estimateVisualWidthUnits(cand) * fontPt <= budgetPt) {
        best = cand;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    // 그래도 초과 시 문자 단위 정밀 절단
    while (best.length > 2 && estimateVisualWidthUnits(best) * fontPt > budgetPt) {
      best = best.slice(0, -1).replace(/[,/;·\-:(\s]+$/g, '').trim();
    }
    return best;
  }

  /**
   * [v62] 어절/문장 경계 기반 안전 축약 (단어 중간 절단 '안전고리를체', 1~2글자 잔여 '- 그' 원천 금지)
   */
  function trimTextAtCleanBoundary(body, budgetPt, fontPt) {
    const clean = String(body || '').replace(/\s+/g, ' ').trim();
    if (!clean) return '';
    if (estimateVisualWidthUnits(clean) * fontPt <= budgetPt) return clean;
    // 1순위: 완결 문장 경계(., !, ?) 중 예산 내에 들어오는 가장 긴 접두문
    const sentEnds = [...clean.matchAll(/[.!?](?=\s|$)/g)].map(m => m.index + 1);
    for (let i = sentEnds.length - 1; i >= 0; i--) {
      const cand = clean.slice(0, sentEnds[i]).trim();
      if (cand.length >= 6 && estimateVisualWidthUnits(cand) * fontPt <= budgetPt) {
        return cand;
      }
    }
    // 2순위: 어절(공백) 단위로 뒤에서부터 축소 (절대 어절 중간 글자 자르기 금지!)
    const words = clean.split(' ').filter(Boolean);
    while (words.length > 1) {
      words.pop();
      const cand = words.join(' ').replace(/[,/;·\-:(\s]+$/g, '').trim();
      if (cand && estimateVisualWidthUnits(cand) * fontPt <= budgetPt) {
        return cand;
      }
    }
    // 단어가 단 1개뿐인 예외적인 장문일 때만 예산 내 문자 절단
    let s = clean;
    while (s.length > 4 && estimateVisualWidthUnits(s) * fontPt > budgetPt) {
      s = s.slice(0, -1).replace(/[,/;·\-:(\s]+$/g, '').trim();
    }
    return s;
  }

  /**
   * [v62] 원본 글자크기 100% 고정 + 원문 최대 보존 다중줄 피팅 엔진
   * - 글자크기(fontPt)는 절대 줄이지 않음!
   * - 원문이 넘칠 때는 먼저 단락 간격(spcAft)과 줄 간격(lnSpc 1.0->0.94)만 미세 조정하여 원문 100%를 무절단 수용
   * - 물리적 박스 한계를 진짜로 초과할 때만 비례 줄 배분 + 문장/어절 경계 안전 축약 수행 (단어 중간 절단 금지)
   */
  function fitMultilineSmart(lines, widthIn, heightIn, fontPt, lnSpcRatio = 1.0, spcAftPt = 0, options = {}) {
    let cleanLines = (Array.isArray(lines) ? lines : [lines])
      .map((l) => String(l || '').replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim())
      .filter(Boolean);
    if (!cleanLines.length) return { lines: [], lnSpcRatio, spcAftPt };

    const lineWidthPt = Math.max(36, widthIn * 72 - (options.isLawBody ? 46 : 8));
    const availH = Math.max(fontPt * 1.3, heightIn * 72 - 3);
    const countWrapped = (str) => {
      const words = String(str || '').trim().split(/\s+/).filter(Boolean);
      if (!words.length) return 1;
      const spPt = 0.34 * fontPt;
      let curPt = 0;
      let wrapped = 1;
      for (const w of words) {
        const wPt = estimateVisualWidthUnits(w) * fontPt;
        if (curPt > 0 && curPt + spPt + wPt > lineWidthPt) {
          wrapped++;
          curPt = wPt;
        } else {
          curPt = curPt > 0 ? (curPt + spPt + wPt) : wPt;
        }
        while (curPt > lineWidthPt) {
          wrapped++;
          curPt -= lineWidthPt;
        }
      }
      return wrapped;
    };
    const calcHeight = (arr, lnR, spcA) => {
      const lineH = fontPt * lnR * 1.22;
      return arr.reduce((sum, l, i) => sum + countWrapped(l) * lineH + (i < arr.length - 1 ? spcA : 0), 0);
    };

    // 1단계: 원본 간격 -> 단락 간격 미세 축소 -> 줄간격 미세 조정으로 원문 100% 보존 시도
    const tiers = [
      { lnR: lnSpcRatio, spcA: spcAftPt },
      { lnR: lnSpcRatio, spcA: Math.min(spcAftPt, Math.max(0, Math.round(spcAftPt / 2))) },
      { lnR: Math.min(lnSpcRatio, 0.96), spcA: Math.min(spcAftPt, 1) },
      { lnR: Math.min(lnSpcRatio, 0.92), spcA: 0 },
    ];
    for (const t of tiers) {
      if (calcHeight(cleanLines, t.lnR, t.spcA) <= availH) {
        return { lines: cleanLines, lnSpcRatio: t.lnR, spcAftPt: t.spcA };
      }
    }

    // 관련기준 본문(isLawBody)에서 첫 줄이 순수 절 제목('7.7.1 A/F 설치')이고 뒤에 실제 수칙 문장이 있으면 절 제목 생략 후 재시도
    if (options.isLawBody && cleanLines.length >= 2) {
      const firstIsSubHeading = /^\d+\.\d+(?:\.\d+)?\s+/.test(cleanLines[0]) && !/[.다함됨요]$/.test(cleanLines[0]);
      if (firstIsSubHeading) {
        const withoutHead = cleanLines.slice(1);
        for (const t of tiers) {
          if (calcHeight(withoutHead, t.lnR, t.spcA) <= availH) {
            return { lines: withoutHead, lnSpcRatio: t.lnR, spcAftPt: t.spcA };
          }
        }
        cleanLines = withoutHead;
      }
    }

    // 2단계: 물리적 박스 한계 초과 시 최소 간격(spcA=0, lnR=0.92) 기준으로 항목별 비례 줄 배분 + 문장/어절 경계 축약
    const bestLnR = Math.min(lnSpcRatio, 0.92);
    const bestSpcA = 0;
    const singleLineH = fontPt * bestLnR * 1.22;
    const totalAvailLines = Math.max(1, Math.floor(availH / singleLineH));
    const maxItems = Math.min(cleanLines.length, totalAvailLines);
    const kept = cleanLines.slice(0, maxItems);
    const needed = kept.map(countWrapped);
    const alloc = kept.map(() => 1);
    let remaining = Math.max(0, totalAvailLines - kept.length);
    // 실제 줄 수가 부족한 항목부터 순서대로 여유 줄 배분 (1줄짜리에 불필요하게 낭비하지 않음)
    while (remaining > 0) {
      let progressed = false;
      for (let i = 0; i < kept.length && remaining > 0; i++) {
        if (alloc[i] < needed[i]) {
          alloc[i]++;
          remaining--;
          progressed = true;
        }
      }
      if (!progressed) break;
    }

    const fitted = kept.map((ln, idx) => {
      if (needed[idx] <= alloc[idx]) return ln;
      const prefixMatch = ln.match(/^((?:[-•▪]\s+|\d+[\.)]\s+))/);
      const prefix = prefixMatch ? prefixMatch[1] : '';
      const body = prefix ? ln.slice(prefix.length).trim() : ln;
      const budgetPt = lineWidthPt * alloc[idx] - estimateVisualWidthUnits(prefix) * fontPt - fontPt * 0.35;
      const trimmed = trimTextAtCleanBoundary(body, budgetPt, fontPt);
      return `${prefix}${trimmed}`.trim();
    });
    return { lines: fitted, lnSpcRatio: bestLnR, spcAftPt: bestSpcA };
  }

  /**
   * [원본 글자크기 100% 고정] 다중 줄 박스가 높이를 초과할 때만 문장/어절 단위로 축약 (말줄임표 '...' 금지, 글자크기 축소 금지)
   */
  function fitMultilineByAbbr(lines, widthIn, heightIn, fontPt, lnSpcRatio = 1.0, spcAftPt = 0, options = {}) {
    return fitMultilineSmart(lines, widthIn, heightIn, fontPt, lnSpcRatio, spcAftPt, options).lines;
  }

  /**
   * [Point #2 & #7] 2장 사진의 추출 면적(픽셀 크기·종횡비) 또는 사용자 지정 비율(예: '60:40', '50:50', '70:30')에 따른 좌/우 박스 좌표 계산
   * - PPTX와 웹 프리뷰가 100% 동일한 함수를 공용 사용하여 완벽히 동일하게 표시
   */
  function computeProportionalTwoPhotoBoxes(fullBox, dims1, dims2, gap, layoutRatio = 'auto') {
    const isEmu = fullBox.w > 100;
    const roundCoord = (v) => (isEmu ? Math.round(v) : Number(v.toFixed(4)));
    const g = gap !== undefined ? gap : roundCoord(fullBox.w * 0.0124);
    const usableW = Math.max(isEmu ? 10 : 0.1, fullBox.w - g);
    const d1 = (dims1 && dims1.w > 0 && dims1.h > 0) ? dims1 : null;
    const d2 = (dims2 && dims2.w > 0 && dims2.h > 0) ? dims2 : null;

    let ratio1 = 0.5;
    const h1 = fullBox.h;
    const h2 = fullBox.h;

    const ratioStr = String(layoutRatio || 'auto').trim();
    const manualMatch = ratioStr.match(/^(\d{1,2})\s*[:/]\s*(\d{1,2})$/);
    if (manualMatch) {
      const n1 = Number(manualMatch[1]);
      const n2 = Number(manualMatch[2]);
      if (n1 > 0 && n2 > 0) {
        ratio1 = Math.max(0.20, Math.min(0.80, n1 / (n1 + n2)));
      }
    } else if (d1 && d2) {
      const ar1 = d1.w / d1.h;
      const ar2 = d2.w / d2.h;
      // [v58] 사진 상단 공란(흰 여백)을 완전히 제거하기 위해 두 사진 모두 fullBox.h 전체 높이를 꽉 채우고,
      // 가로 폭만 각 사진의 종횡비(ar1 : ar2)에 정확히 비례 배분(30% ~ 70% 안전 클램프)하여 크롭 손실과 여백을 동시에 최소화!
      ratio1 = Math.max(0.30, Math.min(0.70, ar1 / (ar1 + ar2)));
    }

    const w1 = roundCoord(usableW * ratio1);
    const w2 = roundCoord(usableW - w1);
    const leftBox = {
      x: roundCoord(fullBox.x),
      y: roundCoord(fullBox.y),
      w: w1,
      h: roundCoord(h1),
    };
    const rightBox = {
      x: roundCoord(fullBox.x + w1 + g),
      y: roundCoord(fullBox.y),
      w: w2,
      h: roundCoord(h2),
    };
    return { leftBox, rightBox, ratio1 };
  }

  function splitBulletLines(rawText) {
    const src = String(rawText || '').replace(/\r\n/g, '\n').trim();
    if (!src) return [];
    const out = [];
    src.split('\n').forEach((line) => {
      const cleaned = line.trim();
      if (!cleaned) return;
      // 본문 중간 ' - ' / ' • ' 항목을 줄바꿈 분리 (하이픈 모델코드 IZSW-024 등은 보존)
      const parts = cleaned.split(/\s+(?=-\s+|[•▪]\s*)/).map((s) => s.trim()).filter(Boolean);
      parts.forEach((p) => out.push(p));
    });
    return out;
  }

  function splitNumberedContentLines(rawText) {
    const src = String(rawText || '').replace(/\r\n/g, '\n').trim();
    if (!src) return [];
    const out = [];
    src.split('\n').forEach((line) => {
      const cleaned = line.trim();
      if (!cleaned) return;
      // '1. ... 2. ...' / '1) ... 2) ...' / '① ... ② ...' / ' - ...' 인라인 항목 분리
      const parts = cleaned
        .split(/\s+(?=(?:[2-9]\d?[\.)]\s+|[②③④⑤⑥⑦⑧⑨⑩]\s*|-\s+))/)
        .map((s) => s.trim())
        .filter(Boolean);
      parts.forEach((p) => out.push(p));
    });
    if (out.length >= 1) {
      const hasNum = out.some((l) => /^(?:\d+[\.)]|[①-⑩])/.test(l));
      if (!hasNum) {
        return out.map((l, idx) => `${idx + 1}. ${l.replace(/^[-•▪]\s*/, '')}`);
      }
    }
    return out;
  }

  function defaultVerdictSub(type) {
    const t = String(type || '').trim();
    if (/교육|코칭/.test(t)) return '(근로자 교육)';
    if (/제재|징계/.test(t)) return '(해당작업팀대기)';
    if (/페널티|패널티/.test(t)) return '(관리감독자 경고)';
    return '(계획 재수립)';
  }

  function resolveVerdictItems(items, singleType, singleSub, fallbackDefault = []) {
    const rawList = Array.isArray(items) && items.length
      ? items
      : (singleType ? [{ type: singleType, sub: singleSub }] : (Array.isArray(fallbackDefault) ? fallbackDefault : []));
    if (!rawList.length) return [];
    return rawList.map((it) => {
      let type = String((it && it.type) || '').trim();
      let sub = String((it && it.sub) || '').trim();
      if (!type) return null;
      if (!sub) {
        const m = type.match(/(\([^)]+\))/);
        if (m) {
          sub = m[1];
          type = type.replace(m[1], '').trim();
        } else {
          sub = defaultVerdictSub(type);
        }
      }
      if (sub && !sub.startsWith('(')) sub = `(${sub})`;
      return { type, sub };
    }).filter(Boolean);
  }

  function appendSheetPic(slideXml, relsXml, zip, ctXml, mediaName, parsedPhoto, box, picTitle, mode = 'cover') {
    if (!parsedPhoto || !parsedPhoto.base64) {
      return { slideXml, relsXml, ctXml };
    }
    const ext = parsedPhoto.ext === 'png' ? 'png' : 'jpeg';
    const mediaPath = `ppt/media/${mediaName}.${ext}`;
    // [v63 A1] 이미 압축된 JPEG/PNG 바이너리는 STORE(무압축 저장)로 즉시 패키징하여 다중 슬라이드 PPTX 생성 시간을 20초 -> 1초로 단축
    zip.file(mediaPath, parsedPhoto.base64, { base64: true, compression: 'STORE' });

    const rIdNum = getNextRelId(relsXml);
    const rId = `rId${rIdNum}`;
    const newRel = `<Relationship Id="${rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/${mediaName}.${ext}"/>`;
    const nextRelsXml = relsXml.replace('</Relationships>', `${newRel}</Relationships>`);

    let nextCtXml = ensureContentTypeDefault(ctXml, 'jpeg', 'image/jpeg');
    nextCtXml = ensureContentTypeDefault(nextCtXml, 'png', 'image/png');

    const dims = getImageDimensionsFromBase64(ext, parsedPhoto.base64);
    let drawBox = box;
    let srcRectXml = '';
    if (mode === 'cover' && dims && dims.w && dims.h) {
      const imgRatio = dims.w / dims.h;
      const boxRatio = box.w / box.h;
      if (imgRatio > boxRatio * 1.01) {
        const crop = Math.min(35000, Math.round(((1 - boxRatio / imgRatio) / 2) * 100000));
        if (crop > 0) srcRectXml = `<a:srcRect l="${crop}" r="${crop}"/>`;
      } else if (imgRatio * 1.01 < boxRatio) {
        const crop = Math.min(35000, Math.round(((1 - imgRatio / boxRatio) / 2) * 100000));
        if (crop > 0) srcRectXml = `<a:srcRect t="${crop}" b="${crop}"/>`;
      }
    } else if (mode === 'contain' && dims && dims.w && dims.h) {
      drawBox = fitBoxContain(box, dims);
    }

    const spId = getNextShapeId(slideXml);
    const picXml =
      `<p:pic>` +
        `<p:nvPicPr><p:cNvPr id="${spId}" name="${escapeXml(picTitle || mediaName)}"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr>` +
        `<p:blipFill><a:blip r:embed="${rId}"/>${srcRectXml}<a:stretch><a:fillRect/></a:stretch></p:blipFill>` +
        `<p:spPr><a:xfrm><a:off x="${Math.round(drawBox.x)}" y="${Math.round(drawBox.y)}"/><a:ext cx="${Math.round(drawBox.w)}" cy="${Math.round(drawBox.h)}"/></a:xfrm>` +
        `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:ln><a:noFill/></a:ln></p:spPr>` +
      `</p:pic>`;

    const nextSlideXml = insertIntoSpTree(slideXml, picXml);
    return { slideXml: nextSlideXml, relsXml: nextRelsXml, ctXml: nextCtXml };
  }

  function buildCheckmarkPicXml(spId, name, rId, box) {
    return (
      `<p:pic>` +
        `<p:nvPicPr><p:cNvPr id="${spId}" name="${escapeXml(name)}"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr>` +
        `<p:blipFill><a:blip r:embed="${rId}"/><a:stretch><a:fillRect/></a:stretch></p:blipFill>` +
        `<p:spPr><a:xfrm><a:off x="${Math.round(box.x)}" y="${Math.round(box.y)}"/><a:ext cx="${Math.round(box.w)}" cy="${Math.round(box.h)}"/></a:xfrm>` +
        `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr>` +
      `</p:pic>`
    );
  }

  function patchMajorR1SlideXml(slideXml, relsXml, zip, ctXml, data, photo1Parsed, photo2Parsed, slideIdx) {
    let sXml = slideXml;
    let rXml = relsXml;
    let cXml = ctXml;
    const BLUE = '0000FF';
    const BLACK = '000000';

    // 1. 표 47 (id=48): 모든 글자크기 원본 R1 100% 고정 (초과 시 글자크기 축소 금지, 내용 축약)
    //    - 유형/등급: 20pt Bold / 20pt Bold
    //    - 관련기준 제목: 16pt Bold
    //    - 메타 5칸(협력사/공종명/작업장소/점검자/점검차수): 모두 14pt Bold
    //    - 부적합 내용: 14pt Bold (1건도 '1. ' + 상단 정렬)
    const typeMain = fitSingleLineByAbbr(String(data.typeMain || data.type || '안전').trim(), 1.48, 20);
    const sevText = `[${data.severity || '중부적합'}]`;

    const lawTitleText = fitSingleLineByAbbr(String(data.lawTitle || ''), 5.50, 16);

    const subText = fitSingleLineByAbbr(String(data.subcontractor || ''), 2.30, 14, '협력사 : ');
    const workText = fitSingleLineByAbbr(String(data.workGroup || ''), 2.94, 14, '공종명 : ');
    const locText = fitSingleLineByAbbr(String(data.location || ''), 3.10, 14, '작업장소 : ');
    const inspText = fitSingleLineByAbbr(String(data.inspector || ''), 1.78, 14, '점검자 : ');
    const roundText = fitSingleLineByAbbr(String(data.inspectRound || ''), 2.04, 14, '점검차수 : ');

    const rawContentLines = splitNumberedContentLines(data.mainContent || data.content || '');
    const contentLines = fitMultilineByAbbr(rawContentLines, 10.65, 0.62, 14, 1.10, 0);
    // malgunbd.ttf 실측: 14pt '부적합 내용 : ' = 1,122,680 EMU, '1. ' = 212,090 EMU
    const labelHangEmu = 1122680;
    const numHangEmu = 212090;
    const totalContentHangEmu = labelHangEmu + numHangEmu;
    const contentParas = contentLines.length
      ? contentLines.map((line, idx) => (idx === 0
        ? {
            algn: 'l', spcBef: 0, spcAft: 0, lnSpc: 110000,
            marL: totalContentHangEmu, indent: -totalContentHangEmu, buNone: true,
            runs: [
              { text: '부적합 내용 ', sz: 1400, bold: true, color: BLUE },
              { text: `: ${line}`, sz: 1400, bold: true, color: BLACK },
            ],
          }
        : {
            algn: 'l', spcBef: 0, spcAft: 0, lnSpc: 110000,
            marL: totalContentHangEmu, indent: -numHangEmu, buNone: true,
            runs: [{ text: line, sz: 1400, bold: true, color: BLACK }],
          }))
      : [{
          algn: 'l', spcBef: 0, spcAft: 0, lnSpc: 110000, marL: 0, indent: 0, buNone: true,
          runs: [
            { text: '부적합 내용 ', sz: 1400, bold: true, color: BLUE },
            { text: ': 1. ', sz: 1400, bold: true, color: BLACK },
          ],
        }];

    sXml = updateTableById(sXml, 48, {
      0: {
        3: {
          paragraphs: [
            { algn: 'ctr', spcBef: 0, spcAft: 0, lnSpc: 100000, runs: [{ text: typeMain, sz: 2000, bold: true, color: BLACK }] },
            { algn: 'ctr', spcBef: 0, spcAft: 0, lnSpc: 100000, runs: [{ text: sevText, sz: 2000, bold: true, color: BLACK }] },
          ],
        },
        7: {
          paragraphs: [
            { algn: 'l', spcBef: 0, spcAft: 0, lnSpc: 100000, runs: [{ text: lawTitleText, sz: 1600, bold: true, color: BLACK }] },
          ],
        },
      },
      2: {
        1: {
          paragraphs: [{
            algn: 'l', spcBef: 0, spcAft: 0, lnSpc: 100000,
            runs: [
              { text: '협력사 : ', sz: 1400, bold: true, color: BLUE },
              { text: subText, sz: 1400, bold: true, color: BLACK },
            ],
          }],
        },
        4: {
          paragraphs: [{
            algn: 'l', spcBef: 0, spcAft: 0, lnSpc: 100000,
            runs: [
              { text: '공종명', sz: 1400, bold: true, color: BLUE },
              { text: ` : ${workText}`, sz: 1400, bold: true, color: BLACK },
            ],
          }],
        },
        6: { clearMerged: true },
        7: { clearMerged: true },
        8: {
          paragraphs: [{
            algn: 'l', spcBef: 0, spcAft: 0, lnSpc: 100000,
            runs: [
              { text: '작업장소', sz: 1400, bold: true, color: BLUE },
              { text: ` : ${locText}`, sz: 1400, bold: true, color: BLACK },
            ],
          }],
        },
        9: {
          paragraphs: [{
            algn: 'l', spcBef: 0, spcAft: 0, lnSpc: 100000,
            runs: [
              { text: '점검자', sz: 1400, bold: true, color: BLUE },
              { text: ` : ${inspText}`, sz: 1400, bold: true, color: BLACK },
            ],
          }],
        },
        10: { clearMerged: true },
        11: {
          paragraphs: [{
            algn: 'l', spcBef: 0, spcAft: 0, lnSpc: 100000,
            runs: [
              { text: '점검차수', sz: 1400, bold: true, color: BLUE },
              { text: ` : ${roundText}`, sz: 1400, bold: true, color: BLACK },
            ],
          }],
        },
      },
      3: {
        1: {
          paragraphs: contentParas,
          anchor: 't',
          marT: contentLines.length >= 3 ? 45000 : 90000,
          marB: 36000,
        },
      },
    });

    // 2. 관련기준 본문 박스 (TextBox 1, id=2): 원본 11pt 일반체 100% 고정 (초과 시 3줄 이내 안전 축약) + lstStyle glow 제거
    const rawLawBodyLines = splitBulletLines(data.lawBody || '');
    const lawFit = fitMultilineSmart(rawLawBodyLines, 5.42, 0.64, 11, 1.0, 0, { isLawBody: true });
    const lawBodyLines = lawFit.lines;
    const lawLnSpcXml = Math.round(lawFit.lnSpcRatio * 100000);
    // malgun.ttf 실측: 11pt '- ' = 106,680 EMU (원문에 '-'가 있을 때만 내어쓰기 적용)
    const lawHangEmu = 106680;
    const lawBodyParas = lawBodyLines.length
      ? lawBodyLines.map((line) => {
          const isDash = /^[-•▪]\s+/.test(line);
          return {
            text: line,
            sz: 1100,
            bold: false,
            color: BLACK,
            algn: 'l',
            spcBef: 0,
            spcAft: 0,
            lnSpc: lawLnSpcXml,
            marL: isDash ? lawHangEmu : 0,
            indent: isDash ? -lawHangEmu : 0,
            buNone: true,
          };
        })
      : [{ text: '', sz: 1100, bold: false, color: BLACK, algn: 'l', spcBef: 0, spcAft: 0, lnSpc: 100000, marL: 0, indent: 0, buNone: true }];
    sXml = setShapeParagraphs(sXml, 2, lawBodyParas, {
      algn: 'l', lIns: 45000, rIns: 45000, tIns: 25000, bIns: 20000,
      anchor: 't', noAutofit: true, clearLstStyle: true,
    });

    // 3. 우측 상단 4대 원인 체크박스 (표 36) + Hold Point (표 32) 체크마크 PNG 배치
    //    미위반(N/A)일 때는 원본 표 32 XML(+mn-lt Calibri / +mn-ea 맑은 고딕 / spc="-30")을 100% 원형 보존
    sXml = removeElementBlockById(sXml, 26);
    sXml = removeElementBlockById(sXml, 31);
    if (data.isHoldPoint) {
      const holdLabel = data.holdPointCode ? ` Hold Point 위반 (${data.holdPointCode})` : ' Hold Point 위반';
      sXml = updateTableById(sXml, 33, {
        1: {
          2: {
            text: holdLabel, sz: 1100, bold: true, color: BLACK, algn: 'l',
            latin: '+mn-lt', ea: '+mn-ea', cs: '+mn-cs', spc: -30, kern: 1200,
          },
        },
      });
    }

    const checkMarks = [];
    if (data.isUnplanned) checkMarks.push({ name: 'Chk_Unplanned', x: 9835000, y: 177299, w: 287532, h: 360000 });
    if (data.isUnexecuted) checkMarks.push({ name: 'Chk_Unexecuted', x: 10958439, y: 177299, w: 287532, h: 360000 });
    if (data.isAction) checkMarks.push({ name: 'Chk_Action', x: 9835000, y: 659256, w: 287532, h: 360000 });
    if (data.isCondition) checkMarks.push({ name: 'Chk_Condition', x: 10958439, y: 659256, w: 287532, h: 360000 });
    if (data.isHoldPoint) checkMarks.push({ name: 'Chk_HoldPoint', x: 5478000, y: 2145000, w: 287532, h: 360000 });
    checkMarks.forEach((cm) => {
      const spId = getNextShapeId(sXml);
      sXml = insertIntoSpTree(sXml, buildCheckmarkPicXml(spId, cm.name, 'rId3', cm));
    });

    // 4. 좌측 사진 상단 적색 배너 (TextBox 29, id=30) — 원본 16pt Bold 고정 (초과 시 축약) + 정중앙 배치
    const bannerTxt = fitSingleLineByAbbr(String(data.photoBanner || ''), 5.35, 16);
    sXml = setShapeParagraphs(sXml, 30, [
      { text: bannerTxt, sz: 1600, bold: true, color: 'F2F2F2', glow: true, algn: 'ctr', spcBef: 0, spcAft: 0, lnSpc: 100000, marL: 0, indent: 0, buNone: true },
    ], { algn: 'ctr', lIns: 35000, rIns: 35000, tIns: 0, bIns: 0, anchor: 'ctr', noAutofit: true });

    // 5. 발생원인 인터뷰 결과 (TextBox 45, id=46)
    //    - 원본 R1 정확 수치: 제목 14pt Bold / 본문 12pt Regular, 단락 앞 0pt, 기본 단락 뒤 9pt(900), 줄 간격 1줄(100000)
    //    - [v62] 의견이 공란이면 '[의견 : 시공관리자 및 안전관리자]' 하드코딩 금지 — 완전 공란 유지!
    //    - [v62] 복수 의견/장문 시 글자크기(14pt/12pt) 고정, 단락간격(9pt->4pt->2pt->0pt)을 먼저 조절해 원문 100% 무절단 보존!
    let sections = [];
    if (Array.isArray(data.interviewSections) && data.interviewSections.length) {
      sections = data.interviewSections
        .map((sec) => ({
          title: sec.title || '',
          lines: (Array.isArray(sec.items) && sec.items.length)
            ? sec.items
            : ((Array.isArray(sec.lines) && sec.lines.length) ? sec.lines : splitBulletLines(sec.text || sec.body || '')),
        }))
        .filter((sec) => sec.lines.length > 0);
    } else {
      const rawIv = String(data.interviewOpinion || '').replace(/\r\n/g, '\n').trim();
      if (rawIv) {
        const headerRe = /\[[^\]]*의견[^\]]*\]/g;
        const matches = [...rawIv.matchAll(headerRe)];
        if (matches.length >= 1) {
          matches.forEach((m, idx) => {
            const start = m.index + m[0].length;
            const end = idx + 1 < matches.length ? matches[idx + 1].index : rawIv.length;
            const bodyLs = splitBulletLines(rawIv.slice(start, end));
            if (bodyLs.length) {
              sections.push({ title: m[0].trim(), lines: bodyLs });
            }
          });
        } else {
          const bodyLs = splitBulletLines(rawIv);
          if (bodyLs.length) {
            sections = [{
              title: data.interviewAuthorTitle || '[의견 : 시공관리자 및 근로자]',
              lines: bodyLs,
            }];
          }
        }
      }
    }
    const ivHangEmu = 115570; // 12pt '- ' 실측 폭
    const ivHeaderCount = sections.filter((s) => s.title).length;
    const allIvBodyLines = sections.flatMap((s) => s.lines || []);
    const ivBoxW = 4.82;
    const ivBoxH = 1.52;
    const ivLineWidthPt = ivBoxW * 72 - 6;
    const ivAvailHPt = ivBoxH * 72 - 3;
    const countIvWrap = (str, pt) => Math.max(1, Math.ceil((estimateVisualWidthUnits(str) * pt) / ivLineWidthPt));
    const calcIvTotalH = (lnR, spcA) => {
      let h = 0;
      const totalParas = ivHeaderCount + allIvBodyLines.length;
      let pIdx = 0;
      sections.forEach((sec) => {
        if (sec.title) {
          h += countIvWrap(sec.title, 14) * (14 * lnR * 1.22);
          if (++pIdx < totalParas) h += spcA;
        }
        (sec.lines || []).forEach((ln) => {
          h += countIvWrap(ln, 12) * (12 * lnR * 1.22);
          if (++pIdx < totalParas) h += spcA;
        });
      });
      return h;
    };
    const ivTiers = [
      { lnR: 1.0, spcA: 9 },
      { lnR: 1.0, spcA: 4 },
      { lnR: 0.96, spcA: 2 },
      { lnR: 0.92, spcA: 0 },
    ];
    let chosenIvTier = ivTiers[ivTiers.length - 1];
    let ivFitsAll = false;
    for (const t of ivTiers) {
      if (calcIvTotalH(t.lnR, t.spcA) <= ivAvailHPt) {
        chosenIvTier = t;
        ivFitsAll = true;
        break;
      }
    }
    const ivSpcAftXml = Math.round(chosenIvTier.spcA * 100);
    const ivLnSpcXml = Math.round(chosenIvTier.lnR * 100000);
    const ivParas = [];
    // 전체 본문이 최소 간격으로도 진짜 박스를 초과할 때만 전체 가용 본문 높이 기준 비례 피팅
    let fittedBodyQueue = null;
    if (!ivFitsAll && allIvBodyLines.length) {
      const headersHIn = (ivHeaderCount * (14 * chosenIvTier.lnR * 1.22 + chosenIvTier.spcA)) / 72;
      const remainBodyHIn = Math.max(0.45, ivBoxH - headersHIn);
      fittedBodyQueue = fitMultilineSmart(allIvBodyLines, ivBoxW, remainBodyHIn, 12, chosenIvTier.lnR, chosenIvTier.spcA).lines;
    }
    let bodyCursor = 0;
    sections.forEach((sec) => {
      const secOrigLines = sec.lines || [];
      const secLines = fittedBodyQueue
        ? fittedBodyQueue.slice(bodyCursor, bodyCursor + secOrigLines.length)
        : secOrigLines;
      bodyCursor += secOrigLines.length;
      if (sec.title) {
        ivParas.push({
          text: fitSingleLineByAbbr(sec.title, ivBoxW, 14),
          sz: 1400,
          bold: true,
          color: BLACK,
          algn: 'l',
          spcBef: 0,
          spcAft: ivSpcAftXml,
          lnSpc: ivLnSpcXml,
          marL: 0,
          indent: 0,
          buNone: true,
        });
      }
      secLines.forEach((ln) => {
        const hasDash = /^[-•▪]\s+/.test(ln);
        ivParas.push({
          text: ln,
          sz: 1200,
          bold: false,
          color: BLACK,
          algn: 'l',
          spcBef: 0,
          spcAft: ivSpcAftXml,
          lnSpc: ivLnSpcXml,
          marL: hasDash ? ivHangEmu : 0,
          indent: hasDash ? -ivHangEmu : 0,
          buNone: true,
        });
      });
    });
    if (!ivParas.length) {
      ivParas.push({ text: '', sz: 1200, bold: false, color: BLACK, algn: 'l', spcBef: 0, spcAft: 0, lnSpc: 100000, marL: 0, indent: 0, buNone: true });
    }
    sXml = setShapeParagraphs(sXml, 46, ivParas, {
      algn: 'l', lIns: 55000, rIns: 45000, tIns: 45000, bIns: 35000, anchor: 't', noAutofit: true,
    });

    // 6. 점검단 제안 분류 (id=55) 및 내용 (id=53)
    //    - 원본 R1 정확 수치: 분류 14pt Bold(파랑)/11pt(검정), 본문 12pt Regular, 기본 단락 뒤 3pt(300), 줄 간격 1줄(100000), 임의 '-' 추가 금지
    const propItems = resolveVerdictItems(data.proposalItems, data.proposalType, data.proposalSub, []);
    const propTypeParas = [];
    propItems.forEach((it) => {
      propTypeParas.push({
        text: it.type, sz: 1400, bold: true, color: BLUE, algn: 'ctr',
        spcBef: 0, spcAft: 300, lnSpc: 100000, marL: 0, indent: 0, buNone: true,
      });
      if (it.sub) {
        propTypeParas.push({
          text: it.sub, sz: 1100, bold: false, color: BLACK, algn: 'ctr',
          spcBef: 0, spcAft: 0, lnSpc: 100000, marL: 0, indent: 0, buNone: true,
        });
      }
    });
    if (!propTypeParas.length) {
      propTypeParas.push({ text: '', sz: 1400, bold: true, color: BLUE, algn: 'ctr', spcBef: 0, spcAft: 0, lnSpc: 100000, marL: 0, indent: 0, buNone: true });
    }
    sXml = setShapeParagraphs(sXml, 55, propTypeParas, {
      algn: 'ctr', lIns: 0, rIns: 0, tIns: 0, bIns: 0, anchor: 'ctr', noAutofit: true,
    });

    const rawPropLines = splitBulletLines(data.proposalContent || '');
    const propFit = fitMultilineSmart(rawPropLines, 3.30, 0.98, 12, 1.0, 3);
    const propLines = propFit.lines;
    const propSpcAftXml = Math.round(propFit.spcAftPt * 100);
    const propLnSpcXml = Math.round(propFit.lnSpcRatio * 100000);
    const propHangEmu = 115570;
    const propParas = propLines.length
      ? propLines.map((ln) => {
          const hasDash = /^[-•▪]\s+/.test(ln);
          return {
            text: ln,
            sz: 1200, bold: false, color: BLACK, algn: 'l',
            spcBef: 0, spcAft: propSpcAftXml, lnSpc: propLnSpcXml,
            marL: hasDash ? propHangEmu : 0, indent: hasDash ? -propHangEmu : 0, buNone: true,
          };
        })
      : [{ text: '', sz: 1200, bold: false, color: BLACK, algn: 'l', spcBef: 0, spcAft: 300, lnSpc: 100000, marL: 0, indent: 0, buNone: true }];
    sXml = setShapeParagraphs(sXml, 53, propParas, {
      algn: 'l', lIns: 55000, rIns: 45000, tIns: 45000, bIns: 35000, anchor: 't', noAutofit: true,
    });

    // 7. 개선대책 본문 (TextBox 38, id=39) 및 PM 판정 분류 (TextBox 28, id=29)
    //    - [v62 Item #8] 개선대책 본문 글자크기 12pt Regular (발생원인과 동일!) 고정, 기본 단락 뒤 6pt(600), 원문 최대 무절단 보존
    //    - PM 판정결과: PDF/사용자 입력에 명시된 경우만 표시, 없으면 완전 공란 (시스템 개선 강제 주입 금지!)
    const rawCmLines = splitBulletLines(data.countermeasureContent || '');
    const cmFit = fitMultilineSmart(rawCmLines, 3.30, 1.34, 12, 1.0, 6);
    const cmLines = cmFit.lines;
    const cmSpcAftXml = Math.round(cmFit.spcAftPt * 100);
    const cmLnSpcXml = Math.round(cmFit.lnSpcRatio * 100000);
    const cmHangEmu = 115570; // 12pt '- ' 실측 폭
    const cmParas = cmLines.length
      ? cmLines.map((ln) => {
          const hasDash = /^[-•▪]\s+/.test(ln);
          return {
            text: ln,
            sz: 1200, bold: false, color: BLACK, algn: 'l',
            spcBef: 0, spcAft: cmSpcAftXml, lnSpc: cmLnSpcXml,
            marL: hasDash ? cmHangEmu : 0, indent: hasDash ? -cmHangEmu : 0, buNone: true,
          };
        })
      : [{ text: '', sz: 1200, bold: false, color: BLACK, algn: 'l', spcBef: 0, spcAft: 600, lnSpc: 100000, marL: 0, indent: 0, buNone: true }];
    sXml = setShapeParagraphs(sXml, 39, cmParas, {
      algn: 'l', lIns: 36000, rIns: 45000, tIns: 45000, bIns: 35000, anchor: 't', noAutofit: true, clearLstStyle: true,
    });

    const pmItems = resolveVerdictItems(data.pmVerdictItems, data.pmVerdictType, data.pmVerdictSub, []);
    const pmParas = [];
    pmItems.forEach((it) => {
      pmParas.push({
        text: it.type, sz: 1400, bold: true, color: BLUE, algn: 'ctr',
        spcBef: 0, spcAft: 300, lnSpc: 100000, marL: 0, indent: 0, buNone: true,
      });
      if (it.sub) {
        pmParas.push({
          text: it.sub, sz: 1100, bold: false, color: BLACK, algn: 'ctr',
          spcBef: 0, spcAft: 0, lnSpc: 100000, marL: 0, indent: 0, buNone: true,
        });
      }
    });
    if (!pmParas.length) {
      pmParas.push({ text: '', sz: 1400, bold: true, color: BLUE, algn: 'ctr', spcBef: 0, spcAft: 0, lnSpc: 100000, marL: 0, indent: 0, buNone: true });
    }
    sXml = setShapeParagraphs(sXml, 29, pmParas, {
      algn: 'ctr', lIns: 36000, rIns: 0, tIns: 0, bIns: 0, anchor: 'ctr', noAutofit: true,
    });

    // 8. 좌측 실사 사진 임베딩 — 좌측 적색 배너 끝(280152) ~ 우측 Hold Point 박스 끝(7479378) 정확 정렬
    //    2장일 때는 균등 분할하지 않고 각 사진의 추출 면적(픽셀 크기·종횡비)에 비례해 배치 (Point #7)
    const fullPhotoBox = { x: 280152, y: 2600000, w: 7199226, h: 4077270 };
    if (photo1Parsed && photo2Parsed) {
      const dims1 = getImageDimensionsFromBase64(photo1Parsed.ext, photo1Parsed.base64);
      const dims2 = getImageDimensionsFromBase64(photo2Parsed.ext, photo2Parsed.base64);
      const { leftBox, rightBox } = computeProportionalTwoPhotoBoxes(fullPhotoBox, dims1, dims2, 89226, data.photoLayoutRatio || 'auto');
      const r1 = appendSheetPic(sXml, rXml, zip, cXml, `sheet_${slideIdx}_p1`, photo1Parsed, leftBox, '현장사진_1', 'cover');
      sXml = r1.slideXml; rXml = r1.relsXml; cXml = r1.ctXml;
      const r2 = appendSheetPic(sXml, rXml, zip, cXml, `sheet_${slideIdx}_p2`, photo2Parsed, rightBox, '현장사진_2', 'cover');
      sXml = r2.slideXml; rXml = r2.relsXml; cXml = r2.ctXml;
    } else if (photo1Parsed) {
      const r1 = appendSheetPic(sXml, rXml, zip, cXml, `sheet_${slideIdx}_p1`, photo1Parsed, fullPhotoBox, '현장사진_1', 'cover');
      sXml = r1.slideXml; rXml = r1.relsXml; cXml = r1.ctXml;
    } else if (photo2Parsed) {
      const r2 = appendSheetPic(sXml, rXml, zip, cXml, `sheet_${slideIdx}_p2`, photo2Parsed, fullPhotoBox, '현장사진_2', 'cover');
      sXml = r2.slideXml; rXml = r2.relsXml; cXml = r2.ctXml;
    }

    return { slideXml: sXml, relsXml: rXml, ctXml: cXml };
  }

  function patchMinorR1SlideXml(slideXml, relsXml, zip, ctXml, data, photo1Parsed, photo2Parsed, isPhoto2RiskDoc, slideIdx) {
    let sXml = slideXml;
    let rXml = relsXml;
    let cXml = ctXml;
    const BLUE = '0000FF';
    const BLACK = '000000';

    // 1. 표 47 (id=48): 경부적합 원본 R1 글자크기 100% 고정 (헤더 17pt Bold, 본문 14pt Bold, 단락 뒤 6pt, 줄 간격 1줄)
    //    길면 글자크기 축소 금지 — 내용 자연 축약 (Point #10)
    const cleanSub = fitSingleLineByAbbr(String(data.subcontractor || ''), 6.50, 17, '■ 위험요소 안전대책 이행 확인 [협력사: ]');
    const rawContentLines = splitBulletLines(data.mainContent || data.content || '');
    const contentLines = fitMultilineByAbbr(rawContentLines, 11.40, 0.72, 14, 1.0, 6);
    // malgunbd.ttf 실측: 14pt '- ' = 135,890 EMU
    const minorBaseIndent = 160000;
    const minorDashW = 135890;
    const r2c1Paras = [
      {
        algn: 'l', spcBef: 0, spcAft: 600, lnSpc: 100000, marL: 0, indent: 0, buNone: true,
        runs: [
          { text: '■ 위험요소 안전대책 이행 확인 [', sz: 1700, bold: true, color: BLACK },
          { text: `협력사: ${cleanSub || '                 '}`, sz: 1700, bold: true, color: BLUE },
          { text: ']', sz: 1700, bold: true, color: BLACK },
        ],
      },
      ...(contentLines.length
        ? contentLines.map((ln) => ({
            algn: 'l', spcBef: 0, spcAft: 600, lnSpc: 100000,
            marL: minorBaseIndent + minorDashW, indent: -minorDashW, buNone: true,
            runs: [{ text: /^[-•▪]\s+/.test(ln) ? ln : `- ${ln.replace(/^[-•▪]\s*/, '')}`, sz: 1400, bold: true, color: BLACK }],
          }))
        : [{
            algn: 'l', spcBef: 0, spcAft: 600, lnSpc: 100000, marL: minorBaseIndent + minorDashW, indent: -minorDashW, buNone: true,
            runs: [{ text: '- ', sz: 1400, bold: true, color: BLACK }],
          }]),
    ];

    sXml = updateTableById(sXml, 48, {
      2: {
        1: { paragraphs: r2c1Paras },
      },
    });

    // 2. 좌측 적색 배너 (TextBox 11, id=12) — 원본 16pt Bold 고정 (초과 시 축약) + 정중앙 배치
    const bannerTxt = fitSingleLineByAbbr(String(data.photoBanner || ''), 5.35, 16);
    sXml = setShapeParagraphs(sXml, 12, [
      { text: bannerTxt, sz: 1600, bold: true, color: 'F2F2F2', glow: true, algn: 'ctr', spcBef: 0, spcAft: 0, lnSpc: 100000, marL: 0, indent: 0, buNone: true },
    ], { algn: 'ctr', lIns: 35000, rIns: 35000, tIns: 0, bIns: 0, anchor: 'ctr', noAutofit: true });

    // 3. 좌측 부적합 사례 사진(2장 시 면적 비례 배치, 꽉 차게 cover) & 우측 위험성평가표(문서 잘림 방지 contain)
    const leftFullBox = { x: 794187, y: 2945000, w: 4990796, h: 3695000 };
    const rightDocBox = { x: 7199964, y: 2945000, w: 4030878, h: 3695000 };

    if (photo2Parsed && !isPhoto2RiskDoc) {
      const dims1 = photo1Parsed ? getImageDimensionsFromBase64(photo1Parsed.ext, photo1Parsed.base64) : null;
      const dims2 = getImageDimensionsFromBase64(photo2Parsed.ext, photo2Parsed.base64);
      const { leftBox: halfLeft, rightBox: halfRight } = computeProportionalTwoPhotoBoxes(leftFullBox, dims1, dims2, 80796, data.photoLayoutRatio || 'auto');
      if (photo1Parsed) {
        const r1 = appendSheetPic(sXml, rXml, zip, cXml, `sheet_${slideIdx}_p1`, photo1Parsed, halfLeft, '부적합사례_1', 'cover');
        sXml = r1.slideXml; rXml = r1.relsXml; cXml = r1.ctXml;
      }
      const r2 = appendSheetPic(sXml, rXml, zip, cXml, `sheet_${slideIdx}_p2`, photo2Parsed, halfRight, '부적합사례_2', 'cover');
      sXml = r2.slideXml; rXml = r2.relsXml; cXml = r2.ctXml;
    } else {
      if (photo1Parsed) {
        const r1 = appendSheetPic(sXml, rXml, zip, cXml, `sheet_${slideIdx}_p1`, photo1Parsed, leftFullBox, '부적합사례_1', 'cover');
        sXml = r1.slideXml; rXml = r1.relsXml; cXml = r1.ctXml;
      }
      if (photo2Parsed && isPhoto2RiskDoc) {
        const r2 = appendSheetPic(sXml, rXml, zip, cXml, `sheet_${slideIdx}_doc`, photo2Parsed, rightDocBox, '위험성평가표', 'contain');
        sXml = r2.slideXml; rXml = r2.relsXml; cXml = r2.ctXml;
      }
    }

    return { slideXml: sXml, relsXml: rXml, ctXml: cXml };
  }

  async function buildInspectionSheetPptxBlob(options = {}) {
    const JSZipLib = options.JSZip || (typeof window !== 'undefined' && window.JSZip) || (typeof JSZip !== 'undefined' ? JSZip : null);
    if (!JSZipLib) throw new Error('JSZip 라이브러리가 로드되지 않았습니다.');
    const list = Array.isArray(options.records) ? options.records : (options.records ? [options.records] : []);
    if (!list.length) {
      throw new Error('점검장표를 생성할 부적합 데이터가 선택되지 않았습니다.');
    }

    const globalObj = typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null);
    const normalizeFn = options.normalizeRecord
      || (globalObj && globalObj.SafePPT && globalObj.SafePPT.normalizeJangpyoData)
      || ((r) => r);
    const isMinorFn = options.isRiskAssessmentSheet || ((r) => Boolean(r && (r.severity === '경부적합' || r.sheetType === '위험성평가' || r.isRiskAssessment === true)));

    const prepared = list.map((rec) => {
      const data = normalizeFn(rec);
      const isMinor = Boolean(isMinorFn(rec, data));
      return { rec, data, isMinor };
    });

    const allMinorSingle = prepared.length === 1 && prepared[0].isMinor;
    const hasMajor = prepared.some((x) => !x.isMinor);
    const hasMinor = prepared.some((x) => x.isMinor);

    let zip;
    let majorSlideXmlTpl = '';
    let minorSlideXmlTpl = '';

    if (allMinorSingle) {
      const minorBuf = await loadTemplateBytes('sheet_minor_r1.pptx', options.templateLoader);
      zip = await JSZipLib.loadAsync(minorBuf);
      minorSlideXmlTpl = await zip.file('ppt/slides/slide1.xml').async('string');
    } else {
      const majorBuf = await loadTemplateBytes('sheet_major_r1.pptx', options.templateLoader);
      zip = await JSZipLib.loadAsync(majorBuf);
      majorSlideXmlTpl = await zip.file('ppt/slides/slide1.xml').async('string');
      if (hasMinor) {
        const minorBuf = await loadTemplateBytes('sheet_minor_r1.pptx', options.templateLoader);
        const minorZip = await JSZipLib.loadAsync(minorBuf);
        minorSlideXmlTpl = await minorZip.file('ppt/slides/slide1.xml').async('string');
      }
    }

    let ctXml = await zip.file('[Content_Types].xml').async('string');
    let presXml = await zip.file('ppt/presentation.xml').async('string');
    let presRelsXml = await zip.file('ppt/_rels/presentation.xml.rels').async('string');

    // 다중 슬라이드일 때 notesSlide1 중복 참조 충돌 방지를 위해 notesSlide1 정리
    if (prepared.length > 1) {
      zip.remove('ppt/notesSlides/notesSlide1.xml');
      zip.remove('ppt/notesSlides/_rels/notesSlide1.xml.rels');
      ctXml = ctXml.replace(/<Override[^>]*PartName="\/ppt\/notesSlides\/notesSlide1\.xml"[^>]*\/>/g, '');
    }

    const baseSlideRelsMajor =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout2.xml"/>' +
      '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image1.png"/>' +
      '</Relationships>';
    const baseSlideRelsMinor =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout2.xml"/>' +
      '</Relationships>';

    // [v63 A1 초고속 병렬 사진 프리페치] 슬라이드 루프 진입 전 모든 사진을 동시 12개 워커로 병렬 로드
    const resolvedPhotos = prepared.map(() => ({ p1: null, p2: null }));
    if (options.loadPhotoBase64 && prepared.length > 0) {
      const tasks = [];
      for (let i = 0; i < prepared.length; i++) {
        const { rec } = prepared[i];
        const isDemoRec = String(rec.id || '').startsWith('DEMO-');
        const isDummySample = (p) => !isDemoRec && /^samples\/sample_(?:before|after)\.jpg$/i.test(String(p || '').trim());
        const rawP1 = (rec.photos && rec.photos[0]) || rec.photo1 || '';
        const rawP2 = (rec.photos && rec.photos[1]) || rec.photo2 || '';
        const p1Path = isDummySample(rawP1) ? '' : rawP1;
        const p2Path = isDummySample(rawP2) ? '' : rawP2;
        if (p1Path) tasks.push({ slideIdx: i, slot: 'p1', path: p1Path, rec, photoIndex: 0 });
        if (p2Path) tasks.push({ slideIdx: i, slot: 'p2', path: p2Path, rec, photoIndex: 1 });
      }
      if (tasks.length > 0) {
        const CONCURRENCY = 12;
        let nextT = 0;
        const runPhotoWorker = async () => {
          while (nextT < tasks.length) {
            const t = tasks[nextT++];
            try {
              const b64 = await options.loadPhotoBase64(t.path, t.rec, t.photoIndex);
              resolvedPhotos[t.slideIdx][t.slot] = stripBase64Header(b64);
            } catch (_) {}
          }
        };
        await Promise.all(Array.from({ length: Math.min(CONCURRENCY, tasks.length) }, runPhotoWorker));
      }
    }

    for (let i = 0; i < prepared.length; i++) {
      const { rec, data, isMinor } = prepared[i];
      const slideNum = i + 1;
      const photo1Parsed = resolvedPhotos[i].p1;
      const photo2Parsed = resolvedPhotos[i].p2;

      const isPhoto2RiskDoc = Boolean(
        rec.rightPhotoIsReference === true ||
        rec.photo2IsRiskDoc === true ||
        /위험성\s*평가표|평가표|문서|서식|도면|작업절차서|매뉴얼/i.test(rec.photo2Banner || rec.photo2Type || '')
      );

      let relsK;
      if (slideNum === 1 && prepared.length === 1) {
        relsK = await zip.file('ppt/slides/_rels/slide1.xml.rels').async('string');
      } else {
        relsK = isMinor ? baseSlideRelsMinor : baseSlideRelsMajor;
      }

      let res;
      if (isMinor) {
        res = patchMinorR1SlideXml(minorSlideXmlTpl, relsK, zip, ctXml, data, photo1Parsed, photo2Parsed, isPhoto2RiskDoc, slideNum);
      } else {
        res = patchMajorR1SlideXml(majorSlideXmlTpl, relsK, zip, ctXml, data, photo1Parsed, photo2Parsed, slideNum);
      }
      ctXml = res.ctXml;

      zip.file(`ppt/slides/slide${slideNum}.xml`, res.slideXml);
      zip.file(`ppt/slides/_rels/slide${slideNum}.xml.rels`, res.relsXml);

      if (slideNum >= 2) {
        const overrideTag = `<Override PartName="/ppt/slides/slide${slideNum}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`;
        if (!ctXml.includes(`/ppt/slides/slide${slideNum}.xml`)) {
          ctXml = ctXml.replace('</Types>', `${overrideTag}</Types>`);
        }
        const relId = `rIdSlide${slideNum}`;
        const relTag = `<Relationship Id="${relId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${slideNum}.xml"/>`;
        presRelsXml = presRelsXml.replace('</Relationships>', `${relTag}</Relationships>`);
        const sldIdTag = `<p:sldId id="${256 + slideNum}" r:id="${relId}"/>`;
        presXml = presXml.replace('</p:sldIdLst>', `${sldIdTag}</p:sldIdLst>`);
      }
    }

    if (hasMajor) {
      ctXml = ensureContentTypeDefault(ctXml, 'png', 'image/png');
    }
    zip.file('[Content_Types].xml', ctXml);
    zip.file('ppt/presentation.xml', presXml);
    zip.file('ppt/_rels/presentation.xml.rels', presRelsXml);

    const appXmlFile = zip.file('docProps/app.xml');
    if (appXmlFile) {
      const appXml = await appXmlFile.async('string');
      zip.file('docProps/app.xml', appXml.replace(/<Slides>\d+<\/Slides>/, `<Slides>${prepared.length}</Slides>`));
    }

    const outBuf = await zip.generateAsync({
      type: 'blob',
      compression: 'DEFLATE',
      compressionOptions: { level: 1 }
    });
    const mimeBlob = new Blob([outBuf], {
      type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    });
    const defaultName = `점검장표_${list[0].site || '현장'}_${list.length > 1 ? `${list.length}건_` : ''}${new Date().toISOString().slice(0, 10)}.pptx`;
    const filename = options.filename || defaultName;
    triggerDownloadIfRequested(mimeBlob, filename, options.download);
    return { blob: mimeBlob, filename, slideCount: prepared.length };
  }

  return {
    escapeXml,
    decodeXml,
    findElementBlockById,
    computeReportStats,
    buildManagerPptxBlob,
    buildWorkerPptxBlob,
    buildInspectionSheetPptxBlob,
    triggerDownloadIfRequested,
    fitSingleLineByAbbr,
    fitMultilineByAbbr,
    fitMultilineSmart,
    estimateVisualWidthUnits,
    computeProportionalTwoPhotoBoxes,
    _internal: {
      normalizeHazardType,
      normalizeSeverity,
      getAgentLevels,
      isUnsafeCondition,
      isUnsafeAction,
      isMeaningfulValue,
      getRecordDateStr,
      classifyPDCA,
      build3ERows,
      buildWorkerTbmContent,
      stripBase64Header,
      getImageDimensionsFromBase64,
      fitBoxContain,
      updateTreemapChartExXml,
      updateComboChartXml,
      updateHorizontalBarChartXml,
    },
  };
});
