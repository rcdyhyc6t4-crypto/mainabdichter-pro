import { state, loadCustomers, saveCustomer } from "./storage-v227.js";
import {
  hasConnectionConfig,
  searchPipedrive,
  loadPipedrivePerson,
  createPipedrivePerson
} from "./api-v227.js";

const $ = id => document.getElementById(id);
const esc = value => String(value ?? "").replace(/[&<>"']/g, char => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
}[char]));

function clean(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
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
    customer.phone, customer.email, customer.street, customer.zip, customer.city,
    customer.objectAddress
  ].join(" ").toLocaleLowerCase("de");
}

function actionLinks(customer) {
  const phone = clean(customer.phone);
  const email = clean(customer.email);
  const links = [];
  if (phone) links.push(`<a href="tel:${esc(phone)}" aria-label="${esc(displayName(customer))} anrufen">☎ Anrufen</a>`);
  if (isMobile(phone)) links.push(`<a class="customer-whatsapp" href="https://wa.me/${esc(normalizePhone(phone).replace("+", ""))}" target="_blank" rel="noopener">WhatsApp</a>`);
  if (email) links.push(`<a href="mailto:${esc(email)}">E-Mail</a>`);
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
          <small>${esc([customer.phone, customer.email].filter(Boolean).join(" · ") || "Noch keine Kontaktdaten")}${customer.pipedriveId ? " · Pipedrive" : ""}</small>
        </div>
        <div class="customer-list-actions">${actionLinks(customer)}</div>
      </article>`).join("")
    : `<div class="customer-list-empty">Noch keine passenden Kunden gespeichert.</div>`;

  document.querySelectorAll("[data-customer-edit]").forEach(button => {
    button.onclick = () => openEditor(loadCustomers().find(item => item.id === button.dataset.customerEdit));
  });
  document.querySelectorAll("[data-customer-use]").forEach(button => {
    button.onclick = () => {
      const customer = loadCustomers().find(item => item.id === button.dataset.customerUse);
      if (customer) window.dispatchEvent(new CustomEvent("mainabdichter:use-customer", { detail: { customer } }));
    };
  });
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
    const remote = (result.people || []).map(person => normalizeCustomer({
      ...person,
      id: `pipedrive-${person.id}`,
      pipedriveId: person.id,
      source: "pipedrive"
    }));
    for (const customer of remote) saveCustomer(customer);
    renderList();
    setStatus("customerListStatus", `${remote.length} Kunde${remote.length === 1 ? "" : "n"} aus Pipedrive übernommen.`, "success");
  } catch (error) {
    setStatus("customerListStatus", `Pipedrive-Suche fehlgeschlagen: ${error.message}`, "error");
  } finally {
    $("customerSearchPipedrive").disabled = false;
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
  }

  $("customerSave").disabled = false;
  $("customerSave").textContent = "Kunde speichern";
  renderList();
}

async function refreshFromPipedrive() {
  const pipedriveId = formValue("customerPipedriveId");
  if (!pipedriveId) return;
  $("customerRefreshPipedrive").disabled = true;
  setStatus("customerFormStatus", "Aktuelle Daten werden aus Pipedrive geladen …");
  try {
    const result = await loadPipedrivePerson(pipedriveId);
    const current = customerFromForm();
    const refreshed = saveCustomer(normalizeCustomer({
      ...current,
      ...result.person,
      id: current.id,
      pipedriveId,
      source: "pipedrive",
      lastPipedriveSync: { ok: true, at: new Date().toISOString() }
    }));
    fillForm(refreshed);
    setStatus("customerFormStatus", "Kundendaten wurden aus Pipedrive aktualisiert und gespeichert.", "success");
  } catch (error) {
    setStatus("customerFormStatus", `Aktualisierung fehlgeschlagen: ${error.message}`, "error");
  } finally {
    $("customerRefreshPipedrive").disabled = false;
  }
}

function init() {
  if (!$("customers")) return;
  $("customerCreateNew").onclick = () => openEditor({});
  $("customerEditorClose").onclick = closeEditor;
  $("customerForm").onsubmit = saveForm;
  $("customerSearch").oninput = () => renderList();
  $("customerSearchPipedrive").onclick = searchRemote;
  $("customerRefreshPipedrive").onclick = refreshFromPipedrive;
  $("customerObjectDifferent").onchange = syncObjectFields;
  ["customerStreet", "customerZip", "customerCity"].forEach(id => {
    $(id).addEventListener("input", syncObjectFields);
  });
  renderList();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init, { once: true });
} else {
  init();
}
