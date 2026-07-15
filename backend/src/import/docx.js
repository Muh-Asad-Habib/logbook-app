/**
 * Impor DOCX — membaca dokumen logbook resmi (template atau salinan terisi),
 * lalu memasukkan entri yang BELUM ada di aplikasi beserta foto-fotonya.
 * Aman dijalankan berulang (entri yang sudah ada dilewati).
 */
import fs from "node:fs";
import path from "node:path";
import JSZip from "jszip";
import * as store from "../storage.js";
import { putFile } from "../files.js";
import { TEMPLATE } from "../export/docx.js";

const BULAN_MAP = {
  jan: 1, feb: 2, mar: 3, apr: 4, mei: 5, jun: 6,
  jul: 7, agu: 8, sep: 9, okt: 10, nov: 11, des: 12,
};

const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 40);

const unesc = (s) => String(s)
  .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
  .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n));

/** "23-Mei-26" / "06 Juni 2026" / "6/5/2026" → ISO yyyy-mm-dd (null bila gagal). */
function parseTanggal(s) {
  const t = String(s).trim().toLowerCase();
  let m = t.match(/(\d{1,2})[\s\-\/.]+([a-z]+)[\s\-\/.]+(\d{2,4})/);
  if (m) {
    const bln = BULAN_MAP[m[2].slice(0, 3)];
    let y = +m[3];
    if (y < 100) y += 2000;
    if (bln) return `${y}-${String(bln).padStart(2, "0")}-${String(+m[1]).padStart(2, "0")}`;
  }
  m = t.match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
  if (m) {
    let y = +m[3];
    if (y < 100) y += 2000;
    return `${y}-${String(+m[2]).padStart(2, "0")}-${String(+m[1]).padStart(2, "0")}`;
  }
  m = t.match(/(\d{4})-(\d{2})-(\d{2})/);
  return m ? m[0] : null;
}

/** "Rp 100.000" → 100000 */
const parseRupiah = (s) => {
  const m = String(s).replace(/[.\s,]/g, "").match(/(\d+)/);
  return m ? parseInt(m[1], 10) : 0;
};

/** "Rp 100.000 / bulan" → "/bulan" */
const parseSuffix = (s) => {
  const m = String(s).match(/\/\s*([A-Za-z]+)/);
  return m ? `/${m[1]}` : "";
};

/** "10" → 10 mnt · "2 jam" → 120 · "1 j 30 mnt" → 90 */
function parseWaktu(s) {
  const t = String(s).toLowerCase();
  const jam = t.match(/(\d+(?:[.,]\d+)?)\s*j/);
  const mnt = t.match(/(\d+)\s*m/) || (!jam ? t.match(/(\d+)/) : null);
  let total = 0;
  if (jam) total += Math.round(parseFloat(jam[1].replace(",", ".")) * 60);
  if (mnt) total += parseInt(mnt[1], 10);
  return total;
}

const parseAngka = (s, def = 0) => {
  const m = String(s).match(/(\d+)/);
  return m ? parseInt(m[1], 10) : def;
};

const rowsOf = (tbl) => tbl.match(/<w:tr[ >][\s\S]*?<\/w:tr>/g) || [];
const cellsOf = (tr) => tr.match(/<w:tc>[\s\S]*?<\/w:tc>/g) || [];

/** Teks sel (paragraf → baris baru). */
function cellText(tc) {
  return unesc(
    tc.split("</w:p>").map((chunk) =>
      (chunk.match(/<w:t[^>]*>[\s\S]*?<\/w:t>/g) || [])
        .map((t) => t.replace(/<[^>]+>/g, "")).join("")
    ).join("\n").replace(/\n{2,}/g, "\n").trim()
  );
}

/** Daftar rId gambar pada sel, urut kemunculan. */
const cellImageIds = (tc) => [...tc.matchAll(/r:embed="([^"]+)"/g)].map((m) => m[1]);

/** Simpan gambar dari zip docx ke folder uploads; kembalikan key (null bila gagal). */
async function saveImage(zip, relMap, rid, prefix) {
  try {
    const target = (relMap[rid] || "").replace(/^\//, "");
    if (!target || !target.includes("media/")) return null;
    const f = zip.file(`word/${target}`) || zip.file(target);
    if (!f) return null;
    const buf = await f.async("nodebuffer");
    const ext = path.extname(target) || ".jpeg";
    return putFile(`impor${ext}`, buf, prefix);
  } catch {
    return null;
  }
}

/**
 * Impor dari buffer .docx (atau template resmi bila buffer kosong).
 * @returns {keg_baru, keg_lewat, keu_baru, keu_lewat, warnings}
 */
export async function importDocx(buffer, userId) {
  let src = buffer || null;
  if (!src) {
    // Template bawaan berisi data lama milik akun pemegang arsip —
    // akun lain wajib mengunggah dokumennya sendiri agar datanya tetap terpisah.
    if (!(await store.isDefaultUser(userId))) {
      throw new Error("Pilih berkas .docx milikmu terlebih dahulu");
    }
    src = fs.existsSync(TEMPLATE) ? fs.readFileSync(TEMPLATE) : null;
  }
  if (!src) throw new Error("Tidak ada berkas .docx untuk diimpor");

  const zip = await JSZip.loadAsync(src);
  const docFile = zip.file("word/document.xml");
  if (!docFile) throw new Error("Berkas bukan dokumen Word (.docx) yang valid");
  const docXml = await docFile.async("string");
  const relsXml = await zip.file("word/_rels/document.xml.rels").async("string");
  const relMap = {};
  for (const m of relsXml.matchAll(/<Relationship[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/g)) {
    relMap[m[1]] = m[2];
  }

  const tables = docXml.match(/<w:tbl>[\s\S]*?<\/w:tbl>/g) || [];
  if (tables.length < 2) throw new Error("Dokumen tidak dikenali (butuh 2 tabel logbook)");

  const warnings = [];
  const kegAda = new Set((await store.listKegiatan(userId)).map((e) => norm(e.kegiatan)));
  const keuAda = new Set((await store.listKeuangan(userId)).map((e) => norm(e.item)));

  // ---------- Tabel 1: kegiatan ----------
  let kegBaru = 0, kegLewat = 0, prevCum = 0, lastTglKeg = null;
  for (const tr of rowsOf(tables[0])) {
    const cells = cellsOf(tr);
    if (cells.length < 5) continue;
    const teks = cells.map(cellText);
    const semua = teks.join(" ").toLowerCase();
    if (!semua.trim()) continue;
    if (semua.includes("tanggal") && semua.includes("kegiatan")) continue; // header

    const tanggal = parseTanggal(teks[0]) || lastTglKeg;
    if (parseTanggal(teks[0])) lastTglKeg = parseTanggal(teks[0]);
    const kegiatan = teks[1].trim();
    if (!tanggal || !kegiatan) {
      if (warnings.length < 8) {
        warnings.push(`Baris kegiatan dilewati (tidak terbaca): "${teks.join(" ").slice(0, 60)}…"`);
      }
      continue;
    }
    const cum = parseAngka(teks[2]);
    const delta = Math.max(0, cum - prevCum);
    prevCum = Math.max(prevCum, cum);
    if (kegAda.has(norm(kegiatan))) { kegLewat += 1; continue; }

    const fotoKeys = [];
    for (const rid of cellImageIds(cells[4])) {
      const k = await saveImage(zip, relMap, rid, `keg_${tanggal}`);
      if (k) fotoKeys.push(k);
    }
    await store.addKegiatan(userId, {
      tanggal, kegiatan, capaian_delta: delta,
      waktu_menit: parseWaktu(teks[3]), foto_keys: fotoKeys,
    });
    kegAda.add(norm(kegiatan));
    kegBaru += 1;
  }

  // ---------- Tabel 2: keuangan ----------
  let keuBaru = 0, keuLewat = 0, lastTglKeu = null;
  for (const tr of rowsOf(tables[1])) {
    const cells = cellsOf(tr);
    if (cells.length < 6) continue;
    const teks = cells.map(cellText);
    const semua = teks.join(" ").toLowerCase();
    if (!semua.trim()) continue;
    if (semua.includes("item") && semua.includes("harga")) continue; // header

    const tanggal = parseTanggal(teks[0]) || lastTglKeu;
    if (parseTanggal(teks[0])) lastTglKeu = parseTanggal(teks[0]);
    const item = teks[1].trim();
    if (!item) continue;
    if (keuAda.has(norm(item))) { keuLewat += 1; continue; }
    if (!tanggal) {
      if (warnings.length < 8) {
        warnings.push(`Baris belanja dilewati (tanggal tidak terbaca): "${teks.join(" ").slice(0, 60)}…"`);
      }
      continue;
    }

    let buktiKey = "";
    const ids = cellImageIds(cells[5]);
    if (ids.length) buktiKey = (await saveImage(zip, relMap, ids[0], `keu_${tanggal}`)) || "";

    await store.addKeuangan(userId, {
      tanggal, item,
      harga_satuan: parseRupiah(teks[2]),
      satuan_suffix: parseSuffix(teks[2]),
      jumlah: parseAngka(teks[3], 1) || 1,
      bukti_key: buktiKey,
    });
    keuAda.add(norm(item));
    keuBaru += 1;
  }

  return { keg_baru: kegBaru, keg_lewat: kegLewat, keu_baru: keuBaru, keu_lewat: keuLewat, warnings };
}

