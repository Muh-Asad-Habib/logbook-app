/**
 * Hash & verifikasi password memakai scrypt bawaan Node (tanpa dependensi).
 *
 * Dua tingkat kekuatan:
 * - Akun biasa  : scrypt N=2^14, r=8, p=1 (rekomendasi OWASP).
 * - Super user  : scrypt N=2^15, r=8, p=1 (memory-hard 32 MB per percobaan —
 *   brute force praktis mustahil; GPU/ASIC tidak banyak membantu).
 *
 * Format simpanan: "s2:N:r:p:salt:hash" (salt & hash hex).
 * Format lama "salt:hash" tetap didukung untuk data yang sudah ada.
 */
import crypto from "node:crypto";

const MAXMEM = 128 * 1024 * 1024; // izinkan scrypt sampai 128 MB

function scryptHex(password, saltHex, N, r, p) {
  return crypto
    .scryptSync(String(password), Buffer.from(saltHex, "hex"), 64, { N, r, p, maxmem: MAXMEM })
    .toString("hex");
}

function hashWith(password, N, r, p) {
  const salt = crypto.randomBytes(32).toString("hex");
  return `s2:${N}:${r}:${p}:${salt}:${scryptHex(password, salt, N, r, p)}`;
}

/** Hash password akun biasa. */
export function hashPassword(password) {
  return hashWith(password, 2 ** 14, 8, 1);
}

/** Hash password super user (parameter lebih berat). */
export function hashPasswordStrong(password) {
  return hashWith(password, 2 ** 15, 8, 1);
}

/** Cocokkan password dengan hash tersimpan (timing-safe, semua format). */
export function verifyPassword(password, stored) {
  const s = String(stored || "");
  try {
    let testHex, expectHex;
    if (s.startsWith("s2:")) {
      const [, N, r, p, salt, hash] = s.split(":");
      testHex = scryptHex(password, salt, Number(N), Number(r), Number(p));
      expectHex = hash;
    } else {
      // format lama: "salt:hash" (salt dipakai sebagai string utf8)
      const [salt, hash] = s.split(":");
      if (!salt || !hash) return false;
      testHex = crypto.scryptSync(String(password), salt, 64).toString("hex");
      expectHex = hash;
    }
    const a = Buffer.from(testHex, "hex");
    const b = Buffer.from(expectHex, "hex");
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/** Verifikasi hash kuat (alias — format hash sudah menjelaskan parameternya). */
export const verifyPasswordStrong = verifyPassword;

/** Token sesi acak (aman secara kriptografis). */
export function newToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString("hex");
}

