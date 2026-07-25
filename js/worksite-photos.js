import { uploadDriveVisitPhoto, loadDrivePhoto } from "./api-v227.js";
import { loadWorksites, saveWorksites } from "./construction.js?v=32.7.5";

const DB_NAME = "mainabdichter-worksite-photos";
const STORE = "photos";
const previewUrls = new Map();

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: "id" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Der Fotospeicher konnte nicht geöffnet werden."));
  });
}

async function transact(mode, action) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const request = action(tx.objectStore(STORE));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Fotospeicher-Fehler."));
    tx.oncomplete = () => db.close();
  });
}

function safePart(value, fallback) {
  return String(value || fallback)
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, " ")
    .slice(0, 90);
}

function dataUrlToBlob(dataUrl) {
  const [header, encoded] = String(dataUrl || "").split(",");
  const mimeType = header?.match(/data:([^;]+)/)?.[1] || "image/jpeg";
  const bytes = atob(encoded || "");
  const array = new Uint8Array(bytes.length);
  for (let index = 0; index < bytes.length; index += 1) array[index] = bytes.charCodeAt(index);
  return new Blob([array], { type: mimeType });
}

async function compressPhoto(file) {
  const bitmap = await createImageBitmap(file);
  const maxEdge = 1280;
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/jpeg", .68));
  if (!blob) throw new Error("Das Foto konnte nicht komprimiert werden.");
  return blob;
}

export async function stageWorksitePhoto(file, worksite, task, category) {
  const id = crypto.randomUUID();
  const blob = await compressPhoto(file);
  const filename = `${safePart(task.workArea || task.areaName, "Baustelle")}-${Date.now()}.jpg`;
  await transact("readwrite", store => store.put({
    id,
    worksiteId: worksite.id,
    taskId: task.id,
    blob,
    filename,
    mimeType: "image/jpeg",
    category: category || "Ausführung",
    createdAt: new Date().toISOString()
  }));
  previewUrls.set(id, URL.createObjectURL(blob));
  return {
    id,
    category: category || "Ausführung",
    filename,
    mimeType: "image/jpeg",
    uploadStatus: "pending",
    driveFileId: "",
    driveUrl: ""
  };
}

export async function deleteWorksitePhoto(photoId) {
  const url = previewUrls.get(photoId);
  if (url) URL.revokeObjectURL(url);
  previewUrls.delete(photoId);
  await transact("readwrite", store => store.delete(photoId));
}

export async function hydrateWorksitePhotoImages(root = document) {
  const images = [...root.querySelectorAll("img[data-worksite-photo]")];
  await Promise.all(images.map(async image => {
    const photoId = image.dataset.worksitePhoto;
    if (!photoId || image.dataset.loaded === "true") return;
    try {
      let url = previewUrls.get(photoId);
      if (!url) {
        const record = await transact("readonly", store => store.get(photoId));
        if (record?.blob) {
          url = URL.createObjectURL(record.blob);
          previewUrls.set(photoId, url);
        }
      }
      if (!url && image.dataset.driveFile) {
        url = URL.createObjectURL(await loadDrivePhoto(image.dataset.driveFile));
        previewUrls.set(photoId, url);
      }
      if (url) {
        image.src = url;
        image.dataset.loaded = "true";
      }
    } catch {
      image.alt = "Foto momentan nicht verfügbar";
    }
  }));
}

export async function syncWorksitePhotos(worksite) {
  if (!navigator.onLine) throw new Error("Keine Internetverbindung für den Google-Drive-Fotoupload.");
  let uploadedCount = 0;
  const errors = [];
  for (const task of worksite.tasks || []) {
    for (const photo of task.photos || []) {
      if (photo.driveFileId) continue;
      try {
        const record = await transact("readonly", store => store.get(photo.id));
        if (!record?.blob) continue;
        photo.uploadStatus = "uploading";
        const file = new File([record.blob], record.filename, { type: record.mimeType || "image/jpeg" });
        const customer = worksite.customer || {};
        const customerFolder = safePart(
          [customer.lastName, customer.firstName].filter(Boolean).join(", ") || customer.company,
          "Unbekannter Kunde"
        );
        const result = await uploadDriveVisitPhoto(file, {
          photoId: photo.id,
          customerFolder,
          visitFolder: safePart(
            `Baustelle ${worksite.date || ""} ${worksite.visitNumber || ""}`,
            `Baustelle-${worksite.date || "ohne Datum"}`
          ),
          areaFolder: safePart(task.workArea || task.areaName, "Ausführung"),
          filename: record.filename,
          mimeType: record.mimeType
        });
        photo.driveFileId = result.file.id;
        photo.driveUrl = result.file.webViewLink || "";
        photo.uploadStatus = "uploaded";
        await transact("readwrite", store => store.delete(photo.id));
        uploadedCount += 1;
      } catch (error) {
        photo.uploadStatus = "error";
        photo.uploadError = error.message;
        errors.push(error.message);
      }
    }
  }
  return { uploadedCount, errors };
}

export async function migrateEmbeddedWorksitePhotos() {
  const worksites = loadWorksites();
  let changed = false;
  for (const worksite of worksites) {
    for (const task of worksite.tasks || []) {
      for (const photo of task.photos || []) {
        if (!photo.src?.startsWith("data:")) continue;
        try {
          const blob = dataUrlToBlob(photo.src);
          await transact("readwrite", store => store.put({
            id: photo.id,
            worksiteId: worksite.id,
            taskId: task.id,
            blob,
            filename: photo.filename || `${safePart(task.workArea || task.areaName, "Baustelle")}-${Date.now()}.jpg`,
            mimeType: blob.type || "image/jpeg",
            category: photo.category || "Ausführung",
            createdAt: photo.createdAt || new Date().toISOString()
          }));
          delete photo.src;
          photo.uploadStatus ||= "pending";
          changed = true;
        } catch {}
      }
    }
  }
  if (changed) saveWorksites(worksites);
  return changed;
}
