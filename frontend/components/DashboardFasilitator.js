"use client";

/**
 * Dashboard untuk akun FASILITATOR — ringkasan tim yang diampu.
 *
 * - Belum di-assign admin → layar "hubungi admin".
 * - Sudah → kartu metrik tim aktif (capaian, kegiatan, waktu, dana),
 *   5 kegiatan terakhir, info laporan, pintasan ke halaman lain.
 * - Multi-tim: pilih lewat switcher di topbar (Shell) — komponen ini
 *   membaca tim aktif dari localStorage & ikut event perubahannya.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Trophy, CalendarCheck, CalendarDays, Hourglass, Receipt, Coins, Phone,
  History, NotebookPen, FileText, Wallet, MessageCircle,
} from "lucide-react";
import {
  api, useApi, fotoUrl, fmtRupiah, fmtDurasi, fmtTgl, getTimAktif,
} from "@/lib/api";
import { retryFoto } from "@/lib/foto";
import Lightbox from "@/components/Lightbox";

export default function DashboardFasilitator() {
  const { data: timList, error: timErr } = useApi("/api/fasilitator/tim");
  const [timAktif, setAktif] = useState("");
  const [ringkas, setRingkas] = useState(null);
  const [gagal, setGagal] = useState("");
  const [lb, setLb] = useState(null);

  // Ikuti tim aktif dari switcher topbar
  useEffect(() => {
    setAktif(getTimAktif());
    const ganti = (e) => setAktif(String(e.detail || getTimAktif()));
    window.addEventListener("tim-aktif-berubah", ganti);
    return () => window.removeEventListener("tim-aktif-berubah", ganti);
  }, []);

  // Fallback: bila belum ada pilihan, pakai tim pertama
  const timId =
    timAktif && (timList || []).some((t) => t.id === timAktif)
      ? timAktif
      : (timList || [])[0]?.id || "";

  useEffect(() => {
    if (!timId) return;
    let hidup = true;
    setRingkas(null);
    setGagal("");
    api.fasilitator.ringkasan(timId)
      .then((r) => { if (hidup) setRingkas(r); })
      .catch((e) => { if (hidup) setGagal(e.message); });
    return () => { hidup = false; };
  }, [timId]);

  if (timErr)
    return <div className="error-box mt">{`Gagal memuat daftar tim: ${timErr.message}`}</div>;
  if (timList === undefined)
    return (
      <div className="grid metrics mt">
        {[...Array(5)].map((_, i) => <div key={i} className="skel" style={{ height: 92 }} />)}
      </div>
    );

  /* ===== Belum di-assign ===== */
  if ((timList || []).length === 0)
    return (
      <div className="empty mt">
        <div className="big"><Phone className="lucide" /></div>
        <h3>Belum ditugaskan ke tim mana pun</h3>
        <p className="mts" style={{ maxWidth: 440, margin: "8px auto 0" }}>
          Akun fasilitatormu sudah aktif, tetapi admin belum menugaskanmu
          ke tim mana pun. <b>Hubungi admin untuk menjadikan kamu fasilitator di
          tim kamu</b> — setelah ditugaskan, ringkasan tim langsung tampil di sini.
        </p>
      </div>
    );

  if (gagal)
    return <div className="error-box mt">{`Gagal memuat ringkasan tim: ${gagal}`}</div>;
  if (!ringkas)
    return (
      <div className="grid metrics mt">
        {[...Array(5)].map((_, i) => <div key={i} className="skel" style={{ height: 92 }} />)}
      </div>
    );

  const s = ringkas.statistik;
  const terbaru = ringkas.kegiatan_terakhir || [];
  const lap = ringkas.laporan || { ada: false };
  const badge = ringkas.komentar_belum_dibaca || { total: 0 };

  return (
    <>
      <p className="muted mt">
        Melihat logbook tim <b>{ringkas.tim?.username}</b> — kamu hanya dapat
        melihat &amp; mengomentari (tidak bisa mengubah data).
        {badge.total > 0 && <> · <b style={{ color: "#ef4444" }}>{badge.total} komentar belum dibaca</b></>}
      </p>

      {/* ===== Kartu metrik tim ===== */}
      <div className="grid metrics mt stagger">
        <div className="card metric">
          <div className="metric-ic v1"><Trophy className="lucide" /></div>
          <div>
            <div className="metric-label">CAPAIAN</div>
            <div className="metric-value">{s.capaian_total}%</div>
          </div>
        </div>
        <div className="card metric">
          <div className="metric-ic v2"><CalendarCheck className="lucide" /></div>
          <div>
            <div className="metric-label">KEGIATAN</div>
            <div className="metric-value">{s.jumlah_kegiatan}</div>
          </div>
        </div>
        <div className="card metric">
          <div className="metric-ic v3"><Hourglass className="lucide" /></div>
          <div>
            <div className="metric-label">TOTAL WAKTU</div>
            <div className="metric-value">{fmtDurasi(s.total_waktu_menit)}</div>
          </div>
        </div>
        <div className="card metric">
          <div className="metric-ic v4"><Receipt className="lucide" /></div>
          <div>
            <div className="metric-label">PENGELUARAN</div>
            <div className="metric-value">{fmtRupiah(s.total_pengeluaran)}</div>
            <div className="metric-delta neg">{s.jumlah_belanja} transaksi</div>
          </div>
        </div>
        <div className="card metric">
          <div className="metric-ic v5"><Coins className="lucide" /></div>
          <div>
            <div className="metric-label">SISA DANA</div>
            <div className="metric-value">{fmtRupiah(s.sisa_dana)}</div>
          </div>
        </div>
      </div>

      {/* ===== Kegiatan terakhir + laporan ===== */}
      <div className="grid side mt stagger">
        <div className="card">
          <h3><History className="lucide" /> Kegiatan terakhir tim</h3>
          <p className="sub">5 entri terbaru</p>
          {terbaru.length === 0 && <p className="muted mts">Tim belum mencatat kegiatan.</p>}
          <div className="tl">
            {terbaru.map((e) => (
              <div key={e.id} className="tl-item">
                <div className="tl-dot" />
                <div className="tl-card">
                  {e.foto_keys?.length > 0
                    ? <img className="tl-img" src={fotoUrl(e.foto_keys[0])} alt="" loading="lazy"
                           onError={retryFoto}
                           onClick={() => setLb({
                             items: e.foto_keys.map((k) => ({
                               src: fotoUrl(k), judul: fmtTgl(e.tanggal), ket: e.kegiatan.slice(0, 90),
                             })),
                             index: 0,
                           })} />
                    : <div className="tl-img"><NotebookPen className="lucide" /></div>}
                  <div style={{ minWidth: 0 }}>
                    <div className="tl-date">
                      {fmtTgl(e.tanggal)} · +{e.capaian_delta}% · {fmtDurasi(e.waktu_menit)}
                    </div>
                    <div className="tl-text">{e.kegiatan}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="card">
          <h3><FileText className="lucide" /> Laporan kemajuan</h3>
          {lap.ada ? (
            <>
              <p className="mts"><b>{lap.nama}</b></p>
              <p className="muted mts">
                {(lap.ukuran / 1024 / 1024).toFixed(1)} MB · diunggah {fmtTgl(String(lap.updated_at).slice(0, 10))}
              </p>
              <Link href="/laporan" className="btn primary mt" style={{ width: "100%" }}>
                <FileText className="lucide" /> Lihat &amp; komentari laporan
              </Link>
            </>
          ) : (
            <p className="muted mts">Tim belum mengunggah laporan kemajuan.</p>
          )}

          <h3 className="mt"><MessageCircle className="lucide" /> Pintasan</h3>
          <div className="row mts">
            <Link href="/kegiatan" className="btn sm"><CalendarDays className="lucide" /> Kegiatan</Link>
            <Link href="/keuangan" className="btn sm"><Wallet className="lucide" /> Keuangan</Link>
            <Link href="/laporan" className="btn sm"><FileText className="lucide" /> Laporan</Link>
          </div>
        </div>
      </div>
      {lb && <Lightbox {...lb} onClose={() => setLb(null)} />}
    </>
  );
}

