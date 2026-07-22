import { state, saveState } from "./storage.js";

function config() {
  return {
    url: String(state.settings.workerUrl || "").trim().replace(/\/+$/, ""),
    secret: String(state.settings.appSecret || "").trim()
  };
}

export function hasConnectionConfig() {
  const { url, secret } = config();
  return Boolean(url && secret);
}

export async function api(path, options = {}) {
  const { url, secret } = config();
  if (!url || !secret) throw new Error("Zugangsdaten fehlen.");

  const response = await fetch(url + path, {
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
    const response = await fetch(url + "/");
    const data = await response.json();
    result.cloudflare = Boolean(response.ok && data.ok);
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
