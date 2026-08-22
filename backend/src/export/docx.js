/**
 * Ekspor DOCX — mengisi template resmi "backend/src/assets/template-logbook.docx".
 * Isi lama dipertahankan (tanggalnya diseragamkan menjadi "16 Juni 2026");
 * entri yang sudah ada di dokumen dilewati; entri baru diisikan ke baris kosong
 * beserta fotonya; baris kosong yang tersisa dihapus agar dokumen rapi.
 */
import fs from "node:fs";
import path from "node:path";
import JSZip from "jszip";
import sharp from "sharp";
import { config } from "../config.js";
import * as store from "../storage.js";
import { getFileBuffer, compressForEmbed } from "../files.js";

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
  try {
    if (buf[0] === 0x89 && buf[1] === 0x50) { // PNG
      return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
    }
    if (buf[0] === 0xff && buf[1] === 0xd8) { // JPEG
      let i = 2;
      while (i < buf.length - 8) {
        if (buf[i] !== 0xff) { i++; continue; }
        const marker = buf[i + 1];
        const len = buf.readUInt16BE(i + 2);
        if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
          return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
        }
        i += 2 + len;
      }
    }
  } catch {}
  return { w: 4, h: 3 };
}

/* ---------------- ukuran foto SERAGAM di dokumen ---------------- */
// Semua foto dipangkas (crop tengah) ke rasio tetap — LANDSCAPE 4:3,
// POTRET 3:4 — lalu ditampilkan dengan ukuran sentimeter yang sama per
// orientasi, sehingga kolom foto rapi dan enak dilihat.
const RASIO_FOTO = 4 / 3;
const LEBAR_FOTO = {
  kegiatan: { landscape: 2.6, potret: 2.0 },   // cm
  keuangan: { landscape: 2.2, potret: 1.7 },
};
const cmKeEmu = (cm) => Math.round(cm * 360000);

/** Ukuran tampil (EMU) foto seragam menurut orientasi. */
function ukuranSeragam(lebar, potret) {
  const cx = cmKeEmu(potret ? lebar.potret : lebar.landscape);
  const cy = Math.round(cx * (potret ? RASIO_FOTO : 1 / RASIO_FOTO));
  return { cx, cy };
}

/**
 * Pangkas foto ke rasio seragam (crop tengah, tanpa distorsi):
 * landscape → 620×465 (4:3), potret → 465×620 (3:4).
 * Dimensi kelipatan eksak rasio dipilih agar kompresi budget (fit inside)
 * tetap menghasilkan rasio yang persis sama.
 * @returns {{buf: Buffer, potret: boolean}|null} null bila format tak didukung.
 */
async function cropSeragam(buf) {
  const isJpeg = buf?.[0] === 0xff && buf[1] === 0xd8;
  const isPng = buf?.[0] === 0x89 && buf[1] === 0x50;
  if (!isJpeg && !isPng) return null;
  try {
    const md = await sharp(buf).metadata();
    let w = md.width, h = md.height;
    if (!w || !h) return null;
    if (md.orientation >= 5) [w, h] = [h, w]; // EXIF rotasi 90°
    const potret = h > w;
    const [tw, th] = potret ? [465, 620] : [620, 465];
    let s = sharp(buf, { failOn: "none" }).rotate()
      .resize(tw, th, { fit: "cover", position: "centre" });
    s = isPng
      ? s.png({ compressionLevel: 9 })
      : s.jpeg({ quality: 68, progressive: true, mozjpeg: true });
    return { buf: await s.toBuffer(), potret };
  } catch {
    return null;
  }
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
 *  `sizeMap` berisi dimensi asli hasil sharp (rasio foto selalu benar);
 *  `docXml` dipindai agar id drawing baru tidak bentrok dengan bawaan template. */
function makeImageStore(zip, relsXmlRef, ctypesRef, bufferMap, sizeMap, docXml = "") {
  let mediaN = 1000;
  let relN = 1000;
  let docPrN = 9000;
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
    /** Sisipkan gambar; `lebar` = { landscape, potret } dalam cm. */
    add(fileKey, lebar = LEBAR_FOTO.kegiatan) {
      try {
        const buf = bufferMap.get(fileKey);
        if (!buf) return null;
        const ext = path.extname(fileKey).replace(".", "").toLowerCase() || "jpeg";
        const extNorm = ext === "jpg" ? "jpeg" : ext;
        if (!ctypesRef.value.includes(`Extension="${extNorm}"`)) {
          ctypesRef.value = ctypesRef.value.replace(
            "</Types>",
            `<Default Extension="${extNorm}" ContentType="image/${extNorm}"/></Types>`
          );
        }
        const name = `media/lb_${mediaN++}.${extNorm}`;
        zip.file(`word/${name}`, buf);
        const rid = `rId${relN++}`;
        relsXmlRef.value = relsXmlRef.value.replace(
          "</Relationships>",
          `<Relationship Id="${rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="${name}"/></Relationships>`
        );
        // foto sudah dipangkas ke rasio seragam → ukuran tampil TETAP per
        // orientasi; fallback rasio asli hanya untuk format yang tak
        // didukung sharp (mis. gif)
        const info = sizeMap?.get(fileKey);
        let cx, cy;
        if (info?.seragam) {
          ({ cx, cy } = ukuranSeragam(lebar, info.potret));
        } else {
          const { w, h } = info || imgSize(buf);
          cx = cmKeEmu(h > w ? lebar.potret : lebar.landscape);
          cy = Math.round(cx * (h / w));
        }
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

  // Media bawaan template: foto tabel dipangkas ke rasio seragam; media lain
  // (logo/kop) hanya dikompresi (foto lama tampil kecil — 640px cukup).
  // Ukuran tampilan foto tabel disetel ulang lewat extentSeragam di bawah;
  // ini juga menjaga hasil ekspor di bawah batas respons serverless (±4,5 MB).
  const mediaSeragam = new Map(); // nama media → potret?
  await Promise.all(
    Object.keys(zip.files)
      .filter((n) => /^word\/media\//i.test(n) && !zip.files[n].dir)
      .map(async (n) => {
        try {
          const buf = await zip.file(n).async("nodebuffer");
          if (mediaTabel.has(n)) {
            const r = await cropSeragam(buf);
            if (r) { zip.file(n, r.buf); mediaSeragam.set(n, r.potret); return; }
          }
          const kecil = await compressForEmbed(buf);
          if (kecil.length < buf.length) zip.file(n, kecil);
        } catch {}
      })
  );

  /** Setel ulang ukuran tampil drawing lama di tabel ke ukuran seragam. */
  const extentSeragam = (tblXml, lebar) =>
    tblXml.replace(/<w:drawing>[\s\S]*?<\/w:drawing>/g, (d) => {
      const rid = (d.match(/r:embed="(rId\d+)"/) || [])[1];
      const potret = rid ? mediaSeragam.get(normTarget(relTarget.get(rid))) : undefined;
      if (potret === undefined) return d; // media tak dipangkas → biarkan
      const { cx, cy } = ukuranSeragam(lebar, potret);
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
    ...keuList.map((e) => e.bukti_key).filter(Boolean),
  ];
  const bufferMap = new Map();
  await Promise.all(
    [...new Set(semuaKey)].map(async (k) => {
      const buf = await getFileBuffer(k);
      // dikecilkan utk sematan dokumen — jaga total berkas < batas respons Vercel
      if (buf) bufferMap.set(k, await compressForEmbed(buf));
    })
  );

  // Pangkas semua foto baru ke rasio seragam (landscape 4:3 / potret 3:4).
  // Dilakukan SEBELUM penjaga budget: kompresi lanjutan memakai fit-inside
  // sehingga rasio hasil pangkas tetap persis sama.
  const sizeMap = new Map();
  await Promise.all([...bufferMap.entries()].map(async ([k, b]) => {
    const r = await cropSeragam(b);
    if (r) {
      bufferMap.set(k, r.buf);
      sizeMap.set(k, { potret: r.potret, seragam: true });
    } else {
      try {
        const md = await sharp(b).metadata();
        if (md.width && md.height) sizeMap.set(k, { w: md.width, h: md.height });
      } catch {}
    }
  }));

  // PENJAGA UKURAN — logbook dengan puluhan foto bisa menembus batas respons
  // serverless Vercel (±4,5 MB) dan unduhan gagal tanpa pesan jelas.
  // Bila total sematan masih di atas anggaran, kompresi diperketat bertahap.
  const EMBED_BUDGET = 3 * 1024 * 1024;
  const totalEmbed = () => [...bufferMap.values()].reduce((s, b) => s + b.length, 0);
  for (const [dim, mutu] of [[480, 60], [360, 50], [260, 42]]) {
    if (totalEmbed() <= EMBED_BUDGET) break;
    await Promise.all([...bufferMap.entries()].map(async ([k, b]) => {
      bufferMap.set(k, await compressForEmbed(b, dim, mutu));
    }));
  }

  // Dimensi & orientasi sudah dicatat di sizeMap oleh cropSeragam di atas.
  const imgs = makeImageStore(zip, relsRef, ctRef, bufferMap, sizeMap, docXml);

  // Dua tabel utama sudah dikenali di awal (tblRe/tables); langsung pakai.
  let [tblKeg, tblKeu] = tables;
  // Foto lama bawaan template ikut diseragamkan ukur tampilnya
  tblKeg = extentSeragam(tblKeg, LEBAR_FOTO.kegiatan);
  tblKeu = extentSeragam(tblKeu, LEBAR_FOTO.keuangan);

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
      .map((k) => imgs.add(k, LEBAR_FOTO.kegiatan))
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
    const bukti = e.bukti_key ? imgs.add(e.bukti_key, LEBAR_FOTO.keuangan) : null;
    return [
      P(fmtTgl(e.tanggal), stKeu[0]), P(e.item, stKeu[1]),
      P(`${fmtRupiah(e.harga_satuan)}${e.satuan_suffix || ""}`, stKeu[2]),
      P(String(e.jumlah), stKeu[3]), P(fmtRupiah(e.total), stKeu[4]),
      bukti ? `<w:p>${stKeu[5]?.pPr || ""}<w:r>${bukti}</w:r></w:p>` : emptyP(),
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
  // sekadar menumpuk di akhir tabel.
  const kegXml = sortRowsByDate(hasilKeg.xml);
  const keuXml = sortRowsByDate(hasilKeu.xml);
  let idx = 0;
  docXml = docXml.replace(tblRe, (m) => {
    idx += 1;
    if (idx === 1) return kegXml;
    if (idx === 2) return keuXml;
    return m;
  });

  zip.file("word/document.xml", docXml);
  zip.file("word/_rels/document.xml.rels", relsRef.value);
  zip.file("[Content_Types].xml", ctRef.value);

  const out = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  return { buffer: out, kegBaru: hasilKeg.added, keuBaru: hasilKeu.added,
           kegLewat: hasilKeg.skipped, keuLewat: hasilKeu.skipped };
}


