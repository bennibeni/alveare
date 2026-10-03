import { describe, expect, it } from "vitest";
import HexGrid from "../../game/HexGrid.js";
import { pieceAvailability } from "../../game/pieceAvailability.js";
import { PIECES } from "../../game/pieces.js";

describe("disponibilità dei pezzi", () => {
  it("pesa separatamente orientamenti disponibili e bloccati della stessa forma", () => {
    const grid = new HexGrid(4);
    for (const key of grid.cells.keys()) grid.cells.set(key, ["0,0", "1,0", "2,0", "3,0"].includes(key) ? 0 : 1);
    const availability = pieceAvailability(grid);
    const bars = availability.pieces.filter((p) => p.name === "barra 4");
    expect(bars.filter((p) => p.placements > 0)).toHaveLength(1);
    expect(bars.filter((p) => p.placements === 0).reduce((sum, p) => sum + p.p, 0)).toBeCloseTo(2 / 3 / 4.6);
    expect(availability.death).toBeCloseTo(1 - (0.6 + 1 / 3) / 4.6);
    expect(pieceAvailability(new HexGrid(4)).death).toBe(0);
    const capped = pieceAvailability(grid, 6);
    expect(capped.death).toBeCloseTo(availability.death);
    expect(capped.room).toBeCloseTo(availability.room);
  });

  it("la probabilità che il pezzo estratto non entri è esatta, anche contando una sola posizione", () => {
    let grid = new HexGrid(4);
    // riempie tutto tranne una fila di tre celle: entrano solo punto e i pezzi da ≤ 3 celle in fila
    for (const k of grid.cells.keys()) if (!["0,0", "1,0", "2,0"].includes(k)) grid = grid.place([[0, 0]], ...k.split(",").map(Number), 1);
    const exact = PIECES.reduce((sum, p) => sum + (grid.fits(p.cells) ? 0 : p.weight), 0) / PIECES.reduce((sum, p) => sum + p.weight, 0);
    for (const cap of [1, 6, Infinity]) expect(pieceAvailability(grid, cap).death).toBeCloseTo(exact);
    const point = pieceAvailability(grid).pieces.find((p) => p.name === "punto");
    expect(point.placements).toBe(3);
    expect(pieceAvailability(grid, 1).pieces.find((p) => p.name === "punto").placements).toBe(1);
  });
});
