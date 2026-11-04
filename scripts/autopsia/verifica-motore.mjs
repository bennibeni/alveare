#!/usr/bin/env node
/** Confronta il motore a bit con HexGrid.play su 3.000 mosse a caso: deve stampare 0 discrepanze. */
import { HexGrid, P, PLACE, play, occOf, pieceIndex } from "./motore.mjs";

const rng = P.seededRandom(5);
let g = new HexGrid(4);
let bad = 0;
for (let t = 0; t < 3000; t++) {
  const p = P.randomPiece(rng);
  const pl = g.placementsFor(p.cells);
  if (!pl.length) {
    g = new HexGrid(4);
    continue;
  }
  const [q, r] = pl[Math.floor(rng() * pl.length)];
  const m = PLACE[pieceIndex.get(p.id)].find(
    (x) => x[1] === q && x[2] === r,
  )[0];
  const [o2, nl] = play(occOf(g), m);
  const res = g.play(p.cells, q, r, 1);
  g = res.grid;
  if (occOf(g) !== o2 || nl !== res.lines.length) bad++;
}
console.log(`discrepanze: ${bad}`);
process.exit(bad ? 1 : 0);
