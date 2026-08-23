"use client";

/**
 * Unduhan foto sebagai JPG — per foto, per entri, atau keseluruhan (ZIP).
 *
 * ZIP dirakit DI BROWSER (JSZip), bukan di server, karena ZIP semua foto
 * bisa berukuran belasan MB — jauh melebihi batas respons serverless Vercel
 * (±4,5 MB). Tiap foto diambil lewat /api/files/:key?dl=1 (cookie HttpOnly
 * ikut otomatis; proteksi kepemilikan/anti-IDOR tetap berlaku di server,
 * dan server yang menormalkan resolusi — foto kecil di-upscale — serta
 * mengonversi PNG/WebP → JPG).
 */
import JSZip from "jszip";
import { fotoUrl } from "@/lib/api";

/** URL unduhan satu foto (Content-Disposition: attachment dari server). */
export const unduhUrl = (key) => `${fotoUrl(key)}?dl=1`;

/** Ekstensi hasil unduhan — server mempertahankan GIF, sisanya jadi JPG. */
const extUnduh = (key) => (/\.gif$/i.test(key) ? ".gif" : ".jpg");

/** Picu unduhan satu foto lewat anchor tersembunyi. */
export function unduhFoto(key) {
  const a = document.createElement("a");
  a.href = unduhUrl(key);
  a.download = ""; // nama dari header Content-Disposition server
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/** Simpan Blob sebagai berkas bernama `nama`. */
function simpanBlob(blob, nama) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nama;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

/**
 * Rakit ZIP dari daftar foto lalu simpan.
 * @param {{key: string, path: string}[]} daftar  path = lokasi dalam ZIP
 *   (mis. "kegiatan/2026-06-03/foto-1.jpg")
 * @param {string} namaZip
 * @param {(selesai: number, total: number) => void} [onProgress]
 * @returns {Promise<number>} jumlah foto yang berhasil masuk ZIP
 */
export async function unduhZipFoto(daftar, namaZip, onProgress) {
  const zip = new JSZip();
  let selesai = 0;
  let masuk = 0;

  // Maks. 4 permintaan paralel — cukup cepat tanpa membanjiri serverless
  const antrean = [...daftar];
  const pekerja = Array.from({ length: Math.min(4, antrean.length) }, async () => {
    for (;;) {
      const item = antrean.shift();
      if (!item) return;
      try {
        const res = await fetch(unduhUrl(item.key), { credentials: "include" });
        if (res.ok) {
          zip.file(item.path, await res.arrayBuffer());
          masuk++;
        }
      } catch {
        /* foto gagal diambil → dilewati, sisanya tetap masuk ZIP */
      }
      onProgress?.(++selesai, daftar.length);
    }
  });
  await Promise.all(pekerja);

  if (!masuk) throw new Error("Tidak ada foto yang berhasil diunduh");
  const blob = await zip.generateAsync({
    type: "blob",
    compression: "STORE", // JPEG sudah terkompresi — STORE jauh lebih cepat
  });
  simpanBlob(blob, namaZip);
  return masuk;
}

/**
 * Unduh semua foto SATU ENTRI:
 * 1 foto → langsung JPG; lebih → ZIP `awalan_tanggal.zip` berisi
 * foto-1.jpg, foto-2.jpg, …
 */
export async function unduhFotoEntri(keys, tanggal, awalan = "kegiatan", label = "foto") {
  if (!keys?.length) return;
  if (keys.length === 1) return unduhFoto(keys[0]);
  await unduhZipFoto(
    keys.map((k, i) => ({ key: k, path: `${label}-${i + 1}${extUnduh(k)}` })),
    `${awalan}_${tanggal}.zip`
  );
}

/**
 * Susun daftar {key, path} untuk ZIP KESELURUHAN — folder per tanggal:
 *   kegiatan/2026-06-03/foto-1.jpg, keuangan/2026-06-20/bukti-1.jpg, …
 * Nomor foto berlanjut dalam satu tanggal walau entrinya berbeda.
 */
export function susunDaftarZip(kegiatan = [], keuangan = []) {
  const daftar = [];
  const hitung = new Map(); // "kegiatan/2026-06-03" → jumlah terpakai
  const tambah = (folder, key, label) => {
    const n = (hitung.get(folder) || 0) + 1;
    hitung.set(folder, n);
    daftar.push({ key, path: `${folder}/${label}-${n}${extUnduh(key)}` });
  };
  for (const e of kegiatan) {
    for (const k of e.foto_keys || []) tambah(`kegiatan/${e.tanggal}`, k, "foto");
  }
  for (const e of keuangan) {
    const keys = e.bukti_keys?.length ? e.bukti_keys : e.bukti_key ? [e.bukti_key] : [];
    for (const k of keys) tambah(`keuangan/${e.tanggal}`, k, "bukti");
  }
  return daftar;
}

