import { PIECES, randomPiece, seededRandom } from "./pieces.js";

const totalWeight = PIECES.reduce((sum, p) => sum + p.weight, 0);
export const RISK_SETTINGS = { samples: 128, choiceSamples: 64, maxChoices: 8, seed: 73421, safeRisk: 0.25 };

/** Probabilità esatta sulla griglia immobile, con l'orientamento realmente estratto. */
export function pieceAvailability(grid, maxPlacements = Infinity) {
  const positions = [...grid.cells.keys()].map((key) => key.split(",").map(Number));
  const pieces = PIECES.map((piece) => {
    let placements = 0;
    for (const [q, r] of positions) {
      if (grid.canPlace(piece.cells, q, r) && ++placements >= maxPlacements) break;
    }
    return {
      id: piece.id, name: piece.name, color: piece.color, p: piece.weight / totalWeight,
      placements,
    };
  });
  const death = pieces.reduce((sum, p) => sum + (p.placements ? 0 : p.p), 0);
  const room = pieces.reduce((sum, p) => sum + p.p * Math.min(6, p.placements) / 6, 0);
  return { death: Math.min(1, death), room, playableOrientations: pieces.filter((p) => p.placements > 0).length, pieces };
}

export function legalPlacements(grid, tray, expert) {
  return tray.flatMap((p, idx) => !p || (expert && idx !== 0) ? []
    : grid.placementsFor(p.cells).map(([q, r]) => ({ idx, q, r })));
}

const neighborLayouts = new Map();

function geometry(grid) {
  if (!neighborLayouts.has(grid.radius)) {
    neighborLayouts.set(grid.radius, [...grid.cells.keys()].map((key) => {
      const [q, r] = key.split(",").map(Number);
      return [key, grid.getNeighbors(q, r).map(([a, b]) => `${a},${b}`)];
    }));
  }
  let empty = 0, holes = 0, isolated = 0;
  for (const [key, neighbors] of neighborLayouts.get(grid.radius)) {
    if (grid.cells.get(key)) continue;
    empty++;
    let free = 0;
    for (const neighbor of neighbors) if (grid.cells.get(neighbor) === 0) free++;
    if (!free) isolated++;
    else if (free === 1) holes++;
  }
  return empty - 5 * holes - 12 * isolated;
}

/** Politica riproducibile di prosecuzione: vede solo griglia e vassoio correnti.
 * Seleziona tre candidate geometriche, poi privilegia mobilità e pezzi noti.
 * Non è una ricerca ottima: le probabilità simulate sono condizionate a questa politica.
 */
function chooseMove(grid, tray, expert, cache) {
  const key = [...grid.cells.values()].map((v) => v ? "1" : "0").join("") + ":" + tray.map((p) => p?.id || "-").join(",");
  if (cache.has(key)) return cache.get(key);
  const candidates = legalPlacements(grid, tray, expert).map((move) => {
    const after = grid.play(tray[move.idx].cells, move.q, move.r).grid;
    return { ...move, after, score: geometry(after) };
  }).sort((a, b) => b.score - a.score).slice(0, 3);
  for (const move of candidates) {
    const known = expert ? tray.slice(1, 2) : tray.filter((_, idx) => idx !== move.idx);
    const canContinue = known.some((p) => p && move.after.fits(p.cells));
    const availability = pieceAvailability(move.after, 6);
    move.score += 100 * (1 - availability.death) + 10 * availability.room;
    if (!canContinue && known.some(Boolean)) move.score -= expert ? 1000 : 100;
  }
  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0] || null;
  if (cache.size >= 4000) cache.clear();
  cache.set(key, best);
  return best;
}

function interval(failed, samples) {
  const rate = failed / samples, z = 1.96, z2 = z * z;
  const center = (rate + z2 / (2 * samples)) / (1 + z2 / samples);
  const half = z * Math.sqrt(rate * (1 - rate) / samples + z2 / (4 * samples * samples)) / (1 + z2 / samples);
  return { probability: rate, interval95: [Math.max(0, center - half), Math.min(1, center + half)], failed, samples };
}

function simulate(position, samples, seed, firstMove = null, cache = new Map()) {
  let failed3 = 0, failed6 = 0;
  for (let sample = 0; sample < samples; sample++) {
    const rng = seededRandom(seed + sample * 97);
    let { grid, tray } = position;
    let completed = 0;
    for (; completed < 6; completed++) {
      const move = completed === 0 && firstMove ? firstMove : chooseMove(grid, tray, position.expert, cache);
      if (!move) break;
      grid = move.after || grid.play(tray[move.idx].cells, move.q, move.r).grid;
      // L'estrazione avviene solo DOPO la scelta: niente conoscenza del futuro.
      const drawn = randomPiece(rng);
      tray = position.expert ? [tray[1], tray[2], drawn]
        : tray.map((p, idx) => idx === move.idx ? drawn : p);
    }
    if (completed < 3) failed3++;
    if (completed < 6) failed6++;
  }
  return { risk3: interval(failed3, samples), risk6: interval(failed6, samples) };
}

export function estimatePositionRisk(position, candidateMoves = [], settings = {}) {
  const config = { ...RISK_SETTINGS, ...settings };
  if (![config.samples, config.choiceSamples, config.maxChoices].every((n) => Number.isInteger(n) && n > 0)) {
    throw new Error("I limiti della simulazione devono essere interi positivi.");
  }
  const legal = legalPlacements(position.grid, position.tray, position.expert);
  const cache = new Map();
  const ids = new Set(legal.map((m) => `${m.idx}:${m.q}:${m.r}`));
  const seen = new Set();
  // La mossa giocata resta inclusa anche quando il numero di candidate è limitato.
  const selected = [...candidateMoves].sort((a, b) => Number(!!b.played) - Number(!!a.played))
    .filter((m) => {
      const id = `${m.idx}:${m.q}:${m.r}`;
      if (!ids.has(id) || seen.has(id)) return false;
      seen.add(id);
      return true;
    }).slice(0, config.maxChoices);
  const choices = selected.map(({ idx, q, r, played }) => ({ idx, q, r, played: !!played,
    ...simulate(position, config.choiceSamples, config.seed, { idx, q, r }, cache),
  }));
  return {
    method: "survival-rollout-v1", settings: config,
    scope: "Probabilità di non completare 3/6 mosse con una politica euristica, non con gioco ottimo. Intervalli al 95%: incertezza campionaria, non errore della politica. Nessuna estrazione futura è visibile prima della scelta.",
    immediateBlocked: legal.length === 0,
    availability: pieceAvailability(position.grid),
    ...simulate(position, config.samples, config.seed, null, cache),
    margin: { safe: choices.filter((m) => m.risk6.probability <= config.safeRisk).length,
      assessed: choices.length, legal: legal.length, threshold: config.safeRisk,
      confidentSafe: choices.filter((m) => m.risk6.interval95[1] <= config.safeRisk).length },
    choices,
  };
}
