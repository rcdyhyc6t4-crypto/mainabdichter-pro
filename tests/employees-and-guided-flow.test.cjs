const fs = require("node:fs");
const assert = require("node:assert/strict");

const html = fs.readFileSync("index.html", "utf8");
const app = fs.readFileSync("js/app.js", "utf8");
const defaults = fs.readFileSync("js/defaults-v227.js", "utf8");
const css = fs.readFileSync("css/app.css", "utf8");

assert.match(defaults, /employees:\s*\["Mike Sprager",\s*"",\s*""\]/);
assert.match(html, /id="employeeName1"/);
assert.match(html, /id="employeeName2"/);
assert.match(html, /id="employeeName3"/);
assert.equal((html.match(/id="employeeName[123]"/g) || []).length, 3);
assert.match(html, /<select id="visitEmployee"/);
assert.match(html, /<select id="wsEmployees"/);
assert.match(app, /function configuredEmployees\(\)/);
assert.match(app, /state\.visit\.visitEmployee = defaultEmployeeName\(\)/);
assert.match(app, /function scheduleVisitAutoAdvance\(\)/);
assert.match(app, /openGuideStep\(MAIN_GUIDE_ROUTE\[routePosition \+ 1\]\)/);
assert.match(app, /classList\.toggle\('guide-hidden',!current\)/);
assert.match(css, /#visit \.guide-hidden\{display:none!important\}/);

console.log("Mitarbeiter- und Schrittführungs-Test bestanden.");
