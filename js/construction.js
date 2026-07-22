import { calculateMeasure } from "./calculator.js";
import { parseDecimal } from "./utils.js";

const KEY = "mainabdichter_v18_worksites";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function loadWorksites() {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) || "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

export function saveWorksites(items) {
  localStorage.setItem(KEY, JSON.stringify(items || []));
}

export function getWorksite(id) {
  return loadWorksites().find(item => item.id === id) || null;
}

export function saveWorksite(worksite) {
  const items = loadWorksites();
  const now = new Date().toISOString();
  const record = { ...clone(worksite), updatedAt: now };
  const index = items.findIndex(item => item.id === record.id);
  if (index >= 0) items[index] = record;
  else items.unshift(record);
  saveWorksites(items);
  return record;
}

export function deleteWorksite(id) {
  saveWorksites(loadWorksites().filter(item => item.id !== id));
}

function targetPerHole(result) {
  return result.holes > 0 ? result.rawLiters / result.holes : 0;
}

export function createWorksiteFromVisit(settings, visit, offerRecordId = "") {
  const tasks = [];
  for (const area of visit.areas || []) {
    for (const measure of area.measures || []) {
      const result = calculateMeasure(settings, measure);
      if (result.quantity <= 0) continue;
      tasks.push({
        id: crypto.randomUUID(),
        areaId: area.id,
        areaName: area.name,
        measureId: measure.id,
        type: measure.type,
        wall: Number(measure.wall || area.wallThickness || 30),
        spacing: Number(measure.spacing || .25),
        plannedQuantity: result.quantity,
        unitName: result.unitName,
        scope: result.scope,
        plannedHoles: result.holes,
        actualHoles: result.holes,
        plannedLiters: result.saleLiters,
        actualLiters: result.saleLiters,
        plannedHsKg: result.hsKg || 0,
        actualHsKg: result.hsKg || 0,
        targetLitersPerHole: targetPerHole(result),
        injectionType: "Niederdruckverfahren",
        chargeHz: "",
        chargeSecondary: "",
        packers: 0,
        resinKg: Number(measure.extraResinKg || 0),
        completed: false,
        note: "",
        photos: []
      });
    }
  }

  return {
    id: crypto.randomUUID(),
    offerRecordId,
    status: "planned",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    customer: clone(visit.customer),
    building: clone(visit.building),
    visitNumber: visit.visitNumber || "",
    objectAddress: visit.customer.objectAddress || [
      visit.customer.street,
      [visit.customer.zip, visit.customer.city].filter(Boolean).join(" ")
    ].filter(Boolean).join(", "),
    date: new Date().toISOString().slice(0,10),
    startTime: "",
    endTime: "",
    pauseMinutes: 0,
    employees: "Mike Sprager",
    weather: visit.visitWeather || "",
    outdoorTemp: visit.visitOutdoorTemp || "",
    latitude: visit.visitLatitude || "",
    longitude: visit.visitLongitude || "",
    generalNotes: "",
    customerSignature: "",
    workerSignature: "",
    materialBooked: false,
    materialBookedAt: "",
    tasks
  };
}

export function workDurationMinutes(worksite) {
  if (!worksite.startTime || !worksite.endTime) return 0;
  const [sh, sm] = worksite.startTime.split(":").map(Number);
  const [eh, em] = worksite.endTime.split(":").map(Number);
  let total = eh * 60 + em - sh * 60 - sm;
  if (total < 0) total += 1440;
  return Math.max(0, total - parseDecimal(worksite.pauseMinutes));
}

export function worksiteMaterialTotals(worksite) {
  return (worksite.tasks || []).reduce((total, task) => {
    total.hzLiters += parseDecimal(task.actualLiters);
    total.hsKg += parseDecimal(task.actualHsKg);
    total.resinKg += parseDecimal(task.resinKg);
    total.packers += parseDecimal(task.packers);
    return total;
  }, { hzLiters:0, hsKg:0, resinKg:0, packers:0 });
}

export function backupWorksites() {
  return loadWorksites();
}

export function restoreWorksites(items) {
  saveWorksites(Array.isArray(items) ? items : []);
}
