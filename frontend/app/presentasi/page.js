"use client";

/**
 * Presentasi — unggah PowerPoint (.pptx) dan/atau simpan tautan Canva.
 *
 * - PPTX  : ditampilkan oleh penampil Microsoft Office (view.officeapps.live.com)
 *           lewat tautan publik acak berumur 30 menit — hasil render identik
 *           dengan membuka file di PowerPoint. Tersedia tombol unduh.
 *           Tidak ada penampil cadangan offline untuk .pptx: bila berjalan di
 *           jaringan lokal (Microsoft tidak bisa menjangkau server) atau berkas
 *           > 10 MB, ditampilkan pesan + tombol unduh.
 * - CANVA : hanya PRATINJAU (iframe embed). Tautan share apa pun dinormalisasi
 *           server ke bentuk `/view?embed`. Tidak ada unduhan.
 *
 * Keduanya boleh ada bersamaan dan bisa dihapus sendiri-sendiri.
 * ACC & komentar berlaku untuk presentasi secara keseluruhan (satu per tim).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Presentation, Upload, Download, Trash2, Info, TriangleAlert,
  Loader, RefreshCw, Link2, ExternalLink, WifiOff, Sparkles,
} from "lucide-react";
import {
  api, exportUrl, useApi, revalidate, fmtTgl, isPendamping, getTimAktif,
} from "@/lib/api";
import KomentarPanel from "@/components/Komentar";
import AccPanel, { useAcc } from "@/components/Acc";
import { toast, confirmDialog } from "@/components/Toast";

const BATAS_OFFICE = 10 * 1024 * 1024; // penampil Office menolak file > ±10 MB
const MAKS_UNGGAH = 100 * 1024 * 1024; // batas server 100 MB — dicek DI AWAL agar tak menunggu sia-sia

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

/** Pesan pengganti saat Office tidak bisa menjangkau berkas (host lokal / >10 MB). */
function PratinjauTakTersedia({ alasan, hrefUnduh }) {
  return (
    <div className="empty" style={{ margin: 0 }}>
      <div className="big"><WifiOff className="lucide" /></div>
      <p>
        Pratinjau PowerPoint membutuhkan koneksi publik{alasan ? ` — ${alasan}` : ""}.
        <br />Unduh berkasnya untuk membuka di PowerPoint.
      </p>
      {hrefUnduh && (
        <a className="btn primary mt" style={{ textDecoration: "none" }} href={hrefUnduh}>
          <Download className="lucide" /> Unduh presentasi
        </a>
      )}
    </div>
  );
}

/** Logika bersama: siapkan tautan Office untuk berkas .pptx. */
function usePratinjauPptx(fileInfo, mintaTautan) {
  const [officeUrl, setOfficeUrl] = useState("");
  const [memuat, setMemuat] = useState(false);
  const [takBisa, setTakBisa] = useState("");
  const [err, setErr] = useState("");

  const siapkan = useCallback(async () => {
    setErr("");
    setOfficeUrl("");
    setTakBisa("");
    if (!fileInfo?.ada) return;
    if (hostLokal()) {
      setTakBisa("server sedang berjalan di jaringan lokal");
      return;
    }
    if (fileInfo.ukuran > BATAS_OFFICE) {
      setTakBisa("berkas lebih dari 10 MB");
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

  return { officeUrl, memuat, setMemuat, takBisa, err, setErr, muatUlang: siapkan };
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
  const pptx = usePratinjauPptx(info?.file, mintaTautan);

  if (gagal === "belum-assign")
    return (
      <div className="empty mt">
        <div className="big">📞</div>
        <p>Hubungi admin untuk menugaskanmu sebagai pendamping tim kamu.</p>
      </div>
    );
  if (gagal) return <div className="error-box mt">{`Gagal memuat: ${gagal}`}</div>;
  if (info === null) return <div className="skel mt" style={{ height: 220 }} />;

  const unduhUrl = `${exportUrl(`/api/fasilitator/tim/${timId}/presentasi-file`)}&unduh=1`;

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
              </span>
            </div>
            <div className="row docx-tools" style={{ marginTop: 0 }}>
              <button className="btn sm" onClick={pptx.muatUlang} title="Muat ulang pratinjau">
                <RefreshCw className="lucide" />
              </button>
              <a className="btn sm" style={{ textDecoration: "none" }} title="Unduh berkas asli"
                 href={unduhUrl}>
                <Download className="lucide" />
              </a>
            </div>
          </div>
          {pptx.takBisa ? (
            <PratinjauTakTersedia alasan={pptx.takBisa} hrefUnduh={unduhUrl} />
          ) : (
            <div className="docx-frame-wrap" ref={wrapRef}>
              {pptx.memuat && (
                <div className="docx-loading">
                  <Loader className="lucide docx-spin" /> Memuat presentasi…
                </div>
              )}
              {pptx.officeUrl && (
                <OfficeFrame url={pptx.officeUrl} wrapUkuran={wrapUkuran}
                             onLoad={() => pptx.setMemuat(false)} />
              )}
            </div>
          )}
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
  const pptx = usePratinjauPptx(info?.file, mintaTautan);

  /* ---------- unggah / hapus berkas .pptx ---------- */
  const unggah = async () => {
    if (!file) { toast.err("Pilih berkas .pptx dahulu"); return; }
    if (!file.name.toLowerCase().endsWith(".pptx")) {
      toast.err("Berkas harus berformat .pptx");
      return;
    }
    if (file.size > MAKS_UNGGAH) {
      const mb = (file.size / 1024 / 1024).toFixed(1);
      setErr(`Berkas ${mb} MB melebihi batas 100 MB — perkecil dahulu (mis. kompres gambar di dalamnya).`);
      toast.err("Berkas melebihi batas 100 MB");
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

  const unduhUrl = `${exportUrl("/api/presentasi/file")}&unduh=1`;

  return (
    <>
      {/* ===== Unggah .pptx ===== */}
      <div className="card mt">
        <div className="metric" style={{ marginBottom: 10 }}>
          <div className="metric-ic v1"><Presentation className="lucide" /></div>
          <div>
            <div className="metric-value" style={{ fontSize: "1.02rem" }}>
              Unggah presentasi (.pptx)
            </div>
            <div className="muted">
              Hanya satu berkas yang disimpan — unggahan baru <b>otomatis menggantikan</b> yang lama.
            </div>
          </div>
        </div>
        <div className="row">
          <input
            ref={inputRef} type="file" accept=".pptx"
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
            <div className="metric-value" style={{ fontSize: "1.02rem" }}>
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

      {/* ===== Konversi Canva → PPTX (font tertanam, tampilan sama persis) ===== */}
      <KonversiCanvaCard unduhUrl={unduhUrl} />

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
              <a className="btn sm" style={{ textDecoration: "none" }} title="Unduh berkas asli"
                 href={unduhUrl}>
                <Download className="lucide" />
              </a>
              <button className="btn sm danger" onClick={hapusFile} title="Hapus berkas presentasi">
                <Trash2 className="lucide" />
              </button>
            </div>
          </div>
          {pptx.takBisa ? (
            <PratinjauTakTersedia alasan={pptx.takBisa} hrefUnduh={unduhUrl} />
          ) : (
            <div className="docx-frame-wrap" ref={wrapRef}>
              {pptx.memuat && (
                <div className="docx-loading">
                  <Loader className="lucide docx-spin" /> Memuat presentasi…
                </div>
              )}
              {pptx.officeUrl && (
                <OfficeFrame url={pptx.officeUrl} wrapUkuran={wrapUkuran}
                             onLoad={() => pptx.setMemuat(false)} />
              )}
            </div>
          )}
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

/* ===================== KONVERSI CANVA → PPTX (font tertanam) =====================
 * Masalah yang diselesaikan: PPTX unduhan Canva tampil beda di PowerPoint
 * karena fontnya tidak ter-install. Server menanam font Google langsung ke
 * dalam file → tampilan sama persis di komputer mana pun, semua teks & grup
 * tetap bisa diedit/digeser. Alur: unduh .pptx dari Canva → unggah → konversi. */
function KonversiCanvaCard({ unduhUrl }) {
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [progres, setProgres] = useState(0);
  const [laporan, setLaporan] = useState(null);
  const [err, setErr] = useState("");
  const inputRef = useRef(null);

  const konversi = async () => {
    if (!file) { toast.err("Pilih berkas .pptx hasil unduhan Canva dahulu"); return; }
    if (!file.name.toLowerCase().endsWith(".pptx")) {
      toast.err("Berkas harus berformat .pptx"); return;
    }
    if (file.size > MAKS_UNGGAH) {
      const mb = (file.size / 1024 / 1024).toFixed(1);
      setErr(`Berkas ${mb} MB melebihi batas 100 MB — di Canva coba pisahkan desain ` +
             "menjadi beberapa bagian, atau kecilkan gambar-gambarnya, lalu unduh ulang .pptx-nya.");
      toast.err("Berkas melebihi batas 100 MB");
      return;
    }
    setBusy(true);
    setProgres(0);
    setErr("");
    setLaporan(null);
    try {
      const r = await api.konversiPptx(file, setProgres);
      setLaporan(r.laporan || null);
      toast.ok("Konversi selesai — font ditanam, berkas presentasi diperbarui");
      revalidate("/api/presentasi/info").catch(() => {});
      setFile(null);
      if (inputRef.current) inputRef.current.value = "";
    } catch (e) {
      setErr(`Gagal konversi: ${ringkasPesan(e.message)} — coba lagi; bila berulang, ` +
             "perkecil berkas atau hubungi admin.");
    } finally {
      setBusy(false);
      setProgres(0);
    }
  };

  return (
    <div className="card mt">
      <div className="metric" style={{ marginBottom: 10 }}>
        <div className="metric-ic v3"><Sparkles className="lucide" /></div>
        <div>
          <div className="metric-value" style={{ fontSize: "1.02rem" }}>
            Canva → PPTX sama persis (font ditanam)
          </div>
          <div className="muted">
            PPTX unduhan Canva sering <b>berubah tampilannya</b> di PowerPoint karena
            fontnya tidak ter-install. Fitur ini <b>menanam font Google ke dalam file</b> —
            tampilan jadi identik, semua teks & grup <b>tetap bisa diedit/digeser</b>,
            siap diberi animasi PowerPoint.
          </div>
        </div>
      </div>

      <ol className="muted" style={{ margin: "0 0 10px 18px", fontSize: ".85rem", lineHeight: 1.7 }}>
        <li>Di Canva: <b>Bagikan → Unduh → Microsoft PowerPoint (.pptx)</b></li>
        <li>Unggah berkasnya di bawah ini lalu klik <b>Konversi</b> (maks. <b>100 MB</b>)</li>
        <li>Unduh hasilnya — otomatis tersimpan juga sebagai presentasi tim</li>
      </ol>

      <div className="row">
        <input
          ref={inputRef} type="file" accept=".pptx"
          style={{ flex: "1 1 260px", marginTop: 0 }}
          onChange={(e) => setFile(e.target.files?.[0] || null)}
        />
        <button className="btn primary" onClick={konversi} disabled={busy}>
          {busy
            ? (progres > 0 ? `Memproses… ${progres}%` : "Menanam font…")
            : <><Upload className="lucide" /> Konversi berkas Canva</>}
        </button>
      </div>
      {file && (
        <p className="muted mts">
          <Info className="lucide" /> {file.name} · {fmtUkuran(file.size)}
          {file.size > MAKS_UNGGAH
            ? " — ⚠️ melebihi batas 100 MB, tidak akan diproses"
            : file.size > 30 * 1024 * 1024
              ? " — berkas besar, proses bisa ±1–2 menit"
              : ""}
        </p>
      )}

      {err && (
        <div className="error-box mt"><TriangleAlert className="lucide" /> {err}</div>
      )}
      {laporan && <LaporanKonversi laporan={laporan} unduhUrl={unduhUrl} />}
    </div>
  );
}

/** Hasil konversi: status tiap font + slide yang memuat elemen rasterisasi. */
function LaporanKonversi({ laporan, unduhUrl }) {
  const tertanam = laporan.fonts.filter((f) => f.status === "tertanam");
  const sistem = laporan.fonts.filter((f) => f.status === "sistem");
  const manual = laporan.fonts.filter((f) => f.status === "manual");
  return (
    <div className="mt" style={{ borderTop: "1px solid var(--border, #e5e7eb)", paddingTop: 10 }}>
      <b>📋 Laporan konversi</b>
      <p className="muted mts" style={{ fontSize: ".8rem" }}>
        {laporan.totalSlide} slide diproses
        {laporan.sudahTertanam ? " · file sumber sudah memiliki font tertanam" : ""}
      </p>
      {tertanam.length > 0 && (
        <p className="mts" style={{ fontSize: ".85rem" }}>
          ✅ <b>Font ditanam ke dalam file</b> (tampil sama di komputer mana pun):{" "}
          {tertanam.map((f) => f.nama).join(", ")}
        </p>
      )}
      {sistem.length > 0 && (
        <p className="mts muted" style={{ fontSize: ".8rem" }}>
          ℹ️ Font bawaan Windows/Office (tidak perlu ditanam): {sistem.map((f) => f.nama).join(", ")}
        </p>
      )}
      {manual.length > 0 && (
        <div className="mts" style={{ fontSize: ".85rem" }}>
          ⚠️ <b>Font premium Canva — tidak tersedia di Google Fonts.</b> Agar tampil
          persis, unduh & install manual (atau ganti fontnya di Canva):
          <ul style={{ margin: "4px 0 0 18px" }}>
            {manual.map((f) => (
              <li key={f.nama}>
                {f.nama}{" "}
                <a href={f.url} target="_blank" rel="noreferrer">cari font ↗</a>
              </li>
            ))}
          </ul>
        </div>
      )}
      {laporan.raster.length > 0 && (
        <p className="mts muted" style={{ fontSize: ".8rem" }}>
          🖼 Slide {laporan.raster.map((r) => r.slide).join(", ")} memuat gambar/elemen
          yang dirasterisasi Canva (mis. teks melengkung/efek khusus) — tetap bisa
          digeser & diberi animasi, tapi isinya tidak bisa diketik ulang.
        </p>
      )}
      <a className="btn primary mt" style={{ textDecoration: "none" }} href={unduhUrl}>
        <Download className="lucide" /> Unduh PPTX hasil konversi
      </a>
    </div>
  );
}

