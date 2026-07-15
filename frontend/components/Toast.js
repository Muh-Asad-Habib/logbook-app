"use client";

/**
 * Sistem notifikasi ringan tanpa library:
 * - toast.ok/err/info("pesan")  → muncul di pojok (desktop) / atas bottom-nav (HP)
 * - confirmDialog({judul, pesan}) → Promise<boolean> pengganti window.confirm
 *
 * Dipasang sekali di Shell: <ToastHost />
 */
import { useEffect, useRef, useState } from "react";
import { CheckCircle2, XCircle, Info, Trash2 } from "lucide-react";

let pushToast = null; // diisi oleh ToastHost saat mount
let askConfirm = null;

/** API global: bisa dipanggil dari mana saja (setelah ToastHost terpasang). */
export const toast = {
  ok: (msg) => pushToast?.({ jenis: "ok", msg }),
  err: (msg) => pushToast?.({ jenis: "err", msg }),
  info: (msg) => pushToast?.({ jenis: "info", msg }),
};

/** Dialog konfirmasi custom — resolve true bila pengguna menekan tombol merah. */
export function confirmDialog(opts) {
  if (!askConfirm) return Promise.resolve(window.confirm(opts?.pesan || "Yakin?"));
  return askConfirm(opts);
}

let idSeq = 0;

export default function ToastHost() {
  const [items, setItems] = useState([]); // {id, jenis, msg, out}
  const [confirm, setConfirm] = useState(null); // {judul, pesan, tombol, resolve}
  const dlgRef = useRef(null);

  useEffect(() => {
    pushToast = ({ jenis, msg }) => {
      const id = ++idSeq;
      setItems((old) => [...old.slice(-3), { id, jenis, msg }]);
      // keluar otomatis: tandai .out dulu (animasi), lalu hapus
      setTimeout(() => setItems((old) => old.map((t) => (t.id === id ? { ...t, out: true } : t))), 3400);
      setTimeout(() => setItems((old) => old.filter((t) => t.id !== id)), 3700);
    };
    askConfirm = (opts) =>
      new Promise((resolve) => {
        setConfirm({ judul: "Hapus entri?", tombol: "Hapus", ...opts, resolve });
      });
    return () => {
      pushToast = null;
      askConfirm = null;
    };
  }, []);

  useEffect(() => {
    if (confirm && dlgRef.current && !dlgRef.current.open) dlgRef.current.showModal();
  }, [confirm]);

  const jawab = (ya) => {
    confirm?.resolve(ya);
    dlgRef.current?.close();
    setConfirm(null);
  };

  const IC = { ok: CheckCircle2, err: XCircle, info: Info };

  return (
    <>
      <div className="toasts" role="status" aria-live="polite">
        {items.map((t) => {
          const Ic = IC[t.jenis] || Info;
          return (
            <div key={t.id} className={`toast ${t.jenis} ${t.out ? "out" : ""}`}>
              <Ic className="lucide" />
              <span>{t.msg}</span>
            </div>
          );
        })}
      </div>

      {confirm && (
        <dialog ref={dlgRef} onClose={() => jawab(false)} style={{ maxWidth: 400 }}>
          <div className="confirm-body">
            <div className="confirm-ic"><Trash2 className="lucide" /></div>
            <h3>{confirm.judul}</h3>
            <p>{confirm.pesan}</p>
            <div className="confirm-actions">
              <button type="button" className="btn" onClick={() => jawab(false)}>Batal</button>
              <button type="button" className="btn danger" onClick={() => jawab(true)}>
                {confirm.tombol}
              </button>
            </div>
          </div>
        </dialog>
      )}
    </>
  );
}

