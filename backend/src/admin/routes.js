/**
 * Rute panel admin (super user).
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
import { verifyPasswordStrong, hashPassword } from "../passwords.js";
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

/* ---------- halaman & login (tanpa sesi) ----------
 *
 * Panel adalah SATU dokumen HTML yang berpindah halaman lewat History API
 * (tanpa reload). Supaya URL rapi tetap bisa dibuka/di-refresh/di-bookmark
 * langsung — mis. /pusat-kendali/sesi — setiap sub-path yang dikenal
 * disajikan dokumen yang sama; skrip di dalamnya membaca path dan langsung
 * membuka halaman yang sesuai. */
const HALAMAN = ["akun", "sesi", "audit", "pengaturan"];

function kirimPanel(_req, res) {
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; img-src 'self' https:"
  );
  res.type("html").send(PANEL_HTML);
}

router.get("/", kirimPanel);
for (const h of HALAMAN) router.get("/" + h, kirimPanel);

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
    const [u, k, b, s, f, l, d, acc, pre] = await Promise.all([
      q("SELECT COUNT(*) AS n FROM users"),
      q("SELECT COUNT(*) AS n FROM kegiatan"),
      q("SELECT COUNT(*) AS n FROM keuangan"),
      q("SELECT COUNT(*) AS n FROM sessions"),
      q("SELECT COUNT(*) AS n FROM users WHERE role = 'fasilitator'"),
      q("SELECT COUNT(*) AS n FROM laporan_docx"),
      q("SELECT COUNT(*) AS n FROM users WHERE role = 'dosen'"),
      q("SELECT COUNT(*) AS n FROM persetujuan WHERE status = 'disetujui'"),
      q("SELECT COUNT(*) AS n FROM presentasi WHERE file_key <> '' OR canva_url <> ''"),
    ]);
    res.json({
      users: angka(u[0]?.n),
      kegiatan: angka(k[0]?.n),
      keuangan: angka(b[0]?.n),
      sesi: angka(s[0]?.n),
      fasilitator: angka(f[0]?.n),
      dosen: angka(d[0]?.n),
      laporan: angka(l[0]?.n),
      acc: angka(acc[0]?.n),
      presentasi: angka(pre[0]?.n),
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

/** Jejak audit — jumlah baris & saringan aksi diatur dari halaman /audit. */
router.get("/data/audit", async (req, res, next) => {
  try {
    const n = Number(req.query.n) || 60;
    res.json({ rows: await adminStore.readAudit(n, String(req.query.aksi || "")) });
  } catch (err) {
    next(err);
  }
});

/* ---------- Perangkat & sesi aktif ----------
 * Berlaku untuk SEMUA peran: tim, fasilitator, dan dosen pendamping.
 * Hanya di sinilah IP PENUH pernah keluar dari server — pemilik akun di
 * halaman Profil tetap melihat versi tersamar (114.120.•.•). */

router.get("/data/sesi", async (_req, res, next) => {
  try {
    res.json({ rows: await store.listSesiAktifSemua(300) });
  } catch (err) {
    next(err);
  }
});

router.get("/data/pengguna/:id/sesi", async (req, res, next) => {
  try {
    res.json({ rows: await store.listSesiAktifUser(req.params.id) });
  } catch (err) {
    next(err);
  }
});

/** Cabut SATU perangkat (sesi) — sesi lain milik akun itu tetap hidup. */
router.delete("/data/sesi/:sid", async (req, res, next) => {
  try {
    const hasil = await store.hapusSesiPanelById(req.params.sid);
    if (!hasil) {
      return res.status(404).json({ error: "Sesi tidak ditemukan (mungkin sudah kedaluwarsa)" });
    }
    adminStore.audit(req, "user.sesi.cabut", { target: hasil.userId, jumlah: 1 });
    res.json({ ok: true });
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

/** Buat akun baru langsung dari panel (tim/fasilitator/dosen — tanpa kode pendaftaran). */
router.post("/data/pengguna", async (req, res, next) => {
  try {
    const username = String(req.body?.username || "").trim();
    const password = String(req.body?.password || "");
    const role = String(req.body?.role || "tim");
    if (username.length < 3 || username.length > 40) {
      return res.status(400).json({ error: "Username minimal 3 karakter (maks. 40)" });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: "Password minimal 8 karakter" });
    }
    if (!store.PERAN_SAH.includes(role)) {
      return res.status(400).json({ error: "Peran tidak dikenal" });
    }
    if (await store.findUserByUsername(username)) {
      return res.status(409).json({ error: "Username sudah dipakai akun lain" });
    }
    const u = await store.createUser(username, password, role);
    adminStore.audit(req, "user.buat", { target: u.id, username: u.username, role: u.role });
    res.status(201).json({ ok: true, id: u.id, username: u.username, role: u.role });
  } catch (err) {
    next(err);
  }
});

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
    if (baru.length < 8) return res.status(400).json({ error: "Password minimal 8 karakter" });
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

/* ---------- fitur pendamping (fasilitator & dosen) ---------- */

const PERAN_PENDAMPING = new Set(["fasilitator", "dosen"]);

// Kode pendaftaran per peran → kunci meta di tabel `meta`.
const KODE_META = {
  fasilitator: { hash: "kodeFasilitator", ts: "kodeFasilitatorUpdatedAt" },
  dosen: { hash: "kodeDosen", ts: "kodeDosenUpdatedAt" },
};

/** Status kode pendaftaran (kode asli tidak pernah bisa dibaca). */
async function statusKode(peran) {
  const m = KODE_META[peran];
  const [hash, updatedAt] = await Promise.all([
    store.getMeta(m.hash), store.getMeta(m.ts),
  ]);
  return { ada: !!hash, updatedAt: updatedAt || "" };
}

/** Set/ganti kode pendaftaran (disimpan sebagai hash scrypt). */
async function simpanKode(req, res, peran) {
  const kode = String(req.body?.kode || "");
  if (kode.length < 6) {
    return res.status(400).json({ error: "Kode minimal 6 karakter" });
  }
  const m = KODE_META[peran];
  await store.setMeta(m.hash, hashPassword(kode));
  await store.setMeta(m.ts, new Date().toISOString());
  adminStore.audit(req, `${peran}.kode.ubah`, {});
  res.json({ ok: true, catatan: "Kode baru langsung berlaku untuk pendaftaran berikutnya" });
}

router.get("/data/kode-fasilitator", async (_req, res, next) => {
  try {
    res.json(await statusKode("fasilitator"));
  } catch (err) {
    next(err);
  }
});

router.put("/data/kode-fasilitator", async (req, res, next) => {
  try {
    await simpanKode(req, res, "fasilitator");
  } catch (err) {
    next(err);
  }
});

/** Status & pengaturan kode pendaftaran DOSEN PENDAMPING. */
router.get("/data/kode-dosen", async (_req, res, next) => {
  try {
    res.json(await statusKode("dosen"));
  } catch (err) {
    next(err);
  }
});

router.put("/data/kode-dosen", async (req, res, next) => {
  try {
    await simpanKode(req, res, "dosen");
  } catch (err) {
    next(err);
  }
});

/** Daftar tim yang diampu seorang pendamping (fasilitator/dosen). */
router.get("/data/fasilitator/:id/tim", async (req, res, next) => {
  try {
    const fas = await store.getUserById(req.params.id);
    if (!fas || !PERAN_PENDAMPING.has(fas.role)) {
      return res.status(404).json({ error: "Akun pendamping tidak ditemukan" });
    }
    res.json({ tim: await store.listTimUntukFasilitator(fas.id), role: fas.role });
  } catch (err) {
    next(err);
  }
});

/** Ganti seluruh assignment tim seorang pendamping (many-to-many). */
router.put("/data/fasilitator/:id/tim", async (req, res, next) => {
  try {
    const fas = await store.getUserById(req.params.id);
    if (!fas || !PERAN_PENDAMPING.has(fas.role)) {
      return res.status(404).json({ error: "Akun pendamping tidak ditemukan" });
    }
    const timIds = Array.isArray(req.body?.tim_ids) ? req.body.tim_ids.map(String) : [];
    // Validasi semua target adalah akun TIM yang ada
    for (const id of timIds) {
      const t = await store.getUserById(id);
      if (!t || PERAN_PENDAMPING.has(t.role)) {
        return res.status(400).json({ error: `Akun tim tidak valid: ${id}` });
      }
    }
    const hasil = await store.gantiTimFasilitator(fas.id, timIds);
    adminStore.audit(req, `${fas.role}.tim.ubah`, {
      target: fas.id,
      username: fas.username,
      ...hasil,
    });
    res.json({ ok: true, ...hasil });
  } catch (err) {
    next(err);
  }
});

/** Daftar pendamping yang mengampu sebuah tim (info di tab Tim). */
router.get("/data/tim/:id/fasilitator", async (req, res, next) => {
  try {
    const tim = await store.getUserById(req.params.id);
    if (!tim) return res.status(404).json({ error: "Akun tidak ditemukan" });
    res.json({ fasilitator: await store.listFasilitatorUntukTim(tim.id) });
  } catch (err) {
    next(err);
  }
});

/** Ganti seluruh pendamping yang mengampu sebuah tim (kebalikan assignment pendamping). */
router.put("/data/tim/:id/fasilitator", async (req, res, next) => {
  try {
    const tim = await store.getUserById(req.params.id);
    if (!tim || PERAN_PENDAMPING.has(tim.role)) {
      return res.status(404).json({ error: "Akun tim tidak ditemukan" });
    }
    const fasIds = Array.isArray(req.body?.fasilitator_ids)
      ? req.body.fasilitator_ids.map(String) : [];
    // Validasi semua target adalah akun PENDAMPING yang ada
    for (const id of fasIds) {
      const f = await store.getUserById(id);
      if (!f || !PERAN_PENDAMPING.has(f.role)) {
        return res.status(400).json({ error: `Akun pendamping tidak valid: ${id}` });
      }
    }
    const hasil = await store.gantiFasilitatorTim(tim.id, fasIds);
    adminStore.audit(req, "tim.fasilitator.ubah", {
      target: tim.id,
      username: tim.username,
      ...hasil,
    });
    res.json({ ok: true, ...hasil });
  } catch (err) {
    next(err);
  }
});

/** Rekap ACC dosen untuk sebuah tim (kartu info di panel). */
router.get("/data/tim/:id/persetujuan", async (req, res, next) => {
  try {
    const tim = await store.getUserById(req.params.id);
    if (!tim) return res.status(404).json({ error: "Akun tidak ditemukan" });
    res.json(await store.ringkasPersetujuan(tim.id));
  } catch (err) {
    next(err);
  }
});

/** Sajikan laporan .docx sebuah tim untuk panel (sesi panel; dukung ?t=). */
router.get("/data/pengguna/:id/laporan-file", async (req, res, next) => {
  try {
    const l = await store.getLaporan(req.params.id);
    if (!l) return res.status(404).json({ error: "Belum ada laporan tersimpan" });
    adminStore.audit(req, "user.laporan.lihat", { target: req.params.id });
    res.setHeader("Content-Type",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    const unduh = req.query.unduh ? "attachment" : "inline";
    res.setHeader("Content-Disposition",
      `${unduh}; filename="${encodeURIComponent(l.nama)}"`);
    res.send(l.buffer);
  } catch (err) {
    next(err);
  }
});

/** Sajikan presentasi .pptx sebuah tim untuk panel (sesi panel; dukung ?t=). */
router.get("/data/pengguna/:id/presentasi-file", async (req, res, next) => {
  try {
    const p = await store.getPresentasi(req.params.id);
    if (!p) return res.status(404).json({ error: "Belum ada berkas presentasi tersimpan" });
    adminStore.audit(req, "user.presentasi.lihat", { target: req.params.id });
    res.setHeader("Content-Type",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation");
    const unduh = req.query.unduh ? "attachment" : "inline";
    res.setHeader("Content-Disposition",
      `${unduh}; filename="${encodeURIComponent(p.nama)}"`);
    res.send(p.buffer);
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

