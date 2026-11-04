#!/usr/bin/env node
/**
 * Passo 1 dell'autopsia: gioca le partite con lo sdoppiamento (come pericolo.mjs) e salva ogni
 * copia che si blocca, con tutto il necessario per rigiocarla: posizione d'ingresso in pericolo,
 * seme dei pezzi della copia (bseed) e mosse giocate.
 *
 *   node scripts/autopsia/raccogli.mjs --games 400 --seed 100000 --k 8 --out trappole.json
 *
 * Opzioni: --games (20) --seed (100000; poi +97) --k copie per ingresso (8) --max pezzi (1000)
 *          --workers (core) --out (trappole.json). GAME=cartella per una strategia modificata.
 * Semi delle copie identici a pericolo.mjs; 400 partite richiedono circa 70 minuti su 2 core.
 */
import fs from "node:fs";
import os from "node:os";
import { Worker, isMainThread, parentPort } from "node:worker_threads";
import { parseArgs } from "./args.mjs";

if (!isMainThread) {
  const { HexGrid, P, bestMove, freeCells, applyMove } =
    await import("./motore.mjs");
  const snap = (s) => ({
    cells: [...s.grid.cells].filter(([, v]) => v).map(([k]) => k),
    tray: s.tray.map((p) => p.id),
    streak: s.streak,
  });
  parentPort.on("message", (job) => {
    if (!job) process.exit(0);
    const { seed, K, max } = job;
    const rng = P.seededRandom(seed);
    let s = { grid: new HexGrid(4), tray: P.randomTray(rng), streak: 0 };
    let inDanger = false;
    let entries = 0;
    let copies = 0;
    let pieces = 0;
    let lost = false;
    const traps = [];
    for (; pieces < max; pieces++) {
      const f = freeCells(s.grid);
      if (f >= 40) inDanger = false;
      if (!inDanger && f < 32) {
        inDanger = true;
        for (let k = 0; k < K; k++) {
          const bseed = (seed * 100003 + entries * 101 + k + 1) >>> 0;
          const br = P.seededRandom(bseed);
          let b = s;
          const moves = [];
          let blocked = false;
          for (let i = 0; i < 200; i++) {
            const m = bestMove(b.grid, b.tray, b.streak);
            if (!m) {
              blocked = true;
              break;
            }
            moves.push([m.idx, m.q, m.r]);
            b = applyMove(b, m.idx, m.q, m.r, br);
            if (freeCells(b.grid) >= 40) break;
          }
          copies++;
          if (blocked)
            traps.push({
              seed,
              pezzo: pieces,
              libere: f,
              k,
              bseed,
              start: snap(s),
              moves,
            });
        }
        entries++;
      }
      const m = bestMove(s.grid, s.tray, s.streak);
      if (!m) {
        lost = true;
        break;
      }
      s = applyMove(s, m.idx, m.q, m.r, rng);
    }
    parentPort.postMessage({ seed, pieces, lost, entries, copies, traps });
  });
} else {
  const a = parseArgs({
    games: 20,
    seed: 100000,
    k: 8,
    max: 1000,
    workers: os.cpus().length,
    out: "trappole.json",
  });
  const seeds = Array.from({ length: a.games }, (_, i) => a.seed + i * 97);
  const results = [];
  const t0 = Date.now();
  await new Promise((done) => {
    let active = 0;
    for (let w = 0; w < a.workers; w++) {
      const wk = new Worker(new URL(import.meta.url));
      active++;
      const next = () =>
        wk.postMessage(
          seeds.length ? { seed: seeds.shift(), K: a.k, max: a.max } : null,
        );
      wk.on("message", (r) => {
        results.push(r);
        const T = results.reduce((s, x) => s + x.traps.length, 0);
        console.log(
          `${results.length}/${a.games}  seme ${r.seed}  pezzi ${r.pieces}  ingressi ${r.entries}  bloccate ${r.traps.length} (totale ${T})  ${((Date.now() - t0) / 1000).toFixed(0)} s`,
        );
        results.sort((x, y) => x.seed - y.seed);
        fs.writeFileSync(
          a.out,
          JSON.stringify({ k: a.k, max: a.max, games: results }),
        );
        next();
      });
      wk.on("exit", () => {
        if (--active === 0) done();
      });
      next();
    }
  });
  let p = 0,
    e = 0,
    c = 0,
    t = 0,
    l = 0;
  for (const g of results) {
    p += g.pieces;
    e += g.entries;
    c += g.copies;
    t += g.traps.length;
    l += g.lost ? 1 : 0;
  }
  console.log(
    `\npezzi ${p}  ingressi ${e}  copie ${c}  bloccate ${t}  partite perse ${l}`,
  );
  console.log(
    `tasso ${(((1000 * e) / p) * (t / c)).toFixed(4)} sconfitte ogni 1000 pezzi`,
  );
}
