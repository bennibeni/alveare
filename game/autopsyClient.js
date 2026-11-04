import { buildAutopsy, moveRisks } from "./autopsy.js";

// Un worker per l'autopsia; senza worker si calcola qui.
let worker = null;
let nextId = 1;
const waiting = new Map();
const local = (type, input) =>
  type === "risks" ? moveRisks(input) : buildAutopsy(input);

function getWorker() {
  if (worker !== null || typeof Worker === "undefined") return worker;
  try {
    worker = new Worker(new URL("./autopsy.worker.js", import.meta.url));
    worker.onmessage = ({ data }) => {
      const entry = waiting.get(data.id);
      if (!entry) return;
      waiting.delete(data.id);
      if (data.error) entry.reject(new Error(data.error));
      else entry.resolve(data.result);
    };
    worker.onerror = () => {
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

function run(type, input) {
  const w = getWorker();
  if (!w) return Promise.resolve().then(() => local(type, input));
  return new Promise((resolve, reject) => {
    const id = nextId++;
    waiting.set(id, {
      resolve,
      reject,
      fallback: () => {
        try {
          resolve(local(type, input));
        } catch (error) {
          reject(error);
        }
      },
    });
    w.postMessage({ id, type, input });
  });
}

/** Autopsia di una partita: input da autopsyInput (dati semplici, clonabili). */
export const requestAutopsy = (input) => run("autopsy", input);

/** Rischio delle mosse di una posizione: { cells, tray (id), moves: [{ idx, q, r }] }. */
export const requestMoveRisks = (input) => run("risks", input);
