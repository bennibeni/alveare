/**
 * Archivio di posizioni affollate "che servono" (modalità normale).
 *
 * 1. Gioca partite con seme da più fonti (strategia attuale, strategia attuale con una mossa su tre
 *    casuale, eventualmente una strategia precedente) e raccoglie le posizioni con meno di FREE celle
 *    libere: una ogni 3 mosse affollate (al massimo 12 per partita) più, nelle partite perse, una
 *    ogni 2 delle ultime 30 mosse.
 * 2. Per ogni posizione prova le CANDIDATES migliori mosse iniziali della strategia attuale e, dopo
 *    ognuna, continua con la strategia attuale per HORIZON mosse in tutto. I pezzi estratti dopo
 *    ogni mossa dipendono solo da `futureSeed`: tutte le prove vedono gli stessi pezzi futuri.
 * 3. La posizione è "decisiva" se l'esito cambia secondo la mossa iniziale (qualcuna arriva a
 *    HORIZON mosse, qualcuna si blocca prima). Solo le decisive entrano nell'archivio.
 *
 * Le partite sono divise per seme: una su tre va in "verifica", le altre in "taratura".
 *
 *   node scripts/crowded-archive.mjs --source attuale --games 40 [--first 0] --out parte.jsonl
 *   node scripts/crowded-archive.mjs --source precedente --module ../game/vecchia.js --games 40 --out parte.jsonl
 *   node scripts/crowded-archive.mjs --merge parte1.jsonl parte2.jsonl ... --out archivio.json
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import HexGrid, { cellNumbers } from "../game/HexGrid.js";
import { PIECES, randomTray, replacePiece, seededRandom } from "../game/pieces.js";
import { analyzeMoves, bestMove } from "../game/strategy.js";

export const ARCHIVE = { free: 36, candidates: 4, horizon: 20, perGame: 12, tail: 30 };
const SOURCES = { attuale: 30000, "mosse-casuali": 40000, precedente: 50000 };
const seedFor = (base, i) => base + i * 97;
const freeCells = (g) => { let n = 0; for (const v of g.cells.values()) if (!v) n++; return n; };
const byId = new Map(PIECES.map((p) => [p.id, p]));

/** Gioca da una posizione: la mossa iniziale data, poi la strategia attuale, fino a `horizon` mosse in tutto. */
export function rollout({ grid, tray, streak }, first, futureSeed, horizon = ARCHIVE.horizon, strategy = bestMove) {
  const rng = seededRandom(futureSeed);
  let moves = 0;
  for (let m = first; moves < horizon; moves++) {
    if (moves > 0) m = strategy(grid, tray, streak);
    if (!m || !tray[m.idx] || !grid.canPlace(tray[m.idx].cells, m.q, m.r)) break;
    const res = grid.play(tray[m.idx].cells, m.q, m.r);
    streak = res.lines.length ? streak + 1 : 0;
    grid = res.grid;
    tray = replacePiece(tray, m.idx, rng);
  }
  return moves;
}

/** Posizione salvata → oggetti del gioco. */
export function loadPosition(p) {
  let grid = new HexGrid(4);
  for (const [q, r] of p.cells) grid = grid.place([[0, 0]], q, r, 1);
  return { grid, tray: p.tray.map((id) => byId.get(id)), streak: p.streak };
}

/** Partite di una fonte → posizioni affollate candidate. */
function* crowdedPositions(source, games, policy, first = 0) {
  for (let i = first; i < first + games; i++) {
    const seed = seedFor(SOURCES[source], i);
    const rng = seededRandom(seed);
    let grid = new HexGrid(4), tray = randomTray(rng), streak = 0;
    const states = [];
    let lost = false, crowded = 0;
    for (let n = 0; n < 1000; n++) {
      const legal = tray.flatMap((p, idx) => grid.placementsFor(p.cells).map(([q, r]) => ({ idx, q, r })));
      if (!legal.length) { lost = true; break; }
      if (freeCells(grid) < ARCHIVE.free) states.push({ grid, tray, streak, move: n, regular: crowded++ % 3 === 0 });
      const m = source === "mosse-casuali" && rng() < 0.3 ? legal[Math.floor(rng() * legal.length)] : policy(grid, tray, streak);
      const res = grid.play(tray[m.idx].cells, m.q, m.r);
      streak = res.lines.length ? streak + 1 : 0;
      grid = res.grid;
      tray = replacePiece(tray, m.idx, rng);
    }
    const end = states.length ? states[states.length - 1].move : 0;
    const regular = states.filter((s) => s.regular).slice(0, ARCHIVE.perGame);
    const tail = lost ? states.filter((s) => end - s.move < ARCHIVE.tail && (end - s.move) % 2 === 0) : [];
    const picked = [...new Set([...regular, ...tail])].sort((a, b) => a.move - b.move);
    for (const s of picked) yield { ...s, source, gameSeed: seed, gameLost: lost, set: i % 3 === 2 ? "verifica" : "taratura" };
  }
}

/** Valuta una posizione: esito delle migliori mosse iniziali con gli stessi pezzi futuri. */
function evaluate(pos) {
  const futureSeed = pos.gameSeed * 1000 + pos.move;
  const moves = analyzeMoves(pos.grid, pos.tray, pos.streak).moves.slice(0, ARCHIVE.candidates);
  const outcomes = moves.map((m, rank) => ({
    rank: rank + 1, idx: m.idx, q: m.q, r: m.r, piece: m.piece.id,
    moves: rollout(pos, { idx: m.idx, q: m.q, r: m.r }, futureSeed),
  }));
  const survived = outcomes.filter((o) => o.moves >= ARCHIVE.horizon).length;
  return { futureSeed, outcomes, survived, decisive: survived > 0 && survived < outcomes.length };
}

const numbers = cellNumbers(4);
function serialize(pos, ev, id) {
  const cells = [...pos.grid.cells].filter(([, v]) => v).map(([k]) => k.split(",").map(Number));
  return {
    id, set: pos.set, source: pos.source, gameSeed: pos.gameSeed, gameLost: pos.gameLost, move: pos.move,
    free: freeCells(pos.grid), streak: pos.streak,
    tray: pos.tray.map((p) => p.id),
    cells, // [q, r] delle celle occupate
    cellNumbers: cells.map(([q, r]) => numbers.get(`${q},${r}`)).sort((a, b) => a - b),
    futureSeed: ev.futureSeed,
    outcomes: ev.outcomes, // per ogni mossa iniziale: mosse giocate prima del blocco (horizon = salva)
    survived: ev.survived,
  };
}

function build({ source, games, first, module, out }) {
  return import(module ? pathToFileURL(path.resolve(module)).href : "../game/strategy.js").then(({ bestMove: policy }) => {
    // le posizioni decisive si scrivono man mano: un'esecuzione interrotta non perde il lavoro fatto
    fs.writeFileSync(out, "");
    const statsFile = out.replace(/\.jsonl$/, ".stats.json");
    let seen = 0, decisive = 0, safe = 0, lost = 0;
    const saveStats = () => fs.writeFileSync(statsFile, JSON.stringify({ source, games, first, seen, decisive, safe, lost }));
    for (const pos of crowdedPositions(source, games, policy, first)) {
      seen++;
      const ev = evaluate(pos);
      if (ev.decisive) { decisive++; fs.appendFileSync(out, JSON.stringify(serialize(pos, ev, `${source}-${pos.gameSeed}-${pos.move}`)) + "\n"); }
      else if (ev.survived) safe++;
      else lost++;
      saveStats();
      if (seen % 25 === 0) console.log(`  ${source}: ${seen} posizioni, ${decisive} decisive, ${safe} salve comunque, ${lost} perse comunque`);
    }
    saveStats();
    console.log(`${source}: ${games} partite, ${seen} posizioni affollate, ${decisive} decisive, ${safe} salve comunque, ${lost} perse comunque`);
  });
}

function merge(files, out) {
  const positions = files.flatMap((f) => fs.readFileSync(f, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)));
  const stats = files.map((f) => { try { return JSON.parse(fs.readFileSync(f.replace(/\.jsonl$/, ".stats.json"), "utf8")); } catch { return null; } }).filter(Boolean);
  const count = (set) => positions.filter((p) => p.set === set).length;
  const archive = {
    description: "Posizioni affollate e decisive di Alveare (modalità normale). Ogni posizione ha meno di "
      + `${ARCHIVE.free} celle libere e un esito che cambia secondo la mossa iniziale: fra le ${ARCHIVE.candidates} migliori mosse `
      + `della strategia, con gli stessi pezzi futuri (futureSeed), qualcuna arriva a ${ARCHIVE.horizon} mosse e qualcuna si blocca prima.`,
    format: {
      cells: "celle occupate [q, r] in coordinate assiali (raggio 4)",
      cellNumbers: "le stesse celle con la numerazione del giudizio (1–61, per righe dall'alto)",
      tray: "id dei tre pezzi del vassoio (pieces.js)",
      futureSeed: "seme dei pezzi estratti dopo ogni mossa: seededRandom(futureSeed), un'estrazione per mossa con replacePiece",
      outcomes: `mosse giocate prima del blocco, per ognuna delle migliori mosse iniziali (${ARCHIVE.horizon} = arrivata alla fine)`,
      set: "taratura o verifica: divise per partita di origine (una partita su tre in verifica)",
    },
    // gli esiti dipendono dalla strategia usata per continuare le prove
    strategyCommit: (() => { try { return execSync("git rev-parse --short HEAD").toString().trim(); } catch { return null; } })(),
    created: new Date().toISOString().slice(0, 10),
    settings: ARCHIVE,
    sources: stats,
    counts: { total: positions.length, taratura: count("taratura"), verifica: count("verifica") },
    positions,
  };
  fs.writeFileSync(out, JSON.stringify(archive));
  console.log(`archivio: ${positions.length} posizioni (${count("taratura")} taratura, ${count("verifica")} verifica) → ${out}`);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const argv = process.argv.slice(2);
  const arg = (name, def) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : def; };
  if (argv.includes("--merge")) {
    const out = arg("out", "archivio-affollate.json");
    merge(argv.filter((a, i) => a.endsWith(".jsonl") && argv[i - 1] !== "--out"), out);
  } else {
    const source = arg("source", "attuale");
    if (!(source in SOURCES)) throw new Error(`fonte sconosciuta: ${source} (${Object.keys(SOURCES).join(", ")})`);
    build({ source, games: +arg("games", 20), first: +arg("first", 0), module: arg("module", null), out: arg("out", `${source}.jsonl`) });
  }
}
