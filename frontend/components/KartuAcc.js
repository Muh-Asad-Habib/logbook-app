"use client";

/**
 * Kartu rekap ACC dosen pendamping.
 *
 * - Tim       : <KartuAcc />               → rekap logbook sendiri
 * - Pendamping: <KartuAcc timId=… data=… /> → rekap tim yang sedang dilihat
 *   (`data` opsional: dipakai bila rekap sudah ikut di respons /ringkasan,
 *    sehingga tidak perlu request tambahan)
 *
 * Menampilkan berapa entri yang sudah di-ACC, diminta revisi, dan masih
 * menunggu untuk kegiatan, belanja, dan laporan. Bila ada yang perlu revisi,
 * kartu memberi peringatan agar tim segera memperbaiki.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { BadgeCheck, RotateCcw, Clock } from "lucide-react";
import { api } from "@/lib/api";

const JENIS = [
  { id: "kegiatan", label: "Kegiatan", href: "/kegiatan" },
  { id: "keuangan", label: "Belanja", href: "/keuangan" },
  { id: "laporan", label: "Laporan", href: "/laporan" },
];

function Baris({ jenis, data }) {
  const b = data || { total: 0, disetujui: 0, revisi: 0, menunggu: 0 };
  if (!b.total) {
    return (
      <div className="row spread" style={{ marginTop: 8, fontSize: ".84rem" }}>
        <Link href={jenis.href}>{jenis.label}</Link>
        <span className="muted">belum ada entri</span>
      </div>
    );
  }
  return (
    <div className="row spread" style={{ marginTop: 8, fontSize: ".84rem", gap: 6 }}>
      <Link href={jenis.href}>{jenis.label}</Link>
      <span className="row" style={{ gap: 4, marginTop: 0, flexWrap: "wrap" }}>
        {b.disetujui > 0 && <span className="badge ok">✔ {b.disetujui}</span>}
        {b.revisi > 0 && <span className="badge danger">↺ {b.revisi}</span>}
        {b.menunggu > 0 && <span className="badge warn">⏳ {b.menunggu}</span>}
        <span className="muted" style={{ fontSize: ".72rem" }}>dari {b.total}</span>
      </span>
    </div>
  );
}

export default function KartuAcc({ timId, data }) {
  const [rekap, setRekap] = useState(data || null);

  useEffect(() => {
    if (data) { setRekap(data); return; }
    let hidup = true;
    api.persetujuan.ringkas(timId || undefined)
      .then((r) => { if (hidup) setRekap(r); })
      .catch(() => {});
    return () => { hidup = false; };
  }, [timId, data]);

  if (!rekap) return null;
  const adaRevisi = (rekap.total_revisi || 0) > 0;

  return (
    <div className="card">
      <h3>
        {adaRevisi ? <RotateCcw className="lucide" /> : <BadgeCheck className="lucide" />}{" "}
        Pengesahan dosen (ACC)
      </h3>
      <p className="sub">
        {adaRevisi
          ? `${rekap.total_revisi} entri diminta revisi — perbaiki lalu dosen meninjau ulang`
          : `${rekap.total_disetujui || 0} entri sudah disetujui dosen pendamping`}
      </p>
      {JENIS.map((j) => <Baris key={j.id} jenis={j} data={rekap[j.id]} />)}
      <p className="muted" style={{ fontSize: ".72rem", marginTop: 10 }}>
        <Clock className="lucide" style={{ width: 12, height: 12 }} /> Entri yang diubah
        otomatis kembali berstatus <b>menunggu ACC</b>.
      </p>
    </div>
  );
}


