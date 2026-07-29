/**
 * API akun TIM untuk mengelola pendampingnya sendiri — tanpa perlu admin:
 *
 * - `GET /kode`            lihat kode tim (dibagikan ke fasilitator/dosen)
 * - `POST /kode/reset`     cetak ulang kode (kode lama langsung mati)
 * - `GET /pendamping`      daftar pendamping yang sudah bergabung
 * - `DELETE /pendamping/:id` keluarkan seorang pendamping
 *
 * Semua endpoint dipagari `hanyaTim` — akun pendamping tidak punya kode tim.
 */
import { Router } from "express";
import * as store from "../storage.js";
import { authRequired, hanyaTim } from "../auth.js";
import { catatAktivitas } from "../aktivitas.js";

const router = Router();
router.use(authRequired);
router.use(hanyaTim);

/**
 * @openapi
 * /api/tim/kode:
 *   get:
 *     tags: [Tim]
 *     summary: Kode tim milik akun ini (dibagikan ke fasilitator/dosen pendamping)
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: "{ kode, kode_tampil }" }
 *       403: { description: Akun pendamping tidak punya kode tim }
 */
router.get("/kode", async (req, res, next) => {
  try {
    const kode = await store.getKodeTim(req.userId);
    res.json({ kode, kode_tampil: store.tampilKode(kode) });
  } catch (err) {
    next(err);
  }
});

/**
 * @openapi
 * /api/tim/kode/reset:
 *   post:
 *     tags: [Tim]
 *     summary: Cetak ulang kode tim (kode lama langsung tidak berlaku)
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Kode baru }
 */
router.post("/kode/reset", async (req, res, next) => {
  try {
    const kode = await store.resetKodeTim(req.userId);
    catatAktivitas(req.userId, "tim.kode.reset", { oleh: req.user.username });
    res.json({ kode, kode_tampil: store.tampilKode(kode) });
  } catch (err) {
    next(err);
  }
});

/**
 * @openapi
 * /api/tim/pendamping:
 *   get:
 *     tags: [Tim]
 *     summary: Daftar fasilitator & dosen yang mendampingi tim ini
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: "Daftar pendamping (id, username, role, sejak)" }
 */
router.get("/pendamping", async (req, res, next) => {
  try {
    res.json(await store.listFasilitatorUntukTim(req.userId));
  } catch (err) {
    next(err);
  }
});

/**
 * @openapi
 * /api/tim/pendamping/{id}:
 *   delete:
 *     tags: [Tim]
 *     summary: Keluarkan seorang pendamping dari tim ini
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     responses:
 *       200: { description: Pendamping dikeluarkan }
 *       404: { description: Bukan pendamping tim ini }
 */
router.delete("/pendamping/:id", async (req, res, next) => {
  try {
    const id = String(req.params.id || "");
    const ok = await store.hapusPendampingDariTim(id, req.userId);
    if (!ok) return res.status(404).json({ error: "Pendamping itu tidak terdaftar di timmu" });
    const u = await store.getUserById(id);
    catatAktivitas(req.userId, "pendamping.keluarkan", {
      oleh: req.user.username,
      pendamping: u?.username || "",
    });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;

