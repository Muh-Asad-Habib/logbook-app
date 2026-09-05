"use client";

import { forwardRef, useEffect, useMemo, useRef, useState } from "react";
import {
  Plus, Search, Pencil, Trash2, Save, Wallet, Download, FilterX,
  X, CalendarRange, Table2, LayoutGrid, Eye, Layers,
} from "lucide-react";
import {
  api, fotoUrl, thumbUrl, fmtRupiah, fmtTgl, useApi, refreshData,
  isPendamping, getTimAktif,
} from "@/lib/api";
import { kompresFormFoto, BATAS_UPLOAD, fmtUkuran, retryFoto } from "@/lib/foto";
import { unduhFotoEntri } from "@/lib/unduh";
import { KATEGORI_PKM } from "@/lib/pkm";
import { simpanDraf, ambilDraf, hapusDraf } from "@/lib/draf";
import { useMuatBertahap, TombolMuatLagi } from "@/lib/muatBertahap";
import Lightbox from "@/components/Lightbox";
import KomentarPanel from "@/components/Komentar";
import AccPanel, { AccBadge, useAcc } from "@/components/Acc";
import RekapDana from "@/components/RekapDana";
import BadgeSumber from "@/components/BadgeSumber";
import PilihSumberDana from "@/components/PilihSumberDana";
import { SaranSumberAI } from "@/components/SaranAI";
import { toast, confirmDialog } from "@/components/Toast";

const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const NAMA_BULAN = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];
const labelBulan = (kunci) => {
  const [y, m] = kunci.split("-").map(Number);
  return `${NAMA_BULAN[m - 1]} ${y}`;
};

/** Daftar key bukti sebuah entri — kompatibel dengan data lama (bukti_key). */
const buktiKeys = (e) =>
  e.bukti_keys?.length ? e.bukti_keys : e.bukti_key ? [e.bukti_key] : [];

/**
 * Rincian "Harga × jml" sebuah entri, plus kode unik transfer bila ada.
 *
 * Kode unik TIDAK ditampilkan sebagai kolom/total terpisah — ia sudah menyatu
 * di kolom Total (seperti angka pada nota), di sini hanya diberi keterangan
 * kecil supaya jelas dari mana selisihnya berasal.
 */
function RincianHarga({ e }) {
  const kode = Number(e.kode_unik) || 0;
  return (
    <>
      {fmtRupiah(e.harga_satuan)}{e.satuan_suffix}
      <small className="muted"> × {e.jumlah}</small>
      {kode > 0 && (
        <small className="muted" title="Kode unik transfer — sudah termasuk di total">
          {" "}+ {fmtRupiah(kode)} kode unik
        </small>
      )}
    </>
  );
}

/** Pilihan filter sumber dana pada toolbar (warna = kelas titik). */
const FILTER_SUMBER = [
  { id: "", label: "Semua", warna: "" },
  { id: "belmawa", label: "Belmawa", warna: "belmawa" },
  { id: "pt", label: "PT", warna: "pt" },
  { id: "kosong", label: "Belum dipilih", warna: "netral" },
];

const cocokSumber = (e, filter) =>
  !filter ? true : filter === "kosong" ? !e.sumber : e.sumber === filter;

/**
 * Saringan KATEGORI PKM — hanya berlaku saat filter sumber = Belmawa, sebab
 * kategori memang cuma dimiliki dana Belmawa. "kosong" = entri Belmawa yang
 * kategorinya belum dipilih.
 */
const cocokKategori = (e, sumber, kat) =>
  sumber !== "belmawa" || !kat
    ? true
    : kat === "kosong"
      ? !KATEGORI_PKM.some((k) => k.id === e.kategori)
      : e.kategori === kat;

/** Daftar bulan unik dari entri (terbaru dulu) untuk dropdown filter. */
function daftarBulan(items) {
  const set = new Set((items || []).map((e) => e.tanggal.slice(0, 7)));
  return [...set].sort().reverse();
}

/** Tombol unduh semua bukti sebuah entri (1 → JPG, lebih → ZIP). */
function TombolUnduhBukti({ e, ringkas = false }) {
  const [busy, setBusy] = useState(false);
  const keys = buktiKeys(e);
  if (!keys.length) return null;
  const unduh = async () => {
    setBusy(true);
    try {
      await unduhFotoEntri(keys, e.tanggal, "bukti", "bukti");
      if (keys.length > 1) toast.ok(`${keys.length} bukti diunduh sebagai ZIP`);
    } catch (err) {
      toast.err(`Gagal mengunduh: ${err.message}`);
    } finally {
      setBusy(false);
    }
  };
  return (
    <button className="btn sm" onClick={unduh} disabled={busy}
            aria-label={`Unduh bukti (${keys.length})`}
            title={keys.length > 1 ? `Unduh ${keys.length} bukti (ZIP)` : "Unduh bukti (JPG)"}>
      <Download className="lucide" />
      {!ringkas && <> {busy ? "Mengunduh…" : `Unduh bukti${keys.length > 1 ? ` (${keys.length})` : ""}`}</>}
    </button>
  );
}

/** Hook peta jumlah komentar per entri — untuk badge tombol komentar. */
function useJumlahKomentar(jenis, timId, aktif = true) {
  const [peta, setPeta] = useState({});
  useEffect(() => {
    if (!aktif) return;
    let hidup = true;
    api.komentar.jumlah(jenis, timId || undefined)
      .then((m) => { if (hidup) setPeta(m); })
      .catch(() => {});
    return () => { hidup = false; };
  }, [jenis, timId, aktif]);
  return peta;
}

/**
 * Toolbar filter — tersusun agar tidak berdesakan:
 *  baris 1: pencarian · pilih bulan · reset
 *  baris 2: sumber dana (segmented berwarna) · mode tampilan · aksi
 *  baris 3: kategori PKM — muncul HANYA saat sumber "Belmawa" dipilih,
 *           sebab kategori belanja hanya berlaku untuk dana Belmawa.
 */
function ToolbarFilter({
  cari, setCari, bulan, setBulan, sumber, setSumber, kat, setKat,
  bulanTersedia, mode, setMode, aksi, catatan,
}) {
  const adaFilter = cari || bulan || sumber || kat;
  // Pindah dari Belmawa ke sumber lain → saringan kategori ikut dilepas
  const pilihSumber = (id) => {
    setSumber(id);
    if (id !== "belmawa") setKat("");
  };
  return (
    <div className="card mt tb-card">
      <div className="tb-baris">
        <div className="input-wrap tb-cari">
          <span className="in-ic"><Search className="lucide" /></span>
          <input placeholder="Cari item belanja…" value={cari}
                 onChange={(e) => setCari(e.target.value)} />
          {cari && (
            <button type="button" className="in-clear" onClick={() => setCari("")}
                    aria-label="Hapus pencarian">
              <X className="lucide" />
            </button>
          )}
        </div>

        <div className="tb-sel-wrap">
          <CalendarRange className="lucide tb-sel-ic" />
          <select className="tb-sel" value={bulan} onChange={(e) => setBulan(e.target.value)}
                  title="Saring per bulan" aria-label="Saring per bulan">
            <option value="">Semua bulan</option>
            {bulanTersedia.map((b) => (
              <option key={b} value={b}>{labelBulan(b)}</option>
            ))}
          </select>
        </div>

        {adaFilter && (
          <button className="btn sm tb-reset"
                  onClick={() => { setCari(""); setBulan(""); setSumber(""); setKat(""); }}
                  title="Bersihkan semua filter">
            <FilterX className="lucide" /> Reset
          </button>
        )}
      </div>

      <div className="tb-baris tb-baris-2">
        <div className="seg seg-sumber" role="group" aria-label="Saring sumber dana">
          {FILTER_SUMBER.map((s) => (
            <button key={s.id || "semua"} type="button"
                    className={`seg-btn${sumber === s.id ? " on" : ""}${s.warna ? ` ${s.warna}` : ""}`}
                    onClick={() => pilihSumber(s.id)}
                    aria-pressed={sumber === s.id}>
              {s.warna && <i className={`dot ${s.warna}`} />}
              {s.label}
            </button>
          ))}
        </div>

        <div className="seg seg-mode" role="group" aria-label="Mode tampilan">
          {[{ id: "Tabel", Ic: Table2 }, { id: "Kartu", Ic: LayoutGrid }].map(({ id, Ic }) => (
            <button key={id} type="button"
                    className={`seg-btn${mode === id ? " on" : ""}`}
                    onClick={() => setMode(id)}
                    aria-pressed={mode === id} title={`Tampilan ${id}`}>
              <Ic className="lucide" /> <span className="seg-teks">{id}</span>
            </button>
          ))}
        </div>

        {catatan}
        {aksi}
      </div>

      {sumber === "belmawa" && (
        <div className="tb-baris tb-baris-kat">
          <span className="kat-label">
            <Layers className="lucide" /> Kategori
          </span>
          <div className="kat-chips" role="group" aria-label="Saring kategori belanja PKM">
            <button type="button" className={`kat-chip${!kat ? " on" : ""}`}
                    onClick={() => setKat("")} aria-pressed={!kat}>
              Semua
            </button>
            {KATEGORI_PKM.map((k) => (
              <button key={k.id} type="button"
                      className={`kat-chip${kat === k.id ? " on" : ""}`}
                      onClick={() => setKat(k.id)} aria-pressed={kat === k.id}
                      title={`${k.label} — maksimum ${k.maks}% dana Belmawa`}>
                {k.label}
                <small>maks {k.maks}%</small>
              </button>
            ))}
            <button type="button" className={`kat-chip netral${kat === "kosong" ? " on" : ""}`}
                    onClick={() => setKat("kosong")} aria-pressed={kat === "kosong"}>
              Tanpa kategori
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function KeuanganPage() {
  const [fas, setFas] = useState(null);
  useEffect(() => { setFas(isPendamping()); }, []);
  if (fas === null) return <div className="skel mt" style={{ height: 220 }} />;
  return fas ? <KeuanganFasilitator /> : <KeuanganTim />;
}

/* ===================== MODE PENDAMPING (lihat + komentar + ACC) ===================== */
function KeuanganFasilitator() {
  const [timId, setTimId] = useState("");
  const [items, setItems] = useState(null);
  const [dana, setDana] = useState(null);
  const [gagal, setGagal] = useState("");
  const [cari, setCari] = useState("");
  const [bulan, setBulan] = useState("");
  const [sumber, setSumber] = useState("");
  const [kat, setKat] = useState("");
  const [mode, setMode] = useState("Tabel");
  const [lb, setLb] = useState(null);
  const peta = useJumlahKomentar("keuangan", timId, !!timId);
  const [acc, muatAcc] = useAcc("keuangan", timId, !!timId);

  useEffect(() => {
    const muatTim = async () => {
      let id = getTimAktif();
      try {
        const tim = await api.fasilitator.tim();
        if (!tim.length) { setGagal("belum-assign"); return; }
        if (!tim.some((t) => t.id === id)) id = tim[0].id;
        setTimId(id);
      } catch (e) {
        setGagal(e.message);
      }
    };
    muatTim();
    const ganti = (e) => setTimId(String(e.detail || getTimAktif()));
    window.addEventListener("tim-aktif-berubah", ganti);
    return () => window.removeEventListener("tim-aktif-berubah", ganti);
  }, []);

  useEffect(() => {
    if (!timId) return;
    let hidup = true;
    setItems(null);
    setDana(null);
    api.fasilitator.keuangan(timId)
      .then((rows) => { if (hidup) setItems(rows); })
      .catch((e) => { if (hidup) setGagal(e.message); });
    // Nominal dana tim — untuk menghitung persentase di rekap (opsional)
    api.fasilitator.statistik(timId)
      .then((s) => { if (hidup) setDana({ belmawa: s.dana_belmawa, pt: s.dana_pt }); })
      .catch(() => { if (hidup) setDana({ belmawa: 0, pt: 0 }); });
    return () => { hidup = false; };
  }, [timId]);

  // Tabel banyak kolom terasa sesak di layar < 900px → mulai dengan Kartu
  useEffect(() => {
    if (typeof window !== "undefined" && window.innerWidth < 900) setMode("Kartu");
  }, []);

  const bulanTersedia = useMemo(() => daftarBulan(items), [items]);

  // Daftar tersaring dihitung SEBELUM early-return agar urutan hook tetap.
  const view = [...(items || [])]
    .filter((e) =>
      (!cari || e.item.toLowerCase().includes(cari.toLowerCase())) &&
      (!bulan || e.tanggal.startsWith(bulan)) &&
      cocokSumber(e, sumber) &&
      cocokKategori(e, sumber, kat)
    )
    .reverse();
  const halaman = useMuatBertahap(view); // paginasi ringan: render 100 entri dulu

  if (gagal === "belum-assign")
    return (
      <div className="empty mt">
        <div className="big">📞</div>
        <p>Hubungi admin untuk menjadikan kamu fasilitator di tim kamu.</p>
      </div>
    );
  if (gagal) return <div className="error-box mt">{`Gagal memuat: ${gagal}`}</div>;
  if (items === null) return <div className="skel mt" style={{ height: 220 }} />;

  const total = view.reduce((s, e) => s + e.total, 0);

  // Sisipkan baris subtotal saat bulan berganti (subtotal dari seluruh hasil filter)
  const subtotal = {};
  for (const e of view) {
    const k = e.tanggal.slice(0, 7);
    subtotal[k] = (subtotal[k] || 0) + e.total;
  }
  const rows = [];
  let bulanAktif = "";
  for (const e of halaman.tampil) {
    const k = e.tanggal.slice(0, 7);
    if (k !== bulanAktif) {
      rows.push({ jenis: "sub", kunci: k, total: subtotal[k] });
      bulanAktif = k;
    }
    rows.push({ jenis: "entri", e });
  }

  const bukaBukti = (e, idx = 0) =>
    setLb({
      items: buktiKeys(e).map((k) => ({
        src: fotoUrl(k), judul: fmtTgl(e.tanggal), ket: e.item,
      })),
      index: idx,
    });

  return (
    <>
      <ToolbarFilter
        cari={cari} setCari={setCari}
        bulan={bulan} setBulan={setBulan}
        sumber={sumber} setSumber={setSumber}
        kat={kat} setKat={setKat}
        bulanTersedia={bulanTersedia}
        mode={mode} setMode={setMode}
        catatan={
          <span className="tb-nota">
            <Eye className="lucide" /> Mode pendamping — lihat, komentar &amp; ACC
          </span>
        }
      />

      <p className="muted mt">
        {view.length} dari {items.length} entri belanja tim · total{" "}
        <b style={{ color: "var(--p1)" }}>{fmtRupiah(total)}</b>
      </p>

      <RekapDana items={items} dana={dana} milikTim={false} memuat={dana === null} />

      {view.length === 0 && (
        <div className="empty">
          <div className="big"><Wallet className="lucide" /></div>
          <p>{items.length ? "Tidak ada entri yang cocok dengan filter." : "Tim belum mencatat belanja."}</p>
        </div>
      )}

      {view.length > 0 && mode === "Tabel" && (
        <div className="card mt table-wrap keu-table">
          <table>
            <thead>
              <tr>
                <th>Tanggal</th><th>Item &amp; sumber dana</th>
                <th className="num">Harga × jml</th><th className="num">Total</th>
                <th>Bukti</th><th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) =>
                r.jenis === "sub" ? (
                  <tr key={`sub-${r.kunci}`} className="subtotal">
                    <td colSpan={2}>{labelBulan(r.kunci)}</td>
                    <td className="num">subtotal</td>
                    <td className="num">{fmtRupiah(r.total)}</td>
                    <td colSpan={2}></td>
                  </tr>
                ) : (
                  <tr key={r.e.id}>
                    <td style={{ whiteSpace: "nowrap" }}>{fmtTgl(r.e.tanggal)}</td>
                    <td className="item-col">
                      {r.e.item}
                      <div className="mts"><BadgeSumber e={r.e} /></div>
                    </td>
                    <td className="num nowrap">
                      <RincianHarga e={r.e} />
                    </td>
                    <td className="num"><b>{fmtRupiah(r.e.total)}</b></td>
                    <td>
                      {buktiKeys(r.e).length ? (
                        <div className="bukti-mini">
                          {buktiKeys(r.e).map((k, i) => (
                            <img key={k} className="foto-mini" src={thumbUrl(k, 160)}
                                 alt={`Bukti belanja ${i + 1}: ${r.e.item}`} loading="lazy"
                                 onError={retryFoto} onClick={() => bukaBukti(r.e, i)} />
                          ))}
                        </div>
                      ) : "—"}
                    </td>
                    <td className="aksi">
                      <TombolUnduhBukti e={r.e} ringkas />
                      <AccPanel jenis="keuangan" targetId={r.e.id} timId={timId}
                                acc={acc[r.e.id]} onChange={muatAcc} />
                      <KomentarPanel jenis="keuangan" targetId={r.e.id} timId={timId}
                                     n={peta[r.e.id] || 0} />
                    </td>
                  </tr>
                )
              )}
            </tbody>
          </table>
        </div>
      )}

      {view.length > 0 && mode === "Kartu" && (
        <div className="stagger">
          {view.map((e) => (
            <div key={e.id} className="card mt">
              <div className="row spread">
                <div style={{ flex: 1, minWidth: 0 }}>
                  <b>{fmtTgl(e.tanggal)}</b> — {e.item}
                  <p className="muted mts">
                    {fmtRupiah(e.harga_satuan)}{e.satuan_suffix} × {e.jumlah}
                    {(Number(e.kode_unik) || 0) > 0 && <> + {fmtRupiah(e.kode_unik)} kode unik</>} ={" "}
                    <b style={{ color: "var(--ink)" }}>{fmtRupiah(e.total)}</b>
                  </p>
                  <div className="mts"><BadgeSumber e={e} /></div>
                  {buktiKeys(e).length > 0 && (
                    <div className="foto-row">
                      {buktiKeys(e).map((k, i) => (
                        <img key={k} src={thumbUrl(k, 240)}
                             alt={`Bukti belanja ${i + 1}: ${e.item}`} loading="lazy"
                             onError={retryFoto} onClick={() => bukaBukti(e, i)} />
                      ))}
                    </div>
                  )}
                  {buktiKeys(e).length > 0 && (
                    <div className="mts"><TombolUnduhBukti e={e} /></div>
                  )}
                  <AccPanel jenis="keuangan" targetId={e.id} timId={timId}
                            acc={acc[e.id]} onChange={muatAcc} />
                  <KomentarPanel jenis="keuangan" targetId={e.id} timId={timId}
                                 n={peta[e.id] || 0} />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      <TombolMuatLagi {...halaman} label="belanja" />
      {lb && <Lightbox {...lb} onClose={() => setLb(null)} />}
    </>
  );
}

/* ===================== MODE TIM (kelola penuh + komentar + status ACC) ===================== */
function KeuanganTim() {
  const { data: items, error: loadErr } = useApi("/api/keuangan");
  const { data: stat } = useApi("/api/statistik");
  const [cari, setCari] = useState("");
  const [bulan, setBulan] = useState("");
  const [sumber, setSumber] = useState("");
  const [kat, setKat] = useState("");
  const [mode, setMode] = useState("Tabel");
  const [edit, setEdit] = useState(null);
  const [lb, setLb] = useState(null);
  const dlgRef = useRef(null);
  const petaKomentar = useJumlahKomentar("keuangan", "");
  const [acc, muatAcc] = useAcc("keuangan", "");

  useEffect(() => { if (edit && dlgRef.current) dlgRef.current.showModal(); }, [edit]);
  // Tabel banyak kolom terasa sesak di layar < 900px → mulai dengan Kartu
  useEffect(() => {
    if (typeof window !== "undefined" && window.innerWidth < 900) setMode("Kartu");
  }, []);

  // FAB (mobile) → buka dialog tambah
  useEffect(() => {
    const buka = () => setEdit("baru");
    window.addEventListener("fab:add", buka);
    return () => window.removeEventListener("fab:add", buka);
  }, []);

  const bulanTersedia = useMemo(() => daftarBulan(items), [items]);

  const hapus = async (e) => {
    const ya = await confirmDialog({
      judul: "Hapus belanja?",
      pesan: `${fmtTgl(e.tanggal)} — ${e.item} (${fmtRupiah(e.total)})`,
    });
    if (!ya) return;
    try {
      await api.deleteKeuangan(e.id);
      toast.ok("Entri belanja dihapus");
      refreshData();
      muatAcc();
    } catch (err) {
      toast.err(`Gagal menghapus: ${err.message}`);
    }
  };

  const bukaBukti = (e, idx = 0) =>
    setLb({
      items: buktiKeys(e).map((k) => ({
        src: fotoUrl(k), judul: fmtTgl(e.tanggal), ket: e.item,
      })),
      index: idx,
    });

  // Daftar tersaring dihitung SEBELUM early-return agar urutan hook tetap.
  const list = items || [];
  const view = list
    .filter((e) =>
      (!cari || e.item.toLowerCase().includes(cari.toLowerCase())) &&
      (!bulan || e.tanggal.startsWith(bulan)) &&
      cocokSumber(e, sumber) &&
      cocokKategori(e, sumber, kat)
    )
    .reverse();
  const halaman = useMuatBertahap(view); // paginasi ringan: render 100 entri dulu

  if (items === undefined && !loadErr) return <div className="skel mt" style={{ height: 220 }} />;

  const err = loadErr && items === undefined ? `Gagal memuat: ${loadErr.message}` : "";
  // Total & subtotal dihitung dari SELURUH hasil filter (bukan hanya yang dirender)
  const total = view.reduce((s, e) => s + e.total, 0);

  // Sisipkan baris subtotal saat bulan berganti
  const subtotal = {};
  for (const e of view) {
    const k = e.tanggal.slice(0, 7);
    subtotal[k] = (subtotal[k] || 0) + e.total;
  }
  const rows = [];
  let bulanAktif = "";
  for (const e of halaman.tampil) {
    const k = e.tanggal.slice(0, 7);
    if (k !== bulanAktif) {
      rows.push({ jenis: "sub", kunci: k, total: subtotal[k] });
      bulanAktif = k;
    }
    rows.push({ jenis: "entri", e });
  }

  return (
    <>
      <ToolbarFilter
        cari={cari} setCari={setCari}
        bulan={bulan} setBulan={setBulan}
        sumber={sumber} setSumber={setSumber}
        kat={kat} setKat={setKat}
        bulanTersedia={bulanTersedia}
        mode={mode} setMode={setMode}
        aksi={
          <button className="btn primary tb-tambah" onClick={() => setEdit("baru")}>
            <Plus className="lucide" /> Tambah
          </button>
        }
      />

      {err && <div className="error-box mt">{err}</div>}
      <p className="muted mt">
        {view.length} dari {list.length} entri · total{" "}
        <b style={{ color: "var(--p1)" }}>{fmtRupiah(total)}</b>
      </p>

      {list.length > 0 && (
        <RekapDana
          items={list}
          dana={{ belmawa: stat?.dana_belmawa || 0, pt: stat?.dana_pt || 0 }}
          memuat={stat === undefined}
        />
      )}

      {view.length === 0 && !err && (
        <div className="empty">
          <div className="big"><Wallet className="lucide" /></div>
          <p>
            {list.length
              ? "Tidak ada entri yang cocok dengan filter."
              : <>Belum ada entri belanja. Klik <b>Tambah</b> untuk mencatat yang pertama.</>}
          </p>
        </div>
      )}

      {view.length > 0 && mode === "Tabel" && (
        <div className="card mt table-wrap keu-table">
          <table>
            <thead>
              <tr>
                <th>Tanggal</th><th>Item &amp; sumber dana</th>
                <th className="num">Harga × jml</th><th className="num">Total</th>
                <th>Bukti</th><th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) =>
                r.jenis === "sub" ? (
                  <tr key={`sub-${r.kunci}`} className="subtotal">
                    <td colSpan={2}>{labelBulan(r.kunci)}</td>
                    <td className="num">subtotal</td>
                    <td className="num">{fmtRupiah(r.total)}</td>
                    <td colSpan={2}></td>
                  </tr>
                ) : (
                  <tr key={r.e.id}>
                    <td style={{ whiteSpace: "nowrap" }}>{fmtTgl(r.e.tanggal)}</td>
                    <td className="item-col">
                      {r.e.item}
                      <div className="mts">
                        <BadgeSumber e={r.e} bisaUbah onUbah={refreshData} />
                      </div>
                    </td>
                    <td className="num nowrap">
                      <RincianHarga e={r.e} />
                    </td>
                    <td className="num"><b>{fmtRupiah(r.e.total)}</b></td>
                    <td>
                      {buktiKeys(r.e).length ? (
                        <div className="bukti-mini">
                          {buktiKeys(r.e).map((k, i) => (
                            <img key={k} className="foto-mini" src={thumbUrl(k, 160)}
                                 alt={`Bukti belanja ${i + 1}: ${r.e.item}`} loading="lazy"
                                 onError={retryFoto} onClick={() => bukaBukti(r.e, i)} />
                          ))}
                        </div>
                      ) : "—"}
                    </td>
                    <td className="aksi">
                      <div className="aksi-btn">
                        <button className="btn sm" onClick={() => setEdit(r.e)} aria-label="Edit">
                          <Pencil className="lucide" />
                        </button>
                        <button className="btn sm danger" onClick={() => hapus(r.e)} aria-label="Hapus">
                          <Trash2 className="lucide" />
                        </button>
                        <TombolUnduhBukti e={r.e} ringkas />
                      </div>
                      <AccBadge acc={acc[r.e.id]} />
                      <KomentarPanel jenis="keuangan" targetId={r.e.id}
                                     n={petaKomentar[r.e.id] || 0} />
                    </td>
                  </tr>
                )
              )}
            </tbody>
          </table>
        </div>
      )}

      {view.length > 0 && mode === "Kartu" && (
        <div className="stagger">
          {view.map((e) => (
            <div key={e.id} className="card mt">
              <div className="row spread">
                <div style={{ flex: 1, minWidth: 0 }}>
                  <b>{fmtTgl(e.tanggal)}</b> — {e.item}
                  <p className="muted mts">
                    {fmtRupiah(e.harga_satuan)}{e.satuan_suffix} × {e.jumlah}
                    {(Number(e.kode_unik) || 0) > 0 && <> + {fmtRupiah(e.kode_unik)} kode unik</>} ={" "}
                    <b style={{ color: "var(--ink)" }}>{fmtRupiah(e.total)}</b>
                  </p>
                  <div className="mts">
                    <BadgeSumber e={e} bisaUbah onUbah={refreshData} />
                  </div>
                  {buktiKeys(e).length > 0 && (
                    <div className="foto-row">
                      {buktiKeys(e).map((k, i) => (
                        <img key={k} src={thumbUrl(k, 240)}
                             alt={`Bukti belanja ${i + 1}: ${e.item}`} loading="lazy"
                             onError={retryFoto} onClick={() => bukaBukti(e, i)} />
                      ))}
                    </div>
                  )}
                  <AccPanel jenis="keuangan" targetId={e.id} acc={acc[e.id]} onChange={muatAcc} />
                  <KomentarPanel jenis="keuangan" targetId={e.id}
                                 n={petaKomentar[e.id] || 0} />
                </div>
                <div className="entry-actions">
                  <button className="btn sm" onClick={() => setEdit(e)}>
                    <Pencil className="lucide" /> Edit
                  </button>
                  <button className="btn sm danger" onClick={() => hapus(e)}>
                    <Trash2 className="lucide" /> Hapus
                  </button>
                  <TombolUnduhBukti e={e} />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      <TombolMuatLagi {...halaman} label="belanja" />

      {edit && (
        <FormDialog
          ref={dlgRef}
          entri={edit === "baru" ? null : edit}
          onClose={() => setEdit(null)}
          onSaved={(baru) => {
            setEdit(null);
            toast.ok(baru ? "Belanja dicatat" : "Perubahan tersimpan");
            refreshData();
            // Entri yang diubah kembali berstatus "menunggu ACC"
            muatAcc();
          }}
        />
      )}
      {lb && <Lightbox {...lb} onClose={() => setLb(null)} />}
    </>
  );
}

const FormDialog = forwardRef(function FormDialog({ entri, onClose, onSaved }, ref) {
  // Draf hanya untuk entri BARU — mengedit entri lama sudah punya nilai awal
  const draf = entri ? null : ambilDraf("keuangan");
  const [keep, setKeep] = useState(() => (entri ? buktiKeys(entri) : []));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [item, setItem] = useState(entri?.item ?? draf?.item ?? "");
  const [tanggal, setTanggal] = useState(entri?.tanggal ?? draf?.tanggal ?? todayIso());
  const [harga, setHarga] = useState(entri?.harga_satuan ?? draf?.harga ?? 0);
  const [satuan, setSatuan] = useState(entri?.satuan_suffix ?? draf?.satuan ?? "");
  const [jumlah, setJumlah] = useState(entri?.jumlah ?? draf?.jumlah ?? 1);
  // Kode unik transfer — opsional; ditambahkan ke total (mis. 90.000 → 90.123)
  const [kodeUnik, setKodeUnik] = useState(entri?.kode_unik ?? draf?.kodeUnik ?? 0);
  // Sumber dana & kategori PKM — opsional, boleh dibiarkan kosong
  const [sumber, setSumber] = useState(entri?.sumber ?? draf?.sumber ?? "");
  const [kategori, setKategori] = useState(entri?.kategori ?? draf?.kategori ?? "");
  const lama = entri ? buktiKeys(entri) : [];

  // Simpan draf tiap isian berubah (entri baru saja) — pulih bila simpan gagal
  useEffect(() => {
    if (entri) return;
    if (!item && !harga && !satuan) return;
    simpanDraf("keuangan", { item, tanggal, harga, satuan, jumlah, kodeUnik, sumber, kategori });
  }, [entri, item, tanggal, harga, satuan, jumlah, kodeUnik, sumber, kategori]);

  const submit = async (ev) => {
    ev.preventDefault();
    setBusy(true);
    setErr("");
    const fd = new FormData(ev.target);
    if (entri) fd.set("keep_keys", JSON.stringify(keep));
    try {
      // Kompres bukti di browser — hindari 413 (limit body ±4,5 MB di Vercel)
      const totalBukti = await kompresFormFoto(fd, "bukti");
      if (totalBukti > BATAS_UPLOAD) {
        throw new Error(
          `Total bukti masih ${fmtUkuran(totalBukti)} setelah dikompres — ` +
          `maksimal ±4 MB per simpan. Kurangi jumlahnya, lalu tambahkan sisanya lewat Edit.`
        );
      }
      if (entri) await api.updateKeuangan(entri.id, fd);
      else await api.addKeuangan(fd);
      hapusDraf("keuangan"); // sukses → draf tidak diperlukan lagi
      onSaved(!entri);
    } catch (e) {
      setErr(e.message);
      setBusy(false);
    }
  };

  const batal = () => {
    if (!entri) hapusDraf("keuangan");
    onClose();
  };

  return (
    <dialog ref={ref} onClose={onClose}>
      <div className="dlg-head">
        <div className="ic">{entri ? <Pencil className="lucide" /> : <Plus className="lucide" />}</div>
        <h3>{entri ? "Edit belanja" : "Tambah belanja"}</h3>
      </div>
      <form onSubmit={submit} className="dlg-body">
        {!entri && draf && (
          <p className="muted mts" style={{ fontSize: ".78rem" }}>
            ✏️ Isian terakhir yang belum tersimpan dipulihkan.
          </p>
        )}
        <div className="form-grid">
          <label className="field" style={{ gridColumn: "1 / -1" }}>
            Item belanja
            <input name="item" required value={item} onChange={(e) => setItem(e.target.value)}
                   placeholder="mis. Sewa Canva Pro" />
          </label>
          <label className="field">
            Tanggal
            <input type="date" name="tanggal" required value={tanggal}
                   onChange={(e) => setTanggal(e.target.value)} />
          </label>
          <label className="field">
            Harga satuan (Rp)
            <input type="number" name="harga_satuan" min="0" step="any" value={harga}
                   onChange={(e) => setHarga(e.target.value)} />
          </label>
          <label className="field">
            Satuan
            <input name="satuan_suffix" required value={satuan}
                   onChange={(e) => setSatuan(e.target.value)} placeholder="mis. /bulan" />
          </label>
          <label className="field">
            Jumlah
            <input type="number" name="jumlah" min="0" step="any" value={jumlah}
                   onChange={(e) => setJumlah(e.target.value)} />
          </label>
          <label className="field">
            Kode unik (Rp) <span className="muted">(opsional)</span>
            <input type="number" name="kode_unik" min="0" step="any" value={kodeUnik}
                   onChange={(e) => setKodeUnik(e.target.value)} placeholder="mis. 123" />
          </label>
          <div className="field-blok">
            <PilihSumberDana
              sumber={sumber}
              kategori={kategori}
              onChange={(s, k) => { setSumber(s); setKategori(k); }}
            />
            {/* Saran AI dari nama item — dipakai hanya bila tombol "Pakai" ditekan */}
            <SaranSumberAI
              item={item}
              harga={(parseFloat(harga) || 0) * (parseFloat(jumlah) || 0)}
              onGunakan={(s, k) => { setSumber(s); setKategori(k); }}
            />
          </div>
        </div>
        <p className="mt total-form">
          Total:{" "}
          <b>
            {fmtRupiah(
              (parseFloat(harga) || 0) * (parseFloat(jumlah) || 0) + (parseFloat(kodeUnik) || 0)
            )}
          </b>
          {(parseFloat(kodeUnik) || 0) > 0 && (
            <small className="muted"> (termasuk kode unik {fmtRupiah(parseFloat(kodeUnik) || 0)})</small>
          )}
        </p>

        {lama.length > 0 && (
          <>
            <p className="muted mt">Hilangkan centang untuk menghapus bukti lama:</p>
            <div className="foto-row">
              {lama.map((k) => (
                <label key={k} style={{ textAlign: "center", fontSize: "0.72rem", fontWeight: 600 }}>
                  <img src={thumbUrl(k, 240)} alt="bukti" onError={retryFoto} style={{ cursor: "default" }} />
                  <br />
                  <input
                    type="checkbox" checked={keep.includes(k)}
                    onChange={(ev) =>
                      setKeep((old) => ev.target.checked ? [...old, k] : old.filter((x) => x !== k))
                    }
                  /> simpan
                </label>
              ))}
            </div>
          </>
        )}
        <label className="field mt">
          {entri ? "Tambah bukti baru" : "Bukti/nota (boleh lebih dari satu)"}
          <input type="file" name="bukti" accept="image/png,image/jpeg,image/webp" multiple />
        </label>

        {err && <div className="error-box mt">{err}</div>}
        <div className="row mt" style={{ justifyContent: "flex-end" }}>
          <button type="button" className="btn" onClick={batal}>Batal</button>
          <button type="submit" className="btn primary" disabled={busy}>
            {busy ? "Menyimpan…" : <><Save className="lucide" /> Simpan</>}
          </button>
        </div>
      </form>
    </dialog>
  );
});

