/**
 * Diagnosa JALUR IMPOR .docx LANGSUNG browser → ImageKit.
 *
 * Alur: /api/import/izin-unggah → unggah bagian ke upload.imagekit.io →
 * /api/import/docx/langsung (server verifikasi metadata, tarik dari CDN,
 * jalankan impor, HAPUS berkas sementara).
 *
 * Skrip ini meniru browser (benar-benar mengunggah ke ImageKit), jadi butuh
 * internet + env IMAGEKIT_*. Dokumen yang dipakai: template resmi bawaan
 * (tabel kosong) — impornya sah tetapi tidak menambah entri apa pun.
 *
 * Jalankan dari folder backend (server harus hidup):
 *   node diag-impor-langsung.mjs
 */
import fs from "node:fs";
import * as store from "./src/storage.js";
import { q } from "./src/db.js";
import { config } from "./src/config.js";
import { pakaiCloud } from "./src/files.js";

const BASE = process.env.DIAG_BASE || "http://localhost:4000";
const suf = Date.now().toString(36);
const NAMA_TIM = `uji-imp-tim-${suf}`;
const NAMA_DOS = `uji-imp-dos-${suf}`;
const SANDI = "Rahasia123!";

const H = (tok) => ({ Authorization: `Bearer ${tok}` });
const HJ = (tok) => ({ ...H(tok), "Content-Type": "application/json" });

const jfetch = async (path, opt = {}) => {
  const res = await fetch(`${BASE}${path}`, opt);
  let body = null;
  try { body = await res.json(); } catch {}
  return { status: res.status, body };
};

let lulus = 0, gagal = 0;
const cek = (nama, kondisi, info = "") => {
  if (kondisi) { lulus++; console.log(`  OK    ${nama}`); }
  else { gagal++; console.log(`  GAGAL ${nama} ${info}`); }
};

async function unggahBagianIK(dasar, izin, key, potong) {
  const fd = new FormData();
  fd.append("file", new Blob([potong]), key);
  fd.append("fileName", key);
  fd.append("folder", dasar.folder);
  fd.append("useUniqueFileName", "false");
  fd.append("publicKey", dasar.publicKey);
  fd.append("token", izin.token);
  fd.append("expire", String(izin.expire));
  fd.append("signature", izin.signature);
  const res = await fetch(dasar.uploadUrl, { method: "POST", body: fd });
  const info = await res.json().catch(() => null);
  if (!res.ok || !info?.fileId) {
    throw new Error(`unggah bagian gagal: ${info?.message || res.status}`);
  }
  return { key, fileId: info.fileId };
}

async function imporLangsung(tok, buffer, nama) {
  const izinRes = await jfetch("/api/import/izin-unggah", {
    method: "POST", headers: HJ(tok),
    body: JSON.stringify({ nama, ukuran: buffer.length }),
  });
  if (izinRes.status !== 200) throw new Error(`izin gagal: ${JSON.stringify(izinRes.body)}`);
  const z = izinRes.body;
  if (z.mode !== "langsung") throw new Error("server tidak dalam mode cloud");
  const terunggah = [];
  for (let i = 0; i < z.jumlah; i++) {
    const potong = buffer.subarray(i * z.partMax, (i + 1) * z.partMax);
    terunggah.push(await unggahBagianIK(z, z.izin[i], z.bagian[i], potong));
  }
  const hasil = await jfetch("/api/import/docx/langsung", {
    method: "POST", headers: HJ(tok),
    body: JSON.stringify({ stem: z.stem, jumlah: z.jumlah, tanda: z.tanda, bagian: terunggah }),
  });
  return { izin: z, hasil, bagian: terunggah };
}

const adaDiKatalog = async (key) =>
  (await q("SELECT 1 FROM files WHERE key = $1", [key])).length > 0;

let timId = "", dosId = "";
try {
  if (!pakaiCloud()) {
    console.log("LEWATI: env IMAGEKIT_* tidak terpasang (mode lokal).");
    process.exit(0);
  }

  console.log("== Persiapan akun uji ==");
  const tim = await store.createUser(NAMA_TIM, SANDI, "tim");
  const dos = await store.createUser(NAMA_DOS, SANDI, "dosen");
  timId = tim.id; dosId = dos.id;
  const tokTim = await store.createSession(timId);
  const tokDos = await store.createSession(dosId);
  cek("akun tim & dosen siap", !!tokTim && !!tokDos);

  console.log("\n== Impor dokumen valid (template bawaan) ==");
  const docx = fs.readFileSync(config.templatePath);
  const a = await imporLangsung(tokTim, docx, "template-logbook.docx");
  cek("izin-unggah → mode langsung, 1 bagian", a.izin.jumlah === 1, String(a.izin.jumlah));
  cek("tanda izin berisi 32 hex", /^[a-f0-9]{32}$/.test(String(a.izin.tanda)), String(a.izin.tanda));
  cek("docx/langsung → 200", a.hasil.status === 200, JSON.stringify(a.hasil.body));
  cek("respons berisi ringkasan impor (keg_baru/keu_baru)",
    a.hasil.body && "keg_baru" in a.hasil.body && "keu_baru" in a.hasil.body,
    JSON.stringify(a.hasil.body));
  // Berkas impor hanya sementara → harus lenyap dari katalog `files`
  await new Promise((r) => setTimeout(r, 1500));
  cek("berkas sementara dihapus dari katalog files",
    !(await adaDiKatalog(a.bagian[0].key)), a.bagian[0].key);

  console.log("\n== Berkas bukan .docx ==");
  const bukan = Buffer.alloc(64 * 1024, 0x41); // tanpa tanda tangan ZIP "PK"
  const b = await imporLangsung(tokTim, bukan, "palsu.docx");
  cek("docx/langsung berkas non-ZIP → 400", b.hasil.status === 400, JSON.stringify(b.hasil.body));
  await new Promise((r) => setTimeout(r, 1500));
  cek("berkas sementara tetap dibersihkan walau gagal",
    !(await adaDiKatalog(b.bagian[0].key)), b.bagian[0].key);

  console.log("\n== Pagar keamanan ==");
  let r = await jfetch("/api/import/docx/langsung", {
    method: "POST", headers: HJ(tokTim),
    body: JSON.stringify({ stem: a.izin.stem, jumlah: 1, tanda: "0".repeat(32), bagian: [] }),
  });
  cek("tanda palsu → 400", r.status === 400, JSON.stringify(r.body));

  r = await jfetch("/api/import/izin-unggah", {
    method: "POST", headers: HJ(tokTim),
    body: JSON.stringify({ nama: "raksasa.docx", ukuran: 400 * 1024 * 1024 }),
  });
  cek("izin-unggah > 300 MB → 400", r.status === 400, JSON.stringify(r.body));

  r = await jfetch("/api/import/izin-unggah", {
    method: "POST", headers: HJ(tokDos),
    body: JSON.stringify({ nama: "dosen.docx", ukuran: 1024 }),
  });
  cek("dosen TIDAK boleh mengimpor → 403", r.status === 403, String(r.status));

  r = await jfetch("/api/import/izin-unggah", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nama: "anon.docx", ukuran: 1024 }),
  });
  cek("tanpa login → 401", r.status === 401, String(r.status));

  console.log(`\n== HASIL: ${lulus} lulus, ${gagal} gagal ==`);
} catch (err) {
  console.error("ERROR:", err);
  gagal++;
} finally {
  if (timId) await store.deleteUser(timId).catch(() => {});
  if (dosId) await store.deleteUser(dosId).catch(() => {});
  console.log("Akun uji dibersihkan.");
  process.exit(gagal ? 1 : 0);
}

