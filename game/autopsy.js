/**
 * Autopsia della partita (modalità normale): a partita finita i pezzi arrivati sono tutti noti, e
 * un oracolo che li conosce in anticipo dice, mossa per mossa, se c'era ancora scampo.
 *
 * Dal registro delle mosse (moveLog: tabellone, vassoio e mossa prima di ogni mossa) e dal vassoio
 * finale si ricava quale pezzo è entrato dopo ogni mossa. Per ogni posizione della discesa finale
 * (dall'ultima volta con almeno 40 celle libere) l'oracolo cerca, fra tutte le sequenze di mosse:
 *   "salva"     una sequenza che torna ad almeno 40 celle libere;
 *   "continua"  nessuna torna a 40, ma una gioca tutti i pezzi arrivati e la partita non è ancora
 *               bloccata: oltre, i pezzi non sono mai usciti e l'esito resta ignoto;
 *   "bloccata"  ogni sequenza si blocca prima: senza scampo con i pezzi arrivati;
 *   "ignota"    ricerca troppo lunga, interrotta.
 * La mossa decisiva è l'ultima giocata da una posizione non bloccata verso una bloccata.
 *
 * Il tabellone sta in un BigInt (61 celle), con le stesse regole di HexGrid.play; la ricerca è in
 * profondità, con le mosse ordinate per celle libere dopo la mossa, al massimo 25 mosse.
 */
import HexGrid, { key } from "./HexGrid.js";
import { PIECES } from "./pieces.js";

export const SAFE = 40; // celle libere: da qui il tabellone è di nuovo al sicuro
export const HORIZON = 25; // mosse massime di una sequenza dell'oracolo
export const MAX_STEPS = 40; // posizioni analizzate al massimo, contando dalla fine
const BUDGET = 2e6; // nodi per ricerca

const RADIUS = 4;
const COORDS = new HexGrid(RADIUS).coords;
const N = COORDS.length;
const INDEX = new Map(COORDS.map(([q, r], i) => [key(q, r), i]));
const LINES = [];
for (const f of [([, r]) => r, ([q]) => q, ([q, r]) => -q - r]) {
  const by = new Map();
  COORDS.forEach((c, i) => {
    const k = f(c);
    by.set(k, (by.get(k) || 0n) | (1n << BigInt(i)));
  });
  LINES.push(...by.values());
}
const PIECE_INDEX = new Map(PIECES.map((p, i) => [p.id, i]));
// posizioni di ogni pezzo: [maschera, q, r]
const PLACE = PIECES.map((p) => {
  const out = [];
  for (const [q, r] of COORDS) {
    let m = 0n;
    let ok = true;
    for (const [dq, dr] of p.cells) {
      const i = INDEX.get(key(q + dq, r + dr));
      if (i === undefined) {
        ok = false;
        break;
      }
      m |= 1n << BigInt(i);
    }
    if (ok) out.push([m, q, r]);
  }
  return out;
});

function popcount(x) {
  let n = 0;
  while (x) {
    x &= x - 1n;
    n++;
  }
  return n;
}
const freeOf = (occ) => N - popcount(occ);

function play(occ, m) {
  const o = occ | m;
  let clear = 0n;
  for (const L of LINES) if ((o & L) === L) clear |= L;
  return o & ~clear;
}

/** Celle occupate di un tabellone (HexGrid, oppure voci [chiave, colore]). */
function occOf(cells) {
  let o = 0n;
  for (const [k, v] of cells) if (v) o |= 1n << BigInt(INDEX.get(k));
  return o;
}

function movesOf(occ, tray) {
  const out = [];
  const seen = new Set();
  tray.forEach((p, slot) => {
    if (p === null || seen.has(p)) return;
    seen.add(p);
    for (const [m, q, r] of PLACE[p])
      if ((m & occ) === 0n)
        out.push([freeOf(play(occ, m)), play(occ, m), slot, q, r]);
  });
  return out.sort((a, b) => b[0] - a[0]);
}

const SAVE = 2;
const GO_ON = 1;
const DEAD = 0;
const CODE = ["bloccata", "continua", "salva"];

/**
 * Ricerca dell'oracolo dalla posizione (occ, tray) con i pezzi in arrivo `draws` (uno per
 * mossa, a partire da draws[d]). Restituisce { result, path }: path è la sequenza trovata
 * ([slot, q, r] per mossa) quando il risultato è "salva" o "continua".
 */
export function oracle(occ, tray, draws, d = 0, depth = HORIZON) {
  let nodes = 0;
  const memo = new Map();
  function rec(o, t, dd, left) {
    if (freeOf(o) >= SAFE) return [SAVE, []];
    if (dd === draws.length) return [movesOf(o, t).length ? GO_ON : DEAD, []];
    if (left === 0) return [DEAD, null];
    if (++nodes > BUDGET) throw new Error("budget");
    const k = `${o.toString(36)}|${[...t].sort((a, b) => a - b).join(",")}|${dd}|${left}`;
    const hit = memo.get(k);
    if (hit) return hit;
    let best = [DEAD, null];
    for (const [, o2, slot, q, r] of movesOf(o, t)) {
      const t2 = t.slice();
      t2[slot] = draws[dd];
      const [code, path] = rec(o2, t2, dd + 1, left - 1);
      if (code > best[0]) best = [code, [[slot, q, r], ...path]];
      if (best[0] === SAVE) break;
    }
    memo.set(k, best);
    return best;
  }
  try {
    const [code, path] = rec(occ, tray, d, depth);
    return { result: CODE[code], path: code > DEAD ? path : null };
  } catch (e) {
    if (e.message === "budget") return { result: "ignota", path: null };
    throw e;
  }
}

/**
 * Dati semplici (clonabili per il worker) dal registro della partita: per ogni mossa celle,
 * vassoio (id dei pezzi) e mossa; più il vassoio finale.
 */
export function autopsyInput(moveLog, finalTray) {
  return {
    moves: moveLog.map(({ snapshot: s }) => ({
      cells: [...s.grid.cells],
      tray: s.tray.map((p) => (p ? p.id : null)),
      idx: s.idx,
      q: s.q,
      r: s.r,
      expert: !!s.expert,
    })),
    finalTray: finalTray.map((p) => (p ? p.id : null)),
  };
}

/** I pezzi entrati nel vassoio dopo ogni mossa (id). */
export function drawsOf({ moves, finalTray }) {
  return moves.map((m, i) =>
    i + 1 < moves.length ? moves[i + 1].tray[m.idx] : finalTray[m.idx],
  );
}

/**
 * Autopsia: { start, steps, decisive, saving, legal }.
 *   steps[j]  posizione prima della mossa start + j (l'ultima è quella finale, bloccata):
 *             { move, free, result, path }
 *   decisive  indice in steps della mossa decisiva, o −1
 *   saving    mosse che dalla posizione decisiva non portavano a una posizione bloccata:
 *             [{ idx, q, r, result }]; legal: mosse possibili da quella posizione
 */
export function buildAutopsy(input) {
  const { moves } = input;
  const n = moves.length;
  if (!n || moves.some((m) => m.expert)) return null;
  const draws = drawsOf(input).map((id) => PIECE_INDEX.get(id));
  const positions = moves.map((m) => ({
    occ: occOf(m.cells),
    tray: m.tray.map((id) => PIECE_INDEX.get(id)),
  }));
  // posizione finale: dopo l'ultima mossa
  const last = moves[n - 1];
  const lastPiece = PIECE_INDEX.get(last.tray[last.idx]);
  const lastMask = PLACE[lastPiece].find(
    (x) => x[1] === last.q && x[2] === last.r,
  )[0];
  positions.push({
    occ: play(positions[n - 1].occ, lastMask),
    tray: input.finalTray.map((id) => PIECE_INDEX.get(id)),
  });
  // discesa finale: dall'ultima posizione con almeno SAFE celle libere (esclusa)
  let start = 0;
  for (let i = n; i >= 0; i--)
    if (freeOf(positions[i].occ) >= SAFE) {
      start = i + 1;
      break;
    }
  start = Math.min(Math.max(start, n + 1 - MAX_STEPS), n);
  const steps = [];
  for (let i = start; i <= n; i++) {
    const { occ, tray } = positions[i];
    const { result, path } = oracle(occ, tray, draws, i);
    steps.push({
      move: i < n ? { idx: moves[i].idx, q: moves[i].q, r: moves[i].r } : null,
      number: i + 1,
      free: freeOf(occ),
      result,
      path,
    });
  }
  let decisive = -1;
  for (let j = 0; j + 1 < steps.length; j++)
    if (steps[j].result !== "bloccata" && steps[j + 1].result === "bloccata")
      decisive = j;
  let saving = [];
  let legal = 0;
  if (decisive >= 0) {
    const i = start + decisive;
    const { occ, tray } = positions[i];
    const list = movesOf(occ, tray);
    legal = list.length;
    for (const [, o2, slot, q, r] of list) {
      const t2 = tray.slice();
      t2[slot] = draws[i];
      const { result } = oracle(o2, t2, draws, i + 1, HORIZON - 1);
      if (result !== "bloccata") saving.push({ idx: slot, q, r, result });
    }
  }
  return { start, steps, decisive, saving, legal, draws: drawsOf(input) };
}

/** Mosse possibili (pezzi uguali contati una volta): [{ idx, q, r }]. */
export function legalMoves({ cells, tray }) {
  const occ = occOf(cells);
  const t = tray.map((id) => PIECE_INDEX.get(id));
  return movesOf(occ, t).map(([, , idx, q, r]) => ({ idx, q, r }));
}

export const RISK_FUTURES = 200; // futuri a caso per il rischio di ogni mossa

/** Generatore con seme (mulberry32), come seededRandom in pieces.js. */
function rngFrom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const TOTAL_WEIGHT = PIECES.reduce((s, p) => s + p.weight, 0);
function randomIndex(rng) {
  let x = rng() * TOTAL_WEIGHT;
  for (let i = 0; i < PIECES.length; i++) {
    x -= PIECES[i].weight;
    if (x <= 0) return i;
  }
  return PIECES.length - 1;
}

/**
 * Rischio di ogni mossa con pezzi futuri ignoti: per ognuno di F futuri a caso (gli stessi per
 * tutte le mosse) l'oracolo, che li conosce, cerca una sequenza che torni ad almeno SAFE celle
 * libere. `lost` = futuri senza scampo nemmeno così. Per ogni mossa anche celle libere dopo, linee
 * svuotate e posizioni degli altri due pezzi del vassoio dopo la mossa. Con `draws` (i pezzi
 * entrati dopo ogni mossa della partita) e `d` (indice di questa mossa) anche `actual`: l'esito
 * dell'oracolo con i pezzi arrivati davvero ("salva", "continua", "bloccata").
 */
export function moveRisks(
  { cells, tray, moves, draws = null, d = 0 },
  F = RISK_FUTURES,
) {
  const occ = occOf(cells);
  const t = tray.map((id) => PIECE_INDEX.get(id));
  const futures = Array.from({ length: F }, (_, f) => {
    const rng = rngFrom(4243 + f * 7919);
    return Array.from({ length: HORIZON + 1 }, () => randomIndex(rng));
  });
  return moves.map(({ idx, q, r }) => {
    const mask = PLACE[t[idx]].find((x) => x[1] === q && x[2] === r)[0];
    const placed = occ | mask;
    let lines = 0;
    for (const L of LINES) if ((placed & L) === L) lines++;
    const after = play(occ, mask);
    const others = t
      .map((p, slot) => ({
        slot,
        count: PLACE[p].filter(([m]) => (m & after) === 0n).length,
      }))
      .filter((o) => o.slot !== idx);
    let lost = 0;
    let unknown = 0;
    for (const seq of futures) {
      const t2 = t.slice();
      t2[idx] = seq[0];
      const { result } = oracle(after, t2, seq, 1, HORIZON - 1);
      if (result === "bloccata") lost++;
      else if (result === "ignota") unknown++;
    }
    // con i pezzi arrivati davvero (draws: id dei pezzi entrati dopo ogni mossa, d = questa mossa)
    let actual;
    if (draws && d < draws.length) {
      const seq = draws.map((id) => PIECE_INDEX.get(id));
      const t2 = t.slice();
      t2[idx] = seq[d];
      actual = oracle(after, t2, seq, d + 1, HORIZON - 1).result;
    }
    return {
      idx,
      q,
      r,
      free: freeOf(after),
      lines,
      others,
      lost,
      unknown,
      F,
      ...(actual ? { actual } : {}),
    };
  });
}

/** Posizioni di ogni pezzo del vassoio in una posizione. */
export function placementsOf({ cells, tray }) {
  const occ = occOf(cells);
  return tray.map(
    (id) => PLACE[PIECE_INDEX.get(id)].filter(([m]) => (m & occ) === 0n).length,
  );
}
