const AdmZip = require('adm-zip');
const zip = new AdmZip('템플릿/부적합 장표.pptx');
const entries = zip.getEntries();
console.log('Zip entries:');
entries.forEach(e => {
  if (e.entryName.includes('table') || e.entryName.includes('slide') || e.entryName.includes('theme') || e.entryName.includes('color')) {
    console.log(e.entryName);
  }
});

const tsEntry = zip.getEntry('ppt/tableStyles.xml');
if (tsEntry) {
  const tsXml = zip.readAsText(tsEntry);
  console.log('\n--- tableStyles.xml ---');
  console.log(tsXml.substring(0, 2000));
} else {
  console.log('No ppt/tableStyles.xml');
}
