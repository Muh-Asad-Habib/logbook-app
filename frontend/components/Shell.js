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
  BookOpenText, LayoutDashboard, CalendarDays, Wallet, Images, FileOutput,
  Settings, LogOut, Sun, Moon, Plus, ChevronUp, PanelLeftClose, PanelLeftOpen,
  Target, Flame, Banknote,
  Link as LinkIcon, Copy, Check,
} from "lucide-react";
import Prefetch from "./Prefetch";
import ToastHost from "./Toast";
import { api, clearAuth, getToken, getUser, fmtRupiah, useApi } from "@/lib/api";

const MENU = [
  { href: "/", label: "Dashboard", Ic: LayoutDashboard },
  { href: "/kegiatan", label: "Kegiatan", Ic: CalendarDays },
  { href: "/keuangan", label: "Keuangan", Ic: Wallet },
  { href: "/galeri", label: "Galeri", Ic: Images },
  { href: "/ekspor", label: "Ekspor", Ic: FileOutput },
];

const JUDUL = {
  "/": "Dashboard",
  "/kegiatan": "Kegiatan",
  "/keuangan": "Keuangan",
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
      <span className="chip"><Target className="lucide" /> {stat.capaian_total}%</span>
      <span className="chip"><Flame className="lucide" /> {hitungStreak(keg)} hari</span>
      <span className="chip"><Banknote className="lucide" /> {fmtRupiah(stat.sisa_dana)} tersisa</span>
      {tunnel && (
        <>
          <a className="chip link" href={tunnel} target="_blank" rel="noreferrer"
             title="Link publik — bisa dibuka siapa saja">
            <LinkIcon className="lucide" />
            <span className="chip-url">{tunnel.replace("https://", "")}</span>
          </a>
          <button type="button" className="chip copy" onClick={salin} title="Salin link publik">
            {disalin ? <Check className="lucide" /> : <Copy className="lucide" />}
            {disalin ? "Tersalin!" : "Salin"}
          </button>
        </>
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
    api.me().then((r) => setUser(r.user)).catch(() => {});
  }, [isLogin, path]);

  useEffect(() => {
    if (!menuBuka && !menuMob) return;
    const tutup = (e) => {
      if (!menuRef.current?.contains(e.target) && !menuMobRef.current?.contains(e.target)) {
        setMenuBuka(false);
        setMenuMob(false);
      }
    };
    document.addEventListener("pointerdown", tutup);
    return () => document.removeEventListener("pointerdown", tutup);
  }, [menuBuka, menuMob]);

  useEffect(() => {
    setMenuBuka(false);
    setMenuMob(false);
  }, [path]);

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
        <div className="auth-splash-ic"><BookOpenText className="lucide" /></div>
        <p>Memuat…</p>
      </div>
    );
  }

  const judul = JUDUL[(path || "/").replace(/\/$/, "") || "/"] || "Logbook";
  const fabAda = path === "/kegiatan" || path === "/keuangan";
  const inisial = (user?.username || "?").charAt(0).toUpperCase();

  return (
    <div className={sbMini ? "app sb-mini" : "app"}>
      {/* ===== Sidebar (desktop) ===== */}
      <aside className="sidebar">
        <div className="sb-brand">
          <div className="sb-logo"><BookOpenText className="lucide" /></div>
          <div className="sb-txt">
            <b>Logbook</b>
            <small>Kegiatan &amp; Keuangan</small>
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
          {MENU.map(({ href, label, Ic }) => (
            <Link key={href} href={href} className={path === href ? "active" : ""}
                  title={sbMini ? label : undefined}>
              <Ic className="lucide" /> <span className="sb-txt">{label}</span>
            </Link>
          ))}
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
              <div className="mob-logo"><BookOpenText className="lucide" /></div>
              <b>{judul}</b>
            </div>
            <h1 className="pg-title">{judul}</h1>
            <TopChips />
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

        <main className="container">{children}</main>
      </div>

      {/* ===== Bottom-nav (mobile) ===== */}
      <nav className="bottom-nav">
        {MENU.map(({ href, label, Ic }) => (
          <Link key={href} href={href} className={path === href ? "active" : ""}>
            <Ic className="lucide" /> {label}
          </Link>
        ))}
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

