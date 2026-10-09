import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { cellNumbers } from "../../game/HexGrid.js";
import {
  ARCHIVE,
  loadPosition,
  rollout,
} from "../../scripts/crowded-archive.mjs";

const archive = JSON.parse(
  fs.readFileSync(
    new URL("../../data/archivio-affollate.json", import.meta.url),
    "utf8",
  ),
);

describe("archivio di posizioni affollate e decisive", () => {
  it("ha posizioni in taratura e in verifica, divise per partita di origine", () => {
    expect(archive.counts.total).toBe(archive.positions.length);
    expect(archive.counts.taratura).toBeGreaterThan(0);
    expect(archive.counts.verifica).toBeGreaterThan(0);
    const setOf = new Map();
    for (const p of archive.positions) {
      const key = `${p.source}-${p.gameSeed}`;
      if (setOf.has(key)) expect(setOf.get(key)).toBe(p.set);
      setOf.set(key, p.set);
    }
  });

  it("ogni posizione si ricarica, è affollata, ha tre pezzi validi ed è decisiva", () => {
    const numbers = cellNumbers(4);
    for (const p of archive.positions) {
      const { grid, tray } = loadPosition(p);
      const free = [...grid.cells.values()].filter((v) => !v).length;
      expect(free).toBe(p.free);
      expect(free).toBeLessThan(ARCHIVE.free);
      expect(p.cellNumbers).toEqual(
        p.cells.map(([q, r]) => numbers.get(`${q},${r}`)).sort((a, b) => a - b),
      );
      expect(tray.every(Boolean)).toBe(true);
      expect(p.survived).toBeGreaterThan(0);
      expect(p.survived).toBeLessThan(p.outcomes.length);
      for (const o of p.outcomes)
        expect(grid.canPlace(tray[o.idx].cells, o.q, o.r)).toBe(true);
    }
  });

  it("i pezzi futuri dipendono solo da futureSeed: la stessa prova dà sempre lo stesso esito", () => {
    const p = archive.positions[0];
    const pos = loadPosition(p);
    const first = p.outcomes[0];
    const a = rollout(pos, first, p.futureSeed, 5);
    const b = rollout(pos, first, p.futureSeed, 5);
    expect(a).toBe(b);
  });
});
