const fs = require('fs');
const JSZip = require('jszip');

async function inspect(file) {
  console.log('\n========================================');
  console.log('FILE:', file);
  console.log('========================================');
  const buf = fs.readFileSync(file);
  const zip = await JSZip.loadAsync(buf);
  for (const name of Object.keys(zip.files)) {
    if (name.startsWith('ppt/slides/slide') && name.endsWith('.xml')) {
      const xml = await zip.file(name).async('text');
      const runs = xml.match(/<a:r>[\s\S]*?<\/a:r>/g) || [];
      runs.forEach(r => {
        const t = r.match(/<a:t>([\s\S]*?)<\/a:t>/);
        const sz = r.match(/sz="(\d+)"/);
        const b = r.match(/b="(\d+)"/);
        const clr = r.match(/<a:srgbClr val="([^"]+)"\/>/);
        if (t && (t[1].includes('추락') || t[1].includes('떨어짐') || t[1].includes('부적합') || t[1].includes('협력사') || t[1].includes('개요') || t[1].includes('말비계') || t[1].includes('조적') || t[1].includes('105동') || t[1].includes('사람'))) {
          console.log(`[${name}] "${t[1]}" -> sz: ${sz ? parseInt(sz[1])/100 + 'pt' : 'def'}, bold: ${b ? b[1] : 0}, clr: ${clr ? clr[1] : 'scheme'}`);
        }
      });
    }
  }
}

async function main() {
  await inspect('템플릿/부적합 장표.pptx');
  await inspect('템플릿/관리자용 PPT.pptx');
  await inspect('템플릿/근로자용 PPT.pptx');
}

main().catch(console.error);
