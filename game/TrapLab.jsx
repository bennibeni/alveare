"use client";

import { useMemo, useRef, useState } from "react";
import MiniBoard, { pieceCells } from "./GuideKit.jsx";
import { axialToPixel, hexPoints, pixelToAxial } from "./HexGrid.js";
import { PIECE_COLORS, pieceCentroid } from "./pieces.js";
import { legalMoves } from "./autopsy.js";
import { replayTrap } from "./trapReplay.js";
import TrapComparison, { TrapArchiveDownload } from "./TrapComparison.jsx";
import { readTrapEvaluations, trapRecordId } from "./trapArchive.js";
import TrapHistory from "./TrapHistory.jsx";
import { groupTraps, trapId, trapSource, groupStatus } from "./trapGroups.js";
import useTrapEvaluations from "./useTrapEvaluations.js";

const CARD_STATUS = {
  nuova: {
    label: "Da analizzare",
    color: "border-slate-700 bg-slate-900 text-slate-300",
  },
  analizzata: {
    label: "Già analizzata",
    color: "border-sky-600 bg-sky-950/60 text-sky-200",
  },
  migliore: {
    label: "Mossa migliore trovata",
    color: "border-emerald-500 bg-emerald-950/60 text-emerald-200",
  },
};

const labels = {
  salva: "Via d’uscita verso 40 celle libere",
  continua: "Si poteva continuare con i pezzi noti",
  bloccata: "Senza scampo con i pezzi noti",
  ignota: "Analisi incompleta",
};
const button = "hx-btn rounded-lg px-3 py-2 disabled:opacity-40";
const kind = (t) =>
  t.analysis.steps.some((s) => s.result === "ignota")
    ? "ignota"
    : t.analysis.decisive >= 0
      ? "evitabile"
      : "inevitabile";

function Piece({ piece }) {
  const points = piece.cells.map(([q, r]) => axialToPixel(q, r, 10));
  const xs = points.map(([x]) => x),
    ys = points.map(([, y]) => y);
  return (
    <svg
      width="80"
      height="55"
      viewBox={`${Math.min(...xs) - 12} ${Math.min(...ys) - 12} ${Math.max(...xs) - Math.min(...xs) + 24} ${Math.max(...ys) - Math.min(...ys) + 24}`}
      role="img"
      aria-label={piece.name}
    >
      {points.map(([x, y], i) => (
        <polygon
          key={i}
          points={hexPoints(x, y, 9)}
          fill={PIECE_COLORS[piece.color]}
        />
      ))}
    </svg>
  );
}

function Replay({ trap, strategyId }) {
  const { states } = useMemo(() => replayTrap(trap), [trap]);
  const [step, setStep] = useState(0);
  const [reveal, setReveal] = useState(false);
  const [attempt, setAttempt] = useState("");
  const [alternative, setAlternative] = useState("");
  const [drag, setDrag] = useState(null);
  const [dropMessage, setDropMessage] = useState("");
  const boardRef = useRef(null);
  const state = states[step];
  const a = trap.analysis;
  const verdict = a.steps.find((s) => s.number === step + 1);
  const decisive = a.decisive >= 0 ? a.start + a.decisive : -1;
  const moves = useMemo(
    () =>
      legalMoves({
        cells: [...state.grid.cells],
        tray: state.tray.map((p) => p.id),
      }),
    [state],
  );
  const encode = (m) => `${m.idx},${m.q},${m.r}`;
  const chosen = moves.find((m) => encode(m) === attempt);
  const preview = chosen
    ? state.grid.play(
        state.tray[chosen.idx].cells,
        chosen.q,
        chosen.r,
        state.tray[chosen.idx].color,
      ).grid
    : null;
  const recorded = trap.moves[step];
  const shown = reveal
    ? alternative
      ? alternative.split(",").map(Number)
      : recorded
    : null;
  const marks = shown
    ? [
        {
          cells: pieceCells(state.tray[shown[0]].cells, shown[1], shown[2]),
          fill: PIECE_COLORS[state.tray[shown[0]].color],
          stroke: "#fff",
        },
      ]
    : [];
  const targetAt = (event, idx) => {
    const svg = boardRef.current?.querySelector("svg");
    const matrix = svg?.getScreenCTM();
    if (!matrix) return null;
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(
      matrix.inverse(),
    );
    const [cq, cr] = pieceCentroid(state.tray[idx].cells);
    const [cx, cy] = axialToPixel(cq, cr, 10);
    const [q, r] = pixelToAxial(point.x - cx, point.y - cy, 10);
    const rect = svg.getBoundingClientRect();
    const inside =
      event.clientX >= rect.left &&
      event.clientX <= rect.right &&
      event.clientY >= rect.top &&
      event.clientY <= rect.bottom;
    let previous = null;
    const canonical = moves.find(
      (m) =>
        state.tray[m.idx].id === state.tray[idx].id && m.q === q && m.r === r,
    );
    if (inside && canonical) {
      try {
        previous =
          readTrapEvaluations(window.localStorage).find(
            (record) =>
              record.id === trapRecordId(trap, step, canonical, strategyId),
          )?.stato ?? null;
      } catch {
        /* Il trascinamento funziona anche senza archivio locale. */
      }
    }
    return {
      idx,
      q,
      r,
      valid: inside && state.grid.canPlace(state.tray[idx].cells, q, r),
      previous,
    };
  };
  const dragMarks = drag?.target
    ? [
        {
          cells: pieceCells(
            state.tray[drag.idx].cells,
            drag.target.q,
            drag.target.r,
          ),
          fill: drag.target.valid
            ? PIECE_COLORS[state.tray[drag.idx].color]
            : "#f43f5e",
          stroke: drag.target.valid ? "#fff" : "#fda4af",
        },
      ]
    : [];
  const go = (n) => {
    setStep(n);
    setAttempt("");
    setAlternative("");
    setDrag(null);
    setDropMessage("");
  };
  return (
    <section
      className="min-w-0 space-y-4 rounded-2xl bg-slate-900 p-4"
      aria-label="Replay della trappola"
    >
      <h2 className="text-xl font-semibold">
        Seme {trap.seed} · ingresso al pezzo {trap.pezzo} · copia {trap.k + 1}
      </h2>
      <p className="text-sm text-slate-400">
        {trap.libere} celle libere all’ingresso. Le celle grigie erano già
        occupate: il loro colore originale non è salvato.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <button
          className={button}
          disabled={step === 0}
          onClick={() => go(step - 1)}
        >
          ← Indietro
        </button>
        <p aria-live="polite">
          {step === trap.moves.length
            ? "Blocco finale"
            : `Prima della mossa ${step + 1} di ${trap.moves.length}`}
        </p>
        <button
          className={button}
          disabled={step === trap.moves.length}
          onClick={() => go(step + 1)}
        >
          Avanti →
        </button>
      </div>
      <input
        aria-label="Mossa del replay"
        className="w-full accent-amber-400"
        type="range"
        min="0"
        max={trap.moves.length}
        value={step}
        onChange={(e) => go(Number(e.target.value))}
      />
      <div className="flex flex-wrap items-center gap-6">
        <div className="max-w-full overflow-hidden" ref={boardRef}>
          <MiniBoard
            grid={state.grid}
            width={300}
            marks={drag ? dragMarks : marks}
            title="Tabellone della trappola"
          />
        </div>
        <div className="flex flex-wrap gap-3">
          {state.tray.map((p, i) => (
            <button
              type="button"
              className="rounded-xl bg-slate-800 p-2 text-center cursor-grab active:cursor-grabbing disabled:cursor-default disabled:opacity-40"
              style={{ touchAction: "none" }}
              key={i}
              data-piece-id={p.id}
              aria-label={`Trascina pezzo ${i + 1}: ${p.name}`}
              aria-describedby="trap-drag-help"
              disabled={!moves.some((m) => state.tray[m.idx].id === p.id)}
              onPointerDown={(e) => {
                if (!e.isPrimary || e.button !== 0) return;
                e.currentTarget.setPointerCapture(e.pointerId);
                setDropMessage("");
                setDrag({ idx: i, pointerId: e.pointerId, target: null });
              }}
              onPointerMove={(e) => {
                if (drag?.pointerId !== e.pointerId) return;
                setDrag({ ...drag, target: targetAt(e, i) });
              }}
              onPointerUp={(e) => {
                if (drag?.pointerId !== e.pointerId) return;
                const target = targetAt(e, i);
                if (target?.valid) {
                  // L'oracolo elenca una sola volta gli slot con pezzi identici.
                  const canonical = moves.find(
                    (m) =>
                      state.tray[m.idx].id === p.id &&
                      m.q === target.q &&
                      m.r === target.r,
                  );
                  if (canonical) setAttempt(encode(canonical));
                  setDropMessage(
                    `Mossa scelta: pezzo ${i + 1}, q ${target.q}, r ${target.r}.`,
                  );
                } else
                  setDropMessage(
                    "Posizione non valida. Trascina il pezzo sulle celle libere del tabellone.",
                  );
                setDrag(null);
                e.currentTarget.releasePointerCapture(e.pointerId);
              }}
              onPointerCancel={() => setDrag(null)}
              onLostPointerCapture={() => setDrag(null)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setDrag(null);
              }}
            >
              <p>Pezzo {i + 1}</p>
              <Piece piece={p} />
            </button>
          ))}
        </div>
      </div>
      <p id="trap-drag-help" className="text-sm text-slate-300">
        Trascina un pezzo sul tabellone e rilascialo per scegliere la mossa.
        L’anteprima rossa indica una posizione non valida.
      </p>
      <p role="status" className="text-sm text-amber-200">
        {drag?.target?.previous
          ? `Mossa già valutata: ${drag.target.previous === "confermata" ? "migliore" : "non migliore"}.`
          : dropMessage}
      </p>
      {!reveal && (
        <p className="text-slate-300">
          Quale mossa sceglieresti? Prova una posizione prima di mostrare la
          soluzione.
        </p>
      )}
      {moves.length > 0 ? (
        <div className="space-y-3">
          {preview && (
            <div>
              <p className="mb-2 text-sm">Tabellone dopo la tua mossa</p>
              <MiniBoard
                grid={preview}
                width={220}
                title="Anteprima della tua mossa"
              />
              {reveal && step === decisive && (
                <p role="status" className="mt-2 text-amber-200">
                  {a.saving.some(
                    (m) => encode(m) === attempt && m.result !== "ignota",
                  )
                    ? "La tua mossa lasciava una possibilità con i pezzi noti."
                    : a.saving.some((m) => encode(m) === attempt)
                      ? "L’esito della tua mossa è incerto."
                      : "Con questa mossa il blocco diventava inevitabile con i pezzi noti."}
                </p>
              )}
            </div>
          )}
          {chosen && recorded && (
            <TrapComparison
              key={`${step}|${attempt}`}
              state={state}
              chosen={chosen}
              recorded={recorded}
              trap={trap}
              step={step}
              strategyId={strategyId}
            />
          )}
          {chosen && (
            <button
              type="button"
              className={button}
              onClick={() => {
                setAttempt("");
                setAlternative("");
                setDrag(null);
                setDropMessage(
                  "Scegli un altro pezzo e trascinalo sul tabellone. Le valutazioni precedenti sono conservate nello storico.",
                );
                boardRef.current?.parentElement
                  ?.querySelector("button[data-piece-id]:not(:disabled)")
                  ?.focus();
              }}
            >
              Scegli un’altra mossa
            </button>
          )}
        </div>
      ) : (
        <p>Non ci sono mosse legali: la continuazione è bloccata.</p>
      )}
      <button
        className={button}
        aria-expanded={reveal}
        onClick={() => {
          setReveal(!reveal);
          setAlternative("");
        }}
      >
        {reveal ? "Nascondi analisi" : "Mostra analisi"}
      </button>
      {reveal && (
        <div className="space-y-3 rounded-xl border border-amber-400/30 p-4">
          <p className="font-semibold">
            {verdict
              ? labels[verdict.result]
              : "Posizione fuori dall’orizzonte analizzato"}
          </p>
          {recorded && (
            <p>
              {alternative
                ? "Alternativa evidenziata"
                : "Mossa registrata evidenziata"}
              : pezzo {shown[0] + 1}, q {shown[1]}, r {shown[2]}.
            </p>
          )}
          {decisive >= 0 ? (
            <button className={button} onClick={() => go(decisive)}>
              Vai alla mossa decisiva ({decisive + 1})
            </button>
          ) : (
            <p>
              Il blocco era già inevitabile all’inizio della discesa analizzata,
              nei limiti della ricerca.
            </p>
          )}
          {step === decisive && (
            <label className="block">
              Alternative alla mossa decisiva
              <select
                aria-label="Alternative alla mossa decisiva"
                className="mt-2 block w-full rounded-lg bg-slate-800 p-3"
                value={alternative}
                onChange={(e) => setAlternative(e.target.value)}
              >
                <option value="">Mostra la mossa registrata</option>
                {a.saving.map((m) => (
                  <option key={encode(m)} value={encode(m)}>
                    Pezzo {m.idx + 1} · q {m.q}, r {m.r} · {labels[m.result]}
                  </option>
                ))}
              </select>
            </label>
          )}
          <p className="text-sm text-slate-400">
            L’analisi usa i pezzi futuri della continuazione registrata. Un
            errore evitabile a posteriori non dimostra che fosse riconoscibile
            senza conoscerli.
          </p>
        </div>
      )}
    </section>
  );
}

export default function TrapLab({ traps, strategyId }) {
  const [filter, setFilter] = useState("tutte");
  const [selected, setSelected] = useState(null);
  const [history, setHistory] = useState(null);
  const groups = useMemo(() => groupTraps(traps), [traps]);
  const evaluations = useTrapEvaluations();
  const matches = (t) => filter === "tutte" || kind(t) === filter;
  const filtered = groups.filter((group) => group.members.some(matches));
  const currentGroup =
    filtered.find((group) =>
      group.members.some((t) => trapId(t) === selected && matches(t)),
    ) ?? filtered[0];
  const eligible = currentGroup?.members.filter(matches) ?? [];
  const current = eligible.find((t) => trapId(t) === selected) ?? eligible[0];
  return (
    <>
      <TrapArchiveDownload groups={groups} />
      <div
        className="flex flex-wrap gap-2 text-xs"
        aria-label="Legenda stato delle trappole"
      >
        {Object.entries(CARD_STATUS).map(([status, style]) => (
          <span
            key={status}
            className={`rounded-lg border px-3 py-2 ${style.color}`}
          >
            {style.label}
          </span>
        ))}
      </div>
      {evaluations.error && (
        <p role="alert" className="text-sm text-amber-200">
          Storico non disponibile: lo stato delle schede non può essere
          verificato.
        </p>
      )}
      <p className="text-sm text-slate-300">
        {groups.length} posizioni distinte · {traps.length} continuazioni. Le
        card raggruppano le stesse celle occupate e le stesse tre forme,
        indipendentemente dall’ordine nel vassoio. Ogni continuazione conserva
        il proprio futuro e la propria analisi.
      </p>
      <div className="flex flex-wrap gap-3 text-sm">
        {["inevitabile", "evitabile", "ignota"].map((k) => (
          <p key={k} className="rounded-xl bg-slate-900 px-4 py-3">
            {traps.filter((t) => kind(t) === k).length} ·{" "}
            {k === "inevitabile"
              ? "senza scampo"
              : k === "evitabile"
                ? "con mossa decisiva"
                : "analisi incomplete"}
          </p>
        ))}
      </div>
      <div className="grid gap-5 md:grid-cols-[250px_minmax(0,1fr)]">
        <aside className="space-y-3">
          <label className="block">
            Filtra le trappole
            <select
              className="mt-2 block w-full rounded-lg bg-slate-800 p-3"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            >
              <option value="tutte">Tutte</option>
              <option value="inevitabile">Senza scampo</option>
              <option value="evitabile">Con mossa decisiva</option>
              <option value="ignota">Analisi incompleta</option>
            </select>
          </label>
          <p role="status" className="text-sm text-slate-400">
            {filtered.length} posizioni ·{" "}
            {filtered.reduce(
              (n, group) => n + group.members.filter(matches).length,
              0,
            )}{" "}
            continuazioni nel filtro
          </p>
          <div className="max-h-72 space-y-2 overflow-y-auto md:max-h-[650px]">
            {filtered.map((group) => {
              const t = group.members.find(matches);
              const status = evaluations.error
                ? null
                : groupStatus(group, evaluations.records);
              const style = status
                ? CARD_STATUS[status]
                : {
                    label: "Stato non disponibile",
                    color: "border-slate-700 bg-slate-900 text-slate-300",
                  };
              return (
                <div
                  data-trap-status={status ?? "sconosciuto"}
                  className={`flex items-center rounded-xl border text-sm ${style.color} ${currentGroup === group ? "ring-2 ring-amber-300 ring-inset" : ""}`}
                  key={group.key}
                >
                  <button
                    className="min-w-0 flex-1 p-3 text-left"
                    aria-pressed={currentGroup === group}
                    onClick={() => setSelected(trapId(t))}
                  >
                    Seme {t.seed}
                    <br />
                    <span className="text-slate-400">
                      Pezzo {t.pezzo} · {group.members.length}{" "}
                      {group.members.length === 1
                        ? "continuazione"
                        : "continuazioni"}
                    </span>
                    <span className="mt-2 block text-xs font-semibold">
                      {style.label}
                    </span>
                  </button>
                  <button
                    type="button"
                    className="mr-2 shrink-0 rounded-lg p-2 text-amber-300 hover:bg-slate-700 focus-visible:outline-2 focus-visible:outline-amber-300"
                    aria-label={`Tentativi: seme ${t.seed}, pezzo ${t.pezzo}, copia ${t.k + 1}`}
                    title="Mostra i tentativi già valutati"
                    onClick={() => {
                      try {
                        const records = readTrapEvaluations(
                          window.localStorage,
                        ).filter((r) =>
                          group.members.some(
                            (member) => r.partita === trapSource(member),
                          ),
                        );
                        setHistory({
                          trap: t,
                          records,
                          continuations: group.members.length,
                          error: false,
                        });
                      } catch {
                        setHistory({
                          trap: t,
                          records: [],
                          continuations: group.members.length,
                          error: true,
                        });
                      }
                    }}
                  >
                    <svg
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M3 11a9 9 0 1 1 2.6 7M3 4v7h7" />
                      <path d="M12 7v5l3 2" />
                    </svg>
                  </button>
                </div>
              );
            })}
          </div>
        </aside>
        {current ? (
          <div className="min-w-0 space-y-4">
            {currentGroup.members.length > 1 && (
              <label className="block text-sm">
                Continuazione della posizione
                <select
                  className="mt-2 block w-full rounded-lg bg-slate-800 p-3"
                  value={trapId(current)}
                  onChange={(e) => setSelected(e.target.value)}
                >
                  {eligible.map((t) => (
                    <option key={trapId(t)} value={trapId(t)}>
                      Seme {t.seed} · pezzo {t.pezzo} · copia {t.k + 1} ·{" "}
                      {t.moves.length} mosse ·{" "}
                      {kind(t) === "evitabile"
                        ? "con mossa decisiva"
                        : kind(t) === "inevitabile"
                          ? "senza scampo"
                          : "analisi incompleta"}
                    </option>
                  ))}
                </select>
                <span className="mt-1 block text-slate-400">
                  {eligible.length} di {currentGroup.members.length}{" "}
                  continuazioni visibili con il filtro corrente.
                </span>
              </label>
            )}
            <Replay
              key={trapId(current)}
              trap={current}
              strategyId={strategyId}
            />
          </div>
        ) : (
          <p>Nessuna trappola per questo filtro.</p>
        )}
      </div>
      {history && (
        <TrapHistory
          {...history}
          strategyId={strategyId}
          onClose={() => setHistory(null)}
        />
      )}
    </>
  );
}
