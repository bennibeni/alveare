import { expect, test } from "@playwright/test";
import { collectErrors, openFresh, statNum, waitPieces } from "./helpers.js";

test("guide: menu, esempi calcolati sul tabellone attuale, partita conservata", async ({
  page,
}) => {
  const errors = collectErrors(page);
  await openFresh(page);
  await page.getByRole("button", { name: "Autogioco" }).click();
  await waitPieces(page, 4, 20_000);

  const nav = page.getByRole("navigation", { name: "Pagine" });
  await nav.getByRole("button", { name: "Suggerimenti · normale" }).click();
  await expect(
    page.getByRole("heading", { name: /gioco normale/ }),
  ).toBeVisible();
  // l'autogioco è in pausa mentre si legge (un pezzo già in volo finisce di atterrare: si aspetta un attimo)
  await page.waitForTimeout(1200);
  const paused = await statNum(page, "Pezzi");
  await page.waitForTimeout(1500);
  expect(await statNum(page, "Pezzi")).toBe(paused);
  await expect(
    page.getByText(/Sul tuo tabellone in questo momento sono \d+/),
  ).toBeVisible();
  const exampleRows = page
    .locator("article table")
    .filter({ hasText: "Seconda mossa" })
    .locator("tbody tr");
  await expect(exampleRows).toHaveCount(6);

  await nav.getByRole("button", { name: "Suggerimenti · Esperto" }).click();
  await expect(
    page.getByRole("heading", { name: /modalità Esperto/ }),
  ).toBeVisible();
  await expect(
    page
      .locator("article table")
      .filter({ hasText: "Sequenza" })
      .locator("tbody tr"),
  ).toHaveCount(5);
  await expect(page.locator("article")).not.toContainText("-0");

  await nav.getByRole("button", { name: "Gioco" }).click();
  expect(await statNum(page, "Pezzi")).toBe(paused);
  await waitPieces(page, paused + 1, 20_000); // l'autogioco riprende
  await page.getByRole("button", { name: "Ferma" }).click();
  expect(errors).toEqual([]);
});
