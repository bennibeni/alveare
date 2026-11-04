"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import MiniBoard, { pieceCells } from "./GuideKit.jsx";
import { cellNumbers, key } from "./HexGrid.js";
import { PIECE_COLORS, PIECES } from "./pieces.js";
import { SAFE, RISK_FUTURES, autopsyInput, placementsOf } from "./autopsy.js";
import { requestAutopsy } from "./autopsyClient.js";
import {
  descentMoves,
  loadMoveData,
  numbersOf,
  rowsOf,
  stepRisk,
} from "./autopsyData.js";
import {
  NOISE,
  aboutFraction,
  detailedJudgment,
  inPercent,
  percent,
  verdictText,
} from "./autopsyText.js";

const PIECE_BY_ID = new Map(PIECES.map((p) => [p.id, p]));
const NUMBERS = cellNumbers(4);
const TONE = {
  salva: { chip: "bg-emerald-900 text-emerald-100", text: "text-emerald-300" },
  continua: { chip: "bg-amber-900 text-amber-100", text: "text-amber-300" },
  bloccata: { chip: "bg-rose-950 text-rose-200", text: "text-rose-300" },
  ignota: { chip: "bg-slate-700 text-slate-200", text: "text-slate-300" },
};
const SHORT = {
  salva: "via d’uscita",
  continua: "continua",
  bloccata: "senza scampo",
  ignota: "–",
};
const VERDICT = {
  salva: "Via d’uscita",
  continua: "Si poteva continuare",
  bloccata: "Senza scampo",
  ignota: "Non calcolata",
};

const cellsText = (n) =>
  `${n.length === 1 ? "cella" : "celle"} ${n.join(", ")}`;

/** Miniatura di un pezzo. */
function PieceMini({ piece, size = 7 }) {
  const S3 = Math.sqrt(3);
  const pts = piece.cells.map(([q, r]) => [
    size * S3 * (q + r / 2),
    size * 1.5 * r,
  ]);
  const pad = size + 1;
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const minX = Math.min(...xs) - pad;
  const minY = Math.min(...ys) - pad;
  const w = Math.max(...xs) - Math.min(...xs) + 2 * pad;
  const h = Math.max(...ys) - Math.min(...ys) + 2 * pad;
  const hex = (cx, cy) =>
    Array.from({ length: 6 }, (_, i) => {
      const a = (Math.PI / 180) * (60 * i - 30);
      return `${(cx + (size - 0.8) * Math.cos(a)).toFixed(2)},${(cy + (size - 0.8) * Math.sin(a)).toFixed(2)}`;
    }).join(" ");
  return (
    <svg
      viewBox={`${minX} ${minY} ${w} ${h}`}
      width={w}
      height={h}
      aria-hidden="true"
    >
      {pts.map(([x, y], i) => (
        <polygon key={i} points={hex(x, y)} fill={PIECE_COLORS[piece.color]} />
      ))}
    </svg>
  );
}

/**
 * Mini-tabellone con una mossa evidenziata e la sua descrizione. Le celle riempite dalla mossa
 * portano il loro numero, lo stesso della descrizione; `n` è il numero della mossa nell'elenco.
 */
function MoveFigure({ grid, piece, move, title, n, children }) {
  const cells = pieceCells(piece.cells, move.q, move.r);
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl bg-slate-800/60 p-3">
      <MiniBoard
        grid={grid}
        width={180}
        dimFilled
        emptyFill="#475569"
        title={title}
        marks={cells.map(([q, r]) => ({
          cells: [[q, r]],
          fill: PIECE_COLORS[piece.color],
          stroke: "#ffffff",
          label: String(NUMBERS.get(key(q, r))),
        }))}
      />
      <div className="min-w-0 flex-1 basis-40 space-y-1">
        <p className="font-semibold text-white">
          {n ? `${n}. ` : ""}Pezzo {move.idx + 1}: {piece.name}
        </p>
        <p>{cellsText(numbersOf(piece, move.q, move.r))}.</p>
        {children}
      </div>
    </div>
  );
}

/** Sequenza dell'oracolo da una posizione, mossa per mossa. */
function OracleLine({ grid, tray, path, draws, from, result }) {
  const [j, setJ] = useState(0);
  const states = useMemo(() => {
    const out = [{ grid, tray }];
    let g = grid;
    let t = tray;
    path.forEach(([idx, q, r], k) => {
      g = g.play(t[idx].cells, q, r, t[idx].color).grid;
      t = t.map((p, i) => (i === idx ? PIECE_BY_ID.get(draws[from + k]) : p));
      out.push({ grid: g, tray: t });
    });
    return out;
  }, [grid, tray, path, draws, from]);
  const done = j === path.length;
  const s = states[j];
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="hx-btn rounded-lg px-2.5 py-1"
          onClick={() => setJ(j - 1)}
          disabled={j === 0}
          aria-label="Mossa precedente dell'oracolo"
        >
          ←
        </button>
        <span className="tabular-nums">
          {done ? "Fine" : `Mossa ${j + 1} di ${path.length}`}
        </span>
        <button
          type="button"
          className="hx-btn rounded-lg px-2.5 py-1"
          onClick={() => setJ(j + 1)}
          disabled={done}
          aria-label="Mossa successiva dell'oracolo"
        >
          →
        </button>
      </div>
      {done ? (
        <div className="flex flex-wrap items-center gap-3 rounded-xl bg-slate-800/60 p-3">
          <MiniBoard
            grid={s.grid}
            width={120}
            emptyFill="#475569"
            title="Tabellone alla fine della sequenza"
          />
          <p className={TONE[result].text}>
            {result === "salva"
              ? `Di nuovo ${SAFE} celle libere o più.`
              : "Pezzi arrivati finiti, partita non ancora bloccata."}
          </p>
        </div>
      ) : (
        <MoveFigure
          grid={s.grid}
          piece={s.tray[path[j][0]]}
          move={{ idx: path[j][0], q: path[j][1], r: path[j][2] }}
          title={`Mossa ${j + 1} della sequenza dell'oracolo`}
          n={j + 1}
        />
      )}
    </div>
  );
}

/**
 * Dettaglio di una mossa giocata: posizione e vassoio, giudizio dettagliato, mossa scelta e mossa
 * più sicura, elenco delle mosse con il rischio di ognuna.
 */
function MoveDetails({
  snapshot,
  number,
  draws,
  index,
  saving = null,
  legal = 0,
}) {
  const [data, setData] = useState(null); // { analysis, judgment, risks, total } | { error }
  const [showSaving, setShowSaving] = useState(false);
  const input = useMemo(
    () => ({
      cells: [...snapshot.grid.cells],
      tray: snapshot.tray.map((p) => p.id),
    }),
    [snapshot],
  );
  useEffect(() => {
    let current = true;
    loadMoveData(snapshot, draws, index)
      .then((d) => current && setData(d))
      .catch(() => current && setData({ error: true }));
    return () => {
      current = false;
    };
  }, [snapshot, draws, index]);

  const placements = useMemo(() => placementsOf(input), [input]);
  const tray = snapshot.tray;
  const free = [...snapshot.grid.cells.values()].filter((v) => !v).length;

  if (!data)
    return (
      <p className="text-slate-400" role="status">
        Calcolo del giudizio…
      </p>
    );
  if (data.error)
    return (
      <p className="text-slate-400" role="status">
        Giudizio non disponibile.
      </p>
    );

  const { judgment } = data;
  const playedPiece = tray[snapshot.idx];
  const { rows, sorted, best, played } = rowsOf(snapshot, data);
  const rowOf = (m) =>
    rows.find(
      (r) => r.piece.id === tray[m.idx].id && r.q === m.q && r.r === m.r,
    );
  const paragraphs = detailedJudgment({
    position: {
      free,
      tray: tray.map((p, slot) => ({
        slot,
        name: p.name,
        count: placements[slot],
      })),
    },
    rows,
    judgment,
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-4 rounded-xl bg-slate-800/60 p-3">
        <MiniBoard
          grid={snapshot.grid}
          width={150}
          emptyFill="#475569"
          title={`Posizione prima della mossa ${number}`}
        />
        <div className="space-y-2">
          <p className="font-semibold text-white">
            Prima della mossa {number} · {free} celle libere
          </p>
          <div className="flex items-end gap-4" aria-label="Vassoio">
            {tray.map((p, i) => (
              <div key={i} className="flex flex-col items-center gap-1 text-xs">
                <PieceMini piece={p} />
                <span>
                  {i + 1}: {placements[i]}{" "}
                  {placements[i] === 1 ? "posto" : "posti"}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div
        className="space-y-2 rounded-xl bg-slate-800/40 p-3"
        data-testid="autopsy-judgment"
      >
        <p className="font-medium text-white">Giudizio</p>
        {paragraphs.map((t, i) => (
          <p key={i}>{t}</p>
        ))}
      </div>

      {/* schede in ordine di numero, come nell'elenco */}
      {[
        best && !best.played ? { r: best, kind: "best" } : null,
        played ? { r: played, kind: "played" } : null,
      ]
        .filter(Boolean)
        .sort((x, y) => x.r.n - y.r.n)
        .map(({ r, kind }) => (
          <MoveFigure
            key={kind}
            grid={snapshot.grid}
            piece={kind === "played" ? playedPiece : r.piece}
            move={
              kind === "played" ? snapshot : { idx: r.slot, q: r.q, r: r.r }
            }
            title={kind === "played" ? "Mossa scelta" : "Mossa più sicura"}
            n={r.n}
          >
            {kind === "played" ? (
              <p className="text-emerald-300">✓ Mossa scelta</p>
            ) : (
              <p className="text-sky-300">
                Mossa più sicura{r.suggested ? " · suggerita" : ""}
              </p>
            )}
            <p>Senza scampo {inPercent(r.lost)} dei futuri.</p>
          </MoveFigure>
        ))}

      <div className="overflow-x-auto">
        <table
          className="w-full min-w-[38rem] text-left text-xs tabular-nums"
          data-testid="autopsy-moves"
        >
          <thead className="text-slate-400">
            <tr>
              <th className="py-1 pr-2 font-normal">N.</th>
              <th className="py-1 pr-2 font-normal">Mossa</th>
              <th className="py-1 pr-2 font-normal">Celle</th>
              <th className="py-1 pr-2 text-right font-normal">Libere dopo</th>
              <th className="py-1 pr-2 text-right font-normal">
                Stima del gioco
              </th>
              <th className="py-1 pr-2 text-right font-normal">Senza scampo</th>
              <th className="py-1 text-right font-normal">Pezzi arrivati</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r, i) => (
              <tr
                key={i}
                className={r.played ? "bg-emerald-950 text-emerald-100" : ""}
                data-played={r.played ? "true" : undefined}
              >
                <td className="py-1 pr-2">{r.n}.</td>
                <td className="py-1 pr-2">
                  Pezzo {r.slot + 1}: {r.name}
                  {r.played ? " ✓" : ""}
                  {r.suggested ? " · suggerita" : ""}
                  {r.tie ? " · pari merito" : ""}
                </td>
                <td className="py-1 pr-2">{r.cells.join(", ")}</td>
                <td className="py-1 pr-2 text-right">
                  {r.free}
                  {r.lines
                    ? ` (${r.lines} ${r.lines === 1 ? "linea" : "linee"})`
                    : ""}
                </td>
                <td className="py-1 pr-2 text-right">
                  {r.estimate === undefined
                    ? "–"
                    : r.estimate === "blocked"
                      ? "un pezzo non entra"
                      : percent(r.estimate)}
                </td>
                <td
                  className={`py-1 pr-2 text-right ${r === best ? "text-sky-300" : ""}`}
                >
                  {percent(r.lost)}
                </td>
                <td
                  className={`py-1 text-right ${r.actual ? TONE[r.actual].text : ""}`}
                >
                  {r.actual ? SHORT[r.actual] : "–"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-400">
        Senza scampo: su {RISK_FUTURES} futuri a caso, gli stessi per tutte le
        mosse, quota in cui nemmeno chi conosce i pezzi in arrivo torna ad
        almeno {SAFE} celle libere. Stima del gioco: rischio di blocco calcolato
        dal suggerimento. Pari merito: rischio entro {Math.round(100 * NOISE)}{" "}
        punti dalla mossa più sicura. Pezzi arrivati: esito con i pezzi usciti
        davvero in questa partita.
        {data.total > rows.length
          ? ` Mosse valutate: le ${rows.length} approfondite dal gioco, su ${data.total} possibili.`
          : ""}
      </p>

      <div className="space-y-2 rounded-xl bg-slate-800/40 p-3">
        <p className="font-medium text-white">
          Pezzi arrivati dopo la mossa {number}
        </p>
        <div
          className="flex flex-wrap items-end gap-3"
          aria-label="Pezzi arrivati"
        >
          {draws.slice(index).map((id, k) => (
            <div
              key={k}
              className="flex flex-col items-center gap-1 text-[11px] text-slate-400"
            >
              <PieceMini piece={PIECE_BY_ID.get(id)} size={6} />
              <span>dopo la {index + k + 1}</span>
            </div>
          ))}
        </div>
        <p className="text-xs text-slate-400">
          Poi nessun pezzo del vassoio entrava più.
        </p>
      </div>

      {saving && (
        <div className="rounded-xl bg-slate-800/40 p-3">
          <button
            type="button"
            className="hx-link flex w-full items-center justify-between text-left font-medium"
            aria-expanded={showSaving}
            aria-controls={`autopsy-saving-${number}`}
            onClick={() => setShowSaving((v) => !v)}
          >
            <span className="text-amber-300">
              Con i pezzi arrivati davvero{" "}
              {saving.length === 1
                ? `evitava il blocco 1 mossa su ${legal}`
                : `evitavano il blocco ${saving.length} mosse su ${legal}`}
            </span>
            <span className="hx-link-sign text-slate-500" aria-hidden="true">
              {showSaving ? "−" : "+"}
            </span>
          </button>
          {showSaving && (
            <div id={`autopsy-saving-${number}`} className="mt-2 space-y-2">
              <p className="text-xs text-slate-400">
                Vale solo per i pezzi usciti in questa partita: il rischio con
                pezzi qualsiasi è nell’elenco.
              </p>
              {saving
                .map((m) => ({ ...m, n: rowOf(m)?.n }))
                .sort((x, y) => (x.n ?? Infinity) - (y.n ?? Infinity))
                .map((m, i) => (
                  <MoveFigure
                    key={i}
                    grid={snapshot.grid}
                    piece={tray[m.idx]}
                    move={m}
                    title={`Mossa che evitava il blocco ${i + 1}`}
                    n={m.n}
                  >
                    <p className={TONE[m.result].text}>{VERDICT[m.result]}</p>
                  </MoveFigure>
                ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Finestra «L'errore più costoso»: per ogni mossa della discesa finale, quanto rischio la mossa
 * scelta ha aggiunto rispetto alla mossa più sicura (futuri senza scampo, stessi futuri per tutte
 * le mosse); la mossa con il distacco maggiore è l'errore più costoso.
 */
function CostliestError({ autopsy, moveLog, onGo, onClose }) {
  const ref = useRef(null);
  const items = useMemo(
    () => descentMoves(autopsy, moveLog),
    [autopsy, moveLog],
  );
  const [done, setDone] = useState([]); // { j, number, snapshot, played, best }
  const [error, setError] = useState(false);

  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal?.();
  }, []);
  useEffect(() => {
    let current = true;
    (async () => {
      const out = [];
      for (const it of items) {
        const r = await stepRisk(it, autopsy.draws);
        if (!current) return;
        out.push(r);
        setDone([...out]);
      }
    })().catch(() => current && setError(true));
    return () => {
      current = false;
    };
  }, [items, autopsy]);

  const finished = done.length === items.length;
  const worst = finished
    ? done.reduce((a, b) => (b.cost > a.cost + 1e-9 ? b : a), done[0])
    : null;
  const decisive =
    autopsy.decisive >= 0 ? autopsy.steps[autopsy.decisive].number : null;
  const decisiveItem = done.find((d) => d.number === decisive);
  const maxCost = Math.max(NOISE, ...done.map((d) => d.cost));

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && ref.current.close()}
      aria-labelledby="costliest-title"
      data-testid="costliest-error"
      className="m-auto max-h-[90vh] w-[min(40rem,calc(100vw-2rem))] overflow-y-auto rounded-2xl bg-slate-900 p-4 text-sm text-slate-300 ring-1 ring-slate-700 backdrop:bg-black/70"
    >
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <h2
            id="costliest-title"
            className="text-base font-semibold text-white"
          >
            L’errore più costoso
          </h2>
          <button
            type="button"
            className="hx-btn rounded-lg px-2.5 py-1"
            onClick={() => ref.current?.close()}
            aria-label="Chiudi"
          >
            ×
          </button>
        </div>
        {error ? (
          <p role="status">Calcolo non riuscito. Riprova.</p>
        ) : !finished ? (
          <p role="status" className="text-slate-400">
            Calcolo del rischio delle mosse… {done.length} di {items.length}
          </p>
        ) : !worst || worst.cost <= NOISE ? (
          <p data-testid="costliest-verdict">
            Nessun errore evidente: in ogni mossa della discesa finale hai
            scelto una delle mosse più sicure. La sconfitta è dipesa soprattutto
            dai pezzi arrivati.
          </p>
        ) : (
          <>
            <p
              className="font-medium text-white"
              data-testid="costliest-verdict"
            >
              Mossa {worst.number}: hai aggiunto {Math.round(100 * worst.cost)}{" "}
              punti di rischio.
            </p>
            <p>
              Dopo la tua mossa la partita restava senza scampo{" "}
              {inPercent(worst.played.lost)} dei futuri (
              {aboutFraction(worst.played.lost)}); con la mossa più sicura{" "}
              {inPercent(worst.best.lost)}.{" "}
              {worst.number === decisive
                ? "È anche la mossa decisiva."
                : decisive !== null && decisiveItem
                  ? `La mossa decisiva, la ${decisive}, ha aggiunto ${Math.max(0, Math.round(100 * decisiveItem.cost))} punti: lì hanno contato soprattutto i pezzi arrivati.`
                  : ""}
            </p>
            {[
              { r: worst.best, kind: "best" },
              { r: worst.played, kind: "played" },
            ]
              .sort((x, y) => x.r.n - y.r.n)
              .map(({ r, kind }) => (
                <MoveFigure
                  key={kind}
                  grid={worst.snapshot.grid}
                  piece={r.piece}
                  move={{ idx: r.slot, q: r.q, r: r.r }}
                  title={
                    kind === "played" ? "Mossa scelta" : "Mossa più sicura"
                  }
                  n={r.n}
                >
                  {kind === "played" ? (
                    <p className="text-emerald-300">✓ Mossa scelta</p>
                  ) : (
                    <p className="text-sky-300">
                      Mossa più sicura{r.suggested ? " · suggerita" : ""}
                    </p>
                  )}
                  <p>Senza scampo {inPercent(r.lost)} dei futuri.</p>
                </MoveFigure>
              ))}
          </>
        )}

        {finished && !error && (
          <>
            <p className="font-medium text-white">
              Rischio aggiunto in ogni mossa della discesa finale
            </p>
            <ul
              className="space-y-1 text-xs tabular-nums"
              aria-label="Rischio aggiunto per mossa"
            >
              {done.map((d) => (
                <li key={d.number} className="flex items-center gap-2">
                  <span className="w-20 shrink-0">
                    Mossa {d.number}
                    {d.number === decisive ? " ◆" : ""}
                  </span>
                  <span className="h-2.5 flex-1 rounded bg-slate-800">
                    <span
                      className={`block h-2.5 rounded ${d === worst && d.cost > NOISE ? "bg-rose-400" : "bg-slate-500"}`}
                      style={{
                        width: `${(100 * Math.max(0, d.cost)) / maxCost}%`,
                      }}
                    />
                  </span>
                  <span className="w-16 shrink-0 text-right">
                    +{Math.max(0, Math.round(100 * d.cost))} punti
                  </span>
                </li>
              ))}
            </ul>
            <p className="text-xs text-slate-400">
              Rischio aggiunto: futuri senza scampo dopo la tua mossa meno
              quelli dopo la mossa più sicura, su {RISK_FUTURES} futuri a caso.
              ◆ mossa decisiva. Differenze di 1–2 punti sono nel rumore del
              calcolo.
            </p>
            <div className="flex flex-wrap gap-2">
              {worst && worst.cost > NOISE && (
                <button
                  type="button"
                  className="hx-btn rounded-lg px-3 py-1.5"
                  onClick={() => onGo(worst.j)}
                >
                  Vai alla mossa {worst.number}
                </button>
              )}
              <button
                type="button"
                className="hx-btn rounded-lg px-3 py-1.5"
                onClick={() => ref.current?.close()}
              >
                Chiudi
              </button>
            </div>
          </>
        )}
      </div>
    </dialog>
  );
}

export default function GameAutopsy({ moveLog, finalGrid, finalTray }) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState(null); // { autopsy } | { error }
  const [sel, setSel] = useState(null);
  const [showLine, setShowLine] = useState(false);
  const [costly, setCostly] = useState(false);
  const [decisiveRisk, setDecisiveRisk] = useState(null); // { played, best } della decisiva

  useEffect(() => {
    let current = true;
    requestAutopsy(autopsyInput(moveLog, finalTray))
      .then((autopsy) => current && setState({ autopsy }))
      .catch(() => current && setState({ error: true }));
    return () => {
      current = false;
    };
  }, [moveLog, finalTray]);

  const a = state?.autopsy;
  useEffect(() => {
    if (!a || a.decisive < 0) return;
    let current = true;
    const item = descentMoves(a, moveLog).find((x) => x.j === a.decisive);
    if (item)
      stepRisk(item, a.draws)
        .then((r) => current && setDecisiveRisk(r))
        .catch(() => {});
    return () => {
      current = false;
    };
  }, [a, moveLog]);
  const summary = !a
    ? ""
    : a.decisive >= 0
      ? ` (mossa decisiva ${a.steps[a.decisive].number})`
      : a.steps[0].result === "bloccata"
        ? " (senza scampo)"
        : "";
  const j = sel ?? (a ? Math.max(a.decisive, 0) : 0);
  const step = a?.steps[j];
  const position = step
    ? step.move
      ? moveLog[a.start + j].snapshot
      : { grid: finalGrid, tray: finalTray }
    : null;

  return (
    <div
      className="rounded-2xl bg-slate-900/70 p-3 text-sm ring-1 ring-slate-800"
      data-testid="game-autopsy"
    >
      <button
        type="button"
        className="hx-link flex w-full items-center justify-between text-left font-medium"
        aria-expanded={open}
        aria-controls="game-autopsy-content"
        onClick={() => setOpen((v) => !v)}
      >
        <span>Autopsia della partita{summary}</span>
        <span className="hx-link-sign text-slate-500" aria-hidden="true">
          {open ? "−" : "+"}
        </span>
      </button>
      {open && (
        <div
          id="game-autopsy-content"
          className="mt-3 space-y-3 text-slate-300"
        >
          {!state ? (
            <p className="text-slate-400" role="status">
              Calcolo dell’autopsia…
            </p>
          ) : state.error || !a ? (
            <p className="text-slate-400" role="status">
              Autopsia non disponibile.
            </p>
          ) : (
            <>
              <p
                className="font-medium text-white"
                data-testid="autopsy-verdict"
              >
                {verdictText(a, decisiveRisk)}
              </p>
              <button
                type="button"
                className="hx-btn rounded-lg px-3 py-1.5"
                onClick={() => setCostly(true)}
              >
                Vuoi sapere qual è stato l’errore più costoso?
              </button>
              {costly && (
                <CostliestError
                  autopsy={a}
                  moveLog={moveLog}
                  onClose={() => setCostly(false)}
                  onGo={(i) => {
                    setCostly(false);
                    setSel(i);
                    setShowLine(false);
                  }}
                />
              )}
              <div
                className="flex flex-wrap gap-1"
                role="group"
                aria-label="Mosse della discesa finale"
              >
                {a.steps.map((s, i) => (
                  <button
                    key={s.number}
                    type="button"
                    title={VERDICT[s.result]}
                    onClick={() => {
                      setSel(i);
                      setShowLine(false);
                    }}
                    aria-pressed={i === j}
                    data-result={s.result}
                    className={`h-7 min-w-9 rounded-md px-1.5 text-xs tabular-nums ${TONE[s.result].chip} ${i === j ? "outline-2 outline-white" : ""} ${i === a.decisive ? "ring-2 ring-amber-300 ring-offset-1 ring-offset-slate-900" : ""}`}
                  >
                    {s.move ? s.number : "✕"}
                  </button>
                ))}
              </div>
              <p className="text-xs text-slate-400">
                Il colore vale per la posizione prima della mossa, con i pezzi
                arrivati davvero. Verde: via d’uscita fino a {SAFE} celle
                libere. Giallo: si poteva continuare. Rosso: senza scampo.
              </p>

              {step.move ? (
                <MoveDetails
                  key={step.number}
                  snapshot={position}
                  number={step.number}
                  draws={a.draws}
                  index={a.start + j}
                  saving={j === a.decisive ? a.saving : null}
                  legal={a.legal}
                />
              ) : (
                <div className="flex flex-wrap items-center gap-3 rounded-xl bg-slate-800/60 p-3">
                  <MiniBoard
                    grid={finalGrid}
                    width={150}
                    emptyFill="#475569"
                    title="Posizione finale"
                  />
                  <p>
                    Posizione finale · {step.free} celle libere · nessun pezzo
                    entra.
                  </p>
                </div>
              )}

              {step.path && step.path.length > 0 && (
                <div className="space-y-2">
                  <button
                    type="button"
                    className="hx-btn rounded-lg px-3 py-1.5"
                    aria-expanded={showLine}
                    onClick={() => setShowLine((v) => !v)}
                  >
                    {showLine ? "Nascondi" : "Mostra"} la sequenza dell’oracolo
                    ({step.path.length}{" "}
                    {step.path.length === 1 ? "mossa" : "mosse"})
                  </button>
                  {showLine && (
                    <OracleLine
                      key={step.number}
                      grid={position.grid}
                      tray={position.tray}
                      path={step.path}
                      draws={a.draws}
                      from={a.start + j}
                      result={step.result}
                    />
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
