/**
 * Presentasi tim — SATU berkas PowerPoint (.pptx) + SATU tautan Canva per akun.
 *
 * - Berkas .pptx: unggahan baru selalu MENGGANTI yang lama (UPSERT), file besar
 *   dikirim terpotong (chunked) agar lolos batas body ±4,5 MB Vercel — pola
 *   yang sama dengan laporan kemajuan & impor DOCX.
 * - Tautan Canva: hanya PRATINJAU (di-embed), tidak diunduh. Tautan share apa
 *   pun (canva.com/design/…) otomatis dinormalisasi ke bentuk `/view?embed`.
 * - Keduanya boleh ada bersamaan dan punya endpoint hapus masing-masing.
 */
import { Router } from "express";
import multer from "multer";
import crypto from "node:crypto";
import * as store from "../storage.js";
import { authRequired, hanyaTim } from "../auth.js";
import { catatAktivitas } from "../aktivitas.js";
import { q } from "../db.js";
import { prosesPptxCanva } from "../export/pptx-canva.js";
import {
  canvaSiap, mulaiOAuth, selesaikanOAuth, statusKoneksi, putuskanKoneksi,
  eksporPptx, idDesainDariUrl,
} from "../canva.js";

const MAKS_UKURAN = 60 * 1024 * 1024; // 60 MB — deck Canva berfoto resolusi tinggi pun muat

const MIME_PPTX =
  "application/vnd.openxmlformats-officedocument.presentationml.presentation";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAKS_UKURAN, files: 1 },
});

const router = Router();

/* ============ TAUTAN PUBLIK BERUMUR PENDEK (tanpa login) ============
 * Penampil Microsoft Office (view.officeapps.live.com) harus bisa MENGAMBIL
 * berkas dari internet — ia tidak punya token login. Sama seperti laporan:
 * kunci acak 192-bit, kedaluwarsa 30 menit. Baris disimpan di tabel
 * laporan_links dengan jenis = 'presentasi'.
 * DIDAFTARKAN SEBELUM authRequired. */
const UMUR_TAUTAN_MS = 30 * 60 * 1000;

router.get("/publik/:kunci", async (req, res, next) => {
  try {
    const kunci = String(req.params.kunci || "");
    if (!/^[a-f0-9]{48}$/.test(kunci)) {
      return res.status(400).json({ error: "kunci tidak valid" });
    }
    const rows = await q(
      "SELECT user_id, exp FROM laporan_links WHERE kunci = $1 AND jenis = 'presentasi'",
      [kunci]
    );
    const l = rows[0];
    if (!l || Date.now() > Number(l.exp)) {
      if (l) q("DELETE FROM laporan_links WHERE kunci = $1", [kunci]).catch(() => {});
      return res.status(404).json({ error: "Tautan kedaluwarsa — muat ulang halaman" });
    }
    const p = await store.getPresentasi(l.user_id);
    if (!p) return res.status(404).json({ error: "Presentasi tidak ada" });
    res.setHeader("Content-Type", MIME_PPTX);
    res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(p.nama)}"`);
    res.setHeader("Cache-Control", "private, no-store");
    res.send(p.buffer);
  } catch (err) { next(err); }
});

/** URL dasar aplikasi dilihat dari request (dukung proxy/tunnel/Vercel). */
function urlDasar(req) {
  const proto = String(req.headers["x-forwarded-proto"] || req.protocol || "https").split(",")[0].trim();
  const host = String(req.headers["x-forwarded-host"] || req.headers.host || "").split(",")[0].trim();
  return `${proto}://${host}`;
}
const redirectUriCanva = (req) => `${urlDasar(req)}/api/presentasi/canva-connect/callback`;

/* ---- Callback OAuth Canva — DIPANGGIL BROWSER dari halaman izin Canva,
 *      tidak membawa token login → didaftarkan SEBELUM authRequired.
 *      Identitas pengguna diikat lewat `state` acak yang tersimpan di DB. ---- */
router.get("/canva-connect/callback", async (req, res) => {
  const kembali = (qs) => res.redirect(`/presentasi?${qs}`);
  try {
    const { code, state, error } = req.query;
    if (error) return kembali(`canva=gagal&pesan=${encodeURIComponent(String(error))}`);
    if (!code || !state) return kembali("canva=gagal&pesan=parameter%20kurang");
    const userId = await selesaikanOAuth(String(state), String(code), redirectUriCanva(req));
    catatAktivitas(userId, "presentasi.canva-connect", {});
    return kembali("canva=terhubung");
  } catch (err) {
    return kembali(`canva=gagal&pesan=${encodeURIComponent(err.message || "gagal")}`);
  }
});

router.use(authRequired);
router.use(hanyaTim); // pendamping membaca lewat /api/fasilitator

/**
 * @openapi
 * /api/presentasi/info:
 *   get:
 *     tags: [Presentasi]
 *     summary: Info presentasi tersimpan (berkas .pptx & tautan Canva)
 *     responses:
 *       200: { description: "{ ada, file: {…}, canva: {…} }" }
 */
router.get("/info", async (req, res, next) => {
  try {
    res.json(await store.infoPresentasi(req.userId));
  } catch (err) { next(err); }
});

/**
 * @openapi
 * /api/presentasi/tautan:
 *   post:
 *     tags: [Presentasi]
 *     summary: Buat tautan publik sementara (30 menit) untuk penampil Office
 *     responses:
 *       200: { description: "{ url, exp }" }
 *       404: { description: Belum ada berkas .pptx }
 */
router.post("/tautan", async (req, res, next) => {
  try {
    const info = await store.infoPresentasi(req.userId);
    if (!info.file.ada) {
      return res.status(404).json({ error: "Belum ada berkas presentasi tersimpan" });
    }
    const kunci = crypto.randomBytes(24).toString("hex");
    const exp = Date.now() + UMUR_TAUTAN_MS;
    await q(
      `DELETE FROM laporan_links
        WHERE (user_id = $1 AND jenis = 'presentasi') OR exp < $2`,
      [req.userId, Date.now()]
    );
    await q(
      "INSERT INTO laporan_links (kunci, user_id, exp, jenis) VALUES ($1, $2, $3, 'presentasi')",
      [kunci, req.userId, exp]
    );
    const proto = String(req.headers["x-forwarded-proto"] || req.protocol || "https").split(",")[0].trim();
    const host = String(req.headers["x-forwarded-host"] || req.headers.host || "").split(",")[0].trim();
    res.json({ url: `${proto}://${host}/api/presentasi/publik/${kunci}`, exp });
  } catch (err) { next(err); }
});

/** .pptx = arsip ZIP → harus berawalan "PK". */
const validPptx = (buf) =>
  buf && buf.length > 4 && buf[0] === 0x50 && buf[1] === 0x4b;

const bersihkanNama = (s) => {
  const nama = String(s || "presentasi.pptx")
    .replace(/[\\/:*?"<>|]/g, "_").trim().slice(0, 120);
  return nama.toLowerCase().endsWith(".pptx") ? nama : `${nama}.pptx`;
};

async function simpan(req, res, nama, buffer) {
  if (!validPptx(buffer)) {
    return res.status(400).json({ error: "Berkas bukan PowerPoint (.pptx) yang valid" });
  }
  if (buffer.length > MAKS_UKURAN) {
    return res.status(400).json({ error: "Berkas terlalu besar (maks. 60 MB)" });
  }
  const hasil = await store.savePresentasi(req.userId, bersihkanNama(nama), buffer);
  catatAktivitas(req.userId, "presentasi.unggah", { nama: hasil.nama, ukuran: hasil.ukuran });
  res.json({ ok: true, ...hasil, catatan: "Berkas presentasi lama (bila ada) sudah digantikan" });
}

/**
 * @openapi
 * /api/presentasi/file:
 *   get:
 *     tags: [Presentasi]
 *     summary: Unduh/ambil berkas presentasi (.pptx)
 *     responses:
 *       200: { description: Berkas .pptx }
 *       404: { description: Belum ada berkas }
 *   delete:
 *     tags: [Presentasi]
 *     summary: Hapus berkas presentasi (.pptx) — tautan Canva tetap tersimpan
 *     responses:
 *       200: { description: Terhapus }
 */
router.get("/file", async (req, res, next) => {
  try {
    const p = await store.getPresentasi(req.userId);
    if (!p) return res.status(404).json({ error: "Belum ada berkas presentasi" });
    res.setHeader("Content-Type", MIME_PPTX);
    const unduh = req.query.unduh ? "attachment" : "inline";
    res.setHeader("Content-Disposition", `${unduh}; filename="${encodeURIComponent(p.nama)}"`);
    res.setHeader("Cache-Control", "private, no-store");
    res.send(p.buffer);
  } catch (err) { next(err); }
});

router.delete("/file", async (req, res, next) => {
  try {
    const ada = await store.deletePresentasiFile(req.userId);
    if (!ada) return res.status(404).json({ error: "Belum ada berkas presentasi" });
    catatAktivitas(req.userId, "presentasi.hapus-file", {});
    res.json({ ok: true });
  } catch (err) { next(err); }
});

/**
 * @openapi
 * /api/presentasi:
 *   post:
 *     tags: [Presentasi]
 *     summary: Unggah presentasi (.pptx) — menggantikan berkas lama
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
 *       200: { description: Tersimpan (berkas lama digantikan) }
 *       400: { description: Berkas tidak valid }
 */
router.post("/", upload.single("file"), async (req, res, next) => {
  try {
    if (!req.file?.buffer) return res.status(400).json({ error: "Pilih berkas .pptx dahulu" });
    await simpan(req, res, req.file.originalname, req.file.buffer);
  } catch (err) { next(err); }
});

/**
 * @openapi
 * /api/presentasi/canva:
 *   post:
 *     tags: [Presentasi]
 *     summary: Simpan tautan Canva (dinormalisasi ke bentuk embed, hanya pratinjau)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [url]
 *             properties:
 *               url: { type: string, example: "https://www.canva.com/design/DAF.../view?utm_content=..." }
 *     responses:
 *       200: { description: Tautan tersimpan }
 *       400: { description: Bukan tautan Canva yang sah }
 *   delete:
 *     tags: [Presentasi]
 *     summary: Hapus tautan Canva — berkas .pptx tetap tersimpan
 *     responses:
 *       200: { description: Terhapus }
 */
router.post("/canva", async (req, res, next) => {
  try {
    const url = String(req.body?.url || "").slice(0, 500);
    const hasil = await store.setCanvaPresentasi(req.userId, url);
    if (!hasil) {
      return res.status(400).json({
        error: "Tautan Canva tidak dikenali — salin dari tombol Bagikan (contoh: https://www.canva.com/design/XXXX/YYYY/view atau https://canva.link/xxxx)",
      });
    }
    catatAktivitas(req.userId, "presentasi.canva", { url: hasil.url });
    res.json({ ok: true, ...hasil });
  } catch (err) { next(err); }
});

router.delete("/canva", async (req, res, next) => {
  try {
    const ada = await store.deleteCanvaPresentasi(req.userId);
    if (!ada) return res.status(404).json({ error: "Belum ada tautan Canva" });
    catatAktivitas(req.userId, "presentasi.hapus-canva", {});
    res.json({ ok: true });
  } catch (err) { next(err); }
});

/* ============ Konversi Canva → PPTX "sama persis" (font tertanam) ============
 * Pipeline: PPTX ekspor Canva → pindai font → unduh dari Google Fonts →
 * TANAM ke dalam file → simpan sebagai presentasi tim + laporan hasil.
 * Semua teks/grup tetap bisa diedit; hanya font yang ditambahkan.
 * Dua jalur masuk: unggah berkas PPTX, atau otomatis dari tautan Canva
 * tersimpan (butuh akun Canva terhubung — lihat /canva-connect). */

async function konversiDanSimpan(req, res, namaAsal, buffer) {
  if (!validPptx(buffer)) {
    return res.status(400).json({ error: "Berkas bukan PowerPoint (.pptx) yang valid" });
  }
  if (buffer.length > MAKS_UKURAN) {
    return res.status(400).json({ error: "Berkas terlalu besar (maks. 60 MB)" });
  }
  const { buffer: hasil, laporan } = await prosesPptxCanva(buffer);
  if (hasil.length > MAKS_UKURAN) {
    return res.status(400).json({
      error: "Hasil konversi melebihi 60 MB — kurangi jumlah font/isi desain",
    });
  }
  const nama = bersihkanNama(
    String(namaAsal || "presentasi").replace(/\.pptx$/i, "") + " (font tertanam).pptx"
  );
  const tersimpan = await store.savePresentasi(req.userId, nama, hasil);
  catatAktivitas(req.userId, "presentasi.konversi", {
    nama, ukuran: hasil.length,
    fontTertanam: laporan.fonts.filter((f) => f.status === "tertanam").length,
  });
  res.json({
    ok: true, ...tersimpan, laporan,
    catatan: "Hasil konversi tersimpan sebagai berkas presentasi (menggantikan yang lama)",
  });
}

/**
 * @openapi
 * /api/presentasi/konversi:
 *   post:
 *     tags: [Presentasi]
 *     summary: Konversi PPTX ekspor Canva → font Google ditanam agar tampil sama persis
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
 *       200: { description: "{ ok, nama, ukuran, laporan: { fonts, raster, … } }" }
 *       400: { description: Berkas tidak valid }
 */
router.post("/konversi", upload.single("file"), async (req, res, next) => {
  try {
    if (!req.file?.buffer) return res.status(400).json({ error: "Pilih berkas .pptx dahulu" });
    await konversiDanSimpan(req, res, req.file.originalname, req.file.buffer);
  } catch (err) { next(err); }
});

/** Perakit potongan untuk berkas konversi > ±3 MB (tabel import_chunks). */
router.post("/konversi-selesai", async (req, res, next) => {
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
    await konversiDanSimpan(req, res, req.body?.nama, buffer);
  } catch (err) {
    q("DELETE FROM import_chunks WHERE id = $1 AND user_id = $2", [id, req.userId])
      .catch(() => {});
    next(err);
  }
});

/**
 * @openapi
 * /api/presentasi/konversi-link:
 *   post:
 *     tags: [Presentasi]
 *     summary: Ekspor desain dari tautan Canva tersimpan lalu konversi (font tertanam)
 *     responses:
 *       200: { description: "{ ok, nama, ukuran, laporan }" }
 *       401: { description: Akun Canva belum terhubung }
 *       404: { description: Belum ada tautan Canva tersimpan }
 */
router.post("/konversi-link", async (req, res, next) => {
  try {
    if (!canvaSiap()) {
      return res.status(503).json({
        error: "Integrasi Canva belum disetel di server (CANVA_CLIENT_ID/SECRET) — pakai jalur unggah .pptx",
      });
    }
    // tautan dari body ATAU tautan Canva yang sudah tersimpan
    const info = await store.infoPresentasi(req.userId);
    const url = String(req.body?.url || "") || (info.canva.ada ? info.canva.url : "");
    const designId = idDesainDariUrl(url);
    if (!designId) {
      return res.status(404).json({
        error: "Belum ada tautan Canva tersimpan — simpan tautan desain dahulu",
      });
    }
    const buffer = await eksporPptx(req.userId, designId);
    await konversiDanSimpan(req, res, `canva-${designId}`, buffer);
  } catch (err) { next(err); }
});

/* ---- Hubungkan / putuskan akun Canva (OAuth Connect API) ---- */
router.get("/canva-connect/status", async (req, res, next) => {
  try {
    res.json(await statusKoneksi(req.userId));
  } catch (err) { next(err); }
});

router.get("/canva-connect/mulai", async (req, res, next) => {
  try {
    if (!canvaSiap()) {
      return res.status(503).json({
        error: "Integrasi Canva belum disetel di server — lihat README bagian Canva Connect",
      });
    }
    res.json({ url: await mulaiOAuth(req.userId, redirectUriCanva(req)) });
  } catch (err) { next(err); }
});

router.delete("/canva-connect", async (req, res, next) => {
  try {
    const ada = await putuskanKoneksi(req.userId);
    if (!ada) return res.status(404).json({ error: "Akun Canva belum terhubung" });
    catatAktivitas(req.userId, "presentasi.canva-disconnect", {});
    res.json({ ok: true });
  } catch (err) { next(err); }
});

/* ============ unggah terpotong (file > ±3 MB) ============
 * Memakai tabel import_chunks yang sama dengan impor DOCX & laporan
 * (id unggahan berbeda, terikat user_id, dibersihkan otomatis). */
const CHUNK_MAX_B64 = 3.5 * 1024 * 1024;
const CHUNK_MAX_IDX = 60;
const ID_RE = /^[a-z0-9-]{8,64}$/;

router.post("/chunk", async (req, res, next) => {
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
    res.json({ ok: true, idx: i });
  } catch (err) { next(err); }
});

router.post("/selesai", async (req, res, next) => {
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
    await simpan(req, res, req.body?.nama, buffer);
  } catch (err) {
    q("DELETE FROM import_chunks WHERE id = $1 AND user_id = $2", [id, req.userId])
      .catch(() => {});
    next(err);
  }
});

export default router;

