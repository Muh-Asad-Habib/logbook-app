// Uji penyusun DOCX "Khusus Keuangan" berformat Lampiran 1. Penggunaan Dana PKM.
// Memakai data contoh — tanpa database, CDN, maupun jaringan.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import {
  bikinMedia, fmtAngka, fmtJumlah, fmtKeterangan, fmtRp, fmtTanggal, kalimatKeterangan,
  satuanDari, susunDocxKeuangan, ukuranNota,
} from '../backend/src/export/keuangan-lampiran.js';

const requireBackend = createRequire(new URL('../backend/package.json', import.meta.url));
const JSZip = requireBackend('jszip');
const sharp = requireBackend('sharp');

/* ------------------------------------------------------------- helper --- */
const unesc = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
  .replace(/&apos;/g, "'").replace(/&amp;/g, '&');

/** Teks paragraf/sel: gabungan <w:t>, <w:tab/> → \t, <w:br/> → \n. */
const teks = (xml) => unesc((xml.match(/<w:t(?: [^>]*)?>[^<]*<\/w:t>|<w:tab\/>|<w:br\/>/g) || [])
  .map((x) => (x === '<w:tab/>' ? '\t' : x === '<w:br/>' ? '\n' : x.replace(/<[^>]+>/g, ''))).join(''));

const barisTabel = (tbl) => (tbl.match(/<w:tr>[\s\S]*?<\/w:tr>/g) || [])
  .map((tr) => (tr.match(/<w:tc>[\s\S]*?<\/w:tc>/g) || []).map(teks));

/** Isi body tingkat atas, berurutan: { p, xml } untuk paragraf, { tabel, xml } untuk tabel. */
function blokBody(doc) {
  const body = doc.slice(doc.indexOf('<w:body>') + 8, doc.lastIndexOf('<w:sectPr>'));
  return (body.match(/<w:tbl>[\s\S]*?<\/w:tbl>|<w:p[ >][\s\S]*?<\/w:p>/g) || []).map((xml) =>
    (xml.startsWith('<w:tbl>') ? { tabel: barisTabel(xml), xml } : { p: teks(xml), xml }));
}

/** Pemeriksa well-formed sederhana (tanpa parser XML tambahan). */
function cekXml(xml, nama) {
  assert.doesNotMatch(xml, /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/, `${nama}: karakter kendali`);
  const isi = xml.replace(/^<\?xml[^>]*\?>/, '');
  const tumpukan = [];
  const re = /<[^>]*>/g;
  let akhir = 0;
  let m;
  while ((m = re.exec(isi))) {
    const antara = isi.slice(akhir, m.index);
    assert.doesNotMatch(antara, /<|&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[\da-f]+);)/i, `${nama}: teks tidak ter-escape`);
    akhir = re.lastIndex;
    const tag = m[0];
    if (tag.startsWith('</')) {
      const nm = tag.slice(2, -1).trim();
      assert.equal(tumpukan.pop(), nm, `${nama}: penutup </${nm}> tidak cocok`);
    } else if (!tag.endsWith('/>')) {
      tumpukan.push(tag.slice(1, -1).split(/\s/)[0]);
    }
  }
  assert.equal(tumpukan.length, 0, `${nama}: tag belum ditutup (${tumpukan.at(-1)})`);
  assert.equal(isi.slice(akhir).trim(), '', `${nama}: sisa teks setelah elemen akar`);
}

async function bukaDocx(buf) {
  assert.ok(Buffer.isBuffer(buf), 'hasil berupa Buffer');
  const zip = await JSZip.loadAsync(buf);
  for (const nama of Object.keys(zip.files)) {
    if (/\.(xml|rels)$/.test(nama)) cekXml(await zip.file(nama).async('string'), nama);
  }
  const baca = (n) => zip.file(n)?.async('string');
  return {
    zip,
    doc: await baca('word/document.xml'),
    rels: await baca('word/_rels/document.xml.rels'),
    ctypes: await baca('[Content_Types].xml'),
  };
}

const E = (o) => ({
  satuan_suffix: '/bulan', jumlah: 1, kode_unik: 0, sumber: 'belmawa', kategori: 'lain', bukti_keys: [],
  ...o,
  total: (o.harga_satuan || 0) * (o.jumlah ?? 1) + (o.kode_unik || 0),
});

const gambar = (w, h, format) =>
  sharp({ create: { width: w, height: h, channels: 3, background: '#f5f5f4' } })[format]().toBuffer();

const JUDUL_KE = /^(LAMPIRAN|Lampiran |Keterangan:|\d+\.\t|TOTAL DANA|Dokumentasi Nota)/;

/* ------------------------------------------------------------- format --- */
test('format angka, tanggal, jumlah, dan keterangan mengikuti contoh lampiran', () => {
  assert.equal(fmtAngka(925000), '925.000');
  assert.equal(fmtAngka(2.5), '2,5');
  assert.equal(fmtAngka(null), '0');
  assert.equal(fmtRp(3741172), 'Rp3.741.172');
  assert.equal(fmtRp(0), 'Rp0');
  assert.equal(fmtRp(-50000), '-Rp50.000');
  assert.equal(fmtTanggal('2026-06-17'), '17-06-2026');
  assert.equal(fmtTanggal(''), '-');
  assert.equal(satuanDari('/liter'), 'Liter');
  assert.equal(satuanDari('/ bulan'), 'Bulan');
  assert.equal(satuanDari('per jam'), 'Jam');
  assert.equal(satuanDari('/kg'), 'kg');
  assert.equal(satuanDari(''), '');
  assert.equal(fmtJumlah({ jumlah: 19, satuan_suffix: '/liter' }), '19 Liter');
  assert.equal(fmtJumlah({ jumlah: 1.5, satuan_suffix: '' }), '1,5');
  assert.equal(fmtKeterangan({ item: 'Sewa VPS', kode_unik: 137 }), 'Sewa VPS (kode unik/biaya admin : 137)');
  assert.equal(fmtKeterangan({ item: 'Pembayaran HKI', kode_unik: 2500 }), 'Pembayaran HKI (kode unik/biaya admin : 2.500)');
  assert.equal(fmtKeterangan({ item: '  ', kode_unik: 0 }), '-');
});

test('kalimat keterangan memuat rentang kode nota per sumber', () => {
  const kode = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => ({ kode: String(a + i).padStart(2, '0') }));
  assert.equal(kalimatKeterangan({ belmawa: kode(1, 37), pt: kode(38, 43) }),
    'Keterangan: Penggunaan dana dipisahkan berdasarkan sumber pendanaan, yaitu Dana Belmawa ' +
    'untuk Nota 01-37 dan Dana Perguruan Tinggi untuk Nota 38-43.');
  assert.equal(kalimatKeterangan({ pt: kode(1, 1) }),
    'Keterangan: Penggunaan dana dipisahkan berdasarkan sumber pendanaan, yaitu Dana Perguruan Tinggi untuk Nota 01.');
  assert.match(kalimatKeterangan({}), /belum ada nota yang dilampirkan\.$/);
});

/* ------------------------------------------------------ dokumen penuh --- */
test('dokumen lengkap: urutan lampiran, tabel, kode nota, subtotal, dan dokumentasi', async () => {
  const media = bikinMedia();
  const lebar = await gambar(40, 30, 'jpeg');
  const tegak = await gambar(30, 40, 'jpeg');
  const struk = await gambar(30, 90, 'png');
  media.tambah('n1', lebar, 400, 300);
  media.tambah('n2', lebar, 400, 300);
  media.tambah('n3', lebar, 400, 300);
  media.tambah('n4', struk, 300, 900);
  for (const k of ['n5', 'n6', 'n7', 'n8', 'n9', 'n10', 'n11']) media.tambah(k, tegak, 300, 400);
  media.tambah('n1', tegak, 1, 1); // kunci ganda diabaikan
  media.tambah('gif', Buffer.from('GIF89a'), 4, 3); // format selain JPEG/PNG dilewati
  assert.equal(media.jumlah, 11);

  const entri = [
    E({ tanggal: '2026-06-03', item: 'Sewa server hosting VPS', harga_satuan: 300000, kode_unik: 143, kategori: 'sewa', bukti_keys: ['n1'] }),
    E({ tanggal: '2026-06-06', item: 'Pembayaran iklan (Ads)', harga_satuan: 88800, kategori: 'lain', bukti_keys: ['n2'] }),
    E({ tanggal: '2026-06-15', item: 'Pembelian kuota internet', harga_satuan: 88000, kategori: 'lain', bukti_keys: ['n3', 'n3'] }),
    E({ tanggal: '2026-06-16', item: 'Pembelian bahan bakar (bensin)', harga_satuan: 10000, jumlah: 19, satuan_suffix: '/liter', kategori: 'transport', bukti_keys: ['n4', 'n5', 'n6', 'n7'] }),
    E({ tanggal: '2026-06-17', item: 'Pembelian dataset BISINDO', harga_satuan: 925000, kode_unik: 137, satuan_suffix: '/dataset', kategori: 'bahan', bukti_keys: ['n8'] }),
    E({ tanggal: '2026-07-02', item: 'Cetak banner', harga_satuan: 20000, satuan_suffix: '/pcs', kategori: '', bukti_keys: ['n1'] }),
    E({ tanggal: '2026-08-12', item: 'Pembelian Map Berkas', harga_satuan: 5000, jumlah: 8, satuan_suffix: '/lembar', kategori: 'bahan', bukti_keys: ['hilang', 'gif'] }),
    E({ tanggal: '2026-06-29', item: 'Sewa server GPU', harga_satuan: 90400, jumlah: 3, satuan_suffix: '/jam', kode_unik: 143, sumber: 'pt', kategori: 'sewa', bukti_keys: ['n9'] }),
    E({ tanggal: '2026-08-13', item: 'Pembayaran HKI', harga_satuan: 250000, kode_unik: 2500, satuan_suffix: '/dokumen', sumber: 'pt', kategori: '', bukti_keys: ['n10'] }),
    E({ tanggal: '2026-07-01', item: 'Fotokopi proposal', harga_satuan: 50000, satuan_suffix: '/paket', sumber: '', kategori: '', bukti_keys: [], bukti_key: 'n11' }),
  ];
  const buf = await susunDocxKeuangan({
    keuangan: [...entri].reverse(), // urutan masuk acak → tetap diurutkan per tanggal
    dana: { belmawa: 6_500_000, pt: 2_000_000, awal: 0, total: 8_500_000 },
    profil: { skema: 'PKM-KC', tahun: 2026, judul: 'RANCANG BANGUN APLIKASI PENERJEMAH BAHASA ISYARAT' },
    media,
    namaTim: 'Amerta Sign',
  });
  const { zip, doc, rels, ctypes } = await bukaDocx(buf);

  // Paket: header (nomor halaman), settings, styles, gambar
  for (const part of ['word/styles.xml', 'word/settings.xml', 'word/header1.xml', 'docProps/core.xml']) {
    assert.ok(zip.file(part), `${part} ada`);
  }
  assert.match(ctypes, /PartName="\/word\/header1\.xml"/);
  assert.match(ctypes, /PartName="\/word\/settings\.xml"/);
  assert.match(ctypes, /<Default Extension="jpeg"/);
  assert.match(ctypes, /<Default Extension="png"/);
  assert.match(rels, /Id="rId3" Type="[^"]+\/header" Target="header1\.xml"/);
  assert.match(await zip.file('word/header1.xml').async('string'), /<w:instrText[^>]*> PAGE /);
  assert.match(await zip.file('docProps/core.xml').async('string'), /Lampiran Penggunaan Dana — Tim Amerta Sign/);
  const styles = await zip.file('word/styles.xml').async('string');
  assert.match(styles, /w:styleId="Heading1"/);
  assert.match(styles, /w:styleId="Caption"/);
  assert.match(styles, /w:ascii="Times New Roman"/);

  // Tata halaman A4: atas/kanan/bawah 3 cm, kiri 4 cm, kepala halaman bernomor
  assert.match(doc, /<w:sectPr><w:headerReference w:type="default" r:id="rId3"\/><w:pgSz w:w="11906" w:h="16838"\/>/);
  assert.match(doc, /<w:pgMar w:top="1701" w:right="1701" w:bottom="1701" w:left="2268"/);
  assert.doesNotMatch(doc, /Calibri|w:fill=/, 'tanpa font/warna latar gaya lama');

  // Urutan judul & keterangan
  const blok = blokBody(doc);
  assert.deepEqual(blok.filter((b) => b.p !== undefined && JUDUL_KE.test(b.p)).map((b) => b.p), [
    'LAMPIRAN',
    'Lampiran 1. Penggunaan Dana',
    'Keterangan: Penggunaan dana dipisahkan berdasarkan sumber pendanaan, yaitu Dana Belmawa untuk Nota 01-09, ' +
      'Dana Perguruan Tinggi untuk Nota 10-11, dan dana yang belum ditandai sumbernya untuk Nota 12.',
    'Lampiran 1.1 Penggunaan Dana dari Belmawa',
    '1.\tBahan Habis Pakai',
    '2.\tSewa dan Jasa',
    '3.\tTransportasi Lokal',
    '4.\tLain-lain',
    '5.\tBelum Berkategori',
    'TOTAL DANA BELMAWA: Rp1.652.080',
    'Dokumentasi Nota Dana Belmawa',
    'Lampiran 1.2 Penggunaan Dana dari Perguruan Tinggi',
    'TOTAL DANA PERGURUAN TINGGI: Rp523.843',
    'Dokumentasi Nota Dana Perguruan Tinggi',
    'Lampiran 1.3 Penggunaan Dana yang Belum Ditandai Sumbernya',
    'TOTAL DANA BELUM DITANDAI: Rp50.000',
    'Dokumentasi Nota Dana Belum Ditandai',
  ]);
  const para = (awal) => blok.find((b) => b.p?.startsWith(awal));
  assert.match(para('LAMPIRAN').xml, /<w:pStyle w:val="Heading1"\/>[\s\S]*<w:jc w:val="center"\/>/);
  assert.match(para('Lampiran 1. ').xml, /<w:pStyle w:val="Caption"\/>/);
  assert.match(para('Lampiran 1. ').xml, /<w:instrText xml:space="preserve"> SEQ Lampiran \\\* ARABIC <\/w:instrText>/);
  assert.match(para('Keterangan:').xml, /<w:jc w:val="both"\/>/);
  assert.match(para('1.\t').xml, /<w:ind w:left="360" w:hanging="360"\/>/);
  assert.match(para('Dokumentasi Nota Dana Belmawa').xml, /<w:pageBreakBefore\/>/);
  assert.doesNotMatch(para('Dokumentasi Nota Dana Perguruan').xml, /<w:pageBreakBefore\/>/);
  assert.match(para('TOTAL DANA BELMAWA').xml, /<w:b\/>/);
  assert.equal(blok.at(-1).p, '', 'dokumen diakhiri paragraf, bukan tabel');

  // Tabel ringkas
  const tabel = blok.filter((b) => b.tabel);
  const [ringkas] = tabel;
  assert.deepEqual(ringkas.tabel, [
    ['Judul', 'RANCANG BANGUN APLIKASI PENERJEMAH BAHASA ISYARAT'],
    ['Skema', 'Sumber', 'Tahun', 'Pendanaan (Rp)', 'Penggunaan (Rp)', 'Sisa (Rp)'],
    ['PKM-KC', 'Belmawa', '2026', '6.500.000', '1.652.080', '4.847.920'],
    ['', 'Perguruan Tinggi', '2026', '2.000.000', '523.843', '1.476.157'],
    ['', 'Belum ditandai', '2026', '0', '50.000', '-50.000'],
    ['SUB TOTAL', 'Rp8.500.000', 'Rp2.225.923', 'Rp6.274.077'],
  ]);
  assert.match(ringkas.xml, /<w:gridCol w:w="1084"\/><w:gridCol w:w="1306"\/>/);
  assert.match(ringkas.xml, /<w:jc w:val="center"\/><w:tblBorders>/, 'tabel ringkas rata tengah');
  assert.equal((ringkas.xml.match(/<w:vMerge w:val="restart"\/>/g) || []).length, 1);
  assert.equal((ringkas.xml.match(/<w:vMerge\/>/g) || []).length, 2);
  assert.match(ringkas.xml, /<w:gridSpan w:val="5"\/>/);
  assert.match(ringkas.xml, /<w:gridSpan w:val="3"\/>/);

  // Tabel belanja per kategori Belmawa, lalu PT, lalu belum ditandai
  const KEPALA = ['No', 'Tanggal', 'Keterangan', 'Harga Satuan (Rp)', 'Jumlah', 'Total (Rp)', 'Kode Nota'];
  const belanja = tabel.filter((t) => t.tabel[0].join('|') === KEPALA.join('|'));
  assert.equal(belanja.length, 7);
  assert.deepEqual(belanja.map((t) => t.tabel.slice(1)), [
    [
      ['1.', '17-06-2026', 'Pembelian dataset BISINDO (kode unik/biaya admin : 137)', '925.000', '1 Dataset', '925.137', '08'],
      ['2.', '12-08-2026', 'Pembelian Map Berkas', '5.000', '8 Lembar', '40.000', '-'],
      ['SUB TOTAL', 'Rp965.137'],
    ],
    [
      ['1.', '03-06-2026', 'Sewa server hosting VPS (kode unik/biaya admin : 143)', '300.000', '1 Bulan', '300.143', '01'],
      ['SUB TOTAL', 'Rp300.143'],
    ],
    [
      ['1.', '16-06-2026', 'Pembelian bahan bakar (bensin)', '10.000', '19 Liter', '190.000', '04-07'],
      ['SUB TOTAL', 'Rp190.000'],
    ],
    [
      ['1.', '06-06-2026', 'Pembayaran iklan (Ads)', '88.800', '1 Bulan', '88.800', '02'],
      ['2.', '15-06-2026', 'Pembelian kuota internet', '88.000', '1 Bulan', '88.000', '03'],
      ['SUB TOTAL', 'Rp176.800'],
    ],
    [
      ['1.', '02-07-2026', 'Cetak banner', '20.000', '1 Pcs', '20.000', '09'],
      ['SUB TOTAL', 'Rp20.000'],
    ],
    [
      ['1.', '29-06-2026', 'Sewa server GPU (kode unik/biaya admin : 143)', '90.400', '3 Jam', '271.343', '10'],
      ['2.', '13-08-2026', 'Pembayaran HKI (kode unik/biaya admin : 2.500)', '250.000', '1 Dokumen', '252.500', '11'],
      ['SUB TOTAL', 'Rp523.843'],
    ],
    [
      ['1.', '01-07-2026', 'Fotokopi proposal', '50.000', '1 Paket', '50.000', '12'],
      ['SUB TOTAL', 'Rp50.000'],
    ],
  ]);
  for (const t of belanja) {
    assert.match(t.xml, /<w:tblLayout w:type="fixed"\/>/);
    assert.match(t.xml, /<w:trPr><w:cantSplit\/><\/w:trPr>/, 'baris tidak terbelah antarhalaman');
    assert.doesNotMatch(t.xml, /<w:tblHeader\/>/, 'judul tabel tidak diulang, seperti contoh');
    const kepala = t.xml.match(/<w:tr>[\s\S]*?<\/w:tr>/)[0];
    assert.equal((kepala.match(/<w:keepNext\/>/g) || []).length, 7, 'judul tabel menempel baris pertama');
    assert.match(t.xml, /<w:gridSpan w:val="5"\/>[\s\S]*<w:gridSpan w:val="2"\/>/);
  }

  // Dokumentasi: kode berurutan, satu gambar per baris, nomor mulai dari 1 tiap bagian
  const dok = tabel.filter((t) => t.tabel[0].join('|') === 'No|Kode Nota|Dokumentasi');
  assert.deepEqual(dok.map((t) => t.tabel.slice(1).map((r) => r.slice(0, 2))), [
    [['1.', '01'], ['2.', '02'], ['3.', '03'], ['4.', '04'], ['5.', '05'], ['6.', '06'], ['7.', '07'], ['8.', '08'], ['9.', '09']],
    [['1.', '10'], ['2.', '11']],
    [['1.', '12']],
  ]);
  for (const t of dok) {
    const nBaris = t.tabel.length - 1;
    assert.equal((t.xml.match(/<w:drawing>/g) || []).length, nBaris, 'satu gambar per baris');
    const [kepala, ...isiDok] = t.xml.match(/<w:tr>[\s\S]*?<\/w:tr>/g);
    assert.equal((kepala.match(/<w:keepNext\/>/g) || []).length, 3, 'judul menempel nota pertama');
    assert.ok(isiDok.every((tr) => !tr.includes('<w:keepNext/>')));
  }

  // Gambar: 11 berkas unik (n1 dipakai dua entri), 12 tampilan, id docPr unik
  const berkasMedia = Object.keys(zip.files).filter((n) => n.startsWith('word/media/') && !zip.files[n].dir);
  assert.equal(berkasMedia.length, 11);
  const target = [...rels.matchAll(/Type="[^"]+\/image" Target="([^"]+)"/g)].map((x) => `word/${x[1]}`);
  assert.deepEqual(target.sort(), berkasMedia.sort());
  for (const rid of doc.matchAll(/r:embed="(rId\d+)"/g)) assert.match(rels, new RegExp(`Id="${rid[1]}"`));
  const docPr = [...doc.matchAll(/<wp:docPr id="(\d+)"/g)].map((x) => x[1]);
  assert.equal(docPr.length, 12);
  assert.equal(new Set(docPr).size, docPr.length);
  // Ukuran tampil seperti contoh: tinggi 7,5 cm, lanskap ≤ 7 cm, struk memanjang selebar 4,5 cm
  assert.match(doc, /<wp:extent cx="2520000" cy="1890000"\/>/);
  assert.match(doc, /<wp:extent cx="2025000" cy="2700000"\/>/);
  assert.match(doc, /<wp:extent cx="1620000" cy="4860000"\/>/);
  assert.doesNotMatch(doc, /<w:tblHeader\/>/);
});

test('ukuran nota meniru contoh: tinggi 7,5 cm, lebar 4,5-7 cm, tinggi maks 20 cm, rasio utuh', () => {
  const cm = ({ cx, cy }) => [cx / 360000, cy / 360000];
  assert.deepEqual(cm(ukuranNota(300, 400)), [5.625, 7.5]); // foto nota tegak
  assert.deepEqual(cm(ukuranNota(1000, 1500)), [5, 7.5]);
  assert.deepEqual(cm(ukuranNota(1600, 900)), [7, 3.9375]); // lanskap dibatasi lebar kolom
  assert.deepEqual(cm(ukuranNota(1080, 2400)), [4.5, 10]); // tangkapan layar ponsel
  assert.deepEqual(cm(ukuranNota(100, 1000)), [2, 20]); // struk sangat panjang
  assert.deepEqual(cm(ukuranNota(0, 0)), [5.625, 7.5]); // ukuran tak diketahui → 3:4
});

test('kategori kosong dilewati & dinomori ulang; tanpa nota/PT/entri tak bertanda', async () => {
  const buf = await susunDocxKeuangan({
    keuangan: [
      E({ tanggal: '2025-03-01', item: 'Kertas HVS', harga_satuan: 55000, satuan_suffix: '/rim', kategori: 'bahan' }),
      E({ tanggal: '2025-03-02', item: 'Pulsa', harga_satuan: 25000, kategori: 'lain', bukti_keys: ['tak-terunduh'] }),
    ],
    dana: { belmawa: 1_000_000, pt: 0, awal: 0 },
    profil: {},
  });
  const { zip, doc, ctypes } = await bukaDocx(buf);
  const blok = blokBody(doc);
  const judul = blok.filter((b) => b.p !== undefined && JUDUL_KE.test(b.p)).map((b) => b.p);
  assert.deepEqual(judul, [
    'LAMPIRAN',
    'Lampiran 1. Penggunaan Dana',
    'Keterangan: Penggunaan dana dipisahkan berdasarkan sumber pendanaan (Dana Belmawa dan Dana ' +
      'Perguruan Tinggi); belum ada nota yang dilampirkan.',
    'Lampiran 1.1 Penggunaan Dana dari Belmawa',
    '1.\tBahan Habis Pakai',
    '2.\tLain-lain',
    'TOTAL DANA BELMAWA: Rp80.000',
    'Lampiran 1.2 Penggunaan Dana dari Perguruan Tinggi',
    'TOTAL DANA PERGURUAN TINGGI: Rp0',
  ]);
  assert.ok(blok.some((b) => b.p === 'Belum ada penggunaan dana Perguruan Tinggi yang dicatat.'));
  const [ringkas, bahan, lain] = blok.filter((b) => b.tabel);
  assert.deepEqual(ringkas.tabel.slice(2), [
    ['PKM', 'Belmawa', '2025', '1.000.000', '80.000', '920.000'],
    ['', 'Perguruan Tinggi', '2025', '0', '0', '0'],
    ['SUB TOTAL', 'Rp1.000.000', 'Rp80.000', 'Rp920.000'],
  ]);
  assert.equal(ringkas.tabel[0][1], '', 'judul kosong bila profil belum diisi');
  assert.deepEqual(bahan.tabel[1], ['1.', '01-03-2025', 'Kertas HVS', '55.000', '1 Rim', '55.000', '-']);
  assert.equal(lain.tabel[1][6], '-', 'nota yang gagal diunduh tidak diberi kode');
  assert.equal(blok.filter((b) => b.tabel).length, 3);
  assert.ok(!Object.keys(zip.files).some((n) => n.startsWith('word/media/') && !zip.files[n].dir));
  assert.doesNotMatch(ctypes, /Extension="(jpeg|png)"/);
  assert.doesNotMatch(doc, /<w:drawing>/);
});

test('tanggal sama: kode nota mengikuti urutan kategori seperti lampiran contoh', async () => {
  const media = bikinMedia();
  const img = await gambar(30, 40, 'jpeg');
  for (const k of ['k1', 'b1', 'b2', 'b3', 'b4', 'p1']) media.tambah(k, img, 300, 400);
  const buf = await susunDocxKeuangan({
    keuangan: [
      E({ tanggal: '2026-09-04', item: 'Pembelian kuota internet', harga_satuan: 70000, kategori: 'lain', bukti_keys: ['k1'] }),
      E({ tanggal: '2026-09-04', item: 'Sewa server GPU', harga_satuan: 90400, sumber: 'pt', kategori: 'sewa', bukti_keys: ['p1'] }),
      E({ tanggal: '2026-09-04', item: 'Pembelian bahan bakar (bensin)', harga_satuan: 10000, jumlah: 20, satuan_suffix: '/liter', kategori: 'transport', bukti_keys: ['b1', 'b2', 'b3', 'b4'] }),
    ],
    dana: { belmawa: 500000, pt: 100000 },
    media,
  });
  const belanja = blokBody((await bukaDocx(buf)).doc).filter((b) => b.tabel?.[0][0] === 'No' && b.tabel[0].length === 7);
  assert.deepEqual(belanja.map((t) => [t.tabel[1][2], t.tabel[1][6]]), [
    ['Pembelian bahan bakar (bensin)', '01-04'],
    ['Pembelian kuota internet', '05'],
    ['Sewa server GPU', '06'],
  ]);
});

test('data kosong dengan dana awal lama dan teks istimewa tetap menghasilkan dokumen sah', async () => {
  const buf = await susunDocxKeuangan({
    keuangan: [],
    dana: { belmawa: 0, pt: 0, awal: 5_000_000, total: 5_000_000 },
    profil: { skema: 'PKM-RE', tahun: 2024, judul: 'Uji <Judul> & "Kutip"' },
  });
  const { doc } = await bukaDocx(buf);
  const blok = blokBody(doc);
  const [ringkas] = blok.filter((b) => b.tabel);
  assert.deepEqual(ringkas.tabel, [
    ['Judul', 'Uji <Judul> & "Kutip"'],
    ['Skema', 'Sumber', 'Tahun', 'Pendanaan (Rp)', 'Penggunaan (Rp)', 'Sisa (Rp)'],
    ['PKM-RE', 'Belmawa', '2024', '0', '0', '0'],
    ['', 'Perguruan Tinggi', '2024', '0', '0', '0'],
    ['', 'Belum ditandai', '2024', '5.000.000', '0', '5.000.000'],
    ['SUB TOTAL', 'Rp5.000.000', 'Rp0', 'Rp5.000.000'],
  ]);
  assert.ok(blok.some((b) => b.p === 'Belum ada penggunaan dana Belmawa yang dicatat.'));
  assert.ok(blok.some((b) => b.p === 'TOTAL DANA BELMAWA: Rp0'));
  assert.ok(!blok.some((b) => b.p?.startsWith('Lampiran 1.3')), 'tanpa entri tak bertanda → tanpa Lampiran 1.3');

  const aneh = await susunDocxKeuangan({
    keuangan: [E({ tanggal: '2026-01-05', item: 'Kabel <USB> & "adaptor"\nbaris 2\u0007', harga_satuan: 15000, kategori: 'bahan' })],
    dana: { belmawa: 100000, pt: 0 },
  });
  const isiAneh = blokBody((await bukaDocx(aneh)).doc).filter((b) => b.tabel)[1];
  assert.equal(isiAneh.tabel[1][2], 'Kabel <USB> & "adaptor"\nbaris 2');
});
