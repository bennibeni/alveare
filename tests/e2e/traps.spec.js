import { expect, test } from "@playwright/test";
import { collectErrors } from "./helpers.js";
import { PIECES, pieceCentroid } from "../../game/pieces.js";
import { axialToPixel } from "../../game/HexGrid.js";
import { readFileSync } from "node:fs";

test("una card per posizione conserva replay e tentativi di tutte le copie", async ({
  page,
}) => {
  await page.goto("/trappole");
  await expect(
    page.getByRole("button", { name: /^Tentativi: seme/ }),
  ).toHaveCount(19);
  await expect(
    page.getByText("19 posizioni · 42 continuazioni nel filtro", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /^Seme 108924/ })).toHaveCount(
    0,
  );
  const all = JSON.parse(
    readFileSync(
      new URL("../../data/autopsia/trappole-100000.json", import.meta.url),
      "utf8",
    ),
  ).games.flatMap((g) => g.traps);
  const members = all.filter((t) => t.seed === 102134);
  const records = [...members, all[0]].map((t) => ({
    id: `history-${t.seed}-${t.k}`,
    partita: `trappola-${t.seed}-${t.pezzo}-${t.k}`,
    mossa: 1,
    stato: "non_migliore",
    esito: "vantaggio_non_confermato",
    tua: { idx: 0, q: 0, r: 0, pezzo: t.start.tray[0] },
    aggiunto: "2026-11-07",
    prova: {
      differenza: 0,
      errore: 1,
      futuri: 30,
      a: { blocchi: 1 },
      b: { blocchi: 1 },
    },
    conferma: null,
  }));
  await page.evaluate(
    (records) =>
      localStorage.setItem(
        "alveare-trappole-valutazioni-v1",
        JSON.stringify({ records }),
      ),
    records,
  );
  await page.getByRole("button", { name: /^Seme 102134/ }).click();
  const continuations = page.getByLabel("Continuazione della posizione");
  await expect(continuations.locator("option")).toHaveCount(2);
  const value = await continuations
    .locator("option")
    .nth(1)
    .getAttribute("value");
  await continuations.selectOption(value);
  await expect(
    page
      .getByRole("region", { name: "Replay della trappola" })
      .getByRole("heading"),
  ).toContainText(`copia ${Number(value.split("-")[2]) + 1}`);
  await expect(
    page.getByRole("slider", { name: "Mossa del replay" }),
  ).toHaveValue("0");
  await page.getByRole("button", { name: /^Tentativi: seme 102134,/ }).click();
  const modal = page.getByRole("dialog");
  await expect(modal.getByRole("listitem")).toHaveCount(2);
  for (const t of members)
    await expect(
      modal.getByText(
        `Origine: seme ${t.seed}, ingresso ${t.pezzo}, copia ${t.k + 1}`,
        { exact: true },
      ),
    ).toBeVisible();
  await page.keyboard.press("Escape");
});

async function dropMove(page, value) {
  const [idx, q, r] = value.split(",").map(Number);
  const slot = page.getByRole("button", {
    name: new RegExp(`^Trascina pezzo ${idx + 1}:`),
  });
  await slot.scrollIntoViewIfNeeded();
  const id = await slot.getAttribute("data-piece-id");
  const [cq, cr] = pieceCentroid(PIECES.find((p) => String(p.id) === id).cells);
  const [x, y] = axialToPixel(q + cq, r + cr, 10);
  const target = await page
    .getByRole("img", { name: "Tabellone della trappola", exact: true })
    .evaluate(
      (svg, p) => {
        const point = new DOMPoint(p.x, p.y).matrixTransform(
          svg.getScreenCTM(),
        );
        return { x: point.x, y: point.y };
      },
      { x, y },
    );
  const box = await slot.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(target.x, target.y, { steps: 10 });
  await page.mouse.up();
}

for (const confirmed of [true, false]) {
  test(`valutazione ${confirmed ? "migliore" : "non migliore"} salvata e riutilizzata dopo il ricaricamento`, async ({
    page,
  }) => {
    // Risultato sintetico: questo test verifica persistenza e interfaccia.
    // Il test successivo esegue il worker reale e le simulazioni.
    await page.addInitScript((confirmed) => {
      window.Worker = class {
        postMessage() {
          if (localStorage.getItem("alveare-trappole-valutazioni-v1"))
            throw new Error("Il confronto già salvato non deve ripartire");
          this.timer = setTimeout(
            () =>
              this.onmessage?.({
                data: {
                  result: {
                    confirmed,
                    prova: {
                      futuri: 30,
                      mosse: 15,
                      seme: 777,
                      differenza: 100,
                      errore: 10,
                      a: { punti: 200, blocchi: 0 },
                      b: { punti: 100, blocchi: 0 },
                    },
                    conferma: {
                      futuri: 100,
                      mosse: 15,
                      seme: 99991,
                      differenza: 100,
                      errore: 10,
                      a: { punti: 200, blocchi: 0 },
                      b: { punti: 100, blocchi: 0 },
                    },
                  },
                },
              }),
            30,
          );
        }
        terminate() {
          clearTimeout(this.timer);
        }
      };
    }, confirmed);
    const choose = async () => {
      await page.getByLabel("Filtra le trappole").selectOption("evitabile");
      await page.getByRole("button", { name: "Mostra analisi" }).click();
      await page
        .getByRole("button", { name: /Vai alla mossa decisiva/ })
        .click();
      const value = await page
        .getByRole("combobox", {
          name: "Alternative alla mossa decisiva",
          exact: true,
        })
        .locator("option")
        .nth(1)
        .getAttribute("value");
      await dropMove(page, value);
      await expect(
        page.getByText(
          confirmed
            ? /Mossa registrata nell’archivio di questo browser\./
            : /Mossa registrata come non migliore/,
        ),
      ).toBeVisible();
    };
    await page.goto("/trappole");
    await expect(page.locator('[data-trap-status="nuova"]')).toHaveCount(19);
    await choose();
    const markedCard = page
      .locator(`[data-trap-status="${confirmed ? "migliore" : "analizzata"}"]`)
      .filter({ has: page.getByRole("button", { name: /^Seme 101746/ }) });
    await expect(markedCard).toHaveCount(1);
    await expect(
      markedCard.getByText(
        confirmed ? "Mossa migliore trovata" : "Già analizzata",
        { exact: true },
      ),
    ).toBeVisible();
    if (confirmed) {
      const downloading = page.waitForEvent("download");
      await page
        .getByRole("button", {
          name: "Esporta trappole con mosse migliori",
          exact: true,
        })
        .click();
      const exportedTrap = await downloading;
      expect(exportedTrap.suggestedFilename()).toBe(
        "alveare-trappole-con-mosse-migliori.json",
      );
      const payload = JSON.parse(
        readFileSync(await exportedTrap.path(), "utf8"),
      );
      expect(payload.posizioni).toHaveLength(1);
      expect(payload.posizioni[0].continuazioni[0].seed).toBe(101746);
      expect(payload.posizioni[0].valutazioni[0].stato).toBe("confermata");
    }
    const historyButton = page
      .getByRole("button", { name: /^Tentativi: seme/ })
      .first();
    await historyButton.click();
    const historyDialog = page.getByRole("dialog", {
      name: /Tentativi per seme/,
    });
    await expect(historyDialog).toBeVisible();
    await expect(historyDialog.getByRole("listitem")).toHaveCount(1);
    await expect(
      historyDialog.getByText(confirmed ? "Migliore" : "Non migliore", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(historyDialog.getByText(/Blocchi: tua/)).toBeVisible();
    if (!confirmed) {
      await page.setViewportSize({ width: 375, height: 812 });
      await expect(historyDialog).toBeVisible();
      expect(
        await historyDialog.evaluate((el) => el.scrollWidth <= el.clientWidth),
      ).toBe(true);
      await page.screenshot({
        path: "test-results/trappole-tentativi-mobile.png",
      });
      await page.setViewportSize({ width: 1100, height: 950 });
    }
    await page.keyboard.press("Escape");
    await expect(historyDialog).toHaveCount(0);
    await expect(historyButton).toBeFocused();
    await page
      .getByRole("button", { name: /^Tentativi: seme/ })
      .nth(1)
      .click();
    await expect(
      historyDialog.getByText("Nessun tentativo valutato per questa trappola."),
    ).toBeVisible();
    await historyDialog
      .getByRole("button", { name: "Chiudi tentativi" })
      .click();
    const beforeReset = await page.evaluate(() =>
      localStorage.getItem("alveare-trappole-valutazioni-v1"),
    );
    await page.getByRole("button", { name: "Scegli un’altra mossa" }).click();
    await expect(
      page.getByRole("img", { name: "Anteprima della tua mossa", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("region", { name: "Confronto su futuri casuali" }),
    ).toHaveCount(0);
    expect(
      await page.evaluate(() =>
        localStorage.getItem("alveare-trappole-valutazioni-v1"),
      ),
    ).toBe(beforeReset);
    await expect(
      page.getByText(/Le valutazioni precedenti sono conservate nello storico/),
    ).toBeVisible();
    await page.reload();
    await expect(markedCard).toHaveCount(1);
    await choose();
    expect(
      await page.evaluate(
        () =>
          JSON.parse(localStorage.getItem("alveare-trappole-valutazioni-v1"))
            .records.length,
      ),
    ).toBe(1);
    await expect(page.getByText(/Mossa già valutata/)).toBeVisible();
    await expect(page.getByLabel("Prova una mossa")).toHaveCount(0);
    const exported = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Esporta tutte le valutazioni" })
      .click();
    expect((await exported).suggestedFilename()).toBe(
      "alveare-trappole-valutazioni.json",
    );
  });
}

test("il laboratorio filtra le trappole, riproduce il blocco e mostra le alternative", async ({
  page,
}) => {
  const errors = collectErrors(page);
  await page.goto("/trappole");
  await expect(
    page.getByRole("heading", { name: "Le trappole dell’autogioco" }),
  ).toBeVisible();
  await expect(
    page.getByText("29 · senza scampo", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("13 · con mossa decisiva", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("Filtra le trappole").selectOption("evitabile");
  await expect(
    page.getByText(/posizioni · 13 continuazioni nel filtro/),
  ).toBeVisible();
  await page.getByRole("button", { name: "Mostra analisi" }).click();
  await page.getByRole("button", { name: /Vai alla mossa decisiva/ }).click();
  const alternatives = page.getByRole("combobox", {
    name: "Alternative alla mossa decisiva",
    exact: true,
  });
  const option = await alternatives
    .locator("option")
    .nth(1)
    .getAttribute("value");
  const [idx, q, r] = option.split(",").map(Number);
  const pieceButton = page.getByRole("button", {
    name: new RegExp(`^Trascina pezzo ${idx + 1}:`),
  });
  const pieceId = await pieceButton.getAttribute("data-piece-id");
  const piece = PIECES.find((p) => String(p.id) === pieceId);
  const [cq, cr] = pieceCentroid(piece.cells);
  const [x, y] = axialToPixel(q + cq, r + cr, 10);
  const board = page.getByRole("img", {
    name: "Tabellone della trappola",
    exact: true,
  });
  const target = await board.evaluate(
    (svg, point) => {
      const screen = new DOMPoint(point.x, point.y).matrixTransform(
        svg.getScreenCTM(),
      );
      return { x: screen.x, y: screen.y };
    },
    { x, y },
  );
  await pieceButton.scrollIntoViewIfNeeded();
  let box = await pieceButton.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(5, 5, { steps: 5 });
  await page.mouse.up();
  await expect(
    page.getByRole("region", { name: "Confronto su futuri casuali" }),
  ).toHaveCount(0);
  await expect(page.getByText(/Posizione non valida\./)).toBeVisible();
  box = await pieceButton.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(target.x, target.y, { steps: 10 });
  await page.mouse.up();
  await expect(
    page.getByRole("img", { name: "Anteprima della tua mossa", exact: true }),
  ).toBeVisible();
  const comparison = page.getByRole("region", {
    name: "Confronto su futuri casuali",
  });
  await expect(comparison).toBeVisible();
  await expect(
    comparison.getByText(
      /La tua mossa è risultata migliore anche nella conferma\.|Il confronto non conferma che la tua mossa sia migliore\./,
    ),
  ).toBeVisible({ timeout: 120_000 });
  if (
    await comparison
      .getByText("La tua mossa è risultata migliore anche nella conferma.", {
        exact: true,
      })
      .count()
  ) {
    await expect(
      comparison.getByText(
        /Mossa registrata nell’archivio di questo browser\./,
      ),
    ).toBeVisible();
    const records = await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("alveare-trappole-migliori-v1"))
          .records,
    );
    expect(records).toHaveLength(1);
    expect(records[0].conferma.futuri).toBe(100);
    expect(records[0].conferma.differenza).toBeGreaterThan(
      2 * records[0].conferma.errore,
    );
    const exported = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Esporta le mosse migliori salvate" })
      .click();
    expect((await exported).suggestedFilename()).toBe(
      "alveare-trappole-migliori.json",
    );
  }
  await expect(
    page.getByText("La tua mossa lasciava una possibilità con i pezzi noti.", {
      exact: true,
    }),
  ).toBeVisible();
  await alternatives.selectOption(option);
  await expect(page.getByText(/Alternativa evidenziata:/)).toBeVisible();
  const slider = page.getByRole("slider", { name: "Mossa del replay" });
  await slider.focus();
  await page.keyboard.press("End");
  await expect(page.getByText("Blocco finale", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Non ci sono mosse legali: la continuazione è bloccata."),
  ).toBeVisible();
  await page.setViewportSize({ width: 375, height: 812 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/trappole-mobile.png",
    fullPage: true,
  });
  await page.getByLabel("Filtra le trappole").selectOption("ignota");
  await expect(
    page.getByText("Nessuna trappola per questo filtro."),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
