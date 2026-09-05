/**
 * Peta rute + pagar peran. Memastikan:
 *  - `hanyaTim` terpasang di semua router tulis milik tim (termasuk /api/tim).
 *  - /api/fasilitator tidak punya route yang mengubah DATA tim; route tulis
 *    yang diizinkan hanya: tautan penampil laporan, gabung & keluar tim.
 *  - /api/komentar & /api/persetujuan lengkap.
 *  - /api/ai: seluruh router di balik `authRequired`; setiap endpoint yang
 *    memanggil model wajib punya `wajibAktif` + pembatas laju, dan endpoint
 *    penyunting data tim (perbaiki-kegiatan, saran-belanja) wajib `hanyaTim`.
 *
 * Jalankan: node backend/diag-rute.mjs
 */
const mod = async (p) => (await import(p)).default;

const target = [
  ["/api/kegiatan", "./src/routes/kegiatan.js", "hanyaTim"],
  ["/api/keuangan", "./src/routes/keuangan.js", "hanyaTim"],
  ["/api/pengaturan", "./src/routes/pengaturan.js", "hanyaTim"],
  ["/api/export", "./src/routes/export.js", "hanyaTim"],
  ["/api/import", "./src/routes/import.js", "hanyaTim"],
  ["/api/laporan", "./src/routes/laporan.js", "hanyaTim"],
  ["/api/presentasi", "./src/routes/presentasi.js", "hanyaTim"],
  ["/api/tim", "./src/routes/tim.js", "hanyaTim"],
  ["/api/fasilitator", "./src/routes/fasilitator.js", "hanyaPendamping"],
  ["/api/komentar", "./src/routes/komentar.js", null],
  ["/api/persetujuan", "./src/routes/persetujuan.js", null],
  ["/api/ai", "./src/routes/ai.js", "authRequired"],
];

/**
 * Endpoint AI yang benar-benar memanggil model bahasa — wajib punya sakelar
 * mati (wajibAktif) dan pembatas laju. `/status` & `/model` hanya membaca
 * metadata ringan yang sudah di-cache.
 */
const AI_PAKAI_MODEL = new Set(["/tanya", "/perbaiki-kegiatan", "/saran-belanja"]);

/**
 * Endpoint AI yang menyunting/menyusun data milik tim — pendamping tidak boleh
 * memakainya (mereka hanya boleh bertanya lewat POST /tanya dengan `tim`).
 */
const AI_WAJIB_HANYA_TIM = new Set(["/perbaiki-kegiatan", "/saran-belanja"]);

// Route tulis yang SAH di /api/fasilitator — tidak satu pun mengubah data tim
const TULIS_DIIZINKAN = new Set([
  "POST /tim/:timId/laporan-tautan", // tautan penampil Office (read-only)
  "POST /tim/:timId/presentasi-tautan", // tautan penampil PowerPoint (read-only)
  "POST /gabung", // gabung tim memakai kode milik tim
  "DELETE /tim/:timId", // keluar dari tim (melepas assignment sendiri)
]);

let gagal = 0;

for (const [mount, path, pagar] of target) {
  const router = await mod(path);
  const lapis = router.stack.map((l) => l.name);
  const rute = router.stack
    .filter((l) => l.route)
    .map((l) => `${Object.keys(l.route.methods).join("|").toUpperCase()} ${l.route.path}`);

  const adaPagar = pagar ? lapis.includes(pagar) : true;
  if (!adaPagar) gagal += 1;

  console.log(`\n${mount}  ${pagar ? (adaPagar ? `✅ ${pagar}` : `❌ ${pagar} HILANG`) : "(publik/khusus)"}`);
  rute.forEach((r) => console.log(`   ${r}`));

  // Fasilitator tidak boleh punya route yang mengubah data tim
  if (mount === "/api/fasilitator") {
    const tulis = rute.filter((r) => /^(POST|PUT|PATCH|DELETE)/.test(r));
    const nakal = tulis.filter((r) => !TULIS_DIIZINKAN.has(r));
    if (!nakal.length) {
      console.log(`   ✅ tidak mengubah data tim (${tulis.length} route tulis terdaftar & sah)`);
    } else {
      gagal += 1;
      console.log(`   ❌ route tulis tak terduga: ${nakal.join(", ")}`);
    }
  }

  // Setiap endpoint AI yang memanggil model harus punya sakelar mati (wajibAktif)
  // + pembatas laju; yang menyentuh data tim harus lewat hanyaTim.
  if (mount === "/api/ai") {
    const masalah = [];
    for (const l of router.stack.filter((x) => x.route)) {
      const jalur = l.route.path;
      const nama = l.route.stack.map((s) => s.name);
      // Pembatas laju dibuat pabrik rateLimit() → fungsi anonim; penangan akhir
      // juga anonim, jadi endpoint yang terbatasi laju punya ≥ 2 lapis anonim.
      const adaLaju = nama.filter((n) => !n || n === "<anonymous>").length >= 2;
      const perluModel = AI_PAKAI_MODEL.has(jalur);
      if (!nama.includes("wajibAktif") && jalur !== "/status") masalah.push(`${jalur}: wajibAktif hilang`);
      if (perluModel && !adaLaju) masalah.push(`${jalur}: pembatas laju hilang`);
      if (AI_WAJIB_HANYA_TIM.has(jalur) && !nama.includes("hanyaTim")) {
        masalah.push(`${jalur}: hanyaTim hilang`);
      }
    }
    if (!masalah.length) {
      console.log("   ✅ wajibAktif di semua endpoint; pembatas laju di endpoint pemanggil model; hanyaTim di perbaiki-kegiatan & saran-belanja");
    } else {
      gagal += 1;
      console.log(`   ❌ ${masalah.join(", ")}`);
    }
  }
}

console.log(gagal ? `\n${gagal} MASALAH DITEMUKAN` : "\nSEMUA PAGAR & RUTE SESUAI RENCANA");
process.exit(gagal ? 1 : 0);

