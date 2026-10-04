/**
 * Controllo di congruenza di suggerimenti e giudizi su posizioni simulate.
 *
 * Genera posizioni da partite con seme (in parte con il suggerimento, in parte con mosse casuali,
 * per avere anche tabelloni "umani") e in ogni posizione giudica tutte le mosse candidate più
 * alcune mosse casuali. Poi controlla che suggerimento, etichetta, motivazione e dettagli mostrati
 * siano coerenti con i dati della posizione.
 *
 *   node scripts/audit-judgment.mjs [--mode normal|expert] [--positions 200] [--seed 1] [--extra 3] [--json file]
 */
import fs from "node:fs";
import { judgeMove, JUDGMENT_LIMITS } from "../game/moveJudgment.js";
import { randomTray, replacePiece, seededRandom, shiftQueue } from "../game/pieces.js";
import HexGrid from "../game/HexGrid.js";
import { analyzeMoves, analyzePlayedMove, bestMove, explainNormal, explainQueue, slimAnalysis } from "../game/strategy.js";

const arg = (name, def) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : def;
};

/** Ordine delle etichette, dalla migliore alla peggiore. */
export const GRADE = {
  "Ottima scoperta": 7, "Ottima mossa": 7,
  "Buona mossa": 6,
  "Una mossa vale l’altra": 5, "Migliore disponibile": 5, "Mossa obbligata": 5,
  "Mossa giocabile": 4,
  "Mossa discreta": 3,
  "Mossa migliorabile": 2, "Mossa poco promettente": 2,
  "Occasione persa": 1, "Mossa rischiosa": 1,
  "Mossa cattiva": 0, "Mossa pessima": 0,
};
const NEGATIVE = new Set(["Occasione persa", "Mossa rischiosa", "Mossa cattiva", "Mossa pessima"]);
const POSITIVE = new Set(["Ottima scoperta", "Ottima mossa"]);

/** Posizioni da partite con seme: con probabilità `noise` la mossa è casuale. */
export function* positions({ expert, count, seed, noise = 0.3, maxLen = 400 }) {
  let made = 0;
  for (let game = 0; made < count; game++) {
    const rng = seededRandom(seed + game * 7919);
    let grid = new HexGrid(4);
    let tray = randomTray(rng);
    let streak = 0;
    for (let n = 0; n < maxLen && made < count; n++) {
      const legal = tray.flatMap((p, idx) => !p || (expert && idx) ? [] : grid.placementsFor(p.cells).map(([q, r]) => ({ idx, q, r })));
      if (!legal.length) break;
      // una posizione ogni 3 mosse, per non avere posizioni quasi identiche
      if (n % 3 === 1) { yield { grid, tray, streak, expert, rng }; made++; }
      const m = rng() < noise ? legal[Math.floor(rng() * legal.length)] : bestMove(grid, tray, streak, { queue: expert });
      const res = grid.play(tray[m.idx].cells, m.q, m.r);
      streak = res.lines.length ? streak + 1 : 0;
      grid = res.grid;
      tray = expert ? shiftQueue(tray, rng) : replacePiece(tray, m.idx, rng);
    }
  }
}

const same = (a, b) => a.idx === b.idx && a.q === b.q && a.r === b.r;

/** Controlli su una singola mossa giudicata. Restituisce l'elenco dei problemi trovati. */
export function checkJudgment(j, analysis, { suggested }) {
  const issues = [];
  const add = (code, detail = "") => issues.push({ code, detail });
  const played = analysis.moves.find((m) => m.played);
  if (!(j.label in GRADE)) add("etichetta sconosciuta", j.label);
  const tone = POSITIVE.has(j.label) ? "positive" : NEGATIVE.has(j.label) ? "negative" : "neutral";
  if (j.emphasis !== tone) add("enfasi incoerente", `${j.label}/${j.emphasis}`);
  if (j.label === "Mossa obbligata" && j.totalMoves !== 1) add("obbligata con alternative");
  if (j.totalMoves === 1 && j.label !== "Mossa obbligata") add("unica mossa non obbligata", j.label);
  if (j.label === "Ottima scoperta" && !j.added) add("scoperta non aggiunta");
  if (j.label === "Ottima mossa" && j.added) add("ottima mossa aggiunta");
  if (POSITIVE.has(j.label) && (j.rank !== 1 || j.gap > 1e-9)) add("ottima non prima", `rank ${j.rank}`);
  if (j.clearlyBetter !== j.clearlyBetterMoves.length) add("conteggio nettamente migliori");
  for (const m of j.clearlyBetterMoves) {
    if (!(m.advantage > j.clearlyBetterTolerance)) add("nettamente migliore senza vantaggio");
    if (!m.cells?.length) add("nettamente migliore senza celle");
  }
  // segnali positivi o neutri non possono convivere con alternative nettamente migliori nel titolo
  if (GRADE[j.label] >= 6 && j.clearlyBetter > 0) add("buona/ottima con nettamente migliori", `${j.label} (${j.clearlyBetter})`);
  // l'occasione persa deve indicare che cosa si poteva fare
  if (j.label === "Occasione persa" && j.clearlyBetter === 0) add("occasione persa senza alternative indicate");
  // il suggerimento non può ricevere un giudizio che lo critica o lo mette sotto altre mosse
  if (suggested && GRADE[j.label] < 5) add("suggerimento giudicato male", j.label);
  if (suggested && j.rank !== 1 && j.gap > 1e-9) add("suggerimento non primo");
  // motivazioni che citano numeri: devono essere vere
  if (/Prima in classifica/.test(j.reason) && j.rank !== 1) add("motivazione: prima in classifica");
  if (/entro la fascia delle migliori/.test(j.reason) && j.relativeGap > JUDGMENT_LIMITS.comparable + 1e-9) add("motivazione: fascia delle migliori");
  if (/Tutte le alternative valutate hanno punteggi comparabili/.test(j.reason) && (j.better || j.worse)) add("motivazione: tutte comparabili");
  if (/almeno dell’80%/.test(j.reason) && !(j.risk.death >= JUDGMENT_LIMITS.extremeRisk)) add("motivazione: rischio 80%");
  if (/almeno del 50%/.test(j.reason) && !(j.risk.death >= JUDGMENT_LIMITS.highRisk)) add("motivazione: rischio 50%");
  if (/entro il 10%/.test(j.reason) && j.relativeGap > JUDGMENT_LIMITS.playableGap + 1e-9) add("motivazione: entro il 10%");
  if (/inferiore al 20%/.test(j.reason) && j.relativeGap >= 0.2) add("motivazione: inferiore al 20%");
  if (/Hai eliminato/.test(j.reason) && !(played.lines > 0)) add("motivazione: linee eliminate");
  if (/La valutazione resta vicina alle migliori/.test(j.reason) && j.relativeGap > JUDGMENT_LIMITS.comparable + 1e-9) add("motivazione: vicina alle migliori", j.relativeGap.toFixed(3));
  if (/punto da una cella|pezzo da una cella/.test(j.reason) && played.cells.length !== 1) add("motivazione: punto");
  if (/Le alternative considerate eliminano subito più/.test(j.reason) && !analysis.moves.some((m) => m.lines > played.lines)) add("motivazione: alternative con più linee");
  if (/rischio/i.test(j.label) && j.risk.death === null && !j.risk.blocked) add("rischiosa senza rischio");
  // le note non contraddicono l'etichetta
  const caution = (j.notes || []).some((n) => /senza un netto miglioramento/.test(n));
  if (caution && (GRADE[j.label] >= 5 || j.better === 0)) add("avvertimento accanto a giudizio fra i migliori", j.label);
  if (caution) {
    const better = analysis.moves.filter((m) => !m.played && m.total - played.total > j.tolerance);
    const ok = /conserva/.test(j.notes.join(" ")) ? better.some((m) => m.cells.length > 1) : better.some((m) => m.cells.length === 1 && m.lines > 0);
    if (!ok) add("avvertimento sul punto senza alternativa migliore che lo giustifichi");
  }
  if (caution && played.cells.length !== 1) add("avvertimento sul punto senza punto");
  return issues;
}

/** Coppie di mosse nella stessa posizione: più punti e non più rischio ⇒ giudizio non peggiore. */
export function checkMonotone(rows) {
  const issues = [];
  for (const a of rows) for (const b of rows) {
    if (a === b) continue;
    const ja = a.judgment, jb = b.judgment;
    // una mossa aggiunta è confrontata con un insieme diverso (le candidate più lei): il confronto
    // con le candidate vale solo dentro lo stesso insieme
    if (ja.added !== jb.added) continue;
    const tol = Math.max(ja.tolerance, jb.tolerance);
    if (!(a.total - b.total > tol)) continue; // a nettamente sopra b
    const ra = ja.risk, rb = jb.risk;
    if (ra.blocked && !rb.blocked) continue;
    if ((ra.death ?? 0) > (rb.death ?? 0) + 1e-9) continue;
    if (GRADE[ja.label] < GRADE[jb.label]) {
      issues.push({ code: "ordine invertito", pair: `${ja.label} < ${jb.label}`, detail: `${ja.label} (${a.total.toFixed(1)}) < ${jb.label} (${b.total.toFixed(1)})`, a: a.key, b: b.key });
    }
  }
  return issues;
}

/** Controlli sul suggerimento in una posizione. */
export function checkSuggestion(pos) {
  const issues = [];
  const { grid, tray, streak, expert } = pos;
  const hint = bestMove(grid, tray, streak, { queue: expert });
  const legal = tray.flatMap((p, idx) => !p || (expert && idx) ? [] : grid.placementsFor(p.cells).map(([q, r]) => ({ idx, q, r })));
  if (!hint) { if (legal.length) issues.push({ code: "nessun suggerimento con mosse legali" }); return { hint, issues }; }
  if (!grid.canPlace(tray[hint.idx].cells, hint.q, hint.r)) issues.push({ code: "suggerimento illegale" });
  if (expert && hint.idx !== 0) issues.push({ code: "suggerimento Esperto non sul primo pezzo" });
  const analysis = analyzeMoves(grid, tray, streak, { queue: expert });
  const top = analysis.moves[0];
  if (!same(top, hint)) issues.push({ code: "suggerimento diverso dall'analisi" });
  if (analysis.moves.some((m) => m.total > top.total + 1e-9)) issues.push({ code: "analisi non ordinata" });
  const blocked = (m) => (m.sequence ? m.sequence.blocked : !m.next);
  if (blocked(top) && analysis.moves.some((m) => !blocked(m))) issues.push({ code: "suggerimento bloccato evitabile" });
  // le pagine guida mostrano come prima mossa lo stesso suggerimento
  if (expert) {
    const leaf = explainQueue(grid, tray, streak)?.leaves[0];
    if (!leaf || leaf.path[0].q !== hint.q || leaf.path[0].r !== hint.r) issues.push({ code: "guida Esperto diversa dal suggerimento" });
  } else if (!same(explainNormal(grid, tray, streak).byTotal[0], hint)) issues.push({ code: "guida normale diversa dal suggerimento" });
  // ripetibile: stessa posizione, stesso suggerimento
  if (!same(bestMove(grid, tray, streak, { queue: expert }), hint)) issues.push({ code: "suggerimento non ripetibile" });
  return { hint, analysis, issues };
}

export function audit({ expert, count, seed, extra = 3 }) {
  const out = { mode: expert ? "expert" : "normal", positions: 0, judged: 0, labels: {}, suggestedLabels: {}, issues: {}, examples: {} };
  out.pairs = {};
  const note = (issue, ctx) => {
    out.issues[issue.code] = (out.issues[issue.code] || 0) + 1;
    if (issue.pair) out.pairs[issue.pair] = (out.pairs[issue.pair] || 0) + 1;
    (out.examples[issue.code] ||= []).length < 4 && out.examples[issue.code].push({ ...ctx, detail: issue.detail });
  };
  for (const pos of positions({ expert, count, seed })) {
    out.positions++;
    const ctx = { cells: [...pos.grid.cells].filter(([, v]) => v).map(([k]) => k), tray: pos.tray.map((p) => p?.id), streak: pos.streak, expert };
    const { hint, analysis, issues } = checkSuggestion(pos);
    issues.forEach((i) => note(i, ctx));
    if (!hint) continue;
    // mosse da giudicare: le candidate e qualche mossa casuale
    const legal = pos.tray.flatMap((p, idx) => !p || (expert && idx) ? [] : pos.grid.placementsFor(p.cells).map(([q, r]) => ({ idx, q, r })));
    const picks = [...analysis.moves.map(({ idx, q, r }) => ({ idx, q, r }))];
    for (let k = 0; k < extra && legal.length; k++) {
      const m = legal[Math.floor(pos.rng() * legal.length)];
      if (!picks.some((p) => same(p, m))) picks.push(m);
    }
    const rows = [];
    for (const m of picks) {
      const a = analyzePlayedMove({ ...pos, ...m });
      const j = judgeMove(a, pos.tray.filter(Boolean).length);
      const slimJ = judgeMove(slimAnalysis(a), pos.tray.filter(Boolean).length);
      out.judged++;
      if (JSON.stringify(slimJ) !== JSON.stringify(j)) note({ code: "giudizio diverso nel worker" }, ctx);
      const suggested = same(m, hint);
      out.labels[j.label] = (out.labels[j.label] || 0) + 1;
      if (suggested) out.suggestedLabels[j.label] = (out.suggestedLabels[j.label] || 0) + 1;
      const played = a.moves.find((x) => x.played);
      const key = `${m.idx}:${m.q},${m.r}`;
      for (const i of checkJudgment(j, a, { suggested })) note(i, { ...ctx, move: key, label: j.label, reason: j.reason });
      rows.push({ key, total: played.total, judgment: j });
      // informativo: una mossa non approfondita che supera il suggerimento (limite noto della ricerca)
      if (j.added && played.total > analysis.moves[0].total + j.tolerance) out.missed = (out.missed || 0) + 1;
    }
    for (const i of checkMonotone(rows)) note(i, { ...ctx, a: i.a, b: i.b });
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const mode = arg("mode", "normal");
  const res = audit({ expert: mode === "expert", count: +arg("positions", 200), seed: +arg("seed", 1), extra: +arg("extra", 3) });
  const json = arg("json", null);
  if (json) fs.writeFileSync(json, JSON.stringify(res, null, 1));
  console.log(`modalità ${res.mode} · ${res.positions} posizioni · ${res.judged} mosse giudicate`);
  console.log("etichette:", res.labels);
  console.log("etichette del suggerimento:", res.suggestedLabels);
  console.log("mosse casuali nettamente migliori del suggerimento (non approfondite):", res.missed || 0);
  console.log("problemi:", Object.keys(res.issues).length ? res.issues : "nessuno");
  if (Object.keys(res.pairs).length) console.log("ordine invertito, per coppia:", Object.fromEntries(Object.entries(res.pairs).sort((a, b) => b[1] - a[1])));
}
