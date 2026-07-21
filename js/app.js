(function(){"use strict";
const $=id=>document.getElementById(id);
const eur=v=>new Intl.NumberFormat("de-DE",{style:"currency",currency:"EUR"}).format(v);
const num=v=>new Intl.NumberFormat("de-DE",{maximumFractionDigits:2}).format(v);
const esc=s=>String(s||"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
const clone=o=>JSON.parse(JSON.stringify(o));

const DEFAULT_ADMIN={
  priceListName:"mainabdichter Kalkulationsbasis",
  priceListDate:"2026-07-01",
  hzPurchaseNet:30,
  hzSaleNet:98,
  reservePct:10,
  drill:60,
  fill:30,
  close:40,
  setupHours:1,
  smallJob:{enabled:true,threshold:12,type:"amount",value:250,visible:false},
  wallSoleGross:300,
  extraResinKgNet:98,
  resin:{tiers:{"2":1180,"3":1750,"4":2310,"5":2860,"6":3400,"7":3930,"8":4450,"9":4960,"10":5460},threshold:10,additional:495},
  extras:[
    {name:"Baustelleneinrichtung inkl. An- und Abfahrt",unit:"pauschal",gross:320.11,cost:269,active:true,articleId:""},
    {name:"Heizkörper demontieren und montieren",unit:"Stück",gross:150,cost:40,active:true,articleId:""},
    {name:"Bauschutt entsorgen",unit:"pauschal",gross:350,cost:80,active:true,articleId:""},
    {name:"Vorarbeiten / Freilegen",unit:"Stunden",gross:101.15,cost:35,active:true,articleId:""}
  ],
  articleMappings:{},
  lexwareArticles:[],
  workerUrl:"https://mainabdichter-lexoffice.cmww7htry5.workers.dev",
  appSecret:""
};
const DEFAULT_DISCOUNT={type:"none",custom:0,specialType:"none",specialValue:0,specialLabel:"Sonderaktion"};

function load(key,def){try{return Object.assign(clone(def),JSON.parse(localStorage.getItem(key)||"{}"))}catch{return clone(def)}}
function newArea(name="Vorderwand"){return{name,wallMaterial:"HBL / Hohlblockstein",wallMaterialOther:"",wallThickness:30,wallType:"Außenwand",earthContact:"erdberührt",wallCover:"Putz",access:"normal",notes:"",measurements:[{device:"Gann Hydromette Compact B",value:"",unit:"Digits",height:"",location:"",note:""}],measures:[{type:"Horizontalsperre",length:0,width:0,height:0,wall:30,spacing:0.25,extraResinKg:0,note:""}],photos:[]}}
function newVisit(){return{customer:{salutation:"",firstName:"",lastName:"",phone:"",email:"",company:"",street:"",zip:"",city:"",objectAddress:"",pipedriveId:"",lexwareContactId:""},building:{yearBuilt:"",buildingType:"freistehendes Einfamilienhaus",floor:"Keller",roomUse:"Kellerraum",foundationType:"Streifenfundament",roomHeight:"",floorCover:"",roomTemp:"",humidity:"",surfaceTemp:"",dewPoint:""},damageDescription:"",customerDescription:"",areas:[newArea()],extraQuantities:{}}}

let admin=load("v8_admin",DEFAULT_ADMIN);
admin.smallJob=Object.assign(clone(DEFAULT_ADMIN.smallJob),admin.smallJob||{});
admin.articleMappings=admin.articleMappings||{};
admin.lexwareArticles=admin.lexwareArticles||[];
let visit=load("v8_visit",newVisit());
let discount=load("v8_discount",DEFAULT_DISCOUNT);

function save(){localStorage.setItem("v8_admin",JSON.stringify(admin));localStorage.setItem("v8_visit",JSON.stringify(visit));localStorage.setItem("v8_discount",JSON.stringify(discount))}
function status(id,msg,ok){const el=$(id);if(!el)return;el.className="status "+(ok?"ok":"err");el.textContent=msg}

document.querySelectorAll(".main-nav button").forEach(b=>b.onclick=()=>show(b.dataset.page));
function show(id){document.querySelectorAll(".page").forEach(p=>p.classList.remove("active"));document.querySelectorAll(".main-nav button").forEach(b=>b.classList.toggle("active",b.dataset.page===id));$(id).classList.add("active");if(id==="offer")calculate();if(id==="admin")renderAdmin()}

$("startVisit").onclick=()=>{visit=newVisit();save();renderVisit();show("visit")};
$("continueVisit").onclick=()=>{renderVisit();show("visit")};
$("openOffer").onclick=()=>show("offer");
$("openAdmin").onclick=()=>show("admin");
$("loadPipedrive").onclick=()=>pipedriveDialog();
$("loadLexwareCustomer").onclick=()=>lexwareCustomerDialog();
$("clearVisit").onclick=()=>{if(confirm("Aktuelle Besichtigung wirklich löschen?")){visit=newVisit();save();renderVisit()}};
$("saveVisit").onclick=()=>{collectVisit();save();status("offerStatus","Besichtigung gespeichert.",true)};
$("toOffer").onclick=()=>{collectVisit();save();show("offer")};

const customerFields=["salutation","firstName","lastName","phone","email","company","street","zip","city","objectAddress","pipedriveId"];
const buildingFields=["yearBuilt","buildingType","floor","roomUse","foundationType","roomHeight","floorCover","roomTemp","humidity","surfaceTemp","dewPoint"];
function renderVisit(){customerFields.forEach(k=>$(k).value=visit.customer[k]||"");buildingFields.forEach(k=>$(k).value=visit.building[k]||"");$("damageDescription").value=visit.damageDescription||"";$("customerDescription").value=visit.customerDescription||"";renderAreas();renderWorkExtras();bindSpeech();updateDew()}
function collectVisit(){customerFields.forEach(k=>visit.customer[k]=$(k).value);buildingFields.forEach(k=>visit.building[k]=$(k).value);visit.damageDescription=$("damageDescription").value;visit.customerDescription=$("customerDescription").value}
["roomTemp","humidity"].forEach(id=>$(id).oninput=updateDew);
function updateDew(){const t=+$("roomTemp").value,rh=+$("humidity").value;if(Number.isFinite(t)&&rh>0){const a=17.62,b=243.12,g=Math.log(rh/100)+a*t/(b+t);$("dewPoint").value=(b*g/(a-g)).toFixed(1)}else $("dewPoint").value=""}

function renderAreas(){
 const box=$("areaList");box.innerHTML="";
 visit.areas.forEach((a,ai)=>{
  const d=document.createElement("div");d.className="area-card";
  d.innerHTML=`<div class="area-head"><h3>${ai+1}. ${esc(a.name)}</h3><button class="danger" data-adel="${ai}">Löschen</button></div>
  <div class="grid">
   <div><label>Bezeichnung</label><input data-ai="${ai}" data-af="name" value="${esc(a.name)}"></div>
   <div><label>Wandmaterial</label><select data-ai="${ai}" data-af="wallMaterial">${["HBL / Hohlblockstein","Ziegel","Kalksandstein","Beton","Naturstein","Mischmauerwerk","Sonstiges","Unbekannt"].map(v=>`<option ${a.wallMaterial===v?"selected":""}>${v}</option>`).join("")}</select></div>
   <div><label>Abweichendes Material</label><input data-ai="${ai}" data-af="wallMaterialOther" value="${esc(a.wallMaterialOther)}"></div>
   <div><label>Wandstärke</label><select data-ai="${ai}" data-af="wallThickness">${[24,30,36,42,48,60].map(v=>`<option value="${v}" ${+a.wallThickness===v?"selected":""}>${v} cm</option>`).join("")}</select></div>
   <div><label>Wandart</label><select data-ai="${ai}" data-af="wallType"><option ${a.wallType==="Außenwand"?"selected":""}>Außenwand</option><option ${a.wallType==="Innenwand"?"selected":""}>Innenwand</option></select></div>
   <div><label>Erdkontakt</label><select data-ai="${ai}" data-af="earthContact"><option ${a.earthContact==="erdberührt"?"selected":""}>erdberührt</option><option ${a.earthContact==="nicht erdberührt"?"selected":""}>nicht erdberührt</option></select></div>
   <div><label>Wandbelag</label><select data-ai="${ai}" data-af="wallCover">${["Putz","Farbe","Tapete","Fliesen","Unbekannt","Sonstiges"].map(v=>`<option ${a.wallCover===v?"selected":""}>${v}</option>`).join("")}</select></div>
   <div><label>Zugänglichkeit</label><select data-ai="${ai}" data-af="access"><option ${a.access==="normal"?"selected":""}>normal</option><option ${a.access==="eingeschränkt"?"selected":""}>eingeschränkt</option><option ${a.access==="schwierig"?"selected":""}>schwierig</option></select></div>
  </div>
  <label>Notizen</label><div class="speech-row"><textarea id="areaNote${ai}" data-ai="${ai}" data-af="notes">${esc(a.notes)}</textarea><button class="speech" data-speech-target="areaNote${ai}">🎤</button></div>
  <h3>Messpunkte</h3><div id="measurements${ai}"></div><button class="secondary" data-addmeasurement="${ai}">+ Messpunkt</button>
  <h3>Maßnahmen</h3><div id="measures${ai}"></div><button class="secondary" data-addmeasure="${ai}">+ Maßnahme</button>
  <h3>Fotos</h3><input type="file" accept="image/*" capture="environment" multiple data-photo="${ai}"><div id="photos${ai}" class="photo-grid"></div>`;
  box.appendChild(d);renderMeasurements(ai);renderMeasures(ai);renderPhotos(ai);
 });
 box.querySelectorAll("[data-af]").forEach(x=>x.oninput=()=>{visit.areas[+x.dataset.ai][x.dataset.af]=x.value;if(x.dataset.af==="wallThickness")visit.areas[+x.dataset.ai].measures.forEach(m=>m.wall=+x.value);save()});
 box.querySelectorAll("[data-adel]").forEach(x=>x.onclick=()=>{visit.areas.splice(+x.dataset.adel,1);renderAreas();save()});
 box.querySelectorAll("[data-addmeasurement]").forEach(x=>x.onclick=()=>{visit.areas[+x.dataset.addmeasurement].measurements.push({device:"Gann Hydromette Compact B",value:"",unit:"Digits",height:"",location:"",note:""});renderAreas();save()});
 box.querySelectorAll("[data-addmeasure]").forEach(x=>x.onclick=()=>{const a=visit.areas[+x.dataset.addmeasure];a.measures.push({type:"Horizontalsperre",length:0,width:0,height:0,wall:+a.wallThickness,spacing:0.25,extraResinKg:0,note:""});renderAreas();save()});
 box.querySelectorAll("[data-photo]").forEach(x=>x.onchange=e=>{const ai=+x.dataset.photo;[...e.target.files].forEach(f=>{const r=new FileReader();r.onload=v=>{visit.areas[ai].photos.push({src:v.target.result,caption:"",show:true});renderAreas();save()};r.readAsDataURL(f)});e.target.value=""});
 bindSpeech();
}
function renderMeasurements(ai){const box=$("measurements"+ai);box.innerHTML="";visit.areas[ai].measurements.forEach((m,mi)=>{box.innerHTML+=`<div class="sub-card"><div class="item-grid"><div class="wide"><label>Gerät</label><input data-mi="${ai}-${mi}" data-mf="device" value="${esc(m.device)}"></div><div><label>Wert</label><input data-mi="${ai}-${mi}" data-mf="value" value="${esc(m.value)}"></div><div><label>Einheit</label><input data-mi="${ai}-${mi}" data-mf="unit" value="${esc(m.unit)}"></div><div><label>Höhe cm</label><input data-mi="${ai}-${mi}" data-mf="height" value="${esc(m.height)}"></div><div><label>Position</label><input data-mi="${ai}-${mi}" data-mf="location" value="${esc(m.location)}"></div><div class="wide"><label>Bemerkung</label><input data-mi="${ai}-${mi}" data-mf="note" value="${esc(m.note)}"></div><button class="danger" data-mdel="${ai}-${mi}">Löschen</button></div></div>`});box.querySelectorAll("[data-mf]").forEach(x=>x.oninput=()=>{const [a,m]=x.dataset.mi.split("-").map(Number);visit.areas[a].measurements[m][x.dataset.mf]=x.value;save()});box.querySelectorAll("[data-mdel]").forEach(x=>x.onclick=()=>{const [a,m]=x.dataset.mdel.split("-").map(Number);visit.areas[a].measurements.splice(m,1);renderAreas();save()})}
function renderMeasures(ai){
 const box=$("measures"+ai);box.innerHTML="";
 visit.areas[ai].measures.forEach((m,mi)=>{
  const area=m.type==="Flächensperre", resin=m.type==="Harzverpressung";
  box.innerHTML+=`<div class="sub-card"><div class="item-grid">
   <div class="wide"><label>Maßnahme</label><select data-x="${ai}-${mi}" data-xf="type">${["Horizontalsperre","Flächensperre","Harzverpressung","Wand-Sohlen-Anschluss"].map(v=>`<option ${m.type===v?"selected":""}>${v}</option>`).join("")}</select></div>
   <div><label>Wandstärke</label><select data-x="${ai}-${mi}" data-xf="wall">${[24,30,36,42,48,60].map(v=>`<option value="${v}" ${+m.wall===v?"selected":""}>${v} cm</option>`).join("")}</select></div>
   ${area?`<div><label>Breite m</label><input data-x="${ai}-${mi}" data-xf="width" value="${m.width||0}"></div><div><label>Höhe m</label><input data-x="${ai}-${mi}" data-xf="height" value="${m.height||0}"></div>`:`<div><label>Länge lfm</label><input data-x="${ai}-${mi}" data-xf="length" value="${m.length||0}"></div>`}
   ${["Horizontalsperre","Flächensperre","Wand-Sohlen-Anschluss"].includes(m.type)?`<div><label>horizontaler Abstand</label><select data-x="${ai}-${mi}" data-xf="spacing"><option value="0.125" ${+m.spacing===.125?"selected":""}>12,5 cm</option><option value="0.25" ${+m.spacing===.25?"selected":""}>25 cm</option></select></div>`:""}
   ${resin?`<div><label>zusätzliches Harz kg</label><input data-x="${ai}-${mi}" data-xf="extraResinKg" value="${m.extraResinKg||0}"></div>`:""}
   <div class="wide"><label>Notiz</label><input data-x="${ai}-${mi}" data-xf="note" value="${esc(m.note)}"></div>
   <button class="danger" data-xdel="${ai}-${mi}">Löschen</button>
  </div></div>`;
 });
 box.querySelectorAll("[data-xf]").forEach(x=>x.oninput=()=>{const [a,m]=x.dataset.x.split("-").map(Number);visit.areas[a].measures[m][x.dataset.xf]=x.value;if(x.dataset.xf==="type")renderAreas();save()});
 box.querySelectorAll("[data-xdel]").forEach(x=>x.onclick=()=>{const [a,m]=x.dataset.xdel.split("-").map(Number);visit.areas[a].measures.splice(m,1);renderAreas();save()});
}
function renderPhotos(ai){const box=$("photos"+ai);box.innerHTML="";visit.areas[ai].photos.forEach((p,pi)=>{box.innerHTML+=`<div class="photo-card"><img src="${p.src}"><input data-p="${ai}-${pi}" data-pf="caption" value="${esc(p.caption)}" placeholder="Beschreibung"><label><input type="checkbox" data-ps="${ai}-${pi}" ${p.show?"checked":""}> Kunden-PDF</label><button class="danger" data-pdel="${ai}-${pi}">Löschen</button></div>`});box.querySelectorAll("[data-pf]").forEach(x=>x.oninput=()=>{const [a,p]=x.dataset.p.split("-").map(Number);visit.areas[a].photos[p][x.dataset.pf]=x.value;save()});box.querySelectorAll("[data-ps]").forEach(x=>x.onchange=()=>{const [a,p]=x.dataset.ps.split("-").map(Number);visit.areas[a].photos[p].show=x.checked;save()});box.querySelectorAll("[data-pdel]").forEach(x=>x.onclick=()=>{const [a,p]=x.dataset.pdel.split("-").map(Number);visit.areas[a].photos.splice(p,1);renderAreas();save()})}
$("addArea").onclick=()=>{visit.areas.push(newArea("Neuer Schadensbereich"));renderAreas();save()};

function renderWorkExtras(){
 const box=$("workExtras");box.innerHTML="";
 admin.extras.filter(e=>e.active).forEach(e=>{
  const qty=visit.extraQuantities[e.name]||0;
  const article=e.articleId?admin.lexwareArticles.find(a=>a.id===e.articleId):null;
  const shownName=article?article.title:e.name;
  const shownUnit=article?(article.unitName||e.unit):e.unit;
  const description=article&&article.description?`<div class="article-description">${esc(article.description)}</div>`:"";
  box.innerHTML+=`<div class="catalog-row"><div class="grid"><div><strong>${esc(shownName)}</strong><small>${esc(shownUnit)}</small>${description}</div><div><label>Menge</label><input type="number" step=".01" data-workextra="${esc(e.name)}" value="${qty}"></div></div></div>`;
 });
 box.querySelectorAll("[data-workextra]").forEach(x=>x.oninput=()=>{visit.extraQuantities[x.dataset.workextra]=+x.value||0;save()});
}
function pricing(normal){const pct=discount.type==="custom"?+discount.custom||0:discount.type==="none"?0:+discount.type||0;let special=0;if(discount.specialType==="percent")special=normal*(+discount.specialValue||0)/100;if(discount.specialType==="amount")special=+discount.specialValue||0;special=Math.max(0,Math.min(normal,special));const offer=normal-special;return{pct,special,offer,skonto:offer*(1-pct/100)}}
function smallJobSurcharge(hsLength,baseGross){
 if(!admin.smallJob.enabled||hsLength<=0||hsLength>=admin.smallJob.threshold)return 0;
 return admin.smallJob.type==="percent"?baseGross*(admin.smallJob.value/100):admin.smallJob.value;
}
function collectLineItems(){
 const lineItems=[];let baseGross=0,totalMaterial=0,totalHours=0,totalHz=0,hsLength=0;
 visit.areas.forEach(a=>a.measures.forEach(m=>{
  const r=calcMeasure(m);baseGross+=r.gross;totalMaterial+=r.materialCost;totalHours+=r.hours;totalHz+=r.reserveLiters;hsLength+=r.smallEligibleLength;
  lineItems.push({kind:m.type,name:`${a.name} – ${m.type}`,description:[r.label,m.note].filter(Boolean).join("\n"),quantity:r.unit||1,unitName:r.unitLabel==="m²"?"m²":"lfm",grossUnit:r.unit?r.gross/r.unit:r.gross,totalGross:r.gross,articleId:admin.articleMappings[m.type]||""});
 }));
 admin.extras.filter(e=>e.active).forEach(e=>{
  const qty=visit.extraQuantities[e.name]||0;
  if(qty>0){
    const article=e.articleId?admin.lexwareArticles.find(a=>a.id===e.articleId):null;
    const grossUnit=+e.gross||0;
    const unitName=article&&article.unitName?article.unitName:e.unit;
    const name=article&&article.title?article.title:e.name;
    const description=article&&article.description?article.description:"";
    baseGross+=qty*grossUnit;
    lineItems.push({
      kind:"extra",
      name,
      description,
      quantity:qty,
      unitName,
      grossUnit,
      totalGross:qty*grossUnit,
      articleId:article?article.id:"",
      articleType:article?article.type:""
    });
  }
 });
 const small=smallJobSurcharge(hsLength,baseGross);
 if(small>0){baseGross+=small;lineItems.push({kind:"smallJob",name:"Kleinbaustellenzuschlag",description:`für Horizontalsperren unter ${num(admin.smallJob.threshold)} lfm`,quantity:1,unitName:"pauschal",grossUnit:small,totalGross:small,articleId:admin.articleMappings.smallJob||"",hidden:!admin.smallJob.visible})}
 return{lineItems,baseGross,totalMaterial,totalHours,totalHz,small};
}
function calculate(){
 collectVisit();const totals=collectLineItems();const p=pricing(totals.baseGross);
 $("internalAreas").innerHTML="";$("offerMeasures").innerHTML="";$("offerExtras").innerHTML="";$("offerPhotos").innerHTML="";
 totals.lineItems.forEach(item=>{
  if(item.kind==="extra"||item.kind==="smallJob"){if(!item.hidden)$("offerExtras").innerHTML+=`<div class="metric"><span>${esc(item.name)}</span><strong>${eur(item.totalGross)}</strong></div>`;return}
  $("internalAreas").innerHTML+=`<div class="result"><strong>${esc(item.name)}</strong><div class="metric"><span>Umfang</span><strong>${esc(item.description.split("\n")[0])}</strong></div><div class="metric"><span>Preis je ${esc(item.unitName)}</span><strong>${eur(item.grossUnit)}</strong></div><div class="metric"><span>Preis brutto</span><strong>${eur(item.totalGross)}</strong></div></div>`;
  $("offerMeasures").innerHTML+=`<div class="metric"><span>${esc(item.name)}</span><strong>${esc(item.description.split("\n")[0])}</strong></div>`;
 });
 visit.areas.forEach(a=>a.photos.filter(p=>p.show).forEach(p=>$("offerPhotos").innerHTML+=`<div class="photo-card"><img src="${p.src}"><strong>${esc(a.name)}</strong>${p.caption?`<p>${esc(p.caption)}</p>`:""}</div>`));
 const remaining=totals.baseGross/1.19-totals.totalMaterial;
 $("totalHz").textContent=totals.totalHz+" l";$("totalHours").textContent=num(totals.totalHours)+" Std.";$("materialCost").textContent=eur(totals.totalMaterial);$("personnelCost").textContent="nicht berücksichtigt";$("selfCost").textContent=eur(totals.totalMaterial);$("margin").textContent=eur(remaining);
 $("offerCustomer").textContent=[visit.customer.salutation,visit.customer.firstName,visit.customer.lastName].filter(Boolean).join(" ")||"-";
 $("offerAddress").textContent=visit.customer.objectAddress||[visit.customer.street,visit.customer.zip,visit.customer.city].filter(Boolean).join(", ")||"-";
 $("offerDescription").textContent=visit.customerDescription||"-";
 $("normalPrice").textContent=eur(totals.baseGross);$("specialRowLabel").textContent=discount.specialLabel||"Sonderaktion";$("specialAmount").textContent="− "+eur(p.special);$("normalPriceRow").classList.toggle("hidden",p.special<=0);$("specialRow").classList.toggle("hidden",p.special<=0);$("offerPrice").textContent=eur(p.offer);$("skontoText").textContent=`${num(p.pct)} % Skonto bei Zahlung innerhalb von 3 Werktagen`;$("skontoPrice").textContent=eur(p.skonto);$("skontoRow").classList.toggle("hidden",p.pct<=0);
 $("dashboardOffer").textContent=eur(p.offer);$("dashboardCustomer").textContent=[visit.customer.firstName,visit.customer.lastName].filter(Boolean).join(" ")||"-";$("dashboardPriceList").textContent=admin.priceListName;
 return{...totals,pricing:p};
}
["discountType","discountCustom","specialType","specialValue","specialLabel"].forEach(id=>$(id).oninput=()=>{discount={type:$("discountType").value,custom:+$("discountCustom").value||0,specialType:$("specialType").value,specialValue:+$("specialValue").value||0,specialLabel:$("specialLabel").value};save();calculate()});
$("toggleInternal").onclick=()=>$("internalCalculation").classList.toggle("hidden");

function renderAdmin(){
 $("priceListName").value=admin.priceListName;$("priceListDate").value=admin.priceListDate;
 $("adminHzPurchase").value=admin.hzPurchaseNet;$("adminHzSale").value=admin.hzSaleNet;$("adminReserve").value=admin.reservePct;
 $("adminDrill").value=admin.drill;$("adminFill").value=admin.fill;$("adminClose").value=admin.close;$("adminSetupHours").value=admin.setupHours;
 $("adminSmallJobEnabled").value=String(admin.smallJob.enabled);$("adminSmallJobThreshold").value=admin.smallJob.threshold;$("adminSmallJobType").value=admin.smallJob.type;$("adminSmallJobValue").value=admin.smallJob.value;$("adminSmallJobVisible").value=String(admin.smallJob.visible);
 $("adminWallSolePrice").value=admin.wallSoleGross;$("adminExtraResinKgPrice").value=admin.extraResinKgNet;
 $("workerUrl").value=admin.workerUrl;$("appSecret").value=admin.appSecret;
 renderResinPrices();renderAdminExtras();renderArticleMappings();
}
function renderResinPrices(){const b=$("resinPrices");b.innerHTML="";Object.entries(admin.resin.tiers).forEach(([k,v])=>b.innerHTML+=`<div class="catalog-row"><div class="grid"><div><label>bis ${k} lfm</label><input value="${v}" data-resin-tier="${k}"></div><div><label>brutto €</label><input value="${v}" readonly></div></div></div>`);b.innerHTML+=`<div class="catalog-row"><label>ab ${admin.resin.threshold} lfm je weiterer lfm</label><input id="resinAdditional" value="${admin.resin.additional}"></div>`;b.querySelectorAll("[data-resin-tier]").forEach(x=>x.oninput=()=>admin.resin.tiers[x.dataset.resinTier]=+x.value||0);$("resinAdditional").oninput=()=>admin.resin.additional=+$("resinAdditional").value||0}
function articleOptions(selected){
 return '<option value="">freie Leistung</option>'+admin.lexwareArticles.map(a=>`<option value="${a.id}" ${selected===a.id?"selected":""}>${esc(a.articleNumber?`${a.articleNumber} – `:"")}${esc(a.title)}</option>`).join("");
}
function articleOptions(selected){
 return '<option value="">freie Leistung</option>'+admin.lexwareArticles.map(a=>`<option value="${a.id}" ${selected===a.id?"selected":""}>${esc(a.articleNumber?`${a.articleNumber} – `:"")}${esc(a.title)}</option>`).join("");
}
function renderAdminExtras(){
 const b=$("adminExtras");b.innerHTML="";
 admin.extras.forEach((e,i)=>{
  const article=e.articleId?admin.lexwareArticles.find(a=>a.id===e.articleId):null;
  b.innerHTML+=`<div class="catalog-row">
   <div class="grid">
    <div class="full"><label>Lexware-Artikel</label><select data-extra-article="${i}">${articleOptions(e.articleId||"")}</select></div>
    ${article?`
      <div class="full">
        <strong>${esc(article.title)}</strong>
        <div class="article-description">${esc(article.description||"")}</div>
      </div>
      <div><label>Einheit aus Lexware</label><input value="${esc(article.unitName||e.unit||"")}" readonly></div>
      <div><label>Steuersatz aus Lexware</label><input value="${article.price&&article.price.taxRate!=null?article.price.taxRate+" %":"19 %"}" readonly></div>
    `:`
      <div><label>Leistung</label><input data-ae="${i}" data-aef="name" value="${esc(e.name)}"></div>
      <div><label>Einheit</label><input data-ae="${i}" data-aef="unit" value="${esc(e.unit)}"></div>
    `}
    <div><label>Preis brutto aus der App</label><input data-ae="${i}" data-aef="gross" value="${e.gross}"></div>
    <div><label>interne Kosten netto</label><input data-ae="${i}" data-aef="cost" value="${e.cost||0}"></div>
    <label><input type="checkbox" data-aactive="${i}" ${e.active?"checked":""}> aktiv</label>
    <button class="danger" data-aedel="${i}">Löschen</button>
   </div>
  </div>`;
 });
 b.querySelectorAll("[data-aef]").forEach(x=>x.oninput=()=>{
  admin.extras[+x.dataset.ae][x.dataset.aef]=x.value;
 });
 b.querySelectorAll("[data-extra-article]").forEach(x=>x.onchange=()=>{
  const e=admin.extras[+x.dataset.extraArticle];
  e.articleId=x.value;
  const article=admin.lexwareArticles.find(a=>a.id===x.value);
  if(article){
    e.name=article.title;
    e.unit=article.unitName||e.unit;
  }
  renderAdminExtras();
 });
 b.querySelectorAll("[data-aactive]").forEach(x=>x.onchange=()=>admin.extras[+x.dataset.aactive].active=x.checked);
 b.querySelectorAll("[data-aedel]").forEach(x=>x.onclick=()=>{
  admin.extras.splice(+x.dataset.aedel,1);
  renderAdminExtras();
 });
};
$("resetAdmin").onclick=()=>{if(confirm("Standardwerte laden?")){admin=clone(DEFAULT_ADMIN);save();renderAdmin();status("adminStatus","Standardwerte geladen.",true)}};

function renderArticleMappings(){
 const mappings=[["mapHorizontalsperre","Horizontalsperre"],["mapFlächensperre","Flächensperre"],["mapHarzverpressung","Harzverpressung"],["mapWandSohlen","Wand-Sohlen-Anschluss"],["mapSmallJob","smallJob"]];
 mappings.forEach(([id,key])=>{const s=$(id);const selected=admin.articleMappings[key]||"";s.innerHTML='<option value="">freie Position</option>'+admin.lexwareArticles.map(a=>`<option value="${a.id}" ${selected===a.id?"selected":""}>${esc(a.articleNumber?`${a.articleNumber} – `:"")}${esc(a.title)}</option>`).join("")});
}
$("loadLexwareArticles").onclick=async()=>{try{const d=await api("/articles");admin.lexwareArticles=d.articles||[];renderArticleMappings();save();status("articleMappingStatus",`${admin.lexwareArticles.length} Artikel geladen.`,true)}catch(e){status("articleMappingStatus",e.message,false)}};
$("clearArticleMappings").onclick=()=>{admin.articleMappings={};renderArticleMappings();save();status("articleMappingStatus","Zuordnungen gelöscht.",true)};

function bindSpeech(){document.querySelectorAll("[data-speech-target]").forEach(b=>b.onclick=()=>{const SR=window.SpeechRecognition||window.webkitSpeechRecognition;if(!SR)return alert("Nutze die Mikrofontaste der iPhone-Tastatur.");const r=new SR();r.lang="de-DE";r.onresult=e=>{$(b.dataset.speechTarget).value+=($(b.dataset.speechTarget).value?" ":"")+e.results[0][0].transcript};r.start()})}
function cfg(){return{url:admin.workerUrl,secret:admin.appSecret}}
async function api(path,opt={}){const c=cfg(),r=await fetch(c.url+path,{...opt,headers:{...(opt.headers||{}),"X-App-Secret":c.secret}}),d=await r.json();if(!r.ok)throw new Error(d.error+(d.details?` – ${JSON.stringify(d.details)}`:""));return d}

async function pipedriveDialog(){const term=prompt("Kunde in Pipedrive suchen:");if(!term)return;try{const d=await api("/pipedrive/persons/search?term="+encodeURIComponent(term));if(!d.people.length)return alert("Kein Treffer.");const labels=d.people.map((p,i)=>`${i+1}: ${p.name} ${p.email||""}`).join("\n");const nr=+prompt(labels+"\n\nNummer auswählen:");const selected=d.people[nr-1];if(!selected)return;const detail=await api("/pipedrive/persons/"+selected.id),p=detail.person;visit.customer={...visit.customer,pipedriveId:p.id||"",firstName:p.firstName||"",lastName:p.lastName||p.name||"",email:p.email||"",phone:p.phone||"",street:p.street||"",zip:p.zip||"",city:p.city||"",objectAddress:p.objectAddress||""};save();renderVisit()}catch(e){alert(e.message)}}

async function lexwareCustomerDialog(){
  const term=prompt("Bestehenden Kunden in Lexware suchen:\nName, E-Mail oder Kundennummer");
  if(!term)return;

  try{
    const data=await api("/lexware/contacts/search?term="+encodeURIComponent(term));

    if(!data.contacts||!data.contacts.length){
      alert("Kein passender Lexware-Kunde gefunden.");
      return;
    }

    const labels=data.contacts.map((contact,index)=>{
      const number=contact.customerNumber?` [${contact.customerNumber}]`:"";
      const email=contact.email?` – ${contact.email}`:"";
      return `${index+1}: ${contact.name}${number}${email}`;
    }).join("\n");

    const selectedNumber=+prompt(labels+"\n\nNummer auswählen:");
    const selected=data.contacts[selectedNumber-1];
    if(!selected)return;

    const detail=await api("/lexware/contacts/"+encodeURIComponent(selected.id));
    const customer=detail.contact;

    visit.customer={
      ...visit.customer,
      lexwareContactId:customer.id||"",
      salutation:customer.salutation||"",
      firstName:customer.firstName||"",
      lastName:customer.lastName||customer.name||"",
      company:customer.company||"",
      email:customer.email||"",
      phone:customer.phone||"",
      street:customer.street||"",
      zip:customer.zip||"",
      city:customer.city||""
    };

    save();
    renderVisit();
    alert("Lexware-Kundendaten wurden übernommen.");
  }catch(error){
    alert(error.message);
  }
}


function lexwarePayload(){
 const totals=calculate(),customer=visit.customer;
 const visibleItems=totals.lineItems.filter(i=>!i.hidden);
 const factor=totals.pricing.offer/totals.baseGross || 1;
 const lineItems=visibleItems.map(item=>{
  const mappedArticle=item.articleId?admin.lexwareArticles.find(a=>a.id===item.articleId):null;
  const grossUnit=item.grossUnit*factor;
  const lineType=mappedArticle
    ? (String(mappedArticle.type).toUpperCase()==="PRODUCT"?"material":"service")
    : "custom";
  return{
    ...(mappedArticle?{id:mappedArticle.id,type:lineType}:{type:"custom"}),
    name:mappedArticle?mappedArticle.title:item.name,
    description:mappedArticle?(mappedArticle.description||""):(item.description||""),
    quantity:item.quantity,
    unitName:mappedArticle?(mappedArticle.unitName||item.unitName):item.unitName,
    unitPrice:{
      currency:"EUR",
      grossAmount:+grossUnit.toFixed(2),
      taxRatePercentage:mappedArticle&&mappedArticle.price&&mappedArticle.price.taxRate!=null
        ? +mappedArticle.price.taxRate
        : 19
    },
    discountPercentage:0
  };
 });
 return{
  customer:{
    lexwareContactId:customer.lexwareContactId||"",
    salutation:customer.salutation,firstName:customer.firstName,lastName:customer.lastName,
    company:customer.company,street:customer.street,zip:customer.zip,city:customer.city,
    email:customer.email,phone:customer.phone
  },
  quotation:{
    lineItems,
    introduction:"Gerne bieten wir Ihnen die nachfolgend beschriebenen Abdichtungsmaßnahmen an.",
    remark:"Wir arbeiten ausschließlich mit Systemprodukten der BKM.MANNESMANN AG. Die Ausführung erfolgt nach den technischen Vorgaben und den Bedingungen des Angebots.",
    title:"Angebot",
    paymentDiscount:totals.pricing.pct>0?{discountPercentage:totals.pricing.pct,discountRange:3}:null,
    objectAddress:customer.objectAddress||[customer.street,customer.zip,customer.city].filter(Boolean).join(", ")
  }
 };
}
$("sendLexwareQuotation").onclick=async()=>{try{collectVisit();const d=await api("/quotations",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(lexwarePayload())});if(d.contactId){visit.customer.lexwareContactId=d.contactId;save()}status("offerStatus","Lexware-Angebot wurde als Entwurf erstellt.",true);if(d.editUrl&&confirm("Angebot jetzt in Lexware öffnen?"))window.open(d.editUrl,"_blank")}catch(e){status("offerStatus",e.message,false)}};

function reportRow(l,v){return v?`<tr><th>${esc(l)}</th><td>${esc(v)}</td></tr>`:""}
function buildReport(){calculate();let h=`<div class="report-section"><h2>Kunde und Objekt</h2><table class="report-table">${reportRow("Kunde",[visit.customer.salutation,visit.customer.firstName,visit.customer.lastName].filter(Boolean).join(" "))}${reportRow("Objekt",visit.customer.objectAddress||[visit.customer.street,visit.customer.zip,visit.customer.city].filter(Boolean).join(", "))}${reportRow("Baujahr",visit.building.yearBuilt)}${reportRow("Bauart",visit.building.buildingType)}${reportRow("Geschoss",visit.building.floor)}${reportRow("Fundamentart",visit.building.foundationType)}${reportRow("Raumtemperatur",visit.building.roomTemp?visit.building.roomTemp+" °C":"")}${reportRow("Luftfeuchtigkeit",visit.building.humidity?visit.building.humidity+" %":"")}${reportRow("Oberflächentemperatur",visit.building.surfaceTemp?visit.building.surfaceTemp+" °C":"")}${reportRow("Taupunkt",visit.building.dewPoint?visit.building.dewPoint+" °C":"")}</table></div><div class="report-section"><h2>Schadensbild</h2><p>${esc(visit.damageDescription)}</p><h2>Empfehlung</h2><p>${esc(visit.customerDescription)}</p></div>`;visit.areas.forEach((a,i)=>{h+=`<div class="report-section"><h2>${i+1}. ${esc(a.name)}</h2><table class="report-table">${reportRow("Wandmaterial",a.wallMaterialOther||a.wallMaterial)}${reportRow("Wandstärke",a.wallThickness+" cm")}${reportRow("Erdkontakt",a.earthContact)}${reportRow("Wandbelag",a.wallCover)}${reportRow("Notizen",a.notes)}</table><h3>Messwerte</h3><table class="report-table"><tr><th>Gerät</th><th>Wert</th><th>Höhe</th><th>Position</th><th>Bemerkung</th></tr>${a.measurements.map(m=>`<tr><td>${esc(m.device)}</td><td>${esc(m.value+" "+m.unit)}</td><td>${esc(m.height)}</td><td>${esc(m.location)}</td><td>${esc(m.note)}</td></tr>`).join("")}</table><h3>Maßnahmen</h3><table class="report-table">${a.measures.map(m=>{const r=calcMeasure(m);return`<tr><th>${esc(m.type)}</th><td>${r.label}</td></tr>`}).join("")}</table><div class="photo-grid">${a.photos.filter(p=>p.show).map(p=>`<div class="photo-card"><img src="${p.src}"><p>${esc(p.caption)}</p></div>`).join("")}</div></div>`});$("reportContent").innerHTML=h}
function printMode(mode){document.body.classList.add(mode);window.print();setTimeout(()=>document.body.classList.remove(mode),400)}
$("printCustomerPdf").onclick=()=>{calculate();printMode("print-offer")};
$("printReportPdf").onclick=()=>{buildReport();printMode("print-report")};

$("discountType").value=discount.type;$("discountCustom").value=discount.custom;$("specialType").value=discount.specialType;$("specialValue").value=discount.specialValue;$("specialLabel").value=discount.specialLabel;
renderVisit();renderAdmin();calculate();show("dashboard");
})();