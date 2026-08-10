/**
 * Cookie sesi ber-HttpOnly — pengganti token di query string (?token=).
 *
 * MASALAH LAMA: tautan gambar & unduhan menyertakan token login penuh di URL
 * (`/api/files/x.jpg?token=abc…`). URL bocor ke riwayat browser, log server,
 * log CDN, dan header `Referer` saat dialihkan ke ImageKit — token itu setara
 * password, jadi kebocorannya berarti pembajakan akun.
 *
 * SOLUSI: token juga dikirim sebagai cookie `HttpOnly`, yang otomatis ikut
 * pada <img src> dan <a download> tanpa pernah muncul di URL. Karena frontend
 * dan API berada di SATU origin, `SameSite=Strict` bisa dipakai — cookie tidak
 * pernah terkirim dari situs lain, sehingga CSRF tertutup rapat.
 *
 * Catatan: JavaScript halaman TIDAK bisa membaca cookie ini (HttpOnly), jadi
 * pencurian lewat XSS pun tidak menghasilkan token. Permintaan API biasa tetap
 * memakai header Authorization seperti sebelumnya.
 */

/** Nama cookie sesi aplikasi. */
export const COOKIE_SESI = "logbook_sesi";

/** Umur cookie: 30 hari — selaras dengan masa sesi menganggur di database. */
const UMUR_DETIK = 30 * 24 * 60 * 60;

/** Apakah koneksi berjalan lewat HTTPS? (Vercel selalu ya) */
function amanHttps(req) {
  if (process.env.VERCEL) return true;
  const proto = String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim();
  return proto === "https" || !!req.socket?.encrypted;
}

/** Baca cookie dari header (tanpa dependensi cookie-parser). */
export function bacaCookie(req, nama) {
  const raw = String(req.headers?.cookie || "");
  if (!raw) return "";
  for (const bagian of raw.split(";")) {
    const eq = bagian.indexOf("=");
    if (eq < 0) continue;
    if (bagian.slice(0, eq).trim() !== nama) continue;
    try {
      return decodeURIComponent(bagian.slice(eq + 1).trim());
    } catch {
      return bagian.slice(eq + 1).trim();
    }
  }
  return "";
}

/** Tambahkan satu Set-Cookie tanpa menimpa Set-Cookie yang sudah ada. */
function tambahSetCookie(res, nilai) {
  const ada = res.getHeader("Set-Cookie");
  if (!ada) res.setHeader("Set-Cookie", nilai);
  else res.setHeader("Set-Cookie", Array.isArray(ada) ? [...ada, nilai] : [ada, nilai]);
}

/**
 * Pasang cookie sesi.
 * HttpOnly  → tidak terbaca JavaScript (aman dari XSS)
 * SameSite=Strict → tidak pernah terkirim dari situs lain (aman dari CSRF)
 * Secure    → hanya lewat HTTPS (dilonggarkan saat dev di http://localhost)
 */
export function pasangCookieSesi(req, res, token) {
  const bagian = [
    `${COOKIE_SESI}=${encodeURIComponent(String(token || ""))}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    `Max-Age=${UMUR_DETIK}`,
  ];
  if (amanHttps(req)) bagian.push("Secure");
  tambahSetCookie(res, bagian.join("; "));
}

/** Hapus cookie sesi (dipakai saat logout). */
export function hapusCookieSesi(req, res) {
  const bagian = [
    `${COOKIE_SESI}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    "Max-Age=0",
  ];
  if (amanHttps(req)) bagian.push("Secure");
  tambahSetCookie(res, bagian.join("; "));
}

