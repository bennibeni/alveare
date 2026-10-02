import { describe, expect, it } from "vitest";
import HexGrid, { axialToPixel, DIRECTIONS, key, parseKey, pixelToAxial } from "../../game/HexGrid.js";

const cellsOf = (g) => [...g.cells.keys()].map(parseKey);

describe("HexGrid: forma del tabellone", () => {
  const g = new HexGrid(4);

  it("ha 61 celle, tutte entro raggio 4", () => {
    expect(g.cells.size).toBe(61);
    for (const [q, r] of cellsOf(g)) expect(Math.max(Math.abs(q), Math.abs(r), Math.abs(-q - r))).toBeLessThanOrEqual(4);
  });

  it("ha 27 linee: 9 per direzione, lunghe 5,6,7,8,9,8,7,6,5", () => {
    expect(g.lines).toHaveLength(27);
    for (const axis of ["r", "q", "s"]) {
      expect(g.lines.filter((l) => l.axis === axis).map((l) => l.cells.length)).toEqual([5, 6, 7, 8, 9, 8, 7, 6, 5]);
    }
  });

  it("ogni cella sta esattamente su 3 linee", () => {
    for (const k of g.cells.keys()) expect(g.lines.filter((l) => l.cells.includes(k))).toHaveLength(3);
  });

  it("vicini: 6 al centro, 4 sui lati, 3 negli angoli", () => {
    expect(g.getNeighbors(0, 0)).toHaveLength(6);
    expect(g.getNeighbors(4, -2)).toHaveLength(4);
    expect(g.getNeighbors(4, 0)).toHaveLength(3);
    expect(DIRECTIONS).toHaveLength(6);
  });

  it("conversione pixel ↔ coordinate assiali coerente su tutte le celle (anche fuori centro)", () => {
    for (const [q, r] of cellsOf(g)) {
      const [x, y] = axialToPixel(q, r, 22);
      expect(pixelToAxial(x + 4, y - 5, 22)).toEqual([q, r]);
    }
  });
});

describe("HexGrid: mosse", () => {
  it("canPlace rifiuta celle fuori tabellone o occupate", () => {
    const g = new HexGrid(4).place([[0, 0]], 0, 0, 1);
    expect(g.canPlace([[0, 0]], 0, 0)).toBe(false);
    expect(g.canPlace([[0, 0], [1, 0]], 4, 0)).toBe(false); // (5,0) non esiste
    expect(g.canPlace([[0, 0], [1, 0]], 1, 0)).toBe(true);
  });

  it("è immutabile: place restituisce un tabellone nuovo", () => {
    const a = new HexGrid(4);
    const b = a.place([[0, 0]], 0, 0, 3);
    expect(a.get(0, 0)).toBe(0);
    expect(b.get(0, 0)).toBe(3);
  });

  it("svuota due linee che si incrociano, contando le celle una volta sola", () => {
    let g = new HexGrid(4);
    for (let q = -4; q <= 3; q++) g = g.place([[0, 0]], q, 0, 1); // riga r=0 tranne (4,0)
    for (let r = -4; r < 0; r++) g = g.place([[0, 0]], 4, r, 1); // diagonale q=4 tranne (4,0)
    const res = g.play([[0, 0]], 4, 0, 2);
    expect(res.lines.map((l) => l.id).sort()).toEqual(["q4", "r0"]);
    expect(res.clearedCells.size).toBe(9 + 5 - 1);
    expect([...res.grid.cells.values()].every((v) => v === 0)).toBe(true);
  });

  it("placementsFor e fits sono coerenti", () => {
    const g = new HexGrid(4);
    expect(g.placementsFor([[0, 0]])).toHaveLength(61);
    expect(g.fits([[0, 0], [1, 0], [2, 0], [3, 0]])).toBe(true);
    expect(key(1, -2)).toBe("1,-2");
  });

  it("i controlli veloci di occupazione coincidono con la mappa delle celle", () => {
    for (const radius of [1, 4]) {
      let g = new HexGrid(radius);
      [...g.cells.keys()].filter((_, i) => i % 3 === 0).forEach((k) => { g = g.place([[0, 0]], ...parseKey(k), 5); });
      for (let q = -radius - 2; q <= radius + 2; q++) {
        for (let r = -radius - 2; r <= radius + 2; r++) {
          expect(g.has(q, r)).toBe(g.cells.has(key(q, r)));
          expect(g.isEmpty(q, r)).toBe(g.cells.get(key(q, r)) === 0);
        }
      }
      // i campi di supporto non entrano nei confronti fra griglie
      expect(Object.keys(g)).toEqual(["radius", "cells", "lines"]);
    }
  });
});
