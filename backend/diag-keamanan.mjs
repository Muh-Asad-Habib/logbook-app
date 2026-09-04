/**
 * Diagnosa PERBAIKAN KEAMANAN hasil audit (sekali jalan, server harus hidup):
 *  - toggle pendaftaran akun tim (meta pendaftaranTimBuka) + endpoint publik
 *  - whitelist kunci & batas panjang /api/pengaturan
 *  - CORS: origin mirip LAN palsu (https://192.168.evil.com) ditolak
 *  - unggahan bukan gambar → 400 ramah (bukan 500)
 *  - pembatas laju per-username tercatat di login_fails
 *  - panel: PUT /data/pendaftaran-tim + audit
 *
 * Jalankan dari folder backend:  node diag-keamanan.mjs
 */
import crypto from "node:crypto";
import { q } from "./src/db.js";
import * as store from "./src/storage.js";

const BASE = process.env.DIAG_BASE || "http://localhost:4000";
const suf = Date.now().toString(36);
const NAMA = `uji-aman-${suf}`;
const SANDI = "Rahasia123!";
const H = (tok) => ({ Authorization: `Bearer ${tok}` });
const HJ = (tok) => ({ ...H(tok), "Content-Type": "application/json" });

const jfetch = async (path, opt = {}) => {
  const res = await fetch(`${BASE}${path}`, opt);
  let body = null;
  try { body = await res.json(); } catch {}
  return { status: res.status, body, res };
};
let lulus = 0, gagal = 0;
const cek = (nama, kondisi, info = "") => {
  if (kondisi) { lulus++; console.log(`  OK    ${nama}`); }
  else { gagal++; console.log(`  GAGAL ${nama} ${info}`); }
};

const metaAwal = await store.getMeta("pendaftaranTimBuka");
// Skrip diag lain baru saja mendaftar/login berkali-kali dari IP ini → penghitung
// anti brute-force bisa sudah penuh. Nolkan dulu agar uji ini menilai LOGIKA,
// bukan sisa hitungan (hanya menyentuh penghitung IP lokal).
await q("DELETE FROM login_fails WHERE kunci LIKE 'auth:register|%' OR kunci LIKE 'auth:login|%' OR kunci LIKE 'auth:login:user|%'");
let uid = "", adminTok = "";
try {
  console.log("== Pendaftaran akun tim: buka/tutup ==");
  let r = await jfetch("/api/auth/pendaftaran");
  cek("GET /api/auth/pendaftaran tanpa login → 200", r.status === 200 && typeof r.body?.tim === "boolean",
    JSON.stringify(r.body));

  await store.setMeta("pendaftaranTimBuka", "0");
  r = await jfetch("/api/auth/register", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: NAMA, password: SANDI }),
  });
  cek("daftar tim saat DITUTUP → 403", r.status === 403, JSON.stringify(r.body));
  r = await jfetch("/api/auth/pendaftaran");
  cek("status publik melapor tim: false", r.body?.tim === false, JSON.stringify(r.body));

  await store.setMeta("pendaftaranTimBuka", "1");
  r = await jfetch("/api/auth/register", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: NAMA, password: SANDI }),
  });
  cek("daftar tim saat DIBUKA → 201", r.status === 201 && !!r.body?.token, JSON.stringify(r.body?.error || ""));
  const tok = r.body?.token; uid = r.body?.user?.id || "";

  console.log("\n== /api/pengaturan: whitelist & batas panjang ==");
  r = await jfetch("/api/pengaturan/sembarang_kunci", {
    method: "PUT", headers: HJ(tok), body: JSON.stringify({ nilai: "x" }),
  });
  cek("kunci di luar whitelist → 400", r.status === 400, JSON.stringify(r.body));
  r = await jfetch("/api/pengaturan/sembarang_kunci", { headers: H(tok) });
  cek("GET kunci di luar whitelist → 400", r.status === 400, String(r.status));
  r = await jfetch("/api/pengaturan/dana_belmawa", {
    method: "PUT", headers: HJ(tok), body: JSON.stringify({ nilai: "9".repeat(300) }),
  });
  cek("nilai > 200 karakter → 400", r.status === 400, JSON.stringify(r.body));
  r = await jfetch("/api/pengaturan/dana_belmawa", {
    method: "PUT", headers: HJ(tok), body: JSON.stringify({ nilai: "5000000" }),
  });
  cek("dana_belmawa sah → 200", r.status === 200 && r.body?.nilai === "5000000", JSON.stringify(r.body));
  r = await jfetch("/api/pengaturan/kode_tim", {
    method: "PUT", headers: HJ(tok), body: JSON.stringify({ nilai: "ABCD2345" }),
  });
  cek("kode_tim tetap terkunci → 403", r.status === 403, String(r.status));

  console.log("\n== CORS ==");
  let res = await fetch(`${BASE}/health`, { headers: { Origin: "https://192.168.evil.com" } });
  cek("origin LAN palsu (192.168.evil.com) → tanpa header CORS",
    !res.headers.get("access-control-allow-origin"), String(res.headers.get("access-control-allow-origin")));
  res = await fetch(`${BASE}/health`, { headers: { Origin: "http://localhost:3000" } });
  cek("origin localhost:3000 (dev) → diizinkan",
    res.headers.get("access-control-allow-origin") === "http://localhost:3000",
    String(res.headers.get("access-control-allow-origin")));
  res = await fetch(`${BASE}/health`, { headers: { Origin: "http://192.168.1.7:4000" } });
  cek("origin IP LAN sah → diizinkan",
    res.headers.get("access-control-allow-origin") === "http://192.168.1.7:4000",
    String(res.headers.get("access-control-allow-origin")));

  console.log("\n== Unggahan bukan gambar → pesan ramah ==");
  const fd = new FormData();
  fd.append("tanggal", "2026-09-04");
  fd.append("kegiatan", "uji berkas salah");
  fd.append("foto", new Blob([Buffer.from("bukan gambar")], { type: "text/plain" }), "catatan.txt");
  r = await jfetch("/api/kegiatan", { method: "POST", headers: H(tok), body: fd });
  cek("POST kegiatan dengan .txt → 400 (bukan 500)", r.status === 400 && /Hanya berkas/.test(r.body?.error || ""),
    `${r.status} ${JSON.stringify(r.body)}`);

  console.log("\n== Pembatas laju per-username ==");
  const korban = `korban-${suf}`;
  for (let i = 0; i < 3; i++) {
    await jfetch("/api/auth/login", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: korban, password: "salah" }),
    });
  }
  const baris = await q("SELECT n FROM login_fails WHERE kunci = $1", [`auth:login:user|${korban}`]);
  cek("penghitung per-username tercatat (3 percobaan)", Number(baris[0]?.n) === 3, JSON.stringify(baris));
  await q("DELETE FROM login_fails WHERE kunci LIKE $1", [`%${suf}%`]);
  // penghitung per-IP ikut naik akibat uji ini → nolkan agar tidak mengganggu uji lain
  await q("DELETE FROM login_fails WHERE kunci LIKE 'auth:login|%'");

  console.log("\n== Panel: toggle pendaftaran + audit ==");
  const meta = await q("SELECT nilai FROM meta WHERE kunci = 'admin'");
  const PANEL = (meta[0] ? JSON.parse(meta[0].nilai).path : "/pusat-kendali") || "/pusat-kendali";
  const UA = "diag-keamanan/1.0";
  adminTok = crypto.randomBytes(24).toString("hex");
  await q("INSERT INTO admin_sessions (token, exp, ua_hash) VALUES ($1, $2, $3)",
    [adminTok, Date.now() + 10 * 60 * 1000, crypto.createHash("sha256").update(UA).digest("hex")]);
  const HA = { Authorization: `Bearer ${adminTok}`, "User-Agent": UA, "Content-Type": "application/json" };

  r = await jfetch(`${PANEL}/data/pendaftaran-tim`, { headers: HA });
  cek("GET /data/pendaftaran-tim → buka:true", r.status === 200 && r.body?.buka === true, JSON.stringify(r.body));
  r = await jfetch(`${PANEL}/data/pendaftaran-tim`, { method: "PUT", headers: HA, body: JSON.stringify({ buka: false }) });
  cek("PUT tutup → ok", r.status === 200 && r.body?.buka === false, JSON.stringify(r.body));
  cek("meta tersimpan '0'", (await store.getMeta("pendaftaranTimBuka")) === "0");
  r = await jfetch(`${PANEL}/data/pendaftaran-tim`, { method: "PUT", headers: HA, body: JSON.stringify({ buka: true }) });
  cek("PUT buka → ok", r.status === 200 && r.body?.buka === true, JSON.stringify(r.body));
  await new Promise((rs) => setTimeout(rs, 600));
  const audit = await q("SELECT aksi FROM audit WHERE aksi = 'pendaftaran.tim.ubah' ORDER BY id DESC LIMIT 2");
  cek("audit pendaftaran.tim.ubah tercatat", audit.length >= 2, String(audit.length));
  // cookie panel dipasang saat sesi sah
  cek("respons panel memasang cookie logbook_panel",
    /logbook_panel=/.test(String(r.res.headers.get("set-cookie") || "")),
    String(r.res.headers.get("set-cookie")));

  console.log(`\n== HASIL: ${lulus} lulus, ${gagal} gagal ==`);
} catch (err) {
  console.error("ERROR:", err);
  gagal++;
} finally {
  // Kembalikan status pendaftaran seperti sebelum uji
  if (metaAwal == null) await q("DELETE FROM meta WHERE kunci IN ('pendaftaranTimBuka','pendaftaranTimUpdatedAt')").catch(() => {});
  else await store.setMeta("pendaftaranTimBuka", metaAwal).catch(() => {});
  if (uid) await store.deleteUser(uid).catch(() => {});
  if (adminTok) await q("DELETE FROM admin_sessions WHERE token = $1", [adminTok]).catch(() => {});
  await q("DELETE FROM audit WHERE aksi = 'pendaftaran.tim.ubah' AND ip IN ('::1','127.0.0.1','::ffff:127.0.0.1')").catch(() => {});
  console.log("Data uji dibersihkan.");
  process.exit(gagal ? 1 : 0);
}


