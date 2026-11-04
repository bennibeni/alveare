#!/usr/bin/env node
/**
 * Passo 2: l'oracolo chiaroveggente su ogni copia bloccata. A ogni passo della discesa si chiede
 * se esiste una sequenza (conoscendo i pezzi che arriveranno) che torna a 40 celle libere entro
 * 25 mosse. Ogni sconfitta finisce in una classe:
 *   inevitabile  nemmeno dall'ingresso in pericolo c'era una sequenza salva
 *   passo fatale l'ultima mossa dopo la quale non c'era più scampo; si contano le mosse legali e
 *                quelle che salvavano
 *
 *   node scripts/autopsia/autopsia.mjs --in trappole.json --out autopsia.json
 */
import fs from "node:fs";
import {
  PLACE,
  PIECES,
  play,
  free,
  occFromKeys,
  pieceIndex,
  drawSeq,
} from "./motore.mjs";
import { makeOracle } from "./oracolo.mjs";
import { parseArgs } from "./args.mjs";
import { loadTraps } from "./dati.mjs";

const a = parseArgs({
  in: "trappole.json",
  out: "autopsia.json",
  orizzonte: 25,
});
const H = a.orizzonte;
const { traps } = loadTraps(a.in);
const or = makeOracle({ budget: 4e6 });
const out = [];
for (const t of traps) {
  const seq = drawSeq(t.bseed, t.moves.length + H + 5);
  let occ = occFromKeys(t.start.cells);
  const tray = t.start.tray.map((id) => pieceIndex.get(id));
  const states = [];
  for (let i = 0; i <= t.moves.length; i++) {
    states.push({ occ, tray: tray.slice() });
    if (i === t.moves.length) break;
    const [s, q, r] = t.moves[i];
    const m = PLACE[tray[s]].find((x) => x[1] === q && x[2] === r)[0];
    [occ] = play(occ, m);
    tray[s] = seq[i];
  }
  const save = states.map((st, i) => or.solve(st.occ, st.tray, seq, i, H));
  let fatal = -1;
  for (let i = 0; i < states.length - 1; i++)
    if (save[i] === true && save[i + 1] === false) fatal = i;
  let info = null;
  if (fatal >= 0) {
    const st = states[fatal];
    let legal = 0;
    const savingMoves = [];
    const seen = new Set();
    for (let s = 0; s < 3; s++) {
      const p = st.tray[s];
      if (seen.has(p)) continue;
      seen.add(p);
      for (const [m, q, r] of PLACE[p])
        if ((m & st.occ) === 0n) {
          legal++;
          const [o2] = play(st.occ, m);
          const t2 = st.tray.slice();
          t2[s] = seq[fatal];
          if (or.solve(o2, t2, seq, fatal + 1, H - 1))
            savingMoves.push([s, q, r]);
        }
    }
    info = {
      legal,
      saving: savingMoves.length,
      savingMoves,
      free: free(st.occ),
      tray: st.tray.map((p) => PIECES[p].id),
      played: t.moves[fatal],
      movesToBlock: states.length - 1 - fatal,
    };
  }
  const cls =
    fatal >= 0 ? "passo fatale" : save[0] === false ? "inevitabile" : "incerta";
  out.push({
    seed: t.seed,
    pezzo: t.pezzo,
    k: t.k,
    bseed: t.bseed,
    libere: t.libere,
    n: t.moves.length,
    save,
    fatal,
    cls,
    info,
  });
}
fs.writeFileSync(a.out, JSON.stringify(out, null, 1));
const count = (c) => out.filter((r) => r.cls === c).length;
console.log(
  `copie bloccate ${out.length}: inevitabili ${count("inevitabile")}, con passo fatale ${count("passo fatale")}, incerte ${count("incerta")}`,
);
for (const r of out.filter((r) => r.info))
  console.log(
    `  passo fatale: ${r.info.free} celle libere, ${r.info.saving} mosse salve su ${r.info.legal}, blocco dopo ${r.info.movesToBlock} mosse`,
  );
