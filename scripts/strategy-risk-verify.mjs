#!/usr/bin/env node
/** Verifica che la versione rifinita scelga esattamente come il prototipo misurato. */
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { fileURLToPath, pathToFileURL } from "node:url";
import HexGrid from "../game/HexGrid.js";
import { PIECES } from "../game/pieces.js";
import { explainNormal } from "../game/strategy.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const reference = await import(
  pathToFileURL(
    path.join(root, ".strategy-lab/risk-20261107/soccorso/strategy.js"),
  )
);
const byId = new Map(PIECES.map((p) => [p.id, p]));
const human = JSON.parse(
  fs.readFileSync(path.join(root, "data/mosse-migliori.json"), "utf8"),
).records.map((r) => ({
  id: r.id,
  cells: r.posizione.celle,
  tray: r.posizione.vassoio,
  streak: r.posizione.combo,
}));
const crowded = JSON.parse(
  fs.readFileSync(path.join(root, "data/archivio-affollate.json"), "utf8"),
).positions.map((p) => ({ ...p, cells: p.cells.map(([q, r]) => `${q},${r}`) }));
const positions = [...human, ...crowded];
let critical = 0;
const view = (m) => ({
  idx: m.idx,
  q: m.q,
  r: m.r,
  total: m.total,
  rescue: m.rescue,
});
for (const [i, position] of positions.entries()) {
  const cells = new Map(new HexGrid(4).cells);
  for (const k of position.cells) cells.set(k, 1);
  const grid = new HexGrid(4, cells),
    tray = position.tray.map((id) => byId.get(id));
  const expected = reference.explainNormal(grid, tray, position.streak);
  const actual = explainNormal(grid, tray, position.streak);
  assert.deepEqual(
    actual.byTotal.map(view),
    expected.byTotal.map(view),
    position.id,
  );
  if (actual.byTotal[0]?.rescue) critical++;
  if ((i + 1) % 40 === 0) console.log(`${i + 1}/${positions.length}`);
}
const report = {
  positions: positions.length,
  critical,
  identicalRankings: true,
  note: "Classifiche, punteggi e conteggi dei futuri uguali al prototipo, non solo la prima mossa.",
};
fs.writeFileSync(
  path.join(
    root,
    "data/autopsia/autogioco-rischio/equivalenza-produzione.json",
  ),
  JSON.stringify(report, null, 2) + "\n",
);
console.log(JSON.stringify(report));
