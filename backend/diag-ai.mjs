/**
 * Diagnosa ASISTEN AI (server harus hidup di :4000, butuh internet ke Ollama):
 *  - unit: parseJsonModel toleran pembungkus; kataKunci lewat susunKonteks
 *  - susunKonteks: angka rekap benar (persen kategori, sisa dana), ukuran
 *    dibatasi, entri cocok kata kunci ikut masuk
 *  - GET /api/ai/status → aktif & model tersedia
 *  - GET/PUT /api/ai/model → pengguna memilih model sendiri; model asing
 *    ditolak, "auto" kembali ke bawaan, pilihan tersimpan dipakai otomatis
 *  - POST /api/ai/tanya (tim) → jawaban menyebut angka dari data
 *  - POST /api/ai/tanya tanpa pesan → 400
 *  - POST /api/ai/perbaiki-kegiatan → JSON { hasil, catatan, pertanyaan[] }
 *  - POST /api/ai/saran-belanja → sumber/kategori sah
 *  - pagar peran: akun fasilitator tanpa `tim` → 400; tim yang tak diampu → 403
 *
 * Jalankan dari folder backend:  node diag-ai.mjs
 */
import { q } from "./src/db.js";
import * as store from "./src/storage.js";
import { parseJsonModel, statusAI } from "./src/ai/klien.js";
import { susunKonteks } from "./src/ai/konteks.js";

const BASE = process.env.DIAG_BASE || "http://localhost:4000";
const suf = Date.now().toString(36);
const NAMA = `uji-ai-${suf}`;
const SANDI = "Rahasia123!";
const HJ = (tok) => ({ Authorization: `Bearer ${tok}`, "Content-Type": "application/json" });

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

await q("DELETE FROM login_fails WHERE kunci LIKE 'auth:register|%' OR kunci LIKE 'auth:login|%' OR kunci LIKE 'ai|%'");
let uid = "", fasId = "";
try {
  console.log("== Unit: parseJsonModel ==");
  cek("JSON murni", parseJsonModel('{"a":1}')?.a === 1);
  cek("dibungkus ```json", parseJsonModel('```json\n{"hasil":"x"}\n```')?.hasil === "x");
  cek("teks tambahan di sekitar", parseJsonModel('Berikut: {"s":"belmawa"} sekian')?.s === "belmawa");
  cek("bukan JSON → null", parseJsonModel("halo") === null);

  console.log("\n== Akun uji + data ==");
  let r = await jfetch("/api/auth/register", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: NAMA, password: SANDI }),
  });
  cek("daftar tim → 201", r.status === 201 && !!r.body?.token, JSON.stringify(r.body?.error || ""));
  const tok = r.body.token; uid = r.body.user.id;
  await store.setSetting(uid, "dana_belmawa", "10000000");
  await store.setSetting(uid, "dana_pt", "1500000");
  await store.addKeuangan(uid, { tanggal: "2026-07-02", item: "Sewa GPU cloud 10 jam", harga_satuan: 90000, satuan_suffix: "/jam", jumlah: 10, kode_unik: 123, bukti_keys: [], sumber: "belmawa", kategori: "sewa" });
  await store.addKeuangan(uid, { tanggal: "2026-07-05", item: "Kertas A4 dan tinta printer", harga_satuan: 250000, satuan_suffix: "", jumlah: 2, kode_unik: 0, bukti_keys: [], sumber: "belmawa", kategori: "bahan" });
  await store.addKeuangan(uid, { tanggal: "2026-08-01", item: "Transport ke lokasi mitra", harga_satuan: 50000, satuan_suffix: "", jumlah: 4, kode_unik: 0, bukti_keys: [], sumber: "pt", kategori: "" });
  await store.addKeuangan(uid, { tanggal: "2026-08-03", item: "Snack rapat", harga_satuan: 75000, satuan_suffix: "", jumlah: 1, kode_unik: 0, bukti_keys: [], sumber: "", kategori: "" });
  await store.addKegiatan(uid, { tanggal: "2026-07-01", kegiatan: "Rapat koordinasi awal tim bersama dosen pembimbing", capaian_delta: 5, waktu_menit: 90, foto_keys: [] });
  await store.addKegiatan(uid, { tanggal: "2026-07-10", kegiatan: "Melatih model klasifikasi memakai GPU sewaan", capaian_delta: 15, waktu_menit: 240, foto_keys: [] });

  console.log("\n== susunKonteks ==");
  const { teks, ringkas } = await susunKonteks(uid, { pertanyaan: "berapa biaya gpu?", namaTim: NAMA });
  cek("pengeluaran total = 1.675.123", ringkas.pengeluaran === 900123 + 500000 + 200000 + 75000, String(ringkas.pengeluaran));
  cek("sisa dana = 11.500.000 − pengeluaran", ringkas.sisa === 11500000 - ringkas.pengeluaran, String(ringkas.sisa));
  cek("persen sewa & jasa 9% dari Belmawa", /Sewa & jasa: terpakai Rp900\.123 = 9%/.test(teks), teks.match(/Sewa & jasa[^\n]*/)?.[0]);
  cek("bahan habis pakai 5%", /Bahan habis pakai: terpakai Rp500\.000 = 5%/.test(teks));
  cek("entri belum ditandai dilaporkan", /Belum ditandai sumber dananya: 1 entri, Rp75\.000/.test(teks));
  cek("kata kunci 'gpu' cocok kegiatan & belanja", /GPU sewaan/.test(teks) && /Sewa GPU cloud/.test(teks));
  cek("ukuran ≤ 9000 karakter", teks.length <= 9000, String(teks.length));
  const kecil = await susunKonteks(uid, { maksChar: 800 });
  cek("maksChar dihormati", kecil.teks.length <= 800 && /dipotong/.test(kecil.teks), String(kecil.teks.length));

  console.log("\n== /api/ai/status ==");
  const st = await statusAI();
  r = await jfetch("/api/ai/status", { headers: HJ(tok) });
  cek("status → 200 & aktif", r.status === 200 && r.body?.aktif === true, JSON.stringify(r.body));
  cek("server Ollama terjangkau", st.tersedia === true, JSON.stringify(st));
  cek(`model ${st.model} tersedia`, st.modelAda === true, JSON.stringify(st));

  console.log("\n== Pilihan model (ditentukan pengguna, bukan sistem) ==");
  await q("DELETE FROM login_fails WHERE kunci LIKE 'ai|%'");
  r = await jfetch("/api/ai/model", { headers: HJ(tok) });
  const daftar = r.body?.daftar || [];
  cek("daftar model → 200 & tidak kosong", r.status === 200 && daftar.length > 0, JSON.stringify(r.body).slice(0, 160));
  cek("bawaan = model pemasangan", r.body?.bawaan === st.model, `${r.body?.bawaan} vs ${st.model}`);
  cek("pilihan awal kosong (= Otomatis)", r.body?.pilihan === "", JSON.stringify(r.body?.pilihan));
  cek("model penyemat (embedding) tidak ikut ditawarkan",
    !daftar.some((m) => /embed|bge-m3/i.test(m.nama)), JSON.stringify(daftar.map((m) => m.nama)));
  cek("model awan ':cloud' (selalu 401 di server kampus) tidak ditawarkan",
    !daftar.some((m) => /:cloud$/i.test(m.nama)), JSON.stringify(daftar.map((m) => m.nama)));
  const berukuran = daftar.map((m) => m.ukuran).filter(Boolean);
  cek("daftar terurut dari model paling ringan",
    berukuran.every((u, i) => i === 0 || berukuran[i - 1] <= u), JSON.stringify(berukuran));
  const teringan = daftar[0]?.nama || "";
  console.log(`    → ${daftar.length} model, teringan: ${teringan}`);

  r = await jfetch("/api/ai/model", {
    method: "PUT", headers: HJ(tok), body: JSON.stringify({ model: "model-karangan:9z" }),
  });
  cek("simpan model yang tidak ada → 400", r.status === 400, String(r.status));
  r = await jfetch("/api/ai/model", { method: "PUT", headers: HJ(tok), body: JSON.stringify({ model: teringan }) });
  cek("simpan model pilihan → 200", r.status === 200 && r.body?.pilihan === teringan, JSON.stringify(r.body));
  r = await jfetch("/api/ai/model", { headers: HJ(tok) });
  cek("pilihan tersimpan terbaca kembali", r.body?.pilihan === teringan, JSON.stringify(r.body?.pilihan));

  const tanyaModel = (model) => jfetch("/api/ai/tanya", {
    method: "POST", headers: HJ(tok),
    body: JSON.stringify({ pesan: "Sebutkan total pengeluaran kami.", ...(model === undefined ? {} : { model }) }),
  });
  r = await tanyaModel(undefined);
  cek("tanya tanpa 'model' memakai pilihan tersimpan", r.body?.model === teringan, JSON.stringify(r.body?.model || r.body?.error));
  r = await tanyaModel("auto");
  cek('"auto" mengabaikan pilihan tersimpan → model bawaan', r.body?.model === st.model, JSON.stringify(r.body?.model || r.body?.error));
  r = await tanyaModel(st.model);
  cek("model yang diminta di permintaan dipakai apa adanya", r.body?.model === st.model, JSON.stringify(r.body?.model || r.body?.error));
  r = await tanyaModel("model-karangan:9z");
  cek("model asing pada permintaan → 400", r.status === 400, String(r.status));

  r = await jfetch("/api/ai/model", { method: "PUT", headers: HJ(tok), body: JSON.stringify({ model: "" }) });
  cek("kembali ke Otomatis", r.status === 200 && r.body?.pilihan === "", JSON.stringify(r.body));
  await q("DELETE FROM login_fails WHERE kunci LIKE 'ai|%'");

  console.log("\n== /api/ai/tanya ==");
  r = await jfetch("/api/ai/tanya", { method: "POST", headers: HJ(tok), body: JSON.stringify({ pesan: "" }) });
  cek("pesan kosong → 400", r.status === 400, String(r.status));
  r = await jfetch("/api/ai/tanya", {
    method: "POST", headers: HJ(tok),
    body: JSON.stringify({ pesan: "Berapa total pengeluaran kami dan berapa persen dana Belmawa terpakai untuk sewa & jasa? Jawab singkat dengan angka." }),
  });
  cek("tanya → 200 + jawaban", r.status === 200 && typeof r.body?.jawaban === "string" && r.body.jawaban.length > 20, JSON.stringify(r.body?.error || r.status));
  const jw = String(r.body?.jawaban || "");
  cek("jawaban menyebut angka dari data (1.675.123 / 900.123 / 9%)",
    /1\.675\.123|900\.123|9\s?%/.test(jw), jw.slice(0, 200).replace(/\n/g, " "));
  console.log("    →", jw.slice(0, 220).replace(/\n/g, " ") + (jw.length > 220 ? "…" : ""));
  r = await jfetch("/api/ai/tanya", {
    method: "POST", headers: HJ(tok),
    body: JSON.stringify({
      pesan: "Kalau begitu berapa sisanya?",
      riwayat: [{ role: "user", content: "Berapa dana Belmawa kami?" }, { role: "assistant", content: "Dana Belmawa Rp10.000.000." }],
    }),
  });
  cek("pertanyaan lanjutan dengan riwayat → 200", r.status === 200 && r.body?.jawaban, JSON.stringify(r.body?.error || r.status));

  console.log("\n== /api/ai/perbaiki-kegiatan ==");
  r = await jfetch("/api/ai/perbaiki-kegiatan", {
    method: "POST", headers: HJ(tok),
    body: JSON.stringify({ teks: "rapat sm dosen bahas bab 2 di lab", tanggal: "2026-07-12", gaya: "formal" }),
  });
  cek("perbaiki → 200 + hasil", r.status === 200 && typeof r.body?.hasil === "string" && r.body.hasil.length > 15, JSON.stringify(r.body?.error || r.status));
  cek("hasil berbeda dari teks asli & menyebut dosen/bab", r.body?.hasil !== "rapat sm dosen bahas bab 2 di lab" && /dosen|bab/i.test(r.body?.hasil || ""), r.body?.hasil);
  cek("pertanyaan berupa array", Array.isArray(r.body?.pertanyaan));
  console.log("    →", String(r.body?.hasil || "").slice(0, 200));
  r = await jfetch("/api/ai/perbaiki-kegiatan", { method: "POST", headers: HJ(tok), body: JSON.stringify({ teks: "a" }) });
  cek("teks terlalu pendek → 400", r.status === 400, String(r.status));

  console.log("\n== /api/ai/saran-belanja ==");
  r = await jfetch("/api/ai/saran-belanja", {
    method: "POST", headers: HJ(tok), body: JSON.stringify({ item: "Sewa server VPS 1 bulan", harga: 300000 }),
  });
  cek("saran → 200 + sumber sah", r.status === 200 && ["belmawa", "pt"].includes(r.body?.sumber), JSON.stringify(r.body));
  cek("kategori kosong bila pt, sah bila belmawa",
    r.body?.sumber === "pt" ? r.body?.kategori === "" : ["bahan", "sewa", "transport", "lain"].includes(r.body?.kategori), JSON.stringify(r.body));
  console.log("    →", r.body?.label, "—", r.body?.alasan);

  console.log("\n== Pagar peran (fasilitator) ==");
  // Kode pendaftaran tersimpan sebagai hash → akun pendamping dibuat langsung
  // lewat storage, lalu login biasa untuk memperoleh token.
  const fas = await store.createUser(`uji-ai-fas-${suf}`, SANDI, "fasilitator");
  fasId = fas.id;
  r = await jfetch("/api/auth/login", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: fas.username, password: SANDI }),
  });
  cek("login fasilitator → 200", r.status === 200 && !!r.body?.token, JSON.stringify(r.body?.error || ""));
  const tokF = r.body?.token;
  r = await jfetch("/api/ai/tanya", { method: "POST", headers: HJ(tokF), body: JSON.stringify({ pesan: "halo" }) });
  cek("fasilitator tanpa tim → 400", r.status === 400, String(r.status));
  r = await jfetch("/api/ai/tanya", { method: "POST", headers: HJ(tokF), body: JSON.stringify({ pesan: "halo", tim: uid }) });
  cek("fasilitator tim yang TIDAK diampu → 403", r.status === 403, String(r.status));
  r = await jfetch("/api/ai/perbaiki-kegiatan", { method: "POST", headers: HJ(tokF), body: JSON.stringify({ teks: "rapat tim" }) });
  cek("fasilitator perbaiki-kegiatan → 403 (hanyaTim)", r.status === 403, String(r.status));

  console.log(`\n== HASIL: ${lulus} lulus, ${gagal} gagal ==`);
} catch (err) {
  console.error("ERROR:", err);
  gagal++;
} finally {
  if (uid) await store.deleteUser(uid).catch(() => {});
  if (fasId) await store.deleteUser(fasId).catch(() => {});
  await q("DELETE FROM login_fails WHERE kunci LIKE 'ai|%'").catch(() => {});
  console.log("Data uji dibersihkan.");
  process.exit(gagal ? 1 : 0);
}


