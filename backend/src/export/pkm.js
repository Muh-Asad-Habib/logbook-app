/**
 * Label sumber dana & kategori PKM 2026 untuk keperluan ekspor.
 * Nilai kosong berarti tim belum memilih (fitur opsional).
 */
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

/** Teks ringkas "Belmawa · Bahan habis pakai" (atau "-" bila belum dipilih). */
export const teksSumber = (e) => {
  const s = LABEL_SUMBER[e?.sumber];
  if (!s) return "-";
  const k = e.sumber === "belmawa" ? LABEL_KATEGORI[e.kategori] : "";
  return k ? `${s} · ${k}` : s;
};

