const assert = require("node:assert");
const fs = require("node:fs");

const app = fs.readFileSync("js/app.js", "utf8");
const html = fs.readFileSync("index.html", "utf8");

assert.equal(
  (app.match(/querySelectorAll\('\[data-open-step\]'\)/g) || []).length,
  1,
  "Die Besichtigungs-Menüleiste darf nur eine Navigationssteuerung besitzen"
);
assert.match(app, /const MAIN_GUIDE_ROUTE = \[0, 2, 3, 4, 7, 8\]/);
assert.match(app, /function finishVisitAndOpenOffer\(\)/);
assert.match(app, /const saved=saveCurrentToArchive\(false\)/);
assert.match(app, /saveVisitExplicitSavepoint\(\)/);
assert.match(app, /visitEndTime.*step:7/);
assert.match(html, /data-guide-group="visitSummary"/);
assert.match(html, />Protokoll prüfen</);
assert.doesNotMatch(html, />7 · Zusammenfassung</);
assert.doesNotMatch(html, />9 · Abschluss</);

console.log("Geführter Besichtigungsablauf und sichere Fertigstellung: OK");
