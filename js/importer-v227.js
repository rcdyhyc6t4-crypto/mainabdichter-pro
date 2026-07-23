const TESSERACT_URL = "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js";
let tesseractPromise = null;

function loadScript(url) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${url}"]`);
    if (existing) {
      if (window.Tesseract) resolve();
      else existing.addEventListener("load", resolve, { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = url;
    script.async = true;
    script.onload = resolve;
    script.onerror = () => reject(new Error("Texterkennung konnte nicht geladen werden."));
    document.head.appendChild(script);
  });
}

async function ensureTesseract() {
  if (window.Tesseract) return window.Tesseract;
  if (!tesseractPromise) {
    tesseractPromise = loadScript(TESSERACT_URL).then(() => {
      if (!window.Tesseract) throw new Error("Texterkennung ist nicht verfügbar.");
      return window.Tesseract;
    });
  }
  return tesseractPromise;
}

export async function compressImage(file, maxWidth = 1400) {
  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Bild konnte nicht gelesen werden."));
    reader.readAsDataURL(file);
  });

  const image = await new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Bild konnte nicht geöffnet werden."));
    img.src = dataUrl;
  });

  const scale = Math.min(1, maxWidth / image.width);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(image.width * scale);
  canvas.height = Math.round(image.height * scale);
  canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.72);
}

export async function recognizeScreenshot(image, onProgress = () => {}) {
  const Tesseract = await ensureTesseract();
  const worker = await Tesseract.createWorker("deu+eng", 1, {
    logger(message) {
      if (message.status === "recognizing text") {
        onProgress(Math.round(Number(message.progress || 0) * 100));
      }
    }
  });

  try {
    const result = await worker.recognize(image);
    return String(result.data?.text || "").trim();
  } finally {
    await worker.terminate();
  }
}

function cleanLine(value) {
  return String(value || "").replace(/[|]/g, "I").replace(/\s+/g, " ").trim();
}

function valueAfterLabel(text, labels) {
  const escaped = labels.map(label => label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const regex = new RegExp(`(?:^|\\n)\\s*(?:${escaped.join("|")})\\s*:\\s*([^\\n]+)`, "i");
  return cleanLine(text.match(regex)?.[1] || "");
}

function parseFullName(fullName) {
  const cleaned = cleanLine(fullName).replace(/^(Herr|Frau|Firma)\s+/i, "");
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (!parts.length) return { firstName: "", lastName: "" };
  if (parts.length === 1) return { firstName: "", lastName: parts[0] };
  return { firstName: parts.slice(0, -1).join(" "), lastName: parts.at(-1) };
}

function normalizePhone(phone) {
  return cleanLine(phone).replace(/[^\d+()/ -]/g, "").replace(/\s+/g, " ").trim();
}

function extractMessageBlock(text) {
  const match = text.match(/(?:^|\n)\s*Nachricht\s*:\s*([\s\S]*?)(?=\n\s*(?:Bilder|--|Nachricht über)\s*:?\s*|\s*$)/i);
  return match ? match[1].trim() : "";
}

function sourceFromText(text) {
  if (/whatsapp|ankunft|gestern|antwortoptionen/i.test(text)) return "WhatsApp";
  if (/Name\s*:|Postleitzahl\s*:|Ich bin\s*:/i.test(text)) return "Kontaktformular-E-Mail";
  return "Screenshot";
}

function extractAppointment(text) {
  return text.split(/\n/).map(cleanLine).filter(Boolean).filter(line =>
    /\b(morgen|übermorgen|heute|uhr|zwischen|vormittag|nachmittag|ankunft|termin)\b/i.test(line)
  ).slice(0, 6).join("\n");
}

export function parseInquiryText(rawText) {
  const text = String(rawText || "").replace(/\r/g, "").replace(/[“”„]/g, '"');
  const email = valueAfterLabel(text, ["E-Mail", "Email", "E Mail"]) ||
    cleanLine(text.match(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i)?.[0] || "");

  let phone = valueAfterLabel(text, ["Telefon", "Tel", "Mobil", "Handy"]);
  if (!phone) {
    const candidates = text.match(/(?:\+49|0049|0)\s*(?:\(?\d{2,5}\)?[\s/-]*)\d(?:[\d\s/-]{5,}\d)/g) || [];
    phone = candidates.map(normalizePhone).sort((a, b) => b.length - a.length)[0] || "";
  }

  let fullName = valueAfterLabel(text, ["Name", "Kunde"]);
  let street = valueAfterLabel(text, ["Adresse", "Straße", "Strasse"]);
  let zip = valueAfterLabel(text, ["Postleitzahl", "PLZ"]);
  let city = valueAfterLabel(text, ["Ort", "Stadt"]);

  const compact = text.match(/([A-ZÄÖÜ][A-Za-zÄÖÜäöüß.'-]+(?:\s+[A-ZÄÖÜ][A-Za-zÄÖÜäöüß.'-]+){1,3})\s*,\s*([^,\n]{2,80}?\s+\d+[a-zA-Z]?)\s*,\s*(\d{5})\s+([^,\n]{2,60})/m);
  if (compact) {
    fullName ||= cleanLine(compact[1]);
    street ||= cleanLine(compact[2]);
    zip ||= cleanLine(compact[3]);
    city ||= cleanLine(compact[4]).replace(/\s+[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}.*/i, "");
  }

  if (!street) {
    street = cleanLine(text.match(/\b[A-ZÄÖÜ][A-Za-zÄÖÜäöüß .'-]*(?:straße|strasse|str\.|weg|gasse|allee|platz|ring|damm|ufer|steig)\s+\d+[a-zA-Z]?\b/i)?.[0] || "");
  }

  if (!zip || !city) {
    const place = text.match(/\b(\d{5})\s+([A-ZÄÖÜ][A-Za-zÄÖÜäöüß .'-]{2,50})/);
    if (place) {
      zip ||= cleanLine(place[1]);
      city ||= cleanLine(place[2]).split(/[,;\n]/)[0];
    }
  }

  if (!fullName && street) {
    const index = text.toLowerCase().indexOf(street.toLowerCase());
    const before = text.slice(Math.max(0, index - 100), index);
    const candidates = before.split(/[\n,]/).map(cleanLine).filter(line =>
      /^[A-ZÄÖÜ][A-Za-zÄÖÜäöüß.'-]+(?:\s+[A-ZÄÖÜ][A-Za-zÄÖÜäöüß.'-]+){1,3}$/.test(line)
    );
    fullName = candidates.at(-1) || "";
  }

  const names = parseFullName(fullName);
  return {
    salutation: "",
    firstName: names.firstName,
    lastName: names.lastName,
    phone: normalizePhone(phone),
    email,
    street,
    zip: zip.replace(/\D/g, "").slice(0, 5),
    city: city.replace(/\s+/g, " ").trim(),
    ownerStatus: valueAfterLabel(text, ["Ich bin", "Status"]),
    appointment: extractAppointment(text),
    message: extractMessageBlock(text),
    source: sourceFromText(text),
    rawText: text.trim()
  };
}
