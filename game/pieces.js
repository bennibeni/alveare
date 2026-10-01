/**
 * Pezzi del puzzle: poliesagoni da 1 a 4 celle, in offset assiali [dq, dr].
 * Ogni forma base viene ruotata nei 6 orientamenti; le rotazioni identiche
 * (es. il punto, o la barra girata di mezzo giro) vengono scartate: 25 pezzi in tutto.
 */

// Forme rimaste dopo la selezione: tutte compaiono in ogni loro rotazione distinta.
// Colori: punto e barra verdi, rombo azzurro, ferro di cavallo giallo, bandiera destra rosa, sinistra arancione.
const BASE_SHAPES = [
  { name: "punto", color: 9, weight: 0.6, cells: [[0, 0]] },
  { name: "barra 4", color: 9, weight: 1, cells: [[0, 0], [1, 0], [2, 0], [3, 0]] },
  { name: "rombo", color: 2, weight: 1, cells: [[0, 0], [1, 0], [0, 1], [1, 1]] },
  { name: "ferro di cavallo", color: 7, weight: 1, cells: [[0, 0], [1, 0], [1, 1], [0, 2]] },
  // Bandiera: 3 celle allineate + una quarta adiacente a due di esse (l'ultima e la penultima).
  // È chirale, quindi forma due classi di simmetria distinte (una è lo specchio dell'altra),
  // ciascuna con 6 rotazioni. Le due classi si dividono il peso di una forma.
  { name: "bandiera destra", color: 4, weight: 0.5, cells: [[0, 0], [1, 0], [2, 0], [2, -1]] },
  { name: "bandiera sinistra", color: 10, weight: 0.5, cells: [[0, 0], [-1, 1], [-2, 2], [0, 1]] },
];

export const PIECE_COLORS = [
  null,
  "#f59e0b", // 1 ambra
  "#38bdf8", // 2 azzurro
  "#34d399", // 3 smeraldo
  "#f472b6", // 4 rosa
  "#a78bfa", // 5 viola
  "#fb7185", // 6 corallo
  "#facc15", // 7 giallo
  "#60a5fa", // 8 blu
  "#4ade80", // 9 verde
  "#fb923c", // 10 arancio
  "#2dd4bf", // 11 turchese
];

/** Rotazione di 60° in senso orario (schermo con y verso il basso). */
export function rotate(cells) {
  return normalize(cells.map(([q, r]) => [-r, q + r]));
}

/** Trasla in modo che la prima cella (ordinata per r, poi q) sia l'origine. */
export function normalize(cells) {
  const sorted = [...cells].sort((a, b) => a[1] - b[1] || a[0] - b[0]);
  const [oq, or] = sorted[0];
  return sorted.map(([q, r]) => [q - oq + 0, r - or + 0]);
}

const sig = (cells) => normalize(cells).map((c) => c.join(",")).join(";");

export function rotations(cells) {
  const out = [];
  const seen = new Set();
  let cur = normalize(cells);
  for (let i = 0; i < 6; i++) {
    const s = sig(cur);
    if (!seen.has(s)) {
      seen.add(s);
      out.push(cur);
    }
    cur = rotate(cur);
  }
  return out;
}

/** Catalogo di tutti i pezzi orientati (numerati da 1, nell'ordine delle forme). */
export const PIECES = BASE_SHAPES.flatMap((shape) => {
  const rots = rotations(shape.cells);
  return rots.map((cells, i) => ({
    id: `${shape.name}-${i}`,
    name: shape.name,
    color: shape.color,
    // il peso della forma è diviso fra le sue rotazioni
    weight: shape.weight / rots.length,
    cells,
  }));
}).map((p, i) => ({ ...p, num: i + 1 }));

/** Le forme base con i loro pezzi orientati, per il catalogo. */
export const SHAPES = BASE_SHAPES.map((shape) => ({
  name: shape.name,
  color: shape.color,
  pieces: PIECES.filter((p) => p.name === shape.name),
}));

const TOTAL_WEIGHT = PIECES.reduce((a, p) => a + p.weight, 0);

/**
 * Generatore pseudo-casuale con seme (mulberry32): stessa sequenza di pezzi a ogni
 * esecuzione. Serve a simulazioni e test, per confrontare strategie sugli stessi pezzi.
 */
export function seededRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randomPiece(rng = Math.random) {
  let x = rng() * TOTAL_WEIGHT;
  for (const p of PIECES) {
    x -= p.weight;
    if (x <= 0) return p;
  }
  return PIECES[PIECES.length - 1];
}

/**
 * Nuovo vassoio di 3 pezzi. Se `grid` è fornito, prova (fino a 20 volte) a
 * garantire che almeno un pezzo entri: la partita finisce per le scelte del
 * giocatore, non per sfortuna al sorteggio.
 */
export function randomTray(grid = null, rng = Math.random) {
  let tray = null;
  for (let attempt = 0; attempt < 20; attempt++) {
    tray = [randomPiece(rng), randomPiece(rng), randomPiece(rng)];
    if (!grid || tray.some((p) => grid.fits(p.cells))) break;
  }
  return tray;
}

/** Centro geometrico di un pezzo in coordinate assiali frazionarie. */
export function pieceCentroid(cells) {
  const n = cells.length;
  return [cells.reduce((a, c) => a + c[0], 0) / n, cells.reduce((a, c) => a + c[1], 0) / n];
}

/**
 * Sostituisce il pezzo usato (posto `idx`) con uno nuovo. Come per il vassoio
 * iniziale, prova (fino a 20 volte) a far sì che almeno uno dei tre pezzi entri.
 */
export function replacePiece(tray, idx, grid = null, rng = Math.random) {
  let next = tray;
  for (let attempt = 0; attempt < 20; attempt++) {
    next = tray.map((p, i) => (i === idx ? randomPiece(rng) : p));
    if (!grid || next.some((p) => p && grid.fits(p.cells))) break;
  }
  return next;
}

/** Modalità Esperto (coda FIFO): il primo pezzo esce, gli altri scorrono, uno nuovo entra in fondo. */
export function shiftQueue(tray, rng = Math.random) {
  return [tray[1], tray[2], randomPiece(rng)];
}
