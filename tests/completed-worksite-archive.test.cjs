const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const app = fs.readFileSync(path.join(__dirname, "../js/app.js"), "utf8");
const customers = fs.readFileSync(path.join(__dirname, "../js/customers.js"), "utf8");
const html = fs.readFileSync(path.join(__dirname, "../index.html"), "utf8");

assert.match(app, /allWorksites\.filter\(item => item\.status !== "completed"\)/);
assert.match(app, /mainabdichter:open-worksite-record/);
assert.match(app, /activeWorksiteId = null;[\s\S]*renderWorksites\(\);/);
assert.match(customers, /data-customer-worksite/);
assert.match(customers, /worksite\.status === "completed" \? "Arbeitsnachweis"/);
assert.match(customers, /section:"wsSectionReport"/);
assert.match(html, /Baustellen und Arbeitsnachweise/);

console.log("Abgeschlossene Baustellen werden ausgeblendet und bleiben in der Kundenakte aufrufbar.");
