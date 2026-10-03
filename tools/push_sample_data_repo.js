const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const targetDir = 'C:\\Users\\YS\\.gemini\\antigravity-ide\\brain\\c0c2a76e-6980-4d57-b9b5-d142769bbcf0\\scratch\\safepatrol-data';

if (fs.existsSync(targetDir)) {
  fs.rmSync(targetDir, { recursive: true, force: true });
}

console.log('Cloning safepatrol-data-2026...');
execSync(`git clone https://github.com/abraxass0511-lab/safepatrol-data-2026.git "${targetDir}"`, { stdio: 'inherit' });

// Ensure subdirectories
const dirs = [
  'config',
  'data/2026/index',
  'data/2026/records/10',
  'data/2026/photos/10'
];
dirs.forEach(d => fs.mkdirSync(path.join(targetDir, d), { recursive: true }));

// 1. config/sites.json
fs.writeFileSync(path.join(targetDir, 'config/sites.json'), JSON.stringify({
  sites: [
    { name: 'OO아파트 신축공사', progress: '45%', scale: '지하2층/지상25층 8개동', amount: '850억' },
    { name: 'OO물류센터 신축공사', progress: '62%', scale: '지상5층 연면적 6만㎡', amount: '620억' },
    { name: 'OO근린생활시설 신축공사', progress: '20%', scale: '지하1층/지상7층', amount: '95억' }
  ]
}, null, 2), 'utf8');

// 2. config/custom.json
fs.writeFileSync(path.join(targetDir, 'config/custom.json'), JSON.stringify({
  customValues: {}
}, null, 2), 'utf8');

// 3. sample records
const d1 = '2026-10-03';
const sample1 = {
  id: 'DEMO-202610-001',
  bucket: '2026-10',
  site: 'OO아파트 신축공사',
  content: '비계시설 작업발판 안전난간대 미설치 및 단부 추락 방호조치 미흡',
  location: '106동 5층 외부비계',
  workName: '외부비계설치',
  workGroup: '가설공사',
  kind: '가설공사',
  item: '비계',
  agent: '비계',
  type: '떨어짐',
  condition: '안전난간 미설치',
  action: '보호구 미착용',
  causes: ['물적', '인적'],
  workPlan: '미작성',
  basis: {
    ra: '미반영',
    cp: '미반영',
    st: '미실시',
    guide: 'KOSHA G-1-2023',
    law: '제13조(안전난간의 구조 및 설치요건)'
  },
  siteInfo: { progress: '45%', scale: '지하2층/지상25층 8개동', amount: '850억' },
  inspectedDate: d1,
  inspector: '점검자1',
  status: '조치완료',
  photos: ['data/2026/photos/10/DEMO-202610-001_p1.jpg'],
  fix: {
    content: '비계 상단 안전난간 및 발판 즉시 보강 설치 완료 및 작업팀 TBM 안전교육 실시',
    photo: 'data/2026/photos/10/DEMO-202610-001_fix.jpg',
    fixedDate: d1
  },
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
};

const sample2 = {
  id: 'DEMO-202610-002',
  bucket: '2026-10',
  site: 'OO물류센터 신축공사',
  content: '슬래브 개구부 단부 안전난간 및 덮개 미설치, 위험 경고표지 미부착',
  location: '2층 하역장 인근 슬래브',
  workName: '골조공사',
  workGroup: '골조공사',
  kind: '가설공사',
  item: '개구부',
  agent: '개구부',
  type: '떨어짐',
  condition: '개구부 방호조치 미흡',
  action: '위험장소 접근',
  causes: ['물적'],
  workPlan: '작성',
  basis: {
    ra: '반영',
    cp: '반영',
    st: '해당없음',
    guide: 'KOSHA G-2-2022',
    law: '제42조(추락 등의 위험 방지)'
  },
  siteInfo: { progress: '62%', scale: '지상5층 연면적 6만㎡', amount: '620억' },
  inspectedDate: d1,
  inspector: '점검자2',
  status: '미조치',
  photos: ['data/2026/photos/10/DEMO-202610-002_p1.jpg'],
  fix: { content: '', photo: null },
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
};

// data/2026/records/10/*.json
fs.writeFileSync(path.join(targetDir, 'data/2026/records/10/DEMO-202610-001.json'), JSON.stringify(sample1, null, 2), 'utf8');
fs.writeFileSync(path.join(targetDir, 'data/2026/records/10/DEMO-202610-002.json'), JSON.stringify(sample2, null, 2), 'utf8');

// data/2026/index/2026-10.json
fs.writeFileSync(path.join(targetDir, 'data/2026/index/2026-10.json'), JSON.stringify({
  bucket: '2026-10',
  updatedAt: new Date().toISOString(),
  records: [sample1, sample2]
}, null, 2), 'utf8');

// copy sample photos
const srcBefore = 'c:\\Users\\YS\\Desktop\\안티그래피티\\JS AIC\\app\\samples\\sample_before.jpg';
const srcAfter = 'c:\\Users\\YS\\Desktop\\안티그래피티\\JS AIC\\app\\samples\\sample_after.jpg';

if (fs.existsSync(srcBefore)) {
  fs.copyFileSync(srcBefore, path.join(targetDir, 'data/2026/photos/10/DEMO-202610-001_p1.jpg'));
  fs.copyFileSync(srcBefore, path.join(targetDir, 'data/2026/photos/10/DEMO-202610-002_p1.jpg'));
}
if (fs.existsSync(srcAfter)) {
  fs.copyFileSync(srcAfter, path.join(targetDir, 'data/2026/photos/10/DEMO-202610-001_fix.jpg'));
}

// README.md with explanation and bulk deletion instructions
const readmeContent = `# SafePatrol Data Repo 2026 (비공개 데이터 누적 저장소)

본 저장소는 **SafePatrol 현장 패트롤 부적합 관리 시스템**의 **100% 비공개(Private) 데이터베이스**입니다.
외부에는 공개되지 않으며, 관리자 권한을 가진 분만 열람 및 수정할 수 있습니다.

---

## 📁 저장소 폴더 구조 안내

\`\`\`
safepatrol-data-2026/
├── config/
│   ├── sites.json          # 현장명 목록 및 공사규모/공정률 메타데이터
│   └── custom.json         # 점검자가 직접 입력한 커스텀 항목(자동 학습 데이터)
└── data/
    └── 2026/
        ├── index/
        │   └── 2026-10.json # [★전체 대장] 2026년 10월 전체 부적합 목록 통합 색인
        ├── records/
        │   └── 10/          # 10월 건별 상세 JSON 기록 보관
        │       ├── DEMO-202610-001.json
        │       └── DEMO-202610-002.json
        └── photos/
            └── 10/          # 10월 현장 압축 사진 원본 (장당 ~150KB)
                ├── DEMO-202610-001_p1.jpg
                └── DEMO-202610-001_fix.jpg
\`\`\`

---

## 🗑️ 비공개 저장소에서 데이터 대량 삭제 방법

### 방법 1. 특정 월(Month) 전체 데이터 일괄 초기화
1. \`data/2026/records/10/\` 폴더 안의 파일들을 삭제하거나,
2. \`data/2026/index/2026-10.json\` 파일을 열고 상단 연필 아이콘(Edit)을 눌러 \`"records": []\` 로 비우고 커밋하면 해당 월의 전체 목록이 일괄 초기화됩니다.

### 방법 2. Git CLI를 통한 초고속 대량 삭제
로컬 컴퓨터에서 본 저장소를 클론받은 뒤:
\`\`\`bash
# 1) 특정 기간의 기록이나 사진 폴더 일괄 삭제
rm -rf data/2026/records/10/
rm -rf data/2026/photos/10/

# 2) 깃허브로 즉시 푸시
git add .
git commit -m "2026년 10월 테스트 데이터 대량 삭제"
git push origin main
\`\`\`
`;

fs.writeFileSync(path.join(targetDir, 'README.md'), readmeContent, 'utf8');

console.log('Committing and pushing to origin main...');
execSync(`git -C "${targetDir}" add .`, { stdio: 'inherit' });
execSync(`git -C "${targetDir}" commit -m "Initialize SafePatrol data structure with initial 2026-10 records and photos"`, { stdio: 'inherit' });
execSync(`git -C "${targetDir}" push origin main`, { stdio: 'inherit' });

console.log('Done!');
