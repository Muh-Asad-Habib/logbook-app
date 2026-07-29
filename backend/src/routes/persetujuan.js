/**
 * API ACC / pengesahan entri logbook oleh DOSEN PENDAMPING.
 *
 * Model status (sederhana & jelas untuk pengguna):
 *   menunggu   → belum ditinjau (tidak ada baris di tabel persetujuan)
 *   disetujui  → di-ACC dosen
 *   revisi     → dosen minta perbaikan (biasanya + catatan)
 *
 * Aturan keamanan:
 * - MEMBACA status: tim (logbook-nya sendiri) & pendamping tim ter-assign.
 * - MENGUBAH status: HANYA akun dosen, dan hanya pada tim yang ia ampu.
 *   Fasilitator biasa 403 (lihat middleware hanyaDosen).
 * - Bila tim mengedit/menghapus entri (atau mengganti laporan), status ACC
 *   otomatis dihapus di storage.js → kembali "menunggu".
 */
import { Router } from "express";
import * as store from "../storage.js";
import { authRequired, hanyaDosen, PERAN_PENDAMPING } from "../auth.js";
import { catatAktivitas } from "../aktivitas.js";

const router = Router();
router.use(authRequired);

const JENIS_VALID = new Set(["kegiatan", "keuangan", "laporan"]);
const STATUS_VALID = new Set(["disetujui", "revisi", "menunggu"]);

/** Tim yang sah untuk request ini (tim = dirinya; pendamping = ?tim= ter-assign). */
async function timUntukRequest(req, res) {
  if (PERAN_PENDAMPING.has(req.user.role)) {
    const timId = String(req.query.tim || req.body?.tim || "");
    if (!timId) {
      res.status(400).json({ error: "Parameter tim wajib untuk fasilitator/dosen" });
      return null;
    }
    if (!(await store.bolehAksesTim(req.user.id, timId))) {
      res.status(403).json({ error: "Kamu bukan pendamping tim ini" });
      return null;
    }
    return timId;
  }
  return req.user.id;
}

/**
 * @openapi
 * /api/persetujuan:
 *   get:
 *     tags: [Persetujuan]
 *     summary: Peta status ACC entri (tim = miliknya; pendamping = tim ter-assign via ?tim=)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: query, name: jenis, required: false, schema: { type: string, enum: [kegiatan, keuangan, laporan] } }
 *       - { in: query, name: tim, required: false, schema: { type: string }, description: "wajib bila fasilitator/dosen" }
 *     responses:
 *       200: { description: "{ target_id: { status, catatan, dosen_username, updatedAt } }" }
 */
router.get("/", async (req, res, next) => {
  try {
    const jenis = req.query.jenis ? String(req.query.jenis) : "";
    if (jenis && !JENIS_VALID.has(jenis)) {
      return res.status(400).json({ error: "jenis harus kegiatan/keuangan/laporan" });
    }
    const timId = await timUntukRequest(req, res);
    if (!timId) return;
    res.json(await store.listPersetujuan(timId, jenis || null));
  } catch (err) {
    next(err);
  }
});

/**
 * @openapi
 * /api/persetujuan/ringkas:
 *   get:
 *     tags: [Persetujuan]
 *     summary: Rekap ACC satu tim (disetujui/revisi/menunggu per jenis)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: query, name: tim, required: false, schema: { type: string } }
 *     responses:
 *       200: { description: Rekap per jenis + total }
 */
router.get("/ringkas", async (req, res, next) => {
  try {
    const timId = await timUntukRequest(req, res);
    if (!timId) return;
    res.json(await store.ringkasPersetujuan(timId));
  } catch (err) {
    next(err);
  }
});

/**
 * @openapi
 * /api/persetujuan:
 *   put:
 *     tags: [Persetujuan]
 *     summary: Beri ACC / minta revisi sebuah entri (KHUSUS dosen pendamping)
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [jenis, target_id, status, tim]
 *             properties:
 *               jenis: { type: string, enum: [kegiatan, keuangan, laporan] }
 *               target_id: { type: string, description: "id entri; untuk laporan = id tim" }
 *               status: { type: string, enum: [disetujui, revisi, menunggu] }
 *               catatan: { type: string, maxLength: 1000 }
 *               tim: { type: string, description: "id akun tim" }
 *     responses:
 *       200: { description: Status ACC tersimpan }
 *       403: { description: Bukan dosen pendamping / bukan tim ampuanmu }
 *       404: { description: Entri tidak ditemukan }
 */
router.put("/", hanyaDosen, async (req, res, next) => {
  try {
    const jenis = String(req.body?.jenis || "");
    if (!JENIS_VALID.has(jenis)) {
      return res.status(400).json({ error: "jenis harus kegiatan/keuangan/laporan" });
    }
    const status = String(req.body?.status || "");
    if (!STATUS_VALID.has(status)) {
      return res.status(400).json({ error: "status harus disetujui/revisi/menunggu" });
    }
    const catatan = String(req.body?.catatan || "").trim().slice(0, 1000);
    if (status === "revisi" && !catatan) {
      return res.status(400).json({ error: "Tulis catatan revisi agar tim tahu perbaikannya" });
    }
    const timId = await timUntukRequest(req, res);
    if (!timId) return;

    // Pastikan target benar-benar milik tim tersebut
    let targetId = String(req.body?.target_id || "");
    if (jenis === "kegiatan") {
      if (!(await store.getKegiatan(timId, targetId))) {
        return res.status(404).json({ error: "Entri kegiatan tidak ditemukan" });
      }
    } else if (jenis === "keuangan") {
      if (!(await store.getKeuangan(timId, targetId))) {
        return res.status(404).json({ error: "Entri belanja tidak ditemukan" });
      }
    } else {
      targetId = timId; // satu laporan per tim
      if (!(await store.infoLaporan(timId)).ada) {
        return res.status(404).json({ error: "Tim belum mengunggah laporan" });
      }
    }

    if (status === "menunggu") {
      await store.hapusPersetujuan(jenis, targetId);
      catatAktivitas(timId, "acc.batal", { jenis, oleh: req.user.username });
      return res.json({ status: "menunggu", target_id: targetId, jenis });
    }

    const hasil = await store.setPersetujuan({
      jenis, targetId, timUserId: timId, dosenId: req.user.id, status, catatan,
    });
    catatAktivitas(timId, status === "disetujui" ? "acc.setuju" : "acc.revisi", {
      jenis, oleh: req.user.username, catatan: catatan.slice(0, 120),
    });
    res.json(hasil);
  } catch (err) {
    next(err);
  }
});

export default router;

