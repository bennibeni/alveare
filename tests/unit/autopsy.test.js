import fs from "node:fs";
import { describe, expect, it } from "vitest";
import HexGrid from "../../game/HexGrid.js";
import { PIECES, replacePiece, seededRandom } from "../../game/pieces.js";
import {
  autopsyInput,
  buildAutopsy,
  drawsOf,
  legalMoves,
  moveRisks,
  placementsOf,
} from "../../game/autopsy.js";
import {
  aboutFraction,
  detailedJudgment,
  inPercent,
  verdictText,
} from "../../game/autopsyText.js";

// Copie bloccate dello sdoppiamento (scripts/autopsia): partite che finiscono davvero bloccate.
const data = JSON.parse(
  fs.readFileSync(
    new URL("../../data/autopsia/trappole-100000.json", import.meta.url),
    "utf8",
  ),
);
const traps = data.games.flatMap((g) => g.traps);
const byId = new Map(PIECES.map((p) => [p.id, p]));

/** Registro come quello del gioco (moveLog) e vassoio finale di una copia bloccata. */
function logOf(trap) {
  const cells = new Map(new HexGrid(4).cells);
  for (const k of trap.start.cells) cells.set(k, 1);
  let grid = new HexGrid(4, cells);
  let tray = trap.start.tray.map((id) => byId.get(id));
  const rng = seededRandom(trap.bseed);
  const moveLog = [];
  for (const [idx, q, r] of trap.moves) {
    moveLog.push({
      snapshot: { grid, tray, streak: 0, expert: false, idx, q, r },
    });
    grid = grid.play(tray[idx].cells, q, r, tray[idx].color).grid;
    tray = replacePiece(tray, idx, rng);
  }
  return { moveLog, grid, tray };
}
const find = (seed, pezzo, k) =>
  traps.find((t) => t.seed === seed && t.pezzo === pezzo && t.k === k);

describe("autopsia della partita", () => {
  it("ricava dal registro i pezzi entrati dopo ogni mossa", () => {
    const t = find(136957, 791, 2);
    const { moveLog, tray } = logOf(t);
    const rng = seededRandom(t.bseed);
    const expected = t.moves.map(() => {
      const fake = replacePiece([null], 0, rng);
      return fake[0].id;
    });
    expect(drawsOf(autopsyInput(moveLog, tray))).toEqual(expected);
  });

  it("trova la mossa decisiva e le mosse che evitavano il blocco", () => {
    const { moveLog, tray } = logOf(find(136957, 791, 2));
    const a = buildAutopsy(autopsyInput(moveLog, tray));
    expect(a.steps.map((s) => s.result)).toEqual([
      "continua",
      "bloccata",
      "bloccata",
    ]);
    expect(a.decisive).toBe(0);
    expect(a.legal).toBe(2);
    expect(a.saving).toHaveLength(1);
    // la mossa giocata non è fra quelle che evitavano il blocco
    const played = t2m(moveLog[0].snapshot);
    expect(a.saving.some((m) => t2m(m) === played)).toBe(false);
  });

  it("riconosce una partita senza scampo con i pezzi arrivati", () => {
    const { moveLog, tray } = logOf(find(104753, 79, 0));
    const a = buildAutopsy(autopsyInput(moveLog, tray));
    expect(a.decisive).toBe(-1);
    expect(a.steps.every((s) => s.result === "bloccata")).toBe(true);
  });

  it("concorda con gli script di autopsia su tutte le copie bloccate", () => {
    let decisive = 0;
    let hopeless = 0;
    for (const t of traps) {
      const { moveLog, tray } = logOf(t);
      const a = buildAutopsy(autopsyInput(moveLog, tray));
      expect(a.steps.at(-1).result).toBe("bloccata");
      if (a.decisive >= 0) decisive++;
      else hopeless++;
    }
    // stessi conteggi di scripts/autopsia/autopsia.mjs (README, «Autopsia delle sconfitte»)
    expect(hopeless).toBe(44);
    expect(decisive).toBe(15);
  });

  it("non si applica alla modalità Esperto", () => {
    const { moveLog, tray } = logOf(find(104753, 79, 0));
    moveLog[0].snapshot = { ...moveLog[0].snapshot, expert: true };
    expect(buildAutopsy(autopsyInput(moveLog, tray))).toBeNull();
  });
});

const t2m = (m) => `${m.idx}:${m.q}:${m.r}`;

describe("rischio delle mosse e giudizio dettagliato", () => {
  it("calcola per ogni mossa celle libere, pezzi restanti e futuri senza scampo", () => {
    const t = find(136957, 791, 2);
    const { moveLog } = logOf(t);
    const s = moveLog[0].snapshot;
    const input = { cells: [...s.grid.cells], tray: s.tray.map((p) => p.id) };
    const moves = legalMoves(input);
    expect(moves).toHaveLength(2);
    const risks = moveRisks({ ...input, moves }, 40);
    for (const r of risks) {
      expect(r.F).toBe(40);
      expect(r.lost + r.unknown).toBeLessThanOrEqual(40);
      expect(r.others).toHaveLength(2);
    }
    // stessi futuri per tutte le mosse: il calcolo è riproducibile
    expect(moveRisks({ ...input, moves }, 40)).toEqual(risks);
    expect(placementsOf(input)).toHaveLength(3);
  });

  it("scrive frazioni e articoli in italiano", () => {
    expect(aboutFraction(0.66)).toBe("circa 2 su 3");
    expect(aboutFraction(0.02)).toBe("circa 1 su 50");
    expect(aboutFraction(0)).toBe("mai");
    expect(inPercent(0)).toBe("nello 0%");
    expect(inPercent(0.08)).toBe("nell’8%");
    expect(inPercent(0.63)).toBe("nel 63%");
  });

  it("giudica la mossa 165 della partita di prova come nel resoconto", () => {
    // posizione: 28 libere, barra 4 (2 posti), rombo (6), barra 4 (2); mossa: barra 4 in 6, 13, 21, 30
    const row = (o) => ({
      name: "rombo",
      lines: 0,
      free: 24,
      played: false,
      suggested: false,
      ...o,
    });
    const rows = [
      row({
        slot: 2,
        name: "barra 4",
        cells: [6, 13, 21, 30],
        lost: 0.63,
        played: true,
        others: [
          { slot: 0, name: "barra 4", count: 0 },
          { slot: 1, name: "rombo", count: 1 },
        ],
      }),
      row({
        slot: 0,
        name: "barra 4",
        cells: [13, 21, 30, 39],
        lost: 0,
        suggested: true,
        others: [
          { slot: 1, name: "rombo", count: 2 },
          { slot: 2, name: "barra 4", count: 0 },
        ],
      }),
      row({
        slot: 1,
        cells: [1, 2, 6, 7],
        lost: 0,
        others: [
          { slot: 0, name: "barra 4", count: 1 },
          { slot: 2, name: "barra 4", count: 1 },
        ],
      }),
      row({
        slot: 1,
        cells: [12, 13, 19, 20],
        lost: 0.07,
        lines: 1,
        free: 30,
        others: [
          { slot: 0, name: "barra 4", count: 3 },
          { slot: 2, name: "barra 4", count: 3 },
        ],
      }),
      row({
        slot: 1,
        cells: [6, 7, 12, 13],
        lost: 0.66,
        others: [
          { slot: 0, name: "barra 4", count: 0 },
          { slot: 2, name: "barra 4", count: 0 },
        ],
      }),
    ];
    const text = detailedJudgment({
      position: {
        free: 28,
        tray: [
          { slot: 0, name: "barra 4", count: 2 },
          { slot: 1, name: "rombo", count: 6 },
          { slot: 2, name: "barra 4", count: 2 },
        ],
      },
      rows,
      judgment: { label: "Mossa cattiva", clearlyBetter: 3 },
    }).join(" ");
    expect(text).toContain("28 celle libere");
    expect(text).toContain(
      "I due pezzi barra 4 si contendono gli stessi posti",
    );
    expect(text).toContain("la posizione era ancora buona");
    expect(text).toContain("«Mossa cattiva», con 3 mosse nettamente migliori");
    expect(text).toContain(
      "nel 63% dei futuri (circa 5 su 8), contro lo 0% della mossa più sicura: pezzo 1, barra 4, celle 13, 21, 30, 39, che era anche il suggerimento",
    );
    expect(text).toContain("pezzo 2, rombo, in 1 posto");
    expect(text).toContain("Possibilità di proseguire dopo la mossa: 37%");
  });

  it("dice «pari merito» quando la mossa scelta è sicura come la migliore", () => {
    const row = (o) => ({
      name: "punto",
      lines: 0,
      free: 31,
      played: false,
      suggested: false,
      others: [],
      ...o,
    });
    const rows = [
      row({ slot: 0, cells: [20], lost: 0, free: 40, suggested: true }),
      row({
        slot: 2,
        name: "barra 4",
        cells: [44, 45, 46, 47],
        lost: 0,
        played: true,
      }),
      row({ slot: 0, cells: [23], lost: 0.01 }),
      row({ slot: 0, cells: [6], lost: 0.3 }),
    ];
    const text = detailedJudgment({
      position: { free: 35, tray: [{ slot: 0, name: "punto", count: 30 }] },
      rows,
      judgment: null,
    }).join(" ");
    expect(text).toContain("È fra le 3 mosse più sicure, a pari merito");
  });
});

describe("verdetto", () => {
  const autopsy = { decisive: 0, steps: [{ number: 95, result: "continua" }] };
  it("riconosce la sfortuna: mossa decisiva ma sicura con pezzi qualsiasi", () => {
    expect(
      verdictText(autopsy, { played: { lost: 0 }, best: { lost: 0 } }),
    ).toMatch(/Mossa decisiva: 95, ma era una mossa sicura.*sfortuna/);
  });
  it("riconosce l'errore", () => {
    expect(
      verdictText(autopsy, { played: { lost: 0.63 }, best: { lost: 0 } }),
    ).toMatch(/ed è stato un errore/);
  });
  it("senza rischio calcolato dice solo la mossa decisiva", () => {
    expect(verdictText(autopsy)).toMatch(/^Mossa decisiva: 95\./);
  });
});

describe("esito con i pezzi arrivati", () => {
  it("coincide con le mosse salve dell'autopsia alla mossa decisiva", () => {
    const { moveLog, tray } = logOf(find(136957, 791, 2));
    const input = autopsyInput(moveLog, tray);
    const a = buildAutopsy(input);
    const s = moveLog[a.start + a.decisive].snapshot;
    const pos = { cells: [...s.grid.cells], tray: s.tray.map((p) => p.id) };
    const risks = moveRisks(
      {
        ...pos,
        moves: legalMoves(pos),
        draws: a.draws,
        d: a.start + a.decisive,
      },
      20,
    );
    const saved = risks.filter((r) => r.actual !== "bloccata");
    expect(saved).toHaveLength(a.saving.length);
  });
});
