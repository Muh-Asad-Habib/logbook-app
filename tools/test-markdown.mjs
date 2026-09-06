import test from 'node:test';
import assert from 'node:assert/strict';
import { markdownBlocks } from '../frontend/lib/markdown.js';

test('baris kosong tidak memulai ulang nomor daftar AI', () => {
  const b = markdownBlocks('1. **Bahan bakar**: sesuai kebutuhan.\n\n2. **Iklan**: sesuai rencana.\n\n3. Pemeriksaan bukti.');
  assert.equal(b.length, 1); assert.equal(b[0].type, 'ol'); assert.equal(b[0].start, 1); assert.equal(b[0].items.length, 3);
});
test('notasi markdown 1 berulang tetap menjadi satu daftar berurutan', () => {
  const b = markdownBlocks('1. Pertama\n\n1. Kedua\n\n1. Ketiga');
  assert.equal(b[0].items.length, 3); assert.equal(b[0].start, 1);
});
test('nomor awal eksplisit dipertahankan dan judul mengakhiri daftar', () => {
  const b = markdownBlocks('3. Ketiga\n4. Keempat\n\n## Bagian baru\n1. Baru');
  assert.deepEqual(b.map((x) => x.type), ['ol', 'heading', 'ol']);
  assert.equal(b[0].start, 3); assert.equal(b[2].start, 1);
});
test('paragraf lanjutan terindentasi tidak mengubah nomor', () => {
  const b = markdownBlocks('1. Langkah\n\n   Penjelasan\n\n2. Langkah berikutnya');
  assert.equal(b.length, 1); assert.equal(b[0].items.length, 2); assert.match(b[0].items[0], /Penjelasan/);
});
test('HTML tidak dijalankan atau diubah menjadi markup oleh parser', () => {
  const b = markdownBlocks('<script>alert(1)</script>');
  assert.deepEqual(b, [{ type: 'p', text: '<script>alert(1)</script>' }]);
});
