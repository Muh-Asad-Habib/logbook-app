/**
 * Uji cepat logika ekspor DOCX (tanpa database):
 * - baris cocok per-baris → disegarkan, tidak digandakan
 * - entri baru (termasuk teks pendek yang dulu salah ke-skip) → ditambahkan
 * - baris hasil akhir urut kronologis (bukan menumpuk di akhir tabel)
 * - tanggal lama bulan-angka ("23-05-2026") ikut diseragamkan
 * Jalankan: node tools/test-export-fill.mjs
 */

const BULAN = ["Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

const esc = (s) => String(s)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const tc = (t) => `<w:tc><w:tcPr><w:tcW w:w="1000"/></w:tcPr><w:p><w:r><w:t>${esc(t)}</w:t></w:r></w:p></w:tc>`;
const tr = (...cells) => `<w:tr>${cells.map(tc).join("")}</w:tr>`;
const trKosong = (n) => `<w:tr>${Array.from({ length: n }, () => "<w:tc><w:tcPr/><w:p/></w:tc>").join("")}</w:tr>`;

// Tabel kegiatan tiruan: header + 3 baris isi (dua terakhir TEKS KEMBAR) + 2 baris kosong
const tbl = `<w:tbl>` +
  tr("Tanggal", "Kegiatan", "Capaian", "Waktu", "Foto") +
  tr("23 Mei 2026", "Membuat desain logo aplikasi", "10%", "60", "") +
  tr("26 Mei 2026", "Rapat koordinasi tim", "20%", "30", "") +
  tr("26 Juni 2026", "Proses pengerjaan dataset untuk melatih algoritma", "22%", "120", "") +
  trKosong(5) + trKosong(5) +
  `</w:tbl>`;

// ---- salin fungsi inti dari export/docx.js (perilaku harus identik) ----
const rowsOf = (t) => t.match(/<w:tr[ >][\s\S]*?<\/w:tr>/g) || [];
const textOf = (xml) => (xml.match(/<w:t[^>]*>[\s\S]*?<\/w:t>/g) || [])
  .map((x) => x.replace(/<[^>]+>/g, "")).join(" ");
const isEmptyRow = (r) => textOf(r).trim() === "";
const cellCount = (r) => (r.match(/<w:tc>/g) || []).length;
const isHeaderRow = (r) => {
  const t = textOf(r).toLowerCase();
  return t.includes("tanggal") && (t.includes("kegiatan") || t.includes("item") || t.includes("harga"));
};
const normText = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, "");
const norm = (s) => normText(s).slice(0, 40);
const P = (t) => `<w:p><w:r><w:t xml:space="preserve">${esc(t)}</w:t></w:r></w:p>`;
const emptyP = () => "<w:p/>";

function rowKey(r) {
  const cells = r.match(/<w:tc>[\s\S]*?<\/w:tc>/g) || [];
  if (cells.length < 2) return "";
  return norm(textOf(cells[1]));
}
function replaceCells(trXml, perIdx) {
  let i = 0;
  return trXml.replace(/<w:tc>[\s\S]*?<\/w:tc>/g, (cell) => {
    const content = perIdx[i];
    i += 1;
    if (content === undefined) return cell;
    const tcPr = (cell.match(/<w:tcPr>[\s\S]*?<\/w:tcPr>/) || [""])[0];
    return `<w:tc>${tcPr}${content}</w:tc>`;
  });
}
function fillRow(trXml, cellContents) {
  let i = 0;
  return trXml.replace(/<w:tc>[\s\S]*?<\/w:tc>/g, (cell) => {
    const tcPr = (cell.match(/<w:tcPr>[\s\S]*?<\/w:tcPr>/) || [""])[0];
    const content = cellContents[i] !== undefined && cellContents[i] !== null
      ? cellContents[i] : emptyP();
    i += 1;
    return `<w:tc>${tcPr}${content}</w:tc>`;
  });
}
function fillTable(tblXml, entries, buildCells, refreshRow) {
  let xml = tblXml;
  const rows = rowsOf(tblXml);
  const emptyRows = rows.filter((r) => isEmptyRow(r) && cellCount(r) >= 2);
  const templateRow = emptyRows[0] || rows[rows.length - 1];
  const lama = new Map();
  rows.forEach((row, i) => {
    if (i === 0 || isHeaderRow(row) || isEmptyRow(row)) return;
    const k = rowKey(row);
    if (!k) return;
    if (!lama.has(k)) lama.set(k, []);
    lama.get(k).push(row);
  });
  let added = 0, skipped = 0;
  const newRows = [];
  for (const e of entries) {
    const cocok = lama.get(e.dedup)?.shift();
    if (cocok) {
      skipped += 1;
      if (refreshRow) {
        const baru = refreshRow(cocok, e);
        if (baru && baru !== cocok) xml = xml.replace(cocok, () => baru);
      }
      continue;
    }
    newRows.push(fillRow(templateRow, buildCells(e)));
    added += 1;
  }
  emptyRows.forEach((er, i) => {
    const isi = i < newRows.length ? newRows[i] : "";
    xml = xml.replace(er, () => isi);
  });
  if (newRows.length > emptyRows.length) {
    const extra = newRows.slice(emptyRows.length).join("");
    xml = xml.replace(/<\/w:tbl>$/, () => extra + "</w:tbl>");
  }
  return { added, skipped, xml };
}

// ---- salinan helper tanggal & pengurutan dari export/docx.js ----
function parseTanggalText(s) {
  const m = String(s).trim()
    .match(/^(\d{1,2})\s*[-/. ]\s*([A-Za-z]+|\d{1,2})\s*[-/. ]\s*(\d{2,4})$/);
  if (!m) return null;
  let idx;
  if (/^\d+$/.test(m[2])) {
    idx = Number(m[2]) - 1;
    if (idx < 0 || idx > 11) return null;
  } else {
    const kode = m[2].slice(0, 3).toLowerCase();
    idx = BULAN.findIndex((b) => b.toLowerCase().startsWith(kode));
    if (idx < 0) return null;
  }
  const y = Number(m[3]) < 100 ? Number(m[3]) + 2000 : Number(m[3]);
  return `${parseInt(m[1], 10)} ${BULAN[idx]} ${y}`;
}

function tanggalKeMs(teks) {
  const m = String(teks).trim().match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/);
  if (!m) return null;
  const idx = BULAN.findIndex((b) => b.toLowerCase() === m[2].toLowerCase());
  if (idx < 0) return null;
  return Date.UTC(Number(m[3]), idx, Number(m[1]));
}

function sortRowsByDate(tblXml) {
  const rows = rowsOf(tblXml);
  const dataIdx = [];
  rows.forEach((r, i) => {
    if (i === 0 || isHeaderRow(r) || cellCount(r) < 2) return;
    dataIdx.push(i);
  });
  if (dataIdx.length < 2) return tblXml;
  let terakhir = Number.MIN_SAFE_INTEGER;
  const kunci = dataIdx.map((i, urut) => {
    const cells = rows[i].match(/<w:tc>[\s\S]*?<\/w:tc>/g) || [];
    const ms = tanggalKeMs(textOf(cells[0] || ""));
    if (ms !== null) terakhir = ms;
    return { i, urut, ms: ms !== null ? ms : terakhir };
  });
  const urutan = [...kunci].sort((a, b) => (a.ms - b.ms) || (a.urut - b.urut));
  if (urutan.every((k, j) => k.i === kunci[j].i)) return tblXml;
  const rowsBaru = rows.slice();
  dataIdx.forEach((i, j) => { rowsBaru[i] = rows[urutan[j].i]; });
  let hasil = "", pos = 0, k = 0;
  for (const r of rows) {
    const at = tblXml.indexOf(r, pos);
    if (at < 0) return tblXml;
    hasil += tblXml.slice(pos, at) + rowsBaru[k++];
    pos = at + r.length;
  }
  return hasil + tblXml.slice(pos);
}

// ---- skenario uji ----
const entries = [
  // 1. sudah ada, waktu diedit 60 → 82 (harus DI-REFRESH, tidak digandakan)
  { tanggal: "2026-05-23", kegiatan: "Membuat desain logo aplikasi", capaian_total: 15, waktu_menit: 82 },
  // 2. sudah ada, tidak berubah
  { tanggal: "2026-05-26", kegiatan: "Rapat koordinasi tim", capaian_total: 20, waktu_menit: 30 },
  // 3. BARU — teks pendek yang substring-nya ada di teks lain ("rapat…")
  //    → dulu salah ke-skip oleh dedup substring, sekarang harus DITAMBAHKAN
  { tanggal: "2026-07-01", kegiatan: "Rapat", capaian_total: 25, waktu_menit: 45 },
  // 4 & 5. TEKS KEMBAR: satu cocok baris lama (refresh), satu lagi BARU —
  //    dulu keduanya dianggap sudah ada / atau digandakan
  { tanggal: "2026-06-26", kegiatan: "Proses pengerjaan dataset untuk melatih algoritma", capaian_total: 30, waktu_menit: 120 },
  { tanggal: "2026-06-29", kegiatan: "Proses pengerjaan dataset untuk melatih algoritma", capaian_total: 35, waktu_menit: 330 },
  // 6. BARU — teks biasa
  { tanggal: "2026-07-15", kegiatan: "Menyusun laporan akhir", capaian_total: 40, waktu_menit: 142 },
].map((e) => ({ ...e, dedup: norm(e.kegiatan) }));

const fmtTgl = (iso) => {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${BULAN[m - 1]} ${y}`;
};

const hasil = fillTable(tbl, entries,
  (e) => [P(fmtTgl(e.tanggal)), P(e.kegiatan), P(`${e.capaian_total}%`), P(String(e.waktu_menit)), emptyP()],
  (row, e) => replaceCells(row, { 0: P(fmtTgl(e.tanggal)), 2: P(`${e.capaian_total}%`), 3: P(String(e.waktu_menit)) }));

const terurut = sortRowsByDate(hasil.xml);

let gagal = 0;
const cek = (nama, kondisi) => {
  console.log(`${kondisi ? "✅" : "❌"} ${nama}`);
  if (!kondisi) gagal += 1;
};

cek("3 entri lama terdeteksi cocok (skipped=3)", hasil.skipped === 3);
cek("3 entri baru ditambahkan (added=3)", hasil.added === 3);
cek("waktu entri lama ter-refresh 60 → 82", hasil.xml.includes(">82<"));
cek("capaian entri lama ter-refresh 10% → 15%", hasil.xml.includes(">15%<"));
cek("entri pendek 'Rapat' ikut ditambahkan", /Rapat<\/w:t>/.test(hasil.xml));
cek("entri 'Menyusun laporan akhir' ditambahkan", hasil.xml.includes("Menyusun laporan akhir"));
cek("waktu 142 menit tertulis apa adanya (menit)", hasil.xml.includes(">142<"));
cek("teks kembar muncul TEPAT 2× (tidak digandakan jadi 3)",
  (hasil.xml.match(/Proses pengerjaan dataset untuk melatih algoritma/g) || []).length === 2);
cek("baris kembar lama ter-refresh (waktu 120 tetap) & kembar baru berisi 330",
  hasil.xml.includes(">120<") && hasil.xml.includes(">330<"));
cek("baris teks lama tidak digandakan",
  (hasil.xml.match(/Membuat desain logo aplikasi/g) || []).length === 1);
cek("tidak ada baris kosong tersisa",
  rowsOf(hasil.xml).filter((r) => isEmptyRow(r) && cellCount(r) >= 2).length === 0);
cek("jumlah baris = header + 6 entri", rowsOf(hasil.xml).length === 7);

// ---- pengurutan kronologis ----
const tglBaris = rowsOf(terurut).slice(1).map((r) => {
  const cells = r.match(/<w:tc>[\s\S]*?<\/w:tc>/g) || [];
  return tanggalKeMs(textOf(cells[0] || ""));
});
cek("baris hasil terurut kronologis",
  tglBaris.every((v, i) => i === 0 || v >= tglBaris[i - 1]));
cek("pengurutan tidak menghilangkan/menggandakan baris",
  rowsOf(terurut).length === rowsOf(hasil.xml).length);
cek("entri kembar tetap tepat 2× setelah diurutkan",
  (terurut.match(/Proses pengerjaan dataset untuk melatih algoritma/g) || []).length === 2);
cek("baris terakhir = entri terbaru (15 Juli 2026)",
  textOf(rowsOf(terurut).at(-1)).includes("Menyusun laporan akhir"));

// ---- normalisasi tanggal ----
cek("tanggal bulan-angka '23-05-2026' → '23 Mei 2026'",
  parseTanggalText("23-05-2026") === "23 Mei 2026");
cek("tanggal bulan-angka '1/7/26' → '1 Juli 2026'",
  parseTanggalText("1/7/26") === "1 Juli 2026");
cek("tanggal bulan-huruf tetap dikenali", parseTanggalText("23-Mei-26") === "23 Mei 2026");
cek("bulan angka tak valid ditolak", parseTanggalText("23-13-2026") === null);
cek("teks non-tanggal ditolak", parseTanggalText("Rapat koordinasi") === null);

console.log(gagal ? `\n${gagal} PENGUJIAN GAGAL` : "\nSEMUA PENGUJIAN LULUS");
process.exit(gagal ? 1 : 0);

