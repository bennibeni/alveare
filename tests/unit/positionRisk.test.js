import { describe, expect, it } from "vitest";
import HexGrid from "../../game/HexGrid.js";
import { PIECES } from "../../game/pieces.js";
import {
  estimatePositionRisk,
  legalPlacements,
} from "../../game/positionRisk.js";

const point = PIECES[0];
const bar = PIECES.find((p) => p.name === "barra 4");
const settings = { samples: 12, choiceSamples: 8, maxChoices: 2 };

describe("indicatori di prosecuzione", () => {
  it("rispetta la scelta libera in Normale e il primo pezzo obbligatorio in Esperto", () => {
    const grid = new HexGrid(0),
      tray = [bar, point, point];
    expect(legalPlacements(grid, tray, false)).toHaveLength(2);
    expect(legalPlacements(grid, tray, true)).toHaveLength(0);
    const result = estimatePositionRisk(
      { grid, tray, expert: true },
      [],
      settings,
    );
    expect(result.immediateBlocked).toBe(true);
    expect(result.risk3.probability).toBe(1);
    expect(result.risk6.probability).toBe(1);
    expect(result.margin.assessed).toBe(0);
  });

  it("elimina le linee e usa i pezzi noti prima di quelli nuovi", () => {
    const position = {
      grid: new HexGrid(0),
      tray: [point, point, point],
      expert: true,
    };
    const result = estimatePositionRisk(
      position,
      [{ idx: 0, q: 0, r: 0, played: true }],
      settings,
    );
    expect(result.risk3.probability).toBe(0);
    expect(result.risk6.probability).toBeGreaterThan(0);
    expect(result.choices[0].risk3.probability).toBe(0);
    expect(result.risk3.interval95[1]).toBeGreaterThan(0);
    expect(result.risk6.interval95[0]).toBeLessThan(result.risk6.probability);
    expect(position.grid.get(0, 0)).toBe(0);
  });

  it("riproduce le simulazioni e include la mossa giocata senza duplicati né mosse illegali", () => {
    const position = {
      grid: new HexGrid(0),
      tray: [point, point, point],
      expert: false,
    };
    const choices = [
      { idx: 0, q: 0, r: 0 },
      { idx: 0, q: 0, r: 0 },
      { idx: 2, q: 0, r: 0, played: true },
      { idx: 1, q: 8, r: 9 },
    ];
    const result = estimatePositionRisk(position, choices, settings);
    expect(estimatePositionRisk(position, choices, settings)).toEqual(result);
    expect(result.choices).toHaveLength(2);
    expect(result.choices[0].played).toBe(true);
    expect(result.risk6.probability).toBeGreaterThanOrEqual(
      result.risk3.probability,
    );
    expect(result.margin).toMatchObject({ assessed: 2, legal: 3 });
    expect(result.margin.confidentSafe).toBeLessThanOrEqual(result.margin.safe);
  });
});
