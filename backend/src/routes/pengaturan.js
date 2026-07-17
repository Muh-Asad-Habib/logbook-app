import { Router } from "express";
import * as store from "../storage.js";
import { authRequired, hanyaTim } from "../auth.js";

const router = Router();
router.use(authRequired); // pengaturan per akun
router.use(hanyaTim); // fasilitator tidak punya pengaturan dana

/**
 * @openapi
 * /api/pengaturan/{kunci}:
 *   get:
 *     tags: [Pengaturan]
 *     summary: Ambil nilai pengaturan (mis. dana_awal)
 *     parameters:
 *       - in: path
 *         name: kunci
 *         required: true
 *         schema: { type: string, example: dana_awal }
 *     responses:
 *       200:
 *         description: Nilai pengaturan (string kosong bila belum diset)
 *   put:
 *     tags: [Pengaturan]
 *     summary: Simpan nilai pengaturan
 *     parameters:
 *       - in: path
 *         name: kunci
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               nilai: { type: string, example: "5000000" }
 *     responses:
 *       200: { description: Tersimpan }
 */
router.get("/:kunci", async (req, res, next) => {
  try {
    res.json({ kunci: req.params.kunci, nilai: await store.getSetting(req.userId, req.params.kunci) });
  } catch (err) {
    next(err);
  }
});

router.put("/:kunci", async (req, res, next) => {
  try {
    const nilai = String(req.body?.nilai ?? "");
    await store.setSetting(req.userId, req.params.kunci, nilai);
    res.json({ kunci: req.params.kunci, nilai });
  } catch (err) {
    next(err);
  }
});

/**
 * @openapi
 * /api/statistik:
 *   get:
 *     tags: [Statistik]
 *     summary: Ringkasan dashboard (capaian, total waktu, pengeluaran, sisa dana)
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Ringkasan
 */
export const statistikRouter = Router();
statistikRouter.use(authRequired);
statistikRouter.use(hanyaTim); // fasilitator pakai /api/fasilitator/tim/:id/statistik
statistikRouter.get("/", async (req, res, next) => {
  try {
    const [kegiatan, keuangan, danaAwalStr] = await Promise.all([
      store.listKegiatan(req.userId),
      store.listKeuangan(req.userId),
      store.getSetting(req.userId, "dana_awal", "0"),
    ]);
    const capaian = kegiatan.length ? kegiatan[kegiatan.length - 1].capaian_total : 0;
    const totalMenit = kegiatan.reduce((s, e) => s + e.waktu_menit, 0);
    const pengeluaran = keuangan.reduce((s, e) => s + e.total, 0);
    const danaAwal = Number(danaAwalStr) || 0;
    res.json({
      capaian_total: capaian,
      jumlah_kegiatan: kegiatan.length,
      total_waktu_menit: totalMenit,
      jumlah_belanja: keuangan.length,
      total_pengeluaran: pengeluaran,
      dana_awal: danaAwal,
      sisa_dana: danaAwal - pengeluaran,
    });
  } catch (err) {
    next(err);
  }
});

export default router;

