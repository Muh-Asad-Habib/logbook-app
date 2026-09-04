/**
 * Uji end-to-end endpoint panel yang baru (sekali pakai):
 * - /data/ringkas memuat hitungan presentasi
 * - POST /data/pengguna (buat akun) + validasi duplikat/peran
 * - daftar pengguna memuat punya_presentasi
 * - GET /data/pengguna/:id/presentasi-file menyajikan .pptx
 * Sesi panel dibuat langsung di DB (ua_hash dihitung dari UA uji).
 */
import crypto from "node:crypto";
import { q } from "../backend/src/db.js";
import * as store from "../backend/src/storage.js";

const BASE = process.env.DIAG_BASE || "http://localhost:4123";
const UA = "diag-panel-api/1.0";
const TOKEN = crypto.randomBytes(24).toString("hex");
const uaHash = crypto.createHash("sha256").update(UA).digest("hex");

// path panel dari meta
const meta = await q("SELECT nilai FROM meta WHERE kunci = 'admin'");
const PANEL = (meta[0] ? JSON.parse(meta[0].nilai).path : "/pusat-kendali") || "/pusat-kendali";

await q("INSERT INTO admin_sessions (token, exp, ua_hash) VALUES ($1, $2, $3)",
  [TOKEN, Date.now() + 10 * 60 * 1000, uaHash]);

const H = { Authorization: `Bearer ${TOKEN}`, "User-Agent": UA, "Content-Type": "application/json" };
const api = async (p, opt = {}) => {
  const res = await fetch(`${BASE}${PANEL}${p}`, { ...opt, headers: { ...H, ...(opt.headers || {}) } });
  let body = null; try { body = await res.json(); } catch {}
  return { status: res.status, body, res };
};

let lulus = 0, gagal = 0;
const cek = (nama, kondisi, info = "") => {
  if (kondisi) { lulus++; console.log(`  OK    ${nama}`); }
  else { gagal++; console.log(`  GAGAL ${nama} ${info}`); }
};

let uidBaru = "", uidPptx = "";
try {
  // ringkas memuat presentasi
  let r = await api("/data/ringkas");
  cek("ringkas memuat angka presentasi", r.status === 200 && typeof r.body.presentasi === "number",
    JSON.stringify(r.body));

  // buat akun baru
  const nama = `uji-panel-${Date.now().toString(36)}`;
  r = await api("/data/pengguna", { method: "POST", body: JSON.stringify({ username: nama, password: "Rahasia123!", role: "tim" }) });
  cek("buat akun tim lewat panel → 201", r.status === 201 && r.body.role === "tim", JSON.stringify(r.body));
  uidBaru = r.body?.id || "";

  r = await api("/data/pengguna", { method: "POST", body: JSON.stringify({ username: nama, password: "Rahasia123!", role: "tim" }) });
  cek("username duplikat → 409", r.status === 409);

  r = await api("/data/pengguna", { method: "POST", body: JSON.stringify({ username: nama + "x", password: "Rahasia123!", role: "hacker" }) });
  cek("peran tidak sah → 400", r.status === 400);

  r = await api("/data/pengguna", { method: "POST", body: JSON.stringify({ username: nama + "y", password: "pendek", role: "tim" }) });
  cek("password pendek → 400", r.status === 400);

  // presentasi: siapkan akun dengan .pptx + canva, cek flag & unduhan
  const u2 = await store.createUser(`uji-panel-pptx-${Date.now().toString(36)}`, "Rahasia123!", "tim");
  uidPptx = u2.id;
  const pptx = Buffer.alloc(1024, 0x20); pptx[0] = 0x50; pptx[1] = 0x4b; pptx[2] = 3; pptx[3] = 4;
  await store.savePresentasi(uidPptx, "materi-uji.pptx", pptx);
  await store.setCanvaPresentasi(uidPptx, "https://www.canva.com/design/DAFpanel1/tokenPanel/view");

  r = await api("/data/pengguna");
  const baris = (r.body?.users || []).find((x) => x.id === uidPptx);
  cek("daftar akun memuat punya_presentasi", !!baris && baris.punya_presentasi === true, JSON.stringify(baris || {}));

  // Tautan berkas (<a href>/<img>) tidak bisa mengirim header Authorization →
  // sesi dikenali lewat cookie HttpOnly `logbook_panel` (token di URL ?t=
  // sudah DIHAPUS karena bocor ke riwayat/log).
  const berkas = await fetch(`${BASE}${PANEL}/data/pengguna/${uidPptx}/presentasi-file`, {
    headers: { "User-Agent": UA, Cookie: `logbook_panel=${TOKEN}` } });
  const buf = Buffer.from(await berkas.arrayBuffer());
  cek("unduh .pptx lewat panel (cookie sesi)", berkas.ok && buf[0] === 0x50 && buf[1] === 0x4b, `${berkas.status} ${buf.length} B`);

  const tolak = await fetch(`${BASE}${PANEL}/data/pengguna/${uidPptx}/presentasi-file?t=${TOKEN}`, {
    headers: { "User-Agent": UA } });
  cek("token di query ?t= TIDAK lagi diterima → 401", tolak.status === 401, String(tolak.status));

  const det = await api(`/data/pengguna/${uidPptx}?senyap=1`);
  cek("detail akun memuat presentasi.file & canva",
    det.status === 200 && det.body.presentasi?.file?.ada && det.body.presentasi?.canva?.ada,
    JSON.stringify(det.body?.presentasi || {}));

  console.log(`\n== HASIL: ${lulus} lulus, ${gagal} gagal ==`);
} catch (e) {
  gagal++; console.error("ERROR:", e);
} finally {
  if (uidBaru) await store.deleteUser(uidBaru).catch(() => {});
  if (uidPptx) await store.deleteUser(uidPptx).catch(() => {});
  await q("DELETE FROM admin_sessions WHERE token = $1", [TOKEN]).catch(() => {});
  console.log("Data uji dibersihkan.");
  process.exit(gagal ? 1 : 0);
}

