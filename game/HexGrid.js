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

/*
 * Maschere di bit per i controlli veloci. Ogni cella ha un numero da 0 a 60 (l'ordine di
 * `coords`); un insieme di celle è una coppia di interi da 32 bit: celle 0–31 in `lo`, 32–60 in
 * `hi`. "Il pezzo entra qui?" diventa (maschera del pezzo AND celle piene) === 0.
 */
const bitCache = new Map(); // raggio -> { side, bitOf: Int8Array(side²) -> numero della cella o -1 }
function bitsFor(radius, coords) {
  let b = bitCache.get(radius);
  if (!b) {
    const side = 2 * radius + 1;
    const bitOf = new Int8Array(side * side).fill(-1);
    coords.forEach(
      ([q, r], i) => (bitOf[(q + radius) * side + r + radius] = i),
    );
    bitCache.set(radius, (b = { side, bitOf }));
  }
  return b;
}
/**
 * Posizioni di un pezzo sul tabellone vuoto, nell'ordine di `coords` (lo stesso ordine di
 * placementsFor): origini e maschere. Calcolate una volta per pezzo e raggio.
 */
const placementCache = new Map(); // raggio -> WeakMap(pezzo -> { origins, lo, hi })
function placementsOf(grid, piece) {
  let byPiece = placementCache.get(grid.radius);
  if (!byPiece) placementCache.set(grid.radius, (byPiece = new WeakMap()));
  let p = byPiece.get(piece);
  if (!p) {
    const R = grid.radius;
    const { side, bitOf } = bitsFor(R, grid.coords);
    const origins = [];
    const lo = [];
    const hi = [];
    for (const [q, r] of grid.coords) {
      let ml = 0;
      let mh = 0;
      let inside = true;
      for (const [dq, dr] of piece) {
        const a = q + dq + R;
        const b = r + dr + R;
        const bit =
          a < 0 || b < 0 || a >= side || b >= side ? -1 : bitOf[a * side + b];
        if (bit < 0) {
          inside = false;
          break;
        }
        if (bit < 32) ml |= 1 << bit;
        else mh |= 1 << (bit - 32);
      }
      if (inside) {
        origins.push([q, r]);
        lo.push(ml);
        hi.push(mh);
      }
    }
    p = { origins, lo: Int32Array.from(lo), hi: Int32Array.from(hi) };
    byPiece.set(piece, p);
  }
  return p;
}

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
    if (!coordCache.has(radius))
      coordCache.set(radius, [...this.cells.keys()].map(parseKey));
    // Dati di supporto non enumerabili: non cambiano confronti né copie della griglia.
    Object.defineProperty(this, "coords", { value: coordCache.get(radius) });
    Object.defineProperty(this, "_occ", { value: null, writable: true });
    Object.defineProperty(this, "_bits", { value: null, writable: true });
  }

  /** Celle piene come maschera di bit [lo, hi] (vedi bitsFor); calcolata alla prima richiesta. */
  get fullBits() {
    if (!this._bits) {
      const occ = this.occupancy;
      const { side } = bitsFor(this.radius, this.coords);
      let lo = 0;
      let hi = 0;
      this.coords.forEach(([q, r], i) => {
        if (occ[(q + this.radius) * side + r + this.radius] === 1) {
          if (i < 32) lo |= 1 << i;
          else hi |= 1 << (i - 32);
        }
      });
      this._bits = [lo, hi];
    }
    return this._bits;
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
        lines.push({
          id: `${axis.id}${v}`,
          axis: axis.id,
          value: v,
          cells: members,
        });
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
    return a < 0 || b < 0 || a >= side || b >= side
      ? -1
      : this.occupancy[a * side + b];
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
    const R = this.radius;
    const side = 2 * R + 1;
    const occ = this.occupancy;
    for (const [dq, dr] of piece) {
      const a = q + dq + R;
      const b = r + dr + R;
      if (a < 0 || b < 0 || a >= side || b >= side || occ[a * side + b] !== 0)
        return false;
    }
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
    for (const [dq, dr] of piece)
      occ[(q + dq + this.radius) * side + r + dr + this.radius] = color ? 1 : 0;
    next._occ = occ;
    // Nella ricerca le maschere sono già disponibili: aggiorna solo le celle toccate.
    if (this._bits && this.coords.length <= 64) {
      let [lo, hi] = this._bits;
      for (const [dq, dr] of piece) {
        const bit = this.bitOf(q + dq, r + dr);
        if (bit < 32) lo = color ? lo | (1 << bit) : lo & ~(1 << bit);
        else hi = color ? hi | (1 << (bit - 32)) : hi & ~(1 << (bit - 32));
      }
      next._bits = [lo, hi];
    }
    return next;
  }

  /** Le linee completamente piene, in tutte e tre le direzioni. */
  fullLines() {
    if (this.coords.length <= 64) {
      const [lo, hi] = this.fullBits;
      const { lineLo, lineHi } = gridMasks(this);
      const out = [];
      for (let i = 0; i < this.lines.length; i++) {
        if ((lo & lineLo[i]) === lineLo[i] && (hi & lineHi[i]) === lineHi[i])
          out.push(this.lines[i]);
      }
      return out;
    }
    return this.lines.filter((l) =>
      l.cells.every((k) => this.cells.get(k) !== 0),
    );
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
    if (this._bits && this.coords.length <= 64) {
      let [lo, hi] = this._bits;
      for (const l of lines) {
        for (const k of l.cells) {
          const bit = this.bitOf(...parseKey(k));
          if (bit < 32) lo &= ~(1 << bit);
          else hi &= ~(1 << (bit - 32));
        }
      }
      next._bits = [lo, hi];
    }
    return next;
  }

  /** Tutte le posizioni d'origine in cui il pezzo entra. */
  placementsFor(piece) {
    const { origins, lo, hi } = placementsOf(this, piece);
    const [fl, fh] = this.fullBits;
    const out = [];
    for (let i = 0; i < origins.length; i++)
      if ((lo[i] & fl) === 0 && (hi[i] & fh) === 0) out.push(origins[i]);
    return out;
  }

  /** Come placementsFor, ma restituisce le maschere [lo, hi] delle celle coperte. */
  placementMasksFor(piece) {
    const { lo, hi } = placementsOf(this, piece);
    const [fl, fh] = this.fullBits;
    const out = [];
    for (let i = 0; i < lo.length; i++)
      if ((lo[i] & fl) === 0 && (hi[i] & fh) === 0) out.push(lo[i], hi[i]);
    return out;
  }

  /** Quante posizioni ha il pezzo, contando al massimo fino a `max`. */
  countPlacements(piece, max = Infinity) {
    const { lo, hi } = placementsOf(this, piece);
    const [fl, fh] = this.fullBits;
    let n = 0;
    for (let i = 0; i < lo.length; i++)
      if ((lo[i] & fl) === 0 && (hi[i] & fh) === 0 && ++n >= max) break;
    return n;
  }

  /** Celle vuote come maschera di bit [lo, hi]. */
  get emptyBits() {
    const [fl, fh] = this.fullBits;
    const { allLo, allHi } = gridMasks(this);
    return [allLo & ~fl, allHi & ~fh];
  }

  /** Numero di cella (0–60) usato nelle maschere di bit. */
  bitOf(q, r) {
    const R = this.radius;
    const { side, bitOf } = bitsFor(R, this.coords);
    return bitOf[(q + R) * side + r + R];
  }

  fits(piece) {
    const { lo, hi } = placementsOf(this, piece);
    const [fl, fh] = this.fullBits;
    for (let i = 0; i < lo.length; i++)
      if ((lo[i] & fl) === 0 && (hi[i] & fh) === 0) return true;
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
    return {
      placed,
      grid: lines.length ? placed.clear(lines) : placed,
      lines,
      clearedCells,
    };
  }
}

/** Numero di bit a 1 in un intero da 32 bit. */
export function popcount(x) {
  x -= (x >>> 1) & 0x55555555;
  x = (x & 0x33333333) + ((x >>> 2) & 0x33333333);
  return (((x + (x >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
}

/**
 * Maschere fisse del tabellone, calcolate una volta per raggio:
 * - lineLo/lineHi: le celle di ogni linea, nello stesso ordine di grid.lines;
 * - nbLo/nbHi: i vicini di ogni cella, nell'ordine di grid.coords;
 * - allLo/allHi: tutte le celle.
 */
const maskCache = new Map();
export function gridMasks(grid) {
  let m = maskCache.get(grid.radius);
  if (!m) {
    const n = grid.coords.length;
    const set = (pair, bit) => {
      if (bit < 32) pair[0] |= 1 << bit;
      else pair[1] |= 1 << (bit - 32);
    };
    const lineLo = new Int32Array(grid.lines.length);
    const lineHi = new Int32Array(grid.lines.length);
    grid.lines.forEach((l, i) => {
      const pair = [0, 0];
      for (const k of l.cells) set(pair, grid.bitOf(...parseKey(k)));
      lineLo[i] = pair[0];
      lineHi[i] = pair[1];
    });
    const nbLo = new Int32Array(n);
    const nbHi = new Int32Array(n);
    grid.coords.forEach(([q, r], i) => {
      const pair = [0, 0];
      for (const [dq, dr] of DIRECTIONS)
        if (grid.has(q + dq, r + dr)) set(pair, grid.bitOf(q + dq, r + dr));
      nbLo[i] = pair[0];
      nbHi[i] = pair[1];
    });
    const all = [0, 0];
    for (let i = 0; i < n; i++) set(all, i);
    m = { lineLo, lineHi, nbLo, nbHi, allLo: all[0], allHi: all[1] };
    maskCache.set(grid.radius, m);
  }
  return m;
}

/**
 * Numero di ogni cella in ordine di lettura: righe dall'alto in basso (r crescente),
 * nella riga da sinistra a destra (q crescente). Con raggio 4: da 1 a 61.
 * Restituisce una Map "q,r" -> numero (calcolata una volta per raggio).
 */
const numberCache = new Map();
export function cellNumbers(radius) {
  if (!numberCache.has(radius)) {
    const keys = [...new HexGrid(radius).cells.keys()].sort((a, b) => {
      const [qa, ra] = parseKey(a);
      const [qb, rb] = parseKey(b);
      return ra - rb || qa - qb;
    });
    numberCache.set(radius, new Map(keys.map((k, i) => [k, i + 1])));
  }
  return numberCache.get(radius);
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
    pts.push(
      `${(cx + size * Math.cos(a)).toFixed(2)},${(cy + size * Math.sin(a)).toFixed(2)}`,
    );
  }
  return pts.join(" ");
}
