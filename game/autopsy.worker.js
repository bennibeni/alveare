import { buildAutopsy, moveRisks } from "./autopsy.js";

// Autopsia della partita e rischio delle mosse, fuori dal thread dell'interfaccia.
self.onmessage = ({ data }) => {
  const { id, type, input } = data;
  try {
    const result = type === "risks" ? moveRisks(input) : buildAutopsy(input);
    self.postMessage({ id, result });
  } catch (error) {
    self.postMessage({ id, error: error.message });
  }
};
