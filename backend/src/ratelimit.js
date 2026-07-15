/**
 * Rate limiter sederhana di memori (tanpa dependensi) — melindungi endpoint
 * sensitif (login/register) dari brute force lewat URL publik.
 *
 * Jendela geser per IP: maksimal `max` percobaan per `windowMs`.
 * Jika terlampaui → 429 + Retry-After (detik).
 */
const buckets = new Map(); // key -> { count, resetAt }

// Bersihkan bucket kedaluwarsa tiap 10 menit agar memori tidak menumpuk
setInterval(() => {
  const now = Date.now();
  for (const [k, b] of buckets) {
    if (b.resetAt <= now) buckets.delete(k);
  }
}, 10 * 60 * 1000).unref();

/**
 * Buat middleware pembatas laju.
 * @param {object} opts
 * @param {number} opts.windowMs jendela waktu (ms)
 * @param {number} opts.max maksimal percobaan per jendela
 * @param {string} opts.pesan pesan error yang ramah
 */
export function rateLimit({ windowMs = 60_000, max = 10, pesan = "Terlalu banyak percobaan — coba lagi nanti" } = {}) {
  return (req, res, next) => {
    // Di belakang tunnel/proxy, IP asli ada di X-Forwarded-For (ambil hop pertama)
    const fwd = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
    const ip = fwd || req.socket?.remoteAddress || "?";
    const key = `${req.method}:${req.baseUrl}${req.path}:${ip}`;
    const now = Date.now();

    let b = buckets.get(key);
    if (!b || b.resetAt <= now) {
      b = { count: 0, resetAt: now + windowMs };
      buckets.set(key, b);
    }
    b.count += 1;

    if (b.count > max) {
      const retrySec = Math.max(1, Math.ceil((b.resetAt - now) / 1000));
      res.setHeader("Retry-After", String(retrySec));
      return res.status(429).json({ error: `${pesan} (${retrySec} detik lagi)` });
    }
    next();
  };
}

