import { Router } from "express";
import crypto from "node:crypto";
import { buildDocx, entriesToExport } from "../export/docx.js";
import { buildDocxKeuangan } from "../export/keuangan-docx.js";
import { buildPdf } from "../export/pdf.js";
import { buildXlsx } from "../export/xlsx.js";
import { authRequired, hanyaTim } from "../auth.js";
import { pakaiCloud, putFileEkspor, signedUrl, removeFiles, adaFile } from "../files.js";
import * as store from "../storage.js";

const router = Router();
router.use(authRequired); // ekspor berisi data milik user yang login
router.use(hanyaTim); // fasilitator tidak punya data untuk diekspor

/**
 * Versi penyusun dokumen — naikkan bila tata letak/isi ekspor berubah supaya
 * cache hasil ekspor (lihat sidikJariData) tidak menyajikan berkas lama.
 */
const VERSI_EKSPOR = "2026-09-04a";

/**
 * Sidik jari SELURUH data yang mempengaruhi isi berkas ekspor: tiap entri
 * kegiatan & keuangan (semua kolom yang tercetak + kunci foto), dana, nama tim,
 * dan versi penyusun. Bila sidik jari sama dengan ekspor sebelumnya, berkas di
 * CDN masih mutakhir → tidak perlu mengunduh ratusan foto & membangun ulang.
 */
async function sidikJariData(req) {
  const [keg, keu, dana] = await Promise.all([
    store.listKegiatan(req.userId),
    store.listKeuangan(req.userId),
    store.hitungDana(req.userId),
  ]);
  const h = crypto.createHash("sha256");
  h.update(VERSI_EKSPOR).update("|").update(String(req.user?.username || ""));
  h.update(JSON.stringify(dana));
  for (const e of keg) {
    h.update(JSON.stringify([e.id, e.tanggal, e.kegiatan, e.capaian_delta, e.waktu_menit, e.foto_keys]));
  }
  for (const e of keu) {
    h.update(JSON.stringify([e.id, e.tanggal, e.item, e.harga_satuan, e.satuan_suffix, e.jumlah,
      e.kode_unik, e.total, e.sumber, e.kategori, e.bukti_keys]));
  }
  return h.digest("hex").slice(0, 32);
}

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

const MIME_DOCX =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const MIME_XLSX =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/**
 * Katalog jenis ekspor. `ekstensi` sengaja dipisah dari kunci karena satu
 * ekstensi bisa dipakai beberapa jenis (mis. `docx` gabungan & `keuangan-docx`
 * khusus keuangan).
 */
const JENIS = {
  docx: {
    ekstensi: "docx",
    akhiran: "Kegiatan & Keuangan",
    tipe: MIME_DOCX,
    buat: async (req) => (await buildDocx(req.userId)).buffer,
  },
  pdf: {
    ekstensi: "pdf",
    akhiran: "Kegiatan & Keuangan",
    tipe: "application/pdf",
    buat: (req) => buildPdf(req.userId, bersihkanNama(req.user?.username)),
  },
  xlsx: {
    ekstensi: "xlsx",
    akhiran: "Rekap Kegiatan & Keuangan",
    tipe: MIME_XLSX,
    buat: (req) => buildXlsx(req.userId, bersihkanNama(req.user?.username)),
  },
  // Khusus keuangan — dokumen terpisah, tidak mengubah ekspor gabungan di atas
  "keuangan-docx": {
    ekstensi: "docx",
    akhiran: "Khusus Keuangan",
    tipe: MIME_DOCX,
    buat: (req) => buildDocxKeuangan(req.userId, bersihkanNama(req.user?.username)),
  },
};

/** Nama berkas unduhan khas tiap tim, mis. "Logbook Tim Alpha - … (04-08-2026).docx". */
const namaBerkas = (req, jenis) =>
  `Logbook ${bersihkanNama(req.user?.username)} - ${JENIS[jenis].akhiran} ` +
  `(${tanggalUnduh()}).${JENIS[jenis].ekstensi}`;

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
 * /api/export/tautan/{jenis}:
 *   post:
 *     tags: [Export]
 *     summary: Siapkan berkas ekspor lalu kembalikan tautan CDN (byte tidak lewat server)
 *     description: >
 *       Berkas dibangun di server, dititipkan ke ImageKit, lalu browser
 *       mengunduhnya LANGSUNG dari CDN. Ini menghindari batas respons
 *       serverless Vercel (±4,5 MB) sehingga foto di dokumen bisa disematkan
 *       beresolusi tinggi, sekaligus menghemat kuota bandwidth.
 *       Mode lokal (tanpa ImageKit) membalas `{ mode: "server" }` — pemanggil
 *       memakai jalur lama /api/export/{jenis}.
 *       Bila data tim BELUM berubah sejak ekspor terakhir (sidik jari sama)
 *       dan berkasnya masih ada di CDN, tautan lama langsung dikembalikan
 *       (`cache: true`) tanpa membangun ulang — hemat waktu & trafik.
 *     parameters:
 *       - in: path
 *         name: jenis
 *         required: true
 *         schema: { type: string, enum: [docx, pdf, xlsx, keuangan-docx] }
 *       - in: query
 *         name: segar
 *         required: false
 *         description: "1 = paksa bangun ulang walau data tidak berubah"
 *         schema: { type: string, enum: ["1"] }
 *     responses:
 *       200: { description: "{ mode, url, nama, ukuran, cache }" }
 *       400: { description: Jenis ekspor tidak dikenali }
 */
router.post("/tautan/:jenis", async (req, res, next) => {
  try {
    const jenis = String(req.params.jenis || "").toLowerCase();
    if (!Object.hasOwn(JENIS, jenis)) {
      return res.status(400).json({ error: "Jenis ekspor tidak dikenali" });
    }
    const nama = namaBerkas(req, jenis);
    // Mode lokal (tanpa ImageKit): tidak ada CDN → pakai jalur lama.
    if (!pakaiCloud()) {
      return res.json({ mode: "server", url: `/api/export/${jenis}`, nama });
    }

    // ---- Cache: data tidak berubah → pakai berkas yang sudah ada di CDN ----
    const sidik = await sidikJariData(req);
    const [kunciLama, sidikLama, ukuranLama] = await Promise.all([
      store.getSetting(req.userId, `ekspor_key_${jenis}`, ""),
      store.getSetting(req.userId, `ekspor_hash_${jenis}`, ""),
      store.getSetting(req.userId, `ekspor_ukuran_${jenis}`, "0"),
    ]);
    if (req.query.segar !== "1" && kunciLama && sidikLama === sidik && (await adaFile(kunciLama))) {
      return res.json({
        mode: "cdn", url: signedUrl(kunciLama, 3600), nama,
        ukuran: Number(ukuranLama) || 0, cache: true,
      });
    }

    const buffer = await JENIS[jenis].buat(req);
    const key = await putFileEkspor(`ekspor.${JENIS[jenis].ekstensi}`, buffer, "eksp");

    // Satu berkas ekspor tersimpan per jenis: hasil sebelumnya dibuang supaya
    // penyimpanan cloud tidak menumpuk berkas usang.
    //
    // Penghapusan ini WAJIB di-await sebelum respons dikirim. Sebelumnya
    // dipanggil "tembak-lupakan" (removeFiles(...).catch()) — di serverless
    // Vercel, pekerjaan yang belum selesai saat respons terkirim bisa langsung
    // dihentikan runtime, sehingga berkas ekspor lama tidak pernah terhapus dan
    // kuota penyimpanan bocor sedikit demi sedikit tiap kali tim mengekspor.
    await Promise.all([
      kunciLama && kunciLama !== key ? removeFiles([kunciLama]) : null,
      store.setSetting(req.userId, `ekspor_key_${jenis}`, key),
      store.setSetting(req.userId, `ekspor_hash_${jenis}`, sidik),
      store.setSetting(req.userId, `ekspor_ukuran_${jenis}`, String(buffer.length)),
    ]);

    res.json({ mode: "cdn", url: signedUrl(key, 3600), nama, ukuran: buffer.length, cache: false });
  } catch (err) { next(err); }
});

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
      tipe: MIME_DOCX,
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
    const buffer = await buildPdf(req.userId, bersihkanNama(req.user?.username));
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
    const buffer = await buildXlsx(req.userId, bersihkanNama(req.user?.username));
    kirimBerkas(req, res, buffer, {
      ekstensi: "xlsx",
      tipe: MIME_XLSX,
      akhiran: "Rekap Kegiatan & Keuangan",
    });
  } catch (err) { next(err); }
});

/**
 * @openapi
 * /api/export/keuangan-docx:
 *   get:
 *     tags: [Export]
 *     summary: Unduh DOCX KHUSUS KEUANGAN — tabel Belmawa (dipisah per kategori) & tabel Perguruan Tinggi
 *     description: >
 *       Dokumen Word berisi teks, tabel, dan gambar biasa (mudah disalin/diedit).
 *       Belanja dana Belmawa dikelompokkan per kategori PKM dengan baris
 *       pemisah + subtotal, lalu tabel dana Perguruan Tinggi terpisah. Nota
 *       tiap belanja disematkan sebagai cuplikan di kolom Nota sekaligus
 *       lampiran besar bernomor (L-1, L-2, …); satu berkas gambar hanya
 *       disimpan sekali sehingga dokumen tetap hemat.
 *       Ekspor gabungan (/api/export/docx) tidak terpengaruh.
 *     responses:
 *       200:
 *         description: Berkas .docx
 *         content:
 *           application/vnd.openxmlformats-officedocument.wordprocessingml.document:
 *             schema: { type: string, format: binary }
 */
router.get("/keuangan-docx", async (req, res, next) => {
  try {
    const buffer = await buildDocxKeuangan(req.userId, bersihkanNama(req.user?.username));
    kirimBerkas(req, res, buffer, {
      ekstensi: "docx",
      tipe: MIME_DOCX,
      akhiran: "Khusus Keuangan",
    });
  } catch (err) { next(err); }
});

export default router;

