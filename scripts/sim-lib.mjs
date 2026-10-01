/**
 * Motore di simulazione: gioca partite complete senza interfaccia, con le stesse
 * regole e lo stesso punteggio del gioco, usando un generatore casuale con seme.
 * Con lo stesso seme due strategie ricevono esattamente gli stessi pezzi: il
 * confronto fra strategie è quindi "appaiato", partita per partita.
 */
import HexGrid from "../game/HexGrid.js";
import { randomTray, replacePiece, seededRandom, shiftQueue } from "../game/pieces.js";
import { bestMove } from "../game/strategy.js";

/** Stesso calcolo del gioco: +1 per cella appoggiata, più il bonus delle linee con combo. */
export function scoreMove(pieceSize, linesCleared, clearedCells, streak) {
  if (!linesCleared) return pieceSize;
  return pieceSize + Math.round(clearedCells * linesCleared * (1 + 0.5 * streak));
}

/**
 * Gioca una partita.
 * mode: "normal" (vassoio libero) o "expert" (coda FIFO)
 * strategy: (grid, tray, streak, { queue }) => { idx, q, r } | null   (default: bestMove del gioco)
 */
export function playGame({ mode = "normal", seed = 1, maxMoves = 1000, strategy = bestMove } = {}) {
  const rng = seededRandom(seed);
  const queue = mode === "expert";
  let grid = new HexGrid(4);
  let tray = randomTray(queue ? null : grid, rng);
  let streak = 0;
  let pieces = 0;
  let points = 0;
  let lines = 0;
  let lost = false;
  for (; pieces < maxMoves; pieces++) {
    const m = strategy(grid, tray, streak, { queue });
    const piece = m && tray[m.idx];
    if (!m || !piece || (queue && m.idx !== 0) || !grid.canPlace(piece.cells, m.q, m.r)) {
      lost = true;
      break;
    }
    const res = grid.play(piece.cells, m.q, m.r);
    points += scoreMove(piece.cells.length, res.lines.length, res.clearedCells.size, streak);
    lines += res.lines.length;
    streak = res.lines.length ? streak + 1 : 0;
    grid = res.grid;
    tray = queue ? shiftQueue(tray, rng) : replacePiece(tray, m.idx, grid, rng);
  }
  return { seed, pieces, points, lines, lost };
}

/** Semi delle partite: gli stessi in ogni esecuzione. */
export const seedFor = (base, i) => base + i * 97;

export function playGames({ games = 20, seed = 7000, ...opts } = {}) {
  const out = [];
  for (let i = 0; i < games; i++) out.push(playGame({ ...opts, seed: seedFor(seed, i) }));
  return out;
}

const quantile = (sorted, f) => sorted[Math.floor(f * (sorted.length - 1))];

export function summarize(results) {
  const len = results.map((r) => r.pieces).sort((a, b) => a - b);
  const pieces = len.reduce((a, b) => a + b, 0);
  const points = results.reduce((a, r) => a + r.points, 0);
  return {
    games: results.length,
    lost: results.filter((r) => r.lost).length,
    median: quantile(len, 0.5),
    q25: quantile(len, 0.25),
    q75: quantile(len, 0.75),
    mean: +(pieces / results.length).toFixed(1),
    max: len[len.length - 1],
    meanPoints: Math.round(points / results.length),
    pointsPerPiece: +(points / Math.max(1, pieces)).toFixed(2),
  };
}

/** Test dei segni bilaterale esatto. */
function signTest(wins, losses) {
  const n = wins + losses;
  if (!n) return 1;
  const c = (n, k) => {
    let r = 1;
    for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
    return r;
  };
  let p = 0;
  for (let i = 0; i <= n; i++) if (Math.abs(i - n / 2) >= Math.abs(wins - n / 2)) p += c(n, i);
  return Math.min(1, p / 2 ** n);
}

/**
 * Confronto appaiato fra due serie di partite giocate con gli stessi semi.
 * metric: "pieces" (durata) oppure "points".
 */
export function pairedCompare(a, b, metric = "pieces") {
  let better = 0;
  let worse = 0;
  a.forEach((ra, i) => {
    if (b[i][metric] > ra[metric]) better++;
    else if (b[i][metric] < ra[metric]) worse++;
  });
  return { better, worse, ties: a.length - better - worse, p: signTest(better, worse) };
}
