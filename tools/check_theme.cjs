const fs = require('fs');
const JSZip = require('jszip');

async function checkTheme() {
  const buf = fs.readFileSync('템플릿/부적합 장표.pptx');
  const zip = await JSZip.loadAsync(buf);
  const themeXml = await zip.file('ppt/theme/theme1.xml').async('text');
  
  const clrScheme = themeXml.match(/<a:clrScheme[\s\S]*?<\/a:clrScheme>/);
  if (clrScheme) {
    console.log('Color scheme:');
    const clrs = clrScheme[0].match(/<a:[a-zA-Z0-9]+>[\s\S]*?<\/a:[a-zA-Z0-9]+>/g) || [];
    clrs.forEach(c => {
      console.log(' ', c.replace(/\s+/g, ' '));
    });
  }
}

checkTheme().catch(console.error);
