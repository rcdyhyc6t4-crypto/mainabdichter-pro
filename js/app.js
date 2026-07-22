import { state, saveState, resetVisit, resetSettings } from "./storage.js";
import { createArea } from "./defaults.js";
import { calculateOffer, calculateMeasure } from "./calculator.js";
import { $, eur, num, esc, showStatus, bindSpeechButtons } from "./utils.js";
import { hasConnectionConfig, searchPipedrive, loadPipedrivePerson, searchLexwareCustomers, loadLexwareCustomer, loadLexwareArticles, testConnections, createLexwareQuotation } from "./api.js";

const customerFields = ["salutation","firstName","lastName","company","phone","email","street","zip","city","objectAddress"];
const buildingFields = ["yearBuilt","buildingType","floor","roomUse","foundationType","floorCover","roomTemp","humidity","surfaceTemp","dewPoint"];

function show(pageId) {
  document.querySelectorAll(".page").forEach(page => page.classList.remove("active"));
  document.querySelectorAll(".main-nav button").forEach(button => button.classList.toggle("active", button.dataset.page === pageId));
  $(pageId).classList.add("active");
  if (pageId === "offer") renderOffer();
  if (pageId === "settings") renderSettings();
}

document.querySelectorAll(".main-nav button").forEach(button => button.onclick = () => show(button.dataset.page));
$("newVisit").onclick = () => { resetVisit(); renderVisit(); show("visit"); };
$("continueVisit").onclick = () => { renderVisit(); show("visit"); };
$("openOffer").onclick = () => show("offer");
$("openSettings").onclick = () => show("settings");
$("resetVisit").onclick = () => { if (confirm("Aktuelle Besichtigung löschen?")) { resetVisit(); renderVisit(); } };
$("saveVisit").onclick = () => { collectVisit(); saveState(); alert("Besichtigung gespeichert."); };
$("toOffer").onclick = () => { collectVisit(); saveState(); show("offer"); };

function renderVisit() {
  customerFields.forEach(key => $(key).value = state.visit.customer[key] || "");
  buildingFields.forEach(key => $(key).value = state.visit.building[key] || "");
  $("damageDescription").value = state.visit.damageDescription || "";
  $("climateMeasured").checked = Boolean(state.visit.building.climateMeasured);
  toggleClimateFields();
  renderAreas();
  updateGeneratedRecommendation();
  renderExtras();
  bindSpeechButtons();
  updateDewPoint();
}

function collectVisit() {
  customerFields.forEach(key => state.visit.customer[key] = $(key).value);
  buildingFields.forEach(key => state.visit.building[key] = $(key).value);
  state.visit.damageDescription = $("damageDescription").value;
  state.visit.building.climateMeasured = $("climateMeasured").checked;
  state.visit.customerRecommendation = generateRecommendationText();
}


function toggleClimateFields() {
  const active = $("climateMeasured").checked;
  $("climateFields").classList.toggle("hidden", !active);
  state.visit.building.climateMeasured = active;

  if (!active) {
    ["roomTemp","humidity","surfaceTemp","dewPoint"].forEach(id => {
      $(id).value = "";
      state.visit.building[id] = "";
    });
  }
}

function generateRecommendationText() {
  const selected = new Set(
    state.visit.areas.flatMap(area => area.measures.map(measure => measure.type))
  );

  const parts = [];

  if (selected.has("Horizontalsperre")) {
    parts.push(
      "Aufgrund der festgestellten kapillar aufsteigenden Feuchtigkeit empfehlen wir die Ausführung einer Horizontalsperre im Injektionsverfahren mit BKM HZ 250 Pro."
    );
  }

  if (selected.has("Flächensperre")) {
    parts.push(
      "Zur Reduzierung des seitlichen Feuchteeintrags empfehlen wir die Ausführung einer Flächensperre im Injektionsverfahren mit BKM HZ 250 Pro."
    );
  }

  if (selected.has("Wand-Sohlen-Anschluss")) {
    parts.push(
      "Im Bereich des Wand-Sohlen-Anschlusses wird der vorhandene Estrich auf einer Breite von mindestens ca. 15–20 cm von der Wand bis zur Bodenplatte geöffnet. Anschließend wird der Anschlussbereich gereinigt, eine Dichtkehle hergestellt und ein Dichtmörtel bis mindestens 15 cm über eine vorhandene Sperrbahn aufgebracht. Im Anschluss wird zusätzlich eine Horizontalsperre im Injektionsverfahren mit BKM HZ 250 Pro eingebracht. Diese Maßnahme erfolgt grundsätzlich im Ausschlussverfahren. Nach einer angemessenen Standzeit von etwa 5–6 Monaten wird geprüft, ob die ausgeführten Maßnahmen ausreichend waren. Sollte weiterhin Feuchtigkeit über einzelne Bereiche eindringen, wird eine Harzverpressung ausschließlich in den technisch erforderlichen Bereichen ausgeführt und nach dem tatsächlich notwendigen Umfang abgerechnet."
    );
  }

  if (selected.has("Harzverpressung")) {
    parts.push(
      "Zur Abdichtung der ausgewählten feuchtigkeits- oder wasserführenden Bereiche empfehlen wir eine gezielte Harzverpressung. Abgerechnet wird ausschließlich der tatsächlich ausgeführte Umfang."
    );
  }

  return parts.join("\n\n") ||
    "Auf Grundlage der ausgewählten Maßnahmen wird die technische Empfehlung automatisch erstellt.";
}

function updateGeneratedRecommendation() {
  const text = generateRecommendationText();
  state.visit.customerRecommendation = text;
  if ($("generatedRecommendation")) {
    $("generatedRecommendation").textContent = text;
  }
  saveState();
}

function updateDewPoint() {
  const t = Number($("roomTemp").value);
  const rh = Number($("humidity").value);
  if (Number.isFinite(t) && rh > 0) {
    const a = 17.62, b = 243.12;
    const gamma = Math.log(rh / 100) + a * t / (b + t);
    $("dewPoint").value = (b * gamma / (a - gamma)).toFixed(1);
  } else $("dewPoint").value = "";
}
$("climateMeasured").onchange = () => {
  toggleClimateFields();
  updateDewPoint();
  saveState();
};
$("roomTemp").oninput = updateDewPoint;
$("humidity").oninput = updateDewPoint;

function renderAreas() {
  const box = $("areas");
  box.innerHTML = "";
  state.visit.areas.forEach((area, ai) => {
    const card = document.createElement("div");
    card.className = "area-card";
    card.innerHTML = `
      <div class="area-head"><h3>${ai + 1}. ${esc(area.name)}</h3><button class="danger" data-delete-area="${area.id}">Löschen</button></div>
      <div class="grid">
        <div><label>Bezeichnung</label><input data-area="${area.id}" data-field="name" value="${esc(area.name)}"></div>
        <div><label>Wandmaterial</label><select data-area="${area.id}" data-field="wallMaterial">${["HBL / Hohlblockstein","Ziegel","Kalksandstein","Beton","Naturstein","Mischmauerwerk","Sonstiges","Unbekannt"].map(v => `<option ${area.wallMaterial===v?"selected":""}>${v}</option>`).join("")}</select></div>
        <div><label>Abweichendes Material</label><input data-area="${area.id}" data-field="wallMaterialOther" value="${esc(area.wallMaterialOther)}"></div>
        <div><label>Wandstärke</label><select data-area="${area.id}" data-field="wallThickness">${[24,30,36,42,48,60].map(v => `<option value="${v}" ${Number(area.wallThickness)===v?"selected":""}>${v} cm</option>`).join("")}</select></div>
        <div><label>Wandart</label><select data-area="${area.id}" data-field="wallType"><option ${area.wallType==="Außenwand"?"selected":""}>Außenwand</option><option ${area.wallType==="Innenwand"?"selected":""}>Innenwand</option></select></div>
        <div><label>Erdkontakt</label><select data-area="${area.id}" data-field="earthContact"><option ${area.earthContact==="erdberührt"?"selected":""}>erdberührt</option><option ${area.earthContact==="nicht erdberührt"?"selected":""}>nicht erdberührt</option></select></div>
        <div><label>Wandbelag</label><select data-area="${area.id}" data-field="wallCover">${["Putz","Farbe","Tapete","Fliesen","Unbekannt","Sonstiges"].map(v => `<option ${area.wallCover===v?"selected":""}>${v}</option>`).join("")}</select></div>
        <div><label>Zugänglichkeit</label><select data-area="${area.id}" data-field="access"><option ${area.access==="normal"?"selected":""}>normal</option><option ${area.access==="eingeschränkt"?"selected":""}>eingeschränkt</option><option ${area.access==="schwierig"?"selected":""}>schwierig</option></select></div>
      </div>
      <label>Notizen</label><div class="speech-row"><textarea id="area-note-${area.id}" data-area="${area.id}" data-field="notes">${esc(area.notes)}</textarea><button class="speech" data-speech-target="area-note-${area.id}">🎤</button></div>
      <h3>Messpunkte</h3><div id="measurements-${area.id}"></div><button class="secondary" data-add-measurement="${area.id}">+ Messpunkt</button>
      <h3>Maßnahmen</h3><div id="measures-${area.id}"></div><button class="secondary" data-add-measure="${area.id}">+ Maßnahme</button>
      <h3>Fotos</h3><input type="file" accept="image/*" capture="environment" multiple data-photo-area="${area.id}"><div id="photos-${area.id}" class="photo-grid"></div>`;
    box.appendChild(card);
    renderMeasurements(area);
    renderMeasures(area);
    renderPhotos(area);
  });

  box.querySelectorAll("[data-field]").forEach(input => input.oninput = () => {
    const area = state.visit.areas.find(item => item.id === input.dataset.area);
    area[input.dataset.field] = input.value;
    if (input.dataset.field === "wallThickness") area.measures.forEach(measure => measure.wall = Number(input.value));
    saveState();
  });

  box.querySelectorAll("[data-delete-area]").forEach(button => button.onclick = () => {
    state.visit.areas = state.visit.areas.filter(area => area.id !== button.dataset.deleteArea);
    saveState(); updateGeneratedRecommendation(); renderAreas();
  });

  box.querySelectorAll("[data-add-measurement]").forEach(button => button.onclick = () => {
    const area = state.visit.areas.find(item => item.id === button.dataset.addMeasurement);
    area.measurements.push({ id: crypto.randomUUID(), device:"Gann Hydromette Compact B",value:"",dryReference:"",unit:"Digits",height:"",location:"",note:"" });
    saveState(); renderAreas();
  });

  box.querySelectorAll("[data-add-measure]").forEach(button => button.onclick = () => {
    const area = state.visit.areas.find(item => item.id === button.dataset.addMeasure);
    area.measures.push({ id:crypto.randomUUID(), type:"Horizontalsperre",length:0,width:0,height:0,wall:Number(area.wallThickness),spacing:.25,extraResinKg:0,note:"" });
    saveState(); updateGeneratedRecommendation(); renderAreas();
  });

  box.querySelectorAll("[data-photo-area]").forEach(input => input.onchange = event => {
    const area = state.visit.areas.find(item => item.id === input.dataset.photoArea);
    [...event.target.files].forEach(file => {
      const reader = new FileReader();
      reader.onload = result => {
        area.photos.push({ id:crypto.randomUUID(), src:result.target.result, caption:"", show:true });
        saveState(); renderAreas();
      };
      reader.readAsDataURL(file);
    });
    event.target.value = "";
  });

  bindSpeechButtons();
}

function renderMeasurements(area) {
  const box = $(`measurements-${area.id}`);
  box.innerHTML = area.measurements.map(m => `
    <div class="sub-card item-grid">
      <div class="wide"><label>Gerät</label><input data-mid="${m.id}" data-mf="device" value="${esc(m.device)}"></div>
      <div><label>Messwert</label><input data-mid="${m.id}" data-mf="value" value="${esc(m.value)}"></div>
      <div><label>Referenz „trocken“</label><input data-mid="${m.id}" data-mf="dryReference" value="${esc(m.dryReference || "")}"></div>
      <div><label>Einheit</label><input data-mid="${m.id}" data-mf="unit" value="${esc(m.unit)}"></div>
      <div><label>Höhe cm</label><input data-mid="${m.id}" data-mf="height" value="${esc(m.height)}"></div>
      <div><label>Position</label><input data-mid="${m.id}" data-mf="location" value="${esc(m.location)}"></div>
      <div class="wide"><label>Bemerkung</label><input data-mid="${m.id}" data-mf="note" value="${esc(m.note)}"></div>
      <button class="danger" data-delete-measurement="${m.id}">Löschen</button>
    </div>`).join("");

  box.querySelectorAll("[data-mf]").forEach(input => input.oninput = () => {
    const measurement = area.measurements.find(item => item.id === input.dataset.mid);
    measurement[input.dataset.mf] = input.value; saveState();
  });
  box.querySelectorAll("[data-delete-measurement]").forEach(button => button.onclick = () => {
    area.measurements = area.measurements.filter(item => item.id !== button.dataset.deleteMeasurement);
    saveState(); renderAreas();
  });
}

function renderMeasures(area) {
  const box = $(`measures-${area.id}`);
  box.innerHTML = area.measures.map(m => `
    <div class="sub-card item-grid">
      <div class="wide"><label>Maßnahme</label><select data-measure="${m.id}" data-mfield="type">${["Horizontalsperre","Flächensperre","Harzverpressung","Wand-Sohlen-Anschluss"].map(v=>`<option ${m.type===v?"selected":""}>${v}</option>`).join("")}</select></div>
      <div><label>Wandstärke</label><select data-measure="${m.id}" data-mfield="wall">${[24,30,36,42,48,60].map(v=>`<option value="${v}" ${Number(m.wall)===v?"selected":""}>${v} cm</option>`).join("")}</select></div>
      ${m.type==="Flächensperre" ? `<div><label>Breite m</label><input data-measure="${m.id}" data-mfield="width" value="${m.width}"></div><div><label>Höhe m</label><input data-measure="${m.id}" data-mfield="height" value="${m.height}"></div>` : `<div><label>Länge lfm</label><input data-measure="${m.id}" data-mfield="length" value="${m.length}"></div>`}
      ${["Horizontalsperre","Flächensperre","Wand-Sohlen-Anschluss"].includes(m.type) ? `<div><label>horizontaler Abstand</label><select data-measure="${m.id}" data-mfield="spacing"><option value=".125" ${Number(m.spacing)===.125?"selected":""}>12,5 cm</option><option value=".25" ${Number(m.spacing)===.25?"selected":""}>25 cm</option></select></div>` : ""}
      ${m.type==="Harzverpressung" ? `<div><label>zusätzliches Harz kg</label><input data-measure="${m.id}" data-mfield="extraResinKg" value="${m.extraResinKg}"></div>` : ""}
      ${m.type==="Wand-Sohlen-Anschluss" ? `<div class="wide switch-row"><label><input type="checkbox" data-measure="${m.id}" data-mcheck="disposeDebris" ${m.disposeDebris?"checked":""}> Anfallenden Bauschutt aufnehmen, abfahren und fachgerecht entsorgen</label></div>` : ""}
      <div class="wide"><label>Notiz</label><input data-measure="${m.id}" data-mfield="note" value="${esc(m.note)}"></div>
      <button class="danger" data-delete-measure="${m.id}">Löschen</button>
    </div>`).join("");

  box.querySelectorAll("[data-mfield]").forEach(input => input.oninput = () => {
    const measure = area.measures.find(item => item.id === input.dataset.measure);
    measure[input.dataset.mfield] = input.value;
    saveState();
    updateGeneratedRecommendation();
    if (input.dataset.mfield === "type") renderAreas();
  });
  box.querySelectorAll("[data-mcheck]").forEach(input => input.onchange = () => {
    const measure = area.measures.find(item => item.id === input.dataset.measure);
    measure[input.dataset.mcheck] = input.checked;
    saveState();
    updateGeneratedRecommendation();
  });
  box.querySelectorAll("[data-delete-measure]").forEach(button => button.onclick = () => {
    area.measures = area.measures.filter(item => item.id !== button.dataset.deleteMeasure);
    saveState(); updateGeneratedRecommendation(); renderAreas();
  });
}

function renderPhotos(area) {
  const box = $(`photos-${area.id}`);
  box.innerHTML = area.photos.map(photo => `
    <div class="photo-card"><img src="${photo.src}"><input data-photo="${photo.id}" value="${esc(photo.caption)}" placeholder="Beschreibung"><label><input type="checkbox" data-photo-show="${photo.id}" ${photo.show?"checked":""}> Kundenansicht</label><button class="danger" data-delete-photo="${photo.id}">Löschen</button></div>`).join("");
  box.querySelectorAll("[data-photo]").forEach(input => input.oninput = () => {
    area.photos.find(p => p.id === input.dataset.photo).caption = input.value; saveState();
  });
  box.querySelectorAll("[data-photo-show]").forEach(input => input.onchange = () => {
    area.photos.find(p => p.id === input.dataset.photoShow).show = input.checked; saveState();
  });
  box.querySelectorAll("[data-delete-photo]").forEach(button => button.onclick = () => {
    area.photos = area.photos.filter(p => p.id !== button.dataset.deletePhoto); saveState(); renderAreas();
  });
}

$("addArea").onclick = () => { state.visit.areas.push(createArea("Neuer Schadensbereich")); saveState(); renderAreas(); };

function renderExtras() {
  $("extras").innerHTML = state.settings.extras.filter(extra => extra.active).map(extra => {
    const article = state.settings.lexwareArticles.find(item => item.id === extra.lexwareArticleId);
    return `<div class="catalog-row"><div><strong>${esc(article?.title || extra.name)}</strong>${article?.description?`<div class="article-description">${esc(article.description)}</div>`:""}<small>${esc(article?.unitName || extra.unit)}</small></div><div><label>Menge</label><input type="number" step=".01" data-extra-qty="${extra.id}" value="${state.visit.extraQuantities[extra.id] || 0}"></div></div>`;
  }).join("");
  document.querySelectorAll("[data-extra-qty]").forEach(input => input.oninput = () => {
    state.visit.extraQuantities[input.dataset.extraQty] = Number(input.value) || 0; saveState();
  });
}

async function choosePipedrive() {
  if (!hasConnectionConfig()) return show("settings");
  const term = prompt("Pipedrive-Kunde suchen");
  if (!term) return;
  try {
    const result = await searchPipedrive(term);
    const labels = result.people.map((p,i)=>`${i+1}: ${p.name} ${p.email||""}`).join("\n");
    const index = Number(prompt(labels + "\n\nNummer auswählen")) - 1;
    const selected = result.people[index];
    if (!selected) return;
    const detail = await loadPipedrivePerson(selected.id);
    Object.assign(state.visit.customer, detail.person, { pipedriveId: detail.person.id || "" });
    saveState(); renderVisit();
  } catch (error) { alert(error.message); }
}
async function chooseLexware() {
  if (!hasConnectionConfig()) return show("settings");
  const term = prompt("Lexware-Kunde suchen: Name, E-Mail oder Kundennummer");
  if (!term) return;
  try {
    const result = await searchLexwareCustomers(term);
    const labels = result.contacts.map((c,i)=>`${i+1}: ${c.name}${c.customerNumber?` [${c.customerNumber}]`:""} ${c.email||""}`).join("\n");
    const index = Number(prompt(labels + "\n\nNummer auswählen")) - 1;
    const selected = result.contacts[index];
    if (!selected) return;
    const detail = await loadLexwareCustomer(selected.id);
    Object.assign(state.visit.customer, detail.contact, { lexwareContactId: detail.contact.id || "" });
    saveState(); renderVisit();
  } catch (error) { alert(error.message); }
}
$("customerPipedrive").onclick = choosePipedrive;
$("customerLexware").onclick = chooseLexware;

function renderOffer() {
  collectVisit();
  const result = calculateOffer(state.settings, state.visit, state.discount);
  $("offerCustomer").textContent = [state.visit.customer.salutation,state.visit.customer.firstName,state.visit.customer.lastName].filter(Boolean).join(" ") || "–";
  $("offerAddress").textContent = state.visit.customer.objectAddress || [state.visit.customer.street,state.visit.customer.zip,state.visit.customer.city].filter(Boolean).join(", ") || "–";
  $("offerGross").textContent = eur(result.offerGross);
  $("dashPriceList").textContent = state.settings.priceListName;
  $("dashCustomer").textContent = [state.visit.customer.firstName,state.visit.customer.lastName].filter(Boolean).join(" ") || "–";
  $("dashOffer").textContent = eur(result.offerGross);
  $("internalCalc").innerHTML = result.lineItems.map(item => `<div class="result"><strong>${esc(item.areaName?`${item.areaName} – `:"")}${esc(item.name)}</strong><div class="metric"><span>Umfang</span><strong>${esc(item.scope || `${num(item.quantity)} ${item.unitName}`)}</strong></div>${item.holes!==undefined?`<div class="metric"><span>Bohrlöcher</span><strong>${item.holes}</strong></div><div class="metric"><span>HZ inkl. Reserve</span><strong>${item.saleLiters} l</strong></div><div class="metric"><span>Arbeitszeit</span><strong>${num(item.hours)} Std.</strong></div>`:""}<div class="metric"><span>Preis je ${esc(item.unitName)}</span><strong>${eur(item.grossUnit)}</strong></div><div class="metric"><span>Gesamt brutto</span><strong>${eur(item.totalGross)}</strong></div></div>`).join("") + `<div class="metric"><span>Materialkosten netto</span><strong>${eur(result.materialCostNet)}</strong></div><div class="metric"><span>Deckungsbeitrag vor sonstigen Betriebskosten</span><strong>${eur(result.contributionBeforeOtherCosts)}</strong></div>`;
  return result;
}

["skontoType","skontoCustom","specialType","specialValue","specialLabel"].forEach(id => {
  $(id).oninput = () => {
    state.discount.skontoType = $("skontoType").value;
    state.discount.skontoCustom = Number($("skontoCustom").value) || 0;
    state.discount.specialType = $("specialType").value;
    state.discount.specialValue = Number($("specialValue").value) || 0;
    state.discount.specialLabel = $("specialLabel").value;
    saveState(); renderOffer();
  };
});
$("toggleInternal").onclick = () => $("internalCalc").classList.toggle("hidden");

function buildCustomerSnapshot() {
  updateGeneratedRecommendation();
  const result = renderOffer();
  const measures = result.lineItems.filter(item => item.kind === "measure").map(item => {
    const article = state.settings.lexwareArticles.find(a => a.id === item.articleId);
    return {
      areaName: item.areaName,
      title: article?.title || item.name,
      description: article?.description || item.description || "",
      scope: item.scope
    };
  });
  const extras = result.lineItems.filter(item => item.kind !== "measure" && !item.hiddenToCustomer).map(item => {
    const article = state.settings.lexwareArticles.find(a => a.id === item.articleId);
    return { title:article?.title||item.name, description:article?.description||item.description||"", quantity:item.quantity, unitName:article?.unitName||item.unitName };
  });
  const photos = state.visit.areas.flatMap(area => area.photos.filter(p => p.show).map(p => ({ areaName:area.name, src:p.src, caption:p.caption })));
  return {
    customerName:[state.visit.customer.salutation,state.visit.customer.firstName,state.visit.customer.lastName].filter(Boolean).join(" "),
    company:state.visit.customer.company,
    address:state.visit.customer.objectAddress || [state.visit.customer.street,state.visit.customer.zip,state.visit.customer.city].filter(Boolean).join(", "),
    recommendation:state.visit.customerRecommendation,
    measures, extras, photos,
    normalGross:result.baseGross,
    specialLabel:state.discount.specialLabel,
    specialAmount:result.specialAmount,
    offerGross:result.offerGross,
    skontoPct:result.skontoPct,
    skontoGross:result.skontoGross
  };
}
$("openCustomerView").onclick = () => {
  localStorage.setItem("mainabdichter_v10_customer", JSON.stringify(buildCustomerSnapshot()));
  const win = window.open("customer.html","_blank");
  if (!win) alert("Bitte Pop-ups erlauben.");
};

function buildQuotationPayload() {
  const result = renderOffer();
  const factor = result.baseGross > 0 ? result.offerGross / result.baseGross : 1;
  const lineItems = result.lineItems
    .filter(item => !item.hiddenToCustomer)
    .filter(item => Number(item.quantity) > 0 && Number(item.totalGross) >= 0)
    .map((item, index) => {
      const article = state.settings.lexwareArticles.find(a => a.id === item.articleId);

      const quantity = item.pricingMode === "flat"
        ? 1
        : Number(Number(item.quantity).toFixed(1));

      const unitName = item.pricingMode === "flat"
        ? (article?.unitName || item.unitName || "pauschal")
        : (article?.unitName || item.unitName || "Stück");

      const baseUnitGross = item.pricingMode === "flat"
        ? Number(item.totalGross)
        : Number(item.totalGross) / Math.max(Number(item.quantity), 1);

      const adjustedUnitGross = Number((baseUnitGross * factor).toFixed(2));
      const name = String(article?.title || item.name || `Position ${index + 1}`).trim().slice(0, 255);
      const description = String(article?.description || item.description || "").slice(0, 2000);
      const taxRate = Number(article?.price?.taxRate ?? 19);

      return {
        ...(article
          ? {
              id: article.id,
              type: String(article.type).toUpperCase() === "PRODUCT"
                ? "material"
                : "service"
            }
          : { type: "custom" }),
        name,
        description,
        quantity,
        unitName,
        unitPrice: {
          currency: "EUR",
          grossAmount: adjustedUnitGross,
          taxRatePercentage: Number.isFinite(taxRate) ? taxRate : 19
        },
        discountPercentage: 0
      };
    });

  if (!lineItems.length) {
    throw new Error("Es gibt keine gültige Angebotsposition mit Menge und Preis.");
  }
  return {
    customer: state.visit.customer,
    quotation: {
      lineItems,
      introduction: `Gerne bieten wir Ihnen die nachfolgend beschriebenen Abdichtungsmaßnahmen an.\n\nObjektanschrift: ${state.visit.customer.objectAddress || [state.visit.customer.street,state.visit.customer.zip,state.visit.customer.city].filter(Boolean).join(", ")}`,
      remark: "Wir arbeiten ausschließlich mit Systemprodukten der BKM.MANNESMANN AG.",
      title: "Angebot",
      paymentDiscount: result.skontoPct > 0 ? { discountPercentage:result.skontoPct, discountRange:3 } : null
    }
  };
}
$("sendLexware").onclick = async () => {
  try {
    const payload = buildQuotationPayload();

    const preview = payload.quotation.lineItems.map((item, index) =>
      `${index + 1}. ${item.name}: ${item.quantity} ${item.unitName} × ${eur(item.unitPrice.grossAmount)}`
    ).join("\n");

    console.info("Lexware Angebotspositionen\n" + preview);

    const response = await createLexwareQuotation(payload);
    if (response.contactId) state.visit.customer.lexwareContactId = response.contactId;
    saveState();
    showStatus("offerStatus","Lexware-Angebot wurde als Entwurf erstellt.",true);
  } catch (error) {
    showStatus("offerStatus",error.message,false);
  }
};

function buildReport() {
  let html = `<div class="report-section"><h2>Kunde und Objekt</h2><table class="report-table"><tr><th>Kunde</th><td>${esc([state.visit.customer.salutation,state.visit.customer.firstName,state.visit.customer.lastName].filter(Boolean).join(" "))}</td></tr><tr><th>Objekt</th><td>${esc(state.visit.customer.objectAddress || [state.visit.customer.street,state.visit.customer.zip,state.visit.customer.city].filter(Boolean).join(", "))}</td></tr><tr><th>Baujahr</th><td>${esc(state.visit.building.yearBuilt)}</td></tr><tr><th>Bauart</th><td>${esc(state.visit.building.buildingType)}</td></tr><tr><th>Fundamentart</th><td>${esc(state.visit.building.foundationType)}</td></tr>${state.visit.building.climateMeasured?`<tr><th>Raumtemperatur</th><td>${esc(state.visit.building.roomTemp)} °C</td></tr><tr><th>Luftfeuchtigkeit</th><td>${esc(state.visit.building.humidity)} %</td></tr><tr><th>Oberflächentemperatur</th><td>${esc(state.visit.building.surfaceTemp)} °C</td></tr><tr><th>Taupunkt</th><td>${esc(state.visit.building.dewPoint)} °C</td></tr>`:""}</table></div>`;
  updateGeneratedRecommendation();
  html += `<div class="report-section"><h2>Schadensbild</h2><p>${esc(state.visit.damageDescription)}</p><h2>Empfehlung</h2><p>${esc(state.visit.customerRecommendation)}</p></div>`;
  for (const area of state.visit.areas) {
    html += `<div class="report-section"><h2>${esc(area.name)}</h2><table class="report-table"><tr><th>Wandmaterial</th><td>${esc(area.wallMaterialOther||area.wallMaterial)}</td></tr><tr><th>Wandstärke</th><td>${esc(area.wallThickness)} cm</td></tr><tr><th>Erdkontakt</th><td>${esc(area.earthContact)}</td></tr></table><h3>Messwerte</h3><table class="report-table"><tr><th>Gerät</th><th>Messwert</th><th>Referenz trocken</th><th>Höhe</th><th>Position</th><th>Bemerkung</th></tr>${area.measurements.map(m=>`<tr><td>${esc(m.device)}</td><td>${esc(m.value)} ${esc(m.unit)}</td><td>${esc(m.dryReference || "")} ${esc(m.unit)}</td><td>${esc(m.height)}</td><td>${esc(m.location)}</td><td>${esc(m.note)}</td></tr>`).join("")}</table><h3>Maßnahmen</h3><table class="report-table">${area.measures.map(m=>{const r=calculateMeasure(state.settings,m);return `<tr><th>${esc(m.type)}</th><td>${esc(r.scope)}</td></tr>`}).join("")}</table><div class="photo-grid">${area.photos.filter(p=>p.show).map(p=>`<div class="photo-card"><img src="${p.src}"><p>${esc(p.caption)}</p></div>`).join("")}</div></div>`;
  }
  $("reportContent").innerHTML = html;
}
$("reportPdf").onclick = () => { buildReport(); document.body.classList.add("print-report"); window.print(); setTimeout(()=>document.body.classList.remove("print-report"),400); };

function articleOptions(selected="") {
  return `<option value="">nicht zugeordnet</option>${state.settings.lexwareArticles.map(article=>`<option value="${article.id}" ${selected===article.id?"selected":""}>${esc(article.articleNumber?`${article.articleNumber} – `:"")}${esc(article.title)}</option>`).join("")}`;
}
function renderSettings() {
  const s = state.settings;
  ["priceListName","priceListDate","hzPurchaseNet","hzSaleNet","reservePct","drillRate","fillRate","closeRate","setupHours","wallSoleGrossPerMeter","extraResinKgNet","workerUrl","appSecret"].forEach(key => $(key).value = s[key] ?? "");
  $("smallJobEnabled").value = String(s.smallJob.enabled);
  $("smallJobThreshold").value = s.smallJob.thresholdMeters;
  $("smallJobType").value = s.smallJob.type;
  $("smallJobValue").value = s.smallJob.value;
  $("smallJobVisible").value = String(s.smallJob.visibleToCustomer);
  $("mapHorizontalsperre").innerHTML = articleOptions(s.articleMappings.Horizontalsperre);
  $("mapFlächensperre").innerHTML = articleOptions(s.articleMappings.Flächensperre);
  $("mapHarzverpressung").innerHTML = articleOptions(s.articleMappings.Harzverpressung);
  $("mapWandSohle").innerHTML = articleOptions(s.articleMappings["Wand-Sohlen-Anschluss"]);
  $("mapSmallJob").innerHTML = articleOptions(s.articleMappings.smallJob);
  renderSettingsExtras();
}
function renderSettingsExtras() {
  $("settingsExtras").innerHTML = state.settings.extras.map(extra => {
    const article = state.settings.lexwareArticles.find(a=>a.id===extra.lexwareArticleId);
    return `<div class="catalog-row"><div class="grid"><div class="full"><label>Lexware-Artikel</label><select data-extra-article="${extra.id}">${articleOptions(extra.lexwareArticleId)}</select></div>${article?`<div class="full"><strong>${esc(article.title)}</strong><div class="article-description">${esc(article.description||"")}</div></div><div><label>Einheit aus Lexware</label><input value="${esc(article.unitName||extra.unit)}" readonly></div>`:`<div><label>Bezeichnung</label><input data-extra="${extra.id}" data-extra-field="name" value="${esc(extra.name)}"></div><div><label>Einheit</label><input data-extra="${extra.id}" data-extra-field="unit" value="${esc(extra.unit)}"></div>`}<div><label>Preis brutto aus App</label><input data-extra="${extra.id}" data-extra-field="grossPrice" value="${extra.grossPrice}"></div><label><input type="checkbox" data-extra-active="${extra.id}" ${extra.active?"checked":""}> aktiv</label><button class="danger" data-extra-delete="${extra.id}">Löschen</button></div></div>`;
  }).join("");
  document.querySelectorAll("[data-extra-field]").forEach(input => input.oninput = () => {
    const extra = state.settings.extras.find(e=>e.id===input.dataset.extra);
    extra[input.dataset.extraField] = input.dataset.extraField==="grossPrice" ? Number(input.value)||0 : input.value;
  });
  document.querySelectorAll("[data-extra-article]").forEach(select => select.onchange = () => {
    const extra = state.settings.extras.find(e=>e.id===select.dataset.extraArticle);
    extra.lexwareArticleId = select.value;
    renderSettingsExtras();
  });
  document.querySelectorAll("[data-extra-active]").forEach(input => input.onchange = () => state.settings.extras.find(e=>e.id===input.dataset.extraActive).active = input.checked);
  document.querySelectorAll("[data-extra-delete]").forEach(button => button.onclick = () => { state.settings.extras = state.settings.extras.filter(e=>e.id!==button.dataset.extraDelete); renderSettingsExtras(); });
}
$("addExtra").onclick = () => { state.settings.extras.push({id:crypto.randomUUID(),name:"Neue Zusatzleistung",unit:"pauschal",grossPrice:0,active:true,lexwareArticleId:""}); renderSettingsExtras(); };
$("loadArticles").onclick = async () => {
  try { const articles = await loadLexwareArticles(); renderSettings(); showStatus("articleStatus",`${articles.length} Artikel geladen.`,true); }
  catch(error){ showStatus("articleStatus",error.message,false); }
};
function collectSettings() {
  const s = state.settings;
  ["priceListName","priceListDate","workerUrl","appSecret"].forEach(key => s[key] = $(key).value.trim());
  ["hzPurchaseNet","hzSaleNet","reservePct","drillRate","fillRate","closeRate","setupHours","wallSoleGrossPerMeter","extraResinKgNet"].forEach(key => s[key] = Number($(key).value)||0);
  s.smallJob = { enabled:$("smallJobEnabled").value==="true", thresholdMeters:Number($("smallJobThreshold").value)||12, type:$("smallJobType").value, value:Number($("smallJobValue").value)||0, visibleToCustomer:$("smallJobVisible").value==="true" };
  s.articleMappings = { Horizontalsperre:$("mapHorizontalsperre").value, Flächensperre:$("mapFlächensperre").value, Harzverpressung:$("mapHarzverpressung").value, "Wand-Sohlen-Anschluss":$("mapWandSohle").value, smallJob:$("mapSmallJob").value };
}
$("saveConnection").onclick = () => { collectSettings(); saveState(); showStatus("connectionStatus","Zugangsdaten gespeichert.",true); };
$("saveSettings").onclick = () => { collectSettings(); saveState(); showStatus("settingsStatus","Einstellungen gespeichert.",true); renderExtras(); renderOffer(); };
$("resetSettings").onclick = () => { if(confirm("Standardwerte laden?")){ resetSettings(); renderSettings(); } };
$("testConnection").onclick = async () => {
  collectSettings(); saveState();
  const setState = (id,label,ok,error) => { const el=$(id); el.className=`connection-state ${ok?"ok":"err"}`; el.textContent=`${label}: ${ok?"verbunden":error||"Fehler"}`; };
  const result = await testConnections();
  setState("stateCloudflare","Cloudflare",result.cloudflare,result.errors.cloudflare);
  setState("stateLexware","Lexware",result.lexware,result.errors.lexware);
  setState("statePipedrive","Pipedrive",result.pipedrive,result.errors.pipedrive);
};

$("skontoType").value = state.discount.skontoType;
$("skontoCustom").value = state.discount.skontoCustom;
$("specialType").value = state.discount.specialType;
$("specialValue").value = state.discount.specialValue;
$("specialLabel").value = state.discount.specialLabel;

renderVisit(); updateGeneratedRecommendation(); renderSettings(); renderOffer(); show("dashboard");
