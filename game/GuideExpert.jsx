"use client";

import { useMemo } from "react";
import MiniBoard, { fmt, Note, pieceCells, Section, Table } from "./GuideKit.jsx";
import { PIECE_COLORS, SHAPES } from "./pieces.js";
import { explainQueue, QUEUE_PARAMS as Q, WEIGHTS as W } from "./strategy.js";

const pct = (p) => `${fmt(p * 100, 1)}%`;
const sign = (n) => (n > 0 ? `+${fmt(n)}` : fmt(n));

/** Le tre mosse di una sequenza, ognuna disegnata sul tabellone in cui viene giocata. */
function SequenceBoards({ path, width = 104 }) {
  return (
    <div className="flex gap-1">
      {path.map((m, i) => (
        <div key={i} className="flex flex-col items-center">
          <MiniBoard
            grid={m.before}
            width={width}
            dimFilled
            marks={[{ cells: pieceCells(m.piece.cells, m.q, m.r), fill: PIECE_COLORS[m.piece.color], stroke: "#ffffff" }]}
          />
          <span className="text-[10px] text-slate-500">
            {i + 1}° {m.lines ? `· ${m.lines} ${m.lines === 1 ? "linea" : "linee"}` : ""}
          </span>
        </div>
      ))}
    </div>
  );
}

/** Schema della beam search: quanti candidati a ogni livello e quanti ne restano. */
function BeamDiagram({ levels }) {
  const steps = levels || [
    { label: "1° pezzo", generated: "≈ 60", kept: Q.beam },
    { label: "2° pezzo", generated: `≈ ${Q.beam} × 60`, kept: Q.beam },
    { label: "3° pezzo", generated: `≈ ${Q.beam} × 60`, kept: Q.beam * 2 },
  ];
  return (
    <div className="flex flex-wrap items-stretch justify-center gap-2 text-center text-sm">
      {steps.map((s, i) => (
        <div key={i} className="flex items-center gap-2">
          <div className="rounded-xl bg-slate-900 px-3 py-2 ring-1 ring-slate-700">
            <div className="text-xs text-slate-400">{s.label}</div>
            <div className="text-white">
              {typeof s.generated === "number" ? fmt(s.generated, 0) : s.generated} sequenze
            </div>
            <div className="text-xs" style={{ color: "#fcd34d" }}>
              ne restano {s.kept}
            </div>
          </div>
          <span className="text-slate-500">→</span>
        </div>
      ))}
      <div className="rounded-xl px-3 py-2 ring-1" style={{ backgroundColor: "#1c1917", borderColor: "#fcd34d" }}>
        <div className="text-xs text-slate-400">pezzo ignoto</div>
        <div className="text-white">rischio stimato</div>
        <div className="text-xs" style={{ color: "#fcd34d" }}>
          vince la migliore
        </div>
      </div>
    </div>
  );
}

export default function GuideExpert({ snapshot }) {
  const example = useMemo(() => {
    if (!snapshot || !snapshot.tray[0]) return null;
    return explainQueue(snapshot.grid, snapshot.tray, snapshot.streak, 5);
  }, [snapshot]);

  const odds = example?.shapeOdds;
  const best = example?.leaves[0];

  return (
    <article className="mx-auto max-w-3xl space-y-10 px-4 py-8 text-slate-200">
      <header className="space-y-2 text-center">
        <h1 className="text-2xl font-semibold text-white">Come nascono i suggerimenti · modalità Esperto</h1>
        <p className="text-slate-400">
          In modalità Esperto il vassoio è una coda: si gioca sempre il primo pezzo, e gli altri due si vedono ma arrivano dopo, in
          quell&apos;ordine. Il problema per il computer cambia completamente: non si sceglie più <i>quale</i> pezzo giocare, solo{" "}
          <i>dove</i>, ma in compenso si conoscono con certezza i prossimi tre pezzi.
        </p>
      </header>

      <Section n={1} title="Il problema: troppe sequenze">
        <p>
          L&apos;idea naturale è provare tutte le sequenze di tre mosse: ogni posizione del primo pezzo, poi ogni posizione del
          secondo sul tabellone risultante, poi ogni posizione del terzo. Con circa 60 posizioni per pezzo sono 60 × 60 × 60 ≈{" "}
          <b>216.000 sequenze</b> da simulare e valutare a ogni mossa: troppe per rispondere in tempo reale.
        </p>
      </Section>

      <Section n={2} title="La soluzione: la «beam search»">
        <p>
          La beam search (ricerca «a fascio») esplora le sequenze un pezzo alla volta e, a ogni livello, tiene solo le più
          promettenti, scartando le altre prima di andare avanti:
        </p>
        <ol className="list-decimal space-y-1 pl-6">
          <li>
            prova tutte le posizioni del <b>1° pezzo</b>, dà un punteggio a ognuna e tiene le <b>{Q.beam}</b> migliori;
          </li>
          <li>
            da ognuna di queste prova tutte le posizioni del <b>2° pezzo</b>: le sequenze di due mosse ottenute vengono ordinate e
            ne restano di nuovo <b>{Q.beam}</b>;
          </li>
          <li>
            lo stesso con il <b>3° pezzo</b>, tenendo stavolta le <b>{Q.beam * 2}</b> migliori sequenze complete;
          </li>
          <li>per queste ultime si stima il rischio del pezzo ignoto (passo 4) e si sceglie la sequenza migliore.</li>
        </ol>
        <BeamDiagram />
        <p>
          Invece di 216.000 tabelloni se ne valutano circa 60 + {Q.beam}×60 + {Q.beam}×60 ≈ 1.300: un suggerimento richiede circa
          50 millisecondi. Il prezzo è che una sequenza scartata presto non viene più riconsiderata, anche se si sarebbe rivelata
          ottima più avanti.
        </p>
        <p>
          Se a un certo livello il pezzo non entra da nessuna parte, la ricerca si ferma lì e decide con le sequenze già trovate:
          così il computer gioca comunque la mossa migliore possibile anche quando la fine è vicina.
        </p>
      </Section>

      <Section n={3} title="Il punteggio di una sequenza">
        <p>Ogni sequenza (anche parziale) riceve un punteggio fatto di due parti:</p>
        <Note>
          <b>punteggio</b> = Σ sulle mosse della sequenza (punti × {Q.gain} + linee × {fmt(W.line)}) + voto del tabellone
          finale
        </Note>
        <p>
          Il <b>voto del tabellone</b> è lo stesso del gioco normale (vedi l&apos;altra pagina), senza la parte dei punti: celle
          murate {fmt(W.dead)}, celle con un solo vicino libero {fmt(W.hole)}, +{fmt(W.fit)} per ogni pezzo del catalogo che entra
          ancora, +{fmt(W.near)} per le linee quasi complete, +{fmt(W.empty)} per ogni cella vuota.
        </p>
        <p>
          La differenza importante è il <b>× {Q.gain} sui punti</b> (nel gioco normale è × 1). Con la coda non si può tenere da
          parte un pezzo comodo per dopo: ogni mossa che non svuota linee riempie il tabellone in modo irreversibile. Nelle
          simulazioni, premiare molto di più lo svuotamento immediato ha più che raddoppiato la durata delle partite (durata
          mediana da 38 a 84 pezzi, quando la strategia guardava solo due pezzi).
        </p>
      </Section>

      <Section n={4} title="Il pezzo ignoto">
        <p>
          Dopo i tre pezzi noti ne arriverà uno a caso. Non si sa quale, ma si sa con che probabilità esce ogni forma (dai pesi
          del catalogo). Per ognuna delle sequenze finali il computer guarda il tabellone finale e, per ogni forma, conta in quante
          posizioni potrebbe entrare (si ferma a 6: oltre non fa differenza):
        </p>
        <Table
          head={["Forma", "Probabilità di uscita"]}
          align={["", "r"]}
          rows={(odds || SHAPES.map((shape) => ({ shape, p: NaN }))).map(({ shape, p }) => [
            <span key="n" className="flex items-center gap-2">
              <span className="inline-block h-3 w-3 rounded-full" style={{ backgroundColor: PIECE_COLORS[shape.color] }} />
              {shape.name}
            </span>,
            Number.isNaN(p) ? "—" : pct(p),
          ])}
        />
        <Note>
          <b>rischio</b> = −{Q.unknownDeath} × (probabilità che il pezzo ignoto non entri da nessuna parte) + {Q.unknownRoom} ×
          (spazio medio)
          <br />
          <span className="text-slate-400">
            «Probabilità che non entri» = somma delle probabilità dei singoli orientamenti con 0 posizioni. «Spazio medio» = media, pesata con
            le probabilità di estrazione, di min(posizioni, 6) / 6: vale 1 se ogni orientamento ha almeno 6 posizioni, 0 se nessuno entra.
          </span>
        </Note>
        <p>
          La penalità è forte ({Q.unknownDeath}) perché un pezzo che non entra significa fine partita: una sequenza che lascia
          anche solo il 10% di probabilità di morte perde {fmt(Q.unknownDeath * 0.1, 0)} punti, più di quanto valga una linea.
        </p>
      </Section>

      <Section n={5} title="Si gioca una mossa, poi si ricalcola tutto">
        <p>
          Della sequenza vincente si gioca <b>solo la prima mossa</b>. Dopo la mossa la coda scorre e compare un pezzo nuovo:
          l&apos;informazione è cambiata, quindi alla mossa successiva l&apos;intera ricerca riparte da capo con i tre pezzi
          aggiornati. È la tecnica dell&apos;«orizzonte mobile»: pianificare sempre tre mosse avanti, ma impegnarsi solo sulla
          prima.
        </p>
      </Section>

      <Section n={6} title="Quanto rende">
        <p>100 partite simulate in modalità Esperto, con la stessa sequenza di pezzi per le due strategie:</p>
        <Table
          head={["Strategia", "Durata mediana", "Durata media", "Partita più lunga", "Punti medi"]}
          align={["", "r", "r", "r", "r"]}
          rows={[
            ["Precedente: 1° pezzo + 2° pezzo", "83", "101", "399", "784"],
            ["Attuale: tre pezzi (beam search) + pezzo ignoto", "245", "309", "1.587", "2.862"],
          ]}
        />
        <p>
          La strategia attuale è durata di più in 84 partite su 100 e di meno in 15 (una pari). Con queste regole, però, nessuna
          strategia è immortale: prima o poi arriva una serie di pezzi che non trova posto.
        </p>
      </Section>

      <Section n={7} title="Idee provate e scartate">
        <p>
          Non tutte le idee «ragionevoli» funzionano. Queste sono state provate sulle stesse partite simulate e scartate perché
          accorciavano le partite:
        </p>
        <Table
          head={["Idea", "Durata media", "Esito"]}
          align={["", "r", ""]}
          rows={[
            ["Riferimento (strategia a due pezzi)", "108", "—"],
            ["Penalità per zone vuote chiuse di 1–3 celle", "79 – 96", "peggio"],
            ["Premio per lo «scenario peggiore» (forma con meno posizioni)", "89 – 103", "peggio"],
            ["Penalità (4 − dimensione) × 25 per le zone piccole", "79", "peggio"],
          ]}
        />
        <p className="text-sm text-slate-400">
          Il motivo comune: penalità forti sui piccoli difetti del tabellone fanno rinunciare a svuotare linee, che in modalità
          Esperto è ciò che tiene in vita. (Durate misurate su 40 partite con la strategia a due pezzi.)
        </p>
      </Section>

      <Section n={8} title="Esempio dal tuo tabellone">
        {!example ? (
          <p>Il primo pezzo della coda non entra da nessuna parte: avvia una nuova partita e torna qui.</p>
        ) : (
          <>
            <p>
              La ricerca appena eseguita sul tuo tabellone attuale
              {snapshot.expert ? "" : " (trattando il vassoio come una coda, anche se stai giocando in modalità normale)"}:
            </p>
            <BeamDiagram
              levels={example.levels.map((l, i) => ({ label: `${i + 1}° pezzo · ${l.piece.name}`, generated: l.generated, kept: l.kept }))}
            />
            <p>
              Le {example.leaves.length} sequenze migliori. Ogni miniatura mostra una mossa sul tabellone in cui viene giocata (se
              una mossa svuota linee, la successiva parte dal tabellone già svuotato). La stella indica la sequenza scelta: si gioca
              solo la sua prima mossa.
            </p>
            <Table
              head={["", "Sequenza", "Mosse", "Tabellone", "Pezzo ignoto", "Totale"]}
              align={["", "", "r", "r", "r", "r"]}
              rows={example.leaves.map((leaf, i) => [
                <span key="s">{i === 0 ? "★" : i + 1}</span>,
                <SequenceBoards key="b" path={leaf.path} />,
                sign(leaf.acc),
                sign(leaf.board),
                sign(leaf.unknown.value),
                <b key="t">{fmt(leaf.v)}</b>,
              ])}
            />
            <p className="text-sm text-slate-400">
              «Mosse» = Σ (punti × {Q.gain} + linee × {fmt(W.line)}); «Tabellone» = voto del tabellone finale; «Pezzo ignoto» =
              rischio del passo 4. Totale = somma delle tre colonne.
            </p>
            <p>Il dettaglio del pezzo ignoto per la sequenza scelta:</p>
            <Table
              head={["Forma", "Probabilità", "Posizioni medie per orientamento (max 6)", "Spazio pesato"]}
              align={["", "r", "r", "r"]}
              rows={best.unknown.perShape.map((s) => [
                <span key="n" className="flex items-center gap-2">
                  <span className="inline-block h-3 w-3 rounded-full" style={{ backgroundColor: PIECE_COLORS[s.color] }} />
                  {s.name}
                </span>,
                pct(s.p),
                s.n === 0 ? <b key="z" style={{ color: "#fb7185" }}>0 · non entra</b> : s.n === 6 ? "6+" : fmt(s.n, 2),
                fmt((s.p * s.n) / 6, 3),
              ])}
            />
            <p>Il rischio pesa ogni orientamento con la sua probabilità di estrazione: una rotazione disponibile non rende giocabili le altre.</p>
            <Note tone={best.unknown.death > 0 ? "warn" : "ok"}>
              Probabilità che il pezzo ignoto non entri: <b>{pct(best.unknown.death)}</b> → −{Q.unknownDeath} ×{" "}
              {fmt(best.unknown.death, 3)} = {fmt(-Q.unknownDeath * best.unknown.death)}
              <br />
              Spazio medio: <b>{fmt(best.unknown.room, 3)}</b> → {Q.unknownRoom} × {fmt(best.unknown.room, 3)} ={" "}
              {fmt(Q.unknownRoom * best.unknown.room)}
              <br />
              Rischio totale: <b>{sign(best.unknown.value)}</b>
            </Note>
          </>
        )}
      </Section>
    </article>
  );
}
