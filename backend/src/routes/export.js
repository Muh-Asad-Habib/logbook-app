import { Router } from "express";
import { buildDocx, entriesToExport } from "../export/docx.js";
import { buildPdf } from "../export/pdf.js";
import { buildXlsx } from "../export/xlsx.js";
import { authRequired, hanyaTim } from "../auth.js";

const router = Router();
router.use(authRequired); // ekspor berisi data milik user yang login
router.use(hanyaTim); // fasilitator tidak punya data untuk diekspor

/** Tanggal unduh, format "04-08-2026" (zona waktu Asia/Makassar). */
function tanggalUnduh() {
  const bagian = new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Makassar", day: "2-digit", month: "2-digit", year: "numeric",
  }).formatToParts(new Date());
  const ambil = (t) => bagian.find((p) => p.type === t)?.value || "";
  return `${ambil("day")}-${ambil("month")}-${ambil("year")}`;
}

/** Buang karakter yang tidak boleh ada di nama berkas (Windows & POSIX). */
const bersihkanNama = (s) =>
  String(s || "").replace(/[\\/:*?"<>|\r\n]+/g, " ").replace(/\s+/g, " ").trim() || "Tim";

/**
 * Pasang header unduhan dengan nama berkas khas tiap tim, mis.
 * "Logbook Tim Alpha - Kegiatan & Keuangan (04-08-2026).docx".
 * `filename` ASCII dipakai peramban lama, `filename*` (RFC 5987) menjaga
 * huruf non-ASCII pada nama tim tetap utuh di peramban modern.
 */
function kirimBerkas(req, res, buffer, { ekstensi, tipe, akhiran = "Kegiatan & Keuangan" }) {
  const nama = `Logbook ${bersihkanNama(req.user?.username)} - ${akhiran} (${tanggalUnduh()}).${ekstensi}`;
  const namaAscii = nama.replace(/[^\x20-\x7E]/g, "_").replace(/"/g, "");
  res.setHeader("Content-Type", tipe);
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${namaAscii}"; filename*=UTF-8''${encodeURIComponent(nama)}`,
  );
  res.send(buffer);
}

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
    kirimBerkas(req, res, buffer, {
      ekstensi: "docx",
      tipe: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
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
    kirimBerkas(req, res, buffer, { ekstensi: "pdf", tipe: "application/pdf" });
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
    kirimBerkas(req, res, buffer, {
      ekstensi: "xlsx",
      tipe: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      akhiran: "Rekap Kegiatan & Keuangan",
    });
  } catch (err) { next(err); }
});

export default router;

