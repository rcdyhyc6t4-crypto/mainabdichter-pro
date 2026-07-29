const assert = require("node:assert");
const fs = require("node:fs");

const app = fs.readFileSync("js/app.js", "utf8");
const pdf = fs.readFileSync("js/pdf.js", "utf8");

assert(app.includes("ensureCentralWorksiteMaterialData"), "Alte Wanddaten müssen verlustfrei zur Baustelle übernommen werden.");
assert(app.includes('data-ws-site-field="${field}"'), "Charge 1 muss zentral an der Baustelle stehen.");
assert(app.includes('data-add-second-charge="${field}"'), "Eine zweite Charge muss gezielt einblendbar sein.");
assert(app.includes('data-ws-site-field="bottlesHanging"'), "Hängende Flaschen müssen zentral an der Baustelle stehen.");
assert(!app.includes('data-ws-task="${task.id}" data-ws-field="chargeHz"'), "Die HZ-Charge darf nicht mehr pro Wand erscheinen.");
assert(!app.includes('data-ws-task="${task.id}" data-ws-field="bottlesHanging"'), "Hängende Flaschen dürfen nicht mehr pro Wand erscheinen.");
assert(app.includes("worksite-calculation-card"), "Berechnete Werte müssen als Infokarte erscheinen.");
assert(app.includes("Ist-Bohrlöcher unten · Faktor 14"), "Die untere Ist-Bohrlochmenge muss editierbar bleiben.");
assert(app.includes("Ist-Bohrlöcher obere Reihen · Faktor 10"), "Die obere Ist-Bohrlochmenge muss editierbar bleiben.");
assert(pdf.includes("worksite.generalNotes"), "Allgemeine Bemerkungen müssen im PDF-Nachweis erscheinen.");
assert(pdf.includes("angrenzende Baustoffe oder Bauteile"), "Der technische Injektionshinweis fehlt.");
assert(pdf.includes("if (s.pressureMeters || s.resinScope || s.sefKg || s.hsKg)"), "Harz-/Druckwasserbereich darf nicht pauschal erscheinen.");

console.log("Zentrale Baustellendokumentation und klarer Arbeitsnachweis: OK");
