/**
 * BACKUP akun logbook:
 * 1) dump JSON lengkap ke data/backup-<nama>-<tanggal>.json
 * 2) buat akun baru "<nama> Backup" berisi salinan kegiatan, keuangan,
 *    dan pengaturan dana_awal (kode_tim TIDAK disalin — harus unik per tim).
 * Pakai: node tools/backup-akun.mjs "Amerta Sign"
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { q } from "../backend/src/db.js";
import { createUser } from "../backend/src/storage.js";

const nama = process.argv[2] || "Amerta Sign";
const users = await q("SELECT * FROM users WHERE username_lower = $1", [nama.toLowerCase()]);
if (!users.length) { console.error("Akun tidak ditemukan:", nama); process.exit(1); }
const u = users[0];

const [keg, keu, set, lap, pres, kom] = await Promise.all([
  q("SELECT * FROM kegiatan WHERE user_id = $1 ORDER BY tanggal, created_at", [u.id]),
  q("SELECT * FROM keuangan WHERE user_id = $1 ORDER BY tanggal, created_at", [u.id]),
  q("SELECT * FROM pengaturan WHERE user_id = $1", [u.id]),
  q("SELECT user_id, nama, ukuran, file_key, updated_at FROM laporan_docx WHERE user_id = $1", [u.id]),
  q("SELECT * FROM presentasi WHERE user_id = $1", [u.id]),
  q("SELECT * FROM komentar WHERE tim_user_id = $1", [u.id]),
]);

// ---- 1) dump JSON lokal ----
const tglFile = new Date().toISOString().slice(0, 10);
const fileDump = path.resolve("data", `backup-${nama.toLowerCase().replace(/\s+/g, "-")}-${tglFile}.json`);
fs.mkdirSync(path.dirname(fileDump), { recursive: true });
fs.writeFileSync(fileDump, JSON.stringify({
  dibuat: new Date().toISOString(),
  user: { id: u.id, username: u.username, role: u.role, created_at: u.created_at },
  kegiatan: keg, keuangan: keu, pengaturan: set,
  laporan_docx: lap, presentasi: pres, komentar: kom,
}, null, 2));
console.log(`Dump JSON  : ${fileDump} (${keg.length} kegiatan, ${keu.length} keuangan)`);

// ---- 2) akun salinan ----
const namaBackup = `${u.username} Backup`;
const sudah = await q("SELECT id FROM users WHERE username_lower = $1", [namaBackup.toLowerCase()]);
if (sudah.length) { console.error(`Akun "${namaBackup}" sudah ada — batal agar tidak menimpa.`); process.exit(1); }

const sandi = "Backup-" + crypto.randomBytes(6).toString("base64url");
const baru = await createUser(namaBackup, sandi, "tim");

for (const e of keg) {
  const fk = typeof e.foto_keys === "string" ? e.foto_keys : JSON.stringify(e.foto_keys || []);
  await q(
    `INSERT INTO kegiatan (id, user_id, tanggal, kegiatan, capaian_delta, waktu_menit, foto_keys, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [crypto.randomUUID(), baru.id, e.tanggal, e.kegiatan, e.capaian_delta, e.waktu_menit, fk, e.created_at]
  );
}
for (const e of keu) {
  const bk = typeof e.bukti_keys === "string" ? e.bukti_keys : JSON.stringify(e.bukti_keys || []);
  await q(
    `INSERT INTO keuangan (id, user_id, tanggal, item, harga_satuan, satuan_suffix, jumlah, total, bukti_key, bukti_keys, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [crypto.randomUUID(), baru.id, e.tanggal, e.item, e.harga_satuan, e.satuan_suffix, e.jumlah, e.total, e.bukti_key || "", bk, e.created_at]
  );
}
for (const s of set) {
  if (s.kunci === "kode_tim") continue; // kode join tim harus unik
  await q(
    `INSERT INTO pengaturan (user_id, kunci, nilai) VALUES ($1, $2, $3)
     ON CONFLICT (user_id, kunci) DO UPDATE SET nilai = $3`,
    [baru.id, s.kunci, s.nilai]
  );
}

const cekK = await q("SELECT COUNT(*) AS n FROM kegiatan WHERE user_id = $1", [baru.id]);
const cekU = await q("SELECT COUNT(*) AS n FROM keuangan WHERE user_id = $1", [baru.id]);
console.log(`Akun backup: "${namaBackup}" (id ${baru.id})`);
console.log(`  Password : ${sandi}`);
console.log(`  Tersalin : ${cekK[0].n} kegiatan, ${cekU[0].n} keuangan, ${set.length - set.filter(s=>s.kunci==="kode_tim").length} pengaturan`);
console.log(`CATATAN: foto memakai berkas yang sama dengan akun utama — JANGAN hapus`);
console.log(`entri/foto lewat akun backup, karena berkas fisiknya dipakai bersama.`);

