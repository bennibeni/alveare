# Dati

File di dati usati dagli script di misura, dai test e dall'autopsia. Nessuno è usato dalla pagina
del gioco; il laboratorio separato `/trappole` legge l'archivio delle trappole.

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

Anche la pagina `/trappole`, raggiungibile dal gioco, usa questo archivio: filtri per esito,
replay, anteprima di una mossa manuale e alternative alla mossa decisiva. Ricostruzione in
`game/trapReplay.js`; analisi calcolata dal motore `game/autopsy.js` durante la generazione statica
della pagina, senza calcoli dell'oracolo nel browser. Per aggiornare il laboratorio dopo una nuova
raccolta occorre ricostruire l'app. I risultati descrivono la strategia storica fa730f6.

### Mosse migliori scoperte nel laboratorio

Ogni scelta manuale diversa da quella registrata avvia un confronto in un worker: stessi futuri
casuali per entrambe le mosse, poi 15 mosse di autogioco corrente. La misura è punti meno 1000 per
blocco; include il blocco subito dopo l'ultima mossa. Prima 30 futuri (seme 777), poi, solo se la
differenza supera due errori standard, conferma su 100 nuovi futuri (seme 99991). Una mossa viene
classificata migliore solo se supera la soglia anche nella conferma. La combo iniziale è
ricostruita dal replay. Il confronto è con la mossa storica, non con il suggerimento attuale.

L'archivio è persistente nel browser (`alveare-trappole-migliori-v1`), con deduplicazione per
trappola, passo, mossa, protocollo e impronta del codice della strategia di continuazione.
«Esporta le mosse migliori salvate» produce `alveare-trappole-migliori.json` nello stesso formato
dell'archivio delle mosse umane. Per aggiungerlo all'archivio del progetto:

```bash
node scripts/importa-trappole.mjs PERCORSO/alveare-trappole-migliori.json
```

L'importazione controlla formato, soglie di conferma e legalità delle mosse, evita duplicati e
aggiunge i record a `data/mosse-migliori.json`. Non riesegue le simulazioni: le misure provengono
dall'esportazione. I record includono stato iniziale, entrambe le mosse, risultati delle due fasi
e impronta della strategia. Sono riutilizzabili con `scripts/mosse-migliori.mjs --verifica`.
Non modificano automaticamente la strategia. Cancellare i dati del browser cancella l'archivio
locale: esportarlo consente di conservarlo altrove. Cambiare posizione o scelta annulla il
confronto in corso, senza registrare risultati incompleti.

Tutti i confronti completati, inclusi quelli «non migliori», sono conservati anche nello storico
`alveare-trappole-valutazioni-v1`. «Non migliore» significa vantaggio non confermato; il campo
`esito` distingue i risultati nettamente peggiori da quelli incerti. Tornare sulla stessa scelta
recupera il risultato senza ripetere il calcolo; durante il trascinamento una nota segnala le mosse
già valutate. Le vecchie conferme vengono riconosciute automaticamente. Un cambio dell'impronta
della strategia rende il confronto nuovo. Lo storico completo è esportabile separatamente con
«Esporta tutte le valutazioni»; l'importazione in `mosse-migliori.json` resta riservata alle
conferme positive. La scelta manuale avviene tramite trascinamento, senza menu delle coordinate.
L'icona dello storico in ogni card apre il riepilogo dei tentativi per quella specifica trappola
(seme, ingresso e copia), con mossa scelta, esito, vantaggio stimato e blocchi. La modale legge
lo storico aggiornato all'apertura e distingue le valutazioni fatte con una strategia precedente.

La lista raggruppa le 59 continuazioni in 24 posizioni iniziali distinte: stesse celle occupate
e stesso multinsieme di forme orientate, ignorando l'ordine dei tre slot. Conserva le ripetizioni
della stessa forma; orientamenti diversi restano distinti. La combo non cambia l'identità visiva
della card, ma ogni copia mantiene combo, futuro, replay e analisi originali. Una select permette
di scegliere la continuazione; il filtro sugli esiti opera sulle copie e mostra le posizioni che
ne contengono almeno una corrispondente. La modale raccoglie i tentativi di tutte le copie del
gruppo, indicando l'origine di ogni valutazione. Le chiavi dei confronti e gli archivi precedenti
restano validi: non si riusa una misura di una copia per un'altra con un confronto diverso.

I colori delle card indicano i tentativi manuali salvati: grigio = nessuna valutazione,
azzurro = almeno una valutazione, verde = almeno una mossa migliore confermata in una delle
copie. La selezione corrente ha un contorno giallo indipendente dallo stato. I colori vengono
aggiornati subito dopo il salvataggio e anche se lo storico cambia in un'altra scheda.
«Esporta trappole con mosse migliori» salva un JSON (`alveare-trappole-con-mosse-migliori` v1)
con le posizioni verdi, tutte le loro continuazioni e analisi, e i tentativi del gruppo.
«Esporta le mosse migliori salvate» mantiene il formato importabile in `mosse-migliori.json`.

Il laboratorio esclude prima dell'analisi le posizioni iniziali con esattamente una mossa
legale, contando una volta sola gli slot con pezzi identici. Sono 5 posizioni (17 continuazioni):
restano 19 card e 42 continuazioni, di cui 29 senza scampo e 13 con mossa decisiva. L'archivio
originale e lo storico dei tentativi restano conservati; le esportazioni delle trappole visibili
seguono lo stesso filtro. Le esportazioni delle valutazioni salvate restano complete.

### Risultati manuali del 7 novembre 2026

`autopsia/risultati-trappole-2026-11-07.json` conserva l'esportazione delle posizioni con
mosse migliori: due posizioni (semi 108051 e 128033), con due conferme positive e due tentativi
non confermati. Essendo l'esportazione delle sole posizioni verdi, non è lo storico completo
dei tentativi sulle altre posizioni. Il file originale in Downloads resta conservato.

`autopsia/mosse-confermate-trappole.json` contiene le due conferme nel formato delle mosse
umane. Entrambe sono importate in `mosse-migliori.json` senza duplicare i record precedenti
(53 record totali al momento dell'importazione). Per rivalutarle contro una strategia:

```bash
node scripts/mosse-migliori.mjs --verifica --out data/autopsia/mosse-confermate-trappole.json --f2 300 --workers 2
```

`autopsia/diagnosi-mosse-confermate.json` registra la classifica attuale: nel seme 108051 la
mossa umana è seconda su 3 candidate approfondite; nel seme 128033 è quarta su 6. Non mancano
candidate approfondite in questi due casi: il criterio di valutazione ordina male le mosse
rispetto alla misura sulle continuazioni casuali. Questi esempi servono a guidare modifiche
generali del criterio e a verificarle, insieme alle altre posizioni e a partite con semi nuovi.
L'importazione da sola non cambia l'autogioco né aggiorna il modello del rischio.
La verifica su 300 futuri contro la strategia attuale conferma entrambe le mosse:
vantaggio 265,3 ± 28,2 per il seme 108051 e 57,9 ± 12,0 per il seme 128033 (± un errore
standard; misura punti meno penalità per blocco). Comando, semi e risultati sono conservati
in `autopsia/verifica-mosse-confermate-300.json`.

### Analisi prima dell'ingresso in pericolo

`scripts/autopsia/analizza-preingressi.mjs` ricostruisce le posizioni due mosse prima dell'ingresso
79 del seme 104753 e una mossa prima dell'ingresso 810 del seme 108924. Verifica che il replay
raggiunga esattamente l'occupazione, le forme e la combo dell'ingresso storico, poi confronta
tutte le mosse legali (12 e 4, contando una volta sola i pezzi identici). Ogni candidata viene
confrontata con la scelta attuale sugli stessi 30 futuri. Solo la migliore candidata con un
vantaggio superiore a due errori standard passa alla conferma su 100 futuri indipendenti e,
se positiva, alla verifica su ulteriori 300. La misura resta punti meno 1000 per blocco, per
la prima mossa più 15 successive, incluso il blocco finale. Non usa l'oracolo chiaroveggente.

Il file `autopsia/preingressi-analisi.json` conserva posizioni, tutte le prove e una cache legata
all'impronta della strategia; rilanciare lo script riprende i risultati già completati.
`autopsia/preingressi-confermati.json` contiene solo i risultati che passano tutte e tre le fasi.
I record hanno origine `ricerca-automatica-preingresso`, distinta dalle mosse trovate dall'utente.

Risultato: nel seme 104753, due mosse prima dell'ingresso, bandiera sinistra nelle celle
1, 2, 3, 8 (slot 2; q=0, r=-4): su 300 futuri, 35 blocchi contro 70 e 149 punti medi contro
136,14; vantaggio con penalità 129,53 ± 28,86 (errore standard). Importata senza duplicati
in `mosse-migliori.json`, che contiene ora 54 record. Per 108924 nessuna delle tre alternative
supera la soglia della prima prova: non si conclude che tutte siano peggiori. La migliore
ha differenza 32,47 ± 39,63 su 30 futuri, insufficiente per la conferma automatica.

```bash
node scripts/autopsia/analizza-preingressi.mjs
node scripts/importa-trappole.mjs data/autopsia/preingressi-confermati.json
```

La strategia di gioco non viene modificata da questa analisi.

### Esperimenti sulla strategia

`autopsia/autogioco-rischio/README.md` documenta le varianti confrontate e la ricerca aggiuntiva
adottata nei casi senza continuazione con i pezzi noti. La cartella conserva anche il confronto
su 54 esempi, 260 posizioni affollate e 32 partite con semi nuovi, inclusi i risultati negativi
e i limiti della verifica. Queste prove non modificano gli archivi delle mosse confermate.

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
