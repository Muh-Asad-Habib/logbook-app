/**
 * Rute panel pemeliharaan (super user).
 *
 * - TIDAK terdaftar di Swagger (folder ini tidak dipindai swagger-jsdoc).
 * - Semua respons: Cache-Control no-store + X-Robots-Tag noindex.
 * - Wajib login (kredensial hash scrypt kuat) — lihat admin/store.js.
 * - Aksi sensitif dicatat ke tabel audit (Postgres).
 */
import { Router } from "express";
import fs from "node:fs";
import { q, angka } from "../db.js";
import * as store from "../storage.js";
import * as adminStore from "./store.js";
import { verifyPasswordStrong } from "../passwords.js";
import { removeFiles, safePath, contentType, signedUrl, pakaiCloud } from "../files.js";
import { PANEL_HTML } from "./panel.js";
import { bus } from "../bus.js";
import { bacaAktivitas } from "../aktivitas.js";

const router = Router();

// Header keamanan untuk semua respons panel
router.use((_req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Frame-Options", "DENY");
  next();
});

/* ---------- halaman & login (tanpa sesi) ---------- */

router.get("/", (_req, res) => {
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; img-src 'self' https:"
  );
  res.type("html").send(PANEL_HTML);
});

router.post("/auth", async (req, res, next) => {
  try {
    const r = await adminStore.login(req, req.body?.u, req.body?.p);
    if (!r.ok) return res.status(401).json({ error: r.error });
    res.json({ token: r.token });
  } catch (err) {
    next(err);
  }
});

/* ---------- penjaga sesi ---------- */

router.use(async (req, res, next) => {
  try {
    const token = await adminStore.checkSession(req);
    if (!token) return res.status(401).json({ error: "Harus login" });
    req.adminToken = token;
    next();
  } catch (err) {
    next(err);
  }
});

router.post("/keluar", async (req, res, next) => {
  try {
    await adminStore.destroySession(req.adminToken);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

/* ---------- data ---------- */

router.get("/data/ringkas", async (_req, res, next) => {
  try {
    const [u, k, b, s] = await Promise.all([
      q("SELECT COUNT(*) AS n FROM users"),
      q("SELECT COUNT(*) AS n FROM kegiatan"),
      q("SELECT COUNT(*) AS n FROM keuangan"),
      q("SELECT COUNT(*) AS n FROM sessions"),
    ]);
    res.json({
      users: angka(u[0]?.n),
      kegiatan: angka(k[0]?.n),
      keuangan: angka(b[0]?.n),
      sesi: angka(s[0]?.n),
    });
  } catch (err) {
    next(err);
  }
});

router.get("/data/pengguna", async (_req, res, next) => {
  try {
    res.json({ users: await store.listUsersWithStats() });
  } catch (err) {
    next(err);
  }
});

router.get("/data/pengguna/:id", async (req, res, next) => {
  try {
    const detail = await store.getUserDetail(req.params.id);
    if (!detail) return res.status(404).json({ error: "Akun tidak ditemukan" });
    // ?senyap=1 dipakai pembaruan berkala — tidak dicatat agar tidak berulang
    if (!req.query.senyap) adminStore.audit(req, "user.lihat", { target: req.params.id });
    res.json(detail);
  } catch (err) {
    next(err);
  }
});

/** Jejak gabungan per pengguna: aksi si pengguna sendiri + aksi panel terhadapnya. */
router.get("/data/pengguna/:id/aktivitas", async (req, res, next) => {
  try {
    const user = await store.getUserById(req.params.id);
    if (!user) return res.status(404).json({ error: "Akun tidak ditemukan" });
    const milikSendiri = (await bacaAktivitas(user.id, 150)).map((r) => ({ ...r, sumber: "pengguna" }));
    const dariPanel = (await adminStore.readAudit(400))
      .filter((r) => r.target === user.id)
      .map((r) => ({ ...r, sumber: "panel" }));
    const rows = [...milikSendiri, ...dariPanel]
      .sort((a, b) => String(b.ts || "").localeCompare(String(a.ts || "")))
      .slice(0, 150);
    res.json({ rows });
  } catch (err) {
    next(err);
  }
});

// Gambar (foto kegiatan / bukti belanja) — hanya untuk sesi panel yang sah.
// Token lewat query ?t= karena <img> tidak bisa mengirim header Authorization.
router.get("/berkas/:key", (req, res) => {
  try {
    if (pakaiCloud()) {
      const key = req.params.key;
      if (key.includes("..") || key.includes("/")) {
        return res.status(400).json({ error: "Key tidak valid" });
      }
      return res.redirect(302, signedUrl(key));
    }
    const p = safePath(req.params.key);
    if (!fs.existsSync(p)) return res.status(404).json({ error: "Berkas tidak ada" });
    res.setHeader("Content-Type", contentType(req.params.key));
    fs.createReadStream(p).pipe(res);
  } catch {
    res.status(400).json({ error: "Key tidak valid" });
  }
});

router.get("/data/audit", async (_req, res, next) => {
  try {
    res.json({ rows: await adminStore.readAudit(60) });
  } catch (err) {
    next(err);
  }
});

/* ---------- siaran langsung (SSE) ----------
   Hanya untuk mode lokal (server menyala terus). Di serverless (Vercel)
   koneksi panjang tidak didukung — panel otomatis beralih ke polling
   berkala (lihat panel.js). */
router.get("/events", (req, res) => {
  if (process.env.VERCEL) {
    // beri tahu panel supaya memakai polling
    return res.status(204).end();
  }
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  // no-transform → middleware compression melewati respons ini (wajib utk SSE)
  res.setHeader("Cache-Control", "no-cache, no-store, no-transform");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();
  res.write("retry: 4000\n\n");
  res.write("event: halo\ndata: tersambung\n\n");

  const kirim = (jenis) => {
    try { res.write(`data: ${jenis}\n\n`); } catch {}
  };
  bus.on("live", kirim);
  const ping = setInterval(() => {
    try { res.write(": ping\n\n"); } catch {}
  }, 25000);

  req.on("close", () => {
    clearInterval(ping);
    bus.off("live", kirim);
  });
});

/* ---------- aksi pada akun pengguna ---------- */

router.put("/data/pengguna/:id/username", async (req, res, next) => {
  try {
    const usernameBaru = String(req.body?.username || "").trim();
    if (usernameBaru.length < 3 || usernameBaru.length > 40) {
      return res.status(400).json({ error: "Username minimal 3 karakter (maks. 40)" });
    }
    const user = await store.getUserById(req.params.id);
    if (!user) return res.status(404).json({ error: "Akun tidak ditemukan" });
    const existing = await store.findUserByUsername(usernameBaru);
    if (existing && existing.id !== user.id) {
      return res.status(409).json({ error: "Username sudah dipakai akun lain" });
    }
    const lama = user.username;
    await store.updateUsername(user.id, usernameBaru);
    adminStore.audit(req, "user.username", { target: user.id, dari: lama, jadi: usernameBaru });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.put("/data/pengguna/:id/password", async (req, res, next) => {
  try {
    const baru = String(req.body?.password || "");
    if (baru.length < 6) return res.status(400).json({ error: "Password minimal 6 karakter" });
    const user = await store.getUserById(req.params.id);
    if (!user) return res.status(404).json({ error: "Akun tidak ditemukan" });
    await store.updateUserPassword(user.id, baru); // hanya hash yang disimpan
    const dicabut = await store.revokeUserSessions(user.id); // paksa login ulang di semua perangkat
    adminStore.audit(req, "user.password.reset", { target: user.id, sesiDicabut: dicabut });
    res.json({ ok: true, sesiDicabut: dicabut });
  } catch (err) {
    next(err);
  }
});

router.post("/data/pengguna/:id/keluarkan", async (req, res, next) => {
  try {
    const user = await store.getUserById(req.params.id);
    if (!user) return res.status(404).json({ error: "Akun tidak ditemukan" });
    const dicabut = await store.revokeUserSessions(user.id);
    adminStore.audit(req, "user.sesi.cabut", { target: user.id, jumlah: dicabut });
    res.json({ ok: true, dicabut });
  } catch (err) {
    next(err);
  }
});

router.delete("/data/pengguna/:id", async (req, res, next) => {
  try {
    const hasil = await store.deleteUser(req.params.id);
    if (!hasil) return res.status(404).json({ error: "Akun tidak ditemukan" });
    await removeFiles(hasil.fileKeys);
    adminStore.audit(req, "user.hapus", {
      target: hasil.user.id,
      username: hasil.user.username,
      berkasDihapus: hasil.fileKeys.length,
    });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

/* ---------- kredensial panel sendiri ---------- */

router.put("/akun", async (req, res, next) => {
  try {
    const { username, password, password_lama } = req.body || {};
    const a = await adminStore.loadAdmin(true);
    if (!verifyPasswordStrong(String(password_lama || ""), a.pass)) {
      adminStore.audit(req, "panel.akun.gagal", {});
      return res.status(401).json({ error: "Password saat ini salah" });
    }
    if (!String(username || "").trim() && !String(password || "")) {
      return res.status(400).json({ error: "Isi username baru dan/atau password baru" });
    }
    if (username && String(username).trim().length < 4) {
      return res.status(400).json({ error: "Username baru minimal 4 karakter" });
    }
    if (password && String(password).length < 10) {
      return res.status(400).json({ error: "Password baru minimal 10 karakter" });
    }
    await adminStore.setCredentials({
      username: String(username || "").trim() || null,
      password: String(password || "") || null,
    });
    adminStore.audit(req, "panel.akun.ubah", {
      username: !!String(username || "").trim(),
      password: !!String(password || ""),
    });
    res.json({ ok: true, catatan: "Kredensial baru berlaku untuk login berikutnya." });
  } catch (err) {
    next(err);
  }
});

export default router;

