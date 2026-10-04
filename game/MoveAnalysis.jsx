"use client";

import { useEffect, useMemo, useState } from "react";
import MiniBoard, { fmt, pieceCells } from "./GuideKit.jsx";
import { PIECE_COLORS } from "./pieces.js";
import { requestAnalysis } from "./strategyClient.js";
import PositionIndicators from "./PositionIndicators.jsx";

/** Analisi calcolata nel worker; null finché non arriva. */
function useAnalysis(type, position, provided) {
  const [state, setState] = useState(null);
  useEffect(() => {
    if (provided) return;
    let current = true;
    requestAnalysis(type, position)
      .then(({ analysis }) => { if (current) setState({ position, analysis }); })
      .catch(() => { if (current) setState({ position, error: true }); });
    return () => { current = false; };
  }, [type, position, provided]);
  if (provided) return { analysis: provided };
  return state?.position === position ? state : null;
}

function AnalysisContent({ grid, tray, streak, expert, playedMove, playedAnalysis }) {
  const position = useMemo(() => playedMove || { grid, tray, streak, expert }, [playedMove, grid, tray, streak, expert]);
  const loaded = useAnalysis(playedMove ? "played" : "moves", position, playedMove ? playedAnalysis : null);
  if (!loaded) return <p className="mt-3 text-slate-400" role="status">Calcolo delle mosse…</p>;
  if (loaded.error) return <p className="mt-3 text-slate-400" role="status">Analisi non riuscita. Riapri il riquadro per riprovare.</p>;
  const { analysis } = loaded;
  return (
    <div className="mt-3 space-y-3 text-slate-300">
      {playedMove && <p className="font-medium text-emerald-300">Confronto con la posizione prima della tua ultima mossa.</p>}
      <p>{playedMove ? "Mosse giocabili prima della mossa: " : "Mosse giocabili: "}<b data-testid="playable-moves">{analysis.totalMoves}</b>.</p>
      <PositionIndicators position={position} analysis={analysis} />
      {!analysis.totalMoves ? <p>Nessuna mossa disponibile. Avvia una nuova partita per continuare.</p> : (
        <>
          <p>
            {expert
              ? "Si può giocare solo il primo pezzo. Qui trovi le sue posizioni approfondite dal suggerimento, fino a dieci, ciascuna con il punteggio della sua migliore sequenza di tre mosse."
              : `Una mossa è un pezzo del vassoio in una posizione libera. Il suggerimento ne approfondisce ${analysis.evaluated ?? analysis.moves.length}: qui trovi le migliori, fino a sei.`}
            {" "}Il punteggio misura la qualità della scelta, non i punti aggiunti alla partita. Più è alto, meglio è.
          </p>
          <p className="text-xs text-slate-400">La miniatura evidenzia dove mettere il pezzo.</p>
          <ol className="space-y-2" aria-label="Mosse approfondite">
            {analysis.moves.map((move, i) => (
              <li
                key={`${move.idx}:${move.q}:${move.r}`}
                data-testid="analyzed-move"
                data-score={move.total}
                data-piece-index={move.idx}
                data-q={move.q}
                data-r={move.r}
                data-played={move.played ? "true" : undefined}
                data-added={move.added ? "true" : undefined}
                className={`flex flex-wrap items-center gap-3 rounded-xl p-3 ${move.played ? "bg-emerald-950 ring-2 ring-emerald-400" : "bg-slate-800/60"}`}
              >
                <MiniBoard grid={grid} width={90} dimFilled emptyFill="#475569" title={`Posizione della mossa ${i + 1}`} marks={[
                  { cells: pieceCells(move.cells, move.q, move.r), fill: PIECE_COLORS[move.piece.color], stroke: "#ffffff" },
                ]} />
                <div className="min-w-0 flex-1 basis-44 space-y-1">
                  <p className="font-semibold text-white">
                    {i + 1}. Pezzo {move.idx + 1}: {move.piece.name}
                    {i === 0 ? " · Suggerita" : Math.abs(move.total - analysis.moves[0].total) < 1e-9 ? " · A pari merito" : ""}
                  </p>
                  {move.played && <p className="font-semibold text-emerald-300">✓ Mossa giocata{move.added ? " · aggiunta al confronto" : ""}</p>}
                  <p>{move.lines ? `Svuota ${move.lines} ${move.lines === 1 ? "linea" : "linee"}.` : "Non svuota linee subito."}</p>
                  <p className="font-semibold text-amber-300">Punteggio: {fmt(move.total, 3)}</p>
                  <p className="text-xs text-slate-400">
                    {expert
                      ? `Sequenza di ${move.sequence.path.length} mosse: ${fmt(move.sequence.acc, 3)}; tabellone finale: ${fmt(move.sequence.board, 3)}; rischio e spazio per il pezzo successivo: ${fmt(move.sequence.unknown.value, 3)}.`
                      : move.deep && move.next
                        ? `Griglia affollata, sequenza con i tre pezzi noti. Bonus della prima mossa: ${fmt(move.gain, 3)}; ${move.third ? `seconda mossa: ${fmt(move.middle, 3)}; valutazione della terza: ${fmt(move.third.value, 3)}` : `valutazione della seconda: ${fmt(move.next.value, 3)}; il terzo pezzo non entra: penalità −1.000`}.`
                        : `Bonus della prima mossa: ${fmt(move.gain, 3)}; ${move.next ? `valutazione della migliore seconda mossa: ${fmt(move.next.value, 3)}` : "nessuna seconda mossa disponibile: penalità −10.000"}.`}
                  </p>
                </div>
              </li>
            ))}
          </ol>
          <p className="text-xs text-slate-400">
            {playedMove ? "La prima voce era il suggerimento prima della tua mossa. " : "La prima voce coincide con il suggerimento. "}
            {analysis.moves.some((m) => m.added)
              ? "La tua mossa non era fra le candidate: è aggiunta in fondo, valutata con gli stessi criteri e i pezzi noti prima di giocare. Può avere un punteggio superiore perché la ricerca iniziale non l’aveva approfondita."
              : "Le altre mosse giocabili non approfondite non sono incluse nella classifica."}
          </p>
        </>
      )}
    </div>
  );
}

export default function MoveAnalysis({ busy, lastMove, playedAnalysis, ...position }) {
  const [open, setOpen] = useState(false);
  const [currentFor, setCurrentFor] = useState(null);
  const showPlayed = !!lastMove && currentFor !== lastMove;
  return (
    <div className="rounded-2xl bg-slate-900/70 p-3 text-sm ring-1 ring-slate-800" data-testid="move-analysis">
      <button type="button" className="hx-link flex w-full items-center justify-between text-left font-medium"
        aria-expanded={open} aria-controls="move-analysis-content" onClick={() => setOpen((value) => !value)}>
        Analisi delle mosse <span className="hx-link-sign text-slate-500" aria-hidden="true">{open ? "−" : "+"}</span>
      </button>
      {open && <div id="move-analysis-content">
        {lastMove && <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Posizione da analizzare">
          <button type="button" className="hx-btn rounded-lg px-3 py-1.5" aria-pressed={showPlayed} onClick={() => setCurrentFor(null)}>Ultima mossa</button>
          <button type="button" className="hx-btn rounded-lg px-3 py-1.5" aria-pressed={!showPlayed} onClick={() => setCurrentFor(lastMove)}>Posizione corrente</button>
        </div>}
        {busy ? <p className="mt-3 text-slate-400" role="status">Mossa in corso…</p>
          : <AnalysisContent {...(showPlayed ? lastMove : position)} playedMove={showPlayed ? lastMove : null} playedAnalysis={playedAnalysis} />}
      </div>}
    </div>
  );
}
