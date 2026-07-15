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

function nowIso() {
  return new Date().toISOString();
}

export function newId() {
  return crypto.randomUUID();
}

/* ---------- pemetaan baris DB -> objek aplikasi ---------- */

const petaUser = (r) =>
  r && {
    id: r.id,
    username: r.username,
    usernameLower: r.username_lower,
    passHash: r.pass_hash,
    createdAt: r.created_at,
    updatedAt: r.updated_at || "",
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

const petaKeuangan = (r) => ({
  id: r.id,
  userId: r.user_id,
  tanggal: r.tanggal,
  item: r.item,
  harga_satuan: angka(r.harga_satuan),
  satuan_suffix: r.satuan_suffix || "",
  jumlah: angka(r.jumlah),
  total: angka(r.total),
  bukti_key: r.bukti_key || "",
  createdAt: r.created_at,
});

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

export async function createUser(username, password) {
  const u = {
    id: newId(),
    username: String(username).trim(),
    usernameLower: String(username).trim().toLowerCase(),
    passHash: hashPassword(password),
    createdAt: nowIso(),
  };
  await q(
    "INSERT INTO users (id, username, username_lower, pass_hash, created_at) VALUES ($1, $2, $3, $4, $5)",
    [u.id, u.username, u.usernameLower, u.passHash, u.createdAt]
  );
  return u;
}

/** Ganti username (dipakai halaman profil & panel pemeliharaan). */
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
  const rows = await q(
    "DELETE FROM sessions WHERE user_id = $1 AND token <> $2 RETURNING token",
    [userId, exceptToken]
  );
  return rows.length;
}

/** Daftar semua akun + ringkasan datanya (tanpa hash password). */
export async function listUsersWithStats() {
  const rows = await q(
    `SELECT u.id, u.username, u.created_at, u.updated_at,
            (SELECT COUNT(*) FROM kegiatan k WHERE k.user_id = u.id)                    AS n_keg,
            (SELECT COUNT(*) FROM keuangan b WHERE b.user_id = u.id)                    AS n_keu,
            (SELECT COALESCE(SUM(jsonb_array_length(k.foto_keys)), 0)
               FROM kegiatan k WHERE k.user_id = u.id)                                  AS n_foto_keg,
            (SELECT COUNT(*) FROM keuangan b WHERE b.user_id = u.id AND b.bukti_key <> '') AS n_foto_keu,
            (SELECT COUNT(*) FROM sessions s WHERE s.user_id = u.id)                    AS n_sesi,
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
    kegiatan: angka(r.n_keg),
    keuangan: angka(r.n_keu),
    foto: angka(r.n_foto_keg) + angka(r.n_foto_keu),
    sesi: angka(r.n_sesi),
    aktivitasTerakhir: r.last_at || "",
    pemilikTemplate: ownerId === r.id,
    dana_awal: r.dana_awal || "",
  }));
}

/** Detail lengkap satu akun untuk panel pemeliharaan (tanpa hash password). */
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
    bukti_key: e.bukti_key,
  }));
  const danaAwal = Number(await getSetting(userId, "dana_awal", "0")) || 0;
  const pengeluaran = keuangan.reduce((s, e) => s + e.total, 0);
  return {
    user: { id: u.id, username: u.username, createdAt: u.createdAt },
    kegiatan,
    keuangan,
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
    "SELECT bukti_key FROM keuangan WHERE user_id = $1 AND bukti_key <> ''", [userId]
  )) {
    fileKeys.push(r.bukti_key);
  }
  await q("DELETE FROM kegiatan   WHERE user_id = $1", [userId]);
  await q("DELETE FROM keuangan   WHERE user_id = $1", [userId]);
  await q("DELETE FROM pengaturan WHERE user_id = $1", [userId]);
  await q("DELETE FROM sessions   WHERE user_id = $1", [userId]);
  await q("DELETE FROM users      WHERE id      = $1", [userId]);
  if ((await getMeta("templateOwnerId")) === userId) {
    await q("DELETE FROM meta WHERE kunci = 'templateOwnerId'");
  }
  return { user: { id: u.id, username: u.username }, fileKeys };
}

/* ---------- Sesi (token login) ---------- */

/** Umur maksimal sesi: 30 hari. Sesi lama otomatis tidak berlaku & dibersihkan. */
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** Buang semua sesi kedaluwarsa. */
export async function purgeExpiredSessions() {
  const batas = new Date(Date.now() - SESSION_TTL_MS).toISOString();
  const rows = await q("DELETE FROM sessions WHERE created_at < $1 RETURNING token", [batas]);
  return rows.length;
}

export async function createSession(userId) {
  const token = newToken();
  await q("INSERT INTO sessions (token, user_id, created_at) VALUES ($1, $2, $3)", [
    token, userId, nowIso(),
  ]);
  return token;
}

export async function getSession(token) {
  const rows = await q("SELECT * FROM sessions WHERE token = $1", [String(token || "")]);
  const s = rows[0];
  if (!s) return null;
  const dibuat = Date.parse(s.created_at || "") || 0;
  if (Date.now() - dibuat > SESSION_TTL_MS) {
    await deleteSession(String(token));
    return null;
  }
  return { userId: s.user_id, createdAt: s.created_at };
}

export async function deleteSession(token) {
  await q("DELETE FROM sessions WHERE token = $1", [String(token || "")]);
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
  return e;
}

export async function deleteKegiatan(userId, id) {
  const rows = await q(
    "DELETE FROM kegiatan WHERE id = $1 AND user_id = $2 RETURNING *", [id, userId]
  );
  return rows[0] ? petaKegiatan(rows[0]) : null;
}

/* ---------- Keuangan ---------- */

export async function listKeuangan(userId) {
  const rows = await q(
    "SELECT * FROM keuangan WHERE user_id = $1 ORDER BY tanggal, created_at", [userId]
  );
  return rows.map(petaKeuangan);
}

export async function addKeuangan(userId, { tanggal, item, harga_satuan, satuan_suffix, jumlah, bukti_key }) {
  const e = {
    id: newId(),
    userId,
    tanggal,
    item,
    harga_satuan,
    satuan_suffix,
    jumlah,
    total: harga_satuan * jumlah,
    bukti_key,
    createdAt: nowIso(),
  };
  await q(
    `INSERT INTO keuangan (id, user_id, tanggal, item, harga_satuan, satuan_suffix, jumlah, total, bukti_key, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [e.id, e.userId, e.tanggal, e.item, e.harga_satuan, e.satuan_suffix,
     e.jumlah, e.total, e.bukti_key || "", e.createdAt]
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
  e.total = e.harga_satuan * e.jumlah;
  await q(
    `UPDATE keuangan SET tanggal = $1, item = $2, harga_satuan = $3, satuan_suffix = $4,
            jumlah = $5, total = $6, bukti_key = $7
      WHERE id = $8 AND user_id = $9`,
    [e.tanggal, e.item, e.harga_satuan, e.satuan_suffix, e.jumlah, e.total,
     e.bukti_key || "", id, userId]
  );
  return e;
}

export async function deleteKeuangan(userId, id) {
  const rows = await q(
    "DELETE FROM keuangan WHERE id = $1 AND user_id = $2 RETURNING *", [id, userId]
  );
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

