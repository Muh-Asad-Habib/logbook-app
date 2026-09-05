import { expect } from '@playwright/test';

// Seluruh data/API berasal dari contextFor milik audit-desain.
export async function auditMobile(contextFor, base, quick, measure, out) {
  for (const theme of (quick ? ['light'] : ['light', 'dark'])) {
    const context = await contextFor('tim', theme);
    const page = await context.newPage();
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    try {
      for (const [width, height] of (quick ? [[320, 740]] : [[320, 740], [375, 812], [430, 932], [844, 390]])) {
        await page.setViewportSize({ width, height });
        for (const path of ['/kegiatan', '/keuangan']) {
          await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
          await page.getByRole('button', { name: 'Tambah entri', exact: true }).click();
          const dialog = page.locator('.entry-dialog[open]');
          await expect(dialog).toBeVisible();
          await dialog.locator('[name="tanggal"]').fill('2026-09-05');
          if (path === '/kegiatan') {
            await dialog.locator('[name="waktu_jam_input"]').fill('1.5');
            await dialog.locator('[name="waktu_menit_input"]').fill('15');
            await dialog.locator('[name="kegiatan"]').fill('Kegiatan uji tampilan mobile, tanpa disimpan.');
          } else {
            await dialog.locator('[name="item"]').fill('Perlengkapan uji tampilan mobile');
            await dialog.locator('[name="harga_satuan"]').fill('125000');
            await dialog.locator('[name="jumlah"]').fill('2');
          }
          for (const field of await dialog.locator('input[type="number"]').all()) {
            await expect(field).toHaveAttribute('inputmode', 'decimal');
          }
          const save = dialog.getByRole('button', { name: 'Simpan', exact: true });
          await save.scrollIntoViewIfNeeded();
          const bounds = await save.boundingBox();
          expect(bounds.y).toBeGreaterThanOrEqual(0);
          expect(bounds.y + bounds.height).toBeLessThanOrEqual(height + 1);
          expect(bounds.height).toBeGreaterThanOrEqual(44);
          await measure(page, `mobile-form-${theme}-${path}-${width}x${height}`);
          if (process.env.AUDIT_SCREENSHOTS === '1') {
            await page.screenshot({ path: `${out}mobile-form-${theme}-${path.slice(1)}-${width}.png` });
          }
          await page.keyboard.press('Escape');
          await expect(dialog).toHaveCount(0);
        }
        await page.goto(base, { waitUntil: 'networkidle' });
        await page.locator('.ai-fab').click();
        await page.locator('.ai-panel').evaluate((el) => Promise.all(el.getAnimations().map((animation) => animation.finished)));
        const input = page.getByRole('textbox', { name: 'Pertanyaan untuk asisten AI' });
        await expect(input).toHaveAttribute('type', 'text');
        await expect(input).toHaveAttribute('enterkeyhint', 'send');
        await expect(input).toBeFocused();
        const initial = await input.boundingBox();
        await input.fill('Tolong jelaskan penggunaan dana tim ini secara terperinci. '.repeat(12));
        const after = await input.boundingBox();
        expect(after.height).toBe(initial.height);
        expect(after.height).toBe(44);
        const send = await page.getByRole('button', { name: 'Kirim', exact: true }).boundingBox();
        expect(Math.abs(send.y - after.y)).toBeLessThanOrEqual(1);
        expect(send.height).toBe(after.height);
        await measure(page, `mobile-ai-satu-baris-${theme}-${width}x${height}`);
        if (process.env.AUDIT_SCREENSHOTS === '1') await page.screenshot({ path: `${out}mobile-ai-${theme}-${width}.png` });
        await page.keyboard.press('Escape');

        await page.locator('.progress').first().scrollIntoViewIfNeeded();
        await page.waitForTimeout(1000);
        const bars = await page.locator('.progress > div, .bd-bar > div').evaluateAll((els) => els.map((el) => {
          const fill = getComputedStyle(el);
          const stripe = getComputedStyle(el, '::before');
          return { tile: stripe.backgroundSize, name: stripe.animationName, duration: stripe.animationDuration,
            mask: stripe.maskImage, radius: fill.borderRadius, overflow: fill.overflow,
            fits: el.getBoundingClientRect().width <= el.parentElement.getBoundingClientRect().width + 1 };
        }));
        expect(bars.length).toBeGreaterThan(1);
        for (const bar of bars) {
          expect(bar.tile).toBe('28px 28px');
          expect(bar.name).toBe('stripeMove');
          expect(bar.duration).toBe('1.4s');
          expect(bar.mask).not.toBe('none');
          expect(bar.radius).not.toBe('0px');
          expect(bar.overflow).toBe('hidden');
          expect(bar.fits).toBe(true);
        }
        const fill = page.locator('.progress > div').first();
        const position = () => fill.evaluate((el) => getComputedStyle(el, '::before').backgroundPositionX);
        const before = await position();
        await page.waitForTimeout(180);
        expect(await position()).not.toBe(before);
        await page.emulateMedia({ reducedMotion: 'reduce' });
        expect(await fill.evaluate((el) => getComputedStyle(el, '::before').animationName)).toBe('none');
        await page.emulateMedia({ reducedMotion: 'no-preference' });
        await measure(page, `mobile-bar-animasi-${theme}-${width}x${height}`);
        if (process.env.AUDIT_SCREENSHOTS === '1') await page.screenshot({ path: `${out}mobile-bar-${theme}-${width}.png`, fullPage: true });
      }
    } finally { await context.close(); }
  }
}


