import { state, saveState, resetVisit, resetSettings, loadArchive, saveArchive, archiveCurrentOffer, deleteArchiveRecord, replaceArchive, createFullBackupPayload, restoreFullBackupPayload } from "./storage-v227.js";
import { DEFAULTS, createArea } from "./defaults-v227.js";
import { calculateOffer, calculateMeasure, calculatePriceStrategies } from "./calculator-v227.js";
import { $, eur, num, esc, showStatus, bindSpeechButtons, parseDecimal, formatDecimalInput } from "./utils-v227.js";
import { hasConnectionConfig, normalizeWorkerUrl, searchPipedrive, loadPipedrivePerson, searchLexwareCustomers, loadLexwareCustomer, loadLexwareArticles, testConnections, createLexwareQuotation, createPipedrivePerson, loadPipedriveActivities, createPipedriveActivity, loadAcceptedLexwareQuotation, loadLexwareQuotations,loadPipedriveDealContext,loadLexwareCustomerHistory, loadPipedriveDealFields, loadPipedrivePersonFields, loadPipedriveStages, syncPipedriveDeal, addPipedriveDealNote, uploadPipedriveDealFile, uploadDriveVisitDocument, saveDriveBackup } from "./api-v227.js";
import { buildExecutionNotices } from "./texts-v227.js";
import { compressImage, recognizeScreenshot, parseInquiryText } from "./importer-v227.js";
import { loadWorksites, saveWorksite as persistWorksite, getWorksite, deleteWorksite, createWorksiteFromVisit, createWorksiteFromLexwareQuotation, workDurationMinutes, worksiteMaterialTotals, recalculateWorksiteTask, taskUsesHz, taskUsesHs, taskUsesResin, taskIsTechnical } from "./construction.js?v=32.9.0";
import { FIELD_DEFINITIONS, STAGE_DEFINITIONS, autoMapFields, autoMapStages, addSyncLog, visitSyncValues, worksiteSyncValues, stageId } from "./pipedrive-sync-v227.js";
import { createWorksitePdf, createVisitPdf, createLexofficeLetterheadPdf, downloadBlob } from "./pdf.js?v=32.7.8";
import { getDocumentProfile } from "./document-profile.js?v=32.7.8";
import { addWorksiteAttachment, listWorksiteAttachments, updateWorksiteAttachment, deleteWorksiteAttachment, safeAttachmentFilename } from "./attachments-v227.js";
import { stageVisitPhoto, localPhotoUrl, syncPendingVisitPhotos, hydrateDrivePhotoImages, migrateEmbeddedVisitPhotos } from "./drive-photos.js?v=32.7.8";
import { stageVisitDocument, syncPendingVisitDocuments, deleteQueuedVisitDocument } from "./drive-documents.js";
import { stageWorksitePhoto, deleteWorksitePhoto, hydrateWorksitePhotoImages, syncWorksitePhotos, migrateEmbeddedWorksitePhotos } from "./worksite-photos.js?v=32.7.8";


const MAINABDICHTER_APP_VERSION = "32.12.0";
window.MAINABDICHTER_APP_VERSION = MAINABDICHTER_APP_VERSION;
const MAINABDICHTER_WORKER_URL = "https://mainabdichter-api.cmww7htry5.workers.dev";

function migrateWorkerUrl() {
  const current = normalizeWorkerUrl(state.settings?.workerUrl || "");
  const isOldOrMissing =
    !current ||
    current.includes("mainabdichter-lexoffice.cmww7htry5.workers.dev") ||
    current.includes("mainabdichter-lexoffice.");

  if (isOldOrMissing) {
    state.settings.workerUrl = MAINABDICHTER_WORKER_URL;
    saveState();
  }

  return state.settings.workerUrl || MAINABDICHTER_WORKER_URL;
}

function applyInputModes(root = document) {
  const decimalSelectors = [
    'input[type="number"]',
    '[data-mf="value"]',
    '[data-mf="height"]',
    '[data-mfield="length"]',
    '[data-mfield="width"]',
    '[data-mfield="height"]',
    '[data-mfield="resinHolesPerMeter"]',
    '[data-mfield="resinIncludedKgPerMeter"]',
    '[data-mfield="resinTotalKg"]',
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

function postalAddress(customer = state.visit.customer) {
  return [customer.street, [customer.zip, customer.city].filter(Boolean).join(" ")]
    .filter(Boolean).join(", ").trim();
}

function syncObjectAddressFromPostal(force = false) {
  const customer = state.visit.customer;
  const different = Boolean($("objectAddressDifferent")?.checked ?? customer.objectAddressDifferent);
  customer.objectAddressDifferent = different;
  if (force || !different) {
    customer.objectAddress = postalAddress(customer);
    if ($("objectAddress")) $("objectAddress").value = customer.objectAddress;
  }
  if ($("objectAddress")) {
    $("objectAddress").readOnly = !different;
    $("objectAddress").classList.toggle("is-auto-address", !different);
  }
  if ($("objectAddressHint")) {
    $("objectAddressHint").textContent = different
      ? "Abweichende Objektanschrift bitte vollständig eintragen."
      : "Wird automatisch aus Straße, PLZ und Ort übernommen.";
  }
}


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
  const postalAddress = [
    customer?.street || "",
    [customer?.zip || "", customer?.city || ""].filter(Boolean).join(" ")
  ].filter(Boolean).join(", ");
  const response = await createPipedrivePerson({
    name: customerName(customer),
    email: customer?.email || "",
    phone: customer?.phone || "",
    street: customer?.street || "",
    zip: customer?.zip || "",
    city: customer?.city || "",
    postalAddress,
    objectAddress: customer?.objectAddress || postalAddress,
    personFieldMappings: state.settings.pipedriveSync?.personFieldMappings || {},
    source: customer?.lexwareContactId ? "Lexoffice-Import" : "mainabdichter-App"
  });
  customer.pipedriveId = String(response.person?.id || "");
  customer.lastPipedriveSync = {
    ok: true,
    at: new Date().toISOString(),
    addressMode: response.syncStatus?.pipedriveAddress || "unknown"
  };
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

function worksiteStatusLabel(status) {
  return status === "completed" ? "abgeschlossen"
    : status === "active" ? "in Ausführung"
    : status === "planned" ? "Ausführung geplant"
    : "Ausführung planen";
}

function worksitePipedriveStage(worksite) {
  return worksite.status === "completed" ? "executionCompleted"
    : worksite.status === "planning" || !worksite.status ? "executionPlanning"
    : "executionPlanned";
}

function requiredPipedriveStageId(key) {
  const value = stageId(key);
  if (!value) {
    const label = key === "executionPlanning" ? "Ausführung planen"
      : key === "executionPlanned" ? "Ausführung geplant" : key;
    throw new Error(`Die Pipedrive-Phase „${label}“ wurde noch nicht erkannt. Bitte im Admin-Menü einmal die Pipedrive-Felder und Phasen aktualisieren.`);
  }
  return value;
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

async function syncWorksiteDeal(worksite, stageKey = null, pdf = null, uploadAttachments = true) {
  const personId = worksite.pipedrivePersonId || await ensurePipedrivePerson(worksite.customer);
  worksite.pipedrivePersonId = personId;
  const response = await syncPipedriveDeal({
    dealId: worksite.pipedriveDealId || worksite.customer?.pipedriveDealId || "",
    personId,
    title: `${worksiteCustomerName(worksite)} – ${worksite.objectAddress || "Baustelle"}`,
    stageId: stageKey ? requiredPipedriveStageId(stageKey) : undefined,
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

  const attachmentResult = uploadAttachments
    ? await uploadWorksiteAttachments(worksite)
    : { uploadedCount: 0, errors: [] };
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
  Object.assign(state.visit.customer,{salutation:data.salutation,firstName:data.firstName,lastName:data.lastName,phone:data.phone,email:data.email,street:data.street,zip:data.zip,city:data.city,objectAddressDifferent:false});
  state.visit.customer.objectAddress = postalAddress(state.visit.customer);
  state.visit.damageDescription=data.message;
  state.visit.inquiry={source:data.source,ownerStatus:data.ownerStatus,appointment:data.appointment,message:data.message,rawText:data.rawText,screenshot:inquiryScreenshotData,importedAt:new Date().toISOString()};
  saveState();
  let pipedriveMessage="";
  if ($("importCreatePipedrive").checked) {
    try {
      const response=await createPipedrivePerson({name:[data.firstName,data.lastName].filter(Boolean).join(" "),email:data.email,phone:data.phone,street:data.street,zip:data.zip,city:data.city,postalAddress:postalAddress(state.visit.customer),objectAddress:state.visit.customer.objectAddress,source:data.source,ownerStatus:data.ownerStatus,appointment:data.appointment,message:data.message});
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
let cachedOpenLexofficeQuotations = [];
let cachedUpcomingPipedriveActivities = [];
let smartAppointmentDraft = null;
let smartAppointmentPerson = null;

const SMART_APPOINTMENT_KINDS = {
  "Besichtigung": {label:"Besichtigung",duration:60,priority:1},
  "Rückruf": {label:"Rückruf",duration:20,priority:2},
  "Nachkontrolle": {label:"Nachkontrolle",duration:45,priority:2},
  "Reklamation": {label:"Reklamation",duration:60,priority:3},
  "Nachbesserung": {label:"Nachbesserung",duration:90,priority:3},
  "Ausführung": {label:"Ausführung",duration:480,priority:2},
  "Abholung": {label:"Abholung",duration:30,priority:1},
  "Sonstiger Termin": {label:"Sonstiger Termin",duration:60,priority:1}
};

function smartCaseType(text) {
  const selected=$("smartAppointmentReason")?.value;
  if(selected&&SMART_APPOINTMENT_KINDS[selected]) return {...SMART_APPOINTMENT_KINDS[selected]};
  const value=String(text||"").toLowerCase();
  if(/reklamation|mangel|problem|wieder feucht/.test(value)) return {label:"Reklamation",duration:60,priority:3};
  if(/nachkontrolle|kontrolle|überprüf/.test(value)) return {label:"Nachkontrolle",duration:45,priority:2};
  if(/nachbesser|nacharbeit/.test(value)) return {label:"Nachbesserung",duration:90,priority:3};
  if(/rückruf|anrufen|telefon/.test(value)) return {label:"Rückruf",duration:20,priority:2};
  if(/abhol|flasche|material/.test(value)) return {label:"Abholung",duration:30,priority:1};
  if(/ausführung|baustelle/.test(value)) return {label:"Ausführung",duration:480,priority:2};
  return {label:"Besichtigung",duration:60,priority:1};
}

function renderSmartSelectedCustomer(person) {
  smartAppointmentPerson=person||null;
  const box=$("smartCustomerSearchResults");
  if(!box) return;
  if(!person){box.innerHTML="";return;}
  box.innerHTML=`<div class="smart-selected-customer"><span><small>AUSGEWÄHLTER KUNDE</small><strong>${esc(person.name||"Kunde")}</strong><em>${esc(smartCity(person)||person.email||person.phone||"Pipedrive")}</em></span><button type="button" id="smartClearCustomer" class="secondary">Ändern</button></div>`;
  $("smartClearCustomer").onclick=()=>{smartAppointmentPerson=null;box.innerHTML="";$("smartCustomerSearch")?.focus();};
}

async function searchSmartAppointmentCustomer() {
  const term=$("smartCustomerSearch")?.value.trim();
  if(!term) return showStatus("smartAppointmentStatus","Bitte gib Name, Ort, Telefonnummer oder E-Mail des Kunden ein.",false);
  showStatus("smartAppointmentStatus","Kunden werden in Pipedrive gesucht …",true);
  try{
    const result=await searchPipedrive(term);
    const people=result.people||[];
    const box=$("smartCustomerSearchResults");
    if(!people.length){box.innerHTML=`<div class="empty-mini">Kein passender Bestandskunde gefunden.</div>`;return showStatus("smartAppointmentStatus","Kein Bestandskunde gefunden. Du kannst den Vorgang über die Texteingabe als Neukunden-Anfrage starten.",false);}
    box.innerHTML=people.slice(0,8).map((person,index)=>`<button type="button" class="smart-customer-result" data-smart-customer="${index}"><span><strong>${esc(person.name||"Kunde")}</strong><small>${esc(smartCity(person)||person.email||person.phone||"Keine Anschrift hinterlegt")}</small></span><b>Auswählen</b></button>`).join("");
    box.querySelectorAll("[data-smart-customer]").forEach(button=>button.onclick=async()=>{
      const person=people[Number(button.dataset.smartCustomer)];
      showStatus("smartAppointmentStatus","Kundendaten werden geladen …",true);
      try{
        const detail=await loadPipedrivePerson(person.id);
        renderSmartSelectedCustomer({...person,...(detail.person||{})});
        showStatus("smartAppointmentStatus","Kunde ausgewählt. Jetzt Termingrund wählen oder das Anliegen beschreiben.",true);
      }catch(error){showStatus("smartAppointmentStatus",error.message,false);}
    });
  }catch(error){showStatus("smartAppointmentStatus",error.message,false);}
}

function smartDateStart(text) {
  const now=new Date(),value=String(text||"").toLowerCase();
  now.setHours(12,0,0,0);
  if(/heute/.test(value)) return now;
  if(/morgen/.test(value)){now.setDate(now.getDate()+1);return now;}
  if(/nächste woche/.test(value)){
    const day=now.getDay()||7;now.setDate(now.getDate()+(8-day));return now;
  }
  now.setDate(now.getDate()+1);return now;
}

function smartCity(person) {
  return String(person?.city||person?.postalAddress||person?.address||"").trim();
}

function buildSmartSuggestions(text,person) {
  const start=smartDateStart(text),kind=smartCaseType(text),suggestions=[];
  const desiredCity=smartCity(person).toLowerCase();
  for(let offset=0;offset<12&&suggestions.length<3;offset++){
    const date=new Date(start);date.setDate(start.getDate()+offset);
    if([0,6].includes(date.getDay())) continue;
    const iso=date.toISOString().slice(0,10);
    const dayItems=cachedUpcomingPipedriveActivities.filter(item=>item.dueDate===iso);
    const busy=new Set(dayItems.map(item=>String(item.dueTime||"").slice(0,5)));
    const nearby=desiredCity&&dayItems.some(item=>String(item.location||"").toLowerCase().includes(desiredCity));
    const times=nearby?["09:30","10:30","14:00","15:00"]:["09:00","10:30","11:30"];
    const time=times.find(candidate=>!busy.has(candidate));
    if(!time) continue;
    suggestions.push({
      date:iso,time,duration:kind.duration,kind:kind.label,nearby,
      reason:nearby
        ? "An diesem Tag liegt bereits ein Termin in derselben Gegend."
        : time<"12:00"
          ? "Freier Vormittag – Besichtigungen werden bevorzugt vormittags eingeplant."
          : "Freies Zeitfenster mit ausreichendem Puffer."
    });
  }
  return suggestions;
}

function renderSmartAppointmentResults() {
  const box=$("smartAppointmentResults");
  if(!box||!smartAppointmentDraft) return;
  const draft=smartAppointmentDraft;
  box.innerHTML=`<div class="smart-customer-card"><small>ERKANNT</small><strong>${esc(draft.person.name||"Kunde")}</strong><span>${esc(draft.kind.label)} · ${esc(smartCity(draft.person)||"Adresse in Pipedrive")}</span></div>
    <h3>Beste Terminvorschläge</h3>
    ${draft.suggestions.length?draft.suggestions.map((item,index)=>`<button type="button" class="smart-suggestion ${index===0?"recommended":""}" data-smart-suggestion="${index}">
      <span><small>${index===0?"BESTER VORSCHLAG":"ALTERNATIVE"}</small><strong>${esc(formatPipedriveAppointmentDate(item.date))}, ${esc(item.time)} Uhr</strong><em>${esc(item.reason)}</em></span><b>Auswählen</b>
    </button>`).join(""):`<div class="empty-mini">Kein freies Zeitfenster gefunden.</div>`}`;
  box.querySelectorAll("[data-smart-suggestion]").forEach(button=>button.onclick=()=>confirmSmartAppointment(Number(button.dataset.smartSuggestion)));
}

async function analyzeSmartAppointment() {
  const text=$("smartAppointmentText")?.value.trim();
  const selectedReason=$("smartAppointmentReason")?.value;
  if(!text&&!smartAppointmentPerson) return showStatus("smartAppointmentStatus","Wähle einen Kunden aus oder sag beziehungsweise schreibe kurz, um wen es geht.",false);
  if(!text&&!selectedReason) return showStatus("smartAppointmentStatus","Bitte wähle zusätzlich den Termingrund aus.",false);
  showStatus("smartAppointmentStatus","Kunde und passende Termine werden gesucht …",true);
  try{
    let fullPerson=smartAppointmentPerson;
    if(!fullPerson){
    const ignored=new Set(["kunde","kundin","herr","frau","hat","eine","einen","möchte","wünscht","termin","reklamation","nachkontrolle","besichtigung","anfrage","neu","neukunde"]);
    const words=text.replace(/[.,!?]/g," ").split(/\s+/).filter(word=>word.length>2&&!ignored.has(word.toLowerCase()));
    let result=null,term="";
    for(const candidate of words){
      const found=await searchPipedrive(candidate);
      if(found.people?.length){result=found;term=candidate;break;}
    }
    if(!result?.people?.length){
      smartAppointmentDraft=null;
      $("smartAppointmentResults").innerHTML=`<div class="smart-new-customer"><strong>Kein Bestandskunde gefunden</strong><span>Die Anfrage wird als Neukunde übernommen. Ergänze dort nur noch Name, Telefonnummer und Objektadresse.</span><button type="button" id="smartStartNewCustomer" class="primary">Neukunden-Anfrage öffnen</button></div>`;
      $("smartStartNewCustomer").onclick=()=>{v287SetModal("smartAppointmentModal",false);startNewVisit();state.visit.inquiry.message=text;saveState();renderVisit();};
      return showStatus("smartAppointmentStatus",`„${term||words[0]||text}“ wurde nicht eindeutig in Pipedrive gefunden.`,false);
    }
    const person=result.people[0];
    const detail=await loadPipedrivePerson(person.id);
    fullPerson={...person,...(detail.person||{})};
    }
    const kind=smartCaseType(text);
    smartAppointmentDraft={text:text||`${kind.label} für ${fullPerson.name||"Kunde"}`,person:fullPerson,kind,suggestions:buildSmartSuggestions(text,fullPerson)};
    renderSmartAppointmentResults();
    showStatus("smartAppointmentStatus","Vorgang erkannt. Wähle nur noch einen Termin aus.",true);
  }catch(error){showStatus("smartAppointmentStatus",error.message,false);}
}

async function confirmSmartAppointment(index) {
  const draft=smartAppointmentDraft,item=draft?.suggestions?.[index];
  if(!draft||!item) return;
  if(!confirm(`${draft.person.name}: ${item.kind} am ${formatPipedriveAppointmentDate(item.date)} um ${item.time} Uhr in Pipedrive anlegen?`)) return;
  showStatus("smartAppointmentStatus","Termin wird in Pipedrive angelegt …",true);
  try{
    await createPipedriveActivity({
      subject:`${item.kind} – ${draft.person.name}`,
      type:item.kind==="Rückruf"?"call":"meeting",
      dueDate:item.date,dueTime:item.time,duration:item.duration,
      personId:draft.person.id,dealId:draft.person.dealId||"",
      location:draft.person.objectAddress||draft.person.postalAddress||draft.person.address||"",
      note:`Über mainabdichter PRO geplant. Eingabe: ${draft.text}`
    });
    await syncPipedriveDashboard();
    showStatus("smartAppointmentStatus","Termin wurde angelegt und mit Pipedrive synchronisiert.",true);
    window.setTimeout(()=>v287SetModal("smartAppointmentModal",false),900);
  }catch(error){showStatus("smartAppointmentStatus",error.message,false);}
}

function todayIso() { return new Date().toISOString().slice(0,10); }
function contextEmpty(t="Keine Informationen vorhanden."){return `<div class="empty-mini">${esc(t)}</div>`;}function contextDate(v){if(!v)return"–";const d=new Date(v);return Number.isNaN(d.getTime())?String(v):d.toLocaleString("de-DE");}function localRecordContext(c,address){const e=String(c?.email||"").toLowerCase(),p=String(c?.phone||"").replace(/\D/g,""),ad=String(address||c?.objectAddress||"").toLowerCase();const m=i=>{const x=i?.visit?.customer||i?.customer||{};return Boolean((e&&String(x.email||"").toLowerCase()===e)||(p&&String(x.phone||"").replace(/\D/g,"").endsWith(p.slice(-8)))||(ad&&String(i.objectAddress||x.objectAddress||[x.street,x.zip,x.city].filter(Boolean).join(" ")).toLowerCase()===ad));};return{localVisits:loadArchive().filter(m),localWorksites:loadWorksites().filter(m)};}function renderRecordContext(){const c=state.visit.recordContext||{},card=$("recordContextCard");if(!card)return;if(!c.loaded&&!c.error){card.classList.add("hidden");return;}card.classList.remove("hidden");showStatus("recordContextStatus",c.error?`Bauakte nur teilweise geladen: ${c.error}`:`Bauakte geladen: ${contextDate(c.loadedAt)}`,!c.error);const d=c.deal||{},p=c.person||{};$("recordContextSummary").innerHTML=`<div class="record-alert"><strong>${(c.relatedDeals?.length||c.localWorksites?.length)?"Es bestehen bereits Vorgänge zu diesem Kunden/Objekt.":"Keine frühere Ausführung gefunden."}</strong><span>${esc(d.title||"Aktueller Vorgang")}</span>${c.caseType?`<span class="case-type-badge">Vorgangsart: ${esc(c.caseType)}</span>`:""}</div>`;const caseButtons={Reklamation:$("contextTypeComplaint"),Nachkontrolle:$("contextTypeFollowup"),Folgeauftrag:$("contextTypeFollowOn")};Object.entries(caseButtons).forEach(([type,button])=>{if(!button)return;button.classList.toggle("selected-case-type",c.caseType===type);button.setAttribute("aria-pressed",c.caseType===type?"true":"false");});$("contextDeal").innerHTML=d.id?`<div class="context-list"><div><span>Deal</span><strong>${esc(d.title||"–")}</strong></div><div><span>Phase</span><strong>${esc(d.stage_name||d.stage?.name||"–")}</strong></div><div><span>Status</span><strong>${esc(d.status||"–")}</strong></div><div><span>Wert</span><strong>${d.value?eur(d.value):"–"}</strong></div><div><span>Kontakt</span><strong>${esc(p.name||[p.firstName,p.lastName].filter(Boolean).join(" ")||"–")}</strong></div></div>`:contextEmpty();$("contextNotes").innerHTML=(c.notes||[]).length?c.notes.map(n=>`<article class="context-entry"><small>${esc(contextDate(n.add_time||n.update_time))}</small><div>${n.content||esc(n.note||"")}</div></article>`).join(""):contextEmpty();$("contextActivities").innerHTML=(c.activities||[]).length?c.activities.map(i=>`<article class="context-entry"><strong>${esc(i.subject||i.type||"Aktivität")}</strong><small>${esc([i.due_date,i.due_time].filter(Boolean).join(" "))}</small><p>${esc(i.note||"")}</p></article>`).join(""):contextEmpty();$("contextFiles").innerHTML=(c.files||[]).length?c.files.map(f=>`<article class="context-entry"><strong>${esc(f.name||"Dokument")}</strong><small>${esc(contextDate(f.add_time))}</small>${f.url?`<a href="${esc(f.url)}" target="_blank">In Pipedrive öffnen</a>`:""}</article>`).join(""):contextEmpty();$("contextRelatedDeals").innerHTML=(c.relatedDeals||[]).length?c.relatedDeals.map(i=>`<article class="context-entry"><strong>${esc(i.title||"Deal")}</strong><small>${esc(i.status||"")}</small><p>${i.value?eur(i.value):""}</p></article>`).join(""):contextEmpty();$("contextLexware").innerHTML=(c.lexwareDocuments||[]).length?c.lexwareDocuments.map(i=>`<article class="context-entry"><strong>${esc(i.voucherNumber||i.voucherType||"Dokument")}</strong><small>${esc(i.voucherDate||"")} · ${esc(i.voucherStatus||"")}</small><p>${i.totalAmount?eur(i.totalAmount):""}</p></article>`).join(""):contextEmpty("Keine Lexware-Dokumente gefunden.");const l=[...(c.localVisits||[]).map(i=>({t:"Besichtigung/Angebot",d:i.visitDate||i.createdAt,x:i.objectAddress})),...(c.localWorksites||[]).map(i=>({t:"Baustelle/Arbeitsnachweis",d:i.date||i.createdAt,x:i.objectAddress}))];$("contextLocal").innerHTML=l.length?l.map(i=>`<article class="context-entry"><strong>${esc(i.t)}</strong><small>${esc(i.d||"")}</small><p>${esc(i.x||"")}</p></article>`).join(""):contextEmpty();}async function loadCompleteRecordContext(personId,dealId){const c={loaded:false,loadedAt:new Date().toISOString(),deal:null,person:null,notes:[],activities:[],files:[],relatedDeals:[],lexwareContact:null,lexwareDocuments:[],localVisits:[],localWorksites:[],caseType:state.visit.recordContext?.caseType||"",error:""};try{if(dealId){const d=await loadPipedriveDealContext(dealId);Object.assign(c,d.context||{});}else if(personId){c.person=(await loadPipedrivePerson(personId)).person;}const cu=state.visit.customer,n=[cu.firstName,cu.lastName].filter(Boolean).join(" ")||cu.company;try{const l=await loadLexwareCustomerHistory({contactId:cu.lexwareContactId,email:cu.email,name:n});c.lexwareContact=l.contact||null;c.lexwareDocuments=l.documents||[];if(l.contact?.id)cu.lexwareContactId=l.contact.id;}catch(e){c.error=`Lexware: ${e.message}`;}Object.assign(c,localRecordContext(cu,cu.objectAddress));c.loaded=true;}catch(e){c.error=e.message;}state.visit.recordContext=c;saveState();renderRecordContext();}
async function syncPipedriveDashboard() {
  const box=$("pipedriveTodayList");
  box.innerHTML='<div class="empty-mini">Termine werden geladen …</div>';
  try {
    const data=await loadPipedriveActivities(todayIso(), true);
    cachedUpcomingPipedriveActivities=data.activities||[];
    const todayItems=cachedUpcomingPipedriveActivities.filter(item=>item.dueDate===todayIso());
    if ($("dashboardAppointmentCount")) $("dashboardAppointmentCount").textContent = todayItems.length;
    box.innerHTML=todayItems.length?todayItems.map(item=>`<button class="compact-row activity-row" data-activity-id="${item.id||""}"><span><strong>${esc(item.dueTime||"ganztägig")}</strong><small>${esc(item.type||"Termin")}</small></span><span><strong>${esc(item.subject||"Termin")}</strong><small>${esc(item.personName||item.location||"")}</small></span></button>`).join(''):'<div class="empty-mini">Heute sind keine offenen Pipedrive-Termine vorhanden.</div>';
    renderUpcomingAppointments();
  } catch(error) { if ($("dashboardAppointmentCount")) $("dashboardAppointmentCount").textContent = "!"; box.innerHTML=`<div class="empty-mini error-text">${esc(error.message)}</div>`; }
}

function formatPipedriveAppointmentDate(value) {
  if (!value) return "Ohne Datum";
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("de-DE",{weekday:"short",day:"2-digit",month:"2-digit",year:"numeric"}).format(date);
}

async function openPipedriveAppointment(item) {
  if (!item) return;
  const personId=String(item.personId||""),dealId=String(item.dealId||"");
  try {
    resetVisit();
    state.visit.visitDate=item.dueDate||todayLocal();
    state.visit.visitStartTime=item.dueTime||"";
    state.visit.visitNumber=createVisitNumber();
    if(personId){const data=await loadPipedrivePerson(personId);Object.assign(state.visit.customer,data.person);state.visit.customer.pipedriveId=personId;}
    state.visit.customer.pipedriveDealId=dealId;
    state.visit.inquiry.appointment=[item.dueDate,item.dueTime].filter(Boolean).join(" ");
    saveState();
    v287SetModal("v287AppointmentsModal",false);
    renderVisit();show("visit");
    showStatus("visitStatus","Kundendaten geladen. Vorgeschichte wird abgerufen …",true);
    await loadCompleteRecordContext(personId,dealId);
    renderVisit();
    showStatus("visitStatus","Termin und vollständige Bauakte wurden geladen.",true);
  } catch(error) { alert(error.message); }
}

function renderUpcomingAppointments() {
  const items=cachedUpcomingPipedriveActivities;
  const next=items[0];
  if ($("v28TodayTime")) $("v28TodayTime").textContent=next?.dueTime||"–";
  if ($("v28TodayType")) $("v28TodayType").textContent=next ? (next.dueDate===todayIso()?"Nächster Termin heute":formatPipedriveAppointmentDate(next.dueDate)) : "Nächster Termin";
  if ($("v28TodayCustomer")) $("v28TodayCustomer").textContent=next?.personName||next?.subject||"Keine Termine geplant";
  if ($("v28TodayAddress")) $("v28TodayAddress").textContent=next?.location||next?.subject||"Keine kommenden Pipedrive-Termine vorhanden.";
  if ($("v28MoreAppointments")) $("v28MoreAppointments").textContent=Math.max(0,items.length-1);
  if ($("v28AppointmentHint")) $("v28AppointmentHint").textContent=items.length>1?`${items.length-1} weitere geplant`:"Keine weiteren Termine";
  if ($("v28Navigate")) {
    $("v28Navigate").disabled=!next?.location;
    $("v28Navigate").onclick=event=>{event.stopPropagation();if(next?.location)window.open(`https://maps.apple.com/?daddr=${encodeURIComponent(next.location)}`,"_blank");};
  }
  const list=$("v287AppointmentsList");
  if (!list) return;
  list.innerHTML=items.length?items.map(item=>`<button type="button" class="v287-appointment-row" data-v287-appointment="${esc(String(item.id||""))}">
    <span class="v287-appointment-date"><strong>${esc(item.dueTime||"ganztägig")}</strong><small>${esc(formatPipedriveAppointmentDate(item.dueDate))}</small></span>
    <span><strong>${esc(item.personName||item.subject||"Termin")}</strong><small>${esc(item.subject||item.type||"Pipedrive-Termin")}${item.location?` · ${esc(item.location)}`:""}</small></span><em>›</em>
  </button>`).join(""):'<div class="empty-mini">Keine kommenden offenen Pipedrive-Termine vorhanden.</div>';
  list.querySelectorAll("[data-v287-appointment]").forEach(button=>button.onclick=()=>openPipedriveAppointment(items.find(item=>String(item.id||"")===button.dataset.v287Appointment)));
  const todayBox=$("pipedriveTodayList");
  if (todayBox) todayBox.querySelectorAll("[data-activity-id]").forEach(button=>button.onclick=()=>openPipedriveAppointment(items.find(item=>String(item.id||"")===button.dataset.activityId)));
}

async function syncAcceptedQuotationDashboard() {
  const box=$("acceptedQuotationList");
  box.innerHTML='<div class="empty-mini">Angebote werden geladen …</div>';
  try {
    // Der Zeitraum wird im Admin-Menü festgelegt. Angenommene Angebote
    // bleiben sichtbar, bis daraus lokal eine Baustelle erstellt wurde.
    const configuredDate = String(state.settings.lexofficeOfferImportFrom || "").trim();
    const dateFrom = /^\d{4}-\d{2}-\d{2}$/.test(configuredDate)
      ? configuredDate
      : todayIso();
    const data = await loadLexwareQuotations(dateFrom);
    cachedOpenLexofficeQuotations = data.open || [];
    cachedAcceptedQuotations = data.accepted || [];
    if ($("lexofficeQuotationPeriodHint")) {
      $("lexofficeQuotationPeriodHint").textContent =
        `Offene und angenommene Angebote ab ${dateFrom.split("-").reverse().join(".")}.`;
    }
    if ($("openQuotationList")) {
      $("openQuotationList").innerHTML = cachedOpenLexofficeQuotations.length
        ? cachedOpenLexofficeQuotations.map(item => `<div class="compact-row accepted-row"><span><strong>${esc(item.contactName||"Kunde")}</strong><small>${esc(item.voucherNumber||"")} · ${eur(item.totalAmount||0)}</small></span><span class="status-badge">Offen</span></div>`).join("")
        : `<div class="empty-mini">Keine offenen Angebote seit ${dateFrom.split("-").reverse().join(".")}.</div>`;
    }
    const existingIds=new Set(loadWorksites().map(item=>item.lexwareQuotationId).filter(Boolean));
    const items=cachedAcceptedQuotations.filter(item=>!existingIds.has(item.id));
    const localOpenOffers = (state.offers || []).filter(o=>!["accepted","completed","rejected"].includes(String(o.status||"").toLowerCase())).length;
    if ($("v28OpenOffers")) $("v28OpenOffers").textContent = Math.max(localOpenOffers, cachedOpenLexofficeQuotations.length);
    if ($("v284AcceptedOfferCount")) $("v284AcceptedOfferCount").textContent = items.length;
    const notificationDot = $("v28Notifications")?.querySelector("i");
    if (notificationDot) notificationDot.hidden = items.length === 0;
    if ($("v284AcceptedOfferHint")) {
      $("v284AcceptedOfferHint").textContent = items.length
        ? `${items.length === 1 ? "Ein Auftrag wartet" : `${items.length} Aufträge warten`} auf Baustellenerstellung`
        : `Keine angenommenen Angebote seit ${dateFrom.split("-").reverse().join(".")}`;
    }
    const card = $("v284AcceptedOffersCard");
    if (card) card.classList.toggle("has-orders", items.length > 0);
    box.innerHTML=items.length?items.map(item=>`<div class="compact-row accepted-row"><span><strong>${esc(item.contactName||"Kunde")}</strong><small>${esc(item.voucherNumber||"")} · ${eur(item.totalAmount||0)}</small></span><button class="primary small-button" data-create-lexware-worksite="${item.id}">Baustelle erstellen</button></div>`).join(''):`<div class="empty-mini">Keine seit ${dateFrom.split('-').reverse().join('.')} angenommenen Angebote ohne Baustelle.</div>`;
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
          stageId:requiredPipedriveStageId("executionPlanning"),
          value:Number(data.quotation.totalGrossAmount || data.quotation.totalAmount || 0),
          currency:data.quotation.currency || "EUR",
          customFields:visitSyncValues({customer:ws.customer,visitNumber:ws.visitNumber,visitDate:ws.date,building:{},areas:[],damageDescription:""},{offerNumber:ws.lexwareVoucherNumber,offerDate:data.quotation.voucherDate,offerValue:Number(data.quotation.totalGrossAmount || data.quotation.totalAmount || 0)}),
          note:`Angenommenes Lexoffice-Angebot ${esc(ws.lexwareVoucherNumber || "")} wurde als Baustelle übernommen.`
        });
        ws.pipedriveDealId=String(deal.deal?.id || "");
        ws.customer.pipedriveDealId=ws.pipedriveDealId;
        ws.syncStatus = {
          lexware: "success",
          pipedrivePerson: "success",
          pipedriveDeal: "success",
          warnings: deal.syncStatus?.warnings || [],
          at: new Date().toISOString()
        };
        persistWorksite(ws);
        const warningText = ws.syncStatus.warnings.length
          ? ` Hinweise: ${ws.syncStatus.warnings.join(" ")}`
          : "";
        addSyncLog(
          "Lexoffice → Baustelle",
          true,
          `${ws.lexwareVoucherNumber || "Angebot"} übernommen.${warningText}`,
          {dealId:ws.pipedriveDealId}
        );
        activeWorksiteId=ws.id;renderWorksites();show('worksites');
        showStatus(
          "worksiteStatus",
          `Baustelle erstellt. Lexoffice ✓ Pipedrive-Kunde ✓ Pipedrive-Deal ✓${warningText}`,
          true
        );
      } catch(error){addSyncLog("Lexoffice → Baustelle",false,error.message);alert(error.message);} finally{button.disabled=false;}
    });
  } catch(error) {
    if ($("v284AcceptedOfferCount")) $("v284AcceptedOfferCount").textContent = "!";
    if ($("v284AcceptedOfferHint")) $("v284AcceptedOfferHint").textContent = "Lexoffice-Angebote konnten nicht geladen werden";
    box.innerHTML=`<div class="empty-mini error-text">${esc(error.message)}</div>`;
  }
}


function openBottleCount(task) {
  return Math.max(0, Number(task?.bottlesHanging || 0) - Number(task?.bottlesRetrieved || 0));
}

function bottleWorksites() {
  return loadWorksites().map(worksite => {
    const tasks = (worksite.tasks || []).filter(task => openBottleCount(task) > 0);
    const count = tasks.reduce((sum, task) => sum + openBottleCount(task), 0);
    const dueDates = tasks.map(task => task.bottlesPickupDue).filter(Boolean).sort();
    return { worksite, tasks, count, dueDate: dueDates[0] || "" };
  }).filter(item => item.count > 0);
}


let v28SelectedInventoryId = "";
let v28StockAction = "increase";

function v28InventoryProducts() {
  return (state.settings?.inventory?.products || []).filter(product => product.active !== false);
}
function v28InventoryMovements() {
  if (!state.settings.inventory) state.settings.inventory = {};
  if (!Array.isArray(state.settings.inventory.movements)) state.settings.inventory.movements = [];
  return state.settings.inventory.movements;
}
function v28OpenInventoryArticle(productId) {
  const product = v28InventoryProducts().find(item => item.id === productId);
  if (!product) return;
  v28SelectedInventoryId = productId;
  v28StockAction = "increase";
  $("v28InventoryModalTitle").textContent = product.name;
  $("v28StockAmount").value = "";
  $("v28StockCharge").value = "";
  $("v28StockNote").value = "";
  $("v28StockDate").value = todayLocal();
  $("v28ChargeField").hidden = !product.chargeTracking;
  document.querySelectorAll("[data-stock-action]").forEach(button => button.classList.toggle("active", button.dataset.stockAction === "increase"));
  $("v28InventoryArticleSummary").innerHTML = `
    <div><span>Aktueller Bestand</span><strong>${num(product.stock || 0)} ${esc(product.unit || "")}</strong></div>
    <div><span>Mindestbestand</span><strong>${num(product.minimumStock || 0)} ${esc(product.unit || "")}</strong></div>
    <div><span>Gebindegröße</span><strong>${num(product.packageSize || 0)} ${esc(product.unit || "")}</strong></div>`;
  v28RenderStockHistory(productId);
  $("v28InventoryModal").classList.remove("hidden");
  $("v28InventoryModal").setAttribute("aria-hidden", "false");
  document.body.classList.add("resource-modal-open");
}
function v28CloseInventoryArticle() {
  $("v28InventoryModal")?.classList.add("hidden");
  $("v28InventoryModal")?.setAttribute("aria-hidden", "true");
  document.body.classList.remove("resource-modal-open");
}
function v28RenderStockHistory(productId) {
  const entries = v28InventoryMovements().filter(entry => entry.productId === productId).sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt))).slice(0,12);
  $("v28StockHistory").innerHTML = entries.length ? entries.map(entry => `
    <article class="v28-history-row"><span class="v28-history-sign ${entry.delta >= 0 ? "positive" : "negative"}">${entry.delta >= 0 ? "+" : "−"}</span>
    <span><strong>${num(Math.abs(entry.delta))} ${esc(entry.unit || "")}</strong><small>${esc(entry.note || entry.actionLabel || "Lagerbewegung")}${entry.charge ? ` · Charge ${esc(entry.charge)}` : ""}</small></span><time>${esc(entry.date || "")}</time></article>`).join("") : `<p class="hint">Noch keine Lagerbewegungen vorhanden.</p>`;
}
function v28SaveStockMovement() {
  const product = v28InventoryProducts().find(item => item.id === v28SelectedInventoryId);
  if (!product) return;
  const amount = parseDecimal($("v28StockAmount").value);
  if (!(amount > 0)) { alert("Bitte eine Menge größer als 0 eingeben."); return; }
  const previous = Number(product.stock || 0);
  let next = previous, delta = 0, actionLabel = "";
  if (v28StockAction === "increase") { delta = amount; next = previous + amount; actionLabel = "Wareneingang"; }
  else if (v28StockAction === "decrease") { next = Math.max(0, previous - amount); delta = next - previous; actionLabel = "Materialentnahme"; }
  else { next = Math.max(0, amount); delta = next - previous; actionLabel = "Bestandskorrektur"; }
  product.stock = next;
  v28InventoryMovements().push({
    id: crypto.randomUUID(), productId: product.id, productName: product.name, action: v28StockAction, actionLabel,
    previousStock: previous, newStock: next, delta, unit: product.unit || "", charge: $("v28StockCharge").value.trim(),
    date: $("v28StockDate").value || todayLocal(), note: $("v28StockNote").value.trim(), createdAt: new Date().toISOString()
  });
  saveState();
  renderV28Dashboard();
  v28OpenInventoryArticle(product.id);
}
function renderV28Dashboard() {
  if (!$("v28ActiveWorksiteCount")) return;
  const worksites = typeof loadWorksites === "function" ? loadWorksites() : [];
  const active = worksites.filter(worksite => worksite.status !== "completed");
  const openExecutions = worksites.filter(worksite => !worksite.status || worksite.status === "planning");
  const plannedExecutions = worksites.filter(worksite => worksite.status === "planned");
  if ($("v28OpenExecutions")) $("v28OpenExecutions").textContent = openExecutions.length;
  if ($("v28PlannedExecutions")) $("v28PlannedExecutions").textContent = plannedExecutions.length;
  $("v28ActiveWorksiteCount").textContent = active.length;
  $("v28ActiveWorksiteStatus").textContent = active.length ? "In Arbeit" : "Keine aktive Baustelle";
  const first = active[0];
  const photo = first?.tasks?.flatMap(task => task.photos || [])[0]?.src;
  $("v28WorksitePreview").innerHTML = photo ? `<img src="${photo}" alt="Baustelle">` : "";
  const bottles = worksites.reduce((r,w)=>{const c=(w.tasks||[]).reduce((s,t)=>s+Math.max(0,Number(t.bottlesHanging||0)-Number(t.bottlesRetrieved||0)),0);if(c){r.count+=c;r.sites++}return r},{count:0,sites:0});
  $("v28BottleCount").textContent = bottles.count;
  $("v28BottleSites").textContent = `Auf ${bottles.sites} Baustellen`;
  const products = v28InventoryProducts().slice(0, 3);
  if ($("v28InventoryStrip")) {
    $("v28InventoryStrip").innerHTML = products.length
      ? products.map((product, index) => {
          const stock = Number(product.stock || 0);
          const minimum = Number(product.minimumStock || 0);
          const ratio = minimum > 0
            ? Math.min(100, Math.max(8, (stock / Math.max(minimum * 2, 1)) * 100))
            : 66;
          const visualClass = /hz/i.test(product.name || "")
            ? "hz"
            : /hs|sperrmörtel/i.test(product.name || "")
              ? "hs"
              : "sef";
          return `<button type="button" class="v28-inventory-item" data-v28-inventory-id="${product.id}">
            <span class="v288-product-pack ${visualClass}" aria-hidden="true"><i></i></span>
            <span class="v288-product-data">
              <small>${esc(product.name)}</small>
              <strong>${num(stock)} ${esc(product.unit || "")}</strong>
              <em>${stock <= minimum ? "Nachbestellen" : (product.unit || "Verfügbar")}</em>
              <span class="v288-stock-bar"><b style="width:${ratio}%"></b></span>
            </span>
          </button>`;
        }).join("")
      : `<div class="empty-mini">Noch keine Lagerartikel angelegt.</div>`;

    document.querySelectorAll("[data-v28-inventory-id]").forEach(button => {
      button.onclick = () => v28OpenInventoryArticle(button.dataset.v28InventoryId);
    });
  }
  $("v28OpenOffers").textContent = (state.offers || []).filter(o=>!["accepted","completed","rejected"].includes(String(o.status||"").toLowerCase())).length;

  const status = typeof v28SystemStatusFromDom === "function" ? v28SystemStatusFromDom() : "yellow";
  const statusDot = $("v28SystemDot");
  if (statusDot) statusDot.className = `v28-status-dot v28-status-${status}`;
  if ($("v287SyncTitle")) $("v287SyncTitle").textContent =
    status === "green" ? "Alles in Ordnung" : status === "red" ? "Verbindung prüfen" : "Wird geprüft";
  if ($("v287SyncTime")) $("v287SyncTime").textContent =
    status === "green"
      ? `Letzte Synchronisation heute, ${new Date().toLocaleTimeString("de-DE",{hour:"2-digit",minute:"2-digit"})} Uhr`
      : "Letzte Synchronisation noch offen";
}

function v287SetModal(id, open) {
  const modal = $(id);
  if (!modal) return;
  modal.classList.toggle("hidden", !open);
  modal.setAttribute("aria-hidden", open ? "false" : "true");
  document.body.classList.toggle("resource-modal-open", open);
}

function v287RenderBottleList() {
  const box = $("v287BottleList");
  if (!box) return;
  const items = bottleWorksites();
  const today = todayLocal();

  box.innerHTML = items.length ? items.map(item => {
    const ws = item.worksite;
    const customer = ws.customer || {};
    const phone = customer.phone || customer.mobile || ws.phone || "";
    const dueText = item.dueDate
      ? (item.dueDate < today ? `Überfällig seit ${esc(item.dueDate)}` : `Abholung: ${esc(item.dueDate)}`)
      : "Kein Abholdatum eingetragen";
    return `<article class="v287-bottle-row">
      <div class="v287-row-main">
        <strong>${esc(worksiteCustomerName(ws))}</strong>
        <span>${esc(ws.objectAddress || "Keine Baustellenadresse hinterlegt")}</span>
        <small>${item.count} Flaschen · ${dueText}</small>
      </div>
      <div class="v287-row-actions">
        ${phone ? `<a class="secondary" href="tel:${esc(phone)}">Anrufen</a>` : ""}
        <button type="button" class="secondary" data-v287-navigate="${esc(ws.objectAddress || "")}">Navigation</button>
        <button type="button" class="primary" data-v287-collected="${ws.id}">Flaschen abgeholt</button>
      </div>
    </article>`;
  }).join("") : `<div class="empty-mini">Aktuell sind keine Flaschen auf Baustellen.</div>`;

  box.querySelectorAll("[data-v287-navigate]").forEach(button => {
    button.onclick = () => {
      const address = button.dataset.v287Navigate;
      if (address) window.open(`https://maps.apple.com/?daddr=${encodeURIComponent(address)}`, "_blank");
    };
  });

  box.querySelectorAll("[data-v287-collected]").forEach(button => {
    button.onclick = () => {
      const ws = getWorksite(button.dataset.v287Collected);
      if (!ws) return;
      const total = (ws.tasks || []).reduce((sum, task) => sum + openBottleCount(task), 0);
      if (!total) return;
      if (!confirm(`${total} Flaschen bei ${worksiteCustomerName(ws)} als abgeholt bestätigen?`)) return;

      (ws.tasks || []).forEach(task => {
        const open = openBottleCount(task);
        if (open > 0) {
          task.bottlesRetrieved = Number(task.bottlesHanging || 0);
          task.bottlesRetrievedAt = new Date().toISOString();
        }
      });
      persistWorksite(ws);
      renderV28Dashboard();
      v287RenderBottleList();
    };
  });
}

function v287RenderInventoryList() {
  const box = $("v287InventoryList");
  if (!box) return;
  const products = v28InventoryProducts();
  box.innerHTML = products.length ? products.map(product => {
    const stock = Number(product.stock || 0);
    const minimum = Number(product.minimumStock || 0);
    return `<button type="button" class="v287-inventory-row ${stock <= minimum ? "low" : ""}" data-v287-product="${product.id}">
      <span><strong>${esc(product.name)}</strong><small>${stock <= minimum ? "Mindestbestand erreicht" : "Bestand ausreichend"}</small></span>
      <b>${num(stock)} ${esc(product.unit || "")}</b><em>›</em>
    </button>`;
  }).join("") : `<div class="empty-mini">Noch keine Lagerartikel vorhanden.</div>`;

  box.querySelectorAll("[data-v287-product]").forEach(button => {
    button.onclick = () => {
      v287SetModal("v287InventoryListModal", false);
      v28OpenInventoryArticle(button.dataset.v287Product);
    };
  });
}

function initializeV28Dashboard() {
  const openAppointments=()=>{renderUpcomingAppointments();v287SetModal("v287AppointmentsModal",true);};
  if ($("v28NextAppointment")) {
    $("v28NextAppointment").onclick=openAppointments;
    $("v28NextAppointment").onkeydown=event=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();openAppointments();}};
  }
  if ($("v287CloseAppointments")) $("v287CloseAppointments").onclick=()=>v287SetModal("v287AppointmentsModal",false);
  if ($("v287AppointmentsModal")) $("v287AppointmentsModal").onclick=event=>{if(event.target===$("v287AppointmentsModal"))v287SetModal("v287AppointmentsModal",false);};
  if ($("v287RefreshAppointments")) $("v287RefreshAppointments").onclick=syncPipedriveDashboard;
  if ($("v28BottleCard")) $("v28BottleCard").onclick = () => {
    v287RenderBottleList();
    v287SetModal("v287BottleModal", true);
  };
  if ($("v287CloseBottleModal")) $("v287CloseBottleModal").onclick = () => v287SetModal("v287BottleModal", false);
  if ($("v287BottleModal")) $("v287BottleModal").onclick = event => {
    if (event.target === $("v287BottleModal")) v287SetModal("v287BottleModal", false);
  };

  if ($("v287OpenInventory")) $("v287OpenInventory").onclick = () => {
    v287RenderInventoryList();
    v287SetModal("v287InventoryListModal", true);
  };
  if ($("v287CloseInventoryList")) $("v287CloseInventoryList").onclick = () => v287SetModal("v287InventoryListModal", false);
  if ($("v287InventoryListModal")) $("v287InventoryListModal").onclick = event => {
    if (event.target === $("v287InventoryListModal")) v287SetModal("v287InventoryListModal", false);
  };
  if ($("v28SystemStatus")) $("v28SystemStatus").onclick = () => $("testConnections")?.click();
  const openAcceptedOffers = async () => {
    const modal = $("v284AcceptedOffersModal");
    if (!modal) return;
    modal.classList.remove("hidden");
    modal.setAttribute("aria-hidden", "false");
    document.body.classList.add("resource-modal-open");
    await syncAcceptedQuotationDashboard();
  };
  const closeAcceptedOffers = () => {
    const modal = $("v284AcceptedOffersModal");
    if (!modal) return;
    modal.classList.add("hidden");
    modal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("resource-modal-open");
  };

  if ($("v284AcceptedOffersCard")) $("v284AcceptedOffersCard").onclick = openAcceptedOffers;
  if ($("v28OpenOffersCard")) $("v28OpenOffersCard").onclick = openAcceptedOffers;
  if ($("v28Notifications")) $("v28Notifications").onclick = openAcceptedOffers;
  if ($("v284CloseAcceptedOffers")) $("v284CloseAcceptedOffers").onclick = closeAcceptedOffers;
  if ($("v284AcceptedOffersModal")) {
    $("v284AcceptedOffersModal").onclick = event => {
      if (event.target === $("v284AcceptedOffersModal")) closeAcceptedOffers();
    };
  }

  document.querySelectorAll("[data-stock-action]").forEach(button => button.onclick=()=>{v28StockAction=button.dataset.stockAction;document.querySelectorAll("[data-stock-action]").forEach(item=>item.classList.toggle("active",item===button));$("v28StockAmount").placeholder=v28StockAction==="correct"?"Neuer Gesamtbestand":"Menge";});
  if ($("v28SaveStockMovement")) $("v28SaveStockMovement").onclick=v28SaveStockMovement;
  if ($("v28CloseInventoryModal")) $("v28CloseInventoryModal").onclick=v28CloseInventoryArticle;
  if ($("v28InventoryModal")) $("v28InventoryModal").onclick=e=>{if(e.target===$("v28InventoryModal"))v28CloseInventoryArticle();};
  const setNewInquiryModal = open => {
    const modal = $("newInquiryModal");
    if (!modal) return;
    modal.classList.toggle("hidden", !open);
    modal.setAttribute("aria-hidden", String(!open));
    document.body.classList.toggle("resource-modal-open", open);
  };
  if ($("v28FloatingAdd")) $("v28FloatingAdd").onclick=()=>setNewInquiryModal(true);
  if ($("v28SmartAppointment")) $("v28SmartAppointment").onclick=()=>{
    smartAppointmentDraft=null;
    smartAppointmentPerson=null;
    $("smartAppointmentText").value="";
    $("smartCustomerSearch").value="";
    $("smartAppointmentReason").value="";
    $("smartCustomerSearchResults").innerHTML="";
    $("smartAppointmentResults").innerHTML="";
    showStatus("smartAppointmentStatus","Zum Beispiel: „Kunde Höffner hat eine Reklamation und möchte nächste Woche einen Termin.“",true);
    v287SetModal("smartAppointmentModal",true);
    window.setTimeout(()=>$("smartAppointmentText")?.focus(),50);
  };
  if ($("closeSmartAppointment")) $("closeSmartAppointment").onclick=()=>v287SetModal("smartAppointmentModal",false);
  if ($("analyzeSmartAppointment")) $("analyzeSmartAppointment").onclick=analyzeSmartAppointment;
  if ($("smartSearchCustomer")) $("smartSearchCustomer").onclick=searchSmartAppointmentCustomer;
  if ($("smartCustomerSearch")) $("smartCustomerSearch").onkeydown=event=>{if(event.key==="Enter"){event.preventDefault();searchSmartAppointmentCustomer();}};
  if ($("smartAppointmentModal")) $("smartAppointmentModal").onclick=event=>{if(event.target===$("smartAppointmentModal"))v287SetModal("smartAppointmentModal",false);};
  if ($("closeNewInquiryModal")) $("closeNewInquiryModal").onclick=()=>setNewInquiryModal(false);
  if ($("newInquiryModal")) $("newInquiryModal").onclick=event=>{
    if(event.target===$("newInquiryModal")) setNewInquiryModal(false);
  };
  if ($("newInquiryScreenshot")) $("newInquiryScreenshot").onclick=()=>{
    setNewInquiryModal(false);
    openInquiryImport();
  };
  if ($("newInquiryExisting")) $("newInquiryExisting").onclick=()=>{
    setNewInquiryModal(false);
    show("customers");
    setTimeout(()=>{
      const search=$("customerSearch");
      if(search){ search.focus(); search.scrollIntoView({block:"center"}); }
    },50);
  };
  if ($("newInquiryManual")) $("newInquiryManual").onclick=()=>{
    setNewInquiryModal(false);
    startNewVisit();
  };
  if ($("v28CreateOffer")) $("v28CreateOffer").onclick=()=>show("offer");
  if ($("v28OpenFullInventory")) $("v28OpenFullInventory").onclick=()=>show("settings");
  if ($("v28ActiveWorksite")) $("v28ActiveWorksite").onclick=()=>show("worksites");
  if ($("v28OpenExecutionsCard")) $("v28OpenExecutionsCard").onclick=()=>{
    worksiteViewFilter="planning"; show("worksites"); renderWorksites();
  };
  if ($("v28PlannedExecutionsCard")) $("v28PlannedExecutionsCard").onclick=()=>{
    worksiteViewFilter="planned"; show("worksites"); renderWorksites();
  };
  document.querySelectorAll("[data-v28-target]").forEach(button=>button.onclick=()=>show(button.dataset.v28Target));
  renderV28Dashboard();
}
function renderDashboardBottles() {
  const list = $("dashboardBottleList");
  const stats = $("dashboardBottleStats");
  const summary = $("dashboardBottleSummary");
  if (!list) return;
  const items = bottleWorksites();
  const total = items.reduce((sum, item) => sum + item.count, 0);
  const today = todayLocal();
  const overdue = items.filter(item => item.dueDate && item.dueDate < today).length;
  if (summary) summary.textContent = `${total} unterwegs · ${items.length} Baustelle${items.length === 1 ? "" : "n"}`;
  if (stats) stats.innerHTML = `<div><span>Auf Baustellen</span><strong>${total}</strong></div><div><span>Baustellen</span><strong>${items.length}</strong></div><div><span>Überfällig</span><strong>${overdue}</strong></div>`;
  list.innerHTML = items.length ? items.map(item => {
    const ws=item.worksite;
    const days=Math.max(0,Math.floor((Date.now()-new Date(ws.date||ws.createdAt).getTime())/86400000));
    const status=item.dueDate && item.dueDate < today ? "Überfällig" : item.dueDate === today ? "Heute abholen" : "Hängen noch";
    return `<button type="button" class="compact-row bottle-worksite-row" data-open-bottle-worksite="${ws.id}"><span><strong>${esc(worksiteCustomerName(ws))}</strong><small>${esc(ws.objectAddress||"Keine Anschrift")}</small></span><span><strong>${item.count} Flaschen</strong><small>${days} Tage · ${esc(status)}${item.dueDate?` · ${esc(item.dueDate)}`:""}</small></span></button>`;
  }).join("") : '<div class="empty-mini">Keine Injektionsflaschen sind derzeit auf Baustellen.</div>';
  list.querySelectorAll('[data-open-bottle-worksite]').forEach(button => button.onclick=()=>{activeWorksiteId=button.dataset.openBottleWorksite;show('worksites');renderWorksites();});
}

function renderDashboardInventory() {
  const list = $("dashboardInventoryList");
  const alertBox = $("dashboardInventoryAlert");
  if (!list) return;

  const products = (state.settings.inventory?.products || [])
    .filter(product => product.active !== false);

  if (!products.length) {
    list.innerHTML = '<div class="empty-mini">Noch keine aktiven Lagerartikel angelegt.</div>';
    if (alertBox) alertBox.hidden = true;
    return;
  }

  const lowProducts = products.filter(product =>
    Number(product.stock || 0) <= Number(product.minimumStock || 0)
  );
  if ($("dashboardInventorySummary")) {
    $("dashboardInventorySummary").textContent = lowProducts.length
      ? `${lowProducts.length} Artikel kritisch`
      : `${products.length} Artikel · Bestand okay`;
  }

  list.innerHTML = products.map(product => {
    const stock = Number(product.stock || 0);
    const minimum = Number(product.minimumStock || 0);
    const low = stock <= minimum;
    const empty = stock <= 0;
    const statusText = empty ? "Leer" : low ? "Nachbestellen" : "Ausreichend";
    const stockText = Number.isInteger(stock)
      ? String(stock)
      : stock.toLocaleString("de-DE", { maximumFractionDigits: 2 });
    const minimumText = Number.isInteger(minimum)
      ? String(minimum)
      : minimum.toLocaleString("de-DE", { maximumFractionDigits: 2 });

    return `<button type="button" class="dashboard-inventory-card ${low ? "low-stock" : ""} ${empty ? "empty-stock" : ""}" data-page-target="settings" data-scroll-target="inventoryProducts">
      <div class="dashboard-inventory-card-head">
        <strong>${esc(product.name || "Material")}</strong>
        <span>${esc(statusText)}</span>
      </div>
      <div class="dashboard-inventory-value">${esc(stockText)} <small>${esc(product.unit || "")}</small></div>
      <div class="dashboard-inventory-minimum">Mindestbestand: ${esc(minimumText)} ${esc(product.unit || "")}</div>
    </button>`;
  }).join("");

  if ($("dashboardInventorySummary")) $("dashboardInventorySummary").textContent = `${products.length} Artikel`;

  if (alertBox) {
    alertBox.hidden = lowProducts.length === 0;
    alertBox.innerHTML = lowProducts.length
      ? `<strong>⚠ ${lowProducts.length} Lagerartikel ${lowProducts.length === 1 ? "muss" : "müssen"} geprüft werden.</strong><span>${lowProducts.map(item => esc(item.name)).join(", ")}</span>`
      : "";
  }
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
  renderDashboardInventory();
  renderDashboardBottles();
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
  state.visit.visitStartTime = "";
  state.visit.visitEndTime = "";
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
    offerGross: reviewedOffer(offer).totalGross,
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
    state.visit.visitEmployee = "";
    state.visit.visitStartTime = "";
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
    "lexoffice-draft": "Entwurf an Lexoffice übertragen",
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
  if (pageId === "dashboard") { renderArchive(); updateDashboardOverview(); syncDashboardSources(); if (typeof renderV28Dashboard === "function") renderV28Dashboard(); }
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

if ($("headerHome")) $("headerHome").onclick = () => show("dashboard");
if ($("quickMenu")) $("quickMenu").onclick = openAppMenu;
if ($("closeMenu")) $("closeMenu").onclick = closeAppMenu;
if ($("menuBackdrop")) $("menuBackdrop").onclick = closeAppMenu;

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
if ($("syncDashboardAll")) if ($("syncDashboardAll")) $("syncDashboardAll").onclick = syncDashboardSources;
document.querySelectorAll("[data-scroll-target]").forEach(button => button.onclick = () => {
  const target = $(button.dataset.scrollTarget);
  target?.scrollIntoView({behavior:"smooth", block:"center"});
});
document.querySelectorAll("[data-page-target]").forEach(button => button.onclick = () => show(button.dataset.pageTarget));
function setResourceModal(id, open) {
  const modal = $(id);
  if (!modal) return;
  modal.classList.toggle("hidden", !open);
  modal.setAttribute("aria-hidden", open ? "false" : "true");
  document.body.classList.toggle("resource-modal-open", open);
}
if ($("openInventoryDashboard")) $("openInventoryDashboard").onclick = () => setResourceModal("inventoryDashboardModal", true);
if ($("closeInventoryDashboard")) $("closeInventoryDashboard").onclick = () => setResourceModal("inventoryDashboardModal", false);
if ($("openBottleDashboard")) $("openBottleDashboard").onclick = () => setResourceModal("bottleDashboardModal", true);
if ($("closeBottleDashboard")) $("closeBottleDashboard").onclick = () => setResourceModal("bottleDashboardModal", false);
["inventoryDashboardModal","bottleDashboardModal"].forEach(id => {
  const modal = $(id);
  if (modal) modal.addEventListener("click", event => {
    if (event.target === modal) setResourceModal(id, false);
  });
});
if ($("syncPipedriveActivities")) $("syncPipedriveActivities").onclick = syncPipedriveDashboard;
if ($("syncAcceptedQuotations")) $("syncAcceptedQuotations").onclick = syncAcceptedQuotationDashboard;
if ($("dashboardNewInquiry")) $("dashboardNewInquiry").onclick = openInquiryImport;
$("cancelInquiryImport").onclick = () => show("dashboard");
$("retryInquiryImport").onclick = () => $("inquiryScreenshot").click();
$("inquiryScreenshot").onchange = event => handleInquiryScreenshot(event.target.files?.[0]);
$("inquiryCamera").onchange = event => handleInquiryScreenshot(event.target.files?.[0]);
$("reparseInquiryText").onclick = () => fillInquiryReview(parseInquiryText($("importRawText").value));
$("acceptInquiryImport").onclick = acceptInquiryImport;
["street","zip","city"].forEach(id => {
  const input = $(id);
  if (!input) return;
  input.addEventListener("input", () => {
    state.visit.customer[id] = input.value;
    syncObjectAddressFromPostal();
    saveState();
    updateRecordHeader();
  });
});
if ($("objectAddressDifferent")) $("objectAddressDifferent").addEventListener("change", () => {
  state.visit.customer.objectAddressDifferent = $("objectAddressDifferent").checked;
  syncObjectAddressFromPostal(!state.visit.customer.objectAddressDifferent);
  saveState();
});
if ($("objectAddress")) $("objectAddress").addEventListener("input", () => {
  if (!state.visit.customer.objectAddressDifferent) return;
  state.visit.customer.objectAddress = $("objectAddress").value;
  saveState();
  updateRecordHeader();
});
["Complaint","Followup","FollowOn"].forEach(k=>{const b=$(`contextType${k}`);if(!b)return;b.onclick=()=>{const x={Complaint:"Reklamation",Followup:"Nachkontrolle",FollowOn:"Folgeauftrag"}[k];state.visit.inquiry||={source:"",ownerStatus:"",appointment:"",message:"",rawText:"",screenshot:"",importedAt:""};state.visit.recordContext||={};state.visit.recordContext.caseType=x;state.visit.inquiry.source=x;saveState();renderRecordContext();showStatus("recordContextStatus",`Vorgangsart „${x}“ wurde gespeichert.`,true);showStatus("visitStatus",`Vorgangsart „${x}“ wurde gespeichert.`,true);};});

$('guidedNext').onclick=()=>{const i=currentGuideStep();const last=GUIDE_STEPS.length-1;if(i<last&&!stepComplete(i)){showStatus('visitStatus','Bitte diesen Schritt zuerst vollständig ausfüllen.',false);openGuideStep(i);return;}if(i===last){if(stepComplete(last)){renderOffer();show('offer');}else openGuideStep(firstMissingGuideStep());return;}openGuideStep(i+1);};
$('goToMissingStep').onclick=()=>{const missing=guideChecks().find(x=>!x.ok);if(missing)jumpToVisitCheck(missing);else openGuideStep(7);};
$('finishVisitGuide').onclick=()=>{const last=GUIDE_STEPS.length-1;if(!stepComplete(last))return openGuideStep(firstMissingGuideStep());renderOffer();show('offer');};
$("visitOfferBasis")?.querySelector("summary")?.addEventListener("click",event=>{
  const missing=guideChecks().find(check=>!check.ok);
  if(!missing)return;
  event.preventDefault();
  jumpToVisitCheck(missing);
});
$('changeCustomer').onclick=()=>{$('customerSourceActions').classList.remove('hidden');$('customerConfirmed').classList.add('hidden');};
$('openCustomerAdvice').onclick=()=>{adviceState.stage=1;const m=adviceMeasure();if(m.type&&ADVICE_CONTENT[m.type])adviceState.type=m.type;renderAdvice();show('customerAdvice');};
$('closeCustomerAdvice').onclick=()=>show('visit');
$('advicePrev').onclick=()=>{adviceState.stage=Math.max(1,adviceState.stage-1);renderAdvice();};
$('adviceNext').onclick=()=>{const max=(ADVICE_CONTENT[adviceState.type]?.steps||[]).length||1;adviceState.stage=Math.min(max,adviceState.stage+1);renderAdvice();};
document.querySelectorAll('[data-advice-type]').forEach(b=>b.onclick=()=>{adviceState.type=b.dataset.adviceType;adviceState.stage=1;renderAdvice();});
document.querySelectorAll('[data-open-step]').forEach((b,i)=>b.onclick=()=>openGuideStep(i===4?5:i));

if ($("dashboardNewVisit")) $("dashboardNewVisit").onclick = startNewVisit;
if ($("quickCreateOffer")) $("quickCreateOffer").onclick = () => show("offer");
if ($("quickShowOffers")) $("quickShowOffers").onclick = () => { $("archiveFilter").value = "all"; renderArchive(); $("archiveList").scrollIntoView({behavior:"smooth"}); };
if ($("quickShowFollowups")) $("quickShowFollowups").onclick = () => { $("archiveFilter").value = "followup"; renderArchive(); $("archiveList").scrollIntoView({behavior:"smooth"}); };
if ($("showAllOffers")) $("showAllOffers").onclick = () => $("archiveList").scrollIntoView({behavior:"smooth"});
if ($("showAllFollowups")) $("showAllFollowups").onclick = () => { $("archiveFilter").value = "followup"; renderArchive(); $("archiveList").scrollIntoView({behavior:"smooth"}); };
$("icloudSave").onclick = () => { exportArchiveData("mainabdichter-komplettsicherung.json"); localStorage.setItem("mainabdichter_v14_last_backup",new Date().toISOString()); updateBackupTime(); };
document.querySelectorAll("[data-bottom-page]").forEach(button => button.onclick = () => show(button.dataset.bottomPage));
if ($("bottomCustomers")) $("bottomCustomers").onclick = () => show("customers");
window.addEventListener("mainabdichter:use-customer", event => {
  const customer = event.detail?.customer;
  if (!customer) return;
  Object.assign(state.visit.customer, customer);
  saveState();
  renderVisit();
  renderCustomerSourceState();
  show("visit");
  showStatus("visitStatus", "Kunde wurde in die Besichtigung übernommen.", true);
});
function updateBackupTime(){ const raw=localStorage.getItem("mainabdichter_v14_last_backup"); if(!$("lastBackupTime")) return; $("lastBackupTime").textContent=raw?new Date(raw).toLocaleString("de-DE"):"Noch keine Sicherung"; }
if ($("archiveSearch")) $("archiveSearch").oninput = renderArchive;
if ($("archiveFilter")) $("archiveFilter").onchange = renderArchive;
$("saveToArchive").onclick = () => saveCurrentToArchive(true);
if ($("offerArchiveStatus")) $("offerArchiveStatus").onchange = () => {
  saveCurrentToArchive(false);
  renderOffer();
  showStatus(
    "offerStatus",
    $("offerArchiveStatus").value === "accepted"
      ? "Auftrag angenommen – die Baustelle kann jetzt angelegt werden."
      : "Angebotsstatus wurde gespeichert.",
    true
  );
};
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

if ($("quickSave")) $("quickSave").onclick = () => {
  collectVisit();
  saveState();
  alert("Aktueller Stand gespeichert.");
};
if ($("quickSettings")) $("quickSettings").onclick = () => show("settings");

if ($("bottomPipedrive")) {
  if ($("bottomPipedrive")) $("bottomPipedrive").onclick = () => {
    show("visit");
    choosePipedrive();
  };
}

if ($("bottomLexware")) {
  if ($("bottomLexware")) $("bottomLexware").onclick = () => {
    show("visit");
    chooseLexware();
  };
}

if ($("bottomNewVisit")) {
  if ($("bottomNewVisit")) $("bottomNewVisit").onclick = startNewVisit;
}

if ($("bottomFollowup")) {
  if ($("bottomFollowup")) $("bottomFollowup").onclick = () => {
    show("dashboard");
    $("archiveFilter").value = "followup";
    renderArchive();
    $("archiveList").scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  };
}
$("startVisitWork").onclick = () => {
  const employee = $("visitEmployee").value.trim();
  if (!employee) {
    showStatus("visitStartStatus", "Bitte zuerst den Mitarbeiter eintragen.", false);
    $("visitEmployee").focus();
    return;
  }
  state.visit.visitEmployee = employee;
  state.visit.visitDate = todayLocal();
  state.visit.visitStartTime = timeLocal();
  state.visit.visitEndTime = "";
  if (!state.visit.visitNumber) state.visit.visitNumber = createVisitNumber();
  $("visitDate").value = state.visit.visitDate;
  $("visitStartTime").value = state.visit.visitStartTime;
  $("visitEndTime").value = "";
  $("visitNumber").value = state.visit.visitNumber;
  updateVisitDuration();
  saveState();
  renderVisitTimeStatus();
  renderVisitChecklist();
};

$("endVisitWork").onclick = () => {
  if (!state.visit.visitStartTime) {
    showStatus("visitEndStatus", "Die Besichtigung wurde noch nicht begonnen.", false);
    $("visitStep1").open = true;
    $("visitStep1").scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }
  state.visit.visitEndTime = timeLocal();
  $("visitEndTime").value = state.visit.visitEndTime;
  updateVisitDuration();
  saveState();
  renderVisitTimeStatus();
  renderVisitChecklist();
};

function renderVisitTimeStatus() {
  if ($("visitStartStatus")) {
    $("visitStartStatus").textContent = state.visit.visitStartTime
      ? `Begonnen: ${state.visit.visitDate || todayLocal()} um ${state.visit.visitStartTime} Uhr`
      : "";
  }
  if ($("visitEndStatus")) {
    $("visitEndStatus").textContent = state.visit.visitEndTime
      ? `Beendet um ${state.visit.visitEndTime} Uhr · Dauer: ${$("visitDuration")?.value || "wird berechnet"}`
      : "";
  }
  if ($("startVisitWork")) $("startVisitWork").textContent = state.visit.visitStartTime ? "Beginn erfasst" : "Besichtigung beginnen";
  if ($("endVisitWork")) $("endVisitWork").textContent = state.visit.visitEndTime ? "Besichtigung beendet" : "Besichtigung beenden";
}

$("visitStartTime").oninput = () => {
  state.visit.visitStartTime = $("visitStartTime").value;
  updateVisitDuration();
  saveState();
};

$("visitEmployee").oninput = () => {
  state.visit.visitEmployee = $("visitEmployee").value.trim();
  saveState();
  renderVisitChecklist();
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
$("toOffer").onclick = () => {
  collectVisit();
  const missing=guideChecks().find(check=>!check.ok);
  if(missing){
    state.visit.offerBasis ||= {approved:false,note:"",approvedAt:""};
    Object.assign(state.visit.offerBasis,{reviewedAt:"",reviewFingerprint:"",approved:false,approvedAt:""});
    saveState();
    updateVisitGuide();
    showStatus("visitStatus",`Das Protokoll ist noch nicht vollständig: ${missing.label}.`,false);
    jumpToVisitCheck(missing);
    return;
  }
  state.visit.offerBasis ||= {approved:false,note:"",approvedAt:""};
  state.visit.offerBasis.reviewedAt=new Date().toISOString();
  state.visit.offerBasis.reviewFingerprint=visitReviewFingerprint();
  saveState();
  renderInspectionSummary();
  openGuideStep(7);
  showStatus("visitStatus","Protokoll vollständig. Bitte die Zusammenfassung prüfen und anschließend die Angebotsgrundlage bestätigen.",true);
};

const VISIT_TOOLBAR_TARGETS = {
  1: "visitStep1",
  2: "visitStep2",
  3: "visitStep3",
  4: "visitStep4",
  5: "visitStep5"
};

function openVisitSection(target, smooth = true) {
  if (!target) return;
  document.querySelectorAll("#visit details.compact-step").forEach(detail => {
    detail.open = detail === target;
  });
  target.open = true;
  requestAnimationFrame(() => {
    const top = target.getBoundingClientRect().top + window.scrollY - 12;
    window.scrollTo({ top: Math.max(0, top), behavior: smooth ? "smooth" : "auto" });
  });
}

document.querySelectorAll("[data-open-step]").forEach(button => {
  button.onclick = () => openVisitSection($(VISIT_TOOLBAR_TARGETS[Number(button.dataset.openStep)]));
});

document.querySelectorAll("#visit details.compact-step > summary").forEach(summary => {
  summary.addEventListener("click", event => {
    event.preventDefault();
    const detail = summary.parentElement;
    if (detail.open) {
      detail.open = false;
      return;
    }
    openVisitSection(detail);
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


const GUIDE_STEPS = [
  {id:"visitStep1", label:"Kunde und Termin", instruction:"Kundendaten prüfen und bestätigen"},
  {id:"recordContextCard", label:"Vorgeschichte", instruction:"Vorhandene Vorgänge kurz prüfen", optional:true},
  {id:"visitStep2", label:"Gebäude", instruction:"Gebäude und Raum erfassen"},
  {id:"visitStep3", label:"Schadensbild", instruction:"Schaden verständlich beschreiben"},
  {id:"visitStep4", label:"Messungen und Maßnahmen", instruction:"Schadensbereiche, Messungen und Maßnahmen erfassen"},
  {id:"visitStep5", label:"Dokumente", instruction:"Fotos, Pläne und Dokumente prüfen", optional:true},
  {id:"visitStep6", label:"Zusatzleistungen", instruction:"Zusatzleistungen prüfen", optional:true},
  {id:"visitSummary", label:"Besichtigungsprotokoll", instruction:"Das vollständige Protokoll prüfen"},
  {id:"visitCompletion", label:"Vollständigkeit", instruction:"Fehlende Informationen direkt ergänzen"},
  {id:"visitOfferBasis", label:"Angebotsgrundlage", instruction:"Ganz zum Schluss die Angebotsgrundlage freigeben"}
];
const VISIT_REQUIREMENT_DEFINITIONS = [
  {group:"Kunde und Termin",key:"visitEmployee",label:"Mitarbeiter"},
  {group:"Kunde und Termin",key:"visitStartTime",label:"Besichtigung begonnen"},
  {group:"Abschluss",key:"visitEndTime",label:"Besichtigung beendet"},
  {group:"Kunde und Termin",key:"customerName",label:"Kundenname oder Firma",legacy:"customer"},
  {group:"Kunde und Termin",key:"customerContact",label:"Telefonnummer oder E-Mail",legacy:"customer"},
  {group:"Kunde und Termin",key:"address",label:"Objektanschrift"},
  {group:"Kunde und Termin",key:"visitDate",label:"Besichtigungsdatum",defaultRequired:false},
  {group:"Gebäude und Raum",key:"yearBuilt",label:"Baujahr",defaultRequired:false},
  {group:"Gebäude und Raum",key:"buildingType",label:"Bauart",legacy:"building"},
  {group:"Gebäude und Raum",key:"floor",label:"Geschoss",legacy:"building"},
  {group:"Gebäude und Raum",key:"roomUse",label:"Raumnutzung",legacy:"building"},
  {group:"Gebäude und Raum",key:"foundationType",label:"Fundamentart",defaultRequired:false},
  {group:"Gebäude und Raum",key:"floorCover",label:"Bodenbelag",defaultRequired:false},
  {group:"Raumklima",key:"roomTemp",label:"Raumtemperatur",defaultRequired:false},
  {group:"Raumklima",key:"humidity",label:"Luftfeuchtigkeit",defaultRequired:false},
  {group:"Raumklima",key:"surfaceTemp",label:"Oberflächentemperatur",defaultRequired:false},
  {group:"Schadensbeschreibung",key:"damageTags",label:"Mindestens ein Schadensmerkmal",defaultRequired:false},
  {group:"Schadensbeschreibung",key:"moisturePattern",label:"Feuchteverlauf",legacy:"damage"},
  {group:"Schadensbeschreibung",key:"damageDescription",label:"Zusätzliche Beschreibung",defaultRequired:false},
  {group:"Schadensbereiche",key:"area",label:"Mindestens ein Schadensbereich"},
  {group:"Schadensbereiche",key:"areaName",label:"Bezeichnung jedes Schadensbereichs",defaultRequired:false},
  {group:"Schadensbereiche",key:"wallMaterial",label:"Wandmaterial",legacy:"wall"},
  {group:"Schadensbereiche",key:"wallThickness",label:"Wandstärke",legacy:"wall"},
  {group:"Schadensbereiche",key:"wallType",label:"Wandart",defaultRequired:false},
  {group:"Schadensbereiche",key:"earthContact",label:"Erdkontakt",defaultRequired:false},
  {group:"Schadensbereiche",key:"wallCover",label:"Wandbelag",defaultRequired:false},
  {group:"Feuchtemessung",key:"dryReference",label:"Referenzwert trocken",defaultRequired:false},
  {group:"Feuchtemessung",key:"measurement",label:"Mindestens ein Messpunkt",legacy:"measurement"},
  {group:"Feuchtemessung",key:"measurementDevice",label:"Messgerät je Messpunkt",legacy:"measurement"},
  {group:"Feuchtemessung",key:"measurementValue",label:"Messwert in Digits je Messpunkt",legacy:"measurement"},
  {group:"Feuchtemessung",key:"measurementHeight",label:"Messhöhe je Messpunkt",defaultRequired:false},
  {group:"Feuchtemessung",key:"measurementLocation",label:"Messposition je Messpunkt",defaultRequired:false},
  {group:"Maßnahmen",key:"measure",label:"Mindestens eine Maßnahme",legacy:"measure"}
];
function visitRequirementEnabled(key){
  const definition=VISIT_REQUIREMENT_DEFINITIONS.find(item=>item.key===key);
  const stored=state.settings.visitRequirements||{};
  if(Object.prototype.hasOwnProperty.call(stored,key))return stored[key]!==false;
  if(definition?.legacy&&Object.prototype.hasOwnProperty.call(stored,definition.legacy))return stored[definition.legacy]!==false;
  return definition?.defaultRequired!==false;
}
function customerIsSelected(){const c=state.visit.customer||{};return Boolean(c.pipedriveId||c.lexwareContactId||c.firstName||c.lastName||c.company);}
function guideChecks(){const c=state.visit.customer||{},b=state.visit.building||{},areas=state.visit.areas||[],measurements=areas.flatMap(x=>x.measurements||[]);return[
 {key:"visitEmployee",label:"Mitarbeiter auswählen",valid:Boolean(String(state.visit.visitEmployee||"").trim()),step:0,selector:"#visitEmployee"},
 {key:"visitStartTime",label:"Besichtigung beginnen",valid:Boolean(state.visit.visitStartTime),step:0,selector:"#startVisitWork"},
 {key:"visitEndTime",label:"Besichtigung beenden",valid:Boolean(state.visit.visitEndTime),step:6,selector:"#endVisitWork"},
 {key:"customerName",label:"Kundenname oder Firma",valid:Boolean(c.firstName||c.lastName||c.company),step:0,selector:"#firstName, #lastName, #company"},
 {key:"customerContact",label:"Telefonnummer oder E-Mail",valid:Boolean(c.phone||c.email),step:0,selector:"#phone, #email"},
 {key:"address",label:"Objektanschrift",valid:Boolean(c.objectAddress||(c.street&&c.zip&&c.city)),step:0,selector:"#objectAddress"},
 {key:"visitDate",label:"Besichtigungsdatum",valid:Boolean(state.visit.visitDate),step:0,selector:"#visitDate"},
 {key:"yearBuilt",label:"Baujahr",valid:Boolean(b.yearBuilt),step:2,selector:"#yearBuilt"},
 {key:"buildingType",label:"Bauart",valid:Boolean(b.buildingType),step:2,selector:"#buildingType"},
 {key:"floor",label:"Geschoss",valid:Boolean(b.floor),step:2,selector:"#floor"},
 {key:"roomUse",label:"Raumnutzung",valid:Boolean(b.roomUse),step:2,selector:"#roomUse"},
 {key:"foundationType",label:"Fundamentart",valid:Boolean(b.foundationType),step:2,selector:"#foundationType"},
 {key:"floorCover",label:"Bodenbelag",valid:Boolean(b.floorCover),step:2,selector:"#floorCover"},
 {key:"roomTemp",label:"Raumtemperatur",valid:Boolean(b.climateMeasured&&String(b.roomTemp).trim()),step:2,selector:"#roomTemp"},
 {key:"humidity",label:"Luftfeuchtigkeit",valid:Boolean(b.climateMeasured&&String(b.humidity).trim()),step:2,selector:"#humidity"},
 {key:"surfaceTemp",label:"Oberflächentemperatur",valid:Boolean(b.climateMeasured&&String(b.surfaceTemp).trim()),step:2,selector:"#surfaceTemp"},
 {key:"damageTags",label:"Mindestens ein Schadensmerkmal",valid:Boolean((state.visit.damageTags||[]).length),step:3,selector:"#damageTagOptions"},
 {key:"moisturePattern",label:"Feuchteverlauf",valid:Boolean(state.visit.moisturePattern),step:3,selector:"#moisturePattern"},
 {key:"damageDescription",label:"Zusätzliche Beschreibung",valid:Boolean(String(state.visit.damageDescription||"").trim()),step:3,selector:"#damageDescription"},
 {key:"area",label:"Mindestens ein Schadensbereich",valid:areas.length>0,step:4,selector:"#addArea"},
 {key:"areaName",label:"Bezeichnung jedes Schadensbereichs",valid:areas.length>0&&areas.every(x=>String(x.name||"").trim()),step:4,selector:'[data-field="name"]'},
 {key:"wallMaterial",label:"Wandmaterial",valid:areas.length>0&&areas.every(x=>x.wallMaterial||x.wallMaterialOther),step:4,selector:'[data-field="wallMaterial"]'},
 {key:"wallThickness",label:"Wandstärke",valid:areas.length>0&&areas.every(x=>x.wallThickness),step:4,selector:'[data-field="wallThickness"]'},
 {key:"wallType",label:"Wandart",valid:areas.length>0&&areas.every(x=>x.wallType),step:4,selector:'[data-field="wallType"]'},
 {key:"earthContact",label:"Erdkontakt",valid:areas.length>0&&areas.every(x=>x.earthContact),step:4,selector:'[data-field="earthContact"]'},
 {key:"wallCover",label:"Wandbelag",valid:areas.length>0&&areas.every(x=>x.wallCover),step:4,selector:'[data-field="wallCover"]'},
 {key:"dryReference",label:"Referenzwert trocken",valid:areas.length>0&&areas.every(x=>String(x.dryReference||"").trim()),step:4,selector:'[data-field="dryReference"]'},
 {key:"measurement",label:"Mindestens ein Messpunkt",valid:areas.length>0&&areas.every(x=>(x.measurements||[]).length>0),step:4,selector:'[data-add-measurement]'},
 {key:"measurementDevice",label:"Messgerät je Messpunkt",valid:measurements.length>0&&measurements.every(m=>m.device),step:4,selector:'[data-mf="device"]'},
 {key:"measurementValue",label:"Messwert in Digits je Messpunkt",valid:measurements.length>0&&measurements.every(m=>String(m.value).trim()),step:4,selector:'[data-mf="value"]'},
 {key:"measurementHeight",label:"Messhöhe je Messpunkt",valid:measurements.length>0&&measurements.every(m=>String(m.height||"").trim()),step:4,selector:'[data-mf="height"]'},
 {key:"measurementLocation",label:"Messposition je Messpunkt",valid:measurements.length>0&&measurements.every(m=>String(m.location||"").trim()),step:4,selector:'[data-mf="location"]'},
 {key:"measure",label:"Mindestens eine Maßnahme",valid:areas.some(x=>(x.measures||[]).some(m=>m.type)),step:4,selector:'[data-add-measure], [data-mfield="type"]'}
].map(check=>({...check,required:visitRequirementEnabled(check.key),ok:!visitRequirementEnabled(check.key)||check.valid}));}
function offerBasisApproved(){return Boolean(state.visit.offerBasis?.approved);}
function visitReviewFingerprint(){
  const visit=state.visit||{};
  return JSON.stringify({
    visitDate:visit.visitDate||"",visitEmployee:visit.visitEmployee||"",
    visitStartTime:visit.visitStartTime||"",visitEndTime:visit.visitEndTime||"",
    customer:visit.customer||{},building:visit.building||{},
    damageDescription:visit.damageDescription||"",damageTags:visit.damageTags||[],
    moisturePattern:visit.moisturePattern||"",activeWaterIngress:Boolean(visit.activeWaterIngress),
    areas:visit.areas||[],documents:visit.documents||[],extras:visit.extras||[]
  });
}
function visitProtocolReviewed(){
  const basis=state.visit.offerBasis||{};
  return Boolean(basis.reviewedAt&&basis.reviewFingerprint===visitReviewFingerprint());
}
function moisturePatternLabel(value){
  return {
    rising:"Von unten aufsteigend",
    lateral:"Seitlich oder flächig in der Wand",
    wallSole:"Am Wand-Sohlen-Anschluss",
    localWater:"Örtlich begrenzt / aktiver Wassereintritt",
    unclear:"Noch nicht eindeutig"
  }[value]||value||"–";
}
function stepComplete(index){const checks=guideChecks();if(index===1||index===5||index===6)return true;if(index===0)return checks.filter(x=>x.step===0).every(x=>x.ok);if(index===2)return checks.filter(x=>x.step===2).every(x=>x.ok);if(index===3)return checks.filter(x=>x.step===3).every(x=>x.ok);if(index===4)return checks.filter(x=>x.step===4).every(x=>x.ok);if(index===7)return checks.every(x=>x.ok);if(index===8)return checks.every(x=>x.ok)&&visitProtocolReviewed();if(index===9)return checks.every(x=>x.ok)&&visitProtocolReviewed()&&offerBasisApproved();return checks.every(x=>x.ok)&&visitProtocolReviewed()&&offerBasisApproved();}
function currentGuideStep(){const stored=Number(state.visit.guideStep||0);return Math.max(0,Math.min(GUIDE_STEPS.length-1,stored));}
function openGuideStep(index){index=Math.max(0,Math.min(GUIDE_STEPS.length-1,index));state.visit.guideStep=index;saveState();GUIDE_STEPS.forEach((step,i)=>{const el=$(step.id);if(!el)return;if(el.tagName==='DETAILS')el.open=i===index;el.classList.toggle('is-current',i===index);el.classList.toggle('is-complete',stepComplete(i));el.classList.toggle('is-incomplete',!stepComplete(i));});const item=GUIDE_STEPS[index];if($('guidedStepLabel'))$('guidedStepLabel').textContent=`Schritt ${index+1} von ${GUIDE_STEPS.length}`;if($('guidedInstruction'))$('guidedInstruction').textContent=item.instruction;if($('guidedProgress'))$('guidedProgress').max=GUIDE_STEPS.length;if($('guidedProgress'))$('guidedProgress').value=index+1;if($('guidedNext'))$('guidedNext').textContent=index===GUIDE_STEPS.length-1?'Angebot öffnen':'Bestätigen und weiter';if(index===7)renderInspectionSummary();const target=$(item.id);if(target&&index>0){if(target.tagName==='DETAILS')openVisitSection(target);else requestAnimationFrame(()=>target.scrollIntoView({behavior:'smooth',block:'start'}));}renderVisitChecklist();}
function renderCustomerSourceState(){const selected=customerIsSelected(),c=state.visit.customer||{};$('customerSourceActions')?.classList.toggle('hidden',selected);$('customerConfirmed')?.classList.toggle('hidden',!selected);if(selected){$('confirmedCustomerName').textContent=[c.salutation,c.firstName,c.lastName].filter(Boolean).join(' ')||c.company||'Kunde';$('confirmedCustomerSource').textContent=c.pipedriveId?'Aus Pipedrive übernommen':c.lexwareContactId?'Aus Lexoffice übernommen':'Manuell erfasst';}}
function jumpToVisitCheck(check){
  openGuideStep(check.step);
  window.setTimeout(()=>{
    const field=document.querySelector(check.selector);
    if(!field)return;
    field.scrollIntoView({behavior:"smooth",block:"center"});
    field.classList.add("field-jump-highlight");
    if(typeof field.focus==="function")field.focus({preventScroll:true});
    window.setTimeout(()=>field.classList.remove("field-jump-highlight"),1800);
  },180);
}
function renderVisitChecklist(){
  const box=$('visitChecklist');if(!box)return;
  const checks=guideChecks(),requiredChecks=checks.filter(x=>x.required);
  const complete=checks.every(x=>x.ok),reviewed=complete&&visitProtocolReviewed(),approved=reviewed&&offerBasisApproved();
  box.innerHTML=requiredChecks.length?requiredChecks.map((x,i)=>`<button type="button" class="checklist-row ${x.ok?'ok':'missing'}" ${x.ok?'disabled':`data-missing-check="${i}"`}><span>${esc(x.label)}</span><strong>${x.ok?'✓ vollständig':'Antippen und ergänzen →'}</strong></button>`).join(''):'<div class="status ok">Für diese Besichtigung sind keine Pflichtangaben festgelegt.</div>';
  box.querySelectorAll("[data-missing-check]").forEach(button=>button.onclick=()=>jumpToVisitCheck(requiredChecks[Number(button.dataset.missingCheck)]));
  $('finishVisitGuide').disabled=!approved;
  if($("finishVisitReason"))$("finishVisitReason").textContent=!complete?"Noch nicht möglich: Pflichtangaben fehlen.":!reviewed?"Noch nicht möglich: Bitte zuerst „Protokoll prüfen“.":!approved?"Noch nicht möglich: Bitte die Angebotsgrundlage bestätigen.":"Alles vollständig – das Angebot kann geöffnet werden.";
  if($("offerBasisApproved"))$("offerBasisApproved").disabled=!reviewed;
  const basis=$("visitOfferBasis");
  if(basis){basis.classList.toggle("is-locked",!reviewed);if(!reviewed)basis.removeAttribute("open");}
  if($("offerBasisStatus")&&!reviewed)showStatus("offerBasisStatus",complete?"Bitte zuerst unten auf „Protokoll prüfen“ tippen.":"Die Angebotsgrundlage wird nach vollständigem Protokoll freigegeben.",false);
}
function updateVisitGuide(){
  GUIDE_STEPS.forEach((step,i)=>{
    const el=$(step.id);
    if(!el)return;
    el.classList.toggle('is-complete',stepComplete(i));
    el.classList.toggle('is-incomplete',!stepComplete(i));
  });
  renderVisitChecklist();
}
function firstMissingGuideStep(){const missing=guideChecks().find(x=>!x.ok);if(missing)return missing.step;if(!visitProtocolReviewed())return 7;return 9;}

function renderInspectionSummary(){
  const box=$("inspectionSummary");if(!box)return;
  const areas=state.visit.areas||[],documents=state.visit.documents||[];
  const photoCount=areas.reduce((sum,area)=>sum+(area.photos||[]).length,0);
  const measurementCount=areas.reduce((sum,area)=>sum+(area.measurements||[]).length,0);
  const measureCount=areas.reduce((sum,area)=>sum+(area.measures||[]).filter(m=>m.type).length,0);
  const tags=(state.visit.damageTags||[]).join(", ")||state.visit.damageDescription||"Kein Schadenbild erfasst";
  box.innerHTML=`
    <div class="summary-metrics">
      <div><strong>${areas.length}</strong><span>${areas.length===1?"Schadensbereich":"Schadensbereiche"}</span></div>
      <div><strong>${measurementCount}</strong><span>Messwerte</span></div>
      <div><strong>${measureCount}</strong><span>${measureCount===1?"Maßnahme":"Maßnahmen"}</span></div>
      <div><strong>${photoCount}</strong><span>${photoCount===1?"Foto":"Fotos"}</span></div>
      <div><strong>${documents.length}</strong><span>${documents.length===1?"Dokument":"Dokumente"}</span></div>
    </div>
    <article class="summary-overview"><span>Festgestelltes Schadenbild</span><strong>${esc(tags)}</strong><small>Feuchteverlauf: ${esc(moisturePatternLabel(state.visit.moisturePattern))}${state.visit.activeWaterIngress?" · aktiver Wassereintritt":""}</small></article>
    ${areas.map(area=>`<article class="summary-area">
      <header><div><span>Schadensbereich</span><h3>${esc(area.name||"Ohne Bezeichnung")}</h3></div><b>${esc(area.wallThickness||"–")} cm</b></header>
      <div class="summary-area-grid">
        <div><span>Bauteil</span><strong>${esc(area.wallMaterialOther||area.wallMaterial||"–")}</strong><small>Erdkontakt: ${esc(area.earthContact||"–")}</small></div>
        <div><span>Messwerte in Digits</span><strong>${Object.entries((area.measurements||[]).reduce((groups,m)=>{const device=m.device||"Gerät fehlt";(groups[device]||=[]).push(m.value||"–");return groups;},{})).map(([device,values])=>`${esc(device)}: ${values.map(esc).join(", ")} Digits`).join("<br>")||"–"}</strong></div>
        <div><span>Bestätigte Maßnahmen</span><strong>${(area.measures||[]).filter(m=>m.type).map(m=>`${esc(m.type)} – ${esc([m.length&&`${m.length} lfm`,m.width&&m.height&&`${m.width} × ${m.height} m`,m.wall&&`${m.wall} cm`].filter(Boolean).join(", ")||"Menge prüfen")}`).join("<br>")||"–"}</strong></div>
        <div><span>Nachweise</span><strong>${(area.photos||[]).length} Foto${(area.photos||[]).length===1?"":"s"}</strong></div>
      </div>
    </article>`).join("")}
    <article class="summary-overview"><span>Dokumente und Pläne</span><strong>${documents.length} Datei${documents.length===1?"":"en"}</strong><small>${documents.map(d=>esc(d.category||d.name||"Dokument")).join(", ")||"Keine zusätzlichen Dokumente"}</small></article>`;
  const basis=state.visit.offerBasis||{};
  if($("offerBasisNote"))$("offerBasisNote").value=basis.note||"";
  if($("offerBasisApproved"))$("offerBasisApproved").checked=Boolean(basis.approved);
}
function adviceMeasure(){
  const measures=(state.visit.areas||[]).flatMap(a=>(a.measures||[]).map(m=>({...m,areaName:a.name,areaWall:a.wallThickness})));
  return measures.find(m=>m.type===adviceState.type)||measures.find(m=>['Horizontalsperre','Flächensperre','Wand-Sohlen-Anschluss'].includes(m.type))||{};
}
const adviceState={type:'Horizontalsperre',stage:1};
const ADVICE_CONTENT={
  'Horizontalsperre':{
    image:'assets/advice/horizontalsperre.png',
    note:'Die Sperre stoppt den weiteren kapillaren Feuchtetransport. Die bereits im Mauerwerk vorhandene Feuchtigkeit muss anschließend natürlich austrocknen.',
    steps:[
      {title:'Feuchtigkeit steigt aus dem Fundament auf',text:'Bei einer fehlenden oder defekten Horizontalsperre steigt Feuchtigkeit kapillar aus dem Fundament in die darüberliegende Wand.',details:['Darstellung immer mit Fundament unter der Wand','Erdreich liegt seitlich am Bauteil an','Feuchtigkeit steigt im Mauerwerk nach oben']},
      {title:'Bohrlochreihe anzeichnen',text:'Die Bohrlöcher werden in einer waagerechten Reihe oberhalb des Fundaments angeordnet.',details:['Bohrlochabstand 25 cm oder 12,5 cm','Bohrposition entsprechend dem vorhandenen Mauerwerk festlegen']},
      {title:'Schräg bis etwa zur Mauerwerksmitte bohren',text:'Wir bohren von innen in einem Winkel von 30–50 Grad bis ungefähr zur Mitte des Mauerwerks.',details:['Seitliche Schnittansicht','Bohrkanal endet etwa in Mauerwerksmitte','Mauerwerksschonendes Verfahren']},
      {title:'BKM HZ 250 PRO injizieren',text:'Das Injektionsmaterial wird in die Bohrlöcher eingebracht und verteilt sich durch seine Kriecheigenschaften im Kapillarsystem.',details:['Mindestmenge grundsätzlich 200 ml je Bohrloch','Bei 12,5 cm Abstand wird die rechnerische Menge je Bohrloch halbiert, jedoch niemals unter 200 ml','Verteilung erfolgt im feuchten Mauerwerk']},
      {title:'Neue wasserabweisende Sperrschicht',text:'Im Mauerwerk entsteht eine durchgehende wasserabweisende Zone, die den weiteren Feuchtetransport aus dem Fundament unterbindet.',details:['Kapillaren werden hydrophobiert und nicht verstopft','Restfeuchtigkeit kann anschließend austrocknen']}
    ]
  },
  'Flächensperre':{
    image:'assets/advice/flaechensperre.png',
    note:'Die Flächensperre wird vollständig von innen ausgeführt. Ein Freischachten der Außenwand ist hierfür nicht erforderlich.',
    steps:[
      {title:'Feuchtigkeit aus Fundament und Erdreich',text:'Bei einer defekten oder fehlenden Vertikalabdichtung dringt Feuchtigkeit seitlich aus dem anliegenden Erdreich und zusätzlich aus dem Fundament in die Wand ein.',details:['Fundament immer unter der Wand darstellen','Erdreich immer seitlich neben der Wand darstellen','Feuchtigkeitswege von unten und von der Seite zeigen']},
      {title:'Bohrbild von innen anlegen',text:'Die betroffene Innenwand wird rasterförmig gebohrt. Die Bohrungen beeinträchtigen die Statik des Mauerwerks nicht.',details:['Bohrabstand 25 cm oder 12,5 cm','Mehrere versetzte Bohrreihen über der gesamten Fläche']},
      {title:'BKM HZ 250 PRO injizieren',text:'Das Material wird von innen eingebracht und verteilt sich im durchfeuchteten Wandquerschnitt.',details:['Injektion über die vollständige Schadensfläche','Verteilung auch in stark durchfeuchtetem Mauerwerk']},
      {title:'Zusammenhängende Flächensperre entsteht',text:'Die hydrophobierte Zone reduziert den kapillaren Feuchtetransport aus Erdreich und Fundament. Die Wand kann anschließend kontrolliert austrocknen.',details:['Keine Außenarbeiten','Bohrlöcher werden anschließend verschlossen']}
    ]
  },
  'Wand-Sohlen-Anschluss':{
    image:'assets/advice/wand-sohle.png',
    note:'Diese Maßnahme endet mit Hohlkehle und Sperrmörtel. Zweikomponentige Abdichtung und Sanierputz gehören ausschließlich zur druckwasserstabilen Innenabdichtung.',
    steps:[
      {title:'Estrich von innen öffnen',text:'Der Estrich wird entlang der Innenwand aufgeschnitten und in der erforderlichen Breite bis zur Bodenplatte entfernt.',details:['Arbeitsbereich von innen','Bodenplatte und Wand-Sohlen-Fuge vollständig freilegen','Ausbau in der Regel ca. 10–15 cm breit, objektabhängig']},
      {title:'Untergrund vollständig vorbereiten',text:'Loser Putz, lose Bestandteile und haftungsmindernde Rückstände werden entfernt. Wand, Bodenplatte und Anschlussfuge werden gründlich gereinigt.',details:['Tragfähigen mineralischen Untergrund herstellen','Staub und lose Bestandteile entfernen']},
      {title:'Dreieckige Nut 2 × 2 cm ausstemmen',text:'Direkt im Wand-Sohlen-Bereich wird von innen eine dreieckige Nut mit ungefähr 2 cm Schenkellänge und 2 cm Tiefe ausgestemmt.',details:['Dreiecksform im 90-Grad-Anschluss','Nut verläuft durchgehend entlang des abzudichtenden Anschlusses','Untergrund anschließend erneut reinigen']},
      {title:'Harzinjektion bei Bedarf',text:'Bei aktivem oder zu erwartendem Wassereintritt wird die Fuge über geeignete Bohrungen und Packer mit Injektionsharz verpresst.',details:['Nur technisch erforderliche Bereiche','Harz stoppt Wasser und füllt vorhandene Hohlräume']},
      {title:'Hohlkehle herstellen',text:'BKM HS Sperrmörtel wird in die ausgestemmte Nut eingebracht und mit der Kelle zu einer gleichmäßigen Hohlkehle ausgeformt.',details:['Keine scharfkantige 90-Grad-Ecke','Dauerhafte Verbindung zwischen Wand und Bodenplatte']},
      {title:'Sperrmörtel mindestens 15 cm über Sperrbahn führen',text:'Der Sperrmörtel wird über Hohlkehle, Anschlussbereich und Wandfläche aufgetragen und mindestens 15 cm über eine vorhandene Horizontalsperre beziehungsweise Sperrbahn hinausgeführt.',details:['Überdeckung verhindert Hinterläufigkeit','Durchgehender dichter Anschluss von Wand und Bodenplatte']},
      {title:'Wand-Sohlen-Anschluss fertigstellen',text:'Nach der Erhärtung ist der kritische Übergang von innen dauerhaft abgedichtet. Der Estrichbereich kann später fachgerecht geschlossen werden.',details:['Keine zweikomponentige Abdichtung in diesem Modul','Kein Sanierputz in diesem Modul']}
    ]
  },
  'Druckwasserstabile Innenabdichtung':{
    image:'assets/advice/druckwasser.png',
    note:'Die druckwasserstabile Innenabdichtung ist ein eigenständiger mehrlagiger Systemaufbau und wird klar vom reinen Wand-Sohlen-Anschluss getrennt.',
    steps:[
      {title:'Untergrund von innen freilegen',text:'Putz, Beschichtungen und nicht tragfähige Bestandteile werden vollständig entfernt. Der mineralische Untergrund wird gereinigt und vorbereitet.',details:['Alle Arbeiten erfolgen von innen','Wand-Sohlen-Anschluss wird in das System einbezogen']},
      {title:'Wand-Sohlen-Anschluss abdichten',text:'Der Anschluss wird vorbereitet, bei Bedarf mit Harz verpresst und mit einer Hohlkehle aus BKM HS Sperrmörtel ausgebildet.',details:['Dreieckige Nut 2 × 2 cm','Sperrmörtel mindestens 15 cm über vorhandene Sperrbahn']},
      {title:'Mineralische Vorabdichtung und Egalisierung',text:'Unebenheiten werden mit geeignetem Sperrmörtel ausgeglichen. Dadurch entsteht ein tragfähiger, geschlossener Untergrund für die Abdichtungslagen.',details:['Hohlräume schließen','Scharfe Kanten vermeiden']},
      {title:'Zweikomponentige Abdichtung aufbringen',text:'Die druckwasserstabile zweikomponentige Abdichtung wird in den vorgesehenen Lagen vollflächig von innen aufgetragen.',details:['BKM SEF 2K beziehungsweise der freigegebene Systemwerkstoff','Erforderliche Schichtdicke und Trocknungszeiten einhalten']},
      {title:'Haftvermittlung und Sanierputzsystem',text:'Nach vollständiger Erhärtung der Abdichtung wird der weitere systemgerechte Putzaufbau hergestellt.',details:['Haftvermittler nach Systemvorgabe','Sanierputz als eigener Bestandteil dieses Systems','Oberflächenveredelung erst nach ausreichender Standzeit']}
    ]
  }
};
function renderAdvice(){
  const content=ADVICE_CONTENT[adviceState.type]||ADVICE_CONTENT.Horizontalsperre;
  const max=content.steps.length;
  adviceState.stage=Math.max(1,Math.min(max,adviceState.stage));
  const step=content.steps[adviceState.stage-1];
  const img=$('adviceImage');
  if(img){img.src=content.image;img.alt=`${adviceState.type} – Innenabdichtung`}
  $('adviceTypeLabel').textContent=adviceState.type.toUpperCase();
  $('adviceTitle').textContent=step.title;
  $('adviceText').textContent=step.text;
  $('adviceStage').textContent=`${adviceState.stage} von ${max}`;
  $('advicePrev').disabled=adviceState.stage<=1;
  $('adviceNext').disabled=adviceState.stage>=max;
  $('adviceStepDetails').innerHTML=(step.details||[]).map(x=>`<div class="advice-detail-row"><span>✓</span><p>${esc(x)}</p></div>`).join('');
  $('adviceImportantNote').textContent=content.note;
  $('adviceProcessTitle').textContent=`${adviceState.type}: kompletter Ablauf`;
  $('adviceProcessSteps').innerHTML=content.steps.map((x,i)=>`<button type="button" class="advice-process-step ${i+1===adviceState.stage?'active':''}" data-advice-stage="${i+1}"><span>${i+1}</span><strong>${esc(x.title)}</strong></button>`).join('');
  $('adviceProcessSteps').querySelectorAll('[data-advice-stage]').forEach(b=>b.onclick=()=>{adviceState.stage=Number(b.dataset.adviceStage);renderAdvice();});
  const m=adviceMeasure(),wall=Number(m.wall||m.areaWall||0),spacing=Number(m.spacing||0);
  const isSurface=adviceState.type==='Flächensperre';
  const qty=isSurface?Number(m.width||0)*Number(m.height||0):Number(m.length||0);
  let holes=0;
  if(spacing>0&&['Horizontalsperre','Flächensperre'].includes(adviceState.type)) holes=isSurface?Math.ceil(Number(m.width||0)/spacing+1)*Math.ceil(Number(m.height||0)/spacing+1):Math.ceil(qty/spacing);
  const rows=[['Objekt',state.visit.customer?.objectAddress||state.visit.customer?.city||'aktuelles Objekt'],['Ausführung','ausschließlich von innen'],['Wandstärke',wall?`${wall} cm`:'noch nicht erfasst']];
  if(qty)rows.push(['Umfang',`${num(qty)} ${isSurface?'m²':'lfm'}`]);
  if(spacing&&['Horizontalsperre','Flächensperre'].includes(adviceState.type))rows.push(['Bohrlochabstand',`${num(spacing*100)} cm`]);
  if(holes)rows.push(['Bohrlöcher',holes]);
  $('adviceObjectData').innerHTML=rows.map(x=>`<div><span>${x[0]}</span><strong>${esc(String(x[1]))}</strong></div>`).join('');
  document.querySelectorAll('[data-advice-type]').forEach(b=>b.classList.toggle('active',b.dataset.adviceType===adviceState.type));
}

const DAMAGE_TAGS = [
  "Muffiger Geruch",
  "Abplatzender Putz",
  "Salzausblühungen",
  "Feuchte Flecken",
  "Dunkle Verfärbungen",
  "Schimmelbildung",
  "Wasser auf dem Boden",
  "Sichtbarer Wassereintritt",
  "Nasse Wandoberfläche",
  "Risse im Mauerwerk oder Putz",
  "Hohlliegender Putz",
  "Beschädigter Boden-Wandanschluss",
  "Feuchtigkeit an Rohrdurchführungen",
  "Sonstiges"
];

const INQUIRY_SYMPTOMS = [
  "Muffiger Geruch",
  "Abplatzender Putz",
  "Feuchte Flecken",
  "Salzausblühungen",
  "Schimmel",
  "Wasser auf dem Boden",
  "Sichtbarer Wassereintritt",
  "Nasse Wand",
  "Risse",
  "Feuchtigkeit nach Starkregen",
  "Sonstiges"
];

function ensureInquiry() {
  state.visit.inquiry ||= {};
  const inquiry = state.visit.inquiry;
  inquiry.source ||= "";
  inquiry.concern ||= "";
  inquiry.symptoms = Array.isArray(inquiry.symptoms) ? inquiry.symptoms : [];
  inquiry.urgency ||= "normal";
  inquiry.appointmentStatus ||= inquiry.appointment ? "scheduled" : "open";
  inquiry.appointmentDate ||= "";
  inquiry.appointmentTime ||= "";
  inquiry.message ||= "";
  return inquiry;
}

function formatInquiryDate(value) {
  const [year, month, day] = String(value || "").split("-");
  return year && month && day ? `${day}.${month}.${year}` : value;
}

function captureVisitScroll() {
  return $("visit")?.classList.contains("active") ? window.scrollY : null;
}

function restoreVisitScroll(scrollY) {
  if (scrollY === null) return;
  requestAnimationFrame(() => {
    window.scrollTo({ top: scrollY, behavior: "auto" });
    requestAnimationFrame(() => window.scrollTo({ top: scrollY, behavior: "auto" }));
  });
}

function renderInquiryPlanning() {
  const scrollY = captureVisitScroll();
  const inquiry = ensureInquiry();
  $("inquirySource").value = inquiry.source || "";
  $("inquiryConcern").value = inquiry.concern || "";
  $("inquiryMessage").value = inquiry.message || "";
  $("inquiryAppointmentStatus").value = inquiry.appointmentStatus;
  $("inquiryAppointmentDate").value = inquiry.appointmentDate || "";
  $("inquiryAppointmentTime").value = inquiry.appointmentTime || "";

  const symptoms = $("inquirySymptomOptions");
  symptoms.innerHTML = INQUIRY_SYMPTOMS.map(symptom => `
    <label class="damage-tag ${inquiry.symptoms.includes(symptom) ? "selected" : ""}">
      <input type="checkbox" data-inquiry-symptom="${esc(symptom)}" ${inquiry.symptoms.includes(symptom) ? "checked" : ""}>
      <span>${esc(symptom)}</span>
    </label>`).join("");
  symptoms.querySelectorAll("[data-inquiry-symptom]").forEach(input => input.onchange = () => {
    const selected = new Set(ensureInquiry().symptoms);
    input.checked ? selected.add(input.dataset.inquirySymptom) : selected.delete(input.dataset.inquirySymptom);
    state.visit.inquiry.symptoms = [...selected];
    saveState();
    renderInquiryPlanning();
  });

  document.querySelectorAll("[data-inquiry-urgency]").forEach(button => {
    button.classList.toggle("selected", button.dataset.inquiryUrgency === inquiry.urgency);
  });

  const scheduled = inquiry.appointmentStatus === "scheduled";
  $("inquiryAppointmentDate").disabled = !scheduled;
  $("inquiryAppointmentTime").disabled = !scheduled;
  const complete = Boolean(inquiry.source && inquiry.concern && inquiry.symptoms.length);
  const ready = complete && scheduled && inquiry.appointmentDate && inquiry.appointmentTime;
  $("inquiryPlanningState").textContent = ready ? "✓ geplant" : complete ? "Termin offen" : "Bitte ergänzen";
  $("inquiryNextAction").className = `inquiry-next-action ${ready ? "ready" : inquiry.urgency === "urgent" ? "urgent" : ""}`;
  $("inquiryNextAction").innerHTML = ready
    ? `<strong>Nächster Schritt: Besichtigung am ${esc(formatInquiryDate(inquiry.appointmentDate))} um ${esc(inquiry.appointmentTime)} Uhr</strong><span>Vor Ort „Vor-Ort-Besichtigung starten“ antippen.</span>`
    : inquiry.appointmentStatus === "callback"
      ? "<strong>Nächster Schritt: Kunden zurückrufen</strong><span>Danach Terminstatus auf „Termin vereinbart“ setzen.</span>"
      : "<strong>Nächster Schritt: Besichtigungstermin vereinbaren</strong><span>Quelle, Anliegen und gemeldete Symptome bleiben bereits gespeichert.</span>";
  restoreVisitScroll(scrollY);
}

function collectInquiryPlanning() {
  const inquiry = ensureInquiry();
  inquiry.source = $("inquirySource").value;
  inquiry.concern = $("inquiryConcern").value;
  inquiry.message = $("inquiryMessage").value.trim();
  inquiry.appointmentStatus = $("inquiryAppointmentStatus").value;
  inquiry.appointmentDate = $("inquiryAppointmentDate").value;
  inquiry.appointmentTime = $("inquiryAppointmentTime").value;
  inquiry.appointment = inquiry.appointmentStatus === "scheduled"
    ? [inquiry.appointmentDate, inquiry.appointmentTime].filter(Boolean).join(" ")
    : "";
  inquiry.updatedAt = new Date().toISOString();
  saveState();
  return inquiry;
}

function damageDescriptionText(visit = state.visit) {
  const tags = Array.isArray(visit.damageTags) ? visit.damageTags.filter(Boolean) : [];
  const note = String(visit.damageDescription || "").trim();
  return [tags.join(", "), note].filter(Boolean).join(". ");
}

function renderDamageTags() {
  const box = $("damageTagOptions");
  if (!box) return;
  state.visit.damageTags ||= [];
  box.innerHTML = DAMAGE_TAGS.map(tag => `
    <label class="damage-tag ${state.visit.damageTags.includes(tag) ? "selected" : ""}">
      <input type="checkbox" data-damage-tag="${esc(tag)}" ${state.visit.damageTags.includes(tag) ? "checked" : ""}>
      <span>${esc(tag)}</span>
    </label>`).join("");
  box.querySelectorAll("[data-damage-tag]").forEach(input => input.onchange = () => {
    const tag = input.dataset.damageTag;
    const selected = new Set(state.visit.damageTags || []);
    input.checked ? selected.add(tag) : selected.delete(tag);
    state.visit.damageTags = [...selected];
    saveState();
    renderDamageTags();
    updateVisitGuide();
  });
}

function measureSuggestion() {
  const pattern = state.visit.moisturePattern || "";
  const activeWater = Boolean(state.visit.activeWaterIngress);
  const areas = state.visit.areas || [];
  const earthContact = areas.some(area => area.earthContact === "erdberührt");
  const measurements = areas.flatMap(area => area.measurements || [])
    .map(item => Number(String(item.value).replace(",", ".")))
    .filter(Number.isFinite);

  if (!pattern) return { type:"", text:"Bitte zuerst den Feuchteverlauf auswählen." };
  if (!areas.length) return { type:"", text:"Bitte zuerst mindestens einen Schadensbereich anlegen." };

  let type = "";
  let reason = "";
  if (pattern === "wallSole") {
    type = "Wand-Sohlen-Anschluss";
    reason = "Der auffällige Bereich liegt am Übergang zwischen Wand und Boden.";
  } else if (pattern === "localWater" || activeWater) {
    type = "Harzverpressung";
    reason = "Der Befund ist örtlich begrenzt oder es liegt aktiver Wassereintritt vor.";
  } else if (pattern === "lateral" && earthContact) {
    type = "Flächensperre";
    reason = "Die Feuchte tritt seitlich beziehungsweise flächig an einer erdberührten Wand auf.";
  } else if (pattern === "rising") {
    type = "Horizontalsperre";
    reason = "Der dokumentierte Feuchteverlauf steigt vom unteren Wandbereich nach oben.";
  }

  const measurementNote = measurements.length
    ? ` ${measurements.length} Messwert${measurements.length === 1 ? "" : "e"} wurden berücksichtigt.`
    : " Vor der endgültigen Festlegung müssen noch Messwerte dokumentiert werden.";
  if (!type) return {
    type:"",
    text:`Der Befund ist noch nicht eindeutig. Bitte Messwerte, Erdkontakt und Feuchteverlauf prüfen.${measurementNote}`
  };
  return {
    type,
    text:`Vorschlag zur fachlichen Prüfung: ${type}. ${reason}${measurementNote} Die endgültige Auswahl bleibt deine Entscheidung.`
  };
}

function renderMeasureSuggestion() {
  const result = measureSuggestion();
  const box = $("measureSuggestion");
  const accept = $("acceptMeasureSuggestion");
  if (box) box.textContent = result.text;
  if (accept) {
    accept.classList.toggle("hidden", !result.type);
    accept.dataset.suggestedMeasure = result.type || "";
  }
}

function pipedriveValueText(value) {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.map(pipedriveValueText).filter(Boolean).join(", ");
  if (typeof value === "object") {
    return String(value.label || value.value || value.name || value.address || "");
  }
  return String(value);
}

function applyPipedrivePerson(person = {}) {
  const customer = state.visit.customer;
  const mapped = state.settings.pipedriveSync?.personFieldMappings || {};
  const custom = person.customFields || {};
  const mappedPostal = pipedriveValueText(custom[mapped.postalAddress]);
  const mappedObject = pipedriveValueText(custom[mapped.objectAddress]);
  const source = {
    ...person,
    ...(mappedPostal ? (() => {
      const parts = mappedPostal.match(/^(.*?)(?:,\s*|\s+)(\d{5})\s+(.+)$/);
      return parts ? { street:parts[1], zip:parts[2], city:parts[3], postalAddress:mappedPostal } : {};
    })() : {}),
    ...(mappedObject ? { objectAddress:mappedObject } : {})
  };
  ["salutation","firstName","lastName","company","phone","mobile","email","street","zip","city"].forEach(key => {
    if (source[key] !== undefined && source[key] !== "") customer[key] = source[key];
  });
  const postal = [customer.street, [customer.zip, customer.city].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  customer.objectAddress = source.objectAddress || customer.objectAddress || postal;
  customer.objectAddressDifferent = Boolean(customer.objectAddress && postal && customer.objectAddress !== postal);
  customer.pipedriveId = String(source.id || customer.pipedriveId || "");
  customer.pipedriveData = {
    emails: source.emails || [],
    phones: source.phones || [],
    customFields: source.customFields || {},
    customFieldsByName: source.customFieldsByName || {},
    raw: source.pipedriveRaw || {}
  };
  state.visit.inquiry ||= {};
  if (!state.visit.inquiry.source && source.inquirySource) state.visit.inquiry.source = source.inquirySource;
  if (!state.visit.inquiry.ownerStatus && source.ownerStatus) state.visit.inquiry.ownerStatus = source.ownerStatus;
  if (!state.visit.inquiry.appointment && source.appointment) state.visit.inquiry.appointment = source.appointment;
}

function applyPipedriveContextToVisit() {
  const context = state.visit.recordContext;
  if (!context?.loaded || context.contextAppliedAt === context.loadedAt) return;
  if (context.person) applyPipedrivePerson(context.person);
  const deal = context.deal || {};
  const custom = deal.customFields || {};
  const mappings = state.settings.pipedriveSync?.fieldMappings || {};
  const valueFor = key => pipedriveValueText(custom[mappings[key]]);
  const setIfEmpty = (object, key, value) => {
    if ((object[key] === "" || object[key] === undefined || object[key] === null) && value !== "") object[key] = value;
  };
  setIfEmpty(state.visit.customer, "objectAddress", valueFor("objectAddress"));
  setIfEmpty(state.visit.inquiry, "source", valueFor("inquirySource"));
  setIfEmpty(state.visit.inquiry, "ownerStatus", valueFor("ownerStatus"));
  setIfEmpty(state.visit.inquiry, "appointment", valueFor("appointment"));
  setIfEmpty(state.visit, "visitNumber", valueFor("visitNumber"));
  setIfEmpty(state.visit, "visitDate", valueFor("visitDate"));
  setIfEmpty(state.visit, "damageDescription", valueFor("damageDescription"));
  setIfEmpty(state.visit.building, "roomTemp", valueFor("roomTemp"));
  setIfEmpty(state.visit.building, "humidity", valueFor("humidity"));
  state.visit.pipedriveDealFields = {
    customFields: custom,
    customFieldsByName: deal.customFieldsByName || {},
    source: deal.origin || deal.channel || "",
    owner: deal.owner_name || deal.user_id?.name || "",
    stage: deal.stage_name || deal.stage?.name || "",
    status: deal.status || "",
    value: deal.value || ""
  };
  context.contextAppliedAt = context.loadedAt;
  saveState();
}

function pipedriveFieldList(fields, emptyText) {
  const entries = Object.entries(fields || {}).filter(([, value]) => pipedriveValueText(value));
  if (!entries.length) return contextEmpty(emptyText);
  return `<div class="pipedrive-field-list">${entries.map(([label, value]) =>
    `<div><span>${esc(label)}</span><strong>${esc(pipedriveValueText(value))}</strong></div>`
  ).join("")}</div>`;
}

function renderPipedriveFieldDetails() {
  const context = state.visit.recordContext || {};
  if ($("contextPersonFields")) {
    $("contextPersonFields").innerHTML = pipedriveFieldList(
      context.person?.customFieldsByName || state.visit.customer?.pipedriveData?.customFieldsByName,
      "Keine weiteren ausgefüllten Personenfelder vorhanden."
    );
  }
  if ($("contextDealFields")) {
    $("contextDealFields").innerHTML = pipedriveFieldList(
      context.deal?.customFieldsByName || state.visit.pipedriveDealFields?.customFieldsByName,
      "Keine weiteren ausgefüllten Deal-Felder vorhanden."
    );
  }
  if ($("contextLexware")) {
    $("contextLexware").innerHTML = $("contextLexware").innerHTML.replaceAll("Lexware", "Lexoffice");
  }
  if ($("recordContextStatus")) {
    $("recordContextStatus").textContent = $("recordContextStatus").textContent.replaceAll("Lexware", "Lexoffice");
  }
}

function renderVisit() {
  const scrollY = captureVisitScroll();
  applyPipedriveContextToVisit();
  if (!state.visit.visitDate) state.visit.visitDate = todayLocal();
  if (!state.visit.visitNumber) state.visit.visitNumber = createVisitNumber();

  $("visitNumber").value = state.visit.visitNumber;
  $("visitEmployee").value = state.visit.visitEmployee || "";
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
  renderVisitTimeStatus();
  customerFields.forEach(key => $(key).value = state.visit.customer[key] || "");
  if ($("objectAddressDifferent")) $("objectAddressDifferent").checked = Boolean(state.visit.customer.objectAddressDifferent);
  syncObjectAddressFromPostal();
  buildingFields.forEach(key => $(key).value = state.visit.building[key] || "");
  $("damageDescription").value = state.visit.damageDescription || "";
  $("moisturePattern").value = state.visit.moisturePattern || "";
  $("activeWaterIngress").checked = Boolean(state.visit.activeWaterIngress);
  renderInquiryPlanning();
  renderDamageTags();
  $("climateMeasured").checked = Boolean(state.visit.building.climateMeasured);
  toggleClimateFields();
  renderAreas();
  renderVisitDocuments();
  renderMeasureSuggestion();
  updateGeneratedRecommendation();
  renderExtras();
  renderInspectionSummary();
  renderPipedriveFieldDetails();
  bindSpeechButtons();
  applyInputModes();
  updateDewPoint();
  updateMetaBar();
  updateRecordHeader();
  if ($("inquiryPlanningCard")) $("inquiryPlanningCard").open = false;
  restoreVisitScroll(scrollY);
}

buildingFields.forEach(key => {
  const field = $(key);
  if (!field || key === "dewPoint") return;
  const updateBuildingField = () => {
    state.visit.building[key] = field.value;
    saveState();
    updateVisitGuide();
  };
  field.addEventListener(field.tagName === "SELECT" ? "change" : "input", updateBuildingField);
});

function documentSize(bytes) {
  if (!Number(bytes)) return "";
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(bytes / 1024)} KB`;
}

function renderVisitDocuments() {
  state.visit.documents ||= [];
  const box = $("visitDocumentList");
  if (!box) return;
  box.innerHTML = state.visit.documents.length ? state.visit.documents.map(document => `
    <article class="worksite-attachment ${esc(document.uploadStatus || "pending")}">
      <div class="attachment-icon">${document.mimeType === "application/pdf" ? "PDF" : document.mimeType?.startsWith("image/") ? "BILD" : "DATEI"}</div>
      <div class="attachment-main">
        <strong>${esc(document.filename)}</strong>
        <span>${esc(document.category)}${document.note ? ` · ${esc(document.note)}` : ""}</span>
        <small>${esc(documentSize(document.size))}</small>
        <small class="attachment-status">${document.uploadStatus === "uploaded" ? "✓ In Google Drive gespeichert" : document.uploadStatus === "uploading" ? "Wird hochgeladen …" : document.uploadStatus === "error" ? `Upload fehlgeschlagen: ${esc(document.uploadError || "erneuter Versuch folgt")}` : "Wartet auf Upload"}</small>
      </div>
      <div class="attachment-actions">
        ${document.driveUrl ? `<a class="secondary button-link" href="${esc(document.driveUrl)}" target="_blank" rel="noopener">Öffnen</a>` : ""}
        ${document.uploadStatus === "error" ? `<button type="button" class="secondary" data-retry-visit-document="${document.id}">Erneut versuchen</button>` : ""}
        <button type="button" class="danger" data-delete-visit-document="${document.id}">Entfernen</button>
      </div>
    </article>`).join("") : `<div class="empty-mini">Noch keine Pläne oder Dokumente hinterlegt.</div>`;
  box.querySelectorAll("[data-retry-visit-document]").forEach(button => button.onclick = syncPendingVisitDocuments);
  box.querySelectorAll("[data-delete-visit-document]").forEach(button => button.onclick = async () => {
    state.visit.documents = state.visit.documents.filter(document => document.id !== button.dataset.deleteVisitDocument);
    await deleteQueuedVisitDocument(button.dataset.deleteVisitDocument);
    saveState();
    renderVisitDocuments();
  });
}

if ($("addVisitDocuments")) $("addVisitDocuments").onclick = () => $("visitDocumentInput").click();
if ($("visitDocumentInput")) $("visitDocumentInput").onchange = async event => {
  const category = $("visitDocumentCategory").value || "Sonstiges";
  const note = $("visitDocumentNote").value.trim();
  for (const file of [...event.target.files]) await stageVisitDocument(file, category, note);
  event.target.value = "";
  $("visitDocumentNote").value = "";
  renderVisitDocuments();
  syncPendingVisitDocuments();
};
window.addEventListener("drive-document-updated", renderVisitDocuments);

function collectVisit() {
  state.visit.visitDate = $("visitDate").value || todayLocal();
  state.visit.visitEmployee = $("visitEmployee").value.trim();
  state.visit.visitStartTime = $("visitStartTime").value || "";
  state.visit.visitEndTime = $("visitEndTime").value || "";
  state.visit.visitNumber = $("visitNumber").value || createVisitNumber();
  state.visit.visitLatitude = $("visitLatitude").value || "";
  state.visit.visitLongitude = $("visitLongitude").value || "";
  state.visit.visitAccuracy = $("visitAccuracy").value || "";
  state.visit.visitWeather = $("visitWeather").value || "";
  state.visit.visitOutdoorTemp = $("visitOutdoorTemp").value || "";
  state.visit.visitPrecipitation = $("visitPrecipitation").value || "";
  customerFields.forEach(key => state.visit.customer[key] = $(key).value);
  state.visit.customer.objectAddressDifferent = Boolean($("objectAddressDifferent")?.checked);
  syncObjectAddressFromPostal();
  buildingFields.forEach(key => state.visit.building[key] = $(key).value);
  state.visit.damageDescription = $("damageDescription").value;
  state.visit.damageTags ||= [];
  state.visit.moisturePattern = $("moisturePattern").value;
  state.visit.activeWaterIngress = $("activeWaterIngress").checked;
  state.visit.building.climateMeasured = $("climateMeasured").checked;
  state.visit.customerRecommendation = generateRecommendationText();
  state.visit.offerBasis ||= {approved:false,note:"",approvedAt:""};
  if ($("offerBasisNote")) state.visit.offerBasis.note = $("offerBasisNote").value.trim();
}

if ($("offerBasisNote")) $("offerBasisNote").oninput = () => {
  state.visit.offerBasis ||= {approved:false,note:"",approvedAt:""};
  state.visit.offerBasis.note = $("offerBasisNote").value;
  saveState();
};
if ($("offerBasisApproved")) $("offerBasisApproved").onchange = () => {
  state.visit.offerBasis ||= {approved:false,note:"",approvedAt:""};
  if(!visitProtocolReviewed()){
    $("offerBasisApproved").checked=false;
    state.visit.offerBasis.approved=false;
    state.visit.offerBasis.approvedAt="";
    saveState();
    updateVisitGuide();
    showStatus("offerBasisStatus","Bitte zuerst das vollständige Protokoll prüfen.",false);
    return;
  }
  state.visit.offerBasis.approved = $("offerBasisApproved").checked;
  state.visit.offerBasis.approvedAt = state.visit.offerBasis.approved ? new Date().toISOString() : "";
  saveState();
  updateVisitGuide();
  showStatus("offerBasisStatus", state.visit.offerBasis.approved ? "Angebotsgrundlage bestätigt. Du kannst jetzt die Besichtigung abschließen." : "Bestätigung wurde aufgehoben.", state.visit.offerBasis.approved);
};

["inquirySource","inquiryConcern","inquiryMessage","inquiryAppointmentDate","inquiryAppointmentTime"].forEach(id => {
  $(id).onchange = () => {
    collectInquiryPlanning();
    renderInquiryPlanning();
  };
});
$("inquiryAppointmentStatus").onchange = () => {
  collectInquiryPlanning();
  renderInquiryPlanning();
};
document.querySelectorAll("[data-inquiry-urgency]").forEach(button => {
  button.onclick = () => {
    ensureInquiry().urgency = button.dataset.inquiryUrgency;
    saveState();
    renderInquiryPlanning();
  };
});
$("saveInquiryPlanning").onclick = () => {
  const inquiry = collectInquiryPlanning();
  renderInquiryPlanning();
  const missing = [
    !inquiry.source && "Anfragequelle",
    !inquiry.concern && "Anliegen",
    !inquiry.symptoms.length && "mindestens ein gemeldetes Symptom"
  ].filter(Boolean);
  showStatus(
    "inquiryPlanningStatus",
    missing.length
      ? `Zwischengespeichert. Bitte noch ergänzen: ${missing.join(", ")}.`
      : "Anfrage und nächster Schritt wurden gespeichert.",
    missing.length === 0
  );
};
$("startOnsiteVisit").onclick = () => {
  const inquiry = collectInquiryPlanning();
  if (!inquiry.source || !inquiry.concern || !inquiry.symptoms.length) {
    showStatus("inquiryPlanningStatus", "Bitte zuerst Anfragequelle, Anliegen und mindestens ein gemeldetes Symptom erfassen.", false);
    return;
  }
  if (inquiry.appointmentStatus === "scheduled" && inquiry.appointmentDate) {
    state.visit.visitDate = inquiry.appointmentDate;
  } else {
    state.visit.visitDate = todayLocal();
  }
  state.visit.visitStartTime = "";
  state.visit.visitEndTime = "";
  state.visit.guideStep = 0;
  saveState();
  renderVisit();
  $("inquiryPlanningCard").open = false;
  $("visitStep1").open = true;
  $("visitStep1").scrollIntoView({ behavior: "smooth", block: "start" });
  showStatus("visitStatus", "Anfrage vollständig. Jetzt Kundendaten prüfen und die Vor-Ort-Besichtigung durchführen.", true);
};


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
  const scrollY = captureVisitScroll();
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
        <div><label>Wandstärke cm</label><input type="number" inputmode="decimal" min="1" step="0.5" data-area="${area.id}" data-field="wallThickness" value="${esc(area.wallThickness || "")}"></div>
        <div><label>Wandart</label><select data-area="${area.id}" data-field="wallType"><option value="">– bitte auswählen –</option><option ${area.wallType==="Außenwand"?"selected":""}>Außenwand</option><option ${area.wallType==="Innenwand"?"selected":""}>Innenwand</option></select></div>
        <div><label>Erdkontakt</label><select data-area="${area.id}" data-field="earthContact"><option value="">– bitte auswählen –</option><option ${area.earthContact==="erdberührt"?"selected":""}>erdberührt</option><option ${area.earthContact==="nicht erdberührt"?"selected":""}>nicht erdberührt</option></select></div>
        <div><label>Wandbelag</label><select data-area="${area.id}" data-field="wallCover">${["","Putz","Farbe","Tapete","Fliesen","Unbekannt","Sonstiges"].map(v => `<option ${area.wallCover===v?"selected":""}>${v}</option>`).join("")}</select></div>
      </div>
      <label>Notizen</label><div class="speech-row"><textarea id="area-note-${area.id}" data-area="${area.id}" data-field="notes">${esc(area.notes)}</textarea><button class="speech" data-speech-target="area-note-${area.id}">🎤</button></div>
      <h3>Feuchtemessung</h3>
      <div class="grid">
        <div><label>Referenzwert „trocken“</label><input data-area="${area.id}" data-field="dryReference" value="${esc(area.dryReference || "")}"></div>
      </div>
      <h3>Messpunkte</h3><div id="measurements-${area.id}"></div><button class="secondary" data-add-measurement="${area.id}">+ Messpunkt</button>
      <h3>Maßnahmen</h3><div id="measures-${area.id}"></div><button class="secondary" data-add-measure="${area.id}">+ Maßnahme</button>
      <h3>Fotos</h3>
      <div class="visit-photo-actions">
        <label class="secondary photo-upload-button">Foto aufnehmen
          <input class="hidden" type="file" accept="image/*" capture="environment" data-photo-area="${area.id}">
        </label>
        <label class="secondary photo-upload-button">Bilder auswählen
          <input class="hidden" type="file" accept="image/*" multiple data-photo-area="${area.id}">
        </label>
      </div>
      <div id="photos-${area.id}" class="photo-grid"></div>`;
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
    const previousDevice = area.measurements.at(-1)?.device
      || state.visit.areas.flatMap(item => item.measurements || []).find(item => item.device)?.device
      || "";
    area.measurements.push({ id: crypto.randomUUID(), device:previousDevice,value:"",unit:"Digits",height:"",location:"" });
    saveState(); renderAreas();
  });

  box.querySelectorAll("[data-add-measure]").forEach(button => button.onclick = () => {
    const area = state.visit.areas.find(item => item.id === button.dataset.addMeasure);
    area.measures.push({
      id:crypto.randomUUID(),
      type:"",
      length:"",
      width:"",
      height:"",
      wall:area.wallThickness||"",
      spacing:"",
      resinHolesPerMeter:15,
      resinIncludedKgPerMeter:4,
      resinTotalKg:"",
      note:""
    });
    saveState(); updateGeneratedRecommendation(); renderAreas();
  });

  box.querySelectorAll("[data-photo-area]").forEach(input => input.onchange = async event => {
    const area = state.visit.areas.find(item => item.id === input.dataset.photoArea);
    for (const file of [...event.target.files]) await stageVisitPhoto(file, area);
    renderAreas();
    syncPendingVisitPhotos();
    event.target.value = "";
  });

  bindSpeechButtons();
  applyInputModes(box);
  restoreVisitScroll(scrollY);
}

function renderMeasurements(area) {
  const box = $(`measurements-${area.id}`);
  area.measurements.forEach(measurement => measurement.unit = "Digits");
  box.innerHTML = area.measurements.map(m => `
    <div class="sub-card item-grid">
      <div class="wide"><label>Messgerät</label><select data-mid="${m.id}" data-mf="device">
        <option value="">– bitte auswählen –</option>
        <option value="Gann Hydromette Compact B" ${m.device === "Gann Hydromette Compact B" ? "selected" : ""}>Gann Hydromette Compact B</option>
        <option value="Trotec Mikrowellenmessgerät" ${m.device === "Trotec Mikrowellenmessgerät" ? "selected" : ""}>Trotec Mikrowellenmessgerät</option>
      </select></div>
      <div><label>Messwert</label><input type="number" inputmode="decimal" step="1" data-mid="${m.id}" data-mf="value" value="${esc(m.value)}"></div>
      <div><label>Einheit</label><input value="Digits" readonly aria-label="Einheit Digits"></div>
      <div><label>Messhöhe cm</label><input type="number" inputmode="decimal" step="1" data-mid="${m.id}" data-mf="height" value="${esc(m.height)}"></div>
      <div><label>Messstelle / Position</label><input data-mid="${m.id}" data-mf="location" value="${esc(m.location)}" placeholder="z. B. Nordwand unten"></div>
      <button class="danger" data-delete-measurement="${m.id}">Löschen</button>
    </div>`).join("");

  box.querySelectorAll("[data-mf]").forEach(input => {
    const eventName = input.tagName === "SELECT" ? "onchange" : "oninput";
    input[eventName] = () => {
      const measurement = area.measurements.find(item => item.id === input.dataset.mid);
      measurement[input.dataset.mf] = input.value;
      measurement.unit = "Digits";
      saveState();
      updateVisitGuide();
    };
  });

  box.querySelectorAll("[data-delete-measurement]").forEach(button => button.onclick = () => {
    area.measurements = area.measurements.filter(item => item.id !== button.dataset.deleteMeasurement);
    saveState();
    renderAreas();
  });
  saveState();
}

function renderMeasures(area) {
  const box = $(`measures-${area.id}`);
  box.innerHTML = area.measures.map(m => `
    <div class="sub-card item-grid">
      <div class="wide"><label>Maßnahme</label><select data-measure="${m.id}" data-mfield="type">${["","Horizontalsperre","Flächensperre","Harzverpressung","Wand-Sohlen-Anschluss"].map(v=>`<option ${m.type===v?"selected":""}>${v}</option>`).join("")}</select></div>
      <div><label>Wandstärke cm</label><input type="number" inputmode="decimal" min="1" step="0.5" data-measure="${m.id}" data-mfield="wall" value="${esc(m.wall || "")}"></div>
      ${m.type==="Flächensperre" ? `<div><label>Breite m</label><input data-measure="${m.id}" data-mfield="width" value="${m.width}"></div><div><label>Höhe m</label><input data-measure="${m.id}" data-mfield="height" value="${m.height}"></div>` : `<div><label>Länge lfm</label><input data-measure="${m.id}" data-mfield="length" value="${m.length}"></div>`}
      ${m.type==="Harzverpressung" ? `
        <div><label>Bohrlöcher je lfm (10–20)</label><input type="number" min="10" max="20" step="1" data-measure="${m.id}" data-mfield="resinHolesPerMeter" value="${m.resinHolesPerMeter||15}"></div>
        <div><label>Enthaltenes Harz je lfm (3–5 kg)</label><select data-measure="${m.id}" data-mfield="resinIncludedKgPerMeter"><option value="3" ${Number(m.resinIncludedKgPerMeter||4)===3?"selected":""}>3 kg</option><option value="4" ${Number(m.resinIncludedKgPerMeter||4)===4?"selected":""}>4 kg</option><option value="5" ${Number(m.resinIncludedKgPerMeter||4)===5?"selected":""}>5 kg</option></select></div>
        <div><label>Tatsächlicher Harzverbrauch gesamt kg</label><input type="number" min="0" step=".1" data-measure="${m.id}" data-mfield="resinTotalKg" value="${m.resinTotalKg||""}"></div>` : ""}
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
    <div class="photo-card">
      <img src="${localPhotoUrl(photo)}" ${photo.driveFileId ? `data-drive-file="${esc(photo.driveFileId)}"` : ""} alt="${esc(photo.caption || area.name || "Besichtigungsfoto")}">
      <small class="photo-upload-state ${esc(photo.uploadStatus || "local")}">${photo.uploadStatus === "uploaded" ? "✓ In Google Drive gespeichert" : photo.uploadStatus === "uploading" ? "Wird hochgeladen …" : photo.uploadStatus === "error" ? "Upload fehlgeschlagen – wird erneut versucht" : "Wartet auf Upload"}</small>
      <input data-photo="${photo.id}" value="${esc(photo.caption)}" placeholder="z. B. Keller – Außenwand – Messstelle 1">
      <label><input type="checkbox" data-photo-show="${photo.id}" ${photo.show?"checked":""}> Kundenansicht</label>
      <button class="danger" data-delete-photo="${photo.id}">Löschen</button>
    </div>`).join("");
  hydrateDrivePhotoImages(box);
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

window.addEventListener("drive-photo-updated", () => {
  (state.visit.areas || []).forEach(area => {
    if ($(`photos-${area.id}`)) renderPhotos(area);
  });
});

$("addArea").onclick = () => { state.visit.areas.push(createArea("")); saveState(); renderAreas(); };
$("moisturePattern").onchange = () => {
  state.visit.moisturePattern = $("moisturePattern").value;
  saveState();
  renderMeasureSuggestion();
  updateVisitGuide();
};
$("activeWaterIngress").onchange = () => {
  state.visit.activeWaterIngress = $("activeWaterIngress").checked;
  saveState();
  renderMeasureSuggestion();
};
$("checkMeasureSuggestion").onclick = () => {
  collectVisit();
  saveState();
  renderMeasureSuggestion();
};
$("acceptMeasureSuggestion").onclick = () => {
  const type = $("acceptMeasureSuggestion").dataset.suggestedMeasure;
  if (!type) return;
  const area = state.visit.areas[0];
  if (!area) return renderMeasureSuggestion();
  if (!(area.measures || []).some(measure => measure.type === type)) {
    area.measures.push({
      id:crypto.randomUUID(), type, length:"", width:"", height:"",
      wall:area.wallThickness || "",
      spacing:"",
      resinHolesPerMeter:15,
      resinIncludedKgPerMeter:4,
      resinTotalKg:"",
      note:"Fachlich vor Ort bestätigt"
    });
  }
  saveState();
  renderAreas();
  updateGeneratedRecommendation();
  updateVisitGuide();
  $("measureSuggestion").textContent = `${type} wurde als bestätigte Maßnahme übernommen. Mengen und Ausführung bitte im Schadensbereich ergänzen.`;
  $("acceptMeasureSuggestion").classList.add("hidden");
};

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
    applyPipedrivePerson(detail.person);
    saveState(); renderVisit();
  } catch (error) { alert(error.message); }
}
async function chooseLexware() {
  if (!hasConnectionConfig()) return show("settings");
  const term = prompt("Lexoffice-Kunde suchen: Name, E-Mail oder Kundennummer");
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

function offerItemKey(item, index) {
  return [
    item.kind || "item",
    item.areaName || "",
    item.name || "",
    item.linkedToMeasure || "",
    index
  ].join("|");
}

function money(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function offerUnitPrice(value) {
  return Number(Number(value).toFixed(4));
}

function reviewedOffer(result) {
  state.visit.offerDraft ||= { items:{}, approved:false, approvedAt:"" };
  state.visit.offerDraft.items ||= {};
  const adjustmentFactor = result.baseGross > 0 ? result.offerGross / result.baseGross : 1;
  const items = result.lineItems.map((item, index) => {
    const key = offerItemKey(item, index);
    const saved = state.visit.offerDraft.items[key] || {};
    const quantity = item.pricingMode === "flat" ? 1 : Number(item.quantity);
    const calculatedUnitGross = item.pricingMode === "flat"
      ? Number(item.totalGross) * adjustmentFactor
      : Number(item.grossUnit) * adjustmentFactor;
    const hasManualUnitPrice = saved.unitGross !== undefined
      && saved.unitGross !== null
      && saved.unitGross !== ""
      && Number.isFinite(Number(saved.unitGross));
    const unitGross = hasManualUnitPrice
      ? Number(saved.unitGross)
      : offerUnitPrice(calculatedUnitGross);
    const included = saved.included !== false;
    const calculatedTotalGross = item.pricingMode === "flat"
      ? Number(item.totalGross) * adjustmentFactor
      : Number(item.totalGross) * adjustmentFactor;
    return {
      ...item,
      key,
      quantity,
      unitGross,
      included,
      // Solange der Preis nicht bewusst geändert wurde, bleibt die bereits
      // centgenau kalkulierte Positionssumme maßgeblich. So kann die Anzeige
      // eines gerundeten Einzelpreises den Endbetrag nicht verändern.
      reviewedTotal: included
        ? money(hasManualUnitPrice ? quantity * unitGross : calculatedTotalGross)
        : 0
    };
  });
  return {
    items,
    totalGross: money(items.reduce((sum,item)=>sum+item.reviewedTotal,0))
  };
}

function renderOfferPositionReview(result) {
  const box = $("offerPositionReview");
  if (!box) return;
  const review = reviewedOffer(result);
  box.innerHTML = review.items.length ? review.items.map(item => `
    <div class="offer-position-row" data-offer-position="${esc(item.key)}">
      <label title="Position übernehmen"><input type="checkbox" data-offer-include="${esc(item.key)}" ${item.included?"checked":""}></label>
      <div class="offer-position-name"><strong>${esc(item.areaName?`${item.areaName} – `:"")}${esc(item.name)}</strong><small>${esc(item.scope || item.description || "")}</small></div>
      <div class="offer-quantity-field"><label>Menge</label><input value="${num(item.quantity)}" readonly></div>
      <div class="offer-unit-field"><label>Einzelpreis brutto</label><input type="number" inputmode="decimal" step=".0001" min="0" data-offer-price="${esc(item.key)}" value="${offerUnitPrice(item.unitGross)}"></div>
      <div class="offer-total-field"><label>Gesamt brutto</label><input value="${eur(item.reviewedTotal)}" readonly></div>
    </div>`).join("") + `<div class="offer-review-total"><span>Geprüfte Angebotssumme</span><strong>${eur(review.totalGross)}</strong></div>` : `<div class="status err">Es wurden noch keine kalkulierbaren Positionen ermittelt.</div>`;
  box.querySelectorAll("[data-offer-include]").forEach(input => input.onchange = () => {
    const key=input.dataset.offerInclude;
    state.visit.offerDraft.items[key] = {...(state.visit.offerDraft.items[key]||{}),included:input.checked};
    state.visit.offerDraft.approved=false;
    saveState(); setTimeout(renderOffer,0);
  });
  box.querySelectorAll("[data-offer-price]").forEach(input => input.onchange = () => {
    const key=input.dataset.offerPrice,price=Math.max(0,parseDecimal(input.value));
    state.visit.offerDraft.items[key] = {...(state.visit.offerDraft.items[key]||{}),unitGross:price};
    state.visit.offerDraft.approved=false;
    saveState(); setTimeout(renderOffer,0);
  });
  if ($("offerPositionsApproved")) $("offerPositionsApproved").checked=Boolean(state.visit.offerDraft.approved);
  if ($("sendLexware")) $("sendLexware").disabled=!state.visit.offerDraft.approved || !review.items.some(item=>item.included);
  if ($("lexofficeRequirementHint")) {
    $("lexofficeRequirementHint").textContent = state.visit.lexwareQuotationId
      ? "Der Entwurf wurde bereits an Lexoffice übertragen."
      : state.visit.offerDraft.approved
        ? "Freigabe vollständig – der Entwurf kann jetzt übertragen werden."
        : "Die Übertragung wird aktiv, sobald die Prüfung bestätigt wurde.";
  }
}

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
  const review = reviewedOffer(result);
  $("offerGross").textContent = eur(review.totalGross);
  renderLegalPriceOptions(result.baseGross, strategies.minimum.baseGross);
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
  $("internalCalc").innerHTML = result.lineItems.map(item => {
    const technicalDetails = item.type === "Harzverpressung"
      ? `<div class="metric"><span>Bohrlöcher</span><strong>${item.holes}</strong></div>
         <div class="metric"><span>Harz im Grundpreis enthalten</span><strong>${num(item.resinIncludedKg)} kg</strong></div>
         <div class="metric"><span>Tatsächlicher Harzverbrauch</span><strong>${num(item.resinTotalKg)} kg</strong></div>
         <div class="metric"><span>Zusätzlich abzurechnen</span><strong>${num(item.resinExtraKg)} kg</strong></div>
         <div class="metric"><span>Arbeitszeit</span><strong>${num(item.hours)} Std.</strong></div>`
      : item.holes !== undefined
        ? `<div class="metric"><span>Bohrlöcher</span><strong>${item.holes}</strong></div>
           <div class="metric"><span>HZ inkl. Reserve</span><strong>${item.saleLiters} l</strong></div>
           ${Number(item.hsKg)>0?`<div class="metric"><span>BKM HS Sperrmörtel</span><strong>${num(item.hsKg)} kg</strong></div>`:""}
           ${item.smallJobIntegrated?`<div class="metric"><span>Kleinmengenaufschlag integriert</span><strong>${eur(item.smallJobSurchargePerUnit)} je ${esc(item.unitName)}</strong></div>`:""}
           <div class="metric"><span>Arbeitszeit</span><strong>${num(item.hours)} Std.</strong></div>`
        : "";
    return `<div class="result"><strong>${esc(item.areaName?`${item.areaName} – `:"")}${esc(item.name)}</strong><div class="metric"><span>Umfang</span><strong>${esc(item.scope || `${num(item.quantity)} ${item.unitName}`)}</strong></div>${technicalDetails}<div class="metric"><span>Preis je ${esc(item.unitName)}</span><strong>${eur(item.grossUnit)}</strong></div><div class="metric"><span>Gesamt brutto</span><strong>${eur(item.totalGross)}</strong></div></div>`;
  }).join("") + `<div class="metric"><span>Materialkosten netto</span><strong>${eur(result.materialCostNet)}</strong></div><div class="metric"><span>Deckungsbeitrag vor sonstigen Betriebskosten</span><strong>${eur(result.contributionBeforeOtherCosts)}</strong></div>`;
  renderOfferPositionReview(result);
  const archiveStatus = $("offerArchiveStatus")?.value || currentRecord?.status || "draft";
  const accepted = ["accepted","completed"].includes(archiveStatus);
  if ($("createWorksite")) $("createWorksite").disabled = !accepted;
  if ($("worksiteCreateHint")) {
    $("worksiteCreateHint").textContent = accepted
      ? "Das Angebot ist angenommen. Die Baustelle kann jetzt angelegt werden."
      : "Die Baustelle kann erst angelegt werden, wenn das Angebot den Status „Angenommen“ hat.";
  }
  return result;
}

function legalPricePreview(regularGross, discountPercent) {
  const gross = Math.max(0, Number(regularGross) || 0);
  const percent = Math.max(0, Math.min(100, Number(discountPercent) || 0));
  const discountedGross = gross * (1 - percent / 100);
  return {
    gross,
    net: gross / 1.19,
    vat: gross - gross / 1.19,
    percent,
    discountedGross
  };
}

function renderLegalPriceOptions(regularGross, minimumGross) {
  if (!$("legalRegularGross")) return;
  const selectedPercent = state.discount.specialType === "percent" ? Number(state.discount.specialValue || 0) : 0;
  const preview = legalPricePreview(regularGross, selectedPercent);
  $("legalRegularGross").textContent = eur(preview.gross);
  $("legalVatAmount").textContent = eur(preview.vat);
  $("legalNetAmount").textContent = eur(preview.net);
  $("legalDiscountedGross").textContent = eur(preview.discountedGross);
  const warning = $("legalPriceWarning");
  if (!warning) return;
  const belowMinimum = preview.percent > 0 && preview.discountedGross < Number(minimumGross || 0);
  warning.className = `status ${belowMinimum ? "err" : preview.percent > 0 ? "ok" : ""}`;
  warning.textContent = belowMinimum
    ? `Achtung: Der neue Preis liegt ${eur(Number(minimumGross || 0) - preview.discountedGross)} unter deiner internen Preisuntergrenze von ${eur(minimumGross)}.`
    : preview.percent > 0
      ? `Offizieller Rabatt: ${num(preview.percent)} %. Der neue Preis wird ordnungsgemäß brutto und mit Rechnung angeboten.`
      : "Keine Preisreduzierung ausgewählt.";
}

["skontoType","skontoCustom","specialType","specialValue","specialLabel"].forEach(id => {
  $(id).oninput = () => {
    state.discount.skontoType = $("skontoType").value;
    state.discount.skontoCustom = parseDecimal($("skontoCustom").value);
    state.discount.specialType = $("specialType").value;
    state.discount.specialValue = parseDecimal($("specialValue").value);
    state.discount.specialLabel = $("specialLabel").value;
    state.visit.offerDraft = {items:{},approved:false,approvedAt:""};
    saveState(); renderOffer();
  };
});

document.querySelectorAll("[data-pricing-tier]").forEach(button => {
  button.onclick = () => {
    state.discount.pricingTier = button.dataset.pricingTier;
    state.visit.offerDraft = {items:{},approved:false,approvedAt:""};
    saveState();
    renderOffer();
  };
});
$("resetOfferPositions").onclick = () => {
  state.visit.offerDraft = {items:{},approved:false,approvedAt:""};
  saveState(); renderOffer();
  showStatus("offerReviewStatus","Die automatisch berechneten Positionen wurden wiederhergestellt.",true);
};
$("offerPositionsApproved").onchange = () => {
  state.visit.offerDraft ||= {items:{},approved:false,approvedAt:""};
  state.visit.offerDraft.approved=$("offerPositionsApproved").checked;
  state.visit.offerDraft.approvedAt=state.visit.offerDraft.approved?new Date().toISOString():"";
  saveState(); setTimeout(renderOffer,0);
  showStatus("offerReviewStatus",state.visit.offerDraft.approved?"Angebotspositionen sind geprüft und freigegeben.":"Freigabe wurde aufgehoben.",state.visit.offerDraft.approved);
};
$("deductInventory").onclick = deductCurrentOrderInventory;
$("toggleInternal").onclick = () => $("internalCalc").classList.toggle("hidden");

function buildCustomerSnapshot() {
  updateGeneratedRecommendation();
  const result = renderOffer();
  const reviewed = reviewedOffer(result);
  const visibleItems = reviewed.items.filter(item=>item.included);
  const measures = visibleItems.filter(item => item.kind === "measure").map(item => {
    const article = state.settings.lexwareArticles.find(a => a.id === item.articleId);
    return {
      areaName: item.areaName,
      title: article?.title || item.name,
      description: article?.description || item.description || "",
      scope: item.scope
    };
  });
  const extras = visibleItems.filter(item => item.kind !== "measure" && !item.hiddenToCustomer).map(item => {
    const article = state.settings.lexwareArticles.find(a => a.id === item.articleId);
    return { title:article?.title||item.name, description:article?.description||item.description||"", quantity:item.quantity, unitName:article?.unitName||item.unitName };
  });
  const photos = state.visit.areas.flatMap(area => area.photos.filter(p => p.show).map(p => ({ areaName:area.name, src:localPhotoUrl(p), caption:p.caption })));
  return {
    customerName:[state.visit.customer.salutation,state.visit.customer.firstName,state.visit.customer.lastName].filter(Boolean).join(" "),
    company:state.visit.customer.company,
    address:state.visit.customer.objectAddress || [state.visit.customer.street,state.visit.customer.zip,state.visit.customer.city].filter(Boolean).join(", "),
    recommendation:state.visit.customerRecommendation,
    measures, extras, photos,
    normalGross:reviewed.totalGross,
    specialLabel:state.discount.specialLabel,
    specialAmount:result.specialAmount,
    offerGross:reviewed.totalGross,
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
  if (!state.visit.offerDraft?.approved) {
    throw new Error("Bitte Positionen, Mengen und Preise zuerst prüfen und freigeben.");
  }
  const lineItems = reviewedOffer(result).items
    .filter(item => !item.hiddenToCustomer && item.included)
    .filter(item => Number(item.quantity) > 0 && Number(item.unitGross) >= 0)
    .map((item, index) => {
      const article = state.settings.lexwareArticles.find(a => a.id === item.articleId);

      const quantity = item.pricingMode === "flat"
        ? 1
        : Number(Number(item.quantity).toFixed(1));

      const unitName = item.pricingMode === "flat"
        ? (article?.unitName || item.unitName || "pauschal")
        : (article?.unitName || item.unitName || "Stück");

      // Lexoffice accepts unit prices with up to four decimal places. Keeping
      // that precision prevents cent differences between a calculated line
      // total and quantity × unit price (for example 5 × 265.514 €).
      const adjustedUnitGross = offerUnitPrice(item.unitGross);
      const name = String(article?.title || item.name || `Position ${index + 1}`).trim().slice(0, 255);
      const description = String(article?.description || item.description || "");
      if (description.length > 2000) {
        throw new Error(`Die Beschreibung der Position „${name}“ ist mit ${description.length} Zeichen zu lang. Erlaubt sind höchstens 2.000 Zeichen.`);
      }
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
  const customer = state.visit.customer || {};
  const customerName = [customer.firstName, customer.lastName].filter(Boolean).join(" ").trim();
  const salutationValue = String(customer.salutation || "").toLocaleLowerCase("de-DE");
  const salutation = salutationValue.includes("frau")
    ? `Sehr geehrte Frau ${customer.lastName || customerName}`.trim()
    : salutationValue.includes("herr")
      ? `Sehr geehrter Herr ${customer.lastName || customerName}`.trim()
      : customer.company
        ? "Sehr geehrte Damen und Herren"
        : customerName
          ? `Guten Tag ${customerName}`
          : "Sehr geehrte Damen und Herren";
  const objectAddress = customer.objectAddress
    || [customer.street, customer.zip, customer.city].filter(Boolean).join(", ")
    || "der angegebenen Objektanschrift";
  const includesHz250 = lineItems.some(item =>
    `${item.name} ${item.description}`.toLocaleLowerCase("de-DE")
      .includes("hz 250")
    || `${item.name} ${item.description}`.toLocaleLowerCase("de-DE")
      .includes("hz-250")
  );
  const standardIntroduction = DEFAULTS.settings.offerTexts?.introduction || "";
  const introductionTemplate = state.settings.offerTexts?.introduction || standardIntroduction;
  const introduction = introductionTemplate
    .replaceAll("{{ANREDE}}", salutation)
    .replaceAll("{{OBJEKTANSCHRIFT}}", objectAddress)
    .replaceAll(
      "{{HZ_VOC_VORTEIL}}",
      includesHz250 ? "– BKM HZ 250 PRO enthält 0 % flüchtige organische Verbindungen (VOC)" : ""
    )
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  const executionNotices = buildExecutionNotices(
    state.settings,
    state.visit
  );
  const remark = executionNotices
    .map(notice => {
      if (executionNotices.length === 1) return notice.text;
      return `${notice.title}\n${notice.text}`;
    })
    .join("\n\n")
    .trim();
  if (introduction.length > 2000) {
    throw new Error(`Die Angebotseinleitung ist mit ${introduction.length} Zeichen zu lang. Erlaubt sind höchstens 2.000 Zeichen. Bitte unter Einstellungen kürzen.`);
  }
  if (remark.length > 2000) {
    throw new Error(`Die Nachbemerkung ist mit ${remark.length} Zeichen zu lang. Erlaubt sind höchstens 2.000 Zeichen. Bitte die Hinweistexte unter Einstellungen kürzen.`);
  }
  return {
    customer,
    quotation: {
      lineItems,
      introduction,
      remark,
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

    console.info("Lexoffice Angebotspositionen\n" + preview);

    const response = await createLexwareQuotation(payload);
    if (response.contactId) state.visit.customer.lexwareContactId = response.contactId;
    if (response.quotationId) state.visit.lexwareQuotationId = response.quotationId;
    saveState();
    if ($("offerArchiveStatus")) $("offerArchiveStatus").value = "lexoffice-draft";
    saveCurrentToArchive(false);
    try {
      await syncVisitDeal("offerSent", {
        offerNumber: response.voucherNumber || response.quotationNumber || "",
        offerDate: todayLocal(),
        offerValue: reviewedOffer(renderOffer()).totalGross,
        note: `Lexoffice-Angebot ${esc(response.voucherNumber || response.quotationId || "")} wurde als Entwurf erstellt.`
      });
      showStatus("offerStatus","Entwurf wurde an Lexoffice übertragen, archiviert und mit Pipedrive synchronisiert.",true);
    } catch(syncError) {
      addSyncLog("Angebot",false,syncError.message);
      showStatus("offerStatus",`Lexoffice-Entwurf wurde erstellt. Pipedrive-Synchronisation fehlgeschlagen: ${syncError.message}`,false);
    }
  } catch (error) {
    showStatus("offerStatus",error.message,false);
  }
};

function buildReport() {
  let html = `<div class="report-section"><h2>Kunde und Objekt</h2><table class="report-table"><tr><th>Kunde</th><td>${esc([state.visit.customer.salutation,state.visit.customer.firstName,state.visit.customer.lastName].filter(Boolean).join(" "))}</td></tr><tr><th>Besichtigungsnummer</th><td>${esc(state.visit.visitNumber || "")}</td></tr><tr><th>Besichtigungsdatum</th><td>${esc(state.visit.visitDate || "")}</td></tr><tr><th>Beginn</th><td>${esc(state.visit.visitStartTime || "")}</td></tr><tr><th>Ende</th><td>${esc(state.visit.visitEndTime || "")}</td></tr><tr><th>Dauer</th><td>${esc($("visitDuration")?.value || "")}</td></tr>${state.visit.visitLatitude?`<tr><th>GPS-Standort</th><td>${esc(state.visit.visitLatitude)}, ${esc(state.visit.visitLongitude)} (${esc(state.visit.visitAccuracy)})</td></tr>`:""}${state.visit.visitWeather?`<tr><th>Wetter</th><td>${esc(state.visit.visitWeather)}, ${esc(state.visit.visitOutdoorTemp)} °C, Niederschlag ${esc(state.visit.visitPrecipitation)} mm</td></tr>`:""}<tr><th>Objekt</th><td>${esc(state.visit.customer.objectAddress || [state.visit.customer.street,state.visit.customer.zip,state.visit.customer.city].filter(Boolean).join(", "))}</td></tr><tr><th>Baujahr</th><td>${esc(state.visit.building.yearBuilt)}</td></tr><tr><th>Bauart</th><td>${esc(state.visit.building.buildingType)}</td></tr><tr><th>Fundamentart</th><td>${esc(state.visit.building.foundationType)}</td></tr>${state.visit.building.climateMeasured?`<tr><th>Raumtemperatur</th><td>${esc(state.visit.building.roomTemp)} °C</td></tr><tr><th>Luftfeuchtigkeit</th><td>${esc(state.visit.building.humidity)} %</td></tr><tr><th>Oberflächentemperatur</th><td>${esc(state.visit.building.surfaceTemp)} °C</td></tr><tr><th>Taupunkt</th><td>${esc(state.visit.building.dewPoint)} °C</td></tr>`:""}</table></div>`;
  updateGeneratedRecommendation();
  html += `<div class="report-section"><h2>Schadensbild</h2><p>${esc(damageDescriptionText())}</p><h2>Empfehlung</h2><p>${esc(state.visit.customerRecommendation)}</p></div>`;
  for (const area of state.visit.areas) {
    html += `<div class="report-section"><h2>${esc(area.name)}</h2><table class="report-table"><tr><th>Wandmaterial</th><td>${esc(area.wallMaterialOther||area.wallMaterial)}</td></tr><tr><th>Wandstärke</th><td>${esc(area.wallThickness)} cm</td></tr><tr><th>Erdkontakt</th><td>${esc(area.earthContact)}</td></tr></table><h3>Feuchtemessung</h3><table class="report-table"><tr><th>Referenzwert trocken</th><td>${esc(area.dryReference || "")} Digits</td></tr></table><h3>Messpunkte</h3><table class="report-table"><tr><th>Gerät</th><th>Messwert</th><th>Höhe</th><th>Position</th></tr>${area.measurements.map(m=>`<tr><td>${esc(m.device)}</td><td>${esc(m.value)} ${esc(m.unit)}</td><td>${esc(m.height)}</td><td>${esc(m.location)}</td></tr>`).join("")}</table><h3>Maßnahmen</h3><table class="report-table">${area.measures.map(m=>{const r=calculateMeasure(state.settings,m);return `<tr><th>${esc(m.type)}</th><td>${esc(r.scope)}</td></tr>`}).join("")}</table><div class="photo-grid">${area.photos.filter(p=>p.show).map(p=>`<div class="photo-card"><img src="${localPhotoUrl(p)}"><p>${esc(p.caption)}</p></div>`).join("")}</div></div>`;
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
    const pdf=await createVisitPdf(state.visit, state.settings);
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
  renderDashboardInventory();
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
          <div><label>Hersteller optional</label><input data-inventory-id="${product.id}" data-inventory-field="manufacturer" value="${esc(product.manufacturer || "")}"></div>
          <div class="full switch-row"><label><input type="checkbox" data-inventory-id="${product.id}" data-inventory-check="chargeTracking" ${product.chargeTracking ? "checked" : ""}> Chargennummer im Arbeitsnachweis erfassen</label></div>
          <div class="full switch-row"><label><input type="checkbox" data-inventory-id="${product.id}" data-inventory-check="shelfLifeTracking" ${product.shelfLifeTracking ? "checked" : ""}> Mindesthaltbarkeitsdatum erfassen</label></div>
          <div class="full switch-row"><label><input type="checkbox" data-inventory-id="${product.id}" data-inventory-check="serialTracking" ${product.serialTracking ? "checked" : ""}> Seriennummer erfassen</label></div>
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

    box.querySelectorAll("[data-inventory-check]").forEach(input => {
      input.onchange = () => {
        const product = inventory.products.find(item => item.id === input.dataset.inventoryId);
        product[input.dataset.inventoryCheck] = input.checked;
        saveState();
        renderInventorySettings();
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
  const sync=state.settings.pipedriveSync ||= {autoSync:true,fields:[],stages:[],fieldMappings:{},stageMappings:{},log:[],personFields:[],personFieldMappings:{postalAddress:"",objectAddress:""}};
  $("pipedriveAutoSync").checked=sync.autoSync !== false;
  sync.personFields ||= [];
  sync.personFieldMappings ||= {postalAddress:"",objectAddress:""};
  const personDefinitions = [
    ["postalAddress", "Postanschrift"],
    ["objectAddress", "Objektanschrift"]
  ];
  const personBox = $("pipedrivePersonFieldMappings");
  if (personBox) {
    personBox.innerHTML = personDefinitions.map(([key,label]) => `
      <div class="mapping-item"><label>${esc(label)}</label><select data-person-field-mapping="${key}">${mappingOptions(sync.personFields,sync.personFieldMappings?.[key],"name","key")}</select>${sync.personFieldMappings?.[key]?`<small>${esc(sync.personFields.find(f=>f.key===sync.personFieldMappings[key])?.type||"")}</small>`:""}</div>`).join("");
    personBox.querySelectorAll("[data-person-field-mapping]").forEach(select => select.onchange = () => {
      sync.personFieldMappings[select.dataset.personFieldMapping] = select.value;
      saveState();
      renderPipedriveSyncSettings();
    });
  }
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
    const [fieldData,personFieldData,stageData]=await Promise.all([loadPipedriveDealFields(),loadPipedrivePersonFields(),loadPipedriveStages()]);
    const sync=state.settings.pipedriveSync ||= {};
    sync.fields=fieldData.fields||[];
    sync.personFields=personFieldData.fields||[];
    sync.stages=stageData.stages||[];
    sync.personFieldMappings ||= {postalAddress:"",objectAddress:""};
    const normalizeName = value => String(value||"").trim().toLocaleLowerCase("de-DE");
    const findPersonField = names => sync.personFields.find(field => names.includes(normalizeName(field.name)))?.key || "";
    if (!sync.personFieldMappings.postalAddress) sync.personFieldMappings.postalAddress = findPersonField(["postanschrift","postal address"]);
    if (!sync.personFieldMappings.objectAddress) sync.personFieldMappings.objectAddress = findPersonField(["objektanschrift","objektadresse","object address"]);
    sync.fieldMappings={...autoMapFields(sync.fields),...(sync.fieldMappings||{})};
    sync.stageMappings={...autoMapStages(sync.stages),...(sync.stageMappings||{})};
    saveState(); renderPipedriveSyncSettings();
    showStatus("pipedriveSchemaStatus",`${sync.personFields.length} Personenfelder, ${sync.fields.length} Deal-Felder und ${sync.stages.length} Dealphasen geladen. Bitte Zuordnung kontrollieren.`,true);
  } catch(error) { addSyncLog("Schema",false,error.message); renderPipedriveSyncSettings(); showStatus("pipedriveSchemaStatus",error.message,false); }
}

const DOCUMENT_PROFILE_FIELDS = {
  docBusinessName: "businessName",
  docOwnerName: "ownerName",
  docStreet: "street",
  docZip: "zip",
  docCity: "city",
  docRegionalOfficeLabel: "regionalOfficeLabel",
  docRegionalOfficeStreet: "regionalOfficeStreet",
  docRegionalOfficeZip: "regionalOfficeZip",
  docRegionalOfficeCity: "regionalOfficeCity",
  docPhone: "phone",
  docEmail: "email",
  docWebsite: "website",
  docBankName: "bankName",
  docIban: "iban",
  docBic: "bic",
  docVatId: "vatId",
  docTaxNumber: "taxNumber",
  docTradeLine: "tradeLine",
  docServiceLine: "serviceLine",
  docTagline: "tagline",
  docDocumentSubtitle: "documentSubtitle"
};

function renderSettings() {
  migrateWorkerUrl();
  const s = state.settings;
  const documentProfile = getDocumentProfile(s);
  s.documentProfile = { ...documentProfile };
  Object.entries(DOCUMENT_PROFILE_FIELDS).forEach(([id, key]) => {
    if ($(id)) $(id).value = documentProfile[key] || "";
  });
  if ($("documentLogoPreview")) {
    $("documentLogoPreview").src = documentProfile.logoDataUrl || "assets/mainabdichter-header-logo.png";
  }
  ["priceListName","priceListDate","lexofficeOfferImportFrom","hzPurchaseNet","hzSaleNet","reservePct","drillRate","fillRate","closeRate","setupHours","wallSoleHoursPerMeter","resinHoursPerMeter","wallSoleGrossPerMeter","extraResinKgNet","hsKgPerWallSoleMeter","workerUrl","appSecret"].forEach(key => $(key).value = s[key] ?? "");
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
  const offerTexts = s.offerTexts || DEFAULTS.settings.offerTexts || {};
  if ($("offerIntroductionText")) $("offerIntroductionText").value = offerTexts.introduction || "";
  $("noticeStandard").value = noticeTexts.standard || "";
  $("noticeWallSole").value = noticeTexts.wallSole || "";
  $("noticeResin").value = noticeTexts.resin || "";
  updateLexofficeTextCounts();
  const requirementBox = $("visitRequirementSettings");
  if (requirementBox) {
    let currentGroup="";
    requirementBox.innerHTML = VISIT_REQUIREMENT_DEFINITIONS.map(item => {
      const group=item.group!==currentGroup?`<h3 class="requirement-group-title">${esc(item.group)}</h3>`:"";
      currentGroup=item.group;
      return `${group}
      <label class="check-row">
        <input type="checkbox" data-visit-requirement="${item.key}" ${visitRequirementEnabled(item.key) ? "checked" : ""}>
        <span><strong>${esc(item.label)}</strong><small>${visitRequirementEnabled(item.key) ? "Pflicht – wird bei Abschluss geprüft" : "Optional – darf leer bleiben"}</small></span>
      </label>`;}).join("");
    requirementBox.querySelectorAll("[data-visit-requirement]").forEach(input => input.onchange = () => {
      const small = input.closest("label")?.querySelector("small");
      if (small) small.textContent = input.checked ? "Pflicht – wird bei Abschluss geprüft" : "Optional – darf leer bleiben";
    });
  }
  renderSettingsExtras();
  renderInventorySettings();
  renderPipedriveSyncSettings();
  applyInputModes();
}

function updateLexofficeTextCounts() {
  const fields = [
    ["offerIntroductionText", "offerIntroductionCount", "Einleitung"],
    ["noticeStandard", "noticeStandardCount", "Allgemeiner Hinweis"],
    ["noticeWallSole", "noticeWallSoleCount", "Zusatz Wand-Sohlen-Anschluss"],
    ["noticeResin", "noticeResinCount", "Zusatz Harzverpressung"]
  ];
  fields.forEach(([inputId, countId, label]) => {
    const input = $(inputId);
    const output = $(countId);
    if (!input || !output) return;
    const length = input.value.length;
    output.textContent = `${label}: ${length} von maximal 2.000 Zeichen`;
    output.classList.toggle("text-limit-exceeded", length > 2000);
  });
  const standard = $("noticeStandard")?.value.trim() || "";
  const wallSole = $("noticeWallSole")?.value.trim() || "";
  const resin = $("noticeResin")?.value.trim() || "";
  const longestRemark = [
    standard,
    `Allgemeine Hinweise\n${standard}\n\nWand-Sohlen-Anschluss\n${wallSole}`,
    `Allgemeine Hinweise\n${standard}\n\nHarzverpressung\n${resin}`,
    `Allgemeine Hinweise\n${standard}\n\nWand-Sohlen-Anschluss\n${wallSole}\n\nHarzverpressung\n${resin}`
  ].reduce((longest, value) => value.length > longest.length ? value : longest, "");
  const status = $("lexofficeTextLimitStatus");
  if (status) {
    status.textContent = longestRemark.length <= 2000
      ? `Auch mit allen Zusatzhinweisen sicher: ${longestRemark.length} von 2.000 Zeichen.`
      : `Achtung: Mit allen Zusatzhinweisen ${longestRemark.length} von 2.000 Zeichen. Das betreffende Angebot kann erst nach dem Kürzen übertragen werden.`;
    status.className = `status ${longestRemark.length <= 2000 ? "success" : "error"}`;
  }
}

["offerIntroductionText", "noticeStandard", "noticeWallSole", "noticeResin"].forEach(id => {
  if ($(id)) $(id).addEventListener("input", updateLexofficeTextCounts);
});

let activeWorksiteId = null;
let worksiteViewFilter = "all";
const WORKSITE_SECTION_ORDER = [
  "wsSectionOverview", "wsSectionExecution", "wsSectionPhotos", "wsSectionDocuments",
  "wsSectionMaterial", "wsSectionNotes", "wsSectionReport"
];

function isWorksiteSetupTask(task = {}) {
  const text = `${task.areaName || ""} ${task.type || ""} ${task.offerDescription || ""} ${task.note || ""}`.toLowerCase();
  return text.includes("baustelleneinrichtung") ||
    text.includes("baustellen-einrichtung") ||
    text.includes("einrichten der baustelle");
}

function reportableWorksiteTasks(worksite) {
  return (worksite?.tasks || []).filter(task => !isWorksiteSetupTask(task));
}

function worksiteCustomerName(worksite) {
  return [worksite.customer?.salutation, worksite.customer?.firstName, worksite.customer?.lastName].filter(Boolean).join(" ") || worksite.customer?.company || "Unbenannter Kunde";
}

function renderWorksites() {
  const allWorksites = loadWorksites();
  const list = worksiteViewFilter === "planning"
    ? allWorksites.filter(item => !item.status || item.status === "planning")
    : worksiteViewFilter === "planned"
      ? allWorksites.filter(item => item.status === "planned")
      : allWorksites;
  const box = $("worksiteList");
  if (!box) return;
  $("worksiteEditor").classList.toggle("hidden", !activeWorksiteId);
  $("closeWorksite").classList.toggle("hidden", !activeWorksiteId);
  $("worksites").classList.toggle("worksite-detail-open", Boolean(activeWorksiteId));
  box.classList.toggle("hidden", Boolean(activeWorksiteId));
  if (activeWorksiteId) {
    renderWorksiteEditor();
    return;
  }
  const filterTitle = worksiteViewFilter === "planning" ? "Offene Ausführungen"
    : worksiteViewFilter === "planned" ? "Ausführung geplant" : "Baustellen";
  box.innerHTML = `<div class="card-title-row"><h2>${filterTitle}</h2>${worksiteViewFilter !== "all" ? '<button type="button" class="secondary" id="showAllWorksites">Alle Baustellen</button>' : ""}</div>` + (list.length ? list.map(item => `
    <div class="worksite-list-item">
      <div><strong>${esc(worksiteCustomerName(item))}</strong><span>${esc(item.objectAddress || "–")}</span><small>${esc(item.date || "Termin noch offen")} · ${esc(worksiteStatusLabel(item.status))}</small></div>
      <div class="worksite-list-actions"><button class="secondary" data-open-worksite="${item.id}">Öffnen</button><button class="danger" data-delete-worksite="${item.id}">Löschen</button></div>
    </div>`).join("") : `<p class="hint">In diesem Bereich gibt es aktuell keine Baustelle.</p>`);
  if ($("showAllWorksites")) $("showAllWorksites").onclick = () => { worksiteViewFilter = "all"; renderWorksites(); };
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
  worksite.signaturePlace = $("wsSignaturePlace")?.value.trim() || "";
  worksite.signatureDate = $("wsSignatureDate")?.value || worksite.date || todayLocal();
  worksite.siteClean = Boolean($("wsSiteClean")?.checked);
  worksite.customerSignatureData = signaturePadData("wsCustomerSignatureCanvas") || worksite.customerSignatureData || "";
  worksite.workerSignatureData = signaturePadData("wsWorkerSignatureCanvas") || worksite.workerSignatureData || "";
  document.querySelectorAll("[data-ws-task]").forEach(input => {
    const task = worksite.tasks.find(item => item.id === input.dataset.wsTask);
    if (!task) return;
    const field = input.dataset.wsField;
    if (input.type === "checkbox") task[field] = input.checked;
    else if (["wall","actualQuantity","actualHoles","actualLiters","actualHsKg","packers","resinKg","spacing","bottlesHanging","bottlesRetrieved"].includes(field)) task[field] = parseDecimal(input.value);
    else task[field] = input.value;
  });
  return worksite;
}

function saveActiveWorksite(message=true) {
  const worksite = collectWorksite();
  if (!worksite) return null;
  if (worksite.status === "planned" && worksite.startTime) worksite.status = "active";
  renderWorksiteInvoiceReview(worksite);
  persistWorksite(worksite);
  if(message) showStatus("worksiteStatus","Arbeitsnachweis gespeichert.",true);
  return worksite;
}

function taskPhotoHtml(task) {
  return (task.photos || []).map(photo => `<div class="worksite-photo"><img data-worksite-photo="${photo.id}" ${photo.driveFileId ? `data-drive-file="${esc(photo.driveFileId)}"` : ""} alt="${esc(photo.category || "Baustellenfoto")}"><small>${esc(photo.category)}</small><button class="danger" data-delete-ws-photo="${photo.id}" data-task-id="${task.id}">×</button></div>`).join("");
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


function inventoryTrackingEnabled(productId, key) {
  const product = state.settings.inventory?.products?.find(item => item.id === productId);
  return Boolean(product?.[key]);
}

function chargeFieldHtml(task, productId, field, label) {
  if (!inventoryTrackingEnabled(productId, "chargeTracking")) return "";
  return `<div><label>${esc(label)}</label><input data-ws-task="${task.id}" data-ws-field="${field}" value="${esc(task[field] || "")}" placeholder="optional"></div>`;
}

function plannedScopeHtml(task) {
  const wallChange = Number(task.originalWall || 0) && Number(task.wall || 0) !== Number(task.originalWall || 0)
    ? `<small class="warning-text">Angebot: ${num(task.originalWall)} cm · tatsächlich: ${num(task.wall)} cm</small>`
    : "";
  const values = [
    task.scope || "",
    taskIsTechnical(task) && task.type !== "Harzverpressung" ? `${num(task.wall || task.originalWall || 0)} cm Wand` : ""
  ].filter(Boolean).join(" · ");
  return `<div class="planned-scope-card compact-planned-scope">
    <span>AUFTRAG</span>
    <strong>${esc(values || task.type || "Leistung")}</strong>
    ${wallChange}
  </div>`;
}


function activateWorksiteSection(sectionId) {
  if (!WORKSITE_SECTION_ORDER.includes(sectionId)) sectionId = WORKSITE_SECTION_ORDER[0];
  document.querySelectorAll(".worksite-section").forEach(section => {
    section.classList.toggle("active", section.id === sectionId);
  });
  document.querySelectorAll("[data-worksite-section]").forEach(button => {
    button.classList.toggle("active", button.dataset.worksiteSection === sectionId);
  });
  sessionStorage.setItem("mainabdichter_active_worksite_section", sectionId);
  const index = WORKSITE_SECTION_ORDER.indexOf(sectionId);
  if ($("worksiteStepBack")) $("worksiteStepBack").disabled = index <= 0;
  if ($("worksiteStepNext")) {
    $("worksiteStepNext").disabled = index >= WORKSITE_SECTION_ORDER.length - 1;
    $("worksiteStepNext").textContent = index >= WORKSITE_SECTION_ORDER.length - 1 ? "Fertig" : "Weiter →";
  }
  if ($("worksiteStepStatus")) $("worksiteStepStatus").textContent = `Schritt ${index + 1} von ${WORKSITE_SECTION_ORDER.length}`;
  document.getElementById(sectionId)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function localTimeValue(date = new Date()) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function setWorkdayStatus(ws) {
  const start = $("workdayStartStatus");
  const end = $("workdayEndStatus");
  if (start) start.textContent = ws.startTime
    ? `Beginn gespeichert: ${ws.date || todayLocal()} · ${ws.startTime} Uhr`
    : "Noch nicht gestartet";
  if (end) end.textContent = ws.endTime
    ? `Arbeitsende gespeichert: ${ws.endTime} Uhr · Netto ${num(workDurationMinutes(ws) / 60)} Std.`
    : "Arbeitsende noch offen";
  if ($("startWorkday")) $("startWorkday").textContent = ws.startTime ? "Arbeitsbeginn neu setzen" : "Arbeitsbeginn";
  if ($("endWorkday")) $("endWorkday").textContent = ws.endTime ? "Arbeitsende neu setzen" : "Arbeit beenden";
}

function captureWorksiteView(input) {
  return {
    scrollY: window.scrollY,
    taskId: input?.dataset?.wsTask || "",
    field: input?.dataset?.wsField || ""
  };
}

function restoreWorksiteView(view) {
  requestAnimationFrame(() => {
    window.scrollTo({ top: view.scrollY, behavior: "auto" });
    requestAnimationFrame(() => window.scrollTo({ top: view.scrollY, behavior: "auto" }));
  });
}

async function compressedPhotoData(file) {
  const source = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Das Foto konnte nicht gelesen werden."));
    reader.readAsDataURL(file);
  });
  const image = await new Promise((resolve, reject) => {
    const element = new Image();
    element.onload = () => resolve(element);
    element.onerror = () => reject(new Error("Das Foto konnte nicht verarbeitet werden."));
    element.src = source;
  });
  const maxEdge = 1600;
  const scale = Math.min(1, maxEdge / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", .72);
}

function bindWorksiteSectionNavigation() {
  document.querySelectorAll("[data-worksite-section]").forEach(button => {
    button.onclick = () => {
      if (activeWorksiteId) saveActiveWorksite(false);
      activateWorksiteSection(button.dataset.worksiteSection);
    };
  });
  const move = direction => {
    const current = sessionStorage.getItem("mainabdichter_active_worksite_section") || WORKSITE_SECTION_ORDER[0];
    const currentIndex = Math.max(0, WORKSITE_SECTION_ORDER.indexOf(current));
    const targetIndex = Math.max(0, Math.min(WORKSITE_SECTION_ORDER.length - 1, currentIndex + direction));
    if (targetIndex === currentIndex) return;
    if (activeWorksiteId) saveActiveWorksite(false);
    activateWorksiteSection(WORKSITE_SECTION_ORDER[targetIndex]);
  };
  if ($("worksiteStepBack")) $("worksiteStepBack").onclick = () => move(-1);
  if ($("worksiteStepNext")) $("worksiteStepNext").onclick = () => move(1);
}

function renderWorksiteOverview(ws) {
  const summary = $("wsOverviewSummary");
  if (summary) {
    const tasks = reportableWorksiteTasks(ws);
    const completed = tasks.filter(task => task.completed).length;
    const openBottles = tasks.reduce(
      (sum, task) => sum + Math.max(0, Number(task.bottlesHanging || 0) - Number(task.bottlesRetrieved || 0)),
      0
    );
    summary.innerHTML = `
      <div><span>Status</span><strong>${esc(ws.status === "completed" ? "Abgeschlossen" : ws.status === "active" ? "In Ausführung" : "Geplant")}</strong></div>
      <div><span>Maßnahmen</span><strong>${completed} von ${tasks.length} erledigt</strong></div>
      <div><span>Arbeitsdatum</span><strong>${esc(ws.date || "noch offen")}</strong></div>
      <div><span>Flaschen unterwegs</span><strong>${openBottles} Stück</strong></div>`;
  }
  const next = $("wsOverviewNextStep");
  if (next) {
    const firstOpen = reportableWorksiteTasks(ws).find(task => !task.completed);
    next.innerHTML = `<div class="worksite-overview-actions">
      <button type="button" class="secondary" data-jump-worksite="wsSectionDocuments">Aufmaß und Pläne öffnen</button>
      ${firstOpen
        ? `<button type="button" class="primary" data-jump-worksite="wsSectionExecution">Nächster Schritt: ${esc(firstOpen.areaName)} – ${esc(firstOpen.type)}</button>`
        : `<button type="button" class="primary" data-jump-worksite="wsSectionReport">Arbeitsnachweis abschließen</button>`}
    </div>`;
    next.querySelectorAll("[data-jump-worksite]").forEach(button => {
      button.onclick = () => activateWorksiteSection(button.dataset.jumpWorksite);
    });
  }
}

function worksiteReservationRows(ws) {
  const totals = worksiteMaterialTotals(ws);
  return [
    { id:"bkm-hz-250-pro", amount:totals.hzLiters },
    { id:"bkm-hs-sperrmoertel", amount:totals.hsKg },
    { id:"bkm-sef-2k-harz", amount:totals.resinKg }
  ].filter(row => Number(row.amount) > 0);
}

function reservedByOtherWorksites(productId, worksiteId) {
  return loadWorksites().reduce((sum, item) => {
    if (item.id === worksiteId || !item.materialReserved || item.materialBooked) return sum;
    const row = (item.materialReservation || []).find(entry => entry.productId === productId);
    return sum + Number(row?.amount || 0);
  }, 0);
}

function renderWorksitePlanning(ws) {
  const card = $("wsPlanningCard");
  if (!card) return;
  const locked = ["active","completed"].includes(ws.status);
  card.classList.toggle("hidden", locked);
  if (locked) return;
  const rows = worksiteReservationRows(ws);
  if ($("wsPlanningTitle")) $("wsPlanningTitle").textContent =
    ws.status === "planned" ? "Ausführung ist verbindlich geplant" : "Termin und Material festlegen";
  if ($("wsPlanningHint")) $("wsPlanningHint").textContent =
    ws.status === "planned"
      ? "Du kannst das Datum oder die Materialreservierung bei Bedarf noch ändern und erneut bestätigen."
      : "Wähle ein Ausführungsdatum und reserviere bei Bedarf das Material. Erst mit der Bestätigung wird die Ausführung verbindlich geplant.";
  if ($("reserveWorksiteMaterial")) $("reserveWorksiteMaterial").textContent =
    ws.materialReserved ? "Reservierung aktualisieren" : "Material reservieren";
  if ($("confirmWorksitePlanning")) $("confirmWorksitePlanning").textContent =
    ws.status === "planned" ? "Änderungen bestätigen" : "Ausführung verbindlich planen";
  if ($("wsReservationSummary")) {
    $("wsReservationSummary").innerHTML = rows.length ? rows.map(row => {
      const product = state.settings.inventory?.products?.find(item => item.id === row.id);
      const available = Number(product?.stock || 0) - reservedByOtherWorksites(row.id, ws.id);
      const enough = available >= Number(row.amount);
      return `<div class="reservation-row ${enough ? "reservation-ok" : "reservation-short"}">
        <span>${esc(product?.name || row.id)}</span>
        <strong>${num(row.amount)} ${esc(product?.unit || "")} · ${num(available)} verfügbar</strong>
      </div>`;
    }).join("") + (ws.materialReserved ? `<p class="booked-badge">Material ist für diese Baustelle reserviert.</p>` : "")
      : `<p class="hint">Für diese Baustelle ist noch kein reservierbares Material berechnet.</p>`;
  }
}

function reserveWorksiteMaterial(ws) {
  const rows = worksiteReservationRows(ws);
  if (!rows.length) throw new Error("Für diese Baustelle ist noch kein Materialbedarf vorhanden.");
  const shortages = rows.map(row => {
    const product = state.settings.inventory?.products?.find(item => item.id === row.id);
    const available = Number(product?.stock || 0) - reservedByOtherWorksites(row.id, ws.id);
    return { ...row, product, available };
  }).filter(row => row.available < Number(row.amount));
  if (shortages.length) {
    const text = shortages.map(row => `${row.product?.name || row.id}: ${num(row.amount - row.available)} ${row.product?.unit || ""} fehlen`).join(", ");
    if (!confirm(`Der frei verfügbare Bestand reicht noch nicht vollständig aus. ${text}. Trotzdem reservieren?`)) return false;
  }
  ws.materialReservation = rows.map(row => ({
    productId: row.id,
    amount: Number(row.amount),
    reservedAt: new Date().toISOString()
  }));
  ws.materialReserved = true;
  ws.materialReservedAt = new Date().toISOString();
  persistWorksite(ws);
  return true;
}

function renderWorksitePhotoPage(ws) {
  const box = $("wsPhotoPage");
  if (!box) return;
  box.innerHTML = reportableWorksiteTasks(ws).map(task => `
    <article class="worksite-photo-section">
      <div class="worksite-photo-section-head">
        <div><strong>${esc(task.areaName)}</strong><small>${esc(task.type)}</small></div>
        <div class="worksite-photo-add">
          <select id="photo-category-${task.id}">
            <option>Vorher</option>
            <option>Während</option>
            <option>Nachher</option>
          </select>
          <label class="secondary photo-upload-button">Foto aufnehmen<input class="hidden" type="file" accept="image/*" capture="environment" data-ws-photo-task="${task.id}" multiple></label>
          <label class="secondary photo-upload-button">Bild auswählen<input class="hidden" type="file" accept="image/*" data-ws-photo-task="${task.id}" multiple></label>
        </div>
      </div>
      <div class="worksite-photo-grid">${taskPhotoHtml(task) || '<p class="hint">Noch keine Fotos hinterlegt.</p>'}</div>
    </article>`).join("");
}

function renderWorksiteReportChecklist(ws) {
  const box = $("wsReportChecklist");
  if (!box) return;
  const checks = [
    ["Alle Maßnahmen geprüft", reportableWorksiteTasks(ws).every(task => task.completed)],
    ["Arbeitszeit erfasst", Boolean(ws.startTime && ws.endTime)],
    ["Mitarbeiter erfasst", Boolean(String(ws.employees || "").trim())],
    ["Bemerkungen geprüft", true],
    ["Kundenbestätigung", Boolean(String(ws.customerSignature || "").trim() && ws.customerSignatureData)]
  ];
  box.innerHTML = checks.map(([label, ok]) => `
    <div class="${ok ? "ok" : "missing"}"><span>${ok ? "✓" : "!"}</span><strong>${esc(label)}</strong></div>`).join("");
}

function invoiceReviewRows(ws) {
  const originalTasks = reportableWorksiteTasks(ws).filter(task => !task.additionalWork);
  return reportableWorksiteTasks(ws).filter(task => task.additionalWork).map(task => {
    const linked = originalTasks.find(item => item.id === task.linkedTaskId);
    const additionalQuantity = Number(task.actualQuantity || 0);
    const approved = Boolean(task.customerApproved);
    if (linked) {
      const originalQuantity = Number(linked.plannedQuantity || 0);
      return {
        task, linked, approved,
        title: linked.areaName || linked.type || "Auftragsleistung",
        detail: approved
          ? `${num(originalQuantity)} ${linked.unitName || task.unitName || ""} beauftragt + ${num(additionalQuantity)} ${task.unitName || linked.unitName || ""} zusätzlich = ${num(originalQuantity + additionalQuantity)} ${linked.unitName || task.unitName || ""} abzurechnen`
          : `${num(additionalQuantity)} ${task.unitName || linked.unitName || ""} zusätzlich erfasst – wird ohne Kundenbestätigung nicht berechnet`
      };
    }
    return {
      task, linked: null, approved,
      title: task.actualNote || task.scope || "Neue Zusatzleistung",
      detail: approved
        ? `${num(additionalQuantity)} ${task.unitName || ""} als neue Rechnungsposition`
        : `${num(additionalQuantity)} ${task.unitName || ""} erfasst – wird ohne Kundenbestätigung nicht berechnet`
    };
  });
}

function renderWorksiteInvoiceReview(ws) {
  const box = $("wsInvoiceReview");
  if (!box) return;
  const rows = invoiceReviewRows(ws);
  box.innerHTML = rows.length ? rows.map(row => `
    <article class="invoice-review-row ${row.approved ? "approved" : "pending"}">
      <div>
        <strong>${esc(row.title)}</strong>
        <small>${esc(row.detail)}</small>
      </div>
      <span>${row.approved ? "✓ Für Rechnung vorgemerkt" : "Nicht berechnen"}</span>
    </article>`).join("") : `<p class="hint">Keine Zusatzarbeiten erfasst. Die Rechnung bleibt wie beauftragt.</p>`;
  ws.invoiceAdjustments = rows.filter(row => row.approved).map(row => ({
    additionalTaskId: row.task.id,
    linkedTaskId: row.linked?.id || "",
    sourceLineItemId: row.linked?.sourceLineItemId || "",
    sourceArticleId: row.linked?.sourceArticleId || "",
    mode: row.linked ? "increase-existing" : "new-line-item",
    originalQuantity: Number(row.linked?.plannedQuantity || 0),
    additionalQuantity: Number(row.task.actualQuantity || 0),
    invoiceQuantity: row.linked
      ? Number(row.linked.plannedQuantity || 0) + Number(row.task.actualQuantity || 0)
      : Number(row.task.actualQuantity || 0),
    unitName: row.linked?.unitName || row.task.unitName || "",
    description: row.task.actualNote || row.task.scope || ""
  }));
}


const signaturePadStates = new Map();

function signaturePadData(canvasId) {
  const state = signaturePadStates.get(canvasId);
  return state?.hasInk ? state.canvas.toDataURL("image/png") : "";
}

function configureSignatureCanvas(canvas, savedData = "", locked = false) {
  if (!canvas) return;

  const rect = canvas.getBoundingClientRect();
  const width = Math.max(480, Math.round(rect.width || 640));
  const height = Math.max(150, Math.round(rect.height || 190));
  const ratio = Math.max(1, Math.min(2, window.devicePixelRatio || 1));

  canvas.width = width * ratio;
  canvas.height = height * ratio;

  const ctx = canvas.getContext("2d");
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.lineWidth = 2.2;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = "#18231d";
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);

  const pad = {
    canvas,
    ctx,
    width,
    height,
    drawing: false,
    hasInk: false,
    locked
  };
  signaturePadStates.set(canvas.id, pad);
  canvas.classList.toggle("is-locked", locked);

  const point = event => {
    const box = canvas.getBoundingClientRect();
    return {
      x: (event.clientX - box.left) * (width / box.width),
      y: (event.clientY - box.top) * (height / box.height)
    };
  };

  canvas.onpointerdown = event => {
    if (pad.locked) return;
    event.preventDefault();
    canvas.setPointerCapture?.(event.pointerId);
    const p = point(event);
    pad.drawing = true;
    pad.hasInk = true;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  };

  canvas.onpointermove = event => {
    if (!pad.drawing || pad.locked) return;
    event.preventDefault();
    const p = point(event);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  };

  const finish = event => {
    if (!pad.drawing) return;
    event?.preventDefault?.();
    pad.drawing = false;
    ctx.closePath();
  };

  canvas.onpointerup = finish;
  canvas.onpointercancel = finish;
  canvas.onpointerleave = finish;

  if (savedData) {
    const image = new Image();
    image.onload = () => {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(image, 0, 0, width, height);
      pad.hasInk = true;
    };
    image.src = savedData;
  }
}

function clearSignatureCanvas(canvasId) {
  const pad = signaturePadStates.get(canvasId);
  if (!pad || pad.locked) return;
  pad.ctx.fillStyle = "#ffffff";
  pad.ctx.fillRect(0, 0, pad.width, pad.height);
  pad.hasInk = false;
}

function initializeWorksiteSignatures(ws) {
  requestAnimationFrame(() => {
    configureSignatureCanvas(
      $("wsCustomerSignatureCanvas"),
      ws.customerSignatureData || "",
      ws.status === "completed"
    );
    configureSignatureCanvas(
      $("wsWorkerSignatureCanvas"),
      ws.workerSignatureData || "",
      ws.status === "completed"
    );

    if ($("clearCustomerSignature")) {
      $("clearCustomerSignature").disabled = ws.status === "completed";
      $("clearCustomerSignature").onclick = () => clearSignatureCanvas("wsCustomerSignatureCanvas");
    }
    if ($("clearWorkerSignature")) {
      $("clearWorkerSignature").disabled = ws.status === "completed";
      $("clearWorkerSignature").onclick = () => clearSignatureCanvas("wsWorkerSignatureCanvas");
    }
  });
}

function renderWorksiteEditor() {
  const ws = getWorksite(activeWorksiteId);
  if (!ws) { activeWorksiteId=null; renderWorksites(); return; }
  $("wsCustomer").textContent = worksiteCustomerName(ws);
  $("wsAddress").textContent = ws.objectAddress || "–";
  $("wsDate").value = ws.date || "";
  if ($("wsPlanningDate")) $("wsPlanningDate").value = ws.date || "";
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
  if ($("wsSignaturePlace")) $("wsSignaturePlace").value = ws.signaturePlace || ws.customer?.city || "";
  if ($("wsSignatureDate")) $("wsSignatureDate").value = ws.signatureDate || ws.date || todayLocal();
  if ($("wsSiteClean")) $("wsSiteClean").checked = Boolean(ws.siteClean);
  if (/^Importiert aus Lexware/i.test(ws.generalNotes || "")) ws.generalNotes = "";
  setWorkdayStatus(ws);
  initializeWorksiteSignatures(ws);
  ["wsCustomerSignature","wsWorkerSignature","wsSignaturePlace","wsSignatureDate","wsSiteClean"].forEach(id => {
    const element = $(id);
    if (element) element.disabled = ws.status === "completed";
  });
  renderWorksiteOverview(ws);
  renderWorksitePlanning(ws);
  renderWorksitePhotoPage(ws);
  renderWorksiteReportChecklist(ws);
  renderWorksiteInvoiceReview(ws);
  bindWorksiteSectionNavigation();
  const storedSection = sessionStorage.getItem("mainabdichter_active_worksite_section") || "wsSectionOverview";
  activateWorksiteSection(document.getElementById(storedSection) ? storedSection : "wsSectionOverview");
  ws.tasks.forEach(task => {
    if (task.offerDescription === undefined) task.offerDescription = task.note || "";
    if (task.actualNote === undefined) task.actualNote = "";
    if (task.workArea === undefined) task.workArea = "";
    if (task.wallMaterial === undefined) task.wallMaterial = "";
    if (task.isInteriorWall === undefined) task.isInteriorWall = false;
    if (task.isExteriorWall === undefined) task.isExteriorWall = false;
    if (task.actualQuantity === undefined || task.actualQuantity === null) task.actualQuantity = Number(task.plannedQuantity || 0);
    if (task.injectionPressureless === undefined) task.injectionPressureless = /drucklos/i.test(task.injectionType || "");
    if (task.injectionLowPressure === undefined) task.injectionLowPressure = /niederdruck/i.test(task.injectionType || "");
  });
  $("worksiteTasks").innerHTML = reportableWorksiteTasks(ws).map(task => {
    const technical = taskIsTechnical(task);
    const usesHz = taskUsesHz(task);
    const usesHs = taskUsesHs(task);
    const usesResin = taskUsesResin(task);
    const wallField = technical && task.type !== "Harzverpressung"
      ? `<div><label>Tatsächliche Wandstärke cm</label><input type="number" inputmode="decimal" min="1" step="0.5" data-ws-task="${task.id}" data-ws-field="wall" value="${formatDecimalInput(task.wall)}"></div>`
      : "";
    const wallMaterialOptions = ["", "Beton", "Ziegelmauerwerk", "HBL", "Kalksandstein", "Naturstein", "Bruchstein", "Mischmauerwerk", "Porenbeton", "Sonstiges"];
    const locationFields = technical ? `
        <div><label>Bereich</label><input data-ws-task="${task.id}" data-ws-field="workArea" value="${esc(task.workArea || "")}" placeholder="z. B. Keller, Lagerraum, Garage"></div>
        <div><label>Wandmaterial</label><select data-ws-task="${task.id}" data-ws-field="wallMaterial">${wallMaterialOptions.map(value => `<option value="${esc(value)}" ${task.wallMaterial===value?"selected":""}>${esc(value || "Bitte auswählen")}</option>`).join("")}</select></div>
        <div class="full wall-type-choice"><label>Bauteil</label>
          <label><input type="checkbox" data-ws-task="${task.id}" data-ws-field="isInteriorWall" ${task.isInteriorWall?"checked":""}> Innenwand</label>
          <label><input type="checkbox" data-ws-task="${task.id}" data-ws-field="isExteriorWall" ${task.isExteriorWall?"checked":""}> Außenwand</label>
        </div>` : "";
    const quantityLabel = task.type === "Flächensperre" ? "Tatsächliche Fläche m²" : "Tatsächliche Laufmeter";
    const hzFields = usesHz ? `
        <div><label>${quantityLabel}</label><input inputmode="decimal" data-ws-task="${task.id}" data-ws-field="actualQuantity" value="${formatDecimalInput(task.actualQuantity)}"></div>
        <div><label>Bohrlochabstand</label><select data-ws-task="${task.id}" data-ws-field="spacing"><option value="0.125" ${Number(task.spacing)===.125?"selected":""}>12,5 cm</option><option value="0.25" ${Number(task.spacing)===.25?"selected":""}>25 cm</option></select></div>
        <div><label>Soll-Bohrlöcher</label><input value="${task.plannedHoles}" readonly></div>
        <div><label>Ist-Bohrlöcher</label><input inputmode="decimal" data-ws-task="${task.id}" data-ws-field="actualHoles" value="${formatDecimalInput(task.actualHoles)}"></div>
        <div><label>Sollmenge je Bohrloch</label><input value="${Math.round(Number(task.targetLitersPerHole || 0) * 1000)} ml" readonly></div>
        <div><label>Istmenge je Bohrloch</label><input type="number" inputmode="numeric" min="0" step="10" data-ws-task="${task.id}" data-ws-field="actualMlPerHole" value="${Math.round(Number(task.actualLitersPerHole || task.targetLitersPerHole || 0) * 1000)}"></div>
        <div><label>Sollverbrauch ohne Reserve</label><input value="${num(task.plannedLiters)} l" readonly></div>
        <div><label>Istverbrauch HZ 250 PRO</label><input value="${num(task.actualLiters)} l" readonly></div>
        <div class="full injection-choice"><label>Injektionsart</label>
          <label><input type="checkbox" data-ws-task="${task.id}" data-ws-field="injectionPressureless" ${task.injectionPressureless?"checked":""}> Drucklos</label>
          <label><input type="checkbox" data-ws-task="${task.id}" data-ws-field="injectionLowPressure" ${task.injectionLowPressure?"checked":""}> Niederdruck</label>
        </div>
        ${task.injectionLowPressure ? `<div class="full"><button type="button" class="primary" data-start-injection="${task.id}">Injektion starten / fortsetzen</button><p class="hint">Nur bei Niederdruck: Die Gesamtmenge wird automatisch mitgeführt.</p></div>` : ""}
        ${chargeFieldHtml(task, "bkm-hz-250-pro", "chargeHz", "Charge BKM HZ 250 PRO")}
        <div><label>Noch hängende Injektionsflaschen</label><input inputmode="numeric" data-ws-task="${task.id}" data-ws-field="bottlesHanging" value="${formatDecimalInput(task.bottlesHanging)}"></div>
        <div><label>Bereich / Wand der Flaschen</label><input data-ws-task="${task.id}" data-ws-field="bottlesArea" value="${esc(task.bottlesArea || "")}"></div>
        <div><label>Geplante Abholung</label><input type="date" data-ws-task="${task.id}" data-ws-field="bottlesPickupDue" value="${esc(task.bottlesPickupDue || "")}"></div>` : "";
    const hsFields = usesHs ? `
        <div><label>Tatsächliche Laufmeter</label><input inputmode="decimal" data-ws-task="${task.id}" data-ws-field="actualQuantity" value="${formatDecimalInput(task.actualQuantity)}"></div>
        <div><label>Soll BKM HS Sperrmörtel</label><input value="${num(task.plannedHsKg)} kg" readonly></div>
        <div><label>Ist BKM HS Sperrmörtel kg</label><input inputmode="decimal" data-ws-task="${task.id}" data-ws-field="actualHsKg" value="${formatDecimalInput(task.actualHsKg)}"></div>
        ${chargeFieldHtml(task, "bkm-hs-sperrmoertel", "chargeHs", "Charge BKM HS Sperrmörtel")}` : "";
    const resinFields = usesResin ? `
        <div><label>Ist Packer Stück</label><input inputmode="decimal" data-ws-task="${task.id}" data-ws-field="packers" value="${formatDecimalInput(task.packers)}"></div>
        <div><label>Ist Harz kg</label><input inputmode="decimal" data-ws-task="${task.id}" data-ws-field="resinKg" value="${formatDecimalInput(task.resinKg)}"></div>
        ${chargeFieldHtml(task, "bkm-sef-2k-harz", "chargeResin", "Charge Harz / SEF-2K")}` : "";
    const linkableTasks = reportableWorksiteTasks(ws).filter(item => !item.additionalWork);
    const additionalFields = task.additionalWork ? `
        <div><label>Tatsächliche Menge</label><input inputmode="decimal" data-ws-task="${task.id}" data-ws-field="actualQuantity" value="${formatDecimalInput(task.actualQuantity)}"></div>
        <div><label>Einheit</label><select data-ws-task="${task.id}" data-ws-field="unitName">${["lfm","m²","Stück","Stunden","Pauschal"].map(value=>`<option ${task.unitName===value?"selected":""}>${value}</option>`).join("")}</select></div>
        <div class="full"><label>Zur Rechnung zuordnen</label><select data-ws-task="${task.id}" data-ws-field="linkedTaskId">
          <option value="">Neue Leistungsart – neue Rechnungsposition</option>
          ${linkableTasks.map(item => `<option value="${item.id}" ${task.linkedTaskId===item.id?"selected":""}>Mehrmenge zu: ${esc(item.areaName || item.type)} (${num(item.plannedQuantity)} ${esc(item.unitName || "")})</option>`).join("")}
        </select></div>
        <div class="full switch-row"><label><input type="checkbox" data-ws-task="${task.id}" data-ws-field="customerApproved" ${task.customerApproved?"checked":""}> Vom Kunden vor Ort beauftragt</label></div>` : "";
    return `
    <div class="card worksite-task-card">
      <div class="worksite-task-title"><div><h2>${esc(task.areaName)} – ${esc(task.type)}</h2><small>${esc(task.scope)}</small></div><label class="worksite-check"><input type="checkbox" data-ws-task="${task.id}" data-ws-field="completed" ${task.completed?"checked":""}> vollständig ausgeführt</label></div>
      ${plannedScopeHtml(task)}
      <div class="grid">
        ${locationFields}
        ${wallField}
        ${hzFields}
        ${hsFields}
        ${resinFields}
        ${additionalFields}
        <div class="full"><label>Was wurde tatsächlich gemacht / Besonderheiten</label><textarea data-ws-task="${task.id}" data-ws-field="actualNote">${esc(task.actualNote || "")}</textarea></div>
      </div>
    </div>`;
  }).join("");
  const totals = worksiteMaterialTotals(ws);
  const materialRows = [];
  if (totals.hzLiters > 0) materialRows.push(`<div class="worksite-material-row"><span>BKM HZ 250 Pro</span><strong>${num(totals.hzLiters)} Liter</strong></div>`);
  if (totals.hsKg > 0) materialRows.push(`<div class="worksite-material-row"><span>BKM HS Sperrmörtel</span><strong>${num(totals.hsKg)} kg</strong></div>`);
  if (totals.resinKg > 0) materialRows.push(`<div class="worksite-material-row"><span>Harz / SEF-2K</span><strong>${num(totals.resinKg)} kg</strong></div>`);
  if (totals.packers > 0) materialRows.push(`<div class="worksite-material-row"><span>Packer für Harzverpressung</span><strong>${num(totals.packers)} Stück</strong></div>`);
  $("wsMaterialSummary").innerHTML = materialRows.length
    ? materialRows.join("") + (ws.materialBooked ? `<p class="booked-badge">Material bereits abgebucht</p>` : "")
    : `<p class="hint">Noch kein tatsächlich verwendetes Material eingetragen.</p>`;
  hydrateWorksitePhotoImages($("worksiteEditor"));
  document.querySelectorAll("[data-ws-photo-task]").forEach(input => input.onchange = async event => {
    const task = ws.tasks.find(item => item.id === input.dataset.wsPhotoTask);
    const category = $(`photo-category-${task.id}`).value;
    try {
      for (const file of [...event.target.files]) task.photos.push(await stageWorksitePhoto(file, ws, task, category));
      persistWorksite(ws);
      event.target.value = "";
      sessionStorage.setItem("mainabdichter_active_worksite_section","wsSectionPhotos");
      renderWorksiteEditor();
    } catch (error) {
      event.target.value = "";
      showStatus("worksiteStatus", error?.name === "QuotaExceededError"
        ? "Der Gerätespeicher ist voll. Bitte ältere Baustellenfotos sichern oder löschen."
        : `Foto konnte nicht gespeichert werden: ${error.message}`, false);
    }
  });
  document.querySelectorAll("[data-delete-ws-photo]").forEach(button => button.onclick = async () => {
    const task=ws.tasks.find(item=>item.id===button.dataset.taskId);
    task.photos=task.photos.filter(photo=>photo.id!==button.dataset.deleteWsPhoto);
    await deleteWorksitePhoto(button.dataset.deleteWsPhoto);
    persistWorksite(ws);
    sessionStorage.setItem("mainabdichter_active_worksite_section","wsSectionPhotos");
    renderWorksiteEditor();
  });
  document.querySelectorAll('[data-ws-field="spacing"], [data-ws-field="wall"], [data-ws-field="actualHoles"], [data-ws-field="actualQuantity"], [data-ws-field="actualMlPerHole"]').forEach(input => {
    const recalculate = () => {
      const task = ws.tasks.find(item => item.id === input.dataset.wsTask);
      if (!task) return;
      const field = input.dataset.wsField;
      if (field === "actualMlPerHole") task.actualLitersPerHole = parseDecimal(input.value) / 1000;
      else task[field] = parseDecimal(input.value);

      // Quantity is the leading value when manually edited.
      if (field === "actualQuantity") {
        if (task.type === "Horizontalsperre") {
          task.actualHoles = Math.ceil(Number(task.actualQuantity || 0) / Number(task.spacing || .25));
        } else if (task.type === "Flächensperre") {
          task.actualHoles = Math.ceil(Number(task.actualQuantity || 0) / (Number(task.spacing || .25) * .25));
        }
      }

      recalculateWorksiteTask(state.settings, task, field);
      persistWorksite(ws);
      const view = captureWorksiteView(input);
      renderWorksiteEditor();
      restoreWorksiteView(view);
    };
    input.onchange = recalculate;
    if (["actualHoles","actualQuantity"].includes(input.dataset.wsField)) input.onblur = recalculate;
  });
  document.querySelectorAll("[data-start-injection]").forEach(button => {
    button.onclick = () => openInjectionAssistant(ws, button.dataset.startInjection);
  });
  document.querySelectorAll('[data-ws-field="injectionPressureless"], [data-ws-field="injectionLowPressure"]').forEach(input => {
    input.onchange = () => {
      const task = ws.tasks.find(item => item.id === input.dataset.wsTask);
      if (!task) return;
      task[input.dataset.wsField] = input.checked;
      task.injectionType = [
        task.injectionLowPressure ? "Niederdruckverfahren" : "",
        task.injectionPressureless ? "drucklose Injektion" : ""
      ].filter(Boolean).join(" und ");
      persistWorksite(ws);
      const view = captureWorksiteView(input);
      renderWorksiteEditor();
      restoreWorksiteView(view);
    };
  });
  document.querySelectorAll("[data-confirm-bottle-pickup]").forEach(button => button.onclick = () => {
    const task = ws.tasks.find(item => item.id === button.dataset.confirmBottlePickup);
    if (!task) return;
    const open = openBottleCount(task);
    const raw = prompt(`Wie viele Flaschen wurden abgeholt? Noch offen: ${open}`, String(open));
    if (raw === null) return;
    const amount = Math.max(0, Math.min(open, parseDecimal(raw)));
    if (amount <= 0) return;
    task.bottlesRetrieved = Number(task.bottlesRetrieved || 0) + amount;
    task.bottlesRetrievedAt = new Date().toISOString();
    const note = prompt("Bemerkung zur Abholung (optional)", task.bottlesPickupNote || "");
    if (note !== null) task.bottlesPickupNote = note;
    persistWorksite(ws);
    renderWorksiteEditor();
    updateDashboardOverview();
    showStatus("worksiteStatus", `${amount} Flaschen wurden als abgeholt bestätigt.`, true);
  });
  applyInputModes($("worksiteEditor"));
  renderWorksiteAttachments(ws);
}

function addAdditionalWorkToActiveWorksite() {
  const ws = saveActiveWorksite(false) || getWorksite(activeWorksiteId);
  if (!ws) return;
  openAdditionalWorkPicker(ws);
}

function additionalWorkCatalog() {
  const core = [
    { name:"Horizontalsperre", type:"Horizontalsperre", unit:"lfm" },
    { name:"Flächensperre", type:"Flächensperre", unit:"m²" },
    { name:"Wand-Sohlen-Anschluss", type:"Wand-Sohlen-Anschluss", unit:"lfm" },
    { name:"Harzverpressung", type:"Harzverpressung", unit:"lfm" }
  ];
  const articles = (state.settings.lexwareArticles || []).map(article => ({
    articleId:article.id,
    name:article.name || article.title || article.description || "Leistung",
    type:article.measureType || article.name || "Sonstige Leistung",
    unit:article.unitName || article.unit || "Stück",
    grossPrice:Number(article.grossPrice || article.unitPrice || article.price || 0)
  }));
  const seen = new Set();
  return [...core, ...articles].filter(item => {
    const key = item.name.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function openAdditionalWorkPicker(ws) {
  const catalog = additionalWorkCatalog();
  const overlay = document.createElement("div");
  overlay.className = "adhs-modal-overlay";
  overlay.innerHTML = `<section class="adhs-modal">
    <span class="dashboard-eyebrow">KUNDENWUNSCH</span>
    <h2>Welche Arbeit kommt hinzu?</h2>
    <label>Leistung aus dem Katalog</label>
    <select id="extraCatalogItem">${catalog.map((item,index)=>`<option value="${index}">${esc(item.name)}</option>`).join("")}</select>
    <div class="grid">
      <div><label>Bereich / Wand</label><input id="extraArea" placeholder="z. B. Keller Außenwand"></div>
      <div><label>Menge</label><input id="extraQuantity" type="number" inputmode="decimal" min="0" step=".1" value="1"></div>
    </div>
    <label>Besonderheit (optional)</label><input id="extraNote" placeholder="Nur wenn wirklich nötig">
    <label class="switch-row"><input id="extraApproved" type="checkbox" checked> Vom Kunden vor Ort beauftragt</label>
    <div class="modal-actions"><button type="button" class="secondary" data-close-modal>Abbrechen</button><button type="button" class="primary" id="addCatalogWork">Übernehmen</button></div>
  </section>`;
  document.body.appendChild(overlay);
  overlay.querySelector("[data-close-modal]").onclick = () => overlay.remove();
  overlay.querySelector("#addCatalogWork").onclick = () => {
    const item = catalog[Number(overlay.querySelector("#extraCatalogItem").value)];
    const area = overlay.querySelector("#extraArea").value.trim() || "Zusätzlicher Bereich";
    const quantity = parseDecimal(overlay.querySelector("#extraQuantity").value);
    if (!item || quantity <= 0) return;
    const linked = reportableWorksiteTasks(ws).find(task => !task.additionalWork && task.type === item.type);
    ws.tasks.push({
      id:crypto.randomUUID(), areaId:"", areaName:area, workArea:area,
      type:item.type, scope:`${num(quantity)} ${item.unit}`, offerDescription:"",
      actualNote:overlay.querySelector("#extraNote").value.trim(),
      plannedQuantity:0, actualQuantity:quantity, unitName:item.unit,
      sourceArticleId:item.articleId || "", sourceUnitPrice:Number(item.grossPrice || 0),
      completed:false, additionalWork:true, linkedTaskId:linked?.id || "",
      customerApproved:overlay.querySelector("#extraApproved").checked, photos:[],
      wall:30, originalWall:30, spacing:.25, actualHoles:0, plannedHoles:0,
      targetLitersPerHole:0, actualLitersPerHole:0, actualLiters:0,
      injectionLowPressure:false, injectionPressureless:false, holeRecords:[]
    });
    const added = ws.tasks.at(-1);
    recalculateWorksiteTask(state.settings, added, "actualQuantity");
    if (taskUsesHz(added)) added.actualHoles = added.plannedHoles;
    persistWorksite(ws);
    overlay.remove();
    sessionStorage.setItem("mainabdichter_active_worksite_section", "wsSectionExecution");
    renderWorksiteEditor();
  };
}

function openInjectionAssistant(ws, taskId) {
  const task = ws.tasks.find(item => item.id === taskId);
  if (!task || !task.injectionLowPressure) return;
  if (!Array.isArray(task.holeRecords)) task.holeRecords = [];
  const derivedHoles = task.type === "Horizontalsperre"
    ? Math.ceil(Number(task.actualQuantity || 0) / Number(task.spacing || .25))
    : Math.ceil(Number(task.actualQuantity || 0) / (Number(task.spacing || .25) * .25));
  const totalHoles = Math.max(1, Number(task.actualHoles || 0), Number(task.plannedHoles || 0), derivedHoles);
  task.actualHoles = totalHoles;
  let current = Math.min(task.holeRecords.length + 1, totalHoles);
  const overlay = document.createElement("div");
  overlay.className = "adhs-modal-overlay";
  const render = () => {
    const completedTotal = task.holeRecords
      .filter(row => row.hole < current)
      .reduce((sum,row) => sum + Number(row.actualLiters || 0), 0);
    const record = task.holeRecords.find(row => row.hole === current);
    const defaultMl = Math.round(Number(task.actualLitersPerHole || task.targetLitersPerHole || 0) * 1000);
    const currentMl = Math.round(Number(record?.actualLiters ?? defaultMl / 1000) * 1000);
    const stopAt = completedTotal + currentMl / 1000;
    const finished = current >= totalHoles &&
      task.holeRecords.filter(row => row.hole <= totalHoles).length >= totalHoles;
    overlay.innerHTML = `<section class="adhs-modal injection-assistant">
      <span class="dashboard-eyebrow">NIEDERDRUCKINJEKTION</span>
      <h2>${finished ? "Injektion vollständig erfasst" : `Bohrloch ${current} von ${totalHoles}`}</h2>
      ${finished ? `<div class="injection-stop-target"><span>Gesamtmenge</span><strong>${num(task.holeRecords.reduce((sum,row) => sum + Number(row.actualLiters || 0), 0))} l</strong></div>`
      : `<div class="injection-stop-target"><span>Durchlaufzähler stoppen bei</span><strong id="counterStopValue">${num(stopAt)} l</strong></div>
      <div class="injection-total"><span>Stand vor diesem Bohrloch</span><strong>${num(completedTotal)} Liter</strong></div>
      <label>Istmenge dieses Bohrlochs (ml)</label>
      <input id="holeMl" type="number" inputmode="numeric" step="10" min="0" value="${currentMl}">`}
      <div class="hole-status-grid">
        ${finished ? "" : `<button type="button" data-hole-status="completed" class="primary">Fertig + nächstes</button>
          <button type="button" data-hole-status="not-absorbing" class="secondary">Nicht aufnahmefähig</button>
          <button type="button" data-hole-status="skipped" class="secondary">Übersprungen</button>
          <button type="button" data-hole-status="pressureless" class="secondary">Dieses Loch drucklos</button>`}
      </div>
      <div class="modal-actions"><button type="button" id="holeBack" class="secondary">← Zurück</button><button type="button" data-close-modal class="secondary">Schließen</button></div>
    </section>`;
    const mlInput = overlay.querySelector("#holeMl");
    if (mlInput) mlInput.oninput = () => {
      const value = completedTotal + parseDecimal(mlInput.value) / 1000;
      const target = overlay.querySelector("#counterStopValue");
      if (target) target.textContent = `${num(value)} l`;
    };
    overlay.querySelector("[data-close-modal]").onclick = () => { persistWorksite(ws); overlay.remove(); renderWorksiteEditor(); };
    overlay.querySelector("#holeBack").onclick = () => { current = Math.max(1,current - 1); render(); };
    overlay.querySelectorAll("[data-hole-status]").forEach(button => button.onclick = () => {
      const status = button.dataset.holeStatus;
      const ml = ["skipped","not-absorbing"].includes(status) ? 0 : parseDecimal(overlay.querySelector("#holeMl").value);
      const next = {hole:current,status,method:status === "pressureless" ? "Drucklos" : "Niederdruck",actualLiters:ml / 1000};
      const index = task.holeRecords.findIndex(row => row.hole === current);
      if (index >= 0) task.holeRecords[index] = next; else task.holeRecords.push(next);
      task.holeRecords.sort((a,b) => a.hole - b.hole);
      task.actualLiters = task.holeRecords.reduce((sum,row) => sum + Number(row.actualLiters || 0), 0);
      const exceptions = task.holeRecords.filter(row => row.status !== "completed").map(row => {
        const label = row.status === "not-absorbing" ? "nicht aufnahmefähig"
          : row.status === "skipped" ? "übersprungen" : "drucklos injiziert";
        return `Bohrloch ${row.hole} ${label} (${Math.round(Number(row.actualLiters || 0) * 1000)} ml)`;
      });
      if (exceptions.length) task.note = `Bohrlochdokumentation: ${exceptions.join("; ")}.`;
      persistWorksite(ws);
      if (current < totalHoles) { current++; render(); }
      else { render(); }
    });
  };
  document.body.appendChild(overlay);
  render();
}

function deductWorksiteInventory(ws) {
  if (ws.materialBooked) throw new Error("Das Ist-Material wurde bereits abgebucht.");
  const totals = worksiteMaterialTotals(ws);
  const rows = [
    { id:"bkm-hz-250-pro", amount:totals.hzLiters },
    { id:"bkm-hs-sperrmoertel", amount:totals.hsKg },
    { id:"bkm-sef-2k-harz", amount:totals.resinKg }
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
  ws.materialReserved = false;
  ws.materialReservation = [];
}

function injectionExceptionsHtml(task) {
  const rows = (task.holeRecords || []).filter(row => row.status !== "completed");
  if (!rows.length) return "";
  return `<div class="worksite-print-note"><strong>Bohrlochdokumentation:</strong><br>${rows.map(row => {
    const status = row.status === "not-absorbing" ? "nicht aufnahmefähig"
      : row.status === "skipped" ? "übersprungen" : row.method;
    return `Bohrloch ${row.hole}: ${status}, Istmenge ${Math.round(Number(row.actualLiters || 0) * 1000)} ml`;
  }).join("<br>")}</div>`;
}

function buildWorksitePrint(ws) {
  const totals=worksiteMaterialTotals(ws);
  $("worksitePrintContent").innerHTML = `<div class="report-section"><h1>${esc(worksiteCustomerName(ws))}</h1><p>${esc(ws.objectAddress)}</p><div class="worksite-print-grid"><div><strong>Datum:</strong> ${esc(ws.date)}</div><div><strong>Mitarbeiter:</strong> ${esc(ws.employees)}</div><div><strong>Arbeitsbeginn:</strong> ${esc(ws.startTime)}</div><div><strong>Arbeitsende:</strong> ${esc(ws.endTime)}</div><div><strong>Pause:</strong> ${num(ws.pauseMinutes)} Min.</div><div><strong>Arbeitszeit:</strong> ${num(workDurationMinutes(ws)/60)} Std.</div><div><strong>Wetter:</strong> ${esc(ws.weather)}</div><div><strong>Außentemperatur:</strong> ${esc(ws.outdoorTemp)} °C</div></div></div>${ws.tasks.map(task=>`<div class="worksite-print-task"><h3>${esc(task.areaName)} – ${esc(task.type)}</h3><div class="worksite-print-grid"><div><strong>Umfang:</strong> ${esc(task.scope)}</div><div><strong>Wandstärke:</strong> ${num(task.wall)} cm</div><div><strong>Bohrlochabstand:</strong> ${num(task.spacing)} m</div><div><strong>Bohrlöcher Soll/Ist:</strong> ${num(task.plannedHoles)} / ${num(task.actualHoles)}</div><div><strong>Menge je Bohrloch:</strong> ${num(task.targetLitersPerHole)} l (mind. 0,200 l)</div><div><strong>HZ Soll/Ist:</strong> ${num(task.plannedLiters)} / ${num(task.actualLiters)} l</div>${task.plannedHsKg?`<div><strong>HS Soll/Ist:</strong> ${num(task.plannedHsKg)} / ${num(task.actualHsKg)} kg</div>`:""}<div><strong>Injektionsart:</strong> ${esc(task.injectionType)}</div><div><strong>Charge HZ 250 Pro:</strong> ${esc(task.chargeHz||"–")}</div><div><strong>Ausgeführt:</strong> ${task.completed?"Ja":"Nein"}</div>${Number(task.bottlesHanging||0)>0?`<div><strong>Injektionsflaschen eingesetzt:</strong> ${num(task.bottlesHanging)} Stück</div><div><strong>Davon noch in der Wand:</strong> ${num(openBottleCount(task))} Stück</div><div><strong>Geplante Abholung:</strong> ${esc(task.bottlesPickupDue||"noch offen")}</div>`:""}</div><div class="worksite-print-note"><strong>Ausführung/Besonderheiten:</strong><br>${esc(task.note||"–")}</div>${injectionExceptionsHtml(task)}${openBottleCount(task)>0?`<div class="worksite-print-note bottle-legal-note"><strong>Hinweis zu den Injektionsflaschen:</strong><br>Die Injektionsflaschen verbleiben bis zur endgültigen Leerung in der Wand und werden zu einem späteren Zeitpunkt abgeholt. Die ausgeführten Abdichtungsarbeiten sind hiervon unabhängig fertiggestellt und abrechenbar.</div>`:""}</div>`).join("")}<div class="report-section"><h2>Verbrauchtes Material</h2><p>BKM HZ 250 Pro: ${num(totals.hzLiters)} Liter<br>BKM HS Sperrmörtel: ${num(totals.hsKg)} kg<br>Harz: ${num(totals.resinKg)} kg<br>Packer: ${num(totals.packers)} Stück</p><p><strong>Allgemeine Bemerkungen:</strong><br>${esc(ws.generalNotes||"–")}</p><p><strong>Kunde:</strong> ${esc(ws.customerSignature||"–")} &nbsp;&nbsp; <strong>Ausführender:</strong> ${esc(ws.workerSignature||"–")}</p></div>`;
}

$("backToVisitInput").onclick = () => {
  collectVisit();
  saveState();
  renderVisit();
  show("visit");
  showStatus("visitStatus", "Dateneingabe geöffnet. Die bisherigen Angaben bleiben erhalten.", true);
};

$("createWorksite").onclick = async () => {
  const button = $("createWorksite");
  const status = $("offerArchiveStatus")?.value || "draft";
  if (!["accepted","completed"].includes(status)) {
    showStatus("offerStatus", "Die Baustelle kann erst nach Annahme des Angebots angelegt werden.", false);
    renderOffer();
    return;
  }
  button.disabled = true;
  collectVisit();
  showStatus("offerStatus", "Kunde und Baustelle werden mit Pipedrive synchronisiert …", true);

  try {
    const offer = saveCurrentToArchive(false);
    const ws = createWorksiteFromVisit(state.settings, state.visit, offer.id);

    if (!ws.tasks.length) {
      showStatus("offerStatus", "Keine Maßnahme mit gültiger Menge vorhanden.", false);
      return;
    }

    // Auch Lexoffice-Kunden, die noch nicht in Pipedrive vorhanden sind,
    // werden vor dem Anlegen der Baustelle automatisch erstellt.
    const personId = await ensurePipedrivePerson(ws.customer);
    if (!personId) throw new Error("Der Kunde konnte in Pipedrive nicht angelegt werden.");

    ws.pipedrivePersonId = String(personId);
    ws.customer.pipedriveId = String(personId);

    const dealResponse = await syncPipedriveDeal({
      dealId: ws.pipedriveDealId || ws.customer?.pipedriveDealId || "",
      personId,
      title: `${worksiteCustomerName(ws)} – ${ws.objectAddress || ws.visitNumber || "Baustelle"}`,
      stageId: requiredPipedriveStageId("executionPlanning"),
      value: Number(offer.offerGross || offer.gross || offer.total || 0),
      currency: "EUR",
      customFields: visitSyncValues(state.visit, {
        offerNumber: offer.offerNumber || state.visit.visitNumber || "",
        offerDate: offer.createdAt || new Date().toISOString(),
        offerValue: Number(offer.offerGross || offer.gross || offer.total || 0)
      }),
      note: `Baustelle aus Angebot ${offer.offerNumber || state.visit.visitNumber || ""} angelegt.`
    });

    ws.pipedriveDealId = String(dealResponse.deal?.id || "");
    ws.customer.pipedriveDealId = ws.pipedriveDealId;
    state.visit.customer.pipedriveId = String(personId);
    state.visit.customer.pipedriveDealId = ws.pipedriveDealId;
    saveState();

    persistWorksite(ws);
    activeWorksiteId = ws.id;
    addSyncLog("Angebot → Baustelle", true, "Kunde und Baustelle wurden zu Pipedrive übertragen.", {
      personId: ws.pipedrivePersonId,
      dealId: ws.pipedriveDealId
    });
    show("worksites");
    showStatus("worksiteStatus", "Baustelle wurde angelegt und der Kunde in Pipedrive synchronisiert.", true);
  } catch (error) {
    showStatus("offerStatus", `Baustelle konnte nicht vollständig angelegt werden: ${error.message}`, false);
  } finally {
    button.disabled = false;
  }
};
$("closeWorksite").onclick = () => { activeWorksiteId=null; renderWorksites(); };
if ($("closeWorksiteDetail")) $("closeWorksiteDetail").onclick = () => {
  activeWorksiteId = null;
  renderWorksites();
};
if ($("wsAddExtraWork")) $("wsAddExtraWork").onclick = addAdditionalWorkToActiveWorksite;
if ($("wsPlanningDate")) $("wsPlanningDate").onchange = () => {
  const ws = getWorksite(activeWorksiteId);
  if (!ws) return;
  ws.date = $("wsPlanningDate").value;
  if ($("wsDate")) $("wsDate").value = ws.date;
  persistWorksite(ws);
};
if ($("reserveWorksiteMaterial")) $("reserveWorksiteMaterial").onclick = () => {
  const ws = getWorksite(activeWorksiteId);
  if (!ws) return;
  try {
    if (reserveWorksiteMaterial(ws)) {
      renderWorksitePlanning(ws);
      renderV28Dashboard();
      showStatus("worksiteStatus", "Material wurde für diese Baustelle reserviert. Der Lagerbestand wurde noch nicht abgebucht.", true);
    }
  } catch (error) {
    showStatus("worksiteStatus", error.message, false);
  }
};
if ($("confirmWorksitePlanning")) $("confirmWorksitePlanning").onclick = async () => {
  const ws = getWorksite(activeWorksiteId);
  if (!ws) return;
  const date = $("wsPlanningDate")?.value || "";
  if (!date) {
    showStatus("worksiteStatus", "Bitte zuerst ein Ausführungsdatum auswählen.", false);
    return;
  }
  const button = $("confirmWorksitePlanning");
  button.disabled = true;
  try {
    ws.date = date;
    ws.status = "planned";
    ws.planningConfirmedAt = new Date().toISOString();
    persistWorksite(ws);
    await syncWorksiteDeal(ws, "executionPlanned", null, false);
    if ($("wsDate")) $("wsDate").value = date;
    renderWorksitePlanning(ws);
    renderV28Dashboard();
    showStatus("worksiteStatus", "Ausführung wurde verbindlich geplant und in Pipedrive auf „Ausführung geplant“ verschoben.", true);
  } catch (error) {
    ws.status = "planning";
    persistWorksite(ws);
    showStatus("worksiteStatus", `Planung konnte nicht bestätigt werden: ${error.message}`, false);
  } finally {
    button.disabled = false;
  }
};
$("wsAddAttachments").onclick = () => $("wsAttachmentInput").click();
if ($("wsTakeAttachmentPhoto")) $("wsTakeAttachmentPhoto").onclick = () => $("wsAttachmentCamera").click();
const addWorksiteAttachmentFiles = async event => {
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
    let syncWarning = "";
    if (ws.pipedriveDealId) {
      try {
        await syncWorksiteDeal(ws, worksitePipedriveStage(ws), null);
      } catch (syncError) {
        syncWarning = syncError.message;
      }
    }
    await renderWorksiteAttachments(ws);
    showStatus(
      "worksiteStatus",
      syncWarning
        ? `Datei gespeichert. Pipedrive-Upload noch offen: ${syncWarning}`
        : `${files.length} Datei(en) wurden gespeichert und stehen in der Bauakte bereit.`,
      !syncWarning
    );
  } catch (error) {
    showStatus("worksiteStatus", error.message, false);
  }
};
$("wsAttachmentInput").onchange = addWorksiteAttachmentFiles;
if ($("wsAttachmentCamera")) $("wsAttachmentCamera").onchange = addWorksiteAttachmentFiles;
$("wsUploadAttachments").onclick = async () => {
  try {
    const ws = saveActiveWorksite(false);
    if (!ws) return;
    showStatus("worksiteStatus", "Unterlagen werden zu Pipedrive hochgeladen …", true);
    await syncWorksiteDeal(ws, worksitePipedriveStage(ws), null);
    await renderWorksiteAttachments(ws);
    showStatus("worksiteStatus", "Alle noch offenen Unterlagen wurden zu Pipedrive hochgeladen.", true);
  } catch (error) {
    await renderWorksiteAttachments(getWorksite(activeWorksiteId));
    showStatus("worksiteStatus", error.message, false);
  }
};
$("saveWorksite").onclick = () => { saveActiveWorksite(true); renderWorksiteEditor(); };
["wsStart","wsEnd","wsPause"].forEach(id => $(id).onchange = () => { const ws=collectWorksite(); if(ws) $("wsDuration").value=`${num(workDurationMinutes(ws)/60)} Std.`; });
if ($("startWorkday")) $("startWorkday").onclick = () => {
  const ws = collectWorksite();
  if (!ws) return;
  if (!String(ws.employees || "").trim()) {
    showStatus("worksiteStatus", "Bitte zuerst den Mitarbeiter auswählen.", false);
    $("wsEmployees")?.focus();
    return;
  }
  const now = new Date();
  ws.date = todayLocal();
  ws.startTime = localTimeValue(now);
  ws.status = "active";
  persistWorksite(ws);
  renderWorksiteEditor();
};
if ($("endWorkday")) $("endWorkday").onclick = () => {
  const ws = collectWorksite();
  if (!ws) return;
  if (!ws.startTime) {
    showStatus("worksiteStatus", "Bitte zuerst in Schritt 1 den Arbeitsbeginn speichern.", false);
    return;
  }
  ws.endTime = localTimeValue(new Date());
  persistWorksite(ws);
  sessionStorage.setItem("mainabdichter_active_worksite_section", "wsSectionReport");
  renderWorksiteEditor();
  setWorkdayStatus(ws);
};
$("printWorksite").onclick = async () => {
  try { const ws=saveActiveWorksite(false); const pdf=await createWorksitePdf(ws, state.settings); downloadBlob(pdf.blob,pdf.filename); showStatus("worksiteStatus","Arbeitsnachweis wurde als PDF erstellt.",true); }
  catch(error){ showStatus("worksiteStatus",error.message,false); }
};
$("syncWorksitePipedrive").onclick = async () => {
  try { const ws=saveActiveWorksite(false); const pdf=await createWorksitePdf(ws, state.settings); await syncWorksiteDeal(ws,worksitePipedriveStage(ws),pdf); renderWorksiteEditor(); showStatus("worksiteStatus","Arbeitsnachweis und Baustellendaten wurden zu Pipedrive übertragen.",true); }
  catch(error){ addSyncLog("Arbeitsnachweis",false,error.message); showStatus("worksiteStatus",error.message,false); }
};

function safeDrivePart(value, fallback) {
  return String(value || fallback).trim().replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").slice(0, 100);
}

async function uploadWorksitePdfToDrive(worksite, pdf) {
  if (worksite.driveReportFileId) return {
    file: { id: worksite.driveReportFileId, webViewLink: worksite.driveReportUrl || "" }
  };
  const customer = worksite.customer || {};
  const customerFolder = safeDrivePart(
    [customer.lastName, customer.firstName].filter(Boolean).join(", ") || customer.company,
    "Unbekannter Kunde"
  );
  const file = new File([pdf.blob], pdf.filename, { type: "application/pdf" });
  const result = await uploadDriveVisitDocument(file, {
    documentId: `arbeitsnachweis-${worksite.id}`,
    customerFolder,
    visitFolder: safeDrivePart(
      `Baustelle ${worksite.date || ""} ${worksite.visitNumber || ""}`,
      `Baustelle-${worksite.date || "ohne Datum"}`
    ),
    category: "Arbeitsnachweis",
    categoryFolder: "Arbeitsnachweise",
    filename: pdf.filename,
    mimeType: "application/pdf",
    note: `Arbeitsnachweis ${worksiteCustomerName(worksite)} – ${worksite.objectAddress || ""}`
  });
  worksite.driveReportFileId = result.file.id;
  worksite.driveReportUrl = result.file.webViewLink || "";
  worksite.driveReportUploadedAt = new Date().toISOString();
  persistWorksite(worksite);
  return result;
}

$("completeWorksite").onclick = async () => {
  try {
    const ws=saveActiveWorksite(false);
    if (ws.materialBooked || ws.status === "completed") throw new Error("Diese Baustelle wurde bereits abgeschlossen und das Material bereits abgebucht.");
    if(!reportableWorksiteTasks(ws).every(task=>task.completed) && !confirm("Nicht alle Maßnahmen sind als vollständig ausgeführt markiert. Trotzdem abschließen?")) return;
    if (!String(ws.customerSignature || "").trim() || !ws.customerSignatureData) {
      sessionStorage.setItem("mainabdichter_active_worksite_section", "wsSectionReport");
      renderWorksiteEditor();
      throw new Error("Bitte den Namen des Kunden eintragen und die Kundenunterschrift auf dem iPad erfassen.");
    }
    if (!String(ws.workerSignature || "").trim() || !ws.workerSignatureData) {
      sessionStorage.setItem("mainabdichter_active_worksite_section", "wsSectionReport");
      renderWorksiteEditor();
      throw new Error("Bitte den ausführenden Mitarbeiter eintragen und unterschreiben.");
    }
    const oldStatus=ws.status;
    ws.status="completed";
    ws.reportLockedAt = new Date().toISOString();
    const pdf=await createWorksitePdf(ws, state.settings);
    try {
      showStatus("worksiteStatus", "PDF und Baustellenfotos werden in Google Drive gespeichert …", true);
      await uploadWorksitePdfToDrive(ws, pdf);
      const photoUpload = await syncWorksitePhotos(ws);
      if (photoUpload.errors.length) {
        throw new Error(`Google-Drive-Fotoupload fehlgeschlagen: ${photoUpload.errors[0]}`);
      }
      persistWorksite(ws);
      showStatus("worksiteStatus", "Google Drive ✓ – Pipedrive wird aktualisiert …", true);
      await syncWorksiteDeal(ws,"executionCompleted",pdf);
    }
    catch(error) { ws.status=oldStatus; persistWorksite(ws); throw error; }
    deductWorksiteInventory(ws);
    persistWorksite(ws); saveState(); renderInventorySettings(); renderWorksiteEditor();
    showStatus("worksiteStatus","Google Drive ✓ Pipedrive ✓ Material abgebucht ✓",true);
  } catch(error){ addSyncLog("Baustellenabschluss",false,error.message); showStatus("worksiteStatus",`Abschluss abgebrochen: ${error.message}`,false); }
};

function renderSettingsExtras() {
  $("settingsExtras").innerHTML = state.settings.extras.map(extra => {
    const article = state.settings.lexwareArticles.find(a=>a.id===extra.lexwareArticleId);
    return `<div class="catalog-row"><div class="grid"><div class="full"><label>Lexoffice-Artikel</label><select data-extra-article="${extra.id}">${articleOptions(extra.lexwareArticleId)}</select></div>${article?`<div class="full"><strong>${esc(article.title)}</strong><div class="article-description">${esc(article.description||"")}</div></div><div><label>Einheit aus Lexoffice</label><input value="${esc(article.unitName||extra.unit)}" readonly></div>`:`<div><label>Bezeichnung</label><input data-extra="${extra.id}" data-extra-field="name" value="${esc(extra.name)}"></div><div><label>Einheit</label><input data-extra="${extra.id}" data-extra-field="unit" value="${esc(extra.unit)}"></div>`}<div><label>Preis brutto aus App</label><input data-extra="${extra.id}" data-extra-field="grossPrice" value="${extra.grossPrice}"></div><label><input type="checkbox" data-extra-active="${extra.id}" ${extra.active?"checked":""}> aktiv</label><button class="danger" data-extra-delete="${extra.id}">Löschen</button></div></div>`;
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
    active: true,
    chargeTracking: false,
    shelfLifeTracking: false,
    serialTracking: false,
    manufacturer: "",
    packageSizes: [1]
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
  const documentProfile = getDocumentProfile(s);
  Object.entries(DOCUMENT_PROFILE_FIELDS).forEach(([id, key]) => {
    documentProfile[key] = $(id)?.value.trim() || "";
  });
  s.documentProfile = documentProfile;
  ["priceListName","priceListDate","lexofficeOfferImportFrom","appSecret"].forEach(key => s[key] = $(key).value.trim());
  s.workerUrl = normalizeWorkerUrl($("workerUrl").value);
  if (
    !s.workerUrl ||
    s.workerUrl.includes("mainabdichter-lexoffice.cmww7htry5.workers.dev") ||
    s.workerUrl.includes("mainabdichter-lexoffice.")
  ) {
    s.workerUrl = MAINABDICHTER_WORKER_URL;
  }
  $("workerUrl").value = s.workerUrl;
  ["hzPurchaseNet","hzSaleNet","reservePct","drillRate","fillRate","closeRate","setupHours","wallSoleHoursPerMeter","resinHoursPerMeter","wallSoleGrossPerMeter","extraResinKgNet","hsKgPerWallSoleMeter"].forEach(key => s[key] = parseDecimal($(key).value));
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
  s.offerTexts = {
    introduction: $("offerIntroductionText")?.value.trim()
      || DEFAULTS.settings.offerTexts?.introduction
      || ""
  };
  s.visitRequirements = {};
  document.querySelectorAll("[data-visit-requirement]").forEach(input => {
    s.visitRequirements[input.dataset.visitRequirement] = input.checked;
  });
  s.pipedriveSync = s.pipedriveSync || {fields:[],stages:[],fieldMappings:{},stageMappings:{},log:[],personFields:[],personFieldMappings:{postalAddress:"",objectAddress:""}};
  s.pipedriveSync.autoSync = $("pipedriveAutoSync").checked;
}
$("saveConnection").onclick = () => { collectSettings(); saveState(); showStatus("connectionStatus","Zugangsdaten gespeichert.",true); };
$("saveSettings").onclick = () => { collectSettings(); saveState(); showStatus("settingsStatus","Einstellungen gespeichert.",true); renderExtras(); renderOffer(); renderPipedriveSyncSettings(); updateVisitGuide(); };
$("resetSettings").onclick = () => { if(confirm("Standardwerte laden?")){ resetSettings(); renderSettings(); } };
if ($("documentLogoFile")) $("documentLogoFile").onchange = async event => {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    const logoDataUrl = await compressImage(file, 1000);
    state.settings.documentProfile = getDocumentProfile(state.settings);
    state.settings.documentProfile.logoDataUrl = logoDataUrl;
    $("documentLogoPreview").src = logoDataUrl;
    showStatus("documentDesignStatus","Logo übernommen. Zum dauerhaften Speichern unten auf „Einstellungen speichern“ tippen.",true);
  } catch (error) {
    showStatus("documentDesignStatus",error.message,false);
  }
};
if ($("resetDocumentLogo")) $("resetDocumentLogo").onclick = () => {
  state.settings.documentProfile = getDocumentProfile(state.settings);
  state.settings.documentProfile.logoDataUrl = "";
  $("documentLogoPreview").src = "assets/mainabdichter-header-logo.png";
  $("documentLogoFile").value = "";
  showStatus("documentDesignStatus","Standardlogo ausgewählt. Zum dauerhaften Speichern unten auf „Einstellungen speichern“ tippen.",true);
};
if ($("downloadLexofficeLetterhead")) $("downloadLexofficeLetterhead").onclick = async () => {
  try {
    collectSettings();
    saveState();
    const pdf = await createLexofficeLetterheadPdf(state.settings);
    downloadBlob(pdf.blob,pdf.filename);
    showStatus("documentDesignStatus","Lexoffice-Briefpapier wurde als PDF erstellt.",true);
  } catch (error) {
    showStatus("documentDesignStatus",error.message,false);
  }
};
$("testConnection").onclick = async () => {
  collectSettings(); saveState();
  const setState = (id,label,ok,error) => { const el=$(id); el.className=`connection-state ${ok?"ok":"err"}`; el.textContent=`${label}: ${ok?"verbunden":error||"Fehler"}`; };
  try {
    const result = await testConnections();
    setState(
      "stateCloudflare",
      result.workerVersion ? `Cloudflare Worker ${result.workerVersion}` : "Cloudflare",
      result.cloudflare,
      result.errors.cloudflare
    );
    setState("stateLexware","Lexoffice",result.lexware,result.errors.lexware);
    setState("statePipedrive","Pipedrive",result.pipedrive,result.errors.pipedrive);
    setState("stateDrive","Google Drive",result.drive,result.errors.drive);
  } catch (error) {
    setState("stateCloudflare","Cloudflare",false,error.message);
    setState("stateLexware","Lexoffice",false,"Worker-Verbindung fehlt");
    setState("statePipedrive","Pipedrive",false,"Worker-Verbindung fehlt");
    setState("stateDrive","Google Drive",false,"Worker-Verbindung fehlt");
  }
};

state.discount.pricingTier = state.discount.pricingTier || "standard";
$("skontoType").value = state.discount.skontoType;
$("skontoCustom").value = state.discount.skontoCustom;
$("specialType").value = state.discount.specialType;
$("specialValue").value = state.discount.specialValue;
$("specialLabel").value = state.discount.specialLabel;

try {
  await migrateEmbeddedVisitPhotos();
  await migrateEmbeddedWorksitePhotos();
} catch (error) {
  console.warn("Alte Fotos konnten nicht vollständig migriert werden:", error);
}
migrateWorkerUrl();
renderVisit(); updateGeneratedRecommendation(); renderSettings(); renderOffer(); renderArchive(); updateDashboardOverview(); updateBackupTime(); show("dashboard");

let automaticLocalSaveTimer = 0;
let automaticDriveSaveTimer = 0;
let automaticDriveSaving = false;
let automaticDriveRetry = false;

function collectVisibleAutomaticData() {
  const activePage = document.querySelector(".page.active")?.id;
  if (activePage === "visit") collectVisit();
  if (activePage === "settings") collectSettings();
  saveState();
}

async function runAutomaticDriveBackup() {
  if (automaticDriveSaving || !hasConnectionConfig()) return;
  automaticDriveSaving = true;
  try {
    collectVisibleAutomaticData();
    await saveDriveBackup(createFullBackupPayload());
    localStorage.setItem("mainabdichter_v14_last_backup", new Date().toISOString());
    automaticDriveRetry = false;
    updateBackupTime();
  } catch (error) {
    console.warn("Automatische Drive-Sicherung wird erneut versucht:", error);
    if (!automaticDriveRetry) {
      automaticDriveRetry = true;
      automaticDriveSaveTimer = window.setTimeout(runAutomaticDriveBackup, 60000);
    }
  } finally {
    automaticDriveSaving = false;
  }
}

function scheduleAutomaticSave() {
  window.clearTimeout(automaticLocalSaveTimer);
  automaticLocalSaveTimer = window.setTimeout(() => {
    collectVisibleAutomaticData();
  }, 350);
  window.clearTimeout(automaticDriveSaveTimer);
  automaticDriveSaveTimer = window.setTimeout(runAutomaticDriveBackup, 4000);
}

document.addEventListener("input", scheduleAutomaticSave, true);
document.addEventListener("change", scheduleAutomaticSave, true);
document.addEventListener("click", event => {
  if (event.target.closest("button")) scheduleAutomaticSave();
}, true);
window.addEventListener("pagehide", () => {
  collectVisibleAutomaticData();
  void runAutomaticDriveBackup();
});
window.setInterval(runAutomaticDriveBackup, 5 * 60 * 1000);

window.addEventListener("keydown", event => { if (event.key === "Escape") closeAppMenu(); });

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initializeV28Dashboard); else initializeV28Dashboard();
