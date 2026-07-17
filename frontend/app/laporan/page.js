"use client";

/**
 * Laporan Kemajuan — unggah & tampilkan dokumen Word (.docx).
 *
 * PENAMPIL UTAMA: Microsoft Office embed (view.officeapps.live.com) — mesin
 * render Word sungguhan, hasilnya 100% identik dengan membuka file di Word
 * (termasuk text-frame, kotak "Mengetahui", stempel, tanda tangan, dll.).
 * Berkas diambil Microsoft lewat tautan publik acak berumur 30 menit.
 *
 * CADANGAN: docx-preview di iframe terisolasi — otomatis dipakai bila
 * berjalan di jaringan lokal (Microsoft tak bisa menjangkau) atau file
 * terlalu besar untuk penampil Office (>10 MB).
 *
 * Penyimpanan hanya SATU file per akun: unggahan baru menggantikan yang lama.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  FileText, Upload, Download, Trash2, Info, TriangleAlert,
  ZoomIn, ZoomOut, Maximize, Loader, RefreshCw,
} from "lucide-react";
import {
  api, exportUrl, useApi, revalidate, fmtTgl, isFasilitator, getTimAktif,
} from "@/lib/api";
import KomentarPanel from "@/components/Komentar";
import { toast, confirmDialog } from "@/components/Toast";

const BATAS_OFFICE = 10 * 1024 * 1024; // penampil Office menolak file > ±10 MB

const fmtUkuran = (b) =>
  b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil((b || 0) / 1024)} KB`;

const fmtWaktu = (iso) => {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const jam = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  return `${fmtTgl(iso.slice(0, 10))} · ${jam}`;
};

/** true bila host tidak terjangkau dari internet (dev lokal / LAN). */
const hostLokal = () =>
  typeof window !== "undefined" &&
  /^(localhost|127\.|0\.0\.0\.0|192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(window.location.hostname);

/* Gaya dasar DI DALAM iframe cadangan (docx-preview). */
const GAYA_IFRAME = `
  html, body { margin: 0; padding: 0; background: #525659; }
  ::-webkit-scrollbar { width: 10px; height: 10px; }
  ::-webkit-scrollbar-thumb { background: #7a7d84; border-radius: 8px; }
  ::-webkit-scrollbar-track { background: transparent; }
  .docx-wrapper {
    background: transparent !important;
    padding: 22px 14px !important;
    display: flex; flex-direction: column; align-items: center;
  }
  .docx-wrapper > section.docx {
    box-shadow: 0 5px 22px rgba(0, 0, 0, 0.45) !important;
    margin-bottom: 22px !important;
  }
  .docx-wrapper > section.docx:last-child { margin-bottom: 0 !important; }
`;

export default function LaporanPage() {
  const [fas, setFas] = useState(null);
  useEffect(() => { setFas(isFasilitator()); }, []);
  if (fas === null) return <div className="skel mt" style={{ height: 220 }} />;
  return fas ? <LaporanFasilitator /> : <LaporanTim />;
}

/* ===================== MODE FASILITATOR (lihat + komentar) ===================== */
function LaporanFasilitator() {
  const [timId, setTimId] = useState("");
  const [info, setInfo] = useState(null);
  const [gagal, setGagal] = useState("");
  const [memuat, setMemuat] = useState(false);
  const [officeUrl, setOfficeUrl] = useState("");
  const [modeCadangan, setModeCadangan] = useState(false);
  const frameRef = useRef(null);

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
    setInfo(null);
    api.fasilitator.laporanInfo(timId)
      .then((r) => { if (hidup) setInfo(r); })
      .catch((e) => { if (hidup) setGagal(e.message); });
    return () => { hidup = false; };
  }, [timId]);

  const renderCadangan = useCallback(async () => {
    setModeCadangan(true);
    setMemuat(true);
    try {
      const [buf, docx] = await Promise.all([
        api.fasilitator.laporanFile(timId), import("docx-preview"),
      ]);
      const doc = frameRef.current?.contentDocument;
      if (!doc) return;
      doc.head.innerHTML = "";
      doc.body.innerHTML = "";
      const style = doc.createElement("style");
      style.textContent = GAYA_IFRAME;
      doc.head.appendChild(style);
      await docx.renderAsync(buf, doc.body, doc.head, {
        className: "docx", inWrapper: true, breakPages: true,
        renderHeaders: true, renderFooters: true, renderFootnotes: true,
        renderEndnotes: true, ignoreLastRenderedPageBreak: false,
        useBase64URL: true, experimental: true,
      });
    } catch (e) {
      setGagal(`Gagal menampilkan dokumen: ${e.message}`);
    } finally {
      setMemuat(false);
    }
  }, [timId]);

  /** Beralih manual ke Word Online — pakai tautan yang sudah ada, atau minta baru bila belum. */
  const pakaiOffice = useCallback(async () => {
    if (officeUrl) { setModeCadangan(false); return; }
    setMemuat(true);
    try {
      const { url } = await api.fasilitator.laporanTautan(timId);
      setOfficeUrl(
        "https://view.officeapps.live.com/op/embed.aspx?src=" + encodeURIComponent(url)
      );
      setModeCadangan(false);
    } catch (e) {
      setGagal(`Gagal memuat Word Online: ${e.message}`);
    } finally {
      setMemuat(false);
    }
  }, [officeUrl, timId]);

  useEffect(() => {
    let batal = false;
    async function siapkan() {
      if (!info?.ada || !timId) return;
      setOfficeUrl("");
      setModeCadangan(false);
      if (hostLokal() || info.ukuran > BATAS_OFFICE) {
        renderCadangan();
        return;
      }
      setMemuat(true);
      try {
        const { url } = await api.fasilitator.laporanTautan(timId);
        if (batal) return;
        setOfficeUrl(
          "https://view.officeapps.live.com/op/embed.aspx?src=" + encodeURIComponent(url)
        );
      } catch {
        if (!batal) renderCadangan();
      }
    }
    siapkan();
    return () => { batal = true; };
  }, [info?.ada, info?.updated_at, timId, renderCadangan]);

  if (gagal === "belum-assign")
    return (
      <div className="empty mt">
        <div className="big">📞</div>
        <p>Hubungi admin untuk menjadikan kamu fasilitator di tim kamu.</p>
      </div>
    );
  if (gagal) return <div className="error-box mt">{`Gagal memuat: ${gagal}`}</div>;
  if (info === null) return <div className="skel mt" style={{ height: 220 }} />;

  return (
    <>
      {info.ada ? (
        <div className="card mt docx-card">
          <div className="row spread docx-bar">
            <div style={{ minWidth: 0 }}>
              <b className="docx-nama">{info.nama}</b>
              <span className="muted docx-meta">
                {fmtUkuran(info.ukuran)} · {fmtWaktu(info.updated_at)} · 👁 mode fasilitator
              </span>
            </div>
            <div className="row docx-tools" style={{ marginTop: 0 }}>
              <button className="btn sm" onClick={modeCadangan ? pakaiOffice : renderCadangan}
                      title={modeCadangan ? "Coba tampilkan via Word Online" : "Halaman kosong/rusak? Coba tampilan cadangan"}>
                <RefreshCw className="lucide" />
              </button>
              <a className="btn sm" style={{ textDecoration: "none" }} title="Unduh berkas asli"
                 href={`${exportUrl(`/api/fasilitator/tim/${timId}/laporan-file`)}&unduh=1`}>
                <Download className="lucide" />
              </a>
            </div>
          </div>
          {!modeCadangan && officeUrl && (
            <p className="muted" style={{ fontSize: "0.78rem", margin: "-4px 0 10px" }}>
              Halaman tampak kosong atau rusak?{" "}
              <button onClick={renderCadangan} style={{
                background: "none", border: "none", padding: 0, color: "inherit",
                textDecoration: "underline", cursor: "pointer", font: "inherit",
              }}>
                Coba tampilan cadangan
              </button>
              {" "}(kadang terjadi pada cover page bawaan Word — filenya sendiri aman).
            </p>
          )}
          <div className="docx-frame-wrap">
            {memuat && (
              <div className="docx-loading">
                <Loader className="lucide docx-spin" /> Memuat dokumen…
              </div>
            )}
            {officeUrl && !modeCadangan ? (
              <iframe key={officeUrl} src={officeUrl}
                      title="Pratinjau laporan kemajuan (Word Online)"
                      className="docx-frame" allowFullScreen
                      onLoad={() => setMemuat(false)} />
            ) : (
              <iframe ref={frameRef} title="Pratinjau laporan kemajuan"
                      className="docx-frame" sandbox="allow-same-origin" />
            )}
          </div>
        </div>
      ) : (
        <div className="empty mt">
          <div className="big"><FileText className="lucide" /></div>
          <p>Tim belum mengunggah laporan kemajuan.</p>
        </div>
      )}

      {/* Komentar laporan (target = id tim, satu laporan per tim) */}
      {info.ada && timId && (
        <div className="card mt">
          <h3>💬 Komentar laporan</h3>
          <KomentarPanel jenis="laporan" targetId={timId} timId={timId} />
        </div>
      )}
    </>
  );
}

/* ===================== MODE TIM (halaman lama + komentar) ===================== */
function LaporanTim() {
  const { data: info, error: infoErr } = useApi("/api/laporan/info");
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [progres, setProgres] = useState(0);
  const [err, setErr] = useState("");
  const [memuat, setMemuat] = useState(false);
  const [officeUrl, setOfficeUrl] = useState("");   // penampil utama (Word Online)
  const [modeCadangan, setModeCadangan] = useState(false);
  const [zoomPct, setZoomPct] = useState(null);
  const frameRef = useRef(null); // iframe cadangan (docx-preview)
  const inputRef = useRef(null);
  const zoomRef = useRef(null);
  const lebarHalamanRef = useRef(0);

  /* ---------- cadangan: docx-preview di iframe terisolasi ---------- */
  const terapkanZoom = useCallback(() => {
    const iframe = frameRef.current;
    const doc = iframe?.contentDocument;
    if (!doc?.body || !lebarHalamanRef.current) return;
    const fit = Math.min(1, (iframe.clientWidth - 30) / lebarHalamanRef.current);
    const z = zoomRef.current ?? fit;
    doc.body.style.zoom = String(z);
    setZoomPct(Math.round(z * 100));
  }, []);

  const ubahZoom = (langkah) => {
    const kini = zoomRef.current ?? (zoomPct || 100) / 100;
    zoomRef.current = Math.min(3, Math.max(0.3, kini + langkah));
    terapkanZoom();
  };
  const zoomPas = () => { zoomRef.current = null; terapkanZoom(); };

  const renderCadangan = useCallback(async () => {
    setModeCadangan(true);
    setMemuat(true);
    try {
      const [buf, docx] = await Promise.all([api.laporanFile(), import("docx-preview")]);
      const doc = frameRef.current?.contentDocument;
      if (!doc) return;
      doc.head.innerHTML = "";
      doc.body.innerHTML = "";
      const style = doc.createElement("style");
      style.textContent = GAYA_IFRAME;
      doc.head.appendChild(style);
      await docx.renderAsync(buf, doc.body, doc.head, {
        className: "docx",
        inWrapper: true,
        breakPages: true,
        renderHeaders: true,
        renderFooters: true,
        renderFootnotes: true,
        renderEndnotes: true,
        ignoreLastRenderedPageBreak: false,
        useBase64URL: true,
        experimental: true,
      });
      const halaman = doc.querySelector("section.docx");
      lebarHalamanRef.current = halaman ? halaman.offsetWidth : 0;
      zoomRef.current = null;
      terapkanZoom();
    } catch (e) {
      setErr(`Gagal menampilkan dokumen: ${e.message}`);
    } finally {
      setMemuat(false);
    }
  }, [terapkanZoom]);

  /** Beralih manual ke Word Online — pakai tautan yang sudah ada, atau minta baru bila belum. */
  const pakaiOffice = useCallback(async () => {
    if (officeUrl) { setModeCadangan(false); return; }
    setMemuat(true);
    setErr("");
    try {
      const { url } = await api.laporanTautan();
      setOfficeUrl(
        "https://view.officeapps.live.com/op/embed.aspx?src=" + encodeURIComponent(url)
      );
      setModeCadangan(false);
    } catch (e) {
      setErr(`Gagal memuat Word Online: ${e.message}`);
    } finally {
      setMemuat(false);
    }
  }, [officeUrl]);

  /* ---------- pilih penampil ---------- */
  useEffect(() => {
    let batal = false;
    async function siapkan() {
      if (!info?.ada) return;
      setErr("");
      setOfficeUrl("");
      setModeCadangan(false);
      // host lokal tidak terjangkau Microsoft; file >10 MB ditolak penampil Office
      if (hostLokal() || info.ukuran > BATAS_OFFICE) {
        renderCadangan();
        return;
      }
      setMemuat(true);
      try {
        const { url } = await api.laporanTautan();
        if (batal) return;
        setOfficeUrl(
          "https://view.officeapps.live.com/op/embed.aspx?src=" + encodeURIComponent(url)
        );
        // spinner dimatikan saat iframe onLoad
      } catch {
        if (!batal) renderCadangan();
      }
    }
    siapkan();
    return () => { batal = true; };
  }, [info?.ada, info?.updated_at, renderCadangan]);

  useEffect(() => {
    const onResize = () => {
      if (modeCadangan && zoomRef.current == null) terapkanZoom();
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [modeCadangan, terapkanZoom]);

  /* ---------- unggah / hapus ---------- */
  const unggah = async () => {
    if (!file) { toast.err("Pilih berkas .docx dahulu"); return; }
    if (!file.name.toLowerCase().endsWith(".docx")) {
      toast.err("Berkas harus berformat .docx");
      return;
    }
    setBusy(true);
    setProgres(0);
    setErr("");
    try {
      await api.uploadLaporan(file, setProgres);
      toast.ok("Laporan tersimpan — file lama digantikan");
      setFile(null);
      if (inputRef.current) inputRef.current.value = "";
      revalidate("/api/laporan/info").catch(() => {});
    } catch (e) {
      setErr(`Gagal mengunggah: ${e.message}`);
      toast.err("Gagal mengunggah laporan");
    } finally {
      setBusy(false);
      setProgres(0);
    }
  };

  const hapus = async () => {
    const ya = await confirmDialog({
      judul: "Hapus laporan?",
      pesan: `${info?.nama || "Laporan kemajuan"} akan dihapus permanen.`,
    });
    if (!ya) return;
    try {
      await api.deleteLaporan();
      toast.ok("Laporan dihapus");
      setOfficeUrl("");
      revalidate("/api/laporan/info").catch(() => {});
    } catch (e) {
      toast.err(`Gagal menghapus: ${e.message}`);
    }
  };

  return (
    <>
      {/* ===== Unggah ===== */}
      <div className="card mt">
        <div className="metric" style={{ marginBottom: 10 }}>
          <div className="metric-ic v1"><FileText className="lucide" /></div>
          <div>
            <div className="metric-value" style={{ fontSize: "1.02rem" }}>
              Unggah laporan kemajuan (.docx)
            </div>
            <div className="muted">
              Hanya satu laporan yang disimpan — unggahan baru <b>otomatis menggantikan</b> file lama.
            </div>
          </div>
        </div>
        <div className="row">
          <input
            ref={inputRef} type="file" accept=".docx"
            style={{ flex: "1 1 260px", marginTop: 0 }}
            onChange={(e) => setFile(e.target.files?.[0] || null)}
          />
          <button className="btn primary" onClick={unggah} disabled={busy}>
            {busy
              ? (progres > 0 ? `Mengunggah… ${progres}%` : "Menyimpan…")
              : <><Upload className="lucide" /> {info?.ada ? "Ganti laporan" : "Unggah laporan"}</>}
          </button>
        </div>
        {file && (
          <p className="muted mts">
            <Info className="lucide" /> {file.name} · {fmtUkuran(file.size)}
            {info?.ada ? " — akan menggantikan laporan saat ini." : ""}
          </p>
        )}
      </div>

      {(err || infoErr) && (
        <div className="error-box mt">
          <TriangleAlert className="lucide" /> {err || `Gagal memuat info: ${infoErr.message}`}
        </div>
      )}

      {/* ===== Penampil dokumen ===== */}
      {info?.ada ? (
        <div className="card mt docx-card">
          <div className="row spread docx-bar">
            <div style={{ minWidth: 0 }}>
              <b className="docx-nama">{info.nama}</b>
              <span className="muted docx-meta">
                {fmtUkuran(info.ukuran)} · {fmtWaktu(info.updated_at)}
                {!modeCadangan && officeUrl ? " · ditampilkan oleh Word Online" : ""}
              </span>
            </div>
            <div className="row docx-tools" style={{ marginTop: 0 }}>
              {modeCadangan && (
                <>
                  <button className="btn sm" onClick={() => ubahZoom(-0.1)} title="Perkecil">
                    <ZoomOut className="lucide" />
                  </button>
                  <span className="docx-zoom">{memuat ? "…" : `${zoomPct ?? 100}%`}</span>
                  <button className="btn sm" onClick={() => ubahZoom(0.1)} title="Perbesar">
                    <ZoomIn className="lucide" />
                  </button>
                  <button className="btn sm" onClick={zoomPas} title="Pas lebar layar">
                    <Maximize className="lucide" />
                  </button>
                </>
              )}
              <button className="btn sm" onClick={modeCadangan ? pakaiOffice : renderCadangan}
                      title={modeCadangan ? "Coba tampilkan via Word Online" : "Halaman kosong/rusak? Coba tampilan cadangan"}>
                <RefreshCw className="lucide" />
              </button>
              <a className="btn sm" style={{ textDecoration: "none" }} title="Unduh berkas asli"
                 href={`${exportUrl("/api/laporan/file")}&unduh=1`}>
                <Download className="lucide" />
              </a>
              <button className="btn sm danger" onClick={hapus} title="Hapus laporan">
                <Trash2 className="lucide" />
              </button>
            </div>
          </div>

          {!modeCadangan && officeUrl && (
            <p className="muted" style={{ fontSize: "0.78rem", margin: "-4px 0 10px" }}>
              Halaman tampak kosong atau rusak?{" "}
              <button onClick={renderCadangan} style={{
                background: "none", border: "none", padding: 0, color: "inherit",
                textDecoration: "underline", cursor: "pointer", font: "inherit",
              }}>
                Coba tampilan cadangan
              </button>
              {" "}(kadang terjadi pada cover page bawaan Word — filenya sendiri aman, coba unduh untuk memastikan).
            </p>
          )}

          <div className="docx-frame-wrap">
            {memuat && (
              <div className="docx-loading">
                <Loader className="lucide docx-spin" /> Memuat dokumen…
              </div>
            )}
            {officeUrl && !modeCadangan ? (
              <iframe
                key={officeUrl}
                src={officeUrl}
                title="Pratinjau laporan kemajuan (Word Online)"
                className="docx-frame"
                allowFullScreen
                onLoad={() => setMemuat(false)}
              />
            ) : (
              <iframe
                ref={frameRef}
                title="Pratinjau laporan kemajuan"
                className="docx-frame"
                sandbox="allow-same-origin"
              />
            )}
          </div>
        </div>
      ) : (
        info && !info.ada && (
          <div className="empty">
            <div className="big"><FileText className="lucide" /></div>
            <p>Belum ada laporan kemajuan. Unggah berkas <b>.docx</b> untuk
            menampilkannya di sini — persis seperti dibuka di Word.</p>
          </div>
        )
      )}

      {/* Komentar fasilitator pada laporan (target = id akun tim sendiri) */}
      {info?.ada && <KomentarLaporanTim />}
    </>
  );
}

/** Panel komentar laporan milik tim — target_id = id akun sendiri. */
function KomentarLaporanTim() {
  const [idKu, setIdKu] = useState("");
  useEffect(() => {
    api.me().then((r) => setIdKu(r.user?.id || "")).catch(() => {});
  }, []);
  if (!idKu) return null;
  return (
    <div className="card mt">
      <h3>💬 Komentar laporan</h3>
      <p className="sub">diskusi dengan fasilitator tentang laporan kemajuan</p>
      <KomentarPanel jenis="laporan" targetId={idKu} />
    </div>
  );
}

