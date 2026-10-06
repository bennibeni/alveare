import { describe, expect, it } from "vitest";
import HexGrid from "../../game/HexGrid.js";
import {
  PIECES,
  randomTray,
  replacePiece,
  seededRandom,
} from "../../game/pieces.js";
import {
  NORMAL_DEEP,
  NORMAL_NEW_PIECE,
  analyzeMoves,
  bestMove,
  explainNormal,
} from "../../game/strategy.js";

const free = (g) => [...g.cells.values()].filter((v) => !v).length;

// posizioni di una partita vera con fra NORMAL_DEEP.free e NORMAL_NEW_PIECE.free celle libere
function middlePositions(n) {
  const rng = seededRandom(4242);
  let grid = new HexGrid(4);
  let tray = randomTray(rng);
  let streak = 0;
  const out = [];
  for (let i = 0; i < 600 && out.length < n; i++) {
    const f = free(grid);
    if (f < NORMAL_NEW_PIECE.free && f >= NORMAL_DEEP.free)
      out.push({ grid, tray, streak });
    const m = bestMove(grid, tray, streak);
    if (!m) break;
    const res = grid.play(tray[m.idx].cells, m.q, m.r);
    streak = res.lines.length ? streak + 1 : 0;
    grid = res.grid;
    tray = replacePiece(tray, m.idx, rng);
  }
  return out;
}

describe("pezzo nuovo alla seconda mossa", () => {
  const positions = middlePositions(8);

  it("si applica solo fra le due soglie di celle libere", () => {
    expect(positions.length).toBeGreaterThan(0);
    for (const { grid, tray, streak } of positions) {
      const r = explainNormal(grid, tray, streak);
      expect(r.newPiece).toBe(true);
      expect(
        r.byTotal.slice(0, NORMAL_NEW_PIECE.top).every((m) => m.newPiece),
      ).toBe(true);
    }
    const empty = explainNormal(
      new HexGrid(4),
      [PIECES[0], PIECES[1], PIECES[2]],
      0,
    );
    expect(empty.newPiece).toBe(false);
  });

  it("il suggerimento è la prima candidata e le candidate mostrate hanno lo stesso metro", () => {
    for (const { grid, tray, streak } of positions) {
      const m = bestMove(grid, tray, streak);
      const a = analyzeMoves(grid, tray, streak);
      expect([a.moves[0].idx, a.moves[0].q, a.moves[0].r]).toEqual([
        m.idx,
        m.q,
        m.r,
      ]);
      expect(a.moves.every((c) => c.newPiece)).toBe(true);
      for (let i = 1; i < a.moves.length; i++)
        expect(a.moves[i].total).toBeLessThanOrEqual(a.moves[i - 1].total);
    }
  });
});
