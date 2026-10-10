/**
 * 단락(<a:p>) 단위 정밀 텍스트 및 사진 교체 스크립트
 */
import fs from 'fs';
import JSZip from 'jszip';

function replaceInPara(paraXml, newText) {
  // 첫 번째 <a:t> 태그에 새 텍스트를 넣고, 나머지 <a:t> 태그들은 비움
  let firstDone = false;
  return paraXml.replace(/<a:t>([^<]*)<\/a:t>/g, () => {
    if (!firstDone) {
      firstDone = true;
      return `<a:t>${newText}</a:t>`;
    }
    return `<a:t></a:t>`;
  });
}

async function createSample(sourcePptx, outPptx, paraMap, imagePath) {
  const data = fs.readFileSync(sourcePptx);
  const zip = await JSZip.loadAsync(data);
  let slideXml = await zip.file('ppt/slides/slide1.xml').async('string');

  // 단락 추출 및 교체
  const paras = slideXml.match(/<a:p[\s\S]*?<\/a:p>/g) || [];
  paras.forEach((p, idx) => {
    if (paraMap[idx] !== undefined) {
      const updated = replaceInPara(p, paraMap[idx]);
      slideXml = slideXml.replace(p, updated);
    }
  });

  // 사진 주입
  if (imagePath && fs.existsSync(imagePath)) {
    const imgData = fs.readFileSync(imagePath);
    zip.file('ppt/media/image1.jpeg', imgData);

    let relsXml = await zip.file('ppt/slides/_rels/slide1.xml.rels').async('string');
    if (!relsXml.includes('image1.jpeg')) {
      relsXml = relsXml.replace(
        '</Relationships>',
        '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image1.jpeg"/></Relationships>'
      );
      zip.file('ppt/slides/_rels/slide1.xml.rels', relsXml);
    }

    if (!slideXml.includes('name="현장사진1"')) {
      const picXml = `
        <p:pic xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
          <p:nvPicPr>
            <p:cNvPr id="999" name="현장사진1"/>
            <p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr>
            <p:nvPr/>
          </p:nvPicPr>
          <p:blipFill>
            <a:blip r:embed="rId2"/>
            <a:stretch><a:fillRect/></a:stretch>
          </p:blipFill>
          <p:spPr>
            <a:xfrm>
              <a:off x="500000" y="2700000"/>
              <a:ext cx="4600000" cy="3800000"/>
            </a:xfrm>
            <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
          </p:spPr>
        </p:pic>
      `;
      slideXml = slideXml.replace('</p:spTree>', `${picXml}</p:spTree>`);
    }
  }

  zip.file('ppt/slides/slide1.xml', slideXml);
  const buffer = await zip.generateAsync({ type: 'nodebuffer' });
  fs.writeFileSync(outPptx, buffer);
  console.log(`✅ 생성 완료: ${outPptx}`);
}

async function main() {
  const basePptx = '부적합 장표.pptx';

  // 샘플 1: 아파트 시스템비계 중부적합
  const sample1Map = {
    21: '추락',
    22: '[중부적합]',
    25: '산업안전보건기준에 관한 규칙 제56조(작업발판의 구조), 제13조(안전난간의 구조 및 요건)',
    3: '협력사 : (주)삼우가설이엔지',
    4: '공종명 : 가설공사 (시스템비계)',
    5: '작업장소 : 103동 외벽 5층 슬래브 단부',
    6: '점검자 : 김안전 과장',
    7: '점검차수 : 2차',
    9: '부적합 내용 : ① 시스템비계 5층 작업발판 단부에 상부·중간 안전난간대 미설치',
    10: '② 작업발판 고정 수평재 누락으로 근로자 추락 위험 상존',
    28: '□ 계획 미수립 ■ 계획 미이행',
    29: '□ 불안전 행동 ■ 불안전 상태',
    48: '■ Hold Point 위반',
    30: '[ 의견 : 시공관리자 및 근로자 ] 자재 양중을 위해 작업자가 안전난간대를 임의 해체 후 미복구한 상태에서 작업을 진행함',
    35: '[점검단 제안] 시스템비계 일일 안전점검 체크리스트 의무화 및 임의 해체 시 즉시 작업중지 조치',
    42: '[PM 판정결과] 안전난간대 즉시 재설치 완료 및 협력사 관리책임자 경고 조치 (모니터링 강화)'
  };

  await createSample(
    basePptx,
    '샘플1_아파트_시스템비계_중부적합.pptx',
    sample1Map,
    'samples/photos/sample_before.jpg'
  );

  // 샘플 2: 물류센터 개구부덮개 경부적합
  const sample2Map = {
    21: '추락',
    22: '[경부적합]',
    25: '산업안전보건기준에 관한 규칙 제59조(추락방지조치)',
    3: '협력사 : (주)대한철골건설',
    4: '공종명 : 철골공사 (데크플레이트)',
    5: '작업장소 : 2층 하역장 상부 바닥 개구부',
    6: '점검자 : 박패트롤 대리',
    7: '점검차수 : 1차',
    9: '부적합 내용 : ① 데크플레이트 배관 개구부 덮개에 "추락주의" 위험표지 미부착',
    10: '② 개구부 덮개 고정 철선 일부 이완으로 유동 발생',
    28: '□ 계획 미수립 □ 계획 미이행',
    29: '□ 불안전 행동 ■ 불안전 상태',
    48: '□ Hold Point 위반 (N/A)',
    30: '[ 의견 : 시공관리자 및 근로자 ] 설비 배관 위치 확인을 위해 덮개를 일시 이동 후 재고정 시 철선 결속 미흡',
    35: '[점검단 제안] 개구부 덮개 전수 점검 및 경고 위험표지 일괄 부착',
    42: '[PM 판정결과] 개구부 결속 즉시 완료 및 위험표지 부착 완료 (경고)'
  };

  await createSample(
    basePptx,
    '샘플2_물류센터_개구부덮개_경부적합.pptx',
    sample2Map,
    'samples/photos/sample_after.jpg'
  );
}

main();
