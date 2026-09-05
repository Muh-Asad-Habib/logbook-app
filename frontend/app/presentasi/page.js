"use client";

/**
 * Presentasi — unggah PowerPoint (.pptx) dan/atau simpan tautan Canva.
 *
 * HEMAT TRAFIK SERVER:
 * - Unggah  : berkas dikirim browser LANGSUNG ke ImageKit (izin diterbitkan
 *             server, byte tidak lewat Vercel). Batas 300 MB.
 * - Pratinjau/unduh: byte ditarik dari CDN ImageKit lewat signed URL, lalu
 *             dirakit di browser. Server hanya mengirim daftar URL.
 *
 * PENAMPIL:
 * - SATU-SATUNYA penampil .pptx adalah Microsoft Office
 *   (view.officeapps.live.com) — hasil rendernya identik dengan membuka
 *   berkas di PowerPoint.
 * - Penampil Office hanya sanggup berkas ≤10 MB dan butuh URL yang bisa
 *   dijangkau dari internet. Bila berkas lebih besar (atau server berjalan di
 *   jaringan lokal), pratinjau TIDAK dirender — diganti panel informasi +
 *   tombol Unduh agar dibuka langsung di PowerPoint. Renderer .pptx sisi-klien
 *   sengaja DIHAPUS karena hasilnya tidak setia pada tampilan aslinya.
 * - CANVA : hanya PRATINJAU (iframe embed). Tautan share apa pun dinormalisasi
 *   server ke bentuk `/view?embed`. Tidak ada unduhan.
 *
 * Keduanya boleh ada bersamaan dan bisa dihapus sendiri-sendiri.
 * ACC & komentar berlaku untuk presentasi secara keseluruhan (satu per tim).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Presentation, Upload, Download, Trash2, Info, TriangleAlert,
  Loader, RefreshCw, Link2, ExternalLink,
} from "lucide-react";
import {
  api, useApi, revalidate, fmtTgl, isPendamping, getTimAktif,
} from "@/lib/api";
import KomentarPanel from "@/components/Komentar";
import AccPanel, { useAcc } from "@/components/Acc";
import { toast, confirmDialog } from "@/components/Toast";

const BATAS_OFFICE = 10 * 1024 * 1024;  // penampil Office menolak file > ±10 MB
const MAKS_UNGGAH = 300 * 1024 * 1024;  // batas server 300 MB — dicek DI AWAL

/** Pesan error server bisa panjang/teknis — ringkas agar enak dibaca. */
const ringkasPesan = (m) => {
  const s = String(m || "").replace(/\{[\s\S]{80,}\}/g, "(detail teknis disembunyikan)");
  return s.length > 200 ? `${s.slice(0, 200)}…` : s;
};

const fmtUkuran = (b) =>
  b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil((b || 0) / 1024)} KB`;

const fmtWaktu = (iso) => {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const jam = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  return `${fmtTgl(String(iso).slice(0, 10))} · ${jam}`;
};

/** true bila host tidak terjangkau dari internet (dev lokal / LAN). */
const hostLokal = () =>
  typeof window !== "undefined" &&
  /^(localhost|127\.|0\.0\.0\.0|192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(window.location.hostname);

/** Lihat catatan di halaman Laporan: iframe Office dirender pada lebar
 *  virtual "desktop" lalu di-scale agar halaman penuh selalu pas di layar. */
const LEBAR_VIRTUAL_OFFICE = 860;

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

function OfficeFrame({ url, wrapUkuran, onLoad }) {
  const w = wrapUkuran.w || 0;
  const skala = w > 0 ? Math.min(1, w / LEBAR_VIRTUAL_OFFICE) : 1;
  const perluScale = skala < 1;
  return (
    <div className="docx-office-scale">
      <iframe
        key={url}
        src={url}
        title="Pratinjau presentasi (PowerPoint Online)"
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

/** Pratinjau Canva — murni embed, tanpa unduhan. */
function CanvaFrame({ url }) {
  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        paddingTop: "56.25%", // 16:9, rasio slide Canva
        borderRadius: 10,
        overflow: "hidden",
      }}
    >
      <iframe
        src={url}
        title="Pratinjau presentasi Canva"
        loading="lazy"
        allowFullScreen
        allow="fullscreen"
        style={{
          position: "absolute", inset: 0, width: "100%", height: "100%", border: 0,
        }}
      />
    </div>
  );
}

/**
 * Logika pratinjau .pptx — HANYA penampil Microsoft Office.
 *
 * `alasan` terisi bila pratinjau tidak mungkin dilakukan (berkas >10 MB atau
 * server di jaringan lokal). Dalam keadaan itu berkas SENGAJA tidak diunduh
 * untuk pratinjau — hemat kuota CDN; pengguna cukup menekan tombol Unduh.
 */
function usePratinjauPptx(fileInfo, mintaTautan) {
  const [officeUrl, setOfficeUrl] = useState("");
  const [memuat, setMemuat] = useState(false);
  const [alasan, setAlasan] = useState("");
  const [err, setErr] = useState("");

  const siapkan = useCallback(async () => {
    setErr("");
    setOfficeUrl("");
    setAlasan("");
    if (!fileInfo?.ada) return;

    const halangan = hostLokal()
      ? "server berjalan di jaringan lokal, sehingga penampil PowerPoint Online tidak dapat menjangkaunya"
      : fileInfo.ukuran > BATAS_OFFICE
        ? "melebihi batas penampil PowerPoint Online (10 MB)"
        : "";
    if (halangan) {
      setAlasan(halangan);
      setMemuat(false);
      return;
    }

    setMemuat(true);
    try {
      const { url } = await mintaTautan();
      setOfficeUrl(
        "https://view.officeapps.live.com/op/embed.aspx?src=" + encodeURIComponent(url)
      );
    } catch (e) {
      setErr(`Gagal memuat pratinjau: ${e.message}`);
      setMemuat(false);
    }
  }, [fileInfo?.ada, fileInfo?.ukuran, mintaTautan]);

  useEffect(() => {
    let batal = false;
    (async () => { if (!batal) await siapkan(); })();
    return () => { batal = true; };
  }, [siapkan, fileInfo?.updated_at]);

  return { officeUrl, memuat, setMemuat, alasan, err, setErr, muatUlang: siapkan };
}

/** Bagian pratinjau yang dipakai bersama oleh mode tim & pendamping. */
function IsiPratinjau({ pptx, wrapRef, wrapUkuran, ukuran, unduh, unduhBusy }) {
  const selesai = useCallback(() => pptx.setMemuat(false), [pptx]);

  // Pratinjau tidak mungkin dilakukan → informasikan & arahkan ke unduhan,
  // supaya berkas dibuka di PowerPoint dengan tampilan yang benar-benar asli.
  if (pptx.alasan) {
    return (
      <div className="empty" style={{ marginTop: 10 }}>
        <div className="big"><Presentation className="lucide" /></div>
        <p>
          Pratinjau tidak ditampilkan — berkas <b>{fmtUkuran(ukuran || 0)}</b> {pptx.alasan}.
          <br />
          Unduh berkasnya untuk melihat presentasi lengkap di PowerPoint.
        </p>
        <button
          className="btn primary"
          onClick={unduh}
          disabled={unduhBusy}
          style={{ marginTop: 12 }}
        >
          <Download className="lucide" />{" "}
          {unduhBusy ? "Mengunduh…" : "Unduh presentasi"}
        </button>
      </div>
    );
  }

  return (
    <div className="docx-frame-wrap" ref={wrapRef}>
      {pptx.memuat && (
        <div className="docx-loading">
          <Loader className="lucide docx-spin" /> Memuat presentasi…
        </div>
      )}
      {pptx.officeUrl && (
        <OfficeFrame url={pptx.officeUrl} wrapUkuran={wrapUkuran} onLoad={selesai} />
      )}
    </div>
  );
}

/**
 * Unduhan presentasi TANPA membebani server: berkas ditarik dari CDN
 * (dirakit di browser bila berbagi beberapa bagian), lalu disimpan lewat
 * object URL sehingga nama berkasnya tetap benar.
 */
function useUnduhPresentasi(ambilBerkas, namaInfo) {
  const [busy, setBusy] = useState(false);
  const unduh = useCallback(async () => {
    setBusy(true);
    try {
      const { nama, blob } = await ambilBerkas();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = nama || namaInfo || "presentasi.pptx";
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

export default function PresentasiPage() {
  const [fas, setFas] = useState(null);
  useEffect(() => { setFas(isPendamping()); }, []);
  if (fas === null) return <div className="skel mt" style={{ height: 220 }} />;
  return fas ? <PresentasiFasilitator /> : <PresentasiTim />;
}

/* ===================== MODE PENDAMPING (lihat + komentar + ACC) ===================== */
function PresentasiFasilitator() {
  const [timId, setTimId] = useState("");
  const [info, setInfo] = useState(null);
  const [gagal, setGagal] = useState("");
  const [wrapRef, wrapUkuran] = useUkuranWadah();
  const [acc, muatAcc] = useAcc("presentasi", timId, !!timId);

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
    api.fasilitator.presentasiInfo(timId)
      .then((r) => { if (hidup) setInfo(r); })
      .catch((e) => { if (hidup) setGagal(e.message); });
    return () => { hidup = false; };
  }, [timId]);

  const mintaTautan = useCallback(
    () => api.fasilitator.presentasiTautan(timId), [timId]
  );
  const ambilBerkas = useCallback(
    (onProgress) => api.fasilitator.presentasiBerkas(timId, onProgress), [timId]
  );
  const pptx = usePratinjauPptx(info?.file, mintaTautan);
  const [unduhBusy, unduh] = useUnduhPresentasi(ambilBerkas, info?.file?.nama);

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
      {pptx.err && <div className="error-box mt"><TriangleAlert className="lucide" /> {pptx.err}</div>}

      {info.file.ada && (
        <div className="card mt docx-card">
          <div className="row spread docx-bar">
            <div style={{ minWidth: 0 }}>
              <b className="docx-nama">{info.file.nama}</b>
              <span className="muted docx-meta">
                {fmtUkuran(info.file.ukuran)} · {fmtWaktu(info.file.updated_at)} · 👁 mode pendamping
                {pptx.officeUrl ? " · ditampilkan oleh PowerPoint Online" : ""}
              </span>
            </div>
            <div className="row docx-tools" style={{ marginTop: 0 }}>
              <button className="btn sm" onClick={pptx.muatUlang} title="Muat ulang pratinjau">
                <RefreshCw className="lucide" />
              </button>
              <button className="btn sm" onClick={unduh} disabled={unduhBusy}
                      title="Unduh berkas asli">
                <Download className="lucide" />
              </button>
            </div>
          </div>
          <IsiPratinjau pptx={pptx} wrapRef={wrapRef} wrapUkuran={wrapUkuran}
                        ukuran={info.file.ukuran} unduh={unduh} unduhBusy={unduhBusy} />
        </div>
      )}

      {info.canva.ada && (
        <div className="card mt">
          <div className="row spread" style={{ marginBottom: 10 }}>
            <div style={{ minWidth: 0 }}>
              <b>🎨 Presentasi Canva</b>
              <span className="muted docx-meta">
                pratinjau saja · {fmtWaktu(info.canva.updated_at)}
              </span>
            </div>
            <a className="btn sm" style={{ textDecoration: "none" }} target="_blank"
               rel="noreferrer" href={info.canva.url} title="Buka di tab baru">
              <ExternalLink className="lucide" />
            </a>
          </div>
          <CanvaFrame url={info.canva.url} />
        </div>
      )}

      {!info.ada && (
        <div className="empty mt">
          <div className="big"><Presentation className="lucide" /></div>
          <p>Tim belum mengunggah presentasi (.pptx) maupun menautkan Canva.</p>
        </div>
      )}

      {/* ACC + komentar presentasi (target = id tim, satu status per tim) */}
      {info.ada && timId && (
        <div className="card mt">
          <h3>✅ Pengesahan presentasi</h3>
          <p className="sub">status ACC dari dosen pendamping</p>
          <AccPanel jenis="presentasi" targetId={timId} timId={timId}
                    acc={acc[timId]} onChange={muatAcc} />
        </div>
      )}
      {info.ada && timId && (
        <div className="card mt">
          <h3>💬 Komentar presentasi</h3>
          <KomentarPanel jenis="presentasi" targetId={timId} timId={timId} />
        </div>
      )}
    </>
  );
}

/* ===================== MODE TIM (unggah/kelola + status ACC) ===================== */
function PresentasiTim() {
  const { data: info, error: infoErr } = useApi("/api/presentasi/info");
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [progres, setProgres] = useState(0);
  const [err, setErr] = useState("");
  const [linkCanva, setLinkCanva] = useState("");
  const [busyCanva, setBusyCanva] = useState(false);
  const [wrapRef, wrapUkuran] = useUkuranWadah();
  const inputRef = useRef(null);

  const mintaTautan = useCallback(() => api.presentasiTautan(), []);
  const ambilBerkas = useCallback((onProgress) => api.presentasiBerkas(onProgress), []);
  const pptx = usePratinjauPptx(info?.file, mintaTautan);
  const [unduhBusy, unduh] = useUnduhPresentasi(ambilBerkas, info?.file?.nama);

  /* ---------- unggah / hapus berkas .pptx ---------- */
  const unggah = async () => {
    if (!file) { toast.err("Pilih berkas .pptx dahulu"); return; }
    if (!file.name.toLowerCase().endsWith(".pptx")) {
      toast.err("Berkas harus berformat .pptx");
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
      await api.uploadPresentasi(file, setProgres);
      toast.ok("Presentasi tersimpan — berkas lama digantikan");
      setFile(null);
      if (inputRef.current) inputRef.current.value = "";
      revalidate("/api/presentasi/info").catch(() => {});
    } catch (e) {
      setErr(`Gagal mengunggah: ${ringkasPesan(e.message)}`);
      toast.err("Gagal mengunggah presentasi");
    } finally {
      setBusy(false);
      setProgres(0);
    }
  };

  const hapusFile = async () => {
    const ya = await confirmDialog({
      judul: "Hapus berkas presentasi?",
      pesan: `${info?.file?.nama || "Berkas .pptx"} akan dihapus permanen. Tautan Canva tetap tersimpan.`,
    });
    if (!ya) return;
    try {
      await api.deletePresentasiFile();
      toast.ok("Berkas presentasi dihapus");
      revalidate("/api/presentasi/info").catch(() => {});
    } catch (e) {
      toast.err(`Gagal menghapus: ${e.message}`);
    }
  };

  /* ---------- simpan / hapus tautan Canva ---------- */
  const simpanCanva = async () => {
    const url = linkCanva.trim();
    if (!url) { toast.err("Tempel dahulu tautan Canva"); return; }
    setBusyCanva(true);
    setErr("");
    try {
      await api.setCanva(url);
      toast.ok("Tautan Canva tersimpan");
      setLinkCanva("");
      revalidate("/api/presentasi/info").catch(() => {});
    } catch (e) {
      setErr(`Gagal menyimpan tautan: ${e.message}`);
      toast.err("Tautan Canva tidak dikenali");
    } finally {
      setBusyCanva(false);
    }
  };

  const hapusCanva = async () => {
    const ya = await confirmDialog({
      judul: "Hapus tautan Canva?",
      pesan: "Pratinjau Canva akan hilang. Berkas .pptx (bila ada) tetap tersimpan.",
    });
    if (!ya) return;
    try {
      await api.deleteCanva();
      toast.ok("Tautan Canva dihapus");
      revalidate("/api/presentasi/info").catch(() => {});
    } catch (e) {
      toast.err(`Gagal menghapus: ${e.message}`);
    }
  };

  return (
    <>
      {/* ===== Unggah .pptx ===== */}
      <div className="card mt">
        <div className="metric" style={{ marginBottom: 10 }}>
          <div className="metric-ic v1"><Presentation className="lucide" /></div>
          <div>
            <div id="unggah-presentasi-label" className="metric-value" style={{ fontSize: "1.02rem" }}>
              Unggah presentasi (.pptx)
            </div>
            <div className="muted">
              Hanya satu berkas yang disimpan — unggahan baru <b>otomatis menggantikan</b> yang lama.
              Maksimal <b>300 MB</b>.
            </div>
          </div>
        </div>
        <div className="row">
          <input
            ref={inputRef} type="file" accept=".pptx"
            aria-labelledby="unggah-presentasi-label"
            style={{ flex: "1 1 260px", marginTop: 0 }}
            onChange={(e) => setFile(e.target.files?.[0] || null)}
          />
          <button className="btn primary" onClick={unggah} disabled={busy}>
            {busy
              ? (progres > 0 ? `Mengunggah… ${progres}%` : "Menyimpan…")
              : <><Upload className="lucide" /> {info?.file?.ada ? "Ganti presentasi" : "Unggah presentasi"}</>}
          </button>
        </div>
        {file && (
          <p className="muted mts">
            <Info className="lucide" /> {file.name} · {fmtUkuran(file.size)}
            {info?.file?.ada ? " — akan menggantikan berkas saat ini." : ""}
          </p>
        )}
      </div>

      {/* ===== Tautan Canva ===== */}
      <div className="card mt">
        <div className="metric" style={{ marginBottom: 10 }}>
          <div className="metric-ic v2"><Link2 className="lucide" /></div>
          <div>
            <div id="tautan-canva-label" className="metric-value" style={{ fontSize: "1.02rem" }}>
              Tautan presentasi Canva
            </div>
            <div className="muted">
              Salin dari tombol <b>Bagikan</b> di Canva — tautan{" "}
              <b>canva.com/design/…</b> maupun short-link <b>canva.link/…</b>{" "}
              diterima. Hanya untuk <b>pratinjau</b> — tidak ada unduhan.
            </div>
          </div>
        </div>
        <div className="row">
          <input
            type="url" inputMode="url" placeholder="https://www.canva.com/design/…/view atau https://canva.link/…"
            aria-labelledby="tautan-canva-label"
            value={linkCanva}
            style={{ flex: "1 1 260px", marginTop: 0 }}
            onChange={(e) => setLinkCanva(e.target.value)}
          />
          <button className="btn primary" onClick={simpanCanva} disabled={busyCanva}>
            {busyCanva
              ? "Menyimpan…"
              : <><Link2 className="lucide" /> {info?.canva?.ada ? "Ganti tautan" : "Simpan tautan"}</>}
          </button>
        </div>
        <p className="muted mts" style={{ fontSize: ".78rem" }}>
          <Info className="lucide" /> Pastikan desain Canva disetel <b>“Siapa saja dengan
          tautan dapat melihat”</b> agar pratinjau tampil untuk pendamping.
        </p>
      </div>


      {(err || pptx.err || infoErr) && (
        <div className="error-box mt">
          <TriangleAlert className="lucide" />{" "}
          {err || pptx.err || `Gagal memuat info: ${infoErr.message}`}
        </div>
      )}

      {/* ===== Pratinjau .pptx ===== */}
      {info?.file?.ada && (
        <div className="card mt docx-card">
          <div className="row spread docx-bar">
            <div style={{ minWidth: 0 }}>
              <b className="docx-nama">{info.file.nama}</b>
              <span className="muted docx-meta">
                {fmtUkuran(info.file.ukuran)} · {fmtWaktu(info.file.updated_at)}
                {pptx.officeUrl ? " · ditampilkan oleh PowerPoint Online" : ""}
              </span>
            </div>
            <div className="row docx-tools" style={{ marginTop: 0 }}>
              <button className="btn sm" onClick={pptx.muatUlang} title="Muat ulang pratinjau">
                <RefreshCw className="lucide" />
              </button>
              <button className="btn sm" onClick={unduh} disabled={unduhBusy}
                      title="Unduh berkas asli">
                <Download className="lucide" />
              </button>
              <button className="btn sm danger" onClick={hapusFile} title="Hapus berkas presentasi">
                <Trash2 className="lucide" />
              </button>
            </div>
          </div>
          <IsiPratinjau pptx={pptx} wrapRef={wrapRef} wrapUkuran={wrapUkuran}
                        ukuran={info.file.ukuran} unduh={unduh} unduhBusy={unduhBusy} />
        </div>
      )}

      {/* ===== Pratinjau Canva ===== */}
      {info?.canva?.ada && (
        <div className="card mt">
          <div className="row spread" style={{ marginBottom: 10 }}>
            <div style={{ minWidth: 0 }}>
              <b>🎨 Presentasi Canva</b>
              <span className="muted docx-meta">
                pratinjau saja · {fmtWaktu(info.canva.updated_at)}
              </span>
            </div>
            <div className="row docx-tools" style={{ marginTop: 0 }}>
              <a className="btn sm" style={{ textDecoration: "none" }} target="_blank"
                 rel="noreferrer" href={info.canva.url} title="Buka di tab baru">
                <ExternalLink className="lucide" />
              </a>
              <button className="btn sm danger" onClick={hapusCanva} title="Hapus tautan Canva">
                <Trash2 className="lucide" />
              </button>
            </div>
          </div>
          <CanvaFrame url={info.canva.url} />
        </div>
      )}

      {info && !info.ada && (
        <div className="empty">
          <div className="big"><Presentation className="lucide" /></div>
          <p>Belum ada presentasi. Unggah berkas <b>.pptx</b> atau tempel
          <b> tautan Canva</b> — keduanya boleh dipakai bersamaan.</p>
        </div>
      )}

      {/* ACC + komentar pendamping (target = id akun tim sendiri) */}
      {info?.ada && <KomentarPresentasiTim />}
    </>
  );
}

/** Panel ACC + komentar presentasi milik tim — target_id = id akun sendiri. */
function KomentarPresentasiTim() {
  const [idKu, setIdKu] = useState("");
  useEffect(() => {
    api.me().then((r) => setIdKu(r.user?.id || "")).catch(() => {});
  }, []);
  const [acc, muatAcc] = useAcc("presentasi", "", !!idKu);
  if (!idKu) return null;
  return (
    <>
      <div className="card mt">
        <h3>✅ Pengesahan presentasi</h3>
        <p className="sub">status ACC dari dosen pendamping</p>
        <AccPanel jenis="presentasi" targetId={idKu} acc={acc[idKu]} onChange={muatAcc} />
      </div>
      <div className="card mt">
        <h3>💬 Komentar presentasi</h3>
        <p className="sub">diskusi dengan pendamping tentang materi presentasi</p>
        <KomentarPanel jenis="presentasi" targetId={idKu} />
      </div>
    </>
  );
}
