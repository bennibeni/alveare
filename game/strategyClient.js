import { judgeMove } from "./moveJudgment.js";
import { analyzeMoves, analyzePlayedMove, slimAnalysis } from "./strategy.js";

// Un solo worker per tutta la pagina; le richieste hanno un numero e vengono servite in ordine.
let worker = null;
let nextId = 1;
const waiting = new Map();
const cache = new WeakMap(); // posizione (immutabile) -> Map(tipo -> Promise)

function local(type, position) {
  if (type === "played") {
    const analysis = analyzePlayedMove(position);
    return { analysis: slimAnalysis(analysis), judgment: judgeMove(analysis, position.tray.filter(Boolean).length) };
  }
  return { analysis: slimAnalysis(analyzeMoves(position.grid, position.tray, position.streak, { queue: position.expert })) };
}

function getWorker() {
  if (worker || typeof Worker === "undefined") return worker;
  try {
    worker = new Worker(new URL("./strategy.worker.js", import.meta.url));
    worker.onmessage = ({ data }) => {
      const entry = waiting.get(data.id);
      if (!entry) return;
      waiting.delete(data.id);
      if (data.error) entry.reject(new Error(data.error));
      else entry.resolve(data.result);
    };
    worker.onerror = () => {
      // worker non disponibile: le richieste in sospeso e le successive si calcolano qui
      for (const entry of waiting.values()) entry.fallback();
      waiting.clear();
      worker.terminate();
      worker = false;
    };
  } catch {
    worker = false;
  }
  return worker;
}

function run(type, position) {
  const w = getWorker();
  if (!w) return Promise.resolve().then(() => local(type, position));
  return new Promise((resolve, reject) => {
    const id = nextId++;
    waiting.set(id, { resolve, reject, fallback: () => { try { resolve(local(type, position)); } catch (e) { reject(e); } } });
    w.postMessage({ id, type, position: {
      radius: position.grid.radius, cells: [...position.grid.cells], tray: position.tray,
      streak: position.streak, expert: position.expert, idx: position.idx, q: position.q, r: position.r,
    } });
  });
}

/**
 * Analisi (e, per una mossa giocata, giudizio) calcolata nel worker.
 * type: "played" per lo snapshot di una mossa giocata, "moves" per la posizione corrente.
 * La stessa posizione chiesta due volte riceve la stessa Promise.
 */
export function requestAnalysis(type, position) {
  let byType = cache.get(position);
  if (!byType) cache.set(position, (byType = new Map()));
  if (!byType.has(type)) {
    const pending = run(type, position);
    byType.set(type, pending);
    pending.catch(() => byType.delete(type));
  }
  return byType.get(type);
}
