export function createWallMeasurementGrid(widthMeters, heightMeters, device = "") {
  const width = Math.max(0.5, Number(widthMeters || 0));
  const height = Math.max(0.5, Number(heightMeters || 0));
  const columns = Math.max(3, Math.min(7, Math.round(width) + 1));
  const rowHeights = [0.15, 0.5, 1, 1.5, 2, 2.5]
    .filter(value => value <= height - 0.05);
  if (!rowHeights.length) rowHeights.push(Math.max(0.1, height / 2));
  if (height > 1.1 && rowHeights.at(-1) < height - 0.35) rowHeights.push(height - 0.2);

  const points = [];
  rowHeights.forEach((heightValue, row) => {
    for (let column = 0; column < columns; column += 1) {
      const xMeters = columns === 1 ? width / 2 : (width * column) / (columns - 1);
      points.push({
        id: crypto.randomUUID(),
        number: points.length + 1,
        x: 0.08 + (columns === 1 ? 0.42 : (0.84 * column) / (columns - 1)),
        y: 0.9 - 0.78 * (heightValue / height),
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
