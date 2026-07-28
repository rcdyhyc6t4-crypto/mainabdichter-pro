const fs = require("node:fs");
const assert = require("node:assert");

const app = fs.readFileSync("js/app.js", "utf8");
const css = fs.readFileSync("css/app.css", "utf8");

assert(app.includes("function appointmentCategory(item)"), "Terminarten müssen fachlich unterschieden werden.");
assert(app.includes("return \"worksite\""), "Ausführungen müssen als Baustellentermin erkannt werden.");
assert(app.includes("function findAppointmentWorksite(item)"), "Bestehende Baustellen müssen gesucht werden.");
assert(app.includes("function openAppointmentTarget(item)"), "Termine brauchen eine typgerechte Navigation.");
assert(app.includes("openAppointmentTarget(items.find"), "Ein Klick auf den Termin muss das fachliche Ziel öffnen.");
assert(app.includes("openAppointmentCompletion(items.find"), "Terminabschluss muss eine getrennte Aktion bleiben.");
assert(css.includes("grid-template-columns:78px minmax(0,1fr) 24px!important"), "Die iPhone-Terminzeile braucht eine stabile Dreispaltenaufteilung.");
assert(css.includes("white-space:nowrap!important"), "Uhrzeit und Datum dürfen auf dem iPhone nicht zeichenweise umbrechen.");

console.log("Terminrouting und mobile Termindarstellung: OK");
