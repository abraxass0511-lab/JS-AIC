const fs = require('fs');
const path = require('path');
const PptxGenJS = require('pptxgenjs');

// Mock localStorage
globalThis.localStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {}
};

const pptGenPath = path.join(__dirname, '..', 'app', 'js', 'ppt-generator.js');
const pptGenCode = fs.readFileSync(pptGenPath, 'utf8');

const mockModule = { exports: {} };
const fn = new Function('module', 'exports', 'PptxGenJS', pptGenCode);
fn(mockModule, mockModule.exports, PptxGenJS);
const SafePPT = mockModule.exports;

async function renderReal() {
  const p1 = 'C:/Users/YS/.gemini/antigravity-ide/brain/c3ddbf24-c3a5-4c0c-ab10-80ecb437b472/.tempmediaStorage/media_1793399034211.jpg';
  const p2 = 'C:/Users/YS/.gemini/antigravity-ide/brain/c3ddbf24-c3a5-4c0c-ab10-80ecb437b472/.tempmediaStorage/media_1793399439680.jpg';

  const b64_1 = 'data:image/jpeg;base64,' + fs.readFileSync(p1).toString('base64');
  const b64_2 = 'data:image/jpeg;base64,' + fs.readFileSync(p2).toString('base64');

  const rec = {
    content: '보 거푸집 양중작업 시 양중화물의 수평이 맞지 않음 ↔ 지상에서 보 거푸집 양중로프 체결 시 로프간격을 맞추지 않음',
    subcontractor: '원영건업(주)',
    workGroup: '거푸집동바리공사',
    location: '108동',
    inspector: '신우석 프로',
    inspectRound: "'26년 下 3차",
    severity: '중부적합',
    type: '낙하',
    mgmtCauses: ['계획 미이행', '불안전 행동'],
    holdPoint: true,
    interviewOpinion: '거푸집 제작장에서 양중로프를 걸 때 같은 간격으로 맞추지 못했다. 양중로프를 걸 수 있는 위치가 어느 정도 적당하다고 생각되는 곳에 로프를 걸었다.',
    auditProposal: '양중작업 시 양중화물의 수평양중은 낙하사고를 방지하는 중요한 안전작업방법이다. 지상에서 양중로프를 체결할 때 화물의 여장간격이 동일하도록 작업팀 교육 및 이행강화 노력이 필요함. 또한 원인이 되는 자재 적재방법 고려 필요.',
    countermeasure: '- 신호수 대상으로 부적합사항 공유 후 양중 작업 기준 준수토록 교육실시\n- 동일사항 적발 시 신호수 자격 박탈',
    pmVerdictType: '교육/코칭',
    pmVerdictSub: '(협력사 교육)'
  };

  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: 'WIDE_16_9', width: 13.333, height: 7.5 });
  pptx.layout = 'WIDE_16_9';

  let callCount = 0;
  await SafePPT.addInspectionSheetSlide(pptx, rec, {
    loadPhotoBase64: async () => {
      callCount++;
      return callCount === 1 ? b64_1 : b64_2;
    },
    includePostActions: true
  });

  const pptxPath = path.join(__dirname, 'single_banner_2_photos.pptx');
  await pptx.writeFile({ fileName: pptxPath });
  console.log('Saved PPTX to:', pptxPath);
}

renderReal().catch(console.error);
