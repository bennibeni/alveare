# Dati

File di dati usati dagli script di misura, dai test e dall'autopsia. Nessuno è usato dalla pagina
del gioco.

## `archivio-affollate.json`

**Che cos'è.** 260 posizioni della modalità normale, affollate e decisive: ognuna ha meno di 36
celle libere e un esito che dipende dalla mossa scelta. Fra le 4 migliori mosse iniziali della
strategia, con gli stessi pezzi futuri, qualcuna arriva a 20 mosse e qualcuna si blocca prima.
Su 3.900 posizioni affollate solo il 7% era così. Serve a misurare in pochi minuti, proprio dove si
decidono le partite, se una strategia sceglie meglio.

**Da dove viene.** `scripts/crowded-archive.mjs` (istruzioni in testa al file), con semi diversi da
quelli di taratura e verifica delle partite intere. Fonti (`sources`): strategia del commit
`strategyCommit` (27 posizioni), la stessa con una mossa su tre a caso (115), strategia precedente ai
premi per le linee (118). Parametri in `settings`: meno di `free` = 36 celle libere, `candidates` = 4
mosse iniziali provate, `horizon` = 20 mosse, al massimo `perGame` = 12 posizioni per partita.

**Struttura.**

- `description`, `strategyCommit` (5c0a570), `created`, `settings`, `sources`, `format`
  (descrizione dei campi)
- `counts`: totale 260, `taratura` 172, `verifica` 88 (divise per partita di origine: una partita
  su tre in verifica)
- `positions`: una voce per posizione
  - `id` (fonte-seme-mossa), `set` (taratura o verifica), `source`, `gameSeed`, `gameLost`, `move`
  - `free` celle libere, `streak` combo in corso
  - `tray`: id dei tre pezzi del vassoio (`game/pieces.js`)
  - `cells`: celle occupate `[q, r]` in coordinate assiali; `cellNumbers`: le stesse con la
    numerazione del giudizio (1–61, per righe dall'alto)
  - `futureSeed`: seme dei pezzi estratti dopo ogni mossa (`seededRandom(futureSeed)`, un'estrazione
    per mossa con `replacePiece`)
  - `outcomes`: per ognuna delle 4 mosse iniziali (`rank`, `idx`, `q`, `r`, `piece`) le mosse giocate
    prima del blocco (`moves`, 20 = arrivata alla fine)
  - `survived`: quante delle 4 mosse arrivano a 20

**Riferimento.** Con la strategia di `strategyCommit` la mossa suggerita si salva in 221 posizioni su 260. Gli esiti salvati dipendono dalla strategia usata per continuare.

**Chi lo usa.** `tests/unit/archive.test.js` e la pagina di laboratorio R49 di Next13 per confrontare
varianti della strategia. Le misure sull'archivio guardano solo 20 mosse e posizioni scelte con una
strategia data: vanno sempre confermate sulle partite intere (`scripts/pericolo.mjs`).

## `autopsia/trappole-100000.json`

**Che cos'è.** Le sconfitte dell'autogioco: tutte le copie dello sdoppiamento che si sono bloccate in
400 partite della modalità normale. Contiene quanto serve a rigiocare ogni copia esattamente, mossa
per mossa.

**Da dove viene.** `scripts/autopsia/raccogli.mjs --games 400 --seed 100000 --k 8`: semi delle
partite da 100000 a passi di 97, al massimo 1.000 pezzi. Ogni volta che una partita scende sotto 32
celle libere (dopo essere stata ad almeno 40) la posizione è giocata altre 8 volte con pezzi futuri
diversi, finché torna a 40 celle libere o si blocca. Semi delle copie uguali a `scripts/pericolo.mjs`.
Strategia del commit fa730f6.

**Struttura.**

- `k` (8 copie per ingresso in pericolo), `max` (1.000 pezzi)
- `games`: una voce per partita
  - `seed`, `pieces` (pezzi giocati), `lost`, `entries` (ingressi in pericolo), `copies` (copie
    giocate)
  - `traps`: le copie bloccate
    - `seed` e `pezzo`: partita e mossa dell'ingresso in pericolo; `libere`: celle libere lì
    - `k`: numero della copia; `bseed`: seme dei suoi pezzi futuri (`seededRandom(bseed)`, un pezzo
      per mossa)
    - `start`: posizione d'ingresso: `cells` (chiavi `"q,r"` delle celle occupate), `tray` (id dei
      pezzi), `streak`
    - `moves`: le mosse dell'autogioco fino al blocco, `[slot, q, r]`

**Numeri.** 395.358 pezzi, 5.360 ingressi in pericolo, 42.880 copie, 59 copie bloccate da 24
ingressi, 10 partite perse: tasso 0,019 sconfitte ogni 1000 pezzi. Con l'oracolo chiaroveggente
(`scripts/autopsia/autopsia.mjs`): 44 copie inevitabili già all'ingresso, 15 con un passo fatale
(vedi «Autopsia delle sconfitte» nel README principale).

**Chi lo usa.** Gli script di `scripts/autopsia/`, `tests/unit/autopsy.test.js` (l'autopsia del
gioco deve dare gli stessi conteggi) e l'app separata alveare-autopsia (`npm run dati` di quell'app).

## `mosse-migliori.json` e `mosse-peggiori.json`

**Che cos'è.** L'archivio delle mosse giocate a mano che, a un'analisi approfondita, risultano
migliori della mossa suggerita dall'app (`mosse-migliori.json`). `mosse-peggiori.json` raccoglie il
caso opposto: mosse giocate che risultano peggiori del suggerimento. Quando l'archivio avrà abbastanza
record servirà a migliorare la strategia: una variante è migliore se sceglie più spesso le mosse
dell'archivio delle migliori e meno spesso quelle delle peggiori.

**Da dove viene.** `scripts/mosse-migliori.mjs --log FILE` (istruzioni in testa al file), dove FILE è
il log scaricato con «Scarica log partita». Solo mosse della modalità normale. Candidate: le mosse
diverse dal suggerimento con posto ≤ 3 nella classifica dell'app, o con totale almeno pari al
suggerimento, o giudicate «Ottima scoperta»; con `--opposti` tutte le mosse diverse dal suggerimento,
e quelle peggiori vanno in `mosse-peggiori.json`. Per ogni candidata, mossa giocata e suggerita sono
seguite dagli stessi futuri a caso e da 15 mosse di autogioco. Misura: punti meno 1000 per ogni
blocco. Prima prova su 30 futuri (seme 777); le mosse oltre 2 errori standard passano alla conferma
su 100 futuri nuovi (seme 99991). Una posizione già presente non viene aggiunta due volte. I
risultati parziali sono salvati accanto al log (`<log>.mosse-migliori.json`): un'analisi interrotta
riparte da dove era arrivata.

**Struttura.**

- `format` (`alveare-mosse-umane`), `version`, `notes`
- `records`: una voce per mossa
  - `id` (partita#mossa), `partita` (nome del log), `mossa` (numero nel log)
  - `stato`: `confermata` (oltre 2 errori standard anche nella conferma) o `probabile` (a favore ma
    sotto la soglia)
  - `posizione`: `celle` (chiavi `"q,r"` delle celle occupate), `vassoio` (id dei pezzi), `combo`,
    `libere`
  - `tua` e `suggerita`: `idx` (posto nel vassoio), `q`, `r`, `pezzo`, `nome`, `celle` (numeri 1–61
    delle celle riempite)
  - `app`: `giudizio` dato dall'app alla mossa giocata, `posto` su `su` mosse della classifica,
    `strategia` (commit)
  - `prova` e `conferma`: `futuri`, `mosse` di autogioco, `seme`, `differenza` (giocata − suggerita,
    media), `errore` (errore standard), `a` (giocata) e `b` (suggerita) con `punti`, `blocchi`,
    `libere` medi
  - `aggiunto`: data

**Numeri.** Partita del 2026-11-04 (strategia fa730f6): 281 mosse provate. Migliori: 7 confermate
(mosse 18, 69, 88, 130, 230, 246, 336) e 1 probabile (32). Peggiori: 31 confermate. Le differenze più
grandi sono quelle in cui la mossa evita blocchi: alla 336 la mossa giocata si blocca 8 volte su 100,
la suggerita 22.

**Verifica.** `node scripts/mosse-migliori.mjs --verifica` conta quante mosse dell'archivio la
strategia attuale sceglie come sono state giocate.

**Chi lo usa.** Per ora nessuno: è la base per tarare la strategia.
