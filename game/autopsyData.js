/**
 * Dati dell'autopsia condivisi da pannello, finestra «errore più costoso» e log scaricato:
 * rischio di ogni mossa possibile di una posizione giocata (in cache) e righe dell'elenco.
 */
import { cellNumbers, key } from "./HexGrid.js";
import { autopsyInput, legalMoves } from "./autopsy.js";
import { requestAutopsy, requestMoveRisks } from "./autopsyClient.js";
import { requestAnalysis } from "./strategyClient.js";
import { NOISE, safestRow } from "./autopsyText.js";

const NUMBERS = cellNumbers(4);
export const MAX_MOVES = 40; // oltre, si valutano solo le mosse approfondite dal gioco e la giocata

/** Numeri delle celle occupate da un pezzo con origine (q, r), in ordine. */
export const numbersOf = (piece, q, r) =>
  piece.cells
    .map(([dq, dr]) => NUMBERS.get(key(q + dq, r + dr)))
    .sort((x, y) => x - y);

/**
 * Analisi e giudizio del gioco, rischio di ogni mossa possibile ed esito con i pezzi arrivati
 * (draws, con index = indice della mossa nella partita). In cache per posizione.
 */
const cache = new WeakMap();
export function loadMoveData(snapshot, draws = null, index = 0) {
  let p = cache.get(snapshot);
  if (p) return p;
  p = (async () => {
    const input = {
      cells: [...snapshot.grid.cells],
      tray: snapshot.tray.map((x) => x.id),
    };
    const { analysis, judgment } = await requestAnalysis(
      "played",
      snapshot,
    ).catch(() => ({}));
    const all = legalMoves(input);
    const same = (m, x) =>
      input.tray[m.idx] === (x.piece?.id ?? input.tray[x.idx]) &&
      m.q === x.q &&
      m.r === x.r;
    let moves = all;
    if (all.length > MAX_MOVES && analysis?.moves?.length) {
      moves = all.filter(
        (m) => same(m, snapshot) || analysis.moves.some((a) => same(m, a)),
      );
    }
    const risks = await requestMoveRisks({
      ...input,
      moves,
      ...(draws ? { draws, d: index } : {}),
    });
    return { analysis, judgment, risks, total: all.length };
  })();
  p.catch(() => cache.delete(snapshot));
  cache.set(snapshot, p);
  return p;
}

/**
 * Righe dell'elenco: una per mossa, dalla più sicura alla più rischiosa, con il numero n usato
 * anche nelle schede; `tie` per le mosse a pari merito con la più sicura (entro NOISE).
 * Restituisce { rows, sorted, best, played }.
 */
export function rowsOf(snapshot, { analysis, risks }) {
  const tray = snapshot.tray;
  const sameAs = (r, m) =>
    tray[r.idx].id === m.piece.id && r.q === m.q && r.r === m.r;
  const playedPiece = tray[snapshot.idx];
  const rows = risks.map((r) => {
    const piece = tray[r.idx];
    const played =
      piece.id === playedPiece.id && r.q === snapshot.q && r.r === snapshot.r;
    const slot = played ? snapshot.idx : r.idx;
    const a = analysis?.moves?.find((m) => sameAs(r, m));
    return {
      ...r,
      slot,
      piece,
      name: piece.name,
      cells: numbersOf(piece, r.q, r.r),
      lost: r.lost / r.F,
      // con due pezzi uguali la mossa può usare l'altro slot: gli "altri" sono gli slot restanti
      others: r.others.map((o) => {
        const s = o.slot === slot ? r.idx : o.slot;
        return { ...o, slot: s, name: tray[s].name };
      }),
      played,
      suggested: !!(analysis?.moves?.[0] && sameAs(r, analysis.moves[0])),
      estimate: a ? (a.next ? a.blockRisk : "blocked") : undefined,
    };
  });
  const sorted = [...rows].sort(
    (a, b) => a.lost - b.lost || b.suggested - a.suggested || b.free - a.free,
  );
  sorted.forEach((r, i) => (r.n = i + 1));
  const best = safestRow(rows);
  for (const r of rows) r.tie = r !== best && r.lost - best.lost <= NOISE;
  return { rows, sorted, best, played: rows.find((r) => r.played) };
}

/** Posizioni giocate della discesa finale: [{ j, index, number, snapshot }]. */
export function descentMoves(autopsy, moveLog) {
  return autopsy.steps
    .map((step, j) => ({ step, j }))
    .filter(({ step }) => step.move)
    .map(({ step, j }) => ({
      j,
      index: autopsy.start + j,
      number: step.number,
      snapshot: moveLog[autopsy.start + j].snapshot,
    }));
}

/** Rischio della mossa scelta e della più sicura in una posizione della discesa. */
export async function stepRisk(item, draws) {
  const data = await loadMoveData(item.snapshot, draws, item.index);
  const { best, played } = rowsOf(item.snapshot, data);
  return {
    ...item,
    best,
    played,
    cost: played ? played.lost - best.lost : 0,
  };
}

const moveInfo = (r) =>
  r && {
    slot: r.slot + 1,
    piece: r.piece.id,
    name: r.name,
    cells: r.cells,
    free: r.free,
    lines: r.lines,
    risk: r.lost,
  };

/**
 * Autopsia da allegare al log scaricato (modalità normale, partita finita): esito di ogni mossa
 * della discesa finale con i pezzi arrivati, rischio con pezzi qualsiasi della mossa scelta e
 * della più sicura, mossa decisiva, errore più costoso, pezzi arrivati.
 */
export async function buildAutopsyReport(moveLog, finalTray) {
  const autopsy = await requestAutopsy(autopsyInput(moveLog, finalTray));
  if (!autopsy) return null;
  const steps = [];
  for (const item of descentMoves(autopsy, moveLog))
    steps.push(await stepRisk(item, autopsy.draws));
  const costliest = steps.reduce(
    (a, b) => (!a || b.cost > a.cost + 1e-9 ? b : a),
    null,
  );
  const decisive =
    autopsy.decisive >= 0 ? autopsy.steps[autopsy.decisive].number : null;
  return {
    futures: steps[0]?.played?.F ?? null,
    safeFreeCells: 40,
    notes:
      "Discesa finale: dall'ultima volta con almeno 40 celle libere. withArrivedPieces: esito dell'oracolo con i pezzi arrivati davvero (salva = torna a 40 celle libere, continua = si poteva continuare, bloccata = senza scampo). risk: quota di futuri a caso senza scampo anche conoscendo i pezzi in arrivo. added: rischio della mossa scelta meno quello della più sicura.",
    decisiveMove: decisive,
    costliestMove:
      costliest && costliest.cost > NOISE
        ? { move: costliest.number, added: costliest.cost }
        : null,
    steps: autopsy.steps.map((s, j) => {
      const r = steps.find((x) => x.j === j);
      return {
        move: s.move ? s.number : null,
        free: s.free,
        withArrivedPieces: s.result,
        ...(r
          ? {
              played: moveInfo(r.played),
              safest: moveInfo(r.best),
              added: r.cost,
            }
          : {}),
      };
    }),
    savingMovesAtDecisive: autopsy.saving.map((m) => ({
      slot: m.idx + 1,
      q: m.q,
      r: m.r,
      result: m.result,
    })),
    arrivedPieces: autopsy.draws
      .slice(autopsy.start)
      .map((piece, k) => ({ afterMove: autopsy.start + k + 1, piece })),
  };
}
