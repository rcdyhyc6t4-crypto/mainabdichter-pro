const assert = require("node:assert/strict");
const { webcrypto } = require("node:crypto");
global.crypto ||= webcrypto;

(async () => {
  const {
    createWallMeasurementGrid,
    measurementPointState,
    wallSurveyProgress
  } = await import("../js/wall-survey.js");

  const points = createWallMeasurementGrid(4.2, 2.4, "Gann Hydromette Compact B");
  assert.ok(points.length >= 15, "Die Messkette muss die Wand ausreichend abdecken.");
  assert.ok(points.every(point => point.x >= 0 && point.x <= 1 && point.y >= 0 && point.y <= 1));
  assert.ok(points.every(point => point.unit === "Digits"));

  points[0].value = "55";
  points[1].value = "75";
  points[2].value = "105";
  points[3].status = "inaccessible";

  assert.equal(measurementPointState(points[0], "50"), "normal");
  assert.equal(measurementPointState(points[1], "50"), "raised");
  assert.equal(measurementPointState(points[2], "50"), "high");
  assert.equal(measurementPointState(points[3], "50"), "inaccessible");
  assert.equal(wallSurveyProgress(points).done, 4);

  console.log(`Wandmessung erfolgreich geprüft: ${points.length} Messpunkte.`);
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
