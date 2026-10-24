import fs from 'fs';

const FILE_PATH = 'app/data/2026/index/2026-10.json';
const data = JSON.parse(fs.readFileSync(FILE_PATH, 'utf8'));

const MAPPING = {
  '20261019-143126-yrnw': {
    location: '계단·복도',
    locationDetail: '103동 지하1층 바닥 안전통로',
    workGroup: '철근콘크리트공사',
    workMethod: '설치조립작업',
    workName: '거푸집설치작업',
    agent: '거푸집',
    type: '넘어짐(전도: 사람)',
    mgmtCauses: ['불안전 상태', '계획 미이행']
  },
  '20261017-131410-o404': {
    location: '본구조물',
    locationDetail: '108동',
    workGroup: '철근콘크리트공사',
    workMethod: '양중작업',
    workName: '거푸집 양중작업',
    agent: '거푸집',
    type: '떨어짐(낙하/비래)/맞음',
    mgmtCauses: ['계획 미이행', '불안전 행동', '불안전 상태']
  },
  '20261013-105753-xx55': {
    location: '계단·복도',
    locationDetail: '106동, 지하1층 계단실',
    workGroup: '가설공사',
    workMethod: '설치조립작업',
    workName: '가설전기 설치작업',
    agent: '전등',
    type: '넘어짐(전도: 사람)',
    mgmtCauses: ['계획 미이행', '불안전 상태']
  },
  '20261013-052922-wct9': {
    location: '가설물',
    locationDetail: '106동 워킹타워',
    workGroup: '가설공사',
    workMethod: '하역운반작업',
    workName: '자재 운반작업',
    agent: '통로',
    type: '떨어짐(낙하/비래)/맞음',
    mgmtCauses: ['계획 미수립', '불안전 상태']
  },
  '20261010-154503-eto9': {
    location: '본구조물',
    locationDetail: '2층 하역장 상부 바닥 개구부',
    workGroup: '철골공사',
    workMethod: '고소작업',
    workName: '데크플레이트 설치작업',
    agent: '개구부',
    type: '떨어짐(추락, 사람)',
    mgmtCauses: ['불안전 상태', '계획 미이행']
  },
  '20261010-154407-ippb': {
    location: '실내 작업장',
    locationDetail: '터빈동',
    workGroup: '가설공사',
    workMethod: '고소작업',
    workName: '비계설치작업',
    agent: '안전대',
    type: '떨어짐(추락, 사람)',
    mgmtCauses: ['계획 미수립', '불안전 행동', '불안전 상태']
  },
  '20261007-154928-jirq': {
    location: '본구조물',
    locationDetail: '304동',
    workGroup: '마감공사',
    workMethod: '고소작업',
    workName: '창호설치작업',
    agent: '단부',
    type: '떨어짐(추락, 사람)',
    mgmtCauses: ['계획 미수립', '불안전 행동', '불안전 상태']
  },
  '20261007-103133-no2g': {
    location: '야적장',
    locationDetail: '지상층 자재야적장',
    workGroup: '공통',
    workMethod: '하역운반작업',
    workName: '소방자재 관리',
    agent: '소화기',
    type: '화재/폭발',
    mgmtCauses: ['불안전 상태', '계획 미이행']
  },
  '20261007-102434-qbzv': {
    location: '본구조물',
    locationDetail: '303동',
    workGroup: '설비·전기공사',
    workMethod: '설치조립작업',
    workName: '가설전기 배선작업',
    agent: '멀티작업선',
    type: '감전',
    mgmtCauses: ['불안전 상태', '계획 미이행']
  },
  '20261007-101327-ayo4': {
    location: '본구조물',
    locationDetail: '303동 (303EHD)',
    workGroup: '설비·전기공사',
    workMethod: '설치조립작업',
    workName: '가설전기 설치작업',
    agent: '멀티작업선',
    type: '감전',
    mgmtCauses: ['불안전 상태', '계획 미이행']
  },
  '20261007-100241-omld': {
    location: '지하실',
    locationDetail: '지하주차장 1층',
    workGroup: '철근콘크리트공사',
    workMethod: '고소작업',
    workName: 'PC설치작업',
    agent: '안전대',
    type: '떨어짐(추락, 사람)',
    mgmtCauses: ['불안전 행동', '계획 미이행']
  },
  '20261007-095840-cavm': {
    location: '가설물',
    locationDetail: '206동 갱폼',
    workGroup: '철근콘크리트공사',
    workMethod: '양중작업',
    workName: '갱폼인양작업',
    agent: '낙하물',
    type: '떨어짐(낙하/비래)/맞음',
    mgmtCauses: ['불안전 상태', '계획 미이행']
  },
  '20261007-095104-dmw1': {
    location: '가설물',
    locationDetail: '206동 갱폼',
    workGroup: '철근콘크리트공사',
    workMethod: '해체작업',
    workName: '갱폼 해체작업',
    agent: '연결핀(연결조인트)',
    type: '무너짐(붕괴, 도괴)/깔림',
    mgmtCauses: ['불안전 행동', '계획 미이행']
  },
  '20261007-093358-m1r0': {
    location: '본구조물',
    locationDetail: '104동 14층',
    workGroup: '철근콘크리트공사',
    workMethod: '설치조립작업',
    workName: '거푸집동바리 설치작업',
    agent: '동바리',
    type: '무너짐(붕괴, 도괴)/깔림',
    mgmtCauses: ['불안전 상태', '계획 미이행']
  },
  '20261007-093025-feh7': {
    location: '실외 작업장',
    locationDetail: '104동 지상층 펌프카 작업구역',
    workGroup: '철근콘크리트공사',
    workMethod: '중량물취급작업',
    workName: '콘크리트 타설작업',
    agent: '펌프카',
    type: '떨어짐(낙하/비래)/맞음',
    mgmtCauses: ['계획 미수립', '불안전 행동', '불안전 상태']
  },
  '20261007-091755-621o': {
    location: '가설물',
    locationDetail: '102동 말비계',
    workGroup: '가설공사',
    workMethod: '고소작업',
    workName: '말비계 작업',
    agent: '말비계',
    type: '떨어짐(추락, 사람)',
    mgmtCauses: ['불안전 상태', '불안전 행동']
  },
  '20261007-090907-40b5': {
    location: '천장 내부',
    locationDetail: '104동 필로티 천장',
    workGroup: '설비·전기공사',
    workMethod: '고소작업',
    workName: '천장 배선작업',
    agent: '말비계',
    type: '떨어짐(추락, 사람)',
    mgmtCauses: ['불안전 행동', '불안전 상태']
  },
  '20261003-162535-q2u3': {
    location: '가설물',
    locationDetail: '106동 외부 비계',
    workGroup: '가설공사',
    workMethod: '고소작업',
    workName: '비계설치작업',
    agent: '상부난간대',
    type: '떨어짐(추락, 사람)',
    mgmtCauses: ['계획 미수립', '불안전 상태']
  }
};

let updatedCount = 0;
data.records.forEach(r => {
  if (MAPPING[r.id]) {
    const m = MAPPING[r.id];
    Object.assign(r, m);
    r.updatedAt = new Date().toISOString();
    updatedCount++;
  }
});

data.updatedAt = new Date().toISOString();
fs.writeFileSync(FILE_PATH, JSON.stringify(data, null, 2), 'utf8');
console.log(`Successfully migrated ${updatedCount} records in ${FILE_PATH}`);

// Also upload to Cloudflare Worker relay
async function uploadToCloud() {
  const RELAY_BASE = 'https://safepatrol-relay.abraxass0511.workers.dev';
  const PIN = '111111';
  const url = `${RELAY_BASE}/file?path=data/2026/index/2026-10.json`;
  
  console.log(`Uploading updated index to ${url}...`);
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-PIN': PIN
    },
    body: JSON.stringify(data)
  });
  
  const text = await res.text();
  console.log(`Upload response: [${res.status}] ${text}`);
}

uploadToCloud().catch(err => {
  console.error('Upload error:', err);
});
