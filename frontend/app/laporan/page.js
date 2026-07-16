"use client";

/**
 * Laporan Kemajuan — unggah & tampilkan dokumen Word (.docx).
 *
 * - Penampil memakai docx-preview: dokumen dirender per halaman lengkap
 *   dengan gaya, tabel, dan gambarnya — tampil rapi seperti dibuka di Word.
 * - Penyimpanan hanya SATU file per akun: setiap unggahan baru otomatis
 *   MENGGANTIKAN laporan lama (tidak pernah ada dua file tersimpan).
 * - File besar diunggah terpotong agar lolos batas ±4,5 MB Vercel.
 */
import { useEffect, useRef, useState } from "react";
import {
  FileText, Upload, Download, Trash2, RefreshCw, Info, TriangleAlert,
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

export default function LaporanPage() {
  const { data: info, error: infoErr } = useApi("/api/laporan/info");
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [progres, setProgres] = useState(0);
  const [err, setErr] = useState("");
  const [memuat, setMemuat] = useState(false);
  const wadahRef = useRef(null);
  const inputRef = useRef(null);

  /* Render dokumen ke wadah — dipanggil saat info berubah (ada laporan). */
  useEffect(() => {
    let batal = false;
    async function render() {
      if (!info?.ada || !wadahRef.current) return;
      setMemuat(true);
      setErr("");
      try {
        const [buf, docx] = await Promise.all([
          api.laporanFile(),
          import("docx-preview"), // dimuat di browser saja (butuh DOM)
        ]);
        if (batal || !wadahRef.current) return;
        wadahRef.current.innerHTML = "";
        await docx.renderAsync(buf, wadahRef.current, undefined, {
          className: "docx",
          inWrapper: true,
          ignoreLastRenderedPageBreak: false,
          experimental: true,
        });
      } catch (e) {
        if (!batal) setErr(`Gagal menampilkan dokumen: ${e.message}`);
      } finally {
        if (!batal) setMemuat(false);
      }
    }
    render();
    return () => { batal = true; };
  }, [info?.ada, info?.updated_at]);

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
      if (wadahRef.current) wadahRef.current.innerHTML = "";
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

      {/* ===== Info + aksi ===== */}
      {info?.ada && (
        <div className="card mt">
          <div className="row spread">
            <div style={{ minWidth: 0 }}>
              <b>{info.nama}</b>
              <p className="muted mts" style={{ marginBottom: 0 }}>
                {fmtUkuran(info.ukuran)} · diunggah {fmtWaktu(info.updated_at)}
              </p>
            </div>
            <div className="row" style={{ marginTop: 0 }}>
              <a className="btn" style={{ textDecoration: "none" }}
                 href={`${exportUrl("/api/laporan/file")}&unduh=1`}>
                <Download className="lucide" /> Unduh
              </a>
              <button className="btn danger" onClick={hapus}>
                <Trash2 className="lucide" /> Hapus
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== Penampil dokumen ===== */}
      {info?.ada ? (
        <div className="card mt docx-card">
          {memuat && (
            <p className="muted" style={{ padding: "14px 0" }}>
              <RefreshCw className="lucide" /> Merender dokumen…
            </p>
          )}
          <div ref={wadahRef} className="docx-wrap" />
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

