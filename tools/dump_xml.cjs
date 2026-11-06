const fs = require("fs");
const path = require("path");

const xmlPath = path.join(__dirname, "template_extracted", "ppt", "slides", "slide1.xml");
const xml = fs.readFileSync(xmlPath, "utf8");

const target = "표 23";
const regex = new RegExp(`name="${target}"[\\s\\S]*?<\\/p:graphicFrame>`);
const match = xml.match(regex);
console.log(match ? match[0] : "not found");
