import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { collectErrors, openFresh, statNum } from "./helpers.js";
import HexGrid, { axialToPixel, parseKey } from "../../game/HexGrid.js";
import { pieceCentroid, PIECES } from "../../game/pieces.js";

/** Orientamento del pezzo nello slot i, ricavato dalla geometria del suo disegno. */
async function pieceInSlot(page, i) {
  const centers = await page
    .getByTestId(`slot-${i}`)
    .locator("svg polygon")
    .evaluateAll((polygons) =>
      polygons.map((p) => {
        const points = p
          .getAttribute("points")
          .trim()
          .split(/\s+/)
          .map((v) => v.split(",").map(Number));
        return [0, 1].map(
          (a) => points.reduce((s, q) => s + q[a], 0) / points.length,
        );
      }),
    );
  return PIECES.find(
    (p) =>
      p.cells.length === centers.length &&
      p.cells.every(([q, r], k) => {
        const [x, y] = axialToPixel(q, r, 22);
        return Math.hypot(x - centers[k][0], y - centers[k][1]) < 0.02;
      }),
  );
}

test("a fine partita, in modalità normale, l'autopsia indica la mossa decisiva o l'assenza di scampo", async ({
  page,
}) => {
  test.setTimeout(300_000);
  const errors = collectErrors(page);
  await openFresh(page);
  // Gioca male di proposito, come nel test di fine partita: il primo pezzo che entra, nella
  // prima posizione libera di un ordine "sparpagliato" (passo 37 su 61).
  const order = Array.from({ length: 61 }, (_, i) => (i * 37) % 61);
  const keys = [...new HexGrid(4).cells.keys()];
  const board = page.getByTestId("board");
  await expect(page.getByTestId("game-autopsy")).toHaveCount(0);
  for (let moves = 0; moves < 200; moves++) {
    if (await page.getByText("Partita finita").count()) break;
    const before = await statNum(page, "Pezzi");
    const filled = await board.evaluate((svg) =>
      [...svg.querySelectorAll("polygon")]
        .slice(0, 61)
        .map((c) => c.getAttribute("fill") !== "#1e293b"),
    );
    let grid = new HexGrid(4);
    keys.forEach((k, i) => {
      if (filled[i]) grid = grid.place([[0, 0]], ...parseKey(k), 1);
    });
    let choice = null;
    for (let slot = 0; slot < 3 && !choice; slot++) {
      const piece = await pieceInSlot(page, slot);
      if (!piece) continue;
      const origin = order
        .map((i) => parseKey(keys[i]))
        .find(([q, r]) => grid.canPlace(piece.cells, q, r));
      if (origin) choice = { slot, piece, origin };
    }
    if (!choice) break;
    await page.keyboard.press(String(choice.slot + 1));
    const [cq, cr] = pieceCentroid(choice.piece.cells);
    const [x, y] = axialToPixel(
      choice.origin[0] + cq,
      choice.origin[1] + cr,
      22,
    );
    const screen = await board.evaluate(
      (svg, p) => {
        const point = new DOMPoint(p.x, p.y).matrixTransform(
          svg.getScreenCTM(),
        );
        return { x: point.x, y: point.y };
      },
      { x, y },
    );
    await page.mouse.click(screen.x, screen.y);
    await expect.poll(() => statNum(page, "Pezzi")).toBeGreaterThan(before);
    await page.waitForTimeout(800);
  }
  await expect(page.getByText("Partita finita")).toBeVisible();
  const panel = page.getByTestId("game-autopsy");
  await expect(panel).toBeVisible();
  await panel.getByRole("button", { name: /Autopsia della partita/ }).click();
  await expect(panel.getByTestId("autopsy-verdict")).toHaveText(
    /Mossa decisiva: \d+|Senza scampo già dalla mossa \d+/,
  );
  // l'ultima posizione è sempre senza scampo
  const steps = panel.getByRole("group", {
    name: "Mosse della discesa finale",
  });
  await expect(steps.getByRole("button").last()).toHaveAttribute(
    "data-result",
    "bloccata",
  );
  // giudizio dettagliato e tabella delle mosse della posizione scelta
  await expect(panel.getByTestId("autopsy-judgment")).toContainText(
    "Possibilità di proseguire",
    { timeout: 30_000 },
  );
  // elenco delle mosse sempre visibile, pezzi arrivati dopo la mossa
  await expect(panel.getByLabel("Pezzi arrivati")).toBeVisible();
  await expect(
    panel.getByTestId("autopsy-moves").locator('tr[data-played="true"]'),
  ).toHaveCount(1);
  // l'errore più costoso, in una finestra
  await panel.getByRole("button", { name: /errore più costoso/ }).click();
  const dialog = page.getByTestId("costliest-error");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByTestId("costliest-verdict")).toBeVisible({
    timeout: 90_000,
  });
  await expect(
    dialog
      .getByRole("list", { name: "Rischio aggiunto per mossa" })
      .getByRole("listitem"),
  ).toHaveCount(
    (await steps.getByRole("button").count()) - 1, // tutte le mosse, senza la posizione finale
  );
  await dialog
    .getByRole("button", { name: "Chiudi", exact: true })
    .last()
    .click();
  await expect(dialog).toHaveCount(0);
  // l'autopsia è anche nel log scaricato
  const pending = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Scarica log partita", exact: true })
    .click();
  const download = await pending;
  const report = JSON.parse(await readFile(await download.path(), "utf8"));
  expect(report.finalTray).toHaveLength(3);
  expect(report.autopsy.steps.length).toBe(
    await steps.getByRole("button").count(),
  );
  expect(report.autopsy.steps.at(-1).withArrivedPieces).toBe("bloccata");
  for (const s of report.autopsy.steps.filter((x) => x.move))
    expect(s.played.risk).toBeGreaterThanOrEqual(s.safest.risk);
  expect(errors).toEqual([]);
});
