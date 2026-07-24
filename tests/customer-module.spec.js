const { test, expect } = require("@playwright/test");

test.use({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true
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

  const horizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth
  );
  expect(horizontalOverflow).toBe(false);
  expect(browserErrors).toEqual([]);
});
