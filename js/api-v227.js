import { state, saveState } from "./storage-v227.js";

export function normalizeWorkerUrl(value) {
  let raw = String(value || "")
    .trim()
    .replace(/^["']|["']$/g, "")
    .replace(/\s+/g, "");

  if (!raw) return "";
  if (!/^https?:\/\//i.test(raw)) raw = `https://${raw}`;
  raw = raw.replace(/\/+$/, "");

  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error("Die Worker-URL ist ungültig. Bitte die vollständige workers.dev-Adresse eintragen.");
  }

  if (parsed.protocol !== "https:") {
    throw new Error("Die Worker-URL muss mit https:// beginnen.");
  }

  return `${parsed.origin}${parsed.pathname.replace(/\/+$/, "")}`;
}

function config() {
  return {
    url: normalizeWorkerUrl(state.settings.workerUrl || ""),
    secret: String(state.settings.appSecret || "").trim()
  };
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error(`Zeitüberschreitung beim Aufruf des Workers: ${url}`);
    }
    if (error instanceof TypeError) {
      throw new Error(`Worker nicht erreichbar: ${url}. Bitte URL und Cloudflare-Deployment prüfen.`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export function hasConnectionConfig() {
  const { url, secret } = config();
  return Boolean(url && secret);
}

export async function api(path, options = {}) {
  const { url, secret } = config();
  if (!url || !secret) throw new Error("Zugangsdaten fehlen.");

  const response = await fetchWithTimeout(url + path, {
    ...options,
    headers: {
      ...(options.headers || {}),
      "X-App-Secret": secret
    }
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detailParts = [];

    if (data.status) {
      detailParts.push(`HTTP ${data.status}`);
    }

    if (data.details) {
      if (typeof data.details === "string") {
        detailParts.push(data.details);
      } else if (data.details.message) {
        detailParts.push(data.details.message);
      } else if (data.details.error) {
        detailParts.push(data.details.error);
      } else {
        detailParts.push(JSON.stringify(data.details));
      }
    }

    const suffix = detailParts.length ? ` – ${detailParts.join(" – ")}` : "";
    throw new Error(`${data.error || "API-Fehler"}${suffix}`);
  }
  return data;
}

export async function searchPipedrive(term) {
  return api(`/pipedrive/persons/search?term=${encodeURIComponent(term)}`);
}

export async function loadPipedrivePerson(id) {
  return api(`/pipedrive/persons/${encodeURIComponent(id)}`);
}

export async function searchLexwareCustomers(term) {
  return api(`/lexware/contacts/search?term=${encodeURIComponent(term)}`);
}

export async function loadLexwareCustomer(id) {
  return api(`/lexware/contacts/${encodeURIComponent(id)}`);
}

export async function loadLexwareArticles() {
  const data = await api("/articles");
  state.settings.lexwareArticles = data.articles || [];
  saveState();
  return state.settings.lexwareArticles;
}

export async function testConnections() {
  const result = { cloudflare: false, lexware: false, pipedrive: false, errors: {} };
  const { url } = config();

  try {
    if (!url) throw new Error("Worker-URL fehlt.");
    const response = await fetchWithTimeout(url + "/", {}, 15000);
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.ok) {
      throw new Error(`Worker antwortet mit HTTP ${response.status}.`);
    }
    result.cloudflare = true;
    result.workerVersion = data.workerVersion || data.version || "unbekannt";
  } catch (error) {
    result.errors.cloudflare = error.message;
  }

  try {
    await api("/profile");
    result.lexware = true;
  } catch (error) {
    result.errors.lexware = error.message;
  }

  try {
    await api("/pipedrive/test");
    result.pipedrive = true;
  } catch (error) {
    result.errors.pipedrive = error.message;
  }

  return result;
}

export async function createLexwareQuotation(payload) {
  return api("/quotations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}


export async function createPipedrivePerson(payload) {
  return api("/pipedrive/persons", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}


export async function loadPipedriveActivities(date) {
  return api(`/pipedrive/activities?date=${encodeURIComponent(date)}`);
}

export async function loadAcceptedLexwareQuotations(dateFrom) {
  const query = dateFrom
    ? `?updatedDateFrom=${encodeURIComponent(dateFrom)}`
    : "";
  return api(`/lexware/accepted-quotations${query}`);
}

export async function loadAcceptedLexwareQuotation(id) {
  return api(`/lexware/accepted-quotations/${encodeURIComponent(id)}`);
}


export async function loadPipedriveDealFields() {
  return api("/pipedrive/deal-fields");
}

export async function loadPipedriveStages() {
  return api("/pipedrive/stages");
}

export async function syncPipedriveDeal(payload) {
  return api("/pipedrive/deals/sync", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

export async function addPipedriveDealNote(dealId, content) {
  return api(`/pipedrive/deals/${encodeURIComponent(dealId)}/note`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content })
  });
}

export async function uploadPipedriveDealFile(dealId, blob, filename) {
  const form = new FormData();
  form.append("file", blob, filename);
  form.append("dealId", String(dealId));
  return api(`/pipedrive/deals/${encodeURIComponent(dealId)}/file`, {
    method: "POST",
    body: form
  });
}

export async function loadPipedriveDealContext(dealId){return api(`/pipedrive/deals/${encodeURIComponent(dealId)}/context`);}
export async function loadLexwareCustomerHistory(params={}){const q=new URLSearchParams();if(params.contactId)q.set("contactId",params.contactId);if(params.email)q.set("email",params.email);if(params.name)q.set("name",params.name);return api(`/lexware/customer-history?${q.toString()}`);}
