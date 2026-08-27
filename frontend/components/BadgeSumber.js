"use client";

/**
 * Lencana sumber dana sebuah entri belanja — sekaligus tombol ubah cepat.
 *
 * Tim cukup mengklik lencana untuk memilih Belmawa (+kategori PKM) atau
 * Perguruan Tinggi tanpa membuka dialog Edit. Karena hanya penandaan yang
 * berubah (nominal & tanggal tetap), ACC dosen TIDAK dibatalkan.
 *
 * Mode pendamping (bisaUbah = false) hanya menampilkan lencananya.
 */
import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { api } from "@/lib/api";
import { SUMBER_DANA, KATEGORI_PKM, labelSumber, labelKategori } from "@/lib/pkm";
import { toast } from "@/components/Toast";

/** Tampilan lencana saja (dipakai mode pendamping & sebagai isi tombol). */
function IsiBadge({ e }) {
  if (!e.sumber) return <span className="badge netral">belum dipilih</span>;
  return (
    <>
      <span className={e.sumber === "belmawa" ? "badge info" : "badge pink"}>
        {labelSumber(e.sumber)}
      </span>
      {e.sumber === "belmawa" && (
        e.kategori
          ? <span className="badge ok">{labelKategori(e.kategori)}</span>
          : <span className="badge netral">kategori?</span>
      )}
    </>
  );
}

export default function BadgeSumber({ e, bisaUbah = false, onUbah }) {
  const [buka, setBuka] = useState(false);
  const [sibuk, setSibuk] = useState(false);
  const boxRef = useRef(null);

  // Klik di luar / Esc → tutup menu
  useEffect(() => {
    if (!buka) return;
    const tutup = (ev) => { if (!boxRef.current?.contains(ev.target)) setBuka(false); };
    const esc = (ev) => { if (ev.key === "Escape") setBuka(false); };
    document.addEventListener("pointerdown", tutup);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", tutup);
      document.removeEventListener("keydown", esc);
    };
  }, [buka]);

  if (!bisaUbah) return <span className="badge-sumber"><IsiBadge e={e} /></span>;

  const simpan = async (sumber, kategori = "") => {
    setSibuk(true);
    try {
      await api.setSumberKeuangan(e.id, sumber, kategori);
      setBuka(false);
      toast.ok(sumber
        ? `Ditandai: ${labelSumber(sumber)}${kategori ? ` · ${labelKategori(kategori)}` : ""}`
        : "Penanda sumber dana dihapus");
      onUbah?.();
    } catch (err) {
      toast.err(`Gagal menandai: ${err.message}`);
    } finally {
      setSibuk(false);
    }
  };

  const aktif = (s, k = "") => e.sumber === s && (s !== "belmawa" || e.kategori === k);

  return (
    <span className="badge-sumber" ref={boxRef}>
      <button
        type="button"
        className={`sumber-btn${e.sumber ? "" : " kosong"}`}
        onClick={() => setBuka((v) => !v)}
        disabled={sibuk}
        aria-haspopup="menu"
        aria-expanded={buka}
        title="Ubah sumber dana (tidak membatalkan ACC)"
      >
        <IsiBadge e={e} />
        <ChevronDown className="lucide sumber-caret" />
      </button>

      {buka && (
        <div className="sumber-menu" role="menu">
          <div className="menu-judul">SUMBER DANA</div>

          {KATEGORI_PKM.map((k) => (
            <button
              key={k.id}
              type="button"
              role="menuitem"
              className="sumber-item"
              onClick={() => simpan("belmawa", k.id)}
            >
              <span className="dot belmawa" />
              <span>
                {k.label}
                <small>Belmawa · maks {k.maks}%</small>
              </span>
              {aktif("belmawa", k.id) && <Check className="lucide" />}
            </button>
          ))}

          <button
            type="button"
            role="menuitem"
            className="sumber-item menu-pisah"
            onClick={() => simpan("belmawa", "")}
          >
            <span className="dot belmawa" />
            <span>Belmawa <small>tanpa kategori</small></span>
            {aktif("belmawa", "") && <Check className="lucide" />}
          </button>

          <button
            type="button"
            role="menuitem"
            className="sumber-item"
            onClick={() => simpan("pt")}
          >
            <span className="dot pt" />
            <span>
              {SUMBER_DANA[1].label}
              <small>tanpa kategori</small>
            </span>
            {aktif("pt") && <Check className="lucide" />}
          </button>

          {e.sumber && (
            <button
              type="button"
              role="menuitem"
              className="sumber-item menu-pisah hapus"
              onClick={() => simpan("", "")}
            >
              <span className="dot netral" />
              <span>Kosongkan penanda</span>
            </button>
          )}
        </div>
      )}
    </span>
  );
}

