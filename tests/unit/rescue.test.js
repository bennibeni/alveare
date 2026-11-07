import { describe, expect, it } from "vitest";
import traps from "../../data/autopsia/trappole-100000.json";
import archive from "../../data/archivio-affollate.json";
import HexGrid from "../../game/HexGrid.js";
import { PIECES, randomTray, seededRandom } from "../../game/pieces.js";
import {
  analyzePlayedMove,
  bestMove,
  explainNormal,
  slimAnalysis,
  NORMAL_RESCUE,
  isDifficultPosition,
} from "../../game/strategy.js";
import { replayTrap } from "../../game/trapReplay.js";
import { judgeMove } from "../../game/moveJudgment.js";

describe("ricerca nei casi senza continuazione nota", () => {
  it("sceglie l’alternativa confermata per 108051 senza alterare la posizione e riusa le simulazioni", () => {
    const t = traps.games
      .flatMap((g) => g.traps)
      .find((t) => t.seed === 108051 && t.k === 0);
    const state = replayTrap(t).states[0];
    expect(isDifficultPosition(state.grid, state.tray)).toBe(true);
    const before = [...state.grid.cells];
    const analysis = explainNormal(state.grid, state.tray, state.streak);
    const best = analysis.byTotal[0];
    expect(best).toMatchObject({ idx: 0, q: -1, r: -3 });
    expect(best.rescue).toMatchObject({ futures: 24, horizon: 8 });
    expect(best.rescue.lost).toBeLessThanOrEqual(NORMAL_RESCUE.futures);
    expect(analysis.byTotal.every((m) => !m.next)).toBe(true);
    expect([...state.grid.cells]).toEqual(before);
    const again = explainNormal(state.grid, state.tray, state.streak);
    expect(again.byTotal[0].rescue).toBe(best.rescue);
    const recolored = new HexGrid(
      4,
      new Map([...state.grid.cells].map(([k, v]) => [k, v ? 9 : 0])),
    );
    const cloned = explainNormal(recolored, state.tray, state.streak)
      .byTotal[0];
    expect(cloned.rescue).toBe(best.rescue);
    expect([...cloned.after.cells]).toEqual([
      ...recolored.play(state.tray[cloned.idx].cells, cloned.q, cloned.r).grid
        .cells,
    ]);
    expect(bestMove(state.grid, state.tray, state.streak)).toMatchObject({
      idx: best.idx,
      q: best.q,
      r: best.r,
    });
    const played = analyzePlayedMove({
      ...state,
      idx: best.idx,
      q: best.q,
      r: best.r,
      expert: false,
    });
    expect(slimAnalysis(played).moves[0].rescue).toEqual(best.rescue);
    expect(judgeMove(played).risk.blocked).toBe(false);
  }, 20000);

  it("non interviene nelle posizioni aperte o con una sola mossa legale", () => {
    const opened = explainNormal(
      new HexGrid(4),
      randomTray(seededRandom(23)),
      0,
    );
    expect(opened.byTotal.every((m) => !m.rescue)).toBe(true);
    expect(
      isDifficultPosition(new HexGrid(4), randomTray(seededRandom(23))),
    ).toBe(false);
    const t = traps.games
      .flatMap((g) => g.traps)
      .find((t) => t.seed === 108924 && t.k === 2);
    const state = replayTrap(t).states[0];
    const forced = explainNormal(state.grid, state.tray, state.streak);
    expect(forced.totalMoves).toBe(1);
    expect(isDifficultPosition(state.grid, state.tray)).toBe(false);
    expect(forced.byTotal[0].rescue).toBeUndefined();
  });

  it("giudica la settima candidata con la stessa simulazione delle sei mostrate", () => {
    const p = archive.positions.find((p) => p.id === "precedente-51261-468");
    const cells = new Map(new HexGrid(4).cells);
    for (const [q, r] of p.cells) cells.set(`${q},${r}`, 1);
    const grid = new HexGrid(4, cells);
    const byId = new Map(PIECES.map((p) => [p.id, p]));
    const tray = p.tray.map((id) => byId.get(id));
    const full = explainNormal(grid, tray, p.streak);
    const last = full.byTotal.at(-1);
    expect(full.byTotal).toHaveLength(7);
    expect(last.rescue).toBeTruthy();
    const played = analyzePlayedMove({
      grid,
      tray,
      streak: p.streak,
      expert: false,
      idx: last.idx,
      q: last.q,
      r: last.r,
    });
    expect(played.moves.at(-1)).toMatchObject({
      total: last.total,
      rescue: last.rescue,
      added: true,
      played: true,
    });
  }, 20000);
});
