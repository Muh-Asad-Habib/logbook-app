"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Trophy, CalendarCheck, Hourglass, Receipt, Coins, TrendingDown, Rocket, Flame,
  TrendingUp, ChartColumn, ChartPie, Banknote, History, Save, Check, Plus, NotebookPen,
} from "lucide-react";
import { api, fotoUrl, fmtRupiah, fmtNominal, fmtDurasi, fmtTgl, useApi, revalidate, isPendamping } from "@/lib/api";
import { retryFoto } from "@/lib/foto";
import { BATAS_DANA_PT, rekapDana } from "@/lib/pkm";
import {
  Gauge, Heatmap, AreaChart, BarChart, Breakdown, Sparkline,
} from "@/components/Charts";
import Lightbox from "@/components/Lightbox";
import DashboardFasilitator from "@/components/DashboardFasilitator";
import KartuAcc from "@/components/KartuAcc";
import { toast } from "@/components/Toast";

/* Nominal padat KHUSUS label grafik (sumbu & tooltip) — ruangnya sempit.
   Untuk angka yang dibaca sebagai nilai uang, pakai fmtNominal/fmtRupiah
   agar tidak ada digit yang hilang. */
const fmtJt = (v) => (v >= 1_000_000 ? `Rp${(v / 1_000_000).toFixed(1)}jt` : fmtRupiah(v));

export default function Dashboard() {
  // Pendamping (fasilitator & dosen) melihat ringkasan tim — bukan dashboard pribadi
  const [roleFas, setRoleFas] = useState(null);
  useEffect(() => { setRoleFas(isPendamping()); }, []);
  if (roleFas === null) return <div className="skel mt" style={{ height: 220 }} />;
  if (roleFas) return <DashboardFasilitator />;
  return <DashboardTim />;
}

function DashboardTim() {
  const { data: stat, error: loadErr } = useApi("/api/statistik");
  const { data: kegData } = useApi("/api/kegiatan");
  const { data: keuData } = useApi("/api/keuangan");
  const kegiatan = kegData || [];
  const keuangan = keuData || [];
  const [danaBelmawa, setDanaBelmawa] = useState("");
  const [danaPt, setDanaPt] = useState("");
  const [danaSaved, setDanaSaved] = useState(false);
  const [lb, setLb] = useState(null);

  useEffect(() => {
    if (!stat) return;
    // Akun lama hanya punya dana_awal → tampilkan sebagai dana Belmawa
    const belmawa = stat.dana_belmawa || (stat.dana_pt ? 0 : stat.dana_awal) || 0;
    setDanaBelmawa(String(belmawa));
    setDanaPt(String(stat.dana_pt || 0));
  }, [stat?.dana_belmawa, stat?.dana_pt, stat?.dana_awal]);

  const simpanDana = async () => {
    try {
      const belmawa = Number(danaBelmawa) || 0;
      const pt = Number(danaPt) || 0;
      await api.setSetting("dana_belmawa", String(belmawa));
      await api.setSetting("dana_pt", String(pt));
      // dana_awal TIDAK ditulis di sini — server yang menurunkannya dari
      // (Belmawa + PT) supaya hanya ada satu sumber kebenaran.
      setDanaSaved(true);
      setTimeout(() => setDanaSaved(false), 1800);
      toast.ok("Dana kegiatan tersimpan");
      revalidate("/api/statistik").catch(() => {});
    } catch (e) {
      toast.err(`Gagal menyimpan: ${e.message}`);
    }
  };

  if (loadErr && !stat)
    return <div className="error-box mt">{`Gagal memuat data: ${loadErr.message}. Pastikan server berjalan.`}</div>;
  if (!stat)
    return (
      <div className="grid metrics mt">
        {[...Array(5)].map((_, i) => <div key={i} className="skel" style={{ height: 92 }} />)}
      </div>
    );

  // ---- Olah data grafik ----
  const capMap = {};
  for (const e of kegiatan) capMap[e.tanggal] = Math.max(capMap[e.tanggal] || 0, e.capaian_total);
  const capPoints = Object.entries(capMap).sort().map(([x, y]) => ({ x, y }));

  const jamMap = {};
  for (const e of kegiatan) jamMap[e.tanggal] = (jamMap[e.tanggal] || 0) + e.waktu_menit / 60;
  const jamPoints = Object.entries(jamMap).sort().slice(-21)
    .map(([x, y]) => ({ x, y: Math.round(y * 10) / 10 }));

  const itemMap = {};
  for (const e of keuangan) itemMap[e.item] = (itemMap[e.item] || 0) + e.total;
  let bdRows = Object.entries(itemMap).map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);
  if (bdRows.length > 6) {
    const lain = bdRows.slice(6).reduce((s, r) => s + r.value, 0);
    bdRows = [...bdRows.slice(0, 6), { label: "Lainnya", value: lain }];
  }

  let cum = 0;
  const cumPoints = [...keuangan]
    .sort((a, b) => a.tanggal.localeCompare(b.tanggal))
    .map((e) => ({ x: e.tanggal, y: (cum += e.total) }));

  const pakaiPct = stat.dana_awal > 0
    ? Math.min(100, Math.round((stat.total_pengeluaran / stat.dana_awal) * 100)) : 0;
  // Rekap per sumber dana (Belmawa/PT) — ringkasnya ditampilkan di kartu dana
  const rekap = rekapDana(keuangan, {
    belmawa: stat.dana_belmawa || 0,
    pt: stat.dana_pt || 0,
  });
  const lastDelta = kegiatan.length ? kegiatan[kegiatan.length - 1].capaian_delta : 0;
  const terbaru = [...kegiatan].reverse().slice(0, 5);
  const kosong = kegiatan.length === 0 && keuangan.length === 0;

  // Data sparkline metrik
  const sparkCap = capPoints.slice(-14).map((p) => p.y);
  const sparkJam = jamPoints.slice(-14).map((p) => p.y);
  const sparkCum = cumPoints.slice(-14).map((p) => p.y);

  if (kosong)
    return (
      <div className="empty">
        <div className="big"><Rocket className="lucide" /></div>
        <h3>Mulai catat progresmu!</h3>
        <p className="mts">Belum ada data — tambah kegiatan atau belanja pertamamu.</p>
        <div className="row mt" style={{ justifyContent: "center" }}>
          <Link href="/kegiatan" className="btn primary"><Plus className="lucide" /> Catat kegiatan</Link>
          <Link href="/keuangan" className="btn"><Plus className="lucide" /> Catat belanja</Link>
        </div>
      </div>
    );

  return (
    <>
      {/* ===== Kartu metrik ===== */}
      <div className="grid metrics mt stagger">
        <div className="card metric">
          <div className="metric-ic v1"><Trophy className="lucide" /></div>
          <div>
            <div className="metric-label">CAPAIAN</div>
            <div className="metric-value">{stat.capaian_total}%</div>
            {lastDelta > 0 && <div className="metric-delta">+{lastDelta}% entri terakhir</div>}
            <Sparkline points={sparkCap} color="#4f46e5" />
          </div>
        </div>
        <div className="card metric">
          <div className="metric-ic v2"><CalendarCheck className="lucide" /></div>
          <div>
            <div className="metric-label">KEGIATAN</div>
            <div className="metric-value">{stat.jumlah_kegiatan}</div>
          </div>
        </div>
        <div className="card metric">
          <div className="metric-ic v3"><Hourglass className="lucide" /></div>
          <div>
            <div className="metric-label">TOTAL WAKTU</div>
            <div className="metric-value">{fmtDurasi(stat.total_waktu_menit)}</div>
            <Sparkline points={sparkJam} color="#0284c7" />
          </div>
        </div>
        <div className="card metric">
          <div className="metric-ic v4"><Receipt className="lucide" /></div>
          <div>
            <div className="metric-label">PENGELUARAN</div>
            <div className="metric-value">{fmtRupiah(stat.total_pengeluaran)}</div>
            <div className="metric-delta neg">{stat.jumlah_belanja} transaksi</div>
            <Sparkline points={sparkCum} color="#0284c7" />
          </div>
        </div>
        <div className="card metric">
          <div className="metric-ic v5"><Coins className="lucide" /></div>
          <div>
            <div className="metric-label">SISA DANA</div>
            <div className="metric-value">{fmtRupiah(stat.sisa_dana)}</div>
          </div>
        </div>
      </div>

      {/* ===== Gauge + heatmap ===== */}
      <div className="grid two mt stagger">
        <div className="card">
          <h3><Trophy className="lucide" /> Capaian total</h3>
          <p className="sub">akumulasi seluruh kegiatan</p>
          <Gauge value={stat.capaian_total} />
        </div>
        <div className="card">
          <h3><Flame className="lucide" /> Peta aktivitas</h3>
          <p className="sub">intensitas kerja 18 minggu terakhir</p>
          <Heatmap kegiatan={kegiatan} />
        </div>
      </div>

      {/* ===== Grafik kegiatan ===== */}
      <div className="grid half mt stagger">
        <div className="card">
          <h3><TrendingUp className="lucide" /> Perkembangan capaian</h3>
          <p className="sub">kumulatif per tanggal</p>
          <AreaChart points={capPoints} yMax={105} fmtVal={(v) => v + "%"} id="cap" />
        </div>
        <div className="card">
          <h3><ChartColumn className="lucide" /> Curahan waktu per hari</h3>
          <p className="sub">jam kerja (21 hari aktif terakhir)</p>
          <BarChart points={jamPoints} fmtVal={(v) => v + " jam"} />
        </div>
      </div>

      {/* ===== Grafik keuangan ===== */}
      <div className="grid half mt stagger">
        <div className="card">
          <h3><ChartPie className="lucide" /> Komposisi pengeluaran</h3>
          <p className="sub">per item belanja</p>
          {/* Daftar (bukan sumbu grafik) → nominal ditulis utuh */}
          <Breakdown rows={bdRows} fmtVal={fmtNominal} />
        </div>
        <div className="card">
          <h3><TrendingDown className="lucide" /> Pengeluaran kumulatif</h3>
          <p className="sub">
            dibanding total dana {stat.dana_awal > 0 ? fmtRupiah(stat.dana_awal) : "(belum diset)"}
          </p>
          <AreaChart
            points={cumPoints}
            yMax={Math.max(stat.dana_awal, cum) * 1.08 || undefined}
            color="#0284c7" fmtVal={fmtJt} id="cum"
          />
        </div>
      </div>

      {/* ===== Dana + timeline ===== */}
      <div className="grid side mt stagger">
        <div className="card">
          <h3><Banknote className="lucide" /> Dana kegiatan</h3>
          <p className="sub">dana Belmawa &amp; Perguruan Tinggi (isi sesuai yang diterima tim)</p>
          <label className="field">
            Dana Belmawa (Rp)
            <input type="number" min="0" step="any" value={danaBelmawa}
                   onChange={(e) => setDanaBelmawa(e.target.value)} />
          </label>
          <label className="field mt">
            Dana Perguruan Tinggi (Rp)
            <input type="number" min="0" step="any" value={danaPt}
                   onChange={(e) => setDanaPt(e.target.value)} />
          </label>
          <p className="muted mts" style={{ fontSize: ".74rem" }}>
            Umumnya dana PT maksimal {fmtRupiah(BATAS_DANA_PT)}.
          </p>
          {Number(danaPt) > BATAS_DANA_PT && (
            <p className="mts" style={{ fontSize: ".76rem", color: "#b45309", fontWeight: 700 }}>
              ⚠ Dana PT melebihi {fmtRupiah(BATAS_DANA_PT)} — tetap bisa disimpan, mohon dicek lagi.
            </p>
          )}
          <button className="btn primary mt" style={{ width: "100%" }} onClick={simpanDana}>
            {danaSaved ? <><Check className="lucide" /> Tersimpan!</> : <><Save className="lucide" /> Simpan dana kegiatan</>}
          </button>
          {stat.dana_awal > 0 && (
            <>
              <div className="progress mt"><div style={{ width: `${pakaiPct}%` }} /></div>
              <div className="row spread mts">
                <span className="muted">Terpakai {pakaiPct}% dari {fmtRupiah(stat.dana_awal)}</span>
                <span className="muted"><b>{fmtRupiah(stat.sisa_dana)}</b> tersisa</span>
              </div>
            </>
          )}

          {/* Rekap ringkas per sumber — detail lengkap ada di halaman Keuangan */}
          {(rekap.totalBelmawa > 0 || rekap.totalPt > 0 || rekap.nTanpaSumber > 0) && (
            <div className="dana-mini">
              <div className="dana-mini-row">
                <span className="dot belmawa" /> Belmawa
                <b>{fmtRupiah(rekap.totalBelmawa)}</b>
                <small className="muted">
                  {rekap.danaBelmawa > 0 ? `sisa ${fmtNominal(rekap.sisaBelmawa)}` : "—"}
                </small>
              </div>
              <div className="dana-mini-row">
                <span className="dot pt" /> Perguruan Tinggi
                <b>{fmtRupiah(rekap.totalPt)}</b>
                <small className={rekap.ptLewatBatas ? "bad" : "muted"}>
                  {rekap.danaPt > 0 ? `sisa ${fmtNominal(rekap.sisaPt)}`
                    : rekap.ptLewatBatas ? "lewat batas" : "—"}
                </small>
              </div>
              {rekap.nTanpaSumber > 0 && (
                <div className="dana-mini-row">
                  <span className="dot netral" /> Belum ditandai
                  <b>{fmtRupiah(rekap.totalTanpaSumber)}</b>
                  <small className="muted">{rekap.nTanpaSumber} entri</small>
                </div>
              )}
              <Link href="/keuangan" className="dana-mini-link">Lihat rekap lengkap →</Link>
            </div>
          )}
        </div>
        <div className="card">
          <h3><History className="lucide" /> Aktivitas terbaru</h3>
          <p className="sub">5 entri terakhir</p>
          <div className="tl">
            {terbaru.map((e) => (
              <div key={e.id} className="tl-item">
                <div className="tl-dot" />
                <div className="tl-card">
                  {e.foto_keys.length > 0
                    ? <img className="tl-img" src={fotoUrl(e.foto_keys[0])}
                           alt={`Foto kegiatan ${fmtTgl(e.tanggal)}: ${e.kegiatan.slice(0, 60)}`}
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
      </div>

      {/* Rekap ACC dosen pendamping atas logbook tim ini */}
      <div className="mt"><KartuAcc /></div>

      {lb && <Lightbox {...lb} onClose={() => setLb(null)} />}
    </>
  );
}
