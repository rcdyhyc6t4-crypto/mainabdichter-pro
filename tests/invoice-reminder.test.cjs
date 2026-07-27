const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const app = fs.readFileSync(path.join(__dirname, "../js/app.js"), "utf8");
const html = fs.readFileSync(path.join(__dirname, "../index.html"), "utf8");
const customers = fs.readFileSync(path.join(__dirname, "../js/customers.js"), "utf8");

assert.match(app, /status === "completed" && worksite\.invoiceStatus !== "invoiced"/);
assert.match(app, /worksiteViewFilter="invoice"/);
assert.match(app, /ws\.invoiceStatus="pending"/);
assert.match(app, /ws\.invoiceStatus = "invoiced"/);
assert.match(html, /id="v28PendingInvoicesCard"/);
assert.match(html, /id="markWorksiteInvoiced"/);
assert.match(customers, /Rechnung offen/);
assert.match(customers, /Rechnung geschrieben/);

console.log("Rechnungserinnerung, Dashboard-Filter und Kundenaktenstatus geprüft.");
