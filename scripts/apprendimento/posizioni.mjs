#!/usr/bin/env node
/**
 * Autoapprendimento, passo 1: posizioni affollate (al massimo --maxfree celle libere, default 34;
 * una mossa ogni --ogni, default 2)
 * dalle partite della strategia attuale (game/strategy.js).
 *   node scripts/apprendimento/posizioni.mjs --games 80 --seed 120000 --out posizioni.json
 */
import fs from "node:fs";
import os from "node:os";
import { Worker, isMainThread, parentPort } from "node:worker_threads";
import HexGrid from "../../game/HexGrid.js";
import { randomTray, replacePiece, seededRandom } from "../../game/pieces.js";
import { bestMove } from "../../game/strategy.js";

const free = (g) => [...g.cells.values()].filter((v) => !v).length;

function game(seed, max, maxFree, every) {
  const rng = seededRandom(seed);
  let g = new HexGrid(4);
  let t = randomTray(rng);
  let s = 0;
  const out = [];
  for (let i = 0; i < max; i++) {
    if (free(g) <= maxFree && i % every === 0)
      out.push({
        seed,
        piece: i,
        cells: [...g.cells].filter(([, v]) => v).map(([k]) => k),
        tray: t.map((p) => p.id),
        streak: s,
      });
    const m = bestMove(g, t, s);
    if (!m) break;
    const r = g.play(t[m.idx].cells, m.q, m.r);
    s = r.lines.length ? s + 1 : 0;
    g = r.grid;
    t = replacePiece(t, m.idx, rng);
  }
  return out;
}

if (!isMainThread) {
  parentPort.on("message", ({ seed, max, maxFree, every }) =>
    seed === null
      ? process.exit(0)
      : parentPort.postMessage(game(seed, max, maxFree, every)),
  );
} else {
  const args = {};
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i += 2) args[argv[i].slice(2)] = argv[i + 1];
  const games = Number(args.games ?? 80);
  const seed0 = Number(args.seed ?? 120000);
  const max = Number(args.max ?? 1000);
  const out = args.out ?? "posizioni.json";
  const maxFree = Number(args.maxfree ?? 34);
  const every = Number(args.ogni ?? 2);
  const seeds = Array.from({ length: games }, (_, i) => seed0 + 97 * i);
  const n = Number(args.workers ?? os.cpus().length);
  let next = 0;
  let alive = n;
  const all = [];
  for (let w = 0; w < n; w++) {
    const wk = new Worker(new URL(import.meta.url));
    const feed = () =>
      wk.postMessage({
        seed: next < seeds.length ? seeds[next++] : null,
        max,
        maxFree,
        every,
      });
    wk.on("message", (rows) => {
      all.push(...rows);
      feed();
    });
    wk.on("exit", () => {
      if (--alive) return;
      fs.writeFileSync(out, JSON.stringify(all));
      console.log(`${all.length} posizioni da ${games} partite -> ${out}`);
    });
    feed();
  }
}
