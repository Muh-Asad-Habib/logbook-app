/**
 * Penyusun DOCX "Khusus Keuangan" berformat lampiran laporan PKM
 * ("Lampiran 1. Penggunaan Dana").
 *
 * Modul ini MURNI — tidak menyentuh database maupun CDN — sehingga bisa diuji
 * dengan data contoh (tools/test-keuangan-lampiran.mjs). Pengambilan data tim
 * dan unduhan nota ada di keuangan-docx.js.
 *
 * Susunan dokumen meniru lampiran penggunaan dana PKM:
 *   LAMPIRAN
 *   Lampiran 1. Penggunaan Dana      ← caption ber-field SEQ (bisa masuk Daftar Lampiran)
 *   Tabel ringkas: Judul | Skema · Sumber · Tahun · Pendanaan · Penggunaan · Sisa
 *   Keterangan: … Dana Belmawa untuk Nota 01-37 dan Dana Perguruan Tinggi untuk Nota 38-43.
 *   Lampiran 1.1 Penggunaan Dana dari Belmawa         → satu tabel per kategori + SUB TOTAL
 *     TOTAL DANA BELMAWA, lalu Dokumentasi Nota Dana Belmawa (halaman baru)
 *   Lampiran 1.2 Penggunaan Dana dari Perguruan Tinggi → satu tabel tanpa kategori
 *     TOTAL DANA PERGURUAN TINGGI, lalu Dokumentasi Nota Dana Perguruan Tinggi
 *   Lampiran 1.3 … Belum Ditandai Sumbernya           → hanya bila ada entri tanpa sumber
 *
 * Kode nota bernomor global dua digit (01, 02, …): satu kode per gambar nota,
 * dibagikan menurut tanggal (tanggal sama → urutan kategori) — Belmawa dulu,
 * lalu Perguruan Tinggi, lalu yang belum ditandai — sehingga tabel dokumentasi
 * selalu urut. Entri dengan beberapa nota memakai rentang ("04-07"); entri
 * tanpa nota bertanda "-".
 *
 * Setiap run memakai format langsung (Times New Roman 12, hitam) supaya
 * tampilannya tetap sama ketika ditempel ke dokumen laporan tim.
 */
import JSZip from "jszip";
import { KATEGORI_PKM } from "./pkm.js";

/* --------------------------------------------------------------- format --- */
/** 925000 → "925.000"; pecahan maksimal 2 digit (jumlah boleh desimal). */
export const fmtAngka = (n) =>
  (Number(n) || 0).toLocaleString("id-ID", { maximumFractionDigits: 2 });

/** 3741172 → "Rp3.741.172"; negatif → "-Rp…". */
export const fmtRp = (n) => {
  const x = Number(n) || 0;
  return x < 0 ? `-Rp${fmtAngka(-x)}` : `Rp${fmtAngka(x)}`;
};

/** "2026-06-17" → "17-06-2026". */
export const fmtTanggal = (iso) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso ?? ""));
  return m ? `${m[3]}-${m[2]}-${m[1]}` : String(iso ?? "") || "-";
};

/** Satuan dari isian aplikasi: "/liter" → "Liter", "per jam" → "Jam", "/kg" → "kg". */
export const satuanDari = (suffix) => {
  let s = String(suffix ?? "").trim().replace(/^\/+\s*/, "").replace(/^per\s+/i, "").trim();
  // Kapital di awal seperti contoh lampiran; singkatan pendek ("kg", "m2") dibiarkan
  if (s.length >= 3 && /^[a-z]/.test(s)) s = s[0].toUpperCase() + s.slice(1);
  return s;
};

/** Kolom Jumlah: "19 Liter", "1 Bulan". */
export const fmtJumlah = (e) => {
  const satuan = satuanDari(e?.satuan_suffix);
  const jumlah = fmtAngka(e?.jumlah);
  return satuan ? `${jumlah} ${satuan}` : jumlah;
};

/** Kolom Keterangan: nama belanja + kode unik/biaya admin (sudah termasuk total). */
export const fmtKeterangan = (e) => {
  const item = String(e?.item ?? "").trim() || "-";
  const kode = Number(e?.kode_unik) || 0;
  return kode > 0 ? `${item} (kode unik/biaya admin : ${fmtAngka(kode)})` : item;
};

/** "a" · "a dan b" · "a, b, dan c". */
const gabungKalimat = (xs) => {
  if (xs.length <= 1) return xs.join("");
  if (xs.length === 2) return `${xs[0]} dan ${xs[1]}`;
  return `${xs.slice(0, -1).join(", ")}, dan ${xs[xs.length - 1]}`;
};

/** ["01"] → "01"; ["04", "05", "06", "07"] → "04-07". */
const rentang = (kode) =>
  kode.length > 1 ? `${kode[0]}-${kode[kode.length - 1]}` : kode[0] || "-";

const totalBelanja = (entri) => entri.reduce((s, e) => s + (Number(e.total) || 0), 0);

/**
 * Kalimat "Keterangan:" di bawah tabel ringkas — rentang kode nota per sumber.
 * @param {{belmawa?: Array, pt?: Array, tanpaSumber?: Array}} nota daftar {kode}
 */
export function kalimatKeterangan({ belmawa = [], pt = [], tanpaSumber = [] } = {}) {
  const r = (daftar) => rentang(daftar.map((n) => n.kode));
  const bagian = [];
  if (belmawa.length) bagian.push(`Dana Belmawa untuk Nota ${r(belmawa)}`);
  if (pt.length) bagian.push(`Dana Perguruan Tinggi untuk Nota ${r(pt)}`);
  if (tanpaSumber.length) {
    bagian.push(`dana yang belum ditandai sumbernya untuk Nota ${r(tanpaSumber)}`);
  }
  return bagian.length
    ? `Keterangan: Penggunaan dana dipisahkan berdasarkan sumber pendanaan, yaitu ${gabungKalimat(bagian)}.`
    : "Keterangan: Penggunaan dana dipisahkan berdasarkan sumber pendanaan " +
      "(Dana Belmawa dan Dana Perguruan Tinggi); belum ada nota yang dilampirkan.";
}

/** Judul kategori seperti pada lampiran PKM; urutan mengikuti KATEGORI_PKM. */
const JUDUL_KATEGORI = {
  bahan: "Bahan Habis Pakai",
  sewa: "Sewa dan Jasa",
  transport: "Transportasi Lokal",
  lain: "Lain-lain",
};

/* ---------------------------------------------------------- gambar nota --- */
/** Daftar kunci bukti sebuah entri — kompatibel dengan data lama (bukti_key). */
export const buktiKeys = (e) =>
  e?.bukti_keys?.length ? e.bukti_keys : e?.bukti_key ? [e.bukti_key] : [];

/**
 * Ukuran tampil nota di kolom Dokumentasi (cm), meniru contoh lampiran: foto
 * nota setinggi 7,5 cm (± 3 nota per halaman) dengan lebar ≤ 7 cm; struk atau
 * tangkapan layar memanjang tetap selebar ≥ 4,5 cm agar terbaca, tinggi ≤ 20 cm.
 */
const NOTA_CM = { tinggi: 7.5, lebarMaks: 7, lebarMin: 4.5, tinggiMaks: 20 };

const cmKeEmu = (cm) => Math.round(cm * 360000);

/** Ukuran tampil (EMU) yang memuat gambar UTUH — rasio asli, tanpa pemotongan. */
export function ukuranNota(w, h) {
  const rasio = w > 0 && h > 0 ? h / w : 4 / 3;
  let lebar = NOTA_CM.tinggi / rasio;
  if (lebar > NOTA_CM.lebarMaks) lebar = NOTA_CM.lebarMaks;
  else if (lebar < NOTA_CM.lebarMin) lebar = Math.min(NOTA_CM.lebarMin, NOTA_CM.tinggiMaks / rasio);
  const cx = cmKeEmu(lebar);
  return { cx, cy: Math.round(cx * rasio) };
}

/** XML gambar inline (drawing). */
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
 * Kumpulan nota yang siap disematkan. Tiap berkas hanya disimpan SEKALI di
 * `word/media/` walau dipakai beberapa entri (rId sama, hanya id <wp:docPr>
 * yang berbeda karena Word mewajibkannya unik).
 */
export function bikinMedia() {
  const berkas = []; // { nama, buffer }
  const peta = new Map(); // key foto → { rid, w, h, nama }
  const ext = new Set(); // ekstensi untuk [Content_Types].xml
  let nRel = 100;
  let nDocPr = 1000;

  return {
    /** Daftarkan satu foto (buffer JPEG/PNG + ukuran aslinya). */
    tambah(key, buffer, w, h) {
      if (peta.has(key) || !buffer?.length) return;
      // jpeg/png dikenali dari isinya — nama berkas di cloud belum tentu benar
      const jpeg = buffer[0] === 0xff && buffer[1] === 0xd8;
      const png = buffer[0] === 0x89 && buffer[1] === 0x50;
      if (!jpeg && !png) return; // format lain (webp/gif) dilewati
      const e = jpeg ? "jpeg" : "png";
      ext.add(e);
      const nama = `media/nota_${berkas.length + 1}.${e}`;
      berkas.push({ nama, buffer });
      peta.set(key, { rid: `rId${nRel++}`, w, h, nama });
    },
    ada: (key) => peta.has(key),
    /** XML gambar untuk satu foto berukuran tampil nota (lihat ukuranNota). */
    gambar(key) {
      const m = peta.get(key);
      if (!m) return "";
      const { cx, cy } = ukuranNota(m.w, m.h);
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

/* ---------------------------------------------------------------- OOXML --- */
const FONT = "Times New Roman";
const NS_W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const NS_R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

// Karakter kendali tidak sah di XML 1.0 — dibuang supaya dokumen tidak rusak
const KENDALI = new RegExp("[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\uFFFE\\uFFFF]", "g");

const esc = (s) => String(s ?? "").replace(KENDALI, "")
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;").replace(/'/g, "&apos;");

/**
 * Format run langsung: Times New Roman 12 hitam (+ tebal). `tegak` menolak
 * miring dari gaya Caption/Heading versi Word lain saat ditempel.
 */
const rPr = ({ b = false, tegak = false } = {}) =>
  `<w:rPr><w:rFonts w:ascii="${FONT}" w:eastAsia="${FONT}" w:hAnsi="${FONT}" w:cs="${FONT}"/>` +
  (b ? "<w:b/><w:bCs/>" : "") +
  (tegak ? `<w:i w:val="0"/><w:iCs w:val="0"/>` : "") +
  `<w:color w:val="auto"/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr>`;

/** Isi run dari teks: baris baru → <w:br/>, tab → <w:tab/>. */
const isiTeks = (teks) => String(teks ?? "").split(/\r?\n/).map((baris, i) =>
  (i ? "<w:br/>" : "") + baris.split("\t").map((t, j) =>
    (j ? "<w:tab/>" : "") + (t ? `<w:t xml:space="preserve">${esc(t)}</w:t>` : "")).join(""),
).join("");

const run = (isi, rp) => `<w:r>${rp}${isi}</w:r>`;

/**
 * Satu paragraf. `runs` = isi run mentah (caption ber-field, gambar); bila
 * kosong, `teks` dijadikan satu run.
 */
function P(teks, o = {}) {
  const {
    gaya = "", keepNext = false, halamanBaru = false, before = 0, after = 0,
    line = 276, ind = null, jc = "", b = false, runs = "",
  } = o;
  const rp = rPr({ b, tegak: Boolean(gaya) });
  const pPr = "<w:pPr>" +
    (gaya ? `<w:pStyle w:val="${gaya}"/>` : "") +
    (keepNext ? "<w:keepNext/>" : "") +
    (halamanBaru ? "<w:pageBreakBefore/>" : "") +
    `<w:spacing w:before="${before}" w:after="${after}" w:line="${line}" w:lineRule="auto"/>` +
    (ind ? `<w:ind w:left="${ind[0]}" w:hanging="${ind[1]}"/>` : "") +
    (jc ? `<w:jc w:val="${jc}"/>` : "") +
    `${rp}</w:pPr>`;
  const isi = runs || (String(teks ?? "") ? run(isiTeks(teks), rp) : "");
  return `<w:p>${pPr}${isi}</w:p>`;
}

/** Caption "Lampiran {SEQ}. Penggunaan Dana" — field SEQ seperti sisipan Word. */
function captionLampiran(sesudah) {
  const rp = rPr({ b: true, tegak: true });
  const r = (x) => run(x, rp);
  return P("", {
    gaya: "Caption", keepNext: true, b: true,
    runs: r(`<w:t xml:space="preserve">Lampiran </w:t>`) +
      r(`<w:fldChar w:fldCharType="begin"/>`) +
      r(`<w:instrText xml:space="preserve"> SEQ Lampiran \\* ARABIC </w:instrText>`) +
      r(`<w:fldChar w:fldCharType="separate"/>`) +
      r(`<w:t>1</w:t>`) +
      r(`<w:fldChar w:fldCharType="end"/>`) +
      r(`<w:t xml:space="preserve">${esc(sesudah)}</w:t>`),
  });
}

/** Sel tabel; `span` = kolom digabung, `vMerge` = "restart" | "lanjut". */
function TC(teks, { w, span = 1, vMerge = "", jc = "", b = false, gambar = "", keepNext = false } = {}) {
  const tcPr = `<w:tcPr><w:tcW w:w="${w}" w:type="dxa"/>` +
    (span > 1 ? `<w:gridSpan w:val="${span}"/>` : "") +
    (vMerge === "restart" ? `<w:vMerge w:val="restart"/>` : vMerge ? "<w:vMerge/>" : "") +
    `<w:vAlign w:val="center"/></w:tcPr>`;
  const isi = gambar
    ? P("", { jc: "center", line: 240, before: 60, after: 60, runs: run(gambar, rPr()) })
    : P(teks, { jc, b, keepNext });
  return `<w:tc>${tcPr}${isi}</w:tc>`;
}

/** Baris judul tabel: tidak diulang tiap halaman (seperti contoh) tetapi selalu menempel baris pertama. */
const kepalaTabel = (judul, K) => judul.map((t, i) => TC(t, { w: K[i], jc: "center", b: true, keepNext: true }));

/** Baris tabel — tidak terbelah antarhalaman. */
const TR = (sel) => `<w:tr><w:trPr><w:cantSplit/></w:trPr>${sel.join("")}</w:tr>`;

const garis = (sz, warna) => ["top", "left", "bottom", "right", "insideH", "insideV"]
  .map((s) => `<w:${s} w:val="single" w:sz="${sz}" w:space="0" w:color="${warna}"/>`).join("");

const lebarTotal = (xs) => xs.reduce((s, x) => s + x, 0);

/** Tabel bergaris hitam tunggal dengan lebar kolom tetap. */
function TBL(grid, baris, { tengah = false } = {}) {
  return `<w:tbl><w:tblPr><w:tblStyle w:val="TableGrid"/>` +
    `<w:tblW w:w="${lebarTotal(grid)}" w:type="dxa"/>` +
    (tengah ? `<w:jc w:val="center"/>` : "") +
    `<w:tblBorders>${garis(8, "000000")}</w:tblBorders><w:tblLayout w:type="fixed"/>` +
    `<w:tblLook w:val="04A0" w:firstRow="1" w:lastRow="0" w:firstColumn="1" ` +
    `w:lastColumn="0" w:noHBand="0" w:noVBand="1"/></w:tblPr>` +
    `<w:tblGrid>${grid.map((g) => `<w:gridCol w:w="${g}"/>`).join("")}</w:tblGrid>` +
    `${baris.join("")}</w:tbl>`;
}

/* -------------------------------------------------------------- bagian --- */
/** Lebar kolom (twips) persis seperti lampiran contoh; area teks A4 = 7937. */
const KOL_RINGKAS = [1084, 1306, 1079, 1483, 1506, 1459];
const KOL_BELANJA = [685, 1418, 1441, 1134, 1276, 1097, 876];
const KOL_DOKUMENTASI = [1779, 1873, 4275];

/** Tabel ringkas: Judul, lalu Skema | Sumber | Tahun | Pendanaan | Penggunaan | Sisa. */
function tabelRingkas({ judul, skema, tahun, baris }) {
  const K = KOL_RINGKAS;
  const kepala = (t, i) => TC(t, { w: K[i], jc: "center", b: true });
  const jumlah = (f) => baris.reduce((s, r) => s + f(r), 0);
  return TBL(K, [
    TR([kepala("Judul", 0), TC(judul, { w: lebarTotal(K.slice(1)), span: 5, jc: "both" })]),
    TR(["Skema", "Sumber", "Tahun", "Pendanaan (Rp)", "Penggunaan (Rp)", "Sisa (Rp)"].map(kepala)),
    ...baris.map((r, i) => TR([
      TC(i === 0 ? skema : "", { w: K[0], jc: "center", vMerge: i === 0 ? "restart" : "lanjut" }),
      TC(r.label, { w: K[1] }),
      TC(String(tahun), { w: K[2] }),
      TC(fmtAngka(r.dana), { w: K[3], jc: "center" }),
      TC(fmtAngka(r.pakai), { w: K[4], jc: "center" }),
      TC(fmtAngka(r.dana - r.pakai), { w: K[5], jc: "center" }),
    ])),
    TR([
      TC("SUB TOTAL", { w: lebarTotal(K.slice(0, 3)), span: 3, b: true }),
      TC(fmtRp(jumlah((r) => r.dana)), { w: K[3], jc: "right", b: true }),
      TC(fmtRp(jumlah((r) => r.pakai)), { w: K[4], jc: "right", b: true }),
      TC(fmtRp(jumlah((r) => r.dana - r.pakai)), { w: K[5], jc: "center", b: true }),
    ]),
  ], { tengah: true });
}

/** Tabel belanja 7 kolom + baris SUB TOTAL. */
function tabelBelanja(entri, kodeNota) {
  const K = KOL_BELANJA;
  return TBL(K, [
    TR(kepalaTabel(["No", "Tanggal", "Keterangan", "Harga Satuan (Rp)", "Jumlah", "Total (Rp)", "Kode Nota"], K)),
    ...entri.map((e, i) => TR([
      TC(`${i + 1}.`, { w: K[0], jc: "center" }),
      TC(fmtTanggal(e.tanggal), { w: K[1], jc: "center" }),
      TC(fmtKeterangan(e), { w: K[2] }),
      TC(fmtAngka(e.harga_satuan), { w: K[3] }),
      TC(fmtJumlah(e), { w: K[4], jc: "center" }),
      TC(fmtAngka(e.total), { w: K[5], jc: "center" }),
      TC(kodeNota.get(e) || "-", { w: K[6], jc: "center" }),
    ])),
    TR([
      TC("SUB TOTAL", { w: lebarTotal(K.slice(0, 5)), span: 5, b: true }),
      TC(fmtRp(totalBelanja(entri)), { w: K[5] + K[6], span: 2, jc: "right", b: true }),
    ]),
  ]);
}

/** Tabel dokumentasi: No | Kode Nota | Dokumentasi (satu gambar per baris). */
function tabelDokumentasi(nota, media) {
  const K = KOL_DOKUMENTASI;
  return TBL(K, [
    TR(kepalaTabel(["No", "Kode Nota", "Dokumentasi"], K)),
    ...nota.map((n, i) => TR([
      TC(`${i + 1}.`, { w: K[0], jc: "center" }),
      TC(n.kode, { w: K[1], jc: "center" }),
      TC("", { w: K[2], gambar: media.gambar(n.key) }),
    ])),
  ]);
}

/** Kelompok kategori Belmawa yang berisi entri; kategori tak dikenal → "Belum Berkategori". */
function grupKategori(entri) {
  const dikenal = new Set(KATEGORI_PKM.map((k) => k.id));
  return [
    ...KATEGORI_PKM.map((k) => ({
      label: JUDUL_KATEGORI[k.id] || k.label,
      entri: entri.filter((e) => e.kategori === k.id),
    })),
    { label: "Belum Berkategori", entri: entri.filter((e) => !dikenal.has(e.kategori)) },
  ].filter((g) => g.entri.length);
}

/** Satu sub-lampiran sumber dana: tabel belanja, TOTAL, lalu dokumentasi nota. */
function bagianSumber(o) {
  const {
    judul, catatan = "", entri, kosong, perKategori = false, labelTotal, labelDok,
    nota, media, kodeNota, dokHalamanBaru = false,
  } = o;
  const isi = [P(judul, { gaya: "Caption", keepNext: true, b: true, before: 80, after: 40 })];
  if (catatan) isi.push(P(catatan, { jc: "both", keepNext: entri.length > 0, after: 40 }));
  if (!entri.length) {
    isi.push(P(kosong));
  } else if (perKategori) {
    grupKategori(entri).forEach((g, i) => {
      isi.push(P(`${i + 1}.\t${g.label}`, { b: true, keepNext: true, before: 80, ind: [360, 360] }));
      isi.push(tabelBelanja(g.entri, kodeNota));
    });
  } else {
    isi.push(tabelBelanja(entri, kodeNota));
  }
  isi.push(P(`${labelTotal}: ${fmtRp(totalBelanja(entri))}`, { b: true, before: 120 }));
  if (nota.length) {
    isi.push(P(labelDok, {
      b: true, keepNext: true, halamanBaru: dokHalamanBaru, before: dokHalamanBaru ? 0 : 120, after: 40,
    }));
    isi.push(tabelDokumentasi(nota, media));
  }
  return isi.join("");
}

/**
 * Susun berkas .docx lampiran penggunaan dana.
 * @param {object} o
 * @param {Array} o.keuangan entri keuangan (bentuk storage.listKeuangan)
 * @param {{belmawa?: number, pt?: number, awal?: number}} o.dana hasil storage.hitungDana
 * @param {{skema?: string, tahun?: number|null, judul?: string}} o.profil profil PKM tim
 * @param {ReturnType<typeof bikinMedia>} [o.media] nota yang sudah disiapkan
 * @param {string} [o.namaTim] nama tim untuk properti dokumen
 * @returns {Promise<Buffer>}
 */
export async function susunDocxKeuangan({
  keuangan = [], dana = {}, profil = {}, media = null, namaTim = "",
} = {}) {
  const foto = media || bikinMedia();
  // Urut tanggal; tanggal sama → urutan kategori seperti tabel (Bahan → Sewa →
  // Transportasi → Lain-lain), lalu urutan data (sort stabil)
  const posKategori = (k) => {
    const i = KATEGORI_PKM.findIndex((x) => x.id === k);
    return i < 0 ? KATEGORI_PKM.length : i;
  };
  const urut = [...keuangan].sort((a, b) => {
    const x = String(a?.tanggal ?? "");
    const y = String(b?.tanggal ?? "");
    return x < y ? -1 : x > y ? 1 : posKategori(a?.kategori) - posKategori(b?.kategori);
  });
  const belmawa = urut.filter((e) => e.sumber === "belmawa");
  const pt = urut.filter((e) => e.sumber === "pt");
  const tanpaSumber = urut.filter((e) => e.sumber !== "belmawa" && e.sumber !== "pt");

  // Kode nota global: satu kode per gambar, Belmawa → Perguruan Tinggi → belum ditandai
  const kodeNota = new Map(); // entri → "08" | "04-07" | "-"
  let nomor = 0;
  const beriKode = (daftar) => {
    const nota = []; // { kode, key } urut untuk tabel dokumentasi
    for (const e of daftar) {
      const kode = [...new Set(buktiKeys(e))].filter((k) => foto.ada(k)).map((key) => {
        const k = String(++nomor).padStart(2, "0");
        nota.push({ kode: k, key });
        return k;
      });
      kodeNota.set(e, kode.length ? rentang(kode) : "-");
    }
    return nota;
  };
  const notaBelmawa = beriKode(belmawa);
  const notaPt = beriKode(pt);
  const notaTanpa = beriKode(tanpaSumber);

  const danaBelmawa = Number(dana?.belmawa) || 0;
  const danaPt = Number(dana?.pt) || 0;
  // Akun lama hanya punya "dana awal" tanpa rincian sumber
  const danaLama = danaBelmawa + danaPt > 0 ? 0 : Number(dana?.awal) || 0;
  const baris = [
    { label: "Belmawa", dana: danaBelmawa, pakai: totalBelanja(belmawa) },
    { label: "Perguruan Tinggi", dana: danaPt, pakai: totalBelanja(pt) },
  ];
  if (tanpaSumber.length || danaLama > 0) {
    baris.push({ label: "Belum ditandai", dana: danaLama, pakai: totalBelanja(tanpaSumber) });
  }
  const tahunData = Number(String(urut[0]?.tanggal ?? "").slice(0, 4));
  const tahun = Number(profil?.tahun) ||
    (tahunData >= 2000 && tahunData <= 2100 ? tahunData : new Date().getFullYear());

  const isi = [
    P("LAMPIRAN", { gaya: "Heading1", keepNext: true, jc: "center", b: true }),
    captionLampiran(". Penggunaan Dana"),
    tabelRingkas({
      judul: String(profil?.judul ?? "").trim(),
      skema: String(profil?.skema ?? "").trim() || "PKM",
      tahun,
      baris,
    }),
    P(kalimatKeterangan({ belmawa: notaBelmawa, pt: notaPt, tanpaSumber: notaTanpa }), {
      gaya: "Caption", jc: "both", b: true, before: 80,
    }),
    bagianSumber({
      judul: "Lampiran 1.1 Penggunaan Dana dari Belmawa",
      entri: belmawa, perKategori: true,
      kosong: "Belum ada penggunaan dana Belmawa yang dicatat.",
      labelTotal: "TOTAL DANA BELMAWA",
      labelDok: "Dokumentasi Nota Dana Belmawa", dokHalamanBaru: true,
      nota: notaBelmawa, media: foto, kodeNota,
    }),
    bagianSumber({
      judul: "Lampiran 1.2 Penggunaan Dana dari Perguruan Tinggi",
      entri: pt,
      kosong: "Belum ada penggunaan dana Perguruan Tinggi yang dicatat.",
      labelTotal: "TOTAL DANA PERGURUAN TINGGI",
      labelDok: "Dokumentasi Nota Dana Perguruan Tinggi",
      nota: notaPt, media: foto, kodeNota,
    }),
  ];
  if (tanpaSumber.length) {
    isi.push(bagianSumber({
      judul: "Lampiran 1.3 Penggunaan Dana yang Belum Ditandai Sumbernya",
      catatan: "Entri berikut belum ditandai sumber dananya di aplikasi. Tandai sebagai " +
        "Belmawa atau Perguruan Tinggi agar otomatis masuk ke Lampiran 1.1 atau 1.2.",
      entri: tanpaSumber,
      labelTotal: "TOTAL DANA BELUM DITANDAI",
      labelDok: "Dokumentasi Nota Dana Belum Ditandai",
      nota: notaTanpa, media: foto, kodeNota,
    }));
  }
  // Word mewajibkan dokumen diakhiri paragraf (bukan tabel)
  isi.push(P(""));

  return rakitDocx(isi.join(""), namaTim, foto);
}

/* ------------------------------------------------ perakitan paket docx ---- */
const SECT_PR =
  `<w:sectPr><w:headerReference w:type="default" r:id="rId3"/>` +
  `<w:pgSz w:w="11906" w:h="16838"/>` +
  `<w:pgMar w:top="1701" w:right="1701" w:bottom="1701" w:left="2268" ` +
  `w:header="720" w:footer="720" w:gutter="0"/>` +
  `<w:pgNumType w:start="1"/><w:cols w:space="720"/><w:docGrid w:linePitch="360"/></w:sectPr>`;

const STYLES_XML =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<w:styles xmlns:w="${NS_W}">` +
  `<w:docDefaults><w:rPrDefault><w:rPr>` +
  `<w:rFonts w:ascii="${FONT}" w:eastAsia="${FONT}" w:hAnsi="${FONT}" w:cs="${FONT}"/>` +
  `<w:sz w:val="24"/><w:szCs w:val="24"/><w:lang w:val="id-ID" w:eastAsia="en-US" w:bidi="ar-SA"/>` +
  `</w:rPr></w:rPrDefault>` +
  `<w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault>` +
  `</w:docDefaults>` +
  `<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>` +
  `<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/>` +
  `<w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:uiPriority w:val="9"/><w:qFormat/>` +
  `<w:pPr><w:keepNext/><w:keepLines/><w:outlineLvl w:val="0"/></w:pPr>` +
  `<w:rPr><w:b/><w:bCs/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr></w:style>` +
  `<w:style w:type="paragraph" w:styleId="Caption"><w:name w:val="caption"/>` +
  `<w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:uiPriority w:val="35"/>` +
  `<w:unhideWhenUsed/><w:qFormat/><w:rPr><w:b/><w:bCs/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr></w:style>` +
  `<w:style w:type="paragraph" w:styleId="Header"><w:name w:val="header"/>` +
  `<w:basedOn w:val="Normal"/><w:uiPriority w:val="99"/><w:unhideWhenUsed/>` +
  `<w:pPr><w:tabs><w:tab w:val="center" w:pos="3969"/><w:tab w:val="right" w:pos="7937"/></w:tabs>` +
  `<w:spacing w:line="240" w:lineRule="auto"/></w:pPr></w:style>` +
  `<w:style w:type="table" w:default="1" w:styleId="TableNormal"><w:name w:val="Normal Table"/>` +
  `<w:uiPriority w:val="99"/><w:semiHidden/><w:unhideWhenUsed/>` +
  `<w:tblPr><w:tblInd w:w="0" w:type="dxa"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/>` +
  `<w:left w:w="108" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="108" w:type="dxa"/>` +
  `</w:tblCellMar></w:tblPr></w:style>` +
  `<w:style w:type="table" w:styleId="TableGrid"><w:name w:val="Table Grid"/>` +
  `<w:basedOn w:val="TableNormal"/><w:uiPriority w:val="59"/>` +
  `<w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr>` +
  `<w:tblPr><w:tblBorders>${garis(4, "auto")}</w:tblBorders></w:tblPr></w:style>` +
  `</w:styles>`;

const SETTINGS_XML =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<w:settings xmlns:w="${NS_W}"><w:zoom w:percent="100"/>` +
  `<w:defaultTabStop w:val="720"/><w:characterSpacingControl w:val="doNotCompress"/>` +
  `<w:compat><w:compatSetting w:name="compatibilityMode" ` +
  `w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat>` +
  `<w:decimalSymbol w:val=","/><w:listSeparator w:val=";"/></w:settings>`;

/** Kepala halaman: nomor halaman (field PAGE) rata kanan. */
const HEADER_XML = (() => {
  const rp = rPr();
  const r = (x) => run(x, rp);
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:hdr xmlns:w="${NS_W}" xmlns:r="${NS_R}">` +
    `<w:p><w:pPr><w:pStyle w:val="Header"/><w:jc w:val="right"/>${rp}</w:pPr>` +
    r(`<w:fldChar w:fldCharType="begin"/>`) +
    r(`<w:instrText xml:space="preserve"> PAGE \\* MERGEFORMAT </w:instrText>`) +
    r(`<w:fldChar w:fldCharType="separate"/>`) +
    r(`<w:t>1</w:t>`) +
    r(`<w:fldChar w:fldCharType="end"/>`) +
    `</w:p></w:hdr>`;
})();

const CT_WORD = "application/vnd.openxmlformats-officedocument.wordprocessingml";
const CONTENT_TYPES =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
  `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
  `<Default Extension="xml" ContentType="application/xml"/>` +
  `<Override PartName="/word/document.xml" ContentType="${CT_WORD}.document.main+xml"/>` +
  `<Override PartName="/word/styles.xml" ContentType="${CT_WORD}.styles+xml"/>` +
  `<Override PartName="/word/settings.xml" ContentType="${CT_WORD}.settings+xml"/>` +
  `<Override PartName="/word/header1.xml" ContentType="${CT_WORD}.header+xml"/>` +
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

const REL_WORD = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const DOC_RELS =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
  `<Relationship Id="rId1" Type="${REL_WORD}/styles" Target="styles.xml"/>` +
  `<Relationship Id="rId2" Type="${REL_WORD}/settings" Target="settings.xml"/>` +
  `<Relationship Id="rId3" Type="${REL_WORD}/header" Target="header1.xml"/>` +
  `</Relationships>`;

/** Bungkus body XML menjadi paket .docx utuh (Buffer). */
async function rakitDocx(bodyXml, namaTim, media) {
  const zip = new JSZip();
  const judul = `Lampiran Penggunaan Dana${namaTim ? ` — Tim ${namaTim}` : ""}`;
  const iso = new Date().toISOString().replace(/\.\d+Z$/, "Z");

  // Gambar nota butuh <Default Extension="jpeg|png"> dan relationship sendiri
  zip.file("[Content_Types].xml", CONTENT_TYPES.replace("</Types>", `${media.ctypesXml}</Types>`));
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
  word.file("settings.xml", SETTINGS_XML);
  word.file("header1.xml", HEADER_XML);
  word.folder("_rels").file("document.xml.rels",
    DOC_RELS.replace("</Relationships>", `${media.relsXml}</Relationships>`));
  for (const m of media.berkasMedia) word.file(m.nama, m.buffer);
  word.file("document.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:document xmlns:w="${NS_W}" xmlns:r="${NS_R}">` +
    `<w:body>${bodyXml}${SECT_PR}</w:body></w:document>`);

  return zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
}
