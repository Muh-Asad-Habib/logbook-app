import { Router } from "express";
import multer from "multer";
import * as store from "../storage.js";
import { putFile, removeFiles, isAllowedImage } from "../files.js";
import { authRequired } from "../auth.js";
import { catatAktivitas } from "../aktivitas.js";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 10 },
  fileFilter: (_req, file, cb) => {
    // Whitelist server-side — jangan percaya accept= di browser
    if (isAllowedImage(file.originalname, file.mimetype)) return cb(null, true);
    cb(new Error("Hanya berkas gambar (jpg/png/webp/gif) yang diizinkan"));
  },
});

const router = Router();
router.use(authRequired); // semua endpoint kegiatan milik user yang login

/**
 * Waktu kanonik = MENIT. Klien boleh mengirim `waktu_menit` saja,
 * `waktu_jam` saja, atau keduanya (mis. 1 jam 22 menit) — di sini
 * dikonversi & dijumlahkan jadi satu nilai menit (bulat, ≥ 0).
 */
function hitungMenit(body, fallback = 0) {
  const jam = parseFloat(body?.waktu_jam);
  const menit = parseFloat(body?.waktu_menit);
  if (Number.isNaN(jam) && Number.isNaN(menit)) return fallback;
  const total = Math.round(
    (Number.isNaN(jam) ? 0 : jam) * 60 + (Number.isNaN(menit) ? 0 : menit)
  );
  return Math.max(0, total || 0);
}

/**
 * @openapi
 * /api/kegiatan:
 *   get:
 *     tags: [Kegiatan]
 *     summary: Daftar semua kegiatan (urut tanggal, dengan capaian_total kumulatif)
 *     responses:
 *       200:
 *         description: Daftar kegiatan
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items: { $ref: '#/components/schemas/Kegiatan' }
 *   post:
 *     tags: [Kegiatan]
 *     summary: Tambah kegiatan baru (foto disimpan di folder uploads server)
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [tanggal, kegiatan]
 *             properties:
 *               tanggal: { type: string, example: "2026-07-11" }
 *               kegiatan: { type: string, example: "Rapat koordinasi tim" }
 *               capaian_delta: { type: integer, example: 5 }
 *               waktu_menit: { type: number, example: 22, description: "Menit (boleh dikombinasi dengan waktu_jam)" }
 *               waktu_jam: { type: number, example: 1, description: "Jam — dikonversi & dijumlahkan ke menit" }
 *               foto:
 *                 type: array
 *                 items: { type: string, format: binary }
 *     responses:
 *       201: { description: Kegiatan dibuat }
 *       400: { description: Input tidak valid }
 */
router.get("/", async (req, res, next) => {
  try {
    res.json(await store.listKegiatan(req.userId));
  } catch (err) {
    next(err);
  }
});

router.post("/", upload.array("foto"), async (req, res, next) => {
  try {
    const { tanggal, kegiatan } = req.body;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(tanggal || "") || !kegiatan?.trim()) {
      return res.status(400).json({ error: "tanggal (yyyy-mm-dd) dan kegiatan wajib diisi" });
    }
    const fotoKeys = [];
    for (const f of req.files || []) {
      fotoKeys.push(await putFile(f.originalname, f.buffer, `keg_${tanggal}`));
    }
    const e = await store.addKegiatan(req.userId, {
      tanggal,
      kegiatan: kegiatan.trim(),
      capaian_delta: parseInt(req.body.capaian_delta || "0", 10) || 0,
      waktu_menit: hitungMenit(req.body, 0),
      foto_keys: fotoKeys,
    });
    catatAktivitas(req.userId, "kegiatan.tambah", {
      tanggal, ringkas: kegiatan.trim().slice(0, 60), foto: fotoKeys.length,
    });
    res.status(201).json(e);
  } catch (err) {
    next(err);
  }
});

/**
 * @openapi
 * /api/kegiatan/{id}:
 *   put:
 *     tags: [Kegiatan]
 *     summary: Ubah kegiatan (foto baru ditambah; kirim keep_keys utk foto lama yang dipertahankan)
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
 *               kegiatan: { type: string }
 *               capaian_delta: { type: integer }
 *               waktu_menit: { type: number, description: "Menit (boleh dikombinasi dengan waktu_jam)" }
 *               waktu_jam: { type: number, description: "Jam — dikonversi & dijumlahkan ke menit" }
 *               keep_keys: { type: string, description: "JSON array key foto lama yang dipertahankan" }
 *               foto:
 *                 type: array
 *                 items: { type: string, format: binary }
 *     responses:
 *       200: { description: Kegiatan diperbarui }
 *       404: { description: Tidak ditemukan }
 *   delete:
 *     tags: [Kegiatan]
 *     summary: Hapus kegiatan (berkas fotonya ikut dihapus)
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Terhapus }
 *       404: { description: Tidak ditemukan }
 */
router.put("/:id", upload.array("foto"), async (req, res, next) => {
  try {
    const doc = await store.getKegiatan(req.userId, req.params.id);
    if (!doc) return res.status(404).json({ error: "kegiatan tidak ditemukan" });

    let keep = doc.foto_keys;
    if (req.body.keep_keys !== undefined) {
      try {
        keep = JSON.parse(req.body.keep_keys);
      } catch {
        return res.status(400).json({ error: "keep_keys harus JSON array" });
      }
    }
    await removeFiles(doc.foto_keys.filter((k) => !keep.includes(k)));

    const tanggal = req.body.tanggal || doc.tanggal;
    const newKeys = [];
    for (const f of req.files || []) {
      newKeys.push(await putFile(f.originalname, f.buffer, `keg_${tanggal}`));
    }

    const patch = { tanggal, foto_keys: [...keep, ...newKeys] };
    if (req.body.kegiatan !== undefined) patch.kegiatan = req.body.kegiatan.trim();
    if (req.body.capaian_delta !== undefined) patch.capaian_delta = parseInt(req.body.capaian_delta, 10) || 0;
    if (req.body.waktu_menit !== undefined || req.body.waktu_jam !== undefined) {
      patch.waktu_menit = hitungMenit(req.body, doc.waktu_menit);
    }
    const hasil = await store.updateKegiatan(req.userId, doc.id, patch);
    catatAktivitas(req.userId, "kegiatan.ubah", {
      tanggal, ringkas: String(patch.kegiatan ?? doc.kegiatan).slice(0, 60),
    });
    res.json(hasil);
  } catch (err) {
    next(err);
  }
});

router.delete("/:id", async (req, res, next) => {
  try {
    const doc = await store.deleteKegiatan(req.userId, req.params.id);
    if (!doc) return res.status(404).json({ error: "kegiatan tidak ditemukan" });
    await removeFiles(doc.foto_keys);
    catatAktivitas(req.userId, "kegiatan.hapus", {
      tanggal: doc.tanggal, ringkas: String(doc.kegiatan || "").slice(0, 60),
    });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;

