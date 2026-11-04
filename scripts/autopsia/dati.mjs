/** Lettura del file di raccogli.mjs (accetta anche il formato senza intestazione: elenco di partite). */
import fs from "node:fs";
export function loadTraps(file) {
  const j = JSON.parse(fs.readFileSync(file, "utf8"));
  const games = Array.isArray(j) ? j : j.games;
  return { games, traps: games.flatMap((g) => g.traps), k: j.k ?? 8 };
}
