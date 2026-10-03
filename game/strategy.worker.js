import HexGrid from "./HexGrid.js";
import { judgeMove } from "./moveJudgment.js";
import { analyzeMoves, analyzePlayedMove, slimAnalysis } from "./strategy.js";

// Analisi e giudizi fuori dal thread dell'interfaccia: il gioco resta fluido mentre si calcola.
self.onmessage = ({ data }) => {
  const { id, type, position } = data;
  try {
    const grid = new HexGrid(position.radius, new Map(position.cells));
    const pos = { ...position, grid };
    let result;
    if (type === "played") {
      const analysis = analyzePlayedMove(pos);
      result = { analysis: slimAnalysis(analysis), judgment: judgeMove(analysis, pos.tray.filter(Boolean).length) };
    } else {
      result = { analysis: slimAnalysis(analyzeMoves(grid, pos.tray, pos.streak, { queue: pos.expert })) };
    }
    self.postMessage({ id, result });
  } catch (error) {
    self.postMessage({ id, error: error.message });
  }
};
