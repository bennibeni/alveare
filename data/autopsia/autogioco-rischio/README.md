# Ricerca aggiuntiva nei casi critici · 7 novembre 2026

La versione adottata aggiunge una ricerca soltanto nella modalità normale, quando nessuna
candidata permette una seconda mossa con i pezzi già visibili e restano fra 2 e 8 candidate.
Ogni candidata vede gli stessi 24 futuri casuali fino a 8 mosse totali. Si confronta la media
dei punti del gioco, meno 1000 per blocco; si conta anche il blocco dopo l'ultima mossa.
Le continuazioni delle simulazioni usano la strategia ordinaria: nessuna ricerca ricorsiva.
I semi interni sono 15131 + f × 7919, distinti da quelli dei benchmark.

La correzione è generale: non consulta semi, archivi o mosse salvate durante la partita.
Nel seme 108051 sceglie il ferro di cavallo nelle celle 6, 7, 12, 14, confermato in precedenza
su futuri indipendenti. Non corregge le altre due scelte confermate (128033 e pre-ingresso
104753). I loro esempi rimangono nell'archivio per lavori successivi.

## Varianti esaminate

Sono state confrontate 7 varianti oltre alla base. Le prime 3 cambiano il costo della mancata
collocazione del terzo pezzo noto, con pesi del rischio di 1600, 3200 e 5000. Altre 3 mescolano
il totale sui pezzi noti con l'attesa sul pezzo nuovo (25%, 50%, 100%) nelle posizioni con
al massimo 12 mosse. L'ultima è la ricerca limitata ai casi senza continuazione nota (`soccorso`).
La base è conservata in `.strategy-lab/risk-20261107/base`; SHA-256 di strategy.js:
`76d9cd6b495c95551fb50eac4de8565b9ad7bc6ba76d471b52474fc981337307`.
Il prototipo adottato ha SHA-256:
`28ee9d5ba011f6c951903a81ab805153046e3a2eac5bd5b405b94441cea056f7`.

Le varianti più ampie non sono adottate: migliorare due esempi non ha prodotto un vantaggio
generale. Quella col rischio 5000 peggiora la verifica da 11 a 14 blocchi su 88 posizioni.
Quella con attesa del pezzo nuovo al 100% passa da 1 a 3 partite perse nel pilota descritto sotto.

## Posizioni archiviate

Per confrontare le prime mosse, le continuazioni sono sempre quelle della base. Le scelte
identiche riusano esattamente la stessa simulazione: la differenza in quel caso è zero.
Le posizioni affollate sono divise per partita di origine in 172 di taratura e 88 di verifica.

| Prova | Base | Ricerca critica | Note |
|---|---:|---:|---|
| Taratura: 172 posizioni, futuro salvato, 20 mosse | 11 blocchi | 10 blocchi | 4 scelte diverse |
| Verifica: 88 posizioni, futuro salvato, 20 mosse | 11 blocchi | 12 blocchi | 1 scelta diversa |
| 54 esempi umani, 5 futuri ciascuno, 16 mosse | 9 blocchi | 8 blocchi | Cambia solo 108051 |

Il risultato negativo sul singolo futuro della posizione di verifica non è nascosto. Ripetendo
le scelte che cambiano su altri futuri si misura quanto dipende da quella particolare sequenza:

| Prova ripetuta sulle sole posizioni con scelta diversa | Base | Ricerca critica |
|---|---:|---:|
| 4 posizioni di taratura × 30 futuri | 64/120 blocchi | 61/120 blocchi |
| 1 posizione di verifica × 300 futuri | 219/300 blocchi | 208/300 blocchi |

Nell'ultima prova la ricerca salva 21 futuri persi dalla base e ne perde 10 salvati dalla base.
Il vantaggio medio (punti meno penalità) è 42,41 ± 22,58, dove ± indica un errore standard.
Il margine resta incerto; non dimostra un miglioramento generale su posizioni nuove.
I semi delle repliche sono 20361107 + posizione × 13 + futuro × 104729.

## Partite nuove

Ogni strategia gioca le stesse 32 partite, semi da 900000 a passi di 97, massimo 1000 pezzi,
4 copie per ingresso in pericolo. Qui anche le continuazioni usano la strategia in prova.

| Strategia | Pezzi giocati | Partite perse | Copie bloccate |
|---|---:|---:|---:|
| Base | 31.135 | 1 | 4/1648 |
| Attesa del nuovo pezzo al 100%, scartata | 29.733 | 3 | 6/1660 |
| Ricerca critica, adottata | 31.135 | 1 | 4/1648 |

Queste partite non mostrano regressioni della ricerca critica, ma nemmeno una riduzione
generale delle sconfitte. Il tasso stimato della base e della ricerca critica è lo stesso:
0,0321 sconfitte per 1000 pezzi. Non si rivendica significatività statistica dai pochi eventi.
I tempi complessivi non sono un benchmark di velocità: i processi competevano per la CPU.

## Versione usata dal gioco

La versione rifinita sostituisce la soglia numerica del prototipo con la condizione esplicita
«nessun secondo pezzo noto collocabile» e riusa i risultati per la stessa posizione. La cache
di punteggi fra tabelloni equivalenti è limitata a 128 voci; i tabelloni e i colori dell'analisi
rimangono quelli attuali. Le posizioni ordinarie e la modalità Esperto seguono la logica precedente.

`equivalenza-produzione.json` confronta tutte le classifiche, i punteggi e i conteggi delle
simulazioni della versione rifinita con il prototipo: 314 posizioni, di cui 18 attivano la
ricerca, risultati identici. La ricerca può aggiungere attesa nei casi critici e aumenta il
costo delle simulazioni del laboratorio; i confronti ripetuti riusano i punteggi memorizzati.

Nel caso 108051, una misura singola su questa macchina dà circa 18 ms per la base,
1136 ms per la prima ricerca e 1,8 ms riusando il risultato. Sono tempi indicativi del caso,
non un confronto generale di velocità; i valori grezzi sono in `tempo-caso-108051.json`.

## Riproduzione

```bash
node scripts/strategy-risk-lab.mjs
node scripts/strategy-risk-evaluate.mjs --set taratura --variants base,soccorso
node scripts/strategy-risk-evaluate.mjs --set verifica --variants base,soccorso
node scripts/strategy-risk-evaluate.mjs --set umane --variants base,soccorso
node scripts/strategy-risk-evaluate.mjs --set verifica --variants base,soccorso --changed-only 1 --repetitions 300
node scripts/strategy-risk-verify.mjs
node scripts/pericolo.mjs --games 32 --seed 900000 --max 1000 --k 4 --workers 2 --game ../.strategy-lab/risk-20261107/base --json data/autopsia/autogioco-rischio/partite-base.json
node scripts/pericolo.mjs --games 32 --seed 900000 --max 1000 --k 4 --workers 2 --game ../.strategy-lab/risk-20261107/soccorso --json data/autopsia/autogioco-rischio/partite-soccorso.json
```

Il generatore conserva la prima base acquisita nella cartella di lavoro esclusa da Git.
Per riprodurre altrove occorre partire dalla strategia con l'impronta indicata sopra.
I file `*-cache.json` sono intermedi locali, esclusi da Git; i JSON restanti conservano
scelte, parametri e risultati delle prove. I risultati non sono dati di addestramento aggiunti
automaticamente al modello del rischio.
