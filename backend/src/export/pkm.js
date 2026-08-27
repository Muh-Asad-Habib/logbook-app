/**
 * Aturan & label pendanaan PKM 2026 untuk keperluan ekspor.
 *
 * Sengaja dipisah agar PDF dan Excel memakai angka yang sama persis dengan
 * kartu "Rekap dana PKM" di aplikasi. Semua penandaan bersifat OPSIONAL —
 * entri tanpa sumber/kategori tetap dihitung sebagai pengeluaran, hanya
 * dikelompokkan terpisah sebagai "belum dipilih".
 */

export const BATAS_DANA_PT = 2_000_000;

export const LABEL_SUMBER = {
  belmawa: "Belmawa",
  pt: "Perguruan Tinggi",
};

export const LABEL_KATEGORI = {
  bahan: "Bahan habis pakai",
  sewa: "Sewa & jasa",
  transport: "Transportasi lokal",
  lain: "Lain-lain",
};

/** Kategori + batas maksimum (persen dari dana Belmawa) — pedoman PKM 2026. */
export const KATEGORI_PKM = [
  { id: "bahan", label: LABEL_KATEGORI.bahan, maks: 60 },
  { id: "sewa", label: LABEL_KATEGORI.sewa, maks: 15 },
  { id: "transport", label: LABEL_KATEGORI.transport, maks: 30 },
  { id: "lain", label: LABEL_KATEGORI.lain, maks: 15 },
];

/** Teks ringkas "Belmawa · Bahan habis pakai" (atau "-" bila belum dipilih). */
export const teksSumber = (e) => {
  const s = LABEL_SUMBER[e?.sumber];
  if (!s) return "-";
  const k = e.sumber === "belmawa" ? LABEL_KATEGORI[e.kategori] : "";
  return k ? `${s} · ${k}` : s;
};

/**
 * Rekap pemakaian dana — dipakai bagian "Rekap dana" di PDF & Excel.
 * @param {Array} items entri keuangan
 * @param {{belmawa: number, pt: number}} dana nominal yang diterima tim
 */
export function rekapDana(items = [], dana = {}) {
  const danaBelmawa = Number(dana.belmawa) || 0;
  const danaPt = Number(dana.pt) || 0;

  let totalBelmawa = 0;
  let totalPt = 0;
  let totalTanpaSumber = 0;
  let nTanpaSumber = 0;
  let totalBelmawaTanpaKategori = 0;
  let nBelmawaTanpaKategori = 0;
  const per = Object.fromEntries(KATEGORI_PKM.map((k) => [k.id, 0]));

  for (const e of items) {
    const nilai = Number(e.total) || 0;
    if (e.sumber === "belmawa") {
      totalBelmawa += nilai;
      if (per[e.kategori] !== undefined) per[e.kategori] += nilai;
      else { nBelmawaTanpaKategori += 1; totalBelmawaTanpaKategori += nilai; }
    } else if (e.sumber === "pt") {
      totalPt += nilai;
    } else {
      totalTanpaSumber += nilai;
      nTanpaSumber += 1;
    }
  }

  const kategori = KATEGORI_PKM.map((k) => {
    const terpakai = per[k.id];
    const batas = danaBelmawa > 0 ? (danaBelmawa * k.maks) / 100 : 0;
    return {
      ...k,
      terpakai,
      batas,
      pct: danaBelmawa > 0 ? Math.round((terpakai / danaBelmawa) * 1000) / 10 : 0,
      lewat: batas > 0 && terpakai > batas,
    };
  });

  return {
    danaBelmawa, danaPt,
    totalBelmawa, totalPt,
    totalTanpaSumber, nTanpaSumber,
    totalBelmawaTanpaKategori, nBelmawaTanpaKategori,
    sisaBelmawa: danaBelmawa - totalBelmawa,
    sisaPt: danaPt - totalPt,
    ptLewatBatas: totalPt > BATAS_DANA_PT,
    adaPenandaan: totalBelmawa > 0 || totalPt > 0,
    kategori,
  };
}

