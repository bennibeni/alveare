import HexGrid from "./HexGrid.js";
import { PIECES, replacePiece, seededRandom } from "./pieces.js";

const byId = new Map(PIECES.map((p) => [p.id, p]));

/** Ricostruisce anche il vassoio finale, usando gli stessi futuri della raccolta. */
export function replayTrap(trap) {
  const cells = new Map(new HexGrid(4).cells);
  for (const k of trap.start.cells) cells.set(k, 1);
  let grid = new HexGrid(4, cells);
  let tray = trap.start.tray.map((id) => byId.get(id));
  let streak = trap.start.streak;
  const rng = seededRandom(trap.bseed);
  const states = [{ grid, tray, streak }];
  const moveLog = [];
  for (const [idx, q, r] of trap.moves) {
    moveLog.push({
      snapshot: { grid, tray, streak, idx, q, r, expert: false },
    });
    const played = grid.play(tray[idx].cells, q, r, tray[idx].color);
    grid = played.grid;
    streak = played.lines.length ? streak + 1 : 0;
    tray = replacePiece(tray, idx, rng);
    states.push({ grid, tray, streak });
  }
  return { states, moveLog, finalGrid: grid, finalTray: tray };
}
