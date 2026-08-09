/**
 * Penyimpanan berkas gambar — adapter ganda:
 *
 *  1. IMAGEKIT (cloud, gratis 20 GB) — dipakai bila env IMAGEKIT_* terisi.
 *     - Upload  : REST API ImageKit (butuh private key).
 *     - Tampil  : browser di-redirect (302) ke SIGNED URL ImageKit yang
 *                 kedaluwarsa ±1 jam → foto dimuat langsung dari CDN, cepat,
 *                 dan tetap privat (aktifkan "Restrict unsigned URLs").
 *     - Hapus   : perlu fileId → pemetaan key->fileId disimpan di tabel
 *                 `files` (Postgres).
 *  2. LOKAL (folder uploads/) — fallback otomatis bila env tidak terisi;
 *     berguna untuk pengembangan di laptop tanpa akun ImageKit.
 *
 *  Semua unggahan dikompresi dengan sharp (maks 1600px, JPEG progresif) —
 *  foto HP 3–5 MB menyusut jadi ±200–400 KB, kuota cloud jadi awet.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import sharp from "sharp";
import { config } from "./config.js";
import { q } from "./db.js";

const MIME = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

/** Ekstensi gambar yang diizinkan (whitelist server-side). */
export const ALLOWED_EXT = new Set(Object.keys(MIME));
export const ALLOWED_MIME = new Set(Object.values(MIME));

/** Validasi upload di sisi server (jangan percaya accept= di browser). */
export function isAllowedImage(originalName, mimetype) {
  const ext = path.extname(originalName || "").toLowerCase();
  return ALLOWED_EXT.has(ext) || ALLOWED_MIME.has(String(mimetype || "").toLowerCase());
}

export function contentType(key) {
  return MIME[path.extname(key).toLowerCase()] || "application/octet-stream";
}

/* ---------------- konfigurasi ImageKit ---------------- */

const IK = {
  publicKey: process.env.IMAGEKIT_PUBLIC_KEY || "",
  privateKey: process.env.IMAGEKIT_PRIVATE_KEY || "",
  urlEndpoint: (process.env.IMAGEKIT_URL_ENDPOINT || "").replace(/\/+$/, ""),
  folder: process.env.IMAGEKIT_FOLDER || "/logbook",
};

/** Apakah mode cloud (ImageKit) aktif? */
export const pakaiCloud = () => !!(IK.privateKey && IK.urlEndpoint);

const authHeader = () =>
  "Basic " + Buffer.from(`${IK.privateKey}:`).toString("base64");

/* ---------------- util kompresi ---------------- */

/** Batas kompresi: sisi terpanjang & kualitas JPEG. */
const MAX_DIM = 1600;
const JPEG_QUALITY = 80;

/**
 * Kompres buffer gambar (resize + JPEG progresif).
 * GIF dilewatkan apa adanya (bisa animasi); gambar lain → JPEG.
 * Bila sharp gagal (berkas rusak/format aneh) → kembalikan buffer asli.
 */
async function compressImage(buffer, ext) {
  if (ext === ".gif") return { buffer, ext };
  try {
    const out = await sharp(buffer, { failOn: "none" })
      .rotate() // terapkan orientasi EXIF agar foto HP tidak miring
      .resize(MAX_DIM, MAX_DIM, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: JPEG_QUALITY, progressive: true, mozjpeg: true })
      .toBuffer();
    // Pakai hasil kompresi hanya jika benar-benar lebih kecil
    if (out.length < buffer.length) return { buffer: out, ext: ".jpg" };
    return { buffer, ext };
  } catch {
    return { buffer, ext };
  }
}

function buatKey(prefix, ext) {
  return `${prefix}_${Date.now()}-${crypto.randomBytes(3).toString("hex")}${ext}`;
}

/**
 * Kompres gambar untuk DISEMATKAN ke dokumen ekspor (DOCX/PDF).
 * Foto di dokumen hanya tampil ±2,6 cm, jadi 640px sudah melebihi kebutuhan
 * cetak 300dpi — ini menjaga ukuran berkas ekspor jauh di bawah batas
 * response Vercel (±4,5 MB). Format asli dipertahankan (jpeg→jpeg, png→png)
 * agar relationship/content-type dokumen tidak berubah.
 * Bila gagal atau hasil tidak lebih kecil → kembalikan buffer asli.
 */
export async function compressForEmbed(buffer, maxDim = 640, quality = 72) {
  try {
    if (!buffer || buffer.length < 24 * 1024) return buffer; // sudah kecil
    const isJpeg = buffer[0] === 0xff && buffer[1] === 0xd8;
    const isPng = buffer[0] === 0x89 && buffer[1] === 0x50;
    if (!isJpeg && !isPng) return buffer; // gif/format lain: biarkan
    let s = sharp(buffer, { failOn: "none" })
      .rotate()
      .resize(maxDim, maxDim, { fit: "inside", withoutEnlargement: true });
    s = isPng
      ? s.png({ compressionLevel: 9 })
      : s.jpeg({ quality, progressive: true, mozjpeg: true });
    const out = await s.toBuffer();
    return out.length < buffer.length ? out : buffer;
  } catch {
    return buffer;
  }
}

/* ---------------- adapter LOKAL (fallback dev) ---------------- */

/** Path absolut yang aman (tolak path traversal seperti ../../). */
export function safePath(key) {
  const base = path.resolve(config.uploadsDir);
  const p = path.resolve(base, key);
  if (p !== base && !p.startsWith(base + path.sep)) {
    throw new Error("key tidak valid");
  }
  return p;
}

/* ---------------- API utama (dipakai routes/export/import) ---------------- */

/**
 * Simpan buffer gambar (dikompresi), kembalikan key (nama berkas unik).
 * Cloud: upload ke ImageKit + catat fileId di tabel `files`.
 * Lokal: tulis ke folder uploads/.
 */
export async function putFile(originalName, buffer, prefix = "img") {
  let ext = path.extname(originalName || "").toLowerCase();
  if (!ALLOWED_EXT.has(ext)) ext = ".jpg"; // normalisasi ekstensi asing
  const hasil = await compressImage(buffer, ext);
  const key = buatKey(prefix, hasil.ext);

  if (pakaiCloud()) {
    const form = new FormData();
    form.append("file", hasil.buffer.toString("base64"));
    form.append("fileName", key);
    form.append("folder", IK.folder);
    form.append("useUniqueFileName", "false");
    const res = await fetch("https://upload.imagekit.io/api/v1/files/upload", {
      method: "POST",
      headers: { Authorization: authHeader() },
      body: form,
    });
    if (!res.ok) {
      const pesan = await res.text().catch(() => "");
      throw new Error(`Upload ke ImageKit gagal (${res.status}): ${pesan.slice(0, 200)}`);
    }
    const info = await res.json(); // { fileId, url, filePath, ... }
    await q(
      `INSERT INTO files (key, file_id, url) VALUES ($1, $2, $3)
       ON CONFLICT (key) DO UPDATE SET file_id = EXCLUDED.file_id, url = EXCLUDED.url`,
      [key, info.fileId || "", info.url || ""]
    );
    return key;
  }

  fs.mkdirSync(config.uploadsDir, { recursive: true });
  fs.writeFileSync(safePath(key), hasil.buffer);
  return key;
}

/**
 * Simpan berkas NON-gambar apa adanya (tanpa kompresi sharp) — dipakai untuk
 * laporan kemajuan .docx dan presentasi .pptx. Whitelist ketat: hanya kedua
 * ekstensi itu yang diterima.
 * Cloud: upload ke ImageKit + catat fileId di tabel `files` (jalur sama
 * dengan foto). Lokal: tulis ke folder uploads/.
 */
const EXT_DOKUMEN = new Set([".docx", ".pptx"]);

export async function putFileRaw(originalName, buffer, prefix = "lap") {
  const ext = path.extname(originalName || "").toLowerCase();
  if (!EXT_DOKUMEN.has(ext)) {
    throw new Error("Hanya berkas .docx atau .pptx yang diizinkan");
  }
  const key = buatKey(prefix, ext);

  if (pakaiCloud()) {
    const form = new FormData();
    form.append("file", buffer.toString("base64"));
    form.append("fileName", key);
    form.append("folder", IK.folder);
    form.append("useUniqueFileName", "false");
    const res = await fetch("https://upload.imagekit.io/api/v1/files/upload", {
      method: "POST",
      headers: { Authorization: authHeader() },
      body: form,
    });
    if (!res.ok) {
      const pesan = await res.text().catch(() => "");
      throw new Error(`Upload ke ImageKit gagal (${res.status}): ${pesan.slice(0, 200)}`);
    }
    const info = await res.json(); // { fileId, url, filePath, ... }
    await q(
      `INSERT INTO files (key, file_id, url) VALUES ($1, $2, $3)
       ON CONFLICT (key) DO UPDATE SET file_id = EXCLUDED.file_id, url = EXCLUDED.url`,
      [key, info.fileId || "", info.url || ""]
    );
    return key;
  }

  fs.mkdirSync(config.uploadsDir, { recursive: true });
  fs.writeFileSync(safePath(key), buffer);
  return key;
}

/**
 * Simpan BLOB sementara dengan kunci yang ditentukan pemanggil — dipakai
 * POTONGAN unggahan berkas besar (presentasi). Binernya ke ImageKit (kuota
 * 20 GB), Neon hanya menyimpan kuncinya — menghindari batas respons query
 * Neon 64 MB sekaligus menghemat kuota database 0,5 GB.
 * Kunci deterministik + useUniqueFileName=false → unggah ulang potongan yang
 * sama menimpa berkas lama (idempoten, tanpa sampah).
 */
export async function putBlob(key, buffer) {
  if (pakaiCloud()) {
    const form = new FormData();
    form.append("file", buffer.toString("base64"));
    form.append("fileName", key);
    form.append("folder", IK.folder);
    form.append("useUniqueFileName", "false");
    const res = await fetch("https://upload.imagekit.io/api/v1/files/upload", {
      method: "POST",
      headers: { Authorization: authHeader() },
      body: form,
    });
    if (!res.ok) {
      const pesan = await res.text().catch(() => "");
      throw new Error(`Upload potongan ke ImageKit gagal (${res.status}): ${pesan.slice(0, 200)}`);
    }
    const info = await res.json();
    await q(
      `INSERT INTO files (key, file_id, url) VALUES ($1, $2, $3)
       ON CONFLICT (key) DO UPDATE SET file_id = EXCLUDED.file_id, url = EXCLUDED.url`,
      [key, info.fileId || "", info.url || ""]
    );
    return key;
  }
  fs.mkdirSync(config.uploadsDir, { recursive: true });
  fs.writeFileSync(safePath(key), buffer);
  return key;
}

/* ---------------- berkas BESAR (> batas 25 MB/berkas ImageKit gratis) ----------------
 * Berkas final yang melebihi PART_MAX otomatis dipecah menjadi beberapa bagian
 * `<stem>.partN.bin` di ImageKit, dan kolom file_key menyimpan kunci komposit
 * `multi:<jumlah>:<stem>`. Perakitan kembali transparan lewat getFileBesar(). */
const PART_MAX = 20 * 1024 * 1024; // aman di bawah batas 25 MB ImageKit gratis

export async function putFileBesar(originalName, buffer, prefix = "lap") {
  if (buffer.length <= PART_MAX) return putFileRaw(originalName, buffer, prefix);
  const ext = path.extname(originalName || "").toLowerCase();
  if (!EXT_DOKUMEN.has(ext)) {
    throw new Error("Hanya berkas .docx atau .pptx yang diizinkan");
  }
  const stem = buatKey(prefix, ""); // tanpa ekstensi — jadi pangkal nama bagian
  const jumlah = Math.ceil(buffer.length / PART_MAX);
  const tersimpan = [];
  try {
    for (let i = 0; i < jumlah; i++) {
      const k = `${stem}.part${i}.bin`;
      await putBlob(k, buffer.subarray(i * PART_MAX, (i + 1) * PART_MAX));
      tersimpan.push(k);
    }
  } catch (err) {
    await removeFiles(tersimpan); // jangan tinggalkan bagian yatim
    throw err;
  }
  return `multi:${jumlah}:${stem}`;
}

/** Ambil isi berkas — kunci biasa maupun komposit `multi:` (dirakit ulang). */
export async function getFileBesar(key) {
  const s = String(key || "");
  if (!s.startsWith("multi:")) return getFileBufferRetry(s);
  const [, nStr, stem] = s.split(":");
  const n = Number(nStr) || 0;
  const bagian = [];
  for (let i = 0; i < n; i++) {
    const buf = await getFileBufferRetry(`${stem}.part${i}.bin`);
    if (!buf) return null; // satu bagian hilang = berkas tidak utuh
    bagian.push(buf);
  }
  return n ? Buffer.concat(bagian) : null;
}

/** Jabarkan kunci (komposit → daftar kunci bagian) untuk penghapusan. */
export function kunciBagian(key) {
  const s = String(key || "");
  if (!s.startsWith("multi:")) return s ? [s] : [];
  const [, nStr, stem] = s.split(":");
  return Array.from({ length: Number(nStr) || 0 }, (_, i) => `${stem}.part${i}.bin`);
}

/** Hapus banyak berkas (abaikan yang sudah tidak ada / gagal). */
export async function removeFiles(keys) {
  for (const k of keys || []) {
    try {
      if (pakaiCloud()) {
        const rows = await q("SELECT file_id FROM files WHERE key = $1", [k]);
        const fileId = rows[0]?.file_id;
        if (fileId) {
          await fetch(`https://api.imagekit.io/v1/files/${fileId}`, {
            method: "DELETE",
            headers: { Authorization: authHeader() },
          }).catch(() => {});
        }
        await q("DELETE FROM files WHERE key = $1", [k]);
      } else {
        fs.unlinkSync(safePath(k));
      }
    } catch {}
  }
}

/**
 * SIGNED URL ImageKit — tautan sementara (default 1 jam) yang membuat browser
 * mengambil foto langsung dari CDN. Algoritme tanda tangan sesuai SDK resmi:
 * signature = HMAC-SHA1(privateKey, pathRelatif + expiryTimestamp).
 */
export function signedUrl(key, detik = 3600) {
  const relatif = `${IK.folder}/${key}`.replace(/^\/+/, "");
  const url = `${IK.urlEndpoint}/${relatif}`;
  const kedaluwarsa = Math.floor(Date.now() / 1000) + detik;
  const signature = crypto
    .createHmac("sha1", IK.privateKey)
    .update(url.replace(IK.urlEndpoint + "/", "") + kedaluwarsa)
    .digest("hex");
  return `${url}?ik-t=${kedaluwarsa}&ik-s=${signature}`;
}

/**
 * Ambil isi berkas sebagai Buffer — dipakai ekspor DOCX/PDF untuk menyematkan
 * foto ke dokumen. Cloud: unduh dari signed URL; lokal: baca file.
 * Mengembalikan null bila tidak ada/gagal (ekspor tetap jalan tanpa foto itu).
 */
export async function getFileBuffer(key) {
  try {
    if (pakaiCloud()) {
      const res = await fetch(signedUrl(key, 300));
      if (!res.ok) return null;
      return Buffer.from(await res.arrayBuffer());
    }
    const p = safePath(key);
    if (!fs.existsSync(p)) return null;
    return fs.readFileSync(p);
  } catch {
    return null;
  }
}

/**
 * getFileBuffer + RETRY — berkas yang BARU diunggah ke ImageKit kadang belum
 * langsung tersedia di CDN (jeda propagasi ±1–5 dtk, terbukti saat pengujian:
 * baca pertama 404/NULL, baca kedua sukses). Tiap percobaan membuat signed URL
 * BARU (timestamp beda → path cache CDN beda) agar tidak menabrak cache 404.
 * Dipakai perakit potongan unggahan & perakit berkas multi-bagian.
 */
export async function getFileBufferRetry(key, percobaan = 4, jedaMs = 1500) {
  for (let i = 0; i < percobaan; i++) {
    if (i > 0) await new Promise((r) => setTimeout(r, jedaMs));
    const buf = await getFileBuffer(key);
    if (buf) return buf;
    if (!pakaiCloud()) break; // lokal: file tidak ada ya tidak ada
  }
  return null;
}

