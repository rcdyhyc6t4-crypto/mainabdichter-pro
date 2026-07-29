const assert = require("node:assert");

(async () => {
  const { surfaceInjectionPlan, injectionHoleInfo } = await import("../js/construction.js");
  const task = {
    type:"Flächensperre",
    surfaceFirstRowHoles:16,
    surfaceFollowingRowHoles:64,
    surfaceFirstRowMlPerHole:420,
    surfaceFollowingRowMlPerHole:300
  };
  const rows = surfaceInjectionPlan(task);
  assert.equal(rows.length,5);
  assert.equal(rows.flatMap(row => row.holes).length,80);
  assert.equal(rows[0].label,"Reihe 1");
  assert.equal(rows[1].offset,true);
  assert.equal(rows[2].offset,false);
  assert.equal(injectionHoleInfo(task,1).targetMl,420);
  assert.equal(injectionHoleInfo(task,17).targetMl,300);
  assert.equal(injectionHoleInfo(task,17).label,"Reihe 2 · oben");

  const app = require("node:fs").readFileSync("js/app.js","utf8");
  assert(app.includes('surfaceHoles || Number(task.actualHoles || 0) || derivedHoles'), "Ist-Lochzahl muss vor der alten Soll-Lochzahl gelten.");
  assert(app.includes('input.dataset.zeroClearedOnFocus = "1"'), "Numerische Nullwerte müssen beim Bearbeiten automatisch verschwinden.");

  console.log("Flächensperre: Reihen, Faktoren, Schachbrettversatz und Nullwerte: OK");
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
