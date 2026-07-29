/**
 * Validasi sintaks JavaScript yang tertanam di dalam PANEL_HTML
 * (pusat kendali). `node --check src/admin/panel.js` hanya memeriksa
 * berkas modulnya, bukan isi template string `<script>` di dalamnya.
 *
 * Jalankan: node backend/diag-panel.mjs
 */
import vm from "node:vm";
import { PANEL_HTML } from "./src/admin/panel.js";

const blok = [...PANEL_HTML.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)]
  .map((m) => m[1])
  .filter((s) => s.trim());

console.log(`Panel HTML: ${PANEL_HTML.length} char, ${blok.length} blok <script>`);

let gagal = 0;
blok.forEach((src, i) => {
  try {
    new vm.Script(src, { filename: `panel-script-${i}.js` });
    console.log(`✅ blok #${i} (${src.length} char)`);
  } catch (e) {
    gagal += 1;
    console.log(`❌ blok #${i}: ${e.message}`);
  }
});

// Pastikan penanda fitur fasilitator benar-benar ada di panel
const wajib = [
  "VIEW_ROLE",
  'data-role-tab="fasilitator"',
  'id="d-tim"',
  "/data/kode-fasilitator",
  "/laporan-file",
  "AKSI_INFO",
];
const hilang = wajib.filter((k) => !PANEL_HTML.includes(k));
if (hilang.length) {
  gagal += 1;
  console.log(`❌ penanda fitur hilang: ${hilang.join(", ")}`);
} else {
  console.log("✅ semua penanda fitur fasilitator ada di panel");
}

console.log(gagal ? `\n${gagal} MASALAH DITEMUKAN` : "\nPANEL VALID");
process.exit(gagal ? 1 : 0);

