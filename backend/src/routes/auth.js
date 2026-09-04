import { Router } from "express";
import * as store from "../storage.js";
import { verifyPassword } from "../passwords.js";
import { authRequired, lupakanSesi, lupakanSesiHash, lupakanSesiUser } from "../auth.js";
import { catatAktivitas, bacaAktivitas } from "../aktivitas.js";
import { rateLimit, resetLaju } from "../ratelimit.js";
import { pasangCookieSesi, hapusCookieSesi } from "../cookies.js";
import { jejakDari } from "../perangkat.js";

const router = Router();

const publicUser = (u) => ({ id: u.id, username: u.username, role: u.role || "tim" });

// Anti brute-force: batasi percobaan login/daftar per IP.
// Penghitung disimpan di database (lihat ratelimit.js) supaya lockout tidak
// bisa dilewati dengan permintaan paralel antar-instance serverless.
const NAMA_LIMIT_LOGIN = "auth:login";
const loginLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 menit
  max: 8,                   // diperketat dari 20 — 8 percobaan sudah lebih dari cukup
  nama: NAMA_LIMIT_LOGIN,
  pesan: "Terlalu banyak percobaan login — tunggu sebentar",
});
// Lapis kedua: per USERNAME yang dicoba. Limiter per-IP saja tidak menahan
// serangan terdistribusi (banyak IP → satu akun). Kunci memakai username
// huruf kecil supaya "Tim Alpha" dan "tim alpha" dihitung sama.
const NAMA_LIMIT_LOGIN_USER = "auth:login:user";
const usernameDicoba = (req) => String(req.body?.username || "").trim().toLowerCase().slice(0, 80);
const loginUserLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 menit
  max: 10,
  nama: NAMA_LIMIT_LOGIN_USER,
  kunciDari: usernameDicoba,
  pesan: "Terlalu banyak percobaan masuk ke akun ini — tunggu sebentar",
});
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 jam
  max: 5,                   // diperketat dari 10 — meredam pemetaan username massal
  nama: "auth:register",
  pesan: "Terlalu banyak pendaftaran dari jaringanmu — coba lagi nanti",
});
// Ganti username/password memerlukan password saat ini — tanpa pembatas,
// sesi yang dibajak bisa dipakai menebak password lama berulang kali.
const NAMA_LIMIT_KREDENSIAL = "auth:ubah-kredensial";
const kredensialLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  nama: NAMA_LIMIT_KREDENSIAL,
  kunciDari: (req) => String(req.userId || ""),
  pesan: "Terlalu banyak percobaan mengubah akun — tunggu sebentar",
});

/**
 * Pendaftaran akun TIM dapat ditutup admin dari Pusat Kendali
 * (meta `pendaftaranTimBuka` = "0"). Default (belum pernah diset) = terbuka.
 * Pendaftaran fasilitator/dosen tidak terpengaruh — mereka sudah dipagari kode.
 */
export const META_PENDAFTARAN_TIM = "pendaftaranTimBuka";
export async function pendaftaranTimTerbuka() {
  const v = await store.getMeta(META_PENDAFTARAN_TIM);
  return v !== "0";
}

/**
 * @openapi
 * /api/auth/pendaftaran:
 *   get:
 *     tags: [Auth]
 *     summary: Status pendaftaran (tanpa login) — dipakai halaman Daftar
 *     responses:
 *       200: { description: "{ tim: boolean }" }
 */
router.get("/pendaftaran", async (_req, res, next) => {
  try {
    res.setHeader("Cache-Control", "no-store");
    res.json({ tim: await pendaftaranTimTerbuka() });
  } catch (err) {
    next(err);
  }
});


/**
 * @openapi
 * /api/auth/register:
 *   post:
 *     tags: [Auth]
 *     summary: Daftar akun baru (langsung login, dapat token)
 *     description: >
 *       Daftar sebagai TIM (default), FASILITATOR, atau DOSEN PENDAMPING.
 *       Untuk peran pendamping sertakan `peran` + kode yang ditetapkan admin
 *       (`kode_fasilitator` / `kode_dosen`). Field lama
 *       `sebagai_fasilitator` tetap didukung.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [username, password]
 *             properties:
 *               username: { type: string, example: "timku" }
 *               password: { type: string, example: "rahasia123", minLength: 8 }
 *               peran: { type: string, enum: [tim, fasilitator, dosen], example: "dosen" }
 *               sebagai_fasilitator: { type: boolean, example: false }
 *               kode_fasilitator: { type: string, example: "kode dari admin" }
 *               kode_dosen: { type: string, example: "kode dari admin" }
 *     responses:
 *       201: { description: Akun dibuat — token & profil dikembalikan }
 *       400: { description: Input tidak valid }
 *       401: { description: Kode pendaftaran salah }
 *       403: { description: Pendaftaran peran tersebut belum dibuka }
 *       409: { description: Username sudah dipakai }
 */
// Konfigurasi tiap peran pendamping: kunci meta, field kode, & label pesan.
const PENDAFTARAN = {
  fasilitator: {
    metaKode: "kodeFasilitator",
    fieldKode: "kode_fasilitator",
    label: "fasilitator",
  },
  dosen: {
    metaKode: "kodeDosen",
    fieldKode: "kode_dosen",
    label: "dosen pendamping",
  },
};

router.post("/register", registerLimiter, async (req, res, next) => {
  try {
    const username = String(req.body?.username || "").trim();
    const password = String(req.body?.password || "");
    // `peran` (baru) diutamakan; `sebagai_fasilitator` (lama) tetap didukung
    let peran = String(req.body?.peran || "").trim().toLowerCase();
    if (!peran) peran = req.body?.sebagai_fasilitator ? "fasilitator" : "tim";
    if (!["tim", "fasilitator", "dosen"].includes(peran)) {
      return res.status(400).json({ error: "Peran tidak dikenal" });
    }
    if (username.length < 3 || username.length > 40) {
      return res.status(400).json({ error: "Username minimal 3 karakter (maks. 40)" });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: "Password minimal 8 karakter" });
    }
    if (peran === "tim" && !(await pendaftaranTimTerbuka())) {
      return res.status(403).json({
        error: "Pendaftaran akun tim sedang ditutup — hubungi admin untuk dibuatkan akun",
      });
    }
    if (peran !== "tim") {
      const cfg = PENDAFTARAN[peran];
      const hash = await store.getMeta(cfg.metaKode);
      if (!hash) {
        return res.status(403).json({
          error: `Pendaftaran ${cfg.label} belum dibuka — hubungi admin`,
        });
      }
      const kode = String(req.body?.[cfg.fieldKode] || req.body?.kode || "");
      if (!kode || !verifyPassword(kode, hash)) {
        return res.status(401).json({ error: `Kode ${cfg.label} salah` });
      }
    }
    if (await store.findUserByUsername(username)) {
      return res.status(409).json({ error: "Username sudah dipakai — silakan pilih yang lain" });
    }
    const user = await store.createUser(username, password, peran);
    const token = await store.createSession(user.id, jejakDari(req));
    catatAktivitas(user.id, "akun.daftar", peran === "tim" ? {} : { role: peran });
    // Cookie HttpOnly untuk <img>/unduhan — token tidak pernah masuk URL
    pasangCookieSesi(req, res, token);
    res.status(201).json({ token, user: publicUser(user) });

  } catch (err) {
    next(err);
  }
});

/**
 * @openapi
 * /api/auth/login:
 *   post:
 *     tags: [Auth]
 *     summary: Login dengan username & password (dapat token)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [username, password]
 *             properties:
 *               username: { type: string, example: "timku" }
 *               password: { type: string, example: "rahasia123" }
 *     responses:
 *       200: { description: Berhasil — token & profil dikembalikan }
 *       401: { description: Username atau password salah }
 */
/**
 * Hash "umpan" untuk akun yang tidak ada. Saat username salah, verifikasi
 * tetap dijalankan terhadap hash ini supaya waktu balasan sama saja dengan
 * username yang benar tapi password salah — penyerang tidak bisa menebak
 * username mana yang terdaftar dari selisih waktu respons (user enumeration).
 */
const HASH_UMPAN =
  "s2:16384:8:1:" + "00".repeat(32) + ":" + "00".repeat(64);

router.post("/login", loginLimiter, loginUserLimiter, async (req, res, next) => {
  try {
    const user = await store.findUserByUsername(req.body?.username);
    const password = String(req.body?.password || "");
    // Selalu jalankan verifikasi — walau akun tidak ada — agar durasi respons
    // identik dan tidak membocorkan username mana yang terdaftar.
    const hash = user ? user.passHash : HASH_UMPAN;
    const cocok = verifyPassword(password, hash);
    if (!user || !cocok) {
      return res.status(401).json({ error: "Username atau password salah" });
    }

    const token = await store.createSession(user.id, jejakDari(req));
    resetLaju(req, NAMA_LIMIT_LOGIN); // login berhasil → penghitung dinolkan
    resetLaju(req, NAMA_LIMIT_LOGIN_USER, usernameDicoba(req));
    catatAktivitas(user.id, "akun.masuk", {});
    pasangCookieSesi(req, res, token);
    res.json({ token, user: publicUser(user) });
  } catch (err) {
    next(err);
  }
});


/**
 * @openapi
 * /api/auth/me:
 *   get:
 *     tags: [Auth]
 *     summary: Profil pengguna yang sedang login
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Profil pengguna }
 *       401: { description: Belum login }
 */
router.get("/me", authRequired, async (req, res, next) => {
  try {
    const hasil = { user: req.user };
    // Fasilitator & dosen pendamping sama-sama memakai daftar tim ter-assign
    if (req.user.role && req.user.role !== "tim") {
      hasil.tim = await store.listTimUntukFasilitator(req.user.id);
    }
    res.json(hasil);
  } catch (err) {
    next(err);
  }
});

/**
 * @openapi
 * /api/auth/logout:
 *   post:
 *     tags: [Auth]
 *     summary: Logout (hapus sesi/token aktif)
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Sesi dihapus }
 */
router.post("/logout", authRequired, async (req, res, next) => {
  try {
    await store.deleteSession(req.token);
    lupakanSesi(req.token); // cache sesi ikut dibuang — token langsung tidak sah
    hapusCookieSesi(req, res); // cookie <img>/unduhan ikut dimatikan
    catatAktivitas(req.userId, "akun.keluar", {});
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});


/**
 * @openapi
 * /api/auth/username:
 *   put:
 *     tags: [Auth]
 *     summary: Ganti username akun sendiri (wajib konfirmasi password)
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [username, password]
 *             properties:
 *               username: { type: string, example: "nama-baru" }
 *               password: { type: string, example: "password saat ini" }
 *     responses:
 *       200: { description: Username diperbarui — profil baru dikembalikan }
 *       400: { description: Input tidak valid }
 *       401: { description: Password salah }
 *       409: { description: Username sudah dipakai }
 */
router.put("/username", authRequired, kredensialLimiter, async (req, res, next) => {
  try {
    const usernameBaru = String(req.body?.username || "").trim();
    const password = String(req.body?.password || "");
    if (usernameBaru.length < 3 || usernameBaru.length > 40) {
      return res.status(400).json({ error: "Username minimal 3 karakter (maks. 40)" });
    }
    const user = await store.getUserById(req.userId);
    if (!user || !verifyPassword(password, user.passHash)) {
      return res.status(401).json({ error: "Password salah — perubahan dibatalkan" });
    }
    const existing = await store.findUserByUsername(usernameBaru);
    if (existing && existing.id !== user.id) {
      return res.status(409).json({ error: "Username sudah dipakai — silakan pilih yang lain" });
    }
    const updated = await store.updateUsername(user.id, usernameBaru);
    resetLaju(req, NAMA_LIMIT_KREDENSIAL, user.id); // berhasil → penghitung dinolkan
    catatAktivitas(user.id, "akun.ganti_username", { dari: user.username, jadi: usernameBaru });
    res.json({ user: publicUser(updated) });
  } catch (err) {
    next(err);
  }
});

/**
 * @openapi
 * /api/auth/password:
 *   put:
 *     tags: [Auth]
 *     summary: Ganti password akun sendiri (sesi lain otomatis keluar)
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [password_lama, password_baru]
 *             properties:
 *               password_lama: { type: string }
 *               password_baru: { type: string, example: "minimal 8 karakter", minLength: 8 }
 *     responses:
 *       200: { description: Password diperbarui — sesi lain dicabut }
 *       400: { description: Input tidak valid }
 *       401: { description: Password lama salah }
 */
router.put("/password", authRequired, kredensialLimiter, async (req, res, next) => {
  try {
    const lama = String(req.body?.password_lama || "");
    const baru = String(req.body?.password_baru || "");
    if (baru.length < 8) {
      return res.status(400).json({ error: "Password baru minimal 8 karakter" });
    }
    const user = await store.getUserById(req.userId);
    if (!user || !verifyPassword(lama, user.passHash)) {
      return res.status(401).json({ error: "Password lama salah — perubahan dibatalkan" });
    }
    await store.updateUserPassword(user.id, baru);
    resetLaju(req, NAMA_LIMIT_KREDENSIAL, user.id); // berhasil → penghitung dinolkan
    // Amankan akun: semua sesi lain dicabut, sesi ini tetap aktif
    const dicabut = await store.revokeUserSessions(user.id, req.token);
    lupakanSesiUser(user.id, req.token); // cache instance ini ikut dibersihkan
    catatAktivitas(user.id, "akun.ganti_password", { sesiLainDicabut: dicabut });
    res.json({ ok: true, sesi_lain_dicabut: dicabut });
  } catch (err) {
    next(err);
  }
});

/**
 * @openapi
 * /api/auth/aktivitas:
 *   get:
 *     tags: [Auth]
 *     summary: Riwayat aktivitas akun sendiri (login, tambah/ubah/hapus entri, dsb.)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: n
 *         schema: { type: integer, default: 50, maximum: 200 }
 *     responses:
 *       200: { description: Daftar aktivitas terbaru (terbaru dulu) }
 *       401: { description: Belum login }
 */
router.get("/aktivitas", authRequired, async (req, res, next) => {
  try {
    const n = Math.min(200, Math.max(1, parseInt(req.query.n || "50", 10) || 50));
    res.json(await bacaAktivitas(req.userId, n));
  } catch (err) {
    next(err);
  }
});


/* ---------- Perangkat & sesi aktif ----------
 *
 * Memberi pemilik akun kendali yang selama ini hanya dimiliki admin: melihat
 * di perangkat mana saja ia sedang login dan mengeluarkan yang tidak dikenali
 * — mis. laptop pinjaman yang lupa logout, atau tanda akun sedang dibajak.
 * Semua query dipagari `user_id`, jadi sesi akun lain tidak bisa disentuh.
 */

/**
 * @openapi
 * /api/auth/sesi:
 *   get:
 *     tags: [Auth]
 *     summary: Daftar perangkat/sesi yang sedang aktif di akun sendiri
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: "Daftar sesi (terbaru dipakai lebih dulu)" }
 *       401: { description: Belum login }
 */
router.get("/sesi", authRequired, async (req, res, next) => {
  try {
    res.json(await store.listSessions(req.userId, req.token));
  } catch (err) {
    next(err);
  }
});

/**
 * @openapi
 * /api/auth/sesi/{id}:
 *   delete:
 *     tags: [Auth]
 *     summary: Cabut satu sesi (keluarkan satu perangkat)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: ID publik sesi dari endpoint daftar (bukan token)
 *     responses:
 *       200: { description: Sesi dicabut }
 *       404: { description: Sesi tidak ditemukan }
 */
router.delete("/sesi/:id", authRequired, async (req, res, next) => {
  try {
    const id = String(req.params.id || "");
    const sendiri = id === store.idSesiDariToken(req.token);
    const hash = await store.hapusSesiById(req.userId, id);
    if (!hash) return res.status(404).json({ error: "Sesi tidak ditemukan" });

    lupakanSesiHash(hash); // cache instance ini ikut dibuang
    if (sendiri) {
      // Pengguna mencabut sesi yang sedang ia pakai → sekalian logout bersih.
      lupakanSesi(req.token);
      hapusCookieSesi(req, res);
    }
    catatAktivitas(req.userId, "akun.sesi_cabut", { jumlah: 1 });
    res.json({ ok: true, ini_perangkat: sendiri });
  } catch (err) {
    next(err);
  }
});

/**
 * @openapi
 * /api/auth/sesi/lainnya:
 *   post:
 *     tags: [Auth]
 *     summary: Keluarkan semua perangkat lain (sesi ini tetap aktif)
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Jumlah sesi yang dicabut }
 */
router.post("/sesi/lainnya", authRequired, async (req, res, next) => {
  try {
    const dicabut = await store.revokeUserSessions(req.userId, req.token);
    lupakanSesiUser(req.userId, req.token);
    if (dicabut) catatAktivitas(req.userId, "akun.sesi_cabut", { jumlah: dicabut });
    res.json({ ok: true, dicabut });
  } catch (err) {
    next(err);
  }
});

export default router;

