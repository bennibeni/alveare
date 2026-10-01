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
      label: "Scelta equivalente", emphasis: "neutral", comparable: 3,
    });
    expect(judgeMove(comparison([100, 99, 50, 45], 1))).toMatchObject({
      label: "Buona mossa", emphasis: "neutral", rank: 2, comparable: 1, worse: 2,
    });
  });

  it("evidenzia la perdita solo con distacco e classifica sfavorevoli", () => {
    expect(judgeMove(comparison([100, 95, 90, 20], 3))).toMatchObject({
      label: "Occasione persa", emphasis: "negative", rank: 4, gap: 80, better: 3,
    });
    expect(judgeMove(comparison([100, 99, 98, 97], 3)).emphasis).toBe("neutral");
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
    expect(judgeMove(comparison([100], 0))).toMatchObject({ label: "Confronto limitato", emphasis: "neutral" });
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
    expect(judgeMove(analysis)).toMatchObject({ label: "Migliore disponibile", emphasis: "neutral" });
  });

  it("segnala la perdita di una prosecuzione nota quando c'era un'alternativa", () => {
    const analysis = comparison([100, 80], 1);
    analysis.moves[1].next = null;
    expect(judgeMove(analysis)).toMatchObject({ emphasis: "negative", risk: { blocked: true } });
  });
});
