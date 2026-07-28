const { readFileSync } = require("node:fs");
const { test, expect } = require("@playwright/test");

test.use({ viewport: { width: 820, height: 1180 } });

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("mainabdichter_v10_settings", JSON.stringify({
      workerUrl: "https://mainabdichter-api.cmww7htry5.workers.dev",
      appSecret: "browser-test"
    }));
  });
  await page.route("**/mobile-sync", async route => {
    const request = JSON.parse(route.request().postData() || "{}");
    if (request.action === "save") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, file: { modifiedTime: "2026-07-27T14:00:00.000Z" } })
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        exists: true,
        file: { modifiedTime: "2026-07-27T14:00:00.000Z" },
        backup: {
          settings: {},
          archive: [],
          customers: [],
          worksites: [],
          communicationNotes: [],
          emailInboxState: { processedIds: [], assignments: {} },
          drafts: [],
          reminders: []
        }
      })
    });
  });
});

test("PLZ ergänzt beim Kunden den Ort und lässt manuelle Eingaben möglich", async ({ page }) => {
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

test("Baustellenführung kann beendet werden und öffnet keine alte Baustelle erneut", () => {
  const app = readFileSync("js/app.js", "utf8");
  expect(app).toContain("function finishWorksiteGuide()");
  expect(app).toContain('button.dataset.bottomPage === "worksites"');
  expect(app).toContain('sessionStorage.setItem("mainabdichter_active_worksite_section", WORKSITE_SECTION_ORDER[0])');
  expect(app).not.toContain('$("worksiteStepNext").disabled = index >= WORKSITE_SECTION_ORDER.length - 1');
});

test("Ist-Verbrauch wird vor dem Speichern aus Bohrlöchern und ml neu berechnet", () => {
  const app = readFileSync("js/app.js", "utf8");
  const construction = readFileSync("js/construction.js", "utf8");
  expect(app).toContain('field === "actualMlPerHole"');
  expect(app).toContain("task.actualLitersPerHole = parseDecimal(input.value) / 1000");
  expect(app).toContain("recalculateWorksiteTask(state.settings, task);");
  expect(app).not.toContain('recalculateWorksiteTask(state.settings, task, "actualHoles")');
  expect(construction).toContain("Math.round(Number(task.actualLiters || 0) * 1000) / 1000");
  expect(construction).toContain("plannedLiters: result.rawLiters");
});

test("BKM-Video öffnet sich für Kunden direkt in der App", async ({ page }) => {
  await page.goto("/index.html");
  await page.locator("#openCustomerAdvice").evaluate(button => button.click());
  await expect(page.locator("#customerAdvice")).toHaveClass(/active/);
  await expect(page.locator("#adviceVideoPanel")).toBeVisible();
  await expect(page.locator("#playAdviceVideo")).toContainText("Video in der App");
  await page.locator("#playAdviceVideo").click();
  await expect(page.locator("#adviceVideoPanel iframe")).toHaveAttribute(
    "src",
    /youtube-nocookie\.com\/embed\/aVOKzvBJWdc/
  );
});
