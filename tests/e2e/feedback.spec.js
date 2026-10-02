import { expect, test } from "@playwright/test";
import { collectErrors, hintTarget, openFresh, waitPieces } from "./helpers.js";

test("toast manuale: punteggio coerente, chiusura, annullamento e nessuna sovrapposizione", async ({ page }) => {
  const errors = collectErrors(page);
  await openFresh(page);
  const feedback = page.getByTestId("move-feedback");
  await expect(feedback).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Beep per mosse notevoli" })).toHaveAttribute("aria-pressed", "false");
  const before = await page.getByTestId("board").boundingBox();
  let target = await hintTarget(page);
  await page.mouse.click(target.x, target.y);
  await waitPieces(page, 1);
  await expect(feedback).toBeVisible();
  const copy = feedback.getByRole("button", { name: "Copia giudizio e log della mossa" });
  await expect(copy).toBeVisible();
  await expect(copy).toBeEnabled();
  await page.evaluate(() => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: {
      writeText: async (text) => { window.__copiedMoveReport = text; },
    } });
  });
  await copy.click();
  await expect(feedback).toContainText("Giudizio e log copiati", { timeout: 90_000 });
  const report = await page.evaluate(() => window.__copiedMoveReport);
  expect(report).toContain("Punteggio della mossa / massimo valutato");
  const log = JSON.parse(report.split("--- Log diagnostico Alveare ---\n")[1]);
  expect(log.legalMoves).toContainEqual(log.played);
  expect(log.before.cells).toHaveLength(61);
  expect(log.positionIndicators.method).toBe("survival-rollout-v1");
  expect(log.positionIndicators.risk6.probability).toBeGreaterThanOrEqual(log.positionIndicators.risk3.probability);
  const details = feedback.getByRole("button", { name: /^Dettagli del giudizio:/ });
  await expect(details).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByTestId("move-feedback-score")).not.toBeVisible();
  await details.click();
  await expect(details).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByTestId("move-feedback-score")).toBeVisible();
  await expect(feedback).toContainText("massimo valutato");
  await expect(feedback).toContainText("Alternative:");
  const after = await page.getByTestId("board").boundingBox();
  expect(after.x).toBeCloseTo(before.x);
  expect(after.y).toBeCloseTo(before.y);
  const card = await feedback.boundingBox();
  const slot = await page.getByTestId("slot-0").boundingBox();
  expect(card.x).toBeGreaterThan(slot.x + slot.width);
  await page.getByRole("button", { name: "Analisi delle mosse" }).click();
  await page.getByRole("button", { name: "Calcola indicatori di prosecuzione" }).click();
  await expect(page.getByTestId("position-indicators-result")).toBeVisible();
  const scores = await page.getByTestId("analyzed-move").evaluateAll((rows) => rows.map((r) => ({ played: r.dataset.played === "true", score: Number(r.dataset.score) })));
  const format = (n) => n.toLocaleString("it-IT", { maximumFractionDigits: 3 });
  await expect(page.getByTestId("move-feedback-score")).toHaveText(`${format(scores.find((s) => s.played).score)} / ${format(Math.max(...scores.map((s) => s.score)))}`);
  await page.getByRole("button", { name: "Chiudi valutazione mossa" }).click();
  await expect(feedback).toHaveCount(0);
  target = await hintTarget(page);
  await page.mouse.click(target.x, target.y);
  await waitPieces(page, 2);
  await expect(feedback).toBeVisible();
  await expect(details).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByTestId("move-feedback-score")).not.toBeVisible();
  await page.getByRole("button", { name: "Nuova partita", exact: true }).click();
  await expect(feedback).toHaveCount(0);
  target = await hintTarget(page);
  await page.mouse.click(target.x, target.y);
  await waitPieces(page, 1);
  await expect(feedback).toBeVisible();
  await page.getByRole("button", { name: "Annulla", exact: true }).click();
  await expect(feedback).toHaveCount(0);
  await page.getByRole("button", { name: "Autogioco", exact: true }).click();
  await waitPieces(page, 2);
  await expect(feedback).not.toBeVisible();
  await page.getByRole("button", { name: "Ferma", exact: true }).click();
  await expect(feedback).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("su mobile la valutazione sta sotto il tabellone e sopra gli accordion", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openFresh(page);
  await page.getByRole("switch").click();
  const target = await hintTarget(page);
  await page.mouse.click(target.x, target.y);
  await waitPieces(page, 1);
  const feedback = page.getByTestId("move-feedback");
  await expect(feedback).toBeVisible();
  const card = await feedback.boundingBox();
  const board = await page.getByTestId("board").boundingBox();
  const panel = await page.getByTestId("move-analysis").boundingBox();
  expect(card.y).toBeGreaterThan(board.y + board.height);
  expect(card.y + card.height).toBeLessThan(panel.y);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("beep facoltativo: niente suoni retroattivi o ripetuti aprendo la guida", async ({ page }) => {
  await page.addInitScript(() => {
    window.__beeps = 0;
    window.AudioContext = class {
      state = "running";
      currentTime = 0;
      destination = {};
      resume() { return Promise.resolve(); }
      close() { return Promise.resolve(); }
      createOscillator() { return { frequency: { setValueAtTime() {} }, connect() {}, disconnect() {}, start() { window.__beeps++; }, stop() {} }; }
      createGain() { return { gain: { setValueAtTime() {}, linearRampToValueAtTime() {} }, connect() {}, disconnect() {} }; }
    };
  });
  await openFresh(page);
  let target = await hintTarget(page);
  await page.mouse.click(target.x, target.y);
  await waitPieces(page, 1);
  await expect(page.getByTestId("move-feedback")).toBeVisible();
  expect(await page.evaluate(() => window.__beeps)).toBe(0);
  await page.getByRole("button", { name: "Beep per mosse notevoli" }).click();
  await expect(page.getByRole("button", { name: "Beep per mosse notevoli" })).toHaveAttribute("aria-pressed", "true");
  expect(await page.evaluate(() => window.__beeps)).toBe(0);
  target = await hintTarget(page);
  await page.mouse.click(target.x, target.y);
  await waitPieces(page, 2);
  const feedback = page.getByTestId("move-feedback");
  await expect(feedback).toBeVisible();
  const emphasis = await feedback.getAttribute("data-emphasis");
  await expect.poll(() => page.evaluate(() => window.__beeps)).toBe(emphasis === "neutral" ? 0 : 2);
  const count = await page.evaluate(() => window.__beeps);
  await page.getByRole("button", { name: "Suggerimenti · normale", exact: true }).click();
  await page.getByRole("button", { name: "Gioco", exact: true }).click();
  await expect(feedback).toBeVisible();
  expect(await page.evaluate(() => window.__beeps)).toBe(count);
});
