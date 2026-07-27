const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");

const sync = readFileSync("js/pipedrive-sync-v227.js", "utf8");
const worker = readFileSync("cloudflare-worker.js", "utf8");
const app = readFileSync("js/app.js", "utf8");

assert.match(sync, /type\.includes\("varchar"\)/);
assert.match(sync, /String\(value\)\.slice\(0,255\)/);
assert.match(worker, /field\.type\.includes\("varchar"\) \? text\.slice\(0, 255\) : text/);
assert.match(worker, /wurde sicher auf 255 Zeichen gekürzt/);
assert.match(app, /ws\.pipedrivePendingSync = true/);
assert.match(app, /ws\.status = "planned"/);
assert.doesNotMatch(app, /catch \(error\) \{\s*ws\.status = "planning"/);
assert.match(app, /<strong>Ausführung und Besonderheiten<\/strong>/);

console.log("Pipedrive-Kurztexte und lokale Planungssicherheit geprüft.");
