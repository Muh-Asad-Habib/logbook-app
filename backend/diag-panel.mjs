/**
 * Validasi sintaks JavaScript yang tertanam di dalam PANEL_HTML
 * (panel admin). `node --check src/admin/panel.js` hanya memeriksa
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

// Pastikan penanda fitur pendamping (fasilitator & dosen) ada di panel
const wajib = [
  "VIEW_ROLE",
  'data-role-tab="fasilitator"',
  'data-role-tab="dosen"',
  'id="d-tim"',
  "/data/kode-fasilitator",
  "/data/kode-dosen",
  "/laporan-file",
  "AKSI_INFO",
  "acc.setuju",
  // fitur presentasi & buat akun dari panel
  'data-tab="pre"',
  "tabelPresentasi",
  "/presentasi-file",
  'id="d-baru"',
  "user.buat",
  "punya_presentasi",
  // pintu darurat dialog (anti-nyangkut)
  "position:fixed;inset:0;margin:auto;z-index:90",
  'e.key !== "Escape"',
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

