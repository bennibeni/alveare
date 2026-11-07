export const ARCHIVE_KEY = "alveare-trappole-migliori-v1";
export const EVALUATIONS_KEY = "alveare-trappole-valutazioni-v1";
export const ARCHIVE_EVENT = "alveare-trap-archive-changed";
const notifyArchive = () => {
  if (typeof window !== "undefined")
    window.dispatchEvent(new Event(ARCHIVE_EVENT));
};
export const trapRecordId = (trap, step, chosen, strategyId) =>
  `trappola-${trap.seed}-${trap.pezzo}-${trap.k}#${step + 1}|${chosen.idx},${chosen.q},${chosen.r}|${strategyId}|paired-v1`;
export function readTrapEvaluations(storage) {
  const raw = storage.getItem(EVALUATIONS_KEY);
  const evaluations = raw ? JSON.parse(raw).records : [];
  if (!Array.isArray(evaluations)) throw new Error("Storico non leggibile");
  const merged = new Map(readTrapArchive(storage).map((r) => [r.id, r]));
  for (const record of evaluations) merged.set(record.id, record);
  return [...merged.values()];
}
export function saveTrapEvaluation(storage, record) {
  const records = readTrapEvaluations(storage).filter(
    (r) => r.id !== record.id,
  );
  records.push(record);
  storage.setItem(EVALUATIONS_KEY, JSON.stringify(archiveOf(records)));
  if (record.stato === "confermata") saveTrapRecord(storage, record);
  notifyArchive();
  return records;
}
export function archiveOf(records) {
  return {
    format: "alveare-mosse-umane",
    version: 1,
    notes:
      "Confronti appaiati dalle trappole: a = tua mossa, b = mossa storica fa730f6; continuazioni con la strategia corrente. Punti meno 1000 per blocco, 15 mosse successive. Conferma indipendente: vantaggio oltre 2 errori standard.",
    records,
  };
}
export function readTrapArchive(storage) {
  const raw = storage.getItem(ARCHIVE_KEY);
  if (!raw) return [];
  const archive = JSON.parse(raw);
  if (
    archive.format !== "alveare-mosse-umane" ||
    !Array.isArray(archive.records)
  )
    throw new Error("Archivio locale non leggibile");
  return archive.records;
}
export function saveTrapRecord(storage, record) {
  const records = readTrapArchive(storage);
  const previous = records.findIndex((r) => r.id === record.id);
  if (previous >= 0) records[previous] = record;
  else records.push(record);
  storage.setItem(ARCHIVE_KEY, JSON.stringify(archiveOf(records)));
  notifyArchive();
  return records;
}
