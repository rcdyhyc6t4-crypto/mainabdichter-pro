import { DEFAULTS, createArea } from "./defaults-v227.js";

const KEYS = {
  settings: "mainabdichter_v10_settings",
  visit: "mainabdichter_v10_visit",
  discount: "mainabdichter_v10_discount"
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function merge(base, stored) {
  if (!stored || typeof stored !== "object") return clone(base);
  if (Array.isArray(base)) return Array.isArray(stored) ? stored : clone(base);
  const result = { ...clone(base) };
  for (const [key, value] of Object.entries(stored)) {
    if (value && typeof value === "object" && !Array.isArray(value) && result[key] && typeof result[key] === "object" && !Array.isArray(result[key])) {
      result[key] = merge(result[key], value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

function loadJson(key, fallback) {
  try {
    return merge(fallback, JSON.parse(localStorage.getItem(key) || "null"));
  } catch {
    return clone(fallback);
  }
}

export const state = {
  settings: loadJson(KEYS.settings, DEFAULTS.settings),
  visit: loadJson(KEYS.visit, DEFAULTS.visit),
  discount: loadJson(KEYS.discount, DEFAULTS.discount)
};

export function saveState() {
  localStorage.setItem(KEYS.settings, JSON.stringify(state.settings));
  localStorage.setItem(KEYS.visit, JSON.stringify(state.visit));
  localStorage.setItem(KEYS.discount, JSON.stringify(state.discount));
}

export function resetVisit() {
  state.visit = clone(DEFAULTS.visit);
  state.visit.areas = [];
  saveState();
}

export function resetSettings() {
  state.settings = clone(DEFAULTS.settings);
  saveState();
}


const ARCHIVE_KEY = "mainabdichter_v13_archive";
const CUSTOMERS_KEY = "mainabdichter_v30_customers";
const COMMUNICATION_NOTES_KEY = "mainabdichter_v32_communication_notes";
const EMAIL_INBOX_STATE_KEY = "mainabdichter_v32_email_inbox_state";
const VISIT_EXPLICIT_SAVEPOINT_KEY = "mainabdichter_visit_explicit_savepoint_v1";
const DRAFTS_KEY = "mainabdichter_v26_drafts";
const REMINDERS_KEY = "mainabdichter_v26_reminders";
const ACTIVE_DRAFT_KEY = "mainabdichter_v26_active_draft";

function readStoredJson(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "null");
    return value ?? clone(fallback);
  } catch {
    return clone(fallback);
  }
}

export function loadCommunicationNotes() {
  try {
    const data = JSON.parse(localStorage.getItem(COMMUNICATION_NOTES_KEY) || "[]");
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

export function saveCommunicationNote(note) {
  const notes = loadCommunicationNotes();
  const now = new Date().toISOString();
  const normalized = {
    ...note,
    id: note.id || crypto.randomUUID(),
    status: note.status || "open",
    createdAt: note.createdAt || now,
    updatedAt: now
  };
  const index = notes.findIndex(item => item.id === normalized.id);
  if (index >= 0) notes[index] = { ...notes[index], ...normalized };
  else notes.unshift(normalized);
  localStorage.setItem(COMMUNICATION_NOTES_KEY, JSON.stringify(notes));
  return normalized;
}

export function loadEmailInboxState() {
  try {
    const data = JSON.parse(localStorage.getItem(EMAIL_INBOX_STATE_KEY) || "{}");
    return data && typeof data === "object"
      ? { processedIds: [], assignments: {}, ...data }
      : { processedIds: [], assignments: {} };
  } catch {
    return { processedIds: [], assignments: {} };
  }
}

export function saveEmailInboxState(value) {
  const normalized = {
    processedIds: Array.from(new Set(value?.processedIds || [])).slice(-2000),
    assignments: value?.assignments && typeof value.assignments === "object"
      ? value.assignments
      : {},
    updatedAt: new Date().toISOString()
  };
  localStorage.setItem(EMAIL_INBOX_STATE_KEY, JSON.stringify(normalized));
  return normalized;
}

export function loadCustomers() {
  try {
    const data = JSON.parse(localStorage.getItem(CUSTOMERS_KEY) || "[]");
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

export function saveCustomer(customer) {
  const customers = loadCustomers();
  const now = new Date().toISOString();
  const normalized = {
    ...customer,
    id: customer.id || crypto.randomUUID(),
    createdAt: customer.createdAt || now,
    updatedAt: now
  };
  const index = customers.findIndex(item =>
    item.id === normalized.id ||
    (normalized.pipedriveId && String(item.pipedriveId) === String(normalized.pipedriveId))
  );
  if (index >= 0) customers[index] = { ...customers[index], ...normalized };
  else customers.unshift(normalized);
  localStorage.setItem(CUSTOMERS_KEY, JSON.stringify(customers));
  return normalized;
}

export function loadArchive() {
  try {
    const data = JSON.parse(localStorage.getItem(ARCHIVE_KEY) || "[]");
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

export function saveArchive(archive) {
  localStorage.setItem(ARCHIVE_KEY, JSON.stringify(archive));
}

export function archiveCurrentOffer(record) {
  const archive = loadArchive();
  const now = new Date().toISOString();
  const id = record.id || crypto.randomUUID();

  const existingIndex = archive.findIndex(item => item.id === id);
  const normalized = {
    ...record,
    id,
    updatedAt: now,
    createdAt: record.createdAt || now
  };

  if (existingIndex >= 0) archive[existingIndex] = normalized;
  else archive.unshift(normalized);

  saveArchive(archive);
  return normalized;
}

export function deleteArchiveRecord(id) {
  const archive = loadArchive().filter(item => item.id !== id);
  saveArchive(archive);
}

export function replaceArchive(archive) {
  saveArchive(Array.isArray(archive) ? archive : []);
}


export function createFullBackupPayload() {
  return {
    version: 32.19,
    exportedAt: new Date().toISOString(),
    settings: JSON.parse(JSON.stringify(state.settings)),
    visit: JSON.parse(JSON.stringify(state.visit)),
    discount: JSON.parse(JSON.stringify(state.discount)),
    archive: loadArchive(),
    customers: loadCustomers(),
    worksites: JSON.parse(localStorage.getItem("mainabdichter_v18_worksites") || "[]"),
    communicationNotes: loadCommunicationNotes(),
    emailInboxState: loadEmailInboxState(),
    visitSavepoint: readStoredJson(VISIT_EXPLICIT_SAVEPOINT_KEY, null),
    drafts: readStoredJson(DRAFTS_KEY, []),
    reminders: readStoredJson(REMINDERS_KEY, []),
    activeDraftId: localStorage.getItem(ACTIVE_DRAFT_KEY) || "",
    metadata: {
      source: "mainabdichter",
      containsSensitiveConnectionData: Boolean(
        state.settings.workerUrl || state.settings.appSecret
      )
    }
  };
}

function recordTime(record) {
  return Date.parse(record?.updatedAt || record?.createdAt || "") || 0;
}

function mergeRecords(remoteItems, localItems) {
  const merged = new Map();
  for (const item of Array.isArray(remoteItems) ? remoteItems : []) {
    const key = String(item?.id || item?.pipedriveId || crypto.randomUUID());
    merged.set(key, item);
  }
  for (const item of Array.isArray(localItems) ? localItems : []) {
    const key = String(item?.id || item?.pipedriveId || crypto.randomUUID());
    const current = merged.get(key);
    if (!current || recordTime(item) >= recordTime(current)) merged.set(key, item);
  }
  return [...merged.values()].sort((a, b) => recordTime(b) - recordTime(a));
}

function visitHasBusinessData(visit) {
  const customer = visit?.customer || {};
  return Boolean(
    customer.firstName || customer.lastName || customer.company ||
    customer.objectAddress || customer.street ||
    (Array.isArray(visit?.areas) && visit.areas.length)
  );
}

export function backupHasBusinessData(payload) {
  return Boolean(
    (Array.isArray(payload?.archive) && payload.archive.length) ||
    (Array.isArray(payload?.customers) && payload.customers.length) ||
    (Array.isArray(payload?.worksites) && payload.worksites.length) ||
    (Array.isArray(payload?.drafts) && payload.drafts.length) ||
    (Array.isArray(payload?.reminders) && payload.reminders.length) ||
    visitHasBusinessData(payload?.visit)
  );
}

/**
 * Beim Start oder Gerätewechsel ist die zentrale Sicherung die einzige
 * verbindliche Quelle. Nur die Zugangsdaten zum Worker bleiben lokal, weil
 * sie benötigt werden, bevor die zentrale Sicherung überhaupt geladen werden
 * kann. Sämtliche Betriebsdaten – insbesondere Lager, Kunden, Besichtigungen,
 * Baustellen und Arbeitsnachweise – stammen vollständig vom Server.
 */
export function createServerAuthoritativePayload(remotePayload, localPayload = {}) {
  if (!remotePayload || typeof remotePayload !== "object") {
    throw new Error("Die zentrale Sicherung ist ungültig.");
  }

  const localConnection = {
    workerUrl: localPayload.settings?.workerUrl || "",
    appSecret: localPayload.settings?.appSecret || ""
  };
  const settings = merge(DEFAULTS.settings, remotePayload.settings || {});

  if (localConnection.workerUrl) settings.workerUrl = localConnection.workerUrl;
  if (localConnection.appSecret) settings.appSecret = localConnection.appSecret;

  return {
    ...clone(remotePayload),
    settings,
    metadata: {
      ...(remotePayload.metadata || {}),
      source: "mainabdichter",
      restoredServerAuthoritativelyAt: new Date().toISOString()
    }
  };
}

export function mergeFullBackupPayload(remotePayload, localPayload) {
  if (!remotePayload || typeof remotePayload !== "object") return localPayload;
  if (!localPayload || typeof localPayload !== "object") return remotePayload;

  const localHasData = backupHasBusinessData(localPayload);
  const localConnection = {
    workerUrl: localPayload.settings?.workerUrl || "",
    appSecret: localPayload.settings?.appSecret || ""
  };
  const settings = localHasData
    ? merge(remotePayload.settings || {}, localPayload.settings || {})
    : merge(localPayload.settings || {}, remotePayload.settings || {});

  // Die auf diesem Gerät bereits funktionierende Verbindung darf durch eine
  // ältere oder unvollständige Sicherung nicht entfernt werden.
  if (localConnection.workerUrl) settings.workerUrl = localConnection.workerUrl;
  if (localConnection.appSecret) settings.appSecret = localConnection.appSecret;

  return {
    ...remotePayload,
    ...localPayload,
    settings,
    visit: localHasData && visitHasBusinessData(localPayload.visit)
      ? localPayload.visit
      : remotePayload.visit || localPayload.visit,
    discount: localHasData
      ? localPayload.discount || remotePayload.discount
      : remotePayload.discount || localPayload.discount,
    archive: mergeRecords(remotePayload.archive, localPayload.archive),
    customers: mergeRecords(remotePayload.customers, localPayload.customers),
    worksites: mergeRecords(remotePayload.worksites, localPayload.worksites),
    communicationNotes: mergeRecords(remotePayload.communicationNotes, localPayload.communicationNotes),
    emailInboxState: {
      processedIds: Array.from(new Set([
        ...(remotePayload.emailInboxState?.processedIds || []),
        ...(localPayload.emailInboxState?.processedIds || [])
      ])).slice(-2000),
      assignments: {
        ...(remotePayload.emailInboxState?.assignments || {}),
        ...(localPayload.emailInboxState?.assignments || {})
      },
      updatedAt: new Date().toISOString()
    },
    exportedAt: new Date().toISOString(),
    metadata: {
      ...(remotePayload.metadata || {}),
      ...(localPayload.metadata || {}),
      source: "mainabdichter",
      mergedDuringDeviceSetup: true
    }
  };
}

export function restoreFullBackupPayload(payload) {
  if (!payload || typeof payload !== "object") {
    throw new Error("Ungültige Sicherungsdatei.");
  }

  if (payload.settings && typeof payload.settings === "object") {
    state.settings = payload.settings;
    localStorage.setItem(KEYS.settings, JSON.stringify(state.settings));
  }

  if (payload.visit && typeof payload.visit === "object") {
    state.visit = payload.visit;
    localStorage.setItem(KEYS.visit, JSON.stringify(state.visit));
  }

  if (payload.discount && typeof payload.discount === "object") {
    state.discount = payload.discount;
    localStorage.setItem(KEYS.discount, JSON.stringify(state.discount));
  }

  if (Array.isArray(payload.archive)) {
    replaceArchive(payload.archive);
  }

  if (Array.isArray(payload.customers)) {
    localStorage.setItem(CUSTOMERS_KEY, JSON.stringify(payload.customers));
  }

  if (Array.isArray(payload.worksites)) {
    localStorage.setItem("mainabdichter_v18_worksites", JSON.stringify(payload.worksites));
  }

  if (Array.isArray(payload.communicationNotes)) {
    localStorage.setItem(COMMUNICATION_NOTES_KEY, JSON.stringify(payload.communicationNotes));
  }

  if (payload.emailInboxState && typeof payload.emailInboxState === "object") {
    saveEmailInboxState(payload.emailInboxState);
  }

  if (payload.visitSavepoint && typeof payload.visitSavepoint === "object") {
    localStorage.setItem(VISIT_EXPLICIT_SAVEPOINT_KEY, JSON.stringify(payload.visitSavepoint));
  } else {
    localStorage.removeItem(VISIT_EXPLICIT_SAVEPOINT_KEY);
  }

  if (Array.isArray(payload.drafts)) {
    localStorage.setItem(DRAFTS_KEY, JSON.stringify(payload.drafts));
  }

  if (Array.isArray(payload.reminders)) {
    localStorage.setItem(REMINDERS_KEY, JSON.stringify(payload.reminders));
  }

  if (payload.activeDraftId) {
    localStorage.setItem(ACTIVE_DRAFT_KEY, String(payload.activeDraftId));
  } else {
    localStorage.removeItem(ACTIVE_DRAFT_KEY);
  }

  return {
    settingsRestored: Boolean(payload.settings),
    visitRestored: Boolean(payload.visit),
    discountRestored: Boolean(payload.discount),
    archiveCount: Array.isArray(payload.archive)
      ? payload.archive.length
      : 0,
    customerCount: Array.isArray(payload.customers)
      ? payload.customers.length
      : 0,
    worksiteCount: Array.isArray(payload.worksites)
      ? payload.worksites.length
      : 0,
    communicationNoteCount: Array.isArray(payload.communicationNotes)
      ? payload.communicationNotes.length
      : 0,
    draftCount: Array.isArray(payload.drafts) ? payload.drafts.length : 0,
    reminderCount: Array.isArray(payload.reminders) ? payload.reminders.length : 0
  };
}
