import { describe, expect, it } from "vitest";
import data from "../../data/autopsia/trappole-100000.json";
import { replayTrap } from "../../game/trapReplay.js";
import { replacePiece, seededRandom } from "../../game/pieces.js";
import {
  compareBatch,
  isBetter,
  summarizePairs,
} from "../../game/trapComparison.js";
import {
  readTrapArchive,
  saveTrapRecord,
  readTrapEvaluations,
  saveTrapEvaluation,
  trapRecordId,
} from "../../game/trapArchive.js";

const trap = data.games.flatMap((g) => g.traps)[0];
describe("confronti delle trappole", () => {
  it("ricorda i non migliori senza inserirli fra i migliori e recupera le vecchie conferme", () => {
    const memory = new Map();
    const storage = {
      getItem: (k) => memory.get(k) ?? null,
      setItem: (k, v) => memory.set(k, v),
    };
    saveTrapRecord(storage, { id: "legacy", stato: "confermata" });
    saveTrapEvaluation(storage, { id: "negative", stato: "non_migliore" });
    saveTrapEvaluation(storage, { id: "negative", stato: "non_migliore" });
    expect(readTrapEvaluations(storage)).toHaveLength(2);
    expect(readTrapArchive(storage)).toEqual([
      { id: "legacy", stato: "confermata" },
    ]);
    const chosen = { idx: 0, q: 1, r: -1 };
    expect(trapRecordId(trap, 0, chosen, "old")).not.toBe(
      trapRecordId(trap, 0, chosen, "new"),
    );
  });
  it("conserva la combo durante il replay", () => {
    const { states } = replayTrap(trap);
    expect(states[0].streak).toBe(trap.start.streak);
    trap.moves.forEach(([idx, q, r], i) => {
      const s = states[i];
      const played = s.grid.play(s.tray[idx].cells, q, r, s.tray[idx].color);
      expect(states[i + 1].streak).toBe(played.lines.length ? s.streak + 1 : 0);
    });
  });
  it("la stessa mossa riceve esattamente gli stessi futuri e nessun vantaggio", () => {
    const posizione = {
      celle: trap.start.cells,
      vassoio: trap.start.tray,
      combo: trap.start.streak,
    };
    const [idx, q, r] = trap.moves[0];
    const input = {
      posizione,
      tua: { idx, q, r },
      suggerita: { idx, q, r },
      count: 4,
      seed: 777,
      horizon: 2,
    };
    const result = compareBatch(input);
    expect(result.a).toEqual(result.b);
    expect(result.differenza).toBe(0);
    expect(result.errore).toBe(0);
    expect(isBetter(result)).toBe(false);
    expect(compareBatch(input)).toEqual(result);
  });
  it("misura la differenza appaiata e applica la penalità al blocco", () => {
    const result = summarizePairs(
      [
        [
          { points: 20, blocked: false },
          { points: 30, blocked: true },
        ],
        [
          { points: 20, blocked: false },
          { points: 30, blocked: false },
        ],
      ],
      777,
      15,
    );
    expect(result.differenza).toBe(490);
    expect(result.errore).toBe(500);
    expect(isBetter(result)).toBe(false);
  });
  it("conta il blocco che avviene esattamente alla fine dell’orizzonte", () => {
    const states = replayTrap(trap).states;
    const s = states.at(-2);
    const [idx, q, r] = trap.moves.at(-1);
    const posizione = {
      celle: [...s.grid.cells].filter(([, v]) => v).map(([k]) => k),
      vassoio: s.tray.map((p) => p.id),
      combo: s.streak,
    };
    // Cerca il futuro che ricrea il pezzo finale noto; la griglia è già bloccata
    // per i due pezzi non sostituiti, ma non necessariamente per ogni estrazione.
    let seed = 0;
    const finalPiece = states.at(-1).tray[idx].id;
    for (; seed < 1000; seed++) {
      if (replacePiece(s.tray, idx, seededRandom(seed))[idx].id === finalPiece)
        break;
    }
    const result = compareBatch({
      posizione,
      tua: { idx, q, r },
      suggerita: { idx, q, r },
      count: 1,
      seed,
      horizon: 0,
    });
    expect(result.a.blocchi).toBe(1);
  });
  it("non duplica i risultati e li conserva dopo una nuova lettura", () => {
    const memory = new Map();
    const storage = {
      getItem: (k) => memory.get(k) ?? null,
      setItem: (k, v) => memory.set(k, v),
    };
    saveTrapRecord(storage, { id: "same", stato: "confermata" });
    saveTrapRecord(storage, { id: "same", stato: "confermata", updated: true });
    expect(readTrapArchive(storage)).toEqual([
      { id: "same", stato: "confermata", updated: true },
    ]);
    storage.setItem = () => {
      throw new Error("Quota exceeded");
    };
    expect(() => saveTrapRecord(storage, { id: "new" })).toThrow(
      "Quota exceeded",
    );
  });
});
