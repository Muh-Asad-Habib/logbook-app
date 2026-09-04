"use client";

/**
 * Kerangka aplikasi v2 + penjaga login:
 * - Desktop  : sidebar kiri (menu, akun, toggle tema) + topbar (judul + chips statistik)
 * - Mobile   : topbar (logo + tema + avatar) + bottom-nav 5 tab + FAB tambah
 * - /login   : tampil polos tanpa kerangka
 *
 * FAB mengirim event "fab:add" — halaman kegiatan/keuangan membukanya
 * sebagai dialog tambah entri.
 */
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, CalendarDays, Wallet, Images, FileOutput,
  FileText, Settings, LogOut, Sun, Moon, Plus, ChevronUp, ChevronDown,
  PanelLeftClose, PanelLeftOpen,
  Trophy, Flame, Banknote, Users,
  Link as LinkIcon, Copy, Check, Presentation,
} from "lucide-react";
import LogoMark from "./Logo";
import Prefetch from "./Prefetch";
import ToastHost from "./Toast";
import GabungTim from "./GabungTim";
import {
  api, clearAuth, getToken, getUser, fmtRupiah, useApi,
  setUser as simpanProfil, getTimAktif, setTimAktif,
} from "@/lib/api";

const MENU = [
  { href: "/", label: "Dashboard", Ic: LayoutDashboard },
  { href: "/kegiatan", label: "Kegiatan", Ic: CalendarDays },
  { href: "/keuangan", label: "Keuangan", Ic: Wallet },
  { href: "/laporan", label: "Laporan Kemajuan", pendek: "Laporan", Ic: FileText },
  { href: "/presentasi", label: "Presentasi", pendek: "Slide", Ic: Presentation },
  { href: "/galeri", label: "Galeri", Ic: Images },
  { href: "/ekspor", label: "Ekspor", Ic: FileOutput },
];

/* Menu pendamping (fasilitator & dosen): hanya lihat, komentar, ACC — tanpa Galeri/Ekspor. */
const MENU_FAS = [
  { href: "/", label: "Dashboard Tim", pendek: "Dashboard", Ic: LayoutDashboard },
  { href: "/kegiatan", label: "Kegiatan", Ic: CalendarDays },
  { href: "/keuangan", label: "Keuangan", Ic: Wallet },
  { href: "/laporan", label: "Laporan Kemajuan", pendek: "Laporan", Ic: FileText },
  { href: "/presentasi", label: "Presentasi", pendek: "Slide", Ic: Presentation },
];

/** Label & ikon peran — dipakai di sidebar dan chip topbar. */
const INFO_PERAN = {
  fasilitator: { emoji: "🎓", nama: "Fasilitator", mode: "Mode Fasilitator" },
  dosen: { emoji: "👨‍🏫", nama: "Dosen Pendamping", mode: "Mode Dosen Pendamping" },
};

const JUDUL = {
  "/": "Dashboard",
  "/kegiatan": "Kegiatan",
  "/keuangan": "Keuangan",
  "/laporan": "Laporan Kemajuan",
  "/presentasi": "Presentasi",
  "/galeri": "Galeri",
  "/ekspor": "Ekspor / Impor",
  "/profil": "Pengaturan akun",
};

/* ---------- Tema (light/dark) ---------- */
function applyTheme(t) {
  document.documentElement.dataset.theme = t;
  localStorage.setItem("logbook_theme", t);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", t === "dark" ? "#0d0f22" : "#4f46e5");
}

function useTheme() {
  const [theme, setTheme] = useState("light");
  useEffect(() => {
    setTheme(document.documentElement.dataset.theme === "dark" ? "dark" : "light");
  }, []);
  const toggle = () => {
    const baru = theme === "dark" ? "light" : "dark";
    setTheme(baru);
    applyTheme(baru);
  };
  return [theme, toggle];
}

/* ---------- Streak (hari beruntun) ---------- */
function hitungStreak(kegiatan) {
  const hari = new Set((kegiatan || []).map((e) => e.tanggal));
  if (hari.size === 0) return 0;
  let d = new Date([...hari].sort().pop() + "T00:00:00");
  let n = 0;
  const iso = (x) =>
    `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
  while (hari.has(iso(d))) {
    n += 1;
    d.setDate(d.getDate() - 1);
  }
  return n;
}

/* ---------- Chips statistik + link publik (topbar desktop) ---------- */
function TopChips() {
  const { data: stat } = useApi("/api/statistik");
  const { data: keg } = useApi("/api/kegiatan");
  const { data: tunnelData } = useApi("/api/tunnel");
  const [disalin, setDisalin] = useState(false);
  const tunnel = tunnelData?.url || "";

  const salin = async () => {
    try {
      await navigator.clipboard.writeText(tunnel);
      setDisalin(true);
      setTimeout(() => setDisalin(false), 1600);
    } catch {}
  };

  if (!stat) return null;
  return (
    <div className="top-chips">
      <span className="chip"><Trophy className="lucide" /> {stat.capaian_total}%</span>
      <span className="chip"><Flame className="lucide" /> {hitungStreak(keg)} hari</span>
      <span className="chip"><Banknote className="lucide" /> {fmtRupiah(stat.sisa_dana)} tersisa</span>
      {tunnel && (
        <>
          <a className="chip link chip-desk" href={tunnel} target="_blank" rel="noreferrer"
             title="Link publik — bisa dibuka siapa saja">
            <LinkIcon className="lucide" />
            <span className="chip-url">{tunnel.replace("https://", "")}</span>
          </a>
          <button type="button" className="chip copy chip-desk" onClick={salin} title="Salin link publik">
            {disalin ? <Check className="lucide" /> : <Copy className="lucide" />}
            {disalin ? "Tersalin!" : "Salin"}
          </button>
        </>
      )}
    </div>
  );
}

/* ---------- Badge jumlah komentar belum dibaca (aksesibel) ----------
 * Gaya di globals.css (.badge-notif) supaya ikut variabel tema, bukan inline. */
function BadgeNotif({ n, varian, label = "komentar belum dibaca" }) {
  if (!n) return null;
  return (
    <span
      className={`badge-notif${varian === "nav" ? " nav" : ""}`}
      role="status"
      aria-label={`${n} ${label}`}
      title={`${n} ${label}`}
    >
      {n}
    </span>
  );
}

/* ---------- Badge komentar belum dibaca (menu, kedua role) ---------- */
function useBelumDibaca(path, aktif = true) {
  const [n, setN] = useState(null);
  useEffect(() => {
    if (!aktif || !getToken()) return;
    let hidup = true;
    api.komentar.belumDibaca()
      .then((r) => { if (hidup) setN(r); })
      .catch(() => {});
    return () => { hidup = false; };
  }, [path, aktif]); // segarkan tiap pindah halaman
  return n || { kegiatan: 0, keuangan: 0, laporan: 0, presentasi: 0, total: 0 };
}

const badgeUntuk = (badges, href) =>
  href === "/kegiatan" ? badges.kegiatan :
  href === "/keuangan" ? badges.keuangan :
  href === "/laporan" ? badges.laporan :
  href === "/presentasi" ? badges.presentasi : 0;

/* ---------- Pemilih tim aktif (topbar pendamping, dukung multi-tim) ----------
 * Satu dropdown untuk semua: berganti tim yang dilihat DAN menambah tim baru
 * memakai kode yang dibagikan tim (fasilitator & dosen pendamping). */
function TimSwitcher({ role }) {
  const { data: timData } = useApi("/api/fasilitator/tim");
  // Simpan daftar terakhir: setTimAktif() memanggil clearCache() sehingga data
  // hook sempat undefined — tanpa ini chip & dropdown ikut hilang saat diklik.
  const [tim, setTim] = useState([]);
  const [aktif, setAktif] = useState("");
  const [buka, setBuka] = useState(false);
  const [tambah, setTambah] = useState(false);
  const boxRef = useRef(null);

  useEffect(() => {
    if (Array.isArray(timData)) setTim(timData);
  }, [timData]);

  useEffect(() => {
    setAktif(getTimAktif());
    // Ikuti perubahan tim aktif dari tempat lain (mis. setelah gabung tim baru)
    const ganti = (e) => setAktif(String(e.detail || getTimAktif()));
    window.addEventListener("tim-aktif-berubah", ganti);
    return () => window.removeEventListener("tim-aktif-berubah", ganti);
  }, []);
  useEffect(() => {
    // Pastikan pilihan valid: default ke tim pertama bila belum/tidak valid
    if (tim.length === 0) return;
    if (!tim.some((t) => String(t.id) === String(aktif))) {
      setAktif(String(tim[0].id));
      setTimAktif(tim[0].id);
    }
  }, [tim, aktif]);

  // Klik di luar / tombol Esc → tutup dropdown
  useEffect(() => {
    if (!buka) return;
    const tutup = (e) => {
      if (!boxRef.current?.contains(e.target)) {
        setBuka(false);
        setTambah(false);
      }
    };
    const esc = (e) => {
      if (e.key === "Escape") { setBuka(false); setTambah(false); }
    };
    document.addEventListener("pointerdown", tutup);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", tutup);
      document.removeEventListener("keydown", esc);
    };
  }, [buka]);

  const info = INFO_PERAN[role] || INFO_PERAN.fasilitator;
  if (tim.length === 0) return null;
  const sama = (t) => String(t.id) === String(aktif);
  const namaAktif = (tim.find(sama) || tim[0]).username;
  // Entri baru (kegiatan/keuangan/laporan/presentasi) sejak kunjungan terakhir
  // — disediakan server di /api/fasilitator/tim (field `baru`).
  const baruDi = (t) => Number(t?.baru?.total || 0);
  const totalBaruLain = tim.filter((t) => !sama(t)).reduce((s, t) => s + baruDi(t), 0);

  const pilih = (t) => {
    setAktif(String(t.id));
    setTimAktif(t.id);
    setBuka(false);
    setTambah(false);
  };

  return (
    <div className="top-chips tim-chips" ref={boxRef}>
      <button
        type="button"
        className="chip"
        onClick={() => setBuka((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={buka}
        title="Ganti tim yang dilihat / tambah tim"
      >
        <Users className="lucide" />
        <b>{namaAktif}</b>
        {tim.length > 1 && (
          <span className="muted" style={{ fontSize: ".68rem" }}>+{tim.length - 1}</span>
        )}
        <BadgeNotif n={totalBaruLain} label="entri baru di tim lain" />
        <ChevronDown className="lucide" style={{ width: 14, height: 14, opacity: 0.65 }} />
      </button>
      <span className="chip chip-role" title="Peran akun">{info.emoji} {info.nama}</span>

      {buka && (
        <div className="user-menu tim-menu" role="menu">
          <div className="menu-judul">TIM YANG KAMU DAMPINGI</div>
          {tim.map((t) => (
            <button
              key={t.id}
              type="button"
              role="menuitem"
              className="user-menu-item"
              onClick={() => pilih(t)}
            >
              <Users className="lucide" />
              <span>
                {t.username}
                {sama(t)
                  ? <small>sedang dilihat</small>
                  : baruDi(t) > 0 && <small>{baruDi(t)} entri baru</small>}
              </span>
              {sama(t) ? (
                <Check className="lucide" style={{ marginLeft: "auto", width: 16, height: 16 }} />
              ) : (
                <BadgeNotif n={baruDi(t)} label="entri baru" />
              )}
            </button>
          ))}

          {tambah ? (
            <div className="menu-pisah" style={{ padding: "8px 12px 4px" }}>
              <GabungTim
                ringkas
                autoFocus
                onGabung={() => { setTambah(false); setBuka(false); }}
              />
            </div>
          ) : (
            <button
              type="button"
              role="menuitem"
              className="user-menu-item menu-pisah"
              onClick={() => setTambah(true)}
            >
              <Plus className="lucide" />
              <span>
                Tambah tim
                <small>masukkan kode dari tim</small>
              </span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/* ---------- Menu akun (dipakai sidebar & mobile) ---------- */
function UserMenu({ onClose }) {
  const keluar = async () => {
    await api.logout();
    clearAuth();
    location.href = "/login";
  };
  return (
    <div className="user-menu" role="menu">
      <Link href="/profil" role="menuitem" className="user-menu-item" onClick={onClose}>
        <Settings className="lucide" />
        <span>
          Pengaturan akun
          <small>Ubah username &amp; password</small>
        </span>
      </Link>
      <button type="button" role="menuitem" className="user-menu-item danger" onClick={keluar}>
        <LogOut className="lucide" /> Keluar
      </button>
    </div>
  );
}

export default function Shell({ children }) {
  const path = usePathname();
  const isLogin = (path || "").replace(/\/$/, "") === "/login";
  const [siap, setSiap] = useState(false);
  const [user, setUser] = useState(null);
  const [menuBuka, setMenuBuka] = useState(false);
  const [menuMob, setMenuMob] = useState(false);
  const [sbMini, setSbMini] = useState(false);
  const [theme, toggleTheme] = useTheme();
  const menuRef = useRef(null);
  const menuMobRef = useRef(null);

  // Ingat pilihan sidebar diperkecil (dibaca sebelum kerangka dirender)
  useEffect(() => {
    setSbMini(localStorage.getItem("logbook_sidebar") === "mini");
  }, []);

  // PWA: daftarkan service worker (kerangka + aset statis bisa dibuka offline;
  // /api/* tidak pernah di-cache). Hanya di produksi & bila didukung browser —
  // saat `next dev` SW justru mengganggu HMR.
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
  }, []);

  const toggleSidebar = () => {
    const mini = !sbMini;
    setSbMini(mini);
    localStorage.setItem("logbook_sidebar", mini ? "mini" : "lebar");
  };

  useEffect(() => {
    if (isLogin) return;
    if (!getToken()) {
      location.replace("/login");
      return;
    }
    setSiap(true);
    setUser(getUser());
    api.me().then((r) => {
      setUser(r.user);
      simpanProfil(r.user); // role tersimpan → isFasilitator() akurat di semua halaman
    }).catch(() => {});
  }, [isLogin, path]);

  /* ---------- Denyut kehadiran ----------
   * Memberi tahu server bahwa tab aplikasi ini SEDANG terbuka (tiap 30 dtk +
   * saat tab berpindah terlihat/tersembunyi). Saat tab ditutup, kirim
   * sendBeacon "berhenti" supaya status langsung offline tanpa menunggu 90 dtk.
   * Yang dikirim hanya status layar — tanpa data lain. Dipakai Pusat Kendali
   * ("sedang membuka") & halaman Profil ("Online" pada perangkat lain). */
  useEffect(() => {
    if (!siap || isLogin || typeof window === "undefined") return;
    const kirim = (layar) => {
      const t = getToken();
      if (!t) return;
      const url = `/api/auth/denyut?layar=${encodeURIComponent(layar)}`;
      if (layar === "" && typeof navigator.sendBeacon === "function") {
        // Tab ditutup: beacon tetap terkirim walau halaman sudah dibongkar.
        // Autentikasi lewat cookie HttpOnly logbook_sesi (SameSite=Strict).
        navigator.sendBeacon(url, new Blob([], { type: "text/plain" }));
        return;
      }
      fetch(url, {
        method: "POST", credentials: "same-origin", keepalive: true,
        headers: { Authorization: `Bearer ${t}` },
      }).catch(() => {});
    };
    const layar = () => (document.visibilityState === "hidden" ? "tersembunyi" : "terlihat");
    kirim(layar());
    const id = setInterval(() => kirim(layar()), 30_000);
    const vis = () => kirim(layar());
    const tutup = () => kirim("");
    document.addEventListener("visibilitychange", vis);
    window.addEventListener("pagehide", tutup);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", vis);
      window.removeEventListener("pagehide", tutup);
    };
  }, [siap, isLogin]);

  useEffect(() => {
    if (!menuBuka && !menuMob) return;
    const tutup = (e) => {
      if (!menuRef.current?.contains(e.target) && !menuMobRef.current?.contains(e.target)) {
        setMenuBuka(false);
        setMenuMob(false);
      }
    };
    // Escape → tutup menu & kembalikan fokus ke tombol pembukanya (aksesibilitas keyboard)
    const esc = (e) => {
      if (e.key !== "Escape") return;
      setMenuBuka(false);
      setMenuMob(false);
      const wadah = menuBuka ? menuRef.current : menuMobRef.current;
      wadah?.querySelector("[aria-haspopup='menu']")?.focus();
    };
    document.addEventListener("pointerdown", tutup);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", tutup);
      document.removeEventListener("keydown", esc);
    };
  }, [menuBuka, menuMob]);

  useEffect(() => {
    setMenuBuka(false);
    setMenuMob(false);
  }, [path]);

  // Hook dipanggil TANPA syarat (Rules of Hooks) — fetch di dalamnya
  // dilewati bila belum login / masih di halaman login.
  const badges = useBelumDibaca(path, !isLogin && siap);

  if (isLogin) {
    return (
      <>
        {children}
        <ToastHost />
      </>
    );
  }

  if (!siap) {
    return (
      <div className="auth-splash">
        <div className="auth-splash-ic"><LogoMark /></div>
        <p>Memuat…</p>
      </div>
    );
  }

  const role = user?.role || "tim";
  const fasilitator = role === "fasilitator" || role === "dosen"; // pendamping
  const menuAktif = fasilitator ? MENU_FAS : MENU;
  const judul =
    fasilitator && ((path || "/").replace(/\/$/, "") || "/") === "/"
      ? "Dashboard Tim"
      : JUDUL[(path || "/").replace(/\/$/, "") || "/"] || "Logbook";
  const fabAda = !fasilitator && (path === "/kegiatan" || path === "/keuangan");
  const inisial = (user?.username || "?").charAt(0).toUpperCase();

  return (
    <div className={sbMini ? "app sb-mini" : "app"}>
      {/* Skip-link: langsung ke konten utama (pengguna keyboard/screen reader) */}
      <a href="#konten" className="skip-link">Langsung ke konten</a>

      {/* ===== Sidebar (desktop) ===== */}
      <aside className="sidebar">
        <div className="sb-brand">
          <div className="sb-logo"><LogoMark /></div>
          <div className="sb-txt">
            <b>Logbook</b>
            <small>{fasilitator ? (INFO_PERAN[role]?.mode || "Mode Pendamping") : "Kegiatan & Keuangan"}</small>
          </div>
          <button
            type="button"
            className="sb-collapse"
            onClick={toggleSidebar}
            title={sbMini ? "Perluas menu (lihat label)" : "Perkecil menu (ikon saja)"}
            aria-label={sbMini ? "Perluas menu samping" : "Perkecil menu samping"}
          >
            {sbMini ? <PanelLeftOpen className="lucide" /> : <PanelLeftClose className="lucide" />}
          </button>
        </div>
        <nav className="sb-menu">
          {menuAktif.map(({ href, label, Ic }) => {
            const nBadge = badgeUntuk(badges, href);
            return (
              <Link key={href} href={href} className={path === href ? "active" : ""}
                    title={sbMini ? label : undefined}>
                <Ic className="lucide" /> <span className="sb-txt">{label}</span>
                <BadgeNotif n={nBadge} />
              </Link>
            );
          })}
        </nav>
        <div className="sb-foot" ref={menuRef} style={{ position: "relative" }}>
          {menuBuka && <UserMenu onClose={() => setMenuBuka(false)} />}
          <button type="button" className="theme-btn" onClick={toggleTheme}
                  title={theme === "dark" ? "Mode terang" : "Mode gelap"}>
            {theme === "dark" ? <Sun className="lucide" /> : <Moon className="lucide" />}
            <span className="sb-txt">{theme === "dark" ? "Mode terang" : "Mode gelap"}</span>
          </button>
          {user && (
            <button type="button" className="sb-user" onClick={() => setMenuBuka((v) => !v)}
                    aria-haspopup="menu" aria-expanded={menuBuka}
                    title={sbMini ? `${user.username} — kelola akun` : undefined}>
              <span className="ava">{inisial}</span>
              <span className="who">
                <b>{user.username}</b>
                <small>Kelola akun</small>
              </span>
              <ChevronUp className="lucide" />
            </button>
          )}
        </div>
      </aside>

      {/* ===== Konten ===== */}
      <div className="main">
        <header className="topbar">
          <div className="topbar-inner">
            <div className="mob-head">
              <div className="mob-logo"><LogoMark /></div>
              <b>{judul}</b>
            </div>
            <h1 className="pg-title">{judul}</h1>
            {fasilitator ? <TimSwitcher role={role} /> : <TopChips />}
            <div className="mob-actions" ref={menuMobRef}>
              <button type="button" className="icon-btn" onClick={toggleTheme}
                      aria-label="Ganti tema">
                {theme === "dark" ? <Sun className="lucide" /> : <Moon className="lucide" />}
              </button>
              {user && (
                <button type="button" className="mob-ava" onClick={() => setMenuMob((v) => !v)}
                        aria-haspopup="menu" aria-expanded={menuMob}>
                  {inisial}
                </button>
              )}
              {menuMob && <UserMenu onClose={() => setMenuMob(false)} />}
            </div>
          </div>
        </header>

        <main id="konten" className="container">{children}</main>
      </div>

      {/* ===== Bottom-nav (mobile) ===== */}
      <nav className="bottom-nav" aria-label="Menu utama">
        {menuAktif.map(({ href, label, pendek, Ic }) => {
          const nBadge = badgeUntuk(badges, href);
          return (
            <Link key={href} href={href} className={path === href ? "active" : ""}
                  aria-label={label} style={{ position: "relative" }}>
              <Ic className="lucide" /> {pendek || label}
              <BadgeNotif n={nBadge} varian="nav" />
            </Link>
          );
        })}
      </nav>

      {/* ===== FAB tambah entri (mobile) ===== */}
      {fabAda && (
        <button
          type="button"
          className="fab"
          aria-label="Tambah entri"
          onClick={() => window.dispatchEvent(new CustomEvent("fab:add"))}
        >
          <Plus className="lucide" />
        </button>
      )}

      <Prefetch />
      <ToastHost />
    </div>
  );
}

