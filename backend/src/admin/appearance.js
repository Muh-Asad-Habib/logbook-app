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
    --bg:#f4f3fc; --bg2:#eceafa; --panel:#ffffff; --panel2:#f8f7ff;
    --line:#dfddf0; --line2:#8e89a8; --ink:#24203e; --mut:#625d7c;
    --p:#573bc6; --p2:#6141b5; --cy:#17647b; --ok:#197048; --warn:#855407; --bad:#b52b3b;
    --accent-soft:#efebff; --ok-soft:#edf7f0; --warn-soft:#fff5e3; --bad-soft:#fdf0f1; --cy-soft:#edf5f8;
    --primary-fill:#6040d4; --on-primary:#ffffff;
    --brand:linear-gradient(115deg,#5540ce,#7440cf);
    --hover:#f0edfc; --focus:#6246d7; --shadow:0 6px 22px rgba(57,43,116,.055);
    --dialog-shadow:0 24px 80px rgba(20,29,45,.22); --overlay:rgba(15,23,42,.45);
    --avatar-bg:94%; --avatar-ink:30%; --r:18px;
    --grad:var(--p); --grad3:var(--p);
  }
  :root[data-admin-theme="dark"] {
    color-scheme: dark;
    --bg:#101326; --bg2:#161b32; --panel:#1b2038; --panel2:#222942;
    --line:#353e60; --line2:#737d9e; --ink:#eef0ff; --mut:#b1bad7;
    --p:#b6b1ff; --p2:#c7b9ee; --cy:#91cbdc; --ok:#8dd5ae; --warn:#e9c17d; --bad:#f2a0aa;
    --accent-soft:#322e54; --ok-soft:#233b30; --warn-soft:#3b3224; --bad-soft:#402b32; --cy-soft:#263943;
    --primary-fill:#6845d7; --brand:linear-gradient(115deg,#6142d2,#7642cb);
    --hover:#2a304e; --focus:#c1bdff; --shadow:0 6px 22px rgba(0,0,0,.14);
    --dialog-shadow:0 24px 80px rgba(0,0,0,.38); --overlay:rgba(0,0,0,.6);
    --avatar-bg:25%; --avatar-ink:85%;
  }
  html { scrollbar-color:var(--line2) var(--bg); }
  body { background:var(--bg); font-size:15px; line-height:1.55; }
  body::before,.side::after,.top::after,.card::before,.stat::before,.stat::after,.tile::after,.login::before { content:none; }
  .orbs { display:none; }
  ::selection { background:var(--accent-soft); color:var(--ink); }
  ::-webkit-scrollbar-thumb { background:var(--line2); }
  ::-webkit-scrollbar-thumb:hover { background:var(--mut); }
  :where(a) { color:var(--p); }
  :where(button,a[href],input,select,textarea,summary):focus-visible { outline:2px solid var(--focus); outline-offset:3px; }
  .side { width:252px; background:var(--panel); backdrop-filter:none; animation:none; gap:22px; padding:26px 16px 20px; }
  .side-top { padding:0 4px 22px; border-bottom:1px solid var(--line); }
  .side-brand b { font-size:1.06rem; letter-spacing:-.025em; }
  .side-logo,.login .logo { background:var(--brand); color:var(--on-primary); box-shadow:0 5px 12px rgba(90,59,194,.16); animation:none; border-radius:14px; }
  .side-logo { width:46px; height:46px; flex-basis:46px; }
  .side-brand span,.side-note,.foot { color:var(--mut); font-family:inherit; text-transform:none; letter-spacing:0; font-size:.75rem; }
  .side-nav { gap:7px; }
  .side-nav a { min-height:48px; padding:12px 14px; font-size:.9rem; border-radius:12px; transition:background .12s,color .12s; }
  .side-nav a:hover { transform:none; background:var(--accent-soft); color:var(--p); box-shadow:none; }
  .side-nav a.on { transform:none; background:var(--primary-fill); color:var(--on-primary); box-shadow:0 4px 12px rgba(81,55,164,.14); }
  .side-nav a .i { width:18px; height:18px; }
  .side-nav a.on::before { display:none; }
  .side-foot { border-top:1px solid var(--line); padding-top:16px; }
  .side-out { color:var(--bad); border-color:var(--line); background:var(--panel); min-height:44px; border-radius:12px; }
  .side-out:hover { background:var(--bad-soft); transform:none; box-shadow:none; }
  .side-toggle { background:var(--panel); color:var(--mut); box-shadow:var(--shadow); border-radius:8px; width:32px; height:32px; right:-16px; }
  .side-toggle:hover { color:var(--p); background:var(--accent-soft); box-shadow:none; }
  .main { background:var(--bg); margin-left:252px; }
  .wrap,.top-in { max-width:1280px; }
  .wrap { padding:8px 28px 64px; }
  .top { background:var(--panel); backdrop-filter:none; border-bottom:1px solid var(--line); }
  .top-in { padding:18px 28px; flex-wrap:wrap; }
  .top-in>div:first-child { flex:1 1 190px; }
  .top h1 { font-size:1.35rem; line-height:1.4; letter-spacing:-.025em; flex-wrap:wrap; gap:12px; }
  .crumb { font-family:inherit; font-size:.72rem; letter-spacing:0; text-transform:none; flex-wrap:wrap; }
  .crumb .sep,.asx-meta .dot { background:var(--line2); }
  .top-act { align-items:center; flex-wrap:wrap; gap:12px; }
  .theme-control { display:flex; align-items:center; gap:10px; margin:0; font-size:.82rem; color:var(--mut); }
  .theme-control select { width:auto; margin:0; min-height:44px; padding:10px 12px; font-size:.875rem; background:var(--panel2); }
  .page.on { animation:none; }
  .hero { padding:28px 0 8px; gap:16px; align-items:center; }
  .hero-ic { display:flex; width:48px; height:48px; flex:0 0 48px; border-radius:14px; background:var(--accent-soft); color:var(--p); box-shadow:none; }
  .hero-ic .i { width:22px; height:22px; }
  .hero-tx h2 { font-size:1.35rem; letter-spacing:-.025em; line-height:1.35; }
  .hero-tx p { font-size:.875rem; line-height:1.65; max-width:80ch; }
  .hero-act { align-self:center; }
  .card,.stat,.tile,.asx { border-radius:var(--r); box-shadow:var(--shadow); animation:none; }
  .card:hover,.stat:hover,.tile:hover { transform:none; box-shadow:var(--shadow); border-color:var(--line); }
  .card { padding:24px; margin-top:20px; }
  .card h2 { font-size:1.06rem; line-height:1.45; }
  .card .mut { line-height:1.65; }
  .stats { grid-template-columns:repeat(3,minmax(0,1fr)); gap:16px; margin-top:20px; }
  .stat { padding:22px 20px; gap:16px; min-height:112px; }
  .stat,.tile { --icon-ink:var(--p); --icon-bg:var(--accent-soft); }
  .stat.s2 { --icon-ink:var(--cy); --icon-bg:var(--cy-soft); }
  .stat.s4,.tile.s4 { --icon-ink:var(--ok); --icon-bg:var(--ok-soft); }
  .stat.s3,.tile.s3 { --icon-ink:var(--warn); --icon-bg:var(--warn-soft); }
  .stat.s6 { --icon-ink:var(--bad); --icon-bg:var(--bad-soft); }
  .stat .ic,.tile .ic { background:var(--icon-bg); border:0; color:var(--icon-ink); box-shadow:none; border-radius:14px; }
  .stat .ic { width:48px; height:48px; flex-basis:48px; }
  .stat b { font-size:2rem; font-weight:750; letter-spacing:-.04em; line-height:1.25; }
  .stat .lbl { display:block; margin-top:4px; font-size:.84rem; font-weight:500; letter-spacing:0; text-transform:none; }
  .stat .sub { white-space:normal; font-size:.74rem; }
  .stat.hidup .ic::after { background:var(--ok); animation:none; }
  .tiles { grid-template-columns:repeat(2,minmax(0,1fr)); gap:16px; margin-top:22px; }
  .tile { padding:22px; gap:12px; }
  .tile b { font-size:1rem; }
  .tile:hover { background:var(--panel2); border-color:var(--line2); }
  .tile .go { color:var(--p); letter-spacing:0; text-transform:none; font-size:.8rem; }
  .tile span { font-size:.83rem; }
  .tile:hover .go .i { transform:rotate(180deg); }
  .btn { background:var(--panel); color:var(--ink); border-color:var(--line); border-radius:11px; font-weight:650; min-height:44px; }
  .btn:hover { background:var(--hover); border-color:var(--line2); transform:none; box-shadow:none; }
  .btn:active { transform:none; }
  .btn.p { background:var(--primary-fill); color:var(--on-primary); border:1px solid var(--primary-fill); box-shadow:0 3px 9px rgba(83,53,180,.12); }
  .btn.p:hover { filter:brightness(1.06); background:var(--primary-fill); }
  .btn.d,.err { color:var(--bad); background:var(--bad-soft); border-color:color-mix(in srgb,var(--bad) 40%,var(--line)); }
  .btn.d:hover { background:var(--bad-soft); box-shadow:none; }
  .btn.sm { font-size:.8rem; border-radius:9px; min-height:36px; }
  .btn.ic { min-width:36px; justify-content:center; }
  label { color:var(--ink); font-size:.875rem; font-weight:600; }
  input,select,textarea { background:var(--panel2); color:var(--ink); border:1px solid var(--line2); border-radius:11px; min-height:46px; font:inherit; padding:12px 14px; }
  textarea { width:100%; margin-top:6px; min-height:100px; resize:vertical; line-height:1.6; }
  input::placeholder,textarea::placeholder { color:var(--mut); opacity:1; }
  input:focus,select:focus,textarea:focus { border-color:var(--focus); box-shadow:0 0 0 3px var(--accent-soft); }
  input[type="checkbox"] { width:18px; height:18px; min-height:0; padding:0; accent-color:var(--p); }
  .in-wrap .i,.search .i { color:var(--mut); }
  .search { width:260px; }
  .search kbd,.tag,.dev-ip { background:var(--panel2); color:var(--mut); border-color:var(--line); }
  .tag { font-family:inherit; font-size:.72rem; font-weight:600; letter-spacing:0; }
  .mut { font-size:.85rem; }
  .seg,.tabs { background:var(--panel2); border-color:var(--line); border-radius:12px; gap:5px; }
  .seg button,.tabs button { min-height:40px; border-radius:8px; font-weight:600; }
  .seg button.on,.tabs button.on { background:var(--primary-fill); color:var(--on-primary); box-shadow:none; }
  .fchip.on { background:var(--accent-soft); color:var(--p); box-shadow:none; }
  .fchip { background:var(--panel); font-size:.78rem; border-radius:7px; padding:7px 12px; }
  .fchip.on { border-color:var(--p); }
  .tbl { border-radius:13px; margin-top:18px; }
  table { font-size:.875rem; }
  th { background:var(--panel2); color:var(--ink); font-size:.8rem; letter-spacing:0; text-transform:none; font-weight:650; }
  th,td { border-bottom-color:var(--line); padding:15px 16px; }
  tbody tr:hover { background:var(--hover); }
  tr.baris-total td { background:var(--panel2); }
  .u-cell>div { min-width:0; overflow-wrap:anywhere; }
  .acts { flex-wrap:wrap; justify-content:flex-end; gap:6px; }
  .ava { background:hsl(var(--avatar-h,245),30%,var(--avatar-bg)); color:hsl(var(--avatar-h,245),45%,var(--avatar-ink)); box-shadow:none; border:1px solid var(--line); }
  .badge,.st,.live { font-weight:600; font-size:.75rem; letter-spacing:0; text-transform:none; }
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
  dialog { background:var(--panel); border-color:var(--line); border-radius:20px; box-shadow:var(--dialog-shadow); overflow-wrap:anywhere; }
  dialog::backdrop,.dlg-bg { background:var(--overlay); backdrop-filter:blur(2px); }
  .dlg-h { background:var(--panel2); padding:20px 22px; }
  .dlg-h h3 { white-space:normal; overflow-wrap:anywhere; line-height:1.4; font-size:1rem; }
  .dlg-h .x { flex-shrink:0; }
  .dlg-b { scrollbar-gutter:stable; }
  dialog.besar .tabs { display:flex; overflow-x:auto; max-width:100%; }
  dialog.besar .tabs button { flex-shrink:0; white-space:nowrap; }
  .tst { background:var(--panel); box-shadow:var(--dialog-shadow); }
  .login { max-width:460px; border:1px solid var(--line); border-radius:24px; background:var(--panel); box-shadow:var(--dialog-shadow); animation:none; }
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
    .side { width:auto; background:var(--panel); box-shadow:0 4px 20px rgba(0,0,0,.08); gap:4px; padding:6px; border-radius:16px; }
    .side-nav { gap:4px; }
    .side-nav a { padding:8px 4px; }
    .side-foot { border:0; padding:0; }
    .side-nav a::after,.side-out::after { text-transform:none; letter-spacing:0; font-size:.68rem; }
    .side-nav a.on { background:var(--primary-fill); }
    .side-nav a:hover:not(.on) { background:var(--hover); }
    .main { margin-left:0; }
    .wrap { padding:8px max(18px,env(safe-area-inset-right)) calc(112px + env(safe-area-inset-bottom)) max(18px,env(safe-area-inset-left)); }
    .top-in { padding-top:calc(12px + env(safe-area-inset-top)); }
  }
  @media(max-width:640px) {
    .top-in { gap:12px; padding-left:16px; padding-right:16px; }
    .top h1 { font-size:1.1rem; }
    .top-act { width:100%; margin:0; }
    .top-act .theme-control { flex:1; }
    .top-act .theme-control select { flex:1; width:0; }
    .wrap { padding-left:12px; padding-right:12px; }
    .stats { grid-template-columns:repeat(2,minmax(0,1fr)); gap:10px; }
    .stat { padding:16px 12px; gap:10px; min-height:98px; }
    .stat .ic { width:34px; height:34px; flex-basis:34px; border-radius:10px; }
    .stat b { font-size:1.55rem; }
    .stat .lbl { font-size:.75rem; }
    .tiles { grid-template-columns:1fr; }
    .hero { padding-top:20px; gap:12px; }
    .hero-ic { width:40px; height:40px; flex-basis:40px; border-radius:12px; }
    .hero-tx { flex-basis:190px; }
    .hero-tx h2 { font-size:1.14rem; }
    .card { padding:18px 14px; }
    .tile { padding:18px; }
    .hero-act .search { width:100%; }
    .btn,.btn.sm,.fchip,.seg button,.tabs button,.asx-tgl { min-height:44px; }
    .btn.ic,.asx-tgl { min-width:44px; }
    input,select,textarea { font-size:16px; }
    .tbl { border-radius:0; }
    .tbl tbody tr { box-shadow:var(--shadow); }
    .tbl td { border-bottom-color:var(--line); padding:12px 14px; }
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
