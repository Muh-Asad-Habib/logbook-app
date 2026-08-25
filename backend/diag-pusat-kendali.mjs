/**
 * Uji end-to-end "Pusat Kendali v3" (sekali pakai):
 *  - sub-halaman ber-URL rapi (/akun, /sesi, /audit, /pengaturan) menyajikan panel
 *  - /data/audit menerima ?n= dan ?aksi= (saringan awalan, aman dari LIKE injection)
 *  - daftar pengguna memuat loginTerakhir & pengampu (nama fasilitator/dosen)
 *  - login mengisi users.last_login_at
 *  - /data/sesi memuat sesi akun uji beserta perannya
 * Sesi panel dibuat langsung di DB (ua_hash dihitung dari UA uji).
 */
import crypto from "node:crypto";
import { q } from "./src/db.js";
import * as store from "./src/storage.js";

const BASE = process.env.DIAG_BASE || "http://localhost:4123";
const UA = "diag-pusat-kendali/1.0";
const TOKEN = crypto.randomBytes(24).toString("hex");
const uaHash = crypto.createHash("sha256").update(UA).digest("hex");

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

let uidTim = "", uidFas = "";
try {
  /* ---- 1. Sub-halaman ber-URL rapi menyajikan dokumen panel ---- */
  for (const hal of ["", "/akun", "/sesi", "/audit", "/pengaturan"]) {
    const r = await fetch(`${BASE}${PANEL}${hal}`, { headers: { "User-Agent": UA } });
    const html = await r.text();
    cek(`GET ${PANEL}${hal || "/"} → panel HTML`,
      r.ok && html.includes('id="hal-sesi"') && html.includes("Pusat kendali"),
      `${r.status} ${html.length}B`);
  }

  /* ---- 2. Akun uji: tim + fasilitator yang mengampunya ---- */
  const cap = Date.now().toString(36);
  const tim = await store.createUser(`uji-pk-tim-${cap}`, "Rahasia123!", "tim");
  const fas = await store.createUser(`uji-pk-fas-${cap}`, "Rahasia123!", "fasilitator");
  uidTim = tim.id; uidFas = fas.id;
  await store.gantiTimFasilitator(fas.id, [tim.id]);

  /* ---- 3. Login mengisi last_login_at + sesi tampil di panel ---- */
  const sebelum = (await q("SELECT last_login_at FROM users WHERE id = $1", [tim.id]))[0];
  cek("akun baru: last_login_at masih kosong", !sebelum?.last_login_at, JSON.stringify(sebelum));

  await store.createSession(tim.id, {
    perangkat: "Chrome · Windows", ip: "203.0.•.•", ipPenuh: "203.0.113.7",
  });
  const sesudah = (await q("SELECT last_login_at FROM users WHERE id = $1", [tim.id]))[0];
  cek("createSession mengisi last_login_at", !!sesudah?.last_login_at, JSON.stringify(sesudah));

  /* ---- 4. Daftar pengguna: loginTerakhir + pengampu ---- */
  let r = await api("/data/pengguna");
  const barisTim = (r.body?.users || []).find((x) => x.id === tim.id);
  cek("daftar akun memuat loginTerakhir", !!barisTim?.loginTerakhir, JSON.stringify(barisTim?.loginTerakhir));
  cek("daftar akun memuat pengampu (nama pendamping)",
    Array.isArray(barisTim?.pengampu) && barisTim.pengampu.some((p) => p.id === fas.id && p.role === "fasilitator"),
    JSON.stringify(barisTim?.pengampu || []));

  /* ---- 5. Sesi lintas akun memuat peran & IP penuh ---- */
  r = await api("/data/sesi");
  const sesiTim = (r.body?.rows || []).find((s) => s.user_id === tim.id);
  cek("/data/sesi memuat sesi akun uji", !!sesiTim, JSON.stringify(sesiTim || {}));
  cek("sesi memuat peran & IP penuh",
    sesiTim?.role === "tim" && sesiTim?.ip === "203.0.113.7" && sesiTim?.penuh === true,
    JSON.stringify(sesiTim || {}));

  /* ---- 6. Audit: ?n= dan ?aksi= ---- */
  r = await api("/data/audit?n=5");
  cek("/data/audit?n=5 membatasi baris", r.status === 200 && (r.body.rows || []).length <= 5,
    String((r.body?.rows || []).length));

  r = await api("/data/audit?n=200&aksi=login.");
  const semuaLogin = (r.body?.rows || []).every((x) => String(x.aksi || "").startsWith("login."));
  cek("/data/audit?aksi=login. hanya mengembalikan aksi login", r.status === 200 && semuaLogin,
    JSON.stringify((r.body?.rows || []).slice(0, 3)));

  r = await api("/data/audit?n=10&aksi=%25' OR '1'='1");
  cek("saringan aksi menolak wildcard/injeksi (hasil kosong, bukan semua)",
    r.status === 200 && (r.body.rows || []).length === 0, JSON.stringify((r.body?.rows || []).length));

  console.log(`\n== HASIL: ${lulus} lulus, ${gagal} gagal ==`);
} catch (e) {
  gagal++; console.error("ERROR:", e);
} finally {
  if (uidTim) await store.deleteUser(uidTim).catch(() => {});
  if (uidFas) await store.deleteUser(uidFas).catch(() => {});
  await q("DELETE FROM admin_sessions WHERE token = $1", [TOKEN]).catch(() => {});
  console.log("Data uji dibersihkan.");
  process.exit(gagal ? 1 : 0);
}

