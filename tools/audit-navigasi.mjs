import { expect } from '@playwright/test';

// Dipanggil audit-desain dengan fixture API yang sama; tidak memakai data nyata.
export async function auditNavigasi(contextFor, base, quick) {
  const results = [];
  for (const role of (quick ? ['tim'] : ['tim', 'fasilitator', 'dosen'])) {
    for (const theme of (quick ? ['light'] : ['light', 'dark'])) {
      for (const [width, height, sidebar = 'lebar'] of (quick
        ? [[1440, 900, 'lebar'], [1440, 900, 'mini']]
        : [[375, 812], [844, 390], [1440, 900, 'lebar'], [1440, 900, 'mini']])) {
        const context = await contextFor(role, theme);
        const page = await context.newPage();
        await page.emulateMedia({ reducedMotion: 'no-preference' });
        await page.setViewportSize({ width, height });
        // Revalidasi yang lambat tidak boleh menghilangkan data tim yang sudah di-cache.
        await context.route('**/api/**', async (route) => {
          await new Promise((resolve) => setTimeout(resolve, 350));
          await route.fallback();
        });
        const errors = [], documents = [], badResponses = [];
        page.on('pageerror', (e) => errors.push(e.message));
        page.on('request', (r) => { if (r.isNavigationRequest() && r.frame() === page.mainFrame()) documents.push(r.url()); });
        page.on('response', (r) => { if (r.status() >= 400) badResponses.push(`${r.status()} ${r.url()}`); });
        page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
        try {
          await page.goto(base, { waitUntil: 'networkidle' });
          await page.locator('.metric-value').first().waitFor();
          await page.waitForTimeout(1000);
          const nav = width > 900 ? '.sb-menu' : '.bottom-nav';
          if (width > 900 && sidebar === 'mini') {
            await page.getByRole('button', { name: 'Perkecil menu samping' }).click();
            await expect.poll(() => page.locator('.sidebar').evaluate((el) => Math.round(el.getBoundingClientRect().width))).toBe(78);
            await page.locator('.sidebar').evaluate((el) => Promise.all(el.getAnimations().map((animation) => animation.finished)));
          }
          const paths = ['/kegiatan', '/keuangan', '/laporan', '/presentasi',
            ...(role === 'tim' ? ['/galeri', '/ekspor'] : []), '/profil', '/', '/kegiatan', '/keuangan', '/'];
          const steps = [...paths.map((path) => ({ path })), { path: '/keuangan', history: 'back' }, { path: '/', history: 'forward' }];
          for (const { path, history } of steps) {
            await page.evaluate((selector) => {
              const nav = document.querySelector(selector);
              const bounds = nav.getBoundingClientRect();
              window.__navProbe = { shell: document.querySelector('.app'), nav, bounds,
                background: getComputedStyle(nav).backgroundColor, frames: [], running: true };
              const sample = () => {
                const p = window.__navProbe;
                if (!p?.running) return;
                const nav = document.querySelector(selector);
                const css = getComputedStyle(nav);
                const rect = nav.getBoundingClientRect();
                p.frames.push({ path: location.pathname, splash: !!document.querySelector('.auth-splash'),
                  skeleton: !!document.querySelector('#konten > .skel'),
                  shell: p.shell === document.querySelector('.app'),
                  theme: document.documentElement.dataset.theme,
                  unstableNav: nav !== p.nav || Number(css.opacity) < 1 || css.backgroundColor !== p.background ||
                    ['x', 'y', 'width', 'height'].some((k) => Math.abs(rect[k] - p.bounds[k]) > 1) ||
                    [...nav.querySelectorAll('a, button')].some((el) => getComputedStyle(el).transform !== 'none') });
                requestAnimationFrame(sample);
              };
              requestAnimationFrame(sample);
            }, nav);
            const before = documents.length;
            if (history === 'back') await page.goBack();
            else if (history === 'forward') await page.goForward();
            else if (path === '/profil') {
              await page.locator(width > 900 ? '.sb-user' : '.mob-ava').click();
              await page.getByRole('menuitem', { name: /Pengaturan akun/ }).click();
            } else if (width <= 900 && role === 'tim' && ['/presentasi', '/galeri', '/ekspor'].includes(path)) {
              await page.getByRole('button', { name: 'Lainnya', exact: true }).click();
              await page.locator(`#nav-lainnya a[href="${path}"]`).click();
            } else await page.locator(`${nav} a[href="${path}"]`).click();
            await expect(page).toHaveURL(`${base.replace(/\/$/, '')}${path}`);
            await page.waitForTimeout(1000);
            const frames = await page.evaluate(() => {
              if (!window.__navProbe) return null;
              window.__navProbe.running = false;
              return window.__navProbe.frames;
            });
            const finding = { name: `navigasi-${role}-${theme}-${width}x${height}-${sidebar}-${history || 'klik'}-${path}`, documents: documents.length - before,
              lostProbe: !frames, shellFlashes: frames?.filter((f) => !f.shell || f.splash).length || 0,
              skeletonFrames: frames?.filter((f) => f.skeleton).length || 0,
              themeFlashes: frames?.filter((f) => f.theme !== theme).length || 0,
              navFlashes: frames?.filter((f) => f.unstableNav).length || 0, errors: [...errors], badResponses: [...badResponses] };
            console.log('NAV', JSON.stringify(finding));
            results.push(finding);
            expect(finding.documents, 'Navigasi tidak boleh memuat ulang dokumen').toBe(0);
            expect(finding.lostProbe, 'State JavaScript harus bertahan antarmenu').toBe(false);
            expect(finding.shellFlashes, 'Sidebar/topbar tidak boleh menghilang').toBe(0);
            expect(finding.themeFlashes, 'Tema tidak boleh berganti saat navigasi').toBe(0);
            if (width > 900) expect(finding.navFlashes, 'Nav desktop tidak boleh mengecil, bergeser, transparan, atau diganti saat navigasi').toBe(0);
            expect(errors).toEqual([]);
            expect(badResponses).toEqual([]);
          }
        } finally { await context.close(); }
      }
    }
  }
  for (const role of (quick ? ['tim'] : ['tim', 'fasilitator', 'dosen'])) {
    const context = await contextFor(role);
    let release;
    const pending = new Promise((resolve) => { release = resolve; });
    await context.route('**/api/**', async (route) => {
      if (new URL(route.request().url()).pathname.endsWith('/kegiatan')) await pending;
      await route.fallback();
    });
    const page = await context.newPage();
    try {
      await page.goto(`${base.replace(/\/$/, '')}/kegiatan`, { waitUntil: 'domcontentloaded' });
      await expect(page.locator('#konten > .skel')).toBeVisible();
      await expect(page.locator('.bottom-nav')).toBeVisible();
      release();
      await expect(page.locator('.entry').first()).toBeVisible();
      await expect(page.locator('#konten > .skel')).toHaveCount(0);
      results.push({ name: `skeleton-jaringan-lambat-${role}`, status: 'passed' });
    } finally { release(); await context.close(); }
  }
  return results;
}

