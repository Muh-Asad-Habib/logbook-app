"use client";

import { forwardRef, useEffect, useRef, useState } from "react";
import {
  Plus, Search, Pencil, Trash2, Save, CalendarDays, CalendarRange,
} from "lucide-react";
import {
  api, fotoUrl, thumbUrl, fmtDurasi, fmtTgl, useApi, refreshData,
  isPendamping, getTimAktif,
} from "@/lib/api";
import { kompresFormFoto, BATAS_UPLOAD, fmtUkuran, retryFoto } from "@/lib/foto";
import Lightbox from "@/components/Lightbox";
import KomentarPanel from "@/components/Komentar";
import AccPanel, { useAcc } from "@/components/Acc";
import { toast, confirmDialog } from "@/components/Toast";

const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const BULAN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const NAMA_BULAN = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

function DateTile({ iso }) {
  const [y, m, d] = iso.split("-").map(Number);
  return (
    <div className="date-tile">
      <span className="d">{d}</span>
      <span className="m">{BULAN[m - 1]} {y}</span>
    </div>
  );
}

/** Kelompokkan entri (sudah terurut) per bulan → [{kunci, label, items}] */
function grupBulan(items) {
  const out = [];
  for (const e of items) {
    const kunci = e.tanggal.slice(0, 7); // yyyy-mm
    let g = out[out.length - 1];
    if (!g || g.kunci !== kunci) {
      const [y, m] = kunci.split("-").map(Number);
      g = { kunci, label: `${NAMA_BULAN[m - 1]} ${y}`, items: [] };
      out.push(g);
    }
    g.items.push(e);
  }
  return out;
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

export default function KegiatanPage() {
  // Pendamping (fasilitator & dosen): read-only + komentar/ACC; Tim: halaman penuh
  const [fas, setFas] = useState(null);
  useEffect(() => { setFas(isPendamping()); }, []);
  if (fas === null) return <div className="skel mt" style={{ height: 220 }} />;
  return fas ? <KegiatanFasilitator /> : <KegiatanTim />;
}

/* ===================== MODE PENDAMPING (lihat + komentar + ACC) ===================== */
function KegiatanFasilitator() {
  const [timId, setTimId] = useState("");
  const [items, setItems] = useState(null);
  const [gagal, setGagal] = useState("");
  const [cari, setCari] = useState("");
  const [urut, setUrut] = useState("Terbaru");
  const [lb, setLb] = useState(null);
  const peta = useJumlahKomentar("kegiatan", timId, !!timId);
  const [acc, muatAcc] = useAcc("kegiatan", timId, !!timId);

  // Ikuti tim aktif dari switcher topbar
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
    api.fasilitator.kegiatan(timId)
      .then((rows) => { if (hidup) setItems(rows); })
      .catch((e) => { if (hidup) setGagal(e.message); });
    return () => { hidup = false; };
  }, [timId]);

  if (gagal === "belum-assign")
    return (
      <div className="empty mt">
        <div className="big">📞</div>
        <p>Hubungi admin untuk menugaskanmu sebagai pendamping tim kamu.</p>
      </div>
    );
  if (gagal) return <div className="error-box mt">{`Gagal memuat: ${gagal}`}</div>;
  if (items === null) return <div className="skel mt" style={{ height: 220 }} />;

  const view = [...items]
    .filter((e) => !cari || e.kegiatan.toLowerCase().includes(cari.toLowerCase()));
  if (urut === "Terbaru") view.reverse();
  const grup = grupBulan(view);

  const bukaFoto = (e, idx) =>
    setLb({
      items: e.foto_keys.map((k) => ({
        src: fotoUrl(k), judul: fmtTgl(e.tanggal), ket: e.kegiatan.slice(0, 90),
      })),
      index: idx,
    });

  return (
    <>
      <div className="card mt">
        <div className="row spread toolbar">
          <div className="input-wrap tb-cari">
            <span className="in-ic"><Search className="lucide" /></span>
            <input placeholder="Cari kegiatan…" value={cari}
                   onChange={(e) => setCari(e.target.value)} />
          </div>
          <div className="pills">
            {["Terbaru", "Terlama"].map((u) => (
              <button key={u} className={`pill ${urut === u ? "on" : ""}`} onClick={() => setUrut(u)}>{u}</button>
            ))}
          </div>
          <span className="badge info">👁 Mode pendamping — lihat, komentar &amp; ACC</span>
        </div>
      </div>

      <p className="muted mt">{view.length} entri kegiatan tim</p>
      {view.length === 0 && (
        <div className="empty">
          <div className="big"><CalendarDays className="lucide" /></div>
          <p>Tim belum mencatat kegiatan.</p>
        </div>
      )}

      {grup.map((g) => (
        <div key={g.kunci}>
          <div className="month-head">
            <CalendarRange className="lucide" /> {g.label}
            <span className="badge info">{g.items.length} entri</span>
          </div>
          <div className="stagger">
            {g.items.map((e) => (
              <div key={e.id} className="card mt">
                <div className="entry">
                  <DateTile iso={e.tanggal} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div>
                      <span className="badge ok">+{e.capaian_delta}%</span>
                      <span className="badge info">{fmtDurasi(e.waktu_menit)}</span>
                      <span className="badge warn">total {e.capaian_total}%</span>
                    </div>
                    <p className="mts" style={{ fontSize: "0.92rem" }}>{e.kegiatan}</p>
                    {e.foto_keys.length > 0 && (
                      <div className="foto-row">
                        {e.foto_keys.map((k, i) => (
                          <img key={k} src={thumbUrl(k, 240)}
                               alt={`Foto ${i + 1} — ${fmtTgl(e.tanggal)}: ${e.kegiatan.slice(0, 60)}`}
                               loading="lazy"
                               onError={retryFoto} onClick={() => bukaFoto(e, i)} />
                        ))}
                      </div>
                    )}
                    <AccPanel jenis="kegiatan" targetId={e.id} timId={timId}
                              acc={acc[e.id]} onChange={muatAcc} />
                    <KomentarPanel jenis="kegiatan" targetId={e.id} timId={timId}
                                   n={peta[e.id] || 0} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
      {lb && <Lightbox {...lb} onClose={() => setLb(null)} />}
    </>
  );
}

/* ===================== MODE TIM (halaman lama + komentar + status ACC) ===================== */
function KegiatanTim() {
  const { data: items, error: loadErr } = useApi("/api/kegiatan");
  const [cari, setCari] = useState("");
  const [dari, setDari] = useState("");
  const [sampai, setSampai] = useState("");
  const [urut, setUrut] = useState("Terbaru");
  const [edit, setEdit] = useState(null);
  const [lb, setLb] = useState(null);
  const dlgRef = useRef(null);
  const petaKomentar = useJumlahKomentar("kegiatan", "");
  const [acc, muatAcc] = useAcc("kegiatan", "");

  useEffect(() => { if (edit && dlgRef.current) dlgRef.current.showModal(); }, [edit]);

  // FAB (mobile) → buka dialog tambah
  useEffect(() => {
    const buka = () => setEdit("baru");
    window.addEventListener("fab:add", buka);
    return () => window.removeEventListener("fab:add", buka);
  }, []);

  const hapus = async (e) => {
    const ya = await confirmDialog({
      judul: "Hapus kegiatan?",
      pesan: `${fmtTgl(e.tanggal)} — ${e.kegiatan.slice(0, 80)}`,
    });
    if (!ya) return;
    try {
      await api.deleteKegiatan(e.id);
      toast.ok("Kegiatan dihapus");
      refreshData();
      muatAcc();
    } catch (err) {
      toast.err(`Gagal menghapus: ${err.message}`);
    }
  };

  const bukaFoto = (e, idx) =>
    setLb({
      items: e.foto_keys.map((k) => ({
        src: fotoUrl(k), judul: fmtTgl(e.tanggal), ket: e.kegiatan.slice(0, 90),
      })),
      index: idx,
    });

  if (items === undefined && !loadErr)
    return <div className="skel mt" style={{ height: 220 }} />;

  const err = loadErr && items === undefined ? `Gagal memuat: ${loadErr.message}` : "";
  let view = (items || []).filter((e) =>
    (!cari || e.kegiatan.toLowerCase().includes(cari.toLowerCase())) &&
    (!dari || e.tanggal >= dari) &&
    (!sampai || e.tanggal <= sampai)
  );
  if (urut === "Terbaru") view = [...view].reverse();
  const grup = grupBulan(view);

  return (
    <>
      {/* Toolbar */}
      <div className="card mt">
        <div className="row spread toolbar">
          <div className="input-wrap tb-cari">
            <span className="in-ic"><Search className="lucide" /></span>
            <input
              placeholder="Cari kegiatan…"
              value={cari} onChange={(e) => setCari(e.target.value)}
            />
          </div>
          <input type="date" className="tb-tgl" value={dari}
                 onChange={(e) => setDari(e.target.value)} title="Dari tanggal" />
          <input type="date" className="tb-tgl" value={sampai}
                 onChange={(e) => setSampai(e.target.value)} title="Sampai tanggal" />
          <div className="pills">
            {["Terbaru", "Terlama"].map((u) => (
              <button key={u} className={`pill ${urut === u ? "on" : ""}`} onClick={() => setUrut(u)}>{u}</button>
            ))}
          </div>
          <button className="btn primary" onClick={() => setEdit("baru")}>
            <Plus className="lucide" /> Tambah
          </button>
        </div>
      </div>

      {err && <div className="error-box mt">{err}</div>}
      <p className="muted mt">{view.length} dari {(items || []).length} entri kegiatan</p>

      {view.length === 0 && !err && (
        <div className="empty">
          <div className="big"><CalendarDays className="lucide" /></div>
          <p>Tidak ada entri yang cocok. Klik <b>Tambah</b> untuk membuat entri baru.</p>
        </div>
      )}

      {grup.map((g) => (
        <div key={g.kunci}>
          <div className="month-head">
            <CalendarRange className="lucide" /> {g.label}
            <span className="badge info">{g.items.length} entri</span>
          </div>
          <div className="stagger">
            {g.items.map((e) => (
              <div key={e.id} className="card mt">
                <div className="entry">
                  <DateTile iso={e.tanggal} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div>
                      <span className="badge ok">+{e.capaian_delta}%</span>
                      <span className="badge info">{fmtDurasi(e.waktu_menit)}</span>
                      <span className="badge warn">total {e.capaian_total}%</span>
                    </div>
                    <p className="mts" style={{ fontSize: "0.92rem" }}>{e.kegiatan}</p>
                    {e.foto_keys.length > 0 && (
                      <div className="foto-row">
                        {/* Deretan pratinjau kecil → cukup thumbnail 240px.
                            Klik membuka Lightbox yang memakai resolusi penuh. */}
                        {e.foto_keys.map((k, i) => (
                          <img key={k} src={thumbUrl(k, 240)}
                               alt={`Foto ${i + 1} — ${fmtTgl(e.tanggal)}: ${e.kegiatan.slice(0, 60)}`}
                               loading="lazy"
                               onError={retryFoto} onClick={() => bukaFoto(e, i)} />
                        ))}
                      </div>
                    )}
                    <AccPanel jenis="kegiatan" targetId={e.id} acc={acc[e.id]} onChange={muatAcc} />
                    <KomentarPanel jenis="kegiatan" targetId={e.id}
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
        </div>
      ))}

      {edit && (
        <FormDialog
          ref={dlgRef}
          entri={edit === "baru" ? null : edit}
          onClose={() => setEdit(null)}
          onSaved={(baru) => {
            setEdit(null);
            toast.ok(baru ? "Kegiatan ditambahkan" : "Perubahan tersimpan");
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
  const [keep, setKeep] = useState(entri?.foto_keys || []);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  // Waktu tersimpan dalam MENIT (kanonik) — form menerima jam + menit bebas.
  const totalLama = entri?.waktu_menit ?? 0;
  const [jam, setJam] = useState(entri ? Math.floor(totalLama / 60) : 0);
  const [menit, setMenit] = useState(entri ? totalLama % 60 : 0);
  const totalMenit = Math.round((parseFloat(jam) || 0) * 60 + (parseFloat(menit) || 0));

  const submit = async (ev) => {
    ev.preventDefault();
    setBusy(true);
    setErr("");
    const fd = new FormData(ev.target);
    // Konversi jam+menit → satu nilai menit; field bantu tidak ikut terkirim
    fd.delete("waktu_jam_input");
    fd.delete("waktu_menit_input");
    fd.set("waktu_menit", String(Math.max(0, totalMenit)));
    if (entri) fd.set("keep_keys", JSON.stringify(keep));
    try {
      // Kompres foto di browser — hindari 413 (limit body ±4,5 MB di Vercel)
      const totalFoto = await kompresFormFoto(fd, "foto");
      if (totalFoto > BATAS_UPLOAD) {
        throw new Error(
          `Total foto masih ${fmtUkuran(totalFoto)} setelah dikompres — ` +
          `maksimal ±4 MB per simpan. Kurangi jumlah foto, lalu tambahkan sisanya lewat Edit.`
        );
      }
      if (entri) await api.updateKegiatan(entri.id, fd);
      else await api.addKegiatan(fd);
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
        <h3>{entri ? "Edit kegiatan" : "Tambah kegiatan"}</h3>
      </div>
      <form onSubmit={submit} className="dlg-body">
        <div className="form-grid">
          <label className="field">
            Tanggal
            <input type="date" name="tanggal" required defaultValue={entri?.tanggal || todayIso()} />
          </label>
          <label className="field">
            Capaian entri ini (%)
            <input type="number" name="capaian_delta" min="0" max="100"
                   defaultValue={entri?.capaian_delta ?? 0} />
          </label>
          <label className="field">
            Waktu — jam
            <input type="number" name="waktu_jam_input" min="0" step="any"
                   value={jam} onChange={(e) => setJam(e.target.value)}
                   placeholder="0" />
          </label>
          <label className="field">
            Waktu — menit
            <input type="number" name="waktu_menit_input" min="0" step="any"
                   value={menit} onChange={(e) => setMenit(e.target.value)}
                   placeholder="0" />
          </label>
        </div>
        <p className="muted mts">
          Boleh diisi salah satu atau keduanya (mis. 1 jam 22 menit, 82 menit, atau 2 jam) —
          tersimpan &amp; diekspor sebagai <b>{Math.max(0, totalMenit)} menit</b>
          {totalMenit >= 60 ? ` (${fmtDurasi(Math.max(0, totalMenit))})` : ""}.
        </p>
        <label className="field mt">
          Deskripsi kegiatan
          <textarea name="kegiatan" required defaultValue={entri?.kegiatan || ""}
                    placeholder="Apa yang dikerjakan…" />
        </label>

        {entri?.foto_keys?.length > 0 && (
          <>
            <p className="muted mt">Hilangkan centang untuk menghapus foto lama:</p>
            <div className="foto-row">
              {entri.foto_keys.map((k) => (
                <label key={k} style={{ textAlign: "center", fontSize: "0.72rem", fontWeight: 600 }}>
                  <img src={thumbUrl(k, 240)} alt="foto" onError={retryFoto} style={{ cursor: "default" }} />
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
          {entri ? "Tambah foto baru" : "Foto kegiatan (boleh lebih dari satu)"}
          <input type="file" name="foto" accept="image/png,image/jpeg,image/webp" multiple />
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
