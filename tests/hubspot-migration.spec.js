const { test, expect } = require("@playwright/test");

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

test("alter Pipedrive-Deal wird einmalig nach HubSpot übernommen", async ({ page }) => {
  const customer = {
    id: "kunde-alt-1",
    firstName: "Max",
    lastName: "Mustermann",
    email: "max@example.de",
    phone: "0171 1234567",
    street: "Musterstraße 1",
    zip: "35794",
    city: "Mengerskirchen",
    objectAddress: "Musterstraße 1, 35794 Mengerskirchen",
    pipedriveId: "42",
    source: "pipedrive",
    externalHistory: {
      pipedrive: {
        deals: [{ id: 99, title: "Kellerabdichtung", status: "open", value: 3500 }],
        notes: [], activities: []
      },
      lexware: { documents: [] }
    }
  };
  await page.addInitScript(value => {
    localStorage.setItem("mainabdichter_v10_settings", JSON.stringify({
      workerUrl: "https://mainabdichter-api.example.workers.dev",
      appSecret: "browser-test"
    }));
    localStorage.setItem("mainabdichter_v30_customers", JSON.stringify([value]));
  }, customer);
  await page.route("**/mobile-sync", route => route.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify({ ok: true, exists: false, backup: null })
  }));
  let calls = 0;
  await page.route("**/hubspot/migrate-pipedrive", async route => {
    calls += 1;
    expect(route.request().postDataJSON()).toEqual({ personId: "42", dealId: "99" });
    await route.fulfill({
      status: 201, contentType: "application/json",
      body: JSON.stringify({
        ok: true, contactId: "1001", contactCreated: true,
        contactUrl: "https://app-eu1.hubspot.com/contacts/148928809/record/0-1/1001",
        dealId: "2001", dealCreated: true,
        dealUrl: "https://app-eu1.hubspot.com/contacts/148928809/record/0-3/2001"
      })
    });
  });

  await page.goto("http://127.0.0.1:4173/index.html");
  await page.locator('[data-bottom-page="customers"]').click();
  await page.locator('[data-customer-record="kunde-alt-1"]').click();
  await expect(page.locator('[data-hubspot-deal="99"]')).toHaveText("Nach HubSpot");
  await page.locator('[data-hubspot-deal="99"]').click();
  await expect(page.locator("#customerRecordSyncStatus")).toContainText("HubSpot ist jetzt das führende System");
  await expect(page.locator('[data-hubspot-deal="99"]')).toHaveText("In HubSpot öffnen");
  expect(calls).toBe(1);

  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("mainabdichter_v30_customers"))[0]);
  expect(stored.hubspotContactId).toBe("1001");
  expect(stored.hubspotDealIds["99"]).toBe("2001");
});
