/**
 * Prove dei futuri e misura con lo sdoppiamento, usate da pericolo.mjs (e, in copia, dalla
 * pagina di laboratorio R45).
 *
 * Uno "stato" è { grid, tray, streak }: tabellone, i tre pezzi del vassoio, combo in corso.
 * I pezzi futuri escono da seededRandom(seme): con lo stesso seme due mosse diverse ricevono
 * esattamente gli stessi pezzi, quindi il confronto fra mosse è appaiato.
 */
import HexGrid from "../game/HexGrid.js";
import {
  PIECES,
  randomTray,
  replacePiece,
  seededRandom,
} from "../game/pieces.js";
import { bestMove as defaultBestMove } from "../game/strategy.js";

export const DANGER = 32; // sotto queste celle libere la partita entra in pericolo
export const SAFE = 40; // da queste celle libere in su la partita è di nuovo al sicuro
export const HORIZON = 20; // mosse massime di una continuazione

const PIECE_BY_ID = new Map(PIECES.map((p) => [p.id, p]));
export const pieceById = (id) => PIECE_BY_ID.get(id);

export function freeCells(grid) {
  let n = 0;
  for (const v of grid.cells.values()) if (!v) n++;
  return n;
}

/** Stato da una posizione salvata: celle occupate [q, r] (o voci [chiave, colore]) e id dei pezzi. */
export function stateFrom({ cells, tray, streak = 0 }) {
  const grid = new HexGrid(4);
  const map = new Map(grid.cells);
  for (const c of cells) {
    if (typeof c[0] === "string") map.set(c[0], c[1]);
    else map.set(`${c[0]},${c[1]}`, 1);
  }
  return {
    grid: new HexGrid(4, map),
    tray: tray.map((t) => (typeof t === "string" ? pieceById(t) : t)),
    streak,
  };
}

export function newGame(seed) {
  const rng = seededRandom(seed);
  return {
    rng,
    state: { grid: new HexGrid(4), tray: randomTray(rng), streak: 0 },
  };
}

/** Gioca la mossa { idx, q, r }; il pezzo nuovo esce da rng. */
export function applyMove(state, m, rng) {
  const piece = state.tray[m.idx];
  const res = state.grid.play(piece.cells, m.q, m.r, piece.color);
  return {
    grid: res.grid,
    tray: replacePiece(state.tray, m.idx, rng),
    streak: res.lines.length ? state.streak + 1 : 0,
    lines: res.lines.length,
    cleared: res.clearedCells.size,
  };
}

/** Tutte le mosse legali, una sola volta per pezzi uguali nel vassoio. */
export function legalMoves(state) {
  const out = [];
  const seen = new Set();
  state.tray.forEach((p, idx) => {
    if (!p || seen.has(p.id)) return;
    seen.add(p.id);
    for (const [q, r] of state.grid.placementsFor(p.cells))
      out.push({ idx, q, r });
  });
  return out;
}

/**
 * Continua con la strategia finché la partita torna ad almeno `safe` celle libere (salva),
 * si blocca (persa) o arriva a `horizon` mosse (conta come salva). Restituisce true se persa.
 */
export function continuationLost(
  state,
  rng,
  { safe = SAFE, horizon = HORIZON, bestMove = defaultBestMove } = {},
) {
  let s = state;
  for (let i = 0; i < horizon; i++) {
    if (freeCells(s.grid) >= safe) return false;
    const m = bestMove(s.grid, s.tray, s.streak);
    if (!m) return true;
    s = applyMove(s, m, rng);
  }
  return false;
}

/**
 * Prova una mossa con K futuri: gioca la mossa e poi continua con la strategia.
 * I futuri k = 0…K−1 usano il seme base + k, uguale per tutte le mosse provate.
 */
export function testMove(state, move, K, base, opts = {}) {
  let lost = 0;
  let lines = 0;
  let freeAfter = 0;
  for (let k = 0; k < K; k++) {
    const rng = seededRandom((base + k) >>> 0);
    const s = applyMove(state, move, rng);
    lines = s.lines;
    freeAfter = freeCells(s.grid);
    if (continuationLost(s, rng, opts)) lost++;
  }
  return { lost, K, lines, freeAfter };
}

/**
 * Una partita con lo sdoppiamento: la partita principale gioca col suo seme; a ogni ingresso
 * sotto `danger` celle libere (dopo essere stata ad almeno `safe`) se ne giocano K copie con
 * pezzi futuri nuovi, finché tornano a `safe` celle libere o si bloccano.
 * Restituisce la partita principale e, per ogni ingresso, quante copie si sono bloccate.
 */
export function splitGame(
  seed,
  {
    max = 1000,
    K = 4,
    danger = DANGER,
    safe = SAFE,
    bestMove = defaultBestMove,
  } = {},
) {
  const { rng, state: s0 } = newGame(seed);
  let s = s0;
  let pieces = 0;
  let inDanger = false;
  let lost = false;
  let lostOutside = false;
  const entries = [];
  for (; pieces < max; pieces++) {
    const f = freeCells(s.grid);
    if (f >= safe) inDanger = false;
    if (!inDanger && f < danger) {
      inDanger = true;
      let branchLost = 0;
      let branchMoves = 0;
      for (let k = 0; k < K; k++) {
        const br = seededRandom(
          (seed * 100003 + entries.length * 101 + k + 1) >>> 0,
        );
        let b = s;
        for (let i = 0; i < 200; i++) {
          const m = bestMove(b.grid, b.tray, b.streak);
          branchMoves++;
          if (!m) {
            branchLost++;
            break;
          }
          b = applyMove(b, m, br);
          if (freeCells(b.grid) >= safe) break;
        }
      }
      entries.push({
        pezzo: pieces,
        libere: f,
        perse: branchLost,
        copie: K,
        mosse: branchMoves,
      });
    }
    const m = bestMove(s.grid, s.tray, s.streak);
    if (!m) {
      lost = true;
      lostOutside = !inDanger;
      break;
    }
    s = applyMove(s, m, rng);
  }
  return { seed, pieces, lost, lostOutside, entries };
}

/** Riassunto di più partite con lo sdoppiamento: tasso di sconfitta ogni 1000 pezzi. */
export function splitSummary(games) {
  let pieces = 0;
  let lost = 0;
  let entries = 0;
  let copies = 0;
  let copiesLost = 0;
  for (const g of games) {
    pieces += g.pieces;
    lost += g.lost ? 1 : 0;
    for (const e of g.entries) {
      entries++;
      copies += e.copie;
      copiesLost += e.perse;
    }
  }
  const p = copies ? copiesLost / copies : 0;
  return {
    games: games.length,
    pieces,
    lost,
    entries,
    copies,
    copiesLost,
    pLoss: p,
    entriesPer1000: pieces ? (1000 * entries) / pieces : 0,
    rate: pieces ? ((1000 * entries) / pieces) * p : 0,
    directRate: pieces ? (1000 * lost) / pieces : 0,
  };
}

/** Intervallo bootstrap al 95% di una statistica, ricampionando le partite (generatore con seme). */
export function bootstrap(games, stat, n = 2000) {
  const rng = seededRandom(12345);
  const vals = [];
  for (let b = 0; b < n; b++) {
    const sample = games.map(() => games[Math.floor(rng() * games.length)]);
    const v = stat(sample);
    if (Number.isFinite(v)) vals.push(v);
  }
  if (!vals.length) return [NaN, NaN];
  n = vals.length;
  vals.sort((a, b) => a - b);
  return [vals[Math.floor(0.025 * n)], vals[Math.floor(0.975 * n)]];
}
