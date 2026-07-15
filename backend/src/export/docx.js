/**
 * Ekspor DOCX — mengisi template resmi "template-logbook.docx".
 * Isi lama dipertahankan (tanggalnya diseragamkan menjadi "16 Juni 2026");
 * entri yang sudah ada di dokumen dilewati; entri baru diisikan ke baris kosong
 * beserta fotonya; baris kosong yang tersisa dihapus agar dokumen rapi.
 */
import fs from "node:fs";
import path from "node:path";
import JSZip from "jszip";
import { config } from "../config.js";
import * as store from "../storage.js";
import { getFileBuffer } from "../files.js";

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
 * ("23-Mei-26", "15 - Juni - 2026", "1/Juli/2026", "16 Juni 2026")
 * lalu kembalikan bentuk standar "16 Juni 2026"; null jika bukan tanggal.
 */
function parseTanggalText(s) {
  const m = String(s).trim()
    .match(/^(\d{1,2})\s*[-/. ]\s*([A-Za-z]+)\s*[-/. ]\s*(\d{2,4})$/);
  if (!m) return null;
  const kode = m[2].slice(0, 3).toLowerCase();
  const idx = BULAN.findIndex((b) => b.toLowerCase().startsWith(kode));
  if (idx < 0) return null;
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
 *  ke XML tetap sinkron walau sumbernya cloud. */
function makeImageStore(zip, relsXmlRef, ctypesRef, bufferMap) {
  let mediaN = 1000;
  let relN = 1000;
  let docPrN = 9000;
  const existing = relsXmlRef.value.match(/Id="rId(\d+)"/g) || [];
  for (const m of existing) {
    const n = parseInt(m.match(/\d+/)[0], 10);
    if (n >= relN) relN = n + 1;
  }
  return {
    /** Sisipkan gambar; kembalikan XML drawing atau null. */
    add(fileKey, widthCm = 2.6) {
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
        const { w, h } = imgSize(buf);
        const cx = Math.round(widthCm * 360000);
        const cy = Math.round(cx * (h / w));
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
 * Kosongkan isi lama tabel template (dipakai akun selain "pemilik template"):
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
 * Isi satu tabel: entri baru → baris kosong pertama (atau baris tambahan);
 * baris kosong yang tersisa DIHAPUS agar dokumen rapi.
 * @returns {added, skipped, xml}
 */
function fillTable(tblXml, entries, buildCells) {
  const docText = normText(textOf(tblXml));
  const rows = rowsOf(tblXml);
  const emptyRows = rows.filter((r) => isEmptyRow(r) && cellCount(r) >= 2);
  const templateRow = emptyRows[0] || rows[rows.length - 1];

  let added = 0, skipped = 0;
  const newRows = [];
  for (const e of entries) {
    if (docText.includes(e.dedup)) { skipped += 1; continue; }
    newRows.push(fillRow(templateRow, buildCells(e)));
    added += 1;
  }

  let xml = tblXml;
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

/** Entri yang BELUM ada di dokumen (untuk ditampilkan di UI). */
export async function entriesToExport(userId) {
  if (!_docXmlCache) await warmTemplate();
  // Akun selain pemilik template memakai template kosong → semua entrinya dihitung baru.
  const docText = (await store.isDefaultUser(userId)) ? normText(textOf(_docXmlCache)) : "";
  const inDoc = (k) => k !== "" && docText.includes(k);
  const keg = (await store.listKegiatan(userId)).filter((e) => !inDoc(norm(e.kegiatan)));
  const keu = (await store.listKeuangan(userId)).filter((e) => !inDoc(norm(e.item)));
  return { kegiatan: keg.length, keuangan: keu.length };
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
      if (buf) bufferMap.set(k, buf);
    })
  );
  const imgs = makeImageStore(zip, relsRef, ctRef, bufferMap);

  // Pisahkan dua tabel utama
  const tblRe = /<w:tbl>[\s\S]*?<\/w:tbl>/g;
  const tables = docXml.match(tblRe) || [];
  if (tables.length < 2) throw new Error("Struktur template tidak dikenali (butuh 2 tabel)");
  let [tblKeg, tblKeu] = tables;

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
      .map((k) => imgs.add(k, 2.6))
      .filter(Boolean)
      .map((d) => `<w:p>${stKeg[4]?.pPr || ""}<w:r>${d}</w:r></w:p>`)
      .join("") || emptyP();
    return [P(fmtTgl(e.tanggal), stKeg[0]), P(e.kegiatan, stKeg[1]),
            P(`${e.capaian_total}%`, stKeg[2]), P(String(e.waktu_menit), stKeg[3]), fotoXml];
  });

  // ---- Tabel keuangan: Tanggal | Item | Harga | Jumlah | Total | Bukti ----
  const keuEntries = keuList.map((e) => ({ ...e, dedup: norm(e.item) }));
  const tblKeuRapi = fillMissingDates(
    normalizeTableDates(tblKeu, stKeu[0]), keuEntries, stKeu[0]);
  const hasilKeu = fillTable(tblKeuRapi, keuEntries, (e) => {
    const bukti = e.bukti_key ? imgs.add(e.bukti_key, 2.2) : null;
    return [
      P(fmtTgl(e.tanggal), stKeu[0]), P(e.item, stKeu[1]),
      P(`${fmtRupiah(e.harga_satuan)}${e.satuan_suffix || ""}`, stKeu[2]),
      P(String(e.jumlah), stKeu[3]), P(fmtRupiah(e.total), stKeu[4]),
      bukti ? `<w:p>${stKeu[5]?.pPr || ""}<w:r>${bukti}</w:r></w:p>` : emptyP(),
    ];
  });

  // Susun ulang dokumen (ganti kedua tabel sesuai urutan)
  let idx = 0;
  docXml = docXml.replace(tblRe, (m) => {
    idx += 1;
    if (idx === 1) return hasilKeg.xml;
    if (idx === 2) return hasilKeu.xml;
    return m;
  });

  zip.file("word/document.xml", docXml);
  zip.file("word/_rels/document.xml.rels", relsRef.value);
  zip.file("[Content_Types].xml", ctRef.value);

  const out = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  return { buffer: out, kegBaru: hasilKeg.added, keuBaru: hasilKeu.added,
           kegLewat: hasilKeg.skipped, keuLewat: hasilKeu.skipped };
}


