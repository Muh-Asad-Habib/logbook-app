/**
 * Ekspor DOCX KHUSUS KEUANGAN — dokumen Word dirakit dari nol (bukan template
 * resmi), berisi TEKS & TABEL sehingga isinya mudah disalin dan diedit.
 *
 * Beda dengan ekspor gabungan (kegiatan + keuangan) yang memakai template
 * resmi: berkas ini memisahkan belanja menurut SUMBER DANA —
 *   A. Dana Belmawa   → dipecah per kategori PKM, tiap kategori diawali baris
 *                       pemisah ("BAHAN HABIS PAKAI") dan ditutup subtotal.
 *   B. Dana Perguruan Tinggi → satu tabel tanpa kategori.
 *   C. Belum ditandai  → hanya muncul bila ada entri tanpa penanda.
 * Ditutup rekap dana (pemakaian vs batas pedoman PKM) dan LAMPIRAN NOTA.
 *
 * Nota/bukti pembayaran ikut disematkan: thumbnail pada kolom "Nota" tiap
 * baris (penanda cepat) dan versi besarnya di bagian lampiran, bertanda
 * "L-1", "L-2", … sesuai nomor pada tabel. Satu berkas gambar hanya disimpan
 * SEKALI di dalam paket lalu dipakai ulang oleh kedua tampilan itu, sehingga
 * ukuran dokumen tetap hemat.
 */
import JSZip from "jszip";
import * as store from "../storage.js";
import { getFileBufferRetry, siapkanEmbed } from "../files.js";
import {
  KATEGORI_PKM, LABEL_KATEGORI, LABEL_SUMBER, rekapDana, BATAS_DANA_PT,
} from "./pkm.js";

const BULAN = ["Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

const fmtTgl = (iso) => {
  const [y, m, d] = String(iso || "").split("-").map(Number);
  return Number.isFinite(d) ? `${d} ${BULAN[m - 1]} ${y}` : String(iso || "");
};
const fmtRp = (n) => "Rp" + Number(n || 0).toLocaleString("id-ID");

const esc = (s) => String(s ?? "")
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;").replace(/'/g, "&apos;");

/* ---------------------------------------------------------------- palet --- */
const INDIGO = "4F46E5";
const INDIGO_DARK = "3730A3";
const INDIGO_BG = "EEF2FF";
const TEAL = "0D9488";
const TEAL_BG = "ECFDF5";
const INK = "0F172A";
const MUTED = "64748B";
const LINE = "E2E8F0";
const ZEBRA = "F8FAFC";
const AMBER_BG = "FFFBEB";
const ROSE = "E11D48";
const WHITE = "FFFFFF";

/* ------------------------------------------------------- helper OOXML ----- */
/** Lebar kolom tabel belanja (twips) — totalnya = lebar area konten A4 (9638). */
const KOL = [560, 1290, 2690, 1520, 620, 1760, 1198];

/** Ukuran tampil gambar (cm) di dokumen. */
const LEBAR_NOTA_TABEL = 1.7;   // thumbnail pada kolom "Nota"
const TINGGI_NOTA_TABEL = 2.6;
const LEBAR_NOTA_LAMPIRAN = 7.4; // 1 nota per baris lampiran
const LEBAR_NOTA_LAMPIRAN_2 = 5.4; // bila satu entri punya >1 nota
const TINGGI_NOTA_LAMPIRAN = 9.5;

const cmKeEmu = (cm) => Math.round(cm * 360000);

/**
 * Ukuran tampil (EMU) yang memuat gambar UTUH: lebar mengikuti kolom, tinggi
 * mengikuti rasio asli; bila terlalu tinggi (nota memanjang) tinggi dipatok
 * lalu lebarnya menyesuaikan — tanpa distorsi maupun pemotongan.
 */
function ukuranGambar(lebarCm, w, h, tinggiMaksCm) {
  const rasio = w > 0 && h > 0 ? h / w : 4 / 3;
  let cx = cmKeEmu(lebarCm);
  let cy = Math.round(cx * rasio);
  const cyMaks = cmKeEmu(tinggiMaksCm);
  if (cy > cyMaks) {
    cy = cyMaks;
    cx = Math.round(cy / rasio);
  }
  return { cx, cy };
}

const runPr = ({ b, i, sz = 19, color = INK } = {}) =>
  `<w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/>` +
  `${b ? "<w:b/>" : ""}${i ? "<w:i/>" : ""}` +
  `<w:color w:val="${color}"/><w:sz w:val="${sz}"/><w:szCs w:val="${sz}"/></w:rPr>`;

/**
 * Satu paragraf; teks multi-baris dipisah <w:br/> agar tetap satu paragraf.
 * `xml` dipakai untuk isi run mentah (mis. gambar nota) — kalau diisi, teks
 * diabaikan.
 */
function P(teks, opt = {}) {
  const { align = "left", after = 0, before = 0, xml = "", ...r } = opt;
  const pPr =
    `<w:pPr><w:spacing w:before="${before}" w:after="${after}" w:line="240" w:lineRule="auto"/>` +
    `<w:jc w:val="${align}"/></w:pPr>`;
  if (xml) return `<w:p>${pPr}<w:r>${runPr(r)}${xml}</w:r></w:p>`;
  const isi = String(teks ?? "").split(/\r?\n/)
    .map((l, i) => `${i ? "<w:br/>" : ""}<w:t xml:space="preserve">${esc(l)}</w:t>`)
    .join("");
  return `<w:p>${pPr}<w:r>${runPr(r)}${isi}</w:r></w:p>`;
}

/**
 * Sel tabel. `span` = jumlah kolom yang digabung (baris pemisah kategori),
 * `isi` = paragraf siap pakai (dipakai sel Nota yang memuat gambar + label).
 */
function TC(teks, { w, bg, span, isi, ...opt } = {}) {
  const lebar = span ? KOL.slice(0, span).reduce((s, x) => s + x, 0) : w;
  return `<w:tc><w:tcPr><w:tcW w:w="${lebar}" w:type="dxa"/>` +
    `${span ? `<w:gridSpan w:val="${span}"/>` : ""}` +
    `${bg ? `<w:shd w:val="clear" w:color="auto" w:fill="${bg}"/>` : ""}` +
    `<w:vAlign w:val="center"/></w:tcPr>${isi || P(teks, opt)}</w:tc>`;
}

/** Baris tabel; `head` menandai baris judul agar berulang di tiap halaman. */
const TR = (sel, { head = false, tinggi = 0 } = {}) =>
  `<w:tr>${head || tinggi
    ? `<w:trPr>${head ? "<w:cantSplit/>" : ""}` +
      `${tinggi ? `<w:trHeight w:val="${tinggi}"/>` : ""}` +
      `${head ? "<w:tblHeader/>" : ""}</w:trPr>`
    : ""}${sel.join("")}</w:tr>`;

const BORDER = ["top", "left", "bottom", "right", "insideH", "insideV"]
  .map((s) => `<w:${s} w:val="single" w:sz="6" w:space="0" w:color="${LINE}"/>`)
  .join("");

/** Bungkus baris menjadi tabel (lebar kolom mengikuti `kolom`, default KOL). */
function TBL(baris, kolom = KOL) {
  const total = kolom.reduce((s, w) => s + w, 0);
  return `<w:tbl><w:tblPr><w:tblW w:w="${total}" w:type="dxa"/>` +
    `<w:tblBorders>${BORDER}</w:tblBorders><w:tblLayout w:type="fixed"/>` +
    `<w:tblCellMar><w:top w:w="60" w:type="dxa"/><w:left w:w="90" w:type="dxa"/>` +
    `<w:bottom w:w="60" w:type="dxa"/><w:right w:w="90" w:type="dxa"/></w:tblCellMar>` +
    `</w:tblPr><w:tblGrid>${kolom.map((w) => `<w:gridCol w:w="${w}"/>`).join("")}</w:tblGrid>` +
    `${baris.join("")}</w:tbl>`;
}

/** Pemisah halaman (setara Ctrl+Enter di Word). */
const PAGE_BREAK = () => `<w:p><w:r><w:br w:type="page"/></w:r></w:p>`;

/**
 * Judul bagian (mis. "A. BELANJA DANA BELMAWA") bergaris bawah warna.
 * Urutan elemen di dalam <w:pPr> mengikuti skema OOXML: pBdr sebelum spacing,
 * spacing sebelum jc — supaya dokumen tetap valid saat dibuka & diedit di Word.
 */
const judulBagian = (teks, warna = INDIGO_DARK) =>
  `<w:p><w:pPr>` +
  `<w:pBdr><w:bottom w:val="single" w:sz="12" w:space="2" w:color="${warna}"/></w:pBdr>` +
  `<w:spacing w:before="240" w:after="100"/>` +
  `</w:pPr><w:r>${runPr({ b: true, sz: 24, color: warna })}` +
  `<w:t xml:space="preserve">${esc(teks)}</w:t></w:r></w:p>`;

/* --------------------------------------------------- potongan tabel ------- */
const HEAD_BELANJA = (warna) => TR([
  TC("No", { w: KOL[0], bg: warna, color: WHITE, b: true, align: "center" }),
  TC("Tanggal", { w: KOL[1], bg: warna, color: WHITE, b: true, align: "center" }),
  TC("Item belanja", { w: KOL[2], bg: warna, color: WHITE, b: true }),
  TC("Harga satuan", { w: KOL[3], bg: warna, color: WHITE, b: true, align: "center" }),
  TC("Jml", { w: KOL[4], bg: warna, color: WHITE, b: true, align: "center" }),
  TC("Total", { w: KOL[5], bg: warna, color: WHITE, b: true, align: "center" }),
  TC("Nota", { w: KOL[6], bg: warna, color: WHITE, b: true, align: "center" }),
], { head: true, tinggi: 340 });

/**
 * Baris entri belanja; nomor urut mengikuti urutan di tabelnya.
 * `nota` = { gambar: XML thumbnail (boleh ""), label: "L-3" } bila entri
 * punya bukti; bila tidak, kolom Nota diisi tanda "—".
 */
function barisEntri(e, no, genap, nota = null) {
  const bg = genap ? ZEBRA : "";
  const kode = Number(e.kode_unik) || 0;
  const harga = fmtRp(e.harga_satuan) + (e.satuan_suffix || "") +
    (kode > 0 ? `\n+ ${fmtRp(kode)} kode unik` : "");
  const selNota = nota
    ? TC("", {
      w: KOL[6], bg,
      isi: (nota.gambar
        ? P("", { xml: nota.gambar, align: "center", after: 20 })
        : "") +
        P(nota.label, { align: "center", sz: 15, b: true, color: INDIGO_DARK }) +
        (nota.n > 1 ? P(`${nota.n} nota`, { align: "center", sz: 13, color: MUTED }) : ""),
    })
    : TC("—", { w: KOL[6], bg, align: "center", color: MUTED });
  return TR([
    TC(String(no), { w: KOL[0], bg, align: "center", color: MUTED }),
    TC(fmtTgl(e.tanggal), { w: KOL[1], bg, align: "center" }),
    TC(e.item || "-", { w: KOL[2], bg }),
    TC(harga, { w: KOL[3], bg, align: "right", color: MUTED }),
    TC(String(e.jumlah ?? ""), { w: KOL[4], bg, align: "center" }),
    TC(fmtRp(e.total), { w: KOL[5], bg, align: "right", b: true }),
    selNota,
  ]);
}

/** Baris PEMISAH kategori — sel tunggal selebar tabel (mis. "BAHAN HABIS PAKAI"). */
const barisPemisah = (teks, ket = "", warna = INDIGO_DARK, bg = INDIGO_BG) =>
  TR([TC(ket ? `${teks}\n${ket}` : teks, {
    span: KOL.length, bg, b: true, sz: 20, color: warna,
  })], { tinggi: ket ? 400 : 320 });

/** Baris subtotal/total (label di kolom item, nominal di kolom total). */
const barisTotal = (label, nominal, { bg = INDIGO_BG, warna = INDIGO_DARK, ket = "" } = {}) =>
  TR([
    TC("", { w: KOL[0], bg }),
    TC("", { w: KOL[1], bg }),
    TC(label, { w: KOL[2], bg, b: true, color: warna, align: "right" }),
    TC(ket, { w: KOL[3], bg, i: true, sz: 16, color: MUTED, align: "right" }),
    TC("", { w: KOL[4], bg }),
    TC(fmtRp(nominal), { w: KOL[5], bg, b: true, color: warna, align: "right" }),
    TC("", { w: KOL[6], bg }),
  ], { tinggi: 320 });

/* ------------------------------------------------ gambar nota / bukti ----- */
/** Daftar kunci bukti sebuah entri — kompatibel dengan data lama (bukti_key). */
const buktiKeys = (e) =>
  e?.bukti_keys?.length ? e.bukti_keys : e?.bukti_key ? [e.bukti_key] : [];

/** XML gambar inline (drawing) — dipakai thumbnail tabel & lampiran. */
const drawingXml = (rid, id, cx, cy) =>
  `<w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0" ` +
  `xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing">` +
  `<wp:extent cx="${cx}" cy="${cy}"/><wp:effectExtent l="0" t="0" r="0" b="0"/>` +
  `<wp:docPr id="${id}" name="nota${id}"/>` +
  `<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">` +
  `<a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
  `<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
  `<pic:nvPicPr><pic:cNvPr id="${id}" name="nota${id}"/><pic:cNvPicPr/></pic:nvPicPr>` +
  `<pic:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>` +
  `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm>` +
  `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>` +
  `</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing>`;

/**
 * Kumpulan nota yang siap disematkan.
 *
 * Tiap berkas hanya disimpan SEKALI di `word/media/` lalu dipakai ulang oleh
 * thumbnail tabel maupun gambar besar di lampiran (rId sama, hanya id
 * <wp:docPr> yang berbeda karena Word mewajibkannya unik).
 */
function bikinMedia() {
  const berkas = [];               // { nama, buffer }
  const peta = new Map();          // key foto → { rid, w, h }
  const ext = new Set();           // ekstensi untuk [Content_Types].xml
  let nRel = 100;
  let nDocPr = 1000;

  return {
    /** Daftarkan satu foto hasil siapkanEmbed(). */
    tambah(key, buffer, w, h) {
      // jpeg/png dikenali dari isinya — nama berkas di cloud belum tentu benar
      const jpeg = buffer[0] === 0xff && buffer[1] === 0xd8;
      const png = buffer[0] === 0x89 && buffer[1] === 0x50;
      if (!jpeg && !png) return; // format lain (webp/gif) dilewati
      const e = jpeg ? "jpeg" : "png";
      ext.add(e);
      const nama = `media/nota_${berkas.length + 1}.${e}`;
      berkas.push({ nama, buffer });
      peta.set(key, { rid: `rId${nRel++}`, w, h });
      peta.get(key).nama = nama;
    },
    ada: (key) => peta.has(key),
    /** XML gambar untuk satu foto pada lebar tertentu (cm). */
    gambar(key, lebarCm, tinggiMaksCm) {
      const m = peta.get(key);
      if (!m) return "";
      const { cx, cy } = ukuranGambar(lebarCm, m.w, m.h, tinggiMaksCm);
      return drawingXml(m.rid, nDocPr++, cx, cy);
    },
    get berkasMedia() { return berkas; },
    /** Relationship gambar untuk word/_rels/document.xml.rels. */
    get relsXml() {
      return [...peta.values()].map((m) =>
        `<Relationship Id="${m.rid}" Type="http://schemas.openxmlformats.org/` +
        `officeDocument/2006/relationships/image" Target="${m.nama}"/>`).join("");
    },
    /** Default Extension untuk [Content_Types].xml. */
    get ctypesXml() {
      return [...ext].map((e) =>
        `<Default Extension="${e}" ContentType="image/${e}"/>`).join("");
    },
    get jumlah() { return berkas.length; },
  };
}

/**
 * Unduh & siapkan seluruh nota milik daftar entri.
 * Ukuran sedang (1000 px, mutu 80): tajam saat dicetak selebar ±7,4 cm namun
 * dokumen tetap ringan walau notanya puluhan.
 */
async function siapkanNota(entri) {
  const media = bikinMedia();
  const keys = [...new Set(entri.flatMap((e) => buktiKeys(e)))];
  const hasil = await Promise.all(keys.map(async (k) => {
    try {
      const buf = await getFileBufferRetry(k, 3, 800);
      if (!buf) return null;
      const r = await siapkanEmbed(buf, 1000, 80);
      return r.ok ? { key: k, ...r } : null;
    } catch {
      return null; // satu nota gagal diambil → dokumen tetap dibuat
    }
  }));
  // urutan pendaftaran dijaga stabil supaya penomoran media mudah dilacak
  for (const k of keys) {
    const r = hasil.find((x) => x?.key === k);
    if (r) media.tambah(k, r.buffer, r.w, r.h);
  }
  return media;
}

/* --------------------------------------------------------- dokumen -------- */
/**
 * Bangun berkas .docx khusus keuangan untuk satu tim.
 * @param {string|number} userId pemilik data
 * @param {string} namaTim nama tim untuk kop dokumen
 * @returns {Promise<Buffer>}
 */
export async function buildDocxKeuangan(userId, namaTim = "") {
  const [keuangan, dana] = await Promise.all([
    store.listKeuangan(userId),
    store.hitungDana(userId),
  ]);

  const urut = [...keuangan].sort((a, b) =>
    String(a.tanggal).localeCompare(String(b.tanggal)) || (a.id > b.id ? 1 : -1));
  const rekap = rekapDana(urut, { belmawa: dana.belmawa, pt: dana.pt });
  const pengeluaran = urut.reduce((s, e) => s + (Number(e.total) || 0), 0);

  const belmawa = urut.filter((e) => e.sumber === "belmawa");
  const pt = urut.filter((e) => e.sumber === "pt");
  const lain = urut.filter((e) => e.sumber !== "belmawa" && e.sumber !== "pt");

  // Nota/bukti diunduh & disiapkan lebih dulu supaya penyisipan ke XML sinkron
  const media = await siapkanNota(urut);

  // Penomoran lampiran (L-1, L-2, …) mengikuti urutan tabel: Belmawa → PT →
  // belum ditandai; entri tanpa nota tidak mendapat nomor.
  const lampiran = [];                 // { e, label, keys }
  const notaEntri = new Map();         // id entri → { label, gambar, n }
  for (const e of [...belmawa, ...pt, ...lain]) {
    const keys = buktiKeys(e).filter((k) => media.ada(k));
    if (!keys.length) continue;
    const label = `L-${lampiran.length + 1}`;
    lampiran.push({ e, label, keys });
    notaEntri.set(e.id, {
      label,
      n: keys.length,
      gambar: media.gambar(keys[0], LEBAR_NOTA_TABEL, TINGGI_NOTA_TABEL),
    });
  }
  const nota = (e) => notaEntri.get(e.id) || null;

  const tglEkspor = new Date().toLocaleDateString("id-ID",
    { day: "numeric", month: "long", year: "numeric" });

  const isi = [];

  /* ---------- kop ---------- */
  isi.push(P("LAPORAN KEUANGAN LOGBOOK", { b: true, sz: 32, color: INDIGO_DARK, align: "center", after: 40 }));
  isi.push(P(namaTim ? `Tim ${namaTim}` : "Rekapitulasi belanja per sumber dana",
    { b: true, sz: 22, color: INK, align: "center", after: 40 }));
  isi.push(P(`Belanja dipisahkan menurut sumber dana · diekspor ${tglEkspor}`,
    { sz: 17, color: MUTED, align: "center", after: 200 }));

  /* ---------- ringkasan sumber dana ---------- */
  const KOL_RING = [2600, 1900, 1900, 1700, 1538];
  const hRing = TR([
    TC("Sumber dana", { w: KOL_RING[0], bg: INDIGO, color: WHITE, b: true }),
    TC("Diterima", { w: KOL_RING[1], bg: INDIGO, color: WHITE, b: true, align: "center" }),
    TC("Terpakai", { w: KOL_RING[2], bg: INDIGO, color: WHITE, b: true, align: "center" }),
    TC("Sisa", { w: KOL_RING[3], bg: INDIGO, color: WHITE, b: true, align: "center" }),
    TC("Jumlah entri", { w: KOL_RING[4], bg: INDIGO, color: WHITE, b: true, align: "center" }),
  ], { head: true, tinggi: 340 });
  const barisRing = (nama, terima, pakai, sisa, n, warna, bg) => TR([
    TC(nama, { w: KOL_RING[0], bg, b: true, color: warna }),
    TC(terima === null ? "—" : fmtRp(terima), { w: KOL_RING[1], bg, align: "right" }),
    TC(fmtRp(pakai), { w: KOL_RING[2], bg, align: "right", b: true }),
    TC(sisa === null ? "—" : fmtRp(sisa), { w: KOL_RING[3], bg, align: "right", color: sisa < 0 ? ROSE : INK }),
    TC(`${n} entri`, { w: KOL_RING[4], bg, align: "center", color: MUTED }),
  ]);
  isi.push(judulBagian("RINGKASAN DANA"));
  isi.push(TBL([
    hRing,
    barisRing("Belmawa", rekap.danaBelmawa, rekap.totalBelmawa, rekap.sisaBelmawa,
      belmawa.length, INDIGO_DARK, ""),
    barisRing("Perguruan Tinggi", rekap.danaPt, rekap.totalPt, rekap.sisaPt,
      pt.length, TEAL, ZEBRA),
    ...(lain.length
      ? [barisRing("Belum ditandai", null, rekap.totalTanpaSumber, null, lain.length, MUTED, "")]
      : []),
    TR([
      TC("TOTAL PENGELUARAN", { w: KOL_RING[0], bg: INDIGO_BG, b: true, color: INDIGO_DARK }),
      TC(fmtRp(dana.total), { w: KOL_RING[1], bg: INDIGO_BG, align: "right", b: true, color: INDIGO_DARK }),
      TC(fmtRp(pengeluaran), { w: KOL_RING[2], bg: INDIGO_BG, align: "right", b: true, color: INDIGO_DARK }),
      TC(fmtRp(dana.total - pengeluaran), {
        w: KOL_RING[3], bg: INDIGO_BG, align: "right", b: true,
        color: dana.total - pengeluaran < 0 ? ROSE : INDIGO_DARK,
      }),
      TC(`${urut.length} entri`, { w: KOL_RING[4], bg: INDIGO_BG, align: "center", b: true, color: INDIGO_DARK }),
    ], { tinggi: 340 }),
  ], KOL_RING));
  if (rekap.ptLewatBatas) {
    isi.push(P(`Catatan: dana Perguruan Tinggi terpakai melebihi acuan ${fmtRp(BATAS_DANA_PT)}.`,
      { i: true, sz: 16, color: ROSE, before: 80 }));
  }

  /* ---------- A. dana Belmawa (dipecah per kategori) ---------- */
  isi.push(judulBagian("A. BELANJA DANA BELMAWA", INDIGO_DARK));
  if (!belmawa.length) {
    isi.push(P("Belum ada entri belanja yang ditandai sebagai dana Belmawa.",
      { i: true, sz: 18, color: MUTED }));
  } else {
    isi.push(P(
      "Tabel di bawah dikelompokkan per kategori belanja pedoman PKM. " +
      "Baris berwarna adalah pemisah kategori — seluruh entri di bawahnya " +
      "termasuk kategori tersebut. Kolom Nota memuat cuplikan bukti " +
      "pembayaran; versi besarnya ada di bagian Lampiran dengan nomor yang sama.",
      { sz: 17, color: MUTED, after: 120 }));

    const baris = [HEAD_BELANJA(INDIGO)];
    let no = 0;

    // Kelompok resmi (urutan mengikuti pedoman) + kelompok "belum berkategori"
    const grup = KATEGORI_PKM.map((k) => ({
      label: LABEL_KATEGORI[k.id].toUpperCase(),
      ket: rekap.danaBelmawa > 0
        ? `Dana Belmawa · maksimum ${k.maks}% (${fmtRp((rekap.danaBelmawa * k.maks) / 100)})`
        : `Dana Belmawa · maksimum ${k.maks}% dari dana Belmawa`,
      items: belmawa.filter((e) => e.kategori === k.id),
      maks: k.maks,
      id: k.id,
    }));
    const tanpaKat = belmawa.filter(
      (e) => !KATEGORI_PKM.some((k) => k.id === e.kategori));
    if (tanpaKat.length) {
      grup.push({
        label: "BELUM BERKATEGORI",
        ket: "Dana Belmawa · kategori belum dipilih pada entri",
        items: tanpaKat, maks: 0, id: "",
      });
    }

    for (const g of grup) {
      if (!g.items.length) continue;
      const warna = g.id ? INDIGO_DARK : MUTED;
      const bgPemisah = g.id ? INDIGO_BG : AMBER_BG;
      baris.push(barisPemisah(g.label, g.ket, warna, bgPemisah));
      let sub = 0;
      g.items.forEach((e, i) => {
        sub += Number(e.total) || 0;
        baris.push(barisEntri(e, ++no, i % 2 === 1, nota(e)));
      });
      const info = g.id && rekap.danaBelmawa > 0
        ? (() => {
          const k = rekap.kategori.find((x) => x.id === g.id);
          return k?.lewat ? "melebihi batas" : `${k?.pct ?? 0}% dari dana Belmawa`;
        })()
        : "";
      baris.push(barisTotal(`Subtotal ${g.label.toLowerCase()}`, sub, {
        bg: ZEBRA, warna, ket: info,
      }));
    }

    baris.push(barisTotal("TOTAL DANA BELMAWA", rekap.totalBelmawa, {
      bg: INDIGO_BG, warna: INDIGO_DARK,
      ket: rekap.danaBelmawa > 0 ? `sisa ${fmtRp(rekap.sisaBelmawa)}` : "",
    }));
    isi.push(TBL(baris));
  }

  /* ---------- B. dana Perguruan Tinggi ---------- */
  isi.push(PAGE_BREAK());
  isi.push(judulBagian("B. BELANJA DANA PERGURUAN TINGGI", TEAL));
  if (!pt.length) {
    isi.push(P("Belum ada entri belanja yang ditandai sebagai dana Perguruan Tinggi.",
      { i: true, sz: 18, color: MUTED }));
  } else {
    isi.push(P(
      `Dana Perguruan Tinggi tidak dipecah per kategori. Acuan pedoman PKM: maksimum ${fmtRp(BATAS_DANA_PT)}.`,
      { sz: 17, color: MUTED, after: 120 }));
    const baris = [HEAD_BELANJA(TEAL)];
    pt.forEach((e, i) => baris.push(barisEntri(e, i + 1, i % 2 === 1, nota(e))));
    baris.push(barisTotal("TOTAL DANA PERGURUAN TINGGI", rekap.totalPt, {
      bg: TEAL_BG, warna: TEAL,
      ket: rekap.danaPt > 0 ? `sisa ${fmtRp(rekap.sisaPt)}` : "",
    }));
    isi.push(TBL(baris));
  }

  /* ---------- C. belum ditandai ---------- */
  if (lain.length) {
    isi.push(judulBagian("C. BELANJA YANG BELUM DITANDAI SUMBER DANA", MUTED));
    isi.push(P(
      "Entri berikut belum dipilih sumber dananya. Nominalnya tetap dihitung " +
      "sebagai pengeluaran, namun belum masuk tabel Belmawa maupun Perguruan Tinggi.",
      { sz: 17, color: MUTED, after: 120 }));
    const baris = [HEAD_BELANJA(MUTED)];
    lain.forEach((e, i) => baris.push(barisEntri(e, i + 1, i % 2 === 1, nota(e))));
    baris.push(barisTotal("TOTAL BELUM DITANDAI", rekap.totalTanpaSumber, {
      bg: AMBER_BG, warna: MUTED,
    }));
    isi.push(TBL(baris));
  }

  /* ---------- rekap pemakaian dana Belmawa per kategori ---------- */
  isi.push(judulBagian("REKAP PEMAKAIAN DANA BELMAWA PER KATEGORI", INDIGO_DARK));
  const KOL_REKAP = [3100, 1900, 1900, 1200, 1538];
  const barisRekap = [TR([
    TC("Kategori", { w: KOL_REKAP[0], bg: INDIGO, color: WHITE, b: true }),
    TC("Batas maksimum", { w: KOL_REKAP[1], bg: INDIGO, color: WHITE, b: true, align: "center" }),
    TC("Terpakai", { w: KOL_REKAP[2], bg: INDIGO, color: WHITE, b: true, align: "center" }),
    TC("% dana", { w: KOL_REKAP[3], bg: INDIGO, color: WHITE, b: true, align: "center" }),
    TC("Status", { w: KOL_REKAP[4], bg: INDIGO, color: WHITE, b: true, align: "center" }),
  ], { head: true, tinggi: 340 })];
  rekap.kategori.forEach((k, i) => {
    const bg = i % 2 === 1 ? ZEBRA : "";
    barisRekap.push(TR([
      TC(`${k.label} (maks ${k.maks}%)`, { w: KOL_REKAP[0], bg, b: true }),
      TC(rekap.danaBelmawa > 0 ? fmtRp(k.batas) : "—", { w: KOL_REKAP[1], bg, align: "right" }),
      TC(fmtRp(k.terpakai), { w: KOL_REKAP[2], bg, align: "right", b: true }),
      TC(rekap.danaBelmawa > 0 ? `${k.pct}%` : "—", { w: KOL_REKAP[3], bg, align: "center" }),
      TC(k.lewat ? "MELEBIHI BATAS" : rekap.danaBelmawa > 0 ? "aman" : "isi dana Belmawa dulu", {
        w: KOL_REKAP[4], bg, align: "center", b: k.lewat, color: k.lewat ? ROSE : MUTED, sz: 17,
      }),
    ]));
  });
  barisRekap.push(TR([
    TC("TOTAL BELANJA DANA BELMAWA", { w: KOL_REKAP[0], bg: INDIGO_BG, b: true, color: INDIGO_DARK }),
    TC(rekap.danaBelmawa > 0 ? fmtRp(rekap.danaBelmawa) : "—", {
      w: KOL_REKAP[1], bg: INDIGO_BG, align: "right", b: true, color: INDIGO_DARK,
    }),
    TC(fmtRp(rekap.totalBelmawa), { w: KOL_REKAP[2], bg: INDIGO_BG, align: "right", b: true, color: INDIGO_DARK }),
    TC(rekap.danaBelmawa > 0
      ? `${Math.round((rekap.totalBelmawa / rekap.danaBelmawa) * 1000) / 10}%` : "—",
      { w: KOL_REKAP[3], bg: INDIGO_BG, align: "center", b: true, color: INDIGO_DARK }),
    TC(rekap.nBelmawaTanpaKategori
      ? `${rekap.nBelmawaTanpaKategori} entri belum berkategori` : "lengkap", {
      w: KOL_REKAP[4], bg: INDIGO_BG, align: "center", sz: 16, color: MUTED,
    }),
  ], { tinggi: 340 }));
  isi.push(TBL(barisRekap, KOL_REKAP));

  /* ---------- LAMPIRAN: nota / bukti pembayaran ---------- */
  if (lampiran.length) {
    isi.push(PAGE_BREAK());
    isi.push(judulBagian("LAMPIRAN — NOTA & BUKTI PEMBAYARAN", INDIGO_DARK));
    isi.push(P(
      `${lampiran.length} entri belanja disertai bukti. Nomor lampiran (L-1, L-2, …) ` +
      "sama dengan yang tertera pada kolom Nota di tabel belanja.",
      { sz: 17, color: MUTED, after: 160 }));

    let bagianAktif = "";
    for (const { e, label, keys } of lampiran) {
      // Sub-judul saat berpindah kelompok sumber dana
      const bagian = e.sumber === "belmawa" ? "belmawa" : e.sumber === "pt" ? "pt" : "lain";
      if (bagian !== bagianAktif) {
        bagianAktif = bagian;
        const judul = bagian === "belmawa" ? "Dana Belmawa"
          : bagian === "pt" ? "Dana Perguruan Tinggi"
            : "Belum ditandai sumber dananya";
        isi.push(P(judul.toUpperCase(), {
          b: true, sz: 19, before: 220, after: 60,
          color: bagian === "pt" ? TEAL : bagian === "belmawa" ? INDIGO_DARK : MUTED,
        }));
      }

      const penanda = e.sumber === "belmawa" && LABEL_KATEGORI[e.kategori]
        ? `${LABEL_SUMBER.belmawa} · ${LABEL_KATEGORI[e.kategori]}`
        : LABEL_SUMBER[e.sumber] || "belum ditandai";
      isi.push(P(`${label} · ${fmtTgl(e.tanggal)} — ${e.item || "-"}`, {
        b: true, sz: 19, color: INK, before: 140, after: 20,
      }));
      isi.push(P(`${fmtRp(e.total)} · ${penanda}${keys.length > 1 ? ` · ${keys.length} nota` : ""}`, {
        sz: 16, color: MUTED, after: 60,
      }));
      // Satu nota → besar; beberapa nota → berdampingan agar hemat halaman
      const lebar = keys.length > 1 ? LEBAR_NOTA_LAMPIRAN_2 : LEBAR_NOTA_LAMPIRAN;
      isi.push(P("", {
        align: "left", after: 120,
        xml: keys.map((k) => media.gambar(k, lebar, TINGGI_NOTA_LAMPIRAN)).join(""),
      }));
    }
  }

  isi.push(P(
    "Catatan: penandaan sumber dana & kategori bersifat opsional — entri tanpa " +
    "penanda tetap dihitung sebagai pengeluaran. Seluruh isi dokumen ini berupa " +
    "teks, tabel, dan gambar biasa sehingga bebas disalin maupun diedit ulang di Word.",
    { i: true, sz: 16, color: MUTED, before: 200 }));

  return rakitDocx(isi.join(""), namaTim, media);
}

/* ------------------------------------------------ perakitan paket docx ---- */
const SECT_PR =
  `<w:sectPr><w:pgSz w:w="11906" w:h="16838"/>` +
  `<w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" ` +
  `w:header="708" w:footer="708" w:gutter="0"/><w:cols w:space="708"/></w:sectPr>`;

const STYLES_XML =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">` +
  `<w:docDefaults><w:rPrDefault><w:rPr>` +
  `<w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/>` +
  `<w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr></w:rPrDefault>` +
  `<w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr></w:pPrDefault>` +
  `</w:docDefaults>` +
  `<w:style w:type="paragraph" w:default="1" w:styleId="Normal">` +
  `<w:name w:val="Normal"/><w:qFormat/></w:style>` +
  `<w:style w:type="table" w:default="1" w:styleId="TableNormal">` +
  `<w:name w:val="Normal Table"/><w:tblPr/></w:style></w:styles>`;

const CONTENT_TYPES =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
  `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
  `<Default Extension="xml" ContentType="application/xml"/>` +
  `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>` +
  `<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>` +
  `<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>` +
  `<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>` +
  `</Types>`;

const RELS =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
  `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>` +
  `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>` +
  `<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>` +
  `</Relationships>`;

const DOC_RELS =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
  `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
  `</Relationships>`;

/** Bungkus body XML menjadi paket .docx utuh (Buffer). */
async function rakitDocx(bodyXml, namaTim, media = null) {
  const zip = new JSZip();
  const judul = `Laporan Keuangan${namaTim ? ` — Tim ${namaTim}` : ""}`;
  const iso = new Date().toISOString().replace(/\.\d+Z$/, "Z");

  // Gambar nota butuh <Default Extension="jpeg|png"> dan relationship sendiri
  zip.file("[Content_Types].xml",
    media?.jumlah
      ? CONTENT_TYPES.replace("</Types>", `${media.ctypesXml}</Types>`)
      : CONTENT_TYPES);
  zip.folder("_rels").file(".rels", RELS);
  zip.folder("docProps").file("core.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" ` +
    `xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" ` +
    `xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">` +
    `<dc:title>${esc(judul)}</dc:title><dc:creator>Logbook Amerta Sign</dc:creator>` +
    `<cp:lastModifiedBy>Logbook Amerta Sign</cp:lastModifiedBy>` +
    `<dcterms:created xsi:type="dcterms:W3CDTF">${iso}</dcterms:created>` +
    `<dcterms:modified xsi:type="dcterms:W3CDTF">${iso}</dcterms:modified>` +
    `</cp:coreProperties>`);
  zip.folder("docProps").file("app.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" ` +
    `xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">` +
    `<Application>Logbook Amerta Sign</Application></Properties>`);
  const word = zip.folder("word");
  word.file("styles.xml", STYLES_XML);
  word.folder("_rels").file("document.xml.rels",
    media?.jumlah
      ? DOC_RELS.replace("</Relationships>", `${media.relsXml}</Relationships>`)
      : DOC_RELS);
  for (const m of media?.berkasMedia || []) word.file(m.nama, m.buffer);
  word.file("document.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" ` +
    `xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    `<w:body>${bodyXml}${SECT_PR}</w:body></w:document>`);

  return zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
}





