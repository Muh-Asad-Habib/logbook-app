// Desain asli tetap di panel.js. Modul ini hanya menangani tema dan ukuran kontrol.
export const ADMIN_THEME_BOOT = String.raw`
(function () {
  var KEY = 'logbook_admin_theme';
  function read() {
    try {
      var saved = localStorage.getItem(KEY);
      if (saved === 'light' || saved === 'dark') return saved;
      if (saved === 'system' && window.matchMedia) return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    } catch (e) {}
    return 'dark';
  }
  var current = read();
  function apply(value, save) {
    current = value === 'light' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-admin-theme', current);
    document.documentElement.style.colorScheme = current;
    var label = current === 'dark' ? 'Mode terang' : 'Mode gelap';
    document.querySelectorAll('[data-admin-theme-toggle]').forEach(function (button) {
      button.setAttribute('aria-label', label);
      button.setAttribute('title', label);
      var text = button.querySelector('.theme-label');
      if (text) text.textContent = label;
    });
    if (save) { try { localStorage.setItem(KEY, current); } catch (e) {} }
  }
  apply(current, false);
  window.addEventListener('storage', function (event) {
    if (event.key === KEY || event.key === null) apply(read(), false);
  });
  window.AdminAppearance = { mount: function () {
    apply(current, false);
    document.addEventListener('click', function (event) {
      if (event.target.closest('[data-admin-theme-toggle]')) apply(current === 'dark' ? 'light' : 'dark', true);
    });
  } };
})();
`;

export function themeToggle(id, compact = false) {
  return `<button id="${id}" type="button" class="btn theme-toggle${compact ? ' theme-compact' : ''}" data-admin-theme-toggle aria-label="Mode terang" title="Mode terang"><svg class="i theme-sun" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M5 19l1.5-1.5M17.5 6.5 19 5"/></svg><svg class="i theme-moon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20.9 13A9 9 0 0 1 11 3.1 9 9 0 1 0 20.9 13Z"/></svg><span class="theme-label">Mode terang</span></button>`;
}

export const ADMIN_THEME_CSS = String.raw`
  /* Tidak mengganti layout, palet gelap, gradien, kartu, atau animasi asli. */
  :root { color-scheme:dark; --field:#0c1128; --button:#131a3a; --subtle:#0b1024; }
  .theme-toggle { min-height:44px; justify-content:center; gap:9px; flex-shrink:0; }
  .theme-toggle .i { width:18px; height:18px; }
  .theme-compact { width:44px; padding:0; }
  .theme-compact .theme-label { display:none; }
  .theme-moon { display:none; }
  [data-admin-theme="light"] .theme-sun { display:none; }
  [data-admin-theme="light"] .theme-moon { display:block; }
  .win-dots .theme-toggle { margin-left:8px; width:36px; min-height:36px; border-radius:10px; }
  .win-dots .theme-label { display:none; }
  #tema-panel { display:none; }
  .side-foot .theme-toggle { width:100%; }
  .side-nav .i { width:18px; height:18px; }
  .btn.sm .i { width:15px; height:15px; }
  .dev-ic .i { width:20px; height:20px; }
  .btn.ic { min-width:36px; min-height:36px; justify-content:center; }
  .side-toggle { width:30px; height:30px; right:-15px; }
  .side-toggle .i { width:15px; height:15px; }
  .dlg-h .x { flex-shrink:0; }
  dialog { overflow-wrap:anywhere; }
  dialog.besar .tabs { display:flex; max-width:100%; overflow-x:auto; }
  dialog.besar .tabs button { white-space:nowrap; flex-shrink:0; }
  textarea { display:block; margin-top:6px; border:1px solid var(--line2); border-radius:11px; background:var(--field); color:var(--ink); font:inherit; resize:vertical; }
  input[type="checkbox"] { min-height:0; accent-color:var(--p); }
  @media(min-width:1081px) {
    #v-app.mini .theme-toggle { padding:10px 0; gap:0; }
    #v-app.mini .theme-label { display:none; }
  }
  @media(max-width:1080px) {
    #tema-panel { display:inline-flex; }
    .side-foot .theme-toggle { display:none; }
  }
  @media(max-width:640px) {
    .top-act { flex-shrink:0; }
    .btn,.btn.sm,.fchip,.seg button,.tabs button,.asx-tgl,.win-dots .theme-toggle { min-height:44px; }
    .btn.ic,.asx-tgl { min-width:44px; }
    input,select,textarea { font-size:16px; }
  }

  /* Mode terang: warna saja; geometri tetap memakai desain lama. */
  :root[data-admin-theme="light"] {
    color-scheme:light;
    --bg:#f4f5ff; --bg2:#eff0fa; --panel:#ffffff; --panel2:#f4f3ff;
    --line:#dce0f0; --line2:#939bb4; --ink:#202641; --mut:#596482;
    --p:#4f46c8; --p2:#7043b6; --cy:#17647b; --ok:#18704c; --warn:#885407; --bad:#b32643;
    --grad:linear-gradient(135deg,#5145cc,#7745bb);
    --grad3:linear-gradient(120deg,#5145cc 0%,#7745bb 50%,#1f758d 100%);
    --field:#ffffff; --button:#f1f2fc; --subtle:#f3f4fc;
  }
  [data-admin-theme="light"] .side,[data-admin-theme="light"] .top { background:rgba(255,255,255,.92); }
  [data-admin-theme="light"] :is(.win-dots,.dlg-h) { background:var(--panel2); }
  [data-admin-theme="light"] :is(.side-toggle,.btn,.asx-tgl) { background:var(--button); color:var(--ink); }
  [data-admin-theme="light"] :is(.side-toggle:hover,.asx-tgl:hover,.side-nav a.on) { color:var(--p); }
  [data-admin-theme="light"] :is(input,select) { background:var(--field); }
  [data-admin-theme="light"] :is(input,textarea)::placeholder { color:var(--mut); }
  [data-admin-theme="light"] :is(.tag,.seg,.tabs,.fchip,.asx-b,.dev-ip,.search kbd,.chip,.tl-body,.tl-dot,.tst,.prog,th,tr.baris-total td) { background:var(--subtle); }
  [data-admin-theme="light"] :is(.side-note,.foot,.win-dots span,.login .hint,.in-wrap .i,.search .i,.audit .t,.audit .ip,.st.off,.st.dim) { color:var(--mut); }
  [data-admin-theme="light"] :is(.tile .go,.dev-ip,.badge.b,.tl-dot.b,.tl-src) { color:var(--p); }
  [data-admin-theme="light"] :is(.btn.p,.seg button.on,.tabs button.on) { background:var(--grad); color:#fff; }
  [data-admin-theme="light"] .fchip.on { color:var(--p); background:rgba(109,124,255,.12); }
  [data-admin-theme="light"] :is(.side-out,.btn.d,.err,.badge.r,.tag.r,.tl-dot.r,.chip.merah b) { color:var(--bad); }
  [data-admin-theme="light"] .btn.d { background:rgba(251,113,133,.10); }
  [data-admin-theme="light"] :is(.badge.g,.tag.g,.live,.st.on,.tl-dot.g,.chip.hijau b) { color:var(--ok); }
  [data-admin-theme="light"] :is(.badge.y,.st.idle,.live.mati,.tl-dot.y,.tl-src.panel) { color:var(--warn); }
  [data-admin-theme="light"] :is(.badge.c,.tl-dot.c,.chip.biru b) { color:var(--cy); }
  [data-admin-theme="light"] .chip.ungu b { color:var(--p2); }
  [data-admin-theme="light"] :is(th,td,.dev,.audit .row-a,.tl-body) { border-color:var(--line); }
  [data-admin-theme="light"] .kosong { border-color:var(--line2); }
  [data-admin-theme="light"] dialog { background:var(--panel); box-shadow:0 30px 100px rgba(36,40,83,.25); }
  [data-admin-theme="light"] .login { background:linear-gradient(#fff,#fff) padding-box,var(--grad3) border-box; }
  [data-admin-theme="light"] :is(.card,.stat,.tile) { box-shadow:0 14px 36px -24px rgba(55,50,105,.25); }
  [data-admin-theme="light"] :is(.stat .ic,.tile .ic) { background:color-mix(in srgb,var(--a) 13%,#fff); }
  [data-admin-theme="light"] .s1 { --a:#4f46c8; }
  [data-admin-theme="light"] .s2 { --a:#17647b; }
  [data-admin-theme="light"] .s3 { --a:#885407; }
  [data-admin-theme="light"] .s4 { --a:#18704c; }
  [data-admin-theme="light"] .s5 { --a:#7043b6; }
  [data-admin-theme="light"] .s6 { --a:#b32643; }
  [data-admin-theme="light"] .skel { background:linear-gradient(90deg,#eef0fa 8%,#dce0f0 20%,#eef0fa 32%); background-size:820px 100%; }
  [data-admin-theme="light"] ::-webkit-scrollbar-thumb { background:var(--line2); }
  @media(min-width:1081px) { [data-admin-theme="light"] #v-app.mini .side [data-tip]:hover::after { background:var(--ink); } }
`;

