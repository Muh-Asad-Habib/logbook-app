// Server statis khusus audit: tanpa backend, .env, database, atau layanan cloud.
// node tools/serve-audit.mjs [folder hasil ekspor]; default port 3101.
import express from "express";
import { readdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = process.argv[2]
  ? resolve(process.argv[2])
  : fileURLToPath(new URL("../frontend/out/", import.meta.url));
if (!existsSync(resolve(root, "index.html"))) throw new Error("Ekspor frontend belum tersedia; jalankan npm run build dahulu.");
const app = express();
// Next export membuat kegiatan.html DAN folder kegiatan/. express.static saja
// tidak mencoba ekstensi .html ketika folder itu ada dan redirect dimatikan.
// Daftar berasal dari hasil build, bukan path mentah request (anti traversal).
for (const name of readdirSync(root).filter((file) => file.endsWith(".html"))) {
  const route = name === "index.html" ? "/" : `/${name.slice(0, -5)}`;
  app.get(route, (_req, res) => res.sendFile(name, { root }));
}
app.use(express.static(root, { extensions: ["html"], redirect: false }));
app.use((_req, res) => res.status(404).sendFile("404.html", { root }));
const port = Number(process.env.AUDIT_PORT || 3101);
app.listen(port, "127.0.0.1", () => console.log(`Audit statis: http://127.0.0.1:${port} (API harus ditiru oleh pengujian)`));

