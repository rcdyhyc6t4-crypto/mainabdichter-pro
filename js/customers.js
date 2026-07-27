import { state, loadArchive, loadCustomers, saveCustomer, loadCommunicationNotes } from "./storage-v227.js";
import {
  hasConnectionConfig,
  searchPipedrive,
  loadPipedrivePersons,
  loadPipedrivePerson,
  loadPipedriveCustomerHistory,
  loadLexwareCustomerHistory,
  createPipedrivePerson,
  lookupGermanLocalities,
  lookupGermanStreets
} from "./api-v227.js?v=32.18.6";

const $ = id => document.getElementById(id);
let activeRecordCustomer = null;
const esc = value => String(value ?? "").replace(/[&<>"']/g, char => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
}[char]));

function clean(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

const addressAssistCache = new Map();
const addressAssistTimers = new Map();

async function cachedAddressLookup(key, loader) {
  if (addressAssistCache.has(key)) return addressAssistCache.get(key);
  const result = await loader();
  addressAssistCache.set(key, result);
  return result;
}

function setAddressAssistStatus(prefix, message = "", error = false) {
  const box = $(prefix === "customer" ? "customerAddressAssistStatus" : "customerObjectAddressAssistStatus");
  if (!box) return;
  box.textContent = message;
  box.classList.toggle("is-error", error);
}

function updateAddressDatalist(id, items, valueKey = "name", label) {
  const list = $(id);
  if (!list) return;
  list.innerHTML = items.map(item => {
    const value = clean(item[valueKey]);
    const description = clean(label?.(item) || "");
    return `<option value="${esc(value)}"${description ? ` label="${esc(description)}"` : ""}></option>`;
  }).join("");
}

function splitStreetAndHouseNumber(value) {
  const text = clean(value);
  const match = text.match(/^(.*?)(?:\s+(\d+[a-zA-Z]?(?:[-/]\d+[a-zA-Z]?)?))$/);
  return match ? { street: clean(match[1]), houseNumber: match[2] } : { street: text, houseNumber: "" };
}

function debounceAddress(prefix, action, delay = 350) {
  clearTimeout(addressAssistTimers.get(prefix));
  addressAssistTimers.set(prefix, setTimeout(action, delay));
}

function bindAddressAssist(prefix) {
  const street = $(`${prefix}Street`);
  const zip = $(`${prefix}Zip`);
  const city = $(`${prefix}City`);
  if (!street || !zip || !city) return;
  const streetListId = `${prefix}StreetSuggestions`;
  const cityListId = `${prefix}CitySuggestions`;

  const resolvePostalCode = async () => {
    zip.value = zip.value.replace(/\D/g, "").slice(0, 5);
    if (prefix === "customer") syncObjectFields();
    if (zip.value.length !== 5) {
      setAddressAssistStatus(prefix);
      return;
    }
    setAddressAssistStatus(prefix, "Ort wird gesucht …");
    try {
      const data = await cachedAddressLookup(`zip:${zip.value}`, () =>
        lookupGermanLocalities({ postalCode: zip.value })
      );
      const places = data.localities || [];
      updateAddressDatalist(cityListId, places, "name", item => item.postalCode);
      if (places.length) {
        const exact = places.find(item => clean(item.name).toLowerCase() === clean(city.value).toLowerCase());
        if (!exact) city.value = clean(places[0].name);
        if (prefix === "customer") syncObjectFields();
        setAddressAssistStatus(prefix, places.length > 1
          ? `Ort eingesetzt · ${places.length} passende Orte auswählbar`
          : "✓ PLZ und Ort passen zusammen");
      } else {
        setAddressAssistStatus(prefix, "Zu dieser PLZ wurde kein Ort gefunden. Manuelle Eingabe ist möglich.", true);
      }
    } catch {
      setAddressAssistStatus(prefix, "Adressprüfung derzeit nicht erreichbar – manuelle Eingabe ist möglich.", true);
    }
  };

  const resolveCity = async () => {
    const value = clean(city.value);
    if (value.length < 2) return;
    try {
      const data = await cachedAddressLookup(`city:${value.toLowerCase()}`, () =>
        lookupGermanLocalities({ name: value })
      );
      const places = data.localities || [];
      updateAddressDatalist(cityListId, places, "name", item => item.postalCode);
      const exactPlaces = places.filter(item => clean(item.name).toLowerCase() === value.toLowerCase());
      if (exactPlaces.length === 1) {
        zip.value = exactPlaces[0].postalCode;
        city.value = exactPlaces[0].name;
        if (prefix === "customer") syncObjectFields();
        setAddressAssistStatus(prefix, "✓ Passende PLZ wurde eingesetzt");
      } else if (places.length) {
        setAddressAssistStatus(prefix, "Ort auswählen; die passende PLZ wird anschließend eingesetzt.");
      }
    } catch {
      setAddressAssistStatus(prefix, "Adressprüfung derzeit nicht erreichbar – manuelle Eingabe ist möglich.", true);
    }
  };

  const resolveStreet = async () => {
    const entered = splitStreetAndHouseNumber(street.value);
    if (entered.street.length < 3 || zip.value.length !== 5) return;
    try {
      const data = await cachedAddressLookup(
        `street:${zip.value}:${clean(city.value).toLowerCase()}:${entered.street.toLowerCase()}`,
        () => lookupGermanStreets({ name: entered.street, postalCode: zip.value, locality: city.value })
      );
      const streets = data.streets || [];
      updateAddressDatalist(streetListId, streets.map(item => ({
        ...item,
        displayName: `${item.name}${entered.houseNumber ? ` ${entered.houseNumber}` : ""}`
      })), "displayName", item => `${item.postalCode} ${item.locality}`);
      const exact = streets.find(item => clean(item.name).toLowerCase() === entered.street.toLowerCase());
      if (exact) {
        street.value = `${exact.name}${entered.houseNumber ? ` ${entered.houseNumber}` : ""}`;
        if (prefix === "customer") syncObjectFields();
        setAddressAssistStatus(prefix, "✓ Straße, PLZ und Ort wurden geprüft");
      } else if (streets.length) {
        setAddressAssistStatus(prefix, "Passende Straße aus der Vorschlagsliste auswählen.");
      } else {
        setAddressAssistStatus(prefix, "Straße nicht eindeutig gefunden. Schreibweise bitte prüfen oder manuell übernehmen.", true);
      }
    } catch {
      setAddressAssistStatus(prefix, "Straßenprüfung derzeit nicht erreichbar – manuelle Eingabe ist möglich.", true);
    }
  };

  zip.addEventListener("input", () => debounceAddress(`${prefix}:zip`, resolvePostalCode, 150));
  city.addEventListener("input", () => {
    if (prefix === "customer") syncObjectFields();
    debounceAddress(`${prefix}:city`, resolveCity);
  });
  city.addEventListener("change", resolveCity);
  street.addEventListener("input", () => {
    if (prefix === "customer") syncObjectFields();
    debounceAddress(`${prefix}:street`, resolveStreet);
  });
  street.addEventListener("change", resolveStreet);
  street.addEventListener("blur", resolveStreet);
}

function plainText(value) {
  const element = document.createElement("div");
  element.innerHTML = String(value || "");
  return clean(element.textContent || element.innerText || "");
}

function formatAddress(street, zip, city) {
  return [clean(street), [clean(zip), clean(city)].filter(Boolean).join(" ")]
    .filter(Boolean).join(", ");
}

function splitAddress(value) {
  const text = clean(value);
  if (!text) return { street: "", zip: "", city: "" };
  const match = text.match(/^(.*?)(?:,\s*|\s+)(\d{5})\s+(.+)$/);
  return match
    ? { street: clean(match[1]), zip: match[2], city: clean(match[3]) }
    : { street: text, zip: "", city: "" };
}

function displayName(customer) {
  return clean(customer.company) ||
    [clean(customer.firstName), clean(customer.lastName)].filter(Boolean).join(" ") ||
    clean(customer.name) ||
    "Unbenannter Kunde";
}

function normalizePhone(phone) {
  const raw = clean(phone).replace(/[^\d+]/g, "");
  if (raw.startsWith("00")) return `+${raw.slice(2)}`;
  if (raw.startsWith("0")) return `+49${raw.slice(1)}`;
  return raw;
}

function isMobile(phone) {
  const value = normalizePhone(phone);
  return /^\+49(?:15|16|17)\d+/.test(value);
}

function whatsappPhone(customer = {}) {
  const mobile = clean(customer.mobile);
  if (mobile) return mobile;
  return isMobile(customer.phone) ? clean(customer.phone) : "";
}

function loadWorksites() {
  try {
    const items = JSON.parse(localStorage.getItem("mainabdichter_v18_worksites") || "[]");
    return Array.isArray(items) ? items : [];
  } catch {
    return [];
  }
}

function sameCustomer(customer, candidate = {}) {
  const source = candidate.customer || candidate.visit?.customer || candidate;
  if (customer.pipedriveId && source.pipedriveId) {
    return String(customer.pipedriveId) === String(source.pipedriveId);
  }
  if (customer.email && source.email) {
    return clean(customer.email).toLowerCase() === clean(source.email).toLowerCase();
  }
  const customerPhone = normalizePhone(customer.phone);
  const sourcePhone = normalizePhone(source.phone);
  if (customerPhone && sourcePhone) return customerPhone === sourcePhone;
  return displayName(customer).toLowerCase() === displayName(source).toLowerCase();
}

function formatDate(value) {
  if (!value) return "Datum nicht hinterlegt";
  const date = new Date(`${String(value).slice(0, 10)}T12:00:00`);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString("de-DE");
}

function money(value) {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" })
    .format(Number(value || 0));
}

function recordStatus(value) {
  return ({
    draft: "Entwurf",
    "lexoffice-draft": "Entwurf an Lexoffice übertragen",
    open: "Offen",
    accepted: "Angenommen",
    completed: "Abgeschlossen",
    followup: "Nachkontrolle",
    active: "In Ausführung",
    planned: "Geplant"
  })[value] || value || "Ohne Status";
}

function voucherLabel(value) {
  return ({
    invoice: "Rechnung",
    quotation: "Angebot",
    orderconfirmation: "Auftragsbestätigung",
    creditnote: "Gutschrift",
    downpaymentinvoice: "Abschlagsrechnung"
  })[String(value || "").toLowerCase()] || value || "Dokument";
}

function normalizeCustomer(input = {}) {
  const postal = splitAddress(input.postalAddress || input.address);
  const object = splitAddress(input.objectAddress);
  const street = clean(input.street || postal.street);
  const zip = clean(input.zip || postal.zip);
  const city = clean(input.city || postal.city);
  const objectDifferent = Boolean(
    input.objectAddressDifferent ||
    (input.objectAddress && clean(input.objectAddress) !== formatAddress(street, zip, city))
  );
  const objectStreet = clean(input.objectStreet || (objectDifferent ? object.street : street));
  const objectZip = clean(input.objectZip || (objectDifferent ? object.zip : zip));
  const objectCity = clean(input.objectCity || (objectDifferent ? object.city : city));
  return {
    ...input,
    id: input.id || "",
    type: input.type || (input.company ? "company" : "person"),
    firstName: clean(input.firstName),
    lastName: clean(input.lastName),
    company: clean(input.company),
    phone: clean(input.phone),
    mobile: clean(input.mobile),
    email: clean(input.email),
    street,
    zip,
    city,
    postalAddress: formatAddress(street, zip, city),
    objectAddressDifferent: objectDifferent,
    objectStreet,
    objectZip,
    objectCity,
    objectAddress: formatAddress(objectStreet, objectZip, objectCity),
    pipedriveId: input.pipedriveId
      ? String(input.pipedriveId)
      : input.id && input.source === "pipedrive"
        ? String(input.id).replace(/^pipedrive-/, "")
        : "",
    source: input.source || "local"
  };
}

function mergePipedriveCustomer(existing, incoming) {
  const remote = normalizeCustomer(incoming);
  if (!existing) return remote;

  const current = normalizeCustomer(existing);
  const values = Object.fromEntries(
    Object.entries(remote).filter(([, value]) =>
      value !== "" && value !== null && value !== undefined
    )
  );
  const objectDifferent = current.objectAddressDifferent;

  return normalizeCustomer({
    ...current,
    ...values,
    id: current.id,
    pipedriveId: remote.pipedriveId || current.pipedriveId,
    objectAddressDifferent: objectDifferent,
    objectStreet: objectDifferent ? current.objectStreet : (remote.street || current.street),
    objectZip: objectDifferent ? current.objectZip : (remote.zip || current.zip),
    objectCity: objectDifferent ? current.objectCity : (remote.city || current.city),
    objectAddress: objectDifferent
      ? current.objectAddress
      : (remote.postalAddress || current.postalAddress),
    source: "pipedrive"
  });
}

function setStatus(id, message = "", type = "") {
  const element = $(id);
  if (!element) return;
  element.textContent = message;
  element.className = id === "customerFormStatus" ? "customer-form-status" : "customer-inline-status";
  if (type) element.classList.add(`is-${type}`);
}

function formValue(id) {
  return clean($(id)?.value);
}

function customerFromForm() {
  const different = $("customerObjectDifferent").checked;
  const street = formValue("customerStreet");
  const zip = formValue("customerZip");
  const city = formValue("customerCity");
  return normalizeCustomer({
    id: formValue("customerId"),
    pipedriveId: formValue("customerPipedriveId"),
    type: $("customerType").value,
    firstName: formValue("customerFirstName"),
    lastName: formValue("customerLastName"),
    company: formValue("customerCompany"),
    phone: formValue("customerPhone"),
    mobile: formValue("customerMobile"),
    email: formValue("customerEmail"),
    street,
    zip,
    city,
    objectAddressDifferent: different,
    objectStreet: different ? formValue("customerObjectStreet") : street,
    objectZip: different ? formValue("customerObjectZip") : zip,
    objectCity: different ? formValue("customerObjectCity") : city
  });
}

function syncObjectFields() {
  const different = $("customerObjectDifferent").checked;
  const mappings = [
    ["customerStreet", "customerObjectStreet"],
    ["customerZip", "customerObjectZip"],
    ["customerCity", "customerObjectCity"]
  ];
  for (const [postalId, objectId] of mappings) {
    const objectInput = $(objectId);
    if (!different) objectInput.value = $(postalId).value;
    objectInput.readOnly = !different;
    objectInput.classList.toggle("is-auto-address", !different);
  }
  $("customerObjectHint").textContent = different
    ? "Bitte die abweichende Objektadresse vollständig eintragen."
    : "Die Objektadresse wird automatisch aus der Postanschrift übernommen.";
}

function fillForm(customer = {}) {
  const item = normalizeCustomer(customer);
  $("customerId").value = item.id || "";
  $("customerPipedriveId").value = item.pipedriveId || "";
  $("customerType").value = item.type;
  $("customerCompany").value = item.company;
  $("customerFirstName").value = item.firstName;
  $("customerLastName").value = item.lastName;
  $("customerPhone").value = item.phone;
  $("customerMobile").value = item.mobile;
  $("customerEmail").value = item.email;
  $("customerStreet").value = item.street;
  $("customerZip").value = item.zip;
  $("customerCity").value = item.city;
  $("customerObjectDifferent").checked = item.objectAddressDifferent;
  $("customerObjectStreet").value = item.objectStreet;
  $("customerObjectZip").value = item.objectZip;
  $("customerObjectCity").value = item.objectCity;
  $("customerEditorTitle").textContent = item.id || item.pipedriveId
    ? displayName(item)
    : "Neuen Kunden anlegen";
  $("customerSyncInfo").textContent = item.pipedriveId
    ? `Mit Pipedrive verbunden · Personen-ID ${item.pipedriveId}`
    : "Noch nicht mit Pipedrive synchronisiert.";
  $("customerRefreshPipedrive").classList.toggle("hidden", !item.pipedriveId);
  syncObjectFields();
  setStatus("customerFormStatus");
}

function openEditor(customer) {
  fillForm(customer);
  $("customerListView").classList.add("hidden");
  $("customerEditor").classList.remove("hidden");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function closeEditor() {
  $("customerEditor").classList.add("hidden");
  $("customerListView").classList.remove("hidden");
  renderList();
}

function searchText(customer) {
  return [
    displayName(customer), customer.firstName, customer.lastName, customer.company,
    customer.phone, customer.mobile, customer.email, customer.street, customer.zip, customer.city,
    customer.objectAddress
  ].join(" ").toLocaleLowerCase("de");
}

function actionLinks(customer) {
  const phone = clean(customer.phone);
  const email = clean(customer.email);
  const links = [];
  if (phone) links.push(`<a href="tel:${esc(phone)}" aria-label="${esc(displayName(customer))} anrufen">☎ Anrufen</a>`);
  const mobile = whatsappPhone(customer);
  if (mobile) links.push(`<a class="customer-whatsapp" href="https://wa.me/${esc(normalizePhone(mobile).replace("+", ""))}" target="_blank" rel="noopener">WhatsApp</a>`);
  if (email) links.push(`<a href="mailto:${esc(email)}">E-Mail</a>`);
  links.push(`<button type="button" data-customer-record="${esc(customer.id)}">Kundenakte</button>`);
  links.push(`<button type="button" data-customer-edit="${esc(customer.id)}">Bearbeiten</button>`);
  links.push(`<button type="button" data-customer-use="${esc(customer.id)}">Für Besichtigung</button>`);
  return links.join("");
}

function renderList(items = null) {
  const term = clean($("customerSearch")?.value).toLocaleLowerCase("de");
  const customers = (items || loadCustomers())
    .map(normalizeCustomer)
    .filter(customer => !term || searchText(customer).includes(term))
    .sort((a, b) => displayName(a).localeCompare(displayName(b), "de"));
  $("customerList").innerHTML = customers.length
    ? customers.map(customer => `
      <article class="customer-list-card">
        <div class="customer-list-main">
          <strong>${esc(displayName(customer))}</strong>
          <span>${esc(customer.objectAddress || customer.postalAddress || "Noch keine Adresse")}</span>
          <small>${esc([customer.phone, customer.mobile, customer.email].filter(Boolean).join(" · ") || "Noch keine Kontaktdaten")}${customer.pipedriveId ? " · Pipedrive" : ""}</small>
        </div>
        <div class="customer-list-actions">${actionLinks(customer)}</div>
      </article>`).join("")
    : `<div class="customer-list-empty">Noch keine passenden Kunden gespeichert.</div>`;

  document.querySelectorAll("[data-customer-edit]").forEach(button => {
    button.onclick = () => openEditor(loadCustomers().find(item => item.id === button.dataset.customerEdit));
  });
  document.querySelectorAll("[data-customer-record]").forEach(button => {
    button.onclick = () => {
      const customer = loadCustomers().find(item => item.id === button.dataset.customerRecord);
      if (customer) openCustomerRecord(customer);
    };
  });
  document.querySelectorAll("[data-customer-use]").forEach(button => {
    button.onclick = () => {
      const customer = loadCustomers().find(item => item.id === button.dataset.customerUse);
      if (customer) window.dispatchEvent(new CustomEvent("mainabdichter:use-customer", { detail: { customer } }));
    };
  });
}

function renderCustomerRecord(customer) {
  const item = normalizeCustomer(customer);
  const offers = loadArchive().filter(record => sameCustomer(item, record));
  const worksites = loadWorksites().filter(worksite => sameCustomer(item, worksite));
  activeRecordCustomer = item;

  $("customerRecordTitle").textContent = displayName(item);
  $("customerRecordAddress").textContent = item.objectAddress || item.postalAddress || "Keine Adresse hinterlegt";
  $("customerRecordContact").innerHTML = [
    item.phone
      ? `<a href="tel:${esc(item.phone)}"><small>Telefon</small><strong>${esc(item.phone)}</strong></a>`
      : `<div><small>Telefon</small><strong>Nicht hinterlegt</strong></div>`,
    whatsappPhone(item)
      ? `<a class="customer-whatsapp" href="whatsapp-business://send?phone=${esc(normalizePhone(whatsappPhone(item)).replace("+", ""))}"><small>WhatsApp Business</small><strong>${esc(item.mobile || item.phone)}</strong></a>`
      : "",
    item.email
      ? `<a href="mailto:${esc(item.email)}"><small>E-Mail</small><strong>${esc(item.email)}</strong></a>`
      : `<div><small>E-Mail</small><strong>Nicht hinterlegt</strong></div>`,
    `<div><small>Postanschrift</small><strong>${esc(item.postalAddress || "Nicht hinterlegt")}</strong></div>`
  ].filter(Boolean).join("");

  $("customerRecordOfferCount").textContent = String(offers.length);
  $("customerRecordOffers").innerHTML = offers.length
    ? offers.sort((a, b) => String(b.visitDate || "").localeCompare(String(a.visitDate || ""))).map(record => `
      <article class="customer-record-row">
        <div>
          <strong>${esc(record.visitNumber || "Besichtigung / Angebot")}</strong>
          <span>${esc(formatDate(record.visitDate))} · ${esc((record.measures || []).join(", ") || "Noch keine Maßnahme")}</span>
          <small>${esc(record.objectAddress || item.objectAddress || "")}${record.offerGross ? ` · ${esc(money(record.offerGross))}` : ""}</small>
        </div>
        <em>${esc(recordStatus(record.status))}</em>
      </article>`).join("")
    : `<div class="customer-record-empty">Für diesen Kunden sind noch keine gespeicherten Besichtigungen oder Angebote vorhanden.</div>`;

  $("customerRecordWorksiteCount").textContent = String(worksites.length);
  $("customerRecordWorksites").innerHTML = worksites.length
    ? worksites.sort((a, b) => String(b.date || "").localeCompare(String(a.date || ""))).map(worksite => `
      <article class="customer-record-row">
        <div>
          <strong>${esc(worksite.visitNumber || "Baustelle")}</strong>
          <span>${esc(formatDate(worksite.date))} · ${esc(worksite.objectAddress || item.objectAddress || "")}</span>
          <small>${esc((worksite.tasks || []).map(task => task.type).filter(Boolean).join(", ") || "Keine Maßnahmen hinterlegt")}</small>
        </div>
        <em>${esc(recordStatus(worksite.status))}</em>
      </article>`).join("")
    : `<div class="customer-record-empty">Für diesen Kunden ist noch keine Baustelle gespeichert.</div>`;

  $("customerRecordPipedrive").innerHTML = item.pipedriveId
    ? `<strong>Mit Pipedrive verbunden</strong><span>Personen-ID ${esc(item.pipedriveId)}${item.lastPipedriveSync?.at ? ` · zuletzt ${esc(new Date(item.lastPipedriveSync.at).toLocaleString("de-DE"))}` : ""}</span>`
    : `<strong>Noch nicht mit Pipedrive verbunden</strong><span>Beim nächsten Speichern wird die Synchronisation versucht.</span>`;

  const pipedrive = item.externalHistory?.pipedrive;
  const localCommunicationEntries = loadCommunicationNotes()
    .filter(note =>
      (item.pipedriveId && String(note.personId || "") === String(item.pipedriveId)) ||
      (item.email && String(note.customerEmail || "").toLowerCase() === String(item.email).toLowerCase())
    )
    .map(note => ({
      title: note.source === "E-Mail" ? "E-Mail" : "Gesprächsnotiz",
      meta: `${formatDate(note.updatedAt || note.createdAt)} · ${String(note.text || "").slice(0, 180)}`,
      status: note.status === "done" ? "Erledigt" : "Notiz"
    }));
  const pipedriveEntries = [
    ...localCommunicationEntries,
    ...(pipedrive
    ? [
        ...(pipedrive.deals || []).map(deal => ({
          title: deal.title || "Pipedrive-Deal",
          meta: `${formatDate(deal.updateTime || deal.addTime)}${deal.value ? ` · ${money(deal.value)}` : ""}`,
          status: recordStatus(deal.status)
        })),
        ...(pipedrive.activities || []).map(activity => ({
          title: activity.subject || "Pipedrive-Aktivität",
          meta: `${formatDate(activity.dueDate)}${activity.note ? ` · ${plainText(activity.note).slice(0, 140)}` : ""}`,
          status: activity.done ? "Erledigt" : "Offen"
        })),
        ...(pipedrive.notes || []).slice(0, 20).map(note => ({
          title: "Pipedrive-Notiz",
          meta: `${formatDate(note.updateTime || note.addTime)} · ${plainText(note.content).slice(0, 180)}`,
          status: "Notiz"
        }))
      ]
    : [])
  ];
  $("customerRecordPipedriveHistory").innerHTML = pipedriveEntries.length
    ? pipedriveEntries.map(entry => `
      <article class="customer-record-row">
        <div><strong>${esc(entry.title)}</strong><span>${esc(entry.meta)}</span></div>
        <em>${esc(entry.status)}</em>
      </article>`).join("")
    : `<div class="customer-record-empty">${item.pipedriveId ? "Noch keine Pipedrive-Daten geladen. Bitte Kundenakte aktualisieren." : "Ohne Pipedrive-Verbindung können keine Einträge geladen werden."}</div>`;

  const lexwareDocuments = item.externalHistory?.lexware?.documents || [];
  $("customerRecordLexwareCount").textContent = String(lexwareDocuments.length);
  $("customerRecordLexware").innerHTML = lexwareDocuments.length
    ? lexwareDocuments.map(document => `
      <article class="customer-record-row">
        <div>
          <strong>${esc(voucherLabel(document.voucherType))} ${esc(document.voucherNumber || "")}</strong>
          <span>${esc(formatDate(document.voucherDate))} · ${esc(money(document.totalAmount))}</span>
        </div>
        <em>${esc(recordStatus(document.voucherStatus))}</em>
      </article>`).join("")
    : `<div class="customer-record-empty">${item.externalHistory?.lexware ? "Keine Lexware-Angebote oder Rechnungen für diesen Kontakt gefunden." : "Noch keine Lexware-Daten geladen. Bitte Kundenakte aktualisieren."}</div>`;
}

function openCustomerRecord(customer) {
  renderCustomerRecord(customer);
  $("customerListView").classList.add("hidden");
  $("customerEditor").classList.add("hidden");
  $("customerRecord").classList.remove("hidden");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function closeCustomerRecord() {
  activeRecordCustomer = null;
  $("customerRecord").classList.add("hidden");
  $("customerListView").classList.remove("hidden");
  renderList();
}

async function refreshCustomerRecord() {
  if (!activeRecordCustomer) return;
  if (!hasConnectionConfig()) {
    setStatus("customerRecordSyncStatus", "Für die Aktualisierung fehlen die Verbindungsdaten in den Einstellungen.", "error");
    return;
  }
  const button = $("customerRecordRefresh");
  const originalLabel = button.textContent;
  button.disabled = true;
  button.textContent = "Kundenakte wird geladen …";
  setStatus("customerRecordSyncStatus", "Pipedrive und Lexware werden abgefragt …");

  const item = normalizeCustomer(activeRecordCustomer);
  const requests = [
    item.pipedriveId
      ? loadPipedriveCustomerHistory(item.pipedriveId)
      : Promise.resolve(null),
    loadLexwareCustomerHistory({
      contactId: item.lexwareContactId || "",
      email: item.email || "",
      name: displayName(item)
    })
  ];

  try {
    const [pipedriveResult, lexwareResult] = await Promise.allSettled(requests);
    const errors = [];
    if (pipedriveResult.status === "rejected") {
      errors.push(`Pipedrive: ${pipedriveResult.reason?.message || "Abruf fehlgeschlagen"}`);
    }
    if (lexwareResult.status === "rejected") {
      errors.push(`Lexware: ${lexwareResult.reason?.message || "Abruf fehlgeschlagen"}`);
    }
    const updated = saveCustomer({
      ...item,
      lexwareContactId:
        lexwareResult.status === "fulfilled"
          ? lexwareResult.value?.contact?.id || item.lexwareContactId || ""
          : item.lexwareContactId || "",
      externalHistory: {
        pipedrive:
          pipedriveResult.status === "fulfilled"
            ? pipedriveResult.value
            : item.externalHistory?.pipedrive || null,
        lexware:
          lexwareResult.status === "fulfilled"
            ? lexwareResult.value
            : item.externalHistory?.lexware || null,
        loadedAt: new Date().toISOString()
      }
    });
    renderCustomerRecord(updated);
    setStatus(
      "customerRecordSyncStatus",
      errors.length
        ? `Teilweise aktualisiert. ${errors.join(" · ")}`
        : "Kundenakte wurde aus Pipedrive und Lexware aktualisiert.",
      errors.length ? "error" : "success"
    );
  } catch (error) {
    setStatus("customerRecordSyncStatus", `Kundenakte konnte nicht aktualisiert werden: ${error.message}`, "error");
  } finally {
    button.disabled = false;
    button.textContent = originalLabel;
  }
}

async function searchRemote() {
  const term = formValue("customerSearch");
  if (term.length < 2) {
    setStatus("customerListStatus", "Bitte mindestens zwei Zeichen eingeben.", "error");
    return;
  }
  if (!hasConnectionConfig()) {
    setStatus("customerListStatus", "Für die Pipedrive-Suche fehlen die Verbindungsdaten in den Einstellungen.", "error");
    return;
  }
  setStatus("customerListStatus", "Pipedrive wird durchsucht …");
  $("customerSearchPipedrive").disabled = true;
  try {
    const result = await searchPipedrive(term);
    const localCustomers = loadCustomers();
    const remote = (result.people || []).map(person => {
      const existing = localCustomers.find(item =>
        String(item.pipedriveId || "") === String(person.id || "")
      );
      const incoming = normalizeCustomer({
        ...person,
        id: existing?.id || `pipedrive-${person.id}`,
        pipedriveId: person.id,
        source: "pipedrive"
      });
      return mergePipedriveCustomer(existing, incoming);
    });
    for (const customer of remote) saveCustomer(customer);
    renderList();
    setStatus("customerListStatus", `${remote.length} Kunde${remote.length === 1 ? "" : "n"} aus Pipedrive übernommen.`, "success");
  } catch (error) {
    setStatus("customerListStatus", `Pipedrive-Suche fehlgeschlagen: ${error.message}`, "error");
  } finally {
    $("customerSearchPipedrive").disabled = false;
  }
}

async function syncAllPipedrive() {
  if (!hasConnectionConfig()) {
    setStatus("customerListStatus", "Für die Pipedrive-Aktualisierung fehlen die Verbindungsdaten in den Einstellungen.", "error");
    return;
  }

  const button = $("customerSyncPipedrive");
  const originalLabel = button.textContent;
  button.disabled = true;
  button.textContent = "Pipedrive wird geladen …";
  setStatus("customerListStatus", "Kunden werden aus Pipedrive aktualisiert …");

  try {
    let cursor = "";
    let loaded = 0;
    let pages = 0;
    do {
      const result = await loadPipedrivePersons(cursor);
      const localCustomers = loadCustomers();
      for (const person of result.people || []) {
        const existing = localCustomers.find(item =>
          String(item.pipedriveId || "") === String(person.id || "")
        );
        saveCustomer(mergePipedriveCustomer(existing, {
          ...person,
          id: existing?.id || `pipedrive-${person.id}`,
          pipedriveId: person.id,
          source: "pipedrive"
        }));
        loaded += 1;
      }
      cursor = clean(result.nextCursor);
      pages += 1;
    } while (cursor && pages < 20);

    renderList();
    setStatus(
      "customerListStatus",
      `${loaded} Pipedrive-Kunde${loaded === 1 ? "" : "n"} wurden aktualisiert.`,
      "success"
    );
  } catch (error) {
    setStatus("customerListStatus", `Pipedrive-Aktualisierung fehlgeschlagen: ${error.message}`, "error");
  } finally {
    button.disabled = false;
    button.textContent = originalLabel;
  }
}

function validate(customer) {
  if (!customer.company && !customer.firstName && !customer.lastName) {
    return "Bitte Vor- und Nachname oder einen Firmennamen eintragen.";
  }
  if (!customer.street || !customer.zip || !customer.city) {
    return "Bitte die Postanschrift mit Straße, PLZ und Ort vollständig eintragen.";
  }
  if (customer.objectAddressDifferent &&
      (!customer.objectStreet || !customer.objectZip || !customer.objectCity)) {
    return "Bitte die abweichende Objektadresse vollständig eintragen.";
  }
  if (customer.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email)) {
    return "Bitte eine gültige E-Mail-Adresse eintragen.";
  }
  if (customer.mobile && normalizePhone(customer.mobile).replace(/\D/g, "").length < 8) {
    return "Bitte eine vollständige Mobilnummer eintragen.";
  }
  return "";
}

async function saveForm(event) {
  event.preventDefault();
  let customer = customerFromForm();
  const error = validate(customer);
  if (error) {
    setStatus("customerFormStatus", error, "error");
    return;
  }

  $("customerSave").disabled = true;
  $("customerSave").textContent = "Wird gespeichert …";
  customer = saveCustomer(customer);
  fillForm(customer);
  setStatus("customerFormStatus", "Kunde wurde auf diesem Gerät gespeichert.", "success");

  if (hasConnectionConfig()) {
    try {
      const result = await createPipedrivePerson({
        ...customer,
        name: displayName(customer),
        postalAddress: customer.postalAddress,
        objectAddress: customer.objectAddress,
        personFieldMappings: state.settings.pipedriveSync?.personFieldMappings || {},
        source: "mainabdichter PRO Kundenmodul"
      });
      customer = saveCustomer({
        ...customer,
        pipedriveId: String(result.person?.id || customer.pipedriveId || ""),
        lastPipedriveSync: { ok: true, at: new Date().toISOString() }
      });
      fillForm(customer);
      setStatus("customerFormStatus", "Gespeichert und mit Pipedrive synchronisiert.", "success");
      setTimeout(closeEditor, 900);
    } catch (syncError) {
      customer = saveCustomer({
        ...customer,
        lastPipedriveSync: { ok: false, at: new Date().toISOString(), error: syncError.message }
      });
      setStatus(
        "customerFormStatus",
        `Kunde ist auf diesem Gerät gespeichert. Pipedrive konnte nicht aktualisiert werden: ${syncError.message}`,
        "error"
      );
    }
  } else {
    setTimeout(closeEditor, 900);
  }

  $("customerSave").disabled = false;
  $("customerSave").textContent = "Kunde speichern";
  renderList();
}

async function refreshFromPipedrive() {
  const pipedriveId = formValue("customerPipedriveId");
  if (!pipedriveId) return;
  $("customerRefreshPipedrive").disabled = true;
  const originalLabel = $("customerRefreshPipedrive").textContent;
  $("customerRefreshPipedrive").textContent = "Pipedrive wird aktualisiert …";
  setStatus("customerFormStatus", "Aktuelle Daten werden aus Pipedrive geladen …");
  try {
    const result = await loadPipedrivePerson(pipedriveId);
    const current = customerFromForm();
    const remote = normalizeCustomer(result.person);
    const preserveObjectAddress = current.objectAddressDifferent;
    const refreshed = saveCustomer(normalizeCustomer({
      ...current,
      ...remote,
      id: current.id,
      pipedriveId,
      objectAddressDifferent: preserveObjectAddress,
      objectStreet: preserveObjectAddress ? current.objectStreet : (remote.objectStreet || remote.street),
      objectZip: preserveObjectAddress ? current.objectZip : (remote.objectZip || remote.zip),
      objectCity: preserveObjectAddress ? current.objectCity : (remote.objectCity || remote.city),
      objectAddress: preserveObjectAddress ? current.objectAddress : (remote.objectAddress || remote.postalAddress),
      objectAddressDifferent: preserveObjectAddress || remote.objectAddressDifferent,
      pipedriveData: {
        emails: result.person.emails || [],
        phones: result.person.phones || [],
        customFields: result.person.customFields || {},
        customFieldsByName: result.person.customFieldsByName || {},
        raw: result.person.pipedriveRaw || {}
      },
      source: "pipedrive",
      lastPipedriveSync: { ok: true, at: new Date().toISOString() }
    }));
    fillForm(refreshed);
    setStatus("customerFormStatus", "Kundendaten wurden aus Pipedrive aktualisiert und gespeichert.", "success");
  } catch (error) {
    setStatus("customerFormStatus", `Aktualisierung fehlgeschlagen: ${error.message}`, "error");
  } finally {
    $("customerRefreshPipedrive").disabled = false;
    $("customerRefreshPipedrive").textContent = originalLabel;
  }
}

function init() {
  if (!$("customers")) return;
  $("customerCreateNew").onclick = () => openEditor({});
  $("customerEditorClose").onclick = closeEditor;
  $("customerForm").onsubmit = saveForm;
  $("customerSearch").oninput = () => renderList();
  $("customerSearchPipedrive").onclick = searchRemote;
  $("customerSyncPipedrive").onclick = syncAllPipedrive;
  $("customerRefreshPipedrive").onclick = refreshFromPipedrive;
  $("customerRecordClose").onclick = closeCustomerRecord;
  $("customerRecordRefresh").onclick = refreshCustomerRecord;
  $("customerRecordEdit").onclick = () => {
    if (!activeRecordCustomer) return;
    $("customerRecord").classList.add("hidden");
    openEditor(activeRecordCustomer);
  };
  $("customerRecordUse").onclick = () => {
    if (!activeRecordCustomer) return;
    window.dispatchEvent(new CustomEvent("mainabdichter:use-customer", {
      detail: { customer: activeRecordCustomer }
    }));
  };
  $("customerObjectDifferent").onchange = syncObjectFields;
  ["customerStreet", "customerZip", "customerCity"].forEach(id => {
    $(id).addEventListener("input", syncObjectFields);
  });
  bindAddressAssist("customer");
  bindAddressAssist("customerObject");
  renderList();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init, { once: true });
} else {
  init();
}
