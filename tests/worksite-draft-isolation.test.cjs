const assert = require("node:assert/strict");
const { webcrypto } = require("node:crypto");

if (!global.crypto) global.crypto = webcrypto;
const storage = new Map();
global.localStorage = {
  getItem: key => storage.has(key) ? storage.get(key) : null,
  setItem: (key, value) => storage.set(key, String(value))
};

(async () => {
  const { saveWorksite, getWorksite, loadWorksites } = await import("../js/construction.js");
  saveWorksite({ id: "kunde-a-nachweis-1", customer: { firstName: "Anna" }, startTime: "08:00", tasks: [{ id: "a", actualLiters: 2 }] });
  saveWorksite({ id: "kunde-b-nachweis-1", customer: { firstName: "Bernd" }, startTime: "10:00", tasks: [{ id: "b", actualLiters: 7 }] });
  const anna = getWorksite("kunde-a-nachweis-1");
  anna.endTime = "09:00";
  anna.tasks[0].actualLiters = 3;
  saveWorksite(anna);

  assert.equal(loadWorksites().length, 2);
  assert.equal(getWorksite("kunde-a-nachweis-1").tasks[0].actualLiters, 3);
  assert.equal(getWorksite("kunde-b-nachweis-1").tasks[0].actualLiters, 7);
  assert.equal(getWorksite("kunde-b-nachweis-1").startTime, "10:00");
  console.log("✓ Arbeitsnachweise bleiben nach Baustellen-ID getrennt");
})().catch(error => {
  console.error(error);
  process.exit(1);
});
