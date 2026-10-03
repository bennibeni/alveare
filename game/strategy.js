/**
 * Strategia del Suggerimento e dell'Autogioco.
 *
 * 1. Ogni mossa possibile viene valutata guardando il tabellone DOPO la mossa:
 *    - punti guadagnati e linee svuotate (premio);
 *    - celle vuote isolate: 0 vicini liberi (penalità forte) o 1 solo (penalità);
 *    - "libertà": quanti dei 25 pezzi del catalogo entrano ancora da qualche parte;
 *    - linee quasi complete (mancano 1–2 celle): piccolo premio, preparano le combo;
 *    - celle vuote: piccolo premio, un tabellone sgombro è più sicuro.
 * 2. Guarda una mossa avanti: per le 20 mosse migliori prova anche la migliore
 *    mossa successiva con gli altri due pezzi del vassoio, e sceglie la coppia
 *    che rende di più.
 * 3. Toglie al totale 200 × (1 − posizioni del pezzo noto rimasto / 6, fino a 6) e
 *    1.600 × la probabilità che un pezzo estratto a caso non entri
 *    nel tabellone dopo le due mosse: i pezzi in arrivo sono ignoti, ma un tabellone
 *    in cui molte forme non entrano più è un tabellone pericoloso.
 *
 * In modalità Esperto (coda) la ricerca è diversa: vedi queueCandidates più sotto.
 */
import { DIRECTIONS, parseKey } from "./HexGrid.js";
import { PIECES, SHAPES } from "./pieces.js";
import { pieceAvailability } from "./pieceAvailability.js";

const W = { line: 60, cell: 1, dead: -12, hole: -5, fit: 2.5, near: 1.2, empty: 0.3 };
// Candidate approfondite: con 6 il suggerimento era il migliore secondo il suo stesso criterio
// solo nel 59% delle posizioni (il voto a un passo prevede male il totale); con 20 nell'87%.
const LOOKAHEAD = 20;
// Penalità × probabilità che un pezzo nuovo non entri dopo le due mosse. Con più candidate la
// ricerca trova più combinazioni che rendono punti: 1.600 è il valore che ha reso di più al
// simulatore (60 partite appaiate; provati 400, 800, 1.600, 2.400, 3.200).
const NORMAL_DEATH = 1600;
// Penalità × (1 − posizioni del pezzo noto rimasto / 6) dopo le due mosse: un pezzo che resta nel
// vassoio con poco spazio sul tabellone è il primo passo verso il blocco (vedi README).
const NORMAL_ROOM = 200;

// Delle candidate approfondite, l'analisi e il giudizio confrontano le migliori NORMAL_SHOWN per
// totale (più la mossa giocata): le stesse che vede il giocatore, con la calibrazione del giudizio.
const NORMAL_SHOWN = 6;

/** Pesi e parametri, esportati per le pagine che spiegano i suggerimenti. */
export const WEIGHTS = W;
export const NORMAL_LOOKAHEAD = LOOKAHEAD;
export const NORMAL_ANALYSIS = NORMAL_SHOWN;
export const NORMAL_RISK = NORMAL_DEATH;
export const NORMAL_ROOM_PENALTY = NORMAL_ROOM;

function boardFeatures(g) {
  let holes = 0;
  let deadHoles = 0;
  let empty = 0;
  for (const [k, v] of g.cells) {
    if (v) continue;
    empty++;
    const [q, r] = parseKey(k);
    let free = 0;
    for (const [dq, dr] of DIRECTIONS) if (g.isEmpty(q + dq, r + dr)) free++;
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

/** Probabilità che un pezzo estratto a caso non entri nel tabellone dopo le due mosse.
 * Non è la probabilità di fine partita (il vassoio ha tre pezzi), ma misura quanto il
 * tabellone è diventato stretto. Provata anche la stima "esatta" della fine partita
 * (pezzo noto rimasto che non entra × probabilità al quadrato): rendeva meno. */
function normalDeath(next) {
  return pieceAvailability(next.after, 1).death;
}

/** Totale di una candidata: punti della prima mossa + voto della migliore seconda
 * mossa con gli altri due pezzi − rischio che un pezzo nuovo non entri. */
function withLookahead(m, tray) {
  const rest = tray.map((p, i) => (i === m.idx ? null : p));
  const next = rankedMoves(m.after, rest, m.nextStreak)[0] || null;
  const death = next ? normalDeath(next) : 1;
  const room = next ? remainingRoom(m, next, tray) : 0;
  const roomPenalty = NORMAL_ROOM * (1 - room / 6);
  const total = m.gain * W.cell + (next ? next.value - NORMAL_DEATH * death - roomPenalty : -10000);
  return { ...m, next, death, room, roomPenalty, blockRisk: next ? blockRisk(m, next, tray, death) : null, total };
}

/** Posizioni (fino a 6) del pezzo noto che resta nel vassoio dopo la mossa e la seconda mossa. */
function remainingRoom(m, next, tray) {
  const remaining = tray.find((p, i) => p && i !== m.idx && i !== next.idx);
  if (!remaining) return 6;
  let n = 0;
  for (const [q, r] of next.after.coords) if (next.after.canPlace(remaining.cells, q, r) && ++n >= 6) break;
  return n;
}

/** Per il giudizio: probabilità che dopo le due mosse non entri NESSUN pezzo del vassoio
 * (il pezzo noto rimasto non entra e nemmeno i due estratti). È l'analogo del rischio del
 * pezzo ignoto in Esperto: blocco subito dopo i pezzi noti. */
function blockRisk(m, next, tray, death) {
  const remaining = tray.find((p, i) => p && i !== m.idx && i !== next.idx);
  if (remaining && next.after.fits(remaining.cells)) return 0;
  return death * death;
}

/** Le LOOKAHEAD mosse migliori per voto, approfondite; byTotal[0] è il suggerimento. */
function normalCandidates(grid, tray, streak) {
  const moves = rankedMoves(grid, tray, streak);
  const byValue = moves.slice(0, LOOKAHEAD).map((m) => withLookahead(m, tray));
  return { totalMoves: moves.length, byValue, byTotal: [...byValue].sort((a, b) => b.total - a.total) };
}

// ---------------------------------------------------------------------------
// Modalità Esperto (coda FIFO)
// Si conoscono con certezza i tre pezzi della coda, in ordine. Le posizioni del
// primo pezzo ricevono un voto a un passo e le QUEUE_FIRST migliori vengono
// approfondite UNA PER UNA: per ciascuna, una "beam search" sui due pezzi
// successivi tiene a ogni livello le QUEUE_BEAM sequenze più promettenti
// (QUEUE_BEAM × 2 all'ultimo). Alla fine si stima il rischio del pezzo ignoto
// che arriverà dopo: probabilità che non entri da nessuna parte (forte
// penalità) e quanto spazio avrebbe (premio).
// Ogni prima mossa ha il proprio fascio, quindi suggerimento, analisi e
// valutazione di una mossa manuale usano esattamente la stessa ricerca.
// ---------------------------------------------------------------------------
const QUEUE_BEAM = 10;
const QUEUE_FIRST = 10; // prime mosse approfondite, ciascuna con un proprio fascio
const QUEUE_GAIN = 60; // con la coda conta soprattutto svuotare subito: punti × 60
const UNKNOWN_DEATH = 1200; // penalità × probabilità che il pezzo ignoto non entri (scelta con il simulatore)
const UNKNOWN_ROOM = 40; // premio × spazio medio per il pezzo ignoto (0..1)
const BLOCKED = 10000; // penalità per una sequenza che non colloca tutti i pezzi noti
export const QUEUE_PARAMS = {
  beam: QUEUE_BEAM, first: QUEUE_FIRST, gain: QUEUE_GAIN,
  unknownDeath: UNKNOWN_DEATH, unknownRoom: UNKNOWN_ROOM, blocked: BLOCKED,
};

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
  const { death, room, pieces } = pieceAvailability(g, 6);
  const perShape = SHAPE_P.map(({ shape, p }) => {
    const orientations = pieces.filter((piece) => piece.name === shape.name);
    return { name: shape.name, color: shape.color, p,
      n: orientations.reduce((sum, piece) => sum + Math.min(6, piece.placements), 0) / orientations.length,
      death: orientations.reduce((sum, piece) => sum + (piece.placements ? 0 : piece.p), 0),
    };
  });
  return { death, room, perShape, value: -UNKNOWN_DEATH * death + UNKNOWN_ROOM * room };
}

/** Un passo della sequenza: gioca il pezzo e aggiorna punti, combo e punteggio. */
function expand(node, piece, q, r) {
  const res = node.grid.play(piece.cells, q, r);
  const gain = res.lines.length ? res.clearedCells.size * res.lines.length * (1 + 0.5 * node.streak) : 0;
  const acc = node.acc + gain * QUEUE_GAIN + res.lines.length * W.line;
  return {
    grid: res.grid,
    streak: res.lines.length ? node.streak + 1 : 0,
    acc,
    path: [...node.path, { piece, q, r, gain, lines: res.lines.length, before: node.grid }],
    score: acc + boardValue(res.grid),
  };
}

/**
 * Beam search sui pezzi della coda, con la prima mossa fissata. Restituisce le
 * sequenze finali con il loro valore (v) e quanti candidati sono stati
 * generati/tenuti a ogni livello successivo al primo. Se un pezzo noto non entra
 * più, la sequenza resta incompleta: è "bloccata" e perde BLOCKED punti.
 */
function queueSearch(grid, tray, streak, firstMove) {
  const pieces = tray.filter(Boolean);
  if (!pieces.length || !grid.canPlace(pieces[0].cells, firstMove.q, firstMove.r)) return null;
  let beam = [expand({ grid, streak, acc: 0, path: [] }, pieces[0], firstMove.q, firstMove.r)];
  const levels = [];
  for (let level = 1; level < pieces.length; level++) {
    const next = [];
    for (const node of beam) {
      for (const [q, r] of node.grid.placementsFor(pieces[level].cells)) next.push(expand(node, pieces[level], q, r));
    }
    if (!next.length) break; // questo pezzo non entra più: la sequenza resta bloccata
    next.sort((a, b) => b.score - a.score);
    const keep = level === pieces.length - 1 ? QUEUE_BEAM * 2 : QUEUE_BEAM;
    levels.push({ piece: pieces[level], generated: next.length, kept: Math.min(keep, next.length) });
    beam = next.slice(0, keep);
  }
  const leaves = beam
    .map((n) => {
      const unknown = unknownPieceDetail(n.grid);
      const blocked = n.path.length < pieces.length;
      return { ...n, board: boardValue(n.grid), unknown, blocked, v: n.score + unknown.value - (blocked ? BLOCKED : 0) };
    })
    .sort((a, b) => b.v - a.v);
  return { leaves, levels };
}

/**
 * Le prime mosse approfondite, dalla migliore: ognuna con la sua migliore sequenza.
 * A parità di valore resta l'ordine del voto a un passo.
 */
function queueCandidates(grid, tray, streak) {
  const first = tray.find(Boolean);
  if (!first) return null;
  const root = { grid, streak, acc: 0, path: [] };
  const firsts = grid.placementsFor(first.cells)
    .map(([q, r]) => ({ q, r, score: expand(root, first, q, r).score }))
    .sort((a, b) => b.score - a.score);
  if (!firsts.length) return null;
  const moves = firsts.slice(0, QUEUE_FIRST)
    .map(({ q, r }, order) => {
      const search = queueSearch(grid, tray, streak, { q, r });
      return { q, r, order, piece: first, leaf: search.leaves[0], levels: search.levels };
    })
    .sort((a, b) => b.leaf.v - a.leaf.v || a.order - b.order);
  return { totalMoves: firsts.length, moves };
}

// Suggerimento, analisi e pagina guida chiedono spesso la stessa posizione:
// il tabellone è immutabile, quindi il risultato si può riusare.
const queueCache = new WeakMap();
function cachedQueueCandidates(grid, tray, streak) {
  const key = `${streak}|${tray.map((p) => p?.id ?? "-").join(",")}`;
  let byTray = queueCache.get(grid);
  if (!byTray) queueCache.set(grid, (byTray = new Map()));
  if (!byTray.has(key)) byTray.set(key, queueCandidates(grid, tray, streak));
  return byTray.get(key);
}

function bestQueueMove(grid, tray, streak) {
  const res = cachedQueueCandidates(grid, tray, streak);
  if (!res) return null;
  const best = res.moves[0];
  return { idx: 0, q: best.q, r: best.r, cells: best.piece.cells };
}

/** Per la pagina "Suggerimenti · Esperto": la ricerca completa sul tabellone dato. */
export function explainQueue(grid, tray, streak = 0, top = 5) {
  const res = cachedQueueCandidates(grid, tray, streak);
  if (!res) return null;
  const best = res.moves[0];
  return {
    levels: [{ piece: best.piece, generated: res.totalMoves, kept: res.moves.length }, ...best.levels],
    leaves: res.moves.slice(0, top).map((m) => m.leaf),
    firstMoves: res.moves.length,
    totalMoves: res.totalMoves,
    shapeOdds: SHAPE_P,
  };
}

/**
 * La mossa consigliata: { idx, q, r, cells } oppure null se nessun pezzo entra.
 * Con { queue: true } vale la regola della coda (modalità Esperto).
 */
export function bestMove(grid, tray, streak = 0, { queue = false } = {}) {
  if (queue) return bestQueueMove(grid, tray, streak);
  const best = normalCandidates(grid, tray, streak).byTotal[0];
  return best ? { idx: best.idx, q: best.q, r: best.r, cells: best.cells } : null;
}

/** Per la pagina "Suggerimenti · normale": le mosse candidate col dettaglio dei conti. */
export function explainNormal(grid, tray, streak = 0) {
  return { ...normalCandidates(grid, tray, streak), streak };
}

/** Classifica delle sole candidate approfondite dalla strategia attuale.
 * In coda, ogni prima mossa approfondita compare con la sua migliore sequenza:
 * la prima della lista è sempre il suggerimento.
 */
export function analyzeMoves(grid, tray, streak = 0, { queue = false } = {}) {
  if (!queue) {
    const result = normalCandidates(grid, tray, streak);
    return { totalMoves: result.totalMoves, evaluated: result.byTotal.length, moves: result.byTotal.slice(0, NORMAL_SHOWN) };
  }
  const res = cachedQueueCandidates(grid, tray, streak);
  const moves = (res?.moves || []).map(({ q, r, piece, leaf }) => ({
    idx: 0, q, r, piece, cells: piece.cells, lines: leaf.path[0].lines, total: leaf.v, sequence: leaf,
  }));
  return { totalMoves: res?.totalMoves ?? (tray[0] ? grid.placementsFor(tray[0].cells).length : 0), moves };
}

/** Confronto retrospettivo: usa esclusivamente i pezzi e il tabellone PRIMA
 * della mossa, senza conoscere il nuovo pezzo estratto. La ricerca aggiuntiva
 * riguarda solo la mossa giocata e non modifica mai il suggerimento.
 */
export function analyzePlayedMove({ grid, tray, streak, expert, idx, q, r }) {
  const analysis = analyzeMoves(grid, tray, streak, { queue: expert });
  const selectedPiece = tray[idx];
  if (selectedPiece && (!expert || idx === 0) && grid.canPlace(selectedPiece.cells, q, r)) {
    const before = boardFeatures(grid);
    const after = boardFeatures(grid.play(selectedPiece.cells, q, r).grid);
    const contacts = selectedPiece.cells.map(([dq, dr]) =>
      grid.getNeighbors(q + dq, r + dr).filter(([nq, nr]) => grid.get(nq, nr) > 0).length);
    analysis.placementQuality = {
      cellCount: grid.cells.size,
      touchingCells: contacts.filter((n) => n > 0).length,
      sharedEdges: contacts.reduce((sum, n) => sum + n, 0),
      before, after,
    };
    if (selectedPiece.cells.length === 1) {
      const alternatives = rankedMoves(grid, expert ? [tray[0]] : tray, streak)
        .filter((m) => m.idx !== idx || m.q !== q || m.r !== r);
      const beforeRisk = pieceAvailability(grid, 1).death;
      let viable = 0;
      let canPreservePoint = false;
      for (const m of alternatives) {
        // Un altro punto senza chiusura consuma la stessa risorsa e non è
        // un motivo per criticare una scelta obbligata del tipo di pezzo.
        if (m.cells.length === 1 && m.lines === 0) continue;
        const known = expert ? tray.slice(1, 2) : tray.filter((_, i) => i !== m.idx);
        if (!known.some((p) => p && m.after.fits(p.cells))) continue;
        if (m.features.deadHoles > before.deadHoles || m.features.holes > before.holes) continue;
        if (pieceAvailability(m.after, 1).death > Math.min(0.5, beforeRisk + 0.1)) continue;
        viable++;
        if (m.cells.length > 1) canPreservePoint = true;
      }
      analysis.singleCellUse = {
        alternativesChecked: alternatives.length,
        viableAlternatives: viable,
        canPreservePoint,
        forcedPiece: !alternatives.some((m) => m.cells.length > 1),
        netImprovement: after.empty > before.empty && after.fitCount >= before.fitCount
          && after.deadHoles <= before.deadHoles && after.holes <= before.holes,
      };
    }
  }
  const found = analysis.moves.find((m) => m.idx === idx && m.q === q && m.r === r);
  if (found) return { ...analysis, moves: analysis.moves.map((m) => ({ ...m, played: m === found })) };
  const piece = tray[idx];
  if (!piece || (expert && idx !== 0) || !grid.canPlace(piece.cells, q, r)) return analysis;
  let move;
  if (expert) {
    const sequence = queueSearch(grid, tray, streak, { q, r }).leaves[0];
    move = { idx, q, r, piece, cells: piece.cells, lines: sequence.path[0].lines, total: sequence.v, sequence };
  } else {
    const candidate = rankedMoves(grid, tray, streak).find((m) => m.idx === idx && m.q === q && m.r === r);
    move = withLookahead(candidate, tray);
  }
  return { ...analysis, moves: [...analysis.moves, { ...move, played: true, added: true }] };
}

/** Copia dell'analisi senza i tabelloni intermedi: solo dati semplici, adatti a essere
 * spediti da un worker. Contiene tutto ciò che usano giudizio, interfaccia e log. */
export function slimAnalysis(analysis) {
  if (!analysis) return analysis;
  const placement = (m) => m && {
    idx: m.idx, q: m.q, r: m.r, piece: m.piece, cells: m.cells,
    value: m.value, gain: m.gain, lines: m.lines, features: m.features,
  };
  return {
    totalMoves: analysis.totalMoves,
    ...(analysis.evaluated !== undefined ? { evaluated: analysis.evaluated } : {}),
    ...(analysis.placementQuality ? { placementQuality: analysis.placementQuality } : {}),
    ...(analysis.singleCellUse ? { singleCellUse: analysis.singleCellUse } : {}),
    moves: analysis.moves.map((m) => ({
      ...placement(m), total: m.total,
      ...(m.death !== undefined ? { death: m.death } : {}),
      ...(m.blockRisk !== undefined ? { blockRisk: m.blockRisk } : {}),
      ...(m.roomPenalty !== undefined ? { room: m.room, roomPenalty: m.roomPenalty } : {}),
      ...(m.played !== undefined ? { played: m.played } : {}),
      ...(m.added ? { added: true } : {}),
      ...(m.next !== undefined ? { next: placement(m.next) } : {}),
      ...(m.sequence ? { sequence: {
        path: m.sequence.path.map(({ piece, q, r, gain, lines }) => ({ piece, q, r, gain, lines })),
        acc: m.sequence.acc, score: m.sequence.score, board: m.sequence.board,
        unknown: m.sequence.unknown, blocked: m.sequence.blocked, v: m.sequence.v,
      } } : {}),
    })),
  };
}
