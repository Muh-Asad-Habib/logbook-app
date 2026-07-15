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
import { X, ChevronLeft, ChevronRight } from "lucide-react";

export default function Lightbox({ items, index = 0, onClose }) {
  const [i, setI] = useState(index);
  const touch = useRef(null);
  const n = items.length;
  const it = items[Math.max(0, Math.min(i, n - 1))];

  const prev = useCallback(() => setI((v) => (v - 1 + n) % n), [n]);
  const next = useCallback(() => setI((v) => (v + 1) % n), [n]);

  // Keyboard: Esc tutup, panah pindah
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft" && n > 1) prev();
      else if (e.key === "ArrowRight" && n > 1) next();
    };
    document.addEventListener("keydown", onKey);
    // Kunci scroll halaman selama lightbox terbuka
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = oldOverflow;
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
      className="lb"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      role="dialog"
      aria-modal="true"
      aria-label="Pratinjau foto"
    >
      {n > 1 && <span className="lb-count">{i + 1} / {n}</span>}
      <button type="button" className="lb-btn lb-close" onClick={onClose} aria-label="Tutup">
        <X className="lucide" />
      </button>
      {n > 1 && (
        <button type="button" className="lb-btn lb-prev" onClick={prev} aria-label="Sebelumnya">
          <ChevronLeft className="lucide" />
        </button>
      )}
      <img key={it.src} src={it.src} alt={it.judul || "foto"} />
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

