"use client";

/**
 * Kartu "Kode tim" untuk akun TIM (halaman Profil).
 *
 * Alur yang dilayani: tim melihat kodenya → menyalin & mengirimkannya ke
 * fasilitator / dosen pendamping → mereka memasukkannya di dashboard
 * akun masing-masing dan langsung terhubung (tanpa bantuan admin).
 *
 * Tim tetap pemegang kendali: bisa mencetak ulang kode (kode lama mati)
 * dan mengeluarkan pendamping kapan saja.
 */
import { useCallback, useEffect, useState } from "react";
import { KeyRound, Copy, RefreshCw, UserMinus, Users } from "lucide-react";
import { api } from "@/lib/api";
import { toast, confirmDialog } from "@/components/Toast";

const IKON_PERAN = { dosen: "👨‍🏫", fasilitator: "🎓" };
const NAMA_PERAN = { dosen: "dosen pendamping", fasilitator: "fasilitator" };

export default function KodeTim() {
  const [kode, setKode] = useState("");
  const [list, setList] = useState(null);
  const [busy, setBusy] = useState(false);

  const muat = useCallback(() => {
    api.tim.kode().then((r) => setKode(r.kode_tampil)).catch((e) => toast.err(e.message));
    api.tim.pendamping().then(setList).catch(() => setList([]));
  }, []);

  useEffect(() => { muat(); }, [muat]);

  const salin = async () => {
    try {
      await navigator.clipboard.writeText(kode);
      toast.ok("Kode disalin — kirim ke fasilitator / dosen pendampingmu");
    } catch {
      toast.info(`Salin manual: ${kode}`);
    }
  };

  const cetakUlang = async () => {
    const ya = await confirmDialog({
      judul: "Cetak ulang kode tim?",
      pesan: "Kode lama langsung tidak berlaku. Pendamping yang sudah bergabung tetap terhubung.",
      tombol: "Cetak ulang",
    });
    if (!ya) return;
    setBusy(true);
    try {
      const r = await api.tim.resetKode();
      setKode(r.kode_tampil);
      toast.ok("Kode baru dibuat — bagikan kode yang baru");
    } catch (e) {
      toast.err(e.message);
    } finally {
      setBusy(false);
    }
  };

  const keluarkan = async (p) => {
    const ya = await confirmDialog({
      judul: `Keluarkan ${p.username}?`,
      pesan: "Ia tidak bisa lagi melihat & mengomentari logbook timmu.",
      tombol: "Keluarkan",
    });
    if (!ya) return;
    try {
      await api.tim.keluarkan(p.id);
      setList((l) => (l || []).filter((x) => x.id !== p.id));
      toast.ok("Pendamping dikeluarkan");
    } catch (e) {
      toast.err(e.message);
    }
  };

  return (
    <div className="card mt">
      <h3><KeyRound className="lucide" /> Kode tim untuk pendamping</h3>
      <p className="sub">
        Kirim kode ini ke fasilitator / dosen pendamping. Mereka memasukkannya di
        dashboard akun masing-masing, lalu langsung bisa melihat &amp; mengomentari
        logbook timmu (tanpa bisa mengubah datanya).
      </p>

      <div className="row mts" style={{ alignItems: "center", gap: 10 }}>
        <code
          style={{
            fontSize: "1.45rem",
            letterSpacing: 3,
            fontWeight: 700,
            padding: "8px 14px",
            borderRadius: 10,
            background: "rgba(99,102,241,.10)",
            border: "1px solid rgba(99,102,241,.28)",
          }}
        >
          {kode || "····-····"}
        </code>
        <button type="button" className="btn sm" onClick={salin} disabled={!kode}>
          <Copy className="lucide" /> Salin
        </button>
        <button type="button" className="btn sm" onClick={cetakUlang} disabled={busy}>
          <RefreshCw className="lucide" /> Cetak ulang
        </button>
      </div>

      <h3 className="mt"><Users className="lucide" /> Pendamping timmu</h3>
      {list === null && <div className="skel mts" style={{ height: 56 }} />}
      {list !== null && list.length === 0 && (
        <p className="muted mts">
          Belum ada pendamping yang bergabung. Bagikan kode di atas, atau minta
          bantuan admin.
        </p>
      )}
      {(list || []).map((p) => (
        <div key={p.id} className="act-item">
          <span className="what">
            {IKON_PERAN[p.role] || "👤"} <b>{p.username}</b>{" "}
            <span className="muted">({NAMA_PERAN[p.role] || p.role})</span>
          </span>
          <button
            type="button"
            className="btn sm danger"
            onClick={() => keluarkan(p)}
            title="Keluarkan dari tim"
          >
            <UserMinus className="lucide" /> Keluarkan
          </button>
        </div>
      ))}
    </div>
  );
}

