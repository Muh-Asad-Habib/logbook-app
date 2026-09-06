import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function client(status, model = async () => ({ daftar: [] })) {
  const effects = [], updates = [], events = new Map();
  const source = readFileSync(new URL('../frontend/lib/ai.js', import.meta.url), 'utf8')
    .replace(/^import .*;$/gm, '').replace(/\bexport /g, '');
  const sandbox = vm.createContext({
    api: { ai: { status, model } }, Date, Promise, Set,
    useState: (initial) => [initial, value => updates.push(value)], useEffect: (fn) => effects.push(fn),
    document: { visibilityState: 'visible' },
    window: { setInterval: () => 1, clearInterval() {}, addEventListener: (name, fn) => events.set(name, fn), removeEventListener: (name) => events.delete(name) },
  });
  const api = vm.runInContext(source + '\n;({ ambilStatusAI, useStatusAI, ambilModelAI });', sandbox);
  return { ...api, effects, updates, events };
}
const ready = { aktif: true, tersedia: true, modelAda: true, model: 'test-model' };

test('status error bukan penonaktifan AI dan dapat dipulihkan dalam tab sama', async () => {
  let calls = 0;
  const c = client(async () => { if (++calls === 1) throw new Error('offline'); return ready; });
  const first = await c.ambilStatusAI();
  assert.equal(first.aktif, null); assert.equal(first.gagal, true);
  assert.equal((await c.ambilStatusAI(true)).aktif, true);
  assert.equal(calls, 2);
});
test('status kosong tidak dianggap penonaktifan eksplisit', async () => {
  const c = client(async () => null);
  assert.equal((await c.ambilStatusAI()).gagal, true);
});
test('AI nonaktif tetap dihormati dan request bersamaan dideduplikasi', async () => {
  let calls = 0;
  const c = client(async () => { calls++; return { aktif: false, tersedia: false }; });
  const results = await Promise.all([c.ambilStatusAI(), c.ambilStatusAI(true), c.ambilStatusAI()]);
  assert.equal(calls, 1); assert.ok(results.every(s => s.aktif === false));
});
test('hook membagikan pemulihan online dan melepas listener saat unmount', async () => {
  let calls = 0;
  const c = client(async () => { if (++calls === 1) throw new Error('offline'); return ready; });
  c.useStatusAI();
  const cleanup = c.effects[0]();
  await c.ambilStatusAI();
  c.events.get('online')();
  await c.ambilStatusAI(true);
  assert.equal(c.updates.at(-1).aktif, true);
  cleanup(); assert.equal(c.events.size, 0);
});
test('daftar model kosong atau gagal tidak tersimpan permanen', async () => {
  for (const failure of ['empty', 'error']) {
    let calls = 0;
    const c = client(async () => ready, async () => {
      if (++calls === 1) { if (failure === 'error') throw new Error('offline'); return { daftar: [] }; }
      return { daftar: [{ nama: 'test-model' }], pilihan: '' };
    });
    assert.equal((await c.ambilModelAI()).daftar.length, 0);
    assert.equal((await c.ambilModelAI()).daftar.length, 1);
  }
});
test('status provider pulih tanpa menunggu cache kegagalan lima menit', async () => {
  const source = readFileSync(new URL('../backend/src/ai/klien.js', import.meta.url), 'utf8')
    .replace(/^import .*$/gm, '').replace(/\bexport /g, '');
  let calls = 0;
  const sandbox = vm.createContext({ Date, Promise, AbortSignal, URL, process: { env: {} }, fetch: async () => {
    if (++calls === 1) throw new Error('offline');
    return { ok: true, json: async () => ({ models: [{ name: 'qwen2.5:7b-instruct', details: { family: 'qwen' } }] }) };
  } });
  const status = vm.runInContext(source + '\n;statusAI;', sandbox);
  assert.equal((await status()).tersedia, false);
  assert.equal((await status()).tersedia, true);
  assert.equal(calls, 2);
});
