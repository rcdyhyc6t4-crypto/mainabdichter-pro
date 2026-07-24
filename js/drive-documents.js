import { state, saveState } from "./storage-v227.js";
import { uploadDriveVisitDocument } from "./api-v227.js";

const DB_NAME = "mainabdichter-document-queue";
const STORE = "documents";

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: "id" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function transact(mode, action) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const request = action(tx.objectStore(STORE));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => db.close();
  });
}

function safePart(value, fallback) {
  return String(value || fallback).trim().replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").slice(0, 100);
}

function customerFolder() {
  const c = state.visit.customer || {};
  return safePart([c.lastName, c.firstName].filter(Boolean).join(", ") || c.company, "Unbekannter Kunde");
}

const FOLDERS = {
  "Grundriss": "Pläne und Grundrisse",
  "Bauplan": "Pläne und Grundrisse",
  "Skizze": "Pläne und Grundrisse",
  "Gutachten": "Gutachten",
  "Messung": "Messungen",
  "Angebot / Rechnung": "Angebote und Rechnungen",
  "Arbeitsnachweis": "Arbeitsnachweise",
  "Herstellerunterlage": "Herstellerunterlagen",
  "Sonstiges": "Sonstige Dokumente"
};

export async function stageVisitDocument(file, category, note = "") {
  state.visit.documents ||= [];
  const id = crypto.randomUUID();
  const document = {
    id,
    category,
    note,
    filename: safePart(file.name, `Dokument-${Date.now()}`),
    mimeType: file.type || "application/octet-stream",
    size: file.size,
    uploadStatus: "pending",
    driveFileId: "",
    driveUrl: "",
    createdAt: new Date().toISOString()
  };
  state.visit.documents.push(document);
  await transact("readwrite", store => store.put({
    id,
    blob: file,
    metadata: {
      documentId: id,
      customerFolder: customerFolder(),
      visitFolder: safePart(state.visit.visitNumber, `Besichtigung-${state.visit.visitDate || "ohne Datum"}`),
      category,
      categoryFolder: FOLDERS[category] || FOLDERS.Sonstiges,
      filename: document.filename,
      mimeType: document.mimeType,
      note
    }
  }));
  saveState();
  return document;
}

export async function syncPendingVisitDocuments() {
  if (!navigator.onLine) return;
  const queued = await transact("readonly", store => store.getAll());
  for (const item of queued) {
    const document = (state.visit.documents || []).find(entry => entry.id === item.id);
    if (!document) {
      await transact("readwrite", store => store.delete(item.id));
      continue;
    }
    document.uploadStatus = "uploading";
    document.uploadError = "";
    saveState();
    window.dispatchEvent(new CustomEvent("drive-document-updated"));
    try {
      const file = new File([item.blob], item.metadata.filename, { type: item.metadata.mimeType });
      const result = await uploadDriveVisitDocument(file, item.metadata);
      document.driveFileId = result.file.id;
      document.driveUrl = result.file.webViewLink || "";
      document.uploadStatus = "uploaded";
      await transact("readwrite", store => store.delete(item.id));
    } catch (error) {
      document.uploadStatus = "error";
      document.uploadError = error.message;
    }
    saveState();
    window.dispatchEvent(new CustomEvent("drive-document-updated"));
  }
}

export async function deleteQueuedVisitDocument(id) {
  await transact("readwrite", store => store.delete(id));
}

window.addEventListener("online", () => syncPendingVisitDocuments());
