const JSPDF_URL="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
let loader=null;
function loadScript(url){return new Promise((resolve,reject)=>{if(window.jspdf){resolve();return;}const old=document.querySelector(`script[src="${url}"]`);if(old){old.addEventListener("load",resolve,{once:true});return;}const s=document.createElement("script");s.src=url;s.async=true;s.onload=resolve;s.onerror=()=>reject(new Error("PDF-Modul konnte nicht geladen werden."));document.head.appendChild(s);});}
async function jsPDF(){if(!window.jspdf){loader ||= loadScript(JSPDF_URL);await loader;}return window.jspdf.jsPDF;}
function safeName(value){return String(value||"Kunde").replace(/[^a-zA-Z0-9ÄÖÜäöüß_-]+/g,"_").replace(/^_+|_+$/g,"");}
function textBlock(doc,text,x,y,width,lineHeight=5){const lines=doc.splitTextToSize(String(text||"–"),width);for(const line of lines){if(y>282){doc.addPage();y=18;}doc.text(line,x,y);y+=lineHeight;}return y;}
function heading(doc,text,y){if(y>270){doc.addPage();y=18;}doc.setFont("helvetica","bold");doc.setFontSize(13);doc.text(text,15,y);doc.setFont("helvetica","normal");doc.setFontSize(9);return y+7;}

async function imageToDataUrl(url) {
  try {
    const response = await fetch(url);
    if (!response.ok) return "";
    const blob = await response.blob();
    return await new Promise(resolve => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => resolve("");
      reader.readAsDataURL(blob);
    });
  } catch {
    return "";
  }
}

function deNumber(value, maxDigits = 2) {
  return Number(value || 0).toLocaleString("de-DE", {
    minimumFractionDigits: 0,
    maximumFractionDigits: maxDigits
  });
}

function uniqueSortedNumbers(values) {
  return [...new Set(values.map(Number).filter(value => Number.isFinite(value) && value > 0))]
    .sort((a, b) => a - b);
}

function taskQuantity(task) {
  const value = Number(task.actualQuantity || task.plannedQuantity || 0);
  if (value > 0) return value;
  const match = String(task.scope || "").replace(",", ".").match(/[\d.]+/);
  return match ? Number(match[0]) || 0 : 0;
}

function worksiteSummary(worksite) {
  const tasks = worksite.tasks || [];
  const horizontal = tasks.filter(task => task.type === "Horizontalsperre");
  const vertical = tasks.filter(task => task.type === "Vertikalsperre");
  const surface = tasks.filter(task => task.type === "Flächensperre");
  const pressure = tasks.filter(task =>
    ["Druckwassersperre", "Druckwasserstabile Innenabdichtung", "Wand-Sohlen-Anschluss"].includes(task.type)
  );
  const resin = tasks.filter(task => task.type === "Harzverpressung" || task.resinApplied);

  const hzTasks = [...horizontal, ...vertical, ...surface];
  const wallTasks = [...horizontal, ...vertical, ...surface, ...pressure];

  return {
    horizontalMeters: horizontal.reduce((sum, task) => sum + taskQuantity(task), 0),
    verticalMeters: vertical.reduce((sum, task) => sum + taskQuantity(task), 0),
    surfaceSquareMeters: surface.reduce((sum, task) => sum + taskQuantity(task), 0),
    pressureMeters: pressure.reduce((sum, task) => sum + taskQuantity(task), 0),
    resinScope: resin.reduce((sum, task) => sum + taskQuantity(task), 0),
    capillaryMaterials: [...new Set(hzTasks.map(task => task.wallMaterial || task.material || "").filter(Boolean))].join(", "),
    pressureMaterials: [...new Set(pressure.map(task => task.wallMaterial || task.material || "").filter(Boolean))].join(", "),
    capillaryWalls: uniqueSortedNumbers(hzTasks.map(task => task.wall)),
    pressureWalls: uniqueSortedNumbers(pressure.map(task => task.wall)),
    allWalls: uniqueSortedNumbers(wallTasks.map(task => task.wall)),
    hzLiters: hzTasks.reduce((sum, task) => sum + Number(task.actualLiters || 0), 0),
    hzCharges: [...new Set(hzTasks.map(task => String(task.chargeHz || "").trim()).filter(Boolean))],
    pressureless: hzTasks.some(task => Boolean(task.injectionPressureless)),
    lowPressure: hzTasks.some(task => Boolean(task.injectionLowPressure)),
    spacings: uniqueSortedNumbers(hzTasks.map(task => Number(task.spacing || 0) * 100)),
    sefKg: resin.reduce((sum, task) => sum + Number(task.resinKg || 0), 0),
    hsKg: pressure.reduce((sum, task) => sum + Number(task.actualHsKg || 0), 0),
    horizontalHoles: horizontal.reduce((sum, task) => sum + Number(task.actualHoles || 0), 0),
    surfaceHoles: surface.reduce((sum, task) => sum + Number(task.actualHoles || 0), 0),
    pressureHoles: pressure.reduce((sum, task) => sum + Number(task.actualHoles || 0), 0),
    packers: resin.reduce((sum, task) => sum + Number(task.packers || 0), 0),
    openBottles: tasks.reduce(
      (sum, task) => sum + Math.max(0, Number(task.bottlesHanging || 0) - Number(task.bottlesRetrieved || 0)),
      0
    ),
    otherMaterials: [...new Set(
      tasks
        .filter(task => !["Horizontalsperre","Vertikalsperre","Flächensperre","Harzverpressung","Wand-Sohlen-Anschluss","Druckwassersperre","Druckwasserstabile Innenabdichtung"].includes(task.type))
        .map(task => task.type || task.areaName)
        .filter(Boolean)
    )].join(", ")
  };
}

function drawBox(doc, x, y, w, h, fill = null, stroke = [64, 64, 64]) {
  if (fill) {
    doc.setFillColor(...fill);
    doc.rect(x, y, w, h, "F");
  }
  doc.setDrawColor(...stroke);
  doc.setLineWidth(0.25);
  doc.rect(x, y, w, h);
}

function drawText(doc, text, x, y, options = {}) {
  const {
    size = 7.2,
    bold = false,
    color = [25, 25, 25],
    align = "left",
    maxWidth = 0
  } = options;
  doc.setFont("helvetica", bold ? "bold" : "normal");
  doc.setFontSize(size);
  doc.setTextColor(...color);
  const value = String(text ?? "");
  if (maxWidth) {
    const lines = doc.splitTextToSize(value, maxWidth);
    doc.text(lines, x, y, { align });
  } else {
    doc.text(value, x, y, { align });
  }
}

function labelValue(doc, x, y, w, label, value) {
  drawText(doc, label, x + 1.5, y + 3.8, { size: 6.2, bold: true });
  drawText(doc, value || "", x + w * 0.42, y + 3.8, { size: 6.6, maxWidth: w * 0.55 - 2 });
}

function checkMark(doc, x, y, checked, label) {
  drawBox(doc, x, y - 2.6, 3.2, 3.2);
  if (checked) {
    drawText(doc, "X", x + 1.6, y, { size: 7, bold: true, align: "center" });
  }
  drawText(doc, label, x + 4.5, y, { size: 6.4 });
}

function formatWalls(values) {
  return values.length ? values.map(value => `${deNumber(value, 1)} cm`).join(", ") : "";
}

function fitLines(doc, text, width, maxLines) {
  const lines = doc.splitTextToSize(String(text || ""), width);
  if (lines.length <= maxLines) return lines;
  const clipped = lines.slice(0, maxLines);
  clipped[maxLines - 1] = `${String(clipped[maxLines - 1]).replace(/\.*$/, "")}…`;
  return clipped;
}

export async function createWorksitePdf(worksite) {
  const C = await jsPDF();
  const doc = new C({ unit: "mm", format: "a4", orientation: "portrait" });
  const s = worksiteSummary(worksite);
  const customer = worksite.customer || {};
  const customerName =
    [customer.salutation, customer.firstName, customer.lastName].filter(Boolean).join(" ") ||
    customer.company ||
    "Kunde";
  const customerAddress = [customer.street, [customer.zip, customer.city].filter(Boolean).join(" ")]
    .filter(Boolean)
    .join(", ");
  const objectAddress = worksite.objectAddress || customer.objectAddress || customerAddress;
  const offerNumber =
    worksite.lexwareVoucherNumber ||
    worksite.offerNumber ||
    worksite.visitNumber ||
    "";
  const yearBuilt = worksite.yearBuilt || worksite.building?.yearBuilt || "";
  const areas = [...new Set((worksite.tasks || []).map(task => String(task.workArea || "").trim()).filter(Boolean))].join(", ");
  const hasInterior = (worksite.tasks || []).some(task => task.isInteriorWall);
  const hasExterior = (worksite.tasks || []).some(task => task.isExteriorWall);
  const components = [hasInterior ? "Innenwand" : "", hasExterior ? "Außenwand" : ""].filter(Boolean).join(" + ");
  const measures = [...new Set((worksite.tasks || []).map(task => task.type).filter(Boolean))].join(", ");

  const green = [95, 165, 59];
  const lightGreen = [225, 240, 216];
  const dark = [45, 45, 45];
  const lightGray = [242, 242, 242];

  const logo = await imageToDataUrl("./assets/mainabdichter-header-logo.png");
  if (logo) {
    try {
      doc.addImage(logo, "PNG", 13, 8, 58, 17, undefined, "FAST");
    } catch {}
  } else {
    drawText(doc, "mainabdichter", 14, 18, { size: 18, bold: true, color: green });
    drawText(doc, "Nachhaltig. Sicher. Trocken.", 14, 23, { size: 6.5, color: dark });
  }

  drawText(doc, "Arbeitsnachweis", 196, 12, { size: 13, bold: true, align: "right", color: dark });
  drawText(doc, "Bauwerksabdichtung im Bestand", 196, 17, { size: 6.5, align: "right", color: green });

  // Customer / object address
  drawBox(doc, 13, 29, 88, 24);
  drawBox(doc, 101, 29, 96, 24);
  drawText(doc, "Kunde:", 15, 33, { size: 6.3, bold: true });
  drawText(doc, customerName, 15, 38, { size: 7.2, bold: true, maxWidth: 82 });
  drawText(doc, customerAddress, 15, 43, { size: 6.7, maxWidth: 82 });
  drawText(doc, "Arbeitsnachweis für Objekt:", 103, 33, { size: 6.3, bold: true });
  drawText(doc, objectAddress, 103, 38, { size: 7.1, bold: true, maxWidth: 90 });

  // Master data
  let y = 55;
  const rowH = 7;
  [[
    ["Baujahr:", yearBuilt],
    ["Bereich:", areas],
  ],[
    ["AG-/AB Nr.:", offerNumber],
    ["Bauteil:", components],
  ],[
    ["Ausführungszeitraum:", worksite.date || ""],
    ["Gewerk:", measures],
  ]].forEach(row => {
    drawBox(doc, 13, y, 92, rowH);
    drawBox(doc, 105, y, 92, rowH);
    labelValue(doc, 13, y, 92, row[0][0], row[0][1]);
    labelValue(doc, 105, y, 92, row[1][0], row[1][1]);
    y += rowH;
  });

  // Capillary table
  drawBox(doc, 13, y, 184, 7, green);
  drawText(doc, "Kapillarsperren", 15, y + 4.6, { size: 7.4, bold: true });
  drawText(doc, "Menge", 82, y + 4.6, { size: 6.7, bold: true });
  drawText(doc, "Wandmaterial", 112, y + 4.6, { size: 6.7, bold: true });
  drawText(doc, "Wandstärke in cm", 181, y + 4.6, { size: 6.7, bold: true, align: "right" });
  y += 7;

  const capRows = [
    ["Horizontalsperre (lfm)", s.horizontalMeters ? deNumber(s.horizontalMeters) : "", s.capillaryMaterials, formatWalls(s.capillaryWalls)],
    ["Vertikalsperre (m)", s.verticalMeters ? deNumber(s.verticalMeters) : "", s.capillaryMaterials, formatWalls(s.capillaryWalls)],
    ["Flächensperren (m²)", s.surfaceSquareMeters ? deNumber(s.surfaceSquareMeters) : "", s.capillaryMaterials, formatWalls(s.capillaryWalls)]
  ];
  capRows.forEach(row => {
    drawBox(doc, 13, y, 184, 6.5);
    drawText(doc, row[0], 15, y + 4.2, { size: 6.7 });
    drawText(doc, row[1], 84, y + 4.2, { size: 6.7 });
    drawText(doc, row[2], 112, y + 4.2, { size: 6.5, maxWidth: 42 });
    drawText(doc, row[3], 195, y + 4.2, { size: 6.5, align: "right", maxWidth: 37 });
    y += 6.5;
  });

  // HZ details
  drawBox(doc, 13, y, 184, 7, lightGreen);
  drawText(doc, "BKM HZ-250 PRO", 15, y + 4.5, { size: 7, bold: true });
  drawText(doc, `Charge: ${s.hzCharges.join(", ")}`, 70, y + 4.5, { size: 6.5, bold: true, maxWidth: 65 });
  drawText(doc, `Verbrauch: ${s.hzLiters ? `${deNumber(s.hzLiters)} Liter` : ""}`, 195, y + 4.5, { size: 6.5, bold: true, align: "right" });
  y += 7;

  drawBox(doc, 13, y, 184, 7);
  drawText(doc, "Art der Injektion:", 15, y + 4.4, { size: 6.4, bold: true });
  checkMark(doc, 49, y + 4.1, s.pressureless, "drucklose Injektion");
  checkMark(doc, 91, y + 4.1, s.lowPressure, "Niederdruck");
  drawText(doc, "Bohrlochabstand:", 135, y + 4.4, { size: 6.4, bold: true });
  checkMark(doc, 164, y + 4.1, s.spacings.includes(12.5), "12,5 cm");
  checkMark(doc, 181, y + 4.1, s.spacings.includes(25), "25 cm");
  y += 7;

  // Pressure table
  drawBox(doc, 13, y, 184, 7, green);
  drawText(doc, "Druckwassersperren", 15, y + 4.6, { size: 7.4, bold: true });
  drawText(doc, "Menge", 82, y + 4.6, { size: 6.7, bold: true });
  drawText(doc, "Wandmaterial", 112, y + 4.6, { size: 6.7, bold: true });
  drawText(doc, "Wandstärke cm", 181, y + 4.6, { size: 6.7, bold: true, align: "right" });
  y += 7;

  [
    ["Druckwassersperre (lfm)", s.pressureMeters ? deNumber(s.pressureMeters) : "", s.pressureMaterials, formatWalls(s.pressureWalls)],
    ["Harzverpressung (lfm/Stk.)", s.resinScope ? deNumber(s.resinScope) : "", "", ""]
  ].forEach(row => {
    drawBox(doc, 13, y, 184, 6.5);
    drawText(doc, row[0], 15, y + 4.2, { size: 6.7 });
    drawText(doc, row[1], 84, y + 4.2, { size: 6.7 });
    drawText(doc, row[2], 112, y + 4.2, { size: 6.5, maxWidth: 42 });
    drawText(doc, row[3], 195, y + 4.2, { size: 6.5, align: "right", maxWidth: 37 });
    y += 6.5;
  });

  drawBox(doc, 13, y, 92, 7, lightGreen);
  drawBox(doc, 105, y, 92, 7, lightGreen);
  drawText(doc, `Menge BKM SEF-2K in kg: ${s.sefKg ? deNumber(s.sefKg) : ""}`, 15, y + 4.5, { size: 6.5, bold: true });
  drawText(doc, `Menge BKM HS in kg: ${s.hsKg ? deNumber(s.hsKg) : ""}`, 107, y + 4.5, { size: 6.5, bold: true });
  y += 7;

  drawBox(doc, 13, y, 184, 8);
  drawText(doc, "sonst. eingesetztes Material:", 15, y + 4.8, { size: 6.4, bold: true });
  drawText(doc, s.otherMaterials, 58, y + 4.8, { size: 6.4, maxWidth: 136 });
  y += 8;

  // Hours and holes
  drawBox(doc, 13, y, 184, 7, dark);
  ["Handwerker","Arbeitsstunden","BL Horizontal","BL Fläche","BL Druckwasser","Harz/Packer"].forEach((label, index) => {
    const xs = [15, 54, 88, 119, 150, 177];
    drawText(doc, label, xs[index], y + 4.5, { size: 6.2, bold: true, color: [255,255,255] });
  });
  y += 7;
  drawBox(doc, 13, y, 184, 7);
  drawText(doc, worksite.employees || "", 15, y + 4.5, { size: 6.4, maxWidth: 35 });
  const duration = (() => {
    if (!worksite.startTime || !worksite.endTime) return "";
    const [sh, sm] = worksite.startTime.split(":").map(Number);
    const [eh, em] = worksite.endTime.split(":").map(Number);
    let mins = eh * 60 + em - sh * 60 - sm - Number(worksite.pauseMinutes || 0);
    if (mins < 0) mins += 1440;
    return deNumber(mins / 60, 2);
  })();
  drawText(doc, duration, 58, y + 4.5, { size: 6.4 });
  drawText(doc, deNumber(s.horizontalHoles, 0), 94, y + 4.5, { size: 6.4 });
  drawText(doc, deNumber(s.surfaceHoles, 0), 125, y + 4.5, { size: 6.4 });
  drawText(doc, deNumber(s.pressureHoles, 0), 156, y + 4.5, { size: 6.4 });
  drawText(doc, deNumber(s.packers, 0), 184, y + 4.5, { size: 6.4 });
  y += 7;

  drawBox(doc, 13, y, 92, 7);
  drawBox(doc, 105, y, 92, 7);
  drawText(doc, `Arbeitsbeginn: ${worksite.startTime || ""}`, 15, y + 4.5, { size: 6.4, bold: true });
  drawText(doc, `Arbeitsende: ${worksite.endTime || ""}`, 107, y + 4.5, { size: 6.4, bold: true });
  y += 7;

  // Notes
  const bottleNotice = s.openBottles > 0
    ? `Es verbleiben ${deNumber(s.openBottles, 0)} Injektionsflaschen bis zur endgültigen Leerung in der Wand. Die ausgeführten Abdichtungsarbeiten sind hiervon unabhängig fertiggestellt und abrechenbar.`
    : "";
  const executedMeasures = [...new Set((worksite.tasks || []).filter(task => task.completed).map(task => task.type).filter(Boolean))];
  const workLine = executedMeasures.length ? `Ausgeführte Arbeiten: ${executedMeasures.join(", ")}` : "";
  const notes = [workLine, worksite.generalNotes, bottleNotice].filter(Boolean).join("\n");
  drawBox(doc, 13, y, 184, 26);
  drawText(doc, "Absprachen bzw. Besonderheiten bei Arbeitsausführung:", 15, y + 4.5, { size: 6.4, bold: true });
  const noteLines = fitLines(doc, notes || "", 178, 4);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.2);
  doc.text(noteLines, 15, y + 9);
  y += 27;

  // Signatures
  const sigTop = y;
  const sigW = 58;
  const sigH = 19;
  const cols = [13, 75, 137];
  drawBox(doc, cols[0], sigTop, sigW, sigH);
  drawBox(doc, cols[1], sigTop, sigW, sigH);
  drawBox(doc, cols[2], sigTop, 60, sigH);

  drawText(doc, `${worksite.signaturePlace || customer.city || ""}, ${worksite.signatureDate || worksite.date || ""}`, cols[0] + 2, sigTop + 7, { size: 6.5 });
  drawText(doc, "Ort, Datum", cols[0] + 2, sigTop + 17, { size: 5.8, color: [90,90,90] });

  checkMark(doc, cols[1] + 3, sigTop + 8, Boolean(worksite.siteClean), "Baustelle sauber verlassen");
  drawText(doc, "Bestätigung", cols[1] + 2, sigTop + 17, { size: 5.8, color: [90,90,90] });

  if (worksite.customerSignatureData) {
    try {
      doc.addImage(worksite.customerSignatureData, "PNG", cols[2] + 2, sigTop + 1, 56, 12, undefined, "FAST");
    } catch {}
  }
  drawText(doc, worksite.customerSignature || "", cols[2] + 2, sigTop + 14.5, { size: 5.8 });
  drawText(doc, "Unterschrift Kunde oder Vertreter", cols[2] + 2, sigTop + 17, { size: 5.6, color: [90,90,90] });
  y += 21;

  // Employee signature, compact
  if (worksite.workerSignatureData || worksite.workerSignature) {
    drawBox(doc, 137, y, 60, 15);
    if (worksite.workerSignatureData) {
      try {
        doc.addImage(worksite.workerSignatureData, "PNG", 139, y + 1, 56, 9, undefined, "FAST");
      } catch {}
    }
    drawText(doc, worksite.workerSignature || "", 139, y + 11.5, { size: 5.6 });
    drawText(doc, "Unterschrift ausführender Mitarbeiter", 139, y + 14, { size: 5.4, color: [90,90,90] });
  }

  // Footer
  const footerY = 278;
  doc.setDrawColor(...green);
  doc.setLineWidth(0.6);
  doc.line(13, footerY - 3, 197, footerY - 3);
  drawText(doc, "mainabdichter - Mike Sprager | Zum Tannengarten 10 | 35794 Mengerskirchen | Tel.: +49 (0) 6476 736 939-0", 13, footerY, { size: 5.4, bold: true });
  drawText(doc, "info@mainabdichter.de | www.mainabdichter.de | USt-IdNr.: DE228953591 | Steuernummer: 03887060428", 13, footerY + 3.5, { size: 5.2 });
  drawText(doc, "Die Notwendigkeit einer Harzverpressung wird nach einer angemessenen Standzeit geprüft.", 13, footerY + 7, { size: 5.2, color: green, bold: true });

  const name = safeName(
    [customer.firstName, customer.lastName].filter(Boolean).join("_") ||
    customer.company
  );
  const filename = `${worksite.date || new Date().toISOString().slice(0,10)}_Arbeitsnachweis_${name}.pdf`;
  return { blob: doc.output("blob"), filename };
}

export async function createVisitPdf(visit){const C=await jsPDF();const doc=new C({unit:"mm",format:"a4"});let y=18;doc.setFontSize(17);doc.setFont("helvetica","bold");doc.text("Besichtigungs- und Messprotokoll",15,y);y+=9;doc.setFontSize(9);doc.setFont("helvetica","normal");const name=[visit.customer?.salutation,visit.customer?.firstName,visit.customer?.lastName].filter(Boolean).join(" ")||visit.customer?.company||"Kunde";y=textBlock(doc,`${name}\n${visit.customer?.objectAddress||[visit.customer?.street,visit.customer?.zip,visit.customer?.city].filter(Boolean).join(", ")}\nBesichtigung: ${visit.visitDate||""} ${visit.visitStartTime||""}`,15,y,180,5);y+=4;y=heading(doc,"Schadensbild",y);y=textBlock(doc,[(visit.damageTags||[]).join(", "),visit.damageDescription].filter(Boolean).join(". ")||"–",15,y,180,5);y+=3;y=heading(doc,"Empfehlung",y);y=textBlock(doc,visit.customerRecommendation||"–",15,y,180,5);for(const area of visit.areas||[]){y+=3;y=heading(doc,area.name||"Schadensbereich",y);const ms=(area.measurements||[]).map(m=>`${m.device}: ${m.value} ${m.unit} (${m.location||""})`).join("\n");const measures=(area.measures||[]).map(m=>m.type).join(", ");y=textBlock(doc,`Wandmaterial: ${area.wallMaterialOther||area.wallMaterial||"–"}\nWandstärke: ${area.wallThickness||"–"} cm\nReferenz trocken: ${area.dryReference||"–"}\nMessungen:\n${ms||"–"}\nMaßnahmen: ${measures||"–"}`,15,y,180,4.7);}const filename=`${visit.visitDate||new Date().toISOString().slice(0,10)}_Besichtigungsprotokoll_${safeName(name)}.pdf`;return {blob:doc.output("blob"),filename};}
export function downloadBlob(blob,filename){const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
