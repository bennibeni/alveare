/**
 * Motore a bit per l'autopsia delle sconfitte: le 61 celle in un BigInt, stesse regole di
 * HexGrid.play (appoggia il pezzo, svuota le linee piene nelle tre direzioni). Serve all'oracolo,
 * che prova milioni di mosse. `node scripts/autopsia/verifica-motore.mjs` lo confronta con HexGrid.
 *
 * Carica i file di gioco da ../../game, oppure dalla cartella indicata in GAME (per provare una
 * strategia modificata, come con pericolo.mjs).
 */
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const GAME_DIR = path.resolve(
  process.env.GAME || path.join(HERE, "../../game"),
);
const load = (f) => import(pathToFileURL(path.join(GAME_DIR, f)));
export const HexGrid = (await load("HexGrid.js")).default;
export const P = await load("pieces.js");
export const { bestMove } = await load("strategy.js");

const g0 = new HexGrid(4);
export const coords = g0.coords;
const idx = new Map(coords.map(([q, r], i) => [`${q},${r}`, i]));
export const N = coords.length;
const bit = (q, r) =>
  idx.has(`${q},${r}`) ? 1n << BigInt(idx.get(`${q},${r}`)) : null;

// linee nelle tre direzioni: q costante, r costante, s = −q − r costante
export const LINES = [];
for (const f of [([q]) => q, ([, r]) => r, ([q, r]) => -q - r]) {
  const by = new Map();
  coords.forEach((c, i) => {
    const k = f(c);
    by.set(k, (by.get(k) || 0n) | (1n << BigInt(i)));
  });
  LINES.push(...by.values());
}

export const PIECES = P.PIECES;
export const pieceIndex = new Map(PIECES.map((p, i) => [p.id, i]));
/** Posizioni di ogni pezzo sul tabellone vuoto: [maschera, q, r]. */
export const PLACE = PIECES.map((p) => {
  const out = [];
  for (const [q, r] of coords) {
    let m = 0n;
    let ok = true;
    for (const [dq, dr] of p.cells) {
      const b = bit(q + dq, r + dr);
      if (b === null) {
        ok = false;
        break;
      }
      m |= b;
    }
    if (ok) out.push([m, q, r]);
  }
  return out;
});

export function popcnt(x) {
  let n = 0;
  while (x) {
    x &= x - 1n;
    n++;
  }
  return n;
}
export const free = (occ) => N - popcnt(occ);

/** Appoggia la maschera m e svuota le linee piene: [celle occupate, linee svuotate]. */
export function play(occ, m) {
  const o = occ | m;
  let clear = 0n;
  let nl = 0;
  for (const L of LINES)
    if ((o & L) === L) {
      clear |= L;
      nl++;
    }
  return [o & ~clear, nl];
}

export function occFromKeys(keys) {
  let o = 0n;
  for (const k of keys) o |= 1n << BigInt(idx.get(k));
  return o;
}
export const occOf = (grid) =>
  occFromKeys([...grid.cells].filter(([, v]) => v).map(([k]) => k));

/** I pezzi che usciranno da seededRandom(seed), uno per mossa (indici in PIECES). */
export function drawSeq(seed, n) {
  const rng = P.seededRandom(seed);
  return Array.from({ length: n }, () => pieceIndex.get(P.randomPiece(rng).id));
}

/** Celle libere di una HexGrid. */
export function freeCells(grid) {
  let n = 0;
  for (const v of grid.cells.values()) if (!v) n++;
  return n;
}

/** Mossa { idx, q, r } su uno stato { grid, tray, streak }; il pezzo nuovo esce da rng. */
export function applyMove(s, idx, q, r, rng) {
  const piece = s.tray[idx];
  const res = s.grid.play(piece.cells, q, r, piece.color);
  return {
    grid: res.grid,
    tray: P.replacePiece(s.tray, idx, rng),
    streak: res.lines.length ? s.streak + 1 : 0,
  };
}

/** Stato da celle occupate (chiavi "q,r") e id dei pezzi. */
export function stateFrom({ cells, tray, streak = 0 }) {
  const byId = new Map(PIECES.map((p) => [p.id, p]));
  const map = new Map(new HexGrid(4).cells);
  for (const k of cells) map.set(k, 1);
  return {
    grid: new HexGrid(4, map),
    tray: tray.map((id) => byId.get(id)),
    streak,
  };
}
