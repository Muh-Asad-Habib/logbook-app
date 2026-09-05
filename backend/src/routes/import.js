import { Router } from "express";
import multer from "multer";
import { importDocx } from "../import/docx.js";
import { authRequired, hanyaTim } from "../auth.js";
import {
  cekPotongan, simpanPotongan, rakitPotongan, bersihkanPotongan,
  ID_RE, validTotal,
} from "../potongan.js";
import {
  pakaiCloud, PART_MAX, izinUnggahIK, infoUnggahIK, metaFileIK, catatFileIK,
  namaBagian, buatStem, tandaInternal, removeFiles, getFileBufferRetry,
} from "../files.js";

/** Jalur lama (byte lewat server) — disamakan dengan laporan (40 MB). */
const MAKS_UKURAN_SERVER = 40 * 1024 * 1024;
/** Jalur langsung ke ImageKit — byte tidak lewat Vercel. */
const MAKS_UKURAN = 300 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAKS_UKURAN_SERVER, files: 1 },
});

const router = Router();
router.use(authRequired); // hasil impor masuk ke akun user yang login
router.use(hanyaTim); // fasilitator tidak boleh mengubah data tim

/* ============ IMPOR LANGSUNG BROWSER → IMAGEKIT (hemat trafik) ============
 * Batas body Vercel ±4,5 MB membuat .docx berfoto tak bisa dikirim utuh.
 * Jalur lama memotongnya jadi base64 2 MB per request — tetap lewat server.
 * Sekarang: browser meminta IZIN (beberapa ratus byte), mengunggah bagian-
 * bagiannya LANGSUNG ke ImageKit, lalu server memverifikasi metadata tiap
 * bagian, menariknya dari CDN, menjalankan impor, dan MENGHAPUS berkas
 * sementaranya. Pola sama dengan laporan/presentasi (teruji diag-*-langsung). */

const STEM_RE = /^[A-Za-z0-9._-]{6,120}$/;
const bersihkanNama = (s) =>
  String(s || "logbook.docx").replace(/[\\/:*?"<>|]/g, "_").trim().slice(0, 120);

/**
 * @openapi
 * /api/import/izin-unggah:
 *   post:
 *     tags: [Import]
 *     summary: Terbitkan izin unggah .docx impor langsung ke ImageKit (byte tidak lewat server)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [ukuran]
 *             properties:
 *               nama: { type: string }
 *               ukuran: { type: integer }
 *     responses:
 *       200: { description: "{ mode: 'langsung'|'server', … }" }
 *       400: { description: Ukuran tidak valid }
 */
router.post("/izin-unggah", async (req, res, next) => {
  try {
    const ukuran = Number(req.body?.ukuran);
    if (!Number.isFinite(ukuran) || ukuran <= 0) {
      return res.status(400).json({ error: "Ukuran berkas tidak valid" });
    }
    if (ukuran > MAKS_UKURAN) {
      return res.status(400).json({ error: "Berkas terlalu besar (maks. 300 MB)" });
    }
    if (!pakaiCloud()) return res.json({ mode: "server", maksServer: MAKS_UKURAN_SERVER });

    const jumlah = Math.max(1, Math.ceil(ukuran / PART_MAX));
    const stem = buatStem("imp");
    const izin = Array.from({ length: jumlah }, () => izinUnggahIK());
    const bagian = Array.from({ length: jumlah }, (_, i) => namaBagian(stem, i, jumlah, ".docx"));
    res.json({
      mode: "langsung",
      ...infoUnggahIK(),
      stem,
      jumlah,
      bagian,
      izin,
      nama: bersihkanNama(req.body?.nama),
      tanda: tandaInternal(`impor|${req.userId}|${stem}|${jumlah}`),
    });
  } catch (err) {
    next(err);
  }
});

/**
 * @openapi
 * /api/import/docx/langsung:
 *   post:
 *     tags: [Import]
 *     summary: Verifikasi bagian yang diunggah browser ke ImageKit, jalankan impor, lalu hapus berkas sementara
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [stem, jumlah, tanda, bagian]
 *             properties:
 *               stem: { type: string }
 *               jumlah: { type: integer }
 *               tanda: { type: string }
 *               bagian:
 *                 type: array
 *                 items: { type: object, properties: { key: { type: string }, fileId: { type: string } } }
 *     responses:
 *       200: { description: Ringkasan hasil impor (sama dengan /api/import/docx) }
 *       400: { description: Verifikasi gagal / berkas tidak valid }
 */
router.post("/docx/langsung", async (req, res, next) => {
  const terdaftar = [];
  try {
    const hasil = await prosesImporLangsung(req, terdaftar);
    // Berkas sementara dibersihkan SEBELUM respons dikirim. Sebelumnya
    // pembersihan berjalan "tembak-lupakan" di blok finally; di serverless
    // Vercel pekerjaan yang belum rampung ketika respons terkirim bisa
    // dihentikan runtime, sehingga potongan .docx sementara tertinggal di
    // ImageKit dan memakan kuota.
    await bersihkanSementara(terdaftar);
    if (hasil.error) return res.status(hasil.status || 400).json({ error: hasil.error });
    res.json(hasil.data);
  } catch (err) {
    await bersihkanSementara(terdaftar);
    next(err);
  }
});

/** Hapus berkas impor sementara; kegagalan tidak boleh menggagalkan respons. */
async function bersihkanSementara(kunci) {
  if (!kunci.length) return;
  const salinan = kunci.splice(0, kunci.length);
  await removeFiles(salinan).catch(() => {});
}

/**
 * Verifikasi bagian unggahan, rakit, lalu jalankan impor.
 * @returns {Promise<{data?: object, error?: string, status?: number}>}
 *   `error` dipakai untuk penolakan yang sudah ramah pengguna (400) — pemanggil
 *   yang mengirim respons agar pembersihan berkas sementara selalu kebagian.
 */
async function prosesImporLangsung(req, terdaftar) {
  if (!pakaiCloud()) return { error: "Mode cloud tidak aktif" };
  const stem = String(req.body?.stem || "");
  const jumlah = Number(req.body?.jumlah);
  const daftar = Array.isArray(req.body?.bagian) ? req.body.bagian : [];
  const tanda = String(req.body?.tanda || "");

  if (!STEM_RE.test(stem) || !Number.isInteger(jumlah) || jumlah < 1 || jumlah > 15) {
    return { error: "Parameter unggahan tidak valid" };
  }
  if (tanda !== tandaInternal(`impor|${req.userId}|${stem}|${jumlah}`)) {
    return { error: "Izin unggah tidak sah — ulangi unggahan" };
  }
  if (daftar.length !== jumlah) {
    return { error: `Bagian tidak lengkap (${daftar.length}/${jumlah})` };
  }

  // Verifikasi ke ImageKit: nama & ukuran tiap bagian, fileId milik akun kita.
  const kunci = [];
  let total = 0;
  for (let i = 0; i < jumlah; i++) {
    const seharusnya = namaBagian(stem, i, jumlah, ".docx");
    const b = daftar.find((x) => String(x?.key) === seharusnya);
    if (!b?.fileId) return { error: `Bagian #${i} tidak ditemukan` };
    const meta = await metaFileIK(String(b.fileId));
    if (!meta || meta.name !== seharusnya) {
      return { error: `Bagian #${i} gagal diverifikasi` };
    }
    const size = Number(meta.size) || 0;
    if (size <= 0 || size > PART_MAX + 1024) {
      return { error: `Ukuran bagian #${i} tidak wajar` };
    }
    total += size;
    await catatFileIK(seharusnya, meta.fileId, meta.url || "");
    terdaftar.push(seharusnya);
    kunci.push(seharusnya);
  }
  if (total <= 0 || total > MAKS_UKURAN) {
    return { error: "Ukuran total berkas tidak wajar" };
  }

  // Tarik tiap bagian dari CDN (dengan retry — propagasi CDN bisa 1–5 dtk), rakit.
  const potongan = [];
  for (const k of kunci) {
    const buf = await getFileBufferRetry(k);
    if (!buf) return { error: "Berkas belum tersedia di penyimpanan — coba lagi" };
    potongan.push(buf);
  }
  const buffer = Buffer.concat(potongan);
  if (!(buffer[0] === 0x50 && buffer[1] === 0x4b)) {
    return { error: "Berkas bukan dokumen Word (.docx) yang valid" };
  }

  try {
    return { data: await importDocx(buffer, req.userId) };
  } catch (e) {
    e.status = 400;
    throw e;
  }
}

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

