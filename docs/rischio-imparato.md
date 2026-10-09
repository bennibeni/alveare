# Il rischio imparato: le 19 misure e i 20 numeri

Il codice è in `game/learnedRisk.js`. Il file contiene due cose:

- **`features(g)`** misura un tabellone e restituisce 21 numeri. Le misure 0 e 1 (linee e punti della mossa) servono solo al giocatore veloce dell'apprendimento; il modello usa le altre 19.
- **`LEARNED_MODEL`** contiene i 20 numeri imparati: una costante `b` e un coefficiente `c` per ciascuna delle 19 misure.

## Come si calcola il rischio

```
z = b + c₁·misura₁ + c₂·misura₂ + … + c₁₉·misura₁₉
rischio = 1 / (1 + e^(−z))          (regressione logistica: un numero fra 0 e 1)
```

- Un **coefficiente positivo** fa salire il rischio quando la misura cresce.
- Un **coefficiente negativo** lo fa scendere.
- **Una misura conta per coefficiente × valore**: per confrontare due misure bisogna guardare il prodotto, non il coefficiente da solo. Per questo ogni misura è divisa per una **scala** che la porta a valori tipici fra 0 e 1.

Il rischio stima la frazione di futuri che, partendo da quel tabellone con un vassoio nuovo a caso, si bloccano prima di tornare a 46 celle libere. È la stima di un giocatore veloce, che guarda una mossa sola: per la strategia vera, che guarda più avanti, il rischio reale è più basso. Conta il confronto fra tabelloni, non il valore assoluto.

## Come lo usa la strategia

Nello sguardo avanti, il tabellone finale (dopo due o tre pezzi noti) riceve questo voto:

```
voto = punti dell'ultima mossa + 60 × linee svuotate dall'ultima mossa − 1.600 × rischio
```

Un punto percentuale di rischio vale quindi 16 punti, e una linea svuotata (60) vale circa 4 punti percentuali di rischio.

## Le 19 misure

«Cella vuota» = cella non occupata. «Vicini» = le 6 celle adiacenti (meno, sul bordo). «Pezzo da 4» = tutti i pezzi tranne il punto. Le probabilità dei pezzi sono quelle di uscita del catalogo (`pieces.js`).

| # | Nome | Che cosa misura | Scala | Coeff. | Lettura |
|---|---|---|---|---|---|
| — | costante `b` | valore di partenza di z | — | **+1,238** | da sola darebbe un rischio del 78%; le misure lo abbassano |
| 2 | `vuote` | celle vuote | / 61 | **−6,091** | la misura più forte: più spazio, meno rischio. Da 30 a 31 celle vuote z scende di 0,10 |
| 3 | `buchi1` | celle vuote con **un solo** vicino vuoto (vicoli ciechi) | / 10 | **+0,479** | ogni vicolo cieco alza z di 0,048 |
| 4 | `buchi0` | celle vuote con **nessun** vicino vuoto (celle isolate) | / 5 | **+0,112** | effetto piccolo: quasi sempre sono anche celle morte (misura 5), che pesano già |
| 5 | `morte` | celle vuote che **nessun pezzo da 4** può coprire in nessuna posizione (zone di 1–3 celle, angoli stretti): si liberano solo con un punto o completando una linea | / 10 | **+0,793** | ogni cella morta alza z di 0,079, quanto 0,8 celle vuote in meno |
| 6 | `quasi1` | linee a cui manca **1** cella | / 5 | **+0,325** | sorprende: è positivo perché le linee quasi piene vanno insieme a tabelloni pieni. L'aspetto utile delle linee quasi piene è già nella misura 20 |
| 7 | `quasi2` | linee a cui mancano **2** celle | / 5 | −0,083 | quasi nullo |
| 8 | `quasi3` | linee a cui mancano **3** celle | / 5 | −0,033 | quasi nullo |
| 9 | `entrano` | pezzi del catalogo (25 orientamenti) che entrano almeno in un posto | / 25 | **+1,199** | segno «strano»: si sovrappone a `nonEntra` e agli spazi delle forme, che lo compensano. Da leggere insieme a loro |
| 10 | `nonEntra` | probabilità che il pezzo estratto a caso **non entri** da nessuna parte | 0–1 | **+1,821** | se un pezzo su dieci non entra, z sale di 0,18 |
| 11 | `barra` | spazio per la barra: per ogni orientamento min(posti, 6) / 6, media pesata con le probabilità | 0–1 | −0,550 | più posti per le barre, meno rischio |
| 12 | `rombo` | spazio per il rombo (come sopra) | 0–1 | −0,484 | come sopra |
| 13 | `ferro` | spazio per il ferro di cavallo (come sopra) | 0–1 | **−0,955** | la forma più importante da tenere giocabile |
| 14 | `bandieraD` | spazio per la bandiera destra | 0–1 | +0,483 | segno «strano», come `entrano`: le bandiere entrano quasi ovunque entrino ferri e rombi |
| 15 | `bandieraS` | spazio per la bandiera sinistra | 0–1 | +0,144 | come sopra |
| 16 | `zone` | zone vuote separate (gruppi di celle vuote collegate) | / 5 | −0,177 | piccolo e controintuitivo: a parità di celle morte, spezzare lo spazio non peggiora |
| 17 | `zona1` | zone di **1** cella | / 3 | +0,187 | piccolo: il grosso lo prende già `morte` |
| 18 | `zona2` | zone di **2** celle | / 3 | −0,294 | negativo perché la cella morta è già contata da `morte`: corregge il doppio conteggio |
| 19 | `zona3` | zone di **3** celle | / 3 | −0,510 | come sopra |
| 20 | `chiudibili` | numero atteso di linee (a cui mancano da 1 a 3 celle) che un pezzo estratto a caso può chiudere con una sola mossa | 0–~2 | **−1,316** | le linee pronte da chiudere abbassano il rischio. È l'aspetto utile delle linee quasi piene |

### Come leggerle

- **Le più importanti** sono `vuote`, `chiudibili`, `nonEntra`, `ferro` e `morte`: hanno coefficienti chiari e un senso diretto.
- **Le misure si sovrappongono:**
  - `entrano`, `nonEntra` e gli spazi delle forme misurano quasi la stessa cosa;
  - `buchi0`, `morte` e `zona1`/`zona2`/`zona3` contano in parte le stesse celle.

  Quando due misure si sovrappongono, la regressione divide l'effetto fra loro in modo arbitrario: una può avere un segno controintuitivo perché l'altra la compensa. Conta l'effetto d'insieme, non il singolo numero.
- **Il bordo** non è una misura: l'analisi delle celle morte non ha trovato differenze fra celle di bordo e interne (3,28% contro 3,16% di futuri bloccati).

## Esempio: seme 7000, pezzo 2891 (31 celle libere)

Contributo di ogni misura (coefficiente × valore) al tabellone della posizione, prima della mossa:

| Misura | Valore | Contributo |
|---|---|---|
| vuote | 0,508 (31/61) | −3,095 |
| entrano | 1,000 (25/25) | +1,199 |
| chiudibili | 0,754 | −0,992 |
| ferro | 0,722 | −0,690 |
| rombo | 0,889 | −0,430 |
| bandieraD | 0,778 | +0,376 |
| barra | 0,611 | −0,336 |
| morte | 0,300 (3 celle) | +0,238 |
| quasi1 | 0,600 (3 linee) | +0,195 |
| zona3 | 0,333 (1 zona) | −0,170 |
| buchi1 | 0,300 (3 celle) | +0,144 |
| bandieraS | 0,778 | +0,112 |
| zone | 0,600 (3 zone) | −0,106 |
| quasi2, quasi3 | | −0,099 |
| nonEntra, buchi0, zona1, zona2 | 0 | 0 |

z = 1,238 − 3,095 + … = **−2,417**, quindi rischio = 1 / (1 + e^2,417) = **8,2%**.
Per confronto, il tabellone vuoto ha rischio 0,6%.

## Come sono stati imparati

Script in `scripts/apprendimento`:

1. **`posizioni.mjs`:** 1.819 posizioni con al massimo 34 celle libere, prese da 80 partite della strategia.
2. **`valori.mjs`:** da ogni posizione, il tabellone stesso più 5 tabelloni ottenuti con mosse legali a caso (anche tabelloni rovinati), per un totale di 10.684. Per ognuno, 16 futuri con un vassoio nuovo a caso, giocati dal giocatore veloce (`giocatore.mjs`), finché il tabellone torna a 46 celle libere o si blocca. Bloccati: 10,9% dei 170.944 futuri.
3. **`fit.py`:** regressione logistica delle 19 misure sulla frazione di futuri bloccati. Su un quinto delle posizioni tenuto da parte prevede meglio del solo numero di celle vuote (log-loss 0,314 contro 0,339).

Per un nuovo giro si ripetono i tre passi e si copiano `b`, `use` e `c` dal file prodotto da `fit.py` in `LEARNED_MODEL`. Prima di adottare il modello nuovo si misura con `npm run pericolo`.
