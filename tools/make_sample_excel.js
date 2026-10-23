/**
 * 부적합사항대장 샘플 엑셀 생성 스크립트
 * - app/js/excel-builder.js 의 SafeExcel 엔진 기반
 * - 2026 최신 안전점검 표준 규격 반영
 */
import path from 'path';
import fs from 'fs';
import ExcelJS from 'exceljs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT = path.join(__dirname, '..');
const excelBuilderCode = fs.readFileSync(path.join(ROOT, 'app', 'js', 'excel-builder.js'), 'utf8');
const fn = new Function('globalThis', excelBuilderCode + '\nreturn globalThis.SafeExcel;');
const SafeExcel = fn(globalThis);

const tax = JSON.parse(fs.readFileSync(path.join(ROOT, 'app', 'data', 'taxonomy.json'), 'utf8'));
const OUT = path.join(ROOT, 'samples', '부적합사항대장_샘플.xlsx');

const SITES = [
  { name: '송도1 (S1)', progress: '35%' },
  { name: '송도2 (S2)', progress: '50%' },
  { name: '반포3 (B3)', progress: '45%' },
  { name: '방화6 (B6)', progress: '15%' },
  { name: '아파트1', progress: '15%' }
];

const SAMPLE_RECORDS = [
  {
    id: 'sample-1',
    site: '송도1 (S1)',
    productType: '공동주택',
    progressRate: 35,
    stage: '지상 골조 및 외부 가설 단계',
    severity: '중부적합',
    subcontractor: '대한가설(주)',
    content: '시스템비계 3단 작업발판 단부 안전난간대 미설치 및 수평재 결속 누락',
    location: '가설물',
    workGroup: '가설공사',
    workMethod: '고소작업',
    type: '떨어짐(추락, 사람)',
    agent: '시스템비계',
    law: '산안규칙 제56조(작업발판의 구조)',
    condition: '안전방호장치의 결함 (미설치·해체·불량)',
    action: '위험장소 접근 및 방치',
    rootCauseMgmt: '안전시설 미설치',
    rootCauseSystem: '실행: 안전시설 미설치',
    mgmtCauses: ['불안전 상태', '계획 미이행'],
    interviewOpinion: '작업자 자재 반입 편의를 위해 임의 해체함',
    inspectorOpinionType: '교육/코칭',
    auditProposal: '즉시 안전난간 원상복구 및 작업팀 임의해체 방지 TBM 교육',
    photos: ['app/samples/sample_before.jpg', 'app/samples/sample_after.jpg'],
    fix: {
      content: '안전난간대 상부/중간난간대 표준규격으로 즉시 재설치 및 점검 완료',
      photo: 'app/samples/sample_after.jpg',
      fixedDate: '2026-10-24'
    },
    inspectedDate: '2026-10-24',
    inspector: '관리자'
  },
  {
    id: 'sample-2',
    site: '방화6 (B6)',
    productType: '공동주택',
    progressRate: 15,
    stage: '지하 골조 공사 단계',
    severity: '중부적합',
    subcontractor: '신세계건업',
    content: '보 거푸집 양중 시 2줄걸이 수평양중 미실시 및 인양 하부 통제 불량',
    location: '본구조물',
    workGroup: '철근콘크리트공사',
    workMethod: '양중작업',
    type: '떨어짐(낙하/비래)/맞음',
    agent: '타워크레인/양중자재',
    law: '산안규칙 제38조(사전조사 및 작업계획서의 작성 등)',
    condition: '작업방법의 부적절',
    action: '불안전한 동작 및 통제 미준수',
    rootCauseMgmt: '작업지휘자 미배치',
    rootCauseSystem: '계획: 중점위험작업 안전대책 미수립/미승인',
    mgmtCauses: ['계획 미수립', '불안전 행동'],
    interviewOpinion: '시간 단축을 위해 1줄걸이로 신속 인양 시도함',
    inspectorOpinionType: '페널티',
    auditProposal: '즉시 작업 중지 및 2줄걸이 수평양중 절차 준수 확인 후 재개',
    photos: ['app/samples/sample_before.jpg'],
    inspectedDate: '2026-10-24',
    inspector: '점검자1'
  }
];

async function generate() {
  console.log('Generating samples/부적합사항대장_샘플.xlsx...');
  const wb = await SafeExcel.build(ExcelJS, {
    records: SAMPLE_RECORDS,
    taxonomy: tax,
    customValues: {},
    sites: SITES,
    emptyRows: 15,
    loadImage: async (p) => {
      try {
        const fullPath = path.isAbsolute(p) ? p : path.join(ROOT, p);
        if (fs.existsSync(fullPath)) {
          const buf = fs.readFileSync(fullPath);
          return { base64: buf.toString('base64'), extension: 'jpeg' };
        }
      } catch (e) {}
      return null;
    }
  });

  await wb.xlsx.writeFile(OUT);
  console.log(`Generated successfully: ${OUT}`);
}

generate().catch(console.error);
