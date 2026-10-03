import { expect, test } from "@playwright/test";
import { collectErrors, hintTarget, openFresh, statNum, waitPieces } from "./helpers.js";
import HexGrid, { axialToPixel } from "../../game/HexGrid.js";
import { pieceCentroid, PIECES } from "../../game/pieces.js";

test("ultima mossa: evidenzia una candidata e aggiunge una mossa non approfondita", async ({ page }) => {
  await openFresh(page);
  const panel = page.getByTestId("move-analysis");
  await panel.getByRole("button", { name: "Analisi delle mosse" }).click();
  for (const expert of [false, true]) {
    if (expert) await page.getByRole("switch").click();
    const target = await hintTarget(page);
    const first = page.getByTestId("analyzed-move").first();
    await expect(panel).not.toContainText("Calcolo delle mosse");
    const originalScore = await first.getAttribute("data-score");
    const count = await page.getByTestId("analyzed-move").count();
    await page.mouse.click(target.x, target.y);
    await waitPieces(page, 1);
    await expect(panel).not.toContainText("Mossa in corso");
    await expect(panel.locator('[data-played="true"]')).toHaveCount(1);
    await expect(first).toHaveAttribute("data-played", "true");
    await expect(first).toHaveAttribute("data-score", originalScore);
    await expect(page.getByTestId("analyzed-move")).toHaveCount(count);
    await panel.getByRole("button", { name: "Posizione corrente", exact: true }).click();
    await expect(panel.locator('[data-played="true"]')).toHaveCount(0);
    await panel.getByRole("button", { name: "Ultima mossa", exact: true }).click();
    await expect(first).toHaveAttribute("data-played", "true");
    await page.getByRole("button", { name: "Nuova partita", exact: true }).click();
    await expect(panel.getByRole("button", { name: "Ultima mossa", exact: true })).toHaveCount(0);

    // Identifica l'orientamento del primo pezzo dalla sua geometria SVG.
    const svg = page.getByTestId("slot-0").locator("svg");
    const centers = await svg.locator("polygon").evaluateAll((polygons) => polygons.map((p) => {
      const points = p.getAttribute("points").trim().split(/\s+/).map((v) => v.split(",").map(Number));
      return [0, 1].map((a) => points.reduce((s, p) => s + p[a], 0) / points.length);
    }));
    const piece = PIECES.find((p) => p.cells.length === centers.length && p.cells.every(([q, r], i) => {
      const [x, y] = axialToPixel(q, r, 22);
      return Math.hypot(x - centers[i][0], y - centers[i][1]) < 0.02;
    }));
    expect(piece).toBeDefined();
    // l'analisi arriva dal worker: aspetta che la nuova posizione sia calcolata
    await expect(panel).not.toContainText("Calcolo delle mosse");
    await expect(page.getByTestId("analyzed-move").first()).toBeVisible();
    const oldRows = await page.getByTestId("analyzed-move").evaluateAll((rows) => rows.map((r) => ({idx:Number(r.dataset.pieceIndex),q:Number(r.dataset.q),r:Number(r.dataset.r),score:r.dataset.score})));
    const [q, r] = new HexGrid(4).placementsFor(piece.cells).find(([q, r]) => !oldRows.some((m) => m.idx === 0 && m.q === q && m.r === r));
    await page.getByTestId("slot-0").press("Enter");
    const [cq, cr] = pieceCentroid(piece.cells);
    const [x, y] = axialToPixel(q + cq, r + cr, 22);
    const screen = await page.getByTestId("board").evaluate((svg, p) => {
      const point = new DOMPoint(p.x, p.y).matrixTransform(svg.getScreenCTM());
      return {x:point.x,y:point.y};
    }, {x,y});
    await page.mouse.click(screen.x, screen.y);
    await waitPieces(page, 1);
    await expect(panel).not.toContainText("Mossa in corso");
    const added = panel.locator('[data-added="true"]');
    await expect(added).toHaveCount(1);
    await expect(added).toHaveAttribute("data-played", "true");
    await expect(added).toHaveAttribute("data-q", String(q));
    await expect(added).toHaveAttribute("data-r", String(r));
    expect(Number.isFinite(Number(await added.getAttribute("data-score")))).toBe(true);
    await expect(page.getByTestId("analyzed-move")).toHaveCount(oldRows.length + 1);
    await page.getByRole("button", {name:"Annulla",exact:true}).click();
    await expect(panel.locator('[data-played="true"]')).toHaveCount(0);
    await expect(page.getByTestId("analyzed-move")).toHaveCount(oldRows.length);
  }
});

test("Esperto: Invio e Spazio non selezionano i pezzi in coda", async ({ page }) => {
  await openFresh(page);
  await page.getByRole("switch").click();
  for (const slot of [1, 2]) {
    const piece = page.getByTestId(`slot-${slot}`);
    await expect(piece).toHaveAttribute("aria-disabled", "true");
    for (const key of ["Enter", "Space"]) {
      await piece.focus();
      await page.keyboard.press(key);
      await expect(piece).not.toHaveAttribute("data-selected", "true");
      const board = await page.getByTestId("board").boundingBox();
      await page.mouse.click(board.x + board.width / 2, board.y + board.height / 2);
      expect(await statNum(page, "Pezzi")).toBe(0);
    }
  }
  await page.getByTestId("slot-0").focus();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("slot-0")).toHaveAttribute("data-selected", "true");
});

test("analisi: prima degli altri accordion, aggiornata, nascosta durante l'autogioco", async ({ page }) => {
  const errors = collectErrors(page);
  await openFresh(page);
  const panel = page.getByTestId("move-analysis");
  const toggle = panel.getByRole("button", { name: "Analisi delle mosse" });
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  const panelBox = await panel.boundingBox();
  const helpBox = await page.getByRole("button", { name: "Come funziona" }).boundingBox();
  expect(panelBox.y).toBeLessThan(helpBox.y);
  await toggle.click();
  await expect(page.getByTestId("analyzed-move")).toHaveCount(6);
  expect(Number(await page.getByTestId("playable-moves").textContent())).toBeGreaterThan(6);

  for (const expert of [false, true]) {
    if (expert) await page.getByRole("switch").click();
    const target = await hintTarget(page);
    const first = page.getByTestId("analyzed-move").first();
    await expect(first).toContainText("Suggerita");
    const scores = await page.getByTestId("analyzed-move").evaluateAll((rows) => rows.map((r) => Number(r.dataset.score)));
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
    // Stesse celle fra miniatura in testa e suggerimento sul tabellone.
    const centers = await page.evaluate(() => {
      const points = (selector, scale) => [...document.querySelectorAll(selector)].map((p) => {
        const pairs = p.getAttribute("points").trim().split(/\s+/).map((xy) => xy.split(",").map(Number));
        return [0, 1].map((axis) => pairs.reduce((sum, xy) => sum + xy[axis], 0) / pairs.length * scale);
      });
      return {
        mini: points('[data-testid="analyzed-move"]:first-child svg polygon[stroke="#ffffff"]', 2.2),
        hint: points('[data-testid="board"] polygon.hx-hint', 1),
      };
    });
    expect(centers.mini).toHaveLength(centers.hint.length);
    for (const [x, y] of centers.mini) {
      expect(Math.min(...centers.hint.map(([hx, hy]) => Math.hypot(hx - x, hy - y)))).toBeLessThan(0.02);
    }
    const before = await panel.textContent();
    await page.mouse.click(target.x, target.y);
    await waitPieces(page, 1);
    await expect(panel).not.toContainText("Mossa in corso");
    await expect.poll(() => panel.textContent()).not.toBe(before);
    await page.getByRole("button", { name: "Annulla", exact: true }).click();
    await expect.poll(() => panel.textContent()).toBe(before);
  }
  await page.getByRole("button", { name: "Autogioco", exact: true }).click();
  await expect(panel).toHaveCount(0);
  await waitPieces(page, 2, 20_000);
  await page.getByRole("button", { name: "Ferma", exact: true }).click();
  await expect(panel).toBeVisible();
  expect(errors).toEqual([]);
});
