#!/usr/bin/env node
/**
 * Autoapprendimento, passo 2: tabelloni etichettati con la frazione di futuri bloccati.
 *
 * Da ogni posizione: il tabellone stesso e quelli dopo MOSSE mosse legali a caso (così compaiono anche
 * tabelloni rovinati da mosse cattive). Per ogni tabellone K futuri con un vassoio nuovo a caso (il
 * rischio serve proprio dopo i pezzi noti), giocati dal giocatore veloce (giocatore.mjs) con il modello
 * dato, finché il tabellone torna ad almeno SAFE celle libere (salvo), si blocca, o passano HORIZON
 * mosse (salvo). Il modello di partenza è quello in uso (LEARNED_MODEL): ogni giro di apprendimento
 * usa il modello del giro precedente.
 *
 *   node scripts/apprendimento/valori.mjs --pos posizioni.json [--model modello.json] --k 16 --mosse 5 --out valori.jsonl
 */
import fs from "node:fs";
import os from "node:os";
import { Worker, isMainThread, parentPort, workerData } from "node:worker_threads";
import { randomTray, replacePiece, seededRandom } from "../../game/pieces.js";
import { features, LEARNED_MODEL } from "../../game/learnedRisk.js";
import { greedyMove, stateOf } from "./giocatore.mjs";

const SAFE = 46;
const HORIZON = 60;
const freeOf = (g) => {
  let n = 0;
  for (const v of g.cells.values()) if (!v) n++;
  return n;
};

function rollout(g, model, seed) {
  const rng = seededRandom(seed >>> 0);
  let tray = randomTray(rng);
  let streak = 0;
  for (let i = 0; i < HORIZON; i++) {
    if (freeOf(g) >= SAFE) return 0;
    const m = greedyMove(g, tray, streak, model);
    if (!m) return 1;
    streak = m.res.lines.length ? streak + 1 : 0;
    g = m.res.grid;
    tray = replacePiece(tray, m.idx, rng);
  }
  return 0;
}

function label(pos, pi, model, K, moves) {
  const { grid, tray } = stateOf(pos);
  const boards = [grid];
  const rng = seededRandom(pi * 7 + 1);
  const all = [];
  tray.forEach((p) =>
    grid
      .placementsFor(p.cells)
      .forEach(([q, r]) => all.push(grid.play(p.cells, q, r).grid)),
  );
  for (let k = 0; k < moves && all.length; k++)
    boards.push(all.splice(Math.floor(rng() * all.length), 1)[0]);
  return boards.map((g, bi) => {
    let lost = 0;
    for (let k = 0; k < K; k++)
      lost += rollout(g, model, pi * 100003 + bi * 1009 + k);
    return {
      f: [...features(g)].map((x) => +x.toFixed(5)),
      lost,
      K,
      free: freeOf(g),
      pi,
    };
  });
}

if (!isMainThread) {
  const positions = JSON.parse(fs.readFileSync(workerData.posFile, "utf8"));
  parentPort.on("message", (pi) => {
    if (pi === null) process.exit(0);
    parentPort.postMessage(
      label(positions[pi], pi, workerData.model, workerData.K, workerData.moves),
    );
  });
} else {
  const args = {};
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i += 2) args[argv[i].slice(2)] = argv[i + 1];
  const posFile = args.pos ?? "posizioni.json";
  const model = args.model
    ? JSON.parse(fs.readFileSync(args.model, "utf8"))
    : LEARNED_MODEL;
  const K = Number(args.k ?? 16);
  const moves = Number(args.mosse ?? 5);
  const out = args.out ?? "valori.jsonl";
  const positions = JSON.parse(fs.readFileSync(posFile, "utf8"));
  fs.writeFileSync(out, "");
  let next = 0;
  let done = 0;
  const t0 = Date.now();
  const n = Number(args.workers ?? os.cpus().length);
  for (let k = 0; k < n; k++) {
    const wk = new Worker(new URL(import.meta.url), {
      workerData: { posFile, model, K, moves },
    });
    const feed = () => wk.postMessage(next < positions.length ? next++ : null);
    wk.on("message", (rows) => {
      fs.appendFileSync(out, rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
      if (++done % 100 === 0 || done === positions.length)
        console.log(
          `${done}/${positions.length} posizioni · ${((Date.now() - t0) / 60000).toFixed(1)} min`,
        );
      feed();
    });
    feed();
  }
}
