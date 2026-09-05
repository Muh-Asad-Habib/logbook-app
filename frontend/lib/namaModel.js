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

/** Jumlah parameter (7B/9B) sudah tampak di namanya? */
export const adaParamDiNama = (s) => /\b\d+(\.\d+)?[BM]\b/.test(String(s));

/** "4,7 GB" — ukuran unduhan model, membantu menebak kecepatan jawabannya. */
export const fmtUkuran = (byte) =>
  byte > 0 ? `${(byte / 1024 ** 3).toLocaleString("id-ID", { maximumFractionDigits: 1 })} GB` : "";

/**
 * Keterangan kanan tiap baris, mis. "8.0B · 8,9 GB". Jumlah parameter
 * dilewati bila sudah tampak di nama, supaya barisnya tidak mengulang
 * informasi yang sama ("Qwen 2.5 7B Instruct" + "7.6B" → cukup ukurannya).
 */
export function metaModel(m, nama = "") {
  const bagian = [];
  if (m?.parameter && !adaParamDiNama(nama)) bagian.push(m.parameter);
  const ukuran = fmtUkuran(m?.ukuran);
  if (ukuran) bagian.push(ukuran);
  return bagian.join(" · ");
}

