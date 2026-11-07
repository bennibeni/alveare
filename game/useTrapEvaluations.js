"use client";

import { useMemo, useSyncExternalStore } from "react";
import {
  ARCHIVE_EVENT,
  ARCHIVE_KEY,
  EVALUATIONS_KEY,
  readTrapEvaluations,
} from "./trapArchive.js";

const keys = [ARCHIVE_KEY, EVALUATIONS_KEY];
const empty = JSON.stringify([null, null]);
function subscribe(callback) {
  window.addEventListener(ARCHIVE_EVENT, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(ARCHIVE_EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}
function snapshot() {
  try {
    return JSON.stringify(keys.map((key) => window.localStorage.getItem(key)));
  } catch {
    return "error";
  }
}
export default function useTrapEvaluations() {
  const raw = useSyncExternalStore(subscribe, snapshot, () => empty);
  return useMemo(() => {
    try {
      const values = JSON.parse(raw);
      return {
        records: readTrapEvaluations({
          getItem: (key) => values[keys.indexOf(key)],
        }),
        error: false,
      };
    } catch {
      return { records: [], error: true };
    }
  }, [raw]);
}
