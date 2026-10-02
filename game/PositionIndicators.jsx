"use client";

import { useState } from "react";
import { calculatePositionRisk } from "./positionRiskClient.js";

const pct = (n) => `${(n * 100).toLocaleString("it-IT", { maximumFractionDigits: 1 })}%`;
const estimate = (r) => `${pct(r.probability)} (intervallo 95%: ${pct(r.interval95[0])}–${pct(r.interval95[1])})`;

export default function PositionIndicators({ position, analysis }) {
  const [state, setState] = useState(null);
  const current = state?.position === position ? state : null;
  const calculate = async () => {
    setState({ position, loading: true });
    try { setState({ position, result: await calculatePositionRisk(position, analysis) }); }
    catch { setState({ position, error: true }); }
  };
  const result = current?.result;
  return <section className="rounded-xl bg-slate-800/60 p-3 text-xs" aria-label="Indicatori di prosecuzione">
    <button type="button" className="hx-btn rounded px-3 py-1.5" onClick={calculate} disabled={current?.loading}>
      {current?.loading ? "Calcolo indicatori…" : result ? "Rivedi indicatori di prosecuzione" : "Calcola indicatori di prosecuzione"}
    </button>
    {current?.loading && <p role="status" className="mt-2">Simulazioni in corso; puoi continuare a giocare.</p>}
    {current?.error && <p role="status">Calcolo non riuscito. Puoi riprovare.</p>}
    {result && <div className="mt-2 space-y-2" data-testid="position-indicators-result">
      <p>Pezzo estratto non collocabile sulla griglia attuale: {pct(result.availability.death)}. Questo valore non è il rischio di fine partita.</p>
      <p>Blocco prima di completare 3 mosse: {estimate(result.risk3)}.</p>
      <p>Blocco prima di completare 6 mosse: {estimate(result.risk6)}.</p>
      <p>Margine di scelta: {result.margin.safe} su {result.margin.assessed} candidate simulate hanno rischio entro 6 mosse ≤ {pct(result.margin.threshold)}; {result.margin.confidentSafe} soddisfano la soglia anche al limite superiore dell’intervallo. Mosse legali totali: {result.margin.legal}.</p>
      <p>Stima con una strategia euristica, non con gioco ottimo: {result.settings.samples} simulazioni della posizione e {result.settings.choiceSamples} per candidata. Gli intervalli misurano solo l’incertezza del campionamento. Il margine riguarda le candidate selezionate, non tutte le mosse legali.</p>
      {result.choices.find((m) => m.played) && <p>Imponendo la mossa giocata, rischio entro 6 mosse: {estimate(result.choices.find((m) => m.played).risk6)}.</p>}
    </div>}
  </section>;
}
