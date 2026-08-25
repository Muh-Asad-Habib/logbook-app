/**
 * Diagnosa JALUR UNGGAH LANGSUNG browser → ImageKit untuk presentasi.
 * Byte berkas tidak melewati server: server hanya menerbitkan "izin"
 * (/izin-unggah), browser mengunggah sendiri ke upload.imagekit.io, lalu
 * server memverifikasi & mencatatnya (/daftarkan).
 *
 * Skrip ini MENIRU browser: ia benar-benar mengunggah ke ImageKit memakai
 * izin yang diterbitkan, jadi butuh internet + env IMAGEKIT_*.
 *
 * Jalankan dari folder backend (server harus hidup):
 *   node diag-presentasi-langsung.mjs
 *   $env:DIAG_BASE="http://localhost:4123"; node diag-presentasi-langsung.mjs
 *
 * Akun uji dibuat lewat storage dan dihapus lagi di akhir — termasuk semua
 * bagian berkasnya di ImageKit.
 */
import * as store from "./src/storage.js";
import { pakaiCloud, PART_MAX } from "./src/files.js";

const BASE = process.env.DIAG_BASE || "http://localhost:4000";
const suf = Date.now().toString(36);
const NAMA_TIM = `uji-langsung-tim-${suf}`;
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

/** .pptx palsu: berawalan "PK" agar lolos pemeriksaan tanda tangan ZIP. */
function pptxPalsu(ukuran, tanda = 0x20) {
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
  const izinRes = await jfetch("/api/presentasi/izin-unggah", {
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
  const daftar = await jfetch("/api/presentasi/daftarkan", {
    method: "POST", headers: HJ(tok),
    body: JSON.stringify({
      nama, stem: z.stem, jumlah: z.jumlah, tanda: z.tanda, bagian: terunggah,
    }),
  });
  return { izin: z, daftar };
}

let timId = "";
try {
  if (!pakaiCloud()) {
    console.log("LEWATI: env IMAGEKIT_* tidak terpasang (mode lokal).");
    process.exit(0);
  }

  console.log("== Persiapan akun uji ==");
  const tim = await store.createUser(NAMA_TIM, SANDI, "tim");
  timId = tim.id;
  const tokTim = await store.createSession(timId);
  cek("akun tim uji siap", !!tokTim);

  /* ---------- berkas KECIL: satu bagian, kunci .pptx tunggal ---------- */
  console.log("\n== Berkas kecil (satu bagian) ==");
  const kecil = pptxPalsu(64 * 1024, 0x41);
  const a = await unggahLangsung(tokTim, kecil, "materi-kecil.pptx");
  cek("izin-unggah → mode langsung, 1 bagian", a.izin.jumlah === 1, JSON.stringify(a.izin.jumlah));
  cek("nama bagian tunggal berekstensi .pptx (agar Office mau membacanya)",
    /\.pptx$/.test(String(a.izin.bagian[0])), String(a.izin.bagian[0]));
  cek("daftarkan → 200", a.daftar.status === 200, JSON.stringify(a.daftar.body));

  let meta = await store.metaPresentasi(timId);
  cek("file_key tersimpan sebagai kunci tunggal (bukan multi:)",
    !!meta && !String(meta.file_key).startsWith("multi:"), String(meta?.file_key));
  cek("ukuran tercatat sama dengan berkas asli",
    meta?.ukuran === kecil.length, `${meta?.ukuran} vs ${kecil.length}`);

  let r = await fetch(`${BASE}/api/presentasi/file`, { headers: H(tokTim), redirect: "manual" });
  cek("GET /file → 302 redirect ke CDN (byte tidak lewat server)",
    r.status === 302 && /imagekit/i.test(String(r.headers.get("location"))),
    `${r.status} ${r.headers.get("location") || ""}`);

  const cdn = await fetch(String(r.headers.get("location")));
  const isiCdn = Buffer.from(await cdn.arrayBuffer());
  cek("berkas di CDN identik dengan yang diunggah",
    cdn.ok && isiCdn.equals(kecil), `${cdn.status} ${isiCdn.length}B`);

  r = await jfetch("/api/presentasi/file/bagian", { headers: H(tokTim) });
  cek("GET /file/bagian → 1 signed URL", r.status === 200 && r.body?.urls?.length === 1,
    JSON.stringify(r.body?.urls?.length));

  /* ---------- berkas BESAR: multi-bagian ---------- */
  console.log("\n== Berkas besar (multi-bagian) ==");
  const besar = pptxPalsu(PART_MAX + 256 * 1024, 0x42); // > 20 MB → 2 bagian
  const b = await unggahLangsung(tokTim, besar, "materi-besar.pptx");
  cek("izin-unggah → 2 bagian", b.izin.jumlah === 2, String(b.izin.jumlah));
  cek("nama bagian memakai pola .partN.bin",
    b.izin.bagian.every((n, i) => n.endsWith(`.part${i}.bin`)), b.izin.bagian.join(","));
  cek("daftarkan → 200", b.daftar.status === 200, JSON.stringify(b.daftar.body));

  meta = await store.metaPresentasi(timId);
  cek("file_key tersimpan sebagai multi:2:<stem>",
    String(meta?.file_key).startsWith("multi:2:"), String(meta?.file_key));

  r = await jfetch("/api/presentasi/file/bagian", { headers: H(tokTim) });
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

  const lamaTerhapus = await store.getPresentasi(timId);
  cek("berkas lama (yang kecil) sudah digantikan",
    !!lamaTerhapus && lamaTerhapus.buffer.length === besar.length);

  /* ---------- pagar keamanan ---------- */
  console.log("\n== Pagar keamanan ==");
  r = await jfetch("/api/presentasi/daftarkan", {
    method: "POST", headers: HJ(tokTim),
    body: JSON.stringify({
      nama: "palsu.pptx", stem: b.izin.stem, jumlah: 2,
      tanda: "0".repeat(32), bagian: [],
    }),
  });
  cek("daftarkan dengan tanda palsu → 400", r.status === 400, JSON.stringify(r.body));

  r = await jfetch("/api/presentasi/izin-unggah", {
    method: "POST", headers: HJ(tokTim),
    body: JSON.stringify({ nama: "raksasa.pptx", ukuran: 400 * 1024 * 1024 }),
  });
  cek("izin-unggah > 300 MB → 400", r.status === 400, JSON.stringify(r.body));

  r = await jfetch("/api/presentasi/izin-unggah", {
    method: "POST", headers: HJ(tokTim),
    body: JSON.stringify({ nama: "kosong.pptx", ukuran: 0 }),
  });
  cek("izin-unggah ukuran 0 → 400", r.status === 400, JSON.stringify(r.body));

  /* ---------- pembersihan ---------- */
  console.log("\n== Hapus ==");
  r = await jfetch("/api/presentasi/file", { method: "DELETE", headers: H(tokTim) });
  cek("hapus berkas → 200", r.status === 200, JSON.stringify(r.body));
  cek("metadata ikut hilang", (await store.metaPresentasi(timId)) === null);

  console.log(`\n== HASIL: ${lulus} lulus, ${gagal} gagal ==`);
} catch (err) {
  console.error("ERROR:", err);
  gagal++;
} finally {
  try { if (timId) await store.deleteUser(timId); } catch {}
  console.log("Akun uji dibersihkan.");
  process.exit(gagal ? 1 : 0);
}

