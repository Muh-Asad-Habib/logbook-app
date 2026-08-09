import { Router } from "express";
import multer from "multer";
import { importDocx } from "../import/docx.js";
import { authRequired, hanyaTim } from "../auth.js";
import {
  cekPotongan, simpanPotongan, rakitPotongan, bersihkanPotongan,
  ID_RE, validTotal,
} from "../potongan.js";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 60 * 1024 * 1024, files: 1 },
});

const router = Router();
router.use(authRequired); // hasil impor masuk ke akun user yang login
router.use(hanyaTim); // fasilitator tidak boleh mengubah data tim

/**
 * @openapi
 * /api/import/docx:
 *   post:
 *     tags: [Import]
 *     summary: Impor entri dari dokumen Word (.docx) — entri & foto yang belum ada akan ditambahkan
 *     description: >
 *       Unggah berkas .docx logbook (field `file`). Bila tidak ada berkas yang diunggah,
 *       server membaca template resmi bawaan. Entri yang sudah ada dilewati — aman diulang.
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file: { type: string, format: binary, description: "Berkas .docx (opsional)" }
 *     responses:
 *       200:
 *         description: Ringkasan hasil impor
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 keg_baru: { type: integer, example: 2 }
 *                 keg_lewat: { type: integer, example: 14 }
 *                 keu_baru: { type: integer, example: 1 }
 *                 keu_lewat: { type: integer, example: 3 }
 *                 warnings: { type: array, items: { type: string } }
 *       400: { description: Berkas tidak valid }
 */
router.post("/docx", upload.single("file"), async (req, res, next) => {
  try {
    res.json(await importDocx(req.file?.buffer, req.userId));
  } catch (err) {
    err.status = 400;
    next(err);
  }
});

/* ================= Impor terpotong (chunked) =================
 * Di Vercel, satu request dibatasi ±4,5 MB — .docx berisi banyak foto
 * jauh melampaui itu (dulu langsung 413). Browser memotong file jadi
 * potongan ±2 MB; BINER potongan disimpan di ImageKit, Neon hanya
 * menyimpan katalog kuncinya — lihat src/potongan.js. */

/**
 * @openapi
 * /api/import/docx/chunk:
 *   post:
 *     tags: [Import]
 *     summary: Unggah satu potongan berkas .docx (base64) — untuk berkas besar
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [id, idx, data]
 *             properties:
 *               id: { type: string, description: "ID unggahan (huruf kecil/angka/-, 8–64)" }
 *               idx: { type: integer, description: "Nomor urut potongan (mulai 0)" }
 *               data: { type: string, description: "Isi potongan, base64" }
 *     responses:
 *       200: { description: Potongan tersimpan }
 *       400: { description: Potongan tidak valid }
 */
router.post("/docx/chunk", async (req, res, next) => {
  try {
    const { id, idx, data } = req.body || {};
    const salah = cekPotongan(id, idx, data);
    if (salah) return res.status(400).json({ error: salah });
    await simpanPotongan(String(id), Number(idx), req.userId, data);
    res.json({ ok: true, idx: Number(idx) });
  } catch (err) {
    next(err);
  }
});

/**
 * @openapi
 * /api/import/docx/selesai:
 *   post:
 *     tags: [Import]
 *     summary: Rakit seluruh potongan lalu jalankan impor .docx
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [id, total]
 *             properties:
 *               id: { type: string }
 *               total: { type: integer, description: "Jumlah potongan yang diunggah" }
 *     responses:
 *       200: { description: Ringkasan hasil impor (sama dengan /api/import/docx) }
 *       400: { description: Potongan tidak lengkap / berkas tidak valid }
 */
router.post("/docx/selesai", async (req, res, next) => {
  const id = String(req.body?.id || "");
  try {
    const total = Number(req.body?.total);
    if (!ID_RE.test(id) || !validTotal(total)) {
      return res.status(400).json({ error: "id/total tidak valid" });
    }
    const buffer = await rakitPotongan(id, req.userId, total);
    res.json(await importDocx(buffer, req.userId));
  } catch (err) {
    bersihkanPotongan(id, req.userId).catch(() => {});
    err.status = err.status || 400;
    next(err);
  }
});

export default router;

