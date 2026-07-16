/**
 * Uji end-to-end HTTP rute /api/laporan (server Express in-process + DB asli):
 * login → unggah kecil → info → ambil file → unggah CHUNKED (mengganti) →
 * pastikan hanya 1 file → hapus → bersih-bersih user uji.
 * Jalankan: node backend/diag-laporan-http.mjs
 */
process.env.VERCEL = "1"; // cegah app.listen() otomatis
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

// --- user + sesi uji langsung di DB ---
const uname = "uji-laporan-" + crypto.randomBytes(3).toString("hex");
const user = await store.createUser(uname, "sandi-uji-123");
const token = await store.createSession(user.id);
const H = { Authorization: `Bearer ${token}` };

try {
  // dokumen docx palsu (header ZIP) — kecil & besar (5 MB → jalur chunked)
  const kecil = Buffer.concat([Buffer.from("PK\x03\x04"), Buffer.alloc(50 * 1024, 7)]);
  const besar = Buffer.concat([Buffer.from("PK\x03\x04"), Buffer.alloc(5 * 1024 * 1024, 9)]);

  // 1. unggah kecil (multipart satu request)
  const fd = new FormData();
  fd.append("file", new Blob([kecil]), "laporan-mei.docx");
  let r = await fetch(`${BASE}/api/laporan`, { method: "POST", headers: H, body: fd });
  let j = await r.json();
  cek("unggah kecil 200 + nama benar", r.ok && j.nama === "laporan-mei.docx",
    `status=${r.status} body=${JSON.stringify(j).slice(0, 200)}`);

  // 2. info
  r = await fetch(`${BASE}/api/laporan/info`, { headers: H });
  j = await r.json();
  cek("info: ada, ukuran cocok", j.ada && j.ukuran === kecil.length);

  // 3. ambil file → byte utuh
  r = await fetch(`${BASE}/api/laporan/file`, { headers: H });
  const isi = Buffer.from(await r.arrayBuffer());
  cek("ambil file: byte sama persis", r.ok && isi.equals(kecil));

  // 4. unggah BESAR via chunked → harus MENGGANTI
  const CHUNK = 2 * 1024 * 1024;
  const id = "up-uji-" + crypto.randomBytes(4).toString("hex");
  const total = Math.ceil(besar.length / CHUNK);
  for (let i = 0; i < total; i++) {
    const b64 = besar.subarray(i * CHUNK, (i + 1) * CHUNK).toString("base64");
    r = await fetch(`${BASE}/api/laporan/chunk`, {
      method: "POST", headers: { ...H, "Content-Type": "application/json" },
      body: JSON.stringify({ id, idx: i, data: b64 }),
    });
    if (!r.ok) break;
  }
  r = await fetch(`${BASE}/api/laporan/selesai`, {
    method: "POST", headers: { ...H, "Content-Type": "application/json" },
    body: JSON.stringify({ id, total, nama: "laporan-juli.docx" }),
  });
  j = await r.json();
  cek("unggah chunked 5 MB berhasil", r.ok && j.ok);

  r = await fetch(`${BASE}/api/laporan/info`, { headers: H });
  j = await r.json();
  cek("laporan LAMA tergantikan (nama & ukuran baru)",
    j.nama === "laporan-juli.docx" && j.ukuran === besar.length);

  const n = await q("SELECT COUNT(*) AS n FROM laporan_docx WHERE user_id = $1", [user.id]);
  cek("hanya SATU file tersimpan", Number(n[0].n) === 1);

  // 5. file bukan docx ditolak
  const fdJelek = new FormData();
  fdJelek.append("file", new Blob([Buffer.from("bukan docx")]), "jelek.docx");
  r = await fetch(`${BASE}/api/laporan`, { method: "POST", headers: H, body: fdJelek });
  cek("berkas non-docx ditolak 400", r.status === 400);

  // 6. tanpa token ditolak
  r = await fetch(`${BASE}/api/laporan/info`);
  cek("tanpa login ditolak 401", r.status === 401);

  // 7. hapus
  r = await fetch(`${BASE}/api/laporan`, { method: "DELETE", headers: H });
  cek("hapus laporan 200", r.ok);
} finally {
  // bersih-bersih user uji
  await q("DELETE FROM laporan_docx WHERE user_id = $1", [user.id]).catch(() => {});
  await q("DELETE FROM sessions WHERE user_id = $1", [user.id]).catch(() => {});
  await q("DELETE FROM aktivitas WHERE user_id = $1", [user.id]).catch(() => {});
  await q("DELETE FROM users WHERE id = $1", [user.id]).catch(() => {});
  server.close();
}

console.log(gagal ? `\n${gagal} PENGUJIAN GAGAL` : "\nSEMUA PENGUJIAN LULUS");
process.exit(gagal ? 1 : 0);


