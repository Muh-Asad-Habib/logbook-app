/**
 * Diagnosa JALUR UNGGAH LANGSUNG browser → ImageKit untuk LAPORAN KEMAJUAN.
 * Byte berkas tidak melewati server: server hanya menerbitkan "izin"
 * (/izin-unggah), browser mengunggah sendiri ke upload.imagekit.io, lalu
 * server memverifikasi & mencatatnya (/daftarkan).
 *
 * Skrip ini MENIRU browser: ia benar-benar mengunggah ke ImageKit memakai
 * izin yang diterbitkan, jadi butuh internet + env IMAGEKIT_*.
 *
 * PENTING: memastikan tautan penampil Word Online (/publik/:kunci) TETAP
 * dilayani server apa adanya (bukan redirect), supaya hasil render Microsoft
 * tidak berubah sama sekali.
 *
 * Jalankan dari folder backend (server harus hidup):
 *   node diag-laporan-langsung.mjs
 */
import * as store from "./src/storage.js";
import { pakaiCloud, PART_MAX } from "./src/files.js";

const BASE = process.env.DIAG_BASE || "http://localhost:4000";
const suf = Date.now().toString(36);
const NAMA_TIM = `uji-lap-tim-${suf}`;
const NAMA_DOS = `uji-lap-dos-${suf}`;
const SANDI = "Rahasia123!";

const H = (tok) => ({ Authorization: `Bearer ${tok}` });
const HJ = (tok) => ({ ...H(tok), "Content-Type": "application/json" });

const jfetch = async (path, opt = {}) => {
  const res = await fetch(`${BASE}${path}`, opt);
  let body = null;
  try { body = await res.json(); } catch {}
  return { status: res.status, body };
};

let lulus = 0, gagal = 0;
const cek = (nama, kondisi, info = "") => {
  if (kondisi) { lulus++; console.log(`  OK    ${nama}`); }
  else { gagal++; console.log(`  GAGAL ${nama} ${info}`); }
};

/** .docx palsu: berawalan "PK" agar lolos pemeriksaan tanda tangan ZIP. */
function docxPalsu(ukuran, tanda = 0x20) {
  const b = Buffer.alloc(ukuran, tanda);
  b[0] = 0x50; b[1] = 0x4b; b[2] = 0x03; b[3] = 0x04;
  return b;
}

/** Tiru unggahan satu bagian dari browser ke ImageKit. */
async function unggahBagianIK(dasar, izin, key, potong) {
  const fd = new FormData();
  fd.append("file", new Blob([potong]), key);
  fd.append("fileName", key);
  fd.append("folder", dasar.folder);
  fd.append("useUniqueFileName", "false");
  fd.append("publicKey", dasar.publicKey);
  fd.append("token", izin.token);
  fd.append("expire", String(izin.expire));
  fd.append("signature", izin.signature);
  const res = await fetch(dasar.uploadUrl, { method: "POST", body: fd });
  const info = await res.json().catch(() => null);
  if (!res.ok || !info?.fileId) {
    throw new Error(`unggah bagian gagal: ${info?.message || res.status}`);
  }
  return { key, fileId: info.fileId };
}

/** Alur penuh: izin → unggah tiap bagian → daftarkan. */
async function unggahLangsung(tok, buffer, nama) {
  const izinRes = await jfetch("/api/laporan/izin-unggah", {
    method: "POST", headers: HJ(tok),
    body: JSON.stringify({ nama, ukuran: buffer.length }),
  });
  if (izinRes.status !== 200) throw new Error(`izin gagal: ${JSON.stringify(izinRes.body)}`);
  const z = izinRes.body;
  if (z.mode !== "langsung") throw new Error("server tidak dalam mode cloud");

  const terunggah = [];
  for (let i = 0; i < z.jumlah; i++) {
    const potong = buffer.subarray(i * z.partMax, (i + 1) * z.partMax);
    terunggah.push(await unggahBagianIK(z, z.izin[i], z.bagian[i], potong));
  }
  const daftar = await jfetch("/api/laporan/daftarkan", {
    method: "POST", headers: HJ(tok),
    body: JSON.stringify({
      nama, stem: z.stem, jumlah: z.jumlah, tanda: z.tanda, bagian: terunggah,
    }),
  });
  return { izin: z, daftar };
}

let timId = "", dosId = "";
try {
  if (!pakaiCloud()) {
    console.log("LEWATI: env IMAGEKIT_* tidak terpasang (mode lokal).");
    process.exit(0);
  }

  console.log("== Persiapan akun uji ==");
  const tim = await store.createUser(NAMA_TIM, SANDI, "tim");
  const dos = await store.createUser(NAMA_DOS, SANDI, "dosen");
  timId = tim.id; dosId = dos.id;
  await store.tambahPendampingKeTim(dosId, timId);
  const tokTim = await store.createSession(timId);
  const tokDos = await store.createSession(dosId);
  cek("akun tim & dosen pendamping siap", !!tokTim && !!tokDos);

  /* ---------- berkas KECIL: satu bagian, kunci .docx tunggal ---------- */
  console.log("\n== Berkas kecil (satu bagian) ==");
  const kecil = docxPalsu(96 * 1024, 0x41);
  const a = await unggahLangsung(tokTim, kecil, "laporan-kemajuan.docx");
  cek("izin-unggah → mode langsung, 1 bagian", a.izin.jumlah === 1, String(a.izin.jumlah));
  cek("nama bagian tunggal berekstensi .docx (agar Word Online mau membacanya)",
    /\.docx$/.test(String(a.izin.bagian[0])), String(a.izin.bagian[0]));
  cek("daftarkan → 200", a.daftar.status === 200, JSON.stringify(a.daftar.body));

  let meta = await store.metaLaporan(timId);
  cek("file_key tersimpan sebagai kunci tunggal (bukan multi:)",
    !!meta && !String(meta.file_key).startsWith("multi:"), String(meta?.file_key));
  cek("ukuran tercatat sama dengan berkas asli",
    meta?.ukuran === kecil.length, `${meta?.ukuran} vs ${kecil.length}`);

  let r = await jfetch("/api/laporan/info", { headers: H(tokTim) });
  cek("info laporan tampil untuk tim", r.status === 200 && r.body?.ada === true,
    JSON.stringify(r.body));

  /* ---------- PENAMPIL WORD ONLINE TIDAK BOLEH BERUBAH ---------- */
  console.log("\n== Penampil Word Online (harus tetap dari server) ==");
  r = await jfetch("/api/laporan/tautan", { method: "POST", headers: H(tokTim) });
  cek("tautan publik terbit", r.status === 200 && !!r.body?.url, JSON.stringify(r.body));
  const urlPublik = String(r.body.url).replace(BASE, "");

  const pub = await fetch(`${BASE}${urlPublik}`, { redirect: "manual" });
  cek("tautan publik TIDAK redirect (dijamin identik utk Microsoft)",
    pub.status === 200, `status ${pub.status}`);
  cek("content-type .docx benar",
    String(pub.headers.get("content-type") || "").includes("wordprocessingml"),
    String(pub.headers.get("content-type")));
  const isiPub = Buffer.from(await pub.arrayBuffer());
  cek("byte yang diterima Microsoft identik dengan berkas asli",
    isiPub.equals(kecil), `${isiPub.length} vs ${kecil.length}`);

  /* ---------- unduhan hemat trafik ---------- */
  console.log("\n== Unduhan lewat CDN ==");
  r = await fetch(`${BASE}/api/laporan/file`, { headers: H(tokTim), redirect: "manual" });
  cek("GET /file → 302 redirect ke CDN (byte tidak lewat server)",
    r.status === 302 && /imagekit/i.test(String(r.headers.get("location"))),
    `${r.status} ${r.headers.get("location") || ""}`);
  const cdn = await fetch(String(r.headers.get("location")));
  const isiCdn = Buffer.from(await cdn.arrayBuffer());
  cek("berkas di CDN identik dengan yang diunggah",
    cdn.ok && isiCdn.equals(kecil), `${cdn.status} ${isiCdn.length}B`);

  r = await jfetch("/api/laporan/file/bagian", { headers: H(tokTim) });
  cek("GET /file/bagian → 1 signed URL", r.status === 200 && r.body?.urls?.length === 1,
    JSON.stringify(r.body?.urls?.length));

  /* ---------- pendamping ---------- */
  console.log("\n== Akses pendamping ==");
  r = await jfetch(`/api/fasilitator/tim/${timId}/laporan-bagian`, { headers: H(tokDos) });
  cek("dosen dapat daftar signed URL bagian", r.status === 200 && r.body?.urls?.length === 1,
    JSON.stringify(r.body));
  r = await fetch(`${BASE}/api/fasilitator/tim/${timId}/laporan-file`,
    { headers: H(tokDos), redirect: "manual" });
  cek("dosen GET laporan-file → 302 ke CDN", r.status === 302, String(r.status));
  r = await jfetch(`/api/fasilitator/tim/${timId}/laporan-bagian`, { headers: H(tokTim) });
  cek("tim TIDAK boleh memakai rute fasilitator → 403", r.status === 403, String(r.status));

  /* ---------- berkas BESAR: multi-bagian ---------- */
  console.log("\n== Berkas besar (multi-bagian) ==");
  const besar = docxPalsu(PART_MAX + 128 * 1024, 0x42); // > 20 MB → 2 bagian
  const b = await unggahLangsung(tokTim, besar, "laporan-besar.docx");
  cek("izin-unggah → 2 bagian", b.izin.jumlah === 2, String(b.izin.jumlah));
  cek("nama bagian memakai pola .partN.bin",
    b.izin.bagian.every((n, i) => n.endsWith(`.part${i}.bin`)), b.izin.bagian.join(","));
  cek("daftarkan → 200", b.daftar.status === 200, JSON.stringify(b.daftar.body));

  meta = await store.metaLaporan(timId);
  cek("file_key tersimpan sebagai multi:2:<stem>",
    String(meta?.file_key).startsWith("multi:2:"), String(meta?.file_key));

  r = await jfetch("/api/laporan/file/bagian", { headers: H(tokTim) });
  cek("GET /file/bagian → 2 signed URL", r.status === 200 && r.body?.urls?.length === 2,
    JSON.stringify(r.body?.urls?.length));

  // Rakit dari CDN persis seperti yang dilakukan browser.
  const potongan = [];
  for (const u of r.body.urls) {
    const res = await fetch(u);
    potongan.push(Buffer.from(await res.arrayBuffer()));
  }
  const rakitan = Buffer.concat(potongan);
  cek("hasil rakitan dari CDN identik dengan berkas asli",
    rakitan.equals(besar), `${rakitan.length} vs ${besar.length}`);

  const lamaTerhapus = await store.getLaporan(timId);
  cek("berkas lama (yang kecil) sudah digantikan",
    !!lamaTerhapus && lamaTerhapus.buffer.length === besar.length);

  /* ---------- pagar keamanan ---------- */
  console.log("\n== Pagar keamanan ==");
  r = await jfetch("/api/laporan/daftarkan", {
    method: "POST", headers: HJ(tokTim),
    body: JSON.stringify({
      nama: "palsu.docx", stem: b.izin.stem, jumlah: 2,
      tanda: "0".repeat(32), bagian: [],
    }),
  });
  cek("daftarkan dengan tanda palsu → 400", r.status === 400, JSON.stringify(r.body));

  r = await jfetch("/api/laporan/izin-unggah", {
    method: "POST", headers: HJ(tokTim),
    body: JSON.stringify({ nama: "raksasa.docx", ukuran: 400 * 1024 * 1024 }),
  });
  cek("izin-unggah > 300 MB → 400", r.status === 400, JSON.stringify(r.body));

  r = await jfetch("/api/laporan/izin-unggah", {
    method: "POST", headers: HJ(tokDos),
    body: JSON.stringify({ nama: "dosen.docx", ukuran: 1024 }),
  });
  cek("dosen TIDAK boleh mengunggah laporan → 403", r.status === 403, String(r.status));

  /* ---------- pembersihan ---------- */
  console.log("\n== Hapus ==");
  r = await jfetch("/api/laporan", { method: "DELETE", headers: H(tokTim) });
  cek("hapus laporan → 200", r.status === 200, JSON.stringify(r.body));
  cek("metadata ikut hilang", (await store.metaLaporan(timId)) === null);

  console.log(`\n== HASIL: ${lulus} lulus, ${gagal} gagal ==`);
} catch (err) {
  console.error("ERROR:", err);
  gagal++;
} finally {
  if (timId) await store.deleteUser(timId).catch(() => {});
  if (dosId) await store.deleteUser(dosId).catch(() => {});
  console.log("Akun uji dibersihkan.");
  process.exit(gagal ? 1 : 0);
}

