const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const worker = fs.readFileSync(path.join(__dirname, "..", "cloudflare-worker.js"), "utf8");
const app = fs.readFileSync(path.join(__dirname, "..", "js", "app.js"), "utf8");

assert(worker.includes("function assertBackupCannotCollapse("));
assert(worker.includes('protection: "backup-collapse-blocked"'));
assert(worker.includes("incoming.bytes < current.bytes * 0.65"));
assert(worker.includes("await createDriveSafetySnapshot(env, currentFile, backups.id)"));
assert(worker.includes('"Sicherheitskopien"'));
assert(app.includes('error?.details?.protection === "backup-collapse-blocked"'));
assert(app.includes("der vollständige Zentralstand blieb unverändert"));

console.log("Serverseitiger Schutz gegen Datenbestands-Einbruch: OK");
