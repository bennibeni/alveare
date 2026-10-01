"use client";

import { useEffect, useRef, useState } from "react";
import { fmt } from "./GuideKit.jsx";

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

export default function MoveFeedback({ snapshot, judgment, hidden, busy }) {
  const [sound, setSound] = useState(false);
  const [audioUnavailable, setAudioUnavailable] = useState(false);
  const [dismissed, setDismissed] = useState(null);
  const [expandedFor, setExpandedFor] = useState(null);
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

  const visible = judgment && snapshot !== dismissed && !busy;
  const tone = tones[judgment?.emphasis || "neutral"];
  const detailsOpen = judgment?.emphasis === "positive" || expandedFor === snapshot;
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
        <section role="status" aria-live="polite" aria-atomic="true" data-testid="move-feedback"
          data-emphasis={judgment.emphasis} className="hx-feedback-card rounded-2xl border-2 p-4 text-sm text-slate-200 shadow-lg"
          style={{ borderColor: tone.border, backgroundColor: tone.background }}>
          <div className="flex items-start justify-between gap-2">
            {judgment.emphasis === "positive" ? (
              <p className="font-semibold text-white">{tone.icon} {judgment.label}</p>
            ) : (
              <button type="button" className="hx-link flex flex-1 items-center justify-between gap-2 text-left font-semibold"
                aria-expanded={detailsOpen} aria-controls="move-feedback-details"
                aria-label={`Dettagli del giudizio: ${judgment.label}`}
                onClick={() => setExpandedFor(detailsOpen ? null : snapshot)}>
                <span>{tone.icon} {judgment.label}</span>
                <span aria-hidden="true">{detailsOpen ? "−" : "+"}</span>
              </button>
            )}
            <button type="button" className="hx-link rounded px-2" aria-label="Chiudi valutazione mossa" onClick={() => setDismissed(snapshot)}>×</button>
          </div>
          {judgment.label === "Occasione persa" && (
            <p className="mt-2 text-sm text-orange-200">Puoi annullare l&apos;ultima mossa e riprovare</p>
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
            <li>Fascia comparabile: ±{fmt(judgment.tolerance, 3)} punti.</li>
            {judgment.risk.death !== null && <li>Rischio stimato del pezzo ignoto: {fmt(judgment.risk.death * 100)}% (migliore valutata: {fmt(judgment.bestRisk.death * 100)}%).</li>}
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
