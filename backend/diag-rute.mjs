/**
 * Peta rute + pagar peran. Memastikan:
 *  - `hanyaTim` terpasang di semua router tulis milik tim.
 *  - /api/fasilitator GET-only (kecuali laporan-tautan) + hanyaPendamping.
 *  - /api/komentar & /api/persetujuan lengkap.
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
  ["/api/fasilitator", "./src/routes/fasilitator.js", "hanyaPendamping"],
  ["/api/komentar", "./src/routes/komentar.js", null],
  ["/api/persetujuan", "./src/routes/persetujuan.js", null],
];

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

  // Fasilitator wajib read-only: hanya boleh 1 POST (laporan-tautan)
  if (mount === "/api/fasilitator") {
    const tulis = rute.filter((r) => /^(POST|PUT|PATCH|DELETE)/.test(r));
    if (tulis.length === 1 && tulis[0].includes("laporan-tautan")) {
      console.log("   ✅ read-only (hanya POST laporan-tautan)");
    } else {
      gagal += 1;
      console.log(`   ❌ route tulis tak terduga: ${tulis.join(", ") || "(tidak ada)"}`);
    }
  }
}

console.log(gagal ? `\n${gagal} MASALAH DITEMUKAN` : "\nSEMUA PAGAR & RUTE SESUAI RENCANA");
process.exit(gagal ? 1 : 0);

