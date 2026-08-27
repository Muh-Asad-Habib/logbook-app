"use client";

/**
 * Rekap dana PKM — bagian informatif di halaman Keuangan.
 *
 * Menampilkan pemakaian dana Belmawa & PT, rincian per kategori PKM
 * (bahan habis pakai, sewa & jasa, transportasi, lain-lain) beserta batas
 * maksimumnya, dan menandai entri yang belum diberi sumber/kategori.
 *
 * Sifatnya OPSIONAL: tidak ada yang diblokir, semuanya hanya penanda.
 */
import { ChartPie, TriangleAlert, Info, Landmark, Building2 } from "lucide-react";
import { fmtRupiah } from "@/lib/api";
import { rekapDana, BATAS_DANA_PT } from "@/lib/pkm";

const warnaBar = (lewat, pct) =>
  lewat ? "var(--bad, #ef4444)" : pct >= 85 ? "#f59e0b" : "var(--p1, #4f46e5)";

/** Nominal ringkas untuk layar sempit: Rp1,2 jt */
const fmtRingkas = (v) =>
  Math.abs(v) >= 1_000_000
    ? `Rp${(v / 1_000_000).toFixed(1).replace(".", ",")} jt`
    : fmtRupiah(v);

function KartuSumber({ Ic, label, terpakai, ket, pct, warna, peringatan }) {
  return (
    <div className="rekap-box">
      <div className="rekap-cap"><Ic className="lucide" /> {label}</div>
      <div className="rekap-val" style={{ color: warna }}>{fmtRupiah(terpakai)}</div>
      <div className="rekap-ket">{ket}</div>
      <div className="rekap-bar" aria-hidden="true">
        <div style={{ width: `${pct}%`, background: warna }} />
      </div>
      {peringatan && (
        <p className="rekap-warn">
          <TriangleAlert className="lucide" /> {peringatan}
        </p>
      )}
    </div>
  );
}

export default function RekapDana({ items, dana, milikTim = true, memuat = false }) {
  // Skeleton: dipakai saat daftar entri / nominal dana masih dalam perjalanan
  if (memuat || !items) {
    return (
      <div className="card mt">
        <h3><ChartPie className="lucide" /> Rekap dana PKM</h3>
        <div className="rekap-sumber">
          <div className="skel" style={{ height: 112 }} />
          <div className="skel" style={{ height: 112 }} />
        </div>
        <div className="skel" style={{ height: 96, marginTop: 16 }} />
      </div>
    );
  }

  const r = rekapDana(items, dana || {});
  const danaKosong = r.danaBelmawa <= 0 && r.danaPt <= 0;
  const belumAdaPenanda = r.totalBelmawa === 0 && r.totalPt === 0;

  const pctBelmawa = r.danaBelmawa > 0
    ? Math.min(100, (r.totalBelmawa / r.danaBelmawa) * 100) : 0;
  const pctPt = r.danaPt > 0
    ? Math.min(100, (r.totalPt / r.danaPt) * 100)
    : Math.min(100, (r.totalPt / BATAS_DANA_PT) * 100);

  return (
    <div className="card mt rekap-card">
      <div className="rekap-head">
        <h3><ChartPie className="lucide" /> Rekap dana PKM</h3>
        <span className="badge netral rekap-tag">opsional</span>
      </div>
      <p className="sub">pemakaian per sumber &amp; kategori — mengikuti pedoman PKM 2026</p>

      {/* ===== Ringkasan per sumber ===== */}
      <div className="rekap-sumber">
        <KartuSumber
          Ic={Landmark}
          label="DANA BELMAWA"
          terpakai={r.totalBelmawa}
          pct={pctBelmawa}
          warna="var(--p1, #4f46e5)"
          ket={r.danaBelmawa > 0
            ? <>dari {fmtRingkas(r.danaBelmawa)} · sisa <b>{fmtRingkas(r.sisaBelmawa)}</b></>
            : "nominal dana belum diisi"}
        />
        <KartuSumber
          Ic={Building2}
          label="DANA PERGURUAN TINGGI"
          terpakai={r.totalPt}
          pct={pctPt}
          warna={r.ptLewatBatas ? "var(--bad, #ef4444)" : "#db2777"}
          ket={r.danaPt > 0
            ? <>dari {fmtRingkas(r.danaPt)} · sisa <b>{fmtRingkas(r.sisaPt)}</b></>
            : <>batas umum {fmtRingkas(BATAS_DANA_PT)}</>}
          peringatan={r.ptLewatBatas
            ? `Melebihi batas dana PT ${fmtRupiah(BATAS_DANA_PT)}` : ""}
        />
      </div>

      {/* ===== Rincian kategori dana Belmawa ===== */}
      <div className="rekap-sub">
        <span>Kategori belanja dana Belmawa</span>
        {r.danaBelmawa > 0 && (
          <small className="muted">% dari {fmtRingkas(r.danaBelmawa)}</small>
        )}
      </div>

      <div className="rekap-kat">
        {r.kategori.map((k) => (
          <div key={k.id} className="rekap-row">
            <span className="rekap-label">
              {k.label}
              <small>maks {k.maks}%</small>
            </span>
            {r.danaBelmawa > 0 ? (
              <div className="rekap-bar">
                <div style={{ width: `${k.pctBatas}%`, background: warnaBar(k.lewat, k.pctBatas) }} />
              </div>
            ) : (
              // Dana belum diisi → bar kosong terlihat seperti bug; ganti
              // dengan garis putus-putus sebagai isyarat "belum bisa dihitung".
              <div className="rekap-bar kosong" title="Isi nominal dana Belmawa untuk melihat persentase" />
            )}
            <span className={`rekap-nilai${k.lewat ? " lewat" : ""}`}>
              {fmtRingkas(k.terpakai)}
              {r.danaBelmawa > 0 && <small>{k.pct}%</small>}
            </span>
          </div>
        ))}
      </div>

      {/* ===== Catatan & ajakan melengkapi ===== */}
      {(danaKosong || belumAdaPenanda || r.nTanpaSumber > 0 || r.nBelmawaTanpaKategori > 0) && (
        <div className="rekap-note">
          <Info className="lucide" />
          <div>
            {danaKosong && (
              <p>
                {milikTim
                  ? <>Isi nominal <b>dana Belmawa &amp; PT</b> di Dashboard agar persentase kategori bisa dihitung.</>
                  : <>Tim belum mengisi nominal dana, jadi persentase belum bisa dihitung.</>}
              </p>
            )}
            {belumAdaPenanda && !danaKosong && (
              <p>
                Belum ada belanja yang ditandai sumber dananya
                {milikTim && <> — klik lencana <b>“belum dipilih”</b> pada entri untuk menandai cepat.</>}
              </p>
            )}
            {r.nTanpaSumber > 0 && (
              <p><b>{r.nTanpaSumber} entri</b> ({fmtRupiah(r.totalTanpaSumber)}) belum diberi sumber dana.</p>
            )}
            {r.nBelmawaTanpaKategori > 0 && (
              <p>
                <b>{r.nBelmawaTanpaKategori} entri Belmawa</b> ({fmtRupiah(r.totalBelmawaTanpaKategori)})
                belum diberi kategori — belum masuk hitungan di atas.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

