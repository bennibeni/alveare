#!/usr/bin/env node
/** node scripts/importa-trappole.mjs FILE_ESPORTATO [FILE_ARCHIVIO] */
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import HexGrid from "../game/HexGrid.js";
import { PIECES } from "../game/pieces.js";
import { archiveOf } from "../game/trapArchive.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const [input, output = path.join(root, "data/mosse-migliori.json")] =
  process.argv.slice(2);
if (!input)
  throw new Error(
    "Uso: node scripts/importa-trappole.mjs FILE_ESPORTATO [FILE_ARCHIVIO]",
  );
const incoming = JSON.parse(fs.readFileSync(input, "utf8"));
if (
  incoming.format !== "alveare-mosse-umane" ||
  incoming.version !== 1 ||
  !Array.isArray(incoming.records)
)
  throw new Error("Formato di archivio non valido");
const pieces = new Map(PIECES.map((p) => [p.id, p]));
for (const rec of incoming.records) {
  const validMeasure = (m, count, seed) =>
    m?.futuri === count &&
    m.mosse === 15 &&
    m.seme === seed &&
    Number.isFinite(m.differenza) &&
    Number.isFinite(m.errore) &&
    m.errore >= 0 &&
    m.differenza > 2 * m.errore &&
    [m.a, m.b].every(
      (side) =>
        Number.isFinite(side?.punti) &&
        Number.isInteger(side.blocchi) &&
        side.blocchi >= 0 &&
        side.blocchi <= count,
    );
  if (
    typeof rec.id !== "string" ||
    !rec.id.startsWith("trappola-") ||
    rec.stato !== "confermata" ||
    rec.app?.protocollo !== "trappole-paired-v1" ||
    !validMeasure(rec.prova, 30, 777) ||
    !validMeasure(rec.conferma, 100, 99991)
  )
    throw new Error("Record non confermato o protocollo non riconosciuto");
  const pos = rec.posizione;
  if (
    !Array.isArray(pos?.celle) ||
    !Array.isArray(pos.vassoio) ||
    pos.vassoio.length !== 3 ||
    !Number.isInteger(pos.combo) ||
    pos.combo < 0
  )
    throw new Error("Posizione non valida");
  const cells = new Map(new HexGrid(4).cells);
  for (const k of pos.celle) {
    if (!cells.has(k)) throw new Error("Cella non valida");
    cells.set(k, 1);
  }
  const grid = new HexGrid(4, cells);
  for (const m of [rec.tua, rec.suggerita]) {
    const piece = pieces.get(pos.vassoio[m?.idx]);
    if (
      !piece ||
      !Number.isInteger(m.q) ||
      !Number.isInteger(m.r) ||
      !grid.canPlace(piece.cells, m.q, m.r)
    )
      throw new Error("Mossa non valida");
  }
}
const archive = fs.existsSync(output)
  ? JSON.parse(fs.readFileSync(output, "utf8"))
  : archiveOf([]);
if (archive.format !== "alveare-mosse-umane" || !Array.isArray(archive.records))
  throw new Error("Archivio di destinazione non valido");
const seen = new Set(archive.records.map((r) => r.id));
let added = 0;
for (const record of incoming.records) {
  if (seen.has(record.id)) continue;
  archive.records.push(record);
  seen.add(record.id);
  added++;
}
const temporary = `${output}.tmp`;
fs.writeFileSync(temporary, JSON.stringify(archive, null, 1) + "\n", {
  flag: "wx",
});
fs.renameSync(temporary, output);
console.log(
  `${added} mosse aggiunte a ${output} (totale ${archive.records.length}).`,
);
