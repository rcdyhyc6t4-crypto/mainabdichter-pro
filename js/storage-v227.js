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
    version: 21.0,
    exportedAt: new Date().toISOString(),
    settings: JSON.parse(JSON.stringify(state.settings)),
    visit: JSON.parse(JSON.stringify(state.visit)),
    discount: JSON.parse(JSON.stringify(state.discount)),
    archive: loadArchive(),
    customers: loadCustomers(),
    worksites: JSON.parse(localStorage.getItem("mainabdichter_v18_worksites") || "[]"),
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
    visitHasBusinessData(payload?.visit)
  );
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
      : 0
  };
}
