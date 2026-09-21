const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const app = fs.readFileSync(path.join(__dirname, "../js/app.js"), "utf8");
const html = fs.readFileSync(path.join(__dirname, "../index.html"), "utf8");
const css = fs.readFileSync(path.join(__dirname, "../css/app.css"), "utf8");

assert.match(app, /onpointerdown = startWallSurveyCornerPointer/);
assert.match(app, /onpointermove = moveWallSurveyCornerPointer/);
assert.match(app, /Object\.assign\(wallSurveyCornerDraft\[wallSurveyDraggingCorner\], position\)/);
assert.match(app, /saveCurrentToArchive\(false\)/);
assert.match(app, /data-open-visit-record/);
assert.match(app, /saveVisitExplicitSavepoint/);
assert.match(html, /id="wallSurveyCancel"/);
assert.match(html, /id="wallSurveyDelete"/);
assert.match(html, /id="wallSurveyFinish"/);
assert.match(html, /id="cancelVisitChanges"/);
assert.match(html, /id="deleteCompleteVisit"/);
assert.match(html, /id="saveVisit"/);
assert.match(css, /\.wall-survey-result-actions/);

console.log("Wandecken-Verschiebung, Löschen und Archivspeicherung geprüft.");
