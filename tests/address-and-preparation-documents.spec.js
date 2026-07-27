const { readFileSync } = require("node:fs");
const { test, expect } = require("@playwright/test");

test.use({ viewport: { width: 820, height: 1180 } });

test("PLZ ergänzt beim Kunden den Ort und lässt manuelle Eingaben möglich", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("mainabdichter_v10_settings", JSON.stringify({
      workerUrl: "https://mainabdichter-api.cmww7htry5.workers.dev",
      appSecret: "test"
    }));
  });
  await page.route("**/address/localities?postalCode=35794", route => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      ok: true,
      localities: [{ name: "Mengerskirchen", postalCode: "35794" }]
    })
  }));
  await page.goto("/index.html");
  await page.locator('[data-bottom-page="customers"]').click();
  await page.locator("#customerCreateNew").click();
  await page.locator("#customerZip").fill("35794");
  await expect(page.locator("#customerCity")).toHaveValue("Mengerskirchen");
  await expect(page.locator("#customerAddressAssistStatus")).toContainText("PLZ und Ort");
});

test("Baustellen übernehmen Google-Drive-Unterlagen aus der Vorbereitung", () => {
  const construction = readFileSync("js/construction.js", "utf8");
  const app = readFileSync("js/app.js", "utf8");
  const html = readFileSync("index.html", "utf8");
  expect(construction).toContain("preparationDocuments: clone(visit.documents || [])");
  expect(app).toContain("preparationDocumentsForWorksite");
  expect(app).toContain('href="${esc(document.driveUrl)}"');
  expect(html).toContain('id="wsPreparationDocuments"');
  expect(html).toContain('id="wsInheritedDocumentList"');
});
