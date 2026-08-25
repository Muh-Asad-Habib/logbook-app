/**
 * Kompresi foto di BROWSER sebelum diunggah.
 *
 * Kenapa perlu: di Vercel, serverless function menolak request ber-body
 * > ±4,5 MB (HTTP 413) SEBELUM sampai ke kode kita — kompresi sharp di
 * server sudah terlambat.
 *
 * Prinsipnya "sehemat mungkin TANPA terlihat": langkah di sini sengaja
 * ringan (2048px, mutu 0,92) dan foto di bawah LEWATI_DI_BAWAH dikirim apa
 * adanya. Penghematan sesungguhnya dilakukan server dengan mozjpeg
 * (2000px, mutu 85) yang jauh lebih efisien daripada canvas browser pada
 * mutu yang sama. Kompresi diperketat HANYA bila total unggahan mendekati
 * batas Vercel — jadi kualitas tidak dikorbankan tanpa alasan.
 */

const MAX_DIM = 2048;                 // sisi terpanjang (server memangkas lagi ke 2000)
const KUALITAS = 0.92;                // mutu JPEG utama — praktis tak terlihat bedanya
const TARGET_PER_FOTO = 1.6 * 1024 * 1024; // di atas ini, mutu diturunkan sedikit
const KUALITAS_ULANG = 0.85;
const LEWATI_DI_BAWAH = 1024 * 1024;  // foto < 1 MB dikirim apa adanya (server yang mengompres)

/** Tahap penghematan tambahan bila TOTAL unggahan mendekati batas Vercel. */
const TAHAP_KETAT = [
  { dim: 1600, mutu: 0.82 },
  { dim: 1280, mutu: 0.72 },
];

/** Batas aman total upload per request (limit keras Vercel ±4,5 MB). */
export const BATAS_UPLOAD = 4 * 1024 * 1024;

/**
 * Muat ulang <img> yang gagal dimuat (onError) — browser TIDAK mengulang
 * gambar gagal secara otomatis, jadi kegagalan sesaat (timeout serverless /
 * database saat puluhan foto diminta serentak) membuat ikon rusak permanen
 * sampai halaman di-reload. Handler ini mencoba ulang maks. 3× dengan jeda
 * bertingkat + parameter cache-bust agar request benar-benar baru.
 * Pakai: <img src={fotoUrl(k)} onError={retryFoto} … />
 */
export function retryFoto(ev) {
  const img = ev?.currentTarget || ev?.target;
  if (!img || !img.src) return;
  const n = Number(img.dataset.retry || 0);
  if (n >= 3) return;
  img.dataset.retry = String(n + 1);
  const asli = img.dataset.srcAsli || img.src.replace(/[?&]rf=\d+/g, "");
  img.dataset.srcAsli = asli;
  setTimeout(() => {
    img.src = `${asli}${asli.includes("?") ? "&" : "?"}rf=${Date.now()}`;
  }, 700 * (n + 1));
}

export const fmtUkuran = (b) =>
  b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(b / 1024)} KB`;

/** Decode gambar → bitmap (hormati orientasi EXIF agar foto HP tidak miring). */
async function bacaBitmap(file) {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      /* lanjut ke fallback <img> */
    }
  }
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
    img.src = url;
  });
}

const keBlob = (kanvas, q) =>
  new Promise((resolve) => kanvas.toBlob(resolve, "image/jpeg", q));

/**
 * Kompres satu foto → File JPEG yang lebih ringan, dengan penurunan mutu
 * yang praktis tidak terlihat. GIF (bisa animasi) dan berkas kecil
 * dilewatkan; bila kompresi gagal atau tidak menghasilkan berkas lebih
 * kecil, kembalikan berkas asli.
 * @param {File} file
 * @param {{dim?: number, mutu?: number, lewatiDiBawah?: number}} [opsi]
 */
export async function kompresFoto(file, opsi = {}) {
  const dim = opsi.dim ?? MAX_DIM;
  const mutu = opsi.mutu ?? KUALITAS;
  const lewati = opsi.lewatiDiBawah ?? LEWATI_DI_BAWAH;
  if (!file || !/^image\//.test(file.type) || file.type === "image/gif") return file;
  if (file.size <= lewati) return file;
  try {
    const bmp = await bacaBitmap(file);
    const w = bmp.width || bmp.naturalWidth;
    const h = bmp.height || bmp.naturalHeight;
    if (!w || !h) return file;
    // Foto TIDAK pernah diperbesar di sini & rasionya dipertahankan penuh —
    // gambar utuh, tidak ada bagian yang terpotong.
    const skala = Math.min(1, dim / Math.max(w, h));
    const kanvas = document.createElement("canvas");
    kanvas.width = Math.max(1, Math.round(w * skala));
    kanvas.height = Math.max(1, Math.round(h * skala));
    const ctx = kanvas.getContext("2d");
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bmp, 0, 0, kanvas.width, kanvas.height);
    bmp.close?.();

    let blob = await keBlob(kanvas, mutu);
    if (blob && blob.size > TARGET_PER_FOTO) {
      const ulang = await keBlob(kanvas, Math.min(mutu, KUALITAS_ULANG));
      if (ulang && ulang.size < blob.size) blob = ulang;
    }
    if (!blob || blob.size >= file.size) return file; // tidak membantu → kirim asli
    const nama = (file.name || "foto").replace(/\.[^.]+$/, "") + ".jpg";
    return new File([blob], nama, { type: "image/jpeg" });
  } catch {
    return file; // gagal decode → biarkan server yang mengurus
  }
}

/**
 * Kompres semua berkas sebuah field di FormData (in-place).
 * Entri file kosong (input tidak diisi) ikut dibersihkan.
 *
 * Mutu tinggi dipakai lebih dulu; kompresi baru diperketat BILA total
 * unggahan mendekati batas keras Vercel — sehingga foto tetap jernih pada
 * kondisi normal, tanpa mengorbankan keberhasilan unggahan saat fotonya
 * banyak/besar.
 * @returns {Promise<number>} total byte seluruh berkas setelah kompresi.
 */
export async function kompresFormFoto(fd, field = "foto") {
  const files = fd.getAll(field).filter((f) => f && typeof f === "object" && f.size > 0);
  fd.delete(field);
  if (!files.length) return 0;

  const jumlah = (list) => list.reduce((s, f) => s + f.size, 0);
  let hasil = await Promise.all(files.map((f) => kompresFoto(f)));

  // Ambang 92% memberi ruang untuk batas multipart & field lain di form.
  const ambang = BATAS_UPLOAD * 0.92;
  for (const { dim, mutu } of TAHAP_KETAT) {
    if (jumlah(hasil) <= ambang) break;
    hasil = await Promise.all(
      hasil.map((f) => kompresFoto(f, { dim, mutu, lewatiDiBawah: 0 }))
    );
  }

  let total = 0;
  for (const f of hasil) {
    fd.append(field, f);
    total += f.size;
  }
  return total;
}

