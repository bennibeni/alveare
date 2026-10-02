import { PIECES } from "./pieces.js";

// Soglie descrittive del confronto: non cambiano la strategia di gioco.
export const JUDGMENT_LIMITS = {
  comparable: 0.05, strongGap: 0.30, exceptionalGap: 0.50, clearlyBetter: 0.20, clearlyBetterShare: 2 / 3,
  notableLead: 0.10, playableGap: 0.10, riskIncrease: 0.20, highRisk: 0.50, extremeRisk: 0.80,
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
  // Se la mossa chiude linee, l'occasione deve essere una chiusura immediata
  // maggiore della stessa alternativa che offre anche il vantaggio di punteggio.
  const opportunityMoves = others.filter((m) => !(played.lines > 0) || m.lines > played.lines);
  const opportunityGap = Math.max(0, ...opportunityMoves.map((m) => m.total - played.total));
  const opportunityBetter = opportunityMoves.filter((m) => m.total - played.total > clearlyBetterTolerance).length;
  const exceptionalLoss = opportunityBetter >= 1 && opportunityGap / lossScale >= JUDGMENT_LIMITS.exceptionalGap;
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
  const placementQuality = analysis.placementQuality;
  const singleCellUse = analysis.singleCellUse;
  const isPoint = (played.piece?.cells || played.cells)?.length === 1;
  const productiveClear = played.lines > 0 && placementQuality
    && placementQuality.after.empty > placementQuality.before.empty
    && placementQuality.after.holes <= placementQuality.before.holes
    && placementQuality.after.deadHoles <= placementQuality.before.deadHoles
    && placementQuality.after.fitCount >= placementQuality.before.fitCount;
  const usefulFit = placementQuality && placementQuality.touchingCells >= 2
    && placementQuality.sharedEdges >= 3
    && placementQuality.after.holes <= placementQuality.before.holes
    && placementQuality.after.deadHoles <= placementQuality.before.deadHoles
    && placementQuality.after.fitCount >= placementQuality.before.fitCount;
  // Su una griglia molto aperta, il bonus di una sola linea futura non rende
  // un incastro pulito un errore: contano anche gli effetti concreti.
  const openFitWithDeferredLine = usefulFit && placementQuality.cellCount > 0
    && placementQuality.after.empty >= placementQuality.cellCount * 2 / 3
    && placementQuality.after.holes === 0 && placementQuality.after.deadHoles === 0
    && placementQuality.after.fitCount === PIECES.length
    && moves.every((m) => m.lines === 0 && m.next && m.next.lines <= 1)
    && !risk.blocked && (risk.death === null || risk.death < JUDGMENT_LIMITS.riskIncrease);
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
  } else if (isPoint && !singleCellUse?.netImprovement && singleCellUse?.viableAlternatives > 0) {
    label = "Mossa cattiva";
    emphasis = "negative";
    reason = singleCellUse.canPreservePoint
      ? "Hai consumato il pezzo da una cella senza un netto miglioramento della posizione, mentre potevi giocare un altro pezzo mantenendo una prosecuzione e conservare il punto."
      : "Hai usato il pezzo da una cella senza un netto miglioramento, mentre un’altra sua collocazione permetteva di eliminare linee mantenendo una prosecuzione.";
  } else if (isPoint && !singleCellUse?.netImprovement && singleCellUse?.forcedPiece) {
    label = "Migliore disponibile";
    reason = "Devi usare il pezzo da una cella: non puoi conservarlo giocando un altro pezzo e non emerge una chiusura alternativa praticabile. Il suo consumo non viene premiato come una buona mossa.";
  } else if (isPoint && !singleCellUse) {
    label = "Mossa migliorabile";
    reason = "Per premiare l’uso del pezzo da una cella serve verificare un miglioramento concreto o l’assenza di alternative praticabili.";
  } else if (!openFitWithDeferredLine && (exceptionalLoss || (opportunityGap / lossScale >= JUDGMENT_LIMITS.strongGap && opportunityBetter >= requiredClearlyBetter))) {
    label = "Occasione persa";
    emphasis = "negative";
    reason = exceptionalLoss
      ? "C’era un’alternativa con un vantaggio di almeno il 50% della scala di confronto: basta questa occasione nettamente superiore, indipendentemente dalla posizione in classifica."
      : "Distacco dal massimo di almeno il 30% della scala di confronto; almeno due alternative, pari ad almeno due terzi delle valutate, superano la mossa di oltre il 20% della stessa scala.";
    if (played.lines > 0) reason += ` Le alternative considerate eliminano subito più delle ${played.lines} linee della tua mossa.`;
  } else if (gap <= epsilon && enough && worse >= majority && (played.total - middle) / scale >= JUDGMENT_LIMITS.notableLead
    && !risk.blocked && (risk.death === null || risk.death < JUDGMENT_LIMITS.riskIncrease)) {
    label = played.added ? "Ottima scoperta" : "Ottima mossa";
    emphasis = "positive";
    reason = "Prima in classifica, con vantaggio significativo sulla mediana e almeno metà delle alternative nettamente inferiori.";
  } else if (productiveClear && relativeGap <= JUDGMENT_LIMITS.strongGap
    && !risk.blocked && (risk.death === null || risk.death < JUDGMENT_LIMITS.riskIncrease)) {
    label = "Buona mossa";
    reason = `Hai eliminato ${played.lines === 1 ? "una linea" : `${played.lines} linee`}, aumentando lo spazio libero senza peggiorare le cavità difficili o le forme giocabili. ${gap > tolerance ? "Alcune alternative ottengono un voto superiore, ma la tua scelta migliora concretamente la posizione." : "La valutazione resta vicina alle migliori alternative."}`;
  } else if (openFitWithDeferredLine) {
    label = "Buona mossa";
    reason = "Hai realizzato un incastro senza creare cavità difficili, mantenendo molto spazio e tutti gli orientamenti giocabili. Le alternative preparano al massimo una linea al passo successivo: il loro bonus non rende sbagliata la tua scelta.";
  } else if (usefulFit && relativeGap <= JUDGMENT_LIMITS.comparable
    && !risk.blocked && (risk.death === null || risk.death < JUDGMENT_LIMITS.riskIncrease)) {
    label = "Buona mossa";
    reason = "Il pezzo si incastra con quelli presenti senza aumentare le cavità difficili o ridurre le forme giocabili. La valutazione resta vicina alle migliori alternative.";
  } else if (!better && !worse) {
    label = "Una mossa vale l’altra";
    reason = "Tutte le alternative valutate hanno punteggi comparabili: nessuna differenza merita un segnale speciale.";
  } else if (gap <= epsilon && (risk.blocked || risk.death >= JUDGMENT_LIMITS.riskIncrease)) {
    label = "Migliore disponibile";
    reason = "È al massimo fra le mosse valutate, ma rimane un rischio di prosecuzione: nessun premio sonoro.";
  } else if (relativeGap <= JUDGMENT_LIMITS.comparable) {
    label = "Buona mossa";
    reason = "Il punteggio è entro la fascia delle migliori; il distacco è piccolo.";
  } else if (relativeGap <= JUDGMENT_LIMITS.playableGap) {
    label = "Mossa giocabile";
    reason = "La scelta è valida, con un distacco dal massimo entro il 10% della scala di confronto, anche se c’erano alternative più efficaci.";
  } else if (enough && comparable > others.length / 2) {
    label = "Mossa discreta";
    reason = "La mossa ha un valore simile alla maggioranza delle alternative valutate, ma alcune scelte offrono un vantaggio maggiore.";
  } else if (relativeGap < 0.20) {
    label = "Mossa discreta";
    reason = "Il distacco dal massimo è contenuto, inferiore al 20% della scala di confronto: la posizione in classifica non penalizza la scelta.";
  }

  return {
    label, emphasis, reason, score: played.total, maximum, gap, relativeGap,
    rank, tied, count: moves.length, totalMoves: analysis.totalMoves,
    better, comparable, worse, tolerance, middle, risk, bestRisk,
    clearlyBetter, clearlyBetterTolerance, requiredClearlyBetter,
    safestDeath: Number.isFinite(safestDeath) ? safestDeath : null,
    ...(placementQuality ? { placementQuality } : {}),
    ...(singleCellUse ? { singleCellUse } : {}),
    added: !!played.added,
  };
}
