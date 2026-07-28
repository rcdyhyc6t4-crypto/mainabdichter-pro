const assert = require("node:assert");
const fs = require("node:fs");

const app = fs.readFileSync("js/app.js", "utf8");
const html = fs.readFileSync("index.html", "utf8");

assert.match(app, /const WORKSITE_SECTION_ORDER = \[\s*"wsSectionOverview", "wsSectionExecution", "wsSectionMedia", "wsSectionReport"\s*\]/);
assert.match(app, /field === "actualMlPerHole".*actualLitersPerHole/s);
assert.match(app, /recalculateWorksiteTask\(state\.settings, task\);/);
assert.doesNotMatch(app, /recalculateWorksiteTask\(state\.settings, task, "actualHoles"\)/);
assert.match(app, /Abschluss prüfen/);
assert.match(app, /Alle Maßnahmen erledigt und gespeichert/);
assert.match(app, /pipedrivePendingSync = true/);
assert.match(app, /Arbeitsnachweis sicher abgeschlossen und in Google Drive gespeichert/);
assert.match(html, /Schritt 1 von 4/);
assert.match(html, /Fotos &amp; Unterlagen/);
assert.doesNotMatch(html, /data-worksite-section="wsSectionMaterial"/);
assert.doesNotMatch(html, /data-worksite-section="wsSectionNotes"/);

console.log("Geführter Baustellenablauf, Verbrauch und sicherer Abschluss: OK");
