#!/usr/bin/env node
/**
 * Misura del tasso di sconfitta con lo sdoppiamento nei momenti di pericolo.
 *
 * Ogni partita gioca normalmente col suo seme. Quando scende sotto 32 celle libere (dopo essere
 * stata ad almeno 40), la posizione viene giocata altre K volte con pezzi futuri diversi, finché
 * torna a 40 celle libere o si blocca. Il tasso di sconfitta è:
 *     ingressi in pericolo ogni 1000 pezzi × frazione di copie bloccate.
 * Vede molte più sconfitte di una semplice simulazione, a parità di tempo, perché spende il calcolo
 * dove si decidono le partite. Le partite girano in parallelo, una per core.
 *
 * Dalla cartella di Alveare:
 *   npm run pericolo -- --games 300 --json base.json
 *   npm run pericolo -- --games 300 --game ../game-prova --json prova.json
 *   npm run pericolo -- --confronta base.json prova.json
 *
 * Opzioni:
 *   --games N      partite (default 20)        --seed N    seme della prima (default 7000; poi +97)
 *   --max N        pezzi per partita (1000)    --k N       copie per ingresso in pericolo (default 4)
 *   --workers N    processi paralleli (default: core − 1)
 *   --game DIR     cartella dei file di gioco da provare (default ../game, relativa a questo script):
 *                  per confrontare una strategia modificata, copiare game/ in game-prova (accanto a game/),
 *                  cambiare game-prova/strategy.js e passare --game ../game-prova
 *   --json FILE    salva partite, ingressi e trappole
 *   --confronta A B  confronta due file salvati con gli stessi semi (rapporto dei tassi B / A)
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  Worker,
  isMainThread,
  parentPort,
  workerData,
} from "node:worker_threads";
import { bootstrap, splitGame, splitSummary } from "./lab-lib.mjs";
import { seedFor } from "./sim-lib.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));

if (!isMainThread) {
  // processo di lavoro: carica la strategia richiesta e gioca le partite che riceve
  const { bestMove } = await import(workerData.strategyUrl);
  parentPort.on("message", (seed) => {
    if (seed === null) process.exit(0);
    const t0 = Date.now();
    const g = splitGame(seed, {
      max: workerData.max,
      K: workerData.K,
      bestMove,
    });
    parentPort.postMessage({ ...g, sec: (Date.now() - t0) / 1000 });
  });
} else {
  const args = {};
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--confronta") args.confronta = [argv[++i], argv[++i]];
    else if (argv[i].startsWith("--")) args[argv[i].slice(2)] = argv[++i];
  }
  const fmt = (x, d = 3) => x.toFixed(d).replace(".", ",");

  if (args.confronta) compare(...args.confronta);
  else await measure();

  async function measure() {
    const games = Number(args.games ?? 20);
    const seed = Number(args.seed ?? 7000);
    const max = Number(args.max ?? 1000);
    const K = Number(args.k ?? 4);
    const workers = Math.max(
      1,
      Math.min(games, Number(args.workers ?? os.cpus().length - 1)),
    );
    const gameDir = path.resolve(HERE, args.game ?? "../game");
    const strategyUrl = pathToFileURL(path.join(gameDir, "strategy.js")).href;
    console.log(
      `Alveare · sdoppiamento · ${games} partite · max ${max} pezzi · ${K} copie per ingresso · seme ${seed} · ${workers} processi\n  strategia: ${path.relative(process.cwd(), gameDir) || gameDir}\n`,
    );
    const seeds = Array.from({ length: games }, (_, i) => seedFor(seed, i));
    const results = [];
    const t0 = Date.now();
    await new Promise((resolve) => {
      let next = 0;
      let active = workers;
      for (let w = 0; w < workers; w++) {
        const worker = new Worker(fileURLToPath(import.meta.url), {
          workerData: { strategyUrl, max, K },
        });
        const feed = () =>
          worker.postMessage(next < seeds.length ? seeds[next++] : null);
        worker.on("message", (g) => {
          results.push(g);
          const traps = g.entries.filter((e) => e.perse > 0).length;
          console.log(
            `  seme ${String(g.seed).padStart(6)}  ${String(g.pieces).padStart(5)} pezzi${g.lost ? " (persa)" : ""}  ingressi ${String(g.entries.length).padStart(3)}  trappole ${traps}  ${g.sec.toFixed(0)} s`,
          );
          feed();
        });
        worker.on("exit", () => --active || resolve());
        feed();
      }
    });
    results.sort((a, b) => seeds.indexOf(a.seed) - seeds.indexOf(b.seed));
    const s = splitSummary(results);
    const [lo, hi] = bootstrap(results, (gs) => splitSummary(gs).rate);
    const traps = results.flatMap((g) =>
      g.entries.filter((e) => e.perse > 0).map((e) => ({ seed: g.seed, ...e })),
    );
    console.log(`
Riepilogo
  pezzi giocati            ${s.pieces} · partite perse ${s.lost} (${fmt(s.directRate)} ogni 1000 pezzi, conteggio diretto)
  ingressi in pericolo     ${s.entries} (${fmt(s.entriesPer1000, 1)} ogni 1000 pezzi)
  copie                    ${s.copies}, bloccate ${s.copiesLost} (${fmt(100 * s.pLoss, 2)}%)
  trappole                 ${traps.length} (ingressi con almeno una copia bloccata)
  tasso di sconfitta       ${fmt(s.rate)} ogni 1000 pezzi, intervallo 95% ${fmt(lo)}–${fmt(hi)}
  tempo                    ${((Date.now() - t0) / 60000).toFixed(1)} min`);
    if (args.json) {
      fs.writeFileSync(
        args.json,
        JSON.stringify(
          {
            games,
            seed,
            max,
            K,
            strategy: gameDir,
            summary: s,
            ci: [lo, hi],
            traps,
            results,
          },
          null,
          1,
        ),
      );
      console.log(`\nRisultati salvati in ${args.json}`);
    }
  }

  function compare(fileA, fileB) {
    const A = JSON.parse(fs.readFileSync(fileA, "utf8"));
    const B = JSON.parse(fs.readFileSync(fileB, "utf8"));
    const bySeed = new Map(B.results.map((g) => [g.seed, g]));
    const pairs = A.results
      .filter((g) => bySeed.has(g.seed))
      .map((g) => [g, bySeed.get(g.seed)]);
    if (!pairs.length) {
      console.log(
        "Nessun seme in comune: i due file vanno prodotti con gli stessi --seed e --games.",
      );
      return;
    }
    const ratio = (ps) => {
      const a = splitSummary(ps.map((p) => p[0])).rate;
      const b = splitSummary(ps.map((p) => p[1])).rate;
      return a > 0 ? b / a : NaN;
    };
    const ra = splitSummary(pairs.map((p) => p[0]));
    const rb = splitSummary(pairs.map((p) => p[1]));
    const [lo, hi] = bootstrap(pairs, ratio);
    console.log(`Confronto su ${pairs.length} partite con gli stessi semi
  ${fileA}: ${fmt(ra.rate)} sconfitte ogni 1000 pezzi (${ra.copiesLost} copie bloccate su ${ra.copies})
  ${fileB}: ${fmt(rb.rate)} sconfitte ogni 1000 pezzi (${rb.copiesLost} copie bloccate su ${rb.copies})
  rapporto B / A: ${fmt(ratio(pairs), 2)}, intervallo 95% ${fmt(lo, 2)}–${fmt(hi, 2)}
  ${hi < 1 ? "B perde meno di A in modo credibile." : lo > 1 ? "B perde più di A in modo credibile." : "L'intervallo comprende 1: con queste partite la differenza non è dimostrata."}`);
  }
}
