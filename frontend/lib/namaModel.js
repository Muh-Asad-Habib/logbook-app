/**
 * Perapi NAMA MODEL AI — murni (tanpa React/DOM) supaya bisa diuji langsung
 * dengan node, lihat backend/diag-nama-model.mjs.
 *
 * Nama mentah dari Ollama dibuat untuk mesin, bukan untuk dibaca orang:
 *   hf.co/gmonsoon/gemma2-9b-cpt-sahabatai-v1-instruct-GGUF:Q8_0
 *   qwen2.5:7b-instruct · phi4-reasoning:plus · gpt-oss · gemma4-16k
 * Modul ini mengubahnya jadi bentuk yang enak dipandang di daftar pilihan.
 * Nama asli TIDAK pernah dibuang — pemanggil tetap menyimpannya di atribut
 * title, karena pengguna kadang butuh tag persis Ollama.
 */

/** Kata yang punya penulisan resmi sendiri (tanpa ini jadi "Gpt Oss"). */
const EJAAN = {
  gpt: "GPT", oss: "OSS", vl: "VL", vlm: "VLM", llm: "LLM", ai: "AI",
  moe: "MoE", cpt: "CPT", smollm: "SmolLM", translategemma: "TranslateGemma",
  sahabatai: "SahabatAI", instruct: "Instruct", coder: "Coder", uncensored: "Uncensored",
};

/** Satu penggal nama → bentuk yang enak dibaca. */
function penggalCantik(k) {
  const kecil = String(k).toLowerCase();
  if (EJAAN[kecil]) return EJAAN[kecil];
  if (/^\d+(\.\d+)?[bmk]$/.test(kecil)) return kecil.toUpperCase(); // 7b → 7B, 135m → 135M
  if (/^v\d+$/.test(kecil)) return kecil;                            // v1 tetap huruf kecil
  if (/^[\d.]+$/.test(kecil)) return kecil;                          // 2.5
  // "qwen2.5vl" → "Qwen 2.5 VL", "gemma4" → "Gemma 4", "phi4" → "Phi 4"
  const m = kecil.match(/^([a-z]+)([\d.]+)([a-z]*)$/);
  if (m) return [m[1], m[2], m[3]].filter(Boolean).map(penggalCantik).join(" ");
  return kecil.charAt(0).toUpperCase() + kecil.slice(1);
}

/**
 * Nama model yang enak dipandang.
 * @example namaCantik("qwen2.5:7b-instruct") // "Qwen 2.5 7B Instruct"
 */
export function namaCantik(nama) {
  const asli = String(nama || "");
  const bersih = asli
    .replace(/^hf\.co\/[^/]+\//i, "")                    // repo Hugging Face
    .replace(/:latest$/i, "")                            // tag bawaan
    .replace(/[-_.]?gguf/i, "")                          // format berkas
    // Penanda kuantisasi/presisi di ujung nama — detail teknis yang tidak
    // membantu saat memilih model (":Q8_0", "-fp16", "-bf16", "-int4").
    .replace(/[-_:](q\d+[\w]*|fp\d+|bf\d+|f16|int\d+)$/i, "");
  const penggal = bersih.split(/[\s:\-_/]+/).filter(Boolean);
  return penggal.map(penggalCantik).join(" ") || asli;
}

/** Dua kata pertama — untuk kepala panel yang ruangnya sempit. */
export const namaSingkat = (s) => namaCantik(s).split(" ").slice(0, 2).join(" ");

/** "4,7 GB" — ukuran unduhan model. */
export const fmtUkuran = (byte) =>
  byte > 0 ? `${(byte / 1024 ** 3).toLocaleString("id-ID", { maximumFractionDigits: 1 })} GB` : "";

/**
 * Jumlah parameter dalam MILIAR (0 bila tak diketahui).
 * Ollama melaporkannya sebagai teks: "7.6B", "134.52M", "355B".
 */
export function miliarParam(m) {
  const cocok = String(m?.parameter || "").trim().match(/^([\d.]+)\s*([BMK])?$/i);
  if (!cocok) return 0;
  const n = parseFloat(cocok[1]);
  if (!Number.isFinite(n)) return 0;
  const satuan = (cocok[2] || "B").toUpperCase();
  return satuan === "B" ? n : satuan === "M" ? n / 1e3 : n / 1e6;
}

/**
 * Ambang jumlah parameter → sifat yang BENAR-BENAR dirasakan pengguna.
 * Makin besar modelnya makin teliti jawabannya, tetapi makin lama menunggunya.
 */
const SIFAT = [
  [1, "Sangat cepat · paling sederhana"],
  [5, "Cepat · untuk pertanyaan ringan"],
  [10, "Seimbang · cepat & cukup teliti"],
  [25, "Lebih teliti · agak lambat"],
  [Infinity, "Paling teliti · paling lambat"],
];

/**
 * Keterangan model dalam bahasa sehari-hari.
 *
 * Angka "3.2B · 1,9 GB" tidak berarti apa-apa bagi kebanyakan orang — yang
 * ingin mereka tahu hanyalah "cepat atau teliti?". Rinciannya tidak hilang,
 * hanya dipindah ke tooltip lewat rincianTeknis().
 * @example sifatModel({ parameter: "3.2B" }) // "Cepat · untuk pertanyaan ringan"
 */
export function sifatModel(m) {
  const b = miliarParam(m);
  if (!b) {
    // Tanpa data parameter, ukuran berkas masih memberi petunjuk kasar
    const gb = (m?.ukuran || 0) / 1024 ** 3;
    if (!gb) return "";
    return gb < 2 ? SIFAT[1][1] : gb < 7 ? SIFAT[2][1] : gb < 15 ? SIFAT[3][1] : SIFAT[4][1];
  }
  return SIFAT.find(([batas]) => b < batas)[1];
}

/** Rincian teknis untuk tooltip — bagi yang memang ingin tahu angkanya. */
export function rincianTeknis(m) {
  const bagian = [m?.nama].filter(Boolean);
  if (m?.parameter) bagian.push(`${m.parameter} parameter`);
  const ukuran = fmtUkuran(m?.ukuran);
  if (ukuran) bagian.push(ukuran);
  return bagian.join(" · ");
}

