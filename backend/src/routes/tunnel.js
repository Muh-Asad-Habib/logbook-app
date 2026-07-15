import { Router } from "express";
import fs from "node:fs";
import path from "node:path";
import { config } from "../config.js";

const router = Router();
const URL_FILE = path.join(config.dataDir, "tunnel_url.txt");

/**
 * @openapi
 * /api/tunnel:
 *   get:
 *     tags: [Statistik]
 *     summary: URL publik (link eksternal) aplikasi saat ini — kosong bila tidak ada
 *     responses:
 *       200:
 *         description: "{ url: \"https://xxxx.vercel.app\" } atau { url: \"\" }"
 */
router.get("/", (_req, res) => {
  // Di Vercel: URL produksi permanen disediakan lewat env var — tidak perlu tunnel
  const vercelUrl =
    process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL || "";
  if (vercelUrl) return res.json({ url: `https://${vercelUrl}` });

  try {
    // Mode lokal: URL dianggap valid hanya bila file ditulis < 24 jam lalu
    const stat = fs.statSync(URL_FILE);
    const umurJam = (Date.now() - stat.mtimeMs) / 3_600_000;
    const url = fs.readFileSync(URL_FILE, "utf8").trim();
    res.json({ url: umurJam < 24 && url.startsWith("https://") ? url : "" });
  } catch {
    res.json({ url: "" });
  }
});

export default router;

