/** Esporta solo il ramo attuale della partita; lo stato ripristinato da Annulla
 * contiene già il registro precedente. Le analisi mancanti si calcolano su richiesta. */
export async function buildGameReport(game, analyze) {
  const moves = [];
  for (const [index, entry] of game.moveLog.entries()) {
    const { snapshot, automatic, scoreBefore, scoreAfter } = entry;
    const { analysis, judgment } = await analyze("played", snapshot);
    const { grid, tray, streak, expert, idx, q, r } = snapshot;
    const result = grid.play(tray[idx].cells, q, r, tray[idx].color);
    moves.push({
      number: index + 1,
      mode: expert ? "expert" : "normal",
      automatic,
      before: {
        radius: grid.radius,
        cells: [...grid.cells],
        tray,
        streak,
        score: scoreBefore,
      },
      played: { idx, slot: idx + 1, piece: tray[idx], q, r },
      evaluation: judgment,
      suggestions: analysis.moves.filter((move) => !move.added),
      analyzedMoves: analysis.moves,
      totalLegalMoves: analysis.totalMoves,
      after: {
        cells: [...result.grid.cells],
        clearedLines: result.lines,
        clearedCells: [...result.clearedCells],
        score: scoreAfter,
      },
    });
  }
  return {
    format: "alveare-game-report",
    version: 1,
    notes:
      "Coordinate assiali q,r. Celle: [chiave q,r, colore], 0 = vuota. Il vassoio è ordinato: idx parte da 0, slot da 1. Valutazioni e suggerimenti usano solo la posizione e i pezzi noti prima della mossa. Le mosse annullate sono escluse. Il log fotografa la partita al momento del clic su Scarica.",
    score: game.score,
    totalMoves: moves.length,
    linesTotal: game.linesTotal,
    moves,
  };
}
