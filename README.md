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

L’analisi delle mosse contiene il pulsante **Calcola indicatori di prosecuzione**.
Mostra la probabilità esatta che un pezzo estratto non entri sulla griglia attuale
(pesata per ogni orientamento), e stime del blocco prima di completare 3 e 6 mosse.
Le stime usano 128 simulazioni con seme fisso e una politica euristica di sopravvivenza:
il futuro viene estratto solo dopo ogni scelta, con le regole della modalità attiva
e cancellazione delle linee. Non sono probabilità con gioco ottimo né previsioni calibrate
sul giocatore. Gli intervalli Wilson al 95% descrivono solo l’incertezza campionaria.

Il margine riporta le candidate con rischio stimato entro 6 mosse non superiore al 25%,
su un massimo di 8 candidate approfondite (64 simulazioni ciascuna, includendo sempre
la mossa giocata). Il totale delle mosse legali resta distinto: il campione non è esaustivo.
Sono indicate anche le candidate sotto soglia con tutto l’intervallo di confidenza.
I parametri sono in `game/positionRisk.js`. Il calcolo avviene in un Web Worker su richiesta;
la copia del giudizio lo esegue o riutilizza il risultato e lo include nel log diagnostico.
I giudizi non vengono ricalibrati automaticamente su queste stime sperimentali.

L’accordion **Analisi delle mosse**, sopra le istruzioni, è disponibile fuori dall’autogioco.
Mostra il numero di mosse legali e le candidate approfondite dalla strategia attuale, ordinate
con il suggerimento in testa: fino a 6 in modalità normale; in Esperto fino a 10 posizioni del
primo pezzo, ciascuna approfondita con la propria ricerca e mostrata con il punteggio della sua
migliore sequenza.
Il punteggio è quello della strategia, non i punti aggiunti alla partita. L’analisi viene calcolata
solo aprendo l’accordion, in un Web Worker (`game/strategy.worker.js`): mentre calcola il riquadro
mostra «Calcolo delle mosse…» e il gioco resta fluido. Per disabilitarlo da codice, impostare `SHOW_MOVE_ANALYSIS = false`
in `game/HexBlockPuzzle.jsx`.

Dopo una mossa manuale l’accordion mostra il confronto sulla posizione precedente:
la mossa giocata è evidenziata, oppure aggiunta in fondo e valutata con gli stessi criteri
se non era fra le candidate. La valutazione usa solo i pezzi noti prima della mossa.
I pulsanti «Ultima mossa» e «Posizione corrente» permettono di passare dal confronto
alle nuove possibilità. Il suggerimento e la sua ricerca restano invariati.

Il **toast di valutazione** compare dopo ogni mossa manuale, anche con l’accordion chiuso.
Analisi e giudizio della mossa si calcolano nello stesso worker, quindi il toast arriva
qualche istante dopo la mossa senza bloccare l’interfaccia; il suggerimento e l’autogioco
restano invece sul thread principale.
Su desktop occupa una colonna riservata a destra; sotto 1100 px resta nel flusso sotto
il tabellone, prima degli accordion. Rimane leggibile fino alla mossa successiva o alla
chiusura e non impila notifiche. `SHOW_MOVE_FEEDBACK` abilita/disabilita questa funzione
indipendentemente dall’accordion. Durante l’autogioco non valuta né suona.
Tutti i giudizi mostrano inizialmente solo il titolo, cliccabile per aprire i dettagli.
Ogni nuova mossa parte con i dettagli chiusi, anche quando il giudizio è positivo.

Il rapporto mostrato è `voto della mossa / massimo fra le mosse valutate`, inclusa
la mossa aggiunta al confronto: non è una percentuale né il massimo globale di tutte
le mosse legali. Il giudizio è euristico e considera distacco dal massimo, rango con
ex aequo, mediana, quante alternative sono migliori/comparabili/inferiori e rischio
di prosecuzione. I conti sono in `game/moveJudgment.js`:

- La scala di confronto è il massimo fra 1, valore assoluto del massimo e della mediana;
  in questo modo anche voti zero o negativi hanno un confronto definito.
- Alternative entro ±5% della scala sono comparabili. Il rango usa invece i punteggi
  effettivi con una piccola tolleranza numerica per gli ex aequo.
- Una prima scelta è notevole se almeno metà delle alternative è inferiore, il vantaggio
  sulla mediana raggiunge il 10% della scala e non emerge un rischio elevato di prosecuzione.
- Una scelta è segnalata negativamente se perde almeno il 30% della scala, è nella metà
  inferiore e almeno metà delle alternative è nettamente migliore. Conta anche la perdita
  di una prosecuzione nota o un aumento del rischio stimato di almeno 20 punti percentuali
  rispetto alla migliore, insieme a un distacco significativo dal massimo.
- Il rischio è la probabilità di blocco subito dopo i pezzi noti. In Esperto: il pezzo
  ignoto che segue i tre della coda non entra. In normale: dopo la mossa e la migliore
  seconda mossa, il pezzo noto rimasto non entra e nemmeno i due estratti al posto di quelli
  giocati (probabilità per un pezzo, al quadrato). È diverso dalla penalità usata dal
  suggerimento normale, che considera un solo pezzo nuovo.
- Scelte obbligate, campioni di una sola candidata e alternative tutte comparabili non
  producono segnali speciali. Si tratta di un confronto fra le candidate approfondite,
  non di una valutazione esaustiva o appresa statisticamente.

Il **beep è disattivato inizialmente** e si può attivare dal riquadro. Produce due brevi
toni ascendenti/discendenti solo per le mosse evidenziate positivamente/negativamente;
aprire guide, annullare o riaprire un’analisi non ripete un suono già valutato.

```
app/                  layout, pagina, stili globali, icona
game/
  HexBlockPuzzle.jsx  interfaccia: menu, gioco, vassoio, voli, autogioco, avvisi
  HexGrid.js          tabellone in coordinate assiali: celle, vicini, 27 linee, mosse
  pieces.js           i 25 pezzi (6 forme), colori, estrazione casuale (anche con seme)
  strategy.js         suggerimenti: valutazione del tabellone, sguardo avanti, beam search (Esperto)
  strategy.worker.js  analisi e giudizio delle mosse fuori dal thread dell’interfaccia
  strategyClient.js   richieste al worker, con cache per posizione
  moveJudgment.js     giudizio della mossa giocata
  positionRisk.js     indicatori di prosecuzione (simulazioni nel worker positionRisk.worker.js)
  GuideNormal.jsx     pagina «Suggerimenti · normale»
  GuideExpert.jsx     pagina «Suggerimenti · Esperto»
  GuideKit.jsx        miniature del tabellone e componenti comuni delle guide
scripts/              motore di simulazione e simulatore da riga di comando
tests/unit/           test Vitest
tests/e2e/            test Playwright
```

## Risultati di riferimento (simulatore)

Confronto appaiato (stessi pezzi per le due strategie) fra la versione precedente e quella attuale.
Le partite hanno durate molto variabili, da poche decine a oltre mille pezzi: le differenze fra le
medie non sono statisticamente significative con questo numero di partite.

| Modalità | Partite | Strategia | Durata media | Durata mediana | Punti medi | Punti per pezzo |
|---|---|---|---|---|---|---|
| normale | 60, max 1.000 pezzi | precedente | 311 | 266 | 3.155 | 10,15 |
| normale | 60, max 1.000 pezzi | **attuale** (+ rischio del pezzo in arrivo) | 382 | 307 | 3.929 | 10,29 |
| Esperto | 50, max 3.000 pezzi | precedente (un fascio per tutte le prime mosse) | 369 | 310 | 3.434 | 9,30 |
| Esperto | 50, max 3.000 pezzi | **attuale** (un fascio per prima mossa) | 400 | 266 | 4.306 | 10,76 |

Semi usati: normale `--seed 7000` (12 partite), `9000` e `11000` (24 ciascuno); Esperto `7000` (20) e
`13000` (30). Nessuna strategia è immortale: anche in modalità normale tutte le partite finiscono,
tranne 5 su 60 interrotte al limite dei 1.000 pezzi.

Con la nuova ricerca Esperto la penalità per il pezzo ignoto è passata da 400 a 1.200: con un fascio
per ogni prima mossa la ricerca trova più sequenze che svuotano linee, e con la penalità a 400 le partite
si accorciavano (durata media 309 sulle stesse 50 partite). Su 30 partite: 400 → durata media 310,
800 → 378, 1.200 → 434, 1.600 → 428 (precedente: 402).

Comando rapido (circa 20 secondi):

```bash
npm run sim -- --mode normal --games 6 --max 1000   # seme 7000: mediana 301, media 458, 1 partita a 1.000
```

I test di regressione in `tests/unit/strategy.test.js` bloccano il comportamento attuale della strategia: se la
si modifica di proposito, si misurano i nuovi risultati con `npm run sim` e si aggiornano i valori attesi.
Sono fotografie di poche partite, non misure di qualità: per confrontare due strategie servono molte
partite appaiate (`pairedCompare` in `scripts/sim-lib.mjs`).

## Nota

Alveare è un progetto indipendente: regole, pezzi, strategia dell'autogioco e grafica sono stati realizzati da
zero. «Hex FRVR» è citato solo come fonte d'ispirazione.
