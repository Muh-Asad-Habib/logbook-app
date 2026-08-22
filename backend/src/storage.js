/**
 * Penyimpanan data di Neon Postgres (menggantikan data/db.json).
 *
 * Semua fungsi di sini ASINKRON (mengembalikan Promise) karena data kini
 * berada di database cloud — pemanggil wajib memakai `await`.
 * Bentuk objek yang dikembalikan SAMA dengan versi lama (camelCase +
 * foto_keys array, dll.) supaya seluruh routes/export/import tidak berubah.
 */
import crypto from "node:crypto";
import { q, angka, larik } from "./db.js";
import { hashPassword, newToken } from "./passwords.js";
import { putFileRaw, getFileBuffer, removeFiles, putFileBesar, getFileBesar, kunciBagian } from "./files.js";

function nowIso() {
  return new Date().toISOString();
}

export function newId() {
  return crypto.randomUUID();
}

/**
 * Sidik jari token sesi yang disimpan di database (lihat bagian "Sesi").
 * Didefinisikan di atas karena dipakai beberapa fungsi di bawahnya.
 */
const hashTokenSesi = (token) =>
  crypto.createHash("sha256").update(String(token || "")).digest("hex");


/* ---------- pemetaan baris DB -> objek aplikasi ---------- */

const petaUser = (r) =>
  r && {
    id: r.id,
    username: r.username,
    usernameLower: r.username_lower,
    passHash: r.pass_hash,
    createdAt: r.created_at,
    updatedAt: r.updated_at || "",
    role: r.role || "tim",
  };

const petaKegiatan = (r) => ({
  id: r.id,
  userId: r.user_id,
  tanggal: r.tanggal,
  kegiatan: r.kegiatan,
  capaian_delta: angka(r.capaian_delta),
  waktu_menit: angka(r.waktu_menit),
  foto_keys: larik(r.foto_keys),
  createdAt: r.created_at,
});

const petaKeuangan = (r) => {
  // bukti_keys = kanonik (array); bukti_key lama tetap dikirim (elemen
  // pertama) supaya klien/skrip lama tidak rusak.
  const keys = larik(r.bukti_keys);
  if (!keys.length && r.bukti_key) keys.push(r.bukti_key);
  return {
    id: r.id,
    userId: r.user_id,
    tanggal: r.tanggal,
    item: r.item,
    harga_satuan: angka(r.harga_satuan),
    satuan_suffix: r.satuan_suffix || "",
    jumlah: angka(r.jumlah),
    total: angka(r.total),
    bukti_keys: keys,
    bukti_key: keys[0] || "",
    createdAt: r.created_at,
  };
};

/** Dipanggil sekali saat server start — memastikan skema siap. */
export async function load() {
  await q("SELECT 1");
  const kadaluwarsa = await purgeExpiredSessions();
  if (kadaluwarsa) console.log(`[storage] ${kadaluwarsa} sesi kedaluwarsa dibersihkan`);
}

/* ---------- meta (nilai global kecil, mis. pemilik template) ---------- */

export async function getMeta(kunci, def = "") {
  const rows = await q("SELECT nilai FROM meta WHERE kunci = $1", [kunci]);
  return rows[0]?.nilai ?? def;
}

export async function setMeta(kunci, nilai) {
  await q(
    "INSERT INTO meta (kunci, nilai) VALUES ($1, $2) ON CONFLICT (kunci) DO UPDATE SET nilai = EXCLUDED.nilai",
    [kunci, String(nilai)]
  );
}

/* ---------- Pengguna (akun) ---------- */

export async function findUserByUsername(username) {
  const qq = String(username || "").trim().toLowerCase();
  const rows = await q("SELECT * FROM users WHERE username_lower = $1", [qq]);
  return petaUser(rows[0]) || null;
}

export async function getUserById(id) {
  const rows = await q("SELECT * FROM users WHERE id = $1", [String(id || "")]);
  return petaUser(rows[0]) || null;
}

/** Apakah user ini pemilik template DOCX resmi (pemegang data lama)? */
export async function isDefaultUser(userId) {
  if (!userId) return false;
  return (await getMeta("templateOwnerId")) === userId;
}

/** Peran yang sah untuk sebuah akun. */
export const PERAN_SAH = ["tim", "fasilitator", "dosen"];

export async function createUser(username, password, role = "tim") {
  const u = {
    id: newId(),
    username: String(username).trim(),
    usernameLower: String(username).trim().toLowerCase(),
    passHash: hashPassword(password),
    createdAt: nowIso(),
    role: PERAN_SAH.includes(role) ? role : "tim",
  };
  await q(
    "INSERT INTO users (id, username, username_lower, pass_hash, created_at, role) VALUES ($1, $2, $3, $4, $5, $6)",
    [u.id, u.username, u.usernameLower, u.passHash, u.createdAt, u.role]
  );
  return u;
}

/** Ganti username (dipakai halaman profil & panel admin). */
export async function updateUsername(userId, usernameBaru) {
  const username = String(usernameBaru).trim();
  const rows = await q(
    "UPDATE users SET username = $1, username_lower = $2, updated_at = $3 WHERE id = $4 RETURNING *",
    [username, username.toLowerCase(), nowIso(), userId]
  );
  return petaUser(rows[0]) || null;
}

/** Ganti password: simpan hash baru — nilai asli tidak pernah disimpan. */
export async function updateUserPassword(userId, passwordBaru) {
  const rows = await q(
    "UPDATE users SET pass_hash = $1, updated_at = $2 WHERE id = $3 RETURNING *",
    [hashPassword(passwordBaru), nowIso(), userId]
  );
  return petaUser(rows[0]) || null;
}

/** Cabut semua sesi milik user (opsional: kecuali satu token). */
export async function revokeUserSessions(userId, exceptToken = "") {
  // Token di database tersimpan sebagai hash — kecualikan KEDUA bentuk supaya
  // sesi milik pemanggil sendiri tidak ikut tercabut (termasuk baris lama
  // yang belum sempat dimigrasi).
  const asli = String(exceptToken || "");
  const rows = await q(
    "DELETE FROM sessions WHERE user_id = $1 AND token <> $2 AND token <> $3 RETURNING token",
    [userId, hashTokenSesi(asli), asli]
  );
  return rows.length;
}

/** Daftar semua akun + ringkasan datanya (tanpa hash password). */
export async function listUsersWithStats() {
  const rows = await q(
    `SELECT u.id, u.username, u.created_at, u.updated_at, u.role,
            (SELECT COUNT(*) FROM kegiatan k WHERE k.user_id = u.id)                    AS n_keg,
            (SELECT COUNT(*) FROM keuangan b WHERE b.user_id = u.id)                    AS n_keu,
            (SELECT COALESCE(SUM(jsonb_array_length(k.foto_keys)), 0)
               FROM kegiatan k WHERE k.user_id = u.id)                                  AS n_foto_keg,
            (SELECT COALESCE(SUM(GREATEST(jsonb_array_length(b.bukti_keys),
                                          (b.bukti_key <> '')::int)), 0)
               FROM keuangan b WHERE b.user_id = u.id)                                  AS n_foto_keu,
            (SELECT COUNT(*) FROM sessions s WHERE s.user_id = u.id)                    AS n_sesi,
            (SELECT COUNT(*) FROM laporan_docx l WHERE l.user_id = u.id)                AS n_laporan,
            (SELECT COUNT(*) FROM presentasi pr
               WHERE pr.user_id = u.id AND (pr.file_key <> '' OR pr.canva_url <> ''))    AS n_presentasi,
            (SELECT COUNT(*) FROM fasilitator_tim ft JOIN users pu ON pu.id = ft.fasilitator_id
               WHERE ft.tim_user_id = u.id AND COALESCE(pu.role,'tim') = 'fasilitator')  AS n_fasilitator,
            (SELECT COUNT(*) FROM fasilitator_tim ft JOIN users pu ON pu.id = ft.fasilitator_id
               WHERE ft.tim_user_id = u.id AND COALESCE(pu.role,'tim') = 'dosen')        AS n_dosen,
            (SELECT COUNT(*) FROM fasilitator_tim ft WHERE ft.fasilitator_id = u.id)    AS n_tim_diampu,
            (SELECT COUNT(*) FROM persetujuan p
               WHERE p.tim_user_id = u.id AND p.status = 'disetujui')                    AS n_acc,
            (SELECT COUNT(*) FROM persetujuan p
               WHERE p.tim_user_id = u.id AND p.status = 'revisi')                       AS n_revisi,
            GREATEST(
              COALESCE((SELECT MAX(k.created_at) FROM kegiatan k WHERE k.user_id = u.id), ''),
              COALESCE((SELECT MAX(b.created_at) FROM keuangan b WHERE b.user_id = u.id), '')
            )                                                                           AS last_at,
            COALESCE((SELECT p.nilai FROM pengaturan p
               WHERE p.user_id = u.id AND p.kunci = 'dana_awal'), '')                   AS dana_awal
       FROM users u
      ORDER BY u.created_at`
  );
  const ownerId = await getMeta("templateOwnerId");
  return rows.map((r) => ({
    id: r.id,
    username: r.username,
    createdAt: r.created_at,
    updatedAt: r.updated_at || "",
    role: r.role || "tim",
    kegiatan: angka(r.n_keg),
    keuangan: angka(r.n_keu),
    foto: angka(r.n_foto_keg) + angka(r.n_foto_keu),
    sesi: angka(r.n_sesi),
    punya_laporan: angka(r.n_laporan) > 0,
    punya_presentasi: angka(r.n_presentasi) > 0,
    n_fasilitator: angka(r.n_fasilitator),
    n_dosen: angka(r.n_dosen),
    n_tim_diampu: angka(r.n_tim_diampu),
    n_acc: angka(r.n_acc),
    n_revisi: angka(r.n_revisi),
    aktivitasTerakhir: r.last_at || "",
    pemilikTemplate: ownerId === r.id,
    dana_awal: r.dana_awal || "",
  }));
}

/** Detail lengkap satu akun untuk panel admin (tanpa hash password). */
export async function getUserDetail(userId) {
  const u = await getUserById(userId);
  if (!u) return null;
  const kegRows = await listKegiatan(userId); // sudah berisi capaian_total kumulatif
  const kegiatan = kegRows.map((e) => ({
    id: e.id,
    tanggal: e.tanggal,
    kegiatan: e.kegiatan,
    capaian_delta: e.capaian_delta,
    capaian_total: e.capaian_total,
    waktu_menit: e.waktu_menit,
    foto_keys: e.foto_keys,
  }));
  const keuangan = (await listKeuangan(userId)).map((e) => ({
    id: e.id,
    tanggal: e.tanggal,
    item: e.item,
    harga_satuan: e.harga_satuan,
    satuan_suffix: e.satuan_suffix,
    jumlah: e.jumlah,
    total: e.total,
    bukti_keys: e.bukti_keys,
    bukti_key: e.bukti_key,
  }));
  const danaAwal = Number(await getSetting(userId, "dana_awal", "0")) || 0;
  const pengeluaran = keuangan.reduce((s, e) => s + e.total, 0);
  return {
    user: { id: u.id, username: u.username, createdAt: u.createdAt, role: u.role },
    kegiatan,
    keuangan,
    laporan: await infoLaporan(userId),
    presentasi: await infoPresentasi(userId),
    ringkasan: {
      dana_awal: danaAwal,
      pengeluaran,
      sisa: danaAwal - pengeluaran,
      capaian_total: kegiatan.length ? kegiatan[kegiatan.length - 1].capaian_total : 0,
      total_menit: kegiatan.reduce((s, e) => s + e.waktu_menit, 0),
    },
  };
}

/**
 * Hapus akun beserta seluruh datanya.
 * Mengembalikan daftar key berkas (foto/bukti) agar pemanggil bisa
 * menghapus filenya dari penyimpanan gambar.
 */
export async function deleteUser(userId) {
  const u = await getUserById(userId);
  if (!u) return null;
  const fileKeys = [];
  for (const r of await q("SELECT foto_keys FROM kegiatan WHERE user_id = $1", [userId])) {
    fileKeys.push(...larik(r.foto_keys));
  }
  for (const r of await q(
    "SELECT bukti_key, bukti_keys FROM keuangan WHERE user_id = $1", [userId]
  )) {
    const keys = larik(r.bukti_keys);
    if (!keys.length && r.bukti_key) keys.push(r.bukti_key);
    fileKeys.push(...keys);
  }
  // Laporan .docx di ImageKit ikut dihapus lewat fileKeys
  for (const r of await q(
    "SELECT file_key FROM laporan_docx WHERE user_id = $1 AND file_key <> ''", [userId]
  )) {
    fileKeys.push(r.file_key);
  }
  // Presentasi .pptx di ImageKit ikut dihapus lewat fileKeys
  for (const r of await q(
    "SELECT file_key FROM presentasi WHERE user_id = $1 AND file_key <> ''", [userId]
  )) {
    fileKeys.push(...kunciBagian(r.file_key));
  }
  await q("DELETE FROM kegiatan   WHERE user_id = $1", [userId]);
  await q("DELETE FROM keuangan   WHERE user_id = $1", [userId]);
  await q("DELETE FROM pengaturan WHERE user_id = $1", [userId]);
  await q("DELETE FROM sessions   WHERE user_id = $1", [userId]);
  await q("DELETE FROM laporan_docx  WHERE user_id = $1", [userId]);
  await q("DELETE FROM laporan_links WHERE user_id = $1", [userId]);
  await q("DELETE FROM presentasi    WHERE user_id = $1", [userId]);
  await q("DELETE FROM fasilitator_tim WHERE fasilitator_id = $1 OR tim_user_id = $1", [userId]);
  await q(
    `DELETE FROM komentar_baca WHERE user_id = $1
        OR komentar_id IN (SELECT id FROM komentar WHERE tim_user_id = $1)`,
    [userId]
  );
  await q("DELETE FROM komentar  WHERE tim_user_id = $1 OR penulis_id = $1", [userId]);
  await q("DELETE FROM persetujuan WHERE tim_user_id = $1 OR dosen_id = $1", [userId]);
  await q("DELETE FROM aktivitas WHERE user_id = $1", [userId]);
  await q("DELETE FROM users      WHERE id      = $1", [userId]);
  if ((await getMeta("templateOwnerId")) === userId) {
    await q("DELETE FROM meta WHERE kunci = 'templateOwnerId'");
  }
  return { user: { id: u.id, username: u.username }, fileKeys };
}

/* ---------- Sesi (token login) ----------
 *
 * KEAMANAN: yang disimpan di database adalah SHA-256 dari token, bukan token
 * aslinya. Siapa pun yang berhasil membaca tabel `sessions` (dump/bocor)
 * TIDAK bisa memakai isinya untuk membajak akun — persis alasan password
 * disimpan sebagai hash. Token asli hanya ada di browser pemiliknya.
 *
 * Hash memakai SHA-256 polos (bukan scrypt): token sudah 256-bit acak
 * kriptografis, jadi tidak bisa ditebak/di-brute-force — yang dibutuhkan
 * hanyalah fungsi satu arah yang cepat (dipanggil tiap request).
 *
 * MIGRASI MULUS: baris lama yang masih menyimpan token mentah tetap diterima
 * dan langsung di-upgrade ke bentuk hash saat pertama dipakai — TIDAK ADA
 * pengguna yang ter-logout paksa karena perubahan ini.
 */

/** Umur maksimal sesi MENGANGGUR: 30 hari sejak pemakaian terakhir. */
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** Perbarui stempel pemakaian paling sering 1×/jam (hemat write ke Neon). */
const SENTUH_MIN_MS = 60 * 60 * 1000;

/** Sidik jari token yang disimpan di database (alias — lihat bagian atas). */
const hashToken = hashTokenSesi;

/**
 * Buang sesi yang MENGANGGUR lebih dari 30 hari.
 * Patokannya `last_used_at` (bila kosong — baris lama — pakai `created_at`),
 * sehingga akun yang rutin dipakai tidak pernah kehilangan sesinya.
 */
export async function purgeExpiredSessions() {
  const batas = new Date(Date.now() - SESSION_TTL_MS).toISOString();
  const rows = await q(
    `DELETE FROM sessions
      WHERE COALESCE(NULLIF(last_used_at, ''), created_at) < $1
      RETURNING token`,
    [batas]
  );
  return rows.length;
}

export async function createSession(userId, jejak = {}) {
  const token = newToken();
  const ts = nowIso();
  await q(
    `INSERT INTO sessions (token, user_id, created_at, last_used_at, perangkat, ip_samar)
     VALUES ($1, $2, $3, $3, $4, $5)`,
    [
      hashToken(token),
      userId,
      ts,
      String(jejak.perangkat || "").slice(0, 40),
      String(jejak.ip || "").slice(0, 45),
    ]
  );
  return token; // hanya di sini token asli pernah keluar
}

export async function getSession(token, jejak = null) {
  const asli = String(token || "");
  if (!asli) return null;
  const hash = hashToken(asli);
  // Cari bentuk hash (baris baru) ATAU token mentah (baris lama, belum migrasi)
  const rows = await q(
    "SELECT * FROM sessions WHERE token = $1 OR token = $2 LIMIT 1", [hash, asli]
  );
  const s = rows[0];
  if (!s) return null;

  const dipakai = Date.parse(s.last_used_at || s.created_at || "") || 0;
  if (Date.now() - dipakai > SESSION_TTL_MS) {
    await q("DELETE FROM sessions WHERE token = $1", [s.token]);
    return null;
  }

  if (s.token === asli) {
    // Baris lama → simpan sebagai hash sekarang juga (pengguna tidak terganggu).
    // ON CONFLICT: bila entah bagaimana hash-nya sudah ada, cukup buang yang lama.
    await q(
      `UPDATE sessions SET token = $1, last_used_at = $2 WHERE token = $3`,
      [hash, nowIso(), asli]
    ).catch(() => q("DELETE FROM sessions WHERE token = $1", [asli]));
  } else if (Date.now() - dipakai > SENTUH_MIN_MS) {
    // Perpanjang masa aktif — dibatasi 1×/jam supaya tidak boros write.
    q("UPDATE sessions SET last_used_at = $1 WHERE token = $2", [nowIso(), hash])
      .catch(() => {});
  }

  // Sesi yang dibuat SEBELUM fitur "Perangkat & Sesi Aktif" ada belum punya
  // label perangkat. Isi sekali di sini supaya daftar sesi tidak penuh
  // "Perangkat tidak dikenal" — hanya menulis bila kolomnya masih kosong.
  if (jejak?.perangkat && !s.perangkat) {
    q("UPDATE sessions SET perangkat = $1, ip_samar = $2 WHERE token = $3",
      [jejak.perangkat.slice(0, 40), String(jejak.ip || "").slice(0, 45), hash])
      .catch(() => {});
  }
  return { userId: s.user_id, createdAt: s.created_at };
}

export async function deleteSession(token) {
  const asli = String(token || "");
  await q("DELETE FROM sessions WHERE token = $1 OR token = $2", [hashToken(asli), asli]);
}


/* ---------- Daftar perangkat & sesi aktif (halaman Profil) ----------
 *
 * ID PUBLIK: token asli tidak boleh keluar dari server, dan hash penuhnya pun
 * tidak perlu dikirim ke browser. Yang dipakai untuk menunjuk sebuah sesi
 * adalah 12 karakter pertama hash-nya — cukup unik di dalam satu akun
 * (peluang tabrakan ~1 : 280 triliun), tapi tidak bisa dipakai untuk
 * membajak sesi karena bukan token dan tidak bisa dikembalikan ke token.
 * Semua query pun tetap dipagari `user_id = $1`, jadi sesi milik akun lain
 * mustahil disentuh sekalipun ID-nya tertebak.
 */
const ID_PANJANG = 12;

/** ID publik sebuah sesi dari token aslinya (dipakai menandai "sesi ini"). */
export const idSesiDariToken = (token) => hashToken(String(token || "")).slice(0, ID_PANJANG);

/**
 * Semua sesi aktif milik satu akun — terbaru dipakai di urutan atas.
 * @param {string} userId
 * @param {string} [tokenSekarang] token pemanggil, untuk menandai `ini_perangkat`
 */
export async function listSessions(userId, tokenSekarang = "") {
  const rows = await q(
    `SELECT LEFT(token, ${ID_PANJANG}) AS id, created_at, last_used_at, perangkat, ip_samar
       FROM sessions
      WHERE user_id = $1
      ORDER BY COALESCE(NULLIF(last_used_at, ''), created_at) DESC`,
    [userId]
  );
  const idSaya = tokenSekarang ? idSesiDariToken(tokenSekarang) : "";
  return rows.map((r) => ({
    id: r.id,
    perangkat: r.perangkat || "",
    ip: r.ip_samar || "",
    dibuat: r.created_at,
    terakhir: r.last_used_at || r.created_at,
    ini_perangkat: !!idSaya && r.id === idSaya,
  }));
}

/**
 * Cabut SATU sesi milik akun ini.
 * @returns {Promise<string>} hash token yang dihapus ("" bila tidak ada)
 */
export async function hapusSesiById(userId, id) {
  const kunci = String(id || "").toLowerCase();
  if (!/^[0-9a-f]{4,64}$/.test(kunci)) return "";
  const rows = await q(
    `DELETE FROM sessions WHERE user_id = $1 AND LEFT(token, ${ID_PANJANG}) = $2 RETURNING token`,
    [userId, kunci.slice(0, ID_PANJANG)]
  );
  return rows[0]?.token || "";
}


/* ---------- Kepemilikan berkas (cegah IDOR di /api/files/:key) ----------
 * Sebelumnya endpoint gambar hanya memeriksa "sudah login?" — TIDAK memeriksa
 * apakah key yang diminta benar-benar milik pemanggil. Siapa pun yang login
 * (termasuk akun baru daftar sendiri) bisa melihat foto akun lain bila
 * berhasil menebak/mendapatkan key-nya dari mana pun.
 * Fungsi ini memastikan key hanya disajikan bila tercatat milik salah satu
 * userId dalam scope pemanggil (dirinya sendiri; atau — untuk fasilitator —
 * salah satu tim yang benar-benar ia ampu). */
export async function fileDimilikiOleh(key, userIds) {
  const ids = [...new Set((userIds || []).filter(Boolean).map(String))];
  if (!key || !ids.length) return false;
  const rows = await q(
    `SELECT 1 FROM kegiatan WHERE user_id = ANY($1::text[]) AND foto_keys ? $2::text
     UNION ALL
     SELECT 1 FROM keuangan WHERE user_id = ANY($1::text[])
        AND (bukti_keys ? $2::text OR bukti_key = $2::text)
     UNION ALL
     SELECT 1 FROM laporan_docx WHERE user_id = ANY($1::text[]) AND file_key = $2::text
     UNION ALL
     SELECT 1 FROM presentasi WHERE user_id = ANY($1::text[]) AND file_key = $2::text
     LIMIT 1`,
    [ids, key]
  );
  return rows.length > 0;
}

/* ---------- Kegiatan ---------- */

export async function listKegiatan(userId) {
  const rows = await q(
    "SELECT * FROM kegiatan WHERE user_id = $1 ORDER BY tanggal, created_at", [userId]
  );
  let total = 0;
  return rows.map((r) => {
    const e = petaKegiatan(r);
    total = Math.min(100, total + e.capaian_delta);
    return { ...e, capaian_total: total };
  });
}

export async function addKegiatan(userId, { tanggal, kegiatan, capaian_delta, waktu_menit, foto_keys }) {
  const e = {
    id: newId(),
    userId,
    tanggal,
    kegiatan,
    capaian_delta,
    waktu_menit,
    foto_keys,
    createdAt: nowIso(),
  };
  await q(
    `INSERT INTO kegiatan (id, user_id, tanggal, kegiatan, capaian_delta, waktu_menit, foto_keys, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [e.id, e.userId, e.tanggal, e.kegiatan, e.capaian_delta, e.waktu_menit,
     JSON.stringify(e.foto_keys || []), e.createdAt]
  );
  return e;
}

export async function getKegiatan(userId, id) {
  const rows = await q("SELECT * FROM kegiatan WHERE id = $1 AND user_id = $2", [id, userId]);
  return rows[0] ? petaKegiatan(rows[0]) : null;
}

export async function updateKegiatan(userId, id, patch) {
  const e = await getKegiatan(userId, id);
  if (!e) return null;
  Object.assign(e, patch);
  await q(
    `UPDATE kegiatan SET tanggal = $1, kegiatan = $2, capaian_delta = $3,
            waktu_menit = $4, foto_keys = $5
      WHERE id = $6 AND user_id = $7`,
    [e.tanggal, e.kegiatan, e.capaian_delta, e.waktu_menit,
     JSON.stringify(e.foto_keys || []), id, userId]
  );
  // Isi entri berubah → ACC dosen batal, status kembali "menunggu" agar
  // pengesahan selalu merujuk versi yang benar-benar ditinjau.
  await hapusPersetujuan("kegiatan", id);
  return e;
}

export async function deleteKegiatan(userId, id) {
  const rows = await q(
    "DELETE FROM kegiatan WHERE id = $1 AND user_id = $2 RETURNING *", [id, userId]
  );
  if (rows[0]) await hapusPersetujuan("kegiatan", id);
  return rows[0] ? petaKegiatan(rows[0]) : null;
}

/* ---------- Keuangan ---------- */

export async function listKeuangan(userId) {
  const rows = await q(
    "SELECT * FROM keuangan WHERE user_id = $1 ORDER BY tanggal, created_at", [userId]
  );
  return rows.map(petaKeuangan);
}

export async function addKeuangan(userId, { tanggal, item, harga_satuan, satuan_suffix, jumlah, bukti_keys }) {
  const keys = Array.isArray(bukti_keys) ? bukti_keys.filter(Boolean) : [];
  const e = {
    id: newId(),
    userId,
    tanggal,
    item,
    harga_satuan,
    satuan_suffix,
    jumlah,
    total: harga_satuan * jumlah,
    bukti_keys: keys,
    bukti_key: keys[0] || "",
    createdAt: nowIso(),
  };
  await q(
    `INSERT INTO keuangan (id, user_id, tanggal, item, harga_satuan, satuan_suffix, jumlah, total, bukti_key, bukti_keys, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [e.id, e.userId, e.tanggal, e.item, e.harga_satuan, e.satuan_suffix,
     e.jumlah, e.total, e.bukti_key, JSON.stringify(e.bukti_keys), e.createdAt]
  );
  return e;
}

export async function getKeuangan(userId, id) {
  const rows = await q("SELECT * FROM keuangan WHERE id = $1 AND user_id = $2", [id, userId]);
  return rows[0] ? petaKeuangan(rows[0]) : null;
}

export async function updateKeuangan(userId, id, patch) {
  const e = await getKeuangan(userId, id);
  if (!e) return null;
  Object.assign(e, patch);
  e.bukti_keys = (e.bukti_keys || []).filter(Boolean);
  e.bukti_key = e.bukti_keys[0] || ""; // kolom lama tetap sinkron
  e.total = e.harga_satuan * e.jumlah;
  await q(
    `UPDATE keuangan SET tanggal = $1, item = $2, harga_satuan = $3, satuan_suffix = $4,
            jumlah = $5, total = $6, bukti_key = $7, bukti_keys = $8
      WHERE id = $9 AND user_id = $10`,
    [e.tanggal, e.item, e.harga_satuan, e.satuan_suffix, e.jumlah, e.total,
     e.bukti_key, JSON.stringify(e.bukti_keys), id, userId]
  );
  await hapusPersetujuan("keuangan", id); // entri berubah → ACC batal
  return e;
}

export async function deleteKeuangan(userId, id) {
  const rows = await q(
    "DELETE FROM keuangan WHERE id = $1 AND user_id = $2 RETURNING *", [id, userId]
  );
  if (rows[0]) await hapusPersetujuan("keuangan", id);
  return rows[0] ? petaKeuangan(rows[0]) : null;
}

/* ---------- Pengaturan ---------- */

export async function getSetting(userId, kunci, def = "") {
  const rows = await q(
    "SELECT nilai FROM pengaturan WHERE user_id = $1 AND kunci = $2", [userId, kunci]
  );
  return rows[0]?.nilai ?? def;
}

export async function setSetting(userId, kunci, nilai) {
  await q(
    `INSERT INTO pengaturan (user_id, kunci, nilai) VALUES ($1, $2, $3)
     ON CONFLICT (user_id, kunci) DO UPDATE SET nilai = EXCLUDED.nilai`,
    [userId, kunci, String(nilai)]
  );
}

/* ---------- Laporan kemajuan (.docx — SATU file per user) ----------
 * Kunci utama = user_id, jadi setiap unggahan baru otomatis MENIMPA
 * file lama (UPSERT) — tidak pernah ada dua laporan tersimpan.
 * Berkas fisik disimpan di ImageKit (kolom file_key); kolom `data` (base64)
 * hanya untuk baris lama — dimigrasi malas ke ImageKit saat pertama diakses. */

export async function saveLaporan(userId, nama, buffer) {
  // Hapus berkas lama di ImageKit (bila ada) supaya tidak jadi sampah
  const lama = await q(
    "SELECT file_key FROM laporan_docx WHERE user_id = $1 AND file_key <> ''", [userId]
  );
  const key = await putFileBesar(nama, buffer, "lap");
  await q(
    `INSERT INTO laporan_docx (user_id, nama, data, ukuran, updated_at, file_key)
     VALUES ($1, $2, '', $3, $4, $5)
     ON CONFLICT (user_id) DO UPDATE SET nama = EXCLUDED.nama,
       data = '', ukuran = EXCLUDED.ukuran, updated_at = EXCLUDED.updated_at,
       file_key = EXCLUDED.file_key`,
    [userId, nama, buffer.length, nowIso(), key]
  );
  if (lama[0]?.file_key) await removeFiles(kunciBagian(lama[0].file_key));
  // Laporan diganti → ACC lama tidak lagi relevan (kembali "menunggu")
  await hapusPersetujuan("laporan", userId);
  return { nama, ukuran: buffer.length };
}

export async function infoLaporan(userId) {
  const rows = await q(
    "SELECT nama, ukuran, updated_at FROM laporan_docx WHERE user_id = $1", [userId]
  );
  if (!rows[0]) return { ada: false };
  return {
    ada: true,
    nama: rows[0].nama,
    ukuran: Number(rows[0].ukuran) || 0,
    updated_at: rows[0].updated_at,
  };
}

export async function getLaporan(userId) {
  const rows = await q(
    "SELECT nama, data, file_key FROM laporan_docx WHERE user_id = $1", [userId]
  );
  if (!rows[0]) return null;
  const { nama, data, file_key: fileKey } = rows[0];
  if (fileKey) {
    const buffer = await getFileBesar(fileKey);
    if (buffer) return { nama, buffer };
    // Berkas hilang di cloud tapi masih ada base64 lama → pakai itu
    if (data) return { nama, buffer: Buffer.from(data, "base64") };
    return null;
  }
  if (!data) return null;
  const buffer = Buffer.from(data, "base64");
  // Migrasi malas: baris lama (base64 di Neon) → unggah ke ImageKit sekali,
  // lalu kosongkan kolom data agar kuota Neon lega. Gagal → tetap terbaca.
  try {
    const key = await putFileRaw(nama || "laporan-kemajuan.docx", buffer, "lap");
    await q(
      "UPDATE laporan_docx SET file_key = $1, data = '' WHERE user_id = $2",
      [key, userId]
    );
  } catch {}
  return { nama, buffer };
}

export async function deleteLaporan(userId) {
  const rows = await q(
    "DELETE FROM laporan_docx WHERE user_id = $1 RETURNING nama, file_key", [userId]
  );
  if (rows[0]?.file_key) await removeFiles(kunciBagian(rows[0].file_key));
  if (rows.length) await hapusPersetujuan("laporan", userId);
  return rows.length > 0;
}

/* ---------- Presentasi (.pptx + tautan Canva — SATU set per user) ----------
 * Berbeda dengan laporan, satu tim boleh punya DUA item sekaligus:
 *   1. berkas .pptx (disimpan di ImageKit, kolom file_key), dan
 *   2. tautan Canva (kolom canva_url) — hanya pratinjau, tanpa unduh.
 * Keduanya berbagi satu baris (PK user_id) dan bisa dihapus sendiri-sendiri.
 * Perubahan pada salah satunya mengembalikan status ACC ke "menunggu". */

/** Ambil id desain Canva dari bentuk tautan apa pun yang dibagikan pengguna. */
function idDesainCanva(url) {
  const m = String(url || "").match(
    /canva\.com\/design\/([A-Za-z0-9_-]+)\/([A-Za-z0-9_-]+)/
  );
  return m ? { design: m[1], token: m[2] } : null;
}

/**
 * Normalisasi tautan Canva → bentuk embed `/view?embed`.
 * Menerima link share biasa (…/view?utm_content=…), link edit, atau link
 * yang sudah embed. Mengembalikan "" bila bukan tautan Canva yang sah.
 */
export function normalisasiCanva(url) {
  const bersih = String(url || "").trim();
  if (!bersih) return "";
  let u;
  try {
    u = new URL(bersih.startsWith("http") ? bersih : `https://${bersih}`);
  } catch {
    return "";
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return "";
  if (!/(^|\.)canva\.com$/i.test(u.hostname)) return "";
  const id = idDesainCanva(u.href);
  if (!id) return "";
  return `https://www.canva.com/design/${id.design}/${id.token}/view?embed`;
}

/** Apakah URL adalah short-link resmi Canva (https://canva.link/xxxx)? */
function adalahCanvaLink(url) {
  const bersih = String(url || "").trim();
  if (!bersih) return null;
  try {
    const u = new URL(bersih.startsWith("http") ? bersih : `https://${bersih}`);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    return /(^|\.)canva\.link$/i.test(u.hostname) ? u : null;
  } catch {
    return null;
  }
}

/**
 * Resolusi tautan Canva APA PUN → bentuk embed `/view?embed`.
 * - Tautan canva.com/design/… → normalisasi langsung (tanpa jaringan).
 * - Short-link canva.link/… → ikuti redirect server-side (timeout 8 dtk),
 *   lalu normalisasi URL tujuan. Mengembalikan "" bila bukan Canva yang sah
 *   atau redirect gagal (mis. offline).
 */
export async function resolveCanva(url) {
  const langsung = normalisasiCanva(url);
  if (langsung) return langsung;
  const u = adalahCanvaLink(url);
  if (!u) return "";
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 8000);
    // redirect: "follow" — res.url berisi URL final setelah seluruh redirect
    const res = await fetch(u.href, {
      redirect: "follow",
      signal: ctl.signal,
      headers: { "User-Agent": "Mozilla/5.0 (LogbookApp; +presentasi)" },
    }).finally(() => clearTimeout(timer));
    return normalisasiCanva(res.url || "");
  } catch {
    return "";
  }
}

async function barisPresentasi(userId) {
  const rows = await q("SELECT * FROM presentasi WHERE user_id = $1", [userId]);
  return rows[0] || null;
}

/** Hapus baris presentasi bila file & tautan sama-sama sudah kosong. */
async function rapikanPresentasi(userId) {
  await q(
    "DELETE FROM presentasi WHERE user_id = $1 AND file_key = '' AND canva_url = ''",
    [userId]
  );
}

export async function savePresentasi(userId, nama, buffer) {
  const lama = await q(
    "SELECT file_key FROM presentasi WHERE user_id = $1 AND file_key <> ''", [userId]
  );
  // > ±20 MB otomatis dipecah beberapa bagian (batas ImageKit gratis 25 MB/berkas)
  const key = await putFileBesar(nama, buffer, "ppt");
  const ts = nowIso();
  await q(
    `INSERT INTO presentasi (user_id, nama, ukuran, file_key, file_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $5)
     ON CONFLICT (user_id) DO UPDATE SET nama = EXCLUDED.nama,
       ukuran = EXCLUDED.ukuran, file_key = EXCLUDED.file_key,
       file_at = EXCLUDED.file_at, updated_at = EXCLUDED.updated_at`,
    [userId, nama, buffer.length, key, ts]
  );
  if (lama[0]?.file_key) await removeFiles(kunciBagian(lama[0].file_key));
  await hapusPersetujuan("presentasi", userId);
  return { nama, ukuran: buffer.length };
}

/** Info gabungan: { file: {ada,…}, canva: {ada, url}, ada } */
export async function infoPresentasi(userId) {
  const r = await barisPresentasi(userId);
  const file = r?.file_key
    ? {
        ada: true,
        nama: r.nama,
        ukuran: Number(r.ukuran) || 0,
        updated_at: r.file_at || r.updated_at,
      }
    : { ada: false };
  const canva = r?.canva_url
    ? { ada: true, url: r.canva_url, updated_at: r.canva_at || r.updated_at }
    : { ada: false };
  return { ada: file.ada || canva.ada, file, canva, updated_at: r?.updated_at || "" };
}

export async function getPresentasi(userId) {
  const r = await barisPresentasi(userId);
  if (!r?.file_key) return null;
  const buffer = await getFileBesar(r.file_key);
  if (!buffer) return null;
  return { nama: r.nama, buffer };
}

export async function deletePresentasiFile(userId) {
  // CATATAN: `UPDATE … RETURNING` mengembalikan nilai SESUDAH update (sudah
  // kosong) — kunci lama harus diambil dulu agar berkasnya ikut terhapus.
  const lama = await q(
    "SELECT file_key FROM presentasi WHERE user_id = $1 AND file_key <> ''",
    [userId]
  );
  if (!lama.length) return false;
  await q(
    `UPDATE presentasi SET nama = '', ukuran = 0, file_key = '', file_at = '',
            updated_at = $2
       WHERE user_id = $1`,
    [userId, nowIso()]
  );
  await removeFiles(kunciBagian(lama[0].file_key));
  await rapikanPresentasi(userId);
  await hapusPersetujuan("presentasi", userId);
  return true;
}

/** Simpan tautan Canva (canva.com/design/… atau short-link canva.link/…). */
export async function setCanvaPresentasi(userId, url) {
  const embed = await resolveCanva(url);
  if (!embed) return null;
  const ts = nowIso();
  await q(
    `INSERT INTO presentasi (user_id, canva_url, canva_at, updated_at)
     VALUES ($1, $2, $3, $3)
     ON CONFLICT (user_id) DO UPDATE SET canva_url = EXCLUDED.canva_url,
       canva_at = EXCLUDED.canva_at, updated_at = EXCLUDED.updated_at`,
    [userId, embed, ts]
  );
  await hapusPersetujuan("presentasi", userId);
  return { url: embed, updated_at: ts };
}

export async function deleteCanvaPresentasi(userId) {
  const rows = await q(
    `UPDATE presentasi SET canva_url = '', canva_at = '', updated_at = $2
       WHERE user_id = $1 AND canva_url <> '' RETURNING user_id`,
    [userId, nowIso()]
  );
  if (!rows.length) return false;
  await rapikanPresentasi(userId);
  await hapusPersetujuan("presentasi", userId);
  return true;
}

/* ---------- Pendamping (fasilitator & dosen) ↔ Tim (assignment many-to-many) ----------
 * 1 tim boleh diampu banyak pendamping; 1 pendamping boleh mengampu
 * banyak tim. Assignment dibuat lewat kode tim (mandiri) atau oleh admin.
 * Tabel `fasilitator_tim` dipakai untuk KEDUA peran (nama dipertahankan
 * agar data lama tetap utuh) — peran dibaca dari kolom users.role. */

/** Daftar tim yang diampu seorang pendamping (fasilitator/dosen). */
export async function listTimUntukFasilitator(fasilitatorId) {
  const rows = await q(
    `SELECT u.id, u.username, ft.created_at AS sejak
       FROM fasilitator_tim ft JOIN users u ON u.id = ft.tim_user_id
      WHERE ft.fasilitator_id = $1
      ORDER BY u.username`,
    [fasilitatorId]
  );
  return rows.map((r) => ({ id: r.id, username: r.username, sejak: r.sejak }));
}

/** Daftar pendamping (fasilitator & dosen) yang mengampu sebuah tim. */
export async function listFasilitatorUntukTim(timUserId) {
  const rows = await q(
    `SELECT u.id, u.username, COALESCE(u.role, 'tim') AS role, ft.created_at AS sejak
       FROM fasilitator_tim ft JOIN users u ON u.id = ft.fasilitator_id
      WHERE ft.tim_user_id = $1
      ORDER BY u.role DESC, u.username`,
    [timUserId]
  );
  return rows.map((r) => ({
    id: r.id, username: r.username, role: r.role, sejak: r.sejak,
  }));
}

/** Apakah pendamping ini boleh mengakses data tim tersebut? */
export async function bolehAksesTim(fasilitatorId, timUserId) {
  const rows = await q(
    "SELECT 1 FROM fasilitator_tim WHERE fasilitator_id = $1 AND tim_user_id = $2",
    [fasilitatorId, timUserId]
  );
  return rows.length > 0;
}

/** Ganti seluruh assignment tim milik seorang fasilitator (diff insert/delete). */
export async function gantiTimFasilitator(fasilitatorId, timIds) {
  const target = [...new Set((timIds || []).map(String).filter(Boolean))];
  const lama = (await q(
    "SELECT tim_user_id FROM fasilitator_tim WHERE fasilitator_id = $1", [fasilitatorId]
  )).map((r) => r.tim_user_id);
  const tambah = target.filter((t) => !lama.includes(t));
  const hapus = lama.filter((t) => !target.includes(t));
  for (const t of tambah) {
    await q(
      `INSERT INTO fasilitator_tim (fasilitator_id, tim_user_id, created_at)
       VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
      [fasilitatorId, t, nowIso()]
    );
  }
  if (hapus.length) {
    await q(
      "DELETE FROM fasilitator_tim WHERE fasilitator_id = $1 AND tim_user_id = ANY($2)",
      [fasilitatorId, hapus]
    );
  }
  return { tambah: tambah.length, hapus: hapus.length, total: target.length };
}

/** Ganti seluruh fasilitator yang mengampu sebuah tim (kebalikan gantiTimFasilitator). */
export async function gantiFasilitatorTim(timUserId, fasilitatorIds) {
  const target = [...new Set((fasilitatorIds || []).map(String).filter(Boolean))];
  const lama = (await q(
    "SELECT fasilitator_id FROM fasilitator_tim WHERE tim_user_id = $1", [timUserId]
  )).map((r) => r.fasilitator_id);
  const tambah = target.filter((f) => !lama.includes(f));
  const hapus = lama.filter((f) => !target.includes(f));
  for (const f of tambah) {
    await q(
      `INSERT INTO fasilitator_tim (fasilitator_id, tim_user_id, created_at)
       VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
      [f, timUserId, nowIso()]
    );
  }
  if (hapus.length) {
    await q(
      "DELETE FROM fasilitator_tim WHERE tim_user_id = $1 AND fasilitator_id = ANY($2)",
      [timUserId, hapus]
    );
  }
  return { tambah: tambah.length, hapus: hapus.length, total: target.length };
}

/* ---------- Komentar (fasilitator ↔ tim, 2 arah) ----------
 * jenis: 'kegiatan' | 'keuangan' | 'laporan'
 * target_id: id entri (laporan → tim_user_id, karena 1 laporan per tim)
 * parent_id: '' = komentar induk; terisi = balasan. */

const petaKomentar = (r) => ({
  id: r.id,
  jenis: r.jenis,
  target_id: r.target_id,
  tim_user_id: r.tim_user_id,
  penulis_id: r.penulis_id,
  penulis_username: r.penulis_username || "",
  penulis_role: r.penulis_role || "tim",
  parent_id: r.parent_id || "",
  isi: r.isi,
  selesai: !!r.selesai,
  edited_at: r.edited_at || "",
  createdAt: r.created_at,
});

export async function addKomentar({ jenis, targetId, timUserId, penulisId, parentId = "", isi }) {
  const k = {
    id: newId(),
    jenis,
    target_id: String(targetId),
    tim_user_id: String(timUserId),
    penulis_id: String(penulisId),
    parent_id: String(parentId || ""),
    isi: String(isi),
    createdAt: nowIso(),
  };
  await q(
    `INSERT INTO komentar (id, jenis, target_id, tim_user_id, penulis_id, parent_id, isi, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [k.id, k.jenis, k.target_id, k.tim_user_id, k.penulis_id, k.parent_id, k.isi, k.createdAt]
  );
  // Penulis otomatis dianggap sudah membaca komentarnya sendiri
  await tandaiDibaca(penulisId, [k.id]);
  return k;
}

/** Komentar sebuah target (atau semua milik tim bila targetId null) + info penulis. */
export async function listKomentar(jenis, targetId, timUserId) {
  const params = [timUserId, jenis];
  let where = "k.tim_user_id = $1 AND k.jenis = $2";
  if (targetId != null) {
    params.push(String(targetId));
    where += " AND k.target_id = $3";
  }
  const rows = await q(
    `SELECT k.*, u.username AS penulis_username, COALESCE(u.role, 'tim') AS penulis_role
       FROM komentar k LEFT JOIN users u ON u.id = k.penulis_id
      WHERE ${where}
      ORDER BY k.created_at`,
    params
  );
  return rows.map(petaKomentar);
}

/** Hitung komentar per target untuk badge daftar entri: { [target_id]: n }. */
export async function hitungKomentarPerTarget(timUserId, jenis) {
  const rows = await q(
    `SELECT target_id, COUNT(*) AS n FROM komentar
      WHERE tim_user_id = $1 AND jenis = $2 GROUP BY target_id`,
    [timUserId, jenis]
  );
  const peta = {};
  for (const r of rows) peta[r.target_id] = angka(r.n);
  return peta;
}

export async function getKomentarById(id) {
  const rows = await q(
    `SELECT k.*, u.username AS penulis_username, COALESCE(u.role, 'tim') AS penulis_role
       FROM komentar k LEFT JOIN users u ON u.id = k.penulis_id
      WHERE k.id = $1`,
    [String(id || "")]
  );
  return rows[0] ? petaKomentar(rows[0]) : null;
}

/** Edit isi komentar milik sendiri → tandai edited_at (label "(diedit)"). */
export async function updateKomentarIsi(id, isi) {
  const rows = await q(
    "UPDATE komentar SET isi = $1, edited_at = $2 WHERE id = $3 RETURNING id",
    [String(isi), nowIso(), id]
  );
  return rows.length > 0;
}

export async function deleteKomentar(id) {
  // Balasan ikut terhapus supaya thread tidak menggantung
  const rows = await q(
    "DELETE FROM komentar WHERE id = $1 OR parent_id = $1 RETURNING id", [id]
  );
  const ids = rows.map((r) => r.id);
  if (ids.length) {
    await q("DELETE FROM komentar_baca WHERE komentar_id = ANY($1)", [ids]);
  }
  return ids.length;
}

export async function setKomentarSelesai(id, selesai) {
  const rows = await q(
    "UPDATE komentar SET selesai = $1 WHERE id = $2 RETURNING id",
    [!!selesai, id]
  );
  return rows.length > 0;
}

/**
 * Hitung komentar BELUM DIBACA milik user ini, per jenis.
 * - tim  : komentar orang lain di logbook-nya.
 * - fasilitator: komentar orang lain di semua tim yang ia ampu.
 * Return: { kegiatan: n, keuangan: n, laporan: n, total: n }
 */
export async function hitungBelumDibaca(userId, role) {
  const scope =
    role && role !== "tim"
      ? `k.tim_user_id IN (SELECT tim_user_id FROM fasilitator_tim WHERE fasilitator_id = $1)`
      : `k.tim_user_id = $1`;
  const rows = await q(
    `SELECT k.jenis, COUNT(*) AS n
       FROM komentar k
       LEFT JOIN komentar_baca b ON b.komentar_id = k.id AND b.user_id = $1
      WHERE ${scope} AND k.penulis_id <> $1 AND b.user_id IS NULL
      GROUP BY k.jenis`,
    [userId]
  );
  const hasil = { kegiatan: 0, keuangan: 0, laporan: 0, presentasi: 0, total: 0 };
  for (const r of rows) {
    hasil[r.jenis] = angka(r.n);
    hasil.total += angka(r.n);
  }
  return hasil;
}

/** Tandai daftar komentar sudah dibaca oleh user ini (idempoten). */
export async function tandaiDibaca(userId, komentarIds) {
  for (const kid of komentarIds || []) {
    await q(
      `INSERT INTO komentar_baca (komentar_id, user_id) VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [String(kid), String(userId)]
    );
  }
}

/* ---------- ACC / pengesahan oleh DOSEN PENDAMPING ----------
 * jenis: 'kegiatan' | 'keuangan' | 'laporan'
 * target_id: id entri (laporan → tim_user_id, karena 1 laporan per tim)
 * status: 'disetujui' | 'revisi'  — tanpa baris = 'menunggu'.
 * Satu baris per entri (PK jenis+target_id): ACC dosen mana pun menimpa
 * status sebelumnya, dan selalu tercatat siapa peninjau terakhirnya. */

export const STATUS_ACC = ["disetujui", "revisi"];

const petaPersetujuan = (r) => ({
  jenis: r.jenis,
  target_id: r.target_id,
  tim_user_id: r.tim_user_id,
  dosen_id: r.dosen_id,
  dosen_username: r.dosen_username || "",
  status: r.status,
  catatan: r.catatan || "",
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

/** Simpan/ubah status ACC sebuah entri (UPSERT). */
export async function setPersetujuan({ jenis, targetId, timUserId, dosenId, status, catatan = "" }) {
  const ts = nowIso();
  await q(
    `INSERT INTO persetujuan (jenis, target_id, tim_user_id, dosen_id, status, catatan, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $7)
     ON CONFLICT (jenis, target_id) DO UPDATE SET
       tim_user_id = EXCLUDED.tim_user_id, dosen_id = EXCLUDED.dosen_id,
       status = EXCLUDED.status, catatan = EXCLUDED.catatan,
       updated_at = EXCLUDED.updated_at`,
    [String(jenis), String(targetId), String(timUserId), String(dosenId),
     String(status), String(catatan).slice(0, 1000), ts]
  );
  return getPersetujuan(jenis, targetId);
}

/** Batalkan ACC sebuah entri → status kembali "menunggu". */
export async function hapusPersetujuan(jenis, targetId) {
  const rows = await q(
    "DELETE FROM persetujuan WHERE jenis = $1 AND target_id = $2 RETURNING jenis",
    [String(jenis), String(targetId)]
  );
  return rows.length > 0;
}

export async function getPersetujuan(jenis, targetId) {
  const rows = await q(
    `SELECT p.*, u.username AS dosen_username
       FROM persetujuan p LEFT JOIN users u ON u.id = p.dosen_id
      WHERE p.jenis = $1 AND p.target_id = $2`,
    [String(jenis), String(targetId)]
  );
  return rows[0] ? petaPersetujuan(rows[0]) : null;
}

/** Peta status ACC seluruh entri satu tim: { [target_id]: {status, …} }. */
export async function listPersetujuan(timUserId, jenis) {
  const params = [String(timUserId)];
  let where = "p.tim_user_id = $1";
  if (jenis) {
    params.push(String(jenis));
    where += " AND p.jenis = $2";
  }
  const rows = await q(
    `SELECT p.*, u.username AS dosen_username
       FROM persetujuan p LEFT JOIN users u ON u.id = p.dosen_id
      WHERE ${where}`,
    params
  );
  const peta = {};
  for (const r of rows) peta[r.target_id] = petaPersetujuan(r);
  return peta;
}

/**
 * Ringkasan ACC satu tim untuk kartu dashboard & panel:
 * { kegiatan: {total, disetujui, revisi, menunggu}, keuangan: {…}, laporan: {…}, total_revisi }
 */
export async function ringkasPersetujuan(timUserId) {
  const [kegRows, keuRows, lap, pres, accRows] = await Promise.all([
    q("SELECT COUNT(*) AS n FROM kegiatan WHERE user_id = $1", [timUserId]),
    q("SELECT COUNT(*) AS n FROM keuangan WHERE user_id = $1", [timUserId]),
    infoLaporan(timUserId),
    infoPresentasi(timUserId),
    q(`SELECT jenis, status, COUNT(*) AS n FROM persetujuan
        WHERE tim_user_id = $1 GROUP BY jenis, status`, [timUserId]),
  ]);
  const jml = {
    kegiatan: angka(kegRows[0]?.n),
    keuangan: angka(keuRows[0]?.n),
    laporan: lap.ada ? 1 : 0,
    presentasi: pres.ada ? 1 : 0,
  };
  const hasil = {};
  const SEMUA_JENIS = ["kegiatan", "keuangan", "laporan", "presentasi"];
  for (const jenis of SEMUA_JENIS) {
    hasil[jenis] = { total: jml[jenis], disetujui: 0, revisi: 0, menunggu: 0 };
  }
  for (const r of accRows) {
    const b = hasil[r.jenis];
    if (b && (r.status === "disetujui" || r.status === "revisi")) b[r.status] = angka(r.n);
  }
  let totalRevisi = 0;
  let totalDisetujui = 0;
  for (const jenis of SEMUA_JENIS) {
    const b = hasil[jenis];
    b.menunggu = Math.max(0, b.total - b.disetujui - b.revisi);
    totalRevisi += b.revisi;
    totalDisetujui += b.disetujui;
  }
  hasil.total_revisi = totalRevisi;
  hasil.total_disetujui = totalDisetujui;
  return hasil;
}

/** Ringkasan ACC untuk SEMUA tim yang diampu seorang pendamping (badge menu). */
export async function ringkasPersetujuanPendamping(pendampingId) {
  const rows = await q(
    `SELECT COUNT(*) FILTER (WHERE p.status = 'revisi')    AS revisi,
            COUNT(*) FILTER (WHERE p.status = 'disetujui') AS disetujui
       FROM persetujuan p
      WHERE p.tim_user_id IN (
              SELECT tim_user_id FROM fasilitator_tim WHERE fasilitator_id = $1)`,
    [String(pendampingId)]
  );
  return { revisi: angka(rows[0]?.revisi), disetujui: angka(rows[0]?.disetujui) };
}

/* ---------- Kode gabung tim (self-service, tanpa admin) ----------
 * Tiap akun tim punya KODE unik yang bisa ia lihat & bagikan sendiri.
 * Pendamping memasukkan kode itu → langsung ter-assign ke tim tersebut.
 * Kode disimpan di tabel `pengaturan` (kunci 'kode_tim') sehingga tidak
 * perlu perubahan skema. Tim dapat mencetak ulang kode (kode lama mati)
 * dan mengeluarkan pendamping kapan saja. */

// Tanpa I, O, 0, 1 supaya tidak salah baca saat dikirim lewat WA
const ABJAD_KODE = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function acakKode(n = 8) {
  let s = "";
  for (const b of crypto.randomBytes(n)) s += ABJAD_KODE[b % ABJAD_KODE.length];
  return s;
}

/** Bersihkan input pengguna: huruf besar, tanpa spasi/tanda hubung. */
export const rapikanKode = (kode) =>
  String(kode || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12);

/** Bentuk tampilan yang enak dibaca: ABCD-2345. */
export const tampilKode = (kode) =>
  kode && kode.length > 4 ? `${kode.slice(0, 4)}-${kode.slice(4)}` : kode || "";

async function kodeSudahDipakai(kode) {
  const rows = await q(
    "SELECT 1 FROM pengaturan WHERE kunci = 'kode_tim' AND nilai = $1", [kode]
  );
  return rows.length > 0;
}

/** Kode tim (dibuat otomatis saat pertama kali dilihat). */
export async function getKodeTim(timUserId) {
  const ada = await getSetting(timUserId, "kode_tim");
  return ada || resetKodeTim(timUserId);
}

/** Cetak ulang kode — kode lama langsung tidak berlaku. */
export async function resetKodeTim(timUserId) {
  let kode = acakKode();
  for (let i = 0; i < 5 && (await kodeSudahDipakai(kode)); i += 1) kode = acakKode();
  await setSetting(timUserId, "kode_tim", kode);
  return kode;
}

/** Cari akun tim pemilik sebuah kode (null bila tidak ada). */
export async function cariTimByKode(kode) {
  const bersih = rapikanKode(kode);
  if (bersih.length < 6) return null;
  const rows = await q(
    `SELECT u.id, u.username
       FROM pengaturan p JOIN users u ON u.id = p.user_id
      WHERE p.kunci = 'kode_tim' AND p.nilai = $1
        AND COALESCE(u.role, 'tim') = 'tim'
      LIMIT 1`,
    [bersih]
  );
  return rows[0] ? { id: rows[0].id, username: rows[0].username } : null;
}

/** Pasang satu assignment pendamping↔tim. Return true bila benar-benar baru. */
export async function tambahPendampingKeTim(pendampingId, timUserId) {
  const rows = await q(
    `INSERT INTO fasilitator_tim (fasilitator_id, tim_user_id, created_at)
     VALUES ($1, $2, $3) ON CONFLICT DO NOTHING RETURNING tim_user_id`,
    [String(pendampingId), String(timUserId), nowIso()]
  );
  return rows.length > 0;
}

/** Lepas satu assignment (dipakai tim "keluarkan" & pendamping "keluar"). */
export async function hapusPendampingDariTim(pendampingId, timUserId) {
  const rows = await q(
    `DELETE FROM fasilitator_tim
      WHERE fasilitator_id = $1 AND tim_user_id = $2 RETURNING tim_user_id`,
    [String(pendampingId), String(timUserId)]
  );
  return rows.length > 0;
}


