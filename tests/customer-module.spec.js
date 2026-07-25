const { readFileSync } = require("node:fs");
const { test, expect } = require("@playwright/test");

test.use({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true
});

test("Worker trennt Kundenhistorie sicher vom Personenabruf", () => {
  const worker = readFileSync("cloudflare-worker.js", "utf8");
  const historyRoute = worker.indexOf("customer-history$/.test(url.pathname)");
  const personRoute = worker.indexOf("\\/persons\\/\\d+$/.test(url.pathname)");

  expect(historyRoute).toBeGreaterThan(-1);
  expect(personRoute).toBeGreaterThan(historyRoute);
  expect(worker).not.toContain('url.pathname.startsWith("/pipedrive/persons/")');
});

test("Plusknopf führt verständlich in eine neue Anfrage", async ({ page }) => {
  await page.goto("http://127.0.0.1:4173/index.html");
  await page.locator("#v28FloatingAdd").click();

  await expect(page.locator("#newInquiryModal")).not.toHaveClass(/hidden/);
  await expect(page.getByRole("heading", { name: "Wie kommt die Anfrage rein?" })).toBeVisible();
  await expect(page.locator("#newInquiryScreenshot")).toContainText("Screenshot übernehmen");
  await expect(page.locator("#newInquiryExisting")).toContainText("Vorhandener Kunde");
  await expect(page.locator("#newInquiryManual")).toContainText("Manuell erfassen");

  await page.locator("#newInquiryExisting").click();
  await expect(page.locator("#customers")).toHaveClass(/active/);
  await expect(page.locator("#customerSearch")).toBeFocused();

  await page.locator('[data-bottom-page="dashboard"]').click();
  await page.locator("#v28FloatingAdd").click();
  await page.locator("#newInquiryManual").click();
  await expect(page.locator("#visit")).toHaveClass(/active/);
  await expect(page.locator("#visitNumber")).not.toHaveValue("");
});

test("Anfrage wird geführt erfasst und zur Vor-Ort-Besichtigung übergeben", async ({ page }) => {
  await page.goto("http://127.0.0.1:4173/index.html");
  await page.locator("#v28FloatingAdd").click();
  await page.locator("#newInquiryManual").click();

  await expect(page.locator("#inquiryPlanningCard")).toBeVisible();
  await page.locator("#inquirySource").selectOption({ label: "Telefon" });
  await page.locator("#inquiryConcern").selectOption({ label: "Feuchter Keller / feuchte Wand" });
  await page.locator('[data-inquiry-symptom="Muffiger Geruch"]').check();
  await page.locator('[data-inquiry-symptom="Abplatzender Putz"]').check();
  await page.locator('[data-inquiry-urgency="soon"]').click();
  await page.locator("#inquiryAppointmentStatus").selectOption("scheduled");
  await page.locator("#inquiryAppointmentDate").fill("2026-07-28");
  await page.locator("#inquiryAppointmentTime").fill("09:30");
  await page.locator("#saveInquiryPlanning").click();

  await expect(page.locator("#inquiryPlanningState")).toHaveText("✓ geplant");
  await expect(page.locator("#inquiryNextAction")).toContainText("28.07.2026");
  await page.locator("#startOnsiteVisit").click();
  await expect(page.locator("#visitDate")).toHaveValue("2026-07-28");
  await expect(page.locator("#visitStartTime")).toHaveValue("09:30");

  const inquiry = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("mainabdichter_v10_visit")).inquiry
  );
  expect(inquiry.symptoms).toEqual(["Muffiger Geruch", "Abplatzender Putz"]);
  expect(inquiry.urgency).toBe("soon");
});

test("Vor-Ort-Besichtigung schlägt eine Maßnahme vor und verlangt Messwerte", async ({ page }) => {
  await page.goto("http://127.0.0.1:4173/index.html");
  await page.locator("#v28FloatingAdd").click();
  await page.locator("#newInquiryManual").click();

  await page.locator("#visitStep3 > summary").click();
  await page.locator('[data-damage-tag="Feuchte Flecken"]').check();
  await page.locator('[data-moisture-pattern="rising"]').click();
  await page.locator("#visitStep4 > summary").click();
  await page.locator("#addArea").click();
  await page.locator('[data-field="name"]').fill("Keller Außenwand");
  await page.locator('[data-field="wallMaterial"]').selectOption({ label: "HBL / Hohlblockstein" });
  await page.locator('[data-field="wallThickness"]').selectOption("30");
  await page.locator(".area-advanced summary").click();
  await page.locator('[data-field="earthContact"]').selectOption({ label: "erdberührt" });
  await page.locator("[data-add-measurement]").click();
  await expect(page.locator('[data-mf="device"]')).toHaveValue("Gann Hydromette Compact B");
  await expect(page.locator(".measurement-device-current")).toContainText("Gann Hydromette Compact B");
  await page.locator('[data-mf="value"]').fill("120");

  await page.locator("#visitStep3 > summary").click();
  await page.locator("#checkMeasureSuggestion").click();
  await expect(page.locator("#measureSuggestion")).toContainText("Horizontalsperre");
  await page.locator("#acceptMeasureSuggestion").click();
  await expect(page.locator("#generatedRecommendation")).toContainText("Horizontalsperre");

  const visit = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("mainabdichter_v10_visit"))
  );
  expect(visit.areas[0].measurements[0].unit).toBe("Digits");
  expect(visit.areas[0].measures[0].type).toBe("Horizontalsperre");
});

test("Besichtigungszusammenfassung muss vor dem Angebot bestätigt werden", async ({ page }) => {
  await page.goto("http://127.0.0.1:4173/index.html");
  await page.locator("#v28FloatingAdd").click();
  await page.locator("#newInquiryManual").click();
  await page.locator("#firstName").fill("Max");
  await page.locator("#phone").fill("0171 1234567");
  await page.locator("#street").fill("Musterstraße 1");
  await page.locator("#zip").fill("35794");
  await page.locator("#city").fill("Mengerskirchen");
  await page.locator("#visitOptionalDetails summary").first().click();
  await page.locator("#visitStep2 > summary").click();
  await page.locator("#buildingType").selectOption({ label: "freistehendes Einfamilienhaus" });
  await page.locator("#floor").selectOption({ label: "Keller" });
  await page.locator("#roomUse").selectOption({ label: "Kellerraum" });
  await page.locator("#visitStep3 > summary").click();
  await page.locator('[data-damage-tag="Feuchte Flecken"]').check();
  await page.locator('[data-moisture-pattern="rising"]').click();
  await page.locator("#visitStep4 > summary").click();
  await page.locator("#addArea").click();
  await page.locator('[data-field="name"]').fill("Keller Außenwand");
  await page.locator('[data-field="wallMaterial"]').selectOption({ label: "HBL / Hohlblockstein" });
  await page.locator('[data-field="wallThickness"]').selectOption("30");
  await page.locator("[data-add-measurement]").click();
  await expect(page.locator('[data-mf="device"]')).toHaveValue("Gann Hydromette Compact B");
  await page.locator('[data-mf="value"]').fill("120");
  await page.locator("[data-add-measure]").click();
  await page.locator('[data-mfield="type"]').selectOption("Horizontalsperre");
  await page.locator('[data-mfield="length"]').fill("12");
  await page.locator("#visitSummary > summary").click();

  await expect(page.locator("#visit")).toHaveClass(/active/);
  await expect(page.locator("#visitSummary")).toHaveAttribute("open", "");
  await expect(page.locator("#inspectionSummary")).toContainText("Keller Außenwand");
  await expect(page.locator("#inspectionSummary")).toContainText("120");
  await expect(page.locator("#inspectionSummary")).toContainText("Horizontalsperre");

  await page.locator("#visitOfferBasis summary").click();
  await page.locator("#offerBasisNote").fill("Zugang vor Ausführung freiräumen.");
  await page.locator("#offerBasisApproved").check();
  const offerBasis = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("mainabdichter_v10_visit")).offerBasis
  );
  expect(offerBasis.approved).toBe(true);
  expect(offerBasis.note).toBe("Zugang vor Ausführung freiräumen.");
});

test("Angebotspositionen müssen vor Lexware einzeln geprüft werden", async ({ page }) => {
  await page.goto("http://127.0.0.1:4173/index.html");
  await page.evaluate(() => {
    const visit=JSON.parse(localStorage.getItem("mainabdichter_v10_visit"));
    visit.customer={...visit.customer,firstName:"Max",lastName:"Mustermann",street:"Musterstraße 1",zip:"35794",city:"Mengerskirchen"};
    visit.areas=[{
      id:"area-1",name:"Keller",wallMaterial:"HBL",wallThickness:"30",measurements:[],photos:[],
      measures:[{id:"measure-1",type:"Horizontalsperre",length:"12",wall:"30",spacing:".25",note:""}]
    }];
    localStorage.setItem("mainabdichter_v10_visit",JSON.stringify(visit));
  });
  await page.reload();
  await page.evaluate(() => {
    document.querySelectorAll(".page").forEach(section => section.classList.remove("active"));
    document.querySelector("#offer").classList.add("active");
  });

  await expect(page.locator("#offerPositionReview .offer-position-row")).toHaveCount(1);
  await expect(page.locator("#sendLexware")).toBeDisabled();
  await page.locator("[data-offer-price]").fill("250");
  await page.locator("[data-offer-price]").blur();
  await expect(page.locator(".offer-review-total")).toContainText("3.000,00");
  await page.locator("#offerPositionsApproved").evaluate(input => {
    input.checked = true;
    input.dispatchEvent(new Event("change", { bubbles:true }));
  });
  await expect(page.locator("#sendLexware")).toBeEnabled();
  await page.locator("[data-offer-include]").evaluate(input => {
    input.checked = false;
    input.dispatchEvent(new Event("change", { bubbles:true }));
  });
  await expect(page.locator("#sendLexware")).toBeDisabled();
  await expect(page.locator("#offerPositionsApproved")).not.toBeChecked();
});

test("Fehlende Information springt direkt ins Feld und Angebotsgrundlage bleibt zuletzt", async ({ page }) => {
  await page.goto("http://127.0.0.1:4173/index.html");
  await page.locator("#v28FloatingAdd").click();
  await page.locator("#newInquiryManual").click();
  await page.locator("#visitSummary > summary").click();

  const missingCustomer = page.locator('[data-missing-check="0"]');
  await expect(missingCustomer).toContainText("Antippen und ergänzen");
  await missingCustomer.click();
  await expect(page.locator("#visitStep1")).toHaveAttribute("open", "");
  await expect(page.locator("#firstName")).toBeFocused();

  const order = await page.evaluate(() => {
    const completion = document.querySelector("#visitCompletion");
    const basis = document.querySelector("#visitOfferBasis");
    return Boolean(completion.compareDocumentPosition(basis) & Node.DOCUMENT_POSITION_FOLLOWING);
  });
  expect(order).toBe(true);
  await expect(page.locator("#visitOfferBasis")).toHaveClass(/is-locked/);
});

test("Als optional gekennzeichnete Felder bleiben leer ohne Fehlermeldung", async ({ page }) => {
  await page.goto("http://127.0.0.1:4173/index.html");

  const optionalIds = [
    "visitEndTime",
    "floorCover",
    "damageDescription",
    "visitDocumentNote",
    "offerBasisNote"
  ];

  for (const id of optionalIds) {
    const field = page.locator(`#${id}`);
    await expect(field).toHaveValue("");
    const label = field.locator("xpath=preceding::label[1]");
    await expect(label).toContainText("optional");
  }

  const missingLabels = await page.locator("[data-missing-check] span").allTextContents();
  for (const optionalLabel of ["Ende", "Bodenbelag", "Zusätzliche Beschreibung", "Bemerkung", "Interne Hinweise"]) {
    expect(missingLabels.some(label => label.includes(optionalLabel))).toBe(false);
  }
});

test("Pflichtangaben können in den Einstellungen optional gesetzt werden", async ({ page }) => {
  await page.goto("http://127.0.0.1:4173/index.html");
  await page.locator('[data-bottom-page="more"]').click();
  await page.locator('[data-more-page="settings"]').click();
  await page.getByText("Pflichtfelder der Besichtigung", { exact: true }).click();
  await page.locator('[data-visit-requirement="buildingType"]').uncheck();
  await page.locator('[data-visit-requirement="floor"]').uncheck();
  await page.locator('[data-visit-requirement="roomUse"]').uncheck();
  await page.locator("#saveSettings").click();
  await page.locator('[data-bottom-page="dashboard"]').click();
  await page.locator("#v28FloatingAdd").click();
  await page.locator("#newInquiryManual").click();
  await page.locator("#visitSummary > summary").click();
  await expect(page.locator("#visitChecklist")).not.toContainText("Bauart");
  await expect(page.locator("#visitChecklist")).not.toContainText("Geschoss");
  await expect(page.locator("#visitChecklist")).not.toContainText("Raumnutzung");
});

test("Unterfelder der Schadensbegutachtung sind einzeln als Pflicht oder optional wählbar", async ({ page }) => {
  await page.goto("http://127.0.0.1:4173/index.html");
  await page.locator('[data-bottom-page="more"]').click();
  await page.locator('[data-more-page="settings"]').click();
  await expect(page.locator('[data-visit-requirement="wallMaterial"]')).toBeAttached();
  await expect(page.locator('[data-visit-requirement="wallThickness"]')).toBeAttached();
  await expect(page.locator('[data-visit-requirement="earthContact"]')).toBeAttached();
  await expect(page.locator('[data-visit-requirement="measurementDevice"]')).toBeAttached();
  await expect(page.locator('[data-visit-requirement="measurementValue"]')).toBeAttached();
  await expect(page.locator('[data-visit-requirement="measurementLocation"]')).toBeAttached();
});

test("Grundriss wird dem Kunden zugeordnet und zu Google Drive hochgeladen", async ({ page }) => {
  await page.addInitScript(() => {
    const settings = JSON.parse(localStorage.getItem("mainabdichter_v10_settings") || "{}");
    settings.workerUrl = "https://mainabdichter-api.test";
    settings.appSecret = "test-secret";
    localStorage.setItem("mainabdichter_v10_settings", JSON.stringify(settings));
  });
  await page.route("https://mainabdichter-api.test/drive/documents", async route => {
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, file: { id: "drive-plan-1", webViewLink: "https://drive.google.com/file/d/drive-plan-1/view" } })
    });
  });
  await page.goto("http://127.0.0.1:4173/index.html");
  await page.locator("#v28FloatingAdd").click();
  await page.locator("#newInquiryManual").click();
  await page.locator("#lastName").fill("Mustermann");
  await page.locator("#firstName").fill("Max");
  await page.locator("#visitOptionalDetails summary").first().click();
  await page.locator("#visitStep5 > summary").click();
  await page.locator("#visitDocumentCategory").selectOption("Grundriss");
  await page.locator("#visitDocumentNote").fill("Keller mit markierter Nordwand");
  await page.locator("#visitDocumentInput").setInputFiles({
    name: "kellergrundriss.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4 Test")
  });

  await expect(page.locator("#visitDocumentList")).toContainText("In Google Drive gespeichert");
  await expect(page.locator("#visitDocumentList")).toContainText("Keller mit markierter Nordwand");
  const document = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("mainabdichter_v10_visit")).documents[0]
  );
  expect(document.category).toBe("Grundriss");
  expect(document.driveFileId).toBe("drive-plan-1");
});

test("Kundenmodul funktioniert auf iPhone-Breite", async ({ page }) => {
  const browserErrors = [];
  page.on("pageerror", error => browserErrors.push(error.message));

  await page.goto("http://127.0.0.1:4173/index.html");
  await page.locator("#bottomCustomers").click();
  await expect(page.locator("#customers")).toHaveClass(/active/);
  await expect(page.locator("#customerList")).toContainText("Noch keine passenden Kunden");

  await page.locator("#customerCreateNew").click();
  await page.locator("#customerFirstName").fill("Maximilian");
  await page.locator("#customerLastName").fill("Mustermann");
  await page.locator("#customerPhone").fill("0171 1234567");
  await page.locator("#customerMobile").fill("0160 91128681");
  await page.locator("#customerEmail").fill("max@example.de");
  await page.locator("#customerStreet").fill("Musterstraße 12");
  await page.locator("#customerZip").fill("35794");
  await page.locator("#customerCity").fill("Mengerskirchen");

  await expect(page.locator("#customerObjectStreet")).toHaveValue("Musterstraße 12");
  await expect(page.locator("#customerObjectZip")).toHaveValue("35794");
  await expect(page.locator("#customerObjectCity")).toHaveValue("Mengerskirchen");
  await expect(page.locator("#customerObjectStreet")).toHaveAttribute("readonly", "");

  await page.locator("#customerObjectDifferent").check();
  await page.locator("#customerObjectStreet").fill("Objektweg 3");
  await page.locator("#customerObjectZip").fill("65549");
  await page.locator("#customerObjectCity").fill("Limburg");
  await page.locator("#customerSave").click();
  await expect(page.locator("#customerFormStatus")).toContainText("gespeichert");

  await page.locator("#customerEditorClose").click();
  await expect(page.locator("#customerList")).toContainText("Maximilian Mustermann");
  await expect(page.locator("#customerList")).toContainText("Objektweg 3, 65549 Limburg");
  await expect(page.locator(".customer-whatsapp")).toBeVisible();

  await page.getByRole("button", { name: "Kundenakte" }).click();
  await expect(page.locator("#customerRecordTitle")).toHaveText("Maximilian Mustermann");
  await expect(page.locator("#customerRecordOffers")).toContainText("noch keine gespeicherten");
  await expect(page.locator("#customerRecordWorksites")).toContainText("noch keine Baustelle");
  await page.locator("#customerRecordClose").click();

  const horizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth
  );
  expect(horizontalOverflow).toBe(false);
  expect(browserErrors).toEqual([]);
});

test("Pipedrive-Aktualisierung erhält eine bewusst abweichende Objektadresse", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("mainabdichter_v10_settings", JSON.stringify({
      workerUrl: "https://worker.test",
      appSecret: "test-secret"
    }));
    localStorage.setItem("mainabdichter_v30_customers", JSON.stringify([{
      id: "customer-address",
      firstName: "Max",
      lastName: "Muster",
      street: "Alte Poststraße 1",
      zip: "65589",
      city: "Hadamar",
      objectAddressDifferent: true,
      objectStreet: "Baustellenweg 8",
      objectZip: "65549",
      objectCity: "Limburg",
      objectAddress: "Baustellenweg 8, 65549 Limburg",
      pipedriveId: "4"
    }]));
  });
  await page.route("https://worker.test/**", route => route.fulfill({ json: {
    ok: true,
    person: {
      id: 4,
      firstName: "Max",
      lastName: "Muster",
      street: "Neue Poststraße 2",
      zip: "35794",
      city: "Mengerskirchen",
      postalAddress: "Neue Poststraße 2, 35794 Mengerskirchen"
    }
  }}));

  await page.goto("http://127.0.0.1:4173/index.html");
  await page.locator("#bottomCustomers").click();
  await page.getByRole("button", { name: "Bearbeiten" }).click();
  await page.locator("#customerRefreshPipedrive").click();

  await expect(page.locator("#customerStreet")).toHaveValue("Neue Poststraße 2");
  await expect(page.locator("#customerObjectStreet")).toHaveValue("Baustellenweg 8");
  await expect(page.locator("#customerObjectDifferent")).toBeChecked();
});

test("Gesamte Pipedrive-Kundenliste wird seitenweise und ohne Dubletten aktualisiert", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("mainabdichter_v10_settings", JSON.stringify({
      workerUrl: "https://worker.test",
      appSecret: "test-secret"
    }));
    localStorage.setItem("mainabdichter_v30_customers", JSON.stringify([{
      id: "local-4",
      firstName: "Mike",
      lastName: "Alt",
      street: "Alte Straße 1",
      zip: "65589",
      city: "Hadamar",
      objectAddressDifferent: true,
      objectStreet: "Objektweg 3",
      objectZip: "65549",
      objectCity: "Limburg",
      objectAddress: "Objektweg 3, 65549 Limburg",
      pipedriveId: "4"
    }]));
  });

  await page.route("https://worker.test/pipedrive/persons*", route => {
    const cursor = new URL(route.request().url()).searchParams.get("cursor");
    return route.fulfill({ json: cursor
      ? {
          ok: true,
          people: [{
            id: 5,
            firstName: "Daria",
            lastName: "Drenske",
            street: "Dorfstraße 7",
            zip: "35794",
            city: "Mengerskirchen"
          }],
          nextCursor: null
        }
      : {
          ok: true,
          people: [{
            id: 4,
            firstName: "Mike",
            lastName: "Sprager",
            street: "Ringstr. 24",
            zip: "65589",
            city: "Hadamar"
          }],
          nextCursor: "seite-2"
        }
    });
  });

  await page.goto("http://127.0.0.1:4173/index.html");
  await page.locator("#bottomCustomers").click();
  await page.locator("#customerSyncPipedrive").click();

  await expect(page.locator("#customerListStatus")).toContainText("2 Pipedrive-Kunden");
  await expect(page.locator("#customerList")).toContainText("Mike Sprager");
  await expect(page.locator("#customerList")).toContainText("Daria Drenske");
  await page.getByRole("button", { name: "Bearbeiten" }).first().click();
  const stored = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("mainabdichter_v30_customers") || "[]")
  );
  expect(stored).toHaveLength(2);
  expect(stored.find(item => item.pipedriveId === "4").objectAddress)
    .toBe("Objektweg 3, 65549 Limburg");
});

test("Kundenakte lädt echte Pipedrive- und Lexware-Daten", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("mainabdichter_v10_settings", JSON.stringify({
      workerUrl: "https://worker.test",
      appSecret: "test-secret"
    }));
    localStorage.setItem("mainabdichter_v30_customers", JSON.stringify([{
      id: "customer-1",
      firstName: "Mike",
      lastName: "Sprager",
      phone: "016091128681",
      email: "mike@sprager.de",
      street: "Ringstr. 24",
      zip: "65589",
      city: "Hadamar",
      objectAddress: "Ringstr. 24, 65589 Hadamar",
      pipedriveId: "4"
    }]));
  });
  await page.route("https://worker.test/**", async route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/customer-history") && url.pathname.includes("/pipedrive/")) {
      return route.fulfill({ json: {
        ok: true,
        deals: [{ id: 8, title: "Kellerabdichtung", status: "open", value: 4200, updateTime: "2026-07-24" }],
        notes: [{ id: 9, content: "Kunde möchte einen Termin.", addTime: "2026-07-23" }],
        activities: [{ id: 10, subject: "Kunden anrufen", dueDate: "2026-07-25", done: false }]
      }});
    }
    if (url.pathname === "/lexware/customer-history") {
      return route.fulfill({ json: {
        ok: true,
        contact: { id: "lex-1", name: "Mike Sprager" },
        documents: [{
          id: "invoice-1",
          voucherType: "invoice",
          voucherNumber: "RE-2026-100",
          voucherDate: "2026-07-20",
          voucherStatus: "open",
          totalAmount: 2499,
          currency: "EUR"
        }]
      }});
    }
    return route.fulfill({ status: 404, json: { ok: false, error: "Test-Endpunkt fehlt" } });
  });

  await page.goto("http://127.0.0.1:4173/index.html");
  await page.locator("#bottomCustomers").click();
  await page.getByRole("button", { name: "Kundenakte" }).click();
  await page.locator("#customerRecordRefresh").click();
  await expect(page.locator("#customerRecordSyncStatus")).toContainText("aktualisiert");
  await expect(page.locator("#customerRecordPipedriveHistory")).toContainText("Kellerabdichtung");
  await expect(page.locator("#customerRecordPipedriveHistory")).toContainText("Kunden anrufen");
  await expect(page.locator("#customerRecordLexware")).toContainText("RE-2026-100");
});
