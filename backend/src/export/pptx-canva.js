/**
 * Konversi PPTX ekspor Canva → PPTX "sama persis" & tetap bisa diedit.
 *
 * Masalah: PPTX hasil unduhan Canva tampil BEDA di PowerPoint karena font
 * Canva tidak ter-install di komputer pengguna (PowerPoint mengganti diam-diam
 * dengan font lain → tata letak bergeser).
 *
 * Solusi di modul ini:
 *  1. Pindai SEMUA nama font yang dipakai file (slide/master/layout/theme).
 *  2. Unduh berkas TTF-nya langsung dari Google Fonts (mayoritas font Canva
 *     adalah font Google) — tanpa API key: permintaan CSS tanpa User-Agent
 *     dibalas Google dengan URL format TrueType.
 *  3. TANAM font ke dalam PPTX (embeddedFontLst + bagian fntdata) sehingga
 *     tampil identik di komputer mana pun TANPA install font manual.
 *  4. Susun laporan: font tertanam / perlu diunduh manual, plus slide yang
 *     memuat gambar rasterisasi Canva (teks melengkung/efek khusus — tetap
 *     bisa digeser tapi tidak bisa diketik ulang; batasan dari Canva).
 *
 * Semua elemen, teks, dan grup TIDAK disentuh — tetap editable & terkelompok
 * persis seperti hasil ekspor Canva.
 */
import JSZip from "jszip";

/** Font bawaan Windows/Office — sudah pasti ada, tidak perlu ditanam. */
const FONT_SISTEM = new Set([
  "arial", "arial black", "calibri", "calibri light", "cambria", "cambria math",
  "candara", "comic sans ms", "consolas", "constantia", "corbel", "courier new",
  "ebrima", "franklin gothic", "gabriola", "gadugi", "georgia", "impact",
  "lucida console", "lucida sans unicode", "malgun gothic", "marlett",
  "microsoft sans serif", "mingliu", "ms gothic", "mv boli", "myanmar text",
  "palatino linotype", "segoe print", "segoe script", "segoe ui",
  "segoe ui light", "segoe ui semibold", "segoe ui symbol", "simsun",
  "sitka", "sylfaen", "symbol", "tahoma", "times new roman", "trebuchet ms",
  "verdana", "webdings", "wingdings", "yu gothic",
]);

const VARIAN = { regular: "regular", bold: "bold", italic: "italic", boldItalic: "boldItalic" };

/* ================= pemindaian ================= */

/** Kumpulkan semua nama font unik dari seluruh XML di dalam ppt/. */
async function pindaiFont(zip) {
  const nama = new Set();
  const berkas = Object.keys(zip.files).filter(
    (f) => f.startsWith("ppt/") && f.endsWith(".xml")
  );
  for (const f of berkas) {
    const xml = await zip.file(f).async("string");
    for (const m of xml.matchAll(/typeface="([^"]+)"/g)) {
      const t = m[1].trim();
      if (t && !t.startsWith("+")) nama.add(t);
    }
  }
  return [...nama].sort((a, b) => a.localeCompare(b));
}

/** Hitung gambar (p:pic) per slide → indikasi elemen rasterisasi Canva. */
async function pindaiRaster(zip) {
  const slides = Object.keys(zip.files)
    .filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f))
    .sort((a, b) => Number(a.match(/\d+/)) - Number(b.match(/\d+/)));
  const hasil = [];
  for (const f of slides) {
    const xml = await zip.file(f).async("string");
    const gambar = (xml.match(/<p:pic[ >]/g) || []).length;
    hasil.push({ slide: Number(f.match(/slide(\d+)\.xml/)[1]), gambar });
  }
  return hasil;
}

/* ================= Google Fonts ================= */

const TIMEOUT_MS = 15000;

async function ambil(url, opsi = {}) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...opsi, signal: ctl.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Ambil CSS Google Fonts untuk satu keluarga font.
 * Tanpa header User-Agent → Google membalas URL berformat TrueType (.ttf)
 * TANPA pemecahan unicode-range (satu berkas per gaya). Dicoba beberapa
 * kombinasi axis karena tidak semua font punya varian bold/italic.
 */
async function cssGoogle(family) {
  const fam = family.trim().replace(/ /g, "+");
  const kombinasi = [
    "ital,wght@0,400;0,700;1,400;1,700",
    "wght@400;700",
    "wght@400",
    null,
  ];
  for (const axis of kombinasi) {
    try {
      const url = `https://fonts.googleapis.com/css2?family=${fam}${axis ? ":" + axis : ""}`;
      const res = await ambil(url, { headers: { Accept: "text/css,*/*" } });
      if (res.ok) return await res.text();
    } catch { /* coba kombinasi berikutnya */ }
  }
  return "";
}

/**
 * Unduh varian TTF sebuah font dari Google Fonts.
 * @returns {Promise<{varian: Record<string,Buffer>}|null>} null bila tidak ada.
 */
async function unduhFontGoogle(family) {
  const css = await cssGoogle(family);
  if (!css) return null;
  const blok = css.match(/@font-face\s*\{[^}]*\}/g) || [];
  const varian = {};
  for (const b of blok) {
    const gaya = (b.match(/font-style:\s*(\w+)/) || [])[1] || "normal";
    const berat = Number((b.match(/font-weight:\s*(\d+)/) || [])[1] || 400);
    const url = (b.match(/src:\s*url\((https:[^)]+)\)/) || [])[1];
    if (!url) continue;
    const kunci =
      berat >= 600
        ? (gaya === "italic" ? VARIAN.boldItalic : VARIAN.bold)
        : (gaya === "italic" ? VARIAN.italic : VARIAN.regular);
    if (varian[kunci]) continue; // sudah ada (subset pertama cukup)
    try {
      const res = await ambil(url);
      if (!res.ok) continue;
      const buf = Buffer.from(await res.arrayBuffer());
      // TTF/OTF valid berawalan 00 01 00 00 (ttf) atau "OTTO" (otf)
      const ttf = buf.length > 4 &&
        ((buf[0] === 0 && buf[1] === 1 && buf[2] === 0 && buf[3] === 0) ||
         buf.toString("ascii", 0, 4) === "OTTO");
      if (ttf) varian[kunci] = buf;
    } catch { /* varian ini dilewati */ }
  }
  return varian[VARIAN.regular] ? { varian } : null;
}

/* ================= penanaman ke PPTX ================= */

const REL_FONT =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships/font";

function escXml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/**
 * Tanam kumpulan font ke arsip PPTX (mutasi zip di tempat).
 * @param {JSZip} zip
 * @param {Array<{nama:string, varian:Record<string,Buffer>}>} daftar
 */
async function tanamFont(zip, daftar) {
  if (!daftar.length) return;

  // ---- 1. [Content_Types].xml: daftarkan ekstensi fntdata ----
  const ctPath = "[Content_Types].xml";
  let ct = await zip.file(ctPath).async("string");
  if (!/Extension="fntdata"/.test(ct)) {
    ct = ct.replace(
      "</Types>",
      `<Default Extension="fntdata" ContentType="application/x-fontdata"/></Types>`
    );
    zip.file(ctPath, ct);
  }

  // ---- 2. Relationship + berkas fntdata ----
  const relPath = "ppt/_rels/presentation.xml.rels";
  let rels = await zip.file(relPath).async("string");
  let maxId = 0;
  for (const m of rels.matchAll(/Id="rId(\d+)"/g)) {
    maxId = Math.max(maxId, Number(m[1]));
  }
  let nomorBerkas = 1;
  while (zip.file(`ppt/fonts/font${nomorBerkas}.fntdata`)) nomorBerkas++;

  const entriLst = [];
  let relBaru = "";
  for (const f of daftar) {
    const idVarian = {};
    for (const [v, buf] of Object.entries(f.varian)) {
      const rId = `rId${++maxId}`;
      const nf = `font${nomorBerkas++}.fntdata`;
      zip.file(`ppt/fonts/${nf}`, buf);
      relBaru += `<Relationship Id="${rId}" Type="${REL_FONT}" Target="fonts/${nf}"/>`;
      idVarian[v] = rId;
    }
    let e = `<p:embeddedFont><p:font typeface="${escXml(f.nama)}"/>`;
    if (idVarian.regular)    e += `<p:regular r:id="${idVarian.regular}"/>`;
    if (idVarian.bold)       e += `<p:bold r:id="${idVarian.bold}"/>`;
    if (idVarian.italic)     e += `<p:italic r:id="${idVarian.italic}"/>`;
    if (idVarian.boldItalic) e += `<p:boldItalic r:id="${idVarian.boldItalic}"/>`;
    e += `</p:embeddedFont>`;
    entriLst.push(e);
  }
  rels = rels.replace("</Relationships>", `${relBaru}</Relationships>`);
  zip.file(relPath, rels);

  // ---- 3. presentation.xml: atribut + embeddedFontLst ----
  const presPath = "ppt/presentation.xml";
  let pres = await zip.file(presPath).async("string");
  if (!/embedTrueTypeFonts=/.test(pres)) {
    pres = pres.replace("<p:presentation ", `<p:presentation embedTrueTypeFonts="1" `);
  }
  const lst = entriLst.join("");
  if (/<p:embeddedFontLst>/.test(pres)) {
    pres = pres.replace("<p:embeddedFontLst>", `<p:embeddedFontLst>${lst}`);
  } else {
    const blok = `<p:embeddedFontLst>${lst}</p:embeddedFontLst>`;
    // Urutan skema CT_Presentation: …sldIdLst, sldSz?, notesSz, embeddedFontLst…
    if (/<p:notesSz[^>]*\/>/.test(pres)) {
      pres = pres.replace(/(<p:notesSz[^>]*\/>)/, `$1${blok}`);
    } else if (/<p:sldSz[^>]*\/>/.test(pres)) {
      pres = pres.replace(/(<p:sldSz[^>]*\/>)/, `$1${blok}`);
    } else {
      pres = pres.replace("</p:sldIdLst>", `</p:sldIdLst>${blok}`);
    }
  }
  zip.file(presPath, pres);
}

/* ================= API utama ================= */

/**
 * Proses PPTX ekspor Canva: pindai font → unduh dari Google Fonts → tanam.
 *
 * @param {Buffer} buffer  isi berkas .pptx
 * @returns {Promise<{buffer: Buffer, laporan: object}>}
 *   laporan = {
 *     totalSlide, fonts: [{ nama, status: 'tertanam'|'sistem'|'manual',
 *                           varian: string[], url }],
 *     raster: [{ slide, gambar }],   // slide yang memuat gambar/rasterisasi
 *     sudahTertanam: boolean,        // file sumber sudah punya font tertanam
 *   }
 */
export async function prosesPptxCanva(buffer) {
  const zip = await JSZip.loadAsync(buffer);
  if (!zip.file("ppt/presentation.xml")) {
    throw Object.assign(new Error("Berkas bukan PowerPoint (.pptx) yang valid"), { status: 400 });
  }

  const semuaFont = await pindaiFont(zip);
  const raster = await pindaiRaster(zip);
  const presXml = await zip.file("ppt/presentation.xml").async("string");
  const sudahTertanam = /<p:embeddedFontLst>/.test(presXml);

  const fonts = [];
  const untukDitanam = [];
  for (const nama of semuaFont) {
    if (FONT_SISTEM.has(nama.toLowerCase())) {
      fonts.push({ nama, status: "sistem", varian: [], url: "" });
      continue;
    }
    const hasil = await unduhFontGoogle(nama);
    if (hasil) {
      untukDitanam.push({ nama, varian: hasil.varian });
      fonts.push({ nama, status: "tertanam", varian: Object.keys(hasil.varian), url: "" });
    } else {
      fonts.push({
        nama, status: "manual", varian: [],
        url: `https://fonts.google.com/?query=${encodeURIComponent(nama)}`,
      });
    }
  }

  await tanamFont(zip, untukDitanam);

  const keluar = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });
  return {
    buffer: keluar,
    laporan: {
      totalSlide: raster.length,
      fonts,
      raster: raster.filter((r) => r.gambar > 0),
      sudahTertanam,
    },
  };
}

