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
con il suggerimento in testa: in modalità normale le 6 migliori per totale fra le 20 approfondite;
in Esperto fino a 10 posizioni del
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
  pieceAvailability.js probabilità esatta che il prossimo pezzo estratto non entri (usata da strategia e indicatori)
  positionRisk.js     indicatori di prosecuzione (simulazioni nel worker positionRisk.worker.js)
  GuideNormal.jsx     pagina «Suggerimenti · normale»
  GuideExpert.jsx     pagina «Suggerimenti · Esperto»
  GuideKit.jsx        miniature del tabellone e componenti comuni delle guide
scripts/              motore di simulazione e simulatore da riga di comando
tests/unit/           test Vitest
tests/e2e/            test Playwright
```

## Risultati di riferimento (simulatore)

Confronto appaiato: con lo stesso seme le strategie ricevono gli stessi pezzi nello stesso ordine.
Le partite hanno durate molto variabili, da poche decine a oltre mille pezzi, quindi una differenza
è credibile solo su molte partite; il dato più stabile sono i punti per pezzo.

### Modalità normale

60 partite di taratura (semi `7000`, `9000`, `11000`, 20 ciascuno, al massimo 1.000 pezzi):

| Strategia | Durata media | Durata mediana | Punti medi | Punti per pezzo | Arrivate a 1.000 |
|---|---|---|---|---|---|
| originale (6 candidate, senza rischio) | 286 | 219 | 2.896 | 10,13 | 0 |
| 6 candidate, rischio 400 | 373 | 301 | 3.834 | 10,29 | 5 |
| 20 candidate, rischio 1.600 | 433 | 357 | 5.226 | 12,06 | 10 |
| + spazio per il pezzo rimasto | 486 | 349 | 5.938 | 12,21 | 14 |
| **attuale: + spazio per rombo e ferro di cavallo** | **670** | **735** | **8.188** | **12,23** | **23** |

Verifica su 140 partite mai usate per la taratura (semi da `13000` a `25000`):

| Strategia | Durata media | Durata mediana | Arrivate a 1.000 | Meglio / peggio |
|---|---|---|---|---|
| + spazio per il pezzo rimasto | 479 | 416 | 24 | — |
| **attuale** | **604** | **653** | **44** | **73 / 58** |

Rispetto all'originale, sulle 60 partite di taratura la versione attuale dura di più in 48 partite e di
meno in 12. Con un terzo delle partite fermate al limite dei 1.000 pezzi, i guadagni sono sottostimati.

Che cosa fa il suggerimento in modalità normale, e perché:

- **20 candidate invece di 6.** Il voto a un passo, usato per sceglierle, prevede male il totale finale:
  con 6 il suggerimento era il migliore secondo il suo stesso criterio solo nel 59% delle posizioni
  (87% con 20). Analisi e giudizio mostrano e confrontano le 6 migliori per totale.
- **Rischio del pezzo in arrivo: 1.600 × probabilità** che un pezzo estratto a caso non entri dopo le
  due mosse (provati 400, 800, 1.600, 2.400, 3.200: durata media 364, 380, 433, 396, 371).
- **Spazio per il pezzo che resta nel vassoio: 200 × (1 − posizioni / 6).** Su 26.000 posizioni
  simulate, se i due pezzi tenuti hanno al massimo 3 posizioni la partita si perde entro 5 mosse nel
  1–2% dei casi, contro lo 0,1% con almeno 4; con due pezzi identici (stesso orientamento, non punti)
  senza posizioni si perde nel 55% dei casi. Su 200 partite: durata media 420 → 481 (113 meglio, 83 peggio).
- **Spazio per rombo e ferro di cavallo: 1.000 × (1 − spazio).** Nel vassoio a fine partita queste due
  forme sono il 31–32% dei pezzi, contro il 22% con cui escono (98 partite perse): sono compatte e
  servono buchi «a blocco», mentre alla fine restano in media 25 celle libere ma sparpagliate.
  Spazio = media, pesata con le probabilità di uscita, di min(posizioni, 6) / 6 sui loro orientamenti.
  Provati 200, 500, 1.000, 2.000 (durata media 557, 554, 670, 610) e la stessa misura su tutti i
  pezzi (300 e 1.000: 599 e 629).

### Modalità Esperto

| Partite | Strategia | Durata media | Durata mediana | Punti medi | Punti per pezzo |
|---|---|---|---|---|---|
| 50, max 3.000 pezzi | precedente (un fascio per tutte le prime mosse) | 369 | 310 | 3.434 | 9,30 |
| 50, max 3.000 pezzi | **attuale** (un fascio per prima mossa) | 400 | 266 | 4.306 | 10,76 |

Semi `7000` (20) e `13000` (30). Con un fascio per ogni prima mossa la ricerca trova più sequenze che
svuotano linee, e con la penalità per il pezzo ignoto a 400 le partite si accorciavano: è passata a
1.200 (su 30 partite: 400 → durata media 310, 800 → 378, 1.200 → 434, 1.600 → 428; precedente 402).

### Come misurare

Per un controllo servono decine di partite: con 6 partite il risultato dipende soprattutto da quali
pezzi capitano (sui 6 semi del vecchio comando rapido una versione migliore su 200 partite andava peggio).

```bash
npm run sim -- --mode normal --games 30 --seed 19000   # attuale: media 536, mediana 481, 9 a 1.000 (circa 3 minuti)
npm run sim -- --mode normal --games 6 --max 1000      # prova veloce, seme 7000: 613, 1000, 266, 83, 627, 287
```

Per confrontare due versioni, lancia lo stesso comando prima e dopo la modifica: con lo stesso seme le
partite sono appaiate. I test di regressione in `tests/unit/strategy.test.js` bloccano il comportamento
attuale: se si cambia la strategia di proposito, si aggiornano i valori attesi. Sono fotografie di poche
partite, non misure di qualità (`pairedCompare` in `scripts/sim-lib.mjs` confronta partita per partita).

## Nota

Alveare è un progetto indipendente: regole, pezzi, strategia dell'autogioco e grafica sono stati realizzati da
zero. «Hex FRVR» è citato solo come fonte d'ispirazione.
