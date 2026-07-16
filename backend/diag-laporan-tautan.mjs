/**
 * Uji tautan publik penampil Office:
 * unggah → buat tautan → GET /publik TANPA login (byte utuh) →
 * kunci salah ditolak → kedaluwarsa ditolak → bersih-bersih.
 * Jalankan: node backend/diag-laporan-tautan.mjs
 */
process.env.VERCEL = "1";
import http from "node:http";
import crypto from "node:crypto";
import { q } from "./src/db.js";
import * as store from "./src/storage.js";

const { default: app } = await import("./src/server.js");
const server = http.createServer(app);
await new Promise((r) => server.listen(0, r));
const BASE = `http://127.0.0.1:${server.address().port}`;

let gagal = 0;
const cek = (nama, kondisi, detail = "") => {
  console.log(`${kondisi ? "[LULUS]" : "[GAGAL]"} ${nama}${kondisi ? "" : " — " + detail}`);
  if (!kondisi) gagal += 1;
};

const user = await store.createUser("uji-tautan-" + crypto.randomBytes(3).toString("hex"), "sandi-uji-123");
const token = await store.createSession(user.id);
const H = { Authorization: `Bearer ${token}` };

try {
  const dok = Buffer.concat([Buffer.from("PK\x03\x04"), Buffer.alloc(80 * 1024, 5)]);
  const fd = new FormData();
  fd.append("file", new Blob([dok]), "laporan.docx");
  let r = await fetch(`${BASE}/api/laporan`, { method: "POST", headers: H, body: fd });
  cek("unggah laporan", r.ok, `status=${r.status}`);

  // buat tautan publik
  r = await fetch(`${BASE}/api/laporan/tautan`, { method: "POST", headers: H });
  const { url, exp } = await r.json();
  cek("buat tautan 200 + ada url & exp", r.ok && /\/api\/laporan\/publik\/[a-f0-9]{48}$/.test(url) && exp > Date.now(), `url=${url}`);

  // GET publik TANPA login → byte utuh
  const kunci = url.split("/").pop();
  r = await fetch(`${BASE}/api/laporan/publik/${kunci}`);
  const isi = Buffer.from(await r.arrayBuffer());
  cek("akses publik tanpa login: byte sama persis", r.ok && isi.equals(dok), `status=${r.status}`);
  cek("content-type docx",
    (r.headers.get("content-type") || "").includes("officedocument.wordprocessingml.document"));

  // kunci salah → ditolak
  r = await fetch(`${BASE}/api/laporan/publik/${"0".repeat(48)}`);
  cek("kunci salah ditolak 404", r.status === 404);
  r = await fetch(`${BASE}/api/laporan/publik/pendek`);
  cek("kunci format salah ditolak 400", r.status === 400);

  // kedaluwarsa → ditolak
  await q("UPDATE laporan_links SET exp = $1 WHERE kunci = $2", [Date.now() - 1000, kunci]);
  r = await fetch(`${BASE}/api/laporan/publik/${kunci}`);
  cek("tautan kedaluwarsa ditolak 404", r.status === 404);

  // tautan baru menggantikan yang lama (satu tautan aktif per user)
  await fetch(`${BASE}/api/laporan/tautan`, { method: "POST", headers: H });
  await fetch(`${BASE}/api/laporan/tautan`, { method: "POST", headers: H });
  const n = await q("SELECT COUNT(*) AS n FROM laporan_links WHERE user_id = $1", [user.id]);
  cek("hanya SATU tautan aktif per user", Number(n[0].n) === 1);
} finally {
  await q("DELETE FROM laporan_links WHERE user_id = $1", [user.id]).catch(() => {});
  await q("DELETE FROM laporan_docx WHERE user_id = $1", [user.id]).catch(() => {});
  await q("DELETE FROM sessions WHERE user_id = $1", [user.id]).catch(() => {});
  await q("DELETE FROM aktivitas WHERE user_id = $1", [user.id]).catch(() => {});
  await q("DELETE FROM users WHERE id = $1", [user.id]).catch(() => {});
  server.close();
}

console.log(gagal ? `\n${gagal} PENGUJIAN GAGAL` : "\nSEMUA PENGUJIAN LULUS");
process.exit(gagal ? 1 : 0);

