import { expect } from "@playwright/test";

/** Raccoglie errori della pagina e della console (ignora la favicon mancante del server di prova). */
export function collectErrors(page) {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error" && !/favicon|404/.test(m.text()))
      errors.push(m.text());
  });
  return errors;
}

/** Valore di un riquadro del punteggio ("Punti", "Pezzi", "Record", ...). */
export async function stat(page, label) {
  return page.evaluate((l) => {
    const p = [...document.querySelectorAll("p")].find(
      (x) => x.textContent === l,
    );
    return p ? p.nextElementSibling.textContent : null;
  }, label);
}

export const statNum = async (page, label) => Number(await stat(page, label));

/** Avvia la pagina con un localStorage pulito (ed eventuali valori iniziali). */
export async function openFresh(page, storage = {}) {
  await page.goto("/");
  await page.evaluate((s) => {
    localStorage.clear();
    for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v);
  }, storage);
  await page.reload();
  await expect(page.getByTestId("board")).toBeVisible();
}

/** Chiede un suggerimento e restituisce il centro delle celle suggerite (coordinate schermo). */
export async function hintTarget(page) {
  await page.getByRole("button", { name: "Suggerimento" }).click();
  return page.evaluate(() => {
    const hs = [...document.querySelectorAll("polygon.hx-hint")];
    if (!hs.length) return null;
    // media dei centri delle celle (= baricentro del pezzo, il punto che il gioco usa per piazzarlo);
    // il centro del rettangolo che le contiene sarebbe sbagliato per i pezzi asimmetrici
    const cs = hs.map((h) => {
      const r = h.getBoundingClientRect();
      return [r.x + r.width / 2, r.y + r.height / 2];
    });
    return {
      x: cs.reduce((a, c) => a + c[0], 0) / cs.length,
      y: cs.reduce((a, c) => a + c[1], 0) / cs.length,
    };
  });
}

/** Aspetta che il numero di pezzi inseriti arrivi a n. */
export async function waitPieces(page, n, timeout = 10_000) {
  await expect
    .poll(() => statNum(page, "Pezzi"), { timeout })
    .toBeGreaterThanOrEqual(n);
}

/**
 * Sorveglia i voli fotogramma per fotogramma:
 *  - early: fotogrammi in cui, durante un volo, la destinazione è già visibile (fantasma o suggerimento)
 *  - landings: per ogni volo, distanza in pixel fra la fine del volo e le celle che si riempiono
 */
export async function watchFlights(page) {
  await page.evaluate(() => {
    const w = (window.__flights = { early: 0, landings: [] });
    const board = () => document.querySelector('[data-testid="board"]');
    const cells = () => [...board().querySelectorAll("polygon")].slice(0, 61);
    const filled = () =>
      new Set(
        cells()
          .map((c, i) => (c.getAttribute("fill") !== "#1e293b" ? i : -1))
          .filter((i) => i >= 0),
      );
    let last = null;
    let before = null;
    const tick = () => {
      const fly = document.querySelector('[data-testid="moving-piece"]');
      if (fly) {
        if (
          board().querySelector('polygon[opacity="0.6"]') ||
          board().querySelector(".hx-hint")
        )
          w.early++;
        const r = fly.querySelector("svg").getBoundingClientRect();
        last = { x: r.x + r.width / 2, y: r.y + r.height / 2 };
        if (!before) before = filled();
      } else if (last) {
        const added = [...filled()].filter((i) => !before.has(i));
        if (added.length) {
          const rs = added.map((i) => cells()[i].getBoundingClientRect());
          const cx =
            (Math.min(...rs.map((r) => r.left)) +
              Math.max(...rs.map((r) => r.right))) /
            2;
          const cy =
            (Math.min(...rs.map((r) => r.top)) +
              Math.max(...rs.map((r) => r.bottom))) /
            2;
          w.landings.push(Math.hypot(cx - last.x, cy - last.y));
        }
        last = null;
        before = null;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  return () => page.evaluate(() => window.__flights);
}
