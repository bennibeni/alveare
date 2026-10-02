import { JUDGMENT_LIMITS } from "./moveJudgment.js";
import { WEIGHTS, NORMAL_LOOKAHEAD, QUEUE_PARAMS } from "./strategy.js";

const board = (grid) => ({ radius: grid.radius, cells: [...grid.cells] });
const placement = (move) => ({
  idx: move.idx, q: move.q, r: move.r, piece: move.piece,
  gain: move.gain, lines: move.lines, value: move.value, features: move.features,
});

/** Generato solo su richiesta: nessuna nuova ricerca e nessun dato di sessione. */
export function buildMoveReport({ snapshot, analysis, judgment, feedbackText, positionIndicators = null }) {
  const { grid, tray, streak, expert, idx, q, r } = snapshot;
  const result = grid.play(tray[idx].cells, q, r, tray[idx].color);
  const legalMoves = tray.flatMap((piece, slot) => {
    if (!piece || (expert && slot !== 0)) return [];
    return grid.placementsFor(piece.cells).map(([q, r]) => ({ idx: slot, q, r }));
  });
  const log = {
    format: "alveare-move-report", version: 1,
    notes: "Coordinate assiali q,r; idx parte da 0. Celle: [chiave q,r, colore], 0 = vuota. Posizione precedente all’estrazione del nuovo pezzo. legalMoves contiene tutte le mosse legali; evaluatedMoves solo quelle approfondite, senza inventare voti per le altre.",
    mode: expert ? "expert" : "normal",
    before: { ...board(grid), tray, streak },
    played: { idx, q, r },
    after: { ...board(result.grid), clearedLines: result.lines, clearedCells: [...result.clearedCells] },
    judgment,
    positionIndicators,
    parameters: { judgment: JUDGMENT_LIMITS, weights: WEIGHTS, normalLookahead: NORMAL_LOOKAHEAD, queue: QUEUE_PARAMS },
    totalMoves: analysis.totalMoves,
    legalMoves,
    evaluatedMoves: analysis.moves.map((move) => ({
      ...placement(move), total: move.total, played: !!move.played, added: !!move.added,
      next: move.next ? placement(move.next) : null,
      sequence: move.sequence ? {
        path: move.sequence.path.map(placement), acc: move.sequence.acc,
        score: move.sequence.score, board: move.sequence.board,
        unknown: move.sequence.unknown, value: move.sequence.v,
      } : null,
    })),
  };
  return `${feedbackText.trim()}\n\n--- Log diagnostico Alveare ---\n${JSON.stringify(log, null, 2)}`;
}
