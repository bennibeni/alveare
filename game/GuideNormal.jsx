"use client";

import { useMemo } from "react";
import { ENGINE_VERSION } from "@alveare/motore";
import HexGrid, { parseKey } from "./HexGrid.js";
import MiniBoard, {
  fmt,
  Note,
  pieceCells,
  Section,
  Table,
} from "./GuideKit.jsx";
import { PIECE_COLORS } from "./pieces.js";
import {
  explainNormal,
  NORMAL_ANALYSIS,
  NORMAL_CLEAR_BONUS,
  NORMAL_DEEP,
  NORMAL_DEFER,
  NORMAL_LOOKAHEAD,
  NORMAL_NEW_PIECE,
  NORMAL_LEARNED_PENALTY,
  NORMAL_RESCUE,
  NORMAL_ROOM_PENALTY,
  WEIGHTS as W,
} from "./strategy.js";

// --- tabelloni dimostrativi per le illustrazioni -----------------------------
function fillAllExcept(radius, empty, color = 2) {
  let g = new HexGrid(radius);
  const skip = new Set(empty.map(([q, r]) => `${q},${r}`));
  for (const k of g.cells.keys()) {
    if (skip.has(k)) continue;
    const [q, r] = parseKey(k);
    g = g.place([[0, 0]], q, r, color);
  }
  return g;
}
const DEMO_DEAD = fillAllExcept(1, [[0, 0]]);
const DEMO_HOLE = fillAllExcept(1, [
  [0, 0],
  [1, 0],
]);
const DEMO_NEAR = (() => {
  let g = new HexGrid(2);
  // riga centrale (5 celle): ne manca 1 → +2
  for (const q of [-2, -1, 0, 1]) g = g.place([[0, 0]], q, 0, 7);
  // riga sotto (4 celle): ne mancano 2 → +1
  for (const q of [-2, -1]) g = g.place([[0, 0]], q, 1, 4);
  return g;
})();

const sign = (n) => (n > 0 ? `+${fmt(n)}` : fmt(n));

/** Righe della scomposizione del voto di una mossa. */
function breakdown(m) {
  const f = m.features;
  const row = (label, count, w) => [
    label,
    fmt(count, 2),
    <span key="w" className="whitespace-nowrap">
      × {fmt(w)}
    </span>,
    sign(count * w),
  ];
  return [
    row("Punti della mossa", m.gain, W.cell),
    row("Linee svuotate", m.lines, W.line),
    row("Celle vuote murate (0 vicini liberi)", f.deadHoles, W.dead),
    row("Celle vuote con 1 solo vicino libero", f.holes, W.hole),
    row("Pezzi del catalogo che entrano ancora (su 25)", f.fitCount, W.fit),
    row(
      "Linee quasi complete (2 se manca 1 cella, 1 se ne mancano 2)",
      f.near,
      W.near,
    ),
    row("Celle vuote", f.empty, W.empty),
    [<b key="t">Voto iniziale</b>, "", "", <b key="v">{sign(m.value)}</b>],
  ];
}

export default function GuideNormal({ snapshot }) {
  const example = useMemo(() => {
    if (!snapshot || !snapshot.tray.some(Boolean)) return null;
    const res = explainNormal(snapshot.grid, snapshot.tray, snapshot.streak);
    return res.totalMoves ? res : null;
  }, [snapshot]);

  return (
    <article className="mx-auto max-w-3xl space-y-10 px-4 py-8 text-slate-200">
      <header className="space-y-2 text-center">
        <h1 className="text-2xl font-semibold text-white">
          Come nascono i suggerimenti · gioco normale
        </h1>
        <p className="text-sm text-amber-300">Motore installato: {ENGINE_VERSION}</p>
        <p className="text-slate-400">
          Il bottone <b>Suggerimento</b> e l&apos;<b>Autogioco</b> usano
          esattamente la stessa procedura: l&apos;autogioco non fa altro che
          chiedere un suggerimento e giocarlo, mossa dopo mossa. Ecco come viene
          scelto.
        </p>
      </header>

      <Section n={1} title="Elencare tutte le mosse possibili">
        <p>
          Una mossa è una coppia <i>(pezzo, posizione)</i>. Per ognuno dei tre
          pezzi del vassoio il computer prova ogni cella del tabellone come
          punto di partenza (61 celle) e controlla che <b>tutte</b> le celle del
          pezzo cadano su celle vuote. Le posizioni che passano il controllo
          sono le mosse possibili.
        </p>
        <p>
          A inizio partita sono più di 100; quando il tabellone si riempie
          scendono a poche decine.
          {example && (
            <>
              {" "}
              Sul tuo tabellone in questo momento sono{" "}
              <b>{example.totalMoves}</b>.
            </>
          )}
        </p>
      </Section>

      <Section n={2} title="Giocare ogni mossa «per finta»">
        <p>
          Ogni mossa viene simulata su una copia del tabellone: il pezzo viene
          appoggiato, si controllano le 27 linee (9 orizzontali e 9 per ciascuna
          delle due diagonali) e quelle piene vengono svuotate, esattamente come
          nel gioco vero. Si calcolano anche i punti che la mossa porterebbe:
        </p>
        <Note>
          <b>punti</b> = celle svuotate × numero di linee svuotate × (1 + 0,5 ×
          combo)
          <br />
          <span className="text-slate-400">
            La combo è il numero di mosse consecutive che hanno svuotato almeno
            una linea. I punti per le celle appoggiate (+1 per cella) sono
            uguali per tutte le mosse dello stesso pezzo e quindi non
            influenzano la scelta.
          </span>
        </Note>
      </Section>

      <Section n={3} title="Dare un voto iniziale al tabellone che resta">
        <p>
          Il cuore del metodo: ogni mossa viene giudicata dal tabellone che{" "}
          <i>lascia</i>, non solo dai punti che fa. Il voto iniziale è una somma pesata
          di sette misure, tutte calcolate dopo aver svuotato le linee:
        </p>
        <Table
          head={["Misura", "Peso", "Perché"]}
          align={["", "r", ""]}
          rows={[
            [
              "Punti della mossa",
              fmt(W.cell),
              "Fare punti è lo scopo del gioco.",
            ],
            [
              "Linee svuotate",
              `+${fmt(W.line)} ciascuna`,
              "Svuotare libera spazio: è il modo per sopravvivere.",
            ],
            [
              "Celle vuote murate",
              fmt(W.dead),
              "Una cella vuota circondata da celle piene accetta solo il punto, oppure si libera svuotando una linea che la attraversa.",
            ],
            [
              "Celle vuote con 1 solo vicino libero",
              fmt(W.hole),
              "Ci entrano solo pochissimi pezzi: sono quasi buchi.",
            ],
            [
              "Pezzi che entrano ancora",
              `+${fmt(W.fit)} ciascuno`,
              "Quanti dei 25 pezzi del catalogo trovano ancora posto: misura la libertà futura.",
            ],
            [
              "Linee quasi complete",
              `+${fmt(W.near)} per punto`,
              "Preparano le prossime linee e le combo.",
            ],
            [
              "Celle vuote",
              `+${fmt(W.empty)} ciascuna`,
              "A parità di tutto, un tabellone più sgombro è più sicuro.",
            ],
          ]}
        />
        <div className="grid gap-4 sm:grid-cols-3">
          <figure className="flex flex-col items-center gap-2 rounded-xl bg-slate-900/60 p-3">
            <MiniBoard
              grid={DEMO_DEAD}
              width={110}
              marks={[{ cells: [[0, 0]], stroke: "#fb7185" }]}
              title="Cella murata"
            />
            <figcaption className="text-center text-xs text-slate-400">
              Cella <b>murata</b>: nessun vicino libero. Vale {fmt(W.dead)}.
            </figcaption>
          </figure>
          <figure className="flex flex-col items-center gap-2 rounded-xl bg-slate-900/60 p-3">
            <MiniBoard
              grid={DEMO_HOLE}
              width={110}
              marks={[
                {
                  cells: [
                    [0, 0],
                    [1, 0],
                  ],
                  stroke: "#fbbf24",
                },
              ]}
              title="Celle con un solo vicino libero"
            />
            <figcaption className="text-center text-xs text-slate-400">
              Due celle vuote vicine: ognuna ha <b>un solo</b> vicino libero
              (l&apos;altra). Valgono {fmt(W.hole)} l&apos;una.
            </figcaption>
          </figure>
          <figure className="flex flex-col items-center gap-2 rounded-xl bg-slate-900/60 p-3">
            <MiniBoard
              grid={DEMO_NEAR}
              width={150}
              marks={[
                {
                  cells: [[2, 0]],
                  stroke: "#4ade80",
                  label: "2",
                  labelColor: "#4ade80",
                },
                {
                  cells: [
                    [0, 1],
                    [1, 1],
                  ],
                  stroke: "#4ade80",
                  dashed: true,
                  label: "1",
                  labelColor: "#4ade80",
                },
              ]}
              title="Linee quasi complete"
            />
            <figcaption className="text-center text-xs text-slate-400">
              Linea a cui manca 1 cella: <b>2 punti</b>; linea a cui ne mancano
              2: <b>1 punto</b>. Poi × {fmt(W.near)}.
            </figcaption>
          </figure>
        </div>
        <Note>
          <b>voto iniziale</b> = punti×{fmt(W.cell)} + linee×{fmt(W.line)} {fmt(W.dead)}
          ×murate {fmt(W.hole)}×quasi-buchi + {fmt(W.fit)}
          ×pezzi-che-entrano + {fmt(W.near)}×quasi-complete + {fmt(W.empty)}
          ×vuote
        </Note>
        <p>
          I pesi sono stati scelti a mano e poi verificati su partite simulate:
          il peso delle linee (60) è molto più grande degli altri perché
          svuotare una linea vale quasi sempre più di qualunque piccolo difetto
          del tabellone.
        </p>
      </Section>

      <Section n={4} title="Guardare una mossa avanti">
        <p>
          Il voto iniziale da solo è miope: una mossa può lasciare un bel tabellone in
          cui però gli <i>altri due</i> pezzi del vassoio non stanno bene. Per
          questo il computer:
        </p>
        <ol className="list-decimal space-y-1 pl-6">
          <li>
            ordina tutte le mosse per voto iniziale e tiene le {NORMAL_LOOKAHEAD}{" "}
            migliori, aggiungendo se necessario le tre migliori di ogni pezzo
            diverso del vassoio, per non escludere una forma solo per il voto iniziale;
          </li>
          <li>
            per ognuna, sul tabellone che ne risulta, rifà i passi 1–3 con gli
            altri due pezzi e trova la loro mossa migliore;
          </li>
          <li>
            assegna a ogni candidata un <b>totale</b> = punti della prima mossa
            + {NORMAL_CLEAR_BONUS} × linee svuotate subito × affollamento
            + punti della seconda mossa + {fmt(W.line)} × linee della seconda
            − {NORMAL_LEARNED_PENALTY} × rischio appreso del tabellone finale
            − penalità per lo spazio del pezzo rimasto. Quest&apos;ultima vale
            {" "}{NORMAL_ROOM_PENALTY} × (1 − posizioni / 6), contando al massimo
            6 posizioni. Se nessun altro pezzo noto entra, la continuazione
            vale −10.000;
          </li>
          <li>
            con meno di {NORMAL_DEEP.free} celle libere (griglia affollata)
            guarda <b>tutti e tre</b> i pezzi noti: per ogni candidata prova le{" "}
            {NORMAL_DEEP.second} migliori seconde mosse e, per ognuna, le{" "}
            {NORMAL_DEEP.third} migliori terze mosse con il pezzo rimasto. Il
            totale è quello della sequenza migliore: il tabellone dopo la terza
            mossa si giudica con il modello di rischio appreso, e se il terzo pezzo
            non entra la penalità è {fmt(NORMAL_DEEP.block, 0)}.
          </li>
          <li>
            fra {NORMAL_DEEP.free} e {NORMAL_NEW_PIECE.free - 1} celle libere
            tiene conto anche del <b>pezzo nuovo</b>: dopo la prima mossa ne
            entra uno nel vassoio, e la seconda mossa si può fare anche con
            quello. Le {NORMAL_NEW_PIECE.top} migliori candidate si rivalutano
            provando tutti i 25 pezzi che possono arrivare: per ognuno la
            seconda mossa è la migliore fra i due pezzi noti e quello nuovo, e
            il totale è la media pesata con le probabilità di uscita. Restano
            davanti alle altre candidate.
          </li>
          <li>
            con la griglia affollata, se più candidate condividono il totale
            migliore, le confronta anche considerando il pezzo nuovo alla
            seconda mossa. Questo distingue sequenze che arrivano allo stesso
            tabellone finale ma lasciano spazi diversi dopo la prima mossa;
          </li>
          <li>
            applica il rinvio dello svuotamento e, nei casi critici descritti
            qui sotto, la ricerca aggiuntiva; suggerisce la prima candidata
            dell&apos;ordine finale.
          </li>
        </ol>
        <Note>
          Il voto iniziale serve a selezionare le candidate e le continuazioni.
          Il totale usa invece punti, linee dell&apos;ultima mossa e rischio
          appreso del tabellone finale. Con tre pezzi noti comprende anche
          punti e premio linee della seconda mossa. Sono due valutazioni diverse.
        </Note>
        <Note tone="ok">
          Quanto conta svuotare subito dipende da quanto è pieno il tabellone.
          L&apos;<b>affollamento</b> è la quota di celle occupate prima della
          mossa (0 con il tabellone vuoto, 1 con il tabellone pieno), e ogni
          linea svuotata dalla prima mossa vale {NORMAL_CLEAR_BONUS} ×
          affollamento: per esempio {fmt(NORMAL_CLEAR_BONUS * 0.3, 0)} con il
          30% delle celle occupate, {fmt(NORMAL_CLEAR_BONUS * 0.6, 0)} con il
          60%. Con il tabellone quasi vuoto conviene rimandare lo svuotamento:
          spesso si svuotano più linee insieme e si allungano le combo. Con il
          tabellone quasi pieno conviene liberare spazio subito, perché ogni
          mossa in più con poche celle libere è un rischio di blocco.
        </Note>
        <p>
          Perché {NORMAL_LOOKAHEAD} candidate? Il voto iniziale prevede male
          il totale: la mossa con il voto iniziale più alto, per esempio una chiusura
          immediata, può avere uno dei totali più bassi, e una mossa con un voto
          iniziale modesto può essere la migliore. In una verifica storica, con 6 candidate il suggerimento era il
          migliore secondo il suo stesso criterio solo nel 59% delle posizioni
          simulate; con {NORMAL_LOOKAHEAD} nell&apos;87%, al prezzo di qualche
          millisecondo in più. L&apos;analisi delle mosse e il giudizio mostrano
          e confrontano le {NORMAL_ANALYSIS} migliori per totale.
        </p>
        <Note>
          <b>Rimandare una linea.</b> Con combo a zero, se la prima scelta è
          il pezzo singolo che svuota una o più linee, il motore può preferire
          un pezzo più grande che non svuota nulla. Lo fa solo se il suo totale
          dista al massimo {NORMAL_DEFER} punti e lascia al pezzo singolo la
          possibilità di svuotare almeno altrettante linee alla mossa seguente.
          Si conserva così la chiusura per una combo già avviata. Nel confronto
          delle mosse questa preferenza viene riconosciuta assegnandole almeno
          il totale della migliore alternativa: il totale mostrato può quindi
          includere questo adeguamento, oltre alla formula ordinaria.
        </Note>
        <Note>
          <b>Ricerca aggiuntiva nei casi critici.</b> Nella zona con meno di{" "}
          {NORMAL_DEEP.free} celle libere, quando restano da 2 a{" "}
          {NORMAL_RESCUE.maxCandidates} candidate e nessuna permette di giocare
          un altro pezzo noto, il motore confronta gli stessi{" "}
          {NORMAL_RESCUE.futures} futuri casuali per ogni candidata, fino a{" "}
          {NORMAL_RESCUE.horizon} mosse complessive. Sceglie in base alla media
          dei punti, togliendo {NORMAL_RESCUE.blockedPenalty} per ogni blocco.
          Le continuazioni usano il motore ordinario senza avviare altre ricerche
          aggiuntive. In questi casi il totale è quello delle simulazioni.
        </Note>
      </Section>

      <Section n={5} title="Il rischio appreso e i suoi limiti">
        <p>
          Il motore usa un modello statistico già addestrato, che osserva
          buchi, spazi per le forme, linee quasi complete, zone separate e
          celle difficili da coprire. Queste misure servono a stimare quanto
          un tabellone possa portare al blocco. Il modello resta fisso durante
          la partita: non impara dalle mosse che stai giocando.
        </p>
        <p>
          L&apos;addestramento della seconda versione ha usato 10.044 tabelloni
          e 80.352 futuri simulati, con un giocatore veloce e un orizzonte di
          40 mosse. È una stima legata a quel metodo: non è la probabilità
          esatta di perdere la tua partita né una garanzia di sopravvivenza.
          Il motore non conosce le prossime estrazioni casuali.
        </p>
        <Note>
          Il rischio appreso, moltiplicato per {NORMAL_LEARNED_PENALTY},
          sostituisce nel totale ordinario il vecchio voto finale e le
          penalità manuali per il pezzo nuovo e per rombo e ferro di cavallo,
          insieme al vecchio premio per le linee chiudibili. Quelle misure
          possono restare disponibili come diagnostica, ma non vanno sommate
          al totale attuale. Resta la penalità per il pezzo noto rimasto.
        </Note>
        <p>
          La profondità cambia con l&apos;affollamento: normalmente si valutano
          due mosse, nella zona di pericolo tre pezzi noti, e nei casi critici
          anche le continuazioni simulate. Il tempo di risposta dipende dalla posizione.
        </p>
      </Section>

      <Section n={6} title="Quanto rende: risultati storici e verifica della beta">
        <Note>
          <b>La beta attuale.</b> Il premio per svuotare subito una linea è
          passato da 180 a 120, sempre moltiplicato per l&apos;affollamento.
          Su 40 nuove partite abbinate la candidata ha ottenuto circa il 19%
          di punti in più. Una verifica separata su 100 coppie di partite,
          limitate a 1.000 pezzi, ha osservato 3 sconfitte contro 5 del
          riferimento 1.1.0. La stima del rischio con futuri alternativi dà un
          rapporto di circa 0,83, con intervallo al 95% da 0,48 a 1,73:
          il campione non dimostra una riduzione del rischio né esclude un
          aumento. La beta.2 mantiene le scelte della beta.1 e corregge il
          giudizio sulla mossa preferita per il rinvio della linea.
        </Note>
        <p>
          La tabella seguente documenta lo sviluppo precedente alla beta:
          non misura le prestazioni del motore attualmente installato.
          Sono 60 partite simulate (al massimo 1.000 pezzi ciascuna), con
          la stessa sequenza di pezzi per tutte le versioni storiche:
        </p>
        <Table
          head={[
            "Strategia",
            "Durata media",
            "Durata mediana",
            "Punti medi",
            "Punti per pezzo",
            "Arrivate a 1.000",
          ]}
          align={["", "r", "r", "r", "r", "r"]}
          rows={[
            ["6 candidate, senza rischio", "286", "219", "2.896", "10,13", "0"],
            ["6 candidate, rischio 400", "373", "301", "3.834", "10,29", "5"],
            [
              "20 candidate, rischio 1.600",
              "433",
              "357",
              "5.226",
              "12,06",
              "10",
            ],
            [
              "+ spazio per il pezzo rimasto",
              "486",
              "349",
              "5.938",
              "12,21",
              "14",
            ],
            [
              "+ spazio per rombo e ferro di cavallo",
              "670",
              "735",
              "8.188",
              "12,23",
              "23",
            ],
            [
              "+ premio per le linee svuotate",
              "852",
              "1.000",
              "8.982",
              "10,54",
              "43",
            ],
            [
              "+ premio per le linee chiudibili",
              "904",
              "1.000",
              "9.591",
              "10,61",
              "46",
            ],
            [
              "+ tre pezzi noti con la griglia affollata (versione storica)",
              "966",
              "1.000",
              "10.312",
              "10,68",
              "56",
            ],
          ]}
        />
        <p>
          Anche in modalità normale l&apos;autogioco prima o poi perde: capita
          una serie di estrazioni per cui nessuno dei tre pezzi trova posto. Le
          durate variano moltissimo (da poche decine a oltre mille pezzi),
          quindi il confronto va letto con cautela, su molte partite e
          confrontando partita per partita con gli stessi pezzi. Queste
          modifiche storiche sono state controllate anche su 140 partite mai usate per la
          taratura: lo spazio per il pezzo rimasto ha portato la durata media da
          414 a 479, lo spazio per rombo e ferro di cavallo da 479 a 604, i due
          premi per le linee da 604 a 879 (arrivate a 1.000: da 44 a 110; meglio
          in 86 partite e peggio in 19). I tre pezzi noti con la griglia
          affollata, controllati su 100 partite nuove, hanno ridotto le partite
          perse da 19 a 12. I premi per le linee fanno svuotare prima e quindi
          fare meno combo: i punti per pezzo scendono da 12,2 a 10,6, ma le
          partite durano tanto di più che i punti per partita salgono.
        </p>
      </Section>

      <Section n={7} title="Esempio dal tuo tabellone">
        {!example ? (
          <p>
            Nessuna mossa possibile in questo momento: avvia una nuova partita e
            torna qui.
          </p>
        ) : (
          <>
            <p>
              Queste sono fino a {NORMAL_ANALYSIS} mosse nell&apos;ordine finale
              del motore, fra le candidate approfondite sul tuo tabellone
              attuale
              {snapshot.expert
                ? " (calcolate come se il vassoio fosse libero, anche se stai giocando in modalità Esperto)"
                : ""}
              . Nella miniatura: il pezzo <b>pieno</b> è la mossa candidata, il
              contorno <b>tratteggiato «2»</b> è la migliore seconda mossa con
              gli altri pezzi e, con la griglia affollata, «3» è la terza. La
              stella indica il suggerimento.
            </p>
            <Table
              head={[
                "",
                "Mossa",
                "Voto iniziale",
                "Seconda mossa",
                "Voto iniziale 2ª",
                "Premio immediato",
                "Rischio appreso",
                "Totale",
              ]}
              align={["", "", "r", "", "r", "r", "r", "r"]}
              rows={example.byTotal.slice(0, NORMAL_ANALYSIS).map((m, i) => [
                <MiniBoard
                  key="b"
                  grid={snapshot.grid}
                  width={120}
                  dimFilled
                  marks={[
                    {
                      cells: pieceCells(m.cells, m.q, m.r),
                      fill: PIECE_COLORS[m.piece.color],
                      stroke: "#ffffff",
                    },
                    ...(m.next
                      ? [
                          {
                            cells: pieceCells(m.next.cells, m.next.q, m.next.r),
                            stroke: PIECE_COLORS[m.next.piece.color],
                            dashed: true,
                            label: "2",
                            labelColor: "#e2e8f0",
                          },
                        ]
                      : []),
                    ...(m.third
                      ? [
                          {
                            cells: pieceCells(
                              m.third.cells,
                              m.third.q,
                              m.third.r,
                            ),
                            stroke: PIECE_COLORS[m.third.piece.color],
                            dashed: true,
                            label: "3",
                            labelColor: "#e2e8f0",
                          },
                        ]
                      : []),
                  ]}
                />,
                <span key="n">
                  {i === 0 ? "★ " : ""}
                  {m.piece.name}
                  {m.lines
                    ? ` · ${m.lines} ${m.lines === 1 ? "linea" : "linee"}`
                    : ""}
                </span>,
                fmt(m.value),
                m.next ? m.next.piece.name : "nessuna",
                m.next ? fmt(m.next.value) : "—",
                sign(m.clearBonus),
                m.learned != null
                  ? sign(-NORMAL_LEARNED_PENALTY * m.learned)
                  : "—",
                <b key="t">{fmt(m.total)}</b>,
              ])}
            />
            <p>
              Il premio immediato vale {NORMAL_CLEAR_BONUS} × linee svuotate
              × affollamento. Il rischio appreso è la penalità sul tabellone
              finale della continuazione. Il totale comprende anche i punti,
              il premio per le linee dell&apos;ultima mossa e lo spazio del
              pezzo rimasto; con tre pezzi noti include la mossa intermedia.
              Le colonne sono quindi una sintesi, non una somma completa.
              {example.byTotal[0].newPiece &&
                ` Qui le celle libere sono meno di ${NORMAL_NEW_PIECE.free}: i totali delle prime ${NORMAL_NEW_PIECE.top} candidate sono la media sui 25 pezzi che possono arrivare, non la somma delle voci della tabella (con i soli pezzi noti la mossa scelta varrebbe ${fmt(example.byTotal[0].knownTotal)}).`}{" "}
              {example.byTotal[0].rescue &&
                ` Qui nessuna candidata colloca un altro pezzo noto: il totale viene da ${example.byTotal[0].rescue.futures} futuri casuali fino a ${example.byTotal[0].rescue.horizon} mosse, con una penalità di 1000 per blocco. La scomposizione ordinaria qui sotto non è il totale delle simulazioni.`}{" "}
              {example.byTotal[0].deferOriginalTotal !== undefined &&
                ` Qui è attivo il rinvio della linea: il totale ordinario era ${fmt(example.byTotal[0].deferOriginalTotal)} ed è stato adeguato a ${fmt(example.byTotal[0].total)} per riconoscere la preferenza descritta nel passo 4.`}{" "}
              {example.byTotal[0].tieBreak !== undefined &&
                " Qui l’ordine fra le migliori candidate a pari merito tiene conto anche del pezzo nuovo alla seconda mossa."}{" "}
              Ecco come è nato il voto iniziale della mossa suggerita e quello della sua
              seconda mossa:
            </p>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <p className="text-sm font-semibold text-white">
                  ★ Mossa suggerita: {example.byTotal[0].piece.name}
                </p>
                <Table
                  head={["Misura", "Valore", "Peso", "Contributo"]}
                  align={["", "r", "r", "r"]}
                  rows={breakdown(example.byTotal[0])}
                />
              </div>
              {example.byTotal[0].next && (
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-white">
                    Seconda mossa: {example.byTotal[0].next.piece.name}
                  </p>
                  <Table
                    head={["Misura", "Valore", "Peso", "Contributo"]}
                    align={["", "r", "r", "r"]}
                    rows={breakdown(example.byTotal[0].next)}
                  />
                </div>
              )}
            </div>
            <p className="text-sm text-slate-400">
              Nota: in questa tabella l&apos;ordine è quello finale, mentre il
              passo 4 sceglie le candidate per voto iniziale. Una mossa con
              voto iniziale più basso può quindi essere preferita quando si
              considerano anche le continuazioni e il rischio stimato di blocco.
            </p>
          </>
        )}
      </Section>
    </article>
  );
}
