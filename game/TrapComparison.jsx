"use client";

import { useEffect, useState } from "react";
import { cellNumbers } from "./HexGrid.js";
import { improvedTrapsExport } from "./trapGroups.js";
import {
  archiveOf,
  readTrapArchive,
  readTrapEvaluations,
  saveTrapEvaluation,
  trapRecordId,
} from "./trapArchive.js";

const numbers = cellNumbers(4);
const packMove = (m, tray) => ({
  ...m,
  pezzo: tray[m.idx].id,
  nome: tray[m.idx].name,
  celle: tray[m.idx].cells
    .map(([q, r]) => numbers.get(`${q + m.q},${r + m.r}`))
    .sort((a, b) => a - b),
});
function downloadJson(data, filename) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function download(records, filename = "alveare-trappole-migliori.json") {
  downloadJson(archiveOf(records), filename);
}

export function TrapArchiveDownload({ groups = [] }) {
  const [message, setMessage] = useState("");
  return (
    <div className="space-y-2 text-sm">
      <button
        className="hx-btn rounded-lg px-3 py-2"
        onClick={() => {
          try {
            const records = readTrapArchive(window.localStorage);
            if (records.length) {
              download(records);
              setMessage(`${records.length} mosse esportate.`);
            } else
              setMessage(
                "Nessuna mossa confermata ancora salvata in questo browser.",
              );
          } catch {
            setMessage("Impossibile leggere l’archivio del browser.");
          }
        }}
      >
        Esporta le mosse migliori salvate
      </button>
      <button
        className="hx-btn rounded-lg px-3 py-2"
        onClick={() => {
          try {
            const payload = improvedTrapsExport(
              groups,
              readTrapEvaluations(window.localStorage),
            );
            if (!payload.posizioni.length) {
              setMessage(
                "Nessuna trappola con mosse migliori confermate in questo browser.",
              );
              return;
            }
            downloadJson(payload, "alveare-trappole-con-mosse-migliori.json");
            setMessage(
              `${payload.posizioni.length} posizioni esportate con continuazioni, analisi e tentativi.`,
            );
          } catch {
            setMessage("Impossibile esportare le trappole.");
          }
        }}
      >
        Esporta trappole con mosse migliori
      </button>
      <button
        className="hx-btn rounded-lg px-3 py-2"
        onClick={() => {
          try {
            const records = readTrapEvaluations(window.localStorage);
            if (records.length) {
              download(records, "alveare-trappole-valutazioni.json");
              setMessage(`${records.length} valutazioni esportate.`);
            } else setMessage("Nessuna valutazione salvata in questo browser.");
          } catch {
            setMessage("Impossibile leggere lo storico del browser.");
          }
        }}
      >
        Esporta tutte le valutazioni
      </button>
      <p role="status">{message}</p>
    </div>
  );
}

export default function TrapComparison({
  state,
  chosen,
  recorded,
  trap,
  step,
  strategyId,
}) {
  const [progress, setProgress] = useState(null);
  const [outcome, setOutcome] = useState(null);
  const [error, setError] = useState("");
  const [record, setRecord] = useState(null);
  const [saved, setSaved] = useState(false);
  const [cancelled, setCancelled] = useState(false);
  const [workerHandle, setWorkerHandle] = useState(null);
  const [cached, setCached] = useState(false);
  const recordId = trapRecordId(trap, step, chosen, strategyId);
  const same =
    state.tray[chosen.idx].id === state.tray[recorded[0]].id &&
    chosen.q === recorded[1] &&
    chosen.r === recorded[2];
  useEffect(() => {
    if (same || cancelled) return;
    let active = true,
      worker;
    const timer = setTimeout(() => {
      try {
        try {
          const previous = readTrapEvaluations(window.localStorage).find(
            (r) => r.id === recordId,
          );
          if (previous) {
            setOutcome({
              prova: previous.prova,
              conferma: previous.conferma,
              confirmed: previous.stato === "confermata",
            });
            setRecord(previous);
            setSaved(true);
            setCached(true);
            return;
          }
        } catch {
          /* Un errore di lettura non impedisce il confronto. */
        }
        worker = new Worker(
          new URL("./trapComparison.worker.js", import.meta.url),
        );
        setWorkerHandle(worker);
        const posizione = {
          celle: [...state.grid.cells].filter(([, v]) => v).map(([k]) => k),
          vassoio: state.tray.map((p) => p.id),
          combo: state.streak,
          libere: [...state.grid.cells.values()].filter((v) => !v).length,
        };
        const tua = packMove(chosen, state.tray);
        const suggerita = packMove(
          { idx: recorded[0], q: recorded[1], r: recorded[2] },
          state.tray,
        );
        worker.onmessage = ({ data }) => {
          if (!active) return;
          if (data.progress) setProgress(data.progress);
          if (data.error) {
            setError(data.error);
            worker.terminate();
          }
          if (data.result) {
            setOutcome(data.result);
            worker.terminate();
            {
              const measure = data.result.conferma ?? data.result.prova;
              const rec = {
                id: recordId,
                partita: `trappola-${trap.seed}-${trap.pezzo}-${trap.k}`,
                mossa: step + 1,
                stato: data.result.confirmed ? "confermata" : "non_migliore",
                esito: data.result.confirmed
                  ? "migliore"
                  : measure.differenza < -2 * measure.errore
                    ? "peggiore"
                    : "vantaggio_non_confermato",
                posizione,
                tua,
                suggerita,
                app: {
                  strategia: strategyId,
                  confronto: "storica-fa730f6",
                  protocollo: "trappole-paired-v1",
                  penalitaBlocco: 1000,
                  bloccoFinaleIncluso: true,
                },
                prova: data.result.prova,
                conferma: data.result.conferma,
                aggiunto: new Date().toISOString().slice(0, 10),
              };
              setRecord(rec);
              try {
                saveTrapEvaluation(window.localStorage, rec);
                setSaved(true);
              } catch {
                setError(
                  "Il salvataggio nel browser non è riuscito. Scarica il risultato per conservarlo.",
                );
              }
            }
          }
        };
        worker.onerror = () => {
          if (active)
            setError("Confronto interrotto per un errore di calcolo.");
          worker.terminate();
        };
        worker.postMessage({ posizione, tua, suggerita });
      } catch {
        if (active)
          setError("Il browser non permette di avviare il confronto.");
      }
    }, 600);
    return () => {
      active = false;
      clearTimeout(timer);
      worker?.terminate();
    };
  }, [
    state,
    chosen,
    recorded,
    trap,
    step,
    strategyId,
    same,
    cancelled,
    recordId,
  ]);
  const result = outcome?.conferma ?? outcome?.prova;
  return (
    <section
      className="space-y-3 rounded-xl border border-slate-700 p-4"
      aria-label="Confronto su futuri casuali"
    >
      <h3 className="font-semibold">La tua mossa contro la mossa registrata</h3>
      <p className="text-sm text-slate-400">
        Stessi futuri casuali per entrambe, con 15 mosse successive di autogioco
        attuale. Prima 30 prove, poi 100 nuove se emerge un vantaggio. Criterio:
        punti − 1000 per ogni blocco.
      </p>
      {same ? (
        <p>
          Hai scelto la stessa mossa registrata: il confronto sarebbe identico.
        </p>
      ) : (
        <>
          {cached && (
            <p role="status" className="text-amber-200">
              Mossa già valutata: risultato recuperato dallo storico, senza
              ripetere il confronto.
            </p>
          )}
          {!outcome && !error && !cancelled && (
            <>
              <p role="status">
                {progress
                  ? `${progress.phase === "prova" ? "Prima prova" : "Conferma"}: ${progress.done} / ${progress.total} futuri`
                  : "Preparazione del confronto…"}
              </p>
              <button
                className="hx-btn rounded-lg px-3 py-2"
                onClick={() => {
                  workerHandle?.terminate();
                  setCancelled(true);
                }}
              >
                Interrompi confronto
              </button>
            </>
          )}
          {cancelled && (
            <p role="status">Confronto interrotto. Nessuna mossa registrata.</p>
          )}
          {result && (
            <>
              <p role="status" className="font-semibold text-amber-200">
                {outcome.confirmed
                  ? "La tua mossa è risultata migliore anche nella conferma."
                  : "Il confronto non conferma che la tua mossa sia migliore."}
              </p>
              <table className="w-full text-sm">
                <caption className="mb-2 text-left">
                  {outcome.conferma ? "Conferma indipendente" : "Prima prova"}:{" "}
                  {result.futuri} futuri
                </caption>
                <thead>
                  <tr>
                    <th className="text-left">Mossa</th>
                    <th>Punti medi</th>
                    <th>Blocchi</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Tua</td>
                    <td className="text-center">{result.a.punti.toFixed(1)}</td>
                    <td className="text-center">
                      {result.a.blocchi}/{result.futuri}
                    </td>
                  </tr>
                  <tr>
                    <td>Registrata</td>
                    <td className="text-center">{result.b.punti.toFixed(1)}</td>
                    <td className="text-center">
                      {result.b.blocchi}/{result.futuri}
                    </td>
                  </tr>
                </tbody>
              </table>
              <p className="text-sm">
                Vantaggio stimato: {result.differenza.toFixed(1)} ±{" "}
                {(2 * result.errore).toFixed(1)} punti, blocchi inclusi.
                Migliore solo se il vantaggio supera due errori standard in
                entrambe le fasi. Tutti gli esiti completati vengono registrati.
              </p>
            </>
          )}
          {saved && (
            <p role="status" className="text-emerald-300">
              {outcome.confirmed
                ? "Mossa registrata nell’archivio di questo browser."
                : "Mossa registrata come non migliore nello storico di questo browser."}{" "}
              Esporta lo storico per conservarlo anche fuori dal browser.
            </p>
          )}
          {record && (
            <button
              className="hx-btn rounded-lg px-3 py-2"
              onClick={() =>
                download(
                  [record],
                  outcome.confirmed
                    ? "alveare-trappole-migliori.json"
                    : "alveare-trappole-valutazioni.json",
                )
              }
            >
              Scarica questa valutazione
            </button>
          )}
          {error && (
            <p role="alert" className="text-rose-300">
              {error}
            </p>
          )}
        </>
      )}
      <p className="text-xs text-slate-400">
        Il risultato riguarda questo orizzonte e questa strategia di
        continuazione. L’archivio conserva il confronto storico e non modifica
        automaticamente l’autogioco.
      </p>
    </section>
  );
}
