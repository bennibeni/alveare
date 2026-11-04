import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { hintTarget, openFresh, waitPieces } from "./helpers.js";

async function downloadReport(page) {
  const pending = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Scarica log partita", exact: true })
    .click();
  const download = await pending;
  expect(download.suggestedFilename()).toMatch(/^alveare-partita-.*\.json$/);
  return JSON.parse(await readFile(await download.path(), "utf8"));
}

test("il log conserva le posizioni e le analisi ed esclude le mosse annullate", async ({
  page,
}) => {
  await openFresh(page);
  const button = page.getByRole("button", {
    name: "Scarica log partita",
    exact: true,
  });
  await expect(button).toBeDisabled();
  for (let n = 1; n <= 2; n++) {
    const target = await hintTarget(page);
    await page.mouse.click(target.x, target.y);
    await waitPieces(page, n);
    await expect(button).toBeEnabled();
  }
  const full = await downloadReport(page);
  expect(full.totalMoves).toBe(2);
  for (const move of full.moves) {
    expect(move.before.cells).toHaveLength(61);
    expect(move.before.tray).toHaveLength(3);
    expect(move.played.piece).toEqual(move.before.tray[move.played.idx]);
    expect(move.played.slot).toBe(move.played.idx + 1);
    expect(move.evaluation.label).toBeTruthy();
    expect(move.suggestions.length).toBeGreaterThan(0);
    expect(move.analyzedMoves.some((candidate) => candidate.played)).toBe(true);
  }
  await page.getByRole("button", { name: "Annulla", exact: true }).click();
  const undone = await downloadReport(page);
  expect(undone.totalMoves).toBe(1);
  expect(undone.moves).toEqual(full.moves.slice(0, 1));
  expect(undone.score).toBe(full.moves[0].after.score);
  await page
    .getByRole("button", { name: "Nuova partita", exact: true })
    .click();
  await expect(button).toBeDisabled();
});
