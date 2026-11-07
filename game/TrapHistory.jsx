"use client";

import { useEffect, useRef } from "react";

export default function TrapHistory({
  trap,
  records,
  error,
  strategyId,
  onClose,
  continuations = 1,
}) {
  const dialog = useRef(null);
  useEffect(() => {
    const element = dialog.current;
    if (!element.open) element.showModal();
  }, []);
  const better = records.filter((r) => r.stato === "confermata").length;
  return (
    <dialog
      ref={dialog}
      onClose={onClose}
      aria-labelledby="trap-history-title"
      className="fixed inset-0 m-auto max-h-[85dvh] w-[calc(100%_-_2rem)] max-w-2xl overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 p-5 text-slate-100 shadow-2xl backdrop:bg-black/70"
      onClick={(e) => {
        if (e.target !== e.currentTarget) return;
        const rect = e.currentTarget.getBoundingClientRect();
        if (
          e.clientX < rect.left ||
          e.clientX > rect.right ||
          e.clientY < rect.top ||
          e.clientY > rect.bottom
        )
          e.currentTarget.close();
      }}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 id="trap-history-title" className="text-xl font-semibold">
            Tentativi per seme {trap.seed}
          </h2>
          <p className="mt-1 text-sm text-slate-400">
            Ingresso al pezzo {trap.pezzo} · {continuations}{" "}
            {continuations === 1 ? "continuazione" : "continuazioni"}
          </p>
        </div>
        <button
          type="button"
          autoFocus
          className="hx-btn rounded-lg px-3 py-2"
          aria-label="Chiudi tentativi"
          onClick={() => dialog.current.close()}
        >
          ✕
        </button>
      </div>
      {error ? (
        <p role="alert" className="mt-5 text-rose-300">
          Impossibile leggere lo storico di questo browser.
        </p>
      ) : records.length === 0 ? (
        <p className="mt-5 text-slate-300">
          Nessun tentativo valutato per questa trappola.
        </p>
      ) : (
        <>
          <p className="my-4 text-sm text-slate-300">
            {records.length} {records.length === 1 ? "tentativo" : "tentativi"}{" "}
            · {better} migliori · {records.length - better} non migliori
          </p>
          <ul className="space-y-3" aria-label="Tentativi già valutati">
            {[...records].reverse().map((record) => {
              const result = record.conferma ?? record.prova;
              return (
                <li
                  key={record.id}
                  className="space-y-2 rounded-xl border border-slate-700 p-3 text-sm"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-semibold">
                      Mossa {record.mossa} · pezzo {record.tua.idx + 1}
                    </p>
                    <span
                      className={`rounded-full px-2 py-1 text-xs ${record.stato === "confermata" ? "bg-emerald-950 text-emerald-200" : "bg-slate-800 text-amber-200"}`}
                    >
                      {record.stato === "confermata"
                        ? "Migliore"
                        : "Non migliore"}
                    </span>
                  </div>
                  <p className="text-slate-300">
                    {record.tua.nome ?? record.tua.pezzo} · q {record.tua.q}, r{" "}
                    {record.tua.r}
                  </p>
                  <p className="text-xs text-slate-400">
                    Origine:{" "}
                    {record.partita.replace(
                      /^trappola-(\d+)-(\d+)-(\d+)$/,
                      (_, seed, entry, copy) =>
                        `seme ${seed}, ingresso ${entry}, copia ${Number(copy) + 1}`,
                    )}
                  </p>
                  {result && (
                    <>
                      <p>
                        Vantaggio: {result.differenza.toFixed(1)} ±{" "}
                        {(2 * result.errore).toFixed(1)} punti
                      </p>
                      <p className="text-slate-300">
                        Blocchi: tua {result.a.blocchi}/{result.futuri} ·
                        registrata {result.b.blocchi}/{result.futuri}
                      </p>
                      <p className="text-xs text-slate-400">
                        {record.conferma ? "Conferma" : "Prima prova"} su{" "}
                        {result.futuri} futuri · {record.aggiunto}
                      </p>
                    </>
                  )}
                  {record.stato !== "confermata" && (
                    <p className="text-xs text-slate-400">
                      {record.esito === "peggiore"
                        ? "Risultato nettamente peggiore nel test."
                        : "Vantaggio non confermato: non significa necessariamente peggiore."}
                    </p>
                  )}
                  {record.app?.strategia !== strategyId && (
                    <p className="text-xs text-amber-300">
                      Valutazione con una versione precedente della strategia.
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
      <p className="mt-4 text-xs text-slate-400">
        Sono mostrati i confronti completati e salvati in questo browser.
        Vantaggio calcolato sui punti, con penalità di 1000 per blocco.
      </p>
    </dialog>
  );
}
