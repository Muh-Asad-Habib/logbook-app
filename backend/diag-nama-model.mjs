/**
 * Diagnosa PERAPI NAMA MODEL (tanpa database, tanpa server).
 *
 *  - nama mentah Ollama diubah jadi bentuk yang enak dibaca
 *  - penanda teknis (repo Hugging Face, GGUF, kuantisasi, tag :latest) dibuang
 *  - singkatan resmi tetap benar (GPT, OSS, VL, SmolLM, SahabatAI, …)
 *  - angka teknis ("3.2B · 1,9 GB") diterjemahkan ke bahasa sehari-hari
 *    ("Cepat · untuk pertanyaan ringan"); angkanya pindah ke tooltip
 *  - hasilnya cukup pendek untuk baris daftar (dicek pada nama TERPANJANG)
 *  - bila server AI terjangkau, SELURUH model yang benar-benar ada di sana
 *    ikut diuji supaya tidak ada nama/keterangan yang tampil aneh di layar
 *
 * Jalankan dari folder backend:  node diag-nama-model.mjs
 */
import {
  namaCantik, namaSingkat, sifatModel, rincianTeknis, fmtUkuran, miliarParam,
} from "../frontend/lib/namaModel.js";

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

  console.log("\n== Keterangan untuk orang awam ==");
  cek("134.52M dibaca 0,13 miliar", Math.abs(miliarParam({ parameter: "134.52M" }) - 0.13452) < 1e-6);
  cek("7.6B dibaca 7,6 miliar", miliarParam({ parameter: "7.6B" }) === 7.6);
  cek("tanpa data parameter → 0", miliarParam({}) === 0 && miliarParam({ parameter: "?" }) === 0);

  const sifat = (p) => sifatModel({ parameter: p });
  const SIFAT_SEMUA = ["135M", "3.2B", "7.6B", "14.7B", "36.0B"].map(sifat);
  cek("model mungil → sangat cepat", sifat("135M").startsWith("Sangat cepat"), sifat("135M"));
  cek("3.2B → cepat (bukan '3.2B · 1,9 GB')", sifat("3.2B") === "Cepat · untuk pertanyaan ringan", sifat("3.2B"));
  cek("7.6B → seimbang", sifat("7.6B").startsWith("Seimbang"), sifat("7.6B"));
  cek("14.7B → lebih teliti", sifat("14.7B").startsWith("Lebih teliti"), sifat("14.7B"));
  cek("36B → paling teliti", sifat("36.0B").startsWith("Paling teliti"), sifat("36.0B"));
  cek("tanpa parameter, ukuran berkas jadi petunjuk",
    sifatModel({ ukuran: 0.3 * 1024 ** 3 }).startsWith("Cepat"), sifatModel({ ukuran: 0.3 * 1024 ** 3 }));
  cek("tanpa data apa pun → kosong", sifatModel({}) === "");
  cek("keterangan cukup pendek untuk satu baris",
    SIFAT_SEMUA.every((s) => s.length <= 34), JSON.stringify(SIFAT_SEMUA.map((s) => s.length)));

  console.log("\n== Rincian teknis pindah ke tooltip ==");
  const contoh = { nama: "llama3.2:latest", parameter: "3.2B", ukuran: 1.9 * 1024 ** 3 };
  cek("tooltip memuat nama asli, parameter & ukuran",
    rincianTeknis(contoh) === "llama3.2:latest · 3.2B parameter · 1,9 GB", rincianTeknis(contoh));
  cek("ukuran dibaca gaya Indonesia", fmtUkuran(4.4 * 1024 ** 3) === "4,4 GB", fmtUkuran(4.4 * 1024 ** 3));
  cek("tanpa ukuran → tidak disebut", !rincianTeknis({ nama: "x" }).includes("GB"));

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
      const ket = sifatModel(m);
      // Nama tidak boleh kosong / menyisakan penanda teknis / menyisakan
      // penggal huruf kecil, dan tiap model WAJIB punya keterangan awam.
      if (!cantik || !ket ||
          /hf\.co|gguf|:latest|_/i.test(cantik) ||
          cantik.split(" ").some((w) => /^[a-z]{2,}$/.test(w))) {
        buruk.push(`${m.label} → "${cantik}" / "${ket}"`);
      }
      console.log(`    ${cantik.padEnd(38)} ${ket}`);
    }
    cek(`${daftar.length} model tampil rapi & punya keterangan awam`, buruk.length === 0, buruk.join(" | "));
  }

  console.log(`\n== HASIL: ${lulus} lulus, ${gagal} gagal ==`);
} catch (err) {
  console.error("ERROR:", err);
  gagal++;
}
process.exit(gagal ? 1 : 0);

