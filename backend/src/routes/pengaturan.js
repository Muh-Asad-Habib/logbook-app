import { Router } from "express";
import * as store from "../storage.js";
import { authRequired, hanyaTim } from "../auth.js";

const router = Router();
router.use(authRequired); // pengaturan per akun
router.use(hanyaTim); // fasilitator tidak punya pengaturan dana

/**
 * Kunci yang dikelola endpoint khusus dan TIDAK boleh ditulis lewat
 * key-value bebas — kalau bisa, seseorang dapat menyetel kode timnya
 * menyamai kode tim lain (tabrakan saat pendamping bergabung).
 *
 * `dana_awal` kini ikut dikunci: nilainya SELALU dihitung server dari
 * dana_belmawa + dana_pt (lihat store.hitungDana) supaya tidak ada dua
 * sumber kebenaran. Klien lama yang masih mengirimnya diam-diam diabaikan.
 */
const KUNCI_TERKUNCI = new Set(["kode_tim"]);
const KUNCI_DIABAIKAN = new Set(["dana_awal"]);

/**
 * Kunci yang BOLEH dibaca/ditulis lewat endpoint ini (whitelist).
 * Sebelumnya kunci & nilai bebas tanpa batas panjang — satu akun bisa
 * menumpuk baris/megabyte sembarang di tabel `pengaturan` (kuota Neon 0,5 GB).
 * Tambahkan kunci baru di sini bila frontend memerlukannya.
 */
const KUNCI_BOLEH = new Set(["dana_belmawa", "dana_pt", "dana_awal"]);
const NILAI_MAKS = 200;

function kunciSah(kunci) {
  return /^[a-z][a-z0-9_]{0,40}$/.test(kunci) && KUNCI_BOLEH.has(kunci);
}

/**
 * @openapi
 * /api/pengaturan/{kunci}:
 *   get:
 *     tags: [Pengaturan]
 *     summary: Ambil nilai pengaturan (mis. dana_awal)
 *     parameters:
 *       - in: path
 *         name: kunci
 *         required: true
 *         schema: { type: string, example: dana_awal }
 *     responses:
 *       200:
 *         description: Nilai pengaturan (string kosong bila belum diset)
 *   put:
 *     tags: [Pengaturan]
 *     summary: Simpan nilai pengaturan
 *     parameters:
 *       - in: path
 *         name: kunci
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               nilai: { type: string, example: "5000000" }
 *     responses:
 *       200: { description: Tersimpan }
 */
router.get("/:kunci", async (req, res, next) => {
  try {
    if (!kunciSah(req.params.kunci)) {
      return res.status(400).json({ error: "Kunci pengaturan tidak dikenal" });
    }
    // dana_awal = turunan (Belmawa + PT) — dijawab dari hasil hitung server
    if (req.params.kunci === "dana_awal") {
      const dana = await store.hitungDana(req.userId);
      return res.json({ kunci: "dana_awal", nilai: String(dana.total) });
    }
    res.json({ kunci: req.params.kunci, nilai: await store.getSetting(req.userId, req.params.kunci) });
  } catch (err) {
    next(err);
  }
});

router.put("/:kunci", async (req, res, next) => {
  try {
    if (KUNCI_TERKUNCI.has(req.params.kunci)) {
      return res.status(403).json({ error: "Kunci ini dikelola lewat /api/tim/kode" });
    }
    if (!kunciSah(req.params.kunci)) {
      return res.status(400).json({ error: "Kunci pengaturan tidak dikenal" });
    }
    // Nilai turunan: terima permintaannya (klien lama tidak error) tapi
    // jawab dengan angka hasil hitung server, bukan menuliskannya.
    if (KUNCI_DIABAIKAN.has(req.params.kunci)) {
      const dana = await store.hitungDana(req.userId);
      return res.json({ kunci: req.params.kunci, nilai: String(dana.total), turunan: true });
    }
    const nilai = String(req.body?.nilai ?? "");
    if (nilai.length > NILAI_MAKS) {
      return res.status(400).json({ error: `Nilai terlalu panjang (maks. ${NILAI_MAKS} karakter)` });
    }
    await store.setSetting(req.userId, req.params.kunci, nilai);
    res.json({ kunci: req.params.kunci, nilai });
  } catch (err) {
    next(err);
  }
});

/**
 * @openapi
 * /api/statistik:
 *   get:
 *     tags: [Statistik]
 *     summary: Ringkasan dashboard (capaian, total waktu, pengeluaran, sisa dana)
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Ringkasan
 */
export const statistikRouter = Router();
statistikRouter.use(authRequired);
statistikRouter.use(hanyaTim); // fasilitator pakai /api/fasilitator/tim/:id/statistik
statistikRouter.get("/", async (req, res, next) => {
  try {
    const [kegiatan, keuangan, dana] = await Promise.all([
      store.listKegiatan(req.userId),
      store.listKeuangan(req.userId),
      store.hitungDana(req.userId),
    ]);
    const capaian = kegiatan.length ? kegiatan[kegiatan.length - 1].capaian_total : 0;
    const totalMenit = kegiatan.reduce((s, e) => s + e.waktu_menit, 0);
    const pengeluaran = keuangan.reduce((s, e) => s + e.total, 0);
    res.json({
      capaian_total: capaian,
      jumlah_kegiatan: kegiatan.length,
      total_waktu_menit: totalMenit,
      jumlah_belanja: keuangan.length,
      total_pengeluaran: pengeluaran,
      // dana_awal = total dana (Belmawa + PT); tetap dipakai klien lama
      dana_awal: dana.total,
      dana_belmawa: dana.belmawa,
      dana_pt: dana.pt,
      sisa_dana: dana.total - pengeluaran,
    });
  } catch (err) {
    next(err);
  }
});

export default router;

