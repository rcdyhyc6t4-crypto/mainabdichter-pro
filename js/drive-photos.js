import { state, saveState } from "./storage-v227.js";
import { uploadDriveVisitPhoto, loadDrivePhoto } from "./api-v227.js";

const DB_NAME = "mainabdichter-photo-queue";
const STORE = "photos";
const previewUrls = new Map();

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
  return String(value || fallback).trim().replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").slice(0, 80);
}

function customerFolder() {
  const c = state.visit.customer || {};
  return safePart([c.lastName, c.firstName].filter(Boolean).join(", ") || c.company, "Unbekannter Kunde");
}

function findPhoto(photoId) {
  for (const area of state.visit.areas || []) {
    const photo = (area.photos || []).find(item => item.id === photoId);
    if (photo) return photo;
  }
}

function dataUrlToBlob(dataUrl) {
  const [header, encoded] = String(dataUrl || "").split(",");
  const mimeType = header?.match(/data:([^;]+)/)?.[1] || "image/jpeg";
  const bytes = atob(encoded || "");
  const array = new Uint8Array(bytes.length);
  for (let index = 0; index < bytes.length; index += 1) array[index] = bytes.charCodeAt(index);
  return new Blob([array], { type: mimeType });
}

export async function stageVisitPhoto(file, area) {
  const id = crypto.randomUUID();
  const extension = (file.name?.split(".").pop() || "jpg").toLowerCase();
  const photo = {
    id, caption: "", show: true, uploadStatus: "pending", driveFileId: "",
    driveUrl: "", filename: `${safePart(area.name, "Bereich")}-${Date.now()}.${extension}`,
    mimeType: file.type || "image/jpeg", createdAt: new Date().toISOString()
  };
  area.photos.push(photo);
  previewUrls.set(id, URL.createObjectURL(file));
  await transact("readwrite", store => store.put({
    id, blob: file, metadata: {
      photoId: id,
      customerFolder: customerFolder(),
      visitFolder: safePart(state.visit.visitNumber, `Besichtigung-${state.visit.visitDate || "ohne Datum"}`),
      areaFolder: safePart(area.name, "Allgemein"),
      filename: photo.filename,
      mimeType: photo.mimeType
    }
  }));
  saveState();
  return photo;
}

export function localPhotoUrl(photo) {
  return previewUrls.get(photo.id) || photo.src || "";
}

export async function syncPendingVisitPhotos() {
  if (!navigator.onLine) return;
  const queued = await transact("readonly", store => store.getAll());
  for (const item of queued) {
    const photo = findPhoto(item.id);
    if (!photo) {
      await transact("readwrite", store => store.delete(item.id));
      continue;
    }
    photo.uploadStatus = "uploading";
    photo.uploadError = "";
    saveState();
    window.dispatchEvent(new CustomEvent("drive-photo-updated"));
    try {
      const file = new File([item.blob], item.metadata.filename, { type: item.metadata.mimeType });
      const result = await uploadDriveVisitPhoto(file, item.metadata);
      photo.driveFileId = result.file.id;
      photo.driveUrl = result.file.webViewLink || "";
      photo.uploadStatus = "uploaded";
      delete photo.src;
      await transact("readwrite", store => store.delete(item.id));
    } catch (error) {
      photo.uploadStatus = "error";
      photo.uploadError = error.message;
    }
    saveState();
    window.dispatchEvent(new CustomEvent("drive-photo-updated"));
  }
}

export async function migrateEmbeddedVisitPhotos() {
  let changed = false;
  for (const area of state.visit.areas || []) {
    for (const photo of area.photos || []) {
      if (!photo.src?.startsWith("data:")) continue;
      const blob = dataUrlToBlob(photo.src);
      const filename = photo.filename || `${safePart(area.name, "Bereich")}-${Date.now()}.jpg`;
      await transact("readwrite", store => store.put({
        id: photo.id,
        blob,
        metadata: {
          photoId: photo.id,
          customerFolder: customerFolder(),
          visitFolder: safePart(state.visit.visitNumber, `Besichtigung-${state.visit.visitDate || "ohne Datum"}`),
          areaFolder: safePart(area.name, "Allgemein"),
          filename,
          mimeType: blob.type || "image/jpeg"
        }
      }));
      delete photo.src;
      photo.filename = filename;
      photo.mimeType = blob.type || "image/jpeg";
      photo.uploadStatus ||= "pending";
      changed = true;
    }
  }
  if (changed) saveState();
  return changed;
}

export async function hydrateDrivePhotoImages(root = document) {
  const images = [...root.querySelectorAll("img[data-drive-file]")];
  await Promise.all(images.map(async image => {
    if (image.dataset.loaded === "true") return;
    try {
      image.src = URL.createObjectURL(await loadDrivePhoto(image.dataset.driveFile));
      image.dataset.loaded = "true";
    } catch {
      image.alt = "Drive-Foto momentan nicht verfügbar";
    }
  }));
}

window.addEventListener("online", () => syncPendingVisitPhotos());
