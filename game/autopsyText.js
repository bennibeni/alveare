/**
 * Giudizio dettagliato di una mossa nell'autopsia della partita: frasi semplici costruite dai
 * numeri (celle libere, posizioni dei pezzi, quota di futuri senza scampo di ogni mossa).
 *
 * position: { free, tray: [{ slot, name, count }] }
 * rows:     una per mossa: { slot, name, cells (numeri), free, lines, lost (0–1), others:
 *           [{ slot, name, count }], played, suggested }
 * judgment: giudizio del gioco sulla mossa giocata ({ label, clearlyBetter }) o null
 */

/** Frazione semplice vicina a p: «circa 2 su 3», «circa 1 su 50». */
export function aboutFraction(p) {
  if (p <= 0) return "mai";
  if (p >= 1) return "sempre";
  if (p < 0.01) return "meno di 1 su 100";
  if (p > 0.99) return "più di 99 su 100";
  let best = null;
  const consider = (k, d) => {
    const err = Math.abs(p - k / d) / p;
    if (!best || err < best.err - 1e-9) best = { k, d, err };
  };
  for (let d = 2; d <= 10; d++) {
    const k = Math.round(p * d);
    if (k >= 1 && k < d) consider(k, d);
  }
  if (p < 0.5) consider(1, Math.round(1 / p));
  else {
    const d = Math.round(1 / (1 - p));
    consider(d - 1, d);
  }
  return `circa ${best.k} su ${best.d}`;
}

/** Differenze di rischio fino a questa soglia sono nel rumore dei futuri a caso. */
export const NOISE = 0.02;

export const percent = (p) => `${Math.round(100 * p)}%`;
// articolo davanti alla percentuale: «lo 0%», «l'8%», «il 63%»
function article(p) {
  const n = Math.round(100 * p);
  if (n === 0) return "lo";
  if (n === 1 || n === 11 || String(n)[0] === "8") return "l’";
  return "il";
}
/** «il 63%», «l’8%», «lo 0%» */
export const thePercent = (p) =>
  `${article(p)}${article(p) === "l’" ? "" : " "}${percent(p)}`;
/** «nel 63%», «nell’8%», «nello 0%» */
export const inPercent = (p) => {
  const a = article(p);
  return `${a === "il" ? "nel " : a === "lo" ? "nello " : "nell’"}${percent(p)}`;
};
const places = (n) =>
  n === 0 ? "in nessun posto" : n === 1 ? "in 1 posto" : `in ${n} posti`;
const listAnd = (xs) =>
  xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} e ${xs.at(-1)}`;
const moveText = (r) =>
  `${r.n ? `mossa ${r.n} dell’elenco, ` : ""}pezzo ${r.slot + 1}, ${r.name}, ${r.cells.length === 1 ? "cella" : "celle"} ${r.cells.join(", ")}`;
const othersText = (r) =>
  listAnd(
    [...r.others]
      .sort((a, b) => a.slot - b.slot)
      .map((o) => `pezzo ${o.slot + 1}, ${o.name}, ${places(o.count)}`),
  );

/** La mossa più sicura: meno futuri senza scampo, a parità la suggerita, poi più celle libere. */
export function safestRow(rows) {
  return [...rows].sort(
    (a, b) => a.lost - b.lost || b.suggested - a.suggested || b.free - a.free,
  )[0];
}

export function detailedJudgment({ position, rows, judgment }) {
  const played = rows.find((r) => r.played);
  const best = safestRow(rows);
  if (!played || !best) return [];
  const out = [];

  // 1. la posizione
  const trayText = position.tray.map(
    (t) =>
      `pezzo ${t.slot + 1}, ${t.name} (${places(t.count).replace("in ", "")})`,
  );
  let p1 = `Prima della mossa: ${position.free} celle libere. Nel vassoio: ${listAnd(trayText)}.`;
  const names = position.tray.map((t) => t.name);
  const twin = position.tray.find((t, i) => names.indexOf(t.name) !== i);
  if (twin) {
    const same = rows.filter((r) => r.name === twin.name);
    const contended =
      same.length > 0 &&
      same.every((r) =>
        r.others.some((o) => o.name === twin.name && o.count === 0),
      );
    if (contended)
      p1 += ` I due pezzi ${twin.name} si contendono gli stessi posti: uno dei due resta comunque nel vassoio.`;
  }
  p1 +=
    best.lost === 0
      ? " Con la mossa più sicura non si restava senza scampo in nessuno dei futuri provati: la posizione era ancora buona."
      : ` Anche con la mossa più sicura si restava senza scampo ${inPercent(best.lost)} dei futuri (${aboutFraction(best.lost)})${best.lost >= 0.5 ? ": la posizione era già compromessa" : ""}.`;
  out.push(p1);

  // 2. la mossa scelta
  let p2 = `Mossa scelta: ${moveText(played)}.`;
  if (judgment?.label) {
    p2 += ` Giudizio del gioco: «${judgment.label}»`;
    const n = judgment.clearlyBetter || 0;
    if (n)
      p2 += `, con ${n} ${n === 1 ? "mossa nettamente migliore" : "mosse nettamente migliori"}`;
    p2 += ".";
  }
  out.push(p2);

  // 3. confronto con la più sicura
  const safeEnough = played.lost - best.lost <= NOISE;
  if (safeEnough) {
    const k = rows.filter((r) => r.lost - best.lost <= NOISE).length;
    const among =
      k > 1
        ? `È fra le ${k} mosse più sicure, a pari merito`
        : "È la mossa più sicura";
    out.push(
      played.lost === 0
        ? `${among}: dopo la mossa non si resta senza scampo in nessuno dei futuri provati.`
        : `${among}: dopo la mossa si resta senza scampo ${inPercent(played.lost)} dei futuri (${aboutFraction(played.lost)}).`,
    );
  } else {
    const worse = rows.filter((r) => r.lost > played.lost + 1e-9).length;
    out.push(
      `Dopo la mossa si resta senza scampo ${inPercent(played.lost)} dei futuri (${aboutFraction(played.lost)}), contro ${thePercent(best.lost)} della mossa più sicura: ${moveText(best)}${best.suggested ? ", che era anche il suggerimento" : ""}. ${worse === 0 ? "Nessuna mossa era più rischiosa." : `Mosse più rischiose: ${worse} su ${rows.length}.`}`,
    );
    // 4. perché
    let p4 = "";
    if (played.others.length && best.others.length)
      p4 += `Dopo la tua mossa restano ${othersText(played)}; dopo la più sicura ${othersText(best)}. `;
    if (best.lines > played.lines)
      p4 += `La più sicura svuota ${best.lines === 1 ? "una linea" : `${best.lines} linee`} e lascia ${best.free} celle libere, contro ${played.free}.`;
    else if (best.free === played.free)
      p4 += `Le celle libere sono le stesse (${played.free}): conta la forma dello spazio che resta, non quanto ne resta.`;
    else
      p4 += `Celle libere dopo la mossa: ${played.free}, con la più sicura ${best.free}.`;
    out.push(p4.trim());
  }

  // 5. possibilità di proseguire
  const go = 1 - played.lost;
  out.push(
    go >= 1
      ? "Possibilità di proseguire dopo la mossa: in tutti i futuri provati."
      : `Possibilità di proseguire dopo la mossa: ${percent(go)} (${aboutFraction(go)}), anche giocando alla perfezione i pezzi che arrivano.`,
  );
  return out;
}

/**
 * Verdetto dell'autopsia. decisive: { played, best } della mossa decisiva (rischio con pezzi
 * qualsiasi), oppure null finché non è calcolato.
 */
export function verdictText(autopsy, decisive = null) {
  if (autopsy.decisive < 0)
    return autopsy.steps[0].result === "bloccata"
      ? `Senza scampo già dalla mossa ${autopsy.steps[0].number}, con i pezzi arrivati.`
      : "Esito non calcolato per tutte le mosse.";
  const n = autopsy.steps[autopsy.decisive].number;
  const base = `Mossa decisiva: ${n}. Con i pezzi arrivati, dopo questa mossa non c’era più scampo.`;
  if (!decisive?.played || !decisive.best) return base;
  const { played, best } = decisive;
  if (played.lost <= NOISE)
    return `Mossa decisiva: ${n}, ma era una mossa sicura: con pezzi qualsiasi si restava senza scampo ${inPercent(played.lost)} dei futuri. La sconfitta è venuta dai pezzi arrivati dopo: sfortuna, non un errore.`;
  if (played.lost - best.lost <= NOISE)
    return `${base} Nessuna mossa era molto più sicura: anche la migliore restava senza scampo ${inPercent(best.lost)} dei futuri.`;
  return `Mossa decisiva: ${n}, ed è stato un errore: dopo la mossa si restava senza scampo ${inPercent(played.lost)} dei futuri, contro ${thePercent(best.lost)} della mossa più sicura.`;
}
