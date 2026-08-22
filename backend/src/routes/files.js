import { Router } from "express";
import fs from "node:fs";
import sharp from "sharp";
import {
  safePath, contentType, signedUrl, pakaiCloud, thumbLokal, getFileBuffer,
} from "../files.js";
import { authRequired } from "../auth.js";
import * as store from "../storage.js";

const router = Router();
// Gambar hanya untuk yang login. Token dibaca dari header Authorization ATAU
// cookie HttpOnly `logbook_sesi` — <img> tidak bisa mengirim header sendiri,
// dan token TIDAK PERNAH lagi ditempel di URL (lihat cookies.js).
router.use(authRequired);

/**
 * Lebar thumbnail yang DIIZINKAN.
 *
 * Sengaja dibatasi ke beberapa nilai saja (bukan angka bebas) karena tiap
 * ukuran baru = entri cache CDN baru. Kalau bebas, satu orang bisa meminta
 * ?w=1, ?w=2, ?w=3, … dan meledakkan kuota transformasi ImageKit.
 */
const LEBAR_SAH = new Set([160, 240, 320, 480, 640, 960]);

/** Ambil lebar yang diminta, dibulatkan ke pilihan terdekat yang sah. */
function lebarDiminta(req) {
  const w = Number(req.query.w || 0);
  if (!w || !Number.isFinite(w)) return 0;
  if (LEBAR_SAH.has(w)) return w;
  // Bulatkan ke atas ke ukuran sah terdekat (permintaan aneh tetap aman)
  for (const l of [...LEBAR_SAH].sort((a, b) => a - b)) if (w <= l) return l;
  return 0; // lebih besar dari thumbnail terbesar → kirim resolusi penuh
}

/**
 * @openapi
 * /api/files/{key}:
 *   get:
 *     tags: [Files]
 *     summary: Ambil gambar berdasarkan key (redirect ke CDN bila mode cloud)
 *     parameters:
 *       - in: path
 *         name: key
 *         required: true
 *         schema: { type: string, example: "keg_2026-07-11_1720680000-ab12cd.jpg" }
 *       - in: query
 *         name: dl
 *         required: false
 *         description: "1 = unduh sebagai lampiran JPG (PNG/WebP dikonversi otomatis)"
 *         schema: { type: string, enum: ["1"] }
 *     responses:
 *       302: { description: Dialihkan ke signed URL CDN (mode cloud) }
 *       200:
 *         description: Berkas gambar (mode lokal)
 *         content:
 *           image/*:
 *             schema: { type: string, format: binary }
 *       404: { description: Tidak ditemukan }
 */
router.get(/^\/(.+)/, async (req, res) => {
  try {
    const key = decodeURIComponent(req.params[0]);
    if (key.includes("..") || key.includes("/")) {
      return res.status(400).json({ error: "key tidak valid" });
    }

    // Cegah IDOR: key hanya boleh disajikan bila memang tercatat milik
    // akun yang login — atau, bila PENDAMPING (fasilitator *dan* dosen),
    // milik salah satu tim yang benar-benar ia ampu (bukan sekadar
    // "sudah login pakai akun apa pun").
    // Catatan: sebelumnya hanya "fasilitator" yang dikecualikan, sehingga
    // akun dosen ikut jatuh ke cabang [req.userId] — dosen tidak pernah
    // memiliki berkas, jadi SEMUA foto tim balas 404 (gambar rusak).
    const pendamping = req.user.role === "fasilitator" || req.user.role === "dosen";
    const scope = pendamping
      ? (await store.listTimUntukFasilitator(req.userId)).map((t) => t.id)
      : [req.userId];
    if (!(await store.fileDimilikiOleh(key, scope))) {
      return res.status(404).json({ error: "berkas tidak ditemukan" });
    }

    const lebar = lebarDiminta(req);

    // ---- MODE UNDUH (?dl=1): kirim sebagai lampiran JPG resolusi penuh ----
    // Dipakai tombol ⬇ di Lightbox & unduhan ZIP di frontend. PNG/WebP
    // dikonversi ke JPG (sharp); GIF dilewatkan apa adanya agar animasi
    // tidak rusak. Di mode cloud byte diproksikan (bukan redirect) karena
    // unduhan butuh header Content-Disposition dari kita sendiri.
    if (req.query.dl === "1") {
      const buf = pakaiCloud()
        ? await getFileBuffer(key)
        : (fs.existsSync(safePath(key)) ? fs.readFileSync(safePath(key)) : null);
      if (!buf) return res.status(404).json({ error: "berkas tidak ditemukan" });

      let out = buf;
      let ext = ".jpg";
      let ct = "image/jpeg";
      if (/\.gif$/i.test(key)) {
        ext = ".gif";
        ct = "image/gif";
      } else if (!/\.jpe?g$/i.test(key)) {
        try {
          out = await sharp(buf, { failOn: "none" })
            .rotate()
            .jpeg({ quality: 90, progressive: true, mozjpeg: true })
            .toBuffer();
        } catch {
          out = buf; // konversi gagal → kirim byte asli (tetap terunduh)
        }
      }
      const nama = key.replace(/\.[^.]+$/, "") + ext;
      res.setHeader("Content-Type", ct);
      res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(nama)}"`);
      res.setHeader("Cache-Control", "private, max-age=0");
      return res.end(out);
    }

    if (pakaiCloud()) {
      // Backend hanya jadi "satpam": cek token + kepemilikan, lalu alihkan
      // browser ke signed URL — byte gambar mengalir langsung dari CDN
      // ImageKit, tidak melewati server ini sama sekali.
      res.setHeader("Cache-Control", "private, max-age=300"); // redirect boleh di-cache sebentar
      return res.redirect(302, signedUrl(key, 3600, lebar));
    }

    // Mode lokal: alirkan file dari folder uploads/
    const p = safePath(key);
    if (!fs.existsSync(p)) return res.status(404).json({ error: "berkas tidak ditemukan" });

    // Permintaan thumbnail: kecilkan dulu dengan sharp (hasilnya di-cache di
    // memori) — hemat bandwidth sama seperti jalur CDN di atas.
    if (lebar) {
      const kecil = await thumbLokal(key, lebar);
      if (kecil) {
        res.setHeader("Content-Type", "image/jpeg");
        res.setHeader("Cache-Control", "private, max-age=31536000, immutable");
        return res.end(kecil);
      }
    }

    res.setHeader("Content-Type", contentType(key));
    // private: respons ini khusus pengguna yang login — jangan sampai
    // di-cache proxy bersama lalu tersaji ke orang lain.
    res.setHeader("Cache-Control", "private, max-age=31536000, immutable");
    fs.createReadStream(p).pipe(res);
  } catch {
    res.status(400).json({ error: "key tidak valid" });
  }
});

export default router;
