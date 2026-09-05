/** Browser regression test, isolated from production.
 * Run after npm run build:
 * npm install --prefix "$env:TEMP\logbook-browser-test" playwright --no-audit --no-fund
 * node tools/test-ai-picker.mjs
 * Uses installed Microsoft Edge; all API calls are mocked. Screenshots go to TEMP.
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(root, 'backend/package.json'));
const express = require('express');
const { chromium } = createRequire(path.join(os.tmpdir(), 'logbook-browser-test/package.json'))('playwright');
const app = express();
app.get('/kegiatan', (_req, res) => res.sendFile(path.join(root, 'frontend/out/kegiatan.html')));
app.use(express.static(path.join(root, 'frontend/out'), { extensions: ['html'] }));
const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const output = path.join(os.tmpdir(), 'logbook-picker-screenshots');
await fs.mkdir(output, { recursive: true });
const bawaan = 'qwen2.5:7b-instruct';
const names = ['smollm2:135m', 'llama3.2:latest', 'translategemma:latest', bawaan,
  'qwen2.5vl:latest', 'gemma4:latest', 'gemma4-16k:latest',
  'hf.co/gmonsoon/gemma2-9b-cpt-sahabatai-v1-instruct-GGUF:Q8_0',
  'phi4-reasoning:plus', 'gpt-oss:latest', 'gemma3:27b', 'qwen3-coder:30b'];
const parameters = ['135M', '3.2B', '4.3B', '7.6B', '8.3B', '8B', '8B', '9.24B', '14.7B', '20.9B', '27B', '30B'];
const daftar = names.map((nama, i) => ({ nama, label: nama, parameter: parameters[i], ukuran: 4e9 }));
const user = { id: 'ui-test', username: 'Tim Uji', role: 'tim' };
try {
  for (const [width, height] of [[280,653],[320,568],[390,844],[568,320],[844,390],[768,1024],[1366,768],[1920,1080]]) {
    for (const theme of ['light', 'dark']) {
      const context = await browser.newContext({ viewport: { width, height }, serviceWorkers: 'block', hasTouch: width < 900 });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      let pilihan = bawaan;
      await page.addInitScript(({ user, theme }) => {
        localStorage.setItem('logbook_token', 'mock-token');
        localStorage.setItem('logbook_user', JSON.stringify(user));
        localStorage.setItem('logbook_theme', theme);
      }, { user, theme });
      await page.route('**/*', async route => {
        const url = new URL(route.request().url());
        if (url.origin !== origin) return route.abort();
        if (!url.pathname.startsWith('/api/')) return route.continue();
        let data = {};
        if (url.pathname === '/api/auth/me') data = { user };
        else if (url.pathname === '/api/ai/status') data = { aktif: true, tersedia: true, model: bawaan };
        else if (url.pathname === '/api/ai/model') {
          if (route.request().method() === 'PUT') pilihan = route.request().postDataJSON().model || '';
          data = { daftar, pilihan, bawaan };
        } else if (/kegiatan|keuangan/.test(url.pathname)) data = [];
        await route.fulfill({ json: data });
      });
      await page.goto(`${origin}/kegiatan`);
      await page.getByRole('button', { name: 'Buka asisten AI', exact: true }).click();
      const trigger = page.locator('.ai-model-btn');
      await trigger.waitFor();
      const input = page.getByRole('textbox', { name: 'Pertanyaan untuk asisten AI' });
      await input.fill('Draf tetap tersimpan');
      await page.waitForFunction(() => !document.querySelector('.ai-model-btn').disabled);
      await page.waitForTimeout(250);
      const closedPanel = await page.locator('.ai-panel').boundingBox();
      await trigger.click();
      const menu = page.getByRole('menu');
      await menu.waitFor();
      await page.waitForTimeout(250); // finish panel entry animation
      assert.equal(await input.isVisible(), true, 'input stays visible while choosing');
      assert.equal(await page.locator('.ai-list').isVisible(), true);
      assert.equal(await page.getByRole('button', { name: 'Kembali ke chat' }).count(), 0);
      const panel = await page.locator('.ai-panel').boundingBox();
      const box = await menu.boundingBox();
      const inputBox = await input.boundingBox();
      assert(Math.abs(panel.height - closedPanel.height) < 1, 'opening menu must not enlarge panel');
      assert(box.height <= 233, 'dropdown must stay compact');
      assert(box.y + box.height <= inputBox.y, 'menu must not cover input');
      assert(!/berukuran|Model ringan|Model besar/.test(await menu.innerText()), 'descriptions must explain purpose');
      assert.equal(await menu.locator('[title^="llama3.2:latest"]').locator('.ket b').innerText(), 'Perkiraan: cepat');
      assert.equal(await menu.locator('[title^="qwen2.5:7b-instruct"]').locator('.ket b').innerText(), 'Perkiraan: sedang');
      assert.equal(await menu.locator('[title^="gemma3:27b"]').locator('.ket b').innerText(), 'Perkiraan: lebih lama');
      assert.equal(await menu.locator('[title^="gpt-oss:latest"]').locator('.ket b').innerText(), 'Belum ada perkiraan');
      assert(panel.x >= 0 && panel.y >= 0 && panel.x + panel.width <= width + 1 && panel.y + panel.height <= height + 1, `panel outside ${width}x${height}`);
      assert(box.x >= panel.x && box.y >= panel.y && box.x + box.width <= panel.x + panel.width + 1 && box.y + box.height <= panel.y + panel.height + 1, 'menu outside panel');
      assert(box.height > 50, 'menu needs usable scroll area');
      assert.equal(await menu.evaluate(e => e.scrollWidth <= e.clientWidth + 1), true, 'horizontal overflow');
      for (const option of await menu.getByRole('menuitemradio').all()) {
        await option.scrollIntoViewIfNeeded();
        assert.equal(await option.evaluate(e => e.scrollWidth <= e.clientWidth + 1), true, 'option overflow');
        const name = option.locator('.nm');
        assert.equal(await name.evaluate(e => e.scrollHeight <= e.clientHeight + 1), true, 'name clipped');
        assert.equal(await option.locator('.ket').evaluate(e => e.scrollHeight <= e.clientHeight + 1), true, 'purpose clipped');
      }
      await menu.getByRole('menuitemradio').last().focus();
      await page.keyboard.press('Home');
      assert.equal(await menu.getByRole('menuitemradio').first().evaluate(e => e === document.activeElement), true);
      await page.keyboard.press('End');
      await page.keyboard.press('Enter');
      await menu.waitFor({ state: 'hidden' });
      assert.equal(await input.inputValue(), 'Draf tetap tersimpan');
      await trigger.click();
      await page.waitForFunction(() => document.activeElement?.getAttribute('aria-checked') === 'true');
      await page.screenshot({ path: path.join(output, `${width}x${height}-${theme}.png`) });
      await page.keyboard.press('Escape');
      assert.equal(await trigger.evaluate(e => e === document.activeElement), true);
      await trigger.click();
      await input.click();
      await menu.waitFor({ state: 'hidden' });
      assert.equal(await input.isVisible(), true);
      assert.deepEqual(errors, [], 'browser runtime errors');
      console.log(`PASS ${width}x${height} ${theme}: bounds, wrapping, keyboard, selection, draft`);
      await context.close();
    }
  }
  console.log(`PASS all 16 viewport/theme cases. Screenshots: ${output}`);
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}

