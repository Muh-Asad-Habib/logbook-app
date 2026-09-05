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
  const cocok = String(m?.parameter || "").trim().match(/^(\d+(?:\.\d+)?)\s*([BMK])$/i);
  if (!cocok) return 0;
  const n = parseFloat(cocok[1]);
  if (!Number.isFinite(n) || n <= 0) return 0;
  const satuan = (cocok[2] || "B").toUpperCase();
  return satuan === "B" ? n : satuan === "M" ? n / 1e3 : n / 1e6;
}

/**
 * Kegunaan keluarga model yang dikenal, bukan peringkat kualitas.
 * Tidak disimpulkan dari jumlah parameter/ukuran berkas. UI saat ini hanya
 * mengirim teks, jadi model VL tidak ditawarkan sebagai fitur unggah gambar.
 * Nama yang belum dikenal mendapat label netral, bukan kemampuan karangan.
 */
export function sifatModel(m) {
  const nama = String(m?.nama || m?.label || "").toLowerCase();
  if (!nama) return "";
  if (nama.startsWith("translategemma")) return "Menerjemahkan teks antarbahasa";
  if (/^qwen[\d.]*-coder/.test(nama)) return "Membantu menulis & memahami kode";
  if (/^phi[\d.]*-reasoning/.test(nama)) return "Menguraikan masalah langkah demi langkah";
  if (nama.includes("sahabatai")) return "Percakapan berbahasa Indonesia";
  if (/^qwen[\d.]*vl/.test(nama)) return "Tanya jawab teks di asisten ini";
  if (/^qwen[\d.]*[:\-]/.test(nama) || /^qwen[\d.]+$/.test(nama)) return "Tanya jawab & merapikan tulisan";
  if (/^gemma\d/.test(nama)) return "Membantu menulis & meringkas teks";
  if (/^(llama\d|smollm\d|gpt-oss)/.test(nama)) return "Percakapan & pertanyaan sehari-hari";
  return "Model lain untuk dicoba";
}

/** Label heuristik, BUKAN hasil benchmark, waktu tunggu, atau peringkat akurasi.
 * Batas 5B/10B hanya panduan kasar untuk model dense pada server yang sama.
 * Total parameter MoE/layanan cloud bukan ukuran komputasi aktif, jadi jangan
 * mengurutkan kecepatannya dari angka itu. Ukuran berkas juga bukan pengganti.
 */
export function kecepatanModel(m) {
  const nama = String(m?.nama || m?.label || "").toLowerCase();
  const keluarga = String(m?.keluarga || "").toLowerCase();
  if (/:cloud$/.test(nama) ||
      /moe|gptoss|qwen3next|mixtral|deepseek[23]|dbrx|arctic/.test(keluarga) ||
      /gpt-oss|mixtral|qwen3-coder:30b|[-:]a\d+b/.test(nama)) {
    return "Belum ada perkiraan";
  }
  const b = miliarParam(m);
  if (!b) return "Belum ada perkiraan";
  if (/reasoning/.test(nama)) return "Perkiraan: lebih lama";
  if (b < 5) return "Perkiraan: cepat";
  if (b <= 10) return "Perkiraan: sedang";
  return "Perkiraan: lebih lama";
}

export const CATATAN_KECEPATAN = "Perkiraan kasar, bukan hasil uji kecepatan. Waktu sebenarnya dipengaruhi beban server, panjang percakapan dan jawaban. Bukan penilaian akurasi model.";

/** Rincian teknis untuk tooltip — bagi yang memang ingin tahu angkanya. */
export function rincianTeknis(m) {
  const bagian = [m?.nama].filter(Boolean);
  if (m?.parameter) bagian.push(`${m.parameter} parameter`);
  const ukuran = fmtUkuran(m?.ukuran);
  if (ukuran) bagian.push(ukuran);
  return bagian.join(" · ");
}

