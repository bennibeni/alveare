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

| Comando                       | Cosa fa                                                                 |
| ----------------------------- | ----------------------------------------------------------------------- |
| `npm run dev`                 | server di sviluppo                                                      |
| `npm run build` / `npm start` | build di produzione e avvio                                             |
| `npm run lint`                | ESLint (regole Next.js)                                                 |
| `npm test`                    | test unitari (Vitest): griglia, pezzi, strategia, regressioni           |
| `npm run test:e2e`            | test nel browser (Playwright): avvia da solo build e server             |
| `npm run sim -- …`            | simulatore: fa giocare l'autogioco e riassume i risultati               |
| `npm run audit -- …`          | controllo di congruenza di suggerimenti e giudizi su posizioni simulate |

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
le mosse legali. Il giudizio usa **lo stesso metro del suggerimento**: l’etichetta dipende solo
dai voti delle mosse valutate e dal rischio di blocco. Così una mossa con un voto più alto e
non più rischio non riceve mai un giudizio peggiore di un’altra, e il suggerimento non viene
mai criticato. I conti sono in `game/moveJudgment.js`.

- La scala di confronto è il massimo fra 1, valore assoluto del massimo e della mediana;
  in questo modo anche voti zero o negativi hanno un confronto definito.
- Alternative entro ±5% della scala sono comparabili; «nettamente migliori» sono quelle con un
  vantaggio oltre il 20% (della scala, o del valore della mossa se più grande). Il rango usa i
  punteggi effettivi con una piccola tolleranza numerica per gli ex aequo.
- Il rischio è la probabilità di blocco subito dopo i pezzi noti. In Esperto: il pezzo
  ignoto che segue i tre della coda non entra. In normale: dopo la mossa e la migliore
  seconda mossa, il pezzo noto rimasto non entra e nemmeno i due estratti al posto di quelli
  giocati (probabilità per un pezzo, al quadrato).

Le etichette, nell’ordine in cui si controllano:

| Etichetta                           | Quando                                                                                                                                                                 |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mossa obbligata                     | era l’unica mossa legale                                                                                                                                               |
| Mossa pessima / cattiva / rischiosa | rischio di blocco più alto di almeno 20 punti percentuali rispetto all’alternativa più sicura (pessima: blocco con i pezzi noti, o rischio ≥ 80%; cattiva: ≥ 50%)      |
| Occasione persa                     | un’alternativa vale almeno il 50% della scala in più, oppure distacco ≥ 30% con almeno due alternative nettamente migliori (e almeno due terzi delle valutate)         |
| Ottima mossa / Ottima scoperta      | prima, almeno metà delle alternative inferiori, vantaggio sulla mediana ≥ 10%, rischio sotto il 20% («scoperta»: mossa che il suggerimento non aveva fra le candidate) |
| Una mossa vale l’altra              | tutte le alternative sono comparabili                                                                                                                                  |
| Migliore disponibile                | prima, ma con rischio di blocco ≥ 20%                                                                                                                                  |
| Buona mossa                         | distacco ≤ 5% e rischio sotto il 20%                                                                                                                                   |
| Mossa giocabile                     | distacco ≤ 10%                                                                                                                                                         |
| Mossa discreta                      | la maggioranza delle alternative non è migliore, oppure distacco < 20%                                                                                                 |
| Mossa migliorabile                  | tutti gli altri casi                                                                                                                                                   |

Le osservazioni sulla posizione compaiono come **note** nei dettagli, senza cambiare l’etichetta:
linea eliminata aumentando lo spazio, incastro pulito, pezzo da una cella consumato senza un
netto miglioramento. Quest’ultima compare solo se un’alternativa con un voto migliore conservava
il punto (o lo collocava eliminando linee): penalizzare nella strategia il consumo del punto senza
linee, provato con 30 e 100 su 60 partite, non migliora (durata media 882 e 865 contro 904).
Prima queste osservazioni potevano scavalcare il voto: un incastro o una linea eliminata
diventavano «Buona mossa» anche con alternative nettamente migliori, e il punto consumato
diventava «Mossa cattiva» anche quando era il suggerimento. Ora che la strategia premia già le
linee svuotate e quelle preparate, quelle eccezioni producevano giudizi incoerenti.

`npm run audit` controlla la congruenza su posizioni simulate (in parte con mosse casuali): in
ogni posizione giudica le candidate e alcune mosse casuali e verifica che suggerimento, etichetta,
motivazione, note e mosse nettamente migliori siano coerenti con i dati. Una versione corta gira
fra i test (`tests/unit/coherence.test.js`).

```bash
npm run audit -- --mode normal --positions 400   # da 2 a 5 minuti, secondo il computer
npm run audit -- --mode expert --positions 150
```

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
è credibile solo su molte partite.

### Modalità normale

60 partite di taratura (semi `7000`, `9000`, `11000`, 20 ciascuno, al massimo 1.000 pezzi):

| Strategia                                              | Durata media | Durata mediana | Punti medi | Punti per pezzo | Arrivate a 1.000 |
| ------------------------------------------------------ | ------------ | -------------- | ---------- | --------------- | ---------------- |
| originale (6 candidate, senza rischio)                 | 286          | 219            | 2.896      | 10,13           | 0                |
| 6 candidate, rischio 400                               | 373          | 301            | 3.834      | 10,29           | 5                |
| 20 candidate, rischio 1.600                            | 433          | 357            | 5.226      | 12,06           | 10               |
| + spazio per il pezzo rimasto                          | 486          | 349            | 5.938      | 12,21           | 14               |
| + spazio per rombo e ferro di cavallo                  | 670          | 735            | 8.188      | 12,23           | 23               |
| + premio per le linee svuotate                         | 852          | 1.000          | 8.982      | 10,54           | 43               |
| + premio per le linee chiudibili                       | 904          | 1.000          | 9.591      | 10,61           | 46               |
| **attuale: + tre pezzi noti con la griglia affollata** | **966**      | **1.000**      | **10.312** | **10,68**       | **56**           |

Verifica su 140 partite mai usate per la taratura (semi da `13000` a `25000`):

| Strategia                                                            | Durata media | Durata mediana | Arrivate a 1.000 | Meglio / peggio |
| -------------------------------------------------------------------- | ------------ | -------------- | ---------------- | --------------- |
| + spazio per il pezzo rimasto                                        | 479          | 416            | 24               | —               |
| + spazio per rombo e ferro di cavallo                                | 604          | 653            | 44               | 73 / 58         |
| + premio per le linee svuotate                                       | 832          | 1.000          | 96               | 87 / 28         |
| + premio per le linee chiudibili                                     | 879          | 1.000          | 110              | 86 / 19         |
| **attuale: + tre pezzi noti con la griglia affollata** (100 partite) | **952**      | **1.000**      | **88 su 100**    | **19 / 11**     |

«Meglio / peggio» confronta ogni riga con la precedente; per i due premi per le linee, con la versione
senza (rapporto delle durate 1,77, intervallo al 95% 1,47–2,13). Il premio per le linee chiudibili,
aggiunto al premio per le linee svuotate, vale circa +11% su 200 partite (55 meglio, 38 peggio; intervallo
0,98–1,25: credibile ma non certo). Con tre quarti delle partite fermate al limite dei 1.000 pezzi, i
guadagni sono sottostimati.

I tre pezzi noti sono stati verificati su 100 delle 140 partite nuove (semi `13000`, `15000`, `17000`,
`21000`, `23000`): partite perse da 19 a 12, meglio in 19 e peggio in 11 (rapporto delle durate 1,12,
intervallo 0,98–1,29). Con le 60 partite di taratura (perse da 14 a 4, meglio 13, peggio 4): 32 meglio e
15 peggio su 160 partite, test dei segni p ≈ 0,02. Sulle 30 partite del seme `19000`, rimaste fuori dalla
verifica interrotta, le partite perse sono passate da 9 a 1.

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
- **Premio per le linee svuotate: 180 × linee × affollamento.** Affollamento = celle occupate / 61,
  prima della mossa. A tabellone vuoto conviene rimandare lo svuotamento per fare combo; a tabellone
  pieno conviene liberare spazio subito. Provati 60, 180, 240, 300, 500 (durata media 729, 852, 826, 777, 770) e 180 solo sotto le 40 celle libere (747). Si fanno meno combo (punti per pezzo da 12,2 a 10,5),
  ma le partite durano molto di più e i punti per partita salgono.
- **Premio per le linee chiudibili: 100 × linee chiudibili × affollamento,** dopo le due mosse. Linee
  chiudibili = numero atteso di linee (a cui mancano da 1 a 3 celle) che un pezzo estratto a caso può
  chiudere con una sola mossa: premia le mosse che preparano uno svuotamento. Da solo rende poco (100 e
  300: 705 e 753); insieme al premio per le linee svuotate, 100 rende più di 300 (904 e 830). Contare
  le linee che può chiudere il pezzo rimasto nel vassoio non ha dato miglioramenti (675).
- **Tre pezzi noti con la griglia affollata (meno di 36 celle libere).** Su 26.000 mosse simulate il
  rischio di perdere entro 10 mosse è ≤ 0,1% con almeno 40 celle libere, 0,4% con 36–39, 1,8% con
  32–35, 5% con 28–31, 12% con 24–27. Sotto le 36 la strategia prova, per ogni candidata, le 5 migliori
  seconde mosse e per ognuna le 3 migliori terze mosse con il pezzo rimasto; il tabellone finale si
  giudica come quello dopo la seconda mossa, con penalità 1.000 se il terzo pezzo non entra. Sono meno
  di una mossa su dieci, quindi il tempo per mossa cresce poco. Provati: soglia 40 (952, 7 perse),
  ricerca più larga 8 × 5 (941, 6 perse), penalità 300 (941, 6 perse) e 1.000 (966, 4 perse).
- **Provati e scartati:** premio per le celle libere dopo le due mosse (854 e 811), linee della
  seconda mossa premiate con l'affollamento (726 e 612), premio esponenziale con le celle libere al
  posto di quello lineare (851 e 850). Tenere la griglia vuota non è un obiettivo in sé, e premiare lo
  svuotamento alla mossa successiva fa rimandare.
- **Classificazione dei vassoi** (320 partite, 205.000 mosse; sconfitte entro 10 mosse osservate contro
  attese, con la griglia affollata): con il punto nel vassoio il rischio è molto più basso di quanto la
  strategia stimi (punto tenuto: 0 sconfitte contro 4,8 attese; coppie tenute con il punto: rapporto
  0,15–0,6), e due ferri di cavallo tenuti sono più pericolosi (rapporto 1,3–1,5). Trasformati in correzioni
  della strategia con la griglia affollata (meno di 40 celle libere), questi segnali **peggiorano**: penalità
  300 per consumare l'ultimo punto, 9 partite perse su 60 contro 4; penalità 100 per tenere due pezzi
  grandi uguali, 9 contro 4. Sull'archivio delle posizioni affollate la seconda sembrava utile (226 posizioni
  salvate contro 221): la misura sull'archivio guarda solo 20 mosse e posizioni scelte con la strategia
  attuale, quindi va sempre confermata sulle partite intere.
- **Celle vuote che solo il punto può riempire.** Con la griglia affollata l'83% delle posizioni ha almeno
  un gruppo isolato di 1–3 celle vuote (3,3 celle in media) e in media 4,6 celle che nessun pezzo da 4 può
  coprire. Penalità per cella nei gruppi di 1–3: 5 e 15 (perse su 60: 4 e 10, contro 4); penalità per cella
  non coperta da nessun pezzo da 4 (calcolo veloce con le posizioni precalcolate, 43 µs per tabellone): 10 e
  20 (8 e 4). Nessun miglioramento: buchi, celle isolate, pezzi che entrano e sguardo a tre pezzi coprono già
  questa debolezza. Sull'archivio la penalità 10 sembrava utile (229 posizioni salvate contro 221).
- **Quanto si può ancora misurare.** La strategia attuale perde 4 partite su 60 di taratura (al massimo
  1.000 pezzi): per riconoscere una riduzione di un terzo delle sconfitte servirebbero centinaia di partite,
  oppure partite più lunghe.

### Modalità Esperto

| Partite             | Strategia                                       | Durata media | Durata mediana | Punti medi | Punti per pezzo |
| ------------------- | ----------------------------------------------- | ------------ | -------------- | ---------- | --------------- |
| 50, max 3.000 pezzi | precedente (un fascio per tutte le prime mosse) | 369          | 310            | 3.434      | 9,30            |
| 50, max 3.000 pezzi | **attuale** (un fascio per prima mossa)         | 400          | 266            | 4.306      | 10,76           |

Semi `7000` (20) e `13000` (30). Con un fascio per ogni prima mossa la ricerca trova più sequenze che
svuotano linee, e con la penalità per il pezzo ignoto a 400 le partite si accorciavano: è passata a
1.200 (su 30 partite: 400 → durata media 310, 800 → 378, 1.200 → 434, 1.600 → 428; precedente 402).

### Archivio di posizioni affollate

`data/archivio-affollate.json` raccoglie 260 posizioni della modalità normale con meno di 36 celle
libere e un esito che **dipende dalla mossa scelta**: fra le 4 migliori mosse iniziali della strategia,
con gli stessi pezzi futuri, qualcuna arriva a 20 mosse e qualcuna si blocca prima. Serve per misurare
in poco tempo, e proprio dove si decidono le partite, se una strategia sceglie meglio.

- **Fonti:** partite della strategia attuale (27 posizioni), della strategia attuale con una mossa su
  tre casuale (115) e della strategia prima dei premi per le linee (118). Semi diversi da quelli di
  taratura e verifica delle partite intere.
- **Taratura e verifica:** divise per partita di origine, una partita su tre in verifica (172 e 88).
- **Quante servono:** su 3.900 posizioni affollate solo il 7% era decisiva; l'86% si salvava con
  qualunque delle migliori mosse, il 7% si perdeva comunque.
- **Riferimento:** con la strategia attuale (commit indicato in `strategyCommit`) la mossa suggerita
  si salva in 221 posizioni su 260. Gli esiti salvati dipendono dalla strategia usata per continuare.

Ogni posizione ha le celle occupate (coordinate e numeri del giudizio), i tre pezzi del vassoio, la
combo, il seme dei pezzi futuri (`futureSeed`) e l'esito delle mosse iniziali provate. Per rigenerarlo
o ingrandirlo: `scripts/crowded-archive.mjs` (istruzioni in testa al file).

### Come misurare

Per un controllo servono decine di partite: con 6 partite il risultato dipende soprattutto da quali
pezzi capitano. Succede anche ora: sui 6 semi del comando rapido la versione con i tre pezzi noti perde due
partite che la versione precedente portava a 1.000, ma su 160 partite ne perde la metà.

```bash
npm run sim -- --mode normal --games 30 --seed 19000   # attuale: media 981, 29 a 1.000, 1 persa (circa 2–3 minuti)
npm run sim -- --mode normal --games 6 --max 1000      # prova veloce, seme 7000: 1000, 299, 1000, 1000, 1000, 860
```

Per confrontare due versioni, lancia lo stesso comando prima e dopo la modifica: con lo stesso seme le
partite sono appaiate. I test di regressione in `tests/unit/strategy.test.js` bloccano il comportamento
attuale: se si cambia la strategia di proposito, si aggiornano i valori attesi. Sono fotografie di poche
partite, non misure di qualità (`pairedCompare` in `scripts/sim-lib.mjs` confronta partita per partita).

**Velocità.** I controlli «il pezzo entra qui?» usano maschere di bit: le 61 celle stanno in due
interi da 32 bit e ogni posizione di ogni pezzo è una maschera precalcolata (`HexGrid.js`). Lo
stesso vale per linee chiudibili, buchi e linee quasi piene in `strategy.js`. Le partite sono
identiche a prima, mossa per mossa (`tests/unit/hexgrid-masks.test.js` confronta le maschere con il
controllo cella per cella); una mossa costa circa 5 ms invece di 42 in modalità normale e 7 invece
di 50 in Esperto. La prova veloce qui sopra passa da circa 4 minuti a meno di 30 secondi.

## Nota

Alveare è un progetto indipendente: regole, pezzi, strategia dell'autogioco e grafica sono stati realizzati da
zero. «Hex FRVR» è citato solo come fonte d'ispirazione.
