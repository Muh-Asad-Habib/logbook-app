/** Middleware autentikasi: token Bearer (header) atau ?token= (untuk <img>/link unduhan). */
import * as store from "./storage.js";

/**
 * Cache sesi singkat (per instance). Saat halaman memuat puluhan foto
 * sekaligus, tiap <img> memicu request tersendiri — tanpa cache, semuanya
 * menembak database (2 query per gambar) dan sebagian bisa timeout →
 * foto tampak rusak. Token yang sama cukup divalidasi sekali per 30 detik.
 * Kompromi: sesi yang dicabut masih dianggap sah maksimal 30 detik.
 */
const CACHE_MS = 30 * 1000;
const CACHE_MAKS = 500;
const sesiCache = new Map(); // token -> { user, exp }

function ambilCache(token) {
  const c = sesiCache.get(token);
  if (!c) return null;
  if (Date.now() > c.exp) {
    sesiCache.delete(token);
    return null;
  }
  return c.user;
}

function simpanCache(token, user) {
  if (sesiCache.size >= CACHE_MAKS) {
    const tertua = sesiCache.keys().next().value;
    sesiCache.delete(tertua);
  }
  sesiCache.set(token, { user, exp: Date.now() + CACHE_MS });
}

/** Buang token dari cache (dipanggil saat logout supaya langsung tidak sah). */
export function lupakanSesi(token) {
  sesiCache.delete(String(token || ""));
}

export async function authRequired(req, res, next) {
  try {
    const h = String(req.headers.authorization || "");
    const bearer = h.startsWith("Bearer ") ? h.slice(7).trim() : "";
    const token = bearer || String(req.query.token || "");
    if (!token) return res.status(401).json({ error: "Harus login terlebih dahulu" });

    let user = ambilCache(token);
    if (!user) {
      const sess = await store.getSession(token);
      if (!sess) return res.status(401).json({ error: "Harus login terlebih dahulu" });
      user = await store.getUserById(sess.userId);
      if (!user) return res.status(401).json({ error: "Akun tidak ditemukan" });
      simpanCache(token, user);
    }
    req.userId = user.id;
    req.user = { id: user.id, username: user.username, role: user.role || "tim" };
    req.token = token;
    next();
  } catch (err) {
    next(err);
  }
}

/** Peran pendamping (baca + komentar): fasilitator & dosen pendamping. */
export const PERAN_PENDAMPING = new Set(["fasilitator", "dosen"]);

/** Label ramah untuk pesan error. */
const labelPeran = (r) => (r === "dosen" ? "dosen pendamping" : "fasilitator");

/**
 * Pagar tulis: hanya akun TIM yang boleh lewat.
 * Dipasang di seluruh router aksi data (kegiatan/keuangan/laporan/ekspor/impor)
 * supaya pendamping (fasilitator & dosen) mustahil mengubah data tim —
 * bahkan lewat API langsung.
 */
export function hanyaTim(req, res, next) {
  const role = req.user?.role;
  if (PERAN_PENDAMPING.has(role)) {
    return res.status(403).json({
      error: `Akun ${labelPeran(role)} hanya dapat melihat & mengomentari`,
    });
  }
  next();
}

/** Kebalikan hanyaTim — dipakai router /api/fasilitator (fasilitator & dosen). */
export function hanyaPendamping(req, res, next) {
  if (!PERAN_PENDAMPING.has(req.user?.role)) {
    return res.status(403).json({ error: "Khusus akun fasilitator / dosen pendamping" });
  }
  next();
}

/** Nama lama — dipertahankan agar pemanggil lama tidak rusak. */
export const hanyaFasilitator = hanyaPendamping;

/** Pagar ACC: hanya DOSEN PENDAMPING yang boleh mengesahkan entri. */
export function hanyaDosen(req, res, next) {
  if (req.user?.role !== "dosen") {
    return res.status(403).json({
      error: "Hanya dosen pendamping yang dapat memberi ACC / meminta revisi",
    });
  }
  next();
}

