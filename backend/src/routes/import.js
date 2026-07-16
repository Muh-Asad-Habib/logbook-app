import { Router } from "express";
import multer from "multer";
import { importDocx } from "../import/docx.js";
import { authRequired } from "../auth.js";
import { q } from "../db.js";

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

/* ================= Impor terpotong (chunked) =================
 * Di Vercel, satu request dibatasi ±4,5 MB — .docx berisi banyak foto
 * jauh melampaui itu (dulu langsung 413). Solusi: browser memotong file
 * jadi potongan ±2 MB (base64) → tiap potongan disimpan di tabel
 * import_chunks → /selesai merakit kembali & menjalankan impor.
 */
const CHUNK_MAX_B64 = 3.5 * 1024 * 1024; // ± 2,6 MB biner per potongan
const CHUNK_MAX_IDX = 60;                // maks ± 150 MB total — jauh dari cukup
const ID_RE = /^[a-z0-9-]{8,64}$/;

/** Buang sisa unggahan yang terbengkalai (> 1 jam). ISO string → lexicographic aman. */
function bersihkanKedaluwarsa() {
  const batas = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  q("DELETE FROM import_chunks WHERE created_at < $1", [batas]).catch(() => {});
}

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
    const i = Number(idx);
    if (!ID_RE.test(String(id || "")) || !Number.isInteger(i) || i < 0 || i > CHUNK_MAX_IDX) {
      return res.status(400).json({ error: "id/idx potongan tidak valid" });
    }
    if (typeof data !== "string" || !data || data.length > CHUNK_MAX_B64 ||
        !/^[A-Za-z0-9+/=]+$/.test(data)) {
      return res.status(400).json({ error: "data potongan tidak valid (harus base64 ≤ 3,5 MB)" });
    }
    await q(
      `INSERT INTO import_chunks (id, idx, user_id, data, created_at)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id, idx) DO UPDATE SET data = EXCLUDED.data,
         user_id = EXCLUDED.user_id, created_at = EXCLUDED.created_at`,
      [id, i, req.userId, data, new Date().toISOString()]
    );
    if (i === 0) bersihkanKedaluwarsa();
    res.json({ ok: true, idx: i });
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
    if (!ID_RE.test(id) || !Number.isInteger(total) || total < 1 || total > CHUNK_MAX_IDX + 1) {
      return res.status(400).json({ error: "id/total tidak valid" });
    }
    const rows = await q(
      "SELECT idx, data FROM import_chunks WHERE id = $1 AND user_id = $2 ORDER BY idx",
      [id, req.userId]
    );
    if (rows.length !== total) {
      return res.status(400).json({
        error: `Potongan tidak lengkap (${rows.length}/${total}) — coba unggah ulang`,
      });
    }
    const buffer = Buffer.concat(rows.map((r) => Buffer.from(r.data, "base64")));
    await q("DELETE FROM import_chunks WHERE id = $1 AND user_id = $2", [id, req.userId]);
    res.json(await importDocx(buffer, req.userId));
  } catch (err) {
    q("DELETE FROM import_chunks WHERE id = $1 AND user_id = $2", [id, req.userId])
      .catch(() => {});
    err.status = 400;
    next(err);
  }
});

export default router;

