"use client";

/**
 * Panel komentar 2 arah fasilitator ↔ tim untuk satu target
 * (entri kegiatan / entri keuangan / laporan).
 *
 * - Fasilitator memulai thread; tim membalas (parent_id).
 * - Edit milik sendiri → label "(diedit)"; hapus milik sendiri.
 * - "Tandai selesai" hanya oleh tim pada komentar induk.
 * - Saat panel dibuka, semua komentar otomatis ditandai sudah dibaca.
 *
 * Pemakaian:
 *   <KomentarPanel jenis="kegiatan" targetId={e.id} timId={timAktif} n={jumlah[e.id]} />
 *   (timId hanya diisi bila yang login fasilitator)
 */
import { useEffect, useState } from "react";
import {
  MessageCircle, Send, Pencil, Trash2, Check, CornerDownRight, X,
} from "lucide-react";
import { api, getUser, isPendamping } from "@/lib/api";
import { toast, confirmDialog } from "@/components/Toast";

const fmtWaktu = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const BULAN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
  return `${d.getDate()} ${BULAN[d.getMonth()]} ${d.getFullYear()} · ` +
    `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

/** Penanda peran penulis komentar (tim tidak diberi ikon). */
const ikonPeran = (role) =>
  role === "dosen" ? "👨‍🏫 " : role === "fasilitator" ? "🎓 " : "";

/* ---------- satu komentar (dipakai induk & balasan) ---------- */
function ItemKomentar({ k, milikku, roleTim, onBalas, onUbah, onHapus, onSelesai }) {
  const [editMode, setEditMode] = useState(false);
  const [isi, setIsi] = useState(k.isi);

  const simpan = async () => {
    const teks = isi.trim();
    if (!teks) return;
    await onUbah(k.id, teks);
    setEditMode(false);
  };

  const induk = !k.parent_id;
  return (
    <div
      style={{
        marginTop: 8,
        marginLeft: induk ? 0 : 26,
        padding: "9px 12px",
        borderRadius: 12,
        background: "var(--bg2, rgba(120,130,180,.07))",
        border: "1px solid var(--line, rgba(120,130,180,.18))",
        opacity: k.selesai ? 0.62 : 1,
      }}
    >
      <div className="row spread" style={{ gap: 6, alignItems: "baseline" }}>
        <span style={{ fontSize: ".78rem", fontWeight: 700 }}>
          {!induk && <CornerDownRight className="lucide" style={{ width: 12, height: 12 }} />}{" "}
          {ikonPeran(k.penulis_role)}{k.penulis_username || "?"}
          <span className="muted" style={{ fontWeight: 500, marginLeft: 6, fontSize: ".68rem" }}>
            {fmtWaktu(k.createdAt)}
            {k.edited_at ? " · (diedit)" : ""}
            {k.selesai ? " · ✔ selesai" : ""}
          </span>
        </span>
        <span className="row" style={{ gap: 4, marginTop: 0, flexWrap: "nowrap" }}>
          {induk && roleTim && (
            <button className="btn sm" title={k.selesai ? "Buka lagi" : "Tandai selesai"}
                    onClick={() => onSelesai(k)}>
              <Check className="lucide" />
            </button>
          )}
          {milikku && !editMode && (
            <>
              <button className="btn sm" title="Edit komentar" onClick={() => setEditMode(true)}>
                <Pencil className="lucide" />
              </button>
              <button className="btn sm danger" title="Hapus komentar" onClick={() => onHapus(k)}>
                <Trash2 className="lucide" />
              </button>
            </>
          )}
        </span>
      </div>

      {editMode ? (
        <div className="row" style={{ gap: 6, marginTop: 6 }}>
          <input value={isi} onChange={(e) => setIsi(e.target.value)} maxLength={2000}
                 aria-label="Edit isi komentar" style={{ flex: "1 1 180px", marginTop: 0 }}
                 onKeyDown={(e) => { if (e.key === "Enter") simpan(); }} autoFocus />
          <button className="btn sm primary" aria-label="Simpan komentar" onClick={simpan}><Check className="lucide" /></button>
          <button className="btn sm" aria-label="Batal edit komentar" onClick={() => { setEditMode(false); setIsi(k.isi); }}>
            <X className="lucide" />
          </button>
        </div>
      ) : (
        <p style={{ fontSize: ".85rem", marginTop: 4, whiteSpace: "pre-wrap" }}>{k.isi}</p>
      )}

      {induk && !editMode && (
        <button className="btn sm" style={{ marginTop: 6 }} onClick={() => onBalas(k)}>
          <CornerDownRight className="lucide" /> Balas
        </button>
      )}
    </div>
  );
}

/* ---------- panel utama ---------- */
export default function KomentarPanel({ jenis, targetId, timId, n = 0, onCountChange }) {
  const [buka, setBuka] = useState(false);
  const [list, setList] = useState(null);
  const [isi, setIsi] = useState("");
  const [balasKe, setBalasKe] = useState(null); // komentar induk yang dibalas
  const [busy, setBusy] = useState(false);
  const fas = isPendamping();
  const aku = getUser();

  const muat = async () => {
    try {
      const rows = await api.komentar.list(jenis, targetId, fas ? timId : undefined);
      setList(rows);
      // Tandai semua sudah dibaca (idempoten — aman diulang)
      const ids = rows.filter((k) => k.penulis_id !== aku?.id).map((k) => k.id);
      if (ids.length) api.komentar.tandaiDibaca(ids).catch(() => {});
      return rows;
    } catch (e) {
      toast.err(`Gagal memuat komentar: ${e.message}`);
      return [];
    }
  };

  useEffect(() => {
    if (buka) muat();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buka, targetId, timId]);

  const kirim = async () => {
    const teks = isi.trim();
    if (!teks) return;
    setBusy(true);
    try {
      await api.komentar.tambah({
        jenis,
        target_id: String(targetId),
        isi: teks,
        parent_id: balasKe?.id || "",
        ...(fas ? { tim: timId } : {}),
      });
      setIsi("");
      setBalasKe(null);
      const rows = await muat();
      onCountChange?.(rows.length);
    } catch (e) {
      toast.err(e.message);
    } finally {
      setBusy(false);
    }
  };

  const ubah = async (id, teks) => {
    try {
      await api.komentar.ubah(id, teks);
      await muat();
      toast.ok("Komentar diperbarui");
    } catch (e) {
      toast.err(e.message);
    }
  };

  const hapus = async (k) => {
    const ya = await confirmDialog({
      judul: "Hapus komentar?",
      pesan: `"${k.isi.slice(0, 80)}" — balasan di bawahnya ikut terhapus.`,
    });
    if (!ya) return;
    try {
      await api.komentar.hapus(k.id);
      const rows = await muat();
      onCountChange?.(rows.length);
      toast.ok("Komentar dihapus");
    } catch (e) {
      toast.err(e.message);
    }
  };

  const selesai = async (k) => {
    try {
      await api.komentar.selesai(k.id, !k.selesai);
      await muat();
    } catch (e) {
      toast.err(e.message);
    }
  };

  const jumlah = list ? list.length : n;
  // Thread: induk berurutan, balasan menempel di bawah induknya
  const induk = (list || []).filter((k) => !k.parent_id);
  const balasan = (list || []).filter((k) => k.parent_id);

  // Tim hanya bisa MEMBALAS; fasilitator bisa memulai thread baru
  const bolehTulis = fas || balasKe != null;

  return (
    <div style={{ marginTop: 10 }}>
      <button
        type="button"
        className={`btn sm ${buka ? "primary" : ""}`}
        onClick={() => setBuka((v) => !v)}
        aria-expanded={buka}
        title="Komentar pendamping & tim"
      >
        <MessageCircle className="lucide" /> {jumlah > 0 ? `${jumlah} komentar` : "Komentar"}
      </button>

      {buka && (
        <div style={{ marginTop: 4 }}>
          {list === null && <p className="muted mts">Memuat komentar…</p>}
          {list !== null && induk.length === 0 && (
            <p className="muted mts">
              {fas
                ? "Belum ada komentar — tulis komentar pertama untuk tim ini."
                : "Belum ada komentar dari pendamping untuk entri ini."}
            </p>
          )}
          {induk.map((k) => (
            <div key={k.id}>
              <ItemKomentar
                k={k}
                milikku={k.penulis_id === aku?.id}
                roleTim={!fas}
                onBalas={setBalasKe}
                onUbah={ubah}
                onHapus={hapus}
                onSelesai={selesai}
              />
              {balasan.filter((b) => b.parent_id === k.id).map((b) => (
                <ItemKomentar
                  key={b.id}
                  k={b}
                  milikku={b.penulis_id === aku?.id}
                  roleTim={!fas}
                  onBalas={() => setBalasKe(k)}
                  onUbah={ubah}
                  onHapus={hapus}
                  onSelesai={selesai}
                />
              ))}
            </div>
          ))}

          {bolehTulis ? (
            <div style={{ marginTop: 8 }}>
              {balasKe && (
                <p className="muted" style={{ fontSize: ".72rem", marginBottom: 4 }}>
                  <CornerDownRight className="lucide" style={{ width: 12, height: 12 }} />{" "}
                  Membalas {balasKe.penulis_username}{" "}
                  <button className="btn sm" style={{ padding: "1px 7px" }}
                          onClick={() => setBalasKe(null)}>
                    <X className="lucide" /> batal
                  </button>
                </p>
              )}
              <div className="row" style={{ gap: 6, flexWrap: "nowrap", marginTop: 0 }}>
                <input
                  aria-label={balasKe ? "Tulis balasan" : "Tulis komentar untuk tim"}
                  placeholder={balasKe ? "Tulis balasan…" : "Tulis komentar untuk tim…"}
                  value={isi}
                  onChange={(e) => setIsi(e.target.value)}
                  maxLength={2000}
                  style={{ flex: 1, marginTop: 0 }}
                  onKeyDown={(e) => { if (e.key === "Enter" && !busy) kirim(); }}
                />
                <button className="btn sm primary" aria-label="Kirim komentar" onClick={kirim} disabled={busy || !isi.trim()}>
                  <Send className="lucide" />
                </button>
              </div>
            </div>
          ) : (
            induk.length > 0 && (
              <p className="muted" style={{ fontSize: ".72rem", marginTop: 6 }}>
                Pilih <b>Balas</b> pada komentar pendamping untuk merespons.
              </p>
            )
          )}
        </div>
      )}
    </div>
  );
}

