"use client";

/**
 * Bantuan AI di dalam formulir — HANYA mengusulkan; pengguna yang menekan
 * "Gunakan" untuk memasukkan hasilnya ke isian. Keduanya tersembunyi bila
 * fitur AI nonaktif di server.
 *
 * Model yang dipakai mengikuti PILIHAN PENGGUNA di panel asisten AI
 * ("Otomatis" = model bawaan server) — lihat lib/ai.js.
 *
 *  <PerbaikiDeskripsiAI teks tanggal onGunakan />  — form Kegiatan
 *  <SaranSumberAI item harga sumber onGunakan />    — form Keuangan
 */
import { useState } from "react";
import { Sparkles, Loader2, Check, X, WandSparkles } from "lucide-react";
import { api } from "@/lib/api";
import { useAIAktif, modelPilihan } from "@/lib/ai";

const GAYA = [
  { id: "formal", label: "Formal" },
  { id: "ringkas", label: "Ringkas" },
  { id: "rinci", label: "Rinci" },
];

/** Tombol "Perbaiki dengan AI" + kotak usulan untuk deskripsi kegiatan. */
export function PerbaikiDeskripsiAI({ teks, tanggal, onGunakan }) {
  const aktif = useAIAktif();
  const [gaya, setGaya] = useState("formal");
  const [busy, setBusy] = useState(false);
  const [usul, setUsul] = useState(null); // { hasil, catatan, pertanyaan }
  const [err, setErr] = useState("");
  if (!aktif) return null;

  const minta = async () => {
    if (String(teks || "").trim().length < 3) {
      setErr("Tulis dulu deskripsi kasarnya, lalu minta AI merapikannya.");
      return;
    }
    setBusy(true); setErr(""); setUsul(null);
    try {
      setUsul(await api.ai.perbaikiKegiatan(teks, { tanggal, gaya, model: modelPilihan() }));
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="ai-saran-bar">
        <button type="button" className="btn sm" onClick={minta} disabled={busy}
                title="Rapikan deskripsi dengan bantuan AI — hasilnya hanya usulan">
          {busy ? <Loader2 className="lucide spin" /> : <WandSparkles className="lucide" />}
          {busy ? " Merapikan…" : " Perbaiki dengan AI"}
        </button>
        <select value={gaya} onChange={(e) => setGaya(e.target.value)} aria-label="Gaya penulisan"
                disabled={busy}>
          {GAYA.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}
        </select>
        {err && <span className="muted" style={{ fontSize: ".76rem", color: "var(--bad)" }}>{err}</span>}
      </div>
      {usul && (
        <div className="ai-usul" role="region" aria-label="Usulan deskripsi dari AI">
          <div className="ai-usul-judul"><Sparkles className="lucide" /> Usulan AI</div>
          <div className="ai-usul-teks">{usul.hasil}</div>
          {(usul.catatan || usul.pertanyaan?.length > 0) && (
            <div className="ai-usul-ket">
              {usul.catatan && <div>{usul.catatan}</div>}
              {usul.pertanyaan?.length > 0 && (
                <>
                  <div style={{ marginTop: 4 }}>Mungkin perlu ditambahkan:</div>
                  <ul>{usul.pertanyaan.map((p, i) => <li key={i}>{p}</li>)}</ul>
                </>
              )}
            </div>
          )}
          <div className="ai-usul-aksi">
            <button type="button" className="btn sm primary"
                    onClick={() => { onGunakan?.(usul.hasil); setUsul(null); }}>
              <Check className="lucide" /> Gunakan
            </button>
            <button type="button" className="btn sm" onClick={minta} disabled={busy}>
              <WandSparkles className="lucide" /> Coba lagi
            </button>
            <button type="button" className="btn sm" onClick={() => setUsul(null)}>
              <X className="lucide" /> Tutup
            </button>
          </div>
        </div>
      )}
    </>
  );
}

/** Chip "Saran AI" untuk sumber dana & kategori PKM pada form belanja. */
export function SaranSumberAI({ item, harga, onGunakan }) {
  const aktif = useAIAktif();
  const [busy, setBusy] = useState(false);
  const [saran, setSaran] = useState(null); // { sumber, kategori, label, alasan }
  const [err, setErr] = useState("");
  if (!aktif) return null;

  const minta = async () => {
    if (String(item || "").trim().length < 3) {
      setErr("Isi nama item belanja dulu.");
      return;
    }
    setBusy(true); setErr(""); setSaran(null);
    try {
      setSaran(await api.ai.saranBelanja(item, Number(harga) || 0, modelPilihan()));
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="ai-saran-bar">
      <button type="button" className="btn sm" onClick={minta} disabled={busy}
              title="Minta AI mengusulkan sumber dana & kategori PKM dari nama item">
        {busy ? <Loader2 className="lucide spin" /> : <Sparkles className="lucide" />}
        {busy ? " Menilai…" : " Saran kategori AI"}
      </button>
      {err && <span style={{ fontSize: ".76rem", color: "var(--bad)" }}>{err}</span>}
      {saran && (
        <span className="muted" style={{ fontSize: ".78rem", display: "inline-flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          Usulan: <b style={{ color: "var(--ink)" }}>{saran.label}</b>
          {saran.alasan ? ` — ${saran.alasan}` : ""}
          <button type="button" className="btn sm primary"
                  onClick={() => { onGunakan?.(saran.sumber, saran.kategori); setSaran(null); }}>
            <Check className="lucide" /> Pakai
          </button>
        </span>
      )}
    </div>
  );
}



