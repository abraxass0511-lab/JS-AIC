/**
 * SafePatrol 안전회의용 분석 PPT 자동 생성기
 * - 외부 유료 API나 AI 없이 PptxGenJS를 이용해 브라우저에서 100% 무료로 .pptx 파일 직접 생성
 * - 통계 규칙 기반 자동 시사점 도출 (반복 지적, 조치 지연, 급증 유형 등)
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SafePPT = factory();
})(typeof self !== 'undefined' ? self : this, function () {

  // 색상 팔레트
  const C_NAVY = '1E3A8A';
  const C_BLUE = '2563EB';
  const C_RED = 'DC2626';
  const C_GREEN = '16A34A';
  const C_GRAY = '64748B';
  const C_BG_LIGHT = 'F8FAFC';

  /**
   * 데이터 기반 시사점 자동 도출 (규칙 기반)
   */
  function extractInsights(records) {
    const insights = [];
    if (!records || !records.length) return ['등록된 점검 데이터가 충분하지 않습니다.'];

    const total = records.length;
    const unfixed = records.filter(r => r.status !== '조치완료').length;
    const fixRate = Math.round(((total - unfixed) / total) * 100);

    // 1) 조치율 평가
    if (fixRate < 70) {
      insights.push(`[조치 지연 심각] 전체 ${total}건 중 미조치 항목이 ${unfixed}건(${100 - fixRate}%)으로 조치율이 매우 저조함. 조치 책임자 지정 및 현장 지도 강화 필요.`);
    } else {
      insights.push(`[조치율 양호] 전체 ${total}건 중 조치율 ${fixRate}% 달성. 개선 사항이 신속하게 피드백되고 있음.`);
    }

    // 2) 최다 발생 유형(발생형태) 분석
    const typeCount = {};
    records.forEach(r => { typeCount[r.type] = (typeCount[r.type] || 0) + 1; });
    const sortedTypes = Object.entries(typeCount).sort((a, b) => b[1] - a[1]);
    if (sortedTypes.length) {
      const topType = sortedTypes[0];
      const percent = Math.round((topType[1] / total) * 100);
      insights.push(`[위험 유형 집중] '${topType[0]}' 재해 위험이 전체 지적의 ${percent}%(${topType[1]}건)로 가장 높음. 해당 공종 TBM 집중 교육 필수.`);
    }

    // 3) 최다 지적 항목/기인물 분석
    const itemCount = {};
    records.forEach(r => { 
      const name = `${r.kind} › ${r.item}`;
      itemCount[name] = (itemCount[name] || 0) + 1; 
    });
    const sortedItems = Object.entries(itemCount).sort((a, b) => b[1] - a[1]);
    if (sortedItems.length && sortedItems[0][1] >= 2) {
      insights.push(`[반복 지적 시설] '${sortedItems[0][0]}' 항목이 ${sortedItems[0][1]}회 반복 지적됨. 단순 시정을 넘어 근본적 자재 교체 및 시공 표준화 필요.`);
    }

    // 4) 발생 원인 분석
    let causeSys = 0, causeHuman = 0, causeMaterial = 0;
    records.forEach(r => {
      if ((r.causes || []).includes('시스템적')) causeSys++;
      if ((r.causes || []).includes('인적')) causeHuman++;
      if ((r.causes || []).includes('물적')) causeMaterial++;
    });
    if (causeSys > total * 0.3) {
      insights.push(`[관리체계 보완] 시스템적(작업계획/위험성평가) 원인 비율이 30%를 상회함. 협력업체 위험성평가 이행 점검 강화 요망.`);
    }

    return insights;
  }

  /**
   * PPT 프레젠테이션 파일 생성
   */
  async function generatePresentation(options) {
    if (!window.PptxGenJS) {
      throw new Error('PptxGenJS 라이브러리가 로드되지 않았습니다.');
    }

    const { records = [], siteName = '전체 현장', month = '2026-10', inspector = '안전관리자', loadPhotoBase64 } = options;
    const pptx = new window.PptxGenJS();
    // 16:9 와이드 표준 규격 명시 (13.333 x 7.5 인치)
    pptx.defineLayout({ name: 'WIDE_16_9', width: 13.333, height: 7.5 });
    pptx.layout = 'WIDE_16_9';

    // ── 슬라이드 1: 표지 ──
    const s1 = pptx.addSlide();
    s1.background = { color: C_NAVY };
    s1.addText('현장 패트롤 안전점검 및 부적합 분석', {
      x: 1.0, y: 2.2, w: 11.3, h: 1.2, fontSize: 34, bold: true, color: 'FFFFFF'
    });
    s1.addText('데이터 기반 위험요인 분석 및 개선 대책 회의', {
      x: 1.0, y: 3.4, w: 11.3, h: 0.8, fontSize: 20, color: '93C5FD'
    });
    s1.addText(`현장명: ${siteName} | 대상기간: ${month} | 작성자: ${inspector}`, {
      x: 1.0, y: 6.0, w: 11.3, h: 0.6, fontSize: 14, color: 'CBD5E1'
    });

    // ── 슬라이드 2: 패트롤 점검 총괄 현황 ──
    const s2 = pptx.addSlide();
    s2.addText(`1. 패트롤 안전점검 총괄 현황 (${month})`, { x: 1.0, y: 0.8, w: 11.3, h: 0.6, fontSize: 24, bold: true, color: C_NAVY });

    const total = records.length;
    const unfixed = records.filter(r => r.status !== '조치완료').length;
    const fixed = total - unfixed;
    const fixRate = total ? Math.round((fixed / total) * 100) : 0;

    // 요약 카드 3개 (가로 11.3 인치 폭 균등 배분)
    s2.addText(`총 지적 건수\n\n${total} 건`, {
      x: 1.0, y: 1.8, w: 3.5, h: 4.5, fontSize: 24, bold: true, color: C_BLUE,
      fill: { color: C_BG_LIGHT }, align: 'center', lineSpacing: 28,
      border: { pt: 1, color: 'E2E8F0' }
    });
    s2.addText(`개선 조치 완료\n\n${fixed} 건`, {
      x: 4.9, y: 1.8, w: 3.5, h: 4.5, fontSize: 24, bold: true, color: C_GREEN,
      fill: { color: C_BG_LIGHT }, align: 'center', lineSpacing: 28,
      border: { pt: 1, color: 'E2E8F0' }
    });
    s2.addText(`미조치 (진행중)\n\n${unfixed} 건\n(조치율 ${fixRate}%)`, {
      x: 8.8, y: 1.8, w: 3.5, h: 4.5, fontSize: 24, bold: true, color: unfixed ? C_RED : C_GREEN,
      fill: { color: C_BG_LIGHT }, align: 'center', lineSpacing: 28,
      border: { pt: 1, color: 'E2E8F0' }
    });

    // ── 슬라이드 3: 유형별/원인별 통계 분석 ──
    const s3 = pptx.addSlide();
    s3.addText(`2. 부적합 유형 및 발생원인 분포 (${month})`, { x: 1.0, y: 0.8, w: 11.3, h: 0.6, fontSize: 24, bold: true, color: C_NAVY });

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

    // 원인 요약 표
    let cHuman = 0, cMat = 0, cTech = 0, cSys = 0;
    records.forEach(r => {
      const arr = r.causes || [];
      if (arr.includes('인적')) cHuman++;
      if (arr.includes('물적')) cMat++;
      if (arr.includes('기술적')) cTech++;
      if (arr.includes('시스템적')) cSys++;
    });

    const causeRows = [
      [{ text: '구분', options: { bold: true, fill: { color: 'CBD5E1' } } }, { text: '건수', options: { bold: true, fill: { color: 'CBD5E1' } } }],
      ['인적 요인 (근로자 행동/부주의)', `${cHuman} 건`],
      ['물적 요인 (시설/방호장치 결함)', `${cMat} 건`],
      ['기술적 요인 (구조/시공방법 결함)', `${cTech} 건`],
      ['시스템적 요인 (계획서/관리체계)', `${cSys} 건`]
    ];

    s3.addTable(causeRows, {
      x: 7.6, y: 2.2, w: 4.7,
      fontSize: 13, rowH: 0.65, border: { pt: 1, color: 'E2E8F0' }, align: 'center'
    });

    // ── 슬라이드 4: 주요 지적 및 조치 사례 (사진 포함) ──
    const s4 = pptx.addSlide();
    s4.addText(`3. 현장 주요 지적 및 조치 사례 (${month})`, { x: 1.0, y: 0.8, w: 11.3, h: 0.5, fontSize: 24, bold: true, color: C_NAVY });

    const sample = records[0];
    if (sample) {
      s4.addText(`사례: [${sample.site}] ${sample.content} (${sample.location})`, {
        x: 1.0, y: 1.4, w: 11.3, h: 0.4, fontSize: 16, bold: true, color: C_BLUE
      });

      // 사진 로드 시도
      let b64Before = null, b64After = null;
      if (loadPhotoBase64 && sample.photos && sample.photos[0]) {
        try { b64Before = await loadPhotoBase64(sample.photos[0]); } catch (e) {}
      }
      if (loadPhotoBase64 && sample.fix && sample.fix.photo) {
        try { b64After = await loadPhotoBase64(sample.fix.photo); } catch (e) {}
      }

      if (b64Before) {
        s4.addImage({ data: b64Before, x: 1.2, y: 2.1, w: 5.0, h: 3.8 });
        s4.addText('❌ 부적합 지적 상태', { x: 1.2, y: 6.1, w: 5.0, h: 0.4, fontSize: 14, bold: true, color: C_RED, align: 'center' });
      } else {
        s4.addText('부적합 사진', { x: 1.2, y: 2.1, w: 5.0, h: 3.8, fill: { color: 'E2E8F0' }, align: 'center' });
      }

      if (b64After) {
        s4.addImage({ data: b64After, x: 7.1, y: 2.1, w: 5.0, h: 3.8 });
        s4.addText('✅ 조치 완료 상태', { x: 7.1, y: 6.1, w: 5.0, h: 0.4, fontSize: 14, bold: true, color: C_GREEN, align: 'center' });
      } else {
        s4.addText(sample.fix && sample.fix.content ? `조치내용:\n${sample.fix.content}` : '미조치 상태', {
          x: 7.1, y: 2.1, w: 5.0, h: 3.8, fill: { color: 'E2E8F0' }, align: 'center', fontSize: 15
        });
      }
    }

    // ── 슬라이드 5: 데이터 기반 핵심 시사점 및 대책 (자동 도출) ──
    const s5 = pptx.addSlide();
    s5.addText(`4. 데이터 기반 종합 시사점 및 대책 (${month})`, { x: 1.0, y: 0.8, w: 11.3, h: 0.6, fontSize: 24, bold: true, color: C_NAVY });

    const insights = extractInsights(records);
    const insightLines = insights.map((msg, i) => `${i + 1}. ${msg}`).join('\n\n');

    s5.addText(insightLines, {
      x: 1.0, y: 1.8, w: 11.3, h: 4.8,
      fontSize: 16, color: '1E293B', lineSpacing: 26,
      fill: { color: C_BG_LIGHT }, margin: 24, border: { pt: 1, color: 'E2E8F0' }
    });

    // 파일 내보내기 (모바일/PC 공용 안전 Blob 다운로드)
    const safeMonthStr = (month || '전체기간').replace(/[\s~:\/\\]+/g, '_');
    const filename = `안전회의_패트롤부적합분석_${safeMonthStr}_${siteName}.pptx`;
    const pptxBlob = await pptx.write({ outputType: 'blob' });
    const mimeBlob = new Blob([pptxBlob], { 
      type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' 
    });

    if (window.SafeUtil && window.SafeUtil.downloadBlob) {
      window.SafeUtil.downloadBlob(mimeBlob, filename);
    } else {
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

  return {
    generatePresentation,
    extractInsights
  };
});
