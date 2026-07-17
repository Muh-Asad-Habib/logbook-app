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
  const [sebagaiFas, setSebagaiFas] = useState(false);
  const [kodeFas, setKodeFas] = useState("");
  const [lihatPass, setLihatPass] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  // Sudah login? Langsung ke dashboard.
  useEffect(() => {
    if (getToken()) location.replace("/");
  }, []);

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
      if (sebagaiFas && !kodeFas.trim()) {
        setErr("Masukkan kode fasilitator dari admin");
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
              sebagaiFas
                ? { sebagai_fasilitator: true, kode_fasilitator: kodeFas.trim() }
                : {}
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
    setSebagaiFas(false);
    setKodeFas("");
  };

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
                placeholder={mode === "daftar" ? "minimal 6 karakter" : "password"}
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

              <label
                className="field"
                style={{
                  display: "flex", alignItems: "center", gap: 10,
                  cursor: "pointer", userSelect: "none",
                }}
              >
                <input
                  type="checkbox"
                  checked={sebagaiFas}
                  onChange={(e) => setSebagaiFas(e.target.checked)}
                  style={{ width: "auto", margin: 0 }}
                />
                <span>
                  Daftar sebagai <b>Fasilitator</b>
                  <small style={{ display: "block", opacity: 0.7 }}>
                    Hanya melihat &amp; mengomentari logbook tim yang ditugaskan admin
                  </small>
                </span>
              </label>

              {sebagaiFas && (
                <label className="field">
                  Kode fasilitator
                  <div className="input-wrap">
                    <span className="in-ic" aria-hidden="true"><KeyRound className="lucide" /></span>
                    <input
                      type="text"
                      value={kodeFas}
                      onChange={(e) => setKodeFas(e.target.value)}
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
            <>Belum punya akun? <a onClick={() => ganti("daftar")}>Daftar di sini</a></>
          ) : (
            <>Sudah punya akun? <a onClick={() => ganti("login")}>Masuk di sini</a></>
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
