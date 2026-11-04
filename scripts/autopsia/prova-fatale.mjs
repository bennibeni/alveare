#!/usr/bin/env node
/**
 * Passo 3: al passo fatale, la mossa della strategia contro le mosse che l'oracolo indica come
 * salvezza, giudicate SENZA conoscere il futuro: M futuri a caso (gli stessi per tutte le mosse),
 * poi si continua con la strategia fino a 40 celle libere o al blocco (al massimo 40 mosse).
 * Se una mossa salva perde molti meno futuri, è un errore della strategia; se no era fortuna.
 *
 *   node scripts/autopsia/prova-fatale.mjs --in trappole.json --autopsia autopsia.json --m 60 --out fatali.json
 */
import fs from "node:fs";
import os from "node:os";
import { Worker, isMainThread, parentPort } from "node:worker_threads";
import { parseArgs } from "./args.mjs";
import { loadTraps } from "./dati.mjs";

if (!isMainThread) {
  const { P, bestMove, freeCells, applyMove, stateFrom } =
    await import("./motore.mjs");
  parentPort.on("message", (job) => {
    if (!job) process.exit(0);
    const { trap, aut, M } = job;
    let s = stateFrom(trap.start);
    const br = P.seededRandom(trap.bseed);
    for (let i = 0; i < aut.fatal; i++) {
      const [x, q, r] = trap.moves[i];
      s = applyMove(s, x, q, r, br);
    }
    const played = trap.moves[aut.fatal];
    const same = (m) =>
      m[0] === played[0] && m[1] === played[1] && m[2] === played[2];
    const cands = [played, ...aut.info.savingMoves.filter((m) => !same(m))];
    const res = cands.map((c, ci) => {
      let lost = 0;
      for (let k = 0; k < M; k++) {
        const rng = P.seededRandom((trap.bseed * 7 + 1000003 * (k + 1)) >>> 0);
        let b = applyMove(s, c[0], c[1], c[2], rng);
        for (let i = 0; i < 40; i++) {
          if (freeCells(b.grid) >= 40) break;
          const m = bestMove(b.grid, b.tray, b.streak);
          if (!m) {
            lost++;
            break;
          }
          b = applyMove(b, m.idx, m.q, m.r, rng);
        }
      }
      return { move: c, piece: s.tray[c[0]].id, strategy: ci === 0, lost, M };
    });
    parentPort.postMessage({
      seed: trap.seed,
      bseed: trap.bseed,
      fatal: aut.fatal,
      free: freeCells(s.grid),
      tray: s.tray.map((p) => p.id),
      res,
    });
  });
} else {
  const a = parseArgs({
    in: "trappole.json",
    autopsia: "autopsia.json",
    m: 60,
    out: "fatali.json",
    workers: os.cpus().length,
  });
  const { traps } = loadTraps(a.in);
  const auts = JSON.parse(fs.readFileSync(a.autopsia, "utf8"));
  const jobs = auts
    .filter((x) => x.fatal >= 0)
    .map((x) => ({
      trap: traps.find((t) => t.bseed === x.bseed),
      aut: x,
      M: a.m,
    }));
  const results = [];
  await new Promise((done) => {
    let active = 0;
    for (let w = 0; w < a.workers; w++) {
      const wk = new Worker(new URL(import.meta.url));
      active++;
      const next = () => wk.postMessage(jobs.shift() || null);
      wk.on("message", (r) => {
        results.push(r);
        const best = Math.min(...r.res.map((x) => x.lost));
        console.log(
          `${r.free} celle libere: strategia ${r.res[0].lost}/${r.res[0].M}, migliore mossa salva ${Math.min(...r.res.slice(1).map((x) => x.lost), Infinity)}/${r.res[0].M}${best <= r.res[0].lost - 8 ? "  <- errore probabile" : ""}`,
        );
        fs.writeFileSync(a.out, JSON.stringify(results, null, 1));
        next();
      });
      wk.on("exit", () => {
        if (--active === 0) done();
      });
      next();
    }
  });
}
