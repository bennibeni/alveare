import { describe, expect, it } from "vitest";
import HexGrid from "../../game/HexGrid.js";
import { PIECES, randomTray, seededRandom, SHAPES } from "../../game/pieces.js";
import { bestMove, explainNormal, explainQueue } from "../../game/strategy.js";
import { pairedCompare, playGame, playGames, seedFor } from "../../scripts/sim-lib.mjs";

const byName = (n) => SHAPES.find((s) => s.name === n).pieces;

/** Tabellone a metà partita, riproducibile. */
function midGame(seed, moves = 15) {
  const rng = seededRandom(seed);
  let grid = new HexGrid(4);
  let tray = randomTray(grid, rng);
  for (let i = 0; i < moves; i++) {
    const m = bestMove(grid, tray, 0);
    grid = grid.play(tray[m.idx].cells, m.q, m.r).grid;
    tray = tray.map((p, j) => (j === m.idx ? PIECES[Math.floor(rng() * PIECES.length)] : p));
  }
  return { grid, tray };
}

describe("suggerimenti: mosse sempre valide", () => {
  it("modalità normale: la mossa suggerita è legale", () => {
    for (let s = 1; s <= 5; s++) {
      const { grid, tray } = midGame(s);
      const m = bestMove(grid, tray, 0);
      expect(m).not.toBeNull();
      expect(grid.canPlace(tray[m.idx].cells, m.q, m.r)).toBe(true);
    }
  });

  it("modalità Esperto: si gioca sempre il primo pezzo, in una posizione legale", () => {
    for (let s = 1; s <= 5; s++) {
      const { grid, tray } = midGame(s);
      const m = bestMove(grid, tray, 0, { queue: true });
      expect(m.idx).toBe(0);
      expect(grid.canPlace(tray[0].cells, m.q, m.r)).toBe(true);
    }
  });

  it("nessun suggerimento quando nessun pezzo entra (e in Esperto quando non entra il primo)", () => {
    let g = new HexGrid(4);
    for (const k of g.cells.keys()) if (k !== "0,0") g = g.place([[0, 0]], ...k.split(",").map(Number), 1);
    const barra = byName("barra 4")[0];
    const punto = byName("punto")[0];
    expect(bestMove(g, [barra, barra, barra], 0)).toBeNull();
    expect(bestMove(g, [barra, punto, barra], 0)).not.toBeNull(); // normale: il punto entra
    expect(bestMove(g, [barra, punto, barra], 0, { queue: true })).toBeNull(); // Esperto: conta solo il primo
  });

  it("in Esperto, se il punto può chiudere una linea, la chiude", () => {
    let g = new HexGrid(4);
    for (let q = -4; q <= 3; q++) g = g.place([[0, 0]], q, 0, 1); // riga centrale piena tranne (4,0)
    const punto = byName("punto")[0];
    const rombo = byName("rombo")[0];
    const m = bestMove(g, [punto, rombo, rombo], 0, { queue: true });
    expect([m.q, m.r]).toEqual([4, 0]);
  });
});

describe("le pagine di spiegazione mostrano la stessa scelta del gioco", () => {
  it("explainNormal: la prima candidata per totale è il suggerimento", () => {
    for (let s = 1; s <= 4; s++) {
      const { grid, tray } = midGame(s);
      const m = bestMove(grid, tray, 0);
      const top = explainNormal(grid, tray, 0).byTotal[0];
      expect([top.idx, top.q, top.r]).toEqual([m.idx, m.q, m.r]);
    }
  });

  it("explainQueue: la prima mossa della sequenza migliore è il suggerimento", () => {
    for (let s = 1; s <= 4; s++) {
      const { grid, tray } = midGame(s);
      const m = bestMove(grid, tray, 0, { queue: true });
      const first = explainQueue(grid, tray, 0).leaves[0].path[0];
      expect([first.q, first.r]).toEqual([m.q, m.r]);
    }
  });
});

describe("prestazioni e regressioni (simulazioni con seme)", () => {
  it("un suggerimento Esperto richiede meno di 400 ms", () => {
    const { grid, tray } = midGame(9);
    const t = performance.now();
    bestMove(grid, tray, 0, { queue: true });
    expect(performance.now() - t).toBeLessThan(400);
  });

  it("la simulazione è deterministica: stesso seme, stessa partita", () => {
    const a = playGame({ mode: "normal", seed: 11, maxMoves: 30 });
    const b = playGame({ mode: "normal", seed: 11, maxMoves: 30 });
    expect(a).toEqual(b);
  });

  // Valori di riferimento della strategia attuale. Se si cambia la strategia di
  // proposito, questi numeri vanno aggiornati (dopo averla misurata con npm run sim).
  it("regressione · normale, seme 555, 60 pezzi: 493 punti, 30 linee", () => {
    expect(playGame({ mode: "normal", seed: 555, maxMoves: 60 })).toEqual({ seed: 555, pieces: 60, points: 493, lines: 30, lost: false });
  });

  it("regressione · Esperto, seme 7097: 119 pezzi, 1025 punti", () => {
    expect(playGame({ mode: "expert", seed: seedFor(7000, 1), maxMoves: 5000 })).toEqual({
      seed: 7097,
      pieces: 119,
      points: 1025,
      lines: 61,
      lost: true,
    });
  });

  it("modalità normale: nessuna partita persa in 3 partite da 150 pezzi", () => {
    expect(playGames({ mode: "normal", games: 3, maxMoves: 150, seed: 1 }).every((r) => !r.lost)).toBe(true);
  });

  it("pairedCompare conta vittorie, sconfitte e pareggi partita per partita", () => {
    const a = [{ pieces: 10 }, { pieces: 20 }, { pieces: 30 }];
    const b = [{ pieces: 12 }, { pieces: 20 }, { pieces: 25 }];
    expect(pairedCompare(a, b)).toMatchObject({ better: 1, worse: 1, ties: 1 });
  });
});
