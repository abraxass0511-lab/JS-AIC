const fs = require('fs');
// Let's check exact row heights in PowerPoint by inspecting where horizontal black lines appear in template_major_rendered.jpg and template_minor_rendered.jpg
// We can use sharp or canvas if available, or check node_modules
console.log(fs.readdirSync('node_modules'));

