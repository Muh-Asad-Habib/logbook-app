import { Router } from "express";
import multer from "multer";
import * as store from "../storage.js";
import { putFile, removeFiles, isAllowedImage } from "../files.js";
import { authRequired, hanyaTim } from "../auth.js";
import { catatAktivitas } from "../aktivitas.js";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    // Whitelist server-side — jangan percaya accept= di browser
    if (isAllowedImage(file.originalname, file.mimetype)) return cb(null, true);
    cb(new Error("Hanya berkas gambar (jpg/png/webp/gif) yang diizinkan"));
  },
});

const router = Router();
router.use(authRequired); // semua endpoint keuangan milik user yang login
router.use(hanyaTim); // fasilitator: baca lewat /api/fasilitator, bukan di sini

/**
 * @openapi
 * /api/keuangan:
 *   get:
 *     tags: [Keuangan]
 *     summary: Daftar semua entri belanja
 *     responses:
 *       200:
 *         description: Daftar belanja
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items: { $ref: '#/components/schemas/Keuangan' }
 *   post:
 *     tags: [Keuangan]
 *     summary: Tambah entri belanja (bukti/nota disimpan di folder uploads server)
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [tanggal, item, satuan_suffix]
 *             properties:
 *               tanggal: { type: string, example: "2026-07-11" }
 *               item: { type: string, example: "Sewa Canva Pro" }
 *               harga_satuan: { type: number, example: 99900 }
 *               satuan_suffix: { type: string, example: "/bulan" }
 *               jumlah: { type: number, example: 1 }
 *               bukti: { type: string, format: binary }
 *     responses:
 *       201: { description: Entri dibuat (total dihitung server) }
 *       400: { description: Input tidak valid }
 */
router.get("/", async (req, res, next) => {
  try {
    res.json(await store.listKeuangan(req.userId));
  } catch (err) {
    next(err);
  }
});

router.post("/", upload.single("bukti"), async (req, res, next) => {
  try {
    const { tanggal, item, satuan_suffix } = req.body;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(tanggal || "") || !item?.trim()) {
      return res.status(400).json({ error: "tanggal (yyyy-mm-dd) dan item wajib diisi" });
    }
    if (!satuan_suffix?.trim()) {
      return res.status(400).json({ error: "satuan wajib diisi (mis. /bulan, /pcs)" });
    }
    const buktiKey = req.file
      ? await putFile(req.file.originalname, req.file.buffer, `keu_${tanggal}`)
      : "";
    const e = await store.addKeuangan(req.userId, {
      tanggal,
      item: item.trim(),
      harga_satuan: Number(req.body.harga_satuan) || 0,
      satuan_suffix: satuan_suffix.trim(),
      jumlah: Number(req.body.jumlah) || 1,
      bukti_key: buktiKey,
    });
    catatAktivitas(req.userId, "keuangan.tambah", {
      tanggal, ringkas: item.trim().slice(0, 60), total: e.total,
    });
    res.status(201).json(e);
  } catch (err) {
    next(err);
  }
});

/**
 * @openapi
 * /api/keuangan/{id}:
 *   put:
 *     tags: [Keuangan]
 *     summary: Ubah entri belanja (unggah bukti baru akan mengganti yang lama)
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               tanggal: { type: string }
 *               item: { type: string }
 *               harga_satuan: { type: number }
 *               satuan_suffix: { type: string }
 *               jumlah: { type: number }
 *               bukti: { type: string, format: binary }
 *     responses:
 *       200: { description: Entri diperbarui }
 *       404: { description: Tidak ditemukan }
 *   delete:
 *     tags: [Keuangan]
 *     summary: Hapus entri belanja (berkas buktinya ikut dihapus)
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Terhapus }
 *       404: { description: Tidak ditemukan }
 */
router.put("/:id", upload.single("bukti"), async (req, res, next) => {
  try {
    const doc = await store.getKeuangan(req.userId, req.params.id);
    if (!doc) return res.status(404).json({ error: "entri tidak ditemukan" });

    const tanggal = req.body.tanggal || doc.tanggal;
    const patch = { tanggal };
    if (req.file) {
      if (doc.bukti_key) await removeFiles([doc.bukti_key]);
      patch.bukti_key = await putFile(req.file.originalname, req.file.buffer, `keu_${tanggal}`);
    }
    if (req.body.item !== undefined) patch.item = req.body.item.trim();
    if (req.body.harga_satuan !== undefined) patch.harga_satuan = Number(req.body.harga_satuan) || 0;
    if (req.body.satuan_suffix !== undefined) {
      if (!req.body.satuan_suffix.trim()) {
        return res.status(400).json({ error: "satuan wajib diisi (mis. /bulan, /pcs)" });
      }
      patch.satuan_suffix = req.body.satuan_suffix.trim();
    }
    if (req.body.jumlah !== undefined) patch.jumlah = Number(req.body.jumlah) || 1;
    const hasil = await store.updateKeuangan(req.userId, doc.id, patch);
    catatAktivitas(req.userId, "keuangan.ubah", {
      tanggal, ringkas: String(patch.item ?? doc.item).slice(0, 60), total: hasil.total,
    });
    res.json(hasil);
  } catch (err) {
    next(err);
  }
});

router.delete("/:id", async (req, res, next) => {
  try {
    const doc = await store.deleteKeuangan(req.userId, req.params.id);
    if (!doc) return res.status(404).json({ error: "entri tidak ditemukan" });
    if (doc.bukti_key) await removeFiles([doc.bukti_key]);
    catatAktivitas(req.userId, "keuangan.hapus", {
      tanggal: doc.tanggal, ringkas: String(doc.item || "").slice(0, 60), total: doc.total,
    });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;

