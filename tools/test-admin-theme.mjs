import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { ADMIN_THEME_BOOT } from '../backend/src/admin/appearance.js';
import { PANEL_HTML } from '../backend/src/admin/panel.js';

function setup({ saved = null, dark = false, blocked = false } = {}) {
  const windowEvents = {}, documentEvents = {};
  const root = { style: {}, setAttribute(key, value) { this[key] = value; } };
  const selectors = [{ value: '' }, { value: '' }, { value: '' }];
  const media = { matches: dark, addEventListener(_, listener) { this.change = listener; } };
  const store = new Map(saved ? [['logbook_admin_theme', saved]] : []);
  const sandbox = {
    document: { documentElement: root, querySelectorAll: () => selectors, addEventListener: (key, fn) => { documentEvents[key] = fn; } },
    window: { matchMedia: () => media, addEventListener: (key, fn) => { windowEvents[key] = fn; } },
    localStorage: { getItem: key => { if (blocked) throw new Error('blocked'); return store.get(key); }, setItem: (key, value) => { if (blocked) throw new Error('blocked'); store.set(key, value); } },
  };
  vm.runInNewContext(ADMIN_THEME_BOOT, sandbox);
  sandbox.window.AdminAppearance.mount();
  const choose = value => documentEvents.change({ target: { value, matches: () => true } });
  return { root, selectors, media, store, choose, windowEvents };
}

test('tema diterapkan sebelum CSS dan terpisah dari tema frontend', () => {
  assert.ok(PANEL_HTML.indexOf(ADMIN_THEME_BOOT) < PANEL_HTML.indexOf('<style>'));
  assert.equal((PANEL_HTML.match(/data-admin-theme-select/g) || []).length >= 3, true);
  const s = setup({ dark: true });
  assert.equal(s.root['data-admin-theme'], 'dark');
  assert.equal(s.root.style.colorScheme, 'dark');
  assert.equal(s.store.has('logbook_theme'), false);
});
test('pilihan eksplisit tersimpan dan sinkron di semua pemilih tema', () => {
  const s = setup({ saved: 'light', dark: true });
  assert.equal(s.root['data-admin-theme'], 'light');
  s.choose('dark');
  assert.equal(s.store.get('logbook_admin_theme'), 'dark');
  assert.ok(s.selectors.every(el => el.value === 'dark'));
});
test('tema sistem mengikuti OS tetapi tidak menimpa pilihan eksplisit', () => {
  const s = setup();
  s.media.matches = true; s.media.change();
  assert.equal(s.root['data-admin-theme'], 'dark');
  s.choose('light'); s.media.change();
  assert.equal(s.root['data-admin-theme'], 'light');
  s.choose('system');
  assert.equal(s.root['data-admin-theme'], 'dark');
});
test('penyimpanan diblokir atau nilai tidak valid tidak merusak panel', () => {
  for (const options of [{ saved: 'invalid' }, { blocked: true }]) {
    const s = setup(options);
    assert.equal(s.root['data-admin-theme'], 'light');
    s.choose('dark');
    assert.equal(s.root['data-admin-theme'], 'dark');
  }
});
test('perubahan tema antar tab disinkronkan dan clear kembali mengikuti sistem', () => {
  const s = setup({ saved: 'light' });
  s.store.set('logbook_admin_theme', 'dark');
  s.windowEvents.storage({ key: 'logbook_admin_theme' });
  assert.equal(s.root['data-admin-theme'], 'dark');
  s.store.clear(); s.windowEvents.storage({ key: null });
  assert.equal(s.root['data-admin-theme'], 'light');
  assert.ok(s.selectors.every(el => el.value === 'system'));
});
