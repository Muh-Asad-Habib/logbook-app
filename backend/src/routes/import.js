import { Router } from "express";
import multer from "multer";
import { importDocx } from "../import/docx.js";
import { authRequired } from "../auth.js";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 60 * 1024 * 1024, files: 1 },
});

const router = Router();
router.use(authRequired); // hasil impor masuk ke akun user yang login

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

export default router;

