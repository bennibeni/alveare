#!/usr/bin/env node
/**
 * Passo 5: rischio inevitabile di TUTTI gli ingressi in pericolo (stesse partite di raccogli.mjs).
 * Per ogni ingresso, F futuri a caso: quota in cui nemmeno l'oracolo torna a 40 celle libere entro
 * 25 mosse. Il confronto con la quota di copie bloccate della strategia sugli stessi ingressi dice
 * quanto resta da guadagnare giocando meglio in pericolo.
 *
 *   node scripts/autopsia/ingressi-oracolo.mjs --games 100 --seed 100000 --out ingressi.json
 * Opzioni: --f futuri (200) --parte i --parti n (per dividere il lavoro fra più processi)
 */
import fs from "node:fs";
import {
  HexGrid,
  P,
  bestMove,
  free,
  occOf,
  pieceIndex,
  drawSeq,
  applyMove,
} from "./motore.mjs";
import { makeOracle } from "./oracolo.mjs";
import { parseArgs } from "./args.mjs";

const a = parseArgs({
  games: 100,
  seed: 100000,
  f: 200,
  out: "ingressi.json",
  parte: 0,
  parti: 1,
});
const or = makeOracle({ budget: 2e6 });
const out = [];
for (let gi = a.parte; gi < a.games; gi += a.parti) {
  const seed = a.seed + gi * 97;
  const rng = P.seededRandom(seed);
  let s = { grid: new HexGrid(4), tray: P.randomTray(rng), streak: 0 };
  let inD = false;
  for (let i = 0; i < 1000; i++) {
    const occ = occOf(s.grid);
    const f = free(occ);
    if (f >= 40) inD = false;
    if (!inD && f < 32) {
      inD = true;
      const tray = s.tray.map((p) => pieceIndex.get(p.id));
      let doom = 0;
      for (let k = 0; k < a.f; k++)
        if (
          or.solve(occ, tray, drawSeq(31337 + k * 7919 + i * 13, 40), 0, 25) ===
          false
        )
          doom++;
      out.push({ seed, pezzo: i, free: f, doom, F: a.f });
    }
    const m = bestMove(s.grid, s.tray, s.streak);
    if (!m) break;
    s = applyMove(s, m.idx, m.q, m.r, rng);
  }
  fs.writeFileSync(a.out, JSON.stringify(out));
}
const d = out.reduce((x, e) => x + e.doom, 0);
const n = out.reduce((x, e) => x + e.F, 0);
console.log(
  `ingressi ${out.length}: l'oracolo non si salva in ${d} futuri su ${n} (${((100 * d) / n).toFixed(3)}%), ingressi con rischio ${out.filter((e) => e.doom).length}`,
);
