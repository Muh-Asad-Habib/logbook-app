/**
 * Laporan Kemajuan (.docx) — SATU file per akun.
 * Unggahan baru selalu MENGGANTI file lama (UPSERT di storage), jadi tidak
 * pernah ada dua laporan tersimpan. File besar diunggah terpotong (chunked)
 * agar lolos batas body ±4,5 MB Vercel — pola yang sama dengan impor DOCX.
 */
import { Router } from "express";
import multer from "multer";
import crypto from "node:crypto";
import * as store from "../storage.js";
import { authRequired, hanyaTim } from "../auth.js";
import { catatAktivitas } from "../aktivitas.js";
import { q } from "../db.js";
import {
  cekPotongan, simpanPotongan, rakitPotongan, bersihkanPotongan,
  ID_RE, validTotal,
} from "../potongan.js";

const MAKS_UKURAN = 40 * 1024 * 1024; // 40 MB — laporan berfoto banyak pun cukup

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAKS_UKURAN, files: 1 },
});

const router = Router();

/* ============ TAUTAN PUBLIK BERUMUR PENDEK (tanpa login) ============
 * Penampil Microsoft Office (view.officeapps.live.com) harus bisa MENGAMBIL
 * berkas dari internet — ia tidak punya token login. Maka dibuat tautan
 * dengan kunci acak 192-bit yang kedaluwarsa 30 menit; selain pemegang
 * tautan (browser pengguna → server Microsoft) tidak ada yang bisa menebak.
 * DIDAFTARKAN SEBELUM authRequired. */
const UMUR_TAUTAN_MS = 30 * 60 * 1000;

router.get("/publik/:kunci", async (req, res, next) => {
  try {
    const kunci = String(req.params.kunci || "");
    if (!/^[a-f0-9]{48}$/.test(kunci)) {
      return res.status(400).json({ error: "kunci tidak valid" });
    }
    const rows = await q(
      "SELECT user_id, exp FROM laporan_links WHERE kunci = $1 AND jenis = 'laporan'",
      [kunci]
    );
    const l = rows[0];
    if (!l || Date.now() > Number(l.exp)) {
      if (l) q("DELETE FROM laporan_links WHERE kunci = $1", [kunci]).catch(() => {});
      return res.status(404).json({ error: "Tautan kedaluwarsa — muat ulang halaman" });
    }
    const lap = await store.getLaporan(l.user_id);
    if (!lap) return res.status(404).json({ error: "Laporan tidak ada" });
    res.setHeader("Content-Type",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(lap.nama)}"`);
    res.setHeader("Cache-Control", "private, no-store");
    res.send(lap.buffer);
  } catch (err) { next(err); }
});

router.use(authRequired);
router.use(hanyaTim); // fasilitator baca laporan lewat /api/fasilitator

/**
 * @openapi
 * /api/laporan/tautan:
 *   post:
 *     tags: [Laporan]
 *     summary: Buat tautan publik sementara (30 menit) untuk penampil Office
 *     responses:
 *       200: { description: "{ url, exp }" }
 *       404: { description: Belum ada laporan }
 */
router.post("/tautan", async (req, res, next) => {
  try {
    const info = await store.infoLaporan(req.userId);
    if (!info.ada) return res.status(404).json({ error: "Belum ada laporan tersimpan" });
    const kunci = crypto.randomBytes(24).toString("hex");
    const exp = Date.now() + UMUR_TAUTAN_MS;
    // satu tautan aktif per user + bersihkan yang kedaluwarsa
    await q(
      `DELETE FROM laporan_links
        WHERE (user_id = $1 AND jenis = 'laporan') OR exp < $2`,
      [req.userId, Date.now()]
    );
    await q(
      "INSERT INTO laporan_links (kunci, user_id, exp, jenis) VALUES ($1, $2, $3, 'laporan')",
      [kunci, req.userId, exp]
    );
    const proto = String(req.headers["x-forwarded-proto"] || req.protocol || "https").split(",")[0].trim();
    const host = String(req.headers["x-forwarded-host"] || req.headers.host || "").split(",")[0].trim();
    res.json({ url: `${proto}://${host}/api/laporan/publik/${kunci}`, exp });
  } catch (err) { next(err); }
});

/** .docx = arsip ZIP → harus berawalan "PK". */
const validDocx = (buf) =>
  buf && buf.length > 4 && buf[0] === 0x50 && buf[1] === 0x4b;

const bersihkanNama = (s) => {
  const nama = String(s || "laporan-kemajuan.docx")
    .replace(/[\\/:*?"<>|]/g, "_").trim().slice(0, 120);
  return nama.toLowerCase().endsWith(".docx") ? nama : `${nama}.docx`;
};

async function simpan(req, res, nama, buffer) {
  if (!validDocx(buffer)) {
    return res.status(400).json({ error: "Berkas bukan dokumen Word (.docx) yang valid" });
  }
  if (buffer.length > MAKS_UKURAN) {
    return res.status(400).json({ error: "Berkas terlalu besar (maks. 40 MB)" });
  }
  const hasil = await store.saveLaporan(req.userId, bersihkanNama(nama), buffer);
  catatAktivitas(req.userId, "laporan.unggah", { nama: hasil.nama, ukuran: hasil.ukuran });
  res.json({ ok: true, ...hasil, catatan: "Laporan lama (bila ada) sudah digantikan" });
}

/**
 * @openapi
 * /api/laporan/info:
 *   get:
 *     tags: [Laporan]
 *     summary: Info laporan kemajuan tersimpan (nama, ukuran, waktu unggah)
 *     responses:
 *       200: { description: "{ ada, nama, ukuran, updated_at }" }
 */
router.get("/info", async (req, res, next) => {
  try {
    res.json(await store.infoLaporan(req.userId));
  } catch (err) { next(err); }
});

/**
 * @openapi
 * /api/laporan/file:
 *   get:
 *     tags: [Laporan]
 *     summary: Unduh/ambil berkas laporan kemajuan (.docx)
 *     responses:
 *       200: { description: Berkas .docx }
 *       404: { description: Belum ada laporan }
 */
router.get("/file", async (req, res, next) => {
  try {
    const l = await store.getLaporan(req.userId);
    if (!l) return res.status(404).json({ error: "Belum ada laporan tersimpan" });
    res.setHeader("Content-Type",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    const unduh = req.query.unduh ? "attachment" : "inline";
    res.setHeader("Content-Disposition",
      `${unduh}; filename="${encodeURIComponent(l.nama)}"`);
    res.setHeader("Cache-Control", "private, no-store");
    res.send(l.buffer);
  } catch (err) { next(err); }
});

/**
 * @openapi
 * /api/laporan:
 *   post:
 *     tags: [Laporan]
 *     summary: Unggah laporan kemajuan (.docx) — menggantikan laporan lama
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [file]
 *             properties:
 *               file: { type: string, format: binary }
 *     responses:
 *       200: { description: Tersimpan (file lama digantikan) }
 *       400: { description: Berkas tidak valid }
 *   delete:
 *     tags: [Laporan]
 *     summary: Hapus laporan kemajuan tersimpan
 *     responses:
 *       200: { description: Terhapus }
 */
router.post("/", upload.single("file"), async (req, res, next) => {
  try {
    if (!req.file?.buffer) return res.status(400).json({ error: "Pilih berkas .docx dahulu" });
    await simpan(req, res, req.file.originalname, req.file.buffer);
  } catch (err) { next(err); }
});

router.delete("/", async (req, res, next) => {
  try {
    const ada = await store.deleteLaporan(req.userId);
    if (!ada) return res.status(404).json({ error: "Belum ada laporan tersimpan" });
    catatAktivitas(req.userId, "laporan.hapus", {});
    res.json({ ok: true });
  } catch (err) { next(err); }
});

/* ============ unggah terpotong (file > ±3 MB) ============
 * Biner potongan ke IMAGEKIT, Neon hanya katalog kunci — lihat src/potongan.js. */
router.post("/chunk", async (req, res, next) => {
  try {
    const { id, idx, data } = req.body || {};
    const salah = cekPotongan(id, idx, data);
    if (salah) return res.status(400).json({ error: salah });
    await simpanPotongan(String(id), Number(idx), req.userId, data);
    res.json({ ok: true, idx: Number(idx) });
  } catch (err) { next(err); }
});

router.post("/selesai", async (req, res, next) => {
  const id = String(req.body?.id || "");
  try {
    const total = Number(req.body?.total);
    if (!ID_RE.test(id) || !validTotal(total)) {
      return res.status(400).json({ error: "id/total tidak valid" });
    }
    const buffer = await rakitPotongan(id, req.userId, total);
    await simpan(req, res, req.body?.nama, buffer);
  } catch (err) {
    bersihkanPotongan(id, req.userId).catch(() => {});
    next(err);
  }
});

export default router;

