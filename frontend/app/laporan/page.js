"use client";

/**
 * Laporan Kemajuan — unggah & tampilkan dokumen Word (.docx).
 *
 * Penampil: docx-preview dirender ke dalam IFRAME terisolasi sehingga CSS
 * aplikasi tidak menyentuh isi dokumen — halaman, font, tabel, dan gambar
 * tampil persis seperti dibuka di Word. Lebar otomatis menyesuaikan layar
 * (auto-fit) dan ada kontrol zoom.
 *
 * Penyimpanan hanya SATU file per akun: unggahan baru otomatis MENGGANTIKAN
 * laporan lama. File besar diunggah terpotong (lolos batas ±4,5 MB Vercel).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  FileText, Upload, Download, Trash2, Info, TriangleAlert,
  ZoomIn, ZoomOut, Maximize, Loader,
} from "lucide-react";
import { api, exportUrl, useApi, revalidate, fmtTgl } from "@/lib/api";
import { toast, confirmDialog } from "@/components/Toast";

const fmtUkuran = (b) =>
  b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil((b || 0) / 1024)} KB`;

const fmtWaktu = (iso) => {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const jam = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  return `${fmtTgl(iso.slice(0, 10))} · ${jam}`;
};

/* Gaya dasar DI DALAM iframe — meniru area kerja Word (latar abu, halaman
 * putih ber-bayangan). Isi dokumen memakai style bawaan docx-preview. */
const GAYA_IFRAME = `
  html, body { margin: 0; padding: 0; background: #525659; }
  ::-webkit-scrollbar { width: 10px; height: 10px; }
  ::-webkit-scrollbar-thumb { background: #7a7d84; border-radius: 8px; }
  ::-webkit-scrollbar-track { background: transparent; }
  .docx-wrapper {
    background: transparent !important;
    padding: 22px 14px !important;
    display: flex; flex-direction: column; align-items: center;
  }
  .docx-wrapper > section.docx {
    box-shadow: 0 5px 22px rgba(0, 0, 0, 0.45) !important;
    margin-bottom: 22px !important;
  }
  .docx-wrapper > section.docx:last-child { margin-bottom: 0 !important; }
`;

export default function LaporanPage() {
  const { data: info, error: infoErr } = useApi("/api/laporan/info");
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [progres, setProgres] = useState(0);
  const [err, setErr] = useState("");
  const [memuat, setMemuat] = useState(false);
  const [zoomPct, setZoomPct] = useState(null); // tampilan angka % di toolbar
  const frameRef = useRef(null);
  const inputRef = useRef(null);
  const zoomRef = useRef(null);       // null = auto-fit; angka = zoom manual
  const lebarHalamanRef = useRef(0);  // lebar asli halaman pertama (px)

  /* Terapkan zoom: auto-fit (pas lebar) atau persentase manual. */
  const terapkanZoom = useCallback(() => {
    const iframe = frameRef.current;
    const doc = iframe?.contentDocument;
    if (!doc?.body || !lebarHalamanRef.current) return;
    const fit = Math.min(1, (iframe.clientWidth - 30) / lebarHalamanRef.current);
    const z = zoomRef.current ?? fit;
    doc.body.style.zoom = String(z);
    setZoomPct(Math.round(z * 100));
  }, []);

  const ubahZoom = (langkah) => {
    const kini = zoomRef.current ?? (zoomPct || 100) / 100;
    zoomRef.current = Math.min(3, Math.max(0.3, kini + langkah));
    terapkanZoom();
  };
  const zoomPas = () => { zoomRef.current = null; terapkanZoom(); };

  /* Render dokumen ke dalam iframe — terisolasi dari CSS aplikasi. */
  useEffect(() => {
    let batal = false;
    async function render() {
      if (!info?.ada || !frameRef.current) return;
      setMemuat(true);
      setErr("");
      try {
        const [buf, docx] = await Promise.all([
          api.laporanFile(),
          import("docx-preview"), // hanya di browser (butuh DOM)
        ]);
        if (batal || !frameRef.current) return;
        const doc = frameRef.current.contentDocument;
        doc.head.innerHTML = "";
        doc.body.innerHTML = "";
        const style = doc.createElement("style");
        style.textContent = GAYA_IFRAME;
        doc.head.appendChild(style);
        await docx.renderAsync(buf, doc.body, doc.head, {
          className: "docx",
          inWrapper: true,
          breakPages: true,
          renderHeaders: true,
          renderFooters: true,
          renderFootnotes: true,
          renderEndnotes: true,
          ignoreLastRenderedPageBreak: false,
          useBase64URL: true, // gambar & font tersemat jadi data-URL (aman di iframe)
          experimental: true,
        });
        if (batal) return;
        const halaman = doc.querySelector("section.docx");
        lebarHalamanRef.current = halaman ? halaman.offsetWidth : 0;
        zoomRef.current = null; // mulai dari auto-fit
        terapkanZoom();
      } catch (e) {
        if (!batal) setErr(`Gagal menampilkan dokumen: ${e.message}`);
      } finally {
        if (!batal) setMemuat(false);
      }
    }
    render();
    return () => { batal = true; };
  }, [info?.ada, info?.updated_at, terapkanZoom]);

  /* Auto-fit ulang saat ukuran jendela berubah. */
  useEffect(() => {
    const onResize = () => { if (zoomRef.current == null) terapkanZoom(); };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [terapkanZoom]);

  const unggah = async () => {
    if (!file) { toast.err("Pilih berkas .docx dahulu"); return; }
    if (!file.name.toLowerCase().endsWith(".docx")) {
      toast.err("Berkas harus berformat .docx");
      return;
    }
    setBusy(true);
    setProgres(0);
    setErr("");
    try {
      await api.uploadLaporan(file, setProgres);
      toast.ok("Laporan tersimpan — file lama digantikan");
      setFile(null);
      if (inputRef.current) inputRef.current.value = "";
      revalidate("/api/laporan/info").catch(() => {});
    } catch (e) {
      setErr(`Gagal mengunggah: ${e.message}`);
      toast.err("Gagal mengunggah laporan");
    } finally {
      setBusy(false);
      setProgres(0);
    }
  };

  const hapus = async () => {
    const ya = await confirmDialog({
      judul: "Hapus laporan?",
      pesan: `${info?.nama || "Laporan kemajuan"} akan dihapus permanen.`,
    });
    if (!ya) return;
    try {
      await api.deleteLaporan();
      toast.ok("Laporan dihapus");
      revalidate("/api/laporan/info").catch(() => {});
    } catch (e) {
      toast.err(`Gagal menghapus: ${e.message}`);
    }
  };

  return (
    <>
      {/* ===== Unggah ===== */}
      <div className="card mt">
        <div className="metric" style={{ marginBottom: 10 }}>
          <div className="metric-ic v1"><FileText className="lucide" /></div>
          <div>
            <div className="metric-value" style={{ fontSize: "1.02rem" }}>
              Unggah laporan kemajuan (.docx)
            </div>
            <div className="muted">
              Hanya satu laporan yang disimpan — unggahan baru <b>otomatis menggantikan</b> file lama.
            </div>
          </div>
        </div>
        <div className="row">
          <input
            ref={inputRef} type="file" accept=".docx"
            style={{ flex: "1 1 260px", marginTop: 0 }}
            onChange={(e) => setFile(e.target.files?.[0] || null)}
          />
          <button className="btn primary" onClick={unggah} disabled={busy}>
            {busy
              ? (progres > 0 ? `Mengunggah… ${progres}%` : "Menyimpan…")
              : <><Upload className="lucide" /> {info?.ada ? "Ganti laporan" : "Unggah laporan"}</>}
          </button>
        </div>
        {file && (
          <p className="muted mts">
            <Info className="lucide" /> {file.name} · {fmtUkuran(file.size)}
            {info?.ada ? " — akan menggantikan laporan saat ini." : ""}
          </p>
        )}
      </div>

      {(err || infoErr) && (
        <div className="error-box mt">
          <TriangleAlert className="lucide" /> {err || `Gagal memuat info: ${infoErr.message}`}
        </div>
      )}

      {/* ===== Penampil dokumen ===== */}
      {info?.ada ? (
        <div className="card mt docx-card">
          <div className="row spread docx-bar">
            <div style={{ minWidth: 0 }}>
              <b className="docx-nama">{info.nama}</b>
              <span className="muted docx-meta">
                {fmtUkuran(info.ukuran)} · {fmtWaktu(info.updated_at)}
              </span>
            </div>
            <div className="row docx-tools" style={{ marginTop: 0 }}>
              <button className="btn sm" onClick={() => ubahZoom(-0.1)} title="Perkecil">
                <ZoomOut className="lucide" />
              </button>
              <span className="docx-zoom">{memuat ? "…" : `${zoomPct ?? 100}%`}</span>
              <button className="btn sm" onClick={() => ubahZoom(0.1)} title="Perbesar">
                <ZoomIn className="lucide" />
              </button>
              <button className="btn sm" onClick={zoomPas} title="Pas lebar layar">
                <Maximize className="lucide" />
              </button>
              <a className="btn sm" style={{ textDecoration: "none" }} title="Unduh berkas asli"
                 href={`${exportUrl("/api/laporan/file")}&unduh=1`}>
                <Download className="lucide" />
              </a>
              <button className="btn sm danger" onClick={hapus} title="Hapus laporan">
                <Trash2 className="lucide" />
              </button>
            </div>
          </div>

          <div className="docx-frame-wrap">
            {memuat && (
              <div className="docx-loading">
                <Loader className="lucide docx-spin" /> Merender dokumen…
              </div>
            )}
            <iframe
              ref={frameRef}
              title="Pratinjau laporan kemajuan"
              className="docx-frame"
              sandbox="allow-same-origin"
            />
          </div>
        </div>
      ) : (
        info && !info.ada && (
          <div className="empty">
            <div className="big"><FileText className="lucide" /></div>
            <p>Belum ada laporan kemajuan. Unggah berkas <b>.docx</b> untuk
            menampilkannya di sini — rapi seperti dibuka di Word.</p>
          </div>
        )
      )}
    </>
  );
}

