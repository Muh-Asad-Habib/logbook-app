/**
 * Pengambil foto untuk SEMATAN dokumen ekspor (DOCX / PDF) — dipakai bersama
 * oleh docx.js, keuangan-docx.js, dan pdf.js supaya perilakunya seragam.
 *
 * Mengapa ada modul ini:
 *  - Dulu tiap penyusun dokumen mengunduh foto UTUH (≤2000 px, ±300–500 KB)
 *    dari CDN lalu mengecilkannya sendiri dengan sharp di serverless. Untuk
 *    logbook dengan 200 foto itu ±80 MB trafik + puluhan detik CPU.
 *  - Kini di mode cloud foto diminta ke ImageKit SUDAH berukuran sematan
 *    (`w-1000,h-1000,c-at_max,q-85,f-jpg`) — CDN yang mengecilkan, kita
 *    hanya menerima ±60–120 KB per foto dan tidak menyentuh sharp sama sekali
 *    (kecuali foto sangat kecil yang perlu di-upscale agar tidak pecah).
 *  - Paralelisme dibatasi (bukan Promise.all tanpa batas) agar koneksi CDN
 *    tidak membanjir dan RAM tetap terkendali.
 *  - Ukuran sematan dipilih SEKALI dari jumlah foto (`dimUntukJumlah`) —
 *    menggantikan loop "kompres ulang semua bila total > anggaran" yang
 *    memproses tiap foto sampai tiga kali.
 */
import path from "node:path";
import {
  pakaiCloud, getFileBufferTr, getFileBufferRetry, siapkanEmbed, jalankanTerbatas,
} from "../files.js";

/** Sisi terpanjang minimal agar foto tidak tampak pecah saat dicetak. */
const EMBED_MIN = 700;
/** Jumlah unduhan CDN yang berjalan bersamaan. */
const PARALEL = 6;

/**
 * Pilih resolusi & mutu sematan dari JUMLAH foto unik dalam dokumen.
 * Anggaran kasar: ±100 KB/foto pada 1000px → 60 foto ≈ 6 MB; di atas itu
 * diturunkan bertahap supaya berkas Word/PDF tetap nyaman dibuka.
 */
export function dimUntukJumlah(n) {
  if (n <= 60) return { dim: 1000, mutu: 85 };
  if (n <= 150) return { dim: 800, mutu: 80 };
  return { dim: 640, mutu: 76 };
}

/** Baca dimensi JPEG/PNG dari header buffer; null bila tak dikenali. */
export function ukuranGambar(buf) {
  try {
    if (!buf || buf.length < 24) return null;
    if (buf[0] === 0x89 && buf[1] === 0x50) { // PNG
      return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
    }
    if (buf[0] === 0xff && buf[1] === 0xd8) { // JPEG — cari marker SOFn
      let i = 2;
      while (i < buf.length - 8) {
        if (buf[i] !== 0xff) { i++; continue; }
        const marker = buf[i + 1];
        const len = buf.readUInt16BE(i + 2);
        if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
          return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
        }
        i += 2 + len;
      }
    }
  } catch {}
  return null;
}

const isJpegAtauPng = (b) =>
  !!b && ((b[0] === 0xff && b[1] === 0xd8) || (b[0] === 0x89 && b[1] === 0x50));

/**
 * String transformasi ImageKit untuk sematan. PNG dipertahankan (transparansi
 * & tangkapan layar tetap tajam), format lain → JPEG progresif. `c-at_max`
 * = muat di dalam kotak dim×dim tanpa memperbesar & tanpa crop; ImageKit juga
 * menerapkan orientasi EXIF sehingga foto HP tidak miring.
 */
const trUntuk = (key, dim, mutu) =>
  /\.png$/i.test(key)
    ? `w-${dim},h-${dim},c-at_max,f-png`
    : `w-${dim},h-${dim},c-at_max,q-${mutu},f-jpg,pr-true`;

/**
 * Ambil & siapkan SEKUMPULAN foto untuk disematkan.
 *
 * @param {string[]} keys  kunci berkas (duplikat otomatis disatukan)
 * @param {{dim?: number, mutu?: number, paralel?: number}} [opt]
 *   dim/mutu default dipilih dari jumlah foto (dimUntukJumlah).
 * @returns {Promise<Map<string, {buffer: Buffer, w: number, h: number}>>}
 *   Hanya foto yang berhasil (JPEG/PNG). GIF/WebP mentah dan kunci yang
 *   gagal diunduh TIDAK masuk peta — pemanggil melewatinya.
 */
export async function ambilFotoEmbed(keys, opt = {}) {
  const unik = [...new Set((keys || []).filter(Boolean))];
  const { dim, mutu } = { ...dimUntukJumlah(unik.length), ...opt };
  const paralel = opt.paralel || PARALEL;
  const peta = new Map();

  await jalankanTerbatas(unik, paralel, async (k) => {
    const r = await ambilSatu(k, dim, mutu);
    if (r) peta.set(k, r);
  });
  return peta;
}

/** Satu foto: jalur CDN-transform (cloud) → cadangan unduh utuh + sharp. */
async function ambilSatu(key, dim, mutu) {
  const gif = /\.gif$/i.test(key);
  if (pakaiCloud() && !gif) {
    const buf = await getFileBufferTr(key, trUntuk(key, dim, mutu));
    if (buf && isJpegAtauPng(buf)) {
      const uk = ukuranGambar(buf);
      // Foto kecil (mis. hasil impor Word 220–420 px): CDN tidak memperbesar,
      // jadi lewati sharp sekali untuk upscale + sharpen — berkasnya kecil,
      // biayanya tak berarti.
      if (uk && Math.max(uk.w, uk.h) < EMBED_MIN) {
        const r = await siapkanEmbed(buf, dim, mutu);
        if (r.ok) return { buffer: r.buffer, w: r.w, h: r.h };
      }
      if (uk) return { buffer: buf, w: uk.w, h: uk.h };
    }
    // CDN gagal/format tak terduga → jatuh ke jalur cadangan di bawah
  }
  const asli = await getFileBufferRetry(key, 3, 800);
  if (!asli) return null;
  const r = await siapkanEmbed(asli, dim, mutu);
  if (r.ok) return { buffer: r.buffer, w: r.w, h: r.h };
  // GIF mentah: Word masih bisa menampilkannya (rasio cadangan 4:3);
  // PDF melewatinya lewat bolehDiPdf(). Format lain yang gagal → dilewati.
  if (gif || (asli[0] === 0x47 && asli[1] === 0x49)) return { buffer: asli, w: 4, h: 3 };
  const uk = ukuranGambar(asli);
  return isJpegAtauPng(asli) && uk ? { buffer: asli, w: uk.w, h: uk.h } : null;
}

/** pdfkit hanya mendukung JPEG & PNG. */
export const bolehDiPdf = (buf) => isJpegAtauPng(buf);

/** Ekstensi konten dari BYTE (bukan nama) — untuk [Content_Types] & rels docx. */
export function extDariByte(buf, fallbackKey = "") {
  if (buf?.[0] === 0xff && buf[1] === 0xd8) return "jpeg";
  if (buf?.[0] === 0x89 && buf[1] === 0x50) return "png";
  if (buf?.[0] === 0x47 && buf[1] === 0x49) return "gif";
  const e = path.extname(fallbackKey).replace(".", "").toLowerCase();
  return e === "jpg" ? "jpeg" : e || "jpeg";
}


