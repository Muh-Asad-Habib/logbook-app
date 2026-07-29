"use client";

import { useEffect } from "react";
import { preload, isPendamping } from "@/lib/api";

/** Muat data SEMUA halaman di latar begitu aplikasi dibuka,
 *  supaya pindah menu (Kegiatan, Keuangan, Galeri, dll.) terasa instan.
 *  Pendamping (fasilitator/dosen): cukup daftar tim + hitungan komentar
 *  (data tim dimuat per tim aktif oleh masing-masing halaman). */
export default function Prefetch() {
  useEffect(() => {
    // Beri jeda singkat agar data halaman aktif dimuat lebih dulu
    const t = setTimeout(() => {
      const paths = isPendamping()
        ? ["/api/fasilitator/tim", "/api/komentar/belum-dibaca"]
        : ["/api/statistik", "/api/kegiatan", "/api/keuangan", "/api/export/info",
           "/api/laporan/info", "/api/tunnel", "/api/komentar/belum-dibaca"];
      paths.forEach(preload);
    }, 250);
    return () => clearTimeout(t);
  }, []);
  return null;
}

