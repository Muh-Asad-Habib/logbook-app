/**
 * Diagnosa fitur PRESENTASI end-to-end (tim ↔ pendamping) terhadap server
 * lokal + Neon. Jalankan dari folder backend (server harus hidup):
 *
 *   node diag-presentasi.mjs                 # default http://localhost:4000
 *   $env:DIAG_BASE="http://localhost:4123"; node diag-presentasi.mjs
 *
 * Akun uji dibuat langsung lewat storage (tanpa kode pendaftaran, jadi
 * kode fasilitator/dosen milik deployment TIDAK tersentuh) dan dihapus lagi
 * di akhir — termasuk berkas .pptx-nya di ImageKit.
 */
import * as store from "./src/storage.js";

const BASE = process.env.DIAG_BASE || "http://localhost:4000";
const suf = Date.now().toString(36);
const NAMA_TIM = `uji-pres-tim-${suf}`;
const NAMA_DOS = `uji-pres-dos-${suf}`;
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

function pptxPalsu(tanda = 0x20) {
  const b = Buffer.alloc(1536, tanda);
  b[0] = 0x50; b[1] = 0x4b; b[2] = 0x03; b[3] = 0x04;
  return b;
}

const unggahPptx = async (tok, nama, isi) => {
  const fd = new FormData();
  fd.append("file", new Blob([isi]), nama);
  return jfetch("/api/presentasi", { method: "POST", headers: H(tok), body: fd });
};

let timId = "", dosId = "";
try {
  console.log("== Persiapan akun uji ==");
  const tim = await store.createUser(NAMA_TIM, SANDI, "tim");
  const dos = await store.createUser(NAMA_DOS, SANDI, "dosen");
  timId = tim.id; dosId = dos.id;
  await store.tambahPendampingKeTim(dosId, timId);
  const tokTim = await store.createSession(timId);
  const tokDos = await store.createSession(dosId);
  cek("akun tim & dosen pendamping siap", !!tokTim && !!tokDos);

  console.log("\n== Tim: unggah & tautkan ==");
  let r = await unggahPptx(tokTim, "materi.pptx", pptxPalsu());
  cek("tim unggah .pptx → 200", r.status === 200, JSON.stringify(r.body));

  r = await jfetch("/api/presentasi/canva", {
    method: "POST", headers: HJ(tokTim),
    body: JSON.stringify({ url: "https://www.canva.com/design/DAFuji123/tokenUJI_9/edit" }),
  });
  cek("tim simpan tautan Canva (dari link EDIT) → embed",
    r.status === 200 && r.body.url === "https://www.canva.com/design/DAFuji123/tokenUJI_9/view?embed",
    r.body?.url || "");

  r = await jfetch("/api/presentasi/canva", {
    method: "POST", headers: HJ(tokTim),
    body: JSON.stringify({ url: "https://canva.link/rdxh2vw7i6qshcp" }),
  });
  cek("tim simpan short-link canva.link → embed (butuh internet)",
    r.status === 200 &&
      /^https:\/\/www\.canva\.com\/design\/[^/]+\/[^/]+\/view\?embed$/.test(String(r.body?.url || "")),
    JSON.stringify(r.body));

  console.log("\n== Pagar peran ==");
  cek("dosen POST /api/presentasi → 403",
    (await unggahPptx(tokDos, "curang.pptx", pptxPalsu())).status === 403);
  cek("dosen GET /api/presentasi/info → 403",
    (await jfetch("/api/presentasi/info", { headers: H(tokDos) })).status === 403);
  cek("tim GET /api/fasilitator/tim → 403",
    (await jfetch("/api/fasilitator/tim", { headers: H(tokTim) })).status === 403);

  console.log("\n== Pendamping: baca presentasi tim ==");
  r = await jfetch(`/api/fasilitator/tim/${timId}/presentasi-info`, { headers: H(tokDos) });
  cek("dosen lihat info presentasi tim",
    r.status === 200 && r.body.file?.ada && r.body.canva?.ada, JSON.stringify(r.body));

  const berkas = await fetch(`${BASE}/api/fasilitator/tim/${timId}/presentasi-file?unduh=1`,
    { headers: H(tokDos) });
  const buf = Buffer.from(await berkas.arrayBuffer());
  cek("dosen unduh .pptx tim", berkas.ok && buf[0] === 0x50 && buf[1] === 0x4b, `${buf.length} B`);

  r = await jfetch(`/api/fasilitator/tim/${timId}/presentasi-tautan`,
    { method: "POST", headers: H(tokDos) });
  cek("dosen buat tautan penampil Office",
    r.status === 200 && String(r.body.url).includes("/api/presentasi/publik/"));
  if (r.body?.url) {
    const pub = await fetch(String(r.body.url).replace(/^https?:\/\/[^/]+/, BASE));
    cek("tautan publik dapat diambil Microsoft (tanpa login)", pub.ok, String(pub.status));
  }

  console.log("\n== Komentar & ACC (jenis 'presentasi') ==");
  r = await jfetch("/api/komentar", {
    method: "POST", headers: HJ(tokDos),
    body: JSON.stringify({ jenis: "presentasi", target_id: timId, tim: timId, isi: "Slide 3 kurang data." }),
  });
  cek("dosen komentar presentasi → 201", r.status === 201, JSON.stringify(r.body));
  const komentarId = r.body?.id;

  r = await jfetch(`/api/komentar?jenis=presentasi&target_id=${timId}`, { headers: H(tokTim) });
  cek("tim melihat komentar presentasi", r.status === 200 && r.body.length === 1);

  r = await jfetch("/api/komentar/belum-dibaca", { headers: H(tokTim) });
  cek("badge belum-dibaca punya kunci 'presentasi'",
    r.status === 200 && r.body.presentasi === 1, JSON.stringify(r.body));

  r = await jfetch("/api/persetujuan", {
    method: "PUT", headers: HJ(tokDos),
    body: JSON.stringify({ jenis: "presentasi", target_id: timId, tim: timId, status: "disetujui" }),
  });
  cek("dosen ACC presentasi → 200", r.status === 200, JSON.stringify(r.body));

  r = await jfetch("/api/persetujuan?jenis=presentasi", { headers: H(tokTim) });
  cek("tim melihat status 'disetujui'", r.body?.[timId]?.status === "disetujui");

  r = await jfetch("/api/persetujuan/ringkas", { headers: H(tokTim) });
  cek("rekap ACC memuat baris presentasi",
    r.body?.presentasi?.total === 1 && r.body?.presentasi?.disetujui === 1,
    JSON.stringify(r.body?.presentasi));

  console.log("\n== ACC otomatis batal saat presentasi diganti ==");
  await unggahPptx(tokTim, "materi-revisi.pptx", pptxPalsu(0x21));
  r = await jfetch("/api/persetujuan?jenis=presentasi", { headers: H(tokTim) });
  cek("ganti .pptx → status kembali 'menunggu'", !r.body?.[timId]);

  r = await jfetch("/api/persetujuan", {
    method: "PUT", headers: HJ(tokDos),
    body: JSON.stringify({ jenis: "presentasi", target_id: timId, tim: timId, status: "disetujui" }),
  });
  cek("ACC ulang setelah revisi → 200", r.status === 200);
  await jfetch("/api/presentasi/canva", { method: "POST", headers: HJ(tokTim),
    body: JSON.stringify({ url: "https://www.canva.com/design/DAFbaru77/tokenBARU/view" }) });
  r = await jfetch("/api/persetujuan?jenis=presentasi", { headers: H(tokTim) });
  cek("ganti tautan Canva → status kembali 'menunggu'", !r.body?.[timId]);

  console.log("\n== Hapus terpisah ==");
  cek("hapus berkas .pptx → 200",
    (await jfetch("/api/presentasi/file", { method: "DELETE", headers: H(tokTim) })).status === 200);
  r = await jfetch("/api/presentasi/info", { headers: H(tokTim) });
  cek("Canva tetap ada setelah .pptx dihapus", r.body.ada && !r.body.file.ada && r.body.canva.ada);
  cek("unduh .pptx yang sudah dihapus → 404",
    (await jfetch("/api/presentasi/file", { headers: H(tokTim) })).status === 404);
  cek("hapus tautan Canva → 200",
    (await jfetch("/api/presentasi/canva", { method: "DELETE", headers: H(tokTim) })).status === 200);
  r = await jfetch("/api/presentasi/info", { headers: H(tokTim) });
  cek("presentasi kosong setelah keduanya dihapus", r.body.ada === false);

  if (komentarId) {
    await jfetch(`/api/komentar/${komentarId}`, { method: "DELETE", headers: H(tokDos) });
  }
  console.log(`\n== HASIL: ${lulus} lulus, ${gagal} gagal ==`);
} catch (e) {
  gagal += 1;
  console.error("ERROR:", e);
} finally {
  if (timId) await store.deleteUser(timId).catch(() => {});
  if (dosId) await store.deleteUser(dosId).catch(() => {});
  console.log("Akun uji dibersihkan.");
  process.exit(gagal ? 1 : 0);
}

