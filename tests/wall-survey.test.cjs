const assert = require("node:assert/strict");
const { webcrypto } = require("node:crypto");
global.crypto ||= webcrypto;

(async () => {
  const {
    createWallMeasurementGrid,
    mapPointIntoWall,
    measurementPointState,
    wallSurveyProgress
  } = await import("../js/wall-survey.js");

  const points = createWallMeasurementGrid(4.2, 2.4, "Gann Hydromette Compact B");
  assert.equal(points.length, 9, "Eine normale Wand soll übersichtliche 9 Messpunkte erhalten.");
  assert.ok(points.every(point => point.x >= 0 && point.x <= 1 && point.y >= 0 && point.y <= 1));
  assert.ok(points.every(point => point.unit === "Digits"));

  const corners = [{x:.2,y:.25},{x:.85,y:.18},{x:.9,y:.8},{x:.15,y:.86}];
  const cornerPoints = createWallMeasurementGrid(4.2, 2.4, "", corners);
  assert.equal(createWallMeasurementGrid(2.5, 2, "").length, 6);
  assert.equal(createWallMeasurementGrid(7, 2.5, "").length, 12);
  assert.ok(cornerPoints.every(point => point.x >= .15 && point.x <= .9));
  assert.ok(cornerPoints.every(point => point.y >= .18 && point.y <= .86));
  const center = mapPointIntoWall(.5, .5, corners);
  assert.ok(center.x > .45 && center.x < .6);
  assert.ok(center.y > .45 && center.y < .6);

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
