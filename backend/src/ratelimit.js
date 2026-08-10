/**
 * Pembatas laju (rate limit) untuk endpoint sensitif — anti brute force.
 *
 * PENTING (alasan pakai database, bukan memori):
 * Versi lama menyimpan penghitung di `Map` milik proses. Di Vercel, permintaan
 * yang datang bersamaan dilayani oleh BEBERAPA instance serverless berbeda,
 * masing-masing dengan memori sendiri — penghitung tidak pernah sinkron.
 * Penyerang cukup mengirim percobaan login secara paralel (atau memicu cold
 * start) untuk mereset hitungan, sehingga batas 20×/10 menit praktis tidak
 * pernah tercapai.
 *
 * Sekarang penghitung disimpan di Postgres (tabel `login_fails`) — SATU sumber
 * kebenaran yang dipakai semua instance, tahan restart maupun cold start.
 * Pola ini sama dengan yang sudah dipakai panel admin (admin_login_fails).
 */
import { q } from "./db.js";

/** Ambil IP asli pemanggil (hop pertama X-Forwarded-For bila di balik proxy). */
export function ambilIp(req) {
  const sock = String(req.socket?.remoteAddress || "?");
  // Header hanya dipercaya bila memang datang lewat proxy tepercaya
  // (Vercel, atau cloudflared yang berjalan di localhost).
  const dariProxy =
    process.env.VERCEL ||
    sock === "127.0.0.1" || sock === "::1" || sock === "::ffff:127.0.0.1";
  if (!dariProxy) return sock;
  return String(
    req.headers["x-real-ip"] ||
    req.headers["cf-connecting-ip"] ||
    String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() ||
    sock
  );
}

/** Buang baris lawas sesekali supaya tabel tetap ramping (hemat kuota Neon). */
function bersihkanSesekali(now) {
  if (Math.random() >= 0.05) return;
  q("DELETE FROM login_fails WHERE locked_until < $1", [now - 24 * 60 * 60 * 1000])
    .catch(() => {});
}

/**
 * Buat middleware pembatas laju.
 * @param {object} opts
 * @param {number} opts.windowMs jendela waktu (ms)
 * @param {number} opts.max maksimal percobaan per jendela
 * @param {string} opts.pesan pesan error yang ramah
 * @param {string} opts.nama label unik penghitung (default: path endpoint)
 */
export function rateLimit({
  windowMs = 60_000,
  max = 10,
  pesan = "Terlalu banyak percobaan — coba lagi nanti",
  nama = "",
} = {}) {
  return async (req, res, next) => {
    try {
      const now = Date.now();
      const label = nama || `${req.method}:${req.baseUrl}${req.path}`;
      const kunci = `${label}|${ambilIp(req)}`;

      // Satu perjalanan ke database: naikkan penghitung, atau mulai jendela
      // baru bila jendela sebelumnya sudah lewat. Nilai `n` sesudah operasi
      // langsung dikembalikan (RETURNING) — tidak perlu query kedua.
      const rows = await q(
        `INSERT INTO login_fails (kunci, n, locked_until) VALUES ($1, 1, $2)
         ON CONFLICT (kunci) DO UPDATE SET
           n = CASE WHEN login_fails.locked_until <= $3 THEN 1 ELSE login_fails.n + 1 END,
           locked_until = CASE WHEN login_fails.locked_until <= $3 THEN $2 ELSE login_fails.locked_until END
         RETURNING n, locked_until`,
        [kunci, now + windowMs, now]
      );

      const n = Number(rows[0]?.n || 1);
      const sampai = Number(rows[0]?.locked_until || now + windowMs);
      bersihkanSesekali(now);

      if (n > max) {
        const retrySec = Math.max(1, Math.ceil((sampai - now) / 1000));
        res.setHeader("Retry-After", String(retrySec));
        return res.status(429).json({ error: `${pesan} (${retrySec} detik lagi)` });
      }
      next();
    } catch {
      // Database bermasalah → jangan sampai pengguna sah ikut terkunci.
      next();
    }
  };
}

/** Nol-kan penghitung setelah percobaan yang BERHASIL (mis. login sukses). */
export function resetLaju(req, nama) {
  const kunci = `${nama}|${ambilIp(req)}`;
  q("DELETE FROM login_fails WHERE kunci = $1", [kunci]).catch(() => {});
}
