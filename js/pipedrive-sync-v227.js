import { state, saveState } from "./storage-v227.js";
import { parseDecimal } from "./utils-v227.js";

export const FIELD_DEFINITIONS = [
  ["objectAddress", "Objektanschrift"],
  ["visitNumber", "Besichtigungsnummer"],
  ["visitDate", "Erstbesuch / Besichtigungsdatum"],
  ["measurementDevice", "Messgerät"],
  ["roomTemp", "Raumtemperatur"],
  ["humidity", "Luftfeuchtigkeit"],
  ["damageDescription", "Schadensbild / Mängel"],
  ["wallMaterial", "Wandmaterial"],
  ["wallThickness", "Wandstärke"],
  ["measures", "Sanierungsempfehlung / Maßnahmen"],
  ["offerNumber", "Angebotsnummer"],
  ["offerDate", "Angebotsdatum"],
  ["offerValue", "Angebotswert"],
  ["workDate", "Ausführungsdatum"],
  ["employees", "Mitarbeiter"],
  ["startTime", "Arbeitsbeginn"],
  ["endTime", "Arbeitsende"],
  ["holes", "Bohrlochanzahl"],
  ["spacing", "Bohrlochabstand"],
  ["litersPerHole", "Injektionsmenge je Bohrloch"],
  ["hzLiters", "Verbrauch BKM HZ 250 Pro"],
  ["hzCharge", "Chargennummer BKM HZ 250 Pro"],
  ["hsKg", "Verbrauch BKM HS Sperrmörtel"],
  ["packers", "Packeranzahl"],
  ["resinKg", "Harzverbrauch"],
  ["workNotes", "Ausführung / Besonderheiten"]
];

export const STAGE_DEFINITIONS = [
  ["inquiry", "Anfragen"],
  ["contactMade", "Kontakt hergestellt"],
  ["waitingCustomer", "Warten auf Kundenrückmeldung"],
  ["onsiteAppointment", "Termin vor Ort"],
  ["writeOffer", "Angebot schreiben"],
  ["offerSent", "Angebot versendet"],
  ["executionPlanned", "Ausführung geplant"],
  ["executionCompleted", "Ausführung abgeschlossen"],
  ["awaitingPayment", "Warten auf Zahlung"],
  ["closed", "Auftrag abgeschlossen"]
];

function normalize(value) {
  return String(value || "").toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ").trim();
}

const FIELD_HINTS = {
  objectAddress:["objektanschrift","objekt adresse","adresse objekt"],
  visitNumber:["besichtigungsnummer","besichtigung nr"],
  visitDate:["erstbesuch","besichtigungsdatum"],
  measurementDevice:["messgerat","messgerät"],
  roomTemp:["raumtemperatur","temperatur"],
  humidity:["luftfeuchtigkeit"],
  damageDescription:["schadensbild","mangel","mängel"],
  wallMaterial:["wandmaterial","mauerwerk"],
  wallThickness:["wandstarke","wandstärke","mauerwerksstarke"],
  measures:["sanierungsempfehlung","massnahme","maßnahme"],
  offerNumber:["angebotsnummer","ag nummer"],
  offerDate:["angebotsdatum"],
  offerValue:["angebotswert","angebotssumme"],
  workDate:["ausfuhrungsdatum","ausführung datum"],
  employees:["mitarbeiter"],
  startTime:["arbeitsbeginn"],
  endTime:["arbeitsende"],
  holes:["bohrlochanzahl","bohrlocher","bohrlöcher"],
  spacing:["bohrlochabstand"],
  litersPerHole:["menge je bohrloch","injektionsmenge je bohrloch"],
  hzLiters:["verbrauchtes material","hz verbrauch","hz250 verbrauch"],
  hzCharge:["hz charge","chargennummer hz","charge bkm hz"],
  hsKg:["hs sperrmortel","hs sperrmörtel","hs verbrauch"],
  packers:["packeranzahl","packer"],
  resinKg:["harzverbrauch","harz kg"],
  workNotes:["ausfuhrung","ausführung","besonderheiten","arbeitsnachweis"]
};

export function autoMapFields(fields) {
  const result={};
  for (const [key] of FIELD_DEFINITIONS) {
    const hints=(FIELD_HINTS[key]||[]).map(normalize);
    const match=(fields||[]).find(field => {
      const name=normalize(field.name || field.fieldName);
      return hints.some(hint => name.includes(hint) || hint.includes(name));
    });
    if (match) result[key]=match.key || match.code || match.fieldCode;
  }
  return result;
}

export function autoMapStages(stages) {
  const result={};
  for (const [key,label] of STAGE_DEFINITIONS) {
    const target=normalize(label);
    const match=(stages||[]).find(stage => {
      const name=normalize(stage.name);
      return name===target || name.includes(target) || target.includes(name);
    });
    if (match) result[key]=String(match.id);
  }
  return result;
}

export function addSyncLog(action, ok, message, details={}) {
  const cfg=state.settings.pipedriveSync ||= {fields:[],stages:[],fieldMappings:{},stageMappings:{},log:[]};
  cfg.log ||= [];
  cfg.log.unshift({id:crypto.randomUUID(),time:new Date().toISOString(),action,ok,message,details});
  cfg.log=cfg.log.slice(0,100);
  saveState();
}

function mappedCustomFields(values) {
  const sync=state.settings.pipedriveSync || {};
  const mappings=sync.fieldMappings || {};
  const fields=sync.fields || [];
  const custom={};
  for (const [key,value] of Object.entries(values)) {
    const fieldKey=mappings[key];
    if (!fieldKey || value === undefined || value === null || value === "") continue;
    const field=fields.find(item => (item.key || item.code) === fieldKey);
    const type=String(field?.type || "").toLowerCase();
    if (type === "enum") {
      const option=(field.options||[]).find(item => normalize(item.label) === normalize(value));
      if (option) custom[fieldKey]=option.id;
      continue;
    }
    if (type === "set") {
      const labels=String(value).split(",").map(item=>normalize(item));
      const ids=(field.options||[]).filter(item=>labels.includes(normalize(item.label))).map(item=>item.id);
      if (ids.length) custom[fieldKey]=ids;
      continue;
    }
    if (["double","monetary"].includes(type)) {
      custom[fieldKey]=parseDecimal(value);
      if (type === "monetary") custom[`${fieldKey}_currency`]="EUR";
      continue;
    }
    if (type === "time") {
      const time=String(value);
      custom[fieldKey]=/^\d{2}:\d{2}$/.test(time) ? `${time}:00` : time;
      continue;
    }
    custom[fieldKey]=value;
  }
  return custom;
}

export function visitSyncValues(visit, offer={}) {
  const areas=visit.areas||[];
  const firstMeasurement=areas.flatMap(a=>a.measurements||[])[0] || {};
  const measureNames=[...new Set(areas.flatMap(a=>(a.measures||[]).map(m=>m.type)))].join(", ");
  return mappedCustomFields({
    objectAddress:visit.customer?.objectAddress || [visit.customer?.street,[visit.customer?.zip,visit.customer?.city].filter(Boolean).join(" ")].filter(Boolean).join(", "),
    visitNumber:visit.visitNumber,
    visitDate:visit.visitDate,
    measurementDevice:firstMeasurement.device,
    roomTemp:parseDecimal(visit.building?.roomTemp),
    humidity:parseDecimal(visit.building?.humidity),
    damageDescription:visit.damageDescription,
    wallMaterial:[...new Set(areas.map(a=>a.wallMaterialOther||a.wallMaterial).filter(Boolean))].join(", "),
    wallThickness:[...new Set(areas.map(a=>a.wallThickness).filter(Boolean))].join(", "),
    measures:measureNames,
    offerNumber:offer.offerNumber,
    offerDate:offer.offerDate,
    offerValue:offer.offerValue
  });
}

export function worksiteSyncValues(worksite) {
  const tasks=worksite.tasks||[];
  const sum=key=>tasks.reduce((total,t)=>total+parseDecimal(t[key]),0);
  const charges=[...new Set(tasks.map(t=>t.chargeHz).filter(Boolean))].join(", ");
  const notes=tasks.map(t=>`${t.areaName} – ${t.type}: ${t.note||"ausgeführt"}`).join("\n");
  return mappedCustomFields({
    objectAddress:worksite.objectAddress,
    workDate:worksite.date,
    employees:worksite.employees,
    startTime:worksite.startTime,
    endTime:worksite.endTime,
    holes:sum("actualHoles"),
    spacing:[...new Set(tasks.map(t=>t.spacing).filter(Boolean))].join(", "),
    litersPerHole:[...new Set(tasks.map(t=>parseDecimal(t.targetLitersPerHole).toFixed(3)).filter(v=>v!=="0.000"))].join(", "),
    hzLiters:sum("actualLiters"),
    hzCharge:charges,
    hsKg:sum("actualHsKg"),
    packers:sum("packers"),
    resinKg:sum("resinKg"),
    workNotes:[worksite.generalNotes,notes].filter(Boolean).join("\n\n")
  });
}

export function stageId(key) {
  const value=state.settings.pipedriveSync?.stageMappings?.[key];
  return value ? Number(value) : undefined;
}
