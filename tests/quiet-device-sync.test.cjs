const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const app = fs.readFileSync(path.join(root, "js/app.js"), "utf8");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const css = fs.readFileSync(path.join(root, "css/app.css"), "utf8");

assert.match(app, /const DEVICE_ID_KEY/);
assert.match(app, /offline · lokal gespeichert/);
assert.match(app, /isUserActivelyWorking\(\)/);
assert.match(app, /noteBackgroundUpload\(120000\)/);
assert.match(app, /deferredRemoteResponse/);
assert.match(app, /mergeFullBackupPayload\(response\.backup, localPayload\)/);
assert.match(app, /preserveUnsyncedLocalCopy\(localPayload/);
assert.doesNotMatch(app, /createServerAuthoritativePayload\(response\.backup, localPayload\)/);
assert.doesNotMatch(app, /synchronizeFromDrive\(\{\s*force:\s*true,\s*gate:\s*true/);

assert.match(html, /aria-label="Besichtigung speichern und später fortsetzen">▣ Speichern/);
assert.match(html, /aria-label="Besichtigungsprotokoll prüfen">✓ Prüfen/);
assert.match(html, /aria-label="Besichtigung abschließen und Angebot öffnen">→ Angebot/);
assert.match(html, /Weitere Möglichkeiten/);
assert.match(css, /\.remote-update-notice/);
assert.match(css, /\.visit-more-actions/);

console.log("Ruhige Gerätesynchronisierung und Besichtigungsabschluss: OK");
