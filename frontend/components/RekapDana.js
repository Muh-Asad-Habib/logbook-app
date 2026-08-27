"use client";

/**
 * Rekap dana PKM — bagian informatif di halaman Keuangan.
 *
 * Kartu ini DILIPAT secara bawaan supaya hemat tempat; klik kepalanya untuk
 * membuka rincian. Saat terlipat tetap tampil ringkasan mini (Belmawa / PT)
 * plus penanda bila ada batas terlampaui atau entri yang belum ditandai.
 * Pilihan buka/tutup diingat per perangkat.
 *
 * Sifatnya OPSIONAL: tidak ada yang diblokir, semuanya hanya penanda.
 */
import { useEffect, useState } from "react";
import {
  ChartPie, TriangleAlert, Info, Landmark, Building2, ChevronDown,
} from "lucide-react";
import { fmtRupiah } from "@/lib/api";
import { rekapDana, BATAS_DANA_PT } from "@/lib/pkm";

const KUNCI_BUKA = "logbook_rekap_terbuka";

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
  const [buka, setBuka] = useState(false);

  // Ingat pilihan buka/tutup (dibaca setelah render pertama agar SSR aman)
  useEffect(() => {
    try {
      setBuka(localStorage.getItem(KUNCI_BUKA) === "1");
    } catch {}
  }, []);

  const toggle = () => {
    setBuka((v) => {
      try { localStorage.setItem(KUNCI_BUKA, v ? "0" : "1"); } catch {}
      return !v;
    });
  };

  // Skeleton: dipakai saat daftar entri / nominal dana masih dalam perjalanan
  if (memuat || !items) {
    return (
      <div className="card mt rekap-card">
        <div className="rekap-head">
          <h3><ChartPie className="lucide" /> Rekap dana PKM</h3>
          <div className="skel" style={{ height: 22, width: 150, marginLeft: "auto" }} />
        </div>
      </div>
    );
  }

  const r = rekapDana(items, dana || {});
  const danaKosong = r.danaBelmawa <= 0 && r.danaPt <= 0;
  const belumAdaPenanda = r.totalBelmawa === 0 && r.totalPt === 0;
  // Ada yang perlu diperhatikan → titik oranye pada kepala kartu
  const perluPerhatian =
    r.ptLewatBatas || r.kategori.some((k) => k.lewat) ||
    r.nTanpaSumber > 0 || r.nBelmawaTanpaKategori > 0;

  const pctBelmawa = r.danaBelmawa > 0
    ? Math.min(100, (r.totalBelmawa / r.danaBelmawa) * 100) : 0;
  const pctPt = r.danaPt > 0
    ? Math.min(100, (r.totalPt / r.danaPt) * 100)
    : Math.min(100, (r.totalPt / BATAS_DANA_PT) * 100);

  const totalDana = r.danaBelmawa + r.danaPt;
  const totalPakai = r.totalBelmawa + r.totalPt;
  const sisaTotal = totalDana - totalPakai;
  const pctPakai = totalDana > 0 ? Math.round((totalPakai / totalDana) * 100) : 0;

  return (
    <div className={`card mt rekap-card${buka ? " terbuka" : ""}`}>
      {/* ===== Kepala kartu — tombol buka/tutup ===== */}
      <button
        type="button"
        className="rekap-head"
        onClick={toggle}
        aria-expanded={buka}
        aria-controls="rekap-isi"
      >
        <span className="rekap-ic"><ChartPie className="lucide" /></span>
        <span className="rekap-judul">
          <b>Rekap dana PKM</b>
          <small>pemakaian per sumber &amp; kategori — pedoman PKM 2026</small>
        </span>

        {/* Ringkasan mini: tetap terbaca meski kartu terlipat */}
        <span className="rekap-mini">
          <span className="mini-chip belmawa">
            <i className="dot belmawa" /> {fmtRingkas(r.totalBelmawa)}
          </span>
          <span className="mini-chip pt">
            <i className="dot pt" /> {fmtRingkas(r.totalPt)}
          </span>
          {perluPerhatian && (
            <span className="mini-chip warn" title="Ada yang perlu dicek">
              <TriangleAlert className="lucide" />
            </span>
          )}
        </span>

        <ChevronDown className="lucide rekap-caret" />
      </button>

      {/* ===== Isi kartu ===== */}
      {buka && (
        <div id="rekap-isi" className="rekap-isi">
          {/* ===== Ikhtisar: diterima → terpakai → sisa ===== */}
          <div className="rekap-ikhtisar">
            <div className="ikh-item">
              <span className="ikh-cap">Total dana diterima</span>
              <b className="ikh-val">{fmtRupiah(totalDana)}</b>
              <small>Belmawa {fmtRingkas(r.danaBelmawa)} · PT {fmtRingkas(r.danaPt)}</small>
            </div>
            <span className="ikh-op" aria-hidden="true">−</span>
            <div className="ikh-item">
              <span className="ikh-cap">Total terpakai</span>
              <b className="ikh-val pakai">{fmtRupiah(totalPakai)}</b>
              <small>{pctPakai}% dari dana diterima</small>
            </div>
            <span className="ikh-op" aria-hidden="true">=</span>
            <div className={`ikh-item utama${sisaTotal < 0 ? " minus" : ""}`}>
              <span className="ikh-cap">Sisa belum terpakai</span>
              <b className="ikh-val">{fmtRupiah(sisaTotal)}</b>
              <small>{sisaTotal < 0 ? "melebihi dana yang diterima" : "siap dibelanjakan"}</small>
            </div>
          </div>

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
      )}
    </div>
  );
}
