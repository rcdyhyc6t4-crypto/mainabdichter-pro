const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(path.join(__dirname, "..", "js", "app.js"), "utf8");
const start = source.indexOf("async function restoreUnsyncedLocalCopy()");
const end = source.indexOf("\nasync function uploadPendingLocalChangesIfSafe", start);
const recoveryFunction = source.slice(start, end);

assert(start >= 0 && end > start, "Rettungsfunktion muss vorhanden sein");
assert(
  recoveryFunction.includes("mergeFullBackupPayload(response.backup, recovery.payload)"),
  "Zentralstand und lokale Rettung müssen zusammengeführt werden"
);
assert(
  recoveryFunction.indexOf("saveDriveBackup(safePayload") <
    recoveryFunction.indexOf("restoreFullBackupPayload(safePayload)"),
  "Lokale Daten dürfen erst nach erfolgreicher zentraler Speicherung ersetzt werden"
);
assert(
  recoveryFunction.indexOf("restoreFullBackupPayload(safePayload)") <
    recoveryFunction.indexOf("localStorage.removeItem(LOCAL_CONFLICT_BACKUP_KEY)"),
  "Rettungskopie darf erst nach erfolgreichem Speichern und Wiederherstellen gelöscht werden"
);

console.log("Sichere lokale Rettungs-Zusammenführung: OK");
