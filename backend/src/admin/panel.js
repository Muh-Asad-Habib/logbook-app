/**
 * Panel pemeliharaan — satu halaman HTML mandiri (CSS & JS inline).
 * Disajikan LANGSUNG oleh backend di path rahasia; sama sekali bukan bagian
 * dari build Next.js, jadi tidak ada jejaknya di bundel frontend (F12 aman).
 */
export const PANEL_HTML = /* html */ `<!doctype html>
<html lang="id">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex,nofollow,noarchive">
<title>Pusat Kendali</title>
<style>
  :root{
    --bg:#05070f;--card:rgba(17,24,48,.66);--card2:rgba(13,20,42,.92);
    --line:rgba(99,112,180,.16);--line2:rgba(122,138,212,.30);
    --ink:#eef1ff;--mut:#8d9bce;--p:#6366f1;--p2:#8b5cf6;--p3:#d946ef;
    --ok:#34d399;--warn:#fbbf24;--bad:#fb7185;--cy:#22d3ee;--r:18px;
    --grad:linear-gradient(120deg,#6366f1,#8b5cf6);
    --grad3:linear-gradient(120deg,#6366f1 0%,#8b5cf6 50%,#d946ef 100%);
  }
  *{box-sizing:border-box;margin:0;padding:0}
  html{scroll-behavior:smooth}
  body{
    font-family:"Segoe UI",system-ui,-apple-system,sans-serif;color:var(--ink);min-height:100vh;
    background:
      radial-gradient(1100px 520px at 88% -12%,rgba(99,102,241,.20),transparent 60%),
      radial-gradient(900px 460px at -10% -6%,rgba(217,70,239,.09),transparent 55%),
      radial-gradient(800px 420px at 50% 115%,rgba(34,211,238,.07),transparent 60%),
      var(--bg);
  }
  body::before{
    content:"";position:fixed;inset:0;z-index:-1;pointer-events:none;
    background-image:
      linear-gradient(rgba(148,163,255,.045) 1px,transparent 1px),
      linear-gradient(90deg,rgba(148,163,255,.045) 1px,transparent 1px);
    background-size:44px 44px;
    mask-image:radial-gradient(80% 60% at 50% 0%,#000 0%,transparent 100%);
  }
  ::selection{background:rgba(139,92,246,.4)}
  ::-webkit-scrollbar{width:9px;height:9px}
  ::-webkit-scrollbar-thumb{background:#2c3a6b;border-radius:9px}
  ::-webkit-scrollbar-thumb:hover{background:#3b4c8a}
  ::-webkit-scrollbar-track{background:transparent}
  .wrap{max-width:1180px;margin:0 auto;padding:0 18px 60px}

  @keyframes up{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}
  @keyframes pop{from{opacity:0;transform:translateY(16px) scale(.97)}to{opacity:1;transform:none}}
  @keyframes floaty{0%,100%{transform:translateY(0)}50%{transform:translateY(-4px)}}
  @keyframes spin{to{transform:rotate(360deg)}}
  @keyframes drift{from{transform:translate(0,0) scale(1)}to{transform:translate(46px,-34px) scale(1.1)}}
  @keyframes pulseGlow{0%,100%{opacity:.28}50%{opacity:.5}}
  @keyframes barShrink{from{width:100%}to{width:0}}
  @keyframes blink{0%{box-shadow:0 0 0 0 rgba(52,211,153,.55)}70%{box-shadow:0 0 0 8px rgba(52,211,153,0)}100%{box-shadow:0 0 0 0 rgba(52,211,153,0)}}

  /* ---------- orbs latar ---------- */
  .orbs{position:fixed;inset:0;z-index:-2;overflow:hidden;pointer-events:none}
  .orb{position:absolute;display:block;border-radius:50%;filter:blur(90px);opacity:.5;animation:drift 20s ease-in-out infinite alternate}
  .orb.a{width:540px;height:540px;background:rgba(99,102,241,.32);top:-190px;right:-130px}
  .orb.b{width:440px;height:440px;background:rgba(217,70,239,.20);bottom:-170px;left:-150px;animation-delay:-7s}
  .orb.c{width:380px;height:380px;background:rgba(34,211,238,.15);top:38%;left:58%;animation-delay:-13s}

  /* ---------- ikon svg ---------- */
  .i{width:15px;height:15px;stroke:currentColor;stroke-width:2;fill:none;
     stroke-linecap:round;stroke-linejoin:round;flex:0 0 auto}

  /* ---------- topbar ---------- */
  .top{position:sticky;top:0;z-index:50;backdrop-filter:blur(16px) saturate(1.4);background:rgba(5,8,18,.72)}
  .top::after{content:"";position:absolute;left:0;right:0;bottom:0;height:1px;
    background:linear-gradient(90deg,transparent,rgba(99,102,241,.55),rgba(217,70,239,.4),rgba(34,211,238,.35),transparent)}
  .top-in{max-width:1180px;margin:0 auto;padding:13px 18px;display:flex;align-items:center;gap:13px}
  .logo{
    width:42px;height:42px;border-radius:13px;flex:0 0 42px;display:flex;align-items:center;
    justify-content:center;font-size:1.25rem;background:var(--grad);
    box-shadow:0 10px 26px rgba(99,102,241,.5),inset 0 0 0 1px rgba(255,255,255,.18);
    animation:floaty 5s ease-in-out infinite;
  }
  .top h1{font-size:1.02rem;letter-spacing:-.01em;display:flex;align-items:center;gap:9px}
  .top .sub{color:var(--mut);font-size:.72rem;margin-top:1px}
  .top-act{margin-left:auto;display:flex;gap:8px}
  .live{display:inline-flex;align-items:center;gap:6px;font-size:.62rem;font-weight:800;
    color:var(--ok);letter-spacing:.08em;text-transform:uppercase;
    background:rgba(52,211,153,.1);border:1px solid rgba(52,211,153,.3);
    padding:2.5px 9px;border-radius:99px}
  .live i{width:6px;height:6px;border-radius:50%;background:var(--ok);animation:blink 1.8s infinite}
  .live.mati{color:var(--warn);background:rgba(251,191,36,.1);border-color:rgba(251,191,36,.3)}
  .live.mati i{background:var(--warn);animation:none}

  /* ---------- kartu & tombol ---------- */
  .card{
    position:relative;overflow:hidden;background:var(--card);border:1px solid var(--line);
    border-radius:var(--r);padding:20px 22px;margin-top:16px;backdrop-filter:blur(10px);
    box-shadow:0 14px 40px -18px rgba(0,0,0,.55);animation:up .45s ease both;
  }
  .card::before{content:"";position:absolute;inset:0 0 auto 0;height:1px;
    background:linear-gradient(90deg,transparent,rgba(139,92,246,.35),transparent)}
  .card{transition:transform .18s ease,border-color .18s ease,box-shadow .18s ease}
  .card:hover{transform:translateY(-2px);border-color:var(--line2);box-shadow:0 22px 52px -20px rgba(0,0,0,.62)}
  .card h2{font-size:.95rem;display:flex;align-items:center;gap:9px}
  .card h2 .i{width:16px;height:16px;color:#a5b4fc}
  .card h2 .tag{font-size:.66rem;color:var(--mut);font-weight:600;background:#111b3a;
    border:1px solid var(--line);padding:2px 9px;border-radius:99px}
  .mut{color:var(--mut);font-size:.78rem}
  .row{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
  .spread{justify-content:space-between}
  .btn{
    cursor:pointer;border:1px solid var(--line2);background:rgba(20,31,66,.85);color:var(--ink);
    border-radius:11px;padding:9px 16px;font:inherit;font-size:.82rem;font-weight:700;
    display:inline-flex;align-items:center;gap:7px;transition:.16s;white-space:nowrap;
  }
  .btn .i{width:14px;height:14px}
  .btn:hover{border-color:var(--p);transform:translateY(-1px);box-shadow:0 8px 20px rgba(99,102,241,.25)}
  .btn:active{transform:scale(.97)}
  .btn:focus-visible{outline:2px solid var(--p);outline-offset:2px}
  .btn.p{background:var(--grad);border:none;box-shadow:0 6px 18px rgba(99,102,241,.4)}
  .btn.p:hover{filter:brightness(1.12)}
  .btn.d{background:rgba(251,113,133,.12);border-color:rgba(251,113,133,.35);color:#fda4af}
  .btn.d:hover{background:rgba(251,113,133,.2);border-color:var(--bad);box-shadow:0 8px 20px rgba(251,113,133,.2)}
  .btn.sm{padding:6px 11px;font-size:.74rem;border-radius:9px}
  .btn.sm .i{width:13px;height:13px}
  .btn.ic{padding:6px 8px}
  .btn:disabled{opacity:.5;cursor:wait;transform:none}
  .memuat .i{animation:spin .7s linear infinite}

  /* ---------- form ---------- */
  label{display:block;font-size:.73rem;font-weight:700;color:var(--mut);margin-top:13px}
  input{
    width:100%;margin-top:6px;padding:11px 13px;border-radius:11px;border:1px solid var(--line2);
    background:rgba(9,15,36,.9);color:var(--ink);font:inherit;font-size:.88rem;transition:.15s;
  }
  input:focus{outline:none;border-color:var(--p);box-shadow:0 0 0 3px rgba(99,102,241,.28)}
  input::placeholder{color:#4d5a8c}
  .in-wrap{position:relative;display:block;margin-top:6px}
  .in-wrap .i{position:absolute;left:12px;top:50%;transform:translateY(-50%);color:#55639b;pointer-events:none}
  .in-wrap input{margin-top:0;padding-left:38px}
  .search{position:relative;width:240px;max-width:100%}
  .search .i{position:absolute;left:12px;top:50%;transform:translateY(-50%);width:14px;height:14px;
    color:#55639b;pointer-events:none}
  .search input{margin:0;padding:9px 13px 9px 36px;font-size:.82rem}

  /* ---------- statistik ---------- */
  .stats{display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));margin-top:18px}
  .stat{
    position:relative;overflow:hidden;background:var(--card2);border:1px solid var(--line);
    border-radius:16px;padding:16px 18px;display:flex;gap:14px;align-items:center;
    transition:.2s;animation:pop .45s ease both;
  }
  .stat:nth-child(2){animation-delay:.05s}
  .stat:nth-child(3){animation-delay:.1s}
  .stat:nth-child(4){animation-delay:.15s}
  .stat::after{content:"";position:absolute;left:0;right:0;top:0;height:2.5px;
    background:linear-gradient(90deg,var(--a),transparent 75%)}
  .stat::before{content:"";position:absolute;width:130px;height:130px;right:-36px;top:-46px;
    border-radius:50%;background:var(--a);opacity:.09;filter:blur(30px)}
  .stat:hover{transform:translateY(-3px);border-color:var(--line2);box-shadow:0 18px 36px -18px var(--a)}
  .stat .ic{width:44px;height:44px;border-radius:13px;flex:0 0 44px;display:flex;align-items:center;
    justify-content:center;color:var(--a);background:rgba(255,255,255,.035);
    border:1px solid rgba(255,255,255,.08);box-shadow:0 0 22px -8px var(--a)}
  .stat .ic .i{width:20px;height:20px;stroke-width:1.8}
  .stat b{font-size:1.55rem;letter-spacing:-.03em;display:block;line-height:1.1;font-variant-numeric:tabular-nums}
  .stat .lbl{color:var(--mut);font-size:.68rem;font-weight:700;letter-spacing:.06em;text-transform:uppercase}
  .s1{--a:#818cf8}.s2{--a:#22d3ee}.s3{--a:#fbbf24}.s4{--a:#34d399}.s5{--a:#f0abfc}

  /* ---------- tabel ---------- */
  .tbl{overflow:auto;margin-top:12px;border:1px solid var(--line);border-radius:13px}
  table{width:100%;border-collapse:separate;border-spacing:0;font-size:.82rem;min-width:680px}
  th,td{text-align:left;padding:12px 15px;border-bottom:1px solid rgba(99,112,180,.13);vertical-align:middle}
  th{color:var(--mut);font-size:.64rem;text-transform:uppercase;letter-spacing:.07em;
     background:rgba(9,14,32,.95);position:sticky;top:0;z-index:1;backdrop-filter:blur(6px)}
  tbody tr{transition:background .13s}
  tbody tr:hover{background:rgba(99,102,241,.08)}
  tbody tr:last-child td{border-bottom:none}
  td.num,th.num{text-align:right;font-variant-numeric:tabular-nums}
  .acts-cell{text-align:right;white-space:nowrap}
  .acts{display:inline-flex;gap:6px;flex-wrap:nowrap}

  /* ---------- avatar & badge ---------- */
  .ava{width:34px;height:34px;border-radius:50%;flex:0 0 34px;display:inline-flex;align-items:center;
    justify-content:center;font-weight:800;font-size:.86rem;background:var(--grad);color:#fff;
    box-shadow:0 4px 12px rgba(0,0,0,.35),inset 0 0 0 1px rgba(255,255,255,.22)}
  .ava.lg{width:42px;height:42px;flex:0 0 42px;border-radius:14px;font-size:1rem}
  .u-cell{display:flex;gap:11px;align-items:center;min-width:170px}
  .badge{display:inline-flex;align-items:center;gap:5px;padding:2.5px 10px;border-radius:99px;
    font-size:.66rem;font-weight:700;white-space:nowrap}
  .badge::before{content:"";width:5px;height:5px;border-radius:50%;background:currentColor}
  .badge.g{background:rgba(52,211,153,.13);color:var(--ok)}
  .badge.b{background:rgba(99,102,241,.16);color:#a5b4fc}
  .badge.y{background:rgba(251,191,36,.13);color:var(--warn)}
  .badge.r{background:rgba(251,113,133,.13);color:var(--bad)}
  .badge.c{background:rgba(34,211,238,.12);color:var(--cy)}

  /* ---------- foto thumbnail ---------- */
  .ths{display:flex;gap:5px;flex-wrap:wrap}
  .th{width:42px;height:42px;object-fit:cover;border-radius:9px;border:1px solid var(--line2);
    cursor:zoom-in;transition:.15s}
  .th:hover{transform:scale(1.14);border-color:var(--p);box-shadow:0 8px 20px rgba(0,0,0,.5)}

  /* ---------- dialog ---------- */
  dialog{
    border:1px solid var(--line2);border-radius:18px;color:var(--ink);
    background:linear-gradient(180deg,#0d1533,#0a112a);
    padding:0;width:calc(100% - 36px);box-shadow:0 40px 120px rgba(0,0,0,.65);
    margin:auto;max-height:calc(100vh - 44px);
  }
  dialog[open]{animation:pop .24s ease}
  dialog::backdrop{background:rgba(3,6,15,.78);backdrop-filter:blur(5px)}
  dialog.mini{max-width:430px}
  dialog.besar{width:calc(100vw - 32px);max-width:1440px}
  dialog.besar .dlg-b{max-height:calc(100vh - 168px);padding:20px 24px 24px}
  dialog.besar table{font-size:.88rem;min-width:760px}
  dialog.besar th,dialog.besar td{padding:13px 15px}
  dialog.besar .th{width:54px;height:54px;border-radius:10px}
  dialog.besar .chip{padding:11px 18px;font-size:.84rem;min-width:132px}
  dialog.besar .chip b{font-size:1.08rem}
  dialog.besar .chip small{font-size:.64rem}
  dialog.besar .tabs button{font-size:.84rem;padding:9px 20px}
  dialog.besar .prog{min-width:110px;height:9px}
  dialog.besar .tline{max-height:calc(100vh - 420px)}
  .dlg-h{display:flex;align-items:center;gap:12px;padding:16px 20px;
    background:linear-gradient(120deg,rgba(99,102,241,.22),rgba(217,70,239,.12));
    border-bottom:1px solid var(--line)}
  .dlg-h h3{font-size:.98rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .dlg-h .x{margin-left:auto}
  .dlg-b{padding:18px 20px 20px;max-height:calc(100vh - 230px);overflow:auto}
  dialog.besar .dlg-h{padding:18px 24px}
  dialog.besar .dlg-h h3{font-size:1.12rem}
  dialog.besar .dlg-h .mut{font-size:.82rem}

  /* ---------- chips ringkasan ---------- */
  .chips{display:flex;gap:9px;flex-wrap:wrap}
  .chip{background:rgba(12,19,44,.92);border:1px solid var(--line2);border-radius:13px;
    padding:9px 14px;font-size:.78rem;font-weight:700;min-width:116px}
  .chip small{display:block;font-size:.6rem;color:var(--mut);font-weight:700;letter-spacing:.06em;
    text-transform:uppercase;margin-bottom:3px}
  .chip b{font-size:.95rem}
  .chip.hijau{border-color:rgba(52,211,153,.35)} .chip.hijau b{color:var(--ok)}
  .chip.merah{border-color:rgba(251,113,133,.35)} .chip.merah b{color:var(--bad)}
  .chip.ungu{border-color:rgba(139,92,246,.4)} .chip.ungu b{color:#c4b5fd}
  .chip.biru{border-color:rgba(34,211,238,.35)} .chip.biru b{color:var(--cy)}

  /* ---------- tab ---------- */
  .tabs{display:inline-flex;gap:5px;background:rgba(9,15,36,.9);padding:5px;border-radius:12px;
    border:1px solid var(--line);margin-top:16px}
  .tabs button{border:none;background:transparent;color:var(--mut);font:inherit;font-size:.78rem;
    font-weight:700;padding:8px 16px;border-radius:9px;cursor:pointer;transition:.15s}
  .tabs button:hover{color:var(--ink)}
  .tabs button.on{background:var(--grad);color:#fff;box-shadow:0 4px 14px rgba(99,102,241,.4)}

  /* ---------- progress ---------- */
  .prog{height:8px;background:#131d40;border-radius:99px;overflow:hidden;min-width:74px}
  .prog>i{display:block;height:100%;border-radius:99px;background:var(--grad3);
    box-shadow:0 0 10px rgba(139,92,246,.55)}

  /* ---------- util ---------- */
  .err{background:rgba(251,113,133,.12);border:1px solid rgba(251,113,133,.4);color:#fda4af;
    border-radius:11px;padding:11px 14px;font-size:.8rem;margin-top:12px;animation:up .25s ease}
  .kosong{text-align:center;padding:46px 16px;color:var(--mut);
    border:1.5px dashed rgba(99,112,180,.35);border-radius:14px;margin-top:10px}
  .kosong .big{font-size:2.4rem;margin-bottom:6px;animation:floaty 3.2s ease-in-out infinite}
  .hide{display:none!important}
  .grid2{display:grid;gap:16px;grid-template-columns:1.2fr 1fr}
  @media(max-width:860px){.grid2{grid-template-columns:1fr}}
  .foot{text-align:center;color:#3f4c7e;font-size:.68rem;margin-top:28px;letter-spacing:.08em}

  /* ---------- jejak audit ---------- */
  .audit{font-family:Consolas,monospace;font-size:.7rem;color:var(--mut);max-height:330px;
    overflow:auto;margin-top:12px}
  .audit .row-a{display:flex;gap:9px;align-items:center;padding:6px 5px;min-width:0;
    border-bottom:1px dashed rgba(99,112,180,.16);border-radius:6px;transition:background .12s}
  .audit .row-a:hover{background:rgba(99,102,241,.07)}
  .audit .t{color:#5b6ba3;flex:0 0 auto;font-size:.66rem}
  .audit .badge{flex:0 0 auto;font-size:.6rem;padding:2px 8px;font-family:"Segoe UI",system-ui,sans-serif}
  .audit .tg{min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}

  /* ---------- linimasa aktivitas per pengguna ---------- */
  .tline{margin-top:14px;max-height:52vh;overflow:auto;padding-right:4px}
  .tl-item{position:relative;display:flex;gap:12px;padding:0 0 16px 0}
  .tl-item::before{content:"";position:absolute;left:14px;top:30px;bottom:-2px;width:2px;
    background:linear-gradient(180deg,rgba(122,138,212,.35),rgba(122,138,212,.08))}
  .tl-item:last-child::before{display:none}
  .tl-dot{width:30px;height:30px;border-radius:10px;flex:0 0 30px;display:flex;align-items:center;
    justify-content:center;background:rgba(255,255,255,.04);border:1px solid var(--line2);z-index:1}
  .tl-dot .i{width:14px;height:14px}
  .tl-dot.g{color:var(--ok);border-color:rgba(52,211,153,.4);box-shadow:0 0 14px -4px rgba(52,211,153,.5)}
  .tl-dot.r{color:var(--bad);border-color:rgba(251,113,133,.4);box-shadow:0 0 14px -4px rgba(251,113,133,.5)}
  .tl-dot.y{color:var(--warn);border-color:rgba(251,191,36,.4);box-shadow:0 0 14px -4px rgba(251,191,36,.5)}
  .tl-dot.c{color:var(--cy);border-color:rgba(34,211,238,.4);box-shadow:0 0 14px -4px rgba(34,211,238,.5)}
  .tl-dot.b{color:#a5b4fc;border-color:rgba(99,102,241,.45);box-shadow:0 0 14px -4px rgba(99,102,241,.5)}
  .tl-body{flex:1;min-width:0;background:rgba(12,19,44,.65);border:1px solid var(--line);
    border-radius:12px;padding:9px 13px}
  .tl-body b{font-size:.8rem}
  .tl-meta{color:var(--mut);font-size:.68rem;margin-top:2px;display:flex;gap:8px;flex-wrap:wrap;align-items:center}
  .tl-src{font-size:.58rem;font-weight:800;letter-spacing:.06em;text-transform:uppercase;
    padding:1.5px 8px;border-radius:99px;border:1px solid rgba(99,102,241,.4);color:#a5b4fc}
  .tl-src.panel{border-color:rgba(217,70,239,.45);color:#f0abfc}

  /* ---------- toast ---------- */
  #toast{position:fixed;right:16px;bottom:16px;z-index:99;display:flex;flex-direction:column;gap:8px}
  .tst{position:relative;overflow:hidden;display:flex;gap:9px;align-items:flex-start;
    background:#0f1a3d;border:1px solid var(--line2);border-left:3px solid var(--ok);
    border-radius:12px;padding:11px 15px 13px;font-size:.8rem;font-weight:600;min-width:240px;
    max-width:360px;box-shadow:0 16px 40px rgba(0,0,0,.5);animation:pop .22s ease}
  .tst.bad{border-left-color:var(--bad)}
  .tst .bar{position:absolute;left:0;bottom:0;height:2.5px;background:var(--ok);
    animation:barShrink 4.2s linear forwards}
  .tst.bad .bar{background:var(--bad)}

  /* ---------- login ---------- */
  .login-wrap{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:22px}
  .login{
    width:100%;max-width:404px;border-radius:24px;padding:32px 30px;position:relative;
    background:linear-gradient(rgba(12,19,44,.94),rgba(12,19,44,.94)) padding-box,var(--grad3) border-box;
    border:1.5px solid transparent;box-shadow:0 34px 90px -18px rgba(99,102,241,.4);animation:pop .35s ease;
  }
  .login::before{content:"";position:absolute;inset:-3px;border-radius:26px;background:var(--grad3);
    filter:blur(28px);opacity:.3;z-index:-1;animation:pulseGlow 4.5s ease-in-out infinite}
  .login .logo{width:60px;height:60px;border-radius:18px;font-size:1.75rem;margin:0 auto 14px}
  .login h1{text-align:center;font-size:1.18rem;letter-spacing:-.01em}
  .login .mut{text-align:center;margin-top:5px}
  .login .hint{margin-top:18px;text-align:center;font-size:.66rem;color:#4d5a8c}

  @media(max-width:640px){
    .top-in{padding:11px 14px;flex-wrap:wrap;row-gap:9px}
    .top h1{flex-wrap:wrap}
    .top-act{margin-left:auto}
    .wrap{padding:0 14px 70px}
    .search{width:100%}
    .card{padding:16px 15px}
    .tabs{display:flex;max-width:100%;overflow-x:auto;scrollbar-width:none}
    .tabs::-webkit-scrollbar{display:none}
    .tabs button{white-space:nowrap;flex:1 0 auto;padding:8px 13px}
    .chips{gap:7px}
    .chip{flex:1 1 calc(50% - 7px);min-width:0}
    .login{padding:26px 20px}
    .dlg-h{padding:13px 15px}
    .dlg-b{padding:15px;max-height:calc(100vh - 190px)}
    dialog.besar .dlg-b{padding:14px 14px 18px}
    .acts .btn.sm{padding:7px 9px}
  }
  @media(prefers-reduced-motion:reduce){
    *,*::before,*::after{animation:none!important;transition:none!important}
  }
</style>
</head>
<body>

<!-- ===== sprite ikon (svg inline agar konsisten di semua OS) ===== -->
<svg xmlns="http://www.w3.org/2000/svg" style="display:none" aria-hidden="true">
  <symbol id="i-users" viewBox="0 0 24 24"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></symbol>
  <symbol id="i-user" viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></symbol>
  <symbol id="i-cal" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="17" rx="3"/><path d="M16 2v4M8 2v4M3 9h18"/></symbol>
  <symbol id="i-coins" viewBox="0 0 24 24"><circle cx="8" cy="8" r="6"/><path d="M18.09 10.37A6 6 0 1 1 10.34 18"/><path d="M7 6h1v4"/><path d="m16.71 13.88.7.71-2.82 2.82"/></symbol>
  <symbol id="i-zap" viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></symbol>
  <symbol id="i-refresh" viewBox="0 0 24 24"><path d="M3 12a9 9 0 0 1 15.5-6.2L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15.5 6.2L3 16"/><path d="M3 21v-5h5"/></symbol>
  <symbol id="i-logout" viewBox="0 0 24 24"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/></symbol>
  <symbol id="i-power" viewBox="0 0 24 24"><path d="M18.4 6.6a9 9 0 1 1-12.8 0"/><path d="M12 2v10"/></symbol>
  <symbol id="i-search" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></symbol>
  <symbol id="i-folder" viewBox="0 0 24 24"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></symbol>
  <symbol id="i-edit" viewBox="0 0 24 24"><path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></symbol>
  <symbol id="i-key" viewBox="0 0 24 24"><circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6"/><path d="m15.5 7.5 3 3L22 7l-3-3"/></symbol>
  <symbol id="i-trash" viewBox="0 0 24 24"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M10 11v6M14 11v6"/></symbol>
  <symbol id="i-x" viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12"/></symbol>
  <symbol id="i-save" viewBox="0 0 24 24"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><path d="M17 21v-8H7v8"/><path d="M7 3v5h8"/></symbol>
  <symbol id="i-unlock" viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="10" rx="2.5"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></symbol>
  <symbol id="i-lock" viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="10" rx="2.5"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></symbol>
  <symbol id="i-scroll" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M16 13H8M16 17H8"/></symbol>
</svg>

<div class="orbs"><i class="orb a"></i><i class="orb b"></i><i class="orb c"></i></div>

<!-- ===== LOGIN ===== -->
<div id="v-login" class="login-wrap">
  <div class="login">
    <div class="logo">🛡️</div>
    <h1>Pusat Kendali</h1>
    <div class="mut">Area terbatas — seluruh aktivitas tercatat di jejak audit</div>
    <form id="f-login">
      <label>Username
        <span class="in-wrap"><svg class="i"><use href="#i-user"/></svg>
        <input id="l-u" autocomplete="off" autofocus placeholder="username"></span>
      </label>
      <label>Password
        <span class="in-wrap"><svg class="i"><use href="#i-lock"/></svg>
        <input id="l-p" type="password" autocomplete="off" placeholder="••••••••"></span>
      </label>
      <div id="l-err" class="err hide"></div>
      <button class="btn p" style="width:100%;margin-top:20px;justify-content:center">
        <svg class="i"><use href="#i-unlock"/></svg> Masuk
      </button>
    </form>
    <div class="hint">Akses hanya untuk pengelola — kredensial tersimpan satu arah (hash)</div>
  </div>
</div>

<!-- ===== APP ===== -->
<div id="v-app" class="hide">
  <div class="top">
    <div class="top-in">
      <div class="logo">🛡️</div>
      <div>
        <h1>Pusat Kendali <span class="live mati" id="live-badge"><i></i><span id="live-txt">menyambung…</span></span></h1>
        <div class="sub">Kelola akun & pantau seluruh data — password tersimpan satu arah (hash)</div>
      </div>
      <div class="top-act">
        <button class="btn sm" id="btn-muat" data-act="muat"><svg class="i"><use href="#i-refresh"/></svg> Segarkan</button>
        <button class="btn sm d" data-act="keluar"><svg class="i"><use href="#i-logout"/></svg> Keluar</button>
      </div>
    </div>
  </div>

  <div class="wrap">
    <div class="stats" id="statistik"></div>

    <div class="card">
      <div class="row spread">
        <h2><svg class="i"><use href="#i-users"/></svg> Akun pengguna <span class="tag" id="jml-user"></span></h2>
        <span class="search"><svg class="i"><use href="#i-search"/></svg>
        <input id="cari" placeholder="Cari username…"></span>
      </div>
      <div class="tabs" style="margin-top:12px">
        <button class="on" data-role-tab="tim">👥 Tim</button>
        <button data-role-tab="fasilitator">🎓 Fasilitator</button>
      </div>
      <div class="tbl">
        <table>
          <thead><tr id="t-users-head">
            <th>Akun</th><th class="num">Kegiatan</th><th class="num">Belanja</th>
            <th class="num">Foto</th><th>Sesi</th><th>Aktivitas</th>
            <th style="text-align:right">Aksi</th>
          </tr></thead>
          <tbody id="t-users"></tbody>
        </table>
      </div>
    </div>

    <div class="grid2">
      <div class="card">
        <h2><svg class="i"><use href="#i-scroll"/></svg> Jejak audit <span class="tag">60 terakhir</span></h2>
        <div class="audit" id="audit"></div>
      </div>
      <div>
        <div class="card" style="margin-top:16px">
          <h2>🎓 Kode pendaftaran fasilitator <span class="tag" id="kode-status">—</span></h2>
          <p class="mut" style="margin-top:8px">Kode ini wajib dimasukkan saat seseorang mendaftar
          sebagai fasilitator. Disimpan sebagai hash — tidak bisa dilihat lagi, hanya bisa diganti.</p>
          <form id="f-kode">
            <label>Kode baru (min. 6 karakter)
              <span class="in-wrap"><svg class="i"><use href="#i-key"/></svg>
              <input id="k-val" autocomplete="off" placeholder="kode rahasia fasilitator"></span>
            </label>
            <button class="btn p" style="margin-top:14px"><svg class="i"><use href="#i-save"/></svg> Simpan kode</button>
          </form>
        </div>
        <div class="card">
          <h2><svg class="i"><use href="#i-lock"/></svg> Akun pemeliharaan</h2>
          <p class="mut" style="margin-top:8px">Ganti kredensial panel ini. Nilai baru disimpan sebagai
          hash scrypt — tidak bisa dilihat lagi setelah disimpan, hanya bisa diganti.</p>
          <form id="f-self">
            <label>Username baru (opsional)
              <span class="in-wrap"><svg class="i"><use href="#i-user"/></svg>
              <input id="s-u" autocomplete="off"></span>
            </label>
            <label>Password baru (opsional, min. 10)
              <span class="in-wrap"><svg class="i"><use href="#i-key"/></svg>
              <input id="s-p" type="password" autocomplete="off"></span>
            </label>
            <label>Password saat ini (wajib)
              <span class="in-wrap"><svg class="i"><use href="#i-lock"/></svg>
              <input id="s-cur" type="password" autocomplete="off"></span>
            </label>
            <button class="btn p" style="margin-top:16px"><svg class="i"><use href="#i-save"/></svg> Simpan kredensial</button>
          </form>
        </div>
      </div>
    </div>

    <div class="foot">🛡️ Pusat Kendali — akses terbatas & teraudit</div>
  </div>
</div>

<!-- ===== DIALOG DETAIL ===== -->
<dialog id="d-detail" class="besar">
  <div class="dlg-h">
    <span class="ava lg" id="dt-ava">?</span>
    <div style="min-width:0">
      <h3 id="dt-nama">—</h3>
      <div class="mut" id="dt-sub">—</div>
    </div>
    <button class="btn sm x" data-act="tutup-detail"><svg class="i"><use href="#i-x"/></svg> Tutup</button>
  </div>
  <div class="dlg-b">
    <div class="chips" id="dt-chips"></div>
    <div class="tabs">
      <button class="on" data-tab="keg">🗓️ Kegiatan</button>
      <button data-tab="keu">💰 Keuangan</button>
      <button data-tab="lap">📄 Laporan</button>
      <button data-tab="akt">📜 Aktivitas</button>
    </div>
    <div id="dt-isi"></div>
  </div>
</dialog>

<!-- ===== DIALOG ASSIGN TIM FASILITATOR ===== -->
<dialog id="d-tim" class="mini">
  <div class="dlg-h"><h3>🔗 Tim yang diampu</h3></div>
  <div class="dlg-b">
    <p class="mut" id="d-tim-sub"></p>
    <form method="dialog" id="f-tim">
      <div id="d-tim-list" style="margin-top:10px;max-height:46vh;overflow:auto"></div>
      <div class="row" style="justify-content:flex-end;margin-top:16px">
        <button value="batal" class="btn">Batal</button>
        <button value="ok" class="btn p">Simpan</button>
      </div>
    </form>
  </div>
</dialog>

<!-- ===== DIALOG ASSIGN FASILITATOR KE TIM ===== -->
<dialog id="d-fas" class="mini">
  <div class="dlg-h"><h3>🎓 Fasilitator pengampu</h3></div>
  <div class="dlg-b">
    <p class="mut" id="d-fas-sub"></p>
    <form method="dialog" id="f-fas">
      <div id="d-fas-list" style="margin-top:10px;max-height:46vh;overflow:auto"></div>
      <div class="row" style="justify-content:flex-end;margin-top:16px">
        <button value="batal" class="btn">Batal</button>
        <button value="ok" class="btn p">Simpan</button>
      </div>
    </form>
  </div>
</dialog>

<!-- ===== DIALOG GANTI USERNAME ===== -->
<dialog id="d-un" class="mini">
  <div class="dlg-h"><h3>✏️ Ganti username</h3></div>
  <div class="dlg-b">
    <p class="mut" id="d-un-sub"></p>
    <form method="dialog" id="f-un">
      <label>Username baru
        <span class="in-wrap"><svg class="i"><use href="#i-user"/></svg>
        <input id="d-un-val" autocomplete="off"></span>
      </label>
      <div class="row" style="justify-content:flex-end;margin-top:16px">
        <button value="batal" class="btn">Batal</button>
        <button value="ok" class="btn p">Simpan</button>
      </div>
    </form>
  </div>
</dialog>

<!-- ===== DIALOG RESET PASSWORD ===== -->
<dialog id="d-pw" class="mini">
  <div class="dlg-h"><h3>🔑 Setel ulang password</h3></div>
  <div class="dlg-b">
    <p class="mut" id="d-pw-sub"></p>
    <form method="dialog" id="f-pw">
      <label>Password baru (min. 8 karakter)
        <span class="in-wrap"><svg class="i"><use href="#i-key"/></svg>
        <input id="d-pw-val" autocomplete="off"></span>
      </label>
      <p class="mut" style="margin-top:10px">Sampaikan password ini ke pemilik akun secara pribadi,
      lalu minta dia menggantinya sendiri lewat menu profil.</p>
      <div class="row" style="justify-content:flex-end;margin-top:16px">
        <button value="batal" class="btn">Batal</button>
        <button value="ok" class="btn p">Simpan</button>
      </div>
    </form>
  </div>
</dialog>

<div id="toast"></div>

<script>
"use strict";
var B = location.pathname.replace(/\\/+$/, "");
var TOK = sessionStorage.getItem("mx") || "";
var USERS = [];
var DETAIL = null;
var AKTIVITAS = [];
var TAB = "keg";
var VIEW_ROLE = "tim";  // tab aktif tabel akun: 'tim' | 'fasilitator'
var ES = null;          // EventSource siaran langsung
var muatTimer = null;   // debounce pembaruan live

function $(s){ return document.querySelector(s); }
function esc(s){
  return String(s == null ? "" : s).replace(/[&<>"']/g, function(c){
    return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];
  });
}
function sv(n){ return '<svg class="i"><use href="#i-' + n + '"/></svg>'; }
var BLN = ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"];
function tgl(iso){
  if(!iso) return "—";
  var p = String(iso).slice(0,10).split("-");
  if(p.length < 3) return iso;
  return Number(p[2]) + " " + (BLN[Number(p[1])-1] || p[1]) + " " + p[0];
}
function rp(n){ return "Rp" + Number(n || 0).toLocaleString("id-ID"); }
function dur(m){
  m = Number(m || 0);
  return m >= 60 ? Math.floor(m/60) + " j " + (m%60) + " mnt" : m + " mnt";
}
function dua(n){ return (n < 10 ? "0" : "") + n; }
function tglJam(iso){
  if (!iso) return "—";
  var d = new Date(iso);
  if (isNaN(d)) return iso;
  return d.getDate() + " " + BLN[d.getMonth()] + " " + d.getFullYear() +
    " · " + dua(d.getHours()) + ":" + dua(d.getMinutes()) + ":" + dua(d.getSeconds());
}
function toast(txt, bad){
  var d = document.createElement("div");
  d.className = "tst" + (bad ? " bad" : "");
  d.innerHTML = '<span>' + (bad ? "⚠️" : "✅") + '</span><span>' + esc(txt) + '</span><i class="bar"></i>';
  $("#toast").appendChild(d);
  setTimeout(function(){ d.remove(); }, 4200);
}

/* warna avatar deterministik per username */
function hueDari(s){
  var h = 0; s = String(s || "");
  for (var i = 0; i < s.length; i++) { h = (h * 31 + s.charCodeAt(i)) % 360; }
  return h;
}
function avaStyle(nama){
  var h = hueDari(nama);
  return "background:linear-gradient(135deg,hsl(" + h + ",72%,56%),hsl(" + ((h + 46) % 360) + ",76%,44%))";
}

function call(p, opt){
  opt = opt || {};
  opt.headers = Object.assign(
    { "Content-Type": "application/json", Authorization: "Bearer " + TOK },
    opt.headers || {});
  return fetch(B + p, opt).then(function(r){
    if (r.status === 401 && p !== "/auth") { lihatLogin(); throw new Error("Sesi berakhir — masuk lagi"); }
    return r.json().catch(function(){ return {}; }).then(function(j){
      if (!r.ok) throw new Error(j.error || ("HTTP " + r.status));
      return j;
    });
  });
}
function fotoUrl(k){ return B + "/berkas/" + encodeURIComponent(k) + "?t=" + encodeURIComponent(TOK); }

function lihatLogin(){
  TOK = ""; sessionStorage.removeItem("mx");
  if (ES) { ES.close(); ES = null; }
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  setLive(false);
  $("#v-app").classList.add("hide");
  $("#v-login").classList.remove("hide");
}
function lihatApp(){
  $("#v-login").classList.add("hide");
  $("#v-app").classList.remove("hide");
  muat();
  mulaiLive();
}

/* ---------- siaran langsung (SSE + fallback polling) ---------- */
var pollTimer = null; // polling berkala — dipakai bila SSE tak tersedia (mis. Vercel)
function setLive(on){
  var b = $("#live-badge"), t = $("#live-txt");
  if (!b) return;
  b.classList.toggle("mati", !on);
  t.textContent = on ? "live" : "terputus";
}
function mulaiPolling(){
  if (pollTimer) return;
  setLive(true);
  pollTimer = setInterval(function(){ jadwalMuat(); }, 8000);
}
function mulaiLive(){
  if (ES) { ES.close(); ES = null; }
  if (!TOK) return;
  if (!window.EventSource) { mulaiPolling(); return; }
  ES = new EventSource(B + "/events?t=" + encodeURIComponent(TOK));
  ES.onopen = function(){ setLive(true); };
  ES.onerror = function(){
    setLive(false);
    // readyState 2 = CLOSED: server tidak mendukung SSE (serverless) → polling
    if (ES && ES.readyState === 2) { ES = null; mulaiPolling(); }
  };
  ES.onmessage = function(){ jadwalMuat(); }; // ada perubahan → muat ulang (debounce)
}
function jadwalMuat(){
  clearTimeout(muatTimer);
  muatTimer = setTimeout(function(){
    muat();
    segarkanDetail();
  }, 350);
}
/* Bila dialog detail sedang terbuka, perbarui isinya diam-diam (tanpa audit). */
function segarkanDetail(){
  if (!DETAIL || !$("#d-detail").open) return;
  var id = DETAIL.user.id;
  Promise.all([
    call("/data/pengguna/" + id + "?senyap=1"),
    call("/data/pengguna/" + id + "/aktivitas")
  ]).then(function(rs){
    if (!$("#d-detail").open || !DETAIL || DETAIL.user.id !== id) return;
    DETAIL = rs[0]; AKTIVITAS = rs[1].rows || [];
    isiKepalaDetail();
    renderTab();
  }).catch(function(){});
}

/* ---------- muat data ---------- */
function muat(){
  var rb = $("#btn-muat"); if (rb) rb.classList.add("memuat");
  Promise.all([
    call("/data/ringkas"), call("/data/pengguna"), call("/data/audit"),
    call("/data/kode-fasilitator").catch(function(){ return { ada:false, updatedAt:"" }; })
  ])
    .then(function(rs){
      var ov = rs[0]; USERS = rs[1].users;
      $("#statistik").innerHTML =
        stat("users","Akun tim",(ov.users - (ov.fasilitator||0)),"s1") + stat("cal","Total kegiatan",ov.kegiatan,"s2") +
        stat("coins","Total belanja",ov.keuangan,"s3") + stat("zap","Sesi aktif",ov.sesi,"s4") +
        stat("user","Fasilitator",(ov.fasilitator||0),"s5");
      document.querySelectorAll("#statistik b[data-n]").forEach(function(b){
        hitungNaik(b, Number(b.dataset.n));
      });
      $("#jml-user").textContent = ov.users + " akun";
      renderUsers();
      var ks = $("#kode-status");
      if (ks) ks.textContent = rs[3].ada
        ? "diset" + (rs[3].updatedAt ? " · " + tgl(rs[3].updatedAt) : "")
        : "belum diset";
      $("#audit").innerHTML = rs[2].rows.map(function(r){
        var aksi = r.aksi || r.raw || "";
        return '<div class="row-a"><span class="t">' + esc(tglJam(r.ts)) + '</span>' +
          '<span class="badge ' + auditCls(aksi) + '">' + esc(aksi) + '</span>' +
          '<span class="tg">' + esc(namaTarget(r)) + '</span></div>';
      }).join("") || '<div class="mut">Belum ada catatan.</div>';
    })
    .catch(function(e){ toast(e.message, true); })
    .finally(function(){ if (rb) rb.classList.remove("memuat"); });
}
function stat(ic, lbl, v, cls){
  return '<div class="stat ' + cls + '"><div class="ic">' + sv(ic) + '</div><div>' +
    '<span class="lbl">' + lbl + '</span><b data-n="' + Number(v || 0) + '">0</b></div></div>';
}
function hitungNaik(el, akhir){
  var awal = performance.now(), durasi = 650;
  function tik(t){
    var k = Math.min(1, (t - awal) / durasi);
    el.textContent = Math.round(akhir * (1 - Math.pow(1 - k, 3)));
    if (k < 1) requestAnimationFrame(tik);
  }
  requestAnimationFrame(tik);
}
function auditCls(a){
  a = String(a).toLowerCase();
  if (/hapus|cabut|gagal|tolak/.test(a)) return "r";
  if (/berhasil|login|masuk/.test(a)) return "g";
  if (/ganti|reset|password|username|kredensial|akun/.test(a)) return "y";
  if (/lihat|ekspor|unduh/.test(a)) return "c";
  return "b";
}
/* Tampilkan username bila target berupa id akun. */
function namaTarget(r){
  var t = r.username || r.target || "";
  if (!t) return "";
  var u = USERS.find(function(x){ return x.id === t; });
  return u ? u.username : t;
}

function renderUsers(){
  var q = ($("#cari").value || "").toLowerCase();
  var rows = USERS.filter(function(u){
    var role = u.role || "tim";
    if (VIEW_ROLE === "fasilitator" ? role !== "fasilitator" : role === "fasilitator") return false;
    return u.username.toLowerCase().indexOf(q) >= 0;
  });
  var head = $("#t-users-head");
  if (head) {
    head.innerHTML = VIEW_ROLE === "fasilitator"
      ? "<th>Akun</th><th>Tim diampu</th><th>Sesi</th><th>Dibuat</th><th style='text-align:right'>Aksi</th>"
      : '<th>Akun</th><th class="num">Kegiatan</th><th class="num">Belanja</th>' +
        '<th class="num">Foto</th><th>Sesi</th><th>Aktivitas</th><th style="text-align:right">Aksi</th>';
  }
  var kolom = VIEW_ROLE === "fasilitator" ? 5 : 7;
  $("#t-users").innerHTML = rows.map(VIEW_ROLE === "fasilitator" ? barisFasilitator : barisUser).join("") ||
    '<tr><td colspan="' + kolom + '"><div class="kosong"><div class="big">' +
    (VIEW_ROLE === "fasilitator" ? "🎓" : "🔍") + '</div>' +
    (VIEW_ROLE === "fasilitator" && !q
      ? "Belum ada akun fasilitator.<div class='mut' style='margin-top:6px'>Set kode pendaftaran di kartu bawah, lalu bagikan ke fasilitator.</div>"
      : "Tidak ada akun yang cocok.") + "</div></td></tr>";
}
function barisUser(u){
  var ini = (u.username || "?").charAt(0).toUpperCase();
  return "<tr>" +
    '<td><div class="u-cell"><span class="ava" style="' + avaStyle(u.username) + '">' + esc(ini) + '</span><div>' +
      "<b>" + esc(u.username) + "</b>" +
      (u.pemilikTemplate ? ' <span class="badge b">arsip</span>' : "") +
      (u.punya_laporan ? ' <span class="badge c">📄 laporan</span>' : "") +
      (u.n_fasilitator ? ' <span class="badge y">🎓 ' + u.n_fasilitator + '</span>' : "") +
      '<div class="mut">dibuat ' + tgl(u.createdAt) + "</div>" +
    "</div></div></td>" +
    '<td class="num">' + u.kegiatan + "</td>" +
    '<td class="num">' + u.keuangan + "</td>" +
    '<td class="num">' + u.foto + "</td>" +
    "<td>" + (u.sesi ? '<span class="badge g">' + u.sesi + " aktif</span>" : '<span class="mut">—</span>') + "</td>" +
    "<td style='white-space:nowrap'>" + tgl(u.aktivitasTerakhir) + "</td>" +
    '<td class="acts-cell"><div class="acts">' +
      '<button class="btn sm p" data-act="detail" data-id="' + u.id + '">' + sv("folder") + ' Data</button>' +
      '<button class="btn sm ic" title="Fasilitator pengampu tim ini" data-act="fas" data-id="' + u.id + '">🎓</button>' +
      '<button class="btn sm ic" title="Jejak aktivitas akun" data-act="akt-cepat" data-id="' + u.id + '">' + sv("scroll") + '</button>' +
      '<button class="btn sm ic" title="Ganti username" data-act="un" data-id="' + u.id + '">' + sv("edit") + '</button>' +
      '<button class="btn sm ic" title="Setel ulang password" data-act="pw" data-id="' + u.id + '">' + sv("key") + '</button>' +
      '<button class="btn sm ic" title="Keluarkan dari semua perangkat" data-act="sesi" data-id="' + u.id + '">' + sv("power") + '</button>' +
      '<button class="btn sm ic d" title="Hapus akun" data-act="hapus" data-id="' + u.id + '">' + sv("trash") + '</button>' +
    "</div></td></tr>";
}
function barisFasilitator(u){
  var ini = (u.username || "?").charAt(0).toUpperCase();
  return "<tr>" +
    '<td><div class="u-cell"><span class="ava" style="' + avaStyle(u.username) + '">' + esc(ini) + '</span><div>' +
      "<b>" + esc(u.username) + "</b> <span class='badge y'>🎓 fasilitator</span>" +
      '<div class="mut">dibuat ' + tgl(u.createdAt) + "</div>" +
    "</div></div></td>" +
    "<td>" + (u.n_tim_diampu
      ? '<span class="badge b">' + u.n_tim_diampu + " tim</span>"
      : '<span class="mut">belum di-assign</span>') + "</td>" +
    "<td>" + (u.sesi ? '<span class="badge g">' + u.sesi + " aktif</span>" : '<span class="mut">—</span>') + "</td>" +
    "<td style='white-space:nowrap'>" + tgl(u.createdAt) + "</td>" +
    '<td class="acts-cell"><div class="acts">' +
      '<button class="btn sm p" data-act="tim" data-id="' + u.id + '">🔗 Tim</button>' +
      '<button class="btn sm ic" title="Jejak aktivitas akun" data-act="akt-cepat" data-id="' + u.id + '">' + sv("scroll") + '</button>' +
      '<button class="btn sm ic" title="Ganti username" data-act="un" data-id="' + u.id + '">' + sv("edit") + '</button>' +
      '<button class="btn sm ic" title="Setel ulang password" data-act="pw" data-id="' + u.id + '">' + sv("key") + '</button>' +
      '<button class="btn sm ic" title="Keluarkan dari semua perangkat" data-act="sesi" data-id="' + u.id + '">' + sv("power") + '</button>' +
      '<button class="btn sm ic d" title="Hapus akun" data-act="hapus" data-id="' + u.id + '">' + sv("trash") + '</button>' +
    "</div></td></tr>";
}
function findU(id){ return USERS.find(function(x){ return x.id === id; }); }

/* ---------- detail data pengguna ---------- */
function bukaDetail(id, tabAwal){
  Promise.all([
    call("/data/pengguna/" + id),
    call("/data/pengguna/" + id + "/aktivitas").catch(function(){ return { rows: [] }; })
  ]).then(function(rs){
    DETAIL = rs[0]; AKTIVITAS = rs[1].rows || []; TAB = tabAwal || "keg";
    isiKepalaDetail();
    var tb = document.querySelectorAll("#d-detail .tabs button");
    tb.forEach(function(b){ b.classList.toggle("on", b.dataset.tab === TAB); });
    renderTab();
    $("#d-detail").showModal();
  }).catch(function(e){ toast(e.message, true); });
}
function isiKepalaDetail(){
  var j = DETAIL;
  var ava = $("#dt-ava");
  ava.textContent = (j.user.username || "?").charAt(0).toUpperCase();
  ava.style.cssText = avaStyle(j.user.username);
  $("#dt-nama").textContent = j.user.username;
  $("#dt-sub").textContent = "dibuat " + tgl(j.user.createdAt) + " · " +
    j.kegiatan.length + " kegiatan · " + j.keuangan.length + " belanja · " +
    AKTIVITAS.length + " aktivitas";
  var r = j.ringkasan;
  $("#dt-chips").innerHTML =
    chip("ungu","Capaian", r.capaian_total + "%") +
    chip("biru","Total waktu", dur(r.total_menit)) +
    chip("","Dana awal", rp(r.dana_awal)) +
    chip("merah","Pengeluaran", rp(r.pengeluaran)) +
    chip("hijau","Sisa dana", rp(r.sisa));
}
function chip(cls, lbl, v){
  return '<div class="chip ' + cls + '"><small>' + lbl + "</small><b>" + v + "</b></div>";
}
function renderTab(){
  if (!DETAIL) return;
  $("#dt-isi").innerHTML =
    TAB === "keg" ? tabelKegiatan(DETAIL.kegiatan) :
    TAB === "keu" ? tabelKeuangan(DETAIL.keuangan) :
    TAB === "lap" ? tabelLaporan(DETAIL) :
    tabelAktivitas(AKTIVITAS);
}
function ukur(b){
  b = Number(b || 0);
  if (b >= 1048576) return (b / 1048576).toFixed(1) + " MB";
  if (b >= 1024) return Math.round(b / 1024) + " KB";
  return b + " B";
}
function tabelLaporan(d){
  var l = d.laporan || { ada: false };
  if (!l.ada) return '<div class="kosong"><div class="big">📄</div>Tim ini belum mengunggah laporan kemajuan.</div>';
  var url = B + "/data/pengguna/" + d.user.id + "/laporan-file?t=" + encodeURIComponent(TOK);
  return '<div class="card" style="margin-top:14px">' +
    '<div class="row spread">' +
      '<div><b style="font-size:.95rem">📄 ' + esc(l.nama) + '</b>' +
      '<div class="mut" style="margin-top:4px">' + ukur(l.ukuran) +
      ' · diunggah ' + esc(tglJam(l.updated_at)) + '</div></div>' +
      '<div class="row" style="gap:8px">' +
        '<a class="btn sm p" href="' + url + '" target="_blank" rel="noopener">' + sv("folder") + ' Buka</a>' +
        '<a class="btn sm" href="' + url + '&unduh=1">' + sv("save") + ' Unduh</a>' +
      '</div>' +
    '</div></div>';
}

/* peta aksi → [ikon, warna, label] */
var AKSI_INFO = {
  "akun.daftar":          ["user","g","Mendaftar akun"],
  "akun.masuk":           ["unlock","g","Login ke aplikasi"],
  "akun.keluar":          ["logout","b","Logout dari aplikasi"],
  "akun.ganti_username":  ["edit","y","Mengganti username"],
  "akun.ganti_password":  ["key","y","Mengganti password"],
  "kegiatan.tambah":      ["cal","g","Menambah kegiatan"],
  "kegiatan.ubah":        ["edit","y","Mengubah kegiatan"],
  "kegiatan.hapus":       ["trash","r","Menghapus kegiatan"],
  "keuangan.tambah":      ["coins","g","Menambah belanja"],
  "keuangan.ubah":        ["edit","y","Mengubah belanja"],
  "keuangan.hapus":       ["trash","r","Menghapus belanja"],
  "laporan.unggah":       ["save","g","Mengunggah laporan kemajuan"],
  "laporan.hapus":        ["trash","r","Menghapus laporan kemajuan"],
  "komentar.tambah":      ["scroll","c","Komentar baru"],
  "komentar.ubah":        ["edit","y","Komentar diedit"],
  "komentar.hapus":       ["trash","r","Komentar dihapus"],
  "komentar.selesai":     ["save","g","Komentar ditandai selesai"],
  "user.lihat":           ["search","c","Data dilihat lewat panel"],
  "user.username":        ["edit","y","Username diganti lewat panel"],
  "user.password.reset":  ["key","r","Password direset lewat panel"],
  "user.sesi.cabut":      ["power","r","Sesi dicabut lewat panel"],
  "user.hapus":           ["trash","r","Akun dihapus lewat panel"],
  "user.laporan.lihat":   ["folder","c","Laporan dilihat lewat panel"],
  "fasilitator.kode.ubah":["key","y","Kode fasilitator diganti"],
  "fasilitator.tim.ubah": ["users","y","Assignment tim fasilitator diubah"],
  "tim.fasilitator.ubah": ["users","y","Fasilitator pengampu tim diubah"]
};
function tabelAktivitas(list){
  if (!list.length) return '<div class="kosong"><div class="big">📜</div>Belum ada aktivitas tercatat.<div class="mut" style="margin-top:6px">Aktivitas mulai terekam sejak fitur ini aktif — login, tambah/ubah/hapus data, dan aksi panel.</div></div>';
  var out = '<div class="tline">';
  list.forEach(function(r){
    var info = AKSI_INFO[r.aksi] || ["zap","b", r.aksi || "aktivitas"];
    var meta = [];
    if (r.tanggal) meta.push("data tgl " + tgl(r.tanggal));
    if (r.ringkas) meta.push("\u201C" + r.ringkas + "\u201D");
    if (r.total != null) meta.push(rp(r.total));
    if (r.foto) meta.push(r.foto + " foto");
    if (r.dari && r.jadi) meta.push(r.dari + " → " + r.jadi);
    if (r.jumlah != null && r.aksi === "user.sesi.cabut") meta.push(r.jumlah + " sesi");
    if (r.sesiLainDicabut != null) meta.push(r.sesiLainDicabut + " sesi lain keluar");
    if (r.oleh) meta.push("oleh " + r.oleh);
    if (r.jenis && String(r.aksi || "").indexOf("komentar.") === 0) meta.push("di " + r.jenis);
    if (r.balasan) meta.push("balasan");
    if (r.nama && String(r.aksi || "").indexOf("laporan.") === 0) meta.push(r.nama);
    out += '<div class="tl-item">' +
      '<div class="tl-dot ' + info[1] + '">' + sv(info[0]) + '</div>' +
      '<div class="tl-body"><b>' + esc(info[2]) + '</b>' +
      '<div class="tl-meta"><span>' + esc(tglJam(r.ts)) + '</span>' +
      (meta.length ? '<span>' + esc(meta.join(" · ")) + '</span>' : '') +
      '<span class="tl-src' + (r.sumber === "panel" ? " panel" : "") + '">' +
      (r.sumber === "panel" ? "panel" : "pengguna") + '</span>' +
      '</div></div></div>';
  });
  return out + "</div>";
}
function tabelKegiatan(list){
  if (!list.length) return '<div class="kosong"><div class="big">🗓️</div>Belum ada kegiatan.</div>';
  var out = '<div class="tbl"><table><thead><tr>' +
    '<th style="width:34px">#</th><th>Tanggal</th><th>Kegiatan</th>' +
    '<th>Capaian</th><th class="num">Waktu</th><th>Foto</th></tr></thead><tbody>';
  list.forEach(function(e, i){
    var fotos = (e.foto_keys || []).map(function(k){
      return '<img class="th" loading="lazy" src="' + fotoUrl(k) + '" data-act="foto" data-key="' + esc(k) + '" alt="">';
    }).join("");
    out += "<tr>" +
      '<td class="mut">' + (i + 1) + "</td>" +
      "<td style='white-space:nowrap'>" + tgl(e.tanggal) + "</td>" +
      "<td>" + esc(e.kegiatan) + "</td>" +
      "<td><div class='row' style='gap:7px;flex-wrap:nowrap'><div class='prog'><i style='width:" +
        Math.min(100, e.capaian_total) + "%'></i></div>" +
        "<span class='mut' style='white-space:nowrap'>+" + e.capaian_delta + "% → <b style='color:#c4b5fd'>" +
        e.capaian_total + "%</b></span></div></td>" +
      '<td class="num" style="white-space:nowrap">' + dur(e.waktu_menit) + "</td>" +
      "<td>" + (fotos ? '<div class="ths">' + fotos + "</div>" : '<span class="mut">—</span>') + "</td>" +
    "</tr>";
  });
  return out + "</tbody></table></div>";
}
function tabelKeuangan(list){
  if (!list.length) return '<div class="kosong"><div class="big">💰</div>Belum ada belanja.</div>';
  var total = 0;
  var out = '<div class="tbl"><table><thead><tr>' +
    '<th style="width:34px">#</th><th>Tanggal</th><th>Item</th>' +
    '<th class="num">Harga satuan</th><th class="num">Jml</th><th class="num">Total</th><th>Bukti</th></tr></thead><tbody>';
  list.forEach(function(e, i){
    total += e.total;
    out += "<tr>" +
      '<td class="mut">' + (i + 1) + "</td>" +
      "<td style='white-space:nowrap'>" + tgl(e.tanggal) + "</td>" +
      "<td>" + esc(e.item) + "</td>" +
      '<td class="num" style="white-space:nowrap">' + rp(e.harga_satuan) + esc(e.satuan_suffix || "") + "</td>" +
      '<td class="num">' + e.jumlah + "</td>" +
      '<td class="num" style="white-space:nowrap"><b>' + rp(e.total) + "</b></td>" +
      "<td>" + (e.bukti_key
        ? '<img class="th" loading="lazy" src="' + fotoUrl(e.bukti_key) + '" data-act="foto" data-key="' + esc(e.bukti_key) + '" alt="">'
        : '<span class="mut">—</span>') + "</td>" +
    "</tr>";
  });
  out += '<tr><td colspan="5" style="text-align:right;font-weight:800">TOTAL</td>' +
    '<td class="num" style="white-space:nowrap"><b style="color:#fda4af">' + rp(total) + "</b></td><td></td></tr>";
  return out + "</tbody></table></div>";
}

/* ---------- aksi akun ---------- */
function gantiUsername(id){
  var u = findU(id); if (!u) return;
  $("#d-un-sub").textContent = "Akun: " + u.username;
  $("#d-un-val").value = u.username;
  var dlg = $("#d-un");
  dlg.showModal();
  dlg.addEventListener("close", function h(){
    dlg.removeEventListener("close", h);
    if (dlg.returnValue !== "ok") return;
    call("/data/pengguna/" + id + "/username", {
      method: "PUT", body: JSON.stringify({ username: $("#d-un-val").value })
    }).then(function(){ toast("Username diganti"); muat(); })
      .catch(function(e){ toast(e.message, true); });
  });
}
function resetPassword(id){
  var u = findU(id); if (!u) return;
  $("#d-pw-sub").textContent = "Akun: " + u.username +
    " — password lama tidak bisa dilihat (hash satu arah), hanya bisa diganti.";
  $("#d-pw-val").value = "";
  var dlg = $("#d-pw");
  dlg.showModal();
  dlg.addEventListener("close", function h(){
    dlg.removeEventListener("close", h);
    if (dlg.returnValue !== "ok") return;
    call("/data/pengguna/" + id + "/password", {
      method: "PUT", body: JSON.stringify({ password: $("#d-pw-val").value })
    }).then(function(){ toast("Password " + u.username + " disetel ulang — semua sesinya keluar"); muat(); })
      .catch(function(e){ toast(e.message, true); });
  });
}
function cabutSesi(id){
  var u = findU(id); if (!u) return;
  if (!confirm("Keluarkan " + u.username + " dari semua perangkat?")) return;
  call("/data/pengguna/" + id + "/keluarkan", { method: "POST" })
    .then(function(j){ toast(j.dicabut + " sesi dicabut"); muat(); })
    .catch(function(e){ toast(e.message, true); });
}
function hapusUser(id){
  var u = findU(id); if (!u) return;
  if (!confirm("HAPUS PERMANEN akun " + u.username + " beserta " + u.kegiatan +
    " kegiatan, " + u.keuangan + " belanja, dan semua fotonya?")) return;
  var ket = prompt("Ketik username persis (" + u.username + ") untuk konfirmasi:");
  if (ket !== u.username) { toast("Konfirmasi tidak cocok — dibatalkan", true); return; }
  call("/data/pengguna/" + id, { method: "DELETE" })
    .then(function(){ toast("Akun " + u.username + " dihapus"); muat(); })
    .catch(function(e){ toast(e.message, true); });
}
function assignTim(id){
  var u = findU(id); if (!u) return;
  call("/data/fasilitator/" + id + "/tim").then(function(j){
    var terpilih = {};
    (j.tim || []).forEach(function(t){ terpilih[t.id] = true; });
    var timSemua = USERS.filter(function(x){ return (x.role || "tim") !== "fasilitator"; });
    $("#d-tim-sub").textContent = "Fasilitator: " + u.username +
      " — centang tim yang diampu (boleh lebih dari satu).";
    $("#d-tim-list").innerHTML = timSemua.length ? timSemua.map(function(t){
      return '<label class="row" style="margin-top:8px;gap:9px;cursor:pointer;font-size:.84rem;color:var(--ink)">' +
        '<input type="checkbox" style="width:auto;margin:0" value="' + t.id + '"' +
        (terpilih[t.id] ? " checked" : "") + '> ' +
        '<span class="ava" style="width:26px;height:26px;flex:0 0 26px;font-size:.7rem;' + avaStyle(t.username) + '">' +
        esc((t.username || "?").charAt(0).toUpperCase()) + '</span> ' + esc(t.username) + '</label>';
    }).join("") : '<div class="mut">Belum ada akun tim.</div>';
    var dlg = $("#d-tim");
    dlg.showModal();
    dlg.addEventListener("close", function h(){
      dlg.removeEventListener("close", h);
      if (dlg.returnValue !== "ok") return;
      var ids = Array.prototype.map.call(
        document.querySelectorAll("#d-tim-list input:checked"),
        function(c){ return c.value; });
      call("/data/fasilitator/" + id + "/tim", {
        method: "PUT", body: JSON.stringify({ tim_ids: ids })
      }).then(function(r){
        toast("Assignment disimpan (" + r.total + " tim)"); muat();
      }).catch(function(e){ toast(e.message, true); });
    });
  }).catch(function(e){ toast(e.message, true); });
}

/* Kebalikan assignTim: dari baris TIM, pilih fasilitator yang mengampunya. */
function assignFasilitator(id){
  var u = findU(id); if (!u) return;
  call("/data/tim/" + id + "/fasilitator").then(function(j){
    var terpilih = {};
    (j.fasilitator || []).forEach(function(f){ terpilih[f.id] = true; });
    var fasSemua = USERS.filter(function(x){ return (x.role || "tim") === "fasilitator"; });
    $("#d-fas-sub").textContent = "Tim: " + u.username +
      " — centang fasilitator yang mengampu (boleh lebih dari satu).";
    $("#d-fas-list").innerHTML = fasSemua.length ? fasSemua.map(function(f){
      return '<label class="row" style="margin-top:8px;gap:9px;cursor:pointer;font-size:.84rem;color:var(--ink)">' +
        '<input type="checkbox" style="width:auto;margin:0" value="' + f.id + '"' +
        (terpilih[f.id] ? " checked" : "") + '> ' +
        '<span class="ava" style="width:26px;height:26px;flex:0 0 26px;font-size:.7rem;' + avaStyle(f.username) + '">' +
        esc((f.username || "?").charAt(0).toUpperCase()) + '</span> ' + esc(f.username) + '</label>';
    }).join("") : '<div class="mut">Belum ada akun fasilitator. Set kode pendaftaran fasilitator lalu bagikan.</div>';
    var dlg = $("#d-fas");
    dlg.showModal();
    dlg.addEventListener("close", function h(){
      dlg.removeEventListener("close", h);
      if (dlg.returnValue !== "ok") return;
      var ids = Array.prototype.map.call(
        document.querySelectorAll("#d-fas-list input:checked"),
        function(c){ return c.value; });
      call("/data/tim/" + id + "/fasilitator", {
        method: "PUT", body: JSON.stringify({ fasilitator_ids: ids })
      }).then(function(r){
        toast("Fasilitator tim disimpan (" + r.total + ")"); muat();
      }).catch(function(e){ toast(e.message, true); });
    });
  }).catch(function(e){ toast(e.message, true); });
}

/* ---------- event delegation ---------- */
document.addEventListener("click", function(ev){
  var el = ev.target.closest("[data-act],[data-tab],[data-role-tab]");
  if (!el) return;
  if (el.dataset.roleTab) {
    VIEW_ROLE = el.dataset.roleTab;
    document.querySelectorAll("[data-role-tab]").forEach(function(b){
      b.classList.toggle("on", b === el);
    });
    renderUsers();
    return;
  }
  if (el.dataset.tab) {
    TAB = el.dataset.tab;
    document.querySelectorAll("#d-detail .tabs button").forEach(function(b){
      b.classList.toggle("on", b === el);
    });
    renderTab();
    return;
  }
  switch (el.dataset.act) {
    case "muat": muat(); break;
    case "keluar":
      call("/keluar", { method: "POST" }).catch(function(){});
      lihatLogin(); break;
    case "detail": bukaDetail(el.dataset.id); break;
    case "akt-cepat": bukaDetail(el.dataset.id, "akt"); break;
    case "un": gantiUsername(el.dataset.id); break;
    case "pw": resetPassword(el.dataset.id); break;
    case "sesi": cabutSesi(el.dataset.id); break;
    case "hapus": hapusUser(el.dataset.id); break;
    case "tim": assignTim(el.dataset.id); break;
    case "fas": assignFasilitator(el.dataset.id); break;
    case "tutup-detail": $("#d-detail").close(); break;
    case "foto": window.open(fotoUrl(el.dataset.key), "_blank"); break;
  }
});

$("#cari").addEventListener("input", renderUsers);

$("#f-login").addEventListener("submit", function(e){
  e.preventDefault();
  var err = $("#l-err"); err.classList.add("hide");
  var btn = e.target.querySelector("button"); btn.disabled = true;
  call("/auth", { method: "POST", body: JSON.stringify({ u: $("#l-u").value, p: $("#l-p").value }) })
    .then(function(j){
      TOK = j.token; sessionStorage.setItem("mx", TOK);
      $("#l-p").value = "";
      lihatApp();
    })
    .catch(function(ex){ err.textContent = ex.message; err.classList.remove("hide"); })
    .finally(function(){ btn.disabled = false; });
});

$("#f-self").addEventListener("submit", function(e){
  e.preventDefault();
  call("/akun", { method: "PUT", body: JSON.stringify({
    username: $("#s-u").value, password: $("#s-p").value, password_lama: $("#s-cur").value
  }) }).then(function(j){
    toast("Kredensial tersimpan. " + (j.catatan || ""));
    $("#s-u").value = $("#s-p").value = $("#s-cur").value = "";
  }).catch(function(ex){ toast(ex.message, true); });
});

$("#f-kode").addEventListener("submit", function(e){
  e.preventDefault();
  var v = $("#k-val").value;
  if (v.length < 6) { toast("Kode minimal 6 karakter", true); return; }
  call("/data/kode-fasilitator", { method: "PUT", body: JSON.stringify({ kode: v }) })
    .then(function(){
      toast("Kode fasilitator tersimpan");
      $("#k-val").value = "";
      muat();
    }).catch(function(ex){ toast(ex.message, true); });
});

// sudah punya sesi? langsung buka panel
if (TOK) call("/data/ringkas").then(lihatApp).catch(lihatLogin);
</script>
</body>
</html>`;

