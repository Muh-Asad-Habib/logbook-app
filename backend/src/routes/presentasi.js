/**
 * Presentasi tim — SATU berkas PowerPoint (.pptx) + SATU tautan Canva per akun.
 *
 * HEMAT TRAFIK SERVER (Vercel):
 * - Unggah  : browser mengunggah bagian-bagian berkas LANGSUNG ke ImageKit
 *             memakai "izin" (token+expire+signature) yang diterbitkan
 *             /izin-unggah — beberapa ratus byte. Server lalu memverifikasi
 *             hasilnya lewat API metadata ImageKit di /daftarkan. Byte berkas
 *             TIDAK pernah melewati server. (Dulu: naik terpotong → turun untuk
 *             dirakit → naik lagi = ±4× ukuran berkas lewat Vercel.)
 * - Tampil  : /file & /publik/:kunci me-REDIRECT (302) ke signed URL ImageKit,
 *             jadi browser/penampil Office menarik berkas dari CDN, bukan dari
 *             server kita. Berkas multi-bagian dilayani /file/bagian (daftar
 *             signed URL) lalu dirakit di browser.
 * - Fallback: mode lokal (tanpa env IMAGEKIT_*) tetap memakai jalur lama
 *             (multer + unggah terpotong) supaya pengembangan di laptop jalan.
 *
 * Tautan Canva: hanya PRATINJAU (di-embed), tidak diunduh. Tautan share apa pun
 * (canva.com/design/…) otomatis dinormalisasi ke bentuk `/view?embed`.
 * Keduanya boleh ada bersamaan dan punya endpoint hapus masing-masing.
 */
import { Router } from "express";
import multer from "multer";
import crypto from "node:crypto";
import * as store from "../storage.js";
import { authRequired, hanyaTim } from "../auth.js";
import { asalPublik } from "../config.js";
import { catatAktivitas } from "../aktivitas.js";
import { q } from "../db.js";
import {
  cekPotongan, simpanPotongan, rakitPotongan, bersihkanPotongan,
  ID_RE, validTotal,
} from "../potongan.js";
import {
  pakaiCloud, signedUrl, signedUrlBagian, PART_MAX,
  izinUnggahIK, infoUnggahIK, metaFileIK, catatFileIK,
  kunciUnggahan, namaBagian, buatStem, tandaInternal, removeFiles,
} from "../files.js";

const MAKS_UKURAN = 300 * 1024 * 1024; // 300 MB — deck berfoto resolusi tinggi pun muat
/** Jalur lama (byte lewat server) tetap dibatasi agar Vercel tidak kewalahan. */
const MAKS_UKURAN_SERVER = 100 * 1024 * 1024;

const MIME_PPTX =
  "application/vnd.openxmlformats-officedocument.presentationml.presentation";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAKS_UKURAN_SERVER, files: 1 },
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

    // HEMAT TRAFIK: berkas satu-kunci di cloud cukup di-redirect ke CDN —
    // Microsoft menarik berkasnya langsung dari ImageKit, bukan dari server
    // kita. Penampil Office tetap yang merender (mesin & byte-nya sama
    // persis), jadi hasil tampilannya tidak berubah; hanya sumber unduhnya
    // yang pindah. Kunci satu-bagian sengaja berekstensi .pptx agar CDN
    // mengirim content-type yang benar.
    const meta = await store.metaPresentasi(l.user_id);
    if (!meta) return res.status(404).json({ error: "Presentasi tidak ada" });
    if (pakaiCloud() && !String(meta.file_key).startsWith("multi:")) {
      return res.redirect(302, signedUrl(meta.file_key, 3600));
    }

    // Sisanya (mode lokal / berkas multi-bagian) tetap dilayani server.
    const p = await store.getPresentasi(l.user_id);
    if (!p) return res.status(404).json({ error: "Presentasi tidak ada" });
    res.setHeader("Content-Type", MIME_PPTX);
    res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(p.nama)}"`);
    res.setHeader("Cache-Control", "private, no-store");
    res.send(p.buffer);
  } catch (err) { next(err); }
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
    res.json({ url: `${asalPublik(req)}/api/presentasi/publik/${kunci}`, exp });
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
  if (buffer.length > MAKS_UKURAN_SERVER) {
    return res.status(400).json({ error: "Berkas terlalu besar untuk jalur ini (maks. 100 MB)" });
  }
  const hasil = await store.savePresentasi(req.userId, bersihkanNama(nama), buffer);
  catatAktivitas(req.userId, "presentasi.unggah", { nama: hasil.nama, ukuran: hasil.ukuran });
  res.json({ ok: true, ...hasil, catatan: "Berkas presentasi lama (bila ada) sudah digantikan" });
}

/* ============ UNGGAH LANGSUNG BROWSER → IMAGEKIT (hemat trafik) ============ */

const STEM_RE = /^[A-Za-z0-9._-]{6,120}$/;

/**
 * @openapi
 * /api/presentasi/izin-unggah:
 *   post:
 *     tags: [Presentasi]
 *     summary: Terbitkan izin unggah langsung ke ImageKit (byte tidak lewat server)
 *     responses:
 *       200: { description: "{ mode: 'langsung'|'server', … }" }
 *       400: { description: Nama/ukuran tidak valid }
 */
router.post("/izin-unggah", async (req, res, next) => {
  try {
    const nama = bersihkanNama(req.body?.nama);
    const ukuran = Number(req.body?.ukuran);
    if (!Number.isFinite(ukuran) || ukuran <= 0) {
      return res.status(400).json({ error: "Ukuran berkas tidak valid" });
    }
    if (ukuran > MAKS_UKURAN) {
      return res.status(400).json({ error: "Berkas terlalu besar (maks. 300 MB)" });
    }
    // Mode lokal (tanpa ImageKit): pakai jalur lama lewat server.
    if (!pakaiCloud()) return res.json({ mode: "server", maksServer: MAKS_UKURAN_SERVER });

    const jumlah = Math.max(1, Math.ceil(ukuran / PART_MAX));
    const stem = buatStem("ppt");
    const dasar = infoUnggahIK();
    // Satu izin per bagian: token ImageKit hanya boleh dipakai sekali.
    const izin = Array.from({ length: jumlah }, () => izinUnggahIK());
    const bagian = Array.from({ length: jumlah }, (_, i) => namaBagian(stem, i, jumlah, ".pptx"));
    res.json({
      mode: "langsung",
      ...dasar,
      stem,
      jumlah,
      bagian,
      izin,
      nama,
      // Titipan bertanda tangan — diverifikasi ulang saat /daftarkan.
      tanda: tandaInternal(`${req.userId}|${stem}|${jumlah}`),
    });
  } catch (err) { next(err); }
});

/**
 * @openapi
 * /api/presentasi/daftarkan:
 *   post:
 *     tags: [Presentasi]
 *     summary: Catat berkas yang sudah diunggah browser ke ImageKit (diverifikasi)
 *     responses:
 *       200: { description: Tersimpan (berkas lama digantikan) }
 *       400: { description: Verifikasi gagal }
 */
router.post("/daftarkan", async (req, res, next) => {
  const terdaftar = [];
  try {
    if (!pakaiCloud()) return res.status(400).json({ error: "Mode cloud tidak aktif" });
    const nama = bersihkanNama(req.body?.nama);
    const stem = String(req.body?.stem || "");
    const jumlah = Number(req.body?.jumlah);
    const daftar = Array.isArray(req.body?.bagian) ? req.body.bagian : [];
    const tanda = String(req.body?.tanda || "");

    if (!STEM_RE.test(stem) || !Number.isInteger(jumlah) || jumlah < 1 || jumlah > 40) {
      return res.status(400).json({ error: "Parameter unggahan tidak valid" });
    }
    if (tanda !== tandaInternal(`${req.userId}|${stem}|${jumlah}`)) {
      return res.status(400).json({ error: "Izin unggah tidak sah — ulangi unggahan" });
    }
    if (daftar.length !== jumlah) {
      return res.status(400).json({ error: `Bagian tidak lengkap (${daftar.length}/${jumlah})` });
    }

    // VERIFIKASI ke ImageKit: nama & ukuran tiap bagian harus cocok, dan
    // fileId-nya memang milik akun kita (respons metadata hanya ±300 byte).
    let total = 0;
    for (let i = 0; i < jumlah; i++) {
      const kunciSeharusnya = namaBagian(stem, i, jumlah, ".pptx");
      const b = daftar.find((x) => String(x?.key) === kunciSeharusnya);
      if (!b?.fileId) {
        return res.status(400).json({ error: `Bagian #${i} tidak ditemukan` });
      }
      const meta = await metaFileIK(String(b.fileId));
      if (!meta || meta.name !== kunciSeharusnya) {
        return res.status(400).json({ error: `Bagian #${i} gagal diverifikasi` });
      }
      const size = Number(meta.size) || 0;
      if (size <= 0 || size > PART_MAX + 1024) {
        return res.status(400).json({ error: `Ukuran bagian #${i} tidak wajar` });
      }
      total += size;
      await catatFileIK(kunciSeharusnya, meta.fileId, meta.url || "");
      terdaftar.push(kunciSeharusnya);
    }
    if (total <= 0 || total > MAKS_UKURAN) {
      return res.status(400).json({ error: "Ukuran total berkas tidak wajar" });
    }

    const fileKey = kunciUnggahan(stem, jumlah, ".pptx");
    const hasil = await store.daftarkanPresentasi(req.userId, nama, total, fileKey);
    catatAktivitas(req.userId, "presentasi.unggah", { nama: hasil.nama, ukuran: hasil.ukuran });
    res.json({ ok: true, ...hasil, catatan: "Berkas presentasi lama (bila ada) sudah digantikan" });
  } catch (err) {
    removeFiles(terdaftar).catch(() => {}); // jangan tinggalkan bagian yatim
    next(err);
  }
});

/**
 * @openapi
 * /api/presentasi/file/bagian:
 *   get:
 *     tags: [Presentasi]
 *     summary: Daftar signed URL bagian berkas (dirakit di browser, hemat trafik)
 *     responses:
 *       200: { description: "{ nama, ukuran, urls: [] }" }
 *       404: { description: Belum ada berkas / mode lokal }
 */
router.get("/file/bagian", async (req, res, next) => {
  try {
    const meta = await store.metaPresentasi(req.userId);
    if (!meta) return res.status(404).json({ error: "Belum ada berkas presentasi" });
    if (!pakaiCloud()) return res.status(404).json({ error: "Mode lokal — pakai /file" });
    res.json({
      nama: meta.nama,
      ukuran: meta.ukuran,
      urls: signedUrlBagian(meta.file_key, 3600),
    });
  } catch (err) { next(err); }
});

/**
 * @openapi
 * /api/presentasi/file:
 *   get:
 *     tags: [Presentasi]
 *     summary: Unduh/ambil berkas presentasi (.pptx)
 *     responses:
 *       200: { description: Berkas .pptx }
 *       302: { description: Redirect ke CDN (mode cloud, berkas satu bagian) }
 *       404: { description: Belum ada berkas }
 *   delete:
 *     tags: [Presentasi]
 *     summary: Hapus berkas presentasi (.pptx) — tautan Canva tetap tersimpan
 *     responses:
 *       200: { description: Terhapus }
 */
router.get("/file", async (req, res, next) => {
  try {
    // HEMAT TRAFIK: berkas satu-kunci → biarkan CDN yang mengirim byte-nya.
    const meta = await store.metaPresentasi(req.userId);
    if (!meta) return res.status(404).json({ error: "Belum ada berkas presentasi" });
    if (pakaiCloud() && !String(meta.file_key).startsWith("multi:")) {
      return res.redirect(302, signedUrl(meta.file_key, 3600));
    }
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

