export function normalizeWallCorners(corners = []) {
  if (!Array.isArray(corners) || corners.length !== 4) {
    return [{x:0,y:0},{x:1,y:0},{x:1,y:1},{x:0,y:1}];
  }
  return corners.map(point => ({
    x: Math.max(0, Math.min(1, Number(point.x || 0))),
    y: Math.max(0, Math.min(1, Number(point.y || 0)))
  }));
}

export function mapPointIntoWall(wallX, wallY, corners = []) {
  const [topLeft, topRight, bottomRight, bottomLeft] = normalizeWallCorners(corners);
  const u = Math.max(0, Math.min(1, Number(wallX || 0)));
  const v = Math.max(0, Math.min(1, Number(wallY || 0)));
  const top = { x:topLeft.x + (topRight.x - topLeft.x) * u, y:topLeft.y + (topRight.y - topLeft.y) * u };
  const bottom = { x:bottomLeft.x + (bottomRight.x - bottomLeft.x) * u, y:bottomLeft.y + (bottomRight.y - bottomLeft.y) * u };
  return { x:top.x + (bottom.x - top.x) * v, y:top.y + (bottom.y - top.y) * v };
}

export function createWallMeasurementGrid(widthMeters, heightMeters, device = "", corners = []) {
  const width = Math.max(0.5, Number(widthMeters || 0));
  const height = Math.max(0.5, Number(heightMeters || 0));
  const wallArea = width * height;
  const targetCount = wallArea < 6 ? 6 : wallArea < 15 ? 9 : 12;
  const columns = targetCount === 12 ? 4 : 3;
  const rows = targetCount / columns;
  const rowHeights = rows === 2
    ? [Math.min(0.2, height * .15), Math.max(0.3, height * .75)]
    : [Math.min(0.2, height * .12), height * .5, Math.max(0.35, height * .88)];

  const points = [];
  rowHeights.forEach((heightValue, row) => {
    for (let column = 0; column < columns; column += 1) {
      const xMeters = columns === 1 ? width / 2 : (width * column) / (columns - 1);
      const wallX = 0.08 + (columns === 1 ? 0.42 : (0.84 * column) / (columns - 1));
      const wallY = 0.9 - 0.78 * (heightValue / height);
      const imagePoint = mapPointIntoWall(wallX, wallY, corners);
      points.push({
        id: crypto.randomUUID(),
        number: points.length + 1,
        x: imagePoint.x,
        y: imagePoint.y,
        wallX,
        wallY,
        xMeters: Math.round(xMeters * 100) / 100,
        height: Math.round(heightValue * 100),
        location: `Messpunkt ${points.length + 1}`,
        device,
        value: "",
        unit: "Digits",
        status: "open"
      });
    }
  });
  return points;
}

export function measurementPointState(point, dryReference = "") {
  if (point.status === "inaccessible") return "inaccessible";
  const value = Number(point.value);
  if (!Number.isFinite(value) || String(point.value).trim() === "") return "open";
  const reference = Number(dryReference);
  if (!Number.isFinite(reference) || String(dryReference).trim() === "") return "measured";
  const difference = value - reference;
  if (difference <= 10) return "normal";
  if (difference <= 30) return "raised";
  return "high";
}

export function wallSurveyProgress(points = []) {
  const done = points.filter(point =>
    point.status === "inaccessible" || String(point.value ?? "").trim() !== ""
  ).length;
  return { done, total: points.length, complete: points.length > 0 && done === points.length };
}
