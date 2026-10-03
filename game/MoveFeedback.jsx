"use client";

import { useEffect, useRef, useState } from "react";
import { fmt, placementText } from "./GuideKit.jsx";
import { buildMoveReport } from "./moveReport.js";
import { calculatePositionRisk } from "./positionRiskClient.js";

const tones = {
  positive: { border: "#34d399", background: "#052e26", icon: "★" },
  negative: { border: "#fb923c", background: "#321a0d", icon: "!" },
  neutral: { border: "#475569", background: "#0f172a", icon: "•" },
};

function beep(context, positive) {
  const start = context.currentTime;
  const frequencies = positive ? [660, 880] : [260, 190];
  frequencies.forEach((frequency, i) => {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const t = start + i * 0.12;
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(frequency, t);
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.045, t + 0.015);
    gain.gain.linearRampToValueAtTime(0, t + 0.11);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
    oscillator.start(t);
    oscillator.stop(t + 0.12);
  });
}

export default function MoveFeedback({ snapshot, judgment, analysis, showCopy = false, hidden, busy, onUndo, undoDisabled }) {
  const [sound, setSound] = useState(false);
  const [audioUnavailable, setAudioUnavailable] = useState(false);
  const [dismissed, setDismissed] = useState(null);
  const [expandedFor, setExpandedFor] = useState(null);
  const [copyStatus, setCopyStatus] = useState(null);
  const card = useRef(null);
  const context = useRef(null);
  const heard = useRef(new WeakSet());

  useEffect(() => () => { void context.current?.close().catch(() => {}); }, []);
  useEffect(() => {
    if (!snapshot || !judgment || busy || hidden || heard.current.has(snapshot)) return;
    heard.current.add(snapshot);
    if (sound && judgment.emphasis !== "neutral" && context.current?.state === "running") {
      try { beep(context.current, judgment.emphasis === "positive"); } catch { /* audio facoltativo */ }
    }
  }, [snapshot, judgment, busy, hidden, sound]);

  const toggleSound = async () => {
    if (sound) { setSound(false); return; }
    try {
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (!Audio) { setAudioUnavailable(true); return; }
      context.current ||= new Audio();
      await context.current.resume();
      setSound(true);
    } catch { setAudioUnavailable(true); }
  };

  const copyReport = async () => {
    try {
      // textContent include anche i dettagli chiusi, senza cambiare l'accordion.
      const paragraphs = [...card.current.querySelectorAll("p, li")]
        .filter((element) => !element.closest("[data-copy-exclude]"))
        .map((element) => element.textContent.replace(/\s+/g, " ").trim());
      setCopyStatus({ snapshot, loading: true, message: "Calcolo degli indicatori per il log…" });
      const positionIndicators = await calculatePositionRisk(snapshot, analysis);
      const text = buildMoveReport({ snapshot, analysis, judgment, positionIndicators,
        feedbackText: [judgment.label, ...paragraphs].join("\n") });
      await navigator.clipboard.writeText(text);
      setCopyStatus({ snapshot, message: "Giudizio e log copiati" });
    } catch {
      setCopyStatus({ snapshot, message: "Copia non riuscita. Controlla i permessi degli appunti e riprova." });
    }
  };

  const visible = judgment && snapshot !== dismissed && !busy;
  const tone = tones[judgment?.emphasis || "neutral"];
  const detailsOpen = expandedFor === snapshot;
  return (
    <aside className="hx-feedback-rail" aria-label="Valutazione della mossa" hidden={hidden}>
      <div className="mb-2 flex items-center justify-between gap-2 text-xs text-slate-400">
        <span>Valutazione mosse</span>
        <button type="button" className="hx-btn rounded-lg px-3 py-1.5" onClick={toggleSound}
          aria-pressed={sound} disabled={audioUnavailable} aria-label="Beep per mosse notevoli">
          {audioUnavailable ? "Audio non disponibile" : `Beep ${sound ? "attivo" : "disattivato"}`}
        </button>
      </div>
      {visible ? (
        <section ref={card} role="status" aria-live="polite" aria-atomic="true" data-testid="move-feedback"
          data-emphasis={judgment.emphasis} className="hx-feedback-card rounded-2xl border-2 p-4 text-sm text-slate-200 shadow-lg"
          style={{ borderColor: tone.border, backgroundColor: tone.background }}>
          <div className="flex items-start justify-between gap-2" data-copy-exclude>
              <button type="button" className="hx-link flex flex-1 items-center justify-between gap-2 text-left font-semibold"
                aria-expanded={detailsOpen} aria-controls="move-feedback-details"
                aria-label={`Dettagli del giudizio: ${judgment.label}`}
                onClick={() => setExpandedFor(detailsOpen ? null : snapshot)}>
                <span>{tone.icon} {judgment.label}</span>
                <span aria-hidden="true">{detailsOpen ? "−" : "+"}</span>
              </button>
            {showCopy && <button type="button" onClick={copyReport} disabled={!analysis || (copyStatus?.snapshot === snapshot && copyStatus.loading)}
              className="hx-btn shrink-0 rounded p-1.5" aria-label="Copia giudizio e log della mossa"
              title="Copia giudizio e log della mossa">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                <rect x="8" y="8" width="12" height="13" rx="2" />
                <path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" />
              </svg>
            </button>}
            <button type="button" className="hx-link rounded px-2" aria-label="Chiudi valutazione mossa" onClick={() => setDismissed(snapshot)}>×</button>
          </div>
          {showCopy && copyStatus?.snapshot === snapshot && <p data-copy-exclude className="mt-2 text-xs text-slate-300">{copyStatus.message}</p>}
          {judgment.label === "Occasione persa" && (
            <p className="mt-2 text-sm text-orange-200">
              Puoi{" "}
              <button type="button" onClick={onUndo} disabled={undoDisabled}
                className="hx-btn rounded border border-orange-300/40 px-2 py-0.5 text-sm font-semibold">
                annullare
              </button>{" "}
              l&apos;ultima mossa e riprovare
            </p>
          )}
          <div id="move-feedback-details" hidden={!detailsOpen}>
          <p className="mt-3 text-xl font-semibold tabular-nums text-white" data-testid="move-feedback-score">
            {fmt(judgment.score, 3)} / {fmt(judgment.maximum, 3)}
          </p>
          <p className="text-xs text-slate-400">Punteggio della mossa / massimo valutato</p>
          <p className="mt-3">{judgment.reason}</p>
          <ul className="mt-3 list-disc space-y-1 pl-4 text-xs">
            <li>Posizione: {judgment.rank}ª su {judgment.count}{judgment.tied ? `, a pari merito con ${judgment.tied} altre` : ""}.</li>
            <li>Distacco dal massimo: {fmt(judgment.gap, 3)}. Mediana: {fmt(judgment.middle, 3)}.</li>
            <li>Alternative: {judgment.better} migliori, {judgment.comparable} comparabili, {judgment.worse} inferiori.</li>
            <li>Nettamente migliori: {judgment.clearlyBetter} (vantaggio superiore a {fmt(judgment.clearlyBetterTolerance, 3)} punti){judgment.clearlyBetterMoves?.length ? ":" : "."}</li>
            {judgment.clearlyBetterMoves?.map((m) => <li key={`${m.idx}:${m.q}:${m.r}`} className="ml-4 list-[circle]" data-testid="clearly-better-move">
              Pezzo {m.idx + 1}{m.pieceName ? ` (${m.pieceName})` : ""}
              {snapshot?.grid && m.cells ? `: ${placementText(snapshot.grid, m)}` : ""} · +{fmt(m.advantage, 1)} punti
            </li>)}
            <li>Fascia comparabile: ±{fmt(judgment.tolerance, 3)} punti.</li>
            {judgment.risk.death !== null && <li>Rischio stimato di blocco subito dopo i pezzi noti
              {snapshot?.expert ? " (il pezzo ignoto non entra)" : " (nessun pezzo del vassoio entra)"}: {fmt(judgment.risk.death * 100)}%
              {judgment.bestRisk.death !== null ? ` (migliore valutata: ${fmt(judgment.bestRisk.death * 100)}%)` : ""}.</li>}
            {judgment.safestDeath != null && <li>Rischio dell’alternativa più sicura che prosegue con i pezzi noti: {fmt(judgment.safestDeath * 100)}%.</li>}
            {judgment.risk.blocked && <li>La sequenza non riesce a collocare tutti i pezzi già noti.</li>}
          </ul>
          <p className="mt-3 text-xs text-slate-400">
            Confronto su {judgment.count} delle {judgment.totalMoves} mosse legali, prima di giocare. Sono voti della strategia, non punti di partita.
            {judgment.added ? " La tua mossa è stata approfondita dopo la scelta." : ""}
          </p>
          <p className="mt-2 text-xs" style={{ color: tone.border }}>
            {judgment.emphasis === "positive" ? "Da evidenziare: scelta particolarmente efficace."
              : judgment.emphasis === "negative" ? "Da evidenziare: occasione di miglioramento."
                : "Nessun segnale speciale per questa mossa."}
          </p>
          </div>
        </section>
      ) : <p className="text-xs text-slate-500">{busy ? "Valutazione al termine della mossa…" : "Il giudizio compare dopo ogni tua mossa."}</p>}
    </aside>
  );
}
