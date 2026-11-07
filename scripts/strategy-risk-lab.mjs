#!/usr/bin/env node
/** Varianti riproducibili in .strategy-lab; nessuna modifica al motore di gioco. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import HexGrid from "../game/HexGrid.js";
import { PIECES } from "../game/pieces.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const lab = path.join(root, ".strategy-lab/risk-20261107");
const out = path.join(root, "data/autopsia/autogioco-rischio");
fs.mkdirSync(out, { recursive: true });
const savedBaseline = path.join(lab, "base/strategy.js");
const original = fs.readFileSync(
  fs.existsSync(savedBaseline)
    ? savedBaseline
    : path.join(root, "game/strategy.js"),
  "utf8",
);
const variants = [
  { name: "base", risk: 1600 },
  { name: "probabilistica", risk: 1600 },
  { name: "prudente", risk: 3200 },
  { name: "forte", risk: 5000 },
  { name: "futuro25", chanceWeight: 0.25 },
  { name: "futuro50", chanceWeight: 0.5 },
  { name: "futuro100", chanceWeight: 1 },
  { name: "soccorso", rescue: true },
];
const replace = (text, before, after) => {
  if (text.split(before).length !== 2)
    throw new Error(`Punto di modifica non univoco: ${before}`);
  return text.replace(before, after);
};
for (const variant of variants) {
  const dir = path.join(lab, variant.name);
  fs.mkdirSync(dir, { recursive: true });
  for (const file of fs
    .readdirSync(path.join(root, "game"))
    .filter((f) => f.endsWith(".js")))
    fs.copyFileSync(path.join(root, "game", file), path.join(dir, file));
  fs.writeFileSync(path.join(lab, "package.json"), '{"type":"module"}\n');
  let source = original;
  if (variant.rescue) {
    source = source.replaceAll("\r\n", "\n");
    source = replace(
      source,
      'import { PIECES, SHAPES } from "./pieces.js";',
      'import { PIECES, SHAPES, replacePiece, seededRandom } from "./pieces.js";',
    );
    source = replace(
      source,
      "  return {\n    totalMoves: moves.length,\n    deep,\n    newPiece,",
      `  if (deep) {
    const rescued = rescueCandidates(byTotal, tray);
    if (rescued !== byTotal) {
      const changed = new Map(rescued.map((m) => [m.idx + ":" + m.q + ":" + m.r, m]));
      byValue = byValue.map((m) => changed.get(m.idx + ":" + m.q + ":" + m.r) || m);
      byTotal = rescued;
    }
  }
  return {
    totalMoves: moves.length,
    deep,
    newPiece,`,
    );
    source += `
// Prova futuri reali solo quando nessuna candidata ha una continuazione nota.
let rescueActive = false;
function rescueCandidates(candidates, tray) {
  if (rescueActive || candidates.length < 2 || candidates.length > 8 || candidates[0].total > -9000) return candidates;
  rescueActive = true;
  try {
    return candidates.map((first) => {
      let total = 0, lost = 0;
      for (let f = 0; f < 24; f++) {
        const rng = seededRandom(15131 + f * 7919);
        let grid = first.after, pieces = replacePiece(tray, first.idx, rng), streak = first.nextStreak, points = first.piece.cells.length + Math.round(first.gain), blocked = false;
        for (let k = 1; k < 8; k++) {
          const next = normalCandidates(grid, pieces, streak).byTotal[0];
          if (!next) { blocked = true; break; }
          points += next.piece.cells.length + Math.round(next.gain);
          grid = next.after; pieces = replacePiece(pieces, next.idx, rng); streak = next.nextStreak;
        }
        blocked ||= !pieces.some((p) => grid.fits(p.cells));
        lost += Number(blocked);
        total += points - 1000 * Number(blocked);
      }
      return { ...first, knownTotal: first.total, rescue: { futures: 24, horizon: 8, lost }, total: total / 24 };
    }).sort((a,b) => b.total-a.total);
  } finally { rescueActive = false; }
}
`;
  } else if (variant.chanceWeight) {
    source = replace(
      source,
      "  const newPiece = !deep && usesNewPiece(grid);",
      `  if (deep && moves.length <= 12) {
    const top = byTotal.slice(0, NORMAL_NEW_TOP);
    const redone = new Map(top.map((m) => {
      const future = withNewPiece(withLookahead(m, tray, false), tray);
      return [m, { ...m, chanceTotal: future.total, total: ${1} * m.total + ${variant.chanceWeight} * (future.total - m.total) }];
    }));
    byValue = byValue.map((m) => redone.get(m) || m);
    byTotal = [...[...redone.values()].sort((a,b) => b.total-a.total), ...byTotal.slice(NORMAL_NEW_TOP)];
  }
  const newPiece = !deep && usesNewPiece(grid);`,
    );
  } else if (variant.name !== "base") {
    source = replace(
      source,
      "function leafValue(mv) {",
      "function leafValue(mv, riskWeight = NORMAL_LEARNED) {",
    );
    source = replace(
      source,
      "NORMAL_LEARNED * learnedRisk(mv.after)",
      "riskWeight * learnedRisk(mv.after)",
    );
    source = replace(
      source,
      "const roomPenalty = !third && pending ? NORMAL_DEEP_BLOCK : 0;",
      "const roomPenalty = !third && pending ? NORMAL_DEEP_BLOCK * death * death : 0;",
    );
    source = replace(
      source,
      "m.gain * W.cell + clearBonus + middle + leafValue(last) - roomPenalty;",
      `m.gain * W.cell + clearBonus + middle + leafValue(last, ${variant.risk}) - roomPenalty;`,
    );
    source = replace(
      source,
      "if (!best) return { ...withLookahead(m, tray), deep: true, third: null };",
      "if (!best) return { ...withNewPiece(withLookahead(m, tray, false), tray), deep: true, third: null };",
    );
  }
  fs.writeFileSync(path.join(dir, "strategy.js"), source);
  variant.dir = dir;
  variant.sha256 = createHash("sha256").update(source).digest("hex");
}
const archive = JSON.parse(
  fs.readFileSync(path.join(root, "data/mosse-migliori.json"), "utf8"),
);
const byId = new Map(PIECES.map((p) => [p.id, p]));
const choices = [];
for (const variant of variants) {
  const { bestMove } = await import(
    pathToFileURL(path.join(variant.dir, "strategy.js"))
  );
  let matches = 0;
  const rows = [];
  const started = performance.now();
  for (const record of archive.records) {
    const cells = new Map(new HexGrid(4).cells);
    for (const k of record.posizione.celle) cells.set(k, 1);
    const grid = new HexGrid(4, cells);
    const tray = record.posizione.vassoio.map((id) => byId.get(id));
    const move = bestMove(grid, tray, record.posizione.combo);
    const human =
      !!move &&
      tray[move.idx].id === record.tua.pezzo &&
      move.q === record.tua.q &&
      move.r === record.tua.r;
    if (human) matches++;
    rows.push({
      id: record.id,
      human,
      move: move && {
        idx: move.idx,
        q: move.q,
        r: move.r,
        piece: tray[move.idx].id,
      },
    });
  }
  const result = {
    ...variant,
    matches,
    milliseconds: performance.now() - started,
    rows,
  };
  choices.push(result);
  console.log(
    JSON.stringify({
      variant: variant.name,
      matches,
      milliseconds: Math.round(result.milliseconds),
      targets: rows.filter((r) => r.id.startsWith("trappola-")),
    }),
  );
}
fs.writeFileSync(
  path.join(out, "varianti.json"),
  JSON.stringify(
    { baselineSha256: variants[0].sha256, variants: choices },
    null,
    2,
  ) + "\n",
);
