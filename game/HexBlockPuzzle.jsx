"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { toast as notify, ToastContainer } from "react-toastify"; // "toast" è già lo stato del banner "Linea!"
import GuideExpert from "./GuideExpert.jsx";
import GuideNormal from "./GuideNormal.jsx";
import MoveAnalysis from "./MoveAnalysis.jsx";
import MoveFeedback from "./MoveFeedback.jsx";
import HexGrid, { axialToPixel, hexPoints, key, parseKey, pixelToAxial, SQRT3 } from "./HexGrid.js";
import { PIECE_COLORS, pieceCentroid, PIECES, randomTray, replacePiece, SHAPES, shiftQueue } from "./pieces.js";
import { bestMove } from "./strategy.js";
import { requestAnalysis } from "./strategyClient.js";

const RADIUS = 4;
const SHOW_MOVE_ANALYSIS = true; // false per nascondere l'accordion delle mosse
const SHOW_MOVE_FEEDBACK = true; // toast laterale dopo le mosse manuali
const SHOW_JUDGMENT_COPY = true; // false per nascondere l'icona che copia giudizio e log diagnostico
const SIZE = 22; // raggio di un esagono in unità SVG
const GAP = 1.6; // spazio visivo fra esagoni
const TRAY_SCALE = 0.62; // scala massima dei pezzi nel vassoio (schermi larghi)
const TRAY_RATIO = 0.45; // sugli schermi stretti: pezzi del vassoio ≈ 45% della grandezza delle celle
const FLY_MS = 300; // autogioco: durata del volo di un pezzo dal vassoio al tabellone
const AUTO_PAUSE = 150; // autogioco: pausa fra una mossa e la successiva
const LAND_MS = 60; // sosta del pezzo arrivato, prima di posarlo
const SNAP_MS = 140; // trascinamento: dal punto di rilascio alla posizione finale
const CLICK_FLY_MS = 220; // selezione + clic: dal vassoio alla posizione finale
// Larghezza FISSA del tabellone: dipende solo dalla finestra, mai dal contenuto,
// quindi non cambia durante la partita.
const BOARD_WIDTH = "min(520px, calc(100vw - 210px))";
const TOUCH_LIFT = 70; // px: col dito il pezzo sta sopra il polpastrello
const BEST_KEY = "alveare-best"; // record della modalità normale
const BEST_KEY_EXPERT = "alveare-best-expert"; // record separato della modalità Esperto
// chiavi usate dalla versione precedente: se esistono, il record viene recuperato una volta
const LEGACY_KEYS = { normal: "hexfrvr-best", expert: "hexfrvr-best-expert" };
const CLEAR_MS = 450; // durata dello "scoppio" delle celle svuotate
const RECORD_TOAST = "nuovo-record"; // id dell'avviso di record (uno solo per partita)
// Avviso di record: colori vivaci (ambra → rosa) e una X bianca ben visibile per chiuderlo.
const RECORD_TOAST_STYLE = {
  background: "linear-gradient(135deg, #f59e0b 0%, #f97316 45%, #ec4899 100%)",
  color: "#ffffff",
  borderRadius: "14px",
  boxShadow: "0 10px 30px rgba(236, 72, 153, 0.35), 0 0 0 2px rgba(255, 255, 255, 0.35) inset",
  alignItems: "center",
};
const RECORD_CLOSE_STYLE = {
  marginLeft: "12px",
  width: "26px",
  height: "26px",
  flexShrink: 0,
  borderRadius: "9999px",
  border: "none",
  background: "rgba(255, 255, 255, 0.25)",
  color: "#ffffff",
  fontSize: "18px",
  lineHeight: "26px",
  fontWeight: 700,
  cursor: "pointer",
};
const CELEBRATE_MS = 350; // pausa in cui le linee complete lampeggiano prima di svuotarsi

// Estensione del tabellone in unità SVG
const PAD = SIZE + 4;
const HALF_W = SIZE * SQRT3 * RADIUS + PAD;
const HALF_H = SIZE * 1.5 * RADIUS + PAD;
const VIEWBOX = `${-HALF_W} ${-HALF_H} ${2 * HALF_W} ${2 * HALF_H}`;

const bestKey = (expert) => (expert ? BEST_KEY_EXPERT : BEST_KEY);

function loadBest(expert = false) {
  try {
    const ls = window.localStorage;
    let v = ls.getItem(bestKey(expert));
    if (v === null) {
      v = ls.getItem(LEGACY_KEYS[expert ? "expert" : "normal"]);
      if (v !== null) ls.setItem(bestKey(expert), v);
    }
    return Number(v) || 0;
  } catch {
    return 0;
  }
}
function saveBest(v, expert = false) {
  try {
    window.localStorage.setItem(bestKey(expert), String(v));
  } catch {
    /* archiviazione non disponibile: pazienza */
  }
}

/** Pixel sullo schermo per unità SVG del tabellone. */
function screenScale(svg) {
  if (!svg) return 1;
  return svg.getBoundingClientRect().width / (2 * HALF_W);
}

/** Scala dei pezzi nel vassoio: proporzionata al tabellone, ma mai oltre TRAY_SCALE. */
function trayScaleFor(boardScale) {
  return Math.min(TRAY_SCALE, boardScale * TRAY_RATIO);
}

/** Nuova partita. recordBase = record della modalità all'inizio: superarlo fa scattare l'avviso. */
function freshGame(recordBase = 0) {
  const grid = new HexGrid(RADIUS);
  return { grid, tray: randomTray(), score: 0, streak: 0, moves: 0, linesTotal: 0, recordBase };
}

/**
 * Il gioco usa Math.random e localStorage fin dal primo render, quindi va
 * montato SOLO nel browser: sul server (e durante l'idratazione) si mostra un
 * segnaposto vuoto. useSyncExternalStore restituisce false sul server e true sul
 * client senza setState dentro un effect.
 */
const noopSubscribe = () => () => { };
function useIsClient() {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}

const VIEWS = [
  { id: "game", label: "Gioco" },
  { id: "normal", label: "Suggerimenti · normale" },
  { id: "expert", label: "Suggerimenti · Esperto" },
];

export default function HexBlockPuzzle() {
  const isClient = useIsClient();
  const [view, setView] = useState("game");
  const [snapshot, setSnapshot] = useState(null); // stato attuale della partita, per gli esempi nelle guide
  if (!isClient) return <div className="min-h-screen w-full bg-slate-950" />;
  return (
    <div className="hx-root min-h-screen w-full bg-slate-950 text-slate-100">
      {/* menu delle tre pagine */}
      <nav className="flex flex-wrap justify-center gap-1 px-4 pt-4" aria-label="Pagine">
        {VIEWS.map((v) => (
          <button
            key={v.id}
            type="button"
            aria-current={view === v.id ? "page" : undefined}
            onClick={() => setView(v.id)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${view === v.id ? "hx-tab-on" : "hx-tab"}`}
          >
            {v.label}
          </button>
        ))}
      </nav>
      {/* il gioco resta montato (nascosto) mentre si leggono le guide: niente si perde */}
      <div style={{ display: view === "game" ? "block" : "none" }}>
        <Game active={view === "game"} onSnapshot={setSnapshot} />
      </div>
      {view === "normal" && <GuideNormal snapshot={snapshot} />}
      {view === "expert" && <GuideExpert snapshot={snapshot} />}
    </div>
  );
}

const LINE_TITLES = { 1: "Linea!", 2: "Doppia linea!", 3: "Tripla linea!", 4: "Quadrupla!" };

/** Punteggio di una mossa: +1 per cella appoggiata, poi bonus linee con combo. */
function scoreMove(pieceSize, lines, clearedCount, streak) {
  if (!lines.length) return { gained: pieceSize, bonus: 0 };
  const bonus = Math.round(clearedCount * lines.length * (1 + 0.5 * streak));
  return { gained: pieceSize + bonus, bonus };
}

function anyFits(grid, tray) {
  return tray.some((p) => p && grid.fits(p.cells));
}


function Hex({ q, r, fill, stroke = "none", strokeWidth = 0, opacity = 1, className, style }) {
  const [x, y] = axialToPixel(q, r, SIZE);
  return (
    <polygon
      points={hexPoints(x, y, SIZE - GAP)}
      fill={fill}
      stroke={stroke}
      strokeWidth={strokeWidth}
      opacity={opacity}
      className={className}
      style={style}
    />
  );
}

function PieceSvg({ cells, color, scale = 1, opacity = 1 }) {
  const pts = cells.map(([q, r]) => axialToPixel(q, r, SIZE));
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const minX = Math.min(...xs) - SIZE;
  const maxX = Math.max(...xs) + SIZE;
  const minY = Math.min(...ys) - SIZE;
  const maxY = Math.max(...ys) + SIZE;
  const w = maxX - minX;
  const h = maxY - minY;
  return (
    <svg
      width={w * scale}
      height={h * scale}
      viewBox={`${minX} ${minY} ${w} ${h}`}
      style={{ opacity, overflow: "visible", display: "block" }}
    >
      {cells.map(([q, r]) => (
        <Hex key={key(q, r)} q={q} r={r} fill={PIECE_COLORS[color]} />
      ))}
    </svg>
  );
}

function Game({ active = true, onSnapshot }) {
  const [game, setGame] = useState(() => freshGame(loadBest(false)));
  const [history, setHistory] = useState(null); // un livello di annullamento
  const [expert, setExpert] = useState(false); // modalità Esperto: vassoio a coda FIFO
  const [best, setBest] = useState(() => loadBest(false));
  const [selected, setSelected] = useState(null); // indice nel vassoio
  const [hover, setHover] = useState(null); // [q, r] origine proposta
  const [drag, setDrag] = useState(null);
  const [clearing, setClearing] = useState(null); // { cells: [[k, color]], id }
  const [toast, setToast] = useState(null);
  const [celebrate, setCelebrate] = useState(null); // { keys: Set, id }: linee complete in evidenza
  const celebrateTimer = useRef(null);
  const recordToastClosed = useRef(false); // l'utente ha chiuso l'avviso di record: non riappare in questa partita
  const pendingTimers = useRef(new Set()); // tutti i timer in corso, per annullarli allo smontaggio

  /** setTimeout che si annulla da solo se il gioco viene smontato prima della scadenza. */
  const schedule = useCallback((fn, ms) => {
    const id = setTimeout(() => {
      pendingTimers.current.delete(id);
      fn();
    }, ms);
    pendingTimers.current.add(id);
    return id;
  }, []);
  const [hint, setHint] = useState(null);
  const [showHelp, setShowHelp] = useState(false);
  const [showCatalog, setShowCatalog] = useState(false);
  const [auto, setAuto] = useState(false); // autogioco acceso?
  const [flying, setFlying] = useState(null); // pezzo in volo durante l'autogioco
  const boardRef = useRef(null);
  const slotRefs = useRef([]); // riquadri del vassoio, per sapere da dove parte il volo
  const [boardPx, setBoardPx] = useState(null); // scala del tabellone sullo schermo (aggiornata se cambia)
  const trayScale = boardPx ? trayScaleFor(boardPx) : TRAY_SCALE;

  useEffect(() => {
    const svg = boardRef.current;
    if (!svg || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setBoardPx(screenScale(svg)));
    ro.observe(svg);
    return () => ro.disconnect();
  }, []);

  const { grid, tray, score, streak } = game;
  // durante la pausa di festa il tabellone è ancora pieno: la fine partita si valuta dopo
  // in Esperto conta solo il primo pezzo della coda: se non entra, la partita è finita
  const gameOver = useMemo(
    () => !celebrate && !(expert ? tray[0] && grid.fits(tray[0].cells) : anyFits(grid, tray)),
    [celebrate, expert, grid, tray],
  );
  const autoOn = auto && !gameOver; // stato mostrato dal bottone
  // l'autogioco aspetta durante la pausa di festa e quando si sta leggendo una guida
  const autoActive = autoOn && !celebrate && active;
  // analisi e giudizio dell'ultima mossa: calcolati nel worker, arrivano poco dopo la mossa
  const [evaluation, setEvaluation] = useState(null);
  useEffect(() => {
    const snapshot = game.lastMove;
    if (!snapshot) return;
    let current = true;
    requestAnalysis("played", snapshot)
      .then((result) => { if (current) setEvaluation({ snapshot, ...result }); })
      .catch(() => { if (current) setEvaluation({ snapshot, analysis: null, judgment: null }); });
    return () => { current = false; };
  }, [game.lastMove]);
  const evaluated = !!game.lastMove && evaluation?.snapshot === game.lastMove;
  const playedAnalysis = evaluated ? evaluation.analysis : null;
  const moveJudgment = evaluated ? evaluation.judgment : null;
  const evaluating = !!game.lastMove && !evaluated;

  // comunica alle guide lo stato attuale (per gli esempi "dal tuo tabellone")
  useEffect(() => {
    onSnapshot?.({ grid, tray, streak, expert });
  }, [grid, tray, streak, expert, onSnapshot]);

  // --- conversione schermo -> origine del pezzo ------------------------------
  const targetFor = useCallback((cells, clientX, clientY) => {
    const svg = boardRef.current;
    if (!svg) return null;
    const ctm = svg.getScreenCTM();
    if (!ctm) return null;
    const pt = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse());
    const [cq, cr] = pieceCentroid(cells);
    const [cx, cy] = axialToPixel(cq, cr, SIZE);
    // il puntatore rappresenta il baricentro del pezzo: ricavo la posizione dell'origine
    if (Math.abs(pt.x) > HALF_W + SIZE * 2 || Math.abs(pt.y) > HALF_H + SIZE * 2) return null;
    return pixelToAxial(pt.x - cx, pt.y - cy, SIZE);
  }, []);

  const boardScale = () => screenScale(boardRef.current);

  // --- mossa ------------------------------------------------------------------
  const commit = useCallback(
    (idx, q, r) => {
      const piece = game.tray[idx];
      if (!piece || (expert && idx !== 0) || !game.grid.canPlace(piece.cells, q, r)) return false;
      const { grid: next, lines, clearedCells, placed } = game.grid.play(piece.cells, q, r, piece.color);
      const { gained, bonus } = scoreMove(piece.cells.length, lines, clearedCells.size, game.streak);
      // il pezzo usato viene subito sostituito da uno nuovo nello stesso posto
      // normale: il pezzo usato viene sostituito al suo posto; Esperto: la coda scorre
      const nextTray = expert ? shiftQueue(game.tray) : replacePiece(game.tray, idx);

      const newScore = game.score + gained;
      // Nuovo record: l'avviso compare nel momento in cui il record viene superato
      // e resta visibile (aggiornato col punteggio) fino alla fine della partita.
      // Se l'utente lo chiude con la X, non riappare fino alla prossima partita.
      if (game.recordBase > 0 && newScore > game.recordBase && !recordToastClosed.current) {
        const text = (
          <span style={{ color: "#ffffff", fontWeight: 700, textShadow: "0 1px 2px rgba(0,0,0,0.25)" }}>
            🏆 Nuovo record{expert ? " Esperto" : ""}: {newScore}{" "}
            <span style={{ color: "rgba(255,255,255,0.85)", fontWeight: 500 }}>(prima {game.recordBase})</span>
          </span>
        );
        if (notify.isActive(RECORD_TOAST)) notify.update(RECORD_TOAST, { render: text });
        else
          notify(text, {
            toastId: RECORD_TOAST,
            autoClose: false,
            closeOnClick: false,
            draggable: false,
            icon: false,
            style: RECORD_TOAST_STYLE,
            closeButton: ({ closeToast }) => (
              <button
                type="button"
                aria-label="Chiudi l'avviso di record"
                onClick={(e) => {
                  recordToastClosed.current = true;
                  closeToast(e);
                }}
                style={RECORD_CLOSE_STYLE}
              >
                ×
              </button>
            ),
          });
      }
      if (newScore > best) {
        setBest(newScore);
        saveBest(newScore, expert);
      }

      setHistory(game);
      const counters = {
        tray: nextTray,
        score: newScore,
        streak: lines.length ? game.streak + 1 : 0,
        moves: game.moves + 1,
        linesTotal: game.linesTotal + lines.length,
        recordBase: game.recordBase, // il record da battere resta quello di inizio partita
        lastMove: (SHOW_MOVE_ANALYSIS || SHOW_MOVE_FEEDBACK) && !auto
          ? { grid: game.grid, tray: game.tray, streak: game.streak, expert, idx, q, r }
          : null,
      };
      setSelected(null);
      setHover(null);
      setHint(null);

      if (!lines.length) {
        setGame({ grid: next, ...counters });
        return true;
      }

      // Linee complete: prima il pezzo resta appoggiato e le linee lampeggiano,
      // poi (dopo CELEBRATE_MS) le celle scoppiano e la griglia si svuota.
      const id = Date.now();
      setGame({ grid: placed, ...counters });
      setCelebrate({ keys: clearedCells, id });
      const combo = game.streak > 0 ? `combo ×${1 + 0.5 * game.streak}` : "";
      const title = LINE_TITLES[lines.length] || `${lines.length} linee!`;
      setToast({ title, sub: [`+${bonus}`, combo].filter(Boolean).join(" · "), id });
      schedule(() => setToast((t) => (t && t.id === id ? null : t)), CELEBRATE_MS + 900);
      clearTimeout(celebrateTimer.current);
      celebrateTimer.current = schedule(() => {
        const cells = [...clearedCells].map((k) => [k, placed.cells.get(k)]);
        setGame((g) => ({ ...g, grid: g.grid.clear(lines) }));
        setCelebrate(null);
        setClearing({ cells, id });
        schedule(() => setClearing((c) => (c && c.id === id ? null : c)), CLEAR_MS);
      }, CELEBRATE_MS);
      return true;
    },
    [game, best, expert, schedule, auto],
  );

  // --- volo fino alla posizione finale -----------------------------------------
  // Ogni inserimento (autogioco, clic o rilascio del trascinamento) fa viaggiare il
  // pezzo, fotogramma per fotogramma, fino alla sua posizione esatta nella griglia;
  // solo quando è arrivato la mossa viene eseguita.
  const flightRef = useRef({ raf: 0, timer: 0 });

  const cancelFlight = () => {
    cancelAnimationFrame(flightRef.current.raf);
    clearTimeout(flightRef.current.timer);
    setFlying(null);
  };

  const flyAndPlace = useCallback(
    (idx, q, r, from, ms) => {
      const svg = boardRef.current;
      const piece = game.tray[idx];
      if (!svg || !piece) return;
      const scale = screenScale(svg);
      const [cq, cr] = pieceCentroid(piece.cells);
      const [px, py] = axialToPixel(q + cq, r + cr, SIZE);
      const to = new DOMPoint(px, py).matrixTransform(svg.getScreenCTM());
      const start = performance.now();
      // niente fantasma né suggerimento a destinazione: le celle si riempiono
      // solo quando il pezzo in volo è arrivato
      setSelected(null);
      setHover(null);
      setHint(null);
      const step = (now) => {
        const t = Math.min(1, (now - start) / ms);
        const e = 1 - Math.pow(1 - t, 3); // ease-out
        setFlying({
          idx,
          piece,
          scale,
          x: from.x + (to.x - from.x) * e,
          y: from.y + (to.y - from.y) * e,
          k: from.k + (1 - from.k) * e,
        });
        if (t < 1) {
          flightRef.current.raf = requestAnimationFrame(step);
        } else {
          flightRef.current.timer = schedule(() => {
            setFlying(null);
            commit(idx, q, r);
          }, LAND_MS);
        }
      };
      flightRef.current.raf = requestAnimationFrame(step);
    },
    [game.tray, commit, schedule],
  );

  // Quando il gioco viene smontato (es. si cambia pagina) si fermano voli e timer.
  useEffect(() => {
    const timers = pendingTimers.current;
    const flight = flightRef.current;
    return () => {
      timers.forEach(clearTimeout);
      timers.clear();
      cancelAnimationFrame(flight.raf);
    };
  }, []);

  /** Punto di partenza di un volo: centro del riquadro nel vassoio, alla sua scala. */
  const fromSlot = (idx) => {
    const slot = slotRefs.current[idx];
    const sr = slot.getBoundingClientRect();
    const scale = screenScale(boardRef.current);
    return { x: sr.left + sr.width / 2, y: sr.top + sr.height / 2, k: trayScaleFor(scale) / scale };
  };

  // --- trascinamento ----------------------------------------------------------
  const onTrayPointerDown = (e, idx) => {
    if (!tray[idx] || gameOver || auto || celebrate || flying || (expert && idx !== 0)) return;
    e.preventDefault();
    setDrag({
      idx,
      pointerType: e.pointerType,
      startX: e.clientX,
      startY: e.clientY,
      x: e.clientX,
      y: e.clientY,
      moved: false,
      scale: boardScale(),
    });
  };

  useEffect(() => {
    if (!drag) return;
    const lift = drag.pointerType === "mouse" ? 0 : TOUCH_LIFT;
    const cells = tray[drag.idx]?.cells;
    const move = (e) => {
      const moved = drag.moved || Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) > 6;
      setDrag((d) => d && { ...d, x: e.clientX, y: e.clientY, moved });
      if (moved && cells) setHover(targetFor(cells, e.clientX, e.clientY - lift));
    };
    const up = (e) => {
      if (!drag.moved) {
        // tocco senza trascinamento = selezione (poi si clicca sul tabellone)
        setSelected((s) => (s === drag.idx ? null : drag.idx));
      } else if (cells) {
        const t = targetFor(cells, e.clientX, e.clientY - lift);
        if (t && grid.canPlace(cells, t[0], t[1])) {
          // scivola dal punto di rilascio alla posizione finale
          flyAndPlace(drag.idx, t[0], t[1], { x: e.clientX, y: e.clientY - lift, k: 1 }, SNAP_MS);
        } else {
          setHover(null);
        }
      }
      setDrag(null);
    };
    const cancel = () => {
      setDrag(null);
      setHover(null);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
    };
  }, [drag, tray, grid, targetFor, flyAndPlace]);

  const undo = () => {
    if (!history) return;
    setGame(history);
    setHistory(null);
    setSelected(null);
    setHover(null);
    setHint(null);
    setClearing(null);
  };

  // --- autogioco -------------------------------------------------------------
  // Ogni giro: calcola la mossa suggerita, fa volare il pezzo dal vassoio al suo
  // posto e poi la esegue. Quando la partita cambia l'effetto riparte da solo.
  useEffect(() => {
    if (!autoActive) return;
    const timers = [];
    const later = (fn, ms) => timers.push(setTimeout(fn, ms));
    later(() => {
      const h = bestMove(grid, tray, streak, { queue: expert });
      const slot = slotRefs.current[h?.idx];
      const svg = boardRef.current;
      if (!h || !slot || !svg) {
        setAuto(false);
        return;
      }
      flyAndPlace(h.idx, h.q, h.r, fromSlot(h.idx), FLY_MS);
    }, AUTO_PAUSE);
    return () => timers.forEach(clearTimeout);
  }, [autoActive, grid, tray, streak, expert, flyAndPlace]);

  const stopAuto = () => {
    setAuto(false);
    cancelFlight();
    setSelected(null);
    setHover(null);
  };

  const toggleAuto = () => {
    if (auto) stopAuto();
    else {
      setHint(null);
      setSelected(null);
      setHover(null);
      setAuto(true);
    }
  };

  // --- tastiera ---------------------------------------------------------------
  useEffect(() => {
    const onKey = (e) => {
      if (e.target instanceof HTMLElement && ["INPUT", "TEXTAREA"].includes(e.target.tagName)) return;
      if (auto) {
        if (e.key === "Escape") stopAuto();
        return;
      }
      if (flying) return;
      if ((expert ? ["1"] : ["1", "2", "3"]).includes(e.key)) {
        const i = Number(e.key) - 1;
        if (tray[i]) setSelected((s) => (s === i ? null : i));
      } else if (e.key === "Escape") {
        setSelected(null);
        setHover(null);
      } else if ((e.key === "z" || e.key === "Z") && (e.ctrlKey || e.metaKey)) {
        undo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // --- selezione + clic sul tabellone -------------------------------------------
  const selectedCells = selected !== null ? tray[selected]?.cells : null;

  const onBoardPointerMove = (e) => {
    if (drag || auto || flying) return;
    if (selectedCells) setHover(targetFor(selectedCells, e.clientX, e.clientY));
  };

  const onBoardClick = (e) => {
    if (drag || auto || celebrate || flying || !selectedCells) return;
    const t = targetFor(selectedCells, e.clientX, e.clientY);
    if (t && grid.canPlace(selectedCells, t[0], t[1])) flyAndPlace(selected, t[0], t[1], fromSlot(selected), CLICK_FLY_MS);
  };

  const startGame = (mode = expert) => {
    stopAuto();
    clearTimeout(celebrateTimer.current);
    notify.dismiss(RECORD_TOAST); // l'avviso di record vale per una sola partita
    recordToastClosed.current = false; // nella nuova partita può comparire di nuovo
    setCelebrate(null);
    setGame(freshGame(loadBest(mode)));
    setHistory(null);
    setSelected(null);
    setHover(null);
    setHint(null);
    setClearing(null);
  };

  const newGame = () => startGame();

  // Cambiare modalità avvia una nuova partita e mostra il record di quella modalità.
  const toggleExpert = () => {
    const next = !expert;
    setExpert(next);
    setBest(loadBest(next));
    startGame(next);
  };

  const askHint = () => {
    const h = bestMove(grid, tray, streak, { queue: expert });
    setHint(h);
    if (h) setSelected(h.idx);
  };

  // --- anteprima ----------------------------------------------------------------
  const activeIdx = drag?.moved ? drag.idx : selected;
  const activeCells = activeIdx !== null && activeIdx !== undefined ? tray[activeIdx]?.cells : null;
  const preview = useMemo(() => {
    if (!activeCells || !hover) return null;
    const [q, r] = hover;
    const cells = activeCells.map(([dq, dr]) => [q + dq, r + dr]);
    const valid = grid.canPlace(activeCells, q, r);
    const onBoard = cells.filter(([a, b]) => grid.has(a, b));
    if (!valid) return { valid, cells: onBoard, lines: new Set() };
    const { clearedCells } = grid.play(activeCells, q, r);
    return { valid, cells, lines: clearedCells };
  }, [activeCells, hover, grid]);

  return (
    <div className="hx-root min-h-screen w-full bg-slate-950 text-slate-100 select-none">
      <style>{`
        @keyframes hx-pop { 0% { transform: scale(1); opacity: 1; } 60% { transform: scale(1.15); opacity: .9; } 100% { transform: scale(.2); opacity: 0; } }
        .hx-clear { transform-box: fill-box; transform-origin: center; animation: hx-pop ${CLEAR_MS}ms ease-in forwards; }
        @keyframes hx-burst {
          0% { transform: translate(-50%, -50%) scale(.5); opacity: 0; }
          12% { transform: translate(-50%, -50%) scale(1.12); opacity: 1; }
          22% { transform: translate(-50%, -50%) scale(1); }
          78% { transform: translate(-50%, -50%) scale(1); opacity: 1; }
          100% { transform: translate(-50%, -70%) scale(.95); opacity: 0; }
        }
        .hx-toast { animation: hx-burst ${CELEBRATE_MS + 900}ms ease-out forwards; }
        @keyframes hx-flash { 0% { opacity: 0; } 20% { opacity: .9; } 45% { opacity: .35; } 70% { opacity: .9; } 100% { opacity: .7; } }
        .hx-flash { animation: hx-flash ${CELEBRATE_MS}ms ease-in-out forwards; }
        /* Colori espliciti anche al passaggio del mouse: così eventuali stili globali
           del progetto (es. button:hover) non rendono illeggibili le scritte. */
        .hx-root .hx-btn { color: #f1f5f9; background-color: #1e293b; }
        .hx-root .hx-btn:hover:not(:disabled) { color: #ffffff; background-color: #334155; }
        .hx-root .hx-btn-primary { color: #0f172a; background-color: #ffffff; }
        .hx-root .hx-btn-primary:hover:not(:disabled) { color: #0f172a; background-color: #cbd5e1; }
        .hx-root .hx-btn:disabled, .hx-root .hx-btn-primary:disabled { opacity: .4; cursor: not-allowed; }
        .hx-root .hx-link, .hx-root .hx-link:hover { color: #f1f5f9; background-color: transparent; }
        .hx-root .hx-btn-expert { color: #0f172a; background-color: #fcd34d; }
        .hx-root .hx-tab { color: #cbd5e1; background-color: transparent; }
        .hx-root .hx-tab:hover { color: #ffffff; background-color: #1e293b; }
        .hx-root .hx-tab-on, .hx-root .hx-tab-on:hover { color: #0f172a; background-color: #f1f5f9; }
        .hx-root .hx-btn-expert:hover:not(:disabled) { color: #0f172a; background-color: #fde68a; }
        .hx-root .hx-link:hover .hx-link-sign { color: #ffffff; }
        @keyframes hx-pulse { 0%, 100% { opacity: .35; } 50% { opacity: .8; } }
        .hx-hint { animation: hx-pulse 1s ease-in-out infinite; }
      `}</style>

      <div className={SHOW_MOVE_FEEDBACK ? "hx-game-layout hx-with-feedback" : "hx-game-layout"}>
      <div
        className="mx-auto flex flex-col gap-4 py-6"
        style={{ width: `calc(${BOARD_WIDTH} + 162px)` }} // tabellone + gap + colonna pezzi
      >
        {/* intestazione */}
        <header className="flex flex-col items-center gap-3 text-center">
          <div>
            <h1 className="text-2xl font-semibold">Alveare</h1>
            <p className="text-sm text-slate-400">Riempi le linee in tutte e tre le direzioni per svuotarle.</p>
            <p className="mt-0.5 text-xs text-slate-500">ispirato a Hex FRVR</p>
          </div>
          <div className="flex flex-wrap justify-center gap-3 text-center">
            <Stat label="Punti" value={score} />
            <Stat label="Pezzi" value={game.moves} />
            <Stat label={expert ? "Record Esperto" : "Record"} value={best} />
            <Stat label="Linee" value={game.linesTotal} />
            <Stat label="Combo" value={streak > 0 ? `×${1 + 0.5 * streak}` : "—"} />
          </div>
        </header>

        {/* comandi, in orizzontale sopra il tabellone */}
        <div className="flex flex-wrap justify-center gap-2">
          <Button onClick={newGame}>
            Nuova partita
          </Button>
          <Button onClick={undo} disabled={!history || auto || celebrate || !!flying}>
            Annulla
          </Button>
          <Button onClick={askHint} disabled={gameOver || auto || celebrate || !!flying}>
            Suggerimento
          </Button>
          <Button onClick={toggleAuto} disabled={gameOver} primary={autoOn}>
            {autoOn ? "Ferma" : "Autogioco"}
          </Button>
          <button
            type="button"
            role="switch"
            aria-checked={expert}
            onClick={toggleExpert}
            title="Coda obbligata: si gioca sempre il primo pezzo. Cambiare modalità avvia una nuova partita."
            className={`min-w-30 rounded-lg px-4 py-1.5 text-sm font-medium transition ${expert ? "hx-btn-expert" : "hx-btn"}`}
          >
            Esperto
          </button>
        </div>

        <div className="flex flex-row items-stretch gap-3">
          {/* tabellone */}
          <div
            className={`relative shrink-0 rounded-2xl bg-slate-900/70 p-3 transition-shadow duration-200 ${celebrate ? "shadow-[0_0_40px_rgba(252,211,77,0.45)] ring-2 ring-amber-300" : "ring-1 ring-slate-800"
              }`}
            style={{ width: BOARD_WIDTH }}
          >
            <svg
              ref={boardRef}
              data-testid="board"
              viewBox={VIEWBOX}
              className="block w-full touch-none"
              onPointerMove={onBoardPointerMove}
              onPointerLeave={() => {
                if (!drag) setHover(null);
              }}
              onClick={onBoardClick}
              style={{ cursor: selectedCells ? "crosshair" : "default" }}
            >
              {/* celle */}
              {[...grid.cells.entries()].map(([k, v]) => {
                const [q, r] = parseKey(k);
                return <Hex key={k} q={q} r={r} fill={v ? PIECE_COLORS[v] : "#1e293b"} />;
              })}

              {/* linee che verrebbero svuotate */}
              {preview?.valid &&
                [...preview.lines].map((k) => {
                  const [q, r] = parseKey(k);
                  return <Hex key={`l${k}`} q={q} r={r} fill="#ffffff" opacity={0.28} />;
                })}

              {/* fantasma del pezzo */}
              {preview &&
                preview.cells.map(([q, r]) => (
                  <Hex
                    key={`g${q},${r}`}
                    q={q}
                    r={r}
                    fill={preview.valid ? PIECE_COLORS[tray[activeIdx].color] : "#ef4444"}
                    opacity={preview.valid ? 0.6 : 0.45}
                  />
                ))}

              {/* suggerimento */}
              {hint &&
                !preview &&
                hint.cells.map(([dq, dr]) => (
                  <Hex
                    key={`h${dq},${dr}`}
                    q={hint.q + dq}
                    r={hint.r + dr}
                    fill={PIECE_COLORS[tray[hint.idx]?.color] || "#fff"}
                    className="hx-hint"
                  />
                ))}

              {/* linee complete: lampeggiano durante la pausa, prima di svuotarsi */}
              {celebrate &&
                [...celebrate.keys].map((k) => {
                  const [q, r] = parseKey(k);
                  return (
                    <Hex
                      key={`f${celebrate.id}${k}`}
                      q={q}
                      r={r}
                      fill="#ffffff"
                      stroke="#ffffff"
                      strokeWidth={2.5}
                      className="hx-flash"
                    />
                  );
                })}

              {/* animazione di cancellazione */}
              {clearing &&
                clearing.cells.map(([k, color]) => {
                  const [q, r] = parseKey(k);
                  return (
                    <Hex key={`c${clearing.id}${k}`} q={q} r={r} fill={PIECE_COLORS[color] || "#fff"} className="hx-clear" />
                  );
                })}

            </svg>

            {toast && (
              <div
                key={toast.id}
                className="hx-toast pointer-events-none absolute left-1/2 top-0 z-10 flex items-baseline gap-2 whitespace-nowrap rounded-full px-3 py-0.5 shadow-lg ring-2 ring-amber-300"
                style={{ backgroundColor: "#ffffff" }}
              >
                <span className="text-sm font-bold" style={{ color: "#0f172a" }}>
                  {toast.title}
                </span>
                {toast.sub && (
                  <span className="text-xs font-semibold" style={{ color: "#334155" }}>
                    {toast.sub}
                  </span>
                )}
              </div>
            )}

            {gameOver && (
              <div
                role="status"
                className="pointer-events-none absolute bottom-0 left-1/2 z-10 -translate-x-1/2 translate-y-1/2 whitespace-nowrap rounded-full px-4 py-1 text-sm font-semibold shadow-lg"
                style={{ backgroundColor: "#0f172a", color: "#fda4af", boxShadow: "0 0 0 2px #fb7185" }}
              >
                Partita finita
              </div>
            )}
          </div>

          {/* pezzi, a destra del tabellone */}
          {/* stessa altezza del tabellone: i tre pezzi si distribuiscono su tutta la colonna */}
          <aside className="flex w-37.5 shrink-0">
            <div className="flex w-full rounded-2xl bg-slate-900/70 p-2 ring-1 ring-slate-800">
              <div className="flex w-full flex-col justify-between gap-4">
                {tray.map((p, i) => {
                  const locked = expert && i > 0; // in coda: visibile ma non ancora giocabile
                  const fits = p && grid.fits(p.cells);
                  const isSel = selected === i;
                  const isDragging = (drag?.moved && drag.idx === i) || flying?.idx === i;
                  return (
                    <div
                      key={i}
                      ref={(el) => {
                        slotRefs.current[i] = el;
                      }}
                      role="button"
                      data-testid={`slot-${i}`}
                      data-selected={isSel ? "true" : undefined}
                      tabIndex={p ? 0 : -1}
                      aria-disabled={!p || locked || gameOver || auto || !!celebrate || !!flying}
                      aria-label={p ? `Pezzo ${i + 1}: ${p.name}${locked ? " (in coda)" : ""}` : `Posto ${i + 1} vuoto`}
                      onPointerDown={(e) => onTrayPointerDown(e, i)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          if (p && !locked && !gameOver && !auto && !celebrate && !flying) {
                            setSelected((s) => (s === i ? null : i));
                          }
                        }
                      }}
                      className={`relative flex h-25 w-full shrink-0 touch-none items-center justify-center overflow-hidden rounded-xl transition ${!p ? "bg-slate-900" : locked ? "cursor-not-allowed bg-slate-900/60" : "cursor-grab bg-slate-800/60 hover:bg-slate-800"
                        } ${isSel ? "ring-2 ring-white" : expert && i === 0 ? "ring-2 ring-amber-300" : "ring-1 ring-slate-800"}`}
                    >
                      {p && !isDragging && (
                        <PieceSvg cells={p.cells} color={p.color} scale={trayScale} opacity={locked ? 0.45 : fits ? 1 : 0.3} />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </aside>
        </div>

        {SHOW_MOVE_FEEDBACK && <MoveFeedback snapshot={game.lastMove} judgment={moveJudgment}
          analysis={playedAnalysis} showCopy={SHOW_JUDGMENT_COPY}
          onUndo={undo} undoDisabled={!history || auto || !!celebrate || !!flying}
          hidden={autoOn || !active} busy={!!flying || !!celebrate || evaluating} />}

        {/* sotto: istruzioni e spiegazione */}
        <div className="flex flex-col gap-3">
          <p className="text-center text-xs text-slate-500">
            {expert
              ? "Esperto: gioca sempre il primo pezzo (bordo dorato). Trascinalo, oppure selezionalo (clic o tasto 1) e clicca dove metterlo."
              : "Trascina un pezzo sul tabellone, oppure selezionalo (clic o tasti 1–3) e clicca dove metterlo."}
          </p>

          {SHOW_MOVE_ANALYSIS && !autoOn && active && (
            <MoveAnalysis grid={grid} tray={tray} streak={streak} expert={expert} lastMove={game.lastMove} playedAnalysis={playedAnalysis} busy={!!flying || !!celebrate} />
          )}

          <div className="rounded-2xl bg-slate-900/70 p-3 text-sm ring-1 ring-slate-800">
            <button
              type="button"
              className="hx-link flex w-full items-center justify-between text-left font-medium"
              onClick={() => setShowHelp((v) => !v)}
            >
              Come funziona <span className="hx-link-sign text-slate-500">{showHelp ? "−" : "+"}</span>
            </button>
            {showHelp && (
              <div className="mt-2 space-y-2 text-slate-300">
                <p>
                  Alveare è un gioco indipendente ispirato a <i>Hex FRVR</i>: regole, pezzi, strategia
                  dell&apos;autogioco e grafica sono stati realizzati da zero.
                </p>
                <p>
                  Il tabellone è un esagono di 61 celle. Ogni cella ha coordinate cubiche (q, r, s) con q + r + s = 0.
                </p>
                <p>
                  Una <b>linea</b> è l&apos;insieme delle celle con una coordinata fissa: r costante è orizzontale, q e s
                  costanti sono le due diagonali. In tutto 27 linee, lunghe da 5 a 9.
                </p>
                <p>
                  <b>Punti:</b> +1 per ogni cella appoggiata. Se svuoti linee: celle cancellate × numero di linee,
                  moltiplicato dalla combo (+50% per ogni mossa consecutiva che svuota almeno una linea).
                </p>
                <p>
                  Ogni volta che inserisci un pezzo, al suo posto ne arriva subito uno nuovo: hai sempre tre pezzi
                  fra cui scegliere. La partita finisce quando nessuno dei tre entra più.
                </p>
                <p>
                  <b>Suggerimento e Autogioco:</b> ogni mossa possibile viene giudicata dal tabellone che lascia: punti e
                  linee svuotate, celle vuote rimaste isolate (da evitare), quanti pezzi entrano ancora, linee quasi
                  complete. Poi guarda una mossa avanti con gli altri due pezzi del vassoio. L&apos;autogioco gioca sempre la
                  mossa del Suggerimento e si ferma col bottone Ferma, col tasto Esc o a fine partita.
                </p>
                <p>
                  <b>Modalità Esperto:</b> i tre pezzi diventano una coda. Si deve giocare sempre il primo (bordo dorato);
                  gli altri due si vedono, così si può pianificare, ma non si possono usare prima. Dopo ogni mossa la coda
                  scorre e un pezzo nuovo entra in fondo. La partita finisce quando il primo pezzo non entra più. Ha un
                  record separato.
                </p>
              </div>
            )}
          </div>

          <div className="rounded-2xl bg-slate-900/70 p-3 text-sm ring-1 ring-slate-800">
            <button
              type="button"
              className="hx-link flex w-full items-center justify-between text-left font-medium"
              onClick={() => setShowCatalog((v) => !v)}
            >
              I {PIECES.length} pezzi ({SHAPES.length} forme) <span className="hx-link-sign text-slate-500">{showCatalog ? "−" : "+"}</span>
            </button>
            {showCatalog && (
              <div className="mt-3 space-y-3">
                <p className="text-slate-400">
                  Ogni forma compare in tutte le sue rotazioni diverse (le forme simmetriche ne hanno meno di 6). La
                  bandiera è diversa dalla propria immagine speculare: le sue due classi di simmetria, destra e sinistra,
                  hanno colori diversi.
                </p>
                {SHAPES.map((shape) => (
                  <div key={shape.name}>
                    <p className="mb-1 text-xs text-slate-400">
                      {shape.name} · {shape.pieces.length} {shape.pieces.length === 1 ? "orientamento" : "orientamenti"}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {shape.pieces.map((p) => (
                        <div
                          key={p.id}
                          className="relative flex h-19 w-19 items-center justify-center rounded-lg bg-slate-800/60 ring-1 ring-slate-800"
                        >
                          <PieceSvg cells={p.cells} color={p.color} scale={0.4} />
                          <span className="absolute left-1.5 top-0.5 text-[10px] tabular-nums text-slate-400">{p.num}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      </div>

      {createPortal(
        <ToastContainer position="top-center" theme="dark" newestOnTop limit={1} />,
        document.body,
      )}

      {/* Pezzo trascinato e pezzo in volo: disegnati in document.body (portal), così un
          contenitore della pagina con transform non può spostarli rispetto alla griglia. */}
      {drag?.moved &&
        tray[drag.idx] &&
        !preview?.valid &&
        !flying &&
        createPortal(
          <FloatingPiece
            piece={tray[drag.idx]}
            x={drag.x}
            y={drag.y - (drag.pointerType === "mouse" ? 0 : TOUCH_LIFT)}
            scale={drag.scale}
          />,
          document.body,
        )}
      {flying &&
        createPortal(
          <FloatingPiece piece={flying.piece} x={flying.x} y={flying.y} scale={flying.scale} k={flying.k} />,
          document.body,
        )}
    </div>
  );
}

function FloatingPiece({ piece, x, y, scale, k = 1 }) {
  // posiziona il pezzo in modo che il suo baricentro stia sotto il puntatore
  const pts = piece.cells.map(([q, r]) => axialToPixel(q, r, SIZE));
  const minX = Math.min(...pts.map((p) => p[0])) - SIZE;
  const minY = Math.min(...pts.map((p) => p[1])) - SIZE;
  const [cq, cr] = pieceCentroid(piece.cells);
  const [cx, cy] = axialToPixel(cq, cr, SIZE);
  const ox = (cx - minX) * scale;
  const oy = (cy - minY) * scale;
  return (
    <div
      data-testid="moving-piece"
      className="pointer-events-none fixed left-0 top-0 z-50"
      style={{
        // il baricentro del pezzo resta su (x, y) anche mentre cambia scala (k)
        transform: `translate(${x - ox}px, ${y - oy}px) scale(${k})`,
        transformOrigin: `${ox}px ${oy}px`,
      }}
    >
      <PieceSvg cells={piece.cells} color={piece.color} scale={scale} opacity={0.95} />
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="min-w-16 rounded-xl bg-slate-900/70 px-3 py-1.5 ring-1 ring-slate-800">
      <p className="text-[10px] uppercase tracking-widest text-slate-400">{label}</p>
      <p className="text-lg font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function Button({ children, onClick, disabled, primary, full }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`${full ? "w-full" : "min-w-30"} rounded-lg px-4 py-1.5 text-sm font-medium transition ${primary ? "hx-btn-primary" : "hx-btn"
        }`}
    >
      {children}
    </button>
  );
}
