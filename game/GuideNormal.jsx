"use client";

import { useMemo } from "react";
import HexGrid, { parseKey } from "./HexGrid.js";
import MiniBoard, { fmt, Note, pieceCells, Section, Table } from "./GuideKit.jsx";
import { PIECE_COLORS } from "./pieces.js";
import { explainNormal, NORMAL_ANALYSIS, NORMAL_BIG_PENALTY, NORMAL_CLEAR_BONUS, NORMAL_CLOSABLE_BONUS, NORMAL_DEEP, NORMAL_LOOKAHEAD, NORMAL_RISK, NORMAL_ROOM_PENALTY, WEIGHTS as W } from "./strategy.js";

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
const DEMO_HOLE = fillAllExcept(1, [[0, 0], [1, 0]]);
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
  const row = (label, count, w) => [label, fmt(count, 2), <span key="w" className="whitespace-nowrap">× {fmt(w)}</span>, sign(count * w)];
  return [
    row("Punti della mossa", m.gain, W.cell),
    row("Linee svuotate", m.lines, W.line),
    row("Celle vuote murate (0 vicini liberi)", f.deadHoles, W.dead),
    row("Celle vuote con 1 solo vicino libero", f.holes, W.hole),
    row("Pezzi del catalogo che entrano ancora (su 25)", f.fitCount, W.fit),
    row("Linee quasi complete (2 se manca 1 cella, 1 se ne mancano 2)", f.near, W.near),
    row("Celle vuote", f.empty, W.empty),
    [<b key="t">Voto</b>, "", "", <b key="v">{sign(m.value)}</b>],
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
        <h1 className="text-2xl font-semibold text-white">Come nascono i suggerimenti · gioco normale</h1>
        <p className="text-slate-400">
          Il bottone <b>Suggerimento</b> e l&apos;<b>Autogioco</b> usano esattamente la stessa procedura: l&apos;autogioco non fa
          altro che chiedere un suggerimento e giocarlo, mossa dopo mossa. Ecco come viene scelto.
        </p>
      </header>

      <Section n={1} title="Elencare tutte le mosse possibili">
        <p>
          Una mossa è una coppia <i>(pezzo, posizione)</i>. Per ognuno dei tre pezzi del vassoio il computer prova ogni cella del
          tabellone come punto di partenza (61 celle) e controlla che <b>tutte</b> le celle del pezzo cadano su celle vuote. Le
          posizioni che passano il controllo sono le mosse possibili.
        </p>
        <p>
          A inizio partita sono più di 100; quando il tabellone si riempie scendono a poche decine.
          {example && (
            <>
              {" "}
              Sul tuo tabellone in questo momento sono <b>{example.totalMoves}</b>.
            </>
          )}
        </p>
      </Section>

      <Section n={2} title="Giocare ogni mossa «per finta»">
        <p>
          Ogni mossa viene simulata su una copia del tabellone: il pezzo viene appoggiato, si controllano le 27 linee (9
          orizzontali e 9 per ciascuna delle due diagonali) e quelle piene vengono svuotate, esattamente come nel gioco vero.
          Si calcolano anche i punti che la mossa porterebbe:
        </p>
        <Note>
          <b>punti</b> = celle svuotate × numero di linee svuotate × (1 + 0,5 × combo)
          <br />
          <span className="text-slate-400">
            La combo è il numero di mosse consecutive che hanno svuotato almeno una linea. I punti per le celle appoggiate (+1 per
            cella) sono uguali per tutte le mosse dello stesso pezzo e quindi non influenzano la scelta.
          </span>
        </Note>
      </Section>

      <Section n={3} title="Dare un voto al tabellone che resta">
        <p>
          Il cuore del metodo: ogni mossa viene giudicata dal tabellone che <i>lascia</i>, non solo dai punti che fa. Il voto è
          una somma pesata di sette misure, tutte calcolate dopo aver svuotato le linee:
        </p>
        <Table
          head={["Misura", "Peso", "Perché"]}
          align={["", "r", ""]}
          rows={[
            ["Punti della mossa", fmt(W.cell), "Fare punti è lo scopo del gioco."],
            ["Linee svuotate", `+${fmt(W.line)} ciascuna`, "Svuotare libera spazio: è il modo per sopravvivere."],
            ["Celle vuote murate", fmt(W.dead), "Una cella vuota circondata da celle piene accetta solo il punto, oppure si libera svuotando una linea che la attraversa."],
            ["Celle vuote con 1 solo vicino libero", fmt(W.hole), "Ci entrano solo pochissimi pezzi: sono quasi buchi."],
            ["Pezzi che entrano ancora", `+${fmt(W.fit)} ciascuno`, "Quanti dei 25 pezzi del catalogo trovano ancora posto: misura la libertà futura."],
            ["Linee quasi complete", `+${fmt(W.near)} per punto`, "Preparano le prossime linee e le combo."],
            ["Celle vuote", `+${fmt(W.empty)} ciascuna`, "A parità di tutto, un tabellone più sgombro è più sicuro."],
          ]}
        />
        <div className="grid gap-4 sm:grid-cols-3">
          <figure className="flex flex-col items-center gap-2 rounded-xl bg-slate-900/60 p-3">
            <MiniBoard grid={DEMO_DEAD} width={110} marks={[{ cells: [[0, 0]], stroke: "#fb7185" }]} title="Cella murata" />
            <figcaption className="text-center text-xs text-slate-400">
              Cella <b>murata</b>: nessun vicino libero. Vale {fmt(W.dead)}.
            </figcaption>
          </figure>
          <figure className="flex flex-col items-center gap-2 rounded-xl bg-slate-900/60 p-3">
            <MiniBoard
              grid={DEMO_HOLE}
              width={110}
              marks={[{ cells: [[0, 0], [1, 0]], stroke: "#fbbf24" }]}
              title="Celle con un solo vicino libero"
            />
            <figcaption className="text-center text-xs text-slate-400">
              Due celle vuote vicine: ognuna ha <b>un solo</b> vicino libero (l&apos;altra). Valgono {fmt(W.hole)} l&apos;una.
            </figcaption>
          </figure>
          <figure className="flex flex-col items-center gap-2 rounded-xl bg-slate-900/60 p-3">
            <MiniBoard
              grid={DEMO_NEAR}
              width={150}
              marks={[
                { cells: [[2, 0]], stroke: "#4ade80", label: "2", labelColor: "#4ade80" },
                { cells: [[0, 1], [1, 1]], stroke: "#4ade80", dashed: true, label: "1", labelColor: "#4ade80" },
              ]}
              title="Linee quasi complete"
            />
            <figcaption className="text-center text-xs text-slate-400">
              Linea a cui manca 1 cella: <b>2 punti</b>; linea a cui ne mancano 2: <b>1 punto</b>. Poi × {fmt(W.near)}.
            </figcaption>
          </figure>
        </div>
        <Note>
          <b>voto</b> = punti×{fmt(W.cell)} + linee×{fmt(W.line)} {fmt(W.dead)}×murate {fmt(W.hole)}×quasi-buchi + {fmt(W.fit)}
          ×pezzi-che-entrano + {fmt(W.near)}×quasi-complete + {fmt(W.empty)}×vuote
        </Note>
        <p>
          I pesi sono stati scelti a mano e poi verificati su partite simulate: il peso delle linee (60) è molto più grande degli
          altri perché svuotare una linea vale quasi sempre più di qualunque piccolo difetto del tabellone.
        </p>
      </Section>

      <Section n={4} title="Guardare una mossa avanti">
        <p>
          Il voto da solo è miope: una mossa può lasciare un bel tabellone in cui però gli <i>altri due</i> pezzi del vassoio non
          stanno bene. Per questo il computer:
        </p>
        <ol className="list-decimal space-y-1 pl-6">
          <li>ordina tutte le mosse per voto e tiene le {NORMAL_LOOKAHEAD} migliori;</li>
          <li>
            per ognuna, sul tabellone che ne risulta, rifà i passi 1–3 con gli altri due pezzi e trova la loro mossa migliore;
          </li>
          <li>
            assegna a ogni candidata un <b>totale</b> = punti della prima mossa + {NORMAL_CLEAR_BONUS} × linee svuotate dalla prima
            mossa × affollamento + voto della migliore seconda mossa + {NORMAL_CLOSABLE_BONUS} × linee chiudibili × affollamento
            dopo le due mosse − {NORMAL_RISK} ×
            probabilità che un pezzo estratto a caso non entri nel tabellone dopo le due mosse − {NORMAL_ROOM_PENALTY} × (1 −
            posizioni del pezzo che resta nel vassoio / 6) − {NORMAL_BIG_PENALTY} × (1 − spazio per rombo e ferro di cavallo)
            (se nessuno dei due pezzi entra più: −10.000, cioè scartata);
          </li>
          <li>
            con meno di {NORMAL_DEEP.free} celle libere (griglia affollata) guarda <b>tutti e tre</b> i pezzi noti: per ogni
            candidata prova le {NORMAL_DEEP.second} migliori seconde mosse e, per ognuna, le {NORMAL_DEEP.third} migliori terze
            mosse con il pezzo rimasto. Il totale è quello della sequenza migliore: il tabellone dopo la terza mossa si giudica
            come quello dopo la seconda, e se il terzo pezzo non entra la penalità è {fmt(NORMAL_DEEP.block, 0)}.
          </li>
          <li>suggerisce la candidata con il totale più alto.</li>
        </ol>
        <Note>
          Il voto del tabellone dopo la prima mossa non compare nel totale: è già «contenuto» nel voto della seconda, che giudica
          il tabellone dopo entrambe le mosse. Così vince la mossa che prepara meglio la successiva, non quella che sembra più bella
          da sola.
        </Note>
        <Note tone="ok">
          Quanto conta svuotare subito dipende da quanto è pieno il tabellone. L&apos;<b>affollamento</b> è la quota di celle
          occupate prima della mossa (0 con il tabellone vuoto, 1 con il tabellone pieno), e ogni linea svuotata dalla prima mossa
          vale {NORMAL_CLEAR_BONUS} × affollamento: per esempio {fmt(NORMAL_CLEAR_BONUS * 0.3, 0)} con il 30% delle celle occupate,{" "}
          {fmt(NORMAL_CLEAR_BONUS * 0.6, 0)} con il 60%. Con il tabellone quasi vuoto conviene rimandare lo svuotamento: spesso si
          svuotano più linee insieme e si allungano le combo. Con il tabellone quasi pieno conviene liberare spazio subito, perché
          ogni mossa in più con poche celle libere è un rischio di blocco. Il premio fisso di +{fmt(W.line)} per tutte le linee
          rendeva meno (i punti per pezzo scendevano da 10,3 a 9,3); il premio che cresce con l&apos;affollamento ha allungato
          molto le partite (vedi «Quanto rende»).
        </Note>
        <Note tone="ok">
          Oltre a svuotare subito conta preparare gli svuotamenti successivi. Le <b>linee chiudibili</b> sono il numero atteso di
          linee, fra quelle a cui mancano da 1 a 3 celle, che un pezzo estratto a caso potrà chiudere con una sola mossa dopo le
          due mosse: per ogni orientamento si contano le linee che riesce a completare e si pesa con la sua probabilità di uscita.
          Anche questo premio ({NORMAL_CLOSABLE_BONUS} × linee chiudibili × affollamento) conta poco a tabellone vuoto e molto a
          tabellone pieno. Contare invece le linee che può chiudere il pezzo rimasto nel vassoio non ha dato miglioramenti.
        </Note>
        <p>
          Perché {NORMAL_LOOKAHEAD} candidate? Il voto a un passo prevede male il totale: la mossa con il voto più alto, per
          esempio una chiusura immediata, può avere uno dei totali più bassi, e una mossa con un voto modesto può essere la
          migliore. Con 6 candidate il suggerimento era il migliore secondo il suo stesso criterio solo nel 59% delle posizioni
          simulate; con {NORMAL_LOOKAHEAD} nell&apos;87%, al prezzo di qualche millisecondo in più. L&apos;analisi delle mosse e il
          giudizio mostrano e confrontano le {NORMAL_ANALYSIS} migliori per totale.
        </p>
      </Section>

      <Section n={5} title="Che cosa non sa">
        <p>
          Il pezzo che arriva al posto di quello usato è casuale: il computer non sa quale sarà, ma sa con che probabilità esce
          ogni orientamento. Per questo il totale perde {NORMAL_RISK} punti × la probabilità che un pezzo nuovo non trovi posto
          dopo le due mosse: un tabellone in cui il 10% dei pezzi non entra più costa {fmt(NORMAL_RISK * 0.1, 0)} punti, più
          di una linea. Non è la probabilità di perdere (nel vassoio restano altri pezzi), ma misura quanto il tabellone è
          diventato stretto. È stata provata anche una stima «esatta» della fine partita (il pezzo noto rimasto non entra e
          nemmeno i due nuovi): sulle partite simulate rendeva meno.
        </p>
        <p>
          C&apos;è poi il pezzo che <b>resta nel vassoio</b> dopo le due mosse: il computer lo conosce e conta in quante posizioni
          entra ancora (fino a 6). Ogni posizione che manca costa {fmt(NORMAL_ROOM_PENALTY / 6, 0)} punti, fino a{" "}
          {NORMAL_ROOM_PENALTY} se non entra più da nessuna parte. Nelle partite simulate, quando i due pezzi tenuti nel vassoio
          hanno al massimo 3 posizioni la partita si perde entro 5 mosse circa dieci volte più spesso che quando ne hanno almeno 4;
          se poi i due pezzi sono identici e non entrano più, si perde in più di metà dei casi.
        </p>
        <p>
          Infine lo <b>spazio per rombo e ferro di cavallo</b>. Quando una partita finisce, nel vassoio ci sono soprattutto
          queste due forme (31–32% dei pezzi, contro il 22% con cui escono): sono compatte e chiedono un buco «a blocco»,
          mentre alla fine restano in media 25 celle libere ma sparpagliate. Per ogni loro orientamento il computer conta le
          posizioni libere (fino a 6) e ne fa la media pesata con le probabilità di uscita: con spazio pieno non perde niente,
          con nessuna posizione perde {fmt(NORMAL_BIG_PENALTY, 0)} punti. La misura «entra almeno da qualche parte» usata dal
          voto non basta: un tabellone con un solo buco adatto al rombo vale quanto uno che ne ha dieci.
        </p>
        <p>
          Il peso {NORMAL_RISK} è stato scelto con il simulatore. Con più candidate la ricerca trova più combinazioni che rendono
          punti, ma con il peso precedente (400) le partite si accorciavano un po&apos;: provati 400, 800, 1.600, 2.400 e 3.200,
          il migliore è stato 1.600.
        </p>
        <p>
          I pesi sono fissi (non imparati) e la ricerca guarda una sola mossa avanti, per restare veloce: un suggerimento
          richiede qualche decina di millisecondi.
        </p>
      </Section>

      <Section n={6} title="Quanto rende">
        <p>
          Misure su 60 partite simulate (al massimo 1.000 pezzi ciascuna), con la stessa sequenza di pezzi per tutte le
          versioni:
        </p>
        <Table
          head={["Strategia", "Durata media", "Durata mediana", "Punti medi", "Punti per pezzo", "Arrivate a 1.000"]}
          align={["", "r", "r", "r", "r", "r"]}
          rows={[
            ["6 candidate, senza rischio", "286", "219", "2.896", "10,13", "0"],
            ["6 candidate, rischio 400", "373", "301", "3.834", "10,29", "5"],
            ["20 candidate, rischio 1.600", "433", "357", "5.226", "12,06", "10"],
            ["+ spazio per il pezzo rimasto", "486", "349", "5.938", "12,21", "14"],
            ["+ spazio per rombo e ferro di cavallo", "670", "735", "8.188", "12,23", "23"],
            ["+ premio per le linee svuotate", "852", "1.000", "8.982", "10,54", "43"],
            ["+ premio per le linee chiudibili", "904", "1.000", "9.591", "10,61", "46"],
            ["Attuale: + tre pezzi noti con la griglia affollata", "966", "1.000", "10.312", "10,68", "56"],
          ]}
        />
        <p>
          Anche in modalità normale l&apos;autogioco prima o poi perde: capita una serie di estrazioni per cui nessuno dei tre
          pezzi trova posto. Le durate variano moltissimo (da poche decine a oltre mille pezzi), quindi il confronto va letto
          con cautela, su molte partite e confrontando partita per partita con gli stessi pezzi. Le ultime misure sono state controllate anche su 140 partite mai usate per la taratura:
          lo spazio per il pezzo rimasto ha portato la durata media da 414 a 479, lo spazio per rombo e ferro di cavallo da
          479 a 604, i due premi per le linee da 604 a 879 (arrivate a 1.000: da 44 a 110; meglio in 86 partite e peggio in 19).
          I tre pezzi noti con la griglia affollata, controllati su 100 partite nuove, hanno ridotto le partite perse da 19 a 12.
          I premi per le linee fanno svuotare prima e quindi fare meno combo: i punti per pezzo scendono da 12,2 a 10,6, ma le
          partite durano tanto di più che i punti per partita salgono.
        </p>
      </Section>

      <Section n={7} title="Esempio dal tuo tabellone">
        {!example ? (
          <p>Nessuna mossa possibile in questo momento: avvia una nuova partita e torna qui.</p>
        ) : (
          <>
            <p>
              Queste sono le {NORMAL_ANALYSIS} migliori per totale fra le {NORMAL_LOOKAHEAD} candidate approfondite sul tuo
              tabellone attuale
              {snapshot.expert ? " (calcolate come se il vassoio fosse libero, anche se stai giocando in modalità Esperto)" : ""}.
              Nella miniatura: il pezzo <b>pieno</b> è la mossa candidata, il contorno <b>tratteggiato «2»</b> è la migliore
              seconda mossa con gli altri pezzi e, con la griglia affollata, «3» è la terza. La stella indica il suggerimento.
            </p>
            <Table
              head={["", "Mossa", "Voto", "Seconda mossa", "Voto 2ª", "Premi linee", "Rischi", "Totale"]}
              align={["", "", "r", "", "r", "r", "r", "r"]}
              rows={example.byTotal.slice(0, NORMAL_ANALYSIS).map((m, i) => [
                <MiniBoard
                  key="b"
                  grid={snapshot.grid}
                  width={120}
                  dimFilled
                  marks={[
                    { cells: pieceCells(m.cells, m.q, m.r), fill: PIECE_COLORS[m.piece.color], stroke: "#ffffff" },
                    ...(m.next
                      ? [{ cells: pieceCells(m.next.cells, m.next.q, m.next.r), stroke: PIECE_COLORS[m.next.piece.color], dashed: true, label: "2", labelColor: "#e2e8f0" }]
                      : []),
                    ...(m.third
                      ? [{ cells: pieceCells(m.third.cells, m.third.q, m.third.r), stroke: PIECE_COLORS[m.third.piece.color], dashed: true, label: "3", labelColor: "#e2e8f0" }]
                      : []),
                  ]}
                />,
                <span key="n">
                  {i === 0 ? "★ " : ""}
                  {m.piece.name}
                  {m.lines ? ` · ${m.lines} ${m.lines === 1 ? "linea" : "linee"}` : ""}
                </span>,
                fmt(m.value),
                m.next ? m.next.piece.name : "nessuna",
                m.next ? fmt(m.next.value) : "—",
                m.clearBonus || m.closableBonus ? sign(m.clearBonus + m.closableBonus) : "—",
                m.next ? sign(-(NORMAL_RISK * m.death + m.roomPenalty + m.bigPenalty)) : "—",
                <b key="t">{fmt(m.total)}</b>,
              ])}
            />
            <p>
              Totale = punti della mossa ({fmt(example.byTotal[0].gain)} per la mossa scelta) + voto della seconda mossa + premi
              per le linee − rischi. Per la mossa scelta i premi sono: linee svuotate {sign(example.byTotal[0].clearBonus)}{" "}
              (affollamento attuale {fmt(example.byTotal[0].crowd * 100, 0)}%), linee chiudibili{" "}
              {sign(example.byTotal[0].closableBonus)} ({fmt(example.byTotal[0].closable, 2)} linee attese); i rischi: pezzo nuovo che non entra{" "}
              {sign(-NORMAL_RISK * example.byTotal[0].death)} (probabilità {fmt(example.byTotal[0].death * 100, 1)}%), pezzo rimasto
              nel vassoio {sign(-example.byTotal[0].roomPenalty)} ({example.byTotal[0].room === 6 ? "almeno 6" : example.byTotal[0].room}{" "}
              posizioni), rombo e ferro di cavallo {sign(-example.byTotal[0].bigPenalty)} (spazio{" "}
              {fmt(example.byTotal[0].bigRoom * 100, 0)}%). Ecco come è nato il voto della mossa suggerita e quello della sua seconda mossa:
            </p>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <p className="text-sm font-semibold text-white">★ Mossa suggerita: {example.byTotal[0].piece.name}</p>
                <Table head={["Misura", "Valore", "Peso", "Contributo"]} align={["", "r", "r", "r"]} rows={breakdown(example.byTotal[0])} />
              </div>
              {example.byTotal[0].next && (
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-white">Seconda mossa: {example.byTotal[0].next.piece.name}</p>
                  <Table
                    head={["Misura", "Valore", "Peso", "Contributo"]}
                    align={["", "r", "r", "r"]}
                    rows={breakdown(example.byTotal[0].next)}
                  />
                </div>
              )}
            </div>
            <p className="text-sm text-slate-400">
              Nota: in questa tabella l&apos;ordine è per totale, mentre il passo 4 sceglie le candidate per voto. Per questo una
              mossa con voto più basso può risultare la migliore: è quella che lascia più spazio agli altri pezzi.
            </p>
          </>
        )}
      </Section>
    </article>
  );
}
