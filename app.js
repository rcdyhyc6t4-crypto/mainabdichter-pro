
(function(){
"use strict";

const CONFIG={
  spacing:.25,rowSpacing:.25,factorHS:14,factorFS:10,reservePct:10,
  hsSellNet:98,wallSoleGross:300,resinGross:495,areaGross:690,
  setupNet:269,vat:19,skontoPct:5,hourly:85,materialEK:30,
  drillRate:60,fillRate:30,closeRate:40,setupHours:1,smallNet:200,fixedNet:250
};

const $=id=>document.getElementById(id);
const eur=v=>new Intl.NumberFormat("de-DE",{style:"currency",currency:"EUR"}).format(v);
const num=v=>new Intl.NumberFormat("de-DE",{maximumFractionDigits:2}).format(v);
const esc=s=>String(s||"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));

let measurements=JSON.parse(localStorage.getItem("v5_measurements")||"[]");
let measures=JSON.parse(localStorage.getItem("v5_measures")||"[]");
let extras=JSON.parse(localStorage.getItem("v5_extras")||"[]");
let photos=JSON.parse(localStorage.getItem("v5_photos")||"[]");

if(!measurements.length)measurements=[{device:"Gann Hydromette Compact B",value:"",location:"",depth:"",note:""}];
if(!measures.length)measures=[{type:"Horizontalsperre",length:8,width:0,height:0,wall:30}];
if(!extras.length)extras=[
 {name:"Baustelleneinrichtung inkl. An- und Abfahrt",qty:1,unit:"pauschal",sellGross:CONFIG.setupNet*1.19,costNet:CONFIG.setupNet,show:true,fixed:true},
 {name:"Bauschutt entsorgen",qty:0,unit:"pauschal",sellGross:0,costNet:0,show:true},
 {name:"Heizkörper demontieren und montieren",qty:0,unit:"Stück",sellGross:0,costNet:0,show:true},
 {name:"Vorarbeiten / Freilegen",qty:0,unit:"Stunden",sellGross:0,costNet:0,show:true},
 {name:"Putz abschlagen",qty:0,unit:"m²",sellGross:0,costNet:0,show:true}
];

document.querySelectorAll("nav button").forEach(btn=>btn.addEventListener("click",()=>showPage(btn.dataset.page,btn)));
function showPage(id,btn){
  document.querySelectorAll(".page").forEach(p=>p.classList.remove("active"));
  document.querySelectorAll("nav button").forEach(b=>b.classList.remove("active"));
  $(id).classList.add("active"); if(btn)btn.classList.add("active");
}
$("openPipedrive").addEventListener("click",()=>document.querySelector('[data-page="systeme"]').click());
$("newCustomer").addEventListener("click",clearCustomer);

["salutation","firstName","lastName","phone","email","company","street","zip","city","objectAddress","yearBuilt","masonry","roomTemp","humidity","surfaceTemp","damageDescription","customerDescription"].forEach(id=>$(id).addEventListener("input",recalculate));
$("roomTemp").addEventListener("input",calcDewPoint);
$("humidity").addEventListener("input",calcDewPoint);

function calcDewPoint(){
  const t=parseFloat($("roomTemp").value),rh=parseFloat($("humidity").value);
  if(!Number.isFinite(t)||!Number.isFinite(rh)||rh<=0){$("dewPoint").value="";return}
  const a=17.62,b=243.12,g=Math.log(rh/100)+(a*t)/(b+t),dp=(b*g)/(a-g);
  $("dewPoint").value=dp.toFixed(1);recalculate();
}

function renderMeasurements(){
  const box=$("measurementList");box.innerHTML="";
  measurements.forEach((m,i)=>{
    const d=document.createElement("div");d.className="measurement";
    d.innerHTML=`<div class="measurement-grid">
      <div class="wide"><label>Gerät</label><input data-mi="${i}" data-mf="device" value="${esc(m.device)}"></div>
      <div><label>Messwert</label><input data-mi="${i}" data-mf="value" value="${esc(m.value)}"></div>
      <div><label>Einheit</label><select data-mi="${i}" data-mf="unit"><option ${m.unit==="Digits"?"selected":""}>Digits</option><option ${m.unit==="%"?"selected":""}>%</option><option ${m.unit==="°C"?"selected":""}>°C</option></select></div>
      <div><label>Position</label><input data-mi="${i}" data-mf="location" value="${esc(m.location)}"></div>
      <div><label>Messtiefe</label><input data-mi="${i}" data-mf="depth" value="${esc(m.depth)}"></div>
      <div class="wide"><label>Bemerkung</label><input data-mi="${i}" data-mf="note" value="${esc(m.note)}"></div>
      <button class="danger" data-mdel="${i}">Löschen</button>
    </div>`;
    box.appendChild(d);
  });
  box.querySelectorAll("[data-mf]").forEach(el=>el.addEventListener("input",()=>{measurements[+el.dataset.mi][el.dataset.mf]=el.value;saveAll()}));
  box.querySelectorAll("[data-mdel]").forEach(el=>el.addEventListener("click",()=>{measurements.splice(+el.dataset.mdel,1);renderMeasurements();saveAll()}));
}
$("addMeasurement").addEventListener("click",()=>{measurements.push({device:"Gann Hydromette Compact B",value:"",unit:"Digits",location:"",depth:"",note:""});renderMeasurements();saveAll()});

function hsCalc(length,wall){const holes=Math.ceil((+length||0)/CONFIG.spacing);return{holes,liters:holes*(+wall||0)*CONFIG.factorHS/1000}}
function fsCalc(width,height,wall){const holesRow=Math.ceil((+width||0)/CONFIG.spacing),rows=Math.ceil((+height||0)/CONFIG.rowSpacing);const first=holesRow*(+wall||0)*CONFIG.factorHS/1000,upper=Math.max(rows-1,0)*holesRow*(+wall||0)*CONFIG.factorFS/1000;return{holes:holesRow*rows,rows,liters:first+upper,area:(+width||0)*(+height||0)}}
function calcMeasure(m){
  let holes=0,liters=0,gross=0,label="",hours=0;
  if(m.type==="Horizontalsperre"){const r=hsCalc(m.length,m.wall);holes=r.holes;liters=r.liters;gross=Math.ceil(liters*1.1)*CONFIG.hsSellNet*1.19;label=`${num(m.length)} lfm`}
  if(m.type==="Flächensperre"){const r=fsCalc(m.width,m.height,m.wall);holes=r.holes;liters=r.liters;gross=r.area*CONFIG.areaGross;label=`${num(m.width)} × ${num(m.height)} m = ${num(r.area)} m²`}
  if(m.type==="Harzverpressung"){gross=(+m.length||0)*CONFIG.resinGross;label=`${num(m.length)} lfm`}
  if(m.type==="Wand-Sohlen-Anschluss"){const r=hsCalc(m.length,m.wall);holes=r.holes;liters=r.liters;gross=(+m.length||0)*CONFIG.wallSoleGross+Math.ceil(liters*1.1)*CONFIG.hsSellNet*1.19;label=`${num(m.length)} lfm inkl. Horizontalsperre`}
  if(holes)hours=Math.ceil(holes/CONFIG.drillRate+holes/CONFIG.fillRate+holes/CONFIG.closeRate+CONFIG.setupHours);
  const reserve=Math.ceil(liters*1.1),self=reserve*CONFIG.materialEK+hours*CONFIG.hourly;
  return{holes,liters,reserve,hours,gross,label,self}
}
function renderMeasures(){
  const box=$("measureList");box.innerHTML="";
  measures.forEach((m,i)=>{
    const area=m.type==="Flächensperre",d=document.createElement("div");d.className="measure";
    d.innerHTML=`<div class="measure-grid">
      <div class="wide"><label>Maßnahme</label><select data-xi="${i}" data-xf="type">
        <option ${m.type==="Horizontalsperre"?"selected":""}>Horizontalsperre</option>
        <option ${m.type==="Flächensperre"?"selected":""}>Flächensperre</option>
        <option ${m.type==="Harzverpressung"?"selected":""}>Harzverpressung</option>
        <option ${m.type==="Wand-Sohlen-Anschluss"?"selected":""}>Wand-Sohlen-Anschluss</option>
      </select></div>
      <div><label>Wandstärke cm</label><input type="number" data-xi="${i}" data-xf="wall" value="${m.wall||30}"></div>
      ${area?`<div><label>Breite m</label><input type="number" step=".01" data-xi="${i}" data-xf="width" value="${m.width||0}"></div><div><label>Höhe m</label><input type="number" step=".01" data-xi="${i}" data-xf="height" value="${m.height||0}"></div>`:`<div><label>Länge lfm</label><input type="number" step=".01" data-xi="${i}" data-xf="length" value="${m.length||0}"></div>`}
      <button class="danger" data-xdel="${i}">Löschen</button>
    </div><div id="measureResult${i}"></div>`;
    box.appendChild(d);
  });
  box.querySelectorAll("[data-xf]").forEach(el=>el.addEventListener("input",()=>{measures[+el.dataset.xi][el.dataset.xf]=el.value;if(el.dataset.xf==="type")renderMeasures();saveAll();recalculate()}));
  box.querySelectorAll("[data-xdel]").forEach(el=>el.addEventListener("click",()=>{measures.splice(+el.dataset.xdel,1);renderMeasures();saveAll();recalculate()}));
}
$("addMeasure").addEventListener("click",()=>{measures.push({type:"Horizontalsperre",length:0,width:0,height:0,wall:30});renderMeasures();saveAll();recalculate()});

function renderExtras(){
  const box=$("extraList");box.innerHTML="";
  extras.forEach((e,i)=>{
    const d=document.createElement("div");d.className="extra";
    d.innerHTML=`<div class="extra-grid">
      <div class="wide"><label>Leistung</label><input data-ei="${i}" data-ef="name" value="${esc(e.name)}"></div>
      <div><label>Menge</label><input type="number" step=".01" data-ei="${i}" data-ef="qty" value="${e.qty||0}"></div>
      <div><label>Einheit</label><input data-ei="${i}" data-ef="unit" value="${esc(e.unit||"")}"></div>
      <div><label>VK brutto je Einheit</label><input type="number" step=".01" data-ei="${i}" data-ef="sellGross" value="${e.sellGross||0}"></div>
      <div><label>EK netto je Einheit</label><input type="number" step=".01" data-ei="${i}" data-ef="costNet" value="${e.costNet||0}"></div>
      <label><input type="checkbox" data-eshow="${i}" ${e.show!==false?"checked":""}> Kundenansicht</label>
      <button class="danger" data-edel="${i}">Löschen</button>
    </div>`;
    box.appendChild(d);
  });
  box.querySelectorAll("[data-ef]").forEach(el=>el.addEventListener("input",()=>{extras[+el.dataset.ei][el.dataset.ef]=el.value;saveAll();recalculate()}));
  box.querySelectorAll("[data-eshow]").forEach(el=>el.addEventListener("change",()=>{extras[+el.dataset.eshow].show=el.checked;saveAll();recalculate()}));
  box.querySelectorAll("[data-edel]").forEach(el=>el.addEventListener("click",()=>{extras.splice(+el.dataset.edel,1);renderExtras();saveAll();recalculate()}));
}
$("addExtra").addEventListener("click",()=>{extras.push({name:"",qty:1,unit:"pauschal",sellGross:0,costNet:0,show:true});renderExtras();saveAll();recalculate()});

$("photoInput").addEventListener("change",ev=>{
  [...ev.target.files].forEach(file=>{
    const r=new FileReader();r.onload=e=>{photos.push({src:e.target.result,caption:"",show:true});renderPhotos();saveAll();recalculate()};r.readAsDataURL(file);
  });ev.target.value="";
});
function renderPhotos(){
  const box=$("photoGrid");box.innerHTML="";
  photos.forEach((p,i)=>{
    const d=document.createElement("div");d.className="photo-card";
    d.innerHTML=`<img src="${p.src}"><input data-pi="${i}" data-pf="caption" placeholder="Bildbeschreibung" value="${esc(p.caption)}"><label><input type="checkbox" data-pshow="${i}" ${p.show!==false?"checked":""}> Kundenansicht</label><button class="danger" data-pdel="${i}">Löschen</button>`;
    box.appendChild(d);
  });
  box.querySelectorAll("[data-pf]").forEach(el=>el.addEventListener("input",()=>{photos[+el.dataset.pi][el.dataset.pf]=el.value;saveAll();recalculate()}));
  box.querySelectorAll("[data-pshow]").forEach(el=>el.addEventListener("change",()=>{photos[+el.dataset.pshow].show=el.checked;saveAll();recalculate()}));
  box.querySelectorAll("[data-pdel]").forEach(el=>el.addEventListener("click",()=>{photos.splice(+el.dataset.pdel,1);renderPhotos();saveAll();recalculate()}));
}

function recalculate(){
  let measureGross=0,measureSelf=0,extraGross=0,extraCost=0;
  $("internalMeasures").innerHTML="";$("cMeasures").innerHTML="";$("cExtras").innerHTML="";
  measures.forEach((m,i)=>{
    const r=calcMeasure(m);measureGross+=r.gross;measureSelf+=r.self;
    const local=$("measureResult"+i);if(local)local.textContent=`${r.label} · Material ${num(r.liters)} l · ${r.hours} Std. · ${eur(r.gross)}`;
    $("internalMeasures").innerHTML+=`<div class="result"><strong>${esc(m.type)}</strong><div class="metric"><span>Umfang</span><strong>${r.label}</strong></div><div class="metric"><span>Bohrlöcher</span><strong>${r.holes}</strong></div><div class="metric"><span>Material</span><strong>${num(r.liters)} l</strong></div><div class="metric"><span>Arbeitszeit</span><strong>${r.hours} Std.</strong></div><div class="metric"><span>VK brutto</span><strong>${eur(r.gross)}</strong></div></div>`;
    $("cMeasures").innerHTML+=`<div class="metric"><span>${esc(m.type)}</span><strong>${r.label}</strong></div>`;
  });
  extras.forEach(e=>{
    const g=(+e.qty||0)*(+e.sellGross||0),c=(+e.qty||0)*(+e.costNet||0);extraGross+=g;extraCost+=c;
    if(e.show!==false&&g>0)$("cExtras").innerHTML+=`<div class="metric"><span>${esc(e.name)}</span><strong>${eur(g)}</strong></div>`;
  });
  const total=measureGross+extraGross,net=total/(1+CONFIG.vat/100),self=measureSelf+extraCost+CONFIG.smallNet+CONFIG.fixedNet,margin=net-self;
  $("measureTotal").textContent=eur(measureGross);$("extraTotal").textContent=eur(extraGross);
  const setupItem=extras.find(e=>String(e.name).toLowerCase().includes("baustelleneinrichtung"));
  $("setupTotal").textContent=eur(setupItem?(+setupItem.qty||0)*(+setupItem.sellGross||0):0);
  $("grandTotal").textContent=eur(total);$("skontoTotal").textContent=eur(total*.95);$("selfCost").textContent=eur(self);$("margin").textContent=eur(margin);
  $("cName").textContent=[$("salutation").value,$("firstName").value,$("lastName").value].filter(Boolean).join(" ")||"–";
  $("cAddress").textContent=$("objectAddress").value||[$("street").value,$("zip").value,$("city").value].filter(Boolean).join(", ")||"–";
  $("cDescription").textContent=$("customerDescription").value||"–";$("cPrice").textContent=eur(total);$("cSkonto").textContent=eur(total*.95);
  $("cPhotos").innerHTML="";photos.filter(p=>p.show!==false).slice(0,6).forEach(p=>{$("cPhotos").innerHTML+=`<div class="photo-card"><img src="${p.src}">${p.caption?`<p>${esc(p.caption)}</p>`:""}</div>`});
}

function config(){let url=$("workerUrl").value.trim();if(url.endsWith("/"))url=url.slice(0,-1);const secret=$("appSecret").value;localStorage.setItem("v5_worker",url);localStorage.setItem("v5_secret",secret);return{url,secret}}
function status(id,msg,ok){const s=$(id);s.className="status "+(ok?"ok":"err");s.textContent=msg}
async function call(path,options={}){const c=config();const r=await fetch(c.url+path,{...options,headers:{...(options.headers||{}),"X-App-Secret":c.secret}});const d=await r.json();if(!r.ok)throw new Error(d.error+(d.details?" – "+JSON.stringify(d.details):""));return d}

$("pdTest").addEventListener("click",async()=>{try{await call("/pipedrive/test");status("pdStatus","Pipedrive-Verbindung erfolgreich.",true)}catch(e){status("pdStatus",e.message,false)}});
$("pdSearchBtn").addEventListener("click",async()=>{const term=$("pdSearch").value.trim();if(term.length<2)return status("pdStatus","Mindestens 2 Zeichen eingeben.",false);try{const d=await call("/pipedrive/persons/search?term="+encodeURIComponent(term));renderPdResults(d.people||[]);status("pdStatus",(d.people||[]).length+" Treffer gefunden.",true)}catch(e){status("pdStatus",e.message,false)}});
function renderPdResults(people){const box=$("pdResults");box.innerHTML="";people.forEach(p=>{const d=document.createElement("div");d.className="result";d.innerHTML=`<strong>${esc(p.name)}</strong><p>${esc(p.email||"")} ${esc(p.phone||"")}</p><button class="primary" data-pdid="${p.id}">Übernehmen</button>`;box.appendChild(d)});box.querySelectorAll("[data-pdid]").forEach(btn=>btn.addEventListener("click",async()=>{try{const d=await call("/pipedrive/persons/"+btn.dataset.pdid);fillPerson(d.person);status("pdStatus","Kundendaten übernommen.",true);document.querySelector('[data-page="besichtigung"]').click()}catch(e){status("pdStatus",e.message,false)}}))}
function fillPerson(p){$("pipedriveId").value=p.id||"";$("firstName").value=p.firstName||"";$("lastName").value=p.lastName||p.name||"";$("email").value=p.email||"";$("phone").value=p.phone||"";$("street").value=p.street||"";$("zip").value=p.zip||"";$("city").value=p.city||"";$("objectAddress").value=p.objectAddress||"";recalculate()}

$("lexTest").addEventListener("click",async()=>{try{await call("/profile");status("lexStatus","Lexware-Verbindung erfolgreich.",true)}catch(e){status("lexStatus",e.message,false)}});
$("lexSend").addEventListener("click",async()=>{if(!$("lastName").value.trim())return status("lexStatus","Nachname fehlt.",false);try{await call("/contacts",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({salutation:$("salutation").value,firstName:$("firstName").value,lastName:$("lastName").value,street:$("street").value,zip:$("zip").value,city:$("city").value,email:$("email").value,phone:$("phone").value,note:"Pipedrive-ID: "+$("pipedriveId").value})});status("lexStatus","Kunde wurde an Lexware übertragen.",true)}catch(e){status("lexStatus",e.message,false)}});

function clearCustomer(){["salutation","firstName","lastName","phone","email","company","street","zip","city","objectAddress","pipedriveId"].forEach(id=>$(id).value="");recalculate()}
function saveAll(){localStorage.setItem("v5_measurements",JSON.stringify(measurements));localStorage.setItem("v5_measures",JSON.stringify(measures));localStorage.setItem("v5_extras",JSON.stringify(extras));try{localStorage.setItem("v5_photos",JSON.stringify(photos))}catch(e){}}

$("workerUrl").value=localStorage.getItem("v5_worker")||$("workerUrl").value;$("appSecret").value=localStorage.getItem("v5_secret")||"";
renderMeasurements();renderMeasures();renderExtras();renderPhotos();calcDewPoint();recalculate();
})();
