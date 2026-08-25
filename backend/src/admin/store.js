/**
 * Penyimpanan & keamanan akun super user (admin).
 *
 * PRINSIP KEAMANAN (versi cloud):
 * - Kredensial disimpan di tabel `meta` (Postgres) sebagai HASH scrypt
 *   memory-hard — siapa pun yang membaca database tidak bisa tahu
 *   username apalagi password-nya.
 * - Sesi panel disimpan di tabel `admin_sessions` (umur pendek, terikat
 *   User-Agent) — di serverless memori tidak bertahan antar-request,
 *   jadi sesi harus di database.
 * - Login dibatasi (rate limit per-IP + global, disimpan di Postgres —
 *   tabel admin_login_fails — jadi tetap berlaku sekalipun Vercel melayani
 *   permintaan lewat banyak instance serverless berbeda).
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
  console.log("[keamanan] Akun admin dibuat (CATAT — tampil sekali):");
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

/* ---------------- rate limit (PERSISTEN DI DATABASE) ----------------
 * PENTING: sebelumnya penghitung gagal-login disimpan di Map biasa (memori
 * proses). Di Vercel, permintaan bersamaan bisa dilayani oleh BEBERAPA
 * instance serverless berbeda yang masing-masing punya memori sendiri —
 * penghitung tidak sinkron antar-instance, sehingga lockout 5x-gagal bisa
 * dilewati dengan mengirim percobaan brute-force secara paralel/berulang
 * (memicu cold start baru = penghitung balik ke nol). Disimpan di Postgres
 * (tabel admin_login_fails) supaya SATU sumber kebenaran dipakai semua
 * instance, tahan restart maupun cold start. */

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

const GLOBAL_KEY = "__global__";

async function locked(req) {
  const now = Date.now();
  const key = ipKey(req);
  const rows = await q(
    "SELECT ip_key, n, locked_until FROM admin_login_fails WHERE ip_key = $1 OR ip_key = $2",
    [key, GLOBAL_KEY]
  );
  const glob = rows.find((r) => r.ip_key === GLOBAL_KEY);
  if (glob && Number(glob.n) >= MAX_FAILS_GLOBAL && now < Number(glob.locked_until)) return true;
  const per = rows.find((r) => r.ip_key === key);
  return !!per && Number(per.n) >= MAX_FAILS_PER_IP && now < Number(per.locked_until);
}

async function noteFail(req) {
  const now = Date.now();
  const key = ipKey(req);
  // Per-IP: jendela BERGULIR — setiap gagal memperbarui locked_until (n hanya
  // nol lagi lewat login sukses, lihat noteOk).
  await q(
    `INSERT INTO admin_login_fails (ip_key, n, locked_until) VALUES ($1, 1, $2)
     ON CONFLICT (ip_key) DO UPDATE SET n = admin_login_fails.n + 1, locked_until = $2`,
    [key, now + LOCK_MS]
  ).catch(() => {});
  // Global (lintas-IP): jendela TETAP — nol ulang hanya setelah jendela lewat.
  await q(
    "UPDATE admin_login_fails SET n = 0 WHERE ip_key = $1 AND locked_until <= $2",
    [GLOBAL_KEY, now]
  ).catch(() => {});
  await q(
    `INSERT INTO admin_login_fails (ip_key, n, locked_until) VALUES ($1, 1, $2)
     ON CONFLICT (ip_key) DO UPDATE SET
       n = admin_login_fails.n + 1,
       locked_until = CASE WHEN admin_login_fails.locked_until <= $3 THEN $2 ELSE admin_login_fails.locked_until END`,
    [GLOBAL_KEY, now + LOCK_MS, now]
  ).catch(() => {});
  // Bersihkan baris lawas sesekali (IP yang sudah lama tidak mencoba lagi)
  if (Math.random() < 0.05) {
    q("DELETE FROM admin_login_fails WHERE ip_key <> $1 AND locked_until < $2",
      [GLOBAL_KEY, now - 24 * 60 * 60 * 1000]).catch(() => {});
  }
}

async function noteOk(req) {
  await q("DELETE FROM admin_login_fails WHERE ip_key = $1", [ipKey(req)]).catch(() => {});
}

/* ---------------- sesi (di database — tahan restart/serverless) ---------------- */

const uaHash = (req) =>
  crypto.createHash("sha256").update(String(req.headers["user-agent"] || "")).digest("hex");

/**
 * Coba login. Selalu menghitung KEDUA hash (username & password) supaya
 * durasi respons tidak membocorkan mana yang salah (anti user-enumeration).
 */
export async function login(req, username, password) {
  if (await locked(req)) {
    audit(req, "login.terkunci", {});
    return { ok: false, error: "Terlalu banyak percobaan. Coba lagi nanti." };
  }
  const a = await loadAdmin(true);
  const okUser = verifyPasswordStrong(String(username || "").trim().toLowerCase(), a.user);
  const okPass = verifyPasswordStrong(String(password || ""), a.pass);
  // jeda acak kecil — samarkan sisa perbedaan timing
  await new Promise((r) => setTimeout(r, 150 + crypto.randomInt(200)));
  if (!okUser || !okPass) {
    await noteFail(req);
    audit(req, "login.gagal", {});
    return { ok: false, error: "Akses ditolak" };
  }
  await noteOk(req);
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

/**
 * Baca N baris audit terakhir (terbaru dulu).
 * @param {number} n jumlah baris (dibatasi 1..1000)
 * @param {string} [filter] awalan nama aksi, mis. "user." atau "login."
 *        — kosong berarti semua aksi.
 */
export async function readAudit(n = 40, filter = "") {
  const batas = Math.min(Math.max(Number(n) || 40, 1), 1000);
  // Hanya awalan yang aman (huruf, angka, titik, strip) — tidak ada wildcard
  // LIKE yang bisa diselundupkan lewat query string.
  const awalan = String(filter || "").trim().replace(/[^a-z0-9._-]/gi, "").slice(0, 40);
  try {
    const rows = awalan
      ? await q(
          "SELECT ts, aksi, ip, detail FROM audit WHERE aksi LIKE $2 ORDER BY id DESC LIMIT $1",
          [batas, awalan + "%"]
        )
      : await q(
          "SELECT ts, aksi, ip, detail FROM audit ORDER BY id DESC LIMIT $1", [batas]
        );
    return rows.map((r) => ({ ts: r.ts, aksi: r.aksi, ip: r.ip, ...objek(r.detail) }));
  } catch {
    return [];
  }
}

