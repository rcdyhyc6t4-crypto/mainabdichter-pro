(function(){"use strict";
const DEFAULT_SETTINGS={
  spacing:.25,rowSpacing:.25,fHS:14,fFS:10,reservePct:10,
  hzSell:98,wallSole:300,resin:495,area:690,vat:.19,
  hourlySell:85,personnelCost:35,workers:1,materialEK:30,
  drill:60,fill:30,close:40,setupHours:1,small:200,fixed:250
};
let C={...DEFAULT_SETTINGS,...JSON.parse(localStorage.getItem("v63_calc_settings")||"{}")};
C.rowSpacing=0.25;
if(C.spacing!==0.125 && C.spacing!==0.25)C.spacing=0.25;
const $=id=>document.getElementById(id),eur=v=>new Intl.NumberFormat("de-DE",{style:"currency",currency:"EUR"}).format(v),num=v=>new Intl.NumberFormat("de-DE",{maximumFractionDigits:2}).format(v),esc=s=>String(s||"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
let areas=JSON.parse(localStorage.getItem("v6_areas")||"[]"),extras=JSON.parse(localStorage.getItem("v6_extras")||"[]");
if(!areas.length)areas=[newArea("Vorderwand")];
if(!extras.length)extras=[{name:"Baustelleneinrichtung inkl. An- und Abfahrt",qty:1,unit:"pauschal",sell:320.11,cost:269,show:true},{name:"Heizkörper demontieren und montieren",qty:0,unit:"Stück",sell:0,cost:0,show:true},{name:"Bauschutt entsorgen",qty:0,unit:"pauschal",sell:0,cost:0,show:true},{name:"Vorarbeiten / Freilegen",qty:0,unit:"Stunden",sell:0,cost:0,show:true}];
function newArea(name){return{name,wallMaterial:"HBL / Hohlblockstein",wallMaterialOther:"",wallThickness:30,wallType:"Außenwand",earthContact:"erdberührt",wallCover:"Putz",access:"normal",notes:"",measurements:[{device:"Gann Hydromette Compact B",value:"",unit:"Digits",height:"",location:"",note:""}],measures:[{type:"Horizontalsperre",length:0,width:0,height:0,wall:30,note:""}],photos:[]}}
document.querySelectorAll("nav button").forEach(b=>b.onclick=()=>{document.querySelectorAll(".page").forEach(p=>p.classList.remove("active"));document.querySelectorAll("nav button").forEach(x=>x.classList.remove("active"));$(b.dataset.page).classList.add("active");b.classList.add("active")});
$("openPipedrive").onclick=()=>document.querySelector('[data-page="systems"]').click();
$("newCustomer").onclick=()=>{["salutation","firstName","lastName","phone","email","company","street","zip","city","objectAddress","pipedriveId"].forEach(id=>$(id).value="");calc()};
["salutation","firstName","lastName","phone","email","company","street","zip","city","objectAddress","yearBuilt","buildingType","floor","roomUse","foundationType","roomHeight","floorCover","roomTemp","humidity","surfaceTemp","damageDescription","customerDescription"].forEach(id=>$(id).oninput=calc);
$("roomTemp").oninput=$("humidity").oninput=()=>{dew();calc()};
function dew(){const t=+$("roomTemp").value,rh=+$("humidity").value;if(!Number.isFinite(t)||!rh){$("dewPoint").value="";return}const a=17.62,b=243.12,g=Math.log(rh/100)+a*t/(b+t);$("dewPoint").value=(b*g/(a-g)).toFixed(1)}
function save(){localStorage.setItem("v6_areas",JSON.stringify(areas));localStorage.setItem("v6_extras",JSON.stringify(extras))}
function bindSpeech(){document.querySelectorAll("[data-speech-target]").forEach(b=>b.onclick=()=>speech(b.dataset.speechTarget))}
function speech(target){const SR=window.SpeechRecognition||window.webkitSpeechRecognition;if(!SR){alert("Nutze bitte die Mikrofontaste der iPhone-Tastatur.");return}const r=new SR();r.lang="de-DE";r.onresult=e=>{const el=$(target);el.value=(el.value?el.value+" ":"")+e.results[0][0].transcript;el.dispatchEvent(new Event("input",{bubbles:true}))};r.start()}
function hs(l,w){const holes=Math.ceil((+l||0)/C.spacing);return{holes,liters:holes*(+w||0)*C.fHS/1000}}
function fs(w,h,t){const hr=Math.ceil((+w||0)/C.spacing),rows=Math.ceil((+h||0)/C.rowSpacing);return{holes:hr*rows,area:(+w||0)*(+h||0),liters:hr*(+t||0)*C.fHS/1000+Math.max(rows-1,0)*hr*(+t||0)*C.fFS/1000}}
function calcMeasure(m){let holes=0,liters=0,gross=0,label="",hours=0;if(m.type==="Horizontalsperre"){const r=hs(m.length,m.wall);holes=r.holes;liters=r.liters;gross=Math.ceil(liters*(1+C.reservePct/100))*C.hzSell*1.19;label=`${num(m.length)} lfm`}if(m.type==="Flächensperre"){const r=fs(m.width,m.height,m.wall);holes=r.holes;liters=r.liters;gross=r.area*C.area;label=`${num(m.width)} × ${num(m.height)} m = ${num(r.area)} m²`}if(m.type==="Harzverpressung"){gross=(+m.length||0)*C.resin;label=`${num(m.length)} lfm`}if(m.type==="Wand-Sohlen-Anschluss"){const r=hs(m.length,m.wall);holes=r.holes;liters=r.liters;gross=(+m.length||0)*C.wallSole+Math.ceil(liters*(1+C.reservePct/100))*C.hzSell*1.19;label=`${num(m.length)} lfm inkl. HS`}if(holes)hours=Math.ceil(holes/C.drill+holes/C.fill+holes/C.close+C.setupHours);const reserve=Math.ceil(liters*(1+C.reservePct/100)),self=reserve*C.materialEK+hours*C.personnelCost*C.workers;return{holes,liters,reserve,gross,label,hours,self}}
function renderAreas(){const box=$("areaList");box.innerHTML="";areas.forEach((a,i)=>{const d=document.createElement("div");d.className="area-card";d.innerHTML=`<div class="area-title"><h3>${i+1}. ${esc(a.name)}</h3><button class="danger" data-area-del="${i}">Löschen</button></div>
<div class="grid"><div><label>Bezeichnung</label><input data-ai="${i}" data-af="name" value="${esc(a.name)}"></div><div><label>Wandmaterial</label><select data-ai="${i}" data-af="wallMaterial">${["HBL / Hohlblockstein","Ziegel","Kalksandstein","Beton","Naturstein","Mischmauerwerk","Sonstiges","Unbekannt"].map(x=>`<option ${a.wallMaterial===x?"selected":""}>${x}</option>`).join("")}</select></div><div><label>Abweichendes Material</label><input data-ai="${i}" data-af="wallMaterialOther" value="${esc(a.wallMaterialOther)}"></div><div><label>Wandstärke cm</label><input data-ai="${i}" data-af="wallThickness" value="${a.wallThickness}"></div><div><label>Wandart</label><select data-ai="${i}" data-af="wallType"><option ${a.wallType==="Außenwand"?"selected":""}>Außenwand</option><option ${a.wallType==="Innenwand"?"selected":""}>Innenwand</option></select></div><div><label>Erdkontakt</label><select data-ai="${i}" data-af="earthContact"><option ${a.earthContact==="erdberührt"?"selected":""}>erdberührt</option><option ${a.earthContact==="nicht erdberührt"?"selected":""}>nicht erdberührt</option></select></div><div><label>Wandbelag</label><select data-ai="${i}" data-af="wallCover">${["Putz","Farbe","Tapete","Fliesen","unbekannt","Sonstiges"].map(x=>`<option ${a.wallCover===x?"selected":""}>${x}</option>`).join("")}</select></div><div><label>Zugänglichkeit</label><select data-ai="${i}" data-af="access"><option ${a.access==="normal"?"selected":""}>normal</option><option ${a.access==="eingeschränkt"?"selected":""}>eingeschränkt</option><option ${a.access==="schwierig"?"selected":""}>schwierig</option></select></div></div>
<label>Notizen</label><div class="speech-row"><textarea id="anote${i}" data-ai="${i}" data-af="notes">${esc(a.notes)}</textarea><button class="speech" data-speech-target="anote${i}">🎤</button></div>
<h4>Messpunkte</h4><div id="ams${i}"></div><button class="secondary" data-add-ms="${i}">+ Messpunkt</button>
<h4>Maßnahmen</h4><div id="ameasures${i}"></div><button class="secondary" data-add-measure="${i}">+ Maßnahme</button>
<h4>Fotos</h4><input type="file" accept="image/*" capture="environment" multiple data-photo-area="${i}"><div id="aphotos${i}" class="photo-grid"></div>`;box.appendChild(d);renderAreaMeasurements(i);renderAreaMeasures(i);renderAreaPhotos(i)});
box.querySelectorAll("[data-af]").forEach(el=>el.oninput=()=>{areas[+el.dataset.ai][el.dataset.af]=el.value;save();calc()});box.querySelectorAll("[data-area-del]").forEach(el=>el.onclick=()=>{areas.splice(+el.dataset.areaDel,1);renderAreas();save();calc()});box.querySelectorAll("[data-add-ms]").forEach(el=>el.onclick=()=>{areas[+el.dataset.addMs].measurements.push({device:"Gann Hydromette Compact B",value:"",unit:"Digits",height:"",location:"",note:""});renderAreas();save()});box.querySelectorAll("[data-add-measure]").forEach(el=>el.onclick=()=>{const a=areas[+el.dataset.addMeasure];a.measures.push({type:"Horizontalsperre",length:0,width:0,height:0,wall:a.wallThickness||30,note:""});renderAreas();save();calc()});box.querySelectorAll("[data-photo-area]").forEach(el=>el.onchange=e=>{const ai=+el.dataset.photoArea;[...e.target.files].forEach(f=>{const r=new FileReader();r.onload=x=>{areas[ai].photos.push({src:x.target.result,caption:"",show:true});renderAreas();save();calc()};r.readAsDataURL(f)});e.target.value=""});bindSpeech()}
function renderAreaMeasurements(ai){const box=$("ams"+ai);box.innerHTML="";areas[ai].measurements.forEach((m,mi)=>{box.innerHTML+=`<div class="sub-card"><div class="item-grid"><div class="wide"><label>Gerät</label><input data-ami="${ai}" data-mi="${mi}" data-mf="device" value="${esc(m.device)}"></div><div><label>Wert</label><input data-ami="${ai}" data-mi="${mi}" data-mf="value" value="${esc(m.value)}"></div><div><label>Einheit</label><input data-ami="${ai}" data-mi="${mi}" data-mf="unit" value="${esc(m.unit)}"></div><div><label>Höhe cm</label><input data-ami="${ai}" data-mi="${mi}" data-mf="height" value="${esc(m.height)}"></div><div><label>Position</label><input data-ami="${ai}" data-mi="${mi}" data-mf="location" value="${esc(m.location)}"></div><div class="wide"><label>Bemerkung</label><input data-ami="${ai}" data-mi="${mi}" data-mf="note" value="${esc(m.note)}"></div><button class="danger" data-ms-del="${ai}-${mi}">Löschen</button></div></div>`});box.querySelectorAll("[data-mf]").forEach(el=>el.oninput=()=>{areas[+el.dataset.ami].measurements[+el.dataset.mi][el.dataset.mf]=el.value;save()});box.querySelectorAll("[data-ms-del]").forEach(el=>el.onclick=()=>{const [a,m]=el.dataset.msDel.split("-").map(Number);areas[a].measurements.splice(m,1);renderAreas();save()})}
function renderAreaMeasures(ai){const box=$("ameasures"+ai);box.innerHTML="";areas[ai].measures.forEach((m,mi)=>{const ar=m.type==="Flächensperre";box.innerHTML+=`<div class="sub-card"><div class="item-grid"><div class="wide"><label>Art</label><select data-mai="${ai}" data-mmi="${mi}" data-mmf="type">${["Horizontalsperre","Flächensperre","Harzverpressung","Wand-Sohlen-Anschluss"].map(x=>`<option ${m.type===x?"selected":""}>${x}</option>`).join("")}</select></div><div><label>Wandstärke cm</label><input data-mai="${ai}" data-mmi="${mi}" data-mmf="wall" value="${m.wall}"></div>${ar?`<div><label>Breite m</label><input data-mai="${ai}" data-mmi="${mi}" data-mmf="width" value="${m.width}"></div><div><label>Höhe m</label><input data-mai="${ai}" data-mmi="${mi}" data-mmf="height" value="${m.height}"></div>`:`<div><label>Länge lfm</label><input data-mai="${ai}" data-mmi="${mi}" data-mmf="length" value="${m.length}"></div>`}<div class="wide"><label>Notiz</label><input data-mai="${ai}" data-mmi="${mi}" data-mmf="note" value="${esc(m.note)}"></div><button class="danger" data-measure-del="${ai}-${mi}">Löschen</button></div><div id="mres${ai}-${mi}"></div></div>`});box.querySelectorAll("[data-mmf]").forEach(el=>el.oninput=()=>{areas[+el.dataset.mai].measures[+el.dataset.mmi][el.dataset.mmf]=el.value;if(el.dataset.mmf==="type")renderAreas();save();calc()});box.querySelectorAll("[data-measure-del]").forEach(el=>el.onclick=()=>{const [a,m]=el.dataset.measureDel.split("-").map(Number);areas[a].measures.splice(m,1);renderAreas();save();calc()})}
function renderAreaPhotos(ai){const box=$("aphotos"+ai);box.innerHTML="";areas[ai].photos.forEach((p,pi)=>{box.innerHTML+=`<div class="photo-card"><img src="${p.src}"><input data-pai="${ai}" data-ppi="${pi}" data-ppf="caption" value="${esc(p.caption)}" placeholder="Beschreibung"><label><input type="checkbox" data-pshow="${ai}-${pi}" ${p.show?"checked":""}> Kundenansicht</label><button class="danger" data-photo-del="${ai}-${pi}">Löschen</button></div>`});box.querySelectorAll("[data-ppf]").forEach(el=>el.oninput=()=>{areas[+el.dataset.pai].photos[+el.dataset.ppi][el.dataset.ppf]=el.value;save();calc()});box.querySelectorAll("[data-pshow]").forEach(el=>el.onchange=()=>{const [a,p]=el.dataset.pshow.split("-").map(Number);areas[a].photos[p].show=el.checked;save();calc()});box.querySelectorAll("[data-photo-del]").forEach(el=>el.onclick=()=>{const [a,p]=el.dataset.photoDel.split("-").map(Number);areas[a].photos.splice(p,1);renderAreas();save();calc()})}
$("addArea").onclick=()=>{areas.push(newArea("Neuer Schadensbereich"));renderAreas();save();calc()};
function renderExtras(){const box=$("extraList");box.innerHTML="";extras.forEach((e,i)=>{box.innerHTML+=`<div class="extra-card"><div class="item-grid"><div class="wide"><label>Leistung</label><input data-ei="${i}" data-ef="name" value="${esc(e.name)}"></div><div><label>Menge</label><input data-ei="${i}" data-ef="qty" value="${e.qty}"></div><div><label>Einheit</label><input data-ei="${i}" data-ef="unit" value="${esc(e.unit)}"></div><div><label>VK brutto</label><input data-ei="${i}" data-ef="sell" value="${e.sell}"></div><div><label>EK netto</label><input data-ei="${i}" data-ef="cost" value="${e.cost}"></div><label><input type="checkbox" data-es="${i}" ${e.show?"checked":""}> Kundenansicht</label><button class="danger" data-ed="${i}">Löschen</button></div></div>`});box.querySelectorAll("[data-ef]").forEach(el=>el.oninput=()=>{extras[+el.dataset.ei][el.dataset.ef]=el.value;save();calc()});box.querySelectorAll("[data-es]").forEach(el=>el.onchange=()=>{extras[+el.dataset.es].show=el.checked;save();calc()});box.querySelectorAll("[data-ed]").forEach(el=>el.onclick=()=>{extras.splice(+el.dataset.ed,1);renderExtras();save();calc()})}
$("addExtra").onclick=()=>{extras.push({name:"",qty:1,unit:"pauschal",sell:0,cost:0,show:true});renderExtras();save();calc()};
function getPricingAdjustment(normalGross){
  const discountType=$("discountType").value;
  const discountPct=discountType==="custom"?(+$("discountCustom").value||0):(discountType==="none"?0:(+discountType||0));
  const specialType=$("specialDiscountType").value;
  const specialValue=+$("specialDiscountValue").value||0;
  let specialAmount=0;
  if(specialType==="percent")specialAmount=normalGross*(specialValue/100);
  if(specialType==="amount")specialAmount=specialValue;
  specialAmount=Math.max(0,Math.min(specialAmount,normalGross));
  const offerGross=normalGross-specialAmount;
  const skontoAmount=offerGross*(discountPct/100);
  const skontoPrice=offerGross-skontoAmount;
  return{discountPct,specialAmount,offerGross,skontoAmount,skontoPrice};
}

function calc(){
  let mg=0,self=0,hz=0,hours=0,eg=0,ec=0;
  $("calcAreas").innerHTML="";
  $("cAreas").innerHTML="";
  $("cExtras").innerHTML="";
  $("cPhotos").innerHTML="";

  areas.forEach((a,ai)=>{
    $("calcAreas").innerHTML+=`<div class="result"><strong>${esc(a.name)}</strong><div>${esc(a.wallMaterialOther||a.wallMaterial)} · ${a.wallThickness} cm · ${esc(a.earthContact)}</div></div>`;
    $("cAreas").innerHTML+=`<div class="result"><strong>${esc(a.name)}</strong></div>`;

    a.measures.forEach((m,mi)=>{
      const r=calcMeasure(m);
      mg+=r.gross;
      self+=r.self;
      hz+=r.reserve;
      hours+=r.hours;

      const unitAmount=m.type==="Flächensperre"?(+m.width||0)*(+m.height||0):(+m.length||0);
      const unitLabel=m.type==="Flächensperre"?"m²":"lfm";
      const unitPrice=unitAmount>0?r.gross/unitAmount:0;

      const el=$(`mres${ai}-${mi}`);
      if(el)el.textContent=`${r.label} · ${r.holes} Löcher · ${r.reserve} l · ${r.hours} Std. · ${eur(r.gross)} · ${eur(unitPrice)}/${unitLabel}`;

      $("calcAreas").innerHTML+=`
        <div class="metric"><span>${esc(a.name)} – ${esc(m.type)}</span><strong>${r.label}</strong></div>
        <div class="metric"><span>Bohrlöcher</span><strong>${r.holes}</strong></div>
        <div class="metric"><span>Material inkl. Reserve</span><strong>${r.reserve} l</strong></div>
        <div class="metric"><span>Arbeitszeit</span><strong>${r.hours} Std.</strong></div>
        <div class="metric"><span>Preis je ${unitLabel}</span><strong>${eur(unitPrice)}</strong></div>
        <div class="metric"><span>Verkaufspreis brutto</span><strong>${eur(r.gross)}</strong></div>`;

      $("cAreas").innerHTML+=`<div class="metric"><span>${esc(m.type)}</span><strong>${r.label}</strong></div>`;
    });

    a.photos.filter(p=>p.show).forEach(p=>{
      $("cPhotos").innerHTML+=`<div class="photo-card"><img src="${p.src}"><strong>${esc(a.name)}</strong>${p.caption?`<p>${esc(p.caption)}</p>`:""}</div>`;
    });
  });

  extras.forEach(e=>{
    const g=(+e.qty||0)*(+e.sell||0);
    const c=(+e.qty||0)*(+e.cost||0);
    eg+=g;
    ec+=c;
    if(e.show&&g>0)$("cExtras").innerHTML+=`<div class="metric"><span>${esc(e.name)}</span><strong>${eur(g)}</strong></div>`;
  });

  const normalGross=mg+eg;
  const adjustment=getPricingAdjustment(normalGross);
  const netOffer=adjustment.offerGross/1.19;
  const selfNetValue=self+ec+C.small+C.fixed;
  const margin=netOffer-selfNetValue;

  $("totalHz").textContent=hz+" l";
  $("totalHours").textContent=hours+" Std.";
  $("measureGross").textContent=eur(mg);
  $("extraGross").textContent=eur(eg);
  $("grandGross").textContent=eur(normalGross);
  $("specialDiscountName").textContent=$("specialDiscountLabel").value||"Sonderrabatt";
  $("specialDiscountAmount").textContent=adjustment.specialAmount>0?"− "+eur(adjustment.specialAmount):"–";
  $("offerGross").textContent=eur(adjustment.offerGross);
  $("skontoLabel").textContent=adjustment.discountPct>0?`${num(adjustment.discountPct)} % Skonto-Endpreis`:"Skonto";
  $("skontoGross").textContent=adjustment.discountPct>0?eur(adjustment.skontoPrice):"–";
  $("selfNet").textContent=eur(selfNetValue);
  $("marginNet").textContent=eur(margin);

  $("cName").textContent=[$("salutation").value,$("firstName").value,$("lastName").value].filter(Boolean).join(" ")||"–";
  $("cAddress").textContent=$("objectAddress").value||[$("street").value,$("zip").value,$("city").value].filter(Boolean).join(", ")||"–";
  $("cDescription").textContent=$("customerDescription").value||"–";
  $("cNormalPrice").textContent=eur(normalGross);
  $("cSpecialDiscountLabel").textContent=$("specialDiscountLabel").value||"Sonderrabatt";
  $("cSpecialDiscount").textContent=adjustment.specialAmount>0?"− "+eur(adjustment.specialAmount):"–";
  $("cSpecialDiscountRow").style.display=adjustment.specialAmount>0?"flex":"none";
  $("cNormalPriceRow").style.display=adjustment.specialAmount>0?"flex":"none";
  $("cPrice").textContent=eur(adjustment.offerGross);
  $("cSkontoLabel").textContent=adjustment.discountPct>0?`${num(adjustment.discountPct)} % Skonto bei Zahlung innerhalb von 3 Werktagen`:"Skonto";
  $("cSkonto").textContent=adjustment.discountPct>0?eur(adjustment.skontoPrice):"–";
  $("cSkontoRow").style.display=adjustment.discountPct>0?"flex":"none";
}

function reportRow(label, value) {
  if (!value) return "";
  return `<tr><th>${esc(label)}</th><td>${esc(value)}</td></tr>`;
}

function buildReport() {
  const customerName = [
    textValue("salutation"),
    textValue("firstName"),
    textValue("lastName")
  ].filter(Boolean).join(" ");

  const billingAddress = [
    textValue("street"),
    textValue("zip"),
    textValue("city")
  ].filter(Boolean).join(", ");

  let html = `
    <div class="report-section">
      <h2>Kunde und Objekt</h2>
      <table class="report-table">
        ${reportRow("Kunde", customerName)}
        ${reportRow("Firma / Rechnungsempfänger", textValue("company"))}
        ${reportRow("Telefon", textValue("phone"))}
        ${reportRow("E-Mail", textValue("email"))}
        ${reportRow("Rechnungsanschrift", billingAddress)}
        ${reportRow("Objektanschrift", textValue("objectAddress") || billingAddress)}
      </table>
    </div>

    <div class="report-section">
      <h2>Gebäude und Raum</h2>
      <table class="report-table">
        ${reportRow("Baujahr", textValue("yearBuilt"))}
        ${reportRow("Bauart", textValue("buildingType"))}
        ${reportRow("Geschoss", textValue("floor"))}
        ${reportRow("Raumnutzung", textValue("roomUse"))}
        ${reportRow("Fundamentart", textValue("foundationType"))}
        ${reportRow("Raumhöhe", textValue("roomHeight") ? textValue("roomHeight") + " m" : "")}
        ${reportRow("Bodenbelag", textValue("floorCover"))}
        ${reportRow("Raumtemperatur", textValue("roomTemp") ? textValue("roomTemp") + " °C" : "")}
        ${reportRow("Luftfeuchtigkeit", textValue("humidity") ? textValue("humidity") + " %" : "")}
        ${reportRow("Oberflächentemperatur", textValue("surfaceTemp") ? textValue("surfaceTemp") + " °C" : "")}
        ${reportRow("Taupunkt", textValue("dewPoint") ? textValue("dewPoint") + " °C" : "")}
      </table>
    </div>

    <div class="report-section">
      <h2>Schadensbild und Empfehlung</h2>
      <table class="report-table">
        ${reportRow("Schadensbild", textValue("damageDescription"))}
        ${reportRow("Empfehlung", textValue("customerDescription"))}
      </table>
    </div>
  `;


  const normalGrossValue = areas.reduce((sum, area) => {
    return sum + (area.measures || []).reduce((s, m) => s + calcMeasure(m).gross, 0);
  }, 0) + extras.reduce((s, e) => s + ((+e.qty || 0) * (+e.sell || 0)), 0);

  const pricing = getPricingAdjustment(normalGrossValue);

  html += `
    <div class="report-section">
      <h2>Preisübersicht</h2>
      <table class="report-table">
        ${reportRow("Normalpreis brutto", eur(normalGrossValue))}
        ${pricing.specialAmount > 0 ? reportRow($("specialDiscountLabel").value || "Sonderrabatt", "− " + eur(pricing.specialAmount)) : ""}
        ${reportRow("Angebotssumme", eur(pricing.offerGross))}
        ${pricing.discountPct > 0 ? reportRow(num(pricing.discountPct) + " % Skonto-Endpreis", eur(pricing.skontoPrice)) : ""}
      </table>
    </div>
  `;

  areas.forEach((area, areaIndex) => {
    html += `
      <div class="report-section">
        <h2>${areaIndex + 1}. ${esc(area.name)}</h2>
        <table class="report-table">
          ${reportRow("Wandmaterial", area.wallMaterialOther || area.wallMaterial)}
          ${reportRow("Wandstärke", area.wallThickness ? area.wallThickness + " cm" : "")}
          ${reportRow("Wandart", area.wallType)}
          ${reportRow("Erdkontakt", area.earthContact)}
          ${reportRow("Wandbelag", area.wallCover)}
          ${reportRow("Zugänglichkeit", area.access)}
          ${reportRow("Notizen", area.notes)}
        </table>
    `;

    if (area.measurements && area.measurements.length) {
      html += `
        <h3>Messwerte</h3>
        <table class="report-table">
          <thead><tr><th>Gerät</th><th>Wert</th><th>Höhe</th><th>Position</th><th>Bemerkung</th></tr></thead>
          <tbody>
      `;
      area.measurements.forEach(m => {
        html += `<tr>
          <td>${esc(m.device)}</td>
          <td>${esc([m.value, m.unit].filter(Boolean).join(" "))}</td>
          <td>${esc(m.height ? m.height + " cm" : "")}</td>
          <td>${esc(m.location)}</td>
          <td>${esc(m.note)}</td>
        </tr>`;
      });
      html += `</tbody></table>`;
    }

    if (area.measures && area.measures.length) {
      html += `
        <h3>Vorgesehene Maßnahmen</h3>
        <table class="report-table">
          <thead><tr><th>Maßnahme</th><th>Umfang</th><th>Wandstärke</th><th>Notiz</th></tr></thead>
          <tbody>
      `;
      area.measures.forEach(m => {
        const r = calcMeasure(m);
        html += `<tr>
          <td>${esc(m.type)}</td>
          <td>${esc(r.label)}</td>
          <td>${esc(m.wall ? m.wall + " cm" : "")}</td>
          <td>${esc(m.note)}</td>
        </tr>`;
      });
      html += `</tbody></table>`;
    }

    const visiblePhotos = (area.photos || []).filter(p => p.show);
    if (visiblePhotos.length) {
      html += `<h3>Fotodokumentation</h3><div class="report-photo-grid">`;
      visiblePhotos.forEach(p => {
        html += `<div class="report-photo">
          <img src="${p.src}" alt="">
          ${p.caption ? `<p>${esc(p.caption)}</p>` : ""}
        </div>`;
      });
      html += `</div>`;
    }

    html += `</div>`;
  });

  $("reportContent").innerHTML = html;
}

function printMode(mode) {
  document.body.classList.remove("print-customer", "print-report");
  document.body.classList.add(mode);
  window.print();
  setTimeout(() => {
    document.body.classList.remove("print-customer", "print-report");
  }, 500);
}

$("createCustomerPdf").onclick = () => {
  calc();
  printMode("print-customer");
};

$("createReportPdf").onclick = () => {
  buildReport();
  printMode("print-report");
};



["discountType","discountCustom","specialDiscountType","specialDiscountValue","specialDiscountLabel"].forEach(id=>{
  $(id).oninput=calc;
  $(id).onchange=calc;
});

const SETTING_FIELDS={
  setMaterialEK:"materialEK",
  setHzSell:"hzSell",
  setPersonnelCost:"personnelCost",
  setHourlySell:"hourlySell",
  setWorkers:"workers",
  setDrillRate:"drill",
  setFillRate:"fill",
  setCloseRate:"close",
  setSetupHours:"setupHours",
  setReservePct:"reservePct",
  setSpacing:"spacing",
  setFactorHS:"fHS",
  setFactorFS:"fFS",
  setWallSole:"wallSole",
  setResin:"resin",
  setAreaPrice:"area",
  setSmallCost:"small",
  setFixedCost:"fixed"
};

function fillCalcSettings(){
  Object.entries(SETTING_FIELDS).forEach(([id,key])=>{
    $(id).value=C[key];
  });
}

$("saveCalcSettings").onclick=()=>{
  Object.entries(SETTING_FIELDS).forEach(([id,key])=>{
    const value=parseFloat($(id).value);
    if(Number.isFinite(value))C[key]=value;
  });
  C.rowSpacing=0.25;
  C.spacing=(C.spacing===0.125)?0.125:0.25;
  localStorage.setItem("v63_calc_settings",JSON.stringify(C));
  stat("calcSettingsStatus","Kalkulationswerte wurden gespeichert.",true);
  calc();
};

$("resetCalcSettings").onclick=()=>{
  C={...DEFAULT_SETTINGS};
  C.rowSpacing=0.25;
  localStorage.setItem("v63_calc_settings",JSON.stringify(C));
  fillCalcSettings();
  stat("calcSettingsStatus","Standardwerte wurden geladen.",true);
  calc();
};

fillCalcSettings();


$("workerUrl").value=localStorage.getItem("v6_url")||$("workerUrl").value;$("appSecret").value=localStorage.getItem("v6_secret")||"";
renderAreas();renderExtras();bindSpeech();dew();calc();
})();