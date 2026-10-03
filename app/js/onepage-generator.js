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
    const { title, site, date, beforePhoto, afterPhoto, itemName, law, rules = [], statsText, inspector } = data;

    const rulesHtml = rules.length 
      ? rules.map((r, i) => `<li style="margin-bottom:6px; font-size:0.95rem; line-height:1.4;"><strong>${i + 1}.</strong> ${r}</li>`).join('')
      : '<li style="margin-bottom:6px; font-size:0.95rem;">작업 전 안전점검 철저 및 관리감독자 지휘 하에 작업 실시</li>';

    return `
      <div id="eduCardContainer" style="
        width: 650px;
        background: #ffffff;
        border: 2px solid #1e3a8a;
        border-radius: 12px;
        padding: 24px;
        font-family: -apple-system, BlinkMacSystemFont, 'Pretendard', sans-serif;
        color: #1e293b;
        box-shadow: 0 10px 25px rgba(0,0,0,0.1);
        box-sizing: border-box;
      ">
        <!-- 헤더 -->
        <div style="border-bottom: 3px solid #1e3a8a; padding-bottom: 12px; margin-bottom: 18px; display:flex; justify-content:space-between; align-items:flex-end;">
          <div>
            <div style="font-size: 0.85rem; font-weight:700; color:#dc2626; letter-spacing: 1px; margin-bottom:4px;">🚨 현장 패트롤 특별 안전교육</div>
            <h1 style="margin:0; font-size: 1.55rem; color:#1e3a8a; font-weight:800; line-height:1.2;">${title || '비계 작업발판 안전수칙 준수'}</h1>
          </div>
          <div style="text-align:right; font-size:0.8rem; color:#64748b;">
            <div><strong>현장명:</strong> ${site || '전 현장'}</div>
            <div><strong>발행일:</strong> ${date || '2026.10'} | <strong>점검:</strong> ${inspector || '안전관리자'}</div>
          </div>
        </div>

        <!-- 사진 비교 섹션 (Before / After) -->
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 18px;">
          <!-- 위험 지적 사례 -->
          <div style="border: 2px solid #fee2e2; border-radius: 8px; overflow: hidden; background: #fff5f5;">
            <div style="background: #dc2626; color: white; text-align: center; font-weight: 700; padding: 6px; font-size: 0.9rem;">
              ❌ 위험 지적 사례 (Before)
            </div>
            <div style="aspect-ratio: 4/3; background: #e2e8f0; display:flex; align-items:center; justify-content:center; overflow:hidden;">
              ${beforePhoto ? `<img src="${beforePhoto}" style="width:100%; height:100%; object-fit:cover;">` : '<span style="color:#94a3b8; font-size:0.85rem;">부적합 사진 없음</span>'}
            </div>
            <div style="padding: 8px; font-size: 0.82rem; color: #991b1b; font-weight:600; text-align:center;">
              ${itemName || '안전시설 미설치'}
            </div>
          </div>

          <!-- 올바른 조치 사례 -->
          <div style="border: 2px solid #dcfce7; border-radius: 8px; overflow: hidden; background: #f0fdf4;">
            <div style="background: #16a34a; color: white; text-align: center; font-weight: 700; padding: 6px; font-size: 0.9rem;">
              ✅ 올바른 개선 조치 (After)
            </div>
            <div style="aspect-ratio: 4/3; background: #e2e8f0; display:flex; align-items:center; justify-content:center; overflow:hidden;">
              ${afterPhoto ? `<img src="${afterPhoto}" style="width:100%; height:100%; object-fit:cover;">` : '<span style="color:#94a3b8; font-size:0.85rem;">개선 조치 완료 사진</span>'}
            </div>
            <div style="padding: 8px; font-size: 0.82rem; color: #166534; font-weight:600; text-align:center;">
              규정 규격 부재 설치 및 보강 완료
            </div>
          </div>
        </div>

        <!-- 핵심 통계 한 줄 요약 -->
        <div style="background: #f8fafc; border-left: 5px solid #f59e0b; padding: 10px 14px; border-radius: 4px; margin-bottom: 18px; font-size: 0.88rem; color: #334155;">
          📊 <strong>패트롤 통계 시사점:</strong> ${statsText || '해당 위험요인은 최근 패트롤 지적의 45%를 차지하고 있습니다. 각별한 주의가 요구됩니다.'}
        </div>

        <!-- 근로자 행동 수칙 (3대 수칙) -->
        <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 14px 18px; margin-bottom: 14px;">
          <div style="font-weight: 800; font-size: 1rem; color: #1e3a8a; margin-bottom: 10px; display:flex; align-items:center; gap:6px;">
            <span>🛡️</span> <span>근로자 필독! 이것만은 꼭 지킵시다</span>
          </div>
          <ul style="margin: 0; padding-left: 18px; color: #1e293b;">
            ${rulesHtml}
          </ul>
        </div>

        <!-- 법적 근거 및 서명 안내 -->
        <div style="display:flex; justify-content:space-between; align-items:center; font-size: 0.78rem; color: #64748b; border-top: 1px solid #e2e8f0; padding-top: 10px;">
          <div>📖 <strong>관련 법규:</strong> ${law || '산업안전보건기준에 관한 규칙 준수'}</div>
          <div>안전은 타협하지 않습니다. 근로자 여러분의 안전이 최우선입니다.</div>
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

    const link = document.createElement('a');
    link.download = filename;
    link.href = canvas.toDataURL('image/png');
    link.click();
  }

  return {
    renderTemplate,
    downloadAsImage
  };
});
