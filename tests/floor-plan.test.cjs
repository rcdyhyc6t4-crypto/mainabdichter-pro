const fs = require("node:fs");
const assert = require("node:assert");

const html = fs.readFileSync("index.html", "utf8");
const js = fs.readFileSync("js/floor-plan.js", "utf8");
const worker = fs.readFileSync("cloudflare-worker.js", "utf8");
const wrangler = fs.readFileSync("wrangler.jsonc", "utf8");

assert.match(html, /id="openFloorPlan"/);
assert.match(html, /id="floorPlanStage"/);
assert.match(html, /value="Horizontalsperre"/);
assert.match(html, /value="Flächensperre"/);
assert.match(html, /id="floorPlanSurfaceHeight"/);
assert.match(html, /js\/floor-plan\.js\?v=32\.20\.3/);

assert.match(js, /state\.visit\.floorPlan/);
assert.match(js, /surfacePolygon/);
assert.match(js, /w\.length\*w\.surfaceHeight/);
assert.match(js, /floor-plan\/analyze/);
assert.match(js, /sourceImage/);
assert.match(js, /timeoutMs:120000/);
assert.match(js, /finally/);

assert.match(worker, /OPENAI_API_KEY/);
assert.match(worker, /\/floor-plan\/analyze/);
assert.match(worker, /Gedruckte oder handschriftlich eingetragene Maße sind verbindlicher als Pixellängen/);
assert.match(worker, /Falten, Knicke, Wellen und Kamerawinkel/);
assert.match(worker, /gpt-5\.6-luna/);
assert.match(wrangler, /"main": "cloudflare-worker\.js"/);
assert.match(wrangler, /"keep_vars": true/);

console.log("floor-plan.test.cjs: OK");
