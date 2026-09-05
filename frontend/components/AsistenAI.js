"use client";

/**
 * Asisten AI — tombol melayang + panel percakapan.
 *
 * Bertanya tentang isi logbook ("uang paling banyak ke mana?", "berapa persen
 * bahan habis pakai?", "kegiatan apa saja bulan Juli?") — jawaban disusun
 * model Ollama di server kampus berdasarkan data tim yang disuntik backend
 * (lihat backend/src/ai). Pembimbing bertanya tentang tim yang sedang dipilih.
 *
 * - Riwayat disimpan di sessionStorage (hilang saat tab ditutup) per tim.
 * - MODEL DIPILIH PENGGUNA lewat daftar di kepala panel ("Otomatis" = model
 *   bawaan server). Pilihan tersimpan di akun sehingga ikut dipakai tombol AI
 *   di formulir Kegiatan & Keuangan.
 * - Tombol disembunyikan bila server menjawab fitur nonaktif.
 * - Markdown dirender ringan TANPA innerHTML (aman dari XSS).
 */
import { useEffect, useRef, useState } from "react";
import { Sparkles, X, Send, Trash2, Loader2, TriangleAlert } from "lucide-react";
import { api, getTimAktif, isPendamping } from "@/lib/api";
import { useStatusAI, useModelAI, pilihModelAI, modelPilihan } from "@/lib/ai";

const PROMPT_CEPAT = [
  "Uang kami paling banyak terpakai untuk apa?",
  "Berapa persen pemakaian tiap kategori dana Belmawa? Ada yang melebihi batas?",
  "Berapa sisa dana dan berapa entri belanja yang belum ditandai sumbernya?",
  "Ringkas kegiatan bulan ini dan capaian totalnya.",
  "Belanja mana yang sebaiknya masuk kategori sewa & jasa?",
];

/* ---------- Markdown ringan → elemen React ---------- */
function inline(teks, kunci) {
  // **tebal**, `kode`, *miring*
  const bagian = String(teks).split(/(\*\*[^*]+\*\*|`[^`]+`|\*[^*\n]+\*)/g).filter(Boolean);
  return bagian.map((b, i) => {
    if (b.startsWith("**") && b.endsWith("**")) return <b key={`${kunci}-${i}`}>{b.slice(2, -2)}</b>;
    if (b.startsWith("`") && b.endsWith("`")) return <code key={`${kunci}-${i}`}>{b.slice(1, -1)}</code>;
    if (b.startsWith("*") && b.endsWith("*") && b.length > 2) return <i key={`${kunci}-${i}`}>{b.slice(1, -1)}</i>;
    return b;
  });
}

function Markdown({ teks }) {
  const baris = String(teks || "").replace(/\r/g, "").split("\n");
  const out = [];
  let daftar = null; // { jenis: "ul"|"ol", items: [] }
  const tutupDaftar = () => {
    if (!daftar) return;
    const Tag = daftar.jenis;
    out.push(<Tag key={`l${out.length}`}>{daftar.items.map((t, i) => <li key={i}>{inline(t, `li${i}`)}</li>)}</Tag>);
    daftar = null;
  };
  baris.forEach((b, i) => {
    const ul = b.match(/^\s*[-*•]\s+(.*)$/);
    const ol = b.match(/^\s*\d+[.)]\s+(.*)$/);
    const h = b.match(/^\s*#{1,4}\s+(.*)$/);
    if (ul || ol) {
      const jenis = ul ? "ul" : "ol";
      if (!daftar || daftar.jenis !== jenis) { tutupDaftar(); daftar = { jenis, items: [] }; }
      daftar.items.push((ul || ol)[1]);
      return;
    }
    tutupDaftar();
    if (h) { out.push(<p key={i} className="ai-h">{inline(h[1], `h${i}`)}</p>); return; }
    if (b.trim()) out.push(<p key={i}>{inline(b, `p${i}`)}</p>);
  });
  tutupDaftar();
  return <div className="ai-md">{out}</div>;
}

/* ---------- komponen utama ---------- */

/** "4,7 GB" — ukuran unduhan model, membantu menebak kecepatan jawabannya. */
const fmtUkuran = (byte) =>
  byte > 0 ? `${(byte / 1024 ** 3).toLocaleString("id-ID", { maximumFractionDigits: 1 })} GB` : "";

export default function AsistenAI() {
  const status = useStatusAI();
  const [buka, setBuka] = useState(false);
  const [pesan, setPesan] = useState([]); // { role, content, gagal? }
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [timId, setTimId] = useState("");
  const [pendamping, setPendamping] = useState(false);
  const [errModel, setErrModel] = useState("");
  const model = useModelAI(buka); // daftar model diunduh saat panel dibuka
  const listRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    setPendamping(isPendamping());
    setTimId(getTimAktif());
    const ganti = (e) => setTimId(String(e.detail || getTimAktif()));
    window.addEventListener("tim-aktif-berubah", ganti);
    return () => window.removeEventListener("tim-aktif-berubah", ganti);
  }, []);

  // Riwayat per tim (pendamping bisa berganti tim)
  const kunciSimpan = `logbook_ai_chat_${pendamping ? timId || "tim" : "saya"}`;
  useEffect(() => {
    try {
      const s = sessionStorage.getItem(kunciSimpan);
      setPesan(s ? JSON.parse(s) : []);
    } catch { setPesan([]); }
  }, [kunciSimpan]);
  useEffect(() => {
    try { sessionStorage.setItem(kunciSimpan, JSON.stringify(pesan.slice(-30))); } catch {}
  }, [pesan, kunciSimpan]);

  // Gulir ke bawah saat ada pesan baru / panel dibuka
  useEffect(() => {
    if (!buka) return;
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [pesan, buka, busy]);

  // Esc → tutup
  useEffect(() => {
    if (!buka) return;
    const esc = (e) => { if (e.key === "Escape") setBuka(false); };
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [buka]);

  if (!status?.aktif) return null;

  const kirim = async (teks) => {
    const t = String(teks ?? input).trim();
    if (!t || busy) return;
    setInput("");
    const riwayat = pesan.filter((m) => !m.gagal).map(({ role, content }) => ({ role, content }));
    setPesan((p) => [...p, { role: "user", content: t }]);
    setBusy(true);
    try {
      // Model yang sedang dipilih pengguna ikut dikirim ("" = Otomatis).
      const r = await api.ai.tanya(t, riwayat.slice(-8), pendamping ? timId : "", modelPilihan());
      setPesan((p) => [...p, { role: "assistant", content: r.jawaban, model: r.model }]);
    } catch (e) {
      setPesan((p) => [...p, { role: "assistant", content: e.message || "Gagal menghubungi asisten", gagal: true }]);
    } finally {
      setBusy(false);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  };

  /** Ganti model — disimpan di akun agar berlaku juga di tombol AI pada formulir. */
  const gantiModel = async (nilai) => {
    setErrModel("");
    try {
      await pilihModelAI(nilai);
    } catch (e) {
      setErrModel(e.message || "Pilihan model gagal disimpan");
    }
  };

  const onKey = (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); kirim(); }
  };

  const bersihkan = () => {
    setPesan([]);
    try { sessionStorage.removeItem(kunciSimpan); } catch {}
  };

  const bisaTanya = !pendamping || !!timId;

  return (
    <>
      <button
        type="button"
        className={`ai-fab${buka ? " on" : ""}`}
        onClick={() => setBuka((v) => !v)}
        aria-label={buka ? "Tutup asisten AI" : "Buka asisten AI"}
        aria-expanded={buka}
        title="Tanya asisten AI tentang logbook"
      >
        {buka ? <X className="lucide" /> : <Sparkles className="lucide" />}
        <span className="ai-fab-txt">Tanya AI</span>
      </button>

      {buka && (
        <section className="ai-panel" role="dialog" aria-label="Asisten AI logbook">
          <header className="ai-head">
            <div className="ai-head-ic"><Sparkles className="lucide" /></div>
            <div className="ai-head-txt">
              <b>Asisten Logbook</b>
              <small>
                {(model?.pilihan || status.model)?.split(":")[0] || "AI"}
                {model && !model.pilihan ? " · otomatis" : ""}
                {status.tersedia === false ? " · server tidak terjangkau" : ""}
                {pendamping && timId ? " · tim yang sedang dilihat" : ""}
              </small>
            </div>
            {pesan.length > 0 && (
              <button type="button" className="icon-btn" onClick={bersihkan} title="Bersihkan percakapan"
                      aria-label="Bersihkan percakapan">
                <Trash2 className="lucide" />
              </button>
            )}
            <button type="button" className="icon-btn" onClick={() => setBuka(false)} aria-label="Tutup">
              <X className="lucide" />
            </button>
          </header>

          {/* Pemilih model — kamu yang menentukan, bukan sistem. */}
          <div className="ai-model-bar">
            <label htmlFor="ai-model">Model</label>
            <select
              id="ai-model"
              value={model?.pilihan || ""}
              onChange={(e) => gantiModel(e.target.value)}
              disabled={busy || !model || model.daftar.length === 0}
              title="Pilih model yang dipakai menjawab. 'Otomatis' memakai model bawaan server."
            >
              <option value="">
                {model?.bawaan ? `Otomatis (${model.bawaan})` : "Otomatis (bawaan server)"}
              </option>
              {(model?.daftar || []).map((m) => (
                <option key={m.nama} value={m.nama}>
                  {m.label}
                  {m.parameter ? ` · ${m.parameter}` : ""}
                  {fmtUkuran(m.ukuran) ? ` · ${fmtUkuran(m.ukuran)}` : ""}
                </option>
              ))}
            </select>
            {!model && <Loader2 className="lucide spin" aria-label="Memuat daftar model" />}
            {model && model.daftar.length === 0 && (
              <span className="muted">daftar model tidak terbaca — memakai bawaan</span>
            )}
            {errModel && <span style={{ color: "var(--bad)" }}>{errModel}</span>}
          </div>

          <div className="ai-list" ref={listRef}>
            {pesan.length === 0 && (
              <div className="ai-kosong">
                <p>
                  Tanya apa saja tentang <b>dana</b>, <b>belanja</b>, dan <b>kegiatan</b>
                  {pendamping ? " tim ini" : "mu"} — jawaban disusun dari data logbook yang tersimpan.
                </p>
                <div className="ai-chips">
                  {PROMPT_CEPAT.map((p) => (
                    <button key={p} type="button" className="ai-chip" onClick={() => kirim(p)} disabled={!bisaTanya}>
                      {p}
                    </button>
                  ))}
                </div>
                {!bisaTanya && (
                  <p className="muted mts" style={{ fontSize: ".78rem" }}>
                    <TriangleAlert className="lucide" /> Pilih tim di bilah atas terlebih dahulu.
                  </p>
                )}
              </div>
            )}
            {pesan.map((m, i) => (
              <div key={i} className={`ai-msg ${m.role}${m.gagal ? " gagal" : ""}`}>
                {m.role === "assistant" ? <Markdown teks={m.content} /> : <p>{m.content}</p>}
                {/* Jejak model penjawab — penting saat pengguna membandingkan model */}
                {m.role === "assistant" && m.model && !m.gagal && (
                  <div className="ai-msg-model">{m.model}</div>
                )}
              </div>
            ))}
            {busy && (
              <div className="ai-msg assistant ai-tunggu">
                <Loader2 className="lucide spin" /> Membaca data logbook & menyusun jawaban…
              </div>
            )}
          </div>

          <form className="ai-input" onSubmit={(e) => { e.preventDefault(); kirim(); }}>
            <textarea
              ref={inputRef}
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKey}
              placeholder={bisaTanya ? "Tulis pertanyaan… (Enter untuk kirim)" : "Pilih tim dulu"}
              disabled={busy || !bisaTanya}
              aria-label="Pertanyaan untuk asisten AI"
            />
            <button type="submit" className="btn primary" disabled={busy || !input.trim() || !bisaTanya}
                    aria-label="Kirim">
              {busy ? <Loader2 className="lucide spin" /> : <Send className="lucide" />}
            </button>
          </form>
          <p className="ai-catatan">
            Jawaban AI bisa keliru — angka resmi tetap yang tertera di halaman Keuangan & Kegiatan.
          </p>
        </section>
      )}
    </>
  );
}



