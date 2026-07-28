const fs = require("fs");
const assert = require("assert");

const html = fs.readFileSync("index.html", "utf8");
const app = fs.readFileSync("js/app.js", "utf8");

assert(html.includes("OFFEN &amp; WICHTIG"), "Kompakter Prioritätenbereich fehlt");
assert(html.includes("SCHNELLZUGRIFF"), "Kompakter Schnellzugriff fehlt");
assert(!html.includes('id="v28InventoryStrip"'), "Lagerstreifen darf nicht dauerhaft im Dashboard stehen");
assert(!html.includes('id="v28CreateOffer"'), "Separates Neues-Angebot-Feld darf nicht im Dashboard stehen");

[
  "newInquiryScreenshot",
  "newCustomerFromPlus",
  "newAppointmentFromPlus",
  "newInquiryManual",
  "newWorksiteFromPlus",
  "newWorkReportDirect"
].forEach(id => {
  assert(html.includes(`id="${id}"`), `Plus-Aktion ${id} fehlt im HTML`);
  assert(app.includes(`$("${id}")`), `Plus-Aktion ${id} ist nicht verdrahtet`);
});

assert(html.includes('id="v287OpenInventory"'), "Lager-Popup-Schalter fehlt");
assert(html.includes('id="v287InventoryListModal"'), "Lager-Popup fehlt");
assert(html.includes("V32.20.9"), "Korrekturversion des kompakten Dashboards fehlt");

const css = fs.readFileSync("css/app.css", "utf8");
assert(css.includes("Dashboard und Plus-Menü wirklich kompakt"), "Finale mobile Kompaktregeln fehlen");
assert(css.includes("#newInquiryModal .new-inquiry-options{grid-template-columns:1fr"), "Plus-Menü muss auf dem Smartphone einspaltig sein");

console.log("Dashboard-Vereinfachung und Plus-Menü: OK");
