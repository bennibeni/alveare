import { describe, expect, it } from "vitest";
import HexGrid from "../../game/HexGrid.js";
import { PIECES, randomTray, seededRandom, SHAPES } from "../../game/pieces.js";
import {
  analyzeMoves,
  closableLines,
  analyzePlayedMove,
  bestMove,
  explainNormal,
  explainQueue,
  NORMAL_BIG_PENALTY,
  NORMAL_BIG_SHAPES,
  NORMAL_CLEAR_BONUS,
  NORMAL_CLOSABLE_BONUS,
  NORMAL_DEEP,
  NORMAL_LEARNED_PENALTY,
  NORMAL_RISK,
  NORMAL_ROOM_PENALTY,
  QUEUE_PARAMS,
  slimAnalysis,
} from "../../game/strategy.js";
import { judgeMove } from "../../game/moveJudgment.js";
import {
  pairedCompare,
  playGame,
  playGames,
  seedFor,
} from "../../scripts/sim-lib.mjs";

const byName = (n) => SHAPES.find((s) => s.name === n).pieces;

describe("classifica delle mosse approfondite", () => {
  for (const expert of [false, true]) {
    it(`evidenzia o aggiunge la mossa giocata senza cambiare le candidate (Esperto: ${expert})`, () => {
      const grid = new HexGrid(4);
      const tray = randomTray(seededRandom(23));
      const position = { grid, tray, streak: 2, expert };
      const original = analyzeMoves(grid, tray, 2, { queue: expert });
      const top = original.moves[0];
      const included = analyzePlayedMove({
        ...position,
        idx: top.idx,
        q: top.q,
        r: top.r,
      });
      expect(included.moves).toHaveLength(original.moves.length);
      expect(included.moves.filter((m) => m.played)).toHaveLength(1);
      expect(included.moves[0]).toMatchObject({
        played: true,
        total: top.total,
      });
      const [q, r] = grid
        .placementsFor(tray[0].cells)
        .find(
          ([q, r]) =>
            !original.moves.some((m) => m.idx === 0 && m.q === q && m.r === r),
        );
      const extra = analyzePlayedMove({ ...position, idx: 0, q, r });
      expect(extra.moves.slice(0, -1)).toEqual(original.moves);
      expect(extra.moves.at(-1)).toMatchObject({
        idx: 0,
        q,
        r,
        played: true,
        added: true,
      });
      expect(Number.isFinite(extra.moves.at(-1).total)).toBe(true);
      if (expert) {
        const leaf = extra.moves.at(-1).sequence;
        expect(leaf.path[0]).toMatchObject({ q, r });
        expect(extra.moves.at(-1).total).toBeCloseTo(
          leaf.acc + leaf.board + leaf.unknown.value,
        );
      } else {
        const m = extra.moves.at(-1);
        expect(m.total).toBeCloseTo(
          m.gain +
            m.clearBonus +
            (m.next
              ? m.next.gain +
                m.next.lines * 60 -
                NORMAL_LEARNED_PENALTY * m.learned -
                m.roomPenalty
              : -10000),
        );
      }
      expect(bestMove(grid, tray, 2, { queue: expert })).toEqual({
        idx: top.idx,
        q: top.q,
        r: top.r,
        cells: top.cells,
      });
    });
  }
  for (const queue of [false, true]) {
    it(`conteggio, ordine e suggerimento coerenti (coda: ${queue})`, () => {
      const grid = new HexGrid(4);
      const tray = randomTray(seededRandom(23));
      const result = analyzeMoves(grid, tray, 2, { queue });
      // pezzi identici contano una volta sola
      const distinct = (queue ? tray.slice(0, 1) : tray).filter(
        (p, i, all) => all.findIndex((o) => o.id === p.id) === i,
      );
      const playable = distinct.reduce(
        (n, p) => n + grid.placementsFor(p.cells).length,
        0,
      );
      expect(result.totalMoves).toBe(playable);
      expect(result.moves.length).toBeGreaterThan(0);
      expect(result.moves.length).toBeLessThanOrEqual(queue ? 10 : 6);
      const top = result.moves[0];
      expect(bestMove(grid, tray, 2, { queue })).toEqual({
        idx: top.idx,
        q: top.q,
        r: top.r,
        cells: top.cells,
      });
      expect(
        new Set(result.moves.map((m) => `${m.idx}:${m.q}:${m.r}`)).size,
      ).toBe(result.moves.length);
      result.moves.forEach((m, i) => {
        expect(grid.canPlace(m.cells, m.q, m.r)).toBe(true);
        expect(m.total).toBeLessThanOrEqual(top.total);
        if (i) expect(m.total).toBeLessThanOrEqual(result.moves[i - 1].total);
        if (queue) expect(m.idx).toBe(0);
      });
      if (queue) {
        // ogni prima mossa approfondita compare, con il valore della sua sequenza migliore
        expect(result.moves).toHaveLength(
          Math.min(QUEUE_PARAMS.first, result.totalMoves),
        );
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
    for (const k of grid.cells.keys())
      if (k !== "0,0")
        grid = grid.place([[0, 0]], ...k.split(",").map(Number), 1);
    const point = byName("punto")[0];
    const bar = byName("barra 4")[0];
    expect(analyzeMoves(grid, [bar, bar, bar])).toEqual({
      totalMoves: 0,
      evaluated: 0,
      moves: [],
    });
    expect(analyzeMoves(grid, [bar, point, point], 0, { queue: true })).toEqual(
      { totalMoves: 0, moves: [] },
    );
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
    tray = tray.map((p, j) =>
      j === m.idx ? PIECES[Math.floor(rng() * PIECES.length)] : p,
    );
  }
  // i test Esperto giocano il primo pezzo: mette in testa un pezzo che entra
  const first = tray.findIndex((p) => grid.fits(p.cells));
  if (first > 0) tray = [tray[first], ...tray.filter((_, j) => j !== first)];
  return { grid, tray };
}

describe("Esperto: ogni prima mossa ha il proprio fascio", () => {
  it("su tabelloni di metà partita l'analisi confronta tutte le prime mosse approfondite", () => {
    for (let s = 1; s <= 5; s++) {
      const { grid, tray } = midGame(s);
      const result = analyzeMoves(grid, tray, 0, { queue: true });
      expect(result.moves).toHaveLength(
        Math.min(QUEUE_PARAMS.first, result.totalMoves),
      );
    }
  });

  it("la mossa che impedisce di collocare un pezzo noto è penalizzata e non suggerita", () => {
    // La barra orizzontale entra solo nelle quattro celle libere della riga r = 2 (q da -4 a -1).
    // Ogni linea ha almeno due celle libere, quindi un punto non svuota mai linee: se finisce
    // in quelle quattro celle, la barra (secondo pezzo della coda) non entra più.
    const slot = ["-4,2", "-3,2", "-2,2", "-1,2"];
    const free = new Set([
      ...slot,
      "0,0",
      "2,-1",
      "-2,0",
      "-1,-3",
      "-3,3",
      "2,-3",
      "-2,-2",
      "-4,1",
      "-2,3",
      "4,-1",
      "-1,1",
      "1,-4",
      "4,0",
      "2,1",
      "1,-1",
      "2,2",
      "4,-2",
      "3,-4",
      "-2,4",
      "-3,4",
      "3,-2",
      "0,1",
    ]);
    let g = new HexGrid(4);
    for (const k of g.cells.keys())
      if (!free.has(k)) g = g.place([[0, 0]], ...k.split(",").map(Number), 1);
    const punto = byName("punto")[0];
    const barra = byName("barra 4").find((p) =>
      p.cells.every(([, r]) => r === 0),
    );
    expect(g.placementsFor(barra.cells)).toHaveLength(1);
    const tray = [punto, barra, punto];
    const blockedMove = analyzePlayedMove({
      grid: g,
      tray,
      streak: 0,
      expert: true,
      idx: 0,
      q: -4,
      r: 2,
    }).moves.find((m) => m.played);
    expect(blockedMove.sequence.blocked).toBe(true);
    expect(blockedMove.sequence.path).toHaveLength(1);
    expect(blockedMove.total).toBeLessThan(-QUEUE_PARAMS.blocked / 2);
    const { moves } = analyzeMoves(g, tray, 0, { queue: true });
    for (const m of moves)
      expect(m.sequence.blocked).toBe(slot.includes(`${m.q},${m.r}`));
    expect(moves[0].sequence.blocked).toBe(false);
    expect(slot).not.toContain(`${moves[0].q},${moves[0].r}`);
  });
});

describe("analisi spedita dal worker", () => {
  it("la copia senza tabelloni si clona e dà lo stesso giudizio", () => {
    for (const expert of [false, true]) {
      for (let seed = 1; seed <= 3; seed++) {
        const { grid, tray } = midGame(seed);
        const legal = grid.placementsFor(tray[0].cells);
        const [q, r] = legal[Math.floor(legal.length / 2)];
        const analysis = analyzePlayedMove({
          grid,
          tray,
          streak: 1,
          expert,
          idx: 0,
          q,
          r,
        });
        const slim = structuredClone(slimAnalysis(analysis));
        expect(JSON.stringify(slim)).not.toContain('"cells":{}');
        expect(judgeMove(slim)).toEqual(judgeMove(analysis));
        expect(slim.moves.map((m) => m.total)).toEqual(
          analysis.moves.map((m) => m.total),
        );
      }
    }
  });
});

describe("modalità normale: spazio per il pezzo che resta nel vassoio", () => {
  it("penalizza le mosse che lasciano al pezzo rimasto poche posizioni", () => {
    for (let seed = 1; seed <= 4; seed++) {
      const { grid, tray } = midGame(seed, 25);
      for (const m of analyzeMoves(grid, tray, 0).moves) {
        if (!m.next) continue;
        const remaining = tray.find((p, i) => i !== m.idx && i !== m.next.idx);
        expect(m.room).toBe(
          Math.min(6, m.next.after.placementsFor(remaining.cells).length),
        );
        expect(m.roomPenalty).toBeCloseTo(
          NORMAL_ROOM_PENALTY * (1 - m.room / 6),
        );
      }
    }
  });
});

describe("modalità normale: spazio per rombo e ferro di cavallo", () => {
  it("è la media pesata di min(posizioni, 6) / 6 sugli orientamenti di rombo e ferro di cavallo", () => {
    const weight = (p) => p.weight;
    for (let seed = 1; seed <= 3; seed++) {
      const { grid, tray } = midGame(seed, 25);
      for (const m of analyzeMoves(grid, tray, 0).moves) {
        if (!m.next) continue;
        const big = PIECES.filter((p) => NORMAL_BIG_SHAPES.includes(p.name));
        const expected =
          big.reduce(
            (s, p) =>
              s +
              (weight(p) *
                Math.min(6, m.next.after.placementsFor(p.cells).length)) /
                6,
            0,
          ) / big.reduce((s, p) => s + weight(p), 0);
        expect(m.bigRoom).toBeCloseTo(expected);
        expect(m.bigPenalty).toBeCloseTo(NORMAL_BIG_PENALTY * (1 - expected));
      }
    }
  });

  it("su un tabellone vuoto non penalizza: rombi e ferri hanno spazio ovunque", () => {
    const tray = randomTray(seededRandom(23));
    for (const m of analyzeMoves(new HexGrid(4), tray, 0).moves)
      expect(m.bigPenalty).toBeCloseTo(0);
  });
});

describe("modalità normale: premio per lo svuotamento", () => {
  it("vale premio × linee svuotate × affollamento del tabellone prima della mossa", () => {
    let withLines = 0;
    for (let seed = 1; seed <= 6; seed++) {
      const { grid, tray } = midGame(seed, 30);
      const filled = [...grid.cells.values()].filter(Boolean).length;
      for (const m of explainNormal(grid, tray, 0).byTotal) {
        expect(m.crowd).toBeCloseTo(filled / grid.cells.size);
        expect(m.clearBonus).toBeCloseTo(
          NORMAL_CLEAR_BONUS * m.lines * m.crowd,
        );
        if (m.lines) withLines++;
      }
    }
    expect(withLines).toBeGreaterThan(0);
  });

  it("sul tabellone vuoto non premia niente", () => {
    const tray = randomTray(seededRandom(23));
    for (const m of analyzeMoves(new HexGrid(4), tray, 0).moves)
      expect(m.clearBonus).toBe(0);
    expect(closableLines(new HexGrid(4))).toBe(0);
  });

  it("linee chiudibili: numero atteso di linee che un pezzo nuovo chiude con una mossa", () => {
    // riga centrale (r = 0, 9 celle) piena tranne una cella: la chiude soltanto un pezzo che copre quella cella
    let grid = new HexGrid(4);
    for (let q = -4; q <= 4; q++)
      if (q !== 0) grid = grid.place([[0, 0]], q, 0, 1);
    // atteso: probabilità dei pezzi che hanno una posizione sopra la cella (0, 0)
    const weight = PIECES.reduce((a, p) => a + p.weight, 0);
    const covering = PIECES.filter((p) =>
      grid
        .placementsFor(p.cells)
        .some(([q, r]) =>
          p.cells.some(([dq, dr]) => q + dq === 0 && r + dr === 0),
        ),
    );
    expect(closableLines(grid)).toBeCloseTo(
      covering.reduce((a, p) => a + p.weight, 0) / weight,
    );
    let total = 0;
    for (let seed = 1; seed <= 4; seed++) {
      const { grid: g, tray } = midGame(seed, 30);
      for (const m of explainNormal(g, tray, 0).byTotal) {
        if (!m.next) continue;
        // tabellone finale: dopo la seconda mossa, o dopo la terza nella zona di pericolo
        const final = (m.third || m.next).after;
        expect(m.closable).toBeCloseTo(closableLines(final));
        const filled = [...final.cells.values()].filter(Boolean).length;
        expect(m.closableBonus).toBeCloseTo(
          (NORMAL_CLOSABLE_BONUS * m.closable * filled) / 61,
        );
        total += m.closable;
      }
    }
    expect(total).toBeGreaterThan(0);
  });
});

describe("modalità normale: tre pezzi noti nella zona di pericolo", () => {
  /** Posizioni affollate da partite con seme: una con meno di NORMAL_DEEP.free celle libere. */
  // stessa partita di midGame(seed, mosse) con mosse = 20, 25, 30, …: la prima posizione affollata
  // (una sola partita, invece di ricominciare da capo per ogni numero di mosse)
  function crowded(seed) {
    const rng = seededRandom(seed);
    let grid = new HexGrid(4);
    let tray = randomTray(rng);
    for (let i = 0; i < 400; i++) {
      if (i >= 20 && i % 5 === 0) {
        const free = [...grid.cells.values()].filter((v) => !v).length;
        if (free < NORMAL_DEEP.free) {
          const first = tray.findIndex((p) => grid.fits(p.cells));
          const t =
            first > 0
              ? [tray[first], ...tray.filter((_, j) => j !== first)]
              : tray;
          return { grid, tray: t };
        }
      }
      const m = bestMove(grid, tray, 0);
      if (!m) return null;
      grid = grid.play(tray[m.idx].cells, m.q, m.r).grid;
      tray = tray.map((p, j) =>
        j === m.idx ? PIECES[Math.floor(rng() * PIECES.length)] : p,
      );
    }
    return null;
  }

  it("si attiva solo sotto la soglia di celle libere", () => {
    expect(
      explainNormal(new HexGrid(4), randomTray(seededRandom(3)), 0).deep,
    ).toBe(false);
    const pos = crowded(2);
    expect(pos).not.toBeNull();
    expect(explainNormal(pos.grid, pos.tray, 0).deep).toBe(true);
  });

  it("il totale è la migliore sequenza di tre mosse, con il tabellone finale giudicato dal rischio imparato", () => {
    let checked = 0;
    for (const seed of [2, 5, 8]) {
      const pos = crowded(seed);
      if (!pos) continue;
      for (const m of explainNormal(pos.grid, pos.tray, 0).byTotal) {
        if (!m.next) continue;
        expect(m.deep).toBe(true);
        const last = m.third || m.next;
        const middle = m.third ? m.next.gain + m.next.lines * 60 : 0;
        expect(m.middle).toBeCloseTo(middle);
        expect(m.total).toBeCloseTo(
          m.gain +
            m.clearBonus +
            middle +
            last.gain +
            last.lines * 60 -
            NORMAL_LEARNED_PENALTY * m.learned -
            m.roomPenalty,
        );
        // il terzo pezzo usa il pezzo rimasto del vassoio, e va dove entra
        if (m.third) {
          expect(m.third.idx).not.toBe(m.idx);
          expect(m.third.idx).not.toBe(m.next.idx);
          expect(m.roomPenalty).toBe(0);
        } else expect(m.roomPenalty).toBe(NORMAL_DEEP.block);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(10);
  });
});

describe("modalità normale: rischio di blocco per il giudizio", () => {
  it("è zero se il pezzo noto rimasto entra, altrimenti una probabilità", () => {
    for (let seed = 1; seed <= 4; seed++) {
      const { grid, tray } = midGame(seed, 25);
      for (const m of analyzeMoves(grid, tray, 0).moves) {
        if (!m.next) {
          expect(m.blockRisk).toBeNull();
          continue;
        }
        expect(m.blockRisk).toBeGreaterThanOrEqual(0);
        expect(m.blockRisk).toBeLessThanOrEqual(1);
        const remaining = tray.find((p, i) => i !== m.idx && i !== m.next.idx);
        if (m.next.after.fits(remaining.cells)) expect(m.blockRisk).toBe(0);
        else expect(m.blockRisk).toBeCloseTo(m.death * m.death);
      }
    }
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
    for (const k of g.cells.keys())
      if (k !== "0,0") g = g.place([[0, 0]], ...k.split(",").map(Number), 1);
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
    const close = analyzePlayedMove({
      grid: g,
      tray,
      streak: 0,
      expert: true,
      idx: 0,
      q: 4,
      r: 0,
    }).moves.find((m) => m.played);
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
  it("regressione · normale, seme 555, 60 pezzi: 623 punti, 36 linee", () => {
    expect(playGame({ mode: "normal", seed: 555, maxMoves: 60 })).toEqual({
      seed: 555,
      pieces: 60,
      points: 623,
      lines: 36,
      lost: false,
    });
  });

  it("regressione · Esperto, seme 7097: 52 pezzi, 561 punti", () => {
    expect(
      playGame({ mode: "expert", seed: seedFor(7000, 1), maxMoves: 5000 }),
    ).toEqual({
      seed: 7097,
      pieces: 52,
      points: 561,
      lines: 28,
      lost: true,
    });
  });

  // Fotografia di tre partite, non una misura di qualità: anche la strategia migliore perde
  // alcune partite presto (vedi README). La qualità si misura con molte partite (`npm run sim`).
  it("regressione · normale, semi 1, 98, 195: tutte e tre a 150 pezzi", () => {
    expect(
      playGames({ mode: "normal", games: 3, maxMoves: 150, seed: 1 }).map(
        (r) => [r.pieces, r.lost],
      ),
    ).toEqual([
      [150, false],
      [150, false],
      [150, false],
    ]);
  });

  it("pairedCompare conta vittorie, sconfitte e pareggi partita per partita", () => {
    const a = [{ pieces: 10 }, { pieces: 20 }, { pieces: 30 }];
    const b = [{ pieces: 12 }, { pieces: 20 }, { pieces: 25 }];
    expect(pairedCompare(a, b)).toMatchObject({ better: 1, worse: 1, ties: 1 });
  });
});
