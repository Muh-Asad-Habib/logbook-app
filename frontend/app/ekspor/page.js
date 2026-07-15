"use client";

import { useEffect, useState } from "react";
import {
  FileText, Printer, Sheet, Download, Upload, FileOutput, Lightbulb, TriangleAlert,
} from "lucide-react";
import { api, exportUrl, useApi, refreshData } from "@/lib/api";
import { toast } from "@/components/Toast";

const KARTU = [
  {
    Ic: FileText, judul: "Dokumen Word (.docx)", warna: "v1",
    ket: "Dokumen logbook rapi berisi seluruh kegiatan & keuangan akunmu " +
      "beserta fotonya — siap dikumpulkan atau dicetak.",
    href: "/api/export/docx", tombol: "Unduh DOCX",
  },
  {
    Ic: Printer, judul: "Dokumen PDF (.pdf)", warna: "v4",
    ket: "Rekap siap cetak: ringkasan dana, seluruh kegiatan lengkap dengan foto, " +
      "dan tabel keuangan bertotal.",
    href: "/api/export/pdf", tombol: "Unduh PDF",
  },
  {
    Ic: Sheet, judul: "Rekap Excel (.xlsx)", warna: "v5",
    ket: "Tiga sheet: Kegiatan, Keuangan, dan Ringkasan — siap diolah lebih lanjut.",
    href: "/api/export/xlsx", tombol: "Unduh Excel",
  },
];

export default function EksporPage() {
  const { data: info, error: e1 } = useApi("/api/export/info");
  const { data: stat, error: e2 } = useApi("/api/statistik");
  const [err, setErr] = useState("");
  const [file, setFile] = useState(null);
  const [busyImpor, setBusyImpor] = useState(false);
  const [hasilImpor, setHasilImpor] = useState(null);

  const loadErr = e1 || e2;
  useEffect(() => {
    if (loadErr && !info && !stat) setErr(`Gagal memuat info ekspor: ${loadErr.message}`);
  }, [loadErr, info, stat]);

  const impor = async () => {
    setBusyImpor(true);
    setHasilImpor(null);
    setErr("");
    try {
      const fd = new FormData();
      if (file) fd.append("file", file);
      const j = await api.importDocx(fd);
      setHasilImpor(j);
      toast.ok(`Impor selesai: ${j.keg_baru + j.keu_baru} entri baru`);
      refreshData();
    } catch (e) {
      setErr(`Impor gagal: ${e.message}`);
      toast.err("Impor gagal");
    } finally {
      setBusyImpor(false);
    }
  };

  return (
    <>
      {err && <div className="error-box mt">{err}</div>}

      {stat && (
        <div className="card mt">
          <div className="row spread">
            <div>
              <h3><FileOutput className="lucide" /> Ekspor logbook</h3>
              <p className="sub" style={{ marginBottom: 0 }}>
                {stat.jumlah_kegiatan} kegiatan · {stat.jumlah_belanja} belanja · capaian {stat.capaian_total}%
              </p>
            </div>
            {info && (
              <div>
                <span className="badge ok">{info.kegiatan} kegiatan baru → dokumen</span>
                <span className="badge info">{info.keuangan} belanja baru → dokumen</span>
              </div>
            )}
          </div>
          {info && info.kegiatan === 0 && info.keuangan === 0 && (
            <p className="muted mts">
              Semua entri sudah masuk ke dokumen — DOCX yang diunduh berisi data terkini akunmu.
            </p>
          )}
        </div>
      )}

      <div className="grid metrics mt stagger" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(280px, 100%), 1fr))" }}>
        {KARTU.map((k) => (
          <div key={k.judul} className="card" style={{ display: "flex", flexDirection: "column" }}>
            <div className="metric" style={{ marginBottom: 10 }}>
              <div className={`metric-ic ${k.warna}`}><k.Ic className="lucide" /></div>
              <div className="metric-value" style={{ fontSize: "1.02rem" }}>{k.judul}</div>
            </div>
            <p className="muted" style={{ flex: 1 }}>{k.ket}</p>
            <a className="btn primary mt" href={exportUrl(k.href)} style={{ textDecoration: "none" }}>
              <Download className="lucide" /> {k.tombol}
            </a>
          </div>
        ))}
      </div>

      <div className="card mt">
        <div className="metric" style={{ marginBottom: 10 }}>
          <div className="metric-ic v3"><Upload className="lucide" /></div>
          <div>
            <div className="metric-value" style={{ fontSize: "1.02rem" }}>Impor dari Word (.docx)</div>
            <div className="muted">
              Entri &amp; foto dari dokumen yang belum ada di aplikasi akan ditambahkan — yang sudah ada dilewati.
            </div>
          </div>
        </div>
        <div className="row">
          <input
            type="file" accept=".docx" style={{ flex: "1 1 260px", marginTop: 0 }}
            onChange={(e) => setFile(e.target.files?.[0] || null)}
          />
          <button className="btn primary" onClick={impor} disabled={busyImpor}>
            {busyImpor ? "Mengimpor…" : <><Upload className="lucide" /> Impor sekarang</>}
          </button>
        </div>
        <p className="muted mts">
          Entri diimpor <b>ke akunmu sendiri</b> — unggah berkas .docx logbook milikmu
          lalu klik Impor sekarang.
        </p>
        {hasilImpor && (
          <div className="mts">
            <span className="badge ok">kegiatan: {hasilImpor.keg_baru} baru</span>
            <span className="badge info">{hasilImpor.keg_lewat} dilewati</span>
            <span className="badge ok">belanja: {hasilImpor.keu_baru} baru</span>
            <span className="badge info">{hasilImpor.keu_lewat} dilewati</span>
            {hasilImpor.warnings?.map((w, i) => (
              <p key={i} className="muted mts"><TriangleAlert className="lucide" /> {w}</p>
            ))}
          </div>
        )}
      </div>

      <div className="card mt">
        <h3><Lightbulb className="lucide" /> Catatan</h3>
        <p className="muted mts">
          • Ekspor tidak mengubah data — berkas yang diunduh adalah salinan berisi data terkini.<br />
          • Entri dicocokkan dengan isi dokumen; yang sudah ada dilewati, jadi aman diunduh berulang.<br />
          • Tautan unduh juga bisa dipanggil langsung, mis. <code>/api/export/pdf</code>.
        </p>
      </div>
    </>
  );
}
