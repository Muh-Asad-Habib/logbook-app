/**
 * Kompresi foto di BROWSER sebelum diunggah.
 *
 * Kenapa perlu: di Vercel, serverless function menolak request ber-body
 * > ±4,5 MB (HTTP 413) SEBELUM sampai ke kode kita — kompresi sharp di
 * server sudah terlambat. Maka foto dikecilkan dulu di sini, meniru
 * pipeline server (maks 1600px, JPEG progresif ±kualitas 80).
 */

const MAX_DIM = 1600;                 // sisi terpanjang (sama dengan sharp server)
const KUALITAS = 0.8;                 // kualitas JPEG utama
const KUALITAS_ULANG = 0.65;          // bila hasil pertama masih besar
const TARGET_PER_FOTO = 900 * 1024;   // target ukuran per foto
const LEWATI_DI_BAWAH = 300 * 1024;   // foto kecil dikirim apa adanya

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
 * Kompres satu foto → File JPEG yang jauh lebih kecil.
 * GIF (bisa animasi) dan berkas kecil dilewatkan; bila kompresi gagal
 * atau tidak menghasilkan berkas lebih kecil, kembalikan berkas asli.
 */
export async function kompresFoto(file) {
  if (!file || !/^image\//.test(file.type) || file.type === "image/gif") return file;
  if (file.size <= LEWATI_DI_BAWAH) return file;
  try {
    const bmp = await bacaBitmap(file);
    const w = bmp.width || bmp.naturalWidth;
    const h = bmp.height || bmp.naturalHeight;
    if (!w || !h) return file;
    const skala = Math.min(1, MAX_DIM / Math.max(w, h));
    const kanvas = document.createElement("canvas");
    kanvas.width = Math.max(1, Math.round(w * skala));
    kanvas.height = Math.max(1, Math.round(h * skala));
    kanvas.getContext("2d").drawImage(bmp, 0, 0, kanvas.width, kanvas.height);
    bmp.close?.();

    let blob = await keBlob(kanvas, KUALITAS);
    if (blob && blob.size > TARGET_PER_FOTO) {
      const ulang = await keBlob(kanvas, KUALITAS_ULANG);
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
 * @returns {Promise<number>} total byte seluruh berkas setelah kompresi.
 */
export async function kompresFormFoto(fd, field = "foto") {
  const files = fd.getAll(field).filter((f) => f && typeof f === "object" && f.size > 0);
  fd.delete(field);
  if (!files.length) return 0;
  const hasil = await Promise.all(files.map(kompresFoto));
  let total = 0;
  for (const f of hasil) {
    fd.append(field, f);
    total += f.size;
  }
  return total;
}

