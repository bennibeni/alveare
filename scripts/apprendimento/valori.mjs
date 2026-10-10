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
 * Con --tenuti H ogni tabellone si etichetta anche con 1..H pezzi noti ancora da giocare (presi dal
 * vassoio rimasto): i futuri partono con quei pezzi nel vassoio, e il modello impara quanto pesano.
 *
 *   node scripts/apprendimento/valori.mjs --pos posizioni.json [--model modello.json] --k 16 --mosse 5 [--tenuti 2] --out valori.jsonl
 */
import fs from "node:fs";
import os from "node:os";
import {
  Worker,
  isMainThread,
  parentPort,
  workerData,
} from "node:worker_threads";
import { randomTray, replacePiece, seededRandom } from "../../game/pieces.js";
import { features, LEARNED_MODEL } from "../../game/learnedRisk.js";
import { greedyMove, stateOf } from "./giocatore.mjs";

// salvo se torna ad almeno SAFE celle libere; altrimenti si gioca fino a HORIZON mosse (--safe 99:
// conta solo il blocco entro HORIZON mosse, utile anche per tabelloni poco affollati)
let SAFE = 46;
let HORIZON = 60;
const freeOf = (g) => {
  let n = 0;
  for (const v of g.cells.values()) if (!v) n++;
  return n;
};

function rollout(g, model, seed, held = []) {
  const rng = seededRandom(seed >>> 0);
  let tray = [...held, ...randomTray(rng).slice(held.length)];
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

// pezzi tenuti: per ogni tabellone si etichettano le varianti con 0..HELD pezzi noti ancora da
// giocare, presi dai pezzi del vassoio rimasti (il resto del vassoio arriva a caso)
let HELD = 0;

function label(pos, pi, model, K, moves) {
  const { grid, tray } = stateOf(pos);
  const boards = [{ g: grid, left: tray }];
  const rng = seededRandom(pi * 7 + 1);
  const all = [];
  tray.forEach((p, idx) =>
    grid.placementsFor(p.cells).forEach(([q, r]) =>
      all.push({
        g: grid.play(p.cells, q, r).grid,
        left: tray.filter((_, i) => i !== idx),
      }),
    ),
  );
  for (let k = 0; k < moves && all.length; k++)
    boards.push(all.splice(Math.floor(rng() * all.length), 1)[0]);
  const rows = [];
  boards.forEach(({ g, left }, bi) => {
    const pool = [...left].sort(() => rng() - 0.5);
    for (let h = 0; h <= Math.min(HELD, pool.length); h++) {
      const held = pool.slice(0, h);
      let lost = 0;
      for (let k = 0; k < K; k++)
        lost += rollout(g, model, pi * 100003 + bi * 1009 + h * 101 + k, held);
      rows.push({
        f: [...features(g, 0, 0, held)].map((x) => +x.toFixed(5)),
        held: held.map((p) => p.id),
        lost,
        K,
        free: freeOf(g),
        pi,
      });
    }
  });
  return rows;
}

if (!isMainThread) {
  SAFE = workerData.safe;
  HORIZON = workerData.horizon;
  HELD = workerData.held;
  const positions = JSON.parse(fs.readFileSync(workerData.posFile, "utf8"));
  parentPort.on("message", (pi) => {
    if (pi === null) process.exit(0);
    parentPort.postMessage(
      label(
        positions[pi],
        pi,
        workerData.model,
        workerData.K,
        workerData.moves,
      ),
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
  // --continua si: riprende un file interrotto, saltando le posizioni già etichettate
  const doneSet = new Set();
  if (args.continua && fs.existsSync(out)) {
    const lines = fs.readFileSync(out, "utf8").split("\n").filter(Boolean);
    const ok = [];
    for (const l of lines) {
      try {
        ok.push(JSON.parse(l));
      } catch {
        // riga tagliata dall'interruzione
      }
    }
    const count = new Map();
    for (const r of ok) count.set(r.pi, (count.get(r.pi) ?? 0) + 1);
    // una posizione è completa se tutte le sue righe sono arrivate (scritte insieme)
    for (const pi of count.keys()) doneSet.add(pi);
    fs.writeFileSync(out, ok.map((r) => JSON.stringify(r)).join("\n") + (ok.length ? "\n" : ""));
    console.log(`riprendo: ${doneSet.size} posizioni già fatte`);
  } else fs.writeFileSync(out, "");
  const todo = positions.map((_, i) => i).filter((i) => !doneSet.has(i));
  let next = 0;
  let done = 0;
  const t0 = Date.now();
  const n = Number(args.workers ?? os.cpus().length);
  for (let k = 0; k < n; k++) {
    const wk = new Worker(new URL(import.meta.url), {
      workerData: {
        posFile,
        model,
        K,
        moves,
        safe: Number(args.safe ?? 46),
        horizon: Number(args.orizzonte ?? 60),
        held: Number(args.tenuti ?? 0),
      },
    });
    const feed = () => wk.postMessage(next < todo.length ? todo[next++] : null);
    wk.on("message", (rows) => {
      fs.appendFileSync(
        out,
        rows.map((r) => JSON.stringify(r)).join("\n") + "\n",
      );
      if (++done % 100 === 0 || done === todo.length)
        console.log(
          `${done}/${todo.length} posizioni · ${((Date.now() - t0) / 60000).toFixed(1)} min`,
        );
      feed();
    });
    feed();
  }
}
