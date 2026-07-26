const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const workerPath = path.join(__dirname, "..", "cloudflare-worker.js");
const source = fs.readFileSync(workerPath, "utf8")
  .replace("export default {", "globalThis.worker = {");
const context = {
  console,
  Date,
  Intl,
  URL,
  URLSearchParams,
  Response,
  Request,
  Headers,
  FormData,
  Blob,
  crypto,
  fetch
};
vm.runInNewContext(
  `${source}
  globalThis.timezoneHelpers = {
    utcActivityTimeToBerlin,
    berlinActivityTimeToUtc
  };`,
  context
);

const { utcActivityTimeToBerlin, berlinActivityTimeToUtc } =
  context.timezoneHelpers;

assert.deepEqual(
  { ...utcActivityTimeToBerlin("2026-07-27", "09:45") },
  { dueDate: "2026-07-27", dueTime: "11:45" },
  "Sommerzeit: 09:45 UTC muss 11:45 Europe/Berlin ergeben."
);
assert.deepEqual(
  { ...berlinActivityTimeToUtc("2026-07-27", "11:45") },
  { dueDate: "2026-07-27", dueTime: "09:45" },
  "Sommerzeit: 11:45 Europe/Berlin muss als 09:45 UTC gesendet werden."
);
assert.deepEqual(
  { ...utcActivityTimeToBerlin("2026-12-15", "10:45") },
  { dueDate: "2026-12-15", dueTime: "11:45" },
  "Winterzeit muss automatisch UTC+1 verwenden."
);
assert.deepEqual(
  { ...berlinActivityTimeToUtc("2026-12-15", "11:45") },
  { dueDate: "2026-12-15", dueTime: "10:45" },
  "Winterzeit: lokale Termine müssen mit UTC+1 zurückgerechnet werden."
);
assert.deepEqual(
  { ...utcActivityTimeToBerlin("2026-07-27", "23:30") },
  { dueDate: "2026-07-28", dueTime: "01:30" },
  "Datumswechsel beim Lesen muss erhalten bleiben."
);
assert.deepEqual(
  { ...berlinActivityTimeToUtc("2026-07-27", "00:30") },
  { dueDate: "2026-07-26", dueTime: "22:30" },
  "Datumswechsel beim Schreiben muss erhalten bleiben."
);
assert.throws(
  () => berlinActivityTimeToUtc("2026-03-29", "02:30"),
  /Zeitumstellung/,
  "Eine in Berlin nicht existierende Uhrzeit darf nicht gespeichert werden."
);

console.log("Zeitzonentests erfolgreich.");
