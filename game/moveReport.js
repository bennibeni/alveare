import { JUDGMENT_LIMITS } from "./moveJudgment.js";
import {
  WEIGHTS,
  NORMAL_LOOKAHEAD,
  NORMAL_RISK,
  QUEUE_PARAMS,
} from "./strategy.js";

const board = (grid) => ({ radius: grid.radius, cells: [...grid.cells] });
const placement = (move) => ({
  idx: move.idx,
  q: move.q,
  r: move.r,
  piece: move.piece,
  gain: move.gain,
  lines: move.lines,
  value: move.value,
  features: move.features,
});

/** Generato solo su richiesta: nessuna nuova ricerca e nessun dato di sessione. */
export function buildMoveReport({
  snapshot,
  analysis,
  judgment,
  feedbackText,
  positionIndicators = null,
}) {
  const { grid, tray, streak, expert, idx, q, r } = snapshot;
  const result = grid.play(tray[idx].cells, q, r, tray[idx].color);
  const legalMoves = tray.flatMap((piece, slot) => {
    if (!piece || (expert && slot !== 0)) return [];
    // pezzi identici danno le stesse mosse: come nella strategia, le genera solo il primo
    if (!expert && tray.slice(0, slot).some((o) => o && o.id === piece.id))
      return [];
    return grid
      .placementsFor(piece.cells)
      .map(([q, r]) => ({ idx: slot, q, r }));
  });
  const log = {
    format: "alveare-move-report",
    version: 1,
    notes:
      "Coordinate assiali q,r; idx parte da 0. Celle: [chiave q,r, colore], 0 = vuota. Posizione precedente all’estrazione del nuovo pezzo. legalMoves contiene tutte le mosse legali (con pezzi identici nel vassoio, una volta sola: idx è quello del primo); evaluatedMoves solo quelle approfondite, senza inventare voti per le altre.",
    mode: expert ? "expert" : "normal",
    before: { ...board(grid), tray, streak },
    // in modalità normale un pezzo identico vale come il primo dei pezzi uguali
    played: {
      idx: expert ? idx : tray.findIndex((p) => p && p.id === tray[idx].id),
      q,
      r,
    },
    after: {
      ...board(result.grid),
      clearedLines: result.lines,
      clearedCells: [...result.clearedCells],
    },
    judgment,
    positionIndicators,
    parameters: {
      judgment: JUDGMENT_LIMITS,
      weights: WEIGHTS,
      normalLookahead: NORMAL_LOOKAHEAD,
      normalRisk: NORMAL_RISK,
      queue: QUEUE_PARAMS,
    },
    totalMoves: analysis.totalMoves,
    legalMoves,
    evaluatedMoves: analysis.moves.map((move) => ({
      ...placement(move),
      total: move.total,
      death: move.death ?? null,
      played: !!move.played,
      added: !!move.added,
      next: move.next ? placement(move.next) : null,
      sequence: move.sequence
        ? {
            path: move.sequence.path.map(placement),
            acc: move.sequence.acc,
            score: move.sequence.score,
            board: move.sequence.board,
            unknown: move.sequence.unknown,
            blocked: !!move.sequence.blocked,
            value: move.sequence.v,
          }
        : null,
    })),
  };
  return `${feedbackText.trim()}\n\n--- Log diagnostico Alveare ---\n${JSON.stringify(log, null, 2)}`;
}
