/**
 * Oracolo chiaroveggente: conosce i pezzi futuri (la sequenza `seq`, un pezzo per mossa) e cerca
 * in profondità, con le mosse ordinate per celle libere dopo la mossa.
 *
 * makeOracle:   esiste una sequenza che riporta il tabellone ad almeno 40 celle libere entro
 *               `depth` mosse? (la stessa uscita dal pericolo dello sdoppiamento)
 * makeSurvival: esiste una sequenza che sopravvive `depth` mosse?
 *
 * Risponde true/false, o null se supera il budget di nodi. La memoria delle posizioni si azzera a
 * ogni chiamata: dipende dalla sequenza dei pezzi.
 */
import { PLACE, play, free } from "./motore.mjs";

export const SAFE = 40;

function moves(occ, tray) {
  const cand = [];
  const seen = new Set();
  for (let s = 0; s < 3; s++) {
    const p = tray[s];
    if (seen.has(p)) continue;
    seen.add(p);
    for (const [m] of PLACE[p])
      if ((m & occ) === 0n) {
        const [o2] = play(occ, m);
        cand.push([free(o2), o2, s]);
      }
  }
  return cand.sort((a, b) => b[0] - a[0]);
}
const keyOf = (occ, tray, d) =>
  occ.toString(36) + "|" + [...tray].sort((a, b) => a - b).join(",") + "|" + d;

export function makeOracle({ budget = 3e6, safe = SAFE } = {}) {
  let nodes = 0;
  const failMemo = new Map(); // posizione -> profondità a cui è già fallita
  function rec(occ, tray, seq, d, depth) {
    if (free(occ) >= safe) return true;
    if (depth === 0) return false;
    if (++nodes > budget) throw new Error("budget");
    const key = keyOf(occ, tray, d);
    const prev = failMemo.get(key);
    if (prev !== undefined && prev >= depth) return false;
    for (const [, o2, s] of moves(occ, tray)) {
      const t2 = tray.slice();
      t2[s] = seq[d];
      if (rec(o2, t2, seq, d + 1, depth - 1)) return true;
    }
    failMemo.set(key, depth);
    return false;
  }
  return {
    solve(occ, tray, seq, d, depth) {
      nodes = 0;
      failMemo.clear();
      try {
        return rec(occ, tray, seq, d, depth);
      } catch (e) {
        if (e.message === "budget") return null;
        throw e;
      }
    },
  };
}

export function makeSurvival({ budget = 2e6 } = {}) {
  let nodes = 0;
  const memo = new Map();
  function rec(occ, tray, seq, d, depth) {
    if (depth === 0) return true;
    if (++nodes > budget) throw new Error("budget");
    const key = keyOf(occ, tray, d);
    if (memo.has(key)) return memo.get(key);
    let ok = false;
    for (const [, o2, s] of moves(occ, tray)) {
      const t2 = tray.slice();
      t2[s] = seq[d];
      if (rec(o2, t2, seq, d + 1, depth - 1)) {
        ok = true;
        break;
      }
    }
    memo.set(key, ok);
    return ok;
  }
  return {
    solve(occ, tray, seq, d, depth) {
      nodes = 0;
      memo.clear();
      try {
        return rec(occ, tray, seq, d, depth);
      } catch (e) {
        if (e.message === "budget") return null;
        throw e;
      }
    },
  };
}
