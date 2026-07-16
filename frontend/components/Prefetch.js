"use client";

import { useEffect } from "react";
import { preload } from "@/lib/api";

/** Muat data SEMUA halaman di latar begitu aplikasi dibuka,
 *  supaya pindah menu (Kegiatan, Keuangan, Galeri, dll.) terasa instan. */
export default function Prefetch() {
  useEffect(() => {
    // Beri jeda singkat agar data halaman aktif dimuat lebih dulu
    const t = setTimeout(() => {
      ["/api/statistik", "/api/kegiatan", "/api/keuangan", "/api/export/info",
       "/api/laporan/info", "/api/tunnel"]
        .forEach(preload);
    }, 250);
    return () => clearTimeout(t);
  }, []);
  return null;
}

