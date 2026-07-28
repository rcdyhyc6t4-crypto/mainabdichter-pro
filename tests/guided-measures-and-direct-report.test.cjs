const assert = require("node:assert");
const fs = require("node:fs");

const app = fs.readFileSync("js/app.js", "utf8");
const html = fs.readFileSync("index.html", "utf8");

assert.match(app, /function measureCompletion\(measure=\{\}\)/);
assert.match(app, /label:"Menge und Ausführung je Maßnahme"/);
assert.match(app, /label:"Alle Maßnahmen geprüft"/);
assert.match(app, /measure\.confirmed=true/);
assert.match(app, /measure\.confirmed=false/);
assert.match(app, /Laufmeter der Wand/);
assert.match(app, /Bohrlochabstand auswählen/);
assert.match(html, /id="newWorkReportDirect"/);
assert.match(app, /function openDirectWorkReportStart\(\)/);
assert.match(app, /openAdditionalWorkPicker\(worksite,\{primary:true\}\)/);
assert.match(app, /additionalWork:!primaryMode/);

console.log("Geführte Maßnahmen und direkter Arbeitsnachweis: OK");
