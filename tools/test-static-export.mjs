import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { prepareStaticExport } from './prepare-static-export.mjs';

async function withExport(fn) {
  const root = await mkdtemp(join(tmpdir(), 'logbook-rsc-'));
  try {
    await mkdir(join(root, 'kegiatan', '__next.kegiatan'), { recursive: true });
    await writeFile(join(root, 'kegiatan', '__next.kegiatan', '__PAGE__.txt'), 'fixture flight data');
    await fn(root);
  } finally { await rm(root, { recursive: true, force: true }); }
}
test('nama segmen yang diminta klien tersedia dengan isi identik', () => withExport(async (root) => {
  assert.equal(await prepareStaticExport(root), 1);
  assert.equal(await readFile(join(root, 'kegiatan', '__next.kegiatan.__PAGE__.txt'), 'utf8'), 'fixture flight data');
  assert.equal(await readFile(join(root, 'kegiatan', '__next.kegiatan', '__PAGE__.txt'), 'utf8'), 'fixture flight data');
}));
test('penyiapan ekspor dapat diulang tanpa mengubah data', () => withExport(async (root) => {
  await prepareStaticExport(root);
  assert.equal(await prepareStaticExport(root), 0);
}));
test('alias dengan isi berbeda tidak ditimpa diam-diam', () => withExport(async (root) => {
  await writeFile(join(root, 'kegiatan', '__next.kegiatan.__PAGE__.txt'), 'different route');
  await assert.rejects(prepareStaticExport(root), /Conflicting RSC alias/);
}));

