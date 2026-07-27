const fs = require("node:fs");
const assert = require("node:assert/strict");

const api = fs.readFileSync("js/api-v227.js", "utf8");
const app = fs.readFileSync("js/app.js", "utf8");
const worker = fs.readFileSync("cloudflare-worker.js", "utf8");
const html = fs.readFileSync("index.html", "utf8");

assert.match(api, /createLexwareInvoiceDraft/);
assert.match(api, /\/lexware\/invoices\/from-quotation/);
assert.match(worker, /precedingSalesVoucherId=/);
assert.match(worker, /finalize=false/);
assert.doesNotMatch(worker.match(/url\.pathname === "\/lexware\/invoices\/from-quotation"[\s\S]*?return jsonResponse\([\s\S]*?201\s*\);/)?.[0] || "", /finalize=true/);
assert.match(html, /id="createLexwareInvoiceDraft"/);
assert.match(app, /ws\.invoiceStatus = "draft-created"/);
assert.match(app, /ws\.lexwareInvoiceEditUrl/);

console.log("Lexoffice-Rechnungsentwurf-Test bestanden.");
