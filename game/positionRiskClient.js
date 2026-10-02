const cache = new WeakMap();

/** Analisi e copia condividono lo stesso lavoro sul medesimo snapshot immutabile. */
export function calculatePositionRisk(snapshot, analysis) {
  if (cache.has(snapshot)) return cache.get(snapshot);
  const pending = new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./positionRisk.worker.js", import.meta.url));
    worker.onmessage = ({ data }) => {
      worker.terminate();
      if (data.error) reject(new Error(data.error));
      else resolve(data.result);
    };
    worker.onerror = () => { worker.terminate(); reject(new Error("Calcolo degli indicatori non riuscito.")); };
    worker.postMessage({
      position: { radius: snapshot.grid.radius, cells: [...snapshot.grid.cells],
        tray: snapshot.tray, expert: snapshot.expert },
      candidates: analysis.moves.map(({ idx, q, r, played }) => ({ idx, q, r, played })),
    });
  });
  cache.set(snapshot, pending);
  pending.catch(() => cache.delete(snapshot));
  return pending;
}
