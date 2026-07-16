/**
 * Diagnosis foto: periksa SEMUA foto_keys/bukti_key di database —
 * ada di tabel files? ada di ImageKit (cek HTTP)? ada di uploads/ lokal?
 * Baca-saja. Jalankan: node backend/diag-foto.mjs
 */
import fs from "node:fs";
import { q } from "./src/db.js";
import * as store from "./src/storage.js";
import { pakaiCloud, signedUrl, safePath } from "./src/files.js";

console.log("mode cloud (ImageKit):", pakaiCloud());

const ownerId = await store.getMeta("templateOwnerId");
const keg = await store.listKegiatan(ownerId);
const keu = await store.listKeuangan(ownerId);

const semua = [];
for (const e of keg) for (const k of e.foto_keys || []) semua.push({ k, src: `keg ${e.tanggal}` });
for (const e of keu) if (e.bukti_key) semua.push({ k: e.bukti_key, src: `keu ${e.tanggal}` });
console.log(`total referensi foto di DB: ${semua.length}\n`);

const fileRows = await q("SELECT key, file_id FROM files");
const filePeta = new Map(fileRows.map((r) => [r.key, r.file_id]));

let rusak = 0;
for (const { k, src } of semua) {
  const diTabel = filePeta.has(k);
  let diCloud = "-";
  if (pakaiCloud()) {
    try {
      const res = await fetch(signedUrl(k, 120), { method: "HEAD" });
      diCloud = res.ok ? "OK" : `HTTP ${res.status}`;
    } catch (e) {
      diCloud = "ERR " + e.message.slice(0, 30);
    }
  }
  let diLokal = false;
  try { diLokal = fs.existsSync(safePath(k)); } catch {}
  const beres = diCloud === "OK";
  if (!beres) rusak += 1;
  console.log(`${beres ? "✅" : "❌"} [${src}] ${k}`);
  console.log(`     tabel files: ${diTabel ? "ya" : "TIDAK"} | ImageKit: ${diCloud} | uploads lokal: ${diLokal ? "ya" : "tidak"}`);
}
console.log(`\n${rusak === 0 ? "SEMUA FOTO SEHAT" : `${rusak} FOTO BERMASALAH`}`);

