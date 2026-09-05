/**
 * Diagnosa PERAPI NAMA MODEL (tanpa database, tanpa server).
 *
 *  - nama mentah Ollama diubah jadi bentuk yang enak dibaca
 *  - penanda teknis (repo Hugging Face, GGUF, kuantisasi, tag :latest) dibuang
 *  - singkatan resmi tetap benar (GPT, OSS, VL, SmolLM, SahabatAI, …)
 *  - ukuran parameter tidak diulang bila sudah tampak di nama
 *  - hasilnya cukup pendek untuk baris daftar (dicek pada nama TERPANJANG)
 *  - bila server AI terjangkau, SELURUH model yang benar-benar ada di sana
 *    ikut diuji supaya tidak ada nama yang tampil aneh di layar
 *
 * Jalankan dari folder backend:  node diag-nama-model.mjs
 */
import { namaCantik, namaSingkat, metaModel, fmtUkuran } from "../frontend/lib/namaModel.js";

let lulus = 0, gagal = 0;
const cek = (nama, kondisi, info = "") => {
  if (kondisi) { lulus++; console.log(`  OK    ${nama}`); }
  else { gagal++; console.log(`  GAGAL ${nama} ${info}`); }
};
const sama = (masuk, harap) => {
  const hasil = namaCantik(masuk);
  cek(`${masuk}  →  ${harap}`, hasil === harap, `dapat "${hasil}"`);
};

/** Batas aman lebar kolom nama pada panel tersempit (±30 karakter). */
const MAKS_TAMPIL = 30;

try {
  console.log("== Nama model dirapikan ==");
  sama("qwen2.5:7b-instruct", "Qwen 2.5 7B Instruct");
  sama("smollm2:135m", "SmolLM 2 135M");
  sama("llama3.2", "Llama 3.2");
  sama("llama3.2:latest", "Llama 3.2");
  sama("translategemma", "TranslateGemma");
  sama("qwen2.5vl", "Qwen 2.5 VL");
  sama("gemma4", "Gemma 4");
  sama("gemma4-16k", "Gemma 4 16K");
  sama("phi4-reasoning:plus", "Phi 4 Reasoning Plus");
  sama("gpt-oss", "GPT OSS");
  sama("gemma3:27b", "Gemma 3 27B");
  sama("qwen3-coder:30b", "Qwen 3 Coder 30B");
  sama("qwen2.5-coder:32b", "Qwen 2.5 Coder 32B");
  sama("qwen3.6", "Qwen 3.6");

  console.log("\n== Penanda teknis dibuang ==");
  sama("hf.co/gmonsoon/gemma2-9b-cpt-sahabatai-v1-instruct-GGUF:Q8_0",
    "Gemma 2 9B CPT SahabatAI v1 Instruct");
  sama("hf.co/pengguna/model-GGUF:Q4_K_M", "Model");
  sama("mistral:7b-instruct-fp16", "Mistral 7B Instruct");
  sama("llama3:8b-instruct-q4_K_M", "Llama 3 8B Instruct");
  cek("nama kosong tidak bikin error", namaCantik("") === "" && namaCantik(null) === "");
  cek("nama tak dikenal tetap tampil apa adanya (huruf besar di awal)",
    namaCantik("modelbaru") === "Modelbaru", namaCantik("modelbaru"));

  console.log("\n== Bentuk singkat (kepala panel) ==");
  cek("qwen2.5:7b-instruct → 'Qwen 2.5'", namaSingkat("qwen2.5:7b-instruct") === "Qwen 2.5",
    namaSingkat("qwen2.5:7b-instruct"));
  cek("gpt-oss → 'GPT OSS'", namaSingkat("gpt-oss") === "GPT OSS");
  cek("nama panjang dipangkas 2 kata",
    namaSingkat("hf.co/gmonsoon/gemma2-9b-cpt-sahabatai-v1-instruct-GGUF:Q8_0") === "Gemma 2");

  console.log("\n== Keterangan kanan (tanpa pengulangan) ==");
  cek("ukuran dibaca gaya Indonesia", fmtUkuran(4.4 * 1024 ** 3) === "4,4 GB", fmtUkuran(4.4 * 1024 ** 3));
  cek("tanpa ukuran → kosong", fmtUkuran(0) === "");
  const m1 = { parameter: "7.6B", ukuran: 4.4 * 1024 ** 3 };
  cek("parameter DILEWATI bila sudah ada di nama",
    metaModel(m1, "Qwen 2.5 7B Instruct") === "4,4 GB", metaModel(m1, "Qwen 2.5 7B Instruct"));
  const m2 = { parameter: "8.0B", ukuran: 8.9 * 1024 ** 3 };
  cek("parameter DITAMPILKAN bila nama tidak menyebutnya",
    metaModel(m2, "Gemma 4") === "8.0B · 8,9 GB", metaModel(m2, "Gemma 4"));
  cek("'16K' bukan jumlah parameter → parameter tetap tampil",
    metaModel(m2, "Gemma 4 16K") === "8.0B · 8,9 GB", metaModel(m2, "Gemma 4 16K"));

  console.log("\n== Panjang tampilan ==");
  const panjang = namaCantik("hf.co/gmonsoon/gemma2-9b-cpt-sahabatai-v1-instruct-GGUF:Q8_0");
  cek(`nama terpanjang ${panjang.length} karakter (dipotong elipsis di layar)`,
    panjang.length <= 40, panjang);
  cek("nama umum muat tanpa dipotong",
    ["qwen2.5:7b-instruct", "gemma3:27b", "gpt-oss", "phi4-reasoning:plus"]
      .every((n) => namaCantik(n).length <= MAKS_TAMPIL));

  // ---- Model NYATA di server kampus (dilewati bila tidak ada internet) ----
  console.log("\n== Model nyata di server AI ==");
  const { daftarModel } = await import("./src/ai/klien.js");
  const daftar = await daftarModel();
  if (!daftar.length) {
    console.log("  (server AI tidak terjangkau — bagian ini dilewati)");
  } else {
    const buruk = [];
    for (const m of daftar) {
      const cantik = namaCantik(m.label);
      // Tidak boleh kosong, tidak boleh menyisakan penanda teknis, dan tidak
      // boleh ada penggal yang masih huruf kecil semua (tanda belum dirapikan).
      if (!cantik ||
          /hf\.co|gguf|:latest|_/i.test(cantik) ||
          cantik.split(" ").some((w) => /^[a-z]{2,}$/.test(w))) {
        buruk.push(`${m.label} → "${cantik}"`);
      }
      console.log(`    ${m.label.padEnd(52)} → ${cantik}  [${metaModel(m, cantik) || "-"}]`);
    }
    cek(`${daftar.length} nama model tampil rapi`, buruk.length === 0, buruk.join(" | "));
  }

  console.log(`\n== HASIL: ${lulus} lulus, ${gagal} gagal ==`);
} catch (err) {
  console.error("ERROR:", err);
  gagal++;
}
process.exit(gagal ? 1 : 0);

