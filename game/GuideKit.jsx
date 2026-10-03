"use client";

import { axialToPixel, cellNumbers, hexPoints, key, parseKey, SQRT3 } from "./HexGrid.js";
import { PIECE_COLORS } from "./pieces.js";

/**
 * Tabellone in miniatura per le pagine di spiegazione.
 *
 * grid   : un HexGrid (di qualunque raggio)
 * width  : larghezza in pixel
 * marks  : evidenziazioni, ognuna { cells: [[q, r], …], fill?, stroke?, dashed?, label? }
 *          - fill: colore di riempimento (es. il colore del pezzo)
 *          - stroke: contorno; dashed: contorno tratteggiato
 *          - label: testo scritto al centro di ogni cella (es. "1", "2", "3")
 * dimFilled : se true le celle già occupate vengono attenuate, così risaltano le evidenziazioni
 */
export default function MiniBoard({ grid, width = 160, marks = [], dimFilled = false, title }) {
  const S = 10;
  const pad = S + 2;
  const halfW = S * SQRT3 * grid.radius + pad;
  const halfH = S * 1.5 * grid.radius + pad;
  return (
    <svg
      width={width}
      height={(width * halfH) / halfW}
      viewBox={`${-halfW} ${-halfH} ${2 * halfW} ${2 * halfH}`}
      role="img"
      aria-label={title}
      style={{ display: "block" }}
    >
      {title && <title>{title}</title>}
      {[...grid.cells.entries()].map(([k, v]) => {
        const [q, r] = parseKey(k);
        const [x, y] = axialToPixel(q, r, S);
        return (
          <polygon
            key={k}
            points={hexPoints(x, y, S - 0.9)}
            fill={v ? PIECE_COLORS[v] : "#1e293b"}
            opacity={v && dimFilled ? 0.35 : 1}
          />
        );
      })}
      {marks.map((m, mi) =>
        m.cells.map(([q, r]) => {
          const [x, y] = axialToPixel(q, r, S);
          return (
            <g key={`${mi}-${q},${r}`}>
              <polygon
                points={hexPoints(x, y, S - 1.6)}
                fill={m.fill || "none"}
                stroke={m.stroke || "none"}
                strokeWidth={m.stroke ? 1.6 : 0}
                strokeDasharray={m.dashed ? "2.5 2" : undefined}
              />
              {m.label && (
                <text
                  x={x}
                  y={y + 3.2}
                  textAnchor="middle"
                  fontSize="9"
                  fontWeight="700"
                  fill={m.labelColor || "#0f172a"}
                  style={{ fontFamily: "system-ui, sans-serif" }}
                >
                  {m.label}
                </text>
              )}
            </g>
          );
        }),
      )}
    </svg>
  );
}

/** Le celle occupate da un pezzo appoggiato con l'origine in (q, r). */
export function pieceCells(cells, q, r) {
  return cells.map(([dq, dr]) => [q + dq, r + dr]);
}

/** Numero in formato italiano (virgola decimale), con al massimo `d` decimali. */
/** Dove sta una mossa, in parole: righe dall'alto, celle da sinistra (es. "riga 3, celle 4 e 5"). */
export function placementText(grid, move) {
  const rows = new Map();
  for (const [q, r] of pieceCells(move.cells, move.q, move.r)) {
    const row = r + grid.radius + 1;
    const column = q - Math.max(-grid.radius, -r - grid.radius) + 1;
    if (!rows.has(row)) rows.set(row, []);
    rows.get(row).push(column);
  }
  return [...rows].sort(([a], [b]) => a - b).map(([row, columns]) =>
    `riga ${row}, ${columns.length === 1 ? "cella" : "celle"} ${columns.sort((a, b) => a - b).join(" e ")}`,
  ).join("; ");
}

/** Dove sta una mossa con la numerazione delle celle del tabellone (es. "celle 12, 13, 14"). */
export function cellNumbersText(grid, move) {
  const numbers = cellNumbers(grid.radius);
  const list = pieceCells(move.cells, move.q, move.r).map(([q, r]) => numbers.get(key(q, r))).sort((a, b) => a - b);
  return `${list.length === 1 ? "cella" : "celle"} ${list.join(", ")}`;
}

export function fmt(n, d = 1) {
  const v = Number(n);
  // niente "-0": un contributo nullo si scrive 0
  const clean = Math.abs(v) < 0.5 * 10 ** -d ? 0 : v;
  return clean.toLocaleString("it-IT", { maximumFractionDigits: d });
}

/** Titolo di sezione numerato. */
export function Section({ n, title, children }) {
  return (
    <section className="space-y-3">
      <h2 className="flex items-baseline gap-3 text-lg font-semibold text-white">
        {n !== undefined && (
          <span
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold"
            style={{ backgroundColor: "#fcd34d", color: "#0f172a" }}
          >
            {n}
          </span>
        )}
        {title}
      </h2>
      <div className="space-y-3 leading-relaxed text-slate-300">{children}</div>
    </section>
  );
}

/** Riquadro evidenziato per formule e osservazioni. */
export function Note({ children, tone = "info" }) {
  const border = tone === "warn" ? "#fb7185" : tone === "ok" ? "#4ade80" : "#38bdf8";
  return (
    <div className="rounded-xl bg-slate-900/80 px-4 py-3 text-sm text-slate-200" style={{ borderLeft: `3px solid ${border}` }}>
      {children}
    </div>
  );
}

/** Tabella semplice con intestazione. rows: array di array di celle. */
export function Table({ head, rows, align = [] }) {
  return (
    <div className="overflow-x-auto rounded-xl ring-1 ring-slate-800">
      <table className="w-full text-sm">
        <thead className="bg-slate-900 text-left text-xs uppercase tracking-wider text-slate-400">
          <tr>
            {head.map((h, i) => (
              <th key={i} className={`px-3 py-2 font-medium ${align[i] === "r" ? "text-right" : ""}`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800">
          {rows.map((row, ri) => (
            <tr key={ri} className="bg-slate-950/40">
              {row.map((c, ci) => (
                <td key={ci} className={`px-3 py-2 align-middle text-slate-200 ${align[ci] === "r" ? "text-right tabular-nums" : ""}`}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
