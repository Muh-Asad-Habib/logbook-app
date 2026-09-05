// Audit UI terisolasi: semua API ditiru, tanpa akun/database/layanan eksternal.
// Jalankan frontend pada port 3100, lalu: node tools/audit-desain.mjs
import { chromium, expect } from '@playwright/test';
import JSZip from 'jszip';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { PANEL_HTML } from '../backend/src/admin/panel.js';
import { auditNavigasi } from './audit-navigasi.mjs';
import { auditMobile } from './audit-mobile.mjs';
import { SKEMA_PKM, SUMBER_PKM } from '../backend/src/ai/pkm-knowledge.js';

const base = process.env.AUDIT_URL || 'http://localhost:3100';
if (!['localhost', '127.0.0.1'].includes(new URL(base).hostname)) throw new Error('Audit hanya untuk server lokal.');
const out = fileURLToPath(new URL('../artifacts/audit-desain/', import.meta.url));
await mkdir(out, { recursive: true });
const quick = process.env.AUDIT_QUICK === '1';
const sizes = quick ? [[320, 740], [1024, 600]] : [[320, 740], [375, 812], [430, 932], [640, 800], [768, 1024], [900, 700], [1024, 600], [1440, 900], [1920, 1080], [844, 390]];
const routes = ['/', '/kegiatan', '/keuangan', '/laporan', '/presentasi', '/galeri', '/ekspor', '/profil', '/login'];
const text = 'NamaTimTanpaSpasiYangSangatPanjangUntukMengujiResponsivitas';
const tim = { id: 'tim-audit', username: text, role: 'tim', createdAt: '2026-09-01T10:00:00Z', pengampu: [] };
const kegiatan = Array.from({ length: 6 }, (_, i) => ({ id: `k${i}`, tanggal: `2026-09-0${i + 1}`, kegiatan: `${text} — dokumentasi kegiatan dan evaluasi bersama tim.`, waktu_menit: 180, capaian_delta: 5, capaian_total: (i + 1) * 5, foto_keys: [`audit-${i}.svg`] }));
const keuangan = kegiatan.map((k, i) => ({ id: `b${i}`, tanggal: k.tanggal, item: `${text} perlengkapan kegiatan`, harga_satuan: 1234567, jumlah: 2, total: 2469134, sumber: i % 2 ? 'pt' : 'belmawa', kategori: 'bahan', bukti_keys: [k.foto_keys[0]], satuan_suffix: '', kode_unik: 0 }));
const stat = { capaian_total: 30, jumlah_kegiatan: 6, total_waktu_menit: 1080, total_pengeluaran: 14814804, jumlah_belanja: 6, sisa_dana: 15185196, dana_awal: 30000000, dana_belmawa: 25000000, dana_pt: 5000000 };
const file = { ada: true, nama: `${text.repeat(2)}.docx`, ukuran: 450000, updated_at: '2026-09-05T10:00:00Z' };
const pres = { ada: true, file: { ...file, nama: `${text.repeat(2)}.pptx` }, canva: { ada: true, url: 'https://www.canva.com/design/audit/view', updated_at: file.updated_at } };
const sesi = [{ id: 's1', user_id: tim.id, username: tim.username, role: 'tim', perangkat: 'Chrome · Windows', ip: '192.0.2.x', terakhir: file.updated_at, dibuat: file.updated_at, membuka: true, ini_perangkat: true }];
const browser = await chromium.launch();
const results = [];
const unknown = new Set();
const docx = new JSZip();
docx.file('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
docx.file('_rels/.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
docx.file('word/document.xml', '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Dokumen tiruan untuk audit responsivitas.</w:t></w:r></w:p><w:sectPr><w:pgSz w:w="11906" w:h="16838"/></w:sectPr></w:body></w:document>');
const docxBuffer = await docx.generateAsync({ type: 'nodebuffer' });

async function contextFor(role = 'tim', theme = 'light', state = 'filled', teamCount = 1) {
  const user = role === 'tim' ? tim : { id: `audit-${role}`, username: `Pendamping ${text}`, role };
  const context = await browser.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true, reducedMotion: 'reduce', serviceWorkers: 'block' });
  context.on('page', (page) => page.on('pageerror', (e) => results.push({ name: `${role}-${theme}-${state}-runtime`, errors: [e.message] })));
  await context.addInitScript(({ user, theme, origin }) => {
    // InitScript juga berjalan di iframe sandbox; fixture sesi hanya untuk halaman utama.
    if (window !== window.top || location.origin !== origin) return;
    localStorage.setItem('logbook_token', 'audit-fixture-only');
    localStorage.setItem('logbook_user', JSON.stringify(user));
    localStorage.setItem('logbook_theme', theme);
    localStorage.setItem('logbook_tim_aktif', 'tim-audit');
    sessionStorage.setItem('mx', 'audit-fixture-only');
    if (location.pathname.replace(/\/$/, '') === '/login') {
      localStorage.removeItem('logbook_token');
      localStorage.removeItem('logbook_user');
    }
  }, { user, theme, origin: new URL(base).origin });
  await context.route('**/*', async (route) => {
    const u = new URL(route.request().url());
    const p = u.pathname;
    if (u.origin !== new URL(base).origin && !p.startsWith('/api/')) return route.fulfill({ contentType: 'text/html', body: '<html lang="id"><title>Pratinjau tiruan</title><body>Dokumen tiruan untuk audit tata letak.</body></html>' });
    const send = (data, status = 200) => route.fulfill({ status, json: data });
    if (p.startsWith('/audit-panel') && !p.includes('/data/') && !p.endsWith('/events')) return route.fulfill({ contentType: 'text/html', body: PANEL_HTML });
    if (p.includes('/data/')) {
      if (p.endsWith('/pengguna')) return send({ users: [tim, { ...user, id: 'dosen', role: 'dosen' }] });
      if (p.endsWith('/ringkas')) return send({ users: 2, kegiatan: 6, keuangan: 6, sesi: 1, dosen: 1 });
      if (p.endsWith('/sesi')) return send({ rows: sesi });
      if (p.endsWith('/audit')) return send({ rows: [] });
      return send({ ada: false, buka: true });
    }
    if (p.endsWith('/events')) return route.abort();
    if (p.startsWith('/api/foto') || p.startsWith('/uploads/') || p.startsWith('/api/files')) return route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect width="800" height="600" fill="#e0e7ff"/><text x="100" y="300" font-size="40">Foto audit</text></svg>' });
    if (!p.startsWith('/api/')) return route.continue();
    if (p === '/api/auth/me') return send({ user });
    if (p === '/api/auth/pendaftaran') return send({ tim: true });
    if (p === '/api/auth/denyut') return send({ ok: true });
    if (p === '/api/auth/sesi') return send(sesi);
    if (p === '/api/auth/aktivitas') return send([]);
    if (p === '/api/tim/kode') return send({ kode: 'ABCD2345', kode_tampil: 'ABCD-2345' });
    if (p === '/api/tim/pendamping') return send([]);
    if (/laporan(?:\/file|-file)$/.test(p)) return route.fulfill({ contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', body: docxBuffer });
    if (/laporan(?:\/file\/bagian|-bagian)$/.test(p)) return send({ urls: [] });
    if (p === '/api/fasilitator/tim') return send(state === 'empty' ? [] : Array.from({ length: teamCount }, (_, i) => ({ ...tim, id: i ? `tim-audit-${i}` : tim.id, username: `${text} ${i + 1}` })));
    if (p.endsWith('/kegiatan')) return send(state === 'empty' ? [] : kegiatan, state === 'error' ? 503 : 200);
    if (p.endsWith('/keuangan')) return send(state === 'empty' ? [] : keuangan, state === 'error' ? 503 : 200);
    if (p.endsWith('/statistik')) return send(stat, state === 'error' ? 503 : 200);
    if (p.endsWith('/ringkasan')) return send({ tim, statistik: stat, kegiatan_terakhir: kegiatan, laporan: file, presentasi: pres, persetujuan: {} });
    if (/laporan(?:\/info|-info)$/.test(p)) return send(state === 'empty' ? { ada: false } : file, state === 'error' ? 503 : 200);
    if (/presentasi(?:\/info|-info)$/.test(p)) return send(state === 'empty' ? { ada: false } : pres, state === 'error' ? 503 : 200);
    if (/tautan$/.test(p)) return send({ url: 'https://example.invalid/audit-document' });
    if (p.startsWith('/api/komentar')) return send(p === '/api/komentar' ? [{ id: 'c1', target_id: 'k0', penulis_id: user.id, penulis_username: user.username, penulis_role: role, isi: text, createdAt: file.updated_at }] : {});
    if (p.startsWith('/api/persetujuan')) return send({});
    if (p === '/api/ai/status') return send({ aktif: true, tersedia: true, modelAda: true, model: 'audit-model' });
    if (p === '/api/ai/profil-pkm') return send({ profil: { skema: '', tahun: null, judul: '', indikasi: [], status: 'perlu_konfirmasi' }, skema: SKEMA_PKM, sumber: Object.values(SUMBER_PKM), bisaUbah: role === 'tim' });
    if (p === '/api/ai/model') return send({ bawaan: 'audit-model', pilihan: '', daftar: [{ nama: 'audit-model', label: text }] });
    if (p === '/api/tunnel') return send({ url: '' });
    if (p === '/api/export/info') return send({ kegiatan: 6, keuangan: 6 });
    if (p.startsWith('/api/pengaturan/')) return send({ nilai: '0' });
    unknown.add(p); return send({});
  });
  return context;
}

async function measure(page, name) {
  await page.waitForTimeout(120);
  const geometry = await page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    const issues = [];
    const nodes = document.querySelectorAll('main *, .login-card *, dialog[open] *, .bottom-nav *, .topbar *, .ai-panel *, #v-app .page.on *, #v-app .side *');
    for (const el of nodes) {
      const r = el.getBoundingClientRect();
      const css = getComputedStyle(el);
      if (!r.width || !r.height || css.visibility === 'hidden' || el.closest('svg, [inert]')) continue;
      // Horizontal scrolling is intentional for wide tables/heatmaps/chip strips.
      let scrollParent = false;
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
        if (['auto', 'scroll'].includes(getComputedStyle(p).overflowX) && p.scrollWidth > p.clientWidth + 1) { scrollParent = true; break; }
      }
      if ((!scrollParent || el.matches('.sumber-menu, .user-menu, .ai-panel')) && (r.left < -1 || r.right > width + 1)) issues.push({ tag: el.tagName, class: String(el.className).slice(0, 70), text: el.textContent?.trim().slice(0, 60), left: Math.round(r.left), right: Math.round(r.right) });
    }
    return { width, documentWidth: document.documentElement.scrollWidth, overflow: issues.slice(0, 20) };
  });
  results.push({ name, ...geometry });
  if (geometry.overflow.length || geometry.documentWidth > geometry.width + 1) console.log('OVERFLOW', name, JSON.stringify(geometry.overflow.slice(0, 3)));
  if (process.env.AUDIT_SCREENSHOTS === '1' && (!/\dx\d/.test(name) || /320x740|1440x900/.test(name))) await page.screenshot({ path: `${out}/${name.replace(/[^a-z0-9-]/gi, '_')}.png`, fullPage: true });
}

try {
  if (process.env.AUDIT_NAV_ONLY !== '1' && process.env.AUDIT_MOBILE_ONLY !== '1') {
  for (const role of ['tim', 'fasilitator', 'dosen']) {
    for (const theme of (quick ? ['light'] : ['light', 'dark'])) {
      const context = await contextFor(role, theme);
      const page = await context.newPage();
      for (const path of routes.filter((r) => role === 'tim' || !['/login', '/galeri', '/ekspor'].includes(r))) {
        console.log('Audit', role, theme, path);
        await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
        await page.locator(path === '/login' ? '.login-card' : '#konten').waitFor();
        const marker = { '/': '.metric-value', '/kegiatan': '.entry', '/keuangan': '.tb-card', '/galeri': '.g-item', '/laporan': '.docx-nama', '/presentasi': '.docx-nama', '/profil': '.profil-head' }[path];
        if (marker) await page.locator(marker).first().waitFor();
        for (const [width, height] of sizes) {
          await page.setViewportSize({ width, height });
          if (path !== '/login') await expect(page.locator('.topbar h1:visible')).toHaveCount(1);
          await measure(page, `${role}-${theme}-${path}-${width}x${height}`);
        }
      }
      await context.close();
    }
  }
  // Interactive and alternate states at the narrowest supported width.
  const context = await contextFor();
  const page = await context.newPage();
  await page.setViewportSize({ width: 320, height: 740 });
  for (const path of ['/kegiatan', '/keuangan']) {
    await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Tambah entri', exact: true }).click();
    await page.locator('dialog[open]').waitFor();
    await measure(page, `dialog-${path}`);
    await page.keyboard.press('Escape');
  }
  await page.getByRole('button', { name: 'Lainnya', exact: true }).click();
  await measure(page, 'navigasi-lainnya');
  await page.keyboard.press('Escape');
  await page.locator('.mob-ava').focus();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('menuitem', { name: /Pengaturan akun/ })).toBeFocused();
  await page.keyboard.press('End');
  await expect(page.getByRole('menuitem', { name: 'Keluar', exact: true })).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('menuitem', { name: /Pengaturan akun/ })).toBeFocused();
  await measure(page, 'menu-akun-mobile');
  await page.keyboard.press('Escape');
  await expect(page.locator('.mob-ava')).toBeFocused();
  await page.locator('.sumber-btn').first().click();
  await measure(page, 'menu-sumber-mobile');
  await page.keyboard.press('Escape');
  await page.goto(`${base}/galeri`, { waitUntil: 'networkidle' });
  await page.locator('.g-item').first().focus();
  await page.keyboard.press('Space');
  await page.locator('.lb').waitFor();
  for (let i = 0; i < 5; i++) {
    await page.keyboard.press('Tab');
    const focused = await page.evaluate(() => ({ class: document.activeElement.className, visible: document.activeElement.getClientRects().length > 0 }));
    if (!focused.visible || !focused.class.includes('lb-')) throw new Error('Fokus keluar dari lightbox');
  }
  await page.keyboard.press('Escape');
  if (!await page.locator('.g-item').first().evaluate((el) => el === document.activeElement)) throw new Error('Fokus galeri tidak kembali');
  await page.locator('.ai-fab').click();
  const question = page.getByRole('textbox', { name: 'Pertanyaan untuk asisten AI' });
  await expect(question).toBeFocused();
  await question.fill('Pertanyaan IME');
  await question.dispatchEvent('keydown', { key: 'Enter', code: 'Enter', isComposing: true, bubbles: true });
  await expect(question).toHaveValue('Pertanyaan IME');
  await measure(page, 'ai-panel-mobile');
  await page.locator('.ai-model-btn').click();
  await measure(page, 'ai-pemilih-model');
  await page.keyboard.press('Escape');
  await expect(page.locator('.ai-model-btn')).toBeFocused();
  await expect(page.locator('.ai-panel')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.ai-fab')).toBeFocused();
  await expect(page.locator('.ai-panel')).toHaveCount(0);
  await page.locator('.ai-fab').click();
  let pendingAI;
  await page.route('**/api/ai/tanya', (route) => { pendingAI = route; });
  await question.press('Enter');
  await expect.poll(() => !!pendingAI).toBe(true);
  const outsideAI = page.locator('.bottom-nav a').first();
  await outsideAI.focus();
  await page.keyboard.press('Escape');
  await expect(page.locator('.ai-panel')).toBeVisible();
  await pendingAI.fulfill({ json: { jawaban: 'Jawaban audit tiruan', model: 'audit-model' } });
  await expect(page.getByRole('log')).toContainText('Jawaban audit tiruan');
  await expect(question).toBeEnabled();
  await expect(outsideAI).toBeFocused();
  await page.locator('.ai-panel').getByRole('button', { name: 'Tutup', exact: true }).click();
  await expect(page.locator('.ai-fab')).toBeFocused();
  results.push({ name: 'keyboard-ai-ime-escape-fokus-jawaban', status: 'passed' });
  await page.goto(`${base}/login`, { waitUntil: 'networkidle' });
  await page.locator('.login-tabs').getByRole('button', { name: 'Daftar', exact: true }).click();
  await measure(page, 'pendaftaran-mobile');
  await page.goto(`${base}/`, { waitUntil: 'networkidle' });
  await page.setViewportSize({ width: 1280, height: 500 });
  await page.locator('.sb-collapse').click();
  await measure(page, 'sidebar-mini-layar-pendek');
  const side = await page.locator('.sidebar .sb-user').boundingBox();
  if (!side || side.y + side.height > 500) throw new Error('Menu akun sidebar tidak terjangkau');
  await expect(page.locator('.sb-user')).toHaveAccessibleName(`Menu akun ${text}`);
  await page.locator('.sb-user').focus();
  await page.keyboard.press('ArrowUp');
  await expect(page.getByRole('menuitem', { name: 'Keluar', exact: true })).toBeFocused();
  await page.keyboard.press('Home');
  await expect(page.getByRole('menuitem', { name: /Pengaturan akun/ })).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('menuitem', { name: 'Keluar', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('.sb-user')).toBeFocused();
  await page.keyboard.press('Enter');
  await page.locator('.sb-menu a').first().focus();
  await expect(page.getByRole('menu', { name: 'Menu akun', exact: true })).toHaveCount(0);
  results.push({ name: 'keyboard-akun-desktop-mobile', status: 'passed' });
  await context.close();
  const pendamping = await contextFor('dosen');
  const pp = await pendamping.newPage();
  await pp.setViewportSize({ width: 320, height: 740 });
  await pp.goto(`${base}/kegiatan`, { waitUntil: 'networkidle' });
  await pp.locator('.tim-chips > button').click();
  await pp.getByRole('menuitem', { name: /Tambah tim/ }).click();
  await measure(pp, 'pendamping-tambah-tim');
  await pp.keyboard.press('Escape');
  await pp.getByRole('button', { name: 'Komentar', exact: true }).first().click();
  await measure(pp, 'pendamping-komentar');
  await pp.getByRole('button', { name: 'Minta revisi', exact: true }).first().click();
  await pp.getByRole('textbox', { name: 'Catatan perbaikan untuk tim', exact: true }).waitFor();
  await pp.getByRole('button', { name: 'Batal meminta revisi', exact: true }).waitFor();
  await measure(pp, 'dosen-revisi');
  await pendamping.close();
  const manyTeams = await contextFor('fasilitator', 'light', 'filled', 24);
  const mp = await manyTeams.newPage();
  await mp.goto(`${base}/kegiatan`, { waitUntil: 'networkidle' });
  const teamTrigger = mp.locator('.tim-chips > button');
  for (const [width, height] of [[320, 740], [844, 390], [1280, 500]]) {
    await mp.setViewportSize({ width, height });
    await teamTrigger.focus();
    await mp.keyboard.press('ArrowDown');
    await expect(mp.locator('.tim-menu [role="menuitem"]').first()).toBeFocused();
    await mp.keyboard.press('End');
    const add = mp.getByRole('menuitem', { name: /Tambah tim/ });
    await expect(add).toBeFocused();
    const menuBounds = await mp.locator('.tim-menu').boundingBox();
    const addBounds = await add.boundingBox();
    if (!menuBounds || !addBounds || menuBounds.y < 0 || menuBounds.y + menuBounds.height > height || addBounds.y + addBounds.height > menuBounds.y + menuBounds.height + 1) throw new Error('Dropdown banyak tim terpotong');
    await measure(mp, `keyboard-banyak-tim-${width}x${height}`);
    await mp.keyboard.press('Home');
    await mp.keyboard.press('Enter');
    await expect(teamTrigger).toBeFocused();
    await mp.keyboard.press('ArrowUp');
    await expect(add).toBeFocused();
    await mp.keyboard.press('Escape');
    await expect(teamTrigger).toBeFocused();
  }
  await manyTeams.close();
  for (const state of ['empty', 'error']) {
    const c = await contextFor('tim', 'light', state);
    const p = await c.newPage();
    await p.setViewportSize({ width: 320, height: 740 });
    for (const path of ['/', '/kegiatan', '/keuangan', '/galeri', '/laporan', '/presentasi']) {
      await p.goto(`${base}${path}`, { waitUntil: 'networkidle' });
      await measure(p, `${state}-${path}`);
    }
    await c.close();
  }
  const admin = await contextFor();
  const ap = await admin.newPage();
  for (const path of ['', '/akun', '/sesi', '/audit', '/pengaturan']) {
    await ap.goto(`${base}/audit-panel${path}`, { waitUntil: 'networkidle' });
    await ap.locator('#v-app').waitFor();
    if (await ap.locator('.side-nav a[aria-label]').count() !== 5) throw new Error('Nama navigasi admin tidak lengkap');
    if (await ap.locator('.side-nav a[aria-current="page"]').count() !== 1) throw new Error('Status halaman aktif admin tidak valid');
    for (const [width, height] of sizes) {
      await ap.setViewportSize({ width, height });
      await measure(ap, `admin-${path}-${width}x${height}`);
    }
  }
  for (const dialog of await ap.locator('dialog').all()) {
    const id = await dialog.getAttribute('id');
    for (const [width, height] of [[320, 740], [844, 390], [1440, 900]]) {
      await ap.setViewportSize({ width, height });
      await dialog.evaluate((el) => el.showModal());
      await measure(ap, `admin-dialog-${id}-${width}x${height}`);
      await dialog.evaluate((el) => el.close());
    }
  }
  await ap.evaluate(() => sessionStorage.removeItem('mx'));
  await ap.route('**/audit-panel-login', (route) => route.fulfill({ contentType: 'text/html', body: PANEL_HTML.replace('var TOK = sessionStorage.getItem("mx") || "";', 'var TOK = "";') }));
  await ap.goto(`${base}/audit-panel-login`, { waitUntil: 'networkidle' });
  await ap.setViewportSize({ width: 320, height: 740 });
  await ap.locator('#v-login').waitFor();
  await measure(ap, 'admin-login-mobile');
  await admin.close();
  }
  if (process.env.AUDIT_MOBILE_ONLY !== '1') results.push(...await auditNavigasi(contextFor, base, quick));
  if (process.env.AUDIT_NAV_ONLY !== '1') await auditMobile(contextFor, base, quick, measure, out);
} finally {
  await browser.close();
  await writeFile(`${out}/hasil.json`, JSON.stringify({ generatedAt: new Date().toISOString(), unknownApi: [...unknown], results }, null, 2));
}
const failed = results.filter((r) => r.errors?.length || r.overflow?.length || r.documentWidth > r.width + 1);
console.log(`${results.length} skenario; ${failed.length} bermasalah. Hasil: ${out}hasil.json`);
if (unknown.size) console.error('API belum memiliki fixture:', [...unknown]);
if (failed.length || unknown.size) process.exitCode = 1;
