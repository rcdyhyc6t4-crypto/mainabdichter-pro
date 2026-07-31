const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");

const worker = readFileSync("cloudflare-worker.js", "utf8");
const app = readFileSync("js/app.js", "utf8");

assert.match(worker, /searchPipedrivePersonsExact\(env, email, "email"\)/);
assert.match(worker, /searchPipedrivePersonsExact\(env, phone, "phone"\)/);
assert.match(worker, /searchPipedrivePersonsExact\(env, name, "name"\)/);
assert.match(worker, /error\.status = 409/);
assert.doesNotMatch(worker, /String\(email \|\| phone \|\| ""\)/);
assert.match(app, /ensurePipedrivePerson\(customer, knownPersonId = ""\)/);
assert.match(app, /ensurePipedrivePerson\(worksite\.customer, worksite\.pipedrivePersonId\)/);

console.log("Pipedrive-Dublettenschutz geprüft.");
