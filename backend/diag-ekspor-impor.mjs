/**
 * Diagnosa PUTAR-BALIK EKSPOR → IMPOR beserta fotonya (server harus hidup di
 * :4000, memakai database & ImageKit sungguhan).
 *
 * Yang dibuktikan:
 *  - POST /api/export/tautan/<jenis> membangun berkas & menaruhnya di CDN
 *  - foto 2000px dikecilkan CDN menjadi sematan 1000px (transformasi `tr`)
 *  - cache sidik jari: permintaan kedua memakai berkas lama (cache: true),
 *    `?segar=1` memaksa bangun ulang, dan data yang BERUBAH membatalkan cache
 *  - berkas ekspor lama dibuang saat yang baru dibuat (tidak menumpuk)
 *  - PDF & XLSX ikut terbit lewat jalur CDN yang sama
 *  - dokumen hasil ekspor bisa DIIMPOR kembali ke akun lain: entri masuk,
 *    fotonya ikut terunggah ulang dan benar-benar ada di penyimpanan
 *  - impor ulang dokumen yang sama TIDAK mengunggah foto lagi (foto_baru = 0)
 *    — bukti urutan "parse dulu, unggah belakangan" bekerja
 *  - jenis ekspor asing ditolak 400
 *
 * Jalankan dari folder backend:  node diag-ekspor-impor.mjs
 */
import JSZip from "jszip";
import sharp from "sharp";
import { q } from "./src/db.js";
import * as store from "./src/storage.js";
import { putFile, removeFiles, adaFile, pakaiCloud } from "./src/files.js";
import { ukuranGambar, extDariByte } from "./src/export/foto.js";

const BASE = process.env.DIAG_BASE || "http://localhost:4000";
const suf = Date.now().toString(36);
const SANDI = "Rahasia123!";
const HJ = (tok) => ({ Authorization: `Bearer ${tok}`, "Content-Type": "application/json" });

const jfetch = async (path, opt = {}) => {
  const res = await fetch(`${BASE}${path}`, opt);
  let body = null;
  try { body = await res.json(); } catch {}
  return { status: res.status, body };
};

/** Unduh dari CDN dengan retry — propagasi ImageKit bisa 1–5 detik. */
async function unduh(url, percobaan = 5) {
  for (let i = 0; i < percobaan; i++) {
    if (i > 0) await new Promise((r) => setTimeout(r, 1200));
    try {
      const res = await fetch(url);
      if (res.ok) return Buffer.from(await res.arrayBuffer());
    } catch {}
  }
  return null;
}

let lulus = 0, gagal = 0;
const cek = (nama, kondisi, info = "") => {
  if (kondisi) { lulus++; console.log(`  OK    ${nama}`); }
  else { gagal++; console.log(`  GAGAL ${nama} ${info}`); }
};

/** Daftar gambar di dalam paket .docx beserta dimensinya. */
async function mediaDocx(buf) {
  const zip = await JSZip.loadAsync(buf);
  // Object.keys ikut memuat entri FOLDER ("word/media/") — entri itu tidak
  // punya isi, jadi harus disaring sebelum dibaca.
  const berkas = Object.values(zip.files).filter((f) => !f.dir && /^word\/media\//.test(f.name));
  const hasil = [];
  for (const f of berkas) {
    const b = await f.async("nodebuffer");
    hasil.push({ nama: f.name, ext: extDariByte(b, f.name), ukuran: ukuranGambar(b), byte: b.length });
  }
  return hasil;
}

const sisi = (u) => (u ? Math.max(u.w, u.h) : 0);

let uidA = "", uidB = "";
const sampah = []; // kunci berkas yang harus dibersihkan di akhir

try {
  if (!pakaiCloud()) {
    console.log("Mode LOKAL (ImageKit tidak dikonfigurasi) — uji ini butuh mode cloud. Dilewati.");
    process.exit(0);
  }
  await q("DELETE FROM login_fails WHERE kunci LIKE 'auth:register|%' OR kunci LIKE 'auth:login|%'");

  console.log("== Akun uji + foto sungguhan ==");
  let r = await jfetch("/api/auth/register", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: `uji-eks-${suf}`, password: SANDI }),
  });
  cek("daftar tim A → 201", r.status === 201 && !!r.body?.token, JSON.stringify(r.body?.error || ""));
  const tokA = r.body.token; uidA = r.body.user.id;

  // Foto 2400×1600 (rasio 3:2) — setelah unggah dikompres ≤2000px,
  // setelah transformasi sematan harus menjadi 1000×667.
  const warna = ["#0ea5e9", "#db2777", "#16a34a"];
  const fotoKey = [];
  for (const w of warna) {
    const buf = await sharp({ create: { width: 2400, height: 1600, channels: 3, background: w } })
      .jpeg({ quality: 92 }).toBuffer();
    const key = await putFile("uji.jpg", buf, "ujif");
    fotoKey.push(key); sampah.push(key);
  }
  cek("3 foto uji terunggah ke penyimpanan", fotoKey.length === 3 && fotoKey.every(Boolean));

  const TEKS = [
    `Uji ekspor ${suf} — pelatihan model klasifikasi citra tahap pertama`,
    `Uji ekspor ${suf} — perakitan purwarupa alat di laboratorium mitra`,
    `Uji ekspor ${suf} — penyusunan laporan kemajuan bersama pembimbing`,
  ];
  await store.setSetting(uidA, "dana_belmawa", "8000000");
  for (let i = 0; i < 3; i++) {
    await store.addKegiatan(uidA, {
      tanggal: `2026-07-0${i + 1}`, kegiatan: TEKS[i],
      capaian_delta: 10, waktu_menit: 120, foto_keys: [fotoKey[i]],
    });
  }
  await store.addKeuangan(uidA, {
    tanggal: "2026-07-05", item: `Uji ekspor ${suf} — sewa GPU cloud`,
    harga_satuan: 90000, satuan_suffix: "/jam", jumlah: 5, kode_unik: 0,
    bukti_keys: [fotoKey[0]], sumber: "belmawa", kategori: "sewa",
  });

  console.log("\n== Ekspor DOCX lewat CDN ==");
  r = await jfetch("/api/export/tautan/docx", { method: "POST", headers: HJ(tokA) });
  cek("tautan/docx → 200 mode cdn", r.status === 200 && r.body?.mode === "cdn", JSON.stringify(r.body));
  cek("bangun baru (cache: false)", r.body?.cache === false, String(r.body?.cache));
  cek("nama berkas memuat nama tim & berakhiran .docx",
    /^Logbook uji-eks-/.test(r.body?.nama || "") && /\.docx$/.test(r.body?.nama || ""), r.body?.nama);
  const urlDocx = r.body.url, ukuranDocx = r.body.ukuran;
  const docx = await unduh(urlDocx);
  cek("berkas terunduh dari CDN", !!docx && docx.length > 0, String(docx?.length));
  cek("ukuran laporan sama dengan berkas di CDN", docx?.length === ukuranDocx, `${docx?.length} vs ${ukuranDocx}`);
  cek("berkas berupa paket ZIP (.docx)", docx?.[0] === 0x50 && docx?.[1] === 0x4b);

  const media = await mediaDocx(docx);
  const sematan = media.filter((m) => sisi(m.ukuran) === 1000);
  cek("≥ 3 foto tersemat pada resolusi sematan 1000px", sematan.length >= 3,
    JSON.stringify(media.map((m) => `${m.nama}:${m.ukuran?.w}x${m.ukuran?.h}`)));
  cek("rasio asli 3:2 dipertahankan (1000×667, tanpa crop)",
    sematan.every((m) => m.ukuran.w === 1000 && Math.abs(m.ukuran.h - 667) <= 3),
    JSON.stringify(sematan.map((m) => `${m.ukuran.w}x${m.ukuran.h}`)));
  cek("tidak ada gambar melebihi batas sematan", media.every((m) => sisi(m.ukuran) <= 1000),
    String(Math.max(...media.map((m) => sisi(m.ukuran)))));
  cek("foto sematan berformat JPEG", sematan.every((m) => m.ext === "jpeg"));
  const beratRata = sematan.reduce((a, m) => a + m.byte, 0) / (sematan.length || 1);
  cek("berat rata-rata foto sematan wajar (< 400 KB)", beratRata < 400 * 1024, `${Math.round(beratRata / 1024)} KB`);

  console.log("\n== Cache sidik jari ==");
  const kunciEkspor1 = await store.getSetting(uidA, "ekspor_key_docx", "");
  sampah.push(kunciEkspor1);
  r = await jfetch("/api/export/tautan/docx", { method: "POST", headers: HJ(tokA) });
  cek("permintaan kedua memakai cache (cache: true)", r.body?.cache === true, JSON.stringify(r.body));
  cek("ukuran dari cache sama persis", r.body?.ukuran === ukuranDocx, `${r.body?.ukuran} vs ${ukuranDocx}`);
  cek("kunci berkas tidak berubah saat cache dipakai",
    (await store.getSetting(uidA, "ekspor_key_docx", "")) === kunciEkspor1);

  r = await jfetch("/api/export/tautan/docx?segar=1", { method: "POST", headers: HJ(tokA) });
  cek("?segar=1 memaksa bangun ulang", r.body?.cache === false, JSON.stringify(r.body?.cache));
  const kunciEkspor2 = await store.getSetting(uidA, "ekspor_key_docx", "");
  sampah.push(kunciEkspor2);
  cek("kunci berkas berganti setelah bangun ulang", kunciEkspor2 && kunciEkspor2 !== kunciEkspor1);
  cek("berkas ekspor lama dibuang (tidak menumpuk di penyimpanan)",
    (await adaFile(kunciEkspor1)) === false, kunciEkspor1);

  await store.addKegiatan(uidA, {
    tanggal: "2026-07-09", kegiatan: `Uji ekspor ${suf} — entri tambahan pembatal cache`,
    capaian_delta: 5, waktu_menit: 60, foto_keys: [],
  });
  r = await jfetch("/api/export/tautan/docx", { method: "POST", headers: HJ(tokA) });
  cek("data berubah → cache batal, bangun ulang", r.body?.cache === false, JSON.stringify(r.body?.cache));
  const kunciEkspor3 = await store.getSetting(uidA, "ekspor_key_docx", "");
  sampah.push(kunciEkspor3);
  cek("kunci berkas berganti lagi", kunciEkspor3 && kunciEkspor3 !== kunciEkspor2);

  console.log("\n== Jenis ekspor lain ==");
  r = await jfetch("/api/export/tautan/pdf", { method: "POST", headers: HJ(tokA) });
  cek("tautan/pdf → 200 mode cdn", r.status === 200 && r.body?.mode === "cdn", JSON.stringify(r.body?.error || ""));
  sampah.push(await store.getSetting(uidA, "ekspor_key_pdf", ""));
  const pdf = await unduh(r.body?.url || "");
  cek("berkas PDF sah (%PDF)", pdf?.slice(0, 4).toString() === "%PDF", pdf?.slice(0, 8).toString());

  r = await jfetch("/api/export/tautan/xlsx", { method: "POST", headers: HJ(tokA) });
  cek("tautan/xlsx → 200 mode cdn", r.status === 200 && r.body?.mode === "cdn", JSON.stringify(r.body?.error || ""));
  sampah.push(await store.getSetting(uidA, "ekspor_key_xlsx", ""));
  const xlsx = await unduh(r.body?.url || "");
  cek("berkas XLSX sah (ZIP)", xlsx?.[0] === 0x50 && xlsx?.[1] === 0x4b);

  r = await jfetch("/api/export/tautan/keuangan-docx", { method: "POST", headers: HJ(tokA) });
  cek("tautan/keuangan-docx → 200 mode cdn", r.status === 200 && r.body?.mode === "cdn", JSON.stringify(r.body?.error || ""));
  sampah.push(await store.getSetting(uidA, "ekspor_key_keuangan-docx", ""));
  const keuDocx = await unduh(r.body?.url || "");
  cek("dokumen keuangan memuat nota yang disematkan",
    (await mediaDocx(keuDocx)).some((m) => sisi(m.ukuran) > 0));

  r = await jfetch("/api/export/tautan/entah", { method: "POST", headers: HJ(tokA) });
  cek("jenis ekspor asing → 400", r.status === 400, String(r.status));

  console.log("\n== Impor kembali dokumen hasil ekspor (akun lain) ==");
  r = await jfetch("/api/auth/register", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: `uji-imp-${suf}`, password: SANDI }),
  });
  cek("daftar tim B → 201", r.status === 201 && !!r.body?.token, JSON.stringify(r.body?.error || ""));
  const tokB = r.body.token; uidB = r.body.user.id;

  const kirimDocx = async (buf) => {
    const form = new FormData();
    form.append("file", new Blob([buf]), "ekspor.docx");
    const res = await fetch(`${BASE}/api/import/docx`, {
      method: "POST", headers: { Authorization: `Bearer ${tokB}` }, body: form,
    });
    return { status: res.status, body: await res.json().catch(() => null) };
  };

  r = await kirimDocx(docx);
  cek("impor docx → 200", r.status === 200, JSON.stringify(r.body?.error || r.status));
  cek("3 kegiatan uji ikut terbawa", Number(r.body?.keg_baru) >= 3, JSON.stringify(r.body));
  cek("foto ikut dipindahkan", Number(r.body?.foto_baru) >= 3, String(r.body?.foto_baru));

  const kegB = await store.listKegiatan(uidB);
  const cocok = kegB.filter((e) => String(e.kegiatan).includes(suf));
  cek("entri uji ditemukan di akun B", cocok.length >= 3, String(cocok.length));
  const kunciFotoB = cocok.flatMap((e) => e.foto_keys || []);
  sampah.push(...kegB.flatMap((e) => e.foto_keys || []));
  sampah.push(...(await store.listKeuangan(uidB)).flatMap((e) => e.bukti_keys || []));
  cek("tiap entri uji membawa fotonya", cocok.every((e) => (e.foto_keys || []).length >= 1),
    JSON.stringify(cocok.map((e) => (e.foto_keys || []).length)));
  const adaSemua = await Promise.all(kunciFotoB.map((k) => adaFile(k)));
  cek("semua foto hasil impor benar-benar ada di penyimpanan",
    adaSemua.length > 0 && adaSemua.every(Boolean), JSON.stringify(adaSemua));

  r = await kirimDocx(docx);
  cek("impor ulang → tidak ada entri ganda", Number(r.body?.keg_baru) === 0, JSON.stringify(r.body));
  cek("impor ulang melewati entri lama", Number(r.body?.keg_lewat) >= 3, String(r.body?.keg_lewat));
  cek("impor ulang TIDAK mengunggah foto lagi (foto_baru = 0)",
    Number(r.body?.foto_baru) === 0, String(r.body?.foto_baru));

  console.log(`\n== HASIL: ${lulus} lulus, ${gagal} gagal ==`);
} catch (err) {
  console.error("ERROR:", err);
  gagal++;
} finally {
  if (uidA) await store.deleteUser(uidA).catch(() => {});
  if (uidB) await store.deleteUser(uidB).catch(() => {});
  await removeFiles([...new Set(sampah.filter(Boolean))]).catch(() => {});
  console.log("Data & berkas uji dibersihkan.");
  process.exit(gagal ? 1 : 0);
}


