// Audit mandiri Pusat Kendali: HTML asli, seluruh data/API tiruan, tanpa kredensial.
import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { PANEL_HTML } from '../backend/src/admin/panel.js';
import { SKEMA_PKM, SUMBER_PKM } from '../backend/src/ai/pkm-knowledge.js';

const base = 'http://127.0.0.1:3198/panel-audit';
const out = new URL('../artifacts/audit-panel/', import.meta.url);
await mkdir(out, { recursive: true });
const long = 'NamaTimTanpaSpasiUntukMengujiBatasLebarDanKeterbacaan';
const stamp = '2026-09-06T04:00:00Z';
const users = ['tim', 'tim', 'fasilitator', 'dosen'].map((role, i) => ({
  id: `u${i}`, role, username: i ? `Akun audit ${i}` : long, createdAt: stamp,
  kegiatan: 2, keuangan: 2, foto: 2, sesi: i === 0 ? 1 : 0, pengampu: [],
  loginTerakhir: stamp, aktivitasTerakhir: stamp, n_tim_diampu: 2,
}));
const sesi = [{ id: 's1', user_id: 'u0', username: long, role: 'tim', perangkat: 'Chrome · Android', ip: '192.0.2.12', penuh: true, membuka: true, layar: 'terlihat', dibuat: stamp, terakhir: stamp }];
const audit = ['login.berhasil', 'user.username', 'user.hapus', 'user.lihat'].map(aksi => ({ aksi, ts: stamp, username: long, ip: '192.0.2.12', sumber: 'panel', ringkas: long }));
const file = { ada: true, nama: long + '.docx', ukuran: 54321, updated_at: stamp };
const detail = {
  user: users[0], kegiatan: [{ id: 'k1', tanggal: '2026-09-06', kegiatan: long.repeat(3), capaian_total: 91, capaian_delta: 5, waktu_menit: 420, foto_keys: ['audit.svg'] }],
  keuangan: [{ id: 'b1', tanggal: '2026-09-06', item: long.repeat(2), harga_satuan: 123450, jumlah: 2, total: 246900, bukti_keys: ['audit.svg'] }],
  ringkasan: { capaian_total: 91, total_menit: 420, dana_awal: 8500000, dana_belmawa: 6500000, dana_pt: 2000000, pengeluaran: 246900, sisa: 8253100 },
  laporan: file, presentasi: { ada: true, file: { ...file, nama: long + '.pptx' }, canva: { ada: true, url: 'https://www.canva.com/design/audit/view' } },
  pkm: { profil: { skema: 'PKM-KC', tahun: 2026, judul: long.repeat(4), status: 'dikonfirmasi_tim' }, skema: SKEMA_PKM, sumber: Object.values(SUMBER_PKM) },
};
const sizes = [[320,740],[375,812],[430,932],[640,800],[768,1024],[900,700],[1024,600],[1440,900],[1920,1080],[844,390]];
const results = [], errors = [], unknown = new Set(), mutations = [];
const browser = await chromium.launch();
async function context(theme = 'light', login = false, blocked = false) {
  const c = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: theme, reducedMotion: 'reduce', serviceWorkers: 'block' });
  await c.addInitScript(({ theme, login, blocked }) => {
    if (window !== window.top || location.origin !== 'http://127.0.0.1:3198') return;
    if (!login) sessionStorage.setItem('mx', 'synthetic-panel-session');
    if (theme && !localStorage.getItem('logbook_admin_theme')) localStorage.setItem('logbook_admin_theme', theme);
    if (blocked) { Storage.prototype.getItem = function () { throw new Error('storage blocked'); }; Storage.prototype.setItem = function () { throw new Error('storage blocked'); }; }
  }, { theme, login, blocked });
  c.on('page', p => p.on('pageerror', e => errors.push({ message: e.message, url: p.url(), stack: e.stack })));
  await c.route('**/*', async route => {
    const u = new URL(route.request().url());
    if (!u.href.startsWith(base)) { unknown.add(u.pathname); return route.abort(); }
    const p = u.pathname.slice('/panel-audit'.length);
    if (route.request().method() !== 'GET') mutations.push({ path: p, method: route.request().method() });
    const send = json => route.fulfill({ json });
    if (['', '/akun', '/sesi', '/audit', '/pengaturan'].includes(p)) return route.fulfill({ contentType: 'text/html', body: PANEL_HTML });
    if (p === '/events') return route.abort();
    if (p.startsWith('/berkas/')) return route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="80"><rect width="100" height="80" fill="#8993a3"/></svg>' });
    if (p === '/data/ringkas') return send({ users: 4, fasilitator: 1, dosen: 1, kegiatan: 2, keuangan: 2, sesi: 1, acc: 2, laporan: 1, presentasi: 1 });
    if (p === '/data/pengguna') return send({ users });
    if (p === '/data/audit') return send({ rows: audit });
    if (p === '/data/sesi' || p === '/data/pengguna/u0/sesi') return send({ rows: sesi });
    if (p === '/data/pengguna/u0/aktivitas') return send({ rows: audit });
    if (p === '/data/pengguna/u0') return send(detail);
    if (/^\/data\/kode-(fasilitator|dosen)$/.test(p)) return send({ ada: true, updatedAt: stamp });
    if (p === '/data/pendaftaran-tim') return send({ buka: true });
    if (p === '/data/tim/u0/fasilitator') return send({ fasilitator: [users[2]] });
    if (p === '/data/fasilitator/u2/tim') return send({ tim: [users[0]] });
    unknown.add(p); return route.fulfill({ status: 404, json: { error: 'Fixture belum disediakan' } });
  });
  return c;
}
async function measure(page, name, screenshot = false) {
  const geometry = await page.evaluate(() => {
    const width = document.documentElement.clientWidth, height = document.documentElement.clientHeight;
    const modal = document.querySelector('dialog[open]');
    const root = modal || (document.querySelector('#v-app').classList.contains('hide') ? document.querySelector('#v-login') : document.querySelector('#v-app'));
    const overflow = [], smallTargets = [];
    for (const el of [root, ...root.querySelectorAll('*')]) {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height || el.closest('svg') || getComputedStyle(el).visibility === 'hidden') continue;
      let scroll = false;
      for (let p = el.parentElement; p && p !== root; p = p.parentElement) {
        if (p.matches('.tbl,.tabs,.seg') && ['auto','scroll'].includes(getComputedStyle(p).overflowX) && p.scrollWidth > p.clientWidth + 1) { scroll = true; break; }
      }
      if (!scroll && (r.left < -1 || r.right > width + 1)) overflow.push({ tag: el.tagName, class: String(el.className), left: r.left, right: r.right });
      if (width <= 640 && el.matches('button:not(:disabled)') && (r.width < 43 || r.height < 43)) smallTargets.push({ label: el.getAttribute('aria-label') || el.textContent, width: r.width, height: r.height });
    }
    const bounds = modal?.getBoundingClientRect();
    return { width, documentWidth: document.documentElement.scrollWidth, overflow, smallTargets, clippedDialog: !!bounds && (bounds.top < -1 || bounds.bottom > height + 1) };
  });
  results.push({ name, ...geometry });
  if (geometry.overflow.length || geometry.smallTargets.length || geometry.documentWidth > geometry.width + 1 || geometry.clippedDialog) console.log('FAIL', name, JSON.stringify(geometry));
  if (screenshot) await page.screenshot({ path: fileURLToPath(new URL(name + '.png', out)), fullPage: true });
}
async function paletteContrast(page) {
  const ratios = await page.evaluate(() => {
    const probe = document.createElement('span'); document.body.appendChild(probe);
    const rgb = name => { probe.style.color = `var(${name})`; return getComputedStyle(probe).color.match(/[\d.]+/g).slice(0,3).map(Number); };
    const lum = values => values.map(v => { v /= 255; return v <= .04045 ? v/12.92 : ((v+.055)/1.055)**2.4; }).reduce((a,v,i) => a + v*[.2126,.7152,.0722][i], 0);
    // Warna gradien tetap sama; periksa kontras teksnya pada setiap titik warna.
    const pairs = [['--ink','--panel'],['--mut','--panel2']];
    const values = pairs.map(([fg,bg]) => { const a=lum(rgb(fg)), b=lum(rgb(bg)); return { fg,bg,ratio:(Math.max(a,b)+.05)/(Math.min(a,b)+.05) }; });
    for (const selector of ['#tema-sidebar']) {
      const el = document.querySelector(selector);
      if (!el) continue;
      const css = getComputedStyle(el);
      const a = lum(css.color.match(/[\d.]+/g).slice(0,3).map(Number));
      const b = lum(css.backgroundColor.match(/[\d.]+/g).slice(0,3).map(Number));
      values.push({ selector, ratio: (Math.max(a,b)+.05)/(Math.min(a,b)+.05) });
    }
    const primary = document.querySelector('#hal-akun .btn.p');
    const style = getComputedStyle(primary);
    const fg = lum(style.color.match(/[\d.]+/g).slice(0,3).map(Number));
    for (const stop of style.backgroundImage.match(/rgba?\([^)]*\)/g) || []) {
      const bg = lum(stop.match(/[\d.]+/g).slice(0,3).map(Number));
      values.push({ selector: '.btn.p gradient', stop, ratio: (Math.max(fg,bg)+.05)/(Math.min(fg,bg)+.05) });
    }
    probe.remove(); return values;
  });
  for (const pair of ratios) expect(pair.ratio, JSON.stringify(pair)).toBeGreaterThanOrEqual(4.5);
}
try {
  for (const theme of ['light','dark']) {
    const c = await context(theme); const page = await c.newPage();
    await page.goto(base); await expect(page.locator('#statistik .stat')).toHaveCount(9);
    await expect(page.locator('html')).toHaveAttribute('data-admin-theme', theme);
    await expect(page.locator('[data-admin-theme-select],.appearance-card,.login-top')).toHaveCount(0);
    await expect(page.locator('.side')).toHaveCSS('width', '236px');
    await expect(page.locator('.wrap')).toHaveCSS('max-width', '1160px');
    await expect(page.locator('.card').first()).toHaveCSS('border-radius', '18px');
    await expect(page.locator('.hero-ic').first()).toBeVisible();
    await expect(page.locator('.orbs')).toBeVisible();
    if (theme === 'dark') {
      await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(7, 10, 20)');
      await expect(page.locator('.card').first()).toHaveCSS('background-color', 'rgb(14, 19, 41)');
    }
    await paletteContrast(page);
    for (const section of ['ringkas','akun','sesi','audit','pengaturan']) {
      await page.locator(`.side-nav [data-page="${section}"]`).click();
      await expect(page.locator('.page.on')).toHaveAttribute('id', 'hal-' + section);
      for (const [width,height] of sizes) {
        await page.setViewportSize({ width,height });
        await measure(page, `${theme}-${section}-${width}x${height}`, [375,1440].includes(width));
      }
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.locator('#btn-mini').click();
    await page.waitForTimeout(300);
    await measure(page, `${theme}-sidebar-mini`);
    await page.locator('.side-nav [data-page="akun"]').click();
    for (const role of ['fasilitator', 'dosen']) {
      await page.locator(`[data-role-tab="${role}"]`).click();
      for (const [width,height] of [[320,740],[844,390],[1440,900]]) {
        await page.setViewportSize({ width,height });
        await measure(page, `${theme}-akun-${role}-${width}x${height}`);
      }
    }
    await page.locator('[data-role-tab="tim"]').click();
    await page.setViewportSize({ width: 1440, height: 900 });
    await expect(page.locator('#t-users button.btn.ic:not([aria-label])')).toHaveCount(0);
    const rename = page.locator('[data-act="un"][data-id="u0"]').first();
    await page.evaluate(() => { document.querySelector('#d-un').returnValue = 'ok'; });
    await rename.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#d-un')).toBeVisible();
    await expect(page.locator('#d-un')).toHaveJSProperty('returnValue', '');
    await page.keyboard.press('Escape');
    await expect(page.locator('#d-un')).toBeHidden();
    await expect(rename).toBeFocused();
    results.push({ name: `${theme}-dialog-cancel-focus-no-mutation`, overflow: [] });
    await page.locator('[data-act="detail"][data-id="u0"]').first().click();
    const dialog = page.locator('#d-detail'); await expect(dialog).toBeVisible();
    for (const tab of ['keg','keu','lap','pre','pkm','ses','akt']) {
      await dialog.locator(`[data-tab="${tab}"]`).click();
      if (tab === 'keg' || tab === 'keu') {
        const photo = dialog.locator('.thumb-action').first();
        await expect(photo).toHaveAttribute('aria-label', /Buka (foto|bukti)/);
        await expect(photo.locator('img')).toHaveAttribute('alt', '');
      }
      if (tab === 'pkm') await dialog.locator('details summary').click();
      for (const [width,height] of [[320,740],[844,390],[1440,900]]) {
        await page.setViewportSize({ width,height });
        if (tab === 'pkm') {
          await dialog.locator('#f-pkm-admin button[type="submit"]').focus();
          await expect.poll(() => page.evaluate(() => {
            const el = document.activeElement, r = el.getBoundingClientRect();
            const x = r.left + r.width / 2, y = r.top + r.height / 2;
            return r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight && el.contains(document.elementFromPoint(x,y));
          }), { message: 'Fokus tombol Simpan PKM harus terlihat pada ' + width + 'x' + height }).toBe(true);
        }
        await measure(page, `${theme}-detail-${tab}-${width}x${height}`, tab === 'pkm');
      }
    }
    await dialog.getByRole('button', { name: 'Tutup', exact: true }).click();
    for (const [fn,arg,id] of [['assignFasilitator','u0','d-fas'],['assignTim','u2','d-tim'],['gantiUsername','u0','d-un'],['resetPassword','u0','d-pw']]) {
      await page.evaluate(([fn,arg]) => window[fn](arg), [fn,arg]);
      await expect(page.locator('#' + id)).toBeVisible();
      for (const [width,height] of [[320,740],[844,390],[1440,900]]) { await page.setViewportSize({ width,height }); await measure(page, `${theme}-${id}-${width}x${height}`); }
      await page.locator('#' + id).getByRole('button', { name: 'Batal', exact: true }).click();
    }
    await page.locator('[data-act="baru"]').click();
    await expect(page.locator('#d-baru')).toBeVisible();
    for (const [width,height] of [[320,740],[844,390],[1440,900]]) { await page.setViewportSize({ width,height }); await measure(page, `${theme}-akun-baru-${width}x${height}`); }
    await page.locator('#d-baru').getByRole('button', { name: 'Batal' }).click();
    await page.evaluate(() => { window.hapusUser('u0'); });
    await expect(page.locator('#d-konfirmasi')).toBeVisible();
    for (const [width,height] of [[320,740],[844,390],[1440,900]]) { await page.setViewportSize({ width,height }); await measure(page, `${theme}-konfirmasi-${width}x${height}`); }
    await page.locator('#d-konfirmasi').getByRole('button', { name: 'Batal' }).click();
    await page.locator('.side-nav [data-page="sesi"]').click();
    await page.locator('[data-mode-sesi="akun"]').click();
    const expand = page.locator('.asx-tgl').first();
    await expand.focus(); await page.keyboard.press('Enter');
    await expect(expand).toBeFocused();
    await expect(expand).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('#' + await expand.getAttribute('aria-controls'))).toBeVisible();
    await page.keyboard.press('Space');
    await expect(expand).toBeFocused();
    await expect(expand).toHaveAttribute('aria-expanded', 'false');
    await page.keyboard.press('Enter');
    results.push({ name: `${theme}-session-card-keyboard`, overflow: [] });
    for (const [width,height] of sizes) { await page.setViewportSize({ width,height }); await measure(page, `${theme}-sesi-kartu-${width}x${height}`); }
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
    await measure(page, `${theme}-larger-text-200-percent`);
    await page.evaluate(() => { document.documentElement.style.fontSize = ''; });
    await page.locator('#tema-sidebar').click();
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-admin-theme', theme === 'light' ? 'dark' : 'light');
    await expect(page.locator('#tema-sidebar')).toHaveAccessibleName(theme === 'light' ? 'Mode terang' : 'Mode gelap');
    await page.locator('#tema-sidebar').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('html')).toHaveAttribute('data-admin-theme', theme);
    await page.setViewportSize({ width: 375, height: 812 });
    await expect(page.locator('#tema-sidebar')).toBeHidden();
    await expect(page.locator('#tema-panel')).toBeVisible();
    await page.locator('#tema-panel').focus();
    await page.keyboard.press('Space');
    await expect(page.locator('html')).toHaveAttribute('data-admin-theme', theme === 'light' ? 'dark' : 'light');
    await expect(page.locator('#tema-panel ' + (theme === 'light' ? '.theme-sun' : '.theme-moon'))).toBeVisible();
    results.push({ name: `${theme}-tombol-tema-desktop-mobile-keyboard-reload`, overflow: [], clippedDialog: false });
    await c.close();
    const loginContext = await context(theme, true); const login = await loginContext.newPage();
    await login.goto(base); await expect(login.locator('#v-login')).toBeVisible();
    for (const [width,height] of sizes) { await login.setViewportSize({ width,height }); await measure(login, `${theme}-login-${width}x${height}`, width === 375); }
    await login.locator('#tema-login').click();
    await expect(login.locator('html')).toHaveAttribute('data-admin-theme', theme === 'light' ? 'dark' : 'light');
    await loginContext.close();
  }
} finally {
  await browser.close();
  await writeFile(new URL('hasil.json', out), JSON.stringify({ generatedAt: new Date().toISOString(), results, errors, unknown: [...unknown], mutations }, null, 2));
}
const failed = results.filter(r => r.overflow.length || r.smallTargets?.length || r.documentWidth > r.width + 1 || r.clippedDialog);
console.log(`${results.length} skenario panel; ${failed.length} masalah tata letak; ${errors.length} error runtime; ${unknown.size} fixture tidak dikenal.`);
if (mutations.length) console.error('Mutasi tidak diharapkan:', JSON.stringify(mutations));
if (failed.length || errors.length || unknown.size || mutations.length) process.exitCode = 1;

