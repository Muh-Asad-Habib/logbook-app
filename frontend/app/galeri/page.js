"use client";

import { useMemo, useState } from "react";
import { Images } from "lucide-react";
import { fotoUrl, thumbUrl, fmtTgl, useApi } from "@/lib/api";
import { retryFoto } from "@/lib/foto";
import Lightbox from "@/components/Lightbox";

const FILTERS = ["Semua", "Kegiatan", "Bukti belanja"];

export default function GaleriPage() {
  const { data: keg, error: e1 } = useApi("/api/kegiatan");
  const { data: keu, error: e2 } = useApi("/api/keuangan");
  const [filter, setFilter] = useState("Semua");
  const [lb, setLb] = useState(null);

  const items = useMemo(() => {
    if (!keg || !keu) return null;
    const all = [];
    for (const e of keg)
      for (const k of e.foto_keys)
        all.push({ key: k, tanggal: e.tanggal, ket: e.kegiatan.slice(0, 80), jenis: "Kegiatan" });
    for (const e of keu)
      for (const k of e.bukti_keys?.length ? e.bukti_keys : e.bukti_key ? [e.bukti_key] : [])
        all.push({ key: k, tanggal: e.tanggal, ket: e.item.slice(0, 80), jenis: "Bukti belanja" });
    all.sort((a, b) => (a.tanggal < b.tanggal ? 1 : -1));
    return all;
  }, [keg, keu]);

  const loadErr = e1 || e2;
  if (items === null && !loadErr) return <div className="skel mt" style={{ height: 260 }} />;

  const err = loadErr && items === null ? `Gagal memuat: ${loadErr.message}` : "";
  const view = filter === "Semua" ? (items || []) : (items || []).filter((i) => i.jenis === filter);

  const bukaLb = (idx) =>
    setLb({
      items: view.map((it) => ({
        src: fotoUrl(it.key),
        judul: `${fmtTgl(it.tanggal)} · ${it.jenis}`,
        ket: it.ket,
      })),
      index: idx,
    });

  return (
    <>
      <div className="card mt">
        <div className="row spread">
          <div className="pills">
            {FILTERS.map((f) => (
              <button key={f} className={`pill ${filter === f ? "on" : ""}`} onClick={() => setFilter(f)}>
                {f}
              </button>
            ))}
          </div>
          <span className="muted">{view.length} foto</span>
        </div>
      </div>

      {err && <div className="error-box mt">{err}</div>}
      {view.length === 0 && !err && (
        <div className="empty">
          <div className="big"><Images className="lucide" /></div>
          <p>Belum ada foto.</p>
        </div>
      )}

      <div className="galeri mt stagger">
        {view.map((it, idx) => (
          <button type="button" key={it.key} className="g-item" onClick={() => bukaLb(idx)}
                  aria-label={`Lihat foto ${fmtTgl(it.tanggal)}: ${it.ket}`}>
            {/* Petak galeri hanya butuh gambar kecil — pakai thumbnail (±320px).
                Versi resolusi penuh baru dimuat saat foto dibuka di Lightbox. */}
            <img src={thumbUrl(it.key, 320)} alt={it.ket} loading="lazy" onError={retryFoto} />
            <span className="g-cap">
              <b>{fmtTgl(it.tanggal)} · {it.jenis}</b>
              {it.ket}
            </span>
          </button>
        ))}
      </div>

      {lb && <Lightbox {...lb} onClose={() => setLb(null)} />}
    </>
  );
}
