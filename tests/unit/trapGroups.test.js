import { describe, expect, it } from "vitest";
import data from "../../data/autopsia/trappole-100000.json";
import {
  groupTraps,
  trapPositionKey,
  groupStatus,
  improvedTrapsExport,
  trapSource,
  hasSingleLegalMove,
} from "../../game/trapGroups.js";
import { PIECES } from "../../game/pieces.js";

const traps = data.games.flatMap((g) => g.traps);
describe("raggruppamento delle trappole", () => {
  it("esclude le 5 posizioni obbligate senza modificare l’archivio", () => {
    const forced = traps.filter((t) => hasSingleLegalMove(t.start));
    expect(forced).toHaveLength(17);
    expect(groupTraps(forced)).toHaveLength(5);
    const kept = traps.filter((t) => !hasSingleLegalMove(t.start));
    expect(kept).toHaveLength(42);
    expect(groupTraps(kept)).toHaveLength(19);
    expect(kept.some((t) => t.seed === 108924)).toBe(false);
    const start = forced.find((t) => t.seed === 108924).start;
    expect(
      hasSingleLegalMove({ ...start, tray: [...start.tray].reverse() }),
    ).toBe(true);
    expect(traps).toHaveLength(59);
  });
  it("il verde prevale nel gruppo e l’esportazione conserva copie e tentativi", () => {
    const groups = groupTraps(traps);
    const group = groups.find((g) => g.members.length > 1);
    const negative = {
      id: "negative",
      partita: trapSource(group.members[0]),
      stato: "non_migliore",
    };
    const positive = {
      id: "positive",
      partita: trapSource(group.members[1]),
      stato: "confermata",
    };
    expect(groupStatus(group, [])).toBe("nuova");
    expect(groupStatus(group, [negative])).toBe("analizzata");
    expect(groupStatus(group, [negative, positive])).toBe("migliore");
    expect(improvedTrapsExport(groups, [negative]).posizioni).toHaveLength(0);
    const payload = improvedTrapsExport(groups, [negative, positive]);
    expect(payload.posizioni).toHaveLength(1);
    expect(payload.posizioni[0].continuazioni).toEqual(group.members);
    expect(payload.posizioni[0].valutazioni).toEqual([negative, positive]);
  });
  it("riduce 59 copie a 24 posizioni conservando tutte le continuazioni", () => {
    const groups = groupTraps(traps);
    expect(groups).toHaveLength(24);
    expect(groups.flatMap((g) => g.members)).toHaveLength(59);
    expect(new Set(groups.flatMap((g) => g.members))).toEqual(new Set(traps));
  });
  it("ignora ordine di celle, vassoio e combo senza alterare i dati originali", () => {
    const original = traps[0].start;
    const reordered = {
      ...original,
      cells: [...original.cells].reverse(),
      tray: [...original.tray].reverse(),
      streak: original.streak + 1,
    };
    expect(trapPositionKey(reordered)).toBe(trapPositionKey(original));
    const grouped = groupTraps([{ start: original }, { start: reordered }]);
    expect(grouped).toHaveLength(1);
    expect(grouped[0].members[0].start).toBe(original);
    expect(grouped[0].members[1].start).toBe(reordered);
  });
  it("distingue molteplicità delle forme, orientamento e occupazione", () => {
    const [barA, barB] = PIECES.filter((p) => p.name === "barra 4");
    const point = PIECES.find((p) => p.name === "punto");
    const start = { cells: ["0,0"], tray: [barA.id, barA.id, point.id] };
    const key = trapPositionKey(start);
    expect(
      trapPositionKey({ ...start, tray: [barA.id, point.id, point.id] }),
    ).not.toBe(key);
    expect(
      trapPositionKey({ ...start, tray: [barA.id, barB.id, point.id] }),
    ).not.toBe(key);
    expect(trapPositionKey({ ...start, cells: ["0,1"] })).not.toBe(key);
  });
});
