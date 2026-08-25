"use client";

/**
 * Laporan Kemajuan — unggah & tampilkan dokumen Word (.docx).
 *
 * PENAMPIL UTAMA: Microsoft Office embed (view.officeapps.live.com) — mesin
 * render Word sungguhan, hasilnya 100% identik dengan membuka file di Word
 * (termasuk text-frame, kotak "Mengetahui", stempel, tanda tangan, dll.).
 * Berkas diambil Microsoft lewat tautan publik acak berumur 30 menit.
 *
 * CADANGAN: docx-preview dirender di Shadow DOM terisolasi — otomatis
 * dipakai bila berjalan di jaringan lokal (Microsoft tak bisa menjangkau)
 * atau file terlalu besar untuk penampil Office (>10 MB).
 * (Catatan: docx-preview membuat elemen lewat `document.createElement`
 * GLOBAL, jadi wadahnya WAJIB berada di dokumen yang sama seperti halaman
 * — memakai <iframe> terpisah bikin node "lintas-dokumen" dan di banyak
 * browser/WebView Android hasilnya blank tanpa error. Shadow DOM tetap
 * mengisolasi gaya CSS tanpa masalah itu.)
 *
 * Penyimpanan hanya SATU file per akun: unggahan baru menggantikan yang lama.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  FileText, Upload, Download, Trash2, Info, TriangleAlert,
  ZoomIn, ZoomOut, Maximize, Loader, RefreshCw,
} from "lucide-react";
import {
  api, useApi, revalidate, fmtTgl, isPendamping, getTimAktif,
} from "@/lib/api";
import KomentarPanel from "@/components/Komentar";
import AccPanel, { useAcc } from "@/components/Acc";
import { toast, confirmDialog } from "@/components/Toast";

const BATAS_OFFICE = 10 * 1024 * 1024; // penampil Office menolak file > ±10 MB
const MAKS_UNGGAH = 300 * 1024 * 1024; // batas unggah 300 MB — dicek DI AWAL

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

/* Gaya dasar DI DALAM shadow root cadangan (docx-preview). */
const GAYA_CADANGAN = `
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

/**
 * Siapkan shadow root KOSONG di elemen host, berisi dua kontainer:
 * styleBox (utk <style> yang dihasilkan docx-preview) & bodyBox (isi dokumen).
 * Shadow DOM dipilih (bukan iframe) supaya elemen yang dibuat docx-preview
 * lewat `document.createElement` global tetap satu dokumen dengan wadahnya.
 */
function siapkanShadow(host) {
  if (!host) return null;
  const root = host.shadowRoot || host.attachShadow({ mode: "open" });
  root.innerHTML = "";
  const styleBox = document.createElement("div");
  const bodyBox = document.createElement("div");
  bodyBox.className = "docx-cadangan-body";
  root.append(styleBox, bodyBox);
  return { root, styleBox, bodyBox };
}

/** Tambahkan gaya tampilan cadangan — panggil SETELAH renderAsync selesai
 *  (renderAsync mengosongkan styleBox saat mulai, jadi gaya kita akan
 *  tertimpa bila ditambahkan sebelum itu). */
function tambahkanGayaCadangan(root) {
  const style = document.createElement("style");
  style.textContent = GAYA_CADANGAN;
  root.appendChild(style);
}

/** Tunggu sampai ref elemen ter-mount (jaga-jaga bila render React belum
 *  selesai saat promise unduh/impor sudah keburu resolve). */
async function tungguRef(ref, sisaCoba = 20) {
  for (let i = 0; i < sisaCoba && !ref.current; i++) {
    await new Promise((r) => requestAnimationFrame(r));
  }
  return ref.current;
}

/**
 * Word Online (view.officeapps.live.com) TIDAK auto-fit ke lebar wadah kita —
 * di kartu sempit (HP) zoom bawaannya bikin halaman kepotong, harus di-zoom
 * out manual. Karena itu iframe pihak ketiga & tak bisa kita atur zoom
 * internalnya, dipakai trik CSS umum: render iframe pada lebar virtual
 * "desktop" (di mana Office menampilkan halaman utuh pada zoom 100%), lalu
 * `transform: scale()` seluruh iframe agar pas ke wadah asli yang sempit.
 * Hasilnya: halaman penuh selalu tampil otomatis, tanpa perlu zoom manual.
 *
 * 860px dipilih pas: halaman A4 pada zoom 100% Office ≈ 816px + sedikit
 * margin, jadi halaman mengisi hampir seluruh lebar kartu tanpa strip
 * abu-abu lebar di kiri/kanan. (Tetap > ±768px supaya Office memakai UI
 * desktop, bukan UI mobile yang zoom-nya bermasalah.)
 */
const LEBAR_VIRTUAL_OFFICE = 860;

/** Amati ukuran elemen (ResizeObserver) — dipakai utk hitung skala iframe Office. */
function useUkuranWadah() {
  const ref = useRef(null);
  const [ukuran, setUkuran] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      setUkuran({ w: width, h: height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, ukuran];
}

/** Bungkus <iframe> Office dgn wadah overflow:hidden + transform-scale agar
 *  halaman penuh selalu pas di lebar layar berapa pun (lihat catatan di atas).
 *  Di wadah lebar (>= lebar virtual) iframe dirender normal tanpa scale —
 *  scale-up hanya bikin blur, tidak ada gunanya. */
function OfficeFrame({ url, wrapUkuran, onLoad }) {
  const w = wrapUkuran.w || 0;
  const skala = w > 0 ? Math.min(1, w / LEBAR_VIRTUAL_OFFICE) : 1;
  const perluScale = skala < 1;
  return (
    <div className="docx-office-scale">
      <iframe
        key={url}
        src={url}
        title="Pratinjau laporan kemajuan (Word Online)"
        allowFullScreen
        onLoad={onLoad}
        style={{
          width: perluScale ? LEBAR_VIRTUAL_OFFICE : "100%",
          height: perluScale && wrapUkuran.h > 0 ? wrapUkuran.h / skala : "100%",
          transform: perluScale ? `scale(${skala})` : "none",
          transformOrigin: "0 0",
          border: 0,
        }}
      />
    </div>
  );
}

export default function LaporanPage() {
  const [fas, setFas] = useState(null);
  useEffect(() => { setFas(isPendamping()); }, []);
  if (fas === null) return <div className="skel mt" style={{ height: 220 }} />;
  return fas ? <LaporanFasilitator /> : <LaporanTim />;
}

/**
 * Unduhan laporan TANPA membebani server: byte ditarik dari CDN ImageKit
 * (dirakit di browser bila berkasnya berbagi beberapa bagian), lalu disimpan
 * lewat object URL sehingga NAMA BERKAS ASLI tetap terjaga — `/file` kini
 * me-redirect ke CDN, jadi tautan <a> biasa akan memakai nama acak CDN.
 */
function useUnduhLaporan(ambilBerkas, namaInfo) {
  const [busy, setBusy] = useState(false);
  const unduh = useCallback(async () => {
    setBusy(true);
    try {
      const { nama, blob } = await ambilBerkas();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = namaInfo || nama || "laporan-kemajuan.docx";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch (e) {
      toast.err(`Gagal mengunduh: ${e.message}`);
    } finally {
      setBusy(false);
    }
  }, [ambilBerkas, namaInfo]);
  return [busy, unduh];
}

/* ===================== MODE PENDAMPING (lihat + komentar + ACC) ===================== */
function LaporanFasilitator() {
  const [timId, setTimId] = useState("");
  const [info, setInfo] = useState(null);
  const [gagal, setGagal] = useState("");
  const [memuat, setMemuat] = useState(false);
  const [officeUrl, setOfficeUrl] = useState("");
  const [modeCadangan, setModeCadangan] = useState(false);
  const frameRef = useRef(null);
  const [wrapRef, wrapUkuran] = useUkuranWadah();
  const [acc, muatAcc] = useAcc("laporan", timId, !!timId);
  const ambilBerkas = useCallback(
    (onProgress) => api.fasilitator.laporanBerkas(timId, onProgress), [timId]
  );
  const [unduhBusy, unduh] = useUnduhLaporan(ambilBerkas, info?.nama);

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
      const host = await tungguRef(frameRef);
      const shadow = siapkanShadow(host);
      if (!shadow) { setGagal("Wadah pratinjau belum siap, coba lagi."); return; }
      await docx.renderAsync(buf, shadow.bodyBox, shadow.styleBox, {
        className: "docx", inWrapper: true, breakPages: true,
        renderHeaders: true, renderFooters: true, renderFootnotes: true,
        renderEndnotes: true, ignoreLastRenderedPageBreak: false,
        useBase64URL: true, experimental: true,
      });
      tambahkanGayaCadangan(shadow.root);
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
        <p>Hubungi admin untuk menugaskanmu sebagai pendamping tim kamu.</p>
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
                {fmtUkuran(info.ukuran)} · {fmtWaktu(info.updated_at)} · 👁 mode pendamping
              </span>
            </div>
            <div className="row docx-tools" style={{ marginTop: 0 }}>
              <button className="btn sm" onClick={modeCadangan ? pakaiOffice : renderCadangan}
                      title={modeCadangan ? "Coba tampilkan via Word Online" : "Halaman kosong/rusak? Coba tampilan cadangan"}>
                <RefreshCw className="lucide" />
              </button>
              <button className="btn sm" onClick={unduh} disabled={unduhBusy}
                      title="Unduh berkas asli">
                <Download className="lucide" />
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
              {" "}(kadang terjadi pada cover page bawaan Word — filenya sendiri aman).
            </p>
          )}
          <div className="docx-frame-wrap" ref={wrapRef}>
            {memuat && (
              <div className="docx-loading">
                <Loader className="lucide docx-spin" /> Memuat dokumen…
              </div>
            )}
            {officeUrl && !modeCadangan ? (
              <OfficeFrame url={officeUrl} wrapUkuran={wrapUkuran} onLoad={() => setMemuat(false)} />
            ) : (
              <div ref={frameRef} title="Pratinjau laporan kemajuan"
                   className="docx-frame" />
            )}
          </div>
        </div>
      ) : (
        <div className="empty mt">
          <div className="big"><FileText className="lucide" /></div>
          <p>Tim belum mengunggah laporan kemajuan.</p>
        </div>
      )}

      {/* ACC + komentar laporan (target = id tim, satu laporan per tim) */}
      {info.ada && timId && (
        <div className="card mt">
          <h3>✅ Pengesahan laporan</h3>
          <p className="sub">status ACC dari dosen pendamping</p>
          <AccPanel jenis="laporan" targetId={timId} timId={timId}
                    acc={acc[timId]} onChange={muatAcc} />
        </div>
      )}
      {info.ada && timId && (
        <div className="card mt">
          <h3>💬 Komentar laporan</h3>
          <KomentarPanel jenis="laporan" targetId={timId} timId={timId} />
        </div>
      )}
    </>
  );
}

/* ===================== MODE TIM (halaman lama + komentar + status ACC) ===================== */
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
  const frameRef = useRef(null); // host shadow DOM cadangan (docx-preview)
  const [wrapRef, wrapUkuran] = useUkuranWadah();
  const inputRef = useRef(null);
  const zoomRef = useRef(null);
  const lebarHalamanRef = useRef(0);
  const ambilBerkas = useCallback((onProgress) => api.laporanBerkas(onProgress), []);
  const [unduhBusy, unduh] = useUnduhLaporan(ambilBerkas, info?.nama);

  /* ---------- cadangan: docx-preview di shadow DOM terisolasi ---------- */
  const terapkanZoom = useCallback(() => {
    const host = frameRef.current;
    const bodyBox = host?.shadowRoot?.querySelector(".docx-cadangan-body");
    if (!bodyBox || !lebarHalamanRef.current) return;
    const fit = Math.min(1, (host.clientWidth - 30) / lebarHalamanRef.current);
    const z = zoomRef.current ?? fit;
    bodyBox.style.zoom = String(z);
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
      const host = await tungguRef(frameRef);
      const shadow = siapkanShadow(host);
      if (!shadow) { setErr("Wadah pratinjau belum siap, coba lagi."); return; }
      await docx.renderAsync(buf, shadow.bodyBox, shadow.styleBox, {
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
      tambahkanGayaCadangan(shadow.root);
      const halaman = shadow.bodyBox.querySelector("section.docx");
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
    if (file.size > MAKS_UNGGAH) {
      const mb = (file.size / 1024 / 1024).toFixed(1);
      setErr(`Berkas ${mb} MB melebihi batas 300 MB — perkecil dahulu (mis. kompres gambar di dalamnya).`);
      toast.err("Berkas melebihi batas 300 MB");
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
              Maksimal <b>300 MB</b>.
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
              <button className="btn sm" onClick={unduh} disabled={unduhBusy}
                      title="Unduh berkas asli">
                <Download className="lucide" />
              </button>
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

          <div className="docx-frame-wrap" ref={wrapRef}>
            {memuat && (
              <div className="docx-loading">
                <Loader className="lucide docx-spin" /> Memuat dokumen…
              </div>
            )}
            {officeUrl && !modeCadangan ? (
              <OfficeFrame url={officeUrl} wrapUkuran={wrapUkuran} onLoad={() => setMemuat(false)} />
            ) : (
              <div
                ref={frameRef}
                title="Pratinjau laporan kemajuan"
                className="docx-frame"
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

/** Panel ACC + komentar laporan milik tim — target_id = id akun sendiri. */
function KomentarLaporanTim() {
  const [idKu, setIdKu] = useState("");
  useEffect(() => {
    api.me().then((r) => setIdKu(r.user?.id || "")).catch(() => {});
  }, []);
  const [acc, muatAcc] = useAcc("laporan", "", !!idKu);
  if (!idKu) return null;
  return (
    <>
      <div className="card mt">
        <h3>✅ Pengesahan laporan</h3>
        <p className="sub">status ACC dari dosen pendamping</p>
        <AccPanel jenis="laporan" targetId={idKu} acc={acc[idKu]} onChange={muatAcc} />
      </div>
      <div className="card mt">
        <h3>💬 Komentar laporan</h3>
        <p className="sub">diskusi dengan pendamping tentang laporan kemajuan</p>
        <KomentarPanel jenis="laporan" targetId={idKu} />
      </div>
    </>
  );
}

