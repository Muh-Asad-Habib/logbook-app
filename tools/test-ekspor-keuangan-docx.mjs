/**
 * Uji ekspor DOCX KHUSUS KEUANGAN memakai data NYATA di database (hanya baca).
 *
 * Halaman 1 = rekap dana tim (section sendiri, tanpa nomor halaman) yang
 * angkanya harus sama dengan lampiran dan menunjuk halaman awal lampiran
 * (field PAGEREF → bookmark pada judul "LAMPIRAN").
 *
 * Halaman 2 dst. = format lampiran laporan PKM ("Lampiran 1. Penggunaan Dana"):
 * paket .docx valid (zip + part wajib + nomor halaman), tabel ringkas yang
 * cocok dengan dana & profil PKM tim, kalimat keterangan kode nota,
 * Lampiran 1.1 Belmawa (satu tabel per kategori yang berisi), 1.2 Perguruan
 * Tinggi, 1.3 hanya bila ada entri tanpa sumber, SUB TOTAL & TOTAL DANA, serta
 * dokumentasi nota ber-kode urut (01, 02, …) dengan tiap berkas gambar hanya
 * disimpan sekali di dalam paket.
 *
 * Pakai: node tools/test-ekspor-keuangan-docx.mjs ["Nama Akun"]
 * Hasil ditulis ke tools/hasil-uji-keuangan.docx (diabaikan git).
 */
import fs from "node:fs";
import path from "node:path";
import JSZip from "jszip";
import { q } from "../backend/src/db.js";
import * as store from "../backend/src/storage.js";
import { buildDocxKeuangan } from "../backend/src/export/keuangan-docx.js";
import { fmtAngka, fmtRp } from "../backend/src/export/keuangan-lampiran.js";
import { KATEGORI_PKM } from "../backend/src/export/pkm.js";
import { KUNCI_PROFIL_PKM, bacaProfilPkm } from "../backend/src/ai/pengetahuan-pkm.js";

let gagal = 0;
const cek = (nama, kondisi, detail = "") => {
  console.log(`${kondisi ? "[ok]  " : "[GAGAL]"} ${nama}${detail ? ` — ${detail}` : ""}`);
  if (!kondisi) gagal += 1;
};

const nama = process.argv[2] || "";
const rows = nama
  ? await q("SELECT id, username FROM users WHERE username_lower = $1", [nama.toLowerCase()])
  : await q("SELECT id, username FROM users WHERE role = 'tim' ORDER BY created_at LIMIT 1");
if (!rows.length) {
  console.error("Akun tidak ditemukan:", nama || "(tim pertama)");
  process.exit(1);
}
const u = rows[0];

const [keuangan, dana, profilMentah] = await Promise.all([
  store.listKeuangan(u.id),
  store.hitungDana(u.id),
  store.getSetting(u.id, KUNCI_PROFIL_PKM, ""),
]);
const profil = bacaProfilPkm(profilMentah);
const jumlahkan = (xs) => xs.reduce((s, e) => s + (Number(e.total) || 0), 0);
const bel = keuangan.filter((e) => e.sumber === "belmawa");
const pt = keuangan.filter((e) => e.sumber === "pt");
const tanpa = keuangan.filter((e) => e.sumber !== "belmawa" && e.sumber !== "pt");
const danaBel = Number(dana.belmawa) || 0;
const danaPt = Number(dana.pt) || 0;
const danaLama = danaBel + danaPt > 0 ? 0 : Number(dana.awal) || 0;

console.log(`Akun uji : ${u.username}`);
console.log(`Profil   : ${profil.skema || "(skema kosong)"} · ${profil.tahun || "(tahun kosong)"} · ${profil.judul || "(judul kosong)"}`);
console.log(`Dana     : Belmawa ${danaBel} · PT ${danaPt} · awal ${dana.awal} · total ${dana.total}`);
console.log(`Belanja  : ${keuangan.length} entri · Belmawa ${jumlahkan(bel)} · PT ${jumlahkan(pt)}`
  + ` · belum ditandai ${tanpa.length}\n`);

const t0 = Date.now();
const buf = await buildDocxKeuangan(u.id, u.username);
const out = path.join(process.cwd(), "tools", "hasil-uji-keuangan.docx");
fs.writeFileSync(out, buf);
console.log(`DOCX : ${(buf.length / 1024).toFixed(0)} KB (${((Date.now() - t0) / 1000).toFixed(1)} dtk) → ${out}\n`);

/* ---------- paket & XML ---------- */
const zip = await JSZip.loadAsync(buf);
const daftar = Object.keys(zip.files);
cek("paket .docx valid (zip terbaca)", daftar.length > 0, `${daftar.length} part`);
for (const p of ["[Content_Types].xml", "_rels/.rels", "word/document.xml", "word/styles.xml",
  "word/settings.xml", "word/header1.xml", "word/_rels/document.xml.rels"]) {
  cek(`part wajib ada: ${p}`, daftar.includes(p));
}
const baca = (p) => zip.file(p).async("string");
const [doc, rels, ctypes, header] = await Promise.all([
  baca("word/document.xml"), baca("word/_rels/document.xml.rels"),
  baca("[Content_Types].xml"), baca("word/header1.xml"),
]);

// XML well-formed: telusuri seluruh tag, pastikan tiap penutup cocok urutannya
const rusakDi = (xml) => {
  const susun = [];
  for (const m of xml.matchAll(/<(\/?)([\w:]+)([^>]*?)(\/?)>/g)) {
    const [, tutup, tag, atribut, mandiri] = m;
    if (mandiri || atribut.endsWith("/")) continue;
    if (tutup) {
      if (susun.pop() !== tag) return tag;
    } else susun.push(tag);
  }
  return susun.length ? susun.at(-1) : "";
};
for (const p of daftar.filter((n) => /\.(xml|rels)$/.test(n))) {
  const rusak = rusakDi(await baca(p));
  cek(`XML well-formed: ${p}`, !rusak, rusak ? `tag bermasalah: ${rusak}` : "");
}
cek("tabel selalu diikuti paragraf (syarat Word)", !/<\/w:tbl>\s*(<w:tbl>|<w:sectPr|<\/w:tc>)/.test(doc));
cek("halaman A4, margin kiri 4 cm & lainnya 3 cm",
  doc.includes(`<w:pgSz w:w="11906" w:h="16838"/>`)
  && doc.includes(`<w:pgMar w:top="1701" w:right="1701" w:bottom="1701" w:left="2268"`));
cek("nomor halaman (field PAGE) di kepala halaman",
  / PAGE /.test(header) && /Target="header1\.xml"/.test(rels) && /PartName="\/word\/header1\.xml"/.test(ctypes));

/* ---------- dua section: rekap (hal. 1) & lampiran (hal. 2 dst.) ---------- */
const awalBody = doc.indexOf("<w:body>") + 8;
const batasRekap = doc.indexOf("</w:p>", doc.indexOf("<w:sectPr>")) + 6;
const rekapXml = doc.slice(awalBody, batasRekap);
const lampiranXml = doc.slice(batasRekap, doc.lastIndexOf("<w:sectPr>"));
const sectAkhir = doc.slice(doc.lastIndexOf("<w:sectPr>"));
cek("dua section: rekap lalu lampiran", (doc.match(/<w:sectPr>/g) || []).length === 2);
cek("section rekap: margin kiri-kanan 2 cm & atas-bawah 1,5 cm, tanpa kepala halaman, nomor mulai 1",
  /<w:pgMar w:top="850" w:right="1134" w:bottom="850" w:left="1134"[^>]*\/><w:pgNumType w:start="1"\/>/.test(rekapXml)
  && !rekapXml.includes("<w:headerReference"));
cek("section lampiran: halaman baru, nomor halaman melanjutkan (mulai 2)",
  sectAkhir.includes(`<w:headerReference w:type="default" r:id="rId3"/><w:type w:val="nextPage"/>`)
  && !sectAkhir.includes("pgNumType"));

/* ---------- teks per paragraf & tabel ---------- */
const unesc = (s) => s
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
  .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
const teksDari = (xml) => unesc((xml.match(/<w:t(?: [^>]*)?>[^<]*<\/w:t>|<w:tab\/>|<w:br\/>/g) || [])
  .map((x) => (x === "<w:tab/>" ? "\t" : x === "<w:br/>" ? "\n" : x.replace(/<[^>]+>/g, ""))).join(""));
const paragraf = (lampiranXml.match(/<w:p[ >][\s\S]*?<\/w:p>/g) || []).map(teksDari);
const tabel = (lampiranXml.match(/<w:tbl>[\s\S]*?<\/w:tbl>/g) || []).map((t) =>
  (t.match(/<w:tr>[\s\S]*?<\/w:tr>/g) || []).map((tr) =>
    (tr.match(/<w:tc>[\s\S]*?<\/w:tc>/g) || []).map(teksDari)));
const adaPar = (s) => paragraf.includes(s);
const angka = (s) => Number(String(s).replace(/\./g, "").replace(",", ".")) || 0;

cek('lampiran dibuka judul "LAMPIRAN" lalu caption "Lampiran 1. Penggunaan Dana" (field SEQ)',
  paragraf[0] === "LAMPIRAN" && paragraf[1] === "Lampiran 1. Penggunaan Dana"
  && doc.includes(" SEQ Lampiran \\* ARABIC "));
cek("judul LAMPIRAN diberi bookmark tujuan PAGEREF",
  /<w:bookmarkStart w:id="0" w:name="_RefLampiranDana"\/><w:r>(?:(?!<\/w:p>)[\s\S])*>LAMPIRAN<\/w:t>/.test(lampiranXml));
const parRekap = (rekapXml.match(/<w:p[ >][\s\S]*?<\/w:p>/g) || []).map(teksDari).filter(Boolean);
cek("format lama (L-1, rekap) sudah tidak dipakai",
  ![...parRekap, ...paragraf].some((p) => /LAPORAN KEUANGAN LOGBOOK|NOTA & BUKTI PEMBAYARAN|REKAP PEMAKAIAN/.test(p)));
cek("lampiran memakai format polos (tanpa Calibri/warna latar)", !/Calibri|w:fill=/.test(lampiranXml));

/* ---------- halaman rekap ---------- */
const nilaiSesudah = (label) => parRekap[parRekap.indexOf(label) + 1];
cek('rekap: judul "Rekap Dana PKM" & kotak "SIAP DISALIN KE LAPORAN"',
  parRekap.some((p) => p.startsWith("Rekap Dana PKM\t")) && parRekap.includes("SIAP DISALIN KE LAPORAN"));
cek("rekap: menunjuk halaman 2 lewat PAGEREF",
  nilaiSesudah("SIAP DISALIN KE LAPORAN") === "Halaman 2 sampai akhir dokumen  ·  Lampiran 1. Penggunaan Dana"
  && rekapXml.includes(" PAGEREF _RefLampiranDana \\h "), nilaiSesudah("SIAP DISALIN KE LAPORAN"));
cek("rekap: tanpa gambar", !rekapXml.includes("<w:drawing>"));

/* ---------- tabel ringkas ---------- */
const ringkas = tabel.find((t) => t[0]?.[0] === "Judul") || [];
const barisSumber = (label) => ringkas.find((r) => r[1] === label);
cek("tabel ringkas: Judul dari profil PKM", ringkas[0]?.[0] === "Judul" && ringkas[0]?.[1] === profil.judul,
  ringkas[0]?.[1] || "(kosong)");
cek("tabel ringkas: kepala kolom",
  ringkas[1]?.join("|") === "Skema|Sumber|Tahun|Pendanaan (Rp)|Penggunaan (Rp)|Sisa (Rp)");
const cocokBaris = (label, danaX, pakai) => {
  const r = barisSumber(label);
  cek(`tabel ringkas: baris ${label} sesuai data`,
    r && r[3] === fmtAngka(danaX) && r[4] === fmtAngka(pakai) && r[5] === fmtAngka(danaX - pakai),
    r ? r.slice(1).join(" | ") : "tidak ada");
};
cocokBaris("Belmawa", danaBel, jumlahkan(bel));
cocokBaris("Perguruan Tinggi", danaPt, jumlahkan(pt));
const perluBelum = tanpa.length > 0 || danaLama > 0;
if (perluBelum) cocokBaris("Belum ditandai", danaLama, jumlahkan(tanpa));
else cek('tabel ringkas: tanpa baris "Belum ditandai"', !barisSumber("Belum ditandai"));
cek("tabel ringkas: skema dari profil (atau PKM)", barisSumber("Belmawa")?.[0] === (profil.skema || "PKM"),
  barisSumber("Belmawa")?.[0]);
if (profil.tahun) {
  cek("tabel ringkas: tahun dari profil", ringkas.slice(2, -1).every((r) => r[2] === String(profil.tahun)));
}
const totDana = danaBel + danaPt + danaLama;
const totPakai = jumlahkan(keuangan);
cek("tabel ringkas: SUB TOTAL",
  ringkas.at(-1)?.join("|") === ["SUB TOTAL", fmtRp(totDana), fmtRp(totPakai), fmtRp(totDana - totPakai)].join("|"),
  ringkas.at(-1)?.join(" | "));
const ket = paragraf.find((p) => p.startsWith("Keterangan: Penggunaan dana dipisahkan berdasarkan sumber pendanaan"));
cek("kalimat Keterangan tercetak", Boolean(ket), ket);
cek("rekap: total diterima, terpakai & sisa sama dengan SUB TOTAL lampiran",
  nilaiSesudah("TOTAL DANA DITERIMA") === fmtRp(totDana) && nilaiSesudah("TOTAL TERPAKAI") === fmtRp(totPakai)
  && nilaiSesudah("SISA BELUM TERPAKAI") === fmtRp(totDana - totPakai),
  [nilaiSesudah("TOTAL DANA DITERIMA"), nilaiSesudah("TOTAL TERPAKAI"), nilaiSesudah("SISA BELUM TERPAKAI")].join(" | "));
const nilaiKartu = (awal) => parRekap[parRekap.findIndex((p) => p.startsWith(awal)) + 1];
cek("rekap: kartu Belmawa & Perguruan Tinggi sesuai total lampiran",
  nilaiKartu("DANA BELMAWA") === fmtRp(jumlahkan(bel)) && nilaiKartu("DANA PERGURUAN TINGGI") === fmtRp(jumlahkan(pt)));
const butirRekap = parRekap.slice(parRekap.indexOf("CEK SEBELUM DISALIN") + 1, parRekap.indexOf("CEK SEBELUM DISALIN") + 13);
cek("rekap: 6 butir cek berlabel OK/CEK",
  butirRekap.length === 12 && butirRekap.every((t, i) => (i % 2 ? t.length > 10 : t === "OK" || t === "CEK")),
  butirRekap.filter((_, i) => i % 2 === 0).join(" "));

/* ---------- bagian per sumber ---------- */
cek("Lampiran 1.1 (Belmawa) ada", adaPar("Lampiran 1.1 Penggunaan Dana dari Belmawa"));
cek("Lampiran 1.2 (Perguruan Tinggi) ada", adaPar("Lampiran 1.2 Penggunaan Dana dari Perguruan Tinggi"));
cek(`Lampiran 1.3 ${tanpa.length ? "ada (ada entri tanpa sumber)" : "tidak dicetak"}`,
  adaPar("Lampiran 1.3 Penggunaan Dana yang Belum Ditandai Sumbernya") === tanpa.length > 0);

const LABEL = { bahan: "Bahan Habis Pakai", sewa: "Sewa dan Jasa", transport: "Transportasi Lokal", lain: "Lain-lain" };
const dikenal = new Set(KATEGORI_PKM.map((k) => k.id));
const harapKategori = [
  ...KATEGORI_PKM.filter((k) => bel.some((e) => e.kategori === k.id)).map((k) => LABEL[k.id]),
  ...(bel.some((e) => !dikenal.has(e.kategori)) ? ["Belum Berkategori"] : []),
].map((l, i) => `${i + 1}.\t${l}`);
const judulKategori = paragraf.filter((p) => /^\d+\.\t/.test(p));
cek("sub-judul kategori Belmawa hanya yang berisi & bernomor urut",
  judulKategori.join("|") === harapKategori.join("|"),
  judulKategori.map((s) => s.replace("\t", " ")).join(" · ") || "(tidak ada)");

const belanja = tabel.filter((t) => t[0]?.join("|") === "No|Tanggal|Keterangan|Harga Satuan (Rp)|Jumlah|Total (Rp)|Kode Nota");
const harapTabel = harapKategori.length + (pt.length ? 1 : 0) + (tanpa.length ? 1 : 0);
cek("jumlah tabel belanja sesuai", belanja.length === harapTabel, `${belanja.length} dari ${harapTabel}`);
const nBaris = belanja.reduce((s, t) => s + t.length - 2, 0);
cek("semua entri keuangan tercetak tepat sekali", nBaris === keuangan.length, `${nBaris} baris dari ${keuangan.length} entri`);
cek("tiap tabel belanja diakhiri SUB TOTAL yang benar", belanja.every((t) =>
  t.at(-1)[0] === "SUB TOTAL" && t.at(-1)[1] === fmtRp(t.slice(1, -1).reduce((s, r) => s + angka(r[5]), 0))));
cek("tanggal berformat dd-mm-yyyy", belanja.every((t) => t.slice(1, -1).every((r) => /^\d{2}-\d{2}-\d{4}$|^-$/.test(r[1]))));
cek("TOTAL DANA BELMAWA sesuai", adaPar(`TOTAL DANA BELMAWA: ${fmtRp(jumlahkan(bel))}`));
cek("TOTAL DANA PERGURUAN TINGGI sesuai", adaPar(`TOTAL DANA PERGURUAN TINGGI: ${fmtRp(jumlahkan(pt))}`));
if (tanpa.length) cek("TOTAL DANA BELUM DITANDAI sesuai", adaPar(`TOTAL DANA BELUM DITANDAI: ${fmtRp(jumlahkan(tanpa))}`));

/* ---------- nota / dokumentasi ---------- */
const buktiKeys = (e) => (e.bukti_keys?.length ? e.bukti_keys : e.bukti_key ? [e.bukti_key] : []);
const keysUnik = [...new Set(keuangan.flatMap(buktiKeys))];
const maksKode = keuangan.reduce((s, e) => s + new Set(buktiKeys(e)).size, 0);
const media = daftar.filter((p) => p.startsWith("word/media/") && !zip.files[p].dir);
const drawing = (doc.match(/<w:drawing>/g) || []).length;
const dok = tabel.filter((t) => t[0]?.join("|") === "No|Kode Nota|Dokumentasi");
const kodeDok = dok.flatMap((t) => t.slice(1).map((r) => r[1]));

if (keysUnik.length) {
  cek("berkas nota tersimpan di word/media/", media.length > 0, `${media.length} berkas untuk ${keysUnik.length} nota`);
  cek("nota tidak digandakan (≤ jumlah nota unik)", media.length <= keysUnik.length);
  cek("tabel Dokumentasi Nota tercetak", dok.length > 0, `${dok.length} tabel · ${kodeDok.length} nota`);
  cek("satu gambar per baris dokumentasi", drawing === kodeDok.length, `${drawing} gambar`);
  cek("kode nota urut 01, 02, … tanpa celah", kodeDok.every((k, i) => k === String(i + 1).padStart(2, "0")));
  cek("jumlah kode ≤ jumlah nota per entri", kodeDok.length <= maksKode, `${kodeDok.length} dari ${maksKode}`);
  // Kolom Kode Nota (rentang "04-07" diperluas) harus mencakup tiap kode dokumentasi tepat sekali
  const kodeBelanja = belanja.flatMap((t) => t.slice(1, -1).map((r) => r[6])).filter((k) => k !== "-")
    .flatMap((k) => {
      const [a, b = a] = k.split("-").map(Number);
      return Array.from({ length: b - a + 1 }, (_, i) => String(a + i).padStart(2, "0"));
    });
  cek("kolom Kode Nota menunjuk tiap dokumentasi tepat sekali",
    [...kodeBelanja].sort().join() === [...kodeDok].sort().join());
  cek("keterangan menyebut kode nota", Boolean(ket?.includes(`Nota ${kodeDok[0]}`)));

  // relationship & content-type gambar harus lengkap, kalau tidak Word menolak
  const ridDoc = [...new Set([...doc.matchAll(/r:embed="(rId\d+)"/g)].map((m) => m[1]))];
  cek("setiap gambar punya relationship", ridDoc.every((r) => rels.includes(`Id="${r}"`)), `${ridDoc.length} rId`);
  cek("relationship menunjuk berkas media yang ada",
    [...rels.matchAll(/Target="(media\/[^"]+)"/g)].every((m) => daftar.includes(`word/${m[1]}`)));
  cek("content-type gambar terdaftar", /Extension="(jpeg|png)"/.test(ctypes));
  const ids = [...doc.matchAll(/<wp:docPr id="(\d+)"/g)].map((m) => m[1]);
  cek("id docPr unik (syarat Word agar dokumen tidak 'perlu diperbaiki')", new Set(ids).size === ids.length);
} else {
  cek("tanpa bukti → dokumen tetap dibuat tanpa gambar", media.length === 0 && drawing === 0);
}

console.log("\nRingkasan tercetak:");
for (const r of ringkas) console.log(`  ${r.join(" | ")}`);
console.log(`  ${ket || "(tanpa keterangan)"}`);

console.log(gagal ? `\n${gagal} PENGUJIAN GAGAL` : "\nSEMUA PENGUJIAN LULUS");
process.exit(gagal ? 1 : 0);
