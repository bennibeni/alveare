import HexBlockPuzzle from "@/game/HexBlockPuzzle";

export default function Page() {
  return (
    <main>
      <HexBlockPuzzle />
      <footer className="projects-footer">
        <a href="https://links-page-bennibeni.vercel.app/">
          &larr; All projects
        </a>
      </footer>
    </main>
  );
}
