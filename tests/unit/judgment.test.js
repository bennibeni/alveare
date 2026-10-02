import { describe, expect, it } from "vitest";
import { judgeMove } from "../../game/moveJudgment.js";

function comparison(scores, played, totalMoves = 100) {
  return { totalMoves, moves: scores.map((total, i) => ({ total, played: i === played, next: {} })) };
}

describe("giudizio qualitativo della mossa", () => {
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
    expect(judgeMove(comparison([100, 50.01, 49, 48], 1)).label).toBe("Mossa migliorabile");
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
