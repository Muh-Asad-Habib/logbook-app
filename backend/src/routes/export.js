import { Router } from "express";
import { buildDocx, entriesToExport } from "../export/docx.js";
import { buildPdf } from "../export/pdf.js";
import { buildXlsx } from "../export/xlsx.js";
import { authRequired, hanyaTim } from "../auth.js";

const router = Router();
router.use(authRequired); // ekspor berisi data milik user yang login
router.use(hanyaTim); // fasilitator tidak punya data untuk diekspor

/**
 * @openapi
 * /api/export/info:
 *   get:
 *     tags: [Export]
 *     summary: Info ekspor (jumlah entri baru yang akan ditambahkan ke dokumen resmi)
 *     responses:
 *       200: { description: Jumlah entri baru per tabel }
 */
router.get("/info", async (req, res, next) => {
  try {
    res.json(await entriesToExport(req.userId));
  } catch (err) { next(err); }
});

/**
 * @openapi
 * /api/export/docx:
 *   get:
 *     tags: [Export]
 *     summary: Unduh DOCX — template resmi terisi (isi lama dipertahankan, entri baru + foto ditambahkan)
 *     responses:
 *       200:
 *         description: Berkas .docx
 *         content:
 *           application/vnd.openxmlformats-officedocument.wordprocessingml.document:
 *             schema: { type: string, format: binary }
 */
router.get("/docx", async (req, res, next) => {
  try {
    const { buffer } = await buildDocx(req.userId);
    res.setHeader("Content-Type",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    res.setHeader("Content-Disposition",
      'attachment; filename="LOGBOOK KEGIATAN DAN KEUANGAN - TERISI.docx"');
    res.send(buffer);
  } catch (err) { next(err); }
});

/**
 * @openapi
 * /api/export/pdf:
 *   get:
 *     tags: [Export]
 *     summary: Unduh PDF — rekap logbook siap cetak (ringkasan, kegiatan + foto, keuangan)
 *     responses:
 *       200:
 *         description: Berkas .pdf
 *         content:
 *           application/pdf:
 *             schema: { type: string, format: binary }
 */
router.get("/pdf", async (req, res, next) => {
  try {
    const buffer = await buildPdf(req.userId);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", 'attachment; filename="LOGBOOK KEGIATAN DAN KEUANGAN.pdf"');
    res.send(buffer);
  } catch (err) { next(err); }
});

/**
 * @openapi
 * /api/export/xlsx:
 *   get:
 *     tags: [Export]
 *     summary: Unduh Excel — rekap kegiatan, keuangan, dan ringkasan
 *     responses:
 *       200:
 *         description: Berkas .xlsx
 *         content:
 *           application/vnd.openxmlformats-officedocument.spreadsheetml.sheet:
 *             schema: { type: string, format: binary }
 */
router.get("/xlsx", async (req, res, next) => {
  try {
    const buffer = await buildXlsx(req.userId);
    res.setHeader("Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", 'attachment; filename="REKAP LOGBOOK.xlsx"');
    res.send(buffer);
  } catch (err) { next(err); }
});

export default router;

