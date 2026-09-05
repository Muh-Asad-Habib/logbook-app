"use client";

import { useEffect, useState } from "react";
import {
  FileText, Printer, Sheet, Download, Upload, FileOutput, Lightbulb, TriangleAlert,
  Images, Wallet,
} from "lucide-react";
import { api, useApi, refreshData } from "@/lib/api";
import { unduhZipFoto, susunDaftarZip, unduhEkspor } from "@/lib/unduh";
import { toast } from "@/components/Toast";

const KARTU = [
  {
    Ic: FileText, judul: "Dokumen Word", ext: "DOCX", warna: "v1",
    ket: "Logbook lengkap — seluruh kegiatan & keuangan beserta fotonya.",
    jenis: "docx",
  },
  {
    Ic: Printer, judul: "Dokumen PDF", ext: "PDF", warna: "v4",
    ket: "Rekap siap cetak: ringkasan dana, kegiatan berfoto & tabel keuangan.",
    jenis: "pdf",
  },
  {
    Ic: Sheet, judul: "Rekap Excel", ext: "XLSX", warna: "v5",
    ket: "Sheet Kegiatan, Keuangan & Ringkasan — siap diolah lebih lanjut.",
    jenis: "xlsx",
  },
  {
    Ic: Wallet, judul: "Khusus Keuangan", ext: "DOCX", warna: "v3",
    ket: "Tabel Belmawa per kategori + tabel PT, lengkap dengan nota & lampiran.",
    jenis: "keuangan-docx",
  },
];

/** Ukuran berkas dalam satuan yang mudah dibaca. */
const fmtUkuran = (b) =>
  b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(b / 1024)} KB`;

export default function EksporPage() {
  const { data: info, error: e1 } = useApi("/api/export/info");
  const { data: stat, error: e2 } = useApi("/api/statistik");
  const [err, setErr] = useState("");
  const [file, setFile] = useState(null);
  const [busyImpor, setBusyImpor] = useState(false);
  const [progres, setProgres] = useState(0);
  const [hasilImpor, setHasilImpor] = useState(null);
  const [busyZip, setBusyZip] = useState(false);
  const [progresZip, setProgresZip] = useState("");
  const [busyEkspor, setBusyEkspor] = useState("");

  /**
   * Unduh berkas ekspor. Server hanya menyiapkan berkas & mengirim tautan;
   * byte-nya ditarik langsung dari CDN (lihat lib/unduh.js) sehingga tidak
   * dibatasi ukuran respons Vercel — dokumen bisa memuat foto resolusi tinggi.
   */
  const unduhBerkas = async (jenis, label) => {
    setBusyEkspor(jenis);
    try {
      const ukuran = await unduhEkspor(jenis);
      toast.ok(ukuran ? `${label} tersimpan (${fmtUkuran(ukuran)})` : `${label} sedang diunduh`);
    } catch (e) {
      toast.err(`Gagal menyiapkan ${label}: ${e.message}`);
    } finally {
      setBusyEkspor("");
    }
  };

  // Unduh SEMUA foto (kegiatan + bukti keuangan) sebagai satu ZIP dengan
  // folder per tanggal — dirakit di browser agar bebas batas respons Vercel.
  const unduhSemuaFoto = async () => {
    setBusyZip(true);
    setProgresZip("Menyiapkan daftar…");
    try {
      const [keg, keu] = await Promise.all([api.listKegiatan(), api.listKeuangan()]);
      const daftar = susunDaftarZip(keg, keu);
      if (!daftar.length) {
        toast.err("Belum ada foto untuk diunduh");
        return;
      }
      const n = await unduhZipFoto(daftar, "foto-logbook.zip", (selesai, total) =>
        setProgresZip(`Mengunduh ${selesai}/${total} foto…`)
      );
      toast.ok(`${n} foto tersimpan di foto-logbook.zip`);
    } catch (e) {
      toast.err(`Gagal mengunduh: ${e.message}`);
    } finally {
      setBusyZip(false);
      setProgresZip("");
    }
  };

  const loadErr = e1 || e2;
  useEffect(() => {
    if (loadErr && !info && !stat) setErr(`Gagal memuat info ekspor: ${loadErr.message}`);
  }, [loadErr, info, stat]);

  const impor = async () => {
    setBusyImpor(true);
    setProgres(0);
    setHasilImpor(null);
    setErr("");
    try {
      // Berkas diunggah LANGSUNG ke penyimpanan (ImageKit), bukan lewat server —
      // bebas dari batas body ±4,5 MB Vercel. Setelah unggah 100%, server
      // menarik & membaca dokumennya (tahap "Membaca dokumen…").
      const j = await api.importDocx(file, (p) => setProgres(p));
      setHasilImpor(j);
      toast.ok(`Impor selesai: ${j.keg_baru + j.keu_baru} entri baru`);
      refreshData();
    } catch (e) {
      setErr(`Impor gagal: ${e.message}`);
      toast.err("Impor gagal");
    } finally {
      setBusyImpor(false);
      setProgres(0);
    }
  };

  return (
    <>
      {err && <div className="error-box mt">{err}</div>}

      {stat && (
        <div className="card mt eks-ringkas">
          <div className="row spread">
            <div>
              <h3><FileOutput className="lucide" /> Ekspor logbook</h3>
              <p className="sub" style={{ marginBottom: 0 }}>
                {stat.jumlah_kegiatan} kegiatan · {stat.jumlah_belanja} belanja · capaian {stat.capaian_total}%
              </p>
            </div>
            {info && (
              <div className="eks-status">
                {info.kegiatan === 0 && info.keuangan === 0 ? (
                  <span className="badge ok">✓ semua entri terkini</span>
                ) : (
                  <>
                    <span className="badge ok">{info.kegiatan} kegiatan baru</span>
                    <span className="badge info">{info.keuangan} belanja baru</span>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="eks-grid mt stagger">
        {KARTU.map((k) => (
          <div key={k.jenis} className="card eks-card">
            <div className="eks-head">
              <div className={`metric-ic ${k.warna}`}><k.Ic className="lucide" /></div>
              <div className="eks-judul">
                {k.judul}
                <span className="eks-tag">{k.ext}</span>
              </div>
            </div>
            <p className="eks-ket">{k.ket}</p>
            <button
              className="btn primary"
              onClick={() => unduhBerkas(k.jenis, k.judul)}
              disabled={busyEkspor === k.jenis}
            >
              <Download className="lucide" />{" "}
              {busyEkspor === k.jenis ? "Menyiapkan…" : "Unduh"}
            </button>
          </div>
        ))}
        <div className="card eks-card">
          <div className="eks-head">
            <div className="metric-ic v2"><Images className="lucide" /></div>
            <div className="eks-judul">
              Semua Foto
              <span className="eks-tag">ZIP</span>
            </div>
          </div>
          <p className="eks-ket">
            Seluruh foto &amp; bukti belanja (JPG), rapi dalam folder per tanggal.
          </p>
          <button className="btn primary" onClick={unduhSemuaFoto} disabled={busyZip}>
            <Download className="lucide" /> {busyZip ? (progresZip || "Menyiapkan…") : "Unduh"}
          </button>
        </div>
      </div>

      <div className="card mt">
        <div className="eks-head" style={{ marginBottom: 10 }}>
          <div className="metric-ic v3"><Upload className="lucide" /></div>
          <div className="eks-judul">
            Impor dari Word
            <span className="eks-tag">DOCX</span>
          </div>
        </div>
        <p className="eks-ket" style={{ marginBottom: 12 }}>
          Entri &amp; foto dari logbook Word lamamu ditambahkan ke akunmu — yang sudah ada dilewati.
        </p>
        <div className="row">
          <input
            type="file" accept=".docx" style={{ flex: "1 1 260px", marginTop: 0 }}
            onChange={(e) => setFile(e.target.files?.[0] || null)}
          />
          <button className="btn primary" onClick={impor} disabled={busyImpor}>
            {busyImpor
              ? (progres > 0 && progres < 100
                  ? `Mengunggah… ${progres}%`
                  : progres >= 100
                    ? "Membaca dokumen & memindahkan foto…"
                    : "Mengimpor…")
              : <><Upload className="lucide" /> Impor</>}
          </button>
        </div>
        {hasilImpor && (
          <div className="mts">
            <span className="badge ok">kegiatan: {hasilImpor.keg_baru} baru</span>
            <span className="badge info">{hasilImpor.keg_lewat} dilewati</span>
            <span className="badge ok">belanja: {hasilImpor.keu_baru} baru</span>
            <span className="badge info">{hasilImpor.keu_lewat} dilewati</span>
            {hasilImpor.foto_baru > 0 && (
              <span className="badge info">{hasilImpor.foto_baru} foto dipindahkan</span>
            )}
            {hasilImpor.warnings?.map((w, i) => (
              <p key={i} className="muted mts"><TriangleAlert className="lucide" /> {w}</p>
            ))}
          </div>
        )}
      </div>

      <div className="card mt">
        <h3><Lightbulb className="lucide" /> Catatan</h3>
        <ul className="eks-list">
          <li>Ekspor tidak mengubah data — berkas selalu salinan terbaru, aman diunduh berulang.</li>
          <li>
            Bila data belum berubah sejak unduhan terakhir, berkas yang sama langsung diberikan dari
            penyimpanan (tidak dibangun ulang) — unduhan berikutnya jadi instan.
          </li>
          <li>Foto disematkan utuh beresolusi tinggi, tanpa batas ukuran unduhan.</li>
          <li>
            <b>Khusus Keuangan</b> berdiri sendiri: nota tampil di kolom <i>Nota</i> dan
            berukuran besar di Lampiran dengan nomor sama (L-1, L-2, …).
          </li>
        </ul>
      </div>
    </>
  );
}
