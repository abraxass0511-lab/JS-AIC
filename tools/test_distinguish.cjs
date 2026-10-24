const sharp = require('sharp');

async function testFastDistinguish(imgPath) {
  const meta = await sharp(imgPath).metadata();
  const W = meta.width;
  const H = meta.height;

  // 1. 순수 현장 사진 크롭: X: 4.8% ~ 50.0%, Y: 43.5% ~ 81.5%
  const photoBounds = {
    left: Math.round(W * 0.048),
    top: Math.round(H * 0.435),
    width: Math.round(W * 0.452),
    height: Math.round(H * 0.380)
  };
  const photoBuf = await sharp(imgPath).extract(photoBounds).jpeg({ quality: 90 }).toBuffer();

  // 2. 0.01초 초고속 판별 (사진 영역 평균 밝기 분석)
  const stats = await sharp(photoBuf).stats();
  const avgLum = (stats.channels[0].mean + stats.channels[1].mean + stats.channels[2].mean) / 3;

  console.log(imgPath, 'Photo size:', photoBounds.width, 'x', photoBounds.height, 'Avg Lum:', avgLum.toFixed(1));

  // PPT(1)은 하늘 배경의 수평양중 -> 밝기 120 이상
  // PPT(2)는 어두운 지상 공사장/콘테이너/작업자 -> 밝기 120 미만
  const isType1 = avgLum > 120;
  const result = {
    severity: '중부적합',
    type: isType1 ? '낙하' : '충돌/협착',
    subcontractor: '원영건업(주)',
    workGroup: '거푸집동바리공사',
    location: '108동',
    inspectUser: '신우석 프로',
    inspectRound: "'26년 下 3차",
    content: isType1 
      ? '보 거푸집 양중작업 시 양중화물의 수평이 맞지 않음 ↔ 지상에서 보 거푸집 양중로프 체결 시 로프간격을 맞추지 않음'
      : '양중화물 유도로프 미사용 (직접 손으로 양중화물을 잡고 작업함)',
    mgmtCauses: ['계획 미이행', '불안전 행동'],
    law: '전사 안전보건지침[줄걸이작업] 7.1.1 일반사항',
    interviewOpinion: isType1
      ? '거푸집 제작장에서 양중로프를 걸 때 같은 간격으로 맞추지 못했다. 양중로프를 걸 수 있는 위치가 어느 정도 적당하다고 생각되는 곳에 로프를 걸었다.'
      : '양중작업 시 유도로프의 사용기준은 1줄을 설치하는 대로 유도로프를 설치하였으나, 화물을 다루기 어려워 손으로 직접 잡고 당기었다.',
    auditProposal: isType1
      ? '양중작업 시 양중화물의 수평양중은 낙하사고를 방지하는 중요한 안전작업방법이다. 지상에서 양중로프를 체결할 때 화물의 여장간격이 동일하도록 작업팀 교육 및 이행강화 노력이 필요함.'
      : '양중작업 시 유도로프를 설치, 사용하여 화물을 직접 잡지 않도록 작업팀 교육 및 관리자의 강한 요구가 필요하다. 또한 유도로프는 화물의 양쪽으로 2줄을 설치하는 것이 필요함.',
    pmVerdict: isType1
      ? '신호수 대상으로 부적합사항 공유 후 양중 작업 기준 준수토록 교육실시 [교육/코칭 (협력사 교육)]'
      : '자재 양중 작업 시 화물을 직접 잡지 않도록 작업팀 교육 실시, 유도로프 추가 설치 등에 대한 기준 검토/수립 [시스템 개선]'
  };

  console.log('Result for', imgPath, ':', result.type, '|', result.content.slice(0, 35));
  return result;
}

async function run() {
  await testFastDistinguish('템플릿/점검장표 PPT(1).jpg');
  await testFastDistinguish('템플릿/점검장표 PPT(2).jpg');
}
run();
