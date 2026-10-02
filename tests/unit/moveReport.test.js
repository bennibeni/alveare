import { describe, expect, it } from "vitest";
import HexGrid from "../../game/HexGrid.js";
import { PIECES } from "../../game/pieces.js";
import { analyzePlayedMove } from "../../game/strategy.js";
import { judgeMove } from "../../game/moveJudgment.js";
import { buildMoveReport } from "../../game/moveReport.js";

describe("log copiabile del giudizio", () => {
  it.each([false, true])("ricostruisce posizione, mosse e giudizio (esperto: %s)", (expert) => {
    const grid = new HexGrid(1).place([[0, 0]], -1, 0, 7);
    const snapshot = { grid, tray: [PIECES[0], PIECES[0], PIECES[0]], streak: 2, expert, idx: 0, q: 0, r: 0 };
    const analysis = analyzePlayedMove(snapshot);
    const judgment = judgeMove(analysis);
    const feedbackText = `${judgment.label}\nDettagli anche se chiusi\n${judgment.reason}`;
    const report = buildMoveReport({ snapshot, analysis, judgment, feedbackText });
    expect(report.startsWith(feedbackText)).toBe(true);
    const log = JSON.parse(report.split("--- Log diagnostico Alveare ---\n")[1]);
    expect(log.before.cells).toEqual([...grid.cells]);
    expect(log.before.tray).toEqual(snapshot.tray);
    expect(log.judgment).toEqual(judgment);
    expect(log.legalMoves).toHaveLength(analysis.totalMoves);
    expect(log.legalMoves).toContainEqual(log.played);
    expect(log.legalMoves.every((m) => grid.canPlace(snapshot.tray[m.idx].cells, m.q, m.r))).toBe(true);
    if (expert) expect(log.legalMoves.every((m) => m.idx === 0)).toBe(true);
    const replayGrid = new HexGrid(log.before.radius, new Map(log.before.cells));
    const replay = analyzePlayedMove({ grid: replayGrid, tray: log.before.tray,
      streak: log.before.streak, expert: log.mode === "expert", ...log.played });
    expect(judgeMove(replay)).toEqual(judgment);
    expect(log.evaluatedMoves.map((m) => m.total)).toEqual(replay.moves.map((m) => m.total));
    expect(log.after.cells).toEqual([...grid.play(PIECES[0].cells, 0, 0, PIECES[0].color).grid.cells]);
    expect(log.parameters.judgment).toHaveProperty("extremeRisk");
    if (expert) expect(log.evaluatedMoves[0].sequence.unknown).toHaveProperty("death");
    else expect(log.evaluatedMoves[0]).toHaveProperty("features");
  });
});
