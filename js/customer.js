import { $, eur, num, esc } from "./utils.js";
let data = null;
try { data = JSON.parse(localStorage.getItem("mainabdichter_v10_customer") || "null"); } catch {}
if (!data) {
  $("document").innerHTML = "<h1>Keine Angebotsdaten vorhanden</h1>";
} else {
  $("cName").textContent = [data.customerName,data.company].filter(Boolean).join(" – ") || "–";
  $("cAddress").textContent = data.address || "–";
  $("cRecommendation").textContent = data.recommendation || "–";
  $("cMeasures").innerHTML = data.measures.map(item => `<div class="result"><strong>${esc(item.areaName)} – ${esc(item.title)}</strong>${item.description?`<div class="article-description">${esc(item.description)}</div>`:""}<div class="metric"><span>Umfang</span><strong>${esc(item.scope)}</strong></div></div>`).join("");
  $("cExtras").innerHTML = data.extras.map(item => `<div class="result"><strong>${esc(item.title)}</strong>${item.description?`<div class="article-description">${esc(item.description)}</div>`:""}<div class="metric"><span>Menge</span><strong>${num(item.quantity)} ${esc(item.unitName)}</strong></div></div>`).join("");
  if (data.specialAmount > 0) { $("cNormalRow").classList.remove("hidden"); $("cSpecialRow").classList.remove("hidden"); $("cNormal").textContent = eur(data.normalGross); $("cSpecialLabel").textContent = data.specialLabel; $("cSpecial").textContent = "− " + eur(data.specialAmount); }
  $("cOffer").textContent = eur(data.offerGross);
  if (data.skontoPct > 0) { $("cSkontoRow").classList.remove("hidden"); $("cSkontoLabel").textContent = `${num(data.skontoPct)} % Skonto bei Zahlung innerhalb von 3 Werktagen`; $("cSkonto").textContent = eur(data.skontoGross); }
  $("cPhotos").innerHTML = data.photos.map(photo => `<div class="photo-card"><img src="${photo.src}"><strong>${esc(photo.areaName)}</strong>${photo.caption?`<p>${esc(photo.caption)}</p>`:""}</div>`).join("");
}
$("print").onclick = () => window.print();
$("close").onclick = () => window.close();
