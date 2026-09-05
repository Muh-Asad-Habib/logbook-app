"use client";

/**
 * Status ACC (pengesahan) sebuah entri logbook + tombol aksi dosen.
 *
 * - Semua peran melihat LENCANA status: ⏳ Menunggu ACC / ✔ Disetujui / ↺ Revisi
 *   (+ catatan revisi dan nama dosen peninjau).
 * - Hanya akun DOSEN yang melihat tombol aksi (server tetap memagari: PUT
 *   /api/persetujuan menolak selain dosen, jadi UI bukan satu-satunya pagar).
 * - Status otomatis kembali "menunggu" bila tim mengubah entrinya.
 *
 * Pemakaian:
 *   <AccPanel jenis="kegiatan" targetId={e.id} timId={timAktif}
 *             acc={petaAcc[e.id]} onChange={muatUlangAcc} />
 */
import { useCallback, useEffect, useState } from "react";
import { BadgeCheck, Clock, RotateCcw, X } from "lucide-react";
import { api, isDosen } from "@/lib/api";
import { toast } from "@/components/Toast";

/**
 * Hook peta status ACC seluruh entri satu jenis: { [target_id]: {status,…} }.
 * Mengembalikan [peta, muatUlang] — `muatUlang` dipakai setelah dosen menekan
 * tombol ACC/revisi supaya lencana langsung berubah.
 */
export function useAcc(jenis, timId, aktif = true) {
  const [peta, setPeta] = useState({});
  const muat = useCallback(() => {
    if (!aktif) return;
    api.persetujuan.list(jenis, timId || undefined)
      .then(setPeta)
      .catch(() => {});
  }, [jenis, timId, aktif]);
  useEffect(() => { muat(); }, [muat]);
  return [peta, muat];
}

const fmtWaktu = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const BULAN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
  return `${d.getDate()} ${BULAN[d.getMonth()]} ${d.getFullYear()}`;
};

/** Lencana kecil status ACC — dipakai juga di daftar entri milik tim. */
export function AccBadge({ acc }) {
  const status = acc?.status || "menunggu";
  if (status === "disetujui")
    return <span className="badge ok" title={`Di-ACC ${acc?.dosen_username || "dosen"}`}>
      ✔ Disetujui
    </span>;
  if (status === "revisi")
    return <span className="badge danger" title={acc?.catatan || "Perlu perbaikan"}>
      ↺ Revisi
    </span>;
  return <span className="badge warn" title="Belum ditinjau dosen pendamping">⏳ Menunggu ACC</span>;
}

export default function AccPanel({ jenis, targetId, timId, acc, onChange }) {
  const [formRevisi, setFormRevisi] = useState(false);
  const [catatan, setCatatan] = useState(acc?.catatan || "");
  const [busy, setBusy] = useState(false);
  const dosen = isDosen();
  const status = acc?.status || "menunggu";

  const simpan = async (statusBaru, catatanBaru = "") => {
    setBusy(true);
    try {
      await api.persetujuan.set({
        jenis,
        target_id: String(targetId),
        status: statusBaru,
        catatan: catatanBaru,
        ...(timId ? { tim: timId } : {}),
      });
      setFormRevisi(false);
      toast.ok(
        statusBaru === "disetujui" ? "Entri di-ACC" :
        statusBaru === "revisi" ? "Permintaan revisi dikirim" : "Status dikembalikan ke menunggu"
      );
      onChange?.();
    } catch (e) {
      toast.err(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ marginTop: 8 }}>
      <div className="row" style={{ gap: 6, alignItems: "center", marginTop: 0 }}>
        <AccBadge acc={acc} />
        {acc?.dosen_username && (
          <span className="muted" style={{ fontSize: ".7rem" }}>
            oleh {acc.dosen_username}
            {acc.updatedAt ? ` · ${fmtWaktu(acc.updatedAt)}` : ""}
          </span>
        )}
      </div>

      {status === "revisi" && acc?.catatan && (
        <p style={{
          fontSize: ".78rem", marginTop: 6, padding: "7px 10px", borderRadius: 10,
          background: "rgba(239,68,68,.08)", border: "1px solid rgba(239,68,68,.25)",
          whiteSpace: "pre-wrap",
        }}>
          <b>Catatan revisi:</b> {acc.catatan}
        </p>
      )}

      {dosen && !formRevisi && (
        <div className="row" style={{ gap: 6, marginTop: 6 }}>
          {status !== "disetujui" && (
            <button className="btn sm primary" disabled={busy}
                    onClick={() => simpan("disetujui")}>
              <BadgeCheck className="lucide" /> ACC
            </button>
          )}
          {status !== "revisi" && (
            <button className="btn sm danger" disabled={busy}
                    onClick={() => { setCatatan(""); setFormRevisi(true); }}>
              <RotateCcw className="lucide" /> Minta revisi
            </button>
          )}
          {status !== "menunggu" && (
            <button className="btn sm" disabled={busy} title="Kembalikan ke status menunggu"
                    onClick={() => simpan("menunggu")}>
              <Clock className="lucide" /> Batalkan
            </button>
          )}
        </div>
      )}

      {dosen && formRevisi && (
        <div style={{ marginTop: 6 }}>
          <div className="row" style={{ gap: 6, marginTop: 0 }}>
            <input
              aria-label="Catatan perbaikan untuk tim"
              placeholder="Apa yang perlu diperbaiki tim?"
              value={catatan}
              onChange={(e) => setCatatan(e.target.value)}
              maxLength={1000}
              style={{ flex: "1 1 200px", marginTop: 0 }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && catatan.trim() && !busy) simpan("revisi", catatan.trim());
              }}
              autoFocus
            />
            <button className="btn sm danger" disabled={busy || !catatan.trim()}
                    onClick={() => simpan("revisi", catatan.trim())}>
              <RotateCcw className="lucide" /> Kirim
            </button>
            <button className="btn sm" aria-label="Batal meminta revisi" onClick={() => setFormRevisi(false)}>
              <X className="lucide" />
            </button>
          </div>
          <p className="muted" style={{ fontSize: ".7rem", marginTop: 4 }}>
            Catatan wajib diisi agar tim tahu bagian mana yang harus diperbaiki.
          </p>
        </div>
      )}
    </div>
  );
}


