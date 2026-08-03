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

export function bottleInventoryTarget(worksite = {}, source = "hanging") {
  const taken = Math.max(0, Math.round(Number(worksite.bottlesTaken || 0)));
  const hanging = Math.max(0, Math.round(Number(worksite.bottlesHanging || 0)));
  const retrieved = Math.max(0, Math.round(Number(worksite.bottlesRetrieved || 0)));
  return source === "taken"
    ? Math.max(0, taken - retrieved)
    : Math.max(0, hanging - retrieved);
}

export function surfaceInjectionPlan(task = {}) {
  const firstCount = Math.max(0, Math.round(Number(task.surfaceFirstRowHoles || 0)));
  const followingCount = Math.max(0, Math.round(Number(task.surfaceFollowingRowHoles || 0)));
  const rowsBottomToTop = [];
  if (firstCount > 0) {
    rowsBottomToTop.push({
      row: 1,
      kind: "first",
      label: "Reihe 1",
      factor: 14,
      offset: false,
      count:firstCount
    });
  }
  let remaining = followingCount;
  let upperRow = 2;
  const holesPerUpperRow = Math.max(1, firstCount || Math.ceil(Math.sqrt(followingCount || 1)));
  while (remaining > 0) {
    const count = Math.min(holesPerUpperRow, remaining);
    rowsBottomToTop.push({
      row: upperRow,
      kind: "upper",
      label: `Reihe ${upperRow}`,
      factor: 10,
      offset: upperRow % 2 === 0,
      count
    });
    remaining -= count;
    upperRow++;
  }
  let nextHole = 1;
  return rowsBottomToTop.reverse().map(row => ({
    ...row,
    holes:Array.from({ length:row.count }, (_, column) => ({ hole:nextHole++, column:column + 1 }))
  }));
}

export function injectionHoleInfo(task = {}, holeNumber = 1) {
  if (task.type !== "Flächensperre") {
    return {
      hole:holeNumber,
      row:1,
      column:holeNumber,
      label:"Bohrreihe",
      kind:"standard",
      offset:false,
      targetMl:Math.round(Number(task.actualLitersPerHole || task.targetLitersPerHole || 0) * 1000)
    };
  }
  const rows = surfaceInjectionPlan(task);
  const row = rows.find(item => item.holes.some(hole => hole.hole === holeNumber)) || rows.at(-1);
  const position = row?.holes.find(hole => hole.hole === holeNumber);
  const targetMl = row?.kind === "first"
    ? Number(task.surfaceFirstRowMlPerHole || 0)
    : Number(task.surfaceFollowingRowMlPerHole || 0);
  return {
    hole:holeNumber,
    row:row?.row || 1,
    column:position?.column || holeNumber,
    label:row?.kind === "first" ? "Reihe 1 · unten" : `${row?.label || "Obere Reihe"} · oben`,
    kind:row?.kind || "first",
    offset:Boolean(row?.offset),
    targetMl:Math.round(targetMl)
  };
}

function baseTask(data = {}) {
  return {
    id: crypto.randomUUID(),
    areaId: "",
    areaName: "",
    workArea: "",
    wallMaterial: "",
    isInteriorWall: false,
    isExteriorWall: false,
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
    surfaceFirstRowHoles: 0,
    surfaceFollowingRowHoles: 0,
    surfaceFirstRowLiters: 0,
    surfaceFollowingRowsLiters: 0,
    surfaceFirstRowMlPerHole: 0,
    surfaceFollowingRowMlPerHole: 0,
    surfaceRowCount: 0,
    plannedWidth: 0,
    plannedHeight: 0,
    actualWidth: 0,
    actualHeight: 0,
    plannedLiters: 0,
    actualLiters: 0,
    plannedHsKg: 0,
    actualHsKg: 0,
    targetLitersPerHole: 0,
    actualLitersPerHole: 0,
    holeRecords: [],
    injectionPressureless: false,
    injectionLowPressure: true,
    injectionType: "",
    actualQuantity: 0,
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
        workArea: area.name || "",
        wallMaterial: measure.wallMaterial || area.wallMaterial || area.material || "",
        isInteriorWall: Boolean(measure.isInteriorWall || area.isInteriorWall),
        isExteriorWall: Boolean(measure.isExteriorWall || area.isExteriorWall),
        measureId: measure.id,
        type: measure.type,
        wall: Number(measure.wall || area.wallThickness || 30),
        originalWall: Number(measure.wall || area.wallThickness || 30),
        spacing: Number(measure.spacing || .25),
        plannedQuantity: result.quantity,
        actualQuantity: result.quantity,
        plannedWidth: measure.type === "Flächensperre" ? Number(measure.width || 0) : 0,
        plannedHeight: measure.type === "Flächensperre" ? Number(measure.height || 0) : 0,
        actualWidth: measure.type === "Flächensperre" ? Number(measure.width || 0) : 0,
        actualHeight: measure.type === "Flächensperre" ? Number(measure.height || 0) : 0,
        unitName: result.unitName,
        scope: result.scope,
        plannedHoles: result.holes,
        actualHoles: result.holes,
        plannedLiters: result.rawLiters,
        actualLiters: result.rawLiters,
        plannedHsKg: result.hsKg || 0,
        actualHsKg: result.hsKg || 0,
        targetLitersPerHole: targetPerHole(result),
        actualLitersPerHole: Math.ceil(targetPerHole(result) * 100) / 100,
        injectionType: taskUsesHz({ type: measure.type }) ? "Niederdruckverfahren" : "",
        resinKg: measure.type === "Harzverpressung"
          ? Number(measure.resinTotalKg || 0)
          : 0,
        resinApplied: measure.type === "Harzverpressung"
      }));
    }
  }

  return {
    id: crypto.randomUUID(),
    offerRecordId,
    status: "planning",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    customer: clone(visit.customer),
    pipedrivePersonId: visit.customer?.pipedriveId || "",
    pipedriveDealId: visit.customer?.pipedriveDealId || "",
    lexwareQuotationId: visit.lexwareQuotationId || "",
    building: clone(visit.building),
    visitNumber: visit.visitNumber || "",
    objectAddress: visit.customer.objectAddress || [
      visit.customer.street,
      [visit.customer.zip, visit.customer.city].filter(Boolean).join(" ")
    ].filter(Boolean).join(", "),
    date: "",
    startTime: "",
    endTime: "",
    pauseMinutes: 0,
    employees: visit.visitEmployee || settings.defaultVisitEmployee || settings.employees?.[0] || "Mike Sprager",
    weather: visit.visitWeather || "",
    outdoorTemp: visit.visitOutdoorTemp || "",
    latitude: visit.visitLatitude || "",
    longitude: visit.visitLongitude || "",
    generalNotes: "",
    chargeHz: "",
    chargeHz2: "",
    chargeHs: "",
    chargeHs2: "",
    chargeResin: "",
    chargeResin2: "",
    bottlesTaken: 0,
    bottlesHanging: 0,
    bottlesArea: "",
    bottlesPickupDue: "",
    bottlesRetrieved: 0,
    bottlesRetrievedAt: "",
    bottlesPickupNote: "",
    bottlesHangingConfirmed: false,
    bottleInventoryOutstanding: 0,
    customerSignature: "",
    workerSignature: "",
    materialBooked: false,
    materialBookedAt: "",
    materialReserved: false,
    materialReservedAt: "",
    materialReservation: [],
    preparationDocuments: clone(visit.documents || []),
    tasks
  };
}


export function recalculateWorksiteTask(settings, task, changedField = "") {
  if (!taskIsTechnical(task)) return task;

  if (task.type === "Harzverpressung") {
    task.plannedHoles = 0;
    task.actualHoles = 0;
    task.plannedLiters = 0;
    task.actualLiters = 0;
    task.targetLitersPerHole = 0;
    return task;
  }

  const wall = Number(task.wall || 30);
  const spacing = [0.125, 0.25].includes(Number(task.spacing)) ? Number(task.spacing) : 0.25;
  task.spacing = spacing;

  // The calculator includes reserve for quotation/loading. On site we use raw consumption only.
  let measure;
  if (task.type === "Flächensperre") {
    const width = Math.max(0, Number(task.actualWidth ?? task.plannedWidth ?? task.plannedQuantity ?? 0));
    const height = Math.max(0, Number(task.actualHeight ?? task.plannedHeight ?? 1));
    task.actualWidth = width;
    task.actualHeight = height;
    task.actualQuantity = width * height;
    measure = {
      type: task.type,
      width,
      height,
      wall,
      spacing,
      extraResinKg: 0
    };
  } else {
    measure = {
      type: task.type,
      length: Number(task.actualQuantity || task.plannedQuantity || 0),
      wall,
      spacing,
      extraResinKg: 0
    };
  }

  const result = calculateMeasure(settings, measure);
  const rawPerHole = result.holes > 0 ? Number(result.rawLiters || 0) / result.holes : 0;

  if (taskUsesHz(task)) {
    const plannedResult = task.type === "Flächensperre"
      ? calculateMeasure(settings, {
          ...measure,
          width: Math.max(0, Number(task.plannedWidth || 0)),
          height: Math.max(0, Number(task.plannedHeight || 0))
        })
      : calculateMeasure(settings, {
          ...measure,
          length: Math.max(0, Number(task.plannedQuantity || 0))
        });
    task.plannedHoles = plannedResult.holes;
    task.plannedLiters = Number(plannedResult.rawLiters || 0);
    task.targetLitersPerHole = rawPerHole;

    if (!Number.isFinite(Number(task.actualHoles)) || Number(task.actualHoles) <= 0) {
      task.actualHoles = result.holes;
    }

    // If actual holes were changed, derive the executed quantity from them.
    if (changedField === "actualHoles") {
      if (task.type === "Horizontalsperre") {
        task.actualQuantity = Number(task.actualHoles || 0) * spacing;
      } else if (task.type === "Flächensperre") {
        task.actualQuantity = Number(task.actualHoles || 0) * spacing * 0.25;
      }
    } else if (!Number(task.actualQuantity)) {
      task.actualQuantity = Number(task.plannedQuantity || 0);
    }

    if (task.type === "Flächensperre") {
      const hasHoleCounts = Number(task.surfaceFirstRowHoles || 0) > 0
        || Number(task.surfaceFollowingRowHoles || 0) > 0;
      const geometryChanged = ["actualWidth", "actualHeight", "spacing"].includes(changedField);
      const holeCountsChanged = ["actualHoles", "surfaceFirstRowHoles", "surfaceFollowingRowHoles"].includes(changedField);
      if (!hasHoleCounts || geometryChanged) {
        const rowCount = Number(measure.height || 0) < 0.125
          ? 0
          : Math.floor((Number(measure.height || 0) - 0.125) / 0.25) + 1;
        const holesPerRow = Math.ceil(Number(measure.width || 0) / spacing);
        task.surfaceFirstRowHoles = rowCount > 0 ? holesPerRow : 0;
        task.surfaceFollowingRowHoles = Math.max(0, rowCount - 1) * holesPerRow;
      } else if (changedField === "actualHoles") {
        const totalHoles = Math.max(0, Math.round(Number(task.actualHoles || 0)));
        const previousRows = Math.max(1, Math.round(Number(task.surfaceRowCount || 0)));
        const holesPerRow = Math.max(1, Math.ceil(totalHoles / previousRows));
        task.surfaceFirstRowHoles = Math.min(totalHoles, holesPerRow);
        task.surfaceFollowingRowHoles = Math.max(0, totalHoles - task.surfaceFirstRowHoles);
      }

      const firstHoles = Math.max(0, Number(task.surfaceFirstRowHoles || 0));
      const followingHoles = Math.max(0, Number(task.surfaceFollowingRowHoles || 0));
      task.actualHoles = firstHoles + followingHoles;
      if (holeCountsChanged && firstHoles > 0) {
        task.surfaceRowCount = Math.max(1, Math.ceil(task.actualHoles / firstHoles));
        task.actualWidth = firstHoles * spacing;
        task.actualQuantity = task.actualHoles * spacing * 0.25;
        task.actualHeight = task.actualWidth > 0 ? task.actualQuantity / task.actualWidth : 0;
      } else {
        task.surfaceRowCount = Number(measure.height || 0) < 0.125
          ? 0
          : Math.floor((Number(measure.height || 0) - 0.125) / 0.25) + 1;
        task.actualQuantity = Number(task.actualWidth || 0) * Number(task.actualHeight || 0);
      }
      task.surfaceFirstRowHeight = 0.125;
      task.surfaceVerticalSpacing = 0.25;

      const spacingFactor = spacing / 0.25;
      const firstPerHole = Math.max(0.2, wall * 14 / 1000 * spacingFactor);
      const followingPerHole = Math.max(0.2, wall * 10 / 1000 * spacingFactor);
      task.surfaceFirstRowMlPerHole = Math.round(firstPerHole * 1000);
      task.surfaceFollowingRowMlPerHole = Math.round(followingPerHole * 1000);
      task.surfaceFirstRowLiters = firstHoles * firstPerHole;
      task.surfaceFollowingRowsLiters = followingHoles * followingPerHole;
      task.actualLiters = task.surfaceFirstRowLiters + task.surfaceFollowingRowsLiters;
      task.actualLitersPerHole = task.actualHoles > 0 ? task.actualLiters / task.actualHoles : 0;
    } else {
      if (!Number(task.actualLitersPerHole) || changedField === "wall" || changedField === "spacing") {
        task.actualLitersPerHole = Math.ceil(rawPerHole * 100) / 100;
      }
      const records = Array.isArray(task.holeRecords) ? task.holeRecords : [];
      task.actualLiters = records.length
        ? records.reduce((sum, record) => sum + Number(record.actualLiters || 0), 0)
        : Number(task.actualHoles || 0) * Number(task.actualLitersPerHole || rawPerHole);
      task.actualLiters = Math.round(Number(task.actualLiters || 0) * 1000) / 1000;
    }
  } else {
    task.plannedHoles = 0;
    task.actualHoles = 0;
    task.plannedLiters = 0;
    task.actualLiters = 0;
    task.targetLitersPerHole = 0;
  }

  if (taskUsesHs(task)) {
    task.plannedHsKg = Number(result.hsKg || 0);
    if (!Number.isFinite(Number(task.actualHsKg)) || Number(task.actualHsKg) < 0) {
      task.actualHsKg = Number(result.hsKg || 0);
    }
  } else {
    task.plannedHsKg = 0;
    task.actualHsKg = 0;
  }

  return task;
}

export function workDurationMinutes(worksite) {
  if (!worksite.startTime || !worksite.endTime) return 0;
  const [sh, sm] = String(worksite.startTime).split(":").map(Number);
  const [eh, em] = String(worksite.endTime).split(":").map(Number);
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

function isWorksiteSetupItem(item = {}) {
  const text = `${item.name || ""} ${item.description || ""}`.toLowerCase();
  return text.includes("baustelleneinrichtung") ||
    text.includes("baustellen-einrichtung") ||
    text.includes("einrichten der baustelle");
}

export function createWorksiteFromLexwareQuotation(settings, quotation) {
  const customerName = quotation.address?.name || quotation.contactName || "Lexware-Kunde";
  const nameParts = String(customerName).trim().split(/\s+/);
  const tasks = (quotation.lineItems || [])
    .filter(item => Number(item.quantity) > 0 && !isWorksiteSetupItem(item))
    .map((item, index) => {
    const type = inferMeasureType(item.name, item.description);
    const quantity = Number(item.quantity || 0);
    const unitName = item.unitName || "Stück";
    const wall = 30;
    const spacing = .25;
    let plannedHoles = 0, plannedLiters = 0, plannedHsKg = 0, targetLitersPerHole = 0;
    if (["Horizontalsperre","Wand-Sohlen-Anschluss"].includes(type)) {
      const result = calculateMeasure(settings,{type,length:quantity,wall,spacing,extraResinKg:0});
      plannedHoles=result.holes; plannedLiters=result.rawLiters; plannedHsKg=result.hsKg||0; targetLitersPerHole=targetPerHole(result);
    } else if (type === "Flächensperre") {
      const result = calculateMeasure(settings,{type,width:quantity,height:1,wall,spacing,extraResinKg:0});
      plannedHoles=result.holes; plannedLiters=result.rawLiters; targetLitersPerHole=targetPerHole(result);
    }
    return baseTask({
      sourceLineItemId: item.id || "",
      sourceArticleId: item.articleId || "",
      sourceArticleNumber: item.articleNumber || "",
      sourceUnitPrice: Number(item.unitPrice?.netAmount || item.unitPrice || 0),
      areaName: item.name || `Position ${index + 1}`,
      workArea: "",
      wallMaterial: "",
      isInteriorWall: false,
      isExteriorWall: false,
      type,
      wall: taskIsTechnical({ type }) && type !== "Harzverpressung" ? wall : 0,
      originalWall: taskIsTechnical({ type }) && type !== "Harzverpressung" ? wall : 0,
      spacing: taskUsesHz({ type }) ? spacing : 0,
      plannedQuantity: quantity,
      actualQuantity: quantity,
      unitName,
      scope: `${quantity.toLocaleString("de-DE")} ${unitName}`,
      plannedHoles: taskUsesHz({ type }) ? plannedHoles : 0,
      actualHoles: taskUsesHz({ type }) ? plannedHoles : 0,
      plannedLiters: taskUsesHz({ type }) ? plannedLiters : 0,
      actualLiters: taskUsesHz({ type }) ? plannedLiters : 0,
      plannedHsKg: taskUsesHs({ type }) ? plannedHsKg : 0,
      actualHsKg: taskUsesHs({ type }) ? plannedHsKg : 0,
      targetLitersPerHole: taskUsesHz({ type }) ? targetLitersPerHole : 0,
      actualLitersPerHole: taskUsesHz({ type }) ? Math.ceil(targetLitersPerHole * 100) / 100 : 0,
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
  return {id:crypto.randomUUID(),offerRecordId:"",pipedrivePersonId:"",pipedriveDealId:"",lexwareQuotationId:quotation.id||"",lexwareVoucherNumber:quotation.voucherNumber||"",status:"planning",createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),customer:{salutation:contact.salutation||"",firstName:contact.firstName||(nameParts.length>1?nameParts.slice(0,-1).join(" "):""),lastName:contact.lastName||(nameParts.at(-1)||customerName),company:contact.company||"",phone:contact.phone||"",email:contact.email||"",street:address.street||contact.street||"",zip:address.zip||contact.zip||"",city:address.city||contact.city||"",objectAddress,lexwareContactId:contact.id||quotation.contactId||""},building:{},visitNumber:quotation.voucherNumber||"",objectAddress,date:"",startTime:"",endTime:"",pauseMinutes:0,employees:settings.defaultVisitEmployee||settings.employees?.[0]||"Mike Sprager",weather:"",outdoorTemp:"",latitude:"",longitude:"",generalNotes:"",customerSignature:"",workerSignature:"",materialBooked:false,materialBookedAt:"",materialReserved:false,materialReservedAt:"",materialReservation:[],tasks};
}
