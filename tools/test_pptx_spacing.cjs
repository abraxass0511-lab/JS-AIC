const PptxGenJS = require("pptxgenjs");

const pptx = new PptxGenJS();
const slide = pptx.addSlide();

slide.addText([
  {
    text: "[의견 : 시공관리자 및 근로자]",
    options: {
      fontSize: 14,
      bold: true,
      color: "000000",
      breakLine: true,
      paraSpaceAfter: 8
    }
  },
  {
    text: "현장 시공 여건 상 위험장소 접근 사유로 기준이 미준수되었으며, 관리감독자의 사전 작업지휘가 미흡한 상태에서 작업이 진행됨.",
    options: {
      fontSize: 12,
      color: "111111"
    }
  }
], {
  x: 1, y: 1, w: 5, h: 2,
  fill: { color: "FFFFFF" },
  line: { color: "000000", width: 1 },
  margin: [10, 20, 30, 40],
  valign: "top"
});







pptx.writeFile({ fileName: "tools/test_spacing.pptx" }).then(() => {
  console.log("Wrote tools/test_spacing.pptx");
  const JSZip = require("jszip");
  const fs = require("fs");
  JSZip.loadAsync(fs.readFileSync("tools/test_spacing.pptx")).then(zip => {
    return zip.file("ppt/slides/slide1.xml").async("text");
  }).then(xml => {
    console.log(xml.match(/<p:txBody>[\s\S]*?<\/p:txBody>/)[0]);
  });
});

