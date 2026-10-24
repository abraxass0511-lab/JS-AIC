import fs from 'fs';
import path from 'path';

const indexPath = 'app/data/2026/index/2026-10.json';
const indexData = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
const recDir = 'app/data/2026/records/10';

if (!fs.existsSync(recDir)) {
  fs.mkdirSync(recDir, { recursive: true });
}

// 9x9 정규 매핑 표
const STANDARD_MAPPINGS = {
  '20261019-143126-yrnw': {
    agentMajor: '가시설',
    agentMid: '거푸집',
    agentMinor: '유로폼',
    kind: '가시설',
    item: '거푸집',
    agent: '유로폼'
  },
  '20261017-131410-o404': {
    agentMajor: '가시설',
    agentMid: '거푸집',
    agentMinor: '유로폼',
    kind: '가시설',
    item: '거푸집',
    agent: '유로폼'
  },
  '20261013-105753-xx55': {
    agentMajor: '전기시설',
    agentMid: '전등시설',
    agentMinor: '투광등',
    kind: '전기시설',
    item: '전등시설',
    agent: '투광등'
  },
  '20261013-052922-wct9': {
    agentMajor: '가시설',
    agentMid: '안전시설',
    agentMinor: '낙하방지시설(방호선반)',
    kind: '가시설',
    item: '안전시설',
    agent: '낙하방지시설'
  },
  '20261010-154503-eto9': {
    agentMajor: '가시설',
    agentMid: '안전시설',
    agentMinor: '추락방지시설(덮개)',
    kind: '가시설',
    item: '안전시설',
    agent: '덮개'
  },
  '20261010-154407-ippb': {
    agentMajor: 'PPE',
    agentMid: '안전대',
    agentMinor: '안전대(그네식)',
    kind: 'PPE',
    item: '안전대',
    agent: '안전대'
  },
  '20261007-154928-jirq': {
    agentMajor: '가시설',
    agentMid: '안전시설',
    agentMinor: '추락방지시설(안전대걸이시설)',
    kind: '가시설',
    item: '안전시설',
    agent: '안전대걸이시설'
  },
  '20261007-103133-no2g': {
    agentMajor: '소방시설',
    agentMid: '소화시설',
    agentMinor: '분말소화기',
    kind: '소방시설',
    item: '소화시설',
    agent: '소화기'
  },
  '20261007-102434-qbzv': {
    agentMajor: '전기시설',
    agentMid: '누전차단기',
    agentMinor: '가설전선/이동릴선',
    kind: '전기시설',
    item: '누전차단기',
    agent: '누전차단기'
  },
  '20261007-101327-ayo4': {
    agentMajor: '전기시설',
    agentMid: '누전차단기',
    agentMinor: '가설전선/이동릴선',
    kind: '전기시설',
    item: '누전차단기',
    agent: '누전차단기'
  },
  '20261007-100241-omld': {
    agentMajor: '가시설',
    agentMid: '안전시설',
    agentMinor: '추락방지시설(안전대걸이시설)',
    kind: '가시설',
    item: '안전시설',
    agent: '안전대걸이시설'
  },
  '20261007-095840-cavm': {
    agentMajor: '가시설',
    agentMid: '거푸집',
    agentMinor: '갱폼',
    kind: '가시설',
    item: '거푸집',
    agent: '갱폼'
  },
  '20261007-095104-dmw1': {
    agentMajor: '가시설',
    agentMid: '거푸집',
    agentMinor: '갱폼',
    kind: '가시설',
    item: '거푸집',
    agent: '갱폼'
  },
  '20261007-093358-m1r0': {
    agentMajor: '가시설',
    agentMid: '동바리',
    agentMinor: '파이프서포트',
    kind: '가시설',
    item: '동바리',
    agent: '파이프서포트'
  },
  '20261007-093025-feh7': {
    agentMajor: '건설장비',
    agentMid: '생산장비',
    agentMinor: '펌프카',
    kind: '건설장비',
    item: '생산장비',
    agent: '펌프카'
  },
  '20261007-091755-621o': {
    agentMajor: '작업발판',
    agentMid: '말비계',
    agentMinor: '말비계',
    kind: '작업발판',
    item: '말비계',
    agent: '말비계'
  },
  '20261007-090907-40b5': {
    agentMajor: '작업발판',
    agentMid: '말비계',
    agentMinor: '말비계',
    kind: '작업발판',
    item: '말비계',
    agent: '말비계'
  },
  '20261003-162535-q2u3': {
    agentMajor: '가시설',
    agentMid: '안전시설',
    agentMinor: '추락방지시설(안전난간)',
    kind: '가시설',
    item: '안전시설',
    agent: '안전난간'
  }
};

// 1. Update indexData
indexData.records.forEach(r => {
  if (STANDARD_MAPPINGS[r.id]) {
    Object.assign(r, STANDARD_MAPPINGS[r.id]);
    r.updatedAt = new Date().toISOString();
  }
});
indexData.updatedAt = new Date().toISOString();
fs.writeFileSync(indexPath, JSON.stringify(indexData, null, 2), 'utf8');
console.log('Updated index:', indexPath);

// 2. Update/Create all individual record files
indexData.records.forEach(r => {
  const filePath = path.join(recDir, `${r.id}.json`);
  fs.writeFileSync(filePath, JSON.stringify(r, null, 2), 'utf8');
  console.log('Saved record file:', filePath);
});

// 3. Fix DEMO file if present
const demoPath = path.join(recDir, 'DEMO-202610-001.json');
if (fs.existsSync(demoPath)) {
  const demo = JSON.parse(fs.readFileSync(demoPath, 'utf8'));
  demo.agentMajor = '가시설';
  demo.agentMid = '비계';
  demo.agentMinor = '시스템비계';
  demo.kind = '가시설';
  demo.item = '비계';
  demo.agent = '시스템비계';
  fs.writeFileSync(demoPath, JSON.stringify(demo, null, 2), 'utf8');
  console.log('Fixed DEMO record file:', demoPath);
}
