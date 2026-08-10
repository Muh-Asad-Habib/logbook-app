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
 *  • IP TIDAK disimpan utuh. Hanya dua blok pertama yang disimpan
 *    (`114.120.•.•`) — cukup untuk membedakan "ini jaringan rumahku" dari
 *    "ini jaringan asing", tapi tidak cukup untuk melacak lokasi seseorang.
 *  • Keduanya ikut terhapus otomatis saat sesinya kedaluwarsa/dicabut.
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

/**
 * Ubah User-Agent menjadi label pendek yang bisa dibaca manusia.
 * @returns {string} mis. "Chrome · Windows" — "" bila benar-benar tidak dikenali
 */
export function ringkasPerangkat(ua) {
  const s = String(ua || "").slice(0, 400); // jangan proses header raksasa
  if (!s) return "";
  const bagian = [cocok(PERAMBAN, s), cocok(SISTEM, s)].filter(Boolean);
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
 * Jejak ringkas dari sebuah request — dipakai saat sesi dibuat.
 * @returns {{ perangkat: string, ip: string }}
 */
export function jejakDari(req) {
  return {
    perangkat: ringkasPerangkat(req?.headers?.["user-agent"]),
    ip: samarkanIp(ambilIp(req)),
  };
}

