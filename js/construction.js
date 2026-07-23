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
  if (result.holes <= 0) return 0;
  return Math.max(0.2, result.rawLiters / result.holes);
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
  if (!["Horizontalsperre","Flächensperre","Wand-Sohlen-Anschluss"].includes(task.type)) return task;
  let measure;
  if (task.type === "Flächensperre") {
    measure={type:task.type,width:Number(task.plannedQuantity||0),height:1,wall:Number(task.wall||30),spacing:Number(task.spacing||.25),extraResinKg:0};
  } else {
    measure={type:task.type,length:Number(task.plannedQuantity||0),wall:Number(task.wall||30),spacing:Number(task.spacing||.25),extraResinKg:0};
  }
  const result=calculateMeasure(settings,measure);
  task.plannedHoles=result.holes;
  task.actualHoles=result.holes;
  task.plannedLiters=result.saleLiters;
  task.actualLiters=result.saleLiters;
  task.plannedHsKg=result.hsKg||0;
  task.actualHsKg=result.hsKg||0;
  task.targetLitersPerHole=targetPerHole(result);
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


function inferMeasureType(name, description = "") {
  const text = `${name} ${description}`.toLowerCase();
  if (text.includes("wand-sohlen") || text.includes("wand sohlen") || text.includes("wand/sohle")) return "Wand-Sohlen-Anschluss";
  if (text.includes("flächensperre") || text.includes("flaechensperre")) return "Flächensperre";
  if (text.includes("horizontalsperre")) return "Horizontalsperre";
  if (text.includes("harzverpress")) return "Harzverpressung";
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
    return {id:crypto.randomUUID(),areaId:"",areaName:item.name||`Position ${index+1}`,measureId:"",type,wall,spacing,plannedQuantity:quantity,unitName,scope:`${quantity.toLocaleString("de-DE")} ${unitName}`,plannedHoles,actualHoles:plannedHoles,plannedLiters,actualLiters:plannedLiters,plannedHsKg,actualHsKg:plannedHsKg,targetLitersPerHole,injectionType:"Niederdruckverfahren",chargeHz:"",chargeSecondary:"",packers:0,resinKg:0,completed:false,note:item.description||"",photos:[]};
  });
  return {id:crypto.randomUUID(),offerRecordId:"",pipedrivePersonId:"",pipedriveDealId:"",lexwareQuotationId:quotation.id||"",lexwareVoucherNumber:quotation.voucherNumber||"",status:"planned",createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),customer:{salutation:"",firstName:nameParts.length>1?nameParts.slice(0,-1).join(" "):"",lastName:nameParts.at(-1)||customerName,company:"",phone:quotation.contact?.phone||"",email:quotation.contact?.email||"",street:quotation.address?.street||"",zip:quotation.address?.zip||"",city:quotation.address?.city||"",objectAddress:[quotation.address?.street,[quotation.address?.zip,quotation.address?.city].filter(Boolean).join(" ")].filter(Boolean).join(", ")},building:{},visitNumber:quotation.voucherNumber||"",objectAddress:[quotation.address?.street,[quotation.address?.zip,quotation.address?.city].filter(Boolean).join(" ")].filter(Boolean).join(", "),date:new Date().toISOString().slice(0,10),startTime:"",endTime:"",pauseMinutes:0,employees:"Mike Sprager",weather:"",outdoorTemp:"",latitude:"",longitude:"",generalNotes:`Importiert aus Lexware-Angebot ${quotation.voucherNumber||""}`,customerSignature:"",workerSignature:"",materialBooked:false,materialBookedAt:"",tasks};
}
