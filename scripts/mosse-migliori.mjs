#!/usr/bin/env node
/**
 * Archivio delle mosse umane migliori del suggerimento (data/mosse-migliori.json).
 *
 * 1. Analisi di una partita: dal log scaricato con «Scarica log partita» (modalità normale) si
 *    prendono le mosse in cui la mossa giocata non è il suggerimento ma è fra le prime 3 del
 *    giudizio (o una sua «scoperta»). Per ognuna, mossa giocata e suggerita sugli stessi futuri a
 *    caso, poi K mosse di autogioco; si confrontano i punti fatti (la mossa e le K successive) e i
 *    blocchi (un blocco vale −1000 punti). Prima prova su 30 futuri; le mosse che risultano
 *    migliori (differenza oltre 2 errori standard) passano alla conferma su 100 futuri nuovi.
 *    Confermata se regge anche lì, probabile se resta positiva senza superare la soglia.
 *
 *      node scripts/mosse-migliori.mjs --log alveare-partita-….json
 *      node scripts/mosse-migliori.mjs --log … --opposti     # anche le mosse nettamente peggiori
 *
 * 2. Verifica di una strategia sull'archivio: per ogni posizione, la mossa che sceglie ora la
 *    strategia contro la tua mossa (100 futuri, sempre gli stessi).
 *
 *      node scripts/mosse-migliori.mjs --verifica
 *      node scripts/mosse-migliori.mjs --verifica --game ../game-prova   # copia modificata di game/
 *
 * Opzioni: --game DIR (default ../game, relativa a questo script) · --out FILE (default
 * data/mosse-migliori.json) · --f1 30 · --f2 100 · --k 15 · --workers N (default: core).
 * Con --opposti le mosse in cui il suggerimento era nettamente migliore vanno in
 * data/mosse-peggiori.json: servono a controllare che una modifica non peggiori dove il
 * suggerimento aveva ragione. Le posizioni già in archivio non si aggiungono di nuovo.
 * Durata indicativa: 20–25 minuti per una partita di 340 mosse su 2 core (circa il doppio con
 * --opposti). I risultati parziali sono salvati accanto al log (…json.mosse-migliori.json): se
 * l'analisi si interrompe, rilanciando lo stesso comando riprende da dove era arrivata.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  Worker,
  isMainThread,
  parentPort,
  workerData,
} from "node:worker_threads";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const SEED_PROVA = 777;
const SEED_CONFERMA = 99991;
const SEED_VERIFICA = 31337;

/* ---------------------------------------------------------------- worker */
if (!isMainThread) {
  const G = workerData.gameDir;
  const load = (f) => import(pathToFileURL(path.join(G, f)));
  const HexGrid = (await load("HexGrid.js")).default;
  const P = await load("pieces.js");
  const { bestMove } = await load("strategy.js");
  const byId = new Map(P.PIECES.map((p) => [p.id, p]));
  const free = (g) => [...g.cells.values()].filter((v) => !v).length;
  const scoreMove = (size, lines, cleared, streak) =>
    lines ? size + Math.round(cleared * lines * (1 + 0.5 * streak)) : size;
  const step = (s, idx, q, r, rng) => {
    const p = s.tray[idx];
    const res = s.grid.play(p.cells, q, r, p.color);
    return {
      s: {
        grid: res.grid,
        tray: P.replacePiece(s.tray, idx, rng),
        streak: res.lines.length ? s.streak + 1 : 0,
      },
      pts: scoreMove(
        p.cells.length,
        res.lines.length,
        res.clearedCells.size,
        s.streak,
      ),
    };
  };
  const stateOf = (pos) => {
    const cells = new Map(new HexGrid(4).cells);
    for (const k of pos.celle) cells.set(k, 1);
    return {
      grid: new HexGrid(4, cells),
      tray: pos.vassoio.map((id) => byId.get(id)),
      streak: pos.combo,
    };
  };
  // continuazione: la mossa, poi K mosse di autogioco (o fino al blocco)
  const run = (s0, mv, rng, K) => {
    let { s, pts } = step(s0, mv.idx, mv.q, mv.r, rng);
    let blocked = false;
    for (let k = 0; k < K; k++) {
      const m = bestMove(s.grid, s.tray, s.streak);
      if (!m) {
        blocked = true;
        break;
      }
      const o = step(s, m.idx, m.q, m.r, rng);
      s = o.s;
      pts += o.pts;
    }
    return { pts, blocked, free: free(s.grid) };
  };
  parentPort.on("message", (job) => {
    if (!job) process.exit(0);
    const s0 = stateOf(job.posizione);
    if (job.type === "choose") {
      const m = bestMove(s0.grid, s0.tray, s0.streak);
      parentPort.postMessage({
        id: job.id,
        move: m && { idx: m.idx, q: m.q, r: m.r, pezzo: s0.tray[m.idx].id },
      });
      return;
    }
    // confronto appaiato di due mosse (a − b)
    const { a, b, F, K, seed, n } = job;
    const diffs = [];
    const sum = {
      a: { punti: 0, blocchi: 0, libere: 0 },
      b: { punti: 0, blocchi: 0, libere: 0 },
    };
    for (let f = 0; f < F; f++) {
      const ra = run(s0, a, P.seededRandom(seed + f * 104729 + n * 13), K);
      const rb = run(s0, b, P.seededRandom(seed + f * 104729 + n * 13), K);
      diffs.push(ra.pts - rb.pts - 1000 * (ra.blocked - rb.blocked));
      for (const [k, x] of [
        ["a", ra],
        ["b", rb],
      ]) {
        sum[k].punti += x.pts / F;
        sum[k].blocchi += x.blocked ? 1 : 0;
        sum[k].libere += x.free / F;
      }
    }
    const mean = diffs.reduce((x, y) => x + y, 0) / F;
    const sd = Math.sqrt(
      diffs.reduce((x, y) => x + (y - mean) ** 2, 0) / Math.max(1, F - 1),
    );
    const round = (o) => ({
      punti: Math.round(o.punti * 10) / 10,
      blocchi: o.blocchi,
      libere: Math.round(o.libere * 10) / 10,
    });
    parentPort.postMessage({
      id: job.id,
      futuri: F,
      mosse: K,
      seme: seed,
      differenza: Math.round(mean * 10) / 10,
      errore: Math.round((sd / Math.sqrt(F)) * 10) / 10,
      a: round(sum.a),
      b: round(sum.b),
    });
  });
} else {
  /* -------------------------------------------------------------- main */
  const args = {};
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i].replace(/^--/, "");
    if (["verifica", "opposti"].includes(k)) args[k] = true;
    else args[k] = argv[++i];
  }
  const gameDir = path.resolve(HERE, args.game || "../game");
  const outFile = path.resolve(ROOT, args.out || "data/mosse-migliori.json");
  const oppFile = path.resolve(ROOT, "data/mosse-peggiori.json");
  const F1 = +(args.f1 || 30);
  const F2 = +(args.f2 || 100);
  const K = +(args.k || 15);
  const W = +(args.workers || os.cpus().length);

  const { cellNumbers, key } = await import(
    pathToFileURL(path.join(gameDir, "HexGrid.js"))
  );
  const NUM = cellNumbers(4);
  const cellsOf = (piece, q, r) =>
    piece.cells
      .map(([a, b]) => NUM.get(key(q + a, r + b)))
      .sort((x, y) => x - y);

  // processi di lavoro: ognuno serve una coda di richieste, una alla volta
  const workers = [];
  for (let w = 0; w < W; w++) {
    const wk = new Worker(new URL(import.meta.url), {
      workerData: { gameDir },
    });
    workers.push(wk);
  }
  const callOn = (wk, job) =>
    new Promise((resolve) => {
      wk.once("message", resolve);
      wk.postMessage(job);
    });
  /** Applica fn(item, call) a tutti gli elementi, un processo di lavoro per volta ciascuno. */
  const parallel = async (items, fn) => {
    const out = new Array(items.length);
    let i = 0;
    let done = 0;
    await Promise.all(
      workers.map(async (wk) => {
        const call = (job) => callOn(wk, job);
        while (i < items.length) {
          const k = i++;
          out[k] = await fn(items[k], call);
          if (++done % 10 === 0 || done === items.length)
            console.log(`  ${done}/${items.length}`);
        }
      }),
    );
    return out;
  };
  const finish = () => workers.forEach((wk) => wk.postMessage(null));
  const readArchive = (f) =>
    fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : null;
  const writeArchive = (f, archive) =>
    fs.writeFileSync(f, JSON.stringify(archive, null, 1) + "\n");
  const posKey = (p) =>
    `${[...p.celle].sort().join(";")}|${p.vassoio.join(",")}|${p.combo}`;
  const newArchive = (descr) => ({
    format: "alveare-mosse-umane",
    version: 1,
    notes: descr,
    records: [],
  });

  if (args.verifica) {
    // ---------------------------------------------------------- verifica
    const archive = readArchive(outFile);
    if (!archive?.records.length) {
      console.log(`Archivio vuoto: ${outFile}`);
      finish();
    } else {
      console.log(
        `Verifica di ${gameDir} su ${archive.records.length} posizioni (${F2} futuri, ${K} mosse)\n`,
      );
      const rows = await parallel(archive.records, async (rec, call) => {
        const { move } = await call({
          type: "choose",
          posizione: rec.posizione,
        });
        const same =
          move &&
          move.pezzo === rec.tua.pezzo &&
          move.q === rec.tua.q &&
          move.r === rec.tua.r;
        if (same) return { rec, esito: "sceglie la tua mossa", diff: 0 };
        const cmp = await call({
          type: "compare",
          posizione: rec.posizione,
          a: rec.tua,
          b: move,
          F: F2,
          K,
          seed: SEED_VERIFICA,
          n: rec.mossa,
        });
        const esito =
          cmp.differenza > 2 * cmp.errore
            ? "la tua resta migliore"
            : cmp.differenza < -2 * cmp.errore
              ? "sceglie una mossa migliore della tua"
              : "alla pari con la tua";
        return { rec, esito, diff: cmp.differenza, err: cmp.errore, move };
      });
      const count = {};
      for (const r of rows) {
        count[r.esito] = (count[r.esito] || 0) + 1;
        console.log(
          `  ${r.rec.id.padEnd(48)} ${r.esito}${r.diff ? ` (tua − scelta ${r.diff} ± ${r.err})` : ""}`,
        );
      }
      console.log("\nRiepilogo");
      for (const [k, v] of Object.entries(count)) console.log(`  ${k}: ${v}`);
      finish();
    }
  } else {
    // ----------------------------------------------------------- analisi
    if (!args.log) {
      console.log("Indica il log: --log alveare-partita-….json");
      finish();
      process.exit(1);
    }
    const log = JSON.parse(fs.readFileSync(args.log, "utf8"));
    const partita = path.basename(args.log);
    let commit = null;
    try {
      commit = execSync("git rev-parse --short HEAD", { cwd: ROOT })
        .toString()
        .trim();
      const dirty = execSync("git status --porcelain game/strategy.js package.json package-lock.json vendor/", {
        cwd: ROOT,
      })
        .toString()
        .trim();
      if (dirty) commit += "+modifiche";
    } catch {
      commit = null;
    }
    const candidates = [];
    for (const m of log.moves) {
      if (m.mode !== "normal" || !m.analyzedMoves?.length) continue;
      const sug = m.analyzedMoves[0];
      const pl = m.analyzedMoves.find((x) => x.played);
      if (!pl || !sug || sug.played) continue;
      const near =
        m.evaluation?.rank <= 3 ||
        pl.total >= sug.total - 1e-9 ||
        m.evaluation?.label === "Ottima scoperta";
      if (!near && !args.opposti) continue;
      const occupied = m.before.cells.filter(([, v]) => v).map(([k]) => k);
      const move = (x) => ({
        idx: x.idx,
        q: x.q,
        r: x.r,
        pezzo: x.piece.id,
        nome: x.piece.name,
        celle: cellsOf(x.piece, x.q, x.r),
      });
      candidates.push({
        mossa: m.number,
        posizione: {
          celle: occupied,
          vassoio: m.before.tray.map((p) => p.id),
          combo: m.before.streak,
          libere: 61 - occupied.length,
        },
        tua: move(pl),
        suggerita: move(sug),
        app: {
          giudizio: m.evaluation?.label ?? null,
          posto: m.evaluation?.rank ?? null,
          su: m.evaluation?.count ?? null,
          strategia: commit,
        },
        near,
      });
    }
    console.log(
      `${partita}: ${candidates.length} mosse da provare (${F1} futuri, ${K} mosse di autogioco)\n`,
    );
    // risultati già calcolati: salvati via via accanto al log, così un'analisi interrotta riprende
    const cacheFile = `${args.log}.mosse-migliori.json`;
    const cache = fs.existsSync(cacheFile)
      ? JSON.parse(fs.readFileSync(cacheFile, "utf8"))
      : {};
    const compare = async (c, F, seed, call) => {
      const k = `${c.mossa}|${F}|${K}|${seed}|${commit}`;
      if (cache[k]) return cache[k];
      const r = await call({
        type: "compare",
        posizione: c.posizione,
        a: c.tua,
        b: c.suggerita,
        F,
        K,
        seed,
        n: c.mossa,
      });
      cache[k] = r;
      fs.writeFileSync(cacheFile, JSON.stringify(cache));
      return r;
    };
    const first = await parallel(candidates, (c, call) =>
      compare(c, F1, SEED_PROVA, call),
    );
    const better = [];
    const worse = [];
    candidates.forEach((c, i) => {
      const r = first[i];
      if (c.near && r.differenza > 2 * r.errore) better.push({ c, prova: r });
      else if (args.opposti && r.differenza < -2 * r.errore)
        worse.push({ c, prova: r });
    });
    console.log(
      `\nPrima prova: ${better.length} migliori del suggerimento${args.opposti ? `, ${worse.length} peggiori` : ""}. Conferma su ${F2} futuri nuovi\n`,
    );
    const toConfirm = [...better, ...worse];
    const second = await parallel(toConfirm, (x, call) =>
      compare(x.c, F2, SEED_CONFERMA, call),
    );
    const today = new Date().toISOString().slice(0, 10);
    const record = (x, conferma, stato) => ({
      id: `${partita}#${x.c.mossa}`,
      partita,
      mossa: x.c.mossa,
      stato,
      posizione: x.c.posizione,
      tua: x.c.tua,
      suggerita: x.c.suggerita,
      app: x.c.app,
      prova: x.prova,
      conferma,
      aggiunto: today,
    });
    const add = (file, descr, items) => {
      const archive = readArchive(file) || newArchive(descr);
      const seen = new Set(archive.records.map((r) => posKey(r.posizione)));
      let added = 0;
      for (const rec of items) {
        if (seen.has(posKey(rec.posizione))) continue;
        seen.add(posKey(rec.posizione));
        archive.records.push(rec);
        added++;
        console.log(
          `  ${rec.stato.padEnd(11)} mossa ${rec.mossa}: tua − suggerita ${rec.conferma.differenza} ± ${rec.conferma.errore} (blocchi ${rec.conferma.a.blocchi} contro ${rec.conferma.b.blocchi} su ${rec.conferma.futuri})`,
        );
      }
      writeArchive(file, archive);
      console.log(
        `${added} aggiunte a ${path.relative(ROOT, file)} (totale ${archive.records.length})\n`,
      );
    };
    const best = [];
    const opp = [];
    toConfirm.forEach((x, i) => {
      const r = second[i];
      if (better.includes(x)) {
        if (r.differenza > 2 * r.errore) best.push(record(x, r, "confermata"));
        else if (r.differenza > 0) best.push(record(x, r, "probabile"));
      } else if (r.differenza < -2 * r.errore)
        opp.push(record(x, r, "confermata"));
    });
    add(
      outFile,
      "Mosse giocate migliori del suggerimento. Differenza: punti fatti con la mossa giocata meno quelli con la suggerita, nella mossa e nelle mosse di autogioco successive, sugli stessi futuri (un blocco vale −1000); errore: errore standard della media. a = mossa giocata, b = suggerita. Confermata: oltre 2 errori standard anche sui futuri della conferma; probabile: positiva ma sotto la soglia.",
      best,
    );
    if (args.opposti)
      add(
        oppFile,
        "Mosse giocate nettamente peggiori del suggerimento (stesse misure di mosse-migliori.json, differenza negativa).",
        opp,
      );
    finish();
  }
}
