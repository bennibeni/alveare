/**
 * Rischio imparato (autoapprendimento): probabilità che un tabellone porti al blocco.
 *
 * features(g) misura il tabellone (21 misure in scala, valori tipici 0..1, tutte con le maschere di
 * bit di HexGrid); learnedRisk(g) è una regressione logistica su 19 di queste misure. I coefficienti
 * (LEARNED_MODEL) sono stati imparati così (vedi scripts/apprendimento):
 * 1. posizioni affollate (al massimo 34 celle libere) dalle partite della strategia, più i tabelloni
 *    dopo 5 mosse legali a caso da ciascuna (anche tabelloni rovinati da mosse cattive);
 * 2. per ogni tabellone 16 futuri con un vassoio nuovo a caso, giocati da un giocatore veloce (una
 *    mossa, voto con i pesi della strategia), finché torna a 46 celle libere o si blocca;
 * 3. regressione logistica: misure -> frazione di futuri bloccati.
 * Prima versione: 10.684 tabelloni, 170.944 futuri.
 */
import { gridMasks, popcount } from "./HexGrid.js";
import { PIECES, SHAPES } from "./pieces.js";

export const FEATURES = [
  "linee", // linee svuotate dalla mossa / 3
  "punti", // punti della mossa / 50
  "vuote", // celle vuote / 61
  "buchi1", // celle vuote con 1 solo vicino libero / 10
  "buchi0", // celle vuote con 0 vicini liberi / 5
  "morte", // celle vuote che nessun pezzo da 4 copre / 10
  "quasi1", // linee a cui manca 1 cella / 5
  "quasi2", // linee a cui mancano 2 celle / 5
  "quasi3", // linee a cui mancano 3 celle / 5
  "entrano", // pezzi del catalogo che entrano / 25
  "nonEntra", // probabilità che il pezzo estratto non entri
  "barra", // spazio per forma: media pesata di min(posizioni,6)/6
  "rombo",
  "ferro",
  "bandieraD",
  "bandieraS",
  "zone", // zone vuote separate / 5
  "zona1", // zone da 1, 2, 3 celle / 3
  "zona2",
  "zona3",
  "chiudibili", // linee chiudibili attese con un pezzo a caso
  // copertura di una cella vuota: probabilità che un pezzo da 4 estratto a caso abbia una posizione
  // libera che la copre; «bassa» = sotto il 15% (di solito solo la barra parallela a un lato)
  "bassaBordo", // celle vuote sul bordo con copertura bassa (ma non morte) / 10
  "bassaInterno", // celle vuote interne con copertura bassa (ma non morte) / 10
];
export const N_FEATURES = FEATURES.length;

const W_TOTAL = PIECES.reduce((a, p) => a + p.weight, 0);
const SHAPE_INDEX = new Map([
  ["barra 4", 11],
  ["rombo", 12],
  ["ferro di cavallo", 13],
  ["bandiera destra", 14],
  ["bandiera sinistra", 15],
]);
const SHAPE_W = new Map(
  SHAPES.map((s) => [s.name, s.pieces.reduce((a, p) => a + p.weight, 0)]),
);
const PIECE_SHAPE = PIECES.map(
  (p) => SHAPES.find((s) => s.pieces.some((q) => q.id === p.id)).name,
);

const bit = (lo, hi, i) => (i < 32 ? (lo >>> i) & 1 : (hi >>> (i - 32)) & 1);
const LOW_COVER = 0.15;

export function features(g, lines = 0, gain = 0) {
  const f = new Float64Array(N_FEATURES);
  const { lineLo, lineHi, nbLo, nbHi } = gridMasks(g);
  const [el, eh] = g.emptyBits;
  const n = nbLo.length;
  const empty = popcount(el) + popcount(eh);
  f[0] = lines / 3;
  f[1] = gain / 50;
  f[2] = empty / 61;
  let h1 = 0;
  let h0 = 0;
  for (let i = 0; i < n; i++) {
    if (!bit(el, eh, i)) continue;
    const fr = popcount(nbLo[i] & el) + popcount(nbHi[i] & eh);
    if (fr === 0) h0++;
    else if (fr === 1) h1++;
  }
  f[3] = h1 / 10;
  f[4] = h0 / 5;
  // posti di ogni pezzo, celle coperte dai pezzi da 4, linee chiudibili
  let cl = 0;
  let ch = 0;
  let fit = 0;
  let death = 0;
  const missLo = [];
  const missHi = [];
  let q1 = 0;
  let q2 = 0;
  let q3 = 0;
  for (let L = 0; L < lineLo.length; L++) {
    const ml = lineLo[L] & el;
    const mh = lineHi[L] & eh;
    const miss = popcount(ml) + popcount(mh);
    if (miss === 1) q1++;
    else if (miss === 2) q2++;
    else if (miss === 3) q3++;
    if (miss >= 1 && miss <= 3) {
      missLo.push(ml);
      missHi.push(mh);
    }
  }
  f[6] = q1 / 5;
  f[7] = q2 / 5;
  f[8] = q3 / 5;
  let closable = 0;
  const cover = new Float64Array(n);
  for (let k = 0; k < PIECES.length; k++) {
    const p = PIECES[k];
    const m = g.placementMasksFor(p.cells);
    const c = m.length / 2;
    if (c) fit++;
    else death += p.weight;
    const si = SHAPE_INDEX.get(PIECE_SHAPE[k]);
    if (si !== undefined)
      f[si] += (p.weight * Math.min(6, c)) / 6 / SHAPE_W.get(PIECE_SHAPE[k]);
    if (p.cells.length === 4) {
      let pl = 0;
      let ph = 0;
      for (let j = 0; j < m.length; j += 2) {
        pl |= m[j];
        ph |= m[j + 1];
      }
      cl |= pl;
      ch |= ph;
      const w = p.weight / W_TOTAL;
      for (let i = 0; i < n; i++) if (bit(pl, ph, i)) cover[i] += w;
    }
    if (missLo.length && c) {
      let closed = 0;
      for (let li = 0; li < missLo.length; li++)
        for (let j = 0; j < m.length; j += 2)
          if ((missLo[li] & ~m[j]) === 0 && (missHi[li] & ~m[j + 1]) === 0) {
            closed++;
            break;
          }
      closable += (p.weight / W_TOTAL) * closed;
    }
  }
  f[5] = (popcount(el & ~cl) + popcount(eh & ~ch)) / 10;
  f[9] = fit / 25;
  f[10] = death / W_TOTAL;
  f[20] = closable;
  let lowBorder = 0;
  let lowInner = 0;
  for (let i = 0; i < n; i++) {
    if (!bit(el, eh, i) || cover[i] === 0 || cover[i] >= LOW_COVER) continue;
    if (popcount(nbLo[i]) + popcount(nbHi[i]) < 6) lowBorder++;
    else lowInner++;
  }
  f[21] = lowBorder / 10;
  f[22] = lowInner / 10;
  // zone vuote: riempimento per maschere
  let rl = el;
  let rh = eh;
  let zones = 0;
  let z1 = 0;
  let z2 = 0;
  let z3 = 0;
  while (rl || rh) {
    const start = rl
      ? 31 - Math.clz32(rl & -rl)
      : 32 + 31 - Math.clz32(rh & -rh);
    let zl = start < 32 ? 1 << start : 0;
    let zh = start < 32 ? 0 : 1 << (start - 32);
    for (;;) {
      let nl = zl;
      let nh = zh;
      for (let i = 0; i < n; i++)
        if (bit(zl, zh, i)) {
          nl |= nbLo[i];
          nh |= nbHi[i];
        }
      nl &= el;
      nh &= eh;
      if (nl === zl && nh === zh) break;
      zl = nl;
      zh = nh;
    }
    const size = popcount(zl) + popcount(zh);
    zones++;
    if (size === 1) z1++;
    else if (size === 2) z2++;
    else if (size === 3) z3++;
    rl &= ~zl;
    rh &= ~zh;
  }
  f[16] = zones / 5;
  f[17] = z1 / 3;
  f[18] = z2 / 3;
  f[19] = z3 / 3;
  return f;
}

/** Coefficienti imparati: z = b + Σ c[j] · features[use[j]], rischio = 1 / (1 + e^−z). */
export const LEARNED_MODEL = {
  b: 1.237623,
  use: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20],
  c: [
    -6.090611, // vuote
    0.478551, // buchi1
    0.111958, // buchi0
    0.793073, // morte
    0.325284, // quasi1
    -0.082846, // quasi2
    -0.033149, // quasi3
    1.199097, // entrano
    1.820801, // nonEntra
    -0.549568, // barra
    -0.483708, // rombo
    -0.955005, // ferro
    0.482877, // bandieraD
    0.144229, // bandieraS
    -0.176542, // zone
    0.186583, // zona1
    -0.294449, // zona2
    -0.509938, // zona3
    -1.316155, // chiudibili
  ],
};

/** Probabilità imparata che il tabellone porti al blocco (0..1). */
export function learnedRisk(g, model = LEARNED_MODEL) {
  const f = features(g);
  let z = model.b;
  for (let j = 0; j < model.use.length; j++) z += model.c[j] * f[model.use[j]];
  return 1 / (1 + Math.exp(-z));
}
