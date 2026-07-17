import { Router } from "express";
import * as store from "../storage.js";
import { verifyPassword } from "../passwords.js";
import { authRequired, lupakanSesi } from "../auth.js";
import { catatAktivitas, bacaAktivitas } from "../aktivitas.js";
import { rateLimit } from "../ratelimit.js";

const router = Router();

const publicUser = (u) => ({ id: u.id, username: u.username, role: u.role || "tim" });

// Anti brute-force: batasi percobaan login/daftar per IP
const loginLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 menit
  max: 20,
  pesan: "Terlalu banyak percobaan login — tunggu sebentar",
});
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 jam
  max: 10,
  pesan: "Terlalu banyak pendaftaran dari jaringanmu — coba lagi nanti",
});

/**
 * @openapi
 * /api/auth/register:
 *   post:
 *     tags: [Auth]
 *     summary: Daftar akun baru (langsung login, dapat token)
 *     description: >
 *       Daftar sebagai TIM (default) atau FASILITATOR — centang
 *       `sebagai_fasilitator` dan sertakan `kode_fasilitator` yang
 *       ditetapkan pusat kendali.
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
 *               sebagai_fasilitator: { type: boolean, example: false }
 *               kode_fasilitator: { type: string, example: "kode dari admin" }
 *     responses:
 *       201: { description: Akun dibuat — token & profil dikembalikan }
 *       400: { description: Input tidak valid }
 *       401: { description: Kode fasilitator salah }
 *       403: { description: Pendaftaran fasilitator belum dibuka }
 *       409: { description: Username sudah dipakai }
 */
router.post("/register", registerLimiter, async (req, res, next) => {
  try {
    const username = String(req.body?.username || "").trim();
    const password = String(req.body?.password || "");
    const sebagaiFasilitator = !!req.body?.sebagai_fasilitator;
    if (username.length < 3 || username.length > 40) {
      return res.status(400).json({ error: "Username minimal 3 karakter (maks. 40)" });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: "Password minimal 6 karakter" });
    }
    if (sebagaiFasilitator) {
      const hash = await store.getMeta("kodeFasilitator");
      if (!hash) {
        return res.status(403).json({
          error: "Pendaftaran fasilitator belum dibuka — hubungi admin",
        });
      }
      const kode = String(req.body?.kode_fasilitator || "");
      if (!kode || !verifyPassword(kode, hash)) {
        return res.status(401).json({ error: "Kode fasilitator salah" });
      }
    }
    if (await store.findUserByUsername(username)) {
      return res.status(409).json({ error: "Username sudah dipakai — silakan pilih yang lain" });
    }
    const user = await store.createUser(
      username, password, sebagaiFasilitator ? "fasilitator" : "tim"
    );
    const token = await store.createSession(user.id);
    catatAktivitas(user.id, "akun.daftar", sebagaiFasilitator ? { role: "fasilitator" } : {});
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
router.post("/login", loginLimiter, async (req, res, next) => {
  try {
    const user = await store.findUserByUsername(req.body?.username);
    if (!user || !verifyPassword(String(req.body?.password || ""), user.passHash)) {
      return res.status(401).json({ error: "Username atau password salah" });
    }
    const token = await store.createSession(user.id);
    catatAktivitas(user.id, "akun.masuk", {});
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
    if (req.user.role === "fasilitator") {
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
router.put("/username", authRequired, async (req, res, next) => {
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
 *               password_baru: { type: string, example: "minimal 6 karakter" }
 *     responses:
 *       200: { description: Password diperbarui — sesi lain dicabut }
 *       400: { description: Input tidak valid }
 *       401: { description: Password lama salah }
 */
router.put("/password", authRequired, async (req, res, next) => {
  try {
    const lama = String(req.body?.password_lama || "");
    const baru = String(req.body?.password_baru || "");
    if (baru.length < 6) {
      return res.status(400).json({ error: "Password baru minimal 6 karakter" });
    }
    const user = await store.getUserById(req.userId);
    if (!user || !verifyPassword(lama, user.passHash)) {
      return res.status(401).json({ error: "Password lama salah — perubahan dibatalkan" });
    }
    await store.updateUserPassword(user.id, baru);
    // Amankan akun: semua sesi lain dicabut, sesi ini tetap aktif
    const dicabut = await store.revokeUserSessions(user.id, req.token);
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

export default router;

