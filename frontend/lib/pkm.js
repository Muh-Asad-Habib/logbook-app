/**
 * Aturan pendanaan PKM 2026 (opsional — hanya alat bantu, bukan pembatas).
 *
 * Dana kegiatan berasal dari dua sumber:
 *  - Belmawa  : besarnya berbeda tiap tim, dipecah menurut kategori dengan
 *               batas persentase pada pedoman PKM.
 *  - Perguruan Tinggi (PT): tanpa kategori, umumnya maksimal Rp2.000.000.
 *
 * Semua batas di sini dipakai sebagai INDIKATOR di halaman Keuangan; entri
 * tanpa sumber/kategori tetap sah dan hanya diberi tanda "belum dipilih".
 */

export const BATAS_DANA_PT = 2_000_000;

export const SUMBER_DANA = [
  { id: "belmawa", label: "Belmawa" },
  { id: "pt", label: "Perguruan Tinggi" },
];

/** Kategori belanja dana Belmawa + batas maksimum (persen dari dana Belmawa). */
export const KATEGORI_PKM = [
  { id: "bahan", label: "Bahan habis pakai", maks: 60 },
  { id: "sewa", label: "Sewa & jasa", maks: 15 },
  { id: "transport", label: "Transportasi lokal", maks: 30 },
  { id: "lain", label: "Lain-lain", maks: 15 },
];

export const labelSumber = (id) =>
  SUMBER_DANA.find((s) => s.id === id)?.label || "";

export const labelKategori = (id) =>
  KATEGORI_PKM.find((k) => k.id === id)?.label || "";

/**
 * Rekap pemakaian dana dari daftar entri belanja.
 *
 * @param {Array} items entri /api/keuangan
 * @param {{belmawa: number, pt: number}} dana dana yang diterima tim
 */
export function rekapDana(items = [], dana = {}) {
  const danaBelmawa = Number(dana.belmawa) || 0;
  const danaPt = Number(dana.pt) || 0;

  let totalBelmawa = 0;
  let totalPt = 0;
  let totalTanpaSumber = 0;
  let nTanpaSumber = 0;
  let nBelmawaTanpaKategori = 0;
  let totalBelmawaTanpaKategori = 0;
  const perKategori = Object.fromEntries(KATEGORI_PKM.map((k) => [k.id, 0]));

  for (const e of items) {
    const nilai = Number(e.total) || 0;
    if (e.sumber === "belmawa") {
      totalBelmawa += nilai;
      if (perKategori[e.kategori] !== undefined) perKategori[e.kategori] += nilai;
      else { nBelmawaTanpaKategori += 1; totalBelmawaTanpaKategori += nilai; }
    } else if (e.sumber === "pt") {
      totalPt += nilai;
    } else {
      totalTanpaSumber += nilai;
      nTanpaSumber += 1;
    }
  }

  const kategori = KATEGORI_PKM.map((k) => {
    const terpakai = perKategori[k.id];
    const batas = danaBelmawa > 0 ? (danaBelmawa * k.maks) / 100 : 0;
    const pctDana = danaBelmawa > 0 ? (terpakai / danaBelmawa) * 100 : 0;
    return {
      ...k,
      terpakai,
      batas,
      pct: Math.round(pctDana * 10) / 10,
      // proporsi terhadap batas kategori — untuk lebar progress bar
      pctBatas: batas > 0 ? Math.min(100, (terpakai / batas) * 100) : 0,
      lewat: batas > 0 && terpakai > batas,
    };
  });

  return {
    danaBelmawa,
    danaPt,
    totalBelmawa,
    totalPt,
    totalTanpaSumber,
    nTanpaSumber,
    nBelmawaTanpaKategori,
    totalBelmawaTanpaKategori,
    sisaBelmawa: danaBelmawa - totalBelmawa,
    sisaPt: danaPt - totalPt,
    ptLewatBatas: totalPt > BATAS_DANA_PT,
    kategori,
    total: totalBelmawa + totalPt + totalTanpaSumber,
  };
}

