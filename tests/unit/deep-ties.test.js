import { describe, expect, it } from "vitest";
import HexGrid from "../../game/HexGrid.js";
import { PIECES } from "../../game/pieces.js";
import { analyzeMoves } from "../../game/strategy.js";

// seme 7000, pezzo 2891 (31 celle libere): ferro di cavallo in 45-51-57-58, ferro in 24-25-34-42 e
// rombo in 49-50-55-56 portano, con i tre pezzi noti, allo stesso tabellone finale: stesso totale,
// lo spareggio decide.
const OCCUPIED = [
  "-3,0",
  "-3,1",
  "-3,3",
  "-2,-1",
  "-2,0",
  "-2,1",
  "-2,2",
  "-1,-2",
  "-1,-1",
  "-1,0",
  "-1,1",
  "-1,2",
  "-1,3",
  "-1,4",
  "0,-4",
  "0,-3",
  "0,-2",
  "0,-1",
  "0,0",
  "0,1",
  "0,2",
  "1,-4",
  "1,-3",
  "1,-2",
  "2,-3",
  "2,-2",
  "3,-3",
  "4,-3",
  "4,-2",
  "4,-1",
];
const TRAY = ["ferro di cavallo-0", "ferro di cavallo-3", "rombo-2"];

function position() {
  const cells = new Map(new HexGrid(4).cells);
  for (const k of OCCUPIED) cells.set(k, 1);
  const byId = new Map(PIECES.map((p) => [p.id, p]));
  return { grid: new HexGrid(4, cells), tray: TRAY.map((id) => byId.get(id)) };
}

describe("pari merito nella zona di pericolo", () => {
  it("le pari merito hanno totali diversi, sopra le candidate successive", () => {
    const { grid, tray } = position();
    const moves = analyzeMoves(grid, tray, 0).moves;
    const tied = moves.filter((m) => m.tieTotal !== undefined);
    expect(tied).toHaveLength(3);
    expect(new Set(tied.map((m) => m.tieTotal)).size).toBe(1);
    expect(tied[0].total).toBe(tied[0].tieTotal);
    expect(tied[1].total).toBeLessThan(tied[0].total);
    expect(tied[2].total).toBeLessThan(tied[1].total);
    expect(tied[2].total).toBeGreaterThan(moves[3].total);
    // con il rischio imparato lo spareggio sceglie il rombo che isola la cella 61: nei futuri
    // (2000, continuando con la strategia nuova) si blocca nel 15,8% dei casi, i ferri nel 13,2%
    expect(tied[0]).toMatchObject({ idx: 2, q: 1, r: 2 });
  });
});
