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
  "z-index:2147483001",
  "function bukaDialog",
  "function tutupDialog",
  "tutupSemuaDialog",
  '.matches(":modal")',
  "dlg-bg",
  'e.key !== "Escape"',
  // ---- pusat kendali multi-halaman (URL rapi + History API) ----
  "function keHalaman",
  "function urlHal",
  "function halDariPath",
  "popstate",
  'id="hal-ringkas"',
  'id="hal-akun"',
  'id="hal-sesi"',
  'id="hal-audit"',
  'id="hal-pengaturan"',
  'data-page="sesi"',
  // ---- halaman Perangkat & sesi ----
  "function renderAkunSesi",
  "function kartuAkunSesi",
  "function barisPerangkat",
  "function renderStatSesi",
  "function renderFilterPeran",
  'data-mode-sesi="akun"',
  "data-peran-sesi",
  "BUKA_SESI",
  "loginTerakhir",
  "pengampu",
  // ---- jejak audit dengan saringan ----
  "data-fil-audit",
  "AUDIT_N",
  "AUDIT_F",
  "/data/audit?n=",
];
const hilang = wajib.filter((k) => !PANEL_HTML.includes(k));
if (hilang.length) {
  gagal += 1;
  console.log(`❌ penanda fitur hilang: ${hilang.join(", ")}`);
} else {
  console.log("✅ semua penanda fitur ada di panel");
}

// Setiap $("#id") yang dipanggil skrip harus benar-benar ada di markup —
// menangkap salah ketik id yang baru terasa saat panel dibuka di peramban.
const idDipakai = [...blok.join("\n").matchAll(/\$\("#([a-zA-Z0-9_-]+)"\)/g)].map((m) => m[1]);
const idHilang = [...new Set(idDipakai)].filter((id) => !PANEL_HTML.includes(`id="${id}"`));
if (idHilang.length) {
  gagal += 1;
  console.log(`❌ id dipakai skrip tapi tidak ada di markup: ${idHilang.join(", ")}`);
} else {
  console.log(`✅ ${new Set(idDipakai).size} id elemen yang dipakai skrip semuanya ada`);
}

// Tag pembungkus harus seimbang — satu </div> yang terlewat bisa merusak
// seluruh tata letak halaman tanpa memunculkan error apa pun di konsol.
const markup = PANEL_HTML.slice(PANEL_HTML.indexOf("<body>"), PANEL_HTML.indexOf("<script>"));
const timpang = [];
for (const t of ["div", "section", "aside", "header", "nav", "table", "tbody", "form", "dialog"]) {
  const buka = (markup.match(new RegExp(`<${t}\\b`, "g")) || []).length;
  const tutup = (markup.match(new RegExp(`</${t}>`, "g")) || []).length;
  if (buka !== tutup) timpang.push(`${t} (${buka} buka / ${tutup} tutup)`);
}
if (timpang.length) {
  gagal += 1;
  console.log(`❌ tag tidak seimbang: ${timpang.join(", ")}`);
} else {
  console.log("✅ struktur tag markup seimbang");
}

console.log(gagal ? `\n${gagal} MASALAH DITEMUKAN` : "\nPANEL VALID");
process.exit(gagal ? 1 : 0);

