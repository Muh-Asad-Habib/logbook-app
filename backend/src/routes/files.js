import { Router } from "express";
import fs from "node:fs";
import { safePath, contentType, signedUrl, pakaiCloud } from "../files.js";
import { authRequired } from "../auth.js";

const router = Router();
router.use(authRequired); // gambar hanya untuk yang login (token via header/query)

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
 *     responses:
 *       302: { description: Dialihkan ke signed URL CDN (mode cloud) }
 *       200:
 *         description: Berkas gambar (mode lokal)
 *         content:
 *           image/*:
 *             schema: { type: string, format: binary }
 *       404: { description: Tidak ditemukan }
 */
router.get(/^\/(.+)/, (req, res) => {
  try {
    const key = decodeURIComponent(req.params[0]);

    if (pakaiCloud()) {
      // Backend hanya jadi "satpam": cek token (middleware di atas) lalu
      // alihkan browser ke signed URL — byte gambar mengalir langsung dari
      // CDN ImageKit, tidak melewati server ini sama sekali.
      if (key.includes("..") || key.includes("/")) {
        return res.status(400).json({ error: "key tidak valid" });
      }
      res.setHeader("Cache-Control", "private, max-age=300"); // redirect boleh di-cache sebentar
      return res.redirect(302, signedUrl(key));
    }

    // Mode lokal: alirkan file dari folder uploads/
    const p = safePath(key);
    if (!fs.existsSync(p)) return res.status(404).json({ error: "berkas tidak ditemukan" });
    res.setHeader("Content-Type", contentType(key));
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    fs.createReadStream(p).pipe(res);
  } catch {
    res.status(400).json({ error: "key tidak valid" });
  }
});

export default router;

