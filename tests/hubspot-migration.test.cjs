const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");

const worker = readFileSync("cloudflare-worker.js", "utf8");
const api = readFileSync("js/api-v227.js", "utf8");
const customers = readFileSync("js/customers.js", "utf8");
const html = readFileSync("index.html", "utf8");

assert.match(worker, /MAINABDICHTER_PIPELINE_ID = "4129198267"/);
assert.match(worker, /MAINABDICHTER_NEW_STAGE_ID = "6073476334"/);
assert.match(worker, /name: "pipedrive_person_id"/);
assert.match(worker, /name: "pipedrive_deal_id"/);
assert.match(worker, /searchHubspot\(env, "contacts", "pipedrive_person_id"/);
assert.match(worker, /searchHubspot\(env, "deals", "pipedrive_deal_id"/);
assert.match(worker, /url\.pathname === "\/hubspot\/migrate-pipedrive"/);
assert.match(worker, /geschaftsbereich: "Mainabdichter"/);
assert.match(worker, /associations\/default\/contacts/);
assert.match(worker, /buildPipedriveArchiveText/);

const migrationStart = worker.indexOf("async function migratePipedriveToHubspot");
const routeStart = worker.indexOf("export default", migrationStart);
const migrationCode = worker.slice(migrationStart, routeStart);
assert.ok(migrationStart > 0 && routeStart > migrationStart);
assert.doesNotMatch(migrationCode, /pipedriveRequest\([^\n]*method:\s*"(?:POST|PATCH|PUT|DELETE)"/);

assert.match(api, /export async function migratePipedriveToHubSpot/);
assert.match(customers, /migrateActiveCustomerToHubSpot/);
assert.match(customers, /hubspotDealIds/);
assert.match(html, /id="customerRecordMigrateHubSpot"/);
assert.match(html, /id="stateHubSpot"/);

console.log("HubSpot-Migration: Pipeline, Dublettenschutz, UI und Pipedrive-Leseprinzip geprüft.");
