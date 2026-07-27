const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");

const html = readFileSync("index.html", "utf8");
const css = readFileSync("css/app.css", "utf8");
const app = readFileSync("js/app.js", "utf8");

assert.match(html, /id="visitJumpSelect"/);
assert.match(html, /id="worksiteJumpSelect"/);
assert.match(html, /data-autosave-state/);
assert.match(css, /\.bottom-nav,.redesign-bottom-nav\{[\s\S]*position:fixed!important/);
assert.match(css, /env\(safe-area-inset-bottom\)/);
assert.match(css, /min-height:100dvh/);
assert.match(css, /\.worksite-step-actions\{bottom:var\(--mobile-nav-height\)\}/);
assert.match(app, /const MAIN_GUIDE_ROUTE = \[0, 2, 3, 4, 7, 9\]/);
assert.match(app, /if \(activePage === "worksites" && activeWorksiteId\) saveActiveWorksite\(false\)/);
assert.match(app, /setAutomaticSaveState\("✓ gespeichert"\)/);
assert.match(app, /window\.visualViewport\?\.addEventListener\("resize", synchronizeVisibleViewport\)/);
assert.match(css, /--app-visible-height/);

console.log("Mobile Navigation, Safe Areas und automatische Sicherung geprüft.");
