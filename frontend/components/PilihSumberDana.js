"use client";

/**
 * Pemilih SUMBER DANA & KATEGORI PKM berbentuk chip.
 *
 * Menggantikan dua dropdown yang sebelumnya dipakai di dialog belanja: pilihan
 * kini terlihat sekaligus (tanpa membuka select), berwarna sesuai sumbernya,
 * dan panel kategori hanya muncul saat "Belmawa" dipilih — persis aturan
 * pedoman PKM (kategori hanya berlaku untuk dana Belmawa).
 *
 * Nilai dikirim lewat <input type="hidden"> sehingga FormData dialog tidak
 * perlu diubah. Chip-nya juga dipakai ulang pada menu ubah cepat
 * (components/BadgeSumber.js) agar tampilannya konsisten.
 */
import { Check, Wallet, X } from "lucide-react";
import { KATEGORI_PKM, SUMBER_DANA } from "@/lib/pkm";

/** Satu chip pilihan — `warna` = belmawa | pt | netral. */
export function ChipDana({ warna = "netral", aktif, judul, ket, onClick, ikon }) {
  return (
    <button
      type="button"
      className={`dana-chip ${warna}${aktif ? " on" : ""}`}
      onClick={onClick}
      aria-pressed={aktif}
      title={ket ? `${judul} — ${ket}` : judul}
    >
      {ikon || <span className={`dot ${warna}`} />}
      <span className="dana-chip-teks">
        {judul}
        {ket && <small>{ket}</small>}
      </span>
      {aktif && <Check className="lucide dana-chip-cek" />}
    </button>
  );
}

/** Baris chip kategori PKM (Belmawa) + opsi "tanpa kategori". */
export function ChipsKategori({ kategori, onPilih, tanpaKategori = true }) {
  return (
    <div className="dana-chips kat">
      {KATEGORI_PKM.map((k) => (
        <ChipDana
          key={k.id}
          warna="belmawa"
          aktif={kategori === k.id}
          judul={k.label}
          ket={`maks ${k.maks}%`}
          onClick={() => onPilih(k.id)}
        />
      ))}
      {tanpaKategori && (
        <ChipDana
          warna="netral"
          aktif={!kategori}
          judul="Tanpa kategori"
          ket="boleh dilengkapi nanti"
          onClick={() => onPilih("")}
        />
      )}
    </div>
  );
}

/**
 * Pemilih lengkap untuk dialog belanja.
 * @param {string} sumber   "" | "belmawa" | "pt"
 * @param {string} kategori id kategori PKM (hanya bermakna bila sumber Belmawa)
 * @param {(sumber: string, kategori: string) => void} onChange
 */
export default function PilihSumberDana({ sumber, kategori, onChange }) {
  const pilihSumber = (s) => onChange(s, s === "belmawa" ? kategori : "");

  return (
    <div className="pilih-dana">
      <input type="hidden" name="sumber" value={sumber || ""} />
      <input type="hidden" name="kategori" value={sumber === "belmawa" ? (kategori || "") : ""} />

      <div className="pilih-dana-judul">
        <Wallet className="lucide" /> Sumber dana <span className="muted">(opsional)</span>
      </div>
      <div className="dana-chips">
        {SUMBER_DANA.map((s) => (
          <ChipDana
            key={s.id}
            warna={s.id}
            aktif={sumber === s.id}
            judul={s.label}
            ket={s.id === "belmawa" ? "punya kategori belanja" : "tanpa kategori"}
            onClick={() => pilihSumber(s.id)}
          />
        ))}
        {sumber && (
          <ChipDana
            warna="netral"
            judul="Kosongkan"
            onClick={() => onChange("", "")}
            ikon={<X className="lucide" />}
          />
        )}
      </div>

      {sumber === "belmawa" && (
        <div className="pilih-dana-kat">
          <div className="pilih-dana-judul">
            Kategori belanja PKM <span className="muted">(opsional)</span>
          </div>
          <ChipsKategori
            kategori={kategori}
            onPilih={(id) => onChange("belmawa", id)}
          />
        </div>
      )}
    </div>
  );
}

