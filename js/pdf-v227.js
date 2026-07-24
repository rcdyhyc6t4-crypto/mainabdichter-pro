const JSPDF_URL="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
let loader=null;
function loadScript(url){return new Promise((resolve,reject)=>{if(window.jspdf){resolve();return;}const old=document.querySelector(`script[src="${url}"]`);if(old){old.addEventListener("load",resolve,{once:true});return;}const s=document.createElement("script");s.src=url;s.async=true;s.onload=resolve;s.onerror=()=>reject(new Error("PDF-Modul konnte nicht geladen werden."));document.head.appendChild(s);});}
async function jsPDF(){if(!window.jspdf){loader ||= loadScript(JSPDF_URL);await loader;}return window.jspdf.jsPDF;}
function safeName(value){return String(value||"Kunde").replace(/[^a-zA-Z0-9ÄÖÜäöüß_-]+/g,"_").replace(/^_+|_+$/g,"");}
function textBlock(doc,text,x,y,width,lineHeight=5){const lines=doc.splitTextToSize(String(text||"–"),width);for(const line of lines){if(y>282){doc.addPage();y=18;}doc.text(line,x,y);y+=lineHeight;}return y;}
function heading(doc,text,y){if(y>270){doc.addPage();y=18;}doc.setFont("helvetica","bold");doc.setFontSize(13);doc.text(text,15,y);doc.setFont("helvetica","normal");doc.setFontSize(9);return y+7;}
export async function createWorksitePdf(worksite){
  const C=await jsPDF();
  const doc=new C({unit:"mm",format:"a4"});
  let y=18;
  doc.setFontSize(18);doc.setFont("helvetica","bold");doc.text("Arbeitsnachweis",15,y);y+=8;
  doc.setFontSize(10);doc.setFont("helvetica","normal");
  y=textBlock(doc,`${[worksite.customer?.salutation,worksite.customer?.firstName,worksite.customer?.lastName].filter(Boolean).join(" ")||worksite.customer?.company||"Kunde"}
${worksite.objectAddress||""}`,15,y,180,5);
  y+=3;y=heading(doc,"Ausführung",y);
  const rows=[["Datum",worksite.date],["Mitarbeiter",worksite.employees],["Arbeitsbeginn",worksite.startTime],["Arbeitsende",worksite.endTime],["Pause",`${worksite.pauseMinutes||0} Minuten`],["Wetter",`${worksite.weather||""} ${worksite.outdoorTemp?worksite.outdoorTemp+" °C":""}`]];
  for(const [label,value] of rows){doc.setFont("helvetica","bold");doc.text(`${label}:`,15,y);doc.setFont("helvetica","normal");doc.text(String(value||"–"),55,y);y+=5;}

  for(const task of worksite.tasks||[]){
    y+=3;y=heading(doc,`${task.areaName} – ${task.type}`,y);
    const lines=[`Geplanter Umfang laut Angebot: ${task.scope||"–"}`];
    if(["Horizontalsperre","Flächensperre","Wand-Sohlen-Anschluss"].includes(task.type)){
      lines.push(`Wandstärke laut Angebot / tatsächlich: ${task.originalWall||task.wall||0} / ${task.wall||0} cm`);
    }
    if(["Horizontalsperre","Flächensperre"].includes(task.type)){
      lines.push(`Bohrlochabstand: ${task.spacing||0} m`);
      lines.push(`Bohrlöcher Soll/Ist: ${task.plannedHoles||0} / ${task.actualHoles||0}`);
      lines.push(`Injektionsmenge je Bohrloch: ${Number(task.targetLitersPerHole||0).toLocaleString("de-DE",{minimumFractionDigits:3,maximumFractionDigits:3})} l`);
      lines.push(`BKM HZ 250 Pro Soll/Ist: ${task.plannedLiters||0} / ${task.actualLiters||0} l`);
      if(task.chargeHz) lines.push(`Charge BKM HZ 250 Pro: ${task.chargeHz}`);
      if(task.injectionType) lines.push(`Injektionsart: ${task.injectionType}`);
    }
    if(task.type==="Wand-Sohlen-Anschluss"){
      lines.push(`BKM HS Sperrmörtel Soll/Ist: ${task.plannedHsKg||0} / ${task.actualHsKg||0} kg`);
      if(task.chargeHs) lines.push(`Charge BKM HS Sperrmörtel: ${task.chargeHs}`);
    }
    if(task.type==="Harzverpressung" || task.resinApplied){
      lines.push(`Packer: ${task.packers||0}`);
      lines.push(`Harz / SEF-2K: ${task.resinKg||0} kg`);
      if(task.chargeResin) lines.push(`Charge Harz / SEF-2K: ${task.chargeResin}`);
    }
    if(Number(task.bottlesHanging||0)>0){
      lines.push(`Injektionsflaschen noch in der Wand: ${Math.max(0,Number(task.bottlesHanging||0)-Number(task.bottlesRetrieved||0))} Stück`);
      lines.push(`Geplante Abholung: ${task.bottlesPickupDue||"noch offen"}`);
    }
    lines.push(`Vollständig ausgeführt: ${task.completed?"Ja":"Nein"}`);
    lines.push(`Tatsächliche Ausführung/Besonderheiten: ${task.note||"–"}`);
    y=textBlock(doc,lines.join("\n"),15,y,180,4.7);
  }

  const totals=(worksite.tasks||[]).reduce((t,task)=>{
    if(["Horizontalsperre","Flächensperre"].includes(task.type))t.hz+=Number(task.actualLiters||0);
    if(task.type==="Wand-Sohlen-Anschluss")t.hs+=Number(task.actualHsKg||0);
    if(task.type==="Harzverpressung"||task.resinApplied){t.resin+=Number(task.resinKg||0);t.packers+=Number(task.packers||0);}
    return t;
  },{hz:0,hs:0,resin:0,packers:0});
  if(totals.hz||totals.hs||totals.resin||totals.packers){
    y+=4;y=heading(doc,"Tatsächlich verwendetes Material",y);
    const materialLines=[];
    if(totals.hz)materialLines.push(`BKM HZ 250 Pro: ${totals.hz.toLocaleString("de-DE")} Liter`);
    if(totals.hs)materialLines.push(`BKM HS Sperrmörtel: ${totals.hs.toLocaleString("de-DE")} kg`);
    if(totals.resin)materialLines.push(`Harz / SEF-2K: ${totals.resin.toLocaleString("de-DE")} kg`);
    if(totals.packers)materialLines.push(`Packer für Harzverpressung: ${totals.packers.toLocaleString("de-DE")} Stück`);
    y=textBlock(doc,materialLines.join("\n"),15,y,180,5);
  }

  const openBottles=(worksite.tasks||[]).reduce((sum,task)=>sum+Math.max(0,Number(task.bottlesHanging||0)-Number(task.bottlesRetrieved||0)),0);
  if(openBottles>0){
    y+=4;y=heading(doc,"Hinweis zu den Injektionsflaschen",y);
    y=textBlock(doc,`Insgesamt verbleiben ${openBottles} Injektionsflaschen bis zur endgültigen Leerung in der Wand und werden zu einem späteren Zeitpunkt abgeholt. Die ausgeführten Abdichtungsarbeiten sind hiervon unabhängig fertiggestellt und abrechenbar.`,15,y,180,5);
  }

  y+=4;y=heading(doc,"Allgemeine Bemerkungen",y);y=textBlock(doc,worksite.generalNotes||"–",15,y,180,5);
  y+=5;doc.text(`Kunde/Bestätigung: ${worksite.customerSignature||"–"}`,15,y);y+=6;doc.text(`Ausführender: ${worksite.workerSignature||"–"}`,15,y);
  const name=safeName([worksite.customer?.firstName,worksite.customer?.lastName].filter(Boolean).join("_")||worksite.customer?.company);
  const filename=`${worksite.date||new Date().toISOString().slice(0,10)}_Arbeitsnachweis_${name}.pdf`;
  return {blob:doc.output("blob"),filename};
}
export async function createVisitPdf(visit){const C=await jsPDF();const doc=new C({unit:"mm",format:"a4"});let y=18;doc.setFontSize(17);doc.setFont("helvetica","bold");doc.text("Besichtigungs- und Messprotokoll",15,y);y+=9;doc.setFontSize(9);doc.setFont("helvetica","normal");const name=[visit.customer?.salutation,visit.customer?.firstName,visit.customer?.lastName].filter(Boolean).join(" ")||visit.customer?.company||"Kunde";y=textBlock(doc,`${name}\n${visit.customer?.objectAddress||[visit.customer?.street,visit.customer?.zip,visit.customer?.city].filter(Boolean).join(", ")}\nBesichtigung: ${visit.visitDate||""} ${visit.visitStartTime||""}`,15,y,180,5);y+=4;y=heading(doc,"Schadensbild",y);y=textBlock(doc,[(visit.damageTags||[]).join(", "),visit.damageDescription].filter(Boolean).join(". ")||"–",15,y,180,5);y+=3;y=heading(doc,"Empfehlung",y);y=textBlock(doc,visit.customerRecommendation||"–",15,y,180,5);for(const area of visit.areas||[]){y+=3;y=heading(doc,area.name||"Schadensbereich",y);const ms=(area.measurements||[]).map(m=>`${m.device}: ${m.value} ${m.unit} (${m.location||""})`).join("\n");const measures=(area.measures||[]).map(m=>m.type).join(", ");y=textBlock(doc,`Wandmaterial: ${area.wallMaterialOther||area.wallMaterial||"–"}\nWandstärke: ${area.wallThickness||"–"} cm\nReferenz trocken: ${area.dryReference||"–"}\nMessungen:\n${ms||"–"}\nMaßnahmen: ${measures||"–"}`,15,y,180,4.7);}const filename=`${visit.visitDate||new Date().toISOString().slice(0,10)}_Besichtigungsprotokoll_${safeName(name)}.pdf`;return {blob:doc.output("blob"),filename};}
export function downloadBlob(blob,filename){const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
