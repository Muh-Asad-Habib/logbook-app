"use client";

/**
 * Lightbox foto — pengganti "buka di tab baru":
 * - klik luar / tombol X / Esc → tutup
 * - panah kiri-kanan / tombol ← → → pindah foto
 * - HP: swipe kiri/kanan untuk pindah, swipe cepat juga dideteksi
 *
 * Pakai: const [lb, setLb] = useState(null);
 *   setLb({ items: [{src, judul, ket}], index: 0 })
 *   {lb && <Lightbox {...lb} onClose={() => setLb(null)} />}
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { X, ChevronLeft, ChevronRight, Download } from "lucide-react";
import { retryFoto } from "@/lib/foto";

export default function Lightbox({ items, index = 0, onClose }) {
  const [i, setI] = useState(index);
  const touch = useRef(null);
  const boxRef = useRef(null);
  const n = items.length;
  const it = items[Math.max(0, Math.min(i, n - 1))];

  const prev = useCallback(() => setI((v) => (v - 1 + n) % n), [n]);
  const next = useCallback(() => setI((v) => (v + 1) % n), [n]);

  // Keyboard: Esc tutup, panah pindah, D unduh, Tab terkunci di dialog (focus-trap)
  useEffect(() => {
    const pemicu = document.activeElement; // fokus dikembalikan ke sini saat tutup
    // Pindahkan fokus ke dialog (tombol tutup) begitu terbuka
    boxRef.current?.querySelector("button")?.focus();
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft" && n > 1) prev();
      else if (e.key === "ArrowRight" && n > 1) next();
      else if (e.key === "d" || e.key === "D") {
        boxRef.current?.querySelector(".lb-dl")?.click(); // unduh foto aktif
      } else if (e.key === "Tab") {
        // Focus-trap: Tab berputar di antara tombol & tautan lightbox saja
        const fokusable = boxRef.current?.querySelectorAll("button, a[href]");
        if (!fokusable?.length) return;
        const daftar = [...fokusable].filter((el) => el.getClientRects().length > 0 && !el.disabled);
        if (!daftar.length) return;
        const idx = daftar.indexOf(document.activeElement);
        e.preventDefault();
        const arah = e.shiftKey ? -1 : 1;
        daftar[(idx + arah + daftar.length) % daftar.length].focus();
      }
    };
    document.addEventListener("keydown", onKey);
    // Kunci scroll halaman selama lightbox terbuka
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = oldOverflow;
      if (pemicu instanceof HTMLElement) pemicu.focus(); // kembalikan fokus
    };
  }, [onClose, prev, next, n]);

  // Swipe di HP
  const onTouchStart = (e) => {
    touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now() };
  };
  const onTouchEnd = (e) => {
    if (!touch.current || n < 2) return;
    const dx = e.changedTouches[0].clientX - touch.current.x;
    const dy = e.changedTouches[0].clientY - touch.current.y;
    const dt = Date.now() - touch.current.t;
    touch.current = null;
    // Geser horizontal cukup jauh & tidak terlalu vertikal
    if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.4 && dt < 600) {
      dx > 0 ? prev() : next();
    }
  };

  if (!it) return null;

  return (
    <div
      ref={boxRef}
      className="lb"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      role="dialog"
      aria-modal="true"
      aria-label="Pratinjau foto"
    >
      {n > 1 && <span className="lb-count">{i + 1} / {n}</span>}
      {/* Unduh foto aktif sebagai JPG — server yang mengonversi & menamai */}
      <a
        className="lb-btn lb-dl"
        href={`${it.src}${it.src.includes("?") ? "&" : "?"}dl=1`}
        download
        aria-label="Unduh foto (JPG)"
        title="Unduh foto (JPG) — tombol D"
      >
        <Download className="lucide" />
      </a>
      <button type="button" className="lb-btn lb-close" onClick={onClose} aria-label="Tutup">
        <X className="lucide" />
      </button>
      {n > 1 && (
        <button type="button" className="lb-btn lb-prev" onClick={prev} aria-label="Sebelumnya">
          <ChevronLeft className="lucide" />
        </button>
      )}
      <img key={it.src} src={it.src} alt={it.judul || "foto"} onError={retryFoto} />
      {n > 1 && (
        <button type="button" className="lb-btn lb-next" onClick={next} aria-label="Berikutnya">
          <ChevronRight className="lucide" />
        </button>
      )}
      {(it.judul || it.ket) && (
        <div className="lb-cap">
          {it.judul && <b>{it.judul}</b>}
          {it.ket}
        </div>
      )}
    </div>
  );
}

