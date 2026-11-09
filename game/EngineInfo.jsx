"use client";

import { useId, useRef } from "react";
import { ENGINE_HASH, ENGINE_VERSION } from "@alveare/motore";

// Un esempio aggiornato rispetto alla versione in uso; non indica una release esistente.
const beta = ENGINE_VERSION.match(/^(.*-beta\.)(\d+)$/);
const parts = ENGINE_VERSION.match(/^(\d+)\.(\d+)\.(\d+)/);
const exampleVersion = beta
  ? `${beta[1]}${Number(beta[2]) + 1}`
  : parts
    ? `${parts[1]}.${parts[2]}.${Number(parts[3]) + 1}`
    : "1.0.1";

function Command({ children }) {
  return (
    <pre className="mt-2 max-w-full overflow-x-auto rounded-lg border border-slate-700 bg-slate-900 p-3 text-xs leading-relaxed text-slate-100">
      <code>{children}</code>
    </pre>
  );
}

export default function EngineInfo() {
  const dialog = useRef(null);
  const id = useId();
  return (
    <div className="mt-2 flex items-center justify-center gap-1 text-xs text-slate-300">
      <span>Motore {ENGINE_VERSION}</span>
      <button
        type="button"
        aria-label="Informazioni sul motore"
        aria-haspopup="dialog"
        aria-controls={id}
        title="Versione del motore e istruzioni di aggiornamento"
        onClick={() => dialog.current.showModal()}
        className="inline-flex size-8 items-center justify-center rounded-full text-amber-300 hover:bg-slate-800 hover:text-amber-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 11v6" strokeLinecap="round" />
          <circle cx="12" cy="7.5" r="1" fill="currentColor" stroke="none" />
        </svg>
      </button>
      <dialog
        ref={dialog}
        id={id}
        aria-labelledby={`${id}-title`}
        aria-describedby={`${id}-description`}
        onClick={(event) => {
          if (event.target === event.currentTarget) dialog.current.close();
        }}
        // Le scorciatoie della partita restano inattive mentre si legge la guida.
        onKeyDown={(event) => event.stopPropagation()}
        className="m-auto max-h-[85dvh] w-[calc(100vw-2rem)] max-w-3xl overflow-y-auto overscroll-contain rounded-2xl border border-slate-600 bg-slate-950 p-0 text-left text-sm text-slate-200 shadow-2xl backdrop:bg-slate-950/80"
      >
        <div className="space-y-5 p-5 sm:p-6">
          <div className="sticky top-0 z-10 flex items-start justify-between gap-4 bg-slate-950 pb-3">
            <div>
              <h2 id={`${id}-title`} className="text-xl font-semibold text-white">Il motore di Alveare</h2>
              <p className="mt-1 text-amber-300">Versione in uso: <strong>{ENGINE_VERSION}</strong></p>
            </div>
            <button type="button" aria-label="Chiudi informazioni sul motore" onClick={() => dialog.current.close()} className="hx-btn shrink-0 rounded-lg px-3 py-2 text-sm">Chiudi</button>
          </div>

          <p id={`${id}-description`} className="leading-relaxed text-slate-300">
            Alveare usa una copia versionata di <code>alveare-motore</code>, installata nel gioco.
            Dopo aver modificato il progetto del motore, crea una nuova release e installala in Alveare.
          </p>
          <p className="rounded-lg border border-amber-800/70 bg-amber-950/20 p-3 text-amber-100">
            Nei comandi qui sotto <strong>{exampleVersion}</strong> è solo un esempio di nuova versione.
            Scegli un numero non ancora utilizzato e sostituiscilo in entrambi i comandi.
          </p>

          <ol className="space-y-5">
            <li>
              <h3 className="font-semibold text-white">1. Crea la nuova release del motore</h3>
              <p className="mt-1 text-slate-300">Da PowerShell, dopo le modifiche al motore:</p>
              <Command>{`cd "C:\\Users\\torre\\Desktop\\I miei progetti\\alveare-motore"\nnpm run release -- ${exampleVersion}`}</Command>
              <p className="mt-2 text-slate-400">Lo script esegue i test e crea il pacchetto nella cartella <code>releases/</code>. Le release esistenti non vengono sovrascritte. Se hai già il nuovo pacchetto, passa al punto 2.</p>
            </li>
            <li>
              <h3 className="font-semibold text-white">2. Installa e verifica in Alveare</h3>
              <Command>{`cd "C:\\Users\\torre\\Desktop\\I miei progetti\\alveare"\nnpm run motore:aggiorna -- "../alveare-motore/releases/alveare-motore-${exampleVersion}.tgz"\nnpm run motore:versione\nnpm test\nnpm run build`}</Command>
              <p className="mt-2 text-slate-400">L’aggiornamento conserva il pacchetto in <code>vendor/</code> e aggiorna la dipendenza del gioco. Prima di usare la nuova versione, verifica che test e build riescano.</p>
            </li>
            <li>
              <h3 className="font-semibold text-white">3. Riavvia il gioco locale</h3>
              <p className="mt-1 text-slate-300">Ferma il server con <kbd>Ctrl+C</kbd> nel terminale che lo esegue, poi riavvialo:</p>
              <Command>{"npm run dev"}</Command>
              <p className="mt-2 text-slate-400">Ricarica la pagina: la versione mostrata sotto il titolo deve corrispondere a quella appena installata.</p>
            </li>
          </ol>

          <section className="space-y-2 border-t border-slate-700 pt-4">
            <h3 className="font-semibold text-white">Aggiornare Alveare pubblicato</h3>
            <p className="text-slate-300">Pubblica anche <code>package.json</code>, <code>package-lock.json</code> e il nuovo pacchetto in <code>vendor/</code>, poi esegui una nuova distribuzione del sito. La versione visualizzata online identifica il motore incluso in quella pubblicazione.</p>
          </section>
          <section className="space-y-2 border-t border-slate-700 pt-4">
            <h3 className="font-semibold text-white">Conservare una versione per il ripristino</h3>
            <p className="text-slate-300">Prima di aggiornare, conserva il pacchetto attuale. Per reinstallare la versione che stai usando ora, dalla cartella di Alveare:</p>
            <Command>{`npm run motore:aggiorna -- "vendor/alveare-motore-${ENGINE_VERSION}.tgz"`}</Command>
            <p className="text-slate-400">Dopo il ripristino, verifica test e build e riavvia il server.</p>
          </section>
          <details className="border-t border-slate-700 pt-4 text-xs text-slate-400">
            <summary className="cursor-pointer">Impronta del motore in uso</summary>
            <code className="mt-2 block break-all">{ENGINE_HASH}</code>
            <p className="mt-2">Versione e impronta permettono di confrontare il motore locale con quello pubblicato.</p>
          </details>
        </div>
      </dialog>
    </div>
  );
}
