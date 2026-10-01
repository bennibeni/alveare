import { expect, test } from "@playwright/test";
import { collectErrors, hintTarget, openFresh, stat, statNum, waitPieces, watchFlights } from "./helpers.js";

test("la pagina si carica senza errori (idratazione inclusa)", async ({ page }) => {
  const errors = collectErrors(page);
  await openFresh(page);
  await expect(page).toHaveTitle("Alveare");
  await expect(page.getByRole("heading", { name: "Alveare" })).toBeVisible();
  await expect(page.getByText("ispirato a Hex FRVR")).toBeVisible();
  await expect(page.locator('[data-testid^="slot-"][aria-label^="Pezzo"]')).toHaveCount(3);
  expect(errors).toEqual([]);
});

test("inserimento con clic: il pezzo vola fino alla sua cella, senza anteprima a destinazione", async ({ page }) => {
  const errors = collectErrors(page);
  await openFresh(page);
  const report = await watchFlights(page);
  for (let i = 1; i <= 3; i++) {
    const t = await hintTarget(page);
    await page.mouse.click(t.x, t.y);
    await waitPieces(page, i);
    await page.waitForTimeout(700); // eventuale pausa per le linee
  }
  const r = await report();
  expect(r.early).toBe(0);
  expect(r.landings.length).toBeGreaterThanOrEqual(3);
  expect(Math.max(...r.landings)).toBeLessThan(1);
  expect(errors).toEqual([]);
});

test("trascinamento: il pezzo trascinato si posa dove lo si lascia", async ({ page }) => {
  await openFresh(page);
  const t = await hintTarget(page);
  const slot = page.locator('[data-testid^="slot-"][data-selected="true"]');
  const box = await slot.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(t.x, t.y, { steps: 12 });
  await page.mouse.up();
  await waitPieces(page, 1);
});

test("dentro un contenitore con transform i pezzi atterrano esattamente sulla loro cella", async ({ page }) => {
  await openFresh(page);
  await page.addStyleTag({ content: "main { transform: translateY(0); margin: 80px 0 0 120px; }" });
  const report = await watchFlights(page);
  await page.getByRole("button", { name: "Autogioco" }).click();
  await waitPieces(page, 6, 20_000);
  await page.getByRole("button", { name: "Ferma" }).click();
  const r = await report();
  expect(r.early).toBe(0);
  expect(Math.max(...r.landings)).toBeLessThan(1);
});

test("autogioco: parte, si ferma senza lasciare pezzi a mezz'aria; il bottone Esperto non lampeggia", async ({ page }) => {
  await openFresh(page);
  await page.evaluate(() => {
    const sw = document.querySelector('[role="switch"]');
    window.__swStates = new Set();
    const f = () => {
      window.__swStates.add(`${getComputedStyle(sw).opacity}|${sw.disabled}`);
      requestAnimationFrame(f);
    };
    requestAnimationFrame(f);
  });
  await page.getByRole("button", { name: "Autogioco" }).click();
  await waitPieces(page, 5, 20_000);
  await page.getByRole("button", { name: "Ferma" }).click();
  await page.waitForTimeout(800);
  const n = await statNum(page, "Pezzi");
  await page.waitForTimeout(1500);
  expect(await statNum(page, "Pezzi")).toBe(n);
  await expect(page.getByTestId("moving-piece")).toHaveCount(0);
  expect(await page.evaluate(() => [...window.__swStates])).toEqual(["1|false"]);
});

test("linea completata: lampeggia per circa 350 ms prima di svuotarsi", async ({ page }) => {
  await openFresh(page);
  await page.evaluate(() => {
    window.__flash = [];
    let t0 = null;
    const f = () => {
      const on = !!document.querySelector(".hx-flash");
      if (on && t0 === null) t0 = performance.now();
      if (!on && t0 !== null) {
        window.__flash.push(performance.now() - t0);
        t0 = null;
      }
      requestAnimationFrame(f);
    };
    requestAnimationFrame(f);
  });
  await page.getByRole("button", { name: "Autogioco" }).click();
  await expect.poll(() => page.evaluate(() => window.__flash.length), { timeout: 40_000 }).toBeGreaterThanOrEqual(2);
  await page.getByRole("button", { name: "Ferma" }).click();
  for (const d of await page.evaluate(() => window.__flash)) {
    expect(d).toBeGreaterThan(300);
    expect(d).toBeLessThan(450);
  }
});

test("modalità Esperto: si gioca solo il primo pezzo, la coda scorre, record separati", async ({ page }) => {
  await openFresh(page, { "alveare-best": "12" });
  await page.getByRole("switch").click();
  await expect(page.getByRole("switch")).toHaveAttribute("aria-checked", "true");
  expect(await stat(page, "Record Esperto")).toBe("0");
  const names = () => page.locator('[data-testid^="slot-"]').evaluateAll((els) => els.map((e) => e.getAttribute("aria-label").split(": ")[1].replace(" (in coda)", "")));
  const before = await names();
  // il secondo pezzo (in coda) non si può trascinare
  const s1 = await page.getByTestId("slot-1").boundingBox();
  const board = await page.getByTestId("board").boundingBox();
  await page.mouse.move(s1.x + s1.width / 2, s1.y + s1.height / 2);
  await page.mouse.down();
  await page.mouse.move(board.x + board.width / 2, board.y + board.height / 2, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(500);
  expect(await statNum(page, "Pezzi")).toBe(0);
  // il primo sì: dopo la mossa la coda scorre
  const t = await hintTarget(page);
  await page.mouse.click(t.x, t.y);
  await waitPieces(page, 1);
  const after = await names();
  expect(after.slice(0, 2)).toEqual(before.slice(1, 3));
  // tornando alla modalità normale ricompare il record normale
  await page.getByRole("switch").click();
  expect(await stat(page, "Record")).toBe("12");
  const keys = await page.evaluate(() => ({ n: localStorage.getItem("alveare-best"), e: localStorage.getItem("alveare-best-expert") }));
  expect(keys.n).toBe("12");
  expect(Number(keys.e)).toBeGreaterThan(0);
});

test("record: recuperato dalle chiavi della versione precedente", async ({ page }) => {
  await openFresh(page, { "hexfrvr-best": "777", "hexfrvr-best-expert": "3314" });
  expect(await stat(page, "Record")).toBe("777");
  await page.getByRole("switch").click();
  expect(await stat(page, "Record Esperto")).toBe("3314");
});

test("avviso di nuovo record: compare quando si supera il record, si aggiorna, sparisce con una nuova partita", async ({ page }) => {
  await openFresh(page, { "alveare-best-expert": "40" });
  await page.getByRole("switch").click();
  await page.getByRole("button", { name: "Autogioco" }).click();
  const toast = page.locator(".Toastify__toast");
  await expect(toast).toBeVisible({ timeout: 40_000 });
  await expect(toast).toContainText("Nuovo record Esperto");
  await expect(toast).toContainText("(prima 40)");
  const first = Number((await toast.textContent()).match(/: (\d+)/)[1]);
  expect(first).toBeGreaterThan(40);
  await expect.poll(async () => Number((await toast.textContent()).match(/: (\d+)/)[1]), { timeout: 30_000 }).toBeGreaterThan(first);
  await page.getByRole("button", { name: "Ferma" }).click();
  await expect(toast).toBeVisible();
  await page.getByRole("button", { name: "Nuova partita" }).click();
  await expect(toast).toHaveCount(0, { timeout: 5_000 });
});

test("fine partita: solo l'etichetta «Partita finita», senza bottoni né riquadri sopra la griglia", async ({ page }) => {
  test.setTimeout(240_000);
  await openFresh(page);
  await page.getByRole("switch").click(); // in Esperto si perde prima
  // Gioca male di proposito: mette il pezzo nella prima cella libera seguendo un ordine
  // "sparpagliato" (passo 37 su 61, che tocca tutte le celle). Così si lasciano buchi ovunque,
  // si completano poche linee e la partita finisce in fretta. (In ordine di lettura invece si
  // completano continuamente righe e si sopravvive a lungo.)
  const order = Array.from({ length: 61 }, (_, i) => (i * 37) % 61);
  const board = page.getByTestId("board");
  for (let moves = 0; moves < 120; moves++) {
    if (await page.getByText("Partita finita").count()) break;
    await page.keyboard.press("1");
    const before = await statNum(page, "Pezzi");
    const centers = await board.evaluate((svg) =>
      [...svg.querySelectorAll("polygon")].slice(0, 61).map((c) => {
        const r = c.getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2, free: c.getAttribute("fill") === "#1e293b" };
      }),
    );
    for (const c of order.map((i) => centers[i]).filter((c) => c.free)) {
      await page.mouse.move(c.x, c.y);
      await page.mouse.click(c.x, c.y);
      if ((await statNum(page, "Pezzi")) > before) break;
    }
    await page.waitForTimeout(800);
  }
  const banner = page.getByRole("status").filter({ hasText: "Partita finita" });
  await expect(banner).toHaveText("Partita finita");
  expect(await banner.locator("button").count()).toBe(0);
  // l'etichetta sta sul bordo inferiore: non copre il centro del tabellone
  const bb = await banner.boundingBox();
  const brd = await board.boundingBox();
  expect(bb.y).toBeGreaterThan(brd.y + brd.height * 0.8);
});

test("durante l'autogioco «Annulla» è disattivato", async ({ page }) => {
  await openFresh(page);
  await page.getByRole("button", { name: "Autogioco" }).click();
  await waitPieces(page, 2, 20_000);
  await expect(page.getByRole("button", { name: "Annulla" })).toBeDisabled();
  await page.getByRole("button", { name: "Ferma" }).click();
});

test("colori leggibili anche con stili globali «ostili» del progetto", async ({ page }) => {
  await openFresh(page);
  await page.addStyleTag({ content: "span { color: #fff } button:hover { color: #fff; background: #fff }" });
  for (const name of ["Nuova partita", "Suggerimento", "Autogioco"]) {
    const b = page.getByRole("button", { name });
    await b.hover();
    const [color, bg] = await b.evaluate((e) => [getComputedStyle(e).color, getComputedStyle(e).backgroundColor]);
    expect(color).not.toBe(bg);
  }
  await page.getByRole("switch").click();
  await page.getByRole("button", { name: "Autogioco" }).click();
  const banner = page.locator(".hx-toast");
  await expect(banner).toBeVisible({ timeout: 40_000 });
  const colors = await banner.evaluate((b) => [...b.querySelectorAll("span")].map((s) => getComputedStyle(s).color));
  for (const c of colors) expect(c).not.toBe("rgb(255, 255, 255)");
  await page.getByRole("button", { name: "Ferma" }).click();
});

test("schermo stretto: i pezzi del vassoio sono in proporzione con le celle del tabellone", async ({ page }) => {
  await page.setViewportSize({ width: 420, height: 900 });
  await openFresh(page);
  const ratio = await page.evaluate(() => {
    const cell = document.querySelector('[data-testid="board"] polygon').getBoundingClientRect().width;
    const trayHex = document.querySelector('[data-testid="slot-0"] polygon').getBoundingClientRect().width;
    return trayHex / cell;
  });
  expect(ratio).toBeGreaterThan(0.35);
  expect(ratio).toBeLessThan(0.55);
});
