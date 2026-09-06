"use client";

/**
 * Isian form bersama untuk dialog Kegiatan & Keuangan.
 *
 * Tujuannya menyeragamkan tiga hal yang dulu ditulis ulang di tiap dialog:
 *  1. Label selalu TERLIHAT di atas kontrol (bukan sekadar placeholder).
 *  2. Keterangan bantu ditautkan lewat `aria-describedby` sehingga ikut
 *     dibacakan pembaca layar, bukan hanya terlihat mata.
 *  3. Awalan/akhiran satuan ("Rp", "%", "menit") menyatu di dalam kotak yang
 *     sama dengan input, jadi lebarnya tidak pernah memaksa halaman menggulir.
 *
 * Semua kontrol memakai tinggi sentuh minimum yang sama di segala ukuran layar
 * (lihat .isian-* pada app/globals.css).
 */
import { useId } from "react";
import { Paperclip } from "lucide-react";

/** Bungkus label + kontrol + keterangan; `lebar` = span kolom pada grid. */
function Bingkai({ id, label, ket, opsional, lebar = 1, anak }) {
  const ketId = ket ? `${id}-ket` : undefined;
  return (
    <div className={`isian${lebar === 2 ? " isian-penuh" : ""}`}>
      <label className="isian-lbl" htmlFor={id}>
        <span className="isian-teks">{label}</span>
        {opsional && <span className="isian-opsional">opsional</span>}
      </label>
      {anak(ketId)}
      {ket && <small className="isian-ket" id={ketId}>{ket}</small>}
    </div>
  );
}

/**
 * Satu input teks/angka/tanggal.
 * @param {string} [awalan] satuan di kiri, mis. "Rp"
 * @param {string} [akhiran] satuan di kanan, mis. "%" atau "menit"
 */
export function Isian({ label, ket, opsional, lebar, awalan, akhiran, ...props }) {
  const id = useId();
  return (
    <Bingkai id={id} label={label} ket={ket} opsional={opsional} lebar={lebar} anak={(ketId) => (
      <div className={`isian-kotak${awalan ? " ada-awalan" : ""}${akhiran ? " ada-akhiran" : ""}`}>
        {awalan && <span className="isian-afiks" aria-hidden="true">{awalan}</span>}
        <input id={id} aria-describedby={ketId} {...props} />
        {akhiran && <span className="isian-afiks kanan" aria-hidden="true">{akhiran}</span>}
      </div>
    )} />
  );
}

/** Area teks panjang (uraian kegiatan). */
export function IsianArea({ label, ket, opsional, lebar = 2, ...props }) {
  const id = useId();
  return (
    <Bingkai id={id} label={label} ket={ket} opsional={opsional} lebar={lebar} anak={(ketId) => (
      <textarea id={id} aria-describedby={ketId} className="isian-area" {...props} />
    )} />
  );
}

/** Pemilih berkas bergaya area jatuhkan — tetap memakai <input type="file"> asli. */
export function IsianBerkas({ label, ket, lebar = 2, ...props }) {
  const id = useId();
  return (
    <Bingkai id={id} label={label} ket={ket} lebar={lebar} anak={(ketId) => (
      <div className="isian-berkas">
        <Paperclip className="lucide" aria-hidden="true" />
        <input id={id} type="file" aria-describedby={ketId} {...props} />
      </div>
    )} />
  );
}

/** Kelompok isian bertema, dengan judul yang ikut terbaca pembaca layar. */
export function GrupIsian({ judul, ket, children }) {
  return (
    <fieldset className="isian-grup">
      <legend className="isian-grup-judul">
        {judul}
        {ket && <span className="isian-grup-ket">{ket}</span>}
      </legend>
      <div className="isian-grid">{children}</div>
    </fieldset>
  );
}
