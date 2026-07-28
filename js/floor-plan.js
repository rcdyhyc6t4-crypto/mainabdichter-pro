import { state, saveState } from "./storage-v227.js";
import { api } from "./api-v227.js";

const $ = id => document.getElementById(id);
const parseDE = value => Number(String(value ?? "").trim().replace(",", ".")) || 0;
const formatDE = (value, digits = 2) => Number(value || 0).toLocaleString("de-DE", { minimumFractionDigits: digits, maximumFractionDigits: digits });
let activeWallId = "";

function plan() {
  state.visit.floorPlan ||= { sourceImage:"", analysis:null, walls:[], createdAt:new Date().toISOString() };
  return state.visit.floorPlan;
}

async function imageData(file) {
  let source;
  let objectUrl = "";
  try {
    source = await createImageBitmap(file);
  } catch {
    objectUrl = URL.createObjectURL(file);
    source = await new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("Dieses Bildformat kann auf dem Gerät nicht gelesen werden. Bitte als Foto oder JPEG speichern."));
      image.src = objectUrl;
    });
  }
  const sourceWidth = source.width || source.naturalWidth;
  const sourceHeight = source.height || source.naturalHeight;
  const max = 1600;
  const scale = Math.min(1, max / Math.max(sourceWidth, sourceHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(sourceWidth * scale);
  canvas.height = Math.round(sourceHeight * scale);
  canvas.getContext("2d").drawImage(source, 0, 0, canvas.width, canvas.height);
  if (typeof source.close === "function") source.close();
  if (objectUrl) URL.revokeObjectURL(objectUrl);
  return {
    dataUrl: canvas.toDataURL("image/jpeg", .9),
    width: canvas.width,
    height: canvas.height
  };
}

function openDialog() {
  $("floorPlanDialog").classList.remove("hidden");
  render();
}

function closeDialog() {
  $("floorPlanDialog").classList.add("hidden");
  activeWallId = "";
}

async function useFile(file) {
  if (!file) return;
  $("floorPlanAnalyzeStatus").textContent = "Foto wird für die Analyse vorbereitet …";
  try {
    const current = plan();
    const prepared = await imageData(file);
    current.sourceImage = prepared.dataUrl;
    current.sourceWidth = prepared.width;
    current.sourceHeight = prepared.height;
    current.analysis = null;
    current.walls = [];
    current.updatedAt = new Date().toISOString();
    saveState();
    $("floorPlanPreview").src = current.sourceImage;
    $("floorPlanPreview").classList.remove("hidden");
    $("analyzeFloorPlan").disabled = false;
    $("floorPlanAnalyzeStatus").textContent = "Originalplan geladen. Die KI fährt die sichtbaren Wände direkt auf diesem Bild nach.";
  } catch (error) {
    $("analyzeFloorPlan").disabled = true;
    $("floorPlanAnalyzeStatus").textContent = `Bild konnte nicht vorbereitet werden: ${error.message}`;
  }
}

function normalizedWall(raw, index) {
  const p = value => Math.max(0, Math.min(1, Number(value || 0)));
  return {
    id: raw.id || `wand-${index + 1}`,
    label: raw.label || `Wand ${index + 1}`,
    x1:p(raw.x1), y1:p(raw.y1), x2:p(raw.x2), y2:p(raw.y2),
    length:Number(raw.length_m || raw.length || 0),
    thickness:Number(raw.thickness_cm || raw.thickness || 0),
    confidence:Number(raw.confidence || 0),
    measures:[],
    surfaceHeight:0,
    surfaceSide:1
  };
}

async function ensureSourceDimensions(current) {
  if (current.sourceWidth > 0 && current.sourceHeight > 0) return;
  const image = await new Promise((resolve, reject) => {
    const element = new Image();
    element.onload = () => resolve(element);
    element.onerror = () => reject(new Error("Die Abmessungen des Originalplans konnten nicht gelesen werden. Bitte den Plan erneut auswählen."));
    element.src = current.sourceImage;
  });
  current.sourceWidth = image.naturalWidth;
  current.sourceHeight = image.naturalHeight;
}

async function analyze() {
  const current = plan();
  if (!current.sourceImage) return;
  const button = $("analyzeFloorPlan");
  const originalLabel = button.textContent;
  button.disabled = true;
  button.textContent = "KI analysiert …";
  $("floorPlanAnalyzeStatus").textContent = "Sichtbare Wände werden direkt auf dem Originalplan gesucht und auf Deckung geprüft …";
  const startedAt = Date.now();
  const progressTimer = window.setInterval(() => {
    const seconds = Math.round((Date.now() - startedAt) / 1000);
    $("floorPlanAnalyzeStatus").textContent = seconds < 45
      ? `KI analysiert den Originalplan … ${seconds} Sekunden`
      : seconds < 120
        ? `Geometrie und Maßketten werden geprüft … ${seconds} Sekunden`
        : `Zweite Erkennungsstufe läuft … ${seconds} Sekunden`;
  }, 5000);
  try {
    await ensureSourceDimensions(current);
    const result = await api("/floor-plan/analyze", {
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({
        image:current.sourceImage,
        image_width:current.sourceWidth,
        image_height:current.sourceHeight
      }),
      timeoutMs:240000
    });
    if (!result.plan || !Array.isArray(result.plan.walls) || !result.plan.walls.length) {
      throw new Error("Die KI hat keine Wände zurückgegeben. Bitte den Plan erneut fotografieren oder ein schärferes Bild auswählen.");
    }
    const alignmentScore = Number(result.plan?.quality?.alignment_score || 0);
    if (alignmentScore < .82 || result.plan.source_coordinate_system !== true) {
      throw new Error("Die erkannten Linien liegen nicht sicher genug auf dem Originalplan. Das falsche Ergebnis wurde verworfen – bitte das Foto möglichst gerade und vollständig aufnehmen.");
    }
    current.analysis = result.plan;
    current.walls = (result.plan?.walls || []).map(normalizedWall);
    current.updatedAt = new Date().toISOString();
    saveState();
    activeWallId = "";
    render();
  } catch (error) {
    $("floorPlanAnalyzeStatus").textContent = `Analyse fehlgeschlagen: ${error.message || "Der Grundriss konnte nicht analysiert werden."}`;
  } finally {
    window.clearInterval(progressTimer);
    button.textContent = originalLabel;
    button.disabled = false;
  }
}

function surfacePolygon(wall, width, height) {
  if (!wall.measures.includes("Flächensperre") || !wall.surfaceHeight || !wall.length) return "";
  const x1=wall.x1*width,y1=wall.y1*height,x2=wall.x2*width,y2=wall.y2*height;
  const dx=x2-x1,dy=y2-y1,pixels=Math.hypot(dx,dy) || 1;
  const pxPerMeter=pixels/wall.length;
  const offset=Math.min(Math.max(wall.surfaceHeight*pxPerMeter,8),Math.max(width,height)*.45)*wall.surfaceSide;
  const nx=-dy/pixels*offset,ny=dx/pixels*offset;
  return `${x1},${y1} ${x2},${y2} ${x2+nx},${y2+ny} ${x1+nx},${y1+ny}`;
}

function renderSvg() {
  const current=plan(), analysis=current.analysis || {};
  const width=Number(current.sourceWidth || analysis.canvas_width || 1000);
  const height=Number(current.sourceHeight || analysis.canvas_height || 700);
  const surfaces=current.walls.map(w=>surfacePolygon(w,width,height)).filter(Boolean)
    .map(points=>`<polygon class="floor-plan-surface" points="${points}"/>`).join("");
  const walls=current.walls.map(w=>{
    const x1=w.x1*width,y1=w.y1*height,x2=w.x2*width,y2=w.y2*height, selected=w.measures.length?" selected":"";
    return `<g data-plan-wall="${w.id}"><line class="floor-plan-wall${selected}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/><line class="floor-plan-hit" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/><circle class="floor-plan-wall-dot${selected}" cx="${(x1+x2)/2}" cy="${(y1+y2)/2}" r="8"/></g>`;
  }).join("");
  return `<svg viewBox="0 0 ${width} ${height}" aria-label="Auf dem Originalbild deckungsgleich nachgezeichneter Grundriss"><image class="plan-original" href="${current.sourceImage}" x="0" y="0" width="${width}" height="${height}" preserveAspectRatio="none"/>${surfaces}${walls}</svg>`;
}

function renderQuality() {
  const quality=plan().analysis?.quality || {};
  const score=Math.min(Number(quality.score || 0),Number(quality.alignment_score || 0));
  const level=score>=.85?"high":score>=.65?"medium":"low";
  const label=level==="high"?"Geometrie und Maßketten eindeutig":level==="medium"?"Einzelne Maße bitte kontrollieren":"Unklare Stellen müssen bestätigt werden";
  $("floorPlanQuality").className=`floor-plan-quality ${level}`;
  $("floorPlanQuality").textContent=`${label}${score ? ` · ${Math.round(score*100)} %` : ""}`;
}

function openWall(id) {
  const wall=plan().walls.find(item=>item.id===id);
  if (!wall) return;
  activeWallId=id;
  $("floorPlanWallTitle").textContent=`${wall.label} · ${formatDE(wall.length)} m`;
  $("floorPlanWallLength").value=wall.length?formatDE(wall.length):"";
  $("floorPlanWallThickness").value=wall.thickness?formatDE(wall.thickness,1):"";
  $("floorPlanSurfaceHeight").value=wall.surfaceHeight?formatDE(wall.surfaceHeight):"";
  $("floorPlanMeasureChoices").querySelectorAll("input").forEach(input=>input.checked=wall.measures.includes(input.value));
  toggleSurfaceFields();
  $("floorPlanWallPanel").classList.remove("hidden");
}

function toggleSurfaceFields() {
  const selected=[...$("floorPlanMeasureChoices").querySelectorAll("input:checked")].map(input=>input.value);
  $("floorPlanSurfaceFields").classList.toggle("hidden",!selected.includes("Flächensperre"));
}

function saveWall() {
  const wall=plan().walls.find(item=>item.id===activeWallId);
  if (!wall) return;
  wall.length=parseDE($("floorPlanWallLength").value);
  wall.thickness=parseDE($("floorPlanWallThickness").value);
  wall.measures=[...$("floorPlanMeasureChoices").querySelectorAll("input:checked")].map(input=>input.value);
  wall.surfaceHeight=wall.measures.includes("Flächensperre")?parseDE($("floorPlanSurfaceHeight").value):0;
  plan().updatedAt=new Date().toISOString();
  saveState();
  $("floorPlanWallPanel").classList.add("hidden");
  activeWallId="";
  renderEditor();
}

function totals() {
  const values={};
  plan().walls.forEach(w=>w.measures.forEach(type=>{
    const amount=type==="Flächensperre"?w.length*w.surfaceHeight:w.length;
    values[type]=(values[type]||0)+amount;
  }));
  return values;
}

function renderSummary() {
  const values=totals(), rows=Object.entries(values);
  $("floorPlanMeasurementSummary").innerHTML=rows.length?rows.map(([type,value])=>`<div class="floor-plan-summary-row"><strong>${type}</strong><span>${formatDE(value)} ${type==="Flächensperre"?"m²":"lfm"}</span></div>`).join(""):"<div class=\"floor-plan-summary-row\"><span>Noch keine Wand ausgewählt.</span></div>";
}

function renderEditor() {
  $("floorPlanStage").innerHTML=renderSvg();
  $("floorPlanStage").classList.toggle("hide-original",!$("floorPlanShowOriginal").checked);
  $("floorPlanStage").querySelectorAll("[data-plan-wall]").forEach(group=>group.onclick=()=>openWall(group.dataset.planWall));
  renderQuality();
  renderSummary();
}

function render() {
  const current=plan(), ready=Boolean(current.analysis && current.walls.length);
  $("floorPlanUploadStep").classList.toggle("hidden",ready);
  $("floorPlanEditorStep").classList.toggle("hidden",!ready);
  if (current.sourceImage) {
    $("floorPlanPreview").src=current.sourceImage;
    $("floorPlanPreview").classList.remove("hidden");
    $("analyzeFloorPlan").disabled=false;
  }
  if (ready) renderEditor();
  const values=totals(), count=current.walls.filter(w=>w.measures.length).length;
  $("floorPlanMiniSummary").classList.toggle("hidden",!ready);
  if (ready) $("floorPlanMiniSummary").textContent=`Grundriss gespeichert · ${current.walls.length} Wände erkannt · ${count} Wände ausgewählt · ${Object.keys(values).length} Maßnahmen`;
}

function savePlan() {
  plan().confirmedAt=new Date().toISOString();
  saveState();
  render();
  closeDialog();
}

if ($("openFloorPlan")) $("openFloorPlan").onclick=openDialog;
if ($("closeFloorPlan")) $("closeFloorPlan").onclick=closeDialog;
if ($("floorPlanCamera")) $("floorPlanCamera").onchange=e=>useFile(e.target.files[0]);
if ($("floorPlanLibrary")) $("floorPlanLibrary").onchange=e=>useFile(e.target.files[0]);
if ($("analyzeFloorPlan")) $("analyzeFloorPlan").onclick=analyze;
if ($("floorPlanShowOriginal")) $("floorPlanShowOriginal").onchange=renderEditor;
if ($("floorPlanMeasureChoices")) $("floorPlanMeasureChoices").onchange=toggleSurfaceFields;
if ($("closeFloorPlanWall")) $("closeFloorPlanWall").onclick=()=>$("floorPlanWallPanel").classList.add("hidden");
if ($("saveFloorPlanWall")) $("saveFloorPlanWall").onclick=saveWall;
if ($("floorPlanFlipSurface")) $("floorPlanFlipSurface").onclick=()=>{const wall=plan().walls.find(w=>w.id===activeWallId);if(wall){wall.surfaceSide*=-1;renderEditor();openWall(wall.id);}};
if ($("replaceFloorPlan")) $("replaceFloorPlan").onclick=()=>{plan().analysis=null;plan().walls=[];saveState();render();};
if ($("saveFloorPlan")) $("saveFloorPlan").onclick=savePlan;
render();
