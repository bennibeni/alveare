import { describe, expect, it } from "vitest";
import HexGrid from "../../game/HexGrid.js";
import { PIECES, randomTray, seededRandom, SHAPES } from "../../game/pieces.js";
import { analyzeMoves, analyzePlayedMove, bestMove, explainNormal, explainQueue } from "../../game/strategy.js";
import { pairedCompare, playGame, playGames, seedFor } from "../../scripts/sim-lib.mjs";

const byName = (n) => SHAPES.find((s) => s.name === n).pieces;

describe("classifica delle mosse approfondite", () => {
  for (const expert of [false, true]) {
    it(`evidenzia o aggiunge la mossa giocata senza cambiare le candidate (Esperto: ${expert})`, () => {
      const grid = new HexGrid(4);
      const tray = randomTray(grid, seededRandom(23));
      const position = { grid, tray, streak: 2, expert };
      const original = analyzeMoves(grid, tray, 2, { queue: expert });
      const top = original.moves[0];
      const included = analyzePlayedMove({ ...position, idx: top.idx, q: top.q, r: top.r });
      expect(included.moves).toHaveLength(original.moves.length);
      expect(included.moves.filter((m) => m.played)).toHaveLength(1);
      expect(included.moves[0]).toMatchObject({ played: true, total: top.total });
      const [q, r] = grid.placementsFor(tray[0].cells).find(([q, r]) => !original.moves.some((m) => m.idx === 0 && m.q === q && m.r === r));
      const extra = analyzePlayedMove({ ...position, idx: 0, q, r });
      expect(extra.moves.slice(0, -1)).toEqual(original.moves);
      expect(extra.moves.at(-1)).toMatchObject({ idx: 0, q, r, played: true, added: true });
      expect(Number.isFinite(extra.moves.at(-1).total)).toBe(true);
      if (expert) {
        const leaf = extra.moves.at(-1).sequence;
        expect(leaf.path[0]).toMatchObject({ q, r });
        expect(extra.moves.at(-1).total).toBeCloseTo(leaf.acc + leaf.board + leaf.unknown.value);
      } else {
        const m = extra.moves.at(-1);
        expect(m.total).toBe(m.gain + (m.next ? m.next.value : -10000));
      }
      expect(bestMove(grid, tray, 2, { queue: expert })).toEqual({ idx: top.idx, q: top.q, r: top.r, cells: top.cells });
    });
  }
  for (const queue of [false, true]) {
    it(`conteggio, ordine e suggerimento coerenti (coda: ${queue})`, () => {
      const grid = new HexGrid(4);
      const tray = randomTray(grid, seededRandom(23));
      const result = analyzeMoves(grid, tray, 2, { queue });
      const playable = (queue ? tray.slice(0, 1) : tray).reduce((n, p) => n + grid.placementsFor(p.cells).length, 0);
      expect(result.totalMoves).toBe(playable);
      expect(result.moves.length).toBeGreaterThan(0);
      expect(result.moves.length).toBeLessThanOrEqual(queue ? 10 : 6);
      const top = result.moves[0];
      expect(bestMove(grid, tray, 2, { queue })).toEqual({ idx: top.idx, q: top.q, r: top.r, cells: top.cells });
      expect(new Set(result.moves.map((m) => `${m.idx}:${m.q}:${m.r}`)).size).toBe(result.moves.length);
      result.moves.forEach((m, i) => {
        expect(grid.canPlace(m.cells, m.q, m.r)).toBe(true);
        expect(m.total).toBeLessThanOrEqual(top.total);
        if (i) expect(m.total).toBeLessThanOrEqual(result.moves[i - 1].total);
        if (queue) expect(m.idx).toBe(0);
      });
      if (queue) {
        const leaves = explainQueue(grid, tray, 2, 20).leaves;
        result.moves.forEach((m) => {
          const values = leaves.filter((l) => l.path[0].q === m.q && l.path[0].r === m.r).map((l) => l.v);
          expect(m.total).toBe(Math.max(...values));
        });
      }
    });
  }

  it("mostra zero mosse a fine partita e meno di sei quando ne restano poche", () => {
    let grid = new HexGrid(4);
    for (const k of grid.cells.keys()) if (k !== "0,0") grid = grid.place([[0, 0]], ...k.split(",").map(Number), 1);
    const point = byName("punto")[0];
    const bar = byName("barra 4")[0];
    expect(analyzeMoves(grid, [bar, bar, bar])).toEqual({ totalMoves: 0, moves: [] });
    expect(analyzeMoves(grid, [bar, point, point], 0, { queue: true })).toEqual({ totalMoves: 0, moves: [] });
    const result = analyzeMoves(grid, [bar, point, bar]);
    expect(result.totalMoves).toBe(1);
    expect(result.moves).toHaveLength(1);
  });
});

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
