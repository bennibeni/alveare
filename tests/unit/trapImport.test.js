import { it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import data from "../../data/autopsia/trappole-100000.json";
import { archiveOf } from "../../game/trapArchive.js";

it("importa una conferma una sola volta e rifiuta le mosse non confermate senza alterare l’archivio", () => {
  const folder = mkdtempSync(path.join(tmpdir(), "alveare-import-test-"));
  try {
    const trap = data.games.flatMap((g) => g.traps)[0];
    const [idx, q, r] = trap.moves[0];
    const measure = (futuri, seme) => ({
      futuri,
      seme,
      mosse: 15,
      differenza: 100,
      errore: 10,
      a: { punti: 100, blocchi: 0 },
      b: { punti: 0, blocchi: 0 },
    });
    const record = {
      id: "trappola-test",
      stato: "confermata",
      app: { protocollo: "trappole-paired-v1" },
      posizione: {
        celle: trap.start.cells,
        vassoio: trap.start.tray,
        combo: trap.start.streak,
      },
      tua: { idx, q, r },
      suggerita: { idx, q, r },
      prova: measure(30, 777),
      conferma: measure(100, 99991),
    };
    const source = path.join(folder, "input.json"),
      target = path.join(folder, "output.json");
    const script = fileURLToPath(
      new URL("../../scripts/importa-trappole.mjs", import.meta.url),
    );
    writeFileSync(source, JSON.stringify(archiveOf([record])));
    const run = () =>
      execFileSync(process.execPath, [script, source, target], {
        stdio: "pipe",
      });
    run();
    run();
    expect(JSON.parse(readFileSync(target, "utf8")).records).toHaveLength(1);
    const before = readFileSync(target, "utf8");
    record.conferma.differenza = 1;
    writeFileSync(source, JSON.stringify(archiveOf([record])));
    expect(run).toThrow();
    expect(readFileSync(target, "utf8")).toBe(before);
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});
