/**
 * MIGRASI SEKALI JALAN: data lokal ➜ cloud.
 *
 *   data/db.json  ➜ Neon Postgres   (akun, kegiatan, keuangan, pengaturan)
 *   data/admin.json ➜ tabel meta    (kredensial panel — tetap berupa hash)
 *   uploads/*     ➜ ImageKit        (nama file/key dipertahankan!)
 *
 * Cara pakai (dari folder logbook-app, setelah .env terisi):
 *   npm run migrate
 *
 * Aman dijalankan berulang: baris yang sudah ada dilewati (ON CONFLICT),
 * foto yang sudah tercatat di tabel `files` tidak diunggah ulang.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { q, pastikanSkema } from "../backend/src/db.js"; // ikut memuat .env

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DB_FILE = path.join(ROOT, "data", "db.json");
const ADMIN_FILE = path.join(ROOT, "data", "admin.json");
const UPLOADS = path.join(ROOT, "uploads");

const IK = {
  privateKey: process.env.IMAGEKIT_PRIVATE_KEY || "",
  urlEndpoint: (process.env.IMAGEKIT_URL_ENDPOINT || "").replace(/\/+$/, ""),
  folder: process.env.IMAGEKIT_FOLDER || "/logbook",
};

function judul(t) {
  console.log("\n" + "=".repeat(60) + "\n" + t + "\n" + "=".repeat(60));
}

async function migrasiData() {
  if (!fs.existsSync(DB_FILE)) {
    console.log(`- data/db.json tidak ditemukan — lewati migrasi data.`);
    return;
  }
  const d = JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
  judul("1/3  Migrasi data ke Neon Postgres");

  let n = 0;
  for (const u of d.users || []) {
    const r = await q(
      `INSERT INTO users (id, username, username_lower, pass_hash, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (id) DO NOTHING RETURNING id`,
      [u.id, u.username, u.usernameLower || u.username.toLowerCase(),
       u.passHash, u.createdAt || new Date().toISOString(), u.updatedAt || null]
    );
    n += r.length;
  }
  console.log(`- akun          : ${n} baru dari ${(d.users || []).length}`);

  n = 0;
  for (const e of d.kegiatan || []) {
    if (!e.userId) continue;
    const r = await q(
      `INSERT INTO kegiatan (id, user_id, tanggal, kegiatan, capaian_delta, waktu_menit, foto_keys, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT (id) DO NOTHING RETURNING id`,
      [e.id, e.userId, e.tanggal, e.kegiatan, Number(e.capaian_delta) || 0,
       Number(e.waktu_menit) || 0, JSON.stringify(e.foto_keys || []),
       e.createdAt || new Date().toISOString()]
    );
    n += r.length;
  }
  console.log(`- kegiatan      : ${n} baru dari ${(d.kegiatan || []).length}`);

  n = 0;
  for (const e of d.keuangan || []) {
    if (!e.userId) continue;
    const r = await q(
      `INSERT INTO keuangan (id, user_id, tanggal, item, harga_satuan, satuan_suffix, jumlah, total, bukti_key, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) ON CONFLICT (id) DO NOTHING RETURNING id`,
      [e.id, e.userId, e.tanggal, e.item, Number(e.harga_satuan) || 0,
       e.satuan_suffix || "", Number(e.jumlah) || 1, Number(e.total) || 0,
       e.bukti_key || "", e.createdAt || new Date().toISOString()]
    );
    n += r.length;
  }
  console.log(`- keuangan      : ${n} baru dari ${(d.keuangan || []).length}`);

  n = 0;
  for (const [userId, obj] of Object.entries(d.pengaturan || {})) {
    if (typeof obj !== "object" || obj === null) continue;
    for (const [k, v] of Object.entries(obj)) {
      await q(
        `INSERT INTO pengaturan (user_id, kunci, nilai) VALUES ($1, $2, $3)
         ON CONFLICT (user_id, kunci) DO UPDATE SET nilai = EXCLUDED.nilai`,
        [userId, k, String(v)]
      );
      n++;
    }
  }
  console.log(`- pengaturan    : ${n} nilai`);

  if (d.templateOwnerId) {
    await q(
      `INSERT INTO meta (kunci, nilai) VALUES ('templateOwnerId', $1)
       ON CONFLICT (kunci) DO UPDATE SET nilai = EXCLUDED.nilai`,
      [d.templateOwnerId]
    );
    console.log(`- pemilik template DOCX: ${d.templateOwnerId}`);
  }
}

async function migrasiAdmin() {
  judul("2/3  Migrasi kredensial panel admin");
  if (!fs.existsSync(ADMIN_FILE)) {
    console.log("- data/admin.json tidak ada — panel akan dibuatkan kredensial baru saat server pertama jalan (lihat log).");
    return;
  }
  const sudah = await q("SELECT 1 FROM meta WHERE kunci = 'admin'");
  if (sudah.length) {
    console.log("- kredensial panel sudah ada di database — dilewati.");
    return;
  }
  const admin = JSON.parse(fs.readFileSync(ADMIN_FILE, "utf8"));
  await q("INSERT INTO meta (kunci, nilai) VALUES ('admin', $1)", [JSON.stringify(admin)]);
  console.log(`- kredensial panel dipindahkan (path: ${admin.path || "/pusat-kendali"}) — username/password TIDAK berubah.`);
}

async function migrasiFoto() {
  judul("3/3  Unggah foto ke ImageKit");
  if (!IK.privateKey || !IK.urlEndpoint) {
    console.log("! IMAGEKIT_PRIVATE_KEY / IMAGEKIT_URL_ENDPOINT belum diisi — foto DILEWATI.");
    console.log("  Isi .env lalu jalankan `npm run migrate` lagi (aman diulang).");
    return;
  }
  if (!fs.existsSync(UPLOADS)) {
    console.log("- folder uploads/ tidak ada — tidak ada foto untuk diunggah.");
    return;
  }
  const files = fs.readdirSync(UPLOADS).filter((f) =>
    fs.statSync(path.join(UPLOADS, f)).isFile()
  );
  const auth = "Basic " + Buffer.from(`${IK.privateKey}:`).toString("base64");
  let baru = 0, lewat = 0, gagal = 0;
  for (const nama of files) {
    const ada = await q("SELECT 1 FROM files WHERE key = $1", [nama]);
    if (ada.length) { lewat++; continue; }
    try {
      const buf = fs.readFileSync(path.join(UPLOADS, nama));
      const form = new FormData();
      form.append("file", buf.toString("base64"));
      form.append("fileName", nama);          // key dipertahankan
      form.append("folder", IK.folder);
      form.append("useUniqueFileName", "false");
      const res = await fetch("https://upload.imagekit.io/api/v1/files/upload", {
        method: "POST",
        headers: { Authorization: auth },
        body: form,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 120)}`);
      const info = await res.json();
      await q(
        `INSERT INTO files (key, file_id, url) VALUES ($1, $2, $3)
         ON CONFLICT (key) DO UPDATE SET file_id = EXCLUDED.file_id, url = EXCLUDED.url`,
        [nama, info.fileId || "", info.url || ""]
      );
      baru++;
      process.stdout.write(`  ✓ ${nama}\n`);
    } catch (err) {
      gagal++;
      console.log(`  ✗ ${nama} — ${err.message}`);
    }
  }
  console.log(`- foto: ${baru} diunggah, ${lewat} sudah ada, ${gagal} gagal (dari ${files.length})`);
}

try {
  if (!process.env.DATABASE_URL) {
    console.error(
      "\nDATABASE_URL belum diisi.\n" +
      "Buat file .env di folder logbook-app (contoh di .env.example),\n" +
      "isi DATABASE_URL dari Neon + kunci ImageKit, lalu jalankan lagi.\n"
    );
    process.exit(1);
  }
  console.log("Menyiapkan skema database…");
  await pastikanSkema();
  await migrasiData();
  await migrasiAdmin();
  await migrasiFoto();
  judul("SELESAI 🎉");
  console.log(
    "Data lokalmu TIDAK dihapus (data/ & uploads/ tetap utuh sebagai cadangan).\n" +
    "Langkah berikutnya: deploy ke Vercel — lihat DEPLOY.md bagian 6.\n"
  );
  process.exit(0);
} catch (err) {
  console.error("\nMigrasi gagal:", err);
  process.exit(1);
}

