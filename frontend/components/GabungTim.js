"use client";

/**
 * Form "Gabung ke tim dengan kode" untuk akun PENDAMPING
 * (fasilitator & dosen pendamping).
 *
 * Tim membagikan kodenya sendiri (halaman Profil tim) → dimasukkan di sini →
 * assignment terbentuk saat itu juga, tanpa perlu bantuan admin.
 * Bisa dipakai berulang kali untuk MENAMBAH tim (many-to-many).
 *
 * Props:
 * - ringkas   : true → hanya baris input (dipakai di popover topbar)
 * - autoFocus : fokuskan input saat muncul
 * - onGabung  : dipanggil dengan objek tim setelah berhasil
 */
import { useState } from "react";
import { Link as LinkIcon, Plus } from "lucide-react";
import { api, setTimAktif, revalidate } from "@/lib/api";
import { toast } from "@/components/Toast";

export default function GabungTim({ onGabung, ringkas = false, autoFocus = false }) {
  const [kode, setKode] = useState("");
  const [busy, setBusy] = useState(false);

  const kirim = async (ev) => {
    ev.preventDefault();
    if (kode.replace(/[^A-Za-z0-9]/g, "").length < 6) {
      toast.err("Kode tim minimal 6 karakter");
      return;
    }
    setBusy(true);
    try {
      const r = await api.fasilitator.gabung(kode.trim());
      toast.ok(
        r.baru
          ? `Berhasil bergabung dengan tim ${r.tim.username}`
          : `Kamu memang sudah mendampingi tim ${r.tim.username}`
      );
      setKode("");
      setTimAktif(r.tim.id);
      await revalidate("/api/fasilitator/tim").catch(() => {});
      onGabung?.(r.tim);
    } catch (e) {
      toast.err(e.message);
    } finally {
      setBusy(false);
    }
  };

  const baris = (
    <div className="row mts" style={{ gap: 8, flexWrap: "nowrap" }}>
      <input
        value={kode}
        onChange={(e) => setKode(e.target.value.toUpperCase())}
        placeholder="mis. ABCD-2345"
        maxLength={16}
        autoFocus={autoFocus}
        style={{ flex: 1, marginTop: 0, letterSpacing: 2 }}
        aria-label="Kode tim"
      />
      <button className={ringkas ? "btn primary sm" : "btn primary"} disabled={busy}>
        <Plus className="lucide" /> {busy ? "…" : "Gabung"}
      </button>
    </div>
  );

  if (ringkas) {
    return (
      <form onSubmit={kirim}>
        <p className="muted" style={{ fontSize: ".72rem", margin: 0 }}>
          Minta <b>kode tim</b> di halaman Profil akun tim.
        </p>
        {baris}
      </form>
    );
  }

  return (
    <form onSubmit={kirim} className="card mt">
      <h3><LinkIcon className="lucide" /> Tambah tim dengan kode</h3>
      <p className="sub">
        Mendampingi lebih dari satu tim? Minta <b>kode tim</b> mereka — ada di
        halaman <b>Profil</b> akun tim — lalu masukkan di sini. Tim yang sudah
        terhubung tetap ada, tinggal berganti lewat pemilih tim di bilah atas.
      </p>
      {baris}
    </form>
  );
}

