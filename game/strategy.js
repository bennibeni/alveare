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
 * 3. Toglie al totale 1.000 × (1 − spazio per rombo e ferro di cavallo), 200 × (1 −
 *    posizioni del pezzo noto rimasto / 6, fino a 6) e
 *    1.600 × la probabilità che un pezzo estratto a caso non entri
 *    nel tabellone dopo le due mosse: i pezzi in arrivo sono ignoti, ma un tabellone
 *    in cui molte forme non entrano più è un tabellone pericoloso.
 *
 * Dal rischio imparato (learnedRisk.js): il tabellone finale dello sguardo avanti si giudica con
 * punti e linee dell'ultima mossa − 1.600 × la probabilità di blocco imparata, al posto del voto a
 * un passo e delle penalità del punto 3 (che restano calcolate per guida e giudizi).
 *
 * In modalità Esperto (coda) la ricerca è diversa: vedi queueCandidates più sotto.
 */
import { gridMasks, popcount } from "./HexGrid.js";
import { PIECES, SHAPES } from "./pieces.js";
import { pieceAvailability } from "./pieceAvailability.js";
import { learnedRisk } from "./learnedRisk.js";

const W = {
  line: 60,
  cell: 1,
  dead: -12,
  hole: -5,
  fit: 2.5,
  near: 1.2,
  empty: 0.3,
};
// Candidate approfondite: con 6 il suggerimento era il migliore secondo il suo stesso criterio
// solo nel 59% delle posizioni (il voto a un passo prevede male il totale); con 20 nell'87%.
const LOOKAHEAD = 20;
// Mosse approfondite in più per ogni pezzo diverso del vassoio (vedi normalCandidates).
const PER_PIECE = 3;
// Penalità × probabilità che un pezzo nuovo non entri dopo le due mosse. Con più candidate la
// ricerca trova più combinazioni che rendono punti: 1.600 è il valore che ha reso di più al
// simulatore (60 partite appaiate; provati 400, 800, 1.600, 2.400, 3.200).
const NORMAL_DEATH = 1600;
// Penalità × (1 − posizioni del pezzo noto rimasto / 6) dopo le due mosse: un pezzo che resta nel
// vassoio con poco spazio sul tabellone è il primo passo verso il blocco (vedi README).
const NORMAL_ROOM = 200;
// Penalità × (1 − spazio per rombo e ferro di cavallo) dopo le due mosse. Sono le forme compatte
// che fanno perdere più spesso (31–32% dei pezzi nel vassoio a fine partita, contro il 22% di
// uscita): servono buchi "a blocco". Spazio = media pesata con le probabilità di uscita di
// min(posizioni, 6) / 6 sui loro orientamenti. Valore scelto con il simulatore (vedi README).
const NORMAL_BIG = 1000;
const BIG_SHAPES = new Set(["rombo", "ferro di cavallo"]);
// Voto del tabellone finale dello sguardo avanti (autoapprendimento, vedi learnedRisk.js): punti e
// linee dell'ultima mossa − NORMAL_LEARNED × probabilità imparata di blocco. Sostituisce il voto a
// un passo e le penalità scritte a mano (pezzo nuovo che non entra, spazio per rombo e ferro, linee
// chiudibili). Sdoppiamento, 600 partite (semi 40000 e 70000): tasso di sconfitta 0,094 -> 0,065
// (rapporto 0,69, intervallo 0,50–0,93), ingressi in pericolo 9,5 -> 5,5 ogni 1000 pezzi.
const NORMAL_LEARNED = 1600;
export const NORMAL_LEARNED_PENALTY = NORMAL_LEARNED;
/** Voto imparato del tabellone dopo la mossa mv (una voce di rankedMoves). */
function leafValue(mv) {
  return (
    mv.gain * W.cell +
    mv.lines * W.line -
    NORMAL_LEARNED * learnedRisk(mv.after)
  );
}
// Premio × linee svuotate dalla prima mossa × affollamento (celle occupate / celle totali, prima
// della mossa). Con il tabellone vuoto conviene rimandare lo svuotamento e preparare le combo; con
// il tabellone pieno conviene liberare spazio subito. Valore scelto con il simulatore (vedi README).
const NORMAL_CLEAR = 180;
// Premio × linee chiudibili × affollamento, sul tabellone dopo le due mosse. Linee chiudibili = numero
// atteso di linee (a cui mancano da 1 a 3 celle) che un pezzo estratto a caso può chiudere con una sola
// mossa: le mosse che "preparano" uno svuotamento. Valore scelto con il simulatore (vedi README).
const NORMAL_CLOSABLE = 100;
// Con meno di NORMAL_DEEP_FREE celle libere (zona di pericolo: sotto le 36 il rischio di perdere entro
// 10 mosse sale dallo 0,1% a diversi punti percentuali) si guardano tutti e tre i pezzi noti: per ogni
// candidata NORMAL_DEEP_SECOND seconde mosse e NORMAL_DEEP_THIRD terze mosse. Se il terzo pezzo non
// entra, penalità NORMAL_DEEP_BLOCK. Valori scelti con il simulatore (vedi README).
const NORMAL_DEEP_FREE = 36;
const NORMAL_DEEP_SECOND = 5;
const NORMAL_DEEP_THIRD = 3;
const NORMAL_DEEP_BLOCK = 1000;

// Pezzo nuovo alla seconda mossa. Dopo la prima mossa entra nel vassoio un pezzo nuovo, quindi la
// seconda mossa si può fare con uno dei due pezzi noti rimasti OPPURE con quello. Con meno di
// NORMAL_NEW_FREE celle libere (e almeno NORMAL_DEEP_FREE, dove vale lo sguardo a tre pezzi) le
// NORMAL_NEW_TOP migliori candidate per totale si rivalutano così: per ognuno dei 25 pezzi
// possibili, pesato con la sua probabilità di uscita, si prende la migliore seconda mossa (per voto)
// fra i tre pezzi e si fa la media della coda (voto della seconda mossa, linee chiudibili, rischi).
// Su 300 partite con lo sdoppiamento: ingressi in pericolo −22% (intervallo 0,74–0,82), partite
// perse 43 → 29 (rapporto 0,66, intervallo 0,41–1,04): miglioramento probabile, non dimostrato.
// Costo: circa 21 ms per mossa invece di 6.
const NORMAL_NEW_FREE = 45;
const NORMAL_NEW_TOP = 8;

// Delle candidate approfondite, l'analisi e il giudizio confrontano le migliori NORMAL_SHOWN per
// totale (più la mossa giocata): le stesse che vede il giocatore, con la calibrazione del giudizio.
const NORMAL_SHOWN = 6;

/** Pesi e parametri, esportati per le pagine che spiegano i suggerimenti. */
export const WEIGHTS = W;
export const NORMAL_LOOKAHEAD = LOOKAHEAD;
export const NORMAL_ANALYSIS = NORMAL_SHOWN;
export const NORMAL_RISK = NORMAL_DEATH;
export const NORMAL_ROOM_PENALTY = NORMAL_ROOM;
export const NORMAL_BIG_PENALTY = NORMAL_BIG;
export const NORMAL_BIG_SHAPES = [...BIG_SHAPES];
export const NORMAL_CLEAR_BONUS = NORMAL_CLEAR;
export const NORMAL_CLOSABLE_BONUS = NORMAL_CLOSABLE;
export const NORMAL_NEW_PIECE = { free: NORMAL_NEW_FREE, top: NORMAL_NEW_TOP };
export const NORMAL_DEEP = {
  free: NORMAL_DEEP_FREE,
  second: NORMAL_DEEP_SECOND,
  third: NORMAL_DEEP_THIRD,
  block: NORMAL_DEEP_BLOCK,
};

const PIECE_WEIGHT = PIECES.reduce((a, p) => a + p.weight, 0);

/** Numero atteso di linee che un pezzo estratto a caso può chiudere con una sola mossa
 * (contando solo le linee a cui mancano da 1 a 3 celle). */
export function closableLines(g) {
  // celle mancanti di ogni linea come maschere di bit (vedi HexGrid): una linea si chiude con
  // una posizione del pezzo se le celle mancanti sono tutte coperte dal pezzo
  const { lineLo, lineHi } = gridMasks(g);
  const [el, eh] = g.emptyBits;
  const missLo = [];
  const missHi = [];
  for (let i = 0; i < lineLo.length; i++) {
    const ml = lineLo[i] & el;
    const mh = lineHi[i] & eh;
    const miss = popcount(ml) + popcount(mh);
    if (miss < 1 || miss > 3) continue;
    missLo.push(ml);
    missHi.push(mh);
  }
  if (!missLo.length) return 0;
  let expected = 0;
  for (const piece of PIECES) {
    const masks = g.placementMasksFor(piece.cells);
    let closed = 0;
    for (let li = 0; li < missLo.length; li++) {
      const ml = missLo[li];
      const mh = missHi[li];
      for (let j = 0; j < masks.length; j += 2) {
        if ((ml & ~masks[j]) === 0 && (mh & ~masks[j + 1]) === 0) {
          closed++;
          break;
        }
      }
    }
    expected += (piece.weight / PIECE_WEIGHT) * closed;
  }
  return expected;
}

/** Zona di pericolo: meno di NORMAL_DEEP_FREE celle libere. */
function isDeep(g) {
  let free = 0;
  for (const v of g.cells.values()) if (!v) free++;
  return free < NORMAL_DEEP_FREE;
}

/** Celle occupate / celle totali: 0 con il tabellone vuoto, 1 con il tabellone pieno. */
function crowding(g) {
  let filled = 0;
  for (const v of g.cells.values()) if (v) filled++;
  return filled / g.cells.size;
}

function boardFeatures(g) {
  // conteggi con le maschere di bit di HexGrid: celle vuote, vicini vuoti, celle mancanti per linea
  const { lineLo, lineHi, nbLo, nbHi } = gridMasks(g);
  const [el, eh] = g.emptyBits;
  let holes = 0;
  let deadHoles = 0;
  const empty = popcount(el) + popcount(eh);
  for (let i = 0; i < nbLo.length; i++) {
    const isEmpty = i < 32 ? (el >>> i) & 1 : (eh >>> (i - 32)) & 1;
    if (!isEmpty) continue;
    const free = popcount(nbLo[i] & el) + popcount(nbHi[i] & eh);
    if (free === 0) deadHoles++;
    else if (free === 1) holes++;
  }
  let fitCount = 0;
  for (const p of PIECES) if (g.fits(p.cells)) fitCount++;
  let near = 0;
  for (let i = 0; i < lineLo.length; i++) {
    const miss = popcount(lineLo[i] & el) + popcount(lineHi[i] & eh);
    if (miss > 0 && miss <= 2) near += 3 - miss;
  }
  return { holes, deadHoles, empty, fitCount, near };
}

/** Tutte le mosse possibili con valutazione a un passo, dalla migliore. */
function rankedMoves(grid, tray, streak) {
  const moves = [];
  const crowd = crowding(grid);
  tray.forEach((p, idx) => {
    if (!p) return;
    // pezzi identici (stessa forma e orientamento) danno le stesse mosse: solo il primo le genera
    if (tray.slice(0, idx).some((o) => o && o.id === p.id)) return;
    for (const [q, r] of grid.placementsFor(p.cells)) {
      const res = grid.play(p.cells, q, r);
      const f = boardFeatures(res.grid);
      const gain = res.lines.length
        ? res.clearedCells.size * res.lines.length * (1 + 0.5 * streak)
        : 0;
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
        crowd,
      });
    }
  });
  return moves.sort((a, b) => b.value - a.value);
}

/** Dopo le due mosse: probabilità che un pezzo estratto a caso non entri (death) e spazio per
 * rombo e ferro di cavallo (bigRoom, 0..1). death non è la probabilità di fine partita (il vassoio
 * ha tre pezzi), ma misura quanto il tabellone è diventato stretto. Provata anche la stima
 * "esatta" della fine partita (pezzo noto rimasto che non entra × probabilità al quadrato):
 * rendeva meno. */
function boardRisk(next) {
  const { death, pieces } = pieceAvailability(next.after, 6);
  let weight = 0,
    room = 0;
  for (const p of pieces) {
    if (!BIG_SHAPES.has(p.name)) continue;
    weight += p.p;
    room += (p.p * Math.min(6, p.placements)) / 6;
  }
  return { death, bigRoom: room / weight };
}

/** Totale di una candidata: punti della prima mossa + premio per lo svuotamento + voto della migliore
 * seconda mossa con gli altri due pezzi + premio per le linee chiudibili − rischi. */
function withLookahead(m, tray, deep = false) {
  if (deep) return withDeepLookahead(m, tray);
  const rest = tray.map((p, i) => (i === m.idx ? null : p));
  const next = rankedMoves(m.after, rest, m.nextStreak)[0] || null;
  const { death, bigRoom } = next ? boardRisk(next) : { death: 1, bigRoom: 0 };
  const room = next ? remainingRoom(m, next, tray) : 0;
  const roomPenalty = NORMAL_ROOM * (1 - room / 6);
  const bigPenalty = NORMAL_BIG * (1 - bigRoom);
  const clearBonus = NORMAL_CLEAR * m.lines * m.crowd;
  const closable = next ? closableLines(next.after) : 0;
  const closableBonus = next
    ? NORMAL_CLOSABLE * closable * crowding(next.after)
    : 0;
  const total =
    m.gain * W.cell +
    clearBonus +
    (next ? leafValue(next) - roomPenalty : -10000);
  return {
    ...m,
    next,
    death,
    room,
    roomPenalty,
    bigRoom,
    bigPenalty,
    clearBonus,
    closable,
    closableBonus,
    blockRisk: next ? blockRisk(m, next, tray, death) : null,
    learned: next ? learnedRisk(next.after) : null, // rischio imparato del tabellone finale
    total,
  };
}

/** Celle libere del tabellone. */
function freeCells(g) {
  let n = 0;
  for (const v of g.cells.values()) if (!v) n++;
  return n;
}

/** Il pezzo nuovo alla seconda mossa si considera solo fra NORMAL_NEW_FREE e NORMAL_DEEP_FREE. */
function usesNewPiece(grid) {
  const free = freeCells(grid);
  return free < NORMAL_NEW_FREE && free >= NORMAL_DEEP_FREE;
}

/** Coda di una candidata dopo la seconda mossa `next`, come in withLookahead: voto della seconda
 * mossa + linee chiudibili − rischi; `remaining` sono i pezzi noti rimasti nel vassoio. */
function tailValue(next, remaining) {
  if (!next) return -10000;
  let room = 6;
  for (const p of remaining)
    room = Math.min(room, next.after.countPlacements(p.cells, 6));
  return leafValue(next) - NORMAL_ROOM * (1 - room / 6);
}

/** Totale di una candidata con il pezzo nuovo alla seconda mossa (vedi NORMAL_NEW_FREE): media,
 * sui 25 pezzi che possono arrivare, della coda con la migliore seconda mossa fra i tre pezzi.
 * `base` è la candidata già valutata da withLookahead (seconda mossa con i soli pezzi noti). */
function withNewPiece(base, tray) {
  const rest = tray.filter((p, i) => p && i !== base.idx);
  const known = base.next;
  const knownTail = known
    ? tailValue(
        known,
        rest.filter((p, i) => i !== rest.indexOf(known.piece)),
      )
    : -10000;
  let expected = 0;
  for (const p of PIECES) {
    const nw = rankedMoves(base.after, [p], base.nextStreak)[0] || null;
    const tail =
      nw && (!known || nw.value > known.value)
        ? tailValue(nw, rest)
        : knownTail;
    expected += (p.weight / PIECE_WEIGHT) * tail;
  }
  return {
    ...base,
    newPiece: true,
    knownTotal: base.total, // totale con i soli pezzi noti, per guida e confronti
    total: base.gain * W.cell + base.clearBonus + expected,
  };
}

/** Zona di pericolo: sequenze con tutti e tre i pezzi noti. Per la mossa m si provano le migliori
 * seconde mosse (per voto) e, per ognuna, le migliori terze mosse; vince la sequenza con il totale
 * più alto. Il tabellone finale si giudica come nello sguardo a due passi (voto dell'ultima mossa,
 * linee chiudibili, rischio del pezzo nuovo, spazio per rombo e ferro di cavallo). Le mosse dopo la
 * prima contano i loro punti e le loro linee (+60 ciascuna). */
function withDeepLookahead(m, tray) {
  const rest = tray.map((p, i) => (i === m.idx ? null : p));
  const clearBonus = NORMAL_CLEAR * m.lines * m.crowd;
  let best = null;
  for (const second of rankedMoves(m.after, rest, m.nextStreak).slice(
    0,
    NORMAL_DEEP_SECOND,
  )) {
    const left = rest.map((p, i) => (i === second.idx ? null : p));
    const pending = left.some(Boolean);
    const thirds = pending
      ? rankedMoves(second.after, left, second.nextStreak).slice(
          0,
          NORMAL_DEEP_THIRD,
        )
      : [];
    for (const third of thirds.length ? thirds : [null]) {
      const last = third || second;
      const middle = third ? second.gain * W.cell + second.lines * W.line : 0;
      const { death, bigRoom } = boardRisk(last);
      const closable = closableLines(last.after);
      const closableBonus = NORMAL_CLOSABLE * closable * crowding(last.after);
      const roomPenalty = !third && pending ? NORMAL_DEEP_BLOCK : 0;
      const bigPenalty = NORMAL_BIG * (1 - bigRoom);
      const total =
        m.gain * W.cell + clearBonus + middle + leafValue(last) - roomPenalty;
      if (!best || total > best.total) {
        best = {
          next: second,
          third,
          middle,
          death,
          bigRoom,
          bigPenalty,
          closable,
          closableBonus,
          roomPenalty,
          room: third || !pending ? 6 : 0,
          total,
        };
      }
    }
  }
  if (!best) return { ...withLookahead(m, tray), deep: true, third: null };
  // rischio per il giudizio: zero se i tre pezzi noti trovano posto, altrimenti come a due passi
  return {
    ...m,
    ...best,
    deep: true,
    clearBonus,
    blockRisk: best.third || best.room === 6 ? 0 : best.death * best.death,
    learned: learnedRisk((best.third || best.next).after), // rischio imparato del tabellone finale
  };
}

/** Posizioni (fino a 6) del pezzo noto che resta nel vassoio dopo la mossa e la seconda mossa. */
function remainingRoom(m, next, tray) {
  const remaining = tray.find((p, i) => p && i !== m.idx && i !== next.idx);
  if (!remaining) return 6;
  return next.after.countPlacements(remaining.cells, 6);
}

/** Per il giudizio: probabilità che dopo le due mosse non entri NESSUN pezzo del vassoio
 * (il pezzo noto rimasto non entra e nemmeno i due estratti). È l'analogo del rischio del
 * pezzo ignoto in Esperto: blocco subito dopo i pezzi noti. */
function blockRisk(m, next, tray, death) {
  const remaining = tray.find((p, i) => p && i !== m.idx && i !== next.idx);
  if (remaining && next.after.fits(remaining.cells)) return 0;
  return death * death;
}

/** Zona di pericolo: candidate a pari merito con la migliore. Succede spesso: tre mosse con i tre
 * pezzi noti in ordine diverso portano allo stesso tabellone finale, e lo sguardo a tre pezzi dà a
 * tutte lo stesso totale. Ma fra la prima e la seconda mossa arriva un pezzo nuovo, e il tabellone
 * dopo la prima mossa conta (celle isolate, spazio per i pezzi). Le pari merito si ordinano quindi
 * con il pezzo nuovo alla seconda mossa (media sui 25 pezzi, come in withNewPiece): chi rende meno
 * perde dal totale la differenza, senza scendere sotto la prima candidata non a pari merito.
 * Misura con lo sdoppiamento (300 partite, semi 40000): rapporto 0,95 (0,68–1,31), partite perse
 * da 29 a 19, stesso tempo di calcolo; nei futuri della posizione seme 7000 pezzo 2891 sceglie la
 * mossa che si blocca meno. */
const DEEP_TIE = 1e-6;
function breakDeepTies(byTotal, tray) {
  const top = byTotal[0].total;
  const tol = DEEP_TIE * Math.max(1, Math.abs(top));
  const n = byTotal.findIndex((m) => top - m.total > tol);
  const tied = n < 0 ? byTotal.length : n;
  if (tied < 2) return byTotal;
  const keyed = byTotal
    .slice(0, tied)
    .map((m) => ({
      m,
      key: withNewPiece(withLookahead(m, tray, false), tray).total,
    }))
    .sort((a, b) => b.key - a.key);
  const floor = n < 0 ? -Infinity : byTotal[n].total + tol;
  const redone = keyed.map(({ m, key }) => ({
    ...m,
    tieTotal: m.total, // totale dello sguardo a tre pezzi, uguale per tutte le pari merito
    tieBreak: key,
    total: Math.max(floor, top - (keyed[0].key - key)),
  }));
  return [...redone, ...byTotal.slice(tied)];
}

/** Le LOOKAHEAD mosse migliori per voto, approfondite; byTotal[0] è il suggerimento. */
function normalCandidates(grid, tray, streak) {
  const moves = rankedMoves(grid, tray, streak);
  const deep = isDeep(grid);
  // le LOOKAHEAD migliori per voto, più le PER_PIECE migliori di ogni pezzo diverso del vassoio:
  // a voti quasi uguali un pezzo intero poteva restare fuori (tabellone vuoto: le mosse della
  // bandiera 80,8, quelle dei ferri 79,6, e nessun ferro fra le 20 approfondite)
  const chosen = moves.slice(0, LOOKAHEAD);
  const seen = new Set(chosen);
  for (const id of new Set(moves.map((m) => m.piece.id))) {
    let k = 0;
    for (const m of moves) {
      if (m.piece.id !== id) continue;
      if (!seen.has(m)) {
        chosen.push(m);
        seen.add(m);
      }
      if (++k >= PER_PIECE) break;
    }
  }
  let byValue = chosen.map((m) => withLookahead(m, tray, deep));
  let byTotal = [...byValue].sort((a, b) => b.total - a.total);
  if (deep && byTotal.length > 1) {
    byTotal = breakDeepTies(byTotal, tray);
    const redone = new Map(
      byTotal
        .filter((m) => m.tieBreak !== undefined)
        .map((m) => [m.idx + ":" + m.q + ":" + m.r, m]),
    );
    byValue = byValue.map(
      (m) => redone.get(m.idx + ":" + m.q + ":" + m.r) || m,
    );
  }
  const newPiece = !deep && usesNewPiece(grid);
  if (newPiece) {
    // le migliori NORMAL_NEW_TOP si rivalutano col pezzo nuovo e restano davanti alle altre
    const top = byTotal.slice(0, NORMAL_NEW_TOP);
    const redone = new Map(top.map((m) => [m, withNewPiece(m, tray)]));
    byValue = byValue.map((m) => redone.get(m) || m);
    byTotal = [
      ...[...redone.values()].sort((a, b) => b.total - a.total),
      ...byTotal.slice(NORMAL_NEW_TOP),
    ];
  }
  return {
    totalMoves: moves.length,
    deep,
    newPiece,
    byValue,
    byTotal,
  };
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
  beam: QUEUE_BEAM,
  first: QUEUE_FIRST,
  gain: QUEUE_GAIN,
  unknownDeath: UNKNOWN_DEATH,
  unknownRoom: UNKNOWN_ROOM,
  blocked: BLOCKED,
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
  return (
    f.deadHoles * W.dead +
    f.holes * W.hole +
    f.fitCount * W.fit +
    f.near * W.near +
    f.empty * W.empty
  );
}

/** Rischio del pezzo ignoto che arriverà dopo i tre noti (con il dettaglio per forma). */
function unknownPieceDetail(g) {
  const { death, room, pieces } = pieceAvailability(g, 6);
  const perShape = SHAPE_P.map(({ shape, p }) => {
    const orientations = pieces.filter((piece) => piece.name === shape.name);
    return {
      name: shape.name,
      color: shape.color,
      p,
      n:
        orientations.reduce(
          (sum, piece) => sum + Math.min(6, piece.placements),
          0,
        ) / orientations.length,
      death: orientations.reduce(
        (sum, piece) => sum + (piece.placements ? 0 : piece.p),
        0,
      ),
    };
  });
  return {
    death,
    room,
    perShape,
    value: -UNKNOWN_DEATH * death + UNKNOWN_ROOM * room,
  };
}

/** Un passo della sequenza: gioca il pezzo e aggiorna punti, combo e punteggio. */
function expand(node, piece, q, r) {
  const res = node.grid.play(piece.cells, q, r);
  const gain = res.lines.length
    ? res.clearedCells.size * res.lines.length * (1 + 0.5 * node.streak)
    : 0;
  const acc = node.acc + gain * QUEUE_GAIN + res.lines.length * W.line;
  return {
    grid: res.grid,
    streak: res.lines.length ? node.streak + 1 : 0,
    acc,
    path: [
      ...node.path,
      { piece, q, r, gain, lines: res.lines.length, before: node.grid },
    ],
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
  if (
    !pieces.length ||
    !grid.canPlace(pieces[0].cells, firstMove.q, firstMove.r)
  )
    return null;
  let beam = [
    expand(
      { grid, streak, acc: 0, path: [] },
      pieces[0],
      firstMove.q,
      firstMove.r,
    ),
  ];
  const levels = [];
  for (let level = 1; level < pieces.length; level++) {
    const next = [];
    for (const node of beam) {
      for (const [q, r] of node.grid.placementsFor(pieces[level].cells))
        next.push(expand(node, pieces[level], q, r));
    }
    if (!next.length) break; // questo pezzo non entra più: la sequenza resta bloccata
    next.sort((a, b) => b.score - a.score);
    const keep = level === pieces.length - 1 ? QUEUE_BEAM * 2 : QUEUE_BEAM;
    levels.push({
      piece: pieces[level],
      generated: next.length,
      kept: Math.min(keep, next.length),
    });
    beam = next.slice(0, keep);
  }
  const leaves = beam
    .map((n) => {
      const unknown = unknownPieceDetail(n.grid);
      const blocked = n.path.length < pieces.length;
      return {
        ...n,
        board: boardValue(n.grid),
        unknown,
        blocked,
        v: n.score + unknown.value - (blocked ? BLOCKED : 0),
      };
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
  const firsts = grid
    .placementsFor(first.cells)
    .map(([q, r]) => ({ q, r, score: expand(root, first, q, r).score }))
    .sort((a, b) => b.score - a.score);
  if (!firsts.length) return null;
  const moves = firsts
    .slice(0, QUEUE_FIRST)
    .map(({ q, r }, order) => {
      const search = queueSearch(grid, tray, streak, { q, r });
      return {
        q,
        r,
        order,
        piece: first,
        leaf: search.leaves[0],
        levels: search.levels,
      };
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
    levels: [
      { piece: best.piece, generated: res.totalMoves, kept: res.moves.length },
      ...best.levels,
    ],
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
  return best
    ? { idx: best.idx, q: best.q, r: best.r, cells: best.cells }
    : null;
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
    return {
      totalMoves: result.totalMoves,
      evaluated: result.byTotal.length,
      moves: result.byTotal.slice(0, NORMAL_SHOWN),
    };
  }
  const res = cachedQueueCandidates(grid, tray, streak);
  const moves = (res?.moves || []).map(({ q, r, piece, leaf }) => ({
    idx: 0,
    q,
    r,
    piece,
    cells: piece.cells,
    lines: leaf.path[0].lines,
    total: leaf.v,
    sequence: leaf,
  }));
  return {
    totalMoves:
      res?.totalMoves ??
      (tray[0] ? grid.placementsFor(tray[0].cells).length : 0),
    moves,
  };
}

/** Confronto retrospettivo: usa esclusivamente i pezzi e il tabellone PRIMA
 * della mossa, senza conoscere il nuovo pezzo estratto. La ricerca aggiuntiva
 * riguarda solo la mossa giocata e non modifica mai il suggerimento.
 */
export function analyzePlayedMove({ grid, tray, streak, expert, idx, q, r }) {
  // in modalità normale un pezzo identico a uno precedente nel vassoio vale come quello:
  // le candidate usano il primo dei pezzi identici
  if (!expert && tray[idx])
    idx = tray.findIndex((p) => p && p.id === tray[idx].id);
  const analysis = analyzeMoves(grid, tray, streak, { queue: expert });
  const selectedPiece = tray[idx];
  if (
    selectedPiece &&
    (!expert || idx === 0) &&
    grid.canPlace(selectedPiece.cells, q, r)
  ) {
    const before = boardFeatures(grid);
    const after = boardFeatures(grid.play(selectedPiece.cells, q, r).grid);
    const contacts = selectedPiece.cells.map(
      ([dq, dr]) =>
        grid
          .getNeighbors(q + dq, r + dr)
          .filter(([nq, nr]) => grid.get(nq, nr) > 0).length,
    );
    analysis.placementQuality = {
      cellCount: grid.cells.size,
      touchingCells: contacts.filter((n) => n > 0).length,
      sharedEdges: contacts.reduce((sum, n) => sum + n, 0),
      before,
      after,
    };
    if (selectedPiece.cells.length === 1) {
      const alternatives = rankedMoves(
        grid,
        expert ? [tray[0]] : tray,
        streak,
      ).filter((m) => m.idx !== idx || m.q !== q || m.r !== r);
      const beforeRisk = pieceAvailability(grid, 1).death;
      let viable = 0;
      let canPreservePoint = false;
      for (const m of alternatives) {
        // Un altro punto senza chiusura consuma la stessa risorsa e non è
        // un motivo per criticare una scelta obbligata del tipo di pezzo.
        if (m.cells.length === 1 && m.lines === 0) continue;
        const known = expert
          ? tray.slice(1, 2)
          : tray.filter((_, i) => i !== m.idx);
        if (!known.some((p) => p && m.after.fits(p.cells))) continue;
        if (
          m.features.deadHoles > before.deadHoles ||
          m.features.holes > before.holes
        )
          continue;
        if (
          pieceAvailability(m.after, 1).death > Math.min(0.5, beforeRisk + 0.1)
        )
          continue;
        viable++;
        if (m.cells.length > 1) canPreservePoint = true;
      }
      analysis.singleCellUse = {
        alternativesChecked: alternatives.length,
        viableAlternatives: viable,
        canPreservePoint,
        forcedPiece: !alternatives.some((m) => m.cells.length > 1),
        netImprovement:
          after.empty > before.empty &&
          after.fitCount >= before.fitCount &&
          after.deadHoles <= before.deadHoles &&
          after.holes <= before.holes,
      };
    }
  }
  const found = analysis.moves.find(
    (m) => m.idx === idx && m.q === q && m.r === r,
  );
  if (found)
    return {
      ...analysis,
      moves: analysis.moves.map((m) => ({ ...m, played: m === found })),
    };
  const piece = tray[idx];
  if (!piece || (expert && idx !== 0) || !grid.canPlace(piece.cells, q, r))
    return analysis;
  let move;
  if (expert) {
    const sequence = queueSearch(grid, tray, streak, { q, r }).leaves[0];
    move = {
      idx,
      q,
      r,
      piece,
      cells: piece.cells,
      lines: sequence.path[0].lines,
      total: sequence.v,
      sequence,
    };
  } else {
    const candidate = rankedMoves(grid, tray, streak).find(
      (m) => m.idx === idx && m.q === q && m.r === r,
    );
    move = withLookahead(candidate, tray, isDeep(grid));
    // stesso metro delle candidate mostrate: col pezzo nuovo alla seconda mossa, se vale qui
    if (!isDeep(grid) && usesNewPiece(grid)) move = withNewPiece(move, tray);
  }
  return {
    ...analysis,
    moves: [...analysis.moves, { ...move, played: true, added: true }],
  };
}

/** Copia dell'analisi senza i tabelloni intermedi: solo dati semplici, adatti a essere
 * spediti da un worker. Contiene tutto ciò che usano giudizio, interfaccia e log. */
export function slimAnalysis(analysis) {
  if (!analysis) return analysis;
  const placement = (m) =>
    m && {
      idx: m.idx,
      q: m.q,
      r: m.r,
      piece: m.piece,
      cells: m.cells,
      value: m.value,
      gain: m.gain,
      lines: m.lines,
      features: m.features,
    };
  return {
    totalMoves: analysis.totalMoves,
    ...(analysis.evaluated !== undefined
      ? { evaluated: analysis.evaluated }
      : {}),
    ...(analysis.placementQuality
      ? { placementQuality: analysis.placementQuality }
      : {}),
    ...(analysis.singleCellUse
      ? { singleCellUse: analysis.singleCellUse }
      : {}),
    moves: analysis.moves.map((m) => ({
      ...placement(m),
      total: m.total,
      ...(m.death !== undefined ? { death: m.death } : {}),
      ...(m.blockRisk !== undefined ? { blockRisk: m.blockRisk } : {}),
      ...(m.roomPenalty !== undefined
        ? { room: m.room, roomPenalty: m.roomPenalty }
        : {}),
      ...(m.bigPenalty !== undefined
        ? { bigRoom: m.bigRoom, bigPenalty: m.bigPenalty }
        : {}),
      ...(m.clearBonus !== undefined
        ? {
            crowd: m.crowd,
            clearBonus: m.clearBonus,
            closable: m.closable,
            closableBonus: m.closableBonus,
          }
        : {}),
      ...(m.played !== undefined ? { played: m.played } : {}),
      ...(m.added ? { added: true } : {}),
      ...(m.next !== undefined ? { next: placement(m.next) } : {}),
      ...(m.deep
        ? { deep: true, middle: m.middle, third: placement(m.third) }
        : {}),
      ...(m.sequence
        ? {
            sequence: {
              path: m.sequence.path.map(({ piece, q, r, gain, lines }) => ({
                piece,
                q,
                r,
                gain,
                lines,
              })),
              acc: m.sequence.acc,
              score: m.sequence.score,
              board: m.sequence.board,
              unknown: m.sequence.unknown,
              blocked: m.sequence.blocked,
              v: m.sequence.v,
            },
          }
        : {}),
    })),
  };
}
