// Soglie descrittive del confronto: non cambiano la strategia di gioco.
export const JUDGMENT_LIMITS = {
  comparable: 0.05,
  strongGap: 0.3,
  exceptionalGap: 0.5,
  clearlyBetter: 0.2,
  clearlyBetterShare: 2 / 3,
  notableLead: 0.1,
  playableGap: 0.1,
  riskIncrease: 0.2,
  highRisk: 0.5,
  extremeRisk: 0.8,
};

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const i = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[i] : (sorted[i - 1] + sorted[i]) / 2;
};

function riskOf(move, knownPieces) {
  if (move.sequence)
    return {
      blocked: move.sequence.path.length < knownPieces,
      death: move.sequence.unknown.death,
    };
  return { blocked: !move.next, death: move.blockRisk ?? null };
}

/** Giudica solo le candidate approfondite + la mossa manuale eventualmente aggiunta.
 * La scala usa massimo e mediana, mai score/massimo: funziona anche con 0 e negativi.
 * Le categorie migliore/comparabile/inferiore sono disgiunte e non contano la mossa stessa.
 */
export function judgeMove(analysis, knownPieces = 3) {
  const played = analysis?.moves.find((m) => m.played);
  if (!played || !analysis.moves.every((m) => Number.isFinite(m.total)))
    return null;
  const moves = analysis.moves;
  const others = moves.filter((m) => m !== played);
  const best = moves.reduce((a, b) => (b.total > a.total ? b : a));
  const maximum = best.total;
  const middle = median(moves.map((m) => m.total));
  const scale = Math.max(1, Math.abs(maximum), Math.abs(middle));
  const epsilon = scale * 1e-9;
  const tolerance = scale * JUDGMENT_LIMITS.comparable;
  const gap = Math.max(0, maximum - played.total);
  const relativeGap = gap / scale;
  const better = others.filter(
    (m) => m.total - played.total > tolerance,
  ).length;
  const worse = others.filter((m) => played.total - m.total > tolerance).length;
  const comparable = others.length - better - worse;
  // Per il giudizio negativo non basta uscire dalla fascia comparabile del 5%.
  // Includere il valore assoluto della mossa evita distacchi gonfiati quando
  // il massimo è vicino a zero e la mossa giocata ha un punteggio negativo.
  const lossScale = Math.max(scale, Math.abs(played.total));
  const clearlyBetterTolerance = lossScale * JUDGMENT_LIMITS.clearlyBetter;
  const clearlyBetterList = others
    .filter((m) => m.total - played.total > clearlyBetterTolerance)
    .sort((a, b) => b.total - a.total);
  const clearlyBetter = clearlyBetterList.length;
  const requiredClearlyBetter = Math.max(
    2,
    Math.ceil(others.length * JUDGMENT_LIMITS.clearlyBetterShare),
  );
  // Occasione persa: conta solo il punteggio, lo stesso metro del suggerimento (che premia già le
  // linee svuotate e quelle preparate).
  const exceptionalLoss =
    clearlyBetter >= 1 && gap / lossScale >= JUDGMENT_LIMITS.exceptionalGap;
  // «Occasione persa» solo se la migliore delle valutate è un'«Ottima mossa»: un'occasione è una
  // mossa che spicca. Se le migliori sono più mosse equivalenti (la prima è solo «Buona mossa»),
  // la mossa riceve il giudizio successivo della scala. Il giudizio della migliore non può a sua
  // volta passare di qui (il suo distacco è zero), quindi la chiamata non si ripete.
  const bestIsExcellent = () =>
    best !== played &&
    /^Ottima/.test(
      judgeMove(
        {
          ...analysis,
          moves: moves.map((m) => ({ ...m, played: m === best })),
        },
        knownPieces,
      )?.label ?? "",
    );
  const rank =
    1 + others.filter((m) => m.total - played.total > epsilon).length;
  const tied = others.filter(
    (m) => Math.abs(m.total - played.total) <= epsilon,
  ).length;
  const risk = riskOf(played, knownPieces);
  const bestRisk = riskOf(best, knownPieces);
  // Il riferimento per la sicurezza è l'alternativa meno rischiosa, anche
  // quando il suo punteggio strategico è inferiore a quello della mossa giocata.
  const continuingRisks = others
    .map((m) => riskOf(m, knownPieces))
    .filter((r) => !r.blocked);
  const safestDeath = continuingRisks.reduce(
    (minimum, r) => (r.death === null ? minimum : Math.min(minimum, r.death)),
    Infinity,
  );
  const avoidableBlock = risk.blocked && continuingRisks.length > 0;
  const riskIncrease =
    !risk.blocked && risk.death !== null && Number.isFinite(safestDeath)
      ? risk.death - safestDeath
      : 0;
  const risky =
    avoidableBlock || riskIncrease + 1e-9 >= JUDGMENT_LIMITS.riskIncrease;
  const enough = others.length >= 2;
  const majority = Math.ceil(others.length / 2);
  const placementQuality = analysis.placementQuality;
  const singleCellUse = analysis.singleCellUse;
  const isPoint = (played.piece?.cells || played.cells)?.length === 1;
  const productiveClear =
    played.lines > 0 &&
    placementQuality &&
    placementQuality.after.empty > placementQuality.before.empty &&
    placementQuality.after.holes <= placementQuality.before.holes &&
    placementQuality.after.deadHoles <= placementQuality.before.deadHoles &&
    placementQuality.after.fitCount >= placementQuality.before.fitCount;
  const usefulFit =
    placementQuality &&
    placementQuality.touchingCells >= 2 &&
    placementQuality.sharedEdges >= 3 &&
    placementQuality.after.holes <= placementQuality.before.holes &&
    placementQuality.after.deadHoles <= placementQuality.before.deadHoles &&
    placementQuality.after.fitCount >= placementQuality.before.fitCount;
  const safe =
    !risk.blocked &&
    (risk.death === null || risk.death < JUDGMENT_LIMITS.riskIncrease);
  // Osservazioni sulla posizione: compaiono nei dettagli, ma non cambiano l'etichetta. L'etichetta
  // dipende solo da punteggio e rischio, così una mossa con più punti e non più rischio non riceve
  // mai un giudizio peggiore di un'altra, e il suggerimento non viene mai criticato.
  const notes = [];
  if (productiveClear)
    notes.push(
      `Hai eliminato ${played.lines === 1 ? "una linea" : `${played.lines} linee`}, aumentando lo spazio libero senza peggiorare le cavità difficili o le forme giocabili.`,
    );
  else if (usefulFit)
    notes.push(
      "Il pezzo si incastra con quelli presenti senza aumentare le cavità difficili o ridurre le forme giocabili.",
    );
  // Sul pezzo da una cella solo un fatto verificabile: un'alternativa con un voto migliore lo
  // conservava (o lo collocava eliminando linee). Penalizzare di per sé il consumo del punto non
  // migliora la strategia al simulatore (vedi README), quindi non è un criterio di giudizio.
  if (isPoint && singleCellUse && !singleCellUse.netImprovement) {
    const betterOnes = others.filter((m) => m.total - played.total > tolerance);
    const keeping = betterOnes.filter(
      (m) => (m.piece?.cells || m.cells)?.length > 1,
    ).length;
    const clearing = betterOnes.filter(
      (m) => (m.piece?.cells || m.cells)?.length === 1 && m.lines > 0,
    ).length;
    if (keeping)
      notes.push(
        `Hai usato il pezzo da una cella senza un netto miglioramento: ${keeping === 1 ? "un’alternativa con un voto migliore usava un altro pezzo e lo conservava" : `${keeping} alternative con un voto migliore usavano un altro pezzo e lo conservavano`}.`,
      );
    else if (clearing)
      notes.push(
        "Hai usato il pezzo da una cella senza un netto miglioramento: un’altra sua collocazione, con un voto migliore, eliminava linee.",
      );
  }
  let label = "Mossa migliorabile";
  let emphasis = "neutral";
  let reason =
    "Il distacco dalle migliori suggerisce che c’erano alternative più efficaci.";

  if (analysis.totalMoves === 1) {
    label = "Mossa obbligata";
    reason =
      "Era l’unica mossa legale: il punteggio non misura una scelta fra alternative.";
  } else if (!others.length) {
    label = "Mossa poco promettente";
    reason =
      "La ricerca ha conservato una sola mossa distinta: non basta per premiare o criticare la scelta.";
  } else if (
    risky &&
    (avoidableBlock || risk.death >= JUDGMENT_LIMITS.extremeRisk)
  ) {
    label = "Mossa pessima";
    emphasis = "negative";
    reason = avoidableBlock
      ? "La ricerca non trova una prosecuzione con i pezzi già noti, mentre un’altra mossa la permette. Il rischio di blocco prevale sul punteggio."
      : "Il rischio stimato di blocco subito dopo i pezzi noti è almeno dell’80%, con un’alternativa più sicura di almeno 20 punti percentuali. Il rischio prevale sul punteggio.";
  } else if (risky && risk.death >= JUDGMENT_LIMITS.highRisk) {
    label = "Mossa cattiva";
    emphasis = "negative";
    reason =
      "Il rischio stimato di blocco subito dopo i pezzi noti è almeno del 50%, con un’alternativa più sicura di almeno 20 punti percentuali. Il rischio prevale sul punteggio.";
  } else if (risky) {
    label = "Mossa rischiosa";
    emphasis = "negative";
    reason =
      "Aumenta il rischio stimato di blocco di almeno 20 punti percentuali rispetto a un’alternativa più sicura, anche se il punteggio è buono.";
  } else if (
    (exceptionalLoss ||
      (gap / lossScale >= JUDGMENT_LIMITS.strongGap &&
        clearlyBetter >= requiredClearlyBetter)) &&
    bestIsExcellent()
  ) {
    label = "Occasione persa";
    emphasis = "negative";
    reason = exceptionalLoss
      ? "C’era un’alternativa con un vantaggio di almeno il 50% della scala di confronto: basta questa occasione nettamente superiore, indipendentemente dalla posizione in classifica."
      : "Distacco dal massimo di almeno il 30% della scala di confronto; almeno due alternative, pari ad almeno due terzi delle valutate, superano la mossa di oltre il 20% della stessa scala.";
  } else if (
    gap <= epsilon &&
    enough &&
    worse >= majority &&
    (played.total - middle) / scale >= JUDGMENT_LIMITS.notableLead &&
    safe
  ) {
    label = played.added ? "Ottima scoperta" : "Ottima mossa";
    emphasis = "positive";
    reason =
      "Prima in classifica, con vantaggio significativo sulla mediana e almeno metà delle alternative nettamente inferiori.";
  } else if (!better && !worse) {
    label = "Una mossa vale l’altra";
    reason =
      "Tutte le alternative valutate hanno punteggi comparabili: nessuna differenza merita un segnale speciale.";
  } else if (gap <= epsilon && !safe) {
    label = "Migliore disponibile";
    reason =
      "È al massimo fra le mosse valutate, ma rimane un rischio di prosecuzione: nessun premio sonoro.";
  } else if (relativeGap <= JUDGMENT_LIMITS.comparable && safe) {
    label = "Buona mossa";
    reason =
      "Il punteggio è entro la fascia delle migliori; il distacco è piccolo.";
  } else if (relativeGap <= JUDGMENT_LIMITS.playableGap) {
    label = "Mossa giocabile";
    reason =
      relativeGap <= JUDGMENT_LIMITS.comparable
        ? "Il punteggio è vicino al massimo, ma rimane un rischio di prosecuzione: nessun premio."
        : "La scelta è valida, con un distacco dal massimo entro il 10% della scala di confronto, anche se c’erano alternative più efficaci.";
  } else if (enough && comparable + worse > others.length / 2) {
    label = "Mossa discreta";
    reason =
      "La maggioranza delle alternative valutate non è migliore della tua mossa, ma alcune scelte offrono un vantaggio maggiore.";
  } else if (relativeGap < 0.2) {
    label = "Mossa discreta";
    reason =
      "Il distacco dal massimo è contenuto, inferiore al 20% della scala di confronto: la posizione in classifica non penalizza la scelta.";
  }

  return {
    label,
    emphasis,
    reason,
    notes,
    score: played.total,
    maximum,
    gap,
    relativeGap,
    rank,
    tied,
    count: moves.length,
    totalMoves: analysis.totalMoves,
    better,
    comparable,
    worse,
    tolerance,
    middle,
    scale,
    risk,
    bestRisk,
    clearlyBetter,
    clearlyBetterTolerance,
    requiredClearlyBetter,
    clearlyBetterMoves: clearlyBetterList.map((m) => ({
      idx: m.idx,
      q: m.q,
      r: m.r,
      cells: m.cells ?? m.piece?.cells,
      pieceName: m.piece?.name ?? null,
      total: m.total,
      advantage: m.total - played.total,
    })),
    safestDeath: Number.isFinite(safestDeath) ? safestDeath : null,
    ...(placementQuality ? { placementQuality } : {}),
    ...(singleCellUse ? { singleCellUse } : {}),
    added: !!played.added,
  };
}
