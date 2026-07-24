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
