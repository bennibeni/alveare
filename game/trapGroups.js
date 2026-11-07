import { PIECES } from "./pieces.js";
import { legalMoves } from "./autopsy.js";

/** legalMoves conta una sola volta gli slot contenenti lo stesso pezzo. */
export function hasSingleLegalMove(start) {
  return (
    legalMoves({ cells: start.cells.map((k) => [k, 1]), tray: start.tray })
      .length === 1
  );
}

// La geometria include l'orientamento; la traslazione locale del pezzo è irrilevante.
const shapes = new Map(
  PIECES.map((piece) => {
    const cells = [...piece.cells].sort(
      ([aq, ar], [bq, br]) => aq - bq || ar - br,
    );
    const [q0, r0] = cells[0];
    return [piece.id, JSON.stringify(cells.map(([q, r]) => [q - q0, r - r0]))];
  }),
);

/** Identità visiva: occupazione e multinsieme delle tre forme orientate. */
export function trapPositionKey(start) {
  const forms = start.tray
    .map((id) => {
      if (!shapes.has(id)) throw new Error(`Pezzo sconosciuto: ${id}`);
      return shapes.get(id);
    })
    .sort();
  return JSON.stringify([[...new Set(start.cells)].sort(), forms]);
}

export function groupTraps(traps) {
  const groups = new Map();
  for (const trap of traps) {
    const key = trapPositionKey(trap.start);
    if (!groups.has(key)) groups.set(key, { key, members: [] });
    groups.get(key).members.push(trap);
  }
  return [...groups.values()];
}

export const trapId = (trap) => `${trap.seed}-${trap.pezzo}-${trap.k}`;
export const trapSource = (trap) => `trappola-${trapId(trap)}`;

export function groupEvaluations(group, records) {
  const sources = new Set(group.members.map(trapSource));
  return records.filter((record) => sources.has(record.partita));
}
export function groupStatus(group, records) {
  const attempts = groupEvaluations(group, records);
  return attempts.some((r) => r.stato === "confermata")
    ? "migliore"
    : attempts.length
      ? "analizzata"
      : "nuova";
}
export function improvedTrapsExport(groups, records) {
  return {
    format: "alveare-trappole-con-mosse-migliori",
    version: 1,
    posizioni: groups
      .filter((g) => groupStatus(g, records) === "migliore")
      .map((group) => ({
        posizione: group.members[0].start,
        continuazioni: group.members,
        valutazioni: groupEvaluations(group, records),
      })),
  };
}
