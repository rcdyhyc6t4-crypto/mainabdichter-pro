const fs = require("node:fs");
const assert = require("node:assert");

const app = fs.readFileSync("js/app.js", "utf8");
const html = fs.readFileSync("index.html", "utf8");
const css = fs.readFileSync("css/app.css", "utf8");

assert(app.includes("function revealActionTarget("), "Hinweise brauchen eine zentrale Direktnavigation.");
assert(app.includes('revealActionTarget(\n      "visit",\n      "#saveVisit"'), "Der Synchronhinweis muss direkt zur zu speichernden Besichtigung führen.");
assert(app.includes("$('finishVisitGuide').disabled=false"), "Der Besichtigungsabschluss muss anklickbar bleiben.");
assert(app.includes('revealActionTarget("offer", "#offerPositionsApproved"'), "Lexoffice muss direkt zur fehlenden Freigabe führen.");
assert(app.includes('$("createWorksite").disabled = false'), "Die Baustellenanlage muss anklickbar erklären, was fehlt.");
assert(app.includes("jumpToVisitCheck(requiredChecks"), "Fehlende Pflichtangaben müssen ihr Eingabefeld öffnen.");
assert(html.includes(">▣ Speichern</button>"), "Speichern braucht ein kurzes, bildgestütztes Signal.");
assert(html.includes(">→ Angebot</button>"), "Der nächste Hauptschritt muss kurz und eindeutig sein.");
assert(css.includes(".action-target-highlight"), "Das Lösungsfeld muss eindeutig sichtbar markiert werden.");

console.log("ADHS-optimierte Direktlösungen in den Hauptabläufen: OK");
