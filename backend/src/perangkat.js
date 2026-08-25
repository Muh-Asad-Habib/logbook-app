/**
 * Ringkasan perangkat untuk halaman "Perangkat & Sesi Aktif".
 *
 * Tujuannya SATU: membantu pemilik akun mengenali sesinya sendiri
 * ("Chrome · Windows", "Safari · iPhone") supaya ia bisa mencabut sesi yang
 * tidak ia kenali — mis. laptop warnet yang lupa logout, atau tanda akun
 * dibajak.
 *
 * PRIVASI — sengaja menyimpan sesedikit mungkin:
 *  • User-Agent TIDAK disimpan mentah (itu sidik jari yang cukup unik dan
 *    berumur panjang). Yang disimpan hanya label pendek hasil pemetaan di
 *    bawah, maksimal ±40 karakter, dari daftar tertutup.
 *  • IP tersamar (`114.120.•.•`) inilah yang ditampilkan kepada PEMILIK AKUN —
 *    cukup untuk membedakan "ini jaringan rumahku" dari "ini jaringan asing",
 *    tapi tidak cukup untuk melacak lokasi seseorang.
 *  • IP penuh disimpan TERPISAH (kolom `ip_penuh`) dan hanya pernah terlihat
 *    di pusat kendali (admin) untuk menyelidiki login asing.
 *  • Semuanya ikut terhapus otomatis saat sesinya kedaluwarsa/dicabut —
 *    tidak ada jejak IP yang hidup lebih lama daripada sesinya.
 *
 * Parsing sengaja ditulis tangan (tanpa pustaka ua-parser) supaya bundel
 * serverless tetap kecil: kita hanya butuh label kasar, bukan versi presisi.
 */
import { ambilIp } from "./ratelimit.js";

/* Urutan PENTING: banyak peramban menaruh nama peramban lain di UA-nya
 * demi kompatibilitas (Edge & Opera menyebut "Chrome", Chrome menyebut
 * "Safari"). Karena itu yang paling spesifik diperiksa lebih dulu. */
const PERAMBAN = [
  [/\bEdgA?\/|\bEdge\//i, "Edge"],
  [/\bOPR\/|\bOpera\//i, "Opera"],
  [/\bSamsungBrowser\//i, "Samsung Internet"],
  [/\bYaBrowser\//i, "Yandex"],
  [/\bUCBrowser\//i, "UC Browser"],
  [/\bFirefox\/|\bFxiOS\//i, "Firefox"],
  [/\bCriOS\//i, "Chrome"],
  [/\bChrome\/|\bChromium\//i, "Chrome"],
  [/\bSafari\//i, "Safari"],
];

const SISTEM = [
  [/\bAndroid\b/i, "Android"],
  [/\biPhone\b/i, "iPhone"],
  [/\biPad\b/i, "iPad"],
  [/\bCrOS\b/i, "ChromeOS"],
  [/\bWindows NT\b/i, "Windows"],
  [/\bMac OS X\b|\bMacintosh\b/i, "macOS"],
  [/\bLinux\b|\bX11\b/i, "Linux"],
];

const cocok = (daftar, ua) => daftar.find(([re]) => re.test(ua))?.[1] || "";

/* ---------- Client Hints: satu-satunya cara mengenali Brave ----------
 *
 * Brave SENGAJA memakai User-Agent yang identik dengan Chrome (anti
 * fingerprinting), sehingga pemeriksaan UA di atas selalu melabelinya
 * "Chrome". Namun Brave tetap mengumumkan dirinya di header `Sec-CH-UA`:
 *
 *   "Not/A)Brand";v="8", "Chromium";v="126", "Brave";v="126"
 *
 * Header ini dikirim peramban berbasis Chromium pada konteks aman (HTTPS)
 * — persis kasus aplikasi ini. Bila tidak ada (Firefox/Safari, atau HTTP
 * lokal), kita jatuh kembali ke pembacaan User-Agent.
 *
 * Urutan penting: merek spesifik diperiksa lebih dulu, "Google Chrome"
 * terakhir, karena Chromium/Not-A-Brand selalu ikut disebut semua merek.
 */
const BRAND = [
  [/\bbrave\b/i, "Brave"],
  [/microsoft edge/i, "Edge"],
  [/\bopera\b/i, "Opera"],
  [/\bvivaldi\b/i, "Vivaldi"],
  [/\byandex\b/i, "Yandex"],
  [/samsung/i, "Samsung Internet"],
  [/google chrome/i, "Chrome"],
  [/\bchromium\b/i, "Chromium"],
];

/** Nama peramban dari header Sec-CH-UA ("" bila header tidak dikirim). */
function perambanDariHint(headers) {
  const raw = String(headers?.["sec-ch-ua"] || "").slice(0, 300);
  return raw ? cocok(BRAND, raw) : "";
}

/** Sistem operasi dari Sec-CH-UA-Platform, mis. `"Linux"` → "Linux". */
function sistemDariHint(headers) {
  const raw = String(headers?.["sec-ch-ua-platform"] || "")
    .replace(/"/g, "").trim().slice(0, 20);
  if (!raw || /unknown/i.test(raw)) return "";
  if (/^chrome ?os$/i.test(raw)) return "ChromeOS";
  if (/^macos$/i.test(raw)) return "macOS";
  return raw; // "Windows" | "Linux" | "Android" | "iOS" | …
}

/**
 * Ubah User-Agent (+ Client Hints bila ada) menjadi label pendek yang bisa
 * dibaca manusia.
 * @param {string} ua isi header User-Agent
 * @param {object} [headers] seluruh header request — untuk membaca Sec-CH-UA
 * @returns {string} mis. "Brave · Linux" — "" bila benar-benar tidak dikenali
 */
export function ringkasPerangkat(ua, headers = null) {
  const s = String(ua || "").slice(0, 400); // jangan proses header raksasa
  // Client Hints lebih tepercaya daripada UA (Brave hanya jujur di sini).
  const peramban = perambanDariHint(headers) || cocok(PERAMBAN, s);
  let sistem = sistemDariHint(headers) || cocok(SISTEM, s);
  // UA lebih spesifik untuk perangkat Apple: hint hanya bilang "iOS".
  if (/^ios$/i.test(sistem)) sistem = cocok(SISTEM, s) || "iOS";
  const bagian = [peramban, sistem].filter(Boolean);
  return bagian.join(" · ").slice(0, 40);
}

/**
 * Samarkan IP: simpan hanya bagian jaringannya.
 *   114.120.33.5  → "114.120.•.•"
 *   2404:6800:…   → "2404:6800:•"
 * IP lokal (dev di laptop sendiri) ditandai apa adanya supaya tidak
 * membingungkan saat pengembangan.
 */
export function samarkanIp(ip) {
  let s = String(ip || "").trim();
  if (!s || s === "?") return "";
  if (s.startsWith("::ffff:")) s = s.slice(7); // IPv4 terbungkus IPv6
  if (s === "::1" || s === "127.0.0.1") return "perangkat ini";
  if (s.includes(":")) {
    const h = s.split(":").filter(Boolean).slice(0, 2);
    return h.length ? `${h.join(":")}:•` : "";
  }
  const o = s.split(".");
  return o.length === 4 ? `${o[0]}.${o[1]}.•.•` : "";
}

/**
 * Rapikan IP apa adanya (untuk pusat kendali): buang bungkus IPv6 dan
 * batasi panjangnya. IP lokal tetap ditandai supaya jelas saat pengembangan.
 */
export function rapikanIp(ip) {
  let s = String(ip || "").trim();
  if (!s || s === "?") return "";
  if (s.startsWith("::ffff:")) s = s.slice(7);
  if (s === "::1" || s === "127.0.0.1") return "lokal (perangkat server)";
  return s.slice(0, 45);
}

/**
 * Jejak ringkas dari sebuah request — dipakai saat sesi dibuat.
 *
 * `ip` (tersamar) ditampilkan ke pemilik akun, `ipPenuh` HANYA dipakai
 * pusat kendali. Keduanya hidup selama sesinya saja.
 * @returns {{ perangkat: string, ip: string, ipPenuh: string }}
 */
export function jejakDari(req) {
  const mentah = ambilIp(req);
  return {
    perangkat: ringkasPerangkat(req?.headers?.["user-agent"], req?.headers),
    ip: samarkanIp(mentah),
    ipPenuh: rapikanIp(mentah),
  };
}

