import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { ADMIN_THEME_BOOT, themeToggle } from '../backend/src/admin/theme.js';
import { PANEL_HTML } from '../backend/src/admin/panel.js';

function setup({ saved = null, dark = false, blocked = false } = {}) {
  const windowEvents = {}, documentEvents = {};
  const root = { style: {}, setAttribute(key, value) { this[key] = value; } };
  const selectors = Array.from({ length: 3 }, () => ({
    text: { textContent: '' },
    setAttribute(key, value) { this[key] = value; },
    querySelector() { return this.text; },
  }));
  const media = { matches: dark, addEventListener(_, listener) { this.change = listener; } };
  const store = new Map(saved ? [['logbook_admin_theme', saved]] : []);
  const sandbox = {
    document: { documentElement: root, querySelectorAll: () => selectors, addEventListener: (key, fn) => { documentEvents[key] = fn; } },
    window: { matchMedia: () => media, addEventListener: (key, fn) => { windowEvents[key] = fn; } },
    localStorage: { getItem: key => { if (blocked) throw new Error('blocked'); return store.get(key); }, setItem: (key, value) => { if (blocked) throw new Error('blocked'); store.set(key, value); } },
  };
  vm.runInNewContext(ADMIN_THEME_BOOT, sandbox);
  sandbox.window.AdminAppearance.mount();
  const toggle = () => documentEvents.click({ target: { closest: () => selectors[0] } });
  return { root, selectors, media, store, toggle, windowEvents };
}

test('tema diterapkan sebelum CSS dan terpisah dari tema frontend', () => {
  assert.ok(PANEL_HTML.indexOf(ADMIN_THEME_BOOT) < PANEL_HTML.indexOf('<style>'));
  assert.doesNotMatch(PANEL_HTML, /data-admin-theme-select/);
  assert.match(themeToggle('test'), /type="button"/);
  assert.match(themeToggle('test'), /theme-sun/);
  assert.match(themeToggle('test'), /theme-moon/);
  const s = setup({ dark: true });
  assert.equal(s.root['data-admin-theme'], 'dark');
  assert.equal(s.root.style.colorScheme, 'dark');
  assert.equal(s.store.has('logbook_theme'), false);
});
test('satu klik mengganti tema dan label aksi pada semua tombol', () => {
  const s = setup({ saved: 'light', dark: true });
  assert.equal(s.root['data-admin-theme'], 'light');
  s.toggle();
  assert.equal(s.store.get('logbook_admin_theme'), 'dark');
  assert.ok(s.selectors.every(el => el['aria-label'] === 'Mode terang'));
  s.toggle();
  assert.equal(s.root['data-admin-theme'], 'light');
  assert.ok(s.selectors.every(el => el.text.textContent === 'Mode gelap'));
});
test('preferensi sistem lama dimigrasikan tanpa menambahkan dropdown', () => {
  const s = setup({ saved: 'system', dark: true });
  assert.equal(s.root['data-admin-theme'], 'dark');
  s.toggle();
  assert.equal(s.root['data-admin-theme'], 'light');
  assert.equal(s.store.get('logbook_admin_theme'), 'light');
});
test('penyimpanan diblokir atau nilai tidak valid tidak merusak panel', () => {
  for (const options of [{ saved: 'invalid' }, { blocked: true }]) {
    const s = setup(options);
    assert.equal(s.root['data-admin-theme'], 'dark');
    s.toggle();
    assert.equal(s.root['data-admin-theme'], 'light');
  }
});
test('perubahan antar tab disinkronkan dan clear mengembalikan tema gelap asli', () => {
  const s = setup({ saved: 'light' });
  s.store.set('logbook_admin_theme', 'dark');
  s.windowEvents.storage({ key: 'logbook_admin_theme' });
  assert.equal(s.root['data-admin-theme'], 'dark');
  s.store.clear(); s.windowEvents.storage({ key: null });
  assert.equal(s.root['data-admin-theme'], 'dark');
  assert.ok(s.selectors.every(el => el['aria-label'] === 'Mode terang'));
});
