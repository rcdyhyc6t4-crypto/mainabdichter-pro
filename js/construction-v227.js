import { calculateMeasure } from "./calculator-v227.js";
import { parseDecimal } from "./utils-v227.js";

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
  if (result.holes <= 0) return 0;
  return Math.max(0.2, result.rawLiters / result.holes);
}


export function taskUsesHz(task) {
  return ["Horizontalsperre", "Flächensperre"].includes(task?.type);
}

export function taskUsesHs(task) {
  return task?.type === "Wand-Sohlen-Anschluss";
}

export function taskUsesResin(task) {
  return task?.type === "Harzverpressung" || Boolean(task?.resinApplied);
}

export function taskIsTechnical(task) {
  return ["Horizontalsperre", "Flächensperre", "Wand-Sohlen-Anschluss", "Harzverpressung"].includes(task?.type);
}

function baseTask(data = {}) {
  return {
    id: crypto.randomUUID(),
    areaId: "",
    areaName: "",
    measureId: "",
    type: "Sonstige Leistung",
    wall: 0,
    originalWall: 0,
    spacing: 0,
    plannedQuantity: 0,
    unitName: "Stück",
    scope: "",
    plannedHoles: 0,
    actualHoles: 0,
    plannedLiters: 0,
    actualLiters: 0,
    plannedHsKg: 0,
    actualHsKg: 0,
    targetLitersPerHole: 0,
    injectionType: "",
    chargeHz: "",
    chargeHs: "",
    chargeResin: "",
    packers: 0,
    bottlesHanging: 0,
    bottlesArea: "",
    bottlesPickupDue: "",
    bottlesRetrieved: 0,
    bottlesRetrievedAt: "",
    bottlesPickupNote: "",
    resinKg: 0,
    resinApplied: false,
    completed: false,
    note: "",
    photos: [],
    ...data
  };
}

export function createWorksiteFromVisit(settings, visit, offerRecordId = "") {
  const tasks = [];
  for (const area of visit.areas || []) {
    for (const measure of area.measures || []) {
      const result = calculateMeasure(settings, measure);
      if (result.quantity <= 0) continue;
      tasks.push(baseTask({
        areaId: area.id,
        areaName: area.name,
        measureId: measure.id,
        type: measure.type,
        wall: Number(measure.wall || area.wallThickness || 30),
        originalWall: Number(measure.wall || area.wallThickness || 30),
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
        injectionType: taskUsesHz({ type: measure.type }) ? "Niederdruckverfahren" : "",
        resinKg: measure.type === "Harzverpressung" ? Number(measure.extraResinKg || 0) : 0,
        resinApplied: measure.type === "Harzverpressung"
      }));
    }
  }

  return {
    id: crypto.randomUUID(),
    offerRecordId,
    status: "planned",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    customer: clone(visit.customer),
    pipedrivePersonId: visit.customer?.pipedriveId || "",
    pipedriveDealId: visit.customer?.pipedriveDealId || "",
    pipedrivePersonId: visit.customer?.pipedriveId || "",
    pipedriveDealId: visit.customer?.pipedriveDealId || "",
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


export function recalculateWorksiteTask(settings, task) {
  if (!taskIsTechnical(task)) return task;

  if (task.type === "Harzverpressung") {
    task.plannedHoles = 0;
    task.actualHoles = 0;
    task.plannedLiters = 0;
    task.actualLiters = 0;
    task.plannedHsKg = 0;
    task.actualHsKg = 0;
    task.targetLitersPerHole = 0;
    return task;
  }

  let measure;
  if (task.type === "Flächensperre") {
    measure = {
      type: task.type,
      width: Number(task.plannedQuantity || 0),
      height: 1,
      wall: Number(task.wall || 30),
      spacing: Number(task.spacing || .25),
      extraResinKg: 0
    };
  } else {
    measure = {
      type: task.type,
      length: Number(task.plannedQuantity || 0),
      wall: Number(task.wall || 30),
      spacing: Number(task.spacing || .25),
      extraResinKg: 0
    };
  }

  const result = calculateMeasure(settings, measure);

  if (taskUsesHz(task)) {
    task.plannedHoles = result.holes;
    task.plannedLiters = result.saleLiters;
    task.targetLitersPerHole = targetPerHole(result);
    if (!Number.isFinite(Number(task.actualHoles)) || Number(task.actualHoles) === 0) {
      task.actualHoles = result.holes;
    }
    if (!Number.isFinite(Number(task.actualLiters)) || Number(task.actualLiters) === 0) {
      task.actualLiters = result.saleLiters;
    }
  } else {
    task.plannedHoles = 0;
    task.actualHoles = 0;
    task.plannedLiters = 0;
    task.actualLiters = 0;
    task.targetLitersPerHole = 0;
  }

  if (taskUsesHs(task)) {
    task.plannedHsKg = result.hsKg || 0;
    if (!Number.isFinite(Number(task.actualHsKg)) || Number(task.actualHsKg) === 0) {
      task.actualHsKg = result.hsKg || 0;
    }
  } else {
    task.plannedHsKg = 0;
    task.actualHsKg = 0;
  }

  return task;
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
    if (taskUsesHz(task)) total.hzLiters += parseDecimal(task.actualLiters);
    if (taskUsesHs(task)) total.hsKg += parseDecimal(task.actualHsKg);
    if (taskUsesResin(task)) {
      total.resinKg += parseDecimal(task.resinKg);
      total.packers += parseDecimal(task.packers);
    }
    return total;
  }, { hzLiters: 0, hsKg: 0, resinKg: 0, packers: 0 });
}

export function backupWorksites() {
  return loadWorksites();
}

export function restoreWorksites(items) {
  saveWorksites(Array.isArray(items) ? items : []);
}


function inferMeasureType(name, description = "") {
  const text = `${name} ${description}`.toLowerCase();
  if (text.includes("wand-sohlen") || text.includes("wand sohlen") || text.includes("wand/sohle")) return "Wand-Sohlen-Anschluss";
  if (text.includes("flächensperre") || text.includes("flaechensperre")) return "Flächensperre";
  if (text.includes("horizontalsperre")) return "Horizontalsperre";
  if (text.includes("harzverpress") || text.includes("rissverpress") || text.includes("injektionsharz")) return "Harzverpressung";
  if (text.includes("baustelleneinrichtung") || text.includes("an- und abfahrt") || text.includes("an und abfahrt") || text.includes("sonstige leistung")) return "Sonstige Leistung";
  return "Sonstige Leistung";
}

export function createWorksiteFromLexwareQuotation(settings, quotation) {
  const customerName = quotation.address?.name || quotation.contactName || "Lexware-Kunde";
  const nameParts = String(customerName).trim().split(/\s+/);
  const tasks = (quotation.lineItems || []).filter(item => Number(item.quantity) > 0).map((item, index) => {
    const type = inferMeasureType(item.name, item.description);
    const quantity = Number(item.quantity || 0);
    const unitName = item.unitName || "Stück";
    const wall = 30;
    const spacing = .25;
    let plannedHoles = 0, plannedLiters = 0, plannedHsKg = 0, targetLitersPerHole = 0;
    if (["Horizontalsperre","Wand-Sohlen-Anschluss"].includes(type)) {
      const result = calculateMeasure(settings,{type,length:quantity,wall,spacing,extraResinKg:0});
      plannedHoles=result.holes; plannedLiters=result.saleLiters; plannedHsKg=result.hsKg||0; targetLitersPerHole=targetPerHole(result);
    } else if (type === "Flächensperre") {
      const result = calculateMeasure(settings,{type,width:quantity,height:1,wall,spacing,extraResinKg:0});
      plannedHoles=result.holes; plannedLiters=result.saleLiters; targetLitersPerHole=targetPerHole(result);
    }
    return baseTask({
      areaName: item.name || `Position ${index + 1}`,
      type,
      wall: taskIsTechnical({ type }) && type !== "Harzverpressung" ? wall : 0,
      originalWall: taskIsTechnical({ type }) && type !== "Harzverpressung" ? wall : 0,
      spacing: taskUsesHz({ type }) ? spacing : 0,
      plannedQuantity: quantity,
      unitName,
      scope: `${quantity.toLocaleString("de-DE")} ${unitName}`,
      plannedHoles: taskUsesHz({ type }) ? plannedHoles : 0,
      actualHoles: taskUsesHz({ type }) ? plannedHoles : 0,
      plannedLiters: taskUsesHz({ type }) ? plannedLiters : 0,
      actualLiters: taskUsesHz({ type }) ? plannedLiters : 0,
      plannedHsKg: taskUsesHs({ type }) ? plannedHsKg : 0,
      actualHsKg: taskUsesHs({ type }) ? plannedHsKg : 0,
      targetLitersPerHole: taskUsesHz({ type }) ? targetLitersPerHole : 0,
      injectionType: taskUsesHz({ type }) ? "Niederdruckverfahren" : "",
      resinApplied: type === "Harzverpressung",
      note: item.description || ""
    });
  });
  const contact = quotation.contact || {};
  const address = quotation.address || {};
  const objectAddress = [
    address.street || contact.street || "",
    [address.zip || contact.zip || "", address.city || contact.city || ""].filter(Boolean).join(" ")
  ].filter(Boolean).join(", ");
  return {id:crypto.randomUUID(),offerRecordId:"",pipedrivePersonId:"",pipedriveDealId:"",lexwareQuotationId:quotation.id||"",lexwareVoucherNumber:quotation.voucherNumber||"",status:"planned",createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),customer:{salutation:contact.salutation||"",firstName:contact.firstName||(nameParts.length>1?nameParts.slice(0,-1).join(" "):""),lastName:contact.lastName||(nameParts.at(-1)||customerName),company:contact.company||"",phone:contact.phone||"",email:contact.email||"",street:address.street||contact.street||"",zip:address.zip||contact.zip||"",city:address.city||contact.city||"",objectAddress,lexwareContactId:contact.id||quotation.contactId||""},building:{},visitNumber:quotation.voucherNumber||"",objectAddress,date:new Date().toISOString().slice(0,10),startTime:"",endTime:"",pauseMinutes:0,employees:"Mike Sprager",weather:"",outdoorTemp:"",latitude:"",longitude:"",generalNotes:`Importiert aus Lexware-Angebot ${quotation.voucherNumber||""}`,customerSignature:"",workerSignature:"",materialBooked:false,materialBookedAt:"",tasks};
}
