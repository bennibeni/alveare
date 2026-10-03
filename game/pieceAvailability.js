/**
 * Disponibilità dei pezzi: un fatto sul tabellone, condiviso da chi decide e da chi misura.
 *
 * Risponde a una domanda precisa: se adesso venisse estratto un pezzo a caso, con quale
 * probabilità non avrebbe nessuna posizione libera? Il calcolo è ESATTO, non una stima:
 * ogni orientamento pesa con la sua probabilità di uscita (vedi pieces.js) e un pezzo deve
 * entrare nel tabellone così com'è, perché le linee si svuotano solo dopo averlo appoggiato.
 *
 * La usano:
 * - strategy.js: rischio del pezzo ignoto in Esperto e penalità del pezzo in arrivo in normale;
 * - positionRisk.js: indicatori di prosecuzione e politica delle simulazioni;
 * - strategy.js (analyzePlayedMove): controllo sull'uso del pezzo da una cella.
 * Per questo il significato deve restare esatto: le euristiche nuove si costruiscono sopra,
 * in chi la usa, non qui dentro.
 */
import { PIECES } from "./pieces.js";

const totalWeight = PIECES.reduce((sum, p) => sum + p.weight, 0);

/**
 * Per ogni orientamento del catalogo: probabilità di uscita (p) e posizioni libere
 * (placements, contate fino a maxPlacements: con 1 basta sapere se entra, con 6 si ha
 * anche lo spazio senza contare oltre).
 * Restituisce anche:
 * - death: probabilità che il pezzo estratto non entri da nessuna parte (0..1);
 * - room: media pesata di min(posizioni, 6) / 6, quanto spazio avrebbe (0..1);
 * - playableOrientations: quanti orientamenti entrano.
 * room è esatto solo con maxPlacements ≥ 6; death è esatto con qualsiasi maxPlacements ≥ 1.
 */
export function pieceAvailability(grid, maxPlacements = Infinity) {
  const pieces = PIECES.map((piece) => {
    let placements = 0;
    for (const [q, r] of grid.coords) {
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
