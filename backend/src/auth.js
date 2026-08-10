/**
 * Middleware autentikasi.
 *
 * Token diterima dari DUA sumber (tidak lagi dari query string):
 *  1. Header `Authorization: Bearer …` — dipakai seluruh panggilan fetch().
 *  2. Cookie HttpOnly `logbook_sesi` — dipakai <img> & tautan unduhan yang
 *     tidak bisa mengirim header sendiri.
 *
 * Token TIDAK PERNAH lagi diletakkan di URL (?token=), sehingga tidak bocor
 * lewat riwayat browser, log server/CDN, maupun header Referer.
 */
import crypto from "node:crypto";
import * as store from "./storage.js";
import { COOKIE_SESI, bacaCookie, pasangCookieSesi } from "./cookies.js";
import { jejakDari } from "./perangkat.js";


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

/**
 * Buang sesi dari cache berdasarkan HASH token-nya.
 * Dipakai saat pengguna mencabut sesi perangkat lain: di sana kita hanya
 * memegang hash (token aslinya memang tidak pernah disimpan server), sedangkan
 * cache ini dikunci token asli — jadi cocokkan dengan menghitung ulang hash
 * tiap kunci. Isi cache dibatasi 500 entri, jadi biayanya tidak berarti.
 */
export function lupakanSesiHash(hash) {
  const cari = String(hash || "");
  if (!cari) return;
  for (const token of sesiCache.keys()) {
    if (crypto.createHash("sha256").update(token).digest("hex") === cari) {
      sesiCache.delete(token);
      return;
    }
  }
}

/** Buang SEMUA sesi milik satu akun dari cache (kecuali token pemanggil). */
export function lupakanSesiUser(userId, kecualiToken = "") {
  for (const [token, c] of sesiCache) {
    if (c.user?.id === userId && token !== kecualiToken) sesiCache.delete(token);
  }
}

export async function authRequired(req, res, next) {
  try {
    const h = String(req.headers.authorization || "");
    const bearer = h.startsWith("Bearer ") ? h.slice(7).trim() : "";
    const dariCookie = bacaCookie(req, COOKIE_SESI);
    const token = bearer || dariCookie;
    if (!token) return res.status(401).json({ error: "Harus login terlebih dahulu" });

    let user = ambilCache(token);
    if (!user) {
      // Jejak perangkat dikirim agar sesi lama (dibuat sebelum fitur daftar
      // perangkat ada) ikut terisi labelnya sekali jalan — lihat storage.js.
      const sess = await store.getSession(token, jejakDari(req));
      if (!sess) return res.status(401).json({ error: "Harus login terlebih dahulu" });
      user = await store.getUserById(sess.userId);
      if (!user) return res.status(401).json({ error: "Akun tidak ditemukan" });
      simpanCache(token, user);
    }
    // Sesi lama (login sebelum fitur cookie ada) belum punya cookie: pasang
    // sekarang supaya gambar & unduhan tetap jalan TANPA perlu login ulang.
    if (bearer && dariCookie !== bearer) pasangCookieSesi(req, res, bearer);

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

