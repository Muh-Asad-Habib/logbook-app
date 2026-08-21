"use client";

/**
 * Dashboard untuk akun PENDAMPING (fasilitator & dosen) — ringkasan tim.
 *
 * - Belum di-assign admin → layar "hubungi admin".
 * - Sudah → kartu metrik tim aktif (capaian, kegiatan, waktu, dana),
 *   5 kegiatan terakhir, info laporan, rekap ACC, pintasan ke halaman lain.
 * - Multi-tim: pilih lewat switcher di topbar (Shell) — komponen ini
 *   membaca tim aktif dari localStorage & ikut event perubahannya.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Trophy, CalendarCheck, CalendarDays, Hourglass, Receipt, Coins, Phone,
  History, NotebookPen, FileText, Wallet, MessageCircle, Presentation,
} from "lucide-react";
import {
  api, useApi, fotoUrl, fmtRupiah, fmtDurasi, fmtTgl, getTimAktif, isDosen,
} from "@/lib/api";
import { retryFoto } from "@/lib/foto";
import Lightbox from "@/components/Lightbox";
import KartuAcc from "@/components/KartuAcc";
import GabungTim from "@/components/GabungTim";

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

  /* ===== Belum terhubung ke tim mana pun ===== */
  if ((timList || []).length === 0)
    return (
      <>
        <div className="empty mt">
          <div className="big"><Phone className="lucide" /></div>
          <h3>Belum terhubung ke tim mana pun</h3>
          <p className="mts" style={{ maxWidth: 460, margin: "8px auto 0" }}>
            Minta <b>kode tim</b> kepada tim yang kamu dampingi — kodenya ada di
            halaman <b>Profil</b> akun mereka. Masukkan di bawah ini dan kamu
            langsung terhubung. Bisa juga minta bantuan admin.
          </p>
        </div>
        <GabungTim />
      </>
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
  const pres = ringkas.presentasi || { ada: false, file: { ada: false }, canva: { ada: false } };
  const badge = ringkas.komentar_belum_dibaca || { total: 0 };

  return (
    <>
      <p className="muted mt">
        Melihat logbook tim <b>{ringkas.tim?.username}</b> — kamu dapat melihat
        &amp; mengomentari{isDosen() ? " serta memberi ACC / meminta revisi" : ""}{" "}
        (data tim tidak bisa diubah).
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
                    ? <img className="tl-img" src={fotoUrl(e.foto_keys[0])}
                           alt={`Foto kegiatan ${fmtTgl(e.tanggal)}: ${e.kegiatan.slice(0, 60)}`}
                           loading="lazy"
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

          <h3 className="mt"><Presentation className="lucide" /> Presentasi</h3>
          {pres.ada ? (
            <>
              {pres.file?.ada && (
                <p className="mts"><b>{pres.file.nama}</b>
                  <span className="muted"> · {(pres.file.ukuran / 1024 / 1024).toFixed(1)} MB</span>
                </p>
              )}
              {pres.canva?.ada && (
                <p className="muted mts">🎨 Tautan Canva tersedia (pratinjau)</p>
              )}
              <Link href="/presentasi" className="btn primary mt" style={{ width: "100%" }}>
                <Presentation className="lucide" /> Lihat &amp; komentari presentasi
              </Link>
            </>
          ) : (
            <p className="muted mts">Tim belum mengunggah presentasi (.pptx) atau tautan Canva.</p>
          )}

          <h3 className="mt"><MessageCircle className="lucide" /> Pintasan</h3>
          <div className="row mts">
            <Link href="/kegiatan" className="btn sm"><CalendarDays className="lucide" /> Kegiatan</Link>
            <Link href="/keuangan" className="btn sm"><Wallet className="lucide" /> Keuangan</Link>
            <Link href="/laporan" className="btn sm"><FileText className="lucide" /> Laporan</Link>
            <Link href="/presentasi" className="btn sm"><Presentation className="lucide" /> Presentasi</Link>
          </div>
        </div>
      </div>

      {/* Rekap ACC tim ini (data ikut dari /ringkasan supaya tanpa request tambahan) */}
      <div className="mt"><KartuAcc timId={timId} data={ringkas.persetujuan} /></div>


      {lb && <Lightbox {...lb} onClose={() => setLb(null)} />}
    </>
  );
}

