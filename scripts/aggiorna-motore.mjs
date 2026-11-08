import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";

const root = fileURLToPath(new URL("../", import.meta.url));
const input = process.argv[2];
if (!input) throw new Error("Indica il pacchetto: npm run motore:aggiorna -- percorso/alveare-motore-VERSIONE.tgz");
const source = path.resolve(input);
const bytes = fs.readFileSync(source);
const tar = gunzipSync(bytes);
let pkg;
for (let offset = 0; offset + 512 <= tar.length;) {
  const header = tar.subarray(offset, offset + 512);
  const name = header.subarray(0, 100).toString().replace(/\0.*$/, "");
  const size = parseInt(header.subarray(124, 136).toString().replace(/\0.*$/, "").trim(), 8) || 0;
  if (name === "package/package.json") pkg = JSON.parse(tar.subarray(offset + 512, offset + 512 + size).toString());
  offset += 512 + Math.ceil(size / 512) * 512;
  if (!name) break;
}
if (pkg?.name !== "@alveare/motore" || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(pkg.version)) throw new Error("Il file non è una release valida di @alveare/motore");
const hash = (data) => createHash("sha256").update(data).digest("hex");
const digest = hash(bytes);
const sidecar = source + ".json";
if (fs.existsSync(sidecar)) {
  const manifest = JSON.parse(fs.readFileSync(sidecar));
  if (manifest.sha256 !== digest || manifest.version !== pkg.version) throw new Error("Impronta o versione del pacchetto non corrispondente al manifest");
}
const filename = `alveare-motore-${pkg.version}.tgz`;
const target = path.join(root, "vendor", filename);
fs.mkdirSync(path.dirname(target), { recursive: true });
if (fs.existsSync(target) && hash(fs.readFileSync(target)) !== digest) throw new Error(`La versione ${pkg.version} è già presente con contenuto diverso: crea una nuova versione.`);
if (!fs.existsSync(target)) fs.writeFileSync(target, bytes);
if (!process.env.npm_execpath) throw new Error("Esegui tramite npm run motore:aggiorna");
const result = spawnSync(process.execPath, [process.env.npm_execpath, "install", "--save-exact", "--ignore-scripts", "--no-audit", "--no-fund", `./vendor/${filename}`], { cwd: root, stdio: "inherit" });
if (result.status !== 0) process.exit(result.status || 1);
fs.writeFileSync(target + ".json", JSON.stringify({ name: pkg.name, version: pkg.version, sha256: digest }, null, 2) + "\n");
console.log(`Installato motore ${pkg.version}. Esegui test e build prima di adottarlo.`);
