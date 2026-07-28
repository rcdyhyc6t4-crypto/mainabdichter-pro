const fs = require("fs");
const assert = require("assert");

const html = fs.readFileSync("index.html", "utf8");
const css = fs.readFileSync("css/app.css", "utf8");

assert.match(html, /viewport-fit=cover/, "Safe-Area-Unterstützung fehlt");
assert.match(css, /@media\(max-width:620px\)/, "iPhone-Variante fehlt");
assert.match(css, /@media\(min-width:621px\) and \(max-width:1024px\)/, "iPad-Variante fehlt");

[
  ".customer-form-grid",
  ".visit-toolbar",
  ".guided-assistant",
  ".worksite-list-item",
  ".offer-position-row",
  ".v28-modal-dialog",
  ".wall-survey-shell",
  ".floor-plan-shell",
  ".redesign-bottom-nav"
].forEach(selector => assert(css.includes(selector), `Geräteregel für ${selector} fehlt`));

assert.match(css, /font-size:16px!important/, "iPhone-Eingaben müssen den Safari-Tastaturzoom verhindern");
assert.match(css, /env\(safe-area-inset-bottom\)/, "Untere iPhone-/iPad-Safe-Area fehlt");
assert.match(css, /overflow-x:hidden!important/, "Horizontaler Seitenversatz wird nicht global verhindert");
assert.match(css, /grid-template-rows:auto 36px!important/, "iPhone-Dashboardtexte müssen oberhalb der Kennzahlen stehen");
assert.match(css, /word-break:normal!important/, "Dashboard-Bezeichnungen dürfen nicht buchstabenweise umbrechen");
assert.match(css, /position:sticky!important/, "iPhone-Kopfbereich muss unterhalb der Statusleiste stehen bleiben");

console.log("iPhone-, iPad- und Desktop-Layouts: OK");
