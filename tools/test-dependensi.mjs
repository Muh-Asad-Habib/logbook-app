// Uji kompatibilitas override keamanan. Tidak memuat server aplikasi atau database.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const requireBackend = createRequire(new URL('../backend/package.json', import.meta.url));
const ExcelJS = requireBackend('exceljs');
const express = requireBackend('express');
const sharp = requireBackend('sharp');
const JSZip = requireBackend('jszip');

test('ExcelJS: round-trip XLSX dan UUID untuk conditional formatting', async () => {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet('Audit');
  sheet.addRows([['Item', 'Total'], ['Bahan', 125000], ['Jasa', 250000]]);
  sheet.getCell('B4').value = { formula: 'SUM(B2:B3)', result: 375000 };
  sheet.addConditionalFormatting({ ref: 'B2:B3', rules: [{
    type: 'iconSet', iconSet: '3Stars',
    cfvo: [{ type: 'percent', value: 0 }, { type: 'percent', value: 33 }, { type: 'percent', value: 67 }],
  }] });
  const buffer = await wb.xlsx.writeBuffer();
  const zip = await JSZip.loadAsync(buffer);
  const xml = await zip.file('xl/worksheets/sheet1.xml').async('string');
  assert.match(xml, /x14:cfRule/);
  assert.match(xml, /id="\{[0-9A-F]{8}-[0-9A-F]{4}-4[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}\}"/i);
  const loaded = new ExcelJS.Workbook();
  await loaded.xlsx.load(buffer);
  assert.equal(loaded.getWorksheet('Audit').getCell('B2').value, 125000);
  assert.equal(loaded.getWorksheet('Audit').getCell('B4').value.result, 375000);
});

test('Express: form bertingkat, query, dan JSON tetap kompatibel', async () => {
  const app = express();
  app.set('query parser', 'extended');
  app.use(express.urlencoded({ extended: true }));
  app.use(express.json());
  app.post('/audit', (req, res) => res.json({ body: req.body, query: req.query }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  try {
    const url = `http://127.0.0.1:${server.address().port}/audit?filter[tim]=demo`;
    const form = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'tim[nama]=Uji&nilai[]=1000&nilai[]=2000' });
    assert.equal(form.status, 200);
    assert.deepEqual(await form.json(), { body: { tim: { nama: 'Uji' }, nilai: ['1000', '2000'] }, query: { filter: { tim: 'demo' } } });
    const json = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ catatan: 'Revisi audit' }) });
    assert.equal((await json.json()).body.catatan, 'Revisi audit');
  } finally {
    server.closeAllConnections();
    await new Promise((resolve, reject) => server.close((e) => e ? reject(e) : resolve()));
  }
});

test('Sharp: pengolahan foto native tetap bekerja', async () => {
  const png = await sharp({ create: { width: 20, height: 10, channels: 4, background: '#a5b4fc' } }).resize(10, 5).png().toBuffer();
  const meta = await sharp(png).metadata();
  assert.equal(meta.width, 10);
  assert.equal(meta.height, 5);
  assert.equal(meta.format, 'png');
});
