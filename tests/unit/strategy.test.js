import { describe, expect, it } from "vitest";
import HexGrid from "../../game/HexGrid.js";
import { PIECES, randomTray, seededRandom, SHAPES } from "../../game/pieces.js";
import { analyzeMoves, analyzePlayedMove, bestMove, explainNormal, explainQueue, NORMAL_RISK, QUEUE_PARAMS } from "../../game/strategy.js";
import { pairedCompare, playGame, playGames, seedFor } from "../../scripts/sim-lib.mjs";

const byName = (n) => SHAPES.find((s) => s.name === n).pieces;

describe("classifica delle mosse approfondite", () => {
  for (const expert of [false, true]) {
    it(`evidenzia o aggiunge la mossa giocata senza cambiare le candidate (Esperto: ${expert})`, () => {
      const grid = new HexGrid(4);
      const tray = randomTray(seededRandom(23));
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
        expect(m.total).toBeCloseTo(m.gain + (m.next ? m.next.value - NORMAL_RISK * m.death : -10000));
      }
      expect(bestMove(grid, tray, 2, { queue: expert })).toEqual({ idx: top.idx, q: top.q, r: top.r, cells: top.cells });
    });
  }
  for (const queue of [false, true]) {
    it(`conteggio, ordine e suggerimento coerenti (coda: ${queue})`, () => {
      const grid = new HexGrid(4);
      const tray = randomTray(seededRandom(23));
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
        // ogni prima mossa approfondita compare, con il valore della sua sequenza migliore
        expect(result.moves).toHaveLength(Math.min(QUEUE_PARAMS.first, result.totalMoves));
        const leaves = explainQueue(grid, tray, 2, 20).leaves;
        result.moves.forEach((m, i) => {
          expect(leaves[i].path[0]).toMatchObject({ q: m.q, r: m.r });
          expect(m.total).toBe(leaves[i].v);
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
  let tray = randomTray(rng);
  for (let i = 0; i < moves; i++) {
    const m = bestMove(grid, tray, 0);
    grid = grid.play(tray[m.idx].cells, m.q, m.r).grid;
    tray = tray.map((p, j) => (j === m.idx ? PIECES[Math.floor(rng() * PIECES.length)] : p));
  }
  return { grid, tray };
}

describe("Esperto: ogni prima mossa ha il proprio fascio", () => {
  it("su tabelloni di metà partita l'analisi confronta tutte le prime mosse approfondite", () => {
    for (let s = 1; s <= 5; s++) {
      const { grid, tray } = midGame(s);
      const result = analyzeMoves(grid, tray, 0, { queue: true });
      expect(result.moves).toHaveLength(Math.min(QUEUE_PARAMS.first, result.totalMoves));
    }
  });

  it("la mossa che impedisce di collocare un pezzo noto è penalizzata e non suggerita", () => {
    // La barra orizzontale entra solo nelle quattro celle libere della riga r = 2 (q da -4 a -1).
    // Ogni linea ha almeno due celle libere, quindi un punto non svuota mai linee: se finisce
    // in quelle quattro celle, la barra (secondo pezzo della coda) non entra più.
    const slot = ["-4,2", "-3,2", "-2,2", "-1,2"];
    const free = new Set([...slot, "0,0", "2,-1", "-2,0", "-1,-3", "-3,3", "2,-3", "-2,-2", "-4,1", "-2,3", "4,-1",
      "-1,1", "1,-4", "4,0", "2,1", "1,-1", "2,2", "4,-2", "3,-4", "-2,4", "-3,4", "3,-2", "0,1"]);
    let g = new HexGrid(4);
    for (const k of g.cells.keys()) if (!free.has(k)) g = g.place([[0, 0]], ...k.split(",").map(Number), 1);
    const punto = byName("punto")[0];
    const barra = byName("barra 4").find((p) => p.cells.every(([, r]) => r === 0));
    expect(g.placementsFor(barra.cells)).toHaveLength(1);
    const tray = [punto, barra, punto];
    const blockedMove = analyzePlayedMove({ grid: g, tray, streak: 0, expert: true, idx: 0, q: -4, r: 2 })
      .moves.find((m) => m.played);
    expect(blockedMove.sequence.blocked).toBe(true);
    expect(blockedMove.sequence.path).toHaveLength(1);
    expect(blockedMove.total).toBeLessThan(-QUEUE_PARAMS.blocked / 2);
    const { moves } = analyzeMoves(g, tray, 0, { queue: true });
    for (const m of moves) expect(m.sequence.blocked).toBe(slot.includes(`${m.q},${m.r}`));
    expect(moves[0].sequence.blocked).toBe(false);
    expect(slot).not.toContain(`${moves[0].q},${moves[0].r}`);
  });
});

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

  it("in Esperto, il punto chiude subito una linea oppure c'è una sequenza che rende di più", () => {
    let g = new HexGrid(4);
    for (let q = -4; q <= 3; q++) g = g.place([[0, 0]], q, 0, 1); // riga centrale piena tranne (4,0)
    const punto = byName("punto")[0];
    const rombo = byName("rombo")[0];
    const tray = [punto, rombo, rombo];
    const close = analyzePlayedMove({ grid: g, tray, streak: 0, expert: true, idx: 0, q: 4, r: 0 })
      .moves.find((m) => m.played);
    expect(close.sequence.path[0].lines).toBe(1);
    const best = analyzeMoves(g, tray, 0, { queue: true }).moves[0];
    expect(best.total).toBeGreaterThanOrEqual(close.total);
    // Con questi pezzi conviene rimandare: i due rombi svuotano due linee insieme.
    expect(best.sequence.acc).toBeGreaterThan(close.sequence.acc);
    // Con tre punti, invece, chiudere subito è la scelta migliore.
    const m = bestMove(g, [punto, punto, punto], 0, { queue: true });
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

  it("regressione · Esperto, seme 7097: 52 pezzi, 561 punti", () => {
    expect(playGame({ mode: "expert", seed: seedFor(7000, 1), maxMoves: 5000 })).toEqual({
      seed: 7097,
      pieces: 52,
      points: 561,
      lines: 28,
      lost: true,
    });
  });

  // Regressione, non garanzia: con altri semi la modalità normale perde anche prima di 150
  // pezzi (vedi README). La qualità della strategia si misura con `npm run sim`.
  it("regressione · normale, semi 1, 98, 195: tutte e tre arrivano a 150 pezzi", () => {
    expect(playGames({ mode: "normal", games: 3, maxMoves: 150, seed: 1 }).every((r) => !r.lost)).toBe(true);
  });

  it("pairedCompare conta vittorie, sconfitte e pareggi partita per partita", () => {
    const a = [{ pieces: 10 }, { pieces: 20 }, { pieces: 30 }];
    const b = [{ pieces: 12 }, { pieces: 20 }, { pieces: 25 }];
    expect(pairedCompare(a, b)).toMatchObject({ better: 1, worse: 1, ties: 1 });
  });
});
