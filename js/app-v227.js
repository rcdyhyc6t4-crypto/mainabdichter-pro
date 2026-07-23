import { state, saveState, resetVisit, resetSettings, loadArchive, saveArchive, archiveCurrentOffer, deleteArchiveRecord, replaceArchive, createFullBackupPayload, restoreFullBackupPayload } from "./storage-v227.js";
import { createArea } from "./defaults-v227.js";
import { calculateOffer, calculateMeasure, calculatePriceStrategies } from "./calculator-v227.js";
import { $, eur, num, esc, showStatus, bindSpeechButtons, parseDecimal, formatDecimalInput } from "./utils-v227.js";
import { hasConnectionConfig, searchPipedrive, loadPipedrivePerson, searchLexwareCustomers, loadLexwareCustomer, loadLexwareArticles, testConnections, createLexwareQuotation, createPipedrivePerson, loadPipedriveActivities, loadAcceptedLexwareQuotations, loadAcceptedLexwareQuotation,loadPipedriveDealContext,loadLexwareCustomerHistory, loadPipedriveDealFields, loadPipedriveStages, syncPipedriveDeal, addPipedriveDealNote, uploadPipedriveDealFile } from "./api-v227.js";
import { buildExecutionNotices } from "./texts-v227.js";
import { compressImage, recognizeScreenshot, parseInquiryText } from "./importer-v227.js";
import { loadWorksites, saveWorksite as persistWorksite, getWorksite, deleteWorksite, createWorksiteFromVisit, createWorksiteFromLexwareQuotation, workDurationMinutes, worksiteMaterialTotals, recalculateWorksiteTask } from "./construction-v227.js";
import { FIELD_DEFINITIONS, STAGE_DEFINITIONS, autoMapFields, autoMapStages, addSyncLog, visitSyncValues, worksiteSyncValues, stageId } from "./pipedrive-sync-v227.js";
import { createWorksitePdf, createVisitPdf, downloadBlob } from "./pdf-v227.js";
import { addWorksiteAttachment, listWorksiteAttachments, updateWorksiteAttachment, deleteWorksiteAttachment, safeAttachmentFilename } from "./attachments-v227.js";
function applyInputModes(root = document) {
  const decimalSelectors = [
    'input[type="number"]',
    '[data-mf="value"]',
    '[data-mf="height"]',
    '[data-mfield="length"]',
    '[data-mfield="width"]',
    '[data-mfield="height"]',
    '[data-mfield="extraResinKg"]',
    '[data-extra-qty]',
    '[data-extra-field="grossPrice"]',
    '[data-inventory-field="stock"]',
    '[data-inventory-field="minimumStock"]',
    '[data-inventory-field="packageSize"]',
    '[data-inventory-field="purchaseNet"]'
  ];

  root.querySelectorAll(decimalSelectors.join(",")).forEach(input => {
    // type="text" ist notwendig, weil Safari bei type="number" ein Komma
    // je nach Tastatur und Region teilweise ablehnt.
    if (input.type === "number") input.type = "text";
    input.setAttribute("inputmode", "decimal");
    input.setAttribute("autocomplete", "off");

    if (!input.dataset.decimalReady) {
      input.dataset.decimalReady = "true";
      input.addEventListener("blur", () => {
        if (input.value.trim() !== "") {
          input.value = formatDecimalInput(input.value);
          input.dispatchEvent(new Event("change", { bubbles: true }));
        }
      });
    }

    if (input.value !== "" && document.activeElement !== input) {
      input.value = formatDecimalInput(input.value);
    }
  });
}
let activeArchiveId = null;


const customerFields = ["salutation","firstName","lastName","company","phone","email","street","zip","city","objectAddress"];
const buildingFields = ["yearBuilt","buildingType","floor","roomUse","foundationType","floorCover","roomTemp","humidity","surfaceTemp","dewPoint"];


function todayLocal() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

function timeLocal() {
  return new Date().toTimeString().slice(0, 5);
}

function createVisitNumber() {
  const date = (state.visit.visitDate || todayLocal()).replaceAll("-", "");
  const stamp = String(Date.now()).slice(-4);
  return `${date}-${stamp}`;
}

function updateVisitDuration() {
  const start = $("visitStartTime")?.value;
  const end = $("visitEndTime")?.value;
  if (!start || !end) {
    if ($("visitDuration")) $("visitDuration").value = "";
    return;
  }

  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  let minutes = eh * 60 + em - (sh * 60 + sm);
  if (minutes < 0) minutes += 24 * 60;

  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  const text = hours > 0
    ? `${hours} Std. ${rest} Min.`
    : `${rest} Min.`;

  $("visitDuration").value = text;
}

function weatherDescription(code) {
  const descriptions = {
    0: "klar",
    1: "überwiegend klar",
    2: "teilweise bewölkt",
    3: "bedeckt",
    45: "Nebel",
    48: "Reifnebel",
    51: "leichter Nieselregen",
    53: "Nieselregen",
    55: "starker Nieselregen",
    61: "leichter Regen",
    63: "Regen",
    65: "starker Regen",
    71: "leichter Schneefall",
    73: "Schneefall",
    75: "starker Schneefall",
    80: "leichte Regenschauer",
    81: "Regenschauer",
    82: "starke Regenschauer",
    95: "Gewitter",
    96: "Gewitter mit Hagel",
    99: "starkes Gewitter mit Hagel"
  };
  return descriptions[Number(code)] || `Wettercode ${code}`;
}

async function fetchWeatherForLocation() {
  const latitude = Number(state.visit.visitLatitude || $("visitLatitude").value);
  const longitude = Number(state.visit.visitLongitude || $("visitLongitude").value);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    showStatus("locationWeatherStatus", "Bitte zuerst den GPS-Standort übernehmen.", false);
    return;
  }

  showStatus("locationWeatherStatus", "Wetterdaten werden abgerufen …", true);

  try {
    const url = new URL("https://api.open-meteo.com/v1/forecast");
    url.searchParams.set("latitude", latitude);
    url.searchParams.set("longitude", longitude);
    url.searchParams.set("current", "temperature_2m,precipitation,weather_code");
    url.searchParams.set("timezone", "auto");

    const response = await fetch(url);
    const data = await response.json();

    if (!response.ok || !data.current) {
      throw new Error(data.reason || "Wetterdaten konnten nicht abgerufen werden.");
    }

    state.visit.visitWeather = weatherDescription(data.current.weather_code);
    state.visit.visitOutdoorTemp = Number(data.current.temperature_2m).toFixed(1);
    state.visit.visitPrecipitation = Number(data.current.precipitation).toFixed(1);

    $("visitWeather").value = state.visit.visitWeather;
    $("visitOutdoorTemp").value = state.visit.visitOutdoorTemp;
    $("visitPrecipitation").value = state.visit.visitPrecipitation;

    saveState();
    showStatus("locationWeatherStatus", "Standortbezogene Wetterdaten wurden gespeichert.", true);
  } catch (error) {
    showStatus("locationWeatherStatus", error.message, false);
  }
}




function customerName(customer) {
  return [customer?.salutation, customer?.firstName, customer?.lastName]
    .filter(Boolean).join(" ") || customer?.company || "Kunde";
}

async function ensurePipedrivePerson(customer) {
  if (customer?.pipedriveId) return String(customer.pipedriveId);
  const response = await createPipedrivePerson({
    name: customerName(customer),
    email: customer?.email || "",
    phone: customer?.phone || "",
    street: customer?.street || "",
    zip: customer?.zip || "",
    city: customer?.city || "",
    source: "mainabdichter-App"
  });
  customer.pipedriveId = String(response.person?.id || "");
  saveState();
  return customer.pipedriveId;
}

async function syncVisitDeal(stageKey, extra = {}) {
  const customer = state.visit.customer;
  const personId = await ensurePipedrivePerson(customer);
  const title = `${customerName(customer)} – ${customer.objectAddress || customer.city || "Anfrage"}`;
  const response = await syncPipedriveDeal({
    dealId: customer.pipedriveDealId || "",
    personId,
    title,
    stageId: stageId(stageKey),
    value: extra.offerValue,
    currency: "EUR",
    customFields: visitSyncValues(state.visit, extra),
    note: extra.note || ""
  });
  customer.pipedriveDealId = String(response.deal?.id || customer.pipedriveDealId || "");
  saveState();
  addSyncLog(`Deal ${stageKey}`, true, `${title} wurde synchronisiert.`, {dealId:customer.pipedriveDealId});
  return response;
}

function dataUrlToBlob(dataUrl) {
  const [header, data] = String(dataUrl || "").split(",");
  const mime = (header.match(/data:([^;]+)/) || [])[1] || "image/jpeg";
  const bytes = atob(data || "");
  const array = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) array[i] = bytes.charCodeAt(i);
  return new Blob([array], { type: mime });
}

function worksiteFilePrefix(worksite) {
  const name = worksiteCustomerName(worksite).replace(/[^a-zA-Z0-9ÄÖÜäöüß_-]+/g,"_");
  return `${worksite.date || new Date().toISOString().slice(0,10)}_${name}`;
}

async function uploadWorksiteAttachments(worksite) {
  if (!worksite.pipedriveDealId) throw new Error("Für den Datei-Upload fehlt die Pipedrive-Deal-ID.");
  const errors = [];
  let uploadedCount = 0;
  const prefix = worksiteFilePrefix(worksite);
  const attachments = await listWorksiteAttachments(worksite.id);

  for (const item of attachments) {
    if (item.uploadStatus === "uploaded" && item.pipedriveFileId) continue;
    try {
      item.uploadStatus = "uploading";
      item.error = "";
      await updateWorksiteAttachment(item);
      const filename = safeAttachmentFilename(item, prefix);
      const result = await uploadPipedriveDealFile(worksite.pipedriveDealId, item.blob, filename);
      item.uploadStatus = "uploaded";
      item.uploadedAt = new Date().toISOString();
      item.pipedriveFileId = String(result.file?.id || "");
      item.error = "";
      await updateWorksiteAttachment(item);
      uploadedCount++;
    } catch (error) {
      item.uploadStatus = "error";
      item.error = error.message;
      await updateWorksiteAttachment(item);
      errors.push(`${item.filename}: ${error.message}`);
    }
  }

  for (const task of worksite.tasks || []) {
    for (const photo of task.photos || []) {
      if (photo.pipedriveFileId) continue;
      try {
        const blob = dataUrlToBlob(photo.src);
        const ext = blob.type.includes("png") ? "png" : "jpg";
        const filename = `${prefix}_${String(photo.category || "Foto").replace(/\\W+/g,"_")}_${photo.id}.${ext}`;
        const result = await uploadPipedriveDealFile(worksite.pipedriveDealId, blob, filename);
        photo.pipedriveFileId = String(result.file?.id || "");
        photo.uploadedAt = new Date().toISOString();
        photo.uploadError = "";
        uploadedCount++;
      } catch (error) {
        photo.uploadError = error.message;
        errors.push(`${task.areaName} / ${photo.category}: ${error.message}`);
      }
    }
  }

  persistWorksite(worksite);
  return { uploadedCount, errors };
}

async function syncWorksiteDeal(worksite, stageKey = null, pdf = null) {
  const personId = worksite.pipedrivePersonId || await ensurePipedrivePerson(worksite.customer);
  worksite.pipedrivePersonId = personId;
  const response = await syncPipedriveDeal({
    dealId: worksite.pipedriveDealId || worksite.customer?.pipedriveDealId || "",
    personId,
    title: `${worksiteCustomerName(worksite)} – ${worksite.objectAddress || "Baustelle"}`,
    stageId: stageKey ? stageId(stageKey) : undefined,
    customFields: worksiteSyncValues(worksite),
    note: `Baustellenstatus: ${worksite.status || "geplant"}<br>Arbeitsnachweis zuletzt synchronisiert: ${new Date().toLocaleString("de-DE")}`
  });
  worksite.pipedriveDealId = String(response.deal?.id || worksite.pipedriveDealId || "");
  worksite.customer.pipedriveDealId = worksite.pipedriveDealId;

  if (pdf && worksite.pipedriveDealId) {
    const uploaded = await uploadPipedriveDealFile(worksite.pipedriveDealId, pdf.blob, pdf.filename);
    worksite.pipedriveReportFileId = String(uploaded.file?.id || "");
    worksite.pipedriveReportUploadedAt = new Date().toISOString();
  }

  const attachmentResult = await uploadWorksiteAttachments(worksite);
  worksite.pipedriveSyncedAt = new Date().toISOString();
  worksite.lastAttachmentUpload = {
    uploadedCount: attachmentResult.uploadedCount,
    errors: attachmentResult.errors,
    at: new Date().toISOString()
  };
  persistWorksite(worksite);
  addSyncLog("Arbeitsnachweis", attachmentResult.errors.length === 0,
    attachmentResult.errors.length
      ? `${worksiteCustomerName(worksite)} synchronisiert, aber ${attachmentResult.errors.length} Datei(en) fehlgeschlagen.`
      : `${worksiteCustomerName(worksite)} und alle Unterlagen wurden mit Pipedrive synchronisiert.`,
    {dealId:worksite.pipedriveDealId,fileId:worksite.pipedriveReportFileId||"",attachments:attachmentResult.uploadedCount});
  if (attachmentResult.errors.length) {
    throw new Error(
      "Baustellendaten wurden synchronisiert, aber Dateien konnten nicht vollständig hochgeladen werden:\n" +
      attachmentResult.errors.join("\n")
    );
  }
  return response;
}

let inquiryScreenshotData = "";

function openInquiryImport() {
  inquiryScreenshotData = "";
  $("inquiryScreenshot").value = "";
  if ($("inquiryCamera")) $("inquiryCamera").value = "";
  $("inquiryPreview").src = "";
  $("inquiryPreview").classList.add("hidden");
  $("inquiryReview").classList.add("hidden");
  $("ocrProgressWrap").classList.add("hidden");
  showStatus("inquiryImportStatus","Screenshot auswählen.",true);
  show("inquiryImport");
}

function fillInquiryReview(data) {
  const values = {importSource:data.source,importFirstName:data.firstName,importLastName:data.lastName,importPhone:data.phone,importEmail:data.email,importStreet:data.street,importZip:data.zip,importCity:data.city,importOwnerStatus:data.ownerStatus,importAppointment:data.appointment,importMessage:data.message,importRawText:data.rawText};
  Object.entries(values).forEach(([id,value]) => { if ($(id)) $(id).value = value || ""; });
  $("importSalutation").value = data.salutation || "";
  $("inquiryReview").classList.remove("hidden");
  $("inquiryReview").scrollIntoView({behavior:"smooth",block:"start"});
}

async function handleInquiryScreenshot(file) {
  if (!file) return;
  $("inquiryReview").classList.add("hidden");
  $("ocrProgressWrap").classList.remove("hidden");
  $("ocrProgress").value = 0; $("ocrProgressLabel").textContent = "0 %";
  showStatus("inquiryImportStatus","Bild wird vorbereitet und gelesen …",true);
  try {
    inquiryScreenshotData = await compressImage(file);
    $("inquiryPreview").src = inquiryScreenshotData; $("inquiryPreview").classList.remove("hidden");
    const text = await recognizeScreenshot(inquiryScreenshotData, progress => { $("ocrProgress").value = progress; $("ocrProgressLabel").textContent = `${progress} %`; });
    fillInquiryReview(parseInquiryText(text));
    showStatus("inquiryImportStatus","Daten erkannt. Bitte kurz prüfen.",true);
  } catch(error) { showStatus("inquiryImportStatus",error.message,false); }
  finally { $("ocrProgressWrap").classList.add("hidden"); }
}

function readInquiryReview() {
  return {source:$("importSource").value.trim() || "Screenshot",salutation:$("importSalutation").value,firstName:$("importFirstName").value.trim(),lastName:$("importLastName").value.trim(),phone:$("importPhone").value.trim(),email:$("importEmail").value.trim(),street:$("importStreet").value.trim(),zip:$("importZip").value.trim(),city:$("importCity").value.trim(),ownerStatus:$("importOwnerStatus").value.trim(),appointment:$("importAppointment").value.trim(),message:$("importMessage").value.trim(),rawText:$("importRawText").value.trim()};
}

async function acceptInquiryImport() {
  const data = readInquiryReview();
  if (!data.firstName && !data.lastName) { showStatus("inquiryImportStatus","Bitte einen Namen eintragen.",false); return; }
  resetVisit(); state.visit.visitDate=todayLocal(); state.visit.visitStartTime=timeLocal(); state.visit.visitNumber=createVisitNumber();
  Object.assign(state.visit.customer,{salutation:data.salutation,firstName:data.firstName,lastName:data.lastName,phone:data.phone,email:data.email,street:data.street,zip:data.zip,city:data.city,objectAddress:[data.street,[data.zip,data.city].filter(Boolean).join(" ")].filter(Boolean).join(", ")});
  state.visit.damageDescription=data.message;
  state.visit.inquiry={source:data.source,ownerStatus:data.ownerStatus,appointment:data.appointment,message:data.message,rawText:data.rawText,screenshot:inquiryScreenshotData,importedAt:new Date().toISOString()};
  saveState();
  let pipedriveMessage="";
  if ($("importCreatePipedrive").checked) {
    try {
      const response=await createPipedrivePerson({name:[data.firstName,data.lastName].filter(Boolean).join(" "),email:data.email,phone:data.phone,street:data.street,zip:data.zip,city:data.city,source:data.source,ownerStatus:data.ownerStatus,appointment:data.appointment,message:data.message});
      state.visit.customer.pipedriveId=String(response.person?.id || ""); saveState();
      const dealResponse = await syncVisitDeal("inquiry", {
        note: `<strong>Neue Anfrage über ${esc(data.source)}</strong><br>${esc(data.message || "").replace(/\n/g,"<br>")}`
      });
      pipedriveMessage=(response.created ? " Kontakt wurde in Pipedrive angelegt." : " Vorhandener Pipedrive-Kontakt wurde verwendet.") + ` Deal ${dealResponse.created ? "angelegt" : "aktualisiert"}.`;
    } catch(error) { pipedriveMessage=` Pipedrive konnte nicht aktualisiert werden: ${error.message}`; }
  }
  renderVisit(); show("visit");
  showStatus("visitStatus",`Anfrage wurde übernommen.${pipedriveMessage}`,!pipedriveMessage.includes("konnte nicht"));
}


let cachedAcceptedQuotations = [];

function todayIso() { return new Date().toISOString().slice(0,10); }

function contextEmpty(t="Keine Informationen vorhanden."){return `<div class="empty-mini">${esc(t)}</div>`;}function contextDate(v){if(!v)return"–";const d=new Date(v);return Number.isNaN(d.getTime())?String(v):d.toLocaleString("de-DE");}function localRecordContext(c,address){const e=String(c?.email||"").toLowerCase(),p=String(c?.phone||"").replace(/\D/g,""),ad=String(address||c?.objectAddress||"").toLowerCase();const m=i=>{const x=i?.visit?.customer||i?.customer||{};return Boolean((e&&String(x.email||"").toLowerCase()===e)||(p&&String(x.phone||"").replace(/\D/g,"").endsWith(p.slice(-8)))||(ad&&String(i.objectAddress||x.objectAddress||[x.street,x.zip,x.city].filter(Boolean).join(" ")).toLowerCase()===ad));};return{localVisits:loadArchive().filter(m),localWorksites:loadWorksites().filter(m)};}function renderRecordContext(){const c=state.visit.recordContext||{},card=$("recordContextCard");if(!card)return;if(!c.loaded&&!c.error){card.classList.add("hidden");return;}card.classList.remove("hidden");showStatus("recordContextStatus",c.error?`Bauakte nur teilweise geladen: ${c.error}`:`Bauakte geladen: ${contextDate(c.loadedAt)}`,!c.error);const d=c.deal||{},p=c.person||{};$("recordContextSummary").innerHTML=`<div class="record-alert"><strong>${(c.relatedDeals?.length||c.localWorksites?.length)?"Es bestehen bereits Vorgänge zu diesem Kunden/Objekt.":"Keine frühere Ausführung gefunden."}</strong><span>${esc(d.title||"Aktueller Vorgang")}</span>${c.caseType?`<span class="case-type-badge">Vorgangsart: ${esc(c.caseType)}</span>`:""}</div>`;const caseButtons={Reklamation:$("contextTypeComplaint"),Nachkontrolle:$("contextTypeFollowup"),Folgeauftrag:$("contextTypeFollowOn")};Object.entries(caseButtons).forEach(([type,button])=>{if(!button)return;button.classList.toggle("selected-case-type",c.caseType===type);button.setAttribute("aria-pressed",c.caseType===type?"true":"false");});$("contextDeal").innerHTML=d.id?`<div class="context-list"><div><span>Deal</span><strong>${esc(d.title||"–")}</strong></div><div><span>Phase</span><strong>${esc(d.stage_name||d.stage?.name||"–")}</strong></div><div><span>Status</span><strong>${esc(d.status||"–")}</strong></div><div><span>Wert</span><strong>${d.value?eur(d.value):"–"}</strong></div><div><span>Kontakt</span><strong>${esc(p.name||[p.firstName,p.lastName].filter(Boolean).join(" ")||"–")}</strong></div></div>`:contextEmpty();$("contextNotes").innerHTML=(c.notes||[]).length?c.notes.map(n=>`<article class="context-entry"><small>${esc(contextDate(n.add_time||n.update_time))}</small><div>${n.content||esc(n.note||"")}</div></article>`).join(""):contextEmpty();$("contextActivities").innerHTML=(c.activities||[]).length?c.activities.map(i=>`<article class="context-entry"><strong>${esc(i.subject||i.type||"Aktivität")}</strong><small>${esc([i.due_date,i.due_time].filter(Boolean).join(" "))}</small><p>${esc(i.note||"")}</p></article>`).join(""):contextEmpty();$("contextFiles").innerHTML=(c.files||[]).length?c.files.map(f=>`<article class="context-entry"><strong>${esc(f.name||"Dokument")}</strong><small>${esc(contextDate(f.add_time))}</small>${f.url?`<a href="${esc(f.url)}" target="_blank">In Pipedrive öffnen</a>`:""}</article>`).join(""):contextEmpty();$("contextRelatedDeals").innerHTML=(c.relatedDeals||[]).length?c.relatedDeals.map(i=>`<article class="context-entry"><strong>${esc(i.title||"Deal")}</strong><small>${esc(i.status||"")}</small><p>${i.value?eur(i.value):""}</p></article>`).join(""):contextEmpty();$("contextLexware").innerHTML=(c.lexwareDocuments||[]).length?c.lexwareDocuments.map(i=>`<article class="context-entry"><strong>${esc(i.voucherNumber||i.voucherType||"Dokument")}</strong><small>${esc(i.voucherDate||"")} · ${esc(i.voucherStatus||"")}</small><p>${i.totalAmount?eur(i.totalAmount):""}</p></article>`).join(""):contextEmpty("Keine Lexware-Dokumente gefunden.");const l=[...(c.localVisits||[]).map(i=>({t:"Besichtigung/Angebot",d:i.visitDate||i.createdAt,x:i.objectAddress})),...(c.localWorksites||[]).map(i=>({t:"Baustelle/Arbeitsnachweis",d:i.date||i.createdAt,x:i.objectAddress}))];$("contextLocal").innerHTML=l.length?l.map(i=>`<article class="context-entry"><strong>${esc(i.t)}</strong><small>${esc(i.d||"")}</small><p>${esc(i.x||"")}</p></article>`).join(""):contextEmpty();}async function loadCompleteRecordContext(personId,dealId){const c={loaded:false,loadedAt:new Date().toISOString(),deal:null,person:null,notes:[],activities:[],files:[],relatedDeals:[],lexwareContact:null,lexwareDocuments:[],localVisits:[],localWorksites:[],caseType:state.visit.recordContext?.caseType||"",error:""};try{if(dealId){const d=await loadPipedriveDealContext(dealId);Object.assign(c,d.context||{});}else if(personId){c.person=(await loadPipedrivePerson(personId)).person;}const cu=state.visit.customer,n=[cu.firstName,cu.lastName].filter(Boolean).join(" ")||cu.company;try{const l=await loadLexwareCustomerHistory({contactId:cu.lexwareContactId,email:cu.email,name:n});c.lexwareContact=l.contact||null;c.lexwareDocuments=l.documents||[];if(l.contact?.id)cu.lexwareContactId=l.contact.id;}catch(e){c.error=`Lexware: ${e.message}`;}Object.assign(c,localRecordContext(cu,cu.objectAddress));c.loaded=true;}catch(e){c.error=e.message;}state.visit.recordContext=c;saveState();renderRecordContext();}
async function syncPipedriveDashboard() {
  const box=$("pipedriveTodayList");
  box.innerHTML='<div class="empty-mini">Termine werden geladen …</div>';
  try {
    const data=await loadPipedriveActivities(todayIso());
    const items=data.activities||[];
    if ($("dashboardAppointmentCount")) $("dashboardAppointmentCount").textContent = items.length;
    box.innerHTML=items.length?items.map(item=>`<button class="compact-row activity-row" data-activity-person="${item.personId||""}" data-activity-deal="${item.dealId||""}"><span><strong>${esc(item.dueTime||"ganztägig")}</strong><small>${esc(item.type||"Termin")}</small></span><span><strong>${esc(item.subject||"Termin")}</strong><small>${esc(item.personName||item.location||"")}</small></span></button>`).join(''):'<div class="empty-mini">Heute sind keine offenen Pipedrive-Termine vorhanden.</div>';
    box.querySelectorAll('[data-activity-person]').forEach(button=>button.onclick=async()=>{const personId=button.dataset.activityPerson||"",dealId=button.dataset.activityDeal||"";if(!personId&&!dealId)return;try{resetVisit();state.visit.visitDate=todayLocal();state.visit.visitStartTime=timeLocal();state.visit.visitNumber=createVisitNumber();if(personId){const d=await loadPipedrivePerson(personId);Object.assign(state.visit.customer,d.person);state.visit.customer.pipedriveId=String(personId);}state.visit.customer.pipedriveDealId=String(dealId);saveState();renderVisit();show('visit');showStatus("visitStatus","Kundendaten geladen. Vorgeschichte wird abgerufen …",true);await loadCompleteRecordContext(personId,dealId);renderVisit();showStatus("visitStatus","Termin und vollständige Bauakte wurden geladen.",true);}catch(error){alert(error.message);}});
  } catch(error) { if ($("dashboardAppointmentCount")) $("dashboardAppointmentCount").textContent = "!"; box.innerHTML=`<div class="empty-mini error-text">${esc(error.message)}</div>`; }
}

async function syncAcceptedQuotationDashboard() {
  const box=$("acceptedQuotationList");
  box.innerHTML='<div class="empty-mini">Angebote werden geladen …</div>';
  try {
    const today = todayLocal();
    const data = await loadAcceptedLexwareQuotations(today);
    cachedAcceptedQuotations = (data.quotations || []).filter(item => {
      const updated = String(item.updatedDate || "").slice(0, 10);
      return updated >= today;
    });
    const existingIds=new Set(loadWorksites().map(item=>item.lexwareQuotationId).filter(Boolean));
    const items=cachedAcceptedQuotations.filter(item=>!existingIds.has(item.id));
    box.innerHTML=items.length?items.map(item=>`<div class="compact-row accepted-row"><span><strong>${esc(item.contactName||"Kunde")}</strong><small>${esc(item.voucherNumber||"")} · ${eur(item.totalAmount||0)}</small></span><button class="primary small-button" data-create-lexware-worksite="${item.id}">Baustelle erstellen</button></div>`).join(''):'<div class="empty-mini">Keine heute angenommenen Angebote.</div>';
    box.querySelectorAll('[data-create-lexware-worksite]').forEach(button=>button.onclick=async()=>{
      button.disabled=true;
      try {
        const data=await loadAcceptedLexwareQuotation(button.dataset.createLexwareWorksite);
        const ws=createWorksiteFromLexwareQuotation(state.settings,data.quotation);
        const personId=await ensurePipedrivePerson(ws.customer);
        ws.pipedrivePersonId=personId;
        const deal=await syncPipedriveDeal({
          personId,
          title:`${worksiteCustomerName(ws)} – ${ws.objectAddress || ws.lexwareVoucherNumber}`,
          stageId:stageId("executionPlanned"),
          value:Number(data.quotation.totalGrossAmount || data.quotation.totalAmount || 0),
          currency:data.quotation.currency || "EUR",
          customFields:visitSyncValues({customer:ws.customer,visitNumber:ws.visitNumber,visitDate:ws.date,building:{},areas:[],damageDescription:""},{offerNumber:ws.lexwareVoucherNumber,offerDate:data.quotation.voucherDate,offerValue:Number(data.quotation.totalGrossAmount || data.quotation.totalAmount || 0)}),
          note:`Angenommenes Lexware-Angebot ${esc(ws.lexwareVoucherNumber || "")} wurde als Baustelle übernommen.`
        });
        ws.pipedriveDealId=String(deal.deal?.id || "");
        ws.customer.pipedriveDealId=ws.pipedriveDealId;
        persistWorksite(ws);
        addSyncLog("Lexware → Baustelle",true,`${ws.lexwareVoucherNumber || "Angebot"} übernommen.`,{dealId:ws.pipedriveDealId});
        activeWorksiteId=ws.id;renderWorksites();show('worksites');
      } catch(error){addSyncLog("Lexware → Baustelle",false,error.message);alert(error.message);} finally{button.disabled=false;}
    });
  } catch(error) { box.innerHTML=`<div class="empty-mini error-text">${esc(error.message)}</div>`; }
}


function updateDashboardOverview() {
  const archive = loadArchive();
  const worksites = loadWorksites();
  const openOffers = archive.filter(item => ["draft", "open"].includes(item.status)).length;
  const followups = archive.filter(item => item.status === "followup" || item.followupDate).length;
  if ($("dashboardOpenOfferCount")) $("dashboardOpenOfferCount").textContent = openOffers;
  if ($("dashboardFollowupCount")) $("dashboardFollowupCount").textContent = followups;
  if ($("dashboardWorksiteCount")) $("dashboardWorksiteCount").textContent = worksites.filter(item => item.status !== "completed").length;
  if ($("dashboardDate")) $("dashboardDate").textContent = new Intl.DateTimeFormat("de-DE", {weekday:"long", day:"2-digit", month:"long"}).format(new Date());
  if ($("dashboardGreeting")) {
    const hour = new Date().getHours();
    $("dashboardGreeting").textContent = `${hour < 11 ? "Guten Morgen" : hour < 17 ? "Guten Tag" : "Guten Abend"}, Mike`;
  }
}
function updateRecordHeader() {
  const customer = state.visit.customer || {};
  const name = [customer.salutation, customer.firstName, customer.lastName].filter(Boolean).join(" ") || customer.company || "Neue Besichtigung";
  const address = customer.objectAddress || [customer.street, customer.zip, customer.city].filter(Boolean).join(", ") || "Kunde und Objekt noch nicht ausgewählt";
  if ($("recordHeaderCustomer")) $("recordHeaderCustomer").textContent = name;
  if ($("recordHeaderAddress")) $("recordHeaderAddress").textContent = address;
  if ($("recordCall")) {
    $("recordCall").disabled = !customer.phone;
    $("recordCall").onclick = () => { if (customer.phone) location.href = `tel:${customer.phone}`; };
  }
  if ($("recordNavigate")) {
    $("recordNavigate").disabled = !address || address.includes("noch nicht");
    $("recordNavigate").onclick = () => { if (address) window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`, "_blank"); };
  }
}

async function syncDashboardSources() {
  await Promise.allSettled([syncPipedriveDashboard(),syncAcceptedQuotationDashboard()]);
}

function startNewVisit() {
  activeArchiveId = null;
  resetVisit();
  state.visit.visitDate = todayLocal();
  state.visit.visitStartTime = timeLocal();
  state.visit.visitNumber = createVisitNumber();
  saveState();
  renderVisit();
  show("visit");
}

function customerDisplayName(customer) {
  return [customer.salutation, customer.firstName, customer.lastName]
    .filter(Boolean).join(" ") || customer.company || "Unbenannter Kunde";
}

function buildArchiveRecord() {
  collectVisit();
  updateGeneratedRecommendation();
  const offer = calculateOffer(state.settings, state.visit, state.discount);
  const measures = [...new Set(
    state.visit.areas.flatMap(area => area.measures.map(m => m.type))
  )];

  return {
    id: activeArchiveId || undefined,
    visit: JSON.parse(JSON.stringify(state.visit)),
    discount: JSON.parse(JSON.stringify(state.discount)),
    customerName: customerDisplayName(state.visit.customer),
    company: state.visit.customer.company || "",
    objectAddress: state.visit.customer.objectAddress ||
      [state.visit.customer.street, state.visit.customer.zip, state.visit.customer.city]
        .filter(Boolean).join(", "),
    city: state.visit.customer.city || "",
    visitDate: state.visit.visitDate || "",
    visitNumber: state.visit.visitNumber || "",
    measures,
    offerGross: offer.offerGross,
    status: $("offerArchiveStatus")?.value || "draft",
    followupDate: $("followupDate")?.value || "",
    lexwareQuotationId: state.visit.lexwareQuotationId || ""
  };
}

function saveCurrentToArchive(showMessage = true) {
  const saved = archiveCurrentOffer(buildArchiveRecord());
  activeArchiveId = saved.id;
  if (showMessage) showStatus("offerStatus", "Angebot wurde im lokalen Archiv gespeichert.", true);
  renderArchive();
  return saved;
}

function loadArchiveRecord(id, asCopy = false) {
  const record = loadArchive().find(item => item.id === id);
  if (!record) return;

  state.visit = JSON.parse(JSON.stringify(record.visit));
  state.discount = JSON.parse(JSON.stringify(record.discount || state.discount));
  activeArchiveId = asCopy ? null : record.id;

  if (asCopy) {
    state.visit.visitDate = todayLocal();
    state.visit.visitStartTime = timeLocal();
    state.visit.visitEndTime = "";
    state.visit.visitNumber = createVisitNumber();
    state.visit.inventoryDeducted = false;
    state.visit.inventoryDeductedAt = "";
  }

  saveState();
  renderVisit();
  renderOffer();

  if ($("offerArchiveStatus")) $("offerArchiveStatus").value = asCopy ? "draft" : (record.status || "draft");
  if ($("followupDate")) $("followupDate").value = asCopy ? "" : (record.followupDate || "");

  show("offer");
}

function statusLabel(status) {
  return ({
    draft: "Entwurf",
    open: "Offen",
    accepted: "Angenommen",
    completed: "Abgeschlossen",
    followup: "Nachkontrolle"
  })[status] || status;
}

function renderArchive() {
  const archive = loadArchive();
  const term = String($("archiveSearch")?.value || "").trim().toLowerCase();
  const filter = $("archiveFilter")?.value || "all";

  const filtered = archive.filter(record => {
    const haystack = [
      record.customerName,
      record.company,
      record.objectAddress,
      record.city,
      ...(record.measures || [])
    ].join(" ").toLowerCase();

    const matchesTerm = !term || haystack.includes(term);
    const matchesFilter = filter === "all" || record.status === filter;
    return matchesTerm && matchesFilter;
  });

  const total = archive.length;
  const open = archive.filter(r => ["draft","open"].includes(r.status)).length;
  const accepted = archive.filter(r => r.status === "accepted").length;
  const drafts = archive.filter(r => r.status === "draft").length;
  const completed = archive.filter(r => r.status === "completed").length;
  const followups = archive.filter(r => r.status === "followup" || r.followupDate).length;
  const totalAmount = archive.reduce((sum, record) => sum + Number(record.offerGross || 0), 0);

  if ($("statTotal")) $("statTotal").textContent = total;
  if ($("statOpen")) $("statOpen").textContent = open;
  if ($("statAccepted")) $("statAccepted").textContent = accepted;
  if ($("statDraft")) $("statDraft").textContent = drafts;
  if ($("statCompleted")) $("statCompleted").textContent = completed;
  if ($("statFollowups")) $("statFollowups").textContent = followups;
  if ($("statAmount")) $("statAmount").textContent = eur(totalAmount);
  updateDashboardOverview();

  const donut = $("statusDonut");
  if (donut) {
    const a = total ? accepted / total * 360 : 0;
    const o = total ? open / total * 360 : 0;
    const d = total ? drafts / total * 360 : 0;
    const c = total ? completed / total * 360 : 0;
    donut.style.background = `conic-gradient(#55a95a 0 ${a}deg,#4f8fd7 ${a}deg ${a+o}deg,#efa938 ${a+o}deg ${a+o+d}deg,#9da3ad ${a+o+d}deg ${a+o+d+c}deg,#9b70cc ${a+o+d+c}deg 360deg)`;
  }

  const recent = archive.slice(0, 4);
  if ($("recentOffers")) $("recentOffers").innerHTML = recent.length ? recent.map(record => `
    <button class="compact-row" data-open-record="${record.id}">
      <span class="mini-status status-${esc(record.status)}">${esc(statusLabel(record.status))}</span>
      <span><strong>${esc(record.customerName)}</strong><small>${esc(record.objectAddress || "")}</small></span>
      <span>${esc(record.visitDate || "")}</span>
      <strong>${eur(record.offerGross || 0)}</strong>
    </button>`).join("") : `<div class="empty-mini">Noch keine Angebote.</div>`;

  const upcoming = archive.filter(record => record.followupDate).sort((a,b) => String(a.followupDate).localeCompare(String(b.followupDate))).slice(0,4);
  if ($("nextFollowups")) $("nextFollowups").innerHTML = upcoming.length ? upcoming.map(record => `
    <button class="compact-row followup-row" data-open-record="${record.id}">
      <span><strong>${esc(record.customerName)}</strong><small>${esc(record.objectAddress || "")}</small></span>
      <strong>${esc(record.followupDate)}</strong>
    </button>`).join("") : `<div class="empty-mini">Keine Nachkontrollen geplant.</div>`;

  const list = $("archiveList");
  if (!list) return;
  list.innerHTML = filtered.map(record => `
    <article class="archive-row">
      <button class="archive-row-main" data-open-record="${record.id}">
        <span>${esc(record.visitDate || "")}</span>
        <span><strong>${esc(record.customerName)}</strong><small>${esc(record.objectAddress || "Keine Objektadresse")}</small></span>
        <span>${esc((record.measures || []).join(", "))}</span>
        <strong>${eur(record.offerGross || 0)}</strong>
        <span class="status-badge status-${esc(record.status)}">${esc(statusLabel(record.status))}</span>
      </button>
      <div class="row-actions"><button data-copy-record="${record.id}" title="Kopieren">⧉</button><button data-delete-record="${record.id}" title="Löschen">⋮</button></div>
    </article>`).join("");

  $("archiveEmpty").style.display = filtered.length ? "none" : "block";

  document.querySelectorAll("[data-open-record]").forEach(el =>
    el.onclick = () => loadArchiveRecord(el.dataset.openRecord, false)
  );
  document.querySelectorAll("[data-copy-record]").forEach(el =>
    el.onclick = () => loadArchiveRecord(el.dataset.copyRecord, true)
  );
  document.querySelectorAll("[data-delete-record]").forEach(el =>
    el.onclick = () => {
      if (confirm("Diesen Archiv-Eintrag löschen?")) {
        deleteArchiveRecord(el.dataset.deleteRecord);
        renderArchive();
      }
    }
  );
}

function exportArchiveData(
  filename = `mainabdichter-komplettsicherung-${todayLocal()}.json`
) {
  collectVisit();
  saveState();

  const payload = createFullBackupPayload();
  const blob = new Blob(
    [JSON.stringify(payload, null, 2)],
    { type: "application/json" }
  );

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);

  localStorage.setItem(
    "mainabdichter_v14_last_backup",
    new Date().toISOString()
  );

  if (typeof updateBackupTime === "function") {
    updateBackupTime();
  }
}

function show(pageId) {
  document.querySelectorAll(".page").forEach(page => page.classList.remove("active"));
  document.querySelectorAll(".main-nav button").forEach(button => button.classList.toggle("active", button.dataset.page === pageId));
  const targetPage = $(pageId);
  if (!targetPage) {
    console.error(`Seite nicht gefunden: ${pageId}`);
    return;
  }
  targetPage.classList.add("active");
  if (pageId === "offer") renderOffer();
  if (pageId === "settings") renderSettings();
  if (pageId === "dashboard") { renderArchive(); updateDashboardOverview(); syncDashboardSources(); }
  if (pageId === "worksites") renderWorksites();
  if (pageId === "more") updateBackupTime();
  document.querySelectorAll("[data-bottom-page]").forEach(button => button.classList.toggle("active", button.dataset.bottomPage === pageId));
}

document.querySelectorAll(".main-nav button").forEach(button => button.onclick = () => show(button.dataset.page));
function openAppMenu() {
  $("appMenu")?.classList.add("open");
  $("appMenu")?.setAttribute("aria-hidden", "false");
  $("menuBackdrop")?.classList.remove("hidden");
  document.body.classList.add("menu-open");
}

function closeAppMenu() {
  $("appMenu")?.classList.remove("open");
  $("appMenu")?.setAttribute("aria-hidden", "true");
  $("menuBackdrop")?.classList.add("hidden");
  document.body.classList.remove("menu-open");
}

$("headerHome").onclick = () => show("dashboard");
$("quickMenu").onclick = openAppMenu;
$("closeMenu").onclick = closeAppMenu;
$("menuBackdrop").onclick = closeAppMenu;

document.querySelectorAll("[data-menu-page]").forEach(button => {
  button.onclick = () => {
    closeAppMenu();
    show(button.dataset.menuPage);
  };
});

document.querySelectorAll("[data-menu-action]").forEach(button => {
  button.onclick = () => {
    closeAppMenu();
    if (button.dataset.menuAction === "newInquiry") openInquiryImport();
    if (button.dataset.menuAction === "newVisit") startNewVisit();
  };
});

document.querySelectorAll("[data-more-page]").forEach(button => button.onclick = () => show(button.dataset.morePage));
document.querySelectorAll("[data-more-action]").forEach(button => {
  button.onclick = () => {
    if (button.dataset.moreAction === "newInquiry") openInquiryImport();
  };
});
$("syncDashboardAll").onclick = syncDashboardSources;
document.querySelectorAll("[data-scroll-target]").forEach(button => button.onclick = () => {
  const target = $(button.dataset.scrollTarget);
  target?.scrollIntoView({behavior:"smooth", block:"center"});
});
document.querySelectorAll("[data-page-target]").forEach(button => button.onclick = () => show(button.dataset.pageTarget));
$("syncPipedriveActivities").onclick = syncPipedriveDashboard;
$("syncAcceptedQuotations").onclick = syncAcceptedQuotationDashboard;
$("dashboardNewInquiry").onclick = openInquiryImport;
$("cancelInquiryImport").onclick = () => show("dashboard");
$("retryInquiryImport").onclick = () => $("inquiryScreenshot").click();
$("inquiryScreenshot").onchange = event => handleInquiryScreenshot(event.target.files?.[0]);
$("inquiryCamera").onchange = event => handleInquiryScreenshot(event.target.files?.[0]);
$("reparseInquiryText").onclick = () => fillInquiryReview(parseInquiryText($("importRawText").value));
$("acceptInquiryImport").onclick = acceptInquiryImport;
["Complaint","Followup","FollowOn"].forEach(k=>{const b=$(`contextType${k}`);if(!b)return;b.onclick=()=>{const x={Complaint:"Reklamation",Followup:"Nachkontrolle",FollowOn:"Folgeauftrag"}[k];state.visit.inquiry||={source:"",ownerStatus:"",appointment:"",message:"",rawText:"",screenshot:"",importedAt:""};state.visit.recordContext||={};state.visit.recordContext.caseType=x;state.visit.inquiry.source=x;saveState();renderRecordContext();showStatus("recordContextStatus",`Vorgangsart „${x}“ wurde gespeichert.`,true);showStatus("visitStatus",`Vorgangsart „${x}“ wurde gespeichert.`,true);};});
$("dashboardNewVisit").onclick = startNewVisit;
$("quickCreateOffer").onclick = () => show("offer");
$("quickShowOffers").onclick = () => { $("archiveFilter").value = "all"; renderArchive(); $("archiveList").scrollIntoView({behavior:"smooth"}); };
$("quickShowFollowups").onclick = () => { $("archiveFilter").value = "followup"; renderArchive(); $("archiveList").scrollIntoView({behavior:"smooth"}); };
$("showAllOffers").onclick = () => $("archiveList").scrollIntoView({behavior:"smooth"});
$("showAllFollowups").onclick = () => { $("archiveFilter").value = "followup"; renderArchive(); $("archiveList").scrollIntoView({behavior:"smooth"}); };
$("icloudSave").onclick = () => { exportArchiveData("mainabdichter-komplettsicherung.json"); localStorage.setItem("mainabdichter_v14_last_backup",new Date().toISOString()); updateBackupTime(); };
document.querySelectorAll("[data-bottom-page]").forEach(button => button.onclick = () => show(button.dataset.bottomPage));
$("bottomCustomers").onclick = () => {
  show("visit");
  setTimeout(() => $("customerPipedrive")?.click(), 0);
};
function updateBackupTime(){ const raw=localStorage.getItem("mainabdichter_v14_last_backup"); if(!$("lastBackupTime")) return; $("lastBackupTime").textContent=raw?new Date(raw).toLocaleString("de-DE"):"Noch keine Sicherung"; }
$("archiveSearch").oninput = renderArchive;
$("archiveFilter").onchange = renderArchive;
$("saveToArchive").onclick = () => saveCurrentToArchive(true);
$("exportArchive").onclick = exportArchiveData;
$("importArchive").onchange = event => {
  const file = event.target.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);

      // Rückwärtskompatibilität zu den bisherigen reinen Archivdateien.
      if (Array.isArray(parsed)) {
        if (confirm(
          `Alte Archivsicherung mit ${parsed.length} Einträgen importieren?`
        )) {
          replaceArchive(parsed);
          renderArchive();
        }
        return;
      }

      if (
        Array.isArray(parsed.archive) &&
        !parsed.settings &&
        !parsed.visit &&
        !parsed.discount
      ) {
        if (confirm(
          `Archivsicherung mit ${parsed.archive.length} Einträgen importieren?`
        )) {
          replaceArchive(parsed.archive);
          renderArchive();
        }
        return;
      }

      const archiveCount = Array.isArray(parsed.archive)
        ? parsed.archive.length
        : 0;

      const confirmed = confirm(
        "Diese Komplettsicherung enthält Einstellungen, " +
        "Lexoffice-Artikelzuordnungen, Materialpreise, " +
        "Verbindungsdaten und " +
        `${archiveCount} Archiv-Einträge.\n\n` +
        "Die vorhandenen Daten auf diesem Gerät werden ersetzt. " +
        "Sicherung jetzt wiederherstellen?"
      );

      if (!confirmed) return;

      const result = restoreFullBackupPayload(parsed);

      renderVisit();
      renderSettings();
      renderExtras();
      renderOffer();
      renderArchive();
      updateMetaBar();

      localStorage.setItem(
        "mainabdichter_v14_last_backup",
        new Date().toISOString()
      );
      updateBackupTime();

      alert(
        "Sicherung erfolgreich wiederhergestellt.\n\n" +
        `Archiv-Einträge: ${result.archiveCount}\n` +
        `Einstellungen: ${result.settingsRestored ? "Ja" : "Nein"}\n` +
        `Aktuelle Besichtigung: ${result.visitRestored ? "Ja" : "Nein"}`
      );
    } catch (error) {
      alert(`Sicherung konnte nicht importiert werden: ${error.message}`);
    }
  };

  reader.readAsText(file);
  event.target.value = "";
};

$("quickSave").onclick = () => {
  collectVisit();
  saveState();
  alert("Aktueller Stand gespeichert.");
};
$("quickSettings").onclick = () => show("settings");

if ($("bottomPipedrive")) {
  $("bottomPipedrive").onclick = () => {
    show("visit");
    choosePipedrive();
  };
}

if ($("bottomLexware")) {
  $("bottomLexware").onclick = () => {
    show("visit");
    chooseLexware();
  };
}

if ($("bottomNewVisit")) {
  $("bottomNewVisit").onclick = startNewVisit;
}

if ($("bottomFollowup")) {
  $("bottomFollowup").onclick = () => {
    show("dashboard");
    $("archiveFilter").value = "followup";
    renderArchive();
    $("archiveList").scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  };
}
$("setVisitNow").onclick = () => {
  state.visit.visitDate = todayLocal();
  state.visit.visitStartTime = timeLocal();
  if (!state.visit.visitNumber) state.visit.visitNumber = createVisitNumber();

  $("visitDate").value = state.visit.visitDate;
  $("visitStartTime").value = state.visit.visitStartTime;
  $("visitNumber").value = state.visit.visitNumber;
  updateVisitDuration();
  saveState();
};

$("setVisitEndNow").onclick = () => {
  state.visit.visitEndTime = timeLocal();
  $("visitEndTime").value = state.visit.visitEndTime;
  updateVisitDuration();
  saveState();
};

$("visitStartTime").oninput = () => {
  state.visit.visitStartTime = $("visitStartTime").value;
  updateVisitDuration();
  saveState();
};

$("visitEndTime").oninput = () => {
  state.visit.visitEndTime = $("visitEndTime").value;
  updateVisitDuration();
  saveState();
};

$("visitDate").onchange = () => {
  state.visit.visitDate = $("visitDate").value || todayLocal();
  if (!state.visit.visitNumber) {
    state.visit.visitNumber = createVisitNumber();
    $("visitNumber").value = state.visit.visitNumber;
  }
  saveState();
};

$("captureLocation").onclick = () => {
  if (!navigator.geolocation) {
    showStatus("locationWeatherStatus", "Dieses Gerät unterstützt keine Standortbestimmung.", false);
    return;
  }

  showStatus("locationWeatherStatus", "Standort wird ermittelt …", true);

  navigator.geolocation.getCurrentPosition(
    async position => {
      state.visit.visitLatitude = position.coords.latitude.toFixed(6);
      state.visit.visitLongitude = position.coords.longitude.toFixed(6);
      state.visit.visitAccuracy = `${Math.round(position.coords.accuracy)} m`;

      $("visitLatitude").value = state.visit.visitLatitude;
      $("visitLongitude").value = state.visit.visitLongitude;
      $("visitAccuracy").value = state.visit.visitAccuracy;

      saveState();
      showStatus("locationWeatherStatus", "Standort wurde gespeichert.", true);
      await fetchWeatherForLocation();
    },
    error => {
      showStatus(
        "locationWeatherStatus",
        `Standort konnte nicht ermittelt werden: ${error.message}`,
        false
      );
    },
    {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 0
    }
  );
};

$("loadWeather").onclick = fetchWeatherForLocation;
if ($("newVisit")) $("newVisit").onclick = () => { startNewVisit(); };
if ($("continueVisit")) $("continueVisit").onclick = () => { renderVisit(); show("visit"); };
if ($("openOffer")) $("openOffer").onclick = () => show("offer");
if ($("openSettings")) $("openSettings").onclick = () => show("settings");
$("resetVisit").onclick = () => { if (confirm("Aktuelle Besichtigung löschen?")) { resetVisit(); renderVisit(); } };
$("saveVisit").onclick = () => { collectVisit(); saveState(); alert("Besichtigung gespeichert."); };
$("toOffer").onclick = () => { collectVisit(); saveState(); show("offer"); };

document.querySelectorAll("[data-open-step]").forEach(button => {
  button.onclick = () => {
    const step = Number(button.dataset.openStep);
    const details = [...document.querySelectorAll("#visit details.compact-step")];
    details.forEach((detail, index) => {
      detail.open = index + 1 === step;
    });
    details[step - 1]?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
});

document.querySelectorAll("#visit details.compact-step").forEach(detail => {
  detail.addEventListener("toggle", () => {
    if (!detail.open) return;
    document.querySelectorAll("#visit details.compact-step").forEach(other => {
      if (other !== detail) other.open = false;
    });
  });
});


function updateMetaBar() {
  if ($("metaVisitNumber")) $("metaVisitNumber").textContent = state.visit.visitNumber || "–";
  if ($("metaVisitDate")) $("metaVisitDate").textContent = state.visit.visitDate || "–";
  if ($("metaVisitTime")) $("metaVisitTime").textContent = state.visit.visitStartTime || "–";

  const location = state.visit.customer.city
    || state.visit.customer.objectAddress
    || state.visit.visitLatitude && state.visit.visitLongitude
      ? (state.visit.customer.city || state.visit.customer.objectAddress || `${state.visit.visitLatitude}, ${state.visit.visitLongitude}`)
      : "–";

  if ($("metaVisitLocation")) $("metaVisitLocation").textContent = location || "–";
  if ($("metaVisitWeather")) $("metaVisitWeather").textContent =
    state.visit.visitWeather
      ? `${state.visit.visitOutdoorTemp || ""} °C ${state.visit.visitWeather}`.trim()
      : "–";
  const dashboardPairs = {
    metaVisitNumberDashboard: state.visit.visitNumber || "–",
    metaVisitDateDashboard: state.visit.visitDate || "–",
    metaVisitTimeDashboard: state.visit.visitStartTime || "–",
    metaVisitLocationDashboard: location || "–",
    metaVisitWeatherDashboard: state.visit.visitWeather ? `${state.visit.visitOutdoorTemp || ""} °C ${state.visit.visitWeather}`.trim() : "–"
  };
  Object.entries(dashboardPairs).forEach(([id,value]) => { if ($(id)) $(id).textContent = value; });
}

function renderVisit() {
  if (!state.visit.visitDate) state.visit.visitDate = todayLocal();
  if (!state.visit.visitStartTime) state.visit.visitStartTime = timeLocal();
  if (!state.visit.visitNumber) state.visit.visitNumber = createVisitNumber();

  $("visitNumber").value = state.visit.visitNumber;
  $("visitDate").value = state.visit.visitDate;
  $("visitStartTime").value = state.visit.visitStartTime || "";
  $("visitEndTime").value = state.visit.visitEndTime || "";
  $("visitLatitude").value = state.visit.visitLatitude || "";
  $("visitLongitude").value = state.visit.visitLongitude || "";
  $("visitAccuracy").value = state.visit.visitAccuracy || "";
  $("visitWeather").value = state.visit.visitWeather || "";
  $("visitOutdoorTemp").value = state.visit.visitOutdoorTemp || "";
  $("visitPrecipitation").value = state.visit.visitPrecipitation || "";
  updateVisitDuration();
  customerFields.forEach(key => $(key).value = state.visit.customer[key] || "");
  buildingFields.forEach(key => $(key).value = state.visit.building[key] || "");
  $("damageDescription").value = state.visit.damageDescription || "";
  $("climateMeasured").checked = Boolean(state.visit.building.climateMeasured);
  toggleClimateFields();
  renderAreas();
  updateGeneratedRecommendation();
  renderExtras();
  bindSpeechButtons();
  applyInputModes();
  updateDewPoint();
  updateMetaBar();
  updateRecordHeader();
}

function collectVisit() {
  state.visit.visitDate = $("visitDate").value || todayLocal();
  state.visit.visitStartTime = $("visitStartTime").value || timeLocal();
  state.visit.visitEndTime = $("visitEndTime").value || "";
  state.visit.visitNumber = $("visitNumber").value || createVisitNumber();
  state.visit.visitLatitude = $("visitLatitude").value || "";
  state.visit.visitLongitude = $("visitLongitude").value || "";
  state.visit.visitAccuracy = $("visitAccuracy").value || "";
  state.visit.visitWeather = $("visitWeather").value || "";
  state.visit.visitOutdoorTemp = $("visitOutdoorTemp").value || "";
  state.visit.visitPrecipitation = $("visitPrecipitation").value || "";
  customerFields.forEach(key => state.visit.customer[key] = $(key).value);
  buildingFields.forEach(key => state.visit.building[key] = $(key).value);
  state.visit.damageDescription = $("damageDescription").value;
  state.visit.building.climateMeasured = $("climateMeasured").checked;
  state.visit.customerRecommendation = generateRecommendationText();
}


function toggleClimateFields() {
  const active = $("climateMeasured").checked;
  $("climateFields").classList.toggle("hidden", !active);
  state.visit.building.climateMeasured = active;

  if (!active) {
    ["roomTemp","humidity","surfaceTemp","dewPoint"].forEach(id => {
      $(id).value = "";
      state.visit.building[id] = "";
    });
  }
}

function generateRecommendationText() {
  const selected = new Set(
    state.visit.areas.flatMap(area => area.measures.map(measure => measure.type))
  );

  const parts = [];

  if (selected.has("Horizontalsperre")) {
    parts.push(
      "Aufgrund der festgestellten kapillar aufsteigenden Feuchtigkeit empfehlen wir die Ausführung einer Horizontalsperre im Injektionsverfahren mit BKM HZ 250 Pro."
    );
  }

  if (selected.has("Flächensperre")) {
    parts.push(
      "Zur Reduzierung des seitlichen Feuchteeintrags empfehlen wir die Ausführung einer Flächensperre im Injektionsverfahren mit BKM HZ 250 Pro."
    );
  }

  if (selected.has("Wand-Sohlen-Anschluss")) {
    parts.push(
      "Im Bereich des Wand-Sohlen-Anschlusses wird der vorhandene Estrich auf einer Breite von mindestens ca. 15–20 cm von der Wand bis zur Bodenplatte geöffnet. Anschließend wird der Anschlussbereich gereinigt, eine Dichtkehle hergestellt und ein Dichtmörtel bis mindestens 15 cm über eine vorhandene Sperrbahn aufgebracht. Im Anschluss wird zusätzlich eine Horizontalsperre im Injektionsverfahren mit BKM HZ 250 Pro eingebracht. Diese Maßnahme erfolgt grundsätzlich im Ausschlussverfahren. Nach einer angemessenen Standzeit wird geprüft, ob die ausgeführten Maßnahmen ausreichend waren. Sollte weiterhin Feuchtigkeit über einzelne Bereiche eindringen, wird eine Harzverpressung ausschließlich in den technisch erforderlichen Bereichen ausgeführt und nach dem tatsächlich notwendigen Umfang abgerechnet."
    );
  }

  if (selected.has("Harzverpressung")) {
    parts.push(
      "Zur Abdichtung der ausgewählten feuchtigkeits- oder wasserführenden Bereiche empfehlen wir eine gezielte Harzverpressung. Abgerechnet wird ausschließlich der tatsächlich ausgeführte Umfang."
    );
  }

  return parts.join("\n\n") ||
    "Auf Grundlage der ausgewählten Maßnahmen wird die technische Empfehlung automatisch erstellt.";
}

function updateGeneratedRecommendation() {
  const text = generateRecommendationText();
  state.visit.customerRecommendation = text;
  if ($("generatedRecommendation")) {
    $("generatedRecommendation").textContent = text;
  }
  saveState();
}

function updateDewPoint() {
  const t = parseDecimal($("roomTemp").value);
  const rh = parseDecimal($("humidity").value);
  if (Number.isFinite(t) && rh > 0) {
    const a = 17.62, b = 243.12;
    const gamma = Math.log(rh / 100) + a * t / (b + t);
    $("dewPoint").value = (b * gamma / (a - gamma)).toFixed(1);
  } else $("dewPoint").value = "";
}
$("climateMeasured").onchange = () => {
  toggleClimateFields();
  updateDewPoint();
  saveState();
};
$("roomTemp").oninput = updateDewPoint;
$("humidity").oninput = updateDewPoint;

function renderAreas() {
  const box = $("areas");
  box.innerHTML = "";
  state.visit.areas.forEach((area, ai) => {
    const card = document.createElement("div");
    card.className = "area-card";
    card.innerHTML = `
      <div class="area-head"><h3>${ai + 1}. ${esc(area.name)}</h3><button class="danger" data-delete-area="${area.id}">Löschen</button></div>
      <div class="grid">
        <div><label>Bezeichnung</label><input data-area="${area.id}" data-field="name" value="${esc(area.name)}"></div>
        <div><label>Wandmaterial</label><select data-area="${area.id}" data-field="wallMaterial">${["","HBL / Hohlblockstein","Ziegel","Kalksandstein","Beton","Naturstein","Mischmauerwerk","Sonstiges","Unbekannt"].map(v => `<option ${area.wallMaterial===v?"selected":""}>${v}</option>`).join("")}</select></div>
        <div><label>Abweichendes Material</label><input data-area="${area.id}" data-field="wallMaterialOther" value="${esc(area.wallMaterialOther)}"></div>
        <div><label>Wandstärke</label><select data-area="${area.id}" data-field="wallThickness">${["",24,30,36,42,48,60].map(v => `<option value="${v}" ${Number(area.wallThickness)===v?"selected":""}>${v} cm</option>`).join("")}</select></div>
        <div><label>Wandart</label><select data-area="${area.id}" data-field="wallType"><option value="">– bitte auswählen –</option><option ${area.wallType==="Außenwand"?"selected":""}>Außenwand</option><option ${area.wallType==="Innenwand"?"selected":""}>Innenwand</option></select></div>
        <div><label>Erdkontakt</label><select data-area="${area.id}" data-field="earthContact"><option value="">– bitte auswählen –</option><option ${area.earthContact==="erdberührt"?"selected":""}>erdberührt</option><option ${area.earthContact==="nicht erdberührt"?"selected":""}>nicht erdberührt</option></select></div>
        <div><label>Wandbelag</label><select data-area="${area.id}" data-field="wallCover">${["","Putz","Farbe","Tapete","Fliesen","Unbekannt","Sonstiges"].map(v => `<option ${area.wallCover===v?"selected":""}>${v}</option>`).join("")}</select></div>
        <div><label>Zugänglichkeit</label><select data-area="${area.id}" data-field="access"><option value="">– bitte auswählen –</option><option ${area.access==="normal"?"selected":""}>normal</option><option ${area.access==="eingeschränkt"?"selected":""}>eingeschränkt</option><option ${area.access==="schwierig"?"selected":""}>schwierig</option></select></div>
      </div>
      <label>Notizen</label><div class="speech-row"><textarea id="area-note-${area.id}" data-area="${area.id}" data-field="notes">${esc(area.notes)}</textarea><button class="speech" data-speech-target="area-note-${area.id}">🎤</button></div>
      <h3>Feuchtemessung</h3>
      <div class="grid">
        <div><label>Referenzwert „trocken“</label><input data-area="${area.id}" data-field="dryReference" value="${esc(area.dryReference || "")}"></div>
        <div class="full"><label>Bemerkung zur Feuchtemessung</label><textarea data-area="${area.id}" data-field="measurementRemark">${esc(area.measurementRemark || "")}</textarea></div>
      </div>
      <h3>Messpunkte</h3><div id="measurements-${area.id}"></div><button class="secondary" data-add-measurement="${area.id}">+ Messpunkt</button>
      <h3>Maßnahmen</h3><div id="measures-${area.id}"></div><button class="secondary" data-add-measure="${area.id}">+ Maßnahme</button>
      <h3>Fotos</h3><input type="file" accept="image/*" capture="environment" multiple data-photo-area="${area.id}"><div id="photos-${area.id}" class="photo-grid"></div>`;
    box.appendChild(card);
    renderMeasurements(area);
    renderMeasures(area);
    renderPhotos(area);
  });

  box.querySelectorAll("[data-field]").forEach(input => input.oninput = () => {
    const area = state.visit.areas.find(item => item.id === input.dataset.area);
    area[input.dataset.field] = input.value;
    if (input.dataset.field === "wallThickness") area.measures.forEach(measure => measure.wall = Number(input.value));
    saveState();
  });

  box.querySelectorAll("[data-delete-area]").forEach(button => button.onclick = () => {
    state.visit.areas = state.visit.areas.filter(area => area.id !== button.dataset.deleteArea);
    saveState(); updateGeneratedRecommendation(); renderAreas();
  });

  box.querySelectorAll("[data-add-measurement]").forEach(button => button.onclick = () => {
    const area = state.visit.areas.find(item => item.id === button.dataset.addMeasurement);
    area.measurements.push({ id: crypto.randomUUID(), device:"",value:"",unit:"",height:"",location:"" });
    saveState(); renderAreas();
  });

  box.querySelectorAll("[data-add-measure]").forEach(button => button.onclick = () => {
    const area = state.visit.areas.find(item => item.id === button.dataset.addMeasure);
    area.measures.push({ id:crypto.randomUUID(), type:"",length:"",width:"",height:"",wall:area.wallThickness||"",spacing:"",extraResinKg:"",note:"" });
    saveState(); updateGeneratedRecommendation(); renderAreas();
  });

  box.querySelectorAll("[data-photo-area]").forEach(input => input.onchange = event => {
    const area = state.visit.areas.find(item => item.id === input.dataset.photoArea);
    [...event.target.files].forEach(file => {
      const reader = new FileReader();
      reader.onload = result => {
        area.photos.push({ id:crypto.randomUUID(), src:result.target.result, caption:"", show:true });
        saveState(); renderAreas();
      };
      reader.readAsDataURL(file);
    });
    event.target.value = "";
  });

  bindSpeechButtons();
  applyInputModes(box);
}

function renderMeasurements(area) {
  const box = $(`measurements-${area.id}`);
  box.innerHTML = area.measurements.map(m => `
    <div class="sub-card item-grid">
      <div class="wide"><label>Gerät</label><input data-mid="${m.id}" data-mf="device" value="${esc(m.device)}"></div>
      <div><label>Messwert</label><input data-mid="${m.id}" data-mf="value" value="${esc(m.value)}"></div>
      <div><label>Einheit</label><input data-mid="${m.id}" data-mf="unit" value="${esc(m.unit)}"></div>
      <div><label>Höhe cm</label><input data-mid="${m.id}" data-mf="height" value="${esc(m.height)}"></div>
      <div><label>Position</label><input data-mid="${m.id}" data-mf="location" value="${esc(m.location)}"></div>
      <button class="danger" data-delete-measurement="${m.id}">Löschen</button>
    </div>`).join("");

  box.querySelectorAll("[data-mf]").forEach(input => input.oninput = () => {
    const measurement = area.measurements.find(item => item.id === input.dataset.mid);
    measurement[input.dataset.mf] = input.value;
    saveState();
  });

  box.querySelectorAll("[data-delete-measurement]").forEach(button => button.onclick = () => {
    area.measurements = area.measurements.filter(item => item.id !== button.dataset.deleteMeasurement);
    saveState();
    renderAreas();
  });
}

function renderMeasures(area) {
  const box = $(`measures-${area.id}`);
  box.innerHTML = area.measures.map(m => `
    <div class="sub-card item-grid">
      <div class="wide"><label>Maßnahme</label><select data-measure="${m.id}" data-mfield="type">${["","Horizontalsperre","Flächensperre","Harzverpressung","Wand-Sohlen-Anschluss"].map(v=>`<option ${m.type===v?"selected":""}>${v}</option>`).join("")}</select></div>
      <div><label>Wandstärke</label><select data-measure="${m.id}" data-mfield="wall">${["",24,30,36,42,48,60].map(v=>`<option value="${v}" ${Number(m.wall)===v?"selected":""}>${v} cm</option>`).join("")}</select></div>
      ${m.type==="Flächensperre" ? `<div><label>Breite m</label><input data-measure="${m.id}" data-mfield="width" value="${m.width}"></div><div><label>Höhe m</label><input data-measure="${m.id}" data-mfield="height" value="${m.height}"></div>` : `<div><label>Länge lfm</label><input data-measure="${m.id}" data-mfield="length" value="${m.length}"></div>`}
      ${["","Horizontalsperre","Flächensperre","Wand-Sohlen-Anschluss"].includes(m.type) ? `<div><label>horizontaler Abstand</label><select data-measure="${m.id}" data-mfield="spacing"><option value="">– bitte auswählen –</option><option value=".125" ${Number(m.spacing)===.125?"selected":""}>12,5 cm</option><option value=".25" ${Number(m.spacing)===.25?"selected":""}>25 cm</option></select></div>` : ""}
      ${m.type==="Harzverpressung" ? `<div><label>zusätzliches Harz kg</label><input data-measure="${m.id}" data-mfield="extraResinKg" value="${m.extraResinKg}"></div>` : ""}
      ${m.type==="Wand-Sohlen-Anschluss" ? `<div class="wide switch-row"><label><input type="checkbox" data-measure="${m.id}" data-mcheck="disposeDebris" ${m.disposeDebris?"checked":""}> Anfallenden Bauschutt aufnehmen, abfahren und fachgerecht entsorgen</label></div>` : ""}
      <div class="wide"><label>Notiz</label><input data-measure="${m.id}" data-mfield="note" value="${esc(m.note)}"></div>
      <button class="danger" data-delete-measure="${m.id}">Löschen</button>
    </div>`).join("");

  box.querySelectorAll("[data-mfield]").forEach(input => input.oninput = () => {
    const measure = area.measures.find(item => item.id === input.dataset.measure);
    measure[input.dataset.mfield] = input.value;
    saveState();
    updateGeneratedRecommendation();
    if (input.dataset.mfield === "type") renderAreas();
  });
  box.querySelectorAll("[data-mcheck]").forEach(input => input.onchange = () => {
    const measure = area.measures.find(item => item.id === input.dataset.measure);
    measure[input.dataset.mcheck] = input.checked;
    saveState();
    updateGeneratedRecommendation();
  });
  box.querySelectorAll("[data-delete-measure]").forEach(button => button.onclick = () => {
    area.measures = area.measures.filter(item => item.id !== button.dataset.deleteMeasure);
    saveState(); updateGeneratedRecommendation(); renderAreas();
  });
}

function renderPhotos(area) {
  const box = $(`photos-${area.id}`);
  box.innerHTML = area.photos.map(photo => `
    <div class="photo-card"><img src="${photo.src}"><input data-photo="${photo.id}" value="${esc(photo.caption)}" placeholder="Beschreibung"><label><input type="checkbox" data-photo-show="${photo.id}" ${photo.show?"checked":""}> Kundenansicht</label><button class="danger" data-delete-photo="${photo.id}">Löschen</button></div>`).join("");
  box.querySelectorAll("[data-photo]").forEach(input => input.oninput = () => {
    area.photos.find(p => p.id === input.dataset.photo).caption = input.value; saveState();
  });
  box.querySelectorAll("[data-photo-show]").forEach(input => input.onchange = () => {
    area.photos.find(p => p.id === input.dataset.photoShow).show = input.checked; saveState();
  });
  box.querySelectorAll("[data-delete-photo]").forEach(button => button.onclick = () => {
    area.photos = area.photos.filter(p => p.id !== button.dataset.deletePhoto); saveState(); renderAreas();
  });
}

$("addArea").onclick = () => { state.visit.areas.push(createArea("")); saveState(); renderAreas(); };

function renderExtras() {
  $("extras").innerHTML = state.settings.extras.filter(extra => extra.active).map(extra => {
    const article = state.settings.lexwareArticles.find(item => item.id === extra.lexwareArticleId);
    return `<div class="catalog-row"><div><strong>${esc(article?.title || extra.name)}</strong>${article?.description?`<div class="article-description">${esc(article.description)}</div>`:""}<small>${esc(article?.unitName || extra.unit)}</small></div><div><label>Menge</label><input type="number" step=".01" data-extra-qty="${extra.id}" value="${state.visit.extraQuantities[extra.id] || 0}"></div></div>`;
  }).join("");
  document.querySelectorAll("[data-extra-qty]").forEach(input => input.oninput = () => {
    state.visit.extraQuantities[input.dataset.extraQty] = parseDecimal(input.value); saveState();
  });
}

async function choosePipedrive() {
  if (!hasConnectionConfig()) return show("settings");
  const term = prompt("Pipedrive-Kunde suchen");
  if (!term) return;
  try {
    const result = await searchPipedrive(term);
    const labels = result.people.map((p,i)=>`${i+1}: ${p.name} ${p.email||""}`).join("\n");
    const index = Number(prompt(labels + "\n\nNummer auswählen")) - 1;
    const selected = result.people[index];
    if (!selected) return;
    const detail = await loadPipedrivePerson(selected.id);
    Object.assign(state.visit.customer, detail.person, { pipedriveId: detail.person.id || "" });
    saveState(); renderVisit();
  } catch (error) { alert(error.message); }
}
async function chooseLexware() {
  if (!hasConnectionConfig()) return show("settings");
  const term = prompt("Lexware-Kunde suchen: Name, E-Mail oder Kundennummer");
  if (!term) return;
  try {
    const result = await searchLexwareCustomers(term);
    const labels = result.contacts.map((c,i)=>`${i+1}: ${c.name}${c.customerNumber?` [${c.customerNumber}]`:""} ${c.email||""}`).join("\n");
    const index = Number(prompt(labels + "\n\nNummer auswählen")) - 1;
    const selected = result.contacts[index];
    if (!selected) return;
    const detail = await loadLexwareCustomer(selected.id);
    Object.assign(state.visit.customer, detail.contact, { lexwareContactId: detail.contact.id || "" });
    saveState(); renderVisit();
  } catch (error) { alert(error.message); }
}
$("customerPipedrive").onclick = choosePipedrive;
$("customerLexware").onclick = chooseLexware;

function renderOffer() {
  collectVisit();
  updateMetaBar();
  const currentRecord = activeArchiveId ? loadArchive().find(item => item.id === activeArchiveId) : null;
  if ($("offerArchiveStatus")) $("offerArchiveStatus").value = currentRecord?.status || "draft";
  if ($("followupDate")) $("followupDate").value = currentRecord?.followupDate || "";
  const result = calculateOffer(state.settings, state.visit, state.discount);
  const strategies = calculatePriceStrategies(
    state.settings,
    state.visit,
    state.discount
  );
  $("priceMinimum").textContent = eur(strategies.minimum.offerGross);
  $("priceStandard").textContent = eur(strategies.standard.offerGross);
  $("pricePremium").textContent = eur(strategies.premium.offerGross);
  document.querySelectorAll("[data-pricing-tier]").forEach(button => {
    button.classList.toggle(
      "active",
      button.dataset.pricingTier === (state.discount.pricingTier || "standard")
    );
  });
  renderMaterialRequirement(result);
  $("offerCustomer").textContent = [state.visit.customer.salutation,state.visit.customer.firstName,state.visit.customer.lastName].filter(Boolean).join(" ") || "–";
  $("offerAddress").textContent = state.visit.customer.objectAddress || [state.visit.customer.street,state.visit.customer.zip,state.visit.customer.city].filter(Boolean).join(", ") || "–";
  $("offerGross").textContent = eur(result.offerGross);
  if ($("dashPriceList")) {
    $("dashPriceList").textContent = state.settings.priceListName;
  }
  if ($("dashCustomer")) {
    $("dashCustomer").textContent =
      [state.visit.customer.firstName, state.visit.customer.lastName]
        .filter(Boolean)
        .join(" ") || "–";
  }
  if ($("dashOffer")) {
    $("dashOffer").textContent = eur(result.offerGross);
  }
  $("internalCalc").innerHTML = result.lineItems.map(item => `<div class="result"><strong>${esc(item.areaName?`${item.areaName} – `:"")}${esc(item.name)}</strong><div class="metric"><span>Umfang</span><strong>${esc(item.scope || `${num(item.quantity)} ${item.unitName}`)}</strong></div>${item.holes!==undefined?`<div class="metric"><span>Bohrlöcher</span><strong>${item.holes}</strong></div><div class="metric"><span>HZ inkl. Reserve</span><strong>${item.saleLiters} l</strong></div>${Number(item.hsKg)>0?`<div class="metric"><span>BKM HS Sperrmörtel</span><strong>${num(item.hsKg)} kg</strong></div>`:""}${item.smallJobIntegrated?`<div class="metric"><span>Kleinmengenaufschlag integriert</span><strong>${eur(item.smallJobSurchargePerUnit)} je ${esc(item.unitName)}</strong></div>`:""}<div class="metric"><span>Arbeitszeit</span><strong>${num(item.hours)} Std.</strong></div>`:""}<div class="metric"><span>Preis je ${esc(item.unitName)}</span><strong>${eur(item.grossUnit)}</strong></div><div class="metric"><span>Gesamt brutto</span><strong>${eur(item.totalGross)}</strong></div></div>`).join("") + `<div class="metric"><span>Materialkosten netto</span><strong>${eur(result.materialCostNet)}</strong></div><div class="metric"><span>Deckungsbeitrag vor sonstigen Betriebskosten</span><strong>${eur(result.contributionBeforeOtherCosts)}</strong></div>`;
  return result;
}

["skontoType","skontoCustom","specialType","specialValue","specialLabel"].forEach(id => {
  $(id).oninput = () => {
    state.discount.skontoType = $("skontoType").value;
    state.discount.skontoCustom = parseDecimal($("skontoCustom").value);
    state.discount.specialType = $("specialType").value;
    state.discount.specialValue = parseDecimal($("specialValue").value);
    state.discount.specialLabel = $("specialLabel").value;
    saveState(); renderOffer();
  };
});

document.querySelectorAll("[data-pricing-tier]").forEach(button => {
  button.onclick = () => {
    state.discount.pricingTier = button.dataset.pricingTier;
    saveState();
    renderOffer();
  };
});
$("deductInventory").onclick = deductCurrentOrderInventory;
$("toggleInternal").onclick = () => $("internalCalc").classList.toggle("hidden");

function buildCustomerSnapshot() {
  updateGeneratedRecommendation();
  const result = renderOffer();
  const measures = result.lineItems.filter(item => item.kind === "measure").map(item => {
    const article = state.settings.lexwareArticles.find(a => a.id === item.articleId);
    return {
      areaName: item.areaName,
      title: article?.title || item.name,
      description: article?.description || item.description || "",
      scope: item.scope
    };
  });
  const extras = result.lineItems.filter(item => item.kind !== "measure" && !item.hiddenToCustomer).map(item => {
    const article = state.settings.lexwareArticles.find(a => a.id === item.articleId);
    return { title:article?.title||item.name, description:article?.description||item.description||"", quantity:item.quantity, unitName:article?.unitName||item.unitName };
  });
  const photos = state.visit.areas.flatMap(area => area.photos.filter(p => p.show).map(p => ({ areaName:area.name, src:p.src, caption:p.caption })));
  return {
    customerName:[state.visit.customer.salutation,state.visit.customer.firstName,state.visit.customer.lastName].filter(Boolean).join(" "),
    company:state.visit.customer.company,
    address:state.visit.customer.objectAddress || [state.visit.customer.street,state.visit.customer.zip,state.visit.customer.city].filter(Boolean).join(", "),
    recommendation:state.visit.customerRecommendation,
    measures, extras, photos,
    normalGross:result.baseGross,
    specialLabel:state.discount.specialLabel,
    specialAmount:result.specialAmount,
    offerGross:result.offerGross,
    skontoPct:result.skontoPct,
    skontoGross:result.skontoGross
  };
}
$("openCustomerView").onclick = () => {
  try {
    collectVisit();
    updateGeneratedRecommendation();
    saveState();

    // Navigation im selben Tab funktioniert auf iPhone und iPad
    // auch im Home-Bildschirm-/PWA-Modus zuverlässig.
    window.location.assign("./customer.html");
  } catch (error) {
    showStatus(
      "offerStatus",
      `Kundenansicht konnte nicht geöffnet werden: ${error.message}`,
      false
    );
  }
};

function buildQuotationPayload() {
  const result = renderOffer();
  const factor = result.baseGross > 0 ? result.offerGross / result.baseGross : 1;
  const lineItems = result.lineItems
    .filter(item => !item.hiddenToCustomer)
    .filter(item => Number(item.quantity) > 0 && Number(item.totalGross) >= 0)
    .map((item, index) => {
      const article = state.settings.lexwareArticles.find(a => a.id === item.articleId);

      const quantity = item.pricingMode === "flat"
        ? 1
        : Number(Number(item.quantity).toFixed(1));

      const unitName = item.pricingMode === "flat"
        ? (article?.unitName || item.unitName || "pauschal")
        : (article?.unitName || item.unitName || "Stück");

      const baseUnitGross = item.pricingMode === "flat"
        ? Number(item.totalGross)
        : Number(item.totalGross) / Math.max(Number(item.quantity), 1);

      const adjustedUnitGross = Number((baseUnitGross * factor).toFixed(2));
      const name = String(article?.title || item.name || `Position ${index + 1}`).trim().slice(0, 255);
      const description = String(article?.description || item.description || "").slice(0, 2000);
      const taxRate = Number(article?.price?.taxRate ?? 19);

      return {
        ...(article
          ? {
              id: article.id,
              type: String(article.type).toUpperCase() === "PRODUCT"
                ? "material"
                : "service"
            }
          : { type: "custom" }),
        name,
        description,
        quantity,
        unitName,
        unitPrice: {
          currency: "EUR",
          grossAmount: adjustedUnitGross,
          taxRatePercentage: Number.isFinite(taxRate) ? taxRate : 19
        },
        discountPercentage: 0
      };
    });

  if (!lineItems.length) {
    throw new Error("Es gibt keine gültige Angebotsposition mit Menge und Preis.");
  }
  return {
    customer: state.visit.customer,
    quotation: {
      lineItems,
      introduction: `Gerne bieten wir Ihnen die nachfolgend beschriebenen Abdichtungsmaßnahmen an.\n\nObjektanschrift: ${state.visit.customer.objectAddress || [state.visit.customer.street,state.visit.customer.zip,state.visit.customer.city].filter(Boolean).join(", ")}`,
      remark: "Wir arbeiten ausschließlich mit Systemprodukten der BKM.MANNESMANN AG.",
      title: "Angebot",
      paymentDiscount: result.skontoPct > 0 ? { discountPercentage:result.skontoPct, discountRange:3 } : null
    }
  };
}
$("sendLexware").onclick = async () => {
  try {
    const payload = buildQuotationPayload();

    const preview = payload.quotation.lineItems.map((item, index) =>
      `${index + 1}. ${item.name}: ${item.quantity} ${item.unitName} × ${eur(item.unitPrice.grossAmount)}`
    ).join("\n");

    console.info("Lexware Angebotspositionen\n" + preview);

    const response = await createLexwareQuotation(payload);
    if (response.contactId) state.visit.customer.lexwareContactId = response.contactId;
    if (response.quotationId) state.visit.lexwareQuotationId = response.quotationId;
    saveState();
    if ($("offerArchiveStatus")) $("offerArchiveStatus").value = "open";
    saveCurrentToArchive(false);
    try {
      await syncVisitDeal("offerSent", {
        offerNumber: response.voucherNumber || response.quotationNumber || "",
        offerDate: todayLocal(),
        offerValue: renderOffer().offerGross,
        note: `Lexware-Angebot ${esc(response.voucherNumber || response.quotationId || "")} wurde erstellt und versendet.`
      });
      showStatus("offerStatus","Lexware-Angebot wurde erstellt, archiviert und mit Pipedrive synchronisiert.",true);
    } catch(syncError) {
      addSyncLog("Angebot",false,syncError.message);
      showStatus("offerStatus",`Lexware-Angebot wurde erstellt. Pipedrive-Synchronisation fehlgeschlagen: ${syncError.message}`,false);
    }
  } catch (error) {
    showStatus("offerStatus",error.message,false);
  }
};

function buildReport() {
  let html = `<div class="report-section"><h2>Kunde und Objekt</h2><table class="report-table"><tr><th>Kunde</th><td>${esc([state.visit.customer.salutation,state.visit.customer.firstName,state.visit.customer.lastName].filter(Boolean).join(" "))}</td></tr><tr><th>Besichtigungsnummer</th><td>${esc(state.visit.visitNumber || "")}</td></tr><tr><th>Besichtigungsdatum</th><td>${esc(state.visit.visitDate || "")}</td></tr><tr><th>Beginn</th><td>${esc(state.visit.visitStartTime || "")}</td></tr><tr><th>Ende</th><td>${esc(state.visit.visitEndTime || "")}</td></tr><tr><th>Dauer</th><td>${esc($("visitDuration")?.value || "")}</td></tr>${state.visit.visitLatitude?`<tr><th>GPS-Standort</th><td>${esc(state.visit.visitLatitude)}, ${esc(state.visit.visitLongitude)} (${esc(state.visit.visitAccuracy)})</td></tr>`:""}${state.visit.visitWeather?`<tr><th>Wetter</th><td>${esc(state.visit.visitWeather)}, ${esc(state.visit.visitOutdoorTemp)} °C, Niederschlag ${esc(state.visit.visitPrecipitation)} mm</td></tr>`:""}<tr><th>Objekt</th><td>${esc(state.visit.customer.objectAddress || [state.visit.customer.street,state.visit.customer.zip,state.visit.customer.city].filter(Boolean).join(", "))}</td></tr><tr><th>Baujahr</th><td>${esc(state.visit.building.yearBuilt)}</td></tr><tr><th>Bauart</th><td>${esc(state.visit.building.buildingType)}</td></tr><tr><th>Fundamentart</th><td>${esc(state.visit.building.foundationType)}</td></tr>${state.visit.building.climateMeasured?`<tr><th>Raumtemperatur</th><td>${esc(state.visit.building.roomTemp)} °C</td></tr><tr><th>Luftfeuchtigkeit</th><td>${esc(state.visit.building.humidity)} %</td></tr><tr><th>Oberflächentemperatur</th><td>${esc(state.visit.building.surfaceTemp)} °C</td></tr><tr><th>Taupunkt</th><td>${esc(state.visit.building.dewPoint)} °C</td></tr>`:""}</table></div>`;
  updateGeneratedRecommendation();
  html += `<div class="report-section"><h2>Schadensbild</h2><p>${esc(state.visit.damageDescription)}</p><h2>Empfehlung</h2><p>${esc(state.visit.customerRecommendation)}</p></div>`;
  for (const area of state.visit.areas) {
    html += `<div class="report-section"><h2>${esc(area.name)}</h2><table class="report-table"><tr><th>Wandmaterial</th><td>${esc(area.wallMaterialOther||area.wallMaterial)}</td></tr><tr><th>Wandstärke</th><td>${esc(area.wallThickness)} cm</td></tr><tr><th>Erdkontakt</th><td>${esc(area.earthContact)}</td></tr></table><h3>Feuchtemessung</h3><table class="report-table"><tr><th>Referenzwert trocken</th><td>${esc(area.dryReference || "")}</td></tr><tr><th>Bemerkung</th><td>${esc(area.measurementRemark || "")}</td></tr></table><h3>Messpunkte</h3><table class="report-table"><tr><th>Gerät</th><th>Messwert</th><th>Höhe</th><th>Position</th></tr>${area.measurements.map(m=>`<tr><td>${esc(m.device)}</td><td>${esc(m.value)} ${esc(m.unit)}</td><td>${esc(m.height)}</td><td>${esc(m.location)}</td></tr>`).join("")}</table><h3>Maßnahmen</h3><table class="report-table">${area.measures.map(m=>{const r=calculateMeasure(state.settings,m);return `<tr><th>${esc(m.type)}</th><td>${esc(r.scope)}</td></tr>`}).join("")}</table><div class="photo-grid">${area.photos.filter(p=>p.show).map(p=>`<div class="photo-card"><img src="${p.src}"><p>${esc(p.caption)}</p></div>`).join("")}</div></div>`;
  }
  const executionNotices = buildExecutionNotices(
    state.settings,
    state.visit
  );

  if (executionNotices.length) {
    html += `<div class="report-section report-notices">
      <h2>Wichtige Hinweise zur Ausführung</h2>
      ${executionNotices.map(notice => `
        <div class="report-notice">
          <h3>${esc(notice.title)}</h3>
          <div class="report-flowtext">${esc(notice.text)}</div>
        </div>
      `).join("")}
    </div>`;
  }

  $("reportContent").innerHTML = html;
}
$("reportPdf").onclick = async () => {
  try {
    collectVisit(); updateGeneratedRecommendation(); saveState();
    const pdf=await createVisitPdf(state.visit);
    downloadBlob(pdf.blob,pdf.filename);
    if (state.visit.customer.pipedriveDealId) {
      await syncVisitDeal("onsiteAppointment", {note:"Besichtigungs- und Messprotokoll erstellt."});
      await uploadPipedriveDealFile(state.visit.customer.pipedriveDealId,pdf.blob,pdf.filename);
      addSyncLog("Besichtigungsprotokoll",true,`${pdf.filename} wurde hochgeladen.`,{dealId:state.visit.customer.pipedriveDealId});
      showStatus("offerStatus","Besichtigungsprotokoll wurde erstellt und zu Pipedrive hochgeladen.",true);
    }
  } catch(error) { addSyncLog("Besichtigungsprotokoll",false,error.message); showStatus("offerStatus",error.message,false); }
};


function inventoryProduct(id) {
  return state.settings.inventory?.products?.find(product => product.id === id);
}

function inventoryStatus(required, product) {
  const stock = Number(product?.stock || 0);
  const remaining = stock - Number(required || 0);
  return {
    stock,
    remaining,
    sufficient: remaining >= 0,
    belowMinimum: remaining < Number(product?.minimumStock || 0)
  };
}

function renderMaterialRequirement(result) {
  const box = $("materialRequirement");
  if (!box) return;

  const hz = inventoryProduct("bkm-hz-250-pro");
  const hs = inventoryProduct("bkm-hs-sperrmoertel");
  const rows = [
    { product: hz, required: result.totalHzLiters, unit: "Liter" },
    { product: hs, required: result.totalHsKg, unit: "kg" }
  ].filter(row => Number(row.required) > 0 || row.product);

  box.innerHTML = rows.map(row => {
    const status = inventoryStatus(row.required, row.product);
    const statusClass = status.sufficient ? (status.belowMinimum ? "warning" : "ok") : "danger";
    const statusText = status.sufficient
      ? `${num(status.remaining)} ${row.unit} verbleiben`
      : `${num(Math.abs(status.remaining))} ${row.unit} fehlen`;

    return `<div class="inventory-requirement ${statusClass}">
      <div>
        <strong>${esc(row.product?.name || "Material")}</strong>
        <small>Bedarf für diesen Auftrag</small>
      </div>
      <div class="inventory-numbers">
        <span>${num(row.required)} ${row.unit} benötigt</span>
        <span>${num(status.stock)} ${row.unit} Bestand</span>
        <b>${esc(statusText)}</b>
      </div>
    </div>`;
  }).join("");

  if (state.visit.inventoryDeducted) {
    box.innerHTML += `<p class="inventory-booked">Material bereits am ${esc(
      new Date(state.visit.inventoryDeductedAt).toLocaleString("de-DE")
    )} abgebucht.</p>`;
  }
}

function inventoryTransaction(product, amount, type, note) {
  state.settings.inventory = state.settings.inventory || { products: [], transactions: [] };
  state.settings.inventory.transactions = state.settings.inventory.transactions || [];
  state.settings.inventory.transactions.unshift({
    id: crypto.randomUUID(),
    date: new Date().toISOString(),
    productId: product.id,
    productName: product.name,
    amount,
    unit: product.unit,
    type,
    note
  });
  state.settings.inventory.transactions =
    state.settings.inventory.transactions.slice(0, 100);
}

function renderInventorySettings() {
  const inventory = state.settings.inventory || { products: [], transactions: [] };
  state.settings.inventory = inventory;
  inventory.products = inventory.products || [];
  inventory.transactions = inventory.transactions || [];

  const box = $("inventoryProducts");
  if (box) {
    box.innerHTML = inventory.products.map(product => {
      const low = Number(product.stock) <= Number(product.minimumStock);
      return `<div class="inventory-product-card ${low ? "low-stock" : ""}">
        <div class="inventory-product-head">
          <div><strong>${esc(product.name)}</strong><small>${low ? "Mindestbestand erreicht" : "Bestand ausreichend"}</small></div>
          <label><input type="checkbox" data-inventory-active="${product.id}" ${product.active !== false ? "checked" : ""}> aktiv</label>
        </div>
        <div class="grid">
          <div><label>Bezeichnung</label><input data-inventory-id="${product.id}" data-inventory-field="name" value="${esc(product.name)}"></div>
          <div><label>Einheit</label><input data-inventory-id="${product.id}" data-inventory-field="unit" value="${esc(product.unit)}"></div>
          <div><label>Aktueller Bestand</label><input type="number" inputmode="decimal" step=".1" data-inventory-id="${product.id}" data-inventory-field="stock" value="${Number(product.stock || 0)}"></div>
          <div><label>Mindestbestand</label><input type="number" inputmode="decimal" step=".1" data-inventory-id="${product.id}" data-inventory-field="minimumStock" value="${Number(product.minimumStock || 0)}"></div>
          <div><label>Gebindegröße</label><input type="number" inputmode="decimal" step=".1" data-inventory-id="${product.id}" data-inventory-field="packageSize" value="${Number(product.packageSize || 0)}"></div>
          <div><label>Einkauf netto je Einheit</label><input type="number" inputmode="decimal" step=".01" data-inventory-id="${product.id}" data-inventory-field="purchaseNet" value="${Number(product.purchaseNet || 0)}"></div>
          <div><label>Zugang buchen</label><input type="number" inputmode="decimal" step=".1" id="receipt-${product.id}" placeholder="Menge"></div>
          <div class="inventory-action-cell"><button class="secondary" data-inventory-receipt="${product.id}">Bestand erhöhen</button></div>
        </div>
      </div>`;
    }).join("");

    box.querySelectorAll("[data-inventory-field]").forEach(input => {
      input.onchange = () => {
        const product = inventory.products.find(item => item.id === input.dataset.inventoryId);
        const field = input.dataset.inventoryField;
        product[field] = ["stock","minimumStock","packageSize","purchaseNet"].includes(field)
          ? parseDecimal(input.value)
          : input.value;
        if (product.id === "bkm-hz-250-pro" && field === "purchaseNet") {
          state.settings.hzPurchaseNet = product.purchaseNet;
        }
        saveState();
        renderInventorySettings();
      };
    });

    box.querySelectorAll("[data-inventory-active]").forEach(input => {
      input.onchange = () => {
        const product = inventory.products.find(item => item.id === input.dataset.inventoryActive);
        product.active = input.checked;
        saveState();
      };
    });

    box.querySelectorAll("[data-inventory-receipt]").forEach(button => {
      button.onclick = () => {
        const product = inventory.products.find(item => item.id === button.dataset.inventoryReceipt);
        const input = $(`receipt-${product.id}`);
        const amount = parseDecimal(input.value);
        if (amount <= 0) return;
        product.stock = Number(product.stock || 0) + amount;
        inventoryTransaction(product, amount, "receipt", "Wareneingang");
        saveState();
        renderInventorySettings();
      };
    });
  }

  const history = $("inventoryHistory");
  if (history) {
    history.innerHTML = inventory.transactions.length
      ? inventory.transactions.slice(0, 12).map(item => `
        <div class="compact-list-item">
          <div><strong>${esc(item.productName)}</strong><small>${new Date(item.date).toLocaleString("de-DE")} – ${esc(item.note || "")}</small></div>
          <b>${item.type === "issue" ? "−" : "+"}${num(Math.abs(item.amount))} ${esc(item.unit)}</b>
        </div>`).join("")
      : `<p class="hint">Noch keine Lagerbewegungen vorhanden.</p>`;
  }
}

function deductCurrentOrderInventory() {
  if (state.visit.inventoryDeducted) {
    showStatus("inventoryDeductStatus", "Das Material für diesen Auftrag wurde bereits abgebucht.", false);
    return;
  }

  const result = calculateOffer(state.settings, state.visit, state.discount);
  const deductions = [
    { product: inventoryProduct("bkm-hz-250-pro"), amount: result.totalHzLiters },
    { product: inventoryProduct("bkm-hs-sperrmoertel"), amount: result.totalHsKg }
  ].filter(item => item.product && Number(item.amount) > 0);

  const insufficient = deductions.filter(
    item => Number(item.product.stock || 0) < Number(item.amount)
  );
  if (insufficient.length) {
    const text = insufficient.map(
      item => `${item.product.name}: ${num(item.amount - Number(item.product.stock || 0))} ${item.product.unit} fehlen`
    ).join(", ");
    if (!confirm(`Der Bestand reicht nicht vollständig aus. ${text}. Trotzdem abbuchen?`)) {
      return;
    }
  }

  for (const item of deductions) {
    item.product.stock = Number(item.product.stock || 0) - Number(item.amount);
    inventoryTransaction(
      item.product,
      -Number(item.amount),
      "issue",
      `Auftrag ${state.visit.visitNumber || customerDisplayName(state.visit.customer)}`
    );
  }

  state.visit.inventoryDeducted = true;
  state.visit.inventoryDeductedAt = new Date().toISOString();
  saveState();
  renderOffer();
  renderInventorySettings();
  showStatus("inventoryDeductStatus", "Material wurde vom Warenbestand abgebucht.", true);
}

function articleOptions(selected="") {
  return `<option value="">nicht zugeordnet</option>${state.settings.lexwareArticles.map(article=>`<option value="${article.id}" ${selected===article.id?"selected":""}>${esc(article.articleNumber?`${article.articleNumber} – `:"")}${esc(article.title)}</option>`).join("")}`;
}

function mappingOptions(items, selected, labelKey="name", valueKey="key") {
  return `<option value="">nicht zugeordnet</option>` + (items||[]).map(item => {
    const value=String(item[valueKey] ?? item.id ?? "");
    const label=String(item[labelKey] ?? item.name ?? value);
    return `<option value="${esc(value)}" ${String(selected||"")===value?"selected":""}>${esc(label)}</option>`;
  }).join("");
}

function renderPipedriveSyncSettings() {
  const sync=state.settings.pipedriveSync ||= {autoSync:true,fields:[],stages:[],fieldMappings:{},stageMappings:{},log:[]};
  $("pipedriveAutoSync").checked=sync.autoSync !== false;
  $("pipedriveStageMappings").innerHTML=STAGE_DEFINITIONS.map(([key,label])=>`
    <div class="mapping-item"><label>${esc(label)}</label><select data-stage-mapping="${key}">${mappingOptions(sync.stages,sync.stageMappings?.[key],"name","id")}</select></div>`).join("");
  $("pipedriveFieldMappings").innerHTML=FIELD_DEFINITIONS.map(([key,label])=>`
    <div class="mapping-item"><label>${esc(label)}</label><select data-field-mapping="${key}">${mappingOptions(sync.fields,sync.fieldMappings?.[key],"name","key")}</select>${sync.fieldMappings?.[key]?`<small>${esc(sync.fields.find(f=>f.key===sync.fieldMappings[key])?.type||"")}</small>`:""}</div>`).join("");
  document.querySelectorAll("[data-stage-mapping]").forEach(select=>select.onchange=()=>{sync.stageMappings[select.dataset.stageMapping]=select.value;saveState();});
  document.querySelectorAll("[data-field-mapping]").forEach(select=>select.onchange=()=>{sync.fieldMappings[select.dataset.fieldMapping]=select.value;saveState();renderPipedriveSyncSettings();});
  $("pipedriveSyncLog").innerHTML=(sync.log||[]).length ? sync.log.slice(0,30).map(item=>`<div class="sync-log-row ${item.ok?"ok":"err"}"><span>${new Date(item.time).toLocaleString("de-DE")}</span><b>${esc(item.action)}</b><span>${esc(item.message)}</span></div>`).join("") : `<p class="hint">Noch keine Synchronisation protokolliert.</p>`;
}

async function loadPipedriveSchema() {
  showStatus("pipedriveSchemaStatus","Pipedrive-Felder und Dealphasen werden geladen …",true);
  try {
    collectSettings(); saveState();
    const [fieldData,stageData]=await Promise.all([loadPipedriveDealFields(),loadPipedriveStages()]);
    const sync=state.settings.pipedriveSync ||= {};
    sync.fields=fieldData.fields||[];
    sync.stages=stageData.stages||[];
    sync.fieldMappings={...autoMapFields(sync.fields),...(sync.fieldMappings||{})};
    sync.stageMappings={...autoMapStages(sync.stages),...(sync.stageMappings||{})};
    saveState(); renderPipedriveSyncSettings();
    showStatus("pipedriveSchemaStatus",`${sync.fields.length} Deal-Felder und ${sync.stages.length} Dealphasen geladen. Bitte Zuordnung kontrollieren.`,true);
  } catch(error) { addSyncLog("Schema",false,error.message); renderPipedriveSyncSettings(); showStatus("pipedriveSchemaStatus",error.message,false); }
}

function renderSettings() {
  const s = state.settings;
  ["priceListName","priceListDate","hzPurchaseNet","hzSaleNet","reservePct","drillRate","fillRate","closeRate","setupHours","wallSoleGrossPerMeter","extraResinKgNet","hsKgPerWallSoleMeter","workerUrl","appSecret"].forEach(key => $(key).value = s[key] ?? "");
  $("minimumPricePercent").value = Number(s.priceStrategy?.minimumFactor || .9) * 100;
  $("standardPricePercent").value = Number(s.priceStrategy?.standardFactor || 1) * 100;
  $("premiumPricePercent").value = Number(s.priceStrategy?.premiumFactor || 1.15) * 100;
  $("smallJobEnabled").value = String(s.smallJob.enabled);
  $("smallJobHorizontalThreshold").value = s.smallJob.horizontalThresholdMeters ?? 12;
  $("smallJobSurfaceThreshold").value = s.smallJob.surfaceThresholdSquareMeters ?? 3;
  $("smallJobType").value = s.smallJob.type;
  $("smallJobValue").value = s.smallJob.value;
  $("mapHorizontalsperre").innerHTML = articleOptions(s.articleMappings.Horizontalsperre);
  $("mapFlächensperre").innerHTML = articleOptions(s.articleMappings.Flächensperre);
  $("mapHarzverpressung").innerHTML = articleOptions(s.articleMappings.Harzverpressung);
  $("mapWandSohle").innerHTML = articleOptions(s.articleMappings["Wand-Sohlen-Anschluss"]);
  const noticeTexts = s.noticeTexts || {};
  $("noticeStandard").value = noticeTexts.standard || "";
  $("noticeWallSole").value = noticeTexts.wallSole || "";
  $("noticeResin").value = noticeTexts.resin || "";
  renderSettingsExtras();
  renderInventorySettings();
  renderPipedriveSyncSettings();
  applyInputModes();
}

let activeWorksiteId = null;

function worksiteCustomerName(worksite) {
  return [worksite.customer?.salutation, worksite.customer?.firstName, worksite.customer?.lastName].filter(Boolean).join(" ") || worksite.customer?.company || "Unbenannter Kunde";
}

function renderWorksites() {
  const list = loadWorksites();
  const box = $("worksiteList");
  if (!box) return;
  $("worksiteEditor").classList.toggle("hidden", !activeWorksiteId);
  $("closeWorksite").classList.toggle("hidden", !activeWorksiteId);
  box.classList.toggle("hidden", Boolean(activeWorksiteId));
  if (activeWorksiteId) {
    renderWorksiteEditor();
    return;
  }
  box.innerHTML = `<h2>Baustellen</h2>` + (list.length ? list.map(item => `
    <div class="worksite-list-item">
      <div><strong>${esc(worksiteCustomerName(item))}</strong><span>${esc(item.objectAddress || "–")}</span><small>${esc(item.date || "")} · ${esc(item.status === "completed" ? "abgeschlossen" : item.status === "active" ? "in Ausführung" : "geplant")}</small></div>
      <div class="worksite-list-actions"><button class="secondary" data-open-worksite="${item.id}">Öffnen</button><button class="danger" data-delete-worksite="${item.id}">Löschen</button></div>
    </div>`).join("") : `<p class="hint">Noch keine Baustelle angelegt. Öffne ein angenommenes Angebot und tippe auf „Baustelle aus Angebot anlegen“.</p>`);
  box.querySelectorAll("[data-open-worksite]").forEach(button => button.onclick = () => { activeWorksiteId = button.dataset.openWorksite; renderWorksites(); });
  box.querySelectorAll("[data-delete-worksite]").forEach(button => button.onclick = () => { if(confirm("Baustelle wirklich löschen?")){ deleteWorksite(button.dataset.deleteWorksite); renderWorksites(); } });
}

function collectWorksite() {
  const worksite = getWorksite(activeWorksiteId);
  if (!worksite) return null;
  worksite.date = $("wsDate").value;
  worksite.employees = $("wsEmployees").value.trim();
  worksite.startTime = $("wsStart").value;
  worksite.endTime = $("wsEnd").value;
  worksite.pauseMinutes = parseDecimal($("wsPause").value);
  worksite.weather = $("wsWeather").value.trim();
  worksite.outdoorTemp = $("wsOutdoorTemp").value.trim();
  worksite.generalNotes = $("wsGeneralNotes").value.trim();
  worksite.customerSignature = $("wsCustomerSignature").value.trim();
  worksite.workerSignature = $("wsWorkerSignature").value.trim();
  document.querySelectorAll("[data-ws-task]").forEach(input => {
    const task = worksite.tasks.find(item => item.id === input.dataset.wsTask);
    if (!task) return;
    const field = input.dataset.wsField;
    if (input.type === "checkbox") task[field] = input.checked;
    else if (["actualHoles","actualLiters","actualHsKg","packers","resinKg","spacing"].includes(field)) task[field] = parseDecimal(input.value);
    else task[field] = input.value;
  });
  return worksite;
}

function saveActiveWorksite(message=true) {
  const worksite = collectWorksite();
  if (!worksite) return null;
  if (worksite.status === "planned" && worksite.startTime) worksite.status = "active";
  persistWorksite(worksite);
  if(message) showStatus("worksiteStatus","Arbeitsnachweis gespeichert.",true);
  return worksite;
}

function taskPhotoHtml(task) {
  return (task.photos || []).map(photo => `<div class="worksite-photo"><img src="${photo.src}" alt=""><small>${esc(photo.category)}</small><button class="danger" data-delete-ws-photo="${photo.id}" data-task-id="${task.id}">×</button></div>`).join("");
}

let currentWorksiteAttachments = [];

function formatFileSize(size) {
  const value = Number(size || 0);
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function attachmentStatusLabel(item) {
  if (item.uploadStatus === "uploaded") return "In Pipedrive hochgeladen";
  if (item.uploadStatus === "error") return `Fehler: ${item.error || "Upload fehlgeschlagen"}`;
  if (item.uploadStatus === "uploading") return "Wird hochgeladen …";
  return "Noch nicht hochgeladen";
}

async function renderWorksiteAttachments(ws) {
  const box = $("wsAttachmentList");
  if (!box) return;
  try {
    currentWorksiteAttachments = await listWorksiteAttachments(ws.id);
    box.innerHTML = currentWorksiteAttachments.length ? currentWorksiteAttachments.map(item => `
      <article class="worksite-attachment ${item.uploadStatus || "pending"}">
        <div class="attachment-icon">${item.mimeType === "application/pdf" ? "PDF" : item.mimeType.startsWith("image/") ? "BILD" : "DATEI"}</div>
        <div class="attachment-main">
          <strong>${esc(item.filename)}</strong>
          <span>${esc(item.category)} · ${formatFileSize(item.size)}</span>
          ${item.note ? `<small>${esc(item.note)}</small>` : ""}
          <small class="attachment-status">${esc(attachmentStatusLabel(item))}</small>
        </div>
        <div class="attachment-actions">
          <button class="secondary small-button" data-open-attachment="${item.id}">Öffnen</button>
          ${item.uploadStatus === "error" ? `<button class="secondary small-button" data-retry-attachment="${item.id}">Erneut versuchen</button>` : ""}
          <button class="danger small-button" data-delete-attachment="${item.id}">Löschen</button>
        </div>
      </article>`).join("") : `<p class="hint">Noch keine Pläne, PDFs oder sonstigen Unterlagen hinterlegt.</p>`;

    box.querySelectorAll("[data-open-attachment]").forEach(button => button.onclick = () => {
      const item = currentWorksiteAttachments.find(entry => entry.id === button.dataset.openAttachment);
      if (!item) return;
      const url = URL.createObjectURL(item.blob);
      window.open(url, "_blank", "noopener");
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    });
    box.querySelectorAll("[data-delete-attachment]").forEach(button => button.onclick = async () => {
      if (!confirm("Datei wirklich aus der Bauakte löschen?")) return;
      await deleteWorksiteAttachment(button.dataset.deleteAttachment);
      await renderWorksiteAttachments(ws);
    });
    box.querySelectorAll("[data-retry-attachment]").forEach(button => button.onclick = async () => {
      const item = currentWorksiteAttachments.find(entry => entry.id === button.dataset.retryAttachment);
      if (!item) return;
      item.uploadStatus = "pending";
      item.error = "";
      await updateWorksiteAttachment(item);
      await renderWorksiteAttachments(ws);
    });
  } catch (error) {
    box.innerHTML = `<p class="status error">${esc(error.message)}</p>`;
  }
}

function renderWorksiteEditor() {
  const ws = getWorksite(activeWorksiteId);
  if (!ws) { activeWorksiteId=null; renderWorksites(); return; }
  $("wsCustomer").textContent = worksiteCustomerName(ws);
  $("wsAddress").textContent = ws.objectAddress || "–";
  $("wsDate").value = ws.date || "";
  $("wsEmployees").value = ws.employees || "";
  $("wsStart").value = ws.startTime || "";
  $("wsEnd").value = ws.endTime || "";
  $("wsPause").value = formatDecimalInput(ws.pauseMinutes || 0);
  $("wsDuration").value = `${num(workDurationMinutes(ws)/60)} Std.`;
  $("wsWeather").value = ws.weather || "";
  $("wsOutdoorTemp").value = ws.outdoorTemp || "";
  $("wsGeneralNotes").value = ws.generalNotes || "";
  $("wsCustomerSignature").value = ws.customerSignature || "";
  $("wsWorkerSignature").value = ws.workerSignature || "";
  $("worksiteTasks").innerHTML = ws.tasks.map(task => `
    <div class="card worksite-task-card">
      <div class="worksite-task-title"><div><h2>${esc(task.areaName)} – ${esc(task.type)}</h2><small>${esc(task.scope)} · Wand ${num(task.wall)} cm</small></div><label class="worksite-check"><input type="checkbox" data-ws-task="${task.id}" data-ws-field="completed" ${task.completed?"checked":""}> vollständig ausgeführt</label></div>
      <div class="grid">
        <div><label>Bohrlochabstand m</label><select data-ws-task="${task.id}" data-ws-field="spacing"><option value="0.125" ${Number(task.spacing)===.125?"selected":""}>0,125 m</option><option value="0.25" ${Number(task.spacing)===.25?"selected":""}>0,25 m</option></select></div>
        <div><label>Soll-Bohrlöcher</label><input value="${task.plannedHoles}" readonly></div>
        <div><label>Ist-Bohrlöcher</label><input inputmode="decimal" data-ws-task="${task.id}" data-ws-field="actualHoles" value="${formatDecimalInput(task.actualHoles)}"></div>
        <div><label>Sollmenge je Bohrloch (mind. 0,200 l)</label><input value="${num(task.targetLitersPerHole)} l" readonly></div>
        <div><label>Sollverbrauch HZ 250 Pro</label><input value="${num(task.plannedLiters)} l" readonly></div>
        <div><label>Istverbrauch HZ 250 Pro Liter</label><input inputmode="decimal" data-ws-task="${task.id}" data-ws-field="actualLiters" value="${formatDecimalInput(task.actualLiters)}"></div>
        ${task.type === "Wand-Sohlen-Anschluss" ? `<div><label>Soll BKM HS Sperrmörtel</label><input value="${num(task.plannedHsKg)} kg" readonly></div><div><label>Ist BKM HS Sperrmörtel kg</label><input inputmode="decimal" data-ws-task="${task.id}" data-ws-field="actualHsKg" value="${formatDecimalInput(task.actualHsKg)}"></div>` : ""}
        ${task.type === "Harzverpressung" ? `<div><label>Ist Packer Stück</label><input inputmode="decimal" data-ws-task="${task.id}" data-ws-field="packers" value="${formatDecimalInput(task.packers)}"></div><div><label>Ist Harz kg</label><input inputmode="decimal" data-ws-task="${task.id}" data-ws-field="resinKg" value="${formatDecimalInput(task.resinKg)}"></div>` : ""}
        <div><label>Injektionsart</label><select data-ws-task="${task.id}" data-ws-field="injectionType"><option ${task.injectionType==="Niederdruckverfahren"?"selected":""}>Niederdruckverfahren</option><option ${task.injectionType==="drucklose Injektion"?"selected":""}>drucklose Injektion</option></select></div>
        ${["","Horizontalsperre","Flächensperre","Wand-Sohlen-Anschluss"].includes(task.type) ? `<div><label>Charge BKM HZ 250 Pro</label><input data-ws-task="${task.id}" data-ws-field="chargeHz" value="${esc(task.chargeHz)}"></div>` : ""}
        <div class="full"><label>Was wurde gemacht / Besonderheiten</label><textarea data-ws-task="${task.id}" data-ws-field="note">${esc(task.note)}</textarea></div>
      </div>
      <label>Fotos</label><div class="grid"><div><select id="photo-category-${task.id}"><option>Vorher</option><option>Während</option><option>Nachher</option></select></div><div><input type="file" accept="image/*" capture="environment" data-ws-photo-task="${task.id}" multiple></div></div>
      <div class="worksite-photo-grid">${taskPhotoHtml(task)}</div>
    </div>`).join("");
  const totals = worksiteMaterialTotals(ws);
  $("wsMaterialSummary").innerHTML = `<div class="worksite-material-row"><span>BKM HZ 250 Pro</span><strong>${num(totals.hzLiters)} Liter</strong></div><div class="worksite-material-row"><span>BKM HS Sperrmörtel</span><strong>${num(totals.hsKg)} kg</strong></div><div class="worksite-material-row"><span>Harz</span><strong>${num(totals.resinKg)} kg</strong></div><div class="worksite-material-row"><span>Packer</span><strong>${num(totals.packers)} Stück</strong></div>${ws.materialBooked?`<p class="booked-badge">Material bereits abgebucht</p>`:""}`;
  document.querySelectorAll("[data-ws-photo-task]").forEach(input => input.onchange = event => {
    const task = ws.tasks.find(item => item.id === input.dataset.wsPhotoTask);
    const category = $(`photo-category-${task.id}`).value;
    [...event.target.files].forEach(file => { const reader=new FileReader(); reader.onload=result=>{ task.photos.push({id:crypto.randomUUID(),category,src:result.target.result}); persistWorksite(ws); renderWorksiteEditor(); }; reader.readAsDataURL(file); });
  });
  document.querySelectorAll("[data-delete-ws-photo]").forEach(button => button.onclick = () => { const task=ws.tasks.find(item=>item.id===button.dataset.taskId); task.photos=task.photos.filter(photo=>photo.id!==button.dataset.deleteWsPhoto); persistWorksite(ws); renderWorksiteEditor(); });
  document.querySelectorAll('[data-ws-field="spacing"]').forEach(select => select.onchange = () => {
    const task=ws.tasks.find(item=>item.id===select.dataset.wsTask);
    task.spacing=parseDecimal(select.value);
    recalculateWorksiteTask(state.settings,task);
    persistWorksite(ws);
    renderWorksiteEditor();
  });
  applyInputModes($("worksiteEditor"));
  renderWorksiteAttachments(ws);
}

function deductWorksiteInventory(ws) {
  if (ws.materialBooked) throw new Error("Das Ist-Material wurde bereits abgebucht.");
  const totals = worksiteMaterialTotals(ws);
  const rows = [
    { id:"bkm-hz-250-pro", amount:totals.hzLiters },
    { id:"bkm-hs-sperrmoertel", amount:totals.hsKg }
  ];
  for (const row of rows) {
    if (row.amount <= 0) continue;
    const product = state.settings.inventory?.products?.find(item => item.id === row.id);
    if (!product) continue;
    product.stock = Number(product.stock || 0) - row.amount;
    inventoryTransaction(product,-row.amount,"issue",`Istverbrauch Baustelle ${worksiteCustomerName(ws)}`);
  }
  ws.materialBooked = true;
  ws.materialBookedAt = new Date().toISOString();
}

function buildWorksitePrint(ws) {
  const totals=worksiteMaterialTotals(ws);
  $("worksitePrintContent").innerHTML = `<div class="report-section"><h1>${esc(worksiteCustomerName(ws))}</h1><p>${esc(ws.objectAddress)}</p><div class="worksite-print-grid"><div><strong>Datum:</strong> ${esc(ws.date)}</div><div><strong>Mitarbeiter:</strong> ${esc(ws.employees)}</div><div><strong>Arbeitsbeginn:</strong> ${esc(ws.startTime)}</div><div><strong>Arbeitsende:</strong> ${esc(ws.endTime)}</div><div><strong>Pause:</strong> ${num(ws.pauseMinutes)} Min.</div><div><strong>Arbeitszeit:</strong> ${num(workDurationMinutes(ws)/60)} Std.</div><div><strong>Wetter:</strong> ${esc(ws.weather)}</div><div><strong>Außentemperatur:</strong> ${esc(ws.outdoorTemp)} °C</div></div></div>${ws.tasks.map(task=>`<div class="worksite-print-task"><h3>${esc(task.areaName)} – ${esc(task.type)}</h3><div class="worksite-print-grid"><div><strong>Umfang:</strong> ${esc(task.scope)}</div><div><strong>Wandstärke:</strong> ${num(task.wall)} cm</div><div><strong>Bohrlochabstand:</strong> ${num(task.spacing)} m</div><div><strong>Bohrlöcher Soll/Ist:</strong> ${num(task.plannedHoles)} / ${num(task.actualHoles)}</div><div><strong>Menge je Bohrloch:</strong> ${num(task.targetLitersPerHole)} l (mind. 0,200 l)</div><div><strong>HZ Soll/Ist:</strong> ${num(task.plannedLiters)} / ${num(task.actualLiters)} l</div>${task.plannedHsKg?`<div><strong>HS Soll/Ist:</strong> ${num(task.plannedHsKg)} / ${num(task.actualHsKg)} kg</div>`:""}<div><strong>Injektionsart:</strong> ${esc(task.injectionType)}</div><div><strong>Charge HZ 250 Pro:</strong> ${esc(task.chargeHz||"–")}</div><div><strong>Ausgeführt:</strong> ${task.completed?"Ja":"Nein"}</div></div><div class="worksite-print-note"><strong>Ausführung/Besonderheiten:</strong><br>${esc(task.note||"–")}</div></div>`).join("")}<div class="report-section"><h2>Verbrauchtes Material</h2><p>BKM HZ 250 Pro: ${num(totals.hzLiters)} Liter<br>BKM HS Sperrmörtel: ${num(totals.hsKg)} kg<br>Harz: ${num(totals.resinKg)} kg<br>Packer: ${num(totals.packers)} Stück</p><p><strong>Allgemeine Bemerkungen:</strong><br>${esc(ws.generalNotes||"–")}</p><p><strong>Kunde:</strong> ${esc(ws.customerSignature||"–")} &nbsp;&nbsp; <strong>Ausführender:</strong> ${esc(ws.workerSignature||"–")}</p></div>`;
}

$("createWorksite").onclick = () => {
  collectVisit();
  const offer=saveCurrentToArchive(false);
  const ws=createWorksiteFromVisit(state.settings,state.visit,offer.id);
  if(!ws.tasks.length){ showStatus("offerStatus","Keine Maßnahme mit gültiger Menge vorhanden.",false); return; }
  persistWorksite(ws); activeWorksiteId=ws.id; show("worksites"); showStatus("worksiteStatus","Baustelle wurde aus dem Angebot angelegt.",true);
};
$("closeWorksite").onclick = () => { activeWorksiteId=null; renderWorksites(); };
$("wsAddAttachments").onclick = () => $("wsAttachmentInput").click();
$("wsAttachmentInput").onchange = async event => {
  const ws = saveActiveWorksite(false) || getWorksite(activeWorksiteId);
  if (!ws) return;
  const category = $("wsAttachmentCategory").value;
  const note = $("wsAttachmentNote").value.trim();
  const files = [...(event.target.files || [])];
  if (!files.length) return;
  try {
    showStatus("worksiteStatus", `${files.length} Datei(en) werden gespeichert …`, true);
    for (const file of files) await addWorksiteAttachment(ws.id, file, { category, note });
    event.target.value = "";
    $("wsAttachmentNote").value = "";
    await renderWorksiteAttachments(ws);
    showStatus("worksiteStatus", `${files.length} Datei(en) wurden der Bauakte hinzugefügt.`, true);
  } catch (error) {
    showStatus("worksiteStatus", error.message, false);
  }
};
$("wsUploadAttachments").onclick = async () => {
  try {
    const ws = saveActiveWorksite(false);
    if (!ws) return;
    showStatus("worksiteStatus", "Unterlagen werden zu Pipedrive hochgeladen …", true);
    await syncWorksiteDeal(ws, ws.status === "completed" ? "executionCompleted" : "executionPlanned", null);
    await renderWorksiteAttachments(ws);
    showStatus("worksiteStatus", "Alle noch offenen Unterlagen wurden zu Pipedrive hochgeladen.", true);
  } catch (error) {
    await renderWorksiteAttachments(getWorksite(activeWorksiteId));
    showStatus("worksiteStatus", error.message, false);
  }
};
$("saveWorksite").onclick = () => { saveActiveWorksite(true); renderWorksiteEditor(); };
["wsStart","wsEnd","wsPause"].forEach(id => $(id).onchange = () => { const ws=collectWorksite(); if(ws) $("wsDuration").value=`${num(workDurationMinutes(ws)/60)} Std.`; });
$("printWorksite").onclick = async () => {
  try { const ws=saveActiveWorksite(false); const pdf=await createWorksitePdf(ws); downloadBlob(pdf.blob,pdf.filename); showStatus("worksiteStatus","Arbeitsnachweis wurde als PDF erstellt.",true); }
  catch(error){ showStatus("worksiteStatus",error.message,false); }
};
$("syncWorksitePipedrive").onclick = async () => {
  try { const ws=saveActiveWorksite(false); const pdf=await createWorksitePdf(ws); await syncWorksiteDeal(ws,ws.status==="completed"?"executionCompleted":"executionPlanned",pdf); renderWorksiteEditor(); showStatus("worksiteStatus","Arbeitsnachweis und Baustellendaten wurden zu Pipedrive übertragen.",true); }
  catch(error){ addSyncLog("Arbeitsnachweis",false,error.message); showStatus("worksiteStatus",error.message,false); }
};
$("completeWorksite").onclick = async () => {
  try {
    const ws=saveActiveWorksite(false);
    if (ws.materialBooked || ws.status === "completed") throw new Error("Diese Baustelle wurde bereits abgeschlossen und das Material bereits abgebucht.");
    if(!ws.tasks.every(task=>task.completed) && !confirm("Nicht alle Maßnahmen sind als vollständig ausgeführt markiert. Trotzdem abschließen?")) return;
    const oldStatus=ws.status;
    ws.status="completed";
    const pdf=await createWorksitePdf(ws);
    try { await syncWorksiteDeal(ws,"executionCompleted",pdf); }
    catch(error) { ws.status=oldStatus; persistWorksite(ws); throw error; }
    deductWorksiteInventory(ws);
    persistWorksite(ws); saveState(); renderInventorySettings(); renderWorksiteEditor();
    showStatus("worksiteStatus","Arbeitsnachweis hochgeladen, Pipedrive aktualisiert und Ist-Material abgebucht.",true);
  } catch(error){ addSyncLog("Baustellenabschluss",false,error.message); showStatus("worksiteStatus",`Abschluss abgebrochen: ${error.message}`,false); }
};

function renderSettingsExtras() {
  $("settingsExtras").innerHTML = state.settings.extras.map(extra => {
    const article = state.settings.lexwareArticles.find(a=>a.id===extra.lexwareArticleId);
    return `<div class="catalog-row"><div class="grid"><div class="full"><label>Lexware-Artikel</label><select data-extra-article="${extra.id}">${articleOptions(extra.lexwareArticleId)}</select></div>${article?`<div class="full"><strong>${esc(article.title)}</strong><div class="article-description">${esc(article.description||"")}</div></div><div><label>Einheit aus Lexware</label><input value="${esc(article.unitName||extra.unit)}" readonly></div>`:`<div><label>Bezeichnung</label><input data-extra="${extra.id}" data-extra-field="name" value="${esc(extra.name)}"></div><div><label>Einheit</label><input data-extra="${extra.id}" data-extra-field="unit" value="${esc(extra.unit)}"></div>`}<div><label>Preis brutto aus App</label><input data-extra="${extra.id}" data-extra-field="grossPrice" value="${extra.grossPrice}"></div><label><input type="checkbox" data-extra-active="${extra.id}" ${extra.active?"checked":""}> aktiv</label><button class="danger" data-extra-delete="${extra.id}">Löschen</button></div></div>`;
  }).join("");
  document.querySelectorAll("[data-extra-field]").forEach(input => input.oninput = () => {
    const extra = state.settings.extras.find(e=>e.id===input.dataset.extra);
    extra[input.dataset.extraField] = input.dataset.extraField==="grossPrice" ? parseDecimal(input.value) : input.value;
  });
  document.querySelectorAll("[data-extra-article]").forEach(select => select.onchange = () => {
    const extra = state.settings.extras.find(e=>e.id===select.dataset.extraArticle);
    extra.lexwareArticleId = select.value;
    renderSettingsExtras();
  });
  document.querySelectorAll("[data-extra-active]").forEach(input => input.onchange = () => state.settings.extras.find(e=>e.id===input.dataset.extraActive).active = input.checked);
  document.querySelectorAll("[data-extra-delete]").forEach(button => button.onclick = () => { state.settings.extras = state.settings.extras.filter(e=>e.id!==button.dataset.extraDelete); renderSettingsExtras(); });
}
$("addInventoryProduct").onclick = () => {
  state.settings.inventory = state.settings.inventory || { products: [], transactions: [] };
  state.settings.inventory.products.push({
    id: crypto.randomUUID(),
    name: "Neues Material",
    unit: "Stück",
    stock: 0,
    minimumStock: 0,
    packageSize: 1,
    purchaseNet: 0,
    active: true
  });
  saveState();
  renderInventorySettings();
};
$("addExtra").onclick = () => { state.settings.extras.push({id:crypto.randomUUID(),name:"Neue Zusatzleistung",unit:"pauschal",grossPrice:0,active:true,lexwareArticleId:""}); renderSettingsExtras(); };
$("loadPipedriveSchema").onclick = loadPipedriveSchema;
$("pipedriveAutoSync").onchange = () => { state.settings.pipedriveSync.autoSync=$("pipedriveAutoSync").checked; saveState(); };
$("loadArticles").onclick = async () => {
  try { const articles = await loadLexwareArticles(); renderSettings(); showStatus("articleStatus",`${articles.length} Artikel geladen.`,true); }
  catch(error){ showStatus("articleStatus",error.message,false); }
};
function collectSettings() {
  const s = state.settings;
  ["priceListName","priceListDate","workerUrl","appSecret"].forEach(key => s[key] = $(key).value.trim());
  ["hzPurchaseNet","hzSaleNet","reservePct","drillRate","fillRate","closeRate","setupHours","wallSoleGrossPerMeter","extraResinKgNet","hsKgPerWallSoleMeter"].forEach(key => s[key] = parseDecimal($(key).value));
  s.priceStrategy = {
    minimumFactor: (parseDecimal($("minimumPricePercent").value) || 90) / 100,
    standardFactor: (parseDecimal($("standardPricePercent").value) || 100) / 100,
    premiumFactor: (parseDecimal($("premiumPricePercent").value) || 115) / 100
  };
  s.smallJob = {
    enabled:$("smallJobEnabled").value==="true",
    horizontalThresholdMeters:parseDecimal($("smallJobHorizontalThreshold").value)||12,
    surfaceThresholdSquareMeters:parseDecimal($("smallJobSurfaceThreshold").value)||3,
    type:$("smallJobType").value,
    value:parseDecimal($("smallJobValue").value)
  };
  s.articleMappings = { Horizontalsperre:$("mapHorizontalsperre").value, Flächensperre:$("mapFlächensperre").value, Harzverpressung:$("mapHarzverpressung").value, "Wand-Sohlen-Anschluss":$("mapWandSohle").value };
  s.noticeTexts = {
    standard: $("noticeStandard").value.trim(),
    wallSole: $("noticeWallSole").value.trim(),
    resin: $("noticeResin").value.trim()
  };
  s.pipedriveSync = s.pipedriveSync || {fields:[],stages:[],fieldMappings:{},stageMappings:{},log:[]};
  s.pipedriveSync.autoSync = $("pipedriveAutoSync").checked;
}
$("saveConnection").onclick = () => { collectSettings(); saveState(); showStatus("connectionStatus","Zugangsdaten gespeichert.",true); };
$("saveSettings").onclick = () => { collectSettings(); saveState(); showStatus("settingsStatus","Einstellungen gespeichert.",true); renderExtras(); renderOffer(); renderPipedriveSyncSettings(); };
$("resetSettings").onclick = () => { if(confirm("Standardwerte laden?")){ resetSettings(); renderSettings(); } };
$("testConnection").onclick = async () => {
  collectSettings(); saveState();
  const setState = (id,label,ok,error) => { const el=$(id); el.className=`connection-state ${ok?"ok":"err"}`; el.textContent=`${label}: ${ok?"verbunden":error||"Fehler"}`; };
  const result = await testConnections();
  setState("stateCloudflare","Cloudflare",result.cloudflare,result.errors.cloudflare);
  setState("stateLexware","Lexware",result.lexware,result.errors.lexware);
  setState("statePipedrive","Pipedrive",result.pipedrive,result.errors.pipedrive);
};

state.discount.pricingTier = state.discount.pricingTier || "standard";
$("skontoType").value = state.discount.skontoType;
$("skontoCustom").value = state.discount.skontoCustom;
$("specialType").value = state.discount.specialType;
$("specialValue").value = state.discount.specialValue;
$("specialLabel").value = state.discount.specialLabel;

renderVisit(); updateGeneratedRecommendation(); renderSettings(); renderOffer(); renderArchive(); updateDashboardOverview(); updateBackupTime(); show("dashboard");

window.addEventListener("keydown", event => { if (event.key === "Escape") closeAppMenu(); });
