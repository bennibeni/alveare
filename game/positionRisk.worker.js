import HexGrid from "./HexGrid.js";
import { estimatePositionRisk } from "./positionRisk.js";

self.onmessage = ({ data }) => {
  try {
    const { position, candidates } = data;
    const grid = new HexGrid(position.radius, new Map(position.cells));
    self.postMessage({
      result: estimatePositionRisk({ ...position, grid }, candidates),
    });
  } catch (error) {
    self.postMessage({ error: error.message });
  }
};
