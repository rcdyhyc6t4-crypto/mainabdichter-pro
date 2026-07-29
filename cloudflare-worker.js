// mainabdichter PRO Cloudflare Worker V32.21.0
// Pipedrive-Personen-, Adress- und Baustellen-Synchronisation.
// postal_address wird nicht mehr unzulässig an API v2 gesendet.

const LEXWARE_API = "https://api.lexware.io/v1";
const GOOGLE_DRIVE_API = "https://www.googleapis.com/drive/v3";
const DROPBOX_API = "https://api.dropboxapi.com/2";
const MICROSOFT_GRAPH_API = "https://graph.microsoft.com/v1.0";

// Cache pro Worker-Instanz für das konfigurierte Pipedrive-Adressfeld.
let pipedrivePersonAddressFieldCache = null;
let pipedriveDealFieldSchemaCache = null;
let pipedrivePersonFieldSchemaCache = null;

const FLOOR_PLAN_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["canvas_width", "canvas_height", "rotation_degrees", "source_coordinate_system", "quality", "walls", "openings", "uncertain_items"],
  properties: {
    canvas_width: { type: "number" },
    canvas_height: { type: "number" },
    rotation_degrees: { type: "number" },
    source_coordinate_system: { type: "boolean" },
    quality: {
      type: "object",
      additionalProperties: false,
      required: ["score", "alignment_score", "perspective_corrected", "folds_detected", "dimensions_cross_checked"],
      properties: {
        score: { type: "number" },
        alignment_score: { type: "number" },
        perspective_corrected: { type: "boolean" },
        folds_detected: { type: "boolean" },
        dimensions_cross_checked: { type: "boolean" }
      }
    },
    walls: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "source_line_id", "label", "x1", "y1", "x2", "y2", "length_m", "thickness_cm", "confidence"],
        properties: {
          id: { type: "string" },
          source_line_id: { type: "string" },
          label: { type: "string" },
          x1: { type: "number" },
          y1: { type: "number" },
          x2: { type: "number" },
          y2: { type: "number" },
          length_m: { type: "number" },
          thickness_cm: { type: "number" },
          confidence: { type: "number" }
        }
      }
    },
    openings: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["type", "wall_id", "position", "width_m", "confidence"],
        properties: {
          type: { type: "string", enum: ["door", "window", "unknown"] },
          wall_id: { type: "string" },
          position: { type: "number" },
          width_m: { type: "number" },
          confidence: { type: "number" }
        }
      }
    },
    uncertain_items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["wall_id", "question", "suggested_value"],
        properties: {
          wall_id: { type: "string" },
          question: { type: "string" },
          suggested_value: { type: "number" }
        }
      }
    }
  }
};

function responseOutputText(data) {
  if (typeof data?.output_text === "string") return data.output_text;
  for (const item of data?.output || []) {
    for (const content of item?.content || []) {
      if (typeof content?.text === "string") return content.text;
    }
  }
  return "";
}

function parseFloorPlanOutput(data) {
  const raw = responseOutputText(data).trim();
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "");
  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");
  if (firstBrace < 0 || lastBrace <= firstBrace) {
    throw new Error("Die KI-Antwort enthält keine lesbare Plangeometrie.");
  }
  return JSON.parse(cleaned.slice(firstBrace, lastBrace + 1));
}

async function requestFloorPlanAnalysis(env, image, model, strict, prompt) {
  const body = {
    model,
    reasoning: { effort: "low" },
    max_output_tokens: 12000,
    input: [{
      role: "user",
      content: [
        {
          type: "input_text",
          text: strict
            ? prompt
            : `${prompt} Antworte ausschließlich mit einem gültigen JSON-Objekt entsprechend der beschriebenen Felder, ohne Markdown und ohne zusätzlichen Text.`
        },
        { type: "input_image", image_url: image, detail: "high" }
      ]
    }]
  };
  if (strict) {
    body.text = {
      format: {
        type: "json_schema",
        name: "mainabdichter_floor_plan",
        strict: true,
        schema: FLOOR_PLAN_SCHEMA
      }
    };
  }
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${env.OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data?.error?.message || `OpenAI-Analyse mit ${model} fehlgeschlagen.`);
    error.status = response.status || 502;
    error.details = { model, strict, openai: data?.error || data };
    throw error;
  }
  return parseFloorPlanOutput(data);
}

async function analyzeFloorPlan(env, image, imageWidth, imageHeight, lineCandidates) {
  if (!env.OPENAI_API_KEY) {
    const error = new Error("Die KI-Grundrisserkennung ist im Worker noch nicht freigeschaltet. OPENAI_API_KEY fehlt.");
    error.status = 503;
    throw error;
  }
  if (!/^data:image\/(jpeg|jpg|png|webp);base64,/i.test(String(image || ""))) {
    const error = new Error("Es wurde kein gültiges Grundrissfoto übertragen.");
    error.status = 400;
    throw error;
  }
  if (String(image).length > 14 * 1024 * 1024) {
    const error = new Error("Das Grundrissfoto ist zu groß.");
    error.status = 413;
    throw error;
  }
  imageWidth = Math.round(Number(imageWidth));
  imageHeight = Math.round(Number(imageHeight));
  if (!(imageWidth > 0 && imageHeight > 0 && imageWidth <= 5000 && imageHeight <= 5000)) {
    const error = new Error("Die Bildabmessungen des Grundrissfotos fehlen oder sind ungültig.");
    error.status = 400;
    throw error;
  }
  lineCandidates = Array.isArray(lineCandidates) ? lineCandidates.filter(candidate =>
    typeof candidate?.id === "string" &&
    [candidate.x1,candidate.y1,candidate.x2,candidate.y2].every(value => Number.isFinite(value) && value >= 0 && value <= 1)
  ).slice(0,180) : [];
  if (lineCandidates.length < 4) {
    const error = new Error("Die technische Linienerkennung hat zu wenige Kandidaten geliefert.");
    error.status = 422;
    throw error;
  }
  const candidateText = JSON.stringify(lineCandidates);
  const prompt = [
    "Analysiere ausschließlich den hochgeladenen Gebäudegrundriss.",
    `Das übertragene Originalbild ist exakt ${imageWidth} Pixel breit und ${imageHeight} Pixel hoch.`,
    "Erfinde keine Raumaufteilung, ergänze keine nicht sichtbaren Wände und vereinfache den Plan nicht zu einem allgemeinen Rechteck.",
    "WICHTIG: Die App hat aus den Bildpixeln bereits echte dunkle Linien ermittelt. Du darfst ausschließlich Einträge aus dieser Kandidatenliste als Wände auswählen.",
    `Linienkandidaten: ${candidateText}`,
    "source_line_id muss exakt die id eines Kandidaten enthalten. Übernimm dessen x1,y1,x2,y2 unverändert. Erfinde, verschiebe, verlängere oder begradige keine Linie.",
    "Wähle aus den Kandidaten nur tatsächliche massive Wände aus, keine Maßlinien, Schriftlinien, Blattränder, Möbel oder Treppenstufen.",
    "Nutze Wandstärken, Türen und Fenster zur Erkennung, aber rekonstruiere keine idealisierte Ersatzgeometrie.",
    "Gedruckte oder handschriftlich eingetragene Maße sind verbindlicher als Pixellängen.",
    "Gib jede gerade sichtbare Wandstrecke als eigenes Segment zurück. Koordinaten x1,y1,x2,y2 liegen normiert zwischen 0 und 1 bezogen auf das unveränderte Originalbild: links=0, rechts=1, oben=0, unten=1.",
    `Setze canvas_width exakt auf ${imageWidth}, canvas_height exakt auf ${imageHeight} und source_coordinate_system zwingend auf true.`,
    "length_m ist die maßstäbliche Wandlänge. thickness_cm ist die erkennbare Wandstärke.",
    "Wenn ein zwingendes Maß nicht zuverlässig lesbar ist, nicht raten: confidence reduzieren und uncertain_items ergänzen.",
    "quality.alignment_score beschreibt ausschließlich, wie sicher sämtliche zurückgegebenen Segmente pixelgenau über den sichtbaren Originalwänden liegen. Bei auch nur einer erfundenen oder deutlich versetzten Wand muss der Wert unter 0.82 liegen.",
    "quality.score beschreibt die geometrische Gesamtzuverlässigkeit von 0 bis 1. perspective_corrected muss false sein, weil die Koordinaten ausdrücklich im Originalbild bleiben."
  ].join(" ");
  const configuredModel = String(env.OPENAI_VISION_MODEL || "gpt-5.6-luna").trim();
  const attempts = [
    { model: configuredModel, strict: true },
    { model: configuredModel, strict: false }
  ];
  if (configuredModel !== "gpt-5.6-terra") {
    attempts.push({ model: "gpt-5.6-terra", strict: true });
  }
  let plan = null;
  const failures = [];
  for (const attempt of attempts) {
    try {
      plan = await requestFloorPlanAnalysis(env, image, attempt.model, attempt.strict, prompt);
      if (plan && Array.isArray(plan.walls) && plan.walls.length) break;
      failures.push(`${attempt.model}: keine Wände`);
      plan = null;
    } catch (error) {
      failures.push(`${attempt.model}${attempt.strict ? " strukturiert" : " tolerant"}: ${error.message}`);
    }
  }
  if (!plan) {
    const error = new Error("Die KI konnte aus diesem Foto noch keinen zeichnungsfähigen Grundriss erzeugen.");
    error.status = 422;
    error.details = { code: "FLOOR_PLAN_ANALYSIS_FAILED", attempts: failures };
    throw error;
  }
  plan.canvas_width = imageWidth;
  plan.canvas_height = imageHeight;
  plan.quality ||= {
    score: 0.5,
    alignment_score: 0,
    perspective_corrected: false,
    folds_detected: false,
    dimensions_cross_checked: false
  };
  plan.walls = (plan.walls || []).filter(wall =>
    [wall.x1, wall.y1, wall.x2, wall.y2].every(value => Number.isFinite(value) && value >= 0 && value <= 1)
  );
  const candidateMap = new Map(lineCandidates.map(candidate => [candidate.id,candidate]));
  let invalidCandidate=false;
  plan.walls = plan.walls.map(wall => {
    const candidate=candidateMap.get(wall.source_line_id);
    if(!candidate){ invalidCandidate=true; return null; }
    return {...wall,x1:candidate.x1,y1:candidate.y1,x2:candidate.x2,y2:candidate.y2};
  }).filter(Boolean);
  if (plan.source_coordinate_system !== true || invalidCandidate) {
    const error = new Error("Die erkannten Linien sind nicht ausreichend deckungsgleich mit dem Originalfoto. Das Ergebnis wurde aus Sicherheitsgründen verworfen.");
    error.status = 422;
    error.details = { code: "FLOOR_PLAN_ALIGNMENT_REJECTED" };
    throw error;
  }
  plan.quality.alignment_score = 1;
  if (!plan.walls.length) {
    const error = new Error("Auf dem Foto konnten keine ausreichend sicheren Wände erkannt werden.");
    error.status = 422;
    throw error;
  }
  return plan;
}

function corsHeaders(request) {
  const origin = request.headers.get("Origin") || "*";

  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-App-Secret",
    "Content-Type": "application/json; charset=utf-8",
  };
}

function jsonResponse(request, body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: corsHeaders(request),
  });
}

async function googleAccessToken(env) {
  const required = ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_REFRESH_TOKEN"];
  const missing = required.filter(key => !env[key]);
  if (missing.length) {
    const error = new Error(`Google Drive ist noch nicht vollständig eingerichtet (${missing.join(", ")}).`);
    error.status = 503;
    throw error;
  }
  const body = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    client_secret: env.GOOGLE_CLIENT_SECRET,
    refresh_token: env.GOOGLE_REFRESH_TOKEN,
    grant_type: "refresh_token"
  });
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body
  });
  const data = await response.json();
  if (!response.ok || !data.access_token) {
    const error = new Error("Google-Drive-Anmeldung konnte nicht erneuert werden.");
    error.status = response.status || 500;
    error.details = data;
    throw error;
  }
  return data.access_token;
}

async function gmailAccessToken(env) {
  const refreshToken = env.GMAIL_REFRESH_TOKEN || env.GOOGLE_REFRESH_TOKEN;
  const required = ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"];
  const missing = required.filter(key => !env[key]);
  if (!refreshToken) missing.push("GMAIL_REFRESH_TOKEN");
  if (missing.length) {
    const error = new Error(`Gmail-Lesezugriff ist noch nicht eingerichtet (${missing.join(", ")}).`);
    error.status = 503;
    throw error;
  }
  return oauthRefreshToken("https://oauth2.googleapis.com/token", {
    client_id: env.GOOGLE_CLIENT_ID,
    client_secret: env.GOOGLE_CLIENT_SECRET,
    refresh_token: refreshToken,
    grant_type: "refresh_token"
  }, "Gmail");
}

function decodeGmailText(value) {
  if (!value) return "";
  const normalized = String(value).replace(/-/g, "+").replace(/_/g, "/");
  try {
    const bytes = Uint8Array.from(atob(normalized), char => char.charCodeAt(0));
    return new TextDecoder("utf-8").decode(bytes);
  } catch {
    return "";
  }
}

function gmailMessageText(payload) {
  if (!payload) return "";
  if (payload.mimeType === "text/plain" && payload.body?.data) {
    return decodeGmailText(payload.body.data);
  }
  const parts = Array.isArray(payload.parts) ? payload.parts : [];
  const plain = parts.map(gmailMessageText).filter(Boolean).join("\n");
  if (plain) return plain;
  if (payload.body?.data) {
    return decodeGmailText(payload.body.data)
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&");
  }
  return "";
}

async function gmailRequest(env, path) {
  const token = await gmailAccessToken(env);
  const response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me${path}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(
      response.status === 403
        ? "Gmail ist verbunden, aber der einmalige Lesezugriff gmail.readonly fehlt."
        : "Gmail konnte nicht gelesen werden."
    );
    error.status = response.status;
    error.details = data;
    throw error;
  }
  return data;
}

function openPlzRegexPrefix(value) {
  const clean = cleanText(value).slice(0, 80);
  if (!clean) return "";
  return `^${clean.replace(/[.^$*+?()[\]{}|\\]/g, "\\$&")}.*`;
}

async function openPlzRequest(path, params = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (cleanText(value)) query.set(key, cleanText(value));
  });
  query.set("page", "1");
  query.set("pageSize", "25");
  const response = await fetch(`https://openplzapi.org/de/${path}?${query.toString()}`, {
    headers: { Accept: "application/json" }
  });
  const data = await response.json().catch(() => []);
  if (!response.ok) {
    const error = new Error("Die deutsche Adressprüfung ist derzeit nicht erreichbar.");
    error.status = response.status || 502;
    error.details = data;
    throw error;
  }
  return Array.isArray(data) ? data : [];
}

async function googleDriveRequest(env, path, options = {}) {
  const token = await googleAccessToken(env);
  const response = await fetch(`${GOOGLE_DRIVE_API}${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, ...(options.headers || {}) }
  });
  if (options.raw && response.ok) return response;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error("Google Drive API Fehler");
    error.status = response.status;
    error.details = data;
    throw error;
  }
  return data;
}

async function oauthRefreshToken(url, values, label) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(values)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) {
    const error = new Error(`${label}-Anmeldung konnte nicht erneuert werden.`);
    error.status = response.status || 500;
    error.details = data;
    throw error;
  }
  return data.access_token;
}

async function dropboxAccessToken(env) {
  const missing = ["DROPBOX_APP_KEY", "DROPBOX_APP_SECRET", "DROPBOX_REFRESH_TOKEN"].filter(key => !env[key]);
  if (missing.length) {
    const error = new Error(`Dropbox ist noch nicht eingerichtet (${missing.join(", ")}).`);
    error.status = 503;
    throw error;
  }
  return oauthRefreshToken("https://api.dropboxapi.com/oauth2/token", {
    grant_type: "refresh_token",
    refresh_token: env.DROPBOX_REFRESH_TOKEN,
    client_id: env.DROPBOX_APP_KEY,
    client_secret: env.DROPBOX_APP_SECRET
  }, "Dropbox");
}

async function oneDriveAccessToken(env) {
  const missing = ["MS_CLIENT_ID", "MS_CLIENT_SECRET", "MS_REFRESH_TOKEN"].filter(key => !env[key]);
  if (missing.length) {
    const error = new Error(`OneDrive ist noch nicht eingerichtet (${missing.join(", ")}).`);
    error.status = 503;
    throw error;
  }
  const tenant = env.MS_TENANT_ID || "common";
  return oauthRefreshToken(`https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/token`, {
    client_id: env.MS_CLIENT_ID,
    client_secret: env.MS_CLIENT_SECRET,
    refresh_token: env.MS_REFRESH_TOKEN,
    grant_type: "refresh_token",
    scope: "offline_access Files.Read User.Read"
  }, "OneDrive");
}

async function dropboxRequest(env, path, body = {}) {
  const token = await dropboxAccessToken(env);
  const response = await fetch(`${DROPBOX_API}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error("Dropbox API Fehler");
    error.status = response.status;
    error.details = data;
    throw error;
  }
  return data;
}

async function oneDriveRequest(env, path) {
  const token = await oneDriveAccessToken(env);
  const response = await fetch(`${MICROSOFT_GRAPH_API}${path}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error("OneDrive API Fehler");
    error.status = response.status;
    error.details = data;
    throw error;
  }
  return data;
}

async function listMigrationItems(env, source, container = "", cursor = "") {
  if (source === "dropbox") {
    const data = cursor
      ? await dropboxRequest(env, "/files/list_folder/continue", { cursor })
      : await dropboxRequest(env, "/files/list_folder", {
          path: container || "",
          recursive: false,
          include_deleted: false,
          limit: 500
        });
    return {
      items: (data.entries || []).map(item => ({
        id: item.id || item.path_lower,
        name: item.name,
        path: item.path_lower,
        kind: item[".tag"] === "folder" ? "folder" : "file",
        size: Number(item.size || 0),
        mimeType: "application/octet-stream"
      })),
      cursor: data.has_more ? data.cursor : ""
    };
  }
  const endpoint = cursor
    ? cursor.replace(MICROSOFT_GRAPH_API, "")
    : container
      ? `/me/drive/items/${encodeURIComponent(container)}/children?$top=200`
      : "/me/drive/root/children?$top=200";
  const data = await oneDriveRequest(env, endpoint);
  return {
    items: (data.value || []).map(item => ({
      id: item.id,
      name: item.name,
      path: item.parentReference?.path || "",
      kind: item.folder ? "folder" : "file",
      size: Number(item.size || 0),
      mimeType: item.file?.mimeType || "application/octet-stream"
    })),
    cursor: data["@odata.nextLink"] || ""
  };
}

async function findDriveFile(env, name, parentId, size) {
  const q = [
    `name='${driveQueryText(name)}'`,
    `'${driveQueryText(parentId)}' in parents`,
    "trashed=false"
  ].join(" and ");
  const data = await googleDriveRequest(
    env,
    `/files?q=${encodeURIComponent(q)}&fields=files(id,name,size,mimeType,webViewLink)&pageSize=10`
  );
  return (data.files || []).find(file => Number(file.size || 0) === Number(size || 0)) || null;
}

async function migrationDownload(env, source, itemId, itemPath) {
  if (source === "dropbox") {
    const token = await dropboxAccessToken(env);
    return fetch("https://content.dropboxapi.com/2/files/download", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Dropbox-API-Arg": JSON.stringify({ path: itemPath || itemId })
      }
    });
  }
  const token = await oneDriveAccessToken(env);
  return fetch(`${MICROSOFT_GRAPH_API}/me/drive/items/${encodeURIComponent(itemId)}/content`, {
    headers: { Authorization: `Bearer ${token}` },
    redirect: "follow"
  });
}

async function uploadMigrationFile(env, source, item, parentId) {
  const existing = await findDriveFile(env, item.name, parentId, item.size);
  if (existing) return { ...existing, skipped: true };
  const download = await migrationDownload(env, source, item.id, item.path);
  if (!download.ok || !download.body) {
    const error = new Error(`${source === "dropbox" ? "Dropbox" : "OneDrive"}-Download fehlgeschlagen.`);
    error.status = download.status || 502;
    throw error;
  }
  const token = await googleAccessToken(env);
  const mimeType = item.mimeType || download.headers.get("Content-Type") || "application/octet-stream";
  const session = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,name,size,mimeType,webViewLink",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Type": mimeType,
        ...(item.size ? { "X-Upload-Content-Length": String(item.size) } : {})
      },
      body: JSON.stringify({
        name: item.name,
        parents: [parentId],
        appProperties: { source, sourceId: String(item.id || ""), migratedBy: "mainabdichter-pro" }
      })
    }
  );
  if (!session.ok) {
    const error = new Error("Google-Drive-Upload konnte nicht gestartet werden.");
    error.status = session.status;
    error.details = await session.json().catch(() => ({}));
    throw error;
  }
  const uploadUrl = session.headers.get("Location");
  const uploaded = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": mimeType,
      ...(item.size ? { "Content-Length": String(item.size) } : {})
    },
    body: download.body
  });
  const data = await uploaded.json().catch(() => ({}));
  if (!uploaded.ok) {
    const error = new Error("Datei konnte nicht nach Google Drive kopiert werden.");
    error.status = uploaded.status;
    error.details = data;
    throw error;
  }
  return { ...data, skipped: false };
}

function driveQueryText(value) {
  return String(value || "").replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

async function ensureDriveFolder(env, name, parentId = "root") {
  const q = [
    `name='${driveQueryText(name)}'`,
    "mimeType='application/vnd.google-apps.folder'",
    `'${driveQueryText(parentId)}' in parents`,
    "trashed=false"
  ].join(" and ");
  const found = await googleDriveRequest(env, `/files?q=${encodeURIComponent(q)}&fields=files(id,name,webViewLink)&pageSize=1`);
  if (found.files?.[0]) return found.files[0];
  return googleDriveRequest(env, "/files?fields=id,name,webViewLink", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, mimeType: "application/vnd.google-apps.folder", parents: [parentId] })
  });
}

async function uploadDrivePhoto(env, file, metadata) {
  let parent = await ensureDriveFolder(env, "mainabdichter PRO");
  for (const name of ["Kunden", metadata.customerFolder, metadata.visitFolder, "Fotos", metadata.areaFolder]) {
    parent = await ensureDriveFolder(env, name, parent.id);
  }
  const token = await googleAccessToken(env);
  const boundary = `mainabdichter_${crypto.randomUUID()}`;
  const fileMetadata = JSON.stringify({
    name: metadata.filename || file.name || "Besichtigungsfoto.jpg",
    parents: [parent.id],
    appProperties: { photoId: String(metadata.photoId || ""), source: "mainabdichter-pro" }
  });
  const body = new Blob([
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${fileMetadata}\r\n`,
    `--${boundary}\r\nContent-Type: ${file.type || metadata.mimeType || "image/jpeg"}\r\n\r\n`,
    file,
    `\r\n--${boundary}--`
  ]);
  const response = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,webViewLink,parents", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": `multipart/related; boundary=${boundary}` },
    body
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error("Google-Drive-Fotoupload fehlgeschlagen.");
    error.status = response.status;
    error.details = data;
    throw error;
  }
  return data;
}

async function uploadDriveDocument(env, file, metadata) {
  let parent = await ensureDriveFolder(env, "mainabdichter PRO");
  for (const name of ["Kunden", metadata.customerFolder, metadata.visitFolder, metadata.categoryFolder || "Sonstige Dokumente"]) {
    parent = await ensureDriveFolder(env, name, parent.id);
  }
  const token = await googleAccessToken(env);
  const boundary = `mainabdichter_${crypto.randomUUID()}`;
  const fileMetadata = JSON.stringify({
    name: metadata.filename || file.name || "Dokument",
    parents: [parent.id],
    description: metadata.note || "",
    appProperties: {
      documentId: String(metadata.documentId || ""),
      category: String(metadata.category || "Sonstiges"),
      source: "mainabdichter-pro"
    }
  });
  const body = new Blob([
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${fileMetadata}\r\n`,
    `--${boundary}\r\nContent-Type: ${file.type || metadata.mimeType || "application/octet-stream"}\r\n\r\n`,
    file,
    `\r\n--${boundary}--`
  ]);
  const response = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,webViewLink,parents", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": `multipart/related; boundary=${boundary}` },
    body
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error("Google-Drive-Dateiupload fehlgeschlagen.");
    error.status = response.status;
    error.details = data;
    throw error;
  }
  return data;
}

function backupProtectionStats(payload) {
  const listLength = key => Array.isArray(payload?.[key]) ? payload[key].length : 0;
  return {
    bytes: new TextEncoder().encode(JSON.stringify(payload || {})).byteLength,
    customers: listLength("customers"),
    archive: listLength("archive"),
    worksites: listLength("worksites"),
    notes: listLength("communicationNotes")
  };
}

function assertBackupCannotCollapse(currentPayload, incomingPayload) {
  if (!currentPayload || typeof currentPayload !== "object") return;
  const current = backupProtectionStats(currentPayload);
  const incoming = backupProtectionStats(incomingPayload);
  const losses = [];

  // Ein Absturz, eine leere Geräteablage oder eine fehlerhafte Migration darf
  // niemals den vollständigen Firmenbestand ersetzen.
  if (current.bytes >= 100000 && incoming.bytes < current.bytes * 0.65) {
    losses.push(`Dateigröße ${current.bytes} → ${incoming.bytes} Bytes`);
  }
  for (const key of ["customers", "archive", "worksites", "notes"]) {
    const before = current[key];
    const after = incoming[key];
    const allowedLoss = Math.max(2, Math.ceil(before * 0.1));
    if (before >= 5 && after < before - allowedLoss) {
      losses.push(`${key} ${before} → ${after}`);
    }
  }

  if (!losses.length) return;
  const error = new Error(
    "Sicherheitsstopp: Ein unvollständiger Gerätestand darf die zentrale Datensicherung nicht überschreiben."
  );
  error.status = 422;
  error.details = {
    protection: "backup-collapse-blocked",
    losses,
    current,
    incoming
  };
  throw error;
}

async function createDriveSafetySnapshot(env, currentFile, backupsFolderId) {
  if (!currentFile?.id) return null;
  const snapshots = await ensureDriveFolder(env, "Sicherheitskopien", backupsFolderId);
  const q = [
    "appProperties has { key='backupType' and value='mainabdichter-pro-safety' }",
    `'${driveQueryText(snapshots.id)}' in parents`,
    "trashed=false"
  ].join(" and ");
  const existing = await googleDriveRequest(
    env,
    `/files?q=${encodeURIComponent(q)}&orderBy=createdTime desc&fields=files(id,createdTime)&pageSize=1`
  );
  const latest = existing.files?.[0];
  const latestAge = latest?.createdTime
    ? Date.now() - new Date(latest.createdTime).getTime()
    : Number.POSITIVE_INFINITY;
  if (latestAge < 60 * 60 * 1000) return latest;

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return googleDriveRequest(
    env,
    `/files/${encodeURIComponent(currentFile.id)}/copy?fields=id,name,createdTime,webViewLink`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=UTF-8" },
      body: JSON.stringify({
        name: `mainabdichter-PRO-Sicherheitskopie-${stamp}.json`,
        parents: [snapshots.id],
        appProperties: {
          backupType: "mainabdichter-pro-safety",
          sourceFileId: currentFile.id,
          source: "mainabdichter-pro"
        }
      })
    }
  );
}

async function saveDriveBackup(env, payload, expectedRemoteModifiedTime = "") {
  const parent = await ensureDriveFolder(env, "mainabdichter PRO");
  const backups = await ensureDriveFolder(env, "Datensicherung", parent.id);
  const q = [
    "appProperties has { key='backupKey' and value='mainabdichter-pro-current' }",
    `'${driveQueryText(backups.id)}' in parents`,
    "trashed=false"
  ].join(" and ");
  const existing = await googleDriveRequest(
    env,
    `/files?q=${encodeURIComponent(q)}&fields=files(id,name,modifiedTime)&pageSize=1`
  );
  const currentFile = existing.files?.[0] || null;
  const fileId = currentFile?.id || "";
  if (
    expectedRemoteModifiedTime &&
    currentFile?.modifiedTime &&
    currentFile.modifiedTime !== expectedRemoteModifiedTime
  ) {
    const error = new Error("Die zentrale Datensicherung wurde inzwischen auf einem anderen Gerät geändert.");
    error.status = 409;
    error.details = {
      expectedRemoteModifiedTime,
      currentRemoteModifiedTime: currentFile.modifiedTime
    };
    throw error;
  }
  if (fileId) {
    const currentResponse = await googleDriveRequest(
      env,
      `/files/${encodeURIComponent(fileId)}?alt=media`,
      { raw: true }
    );
    const currentPayload = await currentResponse.json().catch(() => null);
    assertBackupCannotCollapse(currentPayload, payload);
    await createDriveSafetySnapshot(env, currentFile, backups.id);
  }
  const token = await googleAccessToken(env);
  const boundary = `mainabdichter_backup_${crypto.randomUUID()}`;
  const metadata = JSON.stringify({
    name: "mainabdichter-PRO-aktuelle-Datensicherung.json",
    ...(fileId ? {} : { parents: [backups.id] }),
    appProperties: {
      backupKey: "mainabdichter-pro-current",
      source: "mainabdichter-pro"
    }
  });
  const file = new Blob([JSON.stringify(payload)], { type: "application/json" });
  const body = new Blob([
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n`,
    `--${boundary}\r\nContent-Type: application/json\r\n\r\n`,
    file,
    `\r\n--${boundary}--`
  ]);
  const endpoint = fileId
    ? `https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(fileId)}?uploadType=multipart&fields=id,name,modifiedTime,webViewLink`
    : "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,modifiedTime,webViewLink";
  const response = await fetch(endpoint, {
    method: fileId ? "PATCH" : "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": `multipart/related; boundary=${boundary}`
    },
    body
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error("Automatische Google-Drive-Datensicherung fehlgeschlagen.");
    error.status = response.status;
    error.details = data;
    throw error;
  }
  return data;
}

async function loadDriveBackup(env) {
  const parent = await ensureDriveFolder(env, "mainabdichter PRO");
  const backups = await ensureDriveFolder(env, "Datensicherung", parent.id);
  const q = [
    "appProperties has { key='backupKey' and value='mainabdichter-pro-current' }",
    `'${driveQueryText(backups.id)}' in parents`,
    "trashed=false"
  ].join(" and ");
  const existing = await googleDriveRequest(
    env,
    `/files?q=${encodeURIComponent(q)}&fields=files(id,name,modifiedTime)&pageSize=1`
  );
  const file = existing.files?.[0];
  if (!file?.id) return null;
  const response = await googleDriveRequest(
    env,
    `/files/${encodeURIComponent(file.id)}?alt=media`,
    { raw: true }
  );
  const payload = await response.json().catch(() => null);
  if (!payload || typeof payload !== "object") {
    const error = new Error("Die Google-Drive-Datensicherung ist ungültig.");
    error.status = 500;
    throw error;
  }
  return { payload, file };
}

function getPipedriveDomain(env) {
  const raw = String(env.PIPEDRIVE_COMPANY_DOMAIN || "")
    .trim()
    .replace(/^https?:\/\//, "")
    .replace(/\.pipedrive\.com.*$/, "");

  if (!raw) {
    throw new Error("PIPEDRIVE_COMPANY_DOMAIN fehlt.");
  }

  return raw;
}

async function pipedriveRequest(env, path, options = {}) {
  const domain = getPipedriveDomain(env);
  const separator = path.includes("?") ? "&" : "?";

  const url =
    `https://${domain}.pipedrive.com${path}` +
    `${separator}api_token=${encodeURIComponent(env.PIPEDRIVE_API_TOKEN)}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {}),
    },
  });

  const data = await response.json();

  if (!response.ok || data.success === false) {
    const error = new Error("Pipedrive API Fehler");
    error.status = response.status || 500;
    error.details = data;
    throw error;
  }

  return data;
}

async function lexwareRequest(env, path, options = {}) {
  const response = await fetch(`${LEXWARE_API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${env.LEXOFFICE_API_KEY}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
  });

  const text = await response.text();

  let data = null;

  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }

  if (!response.ok) {
    let message = "Lexoffice API Fehler";

    if (response.status === 401) {
      message = "Lexoffice API-Key ungültig oder abgelaufen";
    } else if (response.status === 403) {
      message = "Lexoffice API-Key hat keine Berechtigung für Angebote";
    } else if (response.status === 404) {
      message = "Lexoffice-Ressource nicht gefunden";
    } else if (response.status === 406) {
      message = "Lexoffice hat die Angebotsdaten abgelehnt";
    } else if (response.status === 429) {
      message = "Lexoffice-Anfragelimit erreicht";
    }

    const error = new Error(message);
    error.status = response.status;
    error.details = data;
    throw error;
  }

  return data;
}

function firstValue(value) {
  if (Array.isArray(value)) {
    const item =
      value.find((entry) => entry && (entry.primary || entry.value)) ||
      value[0];

    return item ? item.value || item : "";
  }

  return value || "";
}

function splitName(fullName) {
  const parts = String(fullName || "")
    .trim()
    .split(/\s+/);

  return {
    firstName: parts.length > 1 ? parts.slice(0, -1).join(" ") : "",
    lastName: parts.length ? parts[parts.length - 1] : "",
  };
}

function cleanText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

const BUSINESS_TIME_ZONE = "Europe/Berlin";

function dateTimePartsInZone(date, timeZone = BUSINESS_TIME_ZONE) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);
  return Object.fromEntries(
    parts
      .filter(part => part.type !== "literal")
      .map(part => [part.type, part.value])
  );
}

function utcActivityTimeToBerlin(dueDate, dueTime) {
  const date = cleanText(dueDate);
  const time = cleanText(dueTime).slice(0, 5);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) {
    return { dueDate: date, dueTime: time };
  }
  const instant = new Date(`${date}T${time}:00Z`);
  if (Number.isNaN(instant.getTime())) return { dueDate: date, dueTime: time };
  const parts = dateTimePartsInZone(instant);
  return {
    dueDate: `${parts.year}-${parts.month}-${parts.day}`,
    dueTime: `${parts.hour}:${parts.minute}`
  };
}

function timeZoneOffsetMs(instant, timeZone = BUSINESS_TIME_ZONE) {
  const parts = dateTimePartsInZone(instant, timeZone);
  const representedAsUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second)
  );
  return representedAsUtc - instant.getTime();
}

function berlinActivityTimeToUtc(dueDate, dueTime) {
  const date = cleanText(dueDate);
  const time = cleanText(dueTime).slice(0, 5);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) {
    const error = new Error("Datum oder Uhrzeit ist ungültig.");
    error.status = 400;
    throw error;
  }
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const localAsUtc = Date.UTC(year, month - 1, day, hour, minute, 0);
  let instantMs = localAsUtc - timeZoneOffsetMs(new Date(localAsUtc));
  instantMs = localAsUtc - timeZoneOffsetMs(new Date(instantMs));
  const instant = new Date(instantMs);
  const roundTrip = dateTimePartsInZone(instant);
  const roundTripDate = `${roundTrip.year}-${roundTrip.month}-${roundTrip.day}`;
  const roundTripTime = `${roundTrip.hour}:${roundTrip.minute}`;
  if (roundTripDate !== date || roundTripTime !== time) {
    const error = new Error(
      "Diese Uhrzeit existiert wegen der Zeitumstellung in Europe/Berlin nicht."
    );
    error.status = 400;
    throw error;
  }
  return {
    dueDate: instant.toISOString().slice(0, 10),
    dueTime: instant.toISOString().slice(11, 16)
  };
}

function formatAddress({ street = "", zip = "", city = "" } = {}) {
  const first = cleanText(street);
  const second = [cleanText(zip), cleanText(city)].filter(Boolean).join(" ");
  return [first, second].filter(Boolean).join(", ");
}

function splitGermanAddress(value) {
  const text = cleanText(value);
  if (!text) return {};
  const normalized = text.replace(/\n+/g, ", ");
  const match = normalized.match(/(?:^|,\s*|\s)(\d{5})\s+([^,]+)$/);
  if (!match) return { street: normalized, zip: "", city: "", formatted: normalized };
  const street = cleanText(normalized.slice(0, match.index).replace(/,\s*$/, ""));
  const zip = match[1];
  const city = cleanText(match[2]);
  return { street, zip, city, formatted: formatAddress({ street, zip, city }) };
}

function parseAddress(value) {
  if (!value) return {};

  // Pipedrive kann Kontaktadressen bei aktivierter Kontaktsynchronisation
  // als Array zurückliefern. Für die App wird die primäre bzw. erste Adresse verwendet.
  if (Array.isArray(value)) {
    const primary =
      value.find(entry => entry && (entry.primary === true || entry.value || entry.formatted_address)) ||
      value[0];
    if (!primary) return {};
    return parseAddress(primary.value || primary.formatted_address || primary);
  }

  if (typeof value === "string") return splitGermanAddress(value);
  if (typeof value !== "object") return splitGermanAddress(String(value));

  const street = cleanText(
    value.street ||
    value.street_address ||
    (value.route ? `${value.route} ${value.street_number || ""}` : "") ||
    value.address_line_1
  );
  const zip = cleanText(value.postal_code || value.zip || value.zip_code);
  const city = cleanText(value.locality || value.city || value.admin_area_level_2);
  const formatted =
    cleanText(
      value.formatted_address ||
      value.formatted ||
      value.address ||
      value.value
    ) || formatAddress({ street, zip, city });

  if ((!street || !zip || !city) && formatted) {
    const parsed = splitGermanAddress(formatted);
    return {
      ...parsed,
      ...(street ? { street } : {}),
      ...(zip ? { zip } : {}),
      ...(city ? { city } : {}),
      formatted
    };
  }

  return { street, zip, city, formatted };
}

function normalizePipedrivePerson(person) {
  const split = splitName(person.name);

  const customFields =
    person.custom_fields && typeof person.custom_fields === "object"
      ? person.custom_fields
      : {};

  const fieldSchema = Array.isArray(person._mainabdichter_field_schema)
    ? person._mainabdichter_field_schema
    : [];
  const allCustomFields = { ...customFields };
  fieldSchema.forEach(field => {
    if (allCustomFields[field.key] === undefined && person[field.key] !== undefined) {
      allCustomFields[field.key] = person[field.key];
    }
  });

  const fieldValue = field => {
    const raw = allCustomFields[field.key] ?? person[field.key];
    if (raw === null || raw === undefined || raw === "") return "";
    if (Array.isArray(raw)) {
      return raw.map(value => {
        const option = (field.options || []).find(item => String(item.id) === String(value?.id ?? value));
        return cleanText(option?.label || value?.label || value?.value || value);
      }).filter(Boolean).join(", ");
    }
    if (typeof raw === "object") return cleanText(raw.label || raw.value || raw.name || raw.address || raw.formatted_address);
    const option = (field.options || []).find(item => String(item.id) === String(raw));
    return cleanText(option?.label || raw);
  };

  const normalizedName = value => cleanText(value).toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ").trim();

  const findFieldValue = names => {
    const wanted = names.map(normalizedName);
    const field = fieldSchema.find(item => {
      const name = normalizedName(item.name);
      return wanted.some(value => name === value || name.includes(value));
    });
    return field ? fieldValue(field) : "";
  };

  const customFieldsByName = {};
  fieldSchema.forEach(field => {
    const value = fieldValue(field);
    if (value) customFieldsByName[field.name || field.key] = value;
  });

  const configuredAddressValue =
    person._mainabdichter_address_value ||
    person.mainabdichter_address ||
    "";

  const address = parseAddress(
    configuredAddressValue ||
    person.postal_address ||
    person.address
  );

  const postal = address.formatted || formatAddress(address);

  const phoneEntries = Array.isArray(person.phones)
    ? person.phones
    : person.phone
      ? (Array.isArray(person.phone) ? person.phone : [person.phone])
      : [];
  const phoneValue = entry => cleanText(
    typeof entry === "object" ? entry.value : entry
  );
  const mobileEntry = phoneEntries.find(entry =>
    /mobile|mobil|handy|whatsapp/i.test(cleanText(entry?.label))
  );
  const landlineEntry = phoneEntries.find(entry =>
    entry !== mobileEntry && phoneValue(entry)
  );
  const explicitObjectAddress = findFieldValue([
    "objektanschrift", "objektadresse", "object address", "baustellenadresse"
  ]) || cleanText(person.object_address || person.objectAddress);
  const salutationValue = findFieldValue([
    "anrede", "salutation", "geschlecht"
  ]);
  const salutation = /^frau\b/i.test(salutationValue)
    ? "Frau"
    : /^herr\b/i.test(salutationValue)
      ? "Herr"
      : /^firma\b/i.test(salutationValue)
        ? "Firma"
        : /^(frau|herr)\b/i.test(cleanText(person.name))
          ? cleanText(person.name).match(/^(frau|herr)\b/i)[1].replace(/^./, char => char.toUpperCase())
          : "";

  return {
    id: person.id,
    name: person.name || "",
    company: cleanText(person.org_name || person.organization?.name || person.org_id?.name),
    firstName: person.first_name || split.firstName,
    lastName: person.last_name || split.lastName,
    salutation,
    email: firstValue(person.emails || person.email),
    emails: (Array.isArray(person.emails) ? person.emails : Array.isArray(person.email) ? person.email : [person.email])
      .filter(Boolean).map(entry => typeof entry === "object" ? entry : { value: entry }),
    phone: phoneValue(landlineEntry || mobileEntry) || firstValue(person.phones || person.phone),
    mobile: phoneValue(mobileEntry),
    phones: phoneEntries,
    street: address.street || "",
    zip: address.zip || "",
    city: address.city || "",
    postalAddress: postal,
    objectAddress: explicitObjectAddress || postal,
    objectAddressDifferent: Boolean(
      explicitObjectAddress &&
      explicitObjectAddress !== postal
    ),
    inquirySource: findFieldValue(["quelle", "lead quelle", "anfragequelle", "source"]),
    ownerStatus: findFieldValue(["eigentuemer mieter", "eigentumer mieter", "eigentuemerstatus", "owner tenant"]),
    appointment: findFieldValue(["termin", "besichtigungstermin", "appointment"]),
    customFields: allCustomFields,
    customFieldsByName,
    pipedriveRaw: {
      label: person.label || "",
      ownerName: cleanText(person.owner_name || person.owner_id?.name),
      visibleTo: person.visible_to || "",
      marketingStatus: person.marketing_status || "",
      addTime: person.add_time || "",
      updateTime: person.update_time || ""
    }
  };
}

async function loadPipedrivePersonFieldSchema(env, force = false) {
  if (!force && pipedrivePersonFieldSchemaCache) return pipedrivePersonFieldSchemaCache;
  const result = await pipedriveRequest(env, "/api/v2/personFields?limit=500");
  pipedrivePersonFieldSchemaCache = (Array.isArray(result.data) ? result.data : []).map(field => ({
    id: field.id,
    key: cleanText(field.field_code || field.key),
    name: cleanText(field.field_name || field.name),
    type: cleanText(field.field_type || field.field_type_name || field.type).toLowerCase(),
    options: field.options || []
  })).filter(field => field.key);
  return pipedrivePersonFieldSchemaCache;
}

async function loadPipedrivePersonWithAllFields(env, id) {
  const schema = await loadPipedrivePersonFieldSchema(env);
  // Der v1-Detailabruf liefert sämtliche Standard- und benutzerdefinierten
  // Personenfelder in einer Antwort. Die Feldschemata sorgen anschließend
  // für verständliche Namen und Optionswerte.
  const result = await pipedriveRequest(env, `/api/v1/persons/${encodeURIComponent(id)}`);
  const raw = result.data || result;
  raw._mainabdichter_field_schema = schema;
  const addressField = await resolvePipedrivePersonAddressField(env);
  if (addressField && (raw.custom_fields?.[addressField] ?? raw[addressField]) !== undefined) {
    raw._mainabdichter_address_value = raw.custom_fields?.[addressField] ?? raw[addressField];
  }
  return normalizePipedrivePerson(raw);
}

async function resolvePipedrivePersonAddressField(env) {
  if (pipedrivePersonAddressFieldCache !== null) {
    return pipedrivePersonAddressFieldCache || null;
  }

  // Bevorzugt: exakte Feldkennung als Cloudflare-Variable setzen.
  // Beispiel: PIPEDRIVE_PERSON_ADDRESS_FIELD=012345...abcdef
  const configured = cleanText(env.PIPEDRIVE_PERSON_ADDRESS_FIELD);
  if (configured) {
    const validConfigured =
      /^[a-zA-Z0-9]{20,}$/.test(configured) &&
      !["postal_address", "address"].includes(configured.toLowerCase());

    pipedrivePersonAddressFieldCache =
      validConfigured ? configured : false;

    return pipedrivePersonAddressFieldCache || null;
  }

  try {
    const result = await pipedriveRequest(
      env,
      "/api/v2/personFields?limit=500"
    );

    const fields = Array.isArray(result.data) ? result.data : [];
    const preferredNames = [
      "postal_adress",
      "postal_address",
      "postal adress",
      "postanschrift",
      "anschrift",
      "adresse",
      "postal address",
      "address"
    ];

    const isWritableCustomFieldCode = value => {
      const key = cleanText(value);

      // Systemfelder wie "postal_address" sind keine zulässigen
      // Custom-Field-Schlüssel für custom_fields.
      if (!key) return false;
      if ([
        "postal_address",
        "address",
        "name",
        "email",
        "phone",
        "first_name",
        "last_name"
      ].includes(key.toLowerCase())) {
        return false;
      }

      // Pipedrive-Custom-Field-Codes sind üblicherweise lange
      // alphanumerische Kennungen. Kurze Systemnamen werden abgewiesen.
      return /^[a-zA-Z0-9]{20,}$/.test(key);
    };

    const addressFields = fields.filter(field => {
      const type = cleanText(
        field.field_type ||
        field.field_type_name ||
        field.type
      ).toLowerCase();

      const key = cleanText(
        field.field_code ||
        field.key
      );

      return type === "address" && isWritableCustomFieldCode(key);
    });

    const preferred = addressFields.find(field => {
      const name = cleanText(
        field.field_name ||
        field.name
      ).toLowerCase();
      return preferredNames.includes(name);
    });

    const selected =
      preferred ||
      (addressFields.length === 1 ? addressFields[0] : null);

    const key = cleanText(
      selected?.field_code ||
      selected?.key
    );

    pipedrivePersonAddressFieldCache =
      isWritableCustomFieldCode(key) ? key : false;

    return pipedrivePersonAddressFieldCache || null;
  } catch {
    // Die Personenerstellung darf nicht daran scheitern, dass kein
    // beschreibbares Adress-Custom-Field vorhanden ist.
    pipedrivePersonAddressFieldCache = false;
    return null;
  }
}

async function createPipedrivePersonPayload(env, input) {
  const address = parseAddress(
    input.postalAddress ||
    input.postal_address ||
    input.address ||
    formatAddress(input)
  );

  const postalAddress =
    address.formatted ||
    formatAddress({
      street: input.street,
      zip: input.zip,
      city: input.city
    });

  const payload = {
    name: cleanText(input.name),
    emails: input.email
      ? [{ value: cleanText(input.email), primary: true, label: "work" }]
      : [],
    phones: [
      ...(input.phone
        ? [{ value: cleanText(input.phone), primary: !input.mobile, label: "work" }]
        : []),
      ...(input.mobile
        ? [{ value: cleanText(input.mobile), primary: true, label: "mobile" }]
        : [])
    ]
  };

  // postal_address ist bei Pipedrive API v2 kein reguläres beschreibbares
  // Feld des Personen-Payloads. Eine direkte Übergabe führt zu HTTP 400.
  // Ist ein echtes Adress-Custom-Field vorhanden oder konfiguriert,
  // wird die Anschrift dort gespeichert.
  const addressField = postalAddress
    ? await resolvePipedrivePersonAddressField(env)
    : null;

  if (addressField && postalAddress) {
    payload.custom_fields = {
      [addressField]: { value: postalAddress }
    };
  }

  return payload;
}


function normalizeIsoDate(value) {
  const text = cleanText(value);
  if (!text) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;

  const german = text.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (german) {
    return `${german[3]}-${german[2].padStart(2, "0")}-${german[1].padStart(2, "0")}`;
  }

  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

function isCustomFieldCode(value) {
  return /^[a-zA-Z0-9]{20,}$/.test(cleanText(value));
}

async function loadPipedriveDealFieldSchema(env, force = false) {
  if (!force && pipedriveDealFieldSchemaCache) {
    return pipedriveDealFieldSchemaCache;
  }

  const result = await pipedriveRequest(env, "/api/v2/dealFields?limit=500");
  const fields = Array.isArray(result.data) ? result.data : [];
  const schema = {};

  for (const field of fields) {
    const key = cleanText(field.field_code || field.key);
    if (!isCustomFieldCode(key)) continue;
    schema[key] = {
      key,
      name: cleanText(field.field_name || field.name),
      type: cleanText(
        field.field_type || field.field_type_name || field.type
      ).toLowerCase(),
      options: field.options || []
    };
  }

  pipedriveDealFieldSchemaCache = schema;
  return schema;
}

function normalizeDealCustomFieldValue(field, rawValue) {
  if (rawValue === null || rawValue === undefined || rawValue === "") {
    return undefined;
  }

  const type = field.type;

  if (type === "date") {
    return normalizeIsoDate(rawValue) || undefined;
  }

  if (type === "address") {
    const address = parseAddress(rawValue);
    const formatted = address.formatted || formatAddress(address);
    return formatted ? { value: formatted } : undefined;
  }

  if (type === "time") {
    const candidate = typeof rawValue === "object" && rawValue !== null
      ? rawValue.value
      : rawValue;
    const match = String(candidate || "").trim().match(/^(\d{2}):(\d{2})(?::(\d{2}))?$/);
    if (!match) return undefined;
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    const seconds = Number(match[3] || 0);
    if (hours > 23 || minutes > 59 || seconds > 59) return undefined;
    return { value: `${match[1]}:${match[2]}:${String(seconds).padStart(2, "0")}` };
  }

  if (["double", "monetary", "numeric", "number"].includes(type)) {
    const value = Number(rawValue);
    return Number.isFinite(value) ? value : undefined;
  }

  if (["int", "integer"].includes(type)) {
    const value = Number(rawValue);
    return Number.isFinite(value) ? Math.round(value) : undefined;
  }

  if (type === "set") {
    if (Array.isArray(rawValue)) return rawValue.filter(Boolean);
    return String(rawValue).split(",").map(item => item.trim()).filter(Boolean);
  }

  if (type === "enum") {
    if (typeof rawValue === "object" && rawValue !== null) {
      return rawValue.id ?? rawValue.value ?? undefined;
    }
    return rawValue;
  }

  if (typeof rawValue === "object") {
    if ("value" in rawValue && Object.keys(rawValue).length === 1) {
      return rawValue.value;
    }
    return rawValue;
  }

  const text = String(rawValue);
  return field.type.includes("varchar") ? text.slice(0, 255) : text;
}

async function sanitizeDealCustomFields(env, customFields) {
  if (!customFields || typeof customFields !== "object") {
    return { fields: {}, warnings: [] };
  }

  const schema = await loadPipedriveDealFieldSchema(env);
  const fields = {};
  const warnings = [];

  for (const [key, rawValue] of Object.entries(customFields)) {
    if (!isCustomFieldCode(key)) {
      warnings.push(`Ungültiger Pipedrive-Feldschlüssel wurde ausgelassen: ${key}`);
      continue;
    }

    const field = schema[key];
    if (!field) {
      warnings.push(`Nicht vorhandenes Pipedrive-Deal-Feld wurde ausgelassen: ${key}`);
      continue;
    }

    const value = normalizeDealCustomFieldValue(field, rawValue);
    if (value === undefined) {
      warnings.push(`Ungültiger Wert für „${field.name || key}“ wurde ausgelassen.`);
      continue;
    }

    if (field.type.includes("varchar") && String(rawValue).length > 255) {
      warnings.push(`Der Kurztext „${field.name || key}“ wurde sicher auf 255 Zeichen gekürzt.`);
    }
    fields[key] = value;
  }

  return { fields, warnings };
}

function isAddressValidationError(error) {
  const details = JSON.stringify(error?.details || {}).toLowerCase();
  return details.includes("address field") || details.includes("expected 'object'");
}

async function savePipedrivePersonWithFallback(env, method, path, payload) {
  try {
    return await pipedriveRequest(env, path, {
      method,
      body: JSON.stringify(payload)
    });
  } catch (error) {
    if (!payload.custom_fields || !isAddressValidationError(error)) throw error;

    const fallback = { ...payload };
    delete fallback.custom_fields;
    const result = await pipedriveRequest(env, path, {
      method,
      body: JSON.stringify(fallback)
    });
    result._addressFallbackUsed = true;
    return result;
  }
}

function buildLexwareContactPayload(data) {
  const payload = {
    version: 0,
    roles: {
      customer: {},
    },
    person: {
      firstName: String(data.firstName || "").trim(),
      lastName: String(data.lastName || "").trim(),
    },
    addresses: {
      billing: [
        {
          street: String(data.street || "").trim(),
          zip: String(data.zip || "").trim(),
          city: String(data.city || "").trim(),
          countryCode: "DE",
        },
      ],
    },
    note: String(
      data.note || "Erstellt über Mainabdichter Pro"
    ).trim(),
  };

  const salutation = String(data.salutation || "").trim();
  const email = String(data.email || "").trim();
  const phone = String(data.phone || "").trim();

  if (salutation) {
    payload.person.salutation = salutation;
  }

  if (email) {
    payload.emailAddresses = {
      business: [email],
    };
  }

  if (phone) {
    payload.phoneNumbers = {
      mobile: [phone],
    };
  }

  return payload;
}


function firstListValue(object, preferredKeys = []) {
  if (!object || typeof object !== "object") return "";
  for (const key of preferredKeys) {
    const values = object[key];
    if (Array.isArray(values) && values.length) return values[0] || "";
  }
  for (const values of Object.values(object)) {
    if (Array.isArray(values) && values.length) return values[0] || "";
  }
  return "";
}

function normalizeLexwareContact(contact) {
  const person = contact.person || {};
  const company = contact.company || {};
  const contactPerson =
    Array.isArray(company.contactPersons) && company.contactPersons.length
      ? company.contactPersons[0]
      : {};
  const billing =
    contact.addresses &&
    Array.isArray(contact.addresses.billing) &&
    contact.addresses.billing.length
      ? contact.addresses.billing[0]
      : {};
  const firstName = person.firstName || contactPerson.firstName || "";
  const lastName = person.lastName || contactPerson.lastName || "";
  const companyName = company.name || "";
  return {
    id: contact.id,
    name: companyName || [firstName, lastName].filter(Boolean).join(" ") || "Unbenannter Kontakt",
    salutation: person.salutation || contactPerson.salutation || "",
    firstName,
    lastName,
    company: companyName,
    email: firstListValue(contact.emailAddresses, ["business","office","private","other"]),
    phone: firstListValue(contact.phoneNumbers, ["mobile","business","office","private","other"]),
    street: billing.street || "",
    zip: billing.zip || "",
    city: billing.city || "",
    customerNumber:
      contact.roles && contact.roles.customer && contact.roles.customer.number
        ? contact.roles.customer.number
        : "",
    archived: contact.archived === true,
  };
}


function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, c => ({
    "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#039;"
  })[c]);
}

function idFromValue(value) {
  if (value === null || value === undefined) return 0;
  if (typeof value === "object") return Number(value.value || value.id || 0);
  return Number(value || 0);
}

async function findExistingPipedrivePerson(env, email, phone) {
  const term = String(email || phone || "").trim();
  if (term.length < 2) return null;
  const fields = email ? "email" : "phone";
  const result = await pipedriveRequest(env,
    `/api/v2/persons/search?term=${encodeURIComponent(term)}&fields=${fields}&exact_match=true&limit=5`);
  const items = result?.data?.items || [];
  return items.length ? normalizePipedrivePerson(items[0].item || items[0]) : null;
}


async function uploadPipedriveFile(env, file, dealId) {
  const domain = getPipedriveDomain(env);
  const url = `https://${domain}.pipedrive.com/api/v1/files?api_token=${encodeURIComponent(env.PIPEDRIVE_API_TOKEN)}`;
  // Ein weitergereichtes FormData verliert bei einzelnen Cloudflare-
  // Laufzeiten gelegentlich den automatisch erzeugten boundary-Parameter.
  // Pipedrive verwirft den Upload dann mit "No initial boundary string".
  // Deshalb wird der Multipart-Body hier bewusst und eindeutig aufgebaut.
  const boundary = `----mainabdichter-${crypto.randomUUID()}`;
  const encoder = new TextEncoder();
  const safeFilename = String(file.name || "Dokument.pdf")
    .replace(/[\r\n"]/g, "_");
  const mimeType = String(file.type || "application/octet-stream")
    .replace(/[\r\n]/g, "");
  const fileBytes = new Uint8Array(await file.arrayBuffer());
  const prefix = encoder.encode(
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="deal_id"\r\n\r\n` +
    `${String(dealId)}\r\n` +
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="file"; filename="${safeFilename}"\r\n` +
    `Content-Type: ${mimeType}\r\n\r\n`
  );
  const suffix = encoder.encode(`\r\n--${boundary}--\r\n`);
  const body = new Uint8Array(prefix.length + fileBytes.length + suffix.length);
  body.set(prefix, 0);
  body.set(fileBytes, prefix.length);
  body.set(suffix, prefix.length + fileBytes.length);
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": `multipart/form-data; boundary=${boundary}`
    },
    body
  });
  const text = await response.text();
  let data;
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  if (!response.ok || data.success === false) {
    const error = new Error("Pipedrive Datei-Upload fehlgeschlagen");
    error.status = response.status;
    error.details = data;
    throw error;
  }
  return data;
}

async function findDealForPerson(env, personId, title) {
  if (!personId) return null;
  const result = await pipedriveRequest(
    env,
    `/api/v1/deals?person_id=${encodeURIComponent(personId)}&status=open&limit=500&sort=update_time DESC`
  );
  const deals = (Array.isArray(result?.data) ? result.data : [])
    .filter(item => Number(idFromValue(item?.person_id || item?.person)) === Number(personId));

  if (!deals.length) return null;
  if (deals.length === 1) return deals[0];

  const normalizeTitle = value => cleanText(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\b(baustelle|auftrag|angebot|anfrage)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  const wanted = normalizeTitle(title);
  const exact = deals.filter(deal => normalizeTitle(deal.title) === wanted);
  if (exact.length === 1) return exact[0];

  const wantedTokens = new Set(wanted.split(" ").filter(token => token.length >= 3));
  const scored = deals.map(deal => {
    const tokens = new Set(normalizeTitle(deal.title).split(" ").filter(token => token.length >= 3));
    const score = [...wantedTokens].filter(token => tokens.has(token)).length;
    return { deal, score };
  }).sort((a, b) => b.score - a.score);

  if (scored[0]?.score > 0 && scored[0].score > (scored[1]?.score || 0)) {
    return scored[0].deal;
  }

  const error = new Error(
    "Für diesen Pipedrive-Kunden wurden mehrere offene Deals gefunden. " +
    "Die Baustelle wurde nicht synchronisiert, damit keine Dublette entsteht."
  );
  error.status = 409;
  error.details = { personId, candidateDealIds: deals.map(deal => deal.id) };
  throw error;
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(request),
      });
    }

    const url = new URL(request.url);

    try {
      if (url.pathname === "/") {
        return jsonResponse(request, {
          ok: true,
          service: "Mainabdichter Bridge",
          workerVersion: "32.21.0",
          time: new Date().toISOString()
        });
      }

      // Safari/iOS blockiert gelegentlich Cross-Origin-Aufrufe mit
      // benutzerdefinierten Headern. Dieser TLS-geschützte Request benötigt
      // deshalb keinen CORS-Preflight.
      if (url.pathname === "/mobile-sync" && request.method === "POST") {
        const input = JSON.parse(await request.text().catch(() => "{}"));
        if (!input || input.secret !== env.APP_SECRET) {
          return jsonResponse(request, { ok: false, error: "Nicht autorisiert." }, 401);
        }
        if (input.action === "load") {
          const backup = await loadDriveBackup(env);
          return jsonResponse(request, {
            ok: true,
            exists: Boolean(backup),
            backup: backup?.payload || null,
            file: backup?.file || null
          });
        }
        if (input.action === "save") {
          const payload = input.payload;
          if (!payload || typeof payload !== "object") {
            return jsonResponse(request, { ok: false, error: "Sicherungsdaten fehlen." }, 400);
          }
          const encodedSize = new TextEncoder().encode(JSON.stringify(payload)).byteLength;
          if (encodedSize > 25 * 1024 * 1024) {
            return jsonResponse(request, { ok: false, error: "Die Datensicherung ist größer als 25 MB." }, 413);
          }
          const file = await saveDriveBackup(
            env,
            payload,
            String(input.expectedRemoteModifiedTime || "")
          );
          return jsonResponse(request, { ok: true, file });
        }
        return jsonResponse(request, { ok: false, error: "Synchronisationsaktion ist ungültig." }, 400);
      }

      if (
        request.headers.get("X-App-Secret") !== env.APP_SECRET
      ) {
        return jsonResponse(
          request,
          {
            ok: false,
            error: "Nicht autorisiert.",
          },
          401
        );
      }

      if (url.pathname === "/drive/test" && request.method === "GET") {
        const profile = await googleDriveRequest(env, "/about?fields=user(displayName,emailAddress)");
        return jsonResponse(request, { ok: true, user: profile.user || null });
      }

      if (url.pathname === "/migration/status" && request.method === "GET") {
        const services = {};
        for (const source of ["dropbox", "onedrive"]) {
          try {
            if (source === "dropbox") {
              const account = await dropboxRequest(env, "/users/get_current_account");
              services.dropbox = {
                connected: true,
                name: account.name?.display_name || "",
                email: account.email || ""
              };
            } else {
              const account = await oneDriveRequest(env, "/me?$select=displayName,userPrincipalName");
              services.onedrive = {
                connected: true,
                name: account.displayName || "",
                email: account.userPrincipalName || ""
              };
            }
          } catch (error) {
            services[source] = { connected: false, error: error.message };
          }
        }
        try {
          const drive = await googleDriveRequest(env, "/about?fields=user(displayName,emailAddress)");
          services.googleDrive = {
            connected: true,
            name: drive.user?.displayName || "",
            email: drive.user?.emailAddress || ""
          };
        } catch (error) {
          services.googleDrive = { connected: false, error: error.message };
        }
        return jsonResponse(request, { ok: true, services });
      }

      if (url.pathname === "/migration/items" && request.method === "GET") {
        const source = url.searchParams.get("source");
        if (!["dropbox", "onedrive"].includes(source)) {
          return jsonResponse(request, { ok: false, error: "Ungültige Quelle." }, 400);
        }
        const data = await listMigrationItems(
          env,
          source,
          url.searchParams.get("container") || "",
          url.searchParams.get("cursor") || ""
        );
        return jsonResponse(request, { ok: true, ...data });
      }

      if (url.pathname === "/migration/folder" && request.method === "POST") {
        const payload = await request.json().catch(() => ({}));
        const sourceName = payload.source === "dropbox" ? "Dropbox" : "OneDrive";
        let parent = payload.parentId || "";
        if (!parent) {
          const migrationRoot = await ensureDriveFolder(env, "Cloud-Migration");
          parent = (await ensureDriveFolder(env, sourceName, migrationRoot.id)).id;
        }
        const folder = payload.name
          ? await ensureDriveFolder(env, String(payload.name).slice(0, 240), parent)
          : { id: parent, name: sourceName };
        return jsonResponse(request, { ok: true, folder });
      }

      if (url.pathname === "/migration/copy" && request.method === "POST") {
        const payload = await request.json().catch(() => ({}));
        if (!["dropbox", "onedrive"].includes(payload.source) || !payload.item?.id || !payload.parentId) {
          return jsonResponse(request, { ok: false, error: "Quelldatei oder Zielordner fehlt." }, 400);
        }
        const file = await uploadMigrationFile(env, payload.source, payload.item, payload.parentId);
        return jsonResponse(request, { ok: true, file });
      }

      if (url.pathname === "/drive/backup" && request.method === "POST") {
        const payload = await request.json().catch(() => null);
        if (!payload || typeof payload !== "object") {
          return jsonResponse(request, { ok: false, error: "Sicherungsdaten fehlen." }, 400);
        }
        const encodedSize = new TextEncoder().encode(JSON.stringify(payload)).byteLength;
        if (encodedSize > 25 * 1024 * 1024) {
          return jsonResponse(request, { ok: false, error: "Die Datensicherung ist größer als 25 MB." }, 413);
        }
        const expectedRemoteModifiedTime =
          request.headers.get("X-Backup-Base-Modified") || "";
        const file = await saveDriveBackup(env, payload, expectedRemoteModifiedTime);
        return jsonResponse(request, { ok: true, file });
      }

      if (url.pathname === "/drive/backup" && request.method === "GET") {
        const backup = await loadDriveBackup(env);
        return jsonResponse(request, {
          ok: true,
          exists: Boolean(backup),
          backup: backup?.payload || null,
          file: backup?.file || null
        });
      }

      if (url.pathname === "/drive/photos" && request.method === "POST") {
        const form = await request.formData();
        const file = form.get("file");
        if (!(file instanceof File) || !String(file.type || "").startsWith("image/")) {
          return jsonResponse(request, { ok: false, error: "Eine Bilddatei fehlt." }, 400);
        }
        if (file.size > 20 * 1024 * 1024) {
          return jsonResponse(request, { ok: false, error: "Das Foto ist größer als 20 MB." }, 413);
        }
        let metadata = {};
        try {
          metadata = JSON.parse(String(form.get("metadata") || "{}"));
        } catch {
          return jsonResponse(request, { ok: false, error: "Die Fotozuordnung ist ungültig." }, 400);
        }
        const uploaded = await uploadDrivePhoto(env, file, metadata);
        return jsonResponse(request, { ok: true, file: uploaded }, 201);
      }

      if (/^\/drive\/photos\/[^/]+$/.test(url.pathname) && request.method === "GET") {
        const fileId = decodeURIComponent(url.pathname.split("/")[3]);
        const response = await googleDriveRequest(env, `/files/${encodeURIComponent(fileId)}?alt=media`, { raw: true });
        const headers = corsHeaders(request);
        headers["Content-Type"] = response.headers.get("Content-Type") || "image/jpeg";
        headers["Cache-Control"] = "private, max-age=3600";
        return new Response(response.body, { status: 200, headers });
      }

      if (url.pathname === "/drive/documents" && request.method === "POST") {
        const form = await request.formData();
        const file = form.get("file");
        if (!(file instanceof File) || !file.size) {
          return jsonResponse(request, { ok: false, error: "Eine Datei fehlt." }, 400);
        }
        if (file.size > 30 * 1024 * 1024) {
          return jsonResponse(request, { ok: false, error: "Die Datei ist größer als 30 MB." }, 413);
        }
        let metadata = {};
        try {
          metadata = JSON.parse(String(form.get("metadata") || "{}"));
        } catch {
          return jsonResponse(request, { ok: false, error: "Die Dateizuordnung ist ungültig." }, 400);
        }
        if (!metadata.customerFolder || !metadata.visitFolder) {
          return jsonResponse(request, { ok: false, error: "Kunde oder Vorgang fehlt." }, 400);
        }
        const uploaded = await uploadDriveDocument(env, file, metadata);
        return jsonResponse(request, { ok: true, file: uploaded }, 201);
      }


      if (url.pathname === "/pipedrive/person-fields" && request.method === "GET") {
        const fields = await loadPipedrivePersonFieldSchema(env, true);
        return jsonResponse(request, { ok: true, fields });
      }

      if (url.pathname === "/pipedrive/deal-fields" && request.method === "GET") {
        const result = await pipedriveRequest(env, "/api/v2/dealFields?limit=500");
        const fields = (result.data || []).map(field => ({
          id: field.id,
          key: field.field_code || field.key,
          name: field.field_name || field.name,
          type: field.field_type || field.field_type_name || field.type,
          options: field.options || []
        }));
        return jsonResponse(request, { ok: true, fields });
      }

      if (url.pathname === "/pipedrive/stages" && request.method === "GET") {
        const result = await pipedriveRequest(env, "/api/v1/stages?limit=500");
        const stages = (result.data || []).map(stage => ({
          id: stage.id,
          name: stage.name,
          pipelineId: stage.pipeline_id,
          order: stage.order_nr,
          active: stage.active_flag !== false
        })).filter(stage => stage.active);
        return jsonResponse(request, { ok: true, stages });
      }

      if (url.pathname === "/pipedrive/deals/sync" && request.method === "POST") {
        const input = await request.json();
        let dealId = Number(input.dealId || 0) || null;
        const personId = Number(input.personId || 0) || null;
        const title = String(input.title || "Baustelle").trim();
        const customFieldResult = await sanitizeDealCustomFields(
          env,
          input.customFields && typeof input.customFields === "object"
            ? input.customFields
            : {}
        );
        const customFields = customFieldResult.fields;

        if (!dealId && personId) {
          const found = await findDealForPerson(env, personId, title);
          dealId = Number(found?.id || 0) || null;
        }

        const payload = {
          title,
          ...(personId ? { person_id: personId } : {}),
          ...(input.stageId ? { stage_id: Number(input.stageId) } : {}),
          ...(input.value !== undefined && input.value !== null ? { value: Number(input.value) || 0, currency: input.currency || "EUR" } : {}),
          ...(Object.keys(customFields).length ? { custom_fields: customFields } : {})
        };

        let result;
        let created = false;
        if (dealId) {
          result = await pipedriveRequest(env, `/api/v2/deals/${dealId}`, {
            method: "PATCH",
            body: JSON.stringify(payload)
          });
        } else {
          result = await pipedriveRequest(env, "/api/v2/deals", {
            method: "POST",
            body: JSON.stringify(payload)
          });
          created = true;
        }
        const deal = result.data || result;

        if (input.note) {
          await pipedriveRequest(env, "/api/v1/notes", {
            method: "POST",
            body: JSON.stringify({
              deal_id: deal.id,
              person_id: personId || undefined,
              content: String(input.note),
              pinned_to_deal_flag: 1
            })
          });
        }

        return jsonResponse(
          request,
          {
            ok: true,
            deal,
            created,
            syncStatus: {
              pipedriveDeal: "success",
              customFieldsSent: Object.keys(customFields).length,
              warnings: customFieldResult.warnings
            }
          },
          created ? 201 : 200
        );
      }

      if (/^\/pipedrive\/deals\/\d+\/note$/.test(url.pathname) && request.method === "POST") {
        const dealId = Number(url.pathname.split("/")[3]);
        const input = await request.json();
        const result = await pipedriveRequest(env, "/api/v1/notes", {
          method: "POST",
          body: JSON.stringify({
            deal_id: dealId,
            content: String(input.content || ""),
            pinned_to_deal_flag: 1
          })
        });
        return jsonResponse(request, { ok: true, note: result.data || result }, 201);
      }

      if (/^\/pipedrive\/persons\/\d+\/note$/.test(url.pathname) && request.method === "POST") {
        const personId = Number(url.pathname.split("/")[3]);
        const input = await request.json();
        const result = await pipedriveRequest(env, "/api/v1/notes", {
          method: "POST",
          body: JSON.stringify({
            person_id: personId,
            content: String(input.content || ""),
            pinned_to_person_flag: 1
          })
        });
        return jsonResponse(request, { ok: true, note: result.data || result }, 201);
      }

      if (/^\/pipedrive\/deals\/\d+\/file$/.test(url.pathname) && request.method === "POST") {
        const dealId = Number(url.pathname.split("/")[3]);
        const form = await request.formData();
        const file = form.get("file");
        if (!(file instanceof File)) {
          return jsonResponse(request, { ok: false, error: "PDF-Datei fehlt." }, 400);
        }
        const result = await uploadPipedriveFile(env, file, dealId);
        return jsonResponse(request, { ok: true, file: result.data || result }, 201);
      }

      if (
        url.pathname === "/pipedrive/person-address-field" &&
        request.method === "GET"
      ) {
        pipedrivePersonAddressFieldCache = null;
        const fieldCode = await resolvePipedrivePersonAddressField(env);
        return jsonResponse(request, {
          ok: true,
          configured: Boolean(cleanText(env.PIPEDRIVE_PERSON_ADDRESS_FIELD)),
          fieldCode: fieldCode || null,
          mode: fieldCode ? "custom_field" : "note_fallback",
          message: fieldCode
            ? "Die Postanschrift wird im Pipedrive-Adressfeld gespeichert."
            : "Kein eindeutiges Adressfeld gefunden. Die Anschrift bleibt sicher in der Pipedrive-Notiz gespeichert."
        });
      }

      if (url.pathname === "/pipedrive/test") {
        await pipedriveRequest(
          env,
          "/api/v2/persons?limit=1"
        );

        return jsonResponse(request, {
          ok: true,
          workerVersion: "32.21.0",
          addressSync: true,
          postalAddressPayloadFixed: true,
          dealFieldSchemaValidation: true,
          dateNormalization: true
        });
      }

      if (
        url.pathname === "/pipedrive/persons" &&
        request.method === "POST"
      ) {
        const input = await request.json();
        const name = String(input.name || "").trim();
        const email = String(input.email || "").trim();
        const phone = String(input.phone || input.mobile || "").trim();
        if (!name) return jsonResponse(request,{ok:false,error:"Name fehlt."},400);

        const requestedPersonId = Number(input.pipedriveId || 0) || null;
        let person = requestedPersonId
          ? { id: requestedPersonId }
          : await findExistingPipedrivePerson(env,email,phone);
        let created = false;
        if (!person) {
          const payload = await createPipedrivePersonPayload(env, { ...input, name, email, phone });
          const result = await savePipedrivePersonWithFallback(
            env,
            "POST",
            "/api/v2/persons",
            payload
          );
          person = normalizePipedrivePerson(result.data || result);
          person.addressFallbackUsed = result._addressFallbackUsed === true;
          created = true;
        } else {
          const updatePayload = await createPipedrivePersonPayload(env, { ...input, name, email, phone });
          const updated = await savePipedrivePersonWithFallback(
            env,
            "PATCH",
            `/api/v2/persons/${person.id}`,
            updatePayload
          );
          person = normalizePipedrivePerson(updated.data || updated);
          person.addressFallbackUsed = updated._addressFallbackUsed === true;
        }

        const address = cleanText(input.postalAddress) || formatAddress({street:input.street,zip:input.zip,city:input.city});
        const objectAddress = cleanText(input.objectAddress) || address;
        const content = [
          `<strong>Neue Anfrage über ${escapeHtml(input.source || "Screenshot")}</strong>`,
          address ? `<br><strong>Postanschrift:</strong> ${escapeHtml(address)}` : "",
          objectAddress ? `<br><strong>Objekt:</strong> ${escapeHtml(objectAddress)}` : "",
          input.ownerStatus ? `<br><strong>Status:</strong> ${escapeHtml(input.ownerStatus)}` : "",
          input.appointment ? `<br><strong>Terminnotiz:</strong><br>${escapeHtml(input.appointment).replace(/\n/g,"<br>")}` : "",
          input.message ? `<br><strong>Nachricht:</strong><br>${escapeHtml(input.message).replace(/\n/g,"<br>")}` : ""
        ].join("");
        if (content.trim()) {
          await pipedriveRequest(env,"/api/v1/notes",{
            method:"POST", body:JSON.stringify({person_id:person.id,content,pinned_to_person_flag:1})
          });
        }
        return jsonResponse(
          request,
          {
            ok: true,
            person,
            created,
            syncStatus: {
              pipedrivePerson: "success",
              pipedriveAddress: person.addressFallbackUsed
                ? "note_fallback"
                : "custom_field"
            }
          },
          created ? 201 : 200
        );
      }

      if (
        url.pathname === "/pipedrive/persons" &&
        request.method === "GET"
      ) {
        const cursor = cleanText(url.searchParams.get("cursor"));
        const addressField = await resolvePipedrivePersonAddressField(env);
        const params = new URLSearchParams({ limit: "500" });
        if (cursor) params.set("cursor", cursor);
        if (addressField) params.set("custom_fields", addressField);

        const result = await pipedriveRequest(
          env,
          `/api/v2/persons?${params.toString()}`
        );
        const people = (Array.isArray(result.data) ? result.data : [])
          .map(person => {
            if (
              addressField &&
              person.custom_fields &&
              person.custom_fields[addressField] !== undefined
            ) {
              person._mainabdichter_address_value =
                person.custom_fields[addressField];
            }
            return normalizePipedrivePerson(person);
          });

        return jsonResponse(request, {
          ok: true,
          people,
          nextCursor:
            result.additional_data?.next_cursor ||
            result.additional_data?.pagination?.next_cursor ||
            null
        });
      }

      if (url.pathname === "/pipedrive/persons/search") {
        const term = String(
          url.searchParams.get("term") || ""
        ).trim();

        if (term.length < 2) {
          return jsonResponse(
            request,
            {
              ok: false,
              error: "Mindestens 2 Zeichen erforderlich.",
            },
            400
          );
        }

        const data = await pipedriveRequest(
          env,
          `/api/v2/persons/search?term=${encodeURIComponent(
            term
          )}&fields=name,email,phone&limit=20`
        );

        const items =
          (data.data && data.data.items) || [];

        const people = items.map((entry) =>
          normalizePipedrivePerson(entry.item || entry)
        );

        return jsonResponse(request, {
          ok: true,
          people,
        });
      }

      if (
        /^\/pipedrive\/persons\/\d+\/customer-history$/.test(url.pathname) &&
        request.method === "GET"
      ) {
        const personId = Number(url.pathname.split("/")[3]);
        const idFromValue = value => {
          if (value === null || value === undefined) return 0;
          if (typeof value === "object") return Number(value.value || value.id || 0);
          return Number(value || 0);
        };
        const safeRequest = path =>
          pipedriveRequest(env, path).catch(() => ({ data: [] }));

        const [dealsResult, notesResult, activitiesResult] = await Promise.all([
          safeRequest(`/api/v1/deals?person_id=${personId}&status=all_not_deleted&limit=500&sort=update_time DESC`),
          safeRequest(`/api/v1/notes?person_id=${personId}&limit=500&sort=add_time DESC`),
          safeRequest(`/api/v1/activities?person_id=${personId}&limit=500&sort=due_date DESC`)
        ]);

        const deals = (dealsResult.data || [])
          .filter(item => idFromValue(item?.person_id || item?.person) === personId)
          .map(item => ({
            id: item.id,
            title: item.title || "",
            status: item.status || "",
            value: item.value || 0,
            currency: item.currency || "EUR",
            addTime: item.add_time || "",
            updateTime: item.update_time || ""
          }));
        const notes = (notesResult.data || [])
          .filter(item => idFromValue(item?.person_id || item?.person) === personId)
          .map(item => ({
            id: item.id,
            content: item.content || "",
            addTime: item.add_time || "",
            updateTime: item.update_time || ""
          }));
        const activities = (activitiesResult.data || [])
          .filter(item => idFromValue(item?.person_id || item?.person) === personId)
          .map(item => ({
            id: item.id,
            subject: item.subject || item.type_name || item.type || "",
            type: item.type || "",
            dueDate: item.due_date || "",
            dueTime: item.due_time || "",
            done: Boolean(item.done),
            note: item.note || ""
          }));

        return jsonResponse(request, {
          ok: true,
          personId,
          deals,
          notes,
          activities,
          loadedAt: new Date().toISOString()
        });
      }

      if (
        /^\/pipedrive\/persons\/\d+$/.test(url.pathname) &&
        request.method === "GET"
      ) {
        const id = url.pathname.split("/").pop();

        const person = await loadPipedrivePersonWithAllFields(env, id);

        return jsonResponse(request, {
          ok: true,
          person,
        });
      }

      if (
        /^\/pipedrive\/deals\/\d+\/context$/.test(url.pathname) &&
        request.method === "GET"
      ) {
        const dealId = Number(url.pathname.split("/")[3]);
        const idFromValue = value => {
          if (value === null || value === undefined) return 0;
          if (typeof value === "object") {
            return Number(value.value || value.id || 0);
          }
          return Number(value || 0);
        };

        const dealResult = await pipedriveRequest(
          env,
          `/api/v1/deals/${dealId}`
        );
        const deal = dealResult.data || dealResult;

        if (!deal || Number(deal.id) !== dealId) {
          return jsonResponse(
            request,
            { ok: false, error: "Der angeforderte Pipedrive-Deal wurde nicht gefunden." },
            404
          );
        }

        const personId = idFromValue(deal.person_id || deal.person);

        const [notesResult, activitiesResult, filesResult, dealsResult] =
          await Promise.all([
            pipedriveRequest(
              env,
              `/api/v1/notes?deal_id=${dealId}&limit=500&sort=add_time DESC`
            ),
            pipedriveRequest(
              env,
              `/api/v1/activities?deal_id=${dealId}&limit=500&sort=due_date DESC`
            ),
            pipedriveRequest(
              env,
              `/api/v1/files?deal_id=${dealId}&limit=500`
            ),
            personId
              ? pipedriveRequest(
                  env,
                  `/api/v1/deals?person_id=${personId}&status=all_not_deleted&limit=500`
                )
              : Promise.resolve({ data: [] })
          ]);

        // Pipedrive liefert bei älteren v1-Endpunkten teilweise breitere
        // Ergebnismengen. Deshalb wird jede Antwort lokal nochmals strikt
        // anhand der Deal- bzw. Personen-ID gefiltert.
        const notes = (notesResult.data || []).filter(item =>
          idFromValue(item?.deal_id || item?.deal) === dealId
        );

        const activities = (activitiesResult.data || []).filter(item =>
          idFromValue(item?.deal_id || item?.deal) === dealId
        );

        const files = (filesResult.data || [])
          .filter(item => idFromValue(item?.deal_id || item?.deal) === dealId)
          .map(file => ({
            id: file.id,
            name: file.name || file.file_name || "",
            add_time: file.add_time || "",
            size: file.file_size || file.size || 0,
            url: file.remote_location || file.url || ""
          }));

        const relatedDeals = (dealsResult.data || [])
          .filter(item =>
            Number(item?.id) !== dealId &&
            idFromValue(item?.person_id || item?.person) === personId
          )
          .map(item => ({
            id: item.id,
            title: item.title || "",
            status: item.status || "",
            value: item.value || 0,
            currency: item.currency || "EUR",
            stage_id: idFromValue(item.stage_id || item.stage),
            add_time: item.add_time || "",
            update_time: item.update_time || ""
          }));

        let person = null;
        if (personId) {
          try {
            person = await loadPipedrivePersonWithAllFields(env, personId);
          } catch {}
        }

        const dealSchema = await loadPipedriveDealFieldSchema(env);
        const dealCustomFields = {};
        const dealCustomFieldsByName = {};
        for (const field of Object.values(dealSchema)) {
          const rawValue = deal.custom_fields?.[field.key] ?? deal[field.key];
          if (rawValue === null || rawValue === undefined || rawValue === "") continue;
          const optionLabel = value => {
            const option = (field.options || []).find(item =>
              String(item.id) === String(value?.id ?? value)
            );
            return option?.label || value?.label || value?.value || value?.name || value?.address || value;
          };
          const value = Array.isArray(rawValue)
            ? rawValue.map(optionLabel).filter(Boolean).join(", ")
            : typeof rawValue === "object"
              ? optionLabel(rawValue)
              : optionLabel(rawValue);
          dealCustomFields[field.key] = value;
          dealCustomFieldsByName[field.name || field.key] = value;
        }

        return jsonResponse(request, {
          ok: true,
          context: {
            loaded: true,
            loadedAt: new Date().toISOString(),
            deal: {
              ...deal,
              customFields: dealCustomFields,
              customFieldsByName: dealCustomFieldsByName
            },
            person,
            notes,
            activities,
            files,
            relatedDeals
          }
        });
      }

      if (
        url.pathname === "/lexware/customer-history" &&
        request.method === "GET"
      ) {
        const suppliedId = String(
          url.searchParams.get("contactId") || ""
        ).trim();
        const email = String(
          url.searchParams.get("email") || ""
        ).trim().toLowerCase();
        const name = String(
          url.searchParams.get("name") || ""
        ).trim();

        let contact = null;

        if (suppliedId) {
          try {
            contact = normalizeLexwareContact(
              await lexwareRequest(
                env,
                `/contacts/${encodeURIComponent(suppliedId)}`
              )
            );
          } catch {}
        }

        if (!contact && email) {
          const result = await lexwareRequest(
            env,
            `/contacts?customer=true&archived=false&page=0&size=100&email=${encodeURIComponent(email)}`
          );
          const exact = (result.content || [])
            .map(normalizeLexwareContact)
            .find(item => String(item.email || "").trim().toLowerCase() === email);
          if (exact) contact = exact;
        }

        // Eine reine Namenssuche kann Namensvetter oder unscharfe Treffer
        // liefern. Sie wird deshalb nur akzeptiert, wenn genau ein exakter
        // Treffer vorhanden ist.
        if (!contact && name) {
          const result = await lexwareRequest(
            env,
            `/contacts?customer=true&archived=false&page=0&size=100&name=${encodeURIComponent(name)}`
          );
          const normalizedName = name.toLocaleLowerCase("de-DE").trim();
          const exact = (result.content || [])
            .map(normalizeLexwareContact)
            .filter(item =>
              String(item.name || "").toLocaleLowerCase("de-DE").trim() === normalizedName
            );
          if (exact.length === 1) contact = exact[0];
        }

        if (!contact) {
          return jsonResponse(request, {
            ok: true,
            contact: null,
            documents: [],
            warning: "Kein eindeutig passender Lexoffice-Kontakt gefunden."
          });
        }

        const voucherResult = await lexwareRequest(
          env,
          `/voucherlist?voucherType=any&voucherStatus=any&contactId=${encodeURIComponent(contact.id)}&archived=false&size=250&sort=voucherDate,DESC`
        );

        const documents = (voucherResult.content || [])
          .filter(item => String(item.contactId || "") === String(contact.id))
          .map(item => ({
            id: item.id,
            voucherType: item.voucherType || "",
            voucherNumber: item.voucherNumber || "",
            voucherDate: item.voucherDate || "",
            updatedDate: item.updatedDate || "",
            voucherStatus: item.voucherStatus || "",
            totalAmount: item.totalAmount || 0,
            currency: item.currency || "EUR"
          }));

        return jsonResponse(request, {
          ok: true,
          contact,
          documents
        });
      }

      if (url.pathname === "/gmail/inbox" && request.method === "GET") {
        const query = encodeURIComponent("in:inbox newer_than:30d -from:me");
        const list = await gmailRequest(env, `/messages?q=${query}&maxResults=50`);
        const ids = (list.messages || []).map(item => item.id).filter(Boolean);
        const messages = [];
        for (let index = 0; index < ids.length; index += 10) {
          const batch = await Promise.all(ids.slice(index, index + 10).map(id =>
            gmailRequest(env, `/messages/${encodeURIComponent(id)}?format=full`)
          ));
          messages.push(...batch.map(message => {
            const headers = Object.fromEntries(
              (message.payload?.headers || []).map(item => [
                String(item.name || "").toLowerCase(),
                cleanText(item.value)
              ])
            );
            const from = headers.from || "";
            const emailMatch = from.match(/<([^>]+)>/) || from.match(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/);
            const email = cleanText(emailMatch?.[1] || emailMatch?.[0] || from).toLowerCase();
            const name = cleanText(from.replace(/<[^>]+>/g, "").replace(/^"|"$/g, ""));
            const subject = headers.subject || "(ohne Betreff)";
            const body = gmailMessageText(message.payload).replace(/\s+/g, " ").trim().slice(0, 12000);
            const inquiryText = `${subject} ${body}`.toLowerCase();
            return {
              id: message.id,
              threadId: message.threadId || "",
              from,
              name,
              email,
              subject,
              date: headers.date || "",
              receivedAt: new Date(Number(message.internalDate || Date.now())).toISOString(),
              snippet: cleanText(message.snippet || body).slice(0, 500),
              body,
              isInquiry: /anfrage|angebot|besichtigung|feucht|keller|schimmel|wassereintritt|horizontalsperre|flächensperre|wand.?sohlen/.test(inquiryText)
            };
          }));
        }
        messages.sort((a, b) => String(b.receivedAt).localeCompare(String(a.receivedAt)));
        return jsonResponse(request, { ok: true, messages, readOnly: true });
      }

      if (url.pathname === "/address/localities" && request.method === "GET") {
        const postalCode = cleanText(url.searchParams.get("postalCode")).replace(/\D/g, "").slice(0, 5);
        const name = cleanText(url.searchParams.get("name"));
        if (!postalCode && name.length < 2) {
          return jsonResponse(request, { ok: true, localities: [], source: "OpenPLZ" });
        }
        const rows = await openPlzRequest("Localities", {
          postalCode,
          name: name ? openPlzRegexPrefix(name) : ""
        });
        const localities = rows.map(item => ({
          name: cleanText(item.name),
          postalCode: cleanText(item.postalCode || item.postalcode),
          municipality: cleanText(item.municipality?.name),
          district: cleanText(item.district?.name),
          federalState: cleanText(item.federalState?.name)
        })).filter(item => item.name && item.postalCode);
        return jsonResponse(request, { ok: true, localities, source: "OpenPLZ" });
      }

      if (url.pathname === "/address/streets" && request.method === "GET") {
        const name = cleanText(url.searchParams.get("name"));
        const postalCode = cleanText(url.searchParams.get("postalCode")).replace(/\D/g, "").slice(0, 5);
        const locality = cleanText(url.searchParams.get("locality"));
        if (name.length < 3) {
          return jsonResponse(request, { ok: true, streets: [], source: "OpenPLZ" });
        }
        const rows = await openPlzRequest("Streets", {
          name: openPlzRegexPrefix(name),
          postalCode,
          locality
        });
        const streets = rows.map(item => ({
          name: cleanText(item.name),
          postalCode: cleanText(item.postalCode || item.postalcode),
          locality: cleanText(item.locality),
          borough: cleanText(item.borough || item.suburb)
        })).filter(item => item.name);
        return jsonResponse(request, { ok: true, streets, source: "OpenPLZ" });
      }

      if (url.pathname === "/pipedrive/activities" && request.method === "GET") {
        const date = url.searchParams.get("date") || new Date().toISOString().slice(0,10);
        const upcoming = url.searchParams.get("upcoming") === "true";
        const allActivities=[];
        let pageCount=0;
        let v1PageCount=0;
        // Pipedrive behandelt synchronisierte Kalenderereignisse je nach Quelle
        // unterschiedlich. Beide Statusgruppen ausdrücklich abrufen und danach
        // anhand der Aktivitäts-ID zusammenführen.
        for (const done of ["false", "true"]) {
          let cursor="";
          let statusPageCount=0;
          do {
            const params=new URLSearchParams({
              done,
              sort_by:"due_date",
              sort_direction:"desc",
              include_fields:"attendees",
              limit:"500"
            });
            if(cursor) params.set("cursor",cursor);
            const result=await pipedriveRequest(env,`/api/v2/activities?${params.toString()}`);
            const page=Array.isArray(result.data)?result.data:[];
            allActivities.push(...page);
            cursor=cleanText(result.additional_data?.next_cursor||result.additional_data?.pagination?.next_cursor||"");
            pageCount+=1;
            statusPageCount+=1;
          } while(cursor&&statusPageCount<100);
        }
        // Zweiter, unabhaengiger Abrufweg: Einige Pipedrive-Konten liefern
        // synchronisierte Kalenderaktivitaeten ueber die v2-Sammlung nicht
        // vollstaendig. Der in dieser App bewaehrte v1-Endpunkt wird deshalb
        // zusaetzlich gelesen und anschliessend per Aktivitaets-ID vereinigt.
        let start=0;
        let moreV1=true;
        while(moreV1&&v1PageCount<100){
          const result=await pipedriveRequest(
            env,
            `/api/v1/activities?start=${start}&limit=500&sort=due_date%20DESC`
          );
          const page=Array.isArray(result.data)?result.data:[];
          allActivities.push(...page);
          const pagination=result.additional_data?.pagination||{};
          moreV1=Boolean(pagination.more_items_in_collection);
          const nextStart=Number(pagination.next_start);
          start=Number.isFinite(nextStart)?nextStart:start+page.length;
          v1PageCount+=1;
          if(!page.length) moreV1=false;
        }
        const uniqueActivities=[...new Map(allActivities.map(item=>[String(item?.id||crypto.randomUUID()),item])).values()];
        const normalizedActivities=uniqueActivities.filter(item=>item&&item.due_date).map(item=>{const p=Array.isArray(item.participants)?item.participants.find(x=>x?.primary)||item.participants[0]:null;const attendee=Array.isArray(item.attendees)?item.attendees.find(x=>x?.person_id)||item.attendees[0]:null;const location=item.location&&typeof item.location==="object"?(item.location.value||item.location.address||item.location.formatted_address||""):(item.location||"");const personId=item.person_id&&typeof item.person_id==="object"?(item.person_id.value||item.person_id.id||""):(item.person_id||p?.person_id||attendee?.person_id||"");const dealId=item.deal_id&&typeof item.deal_id==="object"?(item.deal_id.value||item.deal_id.id||""):(item.deal_id||"");const localTime=item.due_time?utcActivityTimeToBerlin(item.due_date,item.due_time):{dueDate:item.due_date||"",dueTime:""};return{id:item.id||"",subject:item.subject||"Ohne Betreff",type:item.type||"",dueDate:localTime.dueDate,dueTime:localTime.dueTime,duration:item.duration||"",personId,dealId,location,note:item.note||"",done:Boolean(item.done),personName:item.person_name||p?.name||attendee?.name||""};});
        const activities=normalizedActivities.filter(item=>upcoming?item.dueDate>=date:item.dueDate===date);
        activities.sort((a,b)=>`${a.dueDate} ${a.dueTime||"00:00"}`.localeCompare(`${b.dueDate} ${b.dueTime||"00:00"}`));
        const availableDates=normalizedActivities.map(item=>item.dueDate).sort();
        return jsonResponse(request,{ok:true,activities,diagnostics:{v2Pages:pageCount,v1Pages:v1PageCount,received:allActivities.length,unique:uniqueActivities.length,dated:normalizedActivities.length,matched:activities.length,fromDate:date,earliestDate:availableDates[0]||"",latestDate:availableDates.at(-1)||"",statusGroups:["open","done"],sources:["v2","v1"],paginationComplete:true,timeZone:BUSINESS_TIME_ZONE,apiTimeBasis:"UTC"}});
      }

      if (url.pathname === "/pipedrive/activities" && request.method === "POST") {
        const input=await request.json();
        const subject=cleanText(input.subject);
        const dueDate=cleanText(input.dueDate);
        const personId=Number(input.personId||0)||null;
        if(!subject||!dueDate||!personId) return jsonResponse(request,{ok:false,error:"Kunde, Betreff oder Datum fehlt."},400);
        const minutes=Math.max(5,Number(input.duration||60));
        const hours=String(Math.floor(minutes/60)).padStart(2,"0");
        const mins=String(minutes%60).padStart(2,"0");
        const activityLocation=cleanText(input.location);
        const localDueTime=cleanText(input.dueTime);
        const apiDue=localDueTime
          ? berlinActivityTimeToUtc(dueDate,localDueTime)
          : {dueDate,dueTime:""};
        const payload={
          subject,
          type:cleanText(input.type)||"meeting",
          due_date:apiDue.dueDate,
          due_time:apiDue.dueTime||undefined,
          duration:`${hours}:${mins}`,
          participants:[{person_id:personId,primary:true}],
          deal_id:Number(input.dealId||0)||undefined,
          // Pipedrive API v2 erwartet hier ein Location-Objekt. Die Adresse
          // kommt aus dem getrennten Objektadressfeld des vorhandenen Kunden.
          location:activityLocation?{value:activityLocation}:undefined,
          note:cleanText(input.note)||undefined,
          done:false
        };
        Object.keys(payload).forEach(key=>payload[key]===undefined&&delete payload[key]);
        const result=await pipedriveRequest(env,"/api/v2/activities",{method:"POST",body:JSON.stringify(payload)});
        return jsonResponse(request,{ok:true,activity:result.data||result,localSchedule:{dueDate,dueTime:localDueTime,timeZone:BUSINESS_TIME_ZONE},apiSchedule:{dueDate:apiDue.dueDate,dueTime:apiDue.dueTime,timeZone:"UTC"}},201);
      }

      const completeActivityMatch = url.pathname.match(/^\/pipedrive\/activities\/(\d+)\/complete$/);
      if (completeActivityMatch && request.method === "POST") {
        const activityId = Number(completeActivityMatch[1]);
        const input = await request.json().catch(() => ({}));
        const outcome = cleanText(input.outcome);
        if (!activityId || !outcome) {
          return jsonResponse(request, { ok: false, error: "Termin oder Ergebnis fehlt." }, 400);
        }
        const existingNote = cleanText(input.existingNote);
        const detail = cleanText(input.note);
        const completedAt = new Intl.DateTimeFormat("de-DE", {
          timeZone: BUSINESS_TIME_ZONE,
          dateStyle: "short",
          timeStyle: "short"
        }).format(new Date());
        const resultNote = [
          existingNote,
          `Abschluss über mainabdichter PRO am ${completedAt}: ${outcome}.`,
          detail
        ].filter(Boolean).join("\n");
        const updated = await pipedriveRequest(env, `/api/v1/activities/${activityId}`, {
          method: "PUT",
          body: JSON.stringify({ done: 1, note: resultNote })
        });
        const personId = Number(input.personId || 0) || undefined;
        const dealId = Number(input.dealId || 0) || undefined;
        if (personId || dealId) {
          const content = [
            `<strong>Termin abgeschlossen: ${escapeHtml(outcome)}</strong>`,
            detail ? `<br>${escapeHtml(detail).replace(/\n/g, "<br>")}` : "",
            `<br><small>${escapeHtml(completedAt)} · mainabdichter PRO</small>`
          ].join("");
          await pipedriveRequest(env, "/api/v1/notes", {
            method: "POST",
            body: JSON.stringify({
              content,
              person_id: personId,
              deal_id: dealId,
              pinned_to_person_flag: personId ? 1 : undefined,
              pinned_to_deal_flag: dealId ? 1 : undefined
            })
          });
        }
        return jsonResponse(request, { ok: true, activity: updated.data || updated, outcome });
      }

      if (url.pathname === "/lexware/accepted-quotations" && request.method === "GET") {
        const formatter = new Intl.DateTimeFormat("en-CA", {
          timeZone: "Europe/Berlin",
          year: "numeric",
          month: "2-digit",
          day: "2-digit"
        });
        const todayBerlin = formatter.format(new Date());
        const requestedFrom = url.searchParams.get("updatedDateFrom");
        const dateFrom = /^\d{4}-\d{2}-\d{2}$/.test(requestedFrom || "")
          ? requestedFrom
          : todayBerlin;

        const result = await lexwareRequest(
          env,
          `/voucherlist?voucherType=quotation&voucherStatus=accepted&archived=false&updatedDateFrom=${encodeURIComponent(dateFrom)}&size=250&sort=updatedDate,DESC`
        );

        const quotations = (result.content || [])
          .filter(item => String(item.updatedDate || "").slice(0, 10) >= dateFrom)
          .map(item => ({
            id: item.id,
            voucherNumber: item.voucherNumber,
            voucherDate: item.voucherDate,
            updatedDate: item.updatedDate,
            contactId: item.contactId,
            contactName: item.contactName,
            totalAmount: item.totalAmount,
            currency: item.currency
          }));

        return jsonResponse(request, {
          ok: true,
          dateFrom,
          quotations
        });
      }

      if (url.pathname === "/lexware/quotations" && request.method === "GET") {
        const formatter = new Intl.DateTimeFormat("en-CA", {
          timeZone: "Europe/Berlin",
          year: "numeric",
          month: "2-digit",
          day: "2-digit"
        });
        const todayBerlin = formatter.format(new Date());
        const requestedFrom = url.searchParams.get("dateFrom");
        const dateFrom = /^\d{4}-\d{2}-\d{2}$/.test(requestedFrom || "")
          ? requestedFrom
          : todayBerlin;

        const loadStatus = async (voucherStatus) => {
          const result = await lexwareRequest(
            env,
            `/voucherlist?voucherType=quotation&voucherStatus=${encodeURIComponent(voucherStatus)}&archived=false&updatedDateFrom=${encodeURIComponent(dateFrom)}&size=250&sort=updatedDate,DESC`
          );
          return (result.content || [])
            .filter(item => {
              const relevantDate = String(item.voucherDate || item.updatedDate || "").slice(0, 10);
              return relevantDate >= dateFrom;
            })
            .map(item => ({
              id: item.id,
              voucherNumber: item.voucherNumber,
              voucherDate: item.voucherDate,
              updatedDate: item.updatedDate,
              voucherStatus: item.voucherStatus || voucherStatus,
              contactId: item.contactId,
              contactName: item.contactName,
              totalAmount: item.totalAmount,
              currency: item.currency
            }));
        };

        const [open, accepted] = await Promise.all([
          loadStatus("open"),
          loadStatus("accepted")
        ]);

        return jsonResponse(request, {
          ok: true,
          dateFrom,
          open,
          accepted,
          quotations: [...open, ...accepted]
        });
      }

      if (url.pathname.startsWith("/lexware/accepted-quotations/") && request.method === "GET") {
        const id=url.pathname.split("/").pop();
        const quotation=await lexwareRequest(env,`/quotations/${encodeURIComponent(id)}`);
        if (quotation.voucherStatus !== "accepted") return jsonResponse(request,{ok:false,error:"Das Angebot ist in Lexoffice nicht als angenommen markiert."},409);
        let contact = null;
        if (quotation.contactId) {
          try {
            contact = normalizeLexwareContact(await lexwareRequest(env, `/contacts/${encodeURIComponent(quotation.contactId)}`));
          } catch {}
        }
        quotation.contact = contact;
        return jsonResponse(request,{ok:true,quotation});
      }

      if (url.pathname === "/profile") {
        const profile = await lexwareRequest(
          env,
          "/profile"
        );

        return jsonResponse(request, {
          ok: true,
          profile,
        });
      }

      if (
        url.pathname === "/contacts" &&
        request.method === "POST"
      ) {
        const data = await request.json();
        const payload = buildLexwareContactPayload(data);

        const contact = await lexwareRequest(
          env,
          "/contacts",
          {
            method: "POST",
            body: JSON.stringify(payload),
          }
        );

        return jsonResponse(
          request,
          {
            ok: true,
            contact,
          },
          201
        );
      }



      if (
        url.pathname === "/lexware/contacts/search" &&
        request.method === "GET"
      ) {
        const term = String(url.searchParams.get("term") || "").trim();

        if (term.length < 3) {
          return jsonResponse(
            request,
            { ok: false, error: "Mindestens 3 Zeichen eingeben." },
            400
          );
        }

        const isNumber = /^\d+$/.test(term);
        let path = "/contacts?customer=true&archived=false&page=0&size=100";

        if (isNumber) {
          path += `&number=${encodeURIComponent(term)}`;
        } else if (term.includes("@")) {
          path += `&email=${encodeURIComponent(term)}`;
        } else {
          path += `&name=${encodeURIComponent(term)}`;
        }

        const result = await lexwareRequest(env, path);
        const contacts = (result.content || [])
          .map(normalizeLexwareContact)
          .filter((contact) => !contact.archived);

        return jsonResponse(request, { ok: true, contacts });
      }

      if (
        url.pathname.startsWith("/lexware/contacts/") &&
        request.method === "GET"
      ) {
        const contactId = url.pathname.split("/").pop();
        const contactData = await lexwareRequest(
          env,
          `/contacts/${encodeURIComponent(contactId)}`
        );

        return jsonResponse(request, {
          ok: true,
          contact: normalizeLexwareContact(contactData),
        });
      }

      if (url.pathname === "/articles" && request.method === "GET") {
        let page = 0;
        const articles = [];
        let last = false;

        while (!last && page < 20) {
          const result = await lexwareRequest(
            env,
            `/articles?page=${page}&size=250`
          );

          articles.push(
            ...(result.content || []).map((article) => ({
              id: article.id,
              title: article.title,
              description: article.description || "",
              articleNumber: article.articleNumber || "",
              unitName: article.unitName || "",
              type: article.type,
              price: article.price || null,
            }))
          );

          last = result.last !== false;
          page += 1;
        }

        return jsonResponse(request, {
          ok: true,
          articles,
        });
      }

      if (
        url.pathname === "/quotations" &&
        request.method === "POST"
      ) {
        const payload = await request.json();
        const customer = payload.customer || {};
        const quotation = payload.quotation || {};

        let contactId = String(
          customer.lexwareContactId || ""
        ).trim();

        if (!contactId) {
          const contactPayload = buildLexwareContactPayload({
            salutation: customer.salutation,
            firstName: customer.firstName,
            lastName: customer.lastName,
            street: customer.street,
            zip: customer.zip,
            city: customer.city,
            email: customer.email,
            phone: customer.phone,
            note: "Erstellt über mainabdichter Pro",
          });

          if (String(customer.company || "").trim()) {
            delete contactPayload.person;
            contactPayload.company = {
              name: String(customer.company).trim(),
              contactPersons: [
                {
                  salutation: String(customer.salutation || "").trim(),
                  firstName: String(customer.firstName || "").trim(),
                  lastName: String(customer.lastName || "").trim(),
                },
              ],
            };
          }

          const createdContact = await lexwareRequest(
            env,
            "/contacts",
            {
              method: "POST",
              body: JSON.stringify(contactPayload),
            }
          );

          contactId = createdContact.id;
        }

        if (
          !Array.isArray(quotation.lineItems) ||
          quotation.lineItems.length === 0
        ) {
          return jsonResponse(
            request,
            {
              ok: false,
              error: "Das Angebot enthält keine Positionen.",
            },
            400
          );
        }

        const normalizedLineItems = quotation.lineItems.map(
          (item, index) => {
            const quantity = Number(item.quantity);
            const grossAmount = Number(
              item.unitPrice && item.unitPrice.grossAmount
            );
            const taxRatePercentage = Number(
              item.unitPrice &&
              item.unitPrice.taxRatePercentage
            );

            if (
              !Number.isFinite(quantity) ||
              quantity <= 0
            ) {
              throw Object.assign(
                new Error(
                  `Ungültige Menge in Position ${index + 1}: ${item.name || "ohne Bezeichnung"}`
                ),
                { status: 400 }
              );
            }

            if (
              !Number.isFinite(grossAmount) ||
              grossAmount < 0
            ) {
              throw Object.assign(
                new Error(
                  `Ungültiger Preis in Position ${index + 1}: ${item.name || "ohne Bezeichnung"}`
                ),
                { status: 400 }
              );
            }

            const type = ["custom", "material", "service", "text"].includes(
              item.type
            )
              ? item.type
              : "custom";

            return {
              ...(type === "material" || type === "service"
                ? { id: item.id }
                : {}),
              type,
              name: String(
                item.name || `Position ${index + 1}`
              ).slice(0, 255),
              description: String(
                item.description || ""
              ).slice(0, 2000),
              quantity,
              unitName: String(
                item.unitName || "Stück"
              ),
              unitPrice: {
                currency: "EUR",
                grossAmount,
                taxRatePercentage:
                  Number.isFinite(taxRatePercentage)
                    ? taxRatePercentage
                    : 19,
              },
              discountPercentage: Number(
                item.discountPercentage || 0
              ),
            };
          }
        );

        const now = new Date();
        const expiration = new Date(
          now.getTime() + 30 * 24 * 60 * 60 * 1000
        );

        const quotationPayload = {
          voucherDate: now.toISOString(),
          expirationDate: expiration.toISOString(),
          address: {
            contactId,
          },
          lineItems: normalizedLineItems,
          totalPrice: {
            currency: "EUR",
          },
          taxConditions: {
            taxType: "gross",
          },
          introduction:
            quotation.introduction ||
            "Gerne bieten wir Ihnen an:",
          remark:
            quotation.remark ||
            "Wir freuen uns auf Ihre Auftragserteilung.",
          title: quotation.title || "Angebot",
        };

        if (quotation.paymentDiscount) {
          quotationPayload.paymentConditions = {
            paymentTermLabel: `${quotation.paymentDiscount.discountRange} Tage - ${quotation.paymentDiscount.discountPercentage} % Skonto, 14 Tage netto`,
            paymentTermDuration: 14,
            paymentDiscountConditions: quotation.paymentDiscount,
          };
        }

        if (quotation.objectAddress) {
          quotationPayload.introduction +=
            `\n\nObjektanschrift: ${quotation.objectAddress}`;
        }

        const createdQuotation = await lexwareRequest(
          env,
          "/quotations?finalize=false",
          {
            method: "POST",
            body: JSON.stringify(quotationPayload),
          }
        );

        return jsonResponse(
          request,
          {
            ok: true,
            contactId,
            quotationId: createdQuotation.id,
            resourceUri: createdQuotation.resourceUri,
            editUrl: `https://app.lexware.de/permalink/quotations/edit/${createdQuotation.id}`,
          },
          201
        );
      }

      if (
        url.pathname === "/lexware/invoices/from-quotation" &&
        request.method === "POST"
      ) {
        const payload = await request.json();
        const quotationId = String(payload.quotationId || "").trim();
        if (!quotationId) {
          return jsonResponse(request, {
            ok: false,
            error: "Für diese Baustelle ist kein Lexoffice-Angebot hinterlegt."
          }, 400);
        }
        const createdInvoice = await lexwareRequest(
          env,
          `/invoices?precedingSalesVoucherId=${encodeURIComponent(quotationId)}&finalize=false`,
          {
            method: "POST",
            body: JSON.stringify({})
          }
        );
        return jsonResponse(request, {
          ok: true,
          invoiceId: createdInvoice.id,
          resourceUri: createdInvoice.resourceUri,
          editUrl: `https://app.lexware.de/permalink/invoices/edit/${createdInvoice.id}`
        }, 201);
      }

      return jsonResponse(
        request,
        {
          ok: false,
          error: "Endpunkt nicht gefunden.",
        },
        404
      );
    } catch (error) {
      return jsonResponse(
        request,
        {
          ok: false,
          error: error.message || "Fehler",
          status: error.status || 500,
          details: error.details || null,
        },
        error.status || 500
      );
    }
  },
};
