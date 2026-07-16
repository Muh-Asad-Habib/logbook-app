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
    req.user = { id: user.id, username: user.username };
    req.token = token;
    next();
  } catch (err) {
    next(err);
  }
}

