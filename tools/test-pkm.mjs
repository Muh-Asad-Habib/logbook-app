import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import express, { Router } from 'express';
import { bacaProfilPkm, cariPengetahuanPkm, validasiProfilPkm, KUNCI_PROFIL_PKM, SKEMA_PKM, SUMBER_PKM } from '../backend/src/ai/pengetahuan-pkm.js';
import { PENGETAHUAN_PKM } from '../backend/src/ai/pkm-knowledge.js';
import { rekapDana, LABEL_SUMBER, LABEL_KATEGORI, KATEGORI_PKM } from '../backend/src/export/pkm.js';

// Jalankan modul konteks/rute dengan dependensi tiruan: tidak mengimpor db/config/.env.
const contextCode = (await readFile(new URL('../backend/src/ai/konteks.js', import.meta.url), 'utf8')).replace(/^import .*;\r?$/gm, '').replace(/export /g, '');
const routeCode = (await readFile(new URL('../backend/src/routes/ai.js', import.meta.url), 'utf8')).replace(/^import .*;\r?$/gm, '').replace('export default router;', 'globalThis.router = router;');

function fixture() {
  const settings = new Map();
  let messages;
  const rows = [{ id: 'k1', tanggal: '2026-08-01', kegiatan: 'Pelaksanaan PKM-PM bersama mitra.', waktu_menit: 60, capaian_delta: 10, capaian_total: 10, foto_keys: [] }];
  const store = {
    getSetting: async (id, key, fallback) => settings.get(`${id}:${key}`) ?? fallback,
    setSetting: async (id, key, value) => settings.set(`${id}:${key}`, value),
    listKegiatan: async () => rows,
    listKeuangan: async () => [{ id: 'b1', tanggal: '2026-08-01', item: 'Sewa alat', harga_satuan: 1500000, jumlah: 1, total: 1500000, sumber: 'belmawa', kategori: 'sewa' }],
    hitungDana: async () => ({ belmawa: 6000000, pt: 2000000, total: 8000000 }),
    bolehAksesTim: async (id, tim) => id === 'dosen-a' && tim === 'tim-a',
    getUserById: async (id) => ({ id, username: 'Tim uji', role: 'tim' }),
  };
  const sandbox = { store, rekapDana, LABEL_SUMBER, LABEL_KATEGORI, bacaProfilPkm, KUNCI_PROFIL_PKM };
  vm.runInNewContext(contextCode, sandbox);
  const guard = (req, res, next) => req.user.role === 'tim' ? next() : res.status(403).json({ error: 'Hanya tim' });
  const routeSandbox = {
    Router, store, authRequired: (req, res, next) => {
      const id = req.get('x-test-user');
      if (!['tim-a', 'tim-b', 'dosen-a'].includes(id)) return res.status(401).json({ error: 'Login' });
      req.userId = id; req.user = { id, username: 'Tim uji', role: id.startsWith('tim-') ? 'tim' : 'dosen' }; next();
    },
    hanyaTim: guard, PERAN_PENDAMPING: new Set(['dosen', 'fasilitator']),
    rateLimit: () => (_req, _res, next) => next(),
    aiAktif: () => true, infoAI: () => ({ model: 'fixture' }), statusAI: async () => ({ aktif: true }),
    daftarModel: async () => [], modelTersedia: async () => '', parseJsonModel: JSON.parse,
    chat: async (m) => { messages = m; return { teks: 'Jawaban uji', model: 'fixture', durasiMs: 1 }; },
    susunKonteks: sandbox.susunKonteks, promptSistemTanya: sandbox.promptSistemTanya,
    KATEGORI_PKM, LABEL_SUMBER, LABEL_KATEGORI, bacaProfilPkm, cariPengetahuanPkm, validasiProfilPkm,
    KUNCI_PROFIL_PKM, SKEMA_PKM, SUMBER_PKM,
  };
  vm.runInNewContext(routeCode, routeSandbox);
  const app = express(); app.use(express.json()); app.use('/api/ai', routeSandbox.router);
  app.use((err, _req, res, _next) => res.status(500).json({ error: err.message }));
  return { app, settings, sandbox, messages: () => messages };
}
async function withServer(fn) {
  const f = fixture(); const server = f.app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  const request = (path, user, body, method = body ? 'POST' : 'GET') => fetch(`http://127.0.0.1:${server.address().port}/api/ai${path}`, {
    method, headers: { ...(user ? { 'x-test-user': user } : {}), 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  try { await fn(f, request); }
  finally { await new Promise((resolve) => server.close(resolve)); }
}

test('korpus memiliki sumber resmi lima tahun dan sepuluh skema', () => {
  assert.deepEqual(Object.keys(SUMBER_PKM), ['2022', '2023', '2024', '2025', '2026']);
  assert.equal(Object.keys(SKEMA_PKM).length, 10);
  for (const r of PENGETAHUAN_PKM) {
    assert.ok(r.halaman.every((p) => Number.isInteger(p) && p > 0));
    assert.ok(SUMBER_PKM[r.tahun].url.startsWith('https://'));
    assert.ok(r.skema.every((s) => SKEMA_PKM[s]));
  }
});
test('nama tim tidak dipakai untuk menebak skema', () => {
  const p = bacaProfilPkm('', { namaTim: 'Bio Binder Pesisir Amerta Sign' });
  assert.equal(p.skema, ''); assert.equal(p.status, 'perlu_konfirmasi'); assert.deepEqual(p.indikasi, []);
});
test('kode eksplisit memberi indikasi, bukan konfirmasi otomatis', () => {
  const p = bacaProfilPkm('', { kegiatan: [{ kegiatan: 'Membahas PKM-PM dan PKM-KC.' }] });
  assert.deepEqual(p.indikasi, ['PKM-PM', 'PKM-KC']); assert.equal(p.status, 'perlu_konfirmasi');
});
test('profil memvalidasi tahun, skema, panjang dan tipe judul', () => {
  assert.equal(bacaProfilPkm({ skema: 'PKM-PM', tahun: 2026, judul: 'Uji' }).status, 'dikonfirmasi_tim');
  for (const input of [{ skema: 'PKM-X' }, { tahun: 2030 }, { judul: {} }, { judul: 'x'.repeat(241) }]) assert.throws(() => validasiProfilPkm(input));
});
test('aturan PM 2026 tidak bocor ke tahun 2025 atau skema KC', () => {
  for (const profil of [{ skema: 'PKM-PM', tahun: 2025 }, { skema: 'PKM-KC', tahun: 2026 }]) {
    const r = cariPengetahuanPkm('larangan sewa laptop bahan anggaran RAB', profil);
    assert.ok(!r.sumber.some((s) => s.id === 'larangan-pm-2026'));
    assert.ok(r.sumber.every((s) => s.tahun === profil.tahun));
  }
});
test('PKM-PM memilih larangan dan menegaskan basis RAB, bukan Belmawa diterima', () => {
  const r = cariPengetahuanPkm('larangan sewa laptop bahan RAB anggaran', { skema: 'PKM-PM', tahun: 2026 });
  assert.match(r.teks, /jumlah dana yang diusulkan/);
  assert.ok(r.sumber.some((s) => s.id === 'larangan-pm-2026'));
  assert.ok(r.teks.length <= 4800);
});
test('perbandingan 2022–2026 mempertahankan sumber masing-masing tahun', () => {
  const r = cariPengetahuanPkm('Bandingkan pendanaan 2022 2023 2024 2025 2026', {});
  assert.equal(new Set(r.sumber.map((s) => s.tahun)).size, 5);
});
test('tahun di luar korpus tidak diganti dengan aturan profil atau tahun terbaru', () => {
  for (const tahun of [2021, 2027]) {
    const r = cariPengetahuanPkm(`Batas RAB PKM-PM ${tahun}`, { skema: 'PKM-PM', tahun: 2026 });
    assert.deepEqual(r.sumber, []);
    assert.match(r.catatan, new RegExp(`${tahun} belum tersedia`));
  }
});
test('rentang 2022-2026 dan lima tahun terakhir menyeleksi kelima tahun', () => {
  for (const pertanyaan of ['Bandingkan 2022-2026', 'Aturan lima tahun terakhir']) {
    const r = cariPengetahuanPkm(pertanyaan, { tahun: 2024 });
    assert.equal(new Set(r.sumber.map((s) => s.tahun)).size, 5);
  }
});
test('konteks tidak memvonis pelanggaran dari statistik logbook', async () => {
  const f = fixture(); const data = await f.sandbox.susunKonteks('tim-a');
  assert.match(data.teks, /bukan putusan kepatuhan/);
  assert.doesNotMatch(data.teks, /MELEBIHI BATAS/);
  assert.equal(data.ringkas.pengeluaran, 1500000);
});
test('profil PKM memerlukan login dan melindungi tim yang tidak ditugaskan', async () => {
  await withServer(async (_f, request) => {
    assert.equal((await request('/profil-pkm')).status, 401);
    assert.equal((await request('/profil-pkm?tim=tim-b', 'dosen-a')).status, 403);
    const res = await request('/profil-pkm?tim=tim-a', 'dosen-a');
    assert.equal(res.status, 200); assert.equal((await res.json()).bisaUbah, false);
  });
});
test('hanya pemilik tim dapat menyimpan metadata, tanpa memengaruhi tim lain', async () => {
  await withServer(async (f, request) => {
    const body = { skema: 'PKM-PM', tahun: 2026, judul: 'Program mitra' };
    assert.equal((await request('/profil-pkm', 'dosen-a', body, 'PUT')).status, 403);
    assert.equal((await request('/profil-pkm', 'tim-a', { tahun: 2099 }, 'PUT')).status, 400);
    assert.equal((await request('/profil-pkm', 'tim-a', body, 'PUT')).status, 200);
    assert.ok(f.settings.has(`tim-a:${KUNCI_PROFIL_PKM}`));
    assert.ok(!f.settings.has(`tim-b:${KUNCI_PROFIL_PKM}`));
  });
});
test('jawaban AI mendapat profil dan rujukan yang terikat tim', async () => {
  await withServer(async (f, request) => {
    f.settings.set(`tim-a:${KUNCI_PROFIL_PKM}`, JSON.stringify({ skema: 'PKM-PM', tahun: 2026 }));
    const res = await request('/tanya', 'dosen-a', { pesan: 'Apa larangan RAB sewa laptop?', tim: 'tim-a' });
    assert.equal(res.status, 200); const body = await res.json();
    assert.equal(body.profilPkm.skema, 'PKM-PM'); assert.ok(body.sumber.length);
    assert.match(f.messages()[0].content, /RUJUKAN RESMI TERPILIH/);
    assert.match(f.messages()[0].content, /jangan mengisi kekurangan dari ingatan model/);
    assert.equal((await request('/tanya', 'dosen-a', { pesan: 'Aturan PKM', tim: 'tim-b' })).status, 403);
  });
});

