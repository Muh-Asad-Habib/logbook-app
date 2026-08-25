"use client";

/**
 * Kartu "Perangkat & sesi aktif" (halaman Profil).
 *
 * Sebelumnya, satu-satunya cara mengeluarkan perangkat yang lupa logout adalah
 * mengganti password (yang mencabut semua sesi lain) — atau meminta bantuan
 * admin. Sekarang pemilik akun bisa melihat sendiri di mana saja ia login dan
 * mengeluarkan perangkat tertentu.
 *
 * Yang ditampilkan sengaja ringkas & minim privasi: label perangkat hasil
 * pemetaan ("Chrome · Windows") dan IP yang disamarkan ("114.120.•.•").
 * Server tidak menyimpan User-Agent maupun IP utuh — lihat backend/perangkat.js.
 */
import { useCallback, useEffect, useState } from "react";
import {
  MonitorSmartphone, Monitor, Smartphone, Tablet, LogOut, RefreshCw, ShieldCheck,
} from "lucide-react";
import { api, clearAuth } from "@/lib/api";
import { toast, confirmDialog } from "@/components/Toast";

/** Ikon kasar sesuai jenis perangkat yang terbaca dari labelnya. */
function ikonUntuk(label) {
  const s = String(label || "").toLowerCase();
  if (s.includes("ipad")) return Tablet;
  if (s.includes("iphone") || s.includes("android")) return Smartphone;
  if (s) return Monitor;
  return MonitorSmartphone;
}

/** "baru saja" / "12 menit lalu" / "3 hari lalu" / tanggal untuk yang lawas. */
function sejak(iso) {
  const t = Date.parse(iso || "");
  if (!t) return "";
  const detik = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (detik < 90) return "baru saja";
  const menit = Math.round(detik / 60);
  if (menit < 60) return `${menit} menit lalu`;
  const jam = Math.round(menit / 60);
  if (jam < 24) return `${jam} jam lalu`;
  const hari = Math.round(jam / 24);
  if (hari <= 7) return `${hari} hari lalu`;
  try {
    return new Date(t).toLocaleDateString("id-ID", {
      day: "numeric", month: "short", year: "numeric",
    });
  } catch {
    return "";
  }
}

export default function SesiAktif() {
  const [list, setList] = useState(null);
  const [busy, setBusy] = useState("");

  const muat = useCallback(() => {
    api.sesi.list().then(setList).catch(() => setList([]));
  }, []);

  useEffect(() => { muat(); }, [muat]);

  /** Sesi yang sedang dipakai dicabut → sekalian keluar dari aplikasi. */
  const keluarSendiri = () => {
    clearAuth();
    location.href = "/login";
  };

  const cabut = async (s) => {
    const ya = await confirmDialog({
      judul: s.ini_perangkat ? "Keluar dari perangkat ini?" : "Keluarkan perangkat ini?",
      pesan: s.ini_perangkat
        ? "Kamu akan diminta login kembali di perangkat ini."
        : `${s.perangkat || "Perangkat tidak dikenal"} harus login ulang untuk membuka akunmu.`,
      tombol: "Keluarkan",
    });
    if (!ya) return;
    setBusy(s.id);
    try {
      const r = await api.sesi.cabut(s.id);
      if (r?.ini_perangkat) return keluarSendiri();
      setList((l) => (l || []).filter((x) => x.id !== s.id));
      toast.ok("Perangkat dikeluarkan");
    } catch (e) {
      toast.err(e.message);
    } finally {
      setBusy("");
    }
  };

  const cabutLainnya = async () => {
    const ya = await confirmDialog({
      judul: "Keluarkan semua perangkat lain?",
      pesan: "Hanya perangkat yang sedang kamu pakai sekarang yang tetap masuk.",
      tombol: "Keluarkan semua",
    });
    if (!ya) return;
    setBusy("semua");
    try {
      const r = await api.sesi.cabutLainnya();
      setList((l) => (l || []).filter((x) => x.ini_perangkat));
      toast.ok(
        r.dicabut
          ? `${r.dicabut} perangkat lain dikeluarkan`
          : "Tidak ada perangkat lain yang aktif"
      );
    } catch (e) {
      toast.err(e.message);
    } finally {
      setBusy("");
    }
  };

  const lainnya = (list || []).filter((s) => !s.ini_perangkat).length;

  return (
    <div className="card mt">
      <h3><MonitorSmartphone className="lucide" /> Perangkat &amp; sesi aktif</h3>
      <p className="sub">
        Tempat akunmu sedang dalam keadaan login. Tidak mengenali salah satunya?
        Keluarkan perangkat itu, lalu segera ganti password.
      </p>

      {list === null && <div className="skel mts" style={{ height: 72 }} />}

      {(list || []).map((s) => {
        const Ic = ikonUntuk(s.perangkat);
        return (
          <div key={s.id} className="act-item sesi-item">
            <Ic className="lucide" />
            <span className="what">
              <b>{s.perangkat || "Perangkat tidak dikenal"}</b>
              {s.ini_perangkat && (
                <span className="badge ok" style={{ marginLeft: 8 }}>perangkat ini</span>
              )}
              <span className="ket">
                {s.ip ? `${s.ip} · ` : ""}aktif {sejak(s.terakhir)}
              </span>
              {/* Sesi lawas dibuat sebelum pencatatan perangkat ada, jadi
                  kolomnya kosong — bukan tanda pembajakan. Dijelaskan supaya
                  pemilik akun tidak panik melihat "tidak dikenal". */}
              {!s.perangkat && (
                <span className="ket">
                  sesi lama — dibuat sebelum pencatatan perangkat aktif
                </span>
              )}
            </span>
            <button
              type="button"
              className="btn sm danger"
              onClick={() => cabut(s)}
              disabled={busy === s.id}
              title={s.ini_perangkat ? "Keluar dari perangkat ini" : "Keluarkan perangkat ini"}
            >
              <LogOut className="lucide" /> {s.ini_perangkat ? "Keluar" : "Keluarkan"}
            </button>
          </div>
        );
      })}

      {list !== null && (
        <div className="row mt" style={{ gap: 10, flexWrap: "wrap" }}>
          <button type="button" className="btn sm" onClick={muat}>
            <RefreshCw className="lucide" /> Segarkan
          </button>
          {lainnya > 0 && (
            <button
              type="button"
              className="btn sm danger"
              onClick={cabutLainnya}
              disabled={busy === "semua"}
            >
              <ShieldCheck className="lucide" /> Keluarkan {lainnya} perangkat lain
            </button>
          )}
        </div>
      )}
    </div>
  );
}



