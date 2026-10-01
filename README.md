# Alveare

Puzzle a esagoni **ispirato a Hex FRVR**: si appoggiano pezzi su un tabellone esagonale di 61 celle e si
svuotano le linee complete nelle tre direzioni. Include un autogioco, una modalità **Esperto** a coda e due
pagine che spiegano nel dettaglio come il computer sceglie le mosse.

Next.js (App Router) · React 19 · Tailwind CSS 4 · react-toastify.

## Avvio

```bash
npm install
npm run dev          # http://localhost:3000
```

## Comandi

| Comando | Cosa fa |
|---|---|
| `npm run dev` | server di sviluppo |
| `npm run build` / `npm start` | build di produzione e avvio |
| `npm run lint` | ESLint (regole Next.js) |
| `npm test` | test unitari (Vitest): griglia, pezzi, strategia, regressioni |
| `npm run test:e2e` | test nel browser (Playwright): avvia da solo build e server |
| `npm run sim -- …` | simulatore: fa giocare l'autogioco e riassume i risultati |

Per i test nel browser serve Chromium di Playwright (`npx playwright install chromium`), oppure un Chromium già
installato indicato con `PW_CHROMIUM=/percorso/chrome`.

### Simulatore

```bash
npm run sim -- --mode expert --games 100          # 100 partite in modalità Esperto
npm run sim -- --mode normal --games 20 --max 400 # 20 partite normali da 400 pezzi
npm run sim -- --mode expert --seed 123 --json risultati.json
```

Ogni partita usa un seme: con gli stessi semi due strategie ricevono **esattamente gli stessi pezzi**, quindi si
possono confrontare partita per partita (`pairedCompare` in `scripts/sim-lib.mjs`).

## Struttura

```
app/                  layout, pagina, stili globali, icona
game/
  HexBlockPuzzle.jsx  interfaccia: menu, gioco, vassoio, voli, autogioco, avvisi
  HexGrid.js          tabellone in coordinate assiali: celle, vicini, 27 linee, mosse
  pieces.js           i 25 pezzi (6 forme), colori, estrazione casuale (anche con seme)
  strategy.js         suggerimenti: valutazione del tabellone, sguardo avanti, beam search (Esperto)
  GuideNormal.jsx     pagina «Suggerimenti · normale»
  GuideExpert.jsx     pagina «Suggerimenti · Esperto»
  GuideKit.jsx        miniature del tabellone e componenti comuni delle guide
scripts/              motore di simulazione e simulatore da riga di comando
tests/unit/           test Vitest
tests/e2e/            test Playwright
```

## Risultati di riferimento (simulatore)

| Modalità | Partite | Durata | Punti |
|---|---|---|---|
| normale | 6 × 1.000 pezzi | nessuna partita persa | 10,4 punti per pezzo |
| Esperto | 100 | mediana 245 pezzi, media 309, max 1.587 | 2.862 punti medi |

I test di regressione in `tests/unit/strategy.test.js` bloccano il comportamento attuale della strategia: se la
si modifica di proposito, si misurano i nuovi risultati con `npm run sim` e si aggiornano i valori attesi.

## Nota

Alveare è un progetto indipendente: regole, pezzi, strategia dell'autogioco e grafica sono stati realizzati da
zero. «Hex FRVR» è citato solo come fonte d'ispirazione.
