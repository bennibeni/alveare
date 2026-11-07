#!/usr/bin/env node
/** Ricostruisce due pre-ingressi, confronta tutte le mosse e conferma solo la migliore candidata.
 * node scripts/autopsia/analizza-preingressi.mjs
 * I risultati intermedi sono riutilizzati solo con la stessa impronta del codice.
 */
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { Worker, isMainThread, parentPort } from "node:worker_threads";
import HexGrid, { cellNumbers } from "../../game/HexGrid.js";
import { randomTray, replacePiece, seededRandom } from "../../game/pieces.js";
import { bestMove } from "../../game/strategy.js";
import { legalMoves } from "../../game/autopsy.js";
import { compareBatch, isBetter } from "../../game/trapComparison.js";
import { trapPositionKey } from "../../game/trapGroups.js";
import { archiveOf } from "../../game/trapArchive.js";

if (!isMainThread) {
  parentPort.on("message", (job) => {
    try {
      parentPort.postMessage({ result: compareBatch(job) });
    } catch (error) {
      parentPort.postMessage({ error: error.message });
    }
  });
} else {
  const root = fileURLToPath(new URL("../../", import.meta.url));
  const reportPath = path.join(root, "data/autopsia/preingressi-analisi.json");
  const archivePath = path.join(
    root,
    "data/autopsia/preingressi-confermati.json",
  );
  const hash = createHash("sha256");
  for (const file of [
    "strategy.js",
    "learnedRisk.js",
    "pieceAvailability.js",
    "pieces.js",
    "HexGrid.js",
    "trapComparison.js",
  ])
    hash.update(fs.readFileSync(path.join(root, "game", file)));
  const strategyId = hash.digest("hex").slice(0, 16);
  const existing = fs.existsSync(reportPath)
    ? JSON.parse(fs.readFileSync(reportPath, "utf8"))
    : null;
  const report =
    existing?.strategia === strategyId &&
    existing.protocollo === "preingressi-v1"
      ? existing
      : {
          protocollo: "preingressi-v1",
          strategia: strategyId,
          orizzonte: 15,
          penalitaBlocco: 1000,
          fasi: {
            prova: { futuri: 30, seme: 777 },
            conferma: { futuri: 100, seme: 99991 },
            verifica: { futuri: 300, seme: 20261108 },
          },
          posizioni: [],
          cache: {},
        };
  const save = () =>
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + "\n");
  const traps = JSON.parse(
    fs.readFileSync(
      path.join(root, "data/autopsia/trappole-100000.json"),
      "utf8",
    ),
  ).games.flatMap((g) => g.traps);
  const numbers = cellNumbers(4);
  const pack = (m, tray) => ({
    idx: m.idx,
    q: m.q,
    r: m.r,
    pezzo: tray[m.idx].id,
    nome: tray[m.idx].name,
    celle: tray[m.idx].cells
      .map(([q, r]) => numbers.get(`${m.q + q},${m.r + r}`))
      .sort((a, b) => a - b),
  });
  for (const spec of [
    { seed: 104753, ingresso: 79, prima: 2 },
    { seed: 108924, ingresso: 810, prima: 1 },
  ]) {
    if (report.posizioni.some((p) => p.seed === spec.seed)) continue;
    console.log(
      `Ricostruzione seme ${spec.seed}, ${spec.prima} mosse prima dell’ingresso ${spec.ingresso}`,
    );
    const rng = seededRandom(spec.seed);
    let grid = new HexGrid(4),
      tray = randomTray(rng),
      streak = 0,
      checkpoint;
    for (let i = 0; i < spec.ingresso; i++) {
      const m = bestMove(grid, tray, streak);
      if (!m)
        throw new Error(`Partita terminata prima del checkpoint: ${spec.seed}`);
      if (i === spec.ingresso - spec.prima)
        checkpoint = {
          ...spec,
          passo: i,
          posizione: {
            celle: [...grid.cells].filter(([, v]) => v).map(([k]) => k),
            vassoio: tray.map((p) => p.id),
            combo: streak,
            libere: [...grid.cells.values()].filter((v) => !v).length,
          },
          suggerita: pack(m, tray),
          candidate: legalMoves({
            cells: [...grid.cells],
            tray: tray.map((p) => p.id),
          }).map((move) => pack(move, tray)),
          prove: [],
        };
      const played = grid.play(tray[m.idx].cells, m.q, m.r, tray[m.idx].color);
      grid = played.grid;
      streak = played.lines.length ? streak + 1 : 0;
      tray = replacePiece(tray, m.idx, rng);
    }
    const original = traps.find(
      (t) => t.seed === spec.seed && t.pezzo === spec.ingresso,
    );
    if (
      trapPositionKey({
        cells: [...grid.cells].filter(([, v]) => v).map(([k]) => k),
        tray: tray.map((p) => p.id),
      }) !== trapPositionKey(original.start) ||
      streak !== original.start.streak
    )
      throw new Error(
        `Il replay non coincide con l’ingresso storico: ${spec.seed}`,
      );
    checkpoint.replayVerificato = true;
    report.posizioni.push(checkpoint);
    save();
  }
  const workers = Array.from(
    { length: 2 },
    () => new Worker(new URL(import.meta.url)),
  );
  const call = (worker, job) =>
    new Promise((resolve, reject) => {
      const fail = (error) => {
        worker.off("message", done);
        reject(error);
      };
      const done = (data) => {
        worker.off("error", fail);
        data.error ? reject(new Error(data.error)) : resolve(data.result);
      };
      worker.once("message", done);
      worker.once("error", fail);
      worker.postMessage(job);
    });
  const compare = async (worker, position, move, phase) => {
    const key = `${position.seed}|${move.idx},${move.q},${move.r}|${phase}`;
    if (report.cache[key]) return report.cache[key];
    const settings = report.fasi[phase];
    const result = await call(worker, {
      posizione: position.posizione,
      tua: move,
      suggerita: position.suggerita,
      count: settings.futuri,
      seed: settings.seme,
    });
    report.cache[key] = result;
    save();
    return result;
  };
  const keyOf = (m) => `${m.pezzo}|${m.q},${m.r}`;
  const screening = report.posizioni.flatMap((p) =>
    p.candidate
      .filter((m) => keyOf(m) !== keyOf(p.suggerita))
      .map((move) => ({ p, move })),
  );
  let next = 0;
  try {
    await Promise.all(
      workers.map(async (worker) => {
        while (next < screening.length) {
          const { p, move } = screening[next++];
          const result = await compare(worker, p, move, "prova");
          p.prove = p.prove.filter((r) => keyOf(r.mossa) !== keyOf(move));
          p.prove.push({ mossa: move, risultato: result });
          save();
          console.log(
            `Prova ${p.seed}: ${move.pezzo} q${move.q} r${move.r}: ${result.differenza.toFixed(1)} ± ${result.errore.toFixed(1)} (${p.prove.length}/${p.candidate.length - 1})`,
          );
        }
      }),
    );
    await Promise.all(
      report.posizioni.map(async (p, i) => {
        const ranked = [...p.prove].sort(
          (a, b) => b.risultato.differenza - a.risultato.differenza,
        );
        const best = ranked[0];
        if (!best || !isBetter(best.risultato)) {
          p.esito = "nessuna candidata promettente";
          save();
          return;
        }
        p.selezionata = best.mossa;
        p.prova = best.risultato;
        p.conferma = await compare(workers[i], p, best.mossa, "conferma");
        console.log(
          `Conferma ${p.seed}: ${p.conferma.differenza.toFixed(1)} ± ${p.conferma.errore.toFixed(1)}`,
        );
        if (!isBetter(p.conferma)) {
          p.esito = "vantaggio non confermato";
          save();
          return;
        }
        p.verifica = await compare(workers[i], p, best.mossa, "verifica");
        p.esito = isBetter(p.verifica)
          ? "migliore confermata e verificata"
          : "vantaggio non replicato su 300 futuri";
        console.log(
          `Verifica ${p.seed}: ${p.verifica.differenza.toFixed(1)} ± ${p.verifica.errore.toFixed(1)} · ${p.esito}`,
        );
        save();
      }),
    );
    const records = report.posizioni
      .filter((p) => p.esito === "migliore confermata e verificata")
      .map((p) => ({
        id: `trappola-preingresso-${p.seed}-${p.ingresso}#${p.passo + 1}|${p.selezionata.idx},${p.selezionata.q},${p.selezionata.r}|${strategyId}|paired-v1`,
        partita: `preingresso-${p.seed}-${p.ingresso}`,
        mossa: p.passo + 1,
        stato: "confermata",
        origine: "ricerca-automatica-preingresso",
        seed: p.seed,
        ingresso: p.ingresso,
        mossePrimaIngresso: p.prima,
        posizione: p.posizione,
        tua: p.selezionata,
        suggerita: p.suggerita,
        prova: p.prova,
        conferma: p.conferma,
        verifica: p.verifica,
        app: {
          strategia: strategyId,
          protocollo: "trappole-paired-v1",
          penalitaBlocco: 1000,
          bloccoFinaleIncluso: true,
          selezione: "una sola candidata per posizione dopo screening",
        },
        aggiunto: new Date().toISOString().slice(0, 10),
      }));
    fs.writeFileSync(
      archivePath,
      JSON.stringify(archiveOf(records), null, 2) + "\n",
    );
    console.log(
      `${records.length} alternative confermate salvate in ${archivePath}`,
    );
  } finally {
    await Promise.all(workers.map((worker) => worker.terminate()));
  }
}
