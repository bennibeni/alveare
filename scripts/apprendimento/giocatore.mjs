/**
 * Giocatore veloce dell'autoapprendimento: guarda una sola mossa e sceglie quella con il voto più alto.
 * Voto = 60 × linee svuotate + punti − C × rischio imparato del tabellone dopo la mossa (modello come
 * LEARNED_MODEL di game/learnedRisk.js, oppure letto da un file JSON di fit.py).
 */
import HexGrid from "../../game/HexGrid.js";
import { PIECES } from "../../game/pieces.js";
import { features } from "../../game/learnedRisk.js";

const BY_ID = new Map(PIECES.map((p) => [p.id, p]));

export function stateOf(pos) {
  const cells = new Map(new HexGrid(4).cells);
  for (const k of pos.cells) cells.set(k, 1);
  return {
    grid: new HexGrid(4, cells),
    tray: pos.tray.map((id) => BY_ID.get(id)),
    streak: pos.streak ?? 0,
  };
}

export function riskOf(model, f) {
  let z = model.b;
  for (let j = 0; j < model.use.length; j++) z += model.c[j] * f[model.use[j]];
  return 1 / (1 + Math.exp(-z));
}

export function greedyMove(g, tray, streak, model, C = 1600) {
  let best = null;
  let bestV = -Infinity;
  tray.forEach((p, idx) => {
    if (tray.slice(0, idx).some((o) => o.id === p.id)) return;
    for (const [q, r] of g.placementsFor(p.cells)) {
      const res = g.play(p.cells, q, r);
      const gain = res.lines.length
        ? res.clearedCells.size * res.lines.length * (1 + 0.5 * streak)
        : 0;
      const v =
        60 * res.lines.length + gain - C * riskOf(model, features(res.grid));
      if (v > bestV) {
        bestV = v;
        best = { idx, q, r, res };
      }
    }
  });
  return best;
}
