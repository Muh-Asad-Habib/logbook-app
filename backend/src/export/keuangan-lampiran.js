/**
 * Penyusun DOCX "Khusus Keuangan" berformat lampiran laporan PKM
 * ("Lampiran 1. Penggunaan Dana").
 *
 * Modul ini MURNI — tidak menyentuh database maupun CDN — sehingga bisa diuji
 * dengan data contoh (tools/test-keuangan-lampiran.mjs). Pengambilan data tim
 * dan unduhan nota ada di keuangan-docx.js.
 *
 * Halaman 1 — REKAP DANA khusus tim (tidak perlu disalin): tampilan seperti
 *   kartu "Rekap dana PKM" di aplikasi (Calibri, kotak ikhtisar, kartu per
 *   sumber, bilah per kategori, daftar cek) plus kotak "SIAP DISALIN" yang
 *   menunjuk halaman awal lampiran lewat field PAGEREF. Section tersendiri
 *   (margin kiri-kanan 2 cm, atas-bawah 1,5 cm, tanpa nomor halaman); teks
 *   panjang dipendekkan agar rekap selalu muat satu halaman.
 *
 * Halaman 2 dst. — lampiran siap salin, meniru lampiran penggunaan dana PKM:
 *   LAMPIRAN                         ← bookmark tujuan PAGEREF di halaman rekap
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
 * Setiap run lampiran memakai format langsung (Times New Roman 12, hitam)
 * supaya tampilannya tetap sama ketika ditempel ke dokumen laporan tim.
 */
import JSZip from "jszip";
import { BATAS_DANA_PT, KATEGORI_PKM, rekapDana } from "./pkm.js";

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
    line = 276, ind = null, jc = "", b = false, runs = "", bookmark = "",
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
  return bookmark
    ? `<w:p>${pPr}<w:bookmarkStart w:id="0" w:name="${bookmark}"/>${isi}<w:bookmarkEnd w:id="0"/></w:p>`
    : `<w:p>${pPr}${isi}</w:p>`;
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

/* ------------------------------------------ halaman 1: rekap dana tim ---- */
const RF = "Calibri";
/** Palet kartu "Rekap dana PKM" di aplikasi (globals.css & ui-v3.css). */
const WR = {
  ink: "12142E", muted: "676E95", line: "E4E7F7", kartu: "F7F8FE",
  p1: "4F46E5", p1Muda: "C7D2FE", p1Pucat: "EEF2FF", p1Teks: "E0E7FF",
  teal: "0D9488", biru: "0284C7",
  ok: "059669", okBg: "ECFDF5", okGaris: "A7F3D0",
  bad: "DC2626", badBg: "FEF2F2", badGaris: "FECACA",
  amber: "F59E0B", amberTeks: "B45309", amberBg: "FEF3C7",
  putih: "FFFFFF",
};
const WARNA_KATEGORI = { bahan: "059669", sewa: "D97706", transport: "0284C7", lain: "DB2777" };
const LEBAR_REKAP = 9638; // lebar teks A4 dengan margin kiri-kanan 2 cm
const BOOKMARK_LAMPIRAN = "_RefLampiranDana";
const BULAN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

/** Dipendekkan dengan "…" (sebisanya di batas kata) — menjaga rekap tetap muat satu halaman. */
const potong = (s, n) => {
  const t = String(s ?? "").replace(/\s+/g, " ").trim();
  if (t.length <= n) return t;
  const iris = t.slice(0, n - 1);
  const spasi = iris.lastIndexOf(" ");
  return `${(spasi >= n * 0.7 ? iris.slice(0, spasi) : iris).trimEnd()}…`;
};

/** 24.68 → "24,7%". */
const persen = (x) => `${fmtAngka(Math.round((Number(x) || 0) * 10) / 10)}%`;

/** Nominal ringkas seperti aplikasi: 6500000 → "Rp6,5 jt"; selain kelipatan 100 rb → lengkap. */
const fmtNominal = (n) => {
  const v = Number(n) || 0;
  if (Math.abs(v) < 1_000_000 || v % 100_000 !== 0) return fmtRp(v);
  return `Rp${String(v / 1_000_000).replace(".", ",")} jt`;
};

/** Rentang tanggal belanja: "3 Jun – 13 Agu 2026" (tahun beda → keduanya bertahun). */
export function periodeBelanja(entri = []) {
  const tgl = entri
    .map((e) => /^(\d{4})-(\d{2})-(\d{2})/.exec(String(e?.tanggal ?? "")))
    .filter((m) => m && BULAN[Number(m[2]) - 1])
    .map((m) => ({ iso: m[0], d: Number(m[3]), b: BULAN[Number(m[2]) - 1], y: m[1] }))
    .sort((a, b) => (a.iso < b.iso ? -1 : a.iso > b.iso ? 1 : 0));
  if (!tgl.length) return "belum ada belanja";
  const a = tgl[0];
  const z = tgl[tgl.length - 1];
  const teks = (x, tahun = true) => `${x.d} ${x.b}${tahun ? ` ${x.y}` : ""}`;
  return a.iso === z.iso ? teks(a) : `${teks(a, a.y !== z.y)} – ${teks(z)}`;
}

/** rPr Calibri halaman rekap; `sz` dalam pt, `spasi` = renggang huruf (twips). */
const rpRekap = ({ sz = 10, b = false, i = false, warna = WR.ink, spasi = 0 } = {}) => {
  const hp = Math.round(sz * 2);
  return `<w:rPr><w:rFonts w:ascii="${RF}" w:eastAsia="${RF}" w:hAnsi="${RF}" w:cs="${RF}"/>` +
    (b ? "<w:b/><w:bCs/>" : "") + (i ? "<w:i/><w:iCs/>" : "") +
    `<w:color w:val="${warna}"/>` + (spasi ? `<w:spacing w:val="${spasi}"/>` : "") +
    `<w:sz w:val="${hp}"/><w:szCs w:val="${hp}"/></w:rPr>`;
};

const rt = (teks, o) => run(isiTeks(teks), rpRekap(o));

/**
 * Paragraf halaman rekap. Tanda paragrafnya ikut Calibri `sz` agar tinggi
 * baris tidak membesar mengikuti Times New Roman 12 bawaan dokumen.
 */
function pr(isi, o = {}) {
  const {
    sz = 10, before = 0, after = 0, line = 240, jc = "", keepNext = false,
    tabKanan = 0, garisAtas = "", sectPr = "",
  } = o;
  return `<w:p><w:pPr>` +
    (keepNext ? "<w:keepNext/>" : "") +
    (garisAtas ? `<w:pBdr><w:top ${garisAtas}/></w:pBdr>` : "") +
    (tabKanan ? `<w:tabs><w:tab w:val="right" w:pos="${tabKanan}"/></w:tabs>` : "") +
    `<w:spacing w:before="${before}" w:after="${after}" w:line="${line}" w:lineRule="auto"/>` +
    (jc ? `<w:jc w:val="${jc}"/>` : "") +
    `${rpRekap({ sz })}${sectPr}</w:pPr>${isi}</w:p>`;
}

/** Paragraf kosong setinggi `pt` — pemisah blok (dua tabel tak boleh berdempetan). */
const jarak = (pt) =>
  `<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="${Math.round(pt * 20)}" w:lineRule="exact"/>` +
  `<w:rPr><w:sz w:val="2"/><w:szCs w:val="2"/></w:rPr></w:pPr></w:p>`;

/** Atribut garis; `sz` dalam 1/8 pt. */
const gr = (sz, warna, val = "single", space = 0) =>
  `w:val="${val}" w:sz="${sz}" w:space="${space}" w:color="${warna}"`;
const TANPA_GARIS = `w:val="nil"`;
const marXml = ([t, r, b, l]) =>
  `<w:top w:w="${t}" w:type="dxa"/><w:left w:w="${l}" w:type="dxa"/>` +
  `<w:bottom w:w="${b}" w:type="dxa"/><w:right w:w="${r}" w:type="dxa"/>`;
const keliling = (g) => ({ top: g, left: g, bottom: g, right: g });

/** Sel tabel rekap; `garis` = {top,left,bottom,right}, `mar` = [atas, kanan, bawah, kiri]. */
function tcR(isi, { w, fill = "", garis = null, mar = null, v = "top" } = {}) {
  const sisi = garis ? ["top", "left", "bottom", "right"].filter((s) => garis[s]) : [];
  return `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/>` +
    (sisi.length ? `<w:tcBorders>${sisi.map((s) => `<w:${s} ${garis[s]}/>`).join("")}</w:tcBorders>` : "") +
    (fill ? `<w:shd w:val="clear" w:color="auto" w:fill="${fill}"/>` : "") +
    (mar ? `<w:tcMar>${marXml(mar)}</w:tcMar>` : "") +
    `<w:vAlign w:val="${v}"/></w:tcPr>${isi}</w:tc>`;
}

const trR = (sel, tinggi = 0, aturan = "atLeast") =>
  `<w:tr><w:trPr><w:cantSplit/>` +
  (tinggi ? `<w:trHeight w:val="${tinggi}" w:hRule="${aturan}"/>` : "") +
  `</w:trPr>${sel.join("")}</w:tr>`;

/** Tabel tata letak rekap: kolom tetap, tanpa garis bawaan (garis per sel). */
function tblR(grid, baris, { mar = [0, 0, 0, 0], garisDalamH = "" } = {}) {
  const g = ["top", "left", "bottom", "right", "insideH", "insideV"]
    .map((s) => `<w:${s} ${s === "insideH" && garisDalamH ? garisDalamH : TANPA_GARIS}/>`).join("");
  return `<w:tbl><w:tblPr><w:tblW w:w="${lebarTotal(grid)}" w:type="dxa"/>` +
    `<w:tblBorders>${g}</w:tblBorders><w:tblLayout w:type="fixed"/>` +
    `<w:tblCellMar>${marXml(mar)}</w:tblCellMar></w:tblPr>` +
    `<w:tblGrid>${grid.map((x) => `<w:gridCol w:w="${x}"/>`).join("")}</w:tblGrid>` +
    `${baris.join("")}</w:tbl>`;
}

/** Lebar [berwarna, jalur] bilah (twips); 0 < pct < 100 → keduanya selalu tampak. */
export function lebarBilah(pct, lebar) {
  const p = Math.max(0, Math.min(100, Number(pct) || 0));
  if (p <= 0) return [0, lebar];
  if (p >= 100) return [lebar, 0];
  const isi = Math.min(lebar - 90, Math.max(90, Math.round((lebar * p) / 100)));
  return [isi, lebar - isi];
}

/** Bilah kemajuan seperti .rekap-bar aplikasi: tabel bersarang 1 baris setinggi 6 pt. */
function bilah(pct, warna, lebar) {
  const bagian = lebarBilah(pct, lebar).map((w, i) => [w, i ? WR.line : warna]).filter(([w]) => w > 0);
  return tblR(bagian.map(([w]) => w),
    [trR(bagian.map(([w, fill]) => tcR(jarak(1), { w, fill })), 120, "exact")]);
}

/** Judul kecil antarbagian ("IKHTISAR DANA"); `kanan` dicetak rata kanan. */
const labelBagian = (teks, kanan = "") => pr(
  rt(teks, { sz: 8.5, b: true, warna: WR.p1, spasi: 16 }) +
  (kanan ? run("<w:tab/>", rpRekap({ sz: 8.5 })) + rt(kanan, { sz: 8.5, warna: WR.muted }) : ""),
  { sz: 8.5, before: 150, after: 60, keepNext: true, tabKanan: kanan ? LEBAR_REKAP : 0 });

const capKecil = (teks) => rt(teks, { sz: 7.5, b: true, warna: WR.muted, spasi: 16 });

/** Pita judul berwarna (satu sel): nama tim, judul rekap + skema, subjudul + tahun. */
function bannerRekap({ namaTim, skema, tahun }) {
  const lebarIsi = LEBAR_REKAP - 600;
  const tab = (sz) => run("<w:tab/>", rpRekap({ sz }));
  const atas = `LOGBOOK PKM${namaTim ? ` · TIM ${potong(namaTim, 40).toUpperCase()}` : ""}`;
  const isi =
    pr(rt(atas, { sz: 8.5, b: true, warna: WR.p1Muda, spasi: 20 }), { sz: 8.5, after: 30 }) +
    pr(rt("Rekap Dana PKM", { sz: 24, b: true, warna: WR.putih }) + tab(24) +
      rt(potong(skema, 20), { sz: 16, b: true, warna: WR.putih }), { sz: 24, after: 10, tabKanan: lebarIsi }) +
    pr(rt("Pemakaian dana per sumber & kategori — pedoman PKM 2026", { sz: 10, warna: WR.p1Teks }) + tab(10) +
      rt(`Tahun ${tahun}`, { sz: 10, b: true, warna: WR.p1Muda }), { sz: 10, tabKanan: lebarIsi });
  return tblR([LEBAR_REKAP], [trR([tcR(isi, { w: LEBAR_REKAP, fill: WR.p1, mar: [200, 300, 210, 300] })])]);
}

/** Judul PKM + periode belanja. */
function infoRekap({ judul, periode, nEntri, nNota }) {
  const K = [6538, 3100];
  const cap = (t) => pr(capKecil(t), { sz: 7.5, after: 30 });
  const kiri = cap("JUDUL PKM") + (judul
    ? pr(rt(potong(judul, 170), { sz: 9.5, b: true }), { sz: 9.5, line: 250 })
    : pr(rt("Belum diisi — lengkapi Profil PKM di aplikasi.", { sz: 9.5, i: true, warna: WR.muted }), { sz: 9.5 }));
  const kanan = cap("PERIODE BELANJA") +
    pr(rt(periode, { sz: 10, b: true }), { sz: 10, after: 20 }) +
    pr(rt(`${nEntri} entri · ${nNota} nota terlampir`, { sz: 8.5, warna: WR.muted }), { sz: 8.5 });
  const g = gr(6, WR.line);
  return tblR(K, [trR([
    tcR(kiri, { w: K[0], mar: [130, 240, 130, 0], garis: { bottom: g } }),
    tcR(kanan, { w: K[1], mar: [130, 0, 130, 240], garis: { left: g, bottom: g } }),
  ])]);
}

/** Kotak "SIAP DISALIN": halaman awal lampiran = field PAGEREF (hasil tersimpan "2"). */
function kotakSiapSalin() {
  const rpNo = rpRekap({ sz: 13, b: true, warna: WR.p1 });
  const halaman = run(`<w:fldChar w:fldCharType="begin"/>`, rpNo) +
    run(`<w:instrText xml:space="preserve"> PAGEREF ${BOOKMARK_LAMPIRAN} \\h </w:instrText>`, rpNo) +
    run(`<w:fldChar w:fldCharType="separate"/>`, rpNo) +
    run(`<w:t>2</w:t>`, rpNo) +
    run(`<w:fldChar w:fldCharType="end"/>`, rpNo);
  const isi =
    pr(rt("SIAP DISALIN KE LAPORAN", { sz: 8.5, b: true, warna: WR.p1, spasi: 20 }), { sz: 8.5, after: 40 }) +
    pr(rt("Halaman ", { sz: 13, b: true }) + halaman + rt(" sampai akhir dokumen", { sz: 13, b: true }) +
      rt("  ·  Lampiran 1. Penggunaan Dana", { sz: 10, b: true, warna: WR.muted }), { sz: 13, after: 50 }) +
    pr(rt("Mulai judul “LAMPIRAN” sudah berformat lampiran laporan PKM (Times New Roman 12, tabel per " +
      "sumber & kategori, nota ber-kode). Salin utuh ke laporan; halaman rekap ini tidak perlu disalin.", { sz: 9.5 }),
    { sz: 9.5, line: 252 });
  return tblR([LEBAR_REKAP], [trR([tcR(isi, {
    w: LEBAR_REKAP, fill: WR.p1Pucat, mar: [140, 240, 150, 260], garis: { left: gr(36, WR.p1) },
  })])]);
}

/** Ikhtisar: total diterima − total terpakai = sisa (angka sama dengan SUB TOTAL lampiran). */
function ikhtisarRekap({ dana, pakai, rincianDana }) {
  const K = [3046, 250, 3046, 250, 3046];
  const sisa = dana - pakai;
  const pct = dana > 0 ? Math.round((pakai / dana) * 100) : null;
  const kotak = (w, cap, nilai, warna, ket, fill = WR.kartu, garis = WR.line) => tcR(
    pr(capKecil(cap), { sz: 7.5, after: 40 }) +
    pr(rt(nilai, { sz: 16, b: true, warna }), { sz: 16, after: 20 }) +
    pr(rt(ket, { sz: 8, warna: WR.muted }), { sz: 8 }),
    { w, fill, mar: [120, 160, 120, 160], garis: keliling(gr(6, garis)) });
  const op = (t) => tcR(pr(rt(t, { sz: 15, b: true, warna: WR.muted }), { sz: 15, jc: "center" }),
    { w: K[1], v: "center" });
  return tblR(K, [trR([
    kotak(K[0], "TOTAL DANA DITERIMA", fmtRp(dana), WR.ink, rincianDana),
    op("−"),
    kotak(K[2], "TOTAL TERPAKAI", fmtRp(pakai), WR.biru,
      pct === null ? "nominal dana belum diisi" : `${pct}% dari dana diterima`),
    op("="),
    sisa < 0
      ? kotak(K[4], "SISA BELUM TERPAKAI", fmtRp(sisa), WR.bad, "melebihi dana yang diterima", WR.badBg, WR.badGaris)
      : kotak(K[4], "SISA BELUM TERPAKAI", fmtRp(sisa), WR.ok, "siap dibelanjakan", WR.okBg, WR.okGaris),
  ])]);
}

/** Satu kartu sumber dana (isi sel) seperti .rekap-box aplikasi. */
function kartuSumber({ w, cap, kanan, nilai, warna, ket, pct, kaki, peringatan = "" }) {
  const dalam = w - 400;
  return tcR(
    pr(capKecil(cap) +
      (kanan ? run("<w:tab/>", rpRekap({ sz: 7.5 })) + rt(kanan, { sz: 8, b: true, warna }) : ""),
    { sz: 7.5, after: 40, tabKanan: kanan ? dalam : 0 }) +
    pr(rt(nilai, { sz: 17, b: true, warna }), { sz: 17, after: 20 }) +
    pr(ket, { sz: 8.5, after: 90 }) +
    bilah(pct, warna, dalam) +
    pr(rt(kaki, { sz: 8, warna: WR.muted }), { sz: 8, before: 80 }) +
    (peringatan ? pr(rt(peringatan, { sz: 8, b: true, warna: WR.bad }), { sz: 8, before: 30 }) : ""),
    {
      w, fill: WR.kartu, mar: [140, 200, 150, 200],
      garis: { top: gr(24, warna), left: gr(6, WR.line), bottom: gr(6, WR.line), right: gr(6, WR.line) },
    });
}

/** Kartu Dana Belmawa & Dana Perguruan Tinggi berdampingan. */
function sumberRekap(r, { nBelmawa, nPt, notaBelmawa, notaPt }) {
  const K = [4719, 200, 4719];
  const ketO = { sz: 8.5, warna: WR.muted };
  const ket = (danaX, sisa, kosong) => (danaX > 0
    ? rt(`dari ${fmtNominal(danaX)} · sisa `, ketO) +
      rt(fmtRp(sisa), { ...ketO, b: true, warna: sisa < 0 ? WR.bad : WR.ink })
    : rt(kosong, ketO));
  const kaki = (n, nota) => (n
    ? `${n} entri · ${nota.length ? `Nota ${rentang(nota.map((x) => x.kode))}` : "tanpa nota"}`
    : "belum ada belanja");
  const pctBel = r.danaBelmawa > 0 ? (r.totalBelmawa / r.danaBelmawa) * 100 : 0;
  const pctPt = (r.totalPt / (r.danaPt > 0 ? r.danaPt : BATAS_DANA_PT)) * 100;
  const warnaPt = r.ptLewatBatas ? WR.bad : WR.teal;
  return tblR(K, [trR([
    kartuSumber({
      w: K[0], cap: "DANA BELMAWA", kanan: r.danaBelmawa > 0 ? `${persen(pctBel)} terpakai` : "",
      nilai: fmtRp(r.totalBelmawa), warna: WR.p1, pct: pctBel,
      ket: ket(r.danaBelmawa, r.sisaBelmawa, "nominal dana belum diisi"),
      kaki: kaki(nBelmawa, notaBelmawa),
    }),
    tcR(jarak(1), { w: K[1] }),
    kartuSumber({
      w: K[2], cap: "DANA PERGURUAN TINGGI", kanan: r.danaPt > 0 ? `${persen(pctPt)} terpakai` : "",
      nilai: fmtRp(r.totalPt), warna: warnaPt, pct: pctPt,
      ket: ket(r.danaPt, r.sisaPt, `batas umum ${fmtNominal(BATAS_DANA_PT)}`),
      kaki: kaki(nPt, notaPt),
      peringatan: r.ptLewatBatas ? `Melebihi batas dana PT ${fmtRp(BATAS_DANA_PT)}` : "",
    }),
  ])]);
}

/** Baris per kategori Belmawa: label + batas, bilah terhadap batas, nominal + % dana. */
function kategoriRekap(r) {
  const K = [3338, 3800, 2500];
  const ada = r.danaBelmawa > 0;
  return tblR(K, r.kategori.map((k, i) => {
    const garis = i < r.kategori.length - 1 ? { bottom: gr(6, WR.line, "dashed") } : null;
    const pctBatas = k.batas > 0 ? (k.terpakai / k.batas) * 100 : 0;
    const warna = k.lewat ? WR.bad : pctBatas >= 85 ? WR.amber : WR.p1;
    const label =
      pr(rt("● ", { sz: 10, warna: WARNA_KATEGORI[k.id] || WR.muted }) + rt(k.label, { sz: 10, b: true }),
        { sz: 10, after: 10 }) +
      pr(rt(ada ? `maks ${k.maks}% · batas ${fmtRp(k.batas)}` : `maks ${k.maks}% dana Belmawa`,
        { sz: 8, warna: WR.muted }), { sz: 8 });
    const keterangan = !ada ? "isi nominal dana Belmawa untuk menghitung"
      : k.lewat ? `melewati batas — ${persen(pctBatas)} dari batas` : `${persen(pctBatas)} dari batas`;
    const tengah = bilah(pctBatas, warna, K[1] - 240) +
      pr(rt(keterangan, { sz: 7.5, b: k.lewat, warna: k.lewat ? WR.bad : WR.muted }), { sz: 7.5, before: 50 });
    const nilai =
      pr(rt(fmtRp(k.terpakai), { sz: 10.5, b: true, warna: k.lewat ? WR.bad : WR.ink }),
        { sz: 10.5, jc: "right", after: 10 }) +
      pr(rt(ada ? `${persen(k.pct)} dana Belmawa` : "–", { sz: 8, warna: WR.muted }), { sz: 8, jc: "right" });
    return trR([
      tcR(label, { w: K[0], mar: [70, 120, 70, 0], garis, v: "center" }),
      tcR(tengah, { w: K[1], mar: [70, 120, 70, 120], garis, v: "center" }),
      tcR(nilai, { w: K[2], mar: [70, 0, 70, 120], garis, v: "center" }),
    ]);
  }));
}

/**
 * Daftar cek sebelum lampiran disalin — selalu 6 butir (tinggi rekap tetap).
 * @returns {{ok: boolean, teks: string}[]}
 */
export function butirCek({ r, profil = {}, danaLama = 0, nBelmawa = 0, nPt = 0, nEntri = 0, nTanpaNota = 0, nNota = 0 }) {
  const butir = [];
  const kurang = [["judul", profil?.judul], ["skema", profil?.skema], ["tahun", profil?.tahun]]
    .filter(([, v]) => !String(v ?? "").trim()).map(([k]) => k);
  butir.push(kurang.length
    ? { ok: false, teks: `Profil PKM belum lengkap (${gabungKalimat(kurang)} kosong) — lengkapi di menu Profil.` }
    : { ok: true, teks: "Profil PKM lengkap — judul, skema, dan tahun tercetak di tabel ringkas." });

  if (r.danaBelmawa <= 0 && r.danaPt <= 0) {
    butir.push({
      ok: false,
      teks: danaLama > 0
        ? `Dana awal ${fmtRp(danaLama)} belum dirinci per sumber — isi dana Belmawa & PT di Dashboard.`
        : "Nominal dana Belmawa & Perguruan Tinggi belum diisi — isi di Dashboard agar kolom Sisa benar.",
    });
  } else if (r.danaBelmawa <= 0) {
    butir.push({ ok: false, teks: "Nominal dana Belmawa belum diisi — isi di Dashboard agar persentase kategori terhitung." });
  } else if (r.danaPt <= 0 && nPt > 0) {
    butir.push({ ok: false, teks: "Ada belanja Perguruan Tinggi, tetapi nominal dana PT belum diisi — isi di Dashboard." });
  } else {
    butir.push({ ok: true, teks: `Nominal dana terisi — Belmawa ${fmtRp(r.danaBelmawa)}, Perguruan Tinggi ${fmtRp(r.danaPt)}.` });
  }

  butir.push(r.nTanpaSumber
    ? { ok: false, teks: `${r.nTanpaSumber} entri (${fmtRp(r.totalTanpaSumber)}) belum ditandai sumber dananya — tercetak terpisah di Lampiran 1.3.` }
    : { ok: true, teks: "Semua entri sudah ditandai sumber dananya (Belmawa atau Perguruan Tinggi)." });

  butir.push(r.nBelmawaTanpaKategori
    ? { ok: false, teks: `${r.nBelmawaTanpaKategori} entri Belmawa (${fmtRp(r.totalBelmawaTanpaKategori)}) belum berkategori — tercetak di tabel “Belum Berkategori”.` }
    : { ok: true, teks: nBelmawa ? "Semua belanja dana Belmawa sudah berkategori." : "Belum ada belanja dana Belmawa yang perlu dikategorikan." });

  if (!nEntri) {
    butir.push({ ok: false, teks: "Belum ada belanja yang dicatat di menu Keuangan." });
  } else if (nTanpaNota) {
    butir.push({ ok: false, teks: `${nTanpaNota} entri belum punya nota terlampir (Kode Nota “-”) — unggah fotonya di menu Keuangan bila ada.` });
  } else {
    butir.push({ ok: true, teks: `Setiap entri punya nota — ${nNota} nota tercetak di tabel Dokumentasi Nota.` });
  }

  const lewat = r.danaBelmawa > 0 ? r.kategori.filter((k) => k.lewat).map((k) => `${k.label} (maks ${k.maks}%)`) : [];
  if (r.ptLewatBatas) lewat.push(`dana PT (maks ${fmtRp(BATAS_DANA_PT)})`);
  if (lewat.length) butir.push({ ok: false, teks: `Melewati batas pedoman PKM 2026: ${gabungKalimat(lewat)}.` });
  else if (r.danaBelmawa > 0) butir.push({ ok: true, teks: "Semua kategori Belmawa & dana PT masih dalam batas pedoman PKM 2026." });
  else butir.push({ ok: false, teks: "Batas kategori belum bisa dicek — nominal dana Belmawa masih kosong." });
  return butir;
}

/** Tabel daftar cek: chip OK/CEK + teks; garis putih memberi celah antarchip. */
function daftarCek(butir) {
  const K = [700, 8938];
  return tblR(K, butir.map((x) => trR([
    tcR(pr(rt(x.ok ? "OK" : "CEK", { sz: 7.5, b: true, warna: x.ok ? WR.ok : WR.amberTeks, spasi: 10 }),
      { sz: 7.5, jc: "center" }), { w: K[0], fill: x.ok ? WR.okBg : WR.amberBg, mar: [40, 0, 40, 0], v: "center" }),
    tcR(pr(rt(x.teks, { sz: 9.5 }), { sz: 9.5 }), { w: K[1], mar: [40, 0, 40, 180], v: "center" }),
  ])), { garisDalamH: gr(24, WR.putih) });
}

/** Section halaman rekap: A4, margin kiri-kanan 2 cm & atas-bawah 1,5 cm, tanpa kepala halaman, nomor mulai 1. */
const SECT_PR_REKAP =
  `<w:sectPr><w:pgSz w:w="11906" w:h="16838"/>` +
  `<w:pgMar w:top="850" w:right="1134" w:bottom="850" w:left="1134" ` +
  `w:header="567" w:footer="567" w:gutter="0"/>` +
  `<w:pgNumType w:start="1"/><w:cols w:space="720"/><w:docGrid w:linePitch="360"/></w:sectPr>`;

/**
 * Halaman 1: rekap dana untuk tim, diakhiri pemisah section (lampiran mulai
 * di halaman baru). Angkanya dihitung dari entri yang sama dengan lampiran.
 */
function halamanRekap(o) {
  const { urut, nota, kodeNota, dana, profil, namaTim, skema, tahun, nBelmawa, nPt } = o;
  const r = rekapDana(urut, { belmawa: dana.belmawa, pt: dana.pt });
  const nNota = nota.belmawa.length + nota.pt.length + nota.tanpaSumber.length;
  const totalDana = dana.belmawa + dana.pt + dana.lama;
  const butir = butirCek({
    r, profil, danaLama: dana.lama, nBelmawa, nPt, nEntri: urut.length, nNota,
    nTanpaNota: urut.filter((e) => kodeNota.get(e) === "-").length,
  });
  return [
    bannerRekap({ namaTim, skema, tahun }),
    jarak(4),
    infoRekap({
      judul: String(profil?.judul ?? "").trim(), periode: periodeBelanja(urut), nEntri: urut.length, nNota,
    }),
    jarak(12),
    kotakSiapSalin(),
    labelBagian("IKHTISAR DANA"),
    ikhtisarRekap({
      dana: totalDana,
      pakai: totalBelanja(urut),
      rincianDana: dana.lama > 0
        ? "dana awal — belum dirinci per sumber"
        : `Belmawa ${fmtNominal(dana.belmawa)} · PT ${fmtNominal(dana.pt)}`,
    }),
    labelBagian("PER SUMBER DANA"),
    sumberRekap(r, { nBelmawa, nPt, notaBelmawa: nota.belmawa, notaPt: nota.pt }),
    labelBagian("KATEGORI BELANJA DANA BELMAWA",
      r.danaBelmawa > 0 ? `persen dari dana Belmawa ${fmtNominal(r.danaBelmawa)}` : "batas pedoman PKM 2026"),
    kategoriRekap(r),
    labelBagian("CEK SEBELUM DISALIN"),
    daftarCek(butir),
    pr(rt("Angka di halaman ini memakai data yang sama dengan Lampiran 1 — total terpakai = SUB TOTAL " +
      "tabel ringkas, termasuk entri yang belum ditandai sumbernya. Ubah penandaan sumber/kategori atau " +
      "unggah nota di menu Keuangan aplikasi, lalu ekspor ulang.", { sz: 8, i: true, warna: WR.muted }),
    { sz: 8, before: 120, line: 252, garisAtas: gr(6, WR.line, "single", 6), sectPr: SECT_PR_REKAP }),
  ].join("");
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
  const skema = String(profil?.skema ?? "").trim() || "PKM";

  const isi = [
    halamanRekap({
      urut, kodeNota, profil, namaTim, skema, tahun,
      nota: { belmawa: notaBelmawa, pt: notaPt, tanpaSumber: notaTanpa },
      dana: { belmawa: danaBelmawa, pt: danaPt, lama: danaLama },
      nBelmawa: belmawa.length, nPt: pt.length,
    }),
    P("LAMPIRAN", { gaya: "Heading1", keepNext: true, jc: "center", b: true, bookmark: BOOKMARK_LAMPIRAN }),
    captionLampiran(". Penggunaan Dana"),
    tabelRingkas({
      judul: String(profil?.judul ?? "").trim(),
      skema,
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
// Section lampiran: mulai di halaman baru dan nomor halamannya melanjutkan
// halaman rekap, jadi judul "LAMPIRAN" selalu berada di halaman 2.
const SECT_PR =
  `<w:sectPr><w:headerReference w:type="default" r:id="rId3"/>` +
  `<w:type w:val="nextPage"/><w:pgSz w:w="11906" w:h="16838"/>` +
  `<w:pgMar w:top="1701" w:right="1701" w:bottom="1701" w:left="2268" ` +
  `w:header="720" w:footer="720" w:gutter="0"/>` +
  `<w:cols w:space="720"/><w:docGrid w:linePitch="360"/></w:sectPr>`;

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
