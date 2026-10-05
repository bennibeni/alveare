import { describe, expect, it } from "vitest";
import { audit } from "../../scripts/audit-judgment.mjs";

// Controllo di congruenza su posizioni simulate (versione corta di `npm run audit`): in ogni
// posizione il suggerimento coincide con l'analisi, e il giudizio di ogni mossa candidata e di
// alcune mosse casuali è coerente con punteggi, rischio, motivazione e mosse migliori indicate.
describe("congruenza di suggerimenti e giudizi", () => {
  it("modalità normale: nessuna incongruenza", () => {
    const res = audit({ expert: false, count: 30, seed: 11 });
    expect(res.judged).toBeGreaterThan(150);
    expect(res.issues).toEqual({});
    // il suggerimento non riceve mai un giudizio critico
    expect(
      Object.keys(res.suggestedLabels).every((l) =>
        [
          "Ottima mossa",
          "Buona mossa",
          "Una mossa vale l’altra",
          "Migliore disponibile",
          "Mossa obbligata",
        ].includes(l),
      ),
    ).toBe(true);
  }, 120000);

  it("modalità Esperto: nessuna incongruenza", () => {
    const res = audit({ expert: true, count: 10, seed: 11 });
    expect(res.judged).toBeGreaterThan(50);
    expect(res.issues).toEqual({});
  }, 120000);
});
