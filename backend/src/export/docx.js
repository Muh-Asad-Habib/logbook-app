/**
 * Ekspor DOCX — mengisi template resmi "backend/src/assets/template-logbook.docx".
 * Isi lama dipertahankan (tanggalnya diseragamkan menjadi "16 Juni 2026");
 * entri yang sudah ada di dokumen dilewati; entri baru diisikan ke baris kosong
 * beserta fotonya; baris kosong yang tersisa dihapus agar dokumen rapi.
 */
import fs from "node:fs";
import JSZip from "jszip";
import { config } from "../config.js";
import * as store from "../storage.js";
import { compressForEmbed, siapkanEmbed } from "../files.js";
import { ambilFotoEmbed, ukuranGambar, extDariByte } from "./foto.js";

/** Template resmi — ikut ter-bundle ke serverless function (backend/src/assets). */
export const TEMPLATE = config.templatePath;

const BULAN = ["Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

const esc = (s) => String(s)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;").replace(/'/g, "&apos;");

/** Format tanggal standar seluruh dokumen: "16 Juni 2026". */
const fmtTgl = (iso) => {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${BULAN[m - 1]} ${y}`;
};

/**
 * Parse teks tanggal bebas dari isi lama dokumen
 * ("23-Mei-26", "15 - Juni - 2026", "1/Juli/2026", "16 Juni 2026",
 *  termasuk BULAN ANGKA: "23-05-2026", "23/5/26")
 * lalu kembalikan bentuk standar "16 Juni 2026"; null jika bukan tanggal.
 */
function parseTanggalText(s) {
  const m = String(s).trim()
    .match(/^(\d{1,2})\s*[-/. ]\s*([A-Za-z]+|\d{1,2})\s*[-/. ]\s*(\d{2,4})$/);
  if (!m) return null;
  let idx;
  if (/^\d+$/.test(m[2])) {
    idx = Number(m[2]) - 1;              // bulan angka: "05" → Mei
    if (idx < 0 || idx > 11) return null;
  } else {
    const kode = m[2].slice(0, 3).toLowerCase();
    idx = BULAN.findIndex((b) => b.toLowerCase().startsWith(kode));
    if (idx < 0) return null;
  }
  const y = Number(m[3]) < 100 ? Number(m[3]) + 2000 : Number(m[3]);
  return `${parseInt(m[1], 10)} ${BULAN[idx]} ${y}`;
}

export const fmtRupiah = (n) => "Rp" + Number(n || 0).toLocaleString("id-ID");

/** Normalisasi teks penuh (untuk isi dokumen). */
const normText = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, "");
/** Kunci pendek entri untuk pencocokan duplikat. */
const norm = (s) => normText(s).slice(0, 40);

/** Paragraf Word bergaya donor (pPr paragraf + rPr run dari baris asli). */
function P(text, st = {}) {
  const pPr = st.pPr || "";
  const rPr = st.rPr || `<w:rPr><w:sz w:val="20"/></w:rPr>`;
  const lines = String(text).split(/\r?\n/);
  return lines.map((l) =>
    `<w:p>${pPr}<w:r>${rPr}<w:t xml:space="preserve">${esc(l)}</w:t></w:r></w:p>`
  ).join("");
}
const emptyP = () => "<w:p/>";

/**
 * Paragraf PEMISAH HALAMAN (setara Ctrl+Enter di Word) — dipakai agar bagian
 * keuangan tidak menempel di bawah tabel kegiatan, melainkan mulai di halaman
 * sendiri sehingga dokumen lebih enak dibaca/dicetak.
 */
const pageBreakP = () => `<w:p><w:r><w:br w:type="page"/></w:r></w:p>`;

/**
 * Sisipkan pemisah halaman pada potongan XML DI ANTARA tabel kegiatan dan
 * tabel keuangan: tepat sebelum paragraf judul bagian keuangan (paragraf
 * berteks pertama), atau — bila tak ada judul — tepat sebelum tabelnya.
 * Idempoten: dilewati bila di sana sudah ada page break.
 */
export function sisipkanPemisahHalaman(antara) {
  if (/<w:br[^>]*w:type="page"/.test(antara)) return antara;      // sudah ada
  if (/<w:pageBreakBefore\s*\/>/.test(antara)) return antara;     // gaya lain
  const paragraf = antara.match(/<w:p[ >][\s\S]*?<\/w:p>/g) || [];
  const judul = paragraf.find((p) => textOf(p).trim() !== "");
  // Tanpa judul (template resmi hanya berisi paragraf kosong): break diletakkan
  // PALING BELAKANG supaya halaman baru langsung dimulai oleh tabel keuangan.
  if (!judul) return antara + pageBreakP();
  const at = antara.indexOf(judul);
  return antara.slice(0, at) + pageBreakP() + antara.slice(at);
}

/** Ambil gaya per-sel (pPr + rPr) dari baris data terisi pertama sebuah tabel. */
function cellStyles(tblXml) {
  const rows = rowsOf(tblXml);
  for (let i = 1; i < rows.length; i++) {
    if (isEmptyRow(rows[i])) continue;
    return (rows[i].match(/<w:tc>[\s\S]*?<\/w:tc>/g) || []).map((cell) => {
      const pPr = (cell.match(/<w:pPr>[\s\S]*?<\/w:pPr>/) || [""])[0];
      const run = (cell.match(/<w:r[ >][\s\S]*?<\/w:r>/) || [""])[0];
      const rPr = (run.match(/<w:rPr>[\s\S]*?<\/w:rPr>/) || [""])[0];
      return { pPr, rPr };
    });
  }
  return [];
}

/** Baca dimensi JPEG/PNG dari buffer (fallback 4:3). */
function imgSize(buf) {
  return ukuranGambar(buf) || { w: 4, h: 3 };
}

/* ---------------- ukuran foto di dokumen ---------------- */
// Foto TIDAK dipangkas lagi. Dulu semua foto di-crop tengah ke rasio tetap
// (4:3 / 3:4) supaya kolom terlihat seragam — akibatnya tangkapan layar lebar
// (mis. tabel pengumuman PKM) terpotong parah dan isinya hilang.
// Sekarang: LEBAR tampil = lebar kolom Foto/Bukti, TINGGI mengikuti rasio
// asli, dengan batas TINGGI_MAKS agar foto potret tidak memanjang menghabiskan
// satu baris tabel. Hasilnya gambar selalu utuh, sama seperti tampilan web.
const LEBAR_FOTO = { kegiatan: 2.6, keuangan: 2.2 }; // cm (dipakai bila grid tak terbaca)
export const TINGGI_MAKS = 6.0;                      // cm — batas tinggi foto potret
const RASIO_CADANGAN = 3 / 4;                        // dipakai bila dimensi tak terbaca
const cmKeEmu = (cm) => Math.round(cm * 360000);

/**
 * Ukuran tampil (EMU) yang MEMUAT foto utuh: lebar mengisi kolom, tinggi
 * mengikuti rasio asli; bila terlalu tinggi (foto potret) tinggi dipatok
 * TINGGI_MAKS dan lebarnya menyesuaikan — tetap tanpa distorsi maupun potong.
 */
export function ukuranMuat(lebarCm, w, h) {
  const rasio = w > 0 && h > 0 ? h / w : RASIO_CADANGAN;
  let cx = cmKeEmu(lebarCm);
  let cy = Math.round(cx * rasio);
  const cyMaks = cmKeEmu(TINGGI_MAKS);
  if (cy > cyMaks) {
    cy = cyMaks;
    cx = Math.round(cy / rasio);
  }
  return { cx, cy };
}

/**
 * Lebar foto (cm) dari LEBAR KOLOM terakhir tabel (kolom Foto/Bukti) pada
 * <w:tblGrid> — foto memenuhi lebar kolom (− margin sel) sehingga terlihat
 * sebesar mungkin tanpa keluar kolom. Fallback bila grid tak terbaca.
 */
export function lebarFotoDariGrid(tblXml, fallback) {
  const grid = (tblXml.match(/<w:gridCol[^>]*w:w="(\d+)"/g) || [])
    .map((g) => Number(g.match(/w:w="(\d+)"/)[1]));
  if (grid.length < 2) return fallback;
  const cm = grid[grid.length - 1] / 567 - 0.42; // − margin sel kiri+kanan
  if (!(cm >= 1.2 && cm <= 12)) return fallback;
  return Math.round(cm * 100) / 100;
}

/**
 * Percantik baris judul tabel: latar indigo (selaras UI aplikasi),
 * teks putih tebal rata tengah, vertikal tengah, dan diulang otomatis
 * di tiap halaman (tblHeader).
 */
function percantikHeader(tblXml) {
  let xml = tblXml;
  for (const row of rowsOf(tblXml)) {
    if (!isHeaderRow(row)) continue;
    let baru = row.replace(/<w:tc>[\s\S]*?<\/w:tc>/g, (cell) => {
      const teks = textOf(cell).replace(/\s+/g, " ").trim();
      let tcPr = (cell.match(/<w:tcPr>[\s\S]*?<\/w:tcPr>/) || ["<w:tcPr></w:tcPr>"])[0];
      tcPr = tcPr
        .replace(/<w:shd [^>]*\/>/g, "")
        .replace(/<w:vAlign [^>]*\/>/g, "")
        .replace("</w:tcPr>",
          `<w:shd w:val="clear" w:color="auto" w:fill="4F46E5"/>` +
          `<w:vAlign w:val="center"/></w:tcPr>`);
      const p =
        `<w:p><w:pPr><w:spacing w:before="60" w:after="60"/><w:jc w:val="center"/></w:pPr>` +
        `<w:r><w:rPr><w:b/><w:color w:val="FFFFFF"/><w:sz w:val="20"/></w:rPr>` +
        `<w:t xml:space="preserve">${esc(teks)}</w:t></w:r></w:p>`;
      return `<w:tc>${tcPr}${p}</w:tc>`;
    });
    if (!/<w:tblHeader\b/.test(baru)) {
      baru = /<w:trPr>/.test(baru)
        ? baru.replace("<w:trPr>", "<w:trPr><w:tblHeader/><w:cantSplit/>")
        : baru.replace(/<w:tr( [^>]*)?>/, (m) => `${m}<w:trPr><w:tblHeader/><w:cantSplit/></w:trPr>`);
    }
    xml = xml.replace(row, () => baru);
  }
  return xml;
}

/**
 * Siapkan foto untuk disematkan: resolusi tinggi (1200px, mutu 85), foto
 * kecil di-UPSCALE agar tidak pecah, dan rasio ASLI dipertahankan (tanpa
 * crop). Dimensi asli dikembalikan untuk menghitung ukuran tampil.
 * @returns {{buf: Buffer, w: number, h: number}|null} null bila format tak didukung.
 */
async function siapkanFoto(buf, dim, mutu) {
  const r = await siapkanEmbed(buf, dim, mutu);
  return r.ok ? { buf: r.buffer, w: r.w, h: r.h } : null;
}

/** Bangun XML gambar inline (drawing) untuk sel tabel. */
function drawingXml(rid, docPrId, cx, cy) {
  return (
    `<w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0" ` +
    `xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing">` +
    `<wp:extent cx="${cx}" cy="${cy}"/><wp:effectExtent l="0" t="0" r="0" b="0"/>` +
    `<wp:docPr id="${docPrId}" name="lbfoto${docPrId}"/>` +
    `<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">` +
    `<a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
    `<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
    `<pic:nvPicPr><pic:cNvPr id="${docPrId}" name="lbfoto${docPrId}"/><pic:cNvPicPr/></pic:nvPicPr>` +
    `<pic:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>` +
    `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm>` +
    `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>` +
    `</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing>`
  );
}

/** Kelola penambahan media + relationship pada zip docx.
 *  Foto sudah di-prefetch (bufferMap: key -> Buffer) supaya penyisipan
 *  ke XML tetap sinkron walau sumbernya cloud.
 *  `sizeMap` berisi dimensi ASLI foto (rasio selalu benar, gambar tak terpotong);
 *  `docXml` dipindai agar id drawing baru tidak bentrok dengan bawaan template.
 *  Satu kunci foto hanya disimpan SEKALI di word/media — bila kunci yang sama
 *  dipakai beberapa baris, relationship-nya dipakai ulang (hanya docPr id baru). */
function makeImageStore(zip, relsXmlRef, ctypesRef, bufferMap, sizeMap, docXml = "") {
  let mediaN = 1000;
  let relN = 1000;
  let docPrN = 9000;
  const ridDariKey = new Map(); // key foto → rId (dedup media)
  const existing = relsXmlRef.value.match(/Id="rId(\d+)"/g) || [];
  for (const m of existing) {
    const n = parseInt(m.match(/\d+/)[0], 10);
    if (n >= relN) relN = n + 1;
  }
  // id <wp:docPr> WAJIB unik satu dokumen — id ganda membuat Word menampilkan
  // dialog "dokumen perlu diperbaiki" saat dibuka.
  for (const m of docXml.match(/docPr[^>]*\bid="(\d+)"/g) || []) {
    const n = parseInt(m.match(/id="(\d+)"/)[1], 10);
    if (n >= docPrN) docPrN = n + 1;
  }
  return {
    /** Sisipkan gambar; `lebarCm` = lebar kolom Foto/Bukti dalam cm. */
    add(fileKey, lebarCm = LEBAR_FOTO.kegiatan) {
      try {
        const buf = bufferMap.get(fileKey);
        if (!buf) return null;
        let rid = ridDariKey.get(fileKey);
        if (!rid) {
          // Ekstensi dari ISI byte — nama di cloud belum tentu cocok (mis.
          // .png yang oleh CDN dikirim sebagai JPEG).
          const extNorm = extDariByte(buf, fileKey);
          if (!ctypesRef.value.includes(`Extension="${extNorm}"`)) {
            ctypesRef.value = ctypesRef.value.replace(
              "</Types>",
              `<Default Extension="${extNorm}" ContentType="image/${extNorm}"/></Types>`
            );
          }
          const name = `media/lb_${mediaN++}.${extNorm}`;
          zip.file(`word/${name}`, buf);
          rid = `rId${relN++}`;
          relsXmlRef.value = relsXmlRef.value.replace(
            "</Relationships>",
            `<Relationship Id="${rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="${name}"/></Relationships>`
          );
          ridDariKey.set(fileKey, rid);
        }
        // Ukuran tampil mengikuti RASIO ASLI foto (tidak dipangkas) —
        // imgSize() hanya cadangan untuk format yang tak didukung sharp (gif).
        const info = sizeMap?.get(fileKey) || imgSize(buf);
        const { cx, cy } = ukuranMuat(lebarCm, info.w, info.h);
        return drawingXml(rid, docPrN++, cx, cy);
      } catch {
        return null;
      }
    },
  };
}

/** Isi baris <w:tr> dengan konten sel baru (mempertahankan properti sel). */
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

const rowsOf = (tbl) => tbl.match(/<w:tr[ >][\s\S]*?<\/w:tr>/g) || [];
const textOf = (xml) =>
  (xml.match(/<w:t[^>]*>[\s\S]*?<\/w:t>/g) || [])
    .map((t) => t.replace(/<[^>]+>/g, "")).join(" ");
const isEmptyRow = (tr) => textOf(tr).trim() === "";
const cellCount = (tr) => (tr.match(/<w:tc>/g) || []).length;

/** Baris judul tabel (mis. "Tanggal | Kegiatan | ..." / "Tanggal | Item | Harga ..."). */
const isHeaderRow = (tr) => {
  const t = textOf(tr).toLowerCase();
  return t.includes("tanggal") && (t.includes("kegiatan") || t.includes("item") || t.includes("harga"));
};

/**
 * Kosongkan isi lama tabel template (dipakai akun selain pemilik template):
 * baris judul & baris kosong (slot pengisian) dipertahankan, baris data lama dibuang —
 * sehingga dokumen hasil ekspor hanya berisi data milik akun itu sendiri.
 */
function blankTable(tblXml) {
  let xml = tblXml;
  const rows = rowsOf(tblXml);
  rows.forEach((row, i) => {
    if (i === 0 || isHeaderRow(row) || isEmptyRow(row)) return; // pertahankan
    xml = xml.replace(row, "");
  });
  return xml;
}

/**
 * Seragamkan tanggal lama di kolom pertama tabel menjadi "16 Juni 2026".
 * Baris yang kolom pertamanya bukan tanggal dibiarkan apa adanya.
 */
function normalizeTableDates(tblXml, style) {
  const rows = rowsOf(tblXml);
  let xml = tblXml;
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const cells = row.match(/<w:tc>[\s\S]*?<\/w:tc>/g) || [];
    if (!cells.length) continue;
    const tglBaru = parseTanggalText(textOf(cells[0]));
    if (!tglBaru) continue;
    const tcPr = (cells[0].match(/<w:tcPr>[\s\S]*?<\/w:tcPr>/) || [""])[0];
    const cellBaru = `<w:tc>${tcPr}${P(tglBaru, style)}</w:tc>`;
    if (cellBaru === cells[0]) continue;
    const rowBaru = row.replace(cells[0], () => cellBaru);
    xml = xml.replace(row, () => rowBaru);
  }
  return xml;
}

/** Lengkapi sel tanggal yang kosong pada baris lama yang cocok dengan entri aplikasi. */
function fillMissingDates(tblXml, entries, style) {
  const rows = rowsOf(tblXml);
  let xml = tblXml;
  for (const e of entries) {
    for (const row of rows) {
      const cells = row.match(/<w:tc>[\s\S]*?<\/w:tc>/g) || [];
      if (cells.length < 2) continue;
      if (textOf(cells[0]).trim() !== "") continue;          // hanya sel tanggal kosong
      if (!normText(textOf(row)).includes(e.dedup)) continue; // baris harus cocok dgn entri
      const tcPr = (cells[0].match(/<w:tcPr>[\s\S]*?<\/w:tcPr>/) || [""])[0];
      const cellBaru = `<w:tc>${tcPr}${P(fmtTgl(e.tanggal), style)}</w:tc>`;
      const rowBaru = row.replace(cells[0], () => cellBaru);
      xml = xml.replace(row, () => rowBaru);
      break;
    }
  }
  return xml;
}

/**
 * Kunci pencocokan sebuah baris data: teks KOLOM ISI (sel ke-2 —
 * "Kegiatan"/"Item") yang dinormalisasi. Pencocokan per-baris ini
 * menggantikan pencarian substring atas seluruh teks tabel, yang dulu
 * membuat entri baru salah terdeteksi "sudah ada" (mis. deskripsi pendek
 * atau berawalan sama dengan teks lain) sehingga tak pernah diekspor.
 */
function rowKey(tr) {
  const cells = tr.match(/<w:tc>[\s\S]*?<\/w:tc>/g) || [];
  if (cells.length < 2) return "";
  return norm(textOf(cells[1]));
}

/** Ganti isi sel tertentu sebuah baris berdasarkan indeks (properti sel dipertahankan). */
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

/**
 * Isi satu tabel:
 * - baris lama yang cocok (kolom isinya sama) → sel data lainnya DISEGARKAN
 *   dengan nilai terbaru aplikasi (tanggal/capaian/waktu dsb; foto dibiarkan),
 *   sehingga hasil edit di aplikasi ikut terbawa ke dokumen;
 * - entri tanpa baris cocok → baris kosong pertama (atau baris tambahan);
 * - baris kosong yang tersisa DIHAPUS agar dokumen rapi.
 * @returns {added, skipped, xml}
 */
function fillTable(tblXml, entries, buildCells, refreshRow) {
  let xml = tblXml;
  const rows = rowsOf(tblXml);
  const emptyRows = rows.filter((r) => isEmptyRow(r) && cellCount(r) >= 2);
  const templateRow = emptyRows[0] || rows[rows.length - 1];

  // Peta baris data lama: kunci kolom isi → ANTREAN baris.
  // Antrean (bukan satu baris) penting saat ada entri dengan teks kembar
  // (mis. "Proses pengerjaan dataset…" dua tanggal) — tiap entri memakai
  // satu baris, sehingga tidak ada yang salah dianggap baru lalu digandakan.
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

  // Gantikan baris kosong dengan baris terisi; sisa baris kosong dibuang.
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

/** "16 Juni 2026" → epoch ms (UTC); null bila bukan tanggal standar. */
function tanggalKeMs(teks) {
  const m = String(teks).trim().match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/);
  if (!m) return null;
  const idx = BULAN.findIndex((b) => b.toLowerCase() === m[2].toLowerCase());
  if (idx < 0) return null;
  return Date.UTC(Number(m[3]), idx, Number(m[1]));
}

/**
 * Urutkan baris DATA tabel secara KRONOLOGIS (stabil).
 * Tanpa ini, entri baru selalu menumpuk di baris kosong/akhir tabel sehingga
 * tanggalnya melompat-lompat dibanding baris lama.
 * - baris judul & baris pertama dipertahankan di tempatnya;
 * - baris tanpa tanggal (lanjutan) mengikuti baris bertanggal sebelumnya;
 * - urutan asli dipakai sebagai penyeimbang saat tanggalnya sama.
 * Hanya isi baris yang ditukar — properti tabel (tblPr/tblGrid) tak tersentuh.
 */
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
  if (urutan.every((k, j) => k.i === kunci[j].i)) return tblXml; // sudah urut

  const rowsBaru = rows.slice();
  dataIdx.forEach((i, j) => { rowsBaru[i] = rows[urutan[j].i]; });

  // Rakit ulang berdasarkan POSISI tiap baris (bukan replace global) agar
  // baris berisi teks identik tidak saling tertukar/tertimpa.
  let hasil = "", pos = 0, k = 0;
  for (const r of rows) {
    const at = tblXml.indexOf(r, pos);
    if (at < 0) return tblXml; // jaga-jaga: struktur tak terduga → biarkan
    hasil += tblXml.slice(pos, at) + rowsBaru[k++];
    pos = at + r.length;
  }
  return hasil + tblXml.slice(pos);
}

/** Entri yang BELUM ada di dokumen (untuk ditampilkan di UI).
 *  Memakai pencocokan per-baris yang sama dengan fillTable — termasuk
 *  hitungan per-kemunculan untuk teks kembar — agar angkanya selalu
 *  konsisten dengan hasil ekspor sesungguhnya. */
export async function entriesToExport(userId) {
  if (!_docXmlCache) await warmTemplate();
  const kunciKeg = new Map(); // kunci → berapa baris tersedia di dokumen
  const kunciKeu = new Map();
  // Akun selain pemilik template memakai template kosong → semua entrinya baru.
  if (await store.isDefaultUser(userId)) {
    const tables = _docXmlCache.match(/<w:tbl>[\s\S]*?<\/w:tbl>/g) || [];
    const kumpul = (tbl, peta) => {
      if (!tbl) return;
      rowsOf(tbl).forEach((row, i) => {
        if (i === 0 || isHeaderRow(row) || isEmptyRow(row)) return;
        const k = rowKey(row);
        if (k) peta.set(k, (peta.get(k) || 0) + 1);
      });
    };
    kumpul(tables[0], kunciKeg);
    kumpul(tables[1], kunciKeu);
  }
  const hitungBaru = (list, ambilTeks, peta) => {
    let baru = 0;
    for (const e of list) {
      const k = norm(ambilTeks(e));
      const sisa = peta.get(k) || 0;
      if (sisa > 0) peta.set(k, sisa - 1);
      else baru += 1;
    }
    return baru;
  };
  const keg = hitungBaru(await store.listKegiatan(userId), (e) => e.kegiatan, kunciKeg);
  const keu = hitungBaru(await store.listKeuangan(userId), (e) => e.item, kunciKeu);
  return { kegiatan: keg, keuangan: keu };
}

let _docXmlCache = "";

/** Muat cache XML template (dipanggil saat server start / sebelum ekspor). */
export async function warmTemplate() {
  if (!fs.existsSync(TEMPLATE)) return false;
  const zip = await JSZip.loadAsync(fs.readFileSync(TEMPLATE));
  _docXmlCache = await zip.file("word/document.xml").async("string");
  return true;
}

/** Bangun DOCX terisi; kembalikan Buffer. */
export async function buildDocx(userId) {
  if (!fs.existsSync(TEMPLATE)) throw new Error(`Template tidak ditemukan: ${TEMPLATE}`);
  const zip = await JSZip.loadAsync(fs.readFileSync(TEMPLATE));
  let docXml = await zip.file("word/document.xml").async("string");
  _docXmlCache = docXml;
  const relsRef = { value: await zip.file("word/_rels/document.xml.rels").async("string") };
  const ctRef = { value: await zip.file("[Content_Types].xml").async("string") };

  // Kenali dua tabel utama & foto lama di dalamnya SEBELUM memproses media,
  // supaya foto lama bawaan template ikut diseragamkan ukurannya.
  const tblRe = /<w:tbl>[\s\S]*?<\/w:tbl>/g;
  const tables = docXml.match(tblRe) || [];
  if (tables.length < 2) throw new Error("Struktur template tidak dikenali (butuh 2 tabel)");

  // rId gambar yang dipakai di kedua tabel + peta rId → nama media
  const ridDiTabel = new Set();
  for (const t of tables.slice(0, 2)) {
    for (const m of t.match(/r:embed="(rId\d+)"/g) || []) ridDiTabel.add(m.match(/rId\d+/)[0]);
  }
  const relTarget = new Map();
  for (const m of relsRef.value.matchAll(/<Relationship[^>]*Id="(rId\d+)"[^>]*Target="([^"]+)"/g)) {
    relTarget.set(m[1], m[2]);
  }
  const normTarget = (t) => "word/" + String(t || "").replace(/^\//, "").replace(/^word\//, "");
  const mediaTabel = new Set([...ridDiTabel].map((r) => normTarget(relTarget.get(r))));

  // Media bawaan template: foto tabel disiapkan ulang beresolusi tinggi
  // (foto lama yang kecil ikut di-upscale supaya tidak pecah) dan dimensinya
  // dicatat agar ukuran tampilnya dihitung ulang lewat extentMuat di bawah.
  // Media lain (logo/kop) cukup dikompresi.
  const mediaDim = new Map(); // nama media → { w, h } dimensi asli
  await Promise.all(
    Object.keys(zip.files)
      .filter((n) => /^word\/media\//i.test(n) && !zip.files[n].dir)
      .map(async (n) => {
        try {
          const buf = await zip.file(n).async("nodebuffer");
          if (mediaTabel.has(n)) {
            const r = await siapkanFoto(buf);
            if (r) { zip.file(n, r.buf); mediaDim.set(n, { w: r.w, h: r.h }); return; }
          }
          const kecil = await compressForEmbed(buf);
          if (kecil.length < buf.length) zip.file(n, kecil);
        } catch {}
      })
  );

  /** Setel ulang ukuran tampil drawing lama di tabel agar foto tampil UTUH. */
  const extentMuat = (tblXml, lebarCm) =>
    tblXml.replace(/<w:drawing>[\s\S]*?<\/w:drawing>/g, (d) => {
      const rid = (d.match(/r:embed="(rId\d+)"/) || [])[1];
      const dim = rid ? mediaDim.get(normTarget(relTarget.get(rid))) : undefined;
      if (!dim) return d; // dimensi tak dikenali → biarkan apa adanya
      const { cx, cy } = ukuranMuat(lebarCm, dim.w, dim.h);
      return d
        .replace(/<wp:extent cx="\d+" cy="\d+"\/>/, `<wp:extent cx="${cx}" cy="${cy}"/>`)
        .replace(/<a:ext cx="\d+" cy="\d+"\/>/, `<a:ext cx="${cx}" cy="${cy}"/>`);
    });

  // Ambil data & seluruh foto dari cloud SEKALIGUS (paralel) sebelum menyusun XML
  const [pemilikTemplate, kegList, keuList] = await Promise.all([
    store.isDefaultUser(userId),
    store.listKegiatan(userId),
    store.listKeuangan(userId),
  ]);
  const semuaKey = [
    ...kegList.flatMap((e) => e.foto_keys || []),
    ...keuList.flatMap((e) => e.bukti_keys || []),
  ];
  // Foto ditarik dari CDN SUDAH berukuran sematan (ImageKit yang mengecilkan),
  // paralel terbatas, resolusi dipilih sekali dari jumlah foto — lihat foto.js.
  // Menggantikan: unduh utuh → sharp per foto → kompres ulang bila > anggaran.
  const fotoMap = await ambilFotoEmbed(semuaKey);
  const bufferMap = new Map();
  const sizeMap = new Map(); // key → { w, h } dimensi ASLI (untuk rasio tampil)
  for (const [k, r] of fotoMap) {
    bufferMap.set(k, r.buffer);
    sizeMap.set(k, { w: r.w, h: r.h });
  }

  // Dimensi asli foto sudah dicatat di sizeMap oleh siapkanFoto di atas.
  const imgs = makeImageStore(zip, relsRef, ctRef, bufferMap, sizeMap, docXml);

  // Dua tabel utama sudah dikenali di awal (tblRe/tables); langsung pakai.
  let [tblKeg, tblKeu] = tables;
  // Lebar foto mengikuti lebar kolom Foto/Bukti masing-masing tabel
  const lebarKeg = lebarFotoDariGrid(tblKeg, LEBAR_FOTO.kegiatan);
  const lebarKeu = lebarFotoDariGrid(tblKeu, LEBAR_FOTO.keuangan);
  // Foto lama bawaan template ikut disesuaikan agar tampil utuh
  tblKeg = extentMuat(tblKeg, lebarKeg);
  tblKeu = extentMuat(tblKeu, lebarKeu);

  // Akun selain pemilik template: buang isi lama → dokumen hanya berisi data akun ini
  const stKeg = cellStyles(tblKeg);  // gaya sel diambil SEBELUM isi lama dibuang
  const stKeu = cellStyles(tblKeu);
  if (!pemilikTemplate) {
    tblKeg = blankTable(tblKeg);
    tblKeu = blankTable(tblKeu);
  }

  // ---- Tabel kegiatan: Tanggal | Kegiatan | Capaian Total | Waktu | Foto ----
  const kegEntries = kegList.map((e) => ({ ...e, dedup: norm(e.kegiatan) }));
  const tblKegRapi = fillMissingDates(
    normalizeTableDates(tblKeg, stKeg[0]), kegEntries, stKeg[0]);
  const hasilKeg = fillTable(tblKegRapi, kegEntries, (e) => {
    const fotoXml = e.foto_keys
      .map((k) => imgs.add(k, lebarKeg))
      .filter(Boolean)
      .map((d) => `<w:p>${stKeg[4]?.pPr || ""}<w:r>${d}</w:r></w:p>`)
      .join("") || emptyP();
    return [P(fmtTgl(e.tanggal), stKeg[0]), P(e.kegiatan, stKeg[1]),
            P(`${e.capaian_total}%`, stKeg[2]), P(String(e.waktu_menit), stKeg[3]), fotoXml];
  }, (row, e) => replaceCells(row, {
    // baris lama yang cocok → segarkan tanggal/capaian/waktu (teks & foto dibiarkan)
    0: P(fmtTgl(e.tanggal), stKeg[0]),
    2: P(`${e.capaian_total}%`, stKeg[2]),
    3: P(String(e.waktu_menit), stKeg[3]),
  }));

  // ---- Tabel keuangan: Tanggal | Item | Harga | Jumlah | Total | Bukti ----
  const keuEntries = keuList.map((e) => ({ ...e, dedup: norm(e.item) }));
  const tblKeuRapi = fillMissingDates(
    normalizeTableDates(tblKeu, stKeu[0]), keuEntries, stKeu[0]);
  const hasilKeu = fillTable(tblKeuRapi, keuEntries, (e) => {
    const buktiXml = (e.bukti_keys || [])
      .map((k) => imgs.add(k, lebarKeu))
      .filter(Boolean)
      .map((d) => `<w:p>${stKeu[5]?.pPr || ""}<w:r>${d}</w:r></w:p>`)
      .join("") || emptyP();
    return [
      P(fmtTgl(e.tanggal), stKeu[0]), P(e.item, stKeu[1]),
      P(`${fmtRupiah(e.harga_satuan)}${e.satuan_suffix || ""}`, stKeu[2]),
      P(String(e.jumlah), stKeu[3]), P(fmtRupiah(e.total), stKeu[4]),
      buktiXml,
    ];
  }, (row, e) => replaceCells(row, {
    // baris lama yang cocok → segarkan tanggal/harga/jumlah/total (bukti dibiarkan)
    0: P(fmtTgl(e.tanggal), stKeu[0]),
    2: P(`${fmtRupiah(e.harga_satuan)}${e.satuan_suffix || ""}`, stKeu[2]),
    3: P(String(e.jumlah), stKeu[3]),
    4: P(fmtRupiah(e.total), stKeu[4]),
  }));

  // Susun ulang dokumen (ganti kedua tabel sesuai urutan) —
  // baris data diurutkan kronologis lebih dulu agar entri baru tidak
  // sekadar menumpuk di akhir tabel; baris judul dipercantik (latar indigo,
  // teks putih tebal, diulang tiap halaman).
  const kegXml = sortRowsByDate(percantikHeader(hasilKeg.xml));
  const keuXml = sortRowsByDate(percantikHeader(hasilKeu.xml));

  // Dirakit lewat INDEKS (bukan replace global) supaya potongan XML di antara
  // kedua tabel bisa disisipi pemisah halaman — bagian keuangan selalu mulai
  // di halaman baru, tidak lagi menempel persis di bawah tabel kegiatan.
  const posisi = [...docXml.matchAll(new RegExp(tblRe.source, "g"))]
    .map((m) => ({ at: m.index, len: m[0].length }));
  const [t1, t2] = posisi;
  const antara = sisipkanPemisahHalaman(docXml.slice(t1.at + t1.len, t2.at));
  docXml =
    docXml.slice(0, t1.at) + kegXml + antara + keuXml + docXml.slice(t2.at + t2.len);

  zip.file("word/document.xml", docXml);
  zip.file("word/_rels/document.xml.rels", relsRef.value);
  zip.file("[Content_Types].xml", ctRef.value);

  const out = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  return { buffer: out, kegBaru: hasilKeg.added, keuBaru: hasilKeu.added,
           kegLewat: hasilKeg.skipped, keuLewat: hasilKeu.skipped };
}


