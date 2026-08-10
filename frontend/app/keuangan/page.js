"use client";

import { forwardRef, useEffect, useRef, useState } from "react";
import { Plus, Search, Pencil, Trash2, Save, Wallet, Eye } from "lucide-react";
import {
  api, fotoUrl, thumbUrl, fmtRupiah, fmtTgl, useApi, refreshData,
  isPendamping, getTimAktif,
} from "@/lib/api";
import { kompresFormFoto, BATAS_UPLOAD, fmtUkuran, retryFoto } from "@/lib/foto";
import Lightbox from "@/components/Lightbox";
import KomentarPanel from "@/components/Komentar";
import AccPanel, { AccBadge, useAcc } from "@/components/Acc";
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
  const [gagal, setGagal] = useState("");
  const [cari, setCari] = useState("");
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
    api.fasilitator.keuangan(timId)
      .then((rows) => { if (hidup) setItems(rows); })
      .catch((e) => { if (hidup) setGagal(e.message); });
    return () => { hidup = false; };
  }, [timId]);

  // Di layar sempit tabel 7 kolom sesak — mulai dengan tampilan kartu (sama seperti tim)
  useEffect(() => {
    if (typeof window !== "undefined" && window.innerWidth < 640) setMode("Kartu");
  }, []);

  if (gagal === "belum-assign")
    return (
      <div className="empty mt">
        <div className="big">📞</div>
        <p>Hubungi admin untuk menjadikan kamu fasilitator di tim kamu.</p>
      </div>
    );
  if (gagal) return <div className="error-box mt">{`Gagal memuat: ${gagal}`}</div>;
  if (items === null) return <div className="skel mt" style={{ height: 220 }} />;

  const view = [...items]
    .filter((e) => !cari || e.item.toLowerCase().includes(cari.toLowerCase()))
    .reverse();
  const total = items.reduce((s, e) => s + e.total, 0);

  // Baris tabel dengan subtotal per bulan (sama seperti mode tim)
  const subtotal = {};
  for (const e of view) {
    const k = e.tanggal.slice(0, 7);
    subtotal[k] = (subtotal[k] || 0) + e.total;
  }
  const rows = [];
  let bulanAktif = "";
  for (const e of view) {
    const k = e.tanggal.slice(0, 7);
    if (k !== bulanAktif) {
      rows.push({ jenis: "sub", kunci: k, total: subtotal[k] });
      bulanAktif = k;
    }
    rows.push({ jenis: "entri", e });
  }

  const bukaBukti = (e) =>
    setLb({
      items: [{ src: fotoUrl(e.bukti_key), judul: fmtTgl(e.tanggal), ket: e.item }],
      index: 0,
    });

  return (
    <>
      <div className="card mt">
        <div className="row spread toolbar">
          <div className="input-wrap tb-cari">
            <span className="in-ic"><Search className="lucide" /></span>
            <input placeholder="Cari item belanja…" value={cari}
                   onChange={(e) => setCari(e.target.value)} />
          </div>
          <div className="pills">
            {["Tabel", "Kartu"].map((m) => (
              <button key={m} className={`pill ${mode === m ? "on" : ""}`} onClick={() => setMode(m)}>{m}</button>
            ))}
          </div>
          <span className="badge info">👁 Mode pendamping — lihat, komentar &amp; ACC</span>
        </div>
      </div>

      <p className="muted mt">
        {view.length} entri belanja tim · total{" "}
        <b style={{ color: "var(--p3)" }}>{fmtRupiah(total)}</b>
      </p>

      {view.length === 0 && (
        <div className="empty">
          <div className="big"><Wallet className="lucide" /></div>
          <p>Tim belum mencatat belanja.</p>
        </div>
      )}

      {view.length > 0 && mode === "Tabel" && (
        <div className="card mt table-wrap keu-table">
          <table>
            <thead>
              <tr>
                <th>Tanggal</th><th>Item</th><th className="num">Harga satuan</th>
                <th className="num">Jml</th><th className="num">Total</th>
                <th>Bukti</th><th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) =>
                r.jenis === "sub" ? (
                  <tr key={`sub-${r.kunci}`} className="subtotal">
                    <td colSpan={4}>{labelBulan(r.kunci)}</td>
                    <td className="num">{fmtRupiah(r.total)}</td>
                    <td colSpan={2}></td>
                  </tr>
                ) : (
                  <tr key={r.e.id}>
                    <td style={{ whiteSpace: "nowrap" }}>{fmtTgl(r.e.tanggal)}</td>
                    <td className="item-col">{r.e.item}</td>
                    <td className="num">{fmtRupiah(r.e.harga_satuan)}{r.e.satuan_suffix}</td>
                    <td className="num">{r.e.jumlah}</td>
                    <td className="num"><b>{fmtRupiah(r.e.total)}</b></td>
                    <td>
                      {r.e.bukti_key ? (
                        <img src={fotoUrl(r.e.bukti_key)} alt="bukti" loading="lazy"
                             onError={retryFoto} onClick={() => bukaBukti(r.e)}
                             style={{ width: 44, height: 44, objectFit: "cover",
                                      borderRadius: 8, cursor: "zoom-in" }} />
                      ) : "—"}
                    </td>
                    <td className="aksi">
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
                    {fmtRupiah(e.harga_satuan)}{e.satuan_suffix} × {e.jumlah} ={" "}
                    <b style={{ color: "var(--ink)" }}>{fmtRupiah(e.total)}</b>
                  </p>
                  {e.bukti_key && (
                    <div className="foto-row">
                      <img src={fotoUrl(e.bukti_key)} alt="bukti" loading="lazy"
                           onError={retryFoto} onClick={() => bukaBukti(e)} />
                    </div>
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
      {lb && <Lightbox {...lb} onClose={() => setLb(null)} />}
    </>
  );
}

/* ===================== MODE TIM (halaman lama + komentar + status ACC) ===================== */
function KeuanganTim() {
  const { data: items, error: loadErr } = useApi("/api/keuangan");
  const [cari, setCari] = useState("");
  const [mode, setMode] = useState("Tabel");
  const [edit, setEdit] = useState(null);
  const [lb, setLb] = useState(null);
  const dlgRef = useRef(null);
  const petaKomentar = useJumlahKomentar("keuangan", "");
  const [acc, muatAcc] = useAcc("keuangan", "");

  useEffect(() => { if (edit && dlgRef.current) dlgRef.current.showModal(); }, [edit]);
  // Di layar sempit tabel 7 kolom sesak — mulai dengan tampilan kartu
  useEffect(() => {
    if (typeof window !== "undefined" && window.innerWidth < 640) setMode("Kartu");
  }, []);

  // FAB (mobile) → buka dialog tambah
  useEffect(() => {
    const buka = () => setEdit("baru");
    window.addEventListener("fab:add", buka);
    return () => window.removeEventListener("fab:add", buka);
  }, []);

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

  const bukaBukti = (e) =>
    setLb({
      items: [{ src: fotoUrl(e.bukti_key), judul: fmtTgl(e.tanggal), ket: e.item }],
      index: 0,
    });

  if (items === undefined && !loadErr) return <div className="skel mt" style={{ height: 220 }} />;

  const err = loadErr && items === undefined ? `Gagal memuat: ${loadErr.message}` : "";
  const list = items || [];
  const view = list
    .filter((e) => !cari || e.item.toLowerCase().includes(cari.toLowerCase()))
    .reverse();
  const total = list.reduce((s, e) => s + e.total, 0);

  // Baris tabel dengan subtotal per bulan (view terurut terbaru → sisipkan
  // subtotal ketika bulan berganti; subtotal dihitung dari seluruh view)
  const subtotal = {};
  for (const e of view) {
    const k = e.tanggal.slice(0, 7);
    subtotal[k] = (subtotal[k] || 0) + e.total;
  }
  const rows = [];
  let bulanAktif = "";
  for (const e of view) {
    const k = e.tanggal.slice(0, 7);
    if (k !== bulanAktif) {
      rows.push({ jenis: "sub", kunci: k, total: subtotal[k] });
      bulanAktif = k;
    }
    rows.push({ jenis: "entri", e });
  }

  return (
    <>
      <div className="card mt">
        <div className="row spread toolbar">
          <div className="input-wrap tb-cari">
            <span className="in-ic"><Search className="lucide" /></span>
            <input
              placeholder="Cari item belanja…"
              value={cari} onChange={(e) => setCari(e.target.value)}
            />
          </div>
          <div className="pills">
            {["Tabel", "Kartu"].map((m) => (
              <button key={m} className={`pill ${mode === m ? "on" : ""}`} onClick={() => setMode(m)}>{m}</button>
            ))}
          </div>
          <button className="btn primary" onClick={() => setEdit("baru")}>
            <Plus className="lucide" /> Tambah
          </button>
        </div>
      </div>

      {err && <div className="error-box mt">{err}</div>}
      <p className="muted mt">
        {view.length} dari {list.length} entri · total pengeluaran{" "}
        <b style={{ color: "var(--p3)" }}>{fmtRupiah(total)}</b>
      </p>

      {view.length === 0 && !err && (
        <div className="empty">
          <div className="big"><Wallet className="lucide" /></div>
          <p>Belum ada entri belanja yang cocok.</p>
        </div>
      )}

      {view.length > 0 && mode === "Tabel" && (
        <div className="card mt table-wrap keu-table">
          <table>
            <thead>
              <tr>
                <th>Tanggal</th><th>Item</th><th className="num">Harga satuan</th>
                <th className="num">Jml</th><th className="num">Total</th>
                <th>Bukti</th><th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) =>
                r.jenis === "sub" ? (
                  <tr key={`sub-${r.kunci}`} className="subtotal">
                    <td colSpan={4}>{labelBulan(r.kunci)}</td>
                    <td className="num">{fmtRupiah(r.total)}</td>
                    <td colSpan={2}></td>
                  </tr>
                ) : (
                  <tr key={r.e.id}>
                    <td style={{ whiteSpace: "nowrap" }}>{fmtTgl(r.e.tanggal)}</td>
                    <td className="item-col">{r.e.item}</td>
                    <td className="num">{fmtRupiah(r.e.harga_satuan)}{r.e.satuan_suffix}</td>
                    <td className="num">{r.e.jumlah}</td>
                    <td className="num"><b>{fmtRupiah(r.e.total)}</b></td>
                    <td>
                      {r.e.bukti_key ? (
                        <img src={fotoUrl(r.e.bukti_key)} alt="bukti" loading="lazy"
                             onError={retryFoto} onClick={() => bukaBukti(r.e)}
                             style={{ width: 44, height: 44, objectFit: "cover",
                                      borderRadius: 8, cursor: "zoom-in" }} />
                      ) : "—"}
                    </td>
                    <td className="aksi">
                      <div>
                        <button className="btn sm" onClick={() => setEdit(r.e)} aria-label="Edit">
                          <Pencil className="lucide" />
                        </button>{" "}
                        <button className="btn sm danger" onClick={() => hapus(r.e)} aria-label="Hapus">
                          <Trash2 className="lucide" />
                        </button>
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
                    {fmtRupiah(e.harga_satuan)}{e.satuan_suffix} × {e.jumlah} ={" "}
                    <b style={{ color: "var(--ink)" }}>{fmtRupiah(e.total)}</b>
                  </p>
                  {e.bukti_key && (
                    <div className="foto-row">
                      <img src={fotoUrl(e.bukti_key)} alt="bukti" loading="lazy"
                           onError={retryFoto} onClick={() => bukaBukti(e)} />
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
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

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
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [harga, setHarga] = useState(entri?.harga_satuan ?? 0);
  const [jumlah, setJumlah] = useState(entri?.jumlah ?? 1);

  const submit = async (ev) => {
    ev.preventDefault();
    setBusy(true);
    setErr("");
    const fd = new FormData(ev.target);
    try {
      // Kompres bukti di browser — hindari 413 (limit body ±4,5 MB di Vercel)
      const totalBukti = await kompresFormFoto(fd, "bukti");
      if (totalBukti > BATAS_UPLOAD) {
        throw new Error(
          `Bukti masih ${fmtUkuran(totalBukti)} setelah dikompres — maksimal ±4 MB.`
        );
      }
      if (entri) await api.updateKeuangan(entri.id, fd);
      else await api.addKeuangan(fd);
      onSaved(!entri);
    } catch (e) {
      setErr(e.message);
      setBusy(false);
    }
  };

  return (
    <dialog ref={ref} onClose={onClose}>
      <div className="dlg-head">
        <div className="ic">{entri ? <Pencil className="lucide" /> : <Plus className="lucide" />}</div>
        <h3>{entri ? "Edit belanja" : "Tambah belanja"}</h3>
      </div>
      <form onSubmit={submit} className="dlg-body">
        <div className="form-grid">
          <label className="field" style={{ gridColumn: "1 / -1" }}>
            Item belanja
            <input name="item" required defaultValue={entri?.item || ""}
                   placeholder="mis. Sewa Canva Pro" />
          </label>
          <label className="field">
            Tanggal
            <input type="date" name="tanggal" required defaultValue={entri?.tanggal || todayIso()} />
          </label>
          <label className="field">
            Harga satuan (Rp)
            <input type="number" name="harga_satuan" min="0" step="any" value={harga}
                   onChange={(e) => setHarga(e.target.value)} />
          </label>
          <label className="field">
            Satuan
            <input name="satuan_suffix" required defaultValue={entri?.satuan_suffix || ""}
                   placeholder="mis. /bulan" />
          </label>
          <label className="field">
            Jumlah
            <input type="number" name="jumlah" min="0" step="any" value={jumlah}
                   onChange={(e) => setJumlah(e.target.value)} />
          </label>
        </div>
        <p className="mt">
          Total:{" "}
          <b style={{ color: "var(--p1)", fontSize: "1.05rem" }}>
            {fmtRupiah((parseFloat(harga) || 0) * (parseFloat(jumlah) || 0))}
          </b>
        </p>

        {entri?.bukti_key && (
          <p className="muted mts">
            <Eye className="lucide" /> Bukti saat ini sudah ada — unggah file baru untuk mengganti.
          </p>
        )}
        <label className="field mt">
          Bukti/nota
          <input type="file" name="bukti" accept="image/png,image/jpeg,image/webp" />
        </label>

        {err && <div className="error-box mt">{err}</div>}
        <div className="row mt" style={{ justifyContent: "flex-end" }}>
          <button type="button" className="btn" onClick={onClose}>Batal</button>
          <button type="submit" className="btn primary" disabled={busy}>
            {busy ? "Menyimpan…" : <><Save className="lucide" /> Simpan</>}
          </button>
        </div>
      </form>
    </dialog>
  );
});
