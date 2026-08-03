const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");

const app = readFileSync("js/app.js", "utf8");
const construction = readFileSync("js/construction.js", "utf8");

assert.match(construction, /bottlesTaken: 0/);
assert.match(construction, /bottleInventoryOutstanding: 0/);
assert.match(app, /function injectionBottleInventoryProduct\(/);
assert.match(app, /function syncWorksiteBottleInventory\(/);
assert.match(app, /data-ws-site-field="bottlesTaken"/);
assert.match(app, /data-ws-site-field="bottlesHanging"/);
assert.match(app, /data-ws-site-field="bottlesRetrieved"/);
assert.match(app, /ws\.bottlesRetrieved = Number\(ws\.bottlesRetrieved \|\| 0\) \+ amount/);
assert.match(app, /const amount = Math\.min\(open,/);
assert.match(app, /const inventoryDelta = previous - desired/);
assert.match(app, /worksiteId: worksite\.id/);

console.log("Injektionsflaschen: Mitnahme, Rückgabe, Teilabholung und Differenzbuchung geprüft.");

(async () => {
  const { bottleInventoryTarget } = await import("../js/construction.js");
  const worksite = { bottlesTaken: 30, bottlesHanging: 20, bottlesRetrieved: 0 };
  assert.equal(bottleInventoryTarget(worksite, "taken"), 30, "30 mitgenommene Flaschen müssen ausgebucht sein");
  assert.equal(bottleInventoryTarget(worksite, "hanging"), 20, "Nach Arbeitsende dürfen nur 20 hängende Flaschen ausgebucht bleiben");
  worksite.bottlesRetrieved = 12;
  assert.equal(bottleInventoryTarget(worksite, "pickup"), 8, "Nach Teilabholung müssen 8 Flaschen offen bleiben");
  worksite.bottlesRetrieved = 20;
  assert.equal(bottleInventoryTarget(worksite, "pickup"), 0, "Nach vollständiger Abholung darf keine Flasche offen bleiben");
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
