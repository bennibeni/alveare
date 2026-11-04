#!/usr/bin/env node
/**
 * Misura lo schema decisionale "Riassunto visivo del flusso decisionale" come giocatore
 * automatico, sugli stessi semi della strategia del gioco.
 *
 *   node scripts/albero.mjs --games 200 --seed 7000
 *   node scripts/albero.mjs --games 200 --strategie originale,rivisto,caso
 *
 * Strategie:
 *   originale  lo schema così com'è (interpretazioni sotto)
 *   rivisto    lo schema rivisto: prima il vassoio, poi linee, poi bordo corto, poi linee lunghe
 *   caso       mossa legale a caso (riferimento in basso)
 *   gioco      bestMove del gioco (riferimento in alto, lento: ~6 ms per mossa)
 *   vassoio    solo il controllo "gli altri due pezzi entrano ancora", poi una mossa qualsiasi
 *   originale+vassoio  lo schema originale quando la sua mossa lascia entrare gli altri pezzi, altrimenti il rivisto
 *
 * Interpretazioni dello schema originale (dove il testo è ambiguo):
 *   - "pezzo difficile" = il pezzo del vassoio con meno posizioni possibili; lo schema
 *     si applica a ogni mossa a quel pezzo;
 *   - "linee da 9 del centro" = le 3 linee che passano per il centro; "libera" = tutta vuota;
 *   - "vertici esterni" = i 6 vertici del grande esagono: si sceglie una posizione che ne copra uno;
 *   - "completare una combo in questo turno" = la mossa svuota almeno una linea;
 *   - "bordo esterno da 5 celle" = le 6 linee di bordo; si sceglie la posizione con più celle sul bordo;
 *   - "piazza il pezzo al centro e attiva la combo" = fra le mosse che svuotano linee, la più vicina al centro.
 */
import HexGrid from "../game/HexGrid.js";
import { bestMove } from "../game/strategy.js";
import { playGame, seedFor, summarize } from "./sim-lib.mjs";

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith("--") ? [...acc, [a.slice(2), all[i + 1]]] : acc), []),
);
const games = Number(args.games ?? 100);
const maxMoves = Number(args.max ?? 1000);
const seed = Number(args.seed ?? 7000);
const which = (args.strategie ?? "caso,originale,rivisto").split(",");

const R = 4;
const ring = (q, r) => Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r));
const CORNERS = new Set(["4,0", "-4,0", "0,4", "0,-4", "4,-4", "-4,4"]);
const LINES = new HexGrid(R).lines;
const LONG = LINES.filter((l) => l.cells.length === 9);
const isEmptyLine = (g, l) => l.cells.every((k) => g.cells.get(k) === 0);

/** Tutte le mosse legali: { idx, q, r, cells (chiavi coperte), res }. */
function moves(g, tray, onlyIdx = null) {
  const out = [];
  tray.forEach((p, idx) => {
    if (onlyIdx != null && idx !== onlyIdx) return;
    for (const [q, r] of g.placementsFor(p.cells)) {
      const cells = p.cells.map(([dq, dr]) => [q + dq, r + dr]);
      out.push({ idx, q, r, cells, res: g.play(p.cells, q, r) });
    }
  });
  return out;
}
const pick = (list, score) => list.reduce((b, m) => (score(m) > score(b) ? m : b), list[0]);

// ── Schema originale ──────────────────────────────────────────────
function originale(g, tray) {
  const counts = tray.map((p) => g.placementsFor(p.cells).length);
  const playable = counts.map((c, i) => [c, i]).filter(([c]) => c > 0);
  if (!playable.length) return null;
  const hard = playable.reduce((a, b) => (b[0] < a[0] ? b : a))[1]; // pezzo difficile
  const ms = moves(g, tray, hard);
  const freeLong = LONG.filter((l) => isEmptyLine(g, l)).length;
  const clearing = ms.filter((m) => m.res.lines.length > 0);
  const edgeCells = (m) => m.cells.filter(([q, r]) => ring(q, r) === R).length;
  if (freeLong < 2) {
    // parcheggio nei vertici esterni
    const corner = ms.filter((m) => m.cells.some(([q, r]) => CORNERS.has(`${q},${r}`)));
    const pool = corner.length ? corner : ms;
    return pick(pool, (m) => m.res.lines.length * 100 + edgeCells(m));
  }
  if (!clearing.length) return pick(ms, edgeCells); // parcheggio sul bordo da 5
  const dist = (m) => m.cells.reduce((s, [q, r]) => s + ring(q, r), 0) / m.cells.length;
  return pick(clearing, (m) => -dist(m)); // al centro, con la combo
}

// ── Schema rivisto ────────────────────────────────────────────────
function othersFit(m, tray) {
  return tray.every((p, i) => i === m.idx || m.res.grid.fits(p.cells));
}
function rivisto(g, tray) {
  const all = moves(g, tray);
  if (!all.length) return null;
  const safe = all.filter((m) => othersFit(m, tray));
  const pool = safe.length ? safe : all;
  const longCells = (m) => LONG.filter((l) => !isEmptyLine(m.res.grid, l)).length;
  const clearing = pool.filter((m) => m.res.lines.length > 0);
  if (clearing.length) return pick(clearing, (m) => m.res.lines.length * 10 - longCells(m));
  const edge = pool.filter((m) => m.cells.every(([q, r]) => ring(q, r) === R && !CORNERS.has(`${q},${r}`)));
  if (edge.length) return pick(edge, (m) => -longCells(m));
  // dove lascia libere più linee lunghe (peso = lunghezza delle linee vuote)
  return pick(pool, (m) => LINES.reduce((s, l) => s + (isEmptyLine(m.res.grid, l) ? l.cells.length : 0), 0));
}

// ── Riferimenti ───────────────────────────────────────────────────
function casoFactory() {
  let s = 12345;
  const rnd = () => ((s = (s * 1103515245 + 12345) >>> 0) / 4294967296);
  return (g, tray) => {
    const all = [];
    tray.forEach((p, idx) => g.placementsFor(p.cells).forEach(([q, r]) => all.push({ idx, q, r })));
    return all.length ? all[Math.floor(rnd() * all.length)] : null;
  };
}

// Varianti per capire da dove viene la differenza.
function vassoioFactory() {
  const caso = casoFactory();
  return (g, tray) => {
    const safe = moves(g, tray).filter((m) => othersFit(m, tray));
    if (!safe.length) return caso(g, tray);
    return safe[Math.floor(Math.abs(Math.sin(safe.length * 9301 + g.cells.size)) * safe.length) % safe.length];
  };
}
function originaleVassoio(g, tray) {
  // lo schema originale, ma solo fra le mosse che lasciano entrare gli altri due pezzi
  const m = originale(g, tray);
  if (m && othersFit({ ...m, res: m.res ?? g.play(tray[m.idx].cells, m.q, m.r) }, tray)) return m;
  return rivisto(g, tray);
}

const STRATS = {
  originale,
  rivisto,
  caso: casoFactory(),
  gioco: bestMove,
  vassoio: vassoioFactory(),
  "originale+vassoio": originaleVassoio,
};
console.log(`Alveare · schema decisionale · ${games} partite · max ${maxMoves} pezzi · seme ${seed}\n`);
const out = {};
for (const name of which) {
  const t0 = Date.now();
  const results = [];
  for (let i = 0; i < games; i++) results.push(playGame({ seed: seedFor(seed, i), maxMoves, strategy: STRATS[name] }));
  const s = summarize(results);
  out[name] = { summary: s, results };
  console.log(
    `${name.padEnd(10)} perse ${String(s.lost).padStart(3)}/${s.games} · pezzi mediana ${String(s.median).padStart(4)} · media ${String(s.mean).padStart(6)} · 25–75% ${s.q25}–${s.q75} · punti/pezzo ${s.pointsPerPiece} · ${((Date.now() - t0) / 1000).toFixed(1)} s`,
  );
}
if (args.json) (await import("node:fs")).writeFileSync(args.json, JSON.stringify({ games, maxMoves, seed, out }, null, 2));
