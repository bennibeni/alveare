# Il rischio imparato: le 21 misure e i 22 numeri

Il codice è in `game/learnedRisk.js`. Il file contiene due cose:

- **`features(g)`** misura un tabellone e restituisce 23 numeri. Le misure 0 e 1 (linee e punti della mossa) servono solo al giocatore veloce dell'apprendimento; il modello usa le altre 21.
- **`LEARNED_MODEL`** contiene i 22 numeri imparati: una costante `b` e un coefficiente `c` per ciascuna delle 21 misure.

Questa è la **seconda versione** del modello (10 ottobre 2026). La prima usava 19 misure, ed era stata imparata solo su posizioni affollate: la domanda era «si blocca prima di tornare a 46 celle libere?». Le differenze sono riassunte in fondo.

## Come si calcola il rischio

```
z = b + c₁·misura₁ + c₂·misura₂ + … + c₂₁·misura₂₁
rischio = 1 / (1 + e^(−z))          (regressione logistica: un numero fra 0 e 1)
```

- Un **coefficiente positivo** fa salire il rischio quando la misura cresce, uno **negativo** lo fa scendere.
- **Una misura conta per coefficiente × valore**: per confrontare due misure bisogna guardare il prodotto, non il coefficiente da solo. Per questo ogni misura è divisa per una **scala** che la porta a valori tipici fra 0 e 1.

Il rischio stima la probabilità che, partendo da quel tabellone con un vassoio nuovo a caso, il giocatore veloce (che guarda una mossa sola) si blocchi **entro 40 mosse**. Per la strategia vera, che guarda più avanti, il rischio reale è più basso: conta il confronto fra tabelloni, non il valore assoluto.

## Come lo usa la strategia

Nello sguardo avanti, il tabellone finale (dopo due o tre pezzi noti) riceve questo voto:

```
voto = punti dell'ultima mossa + 60 × linee svuotate dall'ultima mossa − 1.600 × rischio
```

Un punto percentuale di rischio vale quindi 16 punti, e una linea svuotata (60) vale circa 4 punti percentuali di rischio.

## Le 21 misure

Definizioni usate nella tabella:
- **cella vuota:** cella non occupata;
- **vicini:** le 6 celle adiacenti (meno, sul bordo);
- **pezzo da 4:** tutti i pezzi tranne il punto;
- **copertura di una cella:** probabilità che un pezzo da 4 estratto a caso abbia una posizione libera che la copre. Le probabilità dei pezzi sono quelle di uscita del catalogo (`pieces.js`).

| # | Nome | Che cosa misura | Scala | Coeff. | Lettura |
|---|---|---|---|---|---|
| — | costante `b` | valore di partenza di z | — | **−1,037** | |
| 2 | `vuote` | celle vuote | / 61 | **−1,065** | più spazio, meno rischio: ogni cella vuota in più abbassa z di 0,017 |
| 3 | `buchi1` | celle vuote con **un solo** vicino vuoto (vicoli ciechi) | / 10 | +0,129 | piccolo |
| 4 | `buchi0` | celle vuote con **nessun** vicino vuoto (celle isolate) | / 5 | +0,250 | ogni cella isolata alza z di 0,05 (oltre a contare come cella morta) |
| 5 | `morte` | celle vuote che **nessun pezzo da 4** può coprire (zone di 1–3 celle, angoli stretti): si liberano solo con un punto o completando una linea | / 10 | **+0,987** | ogni cella morta alza z di 0,099, quanto 5–6 celle vuote in meno |
| 6 | `quasi1` | linee a cui manca **1** cella | / 5 | +0,020 | quasi nullo |
| 7 | `quasi2` | linee a cui mancano **2** celle | / 5 | +0,039 | quasi nullo |
| 8 | `quasi3` | linee a cui mancano **3** celle | / 5 | +0,044 | quasi nullo |
| 9 | `entrano` | pezzi del catalogo (25 orientamenti) che entrano almeno in un posto | / 25 | **−0,928** | più forme giocabili, meno rischio |
| 10 | `nonEntra` | probabilità che il pezzo estratto a caso **non entri** da nessuna parte | 0–1 | +0,104 | piccolo: l'informazione è quasi tutta in `entrano` |
| 11 | `barra` | spazio per la barra: per ogni orientamento min(posti, 6) / 6, media pesata con le probabilità | 0–1 | −0,381 | più posti per le barre, meno rischio |
| 12 | `rombo` | spazio per il rombo (come sopra) | 0–1 | **−0,724** | la forma più importante da tenere giocabile |
| 13 | `ferro` | spazio per il ferro di cavallo (come sopra) | 0–1 | +0,166 | segno «strano»: si sovrappone a `rombo` ed `entrano`, che lo compensano |
| 14 | `bandieraD` | spazio per la bandiera destra | 0–1 | +0,117 | piccolo, come sopra |
| 15 | `bandieraS` | spazio per la bandiera sinistra | 0–1 | −0,083 | piccolo |
| 16 | `zone` | zone vuote separate (gruppi di celle vuote collegate) | / 5 | −0,352 | a parità del resto, più zone non peggiorano |
| 17 | `zona1` | zone di **1** cella | / 3 | +0,416 | la cella sola pesa anche oltre la cella morta |
| 18 | `zona2` | zone di **2** celle | / 3 | −0,196 | negativo perché le celle sono già contate come morte: corregge il doppio conteggio |
| 19 | `zona3` | zone di **3** celle | / 3 | −0,084 | come sopra |
| 20 | `chiudibili` | numero atteso di linee (a cui mancano da 1 a 3 celle) che un pezzo estratto a caso può chiudere con una sola mossa | 0–~2 | **−0,566** | le linee pronte da chiudere abbassano il rischio |
| 21 | `bassaBordo` | celle vuote **sul bordo** con copertura bassa (sotto il 15%, ma non morte): di solito le copre solo la barra parallela al lato | / 10 | **+0,481** | ogni cella alza z di 0,048, quanto quasi 3 celle vuote in meno |
| 22 | `bassaInterno` | celle vuote **interne** con copertura bassa (sotto il 15%, ma non morte) | / 10 | **+0,730** | ogni cella alza z di 0,073 |

### Come leggerle

- **Le più importanti** sono `vuote`, `morte`, `entrano`, `rombo`, `chiudibili` e le due coperture basse.
- **Le misure si sovrappongono:**
  - `entrano`, `nonEntra` e gli spazi delle forme misurano quasi la stessa cosa;
  - `buchi0`, `morte` e `zona1`/`zona2`/`zona3` contano in parte le stesse celle;
  - le coperture basse si sovrappongono agli spazi delle forme sui tabelloni affollati, ma non su quelli sgombri, dove lo spazio per forma è al massimo.

  Quando due misure si sovrappongono, la regressione divide l'effetto fra loro in modo arbitrario: una può avere un segno controintuitivo perché l'altra la compensa. Conta l'effetto d'insieme, non il singolo numero.
- **`vuote` pesa meno che nella prima versione** (−1,07 contro −6,09) perché la domanda è cambiata. Nella prima versione un tabellone con molte celle libere tornava subito a 46 ed era quindi «salvo» per definizione; ora conta solo il blocco entro 40 mosse.

## Esempio: seme 7000, pezzo 2891 (31 celle libere)

Contributo di ogni misura (coefficiente × valore) al tabellone della posizione, prima della mossa:

| Misura | Valore | Contributo |
|---|---|---|
| entrano | 1,000 (25/25) | −0,928 |
| rombo | 0,889 | −0,643 |
| vuote | 0,508 (31/61) | −0,541 |
| chiudibili | 0,754 | −0,427 |
| bassaBordo | 0,800 (8 celle) | +0,385 |
| morte | 0,300 (3 celle) | +0,296 |
| barra | 0,611 | −0,233 |
| zone | 0,600 (3 zone) | −0,211 |
| bassaInterno | 0,200 (2 celle) | +0,146 |
| ferro | 0,722 | +0,120 |
| bandieraD | 0,778 | +0,091 |
| bandieraS | 0,778 | −0,065 |
| quasi1, quasi2, quasi3 | | +0,088 |
| buchi1 | 0,300 (3 celle) | +0,039 |
| zona3 | 0,333 (1 zona) | −0,028 |
| buchi0, nonEntra, zona1, zona2 | 0 | 0 |

z = −1,037 − 0,928 − 0,643 − … = **−2,950**, quindi rischio = 1 / (1 + e^2,950) = **5,0%**.
Per confronto, il tabellone vuoto ha rischio 1,8%.

## Come sono stati imparati

Script in `scripts/apprendimento`:

1. **`posizioni.mjs --games 40 --seed 400000 --maxfree 45 --ogni 8`:** 3.348 posizioni con al massimo 45 celle libere, prese da 40 partite della strategia (con il rischio imparato della prima versione).
2. **`valori.mjs --k 8 --mosse 2 --safe 99 --orizzonte 40`:** da ogni posizione, il tabellone stesso più 2 tabelloni ottenuti con mosse legali a caso, per un totale di 10.044. Per ognuno, 8 futuri con un vassoio nuovo a caso, giocati dal giocatore veloce (`giocatore.mjs`). Bloccati entro 40 mosse: 3,3% degli 80.352 futuri.
3. **`fit.py`:** regressione logistica delle 21 misure sulla frazione di futuri bloccati.

Per un nuovo giro si ripetono i tre passi. Poi si copiano `b`, `use` e `c` dal file prodotto da `fit.py` in `LEARNED_MODEL`, e prima di adottare il modello nuovo lo si misura con `npm run pericolo`.

## Prima e seconda versione

| | Prima versione (9 ottobre) | Seconda versione (10 ottobre) |
|---|---|---|
| Misure | 19 | 21 (più `bassaBordo` e `bassaInterno`) |
| Posizioni | 1.819, al massimo 34 celle libere | 3.348, al massimo 45 celle libere |
| Domanda | si blocca prima di tornare a 46 celle libere? | si blocca entro 40 mosse? |
| Tasso di sconfitta (sdoppiamento, 600 partite, semi 40000 e 70000) | 0,050 | 0,037 (rapporto 0,76, intervallo 0,50–1,13) |
| Partite perse su 600 | 34 | 25 |
| Ingressi in pericolo ogni 1000 pezzi | 5,4 | 7,0 |
| Copie bloccate per ingresso | 0,92% | 0,54% |

La seconda versione entra in pericolo un po' più spesso, ma se la cava molto meglio quando ci si trova. Il miglioramento ha la stessa direzione su entrambi i gruppi di semi, ma non è ancora dimostrato.
