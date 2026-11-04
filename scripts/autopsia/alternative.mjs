#!/usr/bin/env node
/**
 * Passo 4: le ultime mosse della partita principale prima di ogni ingresso in pericolo finito con
 * una copia bloccata. Per ogni mossa possibile si misura il rischio inevitabile dopo la mossa
 * (quota di F futuri a caso in cui nemmeno l'oracolo sopravvive S mosse) e lo si confronta con
 * quello della mossa scelta dalla strategia.
 *
 *   node scripts/autopsia/alternative.mjs --in trappole.json --out alternative.json
 * Opzioni: --indietro mosse prima dell'ingresso (3) --f futuri (40) --s mosse da sopravvivere (14)
 *          --parte i --parti n (per dividere il lavoro fra più processi)
 */
import fs from "node:fs";
import {
  HexGrid,
  P,
  PLACE,
  PIECES,
  bestMove,
  play,
  free,
  occOf,
  pieceIndex,
  drawSeq,
  applyMove,
} from "./motore.mjs";
import { makeSurvival } from "./oracolo.mjs";
import { parseArgs } from "./args.mjs";
import { loadTraps } from "./dati.mjs";

const a = parseArgs({
  in: "trappole.json",
  out: "alternative.json",
  indietro: 3,
  f: 40,
  s: 14,
  parte: 0,
  parti: 1,
});
const { traps } = loadTraps(a.in);
const sv = makeSurvival();
const entries = new Map();
for (const t of traps)
  entries.set(t.seed + ":" + t.pezzo, { seed: t.seed, pezzo: t.pezzo });
const list = [...entries.values()].filter((_, i) => i % a.parti === a.parte);
const futures = Array.from({ length: a.f }, (_, f) =>
  drawSeq(4242 + f * 104729, a.s + 3),
);
const doomAfter = (occ, tray, slot) => {
  let d = 0;
  for (const seq of futures) {
    const t2 = tray.slice();
    t2[slot] = seq[0];
    if (sv.solve(occ, t2, seq, 1, a.s) === false) d++;
  }
  return d / futures.length;
};
const out = [];
for (const { seed, pezzo } of list) {
  const rng = P.seededRandom(seed);
  let s = { grid: new HexGrid(4), tray: P.randomTray(rng), streak: 0 };
  const steps = [];
  for (let i = 0; i < pezzo; i++) {
    const m = bestMove(s.grid, s.tray, s.streak);
    if (i >= pezzo - a.indietro)
      steps.push({
        occ: occOf(s.grid),
        tray: s.tray.map((p) => pieceIndex.get(p.id)),
        m,
      });
    s = applyMove(s, m.idx, m.q, m.r, rng);
  }
  const rows = steps.map((st) => {
    const alts = [];
    const seen = new Set();
    let chosen = null;
    for (let sl = 0; sl < 3; sl++) {
      const p = st.tray[sl];
      if (seen.has(p)) continue;
      seen.add(p);
      for (const [mask, q, r] of PLACE[p])
        if ((mask & st.occ) === 0n) {
          const [o2] = play(st.occ, mask);
          const d = doomAfter(o2, st.tray, sl);
          const isChosen =
            p === st.tray[st.m.idx] && q === st.m.q && r === st.m.r;
          alts.push({ d, piece: PIECES[p].id, q, r, isChosen });
          if (isChosen) chosen = d;
        }
    }
    alts.sort((x, y) => x.d - y.d);
    return {
      free: free(st.occ),
      legal: alts.length,
      chosen,
      best: alts[0].d,
      better: alts.filter((x) => x.d < chosen - 1e-9).length,
    };
  });
  out.push({ seed, pezzo, rows });
  console.log(
    `${seed}:${pezzo} ` +
      rows
        .map(
          (r) =>
            `[${r.free} libere, ${r.legal} mosse: scelta ${r.chosen}, migliore ${r.best}]`,
        )
        .join(" "),
  );
  fs.writeFileSync(a.out, JSON.stringify(out, null, 1));
}
