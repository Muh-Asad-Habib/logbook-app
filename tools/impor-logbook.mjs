/**
 * Impor logbook kegiatan (.docx) langsung ke akun tim tertentu — tanpa login,
 * memakai mesin impor yang sama dengan endpoint /api/import/docx.
 * Hanya bisa dijalankan pemegang DATABASE_URL (file .env), seperti superuser.mjs.
 *
 * Pakai (dari folder logbook-app):
 *   node tools/impor-logbook.mjs
 *     -> impor "berkas.docx" ke akun "Nama Akun"
 *   node tools/impor-logbook.mjs --file "jalur/berkas.docx" --user "Nama Akun"
 *
 * Aman diulang: entri (dan foto) yang sudah ada dilewati, bukan diduplikasi.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as store from "../backend/src/storage.js"; // ikut memuat .env via config.js
import { importDocx } from "../backend/src/import/docx.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

// --- baca argumen ---
const args = process.argv.slice(2);
const ambil = (flag) => {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] ? args[i + 1] : null;
};

const fileArg = ambil("--file") || "berkas.docx";
const userArg = ambil("--user") || "Nama Akun";
const filePath = path.isAbsolute(fileArg) ? fileArg : path.join(ROOT, fileArg);

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL belum diisi — buat file .env dulu (lihat .env.example / DEPLOY.md).");
  process.exit(1);
}
if (!fs.existsSync(filePath)) {
  console.error(`Berkas tidak ditemukan: ${filePath}`);
  process.exit(1);
}

// --- cari akun tujuan (pencarian username tidak peka kapital) ---
const user = await store.findUserByUsername(userArg);
if (!user) {
  console.error(`Akun "${userArg}" tidak ditemukan di database.`);
  process.exit(1);
}
if (user.role && user.role !== "tim") {
  console.error(`Akun "${user.username}" berperan '${user.role}' — impor hanya untuk akun tim.`);
  process.exit(1);
}

const buffer = fs.readFileSync(filePath);
console.log(`Berkas : ${path.basename(filePath)} (${(buffer.length / 1024 / 1024).toFixed(1)} MB)`);
console.log(`Akun   : ${user.username} (id ${user.id})`);
console.log("Mengimpor… (foto ikut diunggah, bisa memakan waktu)\n");

const hasil = await importDocx(buffer, user.id);

console.log("== HASIL IMPOR ==");
console.log(`Kegiatan baru     : ${hasil.keg_baru ?? 0}`);
console.log(`Kegiatan dilewati : ${hasil.keg_lewat ?? 0} (sudah ada)`);
console.log(`Keuangan baru     : ${hasil.keu_baru ?? 0}`);
console.log(`Keuangan dilewati : ${hasil.keu_lewat ?? 0} (sudah ada)`);
if (hasil.warnings?.length) {
  console.log(`\nPeringatan (${hasil.warnings.length}):`);
  for (const w of hasil.warnings) console.log(`  - ${w}`);
}
console.log("\nSelesai.");
process.exit(0);

