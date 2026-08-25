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
 *  Semua unggahan dikompresi dengan sharp (maks 2000px, JPEG progresif mutu 85)
 *  — foto HP 3–5 MB menyusut jadi ±250–500 KB tanpa penurunan yang kentara,
 *  kuota cloud tetap awet.
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

/**
 * Batas kompresi unggahan: sisi terpanjang & kualitas JPEG.
 *
 * Sengaja LEBIH TINGGI dari sebelumnya (1600px/q80 → 2000px/q85): mozjpeg
 * sangat efisien, jadi kenaikan mutu ini hanya menambah ±20–30% ukuran berkas
 * (tetap ±250–500 KB per foto) tetapi menghilangkan artefak yang dulu terlihat
 * saat foto dibuka besar di Lightbox maupun disematkan ke dokumen Word.
 */
const MAX_DIM = 2000;
const JPEG_QUALITY = 85;

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

/* Batas resolusi foto yang DISEMATKAN ke dokumen (DOCX/PDF).
 * 1000px sangat berlebih untuk kebutuhan cetak: foto tampil paling besar
 * ±5 cm di dokumen, jadi 1000px setara ±500 dpi (standar cetak 300 dpi). */
const EMBED_DIM = 1000;        // sisi terpanjang sematan
const EMBED_MUTU = 85;         // kualitas JPEG sematan
const EMBED_MIN = 700;         // di bawah ini foto di-upscale dulu
const EMBED_FAKTOR_MAX = 4;    // pembesaran maksimal 4× agar tidak jadi "bubur"

/**
 * Siapkan gambar untuk DISEMATKAN ke dokumen ekspor (DOCX/PDF) dan kembalikan
 * dimensi ASLI-nya (setelah rotasi EXIF) supaya pemanggil bisa menghitung
 * ukuran tampil sesuai RASIO ASLI — foto tidak perlu dipangkas/terpotong.
 *
 * - Foto besar diturunkan ke EMBED_DIM (1200px) — jauh di atas kebutuhan
 *   cetak 300dpi untuk kolom selebar ±3 cm, jadi hasilnya tajam.
 * - Foto KECIL (mis. hasil impor DOCX ±220–420px) di-UPSCALE (lanczos3 +
 *   sharpen ringan, maks 4×) supaya tidak pecah-pecah saat dicetak.
 * - Format asli dipertahankan (jpeg→jpeg, png→png) agar relationship &
 *   content-type dokumen tidak berubah. GIF/format lain dilewatkan.
 *
 * @returns {Promise<{buffer: Buffer, w: number, h: number, ok: boolean}>}
 *   ok=false bila format tak didukung/gagal (buffer asli dikembalikan).
 */
export async function siapkanEmbed(buffer, maxDim = EMBED_DIM, quality = EMBED_MUTU) {
  const gagal = { buffer, w: 0, h: 0, ok: false };
  try {
    if (!buffer) return gagal;
    const isJpeg = buffer[0] === 0xff && buffer[1] === 0xd8;
    const isPng = buffer[0] === 0x89 && buffer[1] === 0x50;
    if (!isJpeg && !isPng) return gagal; // gif/format lain: biarkan
    const md = await sharp(buffer, { failOn: "none" }).metadata();
    let w = md.width, h = md.height;
    if (!w || !h) return gagal;
    if (md.orientation >= 5) [w, h] = [h, w]; // EXIF rotasi 90°
    const sisi = Math.max(w, h);
    const kecil = sisi < EMBED_MIN;

    // Jalur cepat: JPEG yang sudah pas ukuran & tanpa rotasi EXIF dipakai
    // apa adanya — menghemat waktu CPU (penting saat satu dokumen memuat
    // ratusan foto) sekaligus menghindari rekompresi yang menurunkan mutu.
    if (!kecil && sisi <= maxDim && isJpeg && !(md.orientation > 1)) {
      return { buffer, w, h, ok: true };
    }

    const target = kecil
      ? Math.min(maxDim, Math.round(sisi * EMBED_FAKTOR_MAX))
      : Math.min(maxDim, sisi);

    let s = sharp(buffer, { failOn: "none" }).rotate().resize(target, target, {
      fit: "inside",              // TANPA crop — rasio asli dipertahankan
      withoutEnlargement: false,  // izinkan upscale untuk foto kecil
      kernel: "lanczos3",
    });
    if (kecil) s = s.sharpen(); // hasil upscale dipertegas
    s = isPng
      ? s.png({ compressionLevel: 9 })
      : s.jpeg({ quality, progressive: true, mozjpeg: true });
    const out = await s.toBuffer();
    // Hasil upscale WAJIB dipakai walau berkasnya jadi lebih besar — itulah
    // tujuannya. Selain itu, pakai hasil hanya bila benar-benar lebih kecil.
    const pakai = kecil || out.length < buffer.length ? out : buffer;
    return { buffer: pakai, w, h, ok: true };
  } catch {
    return gagal;
  }
}

/** Versi ringkas siapkanEmbed — hanya buffer-nya (dipakai logo/kop dokumen). */
export async function compressForEmbed(buffer, maxDim = EMBED_DIM, quality = EMBED_MUTU) {
  return (await siapkanEmbed(buffer, maxDim, quality)).buffer;
}

/* Batas resolusi unduhan JPG (?dl=1). Foto tersimpan bisa sangat kecil
 * (mis. hasil impor DOCX ±220–420 px) sehingga blur saat dibuka — saat
 * diunduh, foto kecil di-upscale dan foto raksasa diturunkan. */
const UNDUH_MIN = 1280;     // sisi terpanjang minimal — di bawah ini di-upscale
const UNDUH_MAX = 2000;     // sisi terpanjang maksimal (selaras batas upload)
const UNDUH_FAKTOR_MAX = 4; // pembesaran maksimal 4× agar tidak jadi "bubur"

/**
 * Siapkan buffer untuk unduhan sebagai JPG (?dl=1) dengan resolusi
 * ternormalisasi ("tidak terlalu besar, tidak terlalu kecil"):
 *  - sisi terpanjang < UNDUH_MIN → upscale (lanczos3, maks UNDUH_FAKTOR_MAX×)
 *    lalu dipertegas dengan sharpen ringan;
 *  - sisi terpanjang > UNDUH_MAX → diturunkan ke UNDUH_MAX;
 *  - JPEG yang sudah dalam rentang → byte asli (tanpa rekompresi).
 * Non-JPEG (PNG/WebP) selalu dikonversi ke JPEG q90 (chroma 4:4:4 agar teks
 * pada tangkapan layar tetap tajam). GIF TIDAK lewat sini (animasi
 * dipertahankan pemanggil).
 * @returns {Promise<{buffer: Buffer, jpeg: boolean}>} jpeg=false hanya bila
 *   konversi gagal total pada sumber non-JPEG (kirim byte asli apa adanya).
 */
export async function jpgUnduhan(buffer) {
  const isJpeg = buffer?.[0] === 0xff && buffer[1] === 0xd8;
  try {
    const md = await sharp(buffer, { failOn: "none" }).metadata();
    let w = md.width, h = md.height;
    if (!w || !h) throw new Error("dimensi tidak terbaca");
    if (md.orientation >= 5) [w, h] = [h, w]; // EXIF rotasi 90°
    const sisi = Math.max(w, h);

    let target = 0; // 0 = tanpa resize
    if (sisi < UNDUH_MIN) target = Math.min(UNDUH_MIN, Math.round(sisi * UNDUH_FAKTOR_MAX));
    else if (sisi > UNDUH_MAX) target = UNDUH_MAX;

    // JPEG yang sudah pas → kirim byte asli, tanpa penurunan kualitas
    if (!target && isJpeg) return { buffer, jpeg: true };

    let s = sharp(buffer, { failOn: "none" }).rotate();
    if (target) {
      s = s.resize(target, target, {
        fit: "inside",
        withoutEnlargement: false,
        kernel: "lanczos3",
      });
      if (sisi < UNDUH_MIN) s = s.sharpen(); // hasil upscale dipertegas
    }
    const out = await s
      .jpeg({ quality: 90, progressive: true, mozjpeg: true, chromaSubsampling: "4:4:4" })
      .toBuffer();
    return { buffer: out, jpeg: true };
  } catch {
    return { buffer, jpeg: isJpeg };
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
 * TIMPA isi berkas yang sudah ada TANPA mengubah kuncinya — dipakai skrip
 * perawatan `tools/perbaiki-foto.mjs` untuk meng-upscale foto lama yang
 * tersimpan beresolusi rendah. Karena kuncinya tetap, seluruh entri
 * kegiatan/keuangan yang menunjuk berkas ini otomatis ikut membaik tanpa
 * perubahan database.
 *
 * ImageKit: unggah ulang dengan `fileName` sama + useUniqueFileName=false →
 * berkas di path yang sama digantikan dan cache CDN-nya dibersihkan otomatis.
 */
export async function timpaFile(key, buffer) {
  if (pakaiCloud()) {
    const form = new FormData();
    form.append("file", buffer.toString("base64"));
    form.append("fileName", key);
    form.append("folder", IK.folder);
    form.append("useUniqueFileName", "false");
    form.append("overwriteFile", "true");
    const res = await fetch("https://upload.imagekit.io/api/v1/files/upload", {
      method: "POST",
      headers: { Authorization: authHeader() },
      body: form,
    });
    if (!res.ok) {
      const pesan = await res.text().catch(() => "");
      throw new Error(`Timpa berkas di ImageKit gagal (${res.status}): ${pesan.slice(0, 200)}`);
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

/**
 * Simpan berkas NON-gambar apa adanya (tanpa kompresi sharp) — dipakai untuk
 * laporan kemajuan .docx dan presentasi .pptx. Whitelist ketat: hanya kedua
 * ekstensi itu yang diterima.
 * Cloud: upload ke ImageKit + catat fileId di tabel `files` (jalur sama
 * dengan foto). Lokal: tulis ke folder uploads/.
 */
const EXT_DOKUMEN = new Set([".docx", ".pptx"]);

/** Ekstensi berkas HASIL EKSPOR yang boleh dititipkan ke CDN. */
const EXT_EKSPOR = new Set([".docx", ".pdf", ".xlsx"]);

/**
 * Simpan berkas HASIL EKSPOR (.docx/.pdf/.xlsx) ke penyimpanan cloud lalu
 * kembalikan kuncinya — dipakai agar unduhan ekspor ditarik browser LANGSUNG
 * dari CDN ImageKit, bukan mengalir lewat serverless function Vercel
 * (menghindari batas respons ±4,5 MB sekaligus menghemat kuota bandwidth).
 */
export async function putFileEkspor(originalName, buffer, prefix = "eksp") {
  const ext = path.extname(originalName || "").toLowerCase();
  if (!EXT_EKSPOR.has(ext)) {
    throw new Error("Ekstensi hasil ekspor tidak dikenali");
  }
  const key = buatKey(prefix, ext);
  if (pakaiCloud()) return putBlob(key, buffer);
  fs.mkdirSync(config.uploadsDir, { recursive: true });
  fs.writeFileSync(safePath(key), buffer);
  return key;
}

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
export const PART_MAX = 20 * 1024 * 1024; // aman di bawah batas 25 MB ImageKit gratis

/* ---------------- UNGGAH LANGSUNG BROWSER → IMAGEKIT ----------------
 * Jalur hemat trafik: byte berkas TIDAK pernah melewati server kita.
 * Server hanya menerbitkan "izin" (token+expire+signature) beberapa ratus byte,
 * browser mengunggah sendiri ke upload.imagekit.io, lalu server memverifikasi
 * hasilnya lewat API metadata (respons kecil) sebelum dicatat ke database.
 *
 * Tanpa ini, satu unggahan 170 MB memakai ±4× trafik server (naik terpotong →
 * turun untuk dirakit → naik lagi per bagian). Dengan ini: ±0 byte.
 */

/** Nama berkas ImageKit yang aman (dipakai sebagai kunci di tabel `files`). */
export const KEY_RE = /^[A-Za-z0-9._-]{6,120}$/;

/**
 * Terbitkan parameter autentikasi unggah client-side ImageKit.
 * signature = HMAC-SHA1(privateKey, token + expire) — sesuai SDK resmi.
 * `expire` wajib < 1 jam ke depan.
 */
export function izinUnggahIK(detikBerlaku = 40 * 60) {
  const token = crypto.randomUUID();
  const expire = Math.floor(Date.now() / 1000) + Math.min(detikBerlaku, 55 * 60);
  const signature = crypto
    .createHmac("sha1", IK.privateKey)
    .update(token + expire)
    .digest("hex");
  return { token, expire, signature };
}

/** Info statis yang dibutuhkan browser untuk unggah langsung. */
export function infoUnggahIK() {
  return {
    uploadUrl: "https://upload.imagekit.io/api/v1/files/upload",
    publicKey: IK.publicKey,
    folder: IK.folder,
    partMax: PART_MAX,
  };
}

/**
 * Ambil metadata satu berkas di ImageKit ({ name, size, filePath, url, … }).
 * Dipakai untuk MEMVERIFIKASI unggahan langsung: klien tidak boleh mendaftarkan
 * fileId sembarangan. Respons hanya beberapa ratus byte.
 */
export async function metaFileIK(fileId) {
  try {
    const res = await fetch(
      `https://api.imagekit.io/v1/files/${encodeURIComponent(fileId)}/details`,
      { headers: { Authorization: authHeader() } }
    );
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/** Catat pemetaan key → fileId (agar penghapusan nanti bisa dilakukan). */
export async function catatFileIK(key, fileId, url = "") {
  await q(
    `INSERT INTO files (key, file_id, url) VALUES ($1, $2, $3)
     ON CONFLICT (key) DO UPDATE SET file_id = EXCLUDED.file_id, url = EXCLUDED.url`,
    [key, fileId || "", url || ""]
  );
}

/**
 * Nama berkas tiap bagian pada unggahan langsung.
 * Berkas satu bagian tetap memakai ekstensi aslinya (.pptx / .docx) agar CDN
 * mengirim content-type yang benar (penampil Microsoft Office menolak berkas
 * ber-ekstensi .bin). Berkas multi-bagian bukan dokumen utuh, jadi .bin.
 */
export const namaBagian = (stem, i, jumlah, ext = ".pptx") =>
  jumlah > 1 ? `${stem}.part${i}.bin` : `${stem}${ext}`;

/** Kunci yang disimpan di kolom file_key untuk unggahan langsung. */
export const kunciUnggahan = (stem, jumlah, ext = ".pptx") =>
  jumlah > 1 ? `multi:${jumlah}:${stem}` : namaBagian(stem, 0, 1, ext);

/** Pangkal nama unik untuk sekumpulan bagian (dipakai unggah langsung). */
export const buatStem = (prefix = "ppt") => buatKey(prefix, "");

/**
 * Tanda tangan internal (HMAC) — dipakai untuk menitipkan data ke klien
 * (mis. pangkal nama berkas) lalu memverifikasinya saat kembali, sehingga
 * klien tidak bisa mengarang kunci berkas milik orang lain.
 */
export const tandaInternal = (data) =>
  crypto
    .createHmac("sha256", IK.privateKey || "logbook-lokal")
    .update(String(data))
    .digest("hex")
    .slice(0, 32);

/** Daftar signed URL tiap bagian — dipakai browser untuk pratinjau/unduh. */
export function signedUrlBagian(key, detik = 3600) {
  return kunciBagian(key).map((k) => signedUrl(k, detik));
}

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
 *
 * `lebar` (opsional) menyisipkan transformasi ImageKit `tr=w-…` sehingga CDN
 * mengirim versi KECIL gambar. Ini yang membuat daftar/galeri hemat: berkas
 * 1600px (±300 KB) diganti ±320px (±20–40 KB) — sekitar 80–90% lebih ringan,
 * tanpa perubahan apa pun pada berkas yang tersimpan.
 *
 * Penting: parameter `tr` harus ikut DITANDATANGANI (persis seperti SDK resmi
 * yang menandatangani URL lengkap beserta query-nya), kalau tidak ImageKit
 * akan menolak tautan saat "Restrict unsigned URLs" aktif.
 */
export function signedUrl(key, detik = 3600, lebar = 0) {
  const relatif = `${IK.folder}/${key}`.replace(/^\/+/, "");
  const dasar = `${IK.urlEndpoint}/${relatif}`;
  // q-70: kualitas sedikit diturunkan khusus thumbnail (mata tidak melihat
  // bedanya pada ukuran kecil, tapi ukurannya jauh lebih ringan).
  const url = lebar ? `${dasar}?tr=w-${lebar},q-70` : dasar;
  const kedaluwarsa = Math.floor(Date.now() / 1000) + detik;
  const signature = crypto
    .createHmac("sha1", IK.privateKey)
    .update(url.replace(IK.urlEndpoint + "/", "") + kedaluwarsa)
    .digest("hex");
  const pemisah = url.includes("?") ? "&" : "?";
  return `${url}${pemisah}ik-t=${kedaluwarsa}&ik-s=${signature}`;
}

/**
 * Versi kecil gambar untuk mode LOKAL (tanpa ImageKit) — dibuat on-the-fly
 * dengan sharp lalu disimpan di memori. Cache dibatasi jumlahnya supaya
 * pemakaian RAM tetap terkendali.
 */
const cacheThumb = new Map();
const THUMB_CACHE_MAX = 120;

export async function thumbLokal(key, lebar) {
  const kunci = `${key}|${lebar}`;
  const ada = cacheThumb.get(kunci);
  if (ada) return ada;
  const p = safePath(key);
  if (!fs.existsSync(p)) return null;
  try {
    const buf = await sharp(p, { failOn: "none" })
      .rotate()
      .resize(lebar, lebar, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 70, progressive: true, mozjpeg: true })
      .toBuffer();
    if (cacheThumb.size >= THUMB_CACHE_MAX) {
      cacheThumb.delete(cacheThumb.keys().next().value); // buang yang tertua
    }
    cacheThumb.set(kunci, buf);
    return buf;
  } catch {
    return null; // format aneh/rusak → pemanggil kirim berkas aslinya
  }
}


/**
 * Ambil isi berkas sebagai Buffer — dipakai ekspor DOCX/PDF untuk menyematkan
 * foto ke dokumen. Cloud: unduh dari signed URL; lokal: baca file.
 * Mengembalikan null bila tidak ada/gagal (ekspor tetap jalan tanpa foto itu).
 *
 * BATAS WAKTU wajib: tanpa ini satu permintaan CDN yang menggantung akan
 * membekukan seluruh proses ekspor (dan menghabiskan jatah durasi fungsi
 * serverless) — lebih baik satu foto dilewati daripada unduhan gagal total.
 */
const AMBIL_TIMEOUT_MS = 15_000;

export async function getFileBuffer(key) {
  try {
    if (pakaiCloud()) {
      const res = await fetch(signedUrl(key, 300), {
        signal: AbortSignal.timeout(AMBIL_TIMEOUT_MS),
      });
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

