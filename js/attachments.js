const DB_NAME = "mainabdichter_attachments_v1";
const STORE = "attachments";

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      const store = db.createObjectStore(STORE, { keyPath: "id" });
      store.createIndex("worksiteId", "worksiteId", { unique: false });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Dateispeicher konnte nicht geöffnet werden."));
  });
}

function requestPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Dateispeicher-Fehler."));
  });
}

export async function addWorksiteAttachment(worksiteId, file, meta = {}) {
  if (!file) throw new Error("Keine Datei ausgewählt.");
  const db = await openDb();
  const record = {
    id: crypto.randomUUID(),
    worksiteId,
    filename: file.name || `Datei_${Date.now()}`,
    mimeType: file.type || "application/octet-stream",
    size: file.size || 0,
    category: meta.category || "Sonstiges",
    note: meta.note || "",
    createdAt: new Date().toISOString(),
    uploadStatus: "pending",
    uploadedAt: "",
    pipedriveFileId: "",
    error: "",
    blob: file
  };
  await requestPromise(db.transaction(STORE, "readwrite").objectStore(STORE).put(record));
  db.close();
  return record;
}

export async function listWorksiteAttachments(worksiteId) {
  const db = await openDb();
  const items = await requestPromise(
    db.transaction(STORE, "readonly").objectStore(STORE).index("worksiteId").getAll(worksiteId)
  );
  db.close();
  return (items || []).sort((a,b) => String(a.createdAt).localeCompare(String(b.createdAt)));
}

export async function updateWorksiteAttachment(record) {
  const db = await openDb();
  await requestPromise(db.transaction(STORE, "readwrite").objectStore(STORE).put(record));
  db.close();
  return record;
}

export async function deleteWorksiteAttachment(id) {
  const db = await openDb();
  await requestPromise(db.transaction(STORE, "readwrite").objectStore(STORE).delete(id));
  db.close();
}

export function attachmentLabel(record) {
  return [record.category, record.note].filter(Boolean).join(" – ") || record.filename;
}

export function safeAttachmentFilename(record, prefix = "") {
  const clean = value => String(value || "")
    .replace(/[^a-zA-Z0-9ÄÖÜäöüß._-]+/g, "_")
    .replace(/^_+|_+$/g, "");
  const original = clean(record.filename || "Datei");
  const category = clean(record.category || "Unterlage");
  return [clean(prefix), category, original].filter(Boolean).join("_");
}
