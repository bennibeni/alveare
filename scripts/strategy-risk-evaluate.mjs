#!/usr/bin/env node
/** Confronto delle prime mosse, con continuazioni uguali della strategia di riferimento.
 * node scripts/strategy-risk-evaluate.mjs --set taratura|verifica|umane
 * --variants base,probabilistica,prudente,forte
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  Worker,
  isMainThread,
  parentPort,
  workerData,
} from "node:worker_threads";

if (!isMainThread) {
  const load = (file) =>
    import(pathToFileURL(path.join(workerData.base, file)));
  const { default: HexGrid } = await load("HexGrid.js");
  const { PIECES, replacePiece, seededRandom } = await load("pieces.js");
  const { bestMove } = await load("strategy.js");
  const byId = new Map(PIECES.map((p) => [p.id, p]));
  parentPort.on("message", (job) => {
    try {
      const cells = new Map(new HexGrid(4).cells);
      for (const k of job.position.cells) cells.set(k, 1);
      let grid = new HexGrid(4, cells),
        tray = job.position.tray.map((id) => byId.get(id)),
        streak = job.position.streak;
      const rng = seededRandom(job.seed);
      let points = 0,
        moves = 0;
      for (; moves < job.horizon; moves++) {
        const move = moves === 0 ? job.move : bestMove(grid, tray, streak);
        if (!move) break;
        const p = tray[move.idx];
        if (!grid.canPlace(p.cells, move.q, move.r))
          throw new Error("Mossa illegale nel benchmark");
        const played = grid.play(p.cells, move.q, move.r, p.color);
        points +=
          p.cells.length +
          (played.lines.length
            ? Math.round(
                played.clearedCells.size *
                  played.lines.length *
                  (1 + 0.5 * streak),
              )
            : 0);
        grid = played.grid;
        tray = replacePiece(tray, move.idx, rng);
        streak = played.lines.length ? streak + 1 : 0;
      }
      const blocked = !tray.some((p) => grid.fits(p.cells));
      parentPort.postMessage({
        points,
        moves,
        blocked,
        value: points - 1000 * Number(blocked),
      });
    } catch (error) {
      parentPort.postMessage({ error: error.message });
    }
  });
} else {
  const root = fileURLToPath(new URL("../", import.meta.url));
  const args = {};
  for (let i = 2; i < process.argv.length; i += 2)
    args[process.argv[i].slice(2)] = process.argv[i + 1];
  const set = args.set ?? "taratura";
  if (!["taratura", "verifica", "umane"].includes(set))
    throw new Error("Set sconosciuto");
  const directory = path.join(root, "data/autopsia/autogioco-rischio");
  const manifest = JSON.parse(
    fs.readFileSync(path.join(directory, "varianti.json"), "utf8"),
  );
  const requested = (
    args.variants ?? "base,probabilistica,prudente,forte"
  ).split(",");
  const variants = manifest.variants.filter((v) => requested.includes(v.name));
  if (!variants.some((v) => v.name === "base"))
    throw new Error("Serve la strategia base");
  const baseDir = manifest.variants.find((v) => v.name === "base").dir;
  const { default: HexGrid } = await import(
    pathToFileURL(path.join(baseDir, "HexGrid.js"))
  );
  const { PIECES } = await import(
    pathToFileURL(path.join(baseDir, "pieces.js"))
  );
  const byId = new Map(PIECES.map((p) => [p.id, p]));
  let positions =
    set === "umane"
      ? JSON.parse(
          fs.readFileSync(path.join(root, "data/mosse-migliori.json"), "utf8"),
        ).records.map((r, i) => ({
          id: r.id,
          cells: r.posizione.celle,
          tray: r.posizione.vassoio,
          streak: r.posizione.combo,
          seeds: Array.from(
            { length: 5 },
            (_, f) => 20261109 + i * 13 + f * 104729,
          ),
          horizon: 16,
        }))
      : JSON.parse(
          fs.readFileSync(
            path.join(root, "data/archivio-affollate.json"),
            "utf8",
          ),
        )
          .positions.filter((p) => p.set === set)
          .map((p) => ({
            id: p.id,
            cells: p.cells.map(([q, r]) => `${q},${r}`),
            tray: p.tray,
            streak: p.streak,
            seeds: [p.futureSeed],
            horizon: 20,
          }));
  const choices = {};
  for (const variant of variants) {
    const { bestMove } = await import(
      pathToFileURL(path.join(variant.dir, "strategy.js"))
    );
    choices[variant.name] = [];
    const started = performance.now();
    for (const position of positions) {
      const cells = new Map(new HexGrid(4).cells);
      for (const k of position.cells) cells.set(k, 1);
      const tray = position.tray.map((id) => byId.get(id));
      const move = bestMove(new HexGrid(4, cells), tray, position.streak);
      choices[variant.name].push({
        id: position.id,
        move: move && { idx: move.idx, q: move.q, r: move.r },
        key: move ? `${tray[move.idx].id}:${move.q},${move.r}` : "bloccata",
      });
    }
    variant.choiceMilliseconds = performance.now() - started;
    console.log(
      `${set} · scelte ${variant.name}: ${positions.length}, ${Math.round(variant.choiceMilliseconds)} ms`,
    );
  }
  const availablePositions = positions.length;
  if (args["changed-only"] === "1") {
    const indices = positions
      .map((_, i) => i)
      .filter((i) =>
        variants.some((v) => choices[v.name][i].key !== choices.base[i].key),
      );
    positions = indices.map((i) => positions[i]);
    for (const variant of variants)
      choices[variant.name] = indices.map((i) => choices[variant.name][i]);
  }
  const repetitions = Number(args.repetitions ?? 0);
  if (repetitions)
    positions = positions.map((p, i) => ({
      ...p,
      seeds: Array.from(
        { length: repetitions },
        (_, f) => 20361107 + i * 13 + f * 104729,
      ),
    }));
  const stem = `${set}${repetitions ? `-repliche${repetitions}` : ""}${args["changed-only"] === "1" ? "-modificate" : ""}`;
  const cacheFile = path.join(directory, `${stem}-cache.json`);
  const previous = fs.existsSync(cacheFile)
    ? JSON.parse(fs.readFileSync(cacheFile, "utf8"))
    : null;
  const cache =
    previous?.baselineSha256 === manifest.baselineSha256
      ? previous
      : { baselineSha256: manifest.baselineSha256, results: {} };
  const jobs = new Map();
  for (const variant of variants)
    choices[variant.name].forEach((choice, i) => {
      for (const seed of positions[i].seeds) {
        const key = `${positions[i].id}|${choice.key}|${seed}`;
        if (!cache.results[key])
          jobs.set(key, {
            key,
            position: positions[i],
            move: choice.move,
            seed,
            horizon: positions[i].horizon,
          });
      }
    });
  const pending = [...jobs.values()];
  let next = 0,
    done = 0;
  console.log(
    `${pending.length} continuazioni uniche da valutare (cache condivisa fra mosse uguali)`,
  );
  const workers = Array.from(
    { length: 2 },
    () =>
      new Worker(new URL(import.meta.url), { workerData: { base: baseDir } }),
  );
  const call = (worker, job) =>
    new Promise((resolve, reject) => {
      const fail = (error) => {
        worker.off("message", receive);
        reject(error);
      };
      const receive = (data) => {
        worker.off("error", fail);
        data.error ? reject(new Error(data.error)) : resolve(data);
      };
      worker.once("message", receive);
      worker.once("error", fail);
      worker.postMessage(job);
    });
  try {
    await Promise.all(
      workers.map(async (worker) => {
        while (next < pending.length) {
          const job = pending[next++];
          cache.results[job.key] = await call(worker, job);
          fs.writeFileSync(cacheFile, JSON.stringify(cache));
          if (++done % 20 === 0 || done === pending.length)
            console.log(`${set}: ${done}/${pending.length}`);
        }
      }),
    );
  } finally {
    await Promise.all(workers.map((worker) => worker.terminate()));
  }
  const rows = variants.map((variant) => {
    let blocked = 0,
      baselineBlocked = 0,
      changed = 0,
      wins = 0,
      losses = 0;
    const differences = [],
      positionDifferences = [];
    choices[variant.name].forEach((choice, i) => {
      const base = choices.base[i];
      if (choice.key !== base.key) changed++;
      const pairDiffs = [];
      for (const seed of positions[i].seeds) {
        const r = cache.results[`${positions[i].id}|${choice.key}|${seed}`];
        const b = cache.results[`${positions[i].id}|${base.key}|${seed}`];
        blocked += Number(r.blocked);
        baselineBlocked += Number(b.blocked);
        if (!r.blocked && b.blocked) wins++;
        if (r.blocked && !b.blocked) losses++;
        differences.push(r.value - b.value);
        pairDiffs.push(r.value - b.value);
      }
      positionDifferences.push(
        pairDiffs.reduce((a, b) => a + b, 0) / pairDiffs.length,
      );
    });
    const mean = differences.reduce((a, b) => a + b, 0) / differences.length;
    const positionMean =
      positionDifferences.reduce((a, b) => a + b, 0) /
      positionDifferences.length;
    const se = Math.sqrt(
      positionDifferences.reduce((s, n) => s + (n - positionMean) ** 2, 0) /
        Math.max(1, positionDifferences.length - 1) /
        positionDifferences.length,
    );
    return {
      variant: variant.name,
      variantSha256: variant.sha256,
      positions: positions.length,
      availablePositions,
      futures: differences.length,
      changed,
      blocked,
      baselineBlocked,
      wins,
      losses,
      mean,
      positionStandardError: positionDifferences.length > 1 ? se : null,
      futureStandardError: Math.sqrt(
        differences.reduce((s, n) => s + (n - mean) ** 2, 0) /
          Math.max(1, differences.length - 1) /
          differences.length,
      ),
      choiceMilliseconds: variant.choiceMilliseconds,
    };
  });
  const result = {
    set,
    baselineSha256: manifest.baselineSha256,
    continuation: "base",
    comparison: "prima mossa della variante, poi identica strategia base",
    rows,
    choices,
  };
  fs.writeFileSync(
    path.join(directory, `${stem}.json`),
    JSON.stringify(result, null, 2) + "\n",
  );
  console.log(JSON.stringify(rows, null, 2));
}
