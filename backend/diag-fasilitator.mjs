/**
 * Diagnosa fitur PENDAMPING (fasilitator & dosen) end-to-end terhadap
 * server lokal + Neon. Jalankan: node diag-fasilitator.mjs
 * (server harus hidup di :4000)
 *
 * Alur: set kode → daftar tim & fasilitator → pagar tulis → assignment →
 * baca data tim → komentar induk → balasan tim → edit → selesai →
 * belum-dibaca → hapus → ACC dosen (revisi → batal otomatis saat entri
 * diubah → disetujui) → gabung tim lewat KODE TIM (cetak ulang, keluarkan,
 * keluar sendiri) → bersih-bersih akun uji.
 */
import { hashPassword } from "./src/passwords.js";
import * as store from "./src/storage.js";
import { q } from "./src/db.js";

const BASE = process.env.DIAG_BASE || "http://localhost:4000";
const suf = Date.now().toString(36);
const TIM = `uji-tim-${suf}`;
const FAS = `uji-fas-${suf}`;
const DOS = `uji-dos-${suf}`;
const KODE = "kode-uji-123";
const KODE_DOSEN = "kode-dosen-uji-123";

const jfetch = async (path, opt = {}) => {
  const res = await fetch(`${BASE}${path}`, opt);
  let body = null;
  try { body = await res.json(); } catch {}
  return { status: res.status, body };
};
const H = (tok) => ({ "Content-Type": "application/json", Authorization: `Bearer ${tok}` });
let lulus = 0, gagal = 0;
const cek = (nama, kondisi, info = "") => {
  if (kondisi) { lulus++; console.log(`  ✅ ${nama}`); }
  else { gagal++; console.log(`  ❌ ${nama} ${info}`); }
};

let timId = "", fasId = "", dosId = "";
try {
  console.log("== Persiapan ==");
  const adaKode = await store.getMeta("kodeFasilitator");
  const adaKodeDosen = await store.getMeta("kodeDosen");
  await store.setMeta("kodeFasilitator", hashPassword(KODE));
  await store.setMeta("kodeDosen", hashPassword(KODE_DOSEN));

  // 1. Daftar akun
  const rTim = await jfetch("/api/auth/register", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: TIM, password: "rahasia123" }),
  });
  cek("daftar tim 201 + role tim", rTim.status === 201 && rTim.body.user.role === "tim");
  timId = rTim.body.user.id;
  const tokTim = rTim.body.token;

  const rSalah = await jfetch("/api/auth/register", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: FAS, password: "rahasia123", sebagai_fasilitator: true, kode_fasilitator: "salah" }),
  });
  cek("daftar fasilitator kode salah → 401", rSalah.status === 401);

  const rFas = await jfetch("/api/auth/register", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: FAS, password: "rahasia123", sebagai_fasilitator: true, kode_fasilitator: KODE }),
  });
  cek("daftar fasilitator kode benar → 201 + role", rFas.status === 201 && rFas.body.user.role === "fasilitator");
  fasId = rFas.body.user.id;
  const tokFas = rFas.body.token;

  console.log("== Pagar tulis ==");
  cek("fas GET /api/kegiatan → 403", (await jfetch("/api/kegiatan", { headers: H(tokFas) })).status === 403);
  cek("fas GET /api/statistik → 403", (await jfetch("/api/statistik", { headers: H(tokFas) })).status === 403);
  cek("fas GET /api/export/info → 403", (await jfetch("/api/export/info", { headers: H(tokFas) })).status === 403);
  cek("fas GET /api/laporan/info → 403", (await jfetch("/api/laporan/info", { headers: H(tokFas) })).status === 403);
  cek("tim GET /api/fasilitator/tim → 403", (await jfetch("/api/fasilitator/tim", { headers: H(tokTim) })).status === 403);

  console.log("== Assignment ==");
  const rKosong = await jfetch("/api/fasilitator/tim", { headers: H(tokFas) });
  cek("fas belum di-assign → daftar tim kosong", rKosong.status === 200 && rKosong.body.length === 0);

  const keg = await store.addKegiatan(timId, {
    tanggal: "2026-07-17", kegiatan: "Uji coba fitur fasilitator",
    capaian_delta: 5, waktu_menit: 30, foto_keys: [],
  });
  cek("fas akses tim belum di-assign → 403",
    (await jfetch(`/api/fasilitator/tim/${timId}/kegiatan`, { headers: H(tokFas) })).status === 403);

  await store.gantiTimFasilitator(fasId, [timId]);
  const rTimList = await jfetch("/api/fasilitator/tim", { headers: H(tokFas) });
  cek("setelah assign → tim tampil", rTimList.status === 200 && rTimList.body[0]?.id === timId);

  const rKeg = await jfetch(`/api/fasilitator/tim/${timId}/kegiatan`, { headers: H(tokFas) });
  cek("fas baca kegiatan tim", rKeg.status === 200 && rKeg.body.length === 1);
  const rRingkas = await jfetch(`/api/fasilitator/tim/${timId}/ringkasan`, { headers: H(tokFas) });
  cek("ringkasan tim (statistik+kegiatan terakhir)",
    rRingkas.status === 200 && rRingkas.body.statistik.jumlah_kegiatan === 1 &&
    rRingkas.body.kegiatan_terakhir.length === 1);

  const rMe = await jfetch("/api/auth/me", { headers: H(tokFas) });
  cek("/me fasilitator sertakan tim", rMe.body.user.role === "fasilitator" && rMe.body.tim?.length === 1);

  console.log("== Komentar 2 arah ==");
  const rTimMulai = await jfetch("/api/komentar", {
    method: "POST", headers: H(tokTim),
    body: JSON.stringify({ jenis: "kegiatan", target_id: keg.id, isi: "halo" }),
  });
  cek("tim mulai thread → 403", rTimMulai.status === 403);

  const rKom = await jfetch("/api/komentar", {
    method: "POST", headers: H(tokFas),
    body: JSON.stringify({ jenis: "kegiatan", target_id: keg.id, tim: timId, isi: "Deskripsi kegiatannya kurang detail" }),
  });
  cek("fas komentar induk → 201", rKom.status === 201 && rKom.body.penulis_role === "fasilitator");
  const komId = rKom.body.id;

  const rBelum = await jfetch("/api/komentar/belum-dibaca", { headers: H(tokTim) });
  cek("badge tim: 1 belum dibaca di kegiatan", rBelum.body.kegiatan === 1 && rBelum.body.total === 1);

  const rList = await jfetch(`/api/komentar?jenis=kegiatan&target_id=${keg.id}`, { headers: H(tokTim) });
  cek("tim lihat komentar", rList.status === 200 && rList.body.length === 1);

  const rBalas = await jfetch("/api/komentar", {
    method: "POST", headers: H(tokTim),
    body: JSON.stringify({ jenis: "kegiatan", target_id: keg.id, parent_id: komId, isi: "Siap, kami perbaiki" }),
  });
  cek("tim balas → 201", rBalas.status === 201 && rBalas.body.parent_id === komId);

  const rFasBelum = await jfetch("/api/komentar/belum-dibaca", { headers: H(tokFas) });
  cek("badge fasilitator: 1 balasan belum dibaca", rFasBelum.body.kegiatan === 1);

  await jfetch("/api/komentar/tandai-dibaca", {
    method: "POST", headers: H(tokFas), body: JSON.stringify({ ids: [rBalas.body.id] }),
  });
  const rFasBelum2 = await jfetch("/api/komentar/belum-dibaca", { headers: H(tokFas) });
  cek("setelah tandai-dibaca → 0", rFasBelum2.body.total === 0);

  const rEditLain = await jfetch(`/api/komentar/${komId}`, {
    method: "PUT", headers: H(tokTim), body: JSON.stringify({ isi: "hack" }),
  });
  cek("tim edit komentar fasilitator → 403", rEditLain.status === 403);

  const rEdit = await jfetch(`/api/komentar/${komId}`, {
    method: "PUT", headers: H(tokFas), body: JSON.stringify({ isi: "Deskripsi kegiatan mohon diperinci" }),
  });
  cek("fas edit milik sendiri → edited_at (label diedit)", rEdit.status === 200 && rEdit.body.edited_at !== "");

  const rSelesaiFas = await jfetch(`/api/komentar/${komId}/selesai`, {
    method: "PUT", headers: H(tokFas), body: JSON.stringify({ selesai: true }),
  });
  cek("fas tandai selesai → 403 (hanya tim)", rSelesaiFas.status === 403);
  const rSelesai = await jfetch(`/api/komentar/${komId}/selesai`, {
    method: "PUT", headers: H(tokTim), body: JSON.stringify({ selesai: true }),
  });
  cek("tim tandai selesai → ok", rSelesai.status === 200 && rSelesai.body.selesai === true);

  const rJumlah = await jfetch(`/api/komentar/jumlah?jenis=kegiatan&tim=${timId}`, { headers: H(tokFas) });
  cek("jumlah komentar per target = 2", rJumlah.body[keg.id] === 2);

  const rHapus = await jfetch(`/api/komentar/${komId}`, { method: "DELETE", headers: H(tokFas) });
  cek("hapus induk → balasan ikut (2 terhapus)", rHapus.status === 200 && rHapus.body.terhapus === 2);

  console.log("== ACC dosen pendamping ==");
  const rDosSalah = await jfetch("/api/auth/register", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: DOS, password: "rahasia123", peran: "dosen", kode_dosen: "salah" }),
  });
  cek("daftar dosen kode salah → 401", rDosSalah.status === 401);

  const rDos = await jfetch("/api/auth/register", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: DOS, password: "rahasia123", peran: "dosen", kode_dosen: KODE_DOSEN }),
  });
  cek("daftar dosen kode benar → 201 + role dosen",
    rDos.status === 201 && rDos.body.user.role === "dosen");
  dosId = rDos.body.user.id;
  const tokDos = rDos.body.token;

  cek("dosen GET /api/kegiatan → 403 (pagar tulis sama)",
    (await jfetch("/api/kegiatan", { headers: H(tokDos) })).status === 403);

  await store.gantiTimFasilitator(dosId, [timId]);
  const accBody = (isi) => JSON.stringify({ jenis: "kegiatan", target_id: keg.id, tim: timId, ...isi });

  cek("fasilitator PUT /api/persetujuan → 403 (hanya dosen)",
    (await jfetch("/api/persetujuan", {
      method: "PUT", headers: H(tokFas), body: accBody({ status: "disetujui" }),
    })).status === 403);

  cek("tim PUT /api/persetujuan → 403",
    (await jfetch("/api/persetujuan", {
      method: "PUT", headers: H(tokTim),
      body: JSON.stringify({ jenis: "kegiatan", target_id: keg.id, status: "disetujui" }),
    })).status === 403);

  cek("revisi tanpa catatan → 400",
    (await jfetch("/api/persetujuan", {
      method: "PUT", headers: H(tokDos), body: accBody({ status: "revisi" }),
    })).status === 400);

  const rRevisi = await jfetch("/api/persetujuan", {
    method: "PUT", headers: H(tokDos),
    body: accBody({ status: "revisi", catatan: "Lampirkan foto dokumentasi" }),
  });
  cek("dosen minta revisi + catatan → 200", rRevisi.status === 200 && rRevisi.body.status === "revisi");

  const rLihatTim = await jfetch("/api/persetujuan?jenis=kegiatan", { headers: H(tokTim) });
  cek("tim melihat status revisi + catatan",
    rLihatTim.body[keg.id]?.status === "revisi" &&
    rLihatTim.body[keg.id]?.catatan === "Lampirkan foto dokumentasi" &&
    rLihatTim.body[keg.id]?.dosen_username === DOS);

  await store.updateKegiatan(timId, keg.id, { kegiatan: "Uji coba fitur pendamping (revisi)" });
  const rSetelahEdit = await jfetch("/api/persetujuan?jenis=kegiatan", { headers: H(tokTim) });
  cek("tim mengubah entri → status kembali menunggu", !rSetelahEdit.body[keg.id]);

  const rSetuju = await jfetch("/api/persetujuan", {
    method: "PUT", headers: H(tokDos), body: accBody({ status: "disetujui" }),
  });
  cek("dosen ACC → disetujui", rSetuju.status === 200 && rSetuju.body.status === "disetujui");

  const rRekap = await jfetch(`/api/persetujuan/ringkas?tim=${timId}`, { headers: H(tokDos) });
  cek("rekap ACC: 1 disetujui, 0 revisi",
    rRekap.body.total_disetujui === 1 && rRekap.body.total_revisi === 0 &&
    rRekap.body.kegiatan.disetujui === 1);

  const rBatal = await jfetch("/api/persetujuan", {
    method: "PUT", headers: H(tokDos), body: accBody({ status: "menunggu" }),
  });
  cek("dosen batalkan ACC → menunggu", rBatal.status === 200 && rBatal.body.status === "menunggu");

  cek("dosen ACC tim yang tidak diampu → 403",
    (await jfetch("/api/persetujuan", {
      method: "PUT", headers: H(tokDos),
      body: JSON.stringify({ jenis: "kegiatan", target_id: keg.id, tim: dosId, status: "disetujui" }),
    })).status === 403);

  console.log("== Gabung lewat kode tim (tanpa admin) ==");
  const rKode = await jfetch("/api/tim/kode", { headers: H(tokTim) });
  cek("tim melihat kodenya (8 karakter)",
    rKode.status === 200 && String(rKode.body.kode || "").length === 8);
  cek("pendamping tidak punya kode tim → 403",
    (await jfetch("/api/tim/kode", { headers: H(tokFas) })).status === 403);
  cek("kode tim tidak bisa ditulis lewat /api/pengaturan → 403",
    (await jfetch("/api/pengaturan/kode_tim", {
      method: "PUT", headers: H(tokTim), body: JSON.stringify({ nilai: "TEBAKAN1" }),
    })).status === 403);

  // Lepas assignment yang tadi dipasang "admin" supaya alur kode benar-benar diuji
  await store.hapusPendampingDariTim(fasId, timId);
  cek("kode ngawur → 404",
    (await jfetch("/api/fasilitator/gabung", {
      method: "POST", headers: H(tokFas), body: JSON.stringify({ kode: "ZZZZ-9999" }),
    })).status === 404);

  const rGabung = await jfetch("/api/fasilitator/gabung", {
    method: "POST", headers: H(tokFas),
    body: JSON.stringify({ kode: String(rKode.body.kode_tampil).toLowerCase() }),
  });
  cek("gabung pakai kode (huruf kecil + tanda hubung) → 201",
    rGabung.status === 201 && rGabung.body.tim?.id === timId && rGabung.body.baru === true);
  cek("fas bisa baca data tim setelah gabung",
    (await jfetch(`/api/fasilitator/tim/${timId}/kegiatan`, { headers: H(tokFas) })).status === 200);

  const rUlang = await jfetch("/api/fasilitator/gabung", {
    method: "POST", headers: H(tokFas), body: JSON.stringify({ kode: rKode.body.kode }),
  });
  cek("gabung ulang → 200 & tidak ganda", rUlang.status === 200 && rUlang.body.baru === false);

  const rDaftar = await jfetch("/api/tim/pendamping", { headers: H(tokTim) });
  cek("tim melihat daftar pendampingnya",
    rDaftar.status === 200 && rDaftar.body.some((p) => p.id === fasId));

  const kodeLama = rKode.body.kode;
  const rBaru = await jfetch("/api/tim/kode/reset", { method: "POST", headers: H(tokTim) });
  cek("cetak ulang kode → kode berubah", rBaru.status === 200 && rBaru.body.kode !== kodeLama);

  // Dosen masih ter-assign dari blok ACC (jalur pusat kendali) → keluar dulu
  // supaya jalur "gabung lewat kode" benar-benar teruji dari nol.
  cek("dosen keluar sendiri dari tim → 200",
    (await jfetch(`/api/fasilitator/tim/${timId}`, { method: "DELETE", headers: H(tokDos) })).status === 200);
  cek("setelah keluar → daftar tim dosen kosong",
    (await jfetch("/api/fasilitator/tim", { headers: H(tokDos) })).body.length === 0);
  cek("kode lama tidak berlaku lagi → 404",
    (await jfetch("/api/fasilitator/gabung", {
      method: "POST", headers: H(tokDos), body: JSON.stringify({ kode: kodeLama }),
    })).status === 404);
  cek("dosen gabung pakai kode baru → 201",
    (await jfetch("/api/fasilitator/gabung", {
      method: "POST", headers: H(tokDos), body: JSON.stringify({ kode: rBaru.body.kode }),
    })).status === 201);

  cek("tim mengeluarkan pendamping → 200",
    (await jfetch(`/api/tim/pendamping/${fasId}`, { method: "DELETE", headers: H(tokTim) })).status === 200);
  cek("setelah dikeluarkan → akses data tim 403",
    (await jfetch(`/api/fasilitator/tim/${timId}/kegiatan`, { headers: H(tokFas) })).status === 403);
  cek("keluarkan orang yang bukan pendamping → 404",
    (await jfetch(`/api/tim/pendamping/${fasId}`, { method: "DELETE", headers: H(tokTim) })).status === 404);


  console.log(`\n== HASIL: ${lulus} lulus, ${gagal} gagal ==`);
  if (!adaKode) {
    // kode belum pernah diset sebelum uji — kembalikan ke keadaan semula
    await q("DELETE FROM meta WHERE kunci IN ('kodeFasilitator','kodeFasilitatorUpdatedAt')");
  }
  if (!adaKodeDosen) {
    await q("DELETE FROM meta WHERE kunci IN ('kodeDosen','kodeDosenUpdatedAt')");
  }
} finally {
  // Bersih-bersih akun uji beserta seluruh datanya
  if (timId) await store.deleteUser(timId).catch(() => {});
  if (fasId) await store.deleteUser(fasId).catch(() => {});
  if (dosId) await store.deleteUser(dosId).catch(() => {});
  console.log("Akun uji dibersihkan.");
  process.exit(gagal ? 1 : 0);
}

