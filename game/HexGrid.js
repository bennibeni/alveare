/**
 * HexGrid — tabellone esagonale in coordinate ASSIALI (q, r), con s = -q - r.
 *
 * Perché non la griglia rettangolare "sfasata" (offset) della prima versione?
 * Con le righe pari/dispari sfasate le linee orizzontali sono facili, ma le
 * due diagonali diventano zig-zag che dipendono dalla parità della riga.
 * In coordinate assiali/cubiche, invece, le TRE famiglie di linee sono
 * simmetriche: una linea è semplicemente l'insieme delle celle con
 *   r costante  (orizzontale),
 *   q costante  (diagonale "\"),
 *   s costante  (diagonale "/").
 *
 * Il tabellone è un esagono di "raggio" N: tutte le celle con
 * max(|q|, |r|, |s|) <= N. Con N = 4 ci sono 61 celle e 27 linee (9 per
 * direzione, lunghe da 5 a 9 celle).
 *
 * La classe è IMMUTABILE: place() e clear() restituiscono un nuovo HexGrid,
 * così lo stato React resta prevedibile e l'annullamento è banale.
 */

export const DIRECTIONS = [
  [1, 0], // E
  [1, -1], // NE
  [0, -1], // NO
  [-1, 0], // O
  [-1, 1], // SO
  [0, 1], // SE
];

const AXES = [
  { id: "r", label: "orizzontale", coord: (q, r) => r },
  { id: "q", label: "diagonale \\", coord: (q) => q },
  { id: "s", label: "diagonale /", coord: (q, r) => -q - r },
];

export const key = (q, r) => `${q},${r}`;
// Le chiavi sono poche (61 celle): le coordinate si calcolano una volta sola.
const parsed = new Map();
export const parseKey = (k) => {
  let c = parsed.get(k);
  if (!c) parsed.set(k, (c = Object.freeze(k.split(",").map(Number))));
  return c;
};

const lineCache = new Map();
const coordCache = new Map();

export default class HexGrid {
  constructor(radius = 4, cells = null) {
    this.radius = radius;
    // cells: Map "q,r" -> 0 (vuota) oppure un indice colore >= 1
    if (cells) {
      this.cells = cells;
    } else {
      this.cells = new Map();
      for (let q = -radius; q <= radius; q++) {
        for (let r = -radius; r <= radius; r++) {
          if (Math.abs(-q - r) <= radius) this.cells.set(key(q, r), 0);
        }
      }
    }
    this.lines = HexGrid.linesFor(radius, this.cells);
    if (!coordCache.has(radius)) coordCache.set(radius, [...this.cells.keys()].map(parseKey));
    // Dati di supporto non enumerabili: non cambiano confronti né copie della griglia.
    Object.defineProperty(this, "coords", { value: coordCache.get(radius) });
    Object.defineProperty(this, "_occ", { value: null, writable: true });
  }

  /** Tutte le linee del tabellone (calcolate una sola volta per raggio). */
  static linesFor(radius, cells) {
    if (lineCache.has(radius)) return lineCache.get(radius);
    const lines = [];
    for (const axis of AXES) {
      for (let v = -radius; v <= radius; v++) {
        const members = [];
        for (const k of cells.keys()) {
          const [q, r] = parseKey(k);
          if (axis.coord(q, r) === v) members.push(k);
        }
        lines.push({ id: `${axis.id}${v}`, axis: axis.id, value: v, cells: members });
      }
    }
    lineCache.set(radius, lines);
    return lines;
  }

  /**
   * Occupazione in un array indicizzato per coordinate (-1 fuori dal tabellone,
   * 0 vuota, 1 piena): evita di costruire una chiave stringa a ogni controllo.
   * Calcolata alla prima richiesta; la griglia è immutabile, quindi resta valida.
   */
  get occupancy() {
    if (!this._occ) {
      const side = 2 * this.radius + 1;
      const occ = new Int8Array(side * side).fill(-1);
      for (const [k, v] of this.cells) {
        const [q, r] = parseKey(k);
        occ[(q + this.radius) * side + r + this.radius] = v ? 1 : 0;
      }
      this._occ = occ;
    }
    return this._occ;
  }

  occ(q, r) {
    const side = 2 * this.radius + 1;
    const a = q + this.radius;
    const b = r + this.radius;
    return a < 0 || b < 0 || a >= side || b >= side ? -1 : this.occupancy[a * side + b];
  }

  has(q, r) {
    return this.occ(q, r) !== -1;
  }

  get(q, r) {
    return this.cells.get(key(q, r));
  }

  isEmpty(q, r) {
    return this.occ(q, r) === 0;
  }

  /** I (fino a) 6 vicini di una cella, già filtrati sui confini. */
  getNeighbors(q, r) {
    return DIRECTIONS.map(([dq, dr]) => [q + dq, r + dr]).filter(([nq, nr]) =>
      this.has(nq, nr),
    );
  }

  /** Il pezzo (lista di offset [dq, dr]) entra con l'origine in (q, r)? */
  canPlace(piece, q, r) {
    for (const [dq, dr] of piece) if (this.occ(q + dq, r + dr) !== 0) return false;
    return true;
  }

  /** Nuovo HexGrid con il pezzo appoggiato (senza cancellare linee). */
  place(piece, q, r, color = 1) {
    const cells = new Map(this.cells);
    for (const [dq, dr] of piece) cells.set(key(q + dq, r + dr), color);
    const next = new HexGrid(this.radius, cells);
    // l'occupazione si ricava da quella attuale senza rileggere tutte le celle
    const occ = this.occupancy.slice();
    const side = 2 * this.radius + 1;
    for (const [dq, dr] of piece) occ[(q + dq + this.radius) * side + r + dr + this.radius] = color ? 1 : 0;
    next._occ = occ;
    return next;
  }

  /** Le linee completamente piene, in tutte e tre le direzioni. */
  fullLines() {
    return this.lines.filter((l) => l.cells.every((k) => this.cells.get(k) !== 0));
  }

  /** Nuovo HexGrid con le celle delle linee indicate svuotate. */
  clear(lines) {
    const cells = new Map(this.cells);
    for (const l of lines) for (const k of l.cells) cells.set(k, 0);
    const next = new HexGrid(this.radius, cells);
    const occ = this.occupancy.slice();
    const side = 2 * this.radius + 1;
    for (const l of lines) {
      for (const k of l.cells) {
        const [q, r] = parseKey(k);
        occ[(q + this.radius) * side + r + this.radius] = 0;
      }
    }
    next._occ = occ;
    return next;
  }

  /** Tutte le posizioni d'origine in cui il pezzo entra. */
  placementsFor(piece) {
    const out = [];
    for (const [q, r] of this.coords) if (this.canPlace(piece, q, r)) out.push([q, r]);
    return out;
  }

  fits(piece) {
    for (const [q, r] of this.coords) if (this.canPlace(piece, q, r)) return true;
    return false;
  }

  /**
   * Simula una mossa completa: appoggia, trova le linee piene, cancellale.
   * Restituisce { grid, lines, clearedCells }.
   */
  play(piece, q, r, color = 1) {
    const placed = this.place(piece, q, r, color);
    const lines = placed.fullLines();
    const clearedCells = new Set(lines.flatMap((l) => l.cells));
    return { placed, grid: lines.length ? placed.clear(lines) : placed, lines, clearedCells };
  }
}

// ---- Geometria (esagoni "a punta in su") ----------------------------------

export const SQRT3 = Math.sqrt(3);

export function axialToPixel(q, r, size) {
  return [size * SQRT3 * (q + r / 2), size * 1.5 * r];
}

export function pixelToAxial(x, y, size) {
  const fq = ((SQRT3 / 3) * x - y / 3) / size;
  const fr = ((2 / 3) * y) / size;
  return cubeRound(fq, fr);
}

function cubeRound(fq, fr) {
  const fs = -fq - fr;
  let q = Math.round(fq);
  let r = Math.round(fr);
  const s = Math.round(fs);
  const dq = Math.abs(q - fq);
  const dr = Math.abs(r - fr);
  const ds = Math.abs(s - fs);
  if (dq > dr && dq > ds) q = -r - s;
  else if (dr > ds) r = -q - s;
  return [q + 0, r + 0]; // +0 elimina eventuali -0
}

export function hexPoints(cx, cy, size) {
  const pts = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 180) * (60 * i - 30);
    pts.push(`${(cx + size * Math.cos(a)).toFixed(2)},${(cy + size * Math.sin(a)).toFixed(2)}`);
  }
  return pts.join(" ");
}
