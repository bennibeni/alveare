#!/usr/bin/env node
/**
 * Simulatore da riga di comando: fa giocare all'autogioco molte partite con pezzi
 * riproducibili e ne riassume i risultati.
 *
 *   npm run sim                                   # 20 partite in modalità normale
 *   npm run sim -- --mode expert --games 100      # 100 partite in modalità Esperto
 *   npm run sim -- --mode expert --seed 123 --max 2000 --json risultati.json
 *
 * Opzioni:
 *   --mode normal|expert   regole del vassoio (default normal)
 *   --games N              numero di partite (default 20)
 *   --max N                pezzi massimi per partita (default 1000)
 *   --seed N               seme di partenza (default 7000): stessi semi = stessi pezzi
 *   --json FILE            salva anche i risultati partita per partita
 */
import fs from "node:fs";
import { playGame, seedFor, summarize } from "./sim-lib.mjs";

const args = Object.fromEntries(
  process.argv
    .slice(2)
    .reduce(
      (acc, a, i, all) =>
        a.startsWith("--") ? [...acc, [a.slice(2), all[i + 1]]] : acc,
      [],
    ),
);
const mode = args.mode === "expert" ? "expert" : "normal";
const games = Number(args.games ?? 20);
const maxMoves = Number(args.max ?? 1000);
const seed = Number(args.seed ?? 7000);

console.log(
  `Alveare · simulazione · modalità ${mode} · ${games} partite · max ${maxMoves} pezzi · seme ${seed}\n`,
);
const t0 = Date.now();
const results = [];
for (let i = 0; i < games; i++) {
  const r = playGame({ mode, seed: seedFor(seed, i), maxMoves });
  results.push(r);
  const end = r.lost ? "persa" : "limite raggiunto";
  console.log(
    `  partita ${String(i + 1).padStart(3)}  ${String(r.pieces).padStart(5)} pezzi  ${String(r.points).padStart(6)} punti  (${end})`,
  );
}
const s = summarize(results);
const sec = (Date.now() - t0) / 1000;
console.log(`
Riepilogo
  partite perse         ${s.lost} su ${s.games}
  durata (pezzi)        mediana ${s.median} · media ${s.mean} · 25%–75% ${s.q25}–${s.q75} · max ${s.max}
  punti medi            ${s.meanPoints}
  punti per pezzo       ${s.pointsPerPiece}
  tempo                 ${sec.toFixed(1)} s (${((sec * 1000) / results.reduce((a, r) => a + r.pieces, 0)).toFixed(1)} ms per mossa)`);
if (args.json) {
  fs.writeFileSync(
    args.json,
    JSON.stringify(
      { mode, games, maxMoves, seed, summary: s, results },
      null,
      2,
    ),
  );
  console.log(`\nRisultati salvati in ${args.json}`);
}
