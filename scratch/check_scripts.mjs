import fs from 'fs';

const html = fs.readFileSync('app/index.html', 'utf8');
const scripts = [...html.matchAll(/<script[^>]+src=["']([^"']+)["']/g)].map(m => m[1]);
console.log('Script sources in index.html:');
let hasError = false;
scripts.forEach(s => {
  console.log(' -', s);
  if (s.includes('/.js')) {
    hasError = true;
    console.error('ERROR: contains /.js!');
  }
});

if (hasError) {
  process.exit(1);
} else {
  console.log('All script tags are correct!');
}
