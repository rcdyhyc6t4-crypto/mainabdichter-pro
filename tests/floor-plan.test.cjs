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
assert.match(html, /js\/floor-plan\.js\?v=32\.20\.7/);

assert.match(js, /state\.visit\.floorPlan/);
assert.match(js, /surfacePolygon/);
assert.match(js, /w\.length\*w\.surfaceHeight/);
assert.match(js, /floor-plan\/analyze/);
assert.match(js, /sourceImage/);
assert.match(js, /timeoutMs:240000/);
assert.match(js, /finally/);
assert.match(js, /createImageBitmap/);
assert.match(js, /new Image\(\)/);
assert.match(js, /image_width:current\.sourceWidth/);
assert.match(js, /alignmentScore < \.82/);
assert.match(js, /current\.sourceWidth \|\| analysis\.canvas_width/);
assert.match(js, /detectLineCandidates/);
assert.match(js, /line_candidates:lineCandidates/);
assert.match(js, /window\.alert\(message\)/);

assert.match(worker, /OPENAI_API_KEY/);
assert.match(worker, /\/floor-plan\/analyze/);
assert.match(worker, /Gedruckte oder handschriftlich eingetragene Maße sind verbindlicher als Pixellängen/);
assert.match(worker, /bereits echte dunkle Linien ermittelt/);
assert.match(worker, /gpt-5\.6-luna/);
assert.match(worker, /gpt-5\.6-terra/);
assert.match(worker, /requestFloorPlanAnalysis/);
assert.match(worker, /FLOOR_PLAN_ANALYSIS_FAILED/);
assert.match(worker, /unveränderte Originalbild/);
assert.match(worker, /FLOOR_PLAN_ALIGNMENT_REJECTED/);
assert.match(worker, /source_line_id/);
assert.match(worker, /candidateMap/);
assert.doesNotMatch(worker, /in der entzerrten Planfläche/);
assert.match(wrangler, /"main": "cloudflare-worker\.js"/);
assert.match(wrangler, /"keep_vars": true/);

console.log("floor-plan.test.cjs: OK");
