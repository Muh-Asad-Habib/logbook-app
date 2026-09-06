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
 * - Tombol tetap terlihat; gangguan/nonaktif ditampilkan dengan tindakan retry.
 * - Markdown dirender ringan TANPA innerHTML (aman dari XSS).
 */
import { useEffect, useRef, useState } from "react";
import { Sparkles, X, Send, Trash2, Loader2, TriangleAlert, ChevronDown, Check } from "lucide-react";
import { api, getTimAktif, isPendamping } from "@/lib/api";
import { useStatusAI, useModelAI, pilihModelAI, modelPilihan, ambilStatusAI, ambilModelAI } from "@/lib/ai";
import { namaCantik, namaSingkat, sifatModel, rincianTeknis, kecepatanModel, CATATAN_KECEPATAN } from "@/lib/namaModel";
import { markdownBlocks } from "@/lib/markdown";

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
  return <div className="ai-md">{markdownBlocks(teks).map((block, i) => {
    if (block.type === "ul" || block.type === "ol") {
      const Tag = block.type;
      return <Tag key={i} start={block.type === "ol" ? block.start : undefined}>{block.items.map((t, j) => <li key={j}>{inline(t, `li${i}-${j}`)}</li>)}</Tag>;
    }
    return <p key={i} className={block.type === "heading" ? "ai-h" : undefined}>{inline(block.text, `p${i}`)}</p>;
  })}</div>;
}

/* ---------- komponen utama ---------- */


export default function AsistenAI() {
  const status = useStatusAI();
  const [buka, setBuka] = useState(false);
  const [pesan, setPesan] = useState([]); // { role, content, gagal? }
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [timId, setTimId] = useState("");
  const [pendamping, setPendamping] = useState(false);
  const [errModel, setErrModel] = useState("");
  const [bukaModel, setBukaModel] = useState(false);
  const [cekBusy, setCekBusy] = useState(false);
  const siapAI = status?.aktif === true && status.tersedia !== false;
  const model = useModelAI(buka && siapAI);
  const listRef = useRef(null);
  const inputRef = useRef(null);
  const modelRef = useRef(null);
  const menuRef = useRef(null);
  const tombolRef = useRef(null);
  const fabRef = useRef(null);

  // Panel nonmodal: fokus boleh keluar lewat Tab, tanpa direbut saat jawaban tiba.
  useEffect(() => {
    if (!buka) return;
    const panel = modelRef.current;
    if (!panel) return;
    const input = inputRef.current;
    (input && !input.disabled ? input : panel.querySelector('button[aria-label="Tutup"]'))?.focus();
    return () => {
      if (panel.contains(document.activeElement) || document.activeElement === document.body) {
        fabRef.current?.focus({ preventScroll: true });
      }
    };
  }, [buka]);

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

  // Esc → tutup daftar model dulu (bila terbuka), baru panelnya
  useEffect(() => {
    if (!buka) return;
    const esc = (e) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      if (!modelRef.current?.contains(e.target) && e.target !== fabRef.current) return;
      e.preventDefault();
      if (bukaModel) {
        setBukaModel(false);
        tombolRef.current?.focus();
      } else setBuka(false);
    };
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [buka, bukaModel]);

  // Klik di luar pemilih model → tutup daftarnya
  useEffect(() => {
    if (!bukaModel) return;
    const luar = (e) => {
      if (!menuRef.current?.contains(e.target) && !tombolRef.current?.contains(e.target)) setBukaModel(false);
    };
    document.addEventListener("pointerdown", luar);
    return () => document.removeEventListener("pointerdown", luar);
  }, [bukaModel]);

  // Saat daftar dibuka: bawa model yang SEDANG dipakai ke dalam pandangan.
  // Tanpa ini, pengguna yang memilih model di urutan bawah selalu disuguhi
  // bagian atas daftar dan mengira pilihannya hilang.
  useEffect(() => {
    if (!bukaModel) return;
    const aktif = menuRef.current?.querySelector('[aria-checked="true"]');
    if (aktif && menuRef.current) {
      menuRef.current.scrollTop = Math.max(0, aktif.offsetTop - 4);
    }
    aktif?.focus({ preventScroll: true });
  }, [bukaModel]);

  /** Panah atas/bawah, Home & End untuk menjelajah daftar tanpa mouse. */
  const onKeyMenu = (e) => {
    const opsi = [...(menuRef.current?.querySelectorAll('[role="menuitemradio"]') || [])];
    if (!opsi.length) return;
    const i = opsi.indexOf(document.activeElement);
    const ke = (n) => { e.preventDefault(); opsi[n]?.focus(); };
    if (e.key === "ArrowDown") ke(i < 0 ? 0 : (i + 1) % opsi.length);
    else if (e.key === "ArrowUp") ke(i < 0 ? opsi.length - 1 : (i - 1 + opsi.length) % opsi.length);
    else if (e.key === "Home") ke(0);
    else if (e.key === "End") ke(opsi.length - 1);
  };

  const cekLagi = async () => {
    if (cekBusy) return;
    setCekBusy(true);
    try {
      const terbaru = await ambilStatusAI(true);
      if (terbaru.aktif && terbaru.tersedia !== false) await ambilModelAI(true);
    } finally { setCekBusy(false); }
  };
  const pesanStatus = !status ? 'Memeriksa layanan AI…'
    : status.gagal ? 'Status AI belum dapat diperiksa. Periksa koneksi lalu coba lagi.'
    : !status.aktif ? 'AI sedang dinonaktifkan oleh pengelola. Fitur logbook lainnya tetap dapat digunakan.'
    : status.tersedia === false ? 'Layanan AI atau daftar model belum tersedia. Coba hubungkan kembali.'
    : '';

  const kirim = async (teks) => {
    const t = String(teks ?? input).trim();
    if (!t || busy || !siapAI || (pendamping && !timId)) return;
    setInput("");
    const riwayat = pesan.filter((m) => !m.gagal).map(({ role, content }) => ({ role, content }));
    setPesan((p) => [...p, { role: "user", content: t }]);
    setBusy(true);
    try {
      // Model yang sedang dipilih pengguna ikut dikirim ("" = Otomatis).
      const r = await api.ai.tanya(t, riwayat.slice(-8), pendamping ? timId : "", modelPilihan());
      setPesan((p) => [...p, { role: "assistant", content: r.jawaban, model: r.model,
        sumber: r.sumber, profilPkm: r.profilPkm }]);
    } catch (e) {
      setPesan((p) => [...p, { role: "assistant", content: e.message || "Gagal menghubungi asisten", gagal: true }]);
    } finally {
      setBusy(false);
      setTimeout(() => {
        const panel = modelRef.current;
        if (panel && (panel.contains(document.activeElement) || document.activeElement === document.body)) {
          inputRef.current?.focus({ preventScroll: true });
        }
      }, 0);
    }
  };

  /** Ganti model — disimpan di akun agar berlaku juga di tombol AI pada formulir. */
  const gantiModel = async (nilai) => {
    setErrModel("");
    setBukaModel(false);
    tombolRef.current?.focus(); // fokus kembali ke pemicu, bukan hilang entah ke mana
    try {
      await pilihModelAI(nilai);
    } catch (e) {
      setErrModel(e.message || "Pilihan model gagal disimpan");
    }
  };

  const onKey = (e) => {
    if (e.nativeEvent.isComposing || e.keyCode === 229) {
      if (e.key === "Enter") e.preventDefault();
      return;
    }
    if (e.key === "Enter") { e.preventDefault(); if (!e.shiftKey) kirim(); }
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
        ref={fabRef}
        className={`ai-fab${buka ? " on" : ""}`}
        onClick={() => { setBuka((v) => !v); setBukaModel(false); }}
        aria-label={buka ? "Tutup asisten AI" : "Buka asisten AI"}
        aria-expanded={buka}
        aria-controls="asisten-ai-panel"
        aria-haspopup="dialog"
        title="Tanya asisten AI tentang logbook"
      >
        {buka ? <X className="lucide" /> : <Sparkles className="lucide" />}
        <span className="ai-fab-txt">Tanya AI</span>
      </button>

      {buka && (
        <section id="asisten-ai-panel" ref={modelRef} className={`ai-panel${bukaModel ? " pilih-model" : ""}`} role="dialog"
                 aria-label="Asisten AI logbook">
          <header className="ai-head">
            <div className="ai-head-ic"><Sparkles className="lucide" /></div>
            <div className="ai-head-txt">
              <b>Asisten Logbook</b>
              <small>
                {siapAI ? namaSingkat(model?.pilihan || status?.model) || "AI" : "Layanan AI belum siap"}
                {model && !model.pilihan ? " · otomatis" : ""}
                {pendamping && timId ? " · tim yang sedang dilihat" : ""}
              </small>
            </div>
            {pesan.length > 0 && (
              <button type="button" className="icon-btn" onClick={bersihkan} title="Bersihkan percakapan"
                      aria-label="Bersihkan percakapan">
                <Trash2 className="lucide" />
              </button>
            )}
            <button type="button" className="icon-btn" onClick={() => { setBuka(false); setBukaModel(false); }} aria-label="Tutup">
              <X className="lucide" />
            </button>
          </header>

          {/* Pemilih model — kamu yang menentukan, bukan sistem.
              Sengaja BUKAN <select> bawaan: popup asli peramban melebar
              mengikuti nama terpanjang (mis. "hf.co/gmonsoon/gemma2-9b-…")
              sampai menutupi layar. Daftar ini terkunci selebar panel. */}
          <div className="ai-model-bar">
            <span className="ai-model-lbl" id="ai-model-lbl">Model</span>
            <div className="ai-model-pilih">
              <button
                type="button"
                ref={tombolRef}
                className="ai-model-btn"
                aria-haspopup="menu"
                aria-expanded={bukaModel}
                aria-label={`Pilih model: ${model?.pilihan ? namaCantik(model.pilihan) : "Otomatis"}`}
                aria-controls="ai-model-menu"
                disabled={!siapAI || busy || !model || model.daftar.length === 0}
                onClick={() => setBukaModel((v) => !v)}
                title={
                  model?.pilihan
                    ? `${namaCantik(model.pilihan)} — ${model.pilihan}`
                    : `Otomatis — memakai ${model?.bawaan || "model bawaan server"}`
                }
              >
                <span className="nm">
                  {model?.pilihan ? namaCantik(model.pilihan) : "Otomatis"}
                </span>
                <ChevronDown className="lucide" />
              </button>
            </div>
            {siapAI && !model && <Loader2 className="lucide spin" aria-label="Memuat daftar model" />}
            {model && model.daftar.length === 0 && (
              <span className="ai-model-ket">Daftar model belum tersedia. Coba buka kembali nanti.</span>
            )}
            {errModel && <span role="alert" className="ai-model-ket bad">{errModel}</span>}
          </div>

          <div className="ai-content">
            {bukaModel && model && (
                <div id="ai-model-menu" className="ai-model-menu" role="menu" aria-labelledby="ai-model-lbl"
                     ref={menuRef} onKeyDown={onKeyMenu}
                     onBlur={(e) => {
                       if (!e.currentTarget.contains(e.relatedTarget) && e.relatedTarget !== tombolRef.current) setBukaModel(false);
                     }}>
                  <button
                    type="button" role="menuitemradio" aria-checked={!model.pilihan}
                    className="ai-model-opsi" onClick={() => gantiModel("")}
                    title={`Model bawaan server: ${model.bawaan || "-"}`}
                  >
                    <Check className="lucide tik" aria-hidden={!!model.pilihan} />
                    <span className="teks">
                      <span className="nm">Otomatis</span>
                      <span className="ket">
                        Pilihan bawaan untuk asisten logbook
                      </span>
                    </span>
                  </button>
                  {model.daftar.map((m) => {
                    const cantik = namaCantik(m.label);
                    return (
                      <button
                        key={m.nama}
                        type="button" role="menuitemradio" aria-checked={model.pilihan === m.nama}
                        className="ai-model-opsi" onClick={() => gantiModel(m.nama)}
                        title={`${rincianTeknis(m)}\n${CATATAN_KECEPATAN}`}
                        aria-description={CATATAN_KECEPATAN}
                      >
                        <Check className="lucide tik" aria-hidden={model.pilihan !== m.nama} />
                        <span className="teks">
                          <span className="nm">
                            {cantik}
                          </span>
                          {/* Bahasa sehari-hari, bukan "3.2B · 1,9 GB" — angkanya
                              tetap ada di tooltip lewat rincianTeknis(). */}
                          <span className="ket"><b>{kecepatanModel(m)}</b> · {sifatModel(m)}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
            )}

          <div className="ai-list" ref={listRef} inert={bukaModel} role="log" aria-label="Percakapan asisten AI" aria-live="polite" aria-busy={busy}>
            {(pesanStatus || (model && !model.daftar.length)) && (
              <div className="ai-msg assistant" role="status">
                <p>{pesanStatus || 'Daftar model belum termuat. Coba lagi tanpa memuat ulang halaman.'}</p>
                <button type="button" className="btn sm" onClick={cekLagi} disabled={cekBusy}>
                  {cekBusy ? 'Memeriksa…' : 'Coba lagi'}
                </button>
              </div>
            )}
            {pesan.length === 0 && (
              <div className="ai-kosong">
                <p>
                  Tanya apa saja tentang <b>dana</b>, <b>belanja</b>, dan <b>kegiatan</b>
                  {pendamping ? " tim ini" : "mu"} — jawaban disusun dari data logbook yang tersimpan.
                </p>
                <div className="ai-chips">
                  {PROMPT_CEPAT.map((p) => (
                    <button key={p} type="button" className="ai-chip" onClick={() => kirim(p)} disabled={!bisaTanya || !siapAI || busy}>
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
                  <div className="ai-msg-model" title={m.model}>{namaCantik(m.model)}</div>
                )}
                {m.role === "assistant" && !m.gagal && m.profilPkm?.status === "perlu_konfirmasi" && (
                  <p className="ai-msg-model">Skema/tahun tim belum dikonfirmasi. Periksa Profil &amp; rujukan PKM sebelum memakai aturan untuk menilai kepatuhan.</p>
                )}
                {m.role === "assistant" && !m.gagal && Array.isArray(m.sumber) && m.sumber.length > 0 && (
                  <details className="ai-sumber">
                    <summary>Rujukan PKM yang disediakan untuk jawaban</summary>
                    <ul>{m.sumber.slice(0, 6).filter((s) => /^https:\/\/(?:simbelmawa\.kemdiktisaintek\.go\.id|drive\.google\.com)\//i.test(s.url || "")).map((s) => (
                      <li key={s.id}><a href={s.url} target="_blank" rel="noopener noreferrer">{s.judul} · halaman PDF {s.halaman?.join(", ")}</a></li>
                    ))}</ul>
                  </details>
                )}
              </div>
            ))}
            {busy && (
              <div className="ai-msg assistant ai-tunggu">
                <Loader2 className="lucide spin" /> Membaca data logbook & menyusun jawaban…
              </div>
            )}
          </div>
          </div>

          <form className="ai-input" onSubmit={(e) => { e.preventDefault(); kirim(); }}>
            <input
              ref={inputRef}
              type="text"
              enterKeyHint="send"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKey}
              placeholder={bisaTanya ? "Tulis pertanyaan…" : "Pilih tim dulu"}
              disabled={busy || !bisaTanya || !siapAI}
              aria-label="Pertanyaan untuk asisten AI"
            />
            <button type="submit" className="btn primary" disabled={busy || !input.trim() || !bisaTanya || !siapAI}
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



