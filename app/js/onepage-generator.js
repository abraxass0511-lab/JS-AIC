/**
 * SafePatrol 1페이지 근로자 교육자료 생성기 (HTML -> PNG 이미지)
 * - TBM 미팅용, 현장 게시판 부착용, 카카오톡 공지용 세로형(A4비율)
 * - 외부 AI 없이 축적된 부적합 데이터 + 조치 완료 사진 + 산안법 핵심 수칙을 자동 합성
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SafeOnePage = factory();
})(typeof self !== 'undefined' ? self : this, function () {

  /**
   * 1페이지 HTML 마크업 렌더링
   */
  function renderTemplate(data) {
    const { title, site, date, period, beforePhoto, afterPhoto, itemName, law, rules = [], statsText, inspector } = data;

    const rulesHtml = rules.length 
      ? rules.map((r, i) => `<li style="margin-bottom:6px; font-size:0.95rem; line-height:1.4;"><strong>${i + 1}.</strong> ${r}</li>`).join('')
      : '<li style="margin-bottom:6px; font-size:0.95rem;">작업 전 안전점검 철저 및 관리감독자 지휘 하에 작업 실시</li>';

    return `
      <div id="eduCardContainer" style="
        width: 100%;
        max-width: 650px;
        margin: 0 auto;
        background: #ffffff;
        border: 2px solid #1e3a8a;
        border-radius: 12px;
        padding: 16px;
        font-family: -apple-system, BlinkMacSystemFont, 'Pretendard', sans-serif;
        color: #1e293b;
        box-shadow: 0 8px 20px rgba(0,0,0,0.08);
        box-sizing: border-box;
      ">
        <!-- 헤더 -->
        <div style="border-bottom: 2px solid #1e3a8a; padding-bottom: 10px; margin-bottom: 14px; display:flex; justify-content:space-between; align-items:flex-end; flex-wrap:wrap; gap: 8px;">
          <div style="flex: 1; min-width: 180px;">
            <div style="font-size: 0.78rem; font-weight:700; color:#dc2626; letter-spacing: 0.5px; margin-bottom:3px;">🚨 현장 패트롤 특별 안전교육</div>
            <h1 style="margin:0; font-size: clamp(1.15rem, 4vw, 1.45rem); color:#1e3a8a; font-weight:800; line-height:1.25; word-break:keep-all;">${title || '비계 작업발판 안전수칙 준수'}</h1>
          </div>
          <div style="text-align:right; font-size:0.75rem; color:#64748b; white-space:nowrap;">
            <div><strong>현장:</strong> ${site || '전 현장'}</div>
            <div><strong>점검일:</strong> ${date || '2026.10'} | <strong>점검자:</strong> ${inspector || '안전관리자'}</div>
            ${period ? `<div style="color:#1e3a8a; font-weight:700; margin-top:2px;"><strong>분석 기간:</strong> ${period}</div>` : ''}
          </div>
        </div>

        <!-- 사진 비교 섹션 (Before / After) -->
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 14px;">
          <!-- 위험 지적 사례 -->
          <div style="border: 2px solid #fee2e2; border-radius: 8px; overflow: hidden; background: #fff5f5; display:flex; flex-direction:column;">
            <div style="background: #dc2626; color: white; text-align: center; font-weight: 700; padding: 5px 4px; font-size: clamp(0.75rem, 2.5vw, 0.88rem); white-space:nowrap;">
              ❌ 위험 지적 (Before)
            </div>
            <div style="aspect-ratio: 4/3; max-height: 150px; background: #e2e8f0; display:flex; align-items:center; justify-content:center; overflow:hidden;">
              ${beforePhoto ? `<img src="${beforePhoto}" style="width:100%; height:100%; object-fit:cover;">` : '<span style="color:#94a3b8; font-size:0.75rem;">부적합 사진 없음</span>'}
            </div>
            <div style="padding: 6px; font-size: clamp(0.72rem, 2.2vw, 0.82rem); color: #991b1b; font-weight:600; text-align:center; word-break:keep-all; line-height:1.3; flex:1; display:flex; align-items:center; justify-content:center;">
              ${itemName || '안전시설 미설치'}
            </div>
          </div>

          <!-- 올바른 조치 사례 -->
          <div style="border: 2px solid #dcfce7; border-radius: 8px; overflow: hidden; background: #f0fdf4; display:flex; flex-direction:column;">
            <div style="background: #16a34a; color: white; text-align: center; font-weight: 700; padding: 5px 4px; font-size: clamp(0.75rem, 2.5vw, 0.88rem); white-space:nowrap;">
              ✅ 올바른 개선 (After)
            </div>
            <div style="aspect-ratio: 4/3; max-height: 150px; background: #e2e8f0; display:flex; align-items:center; justify-content:center; overflow:hidden;">
              ${afterPhoto ? `<img src="${afterPhoto}" style="width:100%; height:100%; object-fit:cover;">` : '<span style="color:#94a3b8; font-size:0.75rem;">개선 사진 없음</span>'}
            </div>
            <div style="padding: 6px; font-size: clamp(0.72rem, 2.2vw, 0.82rem); color: #166534; font-weight:600; text-align:center; word-break:keep-all; line-height:1.3; flex:1; display:flex; align-items:center; justify-content:center;">
              규정 규격 부재 설치 및 보강 완료
            </div>
          </div>
        </div>

        <!-- 핵심 통계 한 줄 요약 -->
        <div style="background: #f8fafc; border-left: 4px solid #f59e0b; padding: 8px 12px; border-radius: 4px; margin-bottom: 12px; font-size: clamp(0.78rem, 2.3vw, 0.86rem); color: #334155; line-height:1.4; word-break:keep-all;">
          📊 <strong>패트롤 통계 시사점:</strong> ${statsText || '해당 위험요인은 최근 패트롤 지적의 45%를 차지하고 있습니다. 각별한 주의가 요구됩니다.'}
        </div>

        <!-- 근로자 행동 수칙 (3대 수칙) -->
        <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 12px 14px; margin-bottom: 12px;">
          <div style="font-weight: 800; font-size: clamp(0.85rem, 2.5vw, 0.95rem); color: #1e3a8a; margin-bottom: 8px; display:flex; align-items:center; gap:6px;">
            <span>🛡️</span> <span>근로자 필독! 이것만은 꼭 지킵시다</span>
          </div>
          <ul style="margin: 0; padding-left: 18px; color: #1e293b; font-size: clamp(0.78rem, 2.3vw, 0.88rem); line-height:1.45; word-break:keep-all;">
            ${rulesHtml}
          </ul>
        </div>

        <!-- 법적 근거 및 서명 안내 -->
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:6px; font-size: 0.72rem; color: #64748b; border-top: 1px solid #e2e8f0; padding-top: 8px;">
          <div>📖 <strong>관련 법규:</strong> ${law || '산업안전보건기준에 관한 규칙 준수'}</div>
          <div>안전은 타협하지 않습니다. 근로자 안전 최우선!</div>
        </div>
      </div>
    `;
  }

  /**
   * HTML 컨테이너를 캡처하여 고해상도 PNG 이미지로 다운로드
   */
  async function downloadAsImage(containerEl, filename = '1페이지_안전교육자료.png') {
    if (!window.html2canvas) {
      throw new Error('html2canvas 라이브러리가 로드되지 않았습니다.');
    }
    const canvas = await window.html2canvas(containerEl, {
      scale: 2, // 고해상도 2x
      useCORS: true,
      backgroundColor: '#ffffff'
    });

    if (canvas.toBlob) {
      canvas.toBlob((blob) => {
        if (!blob) return;
        if (window.SafeUtil && window.SafeUtil.downloadBlob) {
          window.SafeUtil.downloadBlob(blob, filename);
        } else {
          const url = URL.createObjectURL(blob);
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
      }, 'image/png');
    } else {
      const link = document.createElement('a');
      link.download = filename;
      link.href = canvas.toDataURL('image/png');
      document.body.appendChild(link);
      link.click();
      setTimeout(() => {
        try {
          if (link.parentNode) link.parentNode.removeChild(link);
        } catch (e) {}
      }, 1000);
    }
  }

  /**
   * HTML 컨테이너를 캡처하여 다운로드 없이 메모리 Blob으로 반환
   */
  async function renderAsBlob(containerEl) {
    if (!window.html2canvas) {
      throw new Error('html2canvas 라이브러리가 로드되지 않았습니다.');
    }
    const canvas = await window.html2canvas(containerEl, {
      scale: 2,
      useCORS: true,
      backgroundColor: '#ffffff'
    });
    return new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
  }

  return {
    renderTemplate,
    renderAsBlob,
    downloadAsImage
  };
});
