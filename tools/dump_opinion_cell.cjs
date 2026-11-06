const fs = require("fs");
const path = require("path");

const xml = fs.readFileSync(path.join(__dirname, "t22.xml"), "utf8");

// Search for cell with 의견
const cellM = xml.match(/<a:tc>[\s\S]*?의견[\s\S]*?<\/a:tc>/);
if (cellM) {
  console.log("=== CELL WITH 의견 ===");
  console.log(cellM[0]);
} else {
  console.log("Not found in t22.xml");
}
