/**
 * Cek cepat kolom `kode_unik` pada tabel keuangan.
 *
 * Dipakai setelah deploy untuk memastikan migrasi skema sudah berjalan di
 * database (kolom dibuat otomatis oleh db.js saat query pertama).
 *
 * Jalankan:  node --env-file=.env tools/cek-kode-unik.mjs
 */
import { q } from "../backend/src/db.js";

const kolom = await q(
  `SELECT column_name, data_type, column_default, is_nullable
     FROM information_schema.columns
    WHERE table_name = 'keuangan' AND column_name = 'kode_unik'`
);

if (!kolom.length) {
  console.error("❌ Kolom kode_unik BELUM ada — migrasi belum berjalan.");
  process.exit(1);
}

const [k] = kolom;
console.log(`✅ Kolom ada : ${k.column_name} ${k.data_type} default ${k.column_default} (nullable: ${k.is_nullable})`);

const [ringkas] = await q(
  `SELECT COUNT(*) AS n,
          COUNT(*) FILTER (WHERE kode_unik > 0) AS n_berkode,
          COALESCE(SUM(kode_unik), 0) AS jml_kode,
          COUNT(*) FILTER (WHERE ROUND((harga_satuan * jumlah + kode_unik)::numeric, 2)
                              <> ROUND(total::numeric, 2)) AS n_tidak_cocok
     FROM keuangan`
);

console.log(`   Entri belanja : ${ringkas.n} (berkode unik: ${ringkas.n_berkode}, total kode unik: ${ringkas.jml_kode})`);
console.log(
  Number(ringkas.n_tidak_cocok) === 0
    ? "✅ Semua total konsisten: harga × jumlah + kode unik = total"
    : `⚠️  ${ringkas.n_tidak_cocok} entri totalnya tidak sama dengan harga × jumlah + kode unik`
);

