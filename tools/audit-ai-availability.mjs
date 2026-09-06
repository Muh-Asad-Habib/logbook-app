import { expect } from '@playwright/test';

// Semua respons ditiru. Tidak memakai akun, database, atau inferensi pengguna nyata.
export async function auditAIAvailability(contextFor, base, measure) {
  for (const width of [375, 1440]) {
    for (const state of ['error', 'disabled', 'unavailable', 'loading']) {
      const context = await contextFor();
      const page = await context.newPage();
      await page.setViewportSize({ width, height: 900 });
      let recovered = false, pending;
      await page.route('**/api/ai/status', async (route) => {
        if (recovered) return route.fulfill({ json: { aktif: true, tersedia: true, modelAda: true, model: 'audit-model' } });
        if (state === 'loading') { pending = route; return; }
        if (state === 'error') return route.fulfill({ status: 503, json: { error: 'Gangguan status tiruan' } });
        return route.fulfill({ json: { aktif: state !== 'disabled', tersedia: false, modelAda: false } });
      });
      await page.goto(`${base}/kegiatan`, { waitUntil: 'domcontentloaded' });
      const fab = page.getByRole('button', { name: 'Buka asisten AI', exact: true });
      await expect(fab).toBeVisible();
      await fab.click();
      const panel = page.getByRole('dialog', { name: 'Asisten AI logbook' });
      const question = panel.getByRole('textbox', { name: 'Pertanyaan untuk asisten AI' });
      await expect(question).toBeDisabled();
      const messages = { error: 'Status AI belum dapat diperiksa', disabled: 'AI sedang dinonaktifkan', unavailable: 'Layanan AI atau daftar model belum tersedia', loading: 'Memeriksa layanan AI' };
      await expect(panel.getByRole('status')).toContainText(messages[state]);
      await expect(panel.getByRole('button', { name: 'Kirim', exact: true })).toBeDisabled();
      await measure(page, `ai-visible-${state}-${width}`);
      recovered = true;
      if (state === 'loading') {
        await expect.poll(() => !!pending).toBe(true);
        await pending.fulfill({ json: { aktif: true, tersedia: true, modelAda: true, model: 'audit-model' } });
      } else if (state === 'error') {
        await page.evaluate(() => window.dispatchEvent(new Event('online')));
      } else {
        await panel.getByRole('button', { name: 'Coba lagi', exact: true }).click();
      }
      await expect(question).toBeEnabled();
      await expect(panel.getByRole('status')).toHaveCount(0);
      await page.route('**/api/ai/tanya', (route) => route.fulfill({ json: { jawaban: 'Asisten telah pulih dalam tab yang sama.', model: 'audit-model' } }));
      await question.fill('Pertanyaan audit');
      await panel.getByRole('button', { name: 'Kirim', exact: true }).click();
      await expect(panel.getByRole('log')).toContainText('Asisten telah pulih dalam tab yang sama.');
      await measure(page, `ai-recovered-${state}-${width}`);
      await context.close();
    }
  }
}
