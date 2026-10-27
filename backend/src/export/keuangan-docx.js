/**
 * Ekspor DOCX KHUSUS KEUANGAN — berformat lampiran laporan PKM
 * ("Lampiran 1. Penggunaan Dana"): tabel ringkas pendanaan, rincian belanja
 * per sumber dana (Belmawa per kategori, Perguruan Tinggi), dan dokumentasi
 * nota ber-kode.
 *
 * Berkas ini hanya mengambil data tim (entri keuangan, dana, profil PKM) lalu
 * mengunduh nota; penyusunan dokumennya ada di keuangan-lampiran.js (murni,
 * tanpa database, sehingga mudah diuji).
 */
import * as store from "../storage.js";
import { ambilFotoEmbed } from "./foto.js";
import { KUNCI_PROFIL_PKM, bacaProfilPkm } from "../ai/pengetahuan-pkm.js";
import { bikinMedia, buktiKeys, susunDocxKeuangan } from "./keuangan-lampiran.js";

/**
 * Unduh & siapkan seluruh nota milik daftar entri.
 * Ukuran sedang (1000 px, mutu 80): tajam saat dicetak selebar ±6 cm namun
 * dokumen tetap ringan walau notanya puluhan. Foto ditarik dari CDN sudah
 * berukuran itu dengan paralel terbatas (lihat foto.js).
 */
async function siapkanNota(entri) {
  const media = bikinMedia();
  const keys = [...new Set(entri.flatMap((e) => buktiKeys(e)))];
  const hasil = await ambilFotoEmbed(keys, { dim: 1000, mutu: 80 });
  // urutan pendaftaran dijaga stabil supaya penomoran media mudah dilacak
  for (const k of keys) {
    const r = hasil.get(k);
    if (r) media.tambah(k, r.buffer, r.w, r.h);
  }
  return media;
}

/**
 * Bangun berkas .docx khusus keuangan untuk satu tim.
 * Judul, skema, dan tahun pada tabel ringkas diambil dari Profil PKM tim.
 * @param {string|number} userId pemilik data
 * @param {string} namaTim nama tim untuk properti dokumen
 * @returns {Promise<Buffer>}
 */
export async function buildDocxKeuangan(userId, namaTim = "") {
  const [keuangan, dana, profilMentah] = await Promise.all([
    store.listKeuangan(userId),
    store.hitungDana(userId),
    store.getSetting(userId, KUNCI_PROFIL_PKM, ""),
  ]);
  const media = await siapkanNota(keuangan);
  return susunDocxKeuangan({
    keuangan,
    dana,
    profil: bacaProfilPkm(profilMentah),
    media,
    namaTim,
  });
}
