import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import JSZip from 'jszip';
import { privatePath, botAttribution } from './check-repo.mjs';

test('berkas rahasia, catatan pribadi, dan artefak ditolak walaupun dipaksa ke index', () => {
  for (const path of ['.env', 'backend/.env.production', '.env.backup', 'vv.txt', 'data/db.json', 'uploads/foto.jpg', 'artifacts/hasil.json', '.idea/workspace.xml', 'key.pem', 'backup.zip', 'Catatan.docx', 'tools/hasil.pdf', 'plan.prompt.md']) assert.equal(privatePath(path), true, path);
});
test('source, contoh env, ikon publik, dan template anonim diizinkan', () => {
  for (const path of ['.env.example', 'backend/src/server.js', 'frontend/public/icon-192.png', 'backend/src/assets/template-logbook.docx', 'tools/check-repo.mjs', '.githooks/pre-commit']) assert.equal(privatePath(path), false, path);
});
test('atribusi bot ditolak tanpa melarang deskripsi perubahan biasa', () => {
  assert.equal(botAttribution('fix: improve interface\n\nCo-authored-by: Copilot <bot@example.invalid>'), true);
  assert.equal(botAttribution('chore: update\n  Generated-by: Copilot CLI'), true);
  assert.equal(botAttribution('fix: validate repository privacy'), false);
});
test('template ekspor tidak memiliki metadata penulis atau foto pribadi', async () => {
  const zip = await JSZip.loadAsync(await readFile(new URL('../backend/src/assets/template-logbook.docx', import.meta.url)));
  const core = await zip.file('docProps/core.xml').async('string');
  assert.doesNotMatch(core, /<(?:dc:creator|cp:lastModifiedBy|cp:lastPrinted)\b/);
  assert.equal(Object.keys(zip.files).filter((p) => p.startsWith('word/media/') && !zip.files[p].dir).length, 0);
  const body = await zip.file('word/document.xml').async('string');
  assert.equal((body.match(/<w:tbl[ >]/g) || []).length, 2);
});
