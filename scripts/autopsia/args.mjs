/** Opzioni da riga di comando nella forma --nome valore. */
export function parseArgs(defaults) {
  const out = { ...defaults };
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++)
    if (argv[i].startsWith("--")) {
      const k = argv[i].slice(2);
      const v = argv[i + 1];
      out[k] = typeof defaults[k] === "number" ? Number(v) : v;
      i++;
    }
  return out;
}
