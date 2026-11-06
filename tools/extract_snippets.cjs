const fs = require("fs");
const path = require("path");

const xml = fs.readFileSync(path.join(__dirname, "template_extracted", "ppt", "slides", "slide1.xml"), "utf8");

// 1. 표 19
const t19 = xml.match(/<p:graphicFrame>[\s\S]*?<p:cNvPr[^>]*name="표 19"[\s\S]*?<\/p:graphicFrame>/)[0];
fs.writeFileSync(path.join(__dirname, "t19.xml"), t19);

// 2. 표 26 (Hold point)
const t26 = xml.match(/<p:graphicFrame>[\s\S]*?<p:cNvPr[^>]*name="표 26"[\s\S]*?<\/p:graphicFrame>/)[0];
fs.writeFileSync(path.join(__dirname, "t26.xml"), t26);

// 3. 표 22
const t22 = xml.match(/<p:graphicFrame>[\s\S]*?<p:cNvPr[^>]*name="표 22"[\s\S]*?<\/p:graphicFrame>/)[0];
fs.writeFileSync(path.join(__dirname, "t22.xml"), t22);

// 4. 표 2
const t2 = xml.match(/<p:graphicFrame>[\s\S]*?<p:cNvPr[^>]*name="표 2"[\s\S]*?<\/p:graphicFrame>/)[0];
fs.writeFileSync(path.join(__dirname, "t2.xml"), t2);

console.log("Extracted t19.xml, t26.xml, t22.xml, t2.xml");
