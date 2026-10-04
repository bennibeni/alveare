import { describe, expect, it } from "vitest";
import { judgeMove } from "../../game/moveJudgment.js";
import HexGrid from "../../game/HexGrid.js";
import { PIECES } from "../../game/pieces.js";
import { analyzePlayedMove } from "../../game/strategy.js";

function comparison(scores, played, totalMoves = 100) {
  return { totalMoves, moves: scores.map((total, i) => ({ total, played: i === played, next: {} })) };
}

describe("giudizio qualitativo della mossa", () => {
 it("l'incastro del log in apertura: l'etichetta segue il punteggio, l'incastro resta nelle note", () => {
    let grid = new HexGrid(4);
    for (const [q, r] of [[3, 0], [4, -2], [4, -1], [4, 0]]) grid = grid.place([[0, 0]], q, r, 10);
    const tray = ["bandiera sinistra-5", "bandiera destra-5", "ferro di cavallo-4"]
      .map((id) => PIECES.find((p) => p.id === id));
    const analysis = analyzePlayedMove({ grid, tray, streak: 0, expert: false, idx: 1, q: 2, r: -1 });
    // le alternative preparano linee da svuotare: per la strategia valgono nettamente di più
    const result = judgeMove(analysis);
    expect(result).toMatchObject({ label: "Occasione persa", emphasis: "negative" });
    expect(result.clearlyBetter).toBeGreaterThanOrEqual(result.requiredClearlyBetter);
    expect(result.notes.join(" ")).toContain("si incastra");
    // con il punteggio massimo la stessa mossa è fra le migliori
    analysis.moves.find((m) => m.played).total = Math.max(...analysis.moves.map((m) => m.total));
    expect(judgeMove(analysis).emphasis).not.toBe("negative");
    analysis.moves.find((m) => m.played).next = null;
    expect(judgeMove(analysis).label).toBe("Mossa pessima");
  });
  it("il punto consumato senza miglioramento è un avvertimento, non un'etichetta", () => {
    const grid = new HexGrid(4);
    const tray = [PIECES[0], PIECES.find((p) => p.name === "barra 4"), PIECES.find((p) => p.name === "rombo")];
    const analysis = analyzePlayedMove({ grid, tray, streak: 0, expert: false, idx: 0, q: 0, r: 0 });
    expect(analysis.singleCellUse.alternativesChecked).toBe(analysis.totalMoves - 1);
    expect(analysis.singleCellUse.alternativesChecked).toBeGreaterThan(analysis.moves.length);
    expect(analysis.singleCellUse).toMatchObject({ netImprovement: false, canPreservePoint: true });
    const result = judgeMove(analysis);
    expect(result.better).toBeGreaterThan(0);
    expect(result.notes.join(" ")).toMatch(/usava(no)? un altro pezzo e lo conserva/);
    // se il punteggio è il massimo, niente avvertimento: la strategia la considera la mossa migliore
    analysis.moves.find((m) => m.played).total = 100000;
    expect(judgeMove(analysis)).toMatchObject({ label: "Ottima scoperta", emphasis: "positive", notes: [] });
    analysis.moves.find((m) => m.played).next = null;
    expect(judgeMove(analysis).label).toBe("Mossa pessima");
  });

 it("non avverte sul punto quando il tipo di pezzo è obbligato", () => {
    const grid = new HexGrid(2);
    const tray = [PIECES[0], PIECES[0], PIECES[0]];
    for (const expert of [false, true]) {
      const best = analyzePlayedMove({ grid, tray, streak: 0, expert, idx: 0, q: 0, r: 0 }).moves[0];
      const analysis = analyzePlayedMove({ grid, tray, streak: 0, expert, idx: best.idx, q: best.q, r: best.r });
      expect(analysis.singleCellUse).toMatchObject({ forcedPiece: true, viableAlternatives: 0 });
      expect(judgeMove(analysis).emphasis).not.toBe("negative");
      expect(judgeMove(analysis).notes).toEqual([]);
    }
  });

  it("riconosce il punto che chiude una linea e migliora realmente lo spazio", () => {
    let grid = new HexGrid(2);
    for (const q of [-2, -1, 1, 2]) grid = grid.place([[0, 0]], q, 0, 2);
    const tray = [PIECES[0], PIECES[0], PIECES[0]];
    const analysis = analyzePlayedMove({ grid, tray, streak: 0, expert: false, idx: 0, q: 0, r: 0 });
    expect(analysis.singleCellUse.netImprovement).toBe(true);
    expect(judgeMove(analysis).emphasis).not.toBe("negative");
    expect(judgeMove(analysis).notes.join(" ")).toContain("Hai eliminato una linea");
    analysis.moves.find((m) => m.played).total = Math.max(...analysis.moves.map((m) => m.total));
    expect(["Buona mossa", "Ottima mossa", "Una mossa vale l’altra"]).toContain(judgeMove(analysis).label);
  });
  it("la chiusura produttiva del log è una nota; l'etichetta segue il punteggio", () => {
    const analysis = comparison([243.1, 226.8, 175.5, 174.1, 145.9, 138.2], 2, 26);
    analysis.moves[2].lines = 2;
    analysis.placementQuality = {
      touchingCells: 2, sharedEdges: 3,
      before: { holes: 4, deadHoles: 3, empty: 22, fitCount: 13 },
      after: { holes: 3, deadHoles: 1, empty: 32, fitCount: 25 },
    };
    expect(judgeMove(analysis)).toMatchObject({ label: "Mossa discreta", emphasis: "neutral" });
    expect(judgeMove(analysis).notes.join(" ")).toContain("2 linee");
    analysis.moves[2].lines = 1;
    expect(judgeMove(analysis).notes.join(" ")).toContain("una linea");
    analysis.placementQuality.after.holes = 5;
    expect(judgeMove(analysis).notes).toEqual([]);
    analysis.placementQuality.after.holes = 3;
    analysis.moves[2].next = null;
    expect(judgeMove(analysis).label).toBe("Mossa pessima");
    analysis.moves[2].next = {};
    analysis.moves[0].total = 400;
    expect(judgeMove(analysis).label).toBe("Occasione persa");
  });

  it("l'occasione persa segue il punteggio anche fra mosse che svuotano linee", () => {
    // la strategia premia già le linee svuotate e preparate: nessuna eccezione per le chiusure
    const analysis = comparison([200, 190, 180, 50], 3);
    analysis.moves.forEach((move) => { move.lines = 1; move.next = { lines: 3 }; });
    expect(judgeMove(analysis).label).toBe("Occasione persa");
    analysis.moves[3].lines = 3;
    expect(judgeMove(analysis).label).toBe("Occasione persa");
    analysis.moves[3].total = 199;
    expect(judgeMove(analysis).emphasis).not.toBe("negative");
  });
  it("non chiama «scoperta» una mossa fra tante equivalenti che il suggerimento aveva scartato (log)", () => {
    // Tabellone quasi vuoto: 55 mosse su 89 stanno entro il 5% del massimo. Con solo 6 candidate
    // scelte per voto a un passo, la mossa giocata pareggiava il suggerimento e risultava «Ottima scoperta».
    let grid = new HexGrid(4);
    for (const q of [-4, -3, -2, -1]) grid = grid.place([[0, 0]], q, 0, 9);
    const tray = ["barra 4-2", "bandiera sinistra-1", "bandiera destra-2"].map((id) => PIECES.find((p) => p.id === id));
    const analysis = analyzePlayedMove({ grid, tray, streak: 0, expert: false, idx: 1, q: -1, r: -1 });
    const result = judgeMove(analysis);
    expect(result.label).not.toBe("Ottima scoperta");
    expect(result.emphasis).toBe("neutral");
    expect(result.maximum).toBeGreaterThan(result.score);
    expect(analysis.moves[0].total).toBeCloseTo(148.9, 1);
  });

 it("l'incastro del log fra alternative quasi equivalenti: nota sì, etichetta dal punteggio", () => {
    let grid = new HexGrid(4);
    for (const [q, r] of [[2, -1], [3, -1], [3, 0], [4, -1]]) grid = grid.place([[0, 0]], q, r, 10);
    const tray = ["punto-0", "ferro di cavallo-3", "rombo-0"].map((id) => PIECES.find((p) => p.id === id));
    const analysis = analyzePlayedMove({ grid, tray, streak: 0, expert: false, idx: 1, q: 2, r: -2 });
    const result = judgeMove(analysis);
    expect(result).toMatchObject({ emphasis: "neutral", placementQuality: { touchingCells: 4, sharedEdges: 6 } });
    expect(result.notes.join(" ")).toContain("si incastra");
    const quality = analysis.placementQuality;
    for (const after of [
      { ...quality.after, holes: quality.before.holes + 1 },
      { ...quality.after, deadHoles: quality.before.deadHoles + 1 },
      { ...quality.after, fitCount: quality.before.fitCount - 1 },
    ]) {
      const changed = judgeMove({ ...analysis, placementQuality: { ...quality, after } });
      expect(changed.notes).toEqual([]);
      expect(changed.label).toBe(result.label);
    }
    expect(judgeMove({ ...analysis, placementQuality: { ...quality, touchingCells: 0, sharedEdges: 0 } }).notes).toEqual([]);
    analysis.moves.find((m) => m.played).next = null;
    expect(judgeMove(analysis).label).toBe("Mossa pessima");
  });
  it("giudica discreta la mossa del log, vicina al gruppo ordinario di alternative", () => {
    const analysis = comparison([144.9, 139.9, 81.7, 80.5, 80.5, 80.5, 79.3], 6, 145);
    expect(judgeMove(analysis)).toMatchObject({
      label: "Mossa discreta", emphasis: "neutral", comparable: 4, better: 2,
    });
    analysis.moves[6].next = null;
    expect(judgeMove(analysis).label).toBe("Mossa pessima");
  });

  it("la maggioranza comparabile non nasconde un'occasione eccezionale", () => {
    expect(judgeMove(comparison([160, 81, 80, 79, 79.3], 4)).label).toBe("Occasione persa");
  });
  it("non penalizza l'ultima posizione quando il distacco è contenuto", () => {
    for (const scores of [[100, 99, 98, 97, 90], [100, 99, 98, 97, 96, 95, 90]]) {
      expect(judgeMove(comparison(scores, scores.length - 1))).toMatchObject({
        label: "Mossa giocabile", emphasis: "neutral", relativeGap: 0.1,
      });
    }
    expect(judgeMove(comparison([100, 99, 98, 97, 96], 4)).label).toBe("Una mossa vale l’altra");
    expect(judgeMove(comparison([100, 99, 98, 97, 81], 4)).label).toBe("Mossa discreta");
    expect(judgeMove(comparison([100, 99, 98, 97, 80], 4)).label).toBe("Mossa migliorabile");
  });
  it("separa le mosse giocabili dalle discrete usando il distacco e non il rango", () => {
    expect(judgeMove(comparison([100, 99, 98, 94], 3)).label).toBe("Mossa giocabile");
    expect(judgeMove(comparison([100, 99, 98, 90], 3)).label).toBe("Mossa giocabile");
    expect(judgeMove(comparison([100, 99, 98, 89.9], 3)).label).toBe("Mossa discreta");
    const risky = comparison([100, 99, 98, 94], 3);
    risky.moves[3].next = null;
    expect(judgeMove(risky).label).toBe("Mossa pessima");
  });
  it("premia una prima scelta nettamente distinta dalle alternative", () => {
    expect(judgeMove(comparison([100, 90, 80, 70], 0))).toMatchObject({
      label: "Ottima mossa", emphasis: "positive", score: 100, maximum: 100, rank: 1,
      better: 0, comparable: 0, worse: 3, middle: 85,
    });
  });

  it("non suona per una prima posizione in un gruppo di mosse simili", () => {
    expect(judgeMove(comparison([100, 98, 97, 96], 0))).toMatchObject({
      label: "Una mossa vale l’altra", emphasis: "neutral", comparable: 3,
    });
    expect(judgeMove(comparison([100, 99, 50, 45], 1))).toMatchObject({
      label: "Buona mossa", emphasis: "neutral", rank: 2, comparable: 1, worse: 2,
    });
  });

  it("elenca le mosse nettamente migliori, dalla migliore, con pezzo e posizione", () => {
    const analysis = comparison([100, 95, 90, 20], 3);
    analysis.moves.forEach((m, i) => Object.assign(m, { idx: i % 3, q: i, r: -i, cells: [[0, 0]], piece: { name: `pezzo ${i}`, cells: [[0, 0]] } }));
    const result = judgeMove(analysis);
    expect(result.clearlyBetterMoves.map((m) => [m.idx, m.q, m.pieceName, m.advantage])).toEqual([
      [0, 0, "pezzo 0", 80], [1, 1, "pezzo 1", 75], [2, 2, "pezzo 2", 70],
    ]);
    expect(result.clearlyBetterMoves).toHaveLength(result.clearlyBetter);
    expect(judgeMove(comparison([100, 99, 98, 97], 3)).clearlyBetterMoves).toEqual([]);
  });

  it("evidenzia la perdita con un distacco ampio da una maggioranza netta", () => {
    expect(judgeMove(comparison([100, 95, 90, 20], 3))).toMatchObject({
      label: "Occasione persa", emphasis: "negative", rank: 4, gap: 80, better: 3,
    });
    expect(judgeMove(comparison([100, 99, 98, 97], 3)).emphasis).toBe("neutral");
  });

  it("non confonde molte alternative appena migliori con un'occasione persa", () => {
    const result = judgeMove(comparison([100, 72, 71, 70, 69, 60], 5));
    expect(result).toMatchObject({
      label: "Mossa migliorabile", emphasis: "neutral", rank: 6,
      better: 5, clearlyBetter: 1, requiredClearlyBetter: 4,
    });
  });

  it("con distacchi non eccezionali richiede almeno due alternative e almeno due terzi del totale", () => {
    expect(judgeMove(comparison([100, 90, 69, 68, 60], 4))).toMatchObject({
      label: "Mossa migliorabile", clearlyBetter: 2, requiredClearlyBetter: 3,
    });
    expect(judgeMove(comparison([100, 90, 89, 68, 60], 4))).toMatchObject({
      label: "Occasione persa", clearlyBetter: 3, requiredClearlyBetter: 3,
    });
    expect(judgeMove(comparison([100, 60], 1)).label).toBe("Mossa migliorabile");
  });

  it("il vantaggio del 20% deve essere superato, e resta necessario il 30% dal massimo", () => {
    expect(judgeMove(comparison([100, 80, 80, 60], 3))).toMatchObject({
      label: "Mossa migliorabile", clearlyBetter: 1,
    });
    expect(judgeMove(comparison([100, 81, 81, 60], 3)).label).toBe("Occasione persa");
    expect(judgeMove(comparison([100, 99, 75], 2))).toMatchObject({
      label: "Mossa migliorabile", clearlyBetter: 2,
    });
  });

  it("non amplifica differenze piccole fra punteggi negativi", () => {
    expect(judgeMove(comparison([-60, -85, -86, -87, -100], 4))).toMatchObject({
      label: "Mossa migliorabile", clearlyBetter: 1, clearlyBetterTolerance: 20,
    });
    expect(judgeMove(comparison([-10, -20, -25, -100], 3)).label).toBe("Occasione persa");
  });

  it("basta una sola alternativa eccezionale anche se la mossa giocata è seconda", () => {
    for (const scores of [[100, 20], [100, 50, 49, 48, 47, 46], [49, 48, 100, 50, 47, 46]]) {
      const played = scores.includes(50) ? scores.indexOf(50) : 1;
      expect(judgeMove(comparison(scores, played))).toMatchObject({
        label: "Occasione persa", emphasis: "negative", clearlyBetter: 1, rank: 2,
      });
    }
    expect(judgeMove(comparison([100, 50.01, 49, 48], 1)).label).toBe("Mossa discreta");
  });

  it("riconosce l'alternativa eccezionale anche con massimo nullo o negativo", () => {
    for (const scores of [[0, -85, -86, -87, -100], [-50, -85, -86, -87, -100]]) {
      expect(judgeMove(comparison(scores, 4))).toMatchObject({
        label: "Occasione persa", clearlyBetter: 1, clearlyBetterTolerance: 20,
      });
    }
  });

  it("il giudizio non dipende dall'ordine delle candidate né da duplicati simili alla mossa", () => {
    for (const scores of [[100, 72, 71, 70, 69, 60], [60, 69, 100, 70, 72, 71], [100, 72, 71, 70, 69, 69, 69, 60]]) {
      expect(judgeMove(comparison(scores, scores.indexOf(60))).label).toBe("Mossa migliorabile");
    }
  });

  it("gestisce punteggi nulli, negativi ed ex aequo senza divisioni per zero", () => {
    for (const scores of [[0, 0, 0], [-10, -10, -10], [0, -10, -20], [-10, -20, -100]]) {
      const result = judgeMove(comparison(scores, 0));
      expect(Number.isFinite(result.relativeGap)).toBe(true);
      expect(result.maximum).toBe(scores[0]);
      expect(result.rank).toBe(1);
      expect(result.better + result.comparable + result.worse).toBe(scores.length - 1);
    }
    expect(judgeMove(comparison([0, 0, 0], 2))).toMatchObject({ rank: 1, tied: 2, emphasis: "neutral" });
    expect(judgeMove(comparison([-10, -20, -25, -100], 3)).emphasis).toBe("negative");
  });

  it("distingue scelte obbligate e campioni insufficienti", () => {
    expect(judgeMove(comparison([-10000], 0, 1))).toMatchObject({ label: "Mossa obbligata", emphasis: "neutral" });
    expect(judgeMove(comparison([100], 0))).toMatchObject({ label: "Mossa poco promettente", emphasis: "neutral" });
    expect(judgeMove({ totalMoves: 0, moves: [] })).toBeNull();
    expect(judgeMove(null)).toBeNull();
  });

  it("include nel massimo la mossa aggiunta e non usa il suo indice come rango", () => {
    const analysis = comparison([100, 90, 80, 140], 3);
    analysis.moves[3].added = true;
    expect(judgeMove(analysis)).toMatchObject({ maximum: 140, score: 140, rank: 1, label: "Ottima scoperta" });
  });

  it("considera il rischio rispetto alla migliore alternativa, non isolatamente", () => {
    const analysis = comparison([100, 95, 80], 2);
    analysis.moves.forEach((move, i) => {
      move.sequence = { path: [{}, {}, {}], unknown: { death: i === 2 ? 0.4 : 0.05 } };
    });
    expect(judgeMove(analysis)).toMatchObject({ label: "Mossa rischiosa", emphasis: "negative" });
    analysis.moves[0].played = true;
    analysis.moves[2].played = false;
    analysis.moves[0].sequence.unknown.death = 0.4;
    expect(judgeMove(analysis)).toMatchObject({ label: "Mossa rischiosa", emphasis: "negative" });
  });

  it("segnala la perdita di una prosecuzione nota quando c'era un'alternativa", () => {
    const analysis = comparison([100, 80], 1);
    analysis.moves[1].next = null;
    expect(judgeMove(analysis)).toMatchObject({ label: "Mossa pessima", emphasis: "negative", risk: { blocked: true } });
  });

  it.each([
    [0.49, "Mossa rischiosa"], [0.50, "Mossa cattiva"],
    [0.79, "Mossa cattiva"], [0.80, "Mossa pessima"], [1, "Mossa pessima"],
  ])("il rischio %s prevale anche sul punteggio massimo", (death, label) => {
    const analysis = comparison([100, 99, 70], 0);
    analysis.moves.forEach((move, i) => {
      move.sequence = { path: [{}, {}, {}], unknown: { death: i === 0 ? death : 0.1 } };
    });
    expect(judgeMove(analysis)).toMatchObject({ label, emphasis: "negative", rank: 1, safestDeath: 0.1 });
  });

  it("non attribuisce una colpa grave se manca un'alternativa significativamente più sicura", () => {
    const analysis = comparison([100, 90, 80], 0);
    analysis.moves.forEach((move) => {
      move.sequence = { path: [{}, {}, {}], unknown: { death: 0.9 } };
    });
    expect(judgeMove(analysis)).toMatchObject({ label: "Migliore disponibile", emphasis: "neutral" });
    analysis.moves[1].sequence.unknown.death = 0.71;
    expect(judgeMove(analysis).label).toBe("Migliore disponibile");
    analysis.moves[1].sequence.unknown.death = 0.7;
    expect(judgeMove(analysis).label).toBe("Mossa pessima");
  });

  it("non usa il rischio del pezzo ignoto di una sequenza già bloccata come alternativa sicura", () => {
    const analysis = comparison([100, 90], 0);
    analysis.moves[0].sequence = { path: [{}, {}, {}], unknown: { death: 0.9 } };
    analysis.moves[1].sequence = { path: [{}], unknown: { death: 0 } };
    expect(judgeMove(analysis).label).toBe("Migliore disponibile");
    analysis.moves[0].sequence.path = [{}];
    expect(judgeMove(analysis).label).toBe("Migliore disponibile");
  });

  it("un blocco evitabile nella coda prevale sul punteggio, ma una mossa unica resta obbligata", () => {
    const analysis = comparison([100, 90], 0);
    analysis.moves[0].sequence = { path: [{}], unknown: { death: 0 } };
    analysis.moves[1].sequence = { path: [{}, {}, {}], unknown: { death: 0.1 } };
    expect(judgeMove(analysis).label).toBe("Mossa pessima");
    expect(judgeMove({ totalMoves: 1, moves: [analysis.moves[0]] }).label).toBe("Mossa obbligata");
  });
});
