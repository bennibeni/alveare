import HexBlockPuzzle from "@/game/HexBlockPuzzle";
import Link from "next/link";

export default function Page() {
  return (
    <main>
      <nav
        className="mx-auto max-w-6xl px-4 pt-4 text-right"
        aria-label="Laboratorio"
      >
        <Link href="/trappole" className="text-sm text-amber-300 underline">
          Esplora le trappole dell’autogioco →
        </Link>
      </nav>
      <HexBlockPuzzle />
      <footer className="projects-footer">
        <a href="https://links-page-bennibeni.vercel.app/">
          &larr; All projects
        </a>
      </footer>
    </main>
  );
}
