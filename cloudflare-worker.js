// mainabdichter PRO Cloudflare Worker V25.2
// Pipedrive-Personen-, Adress- und Baustellen-Synchronisation.
// postal_address wird nicht mehr unzulässig an API v2 gesendet.

const LEXWARE_API = "https://api.lexware.io/v1";

// Cache pro Worker-Instanz für das konfigurierte Pipedrive-Adressfeld.
let pipedrivePersonAddressFieldCache = null;

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
    let message = "Lexware API Fehler";

    if (response.status === 401) {
      message = "Lexware API-Key ungültig oder abgelaufen";
    } else if (response.status === 403) {
      message = "Lexware API-Key hat keine Berechtigung für Angebote";
    } else if (response.status === 404) {
      message = "Lexware-Ressource nicht gefunden";
    } else if (response.status === 406) {
      message = "Lexware hat die Angebotsdaten abgelehnt";
    } else if (response.status === 429) {
      message = "Lexware-Anfragelimit erreicht";
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

  return {
    id: person.id,
    name: person.name || "",
    firstName: person.first_name || split.firstName,
    lastName: person.last_name || split.lastName,
    email: firstValue(person.emails || person.email),
    phone: firstValue(person.phones || person.phone),
    street: address.street || "",
    zip: address.zip || "",
    city: address.city || "",
    postalAddress: postal,
    objectAddress:
      cleanText(person.object_address || person.objectAddress) || postal,
    objectAddressDifferent: Boolean(
      cleanText(person.object_address || person.objectAddress) &&
      cleanText(person.object_address || person.objectAddress) !== postal
    ),
    customFields
  };
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
    phones: input.phone
      ? [{ value: cleanText(input.phone), primary: true, label: "mobile" }]
      : []
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
      [addressField]: postalAddress
    };
  }

  return payload;
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
  const form = new FormData();
  form.append("file", file, file.name || "Dokument.pdf");
  form.append("deal_id", String(dealId));
  const response = await fetch(url, { method: "POST", body: form });
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
  const term = String(title || "Auftrag").trim().slice(0, 100) || "Auftrag";
  const result = await pipedriveRequest(
    env,
    `/api/v2/deals/search?term=${encodeURIComponent(term)}&person_id=${encodeURIComponent(personId)}&status=open&limit=20`
  );
  const items = result?.data?.items || [];
  return items.length ? (items[0].item || items[0]) : null;
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
        });
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
        const customFields = input.customFields && typeof input.customFields === "object"
          ? input.customFields
          : {};

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

        return jsonResponse(request, { ok: true, deal, created }, created ? 201 : 200);
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
          workerVersion: "25.2",
          addressSync: true,
          postalAddressPayloadFixed: true
        });
      }

      if (
        url.pathname === "/pipedrive/persons" &&
        request.method === "POST"
      ) {
        const input = await request.json();
        const name = String(input.name || "").trim();
        const email = String(input.email || "").trim();
        const phone = String(input.phone || "").trim();
        if (!name) return jsonResponse(request,{ok:false,error:"Name fehlt."},400);

        let person = await findExistingPipedrivePerson(env,email,phone);
        let created = false;
        if (!person) {
          const payload = await createPipedrivePersonPayload(env, { ...input, name, email, phone });
          const result = await pipedriveRequest(env,"/api/v2/persons",{
            method:"POST", body:JSON.stringify(payload)
          });
          person = normalizePipedrivePerson(result.data || result);
          created = true;
        } else {
          const updatePayload = await createPipedrivePersonPayload(env, { ...input, name, email, phone });
          const updated = await pipedriveRequest(env, `/api/v2/persons/${person.id}`, {
            method: "PATCH", body: JSON.stringify(updatePayload)
          });
          person = normalizePipedrivePerson(updated.data || updated);
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
        return jsonResponse(request,{ok:true,person,created},created ? 201 : 200);
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
        url.pathname.startsWith("/pipedrive/persons/")
      ) {
        const id = url.pathname.split("/").pop();

        // Bewusst ohne include_fields oder custom_fields:
        // Der Standard-Detailabruf ist stabil und verhindert,
        // dass Systemfelder fälschlich als Custom Fields gesendet werden.
        const addressField = await resolvePipedrivePersonAddressField(env);
        const customFieldQuery = addressField
          ? `?custom_fields=${encodeURIComponent(addressField)}`
          : "";

        const personData = await pipedriveRequest(
          env,
          `/api/v2/persons/${encodeURIComponent(id)}${customFieldQuery}`
        );

        const rawPerson = personData.data || personData;
        if (
          addressField &&
          rawPerson.custom_fields &&
          rawPerson.custom_fields[addressField] !== undefined
        ) {
          rawPerson._mainabdichter_address_value =
            rawPerson.custom_fields[addressField];
        }

        const person = normalizePipedrivePerson(rawPerson);

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
            const addressField = await resolvePipedrivePersonAddressField(env);
            const customFieldQuery = addressField
              ? `?custom_fields=${encodeURIComponent(addressField)}`
              : "";
            const personResult = await pipedriveRequest(
              env,
              `/api/v2/persons/${personId}${customFieldQuery}`
            );
            const rawPerson = personResult.data || personResult;
            if (
              addressField &&
              rawPerson.custom_fields &&
              rawPerson.custom_fields[addressField] !== undefined
            ) {
              rawPerson._mainabdichter_address_value =
                rawPerson.custom_fields[addressField];
            }
            person = normalizePipedrivePerson(rawPerson);
          } catch {}
        }

        return jsonResponse(request, {
          ok: true,
          context: {
            loaded: true,
            loadedAt: new Date().toISOString(),
            deal,
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
            warning: "Kein eindeutig passender Lexware-Kontakt gefunden."
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

      if (url.pathname === "/pipedrive/activities" && request.method === "GET") {
        const date = url.searchParams.get("date") || new Date().toISOString().slice(0,10);
        const result = await pipedriveRequest(env,"/api/v2/activities?done=false&sort_by=due_date&sort_direction=asc&limit=500");
        const activities=(result.data||[]).filter(item=>item&&item.due_date===date).map(item=>{const p=Array.isArray(item.participants)?item.participants.find(x=>x?.primary)||item.participants[0]:null;const location=item.location&&typeof item.location==="object"?(item.location.value||item.location.address||item.location.formatted_address||""):(item.location||"");const personId=item.person_id&&typeof item.person_id==="object"?(item.person_id.value||item.person_id.id||""):(item.person_id||p?.person_id||"");const dealId=item.deal_id&&typeof item.deal_id==="object"?(item.deal_id.value||item.deal_id.id||""):(item.deal_id||"");return{id:item.id||"",subject:item.subject||"Ohne Betreff",type:item.type||"",dueDate:item.due_date||"",dueTime:item.due_time||"",duration:item.duration||"",personId,dealId,location,note:item.note||"",personName:item.person_name||p?.name||""};});
        return jsonResponse(request,{ok:true,activities});
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

      if (url.pathname.startsWith("/lexware/accepted-quotations/") && request.method === "GET") {
        const id=url.pathname.split("/").pop();
        const quotation=await lexwareRequest(env,`/quotations/${encodeURIComponent(id)}`);
        if (quotation.voucherStatus !== "accepted") return jsonResponse(request,{ok:false,error:"Das Angebot ist in Lexware nicht als angenommen markiert."},409);
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
