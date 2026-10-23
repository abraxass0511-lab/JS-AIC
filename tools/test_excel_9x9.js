import fs from 'fs';
import path from 'path';
import ExcelJS from 'exceljs';

// Load SafeExcel UMD module
const excelBuilderCode = fs.readFileSync('app/js/excel-builder.js', 'utf8');
const fn = new Function('globalThis', excelBuilderCode + '\nreturn globalThis.SafeExcel;');
const SafeExcel = fn(globalThis);

// Load taxonomies
const taxonomy = JSON.parse(fs.readFileSync('app/data/taxonomy.json', 'utf8'));
const taxonomy9x9 = JSON.parse(fs.readFileSync('app/data/taxonomy_9x9.json', 'utf8'));

// Sample records
const records = [
  {
    id: 'test-1',
    site: '반포 아파트 재건축',
    productType: '공동주택',
    progressRate: 45,
    stage: '지상 골조 및 외부 가설 단계',
    severity: '중부적합',
    subcontractor: '대한가설(주)',
    inspectRound: '1차',
    content: '시스템비계 3단 작업발판 단부 안전난간대 미설치로 인한 추락 위험',
    location: '104동 3층 외부',
    workName: '비계설치해체작업',
    workGroup: '가설공사',
    kind: '가시설',
    item: '시스템비계',
    agent: '안전난간',
    type: '추락',
    condition: '안전난간 미설치',
    action: '해당없음',
    matrixArea: '가시설',
    matrixTarget: '비계',
    matrixSpec: '시스템비계',
    rootCauseMgmt: '안전시설 미설치',
    rootCauseSystem: '실행: 안전시설 미설치',
    stakeholder: '시공담당',
    mgmtCauses: ['불안전 상태'],
    holdPoint: true,
    interviewOpinion: '작업자 출입 편의를 위해 임의 해체함',
    auditProposal: '안전난간 즉시 복구 및 임의 해체 방지 교육',
    pmVerdict: '즉시 시정 및 모니터링 강화',
    law: '산업안전보건기준에 관한 규칙 제56조(작업발판의 구조)',
    causes: ['물적', '관리적'],
    inspectedDate: '2026-10-18',
    inspector: '점검자1',
    photos: ['samples/sample_before.jpg', 'samples/sample_after.jpg'],
    fix: {
      content: '안전난간대 상부/중간난간대 표준규격으로 즉시 재설치 및 점검 완료',
      photo: 'samples/sample_after.jpg',
      date: '2026-10-18'
    }
  },
  {
    id: 'test-2',
    site: '판교 오피스 신축공사',
    productType: '오피스/지식산업센터',
    progressRate: 20,
    stage: '지하 골조 공사 단계',
    severity: '중부적합',
    subcontractor: '태양전기(주)',
    content: '지하 분전반 외함 접지 미실시 및 전선 피복 손상 누전 위험',
    location: '지하실',
    workName: '설치조립작업',
    workGroup: '전기/통신공사',
    agent: '접지선',
    type: '감전',
    condition: '접지시설 미설치/불량',
    action: '해당없음',
    rootCauseMgmt: '작업 전 전원 미차단',
    rootCauseSystem: '확인: 일일점검 미실시',
    mgmtCauses: ['불안전 상태', '계획 미이행'],
    interviewOpinion: '임시 전원 배선 작업 중 미처 연결하지 못함',
    inspectorOpinionType: '시스템 개선',
    auditProposal: '외함 접지 즉시 체결 및 누전차단기 정상동작 점검',
    law: '산업안전보건기준에 관한 규칙 제302조(전기 기계·기구의 접지)',
    causes: ['물적'],
    inspectedDate: '2026-10-18',
    inspector: '점검자2',
    photos: ['samples/sample_before.jpg']
  }
];

async function run() {
  console.log('Building Excel workbook with SafeExcel...');
  const wb = await SafeExcel.build(ExcelJS, {
    records,
    taxonomy,
    customValues: {},
    sites: [{ name: '반포 아파트 재건축' }, { name: '판교 오피스 신축공사' }],
    emptyRows: 5,
    loadImage: async (p) => {
      try {
        const candidates = [p, path.join('app', p), path.join('samples/photos', path.basename(p))];
        for (const c of candidates) {
          if (fs.existsSync(c)) {
            const buf = fs.readFileSync(c);
            return { base64: buf.toString('base64'), extension: 'jpeg' };
          }
        }
      } catch (e) {}
      return null;
    }
  });

  const sheet1 = wb.getWorksheet('부적합사항대장');
  const sheet2 = wb.getWorksheet('건설안전 9×9단');

  console.log('Sheet 1 (부적합사항대장) Row Count:', sheet1.rowCount, 'Col Count:', sheet1.columnCount);
  console.log('Sheet 2 (건설안전 9×9단) Row Count:', sheet2.rowCount, 'Col Count:', sheet2.columnCount);

  // Inspect Row 3 values in Sheet 1
  const r3 = sheet1.getRow(3);
  console.log('Row 3 sample values:');
  for (let c = 1; c <= 25; c++) {
    const colHeader = sheet1.getRow(2).getCell(c).value;
    const val = r3.getCell(c).value;
    if (['내용', '점검영역', '점검대상', '가시설상세', '법적 관리감독', '안전시스템', '관리/책임주체'].includes(colHeader)) {
      console.log(`  Col ${c} [${colHeader}]: "${val}"`);
    }
  }

  // Save to test file
  const outPath = 'tools/output_test_9x9.xlsx';
  await wb.xlsx.writeFile(outPath);
  console.log(`Saved successfully to ${outPath}!`);
}

run().catch(console.error);
