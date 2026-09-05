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
import { ChevronDown, X } from "lucide-react";
import { api } from "@/lib/api";
import { SUMBER_DANA, labelSumber, labelKategori } from "@/lib/pkm";
import { ChipDana, ChipsKategori } from "@/components/PilihSumberDana";
import { toast } from "@/components/Toast";

/** Tampilan lencana saja (dipakai mode pendamping & sebagai isi tombol). */
function IsiBadge({ e }) {
  if (!e.sumber) return <span className="badge netral">belum dipilih</span>;
  return (
    <>
      <span className={e.sumber === "belmawa" ? "badge info" : "badge teal"}>
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
  // Sumber yang SEDANG ditampilkan di menu — dipakai agar panel kategori
  // langsung muncul begitu chip "Belmawa" diklik, tanpa menunggu data segar.
  const [sumberTampil, setSumberTampil] = useState(e.sumber || "");
  const menuRef = useRef(null);

  useEffect(() => { setSumberTampil(e.sumber || ""); }, [e.sumber]);

  // Dialog native berada di top layer: tidak terpotong overflow tabel/kartu.
  useEffect(() => {
    if (buka) menuRef.current?.showModal();
    else menuRef.current?.close();
  }, [buka]);

  if (!bisaUbah) return <span className="badge-sumber"><IsiBadge e={e} /></span>;

  /** Simpan penanda; `tutup=false` dipakai saat pengguna masih memilih kategori. */
  const simpan = async (sumber, kategori = "", tutup = true) => {
    setSibuk(true);
    setSumberTampil(sumber);
    try {
      await api.setSumberKeuangan(e.id, sumber, kategori);
      if (tutup) setBuka(false);
      toast.ok(sumber
        ? `Ditandai: ${labelSumber(sumber)}${kategori ? ` · ${labelKategori(kategori)}` : ""}`
        : "Penanda sumber dana dihapus");
      onUbah?.();
    } catch (err) {
      setSumberTampil(e.sumber || "");
      toast.err(`Gagal menandai: ${err.message}`);
    } finally {
      setSibuk(false);
    }
  };

  return (
    <span className="badge-sumber">
      <button
        type="button"
        className={`sumber-btn${e.sumber ? "" : " kosong"}`}
        onClick={() => setBuka((v) => !v)}
        disabled={sibuk}
        aria-haspopup="dialog"
        aria-expanded={buka}
        title="Ubah sumber dana (tidak membatalkan ACC)"
      >
        <IsiBadge e={e} />
        <ChevronDown className="lucide sumber-caret" />
      </button>

      <dialog ref={menuRef} aria-label="Ubah sumber dana" onClose={() => setBuka(false)}
              style={{ maxWidth: 420 }}>
        <div className="dlg-head">
          <h3>Sumber dana</h3>
          <button type="button" className="btn sm" style={{ marginLeft: "auto" }}
                  onClick={() => setBuka(false)}>Tutup</button>
        </div>
        <div className="dlg-body">
          <div className="dana-chips">
            {SUMBER_DANA.map((s) => (
              <ChipDana
                key={s.id}
                warna={s.id}
                aktif={sumberTampil === s.id}
                judul={s.label}
                ket={s.id === "belmawa" ? "pilih kategori di bawah" : "tanpa kategori"}
                onClick={() =>
                  simpan(s.id, s.id === "belmawa" ? (e.kategori || "") : "",
                    s.id !== "belmawa")}
              />
            ))}
            {e.sumber && (
              <ChipDana
                warna="netral"
                judul="Kosongkan"
                onClick={() => simpan("", "")}
                ikon={<X className="lucide" />}
              />
            )}
          </div>

          {sumberTampil === "belmawa" && (
            <>
              <h4 className="mt" style={{ marginBottom: 8 }}>Kategori PKM</h4>
              <ChipsKategori
                kategori={e.kategori || ""}
                onPilih={(id) => simpan("belmawa", id)}
              />
            </>
          )}
        </div>
      </dialog>
    </span>
  );
}

