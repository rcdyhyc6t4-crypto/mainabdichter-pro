const { test, expect } = require("@playwright/test");

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

test("App bleibt bis zum zentralen Abruf gesperrt und führt Server- und Gerätedaten sicher zusammen", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("mainabdichter_v10_settings", JSON.stringify({
      workerUrl: "https://mainabdichter-api.cmww7htry5.workers.dev",
      appSecret: "sync-test",
      inventory: { products: [{ id: "hz", name: "HZ 250 PRO", stock: 2, unit: "l" }] }
    }));
    localStorage.setItem("mainabdichter_v30_customers", JSON.stringify([
      { id: "lokal-alt", firstName: "Alter", lastName: "Stand" }
    ]));
  });

  let releaseBackup;
  const backupMayRespond = new Promise(resolve => { releaseBackup = resolve; });
  await page.route("**/mobile-sync", async route => {
    const request = JSON.parse(route.request().postData() || "{}");
    if (request.action !== "load") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, file: { modifiedTime: "2026-07-27T15:31:00.000Z" } })
      });
    }
    await backupMayRespond;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        exists: true,
        file: { modifiedTime: "2026-07-27T15:30:00.000Z" },
        backup: {
          settings: {
            inventory: { products: [{ id: "hz", name: "HZ 250 PRO", stock: 48, unit: "l" }] }
          },
          customers: [{ id: "server-kunde", firstName: "Zentral", lastName: "Gespeichert" }],
          worksites: [],
          archive: [],
          communicationNotes: [],
          emailInboxState: { processedIds: [], assignments: {} },
          drafts: [],
          reminders: []
        }
      })
    });
  });

  const navigation = page.goto("/index.html");
  await expect(page.locator("#centralSyncGate")).toBeVisible();
  await expect(page.locator("body")).toHaveClass(/central-syncing/);
  releaseBackup();
  await navigation;
  await expect(page.locator("#centralSyncGate")).toHaveClass(/hidden/);

  const saved = await page.evaluate(() => ({
    stock: JSON.parse(localStorage.getItem("mainabdichter_v10_settings")).inventory.products[0].stock,
    customers: JSON.parse(localStorage.getItem("mainabdichter_v30_customers"))
  }));
  expect(saved.stock).toBe(2);
  expect(saved.customers.map(customer => customer.id).sort()).toEqual(["lokal-alt", "server-kunde"]);
});
