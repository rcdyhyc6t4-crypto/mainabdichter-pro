(function(){"use strict";
const $=id=>document.getElementById(id);
const eur=v=>new Intl.NumberFormat("de-DE",{style:"currency",currency:"EUR"}).format(v||0);
const num=v=>new Intl.NumberFormat("de-DE",{maximumFractionDigits:2}).format(v||0);
const esc=s=>String(s||"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
let data=null;
try{data=JSON.parse(localStorage.getItem("mainabdichter_customer_snapshot")||"null")}catch{}
if(!data){
  document.getElementById("customerDocument").innerHTML="<h1>Keine Angebotsdaten vorhanden</h1><p>Bitte die Kundenansicht erneut aus der mainabdichter-App öffnen.</p>";
  return;
}
$("cpCustomer").textContent=[data.customer.name,data.customer.company].filter(Boolean).join(" – ")||"–";
$("cpAddress").textContent=data.customer.address||"–";
$("cpRecommendation").textContent=data.recommendation||"–";
$("cpMeasures").innerHTML=data.measures.map(m=>`<div class="result"><strong>${esc(m.area)} – ${esc(m.title)}</strong>${m.description?`<div class="article-description">${esc(m.description)}</div>`:""}<div class="metric"><span>Umfang</span><strong>${esc(m.scope)}</strong></div></div>`).join("");
$("cpExtras").innerHTML=data.extras.map(e=>`<div class="result"><strong>${esc(e.title)}</strong>${e.description?`<div class="article-description">${esc(e.description)}</div>`:""}<div class="metric"><span>Menge</span><strong>${num(e.quantity)} ${esc(e.unitName)}</strong></div></div>`).join("");
if(data.specialAmount>0){
 $("cpNormalRow").classList.remove("hidden");$("cpSpecialRow").classList.remove("hidden");
 $("cpNormal").textContent=eur(data.normalGross);$("cpSpecialLabel").textContent=data.specialLabel;$("cpSpecial").textContent="− "+eur(data.specialAmount);
}
$("cpOffer").textContent=eur(data.offerGross);
if(data.skontoPct>0){
 $("cpSkontoRow").classList.remove("hidden");$("cpSkontoLabel").textContent=`${num(data.skontoPct)} % Skonto bei Zahlung innerhalb von 3 Werktagen`;$("cpSkonto").textContent=eur(data.skontoGross);
}
$("cpPhotos").innerHTML=data.photos.map(p=>`<div class="photo-card"><img src="${p.src}"><strong>${esc(p.area)}</strong>${p.caption?`<p>${esc(p.caption)}</p>`:""}</div>`).join("");
$("cpPrint").onclick=()=>window.print();
$("cpClose").onclick=()=>window.close();
})();