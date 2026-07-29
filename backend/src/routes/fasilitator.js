/**
 * API khusus akun PENDAMPING (fasilitator & dosen pendamping) — read-only
 * terhadap data tim yang di-assign pusat kendali (tabel fasilitator_tim,
 * many-to-many).
 *
 * - Semua endpoint memvalidasi assignment (bolehAksesTim) per request.
 * - Tidak ada endpoint tulis data tim di sini; satu-satunya POST hanya
 *   membuat tautan penampil Office untuk laporan (tidak mengubah data).
 * - Komentar dilayani router terpisah: /api/komentar.
 * - ACC/pengesahan (khusus dosen) dilayani router: /api/persetujuan.
 */
import { Router } from "express";
import crypto from "node:crypto";
import * as store from "../storage.js";
import { authRequired, hanyaPendamping } from "../auth.js";
import { bacaAktivitas, catatAktivitas } from "../aktivitas.js";
import { rateLimit } from "../ratelimit.js";
import { q } from "../db.js";

const router = Router();
router.use(authRequired);
router.use(hanyaPendamping);

// Kode tim ditebak-tebak? Dibatasi 15 percobaan / 10 menit per IP.
const gabungLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 15,
  pesan: "Terlalu banyak percobaan kode tim",
});

/** Pastikan pendamping ini boleh mengakses tim :timId (403 bila belum di-assign). */
async function pastikanAkses(req, res, next) {
  try {
    const timId = String(req.params.timId || "");
    if (!(await store.bolehAksesTim(req.user.id, timId))) {
      return res.status(403).json({
        error: "Kamu belum ditugaskan sebagai pendamping tim ini — hubungi admin",
      });
    }
    const tim = await store.getUserById(timId);
    if (!tim) return res.status(404).json({ error: "Tim tidak ditemukan" });
    req.tim = { id: tim.id, username: tim.username };
    next();
  } catch (err) {
    next(err);
  }
}

/** Ringkasan statistik sebuah tim (rumus sama dengan /api/statistik). */
async function hitungStatistik(timId) {
  const [kegiatan, keuangan, danaAwalStr] = await Promise.all([
    store.listKegiatan(timId),
    store.listKeuangan(timId),
    store.getSetting(timId, "dana_awal", "0"),
  ]);
  const capaian = kegiatan.length ? kegiatan[kegiatan.length - 1].capaian_total : 0;
  const totalMenit = kegiatan.reduce((s, e) => s + e.waktu_menit, 0);
  const pengeluaran = keuangan.reduce((s, e) => s + e.total, 0);
  const danaAwal = Number(danaAwalStr) || 0;
  return {
    capaian_total: capaian,
    jumlah_kegiatan: kegiatan.length,
    total_waktu_menit: totalMenit,
    jumlah_belanja: keuangan.length,
    total_pengeluaran: pengeluaran,
    dana_awal: danaAwal,
    sisa_dana: danaAwal - pengeluaran,
    _kegiatan: kegiatan, // dipakai internal /ringkasan (tidak diserialisasi)
  };
}

/**
 * @openapi
 * /api/fasilitator/tim:
 *   get:
 *     tags: [Fasilitator]
 *     summary: Daftar tim yang diampu fasilitator ini (bisa lebih dari satu)
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Daftar tim (id, username, sejak) }
 *       403: { description: Bukan akun fasilitator }
 */
router.get("/tim", async (req, res, next) => {
  try {
    res.json(await store.listTimUntukFasilitator(req.user.id));
  } catch (err) {
    next(err);
  }
});

/**
 * @openapi
 * /api/fasilitator/tim/{timId}/kegiatan:
 *   get:
 *     tags: [Fasilitator]
 *     summary: Daftar kegiatan tim (read-only)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: timId, required: true, schema: { type: string } }
 *     responses:
 *       200: { description: Daftar kegiatan }
 *       403: { description: Belum di-assign ke tim ini }
 */
router.get("/tim/:timId/kegiatan", pastikanAkses, async (req, res, next) => {
  try {
    res.json(await store.listKegiatan(req.tim.id));
  } catch (err) {
    next(err);
  }
});

/**
 * @openapi
 * /api/fasilitator/tim/{timId}/keuangan:
 *   get:
 *     tags: [Fasilitator]
 *     summary: Daftar belanja tim (read-only)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: timId, required: true, schema: { type: string } }
 *     responses:
 *       200: { description: Daftar belanja }
 *       403: { description: Belum di-assign ke tim ini }
 */
router.get("/tim/:timId/keuangan", pastikanAkses, async (req, res, next) => {
  try {
    res.json(await store.listKeuangan(req.tim.id));
  } catch (err) {
    next(err);
  }
});

/**
 * @openapi
 * /api/fasilitator/tim/{timId}/statistik:
 *   get:
 *     tags: [Fasilitator]
 *     summary: Ringkasan statistik tim (rumus sama dengan /api/statistik)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: timId, required: true, schema: { type: string } }
 *     responses:
 *       200: { description: Ringkasan }
 */
router.get("/tim/:timId/statistik", pastikanAkses, async (req, res, next) => {
  try {
    const { _kegiatan, ...statistik } = await hitungStatistik(req.tim.id);
    res.json(statistik);
  } catch (err) {
    next(err);
  }
});

/**
 * @openapi
 * /api/fasilitator/tim/{timId}/ringkasan:
 *   get:
 *     tags: [Fasilitator]
 *     summary: Dashboard tim — statistik, kegiatan terakhir, aktivitas, laporan, komentar
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: timId, required: true, schema: { type: string } }
 *     responses:
 *       200: { description: Ringkasan lengkap untuk dashboard fasilitator }
 */
router.get("/tim/:timId/ringkasan", pastikanAkses, async (req, res, next) => {
  try {
    const { _kegiatan, ...statistik } = await hitungStatistik(req.tim.id);
    const [aktivitas, laporan, belumDibaca, persetujuan] = await Promise.all([
      bacaAktivitas(req.tim.id, 10),
      store.infoLaporan(req.tim.id),
      store.hitungBelumDibaca(req.user.id, req.user.role),
      store.ringkasPersetujuan(req.tim.id),
    ]);
    res.json({
      tim: req.tim,
      statistik,
      kegiatan_terakhir: _kegiatan.slice(-5).reverse(),
      aktivitas,
      laporan,
      komentar_belum_dibaca: belumDibaca,
      persetujuan,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * @openapi
 * /api/fasilitator/tim/{timId}/laporan-info:
 *   get:
 *     tags: [Fasilitator]
 *     summary: Info laporan kemajuan tim (nama, ukuran, waktu unggah)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: timId, required: true, schema: { type: string } }
 *     responses:
 *       200: { description: "{ ada, nama, ukuran, updated_at }" }
 */
router.get("/tim/:timId/laporan-info", pastikanAkses, async (req, res, next) => {
  try {
    res.json(await store.infoLaporan(req.tim.id));
  } catch (err) {
    next(err);
  }
});

/**
 * @openapi
 * /api/fasilitator/tim/{timId}/laporan-file:
 *   get:
 *     tags: [Fasilitator]
 *     summary: Ambil/unduh berkas laporan kemajuan tim (.docx)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: timId, required: true, schema: { type: string } }
 *     responses:
 *       200: { description: Berkas .docx }
 *       404: { description: Tim belum mengunggah laporan }
 */
router.get("/tim/:timId/laporan-file", pastikanAkses, async (req, res, next) => {
  try {
    const l = await store.getLaporan(req.tim.id);
    if (!l) return res.status(404).json({ error: "Tim belum mengunggah laporan" });
    res.setHeader("Content-Type",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    const unduh = req.query.unduh ? "attachment" : "inline";
    res.setHeader("Content-Disposition",
      `${unduh}; filename="${encodeURIComponent(l.nama)}"`);
    res.setHeader("Cache-Control", "private, no-store");
    res.send(l.buffer);
  } catch (err) {
    next(err);
  }
});

/**
 * @openapi
 * /api/fasilitator/tim/{timId}/laporan-tautan:
 *   post:
 *     tags: [Fasilitator]
 *     summary: Buat tautan publik 30 menit untuk penampil Office (tidak mengubah data)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: timId, required: true, schema: { type: string } }
 *     responses:
 *       200: { description: "{ url, exp }" }
 *       404: { description: Tim belum mengunggah laporan }
 */
const UMUR_TAUTAN_MS = 30 * 60 * 1000;
router.post("/tim/:timId/laporan-tautan", pastikanAkses, async (req, res, next) => {
  try {
    const info = await store.infoLaporan(req.tim.id);
    if (!info.ada) return res.status(404).json({ error: "Tim belum mengunggah laporan" });
    const kunci = crypto.randomBytes(24).toString("hex");
    const exp = Date.now() + UMUR_TAUTAN_MS;
    // Tautan milik TIM (user_id = tim) — route publik /api/laporan/publik/:kunci
    // yang sudah ada langsung bisa menyajikannya tanpa perubahan apa pun.
    await q("DELETE FROM laporan_links WHERE exp < $1", [Date.now()]);
    await q("INSERT INTO laporan_links (kunci, user_id, exp) VALUES ($1, $2, $3)",
      [kunci, req.tim.id, exp]);
    const proto = String(req.headers["x-forwarded-proto"] || req.protocol || "https").split(",")[0].trim();
    const host = String(req.headers["x-forwarded-host"] || req.headers.host || "").split(",")[0].trim();
    res.json({ url: `${proto}://${host}/api/laporan/publik/${kunci}`, exp });
  } catch (err) {
    next(err);
  }
});

/**
 * @openapi
 * /api/fasilitator/gabung:
 *   post:
 *     tags: [Fasilitator]
 *     summary: Gabung ke sebuah tim memakai kode yang dibagikan tim itu sendiri
 *     description: >
 *       Tim melihat kodenya di halaman Profil lalu mengirimkannya ke pendamping.
 *       Endpoint ini membuat assignment tanpa perlu bantuan admin.
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [kode]
 *             properties:
 *               kode: { type: string, example: "ABCD-2345" }
 *     responses:
 *       201: { description: Berhasil bergabung }
 *       200: { description: Sudah mendampingi tim itu sebelumnya }
 *       400: { description: Kode tidak valid }
 *       404: { description: Kode tim tidak ditemukan }
 *       429: { description: Terlalu banyak percobaan }
 */
router.post("/gabung", gabungLimiter, async (req, res, next) => {
  try {
    const kode = store.rapikanKode(req.body?.kode);
    if (kode.length < 6) return res.status(400).json({ error: "Kode tim tidak valid" });

    const tim = await store.cariTimByKode(kode);
    if (!tim) {
      return res.status(404).json({
        error: "Kode tim tidak ditemukan — minta tim menyalin ulang kodenya",
      });
    }

    const baru = await store.tambahPendampingKeTim(req.user.id, tim.id);
    if (baru) {
      catatAktivitas(tim.id, "pendamping.gabung", {
        oleh: req.user.username,
        peran: req.user.role,
      });
    }
    res.status(baru ? 201 : 200).json({ tim, baru });
  } catch (err) {
    next(err);
  }
});

/**
 * @openapi
 * /api/fasilitator/tim/{timId}:
 *   delete:
 *     tags: [Fasilitator]
 *     summary: Keluar dari sebuah tim (melepas assignment milik sendiri)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: timId, required: true, schema: { type: string } }
 *     responses:
 *       200: { description: Keluar dari tim }
 *       403: { description: Bukan pendamping tim ini }
 */
router.delete("/tim/:timId", pastikanAkses, async (req, res, next) => {
  try {
    await store.hapusPendampingDariTim(req.user.id, req.tim.id);
    catatAktivitas(req.tim.id, "pendamping.keluar", {
      oleh: req.user.username,
      peran: req.user.role,
    });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;

