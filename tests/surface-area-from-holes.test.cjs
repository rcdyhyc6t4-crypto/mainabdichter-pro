const assert = require("node:assert");

(async () => {
  const { recalculateWorksiteTask } = await import("../js/construction.js");
  const settings = {
    reservePct: 20,
    hzSaleNet: 98,
    hzPurchaseNet: 30,
    drillRate: 60,
    fillRate: 60,
    closeRate: 60,
    setupHours: 0
  };
  const task = {
    type: "Flächensperre",
    wall: 30,
    spacing: 0.25,
    plannedWidth: 4,
    plannedHeight: 1.5,
    actualWidth: 4,
    actualHeight: 1.5,
    actualQuantity: 6,
    actualHoles: 96,
    surfaceFirstRowHoles: 16,
    surfaceFollowingRowHoles: 80,
    surfaceRowCount: 6
  };

  task.surfaceFollowingRowHoles = 64;
  recalculateWorksiteTask(settings, task, "surfaceFollowingRowHoles");
  assert.equal(task.actualHoles, 80);
  assert.equal(task.actualQuantity, 5);
  assert.equal(task.actualWidth, 4);
  assert.equal(task.actualHeight, 1.25);
  assert.equal(task.surfaceRowCount, 5);

  task.actualHoles = 64;
  recalculateWorksiteTask(settings, task, "actualHoles");
  assert.equal(task.actualHoles, 64);
  assert.equal(task.actualQuantity, 4);

  console.log("Flächensperre wird aus tatsächlichen Bohrlöchern zurückgerechnet: OK");
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
