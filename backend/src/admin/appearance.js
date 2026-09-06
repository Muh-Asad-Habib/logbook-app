// Lapisan visual panel mandiri. Tidak dimuat oleh frontend publik.
export const ADMIN_THEME_BOOT = String.raw`
(function () {
  var KEY = 'logbook_admin_theme';
  var media = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  function valid(value) { return ['light', 'dark', 'system'].indexOf(value) >= 0 ? value : 'system'; }
  function read() { try { return valid(localStorage.getItem(KEY)); } catch (e) { return 'system'; } }
  var preference = read();
  function apply(value, save) {
    preference = valid(value);
    var theme = preference === 'system' ? (media && media.matches ? 'dark' : 'light') : preference;
    document.documentElement.setAttribute('data-admin-theme', theme);
    document.documentElement.style.colorScheme = theme;
    document.querySelectorAll('[data-admin-theme-select]').forEach(function (el) { el.value = preference; });
    if (save) { try { localStorage.setItem(KEY, preference); } catch (e) {} }
  }
  apply(preference, false);
  if (media && media.addEventListener) media.addEventListener('change', function () {
    if (preference === 'system') apply('system', false);
  });
  window.addEventListener('storage', function (event) {
    if (event.key === KEY || event.key === null) apply(read(), false);
  });
  window.AdminAppearance = { mount: function () {
    apply(preference, false);
    document.addEventListener('change', function (event) {
      if (event.target.matches('[data-admin-theme-select]')) apply(event.target.value, true);
    });
  } };
})();
`;

export function themePicker(id) {
  return `<label class="theme-control" for="${id}"><span>Tema</span><select id="${id}" data-admin-theme-select aria-label="Tema pusat kendali"><option value="system">Ikuti perangkat</option><option value="light">Terang</option><option value="dark">Gelap</option></select></label>`;
}

export const ADMIN_APPEARANCE_CSS = String.raw`
  /* Satu palet semantik untuk halaman, tabel, dialog, dan status. */
  :root {
    color-scheme: light;
    --bg:#f4f5f7; --bg2:#eef0f4; --panel:#ffffff; --panel2:#f7f8fa;
    --line:#dde1e8; --line2:#8993a3; --ink:#202936; --mut:#566174;
    --p:#4338ca; --p2:#5146b8; --cy:#17647b; --ok:#197048; --warn:#855407; --bad:#b52b3b;
    --accent-soft:#eeedfb; --ok-soft:#edf7f0; --warn-soft:#fff5e3; --bad-soft:#fdf0f1; --cy-soft:#edf5f8;
    --hover:#f0f2f6; --focus:#4f46e5; --shadow:0 2px 8px rgba(25,35,52,.04);
    --dialog-shadow:0 24px 80px rgba(20,29,45,.22); --overlay:rgba(15,23,42,.45);
    --avatar-bg:94%; --avatar-ink:30%; --r:12px;
    --grad:var(--p); --grad3:var(--p);
  }
  :root[data-admin-theme="dark"] {
    color-scheme: dark;
    --bg:#15181e; --bg2:#1c2028; --panel:#1e232c; --panel2:#242b35;
    --line:#343d49; --line2:#687689; --ink:#e8ecf2; --mut:#aab5c5;
    --p:#b6b1ff; --p2:#c7b9ee; --cy:#91cbdc; --ok:#8dd5ae; --warn:#e9c17d; --bad:#f2a0aa;
    --accent-soft:#302e4c; --ok-soft:#233b30; --warn-soft:#3b3224; --bad-soft:#402b32; --cy-soft:#263943;
    --hover:#2a313c; --focus:#c1bdff; --shadow:0 2px 8px rgba(0,0,0,.08);
    --dialog-shadow:0 24px 80px rgba(0,0,0,.38); --overlay:rgba(0,0,0,.6);
    --avatar-bg:25%; --avatar-ink:85%;
  }
  html { scrollbar-color:var(--line2) var(--bg); }
  body { background:var(--bg); font-size:14px; line-height:1.5; }
  body::before,.side::after,.top::after,.card::before,.stat::before,.stat::after,.tile::after,.login::before { content:none; }
  .orbs { display:none; }
  ::selection { background:var(--accent-soft); color:var(--ink); }
  ::-webkit-scrollbar-thumb { background:var(--line2); }
  ::-webkit-scrollbar-thumb:hover { background:var(--mut); }
  :where(a) { color:var(--p); }
  :where(button,a[href],input,select,textarea,summary):focus-visible { outline:2px solid var(--focus); outline-offset:3px; }
  .side { background:var(--panel); backdrop-filter:none; animation:none; gap:24px; padding-top:24px; }
  .side-logo,.login .logo { background:var(--accent-soft); color:var(--p); box-shadow:none; animation:none; border-radius:10px; }
  .side-brand span,.side-note,.foot { color:var(--mut); font-family:inherit; text-transform:none; letter-spacing:0; font-size:.75rem; }
  .side-nav a { min-height:44px; font-size:.875rem; border-radius:8px; transition:background .12s,color .12s; }
  .side-nav a:hover,.side-nav a.on { transform:none; background:var(--accent-soft); color:var(--p); box-shadow:none; }
  .side-nav a.on::before { display:none; }
  .side-out { color:var(--bad); border-color:var(--line); background:var(--panel); min-height:44px; }
  .side-out:hover { background:var(--bad-soft); transform:none; box-shadow:none; }
  .side-toggle { background:var(--panel); color:var(--mut); box-shadow:var(--shadow); border-radius:8px; width:32px; height:32px; right:-16px; }
  .side-toggle:hover { color:var(--p); background:var(--accent-soft); box-shadow:none; }
  .main { background:var(--bg); }
  .wrap,.top-in { max-width:1280px; }
  .wrap { padding-top:4px; }
  .top { background:var(--panel); backdrop-filter:none; border-bottom:1px solid var(--line); }
  .top-in { padding-top:16px; padding-bottom:16px; flex-wrap:wrap; }
  .top-in>div:first-child { flex:1 1 190px; }
  .top h1 { font-size:1.25rem; line-height:1.35; letter-spacing:-.025em; flex-wrap:wrap; }
  .crumb { font-family:inherit; font-size:.72rem; letter-spacing:0; text-transform:none; flex-wrap:wrap; }
  .crumb .sep,.asx-meta .dot { background:var(--line2); }
  .top-act { align-items:center; flex-wrap:wrap; }
  .theme-control { display:flex; align-items:center; gap:8px; margin:0; font-size:.78rem; color:var(--mut); }
  .theme-control select { width:auto; margin:0; min-height:44px; padding:8px 10px; font-size:.85rem; }
  .page.on { animation:none; }
  .hero { padding-top:28px; gap:16px; }
  .hero-ic { display:none; }
  .hero-tx h2 { font-size:1.05rem; letter-spacing:-.015em; }
  .hero-tx p { font-size:.875rem; line-height:1.65; max-width:80ch; }
  .hero-act { align-self:center; }
  .card,.stat,.tile,.asx { border-radius:var(--r); box-shadow:var(--shadow); animation:none; }
  .card:hover,.stat:hover,.tile:hover { transform:none; box-shadow:var(--shadow); border-color:var(--line); }
  .card { padding:22px; }
  .card h2 { font-size:1rem; line-height:1.45; }
  .card .mut { line-height:1.65; }
  .stats { grid-template-columns:repeat(3,minmax(0,1fr)); gap:12px; }
  .stat { padding:18px; gap:14px; }
  .stat .ic,.tile .ic { background:var(--panel2); border:1px solid var(--line); color:var(--mut); box-shadow:none; border-radius:10px; }
  .stat b { font-size:1.65rem; font-weight:650; letter-spacing:-.035em; line-height:1.3; }
  .stat .lbl { font-size:.8rem; font-weight:500; letter-spacing:0; text-transform:none; }
  .stat .sub { white-space:normal; font-size:.74rem; }
  .stat.hidup .ic::after { background:var(--ok); animation:none; }
  .tiles { grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px; }
  .tile { padding:18px; gap:10px; }
  .tile:hover { background:var(--panel2); border-color:var(--line2); }
  .tile .go { color:var(--p); letter-spacing:0; text-transform:none; font-size:.8rem; }
  .tile span { font-size:.83rem; }
  .tile:hover .go .i { transform:rotate(180deg); }
  .btn { background:var(--panel); color:var(--ink); border-color:var(--line2); border-radius:8px; font-weight:600; min-height:40px; }
  .btn:hover { background:var(--hover); border-color:var(--line2); transform:none; box-shadow:none; }
  .btn:active { transform:none; }
  .btn.p { background:var(--p); color:var(--panel); border:1px solid var(--p); box-shadow:none; }
  .btn.p:hover { filter:none; background:color-mix(in srgb,var(--p) 90%,var(--ink)); }
  .btn.d,.err { color:var(--bad); background:var(--bad-soft); border-color:color-mix(in srgb,var(--bad) 40%,var(--line)); }
  .btn.d:hover { background:var(--bad-soft); box-shadow:none; }
  .btn.sm { font-size:.78rem; border-radius:7px; min-height:36px; }
  .btn.ic { min-width:36px; justify-content:center; }
  label { color:var(--ink); font-size:.82rem; font-weight:600; }
  input,select,textarea { background:var(--panel); color:var(--ink); border:1px solid var(--line2); border-radius:8px; min-height:44px; font:inherit; padding:10px 12px; }
  textarea { width:100%; margin-top:6px; min-height:100px; resize:vertical; line-height:1.6; }
  input::placeholder,textarea::placeholder { color:var(--mut); opacity:1; }
  input:focus,select:focus,textarea:focus { border-color:var(--focus); box-shadow:0 0 0 3px var(--accent-soft); }
  input[type="checkbox"] { width:18px; height:18px; min-height:0; padding:0; accent-color:var(--p); }
  .in-wrap .i,.search .i { color:var(--mut); }
  .search { width:260px; }
  .search kbd,.tag,.dev-ip { background:var(--panel2); color:var(--mut); border-color:var(--line); }
  .tag { font-family:inherit; font-size:.72rem; font-weight:600; letter-spacing:0; }
  .mut { font-size:.82rem; }
  .seg,.tabs { background:var(--panel2); border-color:var(--line); border-radius:9px; gap:4px; }
  .seg button,.tabs button { min-height:40px; border-radius:6px; font-weight:600; }
  .seg button.on,.tabs button.on,.fchip.on { background:var(--accent-soft); color:var(--p); box-shadow:none; }
  .fchip { background:var(--panel); font-size:.78rem; border-radius:7px; padding:7px 12px; }
  .fchip.on { border-color:var(--p); }
  .tbl { border-radius:10px; }
  table { font-size:.85rem; }
  th { background:var(--panel2); color:var(--mut); font-size:.75rem; letter-spacing:0; text-transform:none; font-weight:600; }
  th,td { border-bottom-color:var(--line); padding:13px 14px; }
  tbody tr:hover { background:var(--hover); }
  tr.baris-total td { background:var(--panel2); }
  .u-cell>div { min-width:0; overflow-wrap:anywhere; }
  .acts { flex-wrap:wrap; justify-content:flex-end; gap:6px; }
  .ava { background:hsl(var(--avatar-h,245),30%,var(--avatar-bg)); color:hsl(var(--avatar-h,245),45%,var(--avatar-ink)); box-shadow:none; border:1px solid var(--line); }
  .badge,.st,.live { font-weight:600; font-size:.72rem; letter-spacing:0; text-transform:none; }
  .badge.g,.st.on,.tag.g,.live { color:var(--ok); background:var(--ok-soft); border-color:color-mix(in srgb,var(--ok) 30%,var(--line)); }
  .badge.y,.st.idle,.live.mati { color:var(--warn); background:var(--warn-soft); border-color:color-mix(in srgb,var(--warn) 30%,var(--line)); }
  .badge.r,.tag.r { color:var(--bad); background:var(--bad-soft); border-color:color-mix(in srgb,var(--bad) 30%,var(--line)); }
  .badge.b { color:var(--p); background:var(--accent-soft); }
  .badge.c { color:var(--cy); background:var(--cy-soft); }
  .st.off,.st.dim { color:var(--mut); background:var(--panel2); border-color:var(--line2); }
  .st.on i,.live i { animation:none; }
  .asx.aktif,.asx.membuka { border-color:color-mix(in srgb,var(--ok) 40%,var(--line)); box-shadow:none; }
  .asx-h:hover { background:var(--hover); }
  .asx-b,.asx-tgl { background:var(--panel2); }
  .asx-tgl:hover { background:var(--accent-soft); color:var(--p); }
  .dev { border-bottom-color:var(--line); }
  .dev-ic { color:var(--mut); display:inline-flex; }
  .dev-ic .i { width:20px; height:20px; }
  .audit { font-family:inherit; font-size:.8rem; }
  .audit .row-a { border-bottom:1px solid var(--line); padding:12px 4px; gap:12px; border-radius:0; }
  .audit .row-a:hover { background:var(--hover); }
  .audit .t,.audit .ip { color:var(--mut); font-size:.75rem; }
  .audit .badge { font-size:.72rem; }
  .tl-item::before { background:var(--line); }
  .tl-body,.tl-dot,.chip,.tst { background:var(--panel2); border-color:var(--line); }
  .tl-dot.g,.chip.hijau b { color:var(--ok); box-shadow:none; }
  .tl-dot.r,.chip.merah b { color:var(--bad); box-shadow:none; }
  .tl-dot.y,.tl-src.panel { color:var(--warn); box-shadow:none; }
  .tl-dot.c,.chip.biru b { color:var(--cy); box-shadow:none; }
  .tl-dot.b,.tl-src,.chip.ungu b { color:var(--p); box-shadow:none; }
  .chip small { text-transform:none; letter-spacing:0; font-size:.75rem; }
  .prog { background:var(--line); }
  .prog>i { box-shadow:none; background:var(--p); }
  .skel { background:linear-gradient(90deg,var(--panel2) 8%,var(--line) 20%,var(--panel2) 32%); background-size:820px 100%; }
  .kosong { border:1px dashed var(--line2); background:var(--panel2); font-size:.875rem; }
  .kosong .big { animation:none; }
  dialog { background:var(--panel); border-color:var(--line2); border-radius:14px; box-shadow:var(--dialog-shadow); overflow-wrap:anywhere; }
  dialog::backdrop,.dlg-bg { background:var(--overlay); backdrop-filter:blur(2px); }
  .dlg-h { background:var(--panel2); }
  .dlg-h h3 { white-space:normal; overflow-wrap:anywhere; line-height:1.4; font-size:1rem; }
  .dlg-h .x { flex-shrink:0; }
  .dlg-b { scrollbar-gutter:stable; }
  dialog.besar .tabs { display:flex; overflow-x:auto; max-width:100%; }
  dialog.besar .tabs button { flex-shrink:0; white-space:nowrap; }
  .tst { background:var(--panel); box-shadow:var(--dialog-shadow); }
  .login { max-width:440px; border:1px solid var(--line); border-radius:14px; background:var(--panel); box-shadow:var(--dialog-shadow); animation:none; }
  .login-top { display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; padding:16px 24px; border-bottom:1px solid var(--line); }
  .login-top>span { color:var(--mut); font-size:.75rem; }
  .login-top .theme-control>span { display:none; }
  .login-body { padding:26px 28px 0; }
  .login .logo { margin:0 0 16px; width:48px; height:48px; }
  .login h1,.login .mut { text-align:left; }
  .login h1 { font-size:1.4rem; }
  .login .hint { color:var(--mut); font-family:inherit; font-size:.75rem; letter-spacing:0; line-height:1.6; }
  .appearance-card { display:flex; align-items:center; justify-content:space-between; gap:20px; flex-wrap:wrap; }
  .appearance-card p { margin-top:6px; }
  @media(min-width:1081px) {
    #v-app.mini .side [data-tip]:hover::after { background:var(--ink); color:var(--panel); border-color:var(--line2); box-shadow:var(--shadow); }
  }
  @media(max-width:1080px) {
    .side { background:var(--panel); box-shadow:0 4px 20px rgba(0,0,0,.08); gap:4px; padding:6px; border-radius:12px; }
    .side-nav a::after,.side-out::after { text-transform:none; letter-spacing:0; font-size:.68rem; }
    .side-nav a.on { background:var(--accent-soft); }
    .side-nav a:hover:not(.on) { background:var(--hover); }
    .top-in { padding-top:calc(12px + env(safe-area-inset-top)); }
  }
  @media(max-width:640px) {
    .top-in { gap:12px; }
    .top h1 { font-size:1.1rem; }
    .top-act { width:100%; margin:0; }
    .top-act .theme-control { flex:1; }
    .top-act .theme-control select { flex:1; width:0; }
    .stats { grid-template-columns:repeat(2,minmax(0,1fr)); }
    .stat { padding:14px 12px; gap:10px; }
    .stat b { font-size:1.3rem; }
    .stat .lbl { font-size:.75rem; }
    .tiles { grid-template-columns:1fr; }
    .hero { padding-top:20px; }
    .card { padding:16px 14px; }
    .hero-act .search { width:100%; }
    .btn,.btn.sm,.fchip,.seg button,.tabs button,.asx-tgl { min-height:44px; }
    .btn.ic,.asx-tgl { min-width:44px; }
    input,select,textarea { font-size:16px; }
    .tbl { border-radius:0; }
    .tbl tbody tr { box-shadow:var(--shadow); }
    .tbl td { border-bottom-color:var(--line); padding:11px 13px; }
    .tbl td.sel-utama { background:var(--panel2); }
    .tbl td[data-l]::before { font-size:.75rem; letter-spacing:0; text-transform:none; font-weight:500; }
    .tbl .acts { justify-content:flex-start; }
    .audit .row-a { gap:6px 10px; }
    .login-wrap { padding:14px; }
    .login-top { padding:14px 18px; }
    .login-body { padding:22px 20px 0; }
    .appearance-card .theme-control { width:100%; justify-content:space-between; }
  }
  @media(max-width:360px) { .stats { grid-template-columns:1fr; } }
`;
