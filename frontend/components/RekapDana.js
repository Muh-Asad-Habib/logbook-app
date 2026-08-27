"use client";

/**
 * Rekap dana PKM — bagian informatif di halaman Keuangan.
 *
 * Menampilkan berapa dana Belmawa & PT yang sudah terpakai, rincian per
 * kategori PKM (bahan habis pakai, sewa & jasa, transportasi, lain-lain)
 * beserta batas maksimumnya, dan menandai entri yang belum diberi sumber
 * atau kategori. Sifatnya OPSIONAL: tidak ada yang diblokir, hanya penanda.
 */
import { ChartPie, TriangleAlert } from "lucide-react";
import { fmtRupiah } from "@/lib/api";
import { rekapDana, BATAS_DANA_PT } from "@/lib/pkm";

const warnaBar = (lewat, pct) =>
  lewat ? "#ef4444" : pct >= 85 ? "#f59e0b" : "#4f46e5";

export default function RekapDana({ items = [], dana, milikTim = true }) {
  const r = rekapDana(items, dana || {});
  const belumDiisi = r.danaBelmawa <= 0 && r.danaPt <= 0;
  const pctPt = Math.min(100, (r.totalPt / BATAS_DANA_PT) * 100);

  return (
    <div className="card mt">
      <h3><ChartPie className="lucide" /> Rekap dana PKM</h3>
      <p className="sub">
        pemakaian per sumber &amp; kategori — sesuai pedoman PKM 2026 (bersifat panduan)
      </p>

      {belumDiisi && (
        <p className="muted mts">
          {milikTim
            ? <>Dana Belmawa &amp; PT belum diisi — atur di <b>Dashboard → Dana kegiatan</b> agar
               persentase kategori bisa dihitung.</>
            : <>Tim belum mengisi nominal dana Belmawa &amp; PT, jadi persentase belum bisa dihitung.</>}
        </p>
      )}

      {/* ===== Ringkasan per sumber ===== */}
      <div className="rekap-sumber">
        <div className="rekap-box">
          <div className="rekap-cap">DANA BELMAWA</div>
          <div className="rekap-val">{fmtRupiah(r.totalBelmawa)}</div>
          <div className="muted" style={{ fontSize: ".74rem" }}>
            {r.danaBelmawa > 0
              ? <>terpakai dari {fmtRupiah(r.danaBelmawa)} · sisa <b>{fmtRupiah(r.sisaBelmawa)}</b></>
              : "belum ada nominal dana"}
          </div>
        </div>
        <div className="rekap-box">
          <div className="rekap-cap">DANA PERGURUAN TINGGI</div>
          <div className="rekap-val">{fmtRupiah(r.totalPt)}</div>
          <div className="muted" style={{ fontSize: ".74rem" }}>
            {r.danaPt > 0
              ? <>terpakai dari {fmtRupiah(r.danaPt)} · sisa <b>{fmtRupiah(r.sisaPt)}</b></>
              : <>maksimal {fmtRupiah(BATAS_DANA_PT)}</>}
          </div>
          <div className="progress mts">
            <div style={{ width: `${pctPt}%`, background: warnaBar(r.ptLewatBatas, pctPt) }} />
          </div>
          {r.ptLewatBatas && (
            <p className="mts" style={{ fontSize: ".74rem", color: "#ef4444", fontWeight: 700 }}>
              <TriangleAlert className="lucide" style={{ width: 13, height: 13 }} />{" "}
              Melebihi batas dana PT {fmtRupiah(BATAS_DANA_PT)}
            </p>
          )}
        </div>
      </div>

      {/* ===== Rincian kategori dana Belmawa ===== */}
      <h4 className="rekap-sub">Kategori belanja dana Belmawa</h4>
      {r.kategori.map((k) => (
        <div key={k.id} className="bd-row">
          <span className="bd-label" title={`${k.label} — maks ${k.maks}%`}>
            {k.label} <span className="muted">(maks {k.maks}%)</span>
          </span>
          <div className="bd-bar">
            <div style={{ width: `${k.pctBatas}%`, background: warnaBar(k.lewat, k.pctBatas) }} />
          </div>
          <span className="bd-val" style={k.lewat ? { color: "#ef4444" } : undefined}>
            {fmtRupiah(k.terpakai)}
            {r.danaBelmawa > 0 && <span className="muted"> · {k.pct}%</span>}
          </span>
        </div>
      ))}

      {/* ===== Penanda entri yang belum dilengkapi ===== */}
      {(r.nTanpaSumber > 0 || r.nBelmawaTanpaKategori > 0) && (
        <p className="muted mt" style={{ fontSize: ".76rem" }}>
          {r.nTanpaSumber > 0 && (
            <>
              <span className="badge netral">belum dipilih</span>
              {r.nTanpaSumber} entri ({fmtRupiah(r.totalTanpaSumber)}) belum diberi sumber dana.
            </>
          )}
          {r.nTanpaSumber > 0 && r.nBelmawaTanpaKategori > 0 && <br />}
          {r.nBelmawaTanpaKategori > 0 && (
            <>
              {r.nBelmawaTanpaKategori} entri Belmawa ({fmtRupiah(r.totalBelmawaTanpaKategori)})
              belum diberi kategori — belum masuk hitungan persentase di atas.
            </>
          )}
          {milikTim && <> Lengkapi lewat tombol <b>Edit</b> bila diperlukan (opsional).</>}
        </p>
      )}
    </div>
  );
}

