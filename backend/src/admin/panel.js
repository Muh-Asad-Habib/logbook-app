/**
 * Panel admin — satu halaman HTML mandiri (CSS & JS inline).
 * Disajikan LANGSUNG oleh backend di path rahasia; sama sekali bukan bagian
 * dari build Next.js, jadi tidak ada jejaknya di bundel frontend (F12 aman).
 *
 * Desain v2 — "Mission Control": tema gelap, sidebar bernavigasi penuh,
 * jam live, kartu statistik ber-glow, tabel & dialog kaca. Seluruh ID elemen,
 * atribut data-act/data-tab, dan alur API tetap sama dengan versi sebelumnya.
 */
export const PANEL_HTML = /* html */ `<!doctype html>
<html lang="id">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex,nofollow,noarchive">
<title>Pusat Kendali</title>
<style>
  :root{
    --bg:#070a14;--bg2:#0b0f1e;
    --panel:#0e1329;--panel2:#111737;
    --line:#1b2242;--line2:#293159;
    --ink:#e8ebfa;--mut:#98a0c9;
    --p:#6d7cff;--p2:#a78bfa;--cy:#22d3ee;
    --ok:#34d399;--warn:#fbbf24;--bad:#fb7185;
    --r:18px;
    --grad:linear-gradient(135deg,#6d7cff,#a78bfa);
    --grad3:linear-gradient(120deg,#6d7cff 0%,#a78bfa 50%,#22d3ee 100%);
    --mono:Consolas,"Cascadia Mono","SF Mono",monospace;
  }
  *{box-sizing:border-box;margin:0;padding:0}
  html{scroll-behavior:smooth}
  body{
    font-family:"Segoe UI",system-ui,-apple-system,sans-serif;color:var(--ink);min-height:100vh;
    background:
      radial-gradient(1100px 540px at 85% -10%,rgba(109,124,255,.13),transparent 60%),
      radial-gradient(900px 480px at -12% 12%,rgba(167,139,250,.10),transparent 55%),
      radial-gradient(820px 460px at 55% 115%,rgba(34,211,238,.08),transparent 60%),
      var(--bg);
  }
  body::before{
    content:"";position:fixed;inset:0;z-index:-1;pointer-events:none;
    background-image:
      linear-gradient(rgba(109,124,255,.045) 1px,transparent 1px),
      linear-gradient(90deg,rgba(109,124,255,.045) 1px,transparent 1px);
    background-size:44px 44px;
    mask-image:radial-gradient(85% 65% at 50% 0%,#000 0%,transparent 100%);
  }
  ::selection{background:rgba(109,124,255,.35)}
  ::-webkit-scrollbar{width:9px;height:9px}
  ::-webkit-scrollbar-thumb{background:#262e56;border-radius:9px}
  ::-webkit-scrollbar-thumb:hover{background:#37417a}
  ::-webkit-scrollbar-track{background:transparent}

  @keyframes up{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}
  @keyframes pop{from{opacity:0;transform:translateY(16px) scale(.97)}to{opacity:1;transform:none}}
  @keyframes floaty{0%,100%{transform:translateY(0)}50%{transform:translateY(-4px)}}
  @keyframes spin{to{transform:rotate(360deg)}}
  @keyframes drift{from{transform:translate(0,0) scale(1)}to{transform:translate(46px,-34px) scale(1.1)}}
  @keyframes pulseGlow{0%,100%{opacity:.20}50%{opacity:.42}}
  @keyframes barShrink{from{width:100%}to{width:0}}
  @keyframes blink{0%{box-shadow:0 0 0 0 rgba(52,211,153,.55)}70%{box-shadow:0 0 0 8px rgba(52,211,153,0)}100%{box-shadow:0 0 0 0 rgba(52,211,153,0)}}

  /* ---------- orbs latar ---------- */
  .orbs{position:fixed;inset:0;z-index:-2;overflow:hidden;pointer-events:none}
  .orb{position:absolute;display:block;border-radius:50%;filter:blur(95px);opacity:.5;animation:drift 22s ease-in-out infinite alternate}
  .orb.a{width:560px;height:560px;background:rgba(109,124,255,.16);top:-200px;right:-140px}
  .orb.b{width:460px;height:460px;background:rgba(167,139,250,.13);bottom:-180px;left:-160px;animation-delay:-7s}
  .orb.c{width:400px;height:400px;background:rgba(34,211,238,.10);top:40%;left:60%;animation-delay:-13s}

  /* ---------- ikon svg ---------- */
  .i{width:15px;height:15px;stroke:currentColor;stroke-width:2;fill:none;
     stroke-linecap:round;stroke-linejoin:round;flex:0 0 auto}

  /* ---------- sidebar ---------- */
  .side{
    position:fixed;left:0;top:0;bottom:0;width:236px;z-index:60;
    display:flex;flex-direction:column;gap:18px;padding:20px 14px 16px;
    background:rgba(9,12,24,.88);backdrop-filter:blur(18px) saturate(1.3);
    border-right:1px solid var(--line);animation:up .4s ease both;
    transition:width .25s ease,padding .25s ease;
  }
  .side::after{content:"";position:absolute;top:0;bottom:0;right:-1px;width:1px;
    background:linear-gradient(180deg,transparent,rgba(109,124,255,.45),rgba(34,211,238,.25),transparent)}
  .side-top{display:flex;gap:11px;align-items:center;padding:2px 6px}
  .side-logo{width:42px;height:42px;border-radius:13px;flex:0 0 42px;display:flex;align-items:center;
    justify-content:center;color:#fff;background:var(--grad);
    box-shadow:0 10px 26px rgba(109,124,255,.40),inset 0 0 0 1px rgba(255,255,255,.18);
    animation:floaty 5s ease-in-out infinite}
  .side-logo .i{width:19px;height:19px}
  .side-brand{min-width:0}
  .side-brand b{display:block;font-size:.94rem;letter-spacing:-.01em;white-space:nowrap}
  .side-brand span{font:600 .66rem var(--mono);color:var(--mut);letter-spacing:.1em;text-transform:uppercase}
  .side-nav{display:flex;flex-direction:column;gap:4px;margin-top:2px}
  .side-nav a{
    position:relative;display:flex;align-items:center;gap:11px;padding:10px 12px;
    border-radius:11px;color:var(--mut);font-size:.84rem;font-weight:600;
    text-decoration:none;transition:.16s;
  }
  .side-nav a .i{width:16px;height:16px}
  .side-nav a:hover{color:var(--ink);background:rgba(109,124,255,.08);transform:translateX(2px)}
  .side-nav a.on{
    color:#fff;background:linear-gradient(120deg,rgba(109,124,255,.24),rgba(167,139,250,.12));
    box-shadow:inset 0 0 0 1px rgba(109,124,255,.38),0 8px 22px -10px rgba(109,124,255,.45);
  }
  .side-nav a.on::before{content:"";position:absolute;left:-14px;top:22%;bottom:22%;width:3px;
    border-radius:3px;background:var(--grad3)}
  .side-foot{margin-top:auto;display:flex;flex-direction:column;gap:10px}
  .side-note{font:600 .66rem var(--mono);color:#5d668f;letter-spacing:.08em;
    text-transform:uppercase;text-align:center}
  .side-out{
    width:100%;display:flex;align-items:center;justify-content:center;gap:9px;padding:10px 12px;
    border-radius:11px;border:1px solid rgba(251,113,133,.30);background:rgba(251,113,133,.08);
    color:#fda4af;font:inherit;font-size:.82rem;font-weight:700;cursor:pointer;transition:.16s;
  }
  .side-out .i{width:15px;height:15px}
  .side-out:hover{background:rgba(251,113,133,.16);transform:translateY(-1px);
    box-shadow:0 10px 24px -12px rgba(251,113,133,.5)}

  /* ---------- toggle kecilkan sidebar ---------- */
  .side-toggle{
    position:absolute;top:26px;right:-13px;width:26px;height:26px;border-radius:50%;
    border:1px solid var(--line2);background:#131a3a;color:var(--mut);cursor:pointer;
    display:flex;align-items:center;justify-content:center;z-index:3;transition:.16s;
    box-shadow:0 6px 16px rgba(0,0,0,.45);
  }
  .side-toggle .i{width:13px;height:13px;transition:transform .25s ease}
  .side-toggle:hover{color:#fff;border-color:var(--p);background:rgba(109,124,255,.22);
    box-shadow:0 8px 20px -6px rgba(109,124,255,.5)}
  #v-app.mini .side-toggle .i{transform:rotate(180deg)}

  /* ---------- mode mini: sidebar ikon-saja (hanya desktop) ---------- */
  @media(min-width:1081px){
    #v-app.mini .side{width:78px;padding:20px 10px 16px}
    #v-app.mini .main{margin-left:78px}
    #v-app.mini .side-top{justify-content:center;padding:2px 0}
    #v-app.mini .side-brand{display:none}
    #v-app.mini .side-nav a{justify-content:center;padding:11px 0;gap:0}
    #v-app.mini .side-nav a span{display:none}
    #v-app.mini .side-nav a:hover{transform:none}
    #v-app.mini .side-nav a.on::before{left:-10px}
    #v-app.mini .side-note{display:none}
    #v-app.mini .side-out{padding:11px 0;gap:0}
    #v-app.mini .side-out span{display:none}
    /* tooltip label saat mini */
    #v-app.mini .side [data-tip]{position:relative}
    #v-app.mini .side [data-tip]:hover::after{
      content:attr(data-tip);position:absolute;left:calc(100% + 14px);top:50%;
      transform:translateY(-50%);background:#1a2142;border:1px solid var(--line2);
      color:#fff;font-size:.66rem;font-weight:700;padding:5px 11px;border-radius:8px;
      white-space:nowrap;z-index:5;box-shadow:0 10px 26px rgba(0,0,0,.5);
      pointer-events:none;
    }
  }

  /* ---------- area utama ---------- */
  .main{margin-left:236px;min-height:100vh;transition:margin-left .25s ease}
  .wrap{max-width:1160px;margin:0 auto;padding:0 22px 64px}

  /* ---------- halaman (History API — pindah tanpa reload) ----------
     Setiap layar panel adalah satu <section class="page">. Hanya satu yang
     memakai kelas .on pada satu waktu; sisanya benar-benar tidak dirender
     sehingga tabel besar di halaman lain tidak membebani scroll. */
  .page{display:none}
  .page.on{display:block;animation:up .3s ease both}

  /* kepala halaman: ikon, judul, penjelasan singkat, aksi khas halaman */
  .hero{display:flex;align-items:flex-start;gap:15px;flex-wrap:wrap;padding:24px 2px 4px}
  .hero-ic{width:52px;height:52px;border-radius:16px;flex:0 0 52px;display:flex;align-items:center;
    justify-content:center;color:#fff;background:var(--grad);
    box-shadow:0 14px 34px -12px rgba(109,124,255,.6),inset 0 0 0 1px rgba(255,255,255,.18)}
  .hero-ic .i{width:23px;height:23px;stroke-width:1.7}
  .hero-tx{min-width:0;flex:1 1 240px}
  .hero-tx h2{font-size:1.3rem;letter-spacing:-.02em;display:flex;align-items:center;gap:9px;flex-wrap:wrap}
  .hero-tx p{color:var(--mut);font-size:.8rem;margin-top:6px;max-width:76ch;line-height:1.6}
  .hero-act{margin-left:auto;display:flex;gap:8px;flex-wrap:wrap;align-items:center}

  /* ---------- kartu pintasan (halaman Ringkasan) ---------- */
  .tiles{display:grid;gap:13px;grid-template-columns:repeat(auto-fit,minmax(238px,1fr));margin-top:18px}
  .tile{
    position:relative;overflow:hidden;text-align:left;cursor:pointer;font:inherit;color:var(--ink);
    background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:18px;
    display:flex;flex-direction:column;gap:9px;transition:.18s;animation:pop .4s ease both;
  }
  .tile::after{content:"";position:absolute;left:0;right:0;top:0;height:2px;
    background:linear-gradient(90deg,var(--a),transparent 78%)}
  .tile:hover{transform:translateY(-3px);border-color:color-mix(in srgb,var(--a) 48%,var(--line));
    box-shadow:0 24px 48px -22px color-mix(in srgb,var(--a) 50%,transparent)}
  .tile .th-row{display:flex;align-items:center;gap:11px}
  .tile .ic{width:38px;height:38px;border-radius:12px;flex:0 0 38px;display:flex;align-items:center;
    justify-content:center;color:var(--a);background:color-mix(in srgb,var(--a) 13%,#0c1124);
    border:1px solid color-mix(in srgb,var(--a) 32%,transparent)}
  .tile .ic .i{width:17px;height:17px}
  .tile b{font-size:.92rem;letter-spacing:-.01em}
  .tile span{color:var(--mut);font-size:.76rem;line-height:1.55}
  .tile .go{margin-top:auto;color:#a5b4fc;font-size:.72rem;font-weight:800;letter-spacing:.05em;
    text-transform:uppercase;display:flex;align-items:center;gap:6px}
  .tile .go .i{width:13px;height:13px;transform:rotate(180deg);transition:transform .18s}
  .tile:hover .go .i{transform:rotate(180deg) translateX(-3px)}

  /* ---------- segmented control & chip penyaring ---------- */
  .seg{display:inline-flex;gap:4px;background:#0b1024;padding:5px;border-radius:12px;border:1px solid var(--line)}
  .seg button{border:none;background:transparent;color:var(--mut);font:inherit;font-size:.78rem;
    font-weight:700;padding:8px 15px;border-radius:9px;cursor:pointer;transition:.15s;
    display:inline-flex;align-items:center;gap:7px;white-space:nowrap}
  .seg button .i{width:14px;height:14px}
  .seg button:hover{color:var(--ink)}
  .seg button.on{background:var(--grad);color:#fff;box-shadow:0 6px 16px -4px rgba(109,124,255,.5)}
  .fchips{display:flex;gap:7px;flex-wrap:wrap}
  .fchip{cursor:pointer;font:inherit;font-size:.74rem;font-weight:700;color:var(--mut);
    background:#0c1124;border:1px solid var(--line);border-radius:99px;padding:6px 14px;transition:.15s;
    display:inline-flex;align-items:center;gap:6px}
  .fchip:hover{color:var(--ink);border-color:var(--line2)}
  .fchip.on{color:#fff;background:rgba(109,124,255,.18);border-color:rgba(109,124,255,.5);
    box-shadow:0 6px 18px -8px rgba(109,124,255,.6)}
  .fchip .n{font:800 .66rem var(--mono);opacity:.8}

  /* ---------- kartu akun pada halaman Perangkat & sesi ---------- */
  .asx{background:var(--panel);border:1px solid var(--line);border-radius:15px;margin-top:11px;
    overflow:hidden;transition:.18s;animation:up .3s ease both}
  .asx:hover{border-color:var(--line2)}
  .asx.aktif{border-color:rgba(52,211,153,.34);
    box-shadow:0 0 0 1px rgba(52,211,153,.1),0 18px 40px -28px rgba(52,211,153,.5)}
  .asx-h{display:flex;align-items:center;gap:12px;padding:13px 16px;cursor:pointer;flex-wrap:wrap}
  .asx-h:hover{background:rgba(109,124,255,.05)}
  .asx-nm{min-width:0;flex:1 1 190px}
  .asx-nm b{font-size:.88rem;display:inline-flex;align-items:center;gap:7px;flex-wrap:wrap}
  .asx-meta{color:var(--mut);font-size:.72rem;margin-top:4px;display:flex;gap:6px;flex-wrap:wrap;
    align-items:center}
  .asx-meta .dot{width:3px;height:3px;border-radius:50%;background:#39406e;flex:0 0 auto}
  .asx-act{display:flex;gap:7px;align-items:center;margin-left:auto;flex-wrap:wrap}
  .asx-tgl{width:28px;height:28px;border-radius:9px;flex:0 0 28px;display:flex;align-items:center;
    justify-content:center;border:1px solid var(--line2);background:#0c1128;color:var(--mut);
    cursor:pointer;transition:.16s}
  .asx-tgl .i{width:13px;height:13px;transform:rotate(-90deg);transition:transform .2s}
  .asx.buka .asx-tgl .i{transform:rotate(90deg)}
  .asx-tgl:hover{color:#fff;border-color:var(--p);background:rgba(109,124,255,.2)}
  .asx-b{border-top:1px solid var(--line);padding:4px 16px 14px;background:#0b1024}
  .dev{display:flex;align-items:center;gap:12px;padding:11px 2px;border-bottom:1px dashed #1b2242;flex-wrap:wrap}
  .dev:last-child{border-bottom:none}
  .dev-ic{font-size:1.15rem;flex:0 0 auto}
  .dev-nm{min-width:0;flex:1 1 180px}
  .dev-nm b{font-size:.8rem}
  .dev-nm .mut{font-size:.7rem;margin-top:2px}
  .dev-ip{font:700 .72rem var(--mono);color:#a5b4fc;background:#0c1124;border:1px solid var(--line);
    border-radius:8px;padding:4px 10px;flex:0 0 auto}
  .dev-tm{color:var(--mut);font-size:.72rem;text-align:right;flex:0 0 auto;min-width:110px}
  .dev-act{margin-left:auto;flex:0 0 auto}

  /* titik status online / offline */
  .st{display:inline-flex;align-items:center;gap:6px;font-size:.68rem;font-weight:800;
    letter-spacing:.06em;text-transform:uppercase;padding:3px 10px;border-radius:99px;white-space:nowrap}
  .st i{width:6px;height:6px;border-radius:50%;background:currentColor;flex:0 0 auto}
  .st.on{color:#4ade80;background:rgba(52,211,153,.10);border:1px solid rgba(52,211,153,.34)}
  .st.on i{animation:blink 1.9s infinite}
  .st.off{color:#8891bb;background:rgba(136,145,187,.08);border:1px solid rgba(136,145,187,.24)}
  /* tab aplikasi terbuka tapi di latar belakang (tersembunyi) */
  .st.idle{color:#fbbf24;background:rgba(251,191,36,.10);border:1px solid rgba(251,191,36,.34)}
  /* sesi login ada, tetapi tab aplikasi tidak sedang dibuka */
  .st.dim{color:#a5adcf;background:rgba(136,145,187,.06);border:1px dashed rgba(136,145,187,.30)}
  /* lencana yang membawa angka/kata biasa (mis. "login · 3 perangkat") tidak perlu kapital */
  .st.kecil{text-transform:none;letter-spacing:.01em;font-size:.66rem;padding:2px 9px}
  .asx.membuka{border-color:rgba(52,211,153,.55);box-shadow:0 0 0 1px rgba(52,211,153,.18) inset}
  /* lencana status di baris perangkat & sel tabel: lebih kecil, di baris tersendiri */
  .dev-st{display:block;margin-top:5px}
  .dev-st .st,.st-cell .st{font-size:.6rem;padding:2px 8px;gap:5px;letter-spacing:.04em}
  .st-cell{white-space:nowrap}

  /* ---------- skeleton saat memuat pertama kali ---------- */
  @keyframes shimmer{from{background-position:-420px 0}to{background-position:420px 0}}
  .skel{border-radius:9px;background:linear-gradient(90deg,#131a35 8%,#1c2447 20%,#131a35 32%);
    background-size:820px 100%;animation:shimmer 1.25s linear infinite;height:13px;display:block}
  .skel.row{height:52px;border-radius:12px;margin-top:9px}
  .skel.stat{height:78px;border-radius:16px}

  /* ---------- topbar ---------- */
  .top{position:sticky;top:0;z-index:50;backdrop-filter:blur(16px) saturate(1.4);
    background:rgba(7,10,20,.78)}
  .top::after{content:"";position:absolute;left:0;right:0;bottom:0;height:1px;
    background:linear-gradient(90deg,transparent,rgba(109,124,255,.55),rgba(167,139,250,.35),rgba(34,211,238,.30),transparent)}
  .top-in{max-width:1160px;margin:0 auto;padding:14px 22px;display:flex;align-items:center;gap:14px}
  .crumb{display:flex;align-items:center;gap:8px;font:600 .64rem var(--mono);color:var(--mut);
    letter-spacing:.08em;text-transform:uppercase}
  .crumb .i{width:12px;height:12px}
  .crumb .sep{width:4px;height:4px;border-radius:50%;background:#39406e}
  .top h1{font-size:1.05rem;letter-spacing:-.01em;display:flex;align-items:center;gap:10px;margin-top:3px}
  .top-act{margin-left:auto;display:flex;gap:8px}
  .live{display:inline-flex;align-items:center;gap:6px;font-size:.66rem;font-weight:800;
    color:#4ade80;letter-spacing:.1em;text-transform:uppercase;
    background:rgba(52,211,153,.10);border:1px solid rgba(52,211,153,.35);
    padding:3px 10px;border-radius:99px}
  .live i{width:6px;height:6px;border-radius:50%;background:var(--ok);animation:blink 1.8s infinite}
  .live.mati{color:#fcd34d;background:rgba(251,191,36,.10);border-color:rgba(251,191,36,.32)}
  .live.mati i{background:var(--warn);animation:none}

  /* ---------- kartu & tombol ---------- */
  .card{
    position:relative;overflow:hidden;background:var(--panel);border:1px solid var(--line);
    border-radius:var(--r);padding:20px 22px;margin-top:16px;
    box-shadow:0 18px 44px -24px rgba(0,0,0,.6);animation:up .45s ease both;
    transition:transform .18s ease,border-color .18s ease,box-shadow .18s ease;
  }
  .card::before{content:"";position:absolute;inset:0 0 auto 0;height:1px;
    background:linear-gradient(90deg,transparent,rgba(109,124,255,.40),transparent)}
  .card:hover{transform:translateY(-2px);border-color:var(--line2);
    box-shadow:0 26px 60px -26px rgba(0,0,0,.7)}
  .card h2{font-size:.95rem;display:flex;align-items:center;gap:9px}
  .card h2 .i{width:16px;height:16px;color:var(--p)}
  /* Lencana kecil di samping judul — dipakai di kartu MAUPUN kepala halaman. */
  .tag{font:700 .62rem var(--mono);color:var(--mut);background:#0c1124;
    border:1px solid var(--line);padding:2.5px 10px;border-radius:99px;letter-spacing:.04em;
    white-space:nowrap}
  .tag.g{color:#86efac;border-color:rgba(134,239,172,.35)}
  .tag.r{color:#fca5a5;border-color:rgba(252,165,165,.35)}
  .mut{color:var(--mut);font-size:.78rem}
  .row{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
  .spread{justify-content:space-between}
  .btn{
    cursor:pointer;border:1px solid var(--line2);background:#131a3a;color:var(--ink);
    border-radius:11px;padding:9px 16px;font:inherit;font-size:.82rem;font-weight:700;
    display:inline-flex;align-items:center;gap:7px;transition:.16s;white-space:nowrap;
    text-decoration:none;
  }
  .btn .i{width:14px;height:14px}
  .btn:hover{border-color:var(--p);transform:translateY(-1px);
    box-shadow:0 10px 24px -8px rgba(109,124,255,.4)}
  .btn:active{transform:scale(.97)}
  .btn:focus-visible{outline:2px solid var(--p);outline-offset:2px}
  .btn.p{background:var(--grad);border:none;color:#fff;box-shadow:0 8px 20px -6px rgba(109,124,255,.55)}
  .btn.p:hover{filter:brightness(1.1)}
  .btn.d{background:rgba(251,113,133,.10);border-color:rgba(251,113,133,.34);color:#fda4af}
  .btn.d:hover{background:rgba(251,113,133,.18);border-color:var(--bad);
    box-shadow:0 10px 24px -10px rgba(251,113,133,.45)}
  .btn.sm{padding:6px 11px;font-size:.74rem;border-radius:9px}
  .btn.sm .i{width:13px;height:13px}
  .btn.ic{padding:6px 8px}
  .btn:disabled{opacity:.5;cursor:wait;transform:none}
  .memuat .i{animation:spin .7s linear infinite}

  /* ---------- form ---------- */
  label{display:block;font-size:.72rem;font-weight:700;color:var(--mut);margin-top:13px}
  input{
    width:100%;margin-top:6px;padding:11px 13px;border-radius:11px;border:1px solid var(--line2);
    background:#0c1128;color:var(--ink);font:inherit;font-size:.88rem;transition:.15s;
  }
  input:focus{outline:none;border-color:var(--p);box-shadow:0 0 0 3px rgba(109,124,255,.22)}
  input::placeholder{color:#4d5580}
  select{
    width:100%;margin-top:6px;padding:11px 13px;border-radius:11px;border:1px solid var(--line2);
    background:#0c1128;color:var(--ink);font:inherit;font-size:.88rem;transition:.15s;cursor:pointer;
  }
  select:focus{outline:none;border-color:var(--p);box-shadow:0 0 0 3px rgba(109,124,255,.22)}
  .in-wrap{position:relative;display:block;margin-top:6px}
  .in-wrap .i{position:absolute;left:12px;top:50%;transform:translateY(-50%);color:#565e8c;pointer-events:none}
  .in-wrap input{margin-top:0;padding-left:38px}
  .search{position:relative;width:250px;max-width:100%}
  .search .i{position:absolute;left:12px;top:50%;transform:translateY(-50%);width:14px;height:14px;
    color:#565e8c;pointer-events:none}
  .search input{margin:0;padding:9px 36px 9px 36px;font-size:.82rem}
  .search kbd{position:absolute;right:10px;top:50%;transform:translateY(-50%);
    font:700 .6rem var(--mono);color:var(--mut);background:#0a0f22;
    border:1px solid var(--line2);border-radius:6px;padding:2px 7px;pointer-events:none}

  /* ---------- statistik ---------- */
  .stats{display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));margin-top:18px}
  .stat{
    position:relative;overflow:hidden;background:var(--panel);border:1px solid var(--line);
    border-radius:16px;padding:16px 18px;display:flex;gap:14px;align-items:center;
    transition:.2s;animation:pop .45s ease both;box-shadow:0 16px 36px -24px rgba(0,0,0,.6);
  }
  .stat:nth-child(2){animation-delay:.05s}
  .stat:nth-child(3){animation-delay:.1s}
  .stat:nth-child(4){animation-delay:.15s}
  .stat:nth-child(5){animation-delay:.2s}
  .stat:nth-child(6){animation-delay:.25s}
  .stat::after{content:"";position:absolute;left:0;right:0;top:0;height:2px;
    background:linear-gradient(90deg,var(--a),transparent 75%)}
  .stat::before{content:"";position:absolute;width:140px;height:140px;right:-40px;top:-50px;
    border-radius:50%;background:var(--a);opacity:.10;filter:blur(34px)}
  .stat:hover{transform:translateY(-3px);border-color:color-mix(in srgb,var(--a) 45%,var(--line));
    box-shadow:0 22px 44px -20px color-mix(in srgb,var(--a) 45%,transparent)}
  .stat .ic{width:44px;height:44px;border-radius:13px;flex:0 0 44px;display:flex;align-items:center;
    justify-content:center;color:var(--a);background:color-mix(in srgb,var(--a) 13%,#0c1124);
    border:1px solid color-mix(in srgb,var(--a) 34%,transparent);
    box-shadow:0 10px 20px -12px color-mix(in srgb,var(--a) 65%,transparent)}
  .stat .ic .i{width:20px;height:20px;stroke-width:1.8}
  .stat .tx{min-width:0}
  .stat b{font-size:1.55rem;letter-spacing:-.03em;display:block;line-height:1.1;
    font-variant-numeric:tabular-nums}
  .stat .lbl{color:var(--mut);font-size:.68rem;font-weight:700;letter-spacing:.07em;text-transform:uppercase}
  /* rincian kecil di bawah label (mis. "👥 2 · 🎓 1 · 👨‍🏫 1") */
  .stat .sub{display:block;color:var(--mut);font-size:.7rem;margin-top:3px;font-variant-numeric:tabular-nums;
    white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  /* kartu "Sedang membuka": titik hijau berdenyut di sudut */
  .stat.hidup .ic{position:relative}
  .stat.hidup .ic::after{content:"";position:absolute;right:-3px;top:-3px;width:10px;height:10px;border-radius:50%;
    background:#4ade80;border:2px solid var(--panel);animation:blink 1.9s infinite}
  .s1{--a:#6d7cff}.s2{--a:#22d3ee}.s3{--a:#fbbf24}.s4{--a:#34d399}.s5{--a:#a78bfa}.s6{--a:#fb7185}

  /* ---------- tabel ---------- */
  .tbl{overflow:auto;margin-top:12px;border:1px solid var(--line);border-radius:13px;-webkit-overflow-scrolling:touch}
  table{width:100%;border-collapse:separate;border-spacing:0;font-size:.82rem;min-width:680px}
  th,td{text-align:left;padding:12px 15px;border-bottom:1px solid #141a36;vertical-align:middle}
  th{color:var(--mut);font-size:.66rem;text-transform:uppercase;letter-spacing:.08em;
     background:#0b1024;position:sticky;top:0;z-index:1}
  tbody tr{transition:background .13s}
  tbody tr:hover{background:rgba(109,124,255,.06)}
  tbody tr:last-child td{border-bottom:none}
  td.num,th.num{text-align:right;font-variant-numeric:tabular-nums}
  .acts-cell{text-align:right;white-space:nowrap}
  .acts{display:inline-flex;gap:6px;flex-wrap:nowrap}
  tr.baris-total td{background:#0b1024;font-weight:800}

  /* ---------- avatar & badge ---------- */
  .ava{width:34px;height:34px;border-radius:50%;flex:0 0 34px;display:inline-flex;align-items:center;
    justify-content:center;font-weight:800;font-size:.86rem;background:var(--grad);color:#fff;
    box-shadow:0 4px 12px rgba(0,0,0,.45),inset 0 0 0 1px rgba(255,255,255,.22)}
  .ava.lg{width:42px;height:42px;flex:0 0 42px;border-radius:14px;font-size:1rem}
  .u-cell{display:flex;gap:11px;align-items:center;min-width:170px}
  .badge{display:inline-flex;align-items:center;gap:5px;padding:2.5px 10px;border-radius:99px;
    font-size:.68rem;font-weight:700;white-space:nowrap;
    border:1px solid color-mix(in srgb,currentColor 30%,transparent)}
  .badge::before{content:"";width:5px;height:5px;border-radius:50%;background:currentColor}
  .badge.g{background:rgba(52,211,153,.10);color:#4ade80}
  .badge.b{background:rgba(109,124,255,.12);color:#a5b4fc}
  .badge.y{background:rgba(251,191,36,.10);color:#fcd34d}
  .badge.r{background:rgba(251,113,133,.12);color:#fda4af}
  .badge.c{background:rgba(34,211,238,.10);color:#67e8f9}

  /* ---------- foto thumbnail ---------- */
  .ths{display:flex;gap:5px;flex-wrap:wrap}
  .th{width:42px;height:42px;object-fit:cover;border-radius:9px;border:1px solid var(--line2);
    cursor:zoom-in;transition:.15s}
  .th:hover{transform:scale(1.14);border-color:var(--p);box-shadow:0 12px 26px rgba(0,0,0,.5)}

  /* ---------- dialog ---------- */
  dialog{
    border:1px solid var(--line2);border-radius:18px;color:var(--ink);
    background:#0e1330;
    padding:0;width:calc(100% - 36px);box-shadow:0 50px 130px rgba(0,0,0,.65);
    margin:auto;max-height:calc(100vh - 24px);max-height:calc(100dvh - 24px);
  }
  dialog[open]{
    /* position:fixed + inset:0 + margin:auto — dialog SELALU melayang di
       tengah layar dan di ATAS apa pun (sidebar z-60, topbar z-50), bahkan
       bila dialog terjebak dalam keadaan terbuka non-modal (tanpa top layer)
       — sebelumnya keadaan itu membuat dialog tertimpa topbar/sidebar
       sehingga tombol Tutup tak terjangkau. */
    position:fixed;inset:0;margin:auto;z-index:2147483001;
    animation:pop .24s ease;
  }
  /* Backdrop cadangan: dipasang HANYA bila dialog ternyata tidak masuk top
     layer (non-modal) sehingga ::backdrop tidak digambar browser. */
  .dlg-bg{position:fixed;inset:0;z-index:2147483000;
    background:rgba(3,5,12,.66);backdrop-filter:blur(6px)}
  /* Selama ada dialog terbuka: halaman tidak ikut ter-scroll dan navigasi
     tidak mungkin menutupi/mencuri klik dari dialog. */
  html.dlg-on{overflow:hidden}
  html.dlg-on .side,html.dlg-on .top{z-index:1}
  dialog::backdrop{background:rgba(3,5,12,.66);backdrop-filter:blur(6px)}
  dialog.mini{max-width:430px}
  /* Dialog detail memakai TINGGI LAYAR PENUH: kepala tetap di atas, isinya
     mengisi seluruh sisa ruang (satu area scroll saja) sehingga lebih banyak
     data terlihat sekaligus tanpa scroll bertumpuk.
     PENTING: selektor WAJIB memakai [open]. Tanpa itu aturan display flex
     menimpa display none bawaan browser untuk dialog yang sedang TERTUTUP,
     sehingga seluruh isi dialog (tab Kegiatan, Keuangan, Laporan, Presentasi,
     Aktivitas, dan tombol Tutup) ikut tampil menumpuk di dasar halaman —
     termasuk pada layar login, karena markup dialog selalu ikut ter-render. */
  dialog.besar[open]{
    width:calc(100vw - 24px);max-width:1440px;
    height:calc(100vh - 24px);height:calc(100dvh - 24px);
    display:flex;flex-direction:column;
  }
  dialog.besar .dlg-h{flex:0 0 auto}
  dialog.besar .dlg-b{flex:1 1 auto;min-height:0;max-height:none;padding:20px 24px 24px}
  dialog.besar table{font-size:.88rem;min-width:760px}
  dialog.besar th,dialog.besar td{padding:13px 15px}
  dialog.besar .th{width:54px;height:54px;border-radius:10px}
  dialog.besar .chip{padding:11px 18px;font-size:.84rem;min-width:132px}
  dialog.besar .chip b{font-size:1.08rem}
  dialog.besar .chip small{font-size:.66rem}
  dialog.besar .tabs button{font-size:.84rem;padding:9px 20px}
  dialog.besar .prog{min-width:110px;height:9px}
  /* linimasa ikut memanjang — cukup satu scrollbar milik .dlg-b */
  dialog.besar .tline{max-height:none;overflow:visible}
  .dlg-h{display:flex;align-items:center;gap:12px;padding:16px 20px;
    background:linear-gradient(120deg,rgba(109,124,255,.14),rgba(34,211,238,.06));
    border-bottom:1px solid var(--line)}
  .dlg-h h3{font-size:.98rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .dlg-h .x{margin-left:auto}
  .dlg-b{padding:18px 20px 20px;max-height:calc(100vh - 230px);max-height:calc(100dvh - 230px);overflow:auto}
  dialog.besar .dlg-h{padding:18px 24px}
  dialog.besar .dlg-h h3{font-size:1.12rem}
  dialog.besar .dlg-h .mut{font-size:.82rem}

  /* ---------- chips ringkasan ---------- */
  .chips{display:flex;gap:9px;flex-wrap:wrap}
  .chip{background:#10162e;border:1px solid var(--line);border-radius:13px;
    padding:9px 14px;font-size:.78rem;font-weight:700;min-width:116px}
  .chip small{display:block;font-size:.66rem;color:var(--mut);font-weight:700;letter-spacing:.05em;
    text-transform:uppercase;margin-bottom:3px}
  .chip b{font-size:.95rem}
  .chip.hijau{border-color:rgba(52,211,153,.34)} .chip.hijau b{color:#4ade80}
  .chip.merah{border-color:rgba(251,113,133,.34)} .chip.merah b{color:#fda4af}
  .chip.ungu{border-color:rgba(167,139,250,.36)} .chip.ungu b{color:#c4b5fd}
  .chip.biru{border-color:rgba(34,211,238,.34)} .chip.biru b{color:#67e8f9}

  /* ---------- tab ---------- */
  .tabs{display:inline-flex;gap:5px;background:#0b1024;padding:5px;border-radius:12px;
    border:1px solid var(--line);margin-top:16px}
  .tabs button{border:none;background:transparent;color:var(--mut);font:inherit;font-size:.78rem;
    font-weight:700;padding:8px 16px;border-radius:9px;cursor:pointer;transition:.15s}
  .tabs button:hover{color:var(--ink)}
  .tabs button.on{background:var(--grad);color:#fff;box-shadow:0 6px 16px -4px rgba(109,124,255,.5)}

  /* ---------- progress ---------- */
  .prog{height:8px;background:#161d40;border-radius:99px;overflow:hidden;min-width:74px}
  .prog>i{display:block;height:100%;border-radius:99px;background:var(--grad3);
    box-shadow:0 0 10px rgba(109,124,255,.5)}

  /* ---------- util ---------- */
  .err{background:rgba(251,113,133,.10);border:1px solid rgba(251,113,133,.36);color:#fda4af;
    border-radius:11px;padding:11px 14px;font-size:.8rem;margin-top:12px;animation:up .25s ease}
  .kosong{text-align:center;padding:46px 16px;color:var(--mut);
    border:1.5px dashed #2a3157;border-radius:14px;margin-top:10px}
  .kosong .big{font-size:2.4rem;margin-bottom:6px;animation:floaty 3.2s ease-in-out infinite}
  .hide{display:none!important}
  .grid2{display:grid;gap:16px;grid-template-columns:1.2fr 1fr}
  @media(max-width:860px){.grid2{grid-template-columns:1fr}}
  .foot{text-align:center;color:#3d4470;font:600 .64rem var(--mono);margin-top:30px;letter-spacing:.14em;
    text-transform:uppercase}

  /* ---------- jejak audit ---------- */
  .audit{font-family:var(--mono);font-size:.7rem;color:var(--mut);max-height:330px;
    overflow:auto;margin-top:12px}
  .audit .row-a{display:flex;gap:9px;align-items:center;padding:6px 5px;min-width:0;
    border-bottom:1px dashed #1b2242;border-radius:6px;transition:background .12s}
  .audit .row-a:hover{background:rgba(109,124,255,.06)}
  .audit .t{color:#707aa8;flex:0 0 auto;font-size:.68rem}
  .audit .badge{flex:0 0 auto;font-size:.64rem;padding:2px 8px;font-family:"Segoe UI",system-ui,sans-serif}
  .audit .tg{min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .audit .ip{margin-left:auto;flex:0 0 auto;color:#5d668f;font-size:.66rem}
  /* Halaman Jejak audit memakai seluruh tinggi yang tersedia; pratinjau di
     halaman Ringkasan sengaja pendek (hanya cuplikan terbaru). */
  #audit{max-height:none}
  #audit-mini{max-height:none}

  /* ---------- linimasa aktivitas per pengguna ---------- */
  .tline{margin-top:14px;max-height:52vh;overflow:auto;padding-right:4px}
  .tl-item{position:relative;display:flex;gap:12px;padding:0 0 16px 0}
  .tl-item::before{content:"";position:absolute;left:14px;top:30px;bottom:-2px;width:2px;
    background:linear-gradient(180deg,#262e56,#141a36)}
  .tl-item:last-child::before{display:none}
  .tl-dot{width:30px;height:30px;border-radius:10px;flex:0 0 30px;display:flex;align-items:center;
    justify-content:center;background:#0c1128;border:1px solid var(--line2);z-index:1}
  .tl-dot .i{width:14px;height:14px}
  .tl-dot.g{color:#4ade80;border-color:rgba(52,211,153,.4);box-shadow:0 4px 14px -4px rgba(52,211,153,.4)}
  .tl-dot.r{color:#fda4af;border-color:rgba(251,113,133,.4);box-shadow:0 4px 14px -4px rgba(251,113,133,.4)}
  .tl-dot.y{color:#fcd34d;border-color:rgba(251,191,36,.4);box-shadow:0 4px 14px -4px rgba(251,191,36,.4)}
  .tl-dot.c{color:#67e8f9;border-color:rgba(34,211,238,.4);box-shadow:0 4px 14px -4px rgba(34,211,238,.4)}
  .tl-dot.b{color:#a5b4fc;border-color:rgba(109,124,255,.4);box-shadow:0 4px 14px -4px rgba(109,124,255,.4)}
  .tl-body{flex:1;min-width:0;background:#10162e;border:1px solid #1d2547;
    border-radius:12px;padding:9px 13px}
  .tl-body b{font-size:.8rem}
  .tl-meta{color:var(--mut);font-size:.68rem;margin-top:2px;display:flex;gap:8px;flex-wrap:wrap;align-items:center}
  .tl-src{font-size:.64rem;font-weight:800;letter-spacing:.05em;text-transform:uppercase;
    padding:1.5px 8px;border-radius:99px;border:1px solid rgba(109,124,255,.44);color:#a5b4fc}
  .tl-src.panel{border-color:rgba(251,191,36,.5);color:#fcd34d}

  /* ---------- toast ---------- */
  #toast{position:fixed;right:16px;bottom:16px;z-index:99;display:flex;flex-direction:column;gap:8px}
  .tst{position:relative;overflow:hidden;display:flex;gap:9px;align-items:flex-start;
    background:#10162e;border:1px solid var(--line2);border-left:3px solid var(--ok);
    border-radius:12px;padding:11px 15px 13px;font-size:.8rem;font-weight:600;min-width:240px;
    max-width:360px;box-shadow:0 20px 50px rgba(0,0,0,.6);animation:pop .22s ease}
  .tst.bad{border-left-color:var(--bad)}
  .tst .bar{position:absolute;left:0;bottom:0;height:2.5px;background:var(--ok);
    animation:barShrink 4.2s linear forwards}
  .tst.bad .bar{background:var(--bad)}

  /* ---------- login ---------- */
  .login-wrap{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:22px}
  .login{
    width:100%;max-width:410px;border-radius:22px;padding:0 0 30px;position:relative;overflow:hidden;
    background:linear-gradient(#0e1330,#0e1330) padding-box,var(--grad3) border-box;
    border:1.5px solid transparent;box-shadow:0 40px 110px -24px rgba(109,124,255,.35);
    animation:pop .35s ease;
  }
  .login::before{content:"";position:absolute;inset:-4px;border-radius:24px;background:var(--grad3);
    filter:blur(32px);opacity:.15;z-index:-1;animation:pulseGlow 4.5s ease-in-out infinite}
  .win-dots{display:flex;align-items:center;gap:6px;padding:13px 18px;
    background:rgba(9,12,26,.8);border-bottom:1px solid var(--line)}
  .win-dots i{width:10px;height:10px;border-radius:50%}
  .win-dots i:nth-child(1){background:#fb7185}
  .win-dots i:nth-child(2){background:#fbbf24}
  .win-dots i:nth-child(3){background:#34d399}
  .win-dots span{margin-left:auto;font:600 .58rem var(--mono);color:#4d5580;letter-spacing:.14em;
    text-transform:uppercase}
  .login-body{padding:26px 30px 0}
  .login .logo{width:60px;height:60px;border-radius:18px;margin:0 auto 14px;display:flex;
    align-items:center;justify-content:center;color:#fff;background:var(--grad);
    box-shadow:0 14px 34px rgba(109,124,255,.45),inset 0 0 0 1px rgba(255,255,255,.18);
    animation:floaty 5s ease-in-out infinite}
  .login .logo .i{width:26px;height:26px;stroke-width:1.8}
  .login h1{text-align:center;font-size:1.18rem;letter-spacing:-.01em}
  .login .mut{text-align:center;margin-top:5px}
  .login .hint{margin-top:18px;text-align:center;font:600 .6rem var(--mono);color:#4d5580;
    letter-spacing:.06em}

  @media(max-width:1080px){
    /* --- sidebar → dock bawah full-width ---
       PENTING: tanpa transform/animation — keyframe "up" berakhir di
       transform:none sehingga menimpa translateX(-50%) dan membuat dock
       meleset ke kanan. Full-width (left+right) bebas masalah itu. */
    .side{
      inset:auto 8px calc(8px + env(safe-area-inset-bottom,0px)) 8px;
      transform:none;animation:none;transition:none;
      width:auto;max-width:none;
      flex-direction:row;align-items:stretch;gap:4px;padding:6px 8px;
      background:rgba(9,12,24,.96);
      border:1px solid var(--line2);border-radius:18px;
      box-shadow:0 24px 60px rgba(0,0,0,.65);
      overflow:hidden;
    }
    .side::after{display:none}
    .side-toggle{display:none}
    .side-top{display:none}
    .side-nav{flex-direction:row;margin:0;gap:4px;flex:1 1 auto;min-width:0}
    .side-nav a{
      flex:1 1 0;min-width:0;flex-direction:column;gap:3px;padding:8px 4px;
      justify-content:center;border-radius:12px;
    }
    /* label panjang diganti label pendek (attr data-m) agar tidak terpotong */
    .side-nav a span{display:none}
    .side-nav a::after{content:attr(data-m);font-size:.64rem;font-weight:700;
      letter-spacing:.02em;text-transform:uppercase;white-space:nowrap;
      overflow:hidden;text-overflow:ellipsis;max-width:100%}
    .side-nav a:hover{transform:none}
    .side-nav a:hover:not(.on){background:transparent}
    .side-nav a.on::before{display:none}
    .side-foot{margin:0;flex:0 0 auto}
    .side-note{display:none}
    .side-out{
      flex-direction:column;gap:3px;padding:8px 10px;width:auto;min-width:54px;
      border-radius:12px;
    }
    .side-out span{display:none}
    .side-out::after{content:attr(data-m);font-size:.64rem;font-weight:700;
      letter-spacing:.02em;text-transform:uppercase}
    .main{margin-left:0}
    .wrap{padding-bottom:calc(104px + env(safe-area-inset-bottom,0px))}
    /* dock menutupi sudut kanan-bawah → toast dinaikkan agar tetap terbaca */
    #toast{bottom:calc(88px + env(safe-area-inset-bottom,0px))}
  }
  @media(max-width:640px){
    /* --- topbar ringkas --- */
    .top-in{padding:10px 14px;flex-wrap:wrap;row-gap:9px;gap:10px}
    .top h1{flex-wrap:wrap;font-size:.94rem}
    .crumb{font-size:.64rem;flex-wrap:wrap}
    .top-act{margin-left:auto}
    .top-act .btn-txt{display:none}
    .top-act .btn.sm{padding:8px 10px}
    .wrap{padding:0 12px calc(120px + env(safe-area-inset-bottom,0px))}
    .search{width:100%}
    .search kbd{display:none}
    .card{padding:15px 13px;border-radius:15px}
    .card h2{flex-wrap:wrap}
    /* --- statistik 2 kolom padat --- */
    .stats{grid-template-columns:repeat(2,minmax(0,1fr));gap:9px;margin-top:14px}
    .stat{padding:12px 12px;gap:10px;border-radius:13px}
    .stat .ic{width:34px;height:34px;flex:0 0 34px;border-radius:10px}
    .stat .ic .i{width:16px;height:16px}
    .stat b{font-size:1.16rem}
    .stat .lbl{font-size:.62rem}
    .stat .tx{min-width:0}
    /* --- form: 16px mencegah auto-zoom iOS saat fokus --- */
    input{font-size:16px}
    /* --- tab menggulir --- */
    .tabs{display:flex;max-width:100%;overflow-x:auto;scrollbar-width:none;-webkit-overflow-scrolling:touch}
    .tabs::-webkit-scrollbar{display:none}
    .tabs button{white-space:nowrap;flex:1 0 auto;padding:9px 13px}
    /* --- kepala halaman & kontrol khas halaman --- */
    .hero{padding:16px 0 2px;gap:12px}
    .hero-ic{width:44px;height:44px;flex:0 0 44px;border-radius:14px}
    .hero-ic .i{width:20px;height:20px}
    .hero-tx h2{font-size:1.08rem}
    .hero-tx p{font-size:.76rem}
    .hero-act{margin-left:0;width:100%}
    .seg{display:flex;max-width:100%;overflow-x:auto;scrollbar-width:none}
    .seg::-webkit-scrollbar{display:none}
    .seg button{flex:1 0 auto;padding:9px 13px;font-size:.74rem}
    .tiles{grid-template-columns:1fr;gap:11px}
    /* --- kartu akun di halaman sesi --- */
    .asx-h{padding:12px 13px;gap:10px}
    .asx-act{width:100%;margin-left:0}
    .asx-b{padding:2px 13px 12px}
    .dev{gap:9px;padding:10px 0}
    .dev-tm{text-align:left;min-width:0}
    .dev-act{margin-left:0}
    .chips{gap:7px}
    .chip{flex:1 1 calc(50% - 7px);min-width:0}
    .login-body{padding:22px 20px 0}
    /* --- tabel: lihat blok "TABEL → KARTU BERTUMPUK" di bawah --- */
    .u-cell{min-width:0}
    /* --- tombol ramah sentuh --- */
    .btn{min-height:40px}
    .btn.sm{min-height:36px}
    .acts{gap:7px}
    .acts .btn.sm{padding:8px 10px}
    .acts .btn.sm.ic{padding:8px 11px}

    /* ---------- TABEL → KARTU BERTUMPUK ----------
       Di layar sempit, menggeser tabel ke samping itu menyiksa. Setiap baris
       diubah jadi satu kartu: sel utama (nama akun / tanggal) jadi kepalanya,
       sel lain tampil "Label : nilai" memakai atribut data-l. */
    .tbl{border:none;border-radius:0;overflow:visible;background:transparent;margin-top:6px}
    .tbl table,.tbl tbody,.tbl tr,.tbl td{display:block;width:100%}
    .tbl table{min-width:0;font-size:.8rem}
    .tbl thead{display:none}
    .tbl tbody tr{
      background:var(--panel);border:1px solid var(--line);border-radius:14px;
      margin-top:10px;overflow:hidden;
      box-shadow:0 14px 30px -24px rgba(0,0,0,.8);
    }
    .tbl tbody tr:hover{background:var(--panel)}
    .tbl td{
      display:flex;align-items:center;justify-content:space-between;gap:4px 12px;
      flex-wrap:wrap;
      padding:9px 13px;text-align:right;border-bottom:1px solid #141a36;
      white-space:normal!important;overflow-wrap:anywhere;
    }
    .tbl tr td:last-child{border-bottom:none}
    .tbl td:empty{display:none}
    .tbl td[data-l]::before{
      content:attr(data-l);flex:0 0 auto;text-align:left;color:var(--mut);
      font-size:.63rem;font-weight:800;letter-spacing:.08em;text-transform:uppercase;
    }
    /* keterangan tambahan (tanggal jam, catatan perangkat) turun ke baris sendiri */
    .tbl td>.mut{flex:1 1 100%;text-align:right}
    /* kepala kartu: nama akun / tanggal — tanpa label, rata kiri */
    .tbl td.sel-utama{
      display:block;text-align:left;padding:12px 13px;
      background:linear-gradient(120deg,rgba(109,124,255,.14),rgba(34,211,238,.05));
      border-bottom:1px solid var(--line);
    }
    .tbl td.nomor{display:none}           /* nomor urut tidak berguna di kartu */
    .tbl td.sel-utama>.mut,.tbl td.sel-utama .mut{text-align:left}
    .tbl .u-cell{min-width:0}
    /* tombol aksi: satu baris penuh, boleh melipat */
    .tbl td.acts-cell{display:block;text-align:left;padding:11px 13px}
    .tbl td.acts-cell::before{display:none}
    .tbl .acts{display:flex;flex-wrap:wrap;gap:7px;width:100%}
    .tbl .acts .btn{flex:0 0 auto}
    .tbl .acts .btn.p{flex:1 1 auto;justify-content:center}
    /* baris kosong & baris TOTAL tetap utuh */
    .tbl td[colspan]{display:block;text-align:center}
    .tbl td[colspan]::before{display:none}
    .tbl tr.baris-total td[colspan]{text-align:right}
    .tbl .ths{justify-content:flex-end}
    .tbl .prog{min-width:60px}
    /* --- dialog nyaris layar penuh --- */
    dialog{width:calc(100% - 20px);max-height:calc(100dvh - 16px)}
    dialog.besar{width:calc(100vw - 12px);height:calc(100dvh - 16px)}
    dialog.besar .dlg-b{max-height:none;padding:13px 13px 17px}
    /* tabel di dalam dialog ikut mode kartu (lihat blok "TABEL → KARTU") */
    dialog.besar .tbl table{min-width:0;font-size:.8rem}
    dialog.besar .tbl td{padding:9px 13px}
    dialog.besar .tbl td.sel-utama,dialog.besar .tbl td.acts-cell{padding:11px 13px}
    dialog.besar .th{width:46px;height:46px}
    dialog.besar .chip{padding:9px 12px;font-size:.76rem;min-width:0}
    dialog.besar .chip b{font-size:.92rem}
    dialog.besar .tabs button{font-size:.78rem;padding:9px 14px}
    dialog.besar .tline{max-height:none}
    .dlg-h{padding:12px 13px;gap:9px}
    .dlg-h h3{font-size:.9rem}
    .dlg-b{padding:14px 13px;max-height:calc(100dvh - 170px)}
    .ava.lg{width:36px;height:36px;flex:0 0 36px;border-radius:11px;font-size:.9rem}
    /* --- audit & linimasa --- */
    .audit{-webkit-overflow-scrolling:touch}
    .tline{-webkit-overflow-scrolling:touch;max-height:58vh}
    /* baris audit: biar tidak terpotong, IP turun ke baris berikutnya */
    .audit .row-a{flex-wrap:wrap;row-gap:3px;padding:8px 5px}
    .audit .tg{white-space:normal;overflow-wrap:anywhere;flex:1 1 100%;order:3}
    .audit .ip{order:4;margin-left:0}
    /* --- toast: naik ke atas dock navigasi & selebar layar --- */
    #toast{
      left:12px;right:12px;
      bottom:calc(92px + env(safe-area-inset-bottom,0px));
    }
    .tst{min-width:0;max-width:none}
  }
  @media(max-width:420px){
    /* layar sangat sempit (≤420px): chips & tombol memenuhi lebar, teks pas */
    .chips .chip{flex:1 1 100%}
    .stat b{font-size:1.05rem}
    .top-act .btn{padding:8px 12px}
    .tabs button{padding:9px 12px;font-size:.74rem}
    .dlg-h h3{font-size:.84rem}
    .acts{gap:6px}
    .crumb .sep,#upd{display:none}
    .side-nav a::after,.side-out::after{font-size:.58rem}
    .side-out{min-width:48px;padding:8px 6px}
    /* kartu tabel makin padat, label tetap terbaca */
    .tbl td{padding:8px 11px;gap:8px}
    .tbl td[data-l]::before{font-size:.6rem}
    .tbl td.sel-utama,.tbl td.acts-cell{padding:10px 11px}
    .tbl .acts .btn.sm{flex:1 1 auto;justify-content:center}
  }
  @media(max-width:360px){
    /* dock: sisakan ikon saja, label hanya pada menu yang sedang aktif */
    .stats{grid-template-columns:1fr}
    .side-nav a::after{display:none}
    .side-nav a.on::after{display:block}
    .side-out::after{display:none}
    .side-out{min-width:44px}
  }
  @media(max-height:520px) and (orientation:landscape){
    /* HP telentang: dialog jangan lebih tinggi dari layar */
    dialog{max-height:calc(100dvh - 12px)}
    dialog.besar[open]{height:calc(100dvh - 12px)}
    .dlg-b{max-height:calc(100dvh - 96px)}
    .dlg-h{padding:10px 14px}
    .tline{max-height:none}
  }
  @media(prefers-reduced-motion:reduce){
    *,*::before,*::after{animation:none!important;transition:none!important}
  }
</style>
</head>
<body>

<!-- ===== sprite ikon (svg inline agar konsisten di semua OS) ===== -->
<svg xmlns="http://www.w3.org/2000/svg" style="display:none" aria-hidden="true">
  <symbol id="i-shield" viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></symbol>
  <symbol id="i-clock" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></symbol>
  <symbol id="i-users" viewBox="0 0 24 24"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></symbol>
  <symbol id="i-user" viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></symbol>
  <symbol id="i-cal" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="17" rx="3"/><path d="M16 2v4M8 2v4M3 9h18"/></symbol>
  <symbol id="i-coins" viewBox="0 0 24 24"><circle cx="8" cy="8" r="6"/><path d="M18.09 10.37A6 6 0 1 1 10.34 18"/><path d="M7 6h1v4"/><path d="m16.71 13.88.7.71-2.82 2.82"/></symbol>
  <symbol id="i-zap" viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></symbol>
  <symbol id="i-refresh" viewBox="0 0 24 24"><path d="M3 12a9 9 0 0 1 15.5-6.2L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15.5 6.2L3 16"/><path d="M3 21v-5h5"/></symbol>
  <symbol id="i-logout" viewBox="0 0 24 24"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/></symbol>
  <symbol id="i-power" viewBox="0 0 24 24"><path d="M18.4 6.6a9 9 0 1 1-12.8 0"/><path d="M12 2v10"/></symbol>
  <symbol id="i-device" viewBox="0 0 24 24"><path d="M18 8V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h8"/><path d="M7 19h5"/><rect x="16" y="12" width="6" height="10" rx="2"/></symbol>
  <symbol id="i-search" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></symbol>
  <symbol id="i-folder" viewBox="0 0 24 24"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></symbol>
  <symbol id="i-edit" viewBox="0 0 24 24"><path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></symbol>
  <symbol id="i-key" viewBox="0 0 24 24"><circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6"/><path d="m15.5 7.5 3 3L22 7l-3-3"/></symbol>
  <symbol id="i-trash" viewBox="0 0 24 24"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M10 11v6M14 11v6"/></symbol>
  <symbol id="i-x" viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12"/></symbol>
  <symbol id="i-chev" viewBox="0 0 24 24"><path d="m15 18-6-6 6-6"/></symbol>
  <symbol id="i-save" viewBox="0 0 24 24"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><path d="M17 21v-8H7v8"/><path d="M7 3v5h8"/></symbol>
  <symbol id="i-unlock" viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="10" rx="2.5"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></symbol>
  <symbol id="i-lock" viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="10" rx="2.5"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></symbol>
  <symbol id="i-scroll" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M16 13H8M16 17H8"/></symbol>
  <symbol id="i-gauge" viewBox="0 0 24 24"><path d="m12 14 4-4"/><path d="M3.34 19a10 10 0 1 1 17.32 0"/></symbol>
  <symbol id="i-cog" viewBox="0 0 24 24"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></symbol>
</svg>

<div class="orbs"><i class="orb a"></i><i class="orb b"></i><i class="orb c"></i></div>

<!-- ===== LOGIN ===== -->
<div id="v-login" class="login-wrap">
  <div class="login">
    <div class="win-dots"><i></i><i></i><i></i><span>akses-terbatas · teraudit</span></div>
    <div class="login-body">
      <div class="logo"><svg class="i"><use href="#i-shield"/></svg></div>
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
      <div class="hint">kredensial tersimpan satu arah (hash scrypt) — tidak bisa dilihat, hanya diganti</div>
    </div>
  </div>
</div>

<!-- ===== APP ===== -->
<div id="v-app" class="hide">
  <!-- Sidebar penuh: brand, navigasi berlabel (scrollspy), keluar di bawah.
       Di layar sempit otomatis jadi dock bawah. -->
  <aside class="side" aria-label="Navigasi panel">
    <button class="side-toggle" id="btn-mini" type="button" title="Kecilkan navigasi"
      aria-label="Kecilkan atau perlebar navigasi" aria-expanded="true">
      <svg class="i"><use href="#i-chev"/></svg>
    </button>
    <div class="side-top">
      <div class="side-logo" aria-hidden="true"><svg class="i"><use href="#i-shield"/></svg></div>
      <div class="side-brand"><b>Pusat Kendali</b><span>kelola akun &amp; data</span></div>
    </div>
    <nav class="side-nav">
      <a href="#" data-page="ringkas" class="on" data-tip="Ringkasan" data-m="Ringkas"><svg class="i"><use href="#i-gauge"/></svg><span>Ringkasan</span></a>
      <a href="#" data-page="akun" data-tip="Akun pengguna" data-m="Akun"><svg class="i"><use href="#i-users"/></svg><span>Akun pengguna</span></a>
      <a href="#" data-page="sesi" data-tip="Perangkat &amp; sesi" data-m="Sesi"><svg class="i"><use href="#i-device"/></svg><span>Perangkat &amp; sesi</span></a>
      <a href="#" data-page="audit" data-tip="Jejak audit" data-m="Audit"><svg class="i"><use href="#i-scroll"/></svg><span>Jejak audit</span></a>
      <a href="#" data-page="pengaturan" data-tip="Pengaturan" data-m="Setelan"><svg class="i"><use href="#i-cog"/></svg><span>Pengaturan</span></a>
    </nav>
    <div class="side-foot">
      <div class="side-note">tekan / untuk cari</div>
      <button class="side-out" data-act="keluar" data-tip="Keluar" data-m="Keluar" aria-label="Keluar dari panel">
        <svg class="i"><use href="#i-logout"/></svg><span>Keluar</span>
      </button>
    </div>
  </aside>

  <div class="main">
    <header class="top">
      <div class="top-in">
        <div style="min-width:0">
          <div class="crumb">
            <svg class="i"><use href="#i-shield"/></svg><span>Pusat kendali</span>
            <i class="sep"></i><span id="crumb-hal">Ringkasan</span>
            <i class="sep"></i><svg class="i"><use href="#i-clock"/></svg><span id="jam">—</span>
            <i class="sep"></i><span id="upd">memuat data…</span>
          </div>
          <h1><span id="judul-hal">Ringkasan</span> <span class="live mati" id="live-badge"><i></i><span id="live-txt">menyambung…</span></span></h1>
        </div>
        <div class="top-act">
          <button class="btn sm" id="btn-muat" data-act="muat" aria-label="Segarkan data"><svg class="i"><use href="#i-refresh"/></svg><span class="btn-txt"> Segarkan</span></button>
        </div>
      </div>
    </header>

    <div class="wrap">

      <!-- ============ HALAMAN: RINGKASAN ============ -->
      <section class="page on" id="hal-ringkas">
        <div class="hero">
          <div class="hero-ic"><svg class="i"><use href="#i-gauge"/></svg></div>
          <div class="hero-tx">
            <h2>Ringkasan sistem</h2>
            <p>Sekilas keadaan seluruh logbook: jumlah akun, entri kegiatan &amp; belanja,
            berkas yang sudah masuk, dan berapa perangkat yang sedang login saat ini.
            Angka menyegarkan diri otomatis — tidak perlu memuat ulang halaman.</p>
          </div>
        </div>

        <div class="stats" id="statistik"></div>

        <div class="tiles" id="pintasan"></div>

        <div class="card">
          <div class="row spread">
            <h2><svg class="i"><use href="#i-scroll"/></svg> Aktivitas panel terbaru</h2>
            <button class="btn sm" data-page="audit"><svg class="i"><use href="#i-scroll"/></svg> Lihat semua</button>
          </div>
          <div class="audit" id="audit-mini"></div>
        </div>

        <div class="foot">Pusat kendali · akses terbatas &amp; teraudit</div>
      </section>

      <!-- ============ HALAMAN: AKUN PENGGUNA ============ -->
      <section class="page" id="hal-akun">
        <div class="hero">
          <div class="hero-ic"><svg class="i"><use href="#i-users"/></svg></div>
          <div class="hero-tx">
            <h2>Akun pengguna <span class="tag" id="jml-user"></span></h2>
            <p>Semua akun terdaftar — tim, fasilitator, dan dosen pendamping. Dari sini kamu bisa
            membuka seluruh datanya, mengatur pendamping tim, mengganti username, menyetel ulang
            password, mengeluarkan perangkat, sampai menghapus akun.</p>
          </div>
          <div class="hero-act">
            <span class="search"><svg class="i"><use href="#i-search"/></svg>
            <input id="cari" placeholder="Cari username…"><kbd>/</kbd></span>
            <button class="btn p" data-act="baru" title="Buat akun baru tanpa kode pendaftaran">
              <svg class="i"><use href="#i-user"/></svg> Akun baru
            </button>
          </div>
        </div>

        <div class="card" id="sec-akun">
          <div class="tabs">
            <button class="on" data-role-tab="tim">👥 Tim</button>
            <button data-role-tab="fasilitator">🎓 Fasilitator</button>
            <button data-role-tab="dosen">👨‍🏫 Dosen Pendamping</button>
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

        <div class="foot">Pusat kendali · akses terbatas &amp; teraudit</div>
      </section>

      <!-- ============ HALAMAN: PERANGKAT & SESI ============
           Berlaku untuk SEMUA peran (tim, fasilitator, dosen pendamping).
           Hanya di panel inilah IP ditampilkan penuh; pemilik akun di halaman
           Profil tetap melihat versi tersamar (114.120.•.•). -->
      <section class="page" id="hal-sesi">
        <div class="hero">
          <div class="hero-ic"><svg class="i"><use href="#i-device"/></svg></div>
          <div class="hero-tx">
            <h2>Perangkat &amp; sesi</h2>
            <p>Siapa saja yang sedang login, dari perangkat apa, dan sejak kapan — bisa dilihat
            menyeluruh atau ditelusuri per akun. Alamat IP tampil penuh di sini dan hanya tersimpan
            selama sesinya hidup (ikut terhapus saat dicabut atau kedaluwarsa 30 hari menganggur).
            <b>Alamat MAC tidak bisa dilihat</b> aplikasi web mana pun — ia tidak pernah ikut
            melewati internet.</p>
          </div>
          <div class="hero-act">
            <span class="search"><svg class="i"><use href="#i-search"/></svg>
            <input id="cari-sesi" placeholder="Cari akun / perangkat / IP…"></span>
          </div>
        </div>

        <div class="stats" id="stat-sesi"></div>

        <div class="card">
          <div class="row spread" style="gap:12px">
            <div class="seg" id="seg-sesi">
              <button class="on" data-mode-sesi="semua"><svg class="i"><use href="#i-device"/></svg> Keseluruhan</button>
              <button data-mode-sesi="akun"><svg class="i"><use href="#i-users"/></svg> Per akun</button>
            </div>
            <div class="fchips" id="fil-peran"></div>
          </div>

          <!-- mode: keseluruhan (satu baris per perangkat) -->
          <div id="sesi-semua">
            <div class="tbl">
              <table>
                <thead><tr>
                  <th>Akun</th><th>Status</th><th>Perangkat</th><th>Alamat IP</th>
                  <th>Terakhir aktif</th><th>Mulai login</th>
                  <th style="text-align:right">Aksi</th>
                </tr></thead>
                <tbody id="t-sesi"></tbody>
              </table>
            </div>
          </div>

          <!-- mode: per akun (termasuk akun yang sedang TIDAK login) -->
          <div id="sesi-akun" class="hide">
            <div id="daftar-akun-sesi"></div>
          </div>
        </div>

        <div class="foot">Pusat kendali · akses terbatas &amp; teraudit</div>
      </section>

      <!-- ============ HALAMAN: JEJAK AUDIT ============ -->
      <section class="page" id="hal-audit">
        <div class="hero">
          <div class="hero-ic"><svg class="i"><use href="#i-scroll"/></svg></div>
          <div class="hero-tx">
            <h2>Jejak audit <span class="tag" id="jml-audit"></span></h2>
            <p>Catatan setiap aksi yang pernah dilakukan lewat pusat kendali — termasuk percobaan
            login yang gagal. Tersimpan di database dan tidak bisa diubah dari panel.</p>
          </div>
          <div class="hero-act">
            <select id="audit-n" style="width:auto;margin:0">
              <option value="60">60 baris</option>
              <option value="200" selected>200 baris</option>
              <option value="500">500 baris</option>
            </select>
          </div>
        </div>

        <div class="card">
          <div class="fchips" id="fil-audit"></div>
          <div class="audit" id="audit"></div>
        </div>

        <div class="foot">Pusat kendali · akses terbatas &amp; teraudit</div>
      </section>

      <!-- ============ HALAMAN: PENGATURAN ============ -->
      <section class="page" id="hal-pengaturan">
        <div class="hero">
          <div class="hero-ic"><svg class="i"><use href="#i-cog"/></svg></div>
          <div class="hero-tx">
            <h2>Pengaturan</h2>
            <p>Kode pendaftaran pendamping dan kredensial panel ini. Semua nilai disimpan sebagai
            hash satu arah — tidak pernah bisa dibaca lagi, hanya bisa diganti.</p>
          </div>
        </div>

        <div class="grid2">
          <div>
            <div class="card">
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
              <h2>👨‍🏫 Kode pendaftaran dosen pendamping <span class="tag" id="kode-status-dosen">—</span></h2>
              <p class="mut" style="margin-top:8px">Dosen pendamping bisa melihat &amp; mengomentari seperti
              fasilitator, <b>plus memberi ACC / meminta revisi</b> pada kegiatan, belanja, dan laporan tim
              yang ditugaskan. Kode disimpan sebagai hash — hanya bisa diganti.</p>
              <form id="f-kode-dosen">
                <label>Kode baru (min. 6 karakter)
                  <span class="in-wrap"><svg class="i"><use href="#i-key"/></svg>
                  <input id="k-val-dosen" autocomplete="off" placeholder="kode rahasia dosen"></span>
                </label>
                <button class="btn p" style="margin-top:14px"><svg class="i"><use href="#i-save"/></svg> Simpan kode</button>
              </form>
            </div>
          </div>
          <div>
            <div class="card">
              <h2>👥 Pendaftaran akun Tim <span class="tag" id="daftar-status">—</span></h2>
              <p class="mut" style="margin-top:8px" id="daftar-ket">Memuat status…</p>
              <p class="mut" style="margin-top:6px">Tutup bila semua tim sudah terdaftar supaya tidak ada akun
              liar. Pendaftaran fasilitator &amp; dosen tidak terpengaruh (tetap memakai kode di samping).
              Perubahan berlaku seketika dan tercatat di jejak audit.</p>
              <button class="btn" id="btn-daftar" type="button" style="margin-top:14px" data-buka="1">
                <svg class="i"><use href="#i-lock"/></svg> Tutup pendaftaran tim
              </button>
            </div>
            <div class="card">
              <h2><svg class="i"><use href="#i-lock"/></svg> Akun admin</h2>
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

        <div class="foot">Pusat kendali · akses terbatas &amp; teraudit</div>
      </section>

    </div>
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
      <button data-tab="pre">📽️ Presentasi</button>
      <button data-tab="ses">🖥️ Perangkat</button>
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

<!-- ===== DIALOG ASSIGN PENDAMPING KE TIM ===== -->
<dialog id="d-fas" class="mini">
  <div class="dlg-h"><h3>🎓 Pendamping tim</h3></div>
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

<!-- ===== DIALOG AKUN BARU ===== -->
<dialog id="d-baru" class="mini">
  <div class="dlg-h"><h3>➕ Buat akun baru</h3></div>
  <div class="dlg-b">
    <p class="mut">Akun dibuat langsung tanpa kode pendaftaran. Sampaikan kredensialnya
    secara pribadi, lalu minta pemiliknya mengganti password lewat menu profil.</p>
    <form method="dialog" id="f-baru">
      <label>Username (min. 3 karakter)
        <span class="in-wrap"><svg class="i"><use href="#i-user"/></svg>
        <input id="d-baru-u" autocomplete="off" placeholder="mis. Tim Riset Pesisir"></span>
      </label>
      <label>Password (min. 8 karakter)
        <span class="in-wrap"><svg class="i"><use href="#i-key"/></svg>
        <input id="d-baru-p" autocomplete="off" placeholder="password awal"></span>
      </label>
      <label>Peran
        <select id="d-baru-r">
          <option value="tim">👥 Tim (default)</option>
          <option value="fasilitator">🎓 Fasilitator</option>
          <option value="dosen">👨‍🏫 Dosen Pendamping</option>
        </select>
      </label>
      <div class="row" style="justify-content:flex-end;margin-top:16px">
        <button value="batal" class="btn">Batal</button>
        <button value="ok" class="btn p">Buat akun</button>
      </div>
    </form>
  </div>
</dialog>

<!-- Dialog konfirmasi umum — pengganti confirm()/prompt() browser -->
<dialog id="d-konfirmasi" class="mini">
  <div class="dlg-h"><h3 id="d-konf-judul">Konfirmasi</h3></div>
  <div class="dlg-b">
    <p class="mut" id="d-konf-isi"></p>
    <form method="dialog" id="f-konfirmasi">
      <label id="d-konf-ketik-wrap" class="hide"><span id="d-konf-ketik-lbl">Ketik untuk melanjutkan</span>
        <span class="in-wrap"><svg class="i"><use href="#i-key"/></svg>
        <input id="d-konf-ketik" autocomplete="off"></span>
      </label>
      <div class="row" style="justify-content:flex-end;margin-top:16px">
        <button value="batal" class="btn" type="submit">Batal</button>
        <button value="ok" class="btn p" type="submit" id="d-konf-ok">Lanjutkan</button>
      </div>
    </form>
  </div>
</dialog>

<div id="toast"></div>

<script>
"use strict";

/* ---------- alamat dasar panel & halaman aktif ----------
 * Panel dipasang di path rahasia yang bisa diganti (mis. /pusat-kendali),
 * dan setiap layar punya URL sendiri (/pusat-kendali/sesi, /audit, dst).
 * Karena itu B (alamat dasar untuk seluruh panggilan API) harus dihitung
 * dengan MEMBUANG nama halaman dari path — kalau tidak, membuka
 * /pusat-kendali/sesi langsung akan membuat semua fetch menembak
 * /pusat-kendali/sesi/data/... dan gagal. */
var HALAMAN = ["ringkas", "akun", "sesi", "audit", "pengaturan"];
var B = location.pathname.replace(/\\/+$/, "");
var HAL = "ringkas";
(function(){
  var m = B.match(/\\/(akun|sesi|audit|pengaturan)$/);
  if (m) { HAL = m[1]; B = B.slice(0, B.length - m[1].length - 1); }
})();
/** URL rapi sebuah halaman — halaman ringkasan memakai akar panel. */
function urlHal(id){ return id === "ringkas" ? (B || "/") : B + "/" + id; }

var JUDUL = {
  ringkas:    ["Ringkasan", "gauge"],
  akun:       ["Akun pengguna", "users"],
  sesi:       ["Perangkat & sesi", "device"],
  audit:      ["Jejak audit", "scroll"],
  pengaturan: ["Pengaturan", "cog"]
};

var TOK = sessionStorage.getItem("mx") || "";
var USERS = [];
var DETAIL = null;
var AKTIVITAS = [];
var SESI = [];          // semua sesi aktif lintas akun (halaman Perangkat & sesi)
var SESI_USER = [];     // sesi milik akun yang dialog detailnya sedang dibuka
var AUDIT = [];         // baris audit terakhir (halaman Jejak audit + pratinjau)
var RINGKAS = null;     // hasil /data/ringkas terakhir
var TAB = "keg";
var VIEW_ROLE = "tim";  // tab aktif tabel akun: 'tim' | 'fasilitator' | 'dosen'
var MODE_SESI = "semua";// 'semua' (per perangkat) | 'akun' (dikelompokkan)
var PERAN_SESI = "";    // saringan peran di halaman sesi ("" = semua peran)
var BUKA_SESI = {};     // id akun yang kartunya sedang dibentangkan
var AUDIT_N = 200;      // jumlah baris audit yang diminta
var AUDIT_F = "";       // saringan awalan aksi audit ("" = semua)
var PERTAMA = true;     // data pertama belum tiba → tampilkan skeleton
var ES = null;          // EventSource siaran langsung
var muatTimer = null;   // debounce pembaruan live

function $(s){ return document.querySelector(s); }

/* ---------- render tanpa mengganggu posisi layar ----------
 * Panel menyegarkan data otomatis (SSE / polling 8 detik). Kalau isi elemen
 * ditimpa mentah-mentah dengan innerHTML, posisi scroll ikut lompat ke atas —
 * sangat mengganggu saat sedang membaca daftar panjang.
 *
 * setHTML() memecahkan itu dengan dua lapis:
 *   1. TIDAK menyentuh DOM sama sekali bila hasil render sama persis dengan
 *      render sebelumnya (dibandingkan lewat tanda tangan "kunci"), sehingga
 *      pembaruan berkala yang tidak membawa perubahan tidak terasa apa pun.
 *   2. Bila memang berubah, posisi scroll seluruh wadah induk yang bisa
 *      di-scroll (mis. .dlg-b) dan posisi scroll halaman disimpan lalu
 *      dikembalikan setelah konten baru dipasang.
 */
var SIG = {};                       // tanda tangan render terakhir per elemen
function setHTML(el, html, kunci){
  if (!el) return false;
  if (kunci) {
    if (SIG[kunci] === html) return false;   // tidak ada perubahan → biarkan
    SIG[kunci] = html;
  } else if (el.innerHTML === html) return false;

  var simpan = [], p = el;
  while (p && p.nodeType === 1) {
    if (p.scrollTop > 0) simpan.push([p, p.scrollTop]);
    p = p.parentElement;
  }
  var wy = window.scrollY || window.pageYOffset || 0;

  el.innerHTML = html;

  for (var i = 0; i < simpan.length; i++) simpan[i][0].scrollTop = simpan[i][1];
  if (wy) window.scrollTo(0, wy);
  return true;
}

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

/* jam live di topbar */
(function(){
  function tik(){
    var el = $("#jam");
    if (!el) return;
    var d = new Date();
    el.textContent = d.getDate() + " " + BLN[d.getMonth()] + " " + d.getFullYear() +
      " · " + dua(d.getHours()) + ":" + dua(d.getMinutes()) + ":" + dua(d.getSeconds());
  }
  tik();
  setInterval(tik, 1000);
})();

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
/* Sesi untuk <img>/tautan berkas/EventSource dikenali server lewat cookie
 * HttpOnly yang dipasang saat login — token TIDAK lagi ditempel di URL. */
function fotoUrl(k){ return B + "/berkas/" + encodeURIComponent(k); }

function lihatLogin(){
  TOK = ""; sessionStorage.removeItem("mx");
  if (ES) { ES.close(); ES = null; }
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  setLive(false);
  tutupSemuaDialog(); // jangan tinggalkan dialog menggantung saat sesi berakhir
  $("#v-app").classList.add("hide");
  $("#v-login").classList.remove("hide");
}
function lihatApp(){
  $("#v-login").classList.add("hide");
  $("#v-app").classList.remove("hide");
  keHalaman(HAL, false);   // hormati URL yang dibuka (mis. /pusat-kendali/sesi)
  muat();
  mulaiLive();
}

/* ---------- perpindahan halaman (History API) ----------
 * Panel tetap SATU dokumen, tetapi setiap layar punya URL sendiri sehingga
 * bisa di-bookmark, dibuka langsung, dan tombol Back/Forward peramban
 * bekerja seperti situs biasa — tanpa memuat ulang apa pun.
 * Data tidak ikut diminta ulang saat berpindah: halaman baru langsung
 * digambar dari data terakhir, lalu tetap disegarkan otomatis oleh SSE. */
function halDariPath(){
  var m = location.pathname.replace(/\\/+$/, "").match(/\\/(akun|sesi|audit|pengaturan)$/);
  return m ? m[1] : "ringkas";
}
function keHalaman(id, dorong){
  if (HALAMAN.indexOf(id) < 0) id = "ringkas";
  HAL = id;
  HALAMAN.forEach(function(h){
    var el = document.getElementById("hal-" + h);
    if (el) el.classList.toggle("on", h === id);
  });
  document.querySelectorAll(".side-nav a").forEach(function(a){
    a.classList.toggle("on", a.dataset.page === id);
  });
  var info = JUDUL[id] || JUDUL.ringkas;
  var jd = $("#judul-hal");   if (jd) jd.textContent = info[0];
  var cr = $("#crumb-hal");   if (cr) cr.textContent = info[0];
  document.title = info[0] + " · Pusat Kendali";
  if (dorong !== false && location.pathname.replace(/\\/+$/, "") !== urlHal(id)) {
    try { history.pushState({ hal: id }, "", urlHal(id)); } catch(e){}
  }
  window.scrollTo(0, 0);
  render();
}
window.addEventListener("popstate", function(e){
  keHalaman((e.state && e.state.hal) || halDariPath(), false);
});

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
  ES = new EventSource(B + "/events");
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
    call("/data/pengguna/" + id + "/aktivitas"),
    call("/data/pengguna/" + id + "/sesi").catch(function(){ return { rows: [] }; })
  ]).then(function(rs){
    if (!$("#d-detail").open || !DETAIL || DETAIL.user.id !== id) return;
    DETAIL = rs[0]; AKTIVITAS = rs[1].rows || []; SESI_USER = rs[2].rows || [];
    isiKepalaDetail();
    renderTab();
  }).catch(function(){});
}

/* ---------- muat data ---------- *
 * SATU sumber kebenaran: semua halaman digambar dari variabel hasil muat()
 * di bawah. Pemuatan ini dipanggil manual (tombol Segarkan) MAUPUN otomatis
 * oleh siaran langsung SSE / polling — jadi halaman mana pun yang sedang
 * dibuka selalu memperlihatkan keadaan terkini tanpa perlu di-refresh. */
var KODE = { fas: { ada: false }, dosen: { ada: false } };
var DAFTAR_TIM = { buka: true, updatedAt: "" }; // status pendaftaran akun tim

function muat(){
  var rb = $("#btn-muat"); if (rb) rb.classList.add("memuat");
  return Promise.all([
    call("/data/ringkas"),
    call("/data/pengguna"),
    call("/data/audit?n=" + AUDIT_N + (AUDIT_F ? "&aksi=" + encodeURIComponent(AUDIT_F) : "")),
    call("/data/kode-fasilitator").catch(function(){ return { ada:false, updatedAt:"" }; }),
    call("/data/kode-dosen").catch(function(){ return { ada:false, updatedAt:"" }; }),
    call("/data/sesi").catch(function(){ return { rows: [] }; }),
    call("/data/pendaftaran-tim").catch(function(){ return { buka: true, updatedAt: "" }; })
  ])
    .then(function(rs){
      RINGKAS = rs[0];
      USERS   = rs[1].users || [];
      AUDIT   = rs[2].rows || [];
      KODE    = { fas: rs[3], dosen: rs[4] };
      SESI    = rs[5].rows || [];
      DAFTAR_TIM = rs[6] || { buka: true, updatedAt: "" };
      PERTAMA = false;
      render();
      var up = $("#upd");
      if (up) {
        var d = new Date();
        up.textContent = "diperbarui " + dua(d.getHours()) + ":" + dua(d.getMinutes()) + ":" + dua(d.getSeconds());
      }
    })
    .catch(function(e){ toast(e.message, true); })
    .finally(function(){ if (rb) rb.classList.remove("memuat"); });
}

/** Gambar ulang seluruh panel dari data terakhir (murah — lihat setHTML). */
function render(){
  if (PERTAMA) { renderSkeleton(); return; }
  renderStat();
  renderPintasan();
  renderAuditMini();
  renderKode();
  if (HAL === "akun")  renderUsers();
  if (HAL === "sesi")  renderSesi();
  if (HAL === "audit") renderAudit();
}

/** Kerangka abu-abu saat data pertama belum tiba (menghindari layar kosong). */
function renderSkeleton(){
  var s = "";
  for (var i = 0; i < 6; i++) s += '<div class="skel stat"></div>';
  setHTML($("#statistik"), s, "statistik");
  var baris = '<tr><td colspan="7" style="padding:14px"><span class="skel row"></span>' +
    '<span class="skel row"></span><span class="skel row"></span></td></tr>';
  setHTML($("#t-users"), baris, "t-users");
  setHTML($("#t-sesi"), baris.replace('colspan="7"', 'colspan="6"'), "t-sesi");
}

function renderStat(){
  var ov = RINGKAS; if (!ov) return;
  var nPendamping = (ov.fasilitator || 0) + (ov.dosen || 0);
  var html =
    stat("users","Akun tim",(ov.users - nPendamping),"s1") + stat("cal","Total kegiatan",ov.kegiatan,"s2") +
    stat("coins","Total belanja",ov.keuangan,"s3") + stat("zap","Sesi aktif",ov.sesi,"s4") +
    stat("user","Fasilitator",(ov.fasilitator||0),"s5") + stat("user","Dosen pendamping",(ov.dosen||0),"s2") +
    stat("save","Entri ter-ACC",(ov.acc||0),"s3") + stat("folder","Laporan tim",(ov.laporan||0),"s6") +
    stat("folder","Presentasi tim",(ov.presentasi||0),"s5");
  // Angka hanya dianimasikan ulang bila nilainya memang berubah
  if (setHTML($("#statistik"), html, "statistik")) {
    document.querySelectorAll("#statistik b[data-n]").forEach(function(b){
      hitungNaik(b, Number(b.dataset.n));
    });
  }
  var ju = $("#jml-user"); if (ju) ju.textContent = ov.users + " akun";
}

/** Kartu pintasan di halaman Ringkasan — pintu masuk ke tiap halaman. */
function renderPintasan(){
  var online = akunOnline();
  var nTim = USERS.filter(function(u){ return !isPendamping(u.role || "tim"); }).length;
  var html =
    tile("users","s1","akun","Akun pengguna",
      USERS.length + " akun terdaftar · " + nTim + " di antaranya akun tim") +
    tile("device","s4","sesi","Perangkat & sesi",
      online.length + " akun sedang login di " + SESI.length + " perangkat") +
    tile("scroll","s3","audit","Jejak audit",
      "Riwayat setiap aksi yang pernah dilakukan lewat pusat kendali") +
    tile("cog","s5","pengaturan","Pengaturan",
      "Kode pendaftaran pendamping & kredensial panel ini");
  setHTML($("#pintasan"), html, "pintasan");
}
function tile(ic, cls, page, judul, ket){
  return '<button class="tile ' + cls + '" data-page="' + page + '">' +
    '<div class="th-row"><span class="ic">' + sv(ic) + "</span><b>" + esc(judul) + "</b></div>" +
    "<span>" + esc(ket) + "</span>" +
    '<span class="go">Buka ' + sv("chev") + "</span></button>";
}

function renderKode(){
  function status(el, j){
    if (!el) return;
    el.textContent = j && j.ada
      ? "diset" + (j.updatedAt ? " · " + tgl(j.updatedAt) : "")
      : "belum diset";
  }
  status($("#kode-status"), KODE.fas);
  status($("#kode-status-dosen"), KODE.dosen);

  // Kartu pendaftaran akun tim (buka/tutup)
  var buka = DAFTAR_TIM.buka !== false;
  var tag = $("#daftar-status");
  if (tag) {
    tag.textContent = (buka ? "terbuka" : "ditutup") +
      (DAFTAR_TIM.updatedAt ? " · " + tgl(DAFTAR_TIM.updatedAt) : "");
    tag.className = "tag " + (buka ? "g" : "r");
  }
  var ket = $("#daftar-ket");
  if (ket) ket.textContent = buka
    ? "Siapa pun yang membuka halaman Daftar dapat membuat akun tim baru."
    : "Halaman Daftar menolak akun tim baru. Buat akun lewat tombol “Akun baru” di halaman Akun pengguna.";
  var tombol = $("#btn-daftar");
  if (tombol) {
    tombol.className = "btn " + (buka ? "" : "p");
    tombol.innerHTML = sv(buka ? "lock" : "unlock") +
      (buka ? " Tutup pendaftaran tim" : " Buka pendaftaran tim");
    tombol.dataset.buka = buka ? "1" : "0";
  }
}

/* ---------- jejak audit ---------- */
var FILTER_AUDIT = [
  ["", "Semua"], ["login.", "Login panel"], ["user.", "Akun"],
  ["panel.", "Kredensial panel"], ["fasilitator.", "Fasilitator"],
  ["dosen.", "Dosen"], ["tim.", "Tim"]
];
function renderAudit(){
  var tag = $("#jml-audit");
  if (tag) tag.textContent = AUDIT.length + " baris ditampilkan";
  setHTML($("#fil-audit"), FILTER_AUDIT.map(function(f){
    return '<button class="fchip' + (AUDIT_F === f[0] ? " on" : "") +
      '" data-fil-audit="' + f[0] + '">' + esc(f[1]) + "</button>";
  }).join(""), "fil-audit");
  setHTML($("#audit"), AUDIT.map(barisAudit).join("") ||
    '<div class="kosong"><div class="big">📜</div>Belum ada catatan untuk saringan ini.</div>', "audit");
}
function renderAuditMini(){
  setHTML($("#audit-mini"), AUDIT.slice(0, 10).map(barisAudit).join("") ||
    '<div class="mut" style="padding:10px 2px">Belum ada catatan.</div>', "audit-mini");
}
function barisAudit(r){
  var aksi = r.aksi || r.raw || "";
  return '<div class="row-a"><span class="t">' + esc(tglJam(r.ts)) + "</span>" +
    '<span class="badge ' + auditCls(aksi) + '">' + esc(aksi) + "</span>" +
    '<span class="tg">' + esc(namaTarget(r)) + "</span>" +
    (r.ip ? '<span class="ip">' + esc(r.ip) + "</span>" : "") + "</div>";
}

function stat(ic, lbl, v, cls, sub, extra){
  return '<div class="stat ' + cls + (extra ? " " + extra : "") + '"><div class="ic">' + sv(ic) + '</div><div class="tx">' +
    '<b data-n="' + Number(v || 0) + '">0</b><span class="lbl">' + lbl + '</span>' +
    (sub ? '<span class="sub">' + sub + '</span>' : '') + '</div></div>';
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

/* Peran pendamping (punya tabel & aksi yang sama, beda wewenang ACC). */
function isPendamping(role){ return role === "fasilitator" || role === "dosen"; }
function labelPeran(role){
  return role === "dosen" ? "👨‍🏫 dosen" : role === "fasilitator" ? "🎓 fasilitator" : "tim";
}

function renderUsers(){
  var q = ($("#cari").value || "").toLowerCase();
  var lihatPendamping = isPendamping(VIEW_ROLE);
  var rows = USERS.filter(function(u){
    var role = u.role || "tim";
    if (lihatPendamping ? role !== VIEW_ROLE : isPendamping(role)) return false;
    return u.username.toLowerCase().indexOf(q) >= 0;
  });
  var head = $("#t-users-head");
  if (head) {
    head.innerHTML = lihatPendamping
      ? "<th>Akun</th><th>Tim diampu</th><th>Sesi</th><th>Dibuat</th><th style='text-align:right'>Aksi</th>"
      : '<th>Akun</th><th class="num">Kegiatan</th><th class="num">Belanja</th>' +
        '<th class="num">Foto</th><th>Sesi</th><th>Aktivitas</th><th style="text-align:right">Aksi</th>';
  }
  var kolom = lihatPendamping ? 5 : 7;
  setHTML($("#t-users"), rows.map(lihatPendamping ? barisPendamping : barisUser).join("") ||
    '<tr><td colspan="' + kolom + '"><div class="kosong"><div class="big">' +
    (VIEW_ROLE === "dosen" ? "👨‍🏫" : VIEW_ROLE === "fasilitator" ? "🎓" : "🔍") + '</div>' +
    (lihatPendamping && !q
      ? "Belum ada akun " + (VIEW_ROLE === "dosen" ? "dosen pendamping" : "fasilitator") +
        ".<div class='mut' style='margin-top:6px'>Set kode pendaftaran di kartu bawah, lalu bagikan kodenya.</div>"
      : "Tidak ada akun yang cocok.") + "</div></td></tr>", "t-users");
}
function barisUser(u){
  var ini = (u.username || "?").charAt(0).toUpperCase();
  return "<tr>" +
    '<td class="sel-utama"><div class="u-cell"><span class="ava" style="' + avaStyle(u.username) + '">' + esc(ini) + '</span><div>' +
      "<b>" + esc(u.username) + "</b>" +
      (u.pemilikTemplate ? ' <span class="badge b">arsip</span>' : "") +
      (u.punya_laporan ? ' <span class="badge c">📄 laporan</span>' : "") +
      (u.punya_presentasi ? ' <span class="badge b">📽️ presentasi</span>' : "") +
      (u.n_fasilitator ? ' <span class="badge y">🎓 ' + u.n_fasilitator + '</span>' : "") +
      (u.n_dosen ? ' <span class="badge c">👨‍🏫 ' + u.n_dosen + '</span>' : "") +
      (u.n_acc ? ' <span class="badge g">✔ ' + u.n_acc + ' ACC</span>' : "") +
      (u.n_revisi ? ' <span class="badge r">↺ ' + u.n_revisi + ' revisi</span>' : "") +
      '<div class="mut">dibuat ' + tgl(u.createdAt) +
        (u.loginTerakhir ? " · login terakhir " + sejak(u.loginTerakhir) : " · belum pernah login") +
      "</div>" +
    "</div></div></td>" +
    '<td class="num" data-l="Kegiatan">' + u.kegiatan + "</td>" +
    '<td class="num" data-l="Belanja">' + u.keuangan + "</td>" +
    '<td class="num" data-l="Foto">' + u.foto + "</td>" +
    '<td data-l="Sesi">' + (u.sesi ? '<span class="badge g">' + u.sesi + " aktif</span>" : '<span class="mut">—</span>') + "</td>" +
    '<td data-l="Aktivitas" style="white-space:nowrap">' + tgl(u.aktivitasTerakhir) + "</td>" +
    '<td class="acts-cell"><div class="acts">' +
      '<button class="btn sm p" data-act="detail" data-id="' + u.id + '">' + sv("folder") + ' Data</button>' +
      '<button class="btn sm ic" title="Pendamping tim ini (fasilitator & dosen)" data-act="fas" data-id="' + u.id + '">🎓</button>' +
      '<button class="btn sm ic" title="Jejak aktivitas akun" data-act="akt-cepat" data-id="' + u.id + '">' + sv("scroll") + '</button>' +
      '<button class="btn sm ic" title="Ganti username" data-act="un" data-id="' + u.id + '">' + sv("edit") + '</button>' +
      '<button class="btn sm ic" title="Setel ulang password" data-act="pw" data-id="' + u.id + '">' + sv("key") + '</button>' +
      '<button class="btn sm ic" title="Keluarkan dari semua perangkat" data-act="sesi" data-id="' + u.id + '">' + sv("power") + '</button>' +
      '<button class="btn sm ic d" title="Hapus akun" data-act="hapus" data-id="' + u.id + '">' + sv("trash") + '</button>' +
    "</div></td></tr>";
}
function barisPendamping(u){
  var ini = (u.username || "?").charAt(0).toUpperCase();
  var role = u.role || "fasilitator";
  return "<tr>" +
    '<td class="sel-utama"><div class="u-cell"><span class="ava" style="' + avaStyle(u.username) + '">' + esc(ini) + '</span><div>' +
      "<b>" + esc(u.username) + "</b> <span class='badge " + (role === "dosen" ? "c" : "y") + "'>" +
      labelPeran(role) + "</span>" +
      (role === "dosen" ? ' <span class="badge g" title="Boleh memberi ACC / minta revisi">✔ ACC</span>' : "") +
      '<div class="mut">dibuat ' + tgl(u.createdAt) +
        (u.loginTerakhir ? " · login terakhir " + sejak(u.loginTerakhir) : " · belum pernah login") +
      "</div>" +
    "</div></div></td>" +
    '<td data-l="Tim diampu">' + (u.n_tim_diampu
      ? '<span class="badge b">' + u.n_tim_diampu + " tim</span>"
      : '<span class="mut">belum di-assign</span>') + "</td>" +
    '<td data-l="Sesi">' + (u.sesi ? '<span class="badge g">' + u.sesi + " aktif</span>" : '<span class="mut">—</span>') + "</td>" +
    '<td data-l="Dibuat" style="white-space:nowrap">' + tgl(u.createdAt) + "</td>" +
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

/* ---------- perangkat & sesi aktif ---------- */
/** "baru saja" / "32 menit lalu" / "3 hari lalu" — seperti di halaman Profil. */
function sejak(iso){
  var t = Date.parse(iso || "");
  if (!t) return "—";
  var detik = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (detik < 90) return "baru saja";
  var menit = Math.round(detik / 60);
  if (menit < 60) return menit + " menit lalu";
  var jam = Math.round(menit / 60);
  if (jam < 24) return jam + " jam lalu";
  var hari = Math.round(jam / 24);
  if (hari <= 30) return hari + " hari lalu";
  return tgl(iso);
}
/** Ikon kasar sesuai jenis perangkat yang terbaca dari labelnya. */
function ikonSesi(label){
  var s = String(label || "").toLowerCase();
  if (s.indexOf("android") >= 0 || s.indexOf("iphone") >= 0) return "📱";
  if (s.indexOf("ipad") >= 0) return "📲";
  if (s) return "🖥️";
  return "❔";
}
/** Peramban yang sengaja menyamar sebagai Chrome → beri catatan. */
function catatanPerangkat(label){
  if (!label) {
    return '<div class="mut">sesi lama — dibuat sebelum pencatatan perangkat aktif</div>';
  }
  if (/^Brave/.test(label)) {
    return '<div class="mut">Brave (menyamar sebagai Chrome di User-Agent)</div>';
  }
  return "";
}
/* ---------- halaman Perangkat & sesi ----------
 * Dua sudut pandang atas data yang sama:
 *   • "Keseluruhan" — satu baris per PERANGKAT yang sedang login.
 *   • "Per akun"    — dikelompokkan per AKUN, termasuk akun yang sedang
 *                     offline, lengkap dengan kapan ia terakhir login dan
 *                     (untuk tim) siapa saja pendampingnya.
 * Keduanya ikut menyegarkan diri lewat siaran langsung/polling. */

/** Kata kunci pencarian di halaman sesi (huruf kecil). */
function cariSesi(){ return ($("#cari-sesi") && $("#cari-sesi").value || "").toLowerCase(); }

/** Sesi setelah saringan peran + pencarian diterapkan. */
function sesiTersaring(){
  var cari = cariSesi();
  return SESI.filter(function(s){
    if (PERAN_SESI && (s.role || "tim") !== PERAN_SESI) return false;
    if (!cari) return true;
    return ((s.username || "") + " " + (s.perangkat || "") + " " + (s.ip || ""))
      .toLowerCase().indexOf(cari) >= 0;
  });
}
/** Sesi aktif dikelompokkan per id akun. */
function sesiPerAkun(){
  var peta = {};
  SESI.forEach(function(s){ (peta[s.user_id] = peta[s.user_id] || []).push(s); });
  return peta;
}
/** Daftar id akun yang punya minimal satu perangkat login. */
function akunOnline(){
  var peta = {};
  SESI.forEach(function(s){ peta[s.user_id] = true; });
  return Object.keys(peta);
}

/* ---------- Kehadiran nyata (denyut tab) ----------
 * Server menandai tiap sesi dengan "membuka" (tab aplikasi terbuka, denyut
 * < 90 dtk) dan "layar" ('terlihat' | 'tersembunyi'). Ini beda dengan
 * "login" (sesi ada) — seseorang bisa login di 3 perangkat tapi hanya SATU
 * yang benar-benar sedang dibuka. */

/** Lencana kehadiran satu sesi. */
function lencanaSesi(s){
  if (s.membuka && s.layar === "tersembunyi")
    return '<span class="st idle" title="Aplikasi terbuka di tab latar belakang"><i></i>tab di latar</span>';
  if (s.membuka)
    return '<span class="st on" title="Tab aplikasi sedang terbuka di perangkat ini"><i></i>sedang membuka</span>';
  return '<span class="st dim" title="Masih login, tetapi aplikasi tidak sedang dibuka"><i></i>tidak membuka</span>';
}
/** Tingkat kehadiran sebuah akun dari daftar sesinya: 2 = membuka, 1 = login saja, 0 = offline. */
function tingkatAkun(list){
  if (!list || !list.length) return 0;
  return list.some(function(s){ return s.membuka; }) ? 2 : 1;
}

function renderSesi(){
  renderStatSesi();
  renderFilterPeran();
  var a = $("#sesi-semua"), b = $("#sesi-akun");
  if (a) a.classList.toggle("hide", MODE_SESI !== "semua");
  if (b) b.classList.toggle("hide", MODE_SESI !== "akun");
  document.querySelectorAll("[data-mode-sesi]").forEach(function(x){
    x.classList.toggle("on", x.dataset.modeSesi === MODE_SESI);
  });
  if (MODE_SESI === "semua") renderTabelSesi(); else renderAkunSesi();
}

/** Kartu ringkas di kepala halaman: berapa perangkat & siapa yang online. */
function renderStatSesi(){
  var peta = sesiPerAkun();
  var online = { tim: 0, fasilitator: 0, dosen: 0 };
  var total = 0, membuka = 0;
  USERS.forEach(function(u){
    if (!(peta[u.id] && peta[u.id].length)) return;
    var role = u.role || "tim";
    if (online[role] == null) role = "tim";
    online[role]++; total++;
    if (tingkatAkun(peta[u.id]) === 2) membuka++;
  });
  var perangkatMembuka = SESI.filter(function(s){ return s.membuka; }).length;
  var perangkatLatar = SESI.filter(function(s){ return s.membuka && s.layar === "tersembunyi"; }).length;
  // 6 kartu → grid 3×2 rapi (rincian peran jadi sub-teks, bukan kartu terpisah)
  var html =
    stat("gauge","Sedang membuka", membuka, "s4",
      perangkatMembuka + " tab terbuka" + (perangkatLatar ? " · " + perangkatLatar + " di latar" : ""),
      membuka ? "hidup" : "") +
    stat("users","Akun login", total, "s1",
      "👥 " + online.tim + " · 🎓 " + online.fasilitator + " · 👨‍🏫 " + online.dosen) +
    stat("device","Perangkat login", SESI.length, "s2",
      Math.max(0, SESI.length - perangkatMembuka) + " tidak sedang membuka") +
    stat("user","Tim login", online.tim, "s5") +
    stat("user","Pendamping login", online.fasilitator + online.dosen, "s3",
      "🎓 " + online.fasilitator + " · 👨‍🏫 " + online.dosen) +
    stat("power","Akun offline", Math.max(0, USERS.length - total), "s6",
      "dari " + USERS.length + " akun");
  if (setHTML($("#stat-sesi"), html, "stat-sesi")) {
    document.querySelectorAll("#stat-sesi b[data-n]").forEach(function(b){
      hitungNaik(b, Number(b.dataset.n));
    });
  }
}

/** Chip penyaring peran — angkanya mengikuti jumlah perangkat login. */
function renderFilterPeran(){
  var n = { "": SESI.length, tim: 0, fasilitator: 0, dosen: 0 };
  SESI.forEach(function(s){
    var r = s.role || "tim";
    if (n[r] == null) r = "tim";
    n[r]++;
  });
  var daftar = [["", "Semua peran"], ["tim", "👥 Tim"],
    ["fasilitator", "🎓 Fasilitator"], ["dosen", "👨‍🏫 Dosen"]];
  setHTML($("#fil-peran"), daftar.map(function(f){
    return '<button class="fchip' + (PERAN_SESI === f[0] ? " on" : "") +
      '" data-peran-sesi="' + f[0] + '">' + esc(f[1]) +
      '<span class="n">' + (n[f[0]] || 0) + "</span></button>";
  }).join(""), "fil-peran");
}

/** Mode "Keseluruhan": satu baris per perangkat. */
function renderTabelSesi(){
  var el = $("#t-sesi");
  if (!el) return;
  var rows = sesiTersaring().slice().sort(function(a, b){
    // sedang membuka (layar terlihat) → tab di latar → login saja; sisanya urutan server
    var ra = a.membuka ? (a.layar === "tersembunyi" ? 1 : 2) : 0;
    var rb = b.membuka ? (b.layar === "tersembunyi" ? 1 : 2) : 0;
    return rb - ra;
  });
  setHTML(el, rows.map(barisSesi).join("") ||
    '<tr><td colspan="7"><div class="kosong"><div class="big">🖥️</div>' +
    (cariSesi() || PERAN_SESI ? "Tidak ada sesi yang cocok dengan saringan ini."
                              : "Belum ada perangkat yang sedang login.") +
    "</div></td></tr>", "t-sesi");
}

/** Mode "Per akun": semua akun — yang online lebih dulu. */
function renderAkunSesi(){
  var peta = sesiPerAkun();
  var cari = cariSesi();
  var rows = USERS.filter(function(u){
    var role = u.role || "tim";
    if (PERAN_SESI && role !== PERAN_SESI) return false;
    if (!cari) return true;
    var teks = u.username + " " + (peta[u.id] || []).map(function(s){
      return (s.perangkat || "") + " " + (s.ip || "");
    }).join(" ");
    return teks.toLowerCase().indexOf(cari) >= 0;
  });
  // Urutan: sedang MEMBUKA dulu, lalu yang login saja, lalu yang paling baru login.
  rows.sort(function(a, b){
    var ta = tingkatAkun(peta[a.id]), tb = tingkatAkun(peta[b.id]);
    if (ta !== tb) return tb - ta;
    var na = (peta[a.id] || []).length, nb = (peta[b.id] || []).length;
    if (na !== nb) return nb - na;
    return String(b.loginTerakhir || "").localeCompare(String(a.loginTerakhir || ""));
  });
  setHTML($("#daftar-akun-sesi"), rows.map(function(u){
    return kartuAkunSesi(u, peta[u.id] || []);
  }).join("") ||
    '<div class="kosong"><div class="big">👥</div>Tidak ada akun yang cocok dengan saringan ini.</div>',
    "akun-sesi");
}

/** Satu kartu akun: status kehadiran, login terakhir, pendamping, perangkatnya. */
function kartuAkunSesi(u, list){
  var role = u.role || "tim";
  var online = list.length > 0;
  var tingkat = tingkatAkun(list);            // 2 membuka · 1 login saja · 0 offline
  var nMembuka = list.filter(function(s){ return s.membuka; }).length;
  var buka = !!BUKA_SESI[u.id];
  var ini = (u.username || "?").charAt(0).toUpperCase();
  var kelas = role === "dosen" ? "c" : role === "fasilitator" ? "y" : "b";

  var meta = [];
  if (tingkat === 2) {
    meta.push("sedang membuka aplikasi" + (nMembuka > 1 ? " di " + nMembuka + " perangkat" : ""));
  } else if (online) {
    meta.push("login, tidak membuka · aktif " + sejak((list[0] || {}).terakhir));
  } else {
    meta.push(u.loginTerakhir ? "login terakhir " + sejak(u.loginTerakhir) : "belum pernah login");
  }
  if (isPendamping(role)) {
    meta.push(u.n_tim_diampu ? "mengampu " + u.n_tim_diampu + " tim" : "belum di-assign tim");
  } else {
    var p = u.pengampu || [];
    meta.push(p.length
      ? "pendamping: " + p.map(function(x){ return x.username; }).join(", ")
      : "belum punya pendamping");
  }
  meta.push("dibuat " + tgl(u.createdAt));

  var isi = "";
  if (buka) {
    isi = '<div class="asx-b">' + (list.length
      ? list.map(barisPerangkat).join("")
      : '<div class="mut" style="padding:13px 2px">Akun ini sedang tidak login di perangkat mana pun.' +
        (u.loginTerakhir ? " Terakhir login " + esc(tglJam(u.loginTerakhir)) + "." : "") + "</div>") +
      "</div>";
  }

  var statusKepala = tingkat === 2
    ? '<span class="st on kecil"><i></i>Online · ' + list.length + " perangkat</span>"
    : online
      ? '<span class="st dim kecil" title="Login di ' + list.length + ' perangkat, aplikasi tidak sedang dibuka"><i></i>Login · ' + list.length + " perangkat</span>"
      : '<span class="st off"><i></i>offline</span>';

  return '<div class="asx' + (online ? " aktif" : "") + (tingkat === 2 ? " membuka" : "") + (buka ? " buka" : "") + '">' +
    '<div class="asx-h" data-act="lipat" data-id="' + u.id + '">' +
      '<span class="ava" style="' + avaStyle(u.username) + '">' + esc(ini) + "</span>" +
      '<div class="asx-nm"><b>' + esc(u.username) +
        ' <span class="badge ' + kelas + '">' + labelPeran(role) + "</span>" +
        (role === "dosen" ? ' <span class="badge g" title="Boleh memberi ACC / minta revisi">✔ ACC</span>' : "") +
      "</b>" +
      '<div class="asx-meta">' + meta.map(function(m, i){
        return (i ? '<i class="dot"></i>' : "") + "<span>" + esc(m) + "</span>";
      }).join("") + "</div></div>" +
      '<div class="asx-act">' +
        statusKepala +
        '<button class="btn sm p" data-act="detail" data-id="' + u.id + '">' + sv("folder") + " Data</button>" +
        (isPendamping(role)
          ? '<button class="btn sm ic" title="Tim yang diampu" data-act="tim" data-id="' + u.id + '">🔗</button>'
          : '<button class="btn sm ic" title="Pendamping tim ini" data-act="fas" data-id="' + u.id + '">🎓</button>') +
        (online ? '<button class="btn sm ic d" title="Keluarkan dari semua perangkat" data-act="sesi" data-id="' +
          u.id + '">' + sv("power") + "</button>" : "") +
        '<button class="asx-tgl" data-act="lipat" data-id="' + u.id +
          '" title="' + (buka ? "Sembunyikan" : "Lihat") + ' perangkat" aria-expanded="' + buka + '">' +
          sv("chev") + "</button>" +
      "</div></div>" + isi + "</div>";
}

/** Satu perangkat di dalam kartu akun. */
function barisPerangkat(s){
  return '<div class="dev">' +
    '<span class="dev-ic">' + ikonSesi(s.perangkat) + "</span>" +
    '<div class="dev-nm"><b>' +
      (s.perangkat ? esc(s.perangkat) : '<span class="mut">Perangkat tidak dikenal</span>') + "</b>" +
      catatanPerangkat(s.perangkat) +
      '<span class="dev-st">' + lencanaSesi(s) + "</span></div>" +
    '<span class="dev-ip">' + (s.ip ? esc(s.ip) : "IP tidak terekam") + "</span>" +
    '<div class="dev-tm">' + esc(sejak(s.terakhir)) +
      '<div class="mut">mulai ' + esc(tgl(s.dibuat)) + "</div></div>" +
    '<div class="dev-act">' +
      '<button class="btn sm ic d" title="Keluarkan perangkat ini" data-act="sesi-satu" ' +
      'data-sid="' + esc(s.id) + '" data-nama="' + esc(s.username) + '">' + sv("power") + "</button>" +
    "</div></div>";
}
function barisSesi(s){
  var ini = (s.username || "?").charAt(0).toUpperCase();
  var role = s.role || "tim";
  return "<tr>" +
    '<td class="sel-utama"><div class="u-cell"><span class="ava" style="' + avaStyle(s.username) + '">' + esc(ini) + '</span><div>' +
      "<b>" + esc(s.username) + "</b> " +
      '<span class="badge ' + (role === "dosen" ? "c" : role === "fasilitator" ? "y" : "b") + '">' +
      labelPeran(role) + "</span>" +
    "</div></div></td>" +
    '<td data-l="Status" class="st-cell">' + lencanaSesi(s) + "</td>" +
    '<td data-l="Perangkat">' + ikonSesi(s.perangkat) + " " +
      (s.perangkat ? "<b>" + esc(s.perangkat) + "</b>" : '<span class="mut">Perangkat tidak dikenal</span>') +
      catatanPerangkat(s.perangkat) + "</td>" +
    '<td data-l="Alamat IP" style="white-space:nowrap">' + (s.ip
      ? "<code>" + esc(s.ip) + "</code>" + (s.penuh ? "" : ' <span class="badge b" title="Sesi lama: hanya tersimpan versi tersamar">samar</span>')
      : '<span class="mut">tidak terekam</span>') + "</td>" +
    '<td data-l="Terakhir aktif" style="white-space:nowrap">' + esc(sejak(s.terakhir)) +
      '<div class="mut">' + esc(tglJam(s.terakhir)) + "</div></td>" +
    '<td data-l="Mulai login" style="white-space:nowrap">' + esc(tgl(s.dibuat)) + "</td>" +
    '<td class="acts-cell"><div class="acts">' +
      '<button class="btn sm ic d" title="Keluarkan perangkat ini" data-act="sesi-satu" ' +
      'data-sid="' + esc(s.id) + '" data-nama="' + esc(s.username) + '">' + sv("power") + '</button>' +
    "</div></td></tr>";
}
/** Tabel sesi di dalam dialog detail satu akun. */
function tabelSesiUser(list){
  if (!list.length) {
    return '<div class="kosong"><div class="big">🖥️</div>Akun ini sedang tidak login di perangkat mana pun.</div>';
  }
  var out = '<div class="tbl" style="margin-top:14px"><table><thead><tr>' +
    "<th>Perangkat</th><th>Alamat IP</th><th>Terakhir aktif</th><th>Mulai login</th>" +
    '<th style="text-align:right">Aksi</th></tr></thead><tbody>';
  list.forEach(function(s){
    out += "<tr>" +
      '<td class="sel-utama">' + ikonSesi(s.perangkat) + " " +
        (s.perangkat ? "<b>" + esc(s.perangkat) + "</b>" : '<span class="mut">Perangkat tidak dikenal</span>') +
        catatanPerangkat(s.perangkat) + "</td>" +
      '<td data-l="Alamat IP" style="white-space:nowrap">' + (s.ip ? "<code>" + esc(s.ip) + "</code>" : '<span class="mut">tidak terekam</span>') + "</td>" +
      '<td data-l="Terakhir aktif" style="white-space:nowrap">' + esc(sejak(s.terakhir)) +
        '<div class="mut">' + esc(tglJam(s.terakhir)) + "</div></td>" +
      '<td data-l="Mulai login" style="white-space:nowrap">' + esc(tgl(s.dibuat)) + "</td>" +
      '<td class="acts-cell"><div class="acts">' +
        '<button class="btn sm ic d" title="Keluarkan perangkat ini" data-act="sesi-satu" ' +
        'data-sid="' + esc(s.id) + '" data-nama="' + esc(s.username) + '">' + sv("power") + '</button>' +
      "</div></td></tr>";
  });
  return out + "</tbody></table></div>";
}

/* ---------- detail data pengguna ---------- */
/** Gulirkan isi dialog detail kembali ke atas (saat dibuka / ganti tab). */
function keAtasDetail(){
  var b = document.querySelector("#d-detail .dlg-b");
  if (b) b.scrollTop = 0;
}
function bukaDetail(id, tabAwal){
  Promise.all([
    call("/data/pengguna/" + id),
    call("/data/pengguna/" + id + "/aktivitas").catch(function(){ return { rows: [] }; }),
    call("/data/pengguna/" + id + "/sesi").catch(function(){ return { rows: [] }; })
  ]).then(function(rs){
    DETAIL = rs[0]; AKTIVITAS = rs[1].rows || []; SESI_USER = rs[2].rows || [];
    TAB = tabAwal || "keg";
    isiKepalaDetail();
    var tb = document.querySelectorAll("#d-detail .tabs button");
    tb.forEach(function(b){ b.classList.toggle("on", b.dataset.tab === TAB); });
    renderTab();
    keAtasDetail();
    bukaDialog($("#d-detail"));
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
  setHTML($("#dt-chips"),
    chip("ungu","Capaian", r.capaian_total + "%") +
    chip("biru","Total waktu", dur(r.total_menit)) +
    chip("","Dana kegiatan", rp(r.dana_awal)) +
    (r.dana_belmawa ? chip("biru","Dana Belmawa", rp(r.dana_belmawa)) : "") +
    (r.dana_pt ? chip("merah","Dana PT", rp(r.dana_pt)) : "") +
    chip("merah","Pengeluaran", rp(r.pengeluaran)) +
    chip("hijau","Sisa dana", rp(r.sisa)), "dt-chips");
}
function chip(cls, lbl, v){
  return '<div class="chip ' + cls + '"><small>' + lbl + "</small><b>" + v + "</b></div>";
}
function renderTab(){
  if (!DETAIL) return;
  var box = $("#dt-isi");
  // Simpan posisi scroll linimasa (bila ada) agar tidak lompat saat data disegarkan
  var tlLama = box ? box.querySelector(".tline") : null;
  var tlPos = tlLama ? tlLama.scrollTop : 0;
  var berubah = setHTML(box,
    TAB === "keg" ? tabelKegiatan(DETAIL.kegiatan) :
    TAB === "keu" ? tabelKeuangan(DETAIL.keuangan) :
    TAB === "lap" ? tabelLaporan(DETAIL) :
    TAB === "pre" ? tabelPresentasi(DETAIL) :
    TAB === "ses" ? tabelSesiUser(SESI_USER) :
    tabelAktivitas(AKTIVITAS), "dt-isi");
  if (berubah && tlPos) {
    var tlBaru = box.querySelector(".tline");
    if (tlBaru) tlBaru.scrollTop = tlPos;
  }
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
  var url = B + "/data/pengguna/" + d.user.id + "/laporan-file";
  return '<div class="card" style="margin-top:14px">' +
    '<div class="row spread">' +
      '<div><b style="font-size:.95rem">📄 ' + esc(l.nama) + '</b>' +
      '<div class="mut" style="margin-top:4px">' + ukur(l.ukuran) +
      ' · diunggah ' + esc(tglJam(l.updated_at)) + '</div></div>' +
      '<div class="row" style="gap:8px">' +
        '<a class="btn sm p" href="' + url + '" target="_blank" rel="noopener">' + sv("folder") + ' Buka</a>' +
        '<a class="btn sm" href="' + url + '?unduh=1">' + sv("save") + ' Unduh</a>' +
      '</div>' +
    '</div></div>';
}
function tabelPresentasi(d){
  var p = d.presentasi || { ada: false, file: { ada: false }, canva: { ada: false } };
  if (!p.ada) return '<div class="kosong"><div class="big">📽️</div>Tim ini belum mengunggah presentasi (.pptx) maupun menautkan Canva.</div>';
  var out = "";
  if (p.file && p.file.ada) {
    var url = B + "/data/pengguna/" + d.user.id + "/presentasi-file";
    out += '<div class="card" style="margin-top:14px">' +
      '<div class="row spread">' +
        '<div><b style="font-size:.95rem">📽️ ' + esc(p.file.nama) + '</b>' +
        '<div class="mut" style="margin-top:4px">' + ukur(p.file.ukuran) +
        ' · diunggah ' + esc(tglJam(p.file.updated_at)) + '</div></div>' +
        '<div class="row" style="gap:8px">' +
          '<a class="btn sm p" href="' + url + '" target="_blank" rel="noopener">' + sv("folder") + ' Buka</a>' +
          '<a class="btn sm" href="' + url + '?unduh=1">' + sv("save") + ' Unduh</a>' +
        '</div>' +
      '</div></div>';
  }
  if (p.canva && p.canva.ada) {
    out += '<div class="card" style="margin-top:14px">' +
      '<div class="row spread">' +
        '<div><b style="font-size:.95rem">🎨 Tautan presentasi Canva</b>' +
        '<div class="mut" style="margin-top:4px;word-break:break-all">' + esc(p.canva.url) +
        '<br>ditautkan ' + esc(tglJam(p.canva.updated_at)) + '</div></div>' +
        '<a class="btn sm p" href="' + esc(p.canva.url) + '" target="_blank" rel="noopener">' +
          sv("folder") + ' Buka Canva</a>' +
      '</div></div>';
  }
  return out;
}

/* peta aksi → [ikon, warna, label] */
var AKSI_INFO = {
  "akun.daftar":          ["user","g","Mendaftar akun"],
  "akun.masuk":           ["unlock","g","Login ke aplikasi"],
  "akun.keluar":          ["logout","b","Logout dari aplikasi"],
  "akun.ganti_username":  ["edit","y","Mengganti username"],
  "akun.ganti_password":  ["key","y","Mengganti password"],
  "akun.sesi_cabut":      ["logout","y","Mencabut sesi perangkat"],

  "kegiatan.tambah":      ["cal","g","Menambah kegiatan"],
  "kegiatan.ubah":        ["edit","y","Mengubah kegiatan"],
  "kegiatan.hapus":       ["trash","r","Menghapus kegiatan"],
  "keuangan.tambah":      ["coins","g","Menambah belanja"],
  "keuangan.ubah":        ["edit","y","Mengubah belanja"],
  "keuangan.hapus":       ["trash","r","Menghapus belanja"],
  "laporan.unggah":       ["save","g","Mengunggah laporan kemajuan"],
  "laporan.hapus":        ["trash","r","Menghapus laporan kemajuan"],
  "presentasi.unggah":      ["save","g","Mengunggah presentasi (.pptx)"],
  "presentasi.hapus-file":  ["trash","r","Menghapus berkas presentasi"],
  "presentasi.canva":       ["save","g","Menautkan presentasi Canva"],
  "presentasi.hapus-canva": ["trash","r","Menghapus tautan Canva"],
  "komentar.tambah":      ["scroll","c","Komentar baru"],
  "komentar.ubah":        ["edit","y","Komentar diedit"],
  "komentar.hapus":       ["trash","r","Komentar dihapus"],
  "komentar.selesai":     ["save","g","Komentar ditandai selesai"],
  "user.lihat":           ["search","c","Data dilihat lewat panel"],
  "user.buat":            ["user","g","Akun dibuat lewat panel"],
  "user.username":        ["edit","y","Username diganti lewat panel"],
  "user.password.reset":  ["key","r","Password direset lewat panel"],
  "user.sesi.cabut":      ["power","r","Sesi dicabut lewat panel"],
  "user.hapus":           ["trash","r","Akun dihapus lewat panel"],
  "user.laporan.lihat":   ["folder","c","Laporan dilihat lewat panel"],
  "user.presentasi.lihat":["folder","c","Presentasi dilihat lewat panel"],
  "fasilitator.kode.ubah":["key","y","Kode fasilitator diganti"],
  "fasilitator.tim.ubah": ["users","y","Assignment tim fasilitator diubah"],
  "dosen.kode.ubah":      ["key","y","Kode dosen pendamping diganti"],
  "dosen.tim.ubah":       ["users","y","Assignment tim dosen pendamping diubah"],
  "tim.fasilitator.ubah": ["users","y","Pendamping tim diubah"],
  "acc.setuju":           ["save","g","Entri di-ACC dosen pendamping"],
  "acc.revisi":           ["edit","r","Dosen pendamping minta revisi"],
  "acc.batal":            ["power","y","Status ACC dikembalikan ke menunggu"],
  "tim.kode.reset":       ["key","y","Kode tim dicetak ulang"],
  "pendamping.gabung":    ["users","g","Pendamping bergabung lewat kode tim"],
  "pendamping.keluar":    ["users","r","Pendamping keluar dari tim"],
  "pendamping.keluarkan": ["users","r","Tim mengeluarkan pendamping"],
  "pendaftaran.tim.ubah": ["key","y","Pendaftaran akun tim dibuka/ditutup"]
};
function tabelAktivitas(list){
  if (!list.length) return '<div class="kosong"><div class="big">📜</div>Belum ada aktivitas tercatat.<div class="mut" style="margin-top:6px">Aktivitas mulai terekam sejak fitur ini aktif — login, tambah/ubah/hapus data, dan aksi panel.</div></div>';
  var out = '<div class="tline">';
  list.forEach(function(r){
    var info = AKSI_INFO[r.aksi] || ["zap","b", r.aksi || "aktivitas"];
    var meta = [];
    if (r.tanggal) meta.push("data tgl " + tgl(r.tanggal));
    if (r.ringkas) meta.push("“" + r.ringkas + "”");
    if (r.total != null) meta.push(rp(r.total));
    if (r.foto) meta.push(r.foto + " foto");
    if (r.dari && r.jadi) meta.push(r.dari + " → " + r.jadi);
    if (r.jumlah != null && r.aksi === "user.sesi.cabut") meta.push(r.jumlah + " sesi");
    if (r.sesiLainDicabut != null) meta.push(r.sesiLainDicabut + " sesi lain keluar");
    if (r.oleh) meta.push("oleh " + r.oleh);
    if (r.jenis && String(r.aksi || "").indexOf("komentar.") === 0) meta.push("di " + r.jenis);
    if (r.jenis && String(r.aksi || "").indexOf("acc.") === 0) meta.push("di " + r.jenis);
    if (r.catatan && String(r.aksi || "").indexOf("acc.") === 0) meta.push("“" + r.catatan + "”");
    if (r.balasan) meta.push("balasan");
    if (r.nama && String(r.aksi || "").indexOf("laporan.") === 0) meta.push(r.nama);
    if (r.aksi === "pendaftaran.tim.ubah") meta.push(r.buka ? "dibuka" : "ditutup");
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
      '<td class="mut nomor">' + (i + 1) + "</td>" +
      '<td class="sel-utama" style="white-space:nowrap">' + tgl(e.tanggal) + "</td>" +
      '<td data-l="Kegiatan">' + esc(e.kegiatan) + "</td>" +
      "<td data-l='Capaian'><div class='row' style='gap:7px;flex-wrap:nowrap'><div class='prog'><i style='width:" +
        Math.min(100, e.capaian_total) + "%'></i></div>" +
        "<span class='mut' style='white-space:nowrap'>+" + e.capaian_delta + "% → <b style='color:var(--p2)'>" +
        e.capaian_total + "%</b></span></div></td>" +
      '<td class="num" data-l="Waktu" style="white-space:nowrap">' + dur(e.waktu_menit) + "</td>" +
      '<td data-l="Foto">' + (fotos ? '<div class="ths">' + fotos + "</div>" : '<span class="mut">—</span>') + "</td>" +
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
      '<td class="mut nomor">' + (i + 1) + "</td>" +
      '<td class="sel-utama" style="white-space:nowrap">' + tgl(e.tanggal) + "</td>" +
      '<td data-l="Item">' + esc(e.item) + "</td>" +
      '<td class="num" data-l="Harga satuan" style="white-space:nowrap">' + rp(e.harga_satuan) + esc(e.satuan_suffix || "") + "</td>" +
      '<td class="num" data-l="Jumlah">' + e.jumlah + "</td>" +
      '<td class="num" data-l="Total" style="white-space:nowrap"><b>' + rp(e.total) + "</b></td>" +
      '<td data-l="Bukti">' + (function(){
        var keys = (e.bukti_keys && e.bukti_keys.length) ? e.bukti_keys
                 : (e.bukti_key ? [e.bukti_key] : []);
        if (!keys.length) return '<span class="mut">—</span>';
        return keys.map(function(k){
          return '<img class="th" loading="lazy" src="' + fotoUrl(k) + '" data-act="foto" data-key="' + esc(k) + '" alt="">';
        }).join(" ");
      })() + "</td>" +
    "</tr>";
  });
  out += '<tr class="baris-total"><td colspan="5" style="text-align:right;font-weight:800">TOTAL</td>' +
    '<td class="num" data-l="Total belanja" style="white-space:nowrap"><b style="color:var(--bad)">' + rp(total) + "</b></td><td></td></tr>";
  return out + "</tbody></table></div>";
}

/* ---------- aksi akun ---------- */
function gantiUsername(id){
  var u = findU(id); if (!u) return;
  $("#d-un-sub").textContent = "Akun: " + u.username;
  $("#d-un-val").value = u.username;
  var dlg = $("#d-un");
  bukaDialog(dlg);
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
  bukaDialog(dlg);
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
  konfirmasiDialog({
    judul: "🚪 Keluarkan dari semua perangkat?",
    isi: "Semua sesi akun " + u.username + " akan dicabut — pemiliknya harus login ulang di setiap perangkat.",
    tombol: "Keluarkan semua", bahaya: true
  }).then(function(ok){
    if (!ok) return;
    call("/data/pengguna/" + id + "/keluarkan", { method: "POST" })
      .then(function(j){ toast(j.dicabut + " sesi dicabut"); muat(); segarkanDetail(); })
      .catch(function(e){ toast(e.message, true); });
  });
}
/** Cabut SATU perangkat — sesi lain milik akun itu tetap hidup. */
function cabutSesiSatu(sid, nama){
  if (!sid) return;
  konfirmasiDialog({
    judul: "🚪 Keluarkan perangkat ini?",
    isi: "Perangkat ini akan keluar dari akun " + (nama || "") + " dan harus login ulang. " +
      "Bila kamu tidak mengenalinya, setel ulang juga password akun itu setelah ini.",
    tombol: "Keluarkan perangkat", bahaya: true
  }).then(function(ok){
    if (!ok) return;
    call("/data/sesi/" + encodeURIComponent(sid), { method: "DELETE" })
      .then(function(){ toast("Perangkat dikeluarkan"); muat(); segarkanDetail(); })
      .catch(function(e){ toast(e.message, true); });
  });
}
function hapusUser(id){
  var u = findU(id); if (!u) return;
  konfirmasiDialog({
    judul: "🗑️ Hapus permanen akun " + u.username + "?",
    isi: "Beserta " + u.kegiatan + " kegiatan, " + u.keuangan + " belanja, laporan, presentasi, " +
      "komentar, dan semua fotonya. Tindakan ini TIDAK bisa dibatalkan.",
    tombol: "Hapus permanen", bahaya: true,
    ketik: u.username
  }).then(function(ok){
    if (!ok) return;
    call("/data/pengguna/" + id, { method: "DELETE" })
      .then(function(){ toast("Akun " + u.username + " dihapus"); muat(); })
      .catch(function(e){ toast(e.message, true); });
  });
}
function assignTim(id){
  var u = findU(id); if (!u) return;
  call("/data/fasilitator/" + id + "/tim").then(function(j){
    var terpilih = {};
    (j.tim || []).forEach(function(t){ terpilih[t.id] = true; });
    var timSemua = USERS.filter(function(x){ return !isPendamping(x.role || "tim"); });
    $("#d-tim-sub").textContent = (u.role === "dosen" ? "Dosen pendamping: " : "Fasilitator: ") + u.username +
      " — centang tim yang diampu (boleh lebih dari satu).";
    $("#d-tim-list").innerHTML = timSemua.length ? timSemua.map(function(t){
      return '<label class="row" style="margin-top:8px;gap:9px;cursor:pointer;font-size:.84rem;color:var(--ink)">' +
        '<input type="checkbox" style="width:auto;margin:0" value="' + t.id + '"' +
        (terpilih[t.id] ? " checked" : "") + '> ' +
        '<span class="ava" style="width:26px;height:26px;flex:0 0 26px;font-size:.7rem;' + avaStyle(t.username) + '">' +
        esc((t.username || "?").charAt(0).toUpperCase()) + '</span> ' + esc(t.username) + '</label>';
    }).join("") : '<div class="mut">Belum ada akun tim.</div>';
    var dlg = $("#d-tim");
    bukaDialog(dlg);
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

/* Kebalikan assignTim: dari baris TIM, pilih pendamping (fasilitator & dosen). */
function assignFasilitator(id){
  var u = findU(id); if (!u) return;
  call("/data/tim/" + id + "/fasilitator").then(function(j){
    var terpilih = {};
    (j.fasilitator || []).forEach(function(f){ terpilih[f.id] = true; });
    var fasSemua = USERS.filter(function(x){ return isPendamping(x.role || "tim"); });
    $("#d-fas-sub").textContent = "Tim: " + u.username +
      " — centang pendamping tim ini (fasilitator dan/atau dosen, boleh lebih dari satu).";
    $("#d-fas-list").innerHTML = fasSemua.length ? fasSemua.map(function(f){
      var role = f.role || "fasilitator";
      return '<label class="row" style="margin-top:8px;gap:9px;cursor:pointer;font-size:.84rem;color:var(--ink)">' +
        '<input type="checkbox" style="width:auto;margin:0" value="' + f.id + '"' +
        (terpilih[f.id] ? " checked" : "") + '> ' +
        '<span class="ava" style="width:26px;height:26px;flex:0 0 26px;font-size:.7rem;' + avaStyle(f.username) + '">' +
        esc((f.username || "?").charAt(0).toUpperCase()) + '</span> ' + esc(f.username) +
        ' <span class="badge ' + (role === "dosen" ? "c" : "y") + '">' + labelPeran(role) + '</span></label>';
    }).join("") : '<div class="mut">Belum ada akun pendamping. Set kode pendaftaran fasilitator/dosen lalu bagikan.</div>';
    var dlg = $("#d-fas");
    bukaDialog(dlg);
    dlg.addEventListener("close", function h(){
      dlg.removeEventListener("close", h);
      if (dlg.returnValue !== "ok") return;
      var ids = Array.prototype.map.call(
        document.querySelectorAll("#d-fas-list input:checked"),
        function(c){ return c.value; });
      call("/data/tim/" + id + "/fasilitator", {
        method: "PUT", body: JSON.stringify({ fasilitator_ids: ids })
      }).then(function(r){
        toast("Pendamping tim disimpan (" + r.total + ")"); muat();
      }).catch(function(e){ toast(e.message, true); });
    });
  }).catch(function(e){ toast(e.message, true); });
}

/* ---------- buat akun baru dari panel ---------- */
function buatAkun(){
  $("#d-baru-u").value = "";
  $("#d-baru-p").value = "";
  $("#d-baru-r").value = "tim";
  var dlg = $("#d-baru");
  bukaDialog(dlg);
  dlg.addEventListener("close", function h(){
    dlg.removeEventListener("close", h);
    if (dlg.returnValue !== "ok") return;
    var u = $("#d-baru-u").value.trim(),
        p = $("#d-baru-p").value,
        r = $("#d-baru-r").value;
    if (u.length < 3) { toast("Username minimal 3 karakter", true); return; }
    if (p.length < 8) { toast("Password minimal 8 karakter", true); return; }
    call("/data/pengguna", {
      method: "POST", body: JSON.stringify({ username: u, password: p, role: r })
    }).then(function(j){
      toast("Akun " + j.username + " (" + j.role + ") dibuat");
      VIEW_ROLE = j.role === "tim" ? "tim" : j.role;
      document.querySelectorAll("[data-role-tab]").forEach(function(b){
        b.classList.toggle("on", b.dataset.roleTab === VIEW_ROLE);
      });
      muat();
    }).catch(function(e){ toast(e.message, true); });
  });
}

/* ---------- pengelola dialog (anti-nyangkut) ----------
 * Dialog HTML normalnya masuk "top layer" lewat showModal(): tergambar di atas
 * segalanya dan Esc menutupnya. Bila karena satu dan lain hal dialog berakhir
 * dalam keadaan terbuka NON-modal, ia kehilangan semua itu — tertimpa topbar,
 * tanpa backdrop, Esc tidak berfungsi — pengguna terkunci di dalamnya.
 *
 * Helper di bawah membuat keadaan itu tidak mungkin lagi:
 *   - buka  : selalu coba showModal(); bila gagal → show() + backdrop manual.
 *   - tutup : close(), lalu PAKSA cabut atribut open bila masih membandel.
 *   - Esc, klik backdrop, dan klik di luar isi dialog selalu menutup.
 */
function pasangBackdrop(){
  if (document.querySelector(".dlg-bg")) return;
  var bg = document.createElement("div");
  bg.className = "dlg-bg";
  bg.addEventListener("click", tutupSemuaDialog);
  document.body.appendChild(bg);
}
function bersihkanDialog(){
  if (document.querySelector("dialog[open]")) return; // masih ada yang terbuka
  var bg = document.querySelector(".dlg-bg");
  if (bg) bg.remove();
  document.documentElement.classList.remove("dlg-on");
}
function bukaDialog(dlg){
  if (!dlg) return;
  try { if (dlg.open) dlg.close(); } catch(e){}
  try { dlg.showModal(); }
  catch(e){ try { dlg.show(); } catch(e2){ dlg.setAttribute("open", ""); } }
  // :modal true = benar-benar di top layer (backdrop digambar browser)
  var modal = true;
  try { modal = dlg.matches(":modal"); } catch(e){}
  if (!modal) pasangBackdrop();
  document.documentElement.classList.add("dlg-on");
}
function tutupDialog(dlg){
  if (!dlg) return;
  try { dlg.close(); } catch(e){}
  if (dlg.open) dlg.removeAttribute("open"); // pintu darurat terakhir
  bersihkanDialog();
}
function tutupSemuaDialog(){
  var buka = document.querySelectorAll("dialog[open]");
  for (var i = 0; i < buka.length; i++) tutupDialog(buka[i]);
  bersihkanDialog();
}

/**
 * Dialog konfirmasi panel — pengganti confirm()/prompt() bawaan browser agar
 * tampilannya selaras dengan dialog lain di panel & tidak bisa diblokir
 * pengaturan "jangan tampilkan lagi" milik browser.
 * @param {{judul:string, isi:string, tombol?:string, bahaya?:boolean,
 *          ketik?:string}} o  "ketik" = teks yang wajib diketik persis
 *          sebelum tombol aktif (mis. username akun yang akan dihapus).
 * @returns {Promise<boolean>} true bila dikonfirmasi
 */
function konfirmasiDialog(o){
  o = o || {};
  var dlg = $("#d-konfirmasi");
  if (!dlg) return Promise.resolve(window.confirm(o.isi || o.judul || "Lanjutkan?"));
  $("#d-konf-judul").textContent = o.judul || "Konfirmasi";
  $("#d-konf-isi").textContent = o.isi || "";
  var ok = $("#d-konf-ok");
  ok.textContent = o.tombol || "Lanjutkan";
  ok.className = "btn " + (o.bahaya ? "d" : "p");
  var wrap = $("#d-konf-ketik-wrap"), input = $("#d-konf-ketik");
  var perluKetik = !!o.ketik;
  wrap.classList.toggle("hide", !perluKetik);
  input.value = "";
  ok.disabled = perluKetik;
  if (perluKetik) {
    $("#d-konf-ketik-lbl").textContent = "Ketik “" + o.ketik + "” untuk melanjutkan";
    input.oninput = function(){ ok.disabled = input.value.trim() !== o.ketik; };
  } else {
    input.oninput = null;
  }
  return new Promise(function(resolve){
    function selesai(){
      dlg.removeEventListener("close", selesai);
      resolve(dlg.returnValue === "ok" && (!perluKetik || input.value.trim() === o.ketik));
    }
    dlg.returnValue = "";
    dlg.addEventListener("close", selesai);
    bukaDialog(dlg);
    if (perluKetik) setTimeout(function(){ try { input.focus(); } catch(e){} }, 30);
  });
}
// Dialog mini ditutup oleh <form method="dialog"> tanpa lewat tutupDialog —
// bersihkan backdrop & kunci scroll lewat event close bawaan.
document.querySelectorAll("dialog").forEach(function(d){
  d.addEventListener("close", bersihkanDialog);
});
// Esc menutup dialog teratas, termasuk yang terjebak non-modal
document.addEventListener("keydown", function(e){
  if (e.key !== "Escape") return;
  var buka = document.querySelectorAll("dialog[open]");
  if (buka.length) { e.preventDefault(); tutupDialog(buka[buka.length - 1]); }
});
// Klik pada tepian/luar isi dialog juga menutup
document.addEventListener("click", function(e){
  var d = e.target;
  if (!(d instanceof HTMLDialogElement) || !d.open) return;
  var r = d.getBoundingClientRect();
  if (e.clientX < r.left || e.clientX > r.right ||
      e.clientY < r.top || e.clientY > r.bottom) tutupDialog(d);
});

/* ---------- event delegation ---------- */
document.addEventListener("click", function(ev){
  var el = ev.target.closest(
    "[data-act],[data-tab],[data-role-tab],[data-page],[data-mode-sesi],[data-peran-sesi],[data-fil-audit]");
  if (!el) return;

  // pindah halaman (link sidebar, kartu pintasan, tombol "Lihat semua")
  if (el.dataset.page) {
    // Ctrl/Cmd/Shift-klik pada tautan sidebar tetap dibiarkan peramban
    // (buka di tab baru) — hanya klik biasa yang ditangani router.
    if (el.tagName === "A" && (ev.metaKey || ev.ctrlKey || ev.shiftKey)) return;
    ev.preventDefault();
    keHalaman(el.dataset.page, true);
    return;
  }
  // halaman sesi: ganti sudut pandang
  if (el.dataset.modeSesi) {
    MODE_SESI = el.dataset.modeSesi;
    renderSesi();
    return;
  }
  // halaman sesi: saring peran
  if (el.dataset.peranSesi != null && el.hasAttribute("data-peran-sesi")) {
    PERAN_SESI = el.dataset.peranSesi;
    renderSesi();
    return;
  }
  // halaman audit: saring jenis aksi (dilakukan di server)
  if (el.dataset.filAudit != null && el.hasAttribute("data-fil-audit")) {
    AUDIT_F = el.dataset.filAudit;
    renderAudit();
    muat();
    return;
  }
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
    keAtasDetail(); // ganti tab = mulai membaca dari atas
    return;
  }
  switch (el.dataset.act) {
    case "muat": muat(); break;
    case "baru": buatAkun(); break;
    case "keluar":
      call("/keluar", { method: "POST" }).catch(function(){});
      lihatLogin(); break;
    case "detail": bukaDetail(el.dataset.id); break;
    case "akt-cepat": bukaDetail(el.dataset.id, "akt"); break;
    case "un": gantiUsername(el.dataset.id); break;
    case "pw": resetPassword(el.dataset.id); break;
    case "sesi": cabutSesi(el.dataset.id); break;
    case "sesi-satu": cabutSesiSatu(el.dataset.sid, el.dataset.nama); break;
    case "hapus": hapusUser(el.dataset.id); break;
    case "tim": assignTim(el.dataset.id); break;
    case "fas": assignFasilitator(el.dataset.id); break;
    case "lipat":
      // bentangkan/lipat rincian sebuah kartu (keadaan diingat, jadi
      // pembaruan otomatis tidak menutupnya kembali)
      if (BUKA_SESI[el.dataset.id]) delete BUKA_SESI[el.dataset.id];
      else BUKA_SESI[el.dataset.id] = true;
      renderSesi();
      break;
    case "tutup-detail": tutupDialog($("#d-detail")); break;
    case "foto": window.open(fotoUrl(el.dataset.key), "_blank"); break;
  }
});

$("#cari").addEventListener("input", renderUsers);
$("#cari-sesi").addEventListener("input", renderSesi);
$("#audit-n").addEventListener("change", function(e){
  AUDIT_N = Number(e.target.value) || 200;
  muat();
});

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

$("#f-kode-dosen").addEventListener("submit", function(e){
  e.preventDefault();
  var v = $("#k-val-dosen").value;
  if (v.length < 6) { toast("Kode minimal 6 karakter", true); return; }
  call("/data/kode-dosen", { method: "PUT", body: JSON.stringify({ kode: v }) })
    .then(function(){
      toast("Kode dosen pendamping tersimpan");
      $("#k-val-dosen").value = "";
      muat();
    }).catch(function(ex){ toast(ex.message, true); });
});

/* Buka/tutup pendaftaran akun tim — konfirmasi lewat dialog panel (bukan confirm()). */
$("#btn-daftar").addEventListener("click", function(){
  var sedangBuka = this.dataset.buka !== "0";
  var tombol = this;
  konfirmasiDialog({
    judul: sedangBuka ? "🔒 Tutup pendaftaran tim?" : "🔓 Buka pendaftaran tim?",
    isi: sedangBuka
      ? "Setelah ditutup, halaman Daftar menolak akun tim baru. Akun masih bisa dibuat dari panel ini."
      : "Setelah dibuka, siapa pun yang mengetahui alamat aplikasi dapat membuat akun tim.",
    tombol: sedangBuka ? "Tutup pendaftaran" : "Buka pendaftaran",
    bahaya: sedangBuka
  }).then(function(ok){
    if (!ok) return;
    tombol.disabled = true;
    call("/data/pendaftaran-tim", { method: "PUT", body: JSON.stringify({ buka: !sedangBuka }) })
      .then(function(r){ toast(r.catatan || "Tersimpan"); muat(); })
      .catch(function(ex){ toast(ex.message, true); })
      .finally(function(){ tombol.disabled = false; });
  });
});
(function(){
  var btn = $("#btn-mini"), app = $("#v-app");
  if (!btn || !app) return;
  var KEY = "pk-mini";
  function sink(){
    var mini = app.classList.contains("mini");
    btn.title = mini ? "Perlebar navigasi" : "Kecilkan navigasi";
    btn.setAttribute("aria-expanded", mini ? "false" : "true");
  }
  try { if (localStorage.getItem(KEY) === "1") app.classList.add("mini"); } catch(e){}
  sink();
  btn.addEventListener("click", function(){
    var mini = app.classList.toggle("mini");
    sink();
    try { localStorage.setItem(KEY, mini ? "1" : "0"); } catch(e){}
  });
})();

/* ---------- pintasan keyboard ---------- */
(function(){
  // Tautan sidebar memakai URL sungguhan (bisa diklik-tengah / disalin);
  // klik biasa tetap ditangani router agar tidak memuat ulang halaman.
  document.querySelectorAll(".side-nav a[data-page]").forEach(function(a){
    a.setAttribute("href", urlHal(a.dataset.page));
  });
  document.addEventListener("keydown", function(e){
    if (document.querySelector("dialog[open]")) return;
    if ($("#v-app").classList.contains("hide")) return;
    var diKetikan = /INPUT|TEXTAREA|SELECT/.test((document.activeElement || {}).tagName || "");
    // "/" → kotak cari halaman yang sedang dibuka
    if (e.key === "/" && !diKetikan) {
      var c = HAL === "sesi" ? $("#cari-sesi") : $("#cari");
      if (c) {
        e.preventDefault();
        if (HAL !== "sesi" && HAL !== "akun") keHalaman("akun", true);
        c.focus();
        c.select();
      }
      return;
    }
    // g lalu 1..5 → lompat antar halaman (pola dashboard modern)
    if (!diKetikan && e.key >= "1" && e.key <= "5" && (e.altKey || e.metaKey)) {
      e.preventDefault();
      keHalaman(HALAMAN[Number(e.key) - 1], true);
    }
  });
})();

// sudah punya sesi? langsung buka panel
if (TOK) call("/data/ringkas").then(lihatApp).catch(lihatLogin);
</script>
</body>
</html>`;

