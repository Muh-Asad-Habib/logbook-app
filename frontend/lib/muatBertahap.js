"use client";

import { useEffect, useMemo, useState } from "react";

/** Jumlah entri per "halaman" yang dirender. */
export const LANGKAH_MUAT = 100;

/**
 * Paginasi RINGAN di sisi klien — tanpa mengubah API.
 *
 * Data tetap diambil utuh (dan tetap di-cache), tetapi yang DIRENDER hanya
 * `LANGKAH_MUAT` entri pertama; sisanya muncul saat tombol "Muat lagi"
 * ditekan. Ini menjaga halaman Kegiatan/Keuangan tetap ringan saat entri
 * sudah ribuan (tiap entri membawa beberapa <img>), sementara statistik,
 * filter, dan ekspor tetap menghitung SELURUH data.
 *
 * Batas otomatis kembali ke awal bila daftar sumbernya berubah (filter/urutan),
 * supaya pengguna tidak "terjebak" di tengah daftar yang isinya lain.
 *
 * @template T
 * @param {T[]} daftar  daftar lengkap yang sudah difilter & diurutkan
 * @returns {{ tampil: T[], sisa: number, lebihBanyak: () => void, semua: () => void }}
 */
export function useMuatBertahap(daftar) {
  const [batas, setBatas] = useState(LANGKAH_MUAT);
  // Tanda tangan ringan daftar: panjang + id pertama & terakhir — cukup untuk
  // mendeteksi perubahan filter/urutan tanpa membandingkan seluruh isi.
  const tanda = `${daftar.length}|${daftar[0]?.id ?? ""}|${daftar[daftar.length - 1]?.id ?? ""}`;
  useEffect(() => { setBatas(LANGKAH_MUAT); }, [tanda]);

  const tampil = useMemo(() => daftar.slice(0, batas), [daftar, batas]);
  const sisa = Math.max(0, daftar.length - tampil.length);
  return {
    tampil,
    sisa,
    lebihBanyak: () => setBatas((b) => b + LANGKAH_MUAT),
    semua: () => setBatas(daftar.length),
  };
}

/** Tombol "Muat lagi" — hanya tampil bila masih ada sisa. */
export function TombolMuatLagi({ sisa, lebihBanyak, semua, label = "entri" }) {
  if (!sisa) return null;
  return (
    <div className="muat-lagi" role="group" aria-label={`Masih ada ${sisa} ${label} lagi`}>
      <button type="button" className="btn" onClick={lebihBanyak}>
        Muat {Math.min(LANGKAH_MUAT, sisa)} {label} lagi
      </button>
      {sisa > LANGKAH_MUAT && (
        <button type="button" className="btn ghost" onClick={semua}>
          Tampilkan semua ({sisa})
        </button>
      )}
    </div>
  );
}

