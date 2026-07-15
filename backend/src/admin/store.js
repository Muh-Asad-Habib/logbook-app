/**
 * Penyimpanan & keamanan akun super user (pemeliharaan).
 *
 * PRINSIP KEAMANAN (versi cloud):
 * - Kredensial disimpan di tabel `meta` (Postgres) sebagai HASH scrypt
 *   memory-hard — siapa pun yang membaca database tidak bisa tahu
 *   username apalagi password-nya.
 * - Sesi panel disimpan di tabel `admin_sessions` (umur pendek, terikat
 *   User-Agent) — di serverless memori tidak bertahan antar-request,
 *   jadi sesi harus di database.
 * - Login dibatasi (rate limit per-IP + global, di memori per instance).
 * - Semua aksi dicatat ke tabel `audit` (tanpa pernah mencatat password).
 * - Tidak ada satu byte pun tentang modul ini di bundel frontend.
 */
import crypto from "node:crypto";
import { q, objek } from "../db.js";
import { hashPasswordStrong, verifyPasswordStrong, newToken } from "../passwords.js";
import { siarkan } from "../bus.js";

const SESSION_TTL_MS = 30 * 60 * 1000;   // 30 menit (diperpanjang tiap aktivitas)
const MAX_FAILS_PER_IP = 5;              // 5 kegagalan →
const LOCK_MS = 15 * 60 * 1000;          // kunci 15 menit
const MAX_FAILS_GLOBAL = 25;             // rem darurat lintas-IP

let admin = null;                        // cache kredensial (per proses)
let adminMuatPada = 0;                   // kapan cache terakhir dimuat
const CACHE_MS = 30 * 1000;              // segarkan cache tiap 30 detik
const fails = new Map();                 // ipKey -> { n, until } (per instance)
let globalFails = { n: 0, resetAt: 0 };

/* ---------------- kredensial ---------------- */

async function simpan() {
  await q(
    `INSERT INTO meta (kunci, nilai) VALUES ('admin', $1)
     ON CONFLICT (kunci) DO UPDATE SET nilai = EXCLUDED.nilai`,
    [JSON.stringify(admin)]
  );
}

/**
 * Muat kredensial panel; bila belum ada, buat dengan kredensial acak
 * (tampil SEKALI di log — di Vercel: menu Logs proyek).
 */
export async function loadAdmin(paksa = false) {
  if (admin && !paksa && Date.now() - adminMuatPada < CACHE_MS) return admin;
  const rows = await q("SELECT nilai FROM meta WHERE kunci = 'admin'");
  if (rows[0]?.nilai) {
    admin = JSON.parse(rows[0].nilai);
    adminMuatPada = Date.now();
    return admin;
  }
  // Bootstrap pertama: kredensial acak — HANYA tampil sekali di log server.
  const username = "penjaga-" + crypto.randomBytes(3).toString("hex");
  const password = crypto.randomBytes(12).toString("base64url");
  admin = {
    v: 1,
    path: "/pusat-kendali",
    user: hashPasswordStrong(username.toLowerCase()),
    pass: hashPasswordStrong(password),
    createdAt: new Date().toISOString(),
  };
  await simpan();
  adminMuatPada = Date.now();
  console.log("=".repeat(64));
  console.log("[keamanan] Akun pemeliharaan dibuat (CATAT — tampil sekali):");
  console.log(`[keamanan]   Panel    : ${admin.path}`);
  console.log(`[keamanan]   Username : ${username}`);
  console.log(`[keamanan]   Password : ${password}`);
  console.log("=".repeat(64));
  return admin;
}

/** Path panel saat ini (mis. "/pusat-kendali") — dari cache terakhir. */
export function panelPath() {
  return admin?.path || "/pusat-kendali";
}

/** Setel ulang kredensial/path (dipakai panel & tools/superuser.mjs). */
export async function setCredentials({ username, password, panel }) {
  await loadAdmin(true);
  if (username) admin.user = hashPasswordStrong(String(username).trim().toLowerCase());
  if (password) admin.pass = hashPasswordStrong(String(password));
  if (panel) {
    let p = String(panel).trim();
    if (!p.startsWith("/")) p = "/" + p;
    if (p.startsWith("/api") || p === "/" || p === "/docs") {
      throw new Error("Path panel tidak boleh /, /api..., atau /docs");
    }
    admin.path = p.replace(/\/+$/, "");
  }
  admin.updatedAt = new Date().toISOString();
  await simpan();
}

/* ---------------- rate limit (per instance — pertahanan tambahan) ---------------- */

function ipKey(req) {
  const sock = String(req.socket?.remoteAddress || "?");
  // Header IP dipercaya bila datang dari proxy tepercaya (Vercel/cloudflared
  // lokal); selain itu pakai alamat socket asli.
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

function locked(req) {
  const now = Date.now();
  if (globalFails.n >= MAX_FAILS_GLOBAL && now < globalFails.resetAt) return true;
  const f = fails.get(ipKey(req));
  return !!f && f.n >= MAX_FAILS_PER_IP && now < f.until;
}

function noteFail(req) {
  const now = Date.now();
  const key = ipKey(req);
  const f = fails.get(key) || { n: 0, until: 0 };
  f.n += 1;
  f.until = now + LOCK_MS;
  fails.set(key, f);
  if (now > globalFails.resetAt) globalFails = { n: 0, resetAt: now + LOCK_MS };
  globalFails.n += 1;
}

function noteOk(req) {
  fails.delete(ipKey(req));
}

/* ---------------- sesi (di database — tahan restart/serverless) ---------------- */

const uaHash = (req) =>
  crypto.createHash("sha256").update(String(req.headers["user-agent"] || "")).digest("hex");

/**
 * Coba login. Selalu menghitung KEDUA hash (username & password) supaya
 * durasi respons tidak membocorkan mana yang salah (anti user-enumeration).
 */
export async function login(req, username, password) {
  if (locked(req)) {
    audit(req, "login.terkunci", {});
    return { ok: false, error: "Terlalu banyak percobaan. Coba lagi nanti." };
  }
  const a = await loadAdmin(true);
  const okUser = verifyPasswordStrong(String(username || "").trim().toLowerCase(), a.user);
  const okPass = verifyPasswordStrong(String(password || ""), a.pass);
  // jeda acak kecil — samarkan sisa perbedaan timing
  await new Promise((r) => setTimeout(r, 150 + crypto.randomInt(200)));
  if (!okUser || !okPass) {
    noteFail(req);
    audit(req, "login.gagal", {});
    return { ok: false, error: "Akses ditolak" };
  }
  noteOk(req);
  const token = newToken(48);
  await q(
    "INSERT INTO admin_sessions (token, exp, ua_hash) VALUES ($1, $2, $3)",
    [token, Date.now() + SESSION_TTL_MS, uaHash(req)]
  );
  // bersihkan sesi panel kedaluwarsa sekalian
  q("DELETE FROM admin_sessions WHERE exp < $1", [Date.now()]).catch(() => {});
  audit(req, "login.berhasil", {});
  return { ok: true, token };
}

/** Validasi token sesi panel (sliding TTL + terikat User-Agent).
 *  Token dibaca dari header Authorization, atau query ?t= (untuk <img> foto). */
export async function checkSession(req) {
  const h = String(req.headers.authorization || "");
  const bearer = h.startsWith("Bearer ") ? h.slice(7).trim() : "";
  const token = bearer || String(req.query?.t || "");
  if (!token) return null;
  const rows = await q("SELECT * FROM admin_sessions WHERE token = $1", [token]);
  const s = rows[0];
  if (!s) return null;
  if (Date.now() > Number(s.exp) || s.ua_hash !== uaHash(req)) {
    await q("DELETE FROM admin_sessions WHERE token = $1", [token]);
    return null;
  }
  // perpanjang selama aktif
  q("UPDATE admin_sessions SET exp = $1 WHERE token = $2", [
    Date.now() + SESSION_TTL_MS, token,
  ]).catch(() => {});
  return token;
}

export async function destroySession(token) {
  await q("DELETE FROM admin_sessions WHERE token = $1", [String(token || "")]);
}

/* ---------------- audit ---------------- */

const AUDIT_MAX_ROWS = 10000;

/** Catat aksi ke tabel audit (JSON; tidak pernah berisi password). */
export function audit(req, aksi, detail = {}) {
  q(
    "INSERT INTO audit (ts, aksi, ip, detail) VALUES ($1, $2, $3, $4)",
    [new Date().toISOString(), aksi, ipKey(req), JSON.stringify(detail)]
  )
    .then(() => {
      if (Math.random() < 0.02) {
        q(
          `DELETE FROM audit WHERE id <= (SELECT COALESCE(MAX(id),0) - $1 FROM audit)`,
          [AUDIT_MAX_ROWS]
        ).catch(() => {});
      }
    })
    .catch(() => {});
  siarkan("audit"); // beri tahu panel yang sedang terbuka
}

/** Baca N baris audit terakhir (terbaru dulu). */
export async function readAudit(n = 40) {
  try {
    const rows = await q(
      "SELECT ts, aksi, ip, detail FROM audit ORDER BY id DESC LIMIT $1", [n]
    );
    return rows.map((r) => ({ ts: r.ts, aksi: r.aksi, ip: r.ip, ...objek(r.detail) }));
  } catch {
    return [];
  }
}

