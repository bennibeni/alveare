import Link from "next/link";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import data from "@/data/autopsia/trappole-100000.json";
import { autopsyInput, buildAutopsy } from "@/game/autopsy.js";
import { replayTrap } from "@/game/trapReplay.js";
import TrapLab from "@/game/TrapLab.jsx";
import { groupTraps, hasSingleLegalMove } from "@/game/trapGroups.js";

export const metadata = { title: "Trappole · Alveare" };
export const dynamic = "force-static";

export default function TrapsPage() {
  const hash = createHash("sha256");
  for (const file of [
    "strategy.js",
    "learnedRisk.js",
    "pieceAvailability.js",
    "pieces.js",
    "HexGrid.js",
    "trapComparison.js",
  ])
    hash.update(readFileSync(path.join(process.cwd(), "game", file)));
  const strategyId = hash.digest("hex").slice(0, 16);
  const traps = data.games
    .flatMap((g) => g.traps)
    .filter((trap) => !hasSingleLegalMove(trap.start))
    .map((trap) => {
      const { moveLog, finalTray } = replayTrap(trap);
      return {
        ...trap,
        analysis: buildAutopsy(autopsyInput(moveLog, finalTray)),
      };
    });
  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-8">
      <Link href="/" className="text-amber-300 underline">
        ← Torna al gioco
      </Link>
      <header className="space-y-3">
        <p className="text-sm uppercase tracking-widest text-amber-300">
          Laboratorio
        </p>
        <h1 className="text-3xl font-bold">Le trappole dell’autogioco</h1>
        <p className="max-w-3xl text-slate-300">
          Esplora {groupTraps(traps).length} posizioni distinte, con{" "}
          {traps.length} continuazioni bloccate raccolte in {data.games.length}{" "}
          partite. Rigioca le mosse, prova un’alternativa e scopri dove si
          poteva ancora continuare.
        </p>
        <p className="text-sm text-slate-400">
          Sono escluse le posizioni iniziali con una sola mossa legale, contando
          una volta sola i pezzi identici.
        </p>
        <p className="rounded-xl bg-slate-900 p-4 text-sm text-slate-400">
          Archivio storico: strategia fa730f6, semi da 100000, {data.k} futuri
          per ingresso in pericolo. Non misura la strategia attuale. L’oracolo
          conosce i pezzi arrivati e cerca fino a 25 mosse: una via alternativa
          non garantisce la vittoria della partita.
        </p>
      </header>
      <TrapLab traps={traps} strategyId={strategyId} />
    </main>
  );
}
