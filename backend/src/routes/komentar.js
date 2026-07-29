/**
 * API komentar 2 arah antara PENDAMPING (fasilitator / dosen) dan TIM.
 *
 * Aturan:
 * - Pendamping memulai thread (komentar induk) pada entri kegiatan/keuangan/
 *   laporan milik tim yang ia ampu; tim MEMBALAS lewat parent_id.
 * - Edit hanya milik sendiri → diberi tanda edited_at (label "(diedit)").
 * - Hapus hanya milik sendiri (balasan ikut terhapus).
 * - "Tandai selesai" hanya oleh pemilik tim (komentar induk).
 * - Tanda "sudah dibaca" per pengguna (tabel komentar_baca) — akurat untuk
 *   banyak pendamping per tim maupun banyak tim per pendamping.
 */
import { Router } from "express";
import * as store from "../storage.js";
import { authRequired, PERAN_PENDAMPING } from "../auth.js";
import { catatAktivitas } from "../aktivitas.js";
import { rateLimit } from "../ratelimit.js";

const router = Router();
router.use(authRequired);

const JENIS_VALID = new Set(["kegiatan", "keuangan", "laporan"]);

const komentarLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 60,
  pesan: "Terlalu banyak komentar — tunggu sebentar",
});

/** Tentukan tim yang sah untuk request ini (tim = dirinya; pendamping = ?tim= yang di-assign). */
async function timUntukRequest(req, res) {
  if (PERAN_PENDAMPING.has(req.user.role)) {
    const timId = String(req.query.tim || req.body?.tim || "");
    if (!timId) {
      res.status(400).json({ error: "Parameter tim wajib untuk fasilitator/dosen" });
      return null;
    }
    if (!(await store.bolehAksesTim(req.user.id, timId))) {
      res.status(403).json({ error: "Kamu bukan pendamping tim ini" });
      return null;
    }
    return timId;
  }
  return req.user.id;
}

/**
 * @openapi
 * /api/komentar:
 *   get:
 *     tags: [Komentar]
 *     summary: Daftar komentar sebuah target (tim = miliknya; fasilitator = tim ter-assign via ?tim=)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: query, name: jenis, required: true, schema: { type: string, enum: [kegiatan, keuangan, laporan] } }
 *       - { in: query, name: target_id, required: false, schema: { type: string }, description: "kosongkan untuk semua komentar jenis itu" }
 *       - { in: query, name: tim, required: false, schema: { type: string }, description: "wajib bila fasilitator" }
 *     responses:
 *       200: { description: Daftar komentar (kronologis, dengan penulis & role) }
 */
router.get("/", async (req, res, next) => {
  try {
    const jenis = String(req.query.jenis || "");
    if (!JENIS_VALID.has(jenis)) {
      return res.status(400).json({ error: "jenis harus kegiatan/keuangan/laporan" });
    }
    const timId = await timUntukRequest(req, res);
    if (!timId) return;
    const targetId = req.query.target_id != null && req.query.target_id !== ""
      ? String(req.query.target_id) : null;
    res.json(await store.listKomentar(jenis, targetId, timId));
  } catch (err) {
    next(err);
  }
});

/**
 * @openapi
 * /api/komentar/jumlah:
 *   get:
 *     tags: [Komentar]
 *     summary: Jumlah komentar per target (badge daftar entri)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: query, name: jenis, required: true, schema: { type: string } }
 *       - { in: query, name: tim, required: false, schema: { type: string } }
 *     responses:
 *       200: { description: "{ target_id: jumlah }" }
 */
router.get("/jumlah", async (req, res, next) => {
  try {
    const jenis = String(req.query.jenis || "");
    if (!JENIS_VALID.has(jenis)) {
      return res.status(400).json({ error: "jenis harus kegiatan/keuangan/laporan" });
    }
    const timId = await timUntukRequest(req, res);
    if (!timId) return;
    res.json(await store.hitungKomentarPerTarget(timId, jenis));
  } catch (err) {
    next(err);
  }
});

/**
 * @openapi
 * /api/komentar/belum-dibaca:
 *   get:
 *     tags: [Komentar]
 *     summary: Hitungan komentar belum dibaca milik user ini (badge menu)
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: "{ kegiatan, keuangan, laporan, total }" }
 */
router.get("/belum-dibaca", async (req, res, next) => {
  try {
    res.json(await store.hitungBelumDibaca(req.user.id, req.user.role));
  } catch (err) {
    next(err);
  }
});

/**
 * @openapi
 * /api/komentar/tandai-dibaca:
 *   post:
 *     tags: [Komentar]
 *     summary: Tandai daftar komentar sudah dibaca oleh user ini
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [ids]
 *             properties:
 *               ids: { type: array, items: { type: string } }
 *     responses:
 *       200: { description: Ditandai }
 */
router.post("/tandai-dibaca", async (req, res, next) => {
  try {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.slice(0, 500) : [];
    await store.tandaiDibaca(req.user.id, ids);
    res.json({ ok: true, jumlah: ids.length });
  } catch (err) {
    next(err);
  }
});

/**
 * @openapi
 * /api/komentar:
 *   post:
 *     tags: [Komentar]
 *     summary: Tulis komentar (fasilitator memulai thread; tim membalas via parent_id)
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [jenis, target_id, isi]
 *             properties:
 *               jenis: { type: string, enum: [kegiatan, keuangan, laporan] }
 *               target_id: { type: string, description: "id entri; untuk laporan = id tim" }
 *               isi: { type: string, maxLength: 2000 }
 *               parent_id: { type: string, description: "id komentar induk (balasan)" }
 *               tim: { type: string, description: "id tim (wajib bila fasilitator)" }
 *     responses:
 *       201: { description: Komentar tersimpan }
 *       400: { description: Input tidak valid }
 *       403: { description: Tidak berhak berkomentar di sini }
 */
router.post("/", komentarLimiter, async (req, res, next) => {
  try {
    const jenis = String(req.body?.jenis || "");
    if (!JENIS_VALID.has(jenis)) {
      return res.status(400).json({ error: "jenis harus kegiatan/keuangan/laporan" });
    }
    const isi = String(req.body?.isi || "").trim();
    if (!isi || isi.length > 2000) {
      return res.status(400).json({ error: "Isi komentar 1–2000 karakter" });
    }
    const timId = await timUntukRequest(req, res);
    if (!timId) return;

    const parentId = String(req.body?.parent_id || "");
    let targetId = String(req.body?.target_id || "");

    if (parentId) {
      // Balasan: induk harus ada & berada dalam scope tim yang sama
      const induk = await store.getKomentarById(parentId);
      if (!induk || induk.tim_user_id !== timId || induk.parent_id) {
        return res.status(400).json({ error: "Komentar induk tidak ditemukan" });
      }
      targetId = induk.target_id;
    } else {
      // Komentar induk: hanya pendamping (fasilitator/dosen) yang memulai thread
      if (!PERAN_PENDAMPING.has(req.user.role)) {
        return res.status(403).json({
          error: "Tim membalas komentar pendamping — tidak memulai thread baru",
        });
      }
      // Validasi target benar-benar milik tim itu
      if (jenis === "kegiatan") {
        if (!(await store.getKegiatan(timId, targetId))) {
          return res.status(404).json({ error: "Entri kegiatan tidak ditemukan" });
        }
      } else if (jenis === "keuangan") {
        if (!(await store.getKeuangan(timId, targetId))) {
          return res.status(404).json({ error: "Entri belanja tidak ditemukan" });
        }
      } else {
        // laporan: target = id tim (satu laporan per tim)
        targetId = timId;
        if (!(await store.infoLaporan(timId)).ada) {
          return res.status(404).json({ error: "Tim belum mengunggah laporan" });
        }
      }
    }

    const k = await store.addKomentar({
      jenis,
      targetId,
      timUserId: timId,
      penulisId: req.user.id,
      parentId,
      isi,
    });
    // Muncul di linimasa aktivitas tim (panel & profil)
    catatAktivitas(timId, "komentar.tambah", {
      jenis,
      oleh: req.user.username,
      balasan: !!parentId,
      ringkas: isi.slice(0, 80),
    });
    res.status(201).json(await store.getKomentarById(k.id));
  } catch (err) {
    next(err);
  }
});

/**
 * @openapi
 * /api/komentar/{id}:
 *   put:
 *     tags: [Komentar]
 *     summary: Edit komentar milik sendiri (diberi label "(diedit)")
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [isi]
 *             properties:
 *               isi: { type: string, maxLength: 2000 }
 *     responses:
 *       200: { description: Komentar diperbarui }
 *       403: { description: Bukan komentar milikmu }
 *   delete:
 *     tags: [Komentar]
 *     summary: Hapus komentar milik sendiri (balasan ikut terhapus)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     responses:
 *       200: { description: Terhapus }
 *       403: { description: Bukan komentar milikmu }
 */
router.put("/:id", async (req, res, next) => {
  try {
    const k = await store.getKomentarById(req.params.id);
    if (!k) return res.status(404).json({ error: "Komentar tidak ditemukan" });
    if (k.penulis_id !== req.user.id) {
      return res.status(403).json({ error: "Hanya penulis yang boleh mengedit" });
    }
    const isi = String(req.body?.isi || "").trim();
    if (!isi || isi.length > 2000) {
      return res.status(400).json({ error: "Isi komentar 1–2000 karakter" });
    }
    await store.updateKomentarIsi(k.id, isi);
    catatAktivitas(k.tim_user_id, "komentar.ubah", { jenis: k.jenis, oleh: req.user.username });
    res.json(await store.getKomentarById(k.id));
  } catch (err) {
    next(err);
  }
});

router.delete("/:id", async (req, res, next) => {
  try {
    const k = await store.getKomentarById(req.params.id);
    if (!k) return res.status(404).json({ error: "Komentar tidak ditemukan" });
    if (k.penulis_id !== req.user.id) {
      return res.status(403).json({ error: "Hanya penulis yang boleh menghapus" });
    }
    const n = await store.deleteKomentar(k.id);
    catatAktivitas(k.tim_user_id, "komentar.hapus", { jenis: k.jenis, oleh: req.user.username });
    res.json({ ok: true, terhapus: n });
  } catch (err) {
    next(err);
  }
});

/**
 * @openapi
 * /api/komentar/{id}/selesai:
 *   put:
 *     tags: [Komentar]
 *     summary: Tandai komentar selesai/belum (hanya pemilik tim)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               selesai: { type: boolean, default: true }
 *     responses:
 *       200: { description: Status diperbarui }
 *       403: { description: Hanya tim pemilik logbook }
 */
router.put("/:id/selesai", async (req, res, next) => {
  try {
    const k = await store.getKomentarById(req.params.id);
    if (!k) return res.status(404).json({ error: "Komentar tidak ditemukan" });
    if (PERAN_PENDAMPING.has(req.user.role) || k.tim_user_id !== req.user.id) {
      return res.status(403).json({ error: "Hanya tim pemilik logbook yang menandai selesai" });
    }
    const selesai = req.body?.selesai !== false;
    await store.setKomentarSelesai(k.id, selesai);
    catatAktivitas(k.tim_user_id, "komentar.selesai", { jenis: k.jenis, selesai });
    res.json({ ok: true, selesai });
  } catch (err) {
    next(err);
  }
});

export default router;

