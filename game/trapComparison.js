import HexGrid from "./HexGrid.js";
import { PIECES, replacePiece, seededRandom } from "./pieces.js";
import { bestMove } from "./strategy.js";

export const COMPARISON_VERSION = "trappole-paired-v1";
export const SETTINGS = {
  first: 30,
  confirmation: 100,
  horizon: 15,
  penalty: 1000,
};
const byId = new Map(PIECES.map((p) => [p.id, p]));

function positionOf(pos) {
  const cells = new Map(new HexGrid(4).cells);
  for (const k of pos.celle) {
    if (!cells.has(k)) throw new Error("Cella non valida");
    cells.set(k, 1);
  }
  const tray = pos.vassoio.map((id) => byId.get(id));
  if (tray.length !== 3 || tray.some((p) => !p))
    throw new Error("Vassoio non valido");
  return { grid: new HexGrid(4, cells), tray, streak: pos.combo };
}

function run(initial, move, rng, horizon) {
  let s = initial,
    points = 0;
  for (let k = 0; k <= horizon; k++) {
    const m = k === 0 ? move : bestMove(s.grid, s.tray, s.streak);
    if (!m) return { points, blocked: true };
    const p = s.tray[m.idx];
    if (!p || !s.grid.canPlace(p.cells, m.q, m.r))
      throw new Error("Mossa non valida");
    const result = s.grid.play(p.cells, m.q, m.r, p.color);
    points +=
      p.cells.length +
      (result.lines.length
        ? Math.round(
            result.clearedCells.size *
              result.lines.length *
              (1 + 0.5 * s.streak),
          )
        : 0);
    s = {
      grid: result.grid,
      tray: replacePiece(s.tray, m.idx, rng),
      streak: result.lines.length ? s.streak + 1 : 0,
    };
  }
  // Conta anche il blocco subito dopo l'ultima mossa dell'orizzonte.
  return {
    points,
    blocked: !s.tray.some((p) => s.grid.placementsFor(p.cells).length > 0),
  };
}

export function summarizePairs(pairs, seed, horizon) {
  const diffs = pairs.map(
    ([a, b]) =>
      a.points -
      b.points -
      SETTINGS.penalty * (Number(a.blocked) - Number(b.blocked)),
  );
  const mean = diffs.reduce((a, b) => a + b, 0) / pairs.length;
  const variance =
    diffs.reduce((sum, n) => sum + (n - mean) ** 2, 0) /
    Math.max(1, pairs.length - 1);
  const side = (idx) => ({
    punti: pairs.reduce((sum, p) => sum + p[idx].points, 0) / pairs.length,
    blocchi: pairs.filter((p) => p[idx].blocked).length,
  });
  return {
    futuri: pairs.length,
    mosse: horizon,
    seme: seed,
    differenza: mean,
    errore: Math.sqrt(variance / pairs.length),
    a: side(0),
    b: side(1),
  };
}

export const isBetter = (r) => r.differenza > 2 * r.errore;

export function compareBatch(
  { posizione, tua, suggerita, count, seed, horizon = SETTINGS.horizon },
  progress = () => {},
) {
  const initial = positionOf(posizione);
  const pairs = [];
  for (let f = 0; f < count; f++) {
    const futureSeed = (seed + f * 104729) >>> 0;
    pairs.push([
      run(initial, tua, seededRandom(futureSeed), horizon),
      run(initial, suggerita, seededRandom(futureSeed), horizon),
    ]);
    progress(f + 1);
  }
  return summarizePairs(pairs, seed, horizon);
}

export function compareCandidate(input, progress = () => {}) {
  const prova = compareBatch(
    { ...input, count: SETTINGS.first, seed: 777 },
    (done) => progress({ phase: "prova", done, total: SETTINGS.first }),
  );
  if (!isBetter(prova)) return { prova, conferma: null, confirmed: false };
  const conferma = compareBatch(
    { ...input, count: SETTINGS.confirmation, seed: 99991 },
    (done) =>
      progress({ phase: "conferma", done, total: SETTINGS.confirmation }),
  );
  return { prova, conferma, confirmed: isBetter(conferma) };
}
