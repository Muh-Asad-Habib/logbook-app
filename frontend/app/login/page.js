"use client";

import { useEffect, useState } from "react";
import {
  User, Lock, Eye, EyeOff, KeyRound, Sparkles, Rocket, LogIn,
  ChartColumn, Images, FileOutput,
} from "lucide-react";
import LogoMark from "@/components/Logo";
import { api, getToken, setAuth } from "@/lib/api";

export default function LoginPage() {
  const [mode, setMode] = useState("login"); // "login" | "daftar"
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [konfirmasi, setKonfirmasi] = useState("");
  const [peran, setPeran] = useState("tim"); // "tim" | "fasilitator" | "dosen"
  const [kode, setKode] = useState("");
  const [lihatPass, setLihatPass] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  // Pendaftaran akun TIM bisa ditutup admin (Pusat Kendali). null = belum dicek.
  const [daftarTimBuka, setDaftarTimBuka] = useState(null);

  // Sudah login? Langsung ke dashboard.
  useEffect(() => {
    if (getToken()) location.replace("/");
  }, []);

  // Saat tab Daftar dibuka: cek status pendaftaran tim (tanpa login).
  useEffect(() => {
    if (mode !== "daftar" || daftarTimBuka !== null) return;
    let hidup = true;
    api.statusPendaftaran()
      .then((r) => { if (hidup) setDaftarTimBuka(r?.tim !== false); })
      .catch(() => { if (hidup) setDaftarTimBuka(true); }); // gagal cek → anggap buka; server tetap memagari
    return () => { hidup = false; };
  }, [mode, daftarTimBuka]);

  // Bila tim ditutup, pindahkan pilihan default ke fasilitator agar formulir tetap bisa dipakai.
  useEffect(() => {
    if (mode === "daftar" && daftarTimBuka === false && peran === "tim") setPeran("fasilitator");
  }, [mode, daftarTimBuka, peran]);

  const submit = async (ev) => {
    ev.preventDefault();
    setErr("");
    if (!username.trim() || !password) {
      setErr("Username dan password wajib diisi");
      return;
    }
    if (mode === "daftar") {
      if (password !== konfirmasi) {
        setErr("Konfirmasi password tidak cocok");
        return;
      }
      if (peran !== "tim" && !kode.trim()) {
        setErr(`Masukkan kode ${peran === "dosen" ? "dosen pendamping" : "fasilitator"} dari admin`);
        return;
      }
    }
    setBusy(true);
    try {
      const r =
        mode === "login"
          ? await api.login(username.trim(), password)
          : await api.register(
              username.trim(),
              password,
              peran === "tim"
                ? {}
                : {
                    peran,
                    // field lama tetap dikirim agar kompatibel dengan server lama
                    ...(peran === "fasilitator"
                      ? { sebagai_fasilitator: true, kode_fasilitator: kode.trim() }
                      : { kode_dosen: kode.trim() }),
                  }
            );
      setAuth(r.token, r.user);
      location.replace("/"); // muat ulang bersih dengan sesi baru
    } catch (e) {
      setErr(e.message);
      setBusy(false);
    }
  };

  const ganti = (m) => {
    setMode(m);
    setErr("");
    setKonfirmasi("");
    setPeran("tim");
    setKode("");
  };

  const PERAN = [
    { id: "tim", label: "Tim", ket: "Mencatat kegiatan & keuangan logbook" },
    { id: "fasilitator", label: "Fasilitator", ket: "Melihat & mengomentari logbook tim" },
    { id: "dosen", label: "Dosen Pendamping", ket: "Melihat, mengomentari, & memberi ACC" },
  ];

  return (
    <div className="login-wrap">
      {/* Bola cahaya dekoratif di latar */}
      <span className="login-orb o1" aria-hidden="true" />
      <span className="login-orb o2" aria-hidden="true" />
      <span className="login-orb o3" aria-hidden="true" />

      <div className="login-card">
        <div className="login-head">
          <div className="login-ic"><LogoMark /></div>
          <h1>
            Logbook <span className="grad-text">Kegiatan &amp; Keuangan</span>
          </h1>
          <p>
            {mode === "login"
              ? "Masuk untuk membuka logbook timmu"
              : "Buat akun baru — data logbook tersimpan di akunmu"}
          </p>
        </div>

        <div className="login-tabs">
          <button
            type="button"
            className={mode === "login" ? "on" : ""}
            onClick={() => ganti("login")}
          >
            <KeyRound className="lucide" /> Masuk
          </button>
          <button
            type="button"
            className={mode === "daftar" ? "on" : ""}
            onClick={() => ganti("daftar")}
          >
            <Sparkles className="lucide" /> Daftar
          </button>
        </div>

        <form onSubmit={submit} className="login-form">
          <label className="field">
            Username
            <div className="input-wrap">
              <span className="in-ic" aria-hidden="true"><User className="lucide" /></span>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="username kamu"
                autoComplete="username"
                autoFocus
              />
            </div>
          </label>
          <label className="field">
            Password
            <div className="input-wrap login-pass">
              <span className="in-ic" aria-hidden="true"><Lock className="lucide" /></span>
              <input
                type={lihatPass ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={mode === "daftar" ? "minimal 8 karakter" : "password"}
                autoComplete={mode === "login" ? "current-password" : "new-password"}
              />
              <button
                type="button"
                className="eye"
                onClick={() => setLihatPass((v) => !v)}
                title={lihatPass ? "Sembunyikan password" : "Lihat password"}
                aria-label={lihatPass ? "Sembunyikan password" : "Lihat password"}
              >
                {lihatPass ? <EyeOff className="lucide" /> : <Eye className="lucide" />}
              </button>
            </div>
          </label>

          {mode === "daftar" && (
            <>
              <label className="field">
                Konfirmasi password
                <div className="input-wrap">
                  <span className="in-ic" aria-hidden="true"><Lock className="lucide" /></span>
                  <input
                    type={lihatPass ? "text" : "password"}
                    value={konfirmasi}
                    onChange={(e) => setKonfirmasi(e.target.value)}
                    placeholder="ulangi password"
                    autoComplete="new-password"
                  />
                </div>
              </label>

              <div className="field">
                Daftar sebagai
                {daftarTimBuka === false && (
                  <div className="login-info" role="status">
                    Pendaftaran akun <b>Tim</b> sedang ditutup oleh admin — minta admin
                    membuatkan akun untuk timmu. Pendaftaran fasilitator &amp; dosen tetap dibuka.
                  </div>
                )}
                <div style={{ display: "grid", gap: 8, marginTop: 6 }}>
                  {PERAN.map((p) => {
                    const mati = p.id === "tim" && daftarTimBuka === false;
                    return (
                    <label
                      key={p.id}
                      aria-disabled={mati || undefined}
                      style={{
                        display: "flex", alignItems: "flex-start", gap: 10,
                        cursor: mati ? "not-allowed" : "pointer", userSelect: "none", padding: "9px 12px",
                        borderRadius: 12, fontWeight: 500, opacity: mati ? 0.5 : 1,
                        border: `1px solid ${peran === p.id ? "var(--pri, #4f46e5)" : "rgba(120,130,180,.28)"}`,
                        background: peran === p.id ? "rgba(79,70,229,.07)" : "transparent",
                      }}
                    >
                      <input
                        type="radio"
                        name="peran"
                        value={p.id}
                        checked={peran === p.id}
                        disabled={mati}
                        onChange={() => { setPeran(p.id); setKode(""); }}
                        style={{ width: "auto", margin: "3px 0 0" }}
                      />
                      <span>
                        <b>{p.label}</b>
                        <small style={{ display: "block", opacity: 0.7 }}>
                          {mati ? "Ditutup sementara oleh admin" : p.ket}
                        </small>
                      </span>
                    </label>
                    );
                  })}
                </div>
              </div>

              {peran !== "tim" && (
                <label className="field">
                  Kode {peran === "dosen" ? "dosen pendamping" : "fasilitator"}
                  <div className="input-wrap">
                    <span className="in-ic" aria-hidden="true"><KeyRound className="lucide" /></span>
                    <input
                      type="text"
                      value={kode}
                      onChange={(e) => setKode(e.target.value)}
                      placeholder="kode dari admin"
                      autoComplete="off"
                    />
                  </div>
                </label>
              )}
            </>
          )}

          {err && <div className="error-box">{err}</div>}

          <button className="btn primary login-submit" disabled={busy}>
            {busy
              ? "Memproses…"
              : mode === "login"
                ? <><LogIn className="lucide" /> Masuk</>
                : <><Rocket className="lucide" /> Daftar &amp; Masuk</>}
          </button>
        </form>

        <p className="login-note">
          {mode === "login" ? (
            <>Belum punya akun?{" "}
              <button type="button" className="linklike" onClick={() => ganti("daftar")}>
                Daftar di sini
              </button>
            </>
          ) : (
            <>Sudah punya akun?{" "}
              <button type="button" className="linklike" onClick={() => ganti("login")}>
                Masuk di sini
              </button>
            </>
          )}
        </p>

        <div className="login-feats" aria-hidden="true">
          <span><ChartColumn className="lucide" /> Dashboard statistik</span>
          <span><Images className="lucide" /> Galeri foto</span>
          <span><FileOutput className="lucide" /> Ekspor DOCX · PDF · XLSX</span>
        </div>
      </div>

      <p className="login-foot">Catat kegiatan &amp; keuangan timmu dari mana saja ✨</p>
    </div>
  );
}
