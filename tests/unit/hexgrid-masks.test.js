import { describe, expect, it } from "vitest";
import HexGrid from "../../game/HexGrid.js";
import { PIECES, seededRandom } from "../../game/pieces.js";

// Le maschere di bit (placementsFor, fits, countPlacements) devono dare esattamente
// gli stessi risultati del controllo cella per cella di canPlace, nello stesso ordine.
function slowPlacements(grid, cells) {
  return grid.coords.filter(([q, r]) => grid.canPlace(cells, q, r));
}

describe("HexGrid: maschere di bit", () => {
  it("coincidono con il controllo cella per cella su tabelloni casuali", () => {
    const rng = seededRandom(2026);
    for (let t = 0; t < 300; t++) {
      const cells = new Map(new HexGrid(4).cells);
      const fill = rng();
      for (const k of cells.keys()) if (rng() < fill) cells.set(k, 1);
      let grid = new HexGrid(4, cells);
      for (const p of PIECES) {
        const slow = slowPlacements(grid, p.cells);
        expect(grid.placementsFor(p.cells)).toEqual(slow);
        expect(grid.fits(p.cells)).toBe(slow.length > 0);
        expect(grid.countPlacements(p.cells, 6)).toBe(Math.min(6, slow.length));
        expect(grid.placementMasksFor(p.cells).length).toBe(2 * slow.length);
      }
      // anche sulle griglie derivate da una mossa (occupazione aggiornata a mano)
      const p = PIECES[t % PIECES.length];
      const at = grid.placementsFor(p.cells)[0];
      if (at) {
        grid = grid.play(p.cells, at[0], at[1]).grid;
        for (const p2 of PIECES)
          expect(grid.placementsFor(p2.cells)).toEqual(
            slowPlacements(grid, p2.cells),
          );
      }
    }
  });
});
