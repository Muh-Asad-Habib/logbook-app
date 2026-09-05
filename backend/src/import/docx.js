/**
 * Impor DOCX — membaca dokumen logbook resmi (template atau salinan terisi),
 * lalu memasukkan entri yang BELUM ada di aplikasi beserta foto-fotonya.
 * Aman dijalankan berulang (entri yang sudah ada dilewati).
 *
 * Alur (dua tahap, hemat waktu & kuota):
 *  1. PARSE seluruh tabel → daftar entri baru + rId gambar per entri
 *     (tanpa menyentuh jaringan).
 *  2. UNGGAH foto: tiap media di dalam .docx dikompresi SEKALI (satu gambar
 *     bisa dirujuk beberapa baris), lalu diunggah dengan paralel terbatas —
 *     dulu satu per satu berurutan sehingga 100 foto = 100 × latensi.
 *  3. SIMPAN entri berurutan. Bila ada yang gagal di tengah, seluruh foto
 *     yang sudah terunggah pada sesi ini dihapus (tidak ada berkas yatim).
 */
import fs from "node:fs";
import path from "node:path";
import JSZip from "jszip";
import * as store from "../storage.js";
import { putFile, compressImage, removeFiles, jalankanTerbatas, ALLOWED_EXT } from "../files.js";
import { TEMPLATE } from "../export/docx.js";

/** Jumlah unggahan foto yang berjalan bersamaan saat impor. */
const PARALEL_UNGGAH = 5;

const BULAN_MAP = {
  jan: 1, feb: 2, mar: 3, apr: 4, mei: 5, jun: 6,
  jul: 7, agu: 8, sep: 9, okt: 10, nov: 11, des: 12,
};

// Kunci dedup entri — 80 huruf pertama agar entri mirip (beda di bagian
// belakang, mis. jam pelaksanaan) tetap dikenali sebagai entri berbeda.
const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 80);

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

/** "10" → 10 mnt · "2 jam" → 120 · "1 j 30 mnt" → 90 · "10.00-15.00" → 300 */
function parseWaktu(s) {
  const t = String(s).toLowerCase();
  // rentang jam "07.00-14.40" / "10-13.30" / "20:00–21:10" → durasi menit
  const r = t.match(/(\d{1,2})(?:[.:](\d{2}))?\s*[-–]\s*(\d{1,2})(?:[.:](\d{2}))?/);
  if (r) {
    const m1 = (+r[1]) * 60 + (+(r[2] || 0));
    const m2 = (+r[3]) * 60 + (+(r[4] || 0));
    if (m2 > m1 && +r[1] <= 24 && +r[3] <= 24) return m2 - m1;
  }
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

/**
 * Pembaca media di dalam paket .docx dengan CACHE: satu berkas media hanya
 * dibaca dari zip & dikompresi SEKALI walau dirujuk banyak baris.
 * @returns {(rid: string) => Promise<{buffer: Buffer, ext: string}|null>}
 */
function bikinPembacaMedia(zip, relMap) {
  const cache = new Map(); // target → Promise<{buffer, ext}|null>
  return (rid) => {
    const target = (relMap[rid] || "").replace(/^\//, "");
    if (!target || !target.includes("media/")) return Promise.resolve(null);
    if (!cache.has(target)) {
      cache.set(target, (async () => {
        try {
          const f = zip.file(`word/${target}`) || zip.file(target);
          if (!f) return null;
          const buf = await f.async("nodebuffer");
          let ext = (path.extname(target) || ".jpeg").toLowerCase();
          if (!ALLOWED_EXT.has(ext)) ext = ".jpg";
          return compressImage(buf, ext); // { buffer, ext }
        } catch {
          return null;
        }
      })());
    }
    return cache.get(target);
  };
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
  if (!tables.length) throw new Error("Dokumen tidak dikenali (tidak ada tabel logbook)");

  const warnings = [];
  // Kunci dedup kegiatan = tanggal + isi — kegiatan berulang (mis. rapat
  // pendampingan dengan uraian mirip) di TANGGAL BERBEDA adalah entri berbeda.
  const kegAda = new Set(
    (await store.listKegiatan(userId)).map((e) => `${e.tanggal}|${norm(e.kegiatan)}`)
  );
  const keuAda = new Set(
    (await store.listKeuangan(userId)).map((e) => `${e.tanggal}|${norm(e.item)}`)
  );

  /**
   * Tentukan jenis sebuah tabel: 'kegiatan' | 'keuangan' | null.
   * 1. Dari baris header (bila ada): "kegiatan"+"capaian/waktu" vs "item/harga".
   * 2. Tanpa header (tabel terpotong halaman): dari pola isi — kolom ke-3
   *    berupa persen → kegiatan; berisi "Rp" → keuangan.
   * 3. Masih tak dikenal → dianggap lanjutan tabel sebelumnya.
   */
  function jenisTabel(tbl, sebelumnya) {
    const rows = rowsOf(tbl);
    const kepala = rows.slice(0, 2)
      .map((tr) => cellsOf(tr).map(cellText).join(" ").toLowerCase()).join(" ");
    if (kepala.includes("harga") &&
        (kepala.includes("item") || kepala.includes("jumlah") ||
         kepala.includes("total") || kepala.includes("keterangan"))) {
      return "keuangan";
    }
    if ((kepala.includes("kegiatan") || kepala.includes("keterangan") ||
         kepala.includes("persentase") || kepala.includes("dokumentasi")) &&
        (kepala.includes("capaian") || kepala.includes("waktu") || kepala.includes("tanggal"))) {
      return "kegiatan";
    }
    for (const tr of rows.slice(0, 5)) {
      const teks = cellsOf(tr).map(cellText);
      if (teks.some((t) => /^\d+\s*%$/.test(String(t).trim()))) return "kegiatan";
      if (/rp\s*[\d.]/i.test(teks[2] || "")) return "keuangan";
    }
    return sebelumnya;
  }

  // ---------- Baris kegiatan ----------
  // Template resmi: Tanggal | Kegiatan | Capaian | Waktu | …
  // Varian umum:    Tanggal | Dokumentasi | Waktu | Persentase | Keterangan
  // Peta kolom dideteksi dari baris header; tanpa header → asumsi template.
  // Tahap ini HANYA mengumpulkan entri baru ke `antrean` — foto diunggah nanti.
  const antrean = []; // { jenis, data, rids: string[], prefix }
  let kegBaru = 0, kegLewat = 0, prevCum = 0, lastTglKeg = null;
  let kolom = { kegiatan: 1, capaian: 2, waktu: 3 };
  function prosesKegiatan(tbl) {
    for (const tr of rowsOf(tbl)) {
      const cells = cellsOf(tr);
      if (cells.length < 4) continue;
      const teks = cells.map(cellText);
      const semua = teks.join(" ").toLowerCase();
      if (!semua.trim()) continue;
      if (semua.includes("tanggal") &&
          (semua.includes("kegiatan") || semua.includes("keterangan") ||
           semua.includes("persentase"))) {
        // baris header → susun peta kolom dari judulnya
        const cari = (kata, def) => {
          const i = teks.findIndex((t) => kata.some((k) => t.toLowerCase().includes(k)));
          return i >= 0 ? i : def;
        };
        kolom = {
          kegiatan: cari(["kegiatan", "keterangan", "uraian", "deskripsi"], 1),
          capaian: cari(["capaian", "persentase", "persen", "%"], 2),
          waktu: cari(["waktu", "durasi", "jam"], 3),
        };
        continue;
      }

      const tanggal = parseTanggal(teks[0]) || lastTglKeg;
      if (parseTanggal(teks[0])) lastTglKeg = parseTanggal(teks[0]);
      const kegiatan = (teks[kolom.kegiatan] || "").trim();
      if (!tanggal || !kegiatan) {
        if (warnings.length < 8) {
          warnings.push(`Baris kegiatan dilewati (tidak terbaca): "${teks.join(" ").slice(0, 60)}…"`);
        }
        continue;
      }
      const cum = parseAngka(teks[kolom.capaian]);
      const delta = Math.max(0, cum - prevCum);
      prevCum = Math.max(prevCum, cum);
      if (kegAda.has(`${tanggal}|${norm(kegiatan)}`)) { kegLewat += 1; continue; }

      // Foto bisa diletakkan pengguna di sel mana pun (kolom Berkas, kolom
      // Kegiatan, bahkan kolom Tanggal/Validasi) — sisir seluruh sel baris.
      antrean.push({
        jenis: "kegiatan",
        prefix: `keg_${tanggal}`,
        rids: cells.flatMap(cellImageIds),
        data: { tanggal, kegiatan, capaian_delta: delta, waktu_menit: parseWaktu(teks[kolom.waktu]) },
      });
      kegAda.add(`${tanggal}|${norm(kegiatan)}`);
      kegBaru += 1;
    }
  }

  // ---------- Baris keuangan ----------
  // Template resmi: Tanggal | Item | Harga satuan | Jml | Total | Bukti
  // Varian umum:    Tanggal | Keterangan | Harga Satuan | Total | Gambar
  // Peta kolom dideteksi dari header; tanpa kolom Jml, jumlah diturunkan
  // dari Total ÷ Harga (total tersimpan = harga × jumlah).
  let keuBaru = 0, keuLewat = 0, lastTglKeu = null;
  let kolomKeu = { item: 1, harga: 2, jumlah: 3, total: 4, bukti: 5 };
  function prosesKeuangan(tbl) {
    for (const tr of rowsOf(tbl)) {
      const cells = cellsOf(tr);
      if (cells.length < 4) continue;
      const teks = cells.map(cellText);
      const semua = teks.join(" ").toLowerCase();
      if (!semua.trim()) continue;
      if (semua.includes("harga") &&
          (semua.includes("item") || semua.includes("keterangan") || semua.includes("total"))) {
        // baris header → susun peta kolom dari judulnya
        const cari = (kata, def) => {
          const i = teks.findIndex((t) => kata.some((k) => t.toLowerCase().includes(k)));
          return i >= 0 ? i : def;
        };
        const iHarga = cari(["harga"], 2);
        kolomKeu = {
          item: cari(["item", "keterangan", "uraian", "nama"], 1),
          harga: iHarga,
          jumlah: teks.findIndex((t) => /jml|jumlah|qty/i.test(t)), // -1 bila tak ada
          total: cari(["total"], -1),
          bukti: cari(["bukti", "gambar", "foto", "nota"], cells.length - 1),
        };
        continue;
      }

      const tanggal = parseTanggal(teks[0]) || lastTglKeu;
      if (parseTanggal(teks[0])) lastTglKeu = parseTanggal(teks[0]);
      const item = (teks[kolomKeu.item] || "").trim();
      if (!item) continue;
      if (keuAda.has(`${tanggal}|${norm(item)}`)) { keuLewat += 1; continue; }
      if (!tanggal) {
        if (warnings.length < 8) {
          warnings.push(`Baris belanja dilewati (tanggal tidak terbaca): "${teks.join(" ").slice(0, 60)}…"`);
        }
        continue;
      }

      let harga = parseRupiah(teks[kolomKeu.harga]);
      let jumlah = kolomKeu.jumlah >= 0 ? parseAngka(teks[kolomKeu.jumlah], 1) || 1 : 0;
      const totalDok = kolomKeu.total >= 0 ? parseRupiah(teks[kolomKeu.total]) : 0;
      // Sel harga kadang berisi JUMLAH ("1 Item") sementara nilai uangnya di
      // kolom Total — kenali dari kewajaran: angka ≤100 (tak masuk akal sebagai
      // rupiah) padahal totalnya ratusan kali lipat → perlakukan sebagai jumlah.
      if (harga > 0 && totalDok > 0 && harga <= 100 && totalDok >= harga * 100) {
        jumlah = harga;
        harga = 0;
      }
      if (!jumlah) {
        // tanpa kolom Jml → turunkan dari Total ÷ Harga (boleh pecahan, mis. 2,5 L)
        if (harga > 0 && totalDok > 0) jumlah = Math.round((totalDok / harga) * 100) / 100;
        else jumlah = 1;
      }
      if (!harga && totalDok > 0) harga = Math.round((totalDok / jumlah) * 100) / 100;

      // Nota sering memuat kode unik transfer (mis. 90.000 → 90.123). Bila
      // total di dokumen lebih besar dari harga × jumlah, selisih kecil itu
      // disimpan sebagai kode_unik supaya total tersimpan sama persis dengan
      // dokumen. Selisih besar diabaikan (kemungkinan salah baca kolom).
      let kodeUnik = 0;
      if (totalDok > 0) {
        const dasar = harga * jumlah;
        const selisih = Math.round((totalDok - dasar) * 100) / 100;
        if (selisih > 0 && selisih < Math.max(1000, dasar * 0.01)) kodeUnik = selisih;
      }

      // Utamakan kolom Bukti/Gambar, tetapi terima juga bila foto diletakkan
      // di sel lain pada baris yang sama — SEMUA gambar disimpan.
      const selBukti = cells[kolomKeu.bukti] || "";
      antrean.push({
        jenis: "keuangan",
        prefix: `keu_${tanggal}`,
        rids: [
          ...cellImageIds(selBukti),
          ...cells.filter((_, c) => c !== kolomKeu.bukti).flatMap(cellImageIds),
        ],
        data: {
          tanggal, item,
          harga_satuan: harga,
          satuan_suffix: parseSuffix(teks[kolomKeu.harga]),
          jumlah,
          kode_unik: kodeUnik,
        },
      });
      keuAda.add(`${tanggal}|${norm(item)}`);
      keuBaru += 1;
    }
  }

  // Proses setiap tabel sesuai jenisnya. Tabel pertama tanpa ciri apa pun
  // dianggap kegiatan (kompatibel dengan template resmi: tabel 1 = kegiatan).
  let jenisSebelumnya = null;
  for (let i = 0; i < tables.length; i++) {
    const jenis = jenisTabel(tables[i], jenisSebelumnya) || (i === 0 ? "kegiatan" : null);
    if (jenis === "kegiatan") prosesKegiatan(tables[i]);
    else if (jenis === "keuangan") prosesKeuangan(tables[i]);
    else if (warnings.length < 8) {
      warnings.push(`Tabel ke-${i + 1} dilewati (bukan tabel kegiatan/keuangan yang dikenali)`);
    }
    jenisSebelumnya = jenis;
  }

  // ---------- Tahap 2: unggah foto (paralel terbatas, kompres sekali) ----------
  const bacaMedia = bikinPembacaMedia(zip, relMap);
  const tugas = antrean.flatMap((e, ei) => e.rids.map((rid, ri) => ({ ei, ri, rid })));
  const terunggah = []; // semua key yang berhasil — untuk pembersihan bila gagal
  let fotoGagal = 0;
  const hasilFoto = await jalankanTerbatas(tugas, PARALEL_UNGGAH, async ({ ei, rid }) => {
    const m = await bacaMedia(rid);
    if (!m) return null;
    // sudah dikompresi oleh pembaca media → putFile tidak mengompres ulang
    const key = await putFile(`impor${m.ext}`, m.buffer, antrean[ei].prefix, { kompres: false });
    terunggah.push(key);
    return key;
  });
  // Susun kembali key per entri sesuai urutan kemunculan gambar di barisnya
  const fotoPerEntri = antrean.map(() => []);
  tugas.forEach((t, i) => {
    const key = hasilFoto[i];
    if (key) fotoPerEntri[t.ei][t.ri] = key;
    else fotoGagal += 1;
  });
  if (fotoGagal && warnings.length < 8) {
    warnings.push(`${fotoGagal} gambar tidak dapat dipindahkan (format tidak dikenali / gagal diunggah)`);
  }

  // ---------- Tahap 3: simpan entri (berurutan agar capaian kumulatif benar) ----------
  let iGagal = -1;
  try {
    for (let i = 0; i < antrean.length; i++) {
      iGagal = i;
      const e = antrean[i];
      const keys = fotoPerEntri[i].filter(Boolean);
      if (e.jenis === "kegiatan") {
        await store.addKegiatan(userId, { ...e.data, foto_keys: keys });
      } else {
        await store.addKeuangan(userId, { ...e.data, bukti_keys: keys });
      }
    }
  } catch (err) {
    // Gagal di tengah → foto milik entri yang BELUM tersimpan (mulai indeks
    // gagal) dihapus supaya tidak jadi berkas yatim. Entri yang sudah masuk
    // tetap utuh — impor ulang akan melewatinya.
    const yatim = fotoPerEntri.slice(iGagal).flat().filter(Boolean);
    await removeFiles(yatim);
    throw err;
  }

  return {
    keg_baru: kegBaru, keg_lewat: kegLewat, keu_baru: keuBaru, keu_lewat: keuLewat,
    foto_baru: terunggah.length, warnings,
  };
}

