import { compareCandidate } from "./trapComparison.js";

self.onmessage = ({ data }) => {
  try {
    const result = compareCandidate(data, (progress) =>
      self.postMessage({ progress }),
    );
    self.postMessage({ result });
  } catch (error) {
    self.postMessage({ error: error.message });
  }
};
