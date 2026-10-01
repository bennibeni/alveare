/**
 * Strategia del Suggerimento e dell'Autogioco.
 *
 * 1. Ogni mossa possibile viene valutata guardando il tabellone DOPO la mossa:
 *    - punti guadagnati e linee svuotate (premio);
 *    - celle vuote isolate: 0 vicini liberi (penalità forte) o 1 solo (penalità);
 *    - "libertà": quanti dei 25 pezzi del catalogo entrano ancora da qualche parte;
 *    - linee quasi complete (mancano 1–2 celle): piccolo premio, preparano le combo;
 *    - celle vuote: piccolo premio, un tabellone sgombro è più sicuro.
 * 2. Guarda una mossa avanti: per le 6 mosse migliori prova anche la migliore
 *    mossa successiva con gli altri due pezzi del vassoio, e sceglie la coppia
 *    che rende di più.
 *
 * Su partite simulate (stessi pezzi per entrambe) rende circa il 20% di punti per
 * pezzo in più della strategia precedente, senza partite perse.
 *
 * In modalità Esperto (coda) la ricerca è diversa: vedi bestQueueMove più sotto.
 */
import { parseKey } from "./HexGrid.js";
import { PIECES, SHAPES } from "./pieces.js";

const W = { line: 60, cell: 1, dead: -12, hole: -5, fit: 2.5, near: 1.2, empty: 0.3 };
const LOOKAHEAD = 6;

/** Pesi e parametri, esportati per le pagine che spiegano i suggerimenti. */
export const WEIGHTS = W;
export const NORMAL_LOOKAHEAD = LOOKAHEAD;

function boardFeatures(g) {
  let holes = 0;
  let deadHoles = 0;
  let empty = 0;
  for (const [k, v] of g.cells) {
    if (v) continue;
    empty++;
    const [q, r] = parseKey(k);
    const free = g.getNeighbors(q, r).filter(([a, b]) => g.isEmpty(a, b)).length;
    if (free === 0) deadHoles++;
    else if (free === 1) holes++;
  }
  let fitCount = 0;
  for (const p of PIECES) if (g.fits(p.cells)) fitCount++;
  let near = 0;
  for (const l of g.lines) {
    const miss = l.cells.filter((k) => g.cells.get(k) === 0).length;
    if (miss > 0 && miss <= 2) near += 3 - miss;
  }
  return { holes, deadHoles, empty, fitCount, near };
}

/** Tutte le mosse possibili con valutazione a un passo, dalla migliore. */
function rankedMoves(grid, tray, streak) {
  const moves = [];
  tray.forEach((p, idx) => {
    if (!p) return;
    for (const [q, r] of grid.placementsFor(p.cells)) {
      const res = grid.play(p.cells, q, r);
      const f = boardFeatures(res.grid);
      const gain = res.lines.length ? res.clearedCells.size * res.lines.length * (1 + 0.5 * streak) : 0;
      const value =
        gain * W.cell +
        res.lines.length * W.line +
        f.deadHoles * W.dead +
        f.holes * W.hole +
        f.fitCount * W.fit +
        f.near * W.near +
        f.empty * W.empty;
      moves.push({
        idx,
        q,
        r,
        cells: p.cells,
        piece: p,
        value,
        gain,
        lines: res.lines.length,
        features: f,
        after: res.grid,
        nextStreak: res.lines.length ? streak + 1 : 0,
      });
    }
  });
  return moves.sort((a, b) => b.value - a.value);
}

// ---------------------------------------------------------------------------
// Modalità Esperto (coda FIFO)
// Si conoscono con certezza i tre pezzi della coda, in ordine: si cercano le
// sequenze di tre posizioni (primo, secondo, terzo pezzo) con una "beam search"
// che a ogni livello tiene solo le QUEUE_BEAM sequenze più promettenti. Alla fine
// si stima il rischio del pezzo ignoto che arriverà dopo: probabilità che non
// entri da nessuna parte (forte penalità) e quanto spazio avrebbe (premio).
// Su 100 partite simulate con gli stessi pezzi, le partite durano diverse volte
// più a lungo rispetto alla versione che guardava solo due pezzi.
// ---------------------------------------------------------------------------
const QUEUE_BEAM = 10;
const QUEUE_GAIN = 60; // con la coda conta soprattutto svuotare subito: punti × 60
const UNKNOWN_DEATH = 400; // penalità × probabilità che il pezzo ignoto non entri
const UNKNOWN_ROOM = 40; // premio × spazio medio per il pezzo ignoto (0..1)
export const QUEUE_PARAMS = { beam: QUEUE_BEAM, gain: QUEUE_GAIN, unknownDeath: UNKNOWN_DEATH, unknownRoom: UNKNOWN_ROOM };

// probabilità di uscita di ogni forma (dai pesi di pieces.js)
const SHAPE_P = (() => {
  const w = SHAPES.map((sh) => sh.pieces.reduce((a, p) => a + p.weight, 0));
  const tot = w.reduce((a, b) => a + b, 0);
  return SHAPES.map((sh, i) => ({ shape: sh, p: w[i] / tot }));
})();

/** Valutazione del tabellone (senza i punti): buchi, libertà, linee quasi piene, spazio. */
function boardValue(g) {
  const f = boardFeatures(g);
  return f.deadHoles * W.dead + f.holes * W.hole + f.fitCount * W.fit + f.near * W.near + f.empty * W.empty;
}

/** Rischio del pezzo ignoto che arriverà dopo i tre noti (con il dettaglio per forma). */
function unknownPieceDetail(g) {
  let death = 0;
  let room = 0;
  const perShape = [];
  for (const { shape, p } of SHAPE_P) {
    let n = 0; // posizioni possibili per questa forma (contate fino a 6)
    for (const piece of shape.pieces) {
      n += g.placementsFor(piece.cells).length;
      if (n >= 6) break;
    }
    if (n === 0) death += p;
    room += (p * Math.min(n, 6)) / 6;
    perShape.push({ name: shape.name, color: shape.color, p, n: Math.min(n, 6) });
  }
  return { death, room, perShape, value: -UNKNOWN_DEATH * death + UNKNOWN_ROOM * room };
}

/**
 * Beam search sui pezzi della coda. Restituisce le sequenze finali con il loro
 * valore (v) e quanti candidati sono stati generati/tenuti a ogni livello.
 */
function queueSearch(grid, tray, streak) {
  const pieces = tray.filter(Boolean);
  if (!pieces.length || !grid.fits(pieces[0].cells)) return null;
  let beam = [{ grid, streak, acc: 0, path: [] }];
  const levels = [];
  for (let level = 0; level < pieces.length; level++) {
    const next = [];
    for (const node of beam) {
      for (const [q, r] of node.grid.placementsFor(pieces[level].cells)) {
        const res = node.grid.play(pieces[level].cells, q, r);
        const gain = res.lines.length ? res.clearedCells.size * res.lines.length * (1 + 0.5 * node.streak) : 0;
        const acc = node.acc + gain * QUEUE_GAIN + res.lines.length * W.line;
        next.push({
          grid: res.grid,
          streak: res.lines.length ? node.streak + 1 : 0,
          acc,
          path: [...node.path, { piece: pieces[level], q, r, gain, lines: res.lines.length, before: node.grid }],
          score: acc + boardValue(res.grid),
        });
      }
    }
    if (!next.length) break; // questo pezzo non entra più: decide il livello precedente
    next.sort((a, b) => b.score - a.score);
    const keep = level === pieces.length - 1 ? QUEUE_BEAM * 2 : QUEUE_BEAM;
    levels.push({ piece: pieces[level], generated: next.length, kept: Math.min(keep, next.length) });
    beam = next.slice(0, keep);
  }
  const leaves = beam
    .map((n) => {
      const unknown = unknownPieceDetail(n.grid);
      return { ...n, board: boardValue(n.grid), unknown, v: n.score + unknown.value };
    })
    .sort((a, b) => b.v - a.v);
  return { leaves, levels };
}

function bestQueueMove(grid, tray, streak) {
  const res = queueSearch(grid, tray, streak);
  if (!res) return null;
  const first = res.leaves[0].path[0];
  return { idx: 0, q: first.q, r: first.r, cells: first.piece.cells };
}

/** Per la pagina "Suggerimenti · Esperto": la ricerca completa sul tabellone dato. */
export function explainQueue(grid, tray, streak = 0, top = 5) {
  const res = queueSearch(grid, tray, streak);
  if (!res) return null;
  return { levels: res.levels, leaves: res.leaves.slice(0, top), shapeOdds: SHAPE_P };
}

/**
 * La mossa consigliata: { idx, q, r, cells } oppure null se nessun pezzo entra.
 * Con { queue: true } vale la regola della coda (modalità Esperto).
 */
export function bestMove(grid, tray, streak = 0, { queue = false } = {}) {
  if (queue) return bestQueueMove(grid, tray, streak);
  const moves = rankedMoves(grid, tray, streak);
  let best = null;
  for (const m of moves.slice(0, LOOKAHEAD)) {
    const rest = tray.map((p, i) => (i === m.idx ? null : p));
    const next = rankedMoves(m.after, rest, m.nextStreak)[0];
    const total = m.gain * W.cell + (next ? next.value : -10000);
    if (!best || total > best.total) best = { ...m, total };
  }
  return best && { idx: best.idx, q: best.q, r: best.r, cells: best.cells };
}

/** Per la pagina "Suggerimenti · normale": le mosse candidate col dettaglio dei conti. */
export function explainNormal(grid, tray, streak = 0) {
  const moves = rankedMoves(grid, tray, streak);
  const candidates = moves.slice(0, LOOKAHEAD).map((m) => {
    const rest = tray.map((p, i) => (i === m.idx ? null : p));
    const next = rankedMoves(m.after, rest, m.nextStreak)[0] || null;
    return { ...m, next, total: m.gain * W.cell + (next ? next.value : -10000) };
  });
  const ordered = [...candidates].sort((a, b) => b.total - a.total);
  return { totalMoves: moves.length, byValue: candidates, byTotal: ordered, streak };
}
