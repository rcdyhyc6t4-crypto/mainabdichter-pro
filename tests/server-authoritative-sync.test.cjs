const assert = require("node:assert/strict");
const { webcrypto } = require("node:crypto");

if (!global.crypto) global.crypto = webcrypto;
const values = new Map();
global.localStorage = {
  getItem: key => values.has(key) ? values.get(key) : null,
  setItem: (key, value) => values.set(key, String(value)),
  removeItem: key => values.delete(key)
};

(async () => {
  const storage = await import("../js/storage-v227.js");

  const local = {
    settings: {
      workerUrl: "https://lokaler-worker.example",
      appSecret: "lokales-geheimnis",
      inventory: { products: [{ id: "hz", stock: 2 }] }
    },
    customers: [{ id: "alt", firstName: "Alter Kunde" }],
    worksites: [{ id: "alt-baustelle", status: "active" }]
  };
  const remote = {
    settings: {
      company: { name: "mainabdichter" },
      inventory: { products: [{ id: "hz", stock: 48 }] }
    },
    visit: { customer: { firstName: "Zentrale", lastName: "Besichtigung" }, areas: [] },
    discount: { skontoType: "none" },
    archive: [{ id: "archiv-zentral", updatedAt: "2026-07-27T20:00:00.000Z" }],
    customers: [{ id: "kunde-zentral", firstName: "Server" }],
    worksites: [{ id: "baustelle-zentral", status: "planned" }],
    communicationNotes: [{ id: "notiz-zentral", text: "Anrufen" }],
    emailInboxState: { processedIds: ["mail-1"], assignments: {} },
    drafts: [{ id: "entwurf-zentral", form: { city: "Frankfurt" } }],
    reminders: [{ id: "erinnerung-zentral", text: "Rechnung schreiben" }],
    activeDraftId: "entwurf-zentral"
  };

  const result = storage.createServerAuthoritativePayload(remote, local);
  assert.equal(result.settings.inventory.products[0].stock, 48);
  assert.equal(result.customers[0].id, "kunde-zentral");
  assert.equal(result.worksites[0].id, "baustelle-zentral");
  assert.equal(result.visit.customer.firstName, "Zentrale");
  assert.equal(result.settings.workerUrl, "https://lokaler-worker.example");
  assert.equal(result.settings.appSecret, "lokales-geheimnis");
  assert.equal(result.customers.some(item => item.id === "alt"), false);

  storage.restoreFullBackupPayload(result);
  assert.equal(JSON.parse(localStorage.getItem("mainabdichter_v10_settings")).inventory.products[0].stock, 48);
  assert.equal(JSON.parse(localStorage.getItem("mainabdichter_v30_customers"))[0].id, "kunde-zentral");
  assert.equal(JSON.parse(localStorage.getItem("mainabdichter_v18_worksites"))[0].id, "baustelle-zentral");
  assert.equal(JSON.parse(localStorage.getItem("mainabdichter_v26_drafts"))[0].id, "entwurf-zentral");
  assert.equal(JSON.parse(localStorage.getItem("mainabdichter_v26_reminders"))[0].id, "erinnerung-zentral");
  assert.equal(localStorage.getItem("mainabdichter_v26_active_draft"), "entwurf-zentral");

  const completeBackup = storage.createFullBackupPayload();
  assert.equal(completeBackup.settings.inventory.products[0].stock, 48);
  assert.equal(completeBackup.drafts[0].id, "entwurf-zentral");
  assert.equal(completeBackup.reminders[0].id, "erinnerung-zentral");

  console.log("✓ Zentraler Stand gewinnt für Lager, Kunden, Baustellen und Vorgänge");
  console.log("✓ Gerätespezifische Worker-Zugangsdaten bleiben erhalten");
  console.log("✓ Entwürfe und Erinnerungen sind Teil der Komplettsicherung");
})().catch(error => {
  console.error(error);
  process.exit(1);
});
