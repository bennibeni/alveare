import { describe, expect, it } from "vitest";
import HexGrid, { DIRECTIONS } from "../../game/HexGrid.js";
import {
  normalize,
  PIECES,
  randomPiece,
  randomTray,
  replacePiece,
  rotations,
  seededRandom,
  SHAPES,
  shiftQueue,
} from "../../game/pieces.js";

const sig = (cells) => normalize(cells).map((c) => c.join(",")).join(";");
const mirror = (cells) => cells.map(([q, r]) => [q, -q - r]);
const orientationSet = (cells) => new Set(rotations(cells).map(sig));

describe("catalogo dei pezzi", () => {
  it("25 pezzi in 6 forme, con il numero giusto di orientamenti", () => {
    expect(PIECES).toHaveLength(25);
    expect(Object.fromEntries(SHAPES.map((s) => [s.name, s.pieces.length]))).toEqual({
      punto: 1,
      "barra 4": 3,
      rombo: 3,
      "ferro di cavallo": 6,
      "bandiera destra": 6,
      "bandiera sinistra": 6,
    });
    expect(PIECES.map((p) => p.num)).toEqual(Array.from({ length: 25 }, (_, i) => i + 1));
  });

  it("tutti i pezzi sono distinti, normalizzati e connessi", () => {
    expect(new Set(PIECES.map((p) => sig(p.cells))).size).toBe(25);
    for (const p of PIECES) {
      expect(p.cells[0]).toEqual([0, 0]);
      const set = new Set(p.cells.map((c) => c.join(",")));
      const seen = new Set([p.cells[0].join(",")]);
      const stack = [p.cells[0]];
      while (stack.length) {
        const [q, r] = stack.pop();
        for (const [dq, dr] of DIRECTIONS) {
          const k = `${q + dq},${r + dr}`;
          if (set.has(k) && !seen.has(k)) {
            seen.add(k);
            stack.push([q + dq, r + dr]);
          }
        }
      }
      expect(seen.size).toBe(set.size);
    }
  });

  it("le due bandiere sono una lo specchio dell'altra; le altre forme sono simmetriche", () => {
    const shape = (n) => SHAPES.find((s) => s.name === n).pieces[0].cells;
    const dx = orientationSet(shape("bandiera destra"));
    const sx = orientationSet(shape("bandiera sinistra"));
    expect(orientationSet(mirror(shape("bandiera destra")))).toEqual(sx);
    for (const s of sx) expect(dx.has(s)).toBe(false);
    for (const n of ["punto", "barra 4", "rombo", "ferro di cavallo"]) {
      expect(orientationSet(mirror(shape(n)))).toEqual(orientationSet(shape(n)));
    }
  });

  it("la bandiera ha 3 celle allineate e la quarta adiacente a due di esse", () => {
    for (const n of ["bandiera destra", "bandiera sinistra"]) {
      const cells = SHAPES.find((s) => s.name === n).pieces[0].cells;
      const set = new Set(cells.map((c) => c.join(",")));
      const adj = (a, b) => DIRECTIONS.some(([dq, dr]) => a[0] + dq === b[0] && a[1] + dr === b[1]);
      const outsider = cells.find((c) => cells.filter((o) => o !== c && adj(c, o)).length === 2 && !DIRECTIONS.some(([dq, dr]) => set.has(`${c[0] + dq},${c[1] + dr}`) && set.has(`${c[0] + 2 * dq},${c[1] + 2 * dr}`)));
      expect(outsider).toBeDefined();
    }
  });
});

describe("estrazione dei pezzi", () => {
  it("seededRandom è riproducibile e resta in [0, 1)", () => {
    const a = seededRandom(42);
    const b = seededRandom(42);
    for (let i = 0; i < 100; i++) {
      const x = a();
      expect(x).toBe(b());
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });

  it("le frequenze delle forme rispettano i pesi (punto 13%, bandiere 10,9% ciascuna, altre 21,7%)", () => {
    const rng = seededRandom(1);
    const n = 20000;
    const count = {};
    for (let i = 0; i < n; i++) {
      const p = randomPiece(rng);
      count[p.name] = (count[p.name] || 0) + 1;
    }
    const expected = { punto: 0.6, "barra 4": 1, rombo: 1, "ferro di cavallo": 1, "bandiera destra": 0.5, "bandiera sinistra": 0.5 };
    for (const [name, w] of Object.entries(expected)) expect(count[name] / n).toBeCloseTo(w / 4.6, 1);
  });

  it("modalità normale: replacePiece cambia solo il posto usato", () => {
    const rng = seededRandom(3);
    const tray = [PIECES[1], PIECES[2], PIECES[3]];
    const next = replacePiece(tray, 1, rng);
    expect(next[0]).toBe(tray[0]);
    expect(next[2]).toBe(tray[2]);
  });

  it("non ripete il sorteggio per salvare un vassoio senza mosse disponibili", () => {
    // Solo il punto entra, ma l'estrazione di una barra deve concludere la partita.
    let g = new HexGrid(4);
    for (const k of g.cells.keys()) if (k !== "0,0") g = g.place([[0, 0]], ...k.split(",").map(Number), 1);
    const barre = SHAPES.find((s) => s.name === "barra 4").pieces;
    let calls = 0;
    const rng = () => ++calls === 1 ? 0.2 : 0;
    const t2 = replacePiece([barre[0], barre[1], barre[2]], 0, rng);
    expect(g.fits(PIECES[0].cells)).toBe(true);
    expect(t2.some((p) => g.fits(p.cells))).toBe(false);
    expect(calls).toBe(1);
  });

  it("il vassoio iniziale usa tre estrazioni senza correzioni", () => {
    const rng = seededRandom(23);
    const expected = [randomPiece(rng), randomPiece(rng), randomPiece(rng)];
    expect(randomTray(seededRandom(23))).toEqual(expected);
  });

  it("modalità Esperto: shiftQueue fa scorrere la coda e aggiunge un pezzo in fondo", () => {
    const tray = [PIECES[0], PIECES[5], PIECES[9]];
    const next = shiftQueue(tray, seededRandom(7));
    expect(next[0]).toBe(PIECES[5]);
    expect(next[1]).toBe(PIECES[9]);
    expect(PIECES).toContain(next[2]);
  });
});
