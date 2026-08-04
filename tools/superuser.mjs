/**
 * Akses khusus pemilik aplikasi: setel ulang kredensial panel admin.
 * Hanya bisa dijalankan oleh orang yang memegang DATABASE_URL (file .env) —
 * inilah "kunci cadangan" bila kredensial panel terlupa.
 *
 * Pakai (dari folder logbook-app):
 *   node tools/superuser.mjs                        -> kredensial acak baru
 *   node tools/superuser.mjs -u NAMA -p SANDI       -> tentukan sendiri
 *   node tools/superuser.mjs --path /jalur-panel    -> ganti alamat panel
 *
 * Catatan: database hanya menyimpan HASH scrypt — menjalankan tool ini
 * adalah SATU-SATUNYA cara memulihkan akses (nilai lama tak bisa dibaca).
 */
import crypto from "node:crypto";
import { q, pastikanSkema } from "../backend/src/db.js"; // ikut memuat .env

const MAXMEM = 128 * 1024 * 1024;
function hashStrong(v) {
  const salt = crypto.randomBytes(32).toString("hex");
  const hash = crypto
    .scryptSync(String(v), Buffer.from(salt, "hex"), 64, { N: 2 ** 15, r: 8, p: 1, maxmem: MAXMEM })
    .toString("hex");
  return `s2:32768:8:1:${salt}:${hash}`;
}

// --- baca argumen ---
const args = process.argv.slice(2);
const ambil = (flag) => {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] ? args[i + 1] : null;
};

let username = ambil("-u") || ambil("--user");
let password = ambil("-p") || ambil("--pass");
const panel = ambil("--path");

if (!username && !password && !panel) {
  username = "penjaga-" + crypto.randomBytes(3).toString("hex");
  password = crypto.randomBytes(12).toString("base64url");
}

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL belum diisi — buat file .env dulu (lihat .env.example / DEPLOY.md).");
  process.exit(1);
}

await pastikanSkema();

// --- muat / siapkan kredensial di tabel meta ---
const rows = await q("SELECT nilai FROM meta WHERE kunci = 'admin'");
let admin;
if (rows[0]?.nilai) {
  admin = JSON.parse(rows[0].nilai);
} else {
  admin = { v: 1, path: "/pusat-kendali", createdAt: new Date().toISOString() };
  if (!username) username = "penjaga-" + crypto.randomBytes(3).toString("hex");
  if (!password) password = crypto.randomBytes(12).toString("base64url");
}

if (username) admin.user = hashStrong(username.trim().toLowerCase());
if (password) admin.pass = hashStrong(password);
if (panel) {
  let p = panel.trim();
  if (!p.startsWith("/")) p = "/" + p;
  if (p.startsWith("/api") || p === "/" || p === "/docs") {
    console.error("Path panel tidak boleh /, /api..., atau /docs");
    process.exit(1);
  }
  admin.path = p.replace(/\/+$/, "");
}
admin.updatedAt = new Date().toISOString();

await q(
  `INSERT INTO meta (kunci, nilai) VALUES ('admin', $1)
   ON CONFLICT (kunci) DO UPDATE SET nilai = EXCLUDED.nilai`,
  [JSON.stringify(admin)]
);
// keluarkan semua sesi panel lama
await q("DELETE FROM admin_sessions");

console.log("=".repeat(60));
console.log("Kredensial panel admin diperbarui. CATAT SEKARANG —");
console.log("nilai ini TIDAK BISA dilihat lagi (tersimpan sebagai hash):");
console.log("");
console.log(`  Alamat panel : ${admin.path}`);
if (username) console.log(`  Username     : ${username}`);
if (password) console.log(`  Password     : ${password}`);
console.log("");
console.log("Semua sesi panel lama otomatis dikeluarkan.");
console.log("=".repeat(60));
process.exit(0);

