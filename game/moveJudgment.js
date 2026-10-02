// Soglie descrittive del confronto: non cambiano la strategia di gioco.
export const JUDGMENT_LIMITS = {
  comparable: 0.05, strongGap: 0.30, exceptionalGap: 0.50, clearlyBetter: 0.20, clearlyBetterShare: 2 / 3,
  notableLead: 0.10, riskIncrease: 0.20, highRisk: 0.50, extremeRisk: 0.80,
};

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const i = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[i] : (sorted[i - 1] + sorted[i]) / 2;
};

function riskOf(move, knownPieces) {
  if (move.sequence) return {
    blocked: move.sequence.path.length < knownPieces,
    death: move.sequence.unknown.death,
  };
  return { blocked: !move.next, death: null };
}

/** Giudica solo le candidate approfondite + la mossa manuale eventualmente aggiunta.
 * La scala usa massimo e mediana, mai score/massimo: funziona anche con 0 e negativi.
 * Le categorie migliore/comparabile/inferiore sono disgiunte e non contano la mossa stessa.
 */
export function judgeMove(analysis, knownPieces = 3) {
  const played = analysis?.moves.find((m) => m.played);
  if (!played || !analysis.moves.every((m) => Number.isFinite(m.total))) return null;
  const moves = analysis.moves;
  const others = moves.filter((m) => m !== played);
  const best = moves.reduce((a, b) => b.total > a.total ? b : a);
  const maximum = best.total;
  const middle = median(moves.map((m) => m.total));
  const scale = Math.max(1, Math.abs(maximum), Math.abs(middle));
  const epsilon = scale * 1e-9;
  const tolerance = scale * JUDGMENT_LIMITS.comparable;
  const gap = Math.max(0, maximum - played.total);
  const relativeGap = gap / scale;
  const better = others.filter((m) => m.total - played.total > tolerance).length;
  const worse = others.filter((m) => played.total - m.total > tolerance).length;
  const comparable = others.length - better - worse;
  // Per il giudizio negativo non basta uscire dalla fascia comparabile del 5%.
  // Includere il valore assoluto della mossa evita distacchi gonfiati quando
  // il massimo è vicino a zero e la mossa giocata ha un punteggio negativo.
  const lossScale = Math.max(scale, Math.abs(played.total));
  const clearlyBetterTolerance = lossScale * JUDGMENT_LIMITS.clearlyBetter;
  const clearlyBetter = others.filter((m) => m.total - played.total > clearlyBetterTolerance).length;
  const requiredClearlyBetter = Math.max(2, Math.ceil(others.length * JUDGMENT_LIMITS.clearlyBetterShare));
  const exceptionalLoss = clearlyBetter >= 1 && gap / lossScale >= JUDGMENT_LIMITS.exceptionalGap;
  const rank = 1 + others.filter((m) => m.total - played.total > epsilon).length;
  const tied = others.filter((m) => Math.abs(m.total - played.total) <= epsilon).length;
  const risk = riskOf(played, knownPieces);
  const bestRisk = riskOf(best, knownPieces);
  // Il riferimento per la sicurezza è l'alternativa meno rischiosa, anche
  // quando il suo punteggio strategico è inferiore a quello della mossa giocata.
  const continuingRisks = others.map((m) => riskOf(m, knownPieces)).filter((r) => !r.blocked);
  const safestDeath = continuingRisks.reduce((minimum, r) =>
    r.death === null ? minimum : Math.min(minimum, r.death), Infinity);
  const avoidableBlock = risk.blocked && continuingRisks.length > 0;
  const riskIncrease = !risk.blocked && risk.death !== null && Number.isFinite(safestDeath)
    ? risk.death - safestDeath : 0;
  const risky = avoidableBlock || riskIncrease + 1e-9 >= JUDGMENT_LIMITS.riskIncrease;
  const enough = others.length >= 2;
  const majority = Math.ceil(others.length / 2);
  let label = "Mossa migliorabile";
  let emphasis = "neutral";
  let reason = "Il distacco dalle migliori suggerisce che c’erano alternative più efficaci.";

  if (analysis.totalMoves === 1) {
    label = "Mossa obbligata";
    reason = "Era l’unica mossa legale: il punteggio non misura una scelta fra alternative.";
  } else if (!others.length) {
    label = "Mossa poco promettente";
    reason = "La ricerca ha conservato una sola mossa distinta: non basta per premiare o criticare la scelta.";
  } else if (risky && (avoidableBlock || risk.death >= JUDGMENT_LIMITS.extremeRisk)) {
    label = "Mossa pessima";
    emphasis = "negative";
    reason = avoidableBlock
      ? "La ricerca non trova una prosecuzione con i pezzi già noti, mentre un’altra mossa la permette. Il rischio di blocco prevale sul punteggio."
      : "Il rischio stimato di blocco al pezzo ignoto è almeno dell’80%, con un’alternativa più sicura di almeno 20 punti percentuali. Il rischio prevale sul punteggio.";
  } else if (risky && risk.death >= JUDGMENT_LIMITS.highRisk) {
    label = "Mossa cattiva";
    emphasis = "negative";
    reason = "Il rischio stimato di blocco al pezzo ignoto è almeno del 50%, con un’alternativa più sicura di almeno 20 punti percentuali. Il rischio prevale sul punteggio.";
  } else if (risky) {
    label = "Mossa rischiosa";
    emphasis = "negative";
    reason = "Aumenta il rischio stimato di blocco di almeno 20 punti percentuali rispetto a un’alternativa più sicura, anche se il punteggio è buono.";
  } else if (exceptionalLoss || (gap / lossScale >= JUDGMENT_LIMITS.strongGap && clearlyBetter >= requiredClearlyBetter)) {
    label = "Occasione persa";
    emphasis = "negative";
    reason = exceptionalLoss
      ? "C’era un’alternativa con un vantaggio di almeno il 50% della scala di confronto: basta questa occasione nettamente superiore, indipendentemente dalla posizione in classifica."
      : "Distacco dal massimo di almeno il 30% della scala di confronto; almeno due alternative, pari ad almeno due terzi delle valutate, superano la mossa di oltre il 20% della stessa scala.";
  } else if (gap <= epsilon && enough && worse >= majority && (played.total - middle) / scale >= JUDGMENT_LIMITS.notableLead
    && !risk.blocked && (risk.death === null || risk.death < JUDGMENT_LIMITS.riskIncrease)) {
    label = played.added ? "Ottima scoperta" : "Ottima mossa";
    emphasis = "positive";
    reason = "Prima in classifica, con vantaggio significativo sulla mediana e almeno metà delle alternative nettamente inferiori.";
  } else if (!better && !worse) {
    label = "Una mossa vale l’altra";
    reason = "Tutte le alternative valutate hanno punteggi comparabili: nessuna differenza merita un segnale speciale.";
  } else if (gap <= epsilon && (risk.blocked || risk.death >= JUDGMENT_LIMITS.riskIncrease)) {
    label = "Migliore disponibile";
    reason = "È al massimo fra le mosse valutate, ma rimane un rischio di prosecuzione: nessun premio sonoro.";
  } else if (relativeGap <= JUDGMENT_LIMITS.comparable) {
    label = "Buona mossa";
    reason = "Il punteggio è entro la fascia delle migliori; il distacco è piccolo.";
  } else if (relativeGap < 0.20 && rank <= Math.ceil(moves.length / 2)) {
    label = "Mossa discreta";
    reason = "Resta nella metà superiore della classifica, con un distacco contenuto dal massimo.";
  }

  return {
    label, emphasis, reason, score: played.total, maximum, gap, relativeGap,
    rank, tied, count: moves.length, totalMoves: analysis.totalMoves,
    better, comparable, worse, tolerance, middle, risk, bestRisk,
    clearlyBetter, clearlyBetterTolerance, requiredClearlyBetter,
    safestDeath: Number.isFinite(safestDeath) ? safestDeath : null,
    added: !!played.added,
  };
}
