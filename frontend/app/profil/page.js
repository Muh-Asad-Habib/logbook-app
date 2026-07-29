"use client";

import { useEffect, useState } from "react";
import {
  User, Lock, Eye, EyeOff, Save, KeyRound, Pencil, ShieldCheck, History,
  LogIn, LogOut, Plus, Trash2, FileEdit, UserPlus, UserMinus, Users,
} from "lucide-react";
import { api, getUser, getRole, setUser as simpanUser } from "@/lib/api";
import KodeTim from "@/components/KodeTim";
import { toast } from "@/components/Toast";

function PassInput({ value, onChange, placeholder, autoComplete }) {
  const [lihat, setLihat] = useState(false);
  return (
    <div className="input-wrap login-pass" style={{ marginTop: 5 }}>
      <span className="in-ic" aria-hidden="true"><Lock className="lucide" /></span>
      <input
        type={lihat ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
      />
      <button
        type="button"
        className="eye"
        onClick={() => setLihat((v) => !v)}
        title={lihat ? "Sembunyikan" : "Lihat"}
        aria-label={lihat ? "Sembunyikan password" : "Lihat password"}
      >
        {lihat ? <EyeOff className="lucide" /> : <Eye className="lucide" />}
      </button>
    </div>
  );
}

/* ---------- Riwayat aktivitas ---------- */
const AKSI_LABEL = {
  "akun.daftar": ["Membuat akun", Plus],
  "akun.masuk": ["Masuk (login)", LogIn],
  "akun.keluar": ["Keluar (logout)", LogOut],
  "akun.ganti_username": ["Mengganti username", Pencil],
  "akun.ganti_password": ["Mengganti password", KeyRound],
  "kegiatan.tambah": ["Menambah kegiatan", Plus],
  "kegiatan.ubah": ["Mengubah kegiatan", FileEdit],
  "kegiatan.hapus": ["Menghapus kegiatan", Trash2],
  "keuangan.tambah": ["Mencatat belanja", Plus],
  "keuangan.ubah": ["Mengubah belanja", FileEdit],
  "keuangan.hapus": ["Menghapus belanja", Trash2],
  "tim.kode.reset": ["Mencetak ulang kode tim", KeyRound],
  "pendamping.gabung": ["Pendamping bergabung ke tim", UserPlus],
  "pendamping.keluar": ["Pendamping keluar dari tim", UserMinus],
  "pendamping.keluarkan": ["Mengeluarkan pendamping", Users],
};

const fmtWaktu = (iso) => {
  try {
    const d = new Date(iso);
    return d.toLocaleString("id-ID", {
      day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return "";
  }
};

function RiwayatAktivitas() {
  const [rows, setRows] = useState(null);
  useEffect(() => {
    api.aktivitas(30).then(setRows).catch(() => setRows([]));
  }, []);

  if (rows === null) return <div className="skel mt" style={{ height: 120 }} />;
  if (!rows.length) return <p className="muted mts">Belum ada aktivitas tercatat.</p>;
  return (
    <div className="act-list">
      {rows.map((r, i) => {
        const [label, Ic] = AKSI_LABEL[r.aksi] || [r.aksi, History];
        return (
          <div key={i} className="act-item">
            <Ic className="lucide" />
            <span className="what">
              {label}
              {r.ringkas ? ` — ${r.ringkas}` : ""}
            </span>
            <span className="when">{fmtWaktu(r.ts)}</span>
          </div>
        );
      })}
    </div>
  );
}

export default function ProfilPage() {
  const [user, setUser] = useState(null);

  // Form ganti username
  const [unBaru, setUnBaru] = useState("");
  const [unPass, setUnPass] = useState("");
  const [unMsg, setUnMsg] = useState(null);
  const [unBusy, setUnBusy] = useState(false);

  // Form ganti password
  const [pwLama, setPwLama] = useState("");
  const [pwBaru, setPwBaru] = useState("");
  const [pwUlang, setPwUlang] = useState("");
  const [pwMsg, setPwMsg] = useState(null);
  const [pwBusy, setPwBusy] = useState(false);

  useEffect(() => {
    setUser(getUser());
    api.me().then((r) => {
      setUser(r.user);
      simpanUser(r.user);
    }).catch(() => {});
  }, []);

  const gantiUsername = async (ev) => {
    ev.preventDefault();
    setUnMsg(null);
    if (unBaru.trim().length < 3) {
      setUnMsg({ ok: false, text: "Username baru minimal 3 karakter" });
      return;
    }
    setUnBusy(true);
    try {
      const r = await api.updateUsername(unBaru.trim(), unPass);
      simpanUser(r.user);
      setUser(r.user);
      setUnBaru("");
      setUnPass("");
      setUnMsg({ ok: true, text: `Berhasil — username sekarang "${r.user.username}"` });
      toast.ok("Username diperbarui");
    } catch (e) {
      setUnMsg({ ok: false, text: e.message });
    } finally {
      setUnBusy(false);
    }
  };

  const gantiPassword = async (ev) => {
    ev.preventDefault();
    setPwMsg(null);
    if (pwBaru.length < 6) {
      setPwMsg({ ok: false, text: "Password baru minimal 6 karakter" });
      return;
    }
    if (pwBaru !== pwUlang) {
      setPwMsg({ ok: false, text: "Konfirmasi password tidak sama" });
      return;
    }
    setPwBusy(true);
    try {
      const r = await api.updatePassword(pwLama, pwBaru);
      setPwLama(""); setPwBaru(""); setPwUlang("");
      setPwMsg({
        ok: true,
        text: r.sesi_lain_dicabut
          ? `Password diganti — ${r.sesi_lain_dicabut} sesi di perangkat lain dikeluarkan.`
          : "Password diganti.",
      });
      toast.ok("Password diperbarui");
    } catch (e) {
      setPwMsg({ ok: false, text: e.message });
    } finally {
      setPwBusy(false);
    }
  };

  return (
    <>
      <div className="card mt profil-head">
        <div className="metric">
          <div className="profil-ava">{(user?.username || "?").charAt(0).toUpperCase()}</div>
          <div>
            <div className="metric-value">{user?.username || "…"}</div>
            <div className="muted">
              Pengaturan akun — password tersimpan sebagai hash terenkripsi, tidak bisa dilihat siapa pun.
            </div>
          </div>
        </div>
      </div>

      {/* Kode tim → dibagikan ke fasilitator/dosen supaya mereka bisa bergabung sendiri */}
      {getRole() === "tim" && <KodeTim />}

      <div className="grid half mt stagger">
        <div className="card">
          <h3><Pencil className="lucide" /> Ubah username</h3>
          <p className="sub">Nama untuk login & tampilan. Perlu konfirmasi password.</p>
          <form onSubmit={gantiUsername}>
            <label className="field">
              Username baru
              <div className="input-wrap" style={{ marginTop: 5 }}>
                <span className="in-ic" aria-hidden="true"><User className="lucide" /></span>
                <input
                  type="text"
                  value={unBaru}
                  onChange={(e) => setUnBaru(e.target.value)}
                  placeholder={user?.username || "username baru"}
                  autoComplete="username"
                />
              </div>
            </label>
            <label className="field mts">
              Password saat ini
              <PassInput
                value={unPass}
                onChange={setUnPass}
                placeholder="untuk konfirmasi"
                autoComplete="current-password"
              />
            </label>
            {unMsg && (
              <div className={unMsg.ok ? "ok-note mts" : "error-box mts"}>{unMsg.text}</div>
            )}
            <button className="btn primary mt" disabled={unBusy}>
              {unBusy ? "Menyimpan…" : <><Save className="lucide" /> Simpan username</>}
            </button>
          </form>
        </div>

        <div className="card">
          <h3><KeyRound className="lucide" /> Ubah password</h3>
          <p className="sub">Setelah diganti, sesi login di perangkat lain otomatis keluar.</p>
          <form onSubmit={gantiPassword}>
            <label className="field">
              Password lama
              <PassInput
                value={pwLama}
                onChange={setPwLama}
                placeholder="password saat ini"
                autoComplete="current-password"
              />
            </label>
            <label className="field mts">
              Password baru
              <PassInput
                value={pwBaru}
                onChange={setPwBaru}
                placeholder="minimal 6 karakter"
                autoComplete="new-password"
              />
            </label>
            <label className="field mts">
              Ulangi password baru
              <PassInput
                value={pwUlang}
                onChange={setPwUlang}
                placeholder="ketik ulang"
                autoComplete="new-password"
              />
            </label>
            {pwMsg && (
              <div className={pwMsg.ok ? "ok-note mts" : "error-box mts"}>{pwMsg.text}</div>
            )}
            <button className="btn primary mt" disabled={pwBusy}>
              {pwBusy ? "Menyimpan…" : <><Save className="lucide" /> Simpan password</>}
            </button>
          </form>
        </div>
      </div>

      <div className="card mt">
        <h3><History className="lucide" /> Riwayat aktivitas akun</h3>
        <p className="sub">30 aktivitas terakhir akunmu — login, entri baru, perubahan, dsb.</p>
        <RiwayatAktivitas />
      </div>

      <div className="card mt">
        <h3><ShieldCheck className="lucide" /> Keamanan akun</h3>
        <p className="muted mts">
          • Password disimpan memakai <b>hash scrypt</b> (satu arah) — tidak ada siapa pun,
          termasuk pengelola aplikasi, yang bisa membaca password kamu.<br />
          • Sesi login otomatis kedaluwarsa setelah <b>30 hari</b>.<br />
          • Percobaan login dibatasi (anti brute-force).<br />
          • Lupa password? Hubungi pengelola untuk disetel ulang, lalu segera ganti lewat halaman ini.<br />
          • Gunakan password unik yang tidak dipakai di layanan lain.
        </p>
      </div>
    </>
  );
}
