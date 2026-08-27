/**
 * Draf isian form — jaring pengaman saat simpan gagal.
 *
 * Isi teks form (bukan berkas foto) disimpan sementara di localStorage, lalu
 * dipulihkan ketika dialog dibuka kembali. Berguna saat koneksi putus atau
 * unggahan foto ditolak: pengguna tidak perlu mengetik ulang dari awal.
 *
 * Draf otomatis dibuang setelah entri berhasil tersimpan.
 */

const AWALAN = "logbook_draf_";
const UMUR_MS = 24 * 60 * 60 * 1000; // draf lebih tua dari sehari diabaikan

const kunci = (nama) => `${AWALAN}${nama}`;

/** Simpan draf (objek sederhana berisi nilai field). */
export function simpanDraf(nama, data) {
  try {
    localStorage.setItem(kunci(nama), JSON.stringify({ ts: Date.now(), data }));
  } catch {}
}

/** Ambil draf bila masih segar; selain itu null. */
export function ambilDraf(nama) {
  try {
    const mentah = localStorage.getItem(kunci(nama));
    if (!mentah) return null;
    const { ts, data } = JSON.parse(mentah);
    if (!ts || Date.now() - ts > UMUR_MS) {
      localStorage.removeItem(kunci(nama));
      return null;
    }
    return data || null;
  } catch {
    return null;
  }
}

/** Hapus draf (dipanggil setelah simpan berhasil atau saat dibatalkan). */
export function hapusDraf(nama) {
  try {
    localStorage.removeItem(kunci(nama));
  } catch {}
}

